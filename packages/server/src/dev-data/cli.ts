import "dotenv/config";

import { existsSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { openDb } from "../db/schema.js";
import { clearData, generateMockData, inspectData } from "./index.js";

interface CliOptions {
  command: "mock" | "clear" | "inspect";
  dbPath: string;
  days: number;
  endDate?: string;
  date?: string;
  kind?: string;
  limit: number;
  confirm: boolean;
  json: boolean;
}

const VALUE_OPTIONS = new Set(["--db", "--days", "--end", "--date", "--kind", "--limit"]);

export function parseArgs(argv: string[]): CliOptions {
  const command = argv[0];
  if (command !== "mock" && command !== "clear" && command !== "inspect") {
    throw new Error("command must be mock, clear, or inspect");
  }

  const values = new Map<string, string>();
  const flags = new Set<string>();
  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === "--confirm" || arg === "--json") {
      flags.add(arg);
      continue;
    }
    if (!arg.startsWith("--")) throw new Error(`unexpected argument: ${arg}`);
    if (!VALUE_OPTIONS.has(arg)) throw new Error(`unknown option: ${arg}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`${arg} requires a value`);
    values.set(arg, value);
    index += 1;
  }

  const dataDir = resolve(process.env.DATA_DIR?.trim() || "./data");
  const dbPath = resolve(values.get("--db") ?? join(dataDir, "return.db"));
  return {
    command,
    dbPath,
    days: integerOption(values.get("--days"), 14, "days"),
    endDate: values.get("--end"),
    date: values.get("--date"),
    kind: values.get("--kind"),
    limit: integerOption(values.get("--limit"), 20, "limit"),
    confirm: flags.has("--confirm"),
    json: flags.has("--json"),
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const options = parseArgs(argv);
  if (options.command !== "mock" && !existsSync(options.dbPath)) {
    throw new Error(`database does not exist: ${options.dbPath}`);
  }
  if (options.command === "clear" && !options.confirm) {
    throw new Error(
      `refusing to clear ${options.dbPath}; rerun with --confirm after checking the path`,
    );
  }

  const db = openDb(dirname(options.dbPath), basename(options.dbPath));
  try {
    if (options.command === "mock") {
      const result = generateMockData(db, {
        days: options.days,
        endDate: options.endDate,
      });
      print(options.json, {
        database: options.dbPath,
        action: "mock",
        ...result,
      });
      return;
    }

    if (options.command === "clear") {
      const deleted = clearData(db);
      print(options.json, { database: options.dbPath, action: "clear", deleted });
      return;
    }

    const result = inspectData(db, {
      date: options.date,
      kind: options.kind,
      limit: options.limit,
    });
    if (options.json) {
      print(true, { database: options.dbPath, ...result });
    } else {
      console.log(`Database: ${options.dbPath}`);
      console.log("\nCounts");
      console.table(result.counts);
      console.log("\nRecent days");
      console.table(result.days);
      console.log("\nNodes");
      console.table(result.nodes);
    }
  } finally {
    db.close();
  }
}

function integerOption(
  value: string | undefined,
  fallback: number,
  name: string,
): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer`);
  return parsed;
}

function print(json: boolean, value: unknown): void {
  if (json) {
    console.log(JSON.stringify(value, null, 2));
  } else {
    console.log(value);
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : "";
if (import.meta.url === invokedPath) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
