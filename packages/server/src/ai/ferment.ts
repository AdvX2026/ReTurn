import {
  ACTIVE_FEED_KINDS,
  type FermentResult,
  FermentResultSchema,
  type NodeRecord,
  type Session,
} from "@return/shared";
import { config } from "../config.js";
import { extractJson, llmChat } from "./llm.js";

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
  /** Open Apple Reminders — do not re-suggest (dedupe). */
  openReminders: string[];
  /** Accepted AI suggestions — positive preference samples. */
  acceptedTodos: string[];
  /** Dismissed / expired suggestions — negative samples. */
  dismissedTodos: string[];
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
export async function runFerment(ctx: FermentContext): Promise<FermentResult> {
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

  const recent = ctx.recentSummaries.map((r) => `- ${r.date}: ${r.summary}`).join("\n");

  const linkable = ctx.linkableNodes
    .map(
      (n) =>
        `- id=${n.id} date=${n.date} kind=${n.kind} title=${JSON.stringify(n.title)}`,
    )
    .join("\n");

  const openRem = ctx.openReminders.map((t) => `- ${t}`).join("\n");
  const accepted = ctx.acceptedTodos.map((t) => `- ${t}`).join("\n");
  const dismissed = ctx.dismissedTodos.map((t) => `- ${t}`).join("\n");

  return `You are the ferment engine of ReTurn, a personal "daily save" second brain.
Produce a structured JSON review for the user's day. Do NOT invent attributes/scores — text only.

Rules:
- Output ONLY valid JSON matching the schema below. No markdown fences, no prose outside JSON.
- summary: 2–5 sentences of what the day was about.
- opening_line: one warm sentence for next-morning greeting / briefing headline.
- briefing: optional longer briefing body (defaults to summary if omitted).
- review_points: 2–6 concrete wins/misses/insights. Prefer evidence from nodes.
- todos: 1–7 actionable AI suggestions for tomorrow (NOT the real checklist — that lives in Apple Reminders).
  * NEVER re-suggest anything already listed under open_reminders (dedupe).
  * Prefer style/topics of accepted_todos; avoid patterns in dismissed_todos.
  * Anchor on the save_note if present; do not invent busywork or life-chores.
- health_advice: optional one short health tip from sleep/steps if present.
- ideas: optional auto-extracted ideas (short), provenance will be marked auto.
- node_tags: map of node id → short tags (1–4 each) for active nodes you were given.
- edges: links between nodes. Prefer cross-day links using linkable_nodes. relation is a short label (e.g. "continues", "inspired_by", "related").

Schema:
{
  "summary": string,
  "opening_line": string,
  "briefing": string,
  "review_points": [{"text": string, "kind": "win"|"miss"|"insight"|"other"}],
  "todos": [{"text": string}],
  "health_advice": string|null,
  "ideas": [{"text": string}],
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

Open Apple Reminders (already on the real checklist — do NOT re-suggest):
${openRem || "(none)"}

Accepted AI suggestions (positive preference samples):
${accepted || "(none)"}

Dismissed AI suggestions (negative samples — avoid similar):
${dismissed || "(none)"}
`;
}

async function chatCompletion(userPrompt: string): Promise<string> {
  try {
    return await llmChat({
      system:
        "You output only compact JSON. Never wrap in markdown. Never include scores or attributes.",
      user: userPrompt,
      temperature: 0.4,
      json: true,
    });
  } catch (err) {
    throw new FermentError(err instanceof Error ? err.message : "LLM call failed", err);
  }
}

function truncate(s: string | null, n: number): string | null {
  if (s == null) return null;
  return s.length <= n ? s : `${s.slice(0, n)}…`;
}

export function buildFermentContext(input: {
  date: string;
  saveNote: string | null;
  nodes: NodeRecord[];
  sessions: Session[];
  recentSummaries: Array<{ date: string; summary: string }>;
  linkableNodes: Array<{ id: string; date: string; title: string | null; kind: string }>;
  openReminders?: string[];
  acceptedTodos?: string[];
  dismissedTodos?: string[];
}): FermentContext {
  const activeKinds = new Set<string>(ACTIVE_FEED_KINDS);
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
    openReminders: input.openReminders ?? [],
    acceptedTodos: input.acceptedTodos ?? [],
    dismissedTodos: input.dismissedTodos ?? [],
  };
}
