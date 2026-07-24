# packages/client

## Role
Tauri 2 UI process only. Product views not built yet — `Shell.tsx` is wiring probe only.

## Hard rules (PRD)
- No sampling logic in this process
- Talk to sampler only via localhost `:8791`
- Talk to Pi via configured server URL
- Rust layer thin (window + shell plugin); no tauri-plugin-sql

## Later
Continue / Feed / Save+Settlement / Nodes / Timeline / Stats / Character packs.
TanStack Query + Zustand view switch (no react-router).
