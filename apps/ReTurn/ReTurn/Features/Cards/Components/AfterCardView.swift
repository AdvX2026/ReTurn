import SwiftUI

/// Renders one real `CardRecord` from /api/cards using the shared card layer.
/// Todo suggestion rows carry their done/dismiss actions; accepting into
/// Apple Reminders (F12, EventKit) lands separately, so rows offer check
/// (done on the Pi) and dismiss instead of the fixture's placeholder 采纳.
struct AfterCardView: View {
    let card: CardRecord
    var doneTodoIDs: Set<String> = []
    var dismissedTodoIDs: Set<String> = []
    var todoErrors: [String: String] = [:]
    var onTodoDone: ((String) -> Void)?
    var onTodoAccept: ((String, String) -> Void)?
    var onTodoDismiss: ((String) -> Void)?

    var body: some View {
        switch card.content {
        case .briefing(let content):
            BriefingCardView(content: content, date: card.date)
        case .todoSuggestion(let content):
            TodoSuggestionCard(
                content: content,
                doneTodoIDs: doneTodoIDs,
                dismissedTodoIDs: dismissedTodoIDs,
                todoErrors: todoErrors,
                onDone: onTodoDone,
                onAccept: onTodoAccept,
                onDismiss: onTodoDismiss
            )
        case .health(let content):
            HealthAdviceCard(content: content)
        case .idea(let content):
            IdeaCard(content: content)
        case .weekly(let content):
            WeeklyCardView(content: content)
        case .raw:
            // Unknown/drifted card shapes are filtered by the page via
            // `CardContent.isRenderable`; reaching here renders nothing.
            EmptyView()
        }
    }
}

/// A seven-day recap: narrative first, followed by up to three highlights.
struct WeeklyCardView: View {
    let content: WeeklyCardContent

    var body: some View {
        CardSurface {
            CardHeader(
                icon: "calendar",
                title: "Weekly Recap",
                tint: .accentColor,
                detail: "\(content.weekStart) – \(content.weekEnd)"
            )

            CardHeadline(text: content.openingLine)

            if !content.summary.isEmpty {
                Text(content.summary)
                    .font(ReTurnDesign.Typography.cardBody)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !content.highlights.isEmpty {
                CardDivider()

                CardRows(items: Array(content.highlights.prefix(3))) { highlight in
                    Text(highlight.text)
                        .font(ReTurnDesign.Typography.cardBody)
                        .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
        }
    }
}

extension CardContent {
    /// Raw (unrecognized) payloads render as nothing; pages filter them out
    /// before laying out grids so no empty cells appear.
    var isRenderable: Bool {
        if case .raw = self { return false }
        if case .todoSuggestion(let content) = self { return !content.todoIds.isEmpty }
        return true
    }
}

/// The Save briefing: opening line as headline, briefing text, and the top
/// review points with kind glyphs (win / miss / insight).
struct BriefingCardView: View {
    let content: BriefingCardContent
    /// The card's day (CardRecord.date) — the payload itself carries none.
    var date: String?

    var body: some View {
        CardSurface {
            CardHeader(
                icon: "sparkles",
                title: "Briefing",
                tint: .accentColor,
                detail: date
            )

            CardHeadline(text: content.openingLine)

            if let briefing = content.briefing, !briefing.isEmpty {
                Text(briefing)
                    .font(ReTurnDesign.Typography.cardBody)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !content.reviewPoints.isEmpty {
                CardDivider()

                CardRows(items: Array(content.reviewPoints.prefix(3))) { point in
                    Label {
                        Text(point.text)
                            .font(ReTurnDesign.Typography.cardBody)
                            .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                            .fixedSize(horizontal: false, vertical: true)
                    } icon: {
                        Image(systemName: symbol(for: point.kind))
                            .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    }
                }
            }
        }
    }

    private func symbol(for kind: ReviewPointKind) -> String {
        switch kind {
        case .win: "checkmark.circle"
        case .miss: "xmark.circle"
        case .insight: "lightbulb"
        case .other: "circle"
        }
    }
}

#Preview("Briefing") {
    BriefingCardView(
        content: .init(
            summary: "",
            openingLine: "昨天的你，专注得不像话。",
            briefing: "全天 4 段深度工作共 5.2 小时，主要集中在下午。睡前屏幕时间偏长。",
            reviewPoints: [
                .init(text: "完成 macOS 桌面端三页结构", kind: .win),
                .init(text: "23:40 后仍在用电脑", kind: .miss),
                .init(text: "连续三天上午效率最高", kind: .insight),
            ],
            stats: .empty,
            characterState: .focused,
            nodeIds: [],
            profession: .coder,
            streak: 4,
            breakdown: .init(
                ideaCount: 2,
                imageCount: 0,
                activeFeedCount: 6,
                emailReceived: 4,
                todoCompleted: 3,
                todoTotal: 4,
                agentDurationMin: 96,
                gitCommitCount: 3,
                emailSent: 2,
                longestSessionMin: 84,
                sleepMinutes: 432,
                steps: 7_260,
                crossDayEdges: 2
            )
        ),
        date: "2026-07-24"
    )
    .padding()
    .frame(width: 360)
}

#Preview("Todo suggestion") {
    TodoSuggestionCard(
        content: .init(todos: ["回复设计稿反馈", "整理会议笔记"], todoIds: ["t1", "t2"]),
        doneTodoIDs: ["t1"],
        dismissedTodoIDs: [],
        todoErrors: [:],
        onDone: { _ in },
        onAccept: { _, _ in },
        onDismiss: { _ in }
    )
    .padding()
    .frame(width: 360)
}
