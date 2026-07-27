import CryptoKit
import Foundation

#if os(macOS)
public struct MacCaptureUploadJob:
    Codable,
    Equatable,
    Identifiable,
    Sendable
{
    public enum Phase: String, Codable, Sendable {
        case prepared
        case creating
        case uploading
        case finalizing
        case verifying
        case verified
        case held
    }

    public let protocolVersion: Int
    public let id: UUID
    public let ownerAccountID: String
    public let captureID: UUID
    public let captureGroupID: UUID
    public let filePath: String
    public let sourceReceiptPath: String
    public let fileName: String
    public let contentType: String
    public let sourceType: String
    public let expectedSizeBytes: Int64
    public let expectedSHA256: String
    public let projectSlug: String?
    public let episodeSlug: String?
    public let trackID: String
    public let callRoomID: String
    public let participantID: String
    public let recordingConsentID: String
    public let startReceiptID: UUID?
    public let capturePurpose: String?
    public let sourceProfileJSON: String
    public let startedAt: Date
    public let stoppedAt: Date
    public let createdAt: Date
    public var updatedAt: Date
    public var phase: Phase
    public var attemptCount: Int
    public var lastAttemptAt: Date?
    public var restartUploadSession: Bool
    public var objectPath: String?
    public var processingDisposition: String?
    public var holdReason: String?
    public var serverSourceID: String?
    public var serverMediaAssetID: String?
    public var serverRecordingAssetID: String?
    public var serverTranscriptJobID: String?
    public var lastError: String?

    public init(
        id: UUID,
        ownerAccountID: String,
        captureID: UUID,
        captureGroupID: UUID,
        filePath: String,
        sourceReceiptPath: String,
        fileName: String,
        contentType: String,
        sourceType: String,
        expectedSizeBytes: Int64,
        expectedSHA256: String,
        projectSlug: String?,
        episodeSlug: String?,
        trackID: String,
        callRoomID: String,
        participantID: String,
        recordingConsentID: String,
        startReceiptID: UUID? = nil,
        capturePurpose: String?,
        sourceProfileJSON: String,
        startedAt: Date,
        stoppedAt: Date,
        createdAt: Date = Date(),
        updatedAt: Date = Date(),
        phase: Phase = .prepared,
        attemptCount: Int = 0,
        lastAttemptAt: Date? = nil,
        restartUploadSession: Bool = false,
        objectPath: String? = nil,
        processingDisposition: String? = nil,
        holdReason: String? = nil,
        serverSourceID: String? = nil,
        serverMediaAssetID: String? = nil,
        serverRecordingAssetID: String? = nil,
        serverTranscriptJobID: String? = nil,
        lastError: String? = nil
    ) {
        self.protocolVersion = 2
        self.id = id
        self.ownerAccountID = ownerAccountID
        self.captureID = captureID
        self.captureGroupID = captureGroupID
        self.filePath = filePath
        self.sourceReceiptPath = sourceReceiptPath
        self.fileName = fileName
        self.contentType = contentType
        self.sourceType = sourceType
        self.expectedSizeBytes = expectedSizeBytes
        self.expectedSHA256 = expectedSHA256
        self.projectSlug = projectSlug
        self.episodeSlug = episodeSlug
        self.trackID = trackID
        self.callRoomID = callRoomID
        self.participantID = participantID
        self.recordingConsentID = recordingConsentID
        self.startReceiptID = startReceiptID
        self.capturePurpose = capturePurpose
        self.sourceProfileJSON = sourceProfileJSON
        self.startedAt = startedAt
        self.stoppedAt = stoppedAt
        self.createdAt = createdAt
        self.updatedAt = updatedAt
        self.phase = phase
        self.attemptCount = attemptCount
        self.lastAttemptAt = lastAttemptAt
        self.restartUploadSession = restartUploadSession
        self.objectPath = objectPath
        self.processingDisposition = processingDisposition
        self.holdReason = holdReason
        self.serverSourceID = serverSourceID
        self.serverMediaAssetID = serverMediaAssetID
        self.serverRecordingAssetID = serverRecordingAssetID
        self.serverTranscriptJobID = serverTranscriptJobID
        self.lastError = lastError
    }

    public var localFileURL: URL {
        URL(fileURLWithPath: filePath)
    }

    public var isRetryable: Bool {
        phase != .verified
    }

    public var userFacingVerificationSummary: String {
        let disposition =
            processingDisposition?.uppercased()
                ?? "VERIFIED"
        if disposition == "HELD" {
            return "Original source is byte-verified in Quipsly and preserved on this Mac. Processing is held: \(holdReason ?? "review consent and readiness evidence in Nest")."
        }
        return "Original source is byte-verified in Quipsly and linked to its Episode Room. The local master remains preserved."
    }
}

