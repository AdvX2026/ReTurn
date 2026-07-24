import type {
  FermentResult,
  NodeRecord,
  ReviewPoint,
  SaveResponse,
} from "@return/shared";
import { buildFermentContext, runFerment } from "../ai/ferment.js";
import { config } from "../config.js";
import {
  countCrossDayEdges,
  ensureDay,
  getDayByDate,
  getLatestSavedDay,
  getNodeByClientUuid,
  getNodeById,
  insertCard,
  insertEdge,
  insertNode,
  insertTodo,
  listEdgesByDay,
  listNodesByDate,
  listSavedDays,
  listTodosByDay,
  markDaySaved,
  setPaceNight,
  todoCompletionRate,
} from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { resolveCharacterState } from "../stats/character.js";
import { computeStats, extractHealth } from "../stats/compute.js";
import { computeLiveStats } from "../stats/live.js";
import { allSessions } from "../stats/sessions.js";
import { computeStreak, savedDatesFromDays } from "../stats/streak.js";
import { addDays, nowIso, uuid } from "../util/time.js";

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
  saveLocks.set(
    date,
    tail.catch(() => {
      /* keep chain alive */
    }),
  );
  await prev.catch(() => {
    /* previous failure must not block */
  });
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
 * 3. Ferment via LLM (timeout + retry + Zod). On failure: degrade with
 *    last real saved result, still seal the day.
 * 4. Write edges / todos / tags; recompute stats (code, not LLM); freeze.
 */
export async function saveToday(db: Db, input: SaveInput): Promise<SaveResponse> {
  return withSaveLock(input.date, () => saveTodayUnlocked(db, input));
}

async function saveTodayUnlocked(db: Db, input: SaveInput): Promise<SaveResponse> {
  const day = ensureDay(db, input.date);

  if (day.saved_at) {
    return buildSaveResponse(db, day.id, input.date, true, false);
  }

  // ── save note ─────────────────────────────────────────
  let saveNoteText: string | null = null;
  let saveNoteNodeId: string | null = null;

  if (input.note_text?.trim()) {
    saveNoteText = input.note_text.trim();
    const { node } = insertNode(db, {
      client_uuid: uuid(),
      kind: "save_note",
      title: "Save note",
      content: saveNoteText,
      device_id: input.device_id ?? null,
      date: input.date,
      source_meta: { source: "save_today" },
    });
    saveNoteNodeId = node.id;
  } else if (input.note_voice_ref) {
    const existing =
      getNodeByClientUuid(db, input.note_voice_ref) ??
      getNodeById(db, input.note_voice_ref);
    if (existing) {
      saveNoteText = existing.content;
      if (existing.kind === "save_note") {
        saveNoteNodeId = existing.id;
      } else {
        const { node } = insertNode(db, {
          client_uuid: uuid(),
          kind: "save_note",
          title: "Save note (voice)",
          content: existing.content,
          device_id: input.device_id ?? null,
          date: input.date,
          source_meta: {
            source: "save_today",
            from_voice_node_id: existing.id,
          },
        });
        saveNoteNodeId = node.id;
      }
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
      if (["text", "url", "voice", "save_note"].includes(n.kind)) {
        linkableNodes.push({
          id: n.id,
          date: d.date,
          title: n.title,
          kind: n.kind,
        });
      }
    }
  }

  // ── ferment ───────────────────────────────────────────
  let ferment: FermentResult;
  let degraded = false;

  try {
    const ctx = buildFermentContext({
      date: input.date,
      saveNote: saveNoteText,
      nodes,
      sessions,
      recentSummaries,
      linkableNodes,
    });
    ferment = await runFerment(ctx);
  } catch (err) {
    degraded = true;
    console.error(
      "[ferment] failed, degrading:",
      err instanceof Error ? err.message : err,
    );
    ferment = degradeFerment(db, input.date, saveNoteText, nodes);
  }

  // ── persist ferment products ──────────────────────────
  // Re-check under lock: another waiter may have sealed while we fermented.
  const sealed = getDayByDate(db, input.date);
  if (sealed?.saved_at) {
    return buildSaveResponse(db, sealed.id, input.date, true, false);
  }

  const knownIds = new Set([
    ...nodes.map((n) => n.id),
    ...linkableNodes.map((n) => n.id),
  ]);

  db.transaction(() => {
    for (const e of ferment.edges) {
      if (!knownIds.has(e.src_node_id) || !knownIds.has(e.dst_node_id)) continue;
      if (e.src_node_id === e.dst_node_id) continue;
      try {
        insertEdge(db, {
          src_node_id: e.src_node_id,
          dst_node_id: e.dst_node_id,
          relation: e.relation,
          created_by_day_id: day.id,
        });
      } catch {
        /* FK miss — skip */
      }
    }

    for (const [nodeId, tags] of Object.entries(ferment.node_tags)) {
      const row = db.prepare(`SELECT source_meta FROM nodes WHERE id = ?`).get(nodeId) as
        | { source_meta: string | null }
        | undefined;
      if (!row) continue;
      let meta: Record<string, unknown> = {};
      try {
        meta = row.source_meta ? JSON.parse(row.source_meta) : {};
      } catch {
        meta = {};
      }
      meta.tags = tags;
      db.prepare(`UPDATE nodes SET source_meta = ? WHERE id = ?`).run(
        JSON.stringify(meta),
        nodeId,
      );
    }

    // Future todos attach to the *next* calendar day (shown on Continue).
    const nextDate = addDays(input.date, 1);
    const nextDay = ensureDay(db, nextDate);
    const todoIds: string[] = [];
    for (const t of ferment.todos) {
      const todo = insertTodo(db, { day_id: nextDay.id, text: t.text });
      todoIds.push(todo.id);
    }

    const freshNodes = listNodesByDate(db, input.date);
    const freshSessions = allSessions(freshNodes, config.sampleIntervalMin);
    const todosToday = todoCompletionRate(db, day.id);
    const cross = countCrossDayEdges(db, day.id);
    const health = extractHealth(freshNodes);
    const stats = computeStats({
      nodes: freshNodes,
      sessions: freshSessions,
      todoRate: todosToday.rate,
      crossDayEdges: cross,
      sleepMinutes: health.sleepMinutes,
      steps: health.steps,
    });
    const character_state = resolveCharacterState(stats);

    markDaySaved(db, day.id, {
      saved_at: nowIso(),
      save_note_node_id: saveNoteNodeId,
      summary: ferment.summary,
      opening_line: ferment.opening_line,
      review_points: ferment.review_points as ReviewPoint[],
      stats,
      character_state,
    });

    // Cards for bidirectional stream (PRD F3/F5).
    const briefingText =
      ferment.briefing?.trim() ||
      `${character_state}: ${ferment.opening_line || ferment.summary.slice(0, 120)}`;
    insertCard(db, {
      type: "briefing",
      date: input.date,
      content: {
        summary: ferment.summary,
        briefing: briefingText,
        opening_line: ferment.opening_line,
        review_points: ferment.review_points,
        stats,
        character_state,
        save_note_node_id: saveNoteNodeId,
      },
    });
    if (todoIds.length > 0) {
      insertCard(db, {
        type: "todo_suggestion",
        date: nextDate,
        content: {
          todos: ferment.todos.map((t, i) => ({
            id: todoIds[i],
            text: t.text,
          })),
        },
      });
    }
    if (ferment.health_advice?.trim()) {
      insertCard(db, {
        type: "health",
        date: nextDate,
        content: {
          advice: ferment.health_advice.trim(),
          sleep_minutes: health.sleepMinutes,
          steps: health.steps,
        },
      });
    }
    for (const idea of ferment.ideas ?? []) {
      if (!idea.text?.trim()) continue;
      const { node } = insertNode(db, {
        client_uuid: uuid(),
        kind: "idea",
        title: idea.text.slice(0, 80),
        content: idea.text,
        date: nextDate,
        source_meta: { provenance: "auto" },
      });
      insertCard(db, {
        type: "idea",
        date: nextDate,
        content: {
          text: idea.text,
          provenance: "auto",
          node_id: node.id,
        },
      });
    }

    setPaceNight(db, input.date);
  })();

  return buildSaveResponse(db, day.id, input.date, false, degraded);
}

