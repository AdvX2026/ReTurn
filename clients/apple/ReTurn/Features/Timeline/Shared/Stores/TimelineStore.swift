import Foundation

/// Owns the Before data: per-day timelines from /api/timeline and the
/// /api/days overview (calendar marks, streak, saved-day summaries). Days are
/// keyed by local `yyyy-MM-dd`. A cached day serves as-is; only today is
/// re-fetched on request, since sampling keeps changing it through the day.
@Observable
@MainActor
final class TimelineStore {
    enum OverviewState: Equatable {
        case idle, loading, ready, failed(String)
    }

    /// A retrieval jump (chat F10) the Before views should honor: switch to
    /// the date, then select the node when set. Consumed by the view.
    struct FocusRequest: Equatable {
        let dayKey: String
        let nodeID: String?
    }

    private(set) var overviewState: OverviewState = .idle
    private(set) var daysByKey: [String: TimelineDay] = [:]
    private(set) var summariesByKey: [String: DaySummary] = [:]
    private(set) var briefingCardsByKey: [String: CardRecord] = [:]
    /// Dates with saved content or loaded segments — the calendar's dots and
    /// the day stepper's walk order.
    private(set) var markedKeys: Set<String> = []
    private(set) var streak = 0
    private(set) var loadingKeys: Set<String> = []
    private(set) var errorsByKey: [String: String] = [:]
    /// Day the Before views most recently asked for — the macOS refresh
    /// button reloads it without knowing the view's selection.
    private(set) var lastViewedKey: String?
    var focusRequest: FocusRequest?

    private let api: APIEnvironment

    init(api: APIEnvironment) {
        self.api = api
    }

    func day(for date: Date) -> TimelineDay? {
        daysByKey[APIEnvironment.dayKey(for: date)]
    }

    func summary(for date: Date) -> DaySummary? {
        summariesByKey[APIEnvironment.dayKey(for: date)]
    }

    func briefingCard(for date: Date) -> CardRecord? {
        briefingCardsByKey[APIEnvironment.dayKey(for: date)]
    }

    func briefingCard(id: String) -> CardRecord? {
        briefingCardsByKey.values.first { $0.id == id }
    }

    func isLoading(_ date: Date) -> Bool {
        loadingKeys.contains(APIEnvironment.dayKey(for: date))
    }

    func error(for date: Date) -> String? {
        errorsByKey[APIEnvironment.dayKey(for: date)]
    }

    /// Calendar marks as Dates, ascending — macOS day stepper + month dots.
    var markedDates: [Date] {
        markedKeys
            .compactMap { APIEnvironment.date(fromDayKey: $0) }
            .sorted()
    }

    /// Builds the 30-day Before index in one pass: saved-day summaries,
    /// recorded-day marks and stable Daily Briefing card destinations.
    func refreshOverview() async {
        overviewState = .loading
        do {
            let end = Date.now
            guard let start = Calendar.autoupdatingCurrent.date(
                byAdding: .day,
                value: -29,
                to: end
            ) else { return }
            let client = api.makeClient()
            async let overviewRequest = client.days(range: 30)
            async let timelineRequest = client.timeline(
                from: APIEnvironment.dayKey(for: start),
                to: APIEnvironment.dayKey(for: end)
            )
            async let briefingRequest = loadBriefingCards()
            let (overview, timelineResponse, briefingCards) = try await (
                overviewRequest,
                timelineRequest,
                briefingRequest
            )

            summariesByKey = Dictionary(
                uniqueKeysWithValues: overview.days.map { ($0.date, $0) }
            )
            briefingCardsByKey = Dictionary(
                uniqueKeysWithValues: briefingCards.map { ($0.date, $0) }
            )
            markedKeys = Set(
                overview.days
                    .filter { $0.savedAt != nil || $0.stats != nil }
                    .map(\.date)
            )
            let grouped = TimelineDay.grouped(from: timelineResponse.segments)
            merge(
                Dictionary(
                    uniqueKeysWithValues: grouped.map {
                        (APIEnvironment.dayKey(for: $0.date), $0)
                    }
                )
            )
            streak = overview.streak
            overviewState = .ready
            api.markReachable()
        } catch {
            overviewState = .failed(apiErrorMessage(error))
            api.markUnreachable(error)
        }
    }

