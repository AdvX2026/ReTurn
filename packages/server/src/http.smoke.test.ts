import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
 * HTTP smoke via Fastify inject() — no real port, runs in CI.
 * Covers the Day Loop spine: register → nodes → health → stats → save.
 */
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import type { MeetingNotesResult } from "./ai/meeting-notes.js";
import { createApp } from "./app.js";
import { type Db, openDb } from "./db/schema.js";
import { MeetingTaskRunner } from "./services/meeting-tasks.js";

describe("http smoke", () => {
  let app: FastifyInstance;
  let db: Db;
  let dir: string;
  let deviceId: string;
  let nodeId: string;
  let todoIds: string[];
  let meetingRunner: MeetingTaskRunner;
  let meetingStarted: Promise<void>;
  let releaseMeeting: (() => void) | undefined;
  const date = "2026-07-24";

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "return-smoke-"));
    db = openDb(dir, "smoke.db");
    let markMeetingStarted!: () => void;
    meetingStarted = new Promise<void>((resolve) => {
      markMeetingStarted = resolve;
    });
    const meetingGate = new Promise<void>((resolve) => {
      releaseMeeting = resolve;
    });
    meetingRunner = new MeetingTaskRunner(db, async (): Promise<MeetingNotesResult> => {
      markMeetingStarted();
      await meetingGate;
      return {
        title: "HTTP Task 测试",
        summary: "HTTP 客户端观察到正在执行的 Task。",
        decisions: ["使用持久化队列"],
        action_items: ["验证完成消息"],
      };
    });
    app = await createApp(db, { meetingTaskRunner: meetingRunner });
  });

  after(async () => {
    releaseMeeting?.();
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
    const { config } = await import("./config.js");
    rmSync(config.dataDir, { recursive: true, force: true });
  });

  it("GET /api/ping", async () => {
    const res = await app.inject({ method: "GET", url: "/api/ping" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      ok: boolean;
      version: string;
      cadence?: string;
    };
    assert.equal(body.ok, true);
    assert.ok(body.version);
    assert.equal(body.cadence, "active");
  });

  it("POST /api/devices/register", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/devices/register",
      payload: { name: "ci-mac", platform: "macos" },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { device_id: string };
    assert.ok(body.device_id);
    deviceId = body.device_id;
  });

  it("POST /api/nodes batch + idempotent replay", async () => {
    const uuid = crypto.randomUUID();
    const payload = {
      device_id: deviceId,
      nodes: [
        {
          client_uuid: uuid,
          kind: "text",
          title: "smoke",
          content: "hello from ci",
          date,
        },
        {
          client_uuid: crypto.randomUUID(),
          kind: "app_sample",
          title: "Cursor",
          source_meta: { app: "Cursor" },
          date,
        },
      ],
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/nodes",
      payload,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      created: Array<{ id: string }>;
      duplicates: string[];
    };
    assert.equal(body.created.length, 2);
    assert.equal(body.duplicates.length, 0);
    nodeId = body.created[0]!.id;

    const replay = await app.inject({
      method: "POST",
      url: "/api/nodes",
      payload,
    });
    const body2 = replay.json() as { created: unknown[]; duplicates: string[] };
    assert.equal(body2.created.length, 0);
    assert.equal(body2.duplicates.length, 2);
  });

  it("GET /api/nodes?date=", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/nodes?date=${date}`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { nodes: unknown[] };
    assert.ok(body.nodes.length >= 2);
  });

  it("POST /api/voice", async () => {
    const boundary = "return-smoke-boundary";
    const field = (name: string, value: string) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`;
    const payload = Buffer.concat([
      Buffer.from(field("device_id", deviceId)),
      Buffer.from(field("client_uuid", crypto.randomUUID())),
      Buffer.from(field("date", date)),
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="voice.wav"\r\nContent-Type: audio/wav\r\n\r\n`,
      ),
      Buffer.from("mock audio bytes"),
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const res = await app.inject({
      method: "POST",
      url: "/api/voice",
      headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
      payload,
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as { transcript: string; node: { kind: string } };
    assert.equal(body.transcript, "Mock voice transcript");
    assert.equal(body.node.kind, "voice");
  });

  it("POST /api/health with token", async () => {
    // test-setup.ts sets HEALTH_TOKEN before config import
    const { config } = await import("./config.js");
    assert.ok(config.healthToken, "test-setup must set HEALTH_TOKEN");
    const res = await app.inject({
      method: "POST",
      url: "/api/health",
      headers: { "x-return-token": config.healthToken },
      payload: {
        date,
        sleep_minutes: 300,
        steps: 4000,
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as { node: { kind: string } };
    assert.equal(body.node.kind, "health_daily");
  });

  it("GET /api/stats/today", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/stats/today?date=${date}`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      stats: { energy: number };
      character_state: string;
      profession: string;
      profession_mode: string;
      collection: {
        device_count: number;
        sample_count: number;
        last_seen_at: string | null;
      };
    };
    assert.ok(typeof body.stats.energy === "number");
    assert.ok(body.character_state);
    assert.ok(body.profession);
    assert.equal(body.profession_mode, "auto");
    assert.ok(body.collection.device_count >= 1);
    assert.ok(body.collection.sample_count >= 1);
    assert.ok(body.collection.last_seen_at);
  });

  it("GET/PATCH /api/profile", async () => {
    const get1 = await app.inject({ method: "GET", url: "/api/profile" });
    assert.equal(get1.statusCode, 200, get1.body);
    const empty = get1.json() as {
      profession: string;
      profession_mode: string;
      accepted_todos: string[];
    };
    assert.equal(empty.profession_mode, "auto");
    assert.ok(Array.isArray(empty.accepted_todos));

    const patch = await app.inject({
      method: "PATCH",
      url: "/api/profile",
      payload: {
        display_name: "Teethe",
        profession: "coder",
        note: "ship the profile API",
      },
    });
    assert.equal(patch.statusCode, 200, patch.body);
    const locked = patch.json() as {
      display_name: string;
      profession: string;
      profession_mode: string;
      note: string;
    };
    assert.equal(locked.display_name, "Teethe");
    assert.equal(locked.profession, "coder");
    assert.equal(locked.profession_mode, "manual");
    assert.equal(locked.note, "ship the profile API");

    const stats = await app.inject({
      method: "GET",
      url: `/api/stats/today?date=${date}`,
    });
    const statsBody = stats.json() as {
      profession: string;
      profession_mode: string;
    };
    assert.equal(statsBody.profession, "coder");
    assert.equal(statsBody.profession_mode, "manual");
  });

  it("GET /api/usage aggregates provider calls", async () => {
    const res = await app.inject({ method: "GET", url: "/api/usage" });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as {
      totals: { calls: number; total_tokens: number };
      breakdown: Array<{ kind: string; operation: string }>;
    };
    assert.ok(body.totals.calls >= 1);
    assert.ok(body.totals.total_tokens >= 17);
    assert.ok(
      body.breakdown.some(
        (item) =>
          item.kind === "transcription" && item.operation === "voice_transcription",
      ),
    );
  });

  it("POST /api/save then idempotent", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/save",
      payload: {
        date,
        device_id: deviceId,
        note_text: "ci save note",
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as {
      already_saved: boolean;
      summary: string | null;
      streak: number;
      todos: Array<{ id: string }>;
    };
    assert.equal(body.already_saved, false);
    assert.ok(body.summary);
    assert.ok(body.streak >= 1);
    assert.equal(body.todos.length, 3);
    todoIds = body.todos.map((todo) => todo.id);

    const again = await app.inject({
      method: "POST",
      url: "/api/save",
      payload: { date, note_text: "ignored" },
    });
    const body2 = again.json() as { already_saved: boolean };
    assert.equal(body2.already_saved, true);
  });

  it("PATCH /api/todos/:id and accept/dismiss preference endpoints", async () => {
    const patched = await app.inject({
      method: "PATCH",
      url: `/api/todos/${todoIds[0]}`,
      payload: { done: true, device_id: deviceId },
    });
    assert.equal(patched.statusCode, 200, patched.body);

    const accepted = await app.inject({
      method: "POST",
      url: `/api/todos/${todoIds[1]}/accept`,
      payload: { device_id: deviceId, reminder_id: "reminder-1" },
    });
    assert.equal(accepted.statusCode, 200, accepted.body);

    const dismissed = await app.inject({
      method: "POST",
      url: `/api/todos/${todoIds[2]}/dismiss`,
      payload: { device_id: deviceId },
    });
    assert.equal(dismissed.statusCode, 200, dismissed.body);
  });

  it("GET /api/timeline + /api/days", async () => {
    const tl = await app.inject({
      method: "GET",
      url: `/api/timeline?date=${date}`,
    });
    assert.equal(tl.statusCode, 200);
    const days = await app.inject({ method: "GET", url: "/api/days?range=7" });
    assert.equal(days.statusCode, 200);
    const body = days.json() as { days: unknown[]; streak: number };
    assert.equal(body.days.length, 7);
  });

  it("GET /api/search finds save note", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/search?q=ci%20save",
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as {
      query: string;
      took_ms: number;
      results: Array<{ kind: string; snippet: string }>;
    };
    assert.equal(body.query, "ci save");
    assert.ok(typeof body.took_ms === "number");
    assert.ok(body.results.length >= 1);
  });

  it("GET /api/search requires q", async () => {
    const res = await app.inject({ method: "GET", url: "/api/search" });
    assert.equal(res.statusCode, 400);
  });

  it("POST /api/ask", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/ask",
      payload: { question: "今天存了什么？" },
    });
    assert.equal(res.statusCode, 200, res.body);
  });

  it("POST /api/chat idea + GET messages/cards", async () => {
    const chat = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { text: "灵感: 双向流" },
    });
    assert.equal(chat.statusCode, 200, chat.body);
    const body = chat.json() as { intent: string; message_id: string };
    assert.equal(body.intent, "idea");

    const msgs = await app.inject({ method: "GET", url: "/api/messages" });
    assert.equal(msgs.statusCode, 200);
    const mb = msgs.json() as { messages: unknown[] };
    assert.ok(mb.messages.length >= 1);

    const cards = await app.inject({
      method: "GET",
      url: "/api/cards?direction=future",
    });
    assert.equal(cards.statusCode, 200);
  });

  it("POST /api/chat image extracts a high-weight node", async () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nCEAAAAASUVORK5CYII=";
    const res = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { image: png, device_id: deviceId },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as { task_id: string };
    assert.ok(body.task_id);

    const tasks = await app.inject({ method: "GET", url: "/api/tasks?status=done" });
    assert.equal(tasks.statusCode, 200, tasks.body);
    assert.ok(
      (tasks.json() as { tasks: Array<{ id: string }> }).tasks.some(
        (task) => task.id === body.task_id,
      ),
    );
  });

  it("PATCH /api/messages/:id/intent re-runs a corrected intent", async () => {
    const unknown = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { text: "待分类内容", intent: "unknown" },
    });
    assert.equal(unknown.statusCode, 200, unknown.body);
    const userMessageId = (unknown.json() as { user_message_id: string }).user_message_id;

    const corrected = await app.inject({
      method: "PATCH",
      url: `/api/messages/${userMessageId}/intent`,
      payload: { intent: "idea" },
    });
    assert.equal(corrected.statusCode, 200, corrected.body);
    const body = corrected.json() as { follow_up?: { intent: string } };
    assert.equal(body.follow_up?.intent, "idea");
  });

  it("POST /api/chat exposes a running meeting Task before completion", async () => {
    const notes = `会议纪要\n${"1. 对齐 Task API\n2. 验证恢复流程\n".repeat(30)}`;
    const res = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { text: notes },
    });
    assert.equal(res.statusCode, 200, res.body);
    const accepted = res.json() as { task_id: string; reply: string };
    assert.ok(accepted.task_id);
    assert.match(accepted.reply, /正在整理/);

    await meetingStarted;
    const runningRes = await app.inject({
      method: "GET",
      url: "/api/tasks?status=running",
    });
    const running = runningRes.json() as {
      tasks: Array<{ id: string; status: string }>;
    };
    assert.ok(
      running.tasks.some(
        (task) => task.id === accepted.task_id && task.status === "running",
      ),
    );

    releaseMeeting?.();
    releaseMeeting = undefined;
    await meetingRunner.waitForIdle();
    const doneRes = await app.inject({
      method: "GET",
      url: "/api/tasks?status=done",
    });
    const done = doneRes.json() as {
      tasks: Array<{ id: string; status: string }>;
    };
    assert.ok(
      done.tasks.some((task) => task.id === accepted.task_id && task.status === "done"),
    );
  });

  it("POST /api/resume + GET /api/tasks", async () => {
    const resume = await app.inject({
      method: "POST",
      url: "/api/resume",
      payload: {},
    });
    assert.equal(resume.statusCode, 200, resume.body);
    const tasks = await app.inject({ method: "GET", url: "/api/tasks" });
    assert.equal(tasks.statusCode, 200);
  });

  it("GET /api/timeline?from&to", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/timeline?from=${date}&to=${date}`,
    });
    assert.equal(res.statusCode, 200, res.body);
  });

  it("GET /api/timeline range >31 days → 400", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/timeline?from=2026-01-01&to=2026-03-15",
    });
    assert.equal(res.statusCode, 400);
  });

  it("rejects invalid query values instead of substituting defaults", async () => {
    const stats = await app.inject({
      method: "GET",
      url: "/api/stats/today?date=not-a-date",
    });
    assert.equal(stats.statusCode, 400);

    const usage = await app.inject({
      method: "GET",
      url: "/api/usage?from=2026-07-25&to=2026-07-24",
    });
    assert.equal(usage.statusCode, 400);

    const days = await app.inject({ method: "GET", url: "/api/days?range=7.5" });
    assert.equal(days.statusCode, 400);

    const messages = await app.inject({
      method: "GET",
      url: "/api/messages?limit=3.5",
    });
    assert.equal(messages.statusCode, 400);

    const tasks = await app.inject({
      method: "GET",
      url: "/api/tasks?status=unknown",
    });
    assert.equal(tasks.statusCode, 400);

    const nodes = await app.inject({
      method: "POST",
      url: "/api/nodes",
      payload: {
        device_id: deviceId,
        nodes: [
          {
            client_uuid: crypto.randomUUID(),
            kind: "app_sample",
            date,
            source_meta: { sampled_at: "not-a-date" },
          },
        ],
      },
    });
    assert.equal(nodes.statusCode, 400);
  });

  it("DELETE /api/nodes/:id", async () => {
    const res = await app.inject({
      method: "DELETE",
      url: `/api/nodes/${nodeId}`,
    });
    assert.equal(res.statusCode, 200, res.body);
  });
});
