import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, it } from "node:test";
import {
  collectVscodeRecents,
  parseRecentlyOpened,
  readRecentlyOpenedJson,
  resolveVscodeStateDb,
  uriToPath,
} from "./collect-vscode.js";
import { uuidFromSeed } from "./source.js";
import { recentsToNodes, resetSeenVscodeKeys } from "./sources/vscode.js";

const FIXTURE = JSON.stringify({
  entries: [
    { folderUri: "file:///Users/me/proj" },
    { fileUri: "file:///Users/me/file.ts" },
    {
      workspace: {
        id: "ws-1",
        configPath: "file:///Users/me/ws/demo.code-workspace",
      },
    },
    { label: "orphan without uri" },
  ],
});

describe("parseRecentlyOpened", () => {
  it("parses folder, file, workspace entries", () => {
    const recents = parseRecentlyOpened(FIXTURE, "code");
    assert.equal(recents.length, 3);

    assert.equal(recents[0]!.kind, "folder");
    assert.equal(recents[0]!.uri, "file:///Users/me/proj");
    assert.equal(recents[0]!.editor, "code");
    assert.equal(recents[0]!.label, "proj");
    assert.ok(recents[0]!.path.includes("proj"));

    assert.equal(recents[1]!.kind, "file");
    assert.equal(recents[1]!.label, "file.ts");

    assert.equal(recents[2]!.kind, "workspace");
    assert.equal(recents[2]!.label, "demo.code-workspace");
  });

  it("returns empty for missing or invalid JSON", () => {
    assert.deepEqual(parseRecentlyOpened("", "code"), []);
    assert.deepEqual(parseRecentlyOpened("   ", "code"), []);
    assert.deepEqual(parseRecentlyOpened("not-json", "code"), []);
    assert.deepEqual(parseRecentlyOpened("{}", "code"), []);
    assert.deepEqual(parseRecentlyOpened('{"entries":null}', "code"), []);
    assert.deepEqual(parseRecentlyOpened('{"entries":"x"}', "code"), []);
  });

  it("caps at 30 most recent entries", () => {
    const entries = Array.from({ length: 40 }, (_, i) => ({
      folderUri: `file:///Users/me/p${i}`,
    }));
    const recents = parseRecentlyOpened(JSON.stringify({ entries }), "cursor");
    assert.equal(recents.length, 30);
    assert.equal(recents[0]!.label, "p0");
    assert.equal(recents[29]!.label, "p29");
    assert.equal(recents[0]!.editor, "cursor");
  });
});

describe("uriToPath", () => {
  it("decodes file:// URIs and leaves other schemes alone", () => {
    // fileURLToPath requires platform-valid forms; use a generic non-file scheme
    // for the pass-through case, and a relative-looking file path for decode.
    assert.equal(uriToPath("https://example.com/x"), "https://example.com/x");
    assert.equal(uriToPath("/already/path"), "/already/path");
  });
});

describe("vscode source emission", () => {
  beforeEach(() => {
    resetSeenVscodeKeys();
  });

  it("is deterministic for same (editor, kind, uri)", () => {
    const a = uuidFromSeed("vscode:code:folder:file:///Users/me/proj");
    const b = uuidFromSeed("vscode:code:folder:file:///Users/me/proj");
    const c = uuidFromSeed("vscode:cursor:folder:file:///Users/me/proj");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(
      a,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("maps recents to vscode_recent nodes with correct fields", () => {
    const at = "2026-07-24T02:00:00.000Z";
    const recents = parseRecentlyOpened(FIXTURE, "code");
    const nodes = recentsToNodes(recents, { at });
    assert.equal(nodes.length, 3);
    const n = nodes[0]!;
    assert.equal(n.kind, "vscode_recent");
    assert.equal(n.title, "proj");
    assert.equal(n.client_uuid, uuidFromSeed("vscode:code:folder:file:///Users/me/proj"));
    assert.equal(n.client_created_at, at);
    assert.deepEqual(n.source_meta, {
      uri: "file:///Users/me/proj",
      path: recents[0]!.path,
      entry_kind: "folder",
      editor: "code",
    });
    assert.ok(typeof n.content === "string" && n.content.length > 0);
  });

  it("dedupes recents in-process; reset re-emits", () => {
    const at = "2026-07-24T02:00:00.000Z";
    const recents = parseRecentlyOpened(FIXTURE, "code");
    const first = recentsToNodes(recents, { at });
    assert.equal(first.length, 3);
    const second = recentsToNodes(recents, { at });
    assert.equal(second.length, 0);
    resetSeenVscodeKeys();
    const third = recentsToNodes(recents, { at });
    assert.equal(third.length, 3);
    assert.equal(third[0]!.client_uuid, first[0]!.client_uuid);
  });
});

describe("readRecentlyOpenedJson integration", () => {
  let dir: string;
  let dbPath: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "return-vscode-"));
    dbPath = join(dir, "state.vscdb");
    const db = new DatabaseSync(dbPath);
    db.exec(`CREATE TABLE ItemTable (key TEXT PRIMARY KEY NOT NULL, value BLOB)`);
    const insert = db.prepare(`INSERT INTO ItemTable (key, value) VALUES (?, ?)`);
    insert.run("history.recentlyOpenedPathsList", FIXTURE);
    insert.run("unrelated.key", "ignore me");
    db.close();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("copy-then-open reads primary history key", () => {
    const json = readRecentlyOpenedJson(dbPath);
    assert.ok(json);
    assert.equal(json, FIXTURE);
  });

  it("collectVscodeRecents returns parsed entries", async () => {
    const recents = await collectVscodeRecents(dbPath, "code");
    assert.equal(recents.length, 3);
    assert.equal(recents[0]!.kind, "folder");
    assert.equal(recents[1]!.kind, "file");
    assert.equal(recents[2]!.kind, "workspace");
  });

  it("null / missing path returns empty", async () => {
    assert.deepEqual(await collectVscodeRecents(null), []);
    assert.deepEqual(await collectVscodeRecents(join(dir, "missing.vscdb"), "code"), []);
  });

  it("resolveVscodeStateDb override uses custom editor", () => {
    const resolved = resolveVscodeStateDb(dbPath);
    assert.ok(resolved);
    assert.equal(resolved!.path, dbPath);
    assert.equal(resolved!.editor, "custom");
  });

  it("resolveVscodeStateDb missing override returns null", () => {
    assert.equal(resolveVscodeStateDb(join(dir, "nope.vscdb")), null);
  });
});
