import SwiftUI

/// Kongkong, at whatever size the caller sets.
///
/// This static asset is for the cards. The Now page uses `MascotView` instead
/// — an animated, layered reproduction of the same Figma geometry that can
/// blink, bounce and wear stats and profession accessories.
///
/// Sizing is deliberately left to the caller because the two contexts need
/// different strategies: cards scale a fixed width with Dynamic Type, while the
/// Now page derives its width from the scroll viewport. The asset is a preserved
/// vector and re-rasterizes on every new size, so neither should tie its width
/// to a container that the keyboard or an animation can change.
struct MascotImage: View {
    var body: some View {
        Image(.kongkong)
            .resizable()
            .aspectRatio(
                ReTurnDesign.Metrics.mascotAspectRatio,
                contentMode: .fit
            )
            .accessibilityHidden(true)
    }
}
