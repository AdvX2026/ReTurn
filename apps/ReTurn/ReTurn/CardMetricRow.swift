import SwiftUI

/// Name + value on one line, attribution copy underneath. Regular weight
/// throughout — primary vs secondary label does the separating, not font weight.
///
/// Shared by the five stats, review points and health readings, which is what
/// keeps those cards recognisably one system while their main visuals differ.
struct CardMetricRow: View {
    let name: String
    var value: String?
    let caption: String
    var marker: Marker = .none

    /// A dot **classifies** — legend-style, like the sleep score tinting its
    /// three components. A symbol names a kind without tinting it, for cases
    /// where colour would read as a verdict (`docs/prd-drift.md` §6.6.1).
    enum Marker {
        case none
        case dot(Color)
        case symbol(String)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Card.rowTextSpacing) {
            HStack(spacing: ReTurnDesign.Spacing.small) {
                markerView

                Text(name)
                    .font(ReTurnDesign.Typography.cardRowName)
                    .foregroundStyle(ReTurnDesign.Colors.primaryLabel)

                Spacer(minLength: ReTurnDesign.Spacing.small)

                if let value {
                    Text(value)
                        .font(ReTurnDesign.Typography.cardRowValue)
                        .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                        .monospacedDigit()
                }
            }

            Text(caption)
                .font(ReTurnDesign.Typography.cardRowCaption)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, captionInset)
        }
    }

    @ViewBuilder
    private var markerView: some View {
        switch marker {
        case .none:
            EmptyView()
        case let .dot(color):
            Circle()
                .fill(color)
                .frame(
                    width: ReTurnDesign.Card.dotSize,
                    height: ReTurnDesign.Card.dotSize
                )
        case let .symbol(name):
            Image(systemName: name)
                .font(ReTurnDesign.Typography.cardRowName)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                .frame(width: ReTurnDesign.Card.dotSize)
        }
    }

    /// Keeps the caption aligned with the name rather than the marker.
    private var captionInset: CGFloat {
        switch marker {
        case .none: 0
        case .dot, .symbol: ReTurnDesign.Card.dotSize + ReTurnDesign.Spacing.small
        }
    }
}
