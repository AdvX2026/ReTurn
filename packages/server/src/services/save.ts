import {
  ACTIVE_FEED_KINDS,
  type BriefingCardContent,
  type Profession,
  type ReviewPoint,
  type SaveResponse,
} from "@return/shared";
import { buildFermentContext, runFerment } from "../ai/ferment.js";
import { config } from "../config.js";
import {
  countCrossDayEdges,
  currentCadence,
  ensureDay,
  expireSuggestedTodos,
  getDayByDate,
  getNodeByClientUuid,
  getNodeById,
  insertCard,
  insertEdge,
  insertNode,
  insertTodo,
  listEdgesByDay,
  listNodesByDate,
  listSavedDays,
  applyInferredProfession,
  getUserProfile,
  listTodosByDay,
  listTodosByStatus,
  markDaySaved,
  reindexNode,
  reminderCompletionRate,
} from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { computeDayBreakdown } from "../stats/breakdown.js";
import { resolveCharacterState } from "../stats/character.js";
import { computeStats, extractHealth } from "../stats/compute.js";
import { computeLiveStats } from "../stats/live.js";
import { resolveProfession } from "../stats/profession.js";
import { allSessions } from "../stats/sessions.js";
import { computeStreak, savedDatesFromDays } from "../stats/streak.js";
import { addDays, nowIso, uuid } from "../util/time.js";
import { maybeInsertWeeklyCard } from "./weekly.js";

export interface SaveInput {
  date: string;
  device_id?: string;
  note_text?: string;
  note_voice_ref?: string;
}

/** Serialize concurrent Save for the same calendar date (Codex P1). */
const saveLocks = new Map<string, Promise<unknown>>();

async function withSaveLock<T>(date: string, fn: () => Promise<T>): Promise<T> {
  const prev = saveLocks.get(date) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>((r) => {
    release = r;
  });
  const tail = prev.then(() => gate);
  saveLocks.set(date, tail);
  await prev;
  try {
    return await fn();
  } finally {
    release();
    if (saveLocks.get(date) === tail) saveLocks.delete(date);
  }
}

/**
 * Save Today pipeline (PRD §2.3 / §6.3):
 * 1. Idempotent: if day already saved → return existing settlement.
 * 2. Persist save_note node (text or voice ref).
 * 3. Ferment via LLM (timeout + retry + Zod). Failures leave the day open.
 * 4. Write edges / todos / tags; recompute stats (code, not LLM); freeze.
 */
export async function saveToday(db: Db, input: SaveInput): Promise<SaveResponse> {
  return withSaveLock(input.date, () => saveTodayUnlocked(db, input));
}

