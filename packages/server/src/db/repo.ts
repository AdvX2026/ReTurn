import type {
  CadenceMode,
  CardRecord,
  CardType,
  CharacterState,
  ChatIntent,
  MessageRecord,
  MessageRole,
  NodeKind,
  NodeRecord,
  ReviewPoint,
  Stats,
  TaskRecord,
  TaskStatus,
  TaskType,
  TodoRecord,
} from "@return/shared";
import {
  deleteNodeFts,
  enqueueEmbed,
  isEmbeddableKind,
  upsertDayFts,
  upsertNodeFts,
} from "../search/index.js";
import { nowIso, todayDate, uuid } from "../util/time.js";
import type { Db } from "./schema.js";

// ── row shapes ───────────────────────────────────────────

export interface DayRow {
  id: string;
  date: string;
  saved_at: string | null;
  save_note_node_id: string | null;
  summary: string | null;
  opening_line: string | null;
  review_points_json: string | null;
  stats_json: string | null;
  character_state: string | null;
}

export interface NodeRow {
  id: string;
  day_id: string;
  device_id: string | null;
  kind: string;
  title: string | null;
  content: string | null;
  source_meta: string | null;
  client_uuid: string;
  created_at: string;
}

export interface EdgeRow {
  id: string;
  src_node_id: string;
  dst_node_id: string;
  relation: string;
  created_by_day_id: string;
}

export interface TodoRow {
  id: string;
  day_id: string;
  text: string;
  done: number;
  source_node_id: string | null;
}

export interface DeviceRow {
  id: string;
  name: string;
  platform: string;
  last_seen_at: string;
}

// ── mappers ──────────────────────────────────────────────

function parseJson<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export function nodeToRecord(row: NodeRow, date: string): NodeRecord {
  return {
    id: row.id,
    day_id: row.day_id,
    device_id: row.device_id,
    kind: row.kind as NodeKind,
    title: row.title,
    content: row.content,
    source_meta: parseJson<Record<string, unknown> | null>(row.source_meta, null),
    client_uuid: row.client_uuid,
    created_at: row.created_at,
    date,
  };
}

export function todoToRecord(row: TodoRow): TodoRecord {
  return {
    id: row.id,
    day_id: row.day_id,
    text: row.text,
    done: row.done === 1,
    source_node_id: row.source_node_id,
  };
}

export function dayStats(row: DayRow): Stats | null {
  return parseJson<Stats | null>(row.stats_json, null);
}

export function dayReviewPoints(row: DayRow): ReviewPoint[] {
  return parseJson<ReviewPoint[]>(row.review_points_json, []);
}

// ── devices ──────────────────────────────────────────────

export function upsertDevice(
  db: Db,
  input: { id?: string; name: string; platform: string },
): DeviceRow {
  const now = nowIso();
  if (input.id) {
    const existing = db.prepare(`SELECT * FROM devices WHERE id = ?`).get(input.id) as
      | DeviceRow
      | undefined;
    if (existing) {
      db.prepare(
        `UPDATE devices SET name = ?, platform = ?, last_seen_at = ? WHERE id = ?`,
      ).run(input.name, input.platform, now, input.id);
      return {
        id: input.id,
        name: input.name,
        platform: input.platform,
        last_seen_at: now,
      };
    }
  }
  const id = input.id ?? uuid();
  db.prepare(
    `INSERT INTO devices (id, name, platform, last_seen_at) VALUES (?, ?, ?, ?)`,
  ).run(id, input.name, input.platform, now);
  return { id, name: input.name, platform: input.platform, last_seen_at: now };
}

export function touchDevice(db: Db, deviceId: string): void {
  db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(nowIso(), deviceId);
}

export function getDevice(db: Db, id: string): DeviceRow | undefined {
  return db.prepare(`SELECT * FROM devices WHERE id = ?`).get(id) as
    | DeviceRow
    | undefined;
}

// ── days ─────────────────────────────────────────────────

