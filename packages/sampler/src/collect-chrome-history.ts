/**
 * Chrome / Chromium / Edge / Brave History SQLite reader.
 *
 * Chrome locks the live History DB — always copy to a temp file before open.
 * History uses WAL: recent visits often live only in History-wal until
 * checkpoint, so the snapshot must include -wal/-shm when present.
 * Failures are silent (return []); never block the sample tick.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { copySqliteWithWal, unlinkSqliteSnapshot } from "./sqlite-snapshot.js";

// Re-export for tests / callers that previously imported from this module.
export { copySqliteWithWal } from "./sqlite-snapshot.js";

/** Microseconds between Windows FILETIME epoch (1601-01-01) and Unix epoch. */
const WEBKIT_EPOCH_OFFSET_MS = 11_644_473_600_000;

export interface BrowseVisit {
  visitId: number;
  url: string;
  title: string;
  /** UTC ISO */
  visitedAt: string;
  browser: string;
  profile: string;
}

export interface HistoryDbPath {
  path: string;
  browser: string;
  profile: string;
}

/**
 * Chrome WebKit µs → UTC ISO.
 * Accepts bigint (preferred — µs exceed Number.MAX_SAFE_INTEGER) or number.
 */
export function chromeTimeToIso(chromeTs: number | bigint): string {
  // ms-since-1601 stays within safe integer (~1.3e13 for 2026); only µs overflows.
  const us = typeof chromeTs === "bigint" ? chromeTs : BigInt(Math.trunc(chromeTs));
  const epochMs = Number(us / 1000n) - WEBKIT_EPOCH_OFFSET_MS;
  return new Date(epochMs).toISOString();
}

/**
 * UTC ISO / Date → Chrome WebKit µs as bigint.
 * Must be bigint: µs values (~1.3e16) exceed Number.MAX_SAFE_INTEGER.
 */
export function isoToChromeTime(d: Date | string): bigint {
  const ms = typeof d === "string" ? Date.parse(d) : d.getTime();
  return BigInt(ms + WEBKIT_EPOCH_OFFSET_MS) * 1000n;
}

/**
 * Local-calendar-day range as Chrome WebKit µs timestamps (bigint).
 * start inclusive / end exclusive — local midnight today → tomorrow.
 */
export function localDayChromeRange(d = new Date()): {
  start: bigint;
  end: bigint;
} {
  const startLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endLocal = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
  return {
    start: isoToChromeTime(startLocal),
    end: isoToChromeTime(endLocal),
  };
}

/** Hard cap on concurrent History DBs (profiles × browsers). */
const MAX_HISTORY_DBS = 4;

/**
 * Resolve candidate History DB paths for the current platform.
 * Override (single path) short-circuits auto-detect.
 */
export function resolveHistoryPaths(
  platform: NodeJS.Platform = process.platform,
  override?: string,
): HistoryDbPath[] {
  if (override?.trim()) {
    const p = expandHome(override.trim());
    if (!existsSync(p)) return [];
    return [{ path: p, browser: "chrome", profile: profileFromPath(p) }];
  }

  const home = homedir();
  const candidates: HistoryDbPath[] = [];

  if (platform === "darwin") {
    pushProfiles(
      candidates,
      join(home, "Library/Application Support/Google/Chrome"),
      "chrome",
    );
    pushProfiles(
      candidates,
      join(home, "Library/Application Support/Chromium"),
      "chromium",
    );
    pushProfiles(
      candidates,
      join(home, "Library/Application Support/BraveSoftware/Brave-Browser"),
      "brave",
    );
    pushProfiles(
      candidates,
      join(home, "Library/Application Support/Microsoft Edge"),
      "edge",
    );
  } else if (platform === "win32") {
    const local = process.env.LOCALAPPDATA ?? join(home, "AppData", "Local");
    // Chrome/Edge/Brave on Windows use "User Data" under the product dir.
    pushProfiles(candidates, join(local, "Google", "Chrome", "User Data"), "chrome");
    pushProfiles(candidates, join(local, "Google", "Chrome"), "chrome");
    pushProfiles(candidates, join(local, "Microsoft", "Edge", "User Data"), "edge");
    pushProfiles(candidates, join(local, "Microsoft", "Edge"), "edge");
    pushProfiles(
      candidates,
      join(local, "BraveSoftware", "Brave-Browser", "User Data"),
      "brave",
    );
    pushProfiles(candidates, join(local, "BraveSoftware", "Brave-Browser"), "brave");
  } else {
    // linux + others
    pushProfiles(candidates, join(home, ".config/google-chrome"), "chrome");
    pushProfiles(candidates, join(home, ".config/chromium"), "chromium");
    pushProfiles(candidates, join(home, ".config/BraveSoftware/Brave-Browser"), "brave");
    pushProfiles(candidates, join(home, ".config/microsoft-edge"), "edge");
  }

  // Deduplicate by absolute path, keep first MAX_HISTORY_DBS.
  const seen = new Set<string>();
  const out: HistoryDbPath[] = [];
  for (const c of candidates) {
    if (seen.has(c.path)) continue;
    if (!existsSync(c.path)) continue;
    seen.add(c.path);
    out.push(c);
    if (out.length >= MAX_HISTORY_DBS) break;
  }
  return out;
}

