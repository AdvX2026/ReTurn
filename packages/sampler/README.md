# @return/sampler

Independent Node process for background sampling (PRD F2).  
UI closed ≠ sampling stopped. launchd can supervise later; dev runs foreground.

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
| `SAMPLE_INTERVAL_MIN` | `5` |
| `SAMPLER_PORT` | `8791` |
| `SAMPLER_HOST` | `127.0.0.1` |
| `SAMPLER_DATA_DIR` | `~/.return/sampler` |
| `SAMPLER_DEVICE_NAME` | `Mac Sampler` |

## Localhost API (UI only)

```
GET  /health      → ok, last_sample_at, outbox_size, pi_online, error
GET  /status      → last app / tab_count / agent_count
POST /sample-now  body: { "as_snapshot": true? }
                  → { snapshot, enqueued, outbox_size }
```

Bound to **127.0.0.1 only**.

## What it collects

- Frontmost app + Chrome/Safari tabs via `osascript` (macOS)
- Claude Code sessions from `~/.claude/projects/**/*.jsonl` (timestamps + project)
- Main outbox SQLite → `POST /api/nodes` on Pi with `client_uuid` idempotency
