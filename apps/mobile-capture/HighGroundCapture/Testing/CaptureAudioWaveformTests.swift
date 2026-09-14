import AVFoundation
import Foundation

@main
enum CaptureAudioWaveformTests {
    static func main() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("quipsly-waveform-\(UUID())")
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let url = directory.appendingPathComponent("two-channel-source.wav")
        let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 2)!
        do {
            let file = try AVAudioFile(forWriting: url, settings: format.settings)
            let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 48_001)!
            buffer.frameLength = 48_001
            let channels = buffer.floatChannelData!
            for frame in 0..<48_001 {
                channels[0][frame] = 0
                channels[1][frame] = frame < 24_000 ? 0 : -0.75
            }
            channels[0][1_000] = 0.5
            try file.write(from: buffer)
        }
        let waveform = try CaptureAudioWaveform.read(url: url, pointLimit: 100)
        precondition(waveform.peaks.count <= 100)
        precondition(abs(waveform.duration - 48_001.0 / 48_000) < 0.00001)
        precondition(waveform.peak(at: 0) == 0, "Silence stays silent")
        precondition(waveform.peak(at: 0.021) == 0.5, "A short transient survives aggregation")
        precondition(waveform.peak(at: 0.8) == 0.75, "Negative samples and a second channel are included")
        precondition(waveform.peak(at: waveform.duration) == 0.75, "Partial final bin remains addressable")
        precondition(waveform.peak(at: .nan) == 0 && waveform.peak(at: -1) == 0)
        let minimum = try CaptureAudioWaveform.read(url: url, pointLimit: 0)
        let maximum = try CaptureAudioWaveform.read(url: url, pointLimit: .max)
        precondition(minimum.peaks.count == 1)
        precondition(maximum.peaks.count <= 16_384)

        do {
            _ = try CaptureAudioWaveform.read(url: directory.appendingPathComponent("missing.wav"))
            preconditionFailure("Unreadable sources must not produce invented peaks")
        } catch { }
        let cancelled = Task.detached { () throws -> CaptureAudioWaveform in
            // Cancellation is checked before opening a file and every bounded read.
            while !Task.isCancelled { await Task.yield() }
            return try CaptureAudioWaveform.read(url: url)
        }
        cancelled.cancel()
        do { _ = try await cancelled.value; preconditionFailure("Cancelled decode must stop") }
        catch is CancellationError { }

        let window = CaptureWaveformWindow(duration: 20, zoom: 2, center: 8)
        precondition(window.start == 3 && window.end == 13)
        precondition(window.sourceRange(programStart: 12, programEnd: 28, offset: 10) == 3...13)
        precondition(window.sourceRange(programStart: 15, programEnd: 17, offset: 10) == 5...7)
        precondition(window.sourceRange(programStart: 30, programEnd: 40, offset: 10) == nil)
        precondition(window.sourceRange(programStart: .nan, programEnd: 10, offset: 0) == nil)
        for duration in [0.0, 0.001, 20, 7_200, .nan, .infinity] {
            for zoom in [0.0, 1, 2, 16, 99, .nan] {
                for center in [-10.0, 0, 30, 99_999, .nan] {
                    let view = CaptureWaveformWindow(duration: duration, zoom: zoom, center: center)
                    precondition(view.start.isFinite && view.end.isFinite)
                    precondition(view.start >= 0 && view.end >= view.start && view.end <= view.duration + 0.00001)
                }
            }
        }
        print("PASS waveform: real stereo PCM, quiet/negative/transient samples, bounded decoding, cancellation, exact source clock and zoom bounds")
    }
}
