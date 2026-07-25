# Context 3 — iOS Main / Now / Composer 审查交接

> 整理时间：2026-07-25
> 当前分支：`feat/app-models`
> 本轮 UI 最新基线：`246e877 fix(app): bind plus visual to composer glass`

## 1. 这份文档的用途

这是当前 iOS MVP 首页及底部输入框的实现上下文，供下一位 agent 做代码和交互审查。

审查时请区分：

- **已经确定的产品与设计约定**：不要擅自改回 PRD 旧方案。
- **当前实现方式**：可以审查其正确性和简洁性。
- **尚未接入的功能**：不要误判为已经完成。

## 2. 已确定的产品与设计约定

### 平台范围

- 当前 Main 页面只按 **iOS** 设计和调整。
- macOS 的产品布局会完全不同。iOS 特有的布局和交互应留在 `#if os(iOS)` 中，除非以后另有 macOS 设计稿。
- 工程部署目标仍是 iOS 17 / macOS 14，但黑客松 MVP 和视觉验证优先考虑 **iOS 26**。

### 设计系统

- 以 Apple HIG 和 Apple 官方组件为基础。
- iOS 26 上能使用原生 Liquid Glass API 的控制面，优先使用新 API。
- 当前输入框使用 `.glassEffect(.regular.interactive(), in:)`。
- 不再手工绘制高光、双角光晕、折射或模拟玻璃阴影。系统应负责按压高光、微缩、进入后台后的材质降级等行为。
- iOS 26 以下只提供局部、简单的标准 Material fallback，不要求复刻 Liquid Glass。
- 颜色、间距、尺寸和排版规则集中在 `apps/ReTurn/ReTurn/DesignTokens.swift`，不要在视图里散落新的 magic numbers。

### 视觉检查与验证分工

- 用户负责真机/模拟器上的视觉与手感检查，并会通过截图快速反馈。
- agent 负责保证代码结构合理且工程能够编译运行。
- 视觉修改后应告诉用户需要测试的具体场景；无需 agent 自行做耗时的截图像素比对。

## 3. 设计来源与页面结构

Figma：

