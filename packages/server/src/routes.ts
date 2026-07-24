import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type CharacterState,
  ChatRequest,
  type ContinueResponse,
  CreateNodesRequest,
  type CreateNodesResponse,
  type DaysResponse,
  HealthRequest,
  type HealthResponse,
  type ListCardsResponse,
  type ListMessagesResponse,
  type ListNodesResponse,
  type ListTasksResponse,
  PatchMessageIntentRequest,
  type PatchMessageIntentResponse,
  PatchTodoRequest,
  type PatchTodoResponse,
  type PingResponse,
  RegisterDeviceRequest,
  type RegisterDeviceResponse,
  ResumeRequest,
  type ReviewPoint,
  SaveRequest,
  type Stats,
  type StatsTodayResponse,
  TaskStatus,
  type TimelineResponse,
  type VoiceResponse,
} from "@return/shared";
import type { FastifyInstance } from "fastify";
import { TranscribeError, transcribeAudio } from "./ai/transcribe.js";
import { config, isHealthTokenConfigured } from "./config.js";
import {
  type DayRow,
  dayReviewPoints,
  dayStats,
  deleteNode,
  ensureDay,
  getDayByDate,
  getLatestSavedDay,
  getNodeById,
  getPaceMode,
  getTodo,
  insertNode,
  insertNodes,
  listCards,
  listDaysInRange,
  listMessages,
  listNodesByDate,
  listSavedDays,
  listTasks,
  listTodosByDay,
  setTodoDone,
  touchDevice,
  upsertDevice,
} from "./db/repo.js";
import type { Db } from "./db/schema.js";
import { ChatError, handleChat, rehandleWithIntent } from "./services/chat.js";
import { handleResume } from "./services/resume.js";
import { saveToday } from "./services/save.js";
import { buildTimeline, buildTimelineRange } from "./services/timeline.js";
import { computeLiveStats } from "./stats/live.js";
import { computeStreak, savedDatesFromDays } from "./stats/streak.js";
import {
  addDays,
  lastNDays,
  nowIso,
  todayDate,
  uuid,
  yesterdayDate,
} from "./util/time.js";

function badRequest(message: string) {
  return { statusCode: 400 as const, error: "Bad Request", message };
}

function notFound(message: string) {
  return { statusCode: 404 as const, error: "Not Found", message };
}

function unauthorized(message: string) {
  return { statusCode: 401 as const, error: "Unauthorized", message };
}

