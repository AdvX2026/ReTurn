import type { DayRow } from "../db/repo.js";
import { addDays, todayDate } from "../util/time.js";

/**
 * Streak = consecutive saved days ending at the most recent saved day
 * that is today or yesterday (so missing "today not yet saved" doesn't break it).
 */
export function computeStreak(savedDates: string[], asOf: string = todayDate()): number {
  if (savedDates.length === 0) return 0;
  const set = new Set(savedDates);
  // Start from asOf if saved, else yesterday.
  let cursor = set.has(asOf) ? asOf : addDays(asOf, -1);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak++;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function savedDatesFromDays(days: DayRow[]): string[] {
  return days.filter((d) => d.saved_at).map((d) => d.date);
}
