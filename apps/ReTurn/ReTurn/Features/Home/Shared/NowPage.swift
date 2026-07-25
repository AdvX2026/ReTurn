import Foundation
import SwiftUI

struct NowPage: View {
    let isActive: Bool

    @Environment(StatsStore.self) private var stats: StatsStore

    #if os(iOS)
    @Environment(ProfileStore.self) private var profile: ProfileStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    #endif

    var body: some View {
        #if os(iOS)
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            MascotView(
                stats: stats.stats ?? .empty,
                profession: MascotProfession(stats.profession),
                allowsContinuousMotion: allowsContinuousMotion
            )
            .containerRelativeFrame(.horizontal) { width, _ in
                MascotView.frameWidth(
                    forMascotWidth: ReTurnDesign.Layout.mascotWidth(in: width)
                )
            }

            Text(profileGreeting)
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)

            Text("\(stats.profession.displayName) · \(stats.characterState.rawValue)")
                .font(ReTurnDesign.Typography.cardTag)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
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
    private var profileGreeting: String {
        let name = profile.profile?.displayName?.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let name, !name.isEmpty else {
            return "You're back!"
        }
        return "\(name) is back!"
    }

    private var allowsContinuousMotion: Bool {
        isActive && scenePhase == .active && !reduceMotion
    }
    #endif
}
