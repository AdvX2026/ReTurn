#if os(iOS)
import CoreGraphics

@MainActor
final class TimelineChromeScrollTracker {
    private var isScrolling = false
    private var previousOffset: CGFloat?
    private var accumulatedDistance: CGFloat = 0
    private var direction: Direction?

    func setScrolling(_ isScrolling: Bool) {
        guard isScrolling != self.isScrolling else {
            return
        }

        self.isScrolling = isScrolling
        resetMotion()
    }

    func update(offset rawOffset: CGFloat, isChromeVisible: Bool) -> Bool? {
        guard isScrolling else {
            return nil
        }

        let offset = max(rawOffset, 0)

        guard let previousOffset else {
            self.previousOffset = offset
            return nil
        }

        if offset <= TimelineDesign.Interaction.chromeTopRevealDistance {
            self.previousOffset = offset
            accumulatedDistance = 0
            direction = nil
            return isChromeVisible ? nil : true
        }

        let delta = offset - previousOffset
        self.previousOffset = offset
        guard delta != 0 else {
            return nil
        }

        let newDirection: Direction = delta > 0 ? .down : .up
        if direction == newDirection {
            accumulatedDistance += abs(delta)
        } else {
            direction = newDirection
            accumulatedDistance = abs(delta)
        }

        switch newDirection {
        case .down:
            guard
                isChromeVisible,
                accumulatedDistance >= TimelineDesign.Interaction.chromeHideDistance
            else {
                return nil
            }
            accumulatedDistance = 0
            return false
        case .up:
            guard
                !isChromeVisible,
                accumulatedDistance >= TimelineDesign.Interaction.chromeRevealDistance
            else {
                return nil
            }
            accumulatedDistance = 0
            return true
        }
    }

    private func resetMotion() {
        previousOffset = nil
        accumulatedDistance = 0
        direction = nil
    }

    private enum Direction {
        case down
        case up
    }
}
#endif
