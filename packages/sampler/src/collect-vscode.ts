import { randomUUID } from "node:crypto";
/**
 * Read VS Code / Cursor recently opened projects from state.vscdb.
 *
 * Copy-then-open (VS Code may lock the live DB). state.vscdb uses WAL while
 * the editor is open — copy includes -wal/-shm via copySqliteWithWalSync so
 * recent ItemTable keys are not silently dropped.
 */
import { existsSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { copySqliteWithWalSync, unlinkSqliteSnapshotSync } from "./sqlite-snapshot.js";

export interface VscodeRecent {
  /** Original uri string from VS Code. */
  uri: string;
  /** file:// decoded path when applicable; otherwise uri. */
  path: string;
  kind: "folder" | "file" | "workspace";
  /** "code" | "code-insiders" | "cursor" | "custom" */
  editor: string;
  /** basename of path */
  label: string;
}

const MAX_RECENTS = 30;

const PRIMARY_KEY = "history.recentlyOpenedPathsList";
const SECONDARY_KEY = "workbench.projects.recent.entries";

export type VscodeEditor = "code" | "code-insiders" | "cursor" | "custom";

export interface ResolvedVscodeDb {
  path: string;
  editor: VscodeEditor;
}

/** Expand leading `~` to homedir; leave other paths as-is. */
export function expandHome(p: string): string {
  if (p === "~") return homedir();
  if (p.startsWith("~/") || p.startsWith("~\\")) return join(homedir(), p.slice(2));
  return p;
}

/**
 * Candidate state.vscdb paths in first-existing-wins order for this platform.
 */
export function defaultVscodeDbCandidates(): Array<{
  path: string;
  editor: VscodeEditor;
}> {
  const home = homedir();
  const platform = process.platform;
  if (platform === "darwin") {
    const base = join(home, "Library", "Application Support");
    return [
      {
        path: join(base, "Code", "User", "globalStorage", "state.vscdb"),
        editor: "code",
      },
      {
        path: join(base, "Code - Insiders", "User", "globalStorage", "state.vscdb"),
        editor: "code-insiders",
      },
      {
        path: join(base, "Cursor", "User", "globalStorage", "state.vscdb"),
        editor: "cursor",
      },
    ];
  }
  if (platform === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return [
      {
        path: join(appData, "Code", "User", "globalStorage", "state.vscdb"),
        editor: "code",
      },
      {
        path: join(appData, "Code - Insiders", "User", "globalStorage", "state.vscdb"),
        editor: "code-insiders",
      },
      {
        path: join(appData, "Cursor", "User", "globalStorage", "state.vscdb"),
        editor: "cursor",
      },
    ];
  }
  // linux + others
  const config = join(home, ".config");
  return [
    {
      path: join(config, "Code", "User", "globalStorage", "state.vscdb"),
      editor: "code",
    },
    {
      path: join(config, "Code - Insiders", "User", "globalStorage", "state.vscdb"),
      editor: "code-insiders",
    },
    {
      path: join(config, "Cursor", "User", "globalStorage", "state.vscdb"),
      editor: "cursor",
    },
  ];
}

/**
 * Resolve which state.vscdb to read.
 * If override is set, use only that path (editor=custom).
 * Otherwise first existing auto-detect candidate wins.
 */
export function resolveVscodeStateDb(override = ""): ResolvedVscodeDb | null {
  const raw = override.trim();
  if (raw) {
    const path = expandHome(raw);
    if (!existsSync(path)) {
      throw new Error(`configured VS Code database does not exist: ${path}`);
    }
    return { path, editor: "custom" };
  }
  for (const c of defaultVscodeDbCandidates()) {
    if (existsSync(c.path)) return c;
  }
  return null;
}

/** Decode file:// URIs; leave other schemes / bare paths as-is. */
export function uriToPath(uri: string): string {
  if (!uri.startsWith("file:")) return uri;
  return fileURLToPath(uri);
}

/**
 * Pure parser for `history.recentlyOpenedPathsList` JSON.
 * Array order is recent-first; capped at MAX_RECENTS.
 */
export function parseRecentlyOpened(json: string, editor: string): VscodeRecent[] {
  if (!json.trim()) throw new Error("invalid VS Code recents: empty JSON");
  const data: unknown = JSON.parse(json);
  if (!data || typeof data !== "object") {
    throw new Error("invalid VS Code recents: expected an object");
  }
  const entries = (data as { entries?: unknown }).entries;
  if (!Array.isArray(entries)) {
    throw new Error("invalid VS Code recents: entries must be an array");
  }

  const out: VscodeRecent[] = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== "object") {
      throw new Error("invalid VS Code recents: entry must be an object");
    }
    const e = entry as Record<string, unknown>;
    let uri: string | null = null;
    let kind: VscodeRecent["kind"] | null = null;

    if (typeof e.folderUri === "string" && e.folderUri) {
      uri = e.folderUri;
      kind = "folder";
    } else if (typeof e.fileUri === "string" && e.fileUri) {
      uri = e.fileUri;
      kind = "file";
    } else if (e.workspace && typeof e.workspace === "object") {
      const ws = e.workspace as Record<string, unknown>;
      if (typeof ws.configPath === "string" && ws.configPath) {
        uri = ws.configPath;
        kind = "workspace";
      }
    }
    if (!uri || !kind) continue;

    const path = uriToPath(uri);
    out.push({
      uri,
      path,
      kind,
      editor,
      label: basename(path.replace(/[/\\]+$/, "")) || path,
    });
    if (out.length >= MAX_RECENTS) break;
  }
  return out;
}

/**
 * Copy state.vscdb (+ WAL/SHM when present) to a temp file, read ItemTable
 * keys, close + unlink.
 */
export function readRecentlyOpenedJson(dbPath: string): string | null {
  const tmp = join(tmpdir(), `return-vscode-${randomUUID()}.vscdb`);
  let db: DatabaseSync | null = null;
  try {
    copySqliteWithWalSync(dbPath, tmp);
    db = new DatabaseSync(tmp, { readOnly: true });
    const stmt = db.prepare(`SELECT key, value FROM ItemTable WHERE key IN (?, ?)`);
    const rows = stmt.all(PRIMARY_KEY, SECONDARY_KEY) as Array<{
      key: string;
      value: unknown;
    }>;
    let primary: string | null = null;
    let secondary: string | null = null;
    for (const row of rows) {
      const value =
        typeof row.value === "string"
          ? row.value
          : row.value == null
            ? null
            : Buffer.isBuffer(row.value)
              ? row.value.toString("utf8")
              : String(row.value);
      if (row.key === PRIMARY_KEY) primary = value;
      else if (row.key === SECONDARY_KEY) secondary = value;
    }
    // Both keys are real schemas used by supported editor versions.
    return primary ?? secondary;
  } finally {
    db?.close();
    unlinkSqliteSnapshotSync(tmp);
  }
}

/** Collect recent projects from an existing state.vscdb path. */
export async function collectVscodeRecents(
  dbPath: string,
  editor = "code",
): Promise<VscodeRecent[]> {
  const json = readRecentlyOpenedJson(dbPath);
  if (!json) {
    throw new Error("VS Code database contains no supported recent-projects key");
  }
  return parseRecentlyOpened(json, editor);
}
