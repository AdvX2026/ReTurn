import SwiftUI

/// Owns the draft text so typing invalidates only the composer. Holding it on
/// `HomeTimelineView` would rebuild the pager, its pages and the mascot on every keystroke.
struct ComposerBar: View {
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
