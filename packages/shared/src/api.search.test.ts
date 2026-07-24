import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AskRequest, AskResponse, SearchHit, SearchResponse } from "./api.js";

describe("search/ask contracts", () => {
  it("SearchResponse accepts valid payload", () => {
    const parsed = SearchResponse.safeParse({
      query: "评审",
      took_ms: 12,
      results: [
        {
          doc_id: "node:00000000-0000-4000-8000-000000000001",
          kind: "text",
          score: 0.5,
          snippet: "产品评审",
          node: null,
          day: null,
        },
      ],
    });
    assert.equal(parsed.success, true);
  });

  it("SearchHit rejects missing snippet", () => {
    const parsed = SearchHit.safeParse({
      doc_id: "day:2026-07-24",
      kind: "day_summary",
      score: 1,
      node: null,
      day: null,
    });
    assert.equal(parsed.success, false);
  });

  it("AskRequest bounds", () => {
    assert.equal(AskRequest.safeParse({ question: "" }).success, false);
    assert.equal(AskRequest.safeParse({ question: "x".repeat(501) }).success, false);
    assert.equal(
      AskRequest.safeParse({
        question: "上周做了什么？",
        from: "2026-07-01",
        to: "2026-07-24",
      }).success,
      true,
    );
  });

  it("AskResponse degraded shape", () => {
    const parsed = AskResponse.safeParse({
      answer: "",
      citations: [
        {
          node_id: null,
          date: "2026-07-24",
          kind: "text",
          title: "note",
          snippet: "hi",
        },
      ],
      retrieved: 1,
      degraded: true,
    });
    assert.equal(parsed.success, true);
  });
});
