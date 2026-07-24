import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  collectSafariHistory,
  isoToSafariTime,
  safariTimeToIso,
} from "./collect-safari-history.js";
import { resetSeenSafariVisits, safariVisitsToNodes } from "./sources/safari-history.js";

describe("Safari history", () => {
  let root: string;
  let path: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "return-safari-test-"));
    mkdirSync(root, { recursive: true });
    path = join(root, "History.db");
    const db = new DatabaseSync(path);
    db.exec(`
      CREATE TABLE history_items(id INTEGER PRIMARY KEY, url TEXT);
      CREATE TABLE history_visits(
        id INTEGER PRIMARY KEY,
        history_item INTEGER,
        visit_time REAL,
        title TEXT
      );
    `);
    db.prepare("INSERT INTO history_items(id, url) VALUES (?, ?)").run(
      1,
      "https://example.com",
    );
    db.prepare(
      "INSERT INTO history_visits(id, history_item, visit_time, title) VALUES (?, ?, ?, ?)",
    ).run(7, 1, isoToSafariTime("2026-07-24T02:00:00.000Z"), "Example");
    db.close();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
    resetSeenSafariVisits();
  });

  it("round-trips Safari epoch seconds", () => {
    const iso = "2026-07-24T02:00:00.000Z";
    assert.equal(safariTimeToIso(isoToSafariTime(iso)), iso);
  });

  it("filters by the shared range and maps a stable node", async () => {
    const visits = await collectSafariHistory(path, 100, {
      start: "2026-07-23T16:00:00.000Z",
      end: "2026-07-24T16:00:00.000Z",
    });
    assert.equal(visits.length, 1);
    const nodes = safariVisitsToNodes(visits, "2026-07-24");
    assert.equal(nodes.length, 1);
    assert.equal(nodes[0]!.kind, "browse_history");
    assert.equal(nodes[0]!.date, "2026-07-24");
    assert.equal((nodes[0]!.source_meta as Record<string, unknown>).browser, "safari");
  });
});
