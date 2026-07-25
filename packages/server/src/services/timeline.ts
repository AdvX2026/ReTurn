import {
  ACTIVE_FEED_KINDS,
  type IdeaProvenance,
  type NodeRecord,
  type TimelineClusterChild,
  type TimelineResponse,
  type TimelineSegment,
  uuidFromSeed,
} from "@return/shared";
import { config } from "../config.js";
import { getCardByTypeDate, listNodesByDate } from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { extractHealth } from "../stats/compute.js";
import { allSessions, nodeEventTime } from "../stats/sessions.js";
import { dateRange, parseDate } from "../util/time.js";

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

/** Short app sessions collapse to ambient (density control). */
const AMBIENT_APP_MIN = 5;
/** Feed items within this gap may merge into a cluster. */
const CLUSTER_GAP_MS = 20 * 60_000;
/** Need at least this many related feeds to form a cluster. */
const CLUSTER_MIN = 3;

function categorize(app: string): string {
  for (const { test, category } of CATEGORY_MAP) {
    if (test.test(app)) return category;
  }
  return "other";
}

/**
 * Build timeline from existing nodes + cards (PRD F7 / §3.2).
 * Pure projection — no new tables. Stable ids via uuidFromSeed.
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
    segments.push(...projectDay(db, date));
  }

  segments.sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  return {
    date: from,
    from: from !== to ? from : undefined,
    to: from !== to ? to : undefined,
    segments,
  };
}

function projectDay(db: Db, date: string): TimelineSegment[] {
  const nodes = listNodesByDate(db, date);
  const sessions = allSessions(nodes, config.sampleIntervalMin);
  const out: TimelineSegment[] = [];

  // Daily Briefing single-line entry (history index → card group).
  const briefing = getCardByTypeDate(db, "briefing", date);
  if (briefing) {
    const seed = `briefing:${briefing.id}`;
    out.push({
      id: uuidFromSeed(seed),
      kind: "briefing",
      shape: "point",
      importance: "major",
      role: "derived",
      start: briefing.created_at,
      end: briefing.created_at,
      label: "Daily Briefing",
      category: "briefing",
      date,
      meta: { card_id: briefing.id },
      destination: { type: "daily_briefing", briefing_id: briefing.id },
    });
  }

  for (const s of sessions) {
    const isAgent = s.kind === "agent";
    const ambient = !isAgent && s.durationMin < AMBIENT_APP_MIN;
    const seed = isAgent
      ? `agent:${date}:${s.start}:${s.app}`
      : `app:${date}:${s.start}:${s.app}`;
    out.push({
      id: uuidFromSeed(seed),
      kind: isAgent ? "agent" : "app",
      shape: "span",
      importance: isAgent ? "major" : ambient ? "ambient" : "normal",
      role: isAgent ? "sample" : "sample",
      start: s.start,
      end: s.end,
      label: s.app,
      category: isAgent ? "agent" : categorize(s.app),
      meta: s.meta,
      date,
      destination: { type: "none" },
    });
  }

  // Active-feed points; cluster dense same-kind bursts.
  const feeds = nodes
    .filter((n) => (ACTIVE_FEED_KINDS as readonly string[]).includes(n.kind))
    .map((n) => feedSegment(n, date))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  out.push(...clusterFeeds(feeds, date));

  const sleep = sleepSegment(nodes, date);
  if (sleep) out.push(sleep);

  return out;
}

function feedSegment(n: NodeRecord, date: string): TimelineSegment {
  const at = nodeEventTime(n);
  const provenance = ideaProvenance(n);
  const role =
    n.kind === "idea" || n.kind === "image" || n.kind === "text" || n.kind === "voice"
      ? "input"
      : n.kind === "save_note"
        ? "input"
        : "sample";
  const major =
    n.kind === "idea" ||
    n.kind === "image" ||
    n.kind === "voice" ||
    n.kind === "save_note";
  const seed = `feed:${n.id}`;
  return {
    id: uuidFromSeed(seed),
    kind: "feed",
    shape: "point",
    importance: major ? "major" : "normal",
    role,
    provenance,
    start: at,
    end: at,
    label: n.title || n.kind,
    node_id: n.id,
    category: n.kind,
    meta: { kind: n.kind },
    date,
    destination:
      n.kind === "idea"
        ? // Idea nodes may have a matching After card; client can resolve by node.
          { type: "none" }
        : { type: "none" },
  };
}

/**
 * Merge consecutive same-category feed points into clusters when dense.
 * Child segments keep their own stable ids for drill-down.
 */
function clusterFeeds(feeds: TimelineSegment[], date: string): TimelineSegment[] {
  if (feeds.length === 0) return [];
  const result: TimelineSegment[] = [];
  let group: TimelineSegment[] = [feeds[0]!];

  const flush = () => {
    if (group.length === 0) return;
    if (group.length < CLUSTER_MIN) {
      result.push(...group);
    } else {
      const first = group[0]!;
      const last = group[group.length - 1]!;
      const cat = first.category ?? "feed";
      const clusterSeed = `cluster:${date}:${first.start}:${cat}:${group.length}`;
      const clusterId = uuidFromSeed(clusterSeed);
      const child_ids = group.map((g) => g.id);
      const children: TimelineClusterChild[] = group.slice(0, 3).map((g) => ({
        id: g.id,
        label: g.label,
        start: g.start,
        node_id: g.node_id,
      }));
      result.push({
        id: clusterId,
        kind: "cluster",
        shape: "span",
        importance: "normal",
        role: "derived",
        start: first.start,
        end: last.end,
        label: `${group.length} ${cat}`,
        category: cat,
        date,
        cluster_id: clusterId,
        child_ids,
        child_count: group.length,
        children,
        destination: { type: "timeline_cluster", cluster_id: clusterId },
        meta: { categories: [cat] },
      });
    }
    group = [];
  };

  for (let i = 1; i < feeds.length; i++) {
    const prev = group[group.length - 1]!;
    const cur = feeds[i]!;
    const sameCat = (prev.category ?? "") === (cur.category ?? "");
    const close =
      new Date(cur.start).getTime() - new Date(prev.start).getTime() <= CLUSTER_GAP_MS;
    if (sameCat && close) {
      group.push(cur);
    } else {
      flush();
      group = [cur];
    }
  }
  flush();
  return result;
}

function ideaProvenance(n: NodeRecord): IdeaProvenance | undefined {
  if (n.kind !== "idea") return undefined;
  const p = (n.source_meta as Record<string, unknown> | null)?.provenance;
  if (p === "user" || p === "auto") return p;
  return "user";
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
  return dateRange(from, to);
}

function sleepSegment(nodes: NodeRecord[], date: string): TimelineSegment | null {
  const { sleepMinutes } = extractHealth(nodes);
  if (sleepMinutes == null || sleepMinutes <= 0) return null;

  // Place sleep ending at 07:00 local of `date`, starting sleepMinutes earlier.
  const dayStart = parseDate(date);
  const end = new Date(dayStart);
  end.setHours(7, 0, 0, 0);
  const start = new Date(end.getTime() - sleepMinutes * 60_000);
  const seed = `sleep:${date}`;

  return {
    id: uuidFromSeed(seed),
    kind: "sleep",
    shape: "span",
    importance: "normal",
    role: "system",
    start: start.toISOString(),
    end: end.toISOString(),
    label: `sleep ${Math.round(sleepMinutes / 60)}h`,
    category: "sleep",
    date,
    meta: { sleep_minutes: sleepMinutes },
    destination: { type: "none" },
  };
}
