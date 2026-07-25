#if os(iOS)
import SwiftUI

struct TimelineEventView: View {
    let item: TimelineDisplayItem
    let isFirst: Bool
    let isLast: Bool
    let onOpenInput: (TimelineDisplayItem) -> Void

    init(
        item: TimelineDisplayItem,
        isFirst: Bool,
        isLast: Bool,
        onOpenInput: @escaping (TimelineDisplayItem) -> Void = { _ in }
    ) {
        self.item = item
        self.isFirst = isFirst
        self.isLast = isLast
        self.onOpenInput = onOpenInput
    }

    @ViewBuilder
    var body: some View {
        let tint = TimelineDesign.Colors.accent(for: item)

        if item.isUserInput {
            eventLayout(tint: tint) {
                Button(action: openInput) {
                    TimelineInputEventView(item: item)
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    .contentShape(.rect)
                }
                .padding(.top, TimelineDesign.Layout.inputTopPadding)
                .buttonStyle(
                    TimelinePressableButtonStyle(
                        pressedFill: tint.opacity(
                            TimelineDesign.Interaction.inputPressedFillOpacity
                        ),
                        cornerRadius: TimelineDesign.Interaction.inputHighlightCornerRadius
                    )
                )
                .accessibilityLabel(item.label)
                .accessibilityValue(item.accessibilityValue)
            }
        } else {
            eventLayout(tint: tint) {
                switch item.presentation {
                case .ambient:
                    TimelineAmbientEventView(item: item)
                case .major:
                    TimelineEventCard(item: item)
                case .point, .span:
                    TimelineEventDetailsView(item: item)
                }
            }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(item.label)
            .accessibilityValue(item.accessibilityValue)
        }
    }

    private func eventLayout<Content: View>(
        tint: Color,
        @ViewBuilder content: () -> Content
    ) -> some View {
        content()
        .padding(.leading, TimelineDesign.Layout.railWidth)
        .padding(
            .bottom,
            item.isUserInput
                ? TimelineDesign.Layout.inputBottomSpacing
                : TimelineDesign.Layout.bottomSpacing(for: item.presentation)
        )
        .frame(
            maxWidth: .infinity,
            minHeight: item.isUserInput
                ? TimelineDesign.Layout.inputMinimumHeight
                : TimelineDesign.Layout.minimumHeight(for: item.presentation),
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
        .id(item.id)
    }

    private func openInput() {
        onOpenInput(item)
    }
}
#endif
