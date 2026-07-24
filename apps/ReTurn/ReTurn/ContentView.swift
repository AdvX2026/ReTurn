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
            pagePicker
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
                withAnimation(.easeInOut(duration: 0.25)) {
                    selectedPage = page
                }
            }
        )
    }

    private var pagePicker: some View {
        Picker("Timeline", selection: pageSelection) {
            ForEach(TimelinePage.allCases) { page in
                Text(page.rawValue)
                    .tag(page)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .frame(maxWidth: ReTurnDesign.Metrics.navigationRegularMaxWidth)
        .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
        .padding(.top, ReTurnDesign.Spacing.small)
        .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
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

        #if os(macOS)
        // macOS has no glass-morph presentation to work around, so the plain
        // SwiftUI menu stays until this screen gets its own macOS design.
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
        }
        .menuIndicator(.hidden)
        .buttonStyle(.plain)
        #endif

        let composerContent = HStack(
            alignment: .center,
            spacing: ReTurnDesign.Spacing.medium
        ) {
            #if os(iOS)
            // Laid out at the full touch target, then shrunk back to the glyph's
            // footprint: the button keeps hit testing the whole 44pt square while
            // the composer spaces it like a 30pt accessory.
            AttachmentMenuButton()
                .frame(
                    width: ReTurnDesign.Metrics.composerAccessoryHitSize,
                    height: ReTurnDesign.Metrics.composerAccessoryHitSize
                )
                .padding(-ReTurnDesign.Metrics.composerAccessoryHitPadding)
            #else
            attachmentMenu
            #endif

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

    #if os(macOS)
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
    #endif
}

#Preview {
    ContentView()
}
