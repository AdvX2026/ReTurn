# ReTurn PRD（临时代号）

> 版本：v0.6 · 2026-07-24 · 黑客松 48h 范围
> 一句话：一个住在你家里的第二大脑 Agent——Orange Pi 是它的身体，全天自动采集你的工作痕迹，对话即用；晚上 Save 进入夜间发酵，醒来收到昨日 briefing；上滑回溯过去，下滑看见建议的未来。
>
> v0.5 相对 v0.4：UI 从 Tauri 2 + React 改为 SwiftUI 原生（macOS + iOS 单代码库）；健康数据改为 iOS App 内 HealthKit 直读上报为主，快捷指令降为备胎。
>
> v0.6 相对 v0.5 的产品转向：从「游戏化每日存档」转为**效率软件 / 第二大脑 Agent**。
> - 主视图变为以 **Now** 为锚点的**双向时间流**：上刷 Before（回溯过去），下刷 Future（建议与灵感）；卡片（总结层）与时间线（明细层）概念同级。
> - 新增 **Input 对话交互**：小模型分诊（灵感 / 检索 / 提问）触发不同工作流；新增 **Task 异步管线**（会议纪要、笔记截图等高权重资料）。
> - **Save / Resume 从存档仪式变为工作节奏信号**：Save = 夜间检查点（触发发酵与降采样），Resume = 短休后小复盘。
> - **角色美术层砍掉**（状态立绘、结算画面、角色包），换品牌吉祥物；**五维属性与状态判定保留**（纯代码结算，状态降为文本标签）。
> - **iOS 升级为与 macOS 对等的全功能端**（写接口全开放）。
> - 后端相应扩展：`messages` / `tasks` / `cards` 三张新表 + chat / resume / cards 等新端点（见 §6.2）。功能编号自 v0.6 起重排。

---

## 1. 产品概述

- **形态**：Orange Pi 3B 家庭服务器（数据中枢，Node 服务 + SQLite）+ macOS 桌面端（**UI App 与常驻采样器双进程分离**，UI 用 SwiftUI）+ **iOS 端（SwiftUI，同一 Xcode 多平台工程，v0.6 起与桌面对等的全功能端）**。健康数据由 iOS App 内 HealthKit 直读上报 Pi（快捷指令备胎共存）。同一局域网内通信，客户端带离线缓冲。**平台范围就是 macOS + iOS，不做 Windows。**
- **核心概念**：一个**住在你家里的第二大脑 Agent**。它全天自动记录你在干什么（应用、标签页、Coding Agent 会话、健康），你随时通过对话使用它；界面是一条以 Now 为锚点的时间流——过去（Before）已被它整理成卡片和时间线，未来（Future）是它给你的建议。
- **节奏信号**：Save 与 Resume 不是仪式，而是你告诉系统自己工作节奏的开关。**Save**（晚间一次）= 大间隔、大休息：系统降低采集频率、跑长任务（发酵大复盘、备好次日 briefing）。**Resume**（白天随需，名称待定 Continue/Resume）= 短暂离开后回来：小复盘，告诉你刚才在干什么。
- **目标用户**：知识工作者/学生，信息来源分散（网页、语音、灵感碎片），缺乏复盘习惯。
- **用户模型**：**单用户、多设备**。多台 Mac + 一部 iPhone 连同一块 Pi，共享同一空间。不做多用户；sidebar 的「账号」即本空间身份展示，不做账号体系。
- **黑客松交付目标**：48 小时内做出**假数据尽量少、可完整演示运行**的产品。

### 1.1 评委叙事（Pitch）

- **痛点**：收藏夹吃灰、笔记软件成了信息坟场；「时间去哪了」没人说得清，复盘有价值但没人坚持。
- **差异**：Rewind / Mem / Obsidian 比拼「更强的记录与搜索」；ReTurn 是**知道你时间去哪了、并且物理地住在你家里的 Agent**——记录不用你动手，使用只需要说话。
- **硬件叙事**：原始数据（你开过什么应用、看过什么网页、说过什么话）只存在 Pi 上，不进任何厂商的云。演示时把 Orange Pi 实物摆上台，是差异化道具。（发酵调用云端 LLM 的边界与说法见 §9.7。）
- **一句话**：第二大脑工具解决「存进去」，ReTurn 解决「不用存、张口就能用」。

