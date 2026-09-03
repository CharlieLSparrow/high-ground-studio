import Foundation
import Combine
import AVFoundation
import CryptoKit

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
    var requestedVideoQuality: String?
    var videoQualityIntentFulfilled: Bool?
    var videoSystemPressureAtStart: String?
    var includesAudio: Bool
    var audioSampleRate: Double?
    var audioChannelCount: Int?
    var audioCapturePipeline: String?
    var pauseTimelinePolicy: String?
    var captureAppVersion: String?
    var captureAppBuild: String?
    var captureAuthorityBasis: String?
    var deviceModelIdentifier: String?
    var deviceSystemName: String?
    var deviceSystemVersion: String?
    var audioRouteName: String?
    var audioRoutePortType: String?
    var audioInputDataSourceName: String?
    var audioHardwareSampleRate: Double?
    var audioHardwareInputChannelCount: Int?
    var monotonicStartedNanoseconds: UInt64?
    var monotonicStoppedNanoseconds: UInt64?
    var clockSamples: [LocalRecordingClockSample]?
    var recordedMedia: LocalRecordingRecordedMediaProfile?
    var audioSignal: LocalRecordingAudioSignalProfile?
    var audibleEventAnalysis: LocalRecordingAudibleEventAnalysisProfile?

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
        requestedVideoQuality: String? = nil,
        videoQualityIntentFulfilled: Bool? = nil,
        videoSystemPressureAtStart: String? = nil,
        includesAudio: Bool,
        audioSampleRate: Double? = nil,
        audioChannelCount: Int? = nil,
        audioCapturePipeline: String? = nil,
        pauseTimelinePolicy: String? = nil,
        captureAppVersion: String? = nil,
        captureAppBuild: String? = nil,
        captureAuthorityBasis: String? = nil,
        deviceModelIdentifier: String? = nil,
        deviceSystemName: String? = nil,
        deviceSystemVersion: String? = nil,
        audioRouteName: String? = nil,
        audioRoutePortType: String? = nil,
        audioInputDataSourceName: String? = nil,
        audioHardwareSampleRate: Double? = nil,
        audioHardwareInputChannelCount: Int? = nil,
        monotonicStartedNanoseconds: UInt64? = nil,
        monotonicStoppedNanoseconds: UInt64? = nil,
        clockSamples: [LocalRecordingClockSample]? = nil,
        recordedMedia: LocalRecordingRecordedMediaProfile? = nil,
        audioSignal: LocalRecordingAudioSignalProfile? = nil,
        audibleEventAnalysis: LocalRecordingAudibleEventAnalysisProfile? = nil
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
        self.requestedVideoQuality = requestedVideoQuality
        self.videoQualityIntentFulfilled = videoQualityIntentFulfilled
        self.videoSystemPressureAtStart = videoSystemPressureAtStart
        self.includesAudio = includesAudio
        self.audioSampleRate = audioSampleRate
        self.audioChannelCount = audioChannelCount
        self.audioCapturePipeline = audioCapturePipeline
        self.pauseTimelinePolicy = pauseTimelinePolicy
        self.captureAppVersion = captureAppVersion
        self.captureAppBuild = captureAppBuild
        self.captureAuthorityBasis = captureAuthorityBasis
        self.deviceModelIdentifier = deviceModelIdentifier
        self.deviceSystemName = deviceSystemName
        self.deviceSystemVersion = deviceSystemVersion
        self.audioRouteName = audioRouteName
        self.audioRoutePortType = audioRoutePortType
        self.audioInputDataSourceName = audioInputDataSourceName
        self.audioHardwareSampleRate = audioHardwareSampleRate
        self.audioHardwareInputChannelCount = audioHardwareInputChannelCount
        self.monotonicStartedNanoseconds = monotonicStartedNanoseconds
        self.monotonicStoppedNanoseconds = monotonicStoppedNanoseconds
        self.clockSamples = clockSamples
        self.recordedMedia = recordedMedia
        self.audioSignal = audioSignal
        self.audibleEventAnalysis = audibleEventAnalysis
    }
}

struct LocalRecordingAudioSignalWindow: Codable, Equatable, Sendable {
    let startSeconds: Double
    let durationSeconds: Double
    let rmsDbfs: Double
    let samplePeakDbfs: Double
    let clippedFrameCount: Int64
}

struct LocalRecordingAudioSignalObservation: Codable, Equatable, Sendable {
    let kind: String
    let severity: String
    let startSeconds: Double
    let endSeconds: Double
    let detail: String
}

/// A deterministic observation over decoded source samples. RMS dBFS is not
/// LUFS, and `possible-dropout` is deliberately a listening candidate rather
/// than a claim that source audio was lost.
struct LocalRecordingAudioSignalProfile: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let algorithm: String
    let sampleRate: Double
    let channelCount: Int
    let analyzedFrameCount: Int64
    let durationSeconds: Double
    let windowDurationSeconds: Double
    let rmsDbfs: Double
    let samplePeakDbfs: Double
    let clippedFrameCount: Int64
    let clippedFrameFraction: Double
    let nearSilentFrameFraction: Double
    let leftRmsDbfs: Double?
    let rightRmsDbfs: Double?
    let stereoBalanceDb: Double?
    let signalStatus: String
    let thresholds: LocalRecordingAudioSignalThresholds
    let waveform: [LocalRecordingAudioSignalWindow]
    let observations: [LocalRecordingAudioSignalObservation]
    var loudness: LocalRecordingLoudnessProfile?
}

struct LocalRecordingAudioSignalThresholds: Codable, Equatable, Sendable {
    let clippingAmplitude: Double
    let nearSilenceDbfs: Double
    let possibleDropoutMinimumSeconds: Double
    let surroundingSignalDbfs: Double
    let stereoImbalanceDb: Double
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
    /// Optional so ledgers written before device-first Session transcription
    /// remain decodable. New captures persist an explicit true/false snapshot.
    var transcriptionConsentGranted: Bool? = nil
    var recordingAssetId: String?
    var capturePurpose: String?
    /// Stable local writing identity retained after an offline voice note is
    /// bound to its canonical Nest room for source backup.
    var localDraftCallRoomId: String? = nil
    // Optional on disk so every pre-video ledger remains decodable. New
    // captures always persist all three fields before media bytes begin.
    var mediaKind: LocalRecordingMediaKind? = nil
    var captureGroupId: UUID? = nil
    var roomStartReceiptId: UUID? = nil
    var roomStopReceiptId: UUID? = nil
    var sourceProfile: LocalRecordingSourceProfile? = nil
    var recordingSegmentsJson: String?
    var sourceIntegrityHoldReason: String? = nil

    var uploadProgress: Double?
    var uploadedSourceId: String?
    var uploadedMediaAssetId: String? = nil
    var transcriptJobId: String? = nil
    /// Durable intent used only after Apple Speech has actually failed. Upload
    /// may finish before or after that attempt, so the ledger—not one screen—
    /// owns the eventual single cloud fallback request.
    var cloudTranscriptFallbackRequestId: UUID? = nil
    var cloudTranscriptFallbackReasonCode: String? = nil
    var cloudTranscriptFallbackIntentCreatedAt: Date? = nil
    var cloudTranscriptFallbackAcceptedAt: Date? = nil
    var cloudTranscriptFallbackJobId: String? = nil
    var cloudTranscriptFallbackStatus: String? = nil
    var cloudTranscriptFallbackLastCheckedAt: Date? = nil
    var cloudTranscriptFallbackCompletedAt: Date? = nil
    var cloudTranscriptFallbackError: String? = nil
    var serverVerificationStatus: String?
    var sourceSHA256: String? = nil
    var verifiedCloudSHA256: String? = nil
    var verifiedCloudSizeBytes: Int64? = nil
    var verifiedCloudGeneration: String? = nil
    var verifiedCloudAt: Date? = nil
    var canonicalObjectPath: String? = nil
    var serverProcessingDisposition: String? = nil
    var serverProcessingHoldReasonCode: String? = nil
    var serverProcessingHoldReason: String? = nil
    var serverTranscriptDisposition: String? = nil
    var serverTranscriptHoldReasonCode: String? = nil
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

