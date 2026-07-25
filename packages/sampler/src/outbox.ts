import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
/**
 * Main outbox (PRD §5.2) — sampler process owns this SQLite queue.
 * Sample / agent nodes land here first, then flush FIFO to Pi.
 * Server dedupes on client_uuid.
 *
 * CreateNodesRequest caps nodes at 500 — enqueue/post always chunk to
 * that limit so a fat sample tick cannot permanently block FIFO flush.
 */
import { DatabaseSync } from "node:sqlite";
import type { NodeInput } from "@return/shared";
import { config } from "./config.js";

/** Must match CreateNodesRequest nodes max in @return/shared. */
export const MAX_NODES_PER_BATCH = 500;

export interface OutboxRow {
  id: string;
  enqueued_at: string;
  payload_json: string;
  attempts: number;
  last_error: string | null;
}

/** Split `nodes` into contiguous chunks of at most `size` (default API max). */
export function chunkNodes(
  nodes: NodeInput[],
  size: number = MAX_NODES_PER_BATCH,
): NodeInput[][] {
  if (nodes.length === 0) return [];
  if (size <= 0) throw new Error(`chunkNodes size must be > 0, got ${size}`);
  if (nodes.length <= size) return [nodes];
  const out: NodeInput[][] = [];
  for (let i = 0; i < nodes.length; i += size) {
    out.push(nodes.slice(i, i + size));
  }
  return out;
}

export class Outbox {
  private db: DatabaseSync;

  constructor(path = config.outboxPath) {
    mkdirSync(dirname(path), { recursive: true });
    this.db = new DatabaseSync(path);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS outbox (
        id            TEXT PRIMARY KEY,
        enqueued_at   TEXT NOT NULL,
        payload_json  TEXT NOT NULL,
        attempts      INTEGER NOT NULL DEFAULT 0,
        last_error    TEXT
      );
    `);
  }

  size(): number {
    const row = this.db.prepare(`SELECT COUNT(*) AS n FROM outbox`).get() as {
      n: number;
    };
    return Number(row.n);
  }

  /**
   * Enqueue nodes, split into ≤MAX_NODES_PER_BATCH rows so flush never POSTs
   * a body the server will Zod-reject as >500.
   * Returns the last row id (or "" when nothing enqueued).
   */
  enqueue(nodes: NodeInput[]): string {
    if (nodes.length === 0) return "";
    let lastId = "";
    const enqueuedAt = new Date().toISOString();
    const insert = this.db.prepare(
      `INSERT INTO outbox (id, enqueued_at, payload_json, attempts, last_error)
       VALUES (?, ?, ?, 0, NULL)`,
    );
    for (const batch of chunkNodes(nodes)) {
      lastId = crypto.randomUUID();
      insert.run(lastId, enqueuedAt, JSON.stringify(batch));
    }
    return lastId;
  }

  peekAll(): OutboxRow[] {
    // rowid preserves insert order when several chunks share enqueued_at.
    return this.db
      .prepare(`SELECT * FROM outbox ORDER BY enqueued_at ASC, rowid ASC`)
      .all() as unknown as OutboxRow[];
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM outbox WHERE id = ?`).run(id);
  }

  fail(id: string, err: string): void {
    this.db
      .prepare(`UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?`)
      .run(err, id);
  }

  close(): void {
    this.db.close();
  }
}
