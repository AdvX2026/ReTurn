#if os(iOS)
import SwiftUI

struct TimelineRail: View {
    let presentation: TimelineDisplayItem.Presentation
    let tint: Color
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
                with: .color(TimelineDesign.Colors.rail),
                style: StrokeStyle(
                    lineWidth: TimelineDesign.Layout.axisWidth,
                    lineCap: .round
                )
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
        let strokeStyle = StrokeStyle(lineWidth: 1.75, lineCap: .round, lineJoin: .round)

        var connector = Path()
        connector.move(to: CGPoint(x: axisX, y: anchorY))
        connector.addLine(to: CGPoint(x: connectorEnd - 1, y: anchorY))
        context.stroke(connector, with: .color(tint), style: strokeStyle)

        var arrow = Path()
        arrow.move(to: CGPoint(x: connectorEnd - 4, y: anchorY - 3.5))
        arrow.addLine(to: CGPoint(x: connectorEnd, y: anchorY))
        arrow.addLine(to: CGPoint(x: connectorEnd - 4, y: anchorY + 3.5))
        context.stroke(arrow, with: .color(tint), style: strokeStyle)

        let ringDiameter = TimelineDesign.Layout.pointRingDiameter
        let ringRect = CGRect(
            x: axisX - ringDiameter / 2,
            y: anchorY - ringDiameter / 2,
            width: ringDiameter,
            height: ringDiameter
        )
        context.fill(
            Path(ellipseIn: ringRect),
            with: .color(TimelineDesign.Colors.pageBackground)
        )

        let markerDiameter = TimelineDesign.Layout.pointDiameter
        let markerRect = CGRect(
            x: axisX - markerDiameter / 2,
            y: anchorY - markerDiameter / 2,
            width: markerDiameter,
            height: markerDiameter
        )
        context.fill(Path(ellipseIn: markerRect), with: .color(tint))
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
            with: .color(tint)
        )

        let connectorEnd = width - TimelineDesign.Layout.connectorEndInset
        let connectorY = top + (isMajor ? 18 : 4)
        var connector = Path()
        connector.move(to: CGPoint(x: axisX + bandWidth / 2, y: connectorY))
        connector.addLine(to: CGPoint(x: connectorEnd, y: connectorY))
        context.stroke(
            connector,
            with: .color(tint),
            style: StrokeStyle(lineWidth: 1.75, lineCap: .round)
        )
    }
}
#endif
