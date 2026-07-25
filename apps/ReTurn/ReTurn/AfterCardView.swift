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
            TodoSuggestionCardView(
                content: content,
                doneTodoIDs: doneTodoIDs,
                dismissedTodoIDs: dismissedTodoIDs,
                todoErrors: todoErrors,
                onDone: onTodoDone,
                onAccept: onTodoAccept,
                onDismiss: onTodoDismiss
            )
        case .health(let content):
            HealthCard(
                advice: content.advice,
                sleep: Self.sleepDisplay(minutes: content.sleepMinutes),
                steps: Self.stepsDisplay(content.steps)
            )
        case .idea(let content):
            IdeaCard(
                text: content.text,
                provenanceLabel: content.provenance == .user ? "我记的" : "它帮我记的"
            )
        case .raw:
            // Unknown/drifted card shapes are filtered by the page via
            // `CardContent.isRenderable`; reaching here renders nothing.
            EmptyView()
        }
    }

    static func sleepDisplay(minutes: Int?) -> String {
        guard let minutes, minutes > 0 else { return "—" }
        let hours = minutes / 60
        let rest = minutes % 60
        return rest == 0 ? "\(hours)h" : "\(hours)h \(rest)m"
    }

    static func stepsDisplay(_ steps: Int?) -> String {
        guard let steps else { return "—" }
        return steps.formatted(.number.grouping(.automatic))
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

            Text(content.briefing)
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                .fixedSize(horizontal: false, vertical: true)

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

/// Tomorrow's suggested todos with real actions: check marks the todo done on
/// the Pi (false→true also emits the todo_check node), x dismisses it as a
/// negative preference sample. Dismissed rows leave the card; done rows stay
/// struck through.
struct TodoSuggestionCardView: View {
    let content: TodoSuggestionCardContent
    let doneTodoIDs: Set<String>
    let dismissedTodoIDs: Set<String>
    let todoErrors: [String: String]
    let onDone: ((String) -> Void)?
    let onAccept: ((String, String) -> Void)?
    let onDismiss: ((String) -> Void)?

    /// todos and todoIds are written as parallel arrays by the server; zip
    /// keeps the pairing safe even if one side drifts shorter.
    private var visibleItems: [(id: String, text: String)] {
        zip(content.todoIds, content.todos)
            .filter { !dismissedTodoIDs.contains($0.0) }
            .map { (id: $0.0, text: $0.1) }
    }

    var body: some View {
        CardSurface {
            CardHeader(
                icon: "checklist",
                title: "Tomorrow",
                tint: ReTurnDesign.Colors.Accents.todo,
                detail: "\(visibleItems.count)"
            )

            if visibleItems.isEmpty {
                Text("All handled.")
                    .font(ReTurnDesign.Typography.cardBody)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
            } else {
                CardRows(items: visibleItems) { item in
                    row(for: item)
                }
            }
        }
    }

    @ViewBuilder
    private func row(for item: (id: String, text: String)) -> some View {
        let isDone = doneTodoIDs.contains(item.id)

        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.extraSmall) {
            HStack(alignment: .firstTextBaseline, spacing: ReTurnDesign.Spacing.medium) {
                Text(item.text)
                    .font(ReTurnDesign.Typography.cardBody)
                    .foregroundStyle(
                        isDone
                            ? ReTurnDesign.Colors.secondaryLabel
                            : ReTurnDesign.Colors.primaryLabel
                    )
                    .strikethrough(isDone)
                    .fixedSize(horizontal: false, vertical: true)

                Spacer(minLength: 0)

                if isDone {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(ReTurnDesign.Colors.Accents.todo)
                } else {
                    if let onDone {
                        Button {
                            onDone(item.id)
                        } label: {
                            Image(systemName: "checkmark")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(ReTurnDesign.Colors.Accents.todo)
                        .accessibilityLabel("Mark done")
                    }
                    if let onAccept {
                        Button("Add to Reminders", systemImage: "checklist") {
                            onAccept(item.id, item.text)
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                        .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    }
                    if let onDismiss {
                        Button {
                            onDismiss(item.id)
                        } label: {
                            Image(systemName: "xmark")
                        }
                        .buttonStyle(.plain)
                        .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                        .accessibilityLabel("Dismiss")
                    }
                }
            }

            if let error = todoErrors[item.id] {
                Text(error)
                    .font(ReTurnDesign.Typography.cardRowCaption)
                    .foregroundStyle(.red)
            }
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
            nodeIds: []
        ),
        date: "2026-07-24"
    )
    .padding()
    .frame(width: 360)
}

#Preview("Todo suggestion") {
    TodoSuggestionCardView(
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