export function ensureDay(db: Db, date: string): DayRow {
  const existing = db.prepare(`SELECT * FROM days WHERE date = ?`).get(date) as
    | DayRow
    | undefined;
  if (existing) return existing;
  const id = uuid();
  db.prepare(
    `INSERT INTO days (id, date, saved_at, save_note_node_id, summary, opening_line, review_points_json, stats_json, character_state)
     VALUES (?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL)`,
  ).run(id, date);
  return {
    id,
    date,
    saved_at: null,
    save_note_node_id: null,
    summary: null,
    opening_line: null,
    review_points_json: null,
    stats_json: null,
    character_state: null,
  };
}

export function getDayByDate(db: Db, date: string): DayRow | undefined {
  return db.prepare(`SELECT * FROM days WHERE date = ?`).get(date) as DayRow | undefined;
}

export function getDayById(db: Db, id: string): DayRow | undefined {
  return db.prepare(`SELECT * FROM days WHERE id = ?`).get(id) as DayRow | undefined;
}

export function listSavedDays(db: Db, sinceDate: string): DayRow[] {
  return db
    .prepare(
      `SELECT * FROM days WHERE date >= ? AND saved_at IS NOT NULL ORDER BY date ASC`,
    )
    .all(sinceDate) as DayRow[];
}

export function listDaysInRange(db: Db, startDate: string, endDate: string): DayRow[] {
  return db
    .prepare(`SELECT * FROM days WHERE date >= ? AND date <= ? ORDER BY date ASC`)
    .all(startDate, endDate) as DayRow[];
}

export function getLatestSavedDay(db: Db, beforeDate?: string): DayRow | undefined {
  if (beforeDate) {
    return db
      .prepare(
        `SELECT * FROM days WHERE saved_at IS NOT NULL AND date < ? ORDER BY date DESC LIMIT 1`,
      )
      .get(beforeDate) as DayRow | undefined;
  }
  return db
    .prepare(`SELECT * FROM days WHERE saved_at IS NOT NULL ORDER BY date DESC LIMIT 1`)
    .get() as DayRow | undefined;
}

export function markDaySaved(
  db: Db,
  dayId: string,
  payload: {
    saved_at: string;
    save_note_node_id: string | null;
    summary: string | null;
    opening_line: string | null;
    review_points: ReviewPoint[];
    stats: Stats;
    character_state: CharacterState;
  },
): void {
  db.prepare(
    `UPDATE days SET
       saved_at = ?,
       save_note_node_id = ?,
       summary = ?,
       opening_line = ?,
       review_points_json = ?,
       stats_json = ?,
       character_state = ?
     WHERE id = ?`,
  ).run(
    payload.saved_at,
    payload.save_note_node_id,
    payload.summary,
    payload.opening_line,
    JSON.stringify(payload.review_points),
    JSON.stringify(payload.stats),
    payload.character_state,
    dayId,
  );

  // Refresh day_summary FTS doc + embed queue in the same writer path.
  const day = getDayById(db, dayId);
  if (day) {
    upsertDayFts(db, day);
    if (day.summary) {
      enqueueEmbed(db, `day:${day.date}`, payload.saved_at);
    }
  }
}

// ── nodes ────────────────────────────────────────────────

export interface InsertNodeInput {
  client_uuid: string;
  kind: NodeKind | string;
  title?: string | null;
  content?: string | null;
  source_meta?: Record<string, unknown> | null;
  device_id?: string | null;
  date?: string;
  created_at?: string;
}

