import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { Stats } from "@return/shared";
import {
  countCrossDayEdges,
  deleteNode,
  ensureDay,
  getDayByDate,
  getNodeById,
  insertEdge,
  insertNode,
  insertNodes,
  insertTodo,
  listNodesByDate,
  listTodosByDay,
  markDaySaved,
  setTodoDone,
  todoCompletionRate,
  upsertDevice,
} from "./repo.js";
import { type Db, openMemoryDb } from "./schema.js";

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

  it("todo check + completion rate", () => {
    const day = ensureDay(db, "2026-07-24");
    const t1 = insertTodo(db, { day_id: day.id, text: "A" });
    insertTodo(db, { day_id: day.id, text: "B" });
    setTodoDone(db, t1.id, true);
    const rate = todoCompletionRate(db, day.id);
    assert.equal(rate.total, 2);
    assert.equal(rate.done, 1);
    assert.equal(rate.rate, 0.5);
    assert.equal(listTodosByDay(db, day.id).filter((t) => t.done).length, 1);
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
