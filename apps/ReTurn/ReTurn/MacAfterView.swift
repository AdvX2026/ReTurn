#if os(macOS)
import SwiftUI

/// macOS After: the suggestion stream (/api/cards, future direction) as an
/// adaptive grid. The iOS pager only has room for a single column; the
/// desktop window fits several, so cards flow the way Health's summary tiles
/// do instead of stacking.
struct MacAfterView: View {
    @Environment(CardsStore.self) private var cards: CardsStore

    private let columns = [
        GridItem(
            .adaptive(minimum: ReTurnDesign.Desktop.After.gridMinimumCardWidth),
            spacing: ReTurnDesign.Desktop.After.gridSpacing
        ),
    ]

    private var renderableCards: [CardRecord] {
        cards.cards.filter { $0.content.isRenderable }
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ReTurnDesign.Card.groupSpacing) {
                Text("After")
                    .font(ReTurnDesign.Typography.cardDisplayTitle)
                    .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                    .frame(maxWidth: .infinity, alignment: .leading)

                content
            }
            .padding(.horizontal, ReTurnDesign.Desktop.contentPadding)
            .padding(.vertical, ReTurnDesign.Desktop.contentPadding)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ReTurnDesign.Colors.screenBackground)
        .task { await cards.monitor() }
    }

    /// A refresh keeps the previous cards on screen; only the first load
    /// (or a failure with nothing cached) takes over the page.
    @ViewBuilder
    private var content: some View {
        if renderableCards.isEmpty {
            switch cards.state {
            case .failed(let message):
                ConnectionIssueView(message: message) {
                    Task { await cards.refresh() }
                }
                .frame(maxWidth: .infinity, minHeight: 320)
            case .idle, .loading:
                ProgressView()
                    .frame(maxWidth: .infinity, minHeight: 320)
            case .ready:
                ContentUnavailableView(
                    "No suggestions yet",
                    systemImage: "sparkles",
                    description: Text("Save today and ReTurn prepares tomorrow's todos, health advice and ideas here.")
                )
                .frame(maxWidth: .infinity, minHeight: 320)
            }
        } else {
            LazyVGrid(columns: columns, spacing: ReTurnDesign.Desktop.After.gridSpacing) {
                ForEach(renderableCards) { card in
                    AfterCardView(
                        card: card,
                        doneTodoIDs: cards.doneTodoIDs,
                        dismissedTodoIDs: cards.dismissedTodoIDs,
                        todoErrors: cards.todoErrors,
                        onTodoDone: { id in Task { await cards.markTodoDone(id) } },
                        onTodoAccept: { id, text in
                            Task { await cards.acceptTodo(id, text: text) }
                        },
                        onTodoDismiss: { id in Task { await cards.dismissTodo(id) } }
                    )
                }
            }

            if cards.canLoadMore {
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .task { await cards.loadNextPage() }
            }
        }
    }
}

#Preview("After · Light") {
    MacAfterView()
        .previewStores()
}

#Preview("After · Dark") {
    MacAfterView()
        .previewStores()
        .preferredColorScheme(.dark)
}
#endif