## 2. 核心循环（节奏循环）

```
白天        自动采集持续（采样器）＋ Input 随手对话/投喂
             │  短暂离开回来 → Resume：小复盘（“你刚才在做 X”）
晚上        Save：夜间检查点（可附一句留言，可跳过）
             │  系统进入夜间档：降采样、发酵大复盘
             │  产出：briefing 卡 / todo 建议卡 / 健康建议卡 / 连边 / 五维属性与状态
次日打开    Now 收到问候 + briefing；Before 流顶部出现昨日卡片
任意时刻    Input → 小模型分诊（灵感/检索/提问）→ 对应工作流 → 结果回 Now
```

1. **采集（全天自动）**：桌面常驻采样器（独立于 UI 的后台进程）每 3~5 分钟记录前台应用 + 浏览器标签页，并解析本地 Coding Agent 会话，落为节点上报 Pi（离线缓冲补传）；iOS App 进前台经 HealthKit 上报昨夜睡眠、当日步数（按日期幂等）。
2. **对话（全天随时）**：Input 是与第二大脑的核心交互。输入经小模型分诊为**灵感 / 检索 / 提问**三类意图，分别触发工作流（见 §3 F4）；会议纪要、截图等资料以 **Task** 提交异步加工，权重高于自动采集。
3. **Resume（白天随需）**：短暂休息回来点一下 → 基于最近会话聚合的小复盘，近实时返回，落入 Now 对话流。
4. **Save（一天一次，晚间）**：告诉系统「我要休息了」→ 触发夜间发酵（当日节点 + 对话 + 高权重资料 → 云端 LLM 结构化产出），采样器转入低频；次日打开任一设备，briefing 已备好。

## 3. 功能需求

### P0-A — 演示主线，必须真跑通

| 编号 | 功能 | 说明 |
|---|---|---|
| F1 | 多端同步基座 | Pi 上 HTTP API + SQLite；设备注册、离线缓冲补传（`client_uuid` 幂等）；健康上报接口；**写接口对 macOS / iOS 全开放**，`device_id` 区分来源 |
| F2 | 后台采样器 + 节奏模式 | 沿用 v0.5 独立进程采样器（osascript 采样 + Coding Agent jsonl 解析 + 主 outbox + localhost :8791 控制面）；**新增节奏模式**：每次上报时顺带从 Pi 拉取当前模式，Save 后转低频，次日固定时间（6:00）恢复 |
| F3 | 双向流主视图 | 以 Now 为锚点的一条上下滑动流：上刷 Before（briefing 等总结卡片 + 时间线明细段，越刷越早），下刷 Future（灵感卡、todo 建议卡、健康建议卡）；Now 承载对话消息、问候、吉祥物、Task 回传与待确认项（平时折叠/半隐藏，有内容时展开）。左滑 sidebar：空间身份 / 进行中 task / 设置&关于 |
| F4 | Input 与意图分诊 | Claude App 式底部输入。小模型分诊为 a.灵感 b.检索 c.提问，告知判断结果、可纠正，无法判断时交用户选择。**提问工作流是主线**：取相关节点+会话摘要塞 prompt 回答（“昨天干了什么”“刚刚在干什么”），回答落 Now。语音输入：录音 → Pi 转写 → 转写文本进分诊 |
| F5 | Save 夜间检查点 + 发酵 | 点 Save（可附一句留言作发酵锚点，可跳过）→ 收尾环境快照 → 夜间发酵：产出次日 briefing 卡（含五维属性、状态、streak + 昨日简报）、todo 建议卡、健康建议卡、节点标签与连边；属性与状态由纯代码结算。幂等：当日已 Save 直接返回 |
| F6 | Resume 小复盘 | 白天随需触发：最近几小时会话聚合 → 一次小 LLM 调用（或模板兜底）→「你刚才在做 X」即时回 Now，不落卡 |
| F7 | 时间线回溯 | 时间轴 + 时间点事件；应用/Agent 会话按时间段呈现，持续性事件用段状展示，时间模糊化显示；**跨日可回溯**（好几天/几周前），检索定位可跳转到指定位置。卡片是总结，时间线是想细看时的展开 |
| F8 | iOS 端 | 与桌面同一 SwiftUI 多平台代码库，**对等全功能**（双向流、Input、Task、Save/Resume）；另负责 HealthKit 健康上报（进前台即上报）。免费账号真机签名，受阻则模拟器演示兜底 |