- 文件：[Return](https://www.figma.com/design/ilZuF3hqB1HH7f1usiMmPM/Return?node-id=7-1182&m=dev)
- 起始参考节点：`7:1182`
- `Kongkong.imageset` 是从 Figma 导出的原始矢量资产，不要用 SwiftUI Shape 重画。

当前页面从上到下：

1. 顶部原生 segmented `Picker`：`Before / Now / After`。
2. 中间是横向分页时间线。
3. `Now` 页面中央显示 Kongkong 和 `Teethe is back!`。
4. 底部通过 `safeAreaInset` 放置 composer 输入框。

PRD 原先描述过 Before / Now / After 上下滑动；用户已明确改成：

- 三页之间 **左右滑动**。
- 顶部三个 label 与横向页面选择共用同一个 selection。
- 默认打开 `Now`。
- 未来可能通过向上滑动露出原 sidebar 的一部分；**本轮没有实现，也不要在审查修复中顺带实现**。

当前 `Before` 和 `After` 仍是空白占位页，只有 `Now` 有内容。

## 4. 当前自适应排版

主要代码：

- `apps/ReTurn/ReTurn/ContentView.swift`
- `apps/ReTurn/ReTurn/DesignTokens.swift`

当前关键 token：

| 项目 | 当前值/规则 |
| --- | --- |
| 顶部导航最大宽度 | `520` |
| composer 普通最大宽度 | `640` |
| composer 聚焦最大宽度 | `680` |
| composer 普通屏幕水平边距 | `20` |
| composer 聚焦水平边距 | `12` |
| composer 最小高度 | 普通 `50`，聚焦 `56` |
| composer 圆角 | `28` continuous |
| composer 内容水平 inset | `17` |
| 左右附件尺寸 | `30 × 30` |
| 输入最大显示行数 | `5` |
| mascot 宽度 | 容器宽度的 `43.5%`，限制在 `150...195` |

这些规则用于解决 iPhone 17 Pro 和 Pro Max 之间固定宽度、固定字号比例不自然的问题：

- 顶部导航和输入框以容器宽度减去边距计算，而不是写死设备宽度。
- 在大屏设备上使用最大宽度限制，避免横向无限拉长。
- 输入框聚焦时会稍微变宽，并使用 spring 动画。
- 文本使用 SwiftUI semantic font：hero 为 rounded title，composer 为 body。

## 5. Composer 的目标交互

### 未输入文本

- placeholder：`Ask Return Anything`
- 左侧：加号。
- 右侧：黑色圆形底、白色 `waveform.mid` SF Symbol。
- 加号、文字和右侧按钮在单行状态下视觉居中对齐。

### 输入文本后

- `TextField(axis: .vertical)` 自动换行。
- 输入框从一行向上扩展，最多显示五行，之后由文本控件内部滚动。
- 右侧图标由 `waveform.mid` 切换成 `arrow.up`。
- 当前只是图标状态变化；发送行为尚未接入。

### 键盘

- 点击 composer 之外的 timeline 内容会把 `isComposerFocused` 设为 `false`，键盘下移。
- 该逻辑只在 iOS 上启用。
- 使用 timeline 上的 `simultaneousGesture(TapGesture())`，避免替换系统已有手势。
- composer 位于独立的 bottom `safeAreaInset`，点击 composer 本身不会触发 timeline 的 dismiss 手势。

### Liquid Glass

- iOS 26 使用原生 interactive Liquid Glass。
- 点击/按压输入框时，整块玻璃会出现系统高光和轻微缩放。
- 可见的加号必须属于同一玻璃内容层，因而应与输入框一起运动。
- 不要在输入框上叠加自制 glow、highlight 或重阴影。

## 6. 加号菜单的目标交互

点击加号后显示 Apple 原生菜单组件：

- `Camera`
- `Photos`
- `Files`

当前使用 `Menu` 内的 `ControlGroup`，这是为贴近 Figma 所使用的 Apple HIG 原生组件。

菜单展开时：

- 原输入框必须继续存在。
- 菜单应叠在输入框上方，而不是用菜单替换整个输入框。
- 无论键盘是否已经弹出，都应保持相同行为。
- 加号的按压反馈应是圆形/圆角，而不是突兀的直角框。
- 加号命中范围不能为了圆形反馈而缩得难以点击。

`Camera`、`Photos`、`Files` 目前都只有 TODO，尚未真正打开相机、照片选择器或文件选择器。

## 7. 加号的当前双层实现（重点审查）

当前 iOS 实现不是普通的单层 `Menu`，而是：

1. **玻璃内容层内的可见加号**
   - 位于 `composerContent` 的 `HStack` 中。
   - 会参与 `.glassEffect(.regular.interactive())` 的高光和缩放。
   - 设置了 `.accessibilityHidden(true)`，避免与真正的菜单控制重复暴露给 VoiceOver。

2. **玻璃层外的透明 `Menu` 触发器**
   - 通过 `.overlay(alignment: .leading)` 覆盖在可见加号上。
   - label 使用 `.opacity(0.001)` 保留原生菜单的布局、命中和 presentation source。
   - 真正的 accessibility label 仍由这个 `Menu` 提供。
   - 保留 `.buttonBorderShape(.circle)` 和 `.clipShape(Circle())`。

形成该结构的历史原因：

- 把 `Menu` 直接作为 composer 内容时，键盘未弹出直接点加号，会出现“输入框消失、菜单取代输入框”的问题。
- 把可见 `Menu` 完全移到 glass 后的 overlay，可以保留输入框，但输入框发生 Liquid Glass 微缩时，加号不会跟着运动。
- 当前方案把视觉和事件源分离，以同时满足“输入框保留”和“加号参与玻璃运动”。

审查重点：

- `.opacity(0.001)` 是否在 iOS 26 上稳定保留命中、菜单锚点和无障碍行为。
- 透明 overlay 是否会抢走不该抢的 composer/glass 触摸。
- 点击输入框非加号区域时，加号是否跟随玻璃同步运动。
- 点击加号时，圆形反馈与玻璃高光是否协调。
- 键盘开/关两种状态下，菜单是否都浮在原输入框之上。
- 不要在没有覆盖以上回归场景的情况下，简单地把两层重新合并。

曾尝试给菜单加 `.contentShape(Circle())`，但用户反馈加号变得难点，因此已移除。当前只保留圆形视觉边界，不主动缩小命中区域。

## 8. 当前实现状态与已知未完成项

已经实现：

- Figma `Now` 初始页面骨架。
- Before / Now / After 横向分页和顶部 selection 联动。
- 自适应顶部导航、mascot 和 composer。
- composer 聚焦时横向扩展。
- 多行输入与最多五行高度增长。
- 输入为空/非空时 waveform/send icon 切换。
- iOS 26 原生 interactive Liquid Glass 和旧系统 Material fallback。
- 点击 timeline 空白区域收起键盘。
- 原生 Camera / Photos / Files 菜单外观。
- 菜单打开时保留原输入框。
- 加号圆形反馈、可点击区域恢复，以及加号参与玻璃运动的最新修复。

尚未实现：

- Before / After 实际内容。
- 向上滑出 sidebar。
- 相机、照片和文件选择功能。
- 语音录制。
- 发送文本。
- composer 与后端 API 的业务绑定。

## 9. 手工验证状态

用户此前已确认通过：

- 菜单可以在输入框上方出现并保留输入框。
- 点击输入框外区域可以收起键盘。
- 修复手势冲突后，输入框 Liquid Glass 点击效果恢复。

后来又进行了三轮细化：

1. 菜单按压框改为圆形。
2. 移除导致加号难点的 `.contentShape(Circle())`。
3. 将可见加号重新放入玻璃内容层，使其跟随输入框运动。

第 3 项对应最新提交 `246e877`，已经编译通过，但在整理本文档时还没有收到用户的最终真机视觉确认。因此下一位 agent 应优先复核第 7 节的场景。

## 10. 验证与构建

最新修复执行并通过：

```bash
xcodebuild \
  -project apps/ReTurn/ReTurn.xcodeproj \
  -scheme ReTurn \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath /tmp/ReTurnDerivedData-plus-glass-binding-ios \
  CODE_SIGNING_ALLOWED=NO \
  build
```

结果：`BUILD SUCCEEDED`

当前 UI 交互没有自动化测试覆盖；Liquid Glass、菜单 presentation 和触摸命中需要在 iOS 26 Simulator/真机上手工验证。

## 11. 本轮相关提交

从页面骨架到最新状态：

| Commit | 内容 |
| --- | --- |
| `a5542b9` | 实现 Figma Now timeline shell |
| `b61a3cc` | 导航、mascot、composer 自适应 |
| `55c3634` | 输入框表面与阴影初步调整 |
| `bb988fb` | 曾加入手工双角光效，后续已被原生方案取代 |
| `d5bded2` | 改用原生 Liquid Glass |
| `dad571c` | 记录 OS 26 / 原生组件优先约定 |
| `f7a49c5` | 多行文本与输入框向上扩展 |
| `e58ce67` | composer 附件对齐 |
| `2c6430c` | composer 内容居中 |
| `0294c56` | 有文本时显示 `arrow.up` |
| `502159f` | 平衡左侧加号视觉 |
| `a96e13c` | 加入 Camera / Photos / Files 原生菜单 |
| `b8c4236` | 菜单打开时保留 composer |
| `2ecd306` | 点击 timeline 收起 iOS 键盘 |
| `d51ab92` | 恢复 composer 的 interactive glass 触摸 |
| `f6af57a` | 菜单反馈改为圆形 |
| `508c387` | 恢复加号命中范围 |
| `246e877` | 可见加号重新绑定到 composer glass |

## 12. 对下一位 agent 的建议审查顺序

1. 先在 iOS 26 上验证第 7 节的六个加号/菜单场景。
2. 再审查 `ContentView.composer` 的双层结构是否有更原生且不引入历史回归的写法。
3. 检查 VoiceOver 是否只读出一个 `Add` 菜单控制。
4. 检查 Dynamic Type 下单行垂直居中、五行增长和左右附件是否稳定。
5. 只报告或修复当前审查范围内的问题；不要顺带实现第 8 节列出的未完成业务功能。
