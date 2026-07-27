# Context 5 — iOS Before Timeline 设计与实现交接

> 整理时间：2026-07-25
> 工作目录：`/Users/is52hertz/Project/ReTurn-before-view`
> 当前分支：`feat/before-view`
> Timeline 代码基线：`2057a45 fix(app): preserve timeline input hierarchy`
> 产品定义：`docs/PRD.md` §3.2
> 前序上下文：`context-3.md`（Main/Now/Composer）；另一并行分支上的 `context-4.md`（Composer/导航/卡片体系）

## 0. 这份文档解决什么

这是一份给下一位 Timeline Agent 的完整交接。它记录：

- 用户已经确认的 Timeline 产品定义与视觉语言；
- 当前 SwiftUI 实现的真实状态；
- 本轮多次视觉迭代中走过的弯路；
- Timeline、页面级 Card、Timeline 内富条目的边界；
- 用户 Input、Daily Briefing、琐碎事件与智能合并的处理；
- 当前 API 不能自然表达的语义，以及需要合同评审的候选能力；
- 构建、测试、手工验收和提交规范。

下一位 Agent 不应只看一张截图后重新设计。先读本文和 `docs/PRD.md` §3.2；`clients/apple/notice.md` 只用于了解本分支的 API/工程约束，它对 Main 顶部导航的描述已经落后于并行 `feat/app-models` 分支，合并时应以该分支的最新 notice、`context-4.md` 与 `docs/prd-drift.md` 为准。

## 1. 已确认的范围与协作方式

### 1.1 平台

- 当前 Before Timeline **只设计 iOS**。
- macOS 未来会是完全不同的页面，不要把 iOS Timeline 直接复用过去。
- 工程仍保留 iOS 17 / macOS 14 deployment target，但黑客松 MVP 与视觉验收优先 iOS 26。
- iOS 专属实现必须继续放在 `#if os(iOS)` 内。

### 1.2 分工

- 用户负责 Simulator/真机上的视觉、比例、手感验收，并用截图快速反馈。
- Agent 负责代码结构、编译、单元测试和明确告诉用户需要检查哪些场景。
- 不需要 Agent 自行反复截图做像素级视觉 QA；用户已明确这样会拖慢 MVP。

### 1.3 当前任务边界

- 本 worktree 只负责 **Before Timeline**。
- Main/Now/Composer 和页面级 Card 由另一位 Agent 负责；不要修改其组件或临时接管其功能。
- 当前只做视觉与未来导航接口的占位 callback，不做真实路由、API Store、加载态或详情页。
- **`BeforeView` 尚未接入正在运行的主页面。** 本分支 `ContentView.pageContent` 对 `.before/.after` 仍返回 `Color.clear`，所以当前 Timeline 只能从 Xcode Preview 查看；运行 App 后 Before 空白是已知未接线状态，不是 Timeline 视图损坏。
- macOS、After 详情、Card 历史页、nested timeline 都尚未实现。

## 2. 核心产品边界：Timeline 不是 Card 流

### 2.1 页面级 Card 与 Timeline 是同级概念

| | 页面级 Card | Timeline |
|---|---|---|
| 信息层 | 总结层 | 明细/索引层 |
| 回答的问题 | “这一天/这个主题意味着什么？” | “什么时候发生了什么？” |
| 主要形态 | Apple Health 风格白色圆角卡片组 | 左侧时间轨 + 高密度事件 |
| 交互 | 天然可点击，进入详情 | 只有有明确下钻价值的条目才可点击 |
| 内容密度 | 摘要、归因、建议 | 时间、类型、短标题、区间 |

禁止：

- 把每个 Timeline 事件都做成白色卡片；
- 把页面级 Card 当成普通时间点插进轨道；
- 把所有子事件直接铺进总结卡；
- 因为两者都可点击，就把两者视觉做成同一种组件。

### 2.2 Timeline 内的“卡片样富条目”不是页面级 Card

Agent 会话/项目聚合可在 Timeline 内呈现白色圆角富条目。它的产品名称应理解为 **Cluster / Major Segment**，不是页面级 Card。

