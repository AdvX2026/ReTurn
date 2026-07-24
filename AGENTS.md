# AI Agent Instructions

This file is the single source of truth for all AI coding assistants working on this project.
Tool-specific files (`CLAUDE.md`) point here.

Keep it to durable, cross-session guidance — product, rules, standards, security, handoff. Session scratch (current branch, this round's progress, temporary state) does not belong here; put it in the End-of-Session Summary or `notice.md`.

## Product

ReTurn — a 48h-hackathon "daily save" second brain. Orange Pi 3B home server (Fastify + `node:sqlite`; sole data authority; LLM/transcription API keys live here only) + macOS desktop (SwiftUI UI app + independent Node sampler — two separate processes) + iOS (SwiftUI read-only views + HealthKit upload). Single user, multi-device, home-LAN only. Platform scope is macOS + iOS — no Windows, no web. Product authority: `docs/PRD.md` (v0.5).

## Project Phase

<!-- Kept-current snapshot — update in place; don't append history. -->
- **@return/shared**: Zod schemas (API contract + ferment JSON) — the single contract authority, frozen per PRD T+6h. Built, stable.
- **@return/server**: Pi backend complete (routes, SQLite repo, ferment pipeline, stats/sessions/streak); 34 unit tests + HTTP smoke. On main.
- **@return/sampler**: independent macOS sampler (osascript app/tab sampling, Claude Code jsonl agent sessions, SQLite outbox, loopback control plane :8791). On main.
- **packages/client**: DEPRECATED Tauri probe shell — do not extend; deleted when `apps/ReturnApp` lands.
- **apps/ReturnApp** (upcoming): SwiftUI multiplatform app (macOS 14 / iOS 17 baseline) — all product views; Swift Codable mirror of the shared contract in `Models.swift`.

## Development Rules

### Communication Language
- User-facing output — explanations, questions, status updates, summaries, anything the user reads — must be in Simplified Chinese (简体中文).
- Software and internal work stays in English: code, identifiers, comments, commit messages, logs, test names, and your own reasoning/analysis.
- This governs presentation, not content: do not rename existing identifiers or rewrite existing English docs just to comply, and match the surrounding language of any file you edit.

### Confirm Before Irreversible or Architecture-Level Work
- The understand-and-confirm step — restate the request, surface risks/tradeoffs, give a concrete recommendation, then wait for the user — is required only for architecture-level or hard-to-reverse changes: PRD scope, data schema, the shared API contract, cross-package refactors, anything outward-facing or destructive.
- Implementation tasks inside an already-agreed plan proceed directly — act, then state plainly what changed and why.
- Push back on any request that compromises security, correctness, or runtime efficiency, even when explicitly asked.

### Dry-Run Requests
- When the user's prompt contains "dry-run", treat the request as read-only: do not modify code, files, or configuration.
- Respond with two things: (1) your complete understanding of the request, and (2) a detailed, step-by-step explanation of how you would execute it.
- Make changes only after the user explicitly asks you to proceed.

### Simplicity First
- Write the minimum code that solves the stated problem; nothing speculative.
- No features, flags, config, or abstractions that weren't requested. Don't build "flexibility" for a future that isn't here.
- A single-use helper needs no abstraction — inline first, extract only on the second real caller.
- Validate untrusted input at the trust boundary, but don't add defensive handling for inputs that cannot occur.
- Adding a new third-party dependency needs the user's OK first; prefer the standard library and what's already in the project, and say why the dep is worth its cost.
- Before finishing, ask: would a senior engineer call this overcomplicated? If yes, cut it down.

### Scope Discipline
- Each task must stay within its stated scope. Do not add, refactor, or "improve" anything outside the current request.
- If the current task logically depends on another unbuilt feature, ask the user before implementing it. Never silently introduce adjacent functionality.
- Match the surrounding style and patterns even if you'd do it differently; don't reformat or refactor code your task doesn't touch.
- Clean up only the orphans your change creates (now-unused imports/vars/functions). Pre-existing dead code: flag it, don't delete it.

### Coding Standards
- **Source of truth & persistence**: Pi SQLite is the only authoritative datastore. Clients hold outboxes only (sampler: SQLite; UI: JSON file queue) and replay with the original `client_uuid` — the idempotency key. Never regenerate a `client_uuid` on retry.
- **Contract**: `packages/shared` Zod schemas are the API authority. Any contract change must update the Swift `Models.swift` mirror (`apps/ReturnApp`) in the same commit.
- **Architecture & boundaries**: sampling lives only in the sampler process — the UI never samples, and talks to the sampler via localhost :8791 only. The sampler control plane binds `127.0.0.1`, hardcoded — never configurable, never LAN. LLM/transcription keys exist only in the Pi server env — never in clients, never in git.
- **Language / framework conventions**: backend is TS strict + Biome (`pnpm lint`), Node ≥ 22.13 with `node:sqlite` — no native-module DB deps. Swift side is SwiftUI + URLSession async/await; HealthKit code is always guarded by `#if os(iOS)`.
- **Security boundary**: trust model is a single user on a home LAN. `/api/health` requires the fixed token; other write endpoints are deliberately unauthenticated (hackathon scope) — therefore the server must never be exposed beyond the LAN.

### Secrets & Sensitive Data
- Never hardcode secrets or credentials; read them from environment/config. Never print, log, or echo secrets, tokens, or PII.
- Keep the project's seeded secrets-deny rules (covering `.env*`, `secrets/**`, and key files) in place.

### Verify & Commit
- Before coding, restate the task as a concrete, checkable success criterion rather than "make it work", and scale testing to the work's risk.
- After any code change, run the project's verification (e.g. type-check / build / lint) across all affected packages.
- If verification fails, fix the errors first, then verify again.
- After verification passes, automatically commit files that were modified by the agent in the current task and belong to the current task.
- Before committing, inspect dirty files and separate current-task agent edits from unrecognized dirty files. Do not include unrecognized dirty files in commits unless the user explicitly asks to include them.
- If a dirty file's ownership or task relevance cannot be determined safely, stop and ask the user before committing.
- Group commits by coherent change unit. Do not push unless explicitly requested. Exception: `docs/PRD.md` edits are pushed immediately once made (team convention).
- Branching: per-feature work lands on a `feat/*` branch that merges into the mainline. Merged branches on origin are the historical archive — never delete them remotely; local copies may be pruned freely.
- Commit message format (Conventional Commits):
  ```
  type(scope): short summary

  Detailed description of what changed and why.
  ```
  Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `ci`, `perf`.

### Project Profile

**Profile: service / backend** — long-running services, APIs, anything with a datastore or external callers.
- Tests are required: cover new behavior; for a bug, first add a test that reproduces it, then make it pass.
- Validate and normalize every input crossing the trust boundary; never trust client-supplied values.
- **Data integrity & concurrency**: batch node writes go through `repo.ts` inside a transaction; Save Today is serialized by an in-process lock and is idempotent per day; upload idempotency rests on `client_uuid` (health: deterministic per-date uuid).

### Session Handoff
- `notice.md` files are scoped by directory and record durable handoff information for the next agent.
- At the start of a task, read the relevant `notice.md` files (the root one and those in the directories you'll work in) before making changes.
- Root `notice.md` records global, cross-package, or cross-task project information.
- App/package notices record durable facts for that app/package: architecture, contracts, workflows, credentials, known limitations, and package-specific gotchas.
- Update the relevant `notice.md` only when the session creates or discovers information that remains useful beyond the current task or conversation. Do not record pure Q&A, routine progress, temporary decisions, or workflow session/journal details there.
- Ensure any `notice.md` you touch remains accurate and up-to-date within its directory scope.

### End-of-Session Summary
- At the end of each conversation, output a brief summary in 中文 (Chinese). This summary is user-facing.
  ```
  ## Summary
  - **Done**: work completed this round
  - **Key decisions**: tag each [user] or [self], explain the decision
  - **Commits**: list this round's commits (hash, message, files); note any dirty files left out and why
  - **Open/known risks**: issues introduced or discovered this round (omit if none)
  - **Suggested next steps**: 1-3 concrete actionable items
  ```