export function insertNode(
  db: Db,
  input: InsertNodeInput,
): { node: NodeRecord; duplicate: boolean } {
  const existing = db
    .prepare(`SELECT * FROM nodes WHERE client_uuid = ?`)
    .get(input.client_uuid) as NodeRow | undefined;
  if (existing) {
    const day = getDayById(db, existing.day_id)!;
    return { node: nodeToRecord(existing, day.date), duplicate: true };
  }

  const date = input.date ?? todayDate();
  const day = ensureDay(db, date);
  const id = uuid();
  const created_at = input.created_at ?? nowIso();
  const source_meta = input.source_meta ? JSON.stringify(input.source_meta) : null;

  db.prepare(
    `INSERT INTO nodes (id, day_id, device_id, kind, title, content, source_meta, client_uuid, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    day.id,
    input.device_id ?? null,
    input.kind,
    input.title ?? null,
    input.content ?? null,
    source_meta,
    input.client_uuid,
    created_at,
  );

  // Keep search_fts in the same transaction as the authority row (PRD §6.3).
  upsertNodeFts(db, {
    id,
    kind: String(input.kind),
    date,
    title: input.title ?? null,
    content: input.content ?? null,
    source_meta: input.source_meta ?? null,
  });
  if (isEmbeddableKind(String(input.kind))) {
    enqueueEmbed(db, id, created_at);
  }

  return {
    node: {
      id,
      day_id: day.id,
      device_id: input.device_id ?? null,
      kind: input.kind as NodeKind,
      title: input.title ?? null,
      content: input.content ?? null,
      source_meta: input.source_meta ?? null,
      client_uuid: input.client_uuid,
      created_at,
      date,
    },
    duplicate: false,
  };
}

export function insertNodes(
  db: Db,
  inputs: InsertNodeInput[],
): { created: NodeRecord[]; duplicates: string[] } {
  const created: NodeRecord[] = [];
  const duplicates: string[] = [];
  db.transaction(() => {
    for (const row of inputs) {
      const r = insertNode(db, row);
      if (r.duplicate) duplicates.push(row.client_uuid);
      else created.push(r.node);
    }
  })();
  return { created, duplicates };
}

export function listNodesByDate(db: Db, date: string): NodeRecord[] {
  const day = getDayByDate(db, date);
  if (!day) return [];
  const rows = db
    .prepare(`SELECT * FROM nodes WHERE day_id = ? ORDER BY created_at ASC`)
    .all(day.id) as NodeRow[];
  return rows.map((r) => nodeToRecord(r, date));
}

export function listNodesByDayId(db: Db, dayId: string): NodeRow[] {
  return db
    .prepare(`SELECT * FROM nodes WHERE day_id = ? ORDER BY created_at ASC`)
    .all(dayId) as NodeRow[];
}

export function getNodeById(db: Db, id: string): NodeRecord | undefined {
  const row = db.prepare(`SELECT * FROM nodes WHERE id = ?`).get(id) as
    | NodeRow
    | undefined;
  if (!row) return undefined;
  const day = getDayById(db, row.day_id);
  if (!day) return undefined;
  return nodeToRecord(row, day.date);
}

export function getNodeByClientUuid(db: Db, clientUuid: string): NodeRecord | undefined {
  const row = db.prepare(`SELECT * FROM nodes WHERE client_uuid = ?`).get(clientUuid) as
    | NodeRow
    | undefined;
  if (!row) return undefined;
  const day = getDayById(db, row.day_id);
  if (!day) return undefined;
  return nodeToRecord(row, day.date);
}

export function deleteNode(db: Db, id: string): boolean {
  // Drop edges first so delete works even if table was created without ON DELETE CASCADE.
  let changes = 0;
  db.transaction(() => {
    db.prepare(`DELETE FROM edges WHERE src_node_id = ? OR dst_node_id = ?`).run(id, id);
    db.prepare(`UPDATE todos SET source_node_id = NULL WHERE source_node_id = ?`).run(id);
    changes = db.prepare(`DELETE FROM nodes WHERE id = ?`).run(id).changes;
    if (changes > 0) deleteNodeFts(db, id);
  })();
  return changes > 0;
}

/** Re-index an existing node after in-place content updates (e.g. health refresh, tags). */
export function reindexNode(db: Db, nodeId: string): void {
  const node = getNodeById(db, nodeId);
  if (!node) {
    deleteNodeFts(db, nodeId);
    return;
  }
  upsertNodeFts(db, {
    id: node.id,
    kind: node.kind,
    date: node.date,
    title: node.title,
    content: node.content,
    source_meta: node.source_meta,
  });
  if (isEmbeddableKind(node.kind)) {
    enqueueEmbed(db, node.id, nowIso());
  }
}

// ── edges ────────────────────────────────────────────────

export function insertEdge(
  db: Db,
  input: {
    src_node_id: string;
    dst_node_id: string;
    relation: string;
    created_by_day_id: string;
  },
): EdgeRow {
  const id = uuid();
  db.prepare(
    `INSERT INTO edges (id, src_node_id, dst_node_id, relation, created_by_day_id)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.src_node_id,
    input.dst_node_id,
    input.relation,
    input.created_by_day_id,
  );
  return { id, ...input };
}

