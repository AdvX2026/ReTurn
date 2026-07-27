import SwiftUI

/// The plain-language conclusion that leads a card, the way Health opens with
/// "过去 7 天中，你的耳机音量平均值为正常。"
///
/// A card that ends here takes no separator — the rule below a headline means
/// "data follows", not "header ended".
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
