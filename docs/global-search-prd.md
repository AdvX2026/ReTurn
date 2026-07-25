# 全局检索升级（Global Search / Ask）— 实施 PRD

> 版本：v1.0 · 2026-07-24 · 状态：待评审（末尾有未决问题清单）
> 上游依据：`docs/PRD.md` v0.5 —— §3 P1「对空间提问（简单 RAG：取相关节点塞 prompt 回答）」、§5.1「语义检索：小数据量直接算 embedding 余弦相似度，不引入向量库」。
> 本文档把「真正第二大脑式的整体全局检索」落成可实施的工程设计，含分期范围、索引与检索算法、API 契约、测试与验收；§13 是方案现存问题，§14 是需要产品侧补充的信息。

## 1. 问题陈述

数据采进来了（采样、投喂、agent 会话、健康、git 提交），但**取不出**：现有出口只有按日浏览（节点流 F8）、时间轴（F12）、统计（F10）。没有跨日、跨源、跨设备的统一检索，更没有"问一句就能取回记忆"的能力——而后者正是"第二大脑"品类的核心承诺（Rewind / Limitless 的立身之本），也是发酵连边、复盘质量的上游能力。

## 2. 目标与非目标

**目标：**

1. 一个统一检索 API：关键词 + 语义混合，支持日期/来源过滤，中文可用。
2. 一个问答 API（Ask）：自然语言提问 → 检索 → LLM 生成带引用的答案，引用可回溯到具体节点。
3. 检索能力沉淀为 server 内部服务，后续发酵连边、相关节点推荐复用同一套。

**非目标（本期不做）：**

- 检索 UI（载体是未落地的 `apps/ReturnApp`，见 §13-a；本期交付 API + curl 可演示）。
- 相关节点推荐、检索增强发酵连边（Phase 3 方向，仅预留接口形态）。
- 向量数据库、cross-encoder 重排序、多模态（图片/音频直接检索）。
- 对 `packages/client`（已弃用 Tauri 壳）的任何扩展。

## 3. 已验证的技术地基（2026-07-24 本机实测，Node 24.18 / SQLite 3.53.1）

| 结论 | 证据 |
|---|---|
| `node:sqlite` 内置 FTS5，`bm25()` 排名可用 | 实测建表/MATCH/排名通过 |
| **trigram 分词对 2 字中文查询失效**（"评审"MISS，≥3 字"评审会"HIT） | 实测；中文双字词是高频查询，trigram 不能作为主分词 |
| **bigram 扩展 + unicode61 是可行主方案**：索引侧把连续汉字切成重叠双字（`产品评审` → `产品 品评 评审`），查询侧同样处理后 MATCH，2 字中文与英文词全部 HIT | 实测 |
| 暴力兜底成本极低：20k 行 `LIKE '%..%'` 全表扫 ≈ 2ms | 实测；数据规模内任何检索都不存在性能焦虑 |
| 暴力余弦可行：1 万节点 × 1536 维 Float32 ≈ 60MB 内存、单次查询几十 ms，Pi 3B（2–4GB RAM）可承受 | 推算，量级有富余 |

## 4. 分期范围

| 期 | 内容 | 隐私外发 | 依赖 |
|---|---|---|---|
| **Phase 1（本期主体）** | FTS5 全文索引 + 结构化过滤 + 时间/kind 加权排序 + `GET /api/search` | 零（纯本地） | 无新依赖 |
| **Phase 2（本期含设计，实施待 §14 决策）** | embedding 语义通道 + RRF 融合 + `POST /api/ask`（RAG 带引用） | 有（文本上云，见 §10） | embedding endpoint 可用性 |
| Phase 3（不做，仅方向） | `GET /api/nodes/:id/related`、检索增强发酵连边 | — | — |

Phase 1 独立可交付、可演示；Phase 2 在其上叠加，配置缺位时自动降级为 Phase 1 行为（不是功能开关，是自然降级）。

## 5. 总体架构

