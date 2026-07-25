//
//  ContentView.swift
//  ReTurn
//
//  Created by is52hertz on 7/25/26.
//

import SwiftUI

enum TimelinePage: String, CaseIterable, Identifiable {
    case before = "Before"
    case now = "Now"
    case after = "After"

    var id: Self { self }
}

/// What the navigation's dim timer reacts to: it wakes on either a page change
/// or the pager starting to move, and only counts down once both have settled.
private struct NavigationActivity: Equatable {
    let page: TimelinePage?
    let isScrolling: Bool
}

struct ContentView: View {
    @State private var selectedPage: TimelinePage? = .now
    @State private var isNavigationDimmed = false
    @State private var isScrolling = false
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        let pager = ScrollView(.horizontal) {
            LazyHStack(spacing: 0) {
                ForEach(TimelinePage.allCases) { page in
                    pageContent(for: page)
                        .containerRelativeFrame([.horizontal, .vertical])
                        .id(page)
                }
            }
            .scrollTargetLayout()
        }
        .scrollIndicators(.hidden)
        .scrollTargetBehavior(.paging)
        .scrollPosition(id: $selectedPage)

        let timelineContent = ZStack {
            ReTurnDesign.Colors.screenBackground
                .ignoresSafeArea()

            // Scroll phases let the navigation wake the moment a drag starts and
            // start its countdown only once the pager truly stops -- `scrollPosition`
            // updates when the settle animation begins, which is too early for both.
            // On older systems `isScrolling` stays false and the navigation falls
            // back to waking on the page change itself.
            if #available(iOS 18.0, macOS 15.0, *) {
                pager
                    .onScrollPhaseChange { _, phase in
                        isScrolling = phase != .idle
                    }
            } else {
                pager
            }
        }
        .safeAreaInset(edge: .top, spacing: 0) {
            pageNavigation
        }

        return Group {
            #if os(iOS)
            timelineContent
                .simultaneousGesture(
                    TapGesture()
                        .onEnded {
                            isComposerFocused = false
                        }
                )
            #else
            timelineContent
            #endif
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            ComposerBar(isFocused: $isComposerFocused)
        }
    }

    private var currentPage: TimelinePage { selectedPage ?? .now }

    private func select(_ page: TimelinePage) {
        withAnimation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration)
        ) {
            selectedPage = page
        }
    }

    /// Plain labels rather than a segmented `Picker`: the filled control was the
    /// only opaque surface on the screen and outweighed everything around it.
    private var pageNavigation: some View {
        HStack(spacing: ReTurnDesign.Spacing.large) {
            ForEach(TimelinePage.allCases) { page in
                let isSelected = page == currentPage

                Button {
                    select(page)
                } label: {
                    // Every label reserves its selected width, so changing
                    // weights cannot shove the row's other labels around.
                    Text(page.rawValue)
                        .fontWeight(.semibold)
                        .hidden()
                        .overlay {
                            Text(page.rawValue)
                                .fontWeight(isSelected ? .semibold : .regular)
                                .foregroundStyle(
                                    isSelected
                                        ? ReTurnDesign.Colors.primaryLabel
                                        : ReTurnDesign.Colors.secondaryLabel
                                )
                        }
                }
                .font(ReTurnDesign.Typography.navigationItem)
                .buttonStyle(.plain)
                .accessibilityLabel(page.rawValue)
                .accessibilityAddTraits(isSelected ? .isSelected : [])
            }
        }
        .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
        .padding(.top, ReTurnDesign.Spacing.small)
        .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
        .animation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration),
            value: selectedPage
        )
        .opacity(isNavigationDimmed ? ReTurnDesign.Metrics.navigationDimmedOpacity : 1)
        .animation(
            .easeInOut(duration: ReTurnDesign.Motion.navigationDimDuration),
            value: isNavigationDimmed
        )
        // Restarts whenever the page changes or the pager starts and stops, so
        // the navigation is at full strength for the whole gesture and only
        // recedes once everything settles. Opacity does not affect hit testing,
        // so the labels stay tappable while dimmed.
        .task(id: NavigationActivity(page: selectedPage, isScrolling: isScrolling)) {
            isNavigationDimmed = false
            // Hold while the pager is still moving; the countdown belongs to
            // the restart that follows it stopping.
            guard !isScrolling else { return }

            try? await Task.sleep(for: .seconds(ReTurnDesign.Motion.navigationDimDelay))
            // `try?` swallows the cancellation error, so a superseded timer
            // would otherwise still dim -- immediately after the task that
            // replaced it restored full strength.
            guard !Task.isCancelled else { return }
            isNavigationDimmed = true
        }
    }

    @ViewBuilder
    private func pageContent(for page: TimelinePage) -> some View {
        switch page {
        case .before:
            #if os(iOS)
            // The API-backed timeline store is not wired yet; keep the reviewed
            // fixture visible so the merged Before experience remains testable.
            BeforeView(days: TimelinePreviewData.days)
            #else
            Color.clear
            #endif
        case .after:
            Color.clear
        case .now:
            NowPage()
        }
    }
}

