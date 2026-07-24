# ReTurn

Local second brain: Orange Pi home server + macOS desktop (Tauri) + iOS read-only.

## Packages

| Package | Role |
|---------|------|
| `@return/shared` | Zod schemas — API contract + ferment JSON |
| `@return/server` | Pi backend — Fastify + `node:sqlite` + ferment/stats |
| `@return/sampler` | **Independent** macOS sampler process (launchd later) |
| `@return/client` | Tauri 2 UI shell (product views later); iOS reuses same React tree |

## Quick start

```bash
cp .env.example .env   # set LLM_API_KEY, HEALTH_TOKEN
pnpm install
pnpm --filter @return/shared build

# three processes (PRD dual-process desktop + Pi)
pnpm dev:server     # :8787
pnpm dev:sampler    # :8791 localhost only
pnpm dev:client     # vite :1420  (or pnpm dev:desktop for Tauri)
```

Requires **Node ≥ 22.13** (built-in `node:sqlite` without experimental flag).

## Docs

- Product: `docs/PRD.md`
- Server API: `packages/server/README.md`
- Sampler: `packages/sampler/README.md`
