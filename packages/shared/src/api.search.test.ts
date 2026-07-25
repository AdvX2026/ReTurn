import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AskRequest, AskResponse, NodeRecord, SearchHit, SearchResponse } from "./api.js";
import { NodeKind } from "./domain.js";

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

  it("AskResponse accepts a cited answer", () => {
    const parsed = AskResponse.safeParse({
      answer: "找到相关记录。",
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
    });
    assert.equal(parsed.success, true);
  });

  it("NodeKind and NodeRecord accept git_commit", () => {
    assert.equal(NodeKind.safeParse("git_commit").success, true);
    const parsed = NodeRecord.safeParse({
      id: "00000000-0000-4000-8000-000000000001",
      day_id: "00000000-0000-4000-8000-000000000002",
      device_id: null,
      kind: "git_commit",
      title: "feat: search",
      content: "subject",
      source_meta: { repo: "ReTurn", subject: "feat: search", sha: "abc" },
      client_uuid: "00000000-0000-4000-8000-000000000003",
      created_at: "2026-07-24T00:00:00.000Z",
      date: "2026-07-24",
    });
    assert.equal(parsed.success, true);
  });
});
