/**
 * Ask / RAG over hybrid search (global-search PRD §8–§9).
 * Citations validated against retrieved set — hallucinated node_ids dropped.
 */

import type { AskResponse, SearchHit } from "@return/shared";
import { llmChat } from "../ai/llm.js";
import type { Db } from "../db/schema.js";
import { search } from "./query.js";

const ASK_TOP_K = 8;

export interface AskOptions {
  question: string;
  from?: string;
  to?: string;
}

export async function ask(db: Db, opts: AskOptions): Promise<AskResponse> {
  const result = await search(db, {
    q: opts.question,
    from: opts.from,
    to: opts.to,
    limit: ASK_TOP_K,
  });

  const retrieved = result.results;
  if (retrieved.length === 0) {
    return {
      answer: "没在你的记录里找到相关内容。",
      citations: [],
      retrieved: 0,
    };
  }

  const allowedIds = new Set(
    retrieved.map((h) => citationId(h)).filter((x): x is string => x != null),
  );

  const raw = await callAskLlm(db, opts.question, retrieved);
  const { answer, cited } = parseAskOutput(raw, allowedIds);
  const citations = buildCitations(retrieved, cited);
  return {
    answer,
    citations,
    retrieved: retrieved.length,
  };
}

function citationId(h: SearchHit): string | null {
  if (h.node?.id) return h.node.id;
  if (h.doc_id.startsWith("day:")) return h.doc_id;
  if (h.doc_id.startsWith("node:")) return h.doc_id.slice(5);
  return null;
}

function buildCitations(hits: SearchHit[], cited: Set<string>): AskResponse["citations"] {
  // Prefer model-cited order; fall back to retrieval order for uncited leftovers only if cited empty.
  const byId = new Map<string, SearchHit>();
  for (const h of hits) {
    const id = citationId(h);
    if (id) byId.set(id, h);
  }

  const ordered: SearchHit[] = [];
  for (const id of cited) {
    const h = byId.get(id);
    if (h) ordered.push(h);
  }
  if (ordered.length === 0) throw new Error("ask response contains no valid citations");

  return ordered.map((h) => ({
    node_id: h.node?.id ?? null,
    date: h.node?.date ?? h.day?.date ?? "",
    kind: h.kind,
    title: h.node?.title ?? h.day?.summary?.slice(0, 60) ?? null,
    snippet: h.snippet,
  }));
}

async function callAskLlm(db: Db, question: string, hits: SearchHit[]): Promise<string> {
  const context = hits
    .map((h, i) => {
      const id = citationId(h) ?? h.doc_id;
      const date = h.node?.date ?? h.day?.date ?? "";
      const title = h.node?.title ?? "";
      const body = h.node?.content ?? h.day?.summary ?? h.snippet ?? "";
      return `[#${i + 1} id=${id} date=${date} kind=${h.kind} title=${JSON.stringify(title)}]\n${truncate(body, 800)}`;
    })
    .join("\n\n");

  const system = `You are ReTurn's personal memory assistant.
Answer ONLY using the provided records. Every factual claim must cite a source id as [id].
If the records do not contain the answer, say exactly: 没在你的记录里找到相关内容。
Do not invent facts, dates, or node ids. Prefer concise Chinese unless the question is in English.
Output plain text (not JSON).`;

  const user = `Question: ${question}

Records:
${context}`;

  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      return await llmChat(db, {
        operation: "ask",
        kind: "llm",
        system,
        user,
        temperature: 0.2,
      });
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("ask LLM failed");
}

/**
 * Extract [id] citations; drop any id not in allowed set.
 * Returns cleaned answer (invalid citations stripped) + valid cited ids.
 */
export function parseAskOutput(
  raw: string,
  allowedIds: Set<string>,
): { answer: string; cited: Set<string> } {
  const cited = new Set<string>();
  const answer = raw.replace(/\[([^\]]+)\]/g, (full, id: string) => {
    const trimmed = id.trim();
    // Allow both bare uuid and day:DATE and node:uuid forms.
    const candidates = [trimmed, trimmed.replace(/^node:/, "")];
    for (const c of candidates) {
      if (allowedIds.has(c)) {
        cited.add(c);
        return `[${c}]`;
      }
    }
    // Drop hallucinated citation marker entirely.
    return "";
  });
  return { answer: answer.replace(/[ \t]+\n/g, "\n").trim(), cited };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}
