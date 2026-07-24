import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { type SampleSnapshot, resetSeenAgentKeys, snapshotToNodes } from "./collect.js";
import { Outbox } from "./outbox.js";

describe("snapshotToNodes", () => {
  it("maps app + tabs + new agents", () => {
    resetSeenAgentKeys();
    const snap: SampleSnapshot = {
      app: { name: "Cursor", bundleId: "com.todesktop.cursor" },
      tabs: [
        {
          browser: "Chrome",
          title: "PRD",
          url: "https://example.com/prd",
        },
      ],
      agents: [
        {
          project: "Coding/ReTurn",
          start: "2026-07-24T01:00:00.000Z",
          end: "2026-07-24T02:00:00.000Z",
          duration_min: 60,
          session_id: "abc",
        },
      ],
      at: "2026-07-24T02:05:00.000Z",
      platform: "darwin",
    };
    const nodes = snapshotToNodes(snap);
    assert.equal(
      nodes.some((n) => n.kind === "app_sample"),
      true,
    );
    assert.equal(
      nodes.some((n) => n.kind === "tab_sample"),
      true,
    );
    const agent = nodes.find((n) => n.kind === "agent_session");
    assert.ok(agent);
    // second call should not re-emit same agent in-process
    const again = snapshotToNodes(snap);
    assert.equal(
      again.some((n) => n.kind === "agent_session"),
      false,
    );
    // after "restart", same agent gets same client_uuid (server can dedupe)
    resetSeenAgentKeys();
    const restarted = snapshotToNodes(snap).find((n) => n.kind === "agent_session");
    assert.ok(restarted);
    assert.equal(restarted!.client_uuid, agent!.client_uuid);
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