它仍然：

- 占据一段真实时间范围；
- 与左侧时间轨连接；
- 表示一组同主题的底层事件；
- 产品目标是点击后进入该时间段/项目的 nested timeline；
- 只预览 2–3 个代表事件和 `+N more`，不把全部细节铺开。

页面级 Card 是总结层；Cluster 是 Timeline 自己的分层手段。两者可以借用相同的圆润度、颜色和排版语汇，但语义不能混用。

当前代码里的 `TimelineEventCard` 还不是 `Button`，也没有 Cluster callback 或按钮无障碍 trait；右上角 chevron 目前只是尚未兑现的 affordance。不要把“视觉上像可下钻”误写成“交互已经完成”。

## 3. 产品分类与当前四种视觉映射

产品模型不应直接等于“四选一”的 presentation enum。当前讨论形成的是几组**描述切面**，不是一份已经冻结的正交 schema：

- **时间形态**：Point / Span；
- **聚合关系**：Standalone / Cluster；
- **强调程度**：Ambient / Normal / Major；
- **来源/角色**：User Input / Sampler Trace / Agent-derived；
- **时间精度**：Exact / Approximate，与 Point/Span 分开表达。

Cluster 自身通常仍占一个 Span；它作为聚合结果是 Agent-derived，但 children 可以同时来自 Input 和 Sample，因此这些切面不能被误写成严格互斥的单枚举。

例如：

- 灰色 Git 微事件 = `Point + Standalone + Ambient + Sampler Trace`；
- 用户语音 = `Point + Standalone + Normal + User Input`；
- 项目工作段 = `Span + Cluster + Major + Agent-derived`，children 来源可混合。

当前 Swift `Presentation` 把这些维度暂时揉成 `.ambient/.point/.span/.major`，只是视觉/MVP projection，不应原样升级为最终 shared 合同。以下四节描述的是当前四种主要视觉映射。

### 3.1 Ambient Trace：琐碎痕迹

用途：

- 用户一天中会夹杂大量低重要度行为；
- 例如主要在外出玩时顺手提交了一次 Git；
- 它需要被记录，但不应与主活动同级竞争。

视觉：

- 灰色或 `secondary/tertiary` 层级；
- 很小的节点和短连接线；
- 单行：来源/类型、短标题、时间；
- 默认不可点击；
- 不使用彩色大圆点、箭头或卡片表面。

当前实现：`TimelineAmbientEventView` + `.ambient` presentation。

### 3.2 Point：精确时间点

用途：

- 有明确发生时刻的事件；
- 用户主动 Input 是 Point 的重要子类。

视觉：

- 左侧彩色圆点；
- 从时间轨指向内容的短箭头；
- 第一行：SF Symbol + 彩色类型名，右侧时间；
- 第二行：黑色短标题；
- 不添加卡片背景。

当前用户特别要求保留这一视觉，见 §5。

### 3.3 Span：时间区间

用途：

- 持续性活动、应用会话、睡眠；
- 或只能表达为一个范围而非单个点的模糊时间。

视觉：

- 左侧竖向彩色 band 表示范围；
- 右侧显示类型、起止时间、标题和时长；
- 不为了“更丰富”而自动升级成卡片。

### 3.4 Cluster / Major Segment：智能合并后的重要区间

用途：

- 同一项目、同一 Agent 工作流或同一主题下的多个相关事件；
- 底层可能包含 Git commit、Claude 会话、构建、浏览和文字输入。

视觉：

- 左侧更强的区间 band；
- 右侧一个圆润的富条目；
- 展示项目/来源、起止时间、标题、时长；
- 仅预览少量代表子事件；
- 显示剩余数量；
- 产品目标是整体可点击，进入更细的时间线。

当前实现：`TimelineEventCard` + `.major` presentation；名称虽为 `Card`，产品语义仍是 Timeline Cluster。

当前交互状态：只有装饰性 chevron，尚未包装为 `Button`，也没有 `onOpenCluster` callback；接手者需要先补真实点击和无障碍语义，再把它称为“可点击”。

