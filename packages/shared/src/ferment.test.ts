import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FermentResultSchema } from "./ferment.js";

describe("FermentResultSchema", () => {
  it("accepts minimal valid payload", () => {
    const r = FermentResultSchema.safeParse({
      summary: "A focused day of building.",
      opening_line: "昨天你把后端撑起来了。",
      review_points: [{ text: "API contract frozen", kind: "win" }],
      todos: [{ text: "Wire desktop sampler" }],
      node_tags: {},
      edges: [],
    });
    assert.equal(r.success, true);
  });

  it("rejects missing summary", () => {
    const r = FermentResultSchema.safeParse({
      opening_line: "hi",
    });
    assert.equal(r.success, false);
  });

  it("fills defaults for optional arrays", () => {
    const r = FermentResultSchema.parse({
      summary: "x",
      opening_line: "y",
    });
    assert.deepEqual(r.review_points, []);
    assert.deepEqual(r.todos, []);
    assert.deepEqual(r.node_tags, {});
    assert.deepEqual(r.edges, []);
  });
});
