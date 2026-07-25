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

function required(name: string): string {
  const value = str(name).trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function nonEmpty(name: string, defaultValue: string): string {
  const value = str(name, defaultValue).trim();
  if (!value) throw new Error(`invalid ${name}: expected a non-empty value`);
  return value;
}

function baseUrl(name: string, defaultValue?: string): string {
  const value = (
    defaultValue === undefined ? required(name) : str(name, defaultValue)
  ).trim();
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(`invalid ${name}: expected an absolute URL`);
  }
  return parsed.toString().replace(/\/$/, "");
}

const healthToken = required("HEALTH_TOKEN");
if (healthToken === "change-me-health-token" || healthToken === "changeme") {
  throw new Error("HEALTH_TOKEN must not use a placeholder value");
}
const llmApiKey = required("LLM_API_KEY");
const llmBaseUrl = baseUrl("LLM_BASE_URL", "https://api.openai.com/v1");
const embeddingBaseUrl = baseUrl("EMBEDDING_BASE_URL").replace(/\/embeddings$/i, "");

export const config = {
  port: port("PORT", 8787),
  host: nonEmpty("HOST", "0.0.0.0"),
  dataDir: resolve(nonEmpty("DATA_DIR", "./data")),
  /** Shortcuts health write token. Required at startup. */
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
    apiKey: required("WHISPER_API_KEY"),
    model: nonEmpty("WHISPER_MODEL", "whisper-1"),
    timeoutMs: positiveInt("WHISPER_TIMEOUT_MS", 60_000),
  },

  /** Embedding channel for global search. All values are required at startup. */
  embedding: {
    baseUrl: embeddingBaseUrl,
    apiKey: required("EMBEDDING_API_KEY"),
    model: required("EMBEDDING_MODEL"),
    timeoutMs: positiveInt("EMBEDDING_TIMEOUT_MS", 30_000),
  },
} as const;

export type Config = typeof config;
