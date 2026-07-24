#if os(iOS)
import SwiftUI

struct TimelineRail: View {
    let presentation: TimelineDisplayItem.Presentation
    let isFirst: Bool
    let isLast: Bool

    var body: some View {
        Canvas { context, size in
            let axisX = TimelineDesign.Layout.railAxisX
            let pointY = TimelineDesign.Layout.pointAnchorY
            let rangeTop = TimelineDesign.Layout.rangeInset
            let rangeBottom = max(rangeTop, size.height - TimelineDesign.Layout.rangeInset)
            let firstAnchor = presentation == .point ? pointY : rangeTop
            let lastAnchor = presentation == .point ? pointY : rangeBottom

            var axis = Path()
            axis.move(to: CGPoint(x: axisX, y: isFirst ? firstAnchor : 0))
            axis.addLine(to: CGPoint(x: axisX, y: isLast ? lastAnchor : size.height))
            context.stroke(
                axis,
                with: .foreground,
                style: StrokeStyle(lineWidth: 1, lineCap: .round)
            )

            switch presentation {
            case .point:
                drawPoint(
                    in: &context,
                    axisX: axisX,
                    anchorY: pointY,
                    width: size.width
                )
            case .span, .major:
                drawRange(
                    in: &context,
                    axisX: axisX,
                    top: rangeTop,
                    bottom: rangeBottom,
                    width: size.width,
                    isMajor: presentation == .major
                )
            }
        }
        .foregroundStyle(.quaternary)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func drawPoint(
        in context: inout GraphicsContext,
        axisX: CGFloat,
        anchorY: CGFloat,
        width: CGFloat
    ) {
        let connectorEnd = width - TimelineDesign.Layout.connectorEndInset
        let strokeStyle = StrokeStyle(lineWidth: 1.25, lineCap: .round, lineJoin: .round)

        var connector = Path()
        connector.move(to: CGPoint(x: axisX, y: anchorY))
        connector.addLine(to: CGPoint(x: connectorEnd, y: anchorY))
        context.stroke(connector, with: .color(.secondary), style: strokeStyle)

        var arrow = Path()
        arrow.move(to: CGPoint(x: connectorEnd - 4, y: anchorY - 3.5))
        arrow.addLine(to: CGPoint(x: connectorEnd, y: anchorY))
        arrow.addLine(to: CGPoint(x: connectorEnd - 4, y: anchorY + 3.5))
        context.stroke(arrow, with: .color(.secondary), style: strokeStyle)

        let markerRect = CGRect(x: axisX - 2.5, y: anchorY - 2.5, width: 5, height: 5)
        context.fill(Path(ellipseIn: markerRect), with: .color(.primary))
    }

    private func drawRange(
        in context: inout GraphicsContext,
        axisX: CGFloat,
        top: CGFloat,
        bottom: CGFloat,
        width: CGFloat,
        isMajor: Bool
    ) {
        let bandWidth = isMajor
            ? TimelineDesign.Layout.majorRangeBandWidth
            : TimelineDesign.Layout.rangeBandWidth
        let bandRect = CGRect(
            x: axisX - bandWidth / 2,
            y: top,
            width: bandWidth,
            height: max(bottom - top, bandWidth)
        )
        context.fill(
            Path(roundedRect: bandRect, cornerRadius: bandWidth / 2),
            with: .color(.secondary)
        )

        let connectorEnd = width - TimelineDesign.Layout.connectorEndInset
        var brackets = Path()
        brackets.move(to: CGPoint(x: axisX, y: top))
        brackets.addLine(to: CGPoint(x: connectorEnd, y: top))
        brackets.move(to: CGPoint(x: axisX, y: bottom))
        brackets.addLine(to: CGPoint(x: connectorEnd, y: bottom))
        context.stroke(
            brackets,
            with: .color(.secondary),
            style: StrokeStyle(lineWidth: 1.25, lineCap: .round)
        )
    }
}
#endif
