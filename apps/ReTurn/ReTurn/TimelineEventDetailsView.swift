#if os(iOS)
import SwiftUI

struct TimelineEventDetailsView: View {
    let item: TimelineDisplayItem
    let showsDisclosureIndicator: Bool

    init(
        item: TimelineDisplayItem,
        showsDisclosureIndicator: Bool = false
    ) {
        self.item = item
        self.showsDisclosureIndicator = showsDisclosureIndicator
    }

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

            HStack(alignment: .firstTextBaseline, spacing: 12) {
                Text(item.label)
                    .font(
                        item.isUserInput
                            ? TimelineDesign.Typography.inputTitle
                            : TimelineDesign.Typography.eventTitle
                    )
                    .foregroundStyle(.primary)
                    .lineLimit(item.isUserInput ? 2 : nil)
                    .fixedSize(horizontal: false, vertical: true)

                if showsDisclosureIndicator {
                    Spacer(minLength: 12)

                    Image(systemName: "chevron.forward")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.tertiary)
                        .accessibilityHidden(true)
                }
            }

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