public enum MacCaptureUploadJobStoreError:
    LocalizedError,
    Equatable
{
    case uploadIdentityIncomplete
    case sourceIsNotFinalized
    case roomAuthorityMissing
    case sourceFileMissing
    case sourceFileSizeChanged
    case sourceDigestMissing
    case sourceReceiptMissing
    case sourceReceiptMismatch
    case sourceOwnerMismatch
    case immutableBindingChanged
    case ledgerQuarantined

    public var errorDescription: String? {
        switch self {
        case .uploadIdentityIncomplete:
            "The finalized source is missing its verified owner, room, participant, consent, or time boundary."
        case .sourceIsNotFinalized:
            "Only a finalized local master can enter the canonical upload outbox."
        case .roomAuthorityMissing:
            "This finalized source has no immutable Episode Room authority from its own take, so Quipsly will keep it local instead of inferring consent or room ownership later."
        case .sourceFileMissing:
            "The finalized local source file is no longer present."
        case .sourceFileSizeChanged:
            "The local source size no longer matches its finalized receipt."
        case .sourceDigestMissing:
            "The finalized source receipt does not contain a valid SHA-256 digest."
        case .sourceReceiptMissing:
            "The finalized source has no durable local receipt. Its upload was not armed."
        case .sourceReceiptMismatch:
            "The durable local receipt no longer matches the finalized source and Episode Room binding."
        case .sourceOwnerMismatch:
            "The finalized source belongs to a different verified Quipsly account. Switch back to that account before arming its upload."
        case .immutableBindingChanged:
            "The upload job's immutable source or Episode Room binding changed after it was created."
        case .ledgerQuarantined:
            "The upload outbox is quarantined read-only. Existing job and source bytes were preserved."
        }
    }
}

@MainActor
public final class MacCaptureUploadJobStore {
    public private(set) var jobs: [MacCaptureUploadJob] = []
    public private(set) var persistenceError: String?
    public private(set) var quarantinedLedgerURL: URL?
    public private(set) var isWritable = true

    public let directoryURL: URL
    public let ledgerURL: URL
    public let lastKnownGoodLedgerURL: URL

    private let fileManager: FileManager

    public init(
        fileManager: FileManager = .default,
        rootDirectory: URL? = nil
    ) {
        self.fileManager = fileManager
        let applicationSupport =
            rootDirectory
                ?? fileManager.urls(
                    for: .applicationSupportDirectory,
                    in: .userDomainMask
                ).first
                ?? URL(fileURLWithPath: NSHomeDirectory())
                    .appendingPathComponent(
                        "Library/Application Support",
                        isDirectory: true
                    )
        directoryURL = applicationSupport
            .appendingPathComponent(
                "QuipslyStudio/CaptureUploads",
                isDirectory: true
            )
        ledgerURL = directoryURL.appendingPathComponent(
            "canonical-upload-outbox.json"
        )
        lastKnownGoodLedgerURL = directoryURL.appendingPathComponent(
            "canonical-upload-outbox.last-known-good.json"
        )
        do {
            try fileManager.createDirectory(
                at: directoryURL,
                withIntermediateDirectories: true
            )
            jobs = try loadLedgerFailingClosed()
            sortJobs()
        } catch {
            isWritable = false
            persistenceError =
                "The canonical upload outbox could not be opened: \(error.localizedDescription)"
        }
    }

