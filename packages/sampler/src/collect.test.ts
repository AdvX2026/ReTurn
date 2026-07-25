import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { AgentInterval } from "./agents.js";
import { collectSample } from "./collect.js";
import { Outbox } from "./outbox.js";
import {
  type SampleContext,
  createKeyDedupe,
  createSampleContext,
  dateInTimeZone,
  uuidFromSeed,
} from "./source.js";
import { intervalsToNodes, resetSeenAgentKeys } from "./sources/agents.js";

function agent(
  partial: Partial<AgentInterval> &
    Pick<AgentInterval, "session_id" | "start" | "end" | "open">,
): AgentInterval {
  return {
    provider: "claude",
    project: "Coding/ReTurn",
    duration_min: 60,
    ...partial,
  };
}

describe("source helpers", () => {
  it("uuidFromSeed is deterministic and uuid-shaped", () => {
    const a = uuidFromSeed("agent:claude|abc|t0");
    const b = uuidFromSeed("agent:claude|abc|t0");
    const c = uuidFromSeed("agent:claude|abc|t1");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(
      a,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("createKeyDedupe first-wins and trims", () => {
    const d = createKeyDedupe(3, 2);
    assert.equal(d.tryAdd("a"), true);
    assert.equal(d.tryAdd("a"), false);
    assert.equal(d.tryAdd("b"), true);
    assert.equal(d.tryAdd("c"), true);
    assert.equal(d.tryAdd("d"), true); // triggers trim
    assert.ok(d.size <= 3);
  });

  it("dateInTimeZone formats an explicit calendar day", () => {
    assert.equal(
      dateInTimeZone(new Date("2026-07-24T18:00:00.000Z"), "Asia/Singapore"),
      "2026-07-25",
    );
  });

  it("creates one timezone-aware day window shared by all sources", () => {
    const ctx = createSampleContext({
      now: new Date("2026-07-24T18:30:00.000Z"),
      timezone: "Asia/Singapore",
      platform: "darwin",
    });
    assert.equal(ctx.day, "2026-07-25");
    assert.equal(ctx.dayStart, "2026-07-24T16:00:00.000Z");
    assert.equal(ctx.dayEnd, "2026-07-25T16:00:00.000Z");
    assert.equal(ctx.at, "2026-07-24T18:30:00.000Z");
  });

  it("honors DST when deriving the shared day window", () => {
    const ctx = createSampleContext({
      now: new Date("2026-03-08T18:00:00.000Z"),
      timezone: "America/New_York",
    });
    assert.equal(ctx.day, "2026-03-08");
    assert.equal(Date.parse(ctx.dayEnd) - Date.parse(ctx.dayStart), 23 * 60 * 60 * 1000);
  });

  it("passes the same global context object to every pluggable source", async () => {
    const contexts: SampleContext[] = [];
    const source = (id: string) => ({
      id,
      async sample(ctx: SampleContext) {
        contexts.push(ctx);
        return { nodes: [], stats: { ok: 1 } };
      },
    });
    const result = await collectSample({
      now: new Date("2026-07-24T15:59:59.000Z"),
      timezone: "Asia/Singapore",
      sources: [source("one"), source("two")],
    });
    assert.equal(contexts.length, 2);
    assert.equal(contexts[0], contexts[1]);
    assert.equal(contexts[0]!.day, "2026-07-24");
    assert.deepEqual(result.snapshot.stats, { one: { ok: 1 }, two: { ok: 1 } });
  });

  it("reports a failed source without hiding or cascading the failure", async () => {
    const result = await collectSample({
      now: new Date("2026-07-24T12:00:00.000Z"),
      timezone: "UTC",
      sources: [
        {
          id: "broken",
          async sample() {
            throw new Error("permission denied");
          },
        },
        {
          id: "healthy",
          async sample() {
            return { nodes: [], stats: { ok: 1 } };
          },
        },
      ],
    });
    assert.deepEqual(result.snapshot.stats, {
      broken: { error: 1 },
      healthy: { ok: 1 },
    });
    assert.deepEqual(result.snapshot.errors, {
      broken: "permission denied",
    });
  });
});

describe("agents source emission policy", () => {
  it("emits only closed intervals; open never enqueued (regular or Save)", () => {
    resetSeenAgentKeys();
    const closed = agent({
      session_id: "abc",
      start: "2026-07-24T01:00:00.000Z",
      end: "2026-07-24T02:00:00.000Z",
      open: false,
    });
    const open = agent({
      session_id: "live",
      start: "2026-07-24T03:00:00.000Z",
      end: "2026-07-24T03:05:00.000Z",
      open: true,
      duration_min: 5,
    });

    const nodes = intervalsToNodes([closed, open], {
      day: "2026-07-24",
    });
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0]!.kind, "agent_session");
    const meta = nodes[0]!.source_meta as Record<string, unknown>;
    assert.equal(meta.provider, "claude");
    assert.equal(meta.session_id, "abc");
    assert.equal(meta.open, false);

    // open still withheld on Save Today (server is insert-only; no dual open+closed)
    assert.equal(intervalsToNodes([open], { day: "2026-07-24" }).length, 0);

    // second call: same closed agent not re-emitted
    assert.equal(
      intervalsToNodes([closed, open], {
        day: "2026-07-24",
      }).length,
      0,
    );

    // after "restart", same closed agent gets same client_uuid
    resetSeenAgentKeys();
    const restarted = intervalsToNodes([closed], {
      day: "2026-07-24",
    });
    assert.equal(restarted.length, 1);
    assert.equal(restarted[0]!.client_uuid, nodes[0]!.client_uuid);
  });

  it("closed after warm session uses stable seed (no open predecessor in outbox)", () => {
    resetSeenAgentKeys();
    const start = "2026-07-24T03:00:00.000Z";
    // Save while warm would have emitted nothing for open
    assert.equal(
      intervalsToNodes(
        [
          agent({
            session_id: "live",
            start,
            end: "2026-07-24T03:05:00.000Z",
            open: true,
            duration_min: 5,
          }),
        ],
        { day: "2026-07-24" },
      ).length,
      0,
    );

    const closed = agent({
      session_id: "live",
      start,
      end: "2026-07-24T04:00:00.000Z",
      open: false,
      duration_min: 60,
    });
    const terminal = intervalsToNodes([closed], {
      day: "2026-07-24",
    });
    assert.equal(terminal.length, 1);
    assert.equal((terminal[0]!.source_meta as Record<string, unknown>).open, false);
    assert.equal((terminal[0]!.source_meta as Record<string, unknown>).end, closed.end);
    assert.equal(
      terminal[0]!.client_uuid,
      uuidFromSeed("agent:claude|live|2026-07-24T03:00:00.000Z"),
    );
  });
});

describe("Outbox", () => {
  it("enqueue / remove FIFO", () => {
    const dir = mkdtempSync(join(tmpdir(), "return-outbox-"));
    const path = join(dir, "outbox.db");
    const box = new Outbox(path);
    try {
      assert.equal(box.size(), 0);
      box.enqueue([
        {
          client_uuid: crypto.randomUUID(),
          kind: "text",
          content: "hi",
        },
      ]);
      assert.equal(box.size(), 1);
      const rows = box.peekAll();
      assert.equal(rows.length, 1);
      box.remove(rows[0]!.id);
      assert.equal(box.size(), 0);
    } finally {
      box.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
