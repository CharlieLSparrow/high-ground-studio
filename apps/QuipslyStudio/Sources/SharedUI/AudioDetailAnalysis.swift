import AVFAudio
import Accelerate
import SwiftUI

struct AudioDetailEnvelopePoint: Sendable {
    let rmsDbfs: Double
    let peakDbfs: Double
    let leftRmsDbfs: Double
    let rightRmsDbfs: Double
    let leftPeakDbfs: Double
    let rightPeakDbfs: Double
    let stereoCorrelation: Double?
}

struct AudioDetailEnvelope: Sendable {
    let points: [AudioDetailEnvelopePoint]
    let spectrum: AudioDetailSpectrum
    let phaseScope: AudioDetailPhaseScope
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
    let leftRmsDbfs: Double
    let rightRmsDbfs: Double
    let leftPeakDbfs: Double
    let rightPeakDbfs: Double
    let stereoBalanceDb: Double
    let clippedSampleCount: Int

    static let empty = AudioDetailDiagnostics(
        sampleRate: 0,
        channelCount: 0,
        rmsDbfs: -96,
        peakDbfs: -96,
        crestDb: 0,
        dcOffsetDbfs: -96,
        stereoCorrelation: nil,
        leftRmsDbfs: -96,
        rightRmsDbfs: -96,
        leftPeakDbfs: -96,
        rightPeakDbfs: -96,
        stereoBalanceDb: 0,
        clippedSampleCount: 0
    )
}

struct AudioDetailPhasePoint: Sendable {
    let left: Float
    let right: Float
}

struct AudioDetailPhaseScope: Sendable {
    let points: [AudioDetailPhasePoint]

    static let empty = AudioDetailPhaseScope(points: [])
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
            return AudioDetailEnvelope(points: [], spectrum: .empty, phaseScope: .empty, diagnostics: .empty, startSeconds: request.startSeconds, durationSeconds: request.durationSeconds)
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
            return AudioDetailEnvelope(points: [], spectrum: .empty, phaseScope: .empty, diagnostics: .empty, startSeconds: request.startSeconds, durationSeconds: request.durationSeconds)
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
        var leftPeak: Double = 0
        var rightPeak: Double = 0
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
            leftPeak = max(leftPeak, abs(left))
            rightPeak = max(rightPeak, abs(right))
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
        let leftRms = sqrt(leftSquares / max(sampleCount, 1))
        let rightRms = sqrt(rightSquares / max(sampleCount, 1))
        let leftRmsDbfs = decibels(amplitude: leftRms)
        let rightRmsDbfs = decibels(amplitude: rightRms)
        let diagnostics = AudioDetailDiagnostics(
            sampleRate: sampleRate,
            channelCount: channelCount,
            rmsDbfs: rmsDbfs,
            peakDbfs: peakDbfs,
            crestDb: max(peakDbfs - rmsDbfs, 0),
            dcOffsetDbfs: decibels(amplitude: abs(sum / max(sampleCount, 1))),
            stereoCorrelation: stereoCorrelation,
            leftRmsDbfs: leftRmsDbfs,
            rightRmsDbfs: rightRmsDbfs,
            leftPeakDbfs: decibels(amplitude: leftPeak),
            rightPeakDbfs: decibels(amplitude: rightPeak),
            stereoBalanceDb: rightRmsDbfs - leftRmsDbfs,
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
            var leftPeak: Float = 0
            var rightPeak: Float = 0
            var leftSum: Double = 0
            var rightSum: Double = 0
            var leftSquares: Double = 0
            var rightSquares: Double = 0
            var crossSum: Double = 0
            var sampleCount = 0

            for frameIndex in startFrame..<endFrame {
                let mixedSample = monoSamples[frameIndex]
                let left = channels[0][frameIndex]
                let right = channels[min(1, channelCount - 1)][frameIndex]
                peak = max(peak, abs(mixedSample))
                sumSquares += Double(mixedSample * mixedSample)
                leftPeak = max(leftPeak, abs(left))
                rightPeak = max(rightPeak, abs(right))
                leftSum += Double(left)
                rightSum += Double(right)
                leftSquares += Double(left * left)
                rightSquares += Double(right * right)
                crossSum += Double(left * right)
                sampleCount += 1
            }

            let rms = sampleCount > 0 ? sqrt(sumSquares / Double(sampleCount)) : 0
            let count = Double(max(sampleCount, 1))
            let leftRms = sqrt(leftSquares / count)
            let rightRms = sqrt(rightSquares / count)
            let leftVariance = max(count * leftSquares - leftSum * leftSum, 0)
            let rightVariance = max(count * rightSquares - rightSum * rightSum, 0)
            let correlationDenominator = sqrt(leftVariance * rightVariance)
            let pointCorrelation = channelCount > 1 && correlationDenominator > 1e-12
                ? min(max((count * crossSum - leftSum * rightSum) / correlationDenominator, -1), 1)
                : nil
            points.append(
                AudioDetailEnvelopePoint(
                    rmsDbfs: decibels(amplitude: rms),
                    peakDbfs: decibels(amplitude: Double(peak)),
                    leftRmsDbfs: decibels(amplitude: leftRms),
                    rightRmsDbfs: decibels(amplitude: rightRms),
                    leftPeakDbfs: decibels(amplitude: Double(leftPeak)),
                    rightPeakDbfs: decibels(amplitude: Double(rightPeak)),
                    stereoCorrelation: pointCorrelation
                )
            )
        }

