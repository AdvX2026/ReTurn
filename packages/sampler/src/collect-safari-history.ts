/**
 * Safari History.db reader (macOS).
 *
 * Safari stores recent rows in SQLite/WAL and protects the live database with
 * macOS privacy controls. Copy first, then query the snapshot read-only.
 */
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { BrowseVisit } from "./collect-chrome-history.js";
import { copySqliteWithWal, unlinkSqliteSnapshot } from "./sqlite-snapshot.js";

const SAFARI_EPOCH_MS = Date.UTC(2001, 0, 1);

export function safariTimeToIso(seconds: number): string {
  return new Date(SAFARI_EPOCH_MS + seconds * 1000).toISOString();
}

export function isoToSafariTime(iso: string): number {
  return (Date.parse(iso) - SAFARI_EPOCH_MS) / 1000;
}

export function resolveSafariHistoryPath(override?: string): string | null {
  const configured = override?.trim();
  if (configured) {
    if (!existsSync(configured)) {
      throw new Error(`configured Safari history database does not exist: ${configured}`);
    }
    return configured;
  }
  const path = join(homedir(), "Library", "Safari", "History.db");
  return existsSync(path) ? path : null;
}

export async function collectSafariHistory(
  path: string,
  limit: number,
  range: { start: string; end: string },
): Promise<BrowseVisit[]> {
  if (limit <= 0) return [];
  const tmpRoot = await mkdtemp(join(tmpdir(), "return-safari-hist-"));
  const tmpPath = join(tmpRoot, "History.db");

  let db: DatabaseSync | null = null;
  try {
    await copySqliteWithWal(path, tmpPath);
    db = new DatabaseSync(tmpPath, { readOnly: true });
    const rows = db
      .prepare(
        `SELECT v.id AS visit_id, i.url AS url, COALESCE(v.title, '') AS title,
                v.visit_time AS visit_time
         FROM history_visits v
         JOIN history_items i ON i.id = v.history_item
         WHERE v.visit_time >= ? AND v.visit_time < ?
         ORDER BY v.visit_time DESC
         LIMIT ?`,
      )
      .all(isoToSafariTime(range.start), isoToSafariTime(range.end), limit) as Array<{
      visit_id: number;
      url: string;
      title: string;
      visit_time: number;
    }>;
    return rows.map((row) => ({
      visitId: row.visit_id,
      url: row.url,
      title: row.title,
      visitedAt: safariTimeToIso(row.visit_time),
      browser: "safari",
      profile: "Default",
    }));
  } finally {
    db?.close();
    await unlinkSqliteSnapshot(tmpPath);
    await rm(tmpRoot, { recursive: true, force: true });
  }
}
