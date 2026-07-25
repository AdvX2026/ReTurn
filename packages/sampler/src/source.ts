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
  /** IANA timezone used by every source for this tick. */
  timezone: string;
  /** Calendar day in `timezone`. */
  day: string;
  /** Inclusive UTC ISO boundary for `day`. */
  dayStart: string;
  /** Exclusive UTC ISO boundary for `day`. */
  dayEnd: string;
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

/** Calendar day YYYY-MM-DD in an explicit IANA timezone. */
export function dateInTimeZone(d: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(d);
  const value = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new Error(`timezone formatter omitted ${type}`);
    return part.value;
  };
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function addCalendarDay(day: string): string {
  const [year, month, date] = day.split("-").map(Number);
  const next = new Date(Date.UTC(year!, month! - 1, date! + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(
    2,
    "0",
  )}-${String(next.getUTCDate()).padStart(2, "0")}`;
}

/** Convert midnight in an IANA timezone to an absolute timestamp. */
export function zonedDayStart(day: string, timezone: string): Date {
  const [year, month, date] = day.split("-").map(Number);
  if (!year || !month || !date) throw new Error(`invalid sampler day: ${day}`);
  const target = Date.UTC(year, month - 1, date);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(guess));
    const number = (type: Intl.DateTimeFormatPartTypes) =>
      Number(parts.find((part) => part.type === type)?.value);
    const observed = Date.UTC(
      number("year"),
      number("month") - 1,
      number("day"),
      number("hour"),
      number("minute"),
      number("second"),
    );
    guess += target - observed;
  }
  return new Date(guess);
}

export function createSampleContext(opts: {
  now?: Date;
  timezone: string;
  asSnapshot?: boolean;
  platform?: NodeJS.Platform;
}): SampleContext {
  const now = opts.now ?? new Date();
  const day = dateInTimeZone(now, opts.timezone);
  return {
    at: now.toISOString(),
    timezone: opts.timezone,
    day,
    dayStart: zonedDayStart(day, opts.timezone).toISOString(),
    dayEnd: zonedDayStart(addCalendarDay(day), opts.timezone).toISOString(),
    platform: opts.platform ?? process.platform,
    asSnapshot: Boolean(opts.asSnapshot),
  };
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
