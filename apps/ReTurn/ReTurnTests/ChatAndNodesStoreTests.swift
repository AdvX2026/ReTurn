import Foundation
import Testing
@testable import ReTurn

@MainActor
struct ChatAndNodesStoreTests {
    @Test func historyMergeRejectsResponseAfterLocalMutation() {
        let current = [entry(id: "local-new", failed: false)]

        let merged = ChatStore.reconciledHistory(
            serverEntries: [entry(id: "server-old", failed: false)],
            currentEntries: current,
            requestRevision: 4,
            currentRevision: 5
        )

        #expect(merged == nil)
    }

    @Test func historyMergePreservesOnlyRetryableLocalFailures() throws {
        let server = entry(id: "server-message", failed: false)
        let failedLocal = entry(id: "local-failed", failed: true)
        let pendingLocal = entry(id: "local-pending", failed: false)
        let failedServerEntry = entry(id: "server-failed", failed: true)

        let merged = try #require(
            ChatStore.reconciledHistory(
                serverEntries: [server],
                currentEntries: [failedLocal, pendingLocal, failedServerEntry],
                requestRevision: 7,
                currentRevision: 7
            )
        )

        #expect(merged.map(\.id) == ["server-message", "local-failed"])
    }

    @Test func nodesOutboxReloadKeepsOriginalClientUUID() async {
        let queueURL = FileManager.default.temporaryDirectory
            .appending(path: "return-nodes-\(UUID().uuidString).json")
        defer { try? FileManager.default.removeItem(at: queueURL) }

        let api = APIEnvironment()
        let store = NodesStore(api: api, queueURL: queueURL)
        let clientUUID = await store.enqueue(content: "Queued while offline")

        let reloaded = NodesStore(api: api, queueURL: queueURL)

        #expect(store.pending.map(\.clientUuid) == [clientUUID])
        #expect(reloaded.pending.map(\.clientUuid) == [clientUUID])
        #expect(reloaded.pending == store.pending)
    }

    private func entry(id: String, failed: Bool) -> ChatStore.Entry {
        ChatStore.Entry(
            id: id,
            role: .user,
            text: id,
            intent: nil,
            createdAt: Date(timeIntervalSince1970: 0),
            failed: failed,
            retryPayload: failed ? .chat(text: id, image: nil) : nil
        )
    }
}
