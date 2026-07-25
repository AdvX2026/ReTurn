import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  AcceptTodoRequest,
  type AcceptTodoResponse,
  AskRequest,
  type AskResponse,
  type CharacterState,
  ChatRequest,
  type ChatResponse,
  type ContinueResponse,
  CreateNodesRequest,
  type CreateNodesResponse,
  type DaysResponse,
  DismissTodoRequest,
  type DismissTodoResponse,
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
  type ResumeResponse,
  type ReviewPoint,
  SaveRequest,
  type SearchResponse,
  type Stats,
  type StatsTodayResponse,
  TaskStatus,
  type TimelineResponse,
  type VoiceResponse,
  uuidFromSeed,
} from "@return/shared";
import type { FastifyInstance } from "fastify";
import { TranscribeError, transcribeAudio } from "./ai/transcribe.js";
import { config } from "./config.js";
import {
  type DayRow,
  acceptTodo,
  currentCadence,
  dayReviewPoints,
  dayStats,
  deleteNode,
  dismissTodo,
  ensureDay,
  getDayByDate,
  getLatestSavedDay,
  getMessage,
  getNodeById,
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
  reindexNode,
  setMessageIntent,
  setTodoDone,
  touchDevice,
  upsertDevice,
} from "./db/repo.js";
import type { Db } from "./db/schema.js";
import { ask } from "./search/ask.js";
import { search } from "./search/query.js";
import { ChatError, handleChat } from "./services/chat.js";
import type { MeetingTaskDispatcher } from "./services/meeting-tasks.js";
import { handleResume } from "./services/resume.js";
import { saveToday } from "./services/save.js";
import { TimelineRangeError, buildTimeline } from "./services/timeline.js";
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

function parseLimit(value: string | undefined, defaultValue: number): number {
  if (value === undefined || value === "") return defaultValue;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error("limit must be an integer from 1 to 50");
  }
  return parsed;
}

