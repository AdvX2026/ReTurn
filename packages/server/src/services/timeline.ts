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
 * No new tables — pure aggregation. Single day or from–to range.
 */
export function buildTimeline(db: Db, date: string): TimelineResponse {
  return { date, segments: segmentsForDate(db, date) };
}

export function buildTimelineRange(db: Db, from: string, to: string): TimelineResponse {
  const segments: TimelineSegment[] = [];
  // Inclusive day walk; cap 31 days.
  let d = from;
  for (let i = 0; i < 31; i++) {
    segments.push(...segmentsForDate(db, d));
    if (d >= to) break;
    d = nextDay(d);
  }
  segments.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  return { from, to, segments };
}

function segmentsForDate(db: Db, date: string): TimelineSegment[] {
  const nodes = listNodesByDate(db, date);
  const sessions = allSessions(nodes, config.sampleIntervalMin);
  const segments: TimelineSegment[] = [];

  for (const s of sessions) {
    segments.push({
      kind: s.kind === "agent" ? "agent" : "app",
      start: s.start,
      end: s.end,
      label: s.app,
      category: s.kind === "agent" ? "agent" : categorize(s.app),
      meta: s.meta,
    });
  }

  for (const n of nodes) {
    if (!["text", "url", "voice", "save_note", "idea"].includes(n.kind)) continue;
    const at = nodeEventTime(n);
    segments.push({
      kind: "feed",
      start: at,
      end: at,
      label: n.title || n.kind,
      node_id: n.id,
      category: n.kind,
      meta: { kind: n.kind },
    });
  }

  const sleep = sleepSegment(nodes, date);
  if (sleep) segments.push(sleep);
  return segments;
}

function nextDay(date: string): string {
  const d = parseDate(date);
  d.setDate(d.getDate() + 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
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
