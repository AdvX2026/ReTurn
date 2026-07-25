import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, it } from "node:test";
import type { Stats } from "@return/shared";
import {
  acceptTodo,
  applyInferredProfession,
  countCrossDayEdges,
  currentCadence,
  deleteNode,
  dismissTodo,
  ensureDay,
  expireSuggestedTodos,
  getDayByDate,
  getNodeById,
  getTodo,
  getUserProfile,
  insertEdge,
  insertNode,
  insertNodes,
  insertTodo,
  listNodesByDate,
  listTodosByDay,
  listTodosByStatus,
  markDaySaved,
  patchUserProfile,
  reminderCompletionRate,
  setTodoDone,
  upsertDevice,
  upsertNodeContent,
} from "./repo.js";
import { type Db, openDb, openMemoryDb } from "./schema.js";

describe("repo", () => {
  let db: Db;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("client_uuid is idempotent", () => {
    const uuid = crypto.randomUUID();
    const a = insertNode(db, {
      client_uuid: uuid,
      kind: "text",
      content: "hello",
      date: "2026-07-24",
    });
    const b = insertNode(db, {
      client_uuid: uuid,
      kind: "text",
      content: "hello again",
      date: "2026-07-24",
    });
    assert.equal(a.duplicate, false);
    assert.equal(b.duplicate, true);
    assert.equal(a.node.id, b.node.id);
    assert.equal(listNodesByDate(db, "2026-07-24").length, 1);
  });

  it("upsertNodeContent inserts then refreshes payload", () => {
    const uuid = crypto.randomUUID();
    const first = upsertNodeContent(db, {
      client_uuid: uuid,
      kind: "health_daily",
      title: "Health 2026-07-24",
      content: JSON.stringify({ sleep_minutes: 300, steps: 1000 }),
      date: "2026-07-24",
      source_meta: { sleep_minutes: 300, steps: 1000, source: "shortcuts" },
    });
    const second = upsertNodeContent(db, {
      client_uuid: uuid,
      kind: "health_daily",
      title: "Health 2026-07-24",
      content: JSON.stringify({ sleep_minutes: 420, steps: 8000 }),
      date: "2026-07-24",
      source_meta: { sleep_minutes: 420, steps: 8000, source: "shortcuts" },
    });
    assert.equal(first.id, second.id);
    assert.equal(listNodesByDate(db, "2026-07-24").length, 1);
    assert.equal(second.content, JSON.stringify({ sleep_minutes: 420, steps: 8000 }));
    assert.deepEqual(second.source_meta, {
      sleep_minutes: 420,
      steps: 8000,
      source: "shortcuts",
    });
  });

  it("batch insert reports duplicates", () => {
    const u1 = crypto.randomUUID();
    const u2 = crypto.randomUUID();
    insertNode(db, { client_uuid: u1, kind: "text", content: "a", date: "2026-07-24" });
    const r = insertNodes(db, [
      { client_uuid: u1, kind: "text", content: "a", date: "2026-07-24" },
      { client_uuid: u2, kind: "url", content: "https://x", date: "2026-07-24" },
    ]);
    assert.equal(r.created.length, 1);
    assert.deepEqual(r.duplicates, [u1]);
  });

  it("ensureDay is unique per date", () => {
    const a = ensureDay(db, "2026-07-24");
    const b = ensureDay(db, "2026-07-24");
    assert.equal(a.id, b.id);
  });

  it("markDaySaved freezes stats", () => {
    const day = ensureDay(db, "2026-07-24");
    const stats: Stats = {
      intake: 40,
      focus: 50,
      output: 60,
      continuity: 10,
      energy: 80,
    };
    markDaySaved(db, day.id, {
      saved_at: new Date().toISOString(),
      save_note_node_id: null,
      summary: "ok",
      opening_line: "hi",
      review_points: [{ text: "did stuff", kind: "win" }],
      stats,
      character_state: "normal",
    });
    const got = getDayByDate(db, "2026-07-24")!;
    assert.ok(got.saved_at);
    assert.equal(got.summary, "ok");
    assert.equal(got.character_state, "normal");
    assert.deepEqual(JSON.parse(got.stats_json!), stats);
  });

  it("todo check updates accepted state", () => {
    const day = ensureDay(db, "2026-07-24");
    const t1 = insertTodo(db, { day_id: day.id, text: "A" });
    insertTodo(db, { day_id: day.id, text: "B" });
    setTodoDone(db, t1.id, true);
    assert.equal(listTodosByDay(db, day.id).filter((t) => t.done).length, 1);
    assert.equal(t1.status, "suggested");
    assert.equal(getTodo(db, t1.id)!.status, "accepted");
  });

  it("keeps night cadence until 06:00 after a saved day", () => {
    const day = ensureDay(db, "2026-07-24");
    markDaySaved(db, day.id, {
      saved_at: "2026-07-24T21:00:00.000Z",
      save_note_node_id: null,
      summary: "saved",
      opening_line: "morning",
      review_points: [],
      stats: { intake: 0, focus: 0, output: 0, continuity: 0, energy: 100 },
      character_state: "normal",
    });
    assert.equal(currentCadence(db, "2026-07-25", new Date(2026, 6, 25, 5, 59)), "night");
    assert.equal(currentCadence(db, "2026-07-25", new Date(2026, 6, 25, 6, 0)), "active");
  });

  it("accept / dismiss preference samples", () => {
    const day = ensureDay(db, "2026-07-24");
    const t1 = insertTodo(db, { day_id: day.id, text: "Ship loop" });
    const t2 = insertTodo(db, { day_id: day.id, text: "Buy milk" });
    const accepted = acceptTodo(db, t1.id, "rem-1")!;
    assert.equal(accepted.status, "accepted");
    assert.equal(accepted.accepted_reminder_id, "rem-1");
    assert.ok(accepted.accepted_at);
    const dismissed = dismissTodo(db, t2.id)!;
    assert.equal(dismissed.status, "dismissed");
    assert.ok(dismissed.dismissed_at);
    assert.equal(listTodosByStatus(db, "accepted").length, 1);
    assert.equal(listTodosByStatus(db, "dismissed").length, 1);
  });

  it("user profile auto profession tracks inference; manual locks", () => {
    let profile = getUserProfile(db);
    assert.equal(profile.profession, "generalist");
    assert.equal(profile.profession_mode, "auto");

    profile = applyInferredProfession(db, "coder");
    assert.equal(profile.profession, "coder");
    assert.equal(profile.last_inferred_profession, "coder");
    assert.equal(profile.profession_mode, "auto");

    profile = patchUserProfile(db, { profession: "designer" });
    assert.equal(profile.profession, "designer");
    assert.equal(profile.profession_mode, "manual");
    assert.equal(profile.last_inferred_profession, "coder");

    profile = applyInferredProfession(db, "writer");
    assert.equal(profile.profession, "designer"); // locked
    assert.equal(profile.last_inferred_profession, "writer");

    profile = patchUserProfile(db, { profession_mode: "auto" });
    assert.equal(profile.profession_mode, "auto");
    assert.equal(profile.profession, "writer"); // snaps to last inferred

    profile = patchUserProfile(db, {
      display_name: "  Teethe  ",
      note: "prefer deep work todos",
    });
    assert.equal(profile.display_name, "Teethe");
    assert.equal(profile.note, "prefer deep work todos");

    const day = ensureDay(db, "2026-07-24");
    const t = insertTodo(db, { day_id: day.id, text: "Ship profile" });
    acceptTodo(db, t.id, "rem-x");
    profile = getUserProfile(db);
    assert.deepEqual(profile.accepted_todos, ["Ship profile"]);
  });

  it("expireSuggestedTodos auto-dismisses past suggested", () => {
    const oldDay = ensureDay(db, "2026-07-20");
    const today = ensureDay(db, "2026-07-24");
    insertTodo(db, { day_id: oldDay.id, text: "stale" });
    insertTodo(db, { day_id: today.id, text: "fresh" });
    const n = expireSuggestedTodos(db, "2026-07-24");
    assert.equal(n, 1);
    assert.equal(listTodosByStatus(db, "dismissed")[0]!.text, "stale");
    assert.equal(listTodosByDay(db, today.id)[0]!.status, "suggested");
  });

  it("reminderCompletionRate prefers completed snapshot", () => {
    ensureDay(db, "2026-07-24");
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "reminder",
      title: "Ship",
      date: "2026-07-24",
      source_meta: { reminder_id: "r1", completed: false },
    });
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "reminder",
      title: "Ship",
      date: "2026-07-24",
      source_meta: { reminder_id: "r1", completed: true },
    });
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "reminder",
      title: "Open item",
      date: "2026-07-24",
      source_meta: { reminder_id: "r2", completed: false },
    });
    const rate = reminderCompletionRate(db, "2026-07-24");
    assert.equal(rate.total, 2);
    assert.equal(rate.done, 1);
    assert.equal(rate.rate, 0.5);
    assert.deepEqual(rate.openTitles, ["Open item"]);
  });

  it("cross-day edge count", () => {
    const d1 = ensureDay(db, "2026-07-23");
    const d2 = ensureDay(db, "2026-07-24");
    const n1 = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "old",
      date: "2026-07-23",
    }).node;
    const n2 = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "new",
      date: "2026-07-24",
    }).node;
    insertEdge(db, {
      src_node_id: n2.id,
      dst_node_id: n1.id,
      relation: "continues",
      created_by_day_id: d2.id,
    });
    // same-day edge should not count
    const n3 = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "also",
      date: "2026-07-24",
    }).node;
    insertEdge(db, {
      src_node_id: n2.id,
      dst_node_id: n3.id,
      relation: "related",
      created_by_day_id: d2.id,
    });
    assert.equal(countCrossDayEdges(db, d2.id), 1);
    void d1;
  });

  it("delete node", () => {
    const n = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "bye",
      date: "2026-07-24",
    }).node;
    assert.equal(deleteNode(db, n.id), true);
    assert.equal(deleteNode(db, n.id), false);
  });

  it("delete node with edges does not 500", () => {
    const a = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "a",
      date: "2026-07-24",
    }).node;
    const b = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "b",
      date: "2026-07-24",
    }).node;
    const day = ensureDay(db, "2026-07-24");
    insertEdge(db, {
      src_node_id: a.id,
      dst_node_id: b.id,
      relation: "related",
      created_by_day_id: day.id,
    });
    assert.equal(deleteNode(db, a.id), true);
    assert.equal(getNodeById(db, a.id), undefined);
    assert.ok(getNodeById(db, b.id));
  });

  it("openDb migrates legacy todos missing status column", () => {
    // Pre-loop DBs have todos without status. SCHEMA must not create
    // idx_todos_status before migrate ALTERs the column in (Codex P1).
    const dir = mkdtempSync(join(tmpdir(), "return-mig-"));
    try {
      const raw = new DatabaseSync(join(dir, "return.db"));
      raw.exec(`
        PRAGMA foreign_keys = ON;
        CREATE TABLE days (
          id TEXT PRIMARY KEY, date TEXT NOT NULL UNIQUE,
          saved_at TEXT, save_note_node_id TEXT, summary TEXT,
          opening_line TEXT, review_points_json TEXT, stats_json TEXT,
          character_state TEXT
        );
        CREATE TABLE devices (
          id TEXT PRIMARY KEY, name TEXT NOT NULL,
          platform TEXT NOT NULL DEFAULT 'unknown', last_seen_at TEXT NOT NULL
        );
        CREATE TABLE nodes (
          id TEXT PRIMARY KEY, day_id TEXT NOT NULL REFERENCES days(id),
          device_id TEXT, kind TEXT NOT NULL, title TEXT, content TEXT,
          source_meta TEXT, client_uuid TEXT NOT NULL, created_at TEXT NOT NULL,
          UNIQUE(client_uuid)
        );
        CREATE TABLE todos (
          id TEXT PRIMARY KEY, day_id TEXT NOT NULL REFERENCES days(id),
          text TEXT NOT NULL, done INTEGER NOT NULL DEFAULT 0,
          source_node_id TEXT
        );
        CREATE INDEX idx_todos_day ON todos(day_id);
      `);
      raw.close();

      const upgraded = openDb(dir);
      const day = ensureDay(upgraded, "2026-07-24");
      const t = insertTodo(upgraded, { day_id: day.id, text: "migrated" });
      assert.equal(t.status, "suggested");
      const idx = upgraded
        .prepare(
          `SELECT name FROM sqlite_master WHERE type='index' AND name='idx_todos_status'`,
        )
        .get() as { name: string } | undefined;
      assert.equal(idx?.name, "idx_todos_status");
      upgraded.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("device upsert reuses id", () => {
    const a = upsertDevice(db, { name: "Mac", platform: "macos" });
    const b = upsertDevice(db, {
      id: a.id,
      name: "MacBook",
      platform: "macos",
    });
    assert.equal(a.id, b.id);
    assert.equal(b.name, "MacBook");
  });
});
