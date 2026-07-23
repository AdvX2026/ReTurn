/**
 * Localhost-only control plane for UI (PRD F2 / F4).
 * GET  /health
 * GET  /status
 * POST /sample-now
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { config } from "./config.js";
import type { Outbox } from "./outbox.js";
import type { SampleSnapshot } from "./collect.js";
import { getCachedDeviceId } from "./pi.js";

export interface SamplerRuntime {
  outbox: Outbox;
  getLastSnapshot: () => SampleSnapshot | null;
  getLastSampleAt: () => string | null;
  getLastError: () => string | null;
  isPiOnline: () => boolean;
  /** Force one sample cycle; returns snapshot + enqueue count. */
  sampleNow: (opts?: { asSnapshot?: boolean }) => Promise<{
    snapshot: SampleSnapshot;
    enqueued: number;
  }>;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
    // UI may run on vite :1420
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  });
  res.end(json);
}

export function startLocalServer(rt: SamplerRuntime): Promise<void> {
  const server = createServer(async (req, res) => {
    try {
      if (req.method === "OPTIONS") {
        res.writeHead(204, {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        });
        res.end();
        return;
      }

      const url = new URL(req.url ?? "/", `http://${config.localHost}:${config.localPort}`);

      if (req.method === "GET" && url.pathname === "/health") {
        send(res, 200, {
          ok: true,
          last_sample_at: rt.getLastSampleAt(),
          outbox_size: rt.outbox.size(),
          pi_online: rt.isPiOnline(),
          device_id: getCachedDeviceId(),
          server_url: config.serverUrl,
          interval_min: config.sampleIntervalMin,
          error: rt.getLastError(),
        });
        return;
      }

      if (req.method === "GET" && url.pathname === "/status") {
        const snap = rt.getLastSnapshot();
        send(res, 200, {
          last_sample_at: rt.getLastSampleAt(),
          outbox_size: rt.outbox.size(),
          pi_online: rt.isPiOnline(),
          app: snap?.app ?? null,
          tab_count: snap?.tabs.length ?? 0,
          agent_count: snap?.agents.length ?? 0,
          error: rt.getLastError(),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/sample-now") {
        let asSnapshot = false;
        try {
          const raw = await readBody(req);
          if (raw) {
            const body = JSON.parse(raw) as { as_snapshot?: boolean };
            asSnapshot = Boolean(body.as_snapshot);
          }
        } catch {
          /* empty body ok */
        }
        const result = await rt.sampleNow({ asSnapshot });
        send(res, 200, {
          snapshot: result.snapshot,
          enqueued: result.enqueued,
          outbox_size: rt.outbox.size(),
        });
        return;
      }

      send(res, 404, { error: "not found" });
    } catch (err) {
      send(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // Bind 127.0.0.1 only — never LAN (PRD).
    server.listen(config.localPort, config.localHost, () => {
      console.log(
        `[sampler] localhost control http://${config.localHost}:${config.localPort}`,
      );
      resolve();
    });
  });
}
