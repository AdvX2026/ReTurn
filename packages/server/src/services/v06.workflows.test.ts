import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  insertCard,
  insertMessage,
  insertNode,
  listCards,
  listMessages,
  listTasks,
} from "../db/repo.js";
import { type Db, openMemoryDb } from "../db/schema.js";
import { handleChat, parseTriageJson, triageHeuristic } from "./chat.js";
import { handleResume } from "./resume.js";
import { saveToday } from "./save.js";
import { TimelineRangeError, buildTimeline } from "./timeline.js";

describe("triage", () => {
  it("offline heuristic classifies idea / retrieval / question", () => {
    assert.equal(triageHeuristic("灵感: 做一个时间轴").intent, "idea");
    assert.equal(triageHeuristic("搜一下 timeline").intent, "retrieval");
    assert.equal(triageHeuristic("我昨天下午在干什么？").intent, "question");
  });

  it("parseTriageJson accepts LLM payload and floors low confidence", () => {
    assert.equal(
      parseTriageJson('{"intent":"retrieval","confidence":0.9}').intent,
      "retrieval",
    );
    assert.equal(
      parseTriageJson('{"intent":"question","confidence":0.4}').intent,
      "unknown",
    );
    assert.equal(parseTriageJson('{"intent":"nope","confidence":1}').intent, "unknown");
  });
});

describe("v0.6 chat / cards / tasks / resume / timeline range", () => {
  let db: Db;
  beforeEach(() => {
    db = openMemoryDb();
  });

  it("chat idea creates idea node + future card + messages", async () => {
    const r = await handleChat(db, { text: "灵感: 双向流主视图" });
    assert.equal(r.intent, "idea");
    assert.ok(r.message_id);
    const msgs = listMessages(db);
    assert.ok(msgs.messages.length >= 2);
    const cards = listCards(db, { direction: "future" });
    assert.ok(cards.cards.some((c) => c.type === "idea"));
  });

  it("chat retrieval returns jump targets", async () => {
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      title: "timeline 设计",
      content: "Canvas 自绘 24h",
      date: "2026-07-23",
    });
    const r = await handleChat(db, { text: "搜索 timeline" });
    assert.equal(r.intent, "retrieval");
    assert.ok(r.jump == null || r.jump.date);
  });

  it("meeting notes become a done task", async () => {
    const notes = `会议纪要\n${"1. 讨论第二大脑\n2. 对齐 v0.6 API\n".repeat(30)}`;
    const r = await handleChat(db, { text: notes });
    assert.ok(r.task_id);
    const tasks = listTasks(db);
    assert.ok(tasks.some((t) => t.id === r.task_id && t.status === "done"));
  });

  it("resume writes an agent message", async () => {
    const r = await handleResume(db, { hours: 3 });
    assert.ok(r.message_id);
    assert.ok(r.reply.length > 0);
  });

  it("save produces briefing card and night cadence", async () => {
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "写了 chat API",
      date: "2026-07-24",
    });
    const save = await saveToday(db, {
      date: "2026-07-24",
      note_text: "继续对齐 PRD",
    });
    assert.equal(save.already_saved, false);
    assert.equal(save.cadence, "night");
    assert.ok((save.cards_created ?? 0) >= 1);
    const before = listCards(db, { direction: "before" });
    assert.ok(before.cards.some((c) => c.type === "briefing"));
  });

  it("timeline accepts from/to range", () => {
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "day1",
      date: "2026-07-22",
    });
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "day2",
      date: "2026-07-23",
    });
    const tl = buildTimeline(db, { from: "2026-07-22", to: "2026-07-23" });
    assert.equal(tl.from, "2026-07-22");
    assert.equal(tl.to, "2026-07-23");
    assert.ok(tl.segments.length >= 2);
  });

  it("timeline rejects ranges over 31 days", () => {
    assert.throws(
      () => buildTimeline(db, { from: "2026-01-01", to: "2026-03-01" }),
      (err: unknown) => err instanceof TimelineRangeError && /31 days/.test(err.message),
    );
  });

  it("messages pagination keeps same-timestamp rows across pages", () => {
    const ts = "2026-07-24T12:00:00.000Z";
    // Insert three messages with identical created_at (chat user+agent pattern).
    for (const content of ["a", "b", "c"]) {
      insertMessage(db, {
        role: "agent",
        content,
        created_at: ts,
      });
    }
    const page1 = listMessages(db, { limit: 2 });
    assert.equal(page1.messages.length, 2);
    assert.ok(page1.next_cursor);
    const page2 = listMessages(db, { cursor: page1.next_cursor!, limit: 2 });
    assert.equal(page2.messages.length, 1);
    const allIds = new Set([
      ...page1.messages.map((m) => m.id),
      ...page2.messages.map((m) => m.id),
    ]);
    assert.equal(allIds.size, 3);
  });

  it("before cards cursor includes earlier date with later created_at", () => {
    // First: older date, inserted first (earlier created_at).
    insertCard(db, {
      type: "briefing",
      date: "2026-07-20",
      content: { summary: "old day" },
    });
    // Force a later created_at for the "newer day" card, then insert an even
    // later created_at card on an older date (backfill scenario).
    const recent = insertCard(db, {
      type: "briefing",
      date: "2026-07-24",
      content: { summary: "today" },
    });
    // Manually bump a backfill card: insert then rewrite created_at later than recent.
    const backfill = insertCard(db, {
      type: "briefing",
      date: "2026-07-21",
      content: { summary: "backfill" },
    });
    db.prepare(`UPDATE cards SET created_at = ? WHERE id = ?`).run(
      "2099-01-01T00:00:00.000Z",
      backfill.id,
    );
    void recent;

    const page1 = listCards(db, { direction: "before", limit: 1 });
    assert.equal(page1.cards.length, 1);
    // Newest sort key should be the backfill (date 07-21 with huge created_at)
    // or today — either way, page2 must still surface remaining cards.
    assert.ok(page1.next_cursor);
    const page2 = listCards(db, {
      direction: "before",
      cursor: page1.next_cursor!,
      limit: 10,
    });
    const ids = new Set([
      ...page1.cards.map((c) => c.id),
      ...page2.cards.map((c) => c.id),
    ]);
    assert.ok(ids.size >= 3, `expected ≥3 unique cards, got ${ids.size}`);
  });
});
