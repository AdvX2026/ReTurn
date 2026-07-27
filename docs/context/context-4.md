# Context 4 — Composer 性能修复 / 顶部导航 / 卡片体系 交接

> 整理时间：2026-07-25
> 当前分支：`feat/app-models`
> 起点：`5fa8131`（context-3 交接文档）
> 终点：`442d617 refactor(app): split the card shell into one file per type`
> 前序文档：`context-3.md`（iOS composer 审查交接）

## 0. 这份文档怎么读

本轮跨了三件事：修 composer 的性能与命中问题、重做顶部导航、从零建立卡片体系。第三件占了大部分时间，且**产生了大量产品决策**。

- **产品与设计决策全部落在 `docs/prd-drift.md`**，本文档只做索引，不复制内容——那份清单是唯一权威，且已核对过本轮无遗漏。
- **代码约束落在 `clients/apple/notice.md`**（8 条）。
- 本文档记录的是**过程信息**：为什么这么做、哪些路走不通、下一位应该从哪接。

⚠️ **工作区有一处未提交的临时改动**：`clients/apple/ReTurn/ReTurnApp.swift` 的入口指向 `CardGallery()` 而非 `ContentView()`，为的是在模拟器里查看卡片设计。**看完请 `git checkout clients/apple/ReTurn/ReTurnApp.swift` 还原**，不要提交。

---

## 1. 本轮完成的代码工作

### 1.1 Composer（context-3 的三个报告问题，全部修复）

| 报告的症状 | 真实根因 | 修复 |
|---|---|---|
| 点加号后卡顿 | 整屏是一个 `body` 且套在 `GeometryReader` 里；`composerText` 挂在 `ContentView` 上，**每敲一个字符重算整个 pager + 三个 page + 矢量吉祥物**。更严重的是 composer 聚焦动画会驱动 `safeAreaInset` 高度 → 内层 `GeometryReader` → 每个 page 的 frame → paging 吸附点，**spring 的每一帧都在重排整个分页 ScrollView** | 拆出 `ComposerBar` / `NowPage` 独立 View；**移除两个 `GeometryReader`**；自适应宽度改 `.frame(maxWidth:)` + `.padding`；page 改 `.containerRelativeFrame` |
| 点输入框不抬键盘 | `TextField` 只覆盖一行文字，50/56pt 外框的上下 padding 是死区 | 加 `.contentShape(composerShape)` + tap-to-focus |
| 加号难点 | `.clipShape(Circle())` **会裁剪命中测试**，把命中区裁成 ~20pt 内切圆（远低于 HIG 44pt）。此前尝试的 `.contentShape(Circle())` 必然无效——content shape 只替换命中形状，不会放大 | 显式 44pt frame + 负 padding 抵消布局占位 |

### 1.2 顶部导航

segmented `Picker` → 三个纯文字 label。理由：那个实心灰胶囊是**全屏唯一不透明的面**，与扁平吉祥物、半透明 composer 不是一套视觉语言。

- 当前页 primary + semibold，其余 secondary + regular，切换时插值
- **每个 label 按 semibold 宽度占位**（隐藏副本 + overlay），字重切换不会推挤邻居
- 静止后淡到 `navigationDimmedOpacity`（0.3）而非隐藏——`.opacity` 不影响命中，label 仍可点
- 触发源是**滚动阶段**（`onScrollPhaseChange`，iOS 18+ / 有 `#available` 降级），手指一碰就亮、pager 真正停稳才计时

### 1.3 卡片体系（新建）

```
CardSurface / CardGroup / CardHeader / CardHeadline / CardDivider / CardRows / CardMetricRow
    ↑ 7 个外壳组件，各自一个文件，产品级长期组件
MascotImage
    ↑ 消除三处重复的 resizable/aspectRatio/accessibilityHidden
CardGallery + SampleData
    ↑ 8 张卡的假数据预览，临时脚手架，接真实数据时删除
```

`CardGallery` 里 8 张卡的 body 仍是计算属性，**是有意保留的**：见 §4.2。

---

## 2. 走过的弯路（不要重走）

### 2.1 菜单与玻璃融合：三次尝试，最终接受

**现象**：附件菜单展开时，composer 的 `glassEffect` 表面会融合进菜单，输入框在菜单打开期间不可见。键盘开/关两态都如此。

