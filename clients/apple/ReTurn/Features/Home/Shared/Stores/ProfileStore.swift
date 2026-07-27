import Foundation

/// Singleton user profile from GET/PATCH /api/profile.
@Observable
@MainActor
final class ProfileStore {
    private(set) var profile: UserProfile?
    private(set) var isLoading = false
    private(set) var lastError: String?

    private let api: APIEnvironment

    init(api: APIEnvironment) {
        self.api = api
    }

    func refresh() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            profile = try await api.makeClient().getProfile()
            lastError = nil
            api.markReachable()
        } catch {
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }

    func update(_ request: PatchUserProfileRequest) async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }

        do {
            profile = try await api.makeClient().patchProfile(request)
            lastError = nil
            api.markReachable()
        } catch {
            lastError = apiErrorMessage(error)
            api.markUnreachable(error)
        }
    }
}
