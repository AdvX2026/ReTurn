# Server API ↔ PRD v0.6 alignment

> Authority: `docs/PRD.md` **v0.6** §6.2 (synced from origin/main on this branch).  
> Implementation: `packages/server` + `packages/shared`.

## Status vs §6.2

| Endpoint | Status |
|---|---|
| `POST /api/devices/register` | OK |
| `POST /api/nodes` (+ `cadence` in response) | OK |
| `POST /api/voice` (transcript → chat triage) | OK |
| `POST /api/health` | OK |
| `GET/DELETE /api/nodes` | OK |
| `POST /api/chat` | OK — LLM triage + idea / retrieval / question / task |
| `PATCH /api/messages/:id/intent` | **New** |
| `GET /api/messages?cursor=` | **New** |
| `GET /api/cards?direction=before\|future` | **New** |
| `GET /api/tasks?status=` | **New** |
| `POST /api/resume` | **New** — session recap → message |
| `POST /api/save` → cards + night cadence | **Extended** |
| `GET /api/timeline?from=&to=` (also `?date=`) | **Extended** range |
| `GET /api/days` | OK |
| `PATCH /api/todos/:id` | OK |
| `GET /api/stats/today` (+ cadence + collection) | **Extended** |
| `GET /api/usage?from=&to=` | OK |
| `GET /api/ping` | OK |
| `GET /api/search` / `POST /api/ask` | Extra (global search); not listed in §6.2 |

## Data model

- Tables: `messages`, `tasks`, `cards` (`CREATE IF NOT EXISTS`)
- Kinds: + `idea`, `image` (and `git_commit`)
- Ferment JSON: + optional `briefing`, `health_advice`, `ideas[]`
- Save writes briefing / todo_suggestion / health / auto-idea cards

## Intentional simplifications (hackathon)

- Intent triage uses the **same `LLM_*` model** as ferment/ask (`response_format: json_object`); missing or failed providers return explicit errors.
- Image extraction uses the configured multimodal model and persists a completed high-weight Task/node only after successful extraction.
- Meeting-notes tasks use the SQLite-backed background runner and survive restarts.
- `PATCH .../intent` can re-run chat with forced intent
- Swift `Models.swift` mirrors the shared contract in the same change.

## Tests

- `packages/server/src/services/v06.workflows.test.ts`
- HTTP smoke: chat / messages / cards / resume / tasks / timeline range
