# Context 6 — BeforeView 滚动 Chrome 修订上下文

> 日期：2026-07-25
>
> 用途：只保留当前 Before 前端修订真正需要的上下文，供本轮实现、审查和后续接手时快速回查。
>
> 原始文档 `context-3.md`、`context-4.md`、`Context-5.md` 保持原样；本文不替代 PRD 或 `notice.md`。
>
> 引用格式为 `文件:起始行-结束行`，行号均指向本文创建时的原始文件，按 1 开始计数。

## 1. 当前任务

当前用户要求：

1. `BeforeView` 已接入 Main pager，直接修复 Before 页面问题。
2. Timeline 与顶部三个 label 发生视觉冲突：
   - 在顶部 chrome 下增加渐变遮罩；
   - label 显示时必须始终清晰可读。
3. Timeline 的页面级起始位置下移，不与顶部 label 重叠。
4. 用户向下滚动 Before 时，顶部 label 和底部 Composer 隐藏；向上滚动时恢复显示。

这里的“label 始终可见”指 label 处于显示状态时不被 Timeline 内容干扰；向下滚动触发的主动隐藏是明确要求，不构成冲突。

视觉参考来自本轮会话提供的截图：

- `/Users/is52hertz/Downloads/截屏 2026-07-25 14.08.02.png`

## 2. 权威顺序与冲突裁决

发生冲突时按以下顺序判断：

1. 当前会话中的最新用户要求；
2. `docs/PRD.md` §3.2；
3. `clients/apple/notice.md`；
4. `Context-5.md`；
5. `context-4.md`；
6. `context-3.md`。

本轮已经明确的覆盖关系：

- `context-4.md:106` 曾记录“背景渐变已否决”，已被本轮“为顶部 label 增加可读性渐变”的要求覆盖。
- `clients/apple/notice.md:38` 当前规定导航闲置时只变暗、不隐藏；本轮只在 **Before 垂直向下滚动**时增加隐藏状态。恢复显示后，原有闲置变暗逻辑仍可继续工作。
- `context-4.md:153` 的“不要碰 Before”是旧并行分工，已过期。
- `Context-5.md:41-42,44` 的旧并行分工和“Before 尚未接入 Main”均已过期；其中 `43,45` 的非 UI 任务边界仍有效。
- `context-3.md:50-62` 的 segmented `Picker` 和 Before 空白状态均已过期。

## 3. 平台与页面边界

- 当前 Main/Before 视觉只按 iOS 设计；macOS 使用不同产品布局，不直接复用 iOS Timeline。工程仍需保持 macOS 可编译。
  来源：`context-3.md:21-23`、`Context-5.md:28-31`、`clients/apple/notice.md:35`
- Before / Now / After 仍是横向 pager，顶部 label 与 pager 共用 selection，默认打开 Now。
  来源：`context-3.md:55-60`、`clients/apple/notice.md:36`
- 顶部导航继续使用三个纯文字 label，不恢复 segmented `Picker`。每个 label 按 semibold 宽度占位，避免字重切换推挤相邻项。
  来源：`context-4.md:31-38`、`clients/apple/notice.md:37`
- 本轮只调整 Before 的页面 chrome、滚动反馈和外层内容起点，不顺手实现 macOS 产品页、After、历史详情页、API Store 或真实路由。
  来源：`Context-5.md:43,45`、`clients/apple/notice.md:55`

## 4. 本轮允许修改的范围

允许：

- `BeforeView` 的垂直滚动容器、页面级顶部间距和顶部渐变。
- Before 垂直滚动方向的检测、阈值和迟滞。
- Home 层用于协调顶部导航与 Composer 显隐的轻量状态。
- Before page 向 Home 上报 chrome 显隐意图的 callback/状态传递。
- 顶部导航和 Composer 的 `offset`、`opacity`、命中状态及动画。
- 为上述行为增加最小必要的 design token、纯逻辑类型和单元测试。

不允许借本轮修改：

- Timeline Event、Rail、Ambient、Point、Span、Cluster 的内部视觉或数据投影。
- Input 与 Daily Briefing 的结构、分类和导航语义。
- Composer 的内容结构、附件菜单行为或 draft 所有权。
- `packages/shared`、Swift 合同镜像、API Store、服务端 projection。
- macOS 产品布局。

## 5. Chrome 行为约束

### 5.1 渐变与 Timeline 起点

- 渐变属于顶部导航 chrome 的可读性遮罩，不属于 Timeline 内容卡片。
- 渐变不得演变为 Timeline 上的 Liquid Glass、自制 glow、重阴影或高光。
- Timeline 起点应通过 `BeforeView` 外层 content inset/padding 下移，而不是修改事件内部锚点或 Rail 几何。
- 新尺寸优先进入现有 design token，避免在多个 View 中散落 magic number。
  来源：`context-3.md:27-32`、`Context-5.md:343-350`、`docs/PRD.md:283-297`、`clients/apple/notice.md:39,52`

### 5.2 滚动显隐

建议采用以下状态规则：

| 情况 | 顶部 label | Composer |
|---|---|---|
| Before 位于顶部 | 显示 | 显示 |
| Before 明确向上滚动 | 显示 | 显示 |
| Before 明确向下滚动且超过阈值 | 隐藏 | 隐藏 |
| 小幅抖动、方向变化未超过迟滞 | 保持上一个状态 | 保持上一个状态 |
| 横向切换 pager | 保留现有导航行为 | 不由垂直 tracker 误触发 |
| 非 Before 页面 | 保留现有行为 | 保留现有行为 |

实现要求：

