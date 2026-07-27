#if os(iOS)
import SwiftUI

/// Kongkong on the Now page, rendered as layered native drawing so its body,
/// face, stats, and profession accessories can animate independently.
///
/// Every drawing constant uses the original 175×150 core coordinate space.
/// The Canvas adds one outer padding transform so orbiting effects are not
/// clipped, but renderers never introduce a second set of coordinates.
struct MascotView: View {
    var stats: Stats?
    var profession: MascotProfession = .coder
    var allowsContinuousMotion = true
    var onHop: (() -> Void)?

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isHopFeedbackActive = false
    @State private var emote: (kind: Emote, started: Date)?

    enum Design {
        static let coreWidth: CGFloat = 175
        static let coreHeight: CGFloat = 150
        static let padX: CGFloat = 30
        static let padY: CGFloat = 30
        static let width = coreWidth + padX * 2
        static let height = coreHeight + padY * 2
        static let bodyColor = Color(
            red: 0x5F / 255,
            green: 0x87 / 255,
            blue: 0xE6 / 255
        )
        static let pivot = CGPoint(x: 87.5, y: 140)
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
        static let effectVisibilityThreshold = 0.15
        static let neutralEnergy = 55.0
        static let hopHeight: CGFloat = 26
        static let emoteCheckInterval = 6.0
    }

    private enum Emote: String, CaseIterable {
        case wave, cheer, twirl

        var duration: TimeInterval {
            switch self {
            case .wave: 1.6
            case .cheer: 1.4
            case .twirl: 1.1
            }
        }
    }

