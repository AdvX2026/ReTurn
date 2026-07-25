import SwiftUI

struct TodoSuggestionCard: View {
    let content: TodoSuggestionCardContent
    let onOpen: () -> Void
    let onAccept: (String) -> Void

    init(
        content: TodoSuggestionCardContent,
        onOpen: @escaping () -> Void = {},
        onAccept: @escaping (String) -> Void = { _ in }
    ) {
        self.content = content
        self.onOpen = onOpen
        self.onAccept = onAccept
    }

    var body: some View {
        CardSurface {
            Button(action: onOpen) {
                CardHeader(
                    icon: "checklist",
                    title: "Tomorrow",
                    tint: ReTurnDesign.Colors.Accents.todo,
                    detail: content.todos.count.formatted()
                )
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .accessibilityIdentifier("after.todo.open")

            CardRows(items: Array(content.todos.enumerated())) { item in
                HStack(
                    alignment: .firstTextBaseline,
                    spacing: ReTurnDesign.Spacing.medium
                ) {
                    Text(item.element)
                        .font(ReTurnDesign.Typography.cardBody)
                        .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 0)

                    let todoID = todoID(at: item.offset)
                    Button("采纳") {
                        guard let todoID else { return }
                        onAccept(todoID)
                    }
                    .font(ReTurnDesign.Typography.cardBody)
                    .buttonStyle(.plain)
                    .foregroundStyle(
                        todoID == nil
                            ? ReTurnDesign.Colors.secondaryLabel
                            : ReTurnDesign.Colors.Accents.todo
                    )
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(.rect)
                    .disabled(todoID == nil)
                    .accessibilityLabel("采纳：\(item.element)")
                    .accessibilityIdentifier("after.todo.accept.\(item.offset)")
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
}
