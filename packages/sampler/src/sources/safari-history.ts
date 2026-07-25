/**
 * Safari browse-history SampleSource (macOS).
 *
 * Same browse_history node shape as Chrome — mapping lives in chrome-history.
 */
import {
  collectSafariHistory,
  resolveSafariHistoryPath,
} from "../collect-safari-history.js";
import { config } from "../config.js";
import type { SampleContext, SampleSource, SourceResult } from "../source.js";
import { visitsToNodes } from "./chrome-history.js";

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
    const nodes = visitsToNodes(visits, ctx.day);
    return {
      nodes,
      stats: { enabled: 1, dbs: 1, visits: visits.length, emitted: nodes.length },
    };
  },
};