async function saveTodayUnlocked(db: Db, input: SaveInput): Promise<SaveResponse> {
  const day = ensureDay(db, input.date);

  if (day.saved_at) {
    return buildSaveResponse(db, day.id, input.date, true);
  }

  // ── save note ─────────────────────────────────────────
  let saveNoteText: string | null = null;
  let saveNoteNodeId: string | null = null;
  let voiceSourceNodeId: string | null = null;

  if (input.note_text?.trim()) {
    saveNoteText = input.note_text.trim();
  } else if (input.note_voice_ref) {
    const existing =
      getNodeByClientUuid(db, input.note_voice_ref) ??
      getNodeById(db, input.note_voice_ref);
    if (!existing) {
      throw new Error(`save note voice node not found: ${input.note_voice_ref}`);
    }
    saveNoteText = existing.content;
    if (existing.kind === "save_note") {
      saveNoteNodeId = existing.id;
    } else {
      voiceSourceNodeId = existing.id;
    }
  }

  // ── gather context ────────────────────────────────────
  const nodes = listNodesByDate(db, input.date);
  const sessions = allSessions(nodes, config.sampleIntervalMin);

  const recentDays = listSavedDays(db, addDays(input.date, -7)).filter(
    (d) => d.date < input.date,
  );
  const recentSummaries = recentDays
    .filter((d) => d.summary)
    .map((d) => ({ date: d.date, summary: d.summary! }));

  const linkableNodes: Array<{
    id: string;
    date: string;
    title: string | null;
    kind: string;
  }> = [];
  for (const d of recentDays.slice(-5)) {
    for (const n of listNodesByDate(db, d.date)) {
      if ((ACTIVE_FEED_KINDS as readonly string[]).includes(n.kind)) {
        linkableNodes.push({
          id: n.id,
          date: d.date,
          title: n.title,
          kind: n.kind,
        });
      }
    }
  }

  // Preference loop: expire stale suggestions → open reminders + pos/neg samples.
  expireSuggestedTodos(db, input.date);
  const rem = reminderCompletionRate(db, input.date);
  const acceptedTodos = listTodosByStatus(db, "accepted", 20).map((t) => t.text);
  const dismissedTodos = listTodosByStatus(db, "dismissed", 20).map((t) => t.text);
  const profile = getUserProfile(db);

  // ── ferment ───────────────────────────────────────────
  const ctx = buildFermentContext({
    date: input.date,
    saveNote: saveNoteText,
    nodes,
    sessions,
    recentSummaries,
    linkableNodes,
    openReminders: rem.openTitles,
    acceptedTodos,
    dismissedTodos,
    profileNote: profile.note,
    profileProfession: profile.profession,
  });
  const ferment = await runFerment(db, ctx);

  // ── persist ferment products ──────────────────────────
  // Re-check under lock: another waiter may have sealed while we fermented.
  const sealed = getDayByDate(db, input.date);
  if (sealed?.saved_at) {
    return buildSaveResponse(db, sealed.id, input.date, true);
  }

  const knownIds = new Set([
    ...nodes.map((n) => n.id),
    ...linkableNodes.map((n) => n.id),
  ]);

  let cardsCreated = 0;
  /** Day-inferred profession; set inside the seal transaction, used for weekly. */
  let dayProfession: Profession = "generalist";
  db.transaction(() => {
    if (saveNoteText !== null && saveNoteNodeId === null) {
      const { node } = insertNode(db, {
        client_uuid: uuid(),
        kind: "save_note",
        title: voiceSourceNodeId ? "Save note (voice)" : "Save note",
        content: saveNoteText,
        device_id: input.device_id ?? null,
        date: input.date,
        source_meta: voiceSourceNodeId
          ? { source: "save_today", from_voice_node_id: voiceSourceNodeId }
          : { source: "save_today" },
      });
      saveNoteNodeId = node.id;
    }

    for (const e of ferment.edges) {
      if (!knownIds.has(e.src_node_id) || !knownIds.has(e.dst_node_id)) continue;
      if (e.src_node_id === e.dst_node_id) continue;
      insertEdge(db, {
        src_node_id: e.src_node_id,
        dst_node_id: e.dst_node_id,
        relation: e.relation,
        created_by_day_id: day.id,
      });
    }

    for (const [nodeId, tags] of Object.entries(ferment.node_tags)) {
      const row = db.prepare(`SELECT source_meta FROM nodes WHERE id = ?`).get(nodeId) as
        | { source_meta: string | null }
        | undefined;
      if (!row) continue;
      const meta: Record<string, unknown> = row.source_meta
        ? JSON.parse(row.source_meta)
        : {};
      meta.tags = tags;
      db.prepare(`UPDATE nodes SET source_meta = ? WHERE id = ?`).run(
        JSON.stringify(meta),
        nodeId,
      );
      reindexNode(db, nodeId);
    }

    // Future AI suggestions attach to the *next* calendar day (shown on Continue).
    // Anchor source_node_id on save_note when present.
    const nextDate = addDays(input.date, 1);
    const nextDay = ensureDay(db, nextDate);
    const openNorm = new Set(rem.openTitles.map(normalizeTodoText));
    const todoIds: string[] = [];
    const suggestedTexts: string[] = [];
    for (const t of ferment.todos) {
      // Server-side dedupe vs open Reminders (LLM may ignore prompt).
      if (openNorm.has(normalizeTodoText(t.text))) continue;
      const todo = insertTodo(db, {
        day_id: nextDay.id,
        text: t.text,
        source_node_id: saveNoteNodeId,
      });
      todoIds.push(todo.id);
      suggestedTexts.push(t.text);
    }

    const freshNodes = listNodesByDate(db, input.date);
    const freshSessions = allSessions(freshNodes, config.sampleIntervalMin);
    const remToday = reminderCompletionRate(db, input.date);
    const cross = countCrossDayEdges(db, day.id);
    const health = extractHealth(freshNodes);
    const stats = computeStats({
      nodes: freshNodes,
      sessions: freshSessions,
      todoRate: remToday.rate,
      crossDayEdges: cross,
      sleepMinutes: health.sleepMinutes,
      steps: health.steps,
    });
    const character_state = resolveCharacterState(stats);
    const breakdown = computeDayBreakdown({
      nodes: freshNodes,
      sessions: freshSessions,
      todoCompleted: remToday.done,
      todoTotal: remToday.total,
      crossDayEdges: cross,
      sleepMinutes: health.sleepMinutes,
      steps: health.steps,
    });
    dayProfession = resolveProfession({
      sessions: freshSessions,
      gitCommitCount: breakdown.git_commit_count,
      agentDurationMin: breakdown.agent_duration_min,
    });
    // Profile: always record inference; auto mode copies it to effective profession.
    applyInferredProfession(db, dayProfession);
    // Briefing snapshots the day-inferred role (historical truth for that day).
    const profession = dayProfession;
    // Include today once sealed so streak counts this save.
    const priorSaved = listSavedDays(db, addDays(input.date, -60));
    const streak = computeStreak(
      [...savedDatesFromDays(priorSaved), input.date],
      input.date,
    );

    markDaySaved(db, day.id, {
      saved_at: nowIso(),
      save_note_node_id: saveNoteNodeId,
      summary: ferment.summary,
      opening_line: ferment.opening_line,
      review_points: ferment.review_points as ReviewPoint[],
      stats,
      character_state,
    });

    // v0.6 cards (briefing / todo_suggestion / health / auto ideas)
    const briefingBody = ferment.briefing ?? ferment.summary;
    const briefingContent: BriefingCardContent = {
      summary: ferment.summary,
      opening_line: ferment.opening_line,
      briefing: briefingBody,
      review_points: ferment.review_points as ReviewPoint[],
      stats,
      character_state,
      node_ids: freshNodes
        .filter((n) => (ACTIVE_FEED_KINDS as readonly string[]).includes(n.kind))
        .map((n) => n.id)
        .slice(0, 40),
      profession,
      streak,
      breakdown,
    };
    insertCard(db, {
      type: "briefing",
      date: input.date,
      content: briefingContent,
    });
    cardsCreated++;
    if (todoIds.length > 0) {
      insertCard(db, {
        type: "todo_suggestion",
        date: nextDate,
        content: {
          todos: suggestedTexts,
          todo_ids: todoIds,
        },
      });
      cardsCreated++;
    }
    if (ferment.health_advice) {
      insertCard(db, {
        type: "health",
        date: nextDate,
        content: {
          advice: ferment.health_advice,
          sleep_minutes: health.sleepMinutes,
          steps: health.steps,
        },
      });
      cardsCreated++;
    }
    for (const idea of ferment.ideas ?? []) {
      const { node } = insertNode(db, {
        client_uuid: uuid(),
        kind: "idea",
        title: idea.text.slice(0, 60),
        content: idea.text,
        date: input.date,
        source_meta: { provenance: "auto", source: "ferment" },
      });
      insertCard(db, {
        type: "idea",
        date: input.date,
        content: {
          text: idea.text,
          node_ids: [node.id],
          provenance: "auto",
        },
      });
      cardsCreated++;
    }
  })();

  // P1 weekly recap: every 7th saved day or Sunday Save. Soft-fail does not unseal.
  cardsCreated += await maybeInsertWeeklyCard(db, input.date, {
    profession: dayProfession,
    profileProfession: getUserProfile(db).profession,
  });

  return buildSaveResponse(db, day.id, input.date, false, cardsCreated);
}

