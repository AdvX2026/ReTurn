import { NotConfiguredError, config, isWhisperConfigured } from "../config.js";

export class TranscribeError extends Error {
  constructor(
    message: string,
    override readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TranscribeError";
  }
}

/**
 * Whisper-compatible transcription (OpenAI /audio/transcriptions).
 */
export async function transcribeAudio(
  buffer: Buffer,
  filename: string,
  mimeType: string,
): Promise<string> {
  if (!isWhisperConfigured()) {
    throw new NotConfiguredError("Whisper", "set WHISPER_API_KEY or LLM_API_KEY");
  }
  const form = new FormData();
  const blob = new Blob([new Uint8Array(buffer)], {
    type: mimeType || "audio/webm",
  });
  form.append("file", blob, filename || "audio.webm");
  form.append("model", config.whisper.model);
  form.append("response_format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.whisper.timeoutMs);
  try {
    const res = await fetch(`${config.whisper.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.whisper.apiKey}`,
      },
      body: form,
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = await res.text();
      throw new TranscribeError(`Whisper HTTP ${res.status}: ${body.slice(0, 300)}`);
    }
    const data = (await res.json()) as { text?: string };
    if (!data.text) throw new TranscribeError("empty transcript");
    return data.text.trim();
  } finally {
    clearTimeout(timer);
  }
}
