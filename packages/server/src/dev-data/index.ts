import type { NodeKind } from "@return/shared";
import {
  ensureDay,
  getUserProfile,
  insertCard,
  insertEdge,
  insertMessage,
  insertNode,
  insertTodo,
  markDaySaved,
  upsertDevice,
} from "../db/repo.js";
import type { Db } from "../db/schema.js";
import { computeLiveStats } from "../stats/live.js";
import { addDays, lastNDays, parseDate, todayDate, uuid } from "../util/time.js";

const DATA_TABLES = [
  "devices",
  "days",
  "nodes",
  "edges",
  "todos",
  "messages",
  "tasks",
  "cards",
  "llm_usage",
  "search_fts",
  "embed_queue",
  "node_embeddings",
] as const;

type DataTable = (typeof DATA_TABLES)[number];

export interface MockDataOptions {
  days?: number;
  endDate?: string;
  rng?: () => number;
}

export interface MockDataResult {
  startDate: string;
  endDate: string;
  days: number;
  nodes: number;
  savedDays: number;
  edges: number;
  devices: number;
}

export interface InspectOptions {
  date?: string;
  kind?: string;
  limit?: number;
}

export interface InspectResult {
  counts: Record<DataTable, number>;
  days: Array<{
    date: string;
    saved: boolean;
    nodes: number;
    summary: string | null;
  }>;
  nodes: Array<{
    id: string;
    date: string;
    kind: string;
    title: string | null;
    content: string | null;
    source_meta: Record<string, unknown> | null;
    created_at: string;
  }>;
}

interface GeneratedDay {
  date: string;
  dayId: string;
  primaryNodeId: string;
  shouldSave: boolean;
}

interface AppDefinition {
  name: string;
  bundleId: string;
}

const APPS = {
  calendar: { name: "Calendar", bundleId: "com.apple.iCal" },
  figma: { name: "Figma", bundleId: "com.figma.Desktop" },
  messages: { name: "Messages", bundleId: "com.apple.MobileSMS" },
  music: { name: "Music", bundleId: "com.apple.Music" },
  notes: { name: "Notes", bundleId: "com.apple.Notes" },
  safari: { name: "Safari", bundleId: "com.apple.Safari" },
  slack: { name: "Slack", bundleId: "com.tinyspeck.slackmacgap" },
  vscode: { name: "Visual Studio Code", bundleId: "com.microsoft.VSCode" },
} as const;

const TEXTS = [
  "今天把同步重试的问题理清了，明天补错误提示。",
  "午后专注度不错，先完成核心流程，再处理细节。",
  "用户真正需要的是快速回到上下文，而不是更多入口。",
  "记得把演示环境的网络异常也走一遍。",
  "晚上散步时想到：日报可以先给一句结论，再展开证据。",
];

const IDEAS = [
  "把最近三天反复出现的主题自动聚成一个继续入口",
  "在保存当天时展示一张很轻的情绪与能量对照卡",
  "搜索结果优先展示能直接恢复工作的上下文片段",
  "周末回顾只保留真正改变下周安排的三件事",
];

const REMINDERS = [
  "回复设计评审意见",
  "整理演示脚本",
  "预约牙医",
  "买咖啡豆和牛奶",
  "更新项目周报",
  "晚饭后散步 30 分钟",
  "检查备份是否完成",
];

const EMAIL_SUBJECTS = [
  "本周产品同步",
  "设计评审反馈",
  "演示环境确认",
  "下周安排",
  "测试结果汇总",
  "会议时间调整",
];

const TAB_PAGES = [
  {
    title: "SwiftUI documentation",
    url: "https://developer.apple.com/documentation/swiftui",
  },
  { title: "SQLite documentation", url: "https://sqlite.org/docs.html" },
  { title: "Fastify documentation", url: "https://fastify.dev/docs/latest/" },
  { title: "ReTurn product notes", url: "https://example.test/return/product-notes" },
  { title: "Weekend walking route", url: "https://example.test/maps/walking-route" },
];

const COMMIT_SUBJECTS = [
  "fix timeline event ordering",
  "add empty state copy",
  "tighten node input validation",
  "update daily summary layout",
  "cover retry behavior in tests",
];

