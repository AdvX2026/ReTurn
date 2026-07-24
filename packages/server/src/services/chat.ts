import type {
  ChatResponse,
  MessageIntent,
  MessageRecord,
  TaskRecord,
} from "@return/shared";
import { config } from "../config.js";
import {
  getMessage,
  insertCard,
  insertMessage,
  insertNode,
  insertTask,
  listNodesByDate,
  listSavedDays,
  setMessageIntent,
  updateTask,
} from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { addDays, todayDate, uuid } from "../util/time.js";

const INTENT_KEYWORDS: Array<{ intent: MessageIntent; re: RegExp }> = [
  { intent: "retrieval", re: /找|搜|定位|哪里|哪天|什么时候看过|检索/i },
  {
    intent: "question",
    re: /什么|为什么|怎么|如何|干了|在做|总结|回顾|昨天|刚才|下午|上午|\?|？/i,
  },
  { intent: "task", re: /纪要|会议|笔记|整理这段|提取要点|task/i },
  { intent: "idea", re: /灵感|想法|记一下|备忘|idea/i },
];

export function triageIntent(text: string): {
  intent: MessageIntent;
  confidence: number;
} {
  const t = text.trim();
  if (!t) return { intent: "question", confidence: 0 };
  for (const { intent, re } of INTENT_KEYWORDS) {
    if (re.test(t)) return { intent, confidence: 0.75 };
  }
  // Default question for free-form — mainline workflow.
  return { intent: "question", confidence: 0.45 };
}

export async function handleChat(
  db: Db,
  input: {
    text?: string;
    image?: string;
    device_id?: string | null;
    intent?: MessageIntent;
  },
): Promise<ChatResponse> {
  const text = (input.text ?? "").trim() || (input.image ? "[image]" : "");
  if (!text) {
    throw new ChatError("text or image required");
  }

  const forced = input.intent;
  const triaged = forced ? { intent: forced, confidence: 1 } : triageIntent(text);

  // Low confidence without forced intent: still record user message, ask user.
  if (!forced && triaged.confidence < 0.5) {
    const userMsg = insertMessage(db, {
      role: "user",
      content: text,
      intent: null,
    });
    const reply = "我不太确定你的意图。请选一个：灵感 / 检索 / 提问 / 任务（纪要）。";
    const agent = insertMessage(db, {
      role: "agent",
      content: reply,
      intent: null,
    });
    return {
      message_id: userMsg.id,
      intent: null,
      confidence: triaged.confidence,
      reply,
      result: {
        needs_intent: true,
        options: ["idea", "retrieval", "question", "task"],
      },
      agent_message: agent,
    };
  }

  const intent = triaged.intent;
  const userMsg = insertMessage(db, {
    role: "user",
    content: text,
    intent,
  });

  const outcome = await runWorkflow(db, intent, text, input.device_id ?? null);
  const agent = insertMessage(db, {
    role: "agent",
    content: outcome.reply,
    intent,
    task_id: outcome.task_id ?? null,
  });

  if (outcome.task_id) {
    updateTask(db, outcome.task_id, {
      result_message_id: agent.id,
    });
  }

  return {
    message_id: userMsg.id,
    intent,
    confidence: triaged.confidence,
    reply: outcome.reply,
    result: outcome.result,
    agent_message: agent,
  };
}

export async function rehandleWithIntent(
  db: Db,
  messageId: string,
  intent: MessageIntent,
): Promise<{
  message: MessageRecord;
  reply?: string;
  result?: Record<string, unknown>;
}> {
  const msg = getMessage(db, messageId);
  if (!msg) throw new ChatError("message not found", 404);
  if (msg.role !== "user") throw new ChatError("only user messages have intent");
  const updated = setMessageIntent(db, messageId, intent)!;
  const outcome = await runWorkflow(db, intent, msg.content, null);
  insertMessage(db, {
    role: "agent",
    content: outcome.reply,
    intent,
    task_id: outcome.task_id ?? null,
  });
  return { message: updated, reply: outcome.reply, result: outcome.result };
}

async function runWorkflow(
  db: Db,
  intent: MessageIntent,
  text: string,
  deviceId: string | null,
): Promise<{
  reply: string;
  result?: Record<string, unknown>;
  task_id?: string;
}> {
  switch (intent) {
    case "idea":
      return workflowIdea(db, text, deviceId);
    case "retrieval":
      return workflowRetrieval(db, text);
    case "task":
      return workflowTask(db, text, deviceId);
    case "question":
      return workflowQuestion(db, text);
    default:
      return { reply: "好的。" };
  }
}

function workflowIdea(
  db: Db,
  text: string,
  deviceId: string | null,
): {
  reply: string;
  result: Record<string, unknown>;
} {
  const date = todayDate();
  const { node } = insertNode(db, {
    client_uuid: uuid(),
    kind: "idea",
    title: text.slice(0, 80),
    content: text,
    device_id: deviceId,
    date,
    source_meta: { provenance: "user" },
  });
  const card = insertCard(db, {
    type: "idea",
    date,
    content: {
      text,
      provenance: "user",
      node_id: node.id,
    },
  });
  return {
    reply: `已记下灵感，放进 Future。\n「${text.slice(0, 60)}${text.length > 60 ? "…" : ""}」`,
    result: { node_id: node.id, card_id: card.id, provenance: "user" },
  };
}

