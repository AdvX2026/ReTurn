import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * Positive integer only (e.g. SQLite LIMIT binds). Fractions / ≤0 / NaN → fallback.
 * Exported for unit tests.
 */
export function positiveInt(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return fallback;
  return n;
}

function str(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export function timeZone(value?: string): string {
  const fallback = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  const candidate = value?.trim() || fallback;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    return fallback;
  }
}

export function fixedNow(value?: string): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Explicit "0"/"false"/"off"/"no" disables; "1"/"true"/"on"/"yes" enables; unset/empty → fallback. */
function bool(name: string, fallback: boolean): boolean {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const lower = v.toLowerCase();
  if (lower === "0" || lower === "false" || lower === "off" || lower === "no") {
    return false;
  }
  if (lower === "1" || lower === "true" || lower === "on" || lower === "yes") {
    return true;
  }
  return fallback;
}

/**
 * Comma-separated dirs → absolute paths; empty default disables git scan.
 * Always resolve to absolute so client_uuid seed `git:{repoPath}:{sha}` is
 * stable across relative vs ~/ vs absolute config spellings (Codex P2).
 */
function dirs(name: string): string[] {
  const raw = process.env[name] ?? "";
  if (!raw.trim()) return [];
  const home = homedir();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => {
      if (p === "~") return home;
      if (p.startsWith("~/")) return join(home, p.slice(2));
      return resolve(p);
    });
}

const dataDir = str("SAMPLER_DATA_DIR", join(homedir(), ".return", "sampler"));

export const config = {
  /** Pi base URL */
  serverUrl: str("RETURN_SERVER_URL", "http://127.0.0.1:8787").replace(/\/$/, ""),
  deviceName: str("SAMPLER_DEVICE_NAME", "Mac Sampler"),
  sampleIntervalMin: num("SAMPLE_INTERVAL_MIN", 5),
  /** One timezone authority shared by every source. */
  timezone: timeZone(process.env.SAMPLER_TIMEZONE),
  /** Explicit replay/test clock. Unset in normal long-running operation. */
  fixedNow: fixedNow(process.env.SAMPLER_NOW),
  /** Control plane for UI — loopback only, not configurable (PRD F2: never LAN). */
  localHost: "127.0.0.1",
  localPort: num("SAMPLER_PORT", 8791),
  dataDir,
  outboxPath: join(dataDir, "outbox.db"),
  /** Stable device id file so restarts reuse registration. */
  deviceIdPath: join(dataDir, "device_id"),
  /**
   * Code roots to scan for today's local git commits.
   * Empty (default) = feature off — no git processes spawned.
   */
  gitScanDirs: dirs("GIT_SCAN_DIRS"),
  /**
   * Apple Reminders sample source. Default on; set "0"/"false" to disable.
   * Source also self-gates on darwin — non-mac always returns empty.
   */
  remindersEnabled: bool("REMINDERS_ENABLED", true),
  /**
   * Optional override path to VS Code / Cursor `state.vscdb`.
   * Empty (default) = auto-detect common Code / Insiders / Cursor locations.
   */
  vscodeStateDb: str("VSCODE_STATE_DB", ""),
  /**
   * VS Code recent-projects source. Default on when a db path is found;
   * set `VSCODE_ENABLED=0` / `false` to disable.
   */
  vscodeEnabled: bool("VSCODE_ENABLED", true),
  /**
   * Optional absolute path override for a single Chrome History SQLite file.
   * When set, auto-detect is skipped.
   */
  chromeHistoryPath: str("CHROME_HISTORY_PATH", ""),
  /**
   * Default on when History file(s) exist. Set "0"/"false" to disable.
   * (Existence check happens at sample time; this flag only forces off.)
   */
  chromeHistoryEnabled: bool("CHROME_HISTORY_ENABLED", true),
  /** Max visits per sample tick across all History DBs (positive int; bad env → 100). */
  chromeHistoryLimit: positiveInt("CHROME_HISTORY_LIMIT", 100),
  safariHistoryPath: str("SAFARI_HISTORY_PATH", ""),
  safariHistoryEnabled: bool("SAFARI_HISTORY_ENABLED", true),
  safariHistoryLimit: positiveInt("SAFARI_HISTORY_LIMIT", 100),
} as const;
