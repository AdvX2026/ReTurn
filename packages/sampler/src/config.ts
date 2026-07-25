import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { config as loadEnv } from "dotenv";
import type { GmailConfig } from "./collect-gmail.js";

loadEnv();

function positiveNumber(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`invalid ${name}: expected a positive number`);
  }
  return n;
}

/**
 * Positive integer only (e.g. SQLite LIMIT binds).
 * Exported for unit tests.
 */
export function positiveInt(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  const n = Number(v);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) {
    throw new Error(`invalid ${name}: expected a positive integer`);
  }
  return n;
}

function port(name: string, defaultValue: number): number {
  const value = positiveInt(name, defaultValue);
  if (value > 65_535) throw new Error(`invalid ${name}: expected a TCP port`);
  return value;
}

function str(name: string, defaultValue = ""): string {
  return process.env[name] ?? defaultValue;
}

export function parseTimeZone(value?: string): string {
  const candidate =
    value?.trim() || Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate }).format();
    return candidate;
  } catch {
    throw new Error(`invalid SAMPLER_TIMEZONE: ${candidate}`);
  }
}

export function parseFixedNow(value?: string): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error("invalid SAMPLER_NOW: expected an ISO-8601 timestamp");
  }
  return parsed;
}

/** Explicit boolean parser; invalid configured values fail fast. */
function bool(name: string, defaultValue: boolean): boolean {
  const v = process.env[name]?.trim();
  if (v === undefined || v === "") return defaultValue;
  const lower = v.toLowerCase();
  if (lower === "0" || lower === "false" || lower === "off" || lower === "no") {
    return false;
  }
  if (lower === "1" || lower === "true" || lower === "on" || lower === "yes") {
    return true;
  }
  throw new Error(`invalid ${name}: expected a boolean`);
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

/**
 * Gmail IMAP config. Requires both user + app password; either empty = off
 * (no connection ever opened, behaviour identical to current).
 */
function gmailConfig(): GmailConfig | null {
  const user = str("GMAIL_IMAP_USER").trim();
  const password = str("GMAIL_IMAP_PASSWORD");
  if (!user && !password) return null;
  if (!user || !password) {
    throw new Error(
      "invalid Gmail configuration: GMAIL_IMAP_USER and GMAIL_IMAP_PASSWORD are both required",
    );
  }
  const host = str("GMAIL_IMAP_HOST", "imap.gmail.com").trim();
  if (!host) throw new Error("invalid GMAIL_IMAP_HOST: expected a hostname");
  return {
    user,
    password,
    host,
    port: port("GMAIL_IMAP_PORT", 993),
  };
}

export const config = {
  /** Pi base URL */
  serverUrl: str("RETURN_SERVER_URL", "http://127.0.0.1:8787").replace(/\/$/, ""),
  deviceName: str("SAMPLER_DEVICE_NAME", "Mac Sampler"),
  /** Daytime / pre-Save sample period (PRD F2 active cadence). */
  sampleIntervalMin: positiveNumber("SAMPLE_INTERVAL_MIN", 5),
  /** After Save (night cadence). */
  sampleIntervalNightMin: positiveNumber("SAMPLE_INTERVAL_NIGHT_MIN", 30),
  /** One timezone authority shared by every source. */
  timezone: parseTimeZone(process.env.SAMPLER_TIMEZONE),
  /** Explicit replay/test clock. Unset in normal long-running operation. */
  fixedNow: parseFixedNow(process.env.SAMPLER_NOW),
  /** Control plane for UI — loopback only, not configurable (PRD F2: never LAN). */
  localHost: "127.0.0.1",
  localPort: port("SAMPLER_PORT", 8791),
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
   * Gmail IMAP account for the email source. null (default) = feature off —
   * no IMAP connection is opened.
   */
  gmail: gmailConfig(),
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
  /** Max visits per sample tick across all History DBs. Invalid values fail startup. */
  chromeHistoryLimit: positiveInt("CHROME_HISTORY_LIMIT", 100),
  safariHistoryPath: str("SAFARI_HISTORY_PATH", ""),
  safariHistoryEnabled: bool("SAFARI_HISTORY_ENABLED", true),
  safariHistoryLimit: positiveInt("SAFARI_HISTORY_LIMIT", 100),
} as const;
