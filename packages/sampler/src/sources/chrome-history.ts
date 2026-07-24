/**
 * Chrome browse-history SampleSource.
 *
 * Copy-then-read today's History SQLite visits; emit browse_history nodes
 * with stable visit-based client_uuid. Failures silent.
 */
import type { NodeInput } from "@return/shared";
import {
  type BrowseVisit,
  collectChromeHistory,
  resolveHistoryPaths,
} from "../collect-chrome-history.js";
import { config } from "../config.js";
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

/** Test helper: clear in-process visit dedupe (simulates process restart). */
export function resetSeenVisits(): void {
  seen.clear();
}

function seedKey(v: BrowseVisit): string {
  return `browse:${v.browser}:${v.profile}:${v.visitId}`;
}

export function visitsToNodes(
  visits: BrowseVisit[],
  dedupe: KeyDedupe = seen,
): NodeInput[] {
  const nodes: NodeInput[] = [];
  for (const v of visits) {
    const key = seedKey(v);
    if (!dedupe.tryAdd(key)) continue;
    const rawTitle = (v.title || v.url).trim() || v.url;
    const title = rawTitle.length > 500 ? rawTitle.slice(0, 500) : rawTitle;
    nodes.push({
      client_uuid: uuidFromSeed(key),
      kind: "browse_history",
      title,
      content: v.url,
      source_meta: {
        url: v.url,
        title: v.title,
        visited_at: v.visitedAt,
        visit_id: v.visitId,
        browser: v.browser,
        profile: v.profile,
      },
      client_created_at: v.visitedAt,
      // Bucket by visit local day so late-night visits land correctly.
      date: todayLocal(new Date(v.visitedAt)),
    });
  }
  return nodes;
}

export const chromeHistorySource: SampleSource = {
  id: "chrome_history",
  async sample(_ctx: SampleContext): Promise<SourceResult> {
    if (!config.chromeHistoryEnabled) {
      return {
        nodes: [],
        stats: { enabled: 0, dbs: 0, visits: 0, emitted: 0 },
      };
    }

    const paths = resolveHistoryPaths(
      process.platform,
      config.chromeHistoryPath || undefined,
    );
    if (paths.length === 0) {
      return {
        nodes: [],
        stats: { enabled: 1, dbs: 0, visits: 0, emitted: 0 },
      };
    }

    const visits = await collectChromeHistory(paths, config.chromeHistoryLimit).catch(
      () => [] as BrowseVisit[],
    );
    const nodes = visitsToNodes(visits);
    return {
      nodes,
      stats: {
        enabled: 1,
        dbs: paths.length,
        visits: visits.length,
        emitted: nodes.length,
      },
    };
  },
};
