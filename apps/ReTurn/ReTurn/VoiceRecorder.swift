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

    func start() async throws {
        guard !isRecording else { return }
        guard await requestPermission() else { throw RecorderError.permissionDenied }

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
        isRecording = false
        self.recorder = nil
        self.recordingURL = nil
        self.clientUUID = nil
        #if os(iOS)
        try? AVAudioSession.sharedInstance().setActive(false)
        #endif
        return Capture(
            data: try Data(contentsOf: recordingURL),
            filename: recordingURL.lastPathComponent,
            clientUUID: clientUUID
        )
    }

    private func requestPermission() async -> Bool {
        #if os(iOS)
        return await AVAudioApplication.requestRecordPermission()
        #else
        return await AVCaptureDevice.requestAccess(for: .audio)
        #endif
    }
}
