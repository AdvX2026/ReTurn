import SwiftUI

/// Visual preview of every card type, on fixed sample data.
///
/// Not wired to the API and not reachable from the product UI — it exists so
/// the card designs can be reviewed as a set, and so `CardKit`'s shell is
/// exercised by every variant at once. Delete once the real screens land.
struct CardGallery: View {
    @ScaledMetric(relativeTo: .largeTitle)
    private var mascotWidth = ReTurnDesign.Card.mascotWidth

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

    /// Main visual: the mascot standing in for the assigned profession. The
    /// stats carry no colour of their own — see `Accents`.
    private var professionCard: some View {
        Card {
            CardHeader(
                icon: "book.closed.fill",
                title: "Daily Brief",
                tint: ReTurnDesign.Colors.Accents.brief,
                detail: "Jul 24"
            )

            VStack(spacing: ReTurnDesign.Spacing.extraSmall) {
                MascotImage()
                    .frame(width: mascotWidth)

                Text("Coder")
                    .font(ReTurnDesign.Typography.cardDisplayTitle)
                    .foregroundStyle(ReTurnDesign.Colors.primaryLabel)

                Text("专注")
                    .font(ReTurnDesign.Typography.cardTag)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, ReTurnDesign.Spacing.medium)

            CardDivider()

            CardRows(items: SampleData.stats) { stat in
                CardMetricRow(
                    name: stat.name,
                    value: stat.value,
                    caption: stat.caption,
                    marker: .dot(stat.color)
                )
            }
        }
    }

    /// Main visual: the text itself. No separator — nothing follows it.
    private var summaryCard: some View {
        Card {
            CardHeader(
                icon: "book.closed.fill",
                title: "Daily Brief",
                tint: ReTurnDesign.Colors.Accents.brief,
                showsChevron: false
            )

            CardHeadline(text: SampleData.summary)
        }
    }

    /// Main visual: kind-coded symbols, deliberately untinted. Green over "做到了"
    /// and orange over "没做到" would read as a scorecard, and PRD §4.3 requires
    /// the tone to describe the day rather than grade it. The symbol shape
    /// carries the distinction instead.
    private var reviewCard: some View {
        Card {
            CardHeader(
                icon: "checkmark.seal.fill",
                title: "Review",
                tint: ReTurnDesign.Colors.Accents.review,
                detail: "3"
            )

            CardRows(items: SampleData.reviewPoints) { point in
                CardMetricRow(
                    name: point.name,
                    caption: point.text,
                    marker: .symbol(point.symbol)
                )
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

            CardRows(items: SampleData.todos) { todo in
                HStack(alignment: .firstTextBaseline, spacing: ReTurnDesign.Spacing.medium) {
                    Text(todo)
                        .font(ReTurnDesign.Typography.cardBody)
                        .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 0)

                    Button("采纳") {
                        // TODO: Write to Apple Reminders via EventKit.
                    }
                    .font(ReTurnDesign.Typography.cardBody)
                    .buttonStyle(.plain)
                    .foregroundStyle(ReTurnDesign.Colors.Accents.todo)
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

            CardHeadline(text: SampleData.healthAdvice)

            CardDivider()

            HStack(spacing: 0) {
                healthReading(name: "睡眠", value: "6 小时 48 分")
                healthReading(name: "步数", value: "8,832")
            }
            .padding(.top, ReTurnDesign.Spacing.extraSmall)
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

    /// Main visual: the idea itself, with provenance as a quiet trailing label
    /// -- F9 requires user-recorded and auto-extracted ideas to be distinct.
    private func ideaCard(provenance: SampleData.Provenance) -> some View {
        Card {
            CardHeader(
                icon: "lightbulb.fill",
                title: "Idea",
                tint: ReTurnDesign.Colors.Accents.idea,
                detail: provenance.label
            )

            Text(provenance.text)
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    // ── States group ─────────────────────────────────────

    /// Client-side only, driven by `saved` from /api/stats/today. Follows the
    /// shape of Health's onboarding cards: illustration, headline, body, action.
    private var unsavedPromptCard: some View {
        Card {
            VStack(spacing: ReTurnDesign.Spacing.medium) {
                MascotImage()
                    .frame(width: mascotWidth)

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
                .font(ReTurnDesign.Typography.cardBody)
                .buttonStyle(.borderedProminent)
                .buttonBorderShape(.capsule)
                .padding(.top, ReTurnDesign.Spacing.extraSmall)
            }
            .frame(maxWidth: .infinity)
            .padding(.vertical, ReTurnDesign.Spacing.medium)
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

        var text: String {
            switch self {
            case .user: "卡片是总结层，时间线是明细层，两者靠「点进去」连接。"
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
            caption: "今天你的注意力很集中。",
            color: ReTurnDesign.Colors.Accents.focus
        ),
        Stat(
            name: "产出",
            value: "64",
            caption: "做了 6/17 个 Todo。",
            color: ReTurnDesign.Colors.Accents.output
        ),
        Stat(
            name: "连贯",
            value: "91",
            caption: "和过去完美连续。",
            color: ReTurnDesign.Colors.Accents.continuity
        ),
        Stat(
            name: "精力",
            value: nil,
            caption: "暂时还没有数据。",
            color: ReTurnDesign.Colors.Accents.energy
        ),
    ]

    static let summary = "昨天几乎整天都在 ReTurn 的前端上，把输入框的性能问题拆干净了。"

    static let reviewPoints: [ReviewPoint] = [
        ReviewPoint(
            name: "做到了",
            text: "找出了 composer 的卡顿根因。",
            symbol: "checkmark.circle"
        ),
        ReviewPoint(
            name: "没做到",
            text: "卡片外壳还没有测试覆盖。",
            symbol: "circle.dashed"
        ),
        ReviewPoint(
            name: "发现",
            text: "菜单和玻璃融合是 iOS 26 的既定行为。",
            symbol: "lightbulb"
        ),
    ]

    static let todos: [String] = [
        "跟后端确认职业字段",
        "定下 Before 时间线的色板",
        "给卡片外壳补测试",
    ]

    static let healthAdvice = "昨晚睡了 6 小时 48 分，比平时少 1 小时。"
}

#Preview {
    CardGallery()
}
