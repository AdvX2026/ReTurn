#if os(iOS)
import Foundation

struct TimelineDay: Identifiable, Equatable {
    let date: Date
    let items: [TimelineDisplayItem]

    var id: Date { date }

    static func grouped(
        from segments: [TimelineSegment],
        calendar: Calendar = .autoupdatingCurrent
    ) -> [TimelineDay] {
        let items = segments.compactMap(TimelineDisplayItem.init(segment:))
        let groups = Dictionary(grouping: items) {
            date(from: $0.dayIdentifier, calendar: calendar)
                ?? calendar.startOfDay(for: $0.start)
        }

        return groups
            .map { date, items in
                TimelineDay(
                    date: date,
                    items: items.sorted { lhs, rhs in
                        if lhs.start == rhs.start {
                            return lhs.id < rhs.id
                        }
                        return lhs.start < rhs.start
                    }
                )
            }
            .sorted { $0.date > $1.date }
    }

    private static func date(
        from dayIdentifier: String?,
        calendar: Calendar
    ) -> Date? {
        guard let dayIdentifier else {
            return nil
        }

        let parts = dayIdentifier.split(separator: "-", omittingEmptySubsequences: false)
        guard
            parts.count == 3,
            let year = Int(parts[0]),
            let month = Int(parts[1]),
            let day = Int(parts[2]),
            let date = calendar.date(
                from: DateComponents(year: year, month: month, day: day)
            )
        else {
            return nil
        }

        return calendar.startOfDay(for: date)
    }
}
#endif
