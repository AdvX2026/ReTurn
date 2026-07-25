import Foundation

@Observable
@MainActor
final class ChatStore {
    enum RetryPayload: Equatable {
        case chat(text: String?, image: String?)
        case voice(data: Data, filename: String, clientUUID: String)
    }

    struct Entry: Identifiable, Equatable {
        enum Role: Equatable {
            case user, assistant
        }

        var id: String
        let role: Role
        let text: String
        let intent: ChatIntent?
        let createdAt: Date
        var failed: Bool
        var retryPayload: RetryPayload?
        let correctionMessageID: String?
        let taskID: String?

        init(
            id: String,
            role: Role,
            text: String,
            intent: ChatIntent?,
            createdAt: Date,
            failed: Bool,
            retryPayload: RetryPayload? = nil,
            correctionMessageID: String? = nil,
            taskID: String? = nil
        ) {
            self.id = id
            self.role = role
            self.text = text
            self.intent = intent
            self.createdAt = createdAt
            self.failed = failed
            self.retryPayload = retryPayload
            self.correctionMessageID = correctionMessageID
            self.taskID = taskID
        }
    }

    enum HistoryState: Equatable {
        case idle, loading, ready, failed(String)
    }

    private(set) var entries: [Entry] = []
    private(set) var historyState: HistoryState = .idle
    private(set) var isSending = false
    private(set) var isResuming = false
    private(set) var correctingMessageIDs: Set<String> = []
    private(set) var lastError: String?
    var pendingJump: ChatJump?

    private let api: APIEnvironment
    private var conversationRevision: UInt = 0
    private var isHistoryRequestInFlight = false

    init(api: APIEnvironment) {
        self.api = api
    }

    func loadHistory(force: Bool = false) async {
        guard !isHistoryRequestInFlight else { return }
        guard force || historyState == .idle || historyState.isFailure else { return }
        guard !isSending else { return }
        isHistoryRequestInFlight = true
        defer { isHistoryRequestInFlight = false }
        let requestRevision = conversationRevision
        historyState = .loading
        do {
            let response = try await api.makeClient().listMessages(limit: 50)
            let serverEntries = response.messages.reversed().map(Self.entry(from:))
            guard let mergedEntries = Self.reconciledHistory(
                serverEntries: serverEntries,
                currentEntries: entries,
                requestRevision: requestRevision,
                currentRevision: conversationRevision
            ) else {
                historyState = .idle
                api.markReachable()
                return
            }
            entries = mergedEntries
            historyState = .ready
            lastError = nil
            api.markReachable()
        } catch {
            let message = apiErrorMessage(error)
            historyState = .failed(message)
            lastError = message
            api.markUnreachable(error)
        }
    }

    func send(_ rawText: String) async {
        let text = rawText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        await send(text: text, image: nil, displayText: text)
    }

    func sendImage(_ image: String, note: String?) async {
        let trimmedNote = note?.trimmingCharacters(in: .whitespacesAndNewlines)
        await send(
            text: trimmedNote?.isEmpty == false ? trimmedNote : nil,
            image: image,
            displayText: trimmedNote?.isEmpty == false ? trimmedNote! : "Image attachment"
        )
    }

    func sendVoice(_ capture: VoiceRecorder.Capture) async {
        guard !isSending, api.isConnected else { return }
        isSending = true
        lastError = nil
        let localID = "local-\(UUID().uuidString)"
        mutateEntries {
            $0.append(
                Entry(
                    id: localID,
                    role: .user,
                    text: "Voice recording",
                    intent: nil,
                    createdAt: .now,
                    failed: false,
                    retryPayload: nil,
                    correctionMessageID: nil,
                    taskID: nil
                )
            )
        }
        do {
            let voice = try await api.makeClient().uploadVoice(
                audio: capture.data,
                filename: capture.filename,
                deviceId: api.deviceID,
                clientUuid: capture.clientUUID,
                date: APIEnvironment.dayKey(for: .now)
            )
            mutateEntries { $0.removeAll { $0.id == localID } }
            isSending = false
            await send(voice.transcript)
            return
        } catch {
            fail(
                localID,
                payload: .voice(
                    data: capture.data,
                    filename: capture.filename,
                    clientUUID: capture.clientUUID
                ),
                error: error
            )
        }
        isSending = false
    }

    func retry(_ entryID: String) async {
        guard let entry = entries.first(where: { $0.id == entryID }),
              let payload = entry.retryPayload else { return }
        mutateEntries { $0.removeAll { $0.id == entryID } }
        switch payload {
        case .chat(let text, let image):
            await send(
                text: text,
                image: image,
                displayText: text ?? "Image attachment"
            )
        case .voice(let data, let filename, let clientUUID):
            await sendVoice(.init(data: data, filename: filename, clientUUID: clientUUID))
        }
    }

