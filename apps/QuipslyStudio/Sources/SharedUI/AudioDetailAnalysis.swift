import AVFAudio
import SwiftUI

struct AudioDetailEnvelopePoint: Sendable {
    let rmsDbfs: Double
    let peakDbfs: Double
}

struct AudioDetailEnvelope: Sendable {
    let points: [AudioDetailEnvelopePoint]
    let startSeconds: Double
    let durationSeconds: Double
}

private struct AudioDetailRequest: Hashable, Sendable {
    let path: String
    let startMilliseconds: Int
    let durationMilliseconds: Int
    let pointCount: Int

    init(path: String, startSeconds: Double, durationSeconds: Double, pointCount: Int) {
        self.path = path
        self.startMilliseconds = Int((startSeconds * 1_000).rounded())
        self.durationMilliseconds = Int((durationSeconds * 1_000).rounded())
        self.pointCount = pointCount
    }

    var startSeconds: Double { Double(startMilliseconds) / 1_000 }
    var durationSeconds: Double { Double(durationMilliseconds) / 1_000 }
}

actor AudioDetailAnalysisCache {
    static let shared = AudioDetailAnalysisCache()

    private var envelopes: [AudioDetailRequest: AudioDetailEnvelope] = [:]
    private var order: [AudioDetailRequest] = []
    private let capacity = 48

    func envelope(
        path: String,
        startSeconds: Double,
        durationSeconds: Double,
        pointCount: Int
    ) async throws -> AudioDetailEnvelope {
        let request = AudioDetailRequest(
            path: path,
            startSeconds: startSeconds,
            durationSeconds: durationSeconds,
            pointCount: max(pointCount, 64)
        )
        if let cached = envelopes[request] {
            return cached
        }

        let envelope = try await Task.detached(priority: .utility) {
            try Self.readEnvelope(request: request)
        }.value
        envelopes[request] = envelope
        order.append(request)
        while order.count > capacity {
            let expired = order.removeFirst()
            envelopes.removeValue(forKey: expired)
        }
        return envelope
    }

    private nonisolated static func readEnvelope(request: AudioDetailRequest) throws -> AudioDetailEnvelope {
        let url = URL(fileURLWithPath: request.path)
        let file = try AVAudioFile(
            forReading: url,
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        )
        let sampleRate = file.processingFormat.sampleRate
        let requestedStartFrame = AVAudioFramePosition(max(request.startSeconds, 0) * sampleRate)
        let availableFrames = max(file.length - requestedStartFrame, 0)
        let requestedFrames = AVAudioFramePosition(max(request.durationSeconds, 0.01) * sampleRate)
        let framesToRead = min(availableFrames, requestedFrames)
        guard framesToRead > 0 else {
            return AudioDetailEnvelope(points: [], startSeconds: request.startSeconds, durationSeconds: request.durationSeconds)
        }

        file.framePosition = requestedStartFrame
        let frameCapacity = AVAudioFrameCount(min(framesToRead, AVAudioFramePosition(UInt32.max)))
        guard let buffer = AVAudioPCMBuffer(pcmFormat: file.processingFormat, frameCapacity: frameCapacity) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        try file.read(into: buffer, frameCount: frameCapacity)
        let frameCount = Int(buffer.frameLength)
        let channelCount = Int(buffer.format.channelCount)
        guard frameCount > 0, channelCount > 0, let channels = buffer.floatChannelData else {
            return AudioDetailEnvelope(points: [], startSeconds: request.startSeconds, durationSeconds: request.durationSeconds)
        }

        let pointCount = min(max(request.pointCount, 64), frameCount)
        let framesPerPoint = max(Double(frameCount) / Double(pointCount), 1)
        var points: [AudioDetailEnvelopePoint] = []
        points.reserveCapacity(pointCount)

        for pointIndex in 0..<pointCount {
            let startFrame = min(Int(Double(pointIndex) * framesPerPoint), frameCount - 1)
            let endFrame = min(max(Int(Double(pointIndex + 1) * framesPerPoint), startFrame + 1), frameCount)
            var peak: Float = 0
            var sumSquares: Double = 0
            var sampleCount = 0

            for frameIndex in startFrame..<endFrame {
                var mixedSample: Float = 0
                for channelIndex in 0..<channelCount {
                    mixedSample += channels[channelIndex][frameIndex]
                }
                mixedSample /= Float(channelCount)
                peak = max(peak, abs(mixedSample))
                sumSquares += Double(mixedSample * mixedSample)
                sampleCount += 1
            }

            let rms = sampleCount > 0 ? sqrt(sumSquares / Double(sampleCount)) : 0
            points.append(
                AudioDetailEnvelopePoint(
                    rmsDbfs: decibels(amplitude: rms),
                    peakDbfs: decibels(amplitude: Double(peak))
                )
            )
        }

        return AudioDetailEnvelope(
            points: points,
            startSeconds: request.startSeconds,
            durationSeconds: request.durationSeconds
        )
    }

    private nonisolated static func decibels(amplitude: Double) -> Double {
        guard amplitude > 0 else { return -96 }
        return max(20 * log10(amplitude), -96)
    }
}

struct ProAudioHighResolutionEnvelope: View {
    let path: String
    let tint: Color
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let waveformGain: CGFloat

    @State private var envelope: AudioDetailEnvelope?

    private var requestKey: String {
        let start = Int((visibleStartSeconds * 1_000).rounded())
        let duration = Int((visibleDurationSeconds * 1_000).rounded())
        return "\(path)|\(start)|\(duration)"
    }

    var body: some View {
        GeometryReader { proxy in
            Canvas { context, size in
                guard let envelope, !envelope.points.isEmpty else { return }
                let centerY = size.height / 2
                let width = max(size.width / CGFloat(envelope.points.count), 1)
                for (index, point) in envelope.points.enumerated() {
                    let x = CGFloat(index) * width
                    let rmsHeight = max(1.5, normalized(point.rmsDbfs, floor: -72) * size.height * 0.78)
                    let peakHeight = max(rmsHeight + 1, normalized(point.peakDbfs, floor: -60) * size.height * 0.92)
                    let peakRect = CGRect(x: x, y: centerY - peakHeight / 2, width: max(width * 0.86, 1), height: peakHeight)
                    let rmsRect = CGRect(x: x, y: centerY - rmsHeight / 2, width: max(width * 0.86, 1), height: rmsHeight)
                    context.fill(Path(peakRect), with: .color(tint.opacity(0.24)))
                    context.fill(Path(rmsRect), with: .color(tint.opacity(0.92)))
                    if point.peakDbfs > -1 {
                        context.fill(
                            Path(CGRect(x: x, y: 1, width: max(width * 0.86, 1), height: 5)),
                            with: .color(QuipslyStudioTheme.clay)
                        )
                    } else if point.peakDbfs > -3 {
                        context.fill(
                            Path(CGRect(x: x, y: 2, width: max(width * 0.86, 1), height: 3)),
                            with: .color(QuipslyStudioTheme.honey)
                        )
                    }
                }
            }
            .task(id: "\(requestKey)|\(Int(proxy.size.width.rounded()))") {
                envelope = try? await AudioDetailAnalysisCache.shared.envelope(
                    path: path,
                    startSeconds: visibleStartSeconds,
                    durationSeconds: visibleDurationSeconds,
                    pointCount: max(Int(proxy.size.width.rounded()), 128)
                )
            }
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private func normalized(_ dbfs: Double, floor: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.01 }
        let clamped = min(0, max(floor, dbfs))
        return min(CGFloat((clamped - floor) / -floor) * max(waveformGain, 0.1), 1)
    }
}
