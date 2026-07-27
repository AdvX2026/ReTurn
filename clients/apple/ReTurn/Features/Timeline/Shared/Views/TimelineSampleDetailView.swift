import SwiftUI

/// Expanded sample card: every field the timeline projection shipped in
/// `meta`, so clicking a track/list item reveals the full sampler payload
/// without another network round-trip.
struct TimelineSampleDetailView: View {
    let item: TimelineDisplayItem

    private var tint: Color { TimelineDesign.Colors.accent(for: item) }

    var body: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.small) {
            HStack(alignment: .firstTextBaseline, spacing: ReTurnDesign.Spacing.small) {
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
                .font(TimelineDesign.Typography.eventCardTitle)
                .foregroundStyle(.primary)
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)

            if let subtitle = item.subtitle, subtitle != item.label {
                Text(subtitle)
                    .font(TimelineDesign.Typography.eventMetadata)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !item.detailFields.isEmpty {
                Divider()

                VStack(alignment: .leading, spacing: 6) {
                    ForEach(item.detailFields) { field in
                        HStack(alignment: .top, spacing: ReTurnDesign.Spacing.small) {
                            Text(field.label)
                                .font(TimelineDesign.Typography.eventMetadata)
                                .foregroundStyle(.secondary)
                                .frame(width: 110, alignment: .leading)

                            Text(field.value)
                                .font(TimelineDesign.Typography.eventMetadata)
                                .foregroundStyle(.primary)
                                .textSelection(.enabled)
                                .frame(maxWidth: .infinity, alignment: .leading)
                        }
                    }
                }
            }
        }
        .padding(TimelineDesign.Layout.eventCardPadding)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            TimelineDesign.Colors.eventCardBackground,
            in: RoundedRectangle(
                cornerRadius: TimelineDesign.Layout.eventCardCornerRadius,
                style: .continuous
            )
        )
        .overlay {
            RoundedRectangle(
                cornerRadius: TimelineDesign.Layout.eventCardCornerRadius,
                style: .continuous
            )
            .strokeBorder(tint.opacity(0.35), lineWidth: 1)
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(item.label)
        .accessibilityValue(item.accessibilityValue)
    }
}

#Preview {
    let segment = TimelineSegment(
        kind: .feed,
        start: "2026-07-24T10:15:00Z",
        end: "2026-07-24T10:15:00Z",
        label: "ReTurn PRD",
        category: "browse_history",
        nodeId: "3a19a166-3dbe-4d2e-8892-9ad2b51f6421",
        meta: [
            "url": .string("https://example.com/prd"),
            "browser": .string("safari"),
            "title": .string("ReTurn PRD"),
            "source": .string("browse_history"),
        ],
        date: "2026-07-24"
    )
    if let item = TimelineDisplayItem(segment: segment) {
        TimelineSampleDetailView(item: item)
            .padding()
            .frame(width: 420)
    }
}
