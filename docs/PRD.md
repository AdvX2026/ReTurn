# ReTurn PRD（临时代号）

> 版本：v0.4 · 2026-07-24 · 黑客松 48h 范围
> 一句话：一个"每日存档"式的本地第二大脑——家里的 Orange Pi 是你的存档空间，桌面端全天自动采集 + 随手投喂，下班时像经营游戏一样 Save Today 并留下一句存档留言，第二天 Continue 领取昨日复盘（Before）和今日待办（Future），你的小人角色随属性变化而变化。
>
> v0.4 相对 v0.3 的架构转向：单机 macOS 桌面应用 → **Orange Pi 3B 家庭服务器（后端） + 桌面端（前端+采集器） + iOS 展示端（只读）** 的多端架构；新增**后台定时采样**、**角色系统（五维属性驱动状态）**、**存档留言（语音/文本）**、**离线缓冲同步**、**iPhone 健康数据（快捷指令上传，喂"精力"）**、**Coding Agent 会话采集**。

---

## 1. 产品概述

- **形态**：Orange Pi 3B 家庭服务器（数据中枢，Node 服务 + SQLite）+ macOS 桌面端（**UI App 与常驻采样器双进程分离**，UI 用 Tauri 2）+ **iOS 展示端（只读，复用同一 React 代码库打包）**。iPhone 另以**快捷指令**每日定时上传健康数据（睡眠/步数），App 内不写任何 HealthKit 代码。同一局域网内通信，桌面端带离线缓冲。**平台范围就是 macOS + iOS，不做 Windows。**
- **核心隐喻**：把每一天当作一局经营游戏的存档。你的"空间"物理地住在家里那块板子上；角色是空间的化身，它的状态由你今天真实做过的事决定。
- **目标用户**：知识工作者/学生，信息来源分散（网页、语音、灵感碎片），缺乏每日复盘习惯。
- **用户模型**：**单用户、多设备**。多台 Mac（如台式机+笔记本）+ 一部 iPhone 连同一块 Pi，共享同一空间。不做多用户。
- **黑客松交付目标**：48 小时内做出**假数据尽量少、可完整演示运行**的产品。

### 1.1 评委叙事（Pitch）

- **痛点**：收藏夹吃灰、笔记软件成了信息坟场。复盘有价值，但没人坚持得下来——因为它是负担。
- **差异**：Rewind / Mem / Obsidian 比拼"更强的记录与搜索"；ReTurn 比拼"让你愿意每天回来"。把复盘从负担变成仪式：下班存档、次日读档，看着角色和空间一起长大。
- **硬件叙事（新）**：你的第二大脑**物理地住在你家里**——原始数据（你开过什么应用、看过什么网页、说过什么话）只存在 Pi 上，不进任何厂商的云。演示时把 Orange Pi 实物摆上台，是差异化道具。（发酵调用云端 LLM 的边界与说法见 §9.8。）
- **一句话**：第二大脑工具解决"存进去"，ReTurn 解决"第二天还想打开"。

## 2. 核心循环（Day Loop）

```
白天(全天)                     下班时                    夜间(即时)              第二天
自动采样 + 随手投喂  ────────▶  Save Today  ────────▶   AI 发酵(Pi→云端)  ───▶  Continue
前台应用/标签页采样             存档留言(语音/文本)        总结/复盘/待办/连边      Before: 昨日复盘
文本/链接/语音投喂             + 环境快照打包             属性结算(纯代码)        Future: 今日待办
                                                                              角色状态更新
```

1. **采集（全天自动）**：桌面端常驻采样器（**独立于 UI 的后台进程**，UI 关闭不影响采集）每 3~5 分钟记录一次前台应用 + 浏览器标签页，并解析本地 Coding Agent 会话记录，落为节点上报 Pi（离线时本地缓冲，恢复后补传）；iPhone 快捷指令每日定时把昨夜睡眠、当日步数 POST 到 Pi。
2. **投喂（全天随时）**：用户丢入文本片段、URL、语音（Pi 转发云端转写为文本）。每次投喂生成一个**节点**。
3. **Save Today（一天一次，手动触发）**：
   - 点击 Save 后弹出**存档留言**：语音或文本，记录"今天任何想记住的东西 / 明天想干嘛"。留言本身落为节点，并作为发酵的锚点输入。
   - 抓取一次收尾**环境快照**（当前应用列表 + 标签页），与当日全部节点一起打包，由 Pi 调云端 LLM"发酵"：当日总结、Before 复盘要点、Future 待办、节点标签、新旧节点连边。
   - 属性**不经 LLM**，由 Pi 上的代码确定性结算（见 §4），随发酵结果一起写入 day 记录。
