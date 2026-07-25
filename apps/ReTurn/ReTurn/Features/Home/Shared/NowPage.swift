import SwiftUI

struct NowPage: View {
    let isActive: Bool

    #if os(macOS)
    @Environment(StatsStore.self) private var stats: StatsStore
    #endif

    #if os(iOS)
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @State private var demoIndex = 0
    #endif

    var body: some View {
        #if os(iOS)
        let demo = NowPreviewData.demoLineup[demoIndex]

        VStack(spacing: ReTurnDesign.Spacing.medium) {
            MascotView(
                stats: demo.stats,
                profession: demo.profession,
                allowsContinuousMotion: allowsContinuousMotion
            )
            .containerRelativeFrame(.horizontal) { width, _ in
                MascotView.frameWidth(
                    forMascotWidth: ReTurnDesign.Layout.mascotWidth(in: width)
                )
            }

            Text("Teethe is back!")
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)

            Text("\(demo.profession.displayName) · \(demo.highlightedStat)")
                .font(ReTurnDesign.Typography.cardTag)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
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
    private var allowsContinuousMotion: Bool {
        isActive && scenePhase == .active && !reduceMotion
    }
    #endif
}
