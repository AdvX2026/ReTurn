#if os(macOS)
import SwiftUI

/// macOS Now actions: the greeting, Save Today button and its result line.
/// iOS deliberately keeps the reviewed mascot-only hero instead of composing
/// these desktop controls into its page.

func nowGreeting(for state: CharacterState) -> String {
    switch state {
    case .tired: "Tough day — rest early."
    case .productive: "A productive day!"
    case .focused: "Deep focus today."
    case .inspired: "An inspired day!"
    case .normal: "Welcome back!"
    }
}

/// One line of Save feedback: the day's opening line, new-card count and
/// streak after a save, or the error after a failure. Reads `SaveStore`
/// directly so every macOS placement stays in sync.
struct SaveResultLine: View {
    @Environment(SaveStore.self) private var save: SaveStore

    var body: some View {
        if let result = save.result {
            Text(Self.line(for: result))
                .font(.caption)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                .multilineTextAlignment(.center)
        } else if let error = save.error {
            Text(error)
                .font(.caption)
                .foregroundStyle(.red)
                .multilineTextAlignment(.center)
        }
    }

    static func line(for result: SaveResponse) -> String {
        if result.alreadySaved {
            return "Already saved today · streak \(result.streak)"
        }
        var parts: [String] = []
        if let opening = result.openingLine, !opening.isEmpty {
            parts.append(opening)
        }
        if let cardsCreated = result.cardsCreated, cardsCreated > 0 {
            parts.append("\(cardsCreated) new cards in After")
        }
        parts.append("streak \(result.streak)")
        return parts.joined(separator: " · ")
    }
}

/// The F5 action. Optional note anchors the ferment prompt. A successful save
/// regenerates stats, the streak/overview and the After stream server-side.
struct SaveTodayButton: View {
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    @Environment(StatsStore.self) private var stats: StatsStore
    @Environment(SaveStore.self) private var save: SaveStore
    @Environment(CardsStore.self) private var cards: CardsStore
    @Environment(TimelineStore.self) private var timeline: TimelineStore
    @State private var note = ""
    @State private var showNote = false

    var body: some View {
        VStack(spacing: ReTurnDesign.Spacing.small) {
            if showNote {
                TextField("Optional note for tonight's ferment…", text: $note)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 320)
            }
            HStack(spacing: ReTurnDesign.Spacing.small) {
                Button {
                    showNote.toggle()
                } label: {
                    Image(systemName: showNote ? "text.badge.minus" : "text.badge.plus")
                }
                .buttonStyle(.bordered)
                .disabled(!api.isConnected || save.isSaving || stats.savedToday)
                .help("Add an optional Save note")

                Button {
                    Task {
                        let saved = await save.save(noteText: note)
                        guard saved else { return }
                        note = ""
                        showNote = false
                        await stats.refresh()
                        await cards.refresh()
                        await timeline.refreshOverview()
                    }
                } label: {
                    HStack(spacing: ReTurnDesign.Spacing.small) {
                        if save.isSaving {
                            ProgressView()
                                .controlSize(.small)
                        } else {
                            Image(systemName: stats.savedToday ? "checkmark.seal.fill" : "moon.stars")
                        }
                        Text(stats.savedToday ? "Saved" : "Save Today")
                    }
                    .font(.callout.weight(.medium))
                }
                .buttonStyle(.borderedProminent)
                .disabled(!api.isConnected || save.isSaving || stats.savedToday)
            }
        }
    }
}

#Preview {
    VStack(spacing: ReTurnDesign.Spacing.medium) {
        SaveTodayButton()
        SaveResultLine()
    }
    .padding()
    .previewStores()
}
#endif
