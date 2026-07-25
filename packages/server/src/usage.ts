import type { UsageKind, UsageResponse, UsageTotals } from "@return/shared";
import type { Db } from "./db/schema.js";
import { nowIso, todayDate, uuid } from "./util/time.js";

export interface ProviderUsage {
  kind: UsageKind;
  operation: string;
  model: string;
  status: "succeeded" | "failed";
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
}

export function recordProviderUsage(db: Db, input: ProviderUsage): void {
  const createdAt = nowIso();
  const promptTokens = normalizeTokens(input.prompt_tokens);
  const completionTokens = normalizeTokens(input.completion_tokens);
  const totalTokens = normalizeTokens(
    input.total_tokens ?? promptTokens + completionTokens,
  );
  db.prepare(
    `INSERT INTO llm_usage (
       id, date, kind, operation, model, status,
       prompt_tokens, completion_tokens, total_tokens, created_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    uuid(),
    todayDate(new Date(createdAt)),
    input.kind,
    input.operation,
    input.model,
    input.status,
    promptTokens,
    completionTokens,
    totalTokens,
    createdAt,
  );
}

export function getProviderUsage(db: Db, from: string, to: string): UsageResponse {
  const rows = db
    .prepare(
      `SELECT
         kind,
         operation,
         model,
         COUNT(*) AS calls,
         SUM(CASE WHEN status = 'succeeded' THEN 1 ELSE 0 END) AS succeeded,
         SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
         SUM(prompt_tokens) AS prompt_tokens,
         SUM(completion_tokens) AS completion_tokens,
         SUM(total_tokens) AS total_tokens
       FROM llm_usage
       WHERE date BETWEEN ? AND ?
       GROUP BY kind, operation, model
       ORDER BY kind, operation, model`,
    )
    .all(from, to) as Array<
    UsageTotals & {
      kind: UsageKind;
      operation: string;
      model: string;
    }
  >;

  const totals = rows.reduce<UsageTotals>(
    (sum, row) => ({
      calls: sum.calls + row.calls,
      succeeded: sum.succeeded + row.succeeded,
      failed: sum.failed + row.failed,
      prompt_tokens: sum.prompt_tokens + row.prompt_tokens,
      completion_tokens: sum.completion_tokens + row.completion_tokens,
      total_tokens: sum.total_tokens + row.total_tokens,
    }),
    emptyUsageTotals(),
  );

  return { from, to, totals, breakdown: rows };
}

function emptyUsageTotals(): UsageTotals {
  return {
    calls: 0,
    succeeded: 0,
    failed: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
  };
}

function normalizeTokens(value: number | undefined): number {
  if (value === undefined || !Number.isInteger(value) || value < 0) return 0;
  return value;
}
