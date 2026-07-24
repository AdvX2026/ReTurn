# Server API ↔ PRD 对齐说明（global-search 分支）

> **不修改** `docs/PRD.md` / origin/main 最新 PRD。  
> 权威产品规格：`origin/main` 的 **PRD v0.6** §6.2（见远程，本 worktree 内 PRD 文件可能仍是 v0.5 拷贝，**以 main 为准**）。  
> 权威实现：本分支 `packages/server/src/routes.ts` + `packages/shared/src/api.ts`。  
> 目的：在本 worktree 内把「PRD 要的 API」与「server 已有 API」对齐成可执行清单；**做不到的整面能力不在本分支硬实现**，只记缺口与建议落地顺序。

---

## 1. 结论

| 范围 | 状态 |
|---|---|
| PRD v0.5 基座（devices/nodes/voice/health/save/continue/stats/timeline/days/todos/ping） | **已实现**，与 v0.5 合同一致 |
| PRD v0.6 新增（chat / messages / cards / tasks / resume + 节奏模式 + 发酵扩字段） | **未实现**；属产品转向整面，需独立合同扩展 PR，**不在 global-search 范围硬凑** |
| 本分支增量（`GET /api/search` / `POST /api/ask` + 检索索引） | **已实现**；PRD v0.6 §6.2 **未列出**，属「对空间提问 / RAG」能力的工程落地，**不改 PRD**，仅在此文档登记 |
| `git_commit` NodeKind | 本分支 shared **已加**；PRD T1 预留；sampler 上报另分支 |

**本分支能做的对齐**：把 v0.5 基座 + search/ask 的契约写清楚，标明与 v0.6 的差异与后续合同 PR 该补什么。  
**本分支不应做的**：在未冻结 shared 合同前实现整套 chat/messages/cards（会与 main v0.6 并行分叉）。

---

## 2. 端点对照（PRD v0.6 §6.2 vs 本分支 server）

### 2.1 已实现（可直接对接客户端 / curl）

| 方法 | 路径 | 请求（要点） | 响应（要点） | 备注 |
|---|---|---|---|---|
| GET | `/api/ping` | — | `{ ok, server_time, version }` | outbox 探活 |
| POST | `/api/devices/register` | `{ name, platform?, device_id? }` | `{ device_id }` | 幂等复用可选 device_id |
| POST | `/api/nodes` | `{ device_id, nodes[] }` 每节点含 `client_uuid`+`kind` | `{ created[], duplicates[] }` | 采样/投喂共用；**无** PRD 要求的节奏模式字段 |
| GET | `/api/nodes` | `?date=YYYY-MM-DD` | `{ date, nodes }` | 默认今天 |
| DELETE | `/api/nodes/:id` | — | `{ ok, id }` | 错误抓取兜底 |
| POST | `/api/voice` | multipart：音频 + `device_id` + 可选 `client_uuid`/`date`/`title` | `{ node, transcript }` | 转写失败仍落盘；**未**进分诊/chat |
| POST | `/api/health` | `{ date, sleep_minutes, steps }` + token 头 | `{ node }` | `x-return-token` / Bearer；按日幂等刷新 |
| POST | `/api/save` | `{ date, device_id?, note_text?, note_voice_ref? }` | SaveResponse（summary/opening_line/review_points/todos/stats/…） | 发酵仍是 **v0.5** 字段，非 v0.6 briefing/cards |
| GET | `/api/continue` | — | Before/Future + stats | **PRD v0.6 未再列出**；实现保留（过渡） |
| GET | `/api/stats/today` | `?date=` 可选 | `{ date, stats, character_state, saved }` | 缺 PRD「采集状态 / cadence」 |
| GET | `/api/timeline` | `?date=` | `{ date, segments[] }` | PRD v0.6 要 `from`/`to`；实现 **仅单日** |
| GET | `/api/days` | `?range=`（1–90，默认 30） | `{ range, days[], streak }` | 对齐 |
| PATCH | `/api/todos/:id` | `{ done, device_id? }` | `{ todo, check_node }` | false→true 落 `todo_check` |

### 2.2 本分支已实现、PRD v0.6 §6.2 未列（分支扩展，不改 PRD）

| 方法 | 路径 | 请求 | 响应 | 说明 |
|---|---|---|---|---|
| GET | `/api/search` | `q` 必填；`from`/`to`/`kinds`/`limit` 可选 | `{ query, took_ms, results: SearchHit[] }` | 混合检索：FTS5 + 可选 embedding；schema 见 `shared` `SearchResponse` |
| POST | `/api/ask` | `{ question, from?, to? }` | `{ answer, citations[], retrieved, degraded }` | RAG；LLM 未配置 → 503；schema 见 `AskRequest`/`AskResponse` |

详细索引/算法见 `docs/global-search-prd.md`、`docs/architecture-nodes-search.md`。

### 2.3 PRD v0.6 要求、本分支未实现（合同缺口 → 独立 PR）

