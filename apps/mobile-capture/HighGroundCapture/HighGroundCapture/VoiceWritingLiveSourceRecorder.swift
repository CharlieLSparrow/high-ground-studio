import AVFoundation
import Foundation
import Speech

struct VoiceWritingLiveMeterSnapshot: Sendable {
    let averagePowerDB: Float
    let peakPowerDB: Float
}

/// Type-erased boundary used by AudioCaptureController so iOS 17-25 never
/// need to reference SpeechAnalyzer's iOS 26-only implementation. This object
/// owns the microphone and the source file; it is never run beside
/// AVAudioRecorder or LiveKit's local-input recorder.
protocol VoiceWritingLiveSourceRecording: AnyObject {
    var currentTime: TimeInterval { get }
    var isRecording: Bool { get }
    var meterSnapshot: VoiceWritingLiveMeterSnapshot { get }
    var sourceWriteFailure: String? { get }

    func start() throws
    func pause()
    func resume() throws
    func closeSource()
    func finishPreview() async
    func abort()
}

enum VoiceWritingLiveSourceFactory {
    /// Returns nil when live preview is not ready on this device. The caller
    /// then uses the proven AVAudioRecorder source and transcribes the complete
    /// finalized file. Live words are an enhancement, never a capture gate.
    static func prepareIfAvailable(
        fileURL: URL,
        audioSettings: [String: Any],
        locale requestedLocale: Locale = Locale(identifier: "en-US"),
        recognitionProfile: VoiceWritingRecognitionProfile = .standard,
        contextualPhrases: [String] = [],
        onTextChange: @escaping (_ finalized: String, _ volatile: String) -> Void,
        onPreviewUnavailable: @escaping (_ reason: String) -> Void,
        onSourceWriteFailure: @escaping (_ reason: String) -> Void
    ) async -> VoiceWritingLiveSourceRecording? {
        guard #available(iOS 26.0, *) else { return nil }
        do {
            return try await AppleVoiceWritingLiveSourceRecorder.prepare(
                fileURL: fileURL,
                audioSettings: audioSettings,
                requestedLocale: requestedLocale,
                recognitionProfile: recognitionProfile,
                contextualPhrases: contextualPhrases,
                onTextChange: onTextChange,
                onPreviewUnavailable: onPreviewUnavailable,
                onSourceWriteFailure: onSourceWriteFailure
            )
        } catch {
            try? FileManager.default.removeItem(at: fileURL)
            onPreviewUnavailable(error.localizedDescription)
            return nil
        }
    }
}

@available(iOS 26.0, *)
private final class AppleVoiceWritingLiveSourceRecorder: VoiceWritingLiveSourceRecording {
    private let audioEngine: AVAudioEngine
    private let tapState: AudioTapState
    private let analyzer: SpeechAnalyzer
    private let inputContinuation: AsyncStream<AnalyzerInput>.Continuation
    private let resultTask: Task<Void, Never>
    private let onPreviewUnavailable: (String) -> Void
    private var stopped = false

    var currentTime: TimeInterval { tapState.currentTime }
    var isRecording: Bool { audioEngine.isRunning }
    var meterSnapshot: VoiceWritingLiveMeterSnapshot { tapState.meterSnapshot }
    var sourceWriteFailure: String? { tapState.sourceWriteFailure }

    private init(
        audioEngine: AVAudioEngine,
        tapState: AudioTapState,
        analyzer: SpeechAnalyzer,
        inputContinuation: AsyncStream<AnalyzerInput>.Continuation,
        resultTask: Task<Void, Never>,
        onPreviewUnavailable: @escaping (String) -> Void
    ) {
        self.audioEngine = audioEngine
        self.tapState = tapState
        self.analyzer = analyzer
        self.inputContinuation = inputContinuation
        self.resultTask = resultTask
        self.onPreviewUnavailable = onPreviewUnavailable
    }