| 尝试 | 结果 |
|---|---|
| 透明双层（可见加号在玻璃内 + 透明 `Menu` 在玻璃外） | 有效，但用户否决——结构诡异 |
| `.buttonStyle(.plain)` | ❌ 只去掉了按压边框，融合照旧 |
| UIKit `UIButton` + palette `UIMenu` via `UIViewRepresentable` | ❌ UIKit 呈现同样融合。已回撤（`e2022be`） |

**结论**：这是 iOS 26 系统级的 Liquid Glass 呈现语言（菜单从源玻璃"生长"出来），控件层面改不动。**用户决定接受为特色**，`notice.md` 已标注"不要修"。

未尝试的路：`GlassEffectContainer` + `glassEffectUnion`（给加号独立的 morph 身份）、自绘面板（ChatGPT 的做法，见 §3.3）。

### 2.2 Health 风格：迭代三轮才对

第一版抓了形没抓住克制，三个具体错误：**颜色堆太多**（五维五个彩色圆点，纯装饰）、**留白不足**（15pt 字挤在 14pt 间距里，内边距 16）、**字重过重**（明细行全 semibold，层级压平成噪音）。外加一个结构错误：**每张卡头部下面都切了分隔线**。

第二版收得过头，把五维的颜色也去掉了。第三版才找到正确的界线：

> **颜色可以分类，不可以评判。**
> 五维色点是图例（等同 Apple 睡眠评分给三个分项上色），无褒贬 → 保留。
> Review 的 win/miss 用绿/橙会变成成绩单 → 去掉，改用无色描边符号靠形状区分。依据是 PRD §4.3「描述你的一天，不是给你打分」。

三条实现纪律写进了 `docs/prd-drift.md` §6.6.1 / §6.6.2。

### 2.3 一个提交失误

`git add -A clients/apple/ReTurn` 把明确说过不提交的临时入口切换扫进了 commit，已用 `reset --soft` + `restore --staged` 修正。**提交时列具体文件，不要用 `-A`**（AGENTS.md 已有此要求）。

---

## 3. 讨论确定的产品方向

完整内容在 `docs/prd-drift.md`，此处只列索引与最需要注意的几条。

### 3.1 与 PRD 有偏移的（drift §1–§4）

| # | 偏移 | 状态 |
|---|---|---|
| 1 | 主视图滑动：上下 → **左右** | 🟢 已生效 |
| 2 | 命名：`Future` → `After` | 🟢 已生效 |
| 3 | sidebar：左滑 → 上滑 | 🟡 未实现 |
| 5 | **职业系统**（PRD §4.1 明确砍掉过「属性驱动 / 换装体系」） | 🟡 |
| 6 | 五维数值进主视图（PRD §4.3 要求收在展开层，标注为"面向大众的硬约束"） | 🟡 |
| 7 | 状态标签由"打头"改为**卡内 tag** | 🟡 |
| 8 | 吉祥物动画扩大到"跳到 input 上走动"（需分层 SVG 资产） | 🟡 |
| 9 | Now 明确为**四态状态机**，空状态不作常态展示 | 🟡 |
| 10 | 设计参照系新增 Apple 健康 / 手记 | 🟡 |
| 11 | 背景渐变 | ⚫️ 已否决 |

### 3.2 已拍板的数据决策（drift §五，均需后端配合）

三条构成**一次契约变更**，向后端一起提：

1. **五维不算总分**，各自独立 0–100（只借鉴 Apple 睡眠评分的行式布局，不借鉴总分机制）
2. **归因文案**：server 出**分项计数**，客户端持有文案模板。⚠️ 前端需要一份"每个维度分别给哪些计数项"的清单才能定稿模板
3. **职业字段 server 下发**（不走客户端推导）；建议确定性映射而非 LLM 判定，枚举入 `shared`，客户端 `TolerantEnum` 容错
4. 附带：**`streak` 契约缺口**——PRD §4.3 要求展示，但 `BriefingCardContent` 无此字段（只有 `SaveResponse` 有）

### 3.3 卡片体系（drift §6，本轮最大产出）

关键概念，按重要性排：

