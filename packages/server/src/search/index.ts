/**
 * Search index maintenance: FTS5 projection of nodes + day summaries.
 * Index is derived data — nodes/days remain authoritative (PRD §5).
 */

import type { NodeKind, NodeRecord } from "@return/shared";
import type { DayRow } from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { toSearchText } from "./tokenize.js";

export const SEARCH_SCHEMA = `
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  doc_id UNINDEXED,
  kind UNINDEXED,
  day_date UNINDEXED,
  text
);

CREATE TABLE IF NOT EXISTS embed_queue (
  node_id      TEXT PRIMARY KEY,
  enqueued_at  TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS node_embeddings (
  node_id      TEXT PRIMARY KEY,
  model        TEXT NOT NULL,
  vector       BLOB NOT NULL,
  embedded_at  TEXT NOT NULL
);
`;

/** Kinds that enter the FTS index (all product kinds; samples low-ranked). */
const INDEXABLE_KINDS = new Set<string>([
  "text",
  "url",
  "voice",
  "save_note",
  "app_sample",
  "tab_sample",
  "agent_session",
  "git_commit",
  "todo_check",
  "snapshot",
  "health_daily",
  "idea",
  "image",
  "reminder",
]);

/** High-value kinds that get embeddings (Phase 2). Samples excluded. */
export const EMBEDDABLE_KINDS = new Set<string>([
  "text",
  "url",
  "voice",
  "save_note",
  "git_commit",
  "idea",
  "image",
  "reminder",
]);

export function nodeDocId(nodeId: string): string {
  return `node:${nodeId}`;
}

export function dayDocId(date: string): string {
  return `day:${date}`;
}

export function isIndexableKind(kind: string): boolean {
  return INDEXABLE_KINDS.has(kind);
}

export function isEmbeddableKind(kind: string): boolean {
  return EMBEDDABLE_KINDS.has(kind);
}

