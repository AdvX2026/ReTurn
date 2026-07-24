import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import Fastify from "fastify";
import { config } from "./config.js";
import type { Db } from "./db/schema.js";
import { registerRoutes } from "./routes.js";

/** Build Fastify app without listening — used by smoke tests via inject(). */
export async function createApp(db: Db) {
  const app = Fastify({
    logger: false,
    bodyLimit: 25 * 1024 * 1024,
  });

  const origins = config.corsOrigins;
  await app.register(cors, {
    // Empty allowlist = reflect origin (dev/hackathon). Set CORS_ORIGINS in shared Wi-Fi.
    origin: origins.length === 0 ? true : origins,
  });
  await app.register(multipart, {
    limits: { fileSize: 20 * 1024 * 1024 },
  });

  // Optional API token for all mutating + private GETs except /api/ping and /api/health.
  // Empty API_TOKEN = open LAN mode (PRD demo). Set when on untrusted network.
  if (config.apiToken) {
    app.addHook("onRequest", async (req, reply) => {
      const path = req.url.split("?")[0] ?? "";
      if (path === "/api/ping" || path === "/api/health") return;
      if (!path.startsWith("/api/")) return;

      const token =
        (req.headers["x-return-token"] as string | undefined) ??
        (req.headers.authorization as string | undefined)?.replace(/^Bearer\s+/i, "");
      if (!token || token !== config.apiToken) {
        return reply.code(401).send({
          statusCode: 401,
          error: "Unauthorized",
          message: "invalid or missing API token",
        });
      }
    });
  }

  await registerRoutes(app, db);
  return app;
}
