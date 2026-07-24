/**
 * Pluggable sampler sources.
 *
 * Each source owns its full pipeline: collect → map → in-process dedupe →
 * NodeInput[]. The orchestrator (collect.ts) never knows feature internals.
 */
import { createHash } from "node:crypto";
import type { NodeInput } from "@return/shared";

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

/** Stable UUIDv4-shaped id from seed — survives sampler restarts. */
export function uuidFromSeed(seed: string): string {
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