```
写入侧（同步，随现有事务）              查询侧
nodes 写入/删除 (repo.ts)              GET /api/search
  └─ 同事务维护 nodes_fts  ──────────▶  ① 查询预处理（bigram 化、时间短语解析）
days.summary 落库 (save.ts)              ② FTS5 bm25 → keyword 通道 top-50
  └─ 同事务维护 days_fts                 ③ query embedding → 暴力 cosine → semantic 通道 top-50（Phase 2）
                                        ④ RRF 融合 → 时间衰减 × kind 权重 → top-N
embed_queue（Phase 2，异步入队）          ⑤ snippet 截取 → 响应
  └─ server 后台 drain（30s/批 32）    POST /api/ask
                                        检索 top-8 → prompt 注入 → LLM → 引用校验 → 答案
```

原则：**索引是派生数据，nodes/days 表仍是唯一权威**；索引可随时全量重建（提供内部 rebuild 函数，启动时校验行数漂移即重建）。

## 6. 索引设计（Phase 1）

### 6.1 索引对象与粒度

| 文档 | 来源 | 进索引的文本 | 说明 |
|---|---|---|---|
| node 文档 | nodes 表全 kind | `title + content + source_meta 里的高值文本`（tab_sample 取 title/url；agent_session 取 project；git_commit 取 subject） | 采样类进索引但排名权重低（§7.3），不排除——"我上周看过那个网页"是核心取回场景 |
| day 文档 | days 表 | `summary + opening_line + review_points` | 当日总结是密度最高的文本，doc id 用 `day:<date>` 前缀 |

### 6.2 表结构（schema.ts 追加，CREATE IF NOT EXISTS 风格不变）

```sql
CREATE VIRTUAL TABLE IF NOT EXISTS search_fts USING fts5(
  doc_id UNINDEXED,    -- node:<uuid> | day:<date>
  kind UNINDEXED,      -- node kind | 'day_summary'
  day_date UNINDEXED,  -- YYYY-MM-DD，过滤下推
  text                 -- bigram 预处理后的文本
);
```

**预处理（TS 纯函数，中英通用）**：连续 CJK 字符切重叠 bigram、拉丁词原样小写保留、标点/emoji 丢弃。查询侧复用同一函数（DRY）。**不要用 trigram**（§3 实测 2 字中文失效）。

### 6.3 索引维护（信任边界：所有写路径）

- `insertNode` / `insertNodes` / `deleteNode`（repo.ts）：同一事务内同步维护 `search_fts`，派生索引不允许与权威表不一致。
- Save 流程写入 `days.summary` 处（save.ts）：同事务 upsert day 文档。
- 任何新增"改 title/content"的写路径（如今后续写转写）：必须在同一事务刷新索引——写进 repo 层而非 route 层，防漏。
- `rebuildSearchIndex(db)`：删表重建；启动时对比 `search_fts` 与源表行数，漂移则重建并 warn。

## 7. 检索算法

### 7.1 查询预处理（Phase 1）

- 显式过滤：`from=/to=/kinds=` 参数直接下推 SQL。
- 时间短语（正则覆盖，不承诺自然语言）：`今天/昨天/前天/本周/上周/N天前/YYYY-MM-DD` → date 区间，从 query 中剥离后剩余文本进 MATCH。
- 剩余文本 bigram 化，多词以 AND 组合（第一版不做 OR/短语查询）。

### 7.2 语义通道（Phase 2）

- 配置：`EMBEDDING_BASE_URL/API_KEY/MODEL`（缺省回落 `LLM_*`；未配置 → 通道关闭）。
- 入库：高值 kind（`text/url/voice/save_note/git_commit/day_summary`，采样类不 embed）写入时入 `embed_queue(node_id PK, enqueued_at, attempts)`；server 后台每 30s drain 一批（≤32 条/次调用），失败重试 ≤3 后放弃并 warn；向量存 `node_embeddings(node_id PK, model, vector BLOB /* Float32Array little-endian */, embedded_at)`。模型名变更 → 启动时将 model 不匹配的行重入队。
- 查询：question 即时 embed（1 次调用），加载全部向量暴力余弦取 top-50（结果集缓存 60s 防连续提问重复 embed）。

### 7.3 融合与排序

`score = RRF(keyword_rank, semantic_rank, k=60) × time_decay × kind_weight`

