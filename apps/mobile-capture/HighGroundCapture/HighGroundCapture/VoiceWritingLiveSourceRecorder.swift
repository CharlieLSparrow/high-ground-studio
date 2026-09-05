@preconcurrency import AVFoundation
import Foundation
import Speech

struct VoiceWritingLiveMeterSnapshot: Sendable {
    let averagePowerDB: Float
    let peakPowerDB: Float
}

/// One ordinary Apple permission prompt should happen at the moment a person
/// asks Quipsly to turn speech into writing—not unexpectedly after their take.
/// Denial never blocks source recording; it only selects the source-bound
/// cloud fallback after the local master is safely verified.
enum CaptureSpeechRecognitionPermission: Equatable, Sendable {
    case notDetermined
    case authorized
    case denied

    static var current: Self {
        switch SFSpeechRecognizer.authorizationStatus() {
        case .notDetermined: .notDetermined
        case .authorized: .authorized
        case .denied, .restricted: .denied
        @unknown default: .denied
        }
    }

    static func requestIfNeeded() async -> Self {
        let current = current
        guard current == .notDetermined else { return current }
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                switch status {
                case .authorized: continuation.resume(returning: .authorized)
                case .notDetermined: continuation.resume(returning: .notDetermined)
                case .denied, .restricted: continuation.resume(returning: .denied)
                @unknown default: continuation.resume(returning: .denied)
                }
            }
        }
    }
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

/// Best-effort live words for a microphone stream that is already owned and
/// persisted elsewhere. Connected calls use this boundary so SpeechAnalyzer
/// can observe the exact LiveKit local-input PCM without opening a second
/// AVAudioEngine or changing the protected participant master.
protocol VoiceWritingLivePCMAnalyzing: AnyObject, Sendable {
    nonisolated func consume(_ buffer: AVAudioPCMBuffer)
    nonisolated func finish() async
    nonisolated func cancel()
}

enum VoiceWritingLivePCMAnalyzerFactory {
    /// Returns nil unless Apple's model is already installed. A connected call
    /// must begin recording immediately; live captions never download a model,
    /// delay source persistence, or become a recording prerequisite.
    static func prepareIfAvailable(
        locale requestedLocale: Locale = Locale(identifier: "en-US"),
        recognitionProfile: VoiceWritingRecognitionProfile = .standard,
        contextualPhrases: [String] = [],
        onTextChange: @escaping (_ finalized: String, _ volatile: String) -> Void,
        onPreviewUnavailable: @escaping (_ reason: String) -> Void
    ) async -> VoiceWritingLivePCMAnalyzing? {
        guard #available(iOS 26.0, *) else { return nil }
        do {
            return try await AppleVoiceWritingLivePCMAnalyzer.prepare(
                requestedLocale: requestedLocale,
                recognitionProfile: recognitionProfile,
                contextualPhrases: contextualPhrases,
                onTextChange: onTextChange,
                onPreviewUnavailable: onPreviewUnavailable
            )
        } catch {
            onPreviewUnavailable(error.localizedDescription)
            return nil
        }
    }
}

@available(iOS 26.0, *)
private final class AppleVoiceWritingLiveSourceRecorder: VoiceWritingLiveSourceRecording {
    private let audioEngine: AVAudioEngine
    private let tapState: AudioTapState
    private let speechPipeline: AppleLiveSpeechPipeline
    private let onPreviewUnavailable: (String) -> Void
    private var stopped = false

    var currentTime: TimeInterval { tapState.currentTime }
    var isRecording: Bool { audioEngine.isRunning }
    var meterSnapshot: VoiceWritingLiveMeterSnapshot { tapState.meterSnapshot }
    var sourceWriteFailure: String? { tapState.sourceWriteFailure }

    private init(
        audioEngine: AVAudioEngine,
        tapState: AudioTapState,
        speechPipeline: AppleLiveSpeechPipeline,
        onPreviewUnavailable: @escaping (String) -> Void
    ) {
        self.audioEngine = audioEngine
        self.tapState = tapState
        self.speechPipeline = speechPipeline
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
        let speechPipeline = try await AppleLiveSpeechPipeline.prepare(
            requestedLocale: requestedLocale,
            recognitionProfile: recognitionProfile,
            contextualPhrases: contextualPhrases,
            onTextChange: onTextChange,
            onPreviewUnavailable: onPreviewUnavailable
        )
        let tapState = AudioTapState(
            file: file,
            analyzerInput: AnalyzerPCMInputState(
                analyzerFormat: speechPipeline.analyzerFormat,
                inputContinuation: speechPipeline.inputContinuation,
                onPreviewUnavailable: onPreviewUnavailable
            ),
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
            speechPipeline: speechPipeline,
            onPreviewUnavailable: onPreviewUnavailable
        )
    }

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
        speechPipeline.inputContinuation.finish()
    }

    func finishPreview() async {
        do {
            try await speechPipeline.analyzer.finalizeAndFinishThroughEndOfInput()
        } catch {
            onPreviewUnavailable(
                "Live words ended early; the complete recording will still be transcribed from the saved audio."
            )
            await speechPipeline.analyzer.cancelAndFinishNow()
            speechPipeline.resultTask.cancel()
        }
        await speechPipeline.resultTask.value
    }

    func abort() {
        guard !stopped else { return }
        closeSource()
        speechPipeline.resultTask.cancel()
        Task { await speechPipeline.analyzer.cancelAndFinishNow() }
    }
}

