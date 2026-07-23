import type { TimelineResponse, TimelineSegment, NodeRecord } from "@return/shared";
import type { Db } from "../db/schema.js";
import { listNodesByDate } from "../db/repo.js";
import { allSessions } from "../stats/sessions.js";
import { extractHealth } from "../stats/compute.js";
import { config } from "../config.js";
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
 * Build 24h timeline from existing nodes (PRD F12).
 * No new tables — pure aggregation.
 */
export function buildTimeline(db: Db, date: string): TimelineResponse {
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

  // Feed dots (active nodes)
  for (const n of nodes) {
    if (!["text", "url", "voice", "save_note"].includes(n.kind)) continue;
    segments.push({
      kind: "feed",
      start: n.created_at,
      end: n.created_at,
      label: n.title || n.kind,
      node_id: n.id,
      category: n.kind,
      meta: { kind: n.kind },
    });
  }

  // Sleep segment from health_daily
  const sleep = sleepSegment(nodes, date);
  if (sleep) segments.push(sleep);

  segments.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );

  return { date, segments };
}

function sleepSegment(
  nodes: NodeRecord[],
  date: string,
): TimelineSegment | null {
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