- 时间衰减：`0.5 ** (days_ago / 30)`（半衰期 30 天，初值可调）。
- kind 权重（初值）：主动投喂 & day_summary 1.0；git_commit / agent_session 0.7；tab_sample 0.3；app_sample 0.1。
- 纯 Phase 1 时 RRF 退化为单通道排名。所有系数集中在 `search/ranking.ts` 一处，便于 T+40h 式调参。

### 7.4 高亮

返回 `snippet`：FTS5 `snippet()` 对 bigram 文本不可用（高亮的是切分后碎片）——改为在**原文**上做查询子串窗口截取（±60 字符），纯函数实现。

## 8. API 契约（additive，`packages/shared/src/api.ts` 追加；Swift `Models.swift` 镜像记待办）

```
GET /api/search?q=&from=&to=&kinds=text,url&limit=20
→ { query, took_ms, results: [{ node: NodeRecord | null, day: DaySummary | null,
     doc_id, kind, score, snippet }] }

POST /api/ask { question, from?, to? }
→ { answer, citations: [{ node_id, date, kind, title, snippet }],
    retrieved: number }
```

- `limit` 默认 20、上限 50；`q` 必填（1–500 字符）。
- Ask：top-8 注入 prompt；LLM 未配置或失败时明确返回错误，不用裸检索结果伪装生成答案；embedding 未配置时 `/api/search` 保持关键词通道。
- 写接口鉴权现状不变（LAN 信任模型）；两接口均为只读。

## 9. Ask 生成侧约束（Phase 2）

- system prompt 硬约束：只允许使用注入节点的内容作答；每个论点标注来源 `[node_id]`；没有相关内容必须直说"没在你的记录里找到"。
- **引用校验层**：解析模型输出的 node_id，凡不在本次检索集合内的引用一律丢弃（防幻觉引用），再映射回节点详情返回。
- 超时/重试/Zod 校验对齐现有 ferment 通道（45s、一次重试）。

## 10. 隐私与成本

- Phase 1 零外发，与「原始数据不出家门」叙事完全兼容。
- Phase 2 的 embedding 与 Ask prompt 会把节点原文（投喂、语音转写、git subject、日总结）送出云端——与 §9.8 叙事存在张力，三个选项见 §14-Q2，**这是产品级取舍，不在本文档内默认决定**。
- 成本：embedding 按高值节点估算每天几十条 × 数百 token，可忽略；Ask 每次 top-8 注入，与 ferment 同量级。

## 11. 测试规格

1. 预处理纯函数：中英混排、标点、emoji、空串、纯英文、纯中文、1 字查询。
2. 索引同步：insert/delete node、写 day summary 后 FTS 内容一致；rebuild 后一致。
3. 检索排序：构造 20 条语料（跨日、跨 kind），断言 top-5 顺序与时间衰减/kind 权重生效方向。
4. RRF 融合纯函数：单通道退化、双通道交集加分。
5. snippet 截取：命中窗口、无命中回退开头。
6. Ask 引用校验：mock LLM 返回真实+捏造 node_id 混合，断言捏造引用被丢弃；LLM 失败 → 明确错误。
7. 契约：新 schema 的 zod safeParse 正反例。
8. HTTP 层：沿 `http.smoke.test.ts` 风格补 `/api/search` 冒烟。

## 12. 验收清单

- [ ] 中文双字词（如"评审"）能命中含该词的投喂/网页标题/git subject。
- [ ] 英文关键词命中 URL 与英文内容。
- [ ] `from/to/kinds` 过滤与"昨天/上周"短语正确收窄结果。
- [ ] 同日多条结果中，主动投喂排在采样之前；近期排在远期之前（其他条件相同）。
- [ ] 删除节点后检索不再命中。
- [ ] `/api/search` p95 < 200ms（1 万节点量级，Pi 实测）。
- [ ] （Phase 2）Ask 答案每条引用都可回溯到真实节点；LLM 挂掉时明确失败且不返回伪答案。
- [ ] `pnpm check`、`pnpm lint` 全绿；无新第三方依赖。

## 13. 方案现存问题（作者自评，诚实清单）

