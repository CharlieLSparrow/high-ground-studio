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
    let diagnostics: AudioDetailDiagnostics
    let startSeconds: Double
    let durationSeconds: Double
}

struct AudioDetailDiagnostics: Sendable {
    let sampleRate: Double
    let channelCount: Int
    let rmsDbfs: Double
    let peakDbfs: Double
    let crestDb: Double
    let dcOffsetDbfs: Double
    let stereoCorrelation: Double?
    let clippedSampleCount: Int

    static let empty = AudioDetailDiagnostics(
        sampleRate: 0,
        channelCount: 0,
        rmsDbfs: -96,
        peakDbfs: -96,
        crestDb: 0,
        dcOffsetDbfs: -96,
        stereoCorrelation: nil,
        clippedSampleCount: 0
    )
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
            return AudioDetailEnvelope(points: [], spectrum: .empty, diagnostics: .empty, startSeconds: request.startSeconds, durationSeconds: request.durationSeconds)
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
            return AudioDetailEnvelope(points: [], spectrum: .empty, diagnostics: .empty, startSeconds: request.startSeconds, durationSeconds: request.durationSeconds)
        }

        var monoSamples = [Float](repeating: 0, count: frameCount)
        var sum: Double = 0
        var sumSquares: Double = 0
        var peak: Double = 0
        var clippedSampleCount = 0
        var leftSum: Double = 0
        var rightSum: Double = 0
        var leftSquares: Double = 0
        var rightSquares: Double = 0
        var crossSum: Double = 0
        for frameIndex in 0..<frameCount {
            var mixedSample: Float = 0
            for channelIndex in 0..<channelCount {
                mixedSample += channels[channelIndex][frameIndex]
            }
            let monoSample = mixedSample / Float(channelCount)
            monoSamples[frameIndex] = monoSample
            let sample = Double(monoSample)
            sum += sample
            sumSquares += sample * sample
            peak = max(peak, abs(sample))
            if abs(sample) >= 0.999 { clippedSampleCount += 1 }

            let left = Double(channels[0][frameIndex])
            let right = Double(channels[min(1, channelCount - 1)][frameIndex])
            leftSum += left
            rightSum += right
            leftSquares += left * left
            rightSquares += right * right
            crossSum += left * right
        }

        let sampleCount = Double(frameCount)
        let rms = sqrt(sumSquares / max(sampleCount, 1))
        let rmsDbfs = decibels(amplitude: rms)
        let peakDbfs = decibels(amplitude: peak)
        let leftVariance = max(sampleCount * leftSquares - leftSum * leftSum, 0)
        let rightVariance = max(sampleCount * rightSquares - rightSum * rightSum, 0)
        let correlationDenominator = sqrt(leftVariance * rightVariance)
        let stereoCorrelation = channelCount > 1 && correlationDenominator > 1e-12
            ? min(max((sampleCount * crossSum - leftSum * rightSum) / correlationDenominator, -1), 1)
            : nil
        let diagnostics = AudioDetailDiagnostics(
            sampleRate: sampleRate,
            channelCount: channelCount,
            rmsDbfs: rmsDbfs,
            peakDbfs: peakDbfs,
            crestDb: max(peakDbfs - rmsDbfs, 0),
            dcOffsetDbfs: decibels(amplitude: abs(sum / max(sampleCount, 1))),
            stereoCorrelation: stereoCorrelation,
            clippedSampleCount: clippedSampleCount
        )

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
                visibleDurationSeconds: request.durationSeconds,
                requestedColumns: min(max(request.pointCount / 6, 96), request.durationSeconds <= 2 ? 240 : 180),
                bandCount: request.durationSeconds <= 2 ? 64 : 48
            ),
            diagnostics: diagnostics,
            startSeconds: request.startSeconds,
            durationSeconds: request.durationSeconds
        )
    }

    private nonisolated static func makeSpectrum(
        samples: [Float],
        sampleRate: Double,
        visibleDurationSeconds: Double,
        requestedColumns: Int,
        bandCount: Int
    ) -> AudioDetailSpectrum {
        let targetFFTSize: Int
        switch visibleDurationSeconds {
        case ..<0.5: targetFFTSize = 512
        case ..<2: targetFFTSize = 1_024
        case ..<10: targetFFTSize = 2_048
        default: targetFFTSize = 4_096
        }
        let fftSize = max(256, min(targetFFTSize, greatestPowerOfTwo(notExceeding: samples.count)))
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

    private nonisolated static func greatestPowerOfTwo(notExceeding value: Int) -> Int {
        guard value > 1 else { return 1 }
        return 1 << Int(floor(log2(Double(value))))
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
                let waveformRect = CGRect(x: 0, y: 0, width: size.width, height: size.height * 0.58)
                let spectrumRect = CGRect(x: 0, y: waveformRect.maxY, width: size.width, height: size.height - waveformRect.maxY)
                context.fill(Path(waveformRect), with: .color(Color.black.opacity(0.12)))
                context.fill(Path(spectrumRect), with: .color(Color.black.opacity(0.30)))
                drawSpectrum(envelope.spectrum, context: context, rect: spectrumRect)
                drawWaveformGrid(context: context, rect: waveformRect)
                drawFrequencyGrid(context: context, rect: spectrumRect)
                let centerY = waveformRect.midY
                let width = max(size.width / CGFloat(envelope.points.count), 1)
                for (index, point) in envelope.points.enumerated() {
                    let x = CGFloat(index) * width
                    let rmsHeight = max(1.5, normalized(point.rmsDbfs, floor: -72) * waveformRect.height * 0.80)
                    let peakHeight = max(rmsHeight + 1, normalized(point.peakDbfs, floor: -60) * waveformRect.height * 0.94)
                    let peakRect = CGRect(x: x, y: centerY - peakHeight / 2, width: max(width * 0.86, 1), height: peakHeight)
                    let rmsRect = CGRect(x: x, y: centerY - rmsHeight / 2, width: max(width * 0.86, 1), height: rmsHeight)
                    context.fill(Path(peakRect), with: .color(tint.opacity(0.24)))
                    context.fill(Path(rmsRect), with: .color(tint.opacity(0.92)))
                    if point.peakDbfs > -1 {
                        context.fill(
                            Path(CGRect(x: x, y: waveformRect.minY + 1, width: max(width * 0.86, 1), height: 5)),
                            with: .color(QuipslyStudioTheme.clay)
                        )
                    } else if point.peakDbfs > -3 {
                        context.fill(
                            Path(CGRect(x: x, y: waveformRect.minY + 2, width: max(width * 0.86, 1), height: 3)),
                            with: .color(QuipslyStudioTheme.honey)
                        )
                    }
                }
                drawDiagnostics(envelope.diagnostics, context: context, size: size)
            }
            .task(id: "\(requestKey)|\(Int(proxy.size.width.rounded()))") {
                let analysis = try? await AudioDetailAnalysisCache.shared.envelope(
                    path: path,
                    startSeconds: visibleStartSeconds,
                    durationSeconds: visibleDurationSeconds,
                    pointCount: max(Int(proxy.size.width.rounded()), 128)
                )
                guard !Task.isCancelled else { return }
                envelope = analysis
            }
        }
        .allowsHitTesting(false)
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("High resolution waveform and spectrogram")
        .accessibilityValue(accessibilitySummary)
    }

    private func normalized(_ dbfs: Double, floor: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.01 }
        let clamped = min(0, max(floor, dbfs))
        return min(CGFloat((clamped - floor) / -floor) * max(waveformGain, 0.1), 1)
    }

    private func drawSpectrum(_ spectrum: AudioDetailSpectrum, context: GraphicsContext, rect: CGRect) {
        guard spectrum.columnCount > 0,
              spectrum.bandCount > 0,
              spectrum.intensities.count == spectrum.columnCount * spectrum.bandCount else { return }
        let cellWidth = rect.width / CGFloat(spectrum.columnCount)
        let cellHeight = rect.height / CGFloat(spectrum.bandCount)

        for column in 0..<spectrum.columnCount {
            for band in 0..<spectrum.bandCount {
                let intensity = Double(spectrum.intensities[column * spectrum.bandCount + band])
                guard intensity > 0.08 else { continue }
                let y = rect.maxY - CGFloat(band + 1) * cellHeight
                let rect = CGRect(
                    x: rect.minX + CGFloat(column) * cellWidth,
                    y: y,
                    width: max(cellWidth + 0.5, 1),
                    height: max(cellHeight + 0.5, 1)
                )
                context.fill(
                    Path(rect),
                    with: .color(spectrumColor(band: band, bandCount: spectrum.bandCount).opacity(min(intensity * 0.72, 0.72)))
                )
            }
        }
    }

    private func drawWaveformGrid(context: GraphicsContext, rect: CGRect) {
        context.fill(Path(CGRect(x: rect.minX, y: rect.midY, width: rect.width, height: 1)), with: .color(Color.white.opacity(0.18)))
        for db in [-6.0, -12.0, -24.0, -48.0] {
            let amplitude = normalized(db, floor: -60) * rect.height * 0.47
            for y in [rect.midY - amplitude / 2, rect.midY + amplitude / 2] {
                context.stroke(
                    Path(CGRect(x: rect.minX, y: y, width: rect.width, height: 0.5)),
                    with: .color(Color.white.opacity(db == -12 ? 0.18 : 0.09)),
                    lineWidth: 0.5
                )
            }
            context.draw(
                Text("\(Int(db))").font(.system(size: 8, weight: .medium, design: .monospaced)).foregroundStyle(Color.white.opacity(0.54)),
                at: CGPoint(x: rect.minX + 3, y: rect.midY - amplitude / 2 + 5),
                anchor: .topLeading
            )
        }
    }

    private func drawFrequencyGrid(context: GraphicsContext, rect: CGRect) {
        let low = 55.0
        let high = 18_000.0
        for (frequency, label) in [(100.0, "100"), (1_000.0, "1k"), (10_000.0, "10k")] {
            let fraction = log(frequency / low) / log(high / low)
            let y = rect.maxY - CGFloat(fraction) * rect.height
            context.stroke(
                Path(CGRect(x: rect.minX, y: y, width: rect.width, height: 0.5)),
                with: .color(Color.white.opacity(0.12)),
                lineWidth: 0.5
            )
            context.draw(
                Text(label).font(.system(size: 8, weight: .medium, design: .monospaced)).foregroundStyle(Color.white.opacity(0.52)),
                at: CGPoint(x: rect.maxX - 3, y: y - 1),
                anchor: .bottomTrailing
            )
        }
    }

    private func drawDiagnostics(_ diagnostics: AudioDetailDiagnostics, context: GraphicsContext, size: CGSize) {
        let correlation = diagnostics.stereoCorrelation.map { String(format: "r %.2f", $0) } ?? "mono"
        let clipped = diagnostics.clippedSampleCount > 0 ? "  CLIP \(diagnostics.clippedSampleCount)" : ""
        let summary = String(
            format: "%.1fk  %dch  RMS %.1f  PK %.1f  crest %.1f  %@%@",
            diagnostics.sampleRate / 1_000,
            diagnostics.channelCount,
            diagnostics.rmsDbfs,
            diagnostics.peakDbfs,
            diagnostics.crestDb,
            correlation,
            clipped
        )
        context.draw(
            Text(summary)
                .font(.system(size: 8.5, weight: .semibold, design: .monospaced))
                .foregroundStyle(diagnostics.clippedSampleCount > 0 ? QuipslyStudioTheme.clay : Color.white.opacity(0.66)),
            at: CGPoint(x: size.width - 5, y: 4),
            anchor: .topTrailing
        )
    }

    private var accessibilitySummary: String {
        guard let diagnostics = envelope?.diagnostics else { return "Analysis loading" }
        let correlation = diagnostics.stereoCorrelation.map { String(format: "%.2f", $0) } ?? "mono"
        return String(
            format: "Window %.3f seconds. RMS %.1f dBFS. Peak %.1f dBFS. Crest %.1f dB. Stereo correlation %@. Clipped samples %d.",
            visibleDurationSeconds,
            diagnostics.rmsDbfs,
            diagnostics.peakDbfs,
            diagnostics.crestDb,
            correlation,
            diagnostics.clippedSampleCount
        )
    }

    private func spectrumColor(band: Int, bandCount: Int) -> Color {
        let fraction = Double(band) / Double(max(bandCount - 1, 1))
        if fraction < 0.30 { return QuipslyStudioTheme.moss }
        if fraction < 0.68 { return QuipslyStudioTheme.honey }
        return QuipslyStudioTheme.creekMist
    }
}
