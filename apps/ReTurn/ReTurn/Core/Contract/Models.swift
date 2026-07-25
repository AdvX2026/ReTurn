//
//  Models.swift
//  ReTurn
//
//  Swift Codable mirror of the shared API contract (packages/shared, Zod).
//  Mirror basis: origin/feat/global-search @ 809ec73 (PR #8, v0.6 surface).
//  Contract rule (AGENTS.md): any contract change updates this file in the
//  same commit. Decode/encode ONLY via ReTurnAPI.makeDecoder()/makeEncoder()
//  (snake_case conversion lives there, not in CodingKeys).
//
//  Enum policy: the backend keeps growing string enums (NodeKind gains new
//  sampler sources in open PRs). Every mirrored enum decodes unrecognized
//  values to a fallback instead of throwing, so old app builds never crash
//  on new server data.
//

import Foundation

// ── coding helpers ───────────────────────────────────────

enum ReTurnAPI {
    static func makeDecoder() -> JSONDecoder {
        let d = JSONDecoder()
        d.keyDecodingStrategy = .convertFromSnakeCase
        return d
    }

    static func makeEncoder() -> JSONEncoder {
        let e = JSONEncoder()
        e.keyEncodingStrategy = .convertToSnakeCase
        return e
    }

    /// Server timestamps are ISO 8601 with fractional seconds; tolerate both.
    static func parseDate(_ iso: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: iso) { return date }
        let plain = ISO8601DateFormatter()
        return plain.date(from: iso)
    }
}

/// Arbitrary JSON for loose contract fields (source_meta, task input, card raw).
enum JSONValue: Codable, Equatable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() {
            self = .null
        } else if let b = try? c.decode(Bool.self) {
            self = .bool(b)
        } else if let n = try? c.decode(Double.self) {
            self = .number(n)
        } else if let s = try? c.decode(String.self) {
            self = .string(s)
        } else if let a = try? c.decode([JSONValue].self) {
            self = .array(a)
        } else {
            self = .object(try c.decode([String: JSONValue].self))
        }
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n): try c.encode(n)
        case .bool(let b): try c.encode(b)
        case .null: try c.encodeNil()
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }
}

/// String enum that decodes unknown raw values to a fallback instead of throwing.
protocol TolerantEnum: RawRepresentable, Codable where RawValue == String {
    static var fallback: Self { get }
}

extension TolerantEnum {
    init(from decoder: Decoder) throws {
        let raw = try decoder.singleValueContainer().decode(String.self)
        self = Self(rawValue: raw) ?? Self.fallback
    }
}

// ── domain enums (shared/src/domain.ts) ──────────────────

enum NodeKind: String, TolerantEnum {
    case text, url, voice, saveNote = "save_note"
    case appSample = "app_sample", tabSample = "tab_sample"
    case agentSession = "agent_session", gitCommit = "git_commit"
    case healthDaily = "health_daily", snapshot
    case todoCheck = "todo_check", idea, image, reminder
    case unknown
    static let fallback = NodeKind.unknown
}

enum ChatIntent: String, TolerantEnum {
    case idea, retrieval, question, unknown
    static let fallback = ChatIntent.unknown
}

enum MessageRole: String, TolerantEnum {
    case user, agent, unknown
    static let fallback = MessageRole.unknown
}

enum TaskType: String, TolerantEnum {
    case meetingNotes = "meeting_notes", imageExtract = "image_extract", generic
    static let fallback = TaskType.generic
}

enum TaskStatus: String, TolerantEnum {
    case queued, running, done, failed, unknown
    static let fallback = TaskStatus.unknown
}

enum CardType: String, TolerantEnum {
    case briefing, idea, todoSuggestion = "todo_suggestion", health, unknown
    static let fallback = CardType.unknown
}

enum CadenceMode: String, TolerantEnum {
    case active, night
    static let fallback = CadenceMode.active
}

enum IdeaProvenance: String, TolerantEnum {
    case user, auto
    static let fallback = IdeaProvenance.auto
}

enum TodoStatus: String, TolerantEnum {
    case suggested, accepted, dismissed
    static let fallback = TodoStatus.suggested
}

enum CharacterState: String, TolerantEnum {
    case tired, productive, focused, inspired, normal
    static let fallback = CharacterState.normal
}

enum DevicePlatform: String, TolerantEnum {
    case macos, ios, linux, unknown
    static let fallback = DevicePlatform.unknown
}

/// Five-dimensional stats, all 0–100. Computed by code on the Pi, never LLM.
struct Stats: Codable, Equatable {
    var intake: Double
    var focus: Double
    var output: Double
    var continuity: Double
    var energy: Double

    static let empty = Stats(intake: 0, focus: 0, output: 0, continuity: 0, energy: 100)
}

// ── devices ──────────────────────────────────────────────

struct RegisterDeviceRequest: Codable {
    var name: String
    var platform: DevicePlatform
    var deviceId: String?
}

struct RegisterDeviceResponse: Codable {
    var deviceId: String
}

// ── nodes ────────────────────────────────────────────────

