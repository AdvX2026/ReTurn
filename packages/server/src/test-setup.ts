/**
 * Loaded via `node --import` before tests so config sees env.
 * Demo/prod must set HEALTH_TOKEN explicitly (no weak default).
 */
if (!process.env.HEALTH_TOKEN) {
  process.env.HEALTH_TOKEN = "test-health-token";
}
