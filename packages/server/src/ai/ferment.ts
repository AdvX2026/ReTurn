import { FermentResultSchema, type FermentResult } from "@return/shared";
import type { NodeRecord, Session } from "@return/shared";
import { config } from "../config.js";

export interface FermentContext {
  date: string;
  saveNote: string | null;
  activeNodes: Array<{
    id: string;
    kind: string;
    title: string | null;
    content: string | null;
  }>;
  sessions: Session[];
  recentSummaries: Array<{ date: string; summary: string }>;
  /** Node ids from recent days the model may link to. */
  linkableNodes: Array<{ id: string; date: string; title: string | null; kind: string }>;
}

export class FermentError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "FermentError";
  }
}

/**
 * One LLM call → structured ferment JSON.
 * Timeout + single retry + Zod validate (PRD §6.3).
 */
export async function runFerment(
  ctx: FermentContext,
): Promise<FermentResult> {
  if (!config.llm.apiKey) {
    throw new FermentError("LLM_API_KEY not configured");
  }

  const prompt = buildPrompt(ctx);
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await chatCompletion(prompt);
      const parsed = extractJson(raw);
      const result = FermentResultSchema.safeParse(parsed);
      if (!result.success) {
        throw new FermentError(
          `Zod validation failed: ${result.error.message}`,
          result.error,
        );
      }
      return result.data;
    } catch (err) {
      lastErr = err;
      if (attempt === 0) continue;
    }
  }
  throw new FermentError("ferment failed after retry", lastErr);
}

function buildPrompt(ctx: FermentContext): string {
  const sessionsSummary = ctx.sessions
    .map(
      (s) =>
        `- [${s.kind}] ${s.app}: ${s.start} → ${s.end} (${Math.round(s.durationMin)}min)`,
    )
    .join("\n");

  const nodesBlock = ctx.activeNodes
    .map(
      (n) =>
        `- id=${n.id} kind=${n.kind} title=${JSON.stringify(n.title)} content=${JSON.stringify(truncate(n.content, 400))}`,
    )
    .join("\n");

  const recent = ctx.recentSummaries
    .map((r) => `- ${r.date}: ${r.summary}`)
    .join("\n");

  const linkable = ctx.linkableNodes
    .map(
      (n) =>
        `- id=${n.id} date=${n.date} kind=${n.kind} title=${JSON.stringify(n.title)}`,
    )
    .join("\n");

  return `You are the ferment engine of ReTurn, a personal "daily save" second brain.
Produce a structured JSON review for the user's day. Do NOT invent attributes/scores — text only.

Rules:
- Output ONLY valid JSON matching the schema below. No markdown fences, no prose outside JSON.
- summary: 2–5 sentences of what the day was about.
- opening_line: one warm sentence spoken to the user the next morning (Before section).
- review_points: 2–6 concrete wins/misses/insights. Prefer evidence from nodes.
- todos: 1–7 actionable items for tomorrow. Anchor on the save_note if present; do not invent busywork.
- node_tags: map of node id → short tags (1–4 each) for active nodes you were given.
- edges: links between nodes. Prefer cross-day links using linkable_nodes. relation is a short label (e.g. "continues", "inspired_by", "related").

Schema:
{
  "summary": string,
  "opening_line": string,
  "review_points": [{"text": string, "kind": "win"|"miss"|"insight"|"other"}],
  "todos": [{"text": string}],
  "node_tags": { "<node_uuid>": string[] },
  "edges": [{"src_node_id": string, "dst_node_id": string, "relation": string}]
}

Date: ${ctx.date}

Save note (anchor, may be empty):
${ctx.saveNote ?? "(none)"}

Active feed nodes (knowledge — use these):
${nodesBlock || "(none)"}

Environment sessions (context only, NOT knowledge):
${sessionsSummary || "(none)"}

Recent day summaries:
${recent || "(none)"}

Linkable nodes from recent days (for edges):
${linkable || "(none)"}
`;
}

async function chatCompletion(userPrompt: string): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.llm.timeoutMs);
  try {
    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify({
        model: config.llm.model,
        temperature: 0.4,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system",
            content:
              "You output only compact JSON. Never wrap in markdown. Never include scores or attributes.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new FermentError(`LLM HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new FermentError("empty LLM response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  // Strip accidental fences
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1]!.trim() : trimmed;
  return JSON.parse(text);
}

function truncate(s: string | null, n: number): string | null {
  if (s == null) return null;
  return s.length <= n ? s : s.slice(0, n) + "…";
}

export function buildFermentContext(input: {
  date: string;
  saveNote: string | null;
  nodes: NodeRecord[];
  sessions: Session[];
  recentSummaries: Array<{ date: string; summary: string }>;
  linkableNodes: Array<{ id: string; date: string; title: string | null; kind: string }>;
}): FermentContext {
  const activeKinds = new Set(["text", "url", "voice", "save_note"]);
  return {
    date: input.date,
    saveNote: input.saveNote,
    activeNodes: input.nodes
      .filter((n) => activeKinds.has(n.kind))
      .map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        content: n.content,
      })),
    sessions: input.sessions,
    recentSummaries: input.recentSummaries,
    linkableNodes: input.linkableNodes,
  };
}
