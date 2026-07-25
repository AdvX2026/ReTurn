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
                    if isComposerFocused {
                        ComposerWalker()
                            .transition(.move(edge: .bottom).combined(with: .opacity))
                    }
                    ComposerBar(isFocused: $isComposerFocused)
                }
                .animation(.spring(response: 0.4, dampingFraction: 0.8), value: isComposerFocused)
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
            // The API-backed timeline store is not wired yet; keep the reviewed
            // fixture visible so the merged Before experience remains testable.
            BeforeView(days: TimelinePreviewData.days)
        case .after:
            Color.clear
        case .now:
            NowPage()
        }
    }
}

private struct NowPage: View {
    @State private var stats: Stats = .empty
    @State private var profession: Profession = .generalist
    @State private var displayName: String?
    @State private var characterState: CharacterState = .normal
    @State private var loadError: String?

    private var greeting: String {
        let name = displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let name, !name.isEmpty {
            return "\(name) is back!"
        }
        return "You're back!"
    }

    var body: some View {
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            // Sized from the scroll viewport, which only changes on rotation --
            // the mascot redraws every frame, so it must not track the
            // composer or keyboard animation.
            MascotView(stats: stats, profession: profession)
                .containerRelativeFrame(.horizontal) { width, _ in
                    MascotView.frameWidth(
                        forMascotWidth: ReTurnDesign.Layout.mascotWidth(in: width)
                    )
                }

            Text(greeting)
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)

            Text("\(profession.displayName) · \(characterState.rawValue)")
                .font(ReTurnDesign.Typography.cardTag)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)

            if let loadError {
                Text(loadError)
                    .font(ReTurnDesign.Typography.cardTag)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
        .task { await refreshProfileAndStats() }
    }

    private func refreshProfileAndStats() async {
        let base = URL(string: UserDefaults.standard.string(forKey: "piBaseURL")
            ?? "http://127.0.0.1:8787")!
        let client = APIClient(baseURL: base)
        do {
            async let statsReq = client.statsToday()
            async let profileReq = client.getProfile()
            let (today, profile) = try await (statsReq, profileReq)
            stats = today.stats
            characterState = today.characterState
            profession = today.profession
            displayName = profile.displayName
            loadError = nil
        } catch {
            // Keep last good values; surface a short line rather than a demo rotation.
            loadError = "Can't reach the Pi"
        }
    }
}

/// Mini Kongkong pacing back and forth above the composer while it is
/// focused. The stride (stepping legs, swinging arms, bobbing body, forward
/// lean) lives in `MascotView(walking:)`; this wrapper only translates the
/// frame at a constant speed and flips the facing at each end. The
/// profession stays fixed until a real Now store owns one.
private struct ComposerWalker: View {
    private let mascotWidth: CGFloat = 56
    private let pointsPerSecond: CGFloat = 110

    var body: some View {
        // `SwiftUI.` prefix is required: the app has its own TimelineView.
        SwiftUI.TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            GeometryReader { proxy in
                let frameWidth = MascotView.frameWidth(forMascotWidth: mascotWidth)
                let travel = max(proxy.size.width - frameWidth, 1)
                // Triangle wave: constant speed, instant cartoon turnaround.
                let cycle = (t * pointsPerSecond)
                    .truncatingRemainder(dividingBy: travel * 2)
                let outbound = cycle < travel
                MascotView(profession: .coder, walking: true)
                    .frame(width: frameWidth)
                    .scaleEffect(x: outbound ? 1 : -1, y: 1)
                    .position(
                        x: (outbound ? cycle : travel * 2 - cycle) + frameWidth / 2,
                        y: proxy.size.height / 2
                    )
            }
        }
        .frame(height: mascotHeight)
        .accessibilityElement()
        .accessibilityLabel("Kongkong pacing")
        .accessibilityIdentifier("ComposerWalker")
    }

    private var mascotHeight: CGFloat {
        MascotView.frameWidth(forMascotWidth: mascotWidth)
            * MascotView.Design.height / MascotView.Design.width
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
}
