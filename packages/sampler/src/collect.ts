/**
 * Sampler orchestrator.
 *
 * Owns the source registry and the sample tick. Feature logic lives in
 * individual SampleSource modules under ./sources/ — add a source by
 * appending to SOURCES; never put feature code here.
 */
import type { NodeInput } from "@return/shared";
import { config } from "./config.js";
import {
  type SampleContext,
  type SampleSource,
  type SourceResult,
  createSampleContext,
} from "./source.js";
import { agentsSource } from "./sources/agents.js";
import { chromeHistorySource } from "./sources/chrome-history.js";
import { envSource, getLastEnv } from "./sources/env.js";
import { gitSource } from "./sources/git.js";
import { gmailSource } from "./sources/gmail.js";
import { remindersSource } from "./sources/reminders.js";
import { safariHistorySource } from "./sources/safari-history.js";
import { vscodeSource } from "./sources/vscode.js";

/**
 * Registered sources, in emit order.
 * env first (app/tabs), then feature sources. T1 sources append here.
 */
export const SOURCES: readonly SampleSource[] = [
  envSource,
  agentsSource,
  gitSource,
  gmailSource,
  remindersSource,
  vscodeSource,
  chromeHistorySource,
  safariHistorySource,
];

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
  /** Explicit operational failures keyed by source id. */
  errors: Record<string, string>;
}

export interface SampleResult {
  snapshot: SampleSnapshot;
  nodes: NodeInput[];
}

/**
 * Run every registered source once. The orchestrator is the sole source-error
 * boundary: failures are visible in stats while independent sources continue.
 */
export async function collectSample(opts?: {
  /**
   * Orchestrator-only: emit an environment `snapshot` node after sources run.
   * Not part of SampleContext — sources never branch on it.
   */
  asSnapshot?: boolean;
  now?: Date;
  timezone?: string;
  sources?: readonly SampleSource[];
}): Promise<SampleResult> {
  const ctx: SampleContext = createSampleContext({
    now: opts?.now ?? config.fixedNow ?? undefined,
    timezone: opts?.timezone ?? config.timezone,
  });
  const { at, platform } = ctx;

  const results = await Promise.all(
    (opts?.sources ?? SOURCES).map(
      async (src): Promise<{ id: string; result: SourceResult; error?: string }> => {
        try {
          return { id: src.id, result: await src.sample(ctx) };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`[sampler:${src.id}] ${message}`);
          return {
            id: src.id,
            result: { nodes: [], stats: { error: 1 } },
            error: message,
          };
        }
      },
    ),
  );

  const nodes: NodeInput[] = [];
  const stats: SampleSnapshot["stats"] = {};
  const errors: SampleSnapshot["errors"] = {};
  for (const { id, result, error } of results) {
    nodes.push(...result.nodes);
    stats[id] = result.stats;
    if (error) errors[id] = error;
  }

  // Save Today: environment meta node (orchestrator-level, not a feature source).
  if (opts?.asSnapshot) {
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
        errors,
        at,
      }),
      source_meta: {
        at,
        tab_count: env.tabs.length,
        stats,
        errors,
      },
      client_created_at: at,
      date: ctx.day,
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
      errors,
    },
    nodes,
  };
}