- **§6.0 卡片与时间线是同级概念，不可混排。** 卡片=总结层、时间线=明细层，**卡片的可点击性是定义属性**（这也是 Health 每张卡都有 chevron 的原因）。不得把明细铺进卡片，也不得把卡片当时间线条目。
- **§6.1 三层模型**：`CardType`（后端数据）→ 卡片组（视觉分组）→ 卡片（白色块）。**一条记录可渲染成多张卡**——设计稿里两张卡头部都写 "Daily Brief" 即证。
- **§6.2 需要设计的 8 个形态**：Daily Brief 组 3 张 + After 3 张 + 未 Save 提示卡 + 未知卡片兜底。兜底那个最容易漏。
- **§6.3 字段落位**：`summary` → Summary 卡；`openingLine` → 吉祥物问候；`briefing` → **不展示**（默认等于 summary）。⚠️ 这三个字段的真实语义与直觉不符，详见 drift。
- **§6.4 页面归属 = 类型 + 日期的函数**：`briefing` 今天在 Now、之后沉到 Before。**因此 Before 是内容最重的一页，不是最少。**
- **§6.6.1 颜色规则**：分类可以，评判不行。
- **§6.7 色板待定**：时间线已占 6 个色位，两套必须统一分配。当前占位色全在 `Colors.Accents`，替换是改一个 enum 的工作量。

### 3.4 尚未归位的（drift §6.8）

1. 「待确认项」的形态（PRD F3 提到，契约无对应 `CardType`）
2. Task 回传的通道（判断走 `messages`，`messages` 表有 `task_id`；**待确认**）
3. 卡片详情页——每张卡点进去是什么

---

## 4. 当前实现状态

### 4.1 已实现

- Composer：性能、命中区、tap-to-focus、单层菜单
- 顶部导航：纯文字 label + 滚动唤醒 + 静止淡出
- 卡片外壳（7 个组件）+ 8 张卡的视觉设计（假数据）
- `MascotImage`、`@ScaledMetric` 的 Dynamic Type 支持

### 4.2 有意未做

| 项 | 原因 |
|---|---|
| `CardGallery` 里 8 张卡未拆成独立 View struct | swiftui-pro 要求拆（计算属性不构成视图身份）。但 gallery 是接真实数据时要删的脚手架，**拆一次比拆两次划算**。接数据时一次性拆到位 |
| macOS 适配 | 用户明确"macOS 是另外的视图，先不管"。当前无 macOS 专属分支，仅保证编译通过 |
| `Color(uiColor:)` 未替换 | design.md 要求避免 UIKit 色，正解是进 asset catalog，需新增资产，等产品方定 |
| Before / After 页内容 | Before 时间线**由另一位 agent 负责**，不要碰其实现 |

### 4.3 未实现（业务）

Before/After 内容、上滑 sidebar、相机/照片/文件选择、语音录制、发送文本、卡片接真实 API、吉祥物动画。

---

## 5. 工作规范（本轮确立或踩到的）

### 5.1 验证能力的边界 ⚠️

**这个环境无法脚本化点击模拟器**：`idb` 未安装（`ios-simulator-skill` 的 navigator/screen_mapper 都依赖它），`osascript` 被系统拒绝辅助访问权限。

后果：**交互行为只能由用户手动验证**。本轮因此连续两次提交了未经验证的假设（`.buttonStyle(.plain)`、UIKit 桥接），都错了，第二次还回撤了。

**规范**：iOS 交互行为的改动，先说清假设让用户确认，不要在未验证的第一个修复上叠第二个。需要多轮验证时先提议装 idb（`brew install idb-companion` + `pipx install fb-idb`）。

**仍然可以自测的**：静态布局/配色/字号，用 `xcrun simctl io <udid> screenshot`。截长页面时可临时加 `ScrollViewReader` + `.task` 自动滚动，截完删除。

### 5.2 swiftui-pro skill

本轮写了大量 SwiftUI 却一直没调这个 skill，被用户指出。**写/改 SwiftUI 时应当调用**。

它这次找出的真问题：`Binding(get:set:)` 反模式、9 个 `some View` 计算属性该拆、固定尺寸未跟随 Dynamic Type、装饰性 chevron 未对 VoiceOver 隐藏、多 type 挤在一个文件、该用 `Image(.kongkong)` 而非字符串字面量。

不适用的（记下来免得下次误判）：
- `ForEach(items.enumerated())` 直接用需要 `EnumeratedSequence: Collection`（Swift 6.2 / iOS 26），**本项目是 Swift 5.0 / iOS 17，必须 `Array(...)`**
- composer 上的 `onTapGesture` 是合理例外——加 `.isButton` 会让 VoiceOver 把整个输入框读成按钮，比现状更差

### 5.3 构建与验证命令

