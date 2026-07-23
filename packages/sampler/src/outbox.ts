/**
 * Main outbox (PRD §5.2) — sampler process owns this SQLite queue.
 * Sample / agent nodes land here first, then flush FIFO to Pi.
 * Server dedupes on client_uuid.
 */
import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { NodeInput } from "@return/shared";
import { config } from "./config.js";

export interface OutboxRow {
  id: string;
  enqueued_at: string;
  payload_json: string;
  attempts: number;
  last_error: string | null;
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

  enqueue(nodes: NodeInput[]): string {
    if (nodes.length === 0) return "";
    const id = crypto.randomUUID();
    this.db
      .prepare(
        `INSERT INTO outbox (id, enqueued_at, payload_json, attempts, last_error)
         VALUES (?, ?, ?, 0, NULL)`,
      )
      .run(id, new Date().toISOString(), JSON.stringify(nodes));
    return id;
  }

  peekAll(): OutboxRow[] {
    return this.db
      .prepare(`SELECT * FROM outbox ORDER BY enqueued_at ASC`)
      .all() as unknown as OutboxRow[];
  }

  remove(id: string): void {
    this.db.prepare(`DELETE FROM outbox WHERE id = ?`).run(id);
  }

  fail(id: string, err: string): void {
    this.db
      .prepare(
        `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
      )
      .run(err, id);
  }

  close(): void {
    this.db.close();
  }
}
