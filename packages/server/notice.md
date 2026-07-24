# Server package notice

## Architecture
- Fastify HTTP API on Pi; SQLite is sole source of truth (`$DATA_DIR/return.db`).
- SQLite via **Node built-in `node:sqlite`** (not better-sqlite3) — requires **Node ≥ 22.13**. Same SQLite engine; avoids native compile on Windows/arm64.
- Shared Zod contracts live in `@return/shared` (API + ferment JSON). Server validates at trust boundary.
- Stats/character are pure code (`src/stats/*`). LLM only produces text products (summary/opening/todos/tags/edges).
- Save is idempotent per day; ferment failure degrades and still seals the day.
- Day bucketing uses **server local timezone** (`created_at` stamped server-side).

## Env
See root `.env.example`. `LLM_API_KEY` / `HEALTH_TOKEN` never ship to clients.

## Known
- mDNS (`return.local`) not implemented yet — clients use IP for now.
- URL fetch enrichment (title/body summary on `kind=url`) not done; desktop/server can add later.
- Ferment without `LLM_API_KEY` always degrades (tests rely on this).