function degradeFerment(
  db: Db,
  date: string,
  saveNote: string | null,
  nodes: NodeRecord[],
): FermentResult {
  const prev = getLatestSavedDay(db, date);
  const active = nodes.filter((n) =>
    ["text", "url", "voice", "save_note"].includes(n.kind),
  );

  const summary =
    prev?.summary ??
    (active.length > 0
      ? `今天记录了 ${active.length} 条内容。${saveNote ? `存档留言：${saveNote}` : ""}`.trim()
      : saveNote
        ? `存档留言：${saveNote}`
        : "今天还没有太多记录，但你回来存档了——这就够了。");

  const opening_line = prev?.opening_line ?? "新的一天。昨日已存档，继续向前。";

  let review_points: FermentResult["review_points"] = [];
  if (prev?.review_points_json) {
    try {
      review_points = JSON.parse(
        prev.review_points_json,
      ) as FermentResult["review_points"];
    } catch {
      review_points = [];
    }
  }
  if (review_points.length === 0) {
    review_points = active.slice(0, 3).map((n) => ({
      text: n.title || n.content?.slice(0, 80) || n.kind,
      kind: "other" as const,
    }));
  }

  return {
    summary,
    briefing: summary.slice(0, 200),
    opening_line,
    review_points,
    todos: saveNote ? [{ text: saveNote.slice(0, 200) }] : [],
    health_advice: null,
    ideas: [],
    node_tags: {},
    edges: [],
  };
}

function buildSaveResponse(
  db: Db,
  dayId: string,
  date: string,
  already_saved: boolean,
  degraded: boolean,
): SaveResponse {
  const day = getDayByDate(db, date)!;
  const todos = listTodosByDay(db, dayId);
  const nextDay = getDayByDate(db, addDays(date, 1));
  const nextTodos = nextDay ? listTodosByDay(db, nextDay.id) : [];
  const edges = listEdgesByDay(db, dayId);
  const live = computeLiveStats(db, date);

  const allSaved = listSavedDays(db, addDays(date, -60));
  const streak = computeStreak(savedDatesFromDays(allSaved), date);

  let review_points: ReviewPoint[] = [];
  try {
    review_points = day.review_points_json
      ? (JSON.parse(day.review_points_json) as ReviewPoint[])
      : [];
  } catch {
    review_points = [];
  }

  return {
    day_id: dayId,
    date,
    saved_at: day.saved_at ?? nowIso(),
    already_saved,
    degraded,
    summary: day.summary,
    opening_line: day.opening_line,
    review_points,
    todos: nextTodos.length > 0 ? nextTodos : todos,
    stats: live.stats,
    character_state: live.character_state,
    streak,
    edges_created: edges.length,
  };
}