export function generateMockData(db: Db, options: MockDataOptions = {}): MockDataResult {
  const days = options.days ?? 14;
  if (!Number.isInteger(days) || days < 1 || days > 90) {
    throw new Error("days must be an integer from 1 to 90");
  }
  const endDate = options.endDate ?? todayDate();
  assertDate(endDate, "endDate");
  const rng = options.rng ?? Math.random;
  const dates = lastNDays(days, endDate);

  return db.transaction(() => {
    const existing = countData(db);
    const profile = getUserProfile(db);
    const hasProfileData =
      profile.display_name !== null ||
      profile.note !== null ||
      profile.profession !== "generalist" ||
      profile.profession_mode !== "auto" ||
      profile.last_inferred_profession !== "generalist";
    if (
      existing.devices > 0 ||
      existing.days > 0 ||
      existing.nodes > 0 ||
      existing.messages > 0 ||
      existing.tasks > 0 ||
      existing.cards > 0 ||
      existing.llm_usage > 0 ||
      hasProfileData
    ) {
      throw new Error(
        "database is not empty; inspect it or clear it before generating mock data",
      );
    }
    const mac = upsertDevice(db, { name: "Mock MacBook Pro", platform: "macos" });
    const phone = upsertDevice(db, { name: "Mock iPhone", platform: "ios" });
    const generated: GeneratedDay[] = [];
    for (const date of dates) {
      generated.push(generateDay(db, date, endDate, mac.id, phone.id, rng));
    }

    let edgeCount = 0;
    for (let index = 1; index < generated.length; index += 1) {
      const previous = generated[index - 1]!;
      const current = generated[index]!;
      if (!chance(rng, 0.72)) continue;
      insertEdge(db, {
        src_node_id: current.primaryNodeId,
        dst_node_id: previous.primaryNodeId,
        relation: choice(rng, ["continues", "related_to", "inspired_by"]),
        created_by_day_id: current.dayId,
      });
      edgeCount += 1;
    }

    for (const day of generated) {
      if (!day.shouldSave) continue;
      finalizeSavedDay(db, day.date, day.dayId, day.primaryNodeId, rng);
    }

    const counts = countData(db);
    return {
      startDate: dates[0]!,
      endDate,
      days,
      nodes: counts.nodes,
      savedDays: generated.filter((day) => day.shouldSave).length,
      edges: edgeCount,
      devices: 2,
    };
  })();
}