    var isPersonalVoiceNote: Bool {
        let normalized = capturePurpose?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
            .replacingOccurrences(of: "-", with: "_")
            .replacingOccurrences(of: " ", with: "_") ?? ""
        return normalized == "PERSONAL_NOTE"
            || normalized == "VOICE_NOTE"
            || normalized == "FIELD_NOTE"
    }

    var includesTranscribableAudio: Bool {
        effectiveMediaKind == .audio || sourceProfile?.includesAudio == true
    }

    /// Personal voice writing is an explicit transcription action. Shared
    /// Sessions require the separate all-party transcription decision captured
    /// at the same authoritative refresh that allowed recording to start.
    var shouldBeginAutomaticOnDeviceTranscript: Bool {
        includesTranscribableAudio
            && (isPersonalVoiceNote || transcriptionConsentGranted == true)
    }

    var voiceWritingCallRoomId: String? {
        let local = localDraftCallRoomId?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let local, !local.isEmpty { return local }
        let canonical = callRoomId?.trimmingCharacters(in: .whitespacesAndNewlines)
        return canonical?.isEmpty == false ? canonical : nil
    }

    var needsPersonalVoiceNoteMaterialization: Bool {
        guard isPersonalVoiceNote, status.isUploadEligible else { return false }
        let roomID = callRoomId?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return roomID.hasPrefix("local-voice-note-")
    }

    var needsPersonalVoiceNoteUploadStart: Bool {
        isPersonalVoiceNote
            && status.isUploadEligible
            && status != .uploaded
            && status != .awaitingVerification
            && status != .queued
            && status != .uploading
            && projectSlug?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && episodeSlug?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && callRoomId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
            && recordingConsentId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
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
        let camera = sourceProfile?.cameraPosition?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .capitalized
        return [camera, resolution, frameRate, codec, audio]
            .compactMap { $0?.isEmpty == false ? $0 : nil }
            .joined(separator: " · ")
    }

