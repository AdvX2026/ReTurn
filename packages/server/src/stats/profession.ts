import type { Profession, Session } from "@return/shared";

/** Coarse work-role buckets used only for profession mapping. */
export type WorkBucket = "dev" | "design" | "writing" | "social" | "browser" | "other";

/**
 * Map an app/session label to a work bucket (mirrors timeline categories).
 */
export function workBucket(label: string, sessionKind?: string): WorkBucket {
  if (sessionKind === "agent") return "dev";
  if (/code|cursor|vscode|xcode|terminal|iterm|warp|claude|codex|git/i.test(label)) {
    return "dev";
  }
  if (/figma|sketch|photoshop|illustrator|canva|affinity/i.test(label)) {
    return "design";
  }
  if (/notes|obsidian|notion|bear|craft|typora|pages|word|docs/i.test(label)) {
    return "writing";
  }
  if (/slack|discord|telegram|messages|mail|outlook|wechat|qq|teams/i.test(label)) {
    return "social";
  }
  if (/chrome|safari|firefox|edge|arc|brave/i.test(label)) {
    return "browser";
  }
  return "other";
}

/**
 * Deterministic profession from session time + output signals (PRD drift §5.C).
 * Not LLM. Unknown future professions stay client-tolerant via enum fallback.
 */
export function resolveProfession(input: {
  sessions: Session[];
  gitCommitCount: number;
  agentDurationMin: number;
}): Profession {
  const minutes: Record<WorkBucket, number> = {
    dev: 0,
    design: 0,
    writing: 0,
    social: 0,
    browser: 0,
    other: 0,
  };

  for (const s of input.sessions) {
    const bucket = workBucket(s.app, s.kind);
    minutes[bucket] += s.durationMin;
  }

  // Output signals boost coding even when UI sampling under-counts agent work.
  if (input.gitCommitCount > 0 || input.agentDurationMin >= 30) {
    minutes.dev += Math.max(input.agentDurationMin, input.gitCommitCount * 15);
  }

  const total = Object.values(minutes).reduce((a, b) => a + b, 0);
  if (total < 15) return "generalist";

  let top: WorkBucket = "other";
  let topMin = 0;
  for (const [bucket, min] of Object.entries(minutes) as Array<[WorkBucket, number]>) {
    if (min > topMin) {
      topMin = min;
      top = bucket;
    }
  }

  // Require a clear plurality (≥35% of tracked time).
  if (topMin / total < 0.35) return "generalist";

  switch (top) {
    case "dev":
      return "coder";
    case "design":
      return "designer";
    case "writing":
      return "writer";
    case "social":
      return "communicator";
    case "browser":
      return "explorer";
    default:
      return "generalist";
  }
}
