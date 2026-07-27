#if os(macOS)
import Testing
@testable import ReTurn

struct MacTimelinePresentationTests {
    @Test func desktopTrackUsesDenseSamplerProjectionWithoutChangingSharedPresentation() throws {
        let agent = try #require(item(kind: .agent, category: "agent", durationHours: 1))
        let browse = try #require(item(kind: .feed, category: "browse_history"))
        let text = try #require(item(kind: .feed, category: "text"))

        #expect(agent.presentation == .major)
        #expect(agent.macTrackPresentation == .span)
        #expect(browse.presentation == .point)
        #expect(browse.macTrackPresentation == .ambient)
        #expect(text.macTrackPresentation == .point)
    }

    private func item(
        kind: TimelineSegmentKind,
        category: String,
        durationHours: Int = 0
    ) -> TimelineDisplayItem? {
        TimelineDisplayItem(
            segment: TimelineSegment(
                kind: kind,
                start: "2026-07-24T09:00:00Z",
                end: durationHours == 0
                    ? "2026-07-24T09:00:00Z"
                    : "2026-07-24T10:00:00Z",
                label: "Event",
                category: category,
                nodeId: nil,
                meta: nil,
                date: "2026-07-24"
            )
        )
    }
}
#endif
