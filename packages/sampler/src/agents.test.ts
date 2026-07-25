import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  collectAgentIntervals,
  decodeClaudeProjectDir,
  extractTimestamp,
  gapSplit,
} from "./agents.js";
import { createSampleContext } from "./source.js";

const tmpDirs: string[] = [];

afterEach(() => {
  while (tmpDirs.length) {
    const d = tmpDirs.pop()!;
    rmSync(d, { recursive: true, force: true });
  }
});

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "return-agents-"));
  tmpDirs.push(d);
  return d;
}

function writeJsonl(path: string, events: unknown[]): void {
  mkdirSync(join(path, ".."), { recursive: true });
  writeFileSync(path, `${events.map((e) => JSON.stringify(e)).join("\n")}\n`);
}

describe("gapSplit", () => {
  it("single cluster → one closed interval when cool", () => {
    const t0 = Date.parse("2026-07-24T01:00:00.000Z");
    const t1 = Date.parse("2026-07-24T01:10:00.000Z");
    const now = Date.parse("2026-07-24T02:00:00.000Z"); // 50min after last
    const iv = gapSplit([t0, t1], 15 * 60_000, now);
    assert.equal(iv.length, 1);
    assert.equal(iv[0]!.start, t0);
    assert.equal(iv[0]!.end, t1);
    assert.equal(iv[0]!.open, false);
  });

  it("severs on gap > threshold", () => {
    const a = Date.parse("2026-07-24T01:00:00.000Z");
    const b = Date.parse("2026-07-24T01:05:00.000Z");
    const c = Date.parse("2026-07-24T02:00:00.000Z"); // 55min gap
    const d = Date.parse("2026-07-24T02:10:00.000Z");
    const now = Date.parse("2026-07-24T05:00:00.000Z");
    const iv = gapSplit([a, b, c, d], 15 * 60_000, now);
    assert.equal(iv.length, 2);
    assert.deepEqual(
      iv.map((x) => [x.start, x.end, x.open]),
      [
        [a, b, false],
        [c, d, false],
      ],
    );
  });

  it("marks tail open when last event is still warm", () => {
    const a = Date.parse("2026-07-24T01:00:00.000Z");
    const b = Date.parse("2026-07-24T01:05:00.000Z");
    const now = Date.parse("2026-07-24T01:10:00.000Z"); // 5min after last
    const iv = gapSplit([a, b], 15 * 60_000, now);
    assert.equal(iv.length, 1);
    assert.equal(iv[0]!.open, true);
  });

  it("empty input → empty output", () => {
    assert.deepEqual(gapSplit([], 15_000, Date.now()), []);
  });
});

describe("extractTimestamp", () => {
  it("reads ISO timestamp / time / numeric ts", () => {
    assert.equal(
      extractTimestamp({ timestamp: "2026-07-24T01:00:00.000Z" }),
      Date.parse("2026-07-24T01:00:00.000Z"),
    );
    assert.equal(
      extractTimestamp({ time: "2026-07-24T01:00:00.000Z" }),
      Date.parse("2026-07-24T01:00:00.000Z"),
    );
    // seconds
    assert.equal(extractTimestamp({ ts: 1_721_779_200 }), 1_721_779_200_000);
    // ms
    assert.equal(extractTimestamp({ ts: 1_721_779_200_000 }), 1_721_779_200_000);
    assert.equal(extractTimestamp({}), null);
    assert.equal(extractTimestamp({ timestamp: "not-a-date" }), null);
  });
});

describe("decodeClaudeProjectDir", () => {
  it("restores leading slash path encoding", () => {
    assert.equal(
      decodeClaudeProjectDir("-Users-foo-Coding-ReTurn"),
      "/Users/foo/Coding/ReTurn",
    );
    assert.equal(decodeClaudeProjectDir("relative-proj"), "relative/proj");
  });
});

