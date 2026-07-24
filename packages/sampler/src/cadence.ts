/**
 * Sampler rhythm from Pi cadence (PRD F2).
 * active = daytime interval; night = post-Save low frequency.
 */
import type { CadenceMode } from "@return/shared";
import { config } from "./config.js";

export function intervalMinForCadence(
  cadence: CadenceMode,
  intervals: {
    active: number;
    night: number;
  } = {
    active: config.sampleIntervalMin,
    night: config.sampleIntervalNightMin,
  },
): number {
  const min = cadence === "night" ? intervals.night : intervals.active;
  return Math.max(1, min);
}