    static func prepare(
        fileURL: URL,
        audioSettings: [String: Any],
        requestedLocale: Locale,
        recognitionProfile: VoiceWritingRecognitionProfile,
        contextualPhrases: [String],
        onTextChange: @escaping (_ finalized: String, _ volatile: String) -> Void,
        onPreviewUnavailable: @escaping (_ reason: String) -> Void,
        onSourceWriteFailure: @escaping (_ reason: String) -> Void
    ) async throws -> AppleVoiceWritingLiveSourceRecorder {
        let transcriptState = LiveTranscriptState(onTextChange: onTextChange)
        let modules: [any SpeechModule]
        let makeResultTask: () -> Task<Void, Never>
        if recognitionProfile.adaptsToSpeech,
           let locale = await DictationTranscriber.supportedLocale(
               equivalentTo: requestedLocale
           ) {
            let transcriber = DictationTranscriber(
                locale: locale,
                contentHints: [.atypicalSpeech],
                transcriptionOptions: [.punctuation],
                reportingOptions: [.volatileResults, .frequentFinalization],
                attributeOptions: [.audioTimeRange]
            )
            modules = [transcriber]
            makeResultTask = {
                adaptedResultTask(
                    transcriber: transcriber,
                    transcriptState: transcriptState,
                    onPreviewUnavailable: onPreviewUnavailable
                )
            }
        } else {
            guard SpeechTranscriber.isAvailable else {
                throw LivePreviewFailure.speechAnalyzerUnavailable
            }
            guard let locale = await SpeechTranscriber.supportedLocale(
                equivalentTo: requestedLocale
            ) else {
                throw LivePreviewFailure.unsupportedLocale
            }
            let transcriber = SpeechTranscriber(
                locale: locale,
                transcriptionOptions: [],
                reportingOptions: [.volatileResults, .fastResults],
                attributeOptions: [.audioTimeRange]
            )
            modules = [transcriber]
            makeResultTask = {
                standardResultTask(
                    transcriber: transcriber,
                    transcriptState: transcriptState,
                    onPreviewUnavailable: onPreviewUnavailable
                )
            }
        }
        guard await AssetInventory.status(forModules: modules) == .installed else {
            // Post-capture voice writing owns model installation because it can
            // display durable progress without holding an armed microphone.
            throw LivePreviewFailure.modelNotInstalled
        }
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: modules
        ) else {
            throw LivePreviewFailure.noCompatibleAnalyzerFormat
        }

        let audioEngine = AVAudioEngine()
        let inputNode = audioEngine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        guard inputFormat.sampleRate > 0, inputFormat.channelCount > 0 else {
            throw LivePreviewFailure.noMicrophoneFormat
        }

        let file = try AVAudioFile(
            forWriting: fileURL,
            settings: audioSettings,
            commonFormat: inputFormat.commonFormat,
            interleaved: inputFormat.isInterleaved
        )
        let analyzer = SpeechAnalyzer(modules: modules)
        if !contextualPhrases.isEmpty {
            let context = AnalysisContext()
            context.contextualStrings[.general] = Array(contextualPhrases.prefix(100))
            try? await analyzer.setContext(context)
        }
        let (inputSequence, inputContinuation) = AsyncStream<AnalyzerInput>.makeStream(
            bufferingPolicy: .bufferingNewest(24)
        )
        let resultTask = makeResultTask()

        do {
            try await analyzer.start(inputSequence: inputSequence)
        } catch {
            inputContinuation.finish()
            resultTask.cancel()
            throw error
        }

        let tapState = AudioTapState(
            file: file,
            analyzerFormat: analyzerFormat,
            inputContinuation: inputContinuation,
            onPreviewUnavailable: onPreviewUnavailable,
            onSourceWriteFailure: onSourceWriteFailure
        )
        inputNode.removeTap(onBus: 0)
        inputNode.installTap(
            onBus: 0,
            bufferSize: 4096,
            format: inputFormat
        ) { buffer, _ in
            tapState.consume(buffer)
        }
        audioEngine.prepare()

        return AppleVoiceWritingLiveSourceRecorder(
            audioEngine: audioEngine,
            tapState: tapState,
            analyzer: analyzer,
            inputContinuation: inputContinuation,
            resultTask: resultTask,
            onPreviewUnavailable: onPreviewUnavailable
        )
    }

    private static func standardResultTask(
        transcriber: SpeechTranscriber,
        transcriptState: LiveTranscriptState,
        onPreviewUnavailable: @escaping (String) -> Void
    ) -> Task<Void, Never> {
        Task {
            do {
                for try await result in transcriber.results {
                    transcriptState.consume(
                        text: String(result.text.characters),
                        isFinal: result.isFinal
                    )
                }
            } catch is CancellationError {
                return
            } catch {
                onPreviewUnavailable(Self.livePreviewEndedMessage)
            }
        }
    }

    private static func adaptedResultTask(
        transcriber: DictationTranscriber,
        transcriptState: LiveTranscriptState,
        onPreviewUnavailable: @escaping (String) -> Void
    ) -> Task<Void, Never> {
        Task {
            do {
                for try await result in transcriber.results {
                    transcriptState.consume(
                        text: String(result.text.characters),
                        isFinal: result.isFinal
                    )
                }
            } catch is CancellationError {
                return
            } catch {
                onPreviewUnavailable(Self.livePreviewEndedMessage)
            }
        }
    }

    private static let livePreviewEndedMessage =
        "Live words paused; the complete recording will still be transcribed after you stop."

    func start() throws {
        guard !stopped else { throw LivePreviewFailure.recorderAlreadyStopped }
        try audioEngine.start()
    }

    func pause() {
        guard !stopped else { return }
        audioEngine.pause()
    }

    func resume() throws {
        guard !stopped else { throw LivePreviewFailure.recorderAlreadyStopped }
        try audioEngine.start()
    }

    func closeSource() {
        guard !stopped else { return }
        stopped = true
        audioEngine.stop()
        audioEngine.inputNode.removeTap(onBus: 0)
        tapState.finish()
        inputContinuation.finish()
    }

    func finishPreview() async {
        do {
            try await analyzer.finalizeAndFinishThroughEndOfInput()
        } catch {
            onPreviewUnavailable(
                "Live words ended early; the complete recording will still be transcribed from the saved audio."
            )
            await analyzer.cancelAndFinishNow()
            resultTask.cancel()
        }
        await resultTask.value
    }

    func abort() {
        guard !stopped else { return }
        closeSource()
        resultTask.cancel()
        Task { await analyzer.cancelAndFinishNow() }
    }
}

