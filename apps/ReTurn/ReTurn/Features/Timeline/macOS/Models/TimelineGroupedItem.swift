import Foundation

/// A group of consecutive same-kind events displayed as a single timeline row.
/// Single-event groups render normally; multi-event groups show a compact
/// summary that the user can tap to expand.
struct TimelineGroupedItem: Identifiable, Equatable {
    let id: String
    let events: [TimelineDisplayItem]

    /// The representative item used for rendering (first event in the group).
    var representative: TimelineDisplayItem { events.first! }

    var isExpanded: Bool = false

    var totalCount: Int {
        events.reduce(into: 0) { $0 += $1.clusterPreview?.totalCount ?? 1 }
    }

    var groupStart: Date { events.first!.start }
    var groupEnd: Date { events.last!.end }

    /// True when the group contains more than one event.
    var isGrouped: Bool { events.count > 1 }

    var summaryLabel: String {
        guard events.count > 1 else { return representative.label }
        return "\(representative.categoryLabel) · \(events.count) events"
    }

    var timeDisplay: String {
        let startText = groupStart.formatted(date: .omitted, time: .shortened)
        let endText = groupEnd.formatted(date: .omitted, time: .shortened)
        return "\(startText) – \(endText)"
    }

    /// Groups a sorted list of display items, merging consecutive events that
    /// share the same kind and category.
    static func group(items: [TimelineDisplayItem]) -> [TimelineGroupedItem] {
        var result: [TimelineGroupedItem] = []
        for item in items {
            if let last = result.last,
               last.representative.kind == item.kind,
               last.representative.category == item.category,
               !item.isUserInput,
               !last.representative.isUserInput {
                result[result.count - 1] = TimelineGroupedItem(
                    id: last.id,
                    events: last.events + [item],
                    isExpanded: last.isExpanded
                )
            } else {
                result.append(
                    TimelineGroupedItem(
                        id: "group-\(item.id)",
                        events: [item]
                    )
                )
            }
        }
        return result
    }
}
