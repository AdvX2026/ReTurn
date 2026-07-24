import { z } from "zod";

/** Node kinds accepted by the system (PRD §5.1). */
export const NodeKind = z.enum([
  "text",
  "url",
  "voice",
  "save_note",
  "app_sample",
  "tab_sample",
  "agent_session",
  "git_commit",
  "health_daily",
  "snapshot",
  "todo_check",
  "idea",
  "image",
  "reminder",
]);
export type NodeKind = z.infer<typeof NodeKind>;

/** Chat triage intents (PRD F4). null = not a triage message. */
export const MessageIntent = z.enum(["idea", "retrieval", "question", "task"]);
export type MessageIntent = z.infer<typeof MessageIntent>;

export const MessageRole = z.enum(["user", "agent"]);
export type MessageRole = z.infer<typeof MessageRole>;

export const TaskStatus = z.enum(["queued", "running", "done", "failed"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const TaskType = z.enum(["notes", "image", "other"]);
export type TaskType = z.infer<typeof TaskType>;

export const CardType = z.enum([
  "briefing",
  "idea",
  "todo_suggestion",
  "health",
  "weekly",
]);
export type CardType = z.infer<typeof CardType>;

/** Sampler pace after Save (PRD F2). */
export const PaceMode = z.enum(["day", "night"]);
export type PaceMode = z.infer<typeof PaceMode>;

/** Active feeds count toward 摄取. Samples do not. */
export const ACTIVE_FEED_KINDS: readonly NodeKind[] = [
  "text",
  "url",
  "voice",
  "save_note",
  "idea",
] as const;

export const CharacterState = z.enum([
  "tired",
  "productive",
  "focused",
  "inspired",
  "normal",
]);
export type CharacterState = z.infer<typeof CharacterState>;

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