### P0-B — 真跑但最小实现

| 编号 | 功能 | 说明 |
|---|---|---|
| F9 | 灵感工作流 | 分诊命中「灵感」→ 落 idea 节点（provenance=user）→ agent 附一句建议 → 归入 Future 灵感卡。发酵也可从采集/对话中抽取灵感（provenance=auto）；**卡片展示必须区分用户记录与自动抽取两种来源** |
| F10 | 检索定位 | 分诊命中「检索」→ 关键词匹配起步（embedding 余弦视时间）→ 返回 `{date, node_ids}` → 前端滚动时间线定位。能跳转即达标 |
| F11 | Task 管线 | 提交会议纪要文本 → 异步加工 → 落高权重节点 → 完成消息回传 Now（用户打开时可见）；sidebar 展示进行中 task。**截图 → 视觉 API 提取文本**视时间接入，失败降级为「请粘贴文本」 |
| F12 | 健康建议卡 | health_daily 数据 → 夜间发酵顺带生成建议文案 → Future 健康卡。数据必须真，文案从简 |

### P1 — 概念立住 / 有余力再做

- 桌面周视图、月视图（横向铺开）：真数据少量填充，交互从简。
- iOS 采集扩展（HealthKit 扩展指标：锻炼、心率等；iOS 无法采样前台应用，见 §9.10）。
- 分诊纠错改判（P0 内只做「无法判断 → 用户选择」分支）。
- T1 档软件接入（§3.1：Git 提交、VS Code 最近项目、Chrome 当日历史）。
- 当日重复 Save 的覆盖重结算（P0 内 Save 幂等）。
- 剪贴板监听（复制即候选节点，需用户确认收录）。
- 断网/恢复的演示化呈现（拔网线 → 补传动画）。

### P2 — 明确不做（黑客松内）

- Windows、Android、平板、Web 等其他端。
- 公网访问（Tailscale/frp）；仅局域网。真推送（APNs）——briefing 是「夜间备好、打开即见」。
- Future 侧时间线 / 计划轴。
- 角色美术层：状态立绘、结算画面、角色包（v0.6 砍除；五维属性与状态判定保留，见 §4）。
- 深度采集（屏幕截图/OCR/键鼠活跃度）。
- 流式对话响应、多轮长上下文对话（MVP 单轮 + 最近几条消息窗口）。
- 知识图谱可视化界面（图只作为内部数据结构）。
- 任何插件/扩展开发（VS Code 扩展、Chrome extension）。
- 多用户 / 账号体系。

### 3.1 软件接入（采集源清单）

原则：**只读软件留在磁盘上的痕迹**（本地文件、AppleScript），不写插件、不逆向私有 API：

