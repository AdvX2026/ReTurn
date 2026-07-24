/**
 * Chat triage + workflows (PRD v0.6 F4 / §6.3).
 * Intent triage uses the same LLM as ferment/ask (LLM_MODEL).
 * Heuristic is only used when LLM is not configured (tests / offline).
 */

import type { ChatIntent, ChatResponse } from "@return/shared";
import { extractJson, llmChat } from "../ai/llm.js";
import { config, isLlmConfigured } from "../config.js";
import {
  insertCard,
  insertMessage,
  insertNode,
  insertTask,
  updateTask,
} from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { ask } from "../search/ask.js";
import { search } from "../search/query.js";
import { nowIso, todayDate, uuid } from "../util/time.js";
import type { MeetingTaskDispatcher } from "./meeting-tasks.js";

export interface ChatInput {
  text?: string;
  image?: string;
  device_id?: string;
  /** Force intent (user pick / correction). */
  intent?: ChatIntent;
}

const INTENTS = new Set<ChatIntent>(["idea", "retrieval", "question", "unknown"]);

/** Offline / test fallback when LLM_API_KEY is unset. Not used when LLM is configured. */
export function triageHeuristic(text: string): {
  intent: ChatIntent;
  confidence: number;
} {
  const t = text.trim();
  if (!t) return { intent: "unknown", confidence: 0 };
  if (
    /灵感|想法|点子|idea|灵感来了|记一下想法/i.test(t) ||
    t.startsWith("灵感:") ||
    t.startsWith("idea:")
  ) {
    return { intent: "idea", confidence: 0.85 };
  }
  if (
    /搜|找|定位|跳转|在哪|哪里|搜索|lookup|find|search|locate|搜一下|找一下|跳到/i.test(t)
  ) {
    return { intent: "retrieval", confidence: 0.8 };
  }
  if (
    /谁|什么|怎么|如何|为何|为什么|是否|有没有|吗|？|\?|干什么|做了什么/i.test(t) ||
    t.includes("？") ||
    t.includes("?")
  ) {
    return { intent: "question", confidence: 0.75 };
  }
  if (t.length <= 80) return { intent: "idea", confidence: 0.55 };
  return { intent: "question", confidence: 0.5 };
}

/**
 * LLM triage with the same provider/model as ferment (config.llm).
 * Returns unknown on parse failure so the user can pick.
 */
export async function triageWithLlm(text: string): Promise<{
  intent: ChatIntent;
  confidence: number;
}> {
  if (!isLlmConfigured()) {
    throw new Error("LLM not configured");
  }

  const raw = await llmChat({
    system: `You are the intent classifier for ReTurn (a personal second-brain agent).
Classify the user message into exactly one intent.

intents:
- "idea": user wants to record an inspiration, note, thought, or idea (not asking for search/answer)
- "retrieval": user wants to find/locate past records and jump to them (search, where is X, find that meeting)
- "question": user wants an answer about their past activity/records (what did I do, summarize yesterday)
- "unknown": ambiguous; do not guess

Rules:
- Prefer retrieval when the user wants to locate/jump to something.
- Prefer question when they want an explanation/summary/answer.
- Prefer idea for short free-form notes without a clear question/search.
- Output ONLY compact JSON: {"intent":"idea"|"retrieval"|"question"|"unknown","confidence":0..1}
- confidence < 0.55 should use "unknown".`,
    user: text,
    temperature: 0,
    timeoutMs: Math.min(config.llm.timeoutMs, 20_000),
    json: true,
  });
  return parseTriageJson(raw);
}

export function parseTriageJson(raw: string): {
  intent: ChatIntent;
  confidence: number;
} {
  const parsed = extractJson(raw) as {
    intent?: string;
    confidence?: number;
  };
  const intent = (parsed.intent ?? "unknown") as ChatIntent;
  if (!INTENTS.has(intent)) {
    return { intent: "unknown", confidence: 0 };
  }
  let confidence = Number(parsed.confidence);
  if (!Number.isFinite(confidence)) confidence = 0.5;
  confidence = Math.max(0, Math.min(1, confidence));
  if (confidence < 0.55 && intent !== "unknown") {
    return { intent: "unknown", confidence };
  }
  return { intent, confidence };
}

