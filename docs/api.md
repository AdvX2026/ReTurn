# ReTurn Server HTTP API

> 权威实现：`packages/server/src/routes.ts`  
> 权威合同：`packages/shared/src/api.ts` + `domain.ts`（Zod）  
> 产品规格：`docs/PRD.md` v0.6 §6.2；检索增量见 `docs/global-search-prd.md`  
> 默认 base：`http://<pi-host>:8787`（`PORT` / `HOST` 可配）

单用户、家庭局域网。**合同变更须同步 Swift `Models.swift`**（`apps/ReturnApp` 落地后；当前见 issue #10）。

---

## 1. 约定

### 1.1 传输与格式

| 项 | 约定 |
|---|---|
| 协议 | HTTP/1.1，JSON UTF-8（`Content-Type: application/json`） |
| 语音 | `multipart/form-data` |
| 时间 | ISO-8601 datetime（`created_at` 等为服务端 UTC 戳） |
| 日历日 | `YYYY-MM-DD`，**按 Pi 本机时区**归日 |
| ID | UUID v4 字符串（除非另行说明） |
| 幂等 | 节点写入靠客户端 `client_uuid`；重复上报进 `duplicates` |

### 1.2 鉴权

| 机制 | 何时 |
|---|---|
| **开放 LAN** | `API_TOKEN` 未设置：除下方例外外，接口无鉴权（黑客松默认） |
| **`API_TOKEN`** | 若设置：除 `/api/ping`、`/api/health` 外，`/api/*` 需 `X-Return-Token: <token>` 或 `Authorization: Bearer <token>` |
| **`HEALTH_TOKEN`** | 仅 `POST /api/health`；未配置或占位值 → 该端点 **503** |

### 1.3 通用错误形

```json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "human-readable detail"
}
```

常见：`400` 校验失败 / 业务边界；`401` token 无效；`404` 资源不存在；`500` 内部错误；`503` 依赖未配置（health / ask 等）。

### 1.4 枚举速查

**NodeKind**  
`text` · `url` · `voice` · `save_note` · `app_sample` · `tab_sample` · `agent_session` · `git_commit` · `health_daily` · `snapshot` · `todo_check` · `idea` · `image`

**ChatIntent**  
`idea` · `retrieval` · `question` · `unknown`

**CadenceMode**  
`active`（当日未 Save）· `night`（当日已 Save）

**CardType**  
`briefing` · `idea` · `todo_suggestion` · `health` · `weekly`

**TaskType**  
`meeting_notes` · `image_extract` · `generic`

**TaskStatus**  
`queued` · `running` · `done` · `failed`

**CharacterState**  
`tired` · `productive` · `focused` · `inspired` · `normal`

**Stats**（0–100）  
`intake` · `focus` · `output` · `continuity` · `energy`

---

