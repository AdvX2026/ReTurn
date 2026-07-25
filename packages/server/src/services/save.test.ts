import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { ensureDay, getDayByDate, insertNode, listTodosByDay } from "../db/repo.js";
import { type Db, openMemoryDb } from "../db/schema.js";
import { addDays } from "../util/time.js";
import { saveToday } from "./save.js";

describe("saveToday", () => {
  let db: Db;
  const date = "2026-07-24";

  beforeEach(() => {
    db = openMemoryDb();
  });

  it("seals day and is idempotent on second save", async () => {
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "an idea about the demo",
      date,
    });

    const first = await saveToday(db, {
      date,
      note_text: "明天把时间轴做完",
    });
    assert.equal(first.already_saved, false);
    assert.ok(first.summary);
    assert.ok(first.saved_at);
    assert.ok(first.stats);
    assert.ok(first.character_state);

    const day = getDayByDate(db, date)!;
    assert.ok(day.saved_at);
    assert.ok(day.stats_json);

    // todos for Future land on next day
    const next = ensureDay(db, addDays(date, 1));
    const todos = listTodosByDay(db, next.id);
    assert.ok(todos.length >= 1);
    assert.ok(todos.some((t) => t.text.includes("时间轴") || t.text.length > 0));

    const second = await saveToday(db, {
      date,
      note_text: "should be ignored",
    });
    assert.equal(second.already_saved, true);
    assert.equal(second.day_id, first.day_id);
    assert.equal(second.summary, first.summary);
  });

  it("works with empty day + no note", async () => {
    const r = await saveToday(db, { date: "2026-07-20" });
    assert.equal(r.already_saved, false);
    assert.ok(r.summary);
    assert.equal(r.streak >= 1, true);
  });

  it("keeps the day open and does not persist a save note when ferment fails", async () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("provider unavailable", { status: 503 });
    try {
      await assert.rejects(
        saveToday(db, { date: "2026-07-19", note_text: "do not partially save" }),
        /ferment failed after retry/,
      );
    } finally {
      globalThis.fetch = realFetch;
    }

    const day = getDayByDate(db, "2026-07-19")!;
    assert.equal(day.saved_at, null);
    assert.equal(day.save_note_node_id, null);
  });
});