## 4. 智能分层与合并规则

### 4.1 不允许所有事件同级展示

Timeline 的价值不是完整地罗列数据库，而是把真实痕迹压缩成可回溯的层级：

1. 低重要度、打断式事件 → Ambient Trace；
2. 明确且值得看见的瞬时事件 → Point；
3. 持续活动 → Span；
4. 高重要度且内部事件密集 → Cluster。

### 4.2 合并依据

理想情况下由 server/聚合层决定，不由客户端根据颜色或 `category` 猜：

- 语义主题一致（同项目、同任务、同会话）；
- 时间上连续或强相关；
- 底层事件数量达到需要折叠的密度；
- 对当天叙事有较高重要度；
- 有明确的下钻价值。

不能只因为时间相邻就合并，也不能把无关的小事硬塞进项目 Cluster。

### 4.3 合并后必须保留

- cluster 的起止时间；
- 所有 child node/event ID；
- child 总数；
- 2–3 个代表事件；
- 原始时间顺序；
- 可从 Cluster 回到完整 nested timeline 的稳定 ID。

同一个底层事件不应同时作为独立 Point 和 Cluster child 重复展示。

用户显式 Input 当前默认保留为独立、紧凑的 Point，保证“什么时候输入了什么”在主层级可见。未来是否允许将 Input 收入 Cluster 尚未拍板；在产品确认前不要为了压缩密度而把 Input 静默折叠。

## 5. 用户 Input 的最终视觉与语义

### 5.1 Before 只记录“用户什么时候输入了什么”

- Before Timeline 展示 Input 的发生时刻和输入内容。
- Input 的即时回复目前仍按现有 PRD 落在 Now；Before 不重复展开回复正文。
- 用户已确认历史 Input 点击后应导航到 After 中对应的结果/上下文，但“即时结果如何从 Now 归档进 After”仍待 Main/After 与后端共同定义。
- 当前只预留 `onOpenInput` callback，尚无真实导航。

### 5.2 最终保留的视觉

用户明确要求保留原始 Point 语法：

```text
      waveform  Voice                         8:42 AM
● ──→ Voice note captured
```

规范：

- 第一行保留 `waveform + Voice`，不要写成 `Voice Input`；
- 时间在第一行右侧；
- 第二行显示用户输入的短标题/内容；
- 第二行最多一行，长文本尾部截断；
- 保留左侧彩色圆点和指向箭头；
- 不添加末尾 disclosure chevron；
- 不添加白色卡片背景；
- 静止态看起来与普通 Point 一致；
- 整块仍是原生 `Button`，最小命中区 44pt；
- 按压时只有很轻的 tint fill/透明度反馈，不缩放、不加阴影、不加玻璃。

### 5.3 Input 分类

当前客户端只把以下 Point feed 识别为显式 Input：

- `text`
- `url`
- `voice`
- `image`

不要再次用 `kind == .feed` 作为 Input 判断。`ACTIVE_FEED_KINDS` 还包含：

- `save_note`
- `idea`

其中：

- `save_note` 是 Save checkpoint 的留言，不是普通 composer Input；
- `idea` 可能是用户输入，也可能是夜间发酵自动抽取。

要把用户灵感正确识别为 Input，Timeline API 必须保留 `provenance=user|auto`。当前 server projection 丢失该字段，因此客户端故意不把所有 `idea` 当 Input。

### 5.4 已修过的无障碍坑

不要在 Input `Button` 外层使用：

```swift
.accessibilityElement(children: .ignore)
```

这会吞掉真实 Button 的按钮 trait 和激活动作。当前实现只对非交互事件合并 accessibility children；Input Button 自己持有：

- `accessibilityLabel(item.label)`
- `accessibilityValue(item.accessibilityValue)`
- 原生 Button action/trait

视觉截断不影响 VoiceOver 读取完整内容。

## 6. Daily Briefing 历史入口

### 6.1 产品定义

