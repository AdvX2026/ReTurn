import Foundation

@Observable
@MainActor
final class TasksStore {
    private(set) var tasks: [TaskRecord] = []
    private(set) var isLoading = false
    private(set) var error: String?

    var activeTasks: [TaskRecord] {
        tasks.filter { $0.status == .queued || $0.status == .running }
    }

    private let api: APIEnvironment
    private let chat: ChatStore

    init(api: APIEnvironment, chat: ChatStore) {
        self.api = api
        self.chat = chat
    }

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let previous = Dictionary(uniqueKeysWithValues: tasks.map { ($0.id, $0.status) })
            let response = try await api.makeClient().listTasks()
            tasks = response.tasks
            error = nil
            api.markReachable()

            let completed = tasks.contains { task in
                previous[task.id].map { $0 != .done && task.status == .done } ?? false
            }
            if completed {
                await chat.loadHistory(force: true)
            }
        } catch {
            self.error = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    func monitor() async {
        while !Task.isCancelled {
            if api.isConnected {
                await refresh()
            }
            do {
                try await Task.sleep(for: .seconds(activeTasks.isEmpty ? 12 : 3))
            } catch {
                return
            }
        }
    }
}
