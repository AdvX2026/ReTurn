/**
 * VS Code / Cursor recent-projects SampleSource.
 *
 * Reads state.vscdb (copy-then-open), maps to vscode_recent nodes with
 * deterministic client_uuid. Failures silent — never blocks the tick.
 */
import type { NodeInput } from "@return/shared";
import {
  type VscodeRecent,
  collectVscodeRecents,
  resolveVscodeStateDb,
} from "../collect-vscode.js";
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

/** Test helper: clear in-process vscode dedupe (simulates process restart). */
export function resetSeenVscodeKeys(): void {
  seen.clear();
}

function seedKey(r: VscodeRecent): string {
  return `vscode:${r.editor}:${r.kind}:${r.uri}`;
}

export function recentsToNodes(
  recents: VscodeRecent[],
  ctx: Pick<SampleContext, "at" | "day">,
  dedupe: KeyDedupe = seen,
): NodeInput[] {
  const nodes: NodeInput[] = [];
  for (const r of recents) {
    const key = seedKey(r);
    if (!dedupe.tryAdd(key)) continue;
    nodes.push({
      client_uuid: uuidFromSeed(key),
      kind: "vscode_recent",
      title: r.label,
      content: r.path || r.uri,
      source_meta: {
        uri: r.uri,
        path: r.path,
        entry_kind: r.kind,
        editor: r.editor,
      },
      client_created_at: ctx.at,
      date: ctx.day,
    });
  }
  return nodes;
}

export const vscodeSource: SampleSource = {
  id: "vscode",
  async sample(ctx: SampleContext): Promise<SourceResult> {
    if (!config.vscodeEnabled) {
      return { nodes: [], stats: { disabled: 1, recents: 0, emitted: 0 } };
    }
    const resolved = resolveVscodeStateDb(config.vscodeStateDb);
    if (!resolved) {
      return { nodes: [], stats: { recents: 0, emitted: 0, db: 0 } };
    }
    const recents = await collectVscodeRecents(resolved.path, resolved.editor).catch(
      () => [] as VscodeRecent[],
    );
    const nodes = recentsToNodes(recents, ctx);
    return {
      nodes,
      stats: {
        recents: recents.length,
        emitted: nodes.length,
        db: 1,
      },
    };
  },
};
