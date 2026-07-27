import Foundation
import Combine
import AVFoundation

enum LocalRecordingMediaKind: String, Codable, CaseIterable {
    case audio
    case video

    var uploadSourceType: String { rawValue }

    var defaultFileExtension: String {
        switch self {
        case .audio: "m4a"
        case .video: "mov"
        }
    }

    var sourceNoun: String {
        switch self {
        case .audio: "audio"
        case .video: "video"
        }
    }
}

struct LocalRecordingSourceProfile: Codable, Equatable, Sendable {
    let schemaVersion: Int
    var container: String
    var codec: String?
    var width: Int?
    var height: Int?
    var nominalFrameRate: Double?
    var colorSpace: String?
    var orientation: String?
    var cameraPosition: String?
    var cameraDeviceUniqueID: String?
    var captureRotationDegrees: Double?
    var includesAudio: Bool
    var audioSampleRate: Double?
    var audioChannelCount: Int?
    var monotonicStartedNanoseconds: UInt64?
    var monotonicStoppedNanoseconds: UInt64?
    var clockSamples: [LocalRecordingClockSample]?
    var recordedMedia: LocalRecordingRecordedMediaProfile?

    nonisolated init(
        schemaVersion: Int = 1,
        container: String,
        codec: String? = nil,
        width: Int? = nil,
        height: Int? = nil,
        nominalFrameRate: Double? = nil,
        colorSpace: String? = nil,
        orientation: String? = nil,
        cameraPosition: String? = nil,
        cameraDeviceUniqueID: String? = nil,
        captureRotationDegrees: Double? = nil,
        includesAudio: Bool,
        audioSampleRate: Double? = nil,
        audioChannelCount: Int? = nil,
        monotonicStartedNanoseconds: UInt64? = nil,
        monotonicStoppedNanoseconds: UInt64? = nil,
        clockSamples: [LocalRecordingClockSample]? = nil,
        recordedMedia: LocalRecordingRecordedMediaProfile? = nil
    ) {
        self.schemaVersion = schemaVersion
        self.container = container
        self.codec = codec
        self.width = width
        self.height = height
        self.nominalFrameRate = nominalFrameRate
        self.colorSpace = colorSpace
        self.orientation = orientation
        self.cameraPosition = cameraPosition
        self.cameraDeviceUniqueID = cameraDeviceUniqueID
        self.captureRotationDegrees = captureRotationDegrees
        self.includesAudio = includesAudio
        self.audioSampleRate = audioSampleRate
        self.audioChannelCount = audioChannelCount
        self.monotonicStartedNanoseconds = monotonicStartedNanoseconds
        self.monotonicStoppedNanoseconds = monotonicStoppedNanoseconds
        self.clockSamples = clockSamples
        self.recordedMedia = recordedMedia
    }
}

struct LocalRecordingRecordedMediaProfile: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let videoTrackCount: Int
    let audioTrackCount: Int
    let videoCodec: String?
    let encodedWidth: Int?
    let encodedHeight: Int?
    let presentationWidth: Int?
    let presentationHeight: Int?
    let rotationDegrees: Double?
    let nominalFrameRate: Double?
    let audioSampleRate: Double?
    let audioChannelCount: Int?
    let durationSeconds: Double

    nonisolated init(
        schemaVersion: Int = 1,
        videoTrackCount: Int,
        audioTrackCount: Int,
        videoCodec: String?,
        encodedWidth: Int?,
        encodedHeight: Int?,
        presentationWidth: Int?,
        presentationHeight: Int?,
        rotationDegrees: Double?,
        nominalFrameRate: Double?,
        audioSampleRate: Double?,
        audioChannelCount: Int?,
        durationSeconds: Double
    ) {
        self.schemaVersion = schemaVersion
        self.videoTrackCount = videoTrackCount
        self.audioTrackCount = audioTrackCount
        self.videoCodec = videoCodec
        self.encodedWidth = encodedWidth
        self.encodedHeight = encodedHeight
        self.presentationWidth = presentationWidth
        self.presentationHeight = presentationHeight
        self.rotationDegrees = rotationDegrees
        self.nominalFrameRate = nominalFrameRate
        self.audioSampleRate = audioSampleRate
        self.audioChannelCount = audioChannelCount
        self.durationSeconds = durationSeconds
    }
}

struct LocalRecording: Codable, Identifiable, Equatable {
    enum Status: String, Codable, CaseIterable {
        case armed
        case recording
        case paused
        case finalizing
        case saved
        case queued
        case uploading
        case awaitingVerification
        case uploaded
        case uploadHeld
        case recovered
        case validatingRecovery
        case needsRepair
        case captureFailed
        case missingFile
        case deletedLocally

        var isVerified: Bool {
            self == .uploaded
        }

        var isPlaybackEligible: Bool {
            switch self {
            case .saved, .queued, .uploading, .awaitingVerification, .uploaded, .uploadHeld, .recovered:
                return true
            case .armed, .recording, .paused, .finalizing, .validatingRecovery, .needsRepair, .captureFailed, .missingFile, .deletedLocally:
                return false
            }
        }

        var isUploadEligible: Bool {
            isPlaybackEligible
        }
    }

    let id: UUID
    var ownerAccountID: String? = nil
    let fileName: String
    var displayTitle: String
    var sessionTitle: String?
    let startedAt: Date
    var stoppedAt: Date?
    var durationSeconds: TimeInterval
    var byteCount: Int64
    var status: Status

    var projectSlug: String?
    var episodeSlug: String?
    var callRoomId: String?
    var participantId: String?
    var recordingConsentId: String?
    var recordingConsentGranted: Bool
    var recordingAssetId: String?
    var capturePurpose: String?
    // Optional on disk so every pre-video ledger remains decodable. New
    // captures always persist all three fields before media bytes begin.
    var mediaKind: LocalRecordingMediaKind? = nil
    var captureGroupId: UUID? = nil
    var roomStartReceiptId: UUID? = nil
    var sourceProfile: LocalRecordingSourceProfile? = nil
    var recordingSegmentsJson: String?
    var sourceIntegrityHoldReason: String? = nil

    var uploadProgress: Double?
    var uploadedSourceId: String?
    var serverVerificationStatus: String?
    var serverProcessingDisposition: String? = nil
    var serverProcessingHoldReason: String? = nil
    var serverTranscriptDisposition: String? = nil
    var statusMessage: String?
    var localBytesDeletedAt: Date? = nil
    var localBytesDeletedByteCount: Int64? = nil
    var localDeletionCloudVerificationStatus: String? = nil

    var effectiveMediaKind: LocalRecordingMediaKind {
        if let mediaKind { return mediaKind }
        switch URL(fileURLWithPath: fileName).pathExtension.lowercased() {
        case "mov", "mp4", "m4v":
            return .video
        default:
            return .audio
        }
    }

    var encodedSourceProfileJSON: String? {
        guard let sourceProfile else {
            return nil
        }
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
        // Source profiles cross the Swift/TypeScript boundary. The default
        // Date encoding is seconds from Apple's 2001 reference epoch, which is
        // not self-describing JSON. New profiles use ISO 8601; Nest retains a
        // versioned compatibility reader for already-recorded v1 evidence.
        encoder.dateEncodingStrategy = .iso8601
        guard let data = try? encoder.encode(sourceProfile) else { return nil }
        return String(data: data, encoding: .utf8)
    }

    var isUploadEligible: Bool {
        status.isUploadEligible
            && sourceIntegrityHoldReason?.trimmingCharacters(
                in: .whitespacesAndNewlines
            ).isEmpty != false
    }

    var recordedVideoProfileLabel: String? {
        guard effectiveMediaKind == .video,
              let recorded = sourceProfile?.recordedMedia else {
            return nil
        }
        let resolution: String
        if let width = recorded.presentationWidth,
           let height = recorded.presentationHeight {
            if max(width, height) >= 3_840 && min(width, height) >= 2_160 {
                resolution = "4K"
            } else if max(width, height) >= 1_920 && min(width, height) >= 1_080 {
                resolution = "1080p"
            } else {
                resolution = "\(width)×\(height)"
            }
        } else {
            resolution = "resolution verified"
        }
        let frameRate = recorded.nominalFrameRate.map {
            "\(Int($0.rounded())) fps"
        } ?? "frame rate verified"
        let codec: String
        switch recorded.videoCodec?.lowercased() {
        case "hvc1", "hev1", "hevc":
            codec = "HEVC"
        case "avc1", "h264", "h.264":
            codec = "H.264"
        case let value?:
            codec = value.uppercased()
        case nil:
            codec = "codec verified"
        }
        let audio = recorded.audioTrackCount > 0 ? "movie audio" : "video only"
        return "\(resolution) · \(frameRate) · \(codec) · \(audio)"
    }

