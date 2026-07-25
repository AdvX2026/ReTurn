import SwiftUI

struct TimelineDailyBriefingView: View {
    let briefing: TimelineDailyBriefing
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Label(
                    "Daily Briefing · \(briefing.stateLabel)",
                    systemImage: "sparkles"
                )
                .font(TimelineDesign.Typography.dailyBriefingLabel)
                .foregroundStyle(.secondary)
                .lineLimit(1)

                Spacer(minLength: 8)

                Image(systemName: "chevron.forward")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.quaternary)
                    .accessibilityHidden(true)
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
