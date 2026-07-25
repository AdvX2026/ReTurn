import { mkdirSync } from "node:fs";
import { createApp } from "./app.js";
import { config, isEmbeddingConfigured, isHealthTokenConfigured } from "./config.js";
import { openDb } from "./db/schema.js";
import { drainEmbedQueue, requeueStaleEmbeddings } from "./search/embed.js";
import { ensureSearchIndex } from "./search/index.js";

const EMBED_DRAIN_MS = 30_000;

async function main() {
  mkdirSync(config.dataDir, { recursive: true });
  const db = openDb(config.dataDir);
  ensureSearchIndex(db);

  if (isEmbeddingConfigured()) {
    const n = requeueStaleEmbeddings(db);
    if (n > 0) console.log(`[embed] re-queued ${n} stale/missing embeddings`);
  } else {
    console.warn(
      "[server] embedding not configured — semantic search channel off (keyword still on)",
    );
  }

  const app = await createApp(db);

  if (!isHealthTokenConfigured()) {
    console.warn(
      "[server] HEALTH_TOKEN unset or weak — POST /api/health disabled until set",
    );
  }

  let embedTimer: ReturnType<typeof setInterval> | null = null;
  if (isEmbeddingConfigured()) {
    const tick = () => {
      drainEmbedQueue(db).catch((err) => {
        console.warn("[embed] drain error:", err instanceof Error ? err.message : err);
      });
    };
    tick();
    embedTimer = setInterval(tick, EMBED_DRAIN_MS);
    // Allow process to exit even if timer is live (tests / short runs).
    embedTimer.unref?.();
  }

  const stop = async () => {
    if (embedTimer) clearInterval(embedTimer);
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await app.listen({ port: config.port, host: config.host });
  console.log(`ReTurn server v${config.version} on http://${config.host}:${config.port}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