    var statusLabel: String {
        switch status {
        case .armed:
            return "Armed on this iPhone"
        case .recording:
            return "Recording"
        case .paused:
            return "Paused"
        case .finalizing:
            return "Saving on this iPhone"
        case .saved:
            return "Saved on this iPhone"
        case .queued:
            return "Upload queued"
        case .uploading:
            if let uploadProgress {
                return "Uploading \(Int((uploadProgress * 100).rounded()))%"
            }
            return "Uploading"
        case .awaitingVerification:
            return "Awaiting verification"
        case .uploaded:
            return serverProcessingDisposition?.uppercased() == "HELD"
                ? "Cloud copy verified · review held"
                : "Upload verified"
        case .uploadHeld:
            return "Upload held"
        case .recovered:
            return "Recovered locally"
        case .validatingRecovery:
            return "Validating preserved \(effectiveMediaKind.sourceNoun)"
        case .needsRepair:
            return "\(effectiveMediaKind.sourceNoun.capitalized) needs repair"
        case .captureFailed:
            return "Capture needs review"
        case .missingFile:
            return "File unavailable"
        case .deletedLocally:
            return "Local original deleted"
        }
    }

    var statusDetail: String {
        if let statusMessage, !statusMessage.isEmpty {
            return statusMessage
        }

        switch status {
        case .armed:
            return "Quipsly durably journaled this take before opening the \(effectiveMediaKind.sourceNoun) source. No playable media is claimed yet."
        case .recording:
            return "High-quality \(effectiveMediaKind.sourceNoun) is being written to this iPhone."
        case .paused:
            return "The local file is open and preserved; recording can resume."
        case .finalizing:
            return "Quipsly is closing the \(effectiveMediaKind.sourceNoun) file and updating its local ledger."
        case .saved:
            return "The source file is stored locally and has not been deleted."
        case .queued:
            return "The source file is preserved while its upload waits to start or recover."
        case .uploading:
            return "The source file remains on this iPhone throughout upload."
        case .awaitingVerification:
            return "Upload finished, but Quipsly is still waiting for durable server verification."
        case .uploaded:
            if serverProcessingDisposition?.uppercased() == "HELD" {
                return serverProcessingHoldReason.map {
                    "Quipsly verified and preserved the exact cloud bytes, but editor attachment and transcript processing are held for review: \($0) The local original is still preserved."
                } ?? "Quipsly verified and preserved the exact cloud bytes, but editor attachment and transcript processing are held for review. The local original is still preserved."
            }
            return "Quipsly verified the server copy. The local original is still preserved."
        case .uploadHeld:
            return "Upload needs attention. The local original is still preserved."
        case .recovered:
            return "Quipsly found and decoded this source file on launch. Review it before relying on upload."
        case .validatingRecovery:
            return "Quipsly is validating this preserved \(effectiveMediaKind.sourceNoun) stream through its declared end. Playback and upload remain disabled until that recovery check finishes."
        case .needsRepair:
            return "The source bytes are preserved, but Quipsly could not decode the complete \(effectiveMediaKind.sourceNoun) stream. Do not treat this file as playable until it is repaired or recovered externally."
        case .captureFailed:
            return "Capture did not finish cleanly. Any local source bytes remain preserved."
        case .missingFile:
            return "The ledger entry remains, but its source file is not currently available."
        case .deletedLocally:
            let deletedSize = localBytesDeletedByteCount.map {
                ByteCountFormatter.string(fromByteCount: $0, countStyle: .file)
            } ?? "the local source bytes"
            let verification = localDeletionCloudVerificationStatus == "verified"
                ? "A verified Quipsly cloud copy was recorded at deletion time."
                : "No verified Quipsly cloud copy was recorded at deletion time."
            return "You explicitly deleted \(deletedSize) from this iPhone. The protected audit row remains. \(verification)"
        }
    }

    var userMarkOffsets: [TimeInterval] {
        guard let recordingSegmentsJson,
              let data = recordingSegmentsJson.data(using: .utf8),
              let segments = try? JSONDecoder().decode([RecordingSegment].self, from: data) else { return [] }
        var elapsed: TimeInterval = 0
        var marks: [TimeInterval] = []
        for segment in segments {
            elapsed += max(0, segment.durationSeconds ?? 0)
            if segment.stopReason == .userMark { marks.append(elapsed) }
        }
        return marks
    }
}

struct LocalRecordingSessionContext: Codable, Equatable {
    var projectSlug: String?
    var episodeSlug: String?
    var callRoomId: String?
    var participantId: String?
    var recordingConsentId: String?
    var recordingConsentGranted: Bool
    var recordingAssetId: String?
    var capturePurpose: String?

    var sessionTitle: String? {
        firstNonempty(episodeSlug, projectSlug, capturePurpose, callRoomId)
    }

    private func firstNonempty(_ values: String?...) -> String? {
        values
            .compactMap { $0?.trimmingCharacters(in: .whitespacesAndNewlines) }
            .first { !$0.isEmpty }
    }
}

@MainActor
final class LocalRecordingLibrary: ObservableObject {
    static let shared = LocalRecordingLibrary()

    @Published private(set) var recordings: [LocalRecording] = []
    @Published private(set) var currentRecording: LocalRecording?
    @Published private(set) var mostRecentRecording: LocalRecording?
    @Published private(set) var persistenceError: String?
    @Published private(set) var quarantinedLedgerFileName: String?

    let recordingsDirectoryURL: URL

    private struct Ledger: Codable {
        let schemaVersion: Int
        let recordings: [LocalRecording]
    }

    private struct SourceSidecar: Codable {
        let schemaVersion: Int
        let recording: LocalRecording
    }

    private struct SourceValidation: Sendable {
        let isPlayable: Bool
        let durationSeconds: TimeInterval?
        let failureMessage: String?
        let recordedMedia: LocalRecordingRecordedMediaProfile?
        let sourceIntegrityHoldReason: String?

        nonisolated init(
            isPlayable: Bool,
            durationSeconds: TimeInterval?,
            failureMessage: String?,
            recordedMedia: LocalRecordingRecordedMediaProfile? = nil,
            sourceIntegrityHoldReason: String? = nil
        ) {
            self.isPlayable = isPlayable
            self.durationSeconds = durationSeconds
            self.failureMessage = failureMessage
            self.recordedMedia = recordedMedia
            self.sourceIntegrityHoldReason = sourceIntegrityHoldReason
        }
    }

    private struct PendingDeepValidation: Sendable {
        let recordingID: UUID
        let fileURL: URL
        let mediaKind: LocalRecordingMediaKind
        let expectedSourceProfile: LocalRecordingSourceProfile?
        let playableMessage: String
    }

    private let fileManager: FileManager
    private let documentsDirectoryURL: URL
    private let ledgerURL: URL
    private let lastKnownGoodLedgerURL: URL
    private let encoder: JSONEncoder
    private let decoder: JSONDecoder
    private var storedRecordings: [LocalRecording] = []
    private var pendingDeepValidations: [PendingDeepValidation] = []
    private var ledgerIsWritable = true
    private var activeOwnerAccountID: String?
    private var accountObserver: NSObjectProtocol?

