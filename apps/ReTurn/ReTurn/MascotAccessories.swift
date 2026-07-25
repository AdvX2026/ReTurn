import SwiftUI

/// Kongkong's profession accessories, drawn natively to match the mascot's
/// flat geometry. Worn pieces (glasses, pencil, beret, bow tie) draw inside
/// the body's squash transform so they deform with it; the explorer's
/// floating magnifier draws outside it with its own bob.
///
/// Uses the shared-contract `Profession` enum (no parallel client-only enum).
///
/// Every coordinate lives in the mascot's 175×150 core design space — the
/// caller's stage transform (pad + scale) maps it onto the canvas, so no
/// piece here needs a `unit` or an offset of its own.
enum MascotAccessory {
    /// `leftArm` mirrors the left arm's pivot and current angle in
    /// `MascotView.drawBody`, so pieces gripped by the fist ride the wave.
    static func drawWorn(
        _ profession: Profession,
        in context: inout GraphicsContext,
        leftArm: (anchor: CGPoint, degrees: Double)
    ) {
        switch profession {
        case .coder:
            drawGlasses(in: &context)
        case .writer:
            drawPencil(in: &context, leftArm: leftArm)
        case .designer:
            drawBeret(in: &context)
        case .communicator:
            drawBowTie(in: &context)
        case .explorer, .generalist:
            break
        }
    }

    /// Explorer: a magnifier raised beside the head, its handle ending in
    /// the waving right hand so it reads as held rather than floating.
    static func drawFloating(
        _ profession: Profession,
        in context: inout GraphicsContext,
        t: TimeInterval
    ) {
        guard profession == .explorer else { return }
        let bob = sin(t * 1.8) * 2
        let center = CGPoint(x: 152, y: 30 + bob)
        let radius: CGFloat = 10

        var magnifier = context
        magnifier.opacity = 0.9
        // Handle first so the lens ring overlaps its top end.
        var handle = Path()
        handle.move(to: CGPoint(x: center.x - radius * 0.7, y: center.y + radius * 0.7))
        handle.addLine(to: CGPoint(x: center.x - radius * 1.35, y: center.y + radius * 1.35))
        magnifier.stroke(
            handle,
            with: .color(.indigo),
            style: StrokeStyle(lineWidth: 4, lineCap: .round)
        )
        let lensRect = CGRect(x: center.x - radius, y: center.y - radius, width: radius * 2, height: radius * 2)
        magnifier.fill(Path(ellipseIn: lensRect), with: .color(.white.opacity(0.25)))
        magnifier.stroke(Path(ellipseIn: lensRect), with: .color(.indigo), lineWidth: 3.5)
        magnifier.fill(
            Path(ellipseIn: CGRect(x: center.x - 4.5, y: center.y - 5.5, width: 3, height: 3)),
            with: .color(.white.opacity(0.8))
        )
    }

    // MARK: - Worn pieces

    /// Coder: chunky dark frames over both eyes.
    private static func drawGlasses(in context: inout GraphicsContext) {
        let left = CGRect(x: 62, y: 48, width: 22, height: 16)
        let right = CGRect(x: 91, y: 48, width: 22, height: 16)
        var frames = Path()
        frames.addEllipse(in: left)
        frames.addEllipse(in: right)
        frames.move(to: CGPoint(x: left.maxX, y: left.midY))
        frames.addLine(to: CGPoint(x: right.minX, y: right.midY))
        context.stroke(frames, with: .color(.primary.opacity(0.75)), lineWidth: 2.5)
    }

    /// Writer: short pencil in the waving left fist.
    private static func drawPencil(
        in context: inout GraphicsContext,
        leftArm: (anchor: CGPoint, degrees: Double)
    ) {
        var pencil = context
        pencil.translateBy(x: leftArm.anchor.x, y: leftArm.anchor.y)
        pencil.rotate(by: .degrees(leftArm.degrees - 20))
        let body = CGRect(x: -3, y: -28, width: 6, height: 24)
        pencil.fill(Path(roundedRect: body, cornerRadius: 1), with: .color(.yellow.opacity(0.9)))
        var tip = Path()
        tip.move(to: CGPoint(x: -3, y: -28))
        tip.addLine(to: CGPoint(x: 3, y: -28))
        tip.addLine(to: CGPoint(x: 0, y: -34))
        tip.closeSubpath()
        pencil.fill(tip, with: .color(.orange))
    }

    /// Designer: soft beret on the crown.
    private static func drawBeret(in context: inout GraphicsContext) {
        let oval = CGRect(x: 58, y: 18, width: 58, height: 28)
        context.fill(Path(ellipseIn: oval), with: .color(.indigo.opacity(0.85)))
        context.fill(
            Path(ellipseIn: CGRect(x: 82, y: 14, width: 10, height: 8)),
            with: .color(.indigo.opacity(0.9))
        )
    }

    /// Communicator: small bow tie under the chin.
    private static func drawBowTie(in context: inout GraphicsContext) {
        var bow = Path()
        bow.move(to: CGPoint(x: 78, y: 92))
        bow.addLine(to: CGPoint(x: 70, y: 86))
        bow.addLine(to: CGPoint(x: 70, y: 98))
        bow.closeSubpath()
        bow.move(to: CGPoint(x: 97, y: 92))
        bow.addLine(to: CGPoint(x: 105, y: 86))
        bow.addLine(to: CGPoint(x: 105, y: 98))
        bow.closeSubpath()
        context.fill(bow, with: .color(.red.opacity(0.85)))
        context.fill(
            Path(ellipseIn: CGRect(x: 84, y: 88, width: 8, height: 8)),
            with: .color(.red)
        )
    }
}
