# Server package notice

## Architecture
- Fastify HTTP API on Pi; SQLite is sole source of truth (`$DATA_DIR/return.db`).
- SQLite via **Node built-in `node:sqlite`** (not better-sqlite3) — requires **Node ≥ 22.13**. Same SQLite engine; avoids native compile on Windows/arm64.
- Shared Zod contracts live in `@return/shared` (API + ferment JSON). Server validates at trust boundary.
- Stats/character are pure code (`src/stats/*`). LLM only produces text products (summary/opening/todos/tags/edges).
- Save is idempotent per day; ferment failure leaves the day open and returns an error.
- Save switches cadence to `night` through the next local 06:00 boundary.
- Provider calls are recorded in `llm_usage` with model, operation, status, and
  token counts only. Prompts, responses, errors, and user content are never stored.
- Day bucketing uses **server local timezone** (`created_at` stamped server-side).
- Meeting-notes Tasks use the SQLite `tasks` table as a durable queue. Startup
  requeues interrupted `running` work; the Task UUID is also the output node's
  `client_uuid`, so recovery cannot duplicate the high-weight node. Successful
  extraction stores structured notes; failure stores the raw input and marks
  the Task `failed` without claiming it was organized.

## Env
See root `.env.example`. `LLM_API_KEY` / `HEALTH_TOKEN` never ship to clients. Health, LLM, Whisper, and embedding are optional and configured independently: unconfigured features answer with an explicit 503 (never a fake success); embedding off → keyword-only search. Invalid numeric/URL configuration fails startup.
- Image chat uses the configured multimodal `LLM_MODEL`; successful extraction creates a completed high-weight image Task and node.

## Known
- mDNS (`return.local`) not implemented yet — clients use IP for now.
- URL fetch enrichment (title/body summary on `kind=url`) not done; desktop/server can add later.
- Global search / node layering: see `docs/architecture-nodes-search.md` (PR #8).
- Swift `Models.swift` mirrors the shared API contract, including all sampler node kinds.
- Voice transcription failure preserves the raw audio file and a pending voice node (`pending_transcript: true`), and returns HTTP 502/503 — no fake transcript.

## Development data
- `pnpm --filter @return/server data:mock` fills an empty database with randomized, human-paced history (default: 14 days ending today). Use `--days`, `--end`, or `--db` to target another range/database.
- `data:inspect` shows table counts, recent days, and nodes; filters include `--date`, `--kind`, `--limit`, and `--json`.
- `data:clear -- --confirm` clears SQLite business data and derived indexes but preserves the schema and `data/audio/`. It refuses to run without explicit confirmation.
- Mock generation refuses non-empty databases so generated data cannot silently mix with existing user data.

## Todo preference loop (AI suggestions ↔ Apple Reminders)
- Real checklist = Mac Reminders. Server `todos` = AI suggestions only (`status`: suggested|accepted|dismissed).
- Accept: `POST /api/todos/:id/accept` after UI EventKit write. Dismiss: `POST .../dismiss`.
- Save: expire stale suggested → feed open reminders + accepted/dismissed texts into ferment prompt; server-side text dedupe on insert; `source_node_id` = save_note when present.
- Output score primary signal = `reminderCompletionRate` (not `todos.done`).
- No `user_profile` table — preference is live samples in prompt. Add table only if need cross-session summary beyond last N.
