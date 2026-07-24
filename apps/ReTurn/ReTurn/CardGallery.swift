import SwiftUI

/// Visual preview of every card type, on fixed sample data.
///
/// Not wired to the API and not reachable from the product UI — it exists so
/// the card designs can be reviewed as a set, and so `CardKit`'s shell is
/// exercised by every variant at once. Delete once the real screens land.
struct CardGallery: View {
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ReTurnDesign.Card.groupSpacing) {
                CardGroup("Daily Brief") {
                    professionCard
                    summaryCard
                    reviewCard
                }

                CardGroup("After") {
                    todoCard
                    healthCard
                    ideaCard(provenance: .user)
                    ideaCard(provenance: .auto)
                }

                CardGroup("States") {
                    unsavedPromptCard
                    unknownCard
                }
            }
            .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
            .padding(.vertical, ReTurnDesign.Card.groupSpacing)
        }
        .background(ReTurnDesign.Colors.screenBackground)
    }

    // ── Daily Brief group ────────────────────────────────

    /// Main visual: the mascot standing in for the assigned profession.
    private var professionCard: some View {
        Card {
            CardHeader(
                icon: "book.closed.fill",
                title: "Daily Brief",
                tint: ReTurnDesign.Colors.Accents.brief,
                detail: "Jul 24"
            )

            CardDivider()

            VStack(spacing: ReTurnDesign.Spacing.small) {
                Image("Kongkong")
                    .resizable()
                    .aspectRatio(
                        ReTurnDesign.Metrics.mascotAspectRatio,
                        contentMode: .fit
                    )
                    .frame(width: ReTurnDesign.Card.mascotWidth)
                    .accessibilityHidden(true)

                Text("Coder")
                    .font(ReTurnDesign.Typography.cardDisplayTitle)
                    .foregroundStyle(ReTurnDesign.Colors.primaryLabel)

                CardTag(text: "专注", tint: ReTurnDesign.Colors.Accents.focus)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, ReTurnDesign.Spacing.small)

            CardDivider()

            statRows
        }
    }

    private var statRows: some View {
        VStack(spacing: ReTurnDesign.Card.rowSpacing) {
            ForEach(Array(SampleData.stats.enumerated()), id: \.offset) { index, stat in
                if index > 0 {
                    CardDivider()
                }

                CardMetricRow(
                    color: stat.color,
                    name: stat.name,
                    value: stat.value,
                    caption: stat.caption
                )
            }
        }
    }

    private var summaryCard: some View {
        Card {
            CardHeader(
                icon: "book.closed.fill",
                title: "Daily Brief",
                tint: ReTurnDesign.Colors.Accents.brief,
                showsChevron: false
            )

            CardDivider()

            Text(SampleData.summary)
                .font(ReTurnDesign.Typography.cardHeadline)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Main visual: kind-coded symbols instead of dots.
    private var reviewCard: some View {
        Card {
            CardHeader(
                icon: "checkmark.seal.fill",
                title: "Review",
                tint: ReTurnDesign.Colors.Accents.review,
                detail: "3"
            )

            CardDivider()

            VStack(spacing: ReTurnDesign.Card.rowSpacing) {
                ForEach(Array(SampleData.reviewPoints.enumerated()), id: \.offset) { index, point in
                    if index > 0 {
                        CardDivider()
                    }

                    CardMetricRow(
                        color: point.color,
                        name: point.name,
                        caption: point.text,
                        marker: .symbol(point.symbol)
                    )
                }
            }
        }
    }

    // ── After group ──────────────────────────────────────

    /// Main visual: an action per row -- the only card with a side effect
    /// (accepting writes to Apple Reminders via EventKit).
    private var todoCard: some View {
        Card {
            CardHeader(
                icon: "checklist",
                title: "Tomorrow",
                tint: ReTurnDesign.Colors.Accents.todo,
                detail: "3"
            )

            CardDivider()

            VStack(spacing: ReTurnDesign.Card.rowSpacing) {
                ForEach(Array(SampleData.todos.enumerated()), id: \.offset) { index, todo in
                    if index > 0 {
                        CardDivider()
                    }

                    HStack(alignment: .top, spacing: ReTurnDesign.Spacing.medium) {
                        Text(todo)
                            .font(ReTurnDesign.Typography.cardBody)
                            .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                            .fixedSize(horizontal: false, vertical: true)

                        Spacer(minLength: 0)

                        Button("采纳") {
                            // TODO: Write to Apple Reminders via EventKit.
                        }
                        .font(ReTurnDesign.Typography.cardRowValue)
                        .buttonStyle(.borderedProminent)
                        .buttonBorderShape(.capsule)
                        .controlSize(.small)
                        .tint(ReTurnDesign.Colors.Accents.todo)
                    }
                }
            }
        }
    }

    /// Main visual: a short advice line over the two real readings. F12 keeps
    /// this card deliberately thin -- real data, minimal copy.
    private var healthCard: some View {
        Card {
            CardHeader(
                icon: "heart.fill",
                title: "Health",
                tint: ReTurnDesign.Colors.Accents.health
            )

            CardDivider()

            Text(SampleData.healthAdvice)
                .font(ReTurnDesign.Typography.cardHeadline)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .fixedSize(horizontal: false, vertical: true)

            CardDivider()

            HStack(spacing: 0) {
                healthReading(name: "睡眠", value: "6 小时 48 分")
                healthReading(name: "步数", value: "8,832")
            }
        }
    }

    private func healthReading(name: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Card.rowTextSpacing) {
            Text(name)
                .font(ReTurnDesign.Typography.cardRowCaption)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)

            Text(value)
                .font(ReTurnDesign.Typography.cardHeadline)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Main visual: the quote itself, with provenance as a tag -- F9 requires
    /// user-recorded and auto-extracted ideas to be visually distinct.
    private func ideaCard(provenance: SampleData.Provenance) -> some View {
        Card {
            CardHeader(
                icon: "lightbulb.fill",
                title: "Idea",
                tint: ReTurnDesign.Colors.Accents.idea,
                detail: "3 天前"
            )

            CardDivider()

            Text(provenance.text)
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .fixedSize(horizontal: false, vertical: true)

            CardTag(text: provenance.label, tint: provenance.tint)
        }
    }

    // ── States group ─────────────────────────────────────

    /// Client-side only, driven by `saved` from /api/stats/today. Follows the
    /// shape of Health's onboarding cards: illustration, headline, body, action.
    private var unsavedPromptCard: some View {
        Card {
            VStack(spacing: ReTurnDesign.Spacing.medium) {
                Image("Kongkong")
                    .resizable()
                    .aspectRatio(
                        ReTurnDesign.Metrics.mascotAspectRatio,
                        contentMode: .fit
                    )
                    .frame(width: ReTurnDesign.Card.mascotWidth)
                    .accessibilityHidden(true)

                Text("今天还没有存档")
                    .font(ReTurnDesign.Typography.cardHeadline)
                    .foregroundStyle(ReTurnDesign.Colors.primaryLabel)

                Text("点一下 Save，我把今天酿成明天的早报。")
                    .font(ReTurnDesign.Typography.cardBody)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)

                Button("Save Today") {
                    // TODO: Trigger the save flow.
                }
                .font(ReTurnDesign.Typography.cardRowValue)
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .controlSize(.large)
                .tint(ReTurnDesign.Colors.Accents.brief)
                .padding(.top, ReTurnDesign.Spacing.extraSmall)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, ReTurnDesign.Spacing.small)
        }
    }

    /// `CardType.unknown` / `CardContent.raw` reach the UI whenever the server
    /// ships a card an older build does not know. Tolerant decoding keeps it
    /// from crashing; this is what it shows instead.
    private var unknownCard: some View {
        Card {
            CardHeader(
                icon: "questionmark.circle.fill",
                title: "Unsupported",
                tint: ReTurnDesign.Colors.Accents.unknown,
                showsChevron: false
            )

            CardDivider()

            Text("这张卡片来自更新的版本，暂时无法显示。")
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

// ── sample data ──────────────────────────────────────────

enum SampleData {
    struct Stat {
        let name: String
        let value: String?
        let caption: String
        let color: Color
    }

    struct ReviewPoint {
        let name: String
        let text: String
        let symbol: String
        let color: Color
    }

    enum Provenance {
        case user
        case auto

        var label: String {
            switch self {
            case .user: "我记的"
            case .auto: "它帮我记的"
            }
        }

        var tint: Color {
            switch self {
            case .user: ReTurnDesign.Colors.Accents.idea
            case .auto: ReTurnDesign.Colors.Accents.unknown
            }
        }

        var text: String {
            switch self {
            case .user: "卡片是总结层，时间线是明细层 —— 两者靠「点进去」连接，不能混排。"
            case .auto: "连续三天都在下午写代码、晚上做设计，也许可以把设计固定排在晚上。"
            }
        }
    }

    static let stats: [Stat] = [
        Stat(
            name: "摄取",
            value: "27",
            caption: "收入了 17 个 idea、10 张图片。",
            color: ReTurnDesign.Colors.Accents.intake
        ),
        Stat(
            name: "专注",
            value: "82",
            caption: "今天你的注意力很集中！",
            color: ReTurnDesign.Colors.Accents.focus
        ),
        Stat(
            name: "产出",
            value: "64",
            caption: "做了 6/17 个 Todo，Agent 为你工作了 10 小时。",
            color: ReTurnDesign.Colors.Accents.output
        ),
        Stat(
            name: "连贯",
            value: "91",
            caption: "和过去完美连续！",
            color: ReTurnDesign.Colors.Accents.continuity
        ),
        Stat(
            name: "精力",
            value: nil,
            caption: "暂时还没有数据。",
            color: ReTurnDesign.Colors.Accents.energy
        ),
    ]

    static let summary = """
    昨天几乎整天都在 ReTurn 的前端上。上午把输入框的性能问题拆干净了，\
    下午换掉了顶部那个太重的分段控件，晚上和团队敲定了早报卡的方向。
    """

    static let reviewPoints: [ReviewPoint] = [
        ReviewPoint(
            name: "做到了",
            text: "把 composer 的卡顿根因找出来了 —— 打字会重算整个页面。",
            symbol: "checkmark.circle.fill",
            color: .green
        ),
        ReviewPoint(
            name: "没做到",
            text: "新的卡片外壳还没有测试覆盖。",
            symbol: "exclamationmark.circle.fill",
            color: .orange
        ),
        ReviewPoint(
            name: "发现",
            text: "菜单会和玻璃融合是 iOS 26 的既定行为，对抗它不如接受它。",
            symbol: "lightbulb.fill",
            color: .purple
        ),
    ]

    static let todos: [String] = [
        "跟后端确认职业字段和五维分项计数",
        "把 Before 时间线的色板定下来",
        "给卡片外壳补测试",
    ]

    static let healthAdvice = "昨晚睡了 6 小时 48 分，比平时少 1 小时。今天可以早点休息。"
}

#Preview {
    CardGallery()
}
