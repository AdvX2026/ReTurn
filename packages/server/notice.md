# Server package notice

## Architecture
- Fastify HTTP API on Pi; SQLite is sole source of truth (`$DATA_DIR/return.db`).
- SQLite via **Node built-in `node:sqlite`** (not better-sqlite3) — requires **Node ≥ 22.13**. Same SQLite engine; avoids native compile on Windows/arm64.
- Shared Zod contracts live in `@return/shared` (API + ferment JSON). Server validates at trust boundary.
- Stats/character are pure code (`src/stats/*`). LLM only produces text products (summary/opening/todos/tags/edges).
- Save is idempotent per day; ferment failure degrades and still seals the day.
- Day bucketing uses **server local timezone** (`created_at` stamped server-side).
- Meeting-notes Tasks use the SQLite `tasks` table as a durable queue. Startup
  requeues interrupted `running` work; the Task UUID is also the output node's
  `client_uuid`, so recovery cannot duplicate the high-weight node. Successful
  extraction stores structured notes; failure stores the raw input and marks
  the Task `failed` without claiming it was organized.

## Env
See root `.env.example`. `LLM_API_KEY` / `HEALTH_TOKEN` never ship to clients.

## Known
- mDNS (`return.local`) not implemented yet — clients use IP for now.
- URL fetch enrichment (title/body summary on `kind=url`) not done; desktop/server can add later.
- Ferment without `LLM_API_KEY` always degrades (tests rely on this).
- Global search / node layering: see `docs/architecture-nodes-search.md` (PR #8).
- Swift `Models.swift` mirror for Search/Ask + `git_commit` waits on `apps/ReturnApp`.