4. **Continue（次日任一设备首次打开）**：
   - **Before 部分**：昨日复盘——一句话开场白 + 当日总结 + 复盘要点 + 属性变化。
   - **Future 部分**：今日待办 To-Do List（发酵推断 + 用户手动补充，可勾选，勾选记为当日节点）。
   - 角色以昨日结算的状态登场（见 §4）。

## 3. 功能需求

### P0 — 演示主线，必须完成

| 编号 | 功能 | 说明 |
|---|---|---|
| F1 | 多端同步基座 | Pi 上 HTTP API + SQLite；设备注册、离线本地缓冲、恢复连接自动补传；健康数据上报接口（快捷指令直连）；同一空间多设备共享 |
| F2 | 后台采样器（独立进程） | 与 UI 分离的常驻后台进程（Node，launchd 托管）：每 3~5 分钟采样前台应用 + Chrome/Safari 标签页（AppleScript），并解析本地 Coding Agent 会话记录（`~/.claude/projects/**/*.jsonl`）；上报前聚合为"应用会话"（见 §4.1）。持有主 outbox；在 localhost 开仅本机可达的小端口，供 UI 触发"立即采样"和读取采集状态。UI 关闭、重启、开发热更均不中断采集 |
| F3 | 快速投喂框 | 全局常驻输入：文本直接存；URL 抓取标题+正文摘要；语音按住录音 → 上传 Pi → 云端转写 |
| F4 | Save Today + 存档留言 | 点击 Save → 弹出留言框（语音/文本二选一，可跳过）→ 收尾环境快照（UI 经 localhost 通知采样器立即采样一次；采样器不可达则取最近一次采样兜底）→ 触发服务端发酵 |
| F5 | 发酵 pipeline（服务端） | Pi 汇总当日节点 + 存档留言 → 1~2 次云端 LLM 调用输出结构化 JSON（总结/开场白/复盘要点/待办/标签/连边）→ Zod 校验落库 → 代码结算五维属性与角色状态 |
| F6 | Continue 页 | Before（开场白+总结+复盘要点）/ Future（可勾选待办）两栏布局 + 角色登场 |
| F7 | 角色系统 | 五维属性面板 + 角色状态整图切换 + 可替换角色包（见 §4.2/§4.3）。属性当天实时可算，Save 时定格 |
| F8 | 当日节点流 | 时间线列出今日投喂/采样（采样按会话折叠展示）的节点，可删除（错误抓取的兜底） |
| F9 | 结算画面 | Save 后的"每日结算"：五维属性逐项跳出、连击（streak）、角色状态揭晓动画。本产品最像游戏的一刻，动效资源优先投入；同时掩护发酵等待时间（10~30s） |
| F10 | 状态一览 | 近 7/30 天：属性趋势折线 + 存档热力格 + 点某天看当日总结。数据全来自 `days.stats_json` |
| F11 | iOS 展示端 | 只读薄壳：Continue、角色与属性、当日时间轴、状态一览。复用桌面 React 组件出移动子集，Tauri 2 iOS 打包（免费开发者账号真机签名）；打包受阻则降级为 Pi 托管移动 Web 页（同一代码，零改动） |
| F12 | 当日时间轴（Timeline） | 屏幕使用时长式的 24h 视图：应用会话按时间段着色分块（按应用类目配色）、Coding Agent 会话独立一条带、投喂节点打点、昨夜睡眠段（health_daily）垫底展示。数据全部来自已有节点的会话聚合，无新增采集；块的粒度受采样间隔限制（3~5min）。可视化设计参考 context-visualizer 的时间带/主题带思路；空闲时间压缩等高级表达放 P1 |

### P1 — 有余力再做

