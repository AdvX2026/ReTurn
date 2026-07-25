#if os(iOS)
import SwiftUI

struct TimelineEventDetailsView: View {
    let item: TimelineDisplayItem

    var body: some View {
        let tint = TimelineDesign.Colors.accent(for: item)

        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Label(item.categoryLabel, systemImage: item.symbolName)
                    .font(TimelineDesign.Typography.eventCategory)
                    .foregroundStyle(tint)

                Spacer(minLength: 8)

                Text(item.timeDisplay)
                    .font(TimelineDesign.Typography.eventMetadata)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }

            Text(item.label)
                .font(TimelineDesign.Typography.eventTitle)
                .foregroundStyle(.primary)
                .lineLimit(item.isUserInput ? 1 : nil)
                .truncationMode(.tail)
                .fixedSize(horizontal: false, vertical: true)

            if item.presentation == .span {
                Text(item.durationDisplay)
                    .font(TimelineDesign.Typography.eventMetadata)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
        }
        .padding(.top, 1)
        .padding(.trailing, 4)
    }
}
#endif
