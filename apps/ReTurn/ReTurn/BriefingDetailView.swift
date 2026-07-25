import SwiftUI

struct BriefingDetailView: View {
    let card: CardRecord

    var body: some View {
        ScrollView {
            if case .briefing(let content) = card.content {
                VStack(spacing: ReTurnDesign.Card.groupSpacing) {
                    BriefingCardView(content: content, date: card.date)

                    CardSurface {
                        CardHeader(
                            icon: "chart.bar.fill",
                            title: "Daily stats",
                            tint: .accentColor,
                            detail: content.characterState.rawValue.capitalized
                        )
                        LabeledContent("Intake", value: content.stats.intake, format: .number.precision(.fractionLength(0)))
                        LabeledContent("Focus", value: content.stats.focus, format: .number.precision(.fractionLength(0)))
                        LabeledContent("Output", value: content.stats.output, format: .number.precision(.fractionLength(0)))
                        LabeledContent("Continuity", value: content.stats.continuity, format: .number.precision(.fractionLength(0)))
                        LabeledContent("Energy", value: content.stats.energy, format: .number.precision(.fractionLength(0)))
                    }
                }
                .padding(ReTurnDesign.Desktop.contentPadding)
                .frame(maxWidth: 680)
                .frame(maxWidth: .infinity)
            } else {
                ContentUnavailableView("Briefing unavailable", systemImage: "doc.questionmark")
            }
        }
        .background(ReTurnDesign.Colors.screenBackground)
        #if os(macOS)
        .frame(minWidth: 520, minHeight: 520)
        #endif
    }
}
