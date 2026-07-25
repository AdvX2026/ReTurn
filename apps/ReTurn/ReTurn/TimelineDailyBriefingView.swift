#if os(iOS)
import SwiftUI

struct TimelineDailyBriefingView: View {
    let briefing: TimelineDailyBriefing
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(
                alignment: .leading,
                spacing: TimelineDesign.Layout.dailyBriefingContentSpacing
            ) {
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Label("Daily Briefing", systemImage: "sparkles")
                        .font(TimelineDesign.Typography.dailyBriefingLabel)
                        .foregroundStyle(.secondary)

                    Spacer(minLength: 8)

                    Image(systemName: "chevron.forward")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.quaternary)
                        .accessibilityHidden(true)
                }

                Text("\(briefing.stateLabel) · \(briefing.summary)")
                    .font(TimelineDesign.Typography.dailyBriefingSummary)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .lineSpacing(2)
                    .multilineTextAlignment(.leading)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .contentShape(.rect)
        }
        .buttonStyle(
            TimelinePressableButtonStyle(
                pressedFill: TimelineDesign.Colors.briefingPressedFill,
                cornerRadius: TimelineDesign.Interaction.briefingHighlightCornerRadius
            )
        )
        .accessibilityLabel("Daily Briefing")
        .accessibilityValue(briefing.accessibilityValue)
    }
}
#endif
