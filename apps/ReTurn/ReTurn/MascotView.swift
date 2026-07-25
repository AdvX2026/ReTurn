import SwiftUI

/// Kongkong, alive: the Now-page mascot as layered native drawing with idle
/// motion, the five stats worn on its body, and a profession accessory.
///
/// The static `Kongkong` asset cannot blink or bounce — a merged image only
/// moves as one piece — so the Now page uses this view while cards keep
/// `MascotImage`. The silhouette reproduces the Figma geometry exactly (same
/// coordinates, same #5F87E6); limbs and eyes stay separate shapes precisely
/// so they can animate on their own.
///
/// Stat mapping (values are 0–100, colours come from the shared accents):
/// - intake     → sparkles drifting around the body (count)
/// - focus      → star glints inside the eyes (prominence)
/// - output     → a little gear spinning beside the right hand (speed)
/// - continuity → dots travelling an orbit ring (count)
/// - energy     → aura glow plus the bounce's amplitude and tempo
///
/// All drawing happens in the SVG's own 175×150 coordinate space: the canvas
/// is `Design.width`×`Design.height` and a single stage transform (pad +
/// scale) is applied up front, so every constant below is a verbatim Figma
/// number. Pivot animations use the canonical `translateBy → scaleBy/
/// rotateBy → translateBy(-)` order (these methods pre-concatenate); mixing
/// in `concatenate(_:)` post-multiplies and silently breaks the pivots.
struct MascotView: View {
    /// `nil` renders the plain mascot with no stat wearables.
    var stats: Stats?
    var profession: MascotProfession = .coder
    var onHop: (() -> Void)?

    @State private var hopping = false

    enum Design {
        static let coreWidth: CGFloat = 175
        static let coreHeight: CGFloat = 150
        /// Extra room around the core so sparkles, orbit and accessories are
        /// not clipped by the canvas.
        static let padX: CGFloat = 30
        static let padY: CGFloat = 30
        static let width = coreWidth + padX * 2
        static let height = coreHeight + padY * 2
        static let bodyColor = Color(red: 0x5F / 255, green: 0x87 / 255, blue: 0xE6 / 255)
        /// Ground centre: the bounce pivots here so the feet stay planted.
        static let pivot = CGPoint(x: 87.5, y: 140)
        /// Body centre: sparkles and the orbit ring revolve around this.
        static let center = CGPoint(x: 87.5, y: 70)
    }

    private enum Motion {
        static let bounceMinAmplitude = 0.02
        static let bounceMaxAmplitude = 0.06
        static let bounceMinSpeed = 1.2
        static let bounceMaxSpeed = 2.3
        static let blinkInterval = 3.4
        static let blinkDuration = 0.16
        static let armWaveAmplitude = 6.0
        static let sparkleOrbitSpeed = 0.22
        static let dotOrbitSpeed = 0.55
        static let gearMinSpin = 0.5
        static let gearMaxSpin = 3.0
        static let hopHeight: CGFloat = 26
    }

    var body: some View {
        // `SwiftUI.` prefix is required: the app has its own TimelineView.
        SwiftUI.TimelineView(.animation) { timeline in
            let t = timeline.date.timeIntervalSinceReferenceDate
            Canvas { context, size in
                let unit = size.width / Design.width
                var stage = context
                stage.translateBy(x: Design.padX * unit, y: Design.padY * unit)
                stage.scaleBy(x: unit, y: unit)

                drawGroundShadow(in: &stage)
                if let stats {
                    drawEnergyGlow(in: &stage, t: t, energy: stats.energy)
                }
                drawBody(in: &stage, t: t)
                MascotAccessory.drawFloating(profession, in: &stage, t: t)
                if let stats {
                    drawIntakeSparkles(in: &stage, t: t, intake: stats.intake)
                    drawContinuityOrbit(in: &stage, t: t, continuity: stats.continuity)
                    drawOutputGear(in: &stage, t: t, output: stats.output)
                }
            } symbols: {
                Image(systemName: "gearshape.fill")
                    .tag(MascotSymbol.gear)
            }
            .accessibilityHidden(true)
        }
        .aspectRatio(Design.width / Design.height, contentMode: .fit)
        .offset(y: hopping ? -Motion.hopHeight : 0)
        .contentShape(.rect)
        .onTapGesture {
            // Hop up, then land on the spring's completion -- a bare toggle
            // left the mascot hanging in the air until the next tap.
            withAnimation(.spring(response: 0.28, dampingFraction: 0.55)) {
                hopping = true
            } completion: {
                withAnimation(.spring(response: 0.38, dampingFraction: 0.75)) {
                    hopping = false
                }
            }
            onHop?()
        }
        .accessibilityElement()
        .accessibilityLabel(accessibilitySummary)
        .accessibilityAddTraits(.isButton)
    }

    /// Frame width that keeps the mascot's visual size at `mascotWidth` even
    /// though the canvas carries padding around the core silhouette.
    static func frameWidth(forMascotWidth mascotWidth: CGFloat) -> CGFloat {
        mascotWidth * Design.width / Design.coreWidth
    }

