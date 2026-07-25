import SwiftUI

struct HealthAdviceCard: View {
    let content: HealthCardContent
    let onOpen: (() -> Void)?

    init(
        content: HealthCardContent,
        onOpen: (() -> Void)? = nil
    ) {
        self.content = content
        self.onOpen = onOpen
    }

    var body: some View {
        Button {
            onOpen?()
        } label: {
            CardSurface {
                CardHeader(
                    icon: "heart.fill",
                    title: "Health",
                    tint: ReTurnDesign.Colors.Accents.health,
                    showsChevron: onOpen != nil
                )

                CardHeadline(text: content.advice)

                if content.sleepMinutes != nil || content.steps != nil {
                    CardDivider()

                    HStack(spacing: 0) {
                        if let sleepMinutes = content.sleepMinutes {
                            CardReading(
                                name: "睡眠",
                                value: formattedSleep(minutes: sleepMinutes)
                            )
                        }

                        if let steps = content.steps {
                            CardReading(
                                name: "步数",
                                value: steps.formatted()
                            )
                        }
                    }
                    .padding(.top, ReTurnDesign.Spacing.extraSmall)
                }
            }
        }
        .buttonStyle(.plain)
        .disabled(onOpen == nil)
        .accessibilityIdentifier("after.health.open")
    }

    private func formattedSleep(minutes: Int) -> String {
        let hours = minutes / 60
        let remainingMinutes = minutes % 60

        if hours == 0 {
            return "\(remainingMinutes) 分钟"
        }
        if remainingMinutes == 0 {
            return "\(hours) 小时"
        }
        return "\(hours) 小时 \(remainingMinutes) 分"
    }
}
