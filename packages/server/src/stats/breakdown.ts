import {
  ACTIVE_FEED_KINDS,
  type DayStatsBreakdown,
  type NodeRecord,
  type Session,
} from "@return/shared";

export interface BreakdownInput {
  nodes: NodeRecord[];
  sessions: Session[];
  /** Apple Reminders completion counts for the day (real checklist). */
  todoCompleted: number;
  todoTotal: number;
  crossDayEdges: number;
  sleepMinutes: number | null;
  steps: number | null;
}

/**
 * Pure counters for Daily Brief attribution templates.
 * Written into briefing card content at Save — never LLM.
 */
export function computeDayBreakdown(input: BreakdownInput): DayStatsBreakdown {
  const { received, sent } = emailCounts(input.nodes);
  const active = input.nodes.filter((n) =>
    (ACTIVE_FEED_KINDS as readonly string[]).includes(n.kind),
  );
  const agentMin = input.sessions
    .filter((s) => s.kind === "agent")
    .reduce((sum, s) => sum + s.durationMin, 0);
  const longest = input.sessions.reduce((max, s) => Math.max(max, s.durationMin), 0);

  return {
    idea_count: input.nodes.filter((n) => n.kind === "idea").length,
    image_count: input.nodes.filter((n) => n.kind === "image").length,
    active_feed_count: active.length,
    email_received: received,
    todo_completed: input.todoCompleted,
    todo_total: input.todoTotal,
    agent_duration_min: Math.round(agentMin * 10) / 10,
    git_commit_count: input.nodes.filter((n) => n.kind === "git_commit").length,
    email_sent: sent,
    longest_session_min: Math.round(longest * 10) / 10,
    sleep_minutes: input.sleepMinutes,
    steps: input.steps,
    cross_day_edges: input.crossDayEdges,
  };
}

function emailCounts(nodes: NodeRecord[]): { received: number; sent: number } {
  let received = 0;
  let sent = 0;
  for (const n of nodes) {
    if (n.kind !== "email") continue;
    const dir = (n.source_meta as Record<string, unknown> | null)?.direction;
    if (dir === "sent") sent++;
    else received++;
  }
  return { received, sent };
}
