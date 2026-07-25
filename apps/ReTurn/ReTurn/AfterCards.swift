import SwiftUI

/// The After page's product cards, shared between `CardGallery` (design
/// review) and the real desktop screen, so the shell is exercised exactly
/// once. Data arrives as plain values; fixtures and future stores both feed
/// the same initializers.

/// Main visual: an action per row -- the only card with a side effect
/// (accepting writes to Apple Reminders via EventKit).
struct TodoCard: View {
    let todos: [String]

    var body: some View {
        CardSurface {
            CardHeader(
                icon: "checklist",
                title: "Tomorrow",
                tint: ReTurnDesign.Colors.Accents.todo,
                detail: "\(todos.count)"
            )

            CardRows(items: todos) { todo in
                HStack(alignment: .firstTextBaseline, spacing: ReTurnDesign.Spacing.medium) {
                    Text(todo)
                        .font(ReTurnDesign.Typography.cardBody)
                        .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                        .fixedSize(horizontal: false, vertical: true)

                    Spacer(minLength: 0)

                    Button("采纳") {
                        // TODO: Write to Apple Reminders via EventKit.
                    }
                    .font(ReTurnDesign.Typography.cardBody)
                    .buttonStyle(.plain)
                    .foregroundStyle(ReTurnDesign.Colors.Accents.todo)
                }
            }
        }
    }
}

/// Main visual: a short advice line over the two real readings. F12 keeps
/// this card deliberately thin -- real data, minimal copy.
struct HealthCard: View {
    let advice: String
    let sleep: String
    let steps: String

    var body: some View {
        CardSurface {
            CardHeader(
                icon: "heart.fill",
                title: "Health",
                tint: ReTurnDesign.Colors.Accents.health
            )

            CardHeadline(text: advice)

            CardDivider()

            HStack(spacing: 0) {
                reading(name: "睡眠", value: sleep)
                reading(name: "步数", value: steps)
            }
            .padding(.top, ReTurnDesign.Spacing.extraSmall)
        }
    }

    private func reading(name: String, value: String) -> some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Card.rowTextSpacing) {
            Text(name)
                .font(ReTurnDesign.Typography.cardRowCaption)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)

            Text(value)
                .font(ReTurnDesign.Typography.cardHeadline)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

/// Main visual: the idea itself, with provenance as a quiet trailing label
/// -- F9 requires user-recorded and auto-extracted ideas to be distinct.
struct IdeaCard: View {
    let text: String
    let provenanceLabel: String

    var body: some View {
        CardSurface {
            CardHeader(
                icon: "lightbulb.fill",
                title: "Idea",
                tint: ReTurnDesign.Colors.Accents.idea,
                detail: provenanceLabel
            )

            Text(text)
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}
