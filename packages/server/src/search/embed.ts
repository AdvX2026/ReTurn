/**
 * Embedding channel: queue, drain, cosine top-k (global-search PRD §7.2).
 * No vector DB — Float32 BLOB + brute-force cosine.
 */

import { NotConfiguredError, config, isEmbeddingConfigured } from "../config.js";
import type { Db } from "../db/schema.js";
import { nowIso } from "../util/time.js";
import {
  EMBEDDABLE_KINDS,
  buildDayIndexText,
  buildNodeIndexText,
  isEmbeddableKind,
} from "./index.js";

const BATCH_SIZE = 32;

export interface EmbeddingRow {
  node_id: string;
  model: string;
  vector: Float32Array;
  embedded_at: string;
}

/** Serialize Float32Array little-endian into a Buffer for SQLite BLOB. */
export function encodeVector(v: Float32Array): Buffer {
  return Buffer.from(v.buffer, v.byteOffset, v.byteLength);
}

export function decodeVector(blob: Buffer | Uint8Array): Float32Array {
  const buf = Buffer.isBuffer(blob) ? blob : Buffer.from(blob);
  // Ensure alignment: copy into a new ArrayBuffer if needed.
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  if (ab.byteLength % 4 !== 0) {
    throw new Error(`embedding blob length ${ab.byteLength} not multiple of 4`);
  }
  return new Float32Array(ab);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  if (!isEmbeddingConfigured()) {
    throw new NotConfiguredError("Embedding", "set EMBEDDING_BASE_URL/API_KEY/MODEL");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.embedding.timeoutMs);
  try {
    const res = await fetch(`${config.embedding.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.embedding.apiKey}`,
      },
      body: JSON.stringify({
        model: config.embedding.model,
        input: texts,
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`embedding HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      data?: Array<{ embedding?: number[]; index?: number }>;
    };
    const items = data.data ?? [];
    // Provider may return out of order — sort by index when present.
    items.sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
    if (items.length !== texts.length) {
      throw new Error(
        `embedding count mismatch: got ${items.length}, want ${texts.length}`,
      );
    }
    return items.map((it) => {
      const emb = it.embedding;
      if (!emb || emb.length === 0) throw new Error("empty embedding vector");
      return Float32Array.from(emb);
    });
  } finally {
    clearTimeout(timer);
  }
}

export function textForEmbedding(db: Db, nodeId: string): string | null {
  // Day summary synthetic ids are not in embed_queue; only real nodes.
  const row = db
    .prepare(
      `SELECT n.kind, n.title, n.content, n.source_meta, d.summary, d.opening_line, d.review_points_json, d.date
       FROM nodes n JOIN days d ON d.id = n.day_id WHERE n.id = ?`,
    )
    .get(nodeId) as
    | {
        kind: string;
        title: string | null;
        content: string | null;
        source_meta: string | null;
        summary: string | null;
        opening_line: string | null;
        review_points_json: string | null;
        date: string;
      }
    | undefined;
  if (!row) return null;
  if (!isEmbeddableKind(row.kind)) return null;
  const meta = row.source_meta
    ? (JSON.parse(row.source_meta) as Record<string, unknown>)
    : null;
  const text = buildNodeIndexText({
    kind: row.kind,
    title: row.title,
    content: row.content,
    source_meta: meta,
  }).trim();
  return text || null;
}

/** Also embed day summaries under synthetic node_id `day:<date>`. */
export function enqueueDayEmbed(db: Db, date: string, enqueuedAt: string): void {
  const id = `day:${date}`;
  db.prepare(
    `INSERT INTO embed_queue (node_id, enqueued_at, attempts) VALUES (?, ?, 0)
     ON CONFLICT(node_id) DO UPDATE SET enqueued_at = excluded.enqueued_at`,
  ).run(id, enqueuedAt);
}

export function textForDayEmbedding(db: Db, date: string): string | null {
  const row = db.prepare(`SELECT * FROM days WHERE date = ?`).get(date) as
    | {
        summary: string | null;
        opening_line: string | null;
        review_points_json: string | null;
      }
    | undefined;
  if (!row) return null;
  const text = buildDayIndexText(row).trim();
  return text || null;
}

export async function drainEmbedQueue(db: Db): Promise<number> {
  // Queue is durable — leave it untouched until the channel is configured.
  if (!isEmbeddingConfigured()) return 0;
  const pending = db
    .prepare(
      `SELECT node_id, attempts FROM embed_queue
       ORDER BY enqueued_at ASC
       LIMIT ?`,
    )
    .all(BATCH_SIZE) as Array<{ node_id: string; attempts: number }>;

  if (pending.length === 0) return 0;

  const prepared: Array<{ id: string; text: string; attempts: number }> = [];
  for (const p of pending) {
    let text: string | null = null;
    if (p.node_id.startsWith("day:")) {
      text = textForDayEmbedding(db, p.node_id.slice(4));
    } else {
      text = textForEmbedding(db, p.node_id);
    }
    if (!text) {
      db.prepare(`DELETE FROM embed_queue WHERE node_id = ?`).run(p.node_id);
      continue;
    }
    prepared.push({ id: p.node_id, text, attempts: p.attempts });
  }

  if (prepared.length === 0) return 0;

  const vectors = await embedTexts(prepared.map((p) => p.text));

  const model = config.embedding.model;
  const at = nowIso();
  let processed = 0;
  db.transaction(() => {
    for (let i = 0; i < prepared.length; i++) {
      const p = prepared[i]!;
      const v = vectors[i]!;
      db.prepare(
        `INSERT INTO node_embeddings (node_id, model, vector, embedded_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(node_id) DO UPDATE SET
           model = excluded.model,
           vector = excluded.vector,
           embedded_at = excluded.embedded_at`,
      ).run(p.id, model, encodeVector(v), at);
      db.prepare(`DELETE FROM embed_queue WHERE node_id = ?`).run(p.id);
      processed += 1;
    }
  })();

  return processed;
}

/**
 * On model change, re-queue rows whose stored model differs.
 * Also re-queue embeddable nodes missing from node_embeddings.
 */
export function requeueStaleEmbeddings(db: Db): number {
  const model = config.embedding.model;
  const at = nowIso();
  let n = 0;

  const stale = db
    .prepare(`SELECT node_id FROM node_embeddings WHERE model != ?`)
    .all(model) as Array<{ node_id: string }>;
  for (const s of stale) {
    db.prepare(
      `INSERT INTO embed_queue (node_id, enqueued_at, attempts) VALUES (?, ?, 0)
       ON CONFLICT(node_id) DO UPDATE SET enqueued_at = excluded.enqueued_at, attempts = 0`,
    ).run(s.node_id, at);
    n += 1;
  }

  // Missing embeddings for embeddable node kinds.
  const missing = db
    .prepare(
      `SELECT n.id AS id, n.kind AS kind
       FROM nodes n
       LEFT JOIN node_embeddings e ON e.node_id = n.id
       WHERE e.node_id IS NULL`,
    )
    .all() as Array<{ id: string; kind: string }>;
  for (const m of missing) {
    if (!EMBEDDABLE_KINDS.has(m.kind)) continue;
    db.prepare(
      `INSERT INTO embed_queue (node_id, enqueued_at, attempts) VALUES (?, ?, 0)
       ON CONFLICT(node_id) DO NOTHING`,
    ).run(m.id, at);
    n += 1;
  }

  // Day summaries
  const days = db
    .prepare(`SELECT date FROM days WHERE summary IS NOT NULL AND summary != ''`)
    .all() as Array<{ date: string }>;
  for (const d of days) {
    const id = `day:${d.date}`;
    const has = db
      .prepare(`SELECT 1 AS ok FROM node_embeddings WHERE node_id = ?`)
      .get(id) as { ok: number } | undefined;
    if (has) continue;
    db.prepare(
      `INSERT INTO embed_queue (node_id, enqueued_at, attempts) VALUES (?, ?, 0)
       ON CONFLICT(node_id) DO NOTHING`,
    ).run(id, at);
    n += 1;
  }

  return n;
}

export interface SemanticHit {
  doc_id: string;
  score: number;
}

/** Brute-force cosine over all embeddings for `model`. Returns top-k by score. */
export function semanticTopK(
  db: Db,
  queryVec: Float32Array,
  k: number,
  model: string,
): SemanticHit[] {
  const rows = db
    .prepare(`SELECT node_id, vector FROM node_embeddings WHERE model = ?`)
    .all(model) as Array<{ node_id: string; vector: Buffer }>;

  const scored: SemanticHit[] = [];
  for (const r of rows) {
    const v = decodeVector(r.vector);
    const score = cosineSimilarity(queryVec, v);
    // Days stored as day:DATE; nodes as bare uuid.
    const normalized = r.node_id.startsWith("day:")
      ? r.node_id
      : r.node_id.startsWith("node:")
        ? r.node_id
        : `node:${r.node_id}`;
    scored.push({ doc_id: normalized, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

// Query embedding cache (60s) — PRD §7.2
let queryCache: { key: string; vec: Float32Array; at: number } | null = null;
const QUERY_CACHE_MS = 60_000;

export async function embedQuery(text: string): Promise<Float32Array> {
  const key = `${config.embedding.model}::${text}`;
  const now = Date.now();
  if (queryCache && queryCache.key === key && now - queryCache.at < QUERY_CACHE_MS) {
    return queryCache.vec;
  }
  const [vec] = await embedTexts([text]);
  if (!vec) throw new Error("empty query embedding");
  queryCache = { key, vec, at: now };
  return vec;
}

export function clearQueryEmbedCache(): void {
  queryCache = null;
}

/** Test helper: write a vector directly. */
export function putEmbedding(
  db: Db,
  nodeId: string,
  vector: Float32Array,
  model = "test-model",
): void {
  db.prepare(
    `INSERT INTO node_embeddings (node_id, model, vector, embedded_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(node_id) DO UPDATE SET
       model = excluded.model,
       vector = excluded.vector,
       embedded_at = excluded.embedded_at`,
  ).run(nodeId, model, encodeVector(vector), nowIso());
}
