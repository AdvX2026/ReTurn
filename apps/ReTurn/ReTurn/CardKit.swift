import SwiftUI

/// The shared card shell, at the three levels the design calls for: group,
/// card, row. Every card type wears this shell and differs only in its main
/// visual — see `docs/prd-drift.md` §6.5 / §6.6.
///
/// Accent colours come from `ReTurnDesign.Colors.Accents`, which is still a
/// placeholder palette; nothing here hardcodes a colour.
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

struct CardDivider: View {
    var body: some View {
        Rectangle()
            .fill(ReTurnDesign.Colors.cardSeparator)
            .frame(height: 1)
    }
}

// ── row ──────────────────────────────────────────────────

/// The shared detail row: marker + name + value, with the attribution copy
/// underneath. Used by the five stats, review points and health readings alike.
struct CardMetricRow: View {
    let color: Color
    let name: String
    var value: String?
    let caption: String
    var marker: Marker = .dot

    enum Marker {
        case dot
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
        case .dot:
            Circle()
                .fill(color)
                .frame(
                    width: ReTurnDesign.Card.dotSize,
                    height: ReTurnDesign.Card.dotSize
                )
        case let .symbol(name):
            Image(systemName: name)
                .font(ReTurnDesign.Typography.cardRowName)
                .foregroundStyle(color)
                .frame(width: ReTurnDesign.Card.dotSize)
        }
    }

    /// Keeps the caption aligned with the name rather than the marker.
    private var captionInset: CGFloat {
        ReTurnDesign.Card.dotSize + ReTurnDesign.Spacing.small
    }
}

/// Small pill used for the character state and the idea provenance.
struct CardTag: View {
    let text: String
    let tint: Color

    var body: some View {
        Text(text)
            .font(ReTurnDesign.Typography.cardTag)
            .foregroundStyle(tint)
            .padding(.horizontal, ReTurnDesign.Card.tagHorizontalPadding)
            .padding(.vertical, ReTurnDesign.Card.tagVerticalPadding)
            .background(tint.opacity(0.14), in: Capsule())
    }
}
