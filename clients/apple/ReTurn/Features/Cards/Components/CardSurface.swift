import SwiftUI

/// The white rounded surface every card is built on.
///
/// Named for the surface rather than the concept, because `CardType` and
/// `CardRecord` in `Models.swift` are the *data* side of "card" — this is only
/// the container they get rendered into. One backend record can produce several
/// of these; see `docs/prd-drift.md` §6.1.
///
/// The shell has three levels — group (`CardGroup`), card (this), row
/// (`CardMetricRow`) — and every card type differs only in its main visual.
/// Three rules from Apple Health govern that, all easy to break by accident:
///
/// 1. **One accent per card**, on the header icon and title only. Colour inside
///    the card must classify (legend-style) and never judge — see `Accents` and
///    `docs/prd-drift.md` §6.6.1.
/// 2. **A separator marks a change of content**, not the end of a header.
///    Health runs header → headline → separator → data, and a card with nothing
///    after its headline carries no rule at all.
/// 3. **Rows are regular weight**; primary vs secondary label carries the
///    hierarchy. Semibold everywhere flattens it into noise.
struct CardSurface<Content: View>: View {
    @ViewBuilder let content: Content

    var body: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.medium) {
            content
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ReTurnDesign.Card.padding)
        .background(
            ReTurnDesign.Colors.cardBackground,
            in: RoundedRectangle(cornerRadius: ReTurnDesign.Card.cornerRadius)
        )
    }
}