private struct NowPage: View {
    /// Demo driver until the Now store wires `/api/stats/today` and the
    /// contract's pending profession field in: every few seconds the next
    /// profession takes the stage, and one stat at a time is pushed to the
    /// max so each wearable (sparkles, eye glints, gear, orbit dots, aura)
    /// gets its turn in the spotlight.
    private static let demoLineup: [(profession: MascotProfession, stat: String, stats: Stats)] = [
        (.coder, "intake", Stats(intake: 95, focus: 40, output: 40, continuity: 40, energy: 40)),
        (.writer, "focus", Stats(intake: 40, focus: 95, output: 40, continuity: 40, energy: 40)),
        (.designer, "output", Stats(intake: 40, focus: 40, output: 95, continuity: 40, energy: 40)),
        (.researcher, "continuity", Stats(intake: 40, focus: 40, output: 40, continuity: 95, energy: 40)),
        (.manager, "energy", Stats(intake: 40, focus: 40, output: 40, continuity: 40, energy: 95)),
    ]

    @State private var demoIndex = 0

    var body: some View {
        let demo = Self.demoLineup[demoIndex]
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            // Sized from the scroll viewport, which only changes on rotation --
            // the mascot redraws every frame, so it must not track the
            // composer or keyboard animation.
            MascotView(stats: demo.stats, profession: demo.profession)
                .containerRelativeFrame(.horizontal) { width, _ in
                    MascotView.frameWidth(
                        forMascotWidth: ReTurnDesign.Layout.mascotWidth(in: width)
                    )
                }

            Text("Teethe is back!")
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)

            Text("\(demo.profession.displayName) · \(demo.stat)")
                .font(ReTurnDesign.Typography.cardTag)
                .foregroundStyle(ReTurnDesign.Colors.secondaryLabel)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(3))
                guard !Task.isCancelled else { return }
                demoIndex = (demoIndex + 1) % Self.demoLineup.count
            }
        }
    }
}

/// Owns the draft text so typing invalidates only the composer. Holding it on
/// `ContentView` rebuilt the pager, its pages and the mascot on every keystroke.
private struct ComposerBar: View {
    @FocusState.Binding var isFocused: Bool
    @State private var text = ""