    /// Load one day's timeline. Cached days skip the fetch (force to reload);
    /// today always refetches.
    func loadDay(_ date: Date, force: Bool = false) async {
        let key = APIEnvironment.dayKey(for: date)
        lastViewedKey = key
        let isToday = key == APIEnvironment.dayKey(for: .now)
        guard force || isToday || daysByKey[key] == nil else { return }
        guard !loadingKeys.contains(key) else { return }
        loadingKeys.insert(key)
        errorsByKey[key] = nil
        defer { loadingKeys.remove(key) }
        do {
            let response = try await api.makeClient().timeline(date: key)
            apply(response: response, requestedKey: key)
            api.markReachable()
        } catch {
            errorsByKey[key] = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    /// iOS Before lists recent days in one scroll — one range call instead of
    /// N single-day calls. Always refetches (the range ends at today).
    func loadRecentDays(endingAt date: Date = .now, count: Int = 7) async {
        guard let start = Calendar.autoupdatingCurrent.date(
            byAdding: .day, value: -(count - 1), to: date
        ) else { return }
        let fromKey = APIEnvironment.dayKey(for: start)
        let toKey = APIEnvironment.dayKey(for: date)
        let rangeKeys = (0..<count).compactMap { offset -> String? in
            Calendar.autoupdatingCurrent
                .date(byAdding: .day, value: offset, to: start)
                .map { APIEnvironment.dayKey(for: $0) }
        }
        guard !loadingKeys.contains(toKey) else { return }
        loadingKeys.formUnion(rangeKeys)
        defer { loadingKeys.subtract(rangeKeys) }
        do {
            let response = try await api.makeClient().timeline(from: fromKey, to: toKey)
            // Record empty days too, or every revisit refetches the same blanks.
            let grouped = TimelineDay.grouped(from: response.segments)
            var byKey = Dictionary(
                uniqueKeysWithValues: grouped.map { (APIEnvironment.dayKey(for: $0.date), $0) }
            )
            for key in rangeKeys where byKey[key] == nil {
                if let dayDate = APIEnvironment.date(fromDayKey: key) {
                    byKey[key] = TimelineDay(date: dayDate, items: [])
                }
            }
            merge(byKey)
            api.markReachable()
        } catch {
            errorsByKey[toKey] = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    /// The macOS refresh button's Before action: reload the overview and
    /// force-reload the day the user is looking at.
    func refreshViewedDay() async {
        await refreshOverview()
        guard let key = lastViewedKey,
              let date = APIEnvironment.date(fromDayKey: key) else { return }
        await loadDay(date, force: true)
    }

    func requestFocus(dayKey: String, nodeID: String?) {
        focusRequest = FocusRequest(dayKey: dayKey, nodeID: nodeID)
    }

    func consumeFocusRequest() -> FocusRequest? {
        defer { focusRequest = nil }
        return focusRequest
    }

    private func apply(response: TimelineResponse, requestedKey: String) {
        let grouped = TimelineDay.grouped(from: response.segments)
        var byKey = Dictionary(
            uniqueKeysWithValues: grouped.map { (APIEnvironment.dayKey(for: $0.date), $0) }
        )
        if byKey[requestedKey] == nil, let dayDate = APIEnvironment.date(fromDayKey: requestedKey) {
            byKey[requestedKey] = TimelineDay(date: dayDate, items: [])
        }
        merge(byKey)
    }

    private func merge(_ byKey: [String: TimelineDay]) {
        for (key, day) in byKey {
            daysByKey[key] = attachingBriefing(to: day, key: key)
            if !day.items.isEmpty {
                markedKeys.insert(key)
            }
        }
    }

    private func attachingBriefing(to day: TimelineDay, key: String) -> TimelineDay {
        guard let card = briefingCardsByKey[key],
              case .briefing(let content) = card.content else { return day }
        return TimelineDay(
            date: day.date,
            items: day.items,
            dailyBriefing: TimelineDailyBriefing(
                id: card.id,
                stateLabel: content.characterState.rawValue.capitalized,
                summary: content.summary
            )
        )
    }

    private func loadBriefingCards() async throws -> [CardRecord] {
        var cards: [CardRecord] = []
        var cursor: String?
        repeat {
            let page = try await api.makeClient().listCards(
                direction: .before,
                cursor: cursor,
                limit: 50
            )
            cards.append(contentsOf: page.cards.filter { $0.type == .briefing })
            cursor = page.nextCursor
        } while cursor != nil
        return cards
    }
}

#if DEBUG
extension TimelineStore {
    /// Seeds fixture content for previews — stores otherwise start empty and
    /// previews have no server to load from.
    func seedForPreview(_ days: [TimelineDay], streak: Int = 0) {
        merge(
            Dictionary(
                uniqueKeysWithValues: days.map {
                    (APIEnvironment.dayKey(for: $0.date), $0)
                }
            )
        )
        self.streak = streak
        overviewState = .ready
    }
}
#endif