- Daily Briefing 在产品/UI 上是一个**历史 Card Group**，不是单个 Timeline event。
- 当前已确认的数据模型是一条 `CardRecord(type: briefing)`；前端把这**一条记录**拆成职业、Summary、ReviewPoints 等多个视觉 CardSurface。Card Group 是视觉分组，不代表后端存在多条需要 `group_id` 归并的记录。
- 历史入口可直接使用 briefing `CardRecord.id` 作为稳定目标；除非以后支持任意多记录分组，否则不要为了 Timeline 新增独立 group 表或 group ID。
- 同次 Save 产生的 todo suggestion、health、idea 等仍是各自独立的 CardRecord，不属于 Daily Briefing 视觉组。
- 它属于某个日期，不属于某个发生时刻。
- Timeline 中只在日期标题下提供一个弱入口。
- 点击后未来进入该日期的历史 Card Group 页面。
- 当前只预留 `onOpenDailyBriefing` callback。

日期与页面路由必须区分：

- briefing `CardRecord.date` 表示它总结的日期 D；
- D+1 首次/次日打开时，Now 展示最新可用的昨日 briefing，不能用 `date == today` 判断；
- 进入历史状态后，Before 在被总结日 D 的日期标题下显示这一行入口。

### 6.2 最终视觉

当前为单行：

```text
✦ Daily Briefing · Focused                           ›
```

规范：

- 附着在日期标题下；
- 不画轨道节点；
- 不计入 Event count；
- 不在 Timeline 里展开多行 summary；
- 不做白色卡片；
- 允许一个很弱的 chevron 表示历史入口；
- 完整 summary 仍保留在数据和 accessibility value 中；
- 点击反馈弱于 Input。

此前把完整 summary 展示成 2–3 行，导致日期头和 Timeline 都显得臃肿，已明确否决。

## 7. 视觉语言

### 7.1 参照

- Apple Health：语义颜色、数据层级、圆润但克制；
- Apple Journal：内容优先、页面 chrome 极简；
- Apple 地图导航：时间轨/路线轨的节点、区间、换乘层级；
- 少量 ASCII/终端感：来自轨道、箭头、时间、等宽数字，而不是整页强行黑白。

### 7.2 颜色

- 初版黑白灰/ASCII 风格过于冷；用户允许采用 Health 的语义色。
- 颜色用于**分类**，不用于评价用户做得好或不好。
- 低重要度 Ambient 使用灰色；
- Point/Span/Cluster 使用类别色；
- 正文仍以 primary/secondary 黑灰层级为主；
- 不要让每行都出现多个强调色。

当前示例色：

- Sleep：indigo
- Voice：teal
- Text/Input：green
- Image：cyan
- Design：purple
- Browser：blue
- Agent/Dev：orange
- Ambient：system gray

正式色板仍需与页面级 Card Agent 统一；不得在视图中散落新颜色，集中修改 `TimelineDesign.Colors`。

### 7.3 材质

- Timeline 是内容层，不使用 Liquid Glass。
- Liquid Glass 只用于 iOS 26 的功能性导航/控制面。
- Timeline 不叠自制 glow、高光、重阴影或玻璃模拟。
- Cluster 的白色圆角面是内容分组，不是玻璃。

### 7.4 字体与密度

- 使用 SwiftUI semantic fonts 和 Dynamic Type；
- 时间使用 `.monospacedDigit()`；
- 类型信息小、标题清晰、metadata 次要；
- 输入长文本只能一行截断；
- Daily Briefing 只能一行；
- Ambient 只能一行；
- Cluster 只预览少量 child；
- 不为了增加功能不断增加可见文字。

## 8. 对齐与间距：已经反复调过，不要轻易重置

相关 token 在 `TimelineDesignTokens.swift`。

当前关键值：

