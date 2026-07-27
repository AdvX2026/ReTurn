# clients/windows — Agent Notice

- This is the planned native Windows client. It is part of the formal product platform scope, but no UI framework has been selected or scaffolded yet.
- Target core capability is parity with the Apple client: Before / Now / After, Input, Task, Save, Resume, timeline, local outbox, and LAN communication with the Pi. Apple-only capabilities such as HealthKit and Reminders require platform-specific alternatives or remain unavailable.
- The UI never samples directly. It talks to the independent shared `@return/sampler` process through the hardcoded loopback control plane at `127.0.0.1:8791`.
- Cross-platform sampler runtime, outbox, Pi upload, source contracts, and platform adapters stay in `packages/sampler`; do not duplicate them under this directory.
- Pi SQLite remains the sole authoritative datastore. Preserve the original `client_uuid` across retries, and keep all LLM/transcription credentials on the Pi.
- Adding the Windows UI framework or third-party dependencies requires an explicit architecture decision and user approval.
