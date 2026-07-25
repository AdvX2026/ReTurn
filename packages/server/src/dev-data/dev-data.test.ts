import assert from "node:assert/strict";
import test from "node:test";
import { openMemoryDb } from "../db/schema.js";
import { parseArgs } from "./cli.js";
import { clearData, generateMockData, inspectData } from "./index.js";

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

test("generates realistic linked mock data", () => {
  const db = openMemoryDb();
  try {
    const result = generateMockData(db, {
      days: 7,
      endDate: "2026-07-25",
      rng: seededRandom(42),
    });
    const inspected = inspectData(db, { limit: 200 });
    const kinds = new Set(
      (
        db.prepare(`SELECT DISTINCT kind FROM nodes`).all() as Array<{ kind: string }>
      ).map((row) => row.kind),
    );
    const foreignKeyErrors = db.prepare(`PRAGMA foreign_key_check`).all();

    assert.equal(result.days, 7);
    assert.equal(inspected.counts.days, 7);
    assert.equal(inspected.counts.devices, 2);
    assert.ok(result.nodes > 200);
    assert.ok(result.savedDays >= 1);
    assert.ok(inspected.counts.cards >= result.savedDays);
    assert.deepEqual(foreignKeyErrors, []);
    for (const kind of ["health_daily", "app_sample", "reminder", "text", "email"]) {
      assert.ok(kinds.has(kind), `expected ${kind} mock nodes`);
    }
  } finally {
    db.close();
  }
});

test("clear removes business and derived data while preserving the schema", () => {
  const db = openMemoryDb();
  try {
    generateMockData(db, {
      days: 3,
      endDate: "2026-07-25",
      rng: seededRandom(7),
    });
    const deleted = clearData(db);
    const after = inspectData(db);

    assert.ok(deleted.nodes > 0);
    assert.ok(deleted.search_fts > 0);
    assert.ok(Object.values(after.counts).every((count) => count === 0));
    assert.deepEqual(db.prepare(`PRAGMA foreign_key_check`).all(), []);
  } finally {
    db.close();
  }
});

test("mock generation refuses to mix with existing data", () => {
  const db = openMemoryDb();
  try {
    generateMockData(db, {
      days: 1,
      endDate: "2026-07-25",
      rng: seededRandom(1),
    });
    assert.throws(
      () =>
        generateMockData(db, {
          days: 1,
          endDate: "2026-07-25",
          rng: seededRandom(2),
        }),
      /database is not empty/,
    );
  } finally {
    db.close();
  }
});

test("CLI defaults to a guarded clear and accepts filters", () => {
  const clear = parseArgs(["clear", "--db", "/tmp/return-test.db"]);
  const inspect = parseArgs([
    "inspect",
    "--date",
    "2026-07-25",
    "--kind",
    "idea",
    "--limit",
    "12",
    "--json",
  ]);

  assert.equal(clear.confirm, false);
  assert.equal(clear.dbPath, "/tmp/return-test.db");
  assert.equal(inspect.date, "2026-07-25");
  assert.equal(inspect.kind, "idea");
  assert.equal(inspect.limit, 12);
  assert.equal(inspect.json, true);
  assert.throws(() => parseArgs(["inspect", "--unknown", "value"]), /unknown option/);
});
