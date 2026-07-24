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

        static var waveformFill: Color {
            #if os(iOS)
            Color(uiColor: .tertiarySystemFill)
            #elseif os(macOS)
            Color(nsColor: .controlBackgroundColor)
            #endif
        }

        static let composerShadow = Color.black.opacity(0.2)
    }

    enum Spacing {
        static let extraSmall: CGFloat = 4
        static let small: CGFloat = 8
        static let medium: CGFloat = 10
    }

    enum Metrics {
        static let navigationMaxWidth: CGFloat = 350
        static let composerMaxWidth: CGFloat = 350
        static let composerHeight: CGFloat = 50
        static let composerHorizontalInset: CGFloat = 17
        static let screenHorizontalInset: CGFloat = 16
        static let waveformButtonSize: CGFloat = 30
        static let mascotWidth: CGFloat = 175
        static let mascotHeight: CGFloat = 150
        static let heroOpticalLift: CGFloat = 38
        static let composerShadowRadius: CGFloat = 20
        static let composerShadowY: CGFloat = 8
    }

    enum Typography {
        static let heroTitle = Font.system(.title, design: .rounded, weight: .medium)
        static let composer = Font.subheadline
    }
}
