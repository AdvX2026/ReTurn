//
//  APIClient.swift
//  ReTurn
//
//  Thin async/await client for the Pi server (port 8787). Transport only:
//  no caching, no outbox, no retries — those live in the stores (PRD §5.2).
//  All coding goes through ReTurnAPI (snake_case strategy, see Models.swift).
//

import Foundation

/// Fastify error body: { statusCode, error, message }.
struct APIErrorBody: Codable {
    var statusCode: Int
    var error: String
    var message: String
}

enum APIError: Error, LocalizedError {
    /// Non-2xx with the server's message when it sent one.
    case http(status: Int, message: String?)

    var errorDescription: String? {
        switch self {
        case .http(let status, let message):
            return message ?? "HTTP \(status)"
        }
    }
}

struct APIClient {
    var baseURL: URL
    /// Optional LAN API token (`API_TOKEN` on the Pi). Sent as `X-Return-Token`
    /// on every call except when a caller supplies its own headers (health).
    var apiToken: String? = nil
    var session: URLSession = .shared

    /// LLM-backed endpoints (save/chat/ask/resume) can be slow; plain reads are not.
    private static let llmTimeout: TimeInterval = 180

    // ── core ─────────────────────────────────────────────

    private func perform<T: Decodable>(
        _ method: String,
        _ path: String,
        query: [URLQueryItem] = [],
        bodyData: Data? = nil,
        contentType: String = "application/json",
        headers: [String: String] = [:],
        timeout: TimeInterval? = nil,
        skipDefaultToken: Bool = false
    ) async throws -> T {
        var components = URLComponents(
            url: baseURL.appending(path: path),
            resolvingAgainstBaseURL: false
        )!
        if !query.isEmpty { components.queryItems = query }

        var request = URLRequest(url: components.url!)
        request.httpMethod = method
        if let timeout { request.timeoutInterval = timeout }
        if let bodyData {
            request.httpBody = bodyData
            request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        }
        if !skipDefaultToken, let apiToken, !apiToken.isEmpty {
            request.setValue(apiToken, forHTTPHeaderField: "X-Return-Token")
        }
        for (key, value) in headers {
            request.setValue(value, forHTTPHeaderField: key)
        }

        let (data, response) = try await session.data(for: request)
        let status = (response as? HTTPURLResponse)?.statusCode ?? 0
        guard (200..<300).contains(status) else {
            let body = try? ReTurnAPI.makeDecoder().decode(APIErrorBody.self, from: data)
            throw APIError.http(status: status, message: body?.message)
        }
        return try ReTurnAPI.makeDecoder().decode(T.self, from: data)
    }

    private func get<T: Decodable>(_ path: String, query: [URLQueryItem] = []) async throws -> T {
        try await perform("GET", path, query: query)
    }

    private func send<T: Decodable>(
        _ method: String,
        _ path: String,
        body: some Encodable,
        timeout: TimeInterval? = nil
    ) async throws -> T {
        try await perform(
            method, path,
            bodyData: try ReTurnAPI.makeEncoder().encode(body),
            timeout: timeout
        )
    }

    // ── ping / devices ───────────────────────────────────

    func ping() async throws -> PingResponse {
        try await get("/api/ping")
    }

    func registerDevice(_ body: RegisterDeviceRequest) async throws -> RegisterDeviceResponse {
        try await send("POST", "/api/devices/register", body: body)
    }

    // ── nodes ────────────────────────────────────────────

    func createNodes(_ body: CreateNodesRequest) async throws -> CreateNodesResponse {
        try await send("POST", "/api/nodes", body: body)
    }

    func listNodes(date: String) async throws -> ListNodesResponse {
        try await get("/api/nodes", query: [.init(name: "date", value: date)])
    }

    /// Not in the Zod contract file; shape from routes.ts (error-capture cleanup).
    struct DeleteNodeResponse: Codable {
        var ok: Bool
        var id: String
    }

    func deleteNode(id: String) async throws -> DeleteNodeResponse {
        try await perform("DELETE", "/api/nodes/\(id)")
    }

    // ── voice (multipart) ────────────────────────────────

    func uploadVoice(
        audio: Data,
        filename: String = "note.m4a",
        mimeType: String = "audio/m4a",
        deviceId: String,
        clientUuid: String,
        date: String? = nil,
        title: String? = nil
    ) async throws -> VoiceResponse {
        var fields = ["device_id": deviceId, "client_uuid": clientUuid]
        fields["date"] = date
        fields["title"] = title
        let boundary = "return-\(UUID().uuidString)"
        return try await perform(
            "POST", "/api/voice",
            bodyData: Self.multipartBody(
                boundary: boundary,
                fields: fields,
                fileField: "file", filename: filename, mimeType: mimeType, fileData: audio
            ),
            contentType: "multipart/form-data; boundary=\(boundary)",
            timeout: Self.llmTimeout
        )
    }

