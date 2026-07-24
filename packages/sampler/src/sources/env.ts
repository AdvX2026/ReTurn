/**
 * Environment SampleSource — frontmost app + browser tabs (macOS only).
 * Non-darwin: empty nodes, null app.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { NodeInput } from "@return/shared";
import type { SampleContext, SampleSource, SourceResult } from "../source.js";

const execFileAsync = promisify(execFile);

export interface EnvState {
  app: { name: string; bundleId?: string } | null;
  tabs: Array<{ browser: string; title: string; url: string }>;
}

/** Last env state — read by orchestrator for SampleSnapshot / status. */
let lastEnv: EnvState = { app: null, tabs: [] };

export function getLastEnv(): EnvState {
  return lastEnv;
}

export const envSource: SampleSource = {
  id: "env",
  async sample(ctx: SampleContext): Promise<SourceResult> {
    if (ctx.platform !== "darwin") {
      lastEnv = { app: null, tabs: [] };
      return { nodes: [], stats: { app: 0, tabs: 0 } };
    }

    const [app, tabs] = await Promise.all([frontmostApp(), browserTabs()]);
    lastEnv = { app, tabs };

    const nodes: NodeInput[] = [];
    const date = ctx.day;
    const ts = ctx.at;

    if (app?.name) {
      nodes.push({
        client_uuid: crypto.randomUUID(),
        kind: "app_sample",
        title: app.name,
        content: app.name,
        source_meta: {
          app: app.name,
          bundle_id: app.bundleId,
          sampled_at: ts,
        },
        client_created_at: ts,
        date,
      });
    }

    for (const t of tabs.slice(0, 40)) {
      nodes.push({
        client_uuid: crypto.randomUUID(),
        kind: "tab_sample",
        title: t.title || null,
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

    return {
      nodes,
      stats: { app: app?.name ? 1 : 0, tabs: tabs.length },
    };
  },
};

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

async function browserTabs(): Promise<EnvState["tabs"]> {
  const tabs: EnvState["tabs"] = [];

  const chrome = await osascript(`
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
  for (const line of chrome.split("\n")) {
    if (!line.trim()) continue;
    const [title, url] = line.split("\t");
    if (url) tabs.push({ browser: "Chrome", title: title || "", url });
  }

  const safari = await osascript(`
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
  for (const line of safari.split("\n")) {
    if (!line.trim()) continue;
    const [title, url] = line.split("\t");
    if (url) tabs.push({ browser: "Safari", title: title || "", url });
  }

  return tabs;
}
