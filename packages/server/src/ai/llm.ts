/**
 * Shared OpenAI-compatible chat/completions helper.
 * All server LLM call sites go through here (ferment / ask / chat / resume).
 */
import { NotConfiguredError, config, isLlmConfigured } from "../config.js";

export class LlmError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}

export interface LlmChatOptions {
  system: string;
  user: string;
  imageUrl?: string;
  temperature?: number;
  /** Defaults to config.llm.timeoutMs. */
  timeoutMs?: number;
  /** When true, request response_format json_object. */
  json?: boolean;
}

export async function llmChat(opts: LlmChatOptions): Promise<string> {
  if (!isLlmConfigured()) {
    throw new NotConfiguredError("LLM", "set LLM_API_KEY");
  }
  const timeoutMs = opts.timeoutMs ?? config.llm.timeoutMs;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: config.llm.model,
      temperature: opts.temperature ?? 0.3,
      messages: [
        { role: "system", content: opts.system },
        {
          role: "user",
          content: opts.imageUrl
            ? [
                { type: "text", text: opts.user },
                { type: "image_url", image_url: { url: opts.imageUrl } },
              ]
            : opts.user,
        },
      ],
    };
    if (opts.json) {
      body.response_format = { type: "json_object" };
    }

    const res = await fetch(`${config.llm.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.llm.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    if (!res.ok) {
      const text = await res.text();
      throw new LlmError(`LLM HTTP ${res.status}: ${text.slice(0, 300)}`);
    }
    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new LlmError("empty LLM response");
    return content;
  } finally {
    clearTimeout(timer);
  }
}

/** Strip optional markdown fences then JSON.parse. */
export function extractJson(raw: string): unknown {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  const text = fenced ? fenced[1]!.trim() : trimmed;
  return JSON.parse(text);
}
