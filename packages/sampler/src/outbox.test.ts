import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, it } from "node:test";
import type { NodeInput } from "@return/shared";
import {
  MAX_NODES_PER_BATCH,
  Outbox,
  chunkNodes,
} from "./outbox.js";

function fakeNode(i: number): NodeInput {
  // Deterministic uuid from index (version-4 shaped).
  const hex = i.toString(16).padStart(12, "0");
  return {
    client_uuid: `00000000-0000-4000-8000-${hex}`,
    kind: "reminder",
    title: `n${i}`,
    client_created_at: "2026-07-24T00:00:00.000Z",
    date: "2026-07-24",
  };
}

describe("chunkNodes", () => {
  it("returns empty for empty input", () => {
    assert.deepEqual(chunkNodes([]), []);
  });

  it("keeps a single batch when under the limit", () => {
    const nodes = [fakeNode(1), fakeNode(2)];
    const batches = chunkNodes(nodes, 500);
    assert.equal(batches.length, 1);
    assert.equal(batches[0]!.length, 2);
  });

  it("splits exactly on size boundaries", () => {
    const nodes = Array.from({ length: 12 }, (_, i) => fakeNode(i));
    const batches = chunkNodes(nodes, 5);
    assert.equal(batches.length, 3);
    assert.deepEqual(
      batches.map((b) => b.length),
      [5, 5, 2],
    );
    assert.equal(batches[0]![0]!.title, "n0");
    assert.equal(batches[2]![1]!.title, "n11");
  });

  it("defaults size to MAX_NODES_PER_BATCH (API cap)", () => {
    assert.equal(MAX_NODES_PER_BATCH, 500);
    const nodes = Array.from({ length: 501 }, (_, i) => fakeNode(i));
    const batches = chunkNodes(nodes);
    assert.equal(batches.length, 2);
    assert.equal(batches[0]!.length, 500);
    assert.equal(batches[1]!.length, 1);
  });
});

describe("Outbox.enqueue chunks at API max", () => {
  let dir: string;
  let box: Outbox;

  afterEach(() => {
    try {
      box?.close();
    } catch {
      /* */
    }
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("writes one row for ≤500 nodes", () => {
    dir = mkdtempSync(join(tmpdir(), "return-outbox-"));
    box = new Outbox(join(dir, "outbox.db"));
    const nodes = Array.from({ length: 3 }, (_, i) => fakeNode(i));
    box.enqueue(nodes);
    assert.equal(box.size(), 1);
    const rows = box.peekAll();
    assert.equal(JSON.parse(rows[0]!.payload_json).length, 3);
  });

  it("splits >500 nodes into multiple FIFO rows each ≤500", () => {
    dir = mkdtempSync(join(tmpdir(), "return-outbox-"));
    box = new Outbox(join(dir, "outbox.db"));
    const nodes = Array.from({ length: 1001 }, (_, i) => fakeNode(i));
    box.enqueue(nodes);
    assert.equal(box.size(), 3);
    const rows = box.peekAll();
    const sizes = rows.map((r) => (JSON.parse(r.payload_json) as NodeInput[]).length);
    assert.deepEqual(sizes, [500, 500, 1]);
    // FIFO order preserved across chunks
    const first = JSON.parse(rows[0]!.payload_json) as NodeInput[];
    const last = JSON.parse(rows[2]!.payload_json) as NodeInput[];
    assert.equal(first[0]!.title, "n0");
    assert.equal(last[0]!.title, "n1000");
  });

  it("enqueue empty is a no-op", () => {
    dir = mkdtempSync(join(tmpdir(), "return-outbox-"));
    box = new Outbox(join(dir, "outbox.db"));
    assert.equal(box.enqueue([]), "");
    assert.equal(box.size(), 0);
  });
});
