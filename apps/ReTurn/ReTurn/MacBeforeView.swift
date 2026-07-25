#if os(macOS)
import SwiftUI

/// macOS Before: a three-part browser for recorded history, fed by
/// `TimelineStore` (/api/timeline + /api/days). The left column carries a
/// month calendar (event dots) and the saved day's Daily Briefing; the right
/// column projects the selected day onto a horizontal 24-hour timeline above
/// its full event list. Calendar, track and list stay in sync through one
/// selection each (`selectedDate`, `selectedItemID`); a chat retrieval jump
/// arrives as the store's `focusRequest` and drives both.
struct MacBeforeView: View {
    @Environment(TimelineStore.self) private var timeline: TimelineStore

    @State private var selectedDate: Date = .now
    @State private var selectedItemID: String?
    @State private var presentedBriefing: CardRecord?
    /// Committed zoom level; opens at `timelineDefaultZoom` so the track is
    /// always scrollable — swiping over it browses time, never the pager.
    @State private var zoom: CGFloat = ReTurnDesign.Desktop.Before.timelineDefaultZoom
    /// Live pinch multiplier while the gesture is in flight.
    @GestureState private var magnifyDelta: CGFloat = 1
    /// Viewport width one day-width (viewport × zoom) is derived from.
    @State private var timelineViewportWidth: CGFloat = 600
    /// Scroll anchor for the continuous track (start-of-day of the focused day).
    @State private var timelineScrollDay: Date?
    @State private var expandedGroupIDs: Set<String> = []

    private var selectedDay: TimelineDay? {
        timeline.day(for: selectedDate)
    }

    /// Days that have any content, ascending; stepping moves within them.
    private var recordedDates: [Date] {
        timeline.markedDates
    }

    private var liveZoom: CGFloat {
        min(
            max(zoom * magnifyDelta, 1),
            ReTurnDesign.Desktop.Before.timelineMaxZoom
        )
    }

    var body: some View {
        Group {
            if case .failed(let message) = timeline.overviewState, recordedDates.isEmpty {
                ConnectionIssueView(message: message) {
                    Task { await reload() }
                }
            } else {
                HStack(spacing: 0) {
                    sideColumn

                    Divider()

                    dayColumn
                }
            }
        }
        .task { await reload() }
        .onChange(of: selectedDate) { _, newDate in
            Task { await timeline.loadDay(newDate) }
        }
        .onChange(of: timeline.focusRequest) { _, _ in
            Task { await honorFocusRequest() }
        }
        .sheet(item: $presentedBriefing) { card in
            BriefingDetailView(card: card)
        }
    }

    private func reload() async {
        // Overview already pulls a 30-day timeline range into the store;
        // loadDay keeps today/fresh selection current.
        await timeline.refreshOverview()
        await timeline.loadDay(selectedDate)
    }

    private func honorFocusRequest() async {
        guard let request = timeline.consumeFocusRequest(),
              let date = APIEnvironment.date(fromDayKey: request.dayKey) else { return }
        selectedDate = date
        await timeline.loadDay(date)
        selectedItemID = nil
        await Task.yield()
        selectedItemID = request.nodeID
    }

    // ── left: calendar + briefing ────────────────────────

