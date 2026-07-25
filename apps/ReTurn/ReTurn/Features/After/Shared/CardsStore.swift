import Foundation

struct CardsContentState {
    private(set) var cards: [CardRecord] = []
    private(set) var doneTodoIDs: Set<String> = []
    private(set) var dismissedTodoIDs: Set<String> = []
    private(set) var todoErrors: [String: String] = [:]
    private(set) var nextCursor: String?

    private var firstPageCardIDs: Set<String> = []
    private var hasLoadedAdditionalPage = false
    private var acceptingTodoIDs: Set<String> = []

    mutating func applyRefresh(_ response: ListCardsResponse) {
        let refreshedIDs = Set(response.cards.map(\.id))
        if hasLoadedAdditionalPage {
            let tail = cards.filter {
                !firstPageCardIDs.contains($0.id) && !refreshedIDs.contains($0.id)
            }
            cards = response.cards + tail
        } else {
            cards = response.cards
            nextCursor = response.nextCursor
        }
        firstPageCardIDs = refreshedIDs
        trimLocalOutcomes()
    }

    mutating func applyNextPage(_ response: ListCardsResponse) {
        let existingIDs = Set(cards.map(\.id))
        let additionalCards = response.cards.filter { !existingIDs.contains($0.id) }
        cards.append(contentsOf: additionalCards)
        nextCursor = response.nextCursor
        hasLoadedAdditionalPage = true
        trimLocalOutcomes()
    }

    mutating func beginAcceptingTodo(_ id: String) -> Bool {
        acceptingTodoIDs.insert(id).inserted
    }

    mutating func endAcceptingTodo(_ id: String) {
        acceptingTodoIDs.remove(id)
    }

    mutating func clearTodoError(for id: String) {
        todoErrors[id] = nil
    }

    mutating func recordTodoError(_ message: String, for id: String) {
        todoErrors[id] = message
    }

    mutating func markTodoDone(_ id: String) {
        doneTodoIDs.insert(id)
    }

    mutating func markTodoDismissed(_ id: String) {
        dismissedTodoIDs.insert(id)
    }

    private mutating func trimLocalOutcomes() {
        let liveIDs = Set(cards.flatMap { card in
            if case .todoSuggestion(let content) = card.content { return content.todoIds }
            return []
        })
        doneTodoIDs.formIntersection(liveIDs)
        dismissedTodoIDs.formIntersection(liveIDs)
        todoErrors = todoErrors.filter { liveIDs.contains($0.key) }
    }
}

@Observable
@MainActor
final class CardsStore {
    enum State: Equatable {
        case idle, loading, ready, failed(String)
    }

    private(set) var state: State = .idle
    private(set) var isLoadingMore = false

    var cards: [CardRecord] { contentState.cards }
    var doneTodoIDs: Set<String> { contentState.doneTodoIDs }
    var dismissedTodoIDs: Set<String> { contentState.dismissedTodoIDs }
    var todoErrors: [String: String] { contentState.todoErrors }
    var nextCursor: String? { contentState.nextCursor }

    private let api: APIEnvironment
    private let reminders: ReminderService
    private var contentState = CardsContentState()
    private var pendingReminderIDs: [String: String] = [:]

    init(api: APIEnvironment, reminders: ReminderService) {
        self.api = api
        self.reminders = reminders
    }

    func refresh() async {
        state = .loading
        do {
            let response = try await api.makeClient().listCards(direction: .future, limit: 30)
            contentState.applyRefresh(response)
            state = .ready
            api.markReachable()
        } catch {
            state = .failed(apiErrorMessage(error))
            api.markUnreachable(error)
        }
    }

    func loadNextPage() async {
        guard let nextCursor, !isLoadingMore else { return }
        isLoadingMore = true
        defer { isLoadingMore = false }
        do {
            let response = try await api.makeClient().listCards(
                direction: .future,
                cursor: nextCursor,
                limit: 30
            )
            contentState.applyNextPage(response)
            state = .ready
            api.markReachable()
        } catch {
            state = .failed(apiErrorMessage(error))
            api.markUnreachable(error)
        }
    }

    func monitor() async {
        await refresh()
        while !Task.isCancelled {
            do {
                try await Task.sleep(for: .seconds(12))
            } catch {
                return
            }
            if api.isConnected {
                await refresh()
            }
        }
    }

    func markTodoDone(_ id: String) async {
        guard !doneTodoIDs.contains(id), api.isConnected else { return }
        contentState.clearTodoError(for: id)
        do {
            let response = try await api.makeClient().patchTodo(
                id: id,
                .init(done: true, deviceId: api.deviceID)
            )
            contentState.markTodoDone(response.todo.id)
            api.markReachable()
        } catch {
            contentState.recordTodoError(apiErrorMessage(error), for: id)
            api.markUnreachable(error)
        }
    }

    func acceptTodo(_ id: String, text: String) async {
        guard !doneTodoIDs.contains(id), api.isConnected else { return }
        guard contentState.beginAcceptingTodo(id) else { return }
        defer { contentState.endAcceptingTodo(id) }
        contentState.clearTodoError(for: id)
        do {
            let reminderID: String
            if let pending = pendingReminderIDs[id] {
                reminderID = pending
            } else {
                reminderID = try await reminders.createReminder(title: text)
                pendingReminderIDs[id] = reminderID
            }
            let response = try await api.makeClient().acceptTodo(
                id: id,
                .init(deviceId: api.deviceID, reminderId: reminderID)
            )
            contentState.markTodoDone(response.todo.id)
            pendingReminderIDs[id] = nil
            api.markReachable()
        } catch {
            contentState.recordTodoError(apiErrorMessage(error), for: id)
            if error is URLError { api.markUnreachable(error) }
        }
    }

    func dismissTodo(_ id: String) async {
        guard !dismissedTodoIDs.contains(id), api.isConnected else { return }
        contentState.clearTodoError(for: id)
        do {
            let response = try await api.makeClient().dismissTodo(
                id: id,
                .init(deviceId: api.deviceID)
            )
            contentState.markTodoDismissed(response.todo.id)
            api.markReachable()
        } catch {
            contentState.recordTodoError(apiErrorMessage(error), for: id)
            api.markUnreachable(error)
        }
    }
}
