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

    var body: some View {
        ZStack {
            ReTurnDesign.Colors.screenBackground
                .ignoresSafeArea()

            GeometryReader { geometry in
                ScrollView(.horizontal) {
                    LazyHStack(spacing: 0) {
                        ForEach(TimelinePage.allCases) { page in
                            pageContent(for: page)
                                .frame(
                                    width: geometry.size.width,
                                    height: geometry.size.height
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
            pagePicker
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            composer
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
        .frame(maxWidth: ReTurnDesign.Metrics.navigationMaxWidth)
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
            nowPage
        }
    }

    private var nowPage: some View {
        VStack(spacing: ReTurnDesign.Spacing.medium) {
            Image("Kongkong")
                .resizable()
                .scaledToFit()
                .frame(
                    width: ReTurnDesign.Metrics.mascotWidth,
                    height: ReTurnDesign.Metrics.mascotHeight
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

    private var composer: some View {
        HStack(spacing: ReTurnDesign.Spacing.medium) {
            Image(systemName: "plus")
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .accessibilityHidden(true)

            TextField("Ask Return Anything", text: $composerText)
                .font(ReTurnDesign.Typography.composer)
                .textFieldStyle(.plain)
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)

            Image(systemName: "waveform.mid")
                .foregroundStyle(ReTurnDesign.Colors.primaryLabel)
                .frame(
                    width: ReTurnDesign.Metrics.waveformButtonSize,
                    height: ReTurnDesign.Metrics.waveformButtonSize
                )
                .background(ReTurnDesign.Colors.waveformFill, in: Circle())
                .accessibilityHidden(true)
        }
        .padding(.horizontal, ReTurnDesign.Metrics.composerHorizontalInset)
        .frame(
            maxWidth: .infinity,
            minHeight: ReTurnDesign.Metrics.composerHeight
        )
        .frame(maxWidth: ReTurnDesign.Metrics.composerMaxWidth)
        .background(.ultraThinMaterial, in: Capsule())
        .shadow(
            color: ReTurnDesign.Colors.composerShadow,
            radius: ReTurnDesign.Metrics.composerShadowRadius,
            y: ReTurnDesign.Metrics.composerShadowY
        )
        .padding(.horizontal, ReTurnDesign.Metrics.screenHorizontalInset)
        .padding(.top, ReTurnDesign.Spacing.medium)
        .padding(.bottom, ReTurnDesign.Spacing.medium)
    }
}

#Preview {
    ContentView()
}
