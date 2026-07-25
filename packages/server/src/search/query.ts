/**
 * Hybrid search: FTS5 keyword + embedding semantic, RRF fusion.
 */

import type { DaySummary, NodeRecord, SearchHit, SearchResponse } from "@return/shared";
import { config, isEmbeddingConfigured } from "../config.js";
import { type DayRow, dayStats, getDayByDate, getNodeById } from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { todayDate } from "../util/time.js";
import { embedQuery, semanticTopK } from "./embed.js";
import { originalTextForDoc } from "./index.js";
import { daysBetween, finalScore } from "./ranking.js";
import { extractSnippet } from "./snippet.js";
import { parseSearchQuery } from "./tokenize.js";

const CHANNEL_TOP = 50;

export interface SearchOptions {
  q: string;
  from?: string;
  to?: string;
  kinds?: string[];
  limit?: number;
  now?: Date;
}

interface RankedDoc {
  doc_id: string;
  kind: string;
  day_date: string;
  keywordRank: number | null;
  semanticRank: number | null;
  score: number;
}

export async function search(db: Db, opts: SearchOptions): Promise<SearchResponse> {
  const started = Date.now();
  const limit = Math.min(Math.max(opts.limit ?? 20, 1), 50);
  const now = opts.now ?? new Date();
  const today = todayDate(now);

  const parsed = parseSearchQuery(opts.q, {
    from: opts.from,
    to: opts.to,
    now,
  });

  const kindsFilter = opts.kinds && opts.kinds.length > 0 ? new Set(opts.kinds) : null;

  // ── keyword channel ─────────────────────────────────────
  const keywordRanks = new Map<string, number>(); // doc_id → 1-based rank
  const meta = new Map<string, { kind: string; day_date: string }>();

  if (parsed.matchQuery) {
    const rows = keywordSearch(db, {
      matchQuery: parsed.matchQuery,
      from: parsed.from,
      to: parsed.to,
      kinds: kindsFilter,
      limit: CHANNEL_TOP,
    });
    rows.forEach((r, i) => {
      keywordRanks.set(r.doc_id, i + 1);
      meta.set(r.doc_id, { kind: r.kind, day_date: r.day_date });
    });
  } else if (parsed.from || parsed.to || kindsFilter) {
    // Time/kind-only query: list recent docs in range (no MATCH).
    const rows = listDocs(db, {
      from: parsed.from,
      to: parsed.to,
      kinds: kindsFilter,
      limit: CHANNEL_TOP,
    });
    rows.forEach((r, i) => {
      keywordRanks.set(r.doc_id, i + 1);
      meta.set(r.doc_id, { kind: r.kind, day_date: r.day_date });
    });
  }

  // ── semantic channel ────────────────────────────────────
  const semanticRanks = new Map<string, number>();
  // Semantic channel is off without EMBEDDING_* — keyword channel still answers.
  if (parsed.text.trim().length > 0 && isEmbeddingConfigured()) {
    const qVec = await embedQuery(db, parsed.text);
    let hits = semanticTopK(db, qVec, CHANNEL_TOP, config.embedding.model);
    // Apply date/kind filters post-hoc (embeddings table has no date column).
    hits = hits.filter((h) => {
      const info = resolveMeta(db, h.doc_id, meta);
      if (!info) return false;
      if (parsed.from && info.day_date < parsed.from) return false;
      if (parsed.to && info.day_date > parsed.to) return false;
      if (kindsFilter && !kindsFilter.has(info.kind)) return false;
      meta.set(h.doc_id, info);
      return true;
    });
    hits.forEach((h, i) => {
      semanticRanks.set(h.doc_id, i + 1);
    });
  }

  // ── fuse ────────────────────────────────────────────────
  const allIds = new Set([...keywordRanks.keys(), ...semanticRanks.keys()]);
  const ranked: RankedDoc[] = [];
  for (const docId of allIds) {
    const info = meta.get(docId) ?? resolveMeta(db, docId, meta);
    if (!info) continue;
    if (kindsFilter && !kindsFilter.has(info.kind)) continue;
    if (parsed.from && info.day_date < parsed.from) continue;
    if (parsed.to && info.day_date > parsed.to) continue;

    const daysAgo = Math.max(0, daysBetween(today, info.day_date));
    const score = finalScore({
      keywordRank: keywordRanks.get(docId) ?? null,
      semanticRank: semanticRanks.get(docId) ?? null,
      daysAgo,
      kind: info.kind,
    });
    ranked.push({
      doc_id: docId,
      kind: info.kind,
      day_date: info.day_date,
      keywordRank: keywordRanks.get(docId) ?? null,
      semanticRank: semanticRanks.get(docId) ?? null,
      score,
    });
  }

  ranked.sort((a, b) => b.score - a.score || b.day_date.localeCompare(a.day_date));
  const top = ranked.slice(0, limit);

  const results: SearchHit[] = top.map((r) => {
    const orig = originalTextForDoc(db, r.doc_id);
    const snippet = extractSnippet(orig?.text ?? "", parsed.text || opts.q);
    let node: NodeRecord | null = null;
    let day: DaySummary | null = null;

    if (r.doc_id.startsWith("node:")) {
      node = getNodeById(db, r.doc_id.slice(5)) ?? null;
    } else if (r.doc_id.startsWith("day:")) {
      const row = getDayByDate(db, r.day_date);
      if (row) day = toDaySummary(row);
    }

    return {
      doc_id: r.doc_id,
      kind: r.kind,
      score: r.score,
      snippet,
      node,
      day,
    };
  });

  return {
    query: opts.q,
    took_ms: Date.now() - started,
    results,
  };
}

