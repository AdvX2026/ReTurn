import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { NodeRecord, Session } from "@return/shared";
import { computeDayBreakdown } from "./breakdown.js";

function node(
  partial: Partial<NodeRecord> & Pick<NodeRecord, "id" | "kind">,
): NodeRecord {
  return {
    day_id: "d1",
    device_id: null,
    title: null,
    content: null,
    source_meta: null,
    client_uuid: partial.id,
    created_at: "2026-07-24T12:00:00.000Z",
    date: "2026-07-24",
    ...partial,
  };
}

describe("computeDayBreakdown", () => {
  it("counts intake/output signals for client templates", () => {
    const nodes: NodeRecord[] = [
      node({ id: "1", kind: "idea" }),
      node({ id: "2", kind: "idea" }),
      node({ id: "3", kind: "image" }),
      node({ id: "4", kind: "git_commit" }),
      node({
        id: "5",
        kind: "email",
        source_meta: { direction: "received" },
      }),
      node({
        id: "6",
        kind: "email",
        source_meta: { direction: "sent" },
      }),
    ];
    const sessions: Session[] = [
      {
        app: "claude",
        kind: "agent",
        start: "2026-07-24T01:00:00.000Z",
        end: "2026-07-24T03:00:00.000Z",
        durationMin: 120,
      },
    ];
    const b = computeDayBreakdown({
      nodes,
      sessions,
      todoCompleted: 6,
      todoTotal: 17,
      crossDayEdges: 2,
      sleepMinutes: 300,
      steps: 4000,
    });
    assert.equal(b.idea_count, 2);
    assert.equal(b.image_count, 1);
    assert.equal(b.git_commit_count, 1);
    assert.equal(b.email_received, 1);
    assert.equal(b.email_sent, 1);
    assert.equal(b.todo_completed, 6);
    assert.equal(b.todo_total, 17);
    assert.equal(b.agent_duration_min, 120);
    assert.equal(b.longest_session_min, 120);
    assert.equal(b.sleep_minutes, 300);
    assert.equal(b.cross_day_edges, 2);
  });
});
