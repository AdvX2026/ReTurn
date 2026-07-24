import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { SEARCH_SCHEMA } from "../search/index.js";

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS devices (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  platform      TEXT NOT NULL DEFAULT 'unknown',
  last_seen_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS days (
  id                  TEXT PRIMARY KEY,
  date                TEXT NOT NULL UNIQUE,
  saved_at            TEXT,
  save_note_node_id   TEXT,
  summary             TEXT,
  opening_line        TEXT,
  review_points_json  TEXT,
  stats_json          TEXT,
  character_state     TEXT
);

CREATE TABLE IF NOT EXISTS nodes (
  id            TEXT PRIMARY KEY,
  day_id        TEXT NOT NULL REFERENCES days(id),
  device_id     TEXT REFERENCES devices(id),
  kind          TEXT NOT NULL,
  title         TEXT,
  content       TEXT,
  source_meta   TEXT,
  client_uuid   TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  UNIQUE(client_uuid)
);

CREATE INDEX IF NOT EXISTS idx_nodes_day ON nodes(day_id);
CREATE INDEX IF NOT EXISTS idx_nodes_kind ON nodes(kind);
CREATE INDEX IF NOT EXISTS idx_nodes_created ON nodes(created_at);

CREATE TABLE IF NOT EXISTS edges (
  id                  TEXT PRIMARY KEY,
  src_node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  dst_node_id         TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  relation            TEXT NOT NULL,
  created_by_day_id   TEXT NOT NULL REFERENCES days(id)
);

CREATE INDEX IF NOT EXISTS idx_edges_src ON edges(src_node_id);
CREATE INDEX IF NOT EXISTS idx_edges_dst ON edges(dst_node_id);

CREATE TABLE IF NOT EXISTS todos (
  id              TEXT PRIMARY KEY,
  day_id          TEXT NOT NULL REFERENCES days(id),
  text            TEXT NOT NULL,
  done            INTEGER NOT NULL DEFAULT 0,
  source_node_id  TEXT REFERENCES nodes(id)
);

CREATE INDEX IF NOT EXISTS idx_todos_day ON todos(day_id);
`;

/**
 * Thin wrapper over node:sqlite DatabaseSync.
 * API mirrors better-sqlite3 enough for this codebase:
 *   prepare().get/all/run, exec, transaction(fn), close, pragma.
 *
 * Why node:sqlite over better-sqlite3 (PRD): zero native compile on
 * Windows/arm64, ships with Node ≥ 22.5. Same SQLite engine.
 */
export class Db {
  readonly raw: DatabaseSync;

  constructor(raw: DatabaseSync) {
    this.raw = raw;
  }

  exec(sql: string): void {
    this.raw.exec(sql);
  }

  prepare(sql: string) {
    const stmt = this.raw.prepare(sql);
    return {
      get: (...params: unknown[]) => stmt.get(...(params as never[])) as unknown,
      all: (...params: unknown[]) => stmt.all(...(params as never[])) as unknown[],
      run: (...params: unknown[]) => {
        const r = stmt.run(...(params as never[]));
        return {
          changes: Number(r.changes ?? 0),
          lastInsertRowid: r.lastInsertRowid,
        };
      },
    };
  }

  /** better-sqlite3-compatible: db.transaction(fn)() */
  transaction<T>(fn: () => T): () => T {
    return () => {
      this.raw.exec("BEGIN");
      try {
        const result = fn();
        this.raw.exec("COMMIT");
        return result;
      } catch (err) {
        this.raw.exec("ROLLBACK");
        throw err;
      }
    };
  }

  pragma(source: string): void {
    this.raw.exec(`PRAGMA ${source}`);
  }

  close(): void {
    this.raw.close();
  }
}

export function openDb(dataDir: string, filename = "return.db"): Db {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, filename);
  const raw = new DatabaseSync(path);
  const db = new Db(raw);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  db.exec(SEARCH_SCHEMA);
  return db;
}

export function openMemoryDb(): Db {
  const raw = new DatabaseSync(":memory:");
  const db = new Db(raw);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  db.exec(SEARCH_SCHEMA);
  return db;
}
