import AVFAudio
import Accelerate
import SwiftUI

struct AudioDetailEnvelopePoint: Sendable {
    let rmsDbfs: Double
    let peakDbfs: Double
}

struct AudioDetailEnvelope: Sendable {
    let points: [AudioDetailEnvelopePoint]
    let spectrum: AudioDetailSpectrum
    let startSeconds: Double
    let durationSeconds: Double
}

struct AudioDetailSpectrum: Sendable {
    let columnCount: Int
    let bandCount: Int
    let intensities: [Float]

    static let empty = AudioDetailSpectrum(columnCount: 0, bandCount: 0, intensities: [])
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
            return AudioDetailEnvelope(points: [], spectrum: .empty, startSeconds: request.startSeconds, durationSeconds: request.durationSeconds)
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
            return AudioDetailEnvelope(points: [], spectrum: .empty, startSeconds: request.startSeconds, durationSeconds: request.durationSeconds)
        }

        var monoSamples = [Float](repeating: 0, count: frameCount)
        for frameIndex in 0..<frameCount {
            var mixedSample: Float = 0
            for channelIndex in 0..<channelCount {
                mixedSample += channels[channelIndex][frameIndex]
            }
            monoSamples[frameIndex] = mixedSample / Float(channelCount)
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
                let mixedSample = monoSamples[frameIndex]
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
            spectrum: makeSpectrum(
                samples: monoSamples,
                sampleRate: sampleRate,
                requestedColumns: min(max(request.pointCount / 8, 64), 160),
                bandCount: 32
            ),
            startSeconds: request.startSeconds,
            durationSeconds: request.durationSeconds
        )
    }

    private nonisolated static func makeSpectrum(
        samples: [Float],
        sampleRate: Double,
        requestedColumns: Int,
        bandCount: Int
    ) -> AudioDetailSpectrum {
        let fftSize = 2_048
        let halfFFT = fftSize / 2
        let log2n = vDSP_Length(log2(Double(fftSize)))
        guard !samples.isEmpty,
              sampleRate > 0,
              requestedColumns > 0,
              bandCount > 0,
              let setup = vDSP_create_fftsetup(log2n, FFTRadix(kFFTRadix2)) else {
            return .empty
        }
        defer { vDSP_destroy_fftsetup(setup) }

        var hann = [Float](repeating: 0, count: fftSize)
        vDSP_hann_window(&hann, vDSP_Length(fftSize), Int32(vDSP_HANN_NORM))
        var windowed = [Float](repeating: 0, count: fftSize)
        var real = [Float](repeating: 0, count: halfFFT)
        var imaginary = [Float](repeating: 0, count: halfFFT)
        var powers = [Float](repeating: 0, count: halfFFT)
        var intensities = [Float]()
        intensities.reserveCapacity(requestedColumns * bandCount)
        let lastStart = max(samples.count - fftSize, 0)
        let nyquist = sampleRate / 2
        let lowestFrequency = 55.0
        let highestFrequency = min(18_000.0, nyquist)

        for column in 0..<requestedColumns {
            let fraction = requestedColumns > 1 ? Double(column) / Double(requestedColumns - 1) : 0
            let start = Int((Double(lastStart) * fraction).rounded())
            windowed.withUnsafeMutableBufferPointer { target in
                target.initialize(repeating: 0)
                let copyCount = min(fftSize, samples.count - start)
                guard copyCount > 0 else { return }
                samples.withUnsafeBufferPointer { source in
                    target.baseAddress?.update(from: source.baseAddress! + start, count: copyCount)
                }
            }
            vDSP_vmul(windowed, 1, hann, 1, &windowed, 1, vDSP_Length(fftSize))

            real.withUnsafeMutableBufferPointer { realBuffer in
                imaginary.withUnsafeMutableBufferPointer { imaginaryBuffer in
                    var split = DSPSplitComplex(
                        realp: realBuffer.baseAddress!,
                        imagp: imaginaryBuffer.baseAddress!
                    )
                    windowed.withUnsafeBufferPointer { input in
                        input.baseAddress!.withMemoryRebound(to: DSPComplex.self, capacity: halfFFT) { complexInput in
                            vDSP_ctoz(complexInput, 2, &split, 1, vDSP_Length(halfFFT))
                        }
                    }
                    vDSP_fft_zrip(setup, &split, 1, log2n, FFTDirection(kFFTDirection_Forward))
                    vDSP_zvmags(&split, 1, &powers, 1, vDSP_Length(halfFFT))
                }
            }

            var powerScale = Float(4.0 / Double(fftSize * fftSize))
            vDSP_vsmul(powers, 1, &powerScale, &powers, 1, vDSP_Length(halfFFT))

            for band in 0..<bandCount {
                let lowFraction = Double(band) / Double(bandCount)
                let highFraction = Double(band + 1) / Double(bandCount)
                let lowFrequency = lowestFrequency * pow(highestFrequency / lowestFrequency, lowFraction)
                let highFrequency = lowestFrequency * pow(highestFrequency / lowestFrequency, highFraction)
                let lowBin = min(max(Int(lowFrequency * Double(fftSize) / sampleRate), 1), halfFFT - 1)
                let highBin = min(max(Int(highFrequency * Double(fftSize) / sampleRate), lowBin + 1), halfFFT)
                let bandPower = powers[lowBin..<highBin].reduce(0, +) / Float(max(highBin - lowBin, 1))
                let db = 10 * log10(max(Double(bandPower), 1e-12))
                intensities.append(Float(min(max((db + 90) / 90, 0), 1)))
            }
        }

        return AudioDetailSpectrum(
            columnCount: requestedColumns,
            bandCount: bandCount,
            intensities: intensities
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
                drawSpectrum(envelope.spectrum, context: context, size: size)
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

    private func drawSpectrum(_ spectrum: AudioDetailSpectrum, context: GraphicsContext, size: CGSize) {
        guard spectrum.columnCount > 0,
              spectrum.bandCount > 0,
              spectrum.intensities.count == spectrum.columnCount * spectrum.bandCount else { return }
        let cellWidth = size.width / CGFloat(spectrum.columnCount)
        let cellHeight = size.height / CGFloat(spectrum.bandCount)

        for column in 0..<spectrum.columnCount {
            for band in 0..<spectrum.bandCount {
                let intensity = Double(spectrum.intensities[column * spectrum.bandCount + band])
                guard intensity > 0.08 else { continue }
                let y = size.height - CGFloat(band + 1) * cellHeight
                let rect = CGRect(
                    x: CGFloat(column) * cellWidth,
                    y: y,
                    width: max(cellWidth + 0.5, 1),
                    height: max(cellHeight + 0.5, 1)
                )
                context.fill(
                    Path(rect),
                    with: .color(spectrumColor(band: band, bandCount: spectrum.bandCount).opacity(min(intensity * 0.42, 0.42)))
                )
            }
        }
    }

    private func spectrumColor(band: Int, bandCount: Int) -> Color {
        let fraction = Double(band) / Double(max(bandCount - 1, 1))
        if fraction < 0.30 { return QuipslyStudioTheme.moss }
        if fraction < 0.68 { return QuipslyStudioTheme.honey }
        return QuipslyStudioTheme.creekMist
    }
}
