import SwiftUI

/// A run of rows separated by full-width rules, each padded so the rules sit in
/// real whitespace rather than hugging the text.
///
/// Per-row padding is a token rather than a constant here because it has to be
/// tuned to the row count — five stats at the spacing Apple uses for the sleep
/// score's three rows stretches the card out (`docs/prd-drift.md` §6.6.2).
struct CardRows<Item, RowContent: View>: View {
    let items: [Item]
    @ViewBuilder let row: (Item) -> RowContent

    var body: some View {
        VStack(spacing: 0) {
            // `Array(_:)` is required until `EnumeratedSequence` conforms to
            // `Collection` (Swift 6.2); this project builds at Swift 5 / iOS 17.
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
