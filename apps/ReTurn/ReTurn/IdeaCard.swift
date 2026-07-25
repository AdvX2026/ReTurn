import SwiftUI

struct IdeaCard: View {
    let content: IdeaCardContent
    let onOpen: () -> Void

    init(
        content: IdeaCardContent,
        onOpen: @escaping () -> Void = {}
    ) {
        self.content = content
        self.onOpen = onOpen
    }

    var body: some View {
        Button(action: onOpen) {
            CardSurface {
                CardHeader(
                    icon: "lightbulb.fill",
                    title: "Idea",
                    tint: ReTurnDesign.Colors.Accents.idea,
                    detail: provenanceLabel
                )

                Text(content.text)
                    .font(ReTurnDesign.Typography.cardBody)
                    .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("after.idea.\(content.provenance.rawValue)")
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
