import { z } from "zod";
import {
  CadenceMode,
  CardType,
  CharacterState,
  ChatIntent,
  DayStatsBreakdown,
  IdeaProvenance,
  MessageRole,
  NodeKind,
  Platform,
  Profession,
  StatsSchema,
  TaskStatus,
  TaskType,
  TimelineImportance,
  TimelineRole,
  TimelineShape,
  TodoStatus,
} from "./domain.js";

// ── devices ──────────────────────────────────────────────

export const RegisterDeviceRequest = z.object({
  name: z.string().min(1).max(120),
  platform: Platform.default("unknown"),
  /** Optional stable client-side id; if provided and known, reuses it. */
  device_id: z.string().uuid().optional(),
});
export type RegisterDeviceRequest = z.infer<typeof RegisterDeviceRequest>;

export const RegisterDeviceResponse = z.object({
  device_id: z.string().uuid(),
});
export type RegisterDeviceResponse = z.infer<typeof RegisterDeviceResponse>;

// ── nodes ────────────────────────────────────────────────

export const NodeInput = z.object({
  client_uuid: z.string().uuid(),
  kind: NodeKind,
  title: z.string().max(500).optional().nullable(),
  content: z.string().optional().nullable(),
  source_meta: z.record(z.unknown()).optional().nullable(),
  /** Client-local timestamp, stored in source_meta only; server stamps created_at. */
  client_created_at: z.string().datetime().optional(),
  /** Optional day override (YYYY-MM-DD). Default: server local day of receipt. */
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type NodeInput = z.infer<typeof NodeInput>;

export const CreateNodesRequest = z.object({
  device_id: z.string().uuid(),
  nodes: z.array(NodeInput).min(1).max(500),
});
export type CreateNodesRequest = z.infer<typeof CreateNodesRequest>;

export const NodeRecord = z.object({
  id: z.string().uuid(),
  day_id: z.string().uuid(),
  device_id: z.string().uuid().nullable(),
  kind: NodeKind,
  title: z.string().nullable(),
  content: z.string().nullable(),
  source_meta: z.record(z.unknown()).nullable(),
  client_uuid: z.string().uuid(),
  created_at: z.string().datetime(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});
export type NodeRecord = z.infer<typeof NodeRecord>;

export const CreateNodesResponse = z.object({
  created: z.array(NodeRecord),
  /** client_uuids that already existed (idempotent replay). */
  duplicates: z.array(z.string().uuid()),
  /** Sampler rhythm hint (PRD F2) — active daytime vs night after Save. */
  cadence: CadenceMode.optional(),
});
export type CreateNodesResponse = z.infer<typeof CreateNodesResponse>;

export const ListNodesResponse = z.object({
  date: z.string(),
  nodes: z.array(NodeRecord),
});
export type ListNodesResponse = z.infer<typeof ListNodesResponse>;

// ── voice ────────────────────────────────────────────────

export const VoiceResponse = z.object({
  node: NodeRecord,
  transcript: z.string(),
});
export type VoiceResponse = z.infer<typeof VoiceResponse>;

// ── health ───────────────────────────────────────────────

export const HealthRequest = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  sleep_minutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60),
  steps: z.number().int().min(0).max(200_000),
});
export type HealthRequest = z.infer<typeof HealthRequest>;

export const HealthResponse = z.object({
  node: NodeRecord,
});
export type HealthResponse = z.infer<typeof HealthResponse>;

// ── save ─────────────────────────────────────────────────

export const SaveRequest = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  device_id: z.string().uuid().optional(),
  note_text: z.string().max(4000).optional(),
  /** client_uuid of a previously uploaded voice node to use as save note. */
  note_voice_ref: z.string().uuid().optional(),
});
export type SaveRequest = z.infer<typeof SaveRequest>;

export const ReviewPoint = z.object({
  text: z.string(),
  kind: z.enum(["win", "miss", "insight", "other"]).default("other"),
});
export type ReviewPoint = z.infer<typeof ReviewPoint>;

