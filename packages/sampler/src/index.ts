/**
 * Independent sampler process (PRD F2).
 * - setInterval sample → main outbox SQLite → flush to Pi
 * - cadence from /api/nodes response reschedules the sample interval
 * - localhost control plane for UI (sample-now / health)
 * - UI closed does not stop this process
 */
import type { CadenceMode } from "@return/shared";
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
let cadence: CadenceMode = "active";
let sampleTimer: ReturnType<typeof setInterval> | null = null;

function currentIntervalMin(): number {
  const min =
    cadence === "night" ? config.sampleIntervalNightMin : config.sampleIntervalMin;
  // Floor at 1 minute so a misconfigured env value cannot hammer sources.
  return Math.max(1, min);
}

function applyCadence(next: CadenceMode | null | undefined): void {
  if (next !== "active" && next !== "night") return;
  if (next === cadence) return;
  const prev = cadence;
  cadence = next;
  const min = currentIntervalMin();
  console.log(`[sampler] cadence ${prev} → ${next} (interval ${min}min)`);
  rescheduleSampleTimer();
}

function rescheduleSampleTimer(): void {
  if (sampleTimer) clearInterval(sampleTimer);
  sampleTimer = setInterval(() => void tick(), currentIntervalMin() * 60_000);
}

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
  lastError = flush.error;
  applyCadence(flush.cadence);

  const agentStats = snapshot.stats.agents ?? {};
  const envStats = snapshot.stats.env ?? {};
  const gitStats = snapshot.stats.git ?? {};
  const gmailStats = snapshot.stats.gmail ?? {};
  console.log(
    `[sampler] sample app=${snapshot.app?.name ?? "-"} tabs=${envStats.tabs ?? snapshot.tabs.length} agents=${agentStats.intervals ?? 0} commits=${gitStats.commits ?? 0} mails=${gmailStats.emails ?? 0} emitted=${enqueued} flushed=${flush.flushed} outbox=${flush.remaining} pi=${flush.online} cadence=${cadence}`,
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
  } finally {
    tickRunning = false;
  }
}

async function main(): Promise<void> {
  console.log(`[sampler] Pi → ${config.serverUrl}`);
  console.log(`[sampler] data → ${config.dataDir}`);
  console.log(
    `[sampler] interval active=${config.sampleIntervalMin}min night=${config.sampleIntervalNightMin}min`,
  );

  const boot = await pingPi();
  piOnline = boot.online;
  lastError = boot.error;
  applyCadence(boot.cadence);
  console.log(`[sampler] pi online=${piOnline} cadence=${cadence}`);

  await startLocalServer({
    outbox,
    getLastSnapshot: () => lastSnapshot,
    getLastSampleAt: () => lastSampleAt,
    getLastError: () => lastError,
    isPiOnline: () => piOnline,
    getCadence: () => cadence,
    getIntervalMin: () => currentIntervalMin(),
    sampleNow: sampleOnce,
  });

  // Initial sample + rhythm
  void tick();
  rescheduleSampleTimer();

  // Opportunistic flush every minute when queue non-empty
  setInterval(() => {
    if (outbox.size() === 0) return;
    flushOutbox(outbox)
      .then((r) => {
        piOnline = r.online;
        lastError = r.error;
        applyCadence(r.cadence);
      })
      .catch((err) => {
        // Never let a background flush reject unhandled — that kills the process.
        lastError = err instanceof Error ? err.message : String(err);
        console.error("[sampler] flush failed:", lastError);
      });
  }, 60_000);

  const stop = () => {
    console.log("[sampler] shutting down");
    if (sampleTimer) clearInterval(sampleTimer);
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
