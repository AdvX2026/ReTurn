import SwiftUI

/// Shared connectivity recovery, shown by any page whose store failed to
/// reach the Pi. The base-URL editor lives inline here — it is the only
/// setting most users ever need, and it belongs next to the failure it fixes.
struct ConnectionIssueView: View {
    let message: String
    let retry: () -> Void

    @Environment(APIEnvironment.self) private var api: APIEnvironment

    var body: some View {
        @Bindable var api = api

        ContentUnavailableView {
            Label("Can't reach the Pi", systemImage: "wifi.exclamationmark")
        } description: {
            Text(message)
        } actions: {
            HStack(spacing: ReTurnDesign.Spacing.small) {
                TextField("Server address", text: $api.baseURLString)
                    .textFieldStyle(.roundedBorder)
                    .frame(maxWidth: 240)
                    #if os(iOS)
                    .keyboardType(.URL)
                    .textInputAutocapitalization(.never)
                    #endif
                    .autocorrectionDisabled()
                Button("Retry", action: retry)
                    .buttonStyle(.borderedProminent)
            }
        }
    }
}

#Preview {
    ConnectionIssueView(message: "Can't reach the server", retry: {})
        .environment(APIEnvironment())
}