function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

function profileFromPath(p: string): string {
  // .../Default/History → Default
  const parent = basename(dirname(p));
  return parent || "Default";
}

/**
 * Push Default + common Profile * History files under a browser user-data root.
 * Also accepts a root that itself is already a profile dir containing History.
 */
function pushProfiles(out: HistoryDbPath[], userDataRoot: string, browser: string): void {
  if (!existsSync(userDataRoot)) return;

  // Direct History under root (override / unusual layout)
  const direct = join(userDataRoot, "History");
  if (existsSync(direct)) {
    out.push({
      path: direct,
      browser,
      profile: basename(userDataRoot) || "Default",
    });
  }

  // Standard layout: <root>/Default/History, <root>/Profile 1/History, ...
  // Spec: at least Default + Profile 1; also cover Profile 2/3.
  for (const name of ["Default", "Profile 1", "Profile 2", "Profile 3"]) {
    const hist = join(userDataRoot, name, "History");
    if (existsSync(hist)) {
      out.push({ path: hist, browser, profile: name });
    }
  }
}

/**
 * Collect today's browse visits from the given History DBs.
 * Total cap is `limit` across all DBs (newest first after merge).
 */
export async function collectChromeHistory(
  paths: HistoryDbPath[],
  limit = 100,
  range?: { start: string; end: string },
): Promise<BrowseVisit[]> {
  if (paths.length === 0 || limit <= 0) return [];

  const { start, end } = range
    ? {
        start: isoToChromeTime(range.start),
        end: isoToChromeTime(range.end),
      }
    : localDayChromeRange();
  const perDb = await Promise.all(
    paths.map((p) =>
      readHistoryDb(p, start, end, limit).catch(() => [] as BrowseVisit[]),
    ),
  );

  const all = perDb.flat();
  all.sort((a, b) =>
    a.visitedAt < b.visitedAt ? 1 : a.visitedAt > b.visitedAt ? -1 : 0,
  );
  return all.slice(0, limit);
}

async function readHistoryDb(
  db: HistoryDbPath,
  start: bigint,
  end: bigint,
  limit: number,
): Promise<BrowseVisit[]> {
  const tmpRoot = await mkdtemp(join(tmpdir(), "return-chrome-hist-"));
  const tmpPath = join(tmpRoot, "History");
  try {
    await copySqliteWithWal(db.path, tmpPath);
  } catch {
    // Chrome may hold a short lock — silent fail
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
    return [];
  }

  let sqlite: DatabaseSync | null = null;
  try {
    // readBigInts: visit_time µs (~1.3e16) exceeds Number.MAX_SAFE_INTEGER;
    // without this, node:sqlite throws RangeError on row materialization.
    sqlite = new DatabaseSync(tmpPath, { readOnly: true, readBigInts: true });
    const rows = sqlite
      .prepare(
        `SELECT v.id as visit_id, u.url as url, u.title as title, v.visit_time as visit_time
         FROM visits v
         JOIN urls u ON u.id = v.url
         WHERE v.visit_time >= ? AND v.visit_time < ?
         ORDER BY v.visit_time DESC
         LIMIT ?`,
      )
      .all(start, end, limit) as Array<{
      visit_id: number | bigint;
      url: string;
      title: string | null;
      visit_time: number | bigint;
    }>;

    return rows.map((r) => ({
      visitId: Number(r.visit_id),
      url: String(r.url ?? ""),
      title: String(r.title ?? ""),
      visitedAt: chromeTimeToIso(r.visit_time),
      browser: db.browser,
      profile: db.profile,
    }));
  } catch {
    return [];
  } finally {
    try {
      sqlite?.close();
    } catch {
      /* ignore */
    }
    await unlinkSqliteSnapshot(tmpPath);
    await rm(tmpRoot, { recursive: true, force: true }).catch(() => undefined);
  }
}
