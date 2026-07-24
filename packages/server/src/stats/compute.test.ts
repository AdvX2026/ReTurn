import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NodeRecord, Session } from "@return/shared";
import { resolveCharacterState } from "./character.js";
import {
  computeStats,
  extractHealth,
  scoreContinuity,
  scoreEnergy,
  scoreFocus,
  scoreIntake,
  scoreOutput,
} from "./compute.js";
import { agentSessionsFromNodes, aggregateAppSessions } from "./sessions.js";
import { computeStreak } from "./streak.js";

function node(
  partial: Partial<NodeRecord> & { kind: NodeRecord["kind"]; id?: string },
): NodeRecord {
  return {
    id: partial.id ?? crypto.randomUUID(),
    day_id: partial.day_id ?? "day-1",
    device_id: partial.device_id ?? null,
    kind: partial.kind,
    title: partial.title ?? null,
    content: partial.content ?? null,
    source_meta: partial.source_meta ?? null,
    client_uuid: partial.client_uuid ?? crypto.randomUUID(),
    created_at: partial.created_at ?? "2026-07-24T10:00:00.000Z",
    date: partial.date ?? "2026-07-24",
  };
}

describe("scoreIntake", () => {
  it("ignores sample nodes", () => {
    const nodes = [
      node({ kind: "app_sample", title: "Chrome" }),
      node({ kind: "tab_sample", title: "tab" }),
      node({ kind: "text", content: "hello" }),
    ];
    assert.equal(scoreIntake(nodes) > 0, true);
    assert.equal(scoreIntake(nodes.filter((n) => n.kind === "app_sample")), 0);
  });

  it("rewards diversity", () => {
    const mono = [node({ kind: "text" }), node({ kind: "text" }), node({ kind: "text" })];
    const diverse = [
      node({ kind: "text" }),
      node({ kind: "url" }),
      node({ kind: "voice" }),
    ];
    assert.ok(scoreIntake(diverse) > scoreIntake(mono));
  });
});

describe("scoreFocus", () => {
  it("high HHI + long session → high focus", () => {
    const sessions: Session[] = [
      {
        app: "Cursor",
        kind: "app",
        start: "2026-07-24T09:00:00.000Z",
        end: "2026-07-24T11:00:00.000Z",
        durationMin: 120,
      },
    ];
    const s = scoreFocus(sessions, []);
    assert.ok(s >= 70, `expected >=70 got ${s}`);
  });

  it("scattered short sessions → lower focus", () => {
    const sessions: Session[] = Array.from({ length: 8 }, (_, i) => ({
      app: `App${i}`,
      kind: "app" as const,
      start: `2026-07-24T0${i}:00:00.000Z`,
      end: `2026-07-24T0${i}:10:00.000Z`,
      durationMin: 10,
    }));
    const s = scoreFocus(sessions, []);
    assert.ok(s < 50, `expected <50 got ${s}`);
  });
});

describe("scoreOutput", () => {
  it("todo rate primary + agent bonus + commit bonus", () => {
    // todo full → 60 (was 70 before git bonus rebalance)
    const base = scoreOutput(1, [], 0);
    assert.equal(base, 60);

    const withAgent = scoreOutput(
      1,
      [
        {
          app: "claude",
          kind: "agent",
          start: "2026-07-24T10:00:00.000Z",
          end: "2026-07-24T12:00:00.000Z",
          durationMin: 120,
        },
      ],
      0,
    );
    // 60 todo + 20 agent = 80
    assert.equal(withAgent, 80);
    assert.ok(withAgent > base);
  });

  it("commit bonus: 0 / 5 / 10 commits", () => {
    assert.equal(scoreOutput(0, [], 0), 0);
    // 5 commits → full +20
    assert.equal(scoreOutput(0, [], 5), 20);
    // 10 commits still capped at 20
    assert.equal(scoreOutput(0, [], 10), 20);
    // partial: 1 commit → 4
    assert.equal(scoreOutput(0, [], 1), 4);
  });

  it("computeStats raises output when git_commit nodes present", () => {
    const base = computeStats({
      nodes: [],
      sessions: [],
      todoRate: 0,
      crossDayEdges: 0,
      sleepMinutes: null,
      steps: null,
    });
    const withCommits = computeStats({
      nodes: [
        node({ kind: "git_commit", title: "a" }),
        node({ kind: "git_commit", title: "b" }),
        node({ kind: "git_commit", title: "c" }),
        node({ kind: "git_commit", title: "d" }),
        node({ kind: "git_commit", title: "e" }),
      ],
      sessions: [],
      todoRate: 0,
      crossDayEdges: 0,
      sleepMinutes: null,
      steps: null,
    });
    assert.equal(base.output, 0);
    assert.equal(withCommits.output, 20);
  });
});

