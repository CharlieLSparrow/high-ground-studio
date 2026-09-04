@preconcurrency import AVFoundation
import BackgroundTasks
import Combine
import CryptoKit
import Foundation
import Speech
import UIKit

struct OnDeviceTranscriptSegment: Codable, Equatable, Sendable {
    let startSeconds: Double
    let endSeconds: Double
    let text: String
}

struct OnDeviceTranscriptSidecar: Codable, Equatable, Sendable {
    struct Engine: Codable, Equatable, Sendable {
        let framework: String
        let transcriber: String
        let preset: String
        let configurationHash: String
        let modelAssetStatus: String
    }

    struct Device: Codable, Equatable, Sendable {
        let appVersion: String
        let appBuild: String
        let modelIdentifier: String
        let systemName: String
        let systemVersion: String
    }

    let schemaVersion: Int
    let clientRequestId: UUID
    let localRecordingId: UUID
    let ownerAccountId: String
    let sourceSha256: String
    let sourceByteCount: Int64
    let language: String
    let createdAt: Date
    let recognitionExecution: String
    let speakerDiarization: String
    let humanPlaybackReviewRequired: Bool
    let engine: Engine
    let device: Device
    let segments: [OnDeviceTranscriptSegment]
}

struct OnDeviceTranscriptSubmissionReceipt: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let localRecordingId: UUID
    let clientRequestId: UUID
    let sidecarSha256: String
    let transcriptJobId: String
    let provider: String
    let submittedAt: Date
    let idempotentReplay: Bool
}

enum OnDeviceTranscriptStore {
    struct StoredSidecar: Sendable {
        let sidecar: OnDeviceTranscriptSidecar
        let sha256: String
    }

    private static let directoryName = "QuipslyCapture/OnDeviceTranscripts"

    static func save(_ sidecar: OnDeviceTranscriptSidecar) throws -> StoredSidecar {
        guard accepts(sidecar, expectedRecordingId: sidecar.localRecordingId) else {
            throw OnDeviceTranscriptFailure.localStorageUnavailable
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        let data = try encoder.encode(sidecar)
        let url = try sidecarURL(
            for: sidecar.localRecordingId,
            clientRequestId: sidecar.clientRequestId,
            createDirectory: true
        )
        try writeProtected(data, to: url)
        return StoredSidecar(sidecar: sidecar, sha256: SHA256.hash(data: data).hexString)
    }

    static func load(for recordingId: UUID) throws -> StoredSidecar? {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let urls = try artifactURLs(for: recordingId, suffix: ".transcript.json")
        var candidates: [StoredSidecar] = []
        var rejectedArtifact = false
        candidates.reserveCapacity(urls.count)
        for url in urls {
            do {
                let data = try Data(contentsOf: url, options: [.mappedIfSafe])
                let sidecar = try decoder.decode(OnDeviceTranscriptSidecar.self, from: data)
                guard accepts(sidecar, expectedRecordingId: recordingId),
                      url.lastPathComponent == sidecarFilename(
                        recordingId: recordingId,
                        clientRequestId: sidecar.clientRequestId
                      ) else {
                    rejectedArtifact = true
                    continue
                }
                candidates.append(
                    StoredSidecar(sidecar: sidecar, sha256: SHA256.hash(data: data).hexString)
                )
            } catch {
                rejectedArtifact = true
            }
        }
        if candidates.isEmpty, rejectedArtifact {
            throw OnDeviceTranscriptFailure.localStorageUnavailable
        }
        return candidates.max {
            if $0.sidecar.createdAt == $1.sidecar.createdAt {
                return $0.sidecar.clientRequestId.uuidString < $1.sidecar.clientRequestId.uuidString
            }
            return $0.sidecar.createdAt < $1.sidecar.createdAt
        }
    }

    static func saveSubmissionReceipt(_ receipt: OnDeviceTranscriptSubmissionReceipt) throws {
        guard OnDeviceTranscriptLedgerPolicy.acceptsReceipt(
            .init(
                schemaVersion: receipt.schemaVersion,
                localRecordingId: receipt.localRecordingId,
                clientRequestId: receipt.clientRequestId,
                sidecarSha256: receipt.sidecarSha256,
                transcriptJobId: receipt.transcriptJobId,
                provider: receipt.provider,
                submittedAt: receipt.submittedAt
            ),
            expectedRecordingId: receipt.localRecordingId,
            expectedClientRequestId: receipt.clientRequestId,
            expectedSidecarSha256: receipt.sidecarSha256
        ) else {
            throw OnDeviceTranscriptFailure.localStorageUnavailable
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        try writeProtected(
            encoder.encode(receipt),
            to: try receiptURL(
                for: receipt.localRecordingId,
                clientRequestId: receipt.clientRequestId,
                createDirectory: true
            )
        )
    }

    static func loadSubmissionReceipt(
        for recordingId: UUID,
        clientRequestId: UUID,
        expectedSidecarSha256: String
    ) throws -> OnDeviceTranscriptSubmissionReceipt? {
        let url = try receiptURL(
            for: recordingId,
            clientRequestId: clientRequestId,
            createDirectory: false
        )
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let receipt = try decoder.decode(
            OnDeviceTranscriptSubmissionReceipt.self,
            from: Data(contentsOf: url, options: [.mappedIfSafe])
        )
        guard OnDeviceTranscriptLedgerPolicy.acceptsReceipt(
            .init(
                schemaVersion: receipt.schemaVersion,
                localRecordingId: receipt.localRecordingId,
                clientRequestId: receipt.clientRequestId,
                sidecarSha256: receipt.sidecarSha256,
                transcriptJobId: receipt.transcriptJobId,
                provider: receipt.provider,
                submittedAt: receipt.submittedAt
            ),
            expectedRecordingId: recordingId,
            expectedClientRequestId: clientRequestId,
            expectedSidecarSha256: expectedSidecarSha256
        ) else {
            throw OnDeviceTranscriptFailure.localStorageUnavailable
        }
        return receipt
    }

    private static func accepts(
        _ sidecar: OnDeviceTranscriptSidecar,
        expectedRecordingId: UUID
    ) -> Bool {
        OnDeviceTranscriptLedgerPolicy.acceptsSidecar(
            .init(
                schemaVersion: sidecar.schemaVersion,
                localRecordingId: sidecar.localRecordingId,
                ownerAccountId: sidecar.ownerAccountId,
                sourceSha256: sidecar.sourceSha256,
                sourceByteCount: sidecar.sourceByteCount,
                language: sidecar.language,
                createdAt: sidecar.createdAt,
                recognitionExecution: sidecar.recognitionExecution,
                configurationHash: sidecar.engine.configurationHash,
                segments: sidecar.segments.map {
                    .init(
                        startSeconds: $0.startSeconds,
                        endSeconds: $0.endSeconds,
                        text: $0.text
                    )
                }
            ),
            expectedRecordingId: expectedRecordingId
        )
    }

    private static func writeProtected(_ data: Data, to url: URL) throws {
        // Foundation traps on physical iPadOS when `.atomic` and
        // `.withoutOverwriting` are combined. These artifacts are addressed by
        // immutable recording/request IDs and transcript work is serialized per
        // recording, so make replays idempotent before performing the protected
        // atomic write. A different payload at the same identity still fails
        // closed instead of replacing evidence.
        if FileManager.default.fileExists(atPath: url.path) {
            let existing = try Data(contentsOf: url, options: [.mappedIfSafe])
            guard existing == data else {
                throw OnDeviceTranscriptFailure.localStorageUnavailable
            }
            return
        }
        try data.write(
            to: url,
            options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
        )
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: url.path
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableURL = url
        try mutableURL.setResourceValues(values)
    }

    private static func sidecarURL(
        for recordingId: UUID,
        clientRequestId: UUID,
        createDirectory: Bool
    ) throws -> URL {
        try directoryURL(create: createDirectory)
            .appendingPathComponent(
                sidecarFilename(recordingId: recordingId, clientRequestId: clientRequestId),
                isDirectory: false
            )
    }

    private static func receiptURL(
        for recordingId: UUID,
        clientRequestId: UUID,
        createDirectory: Bool
    ) throws -> URL {
        try directoryURL(create: createDirectory)
            .appendingPathComponent(
                receiptFilename(recordingId: recordingId, clientRequestId: clientRequestId),
                isDirectory: false
            )
    }

    private static func sidecarFilename(recordingId: UUID, clientRequestId: UUID) -> String {
        "\(recordingId.uuidString.lowercased())-\(clientRequestId.uuidString.lowercased()).transcript.json"
    }

    private static func receiptFilename(recordingId: UUID, clientRequestId: UUID) -> String {
        "\(recordingId.uuidString.lowercased())-\(clientRequestId.uuidString.lowercased()).submission.json"
    }

    private static func artifactURLs(for recordingId: UUID, suffix: String) throws -> [URL] {
        let directory = try directoryURL(create: false)
        guard FileManager.default.fileExists(atPath: directory.path) else { return [] }
        let prefix = "\(recordingId.uuidString.lowercased())-"
        return try FileManager.default.contentsOfDirectory(
            at: directory,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        ).filter { url in
            let name = url.lastPathComponent
            guard name.hasPrefix(prefix), name.hasSuffix(suffix) else { return false }
            return (try? url.resourceValues(forKeys: [.isRegularFileKey]).isRegularFile) == true
        }
    }

    private static func directoryURL(create: Bool) throws -> URL {
        guard let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw OnDeviceTranscriptFailure.localStorageUnavailable
        }
        let directory = applicationSupport.appendingPathComponent(directoryName, isDirectory: true)
        if create {
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [
                    .protectionKey: FileProtectionType.completeUntilFirstUserAuthentication,
                ]
            )
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: directory.path
            )
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableDirectory = directory
            try mutableDirectory.setResourceValues(values)
        }
        return directory
    }
}

