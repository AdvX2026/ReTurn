#if os(iOS)
import SwiftUI

struct BeforeView: View {
    let days: [TimelineDay]

    var body: some View {
        ZStack {
            TimelineDesign.Colors.pageBackground
                .ignoresSafeArea()

            if days.isEmpty {
                ContentUnavailableView(
                    "No timeline yet",
                    systemImage: "clock.arrow.circlepath",
                    description: Text("Your activity will appear here after ReTurn starts collecting.")
                )
            } else {
                ScrollView {
                    LazyVStack(
                        alignment: .leading,
                        spacing: TimelineDesign.Layout.daySpacing
                    ) {
                        ForEach(days) { day in
                            TimelineView(day: day)
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
            }
        }
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
