import { createHash } from "node:crypto";

/**
 * Deterministic UUIDv4-shaped id from an arbitrary seed.
 * Used for health-date and agent-session idempotency (client_uuid).
 */
export function uuidFromSeed(seed: string): string {
  const hex = createHash("sha256").update(seed).digest("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    `4${hex.slice(13, 16)}`,
    ((Number.parseInt(hex.slice(16, 18), 16) & 0x3f) | 0x80)
      .toString(16)
      .padStart(2, "0") + hex.slice(18, 20),
    hex.slice(20, 32),
  ].join("-");
}
