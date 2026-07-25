import { resolve } from "node:path";
import { config as loadEnv } from "dotenv";

loadEnv();

function positiveNumber(name: string, defaultValue: number): number {
  const v = process.env[name];
  if (v === undefined || v === "") return defaultValue;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`invalid ${name}: expected a positive number`);
  }
  return n;
}

function positiveInt(name: string, defaultValue: number): number {
  const value = positiveNumber(name, defaultValue);
  if (!Number.isInteger(value)) {
    throw new Error(`invalid ${name}: expected a positive integer`);
  }
  return value;
}

function port(name: string, defaultValue: number): number {
  const value = positiveInt(name, defaultValue);
  if (value > 65_535) throw new Error(`invalid ${name}: expected a TCP port`);
  return value;
}

function str(name: string, defaultValue = ""): string {
  return process.env[name] ?? defaultValue;
}

function nonEmpty(name: string, defaultValue: string): string {
  const value = str(name, defaultValue).trim();
  if (!value) throw new Error(`invalid ${name}: expected a non-empty value`);
  return value;
}

/** Validate as absolute URL when set; empty stays empty (feature off). */
function baseUrl(name: string, defaultValue = ""): string {
  const value = str(name, defaultValue).trim();
  if (!value) return "";
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`invalid ${name}: expected an absolute URL`);
  }
  return parsed.toString().replace(/\/$/, "");
}

const healthToken = str("HEALTH_TOKEN", "").trim();
const llmApiKey = str("LLM_API_KEY", "").trim();
const llmBaseUrl = baseUrl("LLM_BASE_URL", "https://api.openai.com/v1");
const embeddingBaseUrl = baseUrl("EMBEDDING_BASE_URL").replace(/\/embeddings$/i, "");

export const config = {
  port: port("PORT", 8787),
  host: nonEmpty("HOST", "0.0.0.0"),
  dataDir: resolve(nonEmpty("DATA_DIR", "./data")),
  /** Shortcuts health write token. Empty/placeholder → /api/health disabled (503). */
  healthToken,
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
  sampleIntervalMin: positiveNumber("SAMPLE_INTERVAL_MIN", 5),
  version: "0.1.0",

  llm: {
    baseUrl: llmBaseUrl,
    apiKey: llmApiKey,
    model: nonEmpty("LLM_MODEL", "gpt-4o-mini"),
    timeoutMs: positiveInt("LLM_TIMEOUT_MS", 45_000),
  },

  whisper: {
    baseUrl: baseUrl("WHISPER_BASE_URL"),
    apiKey: str("WHISPER_API_KEY", "").trim(),
    model: nonEmpty("WHISPER_MODEL", "whisper-1"),
    timeoutMs: positiveInt("WHISPER_TIMEOUT_MS", 60_000),
  },

  /**
   * Embedding channel for global search. Explicit only — no LLM_* fallback.
   * Missing base/key/model → semantic channel off; keyword search still works.
   */
  embedding: {
    baseUrl: embeddingBaseUrl,
    apiKey: str("EMBEDDING_API_KEY", "").trim(),
    model: str("EMBEDDING_MODEL", "").trim(),
    timeoutMs: positiveInt("EMBEDDING_TIMEOUT_MS", 30_000),
  },
} as const;

export type Config = typeof config;

/**
 * Thrown when an optional provider feature is invoked without configuration.
 * Routes map this to an explicit 503 — never a fake success.
 */
export class NotConfiguredError extends Error {
  constructor(feature: string, hint: string) {
    super(`${feature} is not configured (${hint})`);
    this.name = "NotConfiguredError";
  }
}

/** Reject empty / known-placeholder health tokens. */
export function isHealthTokenConfigured(token = config.healthToken): boolean {
  const t = token.trim();
  if (!t) return false;
  return t !== "change-me-health-token" && t !== "changeme";
}

export function isLlmConfigured(apiKey = config.llm.apiKey): boolean {
  return Boolean(apiKey.trim());
}

export function isWhisperConfigured(
  whisper: { baseUrl: string; apiKey: string } = config.whisper,
): boolean {
  return Boolean(whisper.baseUrl.trim() && whisper.apiKey.trim());
}

/** Semantic channel needs explicit base + key + model (no LLM_* fallback). */
export function isEmbeddingConfigured(
  emb: { baseUrl: string; apiKey: string; model: string } = config.embedding,
): boolean {
  return Boolean(emb.baseUrl.trim() && emb.apiKey.trim() && emb.model.trim());
}
