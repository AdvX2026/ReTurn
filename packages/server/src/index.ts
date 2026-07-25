import { mkdirSync } from "node:fs";
import { createApp } from "./app.js";
import { config } from "./config.js";
import { openDb } from "./db/schema.js";
import { drainEmbedQueue, requeueStaleEmbeddings } from "./search/embed.js";
import { ensureSearchIndex } from "./search/index.js";

const EMBED_DRAIN_MS = 30_000;

async function main() {
  mkdirSync(config.dataDir, { recursive: true });
  const db = openDb(config.dataDir);
  ensureSearchIndex(db);

  const n = requeueStaleEmbeddings(db);
  if (n > 0) console.log(`[embed] re-queued ${n} stale/missing embeddings`);

  const app = await createApp(db);

  let embedTimer: ReturnType<typeof setInterval> | null = null;
  const tick = () => {
    drainEmbedQueue(db).catch((err) => {
      console.error("[embed] drain error:", err);
      process.exit(1);
    });
  };
  tick();
  embedTimer = setInterval(tick, EMBED_DRAIN_MS);
  embedTimer.unref?.();

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
