import SwiftUI

struct ConnectionStatusView: View {
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    #if os(iOS)
    @State private var isShowingRecovery = false
    #endif

    var body: some View {
        Group {
            switch api.connectionState {
            case .connected:
                EmptyView()
            case .unknown, .checking:
                HStack(spacing: ReTurnDesign.Spacing.small) {
                    Label("Connecting to your space…", systemImage: "network")
                    #if os(iOS)
                    Spacer(minLength: 0)
                    Button("Server") {
                        isShowingRecovery = true
                    }
                    #endif
                }
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
                .padding(.vertical, ReTurnDesign.Spacing.extraSmall)
                .background(.thinMaterial)
            case .disconnected(let message):
                HStack(spacing: ReTurnDesign.Spacing.small) {
                    #if os(iOS)
                    Label("Server unavailable", systemImage: "wifi.exclamationmark")
                    Spacer(minLength: 0)
                    Button("Server") {
                        isShowingRecovery = true
                    }
                    Button("Retry", systemImage: "arrow.clockwise") {
                        Task { _ = await api.checkConnection() }
                    }
                    .labelStyle(.iconOnly)
                    #else
                    Label("Not connected to your space", systemImage: "wifi.exclamationmark")
                    Text(message)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                    Spacer(minLength: 0)
                    Button("Retry") {
                        Task { _ = await api.checkConnection() }
                    }
                    #endif
                }
                .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
                .padding(.vertical, ReTurnDesign.Spacing.extraSmall)
                .background(.thinMaterial)
            }
        }
        #if os(iOS)
            .sheet(isPresented: $isShowingRecovery) {
                ConnectionIssueView(message: recoveryMessage) {
                    Task {
                        if await api.checkConnection() {
                            isShowingRecovery = false
                        }
                    }
                }
                .presentationDetents([.medium])
            }
        #endif
    }

    #if os(iOS)
    private var recoveryMessage: String {
        if case .disconnected(let message) = api.connectionState {
            return message
        }
        return "Enter the Pi address or retry the connection"
    }
    #endif
}
