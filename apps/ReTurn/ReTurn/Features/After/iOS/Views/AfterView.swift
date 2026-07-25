#if os(iOS)
import SwiftUI

struct AfterView: View {
    let todoSuggestions: [TodoSuggestionCardContent]
    let healthCards: [HealthCardContent]
    let ideas: [IdeaCardContent]
    let doneTodoIDs: Set<String>
    let dismissedTodoIDs: Set<String>
    let todoErrors: [String: String]
    let onOpenTodo: (() -> Void)?
    let onTodoDone: ((String) -> Void)?
    let onTodoAccept: ((String, String) -> Void)?
    let onTodoDismiss: ((String) -> Void)?
    let onOpenHealth: (() -> Void)?
    let onOpenIdea: ((IdeaCardContent) -> Void)?
    let loadMoreID: String?
    let onLoadMore: (() async -> Void)?

    init(
        todoSuggestions: [TodoSuggestionCardContent],
        healthCards: [HealthCardContent],
        ideas: [IdeaCardContent],
        doneTodoIDs: Set<String> = [],
        dismissedTodoIDs: Set<String> = [],
        todoErrors: [String: String] = [:],
        onOpenTodo: (() -> Void)? = nil,
        onTodoDone: ((String) -> Void)? = nil,
        onTodoAccept: ((String, String) -> Void)? = nil,
        onTodoDismiss: ((String) -> Void)? = nil,
        onOpenHealth: (() -> Void)? = nil,
        onOpenIdea: ((IdeaCardContent) -> Void)? = nil,
        loadMoreID: String? = nil,
        onLoadMore: (() async -> Void)? = nil
    ) {
        self.todoSuggestions = todoSuggestions
        self.healthCards = healthCards
        self.ideas = ideas
        self.doneTodoIDs = doneTodoIDs
        self.dismissedTodoIDs = dismissedTodoIDs
        self.todoErrors = todoErrors
        self.onOpenTodo = onOpenTodo
        self.onTodoDone = onTodoDone
        self.onTodoAccept = onTodoAccept
        self.onTodoDismiss = onTodoDismiss
        self.onOpenHealth = onOpenHealth
        self.onOpenIdea = onOpenIdea
        self.loadMoreID = loadMoreID
        self.onLoadMore = onLoadMore
    }

    init(
        todoSuggestion: TodoSuggestionCardContent?,
        health: HealthCardContent?,
        ideas: [IdeaCardContent]
    ) {
        self.init(
            todoSuggestions: todoSuggestion.map { [$0] } ?? [],
            healthCards: health.map { [$0] } ?? [],
            ideas: ideas
        )
    }

    var body: some View {
        ZStack {
            ReTurnDesign.Colors.screenBackground

            if hasContent {
                ScrollView {
                    LazyVStack(
                        alignment: .leading,
                        spacing: ReTurnDesign.Card.groupSpacing
                    ) {
                        if hasSuggestions {
                            CardGroup("Suggestions") {
                                ForEach(todoSuggestions.indices, id: \.self) { index in
                                    TodoSuggestionCard(
                                        content: todoSuggestions[index],
                                        doneTodoIDs: doneTodoIDs,
                                        dismissedTodoIDs: dismissedTodoIDs,
                                        todoErrors: todoErrors,
                                        onOpen: onOpenTodo,
                                        onDone: onTodoDone,
                                        onAccept: onTodoAccept,
                                        onDismiss: onTodoDismiss
                                    )
                                }

                                ForEach(healthCards.indices, id: \.self) { index in
                                    HealthAdviceCard(
                                        content: healthCards[index],
                                        onOpen: onOpenHealth
                                    )
                                }
                            }
                        }

                        if !ideas.isEmpty {
                            CardGroup("Ideas") {
                                ForEach(ideas.indices, id: \.self) { index in
                                    IdeaCard(
                                        content: ideas[index],
                                        onOpen: onOpenIdea
                                    )
                                }
                            }
                        }

                        if let loadMoreID {
                            Color.clear
                                .frame(height: 1)
                                .accessibilityHidden(true)
                                .task(id: loadMoreID) {
                                    if let onLoadMore {
                                        await onLoadMore()
                                    }
                                }
                        }
                    }
                }
                .contentMargins(
                    .horizontal,
                    ReTurnDesign.Metrics.screenHorizontalInset,
                    for: .scrollContent
                )
                .contentMargins(
                    .top,
                    ReTurnDesign.Metrics.mainContentTopPadding,
                    for: .scrollContent
                )
                .contentMargins(
                    .bottom,
                    ReTurnDesign.Card.pageBottomPadding,
                    for: .scrollContent
                )
                .scrollIndicators(.hidden)
            } else {
                ContentUnavailableView(
                    "Nothing waiting yet",
                    systemImage: "sparkles",
                    description: Text(
                        "Suggestions and ideas will appear after your next Save."
                    )
                )
            }
        }
        .accessibilityIdentifier("after.page")
    }

    private var hasSuggestions: Bool {
        !todoSuggestions.isEmpty || !healthCards.isEmpty
    }

    private var hasContent: Bool {
        hasSuggestions || !ideas.isEmpty
    }
}

#Preview("After · Light") {
    AfterView(
        todoSuggestion: AfterPreviewData.todoSuggestion,
        health: AfterPreviewData.health,
        ideas: AfterPreviewData.ideas
    )
}

#Preview("After · Dark") {
    AfterView(
        todoSuggestion: AfterPreviewData.todoSuggestion,
        health: AfterPreviewData.health,
        ideas: AfterPreviewData.ideas
    )
    .preferredColorScheme(.dark)
}
#endif
