import {
  type CadenceMode,
  type CardRecord,
  type CardType,
  type CharacterState,
  type ChatIntent,
  type CollectionStatus,
  type MessageRecord,
  type MessageRole,
  type NodeKind,
  type NodeRecord,
  type Profession,
  type ProfessionMode,
  type ReviewPoint,
  SAMPLER_NODE_KINDS,
  type Stats,
  type TaskRecord,
  type TaskStatus,
  type TaskType,
  type TodoRecord,
  type TodoStatus,
  type UserProfile,
} from "@return/shared";
import {
  deleteNodeFts,
  enqueueEmbed,
  isEmbeddableKind,
  upsertDayFts,
  upsertNodeFts,
} from "../search/index.js";
import { addDays, nowIso, todayDate, uuid } from "../util/time.js";
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
  status: string;
  source_node_id: string | null;
  accepted_reminder_id: string | null;
  accepted_at: string | null;
  dismissed_at: string | null;
}

export interface DeviceRow {
  id: string;
  name: string;
  platform: string;
  last_seen_at: string;
}

// ── mappers ──────────────────────────────────────────────

function parseJson<T>(raw: string): T {
  return JSON.parse(raw) as T;
}

export function nodeToRecord(row: NodeRow, date: string): NodeRecord {
  return {
    id: row.id,
    day_id: row.day_id,
    device_id: row.device_id,
    kind: row.kind as NodeKind,
    title: row.title,
    content: row.content,
    source_meta: row.source_meta
      ? parseJson<Record<string, unknown>>(row.source_meta)
      : null,
    client_uuid: row.client_uuid,
    created_at: row.created_at,
    date,
  };
}

export function todoToRecord(row: TodoRow): TodoRecord {
  const status = row.status as TodoStatus;
  return {
    id: row.id,
    day_id: row.day_id,
    text: row.text,
    done: row.done === 1 || status === "accepted",
    status,
    source_node_id: row.source_node_id,
    accepted_reminder_id: row.accepted_reminder_id,
    accepted_at: row.accepted_at,
    dismissed_at: row.dismissed_at,
  };
}

export function dayStats(row: DayRow): Stats | null {
  return row.stats_json ? parseJson<Stats>(row.stats_json) : null;
}

