import SwiftUI

/// Visual preview of every card type, on fixed sample data.
///
/// Not wired to the API and not reachable from the product UI — it exists so
/// the card designs can be reviewed as a set, and so the shared card shell is
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
                    TodoSuggestionCard(content: AfterPreviewData.todoSuggestion)
                    HealthAdviceCard(content: AfterPreviewData.health)

                    ForEach(AfterPreviewData.ideas.indices, id: \.self) { index in
                        IdeaCard(content: AfterPreviewData.ideas[index])
                    }
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
        CardSurface {
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
        CardSurface {
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
        CardSurface {
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

    // ── States group ─────────────────────────────────────

    /// Client-side only, driven by `saved` from /api/stats/today. Follows the
    /// shape of Health's onboarding cards: illustration, headline, body, action.
    private var unsavedPromptCard: some View {
        CardSurface {
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
        CardSurface {
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
}

#Preview {
    CardGallery()
}
