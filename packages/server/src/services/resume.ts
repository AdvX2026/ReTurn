/**
 * Resume — short recap of recent sessions (PRD F6).
 */

import type { ResumeResponse } from "@return/shared";
import { config, isLlmConfigured } from "../config.js";
import { insertMessage, listNodesByDate } from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { allSessions } from "../stats/sessions.js";
import { todayDate } from "../util/time.js";

export async function handleResume(
  db: Db,
  opts?: { hours?: number },
): Promise<ResumeResponse> {
  const hours = Math.min(Math.max(opts?.hours ?? 3, 1), 24);
  const date = todayDate();
  const nodes = listNodesByDate(db, date);
  const sessions = allSessions(nodes, config.sampleIntervalMin);
  const cutoff = Date.now() - hours * 3600_000;
  const recent = sessions.filter((s) => new Date(s.end).getTime() >= cutoff);

  let reply: string;
  let degraded = false;

  if (recent.length === 0) {
    reply = `最近 ${hours} 小时没有明显的应用或 Agent 会话记录。`;
    degraded = true;
  } else {
    const lines = recent
      .slice(0, 12)
      .map((s) => `- [${s.kind}] ${s.app}: ${Math.round(s.durationMin)}min`)
      .join("\n");
    if (isLlmConfigured()) {
      try {
        reply = await tinyRecap(lines, hours);
      } catch {
        reply = templateRecap(recent, hours);
        degraded = true;
      }
    } else {
      reply = templateRecap(recent, hours);
      degraded = true;
    }
  }

  const msg = insertMessage(db, {
    role: "agent",
    content: reply,
    meta: { kind: "resume", hours, degraded },
  });

  return { message_id: msg.id, reply, degraded };
}

function templateRecap(
  recent: Array<{ app: string; kind: string; durationMin: number }>,
  hours: number,
): string {
  const top = [...recent]
    .sort((a, b) => b.durationMin - a.durationMin)
    .slice(0, 3)
    .map((s) => `${s.app}（${Math.round(s.durationMin)}分钟）`)
    .join("、");
  return `你刚才大约 ${hours} 小时里主要在：${top || "一些零散活动"}。`;
}

async function tinyRecap(sessionLines: string, hours: number): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    Math.min(config.llm.timeoutMs, 20_000),
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
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content:
              "用一两句中文告诉用户他刚才在忙什么。口语、简短、不要列表。只根据给定会话。",
          },
          {
            role: "user",
            content: `最近${hours}小时会话：\n${sessionLines}`,
          },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`LLM ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("empty");
    return content;
  } finally {
    clearTimeout(timer);
  }
}
