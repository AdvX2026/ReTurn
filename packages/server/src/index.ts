import { mkdirSync } from "node:fs";
import { createApp } from "./app.js";
import { config, isHealthTokenConfigured } from "./config.js";
import { openDb } from "./db/schema.js";

async function main() {
  mkdirSync(config.dataDir, { recursive: true });
  const db = openDb(config.dataDir);
  const app = await createApp(db);

  if (!isHealthTokenConfigured()) {
    console.warn(
      "[server] HEALTH_TOKEN unset or weak — POST /api/health disabled until set",
    );
  }

  const stop = async () => {
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
