import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv();

function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function str(name: string, fallback = ""): string {
  return process.env[name] ?? fallback;
}

export const config = {
  port: num("PORT", 8787),
  host: str("HOST", "0.0.0.0"),
  dataDir: resolve(str("DATA_DIR", "./data")),
  healthToken: str("HEALTH_TOKEN", "change-me-health-token"),
  sampleIntervalMin: num("SAMPLE_INTERVAL_MIN", 5),
  version: "0.1.0",

  llm: {
    baseUrl: str("LLM_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
    apiKey: str("LLM_API_KEY"),
    model: str("LLM_MODEL", "gpt-4o-mini"),
    timeoutMs: num("LLM_TIMEOUT_MS", 45_000),
  },

  whisper: {
    baseUrl: str("WHISPER_BASE_URL") || str("LLM_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
    apiKey: str("WHISPER_API_KEY") || str("LLM_API_KEY"),
    model: str("WHISPER_MODEL", "whisper-1"),
    timeoutMs: num("WHISPER_TIMEOUT_MS", 60_000),
  },
} as const;

export type Config = typeof config;
