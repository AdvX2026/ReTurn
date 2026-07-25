#if os(iOS)
import SwiftUI

/// The active Now conversation. The empty state remains the mascot hero; once
/// an Input exists, the transcript starts below the navigation and grows down.
/// Replies blend iMessage-like bubbles with Health-style semantic headers,
/// while the user's own text stays a compact trailing bubble.
struct IOSNowConversationView: View {
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    @Environment(ChatStore.self) private var chat: ChatStore
    @State private var scrollTarget: String?

    private static let sendingID = "chat-sending"
    private static let bottomID = "chat-bottom"

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

                Color.clear
                    .frame(height: ReTurnDesign.Card.pageBottomPadding)
                    .accessibilityHidden(true)

                Color.clear
                    .frame(height: 1)
                    .id(Self.bottomID)
                    .accessibilityHidden(true)
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
            ReTurnDesign.Metrics.mainContentTopPadding + ReTurnDesign.Spacing.large,
            for: .scrollContent
        )
        .scrollIndicators(.hidden)
        .scrollPosition(id: $scrollTarget)
        .defaultScrollAnchor(.top)
        .onChange(of: latestTargetID, initial: true) { _, target in
            guard target != nil else { return }
            withAnimation(.easeOut(duration: 0.2)) {
                scrollTarget = Self.bottomID
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
                    in: outgoingBubbleShape
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
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.small) {
            HStack(alignment: .bottom, spacing: 0) {
                VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.medium) {
                    if let intent = entry.intent,
                       let presentation = intentPresentation(intent) {
                        Label(presentation.title, systemImage: presentation.symbol)
                            .font(ReTurnDesign.Typography.cardHeader)
                            .foregroundStyle(presentation.color)
                    }

                    Text(entry.text)
                        .font(ReTurnDesign.Typography.cardBody)
                        .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                        .textSelection(.enabled)
                }
                .padding(ReTurnDesign.Card.padding)
                .background(
                    ReTurnDesign.Colors.cardBackground,
                    in: incomingBubbleShape
                )

                Spacer(minLength: ReTurnDesign.Card.padding * 2)
            }

            if let messageID = entry.correctionMessageID {
                if let intent = correctedIntent(for: messageID) {
                    intentCompletion(intent)
                } else if chat.correctingMessageIDs.contains(messageID) {
                    sendingSurface
                } else {
                    intentQuickReplies(messageID: messageID)
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var sendingSurface: some View {
        HStack(alignment: .bottom, spacing: 0) {
            ThinkingDots()
                .padding(.horizontal, ReTurnDesign.Card.padding)
                .padding(.vertical, ReTurnDesign.Spacing.medium)
                .background(
                    ReTurnDesign.Colors.cardBackground,
                    in: incomingBubbleShape
                )

            Spacer(minLength: ReTurnDesign.Card.padding * 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("ReTurn is thinking")
    }

    private func intentQuickReplies(messageID: String) -> some View {
        HStack(alignment: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                intentButton(
                    "Idea",
                    intent: .idea,
                    messageID: messageID
                )

                Divider()
                    .padding(.leading, ReTurnDesign.Card.padding)

                intentButton(
                    "Find",
                    intent: .retrieval,
                    messageID: messageID
                )

                Divider()
                    .padding(.leading, ReTurnDesign.Card.padding)

                intentButton(
                    "Ask",
                    intent: .question,
                    messageID: messageID
                )
            }
            .background(
                ReTurnDesign.Colors.cardBackground,
                in: incomingBubbleShape
            )

            Spacer(minLength: ReTurnDesign.Card.padding * 2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .contain)
        .accessibilityLabel("Choose what you meant")
    }

    private func intentButton(
        _ title: String,
        intent: ChatIntent,
        messageID: String
    ) -> some View {
        Button {
            Task { await chat.correctIntent(messageID: messageID, to: intent) }
        } label: {
            Text(title)
                .font(ReTurnDesign.Typography.cardBody)
                .foregroundStyle(Color.accentColor)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, ReTurnDesign.Card.padding)
                .frame(minHeight: ReTurnDesign.Metrics.composerAccessoryHitSize)
                .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .disabled(
            !api.isConnected || chat.correctingMessageIDs.contains(messageID)
        )
    }

    private func intentCompletion(_ intent: ChatIntent) -> some View {
        HStack(spacing: ReTurnDesign.Spacing.small) {
            Image(systemName: "checkmark")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
                .frame(
                    width: ReTurnDesign.Metrics.composerAccessorySize,
                    height: ReTurnDesign.Spacing.large
                )
                .background(.white, in: Capsule())

            Text("\(intentChoiceTitle(intent)) selected")
                .font(.caption)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
        }
        .padding(.leading, ReTurnDesign.Spacing.extraSmall)
        .accessibilityElement(children: .combine)
    }

    private var latestTargetID: String? {
        chat.isSending ? Self.sendingID : chat.entries.last?.id
    }

    private func correctedIntent(for messageID: String) -> ChatIntent? {
        guard let intent = chat.entries.first(where: { $0.id == messageID })?.intent,
              intent != .unknown else {
            return nil
        }
        return intent
    }

    private func intentChoiceTitle(_ intent: ChatIntent) -> String {
        switch intent {
        case .idea:
            "Idea"
        case .retrieval:
            "Find"
        case .question:
            "Ask"
        case .unknown:
            "Intent"
        }
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

    private var incomingBubbleShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: ReTurnDesign.Card.cornerRadius,
            bottomLeadingRadius: ReTurnDesign.Spacing.extraSmall,
            bottomTrailingRadius: ReTurnDesign.Card.cornerRadius,
            topTrailingRadius: ReTurnDesign.Card.cornerRadius,
            style: .continuous
        )
    }

    private var outgoingBubbleShape: UnevenRoundedRectangle {
        UnevenRoundedRectangle(
            topLeadingRadius: ReTurnDesign.Card.cornerRadius,
            bottomLeadingRadius: ReTurnDesign.Card.cornerRadius,
            bottomTrailingRadius: ReTurnDesign.Spacing.extraSmall,
            topTrailingRadius: ReTurnDesign.Card.cornerRadius,
            style: .continuous
        )
    }
}

private struct ThinkingDots: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        if reduceMotion {
            dots(activeIndex: nil)
        } else {
            PhaseAnimator([0, 1, 2]) { phase in
                dots(activeIndex: phase)
            } animation: { _ in
                .easeInOut(duration: 0.35)
            }
        }
    }

    private func dots(activeIndex: Int?) -> some View {
        HStack(spacing: ReTurnDesign.Spacing.extraSmall) {
            ForEach(0..<3) { index in
                Circle()
                    .fill(ReTurnDesign.Colors.secondaryLabel)
                    .frame(
                        width: ReTurnDesign.Spacing.small,
                        height: ReTurnDesign.Spacing.small
                    )
                    .opacity(
                        activeIndex == nil
                            ? 0.55
                            : activeIndex == index ? 1 : 0.3
                    )
                    .scaleEffect(activeIndex == index ? 1 : 0.8)
            }
        }
    }
}
#endif
