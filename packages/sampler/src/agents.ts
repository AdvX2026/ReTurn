/**
 * Coding-agent session timeline collectors.
 *
 * Scans local agent transcript roots (Claude Code + Codex), extracts today's
 * timestamps, gap-splits them into activity intervals, and marks the tail
 * interval of a still-active session as open.
 *
 * Scope (PRD §9.12): timestamps + project path only — never transcript content.
 * Provider path knowledge is adapted from sivtr-core (Claude/Codex layouts).
 */
import { createReadStream } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, sep } from "node:path";
import { createInterface } from "node:readline";

export type AgentProviderId = "claude" | "codex";

/** One continuous activity interval within a session file. */
export interface AgentInterval {
  provider: AgentProviderId;
  /** Human-readable project path (cwd when known, else encoded dir label). */
  project: string;
  start: string;
  end: string;
  duration_min: number;
  session_id: string;
  /**
   * true = last interval of a session whose latest event is still within the
   * gap window of `now` (session may still be active). Never enqueued as a
   * node — sampler waits until the gap window closes (server is insert-only).
   */
  open: boolean;
}

export interface AgentCollectOptions {
  /** Override provider roots (tests). Defaults to real home dirs. */
  roots?: Partial<Record<AgentProviderId, string>>;
  /** Shared tick clock. */
  now: Date;
  /** Gap that severs one interval into two (ms). Default 15 min. */
  gapMs?: number;
  /** Shared tick boundaries. */
  dayStartMs: number;
  dayEndMs: number;
}

/** Default silence that severs one session file into multiple intervals. */
export const DEFAULT_GAP_MS = 15 * 60_000;

interface ProviderSpec {
  id: AgentProviderId;
  /** Resolve default root under $HOME (or env override). */
  defaultRoot: () => string;
  /**
   * Label a session from path + optional cwd seen in the transcript.
   * cwd is authoritative when present; otherwise derive the label from the
   * provider's session path.
   */
  projectLabel: (filePath: string, cwd: string | null) => string;
  /** Stable session id for this file. */
  sessionId: (filePath: string) => string;
}

const PROVIDERS: ProviderSpec[] = [
  {
    id: "claude",
    defaultRoot: () => {
      const home = process.env.CLAUDE_HOME?.trim() || join(homedir(), ".claude");
      return join(home, "projects");
    },
    // ~/.claude/projects/-Users-foo-Coding-ReTurn/uuid.jsonl
    projectLabel: (filePath, cwd) => {
      if (cwd) return normalizeCwd(cwd);
      const dir = basename(dirname(filePath));
      return decodeClaudeProjectDir(dir);
    },
    sessionId: (filePath) => basename(filePath).replace(/\.jsonl$/i, ""),
  },
  {
    id: "codex",
    defaultRoot: () => {
      const home = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
      return join(home, "sessions");
    },
    // ~/.codex/sessions/2026/07/24/rollout-....jsonl — prefer cwd from session_meta
    projectLabel: (_filePath, cwd) => (cwd ? normalizeCwd(cwd) : "codex"),
    sessionId: (filePath) => basename(filePath).replace(/\.jsonl$/i, ""),
  },
];

/**
 * Collect today's agent activity intervals across all known providers.
 * Missing provider roots are empty; operational read failures propagate.
 */
