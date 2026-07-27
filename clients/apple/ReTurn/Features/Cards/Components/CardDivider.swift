import SwiftUI

/// A hairline rule across a card's content width.
///
/// Not `Divider()`, whose thickness and inset are managed by the enclosing
/// container and vary between a card body and a `List` row; a card needs it to
/// span the padded content edge to edge, consistently.
struct CardDivider: View {
    var body: some View {
        Rectangle()
            .fill(ReTurnDesign.Colors.cardSeparator)
            .frame(height: 1)
    }
}
