import AVFAudio
import AVFoundation
import Foundation

@Observable
@MainActor
final class VoiceRecorder {
    struct Capture {
        let data: Data
        let filename: String
        let clientUUID: String
    }

    enum RecorderError: LocalizedError {
        case permissionDenied
        case recordingFailed

        var errorDescription: String? {
            switch self {
            case .permissionDenied: "Microphone access was not granted"
            case .recordingFailed: "Voice recording could not start"
            }
        }
    }

    private(set) var isRecording = false
    private var recorder: AVAudioRecorder?
    private var recordingURL: URL?
    private var clientUUID: String?
    private var startGeneration = 0

    func start() async throws {
        guard !isRecording else { return }
        startGeneration &+= 1
        let generation = startGeneration
        guard await requestPermission() else { throw RecorderError.permissionDenied }
        guard generation == startGeneration else { return }

        #if os(iOS)
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.record, mode: .spokenAudio)
        try session.setActive(true)
        #endif

        let uuid = UUID().uuidString
        let url = URL.temporaryDirectory.appending(path: "return-voice-\(uuid).m4a")
        let settings: [String: Any] = [
            AVFormatIDKey: Int(kAudioFormatMPEG4AAC),
            AVSampleRateKey: 44_100,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.high.rawValue,
        ]
        let recorder = try AVAudioRecorder(url: url, settings: settings)
        recorder.prepareToRecord()
        guard recorder.record() else { throw RecorderError.recordingFailed }
        self.recorder = recorder
        recordingURL = url
        clientUUID = uuid
        isRecording = true
    }

    func stop() throws -> Capture {
        guard let recorder, let recordingURL, let clientUUID else {
            throw RecorderError.recordingFailed
        }
        recorder.stop()
        clearRecordingState()
        defer { try? FileManager.default.removeItem(at: recordingURL) }
        return Capture(
            data: try Data(contentsOf: recordingURL),
            filename: recordingURL.lastPathComponent,
            clientUUID: clientUUID
        )
    }

    /// Abandons an active or permission-pending capture when the composer is
    /// no longer usable. Safe to call repeatedly from lifecycle callbacks.
    func cancel() {
        startGeneration &+= 1
        recorder?.stop()
        if let recordingURL {
            try? FileManager.default.removeItem(at: recordingURL)
        }
        clearRecordingState()
    }

    private func clearRecordingState() {
        isRecording = false
        recorder = nil
        recordingURL = nil
        clientUUID = nil
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false)
        #endif
    }

    private func requestPermission() async -> Bool {
        #if os(iOS)
        return await AVAudioApplication.requestRecordPermission()
        #else
        return await AVCaptureDevice.requestAccess(for: .audio)
        #endif
    }
}
