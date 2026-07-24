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
- Agent session timeline (`agents.ts` + `sources/agents.ts`): all platforms

## Agent providers (timeline only — no transcript content)
- **claude**: `CLAUDE_HOME` or `~/.claude/projects/**/*.jsonl`
- **codex**: `CODEX_HOME` or `~/.codex/sessions/**/*.jsonl`
- mtime before local midnight → skip file
- timestamps gap-split at 15min; tail interval `open` while warm
- regular sample enqueues **closed** intervals only; Save Today (`as_snapshot`) also flushes open
- `source_meta`: `{ provider, project, start, end, duration_min, session_id, open }`
- `client_uuid` = sha256 seed `agent:{provider}|{session_id}|{start}`
