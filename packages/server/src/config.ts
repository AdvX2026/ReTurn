import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

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
  /**
   * Shortcuts health write token. Empty / weak placeholder → /api/health disabled (503).
   * No insecure default (Codex P2). Set explicitly in .env.
   */
  healthToken: str("HEALTH_TOKEN", ""),
  /**
   * Shared secret for device/desktop clients (header X-Return-Token or Bearer).
   * Empty = open LAN mode (demo only). Set in real/demo-on-shared-wifi.
   */
  apiToken: str("API_TOKEN", ""),
  /** Comma-separated CORS origins. Empty = reflect request origin (dev). */
  corsOrigins: str("CORS_ORIGINS", "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  sampleIntervalMin: num("SAMPLE_INTERVAL_MIN", 5),
  version: "0.1.0",

  llm: {
    baseUrl: str("LLM_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
    apiKey: str("LLM_API_KEY"),
    model: str("LLM_MODEL", "gpt-4o-mini"),
    timeoutMs: num("LLM_TIMEOUT_MS", 45_000),
  },

  whisper: {
    baseUrl:
      str("WHISPER_BASE_URL") ||
      str("LLM_BASE_URL", "https://api.openai.com/v1").replace(/\/$/, ""),
    apiKey: str("WHISPER_API_KEY") || str("LLM_API_KEY"),
    model: str("WHISPER_MODEL", "whisper-1"),
    timeoutMs: num("WHISPER_TIMEOUT_MS", 60_000),
  },

  /**
   * Embedding channel (global search Phase 2). Defaults fall back to LLM_*.
   * Empty key → semantic channel off; keyword search still works.
   */
  embedding: {
    baseUrl: (
      str("EMBEDDING_BASE_URL") || str("LLM_BASE_URL", "https://api.openai.com/v1")
    ).replace(/\/$/, ""),
    apiKey: str("EMBEDDING_API_KEY") || str("LLM_API_KEY"),
    model: str("EMBEDDING_MODEL", "text-embedding-3-small"),
    timeoutMs: num("EMBEDDING_TIMEOUT_MS", 30_000),
  },
} as const;

export type Config = typeof config;

/** Reject empty / known-placeholder health tokens (Codex P2). */
export function isHealthTokenConfigured(token = config.healthToken): boolean {
  const t = token.trim();
  if (!t) return false;
  if (t === "change-me-health-token" || t === "changeme") return false;
  return true;
}

export function isLlmConfigured(apiKey = config.llm.apiKey): boolean {
  return Boolean(apiKey?.trim());
}

export function isEmbeddingConfigured(apiKey = config.embedding.apiKey): boolean {
  return Boolean(apiKey?.trim());
}
