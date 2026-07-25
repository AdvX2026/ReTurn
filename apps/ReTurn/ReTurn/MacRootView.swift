#if os(macOS)
import SwiftUI

/// macOS root: the mobile pager translated to the desktop. A sidebar turned
/// Before/Now/After into a document switcher and lost the time-flow metaphor,
/// so navigation here is **directional**, mirroring the iOS swipe: left arrow
/// key / left edge button goes one page into the past, right goes one page
/// into the future, and pages slide in from the edge they conceptually live
/// on. The top label row is the same word-mark the iOS pager uses.
struct MacRootView: View {
    @State private var selection: TimelinePage = .now
    /// Edge the incoming page enters from; the outgoing page leaves through
    /// the opposite one. Set together with `selection` inside one transaction.
    @State private var navigationEdge: Edge = .trailing
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        ZStack {
            pageContent
                .id(selection)
                .transition(.asymmetric(
                    insertion: .move(edge: navigationEdge),
                    removal: .move(edge: navigationEdge.opposite)
                ))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ReTurnDesign.Colors.screenBackground)
        .safeAreaInset(edge: .top, spacing: 0) {
            pageIndicator
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ComposerBar(isFocused: $isComposerFocused)
        }
        .frame(
            minWidth: ReTurnDesign.Desktop.windowMinimumWidth,
            minHeight: ReTurnDesign.Desktop.windowMinimumHeight
        )
        .overlay(alignment: .leading) {
            if selection != .before {
                EdgeNavigationButton(systemImage: "chevron.left", help: "Before") {
                    step(-1)
                }
                .padding(.leading, ReTurnDesign.Spacing.medium)
            }
        }
        .overlay(alignment: .trailing) {
            if selection != .after {
                EdgeNavigationButton(systemImage: "chevron.right", help: "After") {
                    step(1)
                }
                .padding(.trailing, ReTurnDesign.Spacing.medium)
            }
        }
        .background(shortcutButtons)
    }

    @ViewBuilder
    private var pageContent: some View {
        switch selection {
        case .before:
            MacBeforeView(days: TimelinePreviewData.days)
        case .now:
            MacNowPage()
        case .after:
            MacAfterView()
        }
    }

    private func select(_ page: TimelinePage) {
        guard page != selection else { return }
        let forward = page.ordinal > selection.ordinal
        withAnimation(.easeInOut(duration: 0.35)) {
            navigationEdge = forward ? .trailing : .leading
            selection = page
        }
    }

    private func step(_ delta: Int) {
        let index = selection.ordinal + delta
        guard TimelinePage.allCases.indices.contains(index) else { return }
        select(TimelinePage.allCases[index])
    }

    /// The same three words the iOS pager navigates with, clickable and kept
    /// at full strength: on the desktop they are the persistent orientation
    /// cue that replaces the swipe position.
    private var pageIndicator: some View {
        HStack(spacing: ReTurnDesign.Spacing.large) {
            ForEach(TimelinePage.allCases) { page in
                let isSelected = page == selection

                Button {
                    select(page)
                } label: {
                    // Every label reserves its selected width, so changing
                    // weights cannot shove the row's other labels around.
                    Text(page.rawValue)
                        .fontWeight(.semibold)
                        .hidden()
                        .overlay {
                            Text(page.rawValue)
                                .fontWeight(isSelected ? .semibold : .regular)
                                .foregroundStyle(
                                    isSelected
                                        ? ReTurnDesign.Colors.primaryLabel
                                        : ReTurnDesign.Colors.secondaryLabel
                                )
                        }
                }
                .font(ReTurnDesign.Typography.navigationItem)
                .buttonStyle(.plain)
                .accessibilityLabel(page.rawValue)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(.top, ReTurnDesign.Spacing.small)
        .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
        .animation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration),
            value: selection
        )
    }

    /// Keyboard navigation. ←/→ step through the flow and Escape returns to
    /// Now; both are suspended while the composer is focused so text editing
    /// keeps its cursor/word shortcuts. ⌘1/2/3 jump directly, always live.
    private var shortcutButtons: some View {
        HStack {
            Button("Previous") { step(-1) }
                .keyboardShortcut(.leftArrow, modifiers: [])
                .disabled(isComposerFocused || selection == .before)

            Button("Next") { step(1) }
                .keyboardShortcut(.rightArrow, modifiers: [])
                .disabled(isComposerFocused || selection == .after)

            Button("Back to Now") { select(.now) }
                .keyboardShortcut(.escape, modifiers: [])
                .disabled(selection == .now)

            ForEach(Array(TimelinePage.allCases.enumerated()), id: \.element) { index, page in
                Button(page.rawValue) {
                    select(page)
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

/// Floating circular arrow flanking the window, in the spirit of full-screen
/// browsers (Photos, Keynote): quiet at rest, full strength on hover.
private struct EdgeNavigationButton: View {
    let systemImage: String
    let help: String
    let action: () -> Void

    @State private var isHovering = false

    var body: some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.body.weight(.semibold))
                .foregroundStyle(.secondary)
                .frame(
                    width: ReTurnDesign.Desktop.edgeNavigationSize,
                    height: ReTurnDesign.Desktop.edgeNavigationSize
                )
                .background(.ultraThinMaterial, in: Circle())
        }
        .buttonStyle(.plain)
        .opacity(isHovering ? 1 : ReTurnDesign.Desktop.edgeNavigationOpacity)
        .animation(.easeOut(duration: 0.15), value: isHovering)
        .onHover { isHovering = $0 }
        .help(help)
    }
}

private extension TimelinePage {
    var ordinal: Int {
        Self.allCases.firstIndex(of: self) ?? 0
    }
}

private extension Edge {
    var opposite: Edge {
        switch self {
        case .leading: .trailing
        case .trailing: .leading
        case .top: .bottom
        case .bottom: .top
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
