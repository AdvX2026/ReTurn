import type { NodeRecord, TimelineResponse, TimelineSegment } from "@return/shared";
import { config } from "../config.js";
import { listNodesByDate } from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { extractHealth } from "../stats/compute.js";
import { allSessions, nodeEventTime } from "../stats/sessions.js";
import { parseDate } from "../util/time.js";

/** App → coarse category for timeline coloring. */
const CATEGORY_MAP: Array<{ test: RegExp; category: string }> = [
  { test: /chrome|safari|firefox|edge|arc|brave/i, category: "browser" },
  { test: /code|cursor|vscode|xcode|terminal|iterm|warp|claude/i, category: "dev" },
  { test: /slack|discord|telegram|messages|mail|outlook|wechat|qq/i, category: "social" },
  { test: /figma|sketch|photoshop|illustrator|canva/i, category: "design" },
  { test: /spotify|music|youtube|netflix|bilibili/i, category: "media" },
  { test: /notes|obsidian|notion|bear|craft|typora/i, category: "notes" },
  { test: /finder|system|settings|activity/i, category: "system" },
];

function categorize(app: string): string {
  for (const { test, category } of CATEGORY_MAP) {
    if (test.test(app)) return category;
  }
  return "other";
}

/**
 * Build timeline from existing nodes (PRD F7).
 * Single day or inclusive from/to range. No new tables — pure aggregation.
 * Range is capped at MAX_TIMELINE_DAYS inclusive days; larger spans throw.
 */
export const MAX_TIMELINE_DAYS = 31;

export class TimelineRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimelineRangeError";
  }
}

export function buildTimeline(
  db: Db,
  dateOrRange: string | { from: string; to: string },
): TimelineResponse {
  const from = typeof dateOrRange === "string" ? dateOrRange : dateOrRange.from;
  const to = typeof dateOrRange === "string" ? dateOrRange : dateOrRange.to;
  const dates = dateSpan(from, to);
  const segments: TimelineSegment[] = [];

  for (const date of dates) {
    const nodes = listNodesByDate(db, date);
    const sessions = allSessions(nodes, config.sampleIntervalMin);

    for (const s of sessions) {
      segments.push({
        kind: s.kind === "agent" ? "agent" : "app",
        start: s.start,
        end: s.end,
        label: s.app,
        category: s.kind === "agent" ? "agent" : categorize(s.app),
        meta: s.meta,
        date,
      });
    }

    for (const n of nodes) {
      if (!["text", "url", "voice", "save_note", "idea", "image"].includes(n.kind)) {
        continue;
      }
      const at = nodeEventTime(n);
      segments.push({
        kind: "feed",
        start: at,
        end: at,
        label: n.title || n.kind,
        node_id: n.id,
        category: n.kind,
        meta: { kind: n.kind },
        date,
      });
    }

    const sleep = sleepSegment(nodes, date);
    if (sleep) segments.push({ ...sleep, date });
  }

  segments.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return {
    date: from,
    from: from !== to ? from : undefined,
    to: from !== to ? to : undefined,
    segments,
  };
}

/** Inclusive day count between YYYY-MM-DD from..to (assumes from ≤ to). */
export function inclusiveDayCount(from: string, to: string): number {
  const a = parseDate(from).getTime();
  const b = parseDate(to).getTime();
  return Math.floor((b - a) / 86_400_000) + 1;
}

function dateSpan(from: string, to: string): string[] {
  if (from > to) {
    throw new TimelineRangeError("from must be ≤ to");
  }
  const days = inclusiveDayCount(from, to);
  if (days > MAX_TIMELINE_DAYS) {
    throw new TimelineRangeError(
      `timeline range exceeds ${MAX_TIMELINE_DAYS} days (got ${days})`,
    );
  }
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    out.push(cur);
    const [y, m, d] = cur.split("-").map(Number);
    const dt = new Date(y!, m! - 1, d! + 1);
    const yy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, "0");
    const dd = String(dt.getDate()).padStart(2, "0");
    cur = `${yy}-${mm}-${dd}`;
  }
  return out;
}

function sleepSegment(nodes: NodeRecord[], date: string): TimelineSegment | null {
  const { sleepMinutes } = extractHealth(nodes);
  if (sleepMinutes == null || sleepMinutes <= 0) return null;

  // Place sleep ending at 07:00 local of `date`, starting sleepMinutes earlier.
  const dayStart = parseDate(date);
  const end = new Date(dayStart);
  end.setHours(7, 0, 0, 0);
  const start = new Date(end.getTime() - sleepMinutes * 60_000);

  return {
    kind: "sleep",
    start: start.toISOString(),
    end: end.toISOString(),
    label: `sleep ${Math.round(sleepMinutes / 60)}h`,
    category: "sleep",
    meta: { sleep_minutes: sleepMinutes },
  };
}
