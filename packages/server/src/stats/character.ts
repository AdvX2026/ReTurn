import type { CharacterState, Stats } from "@return/shared";

/**
 * Priority order (PRD §4.2): first match wins.
 * 1 tired (energy < 40)
 * 2 productive (output ≥ 70)
 * 3 focused (focus ≥ 70)
 * 4 inspired (intake ≥ 70)
 * 5 normal
 */
export function resolveCharacterState(stats: Stats): CharacterState {
  if (stats.energy < 40) return "tired";
  if (stats.output >= 70) return "productive";
  if (stats.focus >= 70) return "focused";
  if (stats.intake >= 70) return "inspired";
  return "normal";
}
