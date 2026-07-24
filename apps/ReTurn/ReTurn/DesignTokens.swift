import SwiftUI

#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

enum ReTurnDesign {
    enum Colors {
        static let primaryLabel = Color.primary
        static let secondaryLabel = Color.secondary

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

        /// Cards sit on `screenBackground`, so they take the plain system
        /// background to read as raised white surfaces.
        static var cardBackground: Color {
            #if os(iOS)
            Color(uiColor: .systemBackground)
            #elseif os(macOS)
            Color(nsColor: .controlBackgroundColor)
            #endif
        }

        static var cardNestedBackground: Color {
            #if os(iOS)
            Color(uiColor: .secondarySystemBackground)
            #elseif os(macOS)
            Color(nsColor: .underPageBackgroundColor)
            #endif
        }

        static let cardSeparator = Color.primary.opacity(0.08)

        /// PLACEHOLDER accent palette — the product side has not allocated the
        /// shared palette yet (it must not collide with the Before timeline's
        /// categories). Every accent below is referenced only through
        /// `Accents`, so swapping in the real palette is a one-file change.
        enum Accents {
            static let intake = Color.blue
            static let focus = Color.indigo
            static let output = Color.orange
            static let continuity = Color.green
            static let energy = Color.pink

            static let brief = Color.blue
            static let review = Color.purple
            static let todo = Color.orange
            static let health = Color.pink
            static let idea = Color.yellow
            static let unknown = Color.secondary
        }
    }

    enum Spacing {
        static let extraSmall: CGFloat = 4
        static let small: CGFloat = 8
        static let medium: CGFloat = 10
        static let large: CGFloat = 24
    }

    enum Metrics {
        /// Resting opacity of the timeline navigation once a page settles. It
        /// dims rather than disappears so the current page stays readable and
        /// the labels stay tappable.
        static let navigationDimmedOpacity: Double = 0.3
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

        /// Padding that grows the attachment button's touch target to
        /// `composerAccessoryHitSize`; cancelled by an equal negative padding so
        /// the glyph keeps its layout footprint.
        static var composerAccessoryHitPadding: CGFloat {
            (composerAccessoryHitSize - composerAccessorySize) / 2
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
        static let navigationItem = Font.body

        /// Card scale, mirroring Apple Health: a small tinted header, a large
        /// plain-language headline, then rows of name + value + caption.
        static let cardGroupTitle = Font.title2.weight(.bold)
        static let cardHeader = Font.subheadline.weight(.semibold)
        static let cardHeadline = Font.title3.weight(.semibold)
        static let cardBody = Font.body
        static let cardRowName = Font.subheadline.weight(.semibold)
        static let cardRowValue = Font.subheadline.weight(.semibold)
        static let cardRowCaption = Font.subheadline
        static let cardDisplayTitle = Font.largeTitle.weight(.bold)
        static let cardTag = Font.caption.weight(.semibold)
    }

    enum Card {
        static let cornerRadius: CGFloat = 20
        static let nestedCornerRadius: CGFloat = 12
        static let padding: CGFloat = 16
        /// Between cards inside one group.
        static let spacing: CGFloat = 12
        /// Between card groups.
        static let groupSpacing: CGFloat = 28
        static let headerIconSpacing: CGFloat = 5
        static let rowSpacing: CGFloat = 14
        static let rowTextSpacing: CGFloat = 2
        static let dotSize: CGFloat = 9
        static let tagHorizontalPadding: CGFloat = 9
        static let tagVerticalPadding: CGFloat = 4
        static let mascotWidth: CGFloat = 132
    }

    enum Motion {
        static let composerResponse = 0.32
        static let composerDampingFraction = 0.84
        static let navigationSelectionDuration = 0.25
        /// How long the navigation stays at full strength after a page settles.
        static let navigationDimDelay = 1.5
        static let navigationDimDuration = 0.45
    }
}
