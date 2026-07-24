#if os(iOS)
import SwiftUI

struct TimelineEventView: View {
    let item: TimelineDisplayItem
    let isFirst: Bool
    let isLast: Bool

    var body: some View {
        let tint = TimelineDesign.Colors.accent(for: item)

        Group {
            switch item.presentation {
            case .ambient:
                TimelineAmbientEventView(item: item)
            case .major:
                TimelineEventCard(item: item)
            case .point, .span:
                TimelineEventDetailsView(item: item)
            }
        }
        .padding(.leading, TimelineDesign.Layout.railWidth)
        .padding(
            .bottom,
            TimelineDesign.Layout.bottomSpacing(for: item.presentation)
        )
        .frame(
            maxWidth: .infinity,
            minHeight: TimelineDesign.Layout.minimumHeight(for: item.presentation),
            alignment: item.presentation == .ambient ? .leading : .topLeading
        )
        .background(alignment: .leading) {
            TimelineRail(
                presentation: item.presentation,
                tint: tint,
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
