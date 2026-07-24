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
        static let composerAccessorySize: CGFloat = 30
        static let composerAccessoryHitSize: CGFloat = 44

        /// Leading inset that keeps the enlarged transparent attachment hit
        /// target centred on the visible plus glyph inside the glass layer.
        static var composerAttachmentHitInset: CGFloat {
            composerHorizontalInset - (composerAccessoryHitSize - composerAccessorySize) / 2
        }
        static let mascotWidthRatio: CGFloat = 0.435
        static let mascotMinimumWidth: CGFloat = 150
        static let mascotMaximumWidth: CGFloat = 195
        static let mascotAspectRatio: CGFloat = 175 / 150
        static let heroOpticalLift: CGFloat = 38
        static let composerFallbackShadowRadius: CGFloat = 12
        static let composerFallbackShadowY: CGFloat = 4
    }

    /// Adaptive rules are expressed as a maximum width plus a screen inset, so
    /// views can apply them with `.frame(maxWidth:)` + `.padding(.horizontal:)`
    /// instead of measuring the container. Reading geometry here would rebuild
    /// the whole screen whenever the keyboard or the composer changes height.
    enum Layout {
        static func composerMaximumWidth(isFocused: Bool) -> CGFloat {
            isFocused
                ? Metrics.composerFocusedRegularMaxWidth
                : Metrics.composerRegularMaxWidth
        }

        static func composerHorizontalPadding(isFocused: Bool) -> CGFloat {
            isFocused
                ? Metrics.focusedScreenHorizontalInset
                : Metrics.screenHorizontalInset
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