function generateDay(
  db: Db,
  date: string,
  endDate: string,
  macDeviceId: string,
  phoneDeviceId: string,
  rng: () => number,
): GeneratedDay {
  const day = ensureDay(db, date);
  const weekday = parseDate(date).getDay();
  const isWeekend = weekday === 0 || weekday === 6;
  const sleepMinutes = randomInt(rng, isWeekend ? 430 : 365, isWeekend ? 535 : 485);
  const steps = randomInt(rng, isWeekend ? 5_000 : 2_500, isWeekend ? 14_000 : 11_000);

  addNode(db, {
    date,
    deviceId: phoneDeviceId,
    kind: "health_daily",
    hour: 7,
    minute: randomInt(rng, 0, 45),
    title: `Health ${date}`,
    content: JSON.stringify({ sleep_minutes: sleepMinutes, steps }),
    meta: { sleep_minutes: sleepMinutes, steps, source: "mock" },
  });

  if (isWeekend) {
    addAppBlock(db, date, macDeviceId, APPS.safari, 10, 10, randomInt(rng, 45, 80), rng);
    addAppBlock(db, date, macDeviceId, APPS.notes, 14, 0, randomInt(rng, 20, 45), rng);
    addAppBlock(db, date, macDeviceId, APPS.music, 18, 0, randomInt(rng, 35, 70), rng);
  } else {
    const offset = randomInt(rng, -10, 15);
    addAppBlock(db, date, macDeviceId, APPS.calendar, 9, offset, 20, rng);
    addAppBlock(db, date, macDeviceId, APPS.slack, 9, 25 + offset, 25, rng);
    addAppBlock(
      db,
      date,
      macDeviceId,
      APPS.vscode,
      10,
      offset,
      randomInt(rng, 85, 130),
      rng,
    );
    addAppBlock(db, date, macDeviceId, APPS.safari, 12, 0, randomInt(rng, 20, 40), rng);
    addAppBlock(
      db,
      date,
      macDeviceId,
      APPS.vscode,
      13,
      30,
      randomInt(rng, 100, 155),
      rng,
    );
    if (chance(rng, 0.55)) {
      addAppBlock(db, date, macDeviceId, APPS.figma, 16, 15, randomInt(rng, 25, 55), rng);
    }
    addAppBlock(
      db,
      date,
      macDeviceId,
      chance(rng, 0.65) ? APPS.vscode : APPS.messages,
      17,
      20,
      randomInt(rng, 30, 75),
      rng,
    );
  }

  const primaryKind: NodeKind = chance(rng, 0.42) ? "idea" : "text";
  const primaryContent = primaryKind === "idea" ? choice(rng, IDEAS) : choice(rng, TEXTS);
  const primary = addNode(db, {
    date,
    deviceId: chance(rng, 0.35) ? phoneDeviceId : macDeviceId,
    kind: primaryKind,
    hour: isWeekend ? randomInt(rng, 11, 20) : randomInt(rng, 10, 19),
    minute: randomInt(rng, 0, 59),
    title: primaryContent.slice(0, 32),
    content: primaryContent,
    meta: { source: "mock", provenance: "user", tags: mockTags(rng) },
  });

  const extraFeeds = randomInt(rng, isWeekend ? 1 : 2, isWeekend ? 3 : 5);
  for (let index = 0; index < extraFeeds; index += 1) {
    const kind: NodeKind = chance(rng, 0.28)
      ? "url"
      : chance(rng, 0.35)
        ? "idea"
        : "text";
    const content = kind === "idea" ? choice(rng, IDEAS) : choice(rng, TEXTS);
    const page = kind === "url" ? choice(rng, TAB_PAGES) : undefined;
    addNode(db, {
      date,
      deviceId: chance(rng, 0.3) ? phoneDeviceId : macDeviceId,
      kind,
      hour: randomInt(rng, 9, 21),
      minute: randomInt(rng, 0, 59),
      title: page?.title ?? content.slice(0, 32),
      content: page?.url ?? content,
      meta: { source: "mock", provenance: "user", tags: mockTags(rng) },
    });
  }

  addPointData(db, date, macDeviceId, phoneDeviceId, isWeekend, rng);

  return {
    date,
    dayId: day.id,
    primaryNodeId: primary.id,
    shouldSave: date !== endDate && (date === addDays(endDate, -1) || chance(rng, 0.82)),
  };
}