describe("scoreContinuity", () => {
  it("caps at 100 around 5 edges", () => {
    assert.equal(scoreContinuity(0), 0);
    assert.equal(scoreContinuity(5), 100);
    assert.equal(scoreContinuity(10), 100);
  });
});

describe("scoreEnergy", () => {
  it("sleep-driven path", () => {
    const full = scoreEnergy({
      nodes: [],
      sessions: [],
      todoRate: 0,
      crossDayEdges: 0,
      sleepMinutes: 480,
      steps: 8000,
    });
    assert.ok(full >= 90, `full sleep got ${full}`);

    const short = scoreEnergy({
      nodes: [],
      sessions: [],
      todoRate: 0,
      crossDayEdges: 0,
      sleepMinutes: 300, // 5h
      steps: 0,
    });
    assert.ok(short < 70, `5h sleep got ${short}`);
  });

  it("no health falls back to pure deduction from 100", () => {
    const s = scoreEnergy({
      nodes: [],
      sessions: [],
      todoRate: 0,
      crossDayEdges: 0,
      sleepMinutes: null,
      steps: null,
    });
    assert.equal(s, 100);
  });
});

describe("resolveCharacterState", () => {
  it("priority: tired > productive > focused > inspired > normal", () => {
    assert.equal(
      resolveCharacterState({
        intake: 90,
        focus: 90,
        output: 90,
        continuity: 0,
        energy: 20,
      }),
      "tired",
    );
    assert.equal(
      resolveCharacterState({
        intake: 90,
        focus: 90,
        output: 80,
        continuity: 0,
        energy: 80,
      }),
      "productive",
    );
    assert.equal(
      resolveCharacterState({
        intake: 90,
        focus: 80,
        output: 50,
        continuity: 0,
        energy: 80,
      }),
      "focused",
    );
    assert.equal(
      resolveCharacterState({
        intake: 80,
        focus: 50,
        output: 50,
        continuity: 0,
        energy: 80,
      }),
      "inspired",
    );
    assert.equal(
      resolveCharacterState({
        intake: 30,
        focus: 30,
        output: 30,
        continuity: 0,
        energy: 80,
      }),
      "normal",
    );
  });
});

describe("computeStreak", () => {
  it("counts consecutive days ending today/yesterday", () => {
    assert.equal(
      computeStreak(["2026-07-22", "2026-07-23", "2026-07-24"], "2026-07-24"),
      3,
    );
    // today not saved, yesterday is — streak still counts
    assert.equal(computeStreak(["2026-07-22", "2026-07-23"], "2026-07-24"), 2);
    // gap breaks
    assert.equal(
      computeStreak(["2026-07-20", "2026-07-23", "2026-07-24"], "2026-07-24"),
      2,
    );
    assert.equal(computeStreak([], "2026-07-24"), 0);
  });
});