async function resolveIntent(text: string): Promise<{
  intent: ChatIntent;
  confidence: number;
}> {
  if (!isLlmConfigured()) {
    const h = triageHeuristic(text);
    if (h.confidence < 0.55) return { intent: "unknown", confidence: h.confidence };
    return h;
  }
  try {
    return await triageWithLlm(text);
  } catch (err) {
    console.warn(
      "[chat] LLM triage failed → unknown:",
      err instanceof Error ? err.message : err,
    );
    // Do not fall back to rules when LLM is configured — ask the user.
    return { intent: "unknown", confidence: 0 };
  }
}

export async function handleChat(
  db: Db,
  input: ChatInput,
  meetingTasks?: MeetingTaskDispatcher,
): Promise<ChatResponse> {
  const text = (input.text ?? "").trim();
  const hasImage = Boolean(input.image?.trim());

  if (!text && !hasImage) {
    throw new ChatError("text or image required");
  }

  if (hasImage && !text) {
    return runImageTask(db, input.image!, input.device_id);
  }

  // Structural task path (not F4 intent classes): long meeting notes dump.
  if (text.length > 400 || /会议纪要|会议记录|meeting notes/i.test(text)) {
    if (!meetingTasks) throw new ChatError("meeting task runner unavailable");
    return runMeetingTask(db, text, input.device_id, meetingTasks);
  }

  let intent: ChatIntent = input.intent ?? "unknown";
  let confidence = input.intent ? 1 : 0;
  if (!input.intent) {
    const h = await resolveIntent(text);
    intent = h.intent;
    confidence = h.confidence;
  }

  const userMsg = insertMessage(db, {
    role: "user",
    content: text || "[image]",
    intent,
    meta: hasImage ? { has_image: true } : null,
  });

  if (intent === "unknown") {
    const reply = "我不太确定你想做什么。请选择：记录灵感 / 检索定位 / 提问。";
    const agent = insertMessage(db, {
      role: "agent",
      content: reply,
      intent: "unknown",
      meta: { needs_intent_pick: true, user_message_id: userMsg.id },
    });
    return {
      message_id: agent.id,
      user_message_id: userMsg.id,
      intent: "unknown",
      confidence,
      reply,
    };
  }

  if (intent === "idea") {
    return runIdea(db, text, userMsg.id, input.device_id, confidence);
  }
  if (intent === "retrieval") {
    return runRetrieval(db, text, userMsg.id, confidence);
  }
  return runQuestion(db, text, userMsg.id, confidence);
}

async function runIdea(
  db: Db,
  text: string,
  userMessageId: string,
  deviceId: string | undefined,
  confidence: number,
): Promise<ChatResponse> {
  const body = text.replace(/^(灵感|idea)[:：]\s*/i, "").trim() || text;
  const { node } = insertNode(db, {
    client_uuid: uuid(),
    kind: "idea",
    title: body.slice(0, 60),
    content: body,
    device_id: deviceId ?? null,
    date: todayDate(),
    source_meta: { provenance: "user", source: "chat" },
  });
  insertCard(db, {
    type: "idea",
    date: todayDate(),
    content: {
      text: body,
      node_ids: [node.id],
      provenance: "user",
    },
  });
  const suggestion = isLlmConfigured()
    ? await tinySuggest(body).catch(() => "已记下这条灵感。")
    : "已记下这条灵感，稍后可在 Future 里看到。";
  const agent = insertMessage(db, {
    role: "agent",
    content: suggestion,
    intent: "idea",
    meta: { node_id: node.id, user_message_id: userMessageId },
  });
  return {
    message_id: agent.id,
    user_message_id: userMessageId,
    intent: "idea",
    confidence,
    reply: suggestion,
  };
}

async function runRetrieval(
  db: Db,
  text: string,
  userMessageId: string,
  confidence: number,
): Promise<ChatResponse> {
  const q = text.replace(/^(搜|找|定位|搜索|search|find|lookup)\s*/i, "").trim() || text;
  const result = await search(db, { q, limit: 10, semantic: true });
  const nodeIds = result.results
    .map((h) => h.node?.id)
    .filter((x): x is string => Boolean(x));
  const date =
    result.results[0]?.node?.date ?? result.results[0]?.day?.date ?? todayDate();
  const reply =
    nodeIds.length === 0
      ? "没在记录里找到相关内容，换个关键词试试。"
      : `找到 ${nodeIds.length} 条相关记录，已定位到 ${date}。`;
  const agent = insertMessage(db, {
    role: "agent",
    content: reply,
    intent: "retrieval",
    meta: { date, node_ids: nodeIds, user_message_id: userMessageId },
  });
  return {
    message_id: agent.id,
    user_message_id: userMessageId,
    intent: "retrieval",
    confidence,
    reply,
    jump: nodeIds.length ? { date, node_ids: nodeIds } : null,
  };
}

