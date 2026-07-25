/**
 * Ranking coefficients for hybrid search (global-search PRD §7.3).
 * All knobs live here for T+40h-style tuning.
 */

/** RRF constant k (standard 60). */
export const RRF_K = 60;

/** Half-life in days for exponential time decay: 0.5 ** (days_ago / HALF_LIFE). */
export const TIME_DECAY_HALF_LIFE_DAYS = 30;

/**
 * Kind → weight. Active feeds & day summaries lead;
 * samples trail so "评审" doesn't surface ten random tabs first.
 */
export const KIND_WEIGHTS: Readonly<Record<string, number>> = {
  text: 1.0,
  url: 1.0,
  voice: 1.0,
  save_note: 1.0,
  idea: 1.0,
  image: 0.9,
  day_summary: 1.0,
  git_commit: 0.7,
  agent_session: 0.7,
  todo_check: 0.5,
  reminder: 0.6,
  tab_sample: 0.3,
  app_sample: 0.1,
  snapshot: 0.1,
  health_daily: 0.1,
};

export function kindWeight(kind: string): number {
  return KIND_WEIGHTS[kind] ?? 0.5;
}

/** days_ago = 0 → 1; half-life 30d → 0.5. */
export function timeDecay(daysAgo: number, halfLife = TIME_DECAY_HALF_LIFE_DAYS): number {
  if (daysAgo <= 0) return 1;
  return 0.5 ** (daysAgo / halfLife);
}

/**
 * Reciprocal Rank Fusion over 1-based ranks.
 * A channel without a rank contributes zero to the fused score.
 */
export function rrfScore(
  keywordRank: number | null,
  semanticRank: number | null,
  k = RRF_K,
): number {
  let s = 0;
  if (keywordRank != null && keywordRank > 0) s += 1 / (k + keywordRank);
  if (semanticRank != null && semanticRank > 0) s += 1 / (k + semanticRank);
  return s;
}

export function finalScore(opts: {
  keywordRank: number | null;
  semanticRank: number | null;
  daysAgo: number;
  kind: string;
}): number {
  return (
    rrfScore(opts.keywordRank, opts.semanticRank) *
    timeDecay(opts.daysAgo) *
    kindWeight(opts.kind)
  );
}

/** Calendar-day difference (a - b) in whole days using YYYY-MM-DD. */
export function daysBetween(later: string, earlier: string): number {
  const [ly, lm, ld] = later.split("-").map(Number);
  const [ey, em, ed] = earlier.split("-").map(Number);
  if (!ly || !lm || !ld || !ey || !em || !ed) return 0;
  const l = Date.UTC(ly, lm - 1, ld);
  const e = Date.UTC(ey, em - 1, ed);
  return Math.round((l - e) / 86_400_000);
}
