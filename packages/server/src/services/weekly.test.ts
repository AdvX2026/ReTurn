import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import type { WeeklyCardContent } from "@return/shared";
import {
  ensureDay,
  getCardByTypeDate,
  insertCard,
  listCards,
  markDaySaved,
} from "../db/repo.js";
import { type Db, openMemoryDb } from "../db/schema.js";
import { addDays } from "../util/time.js";
import { saveToday } from "./save.js";
import {
  averageStats,
  shouldProduceWeekly,
  weekWindow,
} from "./weekly.js";

describe("weekly helpers", () => {
  let db: Db;

  beforeEach(() => {
    db = openMemoryDb();
  });

  it("weekWindow is 7 inclusive days ending on week_end", () => {
    assert.deepEqual(weekWindow("2026-07-26"), {
      week_start: "2026-07-20",
      week_end: "2026-07-26",
    });
  });

  it("shouldProduceWeekly on Sunday even with few saves", () => {
    // 2026-07-26 is a Sunday.
    assert.equal(shouldProduceWeekly(db, "2026-07-26"), true);
  });

  it("shouldProduceWeekly every 7th sealed day (non-Sunday)", () => {
    // Seal Mon–Sat 2026-07-13..18 (6 days). Next candidate Mon 2026-07-20 is not Sunday.
    for (let i = 0; i < 6; i++) {
      const date = addDays("2026-07-13", i);
      const day = ensureDay(db, date);
      markDaySaved(db, day.id, {
        saved_at: `${date}T12:00:00.000Z`,
        save_note_node_id: null,
        summary: `day ${date}`,
        opening_line: "hi",
        review_points: [],
        stats: {
          intake: 10,
          focus: 20,
          output: 30,
          continuity: 0,
          energy: 80,
        },
        character_state: "normal",
      });
    }
    // 6 sealed + today as 7th (Mon) → trigger
    assert.equal(shouldProduceWeekly(db, "2026-07-20"), true);
    // Mid-week with only 6 total including today would not hit (5 prior + Fri = 6)
    assert.equal(shouldProduceWeekly(db, "2026-07-17"), false);
  });

  it("shouldProduceWeekly is false once a weekly card exists for that end date", () => {
    insertCard(db, {
      type: "weekly",
      date: "2026-07-26",
      content: { summary: "already" },
    });
    assert.equal(shouldProduceWeekly(db, "2026-07-26"), false);
  });

  it("averageStats means sealed day stats", () => {
    const seal = (
      date: string,
      stats: {
        intake: number;
        focus: number;
        output: number;
        continuity: number;
        energy: number;
      },
    ) => {
      const day = ensureDay(db, date);
      markDaySaved(db, day.id, {
        saved_at: `${date}T12:00:00.000Z`,
        save_note_node_id: null,
        summary: date,
        opening_line: date,
        review_points: [],
        stats,
        character_state: "normal",
      });
    };
    seal("2026-07-20", {
      intake: 10,
      focus: 20,
      output: 30,
      continuity: 40,
      energy: 50,
    });
    seal("2026-07-21", {
      intake: 30,
      focus: 40,
      output: 50,
      continuity: 60,
      energy: 70,
    });
    const rows = db
      .prepare(`SELECT * FROM days WHERE date IN (?, ?) ORDER BY date`)
      .all("2026-07-20", "2026-07-21") as Parameters<typeof averageStats>[0];
    assert.deepEqual(averageStats(rows), {
      intake: 20,
      focus: 30,
      output: 40,
      continuity: 50,
      energy: 60,
    });
  });
});

describe("saveToday weekly card", () => {
  let db: Db;

  beforeEach(() => {
    db = openMemoryDb();
  });

  it("inserts a weekly card on Sunday Save", async () => {
    // 2026-07-26 Sunday
    const r = await saveToday(db, { date: "2026-07-26", note_text: "week end" });
    assert.equal(r.already_saved, false);
    assert.ok(r.cards_created >= 2); // briefing + weekly (+ maybe todos)

    const weekly = getCardByTypeDate(db, "weekly", "2026-07-26");
    assert.ok(weekly);
    const content = weekly!.content as WeeklyCardContent;
    assert.equal(content.week_end, "2026-07-26");
    assert.equal(content.week_start, "2026-07-20");
    assert.ok(content.summary.length > 0);
    assert.ok(content.opening_line.length > 0);
    assert.ok(Array.isArray(content.highlights));
    assert.ok(content.day_dates.includes("2026-07-26"));
    assert.ok(content.profession);

    const before = listCards(db, { direction: "before", limit: 20 });
    assert.ok(before.cards.some((c) => c.type === "weekly"));
  });

  it("does not duplicate weekly on re-save", async () => {
    await saveToday(db, { date: "2026-07-26" });
    const first = getCardByTypeDate(db, "weekly", "2026-07-26")!;
    const second = await saveToday(db, { date: "2026-07-26" });
    assert.equal(second.already_saved, true);
    const again = getCardByTypeDate(db, "weekly", "2026-07-26")!;
    assert.equal(again.id, first.id);
  });
});
