import Foundation

struct TimelineDisplayItem: Identifiable, Equatable {
    enum Presentation: Equatable {
        case ambient
        case point
        case span
        case major
    }

    /// One row in the expanded sample detail card.
    struct DetailField: Identifiable, Equatable {
        let id: String
        let label: String
        let value: String
    }

    let id: String
    let kind: TimelineSegmentKind
    let start: Date
    let end: Date
    let label: String
    let category: String?
    let dayIdentifier: String?
    let presentation: Presentation
    let clusterPreview: TimelineClusterPreview?
    /// Full projection meta from `/api/timeline` — enough to render a detail
    /// card without a second network hop.
    let meta: [String: JSONValue]
    let nodeId: String?

    init?(
        segment: TimelineSegment,
        presentation presentationOverride: Presentation? = nil,
        clusterPreview: TimelineClusterPreview? = nil
    ) {
        guard let start = ReTurnAPI.parseDate(segment.start) else {
            return nil
        }

        let parsedEnd = ReTurnAPI.parseDate(segment.end) ?? start
        let end = max(parsedEnd, start)
        let meta = segment.meta ?? [:]

        id = segment.nodeId
            ?? [
                segment.kind.rawValue,
                segment.start,
                segment.end,
                segment.label,
                segment.category ?? "",
            ].joined(separator: "|")
        kind = segment.kind
        self.start = start
        self.end = end
        label = segment.label
        category = segment.category
        dayIdentifier = segment.date
        self.clusterPreview = clusterPreview
        self.meta = meta
        nodeId = segment.nodeId

        if let presentationOverride {
            presentation = presentationOverride
        } else if segment.kind == .agent {
            // Preserve the reviewed iOS hierarchy: agent sessions are major cards.
            presentation = .major
        } else if segment.kind == .feed || end == start {
            presentation = .point
        } else {
            presentation = .span
        }
    }

    var isUserInput: Bool {
        guard kind == .feed, presentation == .point else {
            return false
        }

        return switch category {
        case "text", "url", "voice", "image":
            true
        default:
            false
        }
    }

    var categoryLabel: String {
        switch category {
        case "browse_history": "Browse"
        case "tab_sample": "Open tab"
        case "git_commit": "Git"
        case "vscode_recent": "Editor"
        case "save_note": "Note"
        case "todo_check": "Todo"
        case "other": "App"
        case "agent": "Agent"
        case let value?:
            value.replacingOccurrences(of: "_", with: " ").localizedCapitalized
        case nil:
            kind.rawValue.localizedCapitalized
        }
    }

    /// One-line secondary text under the title (provider, host, duration…).
    var subtitle: String? {
        // Prefer the most informative secondary line.
        if let provider = metaString("provider"), kind == .agent {
            return "\(provider) · \(durationDisplay)"
        }
        if let url = metaString("url") ?? metaString("content"),
           category == "browse_history" || category == "tab_sample" || category == "url" {
            return url
        }
        if let repo = metaString("repo"), category == "git_commit" {
            return shortPath(repo)
        }
        if kind == .app, let count = metaNumber("sample_count") {
            return "\(Int(count)) samples · \(durationDisplay)"
        }
        if presentation == .span || presentation == .major {
            return durationDisplay
        }
        return nil
    }

    /// Flattened meta for the expanded sample detail card.
    var detailFields: [DetailField] {
        var rows: [DetailField] = []
        let preferredOrder = [
            "provider", "project", "session_id", "duration_min",
            "app", "bundle_id", "sample_count", "category",
            "browser", "url", "title", "visited_at",
            "repo", "sha", "committed_at", "files_changed", "insertions", "deletions",
            "list", "completed", "due", "reminder_id",
            "editor", "path", "uri", "entry_kind",
            "direction", "from", "to", "subject",
            "content", "source", "kind", "client_uuid", "node_id",
        ]
        var seen = Set<String>()

        func append(key: String, value: String) {
            let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty else { return }
            guard seen.insert(key).inserted else { return }
            rows.append(
                DetailField(
                    id: key,
                    label: key.replacingOccurrences(of: "_", with: " ").localizedCapitalized,
                    value: trimmed
                )
            )
        }

        if let nodeId {
            append(key: "node_id", value: nodeId)
        }

        for key in preferredOrder {
            if let value = meta[key] {
                append(key: key, value: Self.displayString(value))
            }
        }
        for (key, value) in meta.sorted(by: { $0.key < $1.key }) where !seen.contains(key) {
            append(key: key, value: Self.displayString(value))
        }
        return rows
    }

