# ReTurn PRD（临时代号）

> 版本：v0.6 · 2026-07-25 · 黑客松 48h 范围（Timeline 规范补充）
> 一句话：一个住在你家里的第二大脑 Agent——Orange Pi 是它的身体，全天自动采集你的工作痕迹，对话即用；晚上 Save 进入夜间发酵，醒来收到昨日 briefing；在 Before / Now / After 之间左右滑动，回溯过去或看见建议。
>
> v0.5 相对 v0.4：UI 从 Tauri 2 + React 改为 SwiftUI 原生（macOS + iOS 单代码库）；健康数据改为 iOS App 内 HealthKit 直读上报为主，快捷指令降为备胎。
>
> v0.6 相对 v0.5 的产品转向：从「游戏化每日存档」转为**效率软件 / 第二大脑 Agent**。
> - 主视图变为以 **Now** 为锚点的**双向时间流**：向左是 Before（回溯过去），向右是 After（建议与灵感）；卡片（总结层）与时间线（明细层）概念同级。
> - 新增 **Input 对话交互**：小模型分诊（灵感 / 检索 / 提问）触发不同工作流；新增 **Task 异步管线**（会议纪要、笔记截图等高权重资料）。
> - **Save / Resume 从存档仪式变为工作节奏信号**：Save = 夜间检查点（触发发酵与降采样），Resume = 短休后小复盘。
> - **角色美术层砍掉**（状态立绘、结算画面、角色包），换品牌吉祥物；**五维属性与状态判定保留**（纯代码结算，状态降为文本标签）。
> - **iOS 升级为与 macOS 对等的全功能端**（写接口全开放）。
> - 后端相应扩展：`messages` / `tasks` / `cards` 三张新表 + chat / resume / cards 等新端点（见 §6.2）。功能编号自 v0.6 起重排。

---

## 1. 产品概述

- **形态**：Orange Pi 3B 家庭服务器（数据中枢，Node 服务 + SQLite）+ macOS 桌面端（**UI App 与常驻采样器双进程分离**，UI 用 SwiftUI）+ **iOS 端（SwiftUI，同一 Xcode 多平台工程，v0.6 起与桌面对等的全功能端）**。健康数据由 iOS App 内 HealthKit 直读上报 Pi（快捷指令备胎共存）。同一局域网内通信，客户端带离线缓冲。**平台范围就是 macOS + iOS，不做 Windows。**
- **核心概念**：一个**住在你家里的第二大脑 Agent**。它全天自动记录你在干什么（应用、标签页、Coding Agent 会话、健康），你随时通过对话使用它；界面是一条以 Now 为锚点的时间流——过去（Before）已被它整理成卡片和时间线，之后（After）是它给你的建议。
- **节奏信号**：Save 与 Resume 不是仪式，而是你告诉系统自己工作节奏的开关。**Save**（晚间一次）= 大间隔、大休息：系统降低采集频率、跑长任务（发酵大复盘、备好次日 briefing）。**Resume**（白天随需，名称待定 Continue/Resume）= 短暂离开后回来：小复盘，告诉你刚才在干什么。
- **目标用户**：知识工作者/学生，信息来源分散（网页、语音、灵感碎片），缺乏复盘习惯。
- **用户模型**：**单用户、多设备**。多台 Mac + 一部 iPhone 连同一块 Pi，共享同一空间。不做多用户；sidebar 的「账号」即本空间身份展示，不做账号体系。
- **黑客松交付目标**：48 小时内做出**假数据尽量少、可完整演示运行**的产品。

### 1.1 评委叙事（Pitch）

- **痛点**：收藏夹吃灰、笔记软件成了信息坟场；「时间去哪了」没人说得清，复盘有价值但没人坚持。
- **差异**：Rewind / Mem / Obsidian 比拼「更强的记录与搜索」；字节开源的 MineContext 验证了「主动式上下文感知助手」这条赛道，但它靠每 5 秒截屏 + VLM 深采集，装进单机笔记本。ReTurn 走元数据轻采集 + 用户主动投喂，是**知道你时间去哪了、并且物理地住在你家里的 Agent**——记录不用你动手，使用只需要说话，原始数据不进任何厂商的云。
- **硬件叙事**：原始数据（你开过什么应用、看过什么网页、说过什么话）只存在 Pi 上，不进任何厂商的云。演示时把 Orange Pi 实物摆上台，是差异化道具。（发酵调用云端 LLM 的边界与说法见 §9.7。）
- **一句话**：第二大脑工具解决「存进去」，ReTurn 解决「不用存、张口就能用」。

