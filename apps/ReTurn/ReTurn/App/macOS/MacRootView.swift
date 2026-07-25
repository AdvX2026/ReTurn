#if os(macOS)
import SwiftUI

/// Keeps the current placeholder experience behind a dedicated macOS entry
/// until the separate desktop product layout lands.
struct MacRootView: View {
    var body: some View {
        HomeTimelineView()
    }
}
#endif
