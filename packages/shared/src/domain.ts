import { z } from "zod";

/** Node kinds accepted by the system (PRD v0.6 §5.1 + git T1). */
export const NodeKind = z.enum([
  "text",
  "url",
  "voice",
  "save_note",
  "app_sample",
  "tab_sample",
  "agent_session",
  "git_commit",
  "email",
  "reminder",
  "vscode_recent",
  "browse_history",
  "health_daily",
  "snapshot",
  "todo_check",
  "idea",
  "image",
]);
export type NodeKind = z.infer<typeof NodeKind>;

/** AI todo suggestion lifecycle. Real checklist lives in Apple Reminders. */
export const TodoStatus = z.enum(["suggested", "accepted", "dismissed"]);
export type TodoStatus = z.infer<typeof TodoStatus>;

/** Active feeds count toward 摄取. Samples do not. */
export const ACTIVE_FEED_KINDS: readonly NodeKind[] = [
  "text",
  "url",
  "voice",
  "save_note",
  "idea",
  "image",
] as const;

/** Passive collection sources reported by the sampler or device integrations. */
export const SAMPLER_NODE_KINDS: readonly NodeKind[] = [
  "app_sample",
  "tab_sample",
  "agent_session",
  "git_commit",
  "email",
  "reminder",
  "vscode_recent",
  "browse_history",
  "health_daily",
  "snapshot",
] as const;

/** Chat triage intents (PRD F4). */
export const ChatIntent = z.enum(["idea", "retrieval", "question", "unknown"]);
export type ChatIntent = z.infer<typeof ChatIntent>;

export const MessageRole = z.enum(["user", "agent"]);
export type MessageRole = z.infer<typeof MessageRole>;

export const TaskType = z.enum(["meeting_notes", "image_extract", "generic"]);
export type TaskType = z.infer<typeof TaskType>;

export const TaskStatus = z.enum(["queued", "running", "done", "failed"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const CardType = z.enum(["briefing", "idea", "todo_suggestion", "health"]);
export type CardType = z.infer<typeof CardType>;

/** Sampler rhythm after Save (PRD F2). */
export const CadenceMode = z.enum(["active", "night"]);
export type CadenceMode = z.infer<typeof CadenceMode>;

export const IdeaProvenance = z.enum(["user", "auto"]);
export type IdeaProvenance = z.infer<typeof IdeaProvenance>;

export const CharacterState = z.enum([
  "tired",
  "productive",
  "focused",
  "inspired",
  "normal",
]);
export type CharacterState = z.infer<typeof CharacterState>;

/**
 * Day-role label for Daily Brief (deterministic from sessions / output signals).
 * Client should tolerate unknown values (new professions must not crash old apps).
 */
export const Profession = z.enum([
  "coder",
  "designer",
  "writer",
  "communicator",
  "explorer",
  "generalist",
]);
export type Profession = z.infer<typeof Profession>;

export const Platform = z.enum(["macos", "ios", "linux", "unknown"]);
export type Platform = z.infer<typeof Platform>;

/** Five-dimensional stats. All 0–100. Pure code, never LLM. */
export const StatsSchema = z.object({
  intake: z.number().min(0).max(100),
  focus: z.number().min(0).max(100),
  output: z.number().min(0).max(100),
  continuity: z.number().min(0).max(100),
  energy: z.number().min(0).max(100),
});
export type Stats = z.infer<typeof StatsSchema>;

export const EMPTY_STATS: Stats = {
  intake: 0,
  focus: 0,
  output: 0,
  continuity: 0,
  energy: 100,
};

/**
 * Per-day counters for client attribution templates (PRD drift §5.B).
 * Pure code at Save; never LLM. Client owns localized copy.
 */
export const DayStatsBreakdown = z.object({
  /** Intake template: idea / image / active feed / received mail. */
  idea_count: z.number().int().nonnegative(),
  image_count: z.number().int().nonnegative(),
  active_feed_count: z.number().int().nonnegative(),
  email_received: z.number().int().nonnegative(),
  /** Output template: todos done/total, agent hours, commits, sent mail. */
  todo_completed: z.number().int().nonnegative(),
  todo_total: z.number().int().nonnegative(),
  agent_duration_min: z.number().nonnegative(),
  git_commit_count: z.number().int().nonnegative(),
  email_sent: z.number().int().nonnegative(),
  /** Focus template: longest contiguous work session (minutes). */
  longest_session_min: z.number().nonnegative(),
  /** Energy template: optional health signals. */
  sleep_minutes: z.number().int().nonnegative().nullable(),
  steps: z.number().int().nonnegative().nullable(),
  /** Continuity template. */
  cross_day_edges: z.number().int().nonnegative(),
});
export type DayStatsBreakdown = z.infer<typeof DayStatsBreakdown>;

export const EMPTY_BREAKDOWN: DayStatsBreakdown = {
  idea_count: 0,
  image_count: 0,
  active_feed_count: 0,
  email_received: 0,
  todo_completed: 0,
  todo_total: 0,
  agent_duration_min: 0,
  git_commit_count: 0,
  email_sent: 0,
  longest_session_min: 0,
  sleep_minutes: null,
  steps: null,
  cross_day_edges: 0,
};

/** Timeline item geometry (PRD §3.2). */
export const TimelineShape = z.enum(["point", "span"]);
export type TimelineShape = z.infer<typeof TimelineShape>;

export const TimelineImportance = z.enum(["ambient", "normal", "major"]);
export type TimelineImportance = z.infer<typeof TimelineImportance>;

/** Who originated the timeline item (sample vs user input vs derived). */
export const TimelineRole = z.enum(["input", "sample", "derived", "system"]);
export type TimelineRole = z.infer<typeof TimelineRole>;

/** Aggregated app / agent session. */
export const SessionSchema = z.object({
  app: z.string(),
  kind: z.enum(["app", "agent"]),
  start: z.string().datetime(),
  end: z.string().datetime(),
  durationMin: z.number().nonnegative(),
  meta: z.record(z.unknown()).optional(),
});
export type Session = z.infer<typeof SessionSchema>;