## 2. 端点一览

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/ping` | 探活 |
| POST | `/api/devices/register` | 设备注册 |
| POST | `/api/nodes` | 批量写入节点 |
| GET | `/api/nodes` | 按日列出节点 |
| DELETE | `/api/nodes/:id` | 删除节点 |
| POST | `/api/voice` | 上传语音 → 转写 → 落节点（可触发 chat） |
| POST | `/api/health` | 健康日数据（token） |
| POST | `/api/save` | 夜间 Save / 发酵 |
| GET | `/api/stats/today` | 实时五维 + cadence + 画像职业 |
| GET | `/api/profile` | 用户画像（单用户空间） |
| PATCH | `/api/profile` | 更新显示名 / 职业锁定 / note |
| GET | `/api/usage` | Provider 调用与 token 聚合 |
| GET | `/api/timeline` | 时间轴（单日或 from/to） |
| GET | `/api/days` | 近 N 日总览 |
| GET | `/api/search` | 全局混合检索 |
| POST | `/api/ask` | RAG 提问 |
| POST | `/api/chat` | 输入分诊 + 工作流 |
| GET | `/api/messages` | Now 对话流 |
| PATCH | `/api/messages/:id/intent` | 纠正意图 |
| GET | `/api/cards` | Before / Future 卡片 |
| GET | `/api/tasks` | 任务列表 |
| POST | `/api/resume` | 短休小复盘 |
| PATCH | `/api/todos/:id` | 勾选待办 |

---

## 3. 端点说明

### 3.1 `GET /api/ping`

探活 / outbox 心跳。

**响应 200**

```json
{
  "ok": true,
  "server_time": "2026-07-24T12:00:00.000Z",
  "version": "0.1.0"
}
```

---

### 3.2 `POST /api/devices/register`

**请求**

```json
{
  "name": "MacBook",
  "platform": "macos",
  "device_id": "optional-stable-uuid"
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string 1–120 | 必填 |
| `platform` | `macos`\|`ios`\|`linux`\|`unknown` | 默认 `unknown` |
| `device_id` | uuid? | 已知则复用 |

**响应 200** `{ "device_id": "<uuid>" }`

---

### 3.3 `POST /api/nodes`

采样 / 投喂 / 离线队列共用。按 `client_uuid` 幂等。

**请求**

```json
{
  "device_id": "<uuid>",
  "nodes": [
    {
      "client_uuid": "<uuid>",
      "kind": "text",
      "title": "optional",
      "content": "optional",
      "source_meta": {},
      "client_created_at": "2026-07-24T10:00:00.000Z",
      "date": "2026-07-24"
    }
  ]
}
```

| 字段 | 说明 |
|---|---|
| `nodes` | 1–500 条 |
| `client_created_at` | 仅进 `source_meta`；**不**覆盖服务端 `created_at` |
| `date` | 可选归日；默认 Pi 收到时的本地日 |

**响应 200**

```json
{
  "created": [ /* NodeRecord[] */ ],
  "duplicates": [ /* client_uuid[] */ ],
  "cadence": "active"
}
```

写入成功会同步维护 FTS；高价值 kind 入 embedding 队列。

---

### 3.4 `GET /api/nodes?date=YYYY-MM-DD`

默认 `date` = 今天。

**响应 200** `{ "date": "…", "nodes": [ /* NodeRecord */ ] }`

**NodeRecord**

| 字段 | 类型 |
|---|---|
| `id`, `day_id`, `client_uuid` | uuid |
| `device_id` | uuid \| null |
| `kind` | NodeKind |
| `title`, `content` | string \| null |
| `source_meta` | object \| null |
| `created_at` | datetime |
| `date` | `YYYY-MM-DD` |

---

### 3.5 `DELETE /api/nodes/:id`

**响应 200** `{ "ok": true, "id": "<uuid>" }` · **404** 不存在。  
同时清理 edges / FTS / embedding。

---

### 3.6 `POST /api/voice`

`multipart/form-data`：

| 字段 | 说明 |
|---|---|
| 文件字段 | 音频（必填） |
| `device_id` | 必填 |
| `client_uuid` | 可选，须为合法 UUID |
| `date` | 可选 |
| `title` | 可选 |

**响应 200** `{ "node": NodeRecord, "transcript": "…" }`  

转写失败仍落盘，`source_meta.pending_transcript`；有转写文本时会再走 chat 分诊（失败只打日志）。

---

### 3.7 `POST /api/health`

需 `HEALTH_TOKEN`（`X-Return-Token` 或 Bearer）。

**请求**

```json
{
  "date": "2026-07-24",
  "sleep_minutes": 420,
  "steps": 8000
}
```

按日幂等（确定性 `client_uuid`），重报刷新内容。  
**响应 200** `{ "node": NodeRecord }` · **401** / **503**。

---

### 3.8 `POST /api/save`

夜间检查点：发酵 + 属性结算 + cards；**同日幂等**。

**请求**

```json
{
  "date": "2026-07-24",
  "device_id": "<uuid?>",
  "note_text": "optional",
  "note_voice_ref": "<voice client_uuid or node id?>"
}
```

**响应 200（要点）**

| 字段 | 说明 |
|---|---|
| `already_saved` | 当日已存则 true，直接回已有结算 |
| `summary`, `opening_line`, `briefing?` | 文本产物 |
| `review_points` | `{ text, kind: win\|miss\|insight\|other }[]` |
| `todos` | 次日待办列表 |
| `stats`, `character_state`, `streak` | 定格属性 |
| `edges_created`, `cards_created?` | 计数 |
| `cadence` | 存后一般为 `night` |

会写 `todo_suggestion` / `briefing` / `health` / auto-`idea` 等 cards（视发酵输出）。  
满足触发条件时额外写 `weekly`（周日 Save 或第 7/14/… 个封存日）；周报 LLM 失败不回滚当日 Save。

---

### 3.9 `GET /api/usage?from=&to=`

默认聚合最近 30 个本地自然日。记录 LLM、转写、视觉与 embedding 的真实 provider 调用；只保存调用类型、操作、模型、成功/失败和 token 数，不保存 prompt、响应、错误正文或用户内容。

**响应 200**

```json
{
  "from": "2026-07-01",
  "to": "2026-07-25",
  "totals": {
    "calls": 12,
    "succeeded": 11,
    "failed": 1,
    "prompt_tokens": 2400,
    "completion_tokens": 800,
    "total_tokens": 3200
  },
  "breakdown": [
    {
      "kind": "llm",
      "operation": "ask",
      "model": "gpt-4o-mini",
      "calls": 3,
      "succeeded": 3,
      "failed": 0,
      "prompt_tokens": 900,
      "completion_tokens": 300,
      "total_tokens": 1200
    }
  ]
}
```

---

### 3.10 `GET /api/stats/today?date=`

**响应 200**

```json
{
  "date": "2026-07-24",
  "stats": { "intake": 0, "focus": 0, "output": 0, "continuity": 0, "energy": 100 },
  "character_state": "normal",
  "saved": false,
  "collection": {
    "device_count": 2,
    "sample_count": 48,
    "last_seen_at": "2026-07-24T18:35:00.000Z"
  },
  "cadence": "active",
  "profession": "coder",
  "profession_mode": "auto"
}
```

`profession` / `profession_mode` 来自单用户画像（见 `/api/profile`），不是当日重新推断。

---

### 3.10b `GET /api/profile`

单用户空间画像。

**响应 200**

```json
{
  "display_name": "Teethe",
  "profession": "coder",
  "profession_mode": "auto",
  "note": "prefer deep work todos",
  "last_inferred_profession": "coder",
  "accepted_todos": ["Ship profile API"],
  "dismissed_todos": ["Buy milk"],
  "updated_at": "2026-07-25T12:00:00.000Z"
}
```

| 字段 | 说明 |
|---|---|
| `profession` | 当前生效职业（auto 跟 Save 推断；manual 用户锁定） |
| `profession_mode` | `auto` \| `manual` |
| `last_inferred_profession` | 最近一次 Save 的 `resolveProfession` 结果 |
| `accepted_todos` / `dismissed_todos` | 偏好回环 live 样本（各最多 20 条文本） |

### 3.10c `PATCH /api/profile`

**请求**（至少一字段）：

```json
{
  "display_name": "Teethe",
  "profession": "designer",
  "profession_mode": "manual",
  "note": "…"
}
```

- 只改 `profession` 且不传 `profession_mode` → 自动锁为 `manual`
- `profession_mode: "auto"` → 把 `profession` 重置为 `last_inferred_profession`
- 空字符串 `display_name` / `note` → 清成 null

**响应 200**：同 GET body。

---

### 3.11 `GET /api/timeline`

| 查询 | 说明 |
|---|---|
| `date` | 单日，默认今天 |
| `from` & `to` | 闭区间；**最多 31 天**（含），超出 **400** |
| 仅 `from` 或仅 `to` | 另一端取同一天 |

**响应 200**

```json
{
  "date": "2026-07-22",
  "from": "2026-07-22",
  "to": "2026-07-23",
  "segments": [
    {
      "kind": "app",
      "start": "…",
      "end": "…",
      "label": "Cursor",
      "category": "dev",
      "node_id": null,
      "meta": {},
      "date": "2026-07-22"
    }
  ]
}
```

`kind`: `app` · `agent` · `sleep` · `feed`。单日时 `from`/`to` 可省略。

---

### 3.12 `GET /api/days?range=30`

`range` 1–90，默认 30。

**响应 200** `{ "range": 30, "days": [ DaySummary ], "streak": 0 }`

**DaySummary**：`date`, `saved_at`, `summary`, `stats`, `character_state`。

---

### 3.13 `GET /api/search`

全局混合检索（FTS bigram ± embedding RRF）。

| 查询 | 说明 |
|---|---|
| `q` | **必填**，1–500 字符 |
| `from`, `to` | 可选日期过滤 |
| `kinds` | 逗号分隔 kind |
| `limit` | 默认 20，最大 50 |

**响应 200**

```json
{
  "query": "评审",
  "took_ms": 12,
  "results": [
    {
      "doc_id": "node:<uuid>",
      "kind": "text",
      "score": 0.016,
      "snippet": "…",
      "node": { },
      "day": null
    }
  ]
}
```

`doc_id` 形如 `node:<uuid>` 或 `day:YYYY-MM-DD`。无 embedding 配置时自动关键词-only。

---

### 3.14 `POST /api/ask`

RAG：检索 top-8 → LLM → 校验引用。

**请求**

```json
{
  "question": "我上周评审说了什么？",
  "from": "2026-07-01",
  "to": "2026-07-24"
}
```

**响应 200**

```json
{
  "answer": "…",
  "citations": [
    {
      "node_id": "<uuid|null>",
      "date": "2026-07-20",
      "kind": "text",
      "title": "…",
      "snippet": "…"
    }
  ],
  "retrieved": 8
}
```

| 情况 | 行为 |
|---|---|
| 无 `LLM_API_KEY` | **503** |
| LLM 失败 | **500**；不返回伪答案或裸检索伪装的成功响应 |
| 无命中 | 固定「没在你的记录里找到…」类文案 |

---

### 3.15 `POST /api/chat`

输入分诊 + 工作流（PRD F4）。使用 **同一 `LLM_MODEL`** 做意图分类；provider 未配置时返回 **503**，调用失败时返回明确错误，不启用规则替代。

**请求**

```json
{
  "text": "灵感: 双向流",
  "image": "optional",
  "device_id": "<uuid?>",
  "intent": "idea"
}
```

`text` 与 `image` 至少一个。`intent` 可选（用户纠正 / 强制）。

**响应 200**

```json
{
  "message_id": "<agent msg uuid>",
  "user_message_id": "<user msg uuid>",
  "intent": "idea",
  "confidence": 0.9,
  "reply": "…",
  "jump": { "date": "…", "node_ids": [] },
  "task_id": null
}
```

| intent / 路径 | 行为 |
|---|---|
| `idea` | idea 节点 + Future idea 卡 |
| `retrieval` | search，可选 `jump` |
| `question` | ask / 检索摘要 |
| `unknown` | 请用户选择意图 |
| 长文/「会议纪要」 | Task `meeting_notes`（可异步 running→done） |
| 仅 image | 使用多模态 `LLM_MODEL` 提取；成功后 Task `image_extract` 为 `done` 并落高权重 image 节点 |

---

### 3.16 `GET /api/messages?cursor=&limit=`

Now 对话流，**新→旧**。

| 查询 | 默认 |
|---|---|
| `limit` | 50（1–100） |
| `cursor` | 复合：`created_at|id`（上一页最后一条） |

**响应 200**

```json
{
  "messages": [
    {
      "id": "…",
      "role": "user",
      "content": "…",
      "intent": "idea",
      "task_id": null,
      "created_at": "…",
      "meta": {}
    }
  ],
  "next_cursor": "2026-07-24T12:00:00.000Z|<uuid>"
}
```

`next_cursor` 为 `null` 表示没有更多。

---

### 3.17 `PATCH /api/messages/:id/intent`

**请求** `{ "intent": "retrieval" }`  

**响应 200** `{ "message": MessageRecord, "follow_up"?: ChatResponse }`  

若原消息为 user + `unknown`，纠正后可再跑 chat（`follow_up`）。

---

### 3.18 `GET /api/cards?direction=before|future&cursor=&limit=`

| 查询 | 说明 |
|---|---|
| `direction` | `before`（默认）或 `future` |
| `limit` | 默认 30，最大 100 |
| `cursor` | **before**：`date|created_at|id`；**future**：`created_at|id` |

**before**：`date ≤ today`，排序 `date DESC, created_at DESC, id DESC`（含 `briefing` / `weekly` / 当日 idea 等）  
**future**：类型 `idea` / `todo_suggestion` / `health`，排序 `created_at DESC, id DESC`

**响应 200**

```json
{
  "direction": "before",
  "cards": [
    {
      "id": "…",
      "type": "briefing",
      "date": "2026-07-23",
      "content": {},
      "created_at": "…"
    }
  ],
  "next_cursor": null
}
```

`content` 为开放 JSON：

| type | 主要字段 |
|---|---|
| `briefing` | summary, opening_line, stats, character_state, profession, streak, breakdown, … |
| `weekly` | week_start, week_end, summary, opening_line, highlights, day_dates, stats_avg, profession |
| `idea` | text, provenance, node_ids |
| `todo_suggestion` | todos, todo_ids |
| `health` | advice, sleep_minutes, steps |

**周报卡（`weekly`）产出规则（PRD P1）**：在 `POST /api/save` 成功封存当日后，若满足以下之一则追加一张（失败不回滚当日 Save）：

1. 封存日为**本地周日**；或  
2. 历史已封存天数（含当日）为 **7 的正倍数**。

同一 `week_end`（= Save 的 `date`）幂等，不重复写。窗口为 `week_end` 往前共 7 个自然日。

---

### 3.19 `GET /api/tasks?status=`

`status` 可选：`queued` · `running` · `done` · `failed`。

**响应 200** `{ "tasks": [ TaskRecord ] }`

**TaskRecord**：`id`, `type`, `status`, `input`, `result_message_id`, `created_at`, `finished_at`。

---

### 3.20 `POST /api/resume`

**请求** `{ "device_id"?: uuid, "hours"?: 1–24 }`（默认 hours=3）

**响应 200** `{ "message_id", "reply" }`

基于近几小时会话聚合；无明显会话时返回确定性事实文案，不调用 LLM。存在会话但 provider 未配置或调用失败时明确返回错误。成功结果写入 agent message。

---

### 3.21 `PATCH /api/todos/:id`

**请求** `{ "done": true, "device_id"?: uuid }`

**响应 200**

```json
{
  "todo": {
    "id": "…",
    "day_id": "…",
    "text": "…",
    "done": true,
    "source_node_id": null
  },
  "check_node": { /* NodeRecord kind=todo_check，仅 false→true 时非 null */ }
}
```

发酵产生的 todo 通常挂在 **Save 次日** 的 `day_id`。

---

## 4. 分页游标

| 资源 | 游标格式 | 排序 |
|---|---|---|
| messages | `created_at|id` | `created_at DESC, id DESC` |
| cards future | `created_at|id` | 同上 |
| cards before | `date|created_at|id` | `date DESC, created_at DESC, id DESC` |

客户端须把 `next_cursor` **原样**传回，勿只取时间戳。

---

## 5. 环境变量（与 API 相关）

| 变量 | 作用 |
|---|---|
| `PORT` / `HOST` / `DATA_DIR` | 监听与 SQLite 目录 |
| `API_TOKEN` | 可选全局 API 密钥 |
| `HEALTH_TOKEN` | `/api/health` |
| `LLM_BASE_URL` / `LLM_API_KEY` / `LLM_MODEL` | 发酵、ask、chat 分诊、resume 建议 |
| `WHISPER_*` | 语音转写（可回落 LLM_*） |
| `EMBEDDING_BASE_URL` / `API_KEY` / `MODEL` | 语义检索（**显式配置**，不回落 LLM） |

Embedding base 为 API root（如 `https://api.siliconflow.cn/v1`），不要带 `/embeddings`。

---

## 6. 典型调用顺序

```
1. POST /api/devices/register
2. POST /api/nodes          # 采样 / 投喂
3. POST /api/chat           # 对话
4. GET  /api/messages
5. GET  /api/cards?direction=future
6. POST /api/save           # 晚间
7. GET  /api/cards?direction=before
8. GET  /api/search?q=…
9. POST /api/ask            # 需 LLM
10. PATCH /api/todos/:id    # 次日勾选
```

---

## 7. 相关文档

| 文档 | 内容 |
|---|---|
| `docs/PRD.md` | 产品与 §6.2 合同意图 |
| `docs/global-search-prd.md` | 检索/Ask 设计 |
| `docs/architecture-nodes-search.md` | 节点分层与检索架构 |
| `docs/api-prd-alignment.md` | 实现 vs PRD 差异与简化说明 |
| `packages/shared/src/api.ts` | 可执行 schema 真相 |

文档版本与分支 `feat/global-search` / PR #8 实现对齐；以代码与 Zod 为准，若本文与代码冲突以代码为准。
