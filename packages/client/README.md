# @return/client

Desktop UI shell (Tauri 2) + shared React entry for future iOS.

**This package currently ships only a wiring shell** (Pi ping + sampler health / sample-now). Product views (Continue, Feed, Save, Timeline, …) come later.

## Run

```bash
# terminals
pnpm dev:server
pnpm dev:sampler
pnpm --filter @return/client tauri:dev
# or browser-only shell:
pnpm --filter @return/client dev
```

## Architecture (PRD)

- **client** = UI process only. No sampling in this process.
- **sampler** = independent Node process (`packages/sampler`), localhost `:8791`.
- **server** = Pi Fastify.

Rust layer stays thin (window + shell plugin). No outbox SQL plugin.