    var body: some View {
        let composerShape = RoundedRectangle(
            cornerRadius: ReTurnDesign.Metrics.composerCornerRadius,
            style: .continuous
        )
        let hitPadding = ReTurnDesign.Metrics.composerAccessoryHitPadding
        // A single menu whose label is the visible plus. `.plain` keeps the
        // system from drawing a bordered pressed state around it and from
        // treating the button as a glass surface to morph into the menu -- the
        // menu lifts only the glyph, leaving the composer in place.
        let attachmentMenu = Menu {
            attachmentMenuItems
        } label: {
            Label("Add", systemImage: "plus")
                .labelStyle(.iconOnly)
                .font(.title2)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .frame(
                    width: ReTurnDesign.Metrics.composerAccessorySize,
                    height: ReTurnDesign.Metrics.composerAccessorySize
                )
                // Grow the touch target to the HIG minimum, then cancel the
                // growth so the glyph keeps its place in the composer.
                .padding(hitPadding)
                .contentShape(.rect)
                .padding(-hitPadding)
        }
        .menuIndicator(.hidden)
        .buttonStyle(.plain)

        let composerContent = HStack(
            alignment: .center,
            spacing: ReTurnDesign.Spacing.medium
        ) {
            attachmentMenu

            TextField("Ask Return Anything", text: $text, axis: .vertical)
                .font(ReTurnDesign.Typography.composer)
                .textFieldStyle(.plain)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .lineLimit(1...ReTurnDesign.Metrics.composerMaximumLineCount)
                .focused($isFocused)

            Image(systemName: text.isEmpty ? "waveform.mid" : "arrow.up")
                .foregroundStyle(ReTurnDesign.Colors.voiceButtonForeground)
                .frame(
                    width: ReTurnDesign.Metrics.composerAccessorySize,
                    height: ReTurnDesign.Metrics.composerAccessorySize
                )
                .background(ReTurnDesign.Colors.voiceButtonBackground, in: Circle())
                .accessibilityHidden(true)
        }
        .padding(.horizontal, ReTurnDesign.Metrics.composerHorizontalInset)
        .padding(.vertical, ReTurnDesign.Spacing.small)
        .frame(
            maxWidth: ReTurnDesign.Layout.composerMaximumWidth(isFocused: isFocused)
        )
        .frame(
            minHeight: isFocused
                ? ReTurnDesign.Metrics.composerFocusedHeight
                : ReTurnDesign.Metrics.composerHeight
        )

        #if os(iOS)
        let surfacedComposer = Group {
            if #available(iOS 26.0, *) {
                composerContent
                    .glassEffect(.regular.interactive(), in: composerShape)
            } else {
                composerContent
                    .background(.ultraThinMaterial, in: composerShape)
                    .shadow(
                        color: ReTurnDesign.Colors.composerFallbackShadow,
                        radius: ReTurnDesign.Metrics.composerFallbackShadowRadius,
                        y: ReTurnDesign.Metrics.composerFallbackShadowY
                    )
            }
        }
        // The TextField only covers one text line, so the surface's vertical
        // padding is otherwise dead. The plus and the field are children of this
        // view and keep hit priority over the shape's tap gesture.
        .contentShape(composerShape)
        .onTapGesture {
            isFocused = true
        }
        #else
        let surfacedComposer = composerContent
            .background {
                if #available(macOS 26.0, *) {
                    composerShape
                        .fill(.clear)
                        .glassEffect(.regular.interactive(), in: composerShape)
                } else {
                    composerShape
                        .fill(.ultraThinMaterial)
                        .shadow(
                            color: ReTurnDesign.Colors.composerFallbackShadow,
                            radius: ReTurnDesign.Metrics.composerFallbackShadowRadius,
                            y: ReTurnDesign.Metrics.composerFallbackShadowY
                        )
                }
            }
            .contentShape(composerShape)
        #endif

        return surfacedComposer
            .animation(
                .spring(
                    response: ReTurnDesign.Motion.composerResponse,
                    dampingFraction: ReTurnDesign.Motion.composerDampingFraction
                ),
                value: isFocused
            )
            .padding(
                .horizontal,
                ReTurnDesign.Layout.composerHorizontalPadding(isFocused: isFocused)
            )
            .padding(.top, ReTurnDesign.Spacing.medium)
            .padding(.bottom, ReTurnDesign.Spacing.medium)
    }

    @ViewBuilder
    private var attachmentMenuItems: some View {
        ControlGroup {
            Button("Camera", systemImage: "camera") {
                // TODO: Present camera capture.
            }

            Button("Photos", systemImage: "photo") {
                // TODO: Present the photo picker.
            }

            Button("Files", systemImage: "folder") {
                // TODO: Present the file importer.
            }
        }
    }
}

#Preview {
    ContentView()
}
