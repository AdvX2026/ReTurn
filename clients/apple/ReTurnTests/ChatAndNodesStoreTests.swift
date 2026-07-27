import Foundation
import Testing
@testable import ReTurn

@MainActor
struct ChatAndNodesStoreTests {
    @Test func defaultPiAddressTargetsTheLanHost() {
        #expect(APIEnvironment.defaultBaseURLString == "http://return.local:8787")
    }

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

    @Test func historyBootstrapHidesPreexistingMessagesAndShowsLaterOnes() {
        let old = entry(id: "old", failed: false)
        let new = entry(id: "new", failed: false)
        let baseline = ChatStore.historyBaseline(
            serverEntries: [old],
            sessionMessageIDs: []
        )

        #expect(
            ChatStore.currentSessionHistory(
                serverEntries: [old],
                baselineMessageIDs: baseline
            ).isEmpty
        )
        #expect(
            ChatStore.currentSessionHistory(
                serverEntries: [old, new],
                baselineMessageIDs: baseline
            ).map(\.id) == ["new"]
        )
    }

    @Test func historyBootstrapKeepsMessagesSentDuringBootstrap() {
        let old = entry(id: "old", failed: false)
        let current = entry(id: "current", failed: false)
        let baseline = ChatStore.historyBaseline(
            serverEntries: [old, current],
            sessionMessageIDs: [current.id]
        )

        #expect(baseline == [old.id])
        #expect(
            ChatStore.currentSessionHistory(
                serverEntries: [old, current],
                baselineMessageIDs: baseline
            ).map(\.id) == [current.id]
        )
    }

    @Test func conversationKeepsOnlyLatestResumeEntry() {
        let chat = entry(id: "chat", failed: false)
        let firstResume = entry(id: "resume-1", failed: false, source: .resume)
        let task = entry(id: "task", failed: false, source: .task)
        let latestResume = entry(id: "resume-2", failed: false, source: .resume)

        let visible = ChatStore.keepingLatestResume(
            in: [chat, firstResume, task, latestResume]
        )

        #expect(visible.map(\.id) == [chat.id, task.id, latestResume.id])
    }

    @Test func chatServiceFailureKeepsPiReachable() {
        let api = APIEnvironment()
        api.markReachable()

        api.markRequestFailure(
            APIError.http(status: 503, message: "LLM provider unavailable")
        )

        #expect(api.isConnected)
    }

    @Test func chatTransportFailureMarksPiUnreachable() {
        let api = APIEnvironment()
        api.markReachable()

        api.markRequestFailure(URLError(.cannotConnectToHost))

        #expect(!api.isConnected)
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

    private func entry(
        id: String,
        failed: Bool,
        source: ChatStore.Entry.Source = .chat
    ) -> ChatStore.Entry {
        ChatStore.Entry(
            id: id,
            role: .user,
            text: id,
            intent: nil,
            createdAt: Date(timeIntervalSince1970: 0),
            failed: failed,
            retryPayload: failed ? .chat(text: id, image: nil) : nil,
            source: source
        )
    }
}
