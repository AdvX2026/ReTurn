#if os(iOS)
import Foundation

struct TimelineDisplayItem: Identifiable, Equatable {
    enum Presentation: Equatable {
        case ambient
        case point
        case span
        case major
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

        if let presentationOverride {
            presentation = presentationOverride
        } else if segment.kind == .agent {
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
        (category ?? kind.rawValue)
            .replacing("_", with: " ")
            .localizedCapitalized
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
        let totalMinutes = max(Int((end.timeIntervalSince(start) / 60).rounded()), 1)
        let hours = totalMinutes / 60
        let minutes = totalMinutes % 60

        if hours == 0 {
            return "\(totalMinutes) MIN"
        }
        if minutes == 0 {
            return "\(hours) HR"
        }
        return "\(hours) HR \(minutes) MIN"
    }

    var symbolName: String {
        if isUserInput {
            return switch category {
            case "voice":
                "waveform"
            case "image":
                "photo"
            case "url":
                "link"
            default:
                "text.bubble"
            }
        }

        return switch kind {
        case .agent:
            "terminal"
        case .sleep:
            "moon.zzz"
        case .feed:
            switch category {
            case "voice":
                "waveform"
            case "idea":
                "lightbulb"
            case "image":
                "photo"
            case "reminder":
                "checkmark.circle"
            case "git":
                "arrow.triangle.branch"
            default:
                "circle.fill"
            }
        case .app:
            switch category {
            case "browser":
                "safari"
            case "dev":
                "hammer"
            case "social":
                "bubble.left.and.bubble.right"
            case "design":
                "pencil.and.outline"
            case "media":
                "play.rectangle"
            case "notes":
                "note.text"
            case "system":
                "gearshape"
            default:
                "app"
            }
        case .unknown:
            "circle"
        }
    }

    var accessibilityValue: String {
        if presentation == .point || presentation == .ambient {
            return "\(timeDisplay), \(categoryLabel)"
        }

        let baseValue = "\(timeDisplay), \(categoryLabel), \(durationDisplay)"
        guard let clusterPreview else {
            return baseValue
        }

        let visibleEvents = clusterPreview.entries
            .map { "\($0.time), \($0.title)" }
            .joined(separator: "; ")
        guard !visibleEvents.isEmpty else {
            return "\(baseValue), \(clusterPreview.totalCount) related events"
        }
        return "\(baseValue), \(clusterPreview.totalCount) related events: \(visibleEvents)"
    }
}
#endif