    private var sideColumn: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.large) {
            MacCalendarView(
                selection: Binding(
                    get: { selectedDate },
                    set: {
                        selectedDate = $0
                        selectedItemID = nil
                    }
                ),
                markedDates: Set(recordedDates)
            )

            if let card = timeline.briefingCard(for: selectedDate),
               case .briefing(let content) = card.content {
                TimelineDailyBriefingView(
                    briefing: TimelineDailyBriefing(
                        id: card.id,
                        stateLabel: content.characterState.rawValue.capitalized,
                        summary: content.summary
                    ),
                    action: { presentedBriefing = card }
                )
            }

            if timeline.streak > 0 {
                Label(
                    "\(timeline.streak)-day streak",
                    systemImage: "flame"
                )
                .font(TimelineDesign.Typography.eventCategory)
                .foregroundStyle(.secondary)
            }

            Spacer(minLength: 0)
        }
        .padding(ReTurnDesign.Metrics.screenHorizontalInset)
        .frame(width: ReTurnDesign.Desktop.Before.sidebarWidth)
    }

    // ── right: day header + horizontal timeline + events ─

    private var dayColumn: some View {
        VStack(alignment: .leading, spacing: 0) {
            dayHeader(for: selectedDate)

            dayContent
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .background(TimelineDesign.Colors.pageBackground)
    }

    @ViewBuilder
    private var dayContent: some View {
        if !trackDays.isEmpty {
            timelineViewport
                .padding(.top, ReTurnDesign.Spacing.small)
                .padding(.bottom, ReTurnDesign.Spacing.small)

            Divider()
        }

        if let error = timeline.error(for: selectedDate), selectedDay == nil {
            ContentUnavailableView {
                Label("Couldn't load this day", systemImage: "exclamationmark.triangle")
            } description: {
                Text(error)
            } actions: {
                Button("Retry") {
                    Task { await timeline.loadDay(selectedDate, force: true) }
                }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        } else if let day = selectedDay {
            if day.items.isEmpty {
                ContentUnavailableView(
                    "Nothing recorded",
                    systemImage: "moon.stars",
                    description: Text("No samples reached the Pi for this day yet.")
                )
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                eventList(day)
            }
        } else if trackDays.isEmpty {
            ProgressView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    private func dayHeader(for date: Date) -> some View {
        let eventCount = selectedDay?.representedEventCount ?? 0

        return VStack(alignment: .leading, spacing: 4) {
            Text(date, format: .dateTime.weekday(.wide))
                .font(TimelineDesign.Typography.dayMetadata)
                .foregroundStyle(.secondary)
                .textCase(.uppercase)

            HStack(alignment: .firstTextBaseline) {
                Text(date, format: .dateTime.month(.abbreviated).day())
                    .font(TimelineDesign.Typography.day)
                    .foregroundStyle(.primary)

                Spacer()

                Text("\(eventCount) \(eventCount == 1 ? "Event" : "Events")")
                    .font(TimelineDesign.Typography.eventCount)
                    .foregroundStyle(.tertiary)

                // Step through recorded days; the calendar jumps anywhere.
                HStack(spacing: 2) {
                    Button {
                        stepDay(by: -1)
                    } label: {
                        Image(systemName: "chevron.left")
                    }
                    .disabled(!canStepDay(by: -1))
                    .accessibilityLabel("Previous recorded day")

                    Button {
                        stepDay(by: 1)
                    } label: {
                        Image(systemName: "chevron.right")
                    }
                    .disabled(!canStepDay(by: 1))
                    .accessibilityLabel("Next recorded day")
                }
                .buttonStyle(.borderless)
                .font(.callout.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(.leading, ReTurnDesign.Spacing.small)
            }
        }
        .padding(.horizontal, ReTurnDesign.Spacing.large)
        .padding(.top, TimelineDesign.Layout.contentTopPadding)
    }

    private func canStepDay(by delta: Int) -> Bool {
        guard
            let current = selectedDay?.date,
            let index = recordedDates.firstIndex(of: current)
        else { return false }
        return recordedDates.indices.contains(index + delta)
    }

    private func stepDay(by delta: Int) {
        guard
            let current = selectedDay?.date,
            let index = recordedDates.firstIndex(of: current),
            recordedDates.indices.contains(index + delta)
        else { return }
        selectedDate = recordedDates[index + delta]
        selectedItemID = nil
    }

    /// One continuous horizontal track across the calendar range that has
    /// content. Empty days still occupy a day-width so absolute time stays
    /// correct; free pan browses without day paging.
    private var timelineViewport: some View {
        let calendar = Calendar.autoupdatingCurrent
        let rangeStart = trackRangeStart
        let dayCount = trackDayCount
        let dayWidth = timelineViewportWidth * liveZoom
        let totalWidth = dayWidth * CGFloat(dayCount)
        let items = trackItems
        let dayAnchors = (0..<dayCount).compactMap { offset in
            calendar.date(byAdding: .day, value: offset, to: rangeStart)
        }

        return ScrollView(.horizontal) {
            ZStack(alignment: .topLeading) {
                MacDayTimelineView(
                    items: items,
                    rangeStart: rangeStart,
                    dayCount: dayCount,
                    selectedItemID: $selectedItemID,
                    width: totalWidth
                )

                // Day anchors for scrollPosition — invisible, same pitch as the track.
                HStack(spacing: 0) {
                    ForEach(dayAnchors, id: \.self) { day in
                        Color.clear
                            .frame(width: dayWidth, height: 1)
                            .id(day)
                    }
                }
                .frame(height: 1, alignment: .top)
                .allowsHitTesting(false)
            }
        }
        .frame(height: ReTurnDesign.Desktop.Before.timelineTrackHeight)
        .scrollPosition(id: $timelineScrollDay, anchor: .leading)
        .onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.width
        } action: { width in
            timelineViewportWidth = width
        }
        .simultaneousGesture(
            MagnifyGesture()
                .updating($magnifyDelta) { value, state, _ in
                    state = value.magnification
                }
                .onEnded { value in
                    zoom = liveZoomFrom(value.magnification)
                }
        )
        .overlay(alignment: .bottomTrailing) {
            zoomControls
                .padding(.trailing, ReTurnDesign.Spacing.medium)
                .padding(.bottom, 2)
        }
        .onChange(of: selectedDate) { _, newDate in
            timelineScrollDay = calendar.startOfDay(for: newDate)
        }
        .onChange(of: selectedItemID) { _, itemID in
            guard let itemID,
                  let item = items.first(where: { $0.id == itemID })
            else { return }
            let dayStart = calendar.startOfDay(for: item.start)
            if !calendar.isDate(selectedDate, inSameDayAs: dayStart) {
                selectedDate = dayStart
            }
        }
        .onAppear {
            timelineScrollDay = calendar.startOfDay(for: selectedDate)
        }
    }

    private func liveZoomFrom(_ magnification: CGFloat) -> CGFloat {
        min(
            max(zoom * magnification, 1),
            ReTurnDesign.Desktop.Before.timelineMaxZoom
        )
    }

    private static let zoomSteps: [CGFloat] = [1, 1.5, 2, 3, 4, 6, 8]

    /// Always-visible zoom controls: the pinch stays as the shortcut, but
    /// buttons are the discoverable path and the badge doubles as the reset
    /// back to the default framing.
    private var zoomControls: some View {
        HStack(spacing: ReTurnDesign.Spacing.extraSmall) {
            Button {
                stepZoom(toward: -1)
            } label: {
                Image(systemName: "minus")
            }
            .disabled(liveZoom <= (Self.zoomSteps.first ?? 1))
            .accessibilityLabel("Zoom timeline out")

            Button {
                withAnimation(.easeOut(duration: 0.2)) {
                    zoom = ReTurnDesign.Desktop.Before.timelineDefaultZoom
                }
            } label: {
                Text("\(liveZoom, specifier: "%.1f")×")
                    .monospacedDigit()
                    .frame(minWidth: 32)
            }
            .help("Reset zoom")
            .accessibilityLabel("Reset timeline zoom")

            Button {
                stepZoom(toward: 1)
            } label: {
                Image(systemName: "plus")
            }
            .disabled(liveZoom >= (Self.zoomSteps.last ?? ReTurnDesign.Desktop.Before.timelineMaxZoom))
            .accessibilityLabel("Zoom timeline in")
        }
        .font(.caption.weight(.semibold))
        .foregroundStyle(.secondary)
        .buttonStyle(.plain)
        .padding(.horizontal, ReTurnDesign.Spacing.small)
        .padding(.vertical, ReTurnDesign.Spacing.extraSmall)
        .background(.ultraThinMaterial, in: Capsule())
    }

    /// Buttons walk the discrete steps; a pinch keeps its continuous value
    /// until the next button press snaps to the nearest step in that
    /// direction.
    private func stepZoom(toward direction: Int) {
        let target =
            if direction > 0 {
                Self.zoomSteps.first { $0 > liveZoom + 0.01 }
            } else {
                Self.zoomSteps.last { $0 < liveZoom - 0.01 }
            }
        guard let target else { return }
        withAnimation(.easeOut(duration: 0.2)) {
            zoom = target
        }
    }

    /// True when the store holds any day with content (drives track chrome).
    private var trackDays: [TimelineDay] {
        timeline.daysByKey.values.filter { !$0.items.isEmpty }
    }

    /// Inclusive start-of-day for the continuous track (earliest content day).
    private var trackRangeStart: Date {
        let calendar = Calendar.autoupdatingCurrent
        let earliest = trackDays.map(\.date).min() ?? selectedDate
        return calendar.startOfDay(for: earliest)
    }

    /// Calendar days spanned by content, including empty days in the middle.
    private var trackDayCount: Int {
        let calendar = Calendar.autoupdatingCurrent
        guard let latest = trackDays.map(\.date).max() else { return 1 }
        let end = calendar.startOfDay(for: latest)
        let days = calendar.dateComponents([.day], from: trackRangeStart, to: end).day ?? 0
        return max(days + 1, 1)
    }

    private var trackItems: [TimelineDisplayItem] {
        trackDays.flatMap(\.items)
    }

    private func eventList(_ day: TimelineDay) -> some View {
        let grouped = TimelineGroupedItem.group(items: day.items)

        return ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: ReTurnDesign.Spacing.extraSmall) {
                    ForEach(grouped) { group in
                        eventGroupRow(group)
                    }
                }
                .padding(.horizontal, ReTurnDesign.Spacing.large)
                .padding(.vertical, ReTurnDesign.Spacing.small)
            }
            .scrollIndicators(.hidden)
            // Track click → expand the owning group (so the row id exists),
            // then scroll the list to that event.
            .onChange(of: selectedItemID) { _, itemID in
                guard let itemID else { return }
                if let group = grouped.first(where: { $0.events.contains(where: { $0.id == itemID }) }),
                   group.isGrouped {
                    expandedGroupIDs.insert(group.id)
                }
                Task { @MainActor in
                    // Let the expanded rows (and day switch) commit before scrolling.
                    await Task.yield()
                    withAnimation(.easeInOut(duration: 0.25)) {
                        proxy.scrollTo(itemID, anchor: .center)
                    }
                }
            }
        }
    }

    /// One row in the event list: a single event or a collapsed/expanded group.
    @ViewBuilder
    private func eventGroupRow(_ group: TimelineGroupedItem) -> some View {
        let isExpanded = expandedGroupIDs.contains(group.id)

        if group.isGrouped {
            VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.extraSmall) {
                // Group header: tap to expand/collapse
                Button {
                    withAnimation(.easeInOut(duration: 0.2)) {
                        if isExpanded {
                            _ = expandedGroupIDs.remove(group.id)
                        } else {
                            _ = expandedGroupIDs.insert(group.id)
                        }
                    }
                } label: {
                    HStack(spacing: ReTurnDesign.Spacing.small) {
                        Image(systemName: group.representative.symbolName)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(TimelineDesign.Colors.accent(for: group.representative))
                            .frame(width: 24, height: 24)
                            .background(
                                TimelineDesign.Colors.accent(for: group.representative).opacity(0.12),
                                in: .circle
                            )

                        VStack(alignment: .leading, spacing: 2) {
                            Text(group.summaryLabel)
                                .font(TimelineDesign.Typography.eventTitle)
                                .foregroundStyle(.primary)
                            Text(group.timeDisplay)
                                .font(TimelineDesign.Typography.eventMetadata)
                                .foregroundStyle(.secondary)
                                .monospacedDigit()
                        }

                        Spacer(minLength: 4)

                        Image(systemName: isExpanded ? "chevron.up" : "chevron.down")
                            .font(.caption.bold())
                            .foregroundStyle(.tertiary)
                    }
                    .padding(ReTurnDesign.Spacing.small)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(
                        TimelineDesign.Colors.accent(for: group.representative).opacity(0.06),
                        in: RoundedRectangle(cornerRadius: 10, style: .continuous)
                    )
                    .contentShape(.rect)
                }
                .buttonStyle(.plain)
                // Collapsed groups still need a scroll target for every member
                // the horizontal track can select.
                .background(alignment: .top) {
                    ForEach(group.events) { item in
                        Color.clear.frame(height: 0).id(item.id)
                    }
                }

                // Expanded: individual events
                if isExpanded {
                    ForEach(group.events) { item in
                        eventRow(item)
                            .padding(.leading, 32)
                    }
                }
            }
        } else {
            eventRow(group.representative)
        }
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
        .id(item.id)
    }
}

#Preview("Before · Light") {
    MacBeforeView()
        .previewStores {
            $0.timeline.seedForPreview(TimelinePreviewData.days, streak: 3)
        }
}

#Preview("Before · Dark") {
    MacBeforeView()
        .preferredColorScheme(.dark)
        .previewStores {
            $0.timeline.seedForPreview(TimelinePreviewData.days, streak: 3)
        }
}
#endif
