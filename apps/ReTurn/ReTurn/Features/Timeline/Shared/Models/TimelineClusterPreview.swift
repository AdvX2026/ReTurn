import Foundation

struct TimelineClusterPreview: Equatable {
    struct Entry: Identifiable, Equatable {
        let id: String
        let time: String
        let title: String
        let symbolName: String
    }

    let entries: [Entry]
    let totalCount: Int

    init(entries: [Entry], totalCount: Int) {
        self.entries = entries
        self.totalCount = max(totalCount, entries.count, 1)
    }

    var remainingCount: Int {
        max(totalCount - entries.count, 0)
    }
}
