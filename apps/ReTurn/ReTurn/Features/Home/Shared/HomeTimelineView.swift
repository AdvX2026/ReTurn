import SwiftUI

struct HomeTimelineView: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    @State private var selectedPage: TimelinePage?
    @State private var isPagerScrolling = false
    @State private var isBeforeScrolling = false
    @State private var isBeforeChromeVisible = true
    @FocusState private var isComposerFocused: Bool
    #if os(iOS)
    @FocusState private var isSearchFocused: Bool
    #endif

    init(initialPage: TimelinePage = .now) {
        _selectedPage = State(initialValue: initialPage)
    }

    var body: some View {
        let pager = ScrollView(.horizontal, showsIndicators: false) {
            LazyHStack(spacing: 0) {
                ForEach(TimelinePage.allCases) { page in
                    TimelinePageContent(
                        page: page,
                        isBeforeChromeVisible: isBeforeChromeVisible,
                        onBeforeChromeVisibilityChange: updateBeforeChromeVisibility,
                        onBeforeScrollActivityChange: updateBeforeScrollActivity
                    )
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(page)
                }
            }
            .scrollTargetLayout()
        }
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $selectedPage)

        let timelineContent = ZStack(alignment: .top) {
            ReTurnDesign.Colors.screenBackground
                .ignoresSafeArea()

            // Scroll phases let the navigation wake the moment a drag starts and
            // start its countdown only once the pager truly stops -- `scrollPosition`
            // updates when the settle animation begins, which is too early for both.
            // On older systems `isPagerScrolling` stays false and the navigation falls
            // back to waking on the page change itself.
            if #available(iOS 18.0, macOS 15.0, *) {
                pager
                    .onScrollPhaseChange { _, phase in
                        let isScrolling = phase != ScrollPhase.idle
                        isPagerScrolling = isScrolling
                        if isScrolling {
                            isBeforeChromeVisible = true
                            isBeforeScrolling = false
                        }
                    }
            } else {
                pager
            }

            #if os(iOS)
            Rectangle()
                .fill(.bar)
                .frame(height: ReTurnDesign.Metrics.navigationBackdropHeight)
                .mask {
                    LinearGradient(
                        stops: [
                            .init(color: .white, location: 0),
                            .init(color: .white, location: 0.48),
                            .init(color: .white.opacity(0.72), location: 0.72),
                            .init(color: .clear, location: 1),
                        ],
                        startPoint: .top,
                        endPoint: .bottom
                    )
                }
                .ignoresSafeArea(edges: [.top, .horizontal])
                .allowsHitTesting(false)
                .accessibilityHidden(true)
                .opacity(isChromeVisible ? 1 : 0)
                .animation(chromeAnimation, value: isChromeVisible)
            #endif
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            TimelinePageNavigation(
                selectedPage: selectedPage,
                isScrolling: isTimelineScrolling,
                isVisible: isChromeVisible,
                onSelect: select
            )
            .opacity(isChromeVisible ? 1 : 0)
            .offset(
                y: isChromeVisible || reduceMotion
                    ? 0
                    : -ReTurnDesign.Metrics.chromeHiddenOffset
            )
            .allowsHitTesting(isChromeVisible)
            .accessibilityHidden(!isChromeVisible)
            .animation(chromeAnimation, value: isChromeVisible)
        }

        return Group {
            #if os(iOS)
            timelineContent
                .simultaneousGesture(
                    TapGesture()
                        .onEnded {
                            isComposerFocused = false
                            isSearchFocused = false
                        }
                )
            #else
            timelineContent
            #endif
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            Group {
                #if os(iOS)
                ZStack {
                    ComposerBar(isFocused: $isComposerFocused)
                        .opacity(isNowPage ? 1 : 0)
                        .blur(radius: isNowPage ? 0 : bottomChromeInactiveBlurRadius)
                        .zIndex(isNowPage ? 1 : 0)
                        .allowsHitTesting(isNowPage)
                        .accessibilityHidden(!isNowPage)

                    TimelineSearchBar(isFocused: $isSearchFocused)
                        .opacity(isNowPage ? 0 : 1)
                        .blur(radius: isNowPage ? bottomChromeInactiveBlurRadius : 0)
                        .zIndex(isNowPage ? 0 : 1)
                        .allowsHitTesting(!isNowPage)
                        .accessibilityHidden(isNowPage)
                }
                .animation(
                    .easeInOut(
                        duration: ReTurnDesign.Motion.bottomChromeTransitionDuration
                    ),
                    value: isNowPage
                )
                #else
                ComposerBar(isFocused: $isComposerFocused)
                #endif
            }
            .opacity(isChromeVisible ? 1 : 0)
            .offset(
                y: isChromeVisible || reduceMotion
                    ? 0
                    : ReTurnDesign.Metrics.chromeHiddenOffset
            )
            .allowsHitTesting(isChromeVisible)
            .accessibilityHidden(!isChromeVisible)
            .animation(chromeAnimation, value: isChromeVisible)
        }
        .onChange(of: selectedPage) {
            #if os(iOS)
            if isNowPage {
                isSearchFocused = false
            } else {
                isComposerFocused = false
            }
            #endif
            isBeforeChromeVisible = true
            isBeforeScrolling = false
        }
    }

    private var isChromeVisible: Bool {
        selectedPage != .before || isBeforeChromeVisible
    }

    private var isNowPage: Bool {
        (selectedPage ?? .now) == .now
    }

    private var bottomChromeInactiveBlurRadius: CGFloat {
        reduceMotion ? 0 : 5
    }

    private var isTimelineScrolling: Bool {
        isPagerScrolling || (selectedPage == .before && isBeforeScrolling)
    }

    private var chromeAnimation: Animation {
        .easeInOut(duration: ReTurnDesign.Motion.chromeVisibilityDuration)
    }

    private func select(_ page: TimelinePage) {
        withAnimation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration)
        ) {
            selectedPage = page
        }
    }

    private func updateBeforeChromeVisibility(_ isVisible: Bool) {
        guard
            selectedPage == .before,
            !isPagerScrolling,
            isBeforeChromeVisible != isVisible
        else {
            return
        }

        if !isVisible {
            isComposerFocused = false
            #if os(iOS)
            isSearchFocused = false
            #endif
        }
        isBeforeChromeVisible = isVisible
    }

    private func updateBeforeScrollActivity(_ isScrolling: Bool) {
        isBeforeScrolling =
            selectedPage == .before
            && !isPagerScrolling
            && isScrolling
    }
}