export async function registerRoutes(
  app: FastifyInstance,
  db: Db,
  meetingTasks: MeetingTaskDispatcher,
): Promise<void> {
  // ── ping ──────────────────────────────────────────────
  app.get("/api/ping", async () => {
    const body: PingResponse = {
      ok: true,
      server_time: nowIso(),
      version: config.version,
      cadence: currentCadence(db),
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
    for (const node of parsed.data.nodes) {
      const sampledAt = node.source_meta?.sampled_at;
      if (
        sampledAt !== undefined &&
        (typeof sampledAt !== "string" || Number.isNaN(Date.parse(sampledAt)))
      ) {
        return reply
          .code(400)
          .send(badRequest("source_meta.sampled_at must be an ISO date-time"));
      }
    }

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
      cadence: currentCadence(db),
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
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send(badRequest("date must be YYYY-MM-DD"));
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

    let transcript: string;
    try {
      transcript = await transcribeAudio(fileBuf, filename, mimeType);
    } catch (error) {
      return reply.code(502).send({
        statusCode: 502,
        error: "Bad Gateway",
        message:
          error instanceof TranscribeError ? error.message : "transcription failed",
      });
    }

    const { node } = insertNode(db, {
      client_uuid: clientUuid ?? uuid(),
      kind: "voice",
      title: title ?? transcript.slice(0, 60),
      content: transcript,
      device_id: deviceId,
      date: date ?? todayDate(),
      source_meta: {
        audio_path: audioPath,
        mime_type: mimeType,
        filename,
      },
    });

    const body: VoiceResponse = {
      node,
      transcript,
    };

    return body;
  });

  // ── health (Shortcuts fixed token) ────────────────────
  app.post("/api/health", async (req, reply) => {
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
      reindexNode(db, node.id);
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
  app.get("/api/stats/today", async (req, reply) => {
    const q = req.query as { date?: string };
    const date = q.date ?? todayDate();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return reply.code(400).send(badRequest("date must be YYYY-MM-DD"));
    }
    const live = computeLiveStats(db, date);
    const body: StatsTodayResponse = {
      date,
      stats: live.stats,
      character_state: live.character_state,
      saved: live.saved,
      cadence: currentCadence(db, date),
    };
    return body;
  });

  // ── timeline (single day or from/to range) ──────────
  app.get("/api/timeline", async (req, reply) => {
    const q = req.query as { date?: string; from?: string; to?: string };
    const dateRe = /^\d{4}-\d{2}-\d{2}$/;
    try {
      if (q.from || q.to) {
        const from = q.from ?? q.to!;
        const to = q.to ?? q.from!;
        if (!dateRe.test(from) || !dateRe.test(to)) {
          return reply.code(400).send(badRequest("from/to must be YYYY-MM-DD"));
        }
        if (from > to) {
          return reply.code(400).send(badRequest("from must be ≤ to"));
        }
        const body: TimelineResponse = buildTimeline(db, { from, to });
        return body;
      }
      const date = q.date ?? todayDate();
      if (!dateRe.test(date)) {
        return reply.code(400).send(badRequest("date must be YYYY-MM-DD"));
      }
      const body: TimelineResponse = buildTimeline(db, date);
      return body;
    } catch (err) {
      if (err instanceof TimelineRangeError) {
        return reply.code(400).send(badRequest(err.message));
      }
      throw err;
    }
  });

  // ── days (status overview) ────────────────────────────
  app.get("/api/days", async (req, reply) => {
    const q = req.query as { range?: string };
    let range = 30;
    if (q.range !== undefined) {
      const parsed = Number(q.range);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > 90) {
        return reply.code(400).send(badRequest("range must be an integer from 1 to 90"));
      }
      range = parsed;
    }
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

  // ── search ────────────────────────────────────────────
  app.get("/api/search", async (req, reply) => {
    const q = req.query as {
      q?: string;
      from?: string;
      to?: string;
      kinds?: string;
      limit?: string;
    };
    const query = (q.q ?? "").trim();
    if (!query || query.length > 500) {
      return reply.code(400).send(badRequest("q is required (1–500 characters)"));
    }
    if (q.from && !/^\d{4}-\d{2}-\d{2}$/.test(q.from)) {
      return reply.code(400).send(badRequest("from must be YYYY-MM-DD"));
    }
    if (q.to && !/^\d{4}-\d{2}-\d{2}$/.test(q.to)) {
      return reply.code(400).send(badRequest("to must be YYYY-MM-DD"));
    }
    if (q.from && q.to && q.from > q.to) {
      return reply.code(400).send(badRequest("from must be ≤ to"));
    }
    let limit: number;
    try {
      limit = parseLimit(q.limit, 20);
    } catch (error) {
      return reply.code(400).send(badRequest((error as Error).message));
    }
    const kinds = q.kinds
      ? q.kinds
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;

    const body: SearchResponse = await search(db, {
      q: query,
      from: q.from,
      to: q.to,
      kinds,
      limit,
    });
    return body;
  });

  // ── ask (RAG) ───────────────────────────────────────
  app.post("/api/ask", async (req, reply) => {
    const parsed = AskRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    try {
      const body: AskResponse = await ask(db, {
        question: parsed.data.question,
        from: parsed.data.from,
        to: parsed.data.to,
      });
      return body;
    } catch (err) {
      console.error("[ask] error:", err);
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: err instanceof Error ? err.message : "ask failed",
      });
    }
  });

  // ── chat (v0.6 Input) ─────────────────────────────────
  app.post("/api/chat", async (req, reply) => {
    const parsed = ChatRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    if (parsed.data.device_id) touchDevice(db, parsed.data.device_id);
    try {
      const body: ChatResponse = await handleChat(db, parsed.data, meetingTasks);
      return body;
    } catch (err) {
      if (err instanceof ChatError) {
        return reply.code(400).send(badRequest(err.message));
      }
      console.error("[chat] error:", err);
      return reply.code(500).send({
        statusCode: 500,
        error: "Internal Server Error",
        message: err instanceof Error ? err.message : "chat failed",
      });
    }
  });

  // ── messages ────────────────────────────────────────
  app.get("/api/messages", async (req, reply) => {
    const q = req.query as { cursor?: string; limit?: string };
    let limit: number;
    try {
      limit = parseLimit(q.limit, 50);
    } catch (error) {
      return reply.code(400).send(badRequest((error as Error).message));
    }
    const body: ListMessagesResponse = listMessages(db, {
      cursor: q.cursor,
      limit,
    });
    return body;
  });

  app.patch("/api/messages/:id/intent", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = PatchMessageIntentRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    const existing = getMessage(db, id);
    if (!existing) return reply.code(404).send(notFound("message not found"));
    const message = setMessageIntent(db, id, parsed.data.intent);
    // If user corrects a prior unknown, re-run chat with forced intent on original text.
    let follow: ChatResponse | undefined;
    if (
      existing.intent === "unknown" &&
      existing.role === "user" &&
      parsed.data.intent !== "unknown"
    ) {
      follow = await handleChat(
        db,
        {
          text: existing.content,
          intent: parsed.data.intent,
        },
        meetingTasks,
      );
    }
    const body: PatchMessageIntentResponse & { follow_up?: ChatResponse } = {
      message: message!,
      ...(follow ? { follow_up: follow } : {}),
    };
    return body;
  });

  // ── cards ───────────────────────────────────────────
  app.get("/api/cards", async (req, reply) => {
    const q = req.query as {
      direction?: string;
      cursor?: string;
      limit?: string;
    };
    const direction = q.direction === "future" ? "future" : "before";
    if (q.direction && q.direction !== "before" && q.direction !== "future") {
      return reply.code(400).send(badRequest("direction must be before|future"));
    }
    let limit: number;
    try {
      limit = parseLimit(q.limit, 30);
    } catch (error) {
      return reply.code(400).send(badRequest((error as Error).message));
    }
    const page = listCards(db, {
      direction,
      cursor: q.cursor,
      limit,
    });
    const body: ListCardsResponse = {
      direction,
      cards: page.cards,
      next_cursor: page.next_cursor,
    };
    return body;
  });

  // ── tasks ───────────────────────────────────────────
  app.get("/api/tasks", async (req, reply) => {
    const q = req.query as { status?: string };
    const status = q.status ? TaskStatus.safeParse(q.status) : null;
    if (status && !status.success) {
      return reply
        .code(400)
        .send(badRequest("status must be queued|running|done|failed"));
    }
    const tasks = listTasks(db, {
      status: status?.data,
    });
    const body: ListTasksResponse = { tasks };
    return body;
  });

  // ── resume ──────────────────────────────────────────
  app.post("/api/resume", async (req, reply) => {
    const parsed = ResumeRequest.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    if (parsed.data.device_id) touchDevice(db, parsed.data.device_id);
    const body: ResumeResponse = await handleResume(db, {
      hours: parsed.data.hours,
    });
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

  /** UI wrote Reminder via EventKit → positive sample for preference loop. */
  app.post("/api/todos/:id/accept", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = AcceptTodoRequest.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    if (parsed.data.device_id) touchDevice(db, parsed.data.device_id);
    const todo = acceptTodo(db, id, parsed.data.reminder_id ?? null);
    if (!todo) return reply.code(404).send(notFound("todo not found"));
    const body: AcceptTodoResponse = { todo };
    return body;
  });

  /** Explicit ignore → negative sample. */
  app.post("/api/todos/:id/dismiss", async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = DismissTodoRequest.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.code(400).send(badRequest(parsed.error.message));
    }
    if (parsed.data.device_id) touchDevice(db, parsed.data.device_id);
    const todo = dismissTodo(db, id);
    if (!todo) return reply.code(404).send(notFound("todo not found"));
    const body: DismissTodoResponse = { todo };
    return body;
  });
}

/**
 * Client event times go into source_meta only — never overwrite server created_at.
 * Normalize sampled_at and retain the Zod-validated client_created_at.
 */
function sanitizeClientMeta(
  sourceMeta: Record<string, unknown> | null | undefined,
  clientCreatedAt?: string,
): Record<string, unknown> {
  const meta: Record<string, unknown> = { ...(sourceMeta ?? {}) };
  if (clientCreatedAt) meta.client_created_at = clientCreatedAt;
  if (typeof meta.sampled_at === "string") {
    meta.sampled_at = new Date(meta.sampled_at).toISOString();
  }
  return meta;
}
