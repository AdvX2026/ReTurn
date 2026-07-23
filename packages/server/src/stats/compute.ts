import {
  ACTIVE_FEED_KINDS,
  EMPTY_STATS,
  type NodeKind,
  type NodeRecord,
  type Session,
  type Stats,
} from "@return/shared";
import { clamp } from "../util/time.js";

export interface StatsInput {
  nodes: NodeRecord[];
  sessions: Session[];
  todoRate: number; // 0..1
  crossDayEdges: number;
  /** Sleep minutes last night (from health_daily). */
  sleepMinutes: number | null;
  steps: number | null;
}

/**
 * Deterministic five-dim stats (PRD §4.1).
 * Coefficients are initial; tunable before T+40h.
 */
export function computeStats(input: StatsInput): Stats {
  return {
    intake: scoreIntake(input.nodes),
    focus: scoreFocus(input.sessions, input.nodes),
    output: scoreOutput(input.todoRate, input.sessions),
    continuity: scoreContinuity(input.crossDayEdges),
    energy: scoreEnergy(input),
  };
}

/** 摄取: active feed count × source-kind diversity. Samples excluded. */
export function scoreIntake(nodes: NodeRecord[]): number {
  const active = nodes.filter((n) =>
    (ACTIVE_FEED_KINDS as readonly string[]).includes(n.kind),
  );
  if (active.length === 0) return 0;
  const kinds = new Set(active.map((n) => n.kind));
  // 8 feeds of 1 kind ≈ 50; 12 feeds across 3 kinds ≈ 90
  const raw = active.length * 6 + kinds.size * 12;
  return clamp(raw, 0, 100);
}

/** 专注: HHI of session durations + longest session weight. */
export function scoreFocus(sessions: Session[], nodes: NodeRecord[]): number {
  const usable = sessions.filter((s) => s.durationMin > 0);
  if (usable.length === 0) {
    // Fallback: if only samples exist without aggregation edge, mild score from sample count.
    const samples = nodes.filter(
      (n) => n.kind === "app_sample" || n.kind === "agent_session",
    );
    if (samples.length === 0) return 0;
    return clamp(samples.length * 2, 0, 40);
  }

  const total = usable.reduce((s, x) => s + x.durationMin, 0);
  if (total <= 0) return 0;

  // Herfindahl–Hirschman Index over apps (by duration share).
  const byApp = new Map<string, number>();
  for (const s of usable) {
    byApp.set(s.app, (byApp.get(s.app) ?? 0) + s.durationMin);
  }
  let hhi = 0;
  for (const d of byApp.values()) {
    const share = d / total;
    hhi += share * share;
  }
  // HHI 1.0 = all one app; 1/n = even spread. Map [0.15..1] → [0..70]
  const hhiScore = clamp(((hhi - 0.15) / 0.85) * 70, 0, 70);

  const longest = Math.max(...usable.map((s) => s.durationMin));
  // 90min deep work → +30
  const longScore = clamp((longest / 90) * 30, 0, 30);

  // Optional: theme tag concentration if tags present in source_meta
  const tagBonus = themeConcentrationBonus(nodes);

  return clamp(Math.round(hhiScore + longScore + tagBonus), 0, 100);
}

/** 产出: todo completion rate primary + agent session duration bonus. */
export function scoreOutput(todoRate: number, sessions: Session[]): number {
  const todoScore = clamp(todoRate * 70, 0, 70);
  const agentMin = sessions
    .filter((s) => s.kind === "agent")
    .reduce((s, x) => s + x.durationMin, 0);
  // 2h agent work → +30
  const agentBonus = clamp((agentMin / 120) * 30, 0, 30);
  return clamp(Math.round(todoScore + agentBonus), 0, 100);
}

/** 连贯: cross-day edges capped to 0..100. */
export function scoreContinuity(crossDayEdges: number): number {
  // 5 cross-day edges → 100
  return clamp(Math.round((crossDayEdges / 5) * 100), 0, 100);
}

/**
 * 精力:
 * with health: min(sleep/8h,1)×70 + steps bonus(≤15) + 15 − late-night penalty − long-stretch penalty
 * without: 100 − late-night − long-stretch
 */
export function scoreEnergy(input: StatsInput): number {
  const latePenalty = lateNightPenalty(input.nodes);
  const stretchPenalty = longStretchPenalty(input.sessions);

  if (input.sleepMinutes == null) {
    return clamp(100 - latePenalty - stretchPenalty, 0, 100);
  }

  const sleepScore = Math.min(input.sleepMinutes / 480, 1) * 70;
  const steps = input.steps ?? 0;
  // 8k steps → +15
  const stepBonus = clamp((steps / 8000) * 15, 0, 15);
  return clamp(
    Math.round(sleepScore + stepBonus + 15 - latePenalty - stretchPenalty),
    0,
    100,
  );
}

function lateNightPenalty(nodes: NodeRecord[]): number {
  // Active samples between 00:00–06:00 local → −5 each, cap −25
  let count = 0;
  for (const n of nodes) {
    if (n.kind !== "app_sample" && n.kind !== "agent_session") continue;
    const h = new Date(n.created_at).getHours();
    if (h >= 0 && h < 6) count++;
  }
  return clamp(count * 5, 0, 25);
}

function longStretchPenalty(sessions: Session[]): number {
  // Continuous work stretch > 90 min → −10 per extra 30 min, cap −20
  let penalty = 0;
  for (const s of sessions) {
    if (s.durationMin > 90) {
      penalty += Math.floor((s.durationMin - 90) / 30) * 10;
    }
  }
  return clamp(penalty, 0, 20);
}

function themeConcentrationBonus(nodes: NodeRecord[]): number {
  const tags: string[] = [];
  for (const n of nodes) {
    const meta = (n.source_meta ?? {}) as Record<string, unknown>;
    const t = meta.tags;
    if (Array.isArray(t)) {
      for (const x of t) if (typeof x === "string") tags.push(x);
    }
  }
  if (tags.length < 3) return 0;
  const counts = new Map<string, number>();
  for (const t of tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const total = tags.length;
  let hhi = 0;
  for (const c of counts.values()) {
    const s = c / total;
    hhi += s * s;
  }
  return clamp(Math.round(hhi * 10), 0, 10);
}

export function extractHealth(
  nodes: NodeRecord[],
): { sleepMinutes: number | null; steps: number | null } {
  const health = nodes
    .filter((n) => n.kind === "health_daily")
    .slice()
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    )[0];
  if (!health) return { sleepMinutes: null, steps: null };
  const meta = (health.source_meta ?? {}) as Record<string, unknown>;
  const sleep =
    typeof meta.sleep_minutes === "number"
      ? meta.sleep_minutes
      : typeof health.content === "string"
        ? null
        : null;
  const steps = typeof meta.steps === "number" ? meta.steps : null;
  // Prefer meta; also accept top-level fields stored in content JSON.
  let sleepMinutes = sleep;
  let stepCount = steps;
  if (health.content) {
    try {
      const c = JSON.parse(health.content) as Record<string, unknown>;
      if (sleepMinutes == null && typeof c.sleep_minutes === "number")
        sleepMinutes = c.sleep_minutes;
      if (stepCount == null && typeof c.steps === "number") stepCount = c.steps;
    } catch {
      /* ignore */
    }
  }
  return { sleepMinutes, steps: stepCount };
}

export { EMPTY_STATS };
export type { NodeKind };
