import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  chromeTimeToIso,
  collectChromeHistory,
  isoToChromeTime,
  localDayChromeRange,
  resolveHistoryPaths,
} from "./collect-chrome-history.js";
import { uuidFromSeed } from "./source.js";
import { resetSeenVisits, visitsToNodes } from "./sources/chrome-history.js";

describe("chrome time conversion", () => {
  it("chromeTimeToIso known epoch pairs", () => {
    // Unix epoch 0 → Chrome WebKit µs = 11644473600000 * 1000
    // Use bigint: µs values exceed Number.MAX_SAFE_INTEGER for modern dates.
    assert.equal(chromeTimeToIso(11_644_473_600_000_000n), "1970-01-01T00:00:00.000Z");

    // 2020-01-01T00:00:00.000Z
    const ms2020 = Date.UTC(2020, 0, 1);
    const chrome2020 = BigInt(ms2020 + 11_644_473_600_000) * 1000n;
    assert.equal(chromeTimeToIso(chrome2020), "2020-01-01T00:00:00.000Z");

    // 2026-07-24T12:00:00.000Z
    const ms = Date.parse("2026-07-24T12:00:00.000Z");
    const chrome = BigInt(ms + 11_644_473_600_000) * 1000n;
    assert.equal(chromeTimeToIso(chrome), "2026-07-24T12:00:00.000Z");
  });

  it("isoToChromeTime round-trips with chromeTimeToIso", () => {
    const iso = "2026-07-24T08:30:00.000Z";
    const chrome = isoToChromeTime(iso);
    assert.equal(typeof chrome, "bigint");
    assert.equal(chromeTimeToIso(chrome), iso);

    const d = new Date("2026-01-15T00:00:00.000Z");
    assert.equal(chromeTimeToIso(isoToChromeTime(d)), d.toISOString());
  });

  it("localDayChromeRange is local midnight → next midnight exclusive", () => {
    // Construct a local noon so day boundaries are unambiguous.
    const noon = new Date(2026, 6, 24, 12, 0, 0, 0); // July 24 local
    const { start, end } = localDayChromeRange(noon);

    const startLocal = new Date(2026, 6, 24, 0, 0, 0, 0);
    const endLocal = new Date(2026, 6, 25, 0, 0, 0, 0);
    assert.equal(start, isoToChromeTime(startLocal));
    assert.equal(end, isoToChromeTime(endLocal));
    assert.ok(end > start);

    // Round-trip through ISO: start is local midnight as UTC ISO
    assert.equal(chromeTimeToIso(start), startLocal.toISOString());
    assert.equal(chromeTimeToIso(end), endLocal.toISOString());
  });
});

