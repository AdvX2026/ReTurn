#if os(iOS)
import SwiftUI

struct TimelineInputEventView: View {
    let item: TimelineDisplayItem

    var body: some View {
        let tint = TimelineDesign.Colors.accent(for: item)

        HStack(spacing: TimelineDesign.Layout.inputContentSpacing) {
            Image(systemName: item.symbolName)
                .font(TimelineDesign.Typography.inputIcon)
                .foregroundStyle(tint)
                .frame(width: TimelineDesign.Layout.inputIconWidth)
                .accessibilityHidden(true)

            Text(item.label)
                .font(TimelineDesign.Typography.inputTitle)
                .foregroundStyle(.primary)
                .lineLimit(1)
                .truncationMode(.tail)
                .layoutPriority(1)

            Spacer(minLength: 8)

            Text(item.timeDisplay)
                .font(TimelineDesign.Typography.eventMetadata)
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .fixedSize()
        }
        .padding(.trailing, 4)
    }
}
#endif