- 剪贴板监听（复制即候选节点，需用户确认收录）。
- 对空间提问（简单 RAG：取相关节点塞 prompt 回答）。
- T1 档软件接入（§3.1：Git 提交、VS Code 最近项目、Chrome 当日历史）。
- iOS 端投喂框（P0 内 iOS 端严格只读）。
- 当日重复 Save 的覆盖重结算（P0 内 Save 幂等：当日已存档则直接返回已有结算）。
- 断网/恢复的演示化呈现（拔网线→补传动画，作为演示 wow 点）。

### P2 — 明确不做（黑客松内）

- Windows、Android、平板等其他端（iOS 展示端的移动 Web 兜底方案除外）。
- 公网访问（Tailscale/frp）；仅局域网。
- 深度采集（屏幕截图/OCR/键鼠活跃度）。
- 按活动自动判定职业换肤；Live2D/骨骼动画。
- 知识图谱可视化界面（图只作为内部数据结构）。
- 任何插件/扩展开发（VS Code 扩展、Chrome extension）。
- 多用户。

### 3.1 软件接入（采集源清单）

原则：**只读软件留在磁盘上的痕迹**（本地文件、AppleScript），不写插件、不逆向私有 API：

| 档 | 来源 | 取什么 | 怎么取 | 成本 |
|---|---|---|---|---|
| T0（=F2，必做） | 系统 | 前台应用（定时采样） | NSWorkspace / osascript | 低 |
| T0（=F2，必做） | Chrome / Safari | 打开的标签页（标题+URL，定时采样+Save 收尾快照） | AppleScript，一次自动化授权 | 低 |
| T0（=F2，必做） | Claude Code / Coding Agent | 当日 agent 会话（项目、起止时间、时长） | 解析 `~/.claude/projects/**/*.jsonl` 的时间戳聚合为会话（思路参考开源项目 context-visualizer） | 低，"产出/专注"的硬信号 |
| T0（=F1，必做） | iOS 健康 | 昨夜睡眠时长、当日步数 | iPhone 快捷指令每日定时自动化，家庭 Wi-Fi 下 POST 到 Pi（带固定 token）。备选：第三方 App「Health Auto Export」定时 POST（同样零代码）。注意：Apple 无云端 Health API，HealthKit 只能在 iPhone 本机由原生 App 读取，脱离手机"直接用 API 拿"不存在 | 低，"精力"唯一的硬信号 |
| T1（P1，按序捞） | Git | 本地仓库当日提交（message、改动文件数） | 用户配置代码目录，扫描 `git log --since` | 低，"产出"属性最硬的信号 |
| T1 | VS Code | 最近打开的项目/文件 | 读 `state.vscdb`（本地 SQLite） | 低 |
| T1 | Chrome | 当日浏览历史 | 拷贝 `History` SQLite 后读 | 中 |
| T2（黑客松后） | 日历 / Obsidian / 音乐 | 日程 / 当日笔记 / 听歌氛围 | AppleScript / 文件扫描 | 中 |

采集条目一律落为 node（`kind`：`app_sample`、`tab_sample`、`agent_session`、`health_daily`、`git_commit` 等），进入同一发酵管线；采样类节点在发酵 prompt 中作为"环境上下文"而非"知识"处理（见 §9.2）。

## 4. 角色系统（游戏层）

### 4.1 五维属性 —— 全部由代码确定性计算，LLM 不打分

可解释、可复现，演示时数值不会无故跳变。计算在 Pi 上进行；当天任意时刻可按当前数据实时结算（角色白天"活"起来的来源），Save 时定格写入 `days.stats_json`。

**前置：会话聚合（纯代码）**。连续的同应用采样合并为一个"应用会话"（间隔超过 1 个采样周期即断开），得到 `sessions = [(app, start, end, duration)]`；Coding Agent 会话（自带起止时间）直接并入 sessions。会话同时喂给属性计算与发酵上下文。