export async function registerRoutes(app: FastifyInstance, db: Db): Promise<void> {
  // ── ping ──────────────────────────────────────────────
  app.get("/api/ping", async () => {
    const body: PingResponse = {
      ok: true,
      server_time: nowIso(),
      version: config.version,
      pace_mode: getPaceMode(db),
    };
    return body;
  });

  // ── devices ───────────────────────────────────────────
  app.post("/api/devices/register", async (req, reply) => {
    const parsed = RegisterDeviceRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    const device = upsertDevice(db, {
      id: parsed.data.device_id,
      name: parsed.data.name,
      platform: parsed.data.platform,
    });
    const body: RegisterDeviceResponse = { device_id: device.id };
    return body;
  });

  // ── nodes ─────────────────────────────────────────────
  app.post("/api/nodes", async (req, reply) => {
    const parsed = CreateNodesRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    touchDevice(db, parsed.data.device_id);

    const result = insertNodes(
      db,
      parsed.data.nodes.map((n) => {
        // created_at is always server-stamped (shared NodeInput contract / Codex P2).
        // Client event time lives only in source_meta for timeline/session aggregation.
        const meta = sanitizeClientMeta(n.source_meta, n.client_created_at);
        return {
          client_uuid: n.client_uuid,
          kind: n.kind,
          title: n.title ?? null,
          content: n.content ?? null,
          source_meta: meta,
          device_id: parsed.data.device_id,
          date: n.date,
        };
      }),
    );

    const body: CreateNodesResponse = {
      ...result,
      pace_mode: getPaceMode(db),
    };
    return body;
  });

  app.get("/api/nodes", async (req, reply) => {
    const q = req.query as { date?: string };
    const date = q.date ?? todayDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send(badRequest("date must be YYYY-MM-DD"));
    }
    const body: ListNodesResponse = {
      date,
      nodes: listNodesByDate(db, date),
    };
    return body;
  });

  app.delete("/api/nodes/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const existing = getNodeById(db, id);
    if (!existing) return reply.code(404).send(notFound("node not found"));
    deleteNode(db, id);
    return { ok: true as const, id };
  });

  // ── voice ─────────────────────────────────────────────
  app.post("/api/voice", async (req, reply) => {
    const parts = req.parts();
    let deviceId: string | undefined;
    let clientUuid: string | undefined;
    let date: string | undefined;
    let title: string | undefined;
    let fileBuf: Buffer | undefined;
    let filename = "audio.webm";
    let mimeType = "audio/webm";

    for await (const part of parts) {
      if (part.type === "file") {
        filename = part.filename || filename;
        mimeType = part.mimetype || mimeType;
        const chunks: Buffer[] = [];
        for await (const chunk of part.file) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        fileBuf = Buffer.concat(chunks);
      } else {
        const v = String(part.value ?? "");
        if (part.fieldname === "device_id") deviceId = v;
        else if (part.fieldname === "client_uuid") clientUuid = v;
        else if (part.fieldname === "date") date = v;
        else if (part.fieldname === "title") title = v;
      }
    }

    if (!fileBuf || fileBuf.length === 0) {
      return reply.code(400).send(badRequest("audio file required"));
    }
    if (!deviceId) {
      return reply.code(400).send(badRequest("device_id required"));
    }
    // Reject path-traversal via client_uuid (Codex P1).
    const uuidRe =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (clientUuid && !uuidRe.test(clientUuid)) {
      return reply.code(400).send(badRequest("client_uuid must be a UUID"));
    }
    touchDevice(db, deviceId);

    // Persist raw audio first so we never lose data on transcribe failure (PRD §9.6).
    const audioDir = join(config.dataDir, "audio");
    mkdirSync(audioDir, { recursive: true });
    const audioId = clientUuid && uuidRe.test(clientUuid) ? clientUuid : uuid();
    const safeName =
      filename.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80) || "audio.webm";
    const audioPath = join(audioDir, `${audioId}-${safeName}`);
    writeFileSync(audioPath, fileBuf);

    let transcript: string | null = null;
    let pending = false;
    try {
      transcript = await transcribeAudio(fileBuf, filename, mimeType);
    } catch (err) {
      pending = true;
      console.error(
        "[voice] transcribe failed, marking pending:",
        err instanceof TranscribeError ? err.message : err,
      );
    }

    const { node } = insertNode(db, {
      client_uuid: clientUuid ?? uuid(),
      kind: "voice",
      title: title ?? (transcript ? transcript.slice(0, 60) : "voice (pending)"),
      content: transcript,
      device_id: deviceId,
      date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDate(),
      source_meta: {
        audio_path: audioPath,
        mime_type: mimeType,
        filename,
        pending_transcript: pending,
      },
    });

    let chat: VoiceResponse["chat"];
    if (transcript && !pending) {
      try {
        const chatRes = await handleChat(db, {
          text: transcript,
          device_id: deviceId,
        });
        chat = {
          message_id: chatRes.message_id,
          intent: chatRes.intent,
          reply: chatRes.reply,
          result: chatRes.result,
        };
      } catch (err) {
        console.error(
          "[voice] chat triage failed:",
          err instanceof Error ? err.message : err,
        );
      }
    }

    const body: VoiceResponse = {
      node,
      transcript: transcript ?? "",
      chat,
    };
    return body;
  });

  // ── health (Shortcuts fixed token) ────────────────────
  app.post("/api/health", async (req, reply) => {
    if (!isHealthTokenConfigured()) {
      return reply.code(503).send({
        statusCode: 503,
        error: "Service Unavailable",
        message: "HEALTH_TOKEN not configured — /api/health disabled",
      });
    }
    const token =
      (req.headers["x-return-token"] as string | undefined) ??
      (req.headers.authorization as string | undefined)?.replace(/^Bearer\s+/i, "");
    if (!token || token !== config.healthToken) {
      return reply.code(401).send(unauthorized("invalid health token"));
    }
    const parsed = HealthRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }

    // Idempotent per date: deterministic client_uuid; re-posts always refresh.
    const clientUuid = uuidFromSeed(`health:${parsed.data.date}`);
    const content = JSON.stringify({
      sleep_minutes: parsed.data.sleep_minutes,
      steps: parsed.data.steps,
    });
    const source_meta = {
      sleep_minutes: parsed.data.sleep_minutes,
      steps: parsed.data.steps,
      source: "shortcuts",
    };
    const { node, duplicate } = insertNode(db, {
      client_uuid: clientUuid,
      kind: "health_daily",
      title: `Health ${parsed.data.date}`,
      content,
      date: parsed.data.date,
      source_meta,
    });

    if (duplicate) {
      db.prepare(
        `UPDATE nodes SET content = ?, source_meta = ?, title = ? WHERE client_uuid = ?`,
      ).run(
        content,
        JSON.stringify(source_meta),
        `Health ${parsed.data.date}`,
        clientUuid,
      );
    }

    const fresh = getNodeById(db, node.id)!;
    const body: HealthResponse = { node: fresh };
    return body;
  });

  // ── save ──────────────────────────────────────────────
  app.post("/api/save", async (req, reply) => {
    const parsed = SaveRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    if (parsed.data.device_id) touchDevice(db, parsed.data.device_id);
    try {
      const result = await saveToday(db, parsed.data);
      return result;
    } catch (err) {
      console.error("[save] error:", err);
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: err instanceof Error ? err.message : "save failed",
      });
    }
  });

  // ── continue ──────────────────────────────────────────
  app.get("/api/continue", async () => {
    const today = todayDate();
    const yday = yesterdayDate();

    const live = computeLiveStats(db, today);
    const allSaved = listSavedDays(db, addDays(today, -60));
    const streak = computeStreak(savedDatesFromDays(allSaved), today);

    // Before = most recent saved day strictly before today (prefer yesterday).
    let beforeDay = getDayByDate(db, yday);
    if (!beforeDay?.saved_at) {
      beforeDay = getLatestSavedDay(db, today);
    }

    let before: ContinueResponse["before"] = null;
    if (beforeDay?.saved_at) {
      const prevStats = dayStats(beforeDay);
      // delta vs day before that
      const earlier = getLatestSavedDay(db, beforeDay.date);
      let stats_delta: Stats | null = null;
      if (prevStats && earlier) {
        const earlierStats = dayStats(earlier);
        if (earlierStats) {
          stats_delta = {
            intake: prevStats.intake - earlierStats.intake,
            focus: prevStats.focus - earlierStats.focus,
            output: prevStats.output - earlierStats.output,
            continuity: prevStats.continuity - earlierStats.continuity,
            energy: prevStats.energy - earlierStats.energy,
          };
        }
      }
      before = {
        date: beforeDay.date,
        opening_line: beforeDay.opening_line,
        summary: beforeDay.summary,
        review_points: dayReviewPoints(beforeDay) as ReviewPoint[],
        stats: prevStats,
        character_state: (beforeDay.character_state as CharacterState) ?? null,
        stats_delta,
      };
    }

    const todayDay = ensureDay(db, today);
    const todos = listTodosByDay(db, todayDay.id);

    const body: ContinueResponse = {
      before,
      future: { date: today, todos },
      character_state: live.character_state,
      stats: live.stats,
      streak,
      is_cold_start: before == null,
    };
    return body;
  });

  // ── stats/today ───────────────────────────────────────
  app.get("/api/stats/today", async (req) => {
    const q = req.query as { date?: string };
    const date = q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : todayDate();
    const live = computeLiveStats(db, date);
    const body: StatsTodayResponse = {
      date,
      stats: live.stats,
      character_state: live.character_state,
      saved: live.saved,
    };
    return body;
  });

  // ── timeline ──────────────────────────────────────────
  app.get("/api/timeline", async (req, reply) => {
    const q = req.query as { date?: string; from?: string; to?: string };
    const dayRe = /^\d{4}-\d{2}-\d{2}$/;
    if (q.from || q.to) {
      const from = q.from ?? q.to!;
      const to = q.to ?? q.from!;
      if (!dayRe.test(from) || !dayRe.test(to)) {
        return reply.code(400).send(badRequest("from/to must be YYYY-MM-DD"));
      }
      if (from > to) {
        return reply.code(400).send(badRequest("from must be <= to"));
      }
      const body: TimelineResponse = buildTimelineRange(db, from, to);
      return body;
    }
    const date = q.date ?? todayDate();
    if (!dayRe.test(date)) {
      return reply.code(400).send(badRequest("date must be YYYY-MM-DD"));
    }
    const body: TimelineResponse = buildTimeline(db, date);
    return body;
  });

  // ── chat / messages / resume / tasks / cards ──────────
  app.post("/api/chat", async (req, reply) => {
    const parsed = ChatRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    if (parsed.data.device_id) touchDevice(db, parsed.data.device_id);
    try {
      return await handleChat(db, {
        text: parsed.data.text,
        image: parsed.data.image,
        device_id: parsed.data.device_id,
        intent: parsed.data.intent,
      });
    } catch (err) {
      if (err instanceof ChatError) {
        return reply.code(err.status).send(badRequest(err.message));
      }
      throw err;
    }
  });

  app.get("/api/messages", async (req) => {
    const q = req.query as { cursor?: string; limit?: string };
    const limit = q.limit ? Number(q.limit) : undefined;
    const { messages, next_cursor } = listMessages(db, {
      cursor: q.cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    const body: ListMessagesResponse = { messages, next_cursor };
    return body;
  });

  app.patch("/api/messages/:id/intent", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = PatchMessageIntentRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    try {
      const out = await rehandleWithIntent(db, id, parsed.data.intent);
      const body: PatchMessageIntentResponse = {
        message: out.message,
        reply: out.reply,
        result: out.result,
      };
      return body;
    } catch (err) {
      if (err instanceof ChatError) {
        return reply
          .code(err.status)
          .send(err.status === 404 ? notFound(err.message) : badRequest(err.message));
      }
      throw err;
    }
  });

  app.post("/api/resume", async (req, reply) => {
    const parsed = ResumeRequest.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    if (parsed.data.device_id) touchDevice(db, parsed.data.device_id);
    return handleResume(db, { hours: parsed.data.hours });
  });

  app.get("/api/tasks", async (req) => {
    const q = req.query as { status?: string };
    let status: (typeof TaskStatus)["_type"] | undefined;
    if (q.status) {
      const p = TaskStatus.safeParse(q.status);
      if (p.success) status = p.data;
    }
    const body: ListTasksResponse = { tasks: listTasks(db, status) };
    return body;
  });

  app.get("/api/cards", async (req, reply) => {
    const q = req.query as {
      direction?: string;
      cursor?: string;
      limit?: string;
    };
    if (q.direction !== "before" && q.direction !== "future") {
      return reply.code(400).send(badRequest("direction must be before|future"));
    }
    const limit = q.limit ? Number(q.limit) : undefined;
    const { cards, next_cursor } = listCards(db, {
      direction: q.direction,
      today: todayDate(),
      cursor: q.cursor,
      limit: Number.isFinite(limit) ? limit : undefined,
    });
    const body: ListCardsResponse = {
      direction: q.direction,
      cards,
      next_cursor,
    };
    return body;
  });

  // ── days (status overview) ────────────────────────────
  app.get("/api/days", async (req) => {
    const q = req.query as { range?: string };
    const range = Math.min(Math.max(Number(q.range) || 30, 1), 90);
    const dates = lastNDays(range);
    const start = dates[0]!;
    const end = dates[dates.length - 1]!;
    const rows = listDaysInRange(db, start, end);
    const byDate = new Map<string, DayRow>(rows.map((r) => [r.date, r]));

    const days = dates.map((date: string) => {
      const row = byDate.get(date);
      return {
        date,
        saved_at: row?.saved_at ?? null,
        summary: row?.summary ?? null,
        stats: row ? dayStats(row) : null,
        character_state: (row?.character_state as CharacterState) ?? null,
      };
    });

    const allSaved = listSavedDays(db, addDays(end, -60));
    const streak = computeStreak(savedDatesFromDays(allSaved), end);

    const body: DaysResponse = { range, days, streak };
    return body;
  });

  // ── todos ─────────────────────────────────────────────
  app.patch("/api/todos/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = PatchTodoRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    const existing = getTodo(db, id);
    if (!existing) return reply.code(404).send(notFound("todo not found"));

    if (parsed.data.device_id) touchDevice(db, parsed.data.device_id);

    const wasDone = existing.done;
    const todo = setTodoDone(db, id, parsed.data.done)!;
    let check_node = null;

    // Only emit todo_check on false→true transition (Codex P2 — no retry spam).
    if (parsed.data.done && !wasDone) {
      const { node } = insertNode(db, {
        client_uuid: uuid(),
        kind: "todo_check",
        title: todo.text,
        content: todo.text,
        device_id: parsed.data.device_id ?? null,
        date: todayDate(),
        source_meta: { todo_id: todo.id, day_id: todo.day_id },
      });
      check_node = node;
    }

    const body: PatchTodoResponse = { todo, check_node };
    return body;
  });
}

/**
 * Client event times go into source_meta only — never overwrite server created_at.
 * Drop non-parseable sampled_at; keep Zod-validated client_created_at.
 */
function sanitizeClientMeta(
  sourceMeta: Record<string, unknown> | null | undefined,
  clientCreatedAt?: string,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(sourceMeta ?? {}) };
  if (clientCreatedAt) meta.client_created_at = clientCreatedAt;
  if (typeof meta.sampled_at === "string") {
    const t = Date.parse(meta.sampled_at);
    if (Number.isNaN(t)) delete meta.sampled_at;
    else meta.sampled_at = new Date(t).toISOString();
  } else if (meta.sampled_at != null) {
    delete meta.sampled_at;
  }
  return meta;
}

/** Deterministic UUIDv4-shaped id from seed (for health-date idempotency). */
function uuidFromSeed(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, "0") + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join("-");
}
