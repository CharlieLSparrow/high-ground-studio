import Accelerate
import AVFoundation
import Foundation

/// A bounded projection of a verified local source, never another media asset.
struct CaptureAudioWaveform: Sendable {
    let duration: TimeInterval
    let secondsPerPeak: TimeInterval
    let peaks: [Float]

    static func read(url: URL, pointLimit: Int = 8_192) throws -> Self {
        try Task.checkCancellation()
        let file = try AVAudioFile(forReading: url, commonFormat: .pcmFormatFloat32, interleaved: false)
        let format = file.processingFormat
        guard file.length > 0, format.sampleRate.isFinite, format.sampleRate > 0,
              format.channelCount > 0,
              let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 16_384) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let count = min(max(pointLimit, 1), 16_384, Int(min(file.length, 16_384)))
        let framesPerPoint = max(1, Int64(ceil(Double(file.length) / Double(count))))
        var peaks = [Float](repeating: 0, count: Int((file.length + framesPerPoint - 1) / framesPerPoint))
        var consumed: Int64 = 0
        while consumed < file.length {
            try Task.checkCancellation()
            try file.read(into: buffer, frameCount: AVAudioFrameCount(min(16_384, file.length - consumed)))
            guard buffer.frameLength > 0, let channels = buffer.floatChannelData else {
                throw CocoaError(.fileReadCorruptFile)
            }
            var cursor = 0
            while cursor < Int(buffer.frameLength) {
                let frame = consumed + Int64(cursor)
                let index = Int(frame / framesPerPoint)
                let length = min(Int(buffer.frameLength) - cursor, Int(framesPerPoint - frame % framesPerPoint))
                for channel in 0..<Int(format.channelCount) {
                    var peak: Float = 0
                    vDSP_maxmgv(channels[channel].advanced(by: cursor), 1, &peak, vDSP_Length(length))
                    if peak.isFinite { peaks[index] = max(peaks[index], min(1, peak)) }
                }
                cursor += length
            }
            consumed += Int64(buffer.frameLength)
        }
        return Self(duration: Double(file.length) / format.sampleRate,
                    secondsPerPeak: Double(framesPerPoint) / format.sampleRate, peaks: peaks)
    }

    /// The final bin may be shorter. Its position must not stretch earlier bins.
    func peak(at seconds: TimeInterval) -> Float {
        guard duration > 0, secondsPerPeak > 0, seconds.isFinite, seconds >= 0, seconds <= duration, !peaks.isEmpty else { return 0 }
        return peaks[min(peaks.count - 1, Int(seconds / secondsPerPeak))]
    }
}

/// Presentation-only source clock geometry. The edit remains in session time.
struct CaptureWaveformWindow: Equatable {
    let duration: TimeInterval
    let start: TimeInterval
    let end: TimeInterval
    var length: TimeInterval { end - start }

    init(duration: TimeInterval, zoom: Double, center: TimeInterval) {
        self.duration = duration.isFinite ? max(0, duration) : 0
        let scale = zoom.isFinite ? min(16, max(1, zoom)) : 1
        let span = self.duration / scale
        let safeCenter = center.isFinite ? center : 0
        start = min(max(0, safeCenter - span / 2), max(0, self.duration - span))
        end = start + span
    }

    func sourceRange(programStart: TimeInterval, programEnd: TimeInterval, offset: TimeInterval) -> ClosedRange<Double>? {
        guard programStart.isFinite, programEnd.isFinite, offset.isFinite, programEnd > programStart else { return nil }
        let lower = max(start, programStart - offset)
        let upper = min(end, programEnd - offset)
        return upper > lower ? lower...upper : nil
    }
}
