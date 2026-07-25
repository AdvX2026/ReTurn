//
//  ContentView.swift
//  ReTurn
//
//  Created by is52hertz on 7/25/26.
//

import SwiftUI

enum TimelinePage: String, CaseIterable, Identifiable {
    case before = "Before"
    case now = "Now"
    case after = "After"

    var id: Self { self }
}

#if os(iOS)
/// What the navigation's dim timer reacts to: it wakes on either a page change
/// or the pager starting to move, and only counts down once both have settled.
private struct NavigationActivity: Equatable {
    let page: TimelinePage?
    let isScrolling: Bool
}

struct ContentView: View {
    @State private var selectedPage: TimelinePage? = .now
    @State private var isNavigationDimmed = false
    @State private var isScrolling = false
    @FocusState private var isComposerFocused: Bool
    @Environment(ChatStore.self) private var chat: ChatStore
    @Environment(TimelineStore.self) private var timeline: TimelineStore

    var body: some View {
        let pager = ScrollView(.horizontal) {
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
        .scrollPosition(id: $selectedPage)

        let timelineContent = ZStack {
            ReTurnDesign.Colors.screenBackground
                .ignoresSafeArea()

            // Scroll phases let the navigation wake the moment a drag starts and
            // start its countdown only once the pager truly stops -- `scrollPosition`
            // updates when the settle animation begins, which is too early for both.
            // On older systems `isScrolling` stays false and the navigation falls
            // back to waking on the page change itself.
            if #available(iOS 18.0, *) {
                pager
                    .onScrollPhaseChange { _, phase in
                        isScrolling = phase != .idle
                    }
            } else {
                pager
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            pageNavigation
        }

        return timelineContent
            .simultaneousGesture(
                TapGesture()
                    .onEnded {
                        isComposerFocused = false
                    }
            )
            .safeAreaInset(edge: .bottom, spacing: 0) {
                VStack(spacing: 0) {
                    ConnectionStatusView()
                    ComposerBar(isFocused: $isComposerFocused)
                }
            }
            .onChange(of: chat.pendingJump) { _, jump in
                // Retrieval jump (F10): turn to Before. Precise node focusing
                // is a macOS-Before affordance; iOS lands on the page.
                guard jump != nil else { return }
                _ = chat.consumePendingJump()
                select(.before)
            }
    }

    private var currentPage: TimelinePage { selectedPage ?? .now }

    private func select(_ page: TimelinePage) {
        withAnimation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration)
        ) {
            selectedPage = page
        }
    }

    /// Plain labels rather than a segmented `Picker`: the filled control was the
    /// only opaque surface on the screen and outweighed everything around it.
    private var pageNavigation: some View {
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
        .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
        .padding(.top, ReTurnDesign.Spacing.small)
        .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
        .animation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration),
            value: selectedPage
        )
        .opacity(isNavigationDimmed ? ReTurnDesign.Metrics.navigationDimmedOpacity : 1)
        .animation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationDimDuration),
            value: isNavigationDimmed
        )
        // Restarts whenever the page changes or the pager starts and stops, so
        // the navigation is at full strength for the whole gesture and only
        // recedes once everything settles. Opacity does not affect hit testing,
        // so the labels stay tappable while dimmed.
        .task(id: NavigationActivity(page: selectedPage, isScrolling: isScrolling)) {
            isNavigationDimmed = false
            // Hold while the pager is still moving; the countdown belongs to
            // the restart that follows it stopping.
            guard !isScrolling else { return }

            try? await Task.sleep(for: .seconds(ReTurnDesign.Motion.navigationDimDelay))
            // `try?` swallows the cancellation error, so a superseded timer
            // would otherwise still dim -- immediately after the task that
            // replaced it restored full strength.
            guard !Task.isCancelled else { return }
            isNavigationDimmed = true
        }
    }

    @ViewBuilder
    private func pageContent(for page: TimelinePage) -> some View {
        switch page {
        case .before:
            BeforePage()
        case .after:
            AfterPage()
        case .now:
            NowPage()
        }
    }
}

// MARK: - Before

/// The trailing 7 days in one vertical scroll, from a single /api/timeline
/// range call. Days with no content drop out of the list entirely.
private struct BeforePage: View {
    @Environment(TimelineStore.self) private var timeline: TimelineStore
    @State private var presentedBriefing: CardRecord?

    private static let dayCount = 7

