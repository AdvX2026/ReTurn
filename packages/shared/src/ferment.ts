import { z } from "zod";

/**
 * Structured JSON produced by the ferment LLM call (PRD §6.3).
 * Frozen at T+6h — frontend / prompt / data layer contract.
 */
export const FermentResultSchema = z.object({
  summary: z.string().min(1).max(2000),
  opening_line: z.string().min(1).max(280),
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