enum OnDeviceTranscriptPhase: Equatable {
    case idle
    case checkingSupport
    case modelDownloadRequired(locale: String)
    case installingModel(progress: Double?)
    case transcribing
    case savedLocally(segmentCount: Int)
    case waitingForVerifiedUpload(segmentCount: Int)
    case submitting(segmentCount: Int)
    case attached(transcriptJobId: String, segmentCount: Int)
    case requestingCloudFallback
    case cloudFallback(transcriptJobId: String, status: String)
    case failed(message: String, retryable: Bool)

    var isBusy: Bool {
        switch self {
        case .checkingSupport, .installingModel, .transcribing, .submitting, .requestingCloudFallback:
            return true
        case .idle, .modelDownloadRequired, .savedLocally, .waitingForVerifiedUpload, .attached, .cloudFallback, .failed:
            return false
        }
    }
}

enum OnDeviceTranscriptFailure: LocalizedError {
    case unavailable
    case unsupportedLocale
    case speechPermissionDenied
    case modelDownloadRequired(String)
    case modelInstallFailed(String)
    case sourceUnavailable
    case sourceChanged
    case sourceHasNoAudio
    case noFinalizedSpeech
    case accountUnavailable
    case accountChanged
    case localStorageUnavailable
    case verifiedUploadRequired
    case serverRejected(String, statusCode: Int? = nil)

    var errorDescription: String? {
        switch self {
        case .unavailable:
            return "Apple Speech recognition is not available on this device right now. The original recording is unchanged."
        case .unsupportedLocale:
            return "Apple Speech recognition does not support the selected language on this device."
        case .speechPermissionDenied:
            return "Allow Speech Recognition in Settings so Quipsly can turn recordings into editable writing. Your original audio is unchanged."
        case .modelDownloadRequired(let locale):
            return "The \(locale) on-device speech model must be downloaded before transcription."
        case .modelInstallFailed(let message):
            return "The on-device speech model could not be installed: \(message)"
        case .sourceUnavailable:
            return "The protected local recording is unavailable. No transcript was created."
        case .sourceChanged:
            return "The local source changed while transcription was running. Quipsly discarded the result."
        case .sourceHasNoAudio:
            return "This recording has no readable audio track to transcribe."
        case .noFinalizedSpeech:
            return "Apple Speech returned no finalized speech. The source remains unchanged; try again or use cloud transcription later."
        case .accountUnavailable:
            return "Sign in online with the recording's owning Quipsly account before attaching its transcript."
        case .accountChanged:
            return "The signed-in Quipsly account changed. The protected local transcript was preserved and not submitted."
        case .localStorageUnavailable:
            return "Protected Application Support storage is unavailable. Quipsly did not claim the transcript was saved."
        case .verifiedUploadRequired:
            return "The transcript is saved only on this device. Upload and verify the exact recording before attaching it to the Session."
        case .serverRejected(let message, _):
            return message
        }
    }
}

private extension OnDeviceTranscriptFailure {
    var isRetryableDeliveryFailure: Bool {
        guard case .serverRejected(_, let statusCode) = self,
              let statusCode else {
            return false
        }
        return OnDeviceTranscriptDeliveryPolicy.shouldRetry(
            httpStatusCode: statusCode
        )
    }

    var cloudFallbackReasonCode: String? {
        switch self {
        case .unavailable:
            "apple-speech-unavailable"
        case .unsupportedLocale:
            "apple-speech-unsupported-locale"
        case .speechPermissionDenied:
            "apple-speech-permission-denied"
        case .modelInstallFailed:
            "apple-speech-model-install-failed"
        case .sourceUnavailable:
            "local-source-unavailable-after-upload"
        case .sourceChanged:
            "local-source-changed-after-upload"
        case .noFinalizedSpeech:
            "apple-speech-no-finalized-text"
        case .localStorageUnavailable:
            "local-transcript-storage-unavailable"
        case .modelDownloadRequired, .sourceHasNoAudio, .accountUnavailable,
             .accountChanged, .verifiedUploadRequired, .serverRejected:
            nil
        }
    }
}

/// Cloud ASR is an accuracy/reliability fallback for speech recognition, not a
/// generic recovery mechanism for every operation that happens after Stop.
/// Keep this stage explicit so an unexpected local persistence or attachment
/// error cannot silently turn into paid provider work.
private enum OnDeviceTranscriptAttemptStage {
    case preparingSource
    case recognizingSpeech
    case preservingDeviceResult

    var allowsUnknownCloudFallback: Bool {
        self == .recognizingSpeech
    }
}

private extension Digest {
    nonisolated var hexString: String { map { String(format: "%02x", $0) }.joined() }
}

private final class OnDeviceTranscriptExportSessionBox: @unchecked Sendable {
    let value: AVAssetExportSession

    init(_ value: AVAssetExportSession) {
        self.value = value
    }
}

private enum OnDeviceTranscriptSource {
    struct Fingerprint: Equatable, Sendable {
        let sha256: String
        let byteCount: Int64
    }

    nonisolated static func fingerprint(_ fileURL: URL) throws -> Fingerprint {
        guard fileURL.isFileURL,
              FileManager.default.fileExists(atPath: fileURL.path),
              let handle = try? FileHandle(forReadingFrom: fileURL) else {
            throw OnDeviceTranscriptFailure.sourceUnavailable
        }
        defer { try? handle.close() }
        var hasher = SHA256()
        var byteCount: Int64 = 0
        while true {
            guard let data = try handle.read(upToCount: 1024 * 1024), !data.isEmpty else { break }
            hasher.update(data: data)
            byteCount += Int64(data.count)
        }
        guard byteCount > 0 else { throw OnDeviceTranscriptFailure.sourceUnavailable }
        return Fingerprint(sha256: hasher.finalize().hexString, byteCount: byteCount)
    }

