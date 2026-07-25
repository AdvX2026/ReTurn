import SwiftUI

struct TimelineView: View {
    let day: TimelineDay
    let onOpenInput: (TimelineDisplayItem) -> Void
    let onOpenDailyBriefing: (TimelineDailyBriefing) -> Void

    init(
        day: TimelineDay,
        onOpenInput: @escaping (TimelineDisplayItem) -> Void = { _ in },
        onOpenDailyBriefing: @escaping (TimelineDailyBriefing) -> Void = { _ in }
    ) {
        self.day = day
        self.onOpenInput = onOpenInput
        self.onOpenDailyBriefing = onOpenDailyBriefing
    }

    var body: some View {
        let eventCount = day.representedEventCount

        VStack(alignment: .leading, spacing: 0) {
            VStack(
                alignment: .leading,
                spacing: TimelineDesign.Layout.dailyBriefingTopSpacing
            ) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(day.date, format: .dateTime.weekday(.wide))
                        .font(TimelineDesign.Typography.dayMetadata)
                        .foregroundStyle(.secondary)
                        .textCase(.uppercase)

                    HStack(alignment: .firstTextBaseline) {
                        Text(day.date, format: .dateTime.month(.abbreviated).day())
                            .font(TimelineDesign.Typography.day)
                            .foregroundStyle(.primary)

                        Spacer()

                        Text(
                            "\(eventCount) "
                                + "\(eventCount == 1 ? "Event" : "Events")"
                        )
                        .font(TimelineDesign.Typography.eventCount)
                        .foregroundStyle(.tertiary)
                    }
                }

                if let dailyBriefing = day.dailyBriefing {
                    TimelineDailyBriefingView(
                        briefing: dailyBriefing,
                        action: {
                            onOpenDailyBriefing(dailyBriefing)
                        }
                    )
                }
            }
            .padding(.leading, TimelineDesign.Layout.railWidth)
            .padding(.bottom, TimelineDesign.Layout.dayHeaderBottomPadding)

            ForEach(Array(day.items.enumerated()), id: \.element.id) { index, item in
                TimelineEventView(
                    item: item,
                    isFirst: index == day.items.startIndex,
                    isLast: index == day.items.index(before: day.items.endIndex),
                    onOpenInput: onOpenInput
                )
            }
        }
    }
}
