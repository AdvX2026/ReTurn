#if os(iOS)
import Foundation
import Testing
@testable import ReTurn

struct TimelinePresentationTests {
    @Test func mapsContractKindsToTimelinePresentation() throws {
        let point = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .feed,
                    start: "2026-07-24T09:00:00Z",
                    end: "2026-07-24T09:00:00Z"
                )
            )
        )
        let span = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .app,
                    start: "2026-07-24T09:00:00Z",
                    end: "2026-07-24T10:00:00Z"
                )
            )
        )
        let major = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .agent,
                    start: "2026-07-24T09:00:00Z",
                    end: "2026-07-24T10:00:00Z"
                )
            )
        )

        #expect(point.presentation == .point)
        #expect(span.presentation == .span)
        #expect(major.presentation == .major)
    }

    @Test func groupsNewestDaysFirstAndEventsChronologically() {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt

        let days = TimelineDay.grouped(
            from: [
                segment(
                    kind: .feed,
                    start: "2026-07-23T14:00:00Z",
                    end: "2026-07-23T14:00:00Z",
                    label: "Older afternoon"
                ),
                segment(
                    kind: .feed,
                    start: "2026-07-24T11:00:00Z",
                    end: "2026-07-24T11:00:00Z",
                    label: "Newest"
                ),
                segment(
                    kind: .feed,
                    start: "2026-07-23T08:00:00Z",
                    end: "2026-07-23T08:00:00Z",
                    label: "Older morning"
                ),
            ],
            calendar: calendar
        )

        #expect(days.count == 2)
        #expect(days[0].items.map(\.label) == ["Newest"])
        #expect(days[1].items.map(\.label) == ["Older morning", "Older afternoon"])
    }

    @Test func ignoresSegmentsWithInvalidStartDates() {
        let days = TimelineDay.grouped(
            from: [
                segment(
                    kind: .feed,
                    start: "not-a-date",
                    end: "2026-07-24T11:00:00Z"
                )
            ]
        )

        #expect(days.isEmpty)
    }

    @Test func groupsCrossMidnightSegmentsByServerDate() throws {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(secondsFromGMT: 0) ?? .gmt

        let days = TimelineDay.grouped(
            from: [
                segment(
                    kind: .sleep,
                    start: "2026-07-23T23:00:00Z",
                    end: "2026-07-24T07:00:00Z",
                    date: "2026-07-24"
                )
            ],
            calendar: calendar
        )

        let day = try #require(days.first)
        let components = calendar.dateComponents([.year, .month, .day], from: day.date)
        #expect(components.year == 2026)
        #expect(components.month == 7)
        #expect(components.day == 24)
    }

    private func segment(
        kind: TimelineSegmentKind,
        start: String,
        end: String,
        label: String = "Event",
        date: String? = nil
    ) -> TimelineSegment {
        TimelineSegment(
            kind: kind,
            start: start,
            end: end,
            label: label,
            category: nil,
            nodeId: nil,
            meta: nil,
            date: date
        )
    }
}
#endif
