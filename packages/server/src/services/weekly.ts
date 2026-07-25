/**
 * Weekly recap card (PRD P1): narrative week summary on Save.
 * Triggers: every 7th sealed day, or a Sunday Save. One card per week_end date.
 */
import type {
  Profession,
  ReviewPoint,
  Stats,
  WeeklyCardContent,
  WeeklyFermentResult,
} from "@return/shared";
import { WeeklyFermentResultSchema } from "@return/shared";
import { extractJson, llmChat } from "../ai/llm.js";
import {
  type DayRow,
  getCardByTypeDate,
  insertCard,
  listSavedDays,
} from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { addDays, parseDate } from "../util/time.js";

const WEEK_LEN = 7;

export class WeeklyFermentError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "WeeklyFermentError";
  }
}

/** Inclusive calendar window ending on `weekEnd` (7 days). */
export function weekWindow(weekEnd: string): { week_start: string; week_end: string } {
  return { week_start: addDays(weekEnd, -(WEEK_LEN - 1)), week_end: weekEnd };
}

/**
 * Produce a weekly card when:
 * - local day-of-week is Sunday, or
 * - total sealed days (including today) is a positive multiple of 7,
 * and no weekly card already exists for this week_end date.
 */
export function shouldProduceWeekly(db: Db, weekEnd: string): boolean {
  if (getCardByTypeDate(db, "weekly", weekEnd)) return false;
  const isSunday = parseDate(weekEnd).getDay() === 0;
  const saved = listSavedDays(db, "1970-01-01");
  // Caller may have just sealed today — count it even if list is slightly stale.
  const dates = new Set(saved.map((d) => d.date));
  dates.add(weekEnd);
  const everySeventh = dates.size > 0 && dates.size % WEEK_LEN === 0;
  return isSunday || everySeventh;
}

export function daysInWeekWindow(db: Db, weekEnd: string): DayRow[] {
  const { week_start } = weekWindow(weekEnd);
  return listSavedDays(db, week_start).filter((d) => d.date <= weekEnd);
}

export function averageStats(days: DayRow[]): Stats | null {
  const parsed: Stats[] = [];
  for (const d of days) {
    if (!d.stats_json) continue;
    try {
      const s = JSON.parse(d.stats_json) as Stats;
      if (
        typeof s.intake === "number" &&
        typeof s.focus === "number" &&
        typeof s.output === "number" &&
        typeof s.continuity === "number" &&
        typeof s.energy === "number"
      ) {
        parsed.push(s);
      }
    } catch {
      // skip bad row
    }
  }
  if (parsed.length === 0) return null;
  const n = parsed.length;
  return {
    intake: Math.round(parsed.reduce((a, s) => a + s.intake, 0) / n),
    focus: Math.round(parsed.reduce((a, s) => a + s.focus, 0) / n),
    output: Math.round(parsed.reduce((a, s) => a + s.output, 0) / n),
    continuity: Math.round(parsed.reduce((a, s) => a + s.continuity, 0) / n),
    energy: Math.round(parsed.reduce((a, s) => a + s.energy, 0) / n),
  };
}

/**
 * One LLM call → weekly narrative JSON. Timeout + single retry + Zod.
 * Failures are thrown; Save should catch and not unseal the day.
 */
export async function runWeeklyFerment(
  db: Db,
  input: {
    week_start: string;
    week_end: string;
    daySummaries: Array<{ date: string; summary: string }>;
    profileProfession?: string | null;
  },
): Promise<WeeklyFermentResult> {
  const prompt = buildWeeklyPrompt(input);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await llmChat(db, {
        operation: "weekly_ferment",
        kind: "llm",
        system:
          "You are the weekly recap engine of ReTurn. Output only compact JSON. No markdown fences. No scores.",
        user: prompt,
        temperature: 0.4,
        json: true,
      });
      const parsed = extractJson(raw);
      const result = WeeklyFermentResultSchema.safeParse(parsed);
      if (!result.success) {
        throw new WeeklyFermentError(
          `Zod validation failed: ${result.error.message}`,
          result.error,
        );
      }
      return result.data;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) continue;
    }
  }
  throw new WeeklyFermentError("weekly ferment failed after retry", lastErr);
}

function buildWeeklyPrompt(input: {
  week_start: string;
  week_end: string;
  daySummaries: Array<{ date: string; summary: string }>;
  profileProfession?: string | null;
}): string {
  const days = input.daySummaries
    .map((d) => `- ${d.date}: ${d.summary}`)
    .join("\n");
  return `Write a short narrative weekly recap for a personal second-brain user.

Rules:
- Output ONLY valid JSON matching the schema. No markdown fences.
- summary: 3–8 sentences covering the week as a story (not a day-by-day list dump).
- opening_line: one warm sentence as the week headline.
- highlights: 2–6 concrete wins/misses/insights across the week.
- Do NOT invent events missing from the day summaries. If few days, keep it short and honest.
- Do not invent numeric scores or attributes.

Schema:
{
  "summary": string,
  "opening_line": string,
  "highlights": [{"text": string, "kind": "win"|"miss"|"insight"|"other"}]
}

Week: ${input.week_start} → ${input.week_end}
Profession (tone only): ${input.profileProfession ?? "generalist"}

Day summaries (saved days only):
${days || "(none — empty week)"}
`;
}

/**
 * After a successful daily Save: maybe produce a weekly card.
 * Returns 1 if a card was inserted, 0 otherwise (skip or soft-fail).
 */
export async function maybeInsertWeeklyCard(
  db: Db,
  weekEnd: string,
  opts: {
    profession: Profession;
    profileProfession?: string | null;
  },
): Promise<number> {
  if (!shouldProduceWeekly(db, weekEnd)) return 0;

  const { week_start, week_end } = weekWindow(weekEnd);
  const days = daysInWeekWindow(db, weekEnd);
  const daySummaries = days
    .filter((d) => d.summary)
    .map((d) => ({ date: d.date, summary: d.summary! }));

  let ferment: WeeklyFermentResult;
  try {
    ferment = await runWeeklyFerment(db, {
      week_start,
      week_end,
      daySummaries,
      profileProfession: opts.profileProfession ?? opts.profession,
    });
  } catch (err) {
    // Daily save already sealed — weekly is best-effort (P1).
    console.error("[weekly] ferment failed (day remains saved):", err);
    return 0;
  }

  // Re-check idempotency after async gap.
  if (getCardByTypeDate(db, "weekly", weekEnd)) return 0;

  const content: WeeklyCardContent = {
    week_start,
    week_end,
    summary: ferment.summary,
    opening_line: ferment.opening_line,
    highlights: ferment.highlights as ReviewPoint[],
    day_dates: days.map((d) => d.date),
    stats_avg: averageStats(days),
    profession: opts.profession,
  };
  insertCard(db, {
    type: "weekly",
    date: week_end,
    content,
  });
  return 1;
}