| 档 | 来源 | 取什么 | 怎么取 | 成本 |
|---|---|---|---|---|
| T0（=F2，必做） | 系统 | 前台应用（定时采样） | NSWorkspace / osascript | 低 |
| T0（=F2，必做） | Chrome / Safari | 打开的标签页（标题+URL，定时采样+Save 收尾快照） | AppleScript，一次自动化授权 | 低 |
| T0（=F2，必做） | Claude Code / Coding Agent | 当日 agent 会话（项目、起止时间、时长） | 解析 `~/.claude/projects/**/*.jsonl` 时间戳聚合为会话 | 低，「产出/专注」的硬信号 |
| T0（=F1，必做） | iOS 健康 | 昨夜睡眠时长、当日步数 | iOS App 内 HealthKit 直读，进前台 POST 到 Pi，按日期幂等、重报刷新；备胎：快捷指令定时 POST 同一端点 | 低，「精力」唯一的硬信号 |
| T0（=F11） | 用户提交资料 | 会议纪要文本、笔记截图 | Input 提交 Task；截图走视觉 API 提取（视时间） | 中，**权重高于自动采集** |
| T1（P1，按序捞） | Git | 本地仓库当日提交 | 扫描 `git log --since` | 低 |
| T1 | VS Code | 最近打开的项目/文件 | 读 `state.vscdb` | 低 |
| T1 | Chrome | 当日浏览历史 | 拷贝 `History` SQLite 后读 | 中 |
| T2（黑客松后） | 日历 / Obsidian / 音乐 | 日程 / 当日笔记 / 听歌氛围 | AppleScript / 文件扫描 | 中 |

采集条目一律落为 node（`kind`：`app_sample`、`tab_sample`、`agent_session`、`health_daily`、`idea`、`image` 等），进入同一发酵管线；采样类节点在发酵 prompt 中作为「环境上下文」而非「知识」处理；用户提交资料（Task 产物、显式灵感）权重最高。

## 4. 吉祥物与五维属性（原角色系统的拆分：数值层保留，美术层砍掉）

### 4.1 品牌吉祥物

- 定位类似 Claude Code 的 Claw：**品牌情感载体**，不是游戏角色。住在 Now 区，承担问候、陪伴、待确认项的拟人出口。
- 实现：**小动画、小装饰**（类 Claw：idle 眨眼/摆动、问候时的小点缀），SwiftUI 内建动效实现，表情图 1~3 张封顶——美术预算全部投在这里。**不由属性驱动、无换装体系**；v0.5 的状态立绘、结算画面、角色包规范移除（P2）。

### 4.2 五维属性 —— 全部由代码确定性计算，LLM 不打分

可解释、可复现，数值不会无故跳变。计算在 Pi 上进行；当天任意时刻可按当前数据实时结算（`/api/stats/today`），夜间发酵时定格写入 `days.stats_json`，展示在次日 briefing 卡上（即前端设计中的「每日可计算等级」的具象化）。

**前置：会话聚合（纯代码）**。连续的同应用采样合并为一个「应用会话」（间隔超过 1 个采样周期即断开），得到 `sessions = [(app, start, end, duration)]`；Coding Agent 会话（自带起止时间）直接并入 sessions。会话同时喂给属性计算与发酵上下文。

| 属性 | 含义 | 计算（公式系数为初值，演示前用真实数据调参） |
|---|---|---|
| 摄取 | 主动收进了多少东西 | 当日**主动输入**（灵感记录、Task 资料、投喂）节点数 × 来源种类数加权（采样节点不计入，防刷） |
| 专注 | 注意力是否集中 | 应用会话时长集中度（HHI）与最长单会话时长的加权；有标签后叠加主题标签集中度 |
| 产出 | 做完了多少 | 当日 todo 完成率为主 + 当日 Coding Agent 会话时长加成（P1 接入 Git 后再叠加提交数） |
| 连贯 | 今天和过去接得上吗 | 本次发酵新增的跨日连边数（封顶映射到 0~100） |
| 精力 | 疲惫的反面 | 昨夜睡眠为主信号：min(睡眠时长/8h, 1)×70 + 步数加成(≤15) + 15 − 深夜(00:00–06:00)活跃采样扣分 − 无间断连续工作超 90min 扣分，clamp 到 0~100；无健康数据时回退为 100 起扣的纯扣分式 |

### 4.3 状态判定 —— 属性阈值驱动，纯文本标签（无美术）

按优先级取第一个命中的状态（阈值为初值，可调）：

| 优先级 | 状态 | 触发条件 |
|---|---|---|
| 1 | 疲惫 | 精力 < 40 |
| 2 | 高产 | 产出 ≥ 70 |
| 3 | 心流 | 专注 ≥ 70 |
| 4 | 灵感迸发 | 摄取 ≥ 70 |
| 5 | 日常（默认） | — |

