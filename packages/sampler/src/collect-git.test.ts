import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";
import { parseGitLog, resetRepoCache, scanTodayCommits } from "./collect-git.js";
import { uuidFromSeed } from "./source.js";
import { commitsToNodes, resetSeenCommitShas } from "./sources/git.js";

describe("parseGitLog", () => {
  const repo = "demo";
  const repoPath = "/tmp/demo";

  it("parses multi-commit log with full shortstat", () => {
    const stdout = [
      "\x1eabc123\x1f2026-07-24T10:00:00+08:00\x1ffix: something",
      " 3 files changed, 10 insertions(+), 2 deletions(-)",
      "\x1edef456\x1f2026-07-24T11:30:00+08:00\x1ffeature: other",
      " 1 file changed, 5 insertions(+)",
    ].join("\n");
    const commits = parseGitLog(stdout, repo, repoPath);
    assert.equal(commits.length, 2);
    assert.equal(commits[0]!.sha, "abc123");
    assert.equal(commits[0]!.subject, "fix: something");
    assert.equal(commits[0]!.filesChanged, 3);
    assert.equal(commits[0]!.insertions, 10);
    assert.equal(commits[0]!.deletions, 2);
    assert.equal(commits[0]!.repo, repo);
    assert.equal(commits[0]!.repoPath, repoPath);

    assert.equal(commits[1]!.sha, "def456");
    assert.equal(commits[1]!.filesChanged, 1);
    assert.equal(commits[1]!.insertions, 5);
    assert.equal(commits[1]!.deletions, null);
  });

  it("handles missing insertions and single-file shortstat", () => {
    const stdout = [
      "\x1eaaa\x1f2026-07-24T12:00:00+00:00\x1fonly deletions",
      " 2 files changed, 4 deletions(-)",
      "\x1ebbb\x1f2026-07-24T12:01:00+00:00\x1fsingle file",
      " 1 file changed, 1 insertion(+)",
    ].join("\n");
    const commits = parseGitLog(stdout, repo, repoPath);
    assert.equal(commits.length, 2);
    assert.equal(commits[0]!.filesChanged, 2);
    assert.equal(commits[0]!.insertions, null);
    assert.equal(commits[0]!.deletions, 4);
    assert.equal(commits[1]!.filesChanged, 1);
    assert.equal(commits[1]!.insertions, 1);
    assert.equal(commits[1]!.deletions, null);
  });

  it("returns empty for empty or garbage input", () => {
    assert.deepEqual(parseGitLog("", repo, repoPath), []);
    assert.deepEqual(parseGitLog("   \n  ", repo, repoPath), []);
    assert.deepEqual(parseGitLog("not a git log", repo, repoPath), []);
  });

  it("converts offset author time to UTC ISO (Z)", () => {
    const stdout =
      "\x1esha1\x1f2026-07-24T10:00:00+08:00\x1fmorning commit\n 1 file changed, 1 insertion(+)";
    const [c] = parseGitLog(stdout, repo, repoPath);
    assert.ok(c);
    assert.equal(c!.committedAt, "2026-07-24T02:00:00.000Z");
    assert.match(c!.committedAt, /Z$/);
  });

  it("allows commits without shortstat (null stats)", () => {
    const stdout = "\x1esha1\x1f2026-07-24T10:00:00Z\x1fno stats here";
    const [c] = parseGitLog(stdout, repo, repoPath);
    assert.ok(c);
    assert.equal(c!.filesChanged, null);
    assert.equal(c!.insertions, null);
    assert.equal(c!.deletions, null);
  });
});

