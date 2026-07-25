import SwiftUI

struct TimelinePageContent: View {
    let page: TimelinePage

    var body: some View {
        switch page {
        case .before:
            #if os(iOS)
            // The API-backed timeline store is not wired yet; keep the reviewed
            // fixture visible so the merged Before experience remains testable.
            BeforeView(days: TimelinePreviewData.days)
            #else
            Color.clear
            #endif
        case .after:
            Color.clear
        case .now:
            NowPage()
        }
    }
}
