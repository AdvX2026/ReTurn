import SwiftUI

struct NowPage: View {
    let isActive: Bool

    @Environment(ChatStore.self) private var chat: ChatStore
    @Environment(StatsStore.self) private var stats: StatsStore

    #if os(iOS)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var demoIndex = 0
    #endif

    var body: some View {
        #if os(iOS)
        let demo = NowPreviewData.demoLineup[demoIndex]

        Group {
            if chat.entries.isEmpty {
                heroBody(demo: demo)
            } else {
                conversationBody(demo: demo)
            }
        }
        .task(id: allowsContinuousMotion) {
            guard allowsContinuousMotion else {
                return
            }

            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled, allowsContinuousMotion else {
                    return
                }
                demoIndex = (demoIndex + 1) % NowPreviewData.demoLineup.count
            }
        }
        #else
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            MascotImage()
                .containerRelativeFrame(.horizontal) { width, _ in
                    ReTurnDesign.Layout.mascotWidth(in: width)
                }

            Text(nowGreeting(for: stats.characterState))
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
        #endif
    }

    #if os(iOS)
    private func heroBody(demo: NowPreviewData.MascotDemo) -> some View {
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            MascotView(
                stats: stats.stats ?? demo.stats,
                profession: demo.profession,
                allowsContinuousMotion: allowsContinuousMotion
            )
            .containerRelativeFrame(.horizontal) { width, _ in
                MascotView.frameWidth(
                    forMascotWidth: ReTurnDesign.Layout.mascotWidth(in: width)
                )
            }

            Text(nowGreeting(for: stats.characterState))
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)

            Text("\(demo.profession.displayName) · \(demo.highlightedStat)")
                .font(ReTurnDesign.Typography.cardTag)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)

            SaveTodayButton()
            NowActionBar()
            SaveResultLine()
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
    }

    private func conversationBody(demo: NowPreviewData.MascotDemo) -> some View {
        VStack(spacing: 0) {
            HStack(spacing: ReTurnDesign.Spacing.medium) {
                MascotView(
                    stats: stats.stats ?? demo.stats,
                    profession: demo.profession,
                    allowsContinuousMotion: allowsContinuousMotion
                )
                .frame(width: 40, height: 36)
                .accessibilityHidden(true)

                Text(nowGreeting(for: stats.characterState))
                    .font(ReTurnDesign.Typography.navigationItem)
                    .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
                    .lineLimit(1)

                Spacer(minLength: 0)

                SaveTodayButton()
            }
            .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
            .padding(.vertical, ReTurnDesign.Spacing.small)

            NowActionBar()
                .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
                .padding(.bottom, ReTurnDesign.Spacing.extraSmall)

            if case .failed(let message) = chat.historyState {
                HStack(spacing: ReTurnDesign.Spacing.small) {
                    Text(message)
                        .font(.caption)
                        .foregroundStyle(.red)
                    Spacer(minLength: 0)
                    Button("Retry") {
                        Task { await chat.loadHistory(force: true) }
                    }
                    .font(.caption)
                }
                .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
                .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
            }

            NowConversationView(entries: chat.entries)

            SaveResultLine()
                .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
        }
    }

    private var allowsContinuousMotion: Bool {
        isActive && scenePhase == .active && !reduceMotion
    }
    #endif
}
