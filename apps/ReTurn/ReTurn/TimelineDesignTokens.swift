#if os(iOS)
import SwiftUI

enum TimelineDesign {
    enum Colors {
        static let eventCardBackground = Color(uiColor: .tertiarySystemBackground)
        static let eventCardBorder = Color(uiColor: .separator)
    }

    enum Layout {
        static let contentHorizontalPadding: CGFloat = 20
        static let contentTopPadding: CGFloat = 18
        static let contentBottomPadding: CGFloat = 36
        static let daySpacing: CGFloat = 38
        static let dayHeaderBottomPadding: CGFloat = 18

        static let railWidth: CGFloat = 52
        static let railAxisX: CGFloat = 14
        static let pointAnchorY: CGFloat = 28
        static let rangeInset: CGFloat = 10
        static let connectorEndInset: CGFloat = 7
        static let rangeBandWidth: CGFloat = 3
        static let majorRangeBandWidth: CGFloat = 4

        static let pointMinimumHeight: CGFloat = 78
        static let spanMinimumHeight: CGFloat = 108
        static let majorMinimumHeight: CGFloat = 156
        static let eventBottomSpacing: CGFloat = 14

        static let eventCardCornerRadius: CGFloat = 18
        static let eventCardPadding: CGFloat = 16
        static let eventCardSpacing: CGFloat = 14

        static func minimumHeight(
            for presentation: TimelineDisplayItem.Presentation
        ) -> CGFloat {
            switch presentation {
            case .point:
                pointMinimumHeight
            case .span:
                spanMinimumHeight
            case .major:
                majorMinimumHeight
            }
        }
    }

    enum Typography {
        static let day = Font.title3.monospaced().bold()
        static let dayMetadata = Font.footnote.monospaced()
        static let eventMetadata = Font.footnote.monospaced()
        static let eventTitle = Font.body
        static let eventCardTitle = Font.headline
    }
}
#endif