@available(iOS 26.0, *)
private final class AudioTapState: @unchecked Sendable {
    private let lock = NSLock()
    private var file: AVAudioFile?
    private let analyzerFormat: AVAudioFormat
    private let inputContinuation: AsyncStream<AnalyzerInput>.Continuation
    private let onPreviewUnavailable: (String) -> Void
    private let onSourceWriteFailure: (String) -> Void
    private var converter: AVAudioConverter?
    private var frameCount: AVAudioFramePosition = 0
    private var sampleRate: Double
    private var averagePowerDB: Float = -160
    private var peakPowerDB: Float = -160
    private var writeFailure: String?
    private var acceptsBuffers = true
    private var warnedAboutPreviewBackpressure = false

    init(
        file: AVAudioFile,
        analyzerFormat: AVAudioFormat,
        inputContinuation: AsyncStream<AnalyzerInput>.Continuation,
        onPreviewUnavailable: @escaping (String) -> Void,
        onSourceWriteFailure: @escaping (String) -> Void
    ) {
        self.file = file
        self.analyzerFormat = analyzerFormat
        self.inputContinuation = inputContinuation
        self.onPreviewUnavailable = onPreviewUnavailable
        self.onSourceWriteFailure = onSourceWriteFailure
        sampleRate = file.processingFormat.sampleRate
    }

    var currentTime: TimeInterval {
        lock.withLock {
            guard sampleRate > 0 else { return 0 }
            return Double(frameCount) / sampleRate
        }
    }

    var meterSnapshot: VoiceWritingLiveMeterSnapshot {
        lock.withLock {
            VoiceWritingLiveMeterSnapshot(
                averagePowerDB: averagePowerDB,
                peakPowerDB: peakPowerDB
            )
        }
    }

    var sourceWriteFailure: String? { lock.withLock { writeFailure } }

    func consume(_ buffer: AVAudioPCMBuffer) {
        lock.lock()
        guard acceptsBuffers, writeFailure == nil, let file else {
            lock.unlock()
            return
        }

        do {
            // Source persistence always happens before best-effort live
            // analysis. Dropping a preview buffer can never drop source audio.
            try file.write(from: buffer)
            frameCount += AVAudioFramePosition(buffer.frameLength)
            sampleRate = buffer.format.sampleRate
            let meter = Self.meter(for: buffer)
            averagePowerDB = meter.averagePowerDB
            peakPowerDB = meter.peakPowerDB
        } catch {
            writeFailure = error.localizedDescription
            let reason = error.localizedDescription
            lock.unlock()
            onSourceWriteFailure(reason)
            return
        }

        let converted: AVAudioPCMBuffer
        do {
            converted = try convert(buffer)
        } catch {
            if !warnedAboutPreviewBackpressure {
                warnedAboutPreviewBackpressure = true
                lock.unlock()
                onPreviewUnavailable(
                    "Live words are unavailable; the complete recording will be transcribed after you stop."
                )
                return
            }
            lock.unlock()
            return
        }
        lock.unlock()

        if case .dropped = inputContinuation.yield(AnalyzerInput(buffer: converted)) {
            let shouldWarn = lock.withLock { () -> Bool in
                guard !warnedAboutPreviewBackpressure else { return false }
                warnedAboutPreviewBackpressure = true
                return true
            }
            if shouldWarn {
                onPreviewUnavailable(
                    "Live words fell behind; the complete recording will be transcribed after you stop."
                )
            }
        }
    }

    func finish() {
        lock.withLock {
            acceptsBuffers = false
            file = nil
        }
    }