    func correctIntent(messageID: String, to intent: ChatIntent) async {
        guard !correctingMessageIDs.contains(messageID), api.isConnected else { return }
        correctingMessageIDs.insert(messageID)
        defer { correctingMessageIDs.remove(messageID) }
        do {
            _ = try await api.makeClient().patchMessageIntent(id: messageID, intent: intent)
            api.markReachable()
            await loadHistory(force: true)
        } catch {
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    func resume(hours: Int = 3) async {
        guard !isResuming, api.isConnected else { return }
        isResuming = true
        lastError = nil
        defer { isResuming = false }
        do {
            let response = try await api.makeClient().resume(
                .init(deviceId: api.deviceID, hours: hours)
            )
            mutateEntries {
                $0.append(
                    Entry(
                        id: response.messageId,
                        role: .assistant,
                        text: response.reply,
                        intent: nil,
                        createdAt: .now,
                        failed: false,
                        retryPayload: nil,
                        correctionMessageID: nil,
                        taskID: nil
                    )
                )
            }
            api.markReachable()
        } catch {
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    func monitor() async {
        while !Task.isCancelled {
            if api.isConnected, !isSending {
                await loadHistory(force: true)
            }
            do {
                try await Task.sleep(for: .seconds(5))
            } catch {
                return
            }
        }
    }

    func consumePendingJump() -> ChatJump? {
        defer { pendingJump = nil }
        return pendingJump
    }

    private func send(text: String?, image: String?, displayText: String) async {
        guard !isSending, api.isConnected else { return }
        isSending = true
        lastError = nil
        let localID = "local-\(UUID().uuidString)"
        mutateEntries {
            $0.append(
                Entry(
                    id: localID,
                    role: .user,
                    text: displayText,
                    intent: nil,
                    createdAt: .now,
                    failed: false,
                    retryPayload: nil,
                    correctionMessageID: nil,
                    taskID: nil
                )
            )
        }
        do {
            let response = try await api.makeClient().chat(
                .init(text: text, image: image, deviceId: api.deviceID, intent: nil)
            )
            mutateEntries {
                if let index = $0.firstIndex(where: { $0.id == localID }) {
                    $0[index].id = response.userMessageId
                }
                $0.append(
                    Entry(
                        id: response.messageId,
                        role: .assistant,
                        text: response.reply,
                        intent: response.intent,
                        createdAt: .now,
                        failed: false,
                        retryPayload: nil,
                        correctionMessageID: response.intent == .unknown ? response.userMessageId : nil,
                        taskID: response.taskId
                    )
                )
            }
            pendingJump = response.jump
            api.markReachable()
        } catch {
            fail(localID, payload: .chat(text: text, image: image), error: error)
        }
        isSending = false
    }

    private func fail(_ localID: String, payload: RetryPayload, error: Error) {
        lastError = apiErrorMessage(error)
        mutateEntries {
            if let index = $0.firstIndex(where: { $0.id == localID }) {
                $0[index].failed = true
                $0[index].retryPayload = payload
            }
        }
        api.markUnreachable(error)
    }

    private func mutateEntries(_ mutation: (inout [Entry]) -> Void) {
        mutation(&entries)
        conversationRevision &+= 1
    }

    static func reconciledHistory(
        serverEntries: [Entry],
        currentEntries: [Entry],
        requestRevision: UInt,
        currentRevision: UInt
    ) -> [Entry]? {
        guard requestRevision == currentRevision else { return nil }
        let failedLocals = currentEntries.filter { $0.failed && $0.id.hasPrefix("local-") }
        return serverEntries + failedLocals
    }

    private static func entry(from message: MessageRecord) -> Entry {
        let correctionMessageID: String?
        if message.role == .agent, message.intent == .unknown,
           case .string(let userMessageID) = message.meta?["user_message_id"] {
            correctionMessageID = userMessageID
        } else {
            correctionMessageID = nil
        }
        return Entry(
            id: message.id,
            role: message.role == .user ? .user : .assistant,
            text: message.content,
            intent: message.intent,
            createdAt: ReTurnAPI.parseDate(message.createdAt) ?? .now,
            failed: false,
            retryPayload: nil,
            correctionMessageID: correctionMessageID,
            taskID: message.taskId
        )
    }
}

private extension ChatStore.HistoryState {
    var isFailure: Bool {
        if case .failed = self { return true }
        return false
    }
}
