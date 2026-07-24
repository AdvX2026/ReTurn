import type { NodeInput } from "@return/shared";
import {
  collectSafariHistory,
  resolveSafariHistoryPath,
} from "../collect-safari-history.js";
import { config } from "../config.js";
import {
  type KeyDedupe,
  type SampleContext,
  type SampleSource,
  type SourceResult,
  createKeyDedupe,
  uuidFromSeed,
} from "../source.js";

const seen: KeyDedupe = createKeyDedupe();

export function resetSeenSafariVisits(): void {
  seen.clear();
}

export function safariVisitsToNodes(
  visits: Awaited<ReturnType<typeof collectSafariHistory>>,
  day: string,
  dedupe: KeyDedupe = seen,
): NodeInput[] {
  const nodes: NodeInput[] = [];
  for (const visit of visits) {
    const key = `browse:safari:Default:${visit.visitId}`;
    if (!dedupe.tryAdd(key)) continue;
    const title = visit.title.trim();
    nodes.push({
      client_uuid: uuidFromSeed(key),
      kind: "browse_history",
      title: title ? title.slice(0, 500) : null,
      content: visit.url,
      source_meta: {
        url: visit.url,
        title: visit.title,
        visited_at: visit.visitedAt,
        visit_id: visit.visitId,
        browser: "safari",
        profile: "Default",
      },
      client_created_at: visit.visitedAt,
      date: day,
    });
  }
  return nodes;
}

export const safariHistorySource: SampleSource = {
  id: "safari_history",
  async sample(ctx: SampleContext): Promise<SourceResult> {
    if (ctx.platform !== "darwin" || !config.safariHistoryEnabled) {
      return { nodes: [], stats: { enabled: 0, dbs: 0, visits: 0, emitted: 0 } };
    }
    const path = resolveSafariHistoryPath(config.safariHistoryPath || undefined);
    if (!path) {
      return { nodes: [], stats: { enabled: 1, dbs: 0, visits: 0, emitted: 0 } };
    }
    const visits = await collectSafariHistory(path, config.safariHistoryLimit, {
      start: ctx.dayStart,
      end: ctx.dayEnd,
    });
    const nodes = safariVisitsToNodes(visits, ctx.day);
    return {
      nodes,
      stats: { enabled: 1, dbs: 1, visits: visits.length, emitted: nodes.length },
    };
  },
};