## 2. 核心循环（节奏循环）

```
白天        自动采集持续（采样器）＋ Input 随手对话/投喂
             │  短暂离开回来 → Resume：小复盘（“你刚才在做 X”）
晚上        Save：夜间检查点（可附一句留言，可跳过）
             │  系统进入夜间档：降采样、发酵大复盘
             │  产出：briefing 记录（UI 渲染为 Daily Briefing Card Group）/ todo 建议卡 / 健康建议卡 / 连边 / 五维属性与状态
次日打开    Now 展示最新的昨日 briefing；进入历史后，Before 在被总结日期下提供 briefing 入口
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
| F3 | 双向流主视图 | iOS 以 Now 为锚点横向排列 Before / Now / After，顶部 label 与左右滑动位置共用 selection；Before 承载历史 Timeline 与历史 Product Card，After 承载灵感卡、todo 建议卡、健康建议卡；Now 承载对话消息、问候、吉祥物、Task 回传与待确认项（平时折叠/半隐藏，有内容时展开）。向上滑动露出 sidebar：空间身份 / 进行中 task / 设置&关于。macOS 布局另行设计 |
| F4 | Input 与意图分诊 | Claude App 式底部输入。小模型分诊为 a.灵感 b.检索 c.提问，告知判断结果、可纠正，无法判断时交用户选择。**提问工作流是主线**：取相关节点+会话摘要塞 prompt 回答（“昨天干了什么”“刚刚在干什么”），回答落 Now。语音输入：录音 → Pi 转写 → 转写文本进分诊 |
| F5 | Save 夜间检查点 + 发酵 | 点 Save（可附一句留言作发酵锚点，可跳过）→ 收尾环境快照 → 夜间发酵：产出一条 briefing `CardRecord`（UI 渲染为 Daily Briefing Card Group，含五维属性、状态、streak + 昨日简报；呈现分层见 §4.3），并分别产出 todo 建议卡、健康建议卡、节点标签与连边；todo 建议须与提醒事项中未完成项**查重**、并按历史建议的采纳情况校准（偏好回环，见 §6.3）；属性与状态由纯代码结算。幂等：当日已 Save 直接返回 |
| F6 | Resume 小复盘 | 白天随需触发：最近几小时会话聚合 → 一次小 LLM 调用 →「你刚才在做 X」即时回 Now，不落卡；provider 未配置或调用失败时明确返回错误 |
| F7 | 时间线回溯 | Timeline 是紧凑、可下钻的历史索引：精确事件用 Point，持续/区间事件用 Span，低重要度痕迹降为 Ambient，相关高价值事件合并为可点击 Cluster；**跨日可回溯**（好几天/几周前），检索定位可跳转到指定位置。完整分类、Input 与 Daily Briefing 规则见 §3.2 |
| F8 | iOS 端 | 与桌面同一 SwiftUI 多平台代码库，**对等全功能**（双向流、Input、Task、Save/Resume）；另负责 HealthKit 健康上报（进前台即上报）。免费账号真机签名，受阻则模拟器演示兜底 |

### P0-B — 真跑但最小实现

| 编号 | 功能 | 说明 |
|---|---|---|
| F9 | 灵感工作流 | 分诊命中「灵感」→ 落 idea 节点（provenance=user）→ agent 附一句建议 → 归入 After 灵感卡。发酵也可从采集/对话中抽取灵感（provenance=auto）；**卡片展示必须区分用户记录与自动抽取两种来源** |
| F10 | 检索定位 | 分诊命中「检索」→ 关键词匹配起步（embedding 余弦视时间）→ 返回 `{date, node_ids}` → 前端滚动时间线定位。能跳转即达标 |
| F11 | Task 管线 | 提交会议纪要文本 → 异步加工 → 落高权重节点 → 完成消息回传 Now（用户打开时可见）；sidebar 展示进行中 task。截图 → 视觉 API 提取文本；失败时 Task 标记为 `failed`，会议纪要保留原文，截图不伪造提取结果 |
| F12 | 健康建议卡 | health_daily 数据 → 夜间发酵顺带生成建议文案 → After 健康卡。数据必须真，文案从简 |

### P1 — 概念立住 / 有余力再做

- 桌面周视图、月视图（横向铺开）：真数据少量填充，交互从简。
- iOS 采集扩展（HealthKit 扩展指标：锻炼、心率等；iOS 无法采样前台应用，见 §9.10）。
- 分诊纠错改判（P0 内只做「无法判断 → 用户选择」分支）。
- 状态驱动吉祥物**动画选择**（如疲惫时打哈欠）：复用状态标签，仅动效代码，不新增立绘。
- T1 档软件接入（§3.1：Git 提交、VS Code 最近项目、Chrome 当日历史、Apple 提醒事项回采）。
- 周报卡：发酵管线每 7 个 saved day（或周日晚）多产出一张 `weekly` 卡，叙事型周总结，纯复用日 briefing 管线。
- Input 联想（Intelligent Resurfacing 的廉价等价物）：用户在 Input 记灵感时，拿输入文本查一次 embedding，把相关旧节点浮到 Now（「你三周前记过类似的想法」），复用 F10 检索管线。
- Token 用量监控：Pi 端每次 LLM/转写/视觉调用记一行 `llm_usage` 表，`GET /api/usage` 聚合返回；不做面板。
- 当日重复 Save 的覆盖重结算（P0 内 Save 幂等）。
- 剪贴板监听（复制即候选节点，需用户确认收录）。
- 断网/恢复的演示化呈现（拔网线 → 补传动画）。

### P2 — 明确不做（黑客松内）

- Windows、Android、平板、Web 等其他端。
- 公网访问（Tailscale/frp）；仅局域网。真推送（APNs）——briefing 是「夜间备好、打开即见」。
- After 侧时间线 / 计划轴。
- 角色美术层：状态立绘、结算画面、角色包（v0.6 砍除；五维属性与状态判定保留，见 §4）。
- 深度采集（屏幕截图/OCR/键鼠活跃度）；**任何隐蔽/无系统指示的屏幕采集永不做（不限黑客松）**——轻采集是隐私叙事的防御性资产，不是妥协。
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
| T1 | Apple 提醒事项 | **全部提醒列表**的条目（新增/完成/未完成，含用户手写 todo 与被采纳的 AI 建议） | 采样器 AppleScript 读取，落 `reminder` 节点 | 低，todo 偏好回环的正样本源（见 §6.3） |
| T1 | VS Code | 最近打开的项目/文件 | 读 `state.vscdb` | 低 |
| T1 | Chrome | 当日浏览历史 | 拷贝 `History` SQLite 后读 | 中 |
| T2（黑客松后） | 日历 / Obsidian / 音乐 | 日程 / 当日笔记 / 听歌氛围 | AppleScript / 文件扫描 | 中 |

采集条目一律落为 node（`kind`：`app_sample`、`tab_sample`、`agent_session`、`health_daily`、`idea`、`image`、`reminder` 等），进入同一发酵管线；采样类节点在发酵 prompt 中作为「环境上下文」而非「知识」处理；用户提交资料（Task 产物、显式灵感）权重最高。

Apple 提醒事项是**双向**接入：读取侧回采全部提醒列表（已拍板——采样的定位就是收集）；写入侧是 AI todo 建议卡上的「采纳」动作，由 UI 端经 EventKit 写入提醒事项（需写权限），随后被采样器回采，构成偏好正样本（回环设计见 §6.3）。

### 3.2 Before：Timeline、Product Card 与历史归档

#### 3.2.1 目标与信息层级

Before 是用户回溯过去的空间，提供两种**同级但不可混淆**的信息形式：

| | Timeline | Product Card |
|---|---|---|
| 信息层 | 明细索引层 | 总结/归因层 |
| 回答的问题 | “什么时候发生了什么？” | “这些记录意味着什么？” |
| 默认密度 | 紧凑，只保留识别与定位信息 | 展示 Agent 生成的总结、建议与归因 |
| 交互 | 有下钻价值的条目可点击 | 天然可点击，进入对应详情 |

Timeline 不是完整日志，也不是卡片瀑布流。默认视图应让用户快速看出一天的结构；被降级或合并的原始事件不能丢失，必须能通过下钻找回。

Timeline 内允许出现使用白色圆角面的 **Timeline Cluster**，用于合并同一工作上下文中的事件。Timeline Cluster 仍属于时间轨道，带真实时间范围并可进入子时间线；它不是 Product Card，也不复用 `CardType` 的产品语义。

Daily Briefing 是 Product Card Group。它在 Timeline 日期标题下只提供历史入口，完整卡片组在独立历史页面查看。

本节的数据语义供 iOS/macOS 共用；轨道、节点、点击区与排版只约束当前 iOS 视图，macOS 布局另行设计。

#### 3.2.2 分类模型：分层描述切面

不得把当前四种视觉原型直接冻结成一个 shared enum。产品语义至少要区分以下描述切面；它们用于明确含义，**不是本轮已拍板的合同字段**：

**A. 时间形态**

- `point`：有一个可定位发生时刻的离散事件。
- `span`：具有实际持续时间，或只能确定在一个时间区间内发生的事件。

**B. 聚合关系**

- `standalone`：单个事件或会话直接展示。
- `cluster`：多个相关子事件合并后的可下钻结构；Cluster 通常仍占一个 `span`，并不是第三种时间形态。

**C. 强调程度**

- `ambient`：低重要度背景痕迹，需要保留但不与主活动竞争。
- `normal`：普通可见事件。
- `major`：值得突出并提供下钻的工作片段。

**D. 来源与角色**

- `input`：用户显式提交的文字、语音、图片、链接或用户灵感。
- `sample`：系统/采样器自动记录的环境痕迹。
- `derived`：Agent 聚合、发酵或推导出的结构。

这些值不一定严格互斥：一个 Cluster 自身是 derived，其 children 仍可同时来自 input 与 sample。时间跨度与时间精度也是不同概念：持续 90 分钟的 Agent session 可以是精确 `span`；“下午整理资料”也是 `span`，但时间精度较低。UI 不得展示数据并不支持的虚假精确时刻；是否在合同中新增 `exact/approximate` 字段见 §3.2.7 的待评审项。

#### 3.2.3 iOS 默认视觉映射

| 语义组合 | Timeline 表现 | 默认点击 |
|---|---|---|
| `point + standalone + ambient + sample` | 极小灰点、短细线、单行低对比文字 | 否 |
| `point + standalone + normal` | 彩色圆点和指向箭头；类型行 + 短标题 | 视内容而定 |
| `span + standalone + normal` | 贴合轨道的彩色区间；起止时间、标题、时长 | 可选 |
| `span + cluster + major` | 与轨道相连的紧凑 Timeline Cluster；预览少量 child | 是，进入子时间线 |
| `point + standalone + normal + input` | 来源图标/类型 + 单行原输入，保留轨道箭头 | 是，进入对应 After 结果 |

Ambient 的典型例子：用户主要在外出或进行另一项活动时，夹杂了一次 Git commit。它应可见但很弱，而不是获得与主活动同样高的节点。

#### 3.2.4 信息密度、降级与智能合并

Timeline 的压缩规则：

- 默认只展示识别事件所需的最少文字；
- 低重要度事件不得同级占用完整 Point/Span，可降为 Ambient 或收进相关 Cluster；
- 同一项目、任务、Agent 会话或语义上下文中的连续事件，可以结合时间邻近度与语义相关性合并；
- 不能只因时间相邻就把无关事件合并；
- Cluster 默认只预览 2–3 个代表性子事件，并显示 `+N more`；
- 合并必须可逆：保留全部 child ID、原始时间与顺序；
- 每个原始事件在同一层级只能有一个主要归属，避免既独立展示又在 Cluster 内重复；
- 聚合后的 Event count 仍反映底层真实事件数；
- 用户显式 Input 默认保留为独立紧凑 Point，确保“何时输入了什么”在主层级可见；是否允许收进 Cluster 尚待产品确认，不得先静默折叠；
- 长期目标是让重要度与合并关系拥有单一权威来源，避免多个客户端各自根据 `category` 随机猜测；该权威位于 server 还是其他聚合层，待合同评审。

#### 3.2.5 用户 Input 的 Before 归档

Before 对一次 Input 只回答：

1. 用户何时输入；
2. 使用了什么媒介；
3. 用户输入了什么。

Before 不展开分诊判断、Agent 回答、建议或其他派生结果。即时回答仍按 F4 落在 Now；用户已确认历史 Input 点击后应进入与该输入关联的 After 结果/上下文，但“Now 的即时结果如何持久化并归档到 After”仍待 Main/After 与后端共同定义。

每次用户显式提交都必须形成一个稳定、可归档的 Input Event，即使其底层分别存放在 `nodes`、`messages` 或 `tasks`。Input Event 至少覆盖：

- text
- voice
- image
- link/url
- `provenance=user` 的 idea

`provenance=auto` 的 idea 不是用户 Input；Save checkpoint 的 `save_note` 也不是普通 composer Input。

iOS Timeline 的 Input 视觉保持紧凑 Point：

- 第一行只显示 SF Symbol、简短来源类型和时间，例如 `waveform + Voice`；
- 第二行显示一行用户原输入，超长内容尾部截断；
- 保留左侧彩色圆点和指向标题的箭头；
- 不显示 `Voice Input` 之类冗长标签；
- 不添加尾部 chevron；
- 不使用独立卡片、玻璃或重阴影；
- 整个节点至少有 44pt 真实触控区域和轻量按压反馈；
- 视觉截断不影响无障碍读取和详情中的完整内容。

Voice 可能同时产生 voice node 与 chat message；Timeline 必须通过稳定关联去重，不能把一次提交展示两遍。

#### 3.2.6 Daily Briefing 历史归档

Daily Briefing 在产品/UI 上是 **Product Card Group**，不是单个 Timeline event。数据上它仍是一条 `CardRecord(type=briefing)`；前端将这一条记录渲染为职业、Summary、ReviewPoints 等多个视觉 CardSurface。Card Group 是视觉分组，不等于新的后端多记录实体。

- 一个历史日期最多出现一个对应 Daily Briefing 入口；
- briefing `CardRecord.date` 表示**被总结的日期 D**；
- D+1 打开 App 时，Now 展示最新可用的昨日 briefing，不能用 `date == today` 判断；进入历史后，入口附着在 Before 的日期 D 下；
- Timeline 日期标题下只显示一行弱入口，例如 `Daily Briefing · Focused`；
- 不画轨道节点，不计入当天 Event count；
- 不在 Timeline 展开 summary、五维属性或多张卡内容；
- 点击后以 briefing `CardRecord.id` 为稳定目标，进入该次 Daily Briefing 的历史页面并查看完整视觉组；
- 若该日没有 briefing，则不显示入口；
- 入口按压反馈弱于 Input，Input 弱于可下钻 Cluster。

同次 Save 产生的 todo suggestion、health、idea 等仍是独立 CardRecord，不属于 Daily Briefing 视觉组。除非产品未来支持任意多记录分组，否则无需为 Timeline 新增独立 group 表或 group ID。

#### 3.2.7 待合同评审的数据能力

当前 `TimelineSegment` 只有 `kind/start/end/label/category/node_id/meta/date`，不足以自然表达本节全部产品语义。下表是为了兑现已确认交互而暴露出的**候选能力**，不是已冻结的 schema、数据库迁移或全部属于 MVP 的阻塞清单；字段名、是否新增字段、是否由 server projection 提供，都必须另行合同评审。

| 候选能力 | 目的 |
|---|---|
| 稳定 Timeline item ID | 跨刷新、跨设备保持同一条目与导航 |
| 时间形态与聚合关系 | 区分 point / span 以及 standalone / cluster |
| `importance` | 区分 ambient / normal / major |
| 来源/角色与 provenance | 区分 input / sample / derived，以及 user/auto idea |
| `time_precision` | 区分 exact / approximate，避免虚假精确时间 |
| Cluster 数据 | cluster ID、child IDs、真实 child count、2–3 个代表 child |
| 类型化 destination | Input → After、Cluster → 子时间线、Briefing → Card Group |
| Input 关联 | 原输入、user message、可选 result message/card/task 的稳定关系 |
| Daily Briefing 定位 | 复用 briefing `CardRecord.id`，并明确其 subject date 与生成时间语义 |

若合同评审决定采用类型化 destination，可参考以下产品语义（名称不是既定字段）：

```text
after(result_id)
timeline_cluster(cluster_id)
daily_briefing(briefing_id)
none
```

当前多设备时序规则保持不变：Pi 以服务端 `created_at` 盖章，客户端时间只存于 `source_meta` 供参考。这样离线补传的 Input 可能显示为接收时间而非实际输入时间；是否引入经校验的 occurrence time 需要单独做安全与合同评审，本节不先改变权威规则。

历史 Daily Briefing 入口直接指向 briefing `CardRecord.id`；前端由该记录渲染完整视觉组，不得通过“同一天的所有 cards”猜测或拼接一次 Daily Briefing。

当前客户端按 `agent/feed/duration/category` 做的 presentation 推断只适合 Preview/MVP，不是最终产品合同。若上述候选能力经评审形成合同变更，必须在同一 commit 同步：

- `packages/shared` Zod schema；
- server projection；
- `apps/ReTurn/ReTurn/Models.swift` Codable 镜像；
- 对应测试。

#### 3.2.8 视觉与交互验收

视觉语言借鉴 Apple Health 的语义颜色与克制圆润、Journal 的内容层级、地图导航的路线/节点语法，并以细轨道、箭头、时间数字保留少量 ASCII 感。Timeline 是内容层，不使用 Liquid Glass、自制 glow 或重阴影；Cluster 的白色圆角面是内容分组，不是玻璃控制面。

- 普通一天不会因大量琐碎事件退化为长日志；
- Ambient 可被看见但不抢主线；
- Input 保持两层 Point 结构，长文本不撑高；
- Daily Briefing 保持单行且不进入 Event count；
- Cluster 最多展示少量代表事件和剩余数量；
- 所有被折叠内容都能通过下钻找回；
- 用户能区分主动 Input 与系统自动提取；
- Product Card 与 Timeline Cluster 不会被误认为同一概念；
- Input、Cluster、Daily Briefing 分别进入正确的 After 结果、子时间线和历史 Card Group；
- 支持 Dynamic Type、Dark Mode、semantic color 与 VoiceOver；
- 颜色只用于分类，不用于评价用户做得好或不好。

## 4. 吉祥物与五维属性（原角色系统的拆分：数值层保留，美术层砍掉）

### 4.1 品牌吉祥物

- 定位类似 Claude Code 的 Claw：**品牌情感载体**，不是游戏角色。住在 Now 区，承担问候、陪伴、待确认项的拟人出口。
- 实现：**小动画、小装饰**（类 Claw：idle 眨眼/摆动、问候时的小点缀），SwiftUI 内建动效实现，表情图 1~3 张封顶——美术预算全部投在这里。**不由属性驱动、无换装体系**；v0.5 的状态立绘、结算画面、角色包规范移除（P2）。

### 4.2 五维属性 —— 全部由代码确定性计算，LLM 不打分

可解释、可复现，数值不会无故跳变。计算在 Pi 上进行；当天任意时刻可按当前数据实时结算（`/api/stats/today`），夜间发酵时定格写入 `days.stats_json`，展示在次日 Daily Briefing Card Group 中（即前端设计中的「每日可计算等级」的具象化）。

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

- 状态是**文本标签**：展示在 Daily Briefing Card Group（昨日定格）与 `/api/stats/today`（白天实时，Now 问候文案可引用）；无立绘切换（状态驱动吉祥物**动画选择**为 P1，见 §3）。
- **呈现分层（面向大众的硬约束）**：Daily Briefing 的主卡以**状态标签 + 一句归因**打头（「昨天：疲惫。睡了 5 小时，但代码写了 4 个钟头」），五维数值收在展开/详情层，不把数值条/雷达图直接怼给用户；文案基调是**描述你的一天，不是给你打分**。
- streak（连续记录天数）保留为 Daily Briefing Card Group 中的一行文本，无动画、无惩罚机制。

## 5. 数据模型

### 5.1 Pi 端 SQLite（唯一权威数据源）

```sql
devices(id, name, platform, last_seen_at)
nodes(id, day_id, device_id, kind, title, content, source_meta, client_uuid, created_at)
  -- kind: text | url | voice | save_note | app_sample | tab_sample | agent_session
  --       | health_daily | snapshot | todo_check | idea | image | reminder
  -- idea 节点 source_meta 记 provenance: user(显式记录) | auto(采集/发酵抽取)
  -- client_uuid: 客户端生成的幂等键，补传去重用