    var statusLabel: String {
        switch status {
        case .armed:
            return "Armed on \(CaptureDeviceVocabulary.thisDevice)"
        case .recording:
            return "Recording"
        case .paused:
            return "Paused"
        case .finalizing:
            return "Saving on \(CaptureDeviceVocabulary.thisDevice)"
        case .saved:
            return "Saved on \(CaptureDeviceVocabulary.thisDevice)"
        case .queued:
            return "Upload queued"
        case .uploading:
            if let uploadProgress {
                return "Uploading \(Int((uploadProgress * 100).rounded()))%"
            }
            return "Uploading"
        case .awaitingVerification:
            return "Finishing backup"
        case .uploaded:
            if serverProcessingDisposition?.uppercased() == "HELD" {
                switch serverProcessingHoldReasonCode?.uppercased() {
                case "ALL_PARTY_CONSENT_REQUIRED":
                    return "Backed up · permission incomplete"
                case "CONSENT_VERSION_CHANGED":
                    return "Backed up · permission changed"
                case "APPLIED_START_REQUIRED", "START_OWNER_MISMATCH", "START_CONSENT_SNAPSHOT_MISSING":
                    return "Backed up · start not verified"
                default:
                    return "Backed up · protected"
                }
            }
            return serverTranscriptDisposition?.uppercased() == "HELD"
                ? "Backed up · transcript waiting"
                : "Backed up"
        case .uploadHeld:
            return "Backup needs attention"
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
            // Successful uploads used to surface transport receipts such as
            // "Upload verified" directly in the everyday Library. Preserve
            // those receipts in the recording model, but translate the normal
            // success states below. Raw detail remains useful when a recording
            // actually needs attention or is still being recovered.
            switch status {
            case .uploaded, .awaitingVerification:
                break
            default:
                return statusMessage
            }
        }

        switch status {
        case .armed:
            return "Quipsly durably journaled this take before opening the \(effectiveMediaKind.sourceNoun) source. No playable media is claimed yet."
        case .recording:
            return "High-quality \(effectiveMediaKind.sourceNoun) is being written to \(CaptureDeviceVocabulary.thisDevice)."
        case .paused:
            return "The local file is open and preserved; recording can resume."
        case .finalizing:
            return "Quipsly is closing the \(effectiveMediaKind.sourceNoun) file and updating its local ledger."
        case .saved:
            return "The source file is stored locally and has not been deleted."
        case .queued:
            return "The source file is preserved while its upload waits to start or recover."
        case .uploading:
            return "The source file remains on \(CaptureDeviceVocabulary.thisDevice) throughout upload."
        case .awaitingVerification:
            return "The upload finished. Quipsly is checking the backup before using it for transcription or editing."
        case .uploaded:
            if serverProcessingDisposition?.uppercased() == "HELD" {
                return "The backup is safe, but Quipsly will not transcribe or edit a recording whose start-time permission boundary was incomplete. Start a new recording after everyone allows it. The original remains on \(CaptureDeviceVocabulary.thisDevice)."
            }
            if serverTranscriptDisposition?.uppercased() == "HELD" {
                return "The verified recording is ready. Its transcript will start automatically after everyone allows transcription. The original remains on \(CaptureDeviceVocabulary.thisDevice)."
            }
            return "A safe backup is ready. The original remains on \(CaptureDeviceVocabulary.thisDevice)."
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
            return "You explicitly deleted \(deletedSize) from \(CaptureDeviceVocabulary.thisDevice). The protected audit row remains. \(verification)"
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
    var transcriptionConsentGranted: Bool? = nil
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
    var currentRecording: LocalRecording? {
        recordings.first {
            [.armed, .recording, .paused, .finalizing].contains($0.status)
        }
    }
    var mostRecentRecording: LocalRecording? { recordings.first }
    @Published private(set) var persistenceError: String?
    @Published private(set) var derivedAnalysisNotices: [UUID: String] = [:]
    @Published private(set) var quarantinedLedgerFileName: String?

    var latestDerivedAnalysisNotice: String? {
        recordings.lazy.compactMap { self.derivedAnalysisNotices[$0.id] }.first
    }

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
        let audioSignal: LocalRecordingAudioSignalProfile?
        let audibleEventAnalysis: LocalRecordingAudibleEventAnalysisProfile?
        let sourceIntegrityHoldReason: String?

        nonisolated init(
            isPlayable: Bool,
            durationSeconds: TimeInterval?,
            failureMessage: String?,
            recordedMedia: LocalRecordingRecordedMediaProfile? = nil,
            audioSignal: LocalRecordingAudioSignalProfile? = nil,
            audibleEventAnalysis: LocalRecordingAudibleEventAnalysisProfile? = nil,
            sourceIntegrityHoldReason: String? = nil
        ) {
            self.isPlayable = isPlayable
            self.durationSeconds = durationSeconds
            self.failureMessage = failureMessage
            self.recordedMedia = recordedMedia
            self.audioSignal = audioSignal
            self.audibleEventAnalysis = audibleEventAnalysis
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
    private var projectionPublishTask: Task<Void, Never>?

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
            // Auth restoration can publish while SwiftUI is replacing its
            // launch shell. A main-actor yield may resume inside that same
            // render transaction, so cross an actual run-loop boundary before
            // exposing the new account partition.
            DispatchQueue.main.async { [weak self] in
                self?.activateOwner(ownerAccountID)
            }
        }
    }

    /// Changes only the visible account partition. Source files and ledger rows
    /// for every other account, including legacy unowned rows, remain untouched.
    func activateOwner(_ ownerAccountID: String?) {
        let normalizedOwnerAccountID = normalizedOwnerID(ownerAccountID)
        guard normalizedOwnerAccountID != activeOwnerAccountID else { return }
        activeOwnerAccountID = normalizedOwnerAccountID
        derivedAnalysisNotices = [:]
        sortAndPublish()
    }

#if DEBUG
    /// Installs one exact, checksum-verified source file for the operated
    /// simulator acceptance journey. This is unavailable in release builds
    /// and requires the explicit runtime-smoke playback-fixture launch flag.
    @discardableResult
    func installRuntimeSmokePlaybackFixtureIfRequested() throws -> LocalRecording? {
        let process = ProcessInfo.processInfo
        guard process.arguments.contains("--quipsly-capture-runtime-smoke"),
              process.arguments.contains("--quipsly-capture-runtime-playback-fixture") else {
            return nil
        }
        let credentialsPath = process.environment["QUIPSLY_CAPTURE_UI_TEST_CREDENTIALS_FILE"]
            ?? "/tmp/quipsly-capture-runtime-ui-smoke-credentials.json"
        let credentialData = try Data(contentsOf: URL(fileURLWithPath: credentialsPath))
        let fixture = try decoder.decode(RuntimeSmokePlaybackFixture.self, from: credentialData)
        guard let localID = UUID(uuidString: fixture.recordingFixtureLocalID),
              let ownerAccountID = normalizedOwnerID(fixture.recordingFixtureOwnerAccountID),
              let expectedSHA256 = normalizedSHA256(fixture.recordingFixtureSHA256),
              let assetID = nonempty(fixture.recordingFixtureAssetID),
              let roomID = nonempty(fixture.recordingFixtureRoomID),
              let participantID = nonempty(fixture.recordingFixtureParticipantID),
              let consentID = nonempty(fixture.recordingFixtureConsentID) else {
            throw LibraryError.invalidRuntimeSmokeFixture
        }
        guard ownerAccountID == normalizedOwnerID(activeOwnerAccountID),
              ownerAccountID == AuthManager.currentStoredOwnerID() else {
            throw LibraryError.runtimeSmokeFixtureOwnerMismatch
        }

        let sourceURL = URL(fileURLWithPath: fixture.recordingFixturePath).resolvingSymlinksInPath()
        let temporaryRoot = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .resolvingSymlinksInPath()
        let sourceValues = try sourceURL.resourceValues(forKeys: [.isRegularFileKey, .isSymbolicLinkKey])
        let isAppTemporarySource = sourceURL.path.hasPrefix(temporaryRoot.path + "/")
        let isXCTestHostBridge = sourceURL.path.hasPrefix(
            "/private/tmp/quipsly-capture-runtime-playback-fixture-"
        ) || sourceURL.path.hasPrefix(
            "/tmp/quipsly-capture-runtime-playback-fixture-"
        )
        guard (isAppTemporarySource || isXCTestHostBridge),
              sourceValues.isRegularFile == true,
              sourceValues.isSymbolicLink != true,
              Self.supportedAudioFileExtensions.contains(sourceURL.pathExtension.lowercased()) else {
            throw LibraryError.runtimeSmokeFixtureSourceRejected
        }

        let sourceData = try Data(contentsOf: sourceURL, options: .mappedIfSafe)
        let actualSHA256 = SHA256.hash(data: sourceData)
            .map { String(format: "%02x", $0) }
            .joined()
        guard actualSHA256 == expectedSHA256 else {
            throw LibraryError.runtimeSmokeFixtureChecksumMismatch
        }

        try ensureRecordingsDirectory()
        let targetURL = recordingsDirectoryURL
            .appendingPathComponent("quipsly-runtime-smoke-\(localID.uuidString.lowercased())")
            .appendingPathExtension(sourceURL.pathExtension.lowercased())
        if fileManager.fileExists(atPath: targetURL.path) {
            let existingData = try Data(contentsOf: targetURL, options: .mappedIfSafe)
            let existingSHA256 = SHA256.hash(data: existingData)
                .map { String(format: "%02x", $0) }
                .joined()
            guard existingSHA256 == expectedSHA256 else {
                throw LibraryError.runtimeSmokeFixtureChecksumMismatch
            }
        } else {
            try sourceData.write(
                to: targetURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
        }

        let validation = Self.validateSourceHeader(at: targetURL, mediaKind: .audio)
        guard validation.isPlayable, let durationSeconds = validation.durationSeconds else {
            throw LibraryError.runtimeSmokeFixtureNotPlayable
        }
        let installedAt = Date()
        let recording = LocalRecording(
            id: localID,
            ownerAccountID: ownerAccountID,
            fileName: targetURL.lastPathComponent,
            displayTitle: nonempty(fixture.recordingFixtureTitle) ?? "Runtime transcript source",
            sessionTitle: nonempty(fixture.recordingFixtureTitle),
            startedAt: installedAt.addingTimeInterval(-durationSeconds),
            stoppedAt: installedAt,
            durationSeconds: durationSeconds,
            byteCount: Int64(sourceData.count),
            status: .uploaded,
            projectSlug: nil,
            episodeSlug: nil,
            callRoomId: roomID,
            participantId: participantID,
            recordingConsentId: consentID,
            recordingConsentGranted: true,
            recordingAssetId: assetID,
            capturePurpose: "operated-runtime-transcript-review",
            mediaKind: .audio,
            captureGroupId: localID,
            roomStartReceiptId: nil,
            sourceProfile: nil,
            recordingSegmentsJson: nil,
            uploadProgress: 1,
            uploadedSourceId: assetID,
            serverVerificationStatus: "verified",
            sourceSHA256: expectedSHA256,
            verifiedCloudSHA256: expectedSHA256,
            verifiedCloudSizeBytes: Int64(sourceData.count),
            verifiedCloudAt: installedAt,
            statusMessage: "Exact retained source installed for the operated simulator acceptance journey."
        )
        try commit(upserting: recording)
        return recording
    }

    private struct RuntimeSmokePlaybackFixture: Decodable {
        let recordingFixturePath: String
        let recordingFixtureLocalID: String
        let recordingFixtureAssetID: String
        let recordingFixtureRoomID: String
        let recordingFixtureParticipantID: String
        let recordingFixtureConsentID: String
        let recordingFixtureOwnerAccountID: String
        let recordingFixtureSHA256: String
        let recordingFixtureTitle: String?
    }
#endif

    func makeUniqueRecordingURL(startedAt: Date = Date()) throws -> URL {
        try makeUniqueSourceURL(mediaKind: .audio, startedAt: startedAt)
    }

    /// Removes only a never-started encoder file created before the durable
    /// recording ledger accepted ownership. A URL that left the canonical
    /// folder, does not match Quipsly's generated audio naming contract, or is
    /// already represented by any ledger row is preserved for recovery.
    /// Finalized and in-progress recordings must use the explicit source
    /// lifecycle; this helper can never delete them.
    func discardUncommittedPreflightFile(at fileURL: URL) throws {
        let candidate = fileURL.standardizedFileURL
        guard candidate.deletingLastPathComponent() == recordingsDirectoryURL.standardizedFileURL,
              isSafeRecordingFileName(
                candidate.lastPathComponent,
                expectedMediaKind: .audio
              ),
              !storedRecordings.contains(where: { $0.fileName == candidate.lastPathComponent }) else {
            throw LibraryError.localDeletionBlocked(
                "Quipsly preserved this file because it may already be recording evidence."
            )
        }
        guard fileManager.fileExists(atPath: candidate.path) else { return }
        try fileManager.removeItem(at: candidate)
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
            transcriptionConsentGranted: context.transcriptionConsentGranted,
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

        // Persist the armed source before touching the microphone, but do not
        // expose an intermediate Library row in the same UI transaction that
        // initiated recording. `markRecording` publishes once the media writer
        // has actually started; a crash before then still recovers this durable
        // armed row from disk on next launch.
        try commit(upserting: recording, publishProjection: false)
        return recording
    }

    func markRecording(_ id: UUID, durationSeconds: TimeInterval) throws {
        try mutate(
            id,
            allowInactiveOwner: true,
            publishProjection: false
        ) { recording in
            recording.status = .recording
            recording.durationSeconds = max(0, durationSeconds)
            recording.statusMessage = nil
        }
        scheduleProjectionPublish()
    }

    func markPaused(_ id: UUID, durationSeconds: TimeInterval, interruption: Bool) throws {
        try mutate(id, allowInactiveOwner: true) { recording in
            recording.status = .paused
            recording.durationSeconds = max(0, durationSeconds)
            recording.statusMessage = interruption
                ? "An audio interruption paused this recording safely. Return to Quipsly, check the microphone, and tap Resume when you are ready."
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

    /// Appends bounded NTP-style samples to one immutable source. Opening,
    /// periodic, and stop samples share the source's monotonic clock; they may
    /// improve drift estimates but never rewrite media timestamps or claim
    /// sample-accurate synchronization.
    func recordClockEvidence(
        _ id: UUID,
        samples: [LocalRecordingClockSample],
        monotonicStoppedNanoseconds: UInt64? = nil
    ) throws {
        try mutate(id, allowInactiveOwner: true) { recording in
            guard var profile = recording.sourceProfile,
                  let callRoomID = recording.callRoomId,
                  let captureGroupID = recording.captureGroupId,
                  samples.count <= 3,
                  samples.allSatisfy({ sample in
                      sample.protocolVersion == 1
                          && sample.callRoomId == callRoomID
                          && sample.captureGroupId == captureGroupID
                          && sample.clientKind == "ios"
                          && sample.deviceMonotonicReceivedNanoseconds
                              >= sample.deviceMonotonicSentNanoseconds
                  }) else {
                throw LibraryError.clockEvidenceConflict
            }
            if let monotonicStoppedNanoseconds {
                guard let started = profile.monotonicStartedNanoseconds,
                      monotonicStoppedNanoseconds >= started else {
                    throw LibraryError.clockEvidenceConflict
                }
                profile.monotonicStoppedNanoseconds = monotonicStoppedNanoseconds
            }
            var byID: [UUID: LocalRecordingClockSample] = [:]
            for sample in profile.clockSamples ?? [] {
                byID[sample.sampleId] = sample
            }
            for sample in samples {
                byID[sample.sampleId] = sample
            }
            let ordered = byID.values.sorted {
                if $0.deviceMonotonicSentNanoseconds
                    != $1.deviceMonotonicSentNanoseconds {
                    return $0.deviceMonotonicSentNanoseconds
                        < $1.deviceMonotonicSentNanoseconds
                }
                return $0.sampleId.uuidString < $1.sampleId.uuidString
            }
            let maximumSamples = 48
            if ordered.count > maximumSamples {
                profile.clockSamples = Array(ordered.prefix(3))
                    + Array(ordered.suffix(maximumSamples - 3))
            } else {
                profile.clockSamples = ordered
            }
            recording.sourceProfile = profile
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
            self.applyValidatedSourceTruth(
                validation,
                fileURL: fileURL,
                playableStatus: .saved,
                playableMessage: preservedMessage,
                to: &recording
            )
        }

        // The complete decoded source and its playable status are the durable
        // capture result. Waveform, loudness, and sound-event observations are
        // valuable derived projections, but a malformed or future analysis
        // payload must never turn already-proven source bytes into a failed
        // recording. Attach them only after source truth has committed.
        attachDerivedAnalysisIfPossible(validation, to: id)

        guard let recording = storedRecordings.first(where: { $0.id == id }) else {
            throw LibraryError.recordingNotFound
        }
        return recording
    }

    func markCaptureFailed(_ id: UUID, durationSeconds: TimeInterval, message: String) throws {
        try mutate(id, allowInactiveOwner: true) { recording in
            // This transition describes a capture attempt, not immutable
            // source truth. A late recorder, transcription, analysis, upload,
            // or UI error must never demote bytes that have already passed a
            // source boundary. `validatingRecovery` also stays intact so the
            // launch-owned EOF check can finish or retry after process death.
            switch recording.status {
            case .armed, .recording, .paused, .finalizing, .captureFailed:
                break
            case .validatingRecovery, .saved, .queued, .uploading,
                 .awaitingVerification, .uploaded, .uploadHeld, .recovered,
                 .needsRepair, .missingFile, .deletedLocally:
                return
            }
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
        mediaAssetId: String? = nil,
        recordingAssetId: String? = nil,
        transcriptJobId: String? = nil,
        serverVerificationStatus: String?,
        sourceSHA256: String? = nil,
        verifiedCloudSHA256: String? = nil,
        verifiedCloudSizeBytes: Int64? = nil,
        verifiedCloudGeneration: String? = nil,
        verifiedCloudAt: Date? = nil,
        canonicalObjectPath: String? = nil,
        processingDisposition: String? = nil,
        processingHoldReasonCode: String? = nil,
        processingHoldReason: String? = nil,
        transcriptDisposition: String? = nil,
        transcriptHoldReasonCode: String? = nil,
        detail: String?
    ) throws {
        try mutate(id) { recording in
            let verification = serverVerificationStatus?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            recording.uploadProgress = 1
            recording.uploadedSourceId = self.nonempty(sourceId)
            recording.uploadedMediaAssetId = self.nonempty(mediaAssetId)
            recording.recordingAssetId = self.nonempty(recordingAssetId)
                ?? recording.recordingAssetId
            recording.transcriptJobId = self.nonempty(transcriptJobId)
                ?? recording.transcriptJobId
            recording.serverVerificationStatus = self.nonempty(serverVerificationStatus)
            recording.sourceSHA256 = self.normalizedSHA256(sourceSHA256)
            recording.verifiedCloudSHA256 = self.normalizedSHA256(
                verifiedCloudSHA256
            )
            recording.verifiedCloudSizeBytes = verifiedCloudSizeBytes
            recording.verifiedCloudGeneration = self.nonempty(
                verifiedCloudGeneration
            )
            recording.verifiedCloudAt = verifiedCloudAt
            recording.canonicalObjectPath = self.nonempty(canonicalObjectPath)
            recording.serverProcessingDisposition = self.nonempty(processingDisposition)
            recording.serverProcessingHoldReasonCode = self.nonempty(processingHoldReasonCode)
            recording.serverProcessingHoldReason = self.nonempty(processingHoldReason)
            recording.serverTranscriptDisposition = self.nonempty(transcriptDisposition)
            recording.serverTranscriptHoldReasonCode = self.nonempty(transcriptHoldReasonCode)
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

    @discardableResult
    func reconcileServerDisposition(
        _ id: UUID,
        source: MobileCaptureSourceSummary
    ) throws -> Bool {
        guard let existing = recording(id: id),
              let update = CaptureNestSourceEvidenceContract.serverDispositionUpdate(
                localRecordingAssetID: existing.recordingAssetId,
                localServerVerificationStatus: existing.serverVerificationStatus,
                localVerifiedCloudSHA256: existing.verifiedCloudSHA256,
                localVerifiedCloudSizeBytes: existing.verifiedCloudSizeBytes,
                serverRecordingAssetID: source.recordingAssetId,
                serverRecordingStatus: source.recordingStatus,
                serverExactBytesVerified: source.exactBytesVerified,
                serverSHA256: source.sha256,
                serverByteSize: source.byteSize,
                serverProcessingDisposition: source.processingDisposition,
                serverTranscriptDisposition: source.transcriptDisposition,
                serverSourceID: source.sourceId,
                serverMediaAssetID: source.mediaAssetId
              ) else {
            return false
        }
        let desiredStatusMessage = update.processingDisposition == "RELEASED"
            ? update.transcriptDisposition == "RELEASED"
                ? "The backup is verified and ready for editing and transcription."
                : "The backup is verified and ready for editing. Transcription will begin after everyone allows it."
            : existing.statusMessage
        guard existing.serverProcessingDisposition != update.processingDisposition
                || existing.serverTranscriptDisposition != update.transcriptDisposition
                || (update.sourceID != nil && existing.uploadedSourceId != update.sourceID)
                || (update.mediaAssetID != nil && existing.uploadedMediaAssetId != update.mediaAssetID)
                || existing.statusMessage != desiredStatusMessage else {
            return false
        }
        try mutate(id) { recording in
            recording.serverProcessingDisposition = update.processingDisposition
            recording.serverTranscriptDisposition = update.transcriptDisposition
            recording.uploadedSourceId = update.sourceID ?? recording.uploadedSourceId
            recording.uploadedMediaAssetId = update.mediaAssetID ?? recording.uploadedMediaAssetId
            if update.processingDisposition == "RELEASED" {
                recording.serverProcessingHoldReasonCode = nil
                recording.serverProcessingHoldReason = nil
                recording.statusMessage = desiredStatusMessage
            }
            if update.transcriptDisposition == "RELEASED" {
                recording.serverTranscriptHoldReasonCode = nil
            }
        }
        return true
    }

    func markOnDeviceTranscriptAttached(_ id: UUID, transcriptJobId: String) throws {
        guard let normalizedJobId = nonempty(transcriptJobId) else {
            throw LibraryError.recordingNotFound
        }
        try mutate(id) { recording in
            recording.transcriptJobId = normalizedJobId
        }
    }

    func markCloudTranscriptFallbackNeeded(
        _ id: UUID,
        requestId: UUID,
        reasonCode: String,
        createdAt: Date = Date()
    ) throws {
        let normalizedReason = reasonCode.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedReason.isEmpty else { throw LibraryError.recordingNotFound }
        try mutate(id, allowInactiveOwner: true) { recording in
            guard recording.cloudTranscriptFallbackAcceptedAt == nil else { return }
            if let existing = recording.cloudTranscriptFallbackRequestId {
                guard existing == requestId
                    || recording.cloudTranscriptFallbackReasonCode == normalizedReason else {
                    throw LibraryError.recordingNotFound
                }
                return
            }
            recording.cloudTranscriptFallbackRequestId = requestId
            recording.cloudTranscriptFallbackReasonCode = normalizedReason
            recording.cloudTranscriptFallbackIntentCreatedAt = createdAt
        }
    }

    func markCloudTranscriptFallbackAccepted(
        _ id: UUID,
        requestId: UUID,
        transcriptJobId: String,
        status: String,
        acceptedAt: Date = Date()
    ) throws {
        guard let normalizedJobId = nonempty(transcriptJobId) else {
            throw LibraryError.recordingNotFound
        }
        let normalizedStatus = status
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        guard !normalizedStatus.isEmpty else { throw LibraryError.recordingNotFound }
        try mutate(id, allowInactiveOwner: true) { recording in
            guard recording.cloudTranscriptFallbackRequestId == requestId else {
                throw LibraryError.recordingNotFound
            }
            recording.cloudTranscriptFallbackAcceptedAt = acceptedAt
            recording.cloudTranscriptFallbackJobId = normalizedJobId
            recording.cloudTranscriptFallbackStatus = normalizedStatus
            recording.cloudTranscriptFallbackLastCheckedAt = acceptedAt
            recording.cloudTranscriptFallbackCompletedAt = normalizedStatus.uppercased() == "COMPLETED"
                ? acceptedAt
                : nil
            recording.cloudTranscriptFallbackError = nil
            recording.transcriptJobId = normalizedJobId
        }
    }

    func reconcileCloudTranscriptFallback(
        _ id: UUID,
        transcriptJobId: String,
        status: String,
        errorMessage: String?,
        checkedAt: Date = Date()
    ) throws {
        guard let normalizedJobId = nonempty(transcriptJobId) else {
            throw LibraryError.recordingNotFound
        }
        let normalizedStatus = status
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .uppercased()
        guard ["QUEUED", "RUNNING", "HELD", "COMPLETED", "FAILED"].contains(normalizedStatus) else {
            throw LibraryError.recordingNotFound
        }
        try mutate(id, allowInactiveOwner: true) { recording in
            guard recording.cloudTranscriptFallbackJobId == normalizedJobId,
                  recording.cloudTranscriptFallbackAcceptedAt != nil else {
                throw LibraryError.recordingNotFound
            }
            recording.cloudTranscriptFallbackStatus = normalizedStatus
            recording.cloudTranscriptFallbackLastCheckedAt = checkedAt
            recording.cloudTranscriptFallbackCompletedAt = normalizedStatus == "COMPLETED"
                ? (recording.cloudTranscriptFallbackCompletedAt ?? checkedAt)
                : nil
            recording.cloudTranscriptFallbackError = self.nonempty(errorMessage)
        }
    }

    @discardableResult
    func bindLocalPersonalVoiceNote(
        _ id: UUID,
        projectSlug: String,
        episodeSlug: String,
        callRoomId: String,
        participantId: String?,
        recordingConsentId: String,
        sessionTitle: String
    ) throws -> LocalRecording {
        let normalizedProject = projectSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedEpisode = episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedRoom = callRoomId.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedConsent = recordingConsentId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalizedProject.isEmpty,
              !normalizedEpisode.isEmpty,
              !normalizedRoom.isEmpty,
              !normalizedConsent.isEmpty else {
            throw LibraryError.recordingNotFound
        }
        try mutate(id) { recording in
            guard recording.isPersonalVoiceNote,
                  recording.status.isUploadEligible else {
                throw LibraryError.recordingNotFound
            }
            let previousRoom = recording.callRoomId?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if recording.localDraftCallRoomId == nil,
               previousRoom?.hasPrefix("local-voice-note-") == true {
                recording.localDraftCallRoomId = previousRoom
            }
            recording.projectSlug = normalizedProject
            recording.episodeSlug = normalizedEpisode
            recording.callRoomId = normalizedRoom
            recording.participantId = self.nonempty(participantId)
            recording.recordingConsentId = normalizedConsent
            recording.recordingConsentGranted = true
            recording.sessionTitle = self.nonempty(sessionTitle) ?? recording.sessionTitle
            recording.statusMessage = nil
        }
        guard let recording = recording(id: id) else {
            throw LibraryError.recordingNotFound
        }
        return recording
    }

    func markRoomStopReceipt(_ id: UUID, receiptID: UUID) throws {
        try mutate(id, allowInactiveOwner: true) { recording in
            if let existing = recording.roomStopReceiptId,
               existing != receiptID {
                throw LibraryError.roomStopReceiptConflict
            }
            recording.roomStopReceiptId = receiptID
        }
    }

    @discardableResult
    func markRoomStopReceiptIfPresent(
        _ id: UUID,
        receiptID: UUID
    ) throws -> Bool {
        guard storedRecordings.contains(where: { $0.id == id }) else {
            return false
        }
        try markRoomStopReceipt(id, receiptID: receiptID)
        return true
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

    private func commit(
        upserting recording: LocalRecording,
        publishProjection: Bool = true
    ) throws {
        var updated = storedRecordings
        if let index = updated.firstIndex(where: { $0.id == recording.id }) {
            updated[index] = recording
        } else {
            updated.append(recording)
        }
        try persist(updated)
        storedRecordings = updated
        if publishProjection {
            sortAndPublish()
        }
    }

    private func mutate(
        _ id: UUID,
        allowInactiveOwner: Bool = false,
        publishProjection: Bool = true,
        change: (inout LocalRecording) throws -> Void
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
        try change(&updated[index])
        try persist(updated)
        storedRecordings = updated
        if publishProjection {
            sortAndPublish()
        }
    }

    /// Durable ledger transitions and SwiftUI projection invalidation are two
    /// different responsibilities. Recording START is committed synchronously;
    /// only its visible Library snapshot crosses to a fresh main-actor turn.
    private func scheduleProjectionPublish() {
        projectionPublishTask?.cancel()
        projectionPublishTask = Task { @MainActor [weak self] in
            await Task.yield()
            guard !Task.isCancelled, let self else { return }
            self.sortAndPublish()
            self.projectionPublishTask = nil
        }
    }

    private func persist(_ recordings: [LocalRecording]) throws {
        guard ledgerIsWritable else {
            throw LibraryError.ledgerQuarantined
        }

        let ledger = Ledger(schemaVersion: 6, recordings: recordings)
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
            if persistenceError != nil {
                persistenceError = nil
            }
        } catch {
            let message = "The protected recording journal could not be saved: \(error.localizedDescription)"
            if persistenceError != message {
                persistenceError = message
            }
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
            let sidecar = SourceSidecar(schemaVersion: 3, recording: recording)
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
            if recording.stoppedAt == nil, durationSeconds > 0 {
                // A process death cannot append the ordinary STOP receipt. Once
                // the complete media stream has yielded a bounded duration,
                // preserve that decoded boundary instead of leaving an otherwise
                // uploadable recovered source without an end timestamp.
                recording.stoppedAt = recording.startedAt.addingTimeInterval(
                    durationSeconds
                )
            }
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

    /// Completes any launch-recovered source validation after SwiftUI has
    /// mounted the application lifecycle. Starting this work from the
    /// ObservableObject initializer can finish while SwiftUI is still
    /// installing subscribers, which turns legitimate recovery publications
    /// into undefined view-update reentrancy. Candidates remain fail-closed in
    /// `validatingRecovery` until this lifecycle-owned operation commits them.
    func validatePendingRecoveredSources() async {
        let candidates = pendingDeepValidations
        pendingDeepValidations.removeAll()
        guard !candidates.isEmpty else { return }

        for candidate in candidates {
            let validation = await Task.detached(priority: .utility) {
                await Self.validateSourceThroughEnd(
                    at: candidate.fileURL,
                    mediaKind: candidate.mediaKind,
                    expectedSourceProfile: candidate.expectedSourceProfile
                )
            }.value
            // Deep validation can finish during SwiftUI's first authenticated
            // render. Commit inside the next queue block itself. Resuming a
            // continuation and mutating afterward can re-enter this task before
            // that block returns, which is still inside the shell transition.
            await withCheckedContinuation { continuation in
                DispatchQueue.main.async { [weak self] in
                    guard let self else {
                        continuation.resume()
                        return
                    }
                    do {
                        try self.mutate(candidate.recordingID, allowInactiveOwner: true) { recording in
                            guard recording.status == .validatingRecovery else { return }
                            self.applyValidatedSourceTruth(
                                validation,
                                fileURL: candidate.fileURL,
                                playableStatus: .recovered,
                                playableMessage: candidate.playableMessage,
                                to: &recording
                            )
                        }
                        self.attachDerivedAnalysisIfPossible(
                            validation,
                            to: candidate.recordingID
                        )
                    } catch {
                        self.persistenceError = "Recovery validation finished, but its protected result could not be committed: \(error.localizedDescription)"
                    }
                    continuation.resume()
                }
            }
        }
    }

    private func applyValidatedSourceTruth(
        _ validation: SourceValidation,
        fileURL: URL,
        playableStatus: LocalRecording.Status,
        playableMessage: String?,
        to recording: inout LocalRecording
    ) {
        recording.byteCount = fileByteCount(at: fileURL)
        if let durationSeconds = validation.durationSeconds {
            recording.durationSeconds = durationSeconds
        }
        if let recordedMedia = validation.recordedMedia,
           var sourceProfile = recording.sourceProfile {
            sourceProfile.recordedMedia = recordedMedia
            recording.sourceProfile = sourceProfile
        }
        recording.sourceIntegrityHoldReason = validation.sourceIntegrityHoldReason
        if validation.isPlayable {
            recording.status = playableStatus
            recording.statusMessage = validation.sourceIntegrityHoldReason
                ?? playableMessage
        } else {
            recording.status = .needsRepair
            recording.statusMessage = validation.failureMessage
        }
    }

    /// Derived analysis is recomputable and must remain downstream of the
    /// immutable-source commit. If encoding or persistence rejects analysis,
    /// keep the proven source usable and expose a scoped diagnostic instead of
    /// rewriting the recording as `captureFailed`.
    private func attachDerivedAnalysisIfPossible(
        _ validation: SourceValidation,
        to recordingID: UUID
    ) {
        guard validation.isPlayable,
              (validation.audioSignal != nil
                || validation.audibleEventAnalysis != nil) else { return }
        #if DEBUG && targetEnvironment(simulator)
        if CaptureLaunchConfiguration.usesDerivedAnalysisPersistenceFailureUITest {
            // Reproduce the late generic failure report that originally
            // demoted an already-decoded recording. The public transition
            // guard above must preserve the committed source status.
            try? markCaptureFailed(
                recordingID,
                durationSeconds: validation.durationSeconds ?? 0,
                message: "Injected downstream analysis failure."
            )
            derivedAnalysisNotices[recordingID] = "The recording is saved and playable. Its quality scan did not finish, so waveform and loudness details are not available yet."
            return
        }
        #endif
        do {
            try mutate(recordingID, allowInactiveOwner: true) { recording in
                guard var sourceProfile = recording.sourceProfile else { return }
                sourceProfile.audioSignal = validation.audioSignal
                sourceProfile.audibleEventAnalysis = validation.audibleEventAnalysis
                recording.sourceProfile = sourceProfile
            }
            derivedAnalysisNotices.removeValue(forKey: recordingID)
        } catch {
            derivedAnalysisNotices[recordingID] = "The recording is saved and playable. Its quality scan did not finish, so waveform and loudness details are not available yet."
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
            let header = validateAudioSource(at: fileURL, readsToEnd: false)
            guard header.isPlayable,
                  let headerDurationSeconds = header.durationSeconds else {
                return header
            }
            async let pendingAudibleEventAnalysis = LocalAudibleEventAnalyzer.analyze(
                fileURL: fileURL,
                durationSeconds: headerDurationSeconds,
                sourceByteCount: fileByteCountForValidation(at: fileURL),
                supersedesAnalysisId: expectedSourceProfile?.audibleEventAnalysis?.analysisId
            )
            let validation = validateAudioSource(at: fileURL, readsToEnd: true)
            guard validation.isPlayable,
                  validation.durationSeconds != nil else {
                _ = await pendingAudibleEventAnalysis
                return validation
            }
            let audibleEventAnalysis = await pendingAudibleEventAnalysis
            return SourceValidation(
                isPlayable: validation.isPlayable,
                durationSeconds: validation.durationSeconds,
                failureMessage: validation.failureMessage,
                recordedMedia: validation.recordedMedia,
                audioSignal: validation.audioSignal,
                audibleEventAnalysis: audibleEventAnalysis,
                sourceIntegrityHoldReason: validation.sourceIntegrityHoldReason
            )
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
            let audioFile = try AVAudioFile(
                forReading: fileURL,
                commonFormat: .pcmFormatFloat32,
                interleaved: false
            )
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
            let recordedMedia = LocalRecordingRecordedMediaProfile(
                videoTrackCount: 0,
                audioTrackCount: 1,
                videoCodec: nil,
                encodedWidth: nil,
                encodedHeight: nil,
                presentationWidth: nil,
                presentationHeight: nil,
                rotationDegrees: nil,
                nominalFrameRate: nil,
                audioSampleRate: sampleRate,
                audioChannelCount: Int(audioFile.processingFormat.channelCount),
                durationSeconds: duration
            )
            let signal = readsToEnd
                ? try analyzeAudioSignal(
                    audioFile: audioFile,
                    frameCount: frameCount,
                    durationSeconds: duration
                )
                : nil
            return SourceValidation(
                isPlayable: true,
                durationSeconds: duration,
                failureMessage: nil,
                recordedMedia: recordedMedia,
                audioSignal: signal
            )
        } catch {
            return SourceValidation(
                isPlayable: false,
                durationSeconds: nil,
                failureMessage: "Quipsly preserved the source bytes, but iOS could not decode a complete audio stream. It needs repair and is not claimed playable."
            )
        }
    }

    nonisolated private static func analyzeAudioSignal(
        audioFile: AVAudioFile,
        frameCount: AVAudioFramePosition,
        durationSeconds: Double
    ) throws -> LocalRecordingAudioSignalProfile {
        let format = audioFile.processingFormat
        let sampleRate = format.sampleRate
        let channelCount = Int(format.channelCount)
        guard channelCount > 0 else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let thresholds = LocalRecordingAudioSignalThresholds(
            clippingAmplitude: 0.999,
            nearSilenceDbfs: -72,
            possibleDropoutMinimumSeconds: 0.25,
            surroundingSignalDbfs: -45,
            stereoImbalanceDb: 12
        )
        let minimumWindowFrames = max(Int64((sampleRate * 0.1).rounded()), 1)
        let boundedPointCount: Int64 = 1_200
        let framesPerWindow = max(
            minimumWindowFrames,
            Int64(ceil(Double(frameCount) / Double(boundedPointCount)))
        )
        let windowDuration = Double(framesPerWindow) / sampleRate
        let nearSilenceAmplitude = pow(10, thresholds.nearSilenceDbfs / 20)
        let bufferCapacity: AVAudioFrameCount = 65_536
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: bufferCapacity
        ) else {
            throw CocoaError(.fileReadCorruptFile)
        }

        struct WindowAccumulator {
            var frameCount: Int64 = 0
            var sumSquares: Double = 0
            var peak: Double = 0
            var clippedFrames: Int64 = 0
        }

        audioFile.framePosition = 0
        var decodedFrames: Int64 = 0
        var totalSumSquares: Double = 0
        var totalPeak: Double = 0
        var clippedFrames: Int64 = 0
        var nearSilentFrames: Int64 = 0
        var channelSumSquares = [Double](repeating: 0, count: channelCount)
        var loudnessAnalyzer = LocalBS1770LoudnessAnalyzer(
            sampleRate: sampleRate,
            channelCount: channelCount
        )
        var windows: [LocalRecordingAudioSignalWindow] = []
        windows.reserveCapacity(Int(min(boundedPointCount, Int64.max)))
        var accumulator = WindowAccumulator()

        func finishWindow() {
            guard accumulator.frameCount > 0 else { return }
            let startFrame = decodedFrames - accumulator.frameCount
            windows.append(
                LocalRecordingAudioSignalWindow(
                    startSeconds: roundedSignal(Double(startFrame) / sampleRate),
                    durationSeconds: roundedSignal(Double(accumulator.frameCount) / sampleRate),
                    rmsDbfs: amplitudeDbfs(
                        sqrt(accumulator.sumSquares / Double(accumulator.frameCount))
                    ),
                    samplePeakDbfs: amplitudeDbfs(accumulator.peak),
                    clippedFrameCount: accumulator.clippedFrames
                )
            )
            accumulator = WindowAccumulator()
        }

        while decodedFrames < frameCount {
            buffer.frameLength = 0
            let remaining = frameCount - AVAudioFramePosition(decodedFrames)
            try audioFile.read(
                into: buffer,
                frameCount: AVAudioFrameCount(min(Int64(bufferCapacity), remaining))
            )
            guard buffer.frameLength > 0,
                  let channels = buffer.floatChannelData else { break }
            loudnessAnalyzer?.consume(
                planarFloatChannels: channels,
                frameCount: Int(buffer.frameLength)
            )
            for frameIndex in 0..<Int(buffer.frameLength) {
                var channelEnergy = 0.0
                var framePeak = 0.0
                for channelIndex in 0..<channelCount {
                    let sample = Double(channels[channelIndex][frameIndex])
                    channelEnergy += sample * sample
                    framePeak = max(framePeak, abs(sample))
                    channelSumSquares[channelIndex] += sample * sample
                }
                // Average channel energy rather than channel samples. A sample
                // average can cancel valid, out-of-phase stereo audio and make
                // a healthy source look silent.
                let square = channelEnergy / Double(channelCount)
                totalSumSquares += square
                totalPeak = max(totalPeak, framePeak)
                accumulator.sumSquares += square
                accumulator.peak = max(accumulator.peak, framePeak)
                if framePeak >= thresholds.clippingAmplitude {
                    clippedFrames += 1
                    accumulator.clippedFrames += 1
                }
                if framePeak <= nearSilenceAmplitude {
                    nearSilentFrames += 1
                }
                accumulator.frameCount += 1
                decodedFrames += 1
                if accumulator.frameCount >= framesPerWindow {
                    finishWindow()
                }
            }
        }
        finishWindow()
        guard decodedFrames == frameCount, decodedFrames > 0 else {
            throw CocoaError(.fileReadCorruptFile)
        }

        let rms = amplitudeDbfs(sqrt(totalSumSquares / Double(decodedFrames)))
        let peak = amplitudeDbfs(totalPeak)
        let leftRms = channelCount > 0
            ? amplitudeDbfs(sqrt(channelSumSquares[0] / Double(decodedFrames)))
            : nil
        let rightRms = channelCount > 1
            ? amplitudeDbfs(sqrt(channelSumSquares[1] / Double(decodedFrames)))
            : nil
        let balance = leftRms.flatMap { left in rightRms.map { $0 - left } }
        let observations = signalObservations(
            windows: windows,
            durationSeconds: durationSeconds,
            signalPeakDbfs: peak,
            stereoBalanceDb: balance,
            thresholds: thresholds
        )
        let signalStatus = peak <= thresholds.nearSilenceDbfs
            ? "near-digital-silence"
            : !observations.isEmpty
                ? "attention"
                : "signal-present"
        return LocalRecordingAudioSignalProfile(
            schemaVersion: 1,
            algorithm: "quipsly-audio-signal-window-v1",
            sampleRate: sampleRate,
            channelCount: channelCount,
            analyzedFrameCount: decodedFrames,
            durationSeconds: roundedSignal(durationSeconds),
            windowDurationSeconds: roundedSignal(windowDuration),
            rmsDbfs: rms,
            samplePeakDbfs: peak,
            clippedFrameCount: clippedFrames,
            clippedFrameFraction: roundedSignal(Double(clippedFrames) / Double(decodedFrames)),
            nearSilentFrameFraction: roundedSignal(Double(nearSilentFrames) / Double(decodedFrames)),
            leftRmsDbfs: leftRms,
            rightRmsDbfs: rightRms,
            stereoBalanceDb: balance.map(roundedSignal),
            signalStatus: signalStatus,
            thresholds: thresholds,
            waveform: windows,
            observations: observations,
            loudness: loudnessAnalyzer?.result()
        )
    }

    nonisolated private static func signalObservations(
        windows: [LocalRecordingAudioSignalWindow],
        durationSeconds: Double,
        signalPeakDbfs: Double,
        stereoBalanceDb: Double?,
        thresholds: LocalRecordingAudioSignalThresholds
    ) -> [LocalRecordingAudioSignalObservation] {
        var observations: [LocalRecordingAudioSignalObservation] = []
        if signalPeakDbfs <= thresholds.nearSilenceDbfs {
            observations.append(
                LocalRecordingAudioSignalObservation(
                    kind: "near-digital-silence",
                    severity: "warning",
                    startSeconds: 0,
                    endSeconds: roundedSignal(durationSeconds),
                    detail: "The decoded source peak stayed at or below the recorded near-silence threshold. Listen before relying on this take."
                )
            )
        }
        if let balance = stereoBalanceDb,
           abs(balance) >= thresholds.stereoImbalanceDb {
            observations.append(
                LocalRecordingAudioSignalObservation(
                    kind: "stereo-imbalance",
                    severity: "attention",
                    startSeconds: 0,
                    endSeconds: roundedSignal(durationSeconds),
                    detail: "The decoded left/right RMS balance differs by \(String(format: "%.1f", abs(balance))) dB."
                )
            )
        }

        appendWindowRanges(
            windows: windows,
            where: { $0.clippedFrameCount > 0 },
            minimumDuration: 0,
            make: { start, end, range in
                let count = range.reduce(Int64(0)) { $0 + $1.clippedFrameCount }
                return LocalRecordingAudioSignalObservation(
                    kind: "sample-clipping",
                    severity: "warning",
                    startSeconds: start,
                    endSeconds: end,
                    detail: "\(count) decoded frame\(count == 1 ? "" : "s") reached the clipping observation threshold."
                )
            },
            into: &observations
        )

        var index = 0
        while index < windows.count {
            guard windows[index].rmsDbfs <= thresholds.nearSilenceDbfs else {
                index += 1
                continue
            }
            let startIndex = index
            while index + 1 < windows.count,
                  windows[index + 1].rmsDbfs <= thresholds.nearSilenceDbfs {
                index += 1
            }
            let endIndex = index
            let start = windows[startIndex].startSeconds
            let end = windows[endIndex].startSeconds + windows[endIndex].durationSeconds
            let previousHasSignal = startIndex > 0
                && windows[startIndex - 1].rmsDbfs >= thresholds.surroundingSignalDbfs
            let nextHasSignal = endIndex + 1 < windows.count
                && windows[endIndex + 1].rmsDbfs >= thresholds.surroundingSignalDbfs
            if end - start >= thresholds.possibleDropoutMinimumSeconds,
               previousHasSignal,
               nextHasSignal {
                observations.append(
                    LocalRecordingAudioSignalObservation(
                        kind: "possible-dropout",
                        severity: "attention",
                        startSeconds: roundedSignal(start),
                        endSeconds: roundedSignal(end),
                        detail: "A near-silent interval is surrounded by measurable signal. It may be intentional silence; listen before classifying it as a dropout."
                    )
                )
            }
            index += 1
        }
        return observations.sorted {
            $0.startSeconds == $1.startSeconds
                ? $0.kind < $1.kind
                : $0.startSeconds < $1.startSeconds
        }
    }

    nonisolated private static func appendWindowRanges(
        windows: [LocalRecordingAudioSignalWindow],
        where predicate: (LocalRecordingAudioSignalWindow) -> Bool,
        minimumDuration: Double,
        make: (Double, Double, ArraySlice<LocalRecordingAudioSignalWindow>) -> LocalRecordingAudioSignalObservation,
        into observations: inout [LocalRecordingAudioSignalObservation]
    ) {
        var index = 0
        while index < windows.count {
            guard predicate(windows[index]) else {
                index += 1
                continue
            }
            let startIndex = index
            while index + 1 < windows.count, predicate(windows[index + 1]) {
                index += 1
            }
            let endIndex = index
            let start = windows[startIndex].startSeconds
            let end = windows[endIndex].startSeconds + windows[endIndex].durationSeconds
            if end - start >= minimumDuration {
                observations.append(
                    make(
                        roundedSignal(start),
                        roundedSignal(end),
                        windows[startIndex...endIndex]
                    )
                )
            }
            index += 1
        }
    }

    nonisolated private static func amplitudeDbfs(_ amplitude: Double) -> Double {
        guard amplitude.isFinite, amplitude > 0 else { return -160 }
        return roundedSignal(max(20 * log10(amplitude), -160))
    }

    nonisolated private static func roundedSignal(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return (value * 10_000).rounded() / 10_000
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
        let visibleRecordings: [LocalRecording]
        if let activeOwnerAccountID = normalizedOwnerID(activeOwnerAccountID) {
            visibleRecordings = storedRecordings.filter {
                normalizedOwnerID($0.ownerAccountID) == activeOwnerAccountID
            }
        } else {
            visibleRecordings = []
        }
        // The current and most-recent rows are derived from this ordered array.
        // Publish the account-scoped Library as one atomic consistency unit so
        // SwiftUI never observes three successively different projections of
        // the same durable ledger commit.
        if recordings != visibleRecordings {
            recordings = visibleRecordings
        }
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

    private func normalizedSHA256(_ value: String?) -> String? {
        guard let normalized = nonempty(value)?.lowercased(),
              normalized.range(
                of: #"^[a-f0-9]{64}$"#,
                options: .regularExpression
              ) != nil else {
            return nil
        }
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
        case roomStopReceiptConflict
        case clockEvidenceConflict
        case invalidRuntimeSmokeFixture
        case runtimeSmokeFixtureOwnerMismatch
        case runtimeSmokeFixtureSourceRejected
        case runtimeSmokeFixtureChecksumMismatch
        case runtimeSmokeFixtureNotPlayable

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
            case .roomStopReceiptConflict:
                return "Quipsly already preserved a different STOP receipt for this immutable source."
            case .clockEvidenceConflict:
                return "Capture-clock evidence did not match this protected source, Session, take, or monotonic boundary."
            case .invalidRuntimeSmokeFixture:
                return "The operated playback fixture is incomplete, outside the temporary test bridge, or belongs to another account."
            case .runtimeSmokeFixtureOwnerMismatch:
                return "The operated playback fixture owner does not match the active protected account partition."
            case .runtimeSmokeFixtureSourceRejected:
                return "The operated playback fixture source is outside the protected XCTest host bridge."
            case .runtimeSmokeFixtureChecksumMismatch:
                return "The operated playback fixture does not match its expected SHA-256."
            case .runtimeSmokeFixtureNotPlayable:
                return "The operated playback fixture could not be decoded as a complete audio source."
            }
        }
    }
}
