#if os(iOS)
import SwiftUI

struct BeforeView: View {
    let days: [TimelineDay]
    let onOpenInput: (TimelineDisplayItem) -> Void
    let onOpenDailyBriefing: (TimelineDailyBriefing) -> Void
    let isChromeVisible: Bool
    let onChromeVisibilityChange: (Bool) -> Void
    let onScrollActivityChange: (Bool) -> Void

    @State private var chromeScrollTracker = TimelineChromeScrollTracker()

    init(
        days: [TimelineDay],
        onOpenInput: @escaping (TimelineDisplayItem) -> Void = { _ in },
        onOpenDailyBriefing: @escaping (TimelineDailyBriefing) -> Void = { _ in },
        isChromeVisible: Bool = true,
        onChromeVisibilityChange: @escaping (Bool) -> Void = { _ in },
        onScrollActivityChange: @escaping (Bool) -> Void = { _ in }
    ) {
        self.days = days
        self.onOpenInput = onOpenInput
        self.onOpenDailyBriefing = onOpenDailyBriefing
        self.isChromeVisible = isChromeVisible
        self.onChromeVisibilityChange = onChromeVisibilityChange
        self.onScrollActivityChange = onScrollActivityChange
    }

    var body: some View {
        let timelineScroll = ScrollView {
            LazyVStack(
                alignment: .leading,
                spacing: TimelineDesign.Layout.daySpacing
            ) {
                ForEach(days) { day in
                    TimelineView(
                        day: day,
                        onOpenInput: onOpenInput,
                        onOpenDailyBriefing: onOpenDailyBriefing
                    )
                }
            }
        }
        .contentMargins(
            .horizontal,
            TimelineDesign.Layout.contentHorizontalPadding,
            for: .scrollContent
        )
        .contentMargins(
            .top,
            TimelineDesign.Layout.contentTopPadding,
            for: .scrollContent
        )
        .contentMargins(
            .bottom,
            TimelineDesign.Layout.contentBottomPadding,
            for: .scrollContent
        )
        .scrollIndicators(.hidden)

        ZStack {
            TimelineDesign.Colors.pageBackground

            if days.isEmpty {
                ContentUnavailableView(
                    "No timeline yet",
                    systemImage: "clock.arrow.circlepath",
                    description: Text("Your activity will appear here after ReTurn starts collecting.")
                )
            } else {
                if #available(iOS 18.0, *) {
                    timelineScroll
                        .onScrollGeometryChange(for: CGFloat.self) { geometry in
                            let offset = max(
                                geometry.contentOffset.y + geometry.contentInsets.top,
                                0
                            )
                            let sampleDistance =
                                TimelineDesign.Interaction.chromeOffsetSampleDistance
                            return (offset / sampleDistance).rounded(.down) * sampleDistance
                        } action: { _, offset in
                            updateChromeVisibility(for: offset)
                        }
                        .onScrollPhaseChange { _, phase in
                            let isScrolling = phase.isScrolling
                            chromeScrollTracker.setScrolling(isScrolling)
                            onScrollActivityChange(isScrolling)
                        }
                } else {
                    timelineScroll
                }
            }
        }
    }

    private func updateChromeVisibility(for offset: CGFloat) {
        guard
            let isVisible = chromeScrollTracker.update(
                offset: offset,
                isChromeVisible: isChromeVisible
            )
        else {
            return
        }

        onChromeVisibilityChange(isVisible)
    }
}

#Preview("Before · Light") {
    BeforeView(days: TimelinePreviewData.days)
}

#Preview("Before · Dark") {
    BeforeView(days: TimelinePreviewData.days)
        .preferredColorScheme(.dark)
}
#endif
