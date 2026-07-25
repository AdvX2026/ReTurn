#if os(iOS)
import SwiftUI

/// Four-point star used for intake sparkles and focus eye glints.
enum MascotSparkle {
    /// Returns a path centered on the origin.
    static func path(size: CGFloat) -> Path {
        let radius = size / 2
        let shoulder = radius * 0.38
        var path = Path()
        path.move(to: CGPoint(x: 0, y: -radius))
        path.addQuadCurve(
            to: CGPoint(x: radius, y: 0),
            control: CGPoint(x: shoulder, y: -shoulder)
        )
        path.addQuadCurve(
            to: CGPoint(x: 0, y: radius),
            control: CGPoint(x: shoulder, y: shoulder)
        )
        path.addQuadCurve(
            to: CGPoint(x: -radius, y: 0),
            control: CGPoint(x: -shoulder, y: shoulder)
        )
        path.addQuadCurve(
            to: CGPoint(x: 0, y: -radius),
            control: CGPoint(x: -shoulder, y: -shoulder)
        )
        path.closeSubpath()
        return path
    }
}
#endif
