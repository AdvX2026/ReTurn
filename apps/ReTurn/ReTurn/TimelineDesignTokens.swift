#if os(iOS)
import SwiftUI

enum TimelineDesign {
    enum Colors {
        static let pageBackground = Color(uiColor: .systemGroupedBackground)
        static let rail = Color(uiColor: .systemGray4)
        static let eventCardBackground = Color(uiColor: .secondarySystemGroupedBackground)
        static let clusterPreviewBackground = Color(uiColor: .quaternarySystemFill)
        static let ambient = Color(uiColor: .systemGray3)

        static func accent(for item: TimelineDisplayItem) -> Color {
            if item.presentation == .ambient {
                return ambient
            }

            return switch item.kind {
            case .sleep:
                Color(uiColor: .systemIndigo)
            case .agent:
                Color(uiColor: .systemOrange)
            case .feed:
                switch item.category {
                case "voice":
                    Color(uiColor: .systemTeal)
                case "idea":
                    Color(uiColor: .systemOrange)
                case "image":
                    Color(uiColor: .systemCyan)
                case "reminder":
                    Color(uiColor: .systemGreen)
                case "text":
                    Color(uiColor: .systemGreen)
                default:
                    Color(uiColor: .systemTeal)
                }
            case .app:
                switch item.category {
                case "browser":
                    Color(uiColor: .systemBlue)
                case "dev":
                    Color(uiColor: .systemOrange)
                case "social":
                    Color(uiColor: .systemGreen)
                case "design":
                    Color(uiColor: .systemPurple)
                case "media":
                    Color(uiColor: .systemRed)
                case "notes":
                    Color(uiColor: .systemOrange)
                case "system":
                    Color(uiColor: .systemGray)
                default:
                    Color(uiColor: .systemTeal)
                }
            case .unknown:
                Color(uiColor: .systemGray)
            }
        }
    }

    enum Layout {
        static let contentHorizontalPadding: CGFloat = 20
        static let contentTopPadding: CGFloat = 18
        static let contentBottomPadding: CGFloat = 36
        static let daySpacing: CGFloat = 38
        static let dayHeaderBottomPadding: CGFloat = 18

        static let railWidth: CGFloat = 48
        static let railAxisX: CGFloat = 12
        static let pointAnchorY: CGFloat = 30
        static let rangeInset: CGFloat = 8
        static let connectorEndInset: CGFloat = 6
        static let ambientConnectorEndInset: CGFloat = 18
        static let axisWidth: CGFloat = 2
        static let pointDiameter: CGFloat = 8
        static let pointRingDiameter: CGFloat = 14
        static let ambientPointDiameter: CGFloat = 4
        static let rangeBandWidth: CGFloat = 7
        static let majorRangeBandWidth: CGFloat = 9

        static let ambientMinimumHeight: CGFloat = 28
        static let pointMinimumHeight: CGFloat = 72
        static let spanMinimumHeight: CGFloat = 108
        static let majorMinimumHeight: CGFloat = 156
        static let eventBottomSpacing: CGFloat = 10
        static let ambientContentSpacing: CGFloat = 5

        static let eventCardCornerRadius: CGFloat = 22
        static let eventCardPadding: CGFloat = 16
        static let eventCardSpacing: CGFloat = 12
        static let clusterPreviewCornerRadius: CGFloat = 12
        static let clusterPreviewHorizontalPadding: CGFloat = 10
        static let clusterRowSpacing: CGFloat = 8
        static let clusterRowVerticalPadding: CGFloat = 7
        static let clusterSymbolWidth: CGFloat = 14
        static let clusterDividerLeadingPadding: CGFloat = 22

        static func minimumHeight(
            for presentation: TimelineDisplayItem.Presentation
        ) -> CGFloat {
            switch presentation {
            case .ambient:
                ambientMinimumHeight
            case .point:
                pointMinimumHeight
            case .span:
                spanMinimumHeight
            case .major:
                majorMinimumHeight
            }
        }

        static func bottomSpacing(
            for presentation: TimelineDisplayItem.Presentation
        ) -> CGFloat {
            presentation == .ambient ? 2 : eventBottomSpacing
        }
    }

    enum Typography {
        static let day = Font.title2.bold()
        static let dayMetadata = Font.caption.weight(.semibold)
        static let eventCount = Font.caption.weight(.medium)
        static let eventCategory = Font.caption.weight(.semibold)
        static let eventMetadata = Font.caption
        static let eventTitle = Font.body.weight(.medium)
        static let eventCardTitle = Font.headline
        static let ambientEvent = Font.caption
        static let clusterPreviewEvent = Font.subheadline
        static let clusterPreviewMetadata = Font.caption
    }
}
#endif
