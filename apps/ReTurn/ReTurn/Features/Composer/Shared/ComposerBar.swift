import SwiftUI
import UniformTypeIdentifiers

/// Owns the draft text so typing invalidates only the composer. Holding it on
/// `ContentView` rebuilt the pager, its pages and the mascot on every keystroke.
struct ComposerBar: View {
    @FocusState.Binding var isFocused: Bool
    let isActive: Bool
    @Environment(ChatStore.self) private var chat: ChatStore
    @Environment(APIEnvironment.self) private var api: APIEnvironment
    @Environment(NodesStore.self) private var nodes: NodesStore
    @State private var text = ""
    @State private var recorder = VoiceRecorder()
    @State private var isImportingImage = false
    @State private var isImportingFile = false
    @State private var errorMessage = ""
    @State private var isShowingError = false

    init(isFocused: FocusState<Bool>.Binding, isActive: Bool = true) {
        _isFocused = isFocused
        self.isActive = isActive
    }

    private var trimmedText: String {
        text.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func send() {
        guard !trimmedText.isEmpty, !chat.isSending else { return }
        let outgoing = trimmedText
        text = ""
        isFocused = false
        if api.isConnected {
            Task { await chat.send(outgoing) }
        } else {
            // Offline: PRD §5.2 allows node writes only — queue as idea, flush later.
            Task {
                _ = await nodes.enqueue(kind: .idea, content: outgoing, title: "Offline note")
            }
        }
    }

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
                .onSubmit(send)
                .disabled(chat.isSending)

            composerAction
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
            .fileImporter(
                isPresented: $isImportingImage,
                allowedContentTypes: [.image]
            ) { result in
                handleImage(result)
            }
            .fileImporter(
                isPresented: $isImportingFile,
                allowedContentTypes: [.plainText, .image]
            ) { result in
                handleFile(result)
            }
            .alert("Couldn't add attachment", isPresented: $isShowingError) {
            } message: {
                Text(errorMessage)
            }
            .onChange(of: isActive) { _, isActive in
                if !isActive {
                    recorder.cancel()
                }
            }
            .onDisappear {
                recorder.cancel()
            }
    }

    @ViewBuilder
    private var composerAction: some View {
        if chat.isSending {
            ProgressView()
                .controlSize(.small)
                .frame(
                    width: ReTurnDesign.Metrics.composerAccessorySize,
                    height: ReTurnDesign.Metrics.composerAccessorySize
                )
        } else if trimmedText.isEmpty {
            Button(
                recorder.isRecording ? "Stop recording" : "Record voice",
                systemImage: recorder.isRecording ? "stop.fill" : "waveform.mid"
            ) {
                toggleRecording()
            }
            .labelStyle(.iconOnly)
            .foregroundStyle(ReTurnDesign.Colors.voiceButtonForeground)
            .frame(
                width: ReTurnDesign.Metrics.composerAccessorySize,
                height: ReTurnDesign.Metrics.composerAccessorySize
            )
            .background(
                recorder.isRecording ? Color.red : ReTurnDesign.Colors.voiceButtonBackground,
                in: Circle()
            )
            .buttonStyle(.plain)
            .disabled(!api.isConnected)
        } else {
            Button("Send", systemImage: "arrow.up", action: send)
                .labelStyle(.iconOnly)
                .foregroundStyle(ReTurnDesign.Colors.voiceButtonForeground)
                .frame(
                    width: ReTurnDesign.Metrics.composerAccessorySize,
                    height: ReTurnDesign.Metrics.composerAccessorySize
                )
                .background(ReTurnDesign.Colors.voiceButtonBackground, in: Circle())
                .buttonStyle(.plain)
        }
    }

    @ViewBuilder
    private var attachmentMenuItems: some View {
        ControlGroup {
            Button("Image", systemImage: "photo") {
                isImportingImage = true
            }

            Button("Files", systemImage: "folder") {
                isImportingFile = true
            }
        }
        .disabled(!api.isConnected)
    }

    private func toggleRecording() {
        Task {
            do {
                if recorder.isRecording {
                    let capture = try recorder.stop()
                    await chat.sendVoice(capture)
                } else {
                    try await recorder.start()
                }
            } catch {
                show(error)
            }
        }
    }

    private func handleImage(_ result: Result<URL, Error>) {
        Task {
            do {
                let url = try result.get()
                let data = try readSecurityScoped(url)
                let image = try ImageAttachment.dataURL(from: data)
                let note = trimmedText.isEmpty ? nil : trimmedText
                text = ""
                isFocused = false
                await chat.sendImage(image, note: note)
            } catch {
                show(error)
            }
        }
    }

    private func handleFile(_ result: Result<URL, Error>) {
        Task {
            do {
                let url = try result.get()
                let data = try readSecurityScoped(url)
                if let type = try? url.resourceValues(forKeys: [.contentTypeKey]).contentType,
                   type.conforms(to: .image) {
                    let image = try ImageAttachment.dataURL(from: data)
                    await chat.sendImage(image, note: trimmedText.isEmpty ? nil : trimmedText)
                } else {
                    guard let contents = String(data: data, encoding: .utf8) else {
                        throw CocoaError(.fileReadInapplicableStringEncoding)
                    }
                    let combined = [trimmedText, contents]
                        .filter { !$0.isEmpty }
                        .joined(separator: "\n\n")
                    await chat.send(String(combined.prefix(8_000)))
                }
                text = ""
                isFocused = false
            } catch {
                show(error)
            }
        }
    }

    private func readSecurityScoped(_ url: URL) throws -> Data {
        let didStart = url.startAccessingSecurityScopedResource()
        defer {
            if didStart { url.stopAccessingSecurityScopedResource() }
        }
        return try Data(contentsOf: url)
    }

    private func show(_ error: Error) {
        errorMessage = error.localizedDescription
        isShowingError = true
    }
}
