#if os(macOS)
import SwiftUI

/// macOS Settings (⌘,): the Pi address with a live connection check, plus the
/// device ID for debugging. Writes the same persisted value as the inline
/// recovery editor shown by failed pages.
struct APISettingsView: View {
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    @State private var isChecking = false
    @State private var checkSucceeded: Bool?

    var body: some View {
        @Bindable var api = api

        Form {
            Section("Server") {
                TextField("Address:", text: $api.baseURLString)
                    .textFieldStyle(.roundedBorder)

                HStack(spacing: ReTurnDesign.Spacing.small) {
                    Button(isChecking ? "Checking…" : "Test Connection") {
                        isChecking = true
                        checkSucceeded = nil
                        Task {
                            let ok = await api.checkConnection()
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
            }
        }
        .formStyle(.grouped)
        .frame(width: 440)
        .fixedSize(horizontal: false, vertical: true)
    }
}

#Preview {
    APISettingsView()
        .environment(APIEnvironment())
}
#endif
