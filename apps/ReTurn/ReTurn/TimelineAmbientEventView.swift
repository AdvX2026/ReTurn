import SwiftUI

struct TimelineAmbientEventView: View {
    let item: TimelineDisplayItem

    var body: some View {
        HStack(spacing: TimelineDesign.Layout.ambientContentSpacing) {
            Label(item.categoryLabel, systemImage: item.symbolName)
                .foregroundStyle(.secondary)

            Text("·")
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 1) {
                Text(item.label)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                if let subtitle = item.subtitle, subtitle != item.label {
                    Text(subtitle)
                        .foregroundStyle(.tertiary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                }
            }

            Spacer(minLength: 8)

            Text(item.timeDisplay)
                .foregroundStyle(.tertiary)
                .monospacedDigit()
        }
        .font(TimelineDesign.Typography.ambientEvent)
        .padding(.trailing, 4)
    }
}
