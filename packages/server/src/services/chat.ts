/**
 * Chat triage + workflows (PRD v0.6 F4 / §6.3).
 * Cheap heuristic triage by default; optional small LLM when configured.
 */

import type { ChatIntent, ChatResponse } from "@return/shared";
import { config, isLlmConfigured } from "../config.js";
import {
  currentCadence,
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

export interface ChatInput {
  text?: string;
  image?: string;
  device_id?: string;
  /** Force intent (user pick / correction). */
  intent?: ChatIntent;
}

const RETRIEVAL_HINT =
  /搜|找|定位|跳转|在哪|哪里|搜索|lookup|find|search|locate|搜一下|找一下|跳到/i;
const QUESTION_HINT =
  /谁|什么|怎么|如何|为何|为什么|是否|有没有|吗|？|\?|干什么|做了什么/i;
const IDEA_HINT = /灵感|想法|点子|idea|灵感来了|记一下想法/i;

/** Deterministic triage — primary path when no LLM or low confidence. */
export function triageHeuristic(text: string): {
  intent: ChatIntent;
  confidence: number;
} {
  const t = text.trim();
  if (!t) return { intent: "unknown", confidence: 0 };

  if (IDEA_HINT.test(t) || t.startsWith("灵感:") || t.startsWith("idea:")) {
    return { intent: "idea", confidence: 0.85 };
  }
  // Retrieval before question — "搜索 X" must not fall into short-idea bucket.
  if (RETRIEVAL_HINT.test(t)) {
    return { intent: "retrieval", confidence: 0.8 };
  }
  // Meeting notes dump → task path via long text + keywords
  if (t.length > 200 || /会议纪要|会议记录|纪要|meeting notes|transcript/i.test(t)) {
    // Prefer task when clearly notes; still a "question" style chat entry
    // Handled as task submission below when length/keywords match.
  }
  if (QUESTION_HINT.test(t) || t.includes("？") || t.includes("?")) {
    return { intent: "question", confidence: 0.75 };
  }
  // Short free text without question mark → idea
  if (t.length <= 80) {
    return { intent: "idea", confidence: 0.55 };
  }
  return { intent: "question", confidence: 0.5 };
}

export async function handleChat(db: Db, input: ChatInput): Promise<ChatResponse> {
  const text = (input.text ?? "").trim();
  const hasImage = Boolean(input.image?.trim());

  if (!text && !hasImage) {
    throw new ChatError("text or image required");
  }

  // Image without text → task image_extract
  if (hasImage && !text) {
    return runImageTask(db, input.image!, input.device_id);
  }

  // Long meeting notes → task
  if (text.length > 400 || /会议纪要|会议记录|meeting notes/i.test(text)) {
    return runMeetingTask(db, text, input.device_id);
  }

  let intent: ChatIntent = input.intent ?? "unknown";
  let confidence = input.intent ? 1 : 0;
  if (!input.intent) {
    const h = triageHeuristic(text);
    intent = h.intent;
    confidence = h.confidence;
    if (confidence < 0.55) {
      intent = "unknown";
    }
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
      // Fall back to keyword hits as a short digest
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

function runMeetingTask(
  db: Db,
  text: string,
  deviceId: string | undefined,
): ChatResponse {
  const task = insertTask(db, {
    type: "meeting_notes",
    status: "running",
    input: { text: text.slice(0, 20_000) },
  });
  // Sync process for hackathon: extract → high-weight node → done message
  const title = text.slice(0, 40).replace(/\s+/g, " ");
  const { node } = insertNode(db, {
    client_uuid: uuid(),
    kind: "text",
    title: `会议纪要: ${title}`,
    content: text,
    device_id: deviceId ?? null,
    date: todayDate(),
    source_meta: { source: "task", task_id: task.id, weight: "high" },
  });
  const reply = `会议纪要已整理并入库（高权重）。节点 ${node.id.slice(0, 8)}…`;
  const agent = insertMessage(db, {
    role: "agent",
    content: reply,
    intent: null,
    task_id: task.id,
    meta: { node_id: node.id },
  });
  updateTask(db, task.id, {
    status: "done",
    result_message_id: agent.id,
    finished_at: nowIso(),
  });
  const userMsg = insertMessage(db, {
    role: "user",
    content: text.slice(0, 500) + (text.length > 500 ? "…" : ""),
    intent: null,
    task_id: task.id,
  });
  return {
    message_id: agent.id,
    user_message_id: userMsg.id,
    intent: "question",
    confidence: 1,
    reply,
    task_id: task.id,
  };
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
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(config.llm.timeoutMs, 15_000),
  );
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
        messages: [
          {
            role: "system",
            content: "用一句中文简短回应用户的灵感记录，可给一点轻量建议。不超过40字。",
          },
          { role: "user", content: idea },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return data.choices?.[0]?.message?.content?.trim() || "已记下这条灵感。";
  } finally {
    clearTimeout(timer);
  }
}

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}

export { currentCadence };
