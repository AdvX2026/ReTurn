import SwiftUI

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

/// Named system accent colors share their names across UIKit and AppKit; the
/// typealias picks the platform wrapper so `accent(for:)` stays single-coded.
#if os(iOS)
private typealias AccentColor = UIColor
#elseif os(macOS)
private typealias AccentColor = NSColor
#endif

enum TimelineDesign {
    enum Colors {
        // The grouped-background/fill family has no AppKit counterpart, so
        // these keep per-platform branches: window/control backgrounds play
        // the same layered roles on macOS, and fills become primary tints.
        static var pageBackground: Color {
            #if os(iOS)
            Color(uiColor: .systemGroupedBackground)
            #elseif os(macOS)
            Color(nsColor: .windowBackgroundColor)
            #endif
        }
        static var rail: Color {
            #if os(iOS)
            Color(uiColor: .systemGray4)
            #elseif os(macOS)
            Color(nsColor: .systemGray)
            #endif
        }
        static var eventCardBackground: Color {
            #if os(iOS)
            Color(uiColor: .secondarySystemGroupedBackground)
            #elseif os(macOS)
            Color(nsColor: .controlBackgroundColor)
            #endif
        }
        static var clusterPreviewBackground: Color {
            #if os(iOS)
            Color(uiColor: .quaternarySystemFill)
            #elseif os(macOS)
            Color.primary.opacity(0.05)
            #endif
        }
        static var ambient: Color {
            #if os(iOS)
            Color(uiColor: .systemGray3)
            #elseif os(macOS)
            Color(nsColor: .systemGray).opacity(0.6)
            #endif
        }
        static var briefingPressedFill: Color {
            #if os(iOS)
            Color(uiColor: .tertiarySystemFill)
            #elseif os(macOS)
            Color.primary.opacity(0.08)
            #endif
        }

        static func accent(for item: TimelineDisplayItem) -> Color {
            if item.presentation == .ambient {
                return ambient
            }

            if item.isUserInput {
                return switch item.category {
                case "voice":
                    Color(AccentColor.systemTeal)
                case "image":
                    Color(AccentColor.systemCyan)
                default:
                    Color(AccentColor.systemGreen)
                }
            }

            return switch item.kind {
            case .sleep:
                Color(AccentColor.systemIndigo)
            case .agent:
                Color(AccentColor.systemOrange)
            case .feed:
                switch item.category {
                case "voice":
                    Color(AccentColor.systemTeal)
                case "idea":
                    Color(AccentColor.systemOrange)
                case "image":
                    Color(AccentColor.systemCyan)
                case "reminder":
                    Color(AccentColor.systemGreen)
                case "text":
                    Color(AccentColor.systemGreen)
                default:
                    Color(AccentColor.systemTeal)
                }
            case .app:
                switch item.category {
                case "browser":
                    Color(AccentColor.systemBlue)
                case "dev":
                    Color(AccentColor.systemOrange)
                case "social":
                    Color(AccentColor.systemGreen)
                case "design":
                    Color(AccentColor.systemPurple)
                case "media":
                    Color(AccentColor.systemRed)
                case "notes":
                    Color(AccentColor.systemOrange)
                case "system":
                    Color(AccentColor.systemGray)
                default:
                    Color(AccentColor.systemTeal)
                }
            case .unknown:
                Color(AccentColor.systemGray)
            }
        }
    }

    enum Layout {
        static let contentHorizontalPadding: CGFloat = 20
        static let contentTopPadding: CGFloat = 18
        static let contentBottomPadding: CGFloat = 36
        static let daySpacing: CGFloat = 38
        static let dayHeaderBottomPadding: CGFloat = 18
        static let dailyBriefingTopSpacing: CGFloat = 4

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
        /// Desktop page header (e.g. the Before index column's "Before").
        static let pageTitle = Font.largeTitle.bold()
        /// Date line inside the desktop Before index rows.
        static let dayListDate = Font.body.weight(.medium)
        static let dayMetadata = Font.caption.weight(.semibold)
        static let eventCount = Font.caption.weight(.medium)
        static let eventCategory = Font.caption.weight(.semibold)
        static let eventMetadata = Font.caption
        static let eventTitle = Font.body.weight(.medium)
        static let eventCardTitle = Font.headline
        static let ambientEvent = Font.caption
        static let clusterPreviewEvent = Font.subheadline
        static let clusterPreviewMetadata = Font.caption
        static let dailyBriefingLabel = Font.caption
    }

    enum Interaction {
        static let inputHighlightCornerRadius: CGFloat = 14
        static let briefingHighlightCornerRadius: CGFloat = 12
        static let highlightHorizontalOutset: CGFloat = 6
        static let highlightVerticalOutset: CGFloat = 4
        static let pressedContentOpacity = 0.88
        static let inputPressedFillOpacity = 0.08
        static let pressAnimationDuration = 0.12
    }
}
