import EventKit
import Foundation

@MainActor
final class ReminderService {
    enum ReminderError: LocalizedError {
        case accessDenied
        case noCalendar

        var errorDescription: String? {
            switch self {
            case .accessDenied: "Reminders access was not granted"
            case .noCalendar: "No writable Reminders list is available"
            }
        }
    }

    private let store = EKEventStore()

    func createReminder(title: String) async throws -> String {
        guard try await requestAccess() else { throw ReminderError.accessDenied }
        guard let calendar = store.defaultCalendarForNewReminders() else {
            throw ReminderError.noCalendar
        }
        let reminder = EKReminder(eventStore: store)
        reminder.title = title
        reminder.calendar = calendar
        try store.save(reminder, commit: true)
        return reminder.calendarItemIdentifier
    }

    private func requestAccess() async throws -> Bool {
        if #available(macOS 14.0, iOS 17.0, *) {
            return try await store.requestFullAccessToReminders()
        }
        return false
    }
}