    var body: some View {
        Group {
            if case .failed(let message) = timeline.overviewState, loadedDays.isEmpty {
                ConnectionIssueView(message: message) {
                    Task { await reload() }
                }
            } else if loadedDays.isEmpty, timeline.overviewState != .ready {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                BeforeView(
                    days: loadedDays,
                    onOpenDailyBriefing: { briefing in
                        presentedBriefing = timeline.briefingCard(id: briefing.id)
                    }
                )
            }
        }
        .background(ReTurnDesign.Colors.screenBackground)
        .task { await reload() }
        .sheet(item: $presentedBriefing) { card in
            BriefingDetailView(card: card)
        }
    }

    private var loadedDays: [TimelineDay] {
        (0..<Self.dayCount).compactMap { offset in
            Calendar.autoupdatingCurrent
                .date(byAdding: .day, value: -offset, to: .now)
                .flatMap { timeline.day(for: $0) }
        }
        .filter { !$0.items.isEmpty }
    }

    private func reload() async {
        await timeline.refreshOverview()
        await timeline.loadRecentDays(count: Self.dayCount)
    }
}

// MARK: - After

/// The suggestion stream: todo/health/idea cards from /api/cards. Refreshing
/// is cheap (a single read), so it runs on every visit.
private struct AfterPage: View {
    @Environment(CardsStore.self) private var cards: CardsStore

    var body: some View {
        ZStack {
            ReTurnDesign.Colors.screenBackground
                .ignoresSafeArea()

            switch cards.state {
            case .failed(let message) where renderableCards.isEmpty:
                ConnectionIssueView(message: message) {
                    Task { await cards.refresh() }
                }
            case .idle, .loading where renderableCards.isEmpty:
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            default:
                if renderableCards.isEmpty {
                    ContentUnavailableView(
                        "No suggestions yet",
                        systemImage: "sparkles",
                        description: Text("Save today and ReTurn prepares tomorrow's todos, health advice and ideas here.")
                    )
                } else {
                    ScrollView {
                        LazyVStack(spacing: ReTurnDesign.Card.groupSpacing) {
                            ForEach(renderableCards) { card in
                                AfterCardView(
                                    card: card,
                                    doneTodoIDs: cards.doneTodoIDs,
                                    dismissedTodoIDs: cards.dismissedTodoIDs,
                                    todoErrors: cards.todoErrors,
                                    onTodoDone: { id in Task { await cards.markTodoDone(id) } },
                                    onTodoAccept: { id, text in
                                        Task { await cards.acceptTodo(id, text: text) }
                                    },
                                    onTodoDismiss: { id in Task { await cards.dismissTodo(id) } }
                                )
                            }
                            if cards.canLoadMore {
                                ProgressView()
                                    .task { await cards.loadNextPage() }
                            }
                        }
                        .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
                        .padding(.vertical, ReTurnDesign.Spacing.small)
                    }
                    .scrollIndicators(.hidden)
                }
            }
        }
        .task { await cards.monitor() }
    }

    private var renderableCards: [CardRecord] {
        cards.cards.filter { $0.content.isRenderable }
    }
}

// MARK: - Now

private struct NowPage: View {
    @Environment(ChatStore.self) private var chat: ChatStore
    @Environment(StatsStore.self) private var stats: StatsStore

    var body: some View {
        if chat.entries.isEmpty {
            heroBody
        } else {
            conversationBody
        }
    }

    /// Fresh state: the mascot hero plus greeting and the Save action.
    private var heroBody: some View {
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            // Sized from the scroll viewport, which only changes on rotation --
            // the mascot is a preserved vector and re-rasterizes on every new
            // width, so it must not track the composer or keyboard animation.
            MascotImage()
                .containerRelativeFrame(.horizontal) { width, _ in
                    ReTurnDesign.Layout.mascotWidth(in: width)
                }

            Text(nowGreeting(for: stats.characterState))
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)

            SaveTodayButton()
            NowActionBar()
            SaveResultLine()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
    }

    /// Active conversation: a compact header over the transcript.
    private var conversationBody: some View {
        VStack(spacing: 0) {
            HStack(spacing: ReTurnDesign.Spacing.medium) {
                MascotImage()
                    .frame(width: 24, height: 24)
                    .accessibilityHidden(true)
                    .transition(.scale(scale: 0.75))

                Text(nowGreeting(for: stats.characterState))
                    .font(ReTurnDesign.Typography.navigationItem)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    .lineLimit(1)

                Spacer(minLength: 0)

                SaveTodayButton()
            }
            .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
            .padding(.vertical, ReTurnDesign.Spacing.small)

            NowActionBar()
                .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
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
                .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
                .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
            }

            NowConversationView(entries: chat.entries)

            SaveResultLine()
                .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
        }
    }
}
#else
struct ContentView: View {
    var body: some View {
        MacRootView()
    }
}
#endif

#Preview {
    ContentView()
        .previewStores()
}
