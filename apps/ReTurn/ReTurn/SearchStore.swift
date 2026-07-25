import Foundation

/// Global search + RAG ask (GET /api/search, POST /api/ask). Chat retrieval
/// (F10 jump) stays on ChatStore; this is the explicit search surface.
@Observable
@MainActor
final class SearchStore {
    private(set) var hits: [SearchHit] = []
    private(set) var answer: AskResponse?
    private(set) var isSearching = false
    private(set) var isAsking = false
    private(set) var lastError: String?
    var query = ""

    private let api: APIEnvironment

    init(api: APIEnvironment) {
        self.api = api
    }

    func search(limit: Int = 20) async {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !isSearching else { return }
        isSearching = true
        answer = nil
        lastError = nil
        defer { isSearching = false }
        do {
            let response = try await api.makeClient().search(q, limit: limit)
            hits = response.results
            api.markReachable()
        } catch {
            hits = []
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    func ask() async {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !q.isEmpty, !isAsking else { return }
        isAsking = true
        lastError = nil
        defer { isAsking = false }
        do {
            answer = try await api.makeClient().ask(.init(question: q))
            api.markReachable()
        } catch {
            answer = nil
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    func clear() {
        hits = []
        answer = nil
        lastError = nil
    }
}