export function listEdgesByDay(db: Db, dayId: string): EdgeRow[] {
  return db
    .prepare(`SELECT * FROM edges WHERE created_by_day_id = ?`)
    .all(dayId) as EdgeRow[];
}

/** Count edges created on this day whose endpoints live on different days. */
export function countCrossDayEdges(db: Db, dayId: string): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n
       FROM edges e
       JOIN nodes s ON s.id = e.src_node_id
       JOIN nodes d ON d.id = e.dst_node_id
       WHERE e.created_by_day_id = ? AND s.day_id != d.day_id`,
    )
    .get(dayId) as { n: number };
  return row.n;
}

// ── todos ────────────────────────────────────────────────

export function insertTodo(
  db: Db,
  input: { day_id: string; text: string; source_node_id?: string | null },
): TodoRecord {
  const id = uuid();
  db.prepare(
    `INSERT INTO todos (id, day_id, text, done, source_node_id) VALUES (?, ?, ?, 0, ?)`,
  ).run(id, input.day_id, input.text, input.source_node_id ?? null);
  return {
    id,
    day_id: input.day_id,
    text: input.text,
    done: false,
    source_node_id: input.source_node_id ?? null,
  };
}

export function listTodosByDay(db: Db, dayId: string): TodoRecord[] {
  const rows = db
    .prepare(`SELECT * FROM todos WHERE day_id = ? ORDER BY rowid ASC`)
    .all(dayId) as TodoRow[];
  return rows.map(todoToRecord);
}

export function getTodo(db: Db, id: string): TodoRecord | undefined {
  const row = db.prepare(`SELECT * FROM todos WHERE id = ?`).get(id) as
    | TodoRow
    | undefined;
  return row ? todoToRecord(row) : undefined;
}

export function setTodoDone(db: Db, id: string, done: boolean): TodoRecord | undefined {
  db.prepare(`UPDATE todos SET done = ? WHERE id = ?`).run(done ? 1 : 0, id);
  return getTodo(db, id);
}

export function todoCompletionRate(
  db: Db,
  dayId: string,
): {
  total: number;
  done: number;
  rate: number;
} {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS total, COALESCE(SUM(done), 0) AS done FROM todos WHERE day_id = ?`,
    )
    .get(dayId) as { total: number; done: number };
  const rate = row.total === 0 ? 0 : row.done / row.total;
  return { total: row.total, done: row.done, rate };
}

// ── cadence (sampler rhythm) ─────────────────────────────

/** Night mode if today is already saved; else active. */
export function currentCadence(db: Db, date = todayDate()): CadenceMode {
  const day = getDayByDate(db, date);
  return day?.saved_at ? "night" : "active";
}

// ── messages ─────────────────────────────────────────────

interface MessageRow {
  id: string;
  role: string;
  content: string;
  intent: string | null;
  task_id: string | null;
  meta_json: string | null;
  created_at: string;
}