export const TodoRecord = z.object({
  id: z.string().uuid(),
  day_id: z.string().uuid(),
  text: z.string(),
  /** Compat: true when status=accepted (or legacy PATCH). Real checklist = Reminders. */
  done: z.boolean(),
  status: TodoStatus,
  source_node_id: z.string().uuid().nullable(),
  accepted_reminder_id: z.string().nullable(),
  accepted_at: z.string().datetime().nullable(),
  dismissed_at: z.string().datetime().nullable(),
});
export type TodoRecord = z.infer<typeof TodoRecord>;

export const EdgeRecord = z.object({
  id: z.string().uuid(),
  src_node_id: z.string().uuid(),
  dst_node_id: z.string().uuid(),
  relation: z.string(),
  created_by_day_id: z.string().uuid(),
});
export type EdgeRecord = z.infer<typeof EdgeRecord>;

export const SaveResponse = z.object({
  day_id: z.string().uuid(),
  date: z.string(),
  saved_at: z.string().datetime(),
  already_saved: z.boolean(),
  summary: z.string().nullable(),
  opening_line: z.string().nullable(),
  briefing: z.string().nullable().optional(),
  review_points: z.array(ReviewPoint),
  todos: z.array(TodoRecord),
  stats: StatsSchema,
  character_state: CharacterState,
  streak: z.number().int().nonnegative(),
  edges_created: z.number().int().nonnegative(),
  cards_created: z.number().int().nonnegative().optional(),
  cadence: CadenceMode.optional(),
});
export type SaveResponse = z.infer<typeof SaveResponse>;

// ── stats / timeline / days ──────────────────────────────

export const CollectionStatus = z.object({
  device_count: z.number().int().nonnegative(),
  sample_count: z.number().int().nonnegative(),
  last_seen_at: z.string().datetime().nullable(),
});
export type CollectionStatus = z.infer<typeof CollectionStatus>;

export const StatsTodayResponse = z.object({
  date: z.string(),
  stats: StatsSchema,
  character_state: CharacterState,
  saved: z.boolean(),
  collection: CollectionStatus,
  cadence: CadenceMode.optional(),
});
export type StatsTodayResponse = z.infer<typeof StatsTodayResponse>;

/** Typed navigation target for a timeline item (PRD §3.2.7). */
export const TimelineDestination = z.discriminatedUnion("type", [
  z.object({ type: z.literal("none") }),
  z.object({
    type: z.literal("after"),
    result_id: z.string().uuid(),
  }),
  z.object({
    type: z.literal("timeline_cluster"),
    cluster_id: z.string().min(1),
  }),
  z.object({
    type: z.literal("daily_briefing"),
    briefing_id: z.string().uuid(),
  }),
]);
export type TimelineDestination = z.infer<typeof TimelineDestination>;

/** Compact child row shown inside a cluster segment. */
export const TimelineClusterChild = z.object({
  id: z.string().min(1),
  label: z.string(),
  start: z.string().datetime(),
  node_id: z.string().uuid().optional(),
});
export type TimelineClusterChild = z.infer<typeof TimelineClusterChild>;

/**
 * Timeline projection item (PRD F7 / §3.2).
 * Stable `id` survives refresh; `shape`/`importance` drive density;
 * clusters and daily_briefing rows carry typed destinations.
 */
export const TimelineSegment = z.object({
  /** Stable across refresh/devices for the same underlying event. */
  id: z.string().min(1),
  kind: z.enum(["app", "agent", "sleep", "feed", "cluster", "briefing"]),
  shape: TimelineShape,
  importance: TimelineImportance,
  role: TimelineRole.optional(),
  /** Present when the segment represents an idea (user vs auto). */
  provenance: IdeaProvenance.optional(),
  start: z.string().datetime(),
  end: z.string().datetime(),
  label: z.string(),
  category: z.string().optional(),
  node_id: z.string().uuid().optional(),
  meta: z.record(z.unknown()).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  /** Cluster identity (kind=cluster or destination). */
  cluster_id: z.string().optional(),
  /** All child segment ids in the cluster (for drill-down). */
  child_ids: z.array(z.string()).optional(),
  child_count: z.number().int().nonnegative().optional(),
  /** 2–3 representative children for the collapsed face. */
  children: z.array(TimelineClusterChild).max(3).optional(),
  destination: TimelineDestination.optional(),
});
export type TimelineSegment = z.infer<typeof TimelineSegment>;