| 属性 | 含义 | 计算（公式系数为初值，T+40h 前用真实数据调参） |
|---|---|---|
| 摄取 | 主动收进了多少东西 | 当日**主动投喂**节点数 × 来源种类数加权（采样节点不计入，防刷） |
| 专注 | 注意力是否集中 | 应用会话时长集中度（HHI）与最长单会话时长的加权；有标签后叠加主题标签集中度 |
| 产出 | 做完了多少 | 当日 todolist 完成率为主 + 当日 Coding Agent 会话时长加成（P1 接入 Git 后再叠加提交数） |
| 连贯 | 今天和过去接得上吗 | 本次发酵新增的跨日连边数（封顶映射到 0~100） |
| 精力 | 疲惫的反面 | 昨夜睡眠为主信号：min(睡眠时长/8h, 1)×70 + 步数加成(≤15) + 15 − 深夜(00:00–06:00)活跃采样扣分 − 无间断连续工作超 90min 扣分，clamp 到 0~100；无健康数据时回退为 100 起扣的纯扣分式 |

### 4.2 角色状态 —— 属性阈值驱动，整图切换

按优先级取第一个命中的状态（阈值为初值，可调）：

| 优先级 | 状态 | 触发条件 | 美术 |
|---|---|---|---|
| 1 | 疲惫 | 精力 < 40 | tired.png |
| 2 | 高产 | 产出 ≥ 70 | productive.png |
| 3 | 心流 | 专注 ≥ 70 | focused.png |
| 4 | 灵感迸发 | 摄取 ≥ 70 | inspired.png |
| 5 | 日常（默认） | — | normal.png |

- 状态在结算画面揭晓（F9 的高潮帧）；白天随实时属性变化。
- 美术为**整图切换**：每状态一张完整立绘，前端只做图片切换 + 淡入淡出/弹跳等轻动效。默认角色 1 套 × 5 状态 = 5 张图，黑客松内美术量封顶于此。

### 4.3 角色包（解耦规范）—— 用户可自行替换

角色模块与业务解耦：前端只认"状态 → 图片"的映射，不关心图从哪来。

```
character-packs/<pack-name>/
  manifest.json    // { "name": "...", "author": "...",
                   //   "states": { "normal": "normal.png", "tired": "tired.png",
                   //               "focused": "focused.png", "productive": "productive.png",
                   //               "inspired": "inspired.png" } }
  *.png
```

- 内置一个默认包（我们提供的小人）；用户把自己的包放进目录（或设置页导入）即可换角色——"职业/皮肤"即不同的角色包，产品不做职业判定逻辑。
- 缺图兜底：缺某状态图时回落到 `normal.png`。
- 演示点：现场秒换一个角色包，证明解耦。

### 4.4 激励原则

- 连续存档有可见连击感（streak，展示于结算画面与状态一览）。
- 属性只做展示与视觉反馈，**不做惩罚机制**（48h 内避免负反馈调参）。
- LLM 只负责文本产物：总结、开场白、复盘要点、待办、标签、连边判断。

## 5. 数据模型

### 5.1 Pi 端 SQLite（唯一权威数据源）

```sql
devices(id, name, platform, last_seen_at)
nodes(id, day_id, device_id, kind, title, content, source_meta, client_uuid, created_at)
  -- kind: text | url | voice | save_note | app_sample | tab_sample | agent_session
  --       | health_daily | snapshot | todo_check
  -- client_uuid: 客户端生成的幂等键，补传去重用
edges(id, src_node_id, dst_node_id, relation, created_by_day_id)
days(id, date, saved_at, save_note_node_id, summary, opening_line,
     review_points_json, stats_json, character_state)
todos(id, day_id, text, done, source_node_id)
```

- 一切收集物统一为 node；"存档" = 给当天的 nodes 盖章（saved_at）并生成 day 级产物。
- 语义检索（P1 提问功能）：小数据量直接算 embedding 余弦相似度，不引入向量库。

### 5.2 桌面端离线缓冲

- 采样器持有**主 outbox**（进程内 SQLite）：采样、Agent 会话先落本地再上报；Pi 不可达时静默积压，恢复后按序补传，靠 `client_uuid` 去重。
- UI 进程持有自己的**轻量 outbox**（投喂、勾选，量小）：同一套补传与幂等逻辑（实现复用 `shared`）；两进程不共享本地库，避免跨进程锁竞争。
- 读操作（Continue、节点流、时间轴、状态一览）依赖在线；离线时展示最后一次成功拉取的缓存 + "未连接到空间"状态条。

## 6. 技术架构

### 6.1 拓扑

