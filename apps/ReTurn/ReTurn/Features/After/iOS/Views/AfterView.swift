#if os(iOS)
import SwiftUI

struct AfterView: View {
    let todoSuggestion: TodoSuggestionCardContent?
    let health: HealthCardContent?
    let ideas: [IdeaCardContent]
    let onOpenTodo: (() -> Void)?
    let onAcceptTodo: ((String) -> Void)?
    let onOpenHealth: (() -> Void)?
    let onOpenIdea: ((IdeaCardContent) -> Void)?

    init(
        todoSuggestion: TodoSuggestionCardContent?,
        health: HealthCardContent?,
        ideas: [IdeaCardContent],
        onOpenTodo: (() -> Void)? = nil,
        onAcceptTodo: ((String) -> Void)? = nil,
        onOpenHealth: (() -> Void)? = nil,
        onOpenIdea: ((IdeaCardContent) -> Void)? = nil
    ) {
        self.todoSuggestion = todoSuggestion
        self.health = health
        self.ideas = ideas
        self.onOpenTodo = onOpenTodo
        self.onAcceptTodo = onAcceptTodo
        self.onOpenHealth = onOpenHealth
        self.onOpenIdea = onOpenIdea
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
                                if let todoSuggestion, !todoSuggestion.todos.isEmpty {
                                    TodoSuggestionCard(
                                        content: todoSuggestion,
                                        onOpen: onOpenTodo,
                                        onAccept: onAcceptTodo
                                    )
                                }

                                if let health {
                                    HealthAdviceCard(
                                        content: health,
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
                    }
                }
                .contentMargins(
                    .horizontal,
                    ReTurnDesign.Metrics.screenHorizontalInset,
                    for: .scrollContent
                )
                .contentMargins(
                    .top,
                    ReTurnDesign.Spacing.large,
                    for: .scrollContent
                )
                .contentMargins(
                    .bottom,
                    ReTurnDesign.Card.pageBottomPadding,
                    for: .scrollContent
                )
                .scrollIndicators(.hidden)
                .accessibilityIdentifier("after.page")
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
    }

    private var hasSuggestions: Bool {
        guard let todoSuggestion else {
            return health != nil
        }
        return !todoSuggestion.todos.isEmpty || health != nil
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
