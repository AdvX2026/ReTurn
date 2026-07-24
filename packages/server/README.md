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
| GET | `/api/continue` | Before / Future + character |
| GET | `/api/stats/today` | live five-dim |
| GET | `/api/timeline?date=` | 24h sessions / feeds / sleep |
| GET | `/api/days?range=30` | overview |
| PATCH | `/api/todos/:id` | check → `todo_check` only on false→true |
| POST | `/api/chat` | triage + workflows (idea/retrieval/question/task) |
| GET | `/api/messages?cursor=` | Now message stream |
| PATCH | `/api/messages/:id/intent` | user corrects triage |
| POST | `/api/resume` | short recap → agent message |
| GET | `/api/tasks?status=` | sidebar tasks |
| GET | `/api/cards?direction=before\|future` | bidirectional stream cards |

## Env

See root `.env.example`. Keys stay on the Pi — never shipped to clients.

- **`HEALTH_TOKEN`**: required for health writes. Empty / `change-me-health-token` disables the route (503).
- **`API_TOKEN`** (optional): when set, all non-ping/health `/api/*` need the same header.
- **`CORS_ORIGINS`** (optional): comma allowlist; empty reflects origin (dev).
