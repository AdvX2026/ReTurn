import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { CadenceMode, CreateNodesResponse, NodeInput } from "@return/shared";
import { config } from "./config.js";
import { MAX_NODES_PER_BATCH, type Outbox, chunkNodes } from "./outbox.js";

export interface FlushResult {
  flushed: number;
  remaining: number;
  online: boolean;
  deviceId: string | null;
  /** Latest cadence from Pi via /api/nodes or empty-outbox /api/ping (PRD F2). */
  cadence: CadenceMode | null;
  error: string | null;
}

let cachedDeviceId: string | null = null;

function loadDeviceId(): string | null {
  if (cachedDeviceId) return cachedDeviceId;
  try {
    if (existsSync(config.deviceIdPath)) {
      cachedDeviceId = readFileSync(config.deviceIdPath, "utf8").trim() || null;
    }
  } catch {
    // Unreadable device-id file must not fail a flush; re-register instead.
    return null;
  }
  return cachedDeviceId;
}

function saveDeviceId(id: string): void {
  mkdirSync(dirname(config.deviceIdPath), { recursive: true });
  writeFileSync(config.deviceIdPath, id, "utf8");
  cachedDeviceId = id;
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${config.serverUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Pi HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function pingPi(): Promise<{
  online: boolean;
  cadence: CadenceMode | null;
  error: string | null;
}> {
  try {
    const res = await fetchJson<{
      ok: boolean;
      cadence?: CadenceMode | null;
    }>("/api/ping");
    return {
      online: true,
      cadence: parseCadence(res.cadence),
      error: null,
    };
  } catch (error) {
    return {
      online: false,
      cadence: null,
      error: error instanceof Error ? error.message : String(error),
    };
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
): Promise<CadenceMode> {
  let cadence: CadenceMode | undefined;
  // Defense in depth: even pre-chunk outbox rows (or future callers) stay ≤500.
  for (const batch of chunkNodes(nodes, MAX_NODES_PER_BATCH)) {
    const response = await fetchJson<CreateNodesResponse>("/api/nodes", {
      method: "POST",
      body: JSON.stringify({ device_id: deviceId, nodes: batch }),
    });
    cadence = parseCadence(response.cadence);
  }
  if (!cadence) throw new Error("cannot post an empty node batch");
  return cadence;
}

function parseCadence(value: unknown): CadenceMode {
  if (value !== "active" && value !== "night") {
    throw new Error("Pi response is missing a valid cadence");
  }
  return value;
}

/** FIFO flush. Stops on network/5xx to preserve order. */
export async function flushOutbox(outbox: Outbox): Promise<FlushResult> {
  if (outbox.size() === 0) {
    // Empty outbox still pings for cadence (midnight night→active restore).
    const ping = await pingPi();
    return {
      flushed: 0,
      remaining: 0,
      online: ping.online,
      deviceId: loadDeviceId(),
      cadence: ping.cadence,
      error: ping.error,
    };
  }

  let deviceId: string;
  try {
    deviceId = await ensureDevice();
  } catch (error) {
    return {
      flushed: 0,
      remaining: outbox.size(),
      online: false,
      deviceId: loadDeviceId(),
      cadence: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  let flushed = 0;
  let cadence: CadenceMode | null = null;
  for (const row of outbox.peekAll()) {
    let nodes: NodeInput[];
    try {
      nodes = JSON.parse(row.payload_json) as NodeInput[];
    } catch (error) {
      const message = error instanceof Error ? error.message : "invalid outbox payload";
      outbox.fail(row.id, message);
      return {
        flushed,
        remaining: outbox.size(),
        online: false,
        deviceId,
        cadence,
        error: message,
      };
    }
    try {
      const next = await postNodes(deviceId, nodes);
      if (next) cadence = next;
      outbox.remove(row.id);
      flushed++;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      outbox.fail(row.id, message);
      return {
        flushed,
        remaining: outbox.size(),
        online: false,
        deviceId,
        cadence,
        error: message,
      };
    }
  }

  return {
    flushed,
    remaining: outbox.size(),
    online: true,
    deviceId,
    cadence,
    error: null,
  };
}

export function getCachedDeviceId(): string | null {
  return loadDeviceId();
}
