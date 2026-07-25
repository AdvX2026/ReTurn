#if os(macOS)
import Foundation
import SwiftUI

/// The desktop reading of one timeline day: a horizontal 24-hour track, the
/// way Screen Time and Health's sleep chart lay time out left to right.
/// Spans become tinted bars (packed into extra lanes when they overlap),
/// user inputs become symbol dots underneath, ambient traces stay quiet dots
/// on the baseline. Same `TimelineDisplayItem` data and the same accent
/// mapping as the mobile rail — only the projection changes.
struct MacDayTimelineView: View {
    let day: TimelineDay
    @Binding var selectedItemID: String?
    /// Explicit instead of a GeometryReader: the track lives in a horizontal
    /// ScrollView and may be zoomed wider than the viewport, so the parent
    /// computes the width (viewport × zoom) and hands it down.
    let width: CGFloat

    private typealias Tokens = ReTurnDesign.Desktop.Before

    var body: some View {
        VStack(alignment: .leading, spacing: ReTurnDesign.Spacing.extraSmall) {
            hourLabels(width: width)

            ZStack(alignment: .topLeading) {
                gridLines(width: width)
                sleepBars(width: width)
                activityBars(width: width)
                inputDots(width: width)
                ambientDots(width: width)
            }
            .frame(width: width, height: contentHeight)
        }
        .frame(width: width)
    }

    // ── items by lane ────────────────────────────────────

    private var sleepItems: [TimelineDisplayItem] {
        day.items.filter { $0.kind == .sleep }
    }

    private var activityItems: [TimelineDisplayItem] {
        day.items.filter {
            ($0.presentation == .span || $0.presentation == .major) && $0.kind != .sleep
        }
    }

    private var inputItems: [TimelineDisplayItem] {
        day.items.filter { $0.presentation == .point }
    }

    private var ambientItems: [TimelineDisplayItem] {
        day.items.filter { $0.presentation == .ambient }
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

    // ── vertical layout ──────────────────────────────────

    private var sleepSection: CGFloat {
        sleepItems.isEmpty ? 0 : Tokens.timelineSleepBarHeight + Tokens.timelineLaneGap
    }

    private var activitySection: CGFloat {
        activityLanes.isEmpty
            ? 0
            : CGFloat(activityLanes.count) * (Tokens.timelineSpanBarHeight + Tokens.timelineLaneGap)
    }

    private var inputSection: CGFloat {
        inputItems.isEmpty ? 0 : Tokens.timelineInputDotSize + Tokens.timelineLaneGap
    }

    private var ambientSection: CGFloat {
        ambientItems.isEmpty ? 0 : Tokens.timelineAmbientDotSize + Tokens.timelineLaneGap
    }

    private var contentHeight: CGFloat {
        max(
            sleepSection + activitySection + inputSection + ambientSection - Tokens.timelineLaneGap,
            Tokens.timelineSpanBarHeight
        )
    }

    private var activityTop: CGFloat { sleepSection }
    private var inputTop: CGFloat { sleepSection + activitySection }
    private var ambientTop: CGFloat {
        sleepSection + activitySection + inputSection
    }

    // ── axis ─────────────────────────────────────────────

    private func x(for date: Date, width: CGFloat) -> CGFloat {
        let dayStart = Calendar.autoupdatingCurrent.startOfDay(for: day.date)
        let minutes = CGFloat(date.timeIntervalSince(dayStart) / 60)
        return min(max(minutes, 0), 1440) / 1440 * width
    }

    private func hourLabels(width: CGFloat) -> some View {
        ZStack(alignment: .topLeading) {
            ForEach(Array(stride(from: 0, through: 24, by: 3)), id: \.self) { hour in
                Text(String(format: "%02d:00", hour))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .monospacedDigit()
                    .offset(x: min(max(width * CGFloat(hour) / 24 - 17, 0), width - 34))
            }
        }
        .frame(height: Tokens.timelineHourLabelHeight)
        .accessibilityHidden(true)
    }

    private func gridLines(width: CGFloat) -> some View {
        ForEach(Array(stride(from: 0, through: 24, by: 3)), id: \.self) { hour in
            Rectangle()
                .fill(Color.primary.opacity(0.06))
                .frame(width: 1, height: contentHeight)
                .offset(x: min(width * CGFloat(hour) / 24, width - 1))
        }
        .allowsHitTesting(false)
    }

    // ── lanes ────────────────────────────────────────────

    private func sleepBars(width: CGFloat) -> some View {
        ForEach(sleepItems) { item in
            spanBar(item: item, width: width, height: Tokens.timelineSleepBarHeight)
                .offset(x: x(for: item.start, width: width), y: 0)
        }
    }

    private func activityBars(width: CGFloat) -> some View {
        ForEach(Array(activityLanes.enumerated()), id: \.offset) { laneIndex, lane in
            ForEach(lane) { item in
                spanBar(item: item, width: width, height: Tokens.timelineSpanBarHeight)
                    .offset(
                        x: x(for: item.start, width: width),
                        y: activityTop + CGFloat(laneIndex) * (Tokens.timelineSpanBarHeight + Tokens.timelineLaneGap)
                    )
            }
        }
    }

    private func spanBar(item: TimelineDisplayItem, width: CGFloat, height: CGFloat) -> some View {
        let tint = TimelineDesign.Colors.accent(for: item)
        let barWidth = max(x(for: item.end, width: width) - x(for: item.start, width: width), 4)
        let isSelected = selectedItemID == item.id

        return Button {
            selectedItemID = item.id
        } label: {
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 6, style: .continuous)
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
                    RoundedRectangle(cornerRadius: 6, style: .continuous)
                        .strokeBorder(tint.opacity(0.4), lineWidth: 3)
                        .blendMode(.multiply)
                }
            }
        }
        .buttonStyle(.plain)
        .help("\(item.categoryLabel) · \(item.timeDisplay)\n\(item.label)")
        .accessibilityLabel(item.label)
        .accessibilityValue(item.accessibilityValue)
    }

    private func inputDots(width: CGFloat) -> some View {
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
                x: x(for: item.start, width: width) - Tokens.timelineInputDotSize / 2,
                y: inputTop
            )
        }
    }

    private func ambientDots(width: CGFloat) -> some View {
        ForEach(ambientItems) { item in
            Circle()
                .fill(TimelineDesign.Colors.ambient)
                .frame(
                    width: Tokens.timelineAmbientDotSize,
                    height: Tokens.timelineAmbientDotSize
                )
                .offset(
                    x: x(for: item.start, width: width) - Tokens.timelineAmbientDotSize / 2,
                    y: ambientTop
                )
        }
        // Decorative traces only; their details live in the list below.
        .allowsHitTesting(false)
    }
}

#Preview {
    MacDayTimelineView(
        day: TimelinePreviewData.days[0],
        selectedItemID: .constant(nil),
        width: 760
    )
    .padding()
}
#endif
