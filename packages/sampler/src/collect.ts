/**
 * Sampler orchestrator.
 *
 * Owns the source registry and the sample tick. Feature logic lives in
 * individual SampleSource modules under ./sources/ — add a source by
 * appending to SOURCES; never put feature code here.
 */
import type { NodeInput } from "@return/shared";
import {
  type SampleContext,
  type SampleSource,
  type SourceResult,
  todayLocal,
} from "./source.js";
import { agentsSource } from "./sources/agents.js";
import { envSource, getLastEnv } from "./sources/env.js";
import { gitSource } from "./sources/git.js";
import { gmailSource } from "./sources/gmail.js";

export { todayLocal, uuidFromSeed } from "./source.js";
export { resetSeenAgentKeys } from "./sources/agents.js";
export { resetSeenCommitShas } from "./sources/git.js";
export { resetSeenEmailKeys } from "./sources/gmail.js";

/**
 * Registered sources, in emit order.
 * env first (app/tabs), then feature sources. Git / future sources append here.
 */
const SOURCES: SampleSource[] = [envSource, agentsSource, gitSource, gmailSource];

/**
 * Snapshot of the last tick — status / control-plane surface.
 * Feature-specific lists are intentionally absent: sources report via `stats`.
 */
export interface SampleSnapshot {
  app: { name: string; bundleId?: string } | null;
  tabs: Array<{ browser: string; title: string; url: string }>;
  at: string;
  platform: NodeJS.Platform;
  /** Per-source stats (e.g. agents.intervals, agents.emitted). */
  stats: Record<string, Record<string, number>>;
}

export interface SampleResult {
  snapshot: SampleSnapshot;
  nodes: NodeInput[];
}

/**
 * Run every registered source once. Per-source failures become empty results
 * so a broken feature never blocks the tick or the outbox flush.
 */
export async function collectSample(opts?: {
  asSnapshot?: boolean;
}): Promise<SampleResult> {
  const at = new Date().toISOString();
  const platform = process.platform;
  const ctx: SampleContext = {
    at,
    platform,
    asSnapshot: Boolean(opts?.asSnapshot),
  };

  const results = await Promise.all(
    SOURCES.map(async (src): Promise<{ id: string; result: SourceResult }> => {
      try {
        return { id: src.id, result: await src.sample(ctx) };
      } catch {
        return { id: src.id, result: { nodes: [], stats: { error: 1 } } };
      }
    }),
  );

  const nodes: NodeInput[] = [];
  const stats: SampleSnapshot["stats"] = {};
  for (const { id, result } of results) {
    nodes.push(...result.nodes);
    stats[id] = result.stats;
  }

  // Save Today: environment meta node (orchestrator-level, not a feature source).
  if (ctx.asSnapshot) {
    const env = getLastEnv();
    nodes.push({
      client_uuid: crypto.randomUUID(),
      kind: "snapshot",
      title: "Environment snapshot",
      content: JSON.stringify({
        app: env.app,
        tabs: env.tabs.map((t) => ({
          title: t.title,
          url: t.url,
          browser: t.browser,
        })),
        stats,
        at,
      }),
      source_meta: {
        at,
        tab_count: env.tabs.length,
        stats,
      },
      client_created_at: at,
      date: todayLocal(),
    });
  }

  const env = getLastEnv();
  return {
    snapshot: {
      app: env.app,
      tabs: env.tabs,
      at,
      platform,
      stats,
    },
    nodes,
  };
}