    private func convert(_ buffer: AVAudioPCMBuffer) throws -> AVAudioPCMBuffer {
        if buffer.format == analyzerFormat { return buffer }
        if converter == nil
            || converter?.inputFormat != buffer.format
            || converter?.outputFormat != analyzerFormat {
            converter = AVAudioConverter(from: buffer.format, to: analyzerFormat)
            converter?.primeMethod = .none
        }
        guard let converter else { throw LivePreviewFailure.couldNotCreateConverter }
        let ratio = analyzerFormat.sampleRate / buffer.format.sampleRate
        let capacity = AVAudioFrameCount((Double(buffer.frameLength) * ratio).rounded(.up))
        guard let output = AVAudioPCMBuffer(
            pcmFormat: analyzerFormat,
            frameCapacity: max(1, capacity)
        ) else {
            throw LivePreviewFailure.couldNotCreateConversionBuffer
        }

        var conversionError: NSError?
        var consumed = false
        let status = converter.convert(to: output, error: &conversionError) { _, status in
            if consumed {
                status.pointee = .noDataNow
                return nil
            }
            consumed = true
            status.pointee = .haveData
            return buffer
        }
        guard status != .error else {
            throw conversionError ?? LivePreviewFailure.conversionFailed
        }
        return output
    }

    private static func meter(for buffer: AVAudioPCMBuffer) -> VoiceWritingLiveMeterSnapshot {
        guard let channels = buffer.floatChannelData,
              buffer.frameLength > 0,
              buffer.format.channelCount > 0 else {
            return VoiceWritingLiveMeterSnapshot(averagePowerDB: -160, peakPowerDB: -160)
        }
        let frames = Int(buffer.frameLength)
        var peak: Float = 0
        var squareSum: Double = 0
        var sampleCount = 0
        for channel in 0..<Int(buffer.format.channelCount) {
            let samples = channels[channel]
            for frame in 0..<frames {
                let value = abs(samples[frame])
                peak = max(peak, value)
                squareSum += Double(value * value)
            }
            sampleCount += frames
        }
        guard sampleCount > 0 else {
            return VoiceWritingLiveMeterSnapshot(averagePowerDB: -160, peakPowerDB: -160)
        }
        let rms = Float(sqrt(squareSum / Double(sampleCount)))
        return VoiceWritingLiveMeterSnapshot(
            averagePowerDB: decibels(for: rms),
            peakPowerDB: decibels(for: peak)
        )
    }

    private static func decibels(for amplitude: Float) -> Float {
        guard amplitude.isFinite, amplitude > 0.000_000_01 else { return -160 }
        return max(-160, min(0, 20 * log10(amplitude)))
    }
}

@available(iOS 26.0, *)
private final class LiveTranscriptState: @unchecked Sendable {
    private let lock = NSLock()
    private let onTextChange: (String, String) -> Void
    private var finalized = ""
    private var volatile = ""

    init(onTextChange: @escaping (String, String) -> Void) {
        self.onTextChange = onTextChange
    }

    func consume(text: String, isFinal: Bool) {
        let update = lock.withLock { () -> (String, String) in
            if isFinal {
                finalized = Self.appending(text, to: finalized)
                volatile = ""
            } else {
                volatile = text.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return (finalized, volatile)
        }
        onTextChange(update.0, update.1)
    }

    private static func appending(_ incoming: String, to existing: String) -> String {
        let text = incoming.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return existing }
        guard !existing.isEmpty else { return text }
        let joinsDirectly = text.first.map { ",.!?;:)\u{201D}".contains($0) } ?? false
        return existing + (joinsDirectly ? "" : " ") + text
    }
}

private enum LivePreviewFailure: LocalizedError {
    case speechAnalyzerUnavailable
    case unsupportedLocale
    case modelNotInstalled
    case noCompatibleAnalyzerFormat
    case noMicrophoneFormat
    case recorderAlreadyStopped
    case couldNotCreateConverter
    case couldNotCreateConversionBuffer
    case conversionFailed

    var errorDescription: String? {
        switch self {
        case .speechAnalyzerUnavailable:
            "Apple live transcription is unavailable on this iPhone."
        case .unsupportedLocale:
            "The selected spoken language is not available for live transcription."
        case .modelNotInstalled:
            "Apple's live language model is not installed yet."
        case .noCompatibleAnalyzerFormat:
            "Apple did not provide a compatible live transcription audio format."
        case .noMicrophoneFormat:
            "The selected microphone did not provide a recordable audio format."
        case .recorderAlreadyStopped:
            "The live voice-writing recorder was already stopped."
        case .couldNotCreateConverter:
            "Quipsly could not prepare the live transcription audio converter."
        case .couldNotCreateConversionBuffer:
            "Quipsly could not allocate a live transcription audio buffer."
        case .conversionFailed:
            "Quipsly could not convert an audio buffer for live transcription."
        }
    }
}

private extension NSLock {
    @discardableResult
    func withLock<T>(_ body: () throws -> T) rethrows -> T {
        lock()
        defer { unlock() }
        return try body()
    }
}