- 状态是**文本标签**：展示在 briefing 卡（昨日定格）与 `/api/stats/today`（白天实时，Now 问候文案可引用）；不驱动吉祥物美术、无立绘切换。
- streak（连续记录天数）保留为 briefing 卡上的一行文本，无动画、无惩罚机制。

## 5. 数据模型

### 5.1 Pi 端 SQLite（唯一权威数据源）

```sql
devices(id, name, platform, last_seen_at)
nodes(id, day_id, device_id, kind, title, content, source_meta, client_uuid, created_at)
  -- kind: text | url | voice | save_note | app_sample | tab_sample | agent_session
  --       | health_daily | snapshot | todo_check | idea | image
  -- idea 节点 source_meta 记 provenance: user(显式记录) | auto(采集/发酵抽取)
  -- client_uuid: 客户端生成的幂等键，补传去重用
edges(id, src_node_id, dst_node_id, relation, created_by_day_id)
days(id, date, saved_at, save_note_node_id, summary, stats_json /* 五维+状态定格 */)
todos(id, day_id, text, done, source_node_id)
messages(id, role /* user|agent */, content, intent /* idea|retrieval|question|NULL */,
         task_id, created_at)          -- Now 区对话流
tasks(id, type, status /* queued|running|done|failed */,
      input_json, result_message_id, created_at, finished_at)
cards(id, type /* briefing|idea|todo_suggestion|health */, date,
      content_json, created_at)        -- 双向流分页需要稳定实体，卡片落库
```

- 一切收集物统一为 node；卡片是发酵/工作流的**产物层**，引用节点而不复制内容（`content_json` 内存 node_ids）。
- 语义检索（F10 升级路径）：小数据量直接算 embedding 余弦相似度，不引入向量库。

### 5.2 客户端离线缓冲

- 采样器持有**主 outbox**（进程内 SQLite）：采样、Agent 会话先落本地再上报；Pi 不可达时静默积压，恢复后按序补传，靠 `client_uuid` 去重。
- UI 进程（macOS 与 iOS 同构）持有**轻量 outbox**（本地 JSON 文件队列，重发复用同一 `client_uuid`）：可离线排队的只有落节点类写入（灵感记录、todo 勾选）；对话问答、检索、Resume、Save 依赖在线，离线时置灰并展示「未连接到空间」状态条。
- 读操作（流、时间线、卡片）离线时展示最后一次成功拉取的缓存。

## 6. 技术架构

### 6.1 拓扑

```
┌─ Mac（可多台，双进程分离） ─────┐        ┌────── Orange Pi 3B (Debian) ──────┐
│ UI App (SwiftUI, macOS)        │        │  Node 服务 (Fastify)               │──▶ 云端 LLM API
│   双向流/Input/录音/轻量outbox  ├─局域网─▶│  SQLite / 分诊与工作流编排 /        │──▶ 云端转写 API
│ 采样器 (Node, launchd 常驻)     │  HTTP  │  发酵 / 五维属性结算                │──▶ 云端视觉 API(可选)
│   采样/Agent会话/主 outbox      │        │  (所有 API key 只存在 Pi 上)        │
│   ◀─ localhost 仅本机: 立即采样 │        └───────────────▲───────────────────┘
│   （节奏模式随上报从 Pi 拉取）   │                        │
└────────────────────────────────┘                        │
┌─ iPhone ───────────────────────┐                        │
│  iOS 端 (SwiftUI, 同一工程)     ├─局域网────────────────┘
│   对等全功能 + HealthKit 上报   │
└────────────────────────────────┘
```

后端全栈 TypeScript（server / sampler / shared 一种语言、一份合同）；前端 Swift/SwiftUI（macOS + iOS 单代码库）：

