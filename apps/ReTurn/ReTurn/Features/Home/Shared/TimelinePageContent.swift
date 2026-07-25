import SwiftUI

struct TimelinePageContent: View {
    let page: TimelinePage
    let isActive: Bool
    let isBeforeChromeVisible: Bool
    let onBeforeChromeVisibilityChange: (Bool) -> Void
    let onBeforeScrollActivityChange: (Bool) -> Void

    var body: some View {
        switch page {
        case .before:
            #if os(iOS)
            IOSBeforePage(
                isChromeVisible: isBeforeChromeVisible,
                onChromeVisibilityChange: onBeforeChromeVisibilityChange,
                onScrollActivityChange: onBeforeScrollActivityChange
            )
            #else
            Color.clear
            #endif
        case .after:
            #if os(iOS)
            IOSAfterPage()
            #else
            Color.clear
            #endif
        case .now:
            NowPage(isActive: isActive)
        }
    }
}

#if os(iOS)
private struct IOSBeforePage: View {
    let isChromeVisible: Bool
    let onChromeVisibilityChange: (Bool) -> Void
    let onScrollActivityChange: (Bool) -> Void

    @Environment(TimelineStore.self) private var timeline: TimelineStore
    @State private var presentedBriefing: CardRecord?

    private static let dayCount = 7

    var body: some View {
        Group {
            if case .failed(let message) = timeline.overviewState, loadedDays.isEmpty {
                ConnectionIssueView(message: message) {
                    Task { await reload() }
                }
            } else if loadedDays.isEmpty, timeline.overviewState != .ready {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                BeforeView(
                    days: loadedDays,
                    onOpenDailyBriefing: { briefing in
                        presentedBriefing = timeline.briefingCard(id: briefing.id)
                    },
                    isChromeVisible: isChromeVisible,
                    onChromeVisibilityChange: onChromeVisibilityChange,
                    onScrollActivityChange: onScrollActivityChange
                )
            }
        }
        .background(ReTurnDesign.Colors.screenBackground)
        .task { await reload() }
        .sheet(item: $presentedBriefing) { card in
            BriefingDetailView(card: card)
        }
    }

    private var loadedDays: [TimelineDay] {
        (0..<Self.dayCount).compactMap { offset in
            Calendar.autoupdatingCurrent
                .date(byAdding: .day, value: -offset, to: .now)
                .flatMap { timeline.day(for: $0) }
        }
        .filter { !$0.items.isEmpty }
    }

    private func reload() async {
        await timeline.refreshOverview()
        await timeline.loadRecentDays(count: Self.dayCount)
    }
}

private struct IOSAfterPage: View {
    @Environment(CardsStore.self) private var cards: CardsStore

    var body: some View {
        Group {
            if case .failed(let message) = cards.state, renderableCards.isEmpty {
                ConnectionIssueView(message: message) {
                    Task { await cards.refresh() }
                }
                .accessibilityIdentifier("after.page")
            } else if renderableCards.isEmpty, cards.state != .ready {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .accessibilityIdentifier("after.page")
            } else {
                AfterView(
                    todoSuggestions: todoSuggestions,
                    healthCards: healthCards,
                    ideas: ideas,
                    doneTodoIDs: cards.doneTodoIDs,
                    dismissedTodoIDs: cards.dismissedTodoIDs,
                    todoErrors: cards.todoErrors,
                    onTodoDone: { id in
                        Task { await cards.markTodoDone(id) }
                    },
                    onTodoAccept: { id, text in
                        Task { await cards.acceptTodo(id, text: text) }
                    },
                    onTodoDismiss: { id in
                        Task { await cards.dismissTodo(id) }
                    },
                    loadMoreID: cards.nextCursor,
                    onLoadMore: { await cards.loadNextPage() }
                )
            }
        }
        .background(ReTurnDesign.Colors.screenBackground)
        .task { await cards.monitor() }
    }

    private var renderableCards: [CardRecord] {
        cards.cards.filter { $0.content.isRenderable }
    }

    private var todoSuggestions: [TodoSuggestionCardContent] {
        renderableCards.compactMap { card in
            if case .todoSuggestion(let content) = card.content { content } else { nil }
        }
    }

    private var healthCards: [HealthCardContent] {
        renderableCards.compactMap { card in
            if case .health(let content) = card.content { content } else { nil }
        }
    }

    private var ideas: [IdeaCardContent] {
        renderableCards.compactMap { card in
            if case .idea(let content) = card.content { content } else { nil }
        }
    }
}
#endif