describe("visitsToNodes", () => {
  beforeEach(() => {
    resetSeenVisits();
  });

  it("maps visits to browse_history with deterministic uuid", () => {
    const visitedAt = "2026-07-24T02:00:00.000Z";
    const nodes = visitsToNodes([
      {
        visitId: 42,
        url: "https://example.com/a",
        title: "Example A",
        visitedAt,
        browser: "chrome",
        profile: "Default",
      },
    ]);
    assert.equal(nodes.length, 1);
    const n = nodes[0]!;
    assert.equal(n.kind, "browse_history");
    assert.equal(n.title, "Example A");
    assert.equal(n.content, "https://example.com/a");
    assert.equal(n.client_uuid, uuidFromSeed("browse:chrome:Default:42"));
    assert.equal(n.client_created_at, visitedAt);
    assert.deepEqual(n.source_meta, {
      url: "https://example.com/a",
      title: "Example A",
      visited_at: visitedAt,
      visit_id: 42,
      browser: "chrome",
      profile: "Default",
    });
  });

  it("falls back title to url and truncates to 500", () => {
    const long = "x".repeat(600);
    const n1 = visitsToNodes([
      {
        visitId: 1,
        url: "https://example.com/long",
        title: "",
        visitedAt: "2026-07-24T02:00:00.000Z",
        browser: "edge",
        profile: "Default",
      },
    ])[0]!;
    assert.equal(n1.title, "https://example.com/long");

    resetSeenVisits();
    const n2 = visitsToNodes([
      {
        visitId: 2,
        url: "https://example.com/t",
        title: long,
        visitedAt: "2026-07-24T02:00:00.000Z",
        browser: "edge",
        profile: "Default",
      },
    ])[0]!;
    assert.equal(n2.title!.length, 500);
  });

  it("dates visits by local day of visitedAt (cross-midnight)", () => {
    const d1 = new Date();
    d1.setHours(12, 0, 0, 0);
    const d2 = new Date(d1);
    d2.setDate(d2.getDate() + 1);

    const ymd = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${y}-${m}-${day}`;
    };

    const nodes = visitsToNodes([
      {
        visitId: 10,
        url: "https://a.test",
        title: "a",
        visitedAt: d1.toISOString(),
        browser: "chrome",
        profile: "Default",
      },
      {
        visitId: 11,
        url: "https://b.test",
        title: "b",
        visitedAt: d2.toISOString(),
        browser: "chrome",
        profile: "Default",
      },
    ]);
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0]!.date, ymd(d1));
    assert.equal(nodes[1]!.date, ymd(d2));
    assert.notEqual(nodes[0]!.date, nodes[1]!.date);
  });

  it("dedupes by seed key; reset re-emits", () => {
    const visits = [
      {
        visitId: 7,
        url: "https://once.test",
        title: "once",
        visitedAt: "2026-07-24T02:00:00.000Z",
        browser: "brave",
        profile: "Profile 1",
      },
    ];
    const first = visitsToNodes(visits);
    assert.equal(first.length, 1);
    assert.equal(visitsToNodes(visits).length, 0);
    resetSeenVisits();
    const third = visitsToNodes(visits);
    assert.equal(third.length, 1);
    assert.equal(third[0]!.client_uuid, first[0]!.client_uuid);
  });
});

describe("collectChromeHistory against temp sqlite", () => {
  let root: string;
  let historyPath: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "return-chrome-hist-test-"));
    // Put History under a Default profile dir so profileFromPath works
    const profileDir = join(root, "Default");
    mkdirSync(profileDir, { recursive: true });
    historyPath = join(profileDir, "History");

    const db = new DatabaseSync(historyPath);
    db.exec(`
      CREATE TABLE urls(id INTEGER PRIMARY KEY, url TEXT, title TEXT);
      CREATE TABLE visits(id INTEGER PRIMARY KEY, url INTEGER, visit_time INTEGER);
    `);

    const { start } = localDayChromeRange();
    // Three visits today, one "yesterday"
    const insertUrl = db.prepare(`INSERT INTO urls(id, url, title) VALUES (?, ?, ?)`);
    const insertVisit = db.prepare(
      `INSERT INTO visits(id, url, visit_time) VALUES (?, ?, ?)`,
    );
    insertUrl.run(1, "https://today-a.test", "Today A");
    insertUrl.run(2, "https://today-b.test", "Today B");
    insertUrl.run(3, "https://yesterday.test", "Yesterday");

    // Offsets as bigint — Chrome µs exceed Number.MAX_SAFE_INTEGER.
    insertVisit.run(100, 1, start + 3_600_000_000n); // +1h in µs
    insertVisit.run(101, 2, start + 7_200_000_000n); // +2h
    insertVisit.run(99, 3, start - 3_600_000_000n); // yesterday
    db.close();
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it("copy-then-read returns only today's visits", async () => {
    const visits = await collectChromeHistory(
      [{ path: historyPath, browser: "chrome", profile: "Default" }],
      100,
    );
    assert.equal(visits.length, 2);
    const urls = visits.map((v) => v.url).sort();
    assert.deepEqual(urls, ["https://today-a.test", "https://today-b.test"]);
    // Newest first
    assert.equal(visits[0]!.url, "https://today-b.test");
    assert.equal(visits[0]!.visitId, 101);
    assert.equal(visits[0]!.browser, "chrome");
    assert.equal(visits[0]!.profile, "Default");
    assert.match(visits[0]!.visitedAt, /Z$/);
  });

  it("respects total limit across results", async () => {
    const visits = await collectChromeHistory(
      [{ path: historyPath, browser: "chrome", profile: "Default" }],
      1,
    );
    assert.equal(visits.length, 1);
    assert.equal(visits[0]!.url, "https://today-b.test");
  });

  it("missing path returns empty (silent)", async () => {
    const visits = await collectChromeHistory(
      [
        {
          path: join(root, "nope", "History"),
          browser: "chrome",
          profile: "Default",
        },
      ],
      100,
    );
    assert.deepEqual(visits, []);
  });
});

describe("resolveHistoryPaths", () => {
  it("override missing path yields empty", () => {
    assert.deepEqual(
      resolveHistoryPaths(process.platform, join(tmpdir(), "no-such-history-db")),
      [],
    );
  });

  it("override existing path returns single chrome entry", () => {
    const root = mkdtempSync(join(tmpdir(), "return-chrome-override-"));
    try {
      const profileDir = join(root, "Default");
      mkdirSync(profileDir, { recursive: true });
      const hist = join(profileDir, "History");
      // empty file is enough for existsSync
      const db = new DatabaseSync(hist);
      db.close();
      const paths = resolveHistoryPaths(process.platform, hist);
      assert.equal(paths.length, 1);
      assert.equal(paths[0]!.path, hist);
      assert.equal(paths[0]!.browser, "chrome");
      assert.equal(paths[0]!.profile, "Default");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
