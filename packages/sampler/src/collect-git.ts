import { execFile } from "node:child_process";
import { readdir, stat } from "node:fs/promises";
import { basename, join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitCommit {
  /** basename(repoPath) */
  repo: string;
  /** absolute — only for uuid seed */
  repoPath: string;
  sha: string;
  /** UTC ISO (Z-suffixed) */
  committedAt: string;
  subject: string;
  filesChanged: number | null;
  insertions: number | null;
  deletions: number | null;
}

const DISCOVER_TTL_MS = 60 * 60 * 1000;
const MAX_COMMITS_PER_REPO = 100;
const GIT_TIMEOUT_MS = 10_000;
const GIT_MAX_BUFFER = 1024 * 1024;

/** Process-local cache of discovered repos per root list. */
let repoCache: { key: string; repos: string[]; at: number } | null = null;

/** Test helper: drop the discoverRepos cache. */
export function resetRepoCache(): void {
  repoCache = null;
}

/**
 * Candidates under each root: the root itself + its direct children
 * (skip hidden dirs and node_modules). A path is a repo if `.git`
 * exists as a file or directory (worktree-compatible).
 */
export async function discoverRepos(roots: string[]): Promise<string[]> {
  if (roots.length === 0) return [];
  const key = roots.slice().sort().join("\0");
  const now = Date.now();
  if (repoCache && repoCache.key === key && now - repoCache.at < DISCOVER_TTL_MS) {
    return repoCache.repos;
  }

  const found: string[] = [];
  const seen = new Set<string>();

  for (const root of roots) {
    const candidates: string[] = [root];
    const entries = await readdir(root, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory()) continue;
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      candidates.push(join(root, e.name));
    }

    for (const candidate of candidates) {
      if (seen.has(candidate)) continue;
      if (await isGitRepo(candidate)) {
        seen.add(candidate);
        found.push(candidate);
      }
    }
  }

  repoCache = { key, repos: found, at: now };
  return found;
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await stat(join(dir, ".git"));
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

/**
 * Scan today's local commits under the given roots.
 * Empty roots → no spawn, return [].
 */
export async function scanCommits(
  roots: string[],
  range: { start: string; end: string },
): Promise<GitCommit[]> {
  if (roots.length === 0) return [];
  const repos = await discoverRepos(roots);
  if (repos.length === 0) return [];

  const results = await Promise.all(repos.map((repoPath) => scanRepo(repoPath, range)));
  return results.flat();
}

async function scanRepo(
  repoPath: string,
  range: { start: string; end: string },
): Promise<GitCommit[]> {
  // Only this machine's configured author — shared repos must not score coworkers.
  const author = await localGitAuthor(repoPath);
  if (!author) return [];

  const { stdout } = await execFileAsync(
    "git",
    [
      "-C",
      repoPath,
      "log",
      "--all",
      // --author is a regex by default; fixed-strings so john.doe@x does not match johnXdoe@x
      "--fixed-strings",
      `--author=${author}`,
      `--since=${range.start}`,
      `--until=${range.end}`,
      // Cap at the source — maxBuffer would drop the whole repo if we buffered then sliced
      `--max-count=${MAX_COMMITS_PER_REPO}`,
      "--pretty=format:%x1e%H%x1f%aI%x1f%s",
      "--shortstat",
    ],
    { timeout: GIT_TIMEOUT_MS, maxBuffer: GIT_MAX_BUFFER },
  );
  return parseGitLog(String(stdout), basename(repoPath), repoPath);
}

/** Repo-local then global `user.email`. Empty → skip repo (no author filter = unsafe). */
async function localGitAuthor(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["-C", repoPath, "config", "--get", "user.email"],
      { timeout: GIT_TIMEOUT_MS },
    );
    const email = String(stdout).trim();
    return email || null;
  } catch (error) {
    if ((error as { code?: number }).code === 1) return null;
    throw error;
  }
}

const SHORTSTAT_RE =
  /^\s*(\d+) files? changed(?:, (\d+) insertions?\(\+\))?(?:, (\d+) deletions?\(-\))?/;

/**
 * Pure parser for `git log --pretty=format:%x1e%H%x1f%aI%x1f%s --shortstat`.
 * Author timestamps with offsets are converted to UTC ISO (Z).
 */
export function parseGitLog(stdout: string, repo: string, repoPath: string): GitCommit[] {
  if (!stdout.trim()) return [];
  const records = stdout.split("\x1e").filter((r) => r.trim().length > 0);
  const commits: GitCommit[] = [];

  for (const record of records) {
    const lines = record.split(/\r?\n/);
    const header = (lines[0] ?? "").replace(/^\r?\n?/, "");
    const [sha, authorIso, ...subjectParts] = header.split("\x1f");
    if (!sha || !authorIso) throw new Error("invalid git log record header");
    const subject = subjectParts.join("\x1f");

    // %aI is offset-aware; NodeInput.client_created_at requires Z-suffixed datetime.
    // Parse first — Invalid Date throws RangeError on toISOString() and would
    // abort the whole record loop if left uncaught (scanRepo catches per-repo).
    const ms = Date.parse(authorIso);
    if (Number.isNaN(ms)) {
      throw new Error(`invalid git author timestamp: ${authorIso}`);
    }
    const committedAt = new Date(ms).toISOString();

    let filesChanged: number | null = null;
    let insertions: number | null = null;
    let deletions: number | null = null;
    for (let i = 1; i < lines.length; i++) {
      const m = lines[i]!.match(SHORTSTAT_RE);
      if (!m) continue;
      filesChanged = Number(m[1]);
      insertions = m[2] != null ? Number(m[2]) : null;
      deletions = m[3] != null ? Number(m[3]) : null;
      break;
    }

    commits.push({
      repo,
      repoPath,
      sha,
      committedAt,
      subject,
      filesChanged,
      insertions,
      deletions,
    });
  }

  return commits;
}