    // MARK: - Body

    /// The Figma triangle, verbatim: apex (88, 2.25), base (24.09, 112.5) to
    /// (151.91, 112.5). Round joins come from a same-colour round stroke.
    private func bodyPath() -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 88, y: 2.25))
        path.addLine(to: CGPoint(x: 151.91, y: 112.5))
        path.addLine(to: CGPoint(x: 24.09, y: 112.5))
        path.closeSubpath()
        return path
    }

    private func fillBody(_ context: inout GraphicsContext, color: Color) {
        context.fill(bodyPath(), with: .color(color))
        context.stroke(
            bodyPath(),
            with: .color(color),
            style: StrokeStyle(lineWidth: 8, lineJoin: .round)
        )
    }

    /// Legs, arms, body, worn accessories and the face, all inside one
    /// squash-and-stretch pivot so the whole figure (glasses included)
    /// deforms together like proper cartoon wear.
    private func drawBody(in context: inout GraphicsContext, t: TimeInterval) {
        let energy = stats?.energy ?? 50
        let amplitude = statFraction(energy, min: Motion.bounceMinAmplitude, max: Motion.bounceMaxAmplitude)
        let speed = statFraction(energy, min: Motion.bounceMinSpeed, max: Motion.bounceMaxSpeed)
        let phase = sin(t * speed * .pi)

        var body = context
        body.translateBy(x: Design.pivot.x, y: Design.pivot.y)
        // Counter-phase horizontal squash keeps the silhouette's volume.
        body.scaleBy(x: 1 - phase * amplitude * 0.3, y: 1 + phase * amplitude)
        body.translateBy(x: -Design.pivot.x, y: -Design.pivot.y)

        // Arms pivot where they meet the body; they wave with the bounce.
        // Folded a few degrees inward from the Figma pose so they nestle
        // against the body's slope instead of hovering off it.
        let wave = sin(t * speed * .pi + 1.2) * Motion.armWaveAmplitude
        drawLimb(
            &body,
            rect: CGRect(x: 31, y: 48.2349, width: 15, height: 25),
            anchor: CGPoint(x: 38.5, y: 60.7349),
            degrees: -32 + wave
        )
        drawLimb(
            &body,
            rect: CGRect(x: 132.392, y: 39, width: 15, height: 25),
            anchor: CGPoint(x: 139.892, y: 51.5),
            degrees: 32 - wave
        )

        for legX in [46.0, 113.0] as [CGFloat] {
            body.fill(
                Path(roundedRect: CGRect(x: legX, y: 102, width: 15, height: 25), cornerRadius: 4),
                with: .color(Design.bodyColor)
            )
        }

        fillBody(&body, color: Design.bodyColor)
        MascotAccessory.drawWorn(profession, in: &body)
        drawEyes(in: &body, t: t)
    }

    private func drawLimb(
        _ context: inout GraphicsContext,
        rect: CGRect,
        anchor: CGPoint,
        degrees: Double
    ) {
        var limb = context
        limb.translateBy(x: anchor.x, y: anchor.y)
        limb.rotate(by: .radians(degrees * .pi / 180))
        limb.translateBy(x: -anchor.x, y: -anchor.y)
        limb.fill(
            Path(roundedRect: rect, cornerRadius: 4),
            with: .color(Design.bodyColor)
        )
    }

    private func drawEyes(in context: inout GraphicsContext, t: TimeInterval) {
        let cycle = t.truncatingRemainder(dividingBy: Motion.blinkInterval)
        // Smooth close-open inside the blink window; wide open otherwise.
        let blinkScale = cycle < Motion.blinkDuration
            ? 0.08 + 0.92 * abs(cos(cycle / Motion.blinkDuration * .pi / 2))
            : 1

        for eyeX in [68.0, 97.0] as [CGFloat] {
            let eyeRect = CGRect(x: eyeX, y: 48, width: 10, height: 17)
            var eye = context
            eye.translateBy(x: eyeRect.midX, y: eyeRect.midY)
            eye.scaleBy(x: 1, y: blinkScale)
            eye.translateBy(x: -eyeRect.midX, y: -eyeRect.midY)
            eye.fill(
                Path(roundedRect: eyeRect, cornerRadius: 3),
                with: .color(.black)
            )

            if let focus = stats?.focus {
                let prominence = statFraction(focus, min: 0.35, max: 1)
                let pulse = 1 + 0.18 * sin(t * 2.4 + eyeX)
                var glint = context
                glint.opacity = prominence
                glint.translateBy(x: eyeRect.midX + 1.5, y: eyeRect.midY - 3.5)
                glint.scaleBy(
                    x: prominence * pulse,
                    y: prominence * pulse * blinkScale
                )
                glint.fill(
                    MascotSparkle.path(size: 6),
                    with: .color(.white)
                )
            }
        }
    }

    // MARK: - Stat wearables

    private func drawGroundShadow(in context: inout GraphicsContext) {
        var shadow = context
        shadow.addFilter(.blur(radius: 5))
        shadow.opacity = 0.12
        shadow.fill(
            Path(ellipseIn: CGRect(x: 37.5, y: 143, width: 100, height: 10)),
            with: .color(.black)
        )
    }

    private func drawEnergyGlow(in context: inout GraphicsContext, t: TimeInterval, energy: Double) {
        var glow = context
        glow.addFilter(.blur(radius: 10))
        glow.opacity = statFraction(energy, min: 0.06, max: 0.3) * (1 + 0.15 * sin(t * 2))
        fillBody(&glow, color: ReTurnDesign.Colors.Accents.energy)
    }

    private func drawIntakeSparkles(in context: inout GraphicsContext, t: TimeInterval, intake: Double) {
        let count = 1 + Int((statFraction(intake) * 5).rounded())
        for i in 0..<count {
            let fi = Double(i)
            let angle = t * Motion.sparkleOrbitSpeed + fi * (2 * .pi / Double(count))
            let twinkle = 0.5 + 0.5 * sin(t * 2.2 + fi * 1.7)
            var sparkle = context
            sparkle.opacity = 0.35 + 0.65 * twinkle
            sparkle.translateBy(
                x: Design.center.x + 92 * cos(angle),
                y: Design.center.y + 58 * sin(angle)
            )
            sparkle.rotate(by: .radians(fi))
            sparkle.scaleBy(x: 0.7 + 0.5 * twinkle, y: 0.7 + 0.5 * twinkle)
            sparkle.fill(
                MascotSparkle.path(size: 9),
                with: .color(ReTurnDesign.Colors.Accents.intake)
            )
        }
    }

    private func drawContinuityOrbit(in context: inout GraphicsContext, t: TimeInterval, continuity: Double) {
        let radius: CGFloat = 76
        var ring = Path()
        ring.addEllipse(in: CGRect(
            x: Design.center.x - radius,
            y: Design.center.y - radius,
            width: radius * 2,
            height: radius * 2
        ))
        var ringContext = context
        ringContext.opacity = 0.18
        ringContext.stroke(
            ring,
            with: .color(ReTurnDesign.Colors.Accents.continuity),
            style: StrokeStyle(lineWidth: 1.2, dash: [3, 6])
        )

        let count = 1 + Int((statFraction(continuity) * 4).rounded())
        for i in 0..<count {
            let angle = t * Motion.dotOrbitSpeed + Double(i) * (2 * .pi / Double(count))
            let dotCenter = CGPoint(
                x: Design.center.x + radius * cos(angle),
                y: Design.center.y + radius * sin(angle)
            )
            context.fill(
                Path(ellipseIn: CGRect(x: dotCenter.x - 2.8, y: dotCenter.y - 2.8, width: 5.6, height: 5.6)),
                with: .color(ReTurnDesign.Colors.Accents.continuity)
            )
        }
    }

    private func drawOutputGear(in context: inout GraphicsContext, t: TimeInterval, output: Double) {
        guard let resolved = context.resolveSymbol(id: MascotSymbol.gear) else { return }
        let spinSpeed = statFraction(output, min: Motion.gearMinSpin, max: Motion.gearMaxSpin)
        var gear = context
        gear.opacity = 0.9
        gear.translateBy(x: 166, y: 82)
        gear.rotate(by: .radians(t * spinSpeed))
        gear.draw(resolved, in: CGRect(x: -7.5, y: -7.5, width: 15, height: 15))
    }

    // MARK: - Helpers

    private enum MascotSymbol {
        case gear
    }

    private func statFraction(_ value: Double, min: Double = 0, max: Double = 1) -> Double {
        let clamped = Swift.min(Swift.max(value, 0), 100) / 100
        return min + (max - min) * clamped
    }

    private var accessibilitySummary: Text {
        var parts = ["Kongkong", profession.displayName]
        if let stats {
            parts.append(
                "intake \(Int(stats.intake)), focus \(Int(stats.focus)), output \(Int(stats.output)), continuity \(Int(stats.continuity)), energy \(Int(stats.energy))"
            )
        }
        return Text(parts.joined(separator: ", "))
    }
}

/// Four-point star used for intake sparkles and focus eye glints. The path is
/// centred on the origin so callers can translate and scale it freely.
enum MascotSparkle {
    static func path(size: CGFloat) -> Path {
        let r = size / 2
        let w = r * 0.38
        var path = Path()
        path.move(to: CGPoint(x: 0, y: -r))
        path.addQuadCurve(to: CGPoint(x: r, y: 0), control: CGPoint(x: w, y: -w))
        path.addQuadCurve(to: CGPoint(x: 0, y: r), control: CGPoint(x: w, y: w))
        path.addQuadCurve(to: CGPoint(x: -r, y: 0), control: CGPoint(x: -w, y: w))
        path.addQuadCurve(to: CGPoint(x: 0, y: -r), control: CGPoint(x: -w, y: -w))
        path.closeSubpath()
        return path
    }
}
