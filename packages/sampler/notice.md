# packages/sampler

## Role
Independent Node process (PRD F2). Not part of Tauri UI process.
UI closed must not stop sampling. Dev: `pnpm dev:sampler`. Prod later: launchd.

## Local control plane (127.0.0.1 only)
- GET `/health` `/status` (includes `cadence` + effective `interval_min`)
- POST `/sample-now` `{ as_snapshot?: boolean }`

## Cadence (PRD F2)
- Pi returns `cadence` on `POST /api/nodes` (`active` | `night`).
- Sampler applies it on every successful flush: `active` → `SAMPLE_INTERVAL_MIN` (default 5), `night` → `SAMPLE_INTERVAL_NIGHT_MIN` (default 30).
- Next day: server flips back to `active` when today is unsaved; next flush reschedules.

## Data
- Main outbox SQLite: `SAMPLER_DATA_DIR` default `~/.return/sampler/outbox.db`
- Device id file same dir; registers with Pi on flush

## Architecture — pluggable sources
- `source.ts`: `SampleSource` contract + one `SampleContext` clock shared by every source.
- `collect.ts`: orchestrator only — registry of sources, fan-out sample, assemble snapshot.
  `asSnapshot` is orchestrator-only (emits env `snapshot` node); not on `SampleContext`.
- `sources/<id>.ts`: one file per feature; owns collect → map → dedupe → `NodeInput[]`
- Add a source: implement `SampleSource`, append to `SOURCES` in `collect.ts`. Never put feature logic in collect.
- Chrome + Safari share `visitsToNodes` / `resetSeenVisits` in `sources/chrome-history.ts`.
- `expandHome` lives in `config.ts` (used by path resolvers).
- `SAMPLER_TIMEZONE` is the IANA day authority (defaults to the system timezone).
- `SAMPLER_NOW` freezes the global clock for explicit replay/tests only; leave unset in production.
- Every tick supplies `at`, `timezone`, `day`, `dayStart`, and `dayEnd`; sources must not derive their own day window.

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
- Discover cache TTL 1h. Per-repo: `git log --all --fixed-strings --author=<local user.email> --since=<dayStart> --until=<dayEnd> -n 100 --shortstat`.
- `client_uuid` = sha256 seed `git:{repoPath}:{sha}` — restart/replay safe (repoPath is absolute).
- `source_meta`: `{ repo, sha, committed_at, files_changed, insertions, deletions }`
- Operational failures reach the orchestrator and appear as `stats.git.error: 1`; other sources still run.

## Apple Reminders (all lists — positive samples for preference loop)
- Source: `sources/reminders.ts` + `collect-reminders.ts`
- **darwin only**; non-mac always empty. Opt-out: `REMINDERS_ENABLED=0` / `false` (default on when unset).
- Read-only JXA (`osascript -l JavaScript`) over every Reminders list. Never writes.
- Emits `kind: "reminder"` for each item (incomplete + completed). Not an ACTIVE_FEED kind.
- `client_uuid` = sha256 seed `reminder:{date}:{id}:{0|1}` — daily snapshot + completed flip produce new nodes.
- On restart, re-posts are fine (server UNIQUE on client_uuid). Same-process completion flip after first emit is re-emitted because seed changes.
- `source_meta`: `{ list, completed, due, reminder_id, creation_date, modification_date }`
- `client_created_at`: shared sample tick (`SampleContext.at`); original dates remain in `source_meta`.
- `date`: shared `SampleContext.day` (current-state snapshot).
- Rows without a stable Reminders ID are dropped; no synthetic ID is generated.
- Operational failures reach the orchestrator and appear as `stats.reminders.error: 1`; other sources still run.
- First run may trigger macOS Automation permission for Reminders / osascript.

