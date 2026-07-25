import SwiftUI

struct ConnectionStatusView: View {
    @Environment(APIEnvironment.self) private var api: APIEnvironment

    var body: some View {
        switch api.connectionState {
        case .connected:
            EmptyView()
        case .unknown, .checking:
            Label("Connecting to your space…", systemImage: "network")
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.vertical, ReTurnDesign.Spacing.extraSmall)
                .background(.thinMaterial)
        case .disconnected(let message):
            HStack(spacing: ReTurnDesign.Spacing.small) {
                Label("Not connected to your space", systemImage: "wifi.exclamationmark")
                Text(message)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                Spacer(minLength: 0)
                Button("Retry") {
                    Task { _ = await api.checkConnection() }
                }
            }
            .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
            .padding(.vertical, ReTurnDesign.Spacing.extraSmall)
            .background(.thinMaterial)
        }
    }
}
