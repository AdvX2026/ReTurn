/**
 * Agent-session SampleSource.
 *
 * Collects Claude + Codex intervals (agents.ts), maps to agent_session nodes.
 * Only **closed** intervals are enqueued — open ones may still grow, and the
 * server is insert-only on client_uuid (Codex P1: never dual-emit open+closed).
 * All provider / gap-split / dedupe logic lives here — collect.ts stays dumb.
 */
import type { NodeInput } from "@return/shared";
import { type AgentInterval, collectAgentIntervals } from "../agents.js";
import {
  type KeyDedupe,
  type SampleContext,
  type SampleSource,
  type SourceResult,
  createKeyDedupe,
  uuidFromSeed,
} from "../source.js";

const seen: KeyDedupe = createKeyDedupe();

/** Test helper: clear in-process agent dedupe (simulates process restart). */
export function resetSeenAgentKeys(): void {
  seen.clear();
}

/** Stable key for a closed interval (start fixed across gap-split pieces). */
function agentKey(a: AgentInterval): string {
  return `${a.provider}|${a.session_id}|${a.start}`;
}

/**
 * Deterministic seed — same closed interval → same client_uuid across restarts.
 * Open intervals are never seeded (never enqueued).
 */
function agentSeed(a: AgentInterval): string {
  return `agent:${a.provider}|${a.session_id}|${a.start}`;
}

function agentNode(a: AgentInterval, day: string): NodeInput {
  return {
    client_uuid: uuidFromSeed(agentSeed(a)),
    kind: "agent_session",
    title: a.project,
    content: `${a.provider} ${a.project} ${Math.round(a.duration_min)}min`,
    source_meta: {
      provider: a.provider,
      project: a.project,
      start: a.start,
      end: a.end,
      duration_min: a.duration_min,
      session_id: a.session_id,
      open: false,
    },
    client_created_at: a.end,
    date: day,
  };
}

/**
 * Map intervals → nodes. Only closed intervals emit; open always withheld
 * (regular tick and Save Today alike). In-process dedupe by provider|session|start.
 */
export function intervalsToNodes(
  intervals: AgentInterval[],
  opts: { day: string; asSnapshot?: boolean; dedupe?: KeyDedupe },
): NodeInput[] {
  const d = opts.dedupe ?? seen;
  const nodes: NodeInput[] = [];
  for (const a of intervals) {
    if (a.open) continue;
    if (!d.tryAdd(agentKey(a))) continue;
    nodes.push(agentNode(a, opts.day));
  }
  return nodes;
}

export const agentsSource: SampleSource = {
  id: "agents",
  async sample(ctx: SampleContext): Promise<SourceResult> {
    const intervals = await collectAgentIntervals({
      now: new Date(ctx.at),
      day: ctx.day,
      dayStartMs: Date.parse(ctx.dayStart),
      dayEndMs: Date.parse(ctx.dayEnd),
    }).catch(() => [] as AgentInterval[]);
    // asSnapshot does not change agent emission — open never enqueued (server insert-only).
    void ctx.asSnapshot;
    const nodes = intervalsToNodes(intervals, {
      day: ctx.day,
      asSnapshot: ctx.asSnapshot,
    });
    return {
      nodes,
      stats: {
        intervals: intervals.length,
        open: intervals.filter((i) => i.open).length,
        emitted: nodes.length,
      },
    };
  },
};
