import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { config } from "./config.js";
import { openDb } from "./db/schema.js";
import { registerRoutes } from "./routes.js";
import { mkdirSync } from "node:fs";

async function main() {
  mkdirSync(config.dataDir, { recursive: true });
  const db = openDb(config.dataDir);

  const app = Fastify({
    logger: true,
    bodyLimit: 25 * 1024 * 1024,
  });

  await app.register(cors, { origin: true });
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  await registerRoutes(app, db);

  // Graceful shutdown
  const stop = async () => {
    await app.close();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  await app.listen({ port: config.port, host: config.host });
  app.log.info(
    `ReTurn server v${config.version} on http://${config.host}:${config.port}`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