| 方法 | 路径 | PRD 语义 | 现状 |
|---|---|---|---|
| POST | `/api/chat` | 分诊 + 工作流，整段返回 `{ message_id, intent, reply }` | **无路由** |
| PATCH | `/api/messages/:id/intent` | 纠正分诊 | **无** |
| GET | `/api/messages` | Now 对话流 `?cursor=` | **无表/无路由** |
| GET | `/api/cards` | 双向流分页 `direction=before\|future` | **无** |
| GET | `/api/tasks` | sidebar 任务 `?status=` | **无** |
| POST | `/api/resume` | 小复盘 → message | **无** |

另有 **行为/形状** 缺口（端点在但语义未跟上 v0.6）：

| 点 | PRD v0.6 | 本分支 |
|---|---|---|
| `POST /api/voice` 之后 | 转写文本 **进分诊（同 chat）** | 只落 `voice` 节点 |
| `POST /api/nodes` 响应 | 附带 **节奏模式**（日间/夜间采样） | 仅 `created`/`duplicates` |
| `GET /api/timeline` | `from` & `to` 跨日 | 仅 `date` 单日 |
| `GET /api/stats/today` | 含 **采集状态** | 无 cadence/sampler 字段 |
| `POST /api/save` 发酵产出 | briefing / 健康建议 / ideas **卡片** | v0.5：`summary`+`opening_line`+todos/edges，无 cards 表 |
| 发酵 JSON | `briefing`, `health_advice`, `ideas[]`… | `FermentResultSchema` 仍是 opening_line 模型 |
| 表 | `messages` / `tasks` / `cards` | 仅 devices/days/nodes/edges/todos + 检索派生表 |

---

## 3. NodeKind（本分支 shared）

```
text | url | voice | save_note
app_sample | tab_sample | agent_session | git_commit
health_daily | snapshot | todo_check
```

- `git_commit`：本分支已进 Zod；PRD 作 T1；无 kind 时旧 server 会 400 拒采样上报。  
- 主动投喂（摄取）：`text/url/voice/save_note`。  
- 采样类进检索索引但发酵当环境上下文（与既有 ferment 过滤一致）。

---

## 4. 本分支「对齐」边界（明确不做什么）

在 **global-search** worktree 内：

| 做 | 不做 |
|---|---|
| 维护 v0.5 基座 API 正确性 | 不实现 chat/messages/cards/tasks/resume 整面 |
| 维护 search/ask 与 shared 合同 | **不修改** 最新 PRD 文件把 search 写进去 |
| 本文档登记与 v0.6 的差距 | 不在未冻结合同时擅自改 Save/Continue 产品语义 |
| 检索派生索引（FTS/embed queue） | 不上向量库 / 不做 PRD 未要求的流式 chat |

v0.6 整面应对齐方式：在 **main 或独立 feat 分支** 按 PRD §8「合同扩展 → server → Swift」推进；本分支合入时 **只带 search/ask + 既有基座**，避免与 v0.6 合同 PR 抢同一文件长期分叉。

---

## 5. 若要把 server 进一步贴 PRD：建议增量（仍不改 PRD）

按依赖序、可拆 PR（**非本任务必须实现**）：

1. **合同-only PR（shared）**  
   - Intent / Message / Card / Task / Chat / Resume 的 Zod  
   - 扩展 `FermentResultSchema`、`CreateNodesResponse.cadence?`  
   - Timeline query 支持 `from`/`to`（兼容 `date`）  
   - 同 diff `Models.swift` 镜像  

2. **DB 迁移**  
   - `messages` / `tasks` / `cards`  

3. **路由**  
   - chat → messages；cards 分页；tasks；resume  
   - voice → 内部分诊或明确「仅落节点」过渡语义  

4. **Save**  
   - 发酵输出落 cards；五维结算沿用现码  

5. **Sampler**  
   - nodes 响应读 cadence；节奏模式状态在 Pi  

global-search 可 **并行保留** search/ask，并在合同 PR 中把二者 **正式写入 shared 冻结面**（那时再由产品改 PRD，不由本分支改）。

---

## 6. 快速自检（本分支）

```bash
# 在 worktree 根
pnpm --filter @return/shared build
pnpm --filter @return/server test
# 路由烟测含 search/ask：packages/server/src/http.smoke.test.ts
```

curl 示例（search/ask）：

```bash
curl -sS "http://127.0.0.1:8787/api/search?q=评审&limit=10"
curl -sS -X POST http://127.0.0.1:8787/api/ask \
  -H 'content-type: application/json' \
  -d '{"question":"上周我在忙什么"}'
```

---

## 7. 变更记录

| 日期 | 说明 |
|---|---|
| 2026-07-24 | 初版：对照 origin/main PRD v0.6 §6.2 与本分支 routes/shared；**不修改 PRD**；登记 search/ask 为分支扩展与 v0.6 整面缺口。 |