export const TimelineResponse = z.object({
  /** Primary day (when single-day query) or range start. */
  date: z.string(),
  from: z.string().optional(),
  to: z.string().optional(),
  segments: z.array(TimelineSegment),
});
export type TimelineResponse = z.infer<typeof TimelineResponse>;

/**
 * Typed content of a `briefing` CardRecord (Daily Brief card group payload).
 * Written by Save; clients decode for Now / historical brief.
 */
export const BriefingCardContent = z.object({
  summary: z.string(),
  opening_line: z.string(),
  briefing: z.string().optional(),
  review_points: z.array(ReviewPoint),
  stats: StatsSchema,
  character_state: CharacterState,
  node_ids: z.array(z.string().uuid()),
  /** Deterministic day-role label (not LLM). */
  profession: Profession,
  /** Consecutive saved-day streak as of this save (PRD §4.3). */
  streak: z.number().int().nonnegative(),
  /** Counters for client attribution templates. */
  breakdown: DayStatsBreakdown,
});
export type BriefingCardContent = z.infer<typeof BriefingCardContent>;

export const DaySummary = z.object({
  date: z.string(),
  saved_at: z.string().datetime().nullable(),
  summary: z.string().nullable(),
  stats: StatsSchema.nullable(),
  character_state: CharacterState.nullable(),
});
export type DaySummary = z.infer<typeof DaySummary>;

export const DaysResponse = z.object({
  range: z.number().int(),
  days: z.array(DaySummary),
  streak: z.number().int().nonnegative(),
});
export type DaysResponse = z.infer<typeof DaysResponse>;

// ── todos ────────────────────────────────────────────────

export const PatchTodoRequest = z.object({
  done: z.boolean(),
  device_id: z.string().uuid().optional(),
});
export type PatchTodoRequest = z.infer<typeof PatchTodoRequest>;

export const PatchTodoResponse = z.object({
  todo: TodoRecord,
  check_node: NodeRecord.nullable(),
});
export type PatchTodoResponse = z.infer<typeof PatchTodoResponse>;

/** UI wrote Reminder via EventKit, then reports accept (positive sample). */
export const AcceptTodoRequest = z.object({
  device_id: z.string().uuid().optional(),
  /** Apple Reminders id when known; optional — text match can link later. */
  reminder_id: z.string().min(1).max(500).optional(),
});
export type AcceptTodoRequest = z.infer<typeof AcceptTodoRequest>;

export const AcceptTodoResponse = z.object({
  todo: TodoRecord,
});
export type AcceptTodoResponse = z.infer<typeof AcceptTodoResponse>;

export const DismissTodoRequest = z.object({
  device_id: z.string().uuid().optional(),
});
export type DismissTodoRequest = z.infer<typeof DismissTodoRequest>;

export const DismissTodoResponse = z.object({
  todo: TodoRecord,
});
export type DismissTodoResponse = z.infer<typeof DismissTodoResponse>;

// ── ping ─────────────────────────────────────────────────

export const PingResponse = z.object({
  ok: z.literal(true),
  server_time: z.string().datetime(),
  version: z.string(),
  /** Sampler rhythm without a node upload (PRD F2 midnight restore). */
  cadence: CadenceMode.optional(),
});
export type PingResponse = z.infer<typeof PingResponse>;

// ── search / ask (global search PRD) ──────────────────────

export const SearchHit = z.object({
  doc_id: z.string().min(1),
  kind: z.string(),
  score: z.number(),
  snippet: z.string(),
  node: NodeRecord.nullable(),
  day: DaySummary.nullable(),
});
export type SearchHit = z.infer<typeof SearchHit>;

export const SearchResponse = z.object({
  query: z.string(),
  took_ms: z.number().int().nonnegative(),
  results: z.array(SearchHit),
});
export type SearchResponse = z.infer<typeof SearchResponse>;

