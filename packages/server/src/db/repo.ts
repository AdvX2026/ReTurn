import type {
  CharacterState,
  NodeKind,
  NodeRecord,
  ReviewPoint,
  Stats,
  TodoRecord,
} from "@return/shared";
import type { Db } from "./schema.js";
import { nowIso, todayDate, uuid } from "../util/time.js";

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
    const existing = db
      .prepare(`SELECT * FROM devices WHERE id = ?`)
      .get(input.id) as DeviceRow | undefined;
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
  db.prepare(`UPDATE devices SET last_seen_at = ? WHERE id = ?`).run(
    nowIso(),
    deviceId,
  );
}

export function getDevice(db: Db, id: string): DeviceRow | undefined {
  return db.prepare(`SELECT * FROM devices WHERE id = ?`).get(id) as
    | DeviceRow
    | undefined;
}

// ── days ─────────────────────────────────────────────────

export function ensureDay(db: Db, date: string): DayRow {
  const existing = db
    .prepare(`SELECT * FROM days WHERE date = ?`)
    .get(date) as DayRow | undefined;
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
  return db.prepare(`SELECT * FROM days WHERE date = ?`).get(date) as
    | DayRow
    | undefined;
}

export function getDayById(db: Db, id: string): DayRow | undefined {
  return db.prepare(`SELECT * FROM days WHERE id = ?`).get(id) as
    | DayRow
    | undefined;
}

export function listSavedDays(db: Db, sinceDate: string): DayRow[] {
  return db
    .prepare(
      `SELECT * FROM days WHERE date >= ? AND saved_at IS NOT NULL ORDER BY date ASC`,
    )
    .all(sinceDate) as DayRow[];
}

export function listDaysInRange(
  db: Db,
  startDate: string,
  endDate: string,
): DayRow[] {
  return db
    .prepare(
      `SELECT * FROM days WHERE date >= ? AND date <= ? ORDER BY date ASC`,
    )
    .all(startDate, endDate) as DayRow[];
}

export function getLatestSavedDay(
  db: Db,
  beforeDate?: string,
): DayRow | undefined {
  if (beforeDate) {
    return db
      .prepare(
        `SELECT * FROM days WHERE saved_at IS NOT NULL AND date < ? ORDER BY date DESC LIMIT 1`,
      )
      .get(beforeDate) as DayRow | undefined;
  }
  return db
    .prepare(
      `SELECT * FROM days WHERE saved_at IS NOT NULL ORDER BY date DESC LIMIT 1`,
    )
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
  const source_meta = input.source_meta
    ? JSON.stringify(input.source_meta)
    : null;

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

export function getNodeByClientUuid(
  db: Db,
  clientUuid: string,
): NodeRecord | undefined {
  const row = db
    .prepare(`SELECT * FROM nodes WHERE client_uuid = ?`)
    .get(clientUuid) as NodeRow | undefined;
  if (!row) return undefined;
  const day = getDayById(db, row.day_id);
  if (!day) return undefined;
  return nodeToRecord(row, day.date);
}

export function deleteNode(db: Db, id: string): boolean {
  const info = db.prepare(`DELETE FROM nodes WHERE id = ?`).run(id);
  return info.changes > 0;
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

export function todoCompletionRate(db: Db, dayId: string): {
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