@available(iOS 26.0, *)
private final class AppleVoiceWritingLivePCMAnalyzer: VoiceWritingLivePCMAnalyzing, @unchecked Sendable {
    private let speechPipeline: AppleLiveSpeechPipeline
    private let analyzerInput: AnalyzerPCMInputState
    private let stateLock = NSLock()
    nonisolated(unsafe) private var stopped = false

    private init(
        speechPipeline: AppleLiveSpeechPipeline,
        analyzerInput: AnalyzerPCMInputState
    ) {
        self.speechPipeline = speechPipeline
        self.analyzerInput = analyzerInput
    }

    static func prepare(
        requestedLocale: Locale,
        recognitionProfile: VoiceWritingRecognitionProfile,
        contextualPhrases: [String],
        onTextChange: @escaping (_ finalized: String, _ volatile: String) -> Void,
        onPreviewUnavailable: @escaping (_ reason: String) -> Void
    ) async throws -> AppleVoiceWritingLivePCMAnalyzer {
        let speechPipeline = try await AppleLiveSpeechPipeline.prepare(
            requestedLocale: requestedLocale,
            recognitionProfile: recognitionProfile,
            contextualPhrases: contextualPhrases,
            onTextChange: onTextChange,
            onPreviewUnavailable: onPreviewUnavailable
        )
        return AppleVoiceWritingLivePCMAnalyzer(
            speechPipeline: speechPipeline,
            analyzerInput: AnalyzerPCMInputState(
                analyzerFormat: speechPipeline.analyzerFormat,
                inputContinuation: speechPipeline.inputContinuation,
                onPreviewUnavailable: onPreviewUnavailable
            )
        )
    }

    nonisolated func consume(_ buffer: AVAudioPCMBuffer) {
        guard stateLock.withLock({ !stopped }) else { return }
        analyzerInput.consume(buffer)
    }

    nonisolated func finish() async {
        let shouldFinish = stateLock.withLock { () -> Bool in
            guard !stopped else { return false }
            stopped = true
            return true
        }
        guard shouldFinish else { return }
        analyzerInput.finish()
        speechPipeline.inputContinuation.finish()
        do {
            try await speechPipeline.analyzer.finalizeAndFinishThroughEndOfInput()
        } catch {
            await speechPipeline.analyzer.cancelAndFinishNow()
            speechPipeline.resultTask.cancel()
        }
        await speechPipeline.resultTask.value
    }

    nonisolated func cancel() {
        let shouldCancel = stateLock.withLock { () -> Bool in
            guard !stopped else { return false }
            stopped = true
            return true
        }
        guard shouldCancel else { return }
        analyzerInput.finish()
        speechPipeline.inputContinuation.finish()
        speechPipeline.resultTask.cancel()
        Task { await speechPipeline.analyzer.cancelAndFinishNow() }
    }
}

@available(iOS 26.0, *)
private struct AppleLiveSpeechPipeline: @unchecked Sendable {
    let analyzer: SpeechAnalyzer
    let analyzerFormat: AVAudioFormat
    let inputContinuation: AsyncStream<AnalyzerInput>.Continuation
    let resultTask: Task<Void, Never>

    static func prepare(
        requestedLocale: Locale,
        recognitionProfile: VoiceWritingRecognitionProfile,
        contextualPhrases: [String],
        onTextChange: @escaping (_ finalized: String, _ volatile: String) -> Void,
        onPreviewUnavailable: @escaping (_ reason: String) -> Void
    ) async throws -> AppleLiveSpeechPipeline {
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
            throw LivePreviewFailure.modelNotInstalled
        }
        guard let analyzerFormat = await SpeechAnalyzer.bestAvailableAudioFormat(
            compatibleWith: modules
        ) else {
            throw LivePreviewFailure.noCompatibleAnalyzerFormat
        }

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
        return AppleLiveSpeechPipeline(
            analyzer: analyzer,
            analyzerFormat: analyzerFormat,
            inputContinuation: inputContinuation,
            resultTask: resultTask
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
                onPreviewUnavailable(livePreviewEndedMessage)
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
                onPreviewUnavailable(livePreviewEndedMessage)
            }
        }
    }

    private static let livePreviewEndedMessage =
        "Live words paused; the complete recording will still be transcribed after you stop."
}

