import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import {
  type ReminderItem,
  parseMaybeIso,
  parseRemindersOutput,
} from "./collect-reminders.js";
import { uuidFromSeed } from "./source.js";
import {
  reminderSeed,
  remindersToNodes,
  resetSeenReminderKeys,
} from "./sources/reminders.js";

const FIXTURE_JSON = JSON.stringify([
  {
    id: "x-apple-reminder://ABC-123",
    list: "Work",
    name: "Ship sampler",
    body: "include completed flag in uuid",
    completed: false,
    due: "2026-07-25T09:00:00.000Z",
    creationDate: "2026-07-20T01:00:00.000Z",
    modificationDate: "2026-07-24T03:00:00.000Z",
  },
  {
    id: "x-apple-reminder://DEF-456",
    list: "Personal",
    name: "Buy milk",
    body: null,
    completed: true,
    due: null,
    creationDate: "2026-07-21T12:00:00.000Z",
    modificationDate: "2026-07-22T12:00:00.000Z",
  },
  {
    // missing id → hash fallback
    list: "Inbox",
    name: "No id item",
    body: "",
    completed: false,
    due: "not-a-date",
    creationDate: "2026-07-23T00:00:00.000Z",
    modificationDate: null,
  },
]);

describe("parseRemindersOutput", () => {
  it("parses fixture JSON into ReminderItem fields", () => {
    const items = parseRemindersOutput(FIXTURE_JSON);
    assert.equal(items.length, 3);

    assert.equal(items[0]!.id, "x-apple-reminder://ABC-123");
    assert.equal(items[0]!.list, "Work");
    assert.equal(items[0]!.name, "Ship sampler");
    assert.equal(items[0]!.body, "include completed flag in uuid");
    assert.equal(items[0]!.completed, false);
    assert.equal(items[0]!.due, "2026-07-25T09:00:00.000Z");
    assert.equal(items[0]!.creationDate, "2026-07-20T01:00:00.000Z");
    assert.equal(items[0]!.modificationDate, "2026-07-24T03:00:00.000Z");

    assert.equal(items[1]!.completed, true);
    assert.equal(items[1]!.body, null);
    assert.equal(items[1]!.due, null);

    // fallback id is stable non-empty hash
    assert.ok(items[2]!.id.length >= 16);
    assert.equal(items[2]!.due, null); // garbage date dropped
    assert.equal(items[2]!.body, null); // empty string → null
  });

  it("returns empty for empty or garbage input", () => {
    assert.deepEqual(parseRemindersOutput(""), []);
    assert.deepEqual(parseRemindersOutput("   \n  "), []);
    assert.deepEqual(parseRemindersOutput("not json"), []);
    assert.deepEqual(parseRemindersOutput("{}"), []);
    assert.deepEqual(parseRemindersOutput("null"), []);
  });

  it("accepts completed as string/number truthy forms", () => {
    const items = parseRemindersOutput(
      JSON.stringify([
        { id: "1", list: "L", name: "a", completed: "true" },
        { id: "2", list: "L", name: "b", completed: 1 },
        { id: "3", list: "L", name: "c", completed: "yes" },
        { id: "4", list: "L", name: "d", completed: false },
      ]),
    );
    assert.equal(items.map((i) => i.completed).join(","), "true,true,true,false");
  });
});

describe("parseMaybeIso", () => {
  it("normalizes parseable dates to Z ISO; null on failure", () => {
    assert.equal(parseMaybeIso("2026-07-24T10:00:00+08:00"), "2026-07-24T02:00:00.000Z");
    assert.equal(parseMaybeIso("2026-07-24T02:00:00.000Z"), "2026-07-24T02:00:00.000Z");
    assert.equal(parseMaybeIso(""), null);
    assert.equal(parseMaybeIso(null), null);
    assert.equal(parseMaybeIso("not-a-date"), null);
    assert.equal(parseMaybeIso("due date missing"), null);
  });
});

describe("reminders source emission", () => {
  const at = "2026-07-24T08:00:00.000Z";

  beforeEach(() => {
    resetSeenReminderKeys();
  });

  function item(
    partial: Partial<ReminderItem> & Pick<ReminderItem, "id" | "name">,
  ): ReminderItem {
    return {
      list: "Inbox",
      body: null,
      completed: false,
      due: null,
      creationDate: "2026-07-20T00:00:00.000Z",
      modificationDate: "2026-07-21T00:00:00.000Z",
      ...partial,
    };
  }

  it("maps items to reminder nodes with deterministic uuid", () => {
    const date = "2026-07-24";
    const nodes = remindersToNodes(
      [item({ id: "r1", name: "Task A", body: "notes", completed: false })],
      { at, date },
    );
    assert.equal(nodes.length, 1);
    const n = nodes[0]!;
    assert.equal(n.kind, "reminder");
    assert.equal(n.title, "Task A");
    assert.equal(n.content, "notes");
    assert.equal(n.client_uuid, uuidFromSeed("reminder:2026-07-24:r1:0"));
    assert.equal(n.date, date);
    assert.equal(n.client_created_at, "2026-07-21T00:00:00.000Z");
    assert.deepEqual(n.source_meta, {
      list: "Inbox",
      completed: false,
      due: null,
      reminder_id: "r1",
      creation_date: "2026-07-20T00:00:00.000Z",
      modification_date: "2026-07-21T00:00:00.000Z",
    });
  });

  it("completed flag changes uuid (positive-sample on complete)", () => {
    const date = "2026-07-24";
    const open = item({ id: "r1", name: "Task", completed: false });
    const done = item({ id: "r1", name: "Task", completed: true });
    assert.notEqual(reminderSeed(open, date), reminderSeed(done, date));
    assert.equal(reminderSeed(open, date), "reminder:2026-07-24:r1:0");
    assert.equal(reminderSeed(done, date), "reminder:2026-07-24:r1:1");

    const nOpen = remindersToNodes([open], { at, date })[0]!;
    resetSeenReminderKeys();
    const nDone = remindersToNodes([done], { at, date })[0]!;
    assert.notEqual(nOpen.client_uuid, nDone.client_uuid);
    assert.equal(nDone.client_uuid, uuidFromSeed("reminder:2026-07-24:r1:1"));
  });

  it("same open reminder re-emits on a new calendar day", () => {
    const items = [item({ id: "same", name: "once" })];
    const d1 = remindersToNodes(items, { at, date: "2026-07-24" });
    const d2 = remindersToNodes(items, { at, date: "2026-07-25" });
    assert.equal(d1.length, 1);
    assert.equal(d2.length, 1);
    assert.notEqual(d1[0]!.client_uuid, d2[0]!.client_uuid);
  });

  it("dedupes in-process; reset re-emits", () => {
    const items = [item({ id: "same", name: "once" })];
    const date = "2026-07-24";
    assert.equal(remindersToNodes(items, { at, date }).length, 1);
    assert.equal(remindersToNodes(items, { at, date }).length, 0);
    resetSeenReminderKeys();
    assert.equal(remindersToNodes(items, { at, date }).length, 1);
  });

  it("truncates title to 500 chars", () => {
    const long = "x".repeat(600);
    const n = remindersToNodes([item({ id: "long", name: long })], {
      at,
      date: "2026-07-24",
    })[0]!;
    assert.equal(n.title!.length, 500);
  });

  it("falls back client_created_at to sample tick when dates missing", () => {
    const n = remindersToNodes(
      [
        item({
          id: "nodate",
          name: "x",
          creationDate: null,
          modificationDate: null,
        }),
      ],
      { at, date: "2026-07-24" },
    )[0]!;
    assert.equal(n.client_created_at, at);
  });
});
