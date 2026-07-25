/**
 * Query / index text preprocessing for FTS5 bigram search.
 * Continuous CJK → overlapping bigrams; Latin words kept lowercased.
 * Do NOT use trigram — 2-char Chinese queries miss (global-search PRD §3).
 */

const CJK_RE = /[㐀-鿿豈-﫿]/;
const LATIN_WORD_RE = /[a-z0-9][a-z0-9_+./#@-]*/i;
const DATE_RE = /\b(\d{4}-\d{2}-\d{2})\b/;
const N_DAYS_AGO_RE = /(\d+)\s*天前/;

export interface ParsedQuery {
  /** Remaining text after stripping time phrases (original, not bigrammed). */
  text: string;
  /** Bigram-tokenized MATCH query (AND of tokens), empty if no text left. */
  matchQuery: string;
  from: string | null;
  to: string | null;
}

/** Normalize free text into space-separated FTS tokens (CJK bigrams + latin words). */
export function toSearchTokens(input: string): string[] {
  if (!input) return [];
  const tokens: string[] = [];
  let i = 0;
  const s = input;

  while (i < s.length) {
    const ch = s[i]!;

    if (CJK_RE.test(ch)) {
      let j = i;
      while (j < s.length && CJK_RE.test(s[j]!)) j++;
      const run = s.slice(i, j);
      if (run.length === 1) {
        tokens.push(run);
      } else {
        for (let k = 0; k < run.length - 1; k++) {
          tokens.push(run.slice(k, k + 2));
        }
      }
      i = j;
      continue;
    }

    if (/[a-z0-9]/i.test(ch)) {
      const rest = s.slice(i);
      const m = rest.match(LATIN_WORD_RE);
      if (m) {
        tokens.push(m[0]!.toLowerCase());
        i += m[0]!.length;
        continue;
      }
    }

    i += 1;
  }

  return tokens;
}

/** Space-joined tokens for FTS5 index column. */
export function toSearchText(input: string): string {
  return toSearchTokens(input).join(" ");
}

/**
 * Build FTS5 MATCH expression: each token as a phrase, AND-combined.
 * Empty input → empty string (caller should skip MATCH).
 */
export function toMatchQuery(input: string): string {
  const tokens = toSearchTokens(input);
  if (tokens.length === 0) return "";
  // Quote each token so operators inside latin words don't break MATCH.
  return tokens.map((t) => `"${t.replace(/"/g, "")}"`).join(" AND ");
}

/**
 * Parse user query: strip known time phrases into from/to, leave residual text.
 * Explicit from/to args (if provided) override phrase-derived range (union narrow).
 */
export function parseSearchQuery(
  raw: string,
  opts?: { from?: string; to?: string; now?: Date },
): ParsedQuery {
  const now = opts?.now ?? new Date();
  let text = raw.trim();
  let from: string | null = opts?.from ?? null;
  let to: string | null = opts?.to ?? null;

  const applyRange = (f: string, t: string) => {
    from = from == null ? f : from > f ? from : f;
    to = to == null ? t : to < t ? to : t;
  };

  // Explicit ISO date in query (keep it as keyword too if residual empty later).
  const dateMatch = text.match(DATE_RE);
  if (dateMatch && from == null && to == null) {
    const d = dateMatch[1]!;
    applyRange(d, d);
    text = text.replace(dateMatch[0]!, " ").trim();
  }

  const phraseRules: Array<{ re: RegExp; range: () => [string, string] }> = [
    {
      re: /今天/g,
      range: () => {
        const d = formatLocalDate(now);
        return [d, d];
      },
    },
    {
      re: /昨天/g,
      range: () => {
        const d = addLocalDays(now, -1);
        return [d, d];
      },
    },
    {
      re: /前天/g,
      range: () => {
        const d = addLocalDays(now, -2);
        return [d, d];
      },
    },
    {
      re: /本周/g,
      range: () => weekRange(now, 0),
    },
    {
      re: /上周/g,
      range: () => weekRange(now, -1),
    },
  ];

  for (const rule of phraseRules) {
    if (rule.re.test(text)) {
      rule.re.lastIndex = 0;
      const [f, t] = rule.range();
      applyRange(f, t);
      text = text.replace(rule.re, " ").trim();
    }
  }

  const nAgo = text.match(N_DAYS_AGO_RE);
  if (nAgo) {
    const n = Number(nAgo[1]);
    if (Number.isFinite(n) && n >= 0 && n < 3650) {
      const d = addLocalDays(now, -n);
      applyRange(d, d);
      text = text.replace(nAgo[0]!, " ").trim();
    }
  }

  text = text.replace(/\s+/g, " ").trim();
  return {
    text,
    matchQuery: toMatchQuery(text),
    from,
    to,
  };
}

function formatLocalDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addLocalDays(d: Date, delta: number): string {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + delta);
  return formatLocalDate(x);
}

/** Monday-start local week; weekOffset 0 = this week, -1 = last week. */
function weekRange(now: Date, weekOffset: number): [string, string] {
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + mondayOffset + weekOffset * 7,
  );
  const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return [formatLocalDate(monday), formatLocalDate(sunday)];
}