function addPointData(
  db: Db,
  date: string,
  macDeviceId: string,
  phoneDeviceId: string,
  isWeekend: boolean,
  rng: () => number,
): void {
  const tabCount = randomInt(rng, isWeekend ? 2 : 5, isWeekend ? 6 : 12);
  for (let index = 0; index < tabCount; index += 1) {
    const page = choice(rng, TAB_PAGES);
    const sampledAt = timestamp(date, randomInt(rng, 9, 21), randomInt(rng, 0, 59));
    insertNode(db, {
      client_uuid: uuid(),
      kind: "tab_sample",
      title: page.title,
      content: page.url,
      device_id: macDeviceId,
      date,
      created_at: sampledAt,
      source_meta: {
        browser: "Safari",
        title: page.title,
        url: page.url,
        sampled_at: sampledAt,
        source: "mock",
      },
    });
  }

  const reminderCount = randomInt(rng, 3, 6);
  for (let index = 0; index < reminderCount; index += 1) {
    const reminderId = uuid();
    addNode(db, {
      date,
      deviceId: phoneDeviceId,
      kind: "reminder",
      hour: randomInt(rng, 8, 20),
      minute: randomInt(rng, 0, 59),
      title: choice(rng, REMINDERS),
      content: null,
      meta: {
        reminder_id: reminderId,
        completed: chance(rng, isWeekend ? 0.6 : 0.72),
        source: "mock",
      },
    });
  }

  if (!isWeekend) {
    const emailCount = randomInt(rng, 4, 11);
    for (let index = 0; index < emailCount; index += 1) {
      const direction = chance(rng, 0.28) ? "sent" : "received";
      const at = timestamp(date, randomInt(rng, 8, 18), randomInt(rng, 0, 59));
      const subject = choice(rng, EMAIL_SUBJECTS);
      insertNode(db, {
        client_uuid: uuid(),
        kind: "email",
        title: subject,
        content: `${subject}：这是用于开发界面测试的模拟邮件摘要。`,
        device_id: macDeviceId,
        date,
        created_at: at,
        source_meta: {
          direction,
          from: direction === "sent" ? "me@example.test" : "team@example.test",
          to: direction === "sent" ? "team@example.test" : "me@example.test",
          received_at: at,
          message_id: uuid(),
          source: "mock",
        },
      });
    }

    const agentCount = randomInt(rng, 1, 3);
    for (let index = 0; index < agentCount; index += 1) {
      const startHour = randomInt(rng, 10, 17);
      const startMinute = randomInt(rng, 0, 45);
      const duration = randomInt(rng, 25, 105);
      const start = timestamp(date, startHour, startMinute);
      const end = new Date(Date.parse(start) + duration * 60_000).toISOString();
      insertNode(db, {
        client_uuid: uuid(),
        kind: "agent_session",
        title: "ReTurn",
        content: `Codex ReTurn ${duration}min`,
        device_id: macDeviceId,
        date,
        created_at: end,
        source_meta: {
          provider: chance(rng, 0.5) ? "codex" : "claude",
          project: "ReTurn",
          start,
          end,
          duration_min: duration,
          source: "mock",
        },
      });
    }

    const commitCount = randomInt(rng, 0, 4);
    for (let index = 0; index < commitCount; index += 1) {
      const subject = choice(rng, COMMIT_SUBJECTS);
      addNode(db, {
        date,
        deviceId: macDeviceId,
        kind: "git_commit",
        hour: randomInt(rng, 11, 19),
        minute: randomInt(rng, 0, 59),
        title: subject,
        content: subject,
        meta: {
          repo: "ReTurn",
          subject,
          sha: randomHex(rng, 8),
          source: "mock",
        },
      });
    }
  }
}

function addAppBlock(
  db: Db,
  date: string,
  deviceId: string,
  app: AppDefinition,
  hour: number,
  minute: number,
  durationMinutes: number,
  rng: () => number,
): void {
  const start = localDate(date, hour, minute);
  for (let elapsed = 0; elapsed <= durationMinutes; elapsed += 5) {
    const sampledAt = new Date(start.getTime() + elapsed * 60_000).toISOString();
    insertNode(db, {
      client_uuid: uuid(),
      kind: "app_sample",
      title: app.name,
      content: app.name,
      device_id: deviceId,
      date,
      created_at: sampledAt,
      source_meta: {
        app: app.name,
        bundle_id: app.bundleId,
        sampled_at: sampledAt,
        source: "mock",
        tags: mockTags(rng),
      },
    });
  }
}

function addNode(
  db: Db,
  input: {
    date: string;
    deviceId: string;
    kind: NodeKind;
    hour: number;
    minute: number;
    title: string;
    content: string | null;
    meta: Record<string, unknown>;
  },
) {
  const createdAt = timestamp(input.date, input.hour, input.minute);
  return insertNode(db, {
    client_uuid: uuid(),
    kind: input.kind,
    title: input.title,
    content: input.content,
    device_id: input.deviceId,
    date: input.date,
    created_at: createdAt,
    source_meta: { ...input.meta, client_created_at: createdAt },
  }).node;
}

