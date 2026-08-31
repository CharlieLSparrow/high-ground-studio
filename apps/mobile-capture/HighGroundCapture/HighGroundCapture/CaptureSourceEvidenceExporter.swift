import CryptoKit
import Foundation

struct CaptureSourceEvidenceReceipt: Codable, Sendable {
    struct SourceIdentity: Codable, Sendable {
        let id: UUID
        let captureGroupId: UUID?
        let mediaKind: String
        let fileName: String
        let displayTitle: String
        let sessionTitle: String?
        let projectSlug: String?
        let episodeSlug: String?
        let callRoomId: String?
        let participantId: String?
        let capturePurpose: String?
        let startedAt: Date
        let stoppedAt: Date?
        let durationSeconds: Double
        let ledgerByteCount: Int64
        let status: String
    }

    struct RoomBoundary: Codable, Sendable {
        let startReceiptId: UUID?
        let stopReceiptId: UUID?
        let isRequired: Bool
        let isComplete: Bool
    }

    struct LocalIntegrity: Codable, Sendable {
        let computedSHA256: String
        let computedByteCount: Int64
        let ledgerSHA256: String?
        let ledgerByteCountMatches: Bool
        let ledgerSHA256Matches: Bool?
    }

    struct CloudVerification: Codable, Sendable {
        let status: String?
        let sourceId: String?
        let mediaAssetId: String?
        let transcriptJobId: String?
        let canonicalObjectPath: String?
        let verifiedSHA256: String?
        let verifiedSizeBytes: Int64?
        let generation: String?
        let verifiedAt: Date?
        let matchesLocalSource: Bool?
        let processingDisposition: String?
        let processingHoldReason: String?
        let transcriptDisposition: String?
    }

    struct Checks: Codable, Sendable {
        let activeAccountMatchesSource: Bool
        let localSourceWasStableWhileHashed: Bool
        let localByteCountMatchesLedger: Bool
        let localHashMatchesLedgerWhenPresent: Bool
        let roomBoundaryIsCompleteWhenRequired: Bool
        let verifiedCloudProofMatchesLocalWhenClaimed: Bool
        let sourceTruthChecksPass: Bool
    }

    let schema: String
    let schemaVersion: Int
    let generatedAt: Date
    let generatedBy: String
    let ownerFingerprintSHA256: String
    let source: SourceIdentity
    let sourceProfile: LocalRecordingSourceProfile?
    let roomBoundary: RoomBoundary
    let localIntegrity: LocalIntegrity
    let cloudVerification: CloudVerification
    let checks: Checks
}

@MainActor
enum CaptureSourceEvidenceExporter {
    private struct HashedFile: Sendable {
        let sha256: String
        let byteCount: Int64
        let modificationDate: Date?
    }

    static func prepare(
        recordingID: UUID,
        library: LocalRecordingLibrary
    ) async throws -> URL {
        let receipt = try await evaluate(
            recordingID: recordingID,
            library: library
        )
        return try write(
            receipt,
            ownerFingerprint: receipt.ownerFingerprintSHA256
        )
    }

