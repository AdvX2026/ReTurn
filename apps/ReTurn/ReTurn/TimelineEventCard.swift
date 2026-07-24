#if os(iOS)
import SwiftUI

struct TimelineEventCard: View {
    let item: TimelineDisplayItem

    var body: some View {
        VStack(alignment: .leading, spacing: TimelineDesign.Layout.eventCardSpacing) {
            HStack(spacing: 10) {
                Label(item.categoryLabel, systemImage: item.symbolName)
                    .labelStyle(.titleAndIcon)

                Spacer(minLength: 8)

                Text(item.timeDisplay)
                    .monospacedDigit()
            }
            .font(TimelineDesign.Typography.eventMetadata)
            .foregroundStyle(.secondary)

            Text(item.label)
                .font(TimelineDesign.Typography.eventCardTitle)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)

            HStack {
                Text("DURATION")

                Spacer(minLength: 8)

                Text(item.durationDisplay)
                    .monospacedDigit()
            }
            .font(TimelineDesign.Typography.eventMetadata)
            .foregroundStyle(.secondary)
        }
        .padding(TimelineDesign.Layout.eventCardPadding)
        .background(
            TimelineDesign.Colors.eventCardBackground,
            in: .rect(cornerRadius: TimelineDesign.Layout.eventCardCornerRadius)
        )
        .overlay {
            RoundedRectangle(cornerRadius: TimelineDesign.Layout.eventCardCornerRadius)
                .stroke(TimelineDesign.Colors.eventCardBorder, lineWidth: 0.5)
        }
    }
}
#endif
