import SwiftUI

struct TodoSuggestionCard: View {
    let content: TodoSuggestionCardContent
    let onOpen: (() -> Void)?
    let onAccept: ((String) -> Void)?

    init(
        content: TodoSuggestionCardContent,
        onOpen: (() -> Void)? = nil,
        onAccept: ((String) -> Void)? = nil
    ) {
        self.content = content
        self.onOpen = onOpen
        self.onAccept = onAccept
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
                    detail: content.todos.count.formatted(),
                    showsChevron: onOpen != nil
                )
                .contentShape(.rect)
            }
            .buttonStyle(.plain)
            .frame(minHeight: 44)
            .disabled(onOpen == nil)
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
                    let canAccept = todoID != nil && onAccept != nil
                    Button("采纳") {
                        guard let todoID, let onAccept else { return }
                        onAccept(todoID)
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
