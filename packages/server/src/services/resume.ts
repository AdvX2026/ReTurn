import type { ResumeResponse } from "@return/shared";
import { config } from "../config.js";
import { insertMessage, listNodesByDate } from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { allSessions } from "../stats/sessions.js";
import { todayDate } from "../util/time.js";

/**
 * Resume small recap (PRD F6): last N hours of sessions → one line → Now message.
 */
export async function handleResume(
  db: Db,
  opts: { hours?: number } = {},
): Promise<ResumeResponse> {
  const hours = opts.hours ?? 3;
  const date = todayDate();
  const nodes = listNodesByDate(db, date);
  const sessions = allSessions(nodes, config.sampleIntervalMin);
  const cutoff = Date.now() - hours * 3600_000;
  const recent = sessions.filter((s) => Date.parse(s.end) >= cutoff);

  let reply: string;
  if (recent.length === 0) {
    reply = `最近 ${hours} 小时没有明显的应用/Agent 会话。也许你在休息，或采样器还没跑起来。`;
  } else {
    const byApp = new Map<string, number>();
    for (const s of recent) {
      byApp.set(s.app, (byApp.get(s.app) ?? 0) + s.durationMin);
    }
    const ranked = [...byApp.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked[0]!;
    const others = ranked
      .slice(1, 3)
      .map(([app, m]) => `${app} ${Math.round(m)}min`)
      .join("、");
    reply = others
      ? `你刚才主要在 ${top[0]}（约 ${Math.round(top[1])} 分钟），另外还有 ${others}。`
      : `你刚才主要在 ${top[0]}（约 ${Math.round(top[1])} 分钟）。`;

    if (config.llm.apiKey) {
      try {
        const lines = recent
          .slice(-12)
          .map((s) => `${s.kind}:${s.app} ${Math.round(s.durationMin)}min`)
          .join("; ");
        reply = await llmOneLiner(
          `Summarize in one short Chinese sentence what the user was doing. Sessions: ${lines}`,
        );
      } catch {
        /* keep template */
      }
    }
  }

  const message = insertMessage(db, {
    role: "agent",
    content: reply,
    intent: null,
  });
  return { message, reply };
}

async function llmOneLiner(prompt: string): Promise<string> {
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
        temperature: 0.2,
        messages: [
          { role: "system", content: "One short Chinese sentence. No quotes." },
          { role: "user", content: prompt },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const c = data.choices?.[0]?.message?.content?.trim();
    if (!c) throw new Error("empty");
    return c;
  } finally {
    clearTimeout(timer);
  }
}