    static func audioFileURL(for sourceURL: URL, mediaKind: LocalRecordingMediaKind) async throws -> (url: URL, isTemporary: Bool) {
        if mediaKind == .audio {
            return (sourceURL, false)
        }
        let asset = AVURLAsset(url: sourceURL)
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        guard !audioTracks.isEmpty else { throw OnDeviceTranscriptFailure.sourceHasNoAudio }
        let outputURL = FileManager.default.temporaryDirectory
            .appendingPathComponent("quipsly-transcript-\(UUID().uuidString.lowercased())")
            .appendingPathExtension("m4a")
        guard let export = AVAssetExportSession(asset: asset, presetName: AVAssetExportPresetAppleM4A) else {
            throw OnDeviceTranscriptFailure.sourceHasNoAudio
        }
        export.outputURL = outputURL
        export.outputFileType = .m4a
        let exportBox = OnDeviceTranscriptExportSessionBox(export)
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            export.exportAsynchronously {
                switch exportBox.value.status {
                case .completed:
                    continuation.resume()
                case .failed, .cancelled:
                    continuation.resume(throwing: exportBox.value.error ?? OnDeviceTranscriptFailure.sourceHasNoAudio)
                default:
                    continuation.resume(throwing: OnDeviceTranscriptFailure.sourceHasNoAudio)
                }
            }
        }
        try FileManager.default.setAttributes(
            [.protectionKey: FileProtectionType.complete],
            ofItemAtPath: outputURL.path
        )
        return (outputURL, true)
    }
}

@available(iOS 26.0, *)
private enum AppleOnDeviceTranscriptEngine {
    struct Prepared: Sendable {
        let transcriber: SpeechTranscriber
        let locale: Locale
        let assetStatus: AssetInventory.Status
    }

    static func prepare(locale requestedLocale: Locale, allowModelDownload: Bool) async throws -> Prepared {
        guard SpeechTranscriber.isAvailable else { throw OnDeviceTranscriptFailure.unavailable }
        guard let locale = await SpeechTranscriber.supportedLocale(equivalentTo: requestedLocale) else {
            throw OnDeviceTranscriptFailure.unsupportedLocale
        }
        // Exact source return is a product invariant, so request the audio time
        // range explicitly instead of relying on the plain `.transcription`
        // preset, which does not include time-indexed result attributes.
        let transcriber = SpeechTranscriber(
            locale: locale,
            transcriptionOptions: [],
            reportingOptions: [],
            attributeOptions: [.audioTimeRange]
        )
        let modules: [any SpeechModule] = [transcriber]
        var status = await AssetInventory.status(forModules: modules)
        if status != .installed {
            guard allowModelDownload else {
                throw OnDeviceTranscriptFailure.modelDownloadRequired(locale.identifier)
            }
            do {
                if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
                    try await request.downloadAndInstall()
                }
                status = await AssetInventory.status(forModules: modules)
            } catch {
                throw OnDeviceTranscriptFailure.modelInstallFailed(error.localizedDescription)
            }
        }
        guard status == .installed else {
            throw OnDeviceTranscriptFailure.modelInstallFailed("Apple did not report the model as installed.")
        }
        return Prepared(transcriber: transcriber, locale: locale, assetStatus: status)
    }

    static func transcribe(
        fileURL: URL,
        prepared: Prepared,
        contextualPhrases: [String]
    ) async throws -> [OnDeviceTranscriptSegment] {
        let audioFile: AVAudioFile
        do {
            audioFile = try AVAudioFile(forReading: fileURL)
        } catch {
            throw OnDeviceTranscriptFailure.sourceHasNoAudio
        }
        let analyzer = SpeechAnalyzer(modules: [prepared.transcriber])
        if !contextualPhrases.isEmpty {
            let context = AnalysisContext()
            context.contextualStrings[.general] = Array(contextualPhrases.prefix(100))
            try? await analyzer.setContext(context)
        }
        async let resultCollection = collectFinalResults(from: prepared.transcriber)
        if let lastSample = try await analyzer.analyzeSequence(from: audioFile) {
            try await analyzer.finalizeAndFinish(through: lastSample)
        } else {
            await analyzer.cancelAndFinishNow()
        }
        let segments = try await resultCollection
        guard !segments.isEmpty else { throw OnDeviceTranscriptFailure.noFinalizedSpeech }
        return segments.sorted {
            if $0.startSeconds == $1.startSeconds { return $0.endSeconds < $1.endSeconds }
            return $0.startSeconds < $1.startSeconds
        }
    }

    private static func collectFinalResults(from transcriber: SpeechTranscriber) async throws -> [OnDeviceTranscriptSegment] {
        var segments: [OnDeviceTranscriptSegment] = []
        for try await result in transcriber.results {
            guard result.isFinal else { continue }
            let value = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
            let start = result.range.start.seconds
            let end = result.range.end.seconds
            guard !value.isEmpty, start.isFinite, end.isFinite, start >= 0, end > start else { continue }
            segments.append(OnDeviceTranscriptSegment(startSeconds: start, endSeconds: end, text: value))
        }
        return segments
    }
}

/// Apple's DictationTranscriber has a dedicated atypical-speech content hint.
/// Quipsly uses it only when the signed-in person has opted into speech
/// adaptation. Both live preview and the finished source-bound transcript use
/// the same profile; the immutable recording remains truth and is transcribed
/// again after Stop before Quipsly creates editable writing.
@available(iOS 26.0, *)
private enum AppleSpeechAdaptedTranscriptEngine {
    struct Prepared: Sendable {
        let transcriber: DictationTranscriber
        let locale: Locale
        let assetStatus: AssetInventory.Status
    }

    static func prepare(locale requestedLocale: Locale, allowModelDownload: Bool) async throws -> Prepared {
        guard let locale = await DictationTranscriber.supportedLocale(equivalentTo: requestedLocale) else {
            throw OnDeviceTranscriptFailure.unsupportedLocale
        }
        let transcriber = DictationTranscriber(
            locale: locale,
            contentHints: [.atypicalSpeech],
            transcriptionOptions: [.punctuation],
            reportingOptions: [],
            attributeOptions: [.audioTimeRange]
        )
        let modules: [any SpeechModule] = [transcriber]
        var status = await AssetInventory.status(forModules: modules)
        if status != .installed {
            guard allowModelDownload else {
                throw OnDeviceTranscriptFailure.modelDownloadRequired(locale.identifier)
            }
            do {
                if let request = try await AssetInventory.assetInstallationRequest(supporting: modules) {
                    try await request.downloadAndInstall()
                }
                status = await AssetInventory.status(forModules: modules)
            } catch {
                throw OnDeviceTranscriptFailure.modelInstallFailed(error.localizedDescription)
            }
        }
        guard status == .installed else {
            throw OnDeviceTranscriptFailure.modelInstallFailed("Apple did not report the adapted speech model as installed.")
        }
        return Prepared(transcriber: transcriber, locale: locale, assetStatus: status)
    }

    static func transcribe(
        fileURL: URL,
        prepared: Prepared,
        contextualPhrases: [String]
    ) async throws -> [OnDeviceTranscriptSegment] {
        let audioFile: AVAudioFile
        do {
            audioFile = try AVAudioFile(forReading: fileURL)
        } catch {
            throw OnDeviceTranscriptFailure.sourceHasNoAudio
        }
        let analyzer = SpeechAnalyzer(modules: [prepared.transcriber])
        if !contextualPhrases.isEmpty {
            let context = AnalysisContext()
            context.contextualStrings[.general] = Array(contextualPhrases.prefix(100))
            try? await analyzer.setContext(context)
        }
        async let resultCollection = collectResults(from: prepared.transcriber)
        if let lastSample = try await analyzer.analyzeSequence(from: audioFile) {
            try await analyzer.finalizeAndFinish(through: lastSample)
        } else {
            await analyzer.cancelAndFinishNow()
        }
        let segments = try await resultCollection
        guard !segments.isEmpty else { throw OnDeviceTranscriptFailure.noFinalizedSpeech }
        return segments.sorted {
            if $0.startSeconds == $1.startSeconds { return $0.endSeconds < $1.endSeconds }
            return $0.startSeconds < $1.startSeconds
        }
    }

    private static func collectResults(
        from transcriber: DictationTranscriber
    ) async throws -> [OnDeviceTranscriptSegment] {
        var segments: [OnDeviceTranscriptSegment] = []
        // No volatile-results reporting option is requested, so this sequence
        // contains only stable dictation results suitable for the draft seed.
        for try await result in transcriber.results {
            let value = String(result.text.characters).trimmingCharacters(in: .whitespacesAndNewlines)
            let start = result.range.start.seconds
            let end = result.range.end.seconds
            guard !value.isEmpty, start.isFinite, end.isFinite, start >= 0, end > start else { continue }
            segments.append(OnDeviceTranscriptSegment(startSeconds: start, endSeconds: end, text: value))
        }
        return segments
    }
}

