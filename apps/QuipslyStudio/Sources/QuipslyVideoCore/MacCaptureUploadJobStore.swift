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
        self.protocolVersion = 1
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
    case sourceFileMissing
    case sourceFileSizeChanged
    case sourceDigestMissing
    case immutableBindingChanged
    case ledgerQuarantined

    public var errorDescription: String? {
        switch self {
        case .uploadIdentityIncomplete:
            "The finalized source is missing its verified owner, room, participant, consent, or time boundary."
        case .sourceIsNotFinalized:
            "Only a finalized local master can enter the canonical upload outbox."
        case .sourceFileMissing:
            "The finalized local source file is no longer present."
        case .sourceFileSizeChanged:
            "The local source size no longer matches its finalized receipt."
        case .sourceDigestMissing:
            "The finalized source receipt does not contain a valid SHA-256 digest."
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
        let owner = ownerAccountID.trimmingCharacters(
            in: .whitespacesAndNewlines
        ).lowercased()
        guard !owner.isEmpty,
              let callRoomID = nonempty(receipt.callRoomID),
              let recordingConsentID = nonempty(
                receipt.recordingConsentID
              ),
              receipt.startReceiptID != nil,
              !receipt.participantID.trimmingCharacters(
                in: .whitespacesAndNewlines
              ).isEmpty else {
            throw MacCaptureUploadJobStoreError
                .uploadIdentityIncomplete
        }
        let sourceURL = URL(fileURLWithPath: receipt.audioPath)
        guard fileManager.fileExists(atPath: sourceURL.path) else {
            throw MacCaptureUploadJobStoreError.sourceFileMissing
        }
        guard let byteCount = receipt.byteCount, byteCount > 0,
              (
                try sourceURL.resourceValues(
                    forKeys: [.fileSizeKey]
                ).fileSize
              ).map(Int64.init) == byteCount else {
            throw MacCaptureUploadJobStoreError
                .sourceFileSizeChanged
        }
        guard let sha256 = receipt.sha256?.lowercased(),
              sha256.range(
                of: "^[0-9a-f]{64}$",
                options: .regularExpression
              ) != nil else {
            throw MacCaptureUploadJobStoreError
                .sourceDigestMissing
        }
        if let existing = job(
            id: receipt.recordingID,
            ownerAccountID: owner
        ) {
            return existing
        }
        let profile = MacAudioUploadSourceProfile(
            inputDevice: receipt.inputDevice,
            sampleRate: receipt.targetSampleRate,
            bitDepth: receipt.targetBitDepth,
            channelCount: receipt.channelCount,
            clientKind: receipt.clientKind,
            sourceKind: receipt.sourceKind
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
        let created = MacCaptureUploadJob(
            id: receipt.recordingID,
            ownerAccountID: owner,
            captureID: receipt.captureGroupID,
            captureGroupID: receipt.captureGroupID,
            filePath: sourceURL.path,
            sourceReceiptPath: sourceReceiptPath,
            fileName: sourceURL.lastPathComponent,
            contentType: "audio/wav",
            sourceType: "audio",
            expectedSizeBytes: byteCount,
            expectedSHA256: sha256,
            projectSlug: nonempty(receipt.projectSlug),
            episodeSlug:
                nonempty(receipt.episodeSlug)
                    ?? nonempty(receipt.episodeSpaceID),
            trackID:
                "\(safeToken(receipt.participantID))-microphone-master",
            callRoomID: callRoomID,
            participantID: receipt.participantID,
            recordingConsentID: recordingConsentID,
            capturePurpose: nonempty(receipt.capturePurpose),
            sourceProfileJSON: profileJSON,
            startedAt: receipt.startedAt,
            stoppedAt: stoppedAt
        )
        try commit(jobs + [created])
        return created
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
            && lhs.capturePurpose == rhs.capturePurpose
            && lhs.sourceProfileJSON == rhs.sourceProfileJSON
            && lhs.startedAt == rhs.startedAt
            && lhs.stoppedAt == rhs.stoppedAt
            && lhs.createdAt == rhs.createdAt
    }

    private func nonempty(_ value: String?) -> String? {
        let clean = value?.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return clean?.isEmpty == false ? clean : nil
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
        let inputDevice: CaptureAudioDeviceSnapshot
        let sampleRate: Double
        let bitDepth: Int
        let channelCount: Int
        let clientKind: String
        let sourceKind: String
    }

    private static var encoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }

    private static var decoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
#endif