struct NodeInput: Codable {
    /// Idempotency key — NEVER regenerate on retry (AGENTS.md).
    var clientUuid: String
    var kind: NodeKind
    var title: String?
    var content: String?
    var sourceMeta: [String: JSONValue]?
    var clientCreatedAt: String?
    var date: String?
}

struct CreateNodesRequest: Codable {
    var deviceId: String
    var nodes: [NodeInput]
}

struct NodeRecord: Codable, Identifiable {
    var id: String
    var dayId: String
    var deviceId: String?
    var kind: NodeKind
    var title: String?
    var content: String?
    var sourceMeta: [String: JSONValue]?
    var clientUuid: String
    var createdAt: String
    var date: String
}

struct CreateNodesResponse: Codable {
    var created: [NodeRecord]
    var duplicates: [String]
    var cadence: CadenceMode?
}

struct ListNodesResponse: Codable {
    var date: String
    var nodes: [NodeRecord]
}

// ── voice ────────────────────────────────────────────────

struct VoiceResponse: Codable {
    var node: NodeRecord
    var transcript: String
}

// ── health ───────────────────────────────────────────────

struct HealthRequest: Codable {
    var date: String
    var sleepMinutes: Int
    var steps: Int
}

struct HealthResponse: Codable {
    var node: NodeRecord
}

// ── save ─────────────────────────────────────────────────

struct SaveRequest: Codable {
    var date: String
    var deviceId: String?
    var noteText: String?
    var noteVoiceRef: String?
}

enum ReviewPointKind: String, TolerantEnum {
    case win, miss, insight, other
    static let fallback = ReviewPointKind.other
}

struct ReviewPoint: Codable, Equatable {
    var text: String
    var kind: ReviewPointKind
}

struct TodoRecord: Codable, Identifiable {
    var id: String
    var dayId: String
    var text: String
    var done: Bool
    var status: TodoStatus
    var sourceNodeId: String?
    var acceptedReminderId: String?
    var acceptedAt: String?
    var dismissedAt: String?
}

struct SaveResponse: Codable {
    var dayId: String
    var date: String
    var savedAt: String
    var alreadySaved: Bool
    var degraded: Bool
    var summary: String?
    var openingLine: String?
    var briefing: String?
    var reviewPoints: [ReviewPoint]
    var todos: [TodoRecord]
    var stats: Stats
    var characterState: CharacterState
    var streak: Int
    var edgesCreated: Int
    var cardsCreated: Int?
    var cadence: CadenceMode?
}

// ── continue (LEGACY v0.5; superseded by cards + messages) ──

struct ContinueResponse: Codable {
    struct Before: Codable {
        var date: String
        var openingLine: String?
        var summary: String?
        var reviewPoints: [ReviewPoint]
        var stats: Stats?
        var characterState: CharacterState?
        var statsDelta: Stats?
    }

    struct Future: Codable {
        var date: String
        var todos: [TodoRecord]
    }

    var before: Before?
    var future: Future
    var characterState: CharacterState
    var stats: Stats
    var streak: Int
    var isColdStart: Bool
}

// ── stats / timeline / days ──────────────────────────────

struct StatsTodayResponse: Codable {
    var date: String
    var stats: Stats
    var characterState: CharacterState
    var saved: Bool
    var cadence: CadenceMode?
}

enum TimelineSegmentKind: String, TolerantEnum {
    case app, agent, sleep, feed, unknown
    static let fallback = TimelineSegmentKind.unknown
}

struct TimelineSegment: Codable {
    var kind: TimelineSegmentKind
    var start: String
    var end: String
    var label: String
    var category: String?
    var nodeId: String?
    var meta: [String: JSONValue]?
    var date: String?
}

struct TimelineResponse: Codable {
    var date: String
    var from: String?
    var to: String?
    var segments: [TimelineSegment]
}

struct DaySummary: Codable {
    var date: String
    var savedAt: String?
    var summary: String?
    var stats: Stats?
    var characterState: CharacterState?
}

struct DaysResponse: Codable {
    var range: Int
    var days: [DaySummary]
    var streak: Int
}

// ── todos ────────────────────────────────────────────────

struct PatchTodoRequest: Codable {
    var done: Bool
    var deviceId: String?
}

struct PatchTodoResponse: Codable {
    var todo: TodoRecord
    var checkNode: NodeRecord?
}

struct AcceptTodoRequest: Codable {
    var deviceId: String?
    var reminderId: String?
}

struct AcceptTodoResponse: Codable {
    var todo: TodoRecord
}

struct DismissTodoRequest: Codable {
    var deviceId: String?
}

struct DismissTodoResponse: Codable {
    var todo: TodoRecord
}

// ── ping ─────────────────────────────────────────────────

struct PingResponse: Codable {
    var ok: Bool
    var serverTime: String
    var version: String
    var cadence: CadenceMode?
}

// ── search / ask ─────────────────────────────────────────

struct SearchHit: Codable {
    var docId: String
    var kind: String
    var score: Double
    var snippet: String
    var node: NodeRecord?
    var day: DaySummary?
}

struct SearchResponse: Codable {
    var query: String
    var tookMs: Int
    var results: [SearchHit]
}

