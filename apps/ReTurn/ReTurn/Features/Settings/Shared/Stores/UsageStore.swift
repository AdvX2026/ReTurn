import Foundation

/// Provider usage aggregation (GET /api/usage). Settings / diagnostics only.
@Observable
@MainActor
final class UsageStore {
    private(set) var usage: UsageResponse?
    private(set) var isLoading = false
    private(set) var lastError: String?

    private let api: APIEnvironment

    init(api: APIEnvironment) {
        self.api = api
    }

    /// Defaults to the last 30 local calendar days inclusive of today.
    func refresh(days: Int = 30) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        let to = APIEnvironment.dayKey(for: .now)
        let fromDate = Calendar.current.date(byAdding: .day, value: -(max(days, 1) - 1), to: .now) ?? .now
        let from = APIEnvironment.dayKey(for: fromDate)
        do {
            usage = try await api.makeClient().usage(from: from, to: to)
            lastError = nil
            api.markReachable()
        } catch {
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }
}
