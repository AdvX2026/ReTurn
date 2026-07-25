#if os(macOS)
import SwiftUI

/// macOS root: the same paging `ScrollView` the iOS pager runs on, so a
/// trackpad two-finger swipe or a Magic Mouse swipe turns pages exactly like
/// the mobile gesture — the earlier simulated slide transition is gone, and
/// with it any doubt about directions. Keyboard (arrow keys, Escape,
/// Cmd-1/2/3), the floating window-edge arrows and the top segmented control all
/// drive the same `scrollPosition` binding the gesture drives.
struct MacRootView: View {
    @State private var selection: TimelinePage? = .now
    @FocusState private var isComposerFocused: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(ChatStore.self) private var chat: ChatStore
    @Environment(TimelineStore.self) private var timeline: TimelineStore
    @Environment(StatsStore.self) private var stats: StatsStore
    @Environment(CardsStore.self) private var cards: CardsStore
    @State private var isRefreshing = false

    var body: some View {
        // A plain VStack, NOT safeAreaInset: scroll content extends into
        // inset areas on every axis except along the scroll direction, so a
        // top inset on a horizontal pager never pushes the pages down — the
        // indicator row just overlaps them. Laying the indicator out as a
        // sibling reserves the top space for all three pages in one place.
        VStack(spacing: 0) {
            pageIndicator

            ScrollView(.horizontal) {
                // Top alignment: if a page's ideal height is shorter than the
                // viewport, LazyHStack's default .center left a blank band
                // above Now. Pages still fill via containerRelativeFrame.
                LazyHStack(alignment: .top, spacing: 0) {
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
        }
        .ignoresSafeArea(.container, edges: .top)
        .background(ReTurnDesign.Colors.screenBackground)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                ConnectionStatusView()
                ComposerBar(isFocused: $isComposerFocused)
            }
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
        .modifier(MacWindowChromeModifier())
        .onChange(of: chat.pendingJump) { _, jump in
            // Retrieval jump (F10): turn to Before and hand the date/node to
            // the timeline browser, which consumes the focus request.
            guard let jump else { return }
            _ = chat.consumePendingJump()
            timeline.requestFocus(dayKey: jump.date, nodeID: jump.nodeIds.first)
            select(.before)
        }
    }

    private var currentPage: TimelinePage { selection ?? .now }

    private var pagePickerSelection: Binding<TimelinePage> {
        Binding(
            get: { currentPage },
            set: { select($0) }
        )
    }

    /// Manual refresh (⌘R): no server push exists, so each page pulls
    /// its own stores again — stats on Now, the viewed day + overview on
    /// Before, the card stream on After.
    private func refreshCurrentPage() async {
        isRefreshing = true
        defer { isRefreshing = false }
        switch currentPage {
        case .now:
            await stats.refresh()
        case .before:
            await timeline.refreshViewedDay()
        case .after:
            await cards.refresh()
        }
    }

    @ViewBuilder
    private func pageContent(for page: TimelinePage) -> some View {
        switch page {
        case .before:
            MacBeforeView()
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
            reduceMotion
                ? nil
                : .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration)
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

    /// The native macOS segmented picker owns Calendar-style hover, selection
    /// and unselected states while the pager remains the single state source.
    private var pageIndicator: some View {
        Picker("Timeline page", selection: pagePickerSelection) {
            ForEach(TimelinePage.allCases) { page in
                Text(page.rawValue)
                    .tag(page)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .controlSize(.large)
        .fixedSize(horizontal: true, vertical: false)
        .padding(.top, ReTurnDesign.Spacing.small)
        // The single definition of the gap between the indicator row and the
        // pages below it.
        .padding(.bottom, ReTurnDesign.Spacing.medium)
        .frame(maxWidth: .infinity)
        .background {
            if #available(macOS 15.0, *) {
                Color.clear
                    .contentShape(.rect)
                    .gesture(WindowDragGesture())
                    .allowsWindowActivationEvents(true)
            }
        }
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

            Button("Refresh") {
                Task { await refreshCurrentPage() }
            }
            .keyboardShortcut("r", modifiers: .command)
            .disabled(isRefreshing)

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
/// for the iOS proportional sizing even inside the pager. Once the
/// conversation starts, the hero collapses to a header over the transcript.
///
/// Layout is top-aligned on purpose. The mobile hero uses a bottom optical
/// lift to sit near vertical center on a phone; on a tall desktop page the
/// same `.frame(maxHeight: .infinity)` default (center) left a large empty
/// band under the page indicator. Top-aligning is the root fix — no extra
/// spacer chrome.
private struct MacNowPage: View {
    @Environment(ChatStore.self) private var chat: ChatStore
    @Environment(StatsStore.self) private var stats: StatsStore
    @Namespace private var mascotSpace

    var body: some View {
        Group {
            if chat.entries.isEmpty {
                heroBody
            } else {
                conversationBody
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }

    private var heroBody: some View {
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            MascotImage()
                .frame(width: ReTurnDesign.Desktop.nowMascotWidth)
                .matchedGeometryEffect(id: "mascot", in: mascotSpace)

            Text(nowGreeting(for: stats.characterState))
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)

            SaveTodayButton()
            NowActionBar()
            SaveResultLine()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
        .padding(.top, ReTurnDesign.Desktop.contentPadding)
    }

    private var conversationBody: some View {
        VStack(spacing: 0) {
            // Header: mascot shrinks from hero into this position
            HStack(spacing: ReTurnDesign.Spacing.medium) {
                MascotImage()
                    .frame(width: 28, height: 28)
                    .matchedGeometryEffect(id: "mascot", in: mascotSpace)
                    .accessibilityHidden(true)

                Text(nowGreeting(for: stats.characterState))
                    .font(ReTurnDesign.Typography.navigationItem)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    .lineLimit(1)

                Spacer(minLength: 0)

                SaveTodayButton()
            }
            .padding(.horizontal, ReTurnDesign.Desktop.contentPadding)
            .padding(.vertical, ReTurnDesign.Spacing.small)

            NowActionBar()
                .padding(.horizontal, ReTurnDesign.Desktop.contentPadding)
                .padding(.bottom, ReTurnDesign.Spacing.extraSmall)

            if case .failed(let message) = chat.historyState {
                HStack(spacing: ReTurnDesign.Spacing.small) {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.red)
                    Spacer(minLength: 0)
                    Button("Retry") {
                        Task { await chat.loadHistory(force: true) }
                    }
                    .font(.caption)
                }
                .padding(.horizontal, ReTurnDesign.Desktop.contentPadding)
                .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
            }

            // Conversation fills remaining space; anchored to bottom
            NowConversationView(entries: chat.entries)
                .frame(maxWidth: ReTurnDesign.Metrics.composerFocusedRegularMaxWidth)
                .frame(maxWidth: .infinity, maxHeight: .infinity)

            SaveResultLine()
                .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .top)
    }
}

#Preview("Now · Light") {
    MacRootView()
        .previewStores()
}

#Preview("Now · Dark") {
    MacRootView()
        .previewStores()
        .preferredColorScheme(.dark)
}
#endif
