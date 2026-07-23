import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { openMemoryDb, type Db } from "../db/schema.js";
import { insertNode, getDayByDate, listTodosByDay, ensureDay } from "../db/repo.js";
import { saveToday } from "./save.js";
import { addDays } from "../util/time.js";

describe("saveToday", () => {
  let db: Db;
  const date = "2026-07-24";

  beforeEach(() => {
    db = openMemoryDb();
    // No LLM key → ferment degrades (still seals the day).
    delete process.env.LLM_API_KEY;
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
    assert.equal(first.degraded, true); // no LLM key
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
});
