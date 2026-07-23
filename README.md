# ReTurn

Local second brain: Orange Pi home server + macOS desktop (Tauri) + iOS read-only.

## Packages

| Package | Role |
|---------|------|
| `@return/shared` | Zod schemas — API contract + ferment JSON |
| `@return/server` | Pi backend — Fastify + `node:sqlite` + ferment/stats |
| `@return/desktop` | (not yet) Tauri 2 client |

## Quick start (server)

```bash
cp .env.example .env   # set LLM_API_KEY, HEALTH_TOKEN
pnpm install
pnpm --filter @return/shared build
pnpm dev:server
```

Requires **Node ≥ 22.5** (uses built-in `node:sqlite`).

## Docs

- Product: `docs/PRD.md`
- Server API: `packages/server/README.md`
