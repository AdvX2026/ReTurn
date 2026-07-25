#if os(iOS)
import SwiftUI

/// Draws Kongkong's profession accessories in the mascot's 175×150 design
/// space. Worn pieces inherit the body's squash transform; the researcher's
/// magnifier is rendered separately so it can bob beside the body.
enum MascotAccessory {
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
        case .researcher, .generalist:
            break
        }
    }

    static func drawFloating(
        _ profession: MascotProfession,
        in context: inout GraphicsContext,
        time: TimeInterval
    ) {
        guard profession == .researcher else {
            return
        }

        let bob = sin(time * 1.8) * 2
        let center = CGPoint(x: 152, y: 30 + bob)
        let radius: CGFloat = 10
        var magnifier = context
        magnifier.opacity = 0.9

        var handle = Path()
        handle.move(
            to: CGPoint(
                x: center.x - radius * 0.7,
                y: center.y + radius * 0.7
            )
        )
        handle.addLine(
            to: CGPoint(
                x: center.x - radius * 1.35,
                y: center.y + radius * 1.35
            )
        )
        magnifier.stroke(
            handle,
            with: .color(.indigo),
            style: StrokeStyle(lineWidth: 4, lineCap: .round)
        )

        let lensRect = CGRect(
            x: center.x - radius,
            y: center.y - radius,
            width: radius * 2,
            height: radius * 2
        )
        magnifier.fill(
            Path(ellipseIn: lensRect),
            with: .color(.white.opacity(0.25))
        )
        magnifier.stroke(
            Path(ellipseIn: lensRect),
            with: .color(.indigo),
            lineWidth: 3.5
        )
        magnifier.fill(
            Path(
                ellipseIn: CGRect(
                    x: center.x - 4.5,
                    y: center.y - 5.5,
                    width: 3,
                    height: 3
                )
            ),
            with: .color(.white.opacity(0.8))
        )
    }

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
            Path(
                roundedRect: CGRect(x: 87.5, y: 52, width: 5, height: 3),
                cornerRadius: 1.5
            ),
            with: .color(color)
        )

        let temples = [
            CGRect(x: 54, y: 52, width: 8, height: 2.5),
            CGRect(x: 116.5, y: 52, width: 8, height: 2.5),
        ]
        for temple in temples {
            context.fill(
                Path(roundedRect: temple, cornerRadius: 1.25),
                with: .color(color)
            )
        }
    }

    private static func drawPencil(
        in context: inout GraphicsContext,
        leftArm: (anchor: CGPoint, degrees: Double)
    ) {
        let grip = CGPoint(x: 38.5, y: 48.5)
        var pencil = context
        pencil.translateBy(x: leftArm.anchor.x, y: leftArm.anchor.y)
        pencil.rotate(by: .degrees(leftArm.degrees))
        pencil.translateBy(x: -leftArm.anchor.x, y: -leftArm.anchor.y)
        pencil.translateBy(x: grip.x, y: grip.y)
        pencil.rotate(by: .degrees(15))
        pencil.translateBy(x: -grip.x, y: -grip.y)

        pencil.fill(
            Path(CGRect(x: 35.5, y: 27, width: 6, height: 16)),
            with: .color(.orange)
        )

        var tip = Path()
        tip.move(to: CGPoint(x: 35.5, y: 27))
        tip.addLine(to: CGPoint(x: 38.5, y: 21))
        tip.addLine(to: CGPoint(x: 41.5, y: 27))
        tip.closeSubpath()
        pencil.fill(
            tip,
            with: .color(Color(red: 0.96, green: 0.8, blue: 0.6))
        )

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
            Path(
                roundedRect: CGRect(x: 35.5, y: 45, width: 6, height: 5),
                cornerRadius: 1.5
            ),
            with: .color(.pink)
        )
    }

    private static func drawBeret(in context: inout GraphicsContext) {
        let violet = Color(red: 0.58, green: 0.42, blue: 0.82)
        let deepViolet = Color(red: 0.45, green: 0.32, blue: 0.68)
        let pivot = CGPoint(x: 88, y: 6)
        var beret = context
        beret.translateBy(x: pivot.x, y: pivot.y)
        beret.rotate(by: .degrees(-16))
        beret.translateBy(x: -pivot.x, y: -pivot.y)

        beret.fill(
            Path(ellipseIn: CGRect(x: 69, y: -5.5, width: 38, height: 15)),
            with: .color(violet)
        )
        beret.fill(
            Path(
                roundedRect: CGRect(x: 73, y: 5, width: 30, height: 5),
                cornerRadius: 2.5
            ),
            with: .color(deepViolet)
        )
        beret.fill(
            Path(
                roundedRect: CGRect(x: 86.5, y: -8, width: 3, height: 4),
                cornerRadius: 1.5
            ),
            with: .color(deepViolet)
        )

        var glint = beret
        glint.opacity = 0.25
        glint.fill(
            Path(ellipseIn: CGRect(x: 76, y: -2.5, width: 10, height: 5)),
            with: .color(.white)
        )
    }

    private static func drawBowTie(in context: inout GraphicsContext) {
        // Deep navy: one quiet dark accent against the cornflower body
        // instead of a third saturated hue.
        let blue = Color(red: 0.13, green: 0.22, blue: 0.45)
        let darkBlue = Color(red: 0.09, green: 0.15, blue: 0.32)
        let center = CGPoint(x: 88, y: 80)

        for side in [-1.0, 1.0] as [CGFloat] {
            var wing = Path()
            wing.move(
                to: CGPoint(
                    x: center.x + side * 2.5,
                    y: center.y - 3.5
                )
            )
            wing.addLine(
                to: CGPoint(
                    x: center.x + side * 14,
                    y: center.y - 8
                )
            )
            wing.addLine(
                to: CGPoint(
                    x: center.x + side * 14,
                    y: center.y + 8
                )
            )
            wing.addLine(
                to: CGPoint(
                    x: center.x + side * 2.5,
                    y: center.y + 3.5
                )
            )
            wing.closeSubpath()
            context.fill(wing, with: .color(blue))
            context.stroke(
                wing,
                with: .color(blue),
                style: StrokeStyle(lineWidth: 2.5, lineJoin: .round)
            )
        }

        context.fill(
            Path(
                roundedRect: CGRect(
                    x: center.x - 3.5,
                    y: center.y - 4,
                    width: 7,
                    height: 8
                ),
                cornerRadius: 2.5
            ),
            with: .color(darkBlue)
        )
    }
}
#endif
