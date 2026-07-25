#if os(macOS)
import SwiftUI

/// macOS root: a sidebar replaces the iOS horizontal pager (the wide window
/// has no reason to hide two of the three pages). The composer stays pinned
/// to the detail column's bottom edge so it is reachable from every page,
/// mirroring the mobile shell.
struct MacRootView: View {
    @State private var selection: TimelinePage? = .now
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        NavigationSplitView {
            List(TimelinePage.allCases, selection: $selection) { page in
                Label(page.rawValue, systemImage: page.symbolName)
                    .tag(page)
            }
            .navigationSplitViewColumnWidth(
                min: ReTurnDesign.Desktop.sidebarMinimumWidth,
                ideal: ReTurnDesign.Desktop.sidebarIdealWidth,
                max: ReTurnDesign.Desktop.sidebarMaximumWidth
            )
        } detail: {
            detailContent
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .background(ReTurnDesign.Colors.screenBackground)
                .safeAreaInset(edge: .bottom, spacing: 0) {
                    ComposerBar(isFocused: $isComposerFocused)
                }
        }
        .frame(
            minWidth: ReTurnDesign.Desktop.windowMinimumWidth,
            minHeight: ReTurnDesign.Desktop.windowMinimumHeight
        )
        .background(shortcutButtons)
    }

    @ViewBuilder
    private var detailContent: some View {
        switch selection ?? .now {
        case .before:
            MacBeforeView(days: TimelinePreviewData.days)
        case .now:
            MacNowPage()
        case .after:
            MacAfterView()
        }
    }

    /// ⌘1/⌘2/⌘3 page switching. Zero-size invisible buttons are the standard
    /// SwiftUI carrier for shortcuts that have no menu command; `hidden()`
    /// would risk unregistering them.
    private var shortcutButtons: some View {
        HStack {
            ForEach(Array(TimelinePage.allCases.enumerated()), id: \.element) { index, page in
                Button(page.rawValue) {
                    selection = page
                }
                .keyboardShortcut(KeyEquivalent(Character("\(index + 1)")), modifiers: .command)
            }
        }
        .opacity(0)
        .frame(width: 0, height: 0)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }
}

private extension TimelinePage {
    var symbolName: String {
        switch self {
        case .before:
            "clock.arrow.circlepath"
        case .now:
            "sparkles"
        case .after:
            "lightbulb"
        }
    }
}

/// The same hero as mobile, at a fixed width: the desktop shell has no pager,
/// so `containerRelativeFrame` has no scroll container to measure against.
private struct MacNowPage: View {
    var body: some View {
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            MascotImage()
                .frame(width: ReTurnDesign.Desktop.nowMascotWidth)

            Text("Teethe is back!")
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
    }
}

#Preview("Now · Light") {
    MacRootView()
}

#Preview("Now · Dark") {
    MacRootView()
        .preferredColorScheme(.dark)
}
#endif