export async function collectAgentIntervals(
  opts: AgentCollectOptions,
): Promise<AgentInterval[]> {
  const now = opts.now;
  const gapMs = opts.gapMs ?? DEFAULT_GAP_MS;
  const { dayStartMs, dayEndMs } = opts;
  const out: AgentInterval[] = [];

  for (const spec of PROVIDERS) {
    const root = opts.roots?.[spec.id] ?? spec.defaultRoot();
    const files = await listJsonlFiles(root);
    for (const file of files) {
      // mtime before local midnight → cannot contain today's events
      const st = await stat(file);
      if (st.mtimeMs < dayStartMs) continue;

      const parsed = await scanSessionFile(file, {
        startMs: dayStartMs,
        endMs: dayEndMs,
      });
      if (parsed.times.length === 0) continue;

      const project = spec.projectLabel(file, parsed.cwd);
      const session_id = spec.sessionId(file);
      const intervals = gapSplit(parsed.times, gapMs, now.getTime());
      for (const iv of intervals) {
        out.push({
          provider: spec.id,
          project,
          start: new Date(iv.start).toISOString(),
          end: new Date(iv.end).toISOString(),
          // Honest duration — single-event sessions stay 0, not floored to 1min.
          duration_min: Math.max(0, (iv.end - iv.start) / 60_000),
          session_id,
          open: iv.open,
        });
      }
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}

// ── gap-split ──────────────────────────────────────────────

interface RawInterval {
  start: number;
  end: number;
  open: boolean;
}

/**
 * Collapse sorted timestamps into continuous intervals, severing when the
 * gap between consecutive events exceeds `gapMs`. The final interval is open
 * iff its end is still within `gapMs` of `nowMs` (session may still be live).
 *
 * Exported for unit tests.
 */
export function gapSplit(timesMs: number[], gapMs: number, nowMs: number): RawInterval[] {
  if (timesMs.length === 0) return [];
  const sorted = timesMs.slice().sort((a, b) => a - b);
  const intervals: RawInterval[] = [];
  let start = sorted[0]!;
  let end = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const t = sorted[i]!;
    if (t - end > gapMs) {
      intervals.push({ start, end, open: false });
      start = t;
    }
    end = t;
  }
  // Tail is open while the session is still "warm" relative to now.
  intervals.push({ start, end, open: nowMs - end < gapMs });
  return intervals;
}

// ── jsonl scan ─────────────────────────────────────────────

interface SessionScan {
  times: number[];
  cwd: string | null;
}

/**
 * Stream a jsonl session file, collecting timestamps that fall on `day`
 * (local calendar) and the first cwd seen.
 */
export async function scanSessionFile(
  filePath: string,
  range: { startMs: number; endMs: number },
): Promise<SessionScan> {
  const times: number[] = [];
  let cwd: string | null = null;

  const rl = createInterface({
    input: createReadStream(filePath, { encoding: "utf8" }),
    crlfDelay: Number.POSITIVE_INFINITY,
  });

  let trailingPartial: SyntaxError | null = null;
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      if (trailingPartial) {
        throw new Error("malformed JSONL record before the final line", {
          cause: trailingPartial,
        });
      }
      let obj: Record<string, unknown>;
      try {
        obj = JSON.parse(line) as Record<string, unknown>;
      } catch (error) {
        trailingPartial =
          error instanceof SyntaxError ? error : new SyntaxError(String(error));
        continue;
      }

      if (cwd === null) {
        const found = extractCwd(obj);
        if (found) cwd = found;
      }

      const ts = extractTimestamp(obj);
      if (ts === null) continue;
      if (ts < range.startMs || ts >= range.endMs) continue;
      times.push(ts);
    }
  } finally {
    rl.close();
  }

  return { times, cwd };
}

/** Pull a timestamp (ms since epoch) from a jsonl event of unknown schema. */
export function extractTimestamp(obj: Record<string, unknown>): number | null {
  // Common shapes: Claude {timestamp: ISO}, Codex {timestamp: ISO},
  // occasional {time: ISO} / {ts: number|ISO}.
  const candidates: unknown[] = [obj.timestamp, obj.time, obj.ts];
  // Codex nests some fields under payload — keep top-level only for time;
  // session timestamps live on the envelope.
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c)) {
      // Heuristic: seconds vs ms
      const ms = c < 1e12 ? c * 1000 : c;
      const d = new Date(ms);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
    if (typeof c === "string" && c) {
      const d = new Date(c);
      if (!Number.isNaN(d.getTime())) return d.getTime();
    }
  }
  return null;
}

/** First cwd from Claude events or Codex session_meta.payload. */
function extractCwd(obj: Record<string, unknown>): string | null {
  if (typeof obj.cwd === "string" && obj.cwd.trim()) return obj.cwd.trim();
  const payload = obj.payload;
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const cwd = (payload as Record<string, unknown>).cwd;
    if (typeof cwd === "string" && cwd.trim()) return cwd.trim();
  }
  return null;
}

// ── filesystem ─────────────────────────────────────────────

/** Recursive *.jsonl discovery under root. Missing root → []. */
export async function listJsonlFiles(root: string): Promise<string[]> {
  const out: string[] = [];
  await walk(root, out);
  return out;
}

async function walk(dir: string, out: string[]): Promise<void> {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(p, out);
      } else if (e.isFile() && e.name.endsWith(".jsonl")) {
        out.push(p);
      }
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

// ── labels / time helpers ──────────────────────────────────

/** Claude encodes absolute paths as `-Users-foo-Coding-ReTurn`. */
export function decodeClaudeProjectDir(dir: string): string {
  // Leading dash marks an absolute path encoding.
  const body = dir.startsWith("-") ? dir.slice(1) : dir;
  // Heuristic: every path segment was joined with `-`. We cannot perfectly
  // invert (real path segments may contain `-`), so restore a leading `/`
  // and leave interior dashes — good enough as a display label. Prefer cwd
  // from the transcript when available.
  if (dir.startsWith("-")) return `/${body.replace(/-/g, "/")}`;
  return body.replace(/-/g, "/");
}

function normalizeCwd(cwd: string): string {
  // Strip trailing separators; keep absolute form for display.
  let s = cwd.trim();
  while (s.length > 1 && (s.endsWith("/") || s.endsWith(sep))) {
    s = s.slice(0, -1);
  }
  return s;
}
