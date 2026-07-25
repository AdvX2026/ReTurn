import SwiftUI

struct HomeTimelineView: View {
    @State private var selectedPage: TimelinePage? = .now
    @State private var isScrolling = false
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        let pager = ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(TimelinePage.allCases) { page in
                    TimelinePageContent(page: page)
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
            if #available(iOS 18.0, macOS 15.0, *) {
                pager
                    .onScrollPhaseChange { _, phase in
                        isScrolling = phase != .idle
                    }
            } else {
                pager
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            TimelinePageNavigation(
                selectedPage: selectedPage,
                isScrolling: isScrolling,
                onSelect: select
            )
        }

        return Group {
            #if os(iOS)
            timelineContent
                .simultaneousGesture(
                    TapGesture()
                        .onEnded {
                            isComposerFocused = false
                        }
                )
            #else
            timelineContent
            #endif
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ComposerBar(isFocused: $isComposerFocused)
        }
    }

    private func select(_ page: TimelinePage) {
        withAnimation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration)
        ) {
            selectedPage = page
        }
    }
}

#Preview {
    HomeTimelineView()
}
