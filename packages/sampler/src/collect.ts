import { execFile } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { type NodeInput, uuidFromSeed } from "@return/shared";

const execFileAsync = promisify(execFile);

export interface SampleSnapshot {
  app: { name: string; bundleId?: string } | null;
  tabs: Array<{ browser: string; title: string; url: string }>;
  agents: Array<{
    project: string;
    start: string;
    end: string;
    duration_min: number;
    session_id?: string;
  }>;
  at: string;
  platform: NodeJS.Platform;
}

/** Keys of agent sessions already enqueued this process lifetime. */
const seenAgentKeys = new Set<string>();

/** Test helper: clear in-process agent dedupe (simulates process restart). */
export function resetSeenAgentKeys(): void {
  seenAgentKeys.clear();
}

export function todayLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function collectSnapshot(): Promise<SampleSnapshot> {
  const at = new Date().toISOString();
  const platform = process.platform;

  if (platform !== "darwin") {
    // Non-macOS: still parse agent sessions; app/tabs unavailable.
    return {
      app: null,
      tabs: [],
      agents: await parseAgentSessions().catch(() => []),
      at,
      platform,
    };
  }

  const [app, tabs, agents] = await Promise.all([
    frontmostApp().catch(() => null),
    browserTabs().catch(() => []),
    parseAgentSessions().catch(() => []),
  ]);

  return { app, tabs, agents, at, platform };
}

export function snapshotToNodes(snap: SampleSnapshot): NodeInput[] {
  const nodes: NodeInput[] = [];
  const date = todayLocal();
  const ts = snap.at;

  if (snap.app?.name) {
    nodes.push({
      client_uuid: crypto.randomUUID(),
      kind: "app_sample",
      title: snap.app.name,
      content: snap.app.name,
      source_meta: {
        app: snap.app.name,
        bundle_id: snap.app.bundleId,
        sampled_at: ts,
      },
      client_created_at: ts,
      date,
    });
  }

  for (const t of snap.tabs.slice(0, 40)) {
    nodes.push({
      client_uuid: crypto.randomUUID(),
      kind: "tab_sample",
      title: t.title || t.url,
      content: t.url,
      source_meta: {
        browser: t.browser,
        url: t.url,
        title: t.title,
        sampled_at: ts,
      },
      client_created_at: ts,
      date,
    });
  }

  for (const a of snap.agents) {
    const key = `${a.project}|${a.start}|${a.session_id ?? ""}`;
    if (seenAgentKeys.has(key)) continue;
    seenAgentKeys.add(key);
    // Deterministic client_uuid so Pi dedupes across sampler restarts (Codex P1/P2).
    nodes.push({
      client_uuid: uuidFromSeed(`agent:${key}`),
      kind: "agent_session",
      title: a.project,
      content: `${a.project} ${Math.round(a.duration_min)}min`,
      source_meta: {
        project: a.project,
        start: a.start,
        end: a.end,
        duration_min: a.duration_min,
        session_id: a.session_id,
      },
      client_created_at: a.end,
      date,
    });
  }

  if (seenAgentKeys.size > 500) {
    const keep = [...seenAgentKeys].slice(-200);
    seenAgentKeys.clear();
    for (const k of keep) seenAgentKeys.add(k);
  }

  return nodes;
}

/** Full environment snapshot node + raw samples (Save end-of-day). */
export function snapshotWithMetaNodes(snap: SampleSnapshot): NodeInput[] {
  const nodes = snapshotToNodes(snap);
  nodes.push({
    client_uuid: crypto.randomUUID(),
    kind: "snapshot",
    title: "Environment snapshot",
    content: JSON.stringify({
      app: snap.app,
      tabs: snap.tabs.map((t) => ({
        title: t.title,
        url: t.url,
        browser: t.browser,
      })),
      agent_count: snap.agents.length,
      at: snap.at,
    }),
    source_meta: {
      at: snap.at,
      tab_count: snap.tabs.length,
      agent_count: snap.agents.length,
    },
    client_created_at: snap.at,
    date: todayLocal(),
  });
  return nodes;
}

// ── macOS AppleScript ────────────────────────────────────