describe("aggregateAppSessions", () => {
  it("merges consecutive same-app samples, severs on gap/app change", () => {
    const samples = [
      node({
        kind: "app_sample",
        title: "Chrome",
        source_meta: { app: "Chrome" },
        created_at: "2026-07-24T10:00:00.000Z",
      }),
      node({
        kind: "app_sample",
        title: "Chrome",
        source_meta: { app: "Chrome" },
        created_at: "2026-07-24T10:05:00.000Z",
      }),
      node({
        kind: "app_sample",
        title: "Chrome",
        source_meta: { app: "Chrome" },
        created_at: "2026-07-24T10:10:00.000Z",
      }),
      // gap > 1.5 * 5min
      node({
        kind: "app_sample",
        title: "Chrome",
        source_meta: { app: "Chrome" },
        created_at: "2026-07-24T10:30:00.000Z",
      }),
      // app change
      node({
        kind: "app_sample",
        title: "Cursor",
        source_meta: { app: "Cursor" },
        created_at: "2026-07-24T10:35:00.000Z",
      }),
    ];
    const sessions = aggregateAppSessions(samples, 5);
    assert.equal(sessions.length, 3);
    assert.equal(sessions[0]!.app, "Chrome");
    assert.ok(sessions[0]!.durationMin >= 10);
    assert.equal(sessions[2]!.app, "Cursor");
  });

  it("uses sampled_at over receive-time created_at (offline flush)", () => {
    // All received at same server time, but real samples span 20 min via sampled_at.
    const received = "2026-07-24T20:00:00.000Z";
    const samples = [
      node({
        kind: "app_sample",
        title: "Chrome",
        source_meta: { app: "Chrome", sampled_at: "2026-07-24T10:00:00.000Z" },
        created_at: received,
      }),
      node({
        kind: "app_sample",
        title: "Chrome",
        source_meta: { app: "Chrome", sampled_at: "2026-07-24T10:05:00.000Z" },
        created_at: received,
      }),
      node({
        kind: "app_sample",
        title: "Chrome",
        source_meta: { app: "Chrome", sampled_at: "2026-07-24T10:20:00.000Z" },
        created_at: received,
      }),
    ];
    const sessions = aggregateAppSessions(samples, 5);
    // 10:00-10:05 merge, 10:20 severs (15min gap > 7.5)
    assert.equal(sessions.length, 2);
    assert.ok(sessions[0]!.durationMin >= 5);
  });
});

describe("agentSessionsFromNodes", () => {
  it("reads start/end from source_meta", () => {
    const nodes = [
      node({
        kind: "agent_session",
        title: "return",
        source_meta: {
          project: "return",
          start: "2026-07-24T09:00:00.000Z",
          end: "2026-07-24T10:30:00.000Z",
          duration_min: 90,
        },
      }),
    ];
    const s = agentSessionsFromNodes(nodes);
    assert.equal(s.length, 1);
    assert.equal(s[0]!.kind, "agent");
    assert.equal(s[0]!.durationMin, 90);
    assert.equal(s[0]!.app, "return");
  });
});

describe("extractHealth + computeStats integration", () => {
  it("wires health_daily into energy", () => {
    const nodes = [
      node({
        kind: "health_daily",
        source_meta: { sleep_minutes: 180, steps: 0 },
        content: JSON.stringify({ sleep_minutes: 180, steps: 0 }),
      }),
      node({ kind: "text", content: "idea" }),
    ];
    const health = extractHealth(nodes);
    assert.equal(health.sleepMinutes, 180);
    assert.equal(health.steps, 0);

    const stats = computeStats({
      nodes,
      sessions: [],
      todoRate: 0,
      crossDayEdges: 0,
      sleepMinutes: health.sleepMinutes,
      steps: health.steps,
    });
    // 3h sleep: min(180/480,1)*70 + 0 + 15 = 41.25 → still not tired (<40)
    // 2h: 120/480*70+15 = 32.5 → tired. Use assert on energy + recompute.
    assert.ok(stats.energy < 50, `energy=${stats.energy}`);
    assert.ok(stats.intake > 0);

    const tiredStats = computeStats({
      nodes,
      sessions: [],
      todoRate: 0,
      crossDayEdges: 0,
      sleepMinutes: 120,
      steps: 0,
    });
    assert.ok(tiredStats.energy < 40, `energy=${tiredStats.energy}`);
    assert.equal(resolveCharacterState(tiredStats), "tired");
  });
});
