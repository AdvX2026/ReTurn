/**
 * Snippet extraction on original text (not bigram index text).
 * FTS5 snippet() is unusable after bigram tokenization.
 */

const DEFAULT_RADIUS = 60;

/**
 * Find first case-insensitive occurrence of any query term / full query,
 * return a ±radius window. No hit → leading slice.
 */
export function extractSnippet(
  original: string,
  queryText: string,
  radius = DEFAULT_RADIUS,
): string {
  const src = original ?? "";
  if (!src) return "";

  const q = queryText.trim();
  if (!q) return clip(src, 0, radius * 2);

  const lower = src.toLowerCase();
  // Prefer full residual query, then individual whitespace tokens, then CJK chars ≥2.
  const candidates = unique([
    q,
    ...q.split(/\s+/).filter((t) => t.length >= 1),
    ...cjkRuns(q),
  ]);

  let hit = -1;
  let hitLen = 0;
  for (const c of candidates) {
    if (!c) continue;
    const idx = lower.indexOf(c.toLowerCase());
    if (idx >= 0) {
      hit = idx;
      hitLen = c.length;
      break;
    }
  }

  if (hit < 0) return clip(src, 0, radius * 2);

  const start = Math.max(0, hit - radius);
  const end = Math.min(src.length, hit + hitLen + radius);
  return clip(src, start, end - start, start > 0, end < src.length);
}

function clip(
  s: string,
  start: number,
  len: number,
  leadEllipsis = false,
  trailEllipsis = false,
): string {
  let out = s
    .slice(start, start + len)
    .replace(/\s+/g, " ")
    .trim();
  if (leadEllipsis) out = `…${out}`;
  if (trailEllipsis) out = `${out}…`;
  return out;
}

function cjkRuns(q: string): string[] {
  const runs = q.match(/[㐀-鿿豈-﫿]{2,}/g) ?? [];
  return runs;
}

function unique(xs: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of xs) {
    const k = x.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(x);
  }
  return out;
}
