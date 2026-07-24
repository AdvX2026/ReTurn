#if os(iOS)
import Foundation

enum TimelinePreviewData {
    static let days = TimelineDay.grouped(from: items)

    private static let clusterPreview = TimelineClusterPreview(
        entries: [
            .init(
                id: "session-start",
                time: "10:42",
                title: "Claude session started",
                symbolName: "terminal"
            ),
            .init(
                id: "git-commit",
                time: "11:26",
                title: "Commit · Health-style timeline",
                symbolName: "arrow.triangle.branch"
            ),
            .init(
                id: "preview-build",
                time: "12:04",
                title: "Preview build passed",
                symbolName: "checkmark.circle"
            ),
        ],
        totalCount: 6
    )

    private static let items = segments.compactMap { segment in
        TimelineDisplayItem(
            segment: segment,
            presentation: segment.category == "git" ? .ambient : nil,
            clusterPreview: segment.kind == .agent ? clusterPreview : nil
        )
    }

    private static let segments: [TimelineSegment] = [
        TimelineSegment(
            kind: .sleep,
            start: "2026-07-24T00:18:00+08:00",
            end: "2026-07-24T07:06:00+08:00",
            label: "Sleep",
            category: "sleep",
            nodeId: nil,
            meta: ["sleep_minutes": .number(408)],
            date: "2026-07-24"
        ),
        TimelineSegment(
            kind: .feed,
            start: "2026-07-24T08:42:00+08:00",
            end: "2026-07-24T08:42:00+08:00",
            label: "Voice note captured",
            category: "voice",
            nodeId: "3a19a166-3dbe-4d2e-8892-9ad2b51f6421",
            meta: nil,
            date: "2026-07-24"
        ),
        TimelineSegment(
            kind: .app,
            start: "2026-07-24T09:05:00+08:00",
            end: "2026-07-24T10:31:00+08:00",
            label: "Figma — Return",
            category: "design",
            nodeId: nil,
            meta: nil,
            date: "2026-07-24"
        ),
        TimelineSegment(
            kind: .agent,
            start: "2026-07-24T10:42:00+08:00",
            end: "2026-07-24T12:18:00+08:00",
            label: "ReTurn / Before timeline",
            category: "agent",
            nodeId: nil,
            meta: ["project": .string("ReTurn")],
            date: "2026-07-24"
        ),
        TimelineSegment(
            kind: .feed,
            start: "2026-07-24T13:02:00+08:00",
            end: "2026-07-24T13:02:00+08:00",
            label: "README wording",
            category: "git",
            nodeId: "f4dc74dd-68ce-49e7-bbd5-035c48f98ec7",
            meta: nil,
            date: "2026-07-24"
        ),
        TimelineSegment(
            kind: .feed,
            start: "2026-07-24T14:10:00+08:00",
            end: "2026-07-24T14:10:00+08:00",
            label: "Meeting notes added",
            category: "text",
            nodeId: "ce118d40-621e-4c7c-83ef-b569012c2532",
            meta: nil,
            date: "2026-07-24"
        ),
        TimelineSegment(
            kind: .app,
            start: "2026-07-24T15:02:00+08:00",
            end: "2026-07-24T16:24:00+08:00",
            label: "Safari research",
            category: "browser",
            nodeId: nil,
            meta: nil,
            date: "2026-07-24"
        ),
        TimelineSegment(
            kind: .app,
            start: "2026-07-23T09:14:00+08:00",
            end: "2026-07-23T11:48:00+08:00",
            label: "Xcode — ReTurn",
            category: "dev",
            nodeId: nil,
            meta: nil,
            date: "2026-07-23"
        ),
        TimelineSegment(
            kind: .feed,
            start: "2026-07-23T13:26:00+08:00",
            end: "2026-07-23T13:26:00+08:00",
            label: "Saved a new idea",
            category: "idea",
            nodeId: "7104f3c9-ec42-4976-829a-81974f4f5bb9",
            meta: nil,
            date: "2026-07-23"
        ),
    ]
}
#endif