    private static let fileNameFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter
    }()

    private static let displayDateFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()

    private static let supportedAudioFileExtensions = Set(["m4a", "aac", "caf", "wav"])
    private static let supportedVideoFileExtensions = Set(["mov", "mp4", "m4v"])
    private static let supportedSourceFileExtensions =
        supportedAudioFileExtensions.union(supportedVideoFileExtensions)

    private init(fileManager: FileManager = .default) {
        self.fileManager = fileManager
        activeOwnerAccountID = AuthManager.currentStoredOwnerID()

        let documentsURL = fileManager.urls(for: .documentDirectory, in: .userDomainMask).first
            ?? fileManager.temporaryDirectory
        documentsDirectoryURL = documentsURL
        recordingsDirectoryURL = documentsURL.appendingPathComponent("Recordings", isDirectory: true)
        ledgerURL = recordingsDirectoryURL.appendingPathComponent("recordings-index.json", isDirectory: false)
        lastKnownGoodLedgerURL = recordingsDirectoryURL.appendingPathComponent("recordings-index.last-known-good.json", isDirectory: false)

        encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        encoder.dateEncodingStrategy = .iso8601

        decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601

        do {
            try ensureRecordingsDirectory()
            storedRecordings = try loadLedgerFailingClosed()
            let changed = try reconcileFilesWithoutDeleting()
            sortAndPublish()
            if changed, ledgerIsWritable {
                try persist(storedRecordings)
            }
        } catch {
            // Audio files remain untouched even if the index cannot be loaded.
            print("Local recording library could not finish launch reconciliation: \(error.localizedDescription)")
            sortAndPublish()
        }

        accountObserver = NotificationCenter.default.addObserver(
            forName: .quipslyCaptureAccountIdentityDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            let ownerAccountID = notification.object as? String
            MainActor.assumeIsolated { [weak self] in
                self?.activateOwner(ownerAccountID)
            }
        }
        scheduleDeepRecoveryValidation()
    }

    /// Changes only the visible account partition. Source files and ledger rows
    /// for every other account, including legacy unowned rows, remain untouched.
    func activateOwner(_ ownerAccountID: String?) {
        activeOwnerAccountID = normalizedOwnerID(ownerAccountID)
        sortAndPublish()
    }

    func makeUniqueRecordingURL(startedAt: Date = Date()) throws -> URL {
        try makeUniqueSourceURL(mediaKind: .audio, startedAt: startedAt)
    }

    func makeUniqueSourceURL(
        mediaKind: LocalRecordingMediaKind,
        fileExtension: String? = nil,
        startedAt: Date = Date()
    ) throws -> URL {
        try ensureRecordingsDirectory()
        let resolvedExtension = (fileExtension ?? mediaKind.defaultFileExtension)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let allowedExtensions = mediaKind == .video
            ? Self.supportedVideoFileExtensions
            : Self.supportedAudioFileExtensions
        guard allowedExtensions.contains(resolvedExtension) else {
            throw LibraryError.unsupportedSourceContainer
        }

        var candidate: URL
        repeat {
            let stamp = Self.fileNameFormatter.string(from: startedAt)
            let suffix = UUID().uuidString.lowercased()
            candidate = recordingsDirectoryURL
                .appendingPathComponent("quipsly-\(stamp)-\(suffix)")
                .appendingPathExtension(resolvedExtension)
        } while fileManager.fileExists(atPath: candidate.path)

        return candidate
    }

    @discardableResult
    func beginRecording(
        id: UUID,
        at fileURL: URL,
        startedAt: Date,
        context: LocalRecordingSessionContext,
        expectedOwnerAccountID: String,
        displayTitle: String? = nil,
        mediaKind: LocalRecordingMediaKind = .audio,
        captureGroupId: UUID? = nil,
        roomStartReceiptId: UUID? = nil,
        sourceProfile: LocalRecordingSourceProfile? = nil
    ) throws -> LocalRecording {
        guard let ownerAccountID = normalizedOwnerID(expectedOwnerAccountID),
              ownerAccountID == normalizedOwnerID(activeOwnerAccountID),
              ownerAccountID == AuthManager.currentStoredOwnerID() else {
            throw LibraryError.accountIdentityUnavailable
        }
        guard fileURL.deletingLastPathComponent().standardizedFileURL == recordingsDirectoryURL.standardizedFileURL else {
            throw LibraryError.recordingOutsideLibrary
        }
        guard isSafeRecordingFileName(fileURL.lastPathComponent, expectedMediaKind: mediaKind),
              !storedRecordings.contains(where: { $0.id == id || $0.fileName == fileURL.lastPathComponent }) else {
            throw LibraryError.invalidOrDuplicateRecordingIdentity
        }

        let resolvedTitle = nonempty(displayTitle)
            ?? nonempty(context.sessionTitle)
            ?? "Recording · \(Self.displayDateFormatter.string(from: startedAt))"

        let recording = LocalRecording(
            id: id,
            ownerAccountID: ownerAccountID,
            fileName: fileURL.lastPathComponent,
            displayTitle: resolvedTitle,
            sessionTitle: nonempty(context.sessionTitle),
            startedAt: startedAt,
            stoppedAt: nil,
            durationSeconds: 0,
            byteCount: fileByteCount(at: fileURL),
            status: .armed,
            projectSlug: nonempty(context.projectSlug),
            episodeSlug: nonempty(context.episodeSlug),
            callRoomId: nonempty(context.callRoomId),
            participantId: nonempty(context.participantId),
            recordingConsentId: nonempty(context.recordingConsentId),
            recordingConsentGranted: context.recordingConsentGranted,
            recordingAssetId: nonempty(context.recordingAssetId),
            capturePurpose: nonempty(context.capturePurpose),
            mediaKind: mediaKind,
            captureGroupId: captureGroupId ?? id,
            roomStartReceiptId: roomStartReceiptId,
            sourceProfile: sourceProfile,
            recordingSegmentsJson: nil,
            uploadProgress: nil,
            uploadedSourceId: nil,
            serverVerificationStatus: nil,
            statusMessage: nil
        )

        try commit(upserting: recording)
        return recording
    }

    func markRecording(_ id: UUID, durationSeconds: TimeInterval) throws {
        try mutate(id, allowInactiveOwner: true) { recording in
            recording.status = .recording
            recording.durationSeconds = max(0, durationSeconds)
            recording.statusMessage = nil
        }
    }

    func markPaused(_ id: UUID, durationSeconds: TimeInterval, interruption: Bool) throws {
        try mutate(id, allowInactiveOwner: true) { recording in
            recording.status = .paused
            recording.durationSeconds = max(0, durationSeconds)
            recording.statusMessage = interruption
                ? "An audio interruption paused capture. Quipsly will resume only when iOS says the route is ready."
                : nil
        }
    }

    func markFinalizing(_ id: UUID, durationSeconds: TimeInterval) throws {
        try mutate(id, allowInactiveOwner: true) { recording in
            recording.status = .finalizing
            recording.durationSeconds = max(0, durationSeconds)
            recording.statusMessage = nil
        }
    }

    @discardableResult
    func finalize(
        _ id: UUID,
        stoppedAt: Date,
        durationSeconds: TimeInterval,
        recordingSegmentsJson: String?,
        statusMessage: String? = nil
    ) throws -> LocalRecording {
        try mutate(id, allowInactiveOwner: true) { recording in
            let fileURL = self.sourceFileURL(for: recording)
            let validation = Self.validateSourceHeader(
                at: fileURL,
                mediaKind: recording.effectiveMediaKind
            )
            recording.stoppedAt = stoppedAt
            recording.durationSeconds = validation.durationSeconds ?? max(0, durationSeconds)
            recording.byteCount = self.fileByteCount(at: fileURL)
            recording.recordingSegmentsJson = recordingSegmentsJson
            if var profile = recording.sourceProfile {
                profile.monotonicStoppedNanoseconds = profile.monotonicStoppedNanoseconds
                    ?? DispatchTime.now().uptimeNanoseconds
                recording.sourceProfile = profile
            }
            recording.status = validation.isPlayable ? .saved : .needsRepair
            recording.statusMessage = validation.isPlayable
                ? self.nonempty(statusMessage)
                : validation.failureMessage
        }

        guard let recording = storedRecordings.first(where: { $0.id == id }) else {
            throw LibraryError.recordingNotFound
        }
        return recording
    }

    @discardableResult
    func validateFinalizedSource(_ id: UUID) async throws -> LocalRecording {
        guard let candidate = storedRecordings.first(where: { $0.id == id }) else {
            throw LibraryError.recordingNotFound
        }
        let fileURL = sourceFileURL(for: candidate)
        let mediaKind = candidate.effectiveMediaKind
        let preservedMessage = candidate.statusMessage

        try mutate(id, allowInactiveOwner: true) { recording in
            guard recording.status == .saved else { return }
            recording.status = .validatingRecovery
            recording.statusMessage = "Quipsly is decoding the complete finalized \(mediaKind.sourceNoun) stream before enabling playback or upload."
        }

        let validation = await Task.detached(priority: .utility) {
            await Self.validateSourceThroughEnd(
                at: fileURL,
                mediaKind: mediaKind,
                expectedSourceProfile: candidate.sourceProfile
            )
        }.value

        try mutate(id, allowInactiveOwner: true) { recording in
            guard recording.status == .validatingRecovery else { return }
            recording.byteCount = self.fileByteCount(at: fileURL)
            if let durationSeconds = validation.durationSeconds {
                recording.durationSeconds = durationSeconds
            }
            if let recordedMedia = validation.recordedMedia,
               var sourceProfile = recording.sourceProfile {
                sourceProfile.recordedMedia = recordedMedia
                recording.sourceProfile = sourceProfile
            }
            recording.sourceIntegrityHoldReason =
                validation.sourceIntegrityHoldReason
            if validation.isPlayable {
                recording.status = .saved
                recording.statusMessage = validation.sourceIntegrityHoldReason
                    ?? preservedMessage
            } else {
                recording.status = .needsRepair
                recording.statusMessage = validation.failureMessage
            }
        }

        guard let recording = storedRecordings.first(where: { $0.id == id }) else {
            throw LibraryError.recordingNotFound
        }
        return recording
    }

    func markCaptureFailed(_ id: UUID, durationSeconds: TimeInterval, message: String) throws {
        try mutate(id, allowInactiveOwner: true) { recording in
            recording.durationSeconds = max(0, durationSeconds)
            recording.byteCount = self.fileByteCount(at: self.sourceFileURL(for: recording))
            recording.status = .captureFailed
            recording.statusMessage = message
        }
    }

    func markUploadQueued(_ id: UUID) throws {
        try mutate(id) { recording in
            recording.status = .queued
            recording.uploadProgress = 0
            recording.statusMessage = nil
        }
    }

    func markUploading(_ id: UUID, progress: Double) throws {
        try mutate(id) { recording in
            recording.status = .uploading
            recording.uploadProgress = min(max(progress, 0), 1)
            recording.statusMessage = nil
        }
    }

    func markUploadFinished(
        _ id: UUID,
        sourceId: String?,
        serverVerificationStatus: String?,
        processingDisposition: String? = nil,
        processingHoldReason: String? = nil,
        transcriptDisposition: String? = nil,
        detail: String?
    ) throws {
        try mutate(id) { recording in
            let verification = serverVerificationStatus?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            recording.uploadProgress = 1
            recording.uploadedSourceId = self.nonempty(sourceId)
            recording.serverVerificationStatus = self.nonempty(serverVerificationStatus)
            recording.serverProcessingDisposition = self.nonempty(processingDisposition)
            recording.serverProcessingHoldReason = self.nonempty(processingHoldReason)
            recording.serverTranscriptDisposition = self.nonempty(transcriptDisposition)
            recording.status = verification == "verified" ? .uploaded : .awaitingVerification
            recording.statusMessage = self.nonempty(detail)
        }
    }

    func markUploadHeld(_ id: UUID, message: String) throws {
        try mutate(id) { recording in
            recording.status = .uploadHeld
            recording.statusMessage = message
        }
    }

    func recording(id: UUID) -> LocalRecording? {
        recordings.first { $0.id == id }
    }

    func recording(for fileURL: URL) -> LocalRecording? {
        recordings.first { $0.fileName == fileURL.lastPathComponent }
    }

    func fileURL(for recording: LocalRecording) -> URL? {
        guard ownsActivePartition(recording), isSafeRecordingFileName(recording.fileName) else { return nil }
        let fileURL = sourceFileURL(for: recording)
        let parent = fileURL.deletingLastPathComponent().standardizedFileURL
        guard parent == recordingsDirectoryURL.standardizedFileURL || isLegacyQuipslyRecording(fileURL) else {
            return nil
        }
        guard fileManager.fileExists(atPath: fileURL.path) else { return nil }
        return fileURL
    }

    /// Deletes only the current owner's immutable source bytes after the UI has
    /// collected explicit confirmation. The protected ledger row is committed as
    /// a tombstone before the destructive filesystem operation, so a crash can
    /// never leave an unaccounted-for deletion. Server/account evidence is not
    /// changed here.
    @discardableResult
    func deleteLocalOriginal(_ id: UUID, at deletedAt: Date = Date()) throws -> LocalRecording {
        guard let activeOwnerAccountID = normalizedOwnerID(activeOwnerAccountID) else {
            throw LibraryError.accountIdentityUnavailable
        }

        var updated = storedRecordings
        guard let index = updated.firstIndex(where: {
            $0.id == id && normalizedOwnerID($0.ownerAccountID) == activeOwnerAccountID
        }) else {
            throw LibraryError.recordingNotFound
        }

        let existing = updated[index]
        switch existing.status {
        case .armed, .recording, .paused, .finalizing, .validatingRecovery:
            throw LibraryError.localDeletionBlocked("Stop and finish saving this recording before deleting its local original.")
        case .queued, .uploading, .awaitingVerification:
            throw LibraryError.localDeletionBlocked("Wait for the active upload and Quipsly verification attempt to finish before deleting the local original.")
        case .deletedLocally:
            throw LibraryError.localDeletionBlocked("This local original was already deleted. Its protected audit row remains.")
        case .missingFile:
            throw LibraryError.localDeletionBlocked("The local source file is already unavailable, so Quipsly cannot perform a verified deletion.")
        case .saved, .uploaded, .uploadHeld, .recovered, .needsRepair, .captureFailed:
            break
        }

        guard isSafeRecordingFileName(existing.fileName) else {
            throw LibraryError.recordingOutsideLibrary
        }

        let fileURL = sourceFileURL(for: existing).standardizedFileURL
        let isCanonicalSource = fileURL.deletingLastPathComponent() == recordingsDirectoryURL.standardizedFileURL
        let isSupportedLegacySource = isLegacyQuipslyRecording(fileURL)
        guard isCanonicalSource || isSupportedLegacySource else {
            throw LibraryError.recordingOutsideLibrary
        }
        guard fileManager.fileExists(atPath: fileURL.path) else {
            throw LibraryError.localDeletionBlocked("The local source file is already unavailable. Its audit row was left unchanged.")
        }

        let deletedByteCount = max(existing.byteCount, fileByteCount(at: fileURL))
        let verificationAtDeletion = existing.status.isVerified
            || nonempty(existing.serverVerificationStatus)?.lowercased() == "verified"
            ? "verified"
            : "not-verified"
        var tombstone = existing
        tombstone.status = .deletedLocally
        tombstone.byteCount = 0
        tombstone.uploadProgress = nil
        tombstone.localBytesDeletedAt = deletedAt
        tombstone.localBytesDeletedByteCount = deletedByteCount
        tombstone.localDeletionCloudVerificationStatus = verificationAtDeletion
        tombstone.statusMessage = nil
        updated[index] = tombstone

        // Durable-before-destructive: if this protected atomic write fails, no
        // source bytes are touched. If the process dies after it succeeds, launch
        // reconciliation preserves the tombstone instead of calling it missing.
        try persist(updated)
        do {
            try fileManager.removeItem(at: fileURL)
        } catch {
            // The bytes still exist. Best-effort restore the pre-deletion row so
            // the visible state stays truthful; launch reconciliation also repairs
            // an interrupted restore because it can see the surviving file.
            try? persist(storedRecordings)
            throw LibraryError.localDeletionFailed(error.localizedDescription)
        }

        storedRecordings = updated
        sortAndPublish()
        return tombstone
    }

    private func sourceFileURL(for recording: LocalRecording) -> URL {
        guard isSafeRecordingFileName(recording.fileName) else {
            // A corrupt/tampered ledger row must never resolve outside the
            // recordings sandbox for playback, sharing, upload, or deletion.
            return recordingsDirectoryURL.appendingPathComponent(".invalid-\(recording.id.uuidString.lowercased())")
        }
        let canonicalURL = recordingsDirectoryURL.appendingPathComponent(recording.fileName, isDirectory: false)
        if fileManager.fileExists(atPath: canonicalURL.path) {
            return canonicalURL
        }

        // Earlier releases wrote Quipsly capture files directly into Documents.
        // Keep those immutable legacy sources addressable without moving or deleting them.
        let legacyURL = documentsDirectoryURL.appendingPathComponent(recording.fileName, isDirectory: false)
        if isLegacyQuipslyRecording(legacyURL), fileManager.fileExists(atPath: legacyURL.path) {
            return legacyURL
        }
        return canonicalURL
    }

    func setInProgressFileProtection(at fileURL: URL) throws {
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUnlessOpen],
            ofItemAtPath: fileURL.path
        )
    }

    func setFinalizedFileProtection(at fileURL: URL) throws {
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: fileURL.path
        )
    }

    private func ensureRecordingsDirectory() throws {
        try fileManager.createDirectory(
            at: recordingsDirectoryURL,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication]
        )
        try fileManager.setAttributes(
            [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
            ofItemAtPath: recordingsDirectoryURL.path
        )
    }

    private func loadLedgerFailingClosed() throws -> [LocalRecording] {
        guard fileManager.fileExists(atPath: ledgerURL.path) else {
            if let lastKnownGood = try? decodeLedger(at: lastKnownGoodLedgerURL) {
                return lastKnownGood
            }
            return loadSourceSidecars()
        }

        do {
            return try decodeLedger(at: ledgerURL)
        } catch {
            // Never replace an unreadable canonical index with an empty one. It is
            // immutable evidence until a person explicitly repairs it. A copied
            // quarantine artifact makes support/export possible without changing
            // the canonical bytes that failed to decode.
            ledgerIsWritable = false
            let stamp = Self.fileNameFormatter.string(from: Date())
            let preservedURL = recordingsDirectoryURL
                .appendingPathComponent("recordings-index-unreadable-\(stamp)-\(UUID().uuidString.lowercased())")
                .appendingPathExtension("json")
            do {
                try fileManager.copyItem(at: ledgerURL, to: preservedURL)
                quarantinedLedgerFileName = preservedURL.lastPathComponent
            } catch {
                quarantinedLedgerFileName = ledgerURL.lastPathComponent
            }
            persistenceError = "The recording index is unreadable and locked read-only. Quipsly preserved its original bytes and loaded only last-known-good source evidence; new recording is blocked until the index is repaired."
            print("Quarantined unreadable recording ledger without overwriting \(ledgerURL.lastPathComponent)")

            if let lastKnownGood = try? decodeLedger(at: lastKnownGoodLedgerURL) {
                return lastKnownGood
            }
            return loadSourceSidecars()
        }
    }

    private func decodeLedger(at url: URL) throws -> [LocalRecording] {
        guard fileManager.fileExists(atPath: url.path) else {
            throw LibraryError.recordingNotFound
        }
        let data = try Data(contentsOf: url)
        return try decoder.decode(Ledger.self, from: data).recordings
    }

    private func loadSourceSidecars() -> [LocalRecording] {
        let urls = (try? fileManager.contentsOfDirectory(
            at: recordingsDirectoryURL,
            includingPropertiesForKeys: [.isRegularFileKey],
            options: [.skipsHiddenFiles]
        )) ?? []

        var recoveredByID: [UUID: LocalRecording] = [:]
        for url in urls where url.lastPathComponent.hasSuffix(".quipsly-source.json") {
            guard let data = try? Data(contentsOf: url),
                  let sidecar = try? decoder.decode(SourceSidecar.self, from: data),
                  isSafeRecordingFileName(sidecar.recording.fileName),
                  normalizedOwnerID(sidecar.recording.ownerAccountID) != nil else {
                continue
            }
            recoveredByID[sidecar.recording.id] = sidecar.recording
        }
        return Array(recoveredByID.values)
    }

    @discardableResult
    private func reconcileFilesWithoutDeleting() throws -> Bool {
        let canonicalFileURLs = try fileManager.contentsOfDirectory(
            at: recordingsDirectoryURL,
            includingPropertiesForKeys: [.isRegularFileKey, .creationDateKey, .contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ).filter { Self.supportedSourceFileExtensions.contains($0.pathExtension.lowercased()) }
        let legacyFileURLs = (try? fileManager.contentsOfDirectory(
            at: documentsDirectoryURL,
            includingPropertiesForKeys: [.isRegularFileKey, .creationDateKey, .contentModificationDateKey, .fileSizeKey],
            options: [.skipsHiddenFiles]
        ))?.filter {
            Self.supportedAudioFileExtensions.contains($0.pathExtension.lowercased()) && isLegacyQuipslyRecording($0)
        } ?? []
        var changed = false
        var filesByName = Dictionary(uniqueKeysWithValues: legacyFileURLs.map { ($0.lastPathComponent, $0) })
        for fileURL in canonicalFileURLs {
            filesByName[fileURL.lastPathComponent] = fileURL
        }

        for index in storedRecordings.indices {
            guard let fileURL = filesByName[storedRecordings[index].fileName] else {
                if storedRecordings[index].status == .deletedLocally {
                    continue
                }
                if storedRecordings[index].status != .missingFile {
                    let wasOpenIntent = [.armed, .recording, .paused, .finalizing]
                        .contains(storedRecordings[index].status)
                    storedRecordings[index].status = .missingFile
                    storedRecordings[index].statusMessage = wasOpenIntent
                        ? "Quipsly recovered an armed or active capture intent, but found no source file. The journal and owner evidence remain preserved; no playable audio is claimed."
                        : "The source file was not found during launch reconciliation. Its ledger entry was preserved."
                    changed = true
                }
                continue
            }

            let byteCount = fileByteCount(at: fileURL)
            if storedRecordings[index].byteCount != byteCount {
                storedRecordings[index].byteCount = byteCount
                changed = true
            }

            switch storedRecordings[index].status {
            case .armed, .recording, .paused, .finalizing, .validatingRecovery:
                applyCrashRecoveryValidation(to: &storedRecordings[index], fileURL: fileURL)
                changed = true
            case .uploading:
                storedRecordings[index].status = .queued
                storedRecordings[index].statusMessage = "Quipsly recovered this upload after launch. The local original remains preserved."
                changed = true
            case .missingFile:
                applyCrashRecoveryValidation(to: &storedRecordings[index], fileURL: fileURL)
                changed = true
            case .deletedLocally:
                applyCrashRecoveryValidation(
                    to: &storedRecordings[index],
                    fileURL: fileURL,
                    playableMessage: "A source file became available after a prior explicit local deletion. Quipsly decoded and preserved it for review and kept the deletion audit metadata."
                )
                changed = true
            default:
                break
            }
        }

        let knownNames = Set(storedRecordings.map(\.fileName))
        let sidecarsByFileName = Dictionary(
            loadSourceSidecars().map { ($0.fileName, $0) },
            uniquingKeysWith: { first, _ in first }
        )
        for fileURL in filesByName.values where !knownNames.contains(fileURL.lastPathComponent) {
            let values = try? fileURL.resourceValues(forKeys: [.creationDateKey, .contentModificationDateKey])
            let startedAt = values?.creationDate ?? values?.contentModificationDate ?? Date()
            var recovered = sidecarsByFileName[fileURL.lastPathComponent] ?? LocalRecording(
                    id: UUID(),
                    ownerAccountID: nil,
                    fileName: fileURL.lastPathComponent,
                    displayTitle: "Recovered recording · \(Self.displayDateFormatter.string(from: startedAt))",
                    sessionTitle: nil,
                    startedAt: startedAt,
                    stoppedAt: values?.contentModificationDate,
                    durationSeconds: 0,
                    byteCount: fileByteCount(at: fileURL),
                    status: .needsRepair,
                    projectSlug: nil,
                    episodeSlug: nil,
                    callRoomId: nil,
                    participantId: nil,
                    recordingConsentId: nil,
                    recordingConsentGranted: false,
                    recordingAssetId: nil,
                    capturePurpose: nil,
                    mediaKind: inferredMediaKind(for: fileURL),
                    captureGroupId: nil,
                    roomStartReceiptId: nil,
                    sourceProfile: nil,
                    recordingSegmentsJson: nil,
                    uploadProgress: nil,
                    uploadedSourceId: nil,
                    serverVerificationStatus: nil,
                    statusMessage: nil
                )
            applyCrashRecoveryValidation(
                to: &recovered,
                fileURL: fileURL,
                playableMessage: sidecarsByFileName[fileURL.lastPathComponent] == nil
                    ? "Quipsly found and decoded this local source without a canonical ledger row. Owner identity is quarantined until source evidence is repaired."
                    : "Quipsly rebuilt this decoded source from its protected per-source owner sidecar."
            )
            storedRecordings.append(recovered)
            changed = true
        }

        return changed
    }

    private func commit(upserting recording: LocalRecording) throws {
        var updated = storedRecordings
        if let index = updated.firstIndex(where: { $0.id == recording.id }) {
            updated[index] = recording
        } else {
            updated.append(recording)
        }
        try persist(updated)
        storedRecordings = updated
        sortAndPublish()
    }

    private func mutate(
        _ id: UUID,
        allowInactiveOwner: Bool = false,
        change: (inout LocalRecording) -> Void
    ) throws {
        var updated = storedRecordings
        guard let index = updated.firstIndex(where: { $0.id == id }) else {
            throw LibraryError.recordingNotFound
        }
        if !allowInactiveOwner {
            guard let activeOwnerAccountID = normalizedOwnerID(activeOwnerAccountID),
                  normalizedOwnerID(updated[index].ownerAccountID) == activeOwnerAccountID else {
                throw LibraryError.accountIdentityUnavailable
            }
        }
        change(&updated[index])
        try persist(updated)
        storedRecordings = updated
        sortAndPublish()
    }

    private func persist(_ recordings: [LocalRecording]) throws {
        guard ledgerIsWritable else {
            throw LibraryError.ledgerQuarantined
        }

        let ledger = Ledger(schemaVersion: 5, recordings: recordings)
        let data = try encoder.encode(ledger)
        do {
            // Owner/source identity is written independently before the aggregate
            // index. A torn aggregate write can therefore be reconstructed without
            // guessing which signed-in account owns otherwise orphaned bytes.
            try persistSourceSidecars(recordings)
            try data.write(to: lastKnownGoodLedgerURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            // The canonical commit is deliberately last: a successful return
            // proves both recovery layers and the authoritative index landed.
            try data.write(to: ledgerURL, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
            persistenceError = nil
        } catch {
            persistenceError = "The protected recording journal could not be saved: \(error.localizedDescription)"
            throw error
        }
    }

    private func persistSourceSidecars(_ recordings: [LocalRecording]) throws {
        for recording in recordings {
            guard isSafeRecordingFileName(recording.fileName),
                  normalizedOwnerID(recording.ownerAccountID) != nil else {
                // Legacy unowned rows stay quarantined in the aggregate index. Do
                // not mint owner evidence that the app cannot actually prove.
                continue
            }
            let sidecar = SourceSidecar(schemaVersion: 2, recording: recording)
            let data = try encoder.encode(sidecar)
            try data.write(
                to: sourceSidecarURL(forFileName: recording.fileName),
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
        }
    }

    private func sourceSidecarURL(forFileName fileName: String) -> URL {
        recordingsDirectoryURL.appendingPathComponent("\(fileName).quipsly-source.json", isDirectory: false)
    }

    private func applyCrashRecoveryValidation(
        to recording: inout LocalRecording,
        fileURL: URL,
        playableMessage: String = "Capture was open when Quipsly last saved its journal. The complete media stream was decoded before being labeled recovered."
    ) {
        // Header/duration validation is intentionally bounded on MainActor. A
        // source stays non-playable while a utility task reads through EOF.
        let mediaKind = recording.effectiveMediaKind
        let validation = Self.validateSourceHeader(
            at: fileURL,
            mediaKind: mediaKind
        )
        recording.byteCount = fileByteCount(at: fileURL)
        if let durationSeconds = validation.durationSeconds {
            recording.durationSeconds = durationSeconds
        }
        if validation.isPlayable {
            recording.status = .validatingRecovery
            recording.statusMessage = "Quipsly is validating this preserved \(mediaKind.sourceNoun) stream through its declared end. Playback and upload remain disabled until that recovery check finishes."
            if !pendingDeepValidations.contains(where: { $0.recordingID == recording.id }) {
                pendingDeepValidations.append(PendingDeepValidation(
                    recordingID: recording.id,
                    fileURL: fileURL,
                    mediaKind: mediaKind,
                    expectedSourceProfile: recording.sourceProfile,
                    playableMessage: playableMessage
                ))
            }
        } else {
            recording.status = .needsRepair
            recording.statusMessage = validation.failureMessage
        }
    }

    private func scheduleDeepRecoveryValidation() {
        let candidates = pendingDeepValidations
        pendingDeepValidations.removeAll()
        guard !candidates.isEmpty else { return }

        Task { [weak self] in
            for candidate in candidates {
                let validation = await Task.detached(priority: .utility) {
                    await Self.validateSourceThroughEnd(
                        at: candidate.fileURL,
                        mediaKind: candidate.mediaKind,
                        expectedSourceProfile: candidate.expectedSourceProfile
                    )
                }.value
                guard let self else { return }
                do {
                    try self.mutate(candidate.recordingID, allowInactiveOwner: true) { recording in
                        guard recording.status == .validatingRecovery else { return }
                        if let recordedMedia = validation.recordedMedia,
                           var sourceProfile = recording.sourceProfile {
                            sourceProfile.recordedMedia = recordedMedia
                            recording.sourceProfile = sourceProfile
                        }
                        recording.sourceIntegrityHoldReason =
                            validation.sourceIntegrityHoldReason
                        if validation.isPlayable {
                            recording.status = .recovered
                            recording.statusMessage =
                                validation.sourceIntegrityHoldReason
                                ?? candidate.playableMessage
                            if let durationSeconds = validation.durationSeconds {
                                recording.durationSeconds = durationSeconds
                            }
                        } else {
                            recording.status = .needsRepair
                            recording.statusMessage = validation.failureMessage
                        }
                    }
                } catch {
                    self.persistenceError = "Recovery validation finished, but its protected result could not be committed: \(error.localizedDescription)"
                }
            }
        }
    }

    nonisolated private static func validateSourceHeader(
        at fileURL: URL,
        mediaKind: LocalRecordingMediaKind
    ) -> SourceValidation {
        switch mediaKind {
        case .audio:
            return validateAudioSource(at: fileURL, readsToEnd: false)
        case .video:
            return validateVideoSourceHeader(at: fileURL)
        }
    }

    nonisolated private static func validateSourceThroughEnd(
        at fileURL: URL,
        mediaKind: LocalRecordingMediaKind,
        expectedSourceProfile: LocalRecordingSourceProfile?
    ) async -> SourceValidation {
        switch mediaKind {
        case .audio:
            return validateAudioSource(at: fileURL, readsToEnd: true)
        case .video:
            return await validateVideoSourceThroughEnd(
                at: fileURL,
                expectedSourceProfile: expectedSourceProfile
            )
        }
    }

    nonisolated private static func validateAudioSource(
        at fileURL: URL,
        readsToEnd: Bool
    ) -> SourceValidation {
        let byteCount = fileByteCountForValidation(at: fileURL)
        guard byteCount > 0 else {
            return SourceValidation(
                isPlayable: false,
                durationSeconds: nil,
                failureMessage: "Quipsly preserved the file path and journal evidence, but the source has no audio bytes. It needs repair and is not claimed playable."
            )
        }

        do {
            let audioFile = try AVAudioFile(forReading: fileURL)
            let sampleRate = audioFile.processingFormat.sampleRate
            let frameCount = audioFile.length
            guard sampleRate.isFinite, sampleRate > 0, frameCount > 0 else {
                return SourceValidation(
                    isPlayable: false,
                    durationSeconds: nil,
                    failureMessage: "Quipsly preserved the source bytes, but the audio header has no decodable frames. It needs repair and is not claimed playable."
                )
            }
            let duration = Double(frameCount) / sampleRate
            guard duration.isFinite, duration > 0 else {
                return SourceValidation(
                    isPlayable: false,
                    durationSeconds: nil,
                    failureMessage: "Quipsly preserved the source bytes, but could not prove a positive audio duration. It needs repair and is not claimed playable."
                )
            }
            if readsToEnd {
                // A parseable M4A header and positive declared length are not
                // enough after process death. Read every decoded frame so a
                // truncated/corrupt tail cannot be mislabeled as recovered.
                let bufferCapacity: AVAudioFrameCount = 65_536
                guard let buffer = AVAudioPCMBuffer(
                    pcmFormat: audioFile.processingFormat,
                    frameCapacity: bufferCapacity
                ) else {
                    return SourceValidation(
                        isPlayable: false,
                        durationSeconds: nil,
                        failureMessage: "Quipsly preserved the source bytes, but could not allocate a recovery-validation buffer. It needs repair and is not claimed playable."
                    )
                }
                audioFile.framePosition = 0
                var decodedFrames: AVAudioFramePosition = 0
                while decodedFrames < frameCount {
                    buffer.frameLength = 0
                    let remaining = frameCount - decodedFrames
                    try audioFile.read(
                        into: buffer,
                        frameCount: AVAudioFrameCount(min(Int64(bufferCapacity), remaining))
                    )
                    guard buffer.frameLength > 0 else { break }
                    decodedFrames += AVAudioFramePosition(buffer.frameLength)
                }
                guard decodedFrames == frameCount else {
                    return SourceValidation(
                        isPlayable: false,
                        durationSeconds: nil,
                        failureMessage: "Quipsly preserved the source bytes, but could not decode the audio stream through its declared end. It needs repair and is not claimed playable."
                    )
                }
            }
            return SourceValidation(isPlayable: true, durationSeconds: duration, failureMessage: nil)
        } catch {
            return SourceValidation(
                isPlayable: false,
                durationSeconds: nil,
                failureMessage: "Quipsly preserved the source bytes, but iOS could not decode a complete audio stream. It needs repair and is not claimed playable."
            )
        }
    }

    nonisolated private static func validateVideoSourceHeader(
        at fileURL: URL
    ) -> SourceValidation {
        let byteCount = fileByteCountForValidation(at: fileURL)
        guard byteCount > 0 else {
            return SourceValidation(
                isPlayable: false,
                durationSeconds: nil,
                failureMessage: "Quipsly preserved the file path and journal evidence, but the source has no video bytes. It needs repair and is not claimed playable."
            )
        }
        return SourceValidation(
            isPlayable: true,
            durationSeconds: nil,
            failureMessage: nil
        )
    }

    nonisolated private static func validateVideoSourceThroughEnd(
        at fileURL: URL,
        expectedSourceProfile: LocalRecordingSourceProfile?
    ) async -> SourceValidation {
        let byteCount = fileByteCountForValidation(at: fileURL)
        guard byteCount > 0 else {
            return SourceValidation(
                isPlayable: false,
                durationSeconds: nil,
                failureMessage: "Quipsly preserved the file path and journal evidence, but the source has no video bytes. It needs repair and is not claimed playable."
            )
        }
        let asset = AVURLAsset(url: fileURL)
        var inspectedDuration: Double?
        do {
            let videoTracks = try await asset.loadTracks(withMediaType: .video)
            let audioTracks = try await asset.loadTracks(withMediaType: .audio)
            let duration = try await asset.load(.duration).seconds
            inspectedDuration = duration
            let isReadable = try await asset.load(.isReadable)
            let isPlayable = try await asset.load(.isPlayable)
            guard isReadable,
                  isPlayable,
                  videoTracks.count == 1,
                  duration.isFinite,
                  duration > 0 else {
                return SourceValidation(
                    isPlayable: false,
                    durationSeconds: nil,
                    failureMessage: "Quipsly preserved the source bytes, but could not prove exactly one readable video track and a positive duration. It needs repair and is not claimed playable."
                )
            }

            let tracks = videoTracks + audioTracks
            for track in tracks {
                let reader = try AVAssetReader(asset: asset)
                let output = AVAssetReaderTrackOutput(track: track, outputSettings: nil)
                output.alwaysCopiesSampleData = false
                guard reader.canAdd(output) else {
                    throw NSError(
                        domain: "QuipslySourceValidation",
                        code: 1,
                        userInfo: [NSLocalizedDescriptionKey: "The media track could not be attached to its validation reader."]
                    )
                }
                reader.add(output)
                guard reader.startReading() else {
                    throw reader.error ?? NSError(
                        domain: "QuipslySourceValidation",
                        code: 2,
                        userInfo: [NSLocalizedDescriptionKey: "The media validation reader could not start."]
                    )
                }
                var sampleCount = 0
                while output.copyNextSampleBuffer() != nil {
                    sampleCount += 1
                }
                guard reader.status == .completed, sampleCount > 0 else {
                    throw reader.error ?? NSError(
                        domain: "QuipslySourceValidation",
                        code: 3,
                        userInfo: [NSLocalizedDescriptionKey: "The media validation reader did not reach the declared end."]
                    )
                }
            }

            let recordedMedia = try await recordedMediaProfile(
                videoTrack: videoTracks[0],
                audioTracks: audioTracks,
                durationSeconds: duration
            )
            let integrityHold = videoIntegrityHoldReason(
                expected: expectedSourceProfile,
                recorded: recordedMedia
            )
            return SourceValidation(
                isPlayable: true,
                durationSeconds: duration,
                failureMessage: nil,
                recordedMedia: recordedMedia,
                sourceIntegrityHoldReason: integrityHold
            )
        } catch {
            return SourceValidation(
                isPlayable: false,
                durationSeconds: inspectedDuration,
                failureMessage: "Quipsly preserved the source bytes, but iOS could not decode every recorded video sample through the declared end. It needs repair and is not claimed playable."
            )
        }
    }

    nonisolated private static func recordedMediaProfile(
        videoTrack: AVAssetTrack,
        audioTracks: [AVAssetTrack],
        durationSeconds: Double
    ) async throws -> LocalRecordingRecordedMediaProfile {
        let naturalSize = try await videoTrack.load(.naturalSize)
        let preferredTransform = try await videoTrack.load(.preferredTransform)
        let nominalFrameRate = try await videoTrack.load(.nominalFrameRate)
        let videoDescriptions = try await videoTrack.load(.formatDescriptions)
        let encodedDimensions = videoDescriptions.first.map {
            CMVideoFormatDescriptionGetDimensions($0)
        }
        let videoCodec = videoDescriptions.first.map {
            fourCCString(CMFormatDescriptionGetMediaSubType($0))
        }
        let presentationRect = CGRect(
            origin: .zero,
            size: naturalSize
        ).applying(preferredTransform)
        let presentationWidth = Int(abs(presentationRect.width).rounded())
        let presentationHeight = Int(abs(presentationRect.height).rounded())
        let rotation = normalizedRotationDegrees(preferredTransform)

        var audioSampleRate: Double?
        var audioChannelCount: Int?
        if let audioTrack = audioTracks.first {
            let audioDescriptions = try await audioTrack.load(.formatDescriptions)
            if let audioDescription = audioDescriptions.first,
               let stream = CMAudioFormatDescriptionGetStreamBasicDescription(
                   audioDescription
               ) {
                audioSampleRate = stream.pointee.mSampleRate
                audioChannelCount = Int(stream.pointee.mChannelsPerFrame)
            }
        }

        return LocalRecordingRecordedMediaProfile(
            videoTrackCount: 1,
            audioTrackCount: audioTracks.count,
            videoCodec: videoCodec,
            encodedWidth: encodedDimensions.map { Int($0.width) },
            encodedHeight: encodedDimensions.map { Int($0.height) },
            presentationWidth: presentationWidth > 0
                ? presentationWidth
                : nil,
            presentationHeight: presentationHeight > 0
                ? presentationHeight
                : nil,
            rotationDegrees: rotation,
            nominalFrameRate: nominalFrameRate.isFinite
                && nominalFrameRate > 0
                ? Double(nominalFrameRate)
                : nil,
            audioSampleRate: audioSampleRate,
            audioChannelCount: audioChannelCount,
            durationSeconds: durationSeconds
        )
    }

    nonisolated private static func videoIntegrityHoldReason(
        expected: LocalRecordingSourceProfile?,
        recorded: LocalRecordingRecordedMediaProfile
    ) -> String? {
        guard let expected else {
            return "The complete movie is playable, but it predates Quipsly's negotiated-versus-recorded profile receipt. Upload is held until a human reviews the preserved local original."
        }
        var differences: [String] = []
        if recorded.videoTrackCount != 1 {
            differences.append(
                "expected one video track, recorded \(recorded.videoTrackCount)"
            )
        }
        let expectedAudioTrack = expected.includesAudio
        let recordedAudioTrack = recorded.audioTrackCount > 0
        if expectedAudioTrack != recordedAudioTrack {
            differences.append(
                expectedAudioTrack
                    ? "the armed solo source expected movie audio, but no audio track was recorded"
                    : "the armed podcast-camera source was video-only, but the movie contains audio"
            )
        }
        if let expectedWidth = expected.width,
           let expectedHeight = expected.height,
           let recordedWidth = recorded.encodedWidth,
           let recordedHeight = recorded.encodedHeight,
           expectedWidth != recordedWidth || expectedHeight != recordedHeight {
            differences.append(
                "negotiated \(expectedWidth)×\(expectedHeight), recorded \(recordedWidth)×\(recordedHeight)"
            )
        }
        if let expectedCodec = expected.codec,
           let recordedCodec = recorded.videoCodec,
           normalizedVideoCodec(expectedCodec)
                != normalizedVideoCodec(recordedCodec) {
            differences.append(
                "negotiated \(expectedCodec), recorded \(recordedCodec)"
            )
        }
        if let expectedFrameRate = expected.nominalFrameRate,
           let recordedFrameRate = recorded.nominalFrameRate,
           abs(expectedFrameRate - recordedFrameRate) > 1.0 {
            differences.append(
                "negotiated \(Int(expectedFrameRate.rounded())) fps, recorded \(Int(recordedFrameRate.rounded())) fps"
            )
        }
        if expected.orientation == "portrait",
           let width = recorded.presentationWidth,
           let height = recorded.presentationHeight,
           width >= height {
            differences.append(
                "the armed portrait source produced a \(width)×\(height) landscape presentation"
            )
        }
        if expected.orientation == "landscape",
           let width = recorded.presentationWidth,
           let height = recorded.presentationHeight,
           height >= width {
            differences.append(
                "the armed landscape source produced a \(width)×\(height) portrait presentation"
            )
        }
        if let expectedRotation = expected.captureRotationDegrees,
           let recordedRotation = recorded.rotationDegrees,
           angularDistance(expectedRotation, recordedRotation) > 1 {
            differences.append(
                "armed rotation \(Int(expectedRotation.rounded()))°, recorded track rotation \(Int(recordedRotation.rounded()))°"
            )
        }
        guard !differences.isEmpty else { return nil }
        return "The complete movie is playable and preserved, but its finished track does not match the armed source: \(differences.joined(separator: "; ")). Upload is held so Quipsly cannot silently relabel the source."
    }

    nonisolated private static func normalizedVideoCodec(
        _ value: String
    ) -> String {
        switch value.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).lowercased() {
        case "hvc1", "hev1", "hevc":
            return "hevc"
        case "avc1", "h264", "h.264":
            return "h264"
        case let value:
            return value
        }
    }

    nonisolated private static func normalizedRotationDegrees(
        _ transform: CGAffineTransform
    ) -> Double? {
        let radians = atan2(transform.b, transform.a)
        guard radians.isFinite else { return nil }
        let degrees = radians * 180 / .pi
        let normalized = degrees.truncatingRemainder(dividingBy: 360)
        return normalized < 0 ? normalized + 360 : normalized
    }

    nonisolated private static func angularDistance(
        _ lhs: Double,
        _ rhs: Double
    ) -> Double {
        let difference = abs(lhs - rhs).truncatingRemainder(dividingBy: 360)
        return min(difference, 360 - difference)
    }

    nonisolated private static func fourCCString(
        _ value: FourCharCode
    ) -> String {
        let scalars = [
            UnicodeScalar((value >> 24) & 0xff),
            UnicodeScalar((value >> 16) & 0xff),
            UnicodeScalar((value >> 8) & 0xff),
            UnicodeScalar(value & 0xff),
        ]
        return String(String.UnicodeScalarView(scalars.compactMap { $0 }))
    }

    nonisolated private static func fileByteCountForValidation(at fileURL: URL) -> Int64 {
        guard let attributes = try? FileManager.default.attributesOfItem(atPath: fileURL.path),
              let number = attributes[.size] as? NSNumber else {
            return 0
        }
        return number.int64Value
    }

    private func sortAndPublish() {
        storedRecordings.sort { lhs, rhs in
            if lhs.startedAt == rhs.startedAt {
                return lhs.fileName < rhs.fileName
            }
            return lhs.startedAt > rhs.startedAt
        }
        if let activeOwnerAccountID = normalizedOwnerID(activeOwnerAccountID) {
            recordings = storedRecordings.filter {
                normalizedOwnerID($0.ownerAccountID) == activeOwnerAccountID
            }
        } else {
            recordings = []
        }
        currentRecording = recordings.first { [.armed, .recording, .paused, .finalizing].contains($0.status) }
        mostRecentRecording = recordings.first
    }

    private func fileByteCount(at fileURL: URL) -> Int64 {
        guard let attributes = try? fileManager.attributesOfItem(atPath: fileURL.path),
              let number = attributes[.size] as? NSNumber else {
            return 0
        }
        return number.int64Value
    }

    private func isLegacyQuipslyRecording(_ fileURL: URL) -> Bool {
        let fileName = fileURL.lastPathComponent.lowercased()
        return fileURL.deletingLastPathComponent().standardizedFileURL == documentsDirectoryURL.standardizedFileURL
            && (fileName.hasPrefix("quipsly_recording_") || fileName.hasPrefix("quipsly-recording-"))
    }

    private func inferredMediaKind(for fileURL: URL) -> LocalRecordingMediaKind {
        Self.supportedVideoFileExtensions.contains(fileURL.pathExtension.lowercased())
            ? .video
            : .audio
    }

    private func isSafeRecordingFileName(
        _ fileName: String,
        expectedMediaKind: LocalRecordingMediaKind? = nil
    ) -> Bool {
        guard !fileName.isEmpty,
              fileName != ".",
              fileName != "..",
              URL(fileURLWithPath: fileName).lastPathComponent == fileName else {
            return false
        }
        let fileExtension = URL(fileURLWithPath: fileName).pathExtension.lowercased()
        guard Self.supportedSourceFileExtensions.contains(fileExtension) else { return false }
        guard let expectedMediaKind else { return true }
        return expectedMediaKind == .video
            ? Self.supportedVideoFileExtensions.contains(fileExtension)
            : Self.supportedAudioFileExtensions.contains(fileExtension)
    }

    private func nonempty(_ value: String?) -> String? {
        guard let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty else {
            return nil
        }
        return value
    }

    private func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }

    private func ownsActivePartition(_ recording: LocalRecording) -> Bool {
        guard let activeOwnerAccountID = normalizedOwnerID(activeOwnerAccountID),
              let recordingOwnerAccountID = normalizedOwnerID(recording.ownerAccountID) else {
            return false
        }
        return activeOwnerAccountID == recordingOwnerAccountID
            && storedRecordings.contains(where: {
                $0.id == recording.id && normalizedOwnerID($0.ownerAccountID) == activeOwnerAccountID
            })
    }

    private enum LibraryError: LocalizedError {
        case recordingNotFound
        case recordingOutsideLibrary
        case accountIdentityUnavailable
        case localDeletionBlocked(String)
        case localDeletionFailed(String)
        case ledgerQuarantined
        case invalidOrDuplicateRecordingIdentity
        case unsupportedSourceContainer

        var errorDescription: String? {
            switch self {
            case .recordingNotFound:
                return "The local recording ledger entry could not be found."
            case .recordingOutsideLibrary:
                return "The recording URL is outside Quipsly's persistent Recordings folder."
            case .accountIdentityUnavailable:
                return "Verify the current Quipsly account before changing a protected local recording."
            case .localDeletionBlocked(let reason):
                return reason
            case .localDeletionFailed(let reason):
                return "The local original could not be deleted: \(reason). Its ledger row and source bytes remain preserved."
            case .ledgerQuarantined:
                return "The canonical recording index is quarantined read-only. Quipsly will not overwrite it or start a new take until its evidence is repaired."
            case .invalidOrDuplicateRecordingIdentity:
                return "Quipsly refused an unsafe or duplicate local recording identity."
            case .unsupportedSourceContainer:
                return "Quipsly refused a source container that does not match the selected audio or video recording mode."
            }
        }
    }
}
