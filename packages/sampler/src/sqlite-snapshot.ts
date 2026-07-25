/**
 * Copy a live SQLite DB to a temp path, including WAL/SHM side-cars.
 *
 * Apps that keep the DB open (Chrome, VS Code, …) often leave recent pages
 * only in the WAL until checkpoint. Copying the main file alone silently
 * drops those rows / keys, so an existing side-car must copy successfully.
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
    copyFileSync(side, `${tmpPath}${suffix}`);
  }
}

export async function copySqliteWithWal(srcPath: string, tmpPath: string): Promise<void> {
  await copyFile(srcPath, tmpPath);
  for (const suffix of SQLITE_WAL_SUFFIXES) {
    const side = `${srcPath}${suffix}`;
    if (!existsSync(side)) continue;
    await copyFile(side, `${tmpPath}${suffix}`);
  }
}

export function unlinkSqliteSnapshotSync(tmpPath: string): void {
  for (const suffix of ["", ...SQLITE_WAL_SUFFIXES]) {
    try {
      unlinkSync(`${tmpPath}${suffix}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}

export async function unlinkSqliteSnapshot(tmpPath: string): Promise<void> {
  for (const suffix of ["", ...SQLITE_WAL_SUFFIXES]) {
    try {
      await unlink(`${tmpPath}${suffix}`);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
  }
}