    static func multipartBody(
        boundary: String,
        fields: [String: String],
        fileField: String,
        filename: String,
        mimeType: String,
        fileData: Data
    ) -> Data {
        var body = Data()
        for (name, value) in fields {
            body.append(Data("--\(boundary)\r\n".utf8))
            body.append(Data("Content-Disposition: form-data; name=\"\(name)\"\r\n\r\n".utf8))
            body.append(Data("\(value)\r\n".utf8))
        }
        body.append(Data("--\(boundary)\r\n".utf8))
        body.append(
            Data(
                "Content-Disposition: form-data; name=\"\(fileField)\"; filename=\"\(filename)\"\r\n"
                    .utf8))
        body.append(Data("Content-Type: \(mimeType)\r\n\r\n".utf8))
        body.append(fileData)
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        return body
    }

    // ── health (iOS HealthKit upload; fixed token) ───────

    func reportHealth(_ body: HealthRequest, token: String) async throws -> HealthResponse {
        try await perform(
            "POST", "/api/health",
            bodyData: try ReTurnAPI.makeEncoder().encode(body),
            headers: ["x-return-token": token],
            skipDefaultToken: true
        )
    }

    // ── save / stats / usage ─────────────────────────────

    func save(_ body: SaveRequest) async throws -> SaveResponse {
        try await send("POST", "/api/save", body: body, timeout: Self.llmTimeout)
    }

    func statsToday() async throws -> StatsTodayResponse {
        try await get("/api/stats/today")
    }

    func usage(from: String, to: String) async throws -> UsageResponse {
        try await get(
            "/api/usage",
            query: [.init(name: "from", value: from), .init(name: "to", value: to)]
        )
    }

    func timeline(date: String) async throws -> TimelineResponse {
        try await get("/api/timeline", query: [.init(name: "date", value: date)])
    }

    func timeline(from: String, to: String) async throws -> TimelineResponse {
        try await get(
            "/api/timeline",
            query: [.init(name: "from", value: from), .init(name: "to", value: to)]
        )
    }

    func days(range: Int) async throws -> DaysResponse {
        try await get("/api/days", query: [.init(name: "range", value: String(range))])
    }

    // ── todos ────────────────────────────────────────────

    func patchTodo(id: String, _ body: PatchTodoRequest) async throws -> PatchTodoResponse {
        try await send("PATCH", "/api/todos/\(id)", body: body)
    }

    func acceptTodo(id: String, _ body: AcceptTodoRequest) async throws -> AcceptTodoResponse {
        try await send("POST", "/api/todos/\(id)/accept", body: body)
    }

    func dismissTodo(id: String, _ body: DismissTodoRequest) async throws -> DismissTodoResponse {
        try await send("POST", "/api/todos/\(id)/dismiss", body: body)
    }

    // ── search / ask ─────────────────────────────────────

    func search(
        _ q: String,
        from: String? = nil,
        to: String? = nil,
        kinds: [String]? = nil,
        limit: Int? = nil
    ) async throws -> SearchResponse {
        var query: [URLQueryItem] = [.init(name: "q", value: q)]
        if let from { query.append(.init(name: "from", value: from)) }
        if let to { query.append(.init(name: "to", value: to)) }
        if let kinds { query.append(.init(name: "kinds", value: kinds.joined(separator: ","))) }
        if let limit { query.append(.init(name: "limit", value: String(limit))) }
        return try await get("/api/search", query: query)
    }

    func ask(_ body: AskRequest) async throws -> AskResponse {
        try await send("POST", "/api/ask", body: body, timeout: Self.llmTimeout)
    }

    // ── chat / messages / resume ─────────────────────────

    func chat(_ body: ChatRequest) async throws -> ChatResponse {
        try await send("POST", "/api/chat", body: body, timeout: Self.llmTimeout)
    }

    func listMessages(cursor: String? = nil, limit: Int? = nil) async throws -> ListMessagesResponse {
        var query: [URLQueryItem] = []
        if let cursor { query.append(.init(name: "cursor", value: cursor)) }
        if let limit { query.append(.init(name: "limit", value: String(limit))) }
        return try await get("/api/messages", query: query)
    }

    func patchMessageIntent(id: String, intent: ChatIntent) async throws
        -> PatchMessageIntentResponse
    {
        try await send(
            "PATCH", "/api/messages/\(id)/intent",
            body: PatchMessageIntentRequest(intent: intent),
            timeout: Self.llmTimeout
        )
    }

    func resume(_ body: ResumeRequest) async throws -> ResumeResponse {
        try await send("POST", "/api/resume", body: body, timeout: Self.llmTimeout)
    }

    // ── tasks / cards ────────────────────────────────────

    func listTasks(status: TaskStatus? = nil) async throws -> ListTasksResponse {
        var query: [URLQueryItem] = []
        if let status { query.append(.init(name: "status", value: status.rawValue)) }
        return try await get("/api/tasks", query: query)
    }

    func listCards(
        direction: StreamDirection,
        cursor: String? = nil,
        limit: Int? = nil
    ) async throws -> ListCardsResponse {
        var query: [URLQueryItem] = [.init(name: "direction", value: direction.rawValue)]
        if let cursor { query.append(.init(name: "cursor", value: cursor)) }
        if let limit { query.append(.init(name: "limit", value: String(limit))) }
        return try await get("/api/cards", query: query)
    }
}
