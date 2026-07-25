#if os(iOS)
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

            Text(item.label)
                .foregroundStyle(.tertiary)
                .lineLimit(1)

            Spacer(minLength: 8)

            Text(item.timeDisplay)
                .foregroundStyle(.tertiary)
                .monospacedDigit()
        }
        .font(TimelineDesign.Typography.ambientEvent)
        .padding(.trailing, 4)
        .allowsHitTesting(false)
    }
}
#endif