edges(id, src_node_id, dst_node_id, relation, created_by_day_id)
days(id, date, saved_at, save_note_node_id, summary, stats_json /* 五维+状态定格 */)
todos(id, day_id, text, done, source_node_id)
messages(id, role /* user|agent */, content, intent /* idea|retrieval|question|NULL */,
         task_id, created_at)          -- Now 区对话流
tasks(id, type, status /* queued|running|done|failed */,
      input_json, result_message_id, created_at, finished_at)
cards(id, type /* briefing|idea|todo_suggestion|health|weekly */, date,
      content_json, created_at)        -- 双向流分页需要稳定实体，卡片落库
```

- 一切收集物统一为 node；卡片是发酵/工作流的**产物层**，引用节点而不复制内容（`content_json` 内存 node_ids）。
- Daily Briefing 的数据单元是一条 `type=briefing` 的 card；其 `id` 是历史入口的稳定身份，`date` 表示被总结日。前端可将这条记录渲染成多个视觉 CardSurface，无需仅为该视觉分组新增 group 表；todo、health、idea 等同日 card 仍保持独立。
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
| Monorepo | pnpm workspaces：`shared` / `server` / `sampler`；`apps/ReTurn` 为独立 Xcode 多平台工程（同仓、不进 pnpm workspace） | Swift 工程与后端契约改动在同一 diff 内可见 |
| 合同 | `shared`：Zod schema（API 请求/响应 + 发酵 JSON + kind/intent/卡片枚举）是唯一事实来源；Swift 侧手写 Codable 镜像集中于 `Models.swift` | 改合同必须同步两份；REST 可 curl 调试 |
| 服务端（Pi） | Fastify + fastify-type-provider-zod；`node:sqlite` + 手写 SQL + 编号迁移 | 表不多不上 ORM；systemd 常驻；LLM/转写/视觉 key 走 Pi 环境变量，**不下发客户端、不入 git** |
| LLM 调用 | Pi 直接调用 OpenAI-compatible provider；结构化结果用 Zod 校验 | 发酵/提问用主模型；**分诊与 Resume 用廉价小模型**；语音走显式配置的 Whisper 兼容转写；截图走多模态模型；全部由 Pi 发起 |
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
GET  /api/cards?direction=before|future&cursor=   → 双向流分页（合同内部 `future` 暂保留，UI 名称为 After）
GET  /api/tasks?status=             → sidebar 进行中任务
POST /api/resume                    → 小复盘（近实时，落 message）
POST /api/save   { date, note_text? | note_voice_ref? }
     → 夜间检查点：触发发酵，阻塞至完成；失败则当日保持未存档并明确返回错误；幂等：当日已存档直接返回
GET  /api/timeline?from=&to=        → 范围化时间轴（Pi 从节点即时聚合，不落新表）
GET  /api/days?range=30             → 属性/状态/streak 历史（周/月视图数据源）
PATCH /api/todos/:id                → 勾选（同时落 todo_check 节点）
GET  /api/stats/today               → 实时五维 + 当前状态 + 采集状态（Now 问候可用）
GET  /api/usage?from=&to=           → provider 调用次数、成功/失败与 token 聚合（不返回内容）
GET  /api/ping                      → outbox 探活
```

