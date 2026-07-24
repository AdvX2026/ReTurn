import { z } from "zod";
import { CharacterState, NodeKind, Platform, StatsSchema } from "./domain.js";

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
  done: z.boolean(),
  source_node_id: z.string().uuid().nullable(),
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
  degraded: z.boolean(),
  summary: z.string().nullable(),
  opening_line: z.string().nullable(),
  review_points: z.array(ReviewPoint),
  todos: z.array(TodoRecord),
  stats: StatsSchema,
  character_state: CharacterState,
  streak: z.number().int().nonnegative(),
  edges_created: z.number().int().nonnegative(),
});
export type SaveResponse = z.infer<typeof SaveResponse>;

// ── continue ─────────────────────────────────────────────

export const ContinueResponse = z.object({
  /** The day whose Before is shown (yesterday if available). */
  before: z
    .object({
      date: z.string(),
      opening_line: z.string().nullable(),
      summary: z.string().nullable(),
      review_points: z.array(ReviewPoint),
      stats: StatsSchema.nullable(),
      character_state: CharacterState.nullable(),
      stats_delta: StatsSchema.nullable(),
    })
    .nullable(),
  /** Today: todos + live character. */
  future: z.object({
    date: z.string(),
    todos: z.array(TodoRecord),
  }),
  character_state: CharacterState,
  stats: StatsSchema,
  streak: z.number().int().nonnegative(),
  is_cold_start: z.boolean(),
});
export type ContinueResponse = z.infer<typeof ContinueResponse>;

// ── stats / timeline / days ──────────────────────────────

export const StatsTodayResponse = z.object({
  date: z.string(),
  stats: StatsSchema,
  character_state: CharacterState,
  saved: z.boolean(),
});
export type StatsTodayResponse = z.infer<typeof StatsTodayResponse>;

export const TimelineSegment = z.object({
  kind: z.enum(["app", "agent", "sleep", "feed"]),
  start: z.string().datetime(),
  end: z.string().datetime(),
  label: z.string(),
  category: z.string().optional(),
  node_id: z.string().uuid().optional(),
  meta: z.record(z.unknown()).optional(),
});
export type TimelineSegment = z.infer<typeof TimelineSegment>;

export const TimelineResponse = z.object({
  date: z.string(),
  segments: z.array(TimelineSegment),
});
export type TimelineResponse = z.infer<typeof TimelineResponse>;

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

// ── ping ─────────────────────────────────────────────────

export const PingResponse = z.object({
  ok: z.literal(true),
  server_time: z.string().datetime(),
  version: z.string(),
});
export type PingResponse = z.infer<typeof PingResponse>;