- **a. 没有演示载体**：检索的第一 UI 载体 `apps/ReturnApp` 尚未开工，本期只能 curl 演示。第二大脑检索的价值 80% 在 UI 体验（即输即搜、高亮、跳转上下文），API-only 交付的说服力有限。
- **b. 隐私叙事冲突**：语义检索越强，送上云的内容越多。"数据不出家门"是项目核心卖点，Phase 2 在叙事上是扣分项；本地小模型（Pi 3B CPU 跑 bge-small）能力存疑，需 spike。
- **c. 小数据现实**：黑客松攒下的真实数据可能只有几百节点，FTS 关键词已足够，语义通道的提升在小数据上不明显——Phase 2 存在过度工程风险，但设计必须先留位。
- **d. bigram 索引的 bm25 排名质量未调优**：bigram 下 idf 分布与常规分词不同，排名可能反直觉（如长文档天然吃亏被放大），需要真实语料调；必要时退回"FTS 只做召回、排名自实现"。
- **e. 采样噪声可能反噬体验**：tab/app 样本每天 200+ 条，权重若调不好，搜"评审"先出来十条无关网页标题。第一版可能需要比本文更狠的权重差。
- **f. 暴力余弦的边界**：5 万+ 节点后内存与启动回读会变差（需换 sqlite-vec 或分段扫描），本文明确不负责那一天，但接口形态不阻碍替换。
- **g. Ask 引用幻觉**：已设计校验层，但模型仍可能"正确地引用错误的节点"（张冠李戴），只能降概率不能根除。
- **h. 时间短语覆盖有限**："上周三下午那个"超出一个正则的能力；LLM query rewrite 会增加延迟与失败面，第一版明确不承诺。
- **i. LLM 资源竞争**：Ask/embedding 与发酵共用同一 LLM 通道与 Pi 单进程，Save 发酵期间并发 Ask 可能双双变慢；需要（至少）请求串行化或队列，本文未展开。

## 14. 需要产品侧补充的信息（决策待定）

1. **Q1 演示载体**：ReturnApp 的排期？检索 UI 是否等 app 落地，还是先接受 curl/HTTP 演示？iOS 只读端是否也要搜索入口？
2. **Q2 隐私三选一**（决定 Phase 2 开工与否）：a) 接受 embedding/Ask 上云（与发酵同级的外发边界）；b) spike Pi 本地小模型 embedding（性能存疑，先验证）；c) 只做 Phase 1，语义检索无限期搁置。
3. **Q3 LLM provider 是否提供 `/embeddings`**？模型名与维度？（现配置只有 chat 与 whisper；若 provider 无 embedding，Q2 自动坍缩为 b/c。）
4. **Q4 采样节点索引策略**：tab/app 样本按本文"进索引 + 低权重"，还是 Phase 1 干脆只索引主动投喂/git/agent/day（更干净、场景更窄）？
5. **Q5 数据规模与保留期**：预期节点总量与保留时长（影响 §13-f 的边界何时到来；是否需要有过期清理策略）。
6. **Q6 Ask 交互形态**：阻塞式一次返回（本文默认）还是 SSE 流式？流式体验显著更好，但契约与 UI 复杂度都上一档。
7. **Q7 语言占比**：使用内容以中文为主还是中英各半？（影响 embedding 模型选型与分词参数。）
8. **Q8 Phase 3 优先级**：「相关节点」推荐与「检索增强发酵连边」是否有近期需求？（影响检索服务的接口预留粒度。）

---

### 实施提示（给实现者）

- 先读：`packages/server/src/db/repo.ts`（写路径与事务）、`db/schema.ts`、`ai/ferment.ts`（LLM 调用与降级范式）、`services/timeline.ts`（kind 聚合范式）、`packages/shared/src/api.ts`（契约风格）。
- 目录建议：`packages/server/src/search/`（`tokenize.ts` / `index.ts` / `ranking.ts` / `embed.ts` / `ask.ts`），route 只做薄装配。
- 代码/注释/commit 英文；测试 `node:test`；提交按 `feat(shared)` / `feat(server)` 拆分；分支 `feat/global-search`。
