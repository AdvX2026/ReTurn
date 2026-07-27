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
                .lineLimit(titleLineLimit)
                .truncationMode(.tail)
                .fixedSize(horizontal: false, vertical: true)

            #if os(macOS)
            if let subtitle = item.subtitle, subtitle != item.label {
                Text(subtitle)
                    .font(TimelineDesign.Typography.eventMetadata)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .truncationMode(.middle)
            } else if item.presentation == .span || item.presentation == .major {
                Text(item.durationDisplay)
                    .font(TimelineDesign.Typography.eventMetadata)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            #else
            if item.presentation == .span {
                Text(item.durationDisplay)
                    .font(TimelineDesign.Typography.eventMetadata)
                    .foregroundStyle(.secondary)
                    .monospacedDigit()
            }
            #endif
        }
        .padding(.top, 1)
        .padding(.trailing, 4)
    }

    private var titleLineLimit: Int? {
        #if os(macOS)
        item.isUserInput ? 1 : 3
        #else
        item.isUserInput ? 1 : nil
        #endif
    }
}
