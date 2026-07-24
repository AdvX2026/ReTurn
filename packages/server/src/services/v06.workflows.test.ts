import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { insertNode, listCards, listMessages, listTasks } from "../db/repo.js";
import { type Db, openMemoryDb } from "../db/schema.js";
import { handleChat, triageHeuristic } from "./chat.js";
import { handleResume } from "./resume.js";
import { saveToday } from "./save.js";
import { buildTimeline } from "./timeline.js";

describe("triageHeuristic", () => {
  it("classifies idea / retrieval / question", () => {
    assert.equal(triageHeuristic("灵感: 做一个时间轴").intent, "idea");
    assert.equal(triageHeuristic("搜一下 timeline").intent, "retrieval");
    assert.equal(triageHeuristic("我昨天下午在干什么？").intent, "question");
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
});