        let phasePointLimit = request.durationSeconds <= 2 ? 900 : 480
        let phaseStride = max(frameCount / phasePointLimit, 1)
        var phasePoints: [AudioDetailPhasePoint] = []
        phasePoints.reserveCapacity(min(frameCount, phasePointLimit + 1))
        for frameIndex in Swift.stride(from: 0, to: frameCount, by: phaseStride) {
            phasePoints.append(
                AudioDetailPhasePoint(
                    left: min(max(channels[0][frameIndex], -1), 1),
                    right: min(max(channels[min(1, channelCount - 1)][frameIndex], -1), 1)
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
            phaseScope: AudioDetailPhaseScope(points: phasePoints),
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
                drawTimeGrid(context: context, size: size)
                drawSpectrum(envelope.spectrum, context: context, rect: spectrumRect)
                drawWaveformGrid(context: context, rect: waveformRect)
                drawFrequencyGrid(context: context, rect: spectrumRect)
                let width = max(size.width / CGFloat(envelope.points.count), 1)
                for (index, point) in envelope.points.enumerated() {
                    let x = CGFloat(index) * width
                    drawChannelBar(
                        x: x,
                        width: width,
                        rmsDbfs: point.leftRmsDbfs,
                        peakDbfs: point.leftPeakDbfs,
                        laneRect: CGRect(x: waveformRect.minX, y: waveformRect.minY, width: waveformRect.width, height: waveformRect.height / 2),
                        context: context,
                        channelTint: tint
                    )
                    drawChannelBar(
                        x: x,
                        width: width,
                        rmsDbfs: point.rightRmsDbfs,
                        peakDbfs: point.rightPeakDbfs,
                        laneRect: CGRect(x: waveformRect.minX, y: waveformRect.midY, width: waveformRect.width, height: waveformRect.height / 2),
                        context: context,
                        channelTint: tint.opacity(0.74)
                    )
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
                drawCorrelationHistory(envelope.points, context: context, rect: waveformRect)
                drawPhaseScope(envelope.phaseScope, diagnostics: envelope.diagnostics, context: context, rect: waveformRect)
                drawDiagnostics(envelope.diagnostics, pointCount: envelope.points.count, context: context, size: size)
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

    private func drawChannelBar(
        x: CGFloat,
        width: CGFloat,
        rmsDbfs: Double,
        peakDbfs: Double,
        laneRect: CGRect,
        context: GraphicsContext,
        channelTint: Color
    ) {
        let rmsHeight = max(1.2, normalized(rmsDbfs, floor: -72) * laneRect.height * 0.74)
        let peakHeight = max(rmsHeight + 0.8, normalized(peakDbfs, floor: -60) * laneRect.height * 0.88)
        let peakRect = CGRect(x: x, y: laneRect.midY - peakHeight / 2, width: max(width * 0.86, 1), height: peakHeight)
        let rmsRect = CGRect(x: x, y: laneRect.midY - rmsHeight / 2, width: max(width * 0.86, 1), height: rmsHeight)
        context.fill(Path(peakRect), with: .color(channelTint.opacity(0.24)))
        context.fill(Path(rmsRect), with: .color(channelTint.opacity(0.92)))
    }

    private func drawCorrelationHistory(_ points: [AudioDetailEnvelopePoint], context: GraphicsContext, rect: CGRect) {
        guard points.count > 1, points.contains(where: { $0.stereoCorrelation != nil }) else { return }
        var path = Path()
        for (index, point) in points.enumerated() {
            let correlation = min(max(point.stereoCorrelation ?? 1, -1), 1)
            let x = rect.minX + CGFloat(index) / CGFloat(points.count - 1) * rect.width
            let y = rect.midY - CGFloat(correlation) * 7
            if index == 0 { path.move(to: CGPoint(x: x, y: y)) }
            else { path.addLine(to: CGPoint(x: x, y: y)) }
        }
        context.stroke(path, with: .color(QuipslyStudioTheme.creekMist.opacity(0.72)), lineWidth: 1.1)
        for (index, point) in points.enumerated() where (point.stereoCorrelation ?? 1) < 0 {
            let x = rect.minX + CGFloat(index) / CGFloat(max(points.count - 1, 1)) * rect.width
            context.fill(Path(CGRect(x: x, y: rect.midY - 1.5, width: 2, height: 3)), with: .color(QuipslyStudioTheme.clay))
        }
    }

    private func drawPhaseScope(
        _ phaseScope: AudioDetailPhaseScope,
        diagnostics: AudioDetailDiagnostics,
        context: GraphicsContext,
        rect: CGRect
    ) {
        guard diagnostics.channelCount > 1, phaseScope.points.count > 2, rect.width >= 520 else { return }
        let scopeSize = min(78, rect.height - 12)
        let scopeRect = CGRect(x: rect.maxX - scopeSize - 8, y: rect.minY + 7, width: scopeSize, height: scopeSize)
        context.fill(Path(roundedRect: scopeRect, cornerRadius: 9), with: .color(Color.black.opacity(0.70)))
        context.stroke(Path(roundedRect: scopeRect, cornerRadius: 9), with: .color(Color.white.opacity(0.16)), lineWidth: 1)
        context.stroke(Path(CGRect(x: scopeRect.midX, y: scopeRect.minY + 5, width: 0.5, height: scopeRect.height - 10)), with: .color(Color.white.opacity(0.12)), lineWidth: 0.5)
        context.stroke(Path(CGRect(x: scopeRect.minX + 5, y: scopeRect.midY, width: scopeRect.width - 10, height: 0.5)), with: .color(Color.white.opacity(0.12)), lineWidth: 0.5)
        var phasePath = Path()
        for (index, point) in phaseScope.points.enumerated() {
            let sum = CGFloat(point.left + point.right) * 0.5
            let difference = CGFloat(point.left - point.right) * 0.5
            let x = scopeRect.midX + difference * scopeRect.width * 0.42
            let y = scopeRect.midY - sum * scopeRect.height * 0.42
            if index == 0 { phasePath.move(to: CGPoint(x: x, y: y)) }
            else { phasePath.addLine(to: CGPoint(x: x, y: y)) }
        }
        context.stroke(phasePath, with: .color(tint.opacity(0.54)), lineWidth: 0.75)
        context.draw(
            Text("PHASE").font(.system(size: 7, weight: .bold, design: .monospaced)).foregroundStyle(Color.white.opacity(0.52)),
            at: CGPoint(x: scopeRect.minX + 5, y: scopeRect.minY + 4),
            anchor: .topLeading
        )
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
        context.draw(Text("L").font(.system(size: 8, weight: .black, design: .monospaced)).foregroundStyle(Color.white.opacity(0.52)), at: CGPoint(x: rect.minX + 4, y: rect.minY + 4), anchor: .topLeading)
        context.draw(Text("R").font(.system(size: 8, weight: .black, design: .monospaced)).foregroundStyle(Color.white.opacity(0.52)), at: CGPoint(x: rect.minX + 4, y: rect.midY + 4), anchor: .topLeading)
        for db in [-6.0, -12.0, -24.0, -48.0] {
            let amplitude = normalized(db, floor: -60) * rect.height * 0.22
            for center in [rect.minY + rect.height * 0.25, rect.minY + rect.height * 0.75] {
                for y in [center - amplitude / 2, center + amplitude / 2] {
                context.stroke(
                    Path(CGRect(x: rect.minX, y: y, width: rect.width, height: 0.5)),
                    with: .color(Color.white.opacity(db == -12 ? 0.18 : 0.09)),
                    lineWidth: 0.5
                )
                context.draw(
                    Text(String(format: "%.0f", db))
                        .font(.system(size: 7, weight: .medium, design: .monospaced))
                        .foregroundStyle(Color.white.opacity(0.42)),
                    at: CGPoint(x: rect.minX + 15, y: y),
                    anchor: .leading
                )
                }
            }
        }
    }

    private func drawTimeGrid(context: GraphicsContext, size: CGSize) {
        let divisions = size.width >= 900 ? 12 : 8
        for index in 0...divisions {
            let fraction = Double(index) / Double(divisions)
            let x = CGFloat(fraction) * size.width
            context.stroke(
                Path(CGRect(x: x, y: 0, width: index == 0 || index == divisions ? 1 : 0.5, height: size.height)),
                with: .color(Color.white.opacity(index == 0 || index == divisions ? 0.16 : 0.075)),
                lineWidth: index == 0 || index == divisions ? 1 : 0.5
            )
            let absoluteTime = visibleStartSeconds + visibleDurationSeconds * fraction
            context.draw(
                Text(formatTimelineTime(absoluteTime))
                    .font(.system(size: 7.5, weight: .semibold, design: .monospaced))
                    .foregroundStyle(Color.white.opacity(0.52)),
                at: CGPoint(x: min(max(x, 3), size.width - 3), y: size.height - 3),
                anchor: index == 0 ? .bottomLeading : (index == divisions ? .bottomTrailing : .bottom)
            )
        }
    }

    private func drawFrequencyGrid(context: GraphicsContext, rect: CGRect) {
        let low = 55.0
        let high = 18_000.0
        for (frequency, label) in [(80.0, "80"), (250.0, "250"), (1_000.0, "1k"), (4_000.0, "4k"), (12_000.0, "12k")] {
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

    private func drawDiagnostics(_ diagnostics: AudioDetailDiagnostics, pointCount: Int, context: GraphicsContext, size: CGSize) {
        let correlation = diagnostics.stereoCorrelation.map { String(format: "r %.2f", $0) } ?? "mono"
        let clipped = diagnostics.clippedSampleCount > 0 ? "  CLIP \(diagnostics.clippedSampleCount)" : ""
        let millisecondsPerPoint = visibleDurationSeconds / Double(max(pointCount, 1)) * 1_000
        let resolution = millisecondsPerPoint < 1
            ? String(format: "%.0f us/px", millisecondsPerPoint * 1_000)
            : String(format: "%.2f ms/px", millisecondsPerPoint)
        let summary = String(
            format: "%@  %.1fk  %dch  L %.1f/%.1f  R %.1f/%.1f  BAL %+.1f  crest %.1f  %@%@",
            resolution,
            diagnostics.sampleRate / 1_000,
            diagnostics.channelCount,
            diagnostics.leftRmsDbfs,
            diagnostics.leftPeakDbfs,
            diagnostics.rightRmsDbfs,
            diagnostics.rightPeakDbfs,
            diagnostics.stereoBalanceDb,
            diagnostics.crestDb,
            correlation,
            clipped
        )
        context.draw(
            Text(summary)
                .font(.system(size: 8.5, weight: .semibold, design: .monospaced))
                .foregroundStyle(diagnostics.clippedSampleCount > 0 ? QuipslyStudioTheme.clay : Color.white.opacity(0.66)),
            at: CGPoint(x: 18, y: 4),
            anchor: .topLeading
        )
    }

    private func formatTimelineTime(_ seconds: Double) -> String {
        let safeSeconds = max(seconds, 0)
        if visibleDurationSeconds <= 2 {
            let minutes = Int(safeSeconds) / 60
            let remainder = safeSeconds.truncatingRemainder(dividingBy: 60)
            return String(format: "%02d:%06.3f", minutes, remainder)
        }
        let total = Int(safeSeconds.rounded(.down))
        let hours = total / 3_600
        let minutes = (total % 3_600) / 60
        let wholeSeconds = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, wholeSeconds)
        }
        return String(format: "%02d:%02d", minutes, wholeSeconds)
    }

    private var accessibilitySummary: String {
        guard let diagnostics = envelope?.diagnostics else { return "Analysis loading" }
        let correlation = diagnostics.stereoCorrelation.map { String(format: "%.2f", $0) } ?? "mono"
        return String(
            format: "Window %.3f seconds. Left RMS %.1f and peak %.1f dBFS. Right RMS %.1f and peak %.1f dBFS. Stereo balance %+.1f dB. Crest %.1f dB. Stereo correlation %@. Clipped samples %d.",
            visibleDurationSeconds,
            diagnostics.leftRmsDbfs,
            diagnostics.leftPeakDbfs,
            diagnostics.rightRmsDbfs,
            diagnostics.rightPeakDbfs,
            diagnostics.stereoBalanceDb,
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
