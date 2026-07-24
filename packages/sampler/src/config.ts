import { homedir } from "node:os";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

/** Comma-separated dirs → absolute paths; empty default disables git scan. */
function dirs(name: string): string[] {
  const raw = process.env[name] ?? "";
  if (!raw.trim()) return [];
  const home = homedir();
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((p) => (p === "~" ? home : p.startsWith("~/") ? join(home, p.slice(2)) : p));
}

const dataDir = str("SAMPLER_DATA_DIR", join(homedir(), ".return", "sampler"));

export const config = {
  /** Pi base URL */
  serverUrl: str("RETURN_SERVER_URL", "http://127.0.0.1:8787").replace(/\/$/, ""),
  deviceName: str("SAMPLER_DEVICE_NAME", "Mac Sampler"),
  sampleIntervalMin: num("SAMPLE_INTERVAL_MIN", 5),
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
} as const;
