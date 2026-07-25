/**
 * Apple Reminders collect helpers.
 *
 * Read-only JXA dump of all lists → pure parse → ReminderItem[].
 * Never writes to Reminders.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const OSASCRIPT_TIMEOUT_MS = 20_000;
const OSASCRIPT_MAX_BUFFER = 4 * 1024 * 1024;

export interface ReminderItem {
  /** Stable id from Reminders. */
  id: string;
  list: string;
  name: string;
  body: string | null;
  completed: boolean;
  due: string | null;
  creationDate: string | null;
  modificationDate: string | null;
}

/**
 * JXA: dump every reminder in every list as a JSON array.
 * Missing optional dates/body become null; malformed values fail the source.
 */
const REMINDERS_JXA = `
function iso(d) {
  if (d === undefined || d === null) return null;
  var t = new Date(d).getTime();
  if (isNaN(t)) throw new Error("invalid reminder date");
  return new Date(t).toISOString();
}
function run() {
  var app = Application("Reminders");
  var items = [];
  var lists = app.lists();
  for (var i = 0; i < lists.length; i++) {
    var L = lists[i];
    var listName = String(L.name());
    var reminders = L.reminders();
    for (var j = 0; j < reminders.length; j++) {
      var R = reminders[j];
      var rid = String(R.id());
      if (!rid) throw new Error("reminder is missing a stable id");
      var rname = String(R.name());
      var rbody = null;
      var b = R.body();
      if (b !== undefined && b !== null && String(b).length > 0) rbody = String(b);
      var rdone = Boolean(R.completed());
      var rdue = iso(R.dueDate());
      var rcreated = iso(R.creationDate());
      var rmod = iso(R.modificationDate());
      items.push({
        id: rid,
        list: listName,
        name: rname,
        body: rbody,
        completed: rdone,
        due: rdue,
        creationDate: rcreated,
        modificationDate: rmod
      });
    }
  }
  return JSON.stringify(items);
}
`;

/** Normalize an optional date; malformed values are source errors. */
export function parseMaybeIso(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string" && typeof raw !== "number") {
    throw new Error("invalid reminder date: expected a string or number");
  }
  const s = String(raw).trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) throw new Error(`invalid reminder date: ${s}`);
  return new Date(ms).toISOString();
}

function normalizeItem(raw: unknown): ReminderItem {
  if (!raw || typeof raw !== "object") {
    throw new Error("invalid reminder item: expected an object");
  }
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) throw new Error("invalid reminder item: stable id is required");

  if (typeof o.list !== "string" || typeof o.name !== "string") {
    throw new Error("invalid reminder item: list and name must be strings");
  }
  const list = o.list;
  const name = o.name;

  const creationDate = parseMaybeIso(o.creationDate);
  const modificationDate = parseMaybeIso(o.modificationDate);
  const due = parseMaybeIso(o.due);

  if (o.body !== null && o.body !== undefined && typeof o.body !== "string") {
    throw new Error("invalid reminder item: body must be a string or null");
  }
  const body = typeof o.body === "string" && o.body.length > 0 ? o.body : null;
  if (typeof o.completed !== "boolean") {
    throw new Error("invalid reminder item: completed must be a boolean");
  }

  return {
    id,
    list,
    name,
    body,
    completed: o.completed,
    due,
    creationDate,
    modificationDate,
  };
}

/**
 * Pure parser for the JXA JSON dump (or a hand-written fixture array).
 */
export function parseRemindersOutput(raw: string): ReminderItem[] {
  const data: unknown = JSON.parse(raw);
  if (!Array.isArray(data)) {
    throw new Error("invalid Reminders payload: expected an array");
  }
  return data.map(normalizeItem);
}

/** Run osascript JXA against Reminders. Non-darwin callers must gate first. */
export async function collectReminders(): Promise<ReminderItem[]> {
  try {
    const { stdout } = await execFileAsync(
      "osascript",
      ["-l", "JavaScript", "-e", REMINDERS_JXA],
      { timeout: OSASCRIPT_TIMEOUT_MS, maxBuffer: OSASCRIPT_MAX_BUFFER },
    );
    return parseRemindersOutput(String(stdout));
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stderr?: string };
    const detail = failure.stderr?.trim();
    throw new Error(
      detail
        ? `Reminders access failed: ${detail}`
        : `Reminders osascript failed${failure.code ? ` (${failure.code})` : ""}`,
      { cause: error },
    );
  }
}