describe("collectAgentIntervals", () => {
  it("parses Claude + Codex layouts, gap-splits, prefers cwd", async () => {
    const root = tmp();
    const claudeRoot = join(root, "claude-projects");
    const codexRoot = join(root, "codex-sessions");

    // Local day for fixed "now" — build timestamps on that local calendar day.
    const now = new Date(2026, 6, 24, 18, 0, 0); // 2026-07-24 18:00 local
    const ctx = createSampleContext({
      now,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    // 09:00 and 09:10 local → one cluster; 14:00 local → second cluster (gap)
    const tMorning1 = new Date(2026, 6, 24, 9, 0, 0).toISOString();
    const tMorning2 = new Date(2026, 6, 24, 9, 10, 0).toISOString();
    const tAfternoon = new Date(2026, 6, 24, 14, 0, 0).toISOString();
    const tRecent = new Date(2026, 6, 24, 17, 55, 0).toISOString(); // 5min before now → open

    const claudeFile = join(claudeRoot, "-Users-dev-Coding-ReTurn", "sess-claude.jsonl");
    mkdirSync(join(claudeRoot, "-Users-dev-Coding-ReTurn"), { recursive: true });
    writeJsonl(claudeFile, [
      {
        type: "user",
        cwd: "/Users/dev/Coding/ReTurn",
        sessionId: "sess-claude",
        timestamp: tMorning1,
      },
      {
        type: "assistant",
        cwd: "/Users/dev/Coding/ReTurn",
        timestamp: tMorning2,
      },
      {
        type: "user",
        cwd: "/Users/dev/Coding/ReTurn",
        timestamp: tAfternoon,
      },
    ]);

    // Codex nested layout: sessions/YYYY/MM/DD/rollout-….jsonl
    const codexFile = join(codexRoot, "2026", "07", "24", "rollout-abc.jsonl");
    mkdirSync(join(codexRoot, "2026", "07", "24"), { recursive: true });
    writeJsonl(codexFile, [
      {
        type: "session_meta",
        timestamp: tRecent,
        payload: { id: "thread-1", cwd: "/Users/dev/Coding/Other" },
      },
      {
        type: "response_item",
        timestamp: tRecent,
        payload: { type: "message" },
      },
    ]);

    // Stale file: mtime forced to yesterday — must be skipped.
    const stale = join(claudeRoot, "-Users-dev-Old", "old.jsonl");
    mkdirSync(join(claudeRoot, "-Users-dev-Old"), { recursive: true });
    writeJsonl(stale, [
      {
        type: "user",
        cwd: "/Users/dev/Old",
        timestamp: new Date(2026, 6, 23, 12, 0, 0).toISOString(),
      },
    ]);
    const yesterdayMs = Date.parse(ctx.dayStart) - 60_000;
    utimesSync(stale, new Date(yesterdayMs), new Date(yesterdayMs));

    const intervals = await collectAgentIntervals({
      roots: { claude: claudeRoot, codex: codexRoot },
      now,
      dayStartMs: Date.parse(ctx.dayStart),
      dayEndMs: Date.parse(ctx.dayEnd),
      gapMs: 15 * 60_000,
    });

    // Claude: 2 closed intervals (morning + afternoon). Codex: 1 open.
    const claude = intervals.filter((i) => i.provider === "claude");
    const codex = intervals.filter((i) => i.provider === "codex");

    assert.equal(
      claude.length,
      2,
      `expected 2 claude intervals, got ${JSON.stringify(claude)}`,
    );
    assert.equal(claude[0]!.project, "/Users/dev/Coding/ReTurn");
    assert.equal(claude[0]!.session_id, "sess-claude");
    assert.equal(claude[0]!.open, false);
    assert.equal(claude[1]!.open, false);
    // afternoon is cool relative to 18:00 (4h gap)
    assert.equal(claude[1]!.start, new Date(2026, 6, 24, 14, 0, 0).toISOString());

    assert.equal(codex.length, 1);
    assert.equal(codex[0]!.project, "/Users/dev/Coding/Other");
    assert.equal(codex[0]!.session_id, "rollout-abc");
    assert.equal(codex[0]!.open, true);

    // stale never appears
    assert.equal(
      intervals.some((i) => i.session_id === "old"),
      false,
    );
  });

  it("missing roots yield empty list", async () => {
    const now = new Date(2026, 6, 24, 12, 0, 0);
    const ctx = createSampleContext({
      now,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const intervals = await collectAgentIntervals({
      roots: {
        claude: join(tmp(), "nope-claude"),
        codex: join(tmp(), "nope-codex"),
      },
      now,
      dayStartMs: Date.parse(ctx.dayStart),
      dayEndMs: Date.parse(ctx.dayEnd),
    });
    assert.deepEqual(intervals, []);
  });
});
