import SwiftUI

struct TimelineClusterPreviewView: View {
    let preview: TimelineClusterPreview
    let tint: Color

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            ForEach(preview.entries) { entry in
                HStack(alignment: .firstTextBaseline, spacing: TimelineDesign.Layout.clusterRowSpacing) {
                    Image(systemName: entry.symbolName)
                        .font(TimelineDesign.Typography.clusterPreviewMetadata)
                        .foregroundStyle(tint)
                        .frame(
                            minWidth: TimelineDesign.Layout.clusterSymbolWidth,
                            alignment: .center
                        )
                        .accessibilityHidden(true)

                    Text(entry.time)
                        .font(TimelineDesign.Typography.clusterPreviewMetadata)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()

                    Text(entry.title)
                        .font(TimelineDesign.Typography.clusterPreviewEvent)
                        .foregroundStyle(.primary)
                        .lineLimit(2)

                    Spacer(minLength: 0)
                }
                .padding(.vertical, TimelineDesign.Layout.clusterRowVerticalPadding)

                if entry.id != preview.entries.last?.id {
                    Divider()
                        .padding(.leading, TimelineDesign.Layout.clusterDividerLeadingPadding)
                }
            }

            if preview.remainingCount > 0 {
                Divider()
                    .padding(.leading, TimelineDesign.Layout.clusterDividerLeadingPadding)

                Text("+\(preview.remainingCount) more")
                    .font(TimelineDesign.Typography.clusterPreviewMetadata)
                    .foregroundStyle(.secondary)
                    .padding(.vertical, TimelineDesign.Layout.clusterRowVerticalPadding)
                    .padding(.leading, TimelineDesign.Layout.clusterDividerLeadingPadding)
            }
        }
        .padding(.horizontal, TimelineDesign.Layout.clusterPreviewHorizontalPadding)
        .background(
            TimelineDesign.Colors.clusterPreviewBackground,
            in: RoundedRectangle(
                cornerRadius: TimelineDesign.Layout.clusterPreviewCornerRadius,
                style: .continuous
            )
        )
    }
}