    static func evaluate(
        recordingID: UUID,
        library: LocalRecordingLibrary
    ) async throws -> CaptureSourceEvidenceReceipt {
        guard let recording = library.recording(id: recordingID) else {
            throw EvidenceError.recordingUnavailable
        }
        guard recording.status.isPlaybackEligible else {
            throw EvidenceError.sourceNotFinalized
        }
        guard let activeOwner = normalizedOwner(AuthManager.currentStoredOwnerID()),
              normalizedOwner(recording.ownerAccountID) == activeOwner else {
            throw EvidenceError.accountMismatch
        }
        guard let sourceURL = library.fileURL(for: recording) else {
            throw EvidenceError.localSourceUnavailable
        }

        let initialValues = try sourceURL.resourceValues(
            forKeys: [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
        )
        guard initialValues.isRegularFile == true else {
            throw EvidenceError.localSourceUnavailable
        }

        let hashTask = Task.detached(priority: .utility) {
            try hashFile(at: sourceURL)
        }
        let hashedFile = try await withTaskCancellationHandler {
            try await hashTask.value
        } onCancel: {
            hashTask.cancel()
        }

        guard let activeOwnerAfterHash = normalizedOwner(AuthManager.currentStoredOwnerID()),
              activeOwnerAfterHash == activeOwner,
              let latest = library.recording(id: recordingID),
              normalizedOwner(latest.ownerAccountID) == activeOwner,
              latest.fileName == recording.fileName,
              latest.startedAt == recording.startedAt,
              library.fileURL(for: latest) == sourceURL else {
            throw EvidenceError.accountOrSourceChanged
        }

        let finalValues = try sourceURL.resourceValues(
            forKeys: [.fileSizeKey, .contentModificationDateKey, .isRegularFileKey]
        )
        let sourceWasStable =
            finalValues.isRegularFile == true
            && initialValues.fileSize == finalValues.fileSize
            && initialValues.contentModificationDate == finalValues.contentModificationDate
            && hashedFile.modificationDate == finalValues.contentModificationDate
            && Int64(finalValues.fileSize ?? -1) == hashedFile.byteCount
        guard sourceWasStable else {
            throw EvidenceError.localSourceChanged
        }

        let ledgerHash = normalizedSHA256(latest.sourceSHA256)
        let localHashMatchesLedger = ledgerHash.map { $0 == hashedFile.sha256 }
        let localSizeMatchesLedger = latest.byteCount == hashedFile.byteCount
        let requiresRoomBoundary = nonempty(latest.callRoomId) != nil
        let roomBoundaryComplete =
            !requiresRoomBoundary
            || (latest.roomStartReceiptId != nil && latest.roomStopReceiptId != nil)

        let normalizedCloudStatus = nonempty(latest.serverVerificationStatus)?.lowercased()
        let claimsVerifiedCloud = normalizedCloudStatus == "verified"
        let cloudHash = normalizedSHA256(latest.verifiedCloudSHA256)
        let cloudMatchesLocal = claimsVerifiedCloud
            ? cloudHash == hashedFile.sha256
                && latest.verifiedCloudSizeBytes == hashedFile.byteCount
                && nonempty(latest.verifiedCloudGeneration) != nil
                && latest.verifiedCloudAt != nil
            : nil
        let cloudProofPasses = cloudMatchesLocal ?? true
        let localHashPasses = localHashMatchesLedger ?? true
        let sourceTruthChecksPass =
            sourceWasStable
            && localSizeMatchesLedger
            && localHashPasses
            && roomBoundaryComplete
            && cloudProofPasses

        let receipt = CaptureSourceEvidenceReceipt(
            schema: "quipsly-capture-source-evidence",
            schemaVersion: 1,
            generatedAt: Date(),
            generatedBy: captureAppLabel(from: latest.sourceProfile),
            ownerFingerprintSHA256: sha256(activeOwner),
            source: .init(
                id: latest.id,
                captureGroupId: latest.captureGroupId,
                mediaKind: latest.effectiveMediaKind.rawValue,
                fileName: latest.fileName,
                displayTitle: latest.displayTitle,
                sessionTitle: latest.sessionTitle,
                projectSlug: nonempty(latest.projectSlug),
                episodeSlug: nonempty(latest.episodeSlug),
                callRoomId: nonempty(latest.callRoomId),
                participantId: nonempty(latest.participantId),
                capturePurpose: nonempty(latest.capturePurpose),
                startedAt: latest.startedAt,
                stoppedAt: latest.stoppedAt,
                durationSeconds: latest.durationSeconds,
                ledgerByteCount: latest.byteCount,
                status: latest.status.rawValue
            ),
            sourceProfile: latest.sourceProfile,
            roomBoundary: .init(
                startReceiptId: latest.roomStartReceiptId,
                stopReceiptId: latest.roomStopReceiptId,
                isRequired: requiresRoomBoundary,
                isComplete: roomBoundaryComplete
            ),
            localIntegrity: .init(
                computedSHA256: hashedFile.sha256,
                computedByteCount: hashedFile.byteCount,
                ledgerSHA256: ledgerHash,
                ledgerByteCountMatches: localSizeMatchesLedger,
                ledgerSHA256Matches: localHashMatchesLedger
            ),
            cloudVerification: .init(
                status: normalizedCloudStatus,
                sourceId: nonempty(latest.uploadedSourceId),
                mediaAssetId: nonempty(latest.uploadedMediaAssetId),
                transcriptJobId: nonempty(latest.transcriptJobId),
                canonicalObjectPath: nonempty(latest.canonicalObjectPath),
                verifiedSHA256: cloudHash,
                verifiedSizeBytes: latest.verifiedCloudSizeBytes,
                generation: nonempty(latest.verifiedCloudGeneration),
                verifiedAt: latest.verifiedCloudAt,
                matchesLocalSource: cloudMatchesLocal,
                processingDisposition: nonempty(latest.serverProcessingDisposition),
                processingHoldReason: nonempty(latest.serverProcessingHoldReason),
                transcriptDisposition: nonempty(latest.serverTranscriptDisposition)
            ),
            checks: .init(
                activeAccountMatchesSource: true,
                localSourceWasStableWhileHashed: sourceWasStable,
                localByteCountMatchesLedger: localSizeMatchesLedger,
                localHashMatchesLedgerWhenPresent: localHashPasses,
                roomBoundaryIsCompleteWhenRequired: roomBoundaryComplete,
                verifiedCloudProofMatchesLocalWhenClaimed: cloudProofPasses,
                sourceTruthChecksPass: sourceTruthChecksPass
            )
        )
        return receipt
    }

    private nonisolated static func hashFile(at sourceURL: URL) throws -> HashedFile {
        let modificationDate = try sourceURL.resourceValues(
            forKeys: [.contentModificationDateKey]
        ).contentModificationDate
        let handle = try FileHandle(forReadingFrom: sourceURL)
        defer { try? handle.close() }

        var hasher = SHA256()
        var byteCount: Int64 = 0
        while true {
            try Task.checkCancellation()
            let data = try handle.read(upToCount: 1_048_576) ?? Data()
            guard !data.isEmpty else { break }
            hasher.update(data: data)
            byteCount += Int64(data.count)
        }
        return HashedFile(
            sha256: hasher.finalize().map { String(format: "%02x", $0) }.joined(),
            byteCount: byteCount,
            modificationDate: modificationDate
        )
    }

    private static func write(
        _ receipt: CaptureSourceEvidenceReceipt,
        ownerFingerprint: String
    ) throws -> URL {
        guard let applicationSupport = FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first else {
            throw EvidenceError.evidenceDirectoryUnavailable
        }
        let directory = applicationSupport
            .appendingPathComponent("QuipslyCapture/Evidence", isDirectory: true)
            .appendingPathComponent(String(ownerFingerprint.prefix(24)), isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        var directoryValues = URLResourceValues()
        directoryValues.isExcludedFromBackup = true
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(directoryValues)

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        let timestamp = formatter.string(from: receipt.generatedAt)
            .replacingOccurrences(of: ":", with: "")
        let fileURL = directory.appendingPathComponent(
            "capture-evidence-\(receipt.source.id.uuidString.lowercased())-\(timestamp)-\(UUID().uuidString.lowercased()).json",
            isDirectory: false
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        encoder.dateEncodingStrategy = .iso8601
        try encoder.encode(receipt).write(
            to: fileURL,
            options: [.atomic, .completeFileProtection]
        )
        var fileValues = URLResourceValues()
        fileValues.isExcludedFromBackup = true
        var mutableFileURL = fileURL
        try mutableFileURL.setResourceValues(fileValues)
        return fileURL
    }

    private nonisolated static func sha256(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private nonisolated static func normalizedOwner(_ value: String?) -> String? {
        nonempty(value)?.lowercased()
    }

    private nonisolated static func normalizedSHA256(_ value: String?) -> String? {
        guard let normalized = nonempty(value)?.lowercased(),
              normalized.range(
                of: "^[0-9a-f]{64}$",
                options: .regularExpression
              ) != nil else {
            return nil
        }
        return normalized
    }

    private nonisolated static func nonempty(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }

    private static func captureAppLabel(
        from profile: LocalRecordingSourceProfile?
    ) -> String {
        let version = nonempty(profile?.captureAppVersion) ?? "unknown"
        let build = nonempty(profile?.captureAppBuild) ?? "unknown"
        return "Quipsly Capture \(version) (\(build))"
    }

    enum EvidenceError: LocalizedError {
        case recordingUnavailable
        case sourceNotFinalized
        case accountMismatch
        case localSourceUnavailable
        case accountOrSourceChanged
        case localSourceChanged
        case evidenceDirectoryUnavailable

        var errorDescription: String? {
            switch self {
            case .recordingUnavailable:
                "This source is no longer available in the active account library."
            case .sourceNotFinalized:
                "Finish and validate the recording before preparing source evidence."
            case .accountMismatch:
                "The source belongs to a different account. Quipsly did not expose its evidence."
            case .localSourceUnavailable:
                "The immutable local source bytes are not available on this device."
            case .accountOrSourceChanged:
                "The active account or source identity changed while evidence was being prepared."
            case .localSourceChanged:
                "The local source changed while Quipsly was hashing it. No evidence file was created."
            case .evidenceDirectoryUnavailable:
                "Protected Application Support storage is unavailable."
            }
        }
    }
}
