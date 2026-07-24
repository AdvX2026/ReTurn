/** Local calendar day helpers. Server local TZ is the day authority (PRD §9.10). */

export function todayDate(d: Date = new Date()): string {
  return formatDate(d);
}

export function formatDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDate(date: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  if (!y || !m || !d) throw new Error(`invalid date: ${date}`);
  return new Date(y, m - 1, d);
}

export function addDays(date: string, delta: number): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + delta);
  return formatDate(d);
}

export function yesterdayDate(d: Date = new Date()): string {
  return addDays(todayDate(d), -1);
}

export function nowIso(d: Date = new Date()): string {
  return d.toISOString();
}

/** Inclusive list of dates from start..end (YYYY-MM-DD). */
export function dateRange(start: string, end: string): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addDays(cur, 1);
  }
  return out;
}

/** Last N calendar days ending at `end` (inclusive). */
export function lastNDays(n: number, end: string = todayDate()): string[] {
  return dateRange(addDays(end, -(n - 1)), end);
}

export function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function uuid(): string {
  return crypto.randomUUID();
}
