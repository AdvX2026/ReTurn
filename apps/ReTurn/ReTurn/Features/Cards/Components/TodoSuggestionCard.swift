import SwiftUI

struct TodoSuggestionCard: View {
    let content: TodoSuggestionCardContent
    let doneTodoIDs: Set<String>
    let dismissedTodoIDs: Set<String>
    let todoErrors: [String: String]
    let onOpen: (() -> Void)?
    let onDone: ((String) -> Void)?
    let onAccept: ((String, String) -> Void)?
    let onDismiss: ((String) -> Void)?

    init(
        content: TodoSuggestionCardContent,
        doneTodoIDs: Set<String> = [],
        dismissedTodoIDs: Set<String> = [],
        todoErrors: [String: String] = [:],
        onOpen: (() -> Void)? = nil,
        onDone: ((String) -> Void)? = nil,
        onAccept: ((String, String) -> Void)? = nil,
        onDismiss: ((String) -> Void)? = nil
    ) {
        self.content = content
        self.doneTodoIDs = doneTodoIDs
        self.dismissedTodoIDs = dismissedTodoIDs
        self.todoErrors = todoErrors
        self.onOpen = onOpen
        self.onDone = onDone
        self.onAccept = onAccept
        self.onDismiss = onDismiss
    }

    var body: some View {
        CardSurface {
            Button {
                onOpen?()
            } label: {
                CardHeader(
                    icon: "checklist",
                    title: "Tomorrow",
                    tint: ReTurnDesign.Colors.Accents.todo,
                    detail: visibleItems.count.formatted(),
                    showsChevron: onOpen != nil
                )
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .disabled(onOpen == nil)
            .accessibilityIdentifier("after.todo.open")

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

    func todoID(at index: Int) -> String? {
        guard content.todoIds.indices.contains(index) else {
            return nil
        }

        let id = content.todoIds[index]
        return id.isEmpty ? nil : id
    }

    private var visibleItems: [(index: Int, text: String, id: String?)] {
        content.todos.enumerated().compactMap { index, text in
            let id = todoID(at: index)
            let isVisible = id.map {
                #if os(iOS)
                !dismissedTodoIDs.contains($0) && !doneTodoIDs.contains($0)
                #else
                !dismissedTodoIDs.contains($0)
                #endif
            } ?? true
            guard isVisible else {
                return nil
            }
            return (index: index, text: text, id: id)
        }
    }

    @ViewBuilder
    private func row(for item: (index: Int, text: String, id: String?)) -> some View {
        #if os(iOS)
        HStack(alignment: .firstTextBaseline, spacing: ReTurnDesign.Spacing.medium) {
            Text(item.text)
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            let canAccept = item.id != nil && onAccept != nil
            Button("采纳") {
                guard let id = item.id, let onAccept else { return }
                onAccept(id, item.text)
            }
            .font(ReTurnDesign.Typography.cardBody)
            .buttonStyle(.plain)
            .foregroundStyle(
                canAccept
                    ? ReTurnDesign.Colors.Accents.todo
                    : ReTurnDesign.Colors.secondaryLabel
            )
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(.rect)
            .disabled(!canAccept)
            .accessibilityLabel("采纳：\(item.text)")
            .accessibilityIdentifier("after.todo.accept.\(item.index)")
        }
        #else
        let isDone = item.id.map(doneTodoIDs.contains) ?? false

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
                } else if let id = item.id {
                    if let onDone {
                        Button("Mark done", systemImage: "checkmark") {
                            onDone(id)
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                        .foregroundStyle(ReTurnDesign.Colors.Accents.todo)
                    }

                    if let onAccept {
                        Button("Add to Reminders", systemImage: "checklist") {
                            onAccept(id, item.text)
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                        .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                        .accessibilityIdentifier("after.todo.accept.\(item.index)")
                    }

                    if let onDismiss {
                        Button("Dismiss", systemImage: "xmark") {
                            onDismiss(id)
                        }
                        .labelStyle(.iconOnly)
                        .buttonStyle(.plain)
                        .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    }
                }
            }

            if let id = item.id, let error = todoErrors[id] {
                Text(error)
                    .font(ReTurnDesign.Typography.cardRowCaption)
                    .foregroundStyle(.red)
            }
        }
        #endif
    }
}
