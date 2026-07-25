import SwiftUI

struct TimelinePageContent: View {
    let page: TimelinePage
    let isBeforeChromeVisible: Bool
    let onBeforeChromeVisibilityChange: (Bool) -> Void
    let onBeforeScrollActivityChange: (Bool) -> Void

    var body: some View {
        switch page {
        case .before:
            #if os(iOS)
            // The API-backed timeline store is not wired yet; keep the reviewed
            // fixture visible so the merged Before experience remains testable.
            BeforeView(
                days: TimelinePreviewData.days,
                isChromeVisible: isBeforeChromeVisible,
                onChromeVisibilityChange: onBeforeChromeVisibilityChange,
                onScrollActivityChange: onBeforeScrollActivityChange
            )
            #else
            Color.clear
            #endif
        case .after:
            #if os(iOS)
            // The card API store is not wired yet. Nil callbacks keep all
            // fixture actions visibly disabled instead of implying success.
            AfterView(
                todoSuggestion: AfterPreviewData.todoSuggestion,
                health: AfterPreviewData.health,
                ideas: AfterPreviewData.ideas
            )
            #else
            Color.clear
            #endif
        case .now:
            NowPage()
        }
    }
}
