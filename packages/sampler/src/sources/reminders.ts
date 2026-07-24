/**
 * Apple Reminders SampleSource.
 *
 * Read-only dump of all lists → reminder nodes. Positive-sample source for
 * the todo preference loop (PRD §6.3). Silent on non-darwin / disabled /
 * osascript failure. Never writes to Reminders.
 *
 * client_uuid seed includes completed flag so incomplete→complete emits a
 * new node (server is insert-only on client_uuid).
 */
import type { NodeInput } from "@return/shared";
import { type ReminderItem, collectReminders } from "../collect-reminders.js";
import { config } from "../config.js";
import {
  type KeyDedupe,
  type SampleContext,
  type SampleSource,
  type SourceResult,
  createKeyDedupe,
  todayLocal,
  uuidFromSeed,
} from "../source.js";

const seen: KeyDedupe = createKeyDedupe();

/** Test helper: clear in-process reminder dedupe (simulates process restart). */
export function resetSeenReminderKeys(): void {
  seen.clear();
}

/** Stable seed — includes completed so state flip produces a new uuid. */
export function reminderSeed(item: Pick<ReminderItem, "id" | "completed">): string {
  return `reminder:${item.id}:${item.completed ? 1 : 0}`;
}

export function remindersToNodes(
  items: ReminderItem[],
  opts: { at: string; dedupe?: KeyDedupe } = { at: new Date().toISOString() },
): NodeInput[] {
  const dedupe = opts.dedupe ?? seen;
  const nodes: NodeInput[] = [];
  const date = todayLocal();

  for (const item of items) {
    const seed = reminderSeed(item);
    if (!dedupe.tryAdd(seed)) continue;

    const title =
      item.name.length > 500 ? item.name.slice(0, 500) : item.name || "(untitled)";
    const createdAt = item.modificationDate || item.creationDate || opts.at;

    nodes.push({
      client_uuid: uuidFromSeed(seed),
      kind: "reminder",
      title,
      content: item.body,
      source_meta: {
        list: item.list,
        completed: item.completed,
        due: item.due,
        reminder_id: item.id,
        creation_date: item.creationDate,
        modification_date: item.modificationDate,
      },
      client_created_at: createdAt,
      // Current-state snapshot for preference loop — bucket by sample day.
      date,
    });
  }
  return nodes;
}

export const remindersSource: SampleSource = {
  id: "reminders",
  async sample(ctx: SampleContext): Promise<SourceResult> {
    if (ctx.platform !== "darwin" || !config.remindersEnabled) {
      return { nodes: [], stats: { skipped: 1, items: 0, emitted: 0 } };
    }

    const items = await collectReminders().catch(() => [] as ReminderItem[]);
    const nodes = remindersToNodes(items, { at: ctx.at });
    return {
      nodes,
      stats: {
        items: items.length,
        emitted: nodes.length,
      },
    };
  },
};
