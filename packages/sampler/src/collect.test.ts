import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { AgentInterval } from "./agents.js";
import { Outbox } from "./outbox.js";
import { createKeyDedupe, todayLocal, uuidFromSeed } from "./source.js";
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

  it("todayLocal formats local calendar day", () => {
    assert.match(todayLocal(new Date(2026, 6, 24, 18, 0, 0)), /^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("agents source emission policy", () => {
  it("emits only closed intervals on regular tick; stable uuid across restart", () => {
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

    const nodes = intervalsToNodes([closed, open], { asSnapshot: false });
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0]!.kind, "agent_session");
    const meta = nodes[0]!.source_meta as Record<string, unknown>;
    assert.equal(meta.provider, "claude");
    assert.equal(meta.session_id, "abc");
    assert.equal(meta.open, false);

    // second call: same closed agent not re-emitted
    assert.equal(intervalsToNodes([closed, open], { asSnapshot: false }).length, 0);

    // after "restart", same closed agent gets same client_uuid
    resetSeenAgentKeys();
    const restarted = intervalsToNodes([closed], { asSnapshot: false });
    assert.equal(restarted.length, 1);
    assert.equal(restarted[0]!.client_uuid, nodes[0]!.client_uuid);
  });

  it("asSnapshot flushes open intervals once", () => {
    resetSeenAgentKeys();
    const open = agent({
      provider: "codex",
      project: "/Users/dev/Coding/Other",
      session_id: "rollout-1",
      start: "2026-07-24T03:00:00.000Z",
      end: "2026-07-24T03:05:00.000Z",
      open: true,
      duration_min: 5,
    });

    assert.equal(intervalsToNodes([open], { asSnapshot: false }).length, 0);

    const flushed = intervalsToNodes([open], { asSnapshot: true });
    assert.equal(flushed.length, 1);
    assert.equal((flushed[0]!.source_meta as Record<string, unknown>).open, true);
    assert.equal((flushed[0]!.source_meta as Record<string, unknown>).provider, "codex");

    // second Save does not re-emit same open
    assert.equal(intervalsToNodes([open], { asSnapshot: true }).length, 0);
  });

  it("closed terminal still emits after open was flushed (Save Today refine)", () => {
    resetSeenAgentKeys();
    const start = "2026-07-24T03:00:00.000Z";
    const open = agent({
      session_id: "live",
      start,
      end: "2026-07-24T03:05:00.000Z",
      open: true,
      duration_min: 5,
    });
    const closed = agent({
      session_id: "live",
      start,
      end: "2026-07-24T04:00:00.000Z",
      open: false,
      duration_min: 60,
    });

    const flushed = intervalsToNodes([open], { asSnapshot: true });
    assert.equal(flushed.length, 1);
    assert.equal((flushed[0]!.source_meta as Record<string, unknown>).open, true);

    // later regular tick with closed must still emit (different seed/key)
    const terminal = intervalsToNodes([closed], { asSnapshot: false });
    assert.equal(terminal.length, 1);
    assert.equal((terminal[0]!.source_meta as Record<string, unknown>).open, false);
    assert.notEqual(terminal[0]!.client_uuid, flushed[0]!.client_uuid);
    assert.equal((terminal[0]!.source_meta as Record<string, unknown>).end, closed.end);
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