    public func jobs(
        ownerAccountID: String
    ) -> [MacCaptureUploadJob] {
        let owner = ownerAccountID.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).lowercased()
        return jobs.filter { $0.ownerAccountID == owner }
    }

    public func job(
        id: UUID,
        ownerAccountID: String
    ) -> MacCaptureUploadJob? {
        jobs(ownerAccountID: ownerAccountID).first {
            $0.id == id
        }
    }

    @discardableResult
    public func enqueueFinalizedAudio(
        receipt: ProductionAudioRecordingReceipt,
        ownerAccountID: String
    ) throws -> MacCaptureUploadJob {
        guard receipt.state == .finalized,
              let stoppedAt = receipt.stoppedAt else {
            throw MacCaptureUploadJobStoreError
                .sourceIsNotFinalized
        }
        let profile = MacAudioUploadSourceProfile(
            schemaVersion: 1,
            inputDevice: receipt.inputDevice,
            sampleRate: receipt.targetSampleRate,
            bitDepth: receipt.targetBitDepth,
            channelCount: receipt.channelCount,
            clientKind: receipt.clientKind,
            sourceKind: receipt.sourceKind,
            monotonicStartedNanoseconds:
                String(receipt.startedMonotonicNanoseconds),
            monotonicStoppedNanoseconds:
                receipt.stoppedMonotonicNanoseconds.map(String.init),
            clockSamples: receipt.clockSamples
        )
        let profileData = try Self.encoder.encode(profile)
        guard let profileJSON = String(
            data: profileData,
            encoding: .utf8
        ) else {
            throw MacCaptureUploadJobStoreError
                .uploadIdentityIncomplete
        }
        let sourceReceiptPath = URL(
            fileURLWithPath: receipt.recordingDirectoryPath
        )
        .appendingPathComponent(
            ProductionAudioRecorder.receiptFilename
        )
        .path
        try validateDurableAudioReceipt(
            receipt,
            at: sourceReceiptPath
        )
        return try enqueueFinalizedSource(
            id: receipt.recordingID,
            captureGroupID: receipt.captureGroupID,
            fileURL: URL(fileURLWithPath: receipt.audioPath),
            sourceReceiptPath: sourceReceiptPath,
            contentType: "audio/wav",
            sourceType: "audio",
            byteCount: receipt.byteCount,
            sha256: receipt.sha256,
            projectSlug: receipt.projectSlug,
            episodeSlug: receipt.episodeSlug
                ?? receipt.episodeSpaceID,
            trackID:
                "\(safeToken(receipt.participantID))-microphone-master",
            callRoomID: receipt.callRoomID,
            participantID: receipt.participantID,
            recordingConsentID: receipt.recordingConsentID,
            startReceiptID: receipt.startReceiptID,
            capturePurpose: receipt.capturePurpose,
            sourceProfileJSON: profileJSON,
            startedAt: receipt.startedAt,
            stoppedAt: stoppedAt,
            expectedOwnerAccountID:
                receipt.ownerAccountID,
            ownerAccountID: ownerAccountID
        )
    }

    @discardableResult
    public func enqueueFinalizedVideoReference(
        receipt: ProductionVideoReferenceReceipt,
        ownerAccountID: String
    ) throws -> MacCaptureUploadJob {
        guard receipt.state == .finalized,
              let stoppedAt = receipt.stoppedAt else {
            throw MacCaptureUploadJobStoreError
                .sourceIsNotFinalized
        }
        guard let recordedFormat = receipt.recordedFormat else {
            throw MacCaptureUploadJobStoreError
                .uploadIdentityIncomplete
        }
        let profile = MacVideoReferenceUploadSourceProfile(
            schemaVersion: 2,
            container: "mov",
            codec: recordedFormat.codec,
            width: recordedFormat.width,
            height: recordedFormat.height,
            nominalFrameRate:
                recordedFormat.nominalFrameRate,
            colorSpace: nil,
            orientation: nil,
            cameraPosition: nil,
            cameraDeviceUniqueID: receipt.videoDevice.id,
            includesAudio: receipt.containsAudio,
            audioSampleRate: nil,
            audioChannelCount: nil,
            monotonicStartedNanoseconds:
                String(receipt.startedMonotonicNanoseconds),
            monotonicStoppedNanoseconds:
                receipt.stoppedMonotonicNanoseconds.map(String.init),
            clockSamples: receipt.clockSamples,
            cameraDevice: receipt.videoDevice,
            negotiatedInputFormat:
                receipt.negotiatedFormat,
            referenceKind: receipt.sourceKind
        )
        let profileData = try Self.encoder.encode(profile)
        guard let profileJSON = String(
            data: profileData,
            encoding: .utf8
        ) else {
            throw MacCaptureUploadJobStoreError
                .uploadIdentityIncomplete
        }
        let sourceReceiptPath = URL(
            fileURLWithPath: receipt.recordingDirectoryPath
        )
        .appendingPathComponent(
            ProductionVideoReferenceRecorder.receiptFilename
        )
        .path
        try validateDurableVideoReceipt(
            receipt,
            at: sourceReceiptPath
        )
        return try enqueueFinalizedSource(
            id: receipt.recordingID,
            captureGroupID: receipt.captureGroupID,
            fileURL: URL(fileURLWithPath: receipt.videoPath),
            sourceReceiptPath: sourceReceiptPath,
            contentType: "video/quicktime",
            sourceType: "video",
            byteCount: receipt.byteCount,
            sha256: receipt.sha256,
            projectSlug: receipt.projectSlug,
            episodeSlug: receipt.episodeSlug
                ?? receipt.episodeSpaceID,
            trackID:
                "\(safeToken(receipt.participantID))-camera-reference",
            callRoomID: receipt.callRoomID,
            participantID: receipt.participantID,
            recordingConsentID: receipt.recordingConsentID,
            startReceiptID: receipt.startReceiptID,
            capturePurpose: receipt.capturePurpose,
            sourceProfileJSON: profileJSON,
            startedAt: receipt.startedAt,
            stoppedAt: stoppedAt,
            expectedOwnerAccountID:
                receipt.ownerAccountID,
            ownerAccountID: ownerAccountID
        )
    }

    @discardableResult
    public func enqueueFinalizedCanonCardOriginal(
        receipt: CanonCardImportReceipt,
        ownerAccountID: String
    ) throws -> MacCaptureUploadJob {
        guard receipt.state == .finalized,
              receipt.byteIdentityVerified,
              let stoppedAt = receipt.stoppedAt,
              let byteCount = receipt.managedOriginalByteCount,
              let sha256 = receipt.managedOriginalSHA256 else {
            throw MacCaptureUploadJobStoreError
                .sourceIsNotFinalized
        }
        guard let binding = receipt.roomBinding else {
            throw MacCaptureUploadJobStoreError
                .roomAuthorityMissing
        }
        guard receipt.sourceByteCount == byteCount,
              receipt.sourceSHA256?.lowercased()
                == sha256.lowercased(),
              binding.matchesSource(
                  captureGroupID: receipt.captureGroupID,
                  episodeSpaceID: receipt.episodeSpaceID,
                  participantID: receipt.participantID
              ) else {
            throw MacCaptureUploadJobStoreError
                .sourceReceiptMismatch
        }
        let managedOriginal = URL(
            fileURLWithPath: receipt.managedOriginalPath
        )
        let contentType = try canonVideoContentType(
            for: managedOriginal
        )
        let recordedAtCandidate =
            receipt.sourceCreatedAt ?? receipt.startedAt
        let recordedStopCandidate = recordedAtCandidate
            .addingTimeInterval(
                max(0, receipt.technicalProbe.durationSeconds)
            )
        let profile = MacCanonCardUploadSourceProfile(
            schemaVersion: 1,
            sourceKind: receipt.sourceKind,
            container:
                managedOriginal.pathExtension.lowercased(),
            codec: receipt.technicalProbe.videoCodec,
            width: receipt.technicalProbe.width,
            height: receipt.technicalProbe.height,
            nominalFrameRate:
                receipt.technicalProbe.nominalFrameRate,
            includesAudio:
                receipt.technicalProbe.audioTrackCount > 0,
            audioSampleRate:
                receipt.technicalProbe.audioSampleRate,
            audioChannelCount:
                receipt.technicalProbe.audioChannelCount,
            videoTrackCount:
                receipt.technicalProbe.videoTrackCount,
            audioTrackCount:
                receipt.technicalProbe.audioTrackCount,
            timecodeTrackCount:
                receipt.technicalProbe.timecodeTrackCount,
            declaredCameraModel:
                receipt.declaredCameraModel,
            cardByteIdentityVerified:
                receipt.byteIdentityVerified,
            captureTimingEvidence:
                receipt.sourceCreatedAt == nil
                    ? "import-time-fallback-unreviewed"
                    : "card-file-creation-date-unreviewed",
            recordedAtCandidate:
                recordedAtCandidate,
            sourceCreatedAt: receipt.sourceCreatedAt,
            sourceModifiedAt: receipt.sourceModifiedAt,
            importStartedAt: receipt.startedAt,
            importStoppedAt: stoppedAt,
            monotonicStartedNanoseconds: nil,
            monotonicStoppedNanoseconds: nil,
            clockSamples: nil
        )
        let profileData = try Self.encoder.encode(profile)
        guard let profileJSON = String(
            data: profileData,
            encoding: .utf8
        ) else {
            throw MacCaptureUploadJobStoreError
                .uploadIdentityIncomplete
        }
        try validateDurableCanonReceipt(
            receipt,
            at: receipt.receiptPath
        )
        return try enqueueFinalizedSource(
            id: receipt.importID,
            captureGroupID: receipt.captureGroupID,
            fileURL: managedOriginal,
            sourceReceiptPath: receipt.receiptPath,
            contentType: contentType,
            sourceType: "video",
            byteCount: byteCount,
            sha256: sha256,
            projectSlug: binding.projectSlug,
            episodeSlug:
                binding.episodeSlug
                    ?? binding.episodeSpaceID,
            trackID:
                "\(safeToken(receipt.participantID))-camera-card-master",
            callRoomID: binding.callRoomID,
            participantID: binding.participantID,
            recordingConsentID:
                binding.recordingConsentID,
            startReceiptID: binding.startReceiptID,
            capturePurpose: binding.capturePurpose,
            sourceProfileJSON: profileJSON,
            startedAt: recordedAtCandidate,
            stoppedAt: max(
                recordedStopCandidate,
                recordedAtCandidate
            ),
            expectedOwnerAccountID:
                binding.ownerAccountID,
            ownerAccountID: ownerAccountID
        )
    }

    public func save(_ job: MacCaptureUploadJob) throws {
        guard let index = jobs.firstIndex(where: {
            $0.id == job.id
        }) else {
            try commit(jobs + [job])
            return
        }
        guard immutableBindingMatches(jobs[index], job) else {
            throw MacCaptureUploadJobStoreError
                .immutableBindingChanged
        }
        var updated = jobs
        updated[index] = job
        try commit(updated)
    }

    nonisolated public static func exactSourceEvidence(
        for job: MacCaptureUploadJob
    ) throws -> (sizeBytes: Int64, sha256: String) {
        let handle = try FileHandle(
            forReadingFrom: job.localFileURL
        )
        defer { try? handle.close() }
        var hasher = SHA256()
        var sizeBytes: Int64 = 0
        while true {
            let data =
                try handle.read(
                    upToCount: 4 * 1_024 * 1_024
                ) ?? Data()
            if data.isEmpty { break }
            sizeBytes += Int64(data.count)
            hasher.update(data: data)
        }
        let sha256 = hasher.finalize()
            .map { String(format: "%02x", $0) }
            .joined()
        return (sizeBytes, sha256)
    }

    private func commit(_ updated: [MacCaptureUploadJob]) throws {
        guard isWritable else {
            throw MacCaptureUploadJobStoreError.ledgerQuarantined
        }
        let data = try Self.encoder.encode(updated)
        do {
            for job in updated {
                let jobData = try Self.encoder.encode(job)
                try jobData.write(
                    to: sidecarURL(job.id),
                    options: .atomic
                )
            }
            try data.write(
                to: lastKnownGoodLedgerURL,
                options: .atomic
            )
            try data.write(to: ledgerURL, options: .atomic)
            jobs = updated
            sortJobs()
            pruneSidecars(retaining: Set(updated.map(\.id)))
            persistenceError = nil
        } catch {
            isWritable = false
            persistenceError =
                "The canonical upload outbox could not be saved and is locked for this process: \(error.localizedDescription)"
            throw error
        }
    }

    private func loadLedgerFailingClosed() throws
        -> [MacCaptureUploadJob]
    {
        guard fileManager.fileExists(atPath: ledgerURL.path) else {
            if let lastKnownGood = try? decodeLedger(
                at: lastKnownGoodLedgerURL
            ) {
                return lastKnownGood
            }
            return loadSidecars()
        }
        do {
            return try decodeLedger(at: ledgerURL)
        } catch {
            isWritable = false
            let timestamp = ISO8601DateFormatter()
                .string(from: Date())
                .replacingOccurrences(of: ":", with: "-")
            let quarantine = directoryURL.appendingPathComponent(
                "canonical-upload-outbox-unreadable-\(timestamp)-\(UUID().uuidString.lowercased()).json"
            )
            do {
                try fileManager.copyItem(
                    at: ledgerURL,
                    to: quarantine
                )
                quarantinedLedgerURL = quarantine
            } catch {
                quarantinedLedgerURL = ledgerURL
            }
            persistenceError =
                "The canonical upload outbox is unreadable and locked read-only. Existing job and source bytes were preserved."
            if let lastKnownGood = try? decodeLedger(
                at: lastKnownGoodLedgerURL
            ) {
                return lastKnownGood
            }
            return loadSidecars()
        }
    }

    private func decodeLedger(
        at url: URL
    ) throws -> [MacCaptureUploadJob] {
        try Self.decoder.decode(
            [MacCaptureUploadJob].self,
            from: Data(contentsOf: url)
        )
    }

    private func loadSidecars() -> [MacCaptureUploadJob] {
        let urls = (
            try? fileManager.contentsOfDirectory(
                at: directoryURL,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )
        ) ?? []
        var byID: [UUID: MacCaptureUploadJob] = [:]
        for url in urls where url.lastPathComponent.hasSuffix(
            ".quipsly-upload-job.json"
        ) {
            guard let data = try? Data(contentsOf: url),
                  let job = try? Self.decoder.decode(
                    MacCaptureUploadJob.self,
                    from: data
                  ) else {
                continue
            }
            byID[job.id] = job
        }
        return Array(byID.values)
    }

    private func sidecarURL(_ jobID: UUID) -> URL {
        directoryURL.appendingPathComponent(
            "upload-\(jobID.uuidString.lowercased()).quipsly-upload-job.json"
        )
    }

    private func pruneSidecars(retaining IDs: Set<UUID>) {
        let urls = (
            try? fileManager.contentsOfDirectory(
                at: directoryURL,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            )
        ) ?? []
        for url in urls where url.lastPathComponent.hasSuffix(
            ".quipsly-upload-job.json"
        ) {
            guard let data = try? Data(contentsOf: url),
                  let job = try? Self.decoder.decode(
                    MacCaptureUploadJob.self,
                    from: data
                  ),
                  !IDs.contains(job.id) else {
                continue
            }
            try? fileManager.removeItem(at: url)
        }
    }

    private func immutableBindingMatches(
        _ lhs: MacCaptureUploadJob,
        _ rhs: MacCaptureUploadJob
    ) -> Bool {
        sourceBindingMatches(lhs, rhs)
            && lhs.createdAt == rhs.createdAt
    }

    private func sourceBindingMatches(
        _ lhs: MacCaptureUploadJob,
        _ rhs: MacCaptureUploadJob
    ) -> Bool {
        lhs.id == rhs.id
            && lhs.ownerAccountID == rhs.ownerAccountID
            && lhs.captureID == rhs.captureID
            && lhs.captureGroupID == rhs.captureGroupID
            && lhs.filePath == rhs.filePath
            && lhs.sourceReceiptPath == rhs.sourceReceiptPath
            && lhs.fileName == rhs.fileName
            && lhs.contentType == rhs.contentType
            && lhs.sourceType == rhs.sourceType
            && lhs.expectedSizeBytes == rhs.expectedSizeBytes
            && lhs.expectedSHA256 == rhs.expectedSHA256
            && lhs.projectSlug == rhs.projectSlug
            && lhs.episodeSlug == rhs.episodeSlug
            && lhs.trackID == rhs.trackID
            && lhs.callRoomID == rhs.callRoomID
            && lhs.participantID == rhs.participantID
            && lhs.recordingConsentID == rhs.recordingConsentID
            && lhs.startReceiptID == rhs.startReceiptID
            && lhs.capturePurpose == rhs.capturePurpose
            && lhs.sourceProfileJSON == rhs.sourceProfileJSON
            && lhs.startedAt == rhs.startedAt
            && lhs.stoppedAt == rhs.stoppedAt
    }

    private func enqueueFinalizedSource(
        id: UUID,
        captureGroupID: UUID,
        fileURL: URL,
        sourceReceiptPath: String,
        contentType: String,
        sourceType: String,
        byteCount: Int64?,
        sha256: String?,
        projectSlug: String?,
        episodeSlug: String?,
        trackID: String,
        callRoomID: String?,
        participantID: String,
        recordingConsentID: String?,
        startReceiptID: UUID?,
        capturePurpose: String?,
        sourceProfileJSON: String,
        startedAt: Date,
        stoppedAt: Date,
        expectedOwnerAccountID: String?,
        ownerAccountID: String
    ) throws -> MacCaptureUploadJob {
        let owner = ownerAccountID.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).lowercased()
        let cleanParticipant = participantID.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        let expectedOwner = expectedOwnerAccountID?
            .trimmingCharacters(
                in: .whitespacesAndNewlines
            )
            .lowercased()
        guard expectedOwner == owner else {
            throw MacCaptureUploadJobStoreError
                .sourceOwnerMismatch
        }
        guard !owner.isEmpty,
              let callRoomID = nonempty(callRoomID),
              let recordingConsentID = nonempty(
                recordingConsentID
              ),
              startReceiptID != nil,
              !cleanParticipant.isEmpty else {
            throw MacCaptureUploadJobStoreError
                .uploadIdentityIncomplete
        }
        guard fileManager.fileExists(atPath: fileURL.path) else {
            throw MacCaptureUploadJobStoreError.sourceFileMissing
        }
        guard let byteCount, byteCount > 0,
              (
                try fileURL.resourceValues(
                    forKeys: [.fileSizeKey]
                ).fileSize
              ).map(Int64.init) == byteCount else {
            throw MacCaptureUploadJobStoreError
                .sourceFileSizeChanged
        }
        guard let sha256 = sha256?.lowercased(),
              sha256.range(
                of: "^[0-9a-f]{64}$",
                options: .regularExpression
              ) != nil else {
            throw MacCaptureUploadJobStoreError
                .sourceDigestMissing
        }
        let created = MacCaptureUploadJob(
            id: id,
            ownerAccountID: owner,
            captureID: captureGroupID,
            captureGroupID: captureGroupID,
            filePath: fileURL.path,
            sourceReceiptPath: sourceReceiptPath,
            fileName: fileURL.lastPathComponent,
            contentType: contentType,
            sourceType: sourceType,
            expectedSizeBytes: byteCount,
            expectedSHA256: sha256,
            projectSlug: nonempty(projectSlug),
            episodeSlug: nonempty(episodeSlug),
            trackID: trackID,
            callRoomID: callRoomID,
            participantID: cleanParticipant,
            recordingConsentID: recordingConsentID,
            startReceiptID: startReceiptID,
            capturePurpose: nonempty(capturePurpose),
            sourceProfileJSON: sourceProfileJSON,
            startedAt: startedAt,
            stoppedAt: stoppedAt
        )
        if let existing = job(
            id: id,
            ownerAccountID: owner
        ) {
            guard sourceBindingMatches(existing, created) else {
                throw MacCaptureUploadJobStoreError
                    .immutableBindingChanged
            }
            return existing
        }
        try commit(jobs + [created])
        return created
    }

    private func nonempty(_ value: String?) -> String? {
        let clean = value?.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return clean?.isEmpty == false ? clean : nil
    }

    private func validateDurableAudioReceipt(
        _ receipt: ProductionAudioRecordingReceipt,
        at path: String
    ) throws {
        let url = URL(fileURLWithPath: path)
        guard fileManager.fileExists(atPath: path) else {
            throw MacCaptureUploadJobStoreError
                .sourceReceiptMissing
        }
        guard let persisted = try? Self.decoder.decode(
            ProductionAudioRecordingReceipt.self,
            from: Data(contentsOf: url)
        ),
        persisted.state == .finalized,
        persisted.recordingID == receipt.recordingID,
        persisted.captureGroupID == receipt.captureGroupID,
        persisted.episodeSpaceID == receipt.episodeSpaceID,
        persisted.participantID == receipt.participantID,
        normalizedOwner(persisted.ownerAccountID)
            == normalizedOwner(receipt.ownerAccountID),
        persisted.callRoomID == receipt.callRoomID,
        persisted.recordingConsentID
            == receipt.recordingConsentID,
        persisted.startReceiptID == receipt.startReceiptID,
        persisted.projectSlug == receipt.projectSlug,
        persisted.episodeSlug == receipt.episodeSlug,
        persisted.capturePurpose == receipt.capturePurpose,
        persisted.clockSamples == receipt.clockSamples,
        persisted.inputDevice == receipt.inputDevice,
        persisted.channelCount == receipt.channelCount,
        persisted.startedMonotonicNanoseconds
            == receipt.startedMonotonicNanoseconds,
        persisted.stoppedMonotonicNanoseconds
            == receipt.stoppedMonotonicNanoseconds,
        persisted.frameCount == receipt.frameCount,
        persisted.audioPath == receipt.audioPath,
        persisted.partialAudioPath == nil,
        persisted.byteCount == receipt.byteCount,
        persisted.sha256?.lowercased()
            == receipt.sha256?.lowercased(),
        persisted.failure == nil,
        datesMatch(persisted.startedAt, receipt.startedAt),
        datesMatch(persisted.stoppedAt, receipt.stoppedAt)
        else {
            throw MacCaptureUploadJobStoreError
                .sourceReceiptMismatch
        }
    }

    private func validateDurableVideoReceipt(
        _ receipt: ProductionVideoReferenceReceipt,
        at path: String
    ) throws {
        let url = URL(fileURLWithPath: path)
        guard fileManager.fileExists(atPath: path) else {
            throw MacCaptureUploadJobStoreError
                .sourceReceiptMissing
        }
        guard let persisted = try? Self.decoder.decode(
            ProductionVideoReferenceReceipt.self,
            from: Data(contentsOf: url)
        ),
        persisted.state == .finalized,
        persisted.recordingID == receipt.recordingID,
        persisted.captureGroupID == receipt.captureGroupID,
        persisted.episodeSpaceID == receipt.episodeSpaceID,
        persisted.participantID == receipt.participantID,
        normalizedOwner(persisted.ownerAccountID)
            == normalizedOwner(receipt.ownerAccountID),
        persisted.callRoomID == receipt.callRoomID,
        persisted.recordingConsentID
            == receipt.recordingConsentID,
        persisted.startReceiptID == receipt.startReceiptID,
        persisted.projectSlug == receipt.projectSlug,
        persisted.episodeSlug == receipt.episodeSlug,
        persisted.capturePurpose == receipt.capturePurpose,
        persisted.clockSamples == receipt.clockSamples,
        persisted.videoDevice == receipt.videoDevice,
        persisted.negotiatedFormat
            == receipt.negotiatedFormat,
        persisted.recordedFormat
            == receipt.recordedFormat,
        persisted.startedMonotonicNanoseconds
            == receipt.startedMonotonicNanoseconds,
        persisted.stoppedMonotonicNanoseconds
            == receipt.stoppedMonotonicNanoseconds,
        persisted.videoPath == receipt.videoPath,
        persisted.partialVideoPath == nil,
        persisted.byteCount == receipt.byteCount,
        persisted.sha256?.lowercased()
            == receipt.sha256?.lowercased(),
        persisted.failure == nil,
        datesMatch(persisted.startedAt, receipt.startedAt),
        datesMatch(persisted.stoppedAt, receipt.stoppedAt)
        else {
            throw MacCaptureUploadJobStoreError
                .sourceReceiptMismatch
        }
    }

    private func validateDurableCanonReceipt(
        _ receipt: CanonCardImportReceipt,
        at path: String
    ) throws {
        let url = URL(fileURLWithPath: path)
        guard fileManager.fileExists(atPath: path) else {
            throw MacCaptureUploadJobStoreError
                .sourceReceiptMissing
        }
        guard let persisted = try? Self.decoder.decode(
            CanonCardImportReceipt.self,
            from: Data(contentsOf: url)
        ),
        persisted.state == .finalized,
        persisted.importID == receipt.importID,
        persisted.captureGroupID == receipt.captureGroupID,
        persisted.episodeSpaceID == receipt.episodeSpaceID,
        persisted.participantID == receipt.participantID,
        persisted.roomBinding == receipt.roomBinding,
        persisted.sourceKind == receipt.sourceKind,
        persisted.declaredCameraModel
            == receipt.declaredCameraModel,
        persisted.sourceFileName == receipt.sourceFileName,
        persisted.sourcePath == receipt.sourcePath,
        persisted.sourceVolumeIdentifier
            == receipt.sourceVolumeIdentifier,
        datesMatch(
            persisted.sourceCreatedAt,
            receipt.sourceCreatedAt
        ),
        datesMatch(
            persisted.sourceModifiedAt,
            receipt.sourceModifiedAt
        ),
        persisted.sourceByteCount == receipt.sourceByteCount,
        persisted.managedOriginalPath
            == receipt.managedOriginalPath,
        persisted.partialManagedOriginalPath == nil,
        persisted.receiptPath == receipt.receiptPath,
        persisted.sourceSHA256?.lowercased()
            == receipt.sourceSHA256?.lowercased(),
        persisted.managedOriginalSHA256?.lowercased()
            == receipt.managedOriginalSHA256?.lowercased(),
        persisted.managedOriginalByteCount
            == receipt.managedOriginalByteCount,
        persisted.byteIdentityVerified,
        persisted.startedMonotonicNanoseconds
            == receipt.startedMonotonicNanoseconds,
        persisted.stoppedMonotonicNanoseconds
            == receipt.stoppedMonotonicNanoseconds,
        persisted.technicalProbe == receipt.technicalProbe,
        persisted.failure == nil,
        datesMatch(persisted.startedAt, receipt.startedAt),
        datesMatch(persisted.stoppedAt, receipt.stoppedAt)
        else {
            throw MacCaptureUploadJobStoreError
                .sourceReceiptMismatch
        }
    }

    private func datesMatch(_ lhs: Date?, _ rhs: Date?) -> Bool {
        switch (lhs, rhs) {
        case (.none, .none):
            true
        case (.some(let lhs), .some(let rhs)):
            abs(lhs.timeIntervalSince(rhs)) < 1
        default:
            false
        }
    }

    private func normalizedOwner(_ value: String?) -> String? {
        nonempty(value)?.lowercased()
    }

    private func safeToken(_ value: String) -> String {
        let token = value
            .lowercased()
            .replacingOccurrences(
                of: "[^a-z0-9_-]+",
                with: "-",
                options: .regularExpression
            )
            .trimmingCharacters(
                in: CharacterSet(charactersIn: "-_")
            )
        return token.isEmpty ? "participant" : token
    }

    private func canonVideoContentType(
        for url: URL
    ) throws -> String {
        switch url.pathExtension.lowercased() {
        case "mp4":
            return "video/mp4"
        case "mov":
            return "video/quicktime"
        case "mxf":
            return "video/mxf"
        default:
            throw MacCaptureUploadJobStoreError
                .uploadIdentityIncomplete
        }
    }

    private func sortJobs() {
        jobs.sort {
            if $0.createdAt != $1.createdAt {
                return $0.createdAt < $1.createdAt
            }
            return $0.id.uuidString < $1.id.uuidString
        }
    }

    private struct MacAudioUploadSourceProfile:
        Codable,
        Equatable,
        Sendable
    {
        let schemaVersion: Int
        let inputDevice: CaptureAudioDeviceSnapshot
        let sampleRate: Double
        let bitDepth: Int
        let channelCount: Int
        let clientKind: String
        let sourceKind: String
        let monotonicStartedNanoseconds: String
        let monotonicStoppedNanoseconds: String?
        let clockSamples: [ProductionCaptureClockSample]?
    }

    private struct MacVideoReferenceUploadSourceProfile:
        Codable,
        Equatable,
        Sendable
    {
        let schemaVersion: Int
        let container: String
        let codec: String?
        let width: Int
        let height: Int
        let nominalFrameRate: Double
        let colorSpace: String?
        let orientation: String?
        let cameraPosition: String?
        let cameraDeviceUniqueID: String
        let includesAudio: Bool
        let audioSampleRate: Double?
        let audioChannelCount: Int?
        let monotonicStartedNanoseconds: String
        let monotonicStoppedNanoseconds: String?
        let clockSamples: [ProductionCaptureClockSample]?
        let cameraDevice: CaptureVideoDeviceSnapshot
        let negotiatedInputFormat:
            CaptureVideoFormatSnapshot
        let referenceKind: String
    }

    private struct MacCanonCardUploadSourceProfile:
        Codable,
        Equatable,
        Sendable
    {
        let schemaVersion: Int
        let sourceKind: String
        let container: String
        let codec: String
        let width: Int
        let height: Int
        let nominalFrameRate: Double
        let includesAudio: Bool
        let audioSampleRate: Double?
        let audioChannelCount: Int?
        let videoTrackCount: Int
        let audioTrackCount: Int
        let timecodeTrackCount: Int
        let declaredCameraModel: String
        let cardByteIdentityVerified: Bool
        let captureTimingEvidence: String
        let recordedAtCandidate: Date
        let sourceCreatedAt: Date?
        let sourceModifiedAt: Date?
        let importStartedAt: Date
        let importStoppedAt: Date
        let monotonicStartedNanoseconds: String?
        let monotonicStoppedNanoseconds: String?
        let clockSamples: [ProductionCaptureClockSample]?
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom(
            ProductionCaptureDateCoding.encode
        )
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(
            ProductionCaptureDateCoding.decode
        )
        return decoder
    }
}
#endif