| 层 | 选型 | 备注 |
|---|---|---|
| 运行时 | Node 22 LTS + tsx（开发与 Pi 上均直接跑 TS，不做构建） | 少一个 build 环节少一类演示事故 |
| Monorepo | pnpm workspaces：`shared` / `server` / `sampler`；`apps/ReturnApp` 为独立 Xcode 多平台工程（同仓、不进 pnpm workspace） | Swift 工程与后端契约改动在同一 diff 内可见 |
| 合同 | `shared`：Zod schema（API 请求/响应 + 发酵 JSON + kind/intent/卡片枚举）是唯一事实来源；Swift 侧手写 Codable 镜像集中于 `Models.swift` | 改合同必须同步两份；REST 可 curl 调试 |
| 服务端（Pi） | Fastify + fastify-type-provider-zod；`node:sqlite` + 手写 SQL + 编号迁移 | 表不多不上 ORM；systemd 常驻；LLM/转写/视觉 key 走 Pi 环境变量，**不下发客户端、不入 git** |
| LLM 调用 | Vercel AI SDK + OpenAI-compatible provider，`generateObject` 绑 Zod schema | 发酵/提问用主模型；**分诊与 Resume 用廉价小模型**；语音走 Whisper 兼容转写；截图走视觉 API（可选）；全部由 Pi 发起 |
| 采样器 | 独立 Node 常驻进程（launchd 托管）：setInterval + execa 调 osascript；localhost 控制面用裸 `node:http`；节奏模式随上报响应从 Pi 拉取 | 与服务端同栈，outbox / schema 复用 `shared` |
| 前端（双端） | SwiftUI 多平台工程（macOS 14 / iOS 17 基线），一份代码出双端对等功能 | URLSession async/await 直连 Pi 与采样器；无 WebView、无 JS 运行时 |
| 状态管理 | `@Observable` store + `Task` 循环轮询（messages / cards / 采集状态；缓存、重试、离线降级）；纯 UI 状态用 `@State` | 不引路由、不上 TCA |
| 录音 | AVAudioRecorder 录 `.m4a` → multipart 上传 `/api/voice` → 转写文本进分诊 | UI 轻量 outbox 用本地 JSON 文件队列 |
| 健康 | HealthKit（仅 iOS target，`#if os(iOS)` 圈住）：进前台同步昨夜睡眠 + 当日步数 | 不做后台推送（BGTask 不碰） |
| 组件/动效 | 系统组件 + SF Symbols；动效主战场是**双向流的滑动手感与 Now 展开/折叠**；吉祥物轻动效 | 零 UI 依赖 |
| 图表 | 时间线（F7）用 Canvas 自绘；周/月视图（P1）用 Swift Charts | 零第三方图表依赖 |
| 网络权限 | Info.plist：`NSAllowsLocalNetworking` + iOS `NSLocalNetworkUsageDescription`；macOS 不开 App Sandbox | |
| 质量工具 | Biome（server/sampler）+ TS strict；Swift 侧用 Xcode 默认诊断 | 不引 SwiftLint |
| 发现 | Pi 起 mDNS（`return.local`）+ 设置页手填 IP 兜底 | 演示热点组网、Pi 静态 IP，iOS 演示直接写死 IP |

明确不用：tRPC、ORM、Next.js/SSR、Electron/Tauri、React/Vite、TCA、SwiftData/CoreData、SwiftLint、第三方图表库、向量库。

### 6.2 API 合同（v0.6 增量在既有合同上一次性扩展后再冻结）

```
POST /api/devices/register          → { device_id }
POST /api/nodes  (批量, 带 client_uuid)   采样上报 + 离线队列写入共用
POST /api/voice  (multipart 音频)    → 转写 → 转写文本进分诊（同 /api/chat 语义）
POST /api/health { date, sleep_minutes, steps }   （固定 token 请求头；按日期幂等）
GET  /api/nodes?date=  ·  DELETE /api/nodes/:id   （错误抓取兜底）
POST /api/chat   { text | image }   → 分诊 + 触发工作流，整段返回
                                      { message_id, intent, reply/result }（不做流式）
PATCH /api/messages/:id/intent      → 纠正分诊（P0 内仅「无法判断→用户选」路径使用）
GET  /api/messages?cursor=          → Now 区对话流
GET  /api/cards?direction=before|future&cursor=   → 双向流分页
GET  /api/tasks?status=             → sidebar 进行中任务
POST /api/resume                    → 小复盘（近实时，落 message）
POST /api/save   { date, note_text? | note_voice_ref? }
     → 夜间检查点：触发发酵，阻塞至完成（或降级）；幂等：当日已存档直接返回
GET  /api/timeline?from=&to=        → 范围化时间轴（Pi 从节点即时聚合，不落新表）
GET  /api/days?range=30             → 属性/状态/streak 历史（周/月视图数据源）
PATCH /api/todos/:id                → 勾选（同时落 todo_check 节点）
GET  /api/stats/today               → 实时五维 + 当前状态 + 采集状态（Now 问候可用）
GET  /api/ping                      → outbox 探活
```