async function osascript(script: string): Promise<string> {
  const { stdout } = await execFileAsync("osascript", ["-e", script], {
    timeout: 15_000,
    maxBuffer: 2 * 1024 * 1024,
  });
  return String(stdout).trim();
}

async function frontmostApp(): Promise<{ name: string; bundleId?: string } | null> {
  const script = `
    tell application "System Events"
      set p to first application process whose frontmost is true
      set n to name of p
      try
        set b to bundle identifier of p
      on error
        set b to ""
      end try
      return n & linefeed & b
    end tell
  `;
  const raw = await osascript(script);
  const [name, bundleId] = raw.split("\n");
  if (!name?.trim()) return null;
  return { name: name.trim(), bundleId: bundleId?.trim() || undefined };
}

async function browserTabs(): Promise<
  Array<{ browser: string; title: string; url: string }>
> {
  const tabs: Array<{ browser: string; title: string; url: string }> = [];

  try {
    const raw = await osascript(`
      tell application "System Events"
        set chromeRunning to (name of processes) contains "Google Chrome"
      end tell
      if chromeRunning then
        tell application "Google Chrome"
          set out to ""
          repeat with w in windows
            repeat with t in tabs of w
              set out to out & (title of t) & tab & (URL of t) & linefeed
            end repeat
          end repeat
          return out
        end tell
      else
        return ""
      end if
    `);
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const [title, url] = line.split("\t");
      if (url) tabs.push({ browser: "Chrome", title: title || "", url });
    }
  } catch {
    /* not running / not authorized */
  }

  try {
    const raw = await osascript(`
      tell application "System Events"
        set safariRunning to (name of processes) contains "Safari"
      end tell
      if safariRunning then
        tell application "Safari"
          set out to ""
          repeat with w in windows
            repeat with t in tabs of w
              set out to out & (name of t) & tab & (URL of t) & linefeed
            end repeat
          end repeat
          return out
        end tell
      else
        return ""
      end if
    `);
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      const [title, url] = line.split("\t");
      if (url) tabs.push({ browser: "Safari", title: title || "", url });
    }
  } catch {
    /* not running / not authorized */
  }

  return tabs;
}

/**
 * Parse Claude Code sessions from ~/.claude/projects/ (jsonl files).
 * Only timestamps + project path (PRD §9.12). Failures are silent.
 */
export async function parseAgentSessions(): Promise<SampleSnapshot["agents"]> {
  const root = join(homedir(), ".claude", "projects");
  let projectDirs: string[] = [];
  try {
    const entries = await readdir(root, { withFileTypes: true });
    projectDirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return [];
  }

  const today = todayLocal();
  const agents: SampleSnapshot["agents"] = [];

  for (const dir of projectDirs) {
    const projectPath = join(root, dir);
    let files: string[] = [];
    try {
      const entries = await readdir(projectPath, { withFileTypes: true });
      files = entries
        .filter((e) => e.isFile() && e.name.endsWith(".jsonl"))
        .map((e) => e.name);
    } catch {
      continue;
    }

    for (const file of files) {
      let text = "";
      try {
        text = await readFile(join(projectPath, file), "utf8");
      } catch {
        continue;
      }

      const times: number[] = [];
      for (const line of text.split("\n")) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as Record<string, unknown>;
          const ts =
            (typeof obj.timestamp === "string" && obj.timestamp) ||
            (typeof obj.time === "string" && obj.time) ||
            (typeof obj.ts === "number" ? new Date(obj.ts).toISOString() : null);
          if (!ts) continue;
          const d = new Date(ts);
          if (Number.isNaN(d.getTime())) continue;
          const local = todayLocal(d);
          if (local !== today) continue;
          times.push(d.getTime());
        } catch {
          /* skip bad line */
        }
      }
      if (times.length === 0) continue;
      times.sort((a, b) => a - b);
      const start = new Date(times[0]!).toISOString();
      const end = new Date(times[times.length - 1]!).toISOString();
      const duration_min = Math.max(1, (times[times.length - 1]! - times[0]!) / 60_000);
      const project = dir.replace(/^-/, "").replace(/-/g, "/");
      agents.push({
        project,
        start,
        end,
        duration_min,
        session_id: file.replace(/\.jsonl$/, ""),
      });
    }
  }

  return agents;
}
