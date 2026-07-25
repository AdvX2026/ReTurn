#if os(macOS)
import SwiftUI

/// A macOS-only animated Kongkong. It mirrors the mobile mascot's visible
/// breathing, arm, eye, sparkle and hop behavior without widening the iOS or
/// shared rendering surface.
struct MacMascotView: View {
    let stats: Stats
    var allowsContinuousMotion = true

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var isHopFeedbackActive = false

    private enum Design {
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
        static let effectVisibilityThreshold = 0.15
        static let neutralEnergy = 55.0
        static let hopHeight: CGFloat = 26
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
                    drawEnergyGlow(in: &stage, time: time)
                    drawBody(in: &stage, time: time)
                    drawIntakeSparkles(in: &stage, time: time)
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
        .accessibilityLabel("Kongkong")
        .accessibilityHint("Makes Kongkong hop")
    }

    /// Keeps the rendered character at the requested core width while the
    /// Canvas reserves space around it for glow and sparkles.
    static func frameWidth(forMascotWidth mascotWidth: CGFloat) -> CGFloat {
        mascotWidth * Design.width / Design.coreWidth
    }

    private var runsContinuousMotion: Bool {
        allowsContinuousMotion && !reduceMotion
    }

    private func performHop() {
        guard !isHopFeedbackActive else { return }

        if reduceMotion {
            withAnimation(.easeOut(duration: 0.1)) {
                isHopFeedbackActive = true
            } completion: {
                withAnimation(.easeIn(duration: 0.12)) {
                    isHopFeedbackActive = false
                }
            }
        } else {
            withAnimation(.spring(response: 0.28, dampingFraction: 0.55)) {
                isHopFeedbackActive = true
            } completion: {
                withAnimation(.spring(response: 0.38, dampingFraction: 0.75)) {
                    isHopFeedbackActive = false
                }
            }
        }
    }

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
        let amplitude = statFraction(
            stats.energy,
            min: Motion.bounceMinAmplitude,
            max: Motion.bounceMaxAmplitude
        )
        let speed = statFraction(
            stats.energy,
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

        var body = context
        body.translateBy(x: Design.pivot.x, y: Design.pivot.y)
        body.scaleBy(
            x: 1 - phase * amplitude * 0.3,
            y: 1 + phase * amplitude
        )
        body.translateBy(x: -Design.pivot.x, y: -Design.pivot.y)

        drawLimb(
            &body,
            rect: CGRect(x: 31, y: 48.2349, width: 15, height: 25),
            anchor: leftArmAnchor,
            degrees: -32 + armSwing
        )
        drawLimb(
            &body,
            rect: CGRect(
                x: Design.coreWidth - 46,
                y: 48.2349,
                width: 15,
                height: 25
            ),
            anchor: rightArmAnchor,
            degrees: 32 - armSwing
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
        drawEyes(in: &body, time: time)
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
        time: TimeInterval
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

        let focus = statFraction(stats.focus)
        let wander = (1 - focus) * 2.2 * sin(time * 0.9)
        let droop = Swift.max(0, (45 - stats.energy) / 45) * 0.55

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
            }

            if focus > Motion.effectVisibilityThreshold {
                let prominence = statFraction(
                    stats.focus,
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
                    sparklePath(size: 6),
                    with: .color(.white)
                )
            }
        }
    }

    private func drawMouth(in context: inout GraphicsContext) {
        let cheer = (statFraction(stats.energy) - 0.5) * 2
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
        time: TimeInterval
    ) {
        let intensity = Swift.max(
            0,
            Swift.min(
                (stats.energy - Motion.neutralEnergy)
                    / (100 - Motion.neutralEnergy),
                1
            )
        )
        guard intensity > 0 else { return }

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
        time: TimeInterval
    ) {
        let intensity = statFraction(stats.intake)
        guard intensity > Motion.effectVisibilityThreshold else { return }

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
            let twinkle = 0.5 + 0.5 * sin(time * 2.2 + item * 1.7)
            var sparkle = context
            sparkle.opacity =
                (1 - phase)
                * (0.45 + 0.55 * twinkle)
            sparkle.translateBy(
                x: Design.center.x + 92 * shrink * cos(angle),
                y: Design.center.y + 58 * shrink * sin(angle)
            )
            sparkle.rotate(by: .radians(item))
            let scale =
                (0.7 + 0.5 * twinkle)
                * (1 - phase * 0.4)
            sparkle.scaleBy(x: scale, y: scale)
            sparkle.fill(
                sparklePath(size: 9),
                with: .color(ReTurnDesign.Colors.Accents.intake)
            )
        }
    }

    private func sparklePath(size: CGFloat) -> Path {
        let radius = size / 2
        let shoulder = radius * 0.38
        var path = Path()
        path.move(to: CGPoint(x: 0, y: -radius))
        path.addQuadCurve(
            to: CGPoint(x: radius, y: 0),
            control: CGPoint(x: shoulder, y: -shoulder)
        )
        path.addQuadCurve(
            to: CGPoint(x: 0, y: radius),
            control: CGPoint(x: shoulder, y: shoulder)
        )
        path.addQuadCurve(
            to: CGPoint(x: -radius, y: 0),
            control: CGPoint(x: -shoulder, y: shoulder)
        )
        path.addQuadCurve(
            to: CGPoint(x: 0, y: -radius),
            control: CGPoint(x: -shoulder, y: -shoulder)
        )
        path.closeSubpath()
        return path
    }

    private func statFraction(
        _ value: Double,
        min: Double = 0,
        max: Double = 1
    ) -> Double {
        let clamped = Swift.min(Swift.max(value, 0), 100) / 100
        return min + (max - min) * clamped
    }
}
#endif
