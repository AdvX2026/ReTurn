/**
 * Chat triage + workflows (PRD v0.6 F4 / §6.3).
 * Intent triage uses the same LLM as ferment/ask (LLM_MODEL).
 */

import type { ChatIntent, ChatResponse } from "@return/shared";
import { extractJson, llmChat } from "../ai/llm.js";
import { config } from "../config.js";
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

/**
 * LLM triage with the same provider/model as ferment (config.llm).
 * Returns unknown on parse failure so the user can pick.
 */
export async function triageWithLlm(text: string): Promise<{
  intent: ChatIntent;
  confidence: number;
}> {
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

  if (hasImage) {
    return runImageTask(db, input.image!, text, input.device_id);
  }

  // Structural task path (not F4 intent classes): long meeting notes dump.
  if (text.length > 400 || /会议纪要|会议记录|meeting notes/i.test(text)) {
    if (!meetingTasks) throw new ChatError("meeting task runner unavailable");
    return runMeetingTask(db, text, input.device_id, meetingTasks);
  }

  let intent: ChatIntent = input.intent ?? "unknown";
  let confidence = input.intent ? 1 : 0;
  if (!input.intent) {
    const h = await triageWithLlm(text);
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
  const suggestion = await llmChat({
    system: "用一句中文简短回应用户的灵感记录，可给一点轻量建议。不超过40字。",
    user: body,
    temperature: 0.4,
    timeoutMs: Math.min(config.llm.timeoutMs, 15_000),
  });
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
  const result = await search(db, { q, limit: 10 });
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
  const askResult = await ask(db, { question: text });
  const reply = askResult.answer || "没在你的记录里找到相关内容。";
  const agent = insertMessage(db, {
    role: "agent",
    content: reply,
    intent: "question",
    meta: { user_message_id: userMessageId },
  });
  return {
    message_id: agent.id,
    user_message_id: userMessageId,
    intent: "question",
    confidence,
    reply,
    degraded: false,
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

async function runImageTask(
  db: Db,
  image: string,
  note: string,
  deviceId: string | undefined,
): Promise<ChatResponse> {
  const imageUrl = normalizeImage(image);
  const extracted = await llmChat({
    system: "提取图片中可见的文字并整理为简洁笔记。只描述图片中能确认的内容，不要猜测。",
    user: note || "请提取并整理这张图片中的文字。",
    imageUrl,
    temperature: 0.1,
  });

  return db.transaction(() => {
    const task = insertTask(db, {
      type: "image_extract",
      status: "running",
      input: { note: note || null },
    });
    const userMsg = insertMessage(db, {
      role: "user",
      content: note || "[image]",
      task_id: task.id,
      meta: { has_image: true },
    });
    const { node } = insertNode(db, {
      client_uuid: task.id,
      kind: "image",
      title: note.slice(0, 60) || "图片笔记",
      content: extracted,
      device_id: deviceId ?? null,
      date: todayDate(),
      source_meta: {
        source: "task",
        task_id: task.id,
        weight: "high",
        processed: true,
      },
    });
    const reply = "图片内容已提取并入库。";
    const agent = insertMessage(db, {
      role: "agent",
      content: reply,
      task_id: task.id,
      meta: { phase: "done", node_id: node.id, user_message_id: userMsg.id },
    });
    updateTask(db, task.id, {
      status: "done",
      result_message_id: agent.id,
      finished_at: nowIso(),
    });
    return {
      message_id: agent.id,
      user_message_id: userMsg.id,
      intent: "idea" as const,
      confidence: 1,
      reply,
      task_id: task.id,
      degraded: false,
    };
  })();
}

function normalizeImage(image: string): string {
  const value = image.trim();
  if (/^https:/i.test(value)) {
    let url: URL;
    try {
      url = new URL(value);
    } catch {
      throw new ChatError("image contains an invalid HTTPS URL");
    }
    if (url.protocol !== "https:" || !url.hostname) {
      throw new ChatError("image URL must use HTTPS");
    }
    return url.toString();
  }

  const dataUrl = value.match(
    /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+=*)$/i,
  );
  const declaredMime = dataUrl?.[1]?.toLowerCase() ?? null;
  const encoded = (dataUrl?.[2] ?? value).replace(/\s+/g, "");
  if (!/^[A-Za-z0-9+/]+=*$/.test(encoded)) {
    throw new ChatError("image must be an HTTPS URL, data URL, or base64 image");
  }
  const bytes = Buffer.from(encoded, "base64");
  const canonical = bytes.toString("base64").replace(/=+$/, "");
  if (!bytes.length || canonical !== encoded.replace(/=+$/, "")) {
    throw new ChatError("image contains invalid base64");
  }
  const mime = bytes.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))
    ? "image/jpeg"
    : bytes
          .subarray(0, 8)
          .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
      ? "image/png"
      : bytes.subarray(0, 4).toString("ascii") === "RIFF" &&
          bytes.subarray(8, 12).toString("ascii") === "WEBP"
        ? "image/webp"
        : null;
  if (!mime) throw new ChatError("image must be JPEG, PNG, or WebP");
  if (declaredMime && declaredMime !== mime) {
    throw new ChatError("image data does not match its declared MIME type");
  }
  return `data:${mime};base64,${encoded}`;
}

export class ChatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatError";
  }
}
