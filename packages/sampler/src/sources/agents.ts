/**
 * Agent-session SampleSource.
 *
 * Collects Claude + Codex intervals (agents.ts), maps to agent_session nodes,
 * withholds open intervals on regular ticks, flushes them on Save Today.
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
  todayLocal,
  uuidFromSeed,
} from "../source.js";

const seen: KeyDedupe = createKeyDedupe();

/** Test helper: clear in-process agent dedupe (simulates process restart). */
export function resetSeenAgentKeys(): void {
  seen.clear();
}

/**
 * Dedupe key includes open/closed so a Save Today open flush cannot block
 * the later closed terminal interval (same start, refined end).
 */
function agentKey(a: AgentInterval): string {
  return `${a.provider}|${a.session_id}|${a.start}|${a.open ? "open" : "closed"}`;
}

/**
 * client_uuid seeds also differ by open/closed. Server insertNode is insert-only
 * for a given client_uuid — open and closed must not share a seed, or the
 * closed refinement is permanently dropped after Save Today.
 */
function agentSeed(a: AgentInterval): string {
  return `agent:${a.provider}|${a.session_id}|${a.start}|${a.open ? "open" : "closed"}`;
}

function agentNode(a: AgentInterval): NodeInput {
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
      open: a.open,
    },
    client_created_at: a.end,
    date: todayLocal(new Date(a.end)),
  };
}

/**
 * Map intervals → nodes with emission policy:
 * - regular tick: closed only
 * - asSnapshot (Save Today): closed + open
 * - in-process dedupe by provider|session_id|start|open|closed
 */
export function intervalsToNodes(
  intervals: AgentInterval[],
  opts: { asSnapshot: boolean; dedupe?: KeyDedupe } = { asSnapshot: false },
): NodeInput[] {
  const d = opts.dedupe ?? seen;
  const nodes: NodeInput[] = [];
  for (const a of intervals) {
    if (a.open && !opts.asSnapshot) continue;
    if (!d.tryAdd(agentKey(a))) continue;
    nodes.push(agentNode(a));
  }
  return nodes;
}

export const agentsSource: SampleSource = {
  id: "agents",
  async sample(ctx: SampleContext): Promise<SourceResult> {
    const intervals = await collectAgentIntervals().catch(() => [] as AgentInterval[]);
    const nodes = intervalsToNodes(intervals, { asSnapshot: ctx.asSnapshot });
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