function messageToRecord(row: MessageRow): MessageRecord {
  return {
    id: row.id,
    role: row.role as MessageRole,
    content: row.content,
    intent: (row.intent as ChatIntent | null) ?? null,
    task_id: row.task_id,
    created_at: row.created_at,
    meta: parseJson<Record<string, unknown> | null>(row.meta_json, null),
  };
}

export function insertMessage(
  db: Db,
  input: {
    role: MessageRole | string;
    content: string;
    intent?: ChatIntent | string | null;
    task_id?: string | null;
    meta?: Record<string, unknown> | null;
    created_at?: string;
  },
): MessageRecord {
  const id = uuid();
  const created_at = input.created_at ?? nowIso();
  db.prepare(
    `INSERT INTO messages (id, role, content, intent, task_id, meta_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.role,
    input.content,
    input.intent ?? null,
    input.task_id ?? null,
    input.meta ? JSON.stringify(input.meta) : null,
    created_at,
  );
  return {
    id,
    role: input.role as MessageRole,
    content: input.content,
    intent: (input.intent as ChatIntent | null) ?? null,
    task_id: input.task_id ?? null,
    created_at,
    meta: input.meta ?? null,
  };
}

export function getMessage(db: Db, id: string): MessageRecord | undefined {
  const row = db.prepare(`SELECT * FROM messages WHERE id = ?`).get(id) as
    | MessageRow
    | undefined;
  return row ? messageToRecord(row) : undefined;
}

export function setMessageIntent(
  db: Db,
  id: string,
  intent: ChatIntent | string,
): MessageRecord | undefined {
  db.prepare(`UPDATE messages SET intent = ? WHERE id = ?`).run(intent, id);
  return getMessage(db, id);
}

/** Cursor = created_at ISO of last item; returns newer-to-older page. */
export function listMessages(
  db: Db,
  opts?: { cursor?: string; limit?: number },
): { messages: MessageRecord[]; next_cursor: string | null } {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  const rows = (
    opts?.cursor
      ? db
          .prepare(
            `SELECT * FROM messages WHERE created_at < ? ORDER BY created_at DESC LIMIT ?`,
          )
          .all(opts.cursor, limit)
      : db.prepare(`SELECT * FROM messages ORDER BY created_at DESC LIMIT ?`).all(limit)
  ) as MessageRow[];
  const messages = rows.map(messageToRecord);
  const next_cursor =
    messages.length === limit
      ? (messages[messages.length - 1]?.created_at ?? null)
      : null;
  return { messages, next_cursor };
}

// ── tasks ────────────────────────────────────────────────

interface TaskRow {
  id: string;
  type: string;
  status: string;
  input_json: string;
  result_message_id: string | null;
  created_at: string;
  finished_at: string | null;
}

function taskToRecord(row: TaskRow): TaskRecord {
  return {
    id: row.id,
    type: row.type as TaskType,
    status: row.status as TaskStatus,
    input: parseJson<Record<string, unknown>>(row.input_json, {}),
    result_message_id: row.result_message_id,
    created_at: row.created_at,
    finished_at: row.finished_at,
  };
}

export function insertTask(
  db: Db,
  input: {
    type: TaskType | string;
    status?: TaskStatus | string;
    input: Record<string, unknown>;
  },
): TaskRecord {
  const id = uuid();
  const created_at = nowIso();
  const status = input.status ?? "queued";
  db.prepare(
    `INSERT INTO tasks (id, type, status, input_json, result_message_id, created_at, finished_at)
     VALUES (?, ?, ?, ?, NULL, ?, NULL)`,
  ).run(id, input.type, status, JSON.stringify(input.input), created_at);
  return {
    id,
    type: input.type as TaskType,
    status: status as TaskStatus,
    input: input.input,
    result_message_id: null,
    created_at,
    finished_at: null,
  };
}

export function updateTask(
  db: Db,
  id: string,
  patch: {
    status?: TaskStatus | string;
    result_message_id?: string | null;
    finished_at?: string | null;
  },
): TaskRecord | undefined {
  const existing = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as
    | TaskRow
    | undefined;
  if (!existing) return undefined;
  const status = patch.status ?? existing.status;
  const result_message_id =
    patch.result_message_id !== undefined
      ? patch.result_message_id
      : existing.result_message_id;
  const finished_at =
    patch.finished_at !== undefined ? patch.finished_at : existing.finished_at;
  db.prepare(
    `UPDATE tasks SET status = ?, result_message_id = ?, finished_at = ? WHERE id = ?`,
  ).run(status, result_message_id, finished_at, id);
  return getTask(db, id);
}

export function getTask(db: Db, id: string): TaskRecord | undefined {
  const row = db.prepare(`SELECT * FROM tasks WHERE id = ?`).get(id) as
    | TaskRow
    | undefined;
  return row ? taskToRecord(row) : undefined;
}

export function listTasks(db: Db, opts?: { status?: TaskStatus | string }): TaskRecord[] {
  const rows = (
    opts?.status
      ? db
          .prepare(`SELECT * FROM tasks WHERE status = ? ORDER BY created_at DESC`)
          .all(opts.status)
      : db.prepare(`SELECT * FROM tasks ORDER BY created_at DESC LIMIT 100`).all()
  ) as TaskRow[];
  return rows.map(taskToRecord);
}

// ── cards ────────────────────────────────────────────────

interface CardRow {
  id: string;
  type: string;
  date: string;
  content_json: string;
  created_at: string;
}

function cardToRecord(row: CardRow): CardRecord {
  return {
    id: row.id,
    type: row.type as CardType,
    date: row.date,
    content: parseJson<Record<string, unknown>>(row.content_json, {}),
    created_at: row.created_at,
  };
}

export function insertCard(
  db: Db,
  input: {
    type: CardType | string;
    date: string;
    content: Record<string, unknown>;
  },
): CardRecord {
  const id = uuid();
  const created_at = nowIso();
  db.prepare(
    `INSERT INTO cards (id, type, date, content_json, created_at) VALUES (?, ?, ?, ?, ?)`,
  ).run(id, input.type, input.date, JSON.stringify(input.content), created_at);
  return {
    id,
    type: input.type as CardType,
    date: input.date,
    content: input.content,
    created_at,
  };
}

/**
 * before = cards on dates ≤ today, newest first (past / briefing).
 * future = idea / todo_suggestion / health cards, newest first.
 * cursor = created_at of last card.
 */
export function listCards(
  db: Db,
  opts: { direction: "before" | "future"; cursor?: string; limit?: number },
): { cards: CardRecord[]; next_cursor: string | null } {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const today = todayDate();
  let rows: CardRow[];
  if (opts.direction === "before") {
    rows = (
      opts.cursor
        ? db
            .prepare(
              `SELECT * FROM cards WHERE date <= ? AND created_at < ?
               ORDER BY date DESC, created_at DESC LIMIT ?`,
            )
            .all(today, opts.cursor, limit)
        : db
            .prepare(
              `SELECT * FROM cards WHERE date <= ?
               ORDER BY date DESC, created_at DESC LIMIT ?`,
            )
            .all(today, limit)
    ) as CardRow[];
  } else {
    rows = (
      opts.cursor
        ? db
            .prepare(
              `SELECT * FROM cards
               WHERE type IN ('idea','todo_suggestion','health') AND created_at < ?
               ORDER BY created_at DESC LIMIT ?`,
            )
            .all(opts.cursor, limit)
        : db
            .prepare(
              `SELECT * FROM cards
               WHERE type IN ('idea','todo_suggestion','health')
               ORDER BY created_at DESC LIMIT ?`,
            )
            .all(limit)
    ) as CardRow[];
  }
  const cards = rows.map(cardToRecord);
  const next_cursor =
    cards.length === limit ? (cards[cards.length - 1]?.created_at ?? null) : null;
  return { cards, next_cursor };
}
