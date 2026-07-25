#if os(macOS)
import SwiftUI

/// macOS Before: a three-part browser for recorded history. The left column
/// carries a month calendar (event dots) and the day's Daily Briefing; the
/// right column projects the selected day onto a horizontal 24-hour timeline
/// above its full event list. Calendar, track and list stay in sync through
/// one selection each (`selectedDate`, `selectedItemID`).
struct MacBeforeView: View {
    let days: [TimelineDay]

    @State private var selectedDate: Date?
    @State private var selectedItemID: String?

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
                sideColumn

                Divider()

                dayColumn
            }
            // Picking another day clears the event selection with it.
            .onChange(of: selectedDate) { _, _ in
                selectedItemID = nil
            }
        }
    }

    // ── left: calendar + briefing ────────────────────────

    private var sideColumn: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.large) {
            MacCalendarView(
                selection: Binding(
                    get: { selectedDate ?? .now },
                    set: { selectedDate = $0 }
                ),
                markedDates: Set(days.map(\.date))
            )

            if let briefing = selectedDay?.dailyBriefing {
                briefingCard(briefing)
            }

            Spacer(minLength: 0)
        }
        .padding(ReTurnDesign.Metrics.screenHorizontalInset)
        .frame(width: ReTurnDesign.Desktop.Before.sidebarWidth)
    }

    private func briefingCard(_ briefing: TimelineDailyBriefing) -> some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.extraSmall) {
            Label(
                "Daily Briefing · \(briefing.stateLabel)",
                systemImage: "sparkles"
            )
            .font(TimelineDesign.Typography.eventCategory)
            .foregroundStyle(.secondary)

            Text(briefing.summary)
                .font(TimelineDesign.Typography.eventMetadata)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(ReTurnDesign.Spacing.medium)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            Color.primary.opacity(0.04),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Daily Briefing")
        .accessibilityValue(briefing.accessibilityValue)
    }

    // ── right: day header + horizontal timeline + events ─

    private var dayColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let day = selectedDay {
                dayHeader(day)

                MacDayTimelineView(day: day, selectedItemID: $selectedItemID)
                    .padding(.vertical, ReTurnDesign.Spacing.medium)

                Divider()

                eventList(day)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(TimelineDesign.Colors.pageBackground)
    }

    private func dayHeader(_ day: TimelineDay) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(day.date, format: .dateTime.weekday(.wide))
                .font(TimelineDesign.Typography.dayMetadata)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)

            HStack(alignment: .firstTextBaseline) {
                Text(day.date, format: .dateTime.month(.abbreviated).day())
                    .font(TimelineDesign.Typography.day)
                    .foregroundStyle(.primary)

                Spacer()

                Text(
                    "\(day.representedEventCount) "
                        + "\(day.representedEventCount == 1 ? "Event" : "Events")"
                )
                .font(TimelineDesign.Typography.eventCount)
                .foregroundStyle(.tertiary)
            }
        }
        .padding(.horizontal, ReTurnDesign.Spacing.large)
        .padding(.top, TimelineDesign.Layout.contentTopPadding)
    }

    private func eventList(_ day: TimelineDay) -> some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: ReTurnDesign.Spacing.extraSmall) {
                ForEach(day.items) { item in
                    eventRow(item)
                }
            }
            .padding(.horizontal, ReTurnDesign.Spacing.large)
            .padding(.vertical, ReTurnDesign.Spacing.small)
        }
        .scrollIndicators(.hidden)
    }

    /// The mobile timeline's three event presentations, minus the rail: the
    /// horizontal track above already plays the rail's orienting role.
    @ViewBuilder
    private func eventRow(_ item: TimelineDisplayItem) -> some View {
        let isSelected = selectedItemID == item.id

        Button {
            selectedItemID = item.id
        } label: {
            Group {
                switch item.presentation {
                case .ambient:
                    TimelineAmbientEventView(item: item)
                case .major:
                    TimelineEventCard(item: item)
                case .point, .span:
                    TimelineEventDetailsView(item: item)
                }
            }
            .padding(ReTurnDesign.Spacing.small)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                Color.primary.opacity(isSelected ? 0.05 : 0),
                in: RoundedRectangle(cornerRadius: 10, style: .continuous)
            )
            .contentShape(.rect)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(item.label)
        .accessibilityValue(item.accessibilityValue)
        .accessibilityAddTraits(isSelected ? .isSelected : [])
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