写接口对 macOS / iOS 全开放；采样器额外在上报响应中获得当前节奏模式。合同扩展与 Swift `Models.swift` 镜像同 diff 更新，扩展完成后重新冻结。

### 6.3 Agent 工作流与发酵 pipeline

- **分诊**：一次廉价小模型调用 → `{intent, confidence}`；低置信度不猜，Now 里让用户选；判断结果附在回复里可纠正。演示词避开模糊输入。
- **灵感**：落 idea 节点（provenance=user）→ 附一句建议 → 归入 After 灵感卡。
- **检索**：关键词起步（embedding 视时间）→ `{date, node_ids}` → 前端跳转时间线。
- **提问**：相关节点 + 会话摘要塞 prompt → 主模型回答 → 落 message。
- **Task**：纪要文本 / 截图 → provider 提取 → 落高权重节点 → 完成消息回 Now；失败时 Task 明确为 `failed`，纪要原文保留，不生成伪结果。
- **Resume**：最近几小时会话聚合（复用 sessions 代码）→ 小模型一句话复盘 → 即时返回；无会话时返回确定性事实文案，provider 失败则明确报错。
- **夜间发酵（Save 触发）**：1~2 次主模型调用，输入「当日节点 + 对话 + 高权重资料 + 留言锚点 + 近几日摘要 + 历史 todo 建议及其采纳情况」，输出结构化 JSON：`{ summary, briefing, review_points[], todos[], health_advice, ideas[], node_tags{}, edges[] }` → Zod 校验 → 落 cards/edges/todos → 纯代码结算五维属性与状态。采样节点只作「环境上下文」。
- **Todo 偏好回环（与 F5 联动）**：AI todo 建议卡上的「采纳」动作 → UI 端经 EventKit 写入 Apple 提醒事项；提醒事项被采样器回采（`reminder` 节点）构成**正样本**（进了提醒事项 = 用户认可，无需额外打分 UI）；历史建议与提醒事项的差集构成**负样本**（建议了但未采纳 = 不买账）。发酵生成 todo 时把两类样本喂回 prompt 校准，同时天然实现去重——已在提醒事项里的不重复建议。
- 需要结构化输出的 LLM 调用带超时 + 一次重试 + Zod 校验；发酵失败时不写部分结果、不封存当天，由 API 明确返回错误。

