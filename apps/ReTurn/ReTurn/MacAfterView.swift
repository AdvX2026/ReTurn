#if os(macOS)
import SwiftUI

/// macOS After: the suggestion cards as an adaptive grid. The iOS pager only
/// has room for a single column; the desktop window fits several, so cards
/// flow the way Health's summary tiles do instead of stacking.
struct MacAfterView: View {
    private let columns = [
        GridItem(
            .adaptive(minimum: ReTurnDesign.Desktop.After.gridMinimumCardWidth),
            spacing: ReTurnDesign.Desktop.After.gridSpacing
        ),
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: ReTurnDesign.Card.groupSpacing) {
                Text("After")
                    .font(ReTurnDesign.Typography.cardDisplayTitle)
                    .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                    .frame(maxWidth: .infinity, alignment: .leading)

                LazyVGrid(columns: columns, spacing: ReTurnDesign.Desktop.After.gridSpacing) {
                    TodoCard(todos: SampleData.todos)
                    HealthCard(
                        advice: SampleData.healthAdvice,
                        sleep: SampleData.healthSleep,
                        steps: SampleData.healthSteps
                    )
                    IdeaCard(
                        text: SampleData.Provenance.user.text,
                        provenanceLabel: SampleData.Provenance.user.label
                    )
                    IdeaCard(
                        text: SampleData.Provenance.auto.text,
                        provenanceLabel: SampleData.Provenance.auto.label
                    )
                }
            }
            .padding(.horizontal, ReTurnDesign.Desktop.contentPadding)
            .padding(.vertical, ReTurnDesign.Desktop.contentPadding)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(ReTurnDesign.Colors.screenBackground)
    }
}

#Preview("After · Light") {
    MacAfterView()
}

#Preview("After · Dark") {
    MacAfterView()
        .preferredColorScheme(.dark)
}
#endif
