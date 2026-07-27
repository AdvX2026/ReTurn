# ReTurn Windows Client

Planned native Windows client for ReTurn. It will provide the same core Before / Now / After, Input, Task, Save, Resume, and timeline experience as the Apple client, except for Apple-only integrations such as HealthKit and Reminders.

The UI and sampler remain separate processes. Windows uses the shared `@return/sampler` runtime from `packages/sampler`; Windows-specific collection and service-installation adapters belong in that package, not in this client directory.

The Windows UI framework has not been selected. Do not scaffold a framework or add dependencies until that decision is explicitly approved.