function workflowRetrieval(
  db: Db,
  text: string,
): {
  reply: string;
  result: Record<string, unknown>;
} {
  const q = text.trim().toLowerCase();
  const tokens = q
    .split(/[\s,，。？?！!、]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2)
    .slice(0, 6);
  const hits: Array<{
    date: string;
    node_id: string;
    title: string | null;
    kind: string;
  }> = [];

  // Scan last 14 days, keyword in title/content.
  for (let i = 0; i < 14 && hits.length < 12; i++) {
    const date = addDays(todayDate(), -i);
    for (const n of listNodesByDate(db, date)) {
      if (["app_sample", "tab_sample", "snapshot"].includes(n.kind)) continue;
      const hay = `${n.title ?? ""} ${n.content ?? ""}`.toLowerCase();
      const ok = tokens.length === 0 ? false : tokens.some((t) => hay.includes(t));
      if (!ok) continue;
      hits.push({
        date,
        node_id: n.id,
        title: n.title,
        kind: n.kind,
      });
      if (hits.length >= 12) break;
    }
  }

  if (hits.length === 0) {
    return {
      reply: "没找到匹配的记录。可以换个关键词，或到时间线里手动翻。",
      result: { hits: [], date: null, node_ids: [] },
    };
  }
  const top = hits[0]!;
  const lines = hits
    .slice(0, 5)
    .map((h) => `· ${h.date} [${h.kind}] ${h.title || h.node_id.slice(0, 8)}`);
  return {
    reply: `找到 ${hits.length} 条，最近一条在 ${top.date}：\n${lines.join("\n")}`,
    result: {
      date: top.date,
      node_ids: hits.map((h) => h.node_id),
      hits,
    },
  };
}

async function workflowQuestion(
  db: Db,
  text: string,
): Promise<{ reply: string; result?: Record<string, unknown> }> {
  const today = todayDate();
  const nodes = listNodesByDate(db, today);
  const recent = listSavedDays(db, addDays(today, -5))
    .filter((d) => d.summary)
    .slice(-3)
    .map((d) => `${d.date}: ${d.summary}`);
  const active = nodes
    .filter((n) =>
      ["text", "url", "voice", "save_note", "idea", "agent_session"].includes(n.kind),
    )
    .slice(-20)
    .map(
      (n) => `- ${n.kind}: ${n.title || n.content?.slice(0, 100) || n.id.slice(0, 8)}`,
    );

  const context = [
    `Today ${today} nodes:`,
    active.join("\n") || "(none)",
    `Recent summaries:`,
    recent.join("\n") || "(none)",
  ].join("\n");

  if (!config.llm.apiKey) {
    // Template fallback for demos without key.
    const reply =
      active.length > 0
        ? `根据今天的记录，我看到 ${active.length} 条相关痕迹。问：「${text.slice(0, 40)}」。\n最近：${active.slice(-3).join("；")}`
        : `今天还没有太多记录可回答「${text.slice(0, 40)}」。可以先记一点或等采样积累。`;
    return { reply, result: { degraded: true } };
  }

  try {
    const reply = await llmReply(
      `You are ReTurn, a personal second-brain. Answer briefly in Chinese based only on context. If unknown, say so.\n\nContext:\n${context}\n\nUser: ${text}`,
    );
    return { reply, result: { degraded: false } };
  } catch {
    return {
      reply: `暂时无法调用模型。本地线索：${active.slice(-2).join("；") || "无"}`,
      result: { degraded: true },
    };
  }
}

function workflowTask(
  db: Db,
  text: string,
  deviceId: string | null,
): {
  reply: string;
  result: Record<string, unknown>;
  task_id: string;
} {
  const task = insertTask(db, {
    type: "notes",
    input_json: { text, device_id: deviceId },
  });
  // Sync-minimal: extract as high-weight text node + mark done.
  // ponytail: no queue worker; upgrade to async if Task latency matters.
  updateTask(db, task.id, { status: "running" });
  const date = todayDate();
  const bullets = extractNotesBullets(text);
  const { node } = insertNode(db, {
    client_uuid: uuid(),
    kind: "text",
    title: "Task notes",
    content: bullets.join("\n"),
    device_id: deviceId,
    date,
    source_meta: { source: "task", task_id: task.id, weight: "high" },
  });
  const finished = updateTask(db, task.id, {
    status: "done",
    finished_at: new Date().toISOString(),
  }) as TaskRecord;

  return {
    reply: `纪要已整理（${bullets.length} 条要点），权重高于自动采集。\n${bullets
      .slice(0, 5)
      .map((b) => `· ${b}`)
      .join("\n")}`,
    result: {
      task: finished,
      node_id: node.id,
      bullets,
    },
    task_id: task.id,
  };
}

function extractNotesBullets(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[\s\-*•]+/, "").trim())
    .filter(Boolean);
  if (lines.length >= 2) return lines.slice(0, 12);
  // Sentence split fallback.
  return text
    .split(/[。.!！?？;；]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 4)
    .slice(0, 12);
}

async function llmReply(userPrompt: string): Promise<string> {
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
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "Reply in concise Chinese. No markdown fences.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("empty LLM");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

export class ChatError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "ChatError";
  }
}
