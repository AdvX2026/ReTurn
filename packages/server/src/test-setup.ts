/**
 * Loaded via `node --import` BEFORE any app modules so config snapshots are correct.
 * - HEALTH_TOKEN: required for /api/health smoke (no weak default in app config)
 * - LLM keys cleared so unit/smoke never hit a real provider (Codex P2)
 */
if (!process.env.HEALTH_TOKEN) {
  process.env.HEALTH_TOKEN = "test-health-token";
}
delete process.env.LLM_API_KEY;
delete process.env.WHISPER_API_KEY;
