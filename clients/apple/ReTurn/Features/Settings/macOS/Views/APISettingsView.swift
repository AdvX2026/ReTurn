#if os(macOS)
import SwiftUI

/// macOS Settings (⌘,): Pi address, optional tokens, connection check, usage
/// and collection status. Same base URL as the inline recovery editor.
struct APISettingsView: View {
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    @Environment(StatsStore.self) private var stats: StatsStore
    @Environment(UsageStore.self) private var usage: UsageStore
    @Environment(NodesStore.self) private var nodes: NodesStore
    @Environment(HealthStore.self) private var health: HealthStore
    @State private var isChecking = false
    @State private var checkSucceeded: Bool?

    var body: some View {
        @Bindable var api = api

        Form {
            Section("Server") {
                TextField("Address:", text: $api.baseURLString)
                    .textFieldStyle(.roundedBorder)

                SecureField("API token (optional):", text: $api.apiToken)
                    .textFieldStyle(.roundedBorder)

                SecureField("Health token:", text: $api.healthToken)
                    .textFieldStyle(.roundedBorder)

                HStack(spacing: ReTurnDesign.Spacing.small) {
                    Button(isChecking ? "Checking…" : "Test Connection") {
                        isChecking = true
                        checkSucceeded = nil
                        Task {
                            let ok = await api.checkConnection()
                            if ok {
                                await stats.refresh()
                                await usage.refresh()
                                await nodes.flushOutbox()
                            }
                            checkSucceeded = ok
                            isChecking = false
                        }
                    }
                    .disabled(isChecking || api.baseURLString.isEmpty)

                    if let checkSucceeded {
                        if checkSucceeded {
                            Label(
                                "Connected · \(api.lastPing?.version ?? "ok")",
                                systemImage: "checkmark.circle.fill"
                            )
                            .foregroundStyle(.green)
                        } else {
                            Label("Unreachable", systemImage: "xmark.circle.fill")
                                .foregroundStyle(.red)
                        }
                    }
                }
            }

            Section("This Device") {
                LabeledContent("Device ID", value: api.deviceID)
                    .textSelection(.enabled)
                if !nodes.pending.isEmpty {
                    LabeledContent("Outbox", value: "\(nodes.pending.count) pending")
                    Button("Flush outbox") {
                        Task { await nodes.flushOutbox() }
                    }
                }
            }

            Section("Collection") {
                if let collection = stats.collection {
                    LabeledContent("Devices", value: "\(collection.deviceCount)")
                    LabeledContent("Samples today", value: "\(collection.sampleCount)")
                    if let last = collection.lastSeenAt {
                        LabeledContent("Last seen", value: last)
                    }
                } else {
                    Text("Connect to load collection status.")
                        .foregroundStyle(.secondary)
                }
                if let cadence = stats.cadence {
                    LabeledContent("Cadence", value: cadence.rawValue)
                }
            }

            Section("Provider usage (30d)") {
                if usage.isLoading {
                    ProgressView().controlSize(.small)
                } else if let totals = usage.usage?.totals {
                    LabeledContent("Calls", value: "\(totals.calls) · ok \(totals.succeeded) · fail \(totals.failed)")
                    LabeledContent("Tokens", value: "\(totals.totalTokens)")
                } else if let error = usage.lastError {
                    Text(error).foregroundStyle(.red)
                } else {
                    Text("Test connection to load usage.")
                        .foregroundStyle(.secondary)
                }
                Button("Refresh usage") {
                    Task { await usage.refresh() }
                }
                .disabled(!api.isConnected || usage.isLoading)
            }

            Section("Nodes") {
                Button("List today's nodes") {
                    Task { await nodes.list(date: APIEnvironment.dayKey(for: .now)) }
                }
                .disabled(!api.isConnected)
                if let date = nodes.listedDate {
                    LabeledContent(date, value: "\(nodes.nodes.count) nodes")
                }
                if let first = nodes.nodes.first {
                    Button("Delete first node (debug)") {
                        Task { _ = await nodes.delete(id: first.id) }
                    }
                    .foregroundStyle(.red)
                }
                if let error = nodes.lastError {
                    Text(error).foregroundStyle(.red)
                }
            }

            if let healthError = health.lastError {
                Section("Health") {
                    Text(healthError).foregroundStyle(.secondary)
                }
            }
        }
        .formStyle(.grouped)
        .frame(width: 480)
        .fixedSize(horizontal: false, vertical: true)
    }
}

#Preview {
    APISettingsView()
        .previewStores()
}
#endif