| Token | 值 | 说明 |
|---|---:|---|
| `railWidth` | 48 | 左侧轨道总宽 |
| `railAxisX` | 12 | 轨道轴线 x |
| `pointAnchorY` | 30 | Point 圆点/箭头 y；用户多轮截图后保留 |
| `pointDiameter` | 8 | Point 实心点 |
| `pointRingDiameter` | 14 | 与背景融合的外环 |
| `ambientPointDiameter` | 4 | Ambient 微点 |
| `rangeBandWidth` | 7 | 普通 Span |
| `majorRangeBandWidth` | 9 | Cluster |
| `pointMinimumHeight` | 72 | 两层 Point 节奏 |
| `spanMinimumHeight` | 108 | Span |
| `majorMinimumHeight` | 156 | Cluster |
| `eventCardCornerRadius` | 22 | Timeline Cluster 富条目 |
| Event details `VStack.spacing` | 4 | 类型行与标题行距离 |

历史问题：

- Ambient 的横线、Git 行和下一个 Point 曾出现错位；
- Point 箭头曾指向标题中心偏下；
- 尝试把箭头指向类型行与标题行之间后反而更怪；
- 用户最后手动调整 `pointAnchorY = 30` 和 details spacing = 4；
- `072b02f` 是这组原始视觉的稳定检查点；
- 临时预览分支 `codex/before-original-preview` 固定在该提交。

如果要改锚点，必须同时检查：

1. Voice/Text Point；
2. 普通非 Input Point；
3. Point 前后的 Ambient；
4. Span/Cluster 与轴线的连续；
5. Dynamic Type；
6. Light/Dark。

## 9. 当前 SwiftUI 结构

| 文件 | 职责 |
|---|---|
| `BeforeView.swift` | iOS Before 页面壳、ScrollView、Preview |
| `TimelineView.swift` | 日期标题、Daily Briefing、当天事件 |
| `TimelineDay.swift` | 日期分组、可选 briefing、Event count |
| `TimelineDisplayItem.swift` | API segment → presentation/display projection |
| `TimelineEventView.swift` | 按 presentation 分派视图、轨道布局、Input Button |
| `TimelineRail.swift` | Canvas 绘制轴线、Point、Span、Cluster band |
| `TimelineAmbientEventView.swift` | 灰色微痕迹 |
| `TimelineEventDetailsView.swift` | Point/Span 的两层信息 |
| `TimelineEventCard.swift` | Cluster / Major Segment 富条目 |
| `TimelineClusterPreview.swift` | Cluster child 预览模型 |
| `TimelineDailyBriefing.swift` | 日期级 briefing 摘要模型 |
| `TimelineDailyBriefingView.swift` | 单行历史入口 |
| `TimelinePressableButtonStyle.swift` | 无常驻表面的轻量按压反馈 |
| `TimelineDesignTokens.swift` | Timeline 颜色、字体、布局、交互 token |
| `TimelinePreviewData.swift` | 当前视觉假数据 |
| `TimelinePresentationTests.swift` | presentation、分组、Input 分类、briefing count 测试 |

### 9.1 当前 callback

```swift
BeforeView(
    days: ...,
    onOpenInput: { item in ... },
    onOpenDailyBriefing: { briefing in ... }
)
```

两者默认 no-op，因此 Preview 可独立运行。接路由时从页面容器注入，不要把 NavigationStack/全局 router 偷塞进叶子组件。

Cluster 目前没有对应 callback；`TimelineEventCard` 仍是静态 View。未来应在同一层补 `onOpenCluster`，不要只依赖装饰性 chevron。

### 9.2 当前 projection 仍是 MVP

当前 `TimelineDisplayItem` 的默认映射：

- `agent` → `.major`
- `feed` 或零时长 → `.point`
- 其他非零时长 → `.span`
- Preview 中 `git` 被显式 override 为 `.ambient`

这只是视觉/MVP projection，不是最终智能分层算法。真实数据不应长期由客户端硬编码 `category == "git"` 决定重要度。

## 10. 当前 API 能力与缺口

### 10.1 当前合同

`TimelineSegment` 只有：

- `kind`
- `start`
- `end`
- `label`
- `category?`
- `node_id?`
- `meta?`
- `date?`

server 当前：