struct AskRequest: Codable {
    var question: String
    var from: String?
    var to: String?
}

struct AskCitation: Codable {
    var nodeId: String?
    var date: String
    var kind: String
    var title: String?
    var snippet: String
}

struct AskResponse: Codable {
    var answer: String
    var citations: [AskCitation]
    var retrieved: Int
    var degraded: Bool
}

// ── messages / chat / resume ─────────────────────────────

struct MessageRecord: Codable, Identifiable {
    var id: String
    var role: MessageRole
    var content: String
    var intent: ChatIntent?
    var taskId: String?
    var createdAt: String
    var meta: [String: JSONValue]?
}

struct ChatRequest: Codable {
    var text: String?
    var image: String?
    var deviceId: String?
    /// Force intent (user correction / picking after "unknown").
    var intent: ChatIntent?
}

struct ChatJump: Codable {
    var date: String
    var nodeIds: [String]
}

struct ChatResponse: Codable {
    var messageId: String
    var userMessageId: String
    var intent: ChatIntent
    var confidence: Double
    var reply: String
    /// Retrieval jump target (F10) — scroll timeline there.
    var jump: ChatJump?
    var taskId: String?
    var degraded: Bool?
}

struct PatchMessageIntentRequest: Codable {
    var intent: ChatIntent
}

struct PatchMessageIntentResponse: Codable {
    var message: MessageRecord
}

struct ListMessagesResponse: Codable {
    var messages: [MessageRecord]
    var nextCursor: String?
}

struct ResumeRequest: Codable {
    var deviceId: String?
    var hours: Int?
}

struct ResumeResponse: Codable {
    var messageId: String
    var reply: String
    var degraded: Bool
}

// ── tasks ────────────────────────────────────────────────

struct TaskRecord: Codable, Identifiable {
    var id: String
    var type: TaskType
    var status: TaskStatus
    var input: [String: JSONValue]
    var resultMessageId: String?
    var createdAt: String
    var finishedAt: String?
}

struct ListTasksResponse: Codable {
    var tasks: [TaskRecord]
}

// ── cards ────────────────────────────────────────────────
// Contract keeps content as loose JSON; shapes below mirror what the server
// actually writes (services/save.ts + services/chat.ts on the mirror basis).
// Mismatched/unknown content falls back to .raw instead of failing the list.

struct BriefingCardContent: Codable {
    var summary: String
    var openingLine: String
    var briefing: String
    var reviewPoints: [ReviewPoint]
    var stats: Stats
    var characterState: CharacterState
    var nodeIds: [String]
}

struct TodoSuggestionCardContent: Codable {
    var todos: [String]
    var todoIds: [String]
}

struct HealthCardContent: Codable {
    var advice: String
    var sleepMinutes: Int?
    var steps: Int?
}

struct IdeaCardContent: Codable {
    var text: String
    var nodeIds: [String]
    /// UI must visually distinguish user-recorded vs auto-extracted (F9).
    var provenance: IdeaProvenance
}

enum CardContent {
    case briefing(BriefingCardContent)
    case todoSuggestion(TodoSuggestionCardContent)
    case health(HealthCardContent)
    case idea(IdeaCardContent)
    case raw([String: JSONValue])
}

struct CardRecord: Codable, Identifiable {
    var id: String
    var type: CardType
    var date: String
    var content: CardContent
    var createdAt: String

    private enum CodingKeys: String, CodingKey {
        case id, type, date, content, createdAt
    }

    init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        id = try c.decode(String.self, forKey: .id)
        type = try c.decode(CardType.self, forKey: .type)
        date = try c.decode(String.self, forKey: .date)
        createdAt = try c.decode(String.self, forKey: .createdAt)

        let typed: CardContent?
        switch type {
        case .briefing:
            typed = (try? c.decode(BriefingCardContent.self, forKey: .content)).map(CardContent.briefing)
        case .todoSuggestion:
            typed = (try? c.decode(TodoSuggestionCardContent.self, forKey: .content))
                .map(CardContent.todoSuggestion)
        case .health:
            typed = (try? c.decode(HealthCardContent.self, forKey: .content)).map(CardContent.health)
        case .idea:
            typed = (try? c.decode(IdeaCardContent.self, forKey: .content)).map(CardContent.idea)
        case .unknown:
            typed = nil
        }
        content = typed ?? .raw((try? c.decode([String: JSONValue].self, forKey: .content)) ?? [:])
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(type, forKey: .type)
        try c.encode(date, forKey: .date)
        try c.encode(createdAt, forKey: .createdAt)
        switch content {
        case .briefing(let v): try c.encode(v, forKey: .content)
        case .todoSuggestion(let v): try c.encode(v, forKey: .content)
        case .health(let v): try c.encode(v, forKey: .content)
        case .idea(let v): try c.encode(v, forKey: .content)
        case .raw(let v): try c.encode(v, forKey: .content)
        }
    }
}

enum StreamDirection: String, Codable {
    case before, future
}

struct ListCardsResponse: Codable {
    var direction: StreamDirection
    var cards: [CardRecord]
    var nextCursor: String?
}
