#if os(macOS)
import SwiftUI

/// A compact month calendar for picking a timeline day, in the spirit of
/// Calendar.app's mini month: days with recorded events carry a dot, today
/// is ringed, the selection is filled. Weekday order follows the system
/// calendar's `firstWeekday`; tapping a day outside the displayed month
/// moves the month with it.
struct MacCalendarView: View {
    @Binding var selection: Date
    /// Days that have timeline content, at day granularity.
    let markedDates: Set<Date>

    @State private var displayedMonth: Date

    init(selection: Binding<Date>, markedDates: Set<Date>) {
        _selection = selection
        self.markedDates = markedDates
        _displayedMonth = State(initialValue: Self.calendar.startOfMonth(for: selection.wrappedValue))
    }

    private static let calendar: Calendar = .autoupdatingCurrent
    private var calendar: Calendar { Self.calendar }

    private let columns = Array(
        repeating: GridItem(.flexible(), spacing: 0),
        count: 7
    )

    var body: some View {
        VStack(spacing: ReTurnDesign.Spacing.small) {
            HStack {
                Text(displayedMonth, format: .dateTime.year().month(.wide))
                    .font(.headline)
                    .foregroundStyle(.primary)

                Spacer(minLength: 0)

                Button {
                    shiftMonth(by: -1)
                } label: {
                    Image(systemName: "chevron.left")
                }
                .accessibilityLabel("Previous month")

                Button {
                    shiftMonth(by: 1)
                } label: {
                    Image(systemName: "chevron.right")
                }
                .accessibilityLabel("Next month")
            }
            .buttonStyle(.borderless)
            .font(.callout.weight(.semibold))
            .foregroundStyle(.secondary)

            LazyVGrid(columns: columns, spacing: 0) {
                ForEach(Array(weekdaySymbols.enumerated()), id: \.offset) { _, symbol in
                    Text(symbol)
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .frame(height: ReTurnDesign.Desktop.Before.calendarCellHeight / 2)
                }

                ForEach(monthDays, id: \.self) { date in
                    dayCell(date)
                }
            }
        }
        .onChange(of: selection) { _, newValue in
            let month = calendar.startOfMonth(for: newValue)
            if month != displayedMonth {
                displayedMonth = month
            }
        }
    }

    private func dayCell(_ date: Date) -> some View {
        let inMonth = calendar.isDate(date, equalTo: displayedMonth, toGranularity: .month)
        let isSelected = calendar.isDate(date, inSameDayAs: selection)
        let isToday = calendar.isDateInToday(date)
        let isMarked = markedDates.contains(calendar.startOfDay(for: date))

        return Button {
            selection = calendar.startOfDay(for: date)
        } label: {
            VStack(spacing: 1) {
                Text("\(calendar.component(.day, from: date))")
                    .font(.callout)
                    .foregroundStyle(
                        isSelected
                            ? Color.white
                            : inMonth ? Color.primary : Color.secondary.opacity(0.5)
                    )
                    .frame(width: 28, height: 28)
                    .background {
                        if isSelected {
                            Circle().fill(Color.accentColor)
                        } else if isToday {
                            Circle().stroke(Color.accentColor, lineWidth: 1)
                        }
                    }

                Circle()
                    .fill(isMarked && !isSelected ? Color.secondary : Color.clear)
                    .frame(
                        width: ReTurnDesign.Desktop.Before.calendarDotSize,
                        height: ReTurnDesign.Desktop.Before.calendarDotSize
                    )
            }
            .frame(maxWidth: .infinity)
            .frame(height: ReTurnDesign.Desktop.Before.calendarCellHeight)
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(
            Text(date, format: .dateTime.month(.wide).day())
        )
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    /// `veryShortWeekdaySymbols` starts on Sunday; rotate so the grid's first
    /// column matches the system calendar's first weekday.
    private var weekdaySymbols: [String] {
        let symbols = calendar.veryShortWeekdaySymbols
        let first = calendar.firstWeekday - 1
        return Array(symbols[first...] + symbols[..<first])
    }

    /// Six rows starting from the week containing the 1st, so the grid never
    /// reflows between months.
    private var monthDays: [Date] {
        guard
            let month = calendar.dateInterval(of: .month, for: displayedMonth),
            let firstWeek = calendar.dateInterval(of: .weekOfYear, for: month.start)
        else { return [] }

        return (0..<42).compactMap {
            calendar.date(byAdding: .day, value: $0, to: firstWeek.start)
        }
    }

    private func shiftMonth(by value: Int) {
        guard let shifted = calendar.date(byAdding: .month, value: value, to: displayedMonth) else {
            return
        }
        displayedMonth = calendar.startOfMonth(for: shifted)
    }
}

private extension Calendar {
    func startOfMonth(for date: Date) -> Date {
        dateInterval(of: .month, for: date)?.start ?? startOfDay(for: date)
    }
}

#Preview {
    MacCalendarView(
        selection: .constant(TimelinePreviewData.days.first?.date ?? .now),
        markedDates: Set(TimelinePreviewData.days.map(\.date))
    )
    .padding()
    .frame(width: ReTurnDesign.Desktop.Before.sidebarWidth)
}
#endif
