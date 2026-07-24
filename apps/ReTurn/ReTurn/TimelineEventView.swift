#if os(iOS)
import SwiftUI

struct TimelineEventView: View {
    let item: TimelineDisplayItem
    let isFirst: Bool
    let isLast: Bool

    var body: some View {
        Group {
            if item.presentation == .major {
                TimelineEventCard(item: item)
            } else {
                TimelineEventDetailsView(item: item)
            }
        }
        .padding(.leading, TimelineDesign.Layout.railWidth)
        .padding(.bottom, TimelineDesign.Layout.eventBottomSpacing)
        .frame(
            maxWidth: .infinity,
            minHeight: TimelineDesign.Layout.minimumHeight(for: item.presentation),
            alignment: .topLeading
        )
        .background(alignment: .leading) {
            TimelineRail(
                presentation: item.presentation,
                isFirst: isFirst,
                isLast: isLast
            )
            .frame(width: TimelineDesign.Layout.railWidth)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(item.label)
        .accessibilityValue(item.accessibilityValue)
        .id(item.id)
    }
}
#endif
