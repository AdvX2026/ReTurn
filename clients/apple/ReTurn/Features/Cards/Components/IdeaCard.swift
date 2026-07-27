import SwiftUI

struct IdeaCard: View {
    let content: IdeaCardContent
    let onOpen: ((IdeaCardContent) -> Void)?

    init(
        content: IdeaCardContent,
        onOpen: ((IdeaCardContent) -> Void)? = nil
    ) {
        self.content = content
        self.onOpen = onOpen
    }

    var body: some View {
        Group {
            if let onOpen {
                Button {
                    onOpen(content)
                } label: {
                    cardContent
                }
                .buttonStyle(.plain)
                .accessibilityIdentifier("after.idea.\(content.provenance.rawValue)")
            } else {
                cardContent
                    .accessibilityIdentifier("after.idea.\(content.provenance.rawValue)")
            }
        }
    }

    private var cardContent: some View {
        CardSurface {
            CardHeader(
                icon: "lightbulb.fill",
                title: "Idea",
                tint: ReTurnDesign.Colors.Accents.idea,
                detail: provenanceLabel,
                showsChevron: onOpen != nil
            )

            Text(content.text)
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var provenanceLabel: String {
        switch content.provenance {
        case .user:
            "我记的"
        case .auto:
            "它帮我记的"
        }
    }
}
