import SwiftUI

struct TimelinePageNavigation: View {
    let selectedPage: TimelinePage?
    let isScrolling: Bool
    let isVisible: Bool
    let onSelect: (TimelinePage) -> Void

    @State private var isDimmed = false

    private var currentPage: TimelinePage { selectedPage ?? .now }

    var body: some View {
        HStack(spacing: ReTurnDesign.Spacing.large) {
            ForEach(TimelinePage.allCases) { page in
                let isSelected = page == currentPage

                Button {
                    onSelect(page)
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
        .opacity(isDimmed ? ReTurnDesign.Metrics.navigationDimmedOpacity : 1)
        .animation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationDimDuration),
            value: isDimmed
        )
        .background(alignment: .top) {
            #if os(iOS)
            LinearGradient(
                colors: [
                    ReTurnDesign.Colors.screenBackground,
                    ReTurnDesign.Colors.screenBackground.opacity(0.96),
                    ReTurnDesign.Colors.screenBackground.opacity(0),
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .frame(height: ReTurnDesign.Metrics.navigationGradientHeight)
            .allowsHitTesting(false)
            #else
            EmptyView()
            #endif
        }
        // Restarts whenever the page changes or the pager starts and stops, so
        // the navigation is at full strength for the whole gesture and only
        // recedes once everything settles. Opacity does not affect hit testing,
        // so the labels stay tappable while dimmed.
        .task(
            id: Activity(
                page: selectedPage,
                isScrolling: isScrolling,
                isVisible: isVisible
            )
        ) {
            isDimmed = false
            // Hold while the pager is still moving; the countdown belongs to
            // the restart that follows it stopping.
            guard isVisible, !isScrolling else { return }

            try? await Task.sleep(for: .seconds(ReTurnDesign.Motion.navigationDimDelay))
            // `try?` swallows the cancellation error, so a superseded timer
            // would otherwise still dim -- immediately after the task that
            // replaced it restored full strength.
            guard !Task.isCancelled else { return }
            isDimmed = true
        }
    }

    /// What the dim timer reacts to: a page change or the pager moving.
    private struct Activity: Equatable {
        let page: TimelinePage?
        let isScrolling: Bool
        let isVisible: Bool
    }
}
