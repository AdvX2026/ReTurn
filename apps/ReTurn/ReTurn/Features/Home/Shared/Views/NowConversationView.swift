#if os(macOS)
import SwiftUI

/// The Now transcript: user bubbles on the trailing edge in accent, replies
/// on the leading edge with the triage intent as a caption — PRD F4 requires
/// the app to say what it decided to do with the input. Anchored to the
/// bottom so the newest reply stays visible without manual scrolling.
struct NowConversationView: View {
    let entries: [ChatStore.Entry]
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    @Environment(ChatStore.self) private var chat: ChatStore

    var body: some View {
        ScrollView {
            LazyVStack(spacing: ReTurnDesign.Spacing.medium) {
                ForEach(entries) { entry in
                    bubble(for: entry)
                }
            }
            .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
            .padding(.vertical, ReTurnDesign.Spacing.small)
        }
        .defaultScrollAnchor(.bottom)
    }

    @ViewBuilder
    private func bubble(for entry: ChatStore.Entry) -> some View {
        let shape = RoundedRectangle(cornerRadius: 16, style: .continuous)
        switch entry.role {
        case .user:
            HStack {
                Spacer(minLength: 48)
                VStack(alignment: .trailing, spacing: ReTurnDesign.Spacing.extraSmall) {
                    Text(entry.text)
                        .font(ReTurnDesign.Typography.composer)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 12)
                        .padding(.vertical, ReTurnDesign.Spacing.small)
                        .background(Color.accentColor, in: shape)
                    if entry.failed {
                        HStack(spacing: ReTurnDesign.Spacing.small) {
                            Label("Not sent", systemImage: "exclamationmark.circle.fill")
                                .foregroundStyle(.red)
                            Button("Retry") {
                                Task { await chat.retry(entry.id) }
                            }
                            .disabled(!api.isConnected)
                        }
                        .font(.caption)
                    }
                }
            }
        case .assistant:
            HStack {
                VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.extraSmall) {
                    Text(entry.text)
                        .font(ReTurnDesign.Typography.composer)
                        .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                        .padding(.horizontal, 12)
                        .padding(.vertical, ReTurnDesign.Spacing.small)
                        .background(.quaternary, in: shape)
                    if let intent = entry.intent, let label = intentLabel(for: intent) {
                        Label(label.text, systemImage: label.symbol)
                            .font(.caption)
                            .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                            .padding(.leading, ReTurnDesign.Spacing.extraSmall)
                    }
                    if let messageID = entry.correctionMessageID,
                       needsIntentCorrection(messageID) {
                        intentCorrection(for: messageID)
                    }
                }
                Spacer(minLength: 48)
            }
        }
    }

    private func intentCorrection(for messageID: String) -> some View {
        HStack(spacing: ReTurnDesign.Spacing.extraSmall) {
            Text("Choose intent:")
            Button("Idea") {
                Task { await chat.correctIntent(messageID: messageID, to: .idea) }
            }
            Button("Find") {
                Task { await chat.correctIntent(messageID: messageID, to: .retrieval) }
            }
            Button("Ask") {
                Task { await chat.correctIntent(messageID: messageID, to: .question) }
            }
        }
        .font(.caption)
        .buttonStyle(.bordered)
        .disabled(!api.isConnected || chat.correctingMessageIDs.contains(messageID))
    }

    private func needsIntentCorrection(_ messageID: String) -> Bool {
        guard let intent = entries.first(where: { $0.id == messageID })?.intent else {
            return true
        }
        return intent == .unknown
    }

    /// The triage outcome in one glanceable word. `unknown` stays silent —
    /// the reply text itself already says it couldn't tell.
    private func intentLabel(for intent: ChatIntent) -> (text: String, symbol: String)? {
        switch intent {
        case .idea:
            ("Idea noted", "lightbulb")
        case .retrieval:
            ("Retrieved", "magnifyingglass")
        case .question:
            ("Answered", "questionmark.bubble")
        case .unknown:
            nil
        }
    }
}

#Preview {
    NowConversationView(
        entries: [
            .init(id: "1", role: .user, text: "早上那个设计稿的想法记一下", intent: nil, createdAt: .now, failed: false),
            .init(id: "2", role: .assistant, text: "已记录为灵感。", intent: .idea, createdAt: .now, failed: false),
            .init(id: "3", role: .user, text: "昨天我专注了多久？", intent: nil, createdAt: .now, failed: false),
            .init(id: "4", role: .assistant, text: "昨天你有 3 段专注会话，共 4 小时 20 分钟。", intent: .retrieval, createdAt: .now, failed: false),
        ]
    )
    .previewStores()
}
#endif