/// iOS 17–25 compatibility path. Newer devices use SpeechAnalyzer above for
/// long-form, low-latency transcription. This fallback keeps the same timed,
/// immutable source contract instead of making Voice Notes an iOS 26-only
/// feature. Apple performs recognition on device when the recognizer reports
/// that capability; older hardware can use Apple's speech service.
private enum AppleCompatibleTranscriptEngine {
    struct Result: Sendable {
        let segments: [OnDeviceTranscriptSegment]
        let recognitionExecution: String
        let language: String
        let transcriber: String
        let preset: String
    }

    static func transcribe(
        fileURL: URL,
        locale: Locale,
        contextualPhrases: [String]
    ) async throws -> Result {
        let authorization = await speechAuthorization()
        guard authorization == .authorized else {
            throw OnDeviceTranscriptFailure.speechPermissionDenied
        }
        guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
            throw OnDeviceTranscriptFailure.unsupportedLocale
        }

        let request = SFSpeechURLRecognitionRequest(url: fileURL)
        request.shouldReportPartialResults = false
        request.contextualStrings = Array(contextualPhrases.prefix(100))
        if #available(iOS 16.0, *) {
            request.addsPunctuation = true
        }
        let usesOnDeviceRecognition = recognizer.supportsOnDeviceRecognition
        if usesOnDeviceRecognition {
            request.requiresOnDeviceRecognition = true
        }

        let segments = try await withCheckedThrowingContinuation {
            (continuation: CheckedContinuation<[OnDeviceTranscriptSegment], Error>) in
            let gate = LegacySpeechContinuationGate(continuation)
            recognizer.recognitionTask(with: request) { result, error in
                if let result, result.isFinal {
                    let segments = phraseSegments(from: result.bestTranscription.segments)
                    guard !segments.isEmpty else {
                        gate.resume(throwing: OnDeviceTranscriptFailure.noFinalizedSpeech)
                        return
                    }
                    gate.resume(returning: segments)
                } else if let error {
                    gate.resume(throwing: error)
                }
            }
        }

        return Result(
            segments: segments,
            recognitionExecution: usesOnDeviceRecognition ? "on-device" : "apple-speech-service",
            language: recognizer.locale.identifier,
            transcriber: "SFSpeechRecognizer",
            preset: usesOnDeviceRecognition
                ? "url-final-time-indexed-on-device-v1"
                : "url-final-time-indexed-apple-service-v1"
        )
    }

    private static func speechAuthorization() async -> SFSpeechRecognizerAuthorizationStatus {
        let current = SFSpeechRecognizer.authorizationStatus()
        guard current == .notDetermined else { return current }
        return await withCheckedContinuation { continuation in
            SFSpeechRecognizer.requestAuthorization { status in
                continuation.resume(returning: status)
            }
        }
    }

    private static func phraseSegments(
        from words: [SFTranscriptionSegment]
    ) -> [OnDeviceTranscriptSegment] {
        var output: [OnDeviceTranscriptSegment] = []
        var phraseWords: [String] = []
        var phraseStart: Double?
        var phraseEnd: Double = 0

        func flush() {
            guard let start = phraseStart, !phraseWords.isEmpty, phraseEnd > start else { return }
            output.append(
                OnDeviceTranscriptSegment(
                    startSeconds: start,
                    endSeconds: phraseEnd,
                    text: phraseWords.joined(separator: " ")
                )
            )
            phraseWords.removeAll(keepingCapacity: true)
            phraseStart = nil
            phraseEnd = 0
        }

        for word in words {
            let text = word.substring.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty,
                  word.timestamp.isFinite,
                  word.duration.isFinite,
                  word.timestamp >= 0 else { continue }
            phraseStart = phraseStart ?? word.timestamp
            phraseEnd = max(phraseEnd, word.timestamp + max(word.duration, 0.01))
            phraseWords.append(text)
            let endsSentence = text.last.map { ".!?".contains($0) } == true
            let phraseDuration = phraseEnd - (phraseStart ?? phraseEnd)
            if endsSentence || phraseWords.count >= 14 || phraseDuration >= 9 {
                flush()
            }
        }
        flush()
        return output
    }
}

private final class LegacySpeechContinuationGate: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<[OnDeviceTranscriptSegment], Error>?

    init(_ continuation: CheckedContinuation<[OnDeviceTranscriptSegment], Error>) {
        self.continuation = continuation
    }

    func resume(returning value: [OnDeviceTranscriptSegment]) {
        take()?.resume(returning: value)
    }

    func resume(throwing error: Error) {
        take()?.resume(throwing: error)
    }

    private func take() -> CheckedContinuation<[OnDeviceTranscriptSegment], Error>? {
        lock.lock()
        defer { lock.unlock() }
        let value = continuation
        continuation = nil
        return value
    }
}

@MainActor
final class OnDeviceTranscriptManager: ObservableObject {
    static let shared = OnDeviceTranscriptManager()

    @Published private(set) var phases: [UUID: OnDeviceTranscriptPhase] = [:]
    private var activeTasks: [UUID: Task<Void, Never>] = [:]
    private var backgroundProtectionIdentifiers: [UUID: UIBackgroundTaskIdentifier] = [:]
    private var pendingVerifiedUploadWakeups: Set<UUID> = []

