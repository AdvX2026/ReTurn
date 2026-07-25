import SwiftUI

struct TimelineEventCard: View {
    let item: TimelineDisplayItem

    var body: some View {
        let tint = TimelineDesign.Colors.accent(for: item)

        VStack(alignment: .leading, spacing: TimelineDesign.Layout.eventCardSpacing) {
            HStack(spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: item.symbolName)
                        .font(.caption.weight(.semibold))
                        .frame(width: 26, height: 26)
                        .background(tint.opacity(0.14), in: .circle)

                    Text(item.categoryLabel)
                }
                .font(TimelineDesign.Typography.eventCategory)
                .foregroundStyle(tint)

                Spacer(minLength: 8)

                Text(item.timeDisplay)
                    .font(TimelineDesign.Typography.eventMetadata)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()

                Image(systemName: "chevron.right")
                    .font(.caption.bold())
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }

            Text(item.label)
                .font(TimelineDesign.Typography.eventCardTitle)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)

            if let subtitle = item.subtitle, subtitle != item.label, subtitle != item.durationDisplay {
                Text(subtitle)
                    .font(TimelineDesign.Typography.eventMetadata)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }

            if let clusterPreview = item.clusterPreview {
                TimelineClusterPreviewView(
                    preview: clusterPreview,
                    tint: tint
                )
            }

            Label(item.durationDisplay, systemImage: "clock")
                .font(TimelineDesign.Typography.eventMetadata)
                .foregroundStyle(.secondary)
                .monospacedDigit()
        }
        .padding(TimelineDesign.Layout.eventCardPadding)
        .background(
            TimelineDesign.Colors.eventCardBackground,
            in: RoundedRectangle(
                cornerRadius: TimelineDesign.Layout.eventCardCornerRadius,
                style: .continuous
            )
        )
    }
}
