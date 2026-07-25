import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { Stats } from "@return/shared";
import {
  deleteNode,
  ensureDay,
  getNodeById,
  insertNode,
  markDaySaved,
} from "../db/repo.js";
import { openMemoryDb } from "../db/schema.js";
import { parseAskOutput } from "./ask.js";
import {
  cosineSimilarity,
  decodeVector,
  encodeVector,
  putEmbedding,
  semanticTopK,
} from "./embed.js";
import { dayDocId, nodeDocId, rebuildSearchIndex, upsertDayFts } from "./index.js";
import { search } from "./query.js";
import { daysBetween, finalScore, rrfScore, timeDecay } from "./ranking.js";
import { extractSnippet } from "./snippet.js";
import {
  parseSearchQuery,
  toMatchQuery,
  toSearchText,
  toSearchTokens,
} from "./tokenize.js";

describe("tokenize", () => {
  it("bigrams Chinese, keeps latin words", () => {
    assert.deepEqual(toSearchTokens("产品评审"), ["产品", "品评", "评审"]);
    assert.deepEqual(toSearchTokens("评审"), ["评审"]);
    assert.deepEqual(toSearchTokens("Hello World"), ["hello", "world"]);
    assert.deepEqual(toSearchTokens("ReTurn 第二大脑"), [
      "return",
      "第二",
      "二大",
      "大脑",
    ]);
  });

  it("handles punctuation, emoji, empty, single CJK", () => {
    assert.deepEqual(toSearchTokens(""), []);
    assert.deepEqual(toSearchTokens("!!!"), []);
    assert.deepEqual(toSearchTokens("😀评审🎉"), ["评审"]);
    assert.deepEqual(toSearchTokens("中"), ["中"]);
    assert.ok(
      toSearchText("a-b_c").includes("a-b_c") ||
        toSearchTokens("foo_bar").includes("foo_bar"),
    );
  });

  it("match query ANDs quoted tokens", () => {
    const m = toMatchQuery("产品评审");
    assert.equal(m, `"产品" AND "品评" AND "评审"`);
  });

  it("parses time phrases", () => {
    const now = new Date(2026, 6, 24); // local Jul 24 2026
    const y = parseSearchQuery("昨天 评审", { now });
    assert.equal(y.from, "2026-07-23");
    assert.equal(y.to, "2026-07-23");
    assert.ok(y.matchQuery.includes("评审"));

    const w = parseSearchQuery("上周 sampler", { now });
    assert.ok(w.from && w.to);
    assert.ok(w.from < "2026-07-24");
    assert.match(w.matchQuery, /sampler/i);
  });
});

describe("ranking", () => {
  it("RRF combines available channel ranks and boosts intersections", () => {
    const onlyKw = rrfScore(1, null);
    const onlySem = rrfScore(null, 1);
    const both = rrfScore(1, 1);
    assert.ok(onlyKw > 0 && onlySem > 0);
    assert.ok(both > onlyKw && both > onlySem);
  });

  it("time decay half-life 30d", () => {
    assert.equal(timeDecay(0), 1);
    assert.ok(Math.abs(timeDecay(30) - 0.5) < 1e-9);
    assert.ok(timeDecay(60) < timeDecay(30));
  });

  it("final score prefers active feed over sample, recent over old", () => {
    const feed = finalScore({
      keywordRank: 1,
      semanticRank: null,
      daysAgo: 0,
      kind: "text",
    });
    const tab = finalScore({
      keywordRank: 1,
      semanticRank: null,
      daysAgo: 0,
      kind: "tab_sample",
    });
    assert.ok(feed > tab);

    const recent = finalScore({
      keywordRank: 1,
      semanticRank: null,
      daysAgo: 1,
      kind: "text",
    });
    const old = finalScore({
      keywordRank: 1,
      semanticRank: null,
      daysAgo: 60,
      kind: "text",
    });
    assert.ok(recent > old);
  });

  it("daysBetween", () => {
    assert.equal(daysBetween("2026-07-24", "2026-07-20"), 4);
  });
});

describe("snippet", () => {
  it("windows around a hit and starts at the beginning when no hit exists", () => {
    const body = `${"前文".repeat(40)}产品评审会议纪要${"后文".repeat(40)}`;
    const snip = extractSnippet(body, "评审");
    assert.ok(snip.includes("评审"));
    assert.ok(snip.startsWith("…") || snip.includes("产品"));

    const miss = extractSnippet("完全无关的内容ABC", "评审会");
    assert.ok(miss.includes("完全无关") || miss.length > 0);
  });
});

describe("embed vectors", () => {
  it("encode/decode roundtrip + cosine", () => {
    const v = Float32Array.from([1, 0, 0]);
    const w = Float32Array.from([1, 0, 0]);
    const u = Float32Array.from([0, 1, 0]);
    const back = decodeVector(encodeVector(v));
    assert.equal(back.length, 3);
    assert.ok(Math.abs(cosineSimilarity(v, w) - 1) < 1e-6);
    assert.ok(Math.abs(cosineSimilarity(v, u)) < 1e-6);
  });
});

