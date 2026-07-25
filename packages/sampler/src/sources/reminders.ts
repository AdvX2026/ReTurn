/**
 * Apple Reminders SampleSource.
 *
 * Read-only dump of all lists → reminder nodes. Positive-sample source for
 * the todo preference loop (PRD §6.3). Never writes to Reminders.
 *
 * client_uuid seed includes local date + completed so:
 * - incomplete→complete emits a new node (server insert-only on client_uuid)
 * - same open reminder re-snapshots each calendar day (daily completion rate)
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
  uuidFromSeed,
} from "../source.js";

const seen: KeyDedupe = createKeyDedupe();

/** Test helper: clear in-process reminder dedupe (simulates process restart). */
export function resetSeenReminderKeys(): void {
  seen.clear();
}

/**
 * Stable seed for one day-state of a reminder.
 * date keeps daily snapshots distinct under global client_uuid uniqueness.
 */
export function reminderSeed(
  item: Pick<ReminderItem, "id" | "completed">,
  date: string,
): string {
  return `reminder:${date}:${item.id}:${item.completed ? 1 : 0}`;
}

export function remindersToNodes(
  items: ReminderItem[],
  opts: { at: string; date: string; dedupe?: KeyDedupe },
): NodeInput[] {
  const dedupe = opts.dedupe ?? seen;
  const nodes: NodeInput[] = [];
  const date = opts.date;

  for (const item of items) {
    const seed = reminderSeed(item, date);
    if (!dedupe.tryAdd(seed)) continue;

    nodes.push({
      client_uuid: uuidFromSeed(seed),
      kind: "reminder",
      title: item.name ? item.name.slice(0, 500) : null,
      content: item.body,
      source_meta: {
        list: item.list,
        completed: item.completed,
        due: item.due,
        reminder_id: item.id,
        creation_date: item.creationDate,
        modification_date: item.modificationDate,
      },
      client_created_at: opts.at,
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

    const items = await collectReminders();
    const nodes = remindersToNodes(items, { at: ctx.at, date: ctx.day });
    return {
      nodes,
      stats: {
        items: items.length,
        emitted: nodes.length,
      },
    };
  },
};
