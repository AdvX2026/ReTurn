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
  id                    TEXT PRIMARY KEY,
  day_id                TEXT NOT NULL REFERENCES days(id),
  text                  TEXT NOT NULL,
  done                  INTEGER NOT NULL DEFAULT 0,
  status                TEXT NOT NULL DEFAULT 'suggested',
  source_node_id        TEXT REFERENCES nodes(id),
  accepted_reminder_id  TEXT,
  accepted_at           TEXT,
  dismissed_at          TEXT
);

CREATE INDEX IF NOT EXISTS idx_todos_day ON todos(day_id);

CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  role            TEXT NOT NULL,
  content         TEXT NOT NULL,
  intent          TEXT,
  task_id         TEXT,
  meta_json       TEXT,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);

CREATE TABLE IF NOT EXISTS tasks (
  id                  TEXT PRIMARY KEY,
  type                TEXT NOT NULL,
  status              TEXT NOT NULL,
  input_json          TEXT NOT NULL,
  result_message_id   TEXT,
  created_at          TEXT NOT NULL,
  finished_at         TEXT
);

CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_created ON tasks(created_at);

CREATE TABLE IF NOT EXISTS cards (
  id              TEXT PRIMARY KEY,
  type            TEXT NOT NULL,
  date            TEXT NOT NULL,
  content_json    TEXT NOT NULL,
  created_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cards_date ON cards(date);
CREATE INDEX IF NOT EXISTS idx_cards_type_date ON cards(type, date);
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

/** Add columns introduced after initial SCHEMA for existing DBs. */
function migrate(db: Db): void {
  const cols = (
    db.prepare(`PRAGMA table_info(todos)`).all() as Array<{ name: string }>
  ).map((c) => c.name);
  const add = (name: string, ddl: string) => {
    if (!cols.includes(name)) db.exec(`ALTER TABLE todos ADD COLUMN ${ddl}`);
  };
  add("status", "status TEXT NOT NULL DEFAULT 'suggested'");
  add("accepted_reminder_id", "accepted_reminder_id TEXT");
  add("accepted_at", "accepted_at TEXT");
  add("dismissed_at", "dismissed_at TEXT");
  // Backfill: legacy done=1 rows count as accepted.
  db.exec(
    `UPDATE todos SET status = 'accepted', accepted_at = COALESCE(accepted_at, datetime('now'))
     WHERE done = 1 AND (status IS NULL OR status = 'suggested')`,
  );
  db.exec(`CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status)`);
}

export function openDb(dataDir: string, filename = "return.db"): Db {
  mkdirSync(dataDir, { recursive: true });
  const path = join(dataDir, filename);
  const raw = new DatabaseSync(path);
  const db = new Db(raw);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  db.exec(SEARCH_SCHEMA);
  return db;
}

export function openMemoryDb(): Db {
  const raw = new DatabaseSync(":memory:");
  const db = new Db(raw);
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  migrate(db);
  db.exec(SEARCH_SCHEMA);
  return db;
}
