#if os(macOS)
import Foundation
import SwiftUI

/// Continuous desktop timeline track: a single horizontal Gantt across the
/// loaded date range (not per-day cards). Spans pack into lanes, inputs are
/// symbol dots, ambient traces sit on the baseline. Height is fixed from
/// design tokens so the track never grows with lane count.
struct MacDayTimelineView: View {
    let items: [TimelineDisplayItem]
    /// Start of day for the leftmost edge of the track.
    let rangeStart: Date
    let dayCount: Int
    @Binding var selectedItemID: String?
    /// Total track width (viewport × zoom × dayCount).
    let width: CGFloat

    private typealias Tokens = ReTurnDesign.Desktop.Before

    var body: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.extraSmall) {
            axisLabels

            ZStack(alignment: .topLeading) {
                gridLines
                sleepBars
                activityBars
                inputDots
                ambientDots
            }
            .frame(width: width, height: Tokens.timelineTrackContentHeight, alignment: .topLeading)
            .clipped()
        }
        .frame(width: width, height: Tokens.timelineTrackHeight, alignment: .topLeading)
    }

    // ── items by lane ────────────────────────────────────

    private var sleepItems: [TimelineDisplayItem] {
        items.filter { $0.kind == .sleep }
    }

    private var activityItems: [TimelineDisplayItem] {
        items.filter {
            ($0.presentation == .span || $0.presentation == .major) && $0.kind != .sleep
        }
    }

    private var inputItems: [TimelineDisplayItem] {
        items.filter { $0.presentation == .point }
    }

    private var ambientItems: [TimelineDisplayItem] {
        items.filter { $0.presentation == .ambient }
    }

    /// Greedy interval packing: overlapping spans spill into a new lane.
    private var activityLanes: [[TimelineDisplayItem]] {
        var lanes: [[TimelineDisplayItem]] = []
        var laneEnds: [Date] = []
        for item in activityItems.sorted(by: { $0.start < $1.start }) {
            if let index = laneEnds.firstIndex(where: { $0 <= item.start }) {
                lanes[index].append(item)
                laneEnds[index] = item.end
            } else {
                lanes.append([item])
                laneEnds.append(item.end)
            }
        }
        return lanes
    }

    // ── vertical layout (fixed) ──────────────────────────

    private var activityLanePitch: CGFloat {
        Tokens.timelineSpanBarHeight + Tokens.timelineLaneGap
    }

    private var activityTop: CGFloat {
        Tokens.timelineSleepBarHeight + Tokens.timelineLaneGap
    }

    private var inputTop: CGFloat {
        activityTop + CGFloat(Tokens.timelineTrackVisibleLanes) * activityLanePitch
    }

    private var ambientTop: CGFloat {
        inputTop + Tokens.timelineInputDotSize + Tokens.timelineLaneGap
    }

    // ── axis ─────────────────────────────────────────────

    private var dayWidth: CGFloat {
        width / CGFloat(max(dayCount, 1))
    }

    private var totalMinutes: CGFloat {
        CGFloat(max(dayCount, 1)) * 1440
    }

    /// Tick density follows zoom: hourly once an hour is wide enough to
    /// read, otherwise every three hours.
    private var tickIntervalHours: Int {
        dayWidth / 24 >= Tokens.timelineDenseTickHourWidth ? 1 : 3
    }

    private func x(for date: Date) -> CGFloat {
        let minutes = CGFloat(date.timeIntervalSince(rangeStart) / 60)
        return min(max(minutes, 0), totalMinutes) / totalMinutes * width
    }

    private var axisLabels: some View {
        let calendar = Calendar.autoupdatingCurrent
        let step = tickIntervalHours
        let totalHours = max(dayCount, 1) * 24

        return ZStack(alignment: .topLeading) {
            ForEach(Array(stride(from: 0, through: totalHours, by: step)), id: \.self) { hourOffset in
                let xPos = width * CGFloat(hourOffset) / CGFloat(totalHours)
                let hourOfDay = hourOffset % 24
                let isMidnight = hourOfDay == 0 && hourOffset != totalHours

                if isMidnight, let day = calendar.date(byAdding: .hour, value: hourOffset, to: rangeStart) {
                    Text(day, format: .dateTime.month(.abbreviated).day())
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .offset(x: min(max(xPos, 0), width - 40))
                } else if hourOffset < totalHours {
                    Text(String(format: "%02d:00", hourOfDay))
                        .font(.caption2)
                        .foregroundStyle(.tertiary)
                        .monospacedDigit()
                        .offset(x: min(max(xPos - 14, 0), width - 34))
                }
            }
        }
        .frame(width: width, height: Tokens.timelineHourLabelHeight, alignment: .topLeading)
        .accessibilityHidden(true)
    }

    private var gridLines: some View {
        let step = tickIntervalHours
        let totalHours = max(dayCount, 1) * 24

        return ForEach(Array(stride(from: 0, through: totalHours, by: step)), id: \.self) { hourOffset in
            let xPos = width * CGFloat(hourOffset) / CGFloat(totalHours)
            let isMidnight = hourOffset % 24 == 0
            Rectangle()
                .fill(Color.primary.opacity(isMidnight ? 0.12 : 0.06))
                .frame(width: 1, height: Tokens.timelineTrackContentHeight)
                .offset(x: min(xPos, width - 1))
        }
        .allowsHitTesting(false)
    }

    // ── lanes ────────────────────────────────────────────

    private var sleepBars: some View {
        ForEach(sleepItems) { item in
            spanBar(item: item, height: Tokens.timelineSleepBarHeight)
                .offset(x: x(for: item.start), y: 0)
        }
    }

    private var activityBars: some View {
        ForEach(Array(activityLanes.enumerated()), id: \.offset) { laneIndex, lane in
            // Lanes beyond the visible budget share the last visible row so
            // the track height stays fixed (selection still works).
            let visualLane = min(laneIndex, Tokens.timelineTrackVisibleLanes - 1)
            ForEach(lane) { item in
                spanBar(item: item, height: Tokens.timelineSpanBarHeight)
                    .offset(
                        x: x(for: item.start),
                        y: activityTop + CGFloat(visualLane) * activityLanePitch
                    )
            }
        }
    }

    private func spanBar(item: TimelineDisplayItem, height: CGFloat) -> some View {
        let tint = TimelineDesign.Colors.accent(for: item)
        let barWidth = max(x(for: item.end) - x(for: item.start), 4)
        let isSelected = selectedItemID == item.id

        return Button {
            selectedItemID = item.id
        } label: {
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 4, style: .continuous)
                    .fill(tint.opacity(isSelected ? 1 : 0.8))

                if barWidth >= Tokens.timelineSpanLabelMinimumWidth {
                    Text(item.label)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.white)
                        .lineLimit(1)
                        .padding(.horizontal, 6)
                }
            }
            .frame(width: barWidth, height: height)
            .overlay {
                if isSelected {
                    RoundedRectangle(cornerRadius: 4, style: .continuous)
                        .strokeBorder(tint.opacity(0.4), lineWidth: 2)
                        .blendMode(.multiply)
                }
            }
        }
        .buttonStyle(.plain)
        .help("\(item.categoryLabel) · \(item.timeDisplay)\n\(item.label)")
        .accessibilityLabel(item.label)
        .accessibilityValue(item.accessibilityValue)
    }

    private var inputDots: some View {
        ForEach(inputItems) { item in
            let tint = TimelineDesign.Colors.accent(for: item)
            let isSelected = selectedItemID == item.id

            Button {
                selectedItemID = item.id
            } label: {
                Image(systemName: item.symbolName)
                    .font(.caption2)
                    .foregroundStyle(tint)
                    .frame(
                        width: Tokens.timelineInputDotSize,
                        height: Tokens.timelineInputDotSize
                    )
                    .background(tint.opacity(isSelected ? 0.3 : 0.15), in: Circle())
                    .overlay {
                        if isSelected {
                            Circle().strokeBorder(tint, lineWidth: 1.5)
                        }
                    }
            }
            .buttonStyle(.plain)
            .help("\(item.categoryLabel) · \(item.timeDisplay)\n\(item.label)")
            .accessibilityLabel(item.label)
            .accessibilityValue(item.accessibilityValue)
            .offset(
                x: x(for: item.start) - Tokens.timelineInputDotSize / 2,
                y: inputTop
            )
        }
    }

    private var ambientDots: some View {
        ForEach(ambientItems) { item in
            Circle()
                .fill(TimelineDesign.Colors.ambient)
                .frame(
                    width: Tokens.timelineAmbientDotSize,
                    height: Tokens.timelineAmbientDotSize
                )
                .offset(
                    x: x(for: item.start) - Tokens.timelineAmbientDotSize / 2,
                    y: ambientTop
                )
        }
        .allowsHitTesting(false)
    }
}

#Preview {
    let days = TimelinePreviewData.days.sorted { $0.date < $1.date }
    let start = Calendar.autoupdatingCurrent.startOfDay(for: days.first?.date ?? .now)
    MacDayTimelineView(
        items: days.flatMap(\.items),
        rangeStart: start,
        dayCount: max(days.count, 1),
        selectedItemID: .constant(nil),
        width: 760 * CGFloat(max(days.count, 1))
    )
    .padding()
}
#endif