/** Normalize for loose reminder/todo text match (dedupe). */
function normalizeTodoText(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function buildSaveResponse(
  db: Db,
  dayId: string,
  date: string,
  already_saved: boolean,
  /** Cards inserted by this Save call; 0 on already_saved replay. */
  cardsCreated = 0,
): SaveResponse {
  const day = getDayByDate(db, date)!;
  const todos = listTodosByDay(db, dayId);
  const nextDay = getDayByDate(db, addDays(date, 1));
  const nextTodos = nextDay ? listTodosByDay(db, nextDay.id) : [];
  const edges = listEdgesByDay(db, dayId);
  const live = computeLiveStats(db, date);

  const allSaved = listSavedDays(db, addDays(date, -60));
  const streak = computeStreak(savedDatesFromDays(allSaved), date);

  if (!day.saved_at) throw new Error(`saved day is missing saved_at: ${date}`);
  const review_points = day.review_points_json
    ? (JSON.parse(day.review_points_json) as ReviewPoint[])
    : [];

  return {
    day_id: dayId,
    date,
    saved_at: day.saved_at,
    already_saved,
    summary: day.summary,
    opening_line: day.opening_line,
    briefing: day.summary,
    review_points,
    todos: nextDay ? nextTodos : todos,
    stats: live.stats,
    character_state: live.character_state,
    streak,
    edges_created: edges.length,
    cards_created: cardsCreated,
    cadence: currentCadence(db, date),
  };
}
