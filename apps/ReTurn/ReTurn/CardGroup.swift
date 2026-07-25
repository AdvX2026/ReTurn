import SwiftUI

/// A titled run of cards. The title is the section heading *above* the group
/// ("Summary" in the design), not a card's own header — one backend record can
/// render as several cards under one group, per `docs/prd-drift.md` §6.1.
struct CardGroup<Content: View>: View {
    let title: String?
    @ViewBuilder let content: Content

    init(_ title: String? = nil, @ViewBuilder content: () -> Content) {
        self.title = title
        self.content = content()
    }

    var body: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Card.spacing) {
            if let title {
                Text(title)
                    .font(ReTurnDesign.Typography.cardGroupTitle)
                    .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
            }

            content
        }
    }
}
