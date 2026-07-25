import { z } from "zod";

/**
 * Structured JSON produced by the ferment LLM call (PRD v0.6 §6.3).
 * briefing/health_advice/ideas are v0.6 card outputs; opening_line kept for
 * back-compat with Continue/Save response shape.
 */
export const FermentResultSchema = z.object({
  summary: z.string().min(1).max(2000),
  /** One warm line for next-morning greeting / briefing headline. */
  opening_line: z.string().min(1).max(280),
  /** Longer briefing body for the briefing card (may equal summary). */
  briefing: z.string().min(1).max(4000).optional(),
  review_points: z
    .array(
      z.object({
        text: z.string().min(1).max(400),
        kind: z.enum(["win", "miss", "insight", "other"]).default("other"),
      }),
    )
    .max(12)
    .default([]),
  todos: z
    .array(
      z.object({
        text: z.string().min(1).max(300),
      }),
    )
    .max(20)
    .default([]),
  health_advice: z.string().max(800).optional().nullable(),
  ideas: z
    .array(
      z.object({
        text: z.string().min(1).max(400),
      }),
    )
    .max(12)
    .default([]),
  /** node_id → tags. Keys are server node UUIDs the model was given. */
  node_tags: z.record(z.array(z.string().max(40)).max(8)).default({}),
  /**
   * Cross-day (or same-day) links. src/dst are node UUIDs.
   * Continuity score uses edges that cross day boundaries.
   */
  edges: z
    .array(
      z.object({
        src_node_id: z.string().uuid(),
        dst_node_id: z.string().uuid(),
        relation: z.string().min(1).max(60),
      }),
    )
    .max(40)
    .default([]),
});
export type FermentResult = z.infer<typeof FermentResultSchema>;
