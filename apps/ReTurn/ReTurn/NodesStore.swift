import Foundation

/// UI-side node writes (PRD §5.2 light outbox) plus list/delete for cleanup.
/// Sampler owns the heavy outbox; this queue is JSON on disk and reuses each
/// item's `client_uuid` forever — never regenerate on retry.
@Observable
@MainActor
final class NodesStore {
    struct OutboxItem: Codable, Identifiable, Equatable {
        var id: String { clientUuid }
        var clientUuid: String
        var kind: NodeKind
        var title: String?
        var content: String?
        var date: String?
    }

    private(set) var pending: [OutboxItem] = []
    private(set) var nodes: [NodeRecord] = []
    private(set) var listedDate: String?
    private(set) var lastError: String?
    private(set) var isFlushing = false

    private let api: APIEnvironment
    private let queueURL: URL

    init(api: APIEnvironment) {
        self.api = api
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)
            .first!
            .appending(path: "ReTurn", directoryHint: .isDirectory)
        try? FileManager.default.createDirectory(at: support, withIntermediateDirectories: true)
        queueURL = support.appending(path: "nodes-outbox.json")
        pending = Self.load(from: queueURL)
    }

    /// Queue a feed node (text/idea/url). Flushes immediately when online.
    @discardableResult
    func enqueue(
        kind: NodeKind = .text,
        content: String,
        title: String? = nil,
        date: String? = nil
    ) async -> String {
        let item = OutboxItem(
            clientUuid: UUID().uuidString,
            kind: kind,
            title: title,
            content: content,
            date: date ?? APIEnvironment.dayKey(for: .now)
        )
        pending.append(item)
        persist()
        if api.isConnected {
            await flushOutbox()
        }
        return item.clientUuid
    }

    func flushOutbox() async {
        guard !isFlushing, !pending.isEmpty else { return }
        isFlushing = true
        defer { isFlushing = false }
        let batch = pending
        do {
            let response = try await api.makeClient().createNodes(
                .init(
                    deviceId: api.deviceID,
                    nodes: batch.map {
                        NodeInput(
                            clientUuid: $0.clientUuid,
                            kind: $0.kind,
                            title: $0.title,
                            content: $0.content,
                            sourceMeta: nil,
                            clientCreatedAt: nil,
                            date: $0.date
                        )
                    }
                )
            )
            let done = Set(response.created.map(\.clientUuid) + response.duplicates)
            pending.removeAll { done.contains($0.clientUuid) }
            persist()
            lastError = nil
            api.markReachable()
        } catch {
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    func list(date: String) async {
        do {
            let response = try await api.makeClient().listNodes(date: date)
            nodes = response.nodes
            listedDate = response.date
            lastError = nil
            api.markReachable()
        } catch {
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    @discardableResult
    func delete(id: String) async -> Bool {
        do {
            _ = try await api.makeClient().deleteNode(id: id)
            nodes.removeAll { $0.id == id }
            lastError = nil
            api.markReachable()
            return true
        } catch {
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
            return false
        }
    }

    private func persist() {
        do {
            let data = try ReTurnAPI.makeEncoder().encode(pending)
            try data.write(to: queueURL, options: .atomic)
        } catch {
            lastError = "Couldn't save outbox"
        }
    }

    private static func load(from url: URL) -> [OutboxItem] {
        guard let data = try? Data(contentsOf: url) else { return [] }
        return (try? ReTurnAPI.makeDecoder().decode([OutboxItem].self, from: data)) ?? []
    }
}
