import Foundation

/// Today's live stats + character state from /api/stats/today. Drives the Now
/// greeting and, once the mascot PR lands, the mascot's five stats. Refreshed
/// on appear and after a successful Save.
@Observable
@MainActor
final class StatsStore {
    private(set) var stats: Stats?
    private(set) var characterState: CharacterState = .normal
    private(set) var savedToday = false
    private(set) var collection: CollectionStatus?
    private(set) var cadence: CadenceMode?
    private(set) var profession: Profession = .generalist
    private(set) var professionMode: ProfessionMode = .auto
    private(set) var lastError: String?

    private let api: APIEnvironment

    init(api: APIEnvironment) {
        self.api = api
    }

    func refresh() async {
        do {
            let response = try await api.makeClient().statsToday()
            stats = response.stats
            characterState = response.characterState
            savedToday = response.saved
            collection = response.collection
            cadence = response.cadence
            profession = response.profession
            professionMode = response.professionMode
            lastError = nil
            api.markReachable()
        } catch {
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    func monitor() async {
        while !Task.isCancelled {
            if api.isConnected { await refresh() }
            do {
                try await Task.sleep(for: .seconds(30))
            } catch {
                return
            }
        }
    }
}