- 应用/Agent session → `app/agent`
- `ACTIVE_FEED_KINDS` → `feed`
- sleep → `sleep`
- feed 的 `meta` 只回传 `{ kind }`
- `git_commit` 不在 `ACTIVE_FEED_KINDS`，因此真实 API 目前不会产出 Preview 里的 Git Ambient；
- 普通 chat 提问/检索只写 `messages`，`/api/timeline` 不读取 messages，因此“每次用户输入都归档”尚未成立；
- Voice 会产生 voice node，同时 chat 还会写 user message，未来统一 Input Event 时必须去重。
- `/api/timeline` 单次查询范围最多 31 天且没有 Timeline cursor；跨周回溯需要窗口化加载，检索定位还要处理目标 node 已被收进 Cluster 的情况。
- 当前多设备时序仍以 Pi 的 `created_at` 为权威；离线补传会让“实际输入时间”与“服务端接收时间”产生偏移，是否引入经校验的 occurrence time 尚未拍板。

### 10.2 待合同评审的数据能力

产品定义写在 `docs/PRD.md` §3.2.7。以下是为了兑现交互而暴露出的**候选能力**，不是已经确认的 schema、数据库迁移或 MVP 阻塞清单：

- 稳定 item identity；
- presentation/salience 的权威来源，避免多个客户端各自猜重要度；
- approximate/exact 时间精度；
- cluster ID、child IDs、总数和代表 child；
- `idea.provenance`；
- Input → After result 的稳定关联；
- 以 briefing `CardRecord.id` 定位历史 Daily Briefing；
- Cluster nested timeline 查询。

这些能力可以来自 server projection、现有字段组合或后续 endpoint，具体字段名和归属要先经过合同评审。不要把 Context 里的概念名直接复制成 shared enum。任何获批的 shared 合同变更必须同步 `packages/shared` Zod 与 `clients/apple/ReTurn/Models.swift`，并在同一 commit 验证。

## 11. 已否决或需要避免的做法

1. **Timeline 卡片化**：把普通事件都放进白色圆角卡。
2. **信息无限展开**：Input 显示类型、长正文、chevron；Daily Briefing 展开 3 行摘要。
3. **过度压扁 Input**：把 Input 改成单行 `icon + text + time`，会丢掉用户喜欢的 `Voice` 类型行和 Point 视觉。
4. **把所有 feed 当 Input**：会误标 `save_note` 和 auto idea。
5. **用颜色评价用户**：颜色只分类。
6. **用点击性反推卡片外观**：可点击的 Point 仍然可以没有卡片和 chevron。
7. **吞掉 Button accessibility**：不要在交互分支外层 `.accessibilityElement(children: .ignore)`。
8. **客户端猜智能聚合**：category 不等于 importance。
9. **重复展示 child**：Cluster 内外不应出现同一事件两次。
10. **把 Daily Briefing 算进 Event count**：它是日期级归档入口。
11. **给 Timeline 上玻璃/重阴影**：内容层保持克制。
12. **顺手做 macOS**：当前没有 macOS 设计。
13. **顺手改 Main/Card**：并行 Agent 在维护。
14. **Agent 擅自做视觉最终判断**：用户负责视觉验收。
15. **把候选数据能力当成已拍板合同**：Timeline 语义已确认，不代表字段名、server projection 或新实体已确认。

## 12. 验证

### 12.1 编译

```bash
xcodebuild -quiet \
  -project clients/apple/ReTurn.xcodeproj \
  -scheme ReTurn \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGNING_ALLOWED=NO \
  build
```

### 12.2 测试

```bash
xcodebuild -quiet \
  -project clients/apple/ReTurn.xcodeproj \
  -scheme ReTurn \
  -configuration Debug \
  -destination 'platform=iOS Simulator,id=CDF74C34-C104-47B4-BB01-D423783742C0' \
  -only-testing:ReTurnTests \
  -parallel-testing-enabled NO \
  CODE_SIGNING_ALLOWED=NO \
  test
```

最近一次代码基线两项均通过。

已知非本轮引入的 warning：

- `ForEach(day.items.enumerated())` 的 `RandomAccessCollection` conformance 只在 iOS 26 可用，而 deployment target 仍为 iOS 17；
- Swift Testing 中若干 main-actor isolated `Equatable/Codable` conformance warning。

