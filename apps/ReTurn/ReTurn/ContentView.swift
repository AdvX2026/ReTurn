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
    @State private var composerText = ""
    @FocusState private var isComposerFocused: Bool

    var body: some View {
        GeometryReader { container in
            let timelineContent = ZStack {
                ReTurnDesign.Colors.screenBackground
                    .ignoresSafeArea()

                GeometryReader { pageGeometry in
                    ScrollView(.horizontal) {
                        LazyHStack(spacing: 0) {
                            ForEach(TimelinePage.allCases) { page in
                                pageContent(
                                    for: page,
                                    containerWidth: container.size.width
                                )
                                .frame(
                                    width: pageGeometry.size.width,
                                    height: pageGeometry.size.height
                                )
                                .id(page)
                            }
                        }
                        .scrollTargetLayout()
                    }
                    .scrollIndicators(.hidden)
                    .scrollTargetBehavior(.paging)
                    .scrollPosition(id: $selectedPage)
                }
            }
            .safeAreaInset(edge: .top, spacing: 0) {
                pagePicker(containerWidth: container.size.width)
            }

            Group {
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
                composer(containerWidth: container.size.width)
            }
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

    private func pagePicker(containerWidth: CGFloat) -> some View {
        Picker("Timeline", selection: pageSelection) {
            ForEach(TimelinePage.allCases) { page in
                Text(page.rawValue)
                    .tag(page)
            }
        }
        .pickerStyle(.segmented)
        .labelsHidden()
        .frame(width: ReTurnDesign.Layout.navigationWidth(in: containerWidth))
        .padding(.top, ReTurnDesign.Spacing.small)
        .padding(.bottom, ReTurnDesign.Spacing.extraSmall)
    }

    @ViewBuilder
    private func pageContent(
        for page: TimelinePage,
        containerWidth: CGFloat
    ) -> some View {
        switch page {
        case .before, .after:
            Color.clear
        case .now:
            nowPage(containerWidth: containerWidth)
        }
    }

    private func nowPage(containerWidth: CGFloat) -> some View {
        let mascotWidth = ReTurnDesign.Layout.mascotWidth(in: containerWidth)

        return VStack(spacing: ReTurnDesign.Spacing.medium) {
            Image("Kongkong")
                .resizable()
                .scaledToFit()
                .frame(
                    width: mascotWidth,
                    height: mascotWidth / ReTurnDesign.Metrics.mascotAspectRatio
                )
                .accessibilityHidden(true)

            Text("Teethe is back!")
                .font(ReTurnDesign.Typography.heroTitle)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding(.bottom, ReTurnDesign.Metrics.heroOpticalLift * 2)
    }

    private func composer(containerWidth: CGFloat) -> some View {
        let composerShape = RoundedRectangle(
            cornerRadius: ReTurnDesign.Metrics.composerCornerRadius,
            style: .continuous
        )
        let addButtonLabel = Label("Add", systemImage: "plus")
            .labelStyle(.iconOnly)
            .font(.title2)
            .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
        let attachmentMenu = Menu {
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
        } label: {
            #if os(iOS)
            addButtonLabel
                .opacity(0.001)
            #else
            addButtonLabel
            #endif
        }
        .menuIndicator(.hidden)
        .buttonBorderShape(.circle)
        .clipShape(Circle())
        let composerContent = HStack(
            alignment: .center,
            spacing: ReTurnDesign.Spacing.medium
        ) {
            #if os(iOS)
            addButtonLabel
                .accessibilityHidden(true)
            #else
            attachmentMenu
            #endif

            TextField("Ask Return Anything", text: $composerText, axis: .vertical)
                .font(ReTurnDesign.Typography.composer)
                .textFieldStyle(.plain)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .lineLimit(1...ReTurnDesign.Metrics.composerMaximumLineCount)
                .focused($isComposerFocused)

            Image(systemName: composerText.isEmpty ? "waveform.mid" : "arrow.up")
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
            width: ReTurnDesign.Layout.composerWidth(
                in: containerWidth,
                isFocused: isComposerFocused
            )
        )
        .frame(
            minHeight: isComposerFocused
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
        .overlay(alignment: .leading) {
            attachmentMenu
                .padding(.leading, ReTurnDesign.Metrics.composerHorizontalInset)
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
                value: isComposerFocused
            )
            .padding(.top, ReTurnDesign.Spacing.medium)
            .padding(.bottom, ReTurnDesign.Spacing.medium)
    }
}

#Preview {
    ContentView()
}
