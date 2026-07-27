import Foundation

struct TimelineDailyBriefing: Identifiable, Equatable {
    let id: String
    let stateLabel: String
    let summary: String

    var accessibilityValue: String {
        "\(stateLabel). \(summary)"
    }
}
