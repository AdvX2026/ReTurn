# apps/ReTurn — Agent Notice

- SwiftUI multiplatform Xcode project (deployment targets iOS 17.0 / macOS 14.0). Built with Xcode 26; system components auto-adopt Liquid Glass on OS 26 and auto-fallback on older OSes. Demo is only ever verified on OS 26 — do not use OS-26-only APIs (no `#available` branches wanted). visionOS removed. macOS App Sandbox is OFF per PRD §6.1 (sandbox without outgoing-network entitlement blocks LAN access to Pi/sampler).
- `project.pbxproj` uses synchronized folder groups: any file added under `ReTurn/` / `ReTurnTests/` is picked up automatically — never hand-edit the pbxproj to add files.

## Models.swift (shared-contract mirror)

- Mirror basis: `origin/feat/global-search` @ `809ec73` (PR #8 — the designated v0.6 API authority; PR #16 was abandoned in its favor). PR #8 is NOT yet merged to main; when it merges, diff `packages/shared/src/{api,domain}.ts` against this basis and sync here in the same commit (AGENTS.md contract rule).
- Decode/encode ONLY via `ReTurnAPI.makeDecoder()/makeEncoder()` — snake_case conversion lives in the coder strategy; models deliberately have no per-field CodingKeys.
- Enum policy: all mirrored string enums are tolerant (`TolerantEnum`) — unknown raw values decode to a fallback, never throw. Backend keeps growing `NodeKind` (open PRs add `email`, `vscode_recent`, `browse_history`), so strict enums would crash old builds on new server data.
- Card `content` is loose JSON in the contract; the mirror decodes it into typed per-`type` structs (shapes taken from what `services/save.ts` / `services/chat.ts` actually write on the mirror basis) with a `.raw` fallback on unknown type or shape drift. If backend tightens/changes card content, update `BriefingCardContent` & co. and `ModelsTests`.
- IDs and timestamps are plain `String` (server stamps `created_at`; parse display dates via `ReTurnAPI.parseDate`). `client_uuid` is the idempotency key — never regenerate on retry.

## APIClient.swift

- Transport only: typed async methods over URLSession for every Pi endpoint (port 8787). No caching, no outbox, no retries — those belong in the stores (PRD §5.2). LLM-backed calls (save/chat/ask/resume/voice/intent) use a 180 s per-request timeout; plain reads use the URLSession default.
- Health upload sends the fixed token as `x-return-token`. Fastify error bodies (`{statusCode, error, message}`) surface as `APIError.http`.
- KNOWN GAP: no ATS/local-network config yet — plain-HTTP LAN calls will be blocked at runtime until Info.plist gets `NSAllowsLocalNetworking` (+ iOS `NSLocalNetworkUsageDescription`); targets currently use `GENERATE_INFOPLIST_FILE=YES` with no overrides. Do this before the first live connection to the Pi.
