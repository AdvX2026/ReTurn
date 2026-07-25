import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Session } from "@return/shared";
import { resolveProfession, workBucket } from "./profession.js";

function sess(app: string, durationMin: number, kind: "app" | "agent" = "app"): Session {
  return {
    app,
    kind,
    start: "2026-07-24T01:00:00.000Z",
    end: "2026-07-24T02:00:00.000Z",
    durationMin,
  };
}

describe("workBucket", () => {
  it("maps common apps", () => {
    assert.equal(workBucket("Cursor"), "dev");
    assert.equal(workBucket("Figma"), "design");
    assert.equal(workBucket("Obsidian"), "writing");
    assert.equal(workBucket("Slack"), "social");
    assert.equal(workBucket("Google Chrome"), "browser");
  });
});

describe("resolveProfession", () => {
  it("returns generalist for empty / short days", () => {
    assert.equal(
      resolveProfession({ sessions: [], gitCommitCount: 0, agentDurationMin: 0 }),
      "generalist",
    );
    assert.equal(
      resolveProfession({
        sessions: [sess("Chrome", 10)],
        gitCommitCount: 0,
        agentDurationMin: 0,
      }),
      "generalist",
    );
  });

  it("picks coder from agent / git signals", () => {
    assert.equal(
      resolveProfession({
        sessions: [sess("Safari", 60)],
        gitCommitCount: 4,
        agentDurationMin: 90,
      }),
      "coder",
    );
  });

  it("picks designer when design sessions dominate", () => {
    assert.equal(
      resolveProfession({
        sessions: [sess("Figma", 120), sess("Chrome", 20)],
        gitCommitCount: 0,
        agentDurationMin: 0,
      }),
      "designer",
    );
  });

  it("does not double-count agent sessions already in minutes.dev", () => {
    // Figma 100 + agent 90 should stay designer; double-count would make coder.
    assert.equal(
      resolveProfession({
        sessions: [sess("Figma", 100), sess("Claude Code", 90, "agent")],
        gitCommitCount: 0,
        agentDurationMin: 90,
      }),
      "designer",
    );
  });

  it("floors dev from git when sessions under-count coding", () => {
    assert.equal(
      resolveProfession({
        sessions: [sess("Safari", 40)],
        gitCommitCount: 4,
        agentDurationMin: 0,
      }),
      "coder",
    );
  });
});