export function dayReviewPoints(row: DayRow): ReviewPoint[] {
  return row.review_points_json ? parseJson<ReviewPoint[]>(row.review_points_json) : [];
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

/**
 * Insert, or refresh title/content/source_meta when client_uuid already exists.
 * Used by health re-posts (idempotent per date; always take latest payload).
 */
export function upsertNodeContent(db: Db, input: InsertNodeInput): NodeRecord {
  const existing = db
    .prepare(`SELECT * FROM nodes WHERE client_uuid = ?`)
    .get(input.client_uuid) as NodeRow | undefined;

  if (!existing) {
    return insertNode(db, input).node;
  }

  const title = input.title ?? null;
  const content = input.content ?? null;
  const source_meta = input.source_meta ?? null;
  db.prepare(
    `UPDATE nodes SET title = ?, content = ?, source_meta = ? WHERE client_uuid = ?`,
  ).run(
    title,
    content,
    source_meta ? JSON.stringify(source_meta) : null,
    input.client_uuid,
  );
  reindexNode(db, existing.id);
  const fresh = getNodeById(db, existing.id);
  if (!fresh) throw new Error(`node vanished after upsert: ${existing.id}`);
  return fresh;
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
    `INSERT INTO todos (id, day_id, text, done, status, source_node_id)
     VALUES (?, ?, ?, 0, 'suggested', ?)`,
  ).run(id, input.day_id, input.text, input.source_node_id ?? null);
  return {
    id,
    day_id: input.day_id,
    text: input.text,
    done: false,
    status: "suggested",
    source_node_id: input.source_node_id ?? null,
    accepted_reminder_id: null,
    accepted_at: null,
    dismissed_at: null,
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

/** Legacy PATCH: flips done; also mirrors status for accept/unaccept. */
export function setTodoDone(db: Db, id: string, done: boolean): TodoRecord | undefined {
  if (done) {
    db.prepare(
      `UPDATE todos SET done = 1, status = 'accepted',
       accepted_at = COALESCE(accepted_at, ?), dismissed_at = NULL WHERE id = ?`,
    ).run(nowIso(), id);
  } else {
    db.prepare(
      `UPDATE todos SET done = 0, status = 'suggested',
       accepted_reminder_id = NULL, accepted_at = NULL WHERE id = ?`,
    ).run(id);
  }
  return getTodo(db, id);
}

export function acceptTodo(
  db: Db,
  id: string,
  reminderId?: string | null,
): TodoRecord | undefined {
  const existing = getTodo(db, id);
  if (!existing) return undefined;
  const at = nowIso();
  db.prepare(
    `UPDATE todos SET status = 'accepted', done = 1,
     accepted_at = COALESCE(accepted_at, ?),
     accepted_reminder_id = COALESCE(?, accepted_reminder_id),
     dismissed_at = NULL
     WHERE id = ?`,
  ).run(at, reminderId ?? null, id);
  return getTodo(db, id);
}

export function dismissTodo(db: Db, id: string): TodoRecord | undefined {
  const existing = getTodo(db, id);
  if (!existing) return undefined;
  const at = nowIso();
  db.prepare(
    `UPDATE todos SET status = 'dismissed', done = 0,
     dismissed_at = COALESCE(dismissed_at, ?),
     accepted_reminder_id = NULL, accepted_at = NULL
     WHERE id = ?`,
  ).run(at, id);
  return getTodo(db, id);
}

/**
 * Auto-dismiss suggested todos older than `beforeDate` (YYYY-MM-DD exclusive).
 * Negative samples for preference loop when user never accepted.
 */
export function expireSuggestedTodos(db: Db, beforeDate: string): number {
  const at = nowIso();
  const r = db
    .prepare(
      `UPDATE todos SET status = 'dismissed', dismissed_at = ?
       WHERE status = 'suggested'
         AND day_id IN (SELECT id FROM days WHERE date < ?)`,
    )
    .run(at, beforeDate);
  return r.changes;
}

export function listTodosByStatus(db: Db, status: TodoStatus, limit = 30): TodoRecord[] {
  const rows = db
    .prepare(
      `SELECT t.* FROM todos t
       JOIN days d ON d.id = t.day_id
       WHERE t.status = ?
       ORDER BY d.date DESC, t.rowid DESC
       LIMIT ?`,
    )
    .all(status, limit) as TodoRow[];
  return rows.map(todoToRecord);
}

// ── user profile (singleton) ─────────────────────────────

interface ProfileRow {
  id: number;
  display_name: string | null;
  profession: string;
  profession_mode: string;
  note: string | null;
  last_inferred_profession: string;
  updated_at: string;
}

function profileToRecord(db: Db, row: ProfileRow): UserProfile {
  return {
    display_name: row.display_name,
    profession: row.profession as Profession,
    profession_mode: row.profession_mode as ProfessionMode,
    note: row.note,
    last_inferred_profession: row.last_inferred_profession as Profession,
    accepted_todos: listTodosByStatus(db, "accepted", 20).map((t) => t.text),
    dismissed_todos: listTodosByStatus(db, "dismissed", 20).map((t) => t.text),
    updated_at: row.updated_at,
  };
}

function readProfileRow(db: Db): ProfileRow {
  const row = db
    .prepare(`SELECT * FROM user_profile WHERE id = 1`)
    .get() as ProfileRow | undefined;
  if (row) return row;
  const at = nowIso();
  db.prepare(
    `INSERT INTO user_profile (
       id, display_name, profession, profession_mode, note,
       last_inferred_profession, updated_at
     ) VALUES (1, NULL, 'generalist', 'auto', NULL, 'generalist', ?)`,
  ).run(at);
  return {
    id: 1,
    display_name: null,
    profession: "generalist",
    profession_mode: "auto",
    note: null,
    last_inferred_profession: "generalist",
    updated_at: at,
  };
}

/** Full profile for GET /api/profile (includes live todo preference samples). */
export function getUserProfile(db: Db): UserProfile {
  return profileToRecord(db, readProfileRow(db));
}

/**
 * Apply Save-time profession inference. Always stores last_inferred.
 * When mode is auto, also overwrites effective profession.
 */
export function applyInferredProfession(db: Db, inferred: Profession): UserProfile {
  const row = readProfileRow(db);
  const at = nowIso();
  const nextProfession =
    row.profession_mode === "manual" ? row.profession : inferred;
  db.prepare(
    `UPDATE user_profile SET
       profession = ?,
       last_inferred_profession = ?,
       updated_at = ?
     WHERE id = 1`,
  ).run(nextProfession, inferred, at);
  return getUserProfile(db);
}

export function patchUserProfile(
  db: Db,
  patch: {
    display_name?: string | null;
    profession?: Profession;
    profession_mode?: ProfessionMode;
    note?: string | null;
  },
): UserProfile {
  const row = readProfileRow(db);
  const at = nowIso();

  let displayName =
    patch.display_name !== undefined ? patch.display_name : row.display_name;
  let note = patch.note !== undefined ? patch.note : row.note;
  let mode = (patch.profession_mode ?? row.profession_mode) as ProfessionMode;
  let profession = row.profession as Profession;
  const lastInferred = row.last_inferred_profession as Profession;

  if (patch.profession !== undefined) {
    profession = patch.profession;
    // Explicit profession without mode → lock to manual.
    if (patch.profession_mode === undefined) mode = "manual";
  }

  if (patch.profession_mode === "auto") {
    mode = "auto";
    profession = lastInferred;
  } else if (patch.profession_mode === "manual") {
    mode = "manual";
    if (patch.profession !== undefined) profession = patch.profession;
  }

  if (displayName !== null && displayName !== undefined) {
    displayName = displayName.trim() || null;
  }
  if (note !== null && note !== undefined) {
    note = note.trim() || null;
  }

  db.prepare(
    `UPDATE user_profile SET
       display_name = ?,
       profession = ?,
       profession_mode = ?,
       note = ?,
       updated_at = ?
     WHERE id = 1`,
  ).run(displayName, profession, mode, note, at);

  return getUserProfile(db);
}

export function collectionStatus(db: Db, date: string): CollectionStatus {
  const devices = db
    .prepare(
      `SELECT COUNT(*) AS device_count, MAX(last_seen_at) AS last_seen_at FROM devices`,
    )
    .get() as { device_count: number; last_seen_at: string | null };
  const placeholders = SAMPLER_NODE_KINDS.map(() => "?").join(",");
  const samples = db
    .prepare(
      `SELECT COUNT(*) AS sample_count
       FROM nodes n
       JOIN days d ON d.id = n.day_id
       WHERE d.date = ? AND n.kind IN (${placeholders})`,
    )
    .get(date, ...SAMPLER_NODE_KINDS) as { sample_count: number };
  return {
    device_count: devices.device_count,
    sample_count: samples.sample_count,
    last_seen_at: devices.last_seen_at,
  };
}

// ── cadence (sampler rhythm) ─────────────────────────────

/** Night mode runs from Save until the next local 06:00 boundary. */
export function currentCadence(
  db: Db,
  date = todayDate(),
  now = new Date(),
): CadenceMode {
  const day = getDayByDate(db, date);
  if (day?.saved_at) return "night";
  const currentDate = todayDate(now);
  if (date === currentDate && now.getHours() < 6) {
    return getDayByDate(db, addDays(currentDate, -1))?.saved_at ? "night" : "active";
  }
  return "active";
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
    meta: row.meta_json ? parseJson<Record<string, unknown>>(row.meta_json) : null,
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

/** Cursor = created_at|id of last item; returns newer-to-older page. */
export function listMessages(
  db: Db,
  opts?: { cursor?: string; limit?: number },
): { messages: MessageRecord[]; next_cursor: string | null } {
  const limit = Math.min(Math.max(opts?.limit ?? 50, 1), 100);
  const cur = decodeTimeIdCursor(opts?.cursor);
  const rows = (
    cur
      ? db
          .prepare(
            `SELECT * FROM messages
             WHERE created_at < ? OR (created_at = ? AND id < ?)
             ORDER BY created_at DESC, id DESC
             LIMIT ?`,
          )
          .all(cur.created_at, cur.created_at, cur.id, limit)
      : db
          .prepare(`SELECT * FROM messages ORDER BY created_at DESC, id DESC LIMIT ?`)
          .all(limit)
  ) as MessageRow[];
  const messages = rows.map(messageToRecord);
  const last = messages[messages.length - 1];
  const next_cursor =
    messages.length === limit && last
      ? encodeTimeIdCursor(last.created_at, last.id)
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
    input: parseJson<Record<string, unknown>>(row.input_json),
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

/** Requeue interrupted work on process startup; SQLite is the task authority. */
export function requeueRunningMeetingTasks(db: Db): number {
  const result = db
    .prepare(
      `UPDATE tasks
       SET status = 'queued', result_message_id = NULL, finished_at = NULL
       WHERE type = 'meeting_notes' AND status = 'running'`,
    )
    .run();
  return Number(result.changes ?? 0);
}

/** Atomically claim the oldest queued meeting-notes Task for this process. */
export function claimNextMeetingTask(db: Db): TaskRecord | undefined {
  let claimed: TaskRecord | undefined;
  db.transaction(() => {
    const row = db
      .prepare(
        `SELECT * FROM tasks
         WHERE type = 'meeting_notes' AND status = 'queued'
         ORDER BY created_at ASC, id ASC
         LIMIT 1`,
      )
      .get() as TaskRow | undefined;
    if (!row) return;

    const result = db
      .prepare(
        `UPDATE tasks
         SET status = 'running', result_message_id = NULL, finished_at = NULL
         WHERE id = ? AND status = 'queued'`,
      )
      .run(row.id);
    if (Number(result.changes ?? 0) !== 1) return;
    claimed = taskToRecord({
      ...row,
      status: "running",
      result_message_id: null,
      finished_at: null,
    });
  })();
  return claimed;
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
    content: parseJson<Record<string, unknown>>(row.content_json),
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

/** Latest card of a given type on a calendar day (e.g. daily briefing entry). */
export function getCardByTypeDate(
  db: Db,
  type: CardType | string,
  date: string,
): CardRecord | undefined {
  const row = db
    .prepare(
      `SELECT * FROM cards WHERE type = ? AND date = ?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .get(type, date) as CardRow | undefined;
  return row ? cardToRecord(row) : undefined;
}

/**
 * before = cards on dates ≤ today, newest first (past / briefing).
 * future = idea / todo_suggestion / health cards, newest first.
 * cursor encodes sort keys: time|id (future) or date|created_at|id (before).
 */
export function listCards(
  db: Db,
  opts: { direction: "before" | "future"; cursor?: string; limit?: number },
): { cards: CardRecord[]; next_cursor: string | null } {
  const limit = Math.min(Math.max(opts.limit ?? 30, 1), 100);
  const today = todayDate();
  let rows: CardRow[];
  if (opts.direction === "before") {
    const cur = decodeDateTimeIdCursor(opts.cursor);
    rows = (
      cur
        ? db
            .prepare(
              `SELECT * FROM cards
               WHERE date <= ?
                 AND (
                   date < ?
                   OR (date = ? AND created_at < ?)
                   OR (date = ? AND created_at = ? AND id < ?)
                 )
               ORDER BY date DESC, created_at DESC, id DESC
               LIMIT ?`,
            )
            .all(
              today,
              cur.date,
              cur.date,
              cur.created_at,
              cur.date,
              cur.created_at,
              cur.id,
              limit,
            )
        : db
            .prepare(
              `SELECT * FROM cards WHERE date <= ?
               ORDER BY date DESC, created_at DESC, id DESC LIMIT ?`,
            )
            .all(today, limit)
    ) as CardRow[];
  } else {
    const cur = decodeTimeIdCursor(opts.cursor);
    rows = (
      cur
        ? db
            .prepare(
              `SELECT * FROM cards
               WHERE type IN ('idea','todo_suggestion','health')
                 AND (created_at < ? OR (created_at = ? AND id < ?))
               ORDER BY created_at DESC, id DESC
               LIMIT ?`,
            )
            .all(cur.created_at, cur.created_at, cur.id, limit)
        : db
            .prepare(
              `SELECT * FROM cards
               WHERE type IN ('idea','todo_suggestion','health')
               ORDER BY created_at DESC, id DESC LIMIT ?`,
            )
            .all(limit)
    ) as CardRow[];
  }
  const cards = rows.map(cardToRecord);
  const last = cards[cards.length - 1];
  let next_cursor: string | null = null;
  if (cards.length === limit && last) {
    next_cursor =
      opts.direction === "before"
        ? encodeDateTimeIdCursor(last.date, last.created_at, last.id)
        : encodeTimeIdCursor(last.created_at, last.id);
  }
  return { cards, next_cursor };
}

// ── pagination cursors (stable composite keys) ───────────

/** created_at|id — for messages / future cards. */
export function encodeTimeIdCursor(created_at: string, id: string): string {
  return `${created_at}|${id}`;
}

export function decodeTimeIdCursor(
  cursor?: string,
): { created_at: string; id: string } | null {
  if (!cursor) return null;
  const i = cursor.indexOf("|");
  if (i <= 0 || i === cursor.length - 1) return null;
  return { created_at: cursor.slice(0, i), id: cursor.slice(i + 1) };
}

/** date|created_at|id — for before cards (matches ORDER BY date, created_at, id). */
export function encodeDateTimeIdCursor(
  date: string,
  created_at: string,
  id: string,
): string {
  return `${date}|${created_at}|${id}`;
}

export function decodeDateTimeIdCursor(
  cursor?: string,
): { date: string; created_at: string; id: string } | null {
  if (!cursor) return null;
  const parts = cursor.split("|");
  if (parts.length < 3) return null;
  const date = parts[0]!;
  const id = parts[parts.length - 1]!;
  const created_at = parts.slice(1, -1).join("|");
  if (!date || !created_at || !id) return null;
  return { date, created_at, id };
}

/**
 * Output score signal from reminder nodes on a day.
 * completed flag lives in source_meta; rate = completed / total (0 if none).
 */
export function reminderCompletionRate(
  db: Db,
  date: string,
): { total: number; done: number; rate: number; openTitles: string[] } {
  const nodes = listNodesByDate(db, date).filter((n) => n.kind === "reminder");
  // Latest snapshot per reminder_id wins (uuid flips on complete, so both may exist).
  const byId = new Map<string, { completed: boolean; title: string }>();
  for (const n of nodes) {
    const meta = n.source_meta ?? {};
    const rid = typeof meta.reminder_id === "string" ? meta.reminder_id : n.client_uuid;
    const completed = meta.completed === true;
    const title = n.title ?? "";
    const prev = byId.get(rid);
    // Prefer completed=true if either snapshot says so.
    if (!prev || completed)
      byId.set(rid, {
        completed: prev?.completed || completed,
        title: title || prev?.title || "",
      });
  }
  let done = 0;
  const openTitles: string[] = [];
  for (const v of byId.values()) {
    if (v.completed) done += 1;
    else if (v.title) openTitles.push(v.title);
  }
  const total = byId.size;
  return { total, done, rate: total === 0 ? 0 : done / total, openTitles };
}
