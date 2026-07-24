/**
 * Pluggable sampler sources.
 *
 * Each source owns its full pipeline: collect → map → in-process dedupe →
 * NodeInput[]. The orchestrator (collect.ts) never knows feature internals.
 */
import type { NodeInput } from "@return/shared";

export { uuidFromSeed } from "@return/shared";

/** Shared clock / mode for one sample tick. */
export interface SampleContext {
  /** ISO timestamp of this sample tick. */
  at: string;
  platform: NodeJS.Platform;
  /**
   * true = Save Today / end-of-day flush.
   * Sources may emit provisional data they would otherwise withhold
   * (e.g. still-open agent intervals).
   */
  asSnapshot: boolean;
}

/** Result of one source for one tick. */
export interface SourceResult {
  nodes: NodeInput[];
  /** Compact counters for logs / status (source-defined keys). */
  stats: Record<string, number>;
}

/**
 * A self-contained sampler source.
 * Failures are the orchestrator's concern — implementors may throw;
 * collect.ts catches per-source so one bad source never kills a tick.
 */
export interface SampleSource {
  readonly id: string;
  sample(ctx: SampleContext): Promise<SourceResult>;
}

/** Local calendar day YYYY-MM-DD. */
export function todayLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Process-lifetime string dedupe with a soft cap (drop oldest half when over).
 * Each source keeps its own instance — no cross-source key collisions.
 */
export function createKeyDedupe(cap = 500, keep = 200) {
  const seen = new Set<string>();
  return {
    /** true if first time; false if already seen. */
    tryAdd(key: string): boolean {
      if (seen.has(key)) return false;
      seen.add(key);
      if (seen.size > cap) {
        const retain = [...seen].slice(-keep);
        seen.clear();
        for (const k of retain) seen.add(k);
      }
      return true;
    },
    clear(): void {
      seen.clear();
    },
    get size(): number {
      return seen.size;
    },
  };
}

export type KeyDedupe = ReturnType<typeof createKeyDedupe>;
