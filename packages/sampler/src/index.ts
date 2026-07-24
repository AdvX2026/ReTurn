/**
 * Independent sampler process (PRD F2).
 * - setInterval sample → main outbox SQLite → flush to Pi
 * - localhost control plane for UI (sample-now / health)
 * - UI closed does not stop this process
 */
import { type SampleSnapshot, collectSample } from "./collect.js";
import { config } from "./config.js";
import { startLocalServer } from "./local-server.js";
import { Outbox } from "./outbox.js";
import { flushOutbox, pingPi } from "./pi.js";

const outbox = new Outbox();
let lastSnapshot: SampleSnapshot | null = null;
let lastSampleAt: string | null = null;
let lastError: string | null = null;
let piOnline = false;
let tickRunning = false;

async function sampleOnce(opts?: { asSnapshot?: boolean }): Promise<{
  snapshot: SampleSnapshot;
  enqueued: number;
}> {
  const { snapshot, nodes } = await collectSample({
    asSnapshot: opts?.asSnapshot,
  });
  lastSnapshot = snapshot;
  lastSampleAt = snapshot.at;
  lastError = null;

  let enqueued = 0;
  if (nodes.length > 0) {
    outbox.enqueue(nodes);
    enqueued = nodes.length;
  }

  const flush = await flushOutbox(outbox);
  piOnline = flush.online;

  const agentStats = snapshot.stats.agents ?? {};
  const envStats = snapshot.stats.env ?? {};
  console.log(
    `[sampler] sample app=${snapshot.app?.name ?? "-"} tabs=${envStats.tabs ?? snapshot.tabs.length} agents=${agentStats.intervals ?? 0} emitted=${enqueued} flushed=${flush.flushed} outbox=${flush.remaining} pi=${flush.online}`,
  );

  return { snapshot, enqueued };
}

async function tick(): Promise<void> {
  if (tickRunning) return;
  tickRunning = true;
  try {
    await sampleOnce();
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err);
    console.error("[sampler] tick failed:", lastError);
    // still try flush leftover
    try {
      const flush = await flushOutbox(outbox);
      piOnline = flush.online;
    } catch {
      piOnline = false;
    }
  } finally {
    tickRunning = false;
  }
}

async function main(): Promise<void> {
  console.log(`[sampler] Pi → ${config.serverUrl}`);
  console.log(`[sampler] data → ${config.dataDir}`);
  console.log(`[sampler] interval ${config.sampleIntervalMin}min`);

  piOnline = await pingPi();
  console.log(`[sampler] pi online=${piOnline}`);

  await startLocalServer({
    outbox,
    getLastSnapshot: () => lastSnapshot,
    getLastSampleAt: () => lastSampleAt,
    getLastError: () => lastError,
    isPiOnline: () => piOnline,
    sampleNow: sampleOnce,
  });

  // Initial sample + interval
  void tick();
  const ms = config.sampleIntervalMin * 60_000;
  setInterval(() => void tick(), ms);

  // Opportunistic flush every minute when queue non-empty
  setInterval(() => {
    if (outbox.size() === 0) return;
    void flushOutbox(outbox).then((r) => {
      piOnline = r.online;
    });
  }, 60_000);

  const stop = () => {
    console.log("[sampler] shutting down");
    outbox.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
