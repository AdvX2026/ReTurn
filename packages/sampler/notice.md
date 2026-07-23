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

## macOS vs Windows
- App/tabs via osascript: **darwin only**
- Agent jsonl parse: all platforms
