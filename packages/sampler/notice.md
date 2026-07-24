# packages/sampler

## Role
Independent Node process (PRD F2). Not part of Tauri UI process.
UI closed must not stop sampling. Dev: `pnpm dev:sampler`. Prod later: launchd.

## Local control plane (127.0.0.1 only)
- GET `/health` `/status`
- POST `/sample-now` `{ as_snapshot?: boolean }`

## Data
- Main outbox SQLite: `SAMPLER_DATA_DIR` default `~/.return/sampler/outbox.db`
- Device id file same dir; registers with Pi on flush

## Architecture — pluggable sources
- `source.ts`: `SampleSource` contract + shared helpers (`todayLocal`, `uuidFromSeed`, `createKeyDedupe`)
- `collect.ts`: orchestrator only — registry of sources, fan-out sample, assemble snapshot
- `sources/<id>.ts`: one file per feature; owns collect → map → dedupe → `NodeInput[]`
- Add a source: implement `SampleSource`, append to `SOURCES` in `collect.ts`. Never put feature logic in collect.

## macOS vs Windows
- App/tabs (`sources/env.ts`, osascript): **darwin only**
- Apple Reminders (`sources/reminders.ts`): **darwin only**
- Agent session timeline (`agents.ts` + `sources/agents.ts`): all platforms
- Git commits (`sources/git.ts`): all platforms (when `GIT_SCAN_DIRS` set)

## Agent providers (timeline only — no transcript content)
- **claude**: `CLAUDE_HOME` or `~/.claude/projects/**/*.jsonl`
- **codex**: `CODEX_HOME` or `~/.codex/sessions/**/*.jsonl`
- mtime before local midnight → skip file
- timestamps gap-split at 15min; tail interval `open` while warm
- **only closed** intervals are enqueued (regular tick and Save Today) — server is insert-only on `client_uuid`, so open provisional nodes would double-count when closed arrives
- single-event intervals report `duration_min: 0` (no 1min floor)
- `source_meta`: `{ provider, project, start, end, duration_min, session_id, open: false }`
- `client_uuid` = sha256 seed `agent:{provider}|{session_id}|{start}`

## Git commits (today's local commits)
- Source: `sources/git.ts` + `collect-git.ts`
- `GIT_SCAN_DIRS` comma-separated roots (`~` expanded, resolved absolute). Empty default = feature off, no git spawn.
- Discovers repos: each root + its direct children (skip hidden / `node_modules`); `.git` file or dir.
- Discover cache TTL 1h. Per-repo: `git log --all --fixed-strings --author=<local user.email> --since=<todayLocal>T00:00:00 -n 100 --shortstat`.
- `client_uuid` = sha256 seed `git:{repoPath}:{sha}` — restart/replay safe (repoPath is absolute).
- `source_meta`: `{ repo, sha, committed_at, files_changed, insertions, deletions }`
- Failures silent; never blocks sample main path or outbox flush.

## Apple Reminders (all lists — positive samples for preference loop)
- Source: `sources/reminders.ts` + `collect-reminders.ts`
- **darwin only**; non-mac always empty. Opt-out: `REMINDERS_ENABLED=0` / `false` (default on when unset).
- Read-only JXA (`osascript -l JavaScript`) over every Reminders list. Never writes.
- Emits `kind: "reminder"` for each item (incomplete + completed). Not an ACTIVE_FEED kind.
- `client_uuid` = sha256 seed `reminder:{id}:{0|1}` — completed flag included so incomplete→complete emits a **new** node (server insert-only on uuid). In-process dedupe uses the same seed.
- On restart, re-posts are fine (server UNIQUE on client_uuid). Same-process completion flip after first emit is re-emitted because seed changes.
- `source_meta`: `{ list, completed, due, reminder_id, creation_date, modification_date }`
- `client_created_at`: modificationDate || creationDate || sample tick (ISO). Dates from JXA best-effort; null on failure.
- `date`: `todayLocal()` of the sample tick (current-state snapshot).
- Failures silent (auth prompt denied, app missing, timeout) — never blocks the tick.
- First run may trigger macOS Automation permission for Reminders / osascript.
