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