describe("git source emission", () => {
  beforeEach(() => {
    resetSeenCommitShas();
  });

  it("is deterministic for same (repoPath, sha)", () => {
    const a = uuidFromSeed("git:/tmp/demo:abc");
    const b = uuidFromSeed("git:/tmp/demo:abc");
    const c = uuidFromSeed("git:/tmp/demo:def");
    assert.equal(a, b);
    assert.notEqual(a, c);
    assert.match(
      a,
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it("maps commits to git_commit nodes with correct fields", () => {
    const nodes = commitsToNodes([
      {
        repo: "demo",
        repoPath: "/tmp/demo",
        sha: "abc123",
        committedAt: "2026-07-24T02:00:00.000Z",
        subject: "fix: something",
        filesChanged: 3,
        insertions: 10,
        deletions: 2,
      },
    ]);
    assert.equal(nodes.length, 1);
    const n = nodes[0]!;
    assert.equal(n.kind, "git_commit");
    assert.equal(n.title, "fix: something");
    assert.equal(n.content, null);
    assert.equal(n.client_uuid, uuidFromSeed("git:/tmp/demo:abc123"));
    assert.equal(n.client_created_at, "2026-07-24T02:00:00.000Z");
    assert.deepEqual(n.source_meta, {
      repo: "demo",
      sha: "abc123",
      committed_at: "2026-07-24T02:00:00.000Z",
      files_changed: 3,
      insertions: 10,
      deletions: 2,
    });
  });

  it("truncates subject to 500 chars for title", () => {
    const long = "x".repeat(600);
    const n = commitsToNodes([
      {
        repo: "demo",
        repoPath: "/tmp/demo",
        sha: "long1",
        committedAt: "2026-07-24T02:00:00.000Z",
        subject: long,
        filesChanged: null,
        insertions: null,
        deletions: null,
      },
    ])[0]!;
    assert.equal(n.title!.length, 500);
  });

  it("dates commits by author local day (cross-midnight)", () => {
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

    const nodes = commitsToNodes([
      {
        repo: "demo",
        repoPath: "/tmp/demo",
        sha: "day1",
        committedAt: d1.toISOString(),
        subject: "day1",
        filesChanged: 1,
        insertions: 1,
        deletions: null,
      },
      {
        repo: "demo",
        repoPath: "/tmp/demo",
        sha: "day2",
        committedAt: d2.toISOString(),
        subject: "day2",
        filesChanged: 1,
        insertions: 1,
        deletions: null,
      },
    ]);
    assert.equal(nodes.length, 2);
    assert.equal(nodes[0]!.date, ymd(d1));
    assert.equal(nodes[1]!.date, ymd(d2));
    assert.notEqual(nodes[0]!.date, nodes[1]!.date);
  });

  it("dedupes commits in-process; reset re-emits", () => {
    const commits = [
      {
        repo: "demo",
        repoPath: "/tmp/demo",
        sha: "same",
        committedAt: "2026-07-24T02:00:00.000Z",
        subject: "once",
        filesChanged: 1,
        insertions: 1,
        deletions: null,
      },
    ];
    const first = commitsToNodes(commits);
    assert.equal(first.length, 1);
    const second = commitsToNodes(commits);
    assert.equal(second.length, 0);
    resetSeenCommitShas();
    const third = commitsToNodes(commits);
    assert.equal(third.length, 1);
    assert.equal(third[0]!.client_uuid, first[0]!.client_uuid);
  });
});

describe("scanTodayCommits integration", () => {
  let root: string;
  let repoPath: string;

  beforeEach(() => {
    resetRepoCache();
    root = mkdtempSync(join(tmpdir(), "return-git-"));
    repoPath = join(root, "proj");
    mkdirSync(repoPath);
    execFileSync("git", ["init"], { cwd: repoPath, stdio: "ignore" });
    execFileSync("git", ["config", "user.email", "test@example.com"], {
      cwd: repoPath,
      stdio: "ignore",
    });
    execFileSync("git", ["config", "user.name", "Test"], {
      cwd: repoPath,
      stdio: "ignore",
    });
    writeFileSync(join(repoPath, "a.txt"), "hello\n");
    execFileSync("git", ["add", "a.txt"], { cwd: repoPath, stdio: "ignore" });
    execFileSync("git", ["commit", "-m", "init: hello"], {
      cwd: repoPath,
      stdio: "ignore",
    });
  });

  afterEach(() => {
    resetRepoCache();
    rmSync(root, { recursive: true, force: true });
  });

  it("discovers repo under root and returns today's commit", async () => {
    const commits = await scanTodayCommits([root]);
    assert.ok(commits.length >= 1, `expected >=1 commit, got ${commits.length}`);
    const hit = commits.find((c) => c.subject === "init: hello");
    assert.ok(hit, "expected subject 'init: hello'");
    assert.equal(hit!.repo, "proj");
    assert.match(hit!.committedAt, /Z$/);
    assert.ok(hit!.filesChanged === 1 || hit!.filesChanged === null);
  });

  it("empty roots -> no spawn, empty result", async () => {
    const commits = await scanTodayCommits([]);
    assert.deepEqual(commits, []);
  });
});