function finalizeSavedDay(
  db: Db,
  date: string,
  dayId: string,
  primaryNodeId: string,
  rng: () => number,
): void {
  const summary = choice(rng, [
    "今天主要推进了 ReTurn 的核心体验，工作节奏稳定，也留出了恢复精力的时间。",
    "上午处理沟通与规划，下午完成了一段较完整的深度工作，关键事项已有进展。",
    "今天的输入不少，但最终收束到了少数重要问题上，明天可以直接延续。",
  ]);
  const openingLine = choice(rng, [
    "你把零散输入收成了一条清晰主线。",
    "今天不是最忙的一天，但重要事情在向前走。",
    "节奏有起伏，不过关键上下文已经保存好了。",
  ]);
  const saveAt = timestamp(date, randomInt(rng, 20, 22), randomInt(rng, 5, 55));
  const saveNote = insertNode(db, {
    client_uuid: uuid(),
    kind: "save_note",
    title: "Save Today",
    content: summary,
    date,
    created_at: saveAt,
    source_meta: { source: "mock", tags: ["daily-review"] },
  }).node;
  const live = computeLiveStats(db, date);
  const reviewPoints = [
    { text: "完成了当天最重要的一段工作", kind: "win" as const },
    { text: choice(rng, IDEAS), kind: "insight" as const },
  ];

  markDaySaved(db, dayId, {
    saved_at: saveAt,
    save_note_node_id: saveNote.id,
    summary,
    opening_line: openingLine,
    review_points: reviewPoints,
    stats: live.stats,
    character_state: live.character_state,
  });

  const todoIds: string[] = [];
  const todoTexts = sampleDistinct(rng, REMINDERS, randomInt(rng, 1, 3));
  for (const text of todoTexts) {
    const todo = insertTodo(db, { day_id: dayId, text, source_node_id: primaryNodeId });
    todoIds.push(todo.id);
    const status = weightedChoice(rng, [
      ["accepted", 0.42],
      ["dismissed", 0.23],
      ["suggested", 0.35],
    ] as const);
    if (status === "accepted") {
      db.prepare(
        `UPDATE todos SET done = 1, status = 'accepted', accepted_at = ?, accepted_reminder_id = ? WHERE id = ?`,
      ).run(saveAt, uuid(), todo.id);
    } else if (status === "dismissed") {
      db.prepare(
        `UPDATE todos SET status = 'dismissed', dismissed_at = ? WHERE id = ?`,
      ).run(saveAt, todo.id);
    }
  }

  const briefing = `${openingLine} ${summary}`;
  const card = insertCard(db, {
    type: "briefing",
    date,
    content: {
      summary,
      opening_line: openingLine,
      briefing,
      review_points: reviewPoints,
      stats: live.stats,
      character_state: live.character_state,
      node_ids: [primaryNodeId, saveNote.id],
    },
  });
  db.prepare(`UPDATE cards SET created_at = ? WHERE id = ?`).run(saveAt, card.id);

  if (todoTexts.length > 0) {
    const todoCard = insertCard(db, {
      type: "todo_suggestion",
      date,
      content: { todos: todoTexts, todo_ids: todoIds },
    });
    db.prepare(`UPDATE cards SET created_at = ? WHERE id = ?`).run(saveAt, todoCard.id);
  }

  if (chance(rng, 0.45)) {
    const messageAt = timestamp(date, randomInt(rng, 18, 21), randomInt(rng, 0, 59));
    const user = insertMessage(db, {
      role: "user",
      content: choice(rng, [
        "今天最值得记住的是什么？",
        "帮我记下这个想法",
        "明天从哪里继续？",
      ]),
      intent: "question",
      created_at: messageAt,
    });
    insertMessage(db, {
      role: "agent",
      content: openingLine,
      intent: "question",
      meta: { user_message_id: user.id, source: "mock" },
      created_at: new Date(Date.parse(messageAt) + 4_000).toISOString(),
    });
  }
}

export function clearData(db: Db): Record<DataTable, number> {
  const before = countData(db);
  db.transaction(() => {
    db.exec(`DELETE FROM node_embeddings`);
    db.exec(`DELETE FROM embed_queue`);
    db.exec(`DELETE FROM search_fts`);
    db.exec(`DELETE FROM edges`);
    db.exec(`DELETE FROM todos`);
    db.exec(`DELETE FROM nodes`);
    db.exec(`DELETE FROM days`);
    db.exec(`DELETE FROM messages`);
    db.exec(`DELETE FROM tasks`);
    db.exec(`DELETE FROM cards`);
    db.exec(`DELETE FROM llm_usage`);
    db.exec(`DELETE FROM devices`);
    db.prepare(
      `UPDATE user_profile SET
         display_name = NULL,
         profession = 'generalist',
         profession_mode = 'auto',
         note = NULL,
         last_inferred_profession = 'generalist',
         updated_at = ?
       WHERE id = 1`,
    ).run(new Date().toISOString());
  })();
  return before;
}

