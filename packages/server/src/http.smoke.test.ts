import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
/**
 * HTTP smoke via Fastify inject() — no real port, runs in CI.
 * Covers the Day Loop spine: register → nodes → health → stats → save → continue.
 */
import { after, before, describe, it } from "node:test";
import type { FastifyInstance } from "fastify";
import { createApp } from "./app.js";
import { type Db, openDb } from "./db/schema.js";

describe("http smoke", () => {
  let app: FastifyInstance;
  let db: Db;
  let dir: string;
  let deviceId: string;
  const date = "2026-07-24";

  before(async () => {
    dir = mkdtempSync(join(tmpdir(), "return-smoke-"));
    db = openDb(dir, "smoke.db");
    app = await createApp(db);
    process.env.HEALTH_TOKEN = "test-token";
    // config already loaded at import — health route reads config.healthToken.
    // For smoke we use whatever is in env at process start; set before routes
    // is too late if config is a frozen snapshot. Override via header matching
    // .env default when unset: change-me-health-token OR re-read.
  });

  after(async () => {
    await app.close();
    db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("GET /api/ping", async () => {
    const res = await app.inject({ method: "GET", url: "/api/ping" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { ok: boolean; version: string };
    assert.equal(body.ok, true);
    assert.ok(body.version);
  });

  it("POST /api/devices/register", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/devices/register",
      payload: { name: "ci-mac", platform: "macos" },
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { device_id: string };
    assert.ok(body.device_id);
    deviceId = body.device_id;
  });

  it("POST /api/nodes batch + idempotent replay", async () => {
    const uuid = crypto.randomUUID();
    const payload = {
      device_id: deviceId,
      nodes: [
        {
          client_uuid: uuid,
          kind: "text",
          title: "smoke",
          content: "hello from ci",
          date,
        },
        {
          client_uuid: crypto.randomUUID(),
          kind: "app_sample",
          title: "Cursor",
          source_meta: { app: "Cursor" },
          date,
        },
      ],
    };
    const res = await app.inject({
      method: "POST",
      url: "/api/nodes",
      payload,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { created: unknown[]; duplicates: string[] };
    assert.equal(body.created.length, 2);
    assert.equal(body.duplicates.length, 0);

    const replay = await app.inject({
      method: "POST",
      url: "/api/nodes",
      payload,
    });
    const body2 = replay.json() as { created: unknown[]; duplicates: string[] };
    assert.equal(body2.created.length, 0);
    assert.equal(body2.duplicates.length, 2);
  });

  it("GET /api/nodes?date=", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/nodes?date=${date}`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as { nodes: unknown[] };
    assert.ok(body.nodes.length >= 2);
  });

  it("POST /api/health with token", async () => {
    // test-setup.ts sets HEALTH_TOKEN before config import
    const { config } = await import("./config.js");
    assert.ok(config.healthToken, "test-setup must set HEALTH_TOKEN");
    const res = await app.inject({
      method: "POST",
      url: "/api/health",
      headers: { "x-return-token": config.healthToken },
      payload: {
        date,
        sleep_minutes: 300,
        steps: 4000,
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as { node: { kind: string } };
    assert.equal(body.node.kind, "health_daily");
  });

  it("GET /api/stats/today", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/stats/today?date=${date}`,
    });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      stats: { energy: number };
      character_state: string;
    };
    assert.ok(typeof body.stats.energy === "number");
    assert.ok(body.character_state);
  });

  it("POST /api/save then idempotent", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/save",
      payload: {
        date,
        device_id: deviceId,
        note_text: "ci save note",
      },
    });
    assert.equal(res.statusCode, 200, res.body);
    const body = res.json() as {
      already_saved: boolean;
      degraded: boolean;
      summary: string | null;
      streak: number;
    };
    assert.equal(body.already_saved, false);
    assert.equal(body.degraded, true); // no LLM key in CI
    assert.ok(body.summary);
    assert.ok(body.streak >= 1);

    const again = await app.inject({
      method: "POST",
      url: "/api/save",
      payload: { date, note_text: "ignored" },
    });
    const body2 = again.json() as { already_saved: boolean };
    assert.equal(body2.already_saved, true);
  });

  it("GET /api/continue has before after save", async () => {
    // continue uses server "today" — may not be 2026-07-24; still must 200
    const res = await app.inject({ method: "GET", url: "/api/continue" });
    assert.equal(res.statusCode, 200);
    const body = res.json() as {
      future: { todos: unknown[] };
      stats: unknown;
      character_state: string;
    };
    assert.ok(body.stats);
    assert.ok(body.character_state);
    assert.ok(Array.isArray(body.future.todos));
  });

  it("GET /api/timeline + /api/days", async () => {
    const tl = await app.inject({
      method: "GET",
      url: `/api/timeline?date=${date}`,
    });
    assert.equal(tl.statusCode, 200);
    const days = await app.inject({ method: "GET", url: "/api/days?range=7" });
    assert.equal(days.statusCode, 200);
    const body = days.json() as { days: unknown[]; streak: number };
    assert.equal(body.days.length, 7);
  });
});