写接口对 macOS / iOS 全开放；采样器额外在上报响应中获得当前节奏模式。合同扩展与 Swift `Models.swift` 镜像同 diff 更新，扩展完成后重新冻结。

### 6.3 Agent 工作流与发酵 pipeline

- **分诊**：一次廉价小模型调用 → `{intent, confidence}`；低置信度不猜，Now 里让用户选；判断结果附在回复里可纠正。演示词避开模糊输入。
- **灵感**：落 idea 节点（provenance=user）→ 附一句建议 → 归入 Future 灵感卡。
- **检索**：关键词起步（embedding 视时间）→ `{date, node_ids}` → 前端跳转时间线。
- **提问**：相关节点 + 会话摘要塞 prompt → 主模型回答 → 落 message。
- **Task**：纪要文本 /（截图 → 视觉 API）→ 提取落高权重节点 → 完成消息回 Now；失败降级不丢输入。
- **Resume**：最近几小时会话聚合（复用 sessions 代码）→ 小模型一句话复盘（或模板兜底）→ 即时返回。
- **夜间发酵（Save 触发）**：1~2 次主模型调用，输入「当日节点 + 对话 + 高权重资料 + 留言锚点 + 近几日摘要」，输出结构化 JSON：`{ summary, briefing, review_points[], todos[], health_advice, ideas[], node_tags{}, edges[] }` → Zod 校验 → 落 cards/edges/todos → 纯代码结算五维属性与状态。采样节点只作「环境上下文」。
- 所有 LLM 调用带超时 + 一次重试 + Zod 校验；发酵失败降级回放上一次已落库结果，不阻塞 Save 主流程。

## 7. 演示脚本（3 分钟）

1. **掏出 Orange Pi 实物**：第二大脑物理地住在家里，Mac 和 iPhone 连的是同一块板子。
2. 打开 App → **Now**：吉祥物问候 + 昨日 briefing 卡（提前真实 Save 过一天，含五维属性、状态与 streak——「昨晚睡眠不足所以状态是疲惫」，健康数据驱动、可解释，不是 AI 编的）；上刷 **Before**：昨日卡片 → 时间线回溯，「几点在写代码、几点在开会，它都知道」。
3. **对话**：输入「我昨天下午在干什么」→ 分诊为提问 → RAG 回答；再输入一个关键词 → 分诊为检索 → 时间线自动跳转定位（回溯到几天前）。
4. **灵感 + Task**：随手记一条灵感 → Future 灵感卡（区分「我记的」和「它帮我记的」）；贴一段会议纪要提交 Task → sidebar 可见进行中 → 完成回传 Now。
5. **Resume**：「刚才离开了五分钟」→ 点 Resume → 小复盘一句话。**Save**：现场 Save → 系统进入夜间档（降采样 + 发酵）。
6. **掏出 iPhone**：同一空间、对等体验（流 + 对话都能用）；健康建议卡——「昨晚睡眠数据是真的，从我手机 HealthKit 来的」。收尾看桌面周视图趋势（可选 wow 点：拔网线灵感记录 → 插回补传）。

## 8. 里程碑（v0.6 增量，在已完成基座上按依赖序推进）

v0.5 已完成：shared 合同（v0.5 面）、server（路由/SQLite/发酵/统计/会话聚合）、sampler（采样/jsonl 解析/outbox/控制面）。v0.6 剩余工作：