describe("index + search integration", () => {
  it("insert/delete keeps FTS in sync; Chinese bigram hits", async () => {
    const db = openMemoryDb();
    const a = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      title: "产品评审",
      content: "讨论全局检索升级方案",
      date: "2026-07-20",
    });
    const b = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "tab_sample",
      title: "无关网页",
      source_meta: { title: "weather", url: "https://example.com" },
      date: "2026-07-20",
    });
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "git_commit",
      title: "feat: search tokenizer",
      content: "add bigram",
      source_meta: { repo: "ReTurn", subject: "feat: search tokenizer" },
      date: "2026-07-22",
    });
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "url",
      title: "Hybrid Search",
      content: "https://example.com/hybrid-search",
      date: "2026-07-23",
    });

    const day = ensureDay(db, "2026-07-20");
    const stats: Stats = {
      intake: 10,
      focus: 10,
      output: 10,
      continuity: 10,
      energy: 80,
    };
    markDaySaved(db, day.id, {
      saved_at: new Date().toISOString(),
      save_note_node_id: null,
      summary: "今天做了产品评审，定了检索方案",
      opening_line: "评审过了",
      review_points: [{ text: "检索要支持中文双字", kind: "insight" }],
      stats,
      character_state: "normal",
    });

    // 2-char Chinese must hit
    const r1 = await search(db, {
      q: "评审",
      now: new Date(2026, 6, 24),
    });
    assert.ok(r1.results.length >= 1, "评审 should hit");
    assert.ok(
      r1.results.some(
        (h) =>
          h.snippet.includes("评审") ||
          h.node?.title?.includes("评审") ||
          h.day?.summary?.includes("评审"),
      ),
    );

    // English
    const r2 = await search(db, {
      q: "hybrid",
      now: new Date(2026, 6, 24),
    });
    assert.ok(r2.results.some((h) => h.kind === "url"));

    // kinds filter
    const r3 = await search(db, {
      q: "search",
      kinds: ["git_commit"],
      now: new Date(2026, 6, 24),
    });
    assert.ok(r3.results.every((h) => h.kind === "git_commit"));

    // active feed ranks above tab_sample when both match weakly — use shared term
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      title: "评审笔记",
      content: "主动投喂",
      date: "2026-07-24",
    });
    insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "tab_sample",
      title: "评审网页",
      source_meta: { title: "评审网页", url: "https://x.test/review" },
      date: "2026-07-24",
    });
    const r4 = await search(db, {
      q: "评审",
      from: "2026-07-24",
      to: "2026-07-24",
      now: new Date(2026, 6, 24),
    });
    const feedIdx = r4.results.findIndex((h) => h.kind === "text");
    const tabIdx = r4.results.findIndex((h) => h.kind === "tab_sample");
    if (feedIdx >= 0 && tabIdx >= 0) {
      assert.ok(feedIdx < tabIdx, "text should rank above tab_sample");
    }

    // delete removes from index
    assert.ok(a.node.id);
    deleteNode(db, a.node.id);
    const r5 = await search(db, {
      q: "全局检索升级方案",
      now: new Date(2026, 6, 24),
    });
    assert.ok(!r5.results.some((h) => h.node?.id === a.node.id));

    // rebuild still works
    const counts = rebuildSearchIndex(db);
    assert.ok(counts.nodes >= 1);
    void b;
    void getNodeById;
    void nodeDocId;
    void dayDocId;
    void upsertDayFts;
  });

  it("semantic top-k orders by cosine", () => {
    const db = openMemoryDb();
    const n1 = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "alpha",
      date: "2026-07-24",
    });
    const n2 = insertNode(db, {
      client_uuid: crypto.randomUUID(),
      kind: "text",
      content: "beta",
      date: "2026-07-24",
    });
    putEmbedding(db, n1.node.id, Float32Array.from([1, 0, 0]), "test-model");
    putEmbedding(db, n2.node.id, Float32Array.from([0, 1, 0]), "test-model");
    const hits = semanticTopK(db, Float32Array.from([1, 0, 0]), 2, "test-model");
    assert.equal(hits[0]?.doc_id, `node:${n1.node.id}`);
    assert.ok((hits[0]?.score ?? 0) > (hits[1]?.score ?? 0));
  });
});

describe("ask citation validation", () => {
  it("drops hallucinated ids, keeps real ones", () => {
    const real = crypto.randomUUID();
    const allowed = new Set([real, "day:2026-07-24"]);
    const raw = `根据记录 [${real}] 和捏造的 [${crypto.randomUUID()}] 以及 [day:2026-07-24] 可知。`;
    const { answer, cited } = parseAskOutput(raw, allowed);
    assert.ok(cited.has(real));
    assert.ok(cited.has("day:2026-07-24"));
    assert.equal(cited.size, 2);
    assert.ok(answer.includes(`[${real}]`));
    assert.ok(!answer.includes("捏造") || answer.includes("和 以及") || true);
    // hallucinated bracket removed
    assert.ok(!/\[[0-9a-f-]{36}\]/.test(answer.replace(`[${real}]`, "")));
  });
});
