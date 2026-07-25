import Foundation
import SwiftUI
#if os(iOS)
import UIKit
#endif

/// The one place that knows how to reach the Pi: the user-editable base URL
/// (persisted), this device's stable ID, and the /api/devices/register
/// handshake. Stores call `makeClient()` per request so editing the URL takes
/// effect on the next call without rebuilding any state.
@Observable
@MainActor
final class APIEnvironment {
    enum ConnectionState {
        case unknown
        case checking
        case connected(PingResponse)
        case disconnected(String)
    }

    static let defaultBaseURLString = "http://127.0.0.1:8787"
    private static let baseURLDefaultsKey = "piBaseURL"
    private static let deviceIDDefaultsKey = "deviceID"
    private static let apiTokenDefaultsKey = "piApiToken"
    private static let healthTokenDefaultsKey = "healthToken"

    /// Pi server base URL as typed by the user (Settings on macOS, the inline
    /// recovery editor on connection failure elsewhere). Persisted.
    var baseURLString: String {
        didSet { UserDefaults.standard.set(baseURLString, forKey: Self.baseURLDefaultsKey) }
    }

    /// Optional `API_TOKEN` for private LAN endpoints (empty = open LAN mode).
    var apiToken: String {
        didSet { UserDefaults.standard.set(apiToken, forKey: Self.apiTokenDefaultsKey) }
    }

    /// Fixed `HEALTH_TOKEN` for POST /api/health only.
    var healthToken: String {
        didSet { UserDefaults.standard.set(healthToken, forKey: Self.healthTokenDefaultsKey) }
    }

    /// Stable per-install device ID, sent with writes and the register handshake.
    let deviceID: String

    /// Last successful ping, for the settings connection indicator.
    private(set) var lastPing: PingResponse?
    private(set) var connectionState: ConnectionState = .unknown

    var isConnected: Bool {
        if case .connected = connectionState { return true }
        return false
    }

    init() {
        let defaults = UserDefaults.standard
        baseURLString = defaults.string(forKey: Self.baseURLDefaultsKey) ?? Self.defaultBaseURLString
        apiToken = defaults.string(forKey: Self.apiTokenDefaultsKey) ?? ""
        healthToken = defaults.string(forKey: Self.healthTokenDefaultsKey) ?? ""
        if let existing = defaults.string(forKey: Self.deviceIDDefaultsKey) {
            deviceID = existing
        } else {
            let fresh = UUID().uuidString
            defaults.set(fresh, forKey: Self.deviceIDDefaultsKey)
            deviceID = fresh
        }
    }

    var baseURL: URL {
        URL(string: baseURLString) ?? URL(string: Self.defaultBaseURLString)!
    }

    func makeClient() -> APIClient {
        let token = apiToken.trimmingCharacters(in: .whitespacesAndNewlines)
        return APIClient(baseURL: baseURL, apiToken: token.isEmpty ? nil : token)
    }

    /// Register once per launch. Failure is silent: writes carry `deviceID`
    /// anyway (the server touches devices on write), and the next launch retries.
    func ensureRegistered() async {
        #if os(macOS)
        let platform: DevicePlatform = .macos
        let name = Host.current().localizedName ?? "Mac"
        #else
        let platform: DevicePlatform = .ios
        let name = UIDevice.current.name
        #endif
        do {
            _ = try await makeClient().registerDevice(
                .init(name: name, platform: platform, deviceId: deviceID)
            )
            markReachable()
        } catch {
            markUnreachable(error)
        }
    }

    /// Settings' connection test — reports reachability and records the ping.
    @discardableResult
    func checkConnection() async -> Bool {
        if !isConnected { connectionState = .checking }
        do {
            let ping = try await makeClient().ping()
            lastPing = ping
            connectionState = .connected(ping)
            return true
        } catch {
            markUnreachable(error)
            return false
        }
    }

    func monitorConnection() async {
        while !Task.isCancelled {
            _ = await checkConnection()
            do {
                try await Task.sleep(for: .seconds(isConnected ? 15 : 4))
            } catch {
                return
            }
        }
    }

    func markReachable() {
        if let lastPing {
            connectionState = .connected(lastPing)
        } else {
            // A successful API call without a cached ping still means the Pi is up
            // (composer and Save gate on `isConnected`).
            connectionState = .connected(
                PingResponse(ok: true, serverTime: "", version: "unknown", cadence: nil)
            )
        }
    }

    func markUnreachable(_ error: Error) {
        connectionState = .disconnected(apiErrorMessage(error))
    }
}

// MARK: - Day keys

extension APIEnvironment {
    /// Local-calendar `yyyy-MM-dd` — the contract's day granularity. The Pi,
    /// the sampler and the UI are one user's home-LAN devices in one time zone.
    static func dayKey(for date: Date) -> String {
        dayKeyFormatter.string(from: date)
    }

    static func date(fromDayKey key: String) -> Date? {
        dayKeyFormatter.date(from: key)
    }

    private static let dayKeyFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = .autoupdatingCurrent
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

// MARK: - Error text

/// Short user-facing text for store error states. Connectivity failures get
/// one shared message — the recovery UI (retry + URL editor) says the rest.
func apiErrorMessage(_ error: Error) -> String {
    if let apiError = error as? APIError {
        return apiError.errorDescription ?? "Request failed"
    }
    if let urlError = error as? URLError {
        switch urlError.code {
        case .cannotConnectToHost, .cannotFindHost, .networkConnectionLost,
             .notConnectedToInternet, .timedOut, .dnsLookupFailed:
            return "Can't reach the server"
        default:
            break
        }
    }
    return error.localizedDescription
}

/// Aggregate so `ReTurnApp` builds the store graph once and injects each store
/// into the environment; views take only the stores they actually use.
@MainActor
final class AppStores {
    let api: APIEnvironment
    let timeline: TimelineStore
    let chat: ChatStore
    let stats: StatsStore
    let save: SaveStore
    let cards: CardsStore
    let tasks: TasksStore
    let nodes: NodesStore
    let search: SearchStore
    let health: HealthStore
    let usage: UsageStore

    init() {
        let api = APIEnvironment()
        self.api = api
        timeline = TimelineStore(api: api)
        chat = ChatStore(api: api)
        stats = StatsStore(api: api)
        save = SaveStore(api: api)
        let reminders = ReminderService()
        cards = CardsStore(api: api, reminders: reminders)
        tasks = TasksStore(api: api, chat: chat)
        nodes = NodesStore(api: api)
        search = SearchStore(api: api)
        health = HealthStore(api: api)
        usage = UsageStore(api: api)
    }
}

extension View {
    /// Injects the full store graph for previews — views read stores from the
    /// environment, and previews have no `ReTurnApp` to provide them. `seed`
    /// fills fixture content (stores offer `seedForPreview` helpers).
    func previewStores(seed: (AppStores) -> Void = { _ in }) -> some View {
        let stores = AppStores()
        seed(stores)
        return self
            .environment(stores.api)
            .environment(stores.timeline)
            .environment(stores.chat)
            .environment(stores.stats)
            .environment(stores.save)
            .environment(stores.cards)
            .environment(stores.tasks)
            .environment(stores.nodes)
            .environment(stores.search)
            .environment(stores.health)
            .environment(stores.usage)
    }
}
