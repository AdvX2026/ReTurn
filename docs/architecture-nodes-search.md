# 节点写入与全局检索架构

> 状态：与 PR #8（global hybrid search / ask）对齐 · 2026-07-24  
> 读者：实现与评审；产品细节以 `docs/PRD.md`、`docs/global-search-prd.md` 为准。

## 1. 一句话

**Sampler 不写搜索库。** 它只把本地痕迹变成 **Node**，经 outbox 报到 Pi；Pi 把 Node 写入权威 SQLite，并在同一写路径维护 **FTS +（可选）embedding 队列**。PR8 之后，第二大脑 = **按日存档空间 + 全局可检索 / 可问的投影层**。

## 2. 拓扑

```
┌─ Mac ──────────────────────────────────────┐        ┌─ Orange Pi（权威）─────────────────────────┐
│ UI App (Swift / ReturnApp，未落地)         │        │  Fastify @return/server                     │
│  投喂 text/url/voice、Save、勾选 todo      │──HTTP──▶│  return.db                                  │
│  读: continue / timeline / search / ask    │        │    nodes / days / edges / todos             │
│                                            │        │    search_fts（派生）                       │
│ Sampler (独立 Node 进程)                   │        │    embed_queue + node_embeddings（派生）    │
│  采集 → outbox.db → flush                  │──HTTP──▶│  insertNode 同事务 upsert FTS / 入队 embed  │
│  127.0.0.1:8791 仅本机控制面               │        │  GET /api/search · POST /api/ask            │
└────────────────────────────────────────────┘        │  POST /api/save → ferment → day 产物再入索  │
┌─ iPhone ───────────────────────────────────┐        └────────────────────────────────────────────┘
│ HealthKit → POST /api/health               │
│ 只读 GET + search/ask（未来）              │
└────────────────────────────────────────────┘
```

| 层 | 谁负责 | 职责 |
|---|---|---|
| 采集层 | sampler / UI / iOS | 本地痕迹、投喂、健康 |
| 传输层 | outbox + HTTP | 带 `client_uuid` 的 Node 批 |
| 权威层 | Pi `nodes` / `days` / … | 唯一真相 |
| 检索投影层 | `search_fts` + embeddings | 可全量 rebuild 的派生数据 |
| 消费层 | timeline / stats / search / ask / continue | 读模型，不改权威 |

## 3. Sampler 如何加入节点

### 3.1 周期（`packages/sampler`）

1. 每 `SAMPLE_INTERVAL_MIN`（默认 5）分钟 tick  
2. `collectSnapshot()` 采一帧环境  
3. `snapshotToNodes()` → `NodeInput[]`  
4. `outbox.enqueue` → `~/.return/sampler/outbox.db`  
5. `flushOutbox()` → `POST /api/devices/register` + `POST /api/nodes`  
6. 另有每分钟 opportunistic flush；网络/5xx 时 FIFO 停写、队列保留  

Save 收尾：UI 调 localhost `POST /sample-now { as_snapshot: true }`，额外带 `kind=snapshot`。

### 3.2 当前 kind 映射

| 来源 | kind | 要点 | 幂等 |
|---|---|---|---|
| 前台应用（macOS） | `app_sample` | app / bundle | 每点新 `client_uuid` |
| 浏览器标签 | `tab_sample` | title + url（≤40） | 同上 |
| Coding agent jsonl | `agent_session` | project、起止、时长 | `uuidFromSeed(agent:…)` |
| 本地 git（合同已支持；采集在 sampler 分支） | `git_commit` | repo / subject / sha | seed 幂等 |
| Save 收尾 | `snapshot` | 环境 JSON | 新 uuid |

非 darwin：app/tabs 空，仍解析 agent。

### 3.3 进入 Pi 之后（PR8）

`insertNode` 同事务：

1. 写入 `nodes`（权威；`created_at` 服务端盖章；按 Pi 本地日归 `days`）  
2. `client_uuid` 命中 → 幂等 `duplicate`，不插第二行  
3. `upsertNodeFts` → 立刻可关键词搜  
4. kind ∈ embeddable → `enqueueEmbed`；后台 ~30s drain → `node_embeddings`  