    private let nestBaseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )

    private init() {}

    func phase(for recordingId: UUID) -> OnDeviceTranscriptPhase {
        phases[recordingId] ?? .idle
    }

    func storedTranscript(for recordingId: UUID) -> OnDeviceTranscriptSidecar? {
        try? OnDeviceTranscriptStore.load(for: recordingId)?.sidecar
    }

    func restoreState(for recording: LocalRecording) {
        guard phases[recording.id] == nil else { return }
        if let stored = try? OnDeviceTranscriptStore.load(for: recording.id) {
            if let receipt = try? OnDeviceTranscriptStore.loadSubmissionReceipt(
                for: recording.id,
                clientRequestId: stored.sidecar.clientRequestId,
                expectedSidecarSha256: stored.sha256
            ) {
                phases[recording.id] = .attached(
                    transcriptJobId: receipt.transcriptJobId,
                    segmentCount: stored.sidecar.segments.count
                )
            } else {
                phases[recording.id] = recording.status.isVerified
                    ? .savedLocally(segmentCount: stored.sidecar.segments.count)
                    : .waitingForVerifiedUpload(segmentCount: stored.sidecar.segments.count)
            }
            return
        }
        if let jobId = recording.cloudTranscriptFallbackJobId,
           let status = recording.cloudTranscriptFallbackStatus,
           recording.cloudTranscriptFallbackAcceptedAt != nil {
            switch status.uppercased() {
            case "FAILED", "HELD":
                phases[recording.id] = .failed(
                    message: recording.cloudTranscriptFallbackError
                        ?? "The cloud transcript did not finish. The exact recording remains safe and can be tried again.",
                    retryable: true
                )
            default:
                phases[recording.id] = .cloudFallback(
                    transcriptJobId: jobId,
                    status: status.uppercased()
                )
            }
        }
    }

    /// Reconciles Nest's per-source transcript projection into the protected
    /// local ledger. A Session may contain several participant recordings, so
    /// room-level "latest transcript" state is insufficient: exact asset,
    /// SHA-256, byte count, and canonical job identity must all agree.
    func reconcileCanonicalTranscriptSources(_ sources: [MobileCaptureSourceSummary]) {
        LocalRecordingLibrary.shared.activateOwner(
            AuthManager.currentStoredOwnerID()
        )
        let sourcesByAssetID = Dictionary(
            sources.map { ($0.recordingAssetId, $0) },
            uniquingKeysWith: { current, _ in current }
        )
        for recording in LocalRecordingLibrary.shared.recordings {
            guard let recordingAssetID = recording.recordingAssetId,
                  let transcriptJobID = recording.cloudTranscriptFallbackJobId,
                  recording.cloudTranscriptFallbackAcceptedAt != nil,
                  let expectedSHA256 = recording.verifiedCloudSHA256?.lowercased(),
                  let expectedSize = recording.verifiedCloudSizeBytes,
                  let source = sourcesByAssetID[recordingAssetID],
                  source.exactBytesVerified == true,
                  source.recordingStatus?.uppercased() == "VERIFIED",
                  source.sha256?.lowercased() == expectedSHA256,
                  source.byteSize == String(expectedSize),
                  let transcript = source.transcript,
                  transcript.id == transcriptJobID,
                  let status = transcript.status?.uppercased() else {
                continue
            }
            do {
                try LocalRecordingLibrary.shared.reconcileCloudTranscriptFallback(
                    recording.id,
                    transcriptJobId: transcriptJobID,
                    status: status,
                    errorMessage: transcript.errorMessage
                )
                switch status {
                case "FAILED", "HELD":
                    phases[recording.id] = .failed(
                        message: transcript.errorMessage
                            ?? "The cloud transcript did not finish. The exact recording remains safe and can be tried again.",
                        retryable: true
                    )
                default:
                    phases[recording.id] = .cloudFallback(
                        transcriptJobId: transcriptJobID,
                        status: status
                    )
                }
            } catch {
                // A stale or cross-account Session projection must never
                // replace the protected local source ledger.
                continue
            }
        }
    }

    func begin(
        recording: LocalRecording,
        fileURL: URL,
        allowModelDownload: Bool = false,
        locale: Locale = Locale(identifier: "en-US")
    ) {
        guard !phase(for: recording.id).isBusy,
              activeTasks[recording.id] == nil else { return }
        startProtectedWork(
            recordingID: recording.id,
            name: "Transcribe recording"
        ) { [weak self] in
            await self?.transcribe(
                recording: recording,
                fileURL: fileURL,
                allowModelDownload: allowModelDownload,
                locale: locale
            )
        }
    }

    /// “Speak to write” is one user intent, not a recording followed by a
    /// speech-tools setup workflow. Apple keeps SpeechTranscriber assets in
    /// system storage and updates them independently, so voice writing always
    /// installs the required locale asset when it is not already available.
    func beginVoiceWriting(
        recording: LocalRecording,
        fileURL: URL,
        locale: Locale = Locale(identifier: "en-US")
    ) {
        begin(
            recording: recording,
            fileURL: fileURL,
            allowModelDownload: true,
            locale: locale
        )
    }

    /// Starts the ordinary post-capture path for a finalized participant-owned
    /// master. Model assets are system-managed and may be installed after Stop;
    /// this work never delays or mutates the original recording.
    func beginAutomaticTranscript(
        recording: LocalRecording,
        fileURL: URL,
        locale: Locale = Locale(identifier: "en-US")
    ) {
        guard recording.shouldBeginAutomaticOnDeviceTranscript else { return }
        guard phase(for: recording.id) == .idle else { return }
        begin(
            recording: recording,
            fileURL: fileURL,
            allowModelDownload: true,
            locale: locale
        )
    }

    func submitSavedTranscript(recording: LocalRecording) {
        guard !phase(for: recording.id).isBusy,
              activeTasks[recording.id] == nil else { return }
        startProtectedWork(
            recordingID: recording.id,
            name: "Attach recording transcript"
        ) { [weak self] in
            await self?.submit(recording: recording)
        }
    }

    func submitPendingCloudFallback(recording: LocalRecording) {
        guard !phase(for: recording.id).isBusy,
              activeTasks[recording.id] == nil else { return }
        startProtectedWork(
            recordingID: recording.id,
            name: "Request transcript fallback"
        ) { [weak self] in
            await self?.submitCloudFallback(recording: recording)
        }
    }

    /// Wakes transcript delivery from the exact recording projection that was
    /// durably updated by UploadManager. Audio and video share this path; it
    /// does not depend on a particular recorder screen or notification observer
    /// still being alive when cloud verification completes.
    func verifiedUploadDidFinish(recording: LocalRecording) {
        guard recording.status.isVerified,
              recording.shouldBeginAutomaticOnDeviceTranscript else {
            return
        }
        // Upload verification and on-device recognition deliberately run in
        // parallel. The verification callback can therefore arrive while the
        // recognition task is preserving text or recording a durable cloud
        // fallback intent. Do not drop that edge merely because this source is
        // momentarily busy: replay it exactly once from the latest protected
        // recording projection as soon as the active task has finished.
        if activeTasks[recording.id] != nil {
            pendingVerifiedUploadWakeups.insert(recording.id)
            return
        }
        if (try? OnDeviceTranscriptStore.load(for: recording.id)) != nil {
            submitSavedTranscript(recording: recording)
        } else if recording.cloudTranscriptFallbackRequestId != nil,
                  recording.cloudTranscriptFallbackAcceptedAt == nil {
            submitPendingCloudFallback(recording: recording)
        }
    }

    /// Reconciles transcript intent from the durable recording ledger rather
    /// than relying on a person to revisit one particular Library row. Work is
    /// serialized so a launch with several long masters cannot make every
    /// speech engine compete for memory at once.
    @discardableResult
    func resumeEligibleRecordings(
        maximumRecordings: Int? = nil,
        retryFailures: Bool = false
    ) async -> Int {
        LocalRecordingLibrary.shared.activateOwner(AuthManager.currentStoredOwnerID())
        var processed = 0
        for recording in LocalRecordingLibrary.shared.recordings {
            guard !Task.isCancelled else { break }
            if let maximumRecordings, processed >= maximumRecordings { break }
            if retryFailures, case .failed = phase(for: recording.id) {
                phases[recording.id] = nil
            }
            restoreState(for: recording)
            let currentPhase = phase(for: recording.id)
            if currentPhase.isBusy { continue }
            if case .failed = currentPhase { continue }
            if case .attached = currentPhase { continue }
            if case .cloudFallback = currentPhase { continue }

            if let stored = try? OnDeviceTranscriptStore.load(for: recording.id) {
                if (try? OnDeviceTranscriptStore.loadSubmissionReceipt(
                    for: recording.id,
                    clientRequestId: stored.sidecar.clientRequestId,
                    expectedSidecarSha256: stored.sha256
                )) != nil {
                    continue
                }
                guard recording.status.isVerified else { continue }
                submitSavedTranscript(recording: recording)
                await waitForActiveTask(recordingID: recording.id)
                processed += 1
                continue
            }

            if recording.cloudTranscriptFallbackRequestId != nil,
               recording.cloudTranscriptFallbackAcceptedAt == nil {
                guard recording.status.isVerified else { continue }
                submitPendingCloudFallback(recording: recording)
                await waitForActiveTask(recordingID: recording.id)
                processed += 1
                continue
            }

            guard recording.shouldBeginAutomaticOnDeviceTranscript,
                  currentPhase == .idle,
                  recording.status.isPlaybackEligible,
                  recording.cloudTranscriptFallbackAcceptedAt == nil else {
                continue
            }
            guard let fileURL = LocalRecordingLibrary.shared.fileURL(for: recording) else {
                guard recording.status.isVerified,
                      recording.serverVerificationStatus?.lowercased() == "verified" else {
                    continue
                }
                do {
                    try LocalRecordingLibrary.shared.markCloudTranscriptFallbackNeeded(
                        recording.id,
                        requestId: recording.cloudTranscriptFallbackRequestId ?? UUID(),
                        reasonCode: "local-source-unavailable-after-upload"
                    )
                    if let current = LocalRecordingLibrary.shared.recording(id: recording.id) {
                        submitPendingCloudFallback(recording: current)
                        await waitForActiveTask(recordingID: recording.id)
                        processed += 1
                    }
                } catch {
                    phases[recording.id] = .failed(
                        message: error.localizedDescription,
                        retryable: true
                    )
                }
                continue
            }
            beginAutomaticTranscript(recording: recording, fileURL: fileURL)
            await waitForActiveTask(recordingID: recording.id)
            processed += 1
        }
        return processed
    }

    func hasPendingEligibleWork() -> Bool {
        LocalRecordingLibrary.shared.recordings.contains { recording in
            guard recording.shouldBeginAutomaticOnDeviceTranscript else {
                return false
            }
            let currentPhase = phase(for: recording.id)
            if case .failed = currentPhase { return false }
            if case .attached = currentPhase { return false }
            if case .cloudFallback = currentPhase { return false }
            if case .modelDownloadRequired = currentPhase { return false }
            if let stored = try? OnDeviceTranscriptStore.load(for: recording.id) {
                let receipt = try? OnDeviceTranscriptStore.loadSubmissionReceipt(
                    for: recording.id,
                    clientRequestId: stored.sidecar.clientRequestId,
                    expectedSidecarSha256: stored.sha256
                )
                return receipt == nil && recording.status.isVerified
            }
            if recording.cloudTranscriptFallbackRequestId != nil,
               recording.cloudTranscriptFallbackAcceptedAt == nil {
                return recording.status.isVerified
            }
            if recording.cloudTranscriptFallbackAcceptedAt != nil { return false }
            guard recording.status.isPlaybackEligible else { return false }
            if LocalRecordingLibrary.shared.fileURL(for: recording) != nil {
                return true
            }
            return recording.status.isVerified
                && recording.serverVerificationStatus?.lowercased() == "verified"
        }
    }

    private func startProtectedWork(
        recordingID: UUID,
        name: String,
        operation: @escaping @MainActor () async -> Void
    ) {
        OnDeviceTranscriptBackgroundCoordinator.shared.schedule()
        let protectionIdentifier = UIApplication.shared.beginBackgroundTask(
            withName: "Quipsly: \(name)"
        ) { [weak self] in
            Task { @MainActor in
                self?.interruptForSystemExpiration(recordingID: recordingID)
            }
        }
        backgroundProtectionIdentifiers[recordingID] = protectionIdentifier
        activeTasks[recordingID] = Task { [weak self] in
            await operation()
            self?.finishProtectedWork(recordingID: recordingID)
        }
    }

    private func waitForActiveTask(recordingID: UUID) async {
        guard let activeTask = activeTasks[recordingID] else { return }
        await withTaskCancellationHandler {
            await activeTask.value
        } onCancel: {
            Task { @MainActor in
                OnDeviceTranscriptManager.shared.interruptForSystemExpiration(
                    recordingID: recordingID
                )
            }
        }
    }

    private func interruptForSystemExpiration(recordingID: UUID) {
        activeTasks[recordingID]?.cancel()
    }

    private func finishProtectedWork(recordingID: UUID) {
        activeTasks[recordingID] = nil
        if let identifier = backgroundProtectionIdentifiers.removeValue(forKey: recordingID),
           identifier != .invalid {
            UIApplication.shared.endBackgroundTask(identifier)
        }
        guard pendingVerifiedUploadWakeups.remove(recordingID) != nil,
              let recording = LocalRecordingLibrary.shared.recording(id: recordingID) else {
            return
        }
        verifiedUploadDidFinish(recording: recording)
    }

    private func transcribe(
        recording: LocalRecording,
        fileURL: URL,
        allowModelDownload: Bool,
        locale: Locale
    ) async {
        var attemptStage = OnDeviceTranscriptAttemptStage.preparingSource
        if #available(iOS 26.0, *) {
            phases[recording.id] = allowModelDownload
                ? .installingModel(progress: nil)
                : .checkingSupport
        } else {
            phases[recording.id] = .checkingSupport
        }
        do {
            guard let ownerAccountId = recording.ownerAccountID?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !ownerAccountId.isEmpty else {
                throw OnDeviceTranscriptFailure.accountUnavailable
            }
            let recognitionProfile = VoiceWritingRecognitionPreferences.shared.profile(
                for: ownerAccountId
            )
            let contextualPhrases = VoiceWritingRecognitionContext.mergedPhrases(
                learnedPhrases: VoiceWritingRecognitionPreferences.shared.learnedPhrases(
                    for: ownerAccountId
                ),
                sessionTitle: recording.sessionTitle,
                context: VoiceWritingDraftStore.shared.recognitionContext(for: recording)
            )
            let before = try await Task.detached(priority: .utility) {
                try OnDeviceTranscriptSource.fingerprint(fileURL)
            }.value
            try Task.checkCancellation()
            phases[recording.id] = .transcribing
            let preparedAudio = try await OnDeviceTranscriptSource.audioFileURL(
                for: fileURL,
                mediaKind: recording.effectiveMediaKind
            )
            try Task.checkCancellation()
            defer {
                if preparedAudio.isTemporary { try? FileManager.default.removeItem(at: preparedAudio.url) }
            }
            let segments: [OnDeviceTranscriptSegment]
            let language: String
            let recognitionExecution: String
            let transcriber: String
            let preset: String
            let modelAssetStatus: String
            attemptStage = .recognizingSpeech
            if #available(iOS 26.0, *) {
                if recognitionProfile == .speechAdaptation {
                    do {
                        let prepared = try await AppleSpeechAdaptedTranscriptEngine.prepare(
                            locale: locale,
                            allowModelDownload: allowModelDownload
                        )
                        segments = try await AppleSpeechAdaptedTranscriptEngine.transcribe(
                            fileURL: preparedAudio.url,
                            prepared: prepared,
                            contextualPhrases: contextualPhrases
                        )
                        language = prepared.locale.identifier
                        recognitionExecution = "on-device"
                        transcriber = "DictationTranscriber"
                        preset = "atypical-speech-final-time-indexed-v1"
                        modelAssetStatus = "installed"
                    } catch {
                        // Adaptation is an accuracy preference, never a gate to
                        // receiving writing. Fall back to the ordinary long-form
                        // engine if Apple cannot use the adapted model here.
                        let result = try await standardTranscriptResult(
                            fileURL: preparedAudio.url,
                            locale: locale,
                            allowModelDownload: allowModelDownload,
                            contextualPhrases: contextualPhrases
                        )
                        segments = result.segments
                        language = result.language
                        recognitionExecution = result.recognitionExecution
                        transcriber = result.transcriber
                        preset = result.preset
                        modelAssetStatus = result.modelAssetStatus
                    }
                } else {
                    let result = try await standardTranscriptResult(
                        fileURL: preparedAudio.url,
                        locale: locale,
                        allowModelDownload: allowModelDownload,
                        contextualPhrases: contextualPhrases
                    )
                    segments = result.segments
                    language = result.language
                    recognitionExecution = result.recognitionExecution
                    transcriber = result.transcriber
                    preset = result.preset
                    modelAssetStatus = result.modelAssetStatus
                }
            } else {
                let result = try await AppleCompatibleTranscriptEngine.transcribe(
                    fileURL: preparedAudio.url,
                    locale: locale,
                    contextualPhrases: contextualPhrases
                )
                segments = result.segments
                language = result.language
                recognitionExecution = result.recognitionExecution
                transcriber = result.transcriber
                preset = result.preset
                modelAssetStatus = result.recognitionExecution == "on-device"
                    ? "built-in"
                    : "apple-service"
            }
            attemptStage = .preservingDeviceResult
            try Task.checkCancellation()
            let after = try await Task.detached(priority: .utility) {
                try OnDeviceTranscriptSource.fingerprint(fileURL)
            }.value
            guard before == after else { throw OnDeviceTranscriptFailure.sourceChanged }
            try Task.checkCancellation()

            let configuration = "Speech|\(transcriber)|\(preset)|final-only|audio-time-range|\(language)"
            let sidecar = OnDeviceTranscriptSidecar(
                schemaVersion: 1,
                clientRequestId: UUID(),
                localRecordingId: recording.id,
                ownerAccountId: ownerAccountId,
                sourceSha256: before.sha256,
                sourceByteCount: before.byteCount,
                language: language,
                createdAt: Date(),
                recognitionExecution: recognitionExecution,
                speakerDiarization: "unavailable",
                // This is editable draft text linked to immutable source time,
                // not paperwork the user must approve before Quipsly can use it.
                humanPlaybackReviewRequired: false,
                engine: .init(
                    framework: "Speech",
                    transcriber: transcriber,
                    preset: preset,
                    configurationHash: SHA256.hash(data: Data(configuration.utf8)).hexString,
                    modelAssetStatus: modelAssetStatus
                ),
                device: .current,
                segments: segments
            )
            _ = try OnDeviceTranscriptStore.save(sidecar)
            if let draft = VoiceWritingDraftStore.shared.seed(
                from: sidecar,
                recording: recording
            ) {
                VoiceWritingDraftSyncClient.shared.schedule(draft, delay: .zero)
            }
            phases[recording.id] = .savedLocally(segmentCount: segments.count)
            // Upload verification and local Speech run concurrently. Refresh
            // the ledger so a fast upload cannot leave this sidecar waiting on
            // the stale pre-upload value captured when transcription began.
            let currentRecording = LocalRecordingLibrary.shared.recording(
                id: recording.id
            ) ?? recording
            await submit(recording: currentRecording)
        } catch OnDeviceTranscriptFailure.modelDownloadRequired(let localeIdentifier) {
            phases[recording.id] = .modelDownloadRequired(locale: localeIdentifier)
        } catch {
            if Task.isCancelled || error is CancellationError {
                phases[recording.id] = .idle
                OnDeviceTranscriptBackgroundCoordinator.shared.schedule()
            } else {
                let fallbackReason: String?
                if let known = error as? OnDeviceTranscriptFailure {
                    fallbackReason = known.cloudFallbackReasonCode
                } else if attemptStage.allowsUnknownCloudFallback {
                    fallbackReason = "apple-speech-processing-failed"
                } else {
                    fallbackReason = nil
                }
                guard let fallbackReason else {
                    phases[recording.id] = .failed(
                        message: error.localizedDescription,
                        retryable: true
                    )
                    return
                }
                let requestId = recording.cloudTranscriptFallbackRequestId ?? UUID()
                do {
                    try LocalRecordingLibrary.shared.markCloudTranscriptFallbackNeeded(
                        recording.id,
                        requestId: requestId,
                        reasonCode: fallbackReason
                    )
                    let current = LocalRecordingLibrary.shared.recording(id: recording.id)
                        ?? recording
                    if current.status.isVerified {
                        await submitCloudFallback(recording: current)
                    } else {
                        phases[recording.id] = .failed(
                            message: "\(error.localizedDescription) Quipsly will use the verified cloud copy once its backup finishes.",
                            retryable: true
                        )
                        OnDeviceTranscriptBackgroundCoordinator.shared.schedule()
                    }
                } catch {
                    phases[recording.id] = .failed(
                        message: error.localizedDescription,
                        retryable: true
                    )
                }
            }
        }
    }

    @available(iOS 26.0, *)
    private func standardTranscriptResult(
        fileURL: URL,
        locale: Locale,
        allowModelDownload: Bool,
        contextualPhrases: [String]
    ) async throws -> (
        segments: [OnDeviceTranscriptSegment],
        language: String,
        recognitionExecution: String,
        transcriber: String,
        preset: String,
        modelAssetStatus: String
    ) {
        do {
            let prepared = try await AppleOnDeviceTranscriptEngine.prepare(
                locale: locale,
                allowModelDownload: allowModelDownload
            )
            return (
                try await AppleOnDeviceTranscriptEngine.transcribe(
                    fileURL: fileURL,
                    prepared: prepared,
                    contextualPhrases: contextualPhrases
                ),
                prepared.locale.identifier,
                "on-device",
                "SpeechTranscriber",
                "custom-final-time-indexed-v1",
                "installed"
            )
        } catch OnDeviceTranscriptFailure.unavailable {
            let result = try await AppleCompatibleTranscriptEngine.transcribe(
                fileURL: fileURL,
                locale: locale,
                contextualPhrases: contextualPhrases
            )
            return (
                result.segments,
                result.language,
                result.recognitionExecution,
                result.transcriber,
                result.preset,
                result.recognitionExecution == "on-device" ? "built-in" : "apple-service"
            )
        } catch OnDeviceTranscriptFailure.unsupportedLocale {
            let result = try await AppleCompatibleTranscriptEngine.transcribe(
                fileURL: fileURL,
                locale: locale,
                contextualPhrases: contextualPhrases
            )
            return (
                result.segments,
                result.language,
                result.recognitionExecution,
                result.transcriber,
                result.preset,
                result.recognitionExecution == "on-device" ? "built-in" : "apple-service"
            )
        }
    }

    private func submitCloudFallback(recording: LocalRecording) async {
        do {
            guard let requestId = recording.cloudTranscriptFallbackRequestId,
                  let reasonCode = recording.cloudTranscriptFallbackReasonCode?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                  !reasonCode.isEmpty,
                  recording.status.isVerified,
                  recording.serverVerificationStatus?.lowercased() == "verified",
                  let recordingAssetId = recording.recordingAssetId?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                  !recordingAssetId.isEmpty,
                  let sourceSha256 = recording.verifiedCloudSHA256?.lowercased(),
                  sourceSha256.range(of: #"^[0-9a-f]{64}$"#, options: .regularExpression) != nil,
                  let sourceByteCount = recording.verifiedCloudSizeBytes,
                  sourceByteCount > 0,
                  let ownerAccountId = recording.ownerAccountID,
                  AuthManager.currentStoredOwnerID() == ownerAccountId else {
                phases[recording.id] = .failed(
                    message: "Cloud transcript fallback is waiting for the verified recording and its owning account.",
                    retryable: true
                )
                OnDeviceTranscriptBackgroundCoordinator.shared.schedule()
                return
            }
            guard let endpoint = URL(
                string: "\(nestBaseURL)/api/mobile/capture/transcripts/cloud-fallback"
            ) else {
                throw OnDeviceTranscriptFailure.serverRejected(
                    "Quipsly's transcript fallback address is invalid."
                )
            }
            phases[recording.id] = .requestingCloudFallback
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.httpBody = try JSONEncoder.quipslyTranscript.encode(
                OnDeviceTranscriptCloudFallbackRequest(
                    clientRequestId: requestId.uuidString.lowercased(),
                    recordingAssetId: recordingAssetId,
                    sourceSha256: sourceSha256,
                    sourceByteCount: String(sourceByteCount),
                    reasonCode: reasonCode
                )
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: ownerAccountId
            )
            let envelope = try? JSONDecoder().decode(
                OnDeviceTranscriptCloudFallbackResponse.self,
                from: data
            )
            guard (200...299).contains(response.statusCode) else {
                throw OnDeviceTranscriptFailure.serverRejected(
                    envelope?.error
                        ?? "Quipsly could not start transcript fallback. The original recording and durable fallback intent remain safe.",
                    statusCode: response.statusCode
                )
            }
            guard let envelope,
                  envelope.ok,
                  let transcriptJobId = envelope.transcriptJobId,
                  !transcriptJobId.isEmpty,
                  let status = envelope.status,
                  !status.isEmpty else {
                throw OnDeviceTranscriptFailure.serverRejected(
                    envelope?.error
                        ?? "Quipsly could not start transcript fallback. The original recording and durable fallback intent remain safe."
                )
            }
            try LocalRecordingLibrary.shared.markCloudTranscriptFallbackAccepted(
                recording.id,
                requestId: requestId,
                transcriptJobId: transcriptJobId,
                status: status
            )
            phases[recording.id] = .cloudFallback(
                transcriptJobId: transcriptJobId,
                status: status.uppercased()
            )
        } catch {
            if Task.isCancelled || error is CancellationError
                || isRetryableDeliveryError(error) {
                // The fallback request ID already lives in the protected
                // recording ledger. Return to idle so launch/background
                // reconciliation can replay the same idempotent request.
                phases[recording.id] = .idle
                OnDeviceTranscriptBackgroundCoordinator.shared.schedule()
            } else {
                phases[recording.id] = .failed(
                    message: error.localizedDescription,
                    retryable: true
                )
                OnDeviceTranscriptBackgroundCoordinator.shared.schedule()
            }
        }
    }

    private func submit(recording: LocalRecording) async {
        do {
            guard let stored = try OnDeviceTranscriptStore.load(for: recording.id) else {
                throw OnDeviceTranscriptFailure.localStorageUnavailable
            }
            guard recording.status.isVerified,
                  recording.serverVerificationStatus?.lowercased() == "verified",
                  let recordingAssetId = recording.recordingAssetId?.trimmingCharacters(in: .whitespacesAndNewlines),
                  !recordingAssetId.isEmpty,
                  let verifiedSha256 = recording.verifiedCloudSHA256?.lowercased(),
                  verifiedSha256 == stored.sidecar.sourceSha256,
                  recording.verifiedCloudSizeBytes == stored.sidecar.sourceByteCount else {
                phases[recording.id] = .waitingForVerifiedUpload(segmentCount: stored.sidecar.segments.count)
                return
            }
            guard AuthManager.currentStoredOwnerID() == stored.sidecar.ownerAccountId else {
                throw OnDeviceTranscriptFailure.accountChanged
            }
            guard let endpoint = URL(string: "\(nestBaseURL)/api/mobile/capture/transcripts/on-device") else {
                throw OnDeviceTranscriptFailure.serverRejected("Quipsly's transcript address is invalid.")
            }

            phases[recording.id] = .submitting(segmentCount: stored.sidecar.segments.count)
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.httpBody = try JSONEncoder.quipslyTranscript.encode(
                OnDeviceTranscriptSubmission(
                    sidecar: stored.sidecar,
                    sidecarSha256: stored.sha256,
                    recordingAssetId: recordingAssetId
                )
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: stored.sidecar.ownerAccountId
            )
            let envelope = try? JSONDecoder().decode(OnDeviceTranscriptResponse.self, from: data)
            guard (200...299).contains(response.statusCode) else {
                throw OnDeviceTranscriptFailure.serverRejected(
                    envelope?.error
                        ?? "Nest could not attach this transcript yet. The protected local transcript remains available.",
                    statusCode: response.statusCode
                )
            }
            guard let envelope,
                  envelope.ok,
                  envelope.status == "COMPLETED",
                  let transcriptJobId = envelope.transcriptJobId,
                  !transcriptJobId.isEmpty else {
                throw OnDeviceTranscriptFailure.serverRejected(
                    envelope?.error ?? "Nest did not accept this transcript. The protected local sidecar remains available for retry."
                )
            }
            let receipt = OnDeviceTranscriptSubmissionReceipt(
                schemaVersion: 1,
                localRecordingId: recording.id,
                clientRequestId: stored.sidecar.clientRequestId,
                sidecarSha256: stored.sha256,
                transcriptJobId: transcriptJobId,
                provider: envelope.provider ?? "apple-speech-transcriber-on-device",
                submittedAt: Date(),
                idempotentReplay: envelope.idempotentReplay ?? false
            )
            try OnDeviceTranscriptStore.saveSubmissionReceipt(receipt)
            try? LocalRecordingLibrary.shared.markOnDeviceTranscriptAttached(
                recording.id,
                transcriptJobId: transcriptJobId
            )
            phases[recording.id] = .attached(
                transcriptJobId: transcriptJobId,
                segmentCount: stored.sidecar.segments.count
            )
        } catch {
            if Task.isCancelled || error is CancellationError
                || isRetryableDeliveryError(error) {
                let segmentCount = (try? OnDeviceTranscriptStore.load(for: recording.id))?
                    .sidecar.segments.count ?? 0
                phases[recording.id] = recording.status.isVerified
                    ? .savedLocally(segmentCount: segmentCount)
                    : .waitingForVerifiedUpload(segmentCount: segmentCount)
                OnDeviceTranscriptBackgroundCoordinator.shared.schedule()
            } else {
                phases[recording.id] = .failed(message: error.localizedDescription, retryable: true)
            }
        }
    }

    private func isRetryableDeliveryError(_ error: Error) -> Bool {
        OnDeviceTranscriptDeliveryPolicy.shouldRetry(transportError: error)
            || (error as? OnDeviceTranscriptFailure)?.isRetryableDeliveryFailure == true
    }
}

