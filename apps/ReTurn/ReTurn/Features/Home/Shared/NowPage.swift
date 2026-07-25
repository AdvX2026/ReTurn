import SwiftUI

struct NowPage: View {
    var body: some View {
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            // Sized from the scroll viewport, which only changes on rotation --
            // the mascot is a preserved vector and re-rasterizes on every new
            // width, so it must not track the composer or keyboard animation.
            MascotImage()
                .containerRelativeFrame(.horizontal) { width, _ in
                    ReTurnDesign.Layout.mascotWidth(in: width)
                }

            Text("Teethe is back!")
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
    }
}