## 7. 演示脚本（3 分钟）

1. **掏出 Orange Pi 实物**：第二大脑物理地住在家里，Mac 和 iPhone 连的是同一块板子。
2. 打开 App → **Now**：吉祥物问候 + 昨日 Daily Briefing Card Group（提前真实 Save 过一天，含五维属性、状态与 streak——「昨晚睡眠不足所以状态是疲惫」，健康数据驱动、可解释，不是 AI 编的）；横向切换到 **Before**：日期下的历史 Daily Briefing 入口 + Timeline 回溯，「几点在写代码、几点在开会，它都知道」。
3. **对话**：输入「我昨天下午在干什么」→ 分诊为提问 → RAG 回答；再输入一个关键词 → 分诊为检索 → 时间线自动跳转定位（回溯到几天前）。
4. **灵感 + Task**：随手记一条灵感 → After 灵感卡（区分「我记的」和「它帮我记的」）；贴一段会议纪要提交 Task → sidebar 可见进行中 → 完成回传 Now。
5. **Resume**：「刚才离开了五分钟」→ 点 Resume → 小复盘一句话。**Save**：现场 Save → 系统进入夜间档（降采样 + 发酵）。
6. **掏出 iPhone**：同一空间、对等体验（流 + 对话都能用）；健康建议卡——「昨晚睡眠数据是真的，从我手机 HealthKit 来的」。收尾看桌面周视图趋势（可选 wow 点：拔网线灵感记录 → 插回补传）。