@MainActor
final class OnDeviceTranscriptBackgroundCoordinator {
    static let shared = OnDeviceTranscriptBackgroundCoordinator()
    static let processingTaskIdentifier = "com.highgroundodyssey.HighGroundCapture.transcription"

    private var isRegistered = false
    private var activeProcessingWork: Task<Void, Never>?

    private init() {}

    func register() {
        guard !isRegistered else { return }
        isRegistered = BGTaskScheduler.shared.register(
            forTaskWithIdentifier: Self.processingTaskIdentifier,
            using: nil
        ) { task in
            guard let processingTask = task as? BGProcessingTask else {
                task.setTaskCompleted(success: false)
                return
            }
            Task { @MainActor [weak self] in
                self?.handle(processingTask)
            }
        }
    }

    func schedule(earliestBeginDate: Date = Date().addingTimeInterval(60)) {
        guard !CaptureLaunchConfiguration.usesPreviewData else { return }
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.processingTaskIdentifier)
        let request = BGProcessingTaskRequest(identifier: Self.processingTaskIdentifier)
        request.earliestBeginDate = earliestBeginDate
        request.requiresExternalPower = false
        request.requiresNetworkConnectivity = false
        do {
            try BGTaskScheduler.shared.submit(request)
        } catch {
            // Foreground and launch reconciliation remain authoritative. The
            // system scheduler is an additional durable opportunity, and iOS
            // may legitimately reject it when background refresh is disabled.
            print("Could not schedule transcript recovery: \(error.localizedDescription)")
        }
    }

    private func handle(_ task: BGProcessingTask) {
        activeProcessingWork?.cancel()
        task.expirationHandler = { [weak self] in
            Task { @MainActor in self?.activeProcessingWork?.cancel() }
        }
        activeProcessingWork = Task { [weak self] in
            guard let self else {
                task.setTaskCompleted(success: false)
                return
            }
            _ = await OnDeviceTranscriptManager.shared.resumeEligibleRecordings(
                maximumRecordings: 1,
                retryFailures: true
            )
            let completed = !Task.isCancelled
            task.setTaskCompleted(success: completed)
            activeProcessingWork = nil
            if OnDeviceTranscriptManager.shared.hasPendingEligibleWork() {
                schedule()
            }
        }
    }
}

