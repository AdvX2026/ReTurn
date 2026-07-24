/**
 * Copy a live SQLite DB to a temp path, including WAL/SHM side-cars.
 *
 * Apps that keep the DB open (Chrome, VS Code, …) often leave recent pages
 * only in the WAL until checkpoint. Copying the main file alone silently
 * drops those rows / keys. Failures on side-cars are ignored — main-only is
 * still better than aborting the sample tick.
 */
import { copyFileSync, existsSync, unlinkSync } from "node:fs";
import { copyFile, unlink } from "node:fs/promises";

/** SQLite side-car suffixes for WAL mode (must match main basename). */
export const SQLITE_WAL_SUFFIXES = ["-wal", "-shm"] as const;

export function copySqliteWithWalSync(srcPath: string, tmpPath: string): void {
  copyFileSync(srcPath, tmpPath);
  for (const suffix of SQLITE_WAL_SUFFIXES) {
    const side = `${srcPath}${suffix}`;
    if (!existsSync(side)) continue;
    try {
      copyFileSync(side, `${tmpPath}${suffix}`);
    } catch {
      // Side-car may be mid-write; main-only copy is still better than aborting.
    }
  }
}

export async function copySqliteWithWal(srcPath: string, tmpPath: string): Promise<void> {
  await copyFile(srcPath, tmpPath);
  for (const suffix of SQLITE_WAL_SUFFIXES) {
    const side = `${srcPath}${suffix}`;
    if (!existsSync(side)) continue;
    try {
      await copyFile(side, `${tmpPath}${suffix}`);
    } catch {
      // Side-car may be mid-write; main-only copy is still better than aborting.
    }
  }
}

export function unlinkSqliteSnapshotSync(tmpPath: string): void {
  for (const suffix of ["", ...SQLITE_WAL_SUFFIXES]) {
    try {
      unlinkSync(`${tmpPath}${suffix}`);
    } catch {
      /* ignore */
    }
  }
}

export async function unlinkSqliteSnapshot(tmpPath: string): Promise<void> {
  for (const suffix of ["", ...SQLITE_WAL_SUFFIXES]) {
    try {
      await unlink(`${tmpPath}${suffix}`);
    } catch {
      /* ignore */
    }
  }
}
