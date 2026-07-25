/**
 * Resume — short recap of recent sessions (PRD F6).
 */

import type { ResumeResponse } from "@return/shared";
import { llmChat } from "../ai/llm.js";
import { config } from "../config.js";
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

  const reply =
    recent.length === 0
      ? `最近 ${hours} 小时没有明显的应用或 Agent 会话记录。`
      : await llmChat({
          system:
            "用一两句中文告诉用户他刚才在忙什么。口语、简短、不要列表。只根据给定会话。",
          user: `最近${hours}小时会话：\n${recent
            .slice(0, 12)
            .map((s) => `- [${s.kind}] ${s.app}: ${Math.round(s.durationMin)}min`)
            .join("\n")}`,
          temperature: 0.3,
          timeoutMs: Math.min(config.llm.timeoutMs, 20_000),
        });

  const msg = insertMessage(db, {
    role: "agent",
    content: reply,
    meta: { kind: "resume", hours },
  });

  return { message_id: msg.id, reply, degraded: false };
}
