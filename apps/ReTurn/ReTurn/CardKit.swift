import SwiftUI

/// The shared card shell, at the three levels the design calls for: group,
/// card, row. Every card type wears this shell and differs only in its main
/// visual — see `docs/prd-drift.md` §6.5 / §6.6.
///
/// Three rules taken from Apple Health, all easy to break by accident:
///
/// 1. **One accent per card**, on the header icon and title only. Colour
///    elsewhere needs fixed meaning (a chart legend, a status), never decoration.
/// 2. **A separator marks a change of content**, not the end of the header.
///    Health runs header → headline → separator → data.
/// 3. **Rows are regular weight**; primary vs secondary label carries the
///    hierarchy. Semibold everywhere reads as noise.
enum CardKit {}

// ── group ────────────────────────────────────────────────

/// A titled run of cards. The title is the section heading above the group
/// ("Summary" in the design), not the per-card header.
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

// ── card ─────────────────────────────────────────────────

struct Card<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.medium) {
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ReTurnDesign.Card.padding)
        .background(
            ReTurnDesign.Colors.cardBackground,
            in: RoundedRectangle(
                cornerRadius: ReTurnDesign.Card.cornerRadius,
                style: .continuous
            )
        )
    }
}

/// Tinted icon + title on the left, optional detail and a chevron on the right.
/// The chevron is not decoration: tappability is what separates a card (summary
/// layer) from the timeline (detail layer), per `docs/prd-drift.md` §6.0.
struct CardHeader: View {
    let icon: String
    let title: String
    let tint: Color
    var detail: String?
    var showsChevron = true

    var body: some View {
        HStack(spacing: ReTurnDesign.Spacing.small) {
            HStack(spacing: ReTurnDesign.Card.headerIconSpacing) {
                Image(systemName: icon)
                Text(title)
            }
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
            }
        }
    }
}

/// The plain-language conclusion that leads a card, the way Health opens with
/// "过去 7 天中，你的耳机音量平均值为正常。"
struct CardHeadline: View {
    let text: String

    var body: some View {
        Text(text)
            .font(ReTurnDesign.Typography.cardHeadline)
            .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
            .fixedSize(horizontal: false, vertical: true)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct CardDivider: View {
    var body: some View {
        Rectangle()
            .fill(ReTurnDesign.Colors.cardSeparator)
            .frame(height: 1)
    }
}

// ── rows ─────────────────────────────────────────────────

/// A run of rows separated by full-width rules, each padded so the rules sit in
/// real whitespace rather than hugging the text.
struct CardRows<Item, RowContent: View>: View {
    let items: [Item]
    @ViewBuilder let row: (Item) -> RowContent

    var body: some View {
        VStack(spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
                if index > 0 {
                    CardDivider()
                }

                row(item)
                    .padding(.vertical, ReTurnDesign.Card.rowVerticalPadding)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
    }
}

/// Name + value on one line, attribution copy underneath. Regular weight
/// throughout — primary vs secondary label does the separating.
struct CardMetricRow: View {
    let name: String
    var value: String?
    let caption: String
    var marker: Marker = .none

    /// A dot classifies (legend-style, like the sleep score's components); a
    /// symbol names a kind without tinting it. Neither should imply a verdict.
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
