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
                ComposerBar(isFocused: $isComposerFocused)
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
    var body: some View {
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            // Sized from the scroll viewport, which only changes on rotation --
            // the mascot is a preserved vector and re-rasterizes on every new
            // width, so it must not track the composer or keyboard animation.
            MascotImage()
                .containerRelativeFrame(.horizontal) { width, _ in
                    ReTurnDesign.Layout.mascotWidth(in: width)
                }

            Text("Teethe is back!")
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
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