export const AskRequest = z.object({
  question: z.string().min(1).max(500),
  from: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  to: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export type AskRequest = z.infer<typeof AskRequest>;

export const AskCitation = z.object({
  node_id: z.string().uuid().nullable(),
  date: z.string(),
  kind: z.string(),
  title: z.string().nullable(),
  snippet: z.string(),
});
export type AskCitation = z.infer<typeof AskCitation>;

export const AskResponse = z.object({
  answer: z.string(),
  citations: z.array(AskCitation),
  retrieved: z.number().int().nonnegative(),
});
export type AskResponse = z.infer<typeof AskResponse>;

// ── messages / chat / resume (PRD v0.6 §6.2) ──────────────

export const MessageRecord = z.object({
  id: z.string().uuid(),
  role: MessageRole,
  content: z.string(),
  intent: ChatIntent.nullable(),
  task_id: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
  meta: z.record(z.unknown()).nullable().optional(),
});
export type MessageRecord = z.infer<typeof MessageRecord>;

export const ChatRequest = z.object({
  text: z.string().min(1).max(8000).optional(),
  /** Reserved for image task path; base64 or URL in meta for now. */
  image: z.string().max(50_000).optional(),
  device_id: z.string().uuid().optional(),
  /** Force intent (user correction / unknown pick). */
  intent: ChatIntent.optional(),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatResponse = z.object({
  message_id: z.string().uuid(),
  user_message_id: z.string().uuid(),
  intent: ChatIntent,
  confidence: z.number().min(0).max(1),
  reply: z.string(),
  /** Retrieval jump targets (F10). */
  jump: z
    .object({
      date: z.string(),
      node_ids: z.array(z.string().uuid()),
    })
    .nullable()
    .optional(),
  task_id: z.string().uuid().nullable().optional(),
});
export type ChatResponse = z.infer<typeof ChatResponse>;

export const PatchMessageIntentRequest = z.object({
  intent: ChatIntent,
});
export type PatchMessageIntentRequest = z.infer<typeof PatchMessageIntentRequest>;

export const PatchMessageIntentResponse = z.object({
  message: MessageRecord,
});
export type PatchMessageIntentResponse = z.infer<typeof PatchMessageIntentResponse>;

export const ListMessagesResponse = z.object({
  messages: z.array(MessageRecord),
  next_cursor: z.string().nullable(),
});
export type ListMessagesResponse = z.infer<typeof ListMessagesResponse>;

export const ResumeRequest = z.object({
  device_id: z.string().uuid().optional(),
  /** Look-back window hours (default 3). */
  hours: z.number().int().min(1).max(24).optional(),
});
export type ResumeRequest = z.infer<typeof ResumeRequest>;

export const ResumeResponse = z.object({
  message_id: z.string().uuid(),
  reply: z.string(),
});
export type ResumeResponse = z.infer<typeof ResumeResponse>;

// ── provider usage ───────────────────────────────────────

export const UsageKind = z.enum(["llm", "transcription", "vision", "embedding"]);
export type UsageKind = z.infer<typeof UsageKind>;

export const UsageTotals = z.object({
  calls: z.number().int().nonnegative(),
  succeeded: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
});
export type UsageTotals = z.infer<typeof UsageTotals>;

export const UsageBreakdown = UsageTotals.extend({
  kind: UsageKind,
  operation: z.string().min(1),
  model: z.string().min(1),
});
export type UsageBreakdown = z.infer<typeof UsageBreakdown>;

export const UsageResponse = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  totals: UsageTotals,
  breakdown: z.array(UsageBreakdown),
});
export type UsageResponse = z.infer<typeof UsageResponse>;

// ── tasks ────────────────────────────────────────────────

export const TaskRecord = z.object({
  id: z.string().uuid(),
  type: TaskType,
  status: TaskStatus,
  input: z.record(z.unknown()),
  result_message_id: z.string().uuid().nullable(),
  created_at: z.string().datetime(),
  finished_at: z.string().datetime().nullable(),
});
export type TaskRecord = z.infer<typeof TaskRecord>;

export const ListTasksResponse = z.object({
  tasks: z.array(TaskRecord),
});
export type ListTasksResponse = z.infer<typeof ListTasksResponse>;

// ── cards ────────────────────────────────────────────────

export const CardRecord = z.object({
  id: z.string().uuid(),
  type: CardType,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  content: z.record(z.unknown()),
  created_at: z.string().datetime(),
});
export type CardRecord = z.infer<typeof CardRecord>;

export const ListCardsResponse = z.object({
  direction: z.enum(["before", "future"]),
  cards: z.array(CardRecord),
  next_cursor: z.string().nullable(),
});
export type ListCardsResponse = z.infer<typeof ListCardsResponse>;