    var body: some View {
        Button(action: performHop) {
            SwiftUI.TimelineView(
                .animation(paused: !runsContinuousMotion)
            ) { timeline in
                let time = runsContinuousMotion
                    ? timeline.date.timeIntervalSinceReferenceDate
                    : 0

                Canvas { context, size in
                    let unit = size.width / Design.width
                    var stage = context
                    stage.translateBy(
                        x: Design.padX * unit,
                        y: Design.padY * unit
                    )
                    stage.scaleBy(x: unit, y: unit)

                    drawGroundShadow(in: &stage)
                    if let stats {
                        drawEnergyGlow(
                            in: &stage,
                            time: time,
                            energy: stats.energy
                        )
                    }
                    drawBody(in: &stage, time: time)
                    MascotAccessory.drawFloating(
                        profession,
                        in: &stage,
                        time: time
                    )
                    if let stats {
                        drawIntakeSparkles(
                            in: &stage,
                            time: time,
                            intake: stats.intake
                        )
                        drawContinuityOrbit(
                            in: &stage,
                            time: time,
                            continuity: stats.continuity
                        )
                        drawOutputGear(
                            in: &stage,
                            time: time,
                            output: stats.output
                        )
                        drawOutputSweat(
                            in: &stage,
                            time: time,
                            output: stats.output
                        )
                    }
                } symbols: {
                    Image(systemName: "gearshape.fill")
                        .tag(MascotSymbol.gear)
                }
                .accessibilityHidden(true)
            }
            .aspectRatio(Design.width / Design.height, contentMode: .fit)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .offset(
            y: isHopFeedbackActive && !reduceMotion
                ? -Motion.hopHeight
                : 0
        )
        .opacity(
            isHopFeedbackActive && reduceMotion
                ? 0.72
                : 1
        )
        .accessibilityLabel(accessibilitySummary)
        .accessibilityIdentifier("NowMascot")
        .task(id: runsContinuousMotion) {
            guard runsContinuousMotion else {
                emote = nil
                return
            }

            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(Motion.emoteCheckInterval))
                guard !Task.isCancelled, runsContinuousMotion else {
                    return
                }
                guard emote == nil else {
                    continue
                }

                let kind: Emote?
                if let pinned = ProcessInfo.processInfo.environment["MASCOT_EMOTE"] {
                    kind = Emote(rawValue: pinned)
                } else {
                    kind = Double.random(in: 0...1) < 0.55
                        ? Emote.allCases.randomElement()
                        : nil
                }
                guard let kind else {
                    continue
                }

                emote = (kind, .now)
                try? await Task.sleep(for: .seconds(kind.duration))
                guard !Task.isCancelled else {
                    return
                }
                emote = nil
            }
        }
    }

    /// Frame width that preserves the requested core mascot width while the
    /// Canvas reserves space for its orbiting effects.
    static func frameWidth(forMascotWidth mascotWidth: CGFloat) -> CGFloat {
        mascotWidth * Design.width / Design.coreWidth
    }

    private var runsContinuousMotion: Bool {
        allowsContinuousMotion && !reduceMotion
    }

    private func performHop() {
        guard !isHopFeedbackActive else {
            return
        }

        onHop?()

        if reduceMotion {
            withAnimation(.easeOut(duration: 0.1)) {
                isHopFeedbackActive = true
            } completion: {
                withAnimation(.easeIn(duration: 0.12)) {
                    isHopFeedbackActive = false
                }
            }
        } else {
            withAnimation(
                .spring(response: 0.28, dampingFraction: 0.55)
            ) {
                isHopFeedbackActive = true
            } completion: {
                withAnimation(
                    .spring(response: 0.38, dampingFraction: 0.75)
                ) {
                    isHopFeedbackActive = false
                }
            }
        }
    }

    // MARK: - Body

    private func bodyPath() -> Path {
        var path = Path()
        path.move(to: CGPoint(x: 88, y: 2.25))
        path.addLine(to: CGPoint(x: 151.91, y: 112.5))
        path.addLine(to: CGPoint(x: 24.09, y: 112.5))
        path.closeSubpath()
        return path
    }

    private func fillBody(
        _ context: inout GraphicsContext,
        color: Color
    ) {
        context.fill(bodyPath(), with: .color(color))
        context.stroke(
            bodyPath(),
            with: .color(color),
            style: StrokeStyle(lineWidth: 8, lineJoin: .round)
        )
    }

    private func drawBody(
        in context: inout GraphicsContext,
        time: TimeInterval
    ) {
        let energy = stats?.energy ?? 50
        var amplitude = statFraction(
            energy,
            min: Motion.bounceMinAmplitude,
            max: Motion.bounceMaxAmplitude
        )
        let speed = statFraction(
            energy,
            min: Motion.bounceMinSpeed,
            max: Motion.bounceMaxSpeed
        )
        let phase = sin(time * speed * .pi)

        let leftArmAnchor = CGPoint(x: 38.5, y: 60.7349)
        let rightArmAnchor = CGPoint(
            x: Design.coreWidth - leftArmAnchor.x,
            y: leftArmAnchor.y
        )
        let armSwing =
            sin(time * speed * .pi + 1.2)
            * Motion.armWaveAmplitude
        var leftArmDegrees = -32 + armSwing
        var rightArmDegrees = -leftArmDegrees
        var emoteTwirl = 0.0
        var cheerGlints = false

        if let emote {
            let progress = Swift.min(
                (time - emote.started.timeIntervalSinceReferenceDate)
                    / emote.kind.duration,
                1
            )
            let raise = Self.emoteEnvelope(progress)
            switch emote.kind {
            case .wave:
                rightArmDegrees = 32 + raise * (95 + 12 * sin(time * 10))
            case .cheer:
                leftArmDegrees = -32 - raise * 105
                rightArmDegrees = 32 + raise * 105
                amplitude += raise * 0.05
                cheerGlints = raise > 0.3
            case .twirl:
                emoteTwirl = 360 * Self.smoothstep(progress)
            }
        }

        var body = context
        body.translateBy(x: Design.pivot.x, y: Design.pivot.y)
        body.scaleBy(
            x: 1 - phase * amplitude * 0.3,
            y: 1 + phase * amplitude
        )
        body.translateBy(x: -Design.pivot.x, y: -Design.pivot.y)
        if emoteTwirl != 0 {
            body.translateBy(x: Design.center.x, y: Design.center.y)
            body.rotate(by: .degrees(emoteTwirl))
            body.translateBy(x: -Design.center.x, y: -Design.center.y)
        }

        drawLimb(
            &body,
            rect: CGRect(x: 31, y: 48.2349, width: 15, height: 25),
            anchor: leftArmAnchor,
            degrees: leftArmDegrees
        )
        drawLimb(
            &body,
            rect: CGRect(
                x: Design.coreWidth - 31 - 15,
                y: 48.2349,
                width: 15,
                height: 25
            ),
            anchor: rightArmAnchor,
            degrees: rightArmDegrees
        )
        drawLimb(
            &body,
            rect: CGRect(x: 46, y: 102, width: 15, height: 25),
            anchor: CGPoint(x: 53.5, y: 104),
            degrees: 0
        )
        drawLimb(
            &body,
            rect: CGRect(x: 113, y: 102, width: 15, height: 25),
            anchor: CGPoint(x: 120.5, y: 104),
            degrees: 0
        )

        fillBody(&body, color: Design.bodyColor)
        MascotAccessory.drawWorn(
            profession,
            in: &body,
            leftArm: (
                anchor: leftArmAnchor,
                degrees: leftArmDegrees
            )
        )
        drawEyes(in: &body, time: time, forceGlints: cheerGlints)
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
        limb.rotate(by: .degrees(degrees))
        limb.translateBy(x: -anchor.x, y: -anchor.y)
        limb.fill(
            Path(roundedRect: rect, cornerRadius: 4),
            with: .color(Design.bodyColor)
        )
    }

    private func drawEyes(
        in context: inout GraphicsContext,
        time: TimeInterval,
        forceGlints: Bool = false
    ) {
        let cycle = time.truncatingRemainder(
            dividingBy: Motion.blinkInterval
        )
        let blinkScale: Double
        if !runsContinuousMotion {
            blinkScale = 1
        } else if cycle < Motion.blinkDuration {
            blinkScale = 0.08
                + 0.92
                * abs(
                    cos(
                        cycle
                            / Motion.blinkDuration
                            * .pi
                            / 2
                    )
                )
        } else {
            blinkScale = 1
        }

        let focus = stats?.focus ?? (forceGlints ? 85 : 50)
        let wander =
            (1 - statFraction(focus))
            * 2.2
            * sin(time * 0.9)
        let energy = stats?.energy ?? 50
        let droop = Swift.max(0, (45 - energy) / 45) * 0.55

        for eyeX in [68.0, 97.0] as [CGFloat] {
            let eyeRect = CGRect(
                x: eyeX,
                y: 48,
                width: 10,
                height: 17
            )
            var eye = context
            eye.translateBy(x: eyeRect.midX, y: eyeRect.midY)
            eye.scaleBy(x: 1, y: blinkScale)
            eye.translateBy(
                x: -eyeRect.midX + wander,
                y: -eyeRect.midY
            )
            eye.fill(
                Path(roundedRect: eyeRect, cornerRadius: 3),
                with: .color(.black)
            )

            if droop > 0.01 {
                let lidHeight = eyeRect.height * droop
                eye.fill(
                    Path(
                        roundedRect: CGRect(
                            x: eyeRect.minX - 0.5,
                            y: eyeRect.minY - 0.5,
                            width: eyeRect.width + 1,
                            height: lidHeight + 0.5
                        ),
                        cornerRadius: 3
                    ),
                    with: .color(Design.bodyColor)
                )

                var crease = Path()
                crease.move(
                    to: CGPoint(
                        x: eyeRect.minX,
                        y: eyeRect.minY + lidHeight
                    )
                )
                crease.addLine(
                    to: CGPoint(
                        x: eyeRect.maxX,
                        y: eyeRect.minY + lidHeight
                    )
                )
                eye.stroke(
                    crease,
                    with: .color(.black.opacity(0.25)),
                    lineWidth: 1
                )
            }

            if forceGlints
                || (stats?.focus != nil
                    && statFraction(focus) > Motion.effectVisibilityThreshold) {
                let prominence = statFraction(
                    focus,
                    min: 0.35,
                    max: 1
                )
                let pulse = 1 + 0.18 * sin(time * 2.4 + eyeX)
                var glint = context
                glint.opacity = prominence
                glint.translateBy(
                    x: eyeRect.midX + 1.5 + wander,
                    y: eyeRect.midY - 3.5
                )
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
            Path(
                ellipseIn: CGRect(
                    x: 37.5,
                    y: 143,
                    width: 100,
                    height: 10
                )
            ),
            with: .color(.black)
        )
    }

    private func drawEnergyGlow(
        in context: inout GraphicsContext,
        time: TimeInterval,
        energy: Double
    ) {
        let intensity = Swift.max(
            0,
            Swift.min(
                (energy - Motion.neutralEnergy)
                    / (100 - Motion.neutralEnergy),
                1
            )
        )
        guard intensity > 0 else {
            return
        }

        var glow = context
        glow.addFilter(.blur(radius: 10))
        glow.opacity =
            (0.08 + 0.22 * intensity)
            * (1 + 0.15 * sin(time * 2))
        fillBody(
            &glow,
            color: ReTurnDesign.Colors.Accents.energy
        )
    }

    private func drawIntakeSparkles(
        in context: inout GraphicsContext,
        time: TimeInterval,
        intake: Double
    ) {
        let intensity = statFraction(intake)
        guard intensity > Motion.effectVisibilityThreshold else {
            return
        }

        let count = 2 + Int((intensity * 5).rounded())

        for index in 0..<count {
            let item = Double(index)
            let phase = (
                time * (0.25 + 0.45 * intensity)
                    + item / Double(count)
            )
            .truncatingRemainder(dividingBy: 1)
            let angle =
                time * Motion.sparkleOrbitSpeed
                + item * (2 * .pi / Double(count))
            let shrink = 1 - phase * 0.5
            let twinkle =
                0.5
                + 0.5
                * sin(time * 2.2 + item * 1.7)
            var sparkle = context
            sparkle.opacity =
                (1 - phase)
                * (0.45 + 0.55 * twinkle)
            sparkle.translateBy(
                x: Design.center.x
                    + 92 * shrink * cos(angle),
                y: Design.center.y
                    + 58 * shrink * sin(angle)
            )
            sparkle.rotate(by: .radians(item))
            let scale =
                (0.7 + 0.5 * twinkle)
                * (1 - phase * 0.4)
            sparkle.scaleBy(x: scale, y: scale)
            sparkle.fill(
                MascotSparkle.path(size: 9),
                with: .color(
                    ReTurnDesign.Colors.Accents.intake
                )
            )
        }
    }

    private func drawContinuityOrbit(
        in context: inout GraphicsContext,
        time: TimeInterval,
        continuity: Double
    ) {
        let intensity = statFraction(continuity)
        guard intensity > Motion.effectVisibilityThreshold else {
            return
        }

        let radius: CGFloat = 76
        var ring = Path()
        ring.addEllipse(
            in: CGRect(
                x: Design.center.x - radius,
                y: Design.center.y - radius,
                width: radius * 2,
                height: radius * 2
            )
        )

        var ringContext = context
        ringContext.opacity = 0.08 + 0.2 * intensity
        ringContext.stroke(
            ring,
            with: .color(
                ReTurnDesign.Colors.Accents.continuity
            ),
            style: StrokeStyle(
                lineWidth: 1.2,
                dash: [3, 6]
            )
        )

        let count = 1 + Int((intensity * 4).rounded())
        for index in 0..<count {
            let angle =
                time * Motion.dotOrbitSpeed
                + Double(index)
                    * (2 * .pi / Double(count))
            for trailIndex in 0..<4 {
                let trail = Double(trailIndex)
                let trailAngle = angle - trail * 0.16
                let point = CGPoint(
                    x: Design.center.x
                        + radius * cos(trailAngle),
                    y: Design.center.y
                        + radius * sin(trailAngle)
                )
                let diameter = 5.6 * (1 - trail * 0.18)
                var segment = context
                segment.opacity =
                    (1 - trail / 4)
                    * (0.35 + 0.65 * intensity)
                segment.fill(
                    Path(
                        ellipseIn: CGRect(
                            x: point.x - diameter / 2,
                            y: point.y - diameter / 2,
                            width: diameter,
                            height: diameter
                        )
                    ),
                    with: .color(
                        ReTurnDesign.Colors.Accents.continuity
                    )
                )
            }
        }
    }

    private func drawOutputGear(
        in context: inout GraphicsContext,
        time: TimeInterval,
        output: Double
    ) {
        let intensity = statFraction(output)
        guard intensity > Motion.effectVisibilityThreshold else {
            return
        }

        guard
            let resolved = context.resolveSymbol(
                id: MascotSymbol.gear
            )
        else {
            return
        }

        let spinSpeed = statFraction(
            output,
            min: Motion.gearMinSpin,
            max: Motion.gearMaxSpin
        )
        var gear = context
        gear.opacity = 0.35 + 0.65 * intensity
        gear.translateBy(x: 166, y: 82)
        gear.rotate(by: .radians(time * spinSpeed))
        gear.draw(
            resolved,
            in: CGRect(x: -7.5, y: -7.5, width: 15, height: 15)
        )
    }

    private func drawOutputSweat(
        in context: inout GraphicsContext,
        time: TimeInterval,
        output: Double
    ) {
        let intensity = statFraction(output)
        guard intensity > 0.5 else {
            return
        }

        let dropCount = intensity > 0.8 ? 2 : 1
        for index in 0..<dropCount {
            let item = Double(index)
            let phase = (
                time * (0.6 + 0.7 * intensity)
                    + item * 0.5
            )
            .truncatingRemainder(dividingBy: 1)
            let side: CGFloat = index.isMultiple(of: 2)
                ? -1
                : 1
            let x =
                Design.center.x
                + side * (22 + phase * 28)
            let y =
                40
                + phase * 55
                + phase * phase * 25
            var drop = context
            drop.opacity = (1 - phase) * 0.9
            drop.translateBy(x: x, y: y)
            let scale = 0.8 + 0.4 * phase
            drop.scaleBy(x: scale, y: scale)
            drop.fill(
                MascotSweat.path(size: 7),
                with: .color(
                    Color(
                        red: 0.55,
                        green: 0.78,
                        blue: 1
                    )
                )
            )
        }
    }

    // MARK: - Helpers

    private enum MascotSymbol {
        case gear
    }

    private func statFraction(
        _ value: Double,
        min: Double = 0,
        max: Double = 1
    ) -> Double {
        let clamped =
            Swift.min(
                Swift.max(value, 0),
                100
            )
            / 100
        return min + (max - min) * clamped
    }

    private static func emoteEnvelope(_ progress: Double) -> Double {
        smoothstep(
            Swift.min(progress / 0.25, 1)
                * Swift.min((1 - progress) / 0.25, 1)
        )
    }

    private static func smoothstep(_ value: Double) -> Double {
        let clamped = Swift.min(Swift.max(value, 0), 1)
        return clamped * clamped * (3 - 2 * clamped)
    }

    private var accessibilitySummary: Text {
        var parts = [
            "Kongkong",
            profession.displayName,
        ]
        if let stats {
            parts.append(
                """
                intake \(Int(stats.intake)), focus \(Int(stats.focus)), \
                output \(Int(stats.output)), continuity \(Int(stats.continuity)), \
                energy \(Int(stats.energy))
                """
            )
        }
        return Text(parts.joined(separator: ", "))
    }
}
#endif