async function runQuestion(
  db: Db,
  text: string,
  userMessageId: string,
  confidence: number,
): Promise<ChatResponse> {
  let reply: string;
  let degraded = false;
  try {
    if (!isLlmConfigured()) {
      const result = await search(db, { q: text, limit: 5, semantic: false });
      if (result.results.length === 0) {
        reply = "没在你的记录里找到相关内容。（未配置 LLM，无法生成回答）";
      } else {
        reply = result.results
          .map((h, i) => `${i + 1}. [${h.kind}] ${h.snippet}`)
          .join("\n");
        degraded = true;
      }
    } else {
      const askResult = await ask(db, { question: text });
      reply = askResult.answer || "没在你的记录里找到相关内容。";
      degraded = askResult.degraded;
    }
  } catch (err) {
    reply = `提问失败：${err instanceof Error ? err.message : String(err)}`;
    degraded = true;
  }
  const agent = insertMessage(db, {
    role: "agent",
    content: reply,
    intent: "question",
    meta: { user_message_id: userMessageId, degraded },
  });
  return {
    message_id: agent.id,
    user_message_id: userMessageId,
    intent: "question",
    confidence,
    reply,
    degraded,
  };
}

/**
 * Persist meeting notes before dispatch (PRD F11). The SQLite Task is the queue
 * authority, so a restart can resume work without losing the original input.
 */
function runMeetingTask(
  db: Db,
  text: string,
  deviceId: string | undefined,
  meetingTasks: MeetingTaskDispatcher,
): ChatResponse {
  const response = db.transaction(() => {
    const task = insertTask(db, {
      type: "meeting_notes",
      status: "queued",
      input: {
        text,
        device_id: deviceId ?? null,
        date: todayDate(),
      },
    });
    const userMsg = insertMessage(db, {
      role: "user",
      content: text.slice(0, 500) + (text.length > 500 ? "…" : ""),
      intent: null,
      task_id: task.id,
    });
    const reply = "会议纪要已提交，正在整理…";
    const agent = insertMessage(db, {
      role: "agent",
      content: reply,
      intent: null,
      task_id: task.id,
      meta: { phase: "accepted", user_message_id: userMsg.id },
    });
    return {
      message_id: agent.id,
      user_message_id: userMsg.id,
      intent: "question" as const,
      confidence: 1,
      reply,
      task_id: task.id,
    };
  })();

  meetingTasks.wake();
  return response;
}

function runImageTask(db: Db, image: string, deviceId: string | undefined): ChatResponse {
  const task = insertTask(db, {
    type: "image_extract",
    status: "failed",
    input: { image_ref: image.slice(0, 200), note: "vision API not configured" },
  });
  const reply = "截图提取尚未接入视觉 API。请粘贴文本提交会议纪要，我会按 Task 处理。";
  const agent = insertMessage(db, {
    role: "agent",
    content: reply,
    task_id: task.id,
  });
  updateTask(db, task.id, {
    status: "failed",
    result_message_id: agent.id,
    finished_at: nowIso(),
  });
  const userMsg = insertMessage(db, {
    role: "user",
    content: "[image]",
    task_id: task.id,
  });
  void deviceId;
  return {
    message_id: agent.id,
    user_message_id: userMsg.id,
    intent: "unknown",
    confidence: 1,
    reply,
    task_id: task.id,
    degraded: true,
  };
}

async function tinySuggest(idea: string): Promise<string> {
  try {
    return await llmChat({
      system: "用一句中文简短回应用户的灵感记录，可给一点轻量建议。不超过40字。",
      user: idea,
      temperature: 0.4,
      timeoutMs: Math.min(config.llm.timeoutMs, 15_000),
    });
  } catch {
    return "已记下这条灵感。";
  }
}

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}
