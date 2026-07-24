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
 * Dates are best-effort ISO; missing optional props become null.
 */
const REMINDERS_JXA = `
function iso(d) {
  if (d === undefined || d === null) return null;
  try {
    var t = new Date(d).getTime();
    if (isNaN(t)) return null;
    return new Date(t).toISOString();
  } catch (e) {
    return null;
  }
}
function run() {
  var app = Application("Reminders");
  var items = [];
  var lists = app.lists();
  for (var i = 0; i < lists.length; i++) {
    var L = lists[i];
    var listName = "";
    try { listName = String(L.name()); } catch (e) { listName = ""; }
    var reminders;
    try { reminders = L.reminders(); } catch (e) { continue; }
    for (var j = 0; j < reminders.length; j++) {
      var R = reminders[j];
      var rid = "";
      try { rid = String(R.id()); } catch (e) { rid = ""; }
      var rname = "";
      try { rname = String(R.name()); } catch (e) { rname = ""; }
      var rbody = null;
      try {
        var b = R.body();
        if (b !== undefined && b !== null && String(b).length > 0) rbody = String(b);
      } catch (e) {}
      var rdone = false;
      try { rdone = Boolean(R.completed()); } catch (e) {}
      var rdue = null;
      try { rdue = iso(R.dueDate()); } catch (e) {}
      var rcreated = null;
      try { rcreated = iso(R.creationDate()); } catch (e) {}
      var rmod = null;
      try { rmod = iso(R.modificationDate()); } catch (e) {}
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

/** Best-effort: accept ISO / Date.parse-able strings; null otherwise. */
export function parseMaybeIso(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  const s = String(raw).trim();
  if (!s) return null;
  const ms = Date.parse(s);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString();
}

function normalizeItem(raw: unknown): ReminderItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id.trim() : "";
  if (!id) return null;

  const list = typeof o.list === "string" ? o.list : "";
  const name = typeof o.name === "string" ? o.name : "";

  const creationDate = parseMaybeIso(o.creationDate);
  const modificationDate = parseMaybeIso(o.modificationDate);
  const due = parseMaybeIso(o.due);

  let body: string | null = null;
  if (typeof o.body === "string" && o.body.length > 0) body = o.body;

  const completed =
    o.completed === true ||
    o.completed === 1 ||
    o.completed === "true" ||
    o.completed === "yes";

  return {
    id,
    list,
    name,
    body,
    completed,
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
  const items: ReminderItem[] = [];
  for (const row of data) {
    const item = normalizeItem(row);
    if (item) items.push(item);
  }
  return items;
}

/** Run osascript JXA against Reminders. Non-darwin callers must gate first. */
export async function collectReminders(): Promise<ReminderItem[]> {
  const { stdout } = await execFileAsync(
    "osascript",
    ["-l", "JavaScript", "-e", REMINDERS_JXA],
    { timeout: OSASCRIPT_TIMEOUT_MS, maxBuffer: OSASCRIPT_MAX_BUFFER },
  );
  return parseRemindersOutput(String(stdout));
}
