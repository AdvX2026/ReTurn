#if os(iOS)
import SwiftUI

struct TimelinePressableButtonStyle: ButtonStyle {
    let pressedFill: Color
    let cornerRadius: CGFloat

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .background {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .fill(configuration.isPressed ? pressedFill : .clear)
                    .padding(.horizontal, -TimelineDesign.Interaction.highlightHorizontalOutset)
                    .padding(.vertical, -TimelineDesign.Interaction.highlightVerticalOutset)
            }
            .opacity(
                configuration.isPressed
                    ? TimelineDesign.Interaction.pressedContentOpacity
                    : 1
            )
            .animation(
                .easeOut(duration: TimelineDesign.Interaction.pressAnimationDuration),
                value: configuration.isPressed
            )
    }
}
#endif
