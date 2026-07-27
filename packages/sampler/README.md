# @return/sampler

Independent cross-platform Node process for background sampling (PRD F2).
UI closed ≠ sampling stopped. The runtime is shared by Apple and Windows clients; platform-specific collection and service installation live behind adapters. Development runs in the foreground.

## Run

```bash
# root
pnpm --filter @return/shared build
pnpm dev:sampler
```

Env (optional):

| Var | Default |
|-----|---------|
| `RETURN_SERVER_URL` | `http://127.0.0.1:8787` |
| `SAMPLE_INTERVAL_MIN` | `5` (active cadence) |
| `SAMPLE_INTERVAL_NIGHT_MIN` | `30` (post-Save cadence) |
| `SAMPLER_PORT` | `8791` |
| `SAMPLER_DATA_DIR` | `~/.return/sampler` (current default; Windows adapter may use a platform-native path) |
| `SAMPLER_DEVICE_NAME` | `Mac Sampler` (current default; must become platform-aware with Windows runtime support) |

## Localhost API (UI only)

```
GET  /health      → ok, last_sample_at, outbox_size, pi_online, error
GET  /status      → last app / tab_count / agent_count
POST /sample-now  body: { "as_snapshot": true? }
                  → { snapshot, enqueued, outbox_size }
```

Bound to **127.0.0.1 only**.

## What it collects

Shared sources:

- Claude Code and Codex sessions from local JSONL metadata (timestamps + project only)
- Git commits, Gmail, VS Code/Cursor recents, and Chromium browse history
- Main outbox SQLite → `POST /api/nodes` on Pi with `client_uuid` idempotency

Platform adapters:

- macOS: frontmost app + Chrome/Safari tabs via `osascript`, Apple Reminders, Safari history
- Windows: Chromium history and VS Code path discovery already work; frontmost-app collection and service installation remain to be implemented
