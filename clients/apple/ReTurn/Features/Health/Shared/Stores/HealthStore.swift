import Foundation
#if os(iOS)
import HealthKit
#endif

/// iOS HealthKit → POST /api/health (PRD F1/F8). Token is the fixed
/// `HEALTH_TOKEN` from the Pi env, entered once in Settings. macOS is a no-op.
@Observable
@MainActor
final class HealthStore {
    private(set) var lastUploadedDate: String?
    private(set) var lastSleepMinutes: Int?
    private(set) var lastSteps: Int?
    private(set) var lastError: String?
    private(set) var isUploading = false

    private let api: APIEnvironment

    init(api: APIEnvironment) {
        self.api = api
    }

    /// Read last night's sleep + today's steps and POST. Safe to call on every
    /// foreground entry — the server is idempotent per date.
    func uploadTodayIfPossible() async {
        #if os(iOS)
        guard !isUploading else { return }
        let token = api.healthToken.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !token.isEmpty else {
            lastError = "Set the health token in Settings"
            return
        }
        isUploading = true
        defer { isUploading = false }
        do {
            let metrics = try await Self.readMetrics()
            let date = APIEnvironment.dayKey(for: .now)
            _ = try await api.makeClient().reportHealth(
                .init(date: date, sleepMinutes: metrics.sleepMinutes, steps: metrics.steps),
                token: token
            )
            lastUploadedDate = date
            lastSleepMinutes = metrics.sleepMinutes
            lastSteps = metrics.steps
            lastError = nil
            api.markReachable()
        } catch {
            lastError = apiErrorMessage(error)
            // Health token 401 is not a LAN connectivity failure.
            if error is URLError { api.markUnreachable(error) }
        }
        #endif
    }

    #if os(iOS)
    private struct Metrics {
        var sleepMinutes: Int
        var steps: Int
    }

    private static func readMetrics() async throws -> Metrics {
        let store = HKHealthStore()
        guard HKHealthStore.isHealthDataAvailable() else {
            throw APIError.http(status: 503, message: "Health data unavailable")
        }
        let sleepType = HKObjectType.categoryType(forIdentifier: .sleepAnalysis)!
        let stepsType = HKObjectType.quantityType(forIdentifier: .stepCount)!
        try await store.requestAuthorization(toShare: [], read: [sleepType, stepsType])

        async let sleep = sleepMinutes(store: store, type: sleepType)
        async let steps = stepCount(store: store, type: stepsType)
        return try await Metrics(sleepMinutes: sleep, steps: steps)
    }

    private static func sleepMinutes(store: HKHealthStore, type: HKCategoryType) async throws -> Int {
        let end = Date()
        let start = Calendar.current.date(byAdding: .hour, value: -36, to: end) ?? end
        let predicate = HKQuery.predicateForSamples(withStart: start, end: end)
        return try await withCheckedThrowingContinuation { cont in
            let query = HKSampleQuery(
                sampleType: type,
                predicate: predicate,
                limit: HKObjectQueryNoLimit,
                sortDescriptors: nil
            ) { _, samples, error in
                if let error {
                    cont.resume(throwing: error)
                    return
                }
                let asleepValues: Set<Int> = [
                    HKCategoryValueSleepAnalysis.asleepUnspecified.rawValue,
                    HKCategoryValueSleepAnalysis.asleepCore.rawValue,
                    HKCategoryValueSleepAnalysis.asleepDeep.rawValue,
                    HKCategoryValueSleepAnalysis.asleepREM.rawValue,
                ]
                let seconds = (samples as? [HKCategorySample] ?? [])
                    .filter { asleepValues.contains($0.value) }
                    .reduce(0.0) { $0 + $1.endDate.timeIntervalSince($1.startDate) }
                cont.resume(returning: Int((seconds / 60).rounded()))
            }
            store.execute(query)
        }
    }

    private static func stepCount(store: HKHealthStore, type: HKQuantityType) async throws -> Int {
        let start = Calendar.current.startOfDay(for: Date())
        let predicate = HKQuery.predicateForSamples(withStart: start, end: Date())
        return try await withCheckedThrowingContinuation { cont in
            let query = HKStatisticsQuery(
                quantityType: type,
                quantitySamplePredicate: predicate,
                options: .cumulativeSum
            ) { _, stats, error in
                if let error {
                    cont.resume(throwing: error)
                    return
                }
                let value = stats?.sumQuantity()?.doubleValue(for: .count()) ?? 0
                cont.resume(returning: Int(value.rounded()))
            }
            store.execute(query)
        }
    }
    #endif
}
