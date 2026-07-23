import type { NodeInput } from "@return/shared";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import { config } from "./config.js";
import type { Outbox } from "./outbox.js";

export interface PiStatus {
  online: boolean;
  deviceId: string | null;
  lastError?: string;
}

let cachedDeviceId: string | null = null;

function loadDeviceId(): string | null {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    if (existsSync(config.deviceIdPath)) {
      cachedDeviceId = readFileSync(config.deviceIdPath, "utf8").trim() || null;
    }
  } catch {
    /* */
  }
  return cachedDeviceId;
}

function saveDeviceId(id: string): void {
  mkdirSync(dirname(config.deviceIdPath), { recursive: true });
  writeFileSync(config.deviceIdPath, id, "utf8");
  cachedDeviceId = id;
}

async function fetchJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(`${config.serverUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Pi HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function pingPi(): Promise<boolean> {
  try {
    await fetchJson<{ ok: boolean }>("/api/ping");
    return true;
  } catch {
    return false;
  }
}

export async function ensureDevice(): Promise<string> {
  const existing = loadDeviceId();
  const res = await fetchJson<{ device_id: string }>("/api/devices/register", {
    method: "POST",
    body: JSON.stringify({
      name: config.deviceName,
      platform: process.platform === "darwin" ? "macos" : "unknown",
      device_id: existing ?? undefined,
    }),
  });
  saveDeviceId(res.device_id);
  return res.device_id;
}

export async function postNodes(
  deviceId: string,
  nodes: NodeInput[],
): Promise<void> {
  await fetchJson("/api/nodes", {
    method: "POST",
    body: JSON.stringify({ device_id: deviceId, nodes }),
  });
}

/** FIFO flush. Stops on network/5xx to preserve order. */
export async function flushOutbox(outbox: Outbox): Promise<{
  flushed: number;
  remaining: number;
  online: boolean;
  deviceId: string | null;
}> {
  if (outbox.size() === 0) {
    const online = await pingPi();
    return {
      flushed: 0,
      remaining: 0,
      online,
      deviceId: loadDeviceId(),
    };
  }

  let deviceId: string;
  try {
    deviceId = await ensureDevice();
  } catch (err) {
    return {
      flushed: 0,
      remaining: outbox.size(),
      online: false,
      deviceId: loadDeviceId(),
    };
  }

  let flushed = 0;
  for (const row of outbox.peekAll()) {
    let nodes: NodeInput[];
    try {
      nodes = JSON.parse(row.payload_json) as NodeInput[];
    } catch {
      outbox.remove(row.id);
      continue;
    }
    try {
      await postNodes(deviceId, nodes);
      outbox.remove(row.id);
      flushed++;
    } catch (err) {
      outbox.fail(row.id, err instanceof Error ? err.message : String(err));
      break;
    }
  }

  return {
    flushed,
    remaining: outbox.size(),
    online: true,
    deviceId,
  };
}

export function getCachedDeviceId(): string | null {
  return loadDeviceId();
}