    var timeDisplay: String {
        let startText = start.formatted(date: .omitted, time: .shortened)
        guard presentation != .point, presentation != .ambient else {
            return startText
        }

        let endText = end.formatted(date: .omitted, time: .shortened)
        return "\(startText)–\(endText)"
    }

    var durationDisplay: String {
        if let minutes = metaNumber("duration_min"), minutes >= 0 {
            return Self.formatMinutes(Int(minutes.rounded()))
        }
        let totalMinutes = max(Int((end.timeIntervalSince(start) / 60).rounded()), 1)
        return Self.formatMinutes(totalMinutes)
    }

    var symbolName: String {
        if isUserInput {
            return switch category {
            case "voice": "waveform"
            case "image": "photo"
            case "url": "link"
            default: "text.bubble"
            }
        }

        return switch kind {
        case .agent:
            "terminal"
        case .sleep:
            "moon.zzz"
        case .feed:
            switch category {
            case "voice": "waveform"
            case "idea": "lightbulb"
            case "image": "photo"
            case "reminder": "checklist"
            case "git", "git_commit": "arrow.triangle.branch"
            case "browse_history": "globe"
            case "tab_sample": "macwindow"
            case "vscode_recent": "chevron.left.forwardslash.chevron.right"
            case "email": "envelope"
            case "todo_check": "checkmark.circle"
            case "url": "link"
            case "text", "save_note": "text.bubble"
            default: "circle.fill"
            }
        case .app:
            switch category {
            case "browser": "safari"
            case "dev": "hammer"
            case "social": "bubble.left.and.bubble.right"
            case "design": "pencil.and.outline"
            case "media": "play.rectangle"
            case "notes": "note.text"
            case "system": "gearshape"
            case "other": "app.dashed"
            default: "app"
            }
        case .unknown:
            "circle"
        }
    }

    var accessibilityValue: String {
        var parts = [timeDisplay, categoryLabel]
        if presentation != .point, presentation != .ambient {
            parts.append(durationDisplay)
        }
        if let subtitle {
            parts.append(subtitle)
        }
        if let clusterPreview {
            let visibleEvents = clusterPreview.entries
                .map { "\($0.time), \($0.title)" }
                .joined(separator: "; ")
            if visibleEvents.isEmpty {
                parts.append("\(clusterPreview.totalCount) related events")
            } else {
                parts.append("\(clusterPreview.totalCount) related events: \(visibleEvents)")
            }
        }
        return parts.joined(separator: ", ")
    }

    // ── meta helpers ─────────────────────────────────────

    func metaString(_ key: String) -> String? {
        guard let value = meta[key] else { return nil }
        let text = Self.displayString(value).trimmingCharacters(in: .whitespacesAndNewlines)
        return text.isEmpty ? nil : text
    }

    func metaNumber(_ key: String) -> Double? {
        guard case .number(let n) = meta[key] else { return nil }
        return n
    }

    private static func displayString(_ value: JSONValue) -> String {
        switch value {
        case .string(let s): s
        case .number(let n):
            n.rounded() == n ? String(Int(n)) : String(n)
        case .bool(let b): b ? "true" : "false"
        case .null: ""
        case .array(let items):
            items.map(displayString).filter { !$0.isEmpty }.joined(separator: ", ")
        case .object(let obj):
            obj
                .sorted(by: { $0.key < $1.key })
                .map { "\($0.key): \(displayString($0.value))" }
                .joined(separator: "; ")
        }
    }

    private static func formatMinutes(_ totalMinutes: Int) -> String {
        let minutes = max(totalMinutes, 0)
        let hours = minutes / 60
        let rest = minutes % 60
        if hours == 0 { return "\(minutes) MIN" }
        if rest == 0 { return "\(hours) HR" }
        return "\(hours) HR \(rest) MIN"
    }

    private func shortPath(_ path: String) -> String {
        let parts = path.split(separator: "/").filter { !$0.isEmpty }
        guard let last = parts.last else { return path }
        if parts.count == 1 { return String(last) }
        return parts.suffix(2).joined(separator: "/")
    }
}