function keywordSearch(
  db: Db,
  opts: {
    matchQuery: string;
    from: string | null;
    to: string | null;
    kinds: Set<string> | null;
    limit: number;
  },
): Array<{ doc_id: string; kind: string; day_date: string }> {
  const clauses: string[] = ["search_fts MATCH ?"];
  const params: unknown[] = [opts.matchQuery];

  if (opts.from) {
    clauses.push("day_date >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    clauses.push("day_date <= ?");
    params.push(opts.to);
  }
  if (opts.kinds) {
    const ks = [...opts.kinds];
    clauses.push(`kind IN (${ks.map(() => "?").join(",")})`);
    params.push(...ks);
  }

  params.push(opts.limit);
  // bm25: lower is better in SQLite FTS5
  const sql = `
    SELECT doc_id, kind, day_date
    FROM search_fts
    WHERE ${clauses.join(" AND ")}
    ORDER BY bm25(search_fts)
    LIMIT ?
  `;
  return db.prepare(sql).all(...params) as Array<{
    doc_id: string;
    kind: string;
    day_date: string;
  }>;
}

function listDocs(
  db: Db,
  opts: {
    from: string | null;
    to: string | null;
    kinds: Set<string> | null;
    limit: number;
  },
): Array<{ doc_id: string; kind: string; day_date: string }> {
  const clauses: string[] = ["1=1"];
  const params: unknown[] = [];
  if (opts.from) {
    clauses.push("day_date >= ?");
    params.push(opts.from);
  }
  if (opts.to) {
    clauses.push("day_date <= ?");
    params.push(opts.to);
  }
  if (opts.kinds) {
    const ks = [...opts.kinds];
    clauses.push(`kind IN (${ks.map(() => "?").join(",")})`);
    params.push(...ks);
  }
  params.push(opts.limit);
  return db
    .prepare(
      `SELECT doc_id, kind, day_date FROM search_fts
       WHERE ${clauses.join(" AND ")}
       ORDER BY day_date DESC
       LIMIT ?`,
    )
    .all(...params) as Array<{
    doc_id: string;
    kind: string;
    day_date: string;
  }>;
}

function resolveMeta(
  db: Db,
  docId: string,
  cache: Map<string, { kind: string; day_date: string }>,
): { kind: string; day_date: string } | null {
  const hit = cache.get(docId);
  if (hit) return hit;
  const orig = originalTextForDoc(db, docId);
  if (!orig) return null;
  const info = { kind: orig.kind, day_date: orig.date };
  cache.set(docId, info);
  return info;
}

function toDaySummary(row: DayRow): DaySummary {
  return {
    date: row.date,
    saved_at: row.saved_at,
    summary: row.summary,
    stats: dayStats(row),
    character_state: (row.character_state as DaySummary["character_state"]) ?? null,
  };
}
