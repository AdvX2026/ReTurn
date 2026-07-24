/**
 * Git-commit SampleSource.
 *
 * Scans GIT_SCAN_DIRS for today's local commits, maps to git_commit nodes
 * with deterministic client_uuid. All discovery / spawn / dedupe lives here.
 */
import type { NodeInput } from "@return/shared";
import { type GitCommit, scanTodayCommits } from "../collect-git.js";
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

/** Test helper: clear in-process commit dedupe (simulates process restart). */
export function resetSeenCommitShas(): void {
  seen.clear();
}

export function commitsToNodes(
  commits: GitCommit[],
  day?: string,
  dedupe: KeyDedupe = seen,
): NodeInput[] {
  const nodes: NodeInput[] = [];
  for (const c of commits) {
    if (!dedupe.tryAdd(c.sha)) continue;
    const title = c.subject.length > 500 ? c.subject.slice(0, 500) : c.subject;
    nodes.push({
      client_uuid: uuidFromSeed(`git:${c.repoPath}:${c.sha}`),
      kind: "git_commit",
      title,
      content: null,
      source_meta: {
        repo: c.repo,
        sha: c.sha,
        committed_at: c.committedAt,
        files_changed: c.filesChanged,
        insertions: c.insertions,
        deletions: c.deletions,
      },
      client_created_at: c.committedAt,
      date: day ?? todayLocal(new Date(c.committedAt)),
    });
  }
  return nodes;
}

export const gitSource: SampleSource = {
  id: "git",
  async sample(ctx: SampleContext): Promise<SourceResult> {
    const commits = await scanTodayCommits(config.gitScanDirs, {
      start: ctx.dayStart,
      end: ctx.dayEnd,
    }).catch(() => [] as GitCommit[]);
    const nodes = commitsToNodes(commits, ctx.day);
    return {
      nodes,
      stats: {
        commits: commits.length,
        emitted: nodes.length,
        roots: config.gitScanDirs.length,
      },
    };
  },
};
