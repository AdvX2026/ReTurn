#if os(iOS)
import Foundation

/// Presentation variants Kongkong can dress for. The shared `Profession`
/// describes saved-day roles; map it here when Now gains a live profession
/// source instead of coupling the renderer directly to transport models.
enum MascotProfession: String, CaseIterable {
    case coder
    case writer
    case designer
    case researcher
    case manager

    var displayName: String {
        rawValue.capitalized
    }
}
#endif
