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

struct ContentView: View {
    @State private var selectedPage: TimelinePage? = .now
    @State private var isNavigationDimmed = false
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        let timelineContent = ZStack {
            ReTurnDesign.Colors.screenBackground
                .ignoresSafeArea()

            ScrollView(.horizontal) {
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

    private var pageSelection: Binding<TimelinePage> {
        Binding(
            get: { selectedPage ?? .now },
            set: { page in
                withAnimation(
                    .easeInOut(duration: ReTurnDesign.Motion.navigationSelectionDuration)
                ) {
                    selectedPage = page
                }
            }
        )
    }

    /// Plain labels rather than a segmented `Picker`: the filled control was the
    /// only opaque surface on the screen and outweighed everything around it.
    private var pageNavigation: some View {
        HStack(spacing: ReTurnDesign.Spacing.large) {
            ForEach(TimelinePage.allCases) { page in
                let isSelected = page == pageSelection.wrappedValue

                Button {
                    pageSelection.wrappedValue = page
                } label: {
                    Text(page.rawValue)
                        .font(ReTurnDesign.Typography.navigationItem)
                        .fontWeight(isSelected ? .semibold : .regular)
                        .foregroundStyle(
                            isSelected
                                ? ReTurnDesign.Colors.primaryLabel
                                : ReTurnDesign.Colors.secondaryLabel
                        )
                }
                .buttonStyle(.plain)
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
        // Restarts on every page change, so the navigation comes back to full
        // strength while switching and recedes once the page settles. Opacity
        // does not affect hit testing, so the labels stay tappable while dimmed.
        .task(id: selectedPage) {
            isNavigationDimmed = false
            try? await Task.sleep(for: .seconds(ReTurnDesign.Motion.navigationDimDelay))
            isNavigationDimmed = true
        }
    }

    @ViewBuilder
    private func pageContent(for page: TimelinePage) -> some View {
        switch page {
        case .before, .after:
            Color.clear
        case .now:
            NowPage()
        }
    }
}

private struct NowPage: View {
    var body: some View {
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            // Sized from the scroll viewport, which only changes on rotation --
            // the mascot is a preserved vector and re-rasterizes on every new
            // width, so it must not track the composer or keyboard animation.
            Image("Kongkong")
                .resizable()
                .aspectRatio(
                    ReTurnDesign.Metrics.mascotAspectRatio,
                    contentMode: .fit
                )
                .containerRelativeFrame(.horizontal) { width, _ in
                    ReTurnDesign.Layout.mascotWidth(in: width)
                }
                .accessibilityHidden(true)

            Text("Teethe is back!")
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
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
