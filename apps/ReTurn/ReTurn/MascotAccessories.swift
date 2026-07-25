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
/// flat geometry. Worn pieces (glasses, pencil, beret, tie) draw inside the
/// body's squash transform so they deform with it; the researcher's floating
/// magnifier draws outside it with its own bob.
///
/// Every coordinate lives in the mascot's 175×150 core design space — the
/// caller's stage transform (pad + scale) maps it onto the canvas, so no
/// piece here needs a `unit` or an offset of its own.
enum MascotAccessory {
    static func drawWorn(_ profession: MascotProfession, in context: inout GraphicsContext) {
        switch profession {
        case .coder:
            drawGlasses(in: &context)
        case .writer:
            drawPencil(in: &context)
        case .designer:
            drawBeret(in: &context)
        case .manager:
            drawTie(in: &context)
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

    /// Writer: a pencil tucked behind the head, drawn parallel to the body's
    /// right slope (~30° off vertical) with both ends sticking out, like a
    /// pencil behind an ear.
    private static func drawPencil(in context: inout GraphicsContext) {
        var pencil = context
        pencil.concatenate(
            CGAffineTransform(translationX: 110, y: 30)
                .rotated(by: -.pi / 6)
        )
        pencil.fill(
            Path(CGRect(x: -3, y: -15, width: 6, height: 24)),
            with: .color(.orange)
        )
        var tip = Path()
        tip.move(to: CGPoint(x: -3, y: -15))
        tip.addLine(to: CGPoint(x: 0, y: -21))
        tip.addLine(to: CGPoint(x: 3, y: -15))
        tip.closeSubpath()
        pencil.fill(tip, with: .color(Color(red: 0.96, green: 0.8, blue: 0.6)))
        var lead = Path()
        lead.move(to: CGPoint(x: -1.2, y: -18.6))
        lead.addLine(to: CGPoint(x: 0, y: -21))
        lead.addLine(to: CGPoint(x: 1.2, y: -18.6))
        lead.closeSubpath()
        pencil.fill(lead, with: .color(.black.opacity(0.8)))
        pencil.fill(
            Path(CGRect(x: -3, y: 9, width: 6, height: 2)),
            with: .color(Color(white: 0.75))
        )
        pencil.fill(
            Path(roundedRect: CGRect(x: -3, y: 11, width: 6, height: 4), cornerRadius: 1.5),
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

    /// Manager: a short, chubby tie on the chest — dark knot, red blade with
    /// softened corners.
    private static func drawTie(in context: inout GraphicsContext) {
        let red = Color(red: 0.85, green: 0.25, blue: 0.3)
        let darkRed = Color(red: 0.7, green: 0.17, blue: 0.23)
        var knot = Path()
        knot.move(to: CGPoint(x: 85.5, y: 76))
        knot.addLine(to: CGPoint(x: 90.5, y: 76))
        knot.addLine(to: CGPoint(x: 89.5, y: 81))
        knot.addLine(to: CGPoint(x: 86.5, y: 81))
        knot.closeSubpath()
        context.fill(knot, with: .color(darkRed))
        context.stroke(knot, with: .color(darkRed), style: StrokeStyle(lineWidth: 2, lineJoin: .round))

        var blade = Path()
        blade.move(to: CGPoint(x: 86.3, y: 82))
        blade.addLine(to: CGPoint(x: 89.7, y: 82))
        blade.addLine(to: CGPoint(x: 92, y: 96))
        blade.addLine(to: CGPoint(x: 88, y: 101))
        blade.addLine(to: CGPoint(x: 84, y: 96))
        blade.closeSubpath()
        context.fill(blade, with: .color(red))
        context.stroke(blade, with: .color(red), style: StrokeStyle(lineWidth: 2, lineJoin: .round))
    }
}
