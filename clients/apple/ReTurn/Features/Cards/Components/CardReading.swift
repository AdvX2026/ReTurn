import SwiftUI

struct CardReading: View {
    let name: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Card.rowTextSpacing) {
            Text(name)
                .font(ReTurnDesign.Typography.cardRowCaption)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)

            Text(value)
                .font(ReTurnDesign.Typography.cardHeadline)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .monospacedDigit()
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}
