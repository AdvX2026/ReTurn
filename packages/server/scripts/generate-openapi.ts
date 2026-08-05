/**
 * Generates the OpenAPI 3.1 document for the ReTurn server API.
 *
 * The Zod schemas in `@return/shared` are the single contract authority; this
 * script only wires them to endpoints (method + path + params), mirroring the
 * registrations in `src/routes.ts`. Output is written to the repo root as
 * `openapi.json` so the future native Windows client can consume it with a
 * standard OpenAPI code generator (Kiota / NSwag).
 *
 * Run: `pnpm --filter @return/server openapi`
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  AcceptTodoRequest,
  AcceptTodoResponse,
  AskRequest,
  AskResponse,
  CardRecord,
  ChatRequest,
  ChatResponse,
  CreateNodesRequest,
  CreateNodesResponse,
  DaysResponse,
  DismissTodoRequest,
  DismissTodoResponse,
  HealthRequest,
  HealthResponse,
  ListCardsResponse,
  ListMessagesResponse,
  ListNodesResponse,
  ListTasksResponse,
  MessageRecord,
  NodeRecord,
  PatchMessageIntentRequest,
  PatchMessageIntentResponse,
  PatchTodoRequest,
  PatchTodoResponse,
  PatchUserProfileRequest,
  PingResponse,
  RegisterDeviceRequest,
  RegisterDeviceResponse,
  ResumeRequest,
  ResumeResponse,
  SaveRequest,
  SaveResponse,
  SearchResponse,
  StatsTodayResponse,
  TaskRecord,
  TimelineResponse,
  TodoRecord,
  UsageResponse,
  UserProfile,
  VoiceResponse,
} from "@return/shared";
import { z } from "zod";
import { type ZodOpenApiObject, createDocument } from "zod-openapi";

const DATE = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("Calendar date YYYY-MM-DD, server-local timezone");
const UUID = z.string().uuid();

const json = (schema: z.ZodType) => ({
  content: { "application/json": { schema } },
});
const ok = (schema: z.ZodType, description = "OK") => ({
  "200": { description, ...json(schema) },
  "400": { description: "Validation or business-rule failure" },
  "500": { description: "Internal server error" },
});
const notFound = { "404": { description: "Resource not found" } };
const unconfigured = {
  "503": { description: "Dependency not configured (LLM / health token)" },
};

// ── query shapes (parsed by hand in routes.ts; no shared schemas) ──────────
const DateQuery = z.object({ date: DATE.optional() });
const TimelineQuery = z.object({
  date: DATE.optional(),
  from: DATE.optional(),
  to: DATE.optional(),
});
const RangeQuery = z.object({ from: DATE.optional(), to: DATE.optional() });
const MessagesQuery = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
const CardsQuery = z.object({
  direction: z.enum(["before", "future"]).optional(),
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).optional(),
});
const TasksQuery = z.object({
  status: z.enum(["queued", "running", "done", "failed"]).optional(),
});
const DaysQuery = z.object({
  range: z.number().int().min(1).max(90).optional(),
});
const SearchQuery = z.object({
  q: z.string().min(1).max(500),
  from: DATE.optional(),
  to: DATE.optional(),
  kinds: z.string().optional(),
  limit: z.number().int().min(1).max(50).optional(),
});
const IdPath = z.object({ id: UUID });

// ── inline shapes not defined in shared (mirror routes.ts responses) ───────
const DeleteNodeResponse = z.object({ ok: z.literal(true), id: UUID });
const PatchMessageIntentFullResponse = z.object({
  message: MessageRecord,
  follow_up: ChatResponse.optional(),
});
const VoiceFormData = {
  type: "object",
  required: ["device_id", "file"],
  properties: {
    device_id: { type: "string", format: "uuid", description: "Device id" },
    client_uuid: {
      type: "string",
      format: "uuid",
      description: "Idempotency key; must be a valid UUID",
    },
    date: {
      type: "string",
      pattern: "^\\d{4}-\\d{2}-\\d{2}$",
      description: "Day override; default server-local today",
    },
    title: { type: "string", maxLength: 500 },
    file: { type: "string", format: "binary", description: "Audio file (webm / m4a)" },
  },
};

const document: ZodOpenApiObject = {
  openapi: "3.0.0",
  info: {
    title: "ReTurn Server API",
    version: "0.1.0",
    description:
      "Home-LAN second brain. Single user, multiple devices (macOS / iOS / Windows). " +
      "Write endpoints are deliberately unauthenticated inside the trusted LAN. " +
      "POST /api/health always requires HEALTH_TOKEN. If API_TOKEN is configured, " +
      "every endpoint except /api/ping and /api/health requires it via " +
      "X-Return-Token or Bearer authorization.",
    license: { name: "Private — internal use only" },
  },
  servers: [{ url: "http://<pi-host>:8787", description: "Orange Pi on the home LAN" }],
  security: [{ apiToken: [] }],
  components: {
    securitySchemes: {
      apiToken: {
        type: "apiKey",
        in: "header",
        name: "X-Return-Token",
        description: "Optional global API token (Bearer authorization also accepted).",
      },
      healthToken: {
        type: "apiKey",
        in: "header",
        name: "X-Return-Token",
        description: "HEALTH_TOKEN, required for POST /api/health.",
      },
    },
    schemas: {
      NodeRecord,
      TodoRecord,
      MessageRecord,
      TaskRecord,
      CardRecord,
      SaveResponse,
      StatsTodayResponse,
      UserProfile,
      TimelineResponse,
      DaysResponse,
      SearchResponse,
      AskResponse,
      ChatResponse,
      ListMessagesResponse,
      ListCardsResponse,
      ListTasksResponse,
      UsageResponse,
      PingResponse,
    },
  },
  paths: {
    "/api/ping": {
      get: {
        operationId: "ping",
        tags: ["system"],
        security: [],
        summary: "Probe / outbox heartbeat",
        responses: ok(PingResponse),
      },
    },
    "/api/devices/register": {
      post: {
        operationId: "registerDevice",
        tags: ["devices"],
        summary: "Register or re-register a client device",
        requestBody: { required: true, ...json(RegisterDeviceRequest) },
        responses: ok(RegisterDeviceResponse),
      },
    },
    "/api/nodes": {
      post: {
        operationId: "createNodes",
        tags: ["nodes"],
        summary: "Batch-write nodes (sampling / feeding / offline queue)",
        requestBody: { required: true, ...json(CreateNodesRequest) },
        responses: ok(CreateNodesResponse),
      },
      get: {
        operationId: "listNodes",
        tags: ["nodes"],
        summary: "List nodes for a calendar day",
        requestParams: { query: DateQuery },
        responses: ok(ListNodesResponse),
      },
    },
    "/api/nodes/{id}": {
      delete: {
        operationId: "deleteNode",
        tags: ["nodes"],
        summary: "Delete a node and its derived edges / search index",
        requestParams: { path: IdPath },
        responses: { ...ok(DeleteNodeResponse), ...notFound },
      },
    },
    "/api/voice": {
      post: {
        operationId: "uploadVoice",
        tags: ["voice"],
        summary: "Upload audio; transcribe and store as a voice node",
        requestBody: {
          required: true,
          content: { "multipart/form-data": { schema: VoiceFormData } },
        },
        responses: ok(VoiceResponse),
      },
    },
    "/api/health": {
      post: {
        operationId: "postHealth",
        tags: ["health"],
        summary: "Report daily sleep / steps (idempotent per date)",
        security: [{ healthToken: [] }],
        requestBody: { required: true, ...json(HealthRequest) },
        responses: ok(HealthResponse),
      },
    },
    "/api/save": {
      post: {
        operationId: "saveToday",
        tags: ["save"],
        summary:
          "Nightly checkpoint: ferment, settle stats, write cards (idempotent per date)",
        requestBody: { required: true, ...json(SaveRequest) },
        responses: ok(SaveResponse),
      },
    },
    "/api/stats/today": {
      get: {
        operationId: "getStatsToday",
        tags: ["stats"],
        summary: "Live five-dimension stats + character state + collection status",
        requestParams: { query: DateQuery },
        responses: ok(StatsTodayResponse),
      },
    },
    "/api/profile": {
      get: {
        operationId: "getProfile",
        tags: ["profile"],
        summary: "Single-user space profile",
        responses: ok(UserProfile),
      },
      patch: {
        operationId: "patchProfile",
        tags: ["profile"],
        summary: "Update display name / profession / note",
        requestBody: { required: true, ...json(PatchUserProfileRequest) },
        responses: ok(UserProfile),
      },
    },
    "/api/usage": {
      get: {
        operationId: "getUsage",
        tags: ["usage"],
        summary: "Provider call and token aggregates (no content)",
        requestParams: { query: RangeQuery },
        responses: ok(UsageResponse),
      },
    },
    "/api/timeline": {
      get: {
        operationId: "getTimeline",
        tags: ["timeline"],
        summary: "Range or single-day timeline projection",
        requestParams: { query: TimelineQuery },
        responses: ok(TimelineResponse),
      },
    },
    "/api/days": {
      get: {
        operationId: "getDays",
        tags: ["stats"],
        summary: "Recent-day overview (saved flags, summaries, stats, streak)",
        requestParams: { query: DaysQuery },
        responses: ok(DaysResponse),
      },
    },
    "/api/search": {
      get: {
        operationId: "search",
        tags: ["search"],
        summary: "Global hybrid search (FTS + optional embedding RRF)",
        requestParams: { query: SearchQuery },
        responses: ok(SearchResponse),
      },
    },
    "/api/ask": {
      post: {
        operationId: "ask",
        tags: ["search"],
        summary: "RAG question over past records, answer with citations",
        requestBody: { required: true, ...json(AskRequest) },
        responses: ok(AskResponse),
      },
    },
    "/api/chat": {
      post: {
        operationId: "chat",
        tags: ["chat"],
        summary: "Input triage + workflow (idea / retrieval / question / task)",
        requestBody: { required: true, ...json(ChatRequest) },
        responses: ok(ChatResponse),
      },
    },
    "/api/messages": {
      get: {
        operationId: "listMessages",
        tags: ["chat"],
        summary: "Now conversation stream, newest first",
        requestParams: { query: MessagesQuery },
        responses: ok(ListMessagesResponse),
      },
    },
    "/api/messages/{id}/intent": {
      patch: {
        operationId: "patchMessageIntent",
        tags: ["chat"],
        summary: "Correct triage intent; optionally re-run the workflow",
        requestParams: { path: IdPath },
        requestBody: { required: true, ...json(PatchMessageIntentRequest) },
        responses: { ...ok(PatchMessageIntentFullResponse), ...notFound },
      },
    },
    "/api/cards": {
      get: {
        operationId: "listCards",
        tags: ["cards"],
        summary: "Before / future card stream with cursor pagination",
        requestParams: { query: CardsQuery },
        responses: ok(ListCardsResponse),
      },
    },
    "/api/tasks": {
      get: {
        operationId: "listTasks",
        tags: ["tasks"],
        summary: "List async tasks, optionally filtered by status",
        requestParams: { query: TasksQuery },
        responses: ok(ListTasksResponse),
      },
    },
    "/api/resume": {
      post: {
        operationId: "resume",
        tags: ["chat"],
        summary: "Short-break recap of the last few hours",
        requestBody: { required: true, ...json(ResumeRequest) },
        responses: ok(ResumeResponse),
      },
    },
    "/api/todos/{id}": {
      patch: {
        operationId: "patchTodo",
        tags: ["todos"],
        summary: "Check / uncheck a suggested todo",
        requestParams: { path: IdPath },
        requestBody: { required: true, ...json(PatchTodoRequest) },
        responses: { ...ok(PatchTodoResponse), ...notFound },
      },
    },
    "/api/todos/{id}/accept": {
      post: {
        operationId: "acceptTodo",
        tags: ["todos"],
        summary:
          "Adopt a suggestion after writing it to Apple Reminders (positive sample)",
        requestParams: { path: IdPath },
        requestBody: { required: false, ...json(AcceptTodoRequest) },
        responses: { ...ok(AcceptTodoResponse), ...notFound },
      },
    },
    "/api/todos/{id}/dismiss": {
      post: {
        operationId: "dismissTodo",
        tags: ["todos"],
        summary: "Reject a suggestion (negative sample for the preference loop)",
        requestParams: { path: IdPath },
        requestBody: { required: false, ...json(DismissTodoRequest) },
        responses: { ...ok(DismissTodoResponse), ...notFound },
      },
    },
  },
};

const doc = createDocument(document);
// scripts/ → packages/server → packages → repo root
const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
  "openapi.json",
);
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, "utf8");

const endpointCount = Object.keys(doc.paths ?? {}).reduce(
  (n, p) => n + Object.keys(doc.paths?.[p] ?? {}).length,
  0,
);
console.log(`openapi.json written to ${outPath} (${endpointCount} operations)`);