/** High-value text from source_meta for tab/agent/git. */
export function extractMetaText(
  kind: string,
  sourceMeta: Record<string, unknown> | null | undefined,
): string {
  if (!sourceMeta) return "";
  const parts: string[] = [];
  if (kind === "tab_sample") {
    if (typeof sourceMeta.title === "string") parts.push(sourceMeta.title);
    if (typeof sourceMeta.url === "string") parts.push(sourceMeta.url);
  } else if (kind === "agent_session") {
    if (typeof sourceMeta.project === "string") parts.push(sourceMeta.project);
    if (typeof sourceMeta.provider === "string") parts.push(sourceMeta.provider);
  } else if (kind === "git_commit") {
    if (typeof sourceMeta.repo === "string") parts.push(sourceMeta.repo);
    if (typeof sourceMeta.subject === "string") parts.push(sourceMeta.subject);
    // Some collectors put subject in title; meta.sha is noise for search.
  } else if (kind === "app_sample") {
    if (typeof sourceMeta.app === "string") parts.push(sourceMeta.app);
  }
  if (Array.isArray(sourceMeta.tags)) {
    for (const t of sourceMeta.tags) {
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.filter(Boolean).join(" ");
}

export function buildNodeIndexText(node: {
  kind: string;
  title?: string | null;
  content?: string | null;
  source_meta?: Record<string, unknown> | null;
}): string {
  const meta = extractMetaText(node.kind, node.source_meta ?? null);
  return [node.title, node.content, meta].filter(Boolean).join("\n");
}

export function buildDayIndexText(day: {
  summary?: string | null;
  opening_line?: string | null;
  review_points_json?: string | null;
}): string {
  const parts: string[] = [];
  if (day.summary) parts.push(day.summary);
  if (day.opening_line) parts.push(day.opening_line);
  if (day.review_points_json) {
    try {
      const pts = JSON.parse(day.review_points_json) as Array<{ text?: string }>;
      for (const p of pts) {
        if (p?.text) parts.push(p.text);
      }
    } catch {
      /* ignore */
    }
  }
  return parts.join("\n");
}

export function upsertNodeFts(
  db: Db,
  node: {
    id: string;
    kind: string;
    date: string;
    title?: string | null;
    content?: string | null;
    source_meta?: Record<string, unknown> | null;
  },
): void {
  if (!isIndexableKind(node.kind)) return;
  const original = buildNodeIndexText(node);
  const text = toSearchText(original);
  const docId = nodeDocId(node.id);
  // Delete-then-insert: FTS5 external-content free table, simplest consistency.
  db.prepare(`DELETE FROM search_fts WHERE doc_id = ?`).run(docId);
  if (!text.trim()) return;
  db.prepare(
    `INSERT INTO search_fts (doc_id, kind, day_date, text) VALUES (?, ?, ?, ?)`,
  ).run(docId, node.kind, node.date, text);
}

export function deleteNodeFts(db: Db, nodeId: string): void {
  db.prepare(`DELETE FROM search_fts WHERE doc_id = ?`).run(nodeDocId(nodeId));
  db.prepare(`DELETE FROM embed_queue WHERE node_id = ?`).run(nodeId);
  db.prepare(`DELETE FROM node_embeddings WHERE node_id = ?`).run(nodeId);
}

export function upsertDayFts(db: Db, day: DayRow): void {
  const original = buildDayIndexText(day);
  const text = toSearchText(original);
  const docId = dayDocId(day.date);
  db.prepare(`DELETE FROM search_fts WHERE doc_id = ?`).run(docId);
  if (!text.trim() || !day.summary) return;
  db.prepare(
    `INSERT INTO search_fts (doc_id, kind, day_date, text) VALUES (?, ?, ?, ?)`,
  ).run(docId, "day_summary", day.date, text);
}

export function enqueueEmbed(db: Db, nodeId: string, enqueuedAt: string): void {
  db.prepare(
    `INSERT INTO embed_queue (node_id, enqueued_at, attempts) VALUES (?, ?, 0)
     ON CONFLICT(node_id) DO UPDATE SET enqueued_at = excluded.enqueued_at`,
  ).run(nodeId, enqueuedAt);
}

/**
 * Full rebuild from nodes + days. Safe to call anytime — index is derived.
 * Returns counts for logging.
 */
export function rebuildSearchIndex(db: Db): { nodes: number; days: number } {
  db.exec(`DELETE FROM search_fts`);

  const nodeRows = db
    .prepare(
      `SELECT n.id, n.kind, n.title, n.content, n.source_meta, d.date AS date
       FROM nodes n JOIN days d ON d.id = n.day_id`,
    )
    .all() as Array<{
    id: string;
    kind: string;
    title: string | null;
    content: string | null;
    source_meta: string | null;
    date: string;
  }>;

  let nodes = 0;
  for (const r of nodeRows) {
    let meta: Record<string, unknown> | null = null;
    if (r.source_meta) {
      try {
        meta = JSON.parse(r.source_meta) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }
    upsertNodeFts(db, {
      id: r.id,
      kind: r.kind,
      date: r.date,
      title: r.title,
      content: r.content,
      source_meta: meta,
    });
    nodes += 1;
  }

  const dayRows = db
    .prepare(`SELECT * FROM days WHERE summary IS NOT NULL AND summary != ''`)
    .all() as DayRow[];
  let days = 0;
  for (const d of dayRows) {
    upsertDayFts(db, d);
    days += 1;
  }

  return { nodes, days };
}

/**
 * If FTS row count drifts from source tables, rebuild and warn.
 * Called at server start.
 */
export function ensureSearchIndex(db: Db): void {
  // Ensure tables exist (openDb already runs SEARCH_SCHEMA; belt-and-suspenders).
  db.exec(SEARCH_SCHEMA);

  const ftsCount = (
    db.prepare(`SELECT COUNT(*) AS n FROM search_fts`).get() as { n: number }
  ).n;
  const nodeCount = (db.prepare(`SELECT COUNT(*) AS n FROM nodes`).get() as { n: number })
    .n;
  const dayCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS n FROM days WHERE summary IS NOT NULL AND summary != ''`,
      )
      .get() as { n: number }
  ).n;

  // FTS has nodes (indexable) + day docs; rough drift check via total sources.
  // Exact equality is hard (non-indexable kinds, empty text). Rebuild when empty
  // but sources exist, or fts is wildly smaller.
  const sourceApprox = nodeCount + dayCount;
  const drifted =
    (sourceApprox > 0 && ftsCount === 0) ||
    (sourceApprox > 20 && ftsCount < Math.floor(sourceApprox * 0.3));

  if (drifted) {
    console.warn(
      `[search] index drift (fts=${ftsCount}, nodes=${nodeCount}, days=${dayCount}) — rebuilding`,
    );
    const r = rebuildSearchIndex(db);
    console.warn(`[search] rebuilt: ${r.nodes} nodes, ${r.days} days`);
  }
}

/** Original (non-bigram) body used for snippets / embed / ask context. */
export function originalTextForDoc(
  db: Db,
  docId: string,
): {
  kind: string;
  date: string;
  title: string | null;
  text: string;
  nodeId: string | null;
} | null {
  if (docId.startsWith("node:")) {
    const id = docId.slice("node:".length);
    const row = db
      .prepare(
        `SELECT n.id, n.kind, n.title, n.content, n.source_meta, d.date AS date
         FROM nodes n JOIN days d ON d.id = n.day_id WHERE n.id = ?`,
      )
      .get(id) as
      | {
          id: string;
          kind: string;
          title: string | null;
          content: string | null;
          source_meta: string | null;
          date: string;
        }
      | undefined;
    if (!row) return null;
    let meta: Record<string, unknown> | null = null;
    if (row.source_meta) {
      try {
        meta = JSON.parse(row.source_meta) as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }
    return {
      kind: row.kind,
      date: row.date,
      title: row.title,
      text: buildNodeIndexText({
        kind: row.kind,
        title: row.title,
        content: row.content,
        source_meta: meta,
      }),
      nodeId: row.id,
    };
  }
  if (docId.startsWith("day:")) {
    const date = docId.slice("day:".length);
    const row = db.prepare(`SELECT * FROM days WHERE date = ?`).get(date) as
      | DayRow
      | undefined;
    if (!row) return null;
    return {
      kind: "day_summary",
      date: row.date,
      title: row.opening_line ?? `Day ${row.date}`,
      text: buildDayIndexText(row),
      nodeId: null,
    };
  }
  return null;
}

export type { NodeKind, NodeRecord };
