import SwiftUI

struct AppRootView: View {
    var body: some View {
        #if os(iOS)
        IOSRootView()
        #elseif os(macOS)
        MacRootView()
        #endif
    }
}

#Preview {
    AppRootView()
}

#if os(iOS)
#Preview("Before") {
    HomeTimelineView(initialPage: .before)
}
#endif