private struct OnDeviceTranscriptCloudFallbackRequest: Encodable {
    let clientRequestId: String
    let recordingAssetId: String
    let sourceSha256: String
    let sourceByteCount: String
    let reasonCode: String
}

private struct OnDeviceTranscriptCloudFallbackResponse: Decodable {
    let ok: Bool
    let status: String?
    let transcriptJobId: String?
    let providerExecutionRequested: Bool?
    let idempotentReplay: Bool?
    let error: String?
    let errorCode: String?
}

private struct OnDeviceTranscriptSubmission: Encodable {
    let clientRequestId: String
    let recordingAssetId: String
    let sourceSha256: String
    let sourceByteCount: String
    let sidecarSha256: String
    let language: String
    let recognitionExecution: String
    let engine: OnDeviceTranscriptSidecar.Engine
    let device: OnDeviceTranscriptSidecar.Device
    let segments: [OnDeviceTranscriptSegment]

    init(sidecar: OnDeviceTranscriptSidecar, sidecarSha256: String, recordingAssetId: String) {
        clientRequestId = sidecar.clientRequestId.uuidString.lowercased()
        self.recordingAssetId = recordingAssetId
        sourceSha256 = sidecar.sourceSha256
        sourceByteCount = String(sidecar.sourceByteCount)
        self.sidecarSha256 = sidecarSha256
        language = sidecar.language
        recognitionExecution = sidecar.recognitionExecution
        engine = sidecar.engine
        device = sidecar.device
        segments = sidecar.segments
    }
}

private struct OnDeviceTranscriptResponse: Decodable {
    let ok: Bool
    let status: String?
    let transcriptJobId: String?
    let provider: String?
    let idempotentReplay: Bool?
    let error: String?
    let errorCode: String?
}

private extension JSONEncoder {
    static var quipslyTranscript: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }
}

private extension OnDeviceTranscriptSidecar.Device {
    static var current: Self {
        let runtime = CaptureRuntimeEvidence.current()
        return .init(
            appVersion: runtime.appVersion,
            appBuild: runtime.appBuild,
            modelIdentifier: runtime.deviceModelIdentifier,
            systemName: runtime.systemName,
            systemVersion: runtime.systemVersion
        )
    }
}