Sampler **不**调 search、**不**算 embedding、**不**跑 ferment。

## 4. 分层模型

### 4.1 写入来源

```
L0  环境采样（sampler）     app_sample / tab_sample / agent_session / git_commit / snapshot
L1  主动知识（UI）         text / url / voice
L2  仪式锚点（Save）        save_note + snapshot 收尾
L3  健康（iOS）             health_daily
L4  日产物（ferment）       day summary / review / todos / edges / tags
L5  行为回写                todo_check
```

### 4.2 发酵角色

- **知识**：主动投喂等进 prompt 正文  
- **环境上下文**：采样会话只作背景，不当论断来源  

### 4.3 检索（PR8）

| 层 | FTS | Embedding | 权重约 | 说明 |
|---|---|---|---|---|
| 知识 text/url/voice/save_note | ✅ | ✅ | 1.0 | 主召回 |
| 日摘要 `day_summary` | ✅ | ✅（`day:日期`） | 1.0 | Save 后入索 |
| agent_session / git_commit | ✅ meta | git ✅ / agent 否 | 0.7 | 结构化信号 |
| tab / app / snapshot / health | ✅ 低权 | ❌ | 0.3 / 0.1 | 噪声垫底 |

```
score = RRF(关键词排名, 语义排名) × 时间衰减 × kind 权重
```

- 关键词：FTS5 + CJK 重叠 bigram（中文双字可用）  
- 语义：显式 `EMBEDDING_*`（无 `LLM_*` fallback）；未配置则纯关键词  
- Ask：检索 top-8 → LLM → 丢弃幻觉引用；无 LLM key → 503  

## 5. 从采样到可搜 / 可问

```
[Mac] app + tabs + agent (+ git)
        → NodeInput[] → outbox → POST /api/nodes
                → nodes（权威）
                → search_fts（即时）
                → embed_queue → node_embeddings（异步）
                        → GET /api/search（hybrid）
                        → POST /api/ask（RAG）
```

Save：

```
save_note + snapshot → ferment → summary/todos/edges/tags
  → markDaySaved → day FTS + day embed 入队
```

## 6. 读接口分工（Day Loop 与全局并存）

| 能力 | 接口 | 视角 |
|---|---|---|
| 当日节点 | `GET/DELETE /api/nodes` | 按日桶 |
| 时间轴 | `GET /api/timeline` | 会话聚合 |
| 存档 / 复盘 | `POST /api/save` · `GET /api/continue` | 日仪式 |
| 属性 | `GET /api/stats/today` · `/api/days` | 游戏层 |
| 全局找 | `GET /api/search` | 跨日、跨 kind |
| 全局问 | `POST /api/ask` | RAG + 引用 |

权威仍是 `nodes/days`；`search_*` 可 rebuild，启动检测漂移则重建。

## 7. 配置要点

```env
# 语义通道：必须三者齐全，不回落 LLM_*
EMBEDDING_BASE_URL=https://api.siliconflow.cn/v1   # API root，不要带 /embeddings
EMBEDDING_API_KEY=...
EMBEDDING_MODEL=BAAI/bge-m3
```

## 8. 边界与已知缺口

- Sampler 控制面仅 `127.0.0.1`；搜索在 Pi 在线时可用  
- 检索 UI / Swift `Models.swift`：`apps/ReturnApp` 未开工，合同镜像记待办  
- 可搜 ≠ 全是知识：采样进索引但权重低；主动投喂与日摘要优先  

## 9. 相关路径

| 区域 | 路径 |
|---|---|
| Sampler 采集 / outbox / flush | `packages/sampler/src/{collect,outbox,pi,index}.ts` |
| 权威写入 | `packages/server/src/db/repo.ts` |
| 检索 | `packages/server/src/search/*` |
| 合同 | `packages/shared/src/{domain,api}.ts` |
| 检索 PRD | `docs/global-search-prd.md` |
