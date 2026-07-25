#if os(macOS)
import SwiftUI

struct MacTimelineGlassPicker: View {
    let selection: TimelinePage
    let onSelect: (TimelinePage) -> Void

    @Namespace private var glassNamespace
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private static let segmentMinimumWidth: CGFloat = 72
    private static let transitionSpacing: CGFloat = 96

    var body: some View {
        if #available(macOS 26.0, *) {
            GlassEffectContainer(spacing: Self.transitionSpacing) {
                HStack(spacing: 0) {
                    ForEach(TimelinePage.allCases) { page in
                        let isSelected = page == selection

                        Button(page.rawValue) {
                            onSelect(page)
                        }
                        .buttonStyle(.plain)
                        .font(ReTurnDesign.Typography.navigationItem)
                        .foregroundStyle(isSelected ? .primary : .secondary)
                        .frame(minWidth: Self.segmentMinimumWidth)
                        .padding(.horizontal, ReTurnDesign.Spacing.medium)
                        .padding(.vertical, ReTurnDesign.Spacing.small)
                        .contentShape(.capsule)
                        .glassEffect(
                            isSelected ? .regular.interactive() : .identity,
                            in: .capsule
                        )
                        .glassEffectID(
                            isSelected ? "timeline-page-selection" : nil,
                            in: glassNamespace
                        )
                        .glassEffectTransition(reduceMotion ? .identity : .matchedGeometry)
                        .accessibilityAddTraits(isSelected ? .isSelected : [])
                    }
                }
                .padding(ReTurnDesign.Spacing.extraSmall)
                .background(Color.primary.opacity(0.08), in: Capsule())
            }
            .accessibilityElement(children: .contain)
            .accessibilityLabel("Timeline page")
            .accessibilityValue(selection.rawValue)
        }
    }
}
#endif
