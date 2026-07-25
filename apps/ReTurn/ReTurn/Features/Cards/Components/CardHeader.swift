import SwiftUI

/// Tinted icon + title on the left, optional detail and a chevron on the right.
///
/// This is the card's **only** licensed use of its accent colour. The chevron is
/// not decoration either: tappability is what separates a card (summary layer)
/// from the timeline (detail layer), per `docs/prd-drift.md` §6.0.
struct CardHeader: View {
    let icon: String
    let title: String
    let tint: Color
    var detail: String?
    var showsChevron = true

    var body: some View {
        HStack(spacing: ReTurnDesign.Spacing.small) {
            Label(title, systemImage: icon)
                .labelStyle(.titleAndIcon)
                .font(ReTurnDesign.Typography.cardHeader)
                .foregroundStyle(tint)

            Spacer(minLength: ReTurnDesign.Spacing.small)

            if let detail {
                Text(detail)
                    .font(ReTurnDesign.Typography.cardHeader)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
            }

            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(ReTurnDesign.Typography.cardHeader)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    // Decorative: the card itself carries the tap target, so
                    // VoiceOver should not announce "chevron.right".
                    .accessibilityHidden(true)
            }
        }
    }
}