```
┌─ Mac（可多台，双进程分离） ─────┐        ┌────── Orange Pi 3B (Debian) ──────┐
│ UI App (Tauri2+React)          │        │  Node 服务 (Fastify)               │──▶ 云端 LLM API
│   展示/投喂/录音/轻量 outbox    ├─局域网─▶│  SQLite / 属性结算 / 发酵编排       │──▶ 云端转写 API
│ 采样器 (Node, launchd 常驻)     │  HTTP  │  (LLM/转写 key 只存在 Pi 上)        │
│   采样/Agent会话/主 outbox      │        └───────────────▲───────────────────┘
│   ◀─ localhost 仅本机: 立即采样 │                        │
└────────────────────────────────┘                        │
┌─ iPhone ───────────────────────┐                        │
│  iOS 展示端(只读, 同一 React 库) ├─局域网────────────────┘
│  快捷指令: 每日定时 POST 健康数据│
└────────────────────────────────┘
```

全栈 TypeScript（三个可运行端一种语言、一份合同、任何人可跨端补位；Pi 上负载只是 SQLite + 转发 LLM 调用，Node 绰绰有余）：

| 层 | 选型 | 备注 |
|---|---|---|
| 运行时 | Node 22 LTS + tsx（开发与 Pi 上均直接跑 TS，不做构建） | 少一个 build 环节少一类演示事故；不用 Bun（arm64 上多余的风险） |
| Monorepo | pnpm workspaces：`shared` / `server` / `sampler` / `client` | 不上 Turborepo/Nx；`client` 一份 React 代码库同时出桌面（Tauri）与 iOS（Tauri iOS target） |
| 合同 | `shared`：Zod schema（API 请求/响应 + 发酵 JSON + kind 枚举）+ 类型化 fetch 客户端（~百行） | 即 T+6h 冻结的"三方合同"的物理形态；不上 tRPC——快捷指令要打裸 HTTP，且 REST 可 curl 调试 |
| 服务端（Pi） | Fastify + fastify-type-provider-zod；裸 better-sqlite3 + 手写 SQL + 启动时按编号跑迁移 | 5 张表不上 ORM；better-sqlite3 在 arm64 装不顺就换 Node 22 内置 `node:sqlite`（spike ① 验证）；systemd 常驻；LLM/转写 key 走 Pi 环境变量，**不下发客户端、不入 git** |
| LLM 调用 | Vercel AI SDK（`ai` 包）+ OpenAI-compatible provider，`generateObject` 直接绑 Zod schema | 结构化输出、校验、超时重试原生覆盖；语音走 Whisper 兼容转写接口，全部由 Pi 发起 |
| 采样器 | 独立 Node 常驻进程（launchd 托管开机自启）：setInterval + execa 调 osascript；localhost 端口用裸 `node:http` | 与服务端同栈，outbox / schema / 上报逻辑复用 `shared`；开发/演示期可终端前台跑 |
| 桌面 UI App | Tauri 2 | Rust 层更薄：仅录音文件落盘等本地能力；UI 轻量 outbox 用 localStorage JSON 队列，不引 tauri-plugin-sql |
| iOS 端 | Tauri 2 iOS target，复用 `client` 出只读子集 | 免费开发者账号真机签名；受阻则降级为 Pi 托管移动 Web 页（同一代码） |
| 前端框架 | React 19 + Vite + TS strict + Tailwind v4 | 业务逻辑尽量放 TS 侧 |
| 状态管理 | TanStack Query 管全部服务端数据（轮询 `/api/stats/today`、缓存、重试、离线降级展示）；Zustand 只管纯 UI 状态（弹窗、结算动画阶段、视图切换） | 5 个视图用 Zustand 存 `view` 切换即可，不引路由 |
| 组件/动效 | 少量 Radix 原语（Dialog/Checkbox 等）+ Motion（结算画面数字弹跳、角色状态揭晓） | 不上整套组件库；Motion 是唯一动效依赖，F9 是它的主战场 |
| 图表 | 手写 SVG：时间轴 / 热力格 / 折线共用一套工具函数 | 零图表依赖（时间轴本就要手写，见 §9.9 定稿） |
| 质量工具 | Biome（lint + format 一件套）+ TS strict | 快、零配置扯皮，黑客松友好 |
| 发现 | Pi 起 mDNS（`return.local`）+ 设置页手填 IP 兜底 | 演示用手机热点组网，Pi 配静态 IP |