/// Converts every incoming SDK-owned buffer into memory owned by the analyzer
/// stream. LiveKit and AVAudioEngine may recycle their callback buffers as soon
/// as render/tap returns, while SpeechAnalyzer consumes them asynchronously.
@available(iOS 26.0, *)
private final class AnalyzerPCMInputState: @unchecked Sendable {
    private let lock = NSLock()
    private let analyzerFormat: AVAudioFormat
    private let inputContinuation: AsyncStream<AnalyzerInput>.Continuation
    nonisolated(unsafe) private let onPreviewUnavailable: (String) -> Void
    nonisolated(unsafe) private var converter: AVAudioConverter?
    nonisolated(unsafe) private var acceptsBuffers = true
    nonisolated(unsafe) private var warnedAboutPreviewBackpressure = false

    init(
        analyzerFormat: AVAudioFormat,
        inputContinuation: AsyncStream<AnalyzerInput>.Continuation,
        onPreviewUnavailable: @escaping (String) -> Void
    ) {
        self.analyzerFormat = analyzerFormat
        self.inputContinuation = inputContinuation
        self.onPreviewUnavailable = onPreviewUnavailable
    }

    nonisolated func consume(_ buffer: AVAudioPCMBuffer) {
        let ownedBuffer: AVAudioPCMBuffer
        do {
            ownedBuffer = try lock.withLock {
                guard acceptsBuffers else { throw LivePreviewFailure.previewAlreadyStopped }
                return try makeOwnedAnalyzerBuffer(from: buffer)
            }
        } catch LivePreviewFailure.previewAlreadyStopped {
            return
        } catch {
            warnOnce(
                "Live words are unavailable; the complete recording will be transcribed after you stop."
            )
            return
        }

        if case .dropped = inputContinuation.yield(AnalyzerInput(buffer: ownedBuffer)) {
            warnOnce(
                "Live words fell behind; the complete recording will be transcribed after you stop."
            )
        }
    }

    nonisolated func finish() {
        lock.withLock {
            acceptsBuffers = false
            converter = nil
        }
    }

    nonisolated private func makeOwnedAnalyzerBuffer(
        from buffer: AVAudioPCMBuffer
    ) throws -> AVAudioPCMBuffer {
        if buffer.format == analyzerFormat {
            guard let output = AVAudioPCMBuffer(
                pcmFormat: analyzerFormat,
                frameCapacity: max(1, buffer.frameLength)
            ) else {
                throw LivePreviewFailure.couldNotCreateConversionBuffer
            }
            output.frameLength = buffer.frameLength
            let sourceBuffers = UnsafeMutableAudioBufferListPointer(buffer.mutableAudioBufferList)
            let destinationBuffers = UnsafeMutableAudioBufferListPointer(output.mutableAudioBufferList)
            guard sourceBuffers.count == destinationBuffers.count else {
                throw LivePreviewFailure.conversionFailed
            }
            for index in sourceBuffers.indices {
                guard let sourceData = sourceBuffers[index].mData,
                      let destinationData = destinationBuffers[index].mData else {
                    throw LivePreviewFailure.conversionFailed
                }
                let byteCount = Int(sourceBuffers[index].mDataByteSize)
                memcpy(destinationData, sourceData, byteCount)
                destinationBuffers[index].mDataByteSize = UInt32(byteCount)
            }
            return output
        }

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

    nonisolated private func warnOnce(_ message: String) {
        let shouldWarn = lock.withLock { () -> Bool in
            guard !warnedAboutPreviewBackpressure else { return false }
            warnedAboutPreviewBackpressure = true
            return true
        }
        if shouldWarn { onPreviewUnavailable(message) }
    }
}

@available(iOS 26.0, *)
private final class AudioTapState: @unchecked Sendable {
    private let lock = NSLock()
    private var file: AVAudioFile?
    private let analyzerInput: AnalyzerPCMInputState
    private let onSourceWriteFailure: (String) -> Void
    private var frameCount: AVAudioFramePosition = 0
    private var sampleRate: Double
    private var averagePowerDB: Float = -160
    private var peakPowerDB: Float = -160
    private var writeFailure: String?
    private var acceptsBuffers = true

    init(
        file: AVAudioFile,
        analyzerInput: AnalyzerPCMInputState,
        onSourceWriteFailure: @escaping (String) -> Void
    ) {
        self.file = file
        self.analyzerInput = analyzerInput
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

        lock.unlock()
        analyzerInput.consume(buffer)
    }

    func finish() {
        lock.withLock {
            acceptsBuffers = false
            file = nil
        }
        analyzerInput.finish()
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
    case previewAlreadyStopped

    var errorDescription: String? {
        switch self {
        case .speechAnalyzerUnavailable:
            "Apple live transcription is unavailable on this device."
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
        case .previewAlreadyStopped:
            "The live transcription preview already stopped."
        }
    }
}

private extension NSLock {
    @discardableResult
    nonisolated func withLock<T>(_ body: () throws -> T) rethrows -> T {
        lock()
        defer { unlock() }
        return try body()
    }
}
