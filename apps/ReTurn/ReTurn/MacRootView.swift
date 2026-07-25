#if os(macOS)
import SwiftUI

/// macOS root: the same paging `ScrollView` the iOS pager runs on, so a
/// trackpad two-finger swipe or a Magic Mouse swipe turns pages exactly like
/// the mobile gesture — the earlier simulated slide transition is gone, and
/// with it any doubt about directions. Keyboard (arrow keys, Escape,
/// Cmd-1/2/3), the floating window-edge arrows and the top label row all
/// drive the same `scrollPosition` binding the gesture drives.
struct MacRootView: View {
    @State private var selection: TimelinePage? = .now
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(TimelinePage.allCases) { page in
                    pageContent(for: page)
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(page)
                }
            }
            .scrollTargetLayout()
        }
        .scrollIndicators(.hidden)
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $selection)
        .background(ReTurnDesign.Colors.screenBackground)
        // `spacing` reserves breathing room below the page-indicator row for
        // every page at once — the single place the top gap is defined.
        .safeAreaInset(edge: .top, spacing: ReTurnDesign.Spacing.medium) {
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
            if let target = neighbor(-1) {
                EdgeNavigationButton(systemImage: "chevron.left", help: target.rawValue) {
                    select(target)
                }
                .padding(.leading, ReTurnDesign.Spacing.medium)
            }
        }
        .overlay(alignment: .trailing) {
            if let target = neighbor(1) {
                EdgeNavigationButton(systemImage: "chevron.right", help: target.rawValue) {
                    select(target)
                }
                .padding(.trailing, ReTurnDesign.Spacing.medium)
            }
        }
        .background(shortcutButtons)
    }

    private var currentPage: TimelinePage { selection ?? .now }

    @ViewBuilder
    private func pageContent(for page: TimelinePage) -> some View {
        switch page {
        case .before:
            MacBeforeView(days: TimelinePreviewData.days)
        case .now:
            MacNowPage()
        case .after:
            MacAfterView()
        }
    }

    /// `scrollPosition` is two-way: assigning animates the pager to the page,
    /// a swipe updates the selection back. One binding, no direction math.
    private func select(_ page: TimelinePage) {
        withAnimation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration)
        ) {
            selection = page
        }
    }

    private func step(_ delta: Int) {
        if let target = neighbor(delta) {
            select(target)
        }
    }

    private func neighbor(_ delta: Int) -> TimelinePage? {
        let index = currentPage.ordinal + delta
        guard TimelinePage.allCases.indices.contains(index) else { return nil }
        return TimelinePage.allCases[index]
    }

    /// The same three words the iOS pager navigates with, clickable and kept
    /// at full strength: on the desktop they are the persistent orientation
    /// cue that replaces the swipe position.
    private var pageIndicator: some View {
        HStack(spacing: ReTurnDesign.Spacing.large) {
            ForEach(TimelinePage.allCases) { page in
                let isSelected = page == currentPage

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
            value: currentPage
        )
    }

    /// Keyboard navigation. ←/→ step through the flow and Escape returns to
    /// Now; both are suspended while the composer is focused so text editing
    /// keeps its cursor/word shortcuts. ⌘1/2/3 jump directly, always live.
    private var shortcutButtons: some View {
        HStack {
            Button("Previous") { step(-1) }
                .keyboardShortcut(.leftArrow, modifiers: [])
                .disabled(isComposerFocused || currentPage == .before)

            Button("Next") { step(1) }
                .keyboardShortcut(.rightArrow, modifiers: [])
                .disabled(isComposerFocused || currentPage == .after)

            Button("Back to Now") { select(.now) }
                .keyboardShortcut(.escape, modifiers: [])
                .disabled(currentPage == .now)

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

/// The same hero as mobile, at a fixed width: the desktop window is too wide
/// for the iOS proportional sizing even inside the pager.
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
