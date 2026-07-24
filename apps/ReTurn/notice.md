# apps/ReTurn — Agent Notice

- SwiftUI multiplatform Xcode project (deployment targets iOS 17.0 / macOS 14.0). Built with Xcode 26; system components auto-adopt Liquid Glass on OS 26 and auto-fallback on older OSes. Demo is only ever verified on OS 26. Avoid OS-26-only APIs by default; the explicitly approved exception is the composer surface, which uses one localized `#available` branch for native Liquid Glass and standard Material fallback. visionOS removed. macOS App Sandbox is OFF per PRD §6.1 (sandbox without outgoing-network entitlement blocks LAN access to Pi/sampler).
- `project.pbxproj` uses synchronized folder groups: any file added under `ReTurn/` / `ReTurnTests/` is picked up automatically — never hand-edit the pbxproj to add files.

## Models.swift (shared-contract mirror)

- Mirror basis: `origin/feat/global-search` @ `809ec73` (PR #8 — the designated v0.6 API authority; PR #16 was abandoned in its favor). PR #8 is merged to main; keep future `packages/shared` contract changes synchronized here in the same commit (AGENTS.md contract rule).
- Decode/encode ONLY via `ReTurnAPI.makeDecoder()/makeEncoder()` — snake_case conversion lives in the coder strategy; models deliberately have no per-field CodingKeys.
- Enum policy: all mirrored string enums are tolerant (`TolerantEnum`) — unknown raw values decode to a fallback, never throw. Backend keeps growing `NodeKind` (open PRs add `email`, `vscode_recent`, `browse_history`), so strict enums would crash old builds on new server data.
- Card `content` is loose JSON in the contract; the mirror decodes it into typed per-`type` structs (shapes taken from what `services/save.ts` / `services/chat.ts` actually write on the mirror basis) with a `.raw` fallback on unknown type or shape drift. If backend tightens/changes card content, update `BriefingCardContent` & co. and `ModelsTests`.
- IDs and timestamps are plain `String` (server stamps `created_at`; parse display dates via `ReTurnAPI.parseDate`). `client_uuid` is the idempotency key — never regenerate on retry.

## APIClient.swift

- Transport only: typed async methods over URLSession for every Pi endpoint (port 8787). No caching, no outbox, no retries — those belong in the stores (PRD §5.2). LLM-backed calls (save/chat/ask/resume/voice/intent) use a 180 s per-request timeout; plain reads use the URLSession default.
- Health upload sends the fixed token as `x-return-token`. Fastify error bodies (`{statusCode, error, message}`) surface as `APIError.http`.
- Networking config lives in `apps/ReTurn/Info.plist` (deliberately OUTSIDE the synchronized `ReTurn/` folder — inside it, the sync group copies it into Copy Bundle Resources and Xcode warns). It merges with `GENERATE_INFOPLIST_FILE=YES` via `INFOPLIST_FILE=Info.plist` and carries `NSAppTransportSecurity.NSAllowsLocalNetworking` (scoped, NOT arbitrary loads) plus iOS `NSLocalNetworkUsageDescription`. Add future plist keys here, not as INFOPLIST_KEY_ build settings for dict-valued keys.

## Main timeline UI

- `ContentView` is a horizontal Before / Now / After pager, defaulting to Now. Its segmented `Picker` and swipe position share one `TimelinePage` selection.
- The initial Now visual follows Figma file `ilZuF3hqB1HH7f1usiMmPM`, node `7:1182`. Shared HIG colors, spacing, semantic typography, and adaptive layout rules live in `DesignTokens.swift`; do not scatter replacement literals through views.
- Timeline chrome uses the available container width with compact-screen insets and readable iPad/macOS caps. The composer expands with a spring animation while focused; preserve this responsive behavior instead of restoring device-specific widths.
- On iOS/macOS 26, the composer surface uses the native interactive `glassEffect`; do not add manual highlight, glow, or shadow overlays on top. Older systems retain the standard Material fallback.
- `Kongkong.imageset` is the exact vector exported by Figma. Keep the asset rather than redrawing the mascot in SwiftUI.
