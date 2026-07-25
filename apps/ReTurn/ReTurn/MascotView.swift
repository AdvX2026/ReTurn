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
struct MascotView: View {
    /// `nil` renders the plain mascot with no stat wearables.
    var stats: Stats?
    var profession: MascotProfession = .coder
    var onHop: (() -> Void)?

    @State private var hopping = false

    /// Figma coordinates of the merged asset: the whole SVG is 175×150, the
    /// triangle body alone is 175×112.5 with limbs sticking out below/sideways.
    enum Design {
        static let coreWidth: CGFloat = 175
        static let coreHeight: CGFloat = 150
        /// Extra room around the core so sparkles, orbit and accessories are
        /// not clipped by the canvas.
        static let padX: CGFloat = 30
        static let padY: CGFloat = 30
        static let width = coreWidth + padX * 2
        static let height = coreHeight + padY * 2
        static let origin = CGPoint(x: padX, y: padY)
        static let bodyColor = Color(red: 0x5F / 255, green: 0x87 / 255, blue: 0xE6 / 255)
        static let groundY = padY + 140
        static let center = CGPoint(x: padX + 87.5, y: padY + 70)
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
                drawGroundShadow(context: &context, unit: unit)
                if let stats {
                    drawEnergyGlow(context: &context, unit: unit, t: t, energy: stats.energy)
                }
                drawBodyGroup(context: &context, unit: unit, t: t)
                MascotAccessory.drawFloating(profession, in: &context, unit: unit, t: t)
                if let stats {
                    drawIntakeSparkles(context: &context, unit: unit, t: t, intake: stats.intake)
                    drawContinuityOrbit(context: &context, unit: unit, t: t, continuity: stats.continuity)
                    drawOutputGear(context: &context, unit: unit, t: t, output: stats.output)
                }
            } symbols: {
                Image(systemName: "gearshape.fill")
                    .tag(MascotSymbol.gear)
            }
            .accessibilityHidden(true)
        }
        .aspectRatio(Design.width / Design.height, contentMode: .fit)
        .offset(y: hopping ? -Motion.hopHeight : 0)
        .animation(.spring(response: 0.32, dampingFraction: 0.45), value: hopping)
        .contentShape(.rect)
        .onTapGesture {
            // Retoggling mid-hop re-triggers the spring, so rapid taps read as
            // excited bouncing rather than a swallowed gesture.
            hopping.toggle()
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

    /// Legs, arms, body and the squash-and-stretch bounce, anchored at the
    /// ground so the feet stay planted while the body breathes.
    private func drawBodyGroup(context: inout GraphicsContext, unit: CGFloat, t: TimeInterval) {
        let energy = stats?.energy ?? 50
        let amplitude = statFraction(energy, min: Motion.bounceMinAmplitude, max: Motion.bounceMaxAmplitude)
        let speed = statFraction(energy, min: Motion.bounceMinSpeed, max: Motion.bounceMaxSpeed)
        let phase = sin(t * speed * .pi)
        // Counter-phase horizontal squash keeps the silhouette's volume.
        let squash = 1 - phase * amplitude * 0.3

        var group = context
        group.concatenate(
            CGAffineTransform(translationX: Design.center.x * unit, y: Design.groundY * unit)
                .scaledBy(x: squash * unit, y: (1 + phase * amplitude) * unit)
                .translatedBy(x: -Design.center.x, y: -Design.groundY)
        )

        // Arms pivot where they meet the body; they wave with the bounce.
        // Folded a few degrees inward from the Figma pose so they nestle
        // against the body's slope instead of hovering off it.
        let wave = sin(t * speed * .pi + 1.2) * Motion.armWaveAmplitude
        drawLimb(
            &group,
            rect: CGRect(x: 31, y: 48.2349, width: 15, height: 25),
            anchor: CGPoint(x: 38.5, y: 60.7349),
            angle: -32 + wave
        )
        drawLimb(
            &group,
            rect: CGRect(x: 132.392, y: 39, width: 15, height: 25),
            anchor: CGPoint(x: 139.892, y: 51.5),
            angle: 32 - wave
        )

        for legX in [46.0, 113.0] as [CGFloat] {
            group.fill(
                Path(roundedRect: CGRect(x: legX, y: 102, width: 15, height: 25), cornerRadius: 4),
                with: .color(Design.bodyColor)
            )
        }

        fillBody(&group, color: Design.bodyColor)

        // Worn accessories and the face live inside the squash group, so
        // glasses, tie and eyes deform with the body like proper cartoon wear.
        MascotAccessory.drawWorn(profession, in: &group)
        drawEyes(in: &group, t: t)
    }

    private func drawLimb(
        _ context: inout GraphicsContext,
        rect: CGRect,
        anchor: CGPoint,
        angle: Double
    ) {
        var limb = context
        limb.concatenate(
            CGAffineTransform(translationX: anchor.x, y: anchor.y)
                .rotated(by: angle * .pi / 180)
                .translatedBy(x: -anchor.x, y: -anchor.y)
        )
        limb.fill(
            Path(roundedRect: rect, cornerRadius: 4),
            with: .color(Design.bodyColor)
        )
    }

    /// Eyes draw inside the body group (plain design coordinates — the group
    /// transform already carries the unit scale) so they stay glued to the
    /// face through the squash.
    private func drawEyes(in context: inout GraphicsContext, t: TimeInterval) {
        let cycle = t.truncatingRemainder(dividingBy: Motion.blinkInterval)
        // Smooth close-open inside the blink window; wide open otherwise.
        let blinkScale = cycle < Motion.blinkDuration
            ? 0.08 + 0.92 * abs(cos(cycle / Motion.blinkDuration * .pi / 2))
            : 1

        for eyeX in [68.0, 97.0] as [CGFloat] {
            let eyeRect = CGRect(x: eyeX, y: 48, width: 10, height: 17)
            let center = CGPoint(x: eyeRect.midX, y: eyeRect.midY)
            var eye = context
            eye.concatenate(
                CGAffineTransform(translationX: center.x, y: center.y)
                    .scaledBy(x: 1, y: blinkScale)
                    .translatedBy(x: -center.x, y: -center.y)
            )
            eye.fill(
                Path(roundedRect: eyeRect, cornerRadius: 3),
                with: .color(.black)
            )

            if let focus = stats?.focus {
                let prominence = statFraction(focus, min: 0.35, max: 1)
                let pulse = 1 + 0.18 * sin(t * 2.4 + eyeX)
                var glint = context
                glint.opacity = prominence
                glint.concatenate(
                    CGAffineTransform(translationX: center.x + 1.5, y: center.y - 3.5)
                        .scaledBy(x: prominence * pulse, y: prominence * pulse * blinkScale)
                )
                glint.fill(
                    MascotSparkle.path(size: 6),
                    with: .color(.white)
                )
            }
        }
    }

    // MARK: - Stat wearables

    private func drawGroundShadow(context: inout GraphicsContext, unit: CGFloat) {
        var shadow = context
        shadow.addFilter(.blur(radius: 5 * unit))
        shadow.opacity = 0.12
        shadow.fill(
            Path(ellipseIn: CGRect(
                x: (Design.center.x - 50) * unit,
                y: (Design.groundY + 3) * unit,
                width: 100 * unit,
                height: 10 * unit
            )),
            with: .color(.black)
        )
    }

    private func drawEnergyGlow(
        context: inout GraphicsContext,
        unit: CGFloat,
        t: TimeInterval,
        energy: Double
    ) {
        var glow = context
        glow.addFilter(.blur(radius: 10 * unit))
        glow.opacity = statFraction(energy, min: 0.06, max: 0.3) * (1 + 0.15 * sin(t * 2))
        glow.concatenate(
            CGAffineTransform(translationX: Design.origin.x * unit, y: Design.origin.y * unit)
                .scaledBy(x: unit, y: unit)
        )
        fillBody(&glow, color: ReTurnDesign.Colors.Accents.energy)
    }

    private func drawIntakeSparkles(
        context: inout GraphicsContext,
        unit: CGFloat,
        t: TimeInterval,
        intake: Double
    ) {
        let count = 1 + Int((statFraction(intake) * 5).rounded())
        for i in 0..<count {
            let fi = Double(i)
            let angle = t * Motion.sparkleOrbitSpeed + fi * (2 * .pi / Double(count))
            let center = CGPoint(
                x: (Design.center.x + 92 * cos(angle)) * unit,
                y: (Design.center.y + 58 * sin(angle)) * unit
            )
            let twinkle = 0.5 + 0.5 * sin(t * 2.2 + fi * 1.7)
            var sparkle = context
            sparkle.opacity = 0.35 + 0.65 * twinkle
            sparkle.concatenate(
                CGAffineTransform(translationX: center.x, y: center.y)
                    .scaledBy(x: unit * (0.7 + 0.5 * twinkle), y: unit * (0.7 + 0.5 * twinkle))
                    .rotated(by: fi)
            )
            sparkle.fill(
                MascotSparkle.path(size: 9),
                with: .color(ReTurnDesign.Colors.Accents.intake)
            )
        }
    }

    private func drawContinuityOrbit(
        context: inout GraphicsContext,
        unit: CGFloat,
        t: TimeInterval,
        continuity: Double
    ) {
        let radius: CGFloat = 76
        var ring = Path()
        ring.addEllipse(in: CGRect(
            x: (Design.center.x - radius) * unit,
            y: (Design.center.y - radius) * unit,
            width: radius * 2 * unit,
            height: radius * 2 * unit
        ))
        var ringContext = context
        ringContext.opacity = 0.18
        ringContext.stroke(
            ring,
            with: .color(ReTurnDesign.Colors.Accents.continuity),
            style: StrokeStyle(lineWidth: 1.2 * unit, dash: [3 * unit, 6 * unit])
        )

        let count = 1 + Int((statFraction(continuity) * 4).rounded())
        for i in 0..<count {
            let angle = t * Motion.dotOrbitSpeed + Double(i) * (2 * .pi / Double(count))
            let center = CGPoint(
                x: (Design.center.x + radius * cos(angle)) * unit,
                y: (Design.center.y + radius * sin(angle)) * unit
            )
            context.fill(
                Path(ellipseIn: CGRect(x: center.x - 2.8 * unit, y: center.y - 2.8 * unit, width: 5.6 * unit, height: 5.6 * unit)),
                with: .color(ReTurnDesign.Colors.Accents.continuity)
            )
        }
    }

    private func drawOutputGear(
        context: inout GraphicsContext,
        unit: CGFloat,
        t: TimeInterval,
        output: Double
    ) {
        let spinSpeed = statFraction(output, min: Motion.gearMinSpin, max: Motion.gearMaxSpin)
        guard let resolved = context.resolveSymbol(id: MascotSymbol.gear) else { return }
        var gear = context
        gear.opacity = 0.9
        gear.concatenate(
            CGAffineTransform(translationX: (Design.origin.x + 166) * unit, y: (Design.origin.y + 82) * unit)
                .rotated(by: t * spinSpeed)
                .translatedBy(x: -7.5 * unit, y: -7.5 * unit)
                .scaledBy(x: unit, y: unit)
        )
        gear.draw(resolved, in: CGRect(x: 0, y: 0, width: 15, height: 15))
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