export function inspectData(db: Db, options: InspectOptions = {}): InspectResult {
  if (options.date) assertDate(options.date, "date");
  const limit = options.limit ?? 20;
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) {
    throw new Error("limit must be an integer from 1 to 200");
  }

  const clauses: string[] = [];
  const params: unknown[] = [];
  if (options.date) {
    clauses.push("d.date = ?");
    params.push(options.date);
  }
  if (options.kind) {
    clauses.push("n.kind = ?");
    params.push(options.kind);
  }
  const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";
  params.push(limit);

  const nodes = db
    .prepare(
      `SELECT n.id, d.date, n.kind, n.title, n.content, n.source_meta, n.created_at
       FROM nodes n JOIN days d ON d.id = n.day_id
       ${where}
       ORDER BY n.created_at DESC
       LIMIT ?`,
    )
    .all(...params)
    .map((row) => {
      const value = row as Omit<InspectResult["nodes"][number], "source_meta"> & {
        source_meta: string | null;
      };
      return {
        ...value,
        source_meta: value.source_meta
          ? (JSON.parse(value.source_meta) as Record<string, unknown>)
          : null,
      };
    });

  const days = db
    .prepare(
      `SELECT d.date, d.saved_at IS NOT NULL AS saved, COUNT(n.id) AS nodes, d.summary
       FROM days d LEFT JOIN nodes n ON n.day_id = d.id
       GROUP BY d.id
       ORDER BY d.date DESC
       LIMIT 30`,
    )
    .all()
    .map((row) => {
      const value = row as {
        date: string;
        saved: number;
        nodes: number;
        summary: string | null;
      };
      return { ...value, saved: value.saved === 1 };
    });

  return { counts: countData(db), days, nodes };
}

function countData(db: Db): Record<DataTable, number> {
  return Object.fromEntries(
    DATA_TABLES.map((table) => {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
        count: number;
      };
      return [table, row.count];
    }),
  ) as Record<DataTable, number>;
}

function localDate(date: string, hour: number, minute: number): Date {
  const value = parseDate(date);
  value.setHours(hour, minute, 0, 0);
  return value;
}

function timestamp(date: string, hour: number, minute: number): string {
  return localDate(date, hour, minute).toISOString();
}

function assertDate(value: string, name: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || todayDate(parseDate(value)) !== value) {
    throw new Error(`${name} must be a valid YYYY-MM-DD date`);
  }
}

function chance(rng: () => number, probability: number): boolean {
  return rng() < probability;
}

function randomInt(rng: () => number, min: number, max: number): number {
  return Math.floor(rng() * (max - min + 1)) + min;
}

function choice<T>(rng: () => number, values: readonly T[]): T {
  return values[Math.floor(rng() * values.length)]!;
}

function sampleDistinct<T>(rng: () => number, values: readonly T[], count: number): T[] {
  const pool = [...values];
  const result: T[] = [];
  while (result.length < count && pool.length > 0) {
    result.push(pool.splice(randomInt(rng, 0, pool.length - 1), 1)[0]!);
  }
  return result;
}

function weightedChoice<T>(
  rng: () => number,
  values: ReadonlyArray<readonly [T, number]>,
): T {
  const roll = rng();
  let total = 0;
  for (const [value, weight] of values) {
    total += weight;
    if (roll < total) return value;
  }
  return values[values.length - 1]![0];
}

function mockTags(rng: () => number): string[] {
  return sampleDistinct(
    rng,
    ["return", "product", "development", "design"],
    randomInt(rng, 1, 2),
  );
}

function randomHex(rng: () => number, length: number): string {
  const chars = "0123456789abcdef";
  return Array.from({ length }, () => chars[randomInt(rng, 0, chars.length - 1)]).join(
    "",
  );
}
