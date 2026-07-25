#if os(iOS)
import SwiftUI

struct TimelineSearchBar: View {
    @FocusState.Binding var isFocused: Bool
    @State private var query = ""

    var body: some View {
        let searchShape = Capsule()
        let searchContent = HStack(spacing: ReTurnDesign.Spacing.medium) {
            Image(systemName: "magnifyingglass")
                .font(.title3.weight(.medium))
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .accessibilityHidden(true)

            TextField("Search", text: $query)
                .font(ReTurnDesign.Typography.composer)
                .textFieldStyle(.plain)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .submitLabel(.search)
                .focused($isFocused)

            Image(systemName: "mic")
                .font(.title3.weight(.medium))
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .frame(
                    width: ReTurnDesign.Metrics.composerAccessorySize,
                    height: ReTurnDesign.Metrics.composerAccessorySize
                )
                .accessibilityHidden(true)
        }
        .padding(.horizontal, ReTurnDesign.Metrics.composerHorizontalInset)
        .frame(
            maxWidth: ReTurnDesign.Layout.composerMaximumWidth(isFocused: isFocused)
        )
        .frame(minHeight: ReTurnDesign.Metrics.composerHeight)

        let surfacedSearch = Group {
            if #available(iOS 26.0, *) {
                searchContent
                    .glassEffect(.regular.interactive(), in: searchShape)
            } else {
                searchContent
                    .background(.ultraThinMaterial, in: searchShape)
                    .shadow(
                        color: ReTurnDesign.Colors.composerFallbackShadow,
                        radius: ReTurnDesign.Metrics.composerFallbackShadowRadius,
                        y: ReTurnDesign.Metrics.composerFallbackShadowY
                    )
            }
        }
        .contentShape(searchShape)
        .onTapGesture {
            isFocused = true
        }

        return surfacedSearch
            .animation(
                .spring(
                    response: ReTurnDesign.Motion.composerResponse,
                    dampingFraction: ReTurnDesign.Motion.composerDampingFraction
                ),
                value: isFocused
            )
            .padding(
                .horizontal,
                ReTurnDesign.Layout.composerHorizontalPadding(isFocused: isFocused)
            )
            .padding(.vertical, ReTurnDesign.Spacing.medium)
    }
}
#endif
