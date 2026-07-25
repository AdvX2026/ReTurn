# @return/server

Orange Pi home-server for ReTurn. Node ≥ 22.13 + Fastify + `node:sqlite`.

## Run

```bash
# from repo root
cp .env.example .env   # set LLM_API_KEY, HEALTH_TOKEN
pnpm install
pnpm --filter @return/shared build
pnpm dev:server
```

Listens on `http://0.0.0.0:8787` by default. SQLite at `$DATA_DIR/return.db`.

## API (PRD §6.2)

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/ping` | outbox probe |
| POST | `/api/devices/register` | `{ name, platform, device_id? }` |
| POST | `/api/nodes` | batch upsert by `client_uuid` |
| GET | `/api/nodes?date=` | day node stream |
| DELETE | `/api/nodes/:id` | |
| POST | `/api/voice` | multipart audio → whisper → voice node |
| POST | `/api/health` | header `X-Return-Token` (Shortcuts); **503 if HEALTH_TOKEN unset/weak** |
| POST | `/api/save` | ferment + stats freeze (idempotent) |
| GET | `/api/stats/today` | live five-dim + collection status |
| GET | `/api/usage?from=&to=` | provider calls, failures, and tokens |
| GET | `/api/timeline?date=` | 24h sessions / feeds / sleep |
| GET | `/api/days?range=30` | overview |
| PATCH | `/api/todos/:id` | check → `todo_check` only on false→true |
| POST | `/api/todos/:id/accept` | UI wrote Reminder → positive sample (`reminder_id?`) |
| POST | `/api/todos/:id/dismiss` | ignore suggestion → negative sample |

## Env

See root `.env.example`. Keys stay on the Pi — never shipped to clients.

- **`HEALTH_TOKEN`**: required for health writes. Empty / `change-me-health-token` disables the route (503).
- **`API_TOKEN`** (optional): when set, all non-ping/health `/api/*` need the same header.
- **`CORS_ORIGINS`** (optional): comma allowlist; empty reflects origin (dev).
