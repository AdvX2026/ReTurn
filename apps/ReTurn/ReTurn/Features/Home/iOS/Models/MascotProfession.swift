#if os(iOS)
import Foundation

/// The client-provisional professions Kongkong can dress for.
///
/// The API contract does not expose a profession yet. Keep this presentation
/// model at the view boundary until the shared contract defines one.
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
