import Foundation

/// The Save Today action (PRD F5): POST /api/save runs the ferment pipeline
/// on the Pi and returns the day's briefing/todos/stats in one shot. The
/// server serializes Save per day and is idempotent (`alreadySaved`), so the
/// store just guards against double taps while a save is in flight.
@Observable
@MainActor
final class SaveStore {
    private(set) var isSaving = false
    private(set) var result: SaveResponse?
    private(set) var error: String?

    private let api: APIEnvironment

    init(api: APIEnvironment) {
        self.api = api
    }

    /// Returns true when the save went through (including `alreadySaved`), so
    /// the view layer can refresh stats/timeline/cards in one place.
    @discardableResult
    func save() async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        error = nil
        do {
            result = try await api.makeClient().save(
                .init(
                    date: APIEnvironment.dayKey(for: .now),
                    deviceId: api.deviceID,
                    noteText: nil,
                    noteVoiceRef: nil
                )
            )
            api.markReachable()
            isSaving = false
            return true
        } catch {
            self.error = apiErrorMessage(error)
            api.markUnreachable(error)
            isSaving = false
            return false
        }
    }

    func clearResult() {
        result = nil
    }
}