MVP 优先 iOS 26，因此当前不阻塞；若要恢复严格 iOS 17/Swift 6 兼容，需单独修复，不要混进视觉调整。

### 12.3 用户视觉验收清单

- Light / Dark；
- iPhone 17 Pro / Pro Max；
- Voice/Text Point 箭头对齐；
- 长 Input 是否只占第二行的一行；
- Ambient 是否足够弱；
- Cluster 的静态 affordance 是否仍属于轨道；真实点击尚未实现，接线后再验收命中区与 VoiceOver；
- Daily Briefing 是否只占一行；
- 点击 Input/Daily Briefing 的反馈是否克制；
- VoiceOver 是否仍读出完整内容和 Button。

## 13. 本轮 Before Timeline 提交

| Commit | 内容 |
|---|---|
| `2b7a23d` | 建立 iOS Before Timeline |
| `7ef79d4` | 改为 Apple Health 语义色与圆润风格 |
| `d296e23` | 加入 Ambient Trace |
| `47c1c35` | 修 Ambient 对齐 |
| `e2655a9` | 调整 Point 箭头 |
| `536ecd4` | 箭头指向标题中心 |
| `072b02f` | 用户手调锚点与行距；原始视觉稳定点 |
| `a2614b1` | Input/Daily Briefing 可点击视觉与 callbacks |
| `552c91c` | 首次压缩信息密度（后来部分回退） |
| `2057a45` | 恢复用户要求的两层 Input 视觉，保留点击与截断 |

## 14. 并行 worktree 与合并注意

- Timeline worktree：`/Users/is52hertz/Project/ReTurn-before-view`
- Timeline branch：`feat/before-view`
- Main/Card worktree：`/Users/is52hertz/Project/ReTurn`
- 其当前 branch 在整理本文时为 `feat/app-models`
- 另一分支存在 `context-4.md` 与 `docs/prd-drift.md`，记录 Card/Composer 决策
- `docs/PRD.md` 在两个 worktree 整理前内容一致
- 原始设计预览分支：`codex/before-original-preview` → `072b02f`
- 本分支 `clients/apple/notice.md` 仍描述旧 segmented `Picker`；不要让它覆盖并行分支已经实现的纯文字顶部导航。
- 并行 `docs/prd-drift.md` §6.4 中“`date == today` 才进 Now”以及“Before 直接铺完整历史早报卡”的旧判断，已被本轮更晚的用户决定覆盖：Now 展示最新昨日 briefing；历史状态下，Before 只在被总结日期下放单行入口，点击进入完整视觉组。合并 drift 时必须以 `docs/PRD.md` §3.2.6 为准。

合并时：

- 保留 `Context-5.md`；
- 将 PRD Timeline 规范与另一分支的 Card drift 一起复核；
- 不要把另一 worktree 中用于看 CardGallery 的临时 `ReTurnApp.swift` 入口带入提交；
- 遇到 PRD 冲突按产品定义人工合并，不要整文件选 ours/theirs。

## 15. 下一位 Agent 的建议顺序

1. 读 `docs/PRD.md` §3.2 和本文 §2–§7。
2. 先把 `BeforeView` 接入最新 Main pager；不要以本分支旧 `ContentView` 覆盖 Main Agent 的导航实现。
3. 在 Preview 验证代码基线，没有问题就不要重新设计现有样式。
4. 与 Main/After/后端确认 §10 的 projection、Input result-link 和 Cluster 下钻合同。
5. 接真实 Timeline API Store；按最多 31 天的窗口加载，保留 Preview 假数据用于视觉回归。
6. 接 `onOpenInput` → After related result，并明确即时 Now 回复如何归档。
7. 接 `onOpenDailyBriefing` → briefing `CardRecord.id` 对应的历史视觉组。
8. 增加 `onOpenCluster` 并实现 nested timeline。
9. 最后才做智能 salience/merge；没有权威字段前不要在客户端积累更多 category 猜测。
