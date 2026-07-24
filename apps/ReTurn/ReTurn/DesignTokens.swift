import SwiftUI

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

enum ReTurnDesign {
    enum Colors {
        static let primaryLabel = Color.primary

        static var screenBackground: Color {
            #if os(iOS)
            Color(uiColor: .secondarySystemBackground)
            #elseif os(macOS)
            Color(nsColor: .windowBackgroundColor)
            #endif
        }

        static let voiceButtonBackground = Color.black
        static let voiceButtonForeground = Color.white
        static let composerFallbackShadow = Color.black.opacity(0.1)
    }

    enum Spacing {
        static let extraSmall: CGFloat = 4
        static let small: CGFloat = 8
        static let medium: CGFloat = 10
    }

    enum Metrics {
        static let navigationRegularMaxWidth: CGFloat = 520
        static let composerRegularMaxWidth: CGFloat = 640
        static let composerFocusedRegularMaxWidth: CGFloat = 680
        static let composerHeight: CGFloat = 50
        static let composerFocusedHeight: CGFloat = 56
        static let composerCornerRadius: CGFloat = 28
        static let composerMaximumLineCount = 5
        static let composerHorizontalInset: CGFloat = 17
        static let screenHorizontalInset: CGFloat = 20
        static let focusedScreenHorizontalInset: CGFloat = 12
        static let waveformButtonSize: CGFloat = 30
        static let mascotWidthRatio: CGFloat = 0.435
        static let mascotMinimumWidth: CGFloat = 150
        static let mascotMaximumWidth: CGFloat = 195
        static let mascotAspectRatio: CGFloat = 175 / 150
        static let heroOpticalLift: CGFloat = 38
        static let composerFallbackShadowRadius: CGFloat = 12
        static let composerFallbackShadowY: CGFloat = 4
    }

    enum Layout {
        static func navigationWidth(in containerWidth: CGFloat) -> CGFloat {
            contentWidth(
                in: containerWidth,
                horizontalInset: Metrics.screenHorizontalInset,
                maximumWidth: Metrics.navigationRegularMaxWidth
            )
        }

        static func composerWidth(
            in containerWidth: CGFloat,
            isFocused: Bool
        ) -> CGFloat {
            contentWidth(
                in: containerWidth,
                horizontalInset: isFocused
                    ? Metrics.focusedScreenHorizontalInset
                    : Metrics.screenHorizontalInset,
                maximumWidth: isFocused
                    ? Metrics.composerFocusedRegularMaxWidth
                    : Metrics.composerRegularMaxWidth
            )
        }

        static func mascotWidth(in containerWidth: CGFloat) -> CGFloat {
            min(
                max(
                    containerWidth * Metrics.mascotWidthRatio,
                    Metrics.mascotMinimumWidth
                ),
                Metrics.mascotMaximumWidth
            )
        }

        private static func contentWidth(
            in containerWidth: CGFloat,
            horizontalInset: CGFloat,
            maximumWidth: CGFloat
        ) -> CGFloat {
            min(max(containerWidth - horizontalInset * 2, 0), maximumWidth)
        }
    }

    enum Typography {
        static let heroTitle = Font.system(.title, design: .rounded, weight: .medium)
        static let composer = Font.body
    }

    enum Motion {
        static let composerResponse = 0.32
        static let composerDampingFraction = 0.84
    }
}
