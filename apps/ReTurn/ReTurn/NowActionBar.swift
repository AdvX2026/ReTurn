import SwiftUI

struct NowActionBar: View {
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    @Environment(ChatStore.self) private var chat: ChatStore
    @Environment(TasksStore.self) private var tasks: TasksStore

    var body: some View {
        HStack(spacing: ReTurnDesign.Spacing.small) {
            Button("Resume", systemImage: "arrow.uturn.forward.circle") {
                Task { await chat.resume() }
            }
            .disabled(!api.isConnected || chat.isResuming)

            if chat.isResuming {
                ProgressView()
                    .controlSize(.small)
            }

            if !tasks.tasks.isEmpty {
                Menu {
                    ForEach(tasks.tasks.prefix(10)) { task in
                        Label(taskLabel(task), systemImage: taskSymbol(task.status))
                    }
                } label: {
                    Label(
                        tasks.activeTasks.isEmpty
                            ? "Tasks"
                            : "\(tasks.activeTasks.count) active",
                        systemImage: "checklist"
                    )
                }
            }
        }
        .buttonStyle(.bordered)
    }

    private func taskLabel(_ task: TaskRecord) -> String {
        let type = switch task.type {
        case .meetingNotes: "Meeting notes"
        case .imageExtract: "Image extraction"
        case .generic: "Task"
        }
        return "\(type) · \(task.status.rawValue.capitalized)"
    }

    private func taskSymbol(_ status: TaskStatus) -> String {
        switch status {
        case .queued: "clock"
        case .running: "progress.indicator"
        case .done: "checkmark.circle"
        case .failed: "exclamationmark.triangle"
        case .unknown: "questionmark.circle"
        }
    }
}