```bash
# iOS（本轮验证机：iPhone 17 Pro Max / iOS 26.5, UDID 4142C213-2C46-4EE3-9A12-D9422B6CB5BD）
xcodebuild -project clients/apple/ReTurn.xcodeproj -scheme ReTurn -configuration Debug \
  -destination 'platform=iOS Simulator,id=<UDID>' \
  -derivedDataPath <scratch>/dd-sim CODE_SIGNING_ALLOWED=NO build

# macOS（必须一并验证，同一个 scheme）
xcodebuild ... -destination 'platform=macOS,arch=arm64' -derivedDataPath <scratch>/dd-mac ...
```

**SourceKit 会持续报 `Cannot find 'ReTurnDesign' in scope`——那是索引噪音**，同模块符号，`xcodebuild` 从未报错。判断编译是否通过看 `xcodebuild`，不要看 SourceKit 诊断。

新增文件**不需要改 pbxproj**（`ReTurn/` 是 `PBXFileSystemSynchronizedRootGroup`，无排除项）。但 **Xcode 若在文件创建时开着，需重开项目**才能刷新同步组——否则 Preview 会报 "Active scheme does not build this file"。

### 5.4 提交纪律

- 列具体文件，**不要 `git add -A`**（本轮因此误提交了临时改动）
- 每个 commit 前跑 iOS + macOS 两个 target
- `docs/PRD.md` 改动立即 push；`docs/prd-drift.md` 不是 PRD 本体，按常规提交即可

---

## 6. 本轮提交（25 个）

| # | Commit | 内容 |
|---|---|---|
| 1 | `5fa8131` | context-3 交接文档 |
| 2 | `3f8c579` | composer 命中区 + tap-to-focus |
| 3 | `b4a97df` | **composer 状态与布局解耦（性能主修复）** |
| 4 | `abfccad` | notice：布局与命中约束 |
| 5 | `8284948` | 加号合并为单层 Menu |
| 6 | `702661a` | notice：plain button style 的理由 |
| 7 | `95345a0` | UIKit 菜单方案 |
| 8 | `46069c4` | notice：UIKit 约束 |
| 9 | `e2022be` | **回撤 UIKit 方案** |
| 10 | `a41eaa2` | notice：玻璃融合接受为有意行为 |
| 11 | `615df21` | 顶部导航改纯文字 label + 淡出 |
| 12 | `f63e682` | notice：纯文字导航 |
| 13 | `d86dddc` | **修被取代的淡出计时器仍会触发**（`try?` 吞掉取消错误） |
| 14 | `5dffe86` | 滚动唤醒 + label 宽度预留 |
| 15 | `c3645ec` | notice：淡出 keying 与宽度预留 |
| 16 | `4630696` | **建立 `docs/prd-drift.md`** |
| 17 | `90157a5` | drift：早报卡三个数据决策 |
| 18 | `28429d5` | drift：卡片体系 |
| 19 | `845b48b` | drift：分离卡片与时间线两层 |
| 20 | `8078857` | **卡片外壳 + 假数据画廊** |
| 21 | `6fec6b1` | 卡片收敛到 Health 的克制 |
| 22 | `97a8b97` | 颜色分类不评判 |
| 23 | `d9d78e6` | swiftui-pro review 修复 |
| 24 | `6fcf0da` | drift：颜色规则与布局纪律 |
| 25 | `442d617` | 外壳拆成一类一文件 |

外加本次导出时对 `docs/prd-drift.md` 的补充（8 个卡片形态清单、Todo 卡的提醒事项定位、尚未归位的三件事）。

---

## 7. 给下一位 agent 的建议顺序

1. **先读 `docs/prd-drift.md`** —— 产品决策的唯一权威，尤其 §6.0（卡片/时间线分层）和 §6.3（字段语义与直觉不符）。
2. **再读 `clients/apple/notice.md`** —— 8 条代码约束，每条都对应一个已经踩过的坑（无 `GeometryReader`、命中区不可裁剪、玻璃融合不要修、导航淡出的 keying 等）。
3. **还原 `ReTurnApp.swift`** 的临时入口。
4. 待用户确认后再动工的事项：
   - 契约变更（职业 / 分项计数 / `streak`）向后端提出后，才能接真实数据
   - 色板由产品方统一分配后，替换 `Colors.Accents`
   - drift §6.8 三件未归位的事
5. **本轮三个修复尚未获得用户真机确认**：composer 卡顿是否消失、点输入框上下边缘能否抬键盘、加号是否好点。优先复核。
6. 不要碰 Before 时间线的实现（另一位 agent 负责），但需与其对齐色板与标题层级。
