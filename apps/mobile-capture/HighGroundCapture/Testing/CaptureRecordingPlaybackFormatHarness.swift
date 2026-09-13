import AVFoundation
import Foundation

@main
struct CaptureRecordingPlaybackFormatHarness {
    static func main() async throws {
        precondition(CaptureRecordingPlaybackFormat.fileExtension(fileName: "source.CAF", isVideo: false) == "caf")
        precondition(CaptureRecordingPlaybackFormat.fileExtension(fileName: "camera.MOV", isVideo: true) == "mov")
        precondition(CaptureRecordingPlaybackFormat.fileExtension(fileName: "voice.wav", isVideo: false) == "wav")
        precondition(CaptureRecordingPlaybackFormat.fileExtension(fileName: "unknown.bad", isVideo: false) == "m4a")
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("capture-playback-format-\(UUID().uuidString)")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let original = directory.appendingPathComponent("recording.caf")
        let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1)!
        let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48_000)!
        buffer.frameLength = 48_000
        buffer.floatChannelData![0].initialize(repeating: 0, count: 48_000)
        do {
            let writer = try AVAudioFile(forWriting: original, settings: format.settings)
            try writer.write(from: buffer)
        }
        let cached = directory.appendingPathComponent("source.\(CaptureRecordingPlaybackFormat.fileExtension(fileName: original.lastPathComponent, isVideo: false))")
        try FileManager.default.copyItem(at: original, to: cached)
        let originalBytes = try Data(contentsOf: original)
        let cachedBytes = try Data(contentsOf: cached)
        precondition(originalBytes == cachedBytes)
        let asset = AVURLAsset(url: cached)
        let playable = try await asset.load(.isPlayable)
        let duration = try await asset.load(.duration).seconds
        precondition(playable && abs(duration - 1) < 0.01)
        print("PASS protected native CAF playback: immutable bytes, correct container extension, AVFoundation duration and playability")
    }
}
