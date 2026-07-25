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
/// Coordinates follow the same convention as the call site: worn pieces use
/// the 175×150 core design space, the floating piece uses the padded canvas
/// space scaled by `unit`.
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

    static func drawFloating(
        _ profession: MascotProfession,
        in context: inout GraphicsContext,
        unit: CGFloat,
        t: TimeInterval
    ) {
        guard profession == .researcher else { return }
        let bob = sin(t * 1.8) * 3
        let center = CGPoint(x: 185 * unit, y: (58 + bob) * unit)
        let radius = 9 * unit

        var lens = Path()
        lens.addEllipse(in: CGRect(
            x: center.x - radius,
            y: center.y - radius,
            width: radius * 2,
            height: radius * 2
        ))
        var handle = Path()
        handle.move(to: CGPoint(x: center.x + radius * 0.7, y: center.y + radius * 0.7))
        handle.addLine(to: CGPoint(x: center.x + radius * 1.7, y: center.y + radius * 1.7))

        var magnifier = context
        magnifier.opacity = 0.85
        magnifier.stroke(lens, with: .color(.indigo), lineWidth: 3 * unit)
        magnifier.stroke(
            handle,
            with: .color(.indigo),
            style: StrokeStyle(lineWidth: 3 * unit, lineCap: .round)
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

    /// Writer: a pencil tucked behind the head, leaning out over the right.
    private static func drawPencil(in context: inout GraphicsContext) {
        var pencil = context
        pencil.concatenate(
            CGAffineTransform(translationX: 107, y: 17)
                .rotated(by: -.pi / 4)
        )
        pencil.fill(
            Path(CGRect(x: -2.5, y: -12, width: 5, height: 19)),
            with: .color(.orange)
        )
        var tip = Path()
        tip.move(to: CGPoint(x: -2.5, y: -12))
        tip.addLine(to: CGPoint(x: 0, y: -17))
        tip.addLine(to: CGPoint(x: 2.5, y: -12))
        tip.closeSubpath()
        pencil.fill(tip, with: .color(Color(red: 0.96, green: 0.8, blue: 0.6)))
        var lead = Path()
        lead.move(to: CGPoint(x: -1, y: -15.2))
        lead.addLine(to: CGPoint(x: 0, y: -17))
        lead.addLine(to: CGPoint(x: 1, y: -15.2))
        lead.closeSubpath()
        pencil.fill(lead, with: .color(.black.opacity(0.8)))
        pencil.fill(
            Path(CGRect(x: -2.5, y: 5.5, width: 5, height: 1.8)),
            with: .color(Color(white: 0.75))
        )
        pencil.fill(
            Path(roundedRect: CGRect(x: -2.5, y: 7.3, width: 5, height: 3.7), cornerRadius: 1.2),
            with: .color(.pink)
        )
    }

    /// Designer: a beret tilted over the apex, low enough to grip the tip.
    private static func drawBeret(in context: inout GraphicsContext) {
        var beret = context
        beret.concatenate(
            CGAffineTransform(translationX: 87, y: 7.5)
                .rotated(by: -15 * .pi / 180)
                .translatedBy(x: -87, y: -7.5)
        )
        beret.fill(
            Path(ellipseIn: CGRect(x: 72, y: 2, width: 30, height: 11)),
            with: .color(.purple)
        )
        beret.fill(
            Path(roundedRect: CGRect(x: 85.5, y: -1, width: 3, height: 4), cornerRadius: 1.5),
            with: .color(.purple)
        )
    }

    /// Manager: a little red tie on the chest.
    private static func drawTie(in context: inout GraphicsContext) {
        var knot = Path()
        knot.move(to: CGPoint(x: 88, y: 74))
        knot.addLine(to: CGPoint(x: 92.5, y: 78.5))
        knot.addLine(to: CGPoint(x: 88, y: 83))
        knot.addLine(to: CGPoint(x: 83.5, y: 78.5))
        knot.closeSubpath()
        context.fill(knot, with: .color(.red))

        var blade = Path()
        blade.move(to: CGPoint(x: 85, y: 84))
        blade.addLine(to: CGPoint(x: 91, y: 84))
        blade.addLine(to: CGPoint(x: 89.5, y: 102))
        blade.addLine(to: CGPoint(x: 88, y: 106))
        blade.addLine(to: CGPoint(x: 86.5, y: 102))
        blade.closeSubpath()
        context.fill(blade, with: .color(.red))
    }
}
