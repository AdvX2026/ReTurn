#if os(macOS)
import SwiftUI

/// macOS Before: a two-pane browser. The left column indexes every recorded
/// day; the right column runs the shared single-day timeline. Same data as
/// the iOS single-scroll `BeforeView`, rearranged for a wide window — picking
/// a day no longer means scrolling to it.
struct MacBeforeView: View {
    let days: [TimelineDay]
    @State private var selectedDate: Date?

    init(days: [TimelineDay]) {
        self.days = days
        _selectedDate = State(initialValue: days.first?.date)
    }

    private var selectedDay: TimelineDay? {
        days.first { $0.date == selectedDate } ?? days.first
    }

    var body: some View {
        if days.isEmpty {
            ContentUnavailableView(
                "No timeline yet",
                systemImage: "clock.arrow.circlepath",
                description: Text("Your activity will appear here after ReTurn starts collecting.")
            )
        } else {
            HStack(spacing: 0) {
                dayList

                Divider()

                dayDetail
            }
        }
    }

    private var dayList: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Before")
                .font(TimelineDesign.Typography.pageTitle)
                .foregroundStyle(.primary)
                .padding(.horizontal, TimelineDesign.Layout.contentHorizontalPadding)
                .padding(.top, TimelineDesign.Layout.contentTopPadding)
                .padding(.bottom, TimelineDesign.Layout.dayHeaderBottomPadding)

            List(days, selection: $selectedDate) { day in
                DayRow(day: day)
                    .tag(day.date)
            }
            .listStyle(.plain)
            .scrollContentBackground(.hidden)
        }
        .frame(width: ReTurnDesign.Desktop.Before.dayListWidth)
    }

    private var dayDetail: some View {
        ScrollView {
            if let selectedDay {
                TimelineView(day: selectedDay)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .contentMargins(
            .horizontal,
            TimelineDesign.Layout.contentHorizontalPadding,
            for: .scrollContent
        )
        .contentMargins(
            .top,
            TimelineDesign.Layout.contentTopPadding,
            for: .scrollContent
        )
        .contentMargins(
            .bottom,
            TimelineDesign.Layout.contentBottomPadding,
            for: .scrollContent
        )
        .scrollIndicators(.hidden)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(TimelineDesign.Colors.pageBackground)
        // Reset the scroll position when another day is picked.
        .id(selectedDay?.date)
    }
}

/// One day in the index column: the same metadata the timeline's day header
/// carries (weekday, date, event count) plus a marker when a Daily Briefing
/// exists for the day.
private struct DayRow: View {
    let day: TimelineDay

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Text(day.date, format: .dateTime.weekday(.wide))
                    .font(TimelineDesign.Typography.dayMetadata)
                    .foregroundStyle(.secondary)
                    .textCase(.uppercase)

                Spacer(minLength: 8)

                if day.dailyBriefing != nil {
                    Image(systemName: "sparkles")
                        .font(TimelineDesign.Typography.dayMetadata)
                        .foregroundStyle(.secondary)
                        .accessibilityLabel("Has Daily Briefing")
                }
            }

            Text(day.date, format: .dateTime.month(.abbreviated).day())
                .font(TimelineDesign.Typography.dayListDate)
                .foregroundStyle(.primary)

            Text(
                "\(day.representedEventCount) "
                    + "\(day.representedEventCount == 1 ? "Event" : "Events")"
            )
            .font(TimelineDesign.Typography.eventCount)
            .foregroundStyle(.tertiary)
        }
        .padding(.vertical, 4)
    }
}

#Preview("Before · Light") {
    MacBeforeView(days: TimelinePreviewData.days)
}

#Preview("Before · Dark") {
    MacBeforeView(days: TimelinePreviewData.days)
        .preferredColorScheme(.dark)
}
#endif
