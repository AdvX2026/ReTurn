import SwiftUI

/// The five professions Kongkong can dress for.
///
/// Client-provisional: the API contract has no profession field yet
/// (prd-drift §C — the server will eventually assign one deterministically in
/// the briefing card). When it lands, mirror it in `Models.swift` as a
/// `TolerantEnum` and map to these cases at the view boundary.
enum MascotProfession: String, CaseIterable {
    case coder, writer, designer, researcher, manager

    var displayName: String { rawValue.capitalized }
}

/// Kongkong's profession accessories, drawn natively to match the mascot's
/// flat geometry. Worn pieces (glasses, pencil, beret, bow tie) draw inside
/// the body's squash transform so they deform with it; the researcher's
/// floating magnifier draws outside it with its own bob.
///
/// Every coordinate lives in the mascot's 175×150 core design space — the
/// caller's stage transform (pad + scale) maps it onto the canvas, so no
/// piece here needs a `unit` or an offset of its own.
enum MascotAccessory {
    /// `leftArm` mirrors the left arm's pivot and current angle in
    /// `MascotView.drawBody`, so pieces gripped by the fist ride the wave.
    static func drawWorn(
        _ profession: MascotProfession,
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
        case .manager:
            drawBowTie(in: &context)
        case .researcher:
            break // The magnifier floats; see drawFloating.
        }
    }

    /// Researcher: a magnifier raised beside the head, its handle ending in
    /// the waving right hand so it reads as held rather than floating.
    static func drawFloating(
        _ profession: MascotProfession,
        in context: inout GraphicsContext,
        t: TimeInterval
    ) {
        guard profession == .researcher else { return }
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
        let color = Color.black.opacity(0.85)
        let frames = [
            CGRect(x: 61, y: 45, width: 27, height: 23),
            CGRect(x: 90, y: 45, width: 27, height: 23),
        ]
        for frame in frames {
            context.stroke(
                Path(roundedRect: frame, cornerRadius: 6),
                with: .color(color),
                lineWidth: 3
            )
        }
        context.fill(
            Path(roundedRect: CGRect(x: 87.5, y: 52, width: 5, height: 3), cornerRadius: 1.5),
            with: .color(color)
        )
        // Temple arms reaching back to where the ears would be.
        for temple in [CGRect(x: 54, y: 52, width: 8, height: 2.5), CGRect(x: 116.5, y: 52, width: 8, height: 2.5)] {
            context.fill(
                Path(roundedRect: temple, cornerRadius: 1.25),
                with: .color(color)
            )
        }
    }

    /// Writer: a pencil gripped in the raised left fist. It shares the arm's
    /// own pivot (`leftArm`) so it never detaches from the waving hand; a
    /// further 15° tilt around the grip makes it read as held rather than
    /// fused to the arm.
    private static func drawPencil(
        in context: inout GraphicsContext,
        leftArm: (anchor: CGPoint, degrees: Double)
    ) {
        // The fist's top in the arm's unrotated frame; the eraser sinks in here.
        let grip = CGPoint(x: 38.5, y: 48.5)
        var pencil = context
        pencil.translateBy(x: leftArm.anchor.x, y: leftArm.anchor.y)
        pencil.rotate(by: .degrees(leftArm.degrees))
        pencil.translateBy(x: -leftArm.anchor.x, y: -leftArm.anchor.y)
        pencil.translateBy(x: grip.x, y: grip.y)
        pencil.rotate(by: .degrees(15))
        pencil.translateBy(x: -grip.x, y: -grip.y)

        // Local frame: a vertical pencil, tip up, eraser end at the grip.
        pencil.fill(
            Path(CGRect(x: 35.5, y: 27, width: 6, height: 16)),
            with: .color(.orange)
        )
        var tip = Path()
        tip.move(to: CGPoint(x: 35.5, y: 27))
        tip.addLine(to: CGPoint(x: 38.5, y: 21))
        tip.addLine(to: CGPoint(x: 41.5, y: 27))
        tip.closeSubpath()
        pencil.fill(tip, with: .color(Color(red: 0.96, green: 0.8, blue: 0.6)))
        var lead = Path()
        lead.move(to: CGPoint(x: 36.8, y: 24.6))
        lead.addLine(to: CGPoint(x: 38.5, y: 21))
        lead.addLine(to: CGPoint(x: 40.2, y: 24.6))
        lead.closeSubpath()
        pencil.fill(lead, with: .color(.black.opacity(0.8)))
        pencil.fill(
            Path(CGRect(x: 35.5, y: 43, width: 6, height: 2)),
            with: .color(Color(white: 0.75))
        )
        pencil.fill(
            Path(roundedRect: CGRect(x: 35.5, y: 45, width: 6, height: 5), cornerRadius: 1.5),
            with: .color(.pink)
        )
    }

    /// Designer: a floppy beret tilted over the apex — wide crown, a band
    /// along its lower edge and the little stem on top.
    private static func drawBeret(in context: inout GraphicsContext) {
        let violet = Color(red: 0.58, green: 0.42, blue: 0.82)
        let deep = Color(red: 0.45, green: 0.32, blue: 0.68)
        var beret = context
        beret.concatenate(
            CGAffineTransform(translationX: 88, y: 6)
                .rotated(by: -16 * .pi / 180)
                .translatedBy(x: -88, y: -6)
        )
        beret.fill(
            Path(ellipseIn: CGRect(x: 69, y: -5.5, width: 38, height: 15)),
            with: .color(violet)
        )
        beret.fill(
            Path(roundedRect: CGRect(x: 73, y: 5, width: 30, height: 5), cornerRadius: 2.5),
            with: .color(deep)
        )
        beret.fill(
            Path(roundedRect: CGRect(x: 86.5, y: -8, width: 3, height: 4), cornerRadius: 1.5),
            with: .color(deep)
        )
        var glint = beret
        glint.opacity = 0.25
        glint.fill(
            Path(ellipseIn: CGRect(x: 76, y: -2.5, width: 10, height: 5)),
            with: .color(.white)
        )
    }

    /// Manager: a dapper bow tie under the chin — two wings flaring from a
    /// pinched knot. (A dangling red blade on the chest read as a tongue.)
    private static func drawBowTie(in context: inout GraphicsContext) {
        // Deep navy: one quiet dark accent against the cornflower body
        // instead of a third saturated hue.
        let blue = Color(red: 0.13, green: 0.22, blue: 0.45)
        let darkBlue = Color(red: 0.09, green: 0.15, blue: 0.32)
        let center = CGPoint(x: 88, y: 80)
        for side in [-1.0, 1.0] as [CGFloat] {
            var wing = Path()
            wing.move(to: CGPoint(x: center.x + side * 2.5, y: center.y - 3.5))
            wing.addLine(to: CGPoint(x: center.x + side * 14, y: center.y - 8))
            wing.addLine(to: CGPoint(x: center.x + side * 14, y: center.y + 8))
            wing.addLine(to: CGPoint(x: center.x + side * 2.5, y: center.y + 3.5))
            wing.closeSubpath()
            context.fill(wing, with: .color(blue))
            context.stroke(
                wing,
                with: .color(blue),
                style: StrokeStyle(lineWidth: 2.5, lineJoin: .round)
            )
        }
        context.fill(
            Path(roundedRect: CGRect(x: center.x - 3.5, y: center.y - 4, width: 7, height: 8), cornerRadius: 2.5),
            with: .color(darkBlue)
        )
    }
}
