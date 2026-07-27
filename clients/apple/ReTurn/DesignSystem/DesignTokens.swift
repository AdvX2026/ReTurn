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
            Color(uiColor: .systemGroupedBackground)
            #elseif os(macOS)
            Color(nsColor: .windowBackgroundColor)
            #endif
        }

        /// Keeps the navigation readability gradient continuous with every
        /// Main page instead of introducing a separate background shade.
        static var navigationBackdrop: Color {
            screenBackground
        }

        static let voiceButtonBackground = Color.black
        static let voiceButtonForeground = Color.white
        static let composerFallbackShadow = Color.black.opacity(0.1)

        /// Cards use the system's raised grouped surface over the Main canvas:
        /// white on the light grouped background, dark gray on black in Dark Mode.
        static var cardBackground: Color {
            #if os(iOS)
            Color(uiColor: .secondarySystemGroupedBackground)
            #elseif os(macOS)
            Color(nsColor: .controlBackgroundColor)
            #endif
        }

        static let cardSeparator = Color.primary.opacity(0.08)

        /// PLACEHOLDER accent palette — the product side has not allocated the
        /// shared palette yet (it must not collide with the Before timeline's
        /// categories). Every accent below is referenced only through
        /// `Accents`, so swapping in the real palette is a one-file change.
        ///
        /// One accent per card, on the header icon and title. Beyond that,
        /// colour is allowed where it **classifies** — the five stats read as a
        /// legend, the way Apple's sleep score tints its three components — but
        /// not where it would **judge**. Review points are the case to avoid:
        /// green/orange over win/miss turns the card into a scorecard, and PRD
        /// §4.3 requires the tone to describe the day rather than grade it.
        enum Accents {
            static let intake = Color.blue
            static let focus = Color.indigo
            static let output = Color.orange
            static let continuity = Color.green
            static let energy = Color.pink

            static let brief = Color.blue
            static let review = Color.purple
            static let todo = Color.blue
            static let health = Color.pink
            static let idea = Color.orange
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
        static let navigationBackdropHeight: CGFloat = 112
        static let chromeHiddenOffset: CGFloat = 14
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
        /// Keeps the first scroll-content heading below the Main navigation.
        static let mainContentTopPadding: CGFloat = 96

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
        /// plain-language headline, then rows at body size.
        ///
        /// Detail rows are **regular weight throughout** — Health separates the
        /// name from its caption with colour (primary vs secondary), not weight.
        /// Making them semibold flattens the hierarchy into noise.
        static let cardGroupTitle = Font.title2.weight(.bold)
        static let cardHeader = Font.subheadline.weight(.semibold)
        static let cardHeadline = Font.title3.weight(.semibold)
        static let cardBody = Font.body
        static let cardRowName = Font.body
        static let cardRowValue = Font.body
        static let cardRowCaption = Font.body
        static let cardDisplayTitle = Font.largeTitle.weight(.bold)
        static let cardTag = Font.subheadline
    }

    enum Card {
        static let cornerRadius: CGFloat = 22
        static let padding: CGFloat = 20
        /// Between cards inside one group.
        static let spacing: CGFloat = 12
        /// Between card groups.
        static let groupSpacing: CGFloat = 32
        /// Vertical breathing room above and below each detail row, so the
        /// separators land in the middle of real whitespace.
        static let rowVerticalPadding: CGFloat = 9
        static let rowTextSpacing: CGFloat = 3
        static let dotSize: CGFloat = 9
        static let mascotWidth: CGFloat = 132
        /// Keeps the last card above the persistent bottom chrome.
        static var pageBottomPadding: CGFloat {
            Metrics.composerHeight + groupSpacing + Spacing.large
        }
    }

    enum Motion {
        static let composerResponse = 0.32
        static let composerDampingFraction = 0.84
        static let navigationSelectionDuration = 0.25
        static let bottomChromeTransitionDuration = 0.36
        /// How long the navigation stays at full strength after a page settles.
        static let navigationDimDelay = 1.5
        static let navigationDimDuration = 0.45
        static let chromeVisibilityDuration = 0.22
    }

    /// macOS shell metrics: directional page navigation, two-pane Before,
    /// adaptive After grid. Desktop-only; iOS layout keeps the pager tokens.
    enum Desktop {
        static let windowMinimumWidth: CGFloat = 940
        static let windowMinimumHeight: CGFloat = 600
        /// The desktop window is far wider than a phone screen, so the iOS
        /// proportional mascot width would blow up; the desktop Now page
        /// keeps a fixed width even though it lives inside the pager.
        static let nowMascotWidth: CGFloat = 220
        /// Horizontal breathing room around full-width desktop content.
        static let contentPadding: CGFloat = 32
        /// Diameter of the floating edge-navigation arrows (previous/next
        /// page, flanking the window like a full-screen photo browser).
        static let edgeNavigationSize: CGFloat = 36
        static let edgeNavigationOpacity = 0.55

        enum Before {
            /// Width of the calendar + briefing column.
            static let sidebarWidth: CGFloat = 280
            static let calendarCellHeight: CGFloat = 34
            static let calendarDotSize: CGFloat = 4

            // Continuous horizontal timeline (compact fixed chrome).
            static let timelineHourLabelHeight: CGFloat = 14
            static let timelineSpanBarHeight: CGFloat = 14
            static let timelineSleepBarHeight: CGFloat = 8
            static let timelineInputDotSize: CGFloat = 16
            static let timelineAmbientDotSize: CGFloat = 4
            static let timelineLaneGap: CGFloat = 4
            /// A span bar shows its label only above this width.
            static let timelineSpanLabelMinimumWidth: CGFloat = 64
            /// The track opens zoomed in (about a 12-hour window) so that
            /// swiping over it always browses the Gantt instead of falling
            /// through to page turning; 1 fits one day exactly.
            static let timelineDefaultZoom: CGFloat = 2
            /// Pinch-zoom ceiling for the horizontal timeline.
            static let timelineMaxZoom: CGFloat = 8
            /// Hour spacing (pt) above which the axis switches from 3-hour
            /// to 1-hour ticks.
            static let timelineDenseTickHourWidth: CGFloat = 90
            /// Activity lanes budgeted into the fixed-height track.
            static let timelineTrackVisibleLanes: Int = 2
            /// Bars + dots area under the hour labels.
            static var timelineTrackContentHeight: CGFloat {
                timelineSleepBarHeight + timelineLaneGap
                    + CGFloat(timelineTrackVisibleLanes) * (timelineSpanBarHeight + timelineLaneGap)
                    + timelineInputDotSize + timelineLaneGap
                    + timelineAmbientDotSize
            }
            /// Full track chrome (labels + content + inter-spacing).
            static var timelineTrackHeight: CGFloat {
                timelineHourLabelHeight + ReTurnDesign.Spacing.extraSmall + timelineTrackContentHeight
            }
        }

        enum After {
            static let gridMinimumCardWidth: CGFloat = 300
            static let gridSpacing: CGFloat = 16
        }
    }
}
