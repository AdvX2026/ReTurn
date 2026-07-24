#if os(iOS)
import SwiftUI

struct TimelineEventDetailsView: View {
    let item: TimelineDisplayItem

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(spacing: 8) {
                Text(item.timeDisplay)
                    .monospacedDigit()

                Text("[\(item.categoryLabel)]")
                    .foregroundStyle(.tertiary)
            }
            .font(TimelineDesign.Typography.eventMetadata)
            .foregroundStyle(.secondary)

            Text(item.label)
                .font(TimelineDesign.Typography.eventTitle)
                .foregroundStyle(.primary)

            if item.presentation == .span {
                Label(item.durationDisplay, systemImage: item.symbolName)
                    .font(TimelineDesign.Typography.eventMetadata)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 2)
        .padding(.trailing, 4)
    }
}
#endif