明确不用：tRPC、ORM、Next.js/SSR、Redux、Electron、tauri-plugin-sql、Recharts（理由见各行备注与 §9.9）。

### 6.2 API 合同（T+6h 冻结）

```
POST /api/devices/register          → { device_id }
POST /api/nodes  (批量, 带 client_uuid)   投喂 + 采样上报共用
POST /api/voice  (multipart 音频)    → 转写 → 落 text/voice 节点
POST /api/health { date, sleep_minutes, steps }
     快捷指令直连（固定 token 请求头）→ 落 health_daily 节点
GET  /api/nodes?date=
DELETE /api/nodes/:id
POST /api/save   { date, note_text? | note_voice_ref? }
     → 阻塞至发酵完成（或降级），返回完整结算 payload（幂等：当日已存档直接返回已有结算）
GET  /api/continue                  → Before/Future + 角色状态（客户端本地记忆展示日期，每设备每日首开展示）
GET  /api/stats/today               → 实时五维 + 当前角色状态（白天轮询，驱动角色实时变化）
GET  /api/timeline?date=            → 当日时间轴：应用/Agent 会话段 + 投喂打点 + 睡眠段
                                      （Pi 从当日节点即时聚合，不落新表）
GET  /api/days?range=30             → 状态一览数据
PATCH /api/todos/:id                → 勾选（同时落 todo_check 节点）
GET  /api/ping                      → outbox 探活
```

iOS 展示端只使用其中的 GET 接口（严格只读）。

### 6.3 发酵 pipeline 设计原则

- 一次 Save = 1~2 个云端 LLM 调用：一个大 prompt 输入「当日主动节点 + 应用会话摘要（作为环境上下文） + 存档留言（锚点） + 近几日摘要」，输出结构化 JSON：`{ summary, opening_line, review_points[], todos[], node_tags{}, edges[] }`。避免逐节点调用。
- 属性数值不在 LLM 输出中，由 Pi 在发酵落库后结算。
- 所有 LLM 调用带超时 + 一次重试 + Zod 校验（校验失败算失败）；发酵失败时降级回放上一次已落库的真实结果，不阻塞存档主流程。
- 存档留言是待办生成的锚点（治"从碎片推断待办容易生成废话"的老问题）。
- 发酵 JSON schema 与 API 合同同期冻结（T+6h），是前端 / prompt / 数据层三方合同。

## 7. 演示脚本（3 分钟）

1. **掏出 Orange Pi 实物**：一句话讲"第二大脑住在家里"，Mac 和 iPhone 连的是同一块板子。
2. 打开 app → **Continue**：Before 昨日复盘 + Future 今日待办（提前真实存档过一天，非假数据）；角色登场——"昨晚只睡了 5 小时，所以它今天是疲惫状态"（健康数据驱动、可解释，不是 AI 编的）。
3. **现场投喂**：打几个字、贴一个链接、录一句语音（现场转写）；切到**当日时间轴**：屏幕使用时长式地展示今天几点在干什么——应用会话分块、Coding Agent 会话一条带（"我们写这个项目的过程本身也被采集了进来"）、清早的睡眠段垫底。
4. **现场 Save**：弹出存档留言，现场说一句 → 结算画面：五维逐项跳出、角色状态揭晓、连击 +1（动画掩护发酵等待）。
5. **掏出 iPhone**：同一空间在手机上的只读呈现（角色 + Continue）；顺手秒换一个角色包，证明角色模块解耦。
6. 收尾：状态一览展示开发期间攒下的真实趋势与热力格。（可选 wow 点：拔网线投喂 → 插回补传。）

## 8. 里程碑（48h）