- 只响应 Before 的垂直滚动，不用横向 pager 手势推断显隐。
- 回到或接近顶部时强制恢复 chrome。
- 使用最小位移阈值与迟滞，避免手指轻微抖动导致闪烁。
- 隐藏应保留导航和 Composer 的 View 身份；不要通过条件分支销毁 Composer。
- Composer 的 draft 必须继续由 `ComposerBar` 持有，显隐不能让输入文字丢失，也不能让输入过程重新触发整个 pager 重排。
  来源：`context-4.md:27-38`、`clients/apple/notice.md:38,44`

仍需通过手工交互确认：

- Composer 已聚焦、键盘已经弹出时，下滑是先收键盘还是立即隐藏 chrome。
- 恢复显示后，原有 idle dim timer 与新显隐动画的节奏是否自然。

### 5.3 性能与结构

- 不重新在 pager 外层引入 `GeometryReader`。
- 不把 Composer draft 提升回 Home/pager。
- 不用会改变 safe-area 高度并驱动 pager 每帧重排的实现来做隐藏动画。
- 顶部导航现有的 scroll-phase 唤醒与取消保护应保留；被替换的计时任务不能反向覆盖最新状态。
  来源：`context-4.md:27-38`、`clients/apple/notice.md:38,44`

## 6. Timeline 内容不变量

### 6.1 Timeline 不是 Card 流

- Timeline 是明细/索引层，Product Card 是总结/归因层。
- Timeline Cluster 虽可使用白色圆角面，仍是带真实时间范围的轨道结构，不是 `CardType`。
- 本轮不得因为增加顶部渐变或调整 chrome，而重新设计 Timeline 条目。
  来源：`Context-5.md:47-80`、`docs/PRD.md:124-141`、`clients/apple/notice.md:52`

### 6.2 Input

- 当前显式 Input 仅包含 `text`、`url`、`voice`、`image`。
- 保持两行 Point：第一行来源类型与时间，第二行单行原输入。
- 保留圆点和箭头；不增加卡片背景、尾部 chevron、玻璃或重阴影。
- 保持原生 `Button`、至少 44pt 命中区和完整 VoiceOver value。
  来源：`Context-5.md:206-270`、`docs/PRD.md:198-229`、`clients/apple/notice.md:53`

### 6.3 Daily Briefing

- 日期标题下只显示一行弱入口。
- 不画 Rail 节点，不计入 Event count，不在 Timeline 展开完整摘要。
- 完整 Card Group 属于独立历史页面。
  来源：`Context-5.md:274-312`、`docs/PRD.md:231-245`、`clients/apple/notice.md:54`

### 6.4 已稳定的 Timeline 几何

不要用内部几何调整来解决顶部冲突，尤其不要顺手改：

- `pointAnchorY = 30`
- `railWidth = 48`
- `railAxisX = 12`
- Event details `VStack.spacing = 4`
- Point/Span/Cluster 的既有最小高度与内部间距

这些值经过多轮截图校准；若未来单独调整，必须重新检查 Point、Ambient、Span/Cluster、Dynamic Type 和 Light/Dark。
来源：`Context-5.md:363-401`

## 7. 验收标准

### 自动验证

- 滚动 tracker 覆盖：首次采样、向下隐藏、向上显示、阈值内不变、方向迟滞、回到顶部恢复。
- iOS target 构建通过。
- `ReTurnTests` 相关测试通过。
- macOS target 构建通过，确认共享 Home 改动没有破坏编译。

构建与测试历史参考：`context-4.md:183-202`、`Context-5.md:509-544`

### 用户手工验收

- Light / Dark 下，顶部 label 显示时均清晰可读。
- Timeline 首项不再与三个 label 重叠。
- 连续下滑时 label 与 Composer 自然隐藏；上滑时自然恢复。
- 小幅回弹和方向抖动不会让 chrome 闪烁。
- 横向 Before / Now / After 翻页不会误触发垂直隐藏。
- Composer draft、焦点、键盘和附件菜单没有回归。
- Dynamic Type、不同 iPhone 宽度和 VoiceOver 没有明显退化。
  来源：`context-3.md:34-38,217-234`、`Context-5.md:546-556`

## 8. 不要继续携带的旧状态

- `context-3.md:50-62,176-199`：旧 segmented `Picker`、Before/After 空白和旧实现清单。
- `context-4.md:17,146-157,241-251`：临时 `CardGallery` 入口、旧并行分工和旧接手步骤。
- `Context-5.md:41-42,44,403-422,574-598`：旧并行分工、Before 未接线、旧目录结构、旧 worktree/branch 和历史合并步骤。
- 三份旧 context 中记录的提交 hash、当时 dirty 状态和“当前分支”都只具有历史意义。
- `Context-5.md:438-448` 与 `docs/PRD.md:247-281` 的 API/contract 缺口仍然存在，但不属于本轮视觉和滚动修订。

## 9. 原文快速索引

| 来源 | 本轮有用的原始行 |
|---|---|
| `context-3.md` | `21-38` 平台、设计系统与验收；`55-60` 横向 pager；`94-122` Composer/键盘/玻璃边界 |
| `context-4.md` | `27-38` pager 性能与顶部导航；`163-202` 交互验收、构建与提交踩坑 |
| `Context-5.md` | `28-43` 平台与旧任务边界；`47-80` Timeline/Card 分层；`206-270` Input；`274-401` Briefing、材质与几何；`491-556` 禁止项与验收 |
| `docs/PRD.md` | `124-141` 信息层级；`183-245` Timeline/Input/Briefing；`283-297` 视觉与无障碍验收 |
| `clients/apple/notice.md` | `35-48` Main/pager/Composer；`50-55` Before Timeline 现行约束 |
