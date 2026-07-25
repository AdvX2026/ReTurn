import Foundation

@Observable
@MainActor
final class CardsStore {
    enum State: Equatable {
        case idle, loading, ready, failed(String)
    }

    private(set) var state: State = .idle
    private(set) var cards: [CardRecord] = []
    private(set) var doneTodoIDs: Set<String> = []
    private(set) var dismissedTodoIDs: Set<String> = []
    private(set) var todoErrors: [String: String] = [:]
    private(set) var nextCursor: String?
    private(set) var isLoadingMore = false

    var canLoadMore: Bool { nextCursor != nil }

    private let api: APIEnvironment
    private let reminders: ReminderService
    private var pendingReminderIDs: [String: String] = [:]

    init(api: APIEnvironment, reminders: ReminderService) {
        self.api = api
        self.reminders = reminders
    }

    func refresh() async {
        state = .loading
        do {
            let response = try await api.makeClient().listCards(direction: .future, limit: 30)
            cards = response.cards
            nextCursor = response.nextCursor
            trimLocalOutcomes()
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
            let existingIDs = Set(cards.map(\.id))
            cards.append(contentsOf: response.cards.filter { !existingIDs.contains($0.id) })
            self.nextCursor = response.nextCursor
            trimLocalOutcomes()
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
        todoErrors[id] = nil
        do {
            let response = try await api.makeClient().patchTodo(
                id: id,
                .init(done: true, deviceId: api.deviceID)
            )
            doneTodoIDs.insert(response.todo.id)
            api.markReachable()
        } catch {
            todoErrors[id] = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    func acceptTodo(_ id: String, text: String) async {
        guard !doneTodoIDs.contains(id), api.isConnected else { return }
        todoErrors[id] = nil
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
            doneTodoIDs.insert(response.todo.id)
            pendingReminderIDs[id] = nil
            api.markReachable()
        } catch {
            todoErrors[id] = apiErrorMessage(error)
            if error is URLError { api.markUnreachable(error) }
        }
    }

    func dismissTodo(_ id: String) async {
        guard !dismissedTodoIDs.contains(id), api.isConnected else { return }
        todoErrors[id] = nil
        do {
            let response = try await api.makeClient().dismissTodo(
                id: id,
                .init(deviceId: api.deviceID)
            )
            dismissedTodoIDs.insert(response.todo.id)
            api.markReachable()
        } catch {
            todoErrors[id] = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    private func trimLocalOutcomes() {
        let liveIDs = Set(cards.flatMap { card in
            if case .todoSuggestion(let content) = card.content { return content.todoIds }
            return []
        })
        doneTodoIDs.formIntersection(liveIDs)
        dismissedTodoIDs.formIntersection(liveIDs)
        todoErrors = todoErrors.filter { liveIDs.contains($0.key) }
    }
}
