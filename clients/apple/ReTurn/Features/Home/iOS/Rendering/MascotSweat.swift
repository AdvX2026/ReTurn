#if os(iOS)
import SwiftUI

/// Teardrop used for output sweat.
enum MascotSweat {
    /// Returns a path centered on the origin with its tip pointing up.
    static func path(size: CGFloat) -> Path {
        let radius = size / 2
        var path = Path(
            ellipseIn: CGRect(
                x: -radius,
                y: -radius * 0.4,
                width: size,
                height: size
            )
        )
        path.move(to: CGPoint(x: 0, y: -radius * 1.5))
        path.addLine(to: CGPoint(x: radius * 0.86, y: radius * 0.1))
        path.addLine(to: CGPoint(x: -radius * 0.86, y: radius * 0.1))
        path.closeSubpath()
        return path
    }
}
#endif