## 8. 里程碑（v0.6 增量，在已完成基座上按依赖序推进）

v0.5 已完成：shared 合同（v0.5 面）、server（路由/SQLite/发酵/统计/会话聚合）、sampler（采样/jsonl 解析/outbox/控制面）。v0.6 剩余工作：

1. **合同扩展**（shared Zod + `Models.swift` 镜像同 diff）：messages/tasks/cards schema、intent/卡片枚举、新端点请求响应 → 扩展完成即重新冻结。
2. **server 扩展**：三张新表迁移；chat 分诊 + 提问 RAG + resume；save 语义扩展（卡片产出、五维/状态结算沿用 v0.5 代码）；timeline 范围化；节奏模式下发。
3. **SwiftUI 主线**：双向流主视图（Before/Now/After）+ Input + sidebar + 时间线回溯（P0-A 门面，最大单块工作量）。
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
8. **多设备与离线时序**：沿用现有规则，以 Pi 收到时间为准（`created_at` 服务端盖章），客户端时间仅存 `source_meta` 参考。代价是离线补传数小时后的 Input 可能显示在接收时刻；是否引入经校验的 occurrence time 尚未拍板，需单独做安全与合同评审。
9. **Coding Agent 会话解析的格式耦合**：`~/.claude/projects` JSONL 结构不是公开合同。只取时间戳和项目路径这类最稳字段，解析失败静默跳过。
10. **iOS「采集」可做项有限**：系统不允许第三方 App 采样前台应用（Screen Time API 不开放细粒度）；iOS 侧采集扩展实际是 HealthKit 扩展指标一类（P1）。
11. **没有真推送**：局域网内无 APNs，briefing 的实际语义是「夜间备好、打开即见」，演示话术照此表述，不说「推送」。
12. **节奏模式生效延迟**：采样器随上报拉取模式，Save 后降频最多延迟一个上报周期才生效；可接受，不做额外通道。多台 Mac 天然一致是该方案的主要收益。
13. **属性公式与状态阈值未调参**：系数与阈值全是拍的初值，演示前用全队真实数据调；briefing 展示相对变化感，绝对数值不必精确。
14. **双进程编排**：采样器没起来会静默丢采集。缓解：UI 常显采集状态条（经 localhost 健康检查）；launchd `KeepAlive` 兜底；演示前检查清单含「采样器已运行」。
15. **健康同步依赖「当天打开过 iOS App」**：哪天没开 App、备胎快捷指令也没触发，当天就没有精力硬信号——精力公式自动回退纯扣分式，不报错。演示当天打开一次 iOS App 即可。
16. **视觉 API 链路风险**：多模态 provider 失败时接口明确报错，不创建伪造的提取结果；演示前用真实截图闭环验证模型能力与超时。
17. **吉祥物形象未定**：本体形象（形态/性格）需尽早进美术排期——它是 Now 区的门面；表情图与微动效都要等形象定稿才能动工，是前端主线（§8 第 3 步）的前置依赖。
18. **提醒事项全量回采的隐私敏感度**：已拍板回采全部提醒列表（采样的定位就是收集），其中含纯生活项（买菜/吃药等），会进入 Pi 并可能随发酵摘要送云端 LLM。叙事与 §9.7 一致：原始数据只在家里，推理是无状态调用；发酵 prompt 中提醒事项只用于 todo 偏好校准与环境上下文，briefing 文案不主动展开个人生活条目。