1. **合同扩展**（shared Zod + `Models.swift` 镜像同 diff）：messages/tasks/cards schema、intent/卡片枚举、新端点请求响应 → 扩展完成即重新冻结。
2. **server 扩展**：三张新表迁移；chat 分诊 + 提问 RAG + resume；save 语义扩展（卡片产出、五维/状态结算沿用 v0.5 代码）；timeline 范围化；节奏模式下发。
3. **SwiftUI 主线**：双向流主视图（Before/Now/Future）+ Input + sidebar + 时间线回溯（P0-A 门面，最大单块工作量）。
4. **P0-B 工作流**：灵感、检索定位、Task（纪要文本）、健康建议卡；视觉 API 视时间。
5. **收尾**：sampler 节奏模式联调、iOS 真机、属性公式与状态阈值调参、全队真实使用攒演示数据、排练、录备用视频。周/月视图等 P1 项有余力再进。

## 9. 待定项与风险（需持续讨论）

1. **iOS 端签名/权限风险**：免费开发者账号 profile 仅 7 天有效——演示前一天必须重新签名装机；本地网络权限被误拒会导致 App 全盲。签名受阻兜底是模拟器演示。
2. **分诊准确率**：小模型误判意图会打断体验。缓解：低置信度不猜、交用户选择；回复附判断结果可纠正（P0 只做用户选择分支）；演示词避开模糊输入。
3. **采样噪声稀释发酵质量**：定时采样节点量大、信息密度低。缓解：上报前聚合为应用会话；发酵中会话只作「环境上下文」；用户提交资料权重最高。
4. **演示网络是最大风险**：热点组网 + Pi 静态 IP 提前配好；**终极兜底：同一套 Node 服务可直接跑在演示笔记本上**，Pi 挂了演示不死，实物仍作道具。
5. **语音链路脆弱**：录音、上传、云转写三段都可能挂。兜底：文本输入永远可用；转写失败时音频已落盘，标记「待转写」不丢数据。
6. **冷启动**：第一天没有「昨日」，Before 流无内容。演示已绕开（提前存档一天）；产品上首日展示引导态，Now 由吉祥物问候撑住。
7. **隐私叙事的边界**：原始数据只在 Pi，但分诊/发酵会把摘要送云端 LLM。答辩说法：数据主权在用户（原始数据不出家门），推理是无状态调用；路线图上 Pi NPU / 家用主机跑本地模型。
8. **多设备时序**：以 Pi 收到时间为准（`created_at` 服务端盖章），客户端时间仅存 `source_meta` 参考。
9. **Coding Agent 会话解析的格式耦合**：`~/.claude/projects` JSONL 结构不是公开合同。只取时间戳和项目路径这类最稳字段，解析失败静默跳过。
10. **iOS「采集」可做项有限**：系统不允许第三方 App 采样前台应用（Screen Time API 不开放细粒度）；iOS 侧采集扩展实际是 HealthKit 扩展指标一类（P1）。
11. **没有真推送**：局域网内无 APNs，briefing 的实际语义是「夜间备好、打开即见」，演示话术照此表述，不说「推送」。
12. **节奏模式生效延迟**：采样器随上报拉取模式，Save 后降频最多延迟一个上报周期才生效；可接受，不做额外通道。多台 Mac 天然一致是该方案的主要收益。
13. **属性公式与状态阈值未调参**：系数与阈值全是拍的初值，演示前用全队真实数据调；briefing 展示相对变化感，绝对数值不必精确。
14. **双进程编排**：采样器没起来会静默丢采集。缓解：UI 常显采集状态条（经 localhost 健康检查）；launchd `KeepAlive` 兜底；演示前检查清单含「采样器已运行」。
15. **健康同步依赖「当天打开过 iOS App」**：哪天没开 App、备胎快捷指令也没触发，当天就没有精力硬信号——精力公式自动回退纯扣分式，不报错。演示当天打开一次 iOS App 即可。
16. **视觉 API 链路可选**：截图提取失败或没时间接入时，降级为「请粘贴文本」，Task 主链路不依赖视觉。
