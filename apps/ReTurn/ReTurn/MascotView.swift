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
/// Stat mapping (values are 0–100, colours come from the shared accents).
/// Binding-of-Isaac principle: state reads on the body itself, not just as
/// trinkets around it.
/// - intake     → sparkles spiral inward and are absorbed by the body
/// - focus      → star glints and steady pupils; low focus makes the eyes wander
/// - output     → a spinning gear plus sweat drops flung off the flanks
/// - continuity → comet dots trailing tails around the orbit ring
/// - energy     → the face itself: smile vs tired frown, hooded eyelids when
///   drained, plus the bounce's amplitude/tempo and the aura glow
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
                    drawOutputSweat(in: &stage, t: t, output: stats.output)
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
        drawMouth(in: &body)
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

        // Focus: steady pupils when high, a slow distracted wander when low.
        let focus = stats?.focus ?? 50
        let wander = (1 - statFraction(focus)) * 2.2 * sin(t * 0.9)
        // Energy: below ~45 the lids slide down over the eyes -- the fatigue
        // read. The lid is body-coloured, so the eye simply looks shorter.
        let energy = stats?.energy ?? 50
        let droop = Swift.max(0, (45 - energy) / 45) * 0.55

        for eyeX in [68.0, 97.0] as [CGFloat] {
            let eyeRect = CGRect(x: eyeX, y: 48, width: 10, height: 17)
            var eye = context
            eye.translateBy(x: eyeRect.midX, y: eyeRect.midY)
            eye.scaleBy(x: 1, y: blinkScale)
            eye.translateBy(x: -eyeRect.midX + wander, y: -eyeRect.midY)
            eye.fill(
                Path(roundedRect: eyeRect, cornerRadius: 3),
                with: .color(.black)
            )
            if droop > 0.01 {
                let lidHeight = eyeRect.height * droop
                eye.fill(
                    Path(roundedRect: CGRect(
                        x: eyeRect.minX - 0.5,
                        y: eyeRect.minY - 0.5,
                        width: eyeRect.width + 1,
                        height: lidHeight + 0.5
                    ), cornerRadius: 3),
                    with: .color(Design.bodyColor)
                )
                var crease = Path()
                crease.move(to: CGPoint(x: eyeRect.minX, y: eyeRect.minY + lidHeight))
                crease.addLine(to: CGPoint(x: eyeRect.maxX, y: eyeRect.minY + lidHeight))
                eye.stroke(crease, with: .color(.black.opacity(0.25)), lineWidth: 1)
            }

            if stats?.focus != nil {
                let prominence = statFraction(focus, min: 0.35, max: 1)
                let pulse = 1 + 0.18 * sin(t * 2.4 + eyeX)
                var glint = context
                glint.opacity = prominence
                glint.translateBy(x: eyeRect.midX + 1.5 + wander, y: eyeRect.midY - 3.5)
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

    /// The energy read on the face: a smile when charged, a tired frown when
    /// drained, a flat "meh" line in between.
    private func drawMouth(in context: inout GraphicsContext) {
        let energy = stats?.energy ?? 50
        let cheer = (statFraction(energy) - 0.5) * 2
        var mouth = Path()
        mouth.move(to: CGPoint(x: 83.5, y: 71))
        mouth.addQuadCurve(
            to: CGPoint(x: 92.5, y: 71),
            control: CGPoint(x: 88, y: 71 + cheer * 4.5)
        )
        context.stroke(
            mouth,
            with: .color(.black.opacity(0.85)),
            style: StrokeStyle(lineWidth: 1.8, lineCap: .round)
        )
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

    /// Sparkles ride the orbit while spiralling inward, fading as the body
    /// absorbs them, then respawn on the rim. Intake drives count and pace.
    private func drawIntakeSparkles(in context: inout GraphicsContext, t: TimeInterval, intake: Double) {
        let intensity = statFraction(intake)
        let count = 2 + Int((intensity * 5).rounded())
        for i in 0..<count {
            let fi = Double(i)
            let phase = (t * (0.25 + 0.45 * intensity) + fi / Double(count))
                .truncatingRemainder(dividingBy: 1)
            let angle = t * Motion.sparkleOrbitSpeed + fi * (2 * .pi / Double(count))
            let shrink = 1 - phase * 0.5
            let twinkle = 0.5 + 0.5 * sin(t * 2.2 + fi * 1.7)
            var sparkle = context
            sparkle.opacity = (1 - phase) * (0.45 + 0.55 * twinkle)
            sparkle.translateBy(
                x: Design.center.x + 92 * shrink * cos(angle),
                y: Design.center.y + 58 * shrink * sin(angle)
            )
            sparkle.rotate(by: .radians(fi))
            let scale = (0.7 + 0.5 * twinkle) * (1 - phase * 0.4)
            sparkle.scaleBy(x: scale, y: scale)
            sparkle.fill(
                MascotSparkle.path(size: 9),
                with: .color(ReTurnDesign.Colors.Accents.intake)
            )
        }
    }

    private func drawContinuityOrbit(in context: inout GraphicsContext, t: TimeInterval, continuity: Double) {
        let intensity = statFraction(continuity)
        let radius: CGFloat = 76
        var ring = Path()
        ring.addEllipse(in: CGRect(
            x: Design.center.x - radius,
            y: Design.center.y - radius,
            width: radius * 2,
            height: radius * 2
        ))
        var ringContext = context
        ringContext.opacity = 0.08 + 0.2 * intensity
        ringContext.stroke(
            ring,
            with: .color(ReTurnDesign.Colors.Accents.continuity),
            style: StrokeStyle(lineWidth: 1.2, dash: [3, 6])
        )

        // Each dot is a comet: a bright head with a short fading trail, so
        // the streak reads as motion, not decoration.
        let count = 1 + Int((intensity * 4).rounded())
        for i in 0..<count {
            let angle = t * Motion.dotOrbitSpeed + Double(i) * (2 * .pi / Double(count))
            for k in 0..<4 {
                let fk = Double(k)
                let trailAngle = angle - fk * 0.16
                let point = CGPoint(
                    x: Design.center.x + radius * cos(trailAngle),
                    y: Design.center.y + radius * sin(trailAngle)
                )
                let diameter = 5.6 * (1 - fk * 0.18)
                var segment = context
                segment.opacity = (1 - fk / 4) * (0.35 + 0.65 * intensity)
                segment.fill(
                    Path(ellipseIn: CGRect(
                        x: point.x - diameter / 2,
                        y: point.y - diameter / 2,
                        width: diameter,
                        height: diameter
                    )),
                    with: .color(ReTurnDesign.Colors.Accents.continuity)
                )
            }
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

    /// High output flings sweat drops off the head's flanks -- the grind
    /// read. Below 50 the mascot works dry.
    private func drawOutputSweat(in context: inout GraphicsContext, t: TimeInterval, output: Double) {
        let intensity = statFraction(output)
        guard intensity > 0.5 else { return }
        let dropCount = intensity > 0.8 ? 2 : 1
        for i in 0..<dropCount {
            let fi = Double(i)
            let phase = (t * (0.6 + 0.7 * intensity) + fi * 0.5)
                .truncatingRemainder(dividingBy: 1)
            let side: CGFloat = i % 2 == 0 ? -1 : 1
            let x = Design.center.x + side * (22 + phase * 28)
            let y = 40 + phase * 55 + phase * phase * 25
            var drop = context
            drop.opacity = (1 - phase) * 0.9
            drop.translateBy(x: x, y: y)
            let scale = 0.8 + 0.4 * phase
            drop.scaleBy(x: scale, y: scale)
            drop.fill(
                MascotSweat.path(size: 7),
                with: .color(Color(red: 0.55, green: 0.78, blue: 1))
            )
        }
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

/// Teardrop used for output sweat. The path is centred on the origin with
/// the tip pointing up, so callers can translate and scale it freely.
enum MascotSweat {
    static func path(size: CGFloat) -> Path {
        let r = size / 2
        var path = Path(ellipseIn: CGRect(x: -r, y: -r * 0.4, width: size, height: size))
        path.move(to: CGPoint(x: 0, y: -r * 1.5))
        path.addLine(to: CGPoint(x: r * 0.86, y: r * 0.1))
        path.addLine(to: CGPoint(x: -r * 0.86, y: r * 0.1))
        path.closeSubpath()
        return path
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