- **T+2h**：六个 spike 全部验证通过，跑不通的当场砍或换方案：① Pi 上 Node+SQLite 服务起来（含 better-sqlite3 arm64 安装验证，装不顺换 `node:sqlite`），桌面端局域网可达（mDNS/静态 IP）；② AppleScript 采样前台应用+标签页的授权流程；③ 从 Pi 调通云端 LLM 与转写；④ Tauri webview 录音权限（`getUserMedia`）；⑤ 快捷指令读健康数据并 POST 到局域网接口（手机上 10 分钟验证）；⑥ Tauri 2 iOS 空壳真机装机（免费签名跑通即可，受阻当场改判移动 Web 兜底）。
- **T+6h**：API 合同 + 发酵 JSON schema 冻结（`shared` 包落地）。
- **T+12h**：Pi 数据层 + nodes 读写 API + 桌面投喂（文本/URL）+ 节点流可用。
- **T+18h**：采样器独立进程（采样→会话聚合→上报 + localhost"立即采样"接口）+ outbox 离线补传跑通；launchd 自启可后补，开发期终端前台跑即可。
- **T+24h**：Save 全链路（留言弹窗 + 收尾快照 + 发酵 + 属性结算 + 落库）跑通。
- **T+32h**：Continue（Before/Future）+ 结算画面。
- **T+36h**：iOS 展示端在真机上读到 Pi 的真实数据（或已按 spike ⑥ 结论切移动 Web 兜底）。
- **T+40h**：角色系统（5 态整图切换 + 属性面板 + 角色包加载）+ 当日时间轴 + 状态一览；属性公式与状态阈值用真实数据调参。
- **T+44h**：功能冻结（语音投喂、动效打磨在此之前完成）。
- **T+44~48h**：全队真实使用攒演示数据、排练、录备用演示视频。

---

## 9. 待定项与风险（需持续讨论）

1. **iOS 端打包/签名风险**：Tauri 2 iOS + 免费开发者账号真机签名在 T+2h spike ⑥ 验证；受阻立即降级为 Pi 托管移动 Web 页（同一 React 代码、展示子集零改动），演示效果几乎等价，只损失"装了个 App"的说法。
2. **采样噪声稀释发酵质量**：定时采样节点量大、信息密度低。缓解：上报前代码聚合为应用会话；发酵 prompt 中会话只作"环境上下文"，不当"知识"。
3. **属性公式与状态阈值未调参**：精力扣分系数、状态阈值全是拍的初值。T+40h 前用全队真实数据调；结算画面展示的是相对变化感，绝对数值不必精确。
4. **演示网络是最大风险**：热点组网 + Pi 静态 IP 提前配好；**终极兜底：同一套 Node 服务可直接跑在演示笔记本上**（纯 Node+SQLite，无 Pi 依赖），Pi 挂了演示不死，Pi 实物仍可作为道具讲叙事。
5. **一天两次 Save**：P0 幂等（返回已有结算），重存重结算放 P1，避免结算数据被现场误操作污染。
6. **语音链路脆弱**：录音权限、上传、云转写三段都可能挂。兜底：文本输入永远可用；转写失败时音频已落盘，标记"待转写"不丢数据。
7. **冷启动**：第一天没有"昨日"，Continue 无内容。演示已绕开（提前存档一天）；产品上首日展示引导态 + 角色以"日常"状态登场。
8. **隐私叙事的边界**：原始数据只在 Pi，但发酵会把当日摘要送云端 LLM。答辩说法：数据主权在用户（原始数据不出家门），推理是无状态调用；路线图上 Pi NPU / 家用主机跑本地模型。相比 v0.3（全部依赖云端），叙事已是加分项。
9. **图表方案（已定稿）**：全部手写 SVG——时间轴（F12）本就无现成图表可套，热力格与折线随之共用一套 SVG 工具函数，零图表依赖，不引入 Recharts。
10. **多设备时序**：两台设备时钟不一致可能导致节点归日错乱。48h 内以 Pi 收到时间为准（`created_at` 服务端盖章），客户端时间仅存 `source_meta` 参考。
11. **快捷指令链路依赖家庭 Wi-Fi**：定时自动化只有手机在局域网内才够得着 Pi；某天健康数据缺失时，精力公式自动回退纯扣分式，不报错不摆烂。演示时手动触发一次快捷指令即可。
12. **Coding Agent 会话解析的格式耦合**：`~/.claude/projects` 的 JSONL 结构不是公开合同，版本升级可能变。只取时间戳和项目路径这类最稳的字段，解析失败静默跳过，不影响主流程。
13. **双进程编排**：采样器没起来会静默丢采集。缓解：UI 常显采集状态条（经 localhost 健康检查，异常时醒目提示）；launchd `KeepAlive` 兜底拉活；演示前检查清单含"采样器已运行"。
