import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { parseMeetingNotesResult } from "../ai/meeting-notes.js";
import {
  dismissTodo,
  insertCard,
  insertMessage,
  insertNode,
  insertTask,
  insertTodo,
  listCards,
  listMessages,
  listNodesByDate,
  listTasks,
} from "../db/repo.js";
import { type Db, openMemoryDb } from "../db/schema.js";
import { todayDate } from "../util/time.js";
import { handleChat, parseTriageJson } from "./chat.js";
import { MeetingTaskRunner } from "./meeting-tasks.js";
import { handleResume } from "./resume.js";
import { saveToday } from "./save.js";
import { TimelineRangeError, buildTimeline } from "./timeline.js";

describe("triage", () => {
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

describe("meeting notes extraction", () => {
  it("validates structured LLM output", () => {
    const result = parseMeetingNotesResult(
      JSON.stringify({
        title: "ReTurn API 评审",
        summary: "团队确认了持久化 Task 管线。",
        decisions: ["SQLite 是 Task 权威数据源"],
        action_items: ["补充恢复测试"],
      }),
    );
    assert.equal(result.title, "ReTurn API 评审");
    assert.deepEqual(result.decisions, ["SQLite 是 Task 权威数据源"]);
  });

  it("rejects incomplete LLM output", () => {
    assert.throws(
      () => parseMeetingNotesResult('{"title":"缺少摘要"}'),
      /validation failed/,
    );
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

  it("future todo cards only return suggestions still actionable on the Pi", () => {
    const { node } = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "seed",
      date: todayDate(),
    });
    const keep = insertTodo(db, { day_id: node.day_id, text: "Keep" });
    const hide = insertTodo(db, { day_id: node.day_id, text: "Hide" });
    dismissTodo(db, hide.id);
    insertCard(db, {
      type: "todo_suggestion",
      date: todayDate(),
      content: { todos: ["Keep", "Hide"], todo_ids: [keep.id, hide.id] },
    });

    const card = listCards(db, { direction: "future" }).cards[0]!;
    assert.deepEqual(card.content.todos, ["Keep"]);
    assert.deepEqual(card.content.todo_ids, [keep.id]);
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

  it("keeps the idea node and reports the provider failure truthfully", async () => {
    const fetchBefore = globalThis.fetch;
    globalThis.fetch = async () => new Response("provider unavailable", { status: 503 });
    try {
      await assert.rejects(
        handleChat(db, { text: "灵感: 不应丢失用户输入", intent: "idea" }),
        /LLM HTTP 503/,
      );
    } finally {
      globalThis.fetch = fetchBefore;
    }
    const ideas = listNodesByDate(db, todayDate()).filter((node) => node.kind === "idea");
    assert.equal(ideas.length, 1);
    assert.equal(ideas[0]!.content, "不应丢失用户输入");
    const usage = db
      .prepare(
        `SELECT COUNT(*) AS count FROM llm_usage
         WHERE operation = 'idea_response' AND status = 'failed'`,
      )
      .get() as { count: number };
    assert.equal(usage.count, 1);
  });

  it("meeting notes stay running until async process completes", async () => {
    const notes = `会议纪要\n${"1. 讨论第二大脑\n2. 对齐 v0.6 API\n".repeat(30)}`;
    let markStarted!: () => void;
    let release!: () => void;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const runner = new MeetingTaskRunner(db, async () => {
      markStarted();
      await gate;
      return {
        title: "第二大脑 API 评审",
        summary: "团队完成了 API 方案评审。",
        decisions: ["使用 SQLite 持久化 Task"],
        action_items: ["补充恢复测试"],
      };
    });
    runner.start();

    try {
      const r = await handleChat(db, { text: notes }, runner);
      assert.ok(r.task_id);
      assert.match(r.reply, /正在整理/);
      assert.equal(
        listTasks(db).find((t) => t.id === r.task_id)?.status,
        "queued",
        "acceptance must commit before background processing starts",
      );

      await started;
      assert.equal(
        listTasks(db).find((t) => t.id === r.task_id)?.status,
        "running",
        "client must be able to observe in-progress work",
      );

      let closeSettled = false;
      const closing = runner.close().then(() => {
        closeSettled = true;
      });
      await Promise.resolve();
      assert.equal(closeSettled, false, "shutdown must wait for active processing");
      release();
      await closing;

      const done = listTasks(db).find((t) => t.id === r.task_id);
      assert.equal(done?.status, "done");
      assert.ok(done?.result_message_id);
      const node = listNodesByDate(db, todayDate()).find(
        (item) => item.client_uuid === r.task_id,
      );
      assert.ok(node);
      assert.equal(node.title, "第二大脑 API 评审");
      assert.match(node.content ?? "", /## 摘要/);
      assert.match(node.content ?? "", /使用 SQLite 持久化 Task/);
      assert.match(node.content ?? "", /## 原始纪要/);
      assert.equal(node.source_meta?.processed, true);
      assert.ok(
        listMessages(db).messages.some(
          (message) =>
            message.task_id === r.task_id && /已整理并入库/.test(message.content),
        ),
        "completion message should return to Now",
      );
    } finally {
      release();
      await runner.close();
    }
  });

  it("preserves raw notes and reports failure truthfully", async () => {
    const notes = "会议纪要\n决定下周完成 Swift 客户端。";
    const runner = new MeetingTaskRunner(db, async () => {
      throw new Error("provider unavailable");
    });
    runner.start();

    try {
      const r = await handleChat(db, { text: notes }, runner);
      await runner.waitForIdle();

      const task = listTasks(db).find((item) => item.id === r.task_id);
      assert.equal(task?.status, "failed");
      const node = listNodesByDate(db, todayDate()).find(
        (item) => item.client_uuid === r.task_id,
      );
      assert.equal(node?.content, notes);
      assert.equal(node?.source_meta?.processed, false);
      assert.ok(
        listMessages(db).messages.some(
          (message) =>
            message.task_id === r.task_id &&
            /原文已保存，但未标记为已整理/.test(message.content),
        ),
      );
    } finally {
      await runner.close();
    }
  });

  it("recovers interrupted tasks once without duplicating output", async () => {
    const notes = "会议纪要\n确认 Task runner 在启动时恢复。";
    const task = insertTask(db, {
      type: "meeting_notes",
      status: "running",
      input: { text: notes, date: "2026-07-24", device_id: null },
    });
    let calls = 0;
    const process = async () => {
      calls += 1;
      return {
        title: "Task runner 恢复",
        summary: "启动时恢复了中断的会议纪要。",
        decisions: [],
        action_items: [],
      };
    };
    const first = new MeetingTaskRunner(db, process);
    first.start();
    await first.waitForIdle();
    await first.close();

    const second = new MeetingTaskRunner(db, process);
    second.start();
    await second.waitForIdle();
    await second.close();

    assert.equal(calls, 1);
    assert.equal(listTasks(db).find((item) => item.id === task.id)?.status, "done");
    assert.equal(
      listNodesByDate(db, "2026-07-24").filter((item) => item.client_uuid === task.id)
        .length,
      1,
    );
  });

  it("resume writes an agent message", async () => {
    const r = await handleResume(db, { hours: 3 });
    assert.ok(r.message_id);
    assert.ok(r.reply.length > 0);
  });

  it("save produces briefing card and night cadence", async () => {
    // Pre-existing idea card must not inflate cards_created.
    insertCard(db, {
      type: "idea",
      date: "2026-07-24",
      content: { text: "old idea", provenance: "manual" },
    });
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
    // Mock ferment creates briefing + todo_suggestion; no health/ideas.
    assert.equal(save.cards_created, 2);
    const before = listCards(db, { direction: "before" });
    assert.ok(before.cards.some((c) => c.type === "briefing"));

    const replay = await saveToday(db, {
      date: "2026-07-24",
      note_text: "ignored on already_saved",
    });
    assert.equal(replay.already_saved, true);
    assert.equal(replay.cards_created, 0);
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

  it("timeline projects sampler context with thick meta", () => {
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "browse_history",
      title: "ReTurn PRD",
      content: "https://example.com/prd",
      source_meta: {
        url: "https://example.com/prd",
        title: "ReTurn PRD",
        browser: "safari",
        visited_at: "2026-07-24T10:15:00.000Z",
      },
      date: "2026-07-24",
    });
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "agent_session",
      title: "/Users/teethe/Developer/return",
      content: "claude return 42min",
      source_meta: {
        provider: "claude",
        project: "/Users/teethe/Developer/return",
        start: "2026-07-24T09:00:00.000Z",
        end: "2026-07-24T09:42:00.000Z",
        duration_min: 42,
        session_id: "sess-1",
        open: false,
      },
      date: "2026-07-24",
    });
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "app_sample",
      title: "Safari",
      content: "Safari",
      source_meta: {
        app: "Safari",
        bundle_id: "com.apple.Safari",
        sampled_at: "2026-07-24T11:00:00.000Z",
      },
      date: "2026-07-24",
    });
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "git_commit",
      title: "thicken timeline projection",
      source_meta: {
        repo: "/Users/teethe/Developer/return",
        sha: "abc1234",
        committed_at: "2026-07-24T12:00:00.000Z",
      },
      date: "2026-07-24",
    });

    const tl = buildTimeline(db, "2026-07-24");
    const browse = tl.segments.find((s) => s.category === "browse_history");
    assert.ok(browse);
    assert.equal(browse!.label, "ReTurn PRD");
    assert.equal((browse!.meta as { url?: string }).url, "https://example.com/prd");
    assert.ok(browse!.node_id);

    const agent = tl.segments.find((s) => s.kind === "agent");
    assert.ok(agent);
    assert.match(agent!.label, /claude/i);
    assert.match(agent!.label, /return/i);
    assert.equal((agent!.meta as { provider?: string }).provider, "claude");
    assert.ok(agent!.node_id);

    const app = tl.segments.find((s) => s.kind === "app" && s.label === "Safari");
    assert.ok(app);
    assert.equal(app!.category, "browser");
    assert.equal((app!.meta as { sample_count?: number }).sample_count, 1);

    const git = tl.segments.find((s) => s.category === "git_commit");
    assert.ok(git);
    assert.match(git!.label, /thicken timeline projection/);
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