## VS Code recent projects
- Source: `sources/vscode.ts` + `collect-vscode.ts`
- Reads `state.vscdb` ItemTable key `history.recentlyOpenedPathsList` (copy-then-open via temp file; VS Code may lock live DB). Copy includes `state.vscdb-wal` / `-shm` when present (`copySqliteWithWalSync` in `sqlite-snapshot.ts`) — open editor keeps recent ItemTable pages in the WAL; main-file-only copy silently drops them.
- Shared helper: `sqlite-snapshot.ts` (`copySqliteWithWal` / `copySqliteWithWalSync`) used by both Chrome History and VS Code sources.
- `VSCODE_STATE_DB` optional override (`~` expanded). Empty = auto-detect first existing Code / Code - Insiders / Cursor path for the OS.
- `VSCODE_ENABLED=0|false|off|no` disables; default on when a db is found.
- Cap 30 entries (VS Code order is recent-first). Editor label from which candidate matched (`code` / `code-insiders` / `cursor` / `custom`).
- `client_uuid` = sha256 seed `vscode:{editor}:{kind}:{uri}`
- `source_meta`: `{ uri, path, entry_kind, editor }` (`entry_kind`: folder | file | workspace)
- Kind `vscode_recent` — not an active feed. Operational failures are reported as `stats.vscode.error: 1`.

## Outbox batching
- `CreateNodesRequest.nodes` max is **500** (`@return/shared`). `Outbox.enqueue` chunks via `chunkNodes` / `MAX_NODES_PER_BATCH` so a fat sample (e.g. many reminders + history) never POSTs a single body the server Zod-rejects — that used to stick the FIFO head and block all later flushes.
- `postNodes` also re-chunks as defense in depth for legacy/out-of-band rows.

## Chrome browse history (today's visits)
- Source: `sources/chrome-history.ts` + `collect-chrome-history.ts`
- Kind: `browse_history` (not in ACTIVE_FEED_KINDS — environment context, denser than open tabs)
- **Must copy** History SQLite to temp before open (Chrome locks the live file); `node:sqlite` DatabaseSync only. Copy includes `History-wal` / `History-shm` when present (`copySqliteWithWal` from `sqlite-snapshot.ts`) — Chrome keeps recent visits in the WAL until checkpoint; main-file-only copy silently drops today's rows.
- Timestamps: Chrome WebKit µs since 1601-01-01 UTC → ISO via `chromeTimeToIso`. Day filter uses local midnight range. µs exceed `Number.MAX_SAFE_INTEGER` — use `bigint` + `DatabaseSync({ readBigInts: true })` for visit_time / range bounds.
- Auto-detect (first existing, max 4 DBs): Chrome / Chromium / Edge / Brave under OS-standard user-data dirs; profiles Default + Profile 1..3.
- `CHROME_HISTORY_PATH` override (single file, skips auto-detect). `CHROME_HISTORY_ENABLED=0|false` disables. `CHROME_HISTORY_LIMIT` default 100 total/tick — configured values must be positive integers or sampler startup fails.
- `client_uuid` = sha256 seed `browse:{browser}:{profile}:{visitId}` — visit id stable within a profile DB.
- `source_meta`: `{ url, title, visited_at, visit_id, browser, profile }`; `content` = url; `date` = shared `SampleContext.day`.
- Operational failures reach the orchestrator and appear as `stats.chrome_history.error: 1`; other sources still run.

## Safari browse history
- Source: `sources/safari-history.ts` + `collect-safari-history.ts`
- macOS only; reads `~/Library/Safari/History.db` by default using SQLite copy-then-open with WAL.
- The sampler process needs Full Disk Access; denial is reported as `stats.safari_history.error: 1`.
- Uses the shared `[dayStart, dayEnd)` range and emits the same `browse_history` node structure as Chrome.
- `SAFARI_HISTORY_PATH` overrides the database; `SAFARI_HISTORY_ENABLED=0` disables it; default limit is 100.

## Gmail IMAP
- Source: `sources/gmail.ts` + `collect-gmail.ts`; disabled unless both IMAP user and app password are configured.
- Read-only INBOX + Sent collection. IMAP `SINCE` narrows the server query; the shared `[dayStart, dayEnd)` range performs the exact client-side filter.
- Missing envelope, RFC Message-ID, or valid message date fails the source explicitly; no message is silently dropped and no UID-based synthetic identity is generated.
- Partial credentials, invalid connection settings, missing Sent mailbox, and IMAP/parser failures are reported as `stats.gmail.error: 1` with the error in `snapshot.errors.gmail`.
- Received messages contribute to intake; sent messages contribute to output.
- Credentials remain environment-only and are never logged.
