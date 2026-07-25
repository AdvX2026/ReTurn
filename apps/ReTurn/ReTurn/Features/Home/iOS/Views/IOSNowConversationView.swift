#if os(iOS)
import SwiftUI

/// The active Now conversation. The empty state remains the mascot hero; once
/// an Input exists, replies become Health-style raised surfaces while the
/// user's own text stays a compact trailing bubble.
struct IOSNowConversationView: View {
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    @Environment(ChatStore.self) private var chat: ChatStore
    @State private var scrollTarget: String?

    private static let sendingID = "chat-sending"

    var body: some View {
        ScrollView {
            LazyVStack(spacing: ReTurnDesign.Card.spacing) {
                ForEach(chat.entries) { entry in
                    entryView(entry)
                        .id(entry.id)
                }

                if chat.isSending {
                    sendingSurface
                        .id(Self.sendingID)
                }
            }
            .scrollTargetLayout()
        }
        .contentMargins(
            .horizontal,
            ReTurnDesign.Metrics.screenHorizontalInset,
            for: .scrollContent
        )
        .contentMargins(
            .top,
            ReTurnDesign.Metrics.mainContentTopPadding,
            for: .scrollContent
        )
        .contentMargins(
            .bottom,
            ReTurnDesign.Spacing.large,
            for: .scrollContent
        )
        .scrollIndicators(.hidden)
        .scrollPosition(id: $scrollTarget, anchor: .bottom)
        .defaultScrollAnchor(.bottom)
        .onChange(of: latestTargetID, initial: true) { _, target in
            guard let target else { return }
            withAnimation(.easeOut(duration: 0.2)) {
                scrollTarget = target
            }
        }
        .accessibilityIdentifier("now.conversation")
    }

    @ViewBuilder
    private func entryView(_ entry: ChatStore.Entry) -> some View {
        switch entry.role {
        case .user:
            userBubble(entry)
        case .assistant:
            assistantSurface(entry)
        }
    }

    private func userBubble(_ entry: ChatStore.Entry) -> some View {
        VStack(alignment: .trailing, spacing: ReTurnDesign.Spacing.extraSmall) {
            Text(entry.text)
                .font(ReTurnDesign.Typography.composer)
                .foregroundStyle(.white)
                .padding(.horizontal, ReTurnDesign.Spacing.medium + 2)
                .padding(.vertical, ReTurnDesign.Spacing.small)
                .background(
                    Color.accentColor,
                    in: RoundedRectangle(
                        cornerRadius: ReTurnDesign.Card.cornerRadius,
                        style: .continuous
                    )
                )

            if entry.failed {
                HStack(spacing: ReTurnDesign.Spacing.small) {
                    Label("Not sent", systemImage: "exclamationmark.circle.fill")
                        .foregroundStyle(.red)

                    Button("Retry") {
                        Task { await chat.retry(entry.id) }
                    }
                    .buttonStyle(.bordered)
                    .buttonBorderShape(.capsule)
                    .disabled(!api.isConnected)
                }
                .font(.caption)
            }
        }
        .frame(maxWidth: .infinity, alignment: .trailing)
        .padding(.leading, ReTurnDesign.Card.padding * 2)
    }

    private func assistantSurface(_ entry: ChatStore.Entry) -> some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.medium) {
            if let intent = entry.intent, let presentation = intentPresentation(intent) {
                Label(presentation.title, systemImage: presentation.symbol)
                    .font(ReTurnDesign.Typography.cardHeader)
                    .foregroundStyle(presentation.color)
            }

            Text(entry.text)
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .textSelection(.enabled)

            if let messageID = entry.correctionMessageID,
               needsIntentCorrection(messageID) {
                intentCorrection(messageID: messageID)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ReTurnDesign.Card.padding)
        .background(
            ReTurnDesign.Colors.cardBackground,
            in: RoundedRectangle(
                cornerRadius: ReTurnDesign.Card.cornerRadius,
                style: .continuous
            )
        )
    }

    private var sendingSurface: some View {
        HStack(spacing: ReTurnDesign.Spacing.medium) {
            ProgressView()
                .controlSize(.small)
            Text("Working with your records…")
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(ReTurnDesign.Card.padding)
        .background(
            ReTurnDesign.Colors.cardBackground,
            in: RoundedRectangle(
                cornerRadius: ReTurnDesign.Card.cornerRadius,
                style: .continuous
            )
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("ReTurn is working with your records")
    }

    private func intentCorrection(messageID: String) -> some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.small) {
            Text("What did you mean?")
                .font(.caption)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)

            HStack(spacing: ReTurnDesign.Spacing.small) {
                intentButton("Idea", intent: .idea, messageID: messageID)
                intentButton("Find", intent: .retrieval, messageID: messageID)
                intentButton("Ask", intent: .question, messageID: messageID)

                if chat.correctingMessageIDs.contains(messageID) {
                    ProgressView()
                        .controlSize(.small)
                }
            }
        }
    }

    private func intentButton(
        _ title: String,
        intent: ChatIntent,
        messageID: String
    ) -> some View {
        Button(title) {
            Task { await chat.correctIntent(messageID: messageID, to: intent) }
        }
        .buttonStyle(.bordered)
        .buttonBorderShape(.capsule)
        .frame(minHeight: 44)
        .disabled(
            !api.isConnected || chat.correctingMessageIDs.contains(messageID)
        )
    }

    private var latestTargetID: String? {
        chat.isSending ? Self.sendingID : chat.entries.last?.id
    }

    private func needsIntentCorrection(_ messageID: String) -> Bool {
        guard let intent = chat.entries.first(where: { $0.id == messageID })?.intent else {
            return true
        }
        return intent == .unknown
    }

    private func intentPresentation(
        _ intent: ChatIntent
    ) -> (title: String, symbol: String, color: Color)? {
        switch intent {
        case .idea:
            ("Idea captured", "lightbulb.fill", ReTurnDesign.Colors.Accents.idea)
        case .retrieval:
            ("Found in your records", "magnifyingglass", .teal)
        case .question:
            ("Answer", "questionmark.bubble.fill", .blue)
        case .unknown:
            nil
        }
    }
}
#endif
