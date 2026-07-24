#if os(iOS)
import SwiftUI

struct TimelineView: View {
    let day: TimelineDay

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
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

                    Text("\(day.items.count) \(day.items.count == 1 ? "Event" : "Events")")
                        .font(TimelineDesign.Typography.eventCount)
                        .foregroundStyle(.tertiary)
                }
            }
            .padding(.leading, TimelineDesign.Layout.railWidth)
            .padding(.bottom, TimelineDesign.Layout.dayHeaderBottomPadding)

            ForEach(day.items.enumerated(), id: \.element.id) { index, item in
                TimelineEventView(
                    item: item,
                    isFirst: index == day.items.startIndex,
                    isLast: index == day.items.index(before: day.items.endIndex)
                )
            }
        }
    }
}
#endif
