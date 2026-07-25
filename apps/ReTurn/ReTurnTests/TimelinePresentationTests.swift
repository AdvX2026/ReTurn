#if os(iOS)
import Foundation
import Testing
@testable import ReTurn

@MainActor
struct TimelinePresentationTests {
    @Test func timelineChromeHidesOnlyAfterMeaningfulDownwardTravel() {
        let tracker = TimelineChromeScrollTracker()
        tracker.setScrolling(true)

        #expect(tracker.update(offset: 0, isChromeVisible: true) == nil)
        #expect(tracker.update(offset: 12, isChromeVisible: true) == nil)
        #expect(tracker.update(offset: 23, isChromeVisible: true) == nil)
        #expect(tracker.update(offset: 24, isChromeVisible: true) == false)
    }

    @Test func timelineChromeRevealsSoonerWhenScrollingUp() {
        let tracker = TimelineChromeScrollTracker()
        tracker.setScrolling(true)

        _ = tracker.update(offset: 0, isChromeVisible: true)
        _ = tracker.update(offset: 24, isChromeVisible: true)

        #expect(tracker.update(offset: 18, isChromeVisible: false) == nil)
        #expect(tracker.update(offset: 12, isChromeVisible: false) == true)
    }

    @Test func timelineChromeDirectionReversalResetsItsTravelAnchor() {
        let tracker = TimelineChromeScrollTracker()
        tracker.setScrolling(true)

        _ = tracker.update(offset: 0, isChromeVisible: true)
        #expect(tracker.update(offset: 18, isChromeVisible: true) == nil)
        #expect(tracker.update(offset: 10, isChromeVisible: true) == nil)
        #expect(tracker.update(offset: 33, isChromeVisible: true) == nil)
        #expect(tracker.update(offset: 34, isChromeVisible: true) == false)
    }

    @Test func timelineChromeAlwaysRevealsAtTheTop() {
        let tracker = TimelineChromeScrollTracker()
        tracker.setScrolling(true)

        #expect(tracker.update(offset: 10, isChromeVisible: false) == nil)
        #expect(tracker.update(offset: 8, isChromeVisible: false) == true)
    }

    @Test func timelineChromeIgnoresLayoutOffsetsWhileIdle() {
        let tracker = TimelineChromeScrollTracker()

        #expect(tracker.update(offset: 120, isChromeVisible: true) == nil)
    }

    @Test func timelineChromeResetsMotionBetweenScrollPhases() {
        let tracker = TimelineChromeScrollTracker()
        tracker.setScrolling(true)

        _ = tracker.update(offset: 0, isChromeVisible: true)
        #expect(tracker.update(offset: 20, isChromeVisible: true) == nil)

        tracker.setScrolling(false)
        #expect(tracker.update(offset: 80, isChromeVisible: true) == nil)

        tracker.setScrolling(true)
        #expect(tracker.update(offset: 80, isChromeVisible: true) == nil)
        #expect(tracker.update(offset: 84, isChromeVisible: true) == nil)
    }

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

    @Test func acceptsExplicitAmbientAndClusterProjection() throws {
        let preview = TimelineClusterPreview(
            entries: [
                .init(
                    id: "commit",
                    time: "09:12",
                    title: "Commit created",
                    symbolName: "arrow.triangle.branch"
                ),
                .init(
                    id: "build",
                    time: "09:42",
                    title: "Build passed",
                    symbolName: "circle.fill"
                ),
            ],
            totalCount: 4
        )
        let ambientItem = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .feed,
                    start: "2026-07-24T09:00:00Z",
                    end: "2026-07-24T09:00:00Z"
                ),
                presentation: .ambient
            )
        )
        let clusterItem = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .agent,
                    start: "2026-07-24T09:00:00Z",
                    end: "2026-07-24T10:00:00Z"
                ),
                clusterPreview: preview
            )
        )

        #expect(ambientItem.presentation == .ambient)
        #expect(clusterItem.clusterPreview == preview)
        #expect(clusterItem.clusterPreview?.remainingCount == 2)
        #expect(
            TimelineDay(date: clusterItem.start, items: [clusterItem]).representedEventCount == 4
        )
        #expect(clusterItem.accessibilityValue.contains("Commit created"))
        #expect(clusterItem.accessibilityValue.contains("Build passed"))

        let emptyPreview = TimelineClusterPreview(entries: [], totalCount: 0)
        #expect(emptyPreview.totalCount == 1)
    }

    @Test func identifiesOnlyExplicitInputFeedCategories() throws {
        let textInput = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .feed,
                    start: "2026-07-24T09:00:00Z",
                    end: "2026-07-24T09:00:00Z",
                    category: "text"
                )
            )
        )
        let voiceInput = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .feed,
                    start: "2026-07-24T10:00:00Z",
                    end: "2026-07-24T10:00:00Z",
                    category: "voice"
                )
            )
        )
        let ambientFeed = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .feed,
                    start: "2026-07-24T11:00:00Z",
                    end: "2026-07-24T11:00:00Z",
                    category: "git"
                ),
                presentation: .ambient
            )
        )
        let savedNote = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .feed,
                    start: "2026-07-24T12:00:00Z",
                    end: "2026-07-24T12:00:00Z",
                    category: "save_note"
                )
            )
        )
        let generatedIdea = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .feed,
                    start: "2026-07-24T13:00:00Z",
                    end: "2026-07-24T13:00:00Z",
                    category: "idea"
                )
            )
        )

        #expect(textInput.isUserInput)
        #expect(textInput.categoryLabel == "Text")
        #expect(voiceInput.isUserInput)
        #expect(voiceInput.categoryLabel == "Voice")
        #expect(!ambientFeed.isUserInput)
        #expect(!savedNote.isUserInput)
        #expect(!generatedIdea.isUserInput)

        let browsePoint = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .feed,
                    start: "2026-07-24T14:00:00Z",
                    end: "2026-07-24T14:00:00Z",
                    category: "browse_history"
                )
            )
        )
        #expect(browsePoint.presentation == .point)
    }

    @Test func dailyBriefingDoesNotChangeRepresentedEventCount() throws {
        let item = try #require(
            TimelineDisplayItem(
                segment: segment(
                    kind: .feed,
                    start: "2026-07-24T09:00:00Z",
                    end: "2026-07-24T09:00:00Z"
                )
            )
        )
        let briefing = TimelineDailyBriefing(
            id: "briefing",
            stateLabel: "Focused",
            summary: "A concise archived summary."
        )
        let day = TimelineDay(
            date: item.start,
            items: [item],
            dailyBriefing: briefing
        )

        #expect(day.dailyBriefing?.id == briefing.id)
        #expect(day.dailyBriefing?.summary == briefing.summary)
        #expect(day.representedEventCount == 1)
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
        category: String? = nil,
        date: String? = nil
    ) -> TimelineSegment {
        TimelineSegment(
            kind: kind,
            start: start,
            end: end,
            label: label,
            category: category,
            nodeId: nil,
            meta: nil,
            date: date
        )
    }
}
#endif
