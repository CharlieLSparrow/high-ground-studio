import Foundation

enum CaptureNestEvidenceStatus: String, Codable, Sendable {
    case verifiedMatch = "VERIFIED_MATCH"
    case held = "HELD"
    case drift = "DRIFT"
    case incomplete = "INCOMPLETE"
}

struct CaptureNestSourceEvidenceReceipt: Decodable, Sendable {
    struct Evidence: Decodable, Sendable {
        let sources: [Source]
        let counts: [String: Int]
    }

    struct Source: Decodable, Sendable {
        struct Boundary: Decodable, Sendable {
            let receiptId: String
            let occurredAt: String
        }

        struct Cloud: Decodable, Sendable {
            let sha256: String?
            let byteSize: String?
            let generation: String?
            let bucket: String?
            let objectPath: String?
            let verifiedAt: String?
        }

        struct Runtime: Decodable, Sendable {
            let appVersion: String?
            let appBuild: String?
            let deviceModel: String?
            let operatingSystem: String?
            let audioRoute: String?
        }

        let recordingAssetId: String
        let fileName: String
        let kind: String
        let recordingStatus: String
        let status: CaptureNestEvidenceStatus
        let captureId: String?
        let captureGroupId: String?
        let uploadSessionId: String?
        let startBoundary: Boundary?
        let stopBoundary: Boundary?
        let cloud: Cloud
        let captureRuntime: Runtime
        let processingDisposition: String?
        let transcriptDisposition: String?
        let issues: [String]
    }

    let schema: String
    let version: Int
    let generatedAt: String
    let authority: String
    let roomId: String
    let phoneReceiptImportedAsAuthority: Bool
    let evidence: Evidence
}

struct CaptureNestLocalEvidence: Sendable {
    let sourceID: String
    let roomID: String
    let recordingAssetIDs: [String]
    let captureGroupID: String?
    let startReceiptID: String?
    let stopReceiptID: String?
    let computedSHA256: String
    let computedByteCount: Int64
    let verifiedCloudSHA256: String?
    let verifiedCloudSizeBytes: Int64?
    let verifiedCloudGeneration: String?
    let canonicalObjectPath: String?
    let localTruthChecksPass: Bool
}

struct CaptureNestEvidenceComparison: Sendable, Equatable {
    let status: CaptureNestEvidenceStatus
    let recordingAssetID: String?
    let nestGeneratedAt: Date
    let comparedAt: Date
    let localSHA256: String
    let localByteCount: Int64
    let nestSHA256: String?
    let nestByteCount: Int64?
    let nestGeneration: String?
    let processingDisposition: String?
    let transcriptDisposition: String?
    let issues: [String]
}

struct CaptureServerDispositionUpdate: Sendable, Equatable {
    let processingDisposition: String
    let transcriptDisposition: String
    let sourceID: String?
    let mediaAssetID: String?
}

enum CaptureNestSourceEvidenceContract {
    static let maximumReceiptBytes = 2 * 1_024 * 1_024
    static let maximumSources = 500
    static let maximumIssuesPerSource = 100

    /// Accepts a lightweight Session refresh only when its canonical identity,
    /// exact-byte receipt, and previously stored cloud fingerprint all agree.
    /// This lets an automatic Nest release clear a stale local hold badge
    /// without treating an ordinary server projection as new source authority.
    static func serverDispositionUpdate(
        localRecordingAssetID: String?,
        localServerVerificationStatus: String?,
        localVerifiedCloudSHA256: String?,
        localVerifiedCloudSizeBytes: Int64?,
        serverRecordingAssetID: String,
        serverRecordingStatus: String?,
        serverExactBytesVerified: Bool?,
        serverSHA256: String?,
        serverByteSize: String?,
        serverProcessingDisposition: String?,
        serverTranscriptDisposition: String?,
        serverSourceID: String?,
        serverMediaAssetID: String?
    ) -> CaptureServerDispositionUpdate? {
        guard normalizedText(localRecordingAssetID)?.lowercased()
                == normalizedText(serverRecordingAssetID)?.lowercased(),
              normalizedText(localServerVerificationStatus)?.uppercased() == "VERIFIED",
              normalizedText(serverRecordingStatus)?.uppercased() == "VERIFIED",
              serverExactBytesVerified == true,
              let localSHA256 = normalizedSHA256(localVerifiedCloudSHA256),
              localSHA256 == normalizedSHA256(serverSHA256),
              let localByteSize = localVerifiedCloudSizeBytes,
              localByteSize > 0,
              localByteSize == serverByteSize.flatMap(positiveByteCount),
              let processingDisposition = normalizedText(serverProcessingDisposition)?.uppercased(),
              ["HELD", "RELEASED"].contains(processingDisposition),
              let transcriptDisposition = normalizedText(serverTranscriptDisposition)?.uppercased(),
              ["HELD", "RELEASED"].contains(transcriptDisposition) else {
            return nil
        }
        return CaptureServerDispositionUpdate(
            processingDisposition: processingDisposition,
            transcriptDisposition: transcriptDisposition,
            sourceID: normalizedText(serverSourceID),
            mediaAssetID: normalizedText(serverMediaAssetID)
        )
    }

    static func decode(
        _ data: Data,
        expectedRoomID: String
    ) throws -> CaptureNestSourceEvidenceReceipt {
        guard !data.isEmpty, data.count <= maximumReceiptBytes else {
            throw ContractError.invalidReceipt("Nest returned an invalid source-evidence receipt size.")
        }
        let receipt: CaptureNestSourceEvidenceReceipt
        do {
            receipt = try JSONDecoder().decode(
                CaptureNestSourceEvidenceReceipt.self,
                from: data
            )
        } catch {
            throw ContractError.invalidReceipt("Nest returned source evidence that this app cannot safely decode.")
        }
        guard receipt.schema == "quipsly-nest-source-evidence",
              receipt.version == 1,
              receipt.authority == "nest-independent-projection",
              receipt.phoneReceiptImportedAsAuthority == false else {
            throw ContractError.invalidReceipt("Nest returned an unsupported source-evidence authority or version.")
        }
        guard receipt.roomId == expectedRoomID else {
            throw ContractError.invalidReceipt("Nest returned evidence for a different Session.")
        }
        guard parseDate(receipt.generatedAt) != nil else {
            throw ContractError.invalidReceipt("Nest returned source evidence without a valid generation time.")
        }
        guard receipt.evidence.sources.count <= maximumSources else {
            throw ContractError.invalidReceipt("Nest returned too many source rows to review safely.")
        }

        var recordingAssetIDs = Set<String>()
        var computedCounts: [String: Int] = [
            CaptureNestEvidenceStatus.verifiedMatch.rawValue: 0,
            CaptureNestEvidenceStatus.held.rawValue: 0,
            CaptureNestEvidenceStatus.drift.rawValue: 0,
            CaptureNestEvidenceStatus.incomplete.rawValue: 0,
        ]
        for source in receipt.evidence.sources {
            guard validText(source.recordingAssetId, maximumLength: 256),
                  recordingAssetIDs.insert(source.recordingAssetId).inserted,
                  validText(source.fileName, maximumLength: 1_024),
                  source.issues.count <= maximumIssuesPerSource,
                  source.issues.allSatisfy({
                      validText($0, maximumLength: 2_048)
                  }) else {
                throw ContractError.invalidReceipt("Nest returned malformed or ambiguous source evidence.")
            }
            computedCounts[source.status.rawValue, default: 0] += 1
            guard source.status != .verifiedMatch || source.issues.isEmpty else {
                throw ContractError.invalidReceipt("Nest returned internally inconsistent verified source evidence.")
            }
            if let sha256 = source.cloud.sha256,
               normalizedSHA256(sha256) == nil {
                throw ContractError.invalidReceipt("Nest returned a malformed source SHA-256.")
            }
            if let byteSize = source.cloud.byteSize,
               positiveByteCount(byteSize) == nil {
                throw ContractError.invalidReceipt("Nest returned a malformed source byte count.")
            }
            for boundary in [source.startBoundary, source.stopBoundary].compactMap({ $0 }) {
                guard validText(boundary.receiptId, maximumLength: 256),
                      parseDate(boundary.occurredAt) != nil else {
                    throw ContractError.invalidReceipt("Nest returned a malformed capture boundary.")
                }
            }
            if let verifiedAt = source.cloud.verifiedAt,
               parseDate(verifiedAt) == nil {
                throw ContractError.invalidReceipt("Nest returned a malformed cloud verification time.")
            }
            let boundedValues = [
                source.captureId,
                source.captureGroupId,
                source.uploadSessionId,
                source.cloud.generation,
                source.cloud.bucket,
                source.cloud.objectPath,
                source.captureRuntime.appVersion,
                source.captureRuntime.appBuild,
                source.captureRuntime.deviceModel,
                source.captureRuntime.operatingSystem,
                source.captureRuntime.audioRoute,
                source.processingDisposition,
                source.transcriptDisposition,
            ]
            guard boundedValues.compactMap({ $0 }).allSatisfy({
                validText($0, maximumLength: 4_096)
            }) else {
                throw ContractError.invalidReceipt("Nest returned an oversized or malformed source-evidence field.")
            }
        }
        guard receipt.evidence.counts == computedCounts else {
            throw ContractError.invalidReceipt("Nest returned source-evidence counts that do not match its rows.")
        }
        return receipt
    }

    static func compare(
        local: CaptureNestLocalEvidence,
        nest receipt: CaptureNestSourceEvidenceReceipt,
        now: Date = Date()
    ) throws -> CaptureNestEvidenceComparison {
        guard receipt.roomId == local.roomID,
              let generatedAt = parseDate(receipt.generatedAt) else {
            throw ContractError.invalidReceipt("The Nest receipt does not belong to this local Session.")
        }

        let localSourceID = local.sourceID.lowercased()
        let localAssetIDs = Set(
            local.recordingAssetIDs.map { $0.lowercased() }
        )
        let matches = receipt.evidence.sources.filter { source in
            source.captureId?.lowercased() == localSourceID
                || localAssetIDs.contains(source.recordingAssetId.lowercased())
        }
        guard matches.count <= 1 else {
            return result(
                status: .drift,
                source: nil,
                generatedAt: generatedAt,
                now: now,
                local: local,
                issues: ["Nest returned more than one source for this immutable local identity."]
            )
        }
        guard let source = matches.first else {
            return result(
                status: .incomplete,
                source: nil,
                generatedAt: generatedAt,
                now: now,
                local: local,
                issues: ["Nest does not yet contain a source bound to \(CaptureDeviceVocabulary.thisDevice) recording."]
            )
        }

        var drift: [String] = []
        var incomplete: [String] = []

        if !local.localTruthChecksPass {
            drift.append("The local source receipt did not pass every immutable-source check.")
        }
        if !localAssetIDs.isEmpty,
           !localAssetIDs.contains(source.recordingAssetId.lowercased()) {
            drift.append("The canonical RecordingAsset ID does not match the device upload receipt.")
        }
        compareRequired(
            local.computedSHA256,
            normalizedSHA256(source.cloud.sha256),
            label: "SHA-256",
            drift: &drift,
            incomplete: &incomplete
        )
        compareRequired(
            local.computedByteCount,
            source.cloud.byteSize.flatMap(positiveByteCount),
            label: "byte count",
            drift: &drift,
            incomplete: &incomplete
        )
        compareOptional(
            local.captureGroupID?.lowercased(),
            source.captureGroupId?.lowercased(),
            label: "capture group",
            drift: &drift,
            incomplete: &incomplete
        )
        compareOptional(
            local.startReceiptID?.lowercased(),
            source.startBoundary?.receiptId.lowercased(),
            label: "START receipt",
            drift: &drift,
            incomplete: &incomplete
        )
        compareOptional(
            local.stopReceiptID?.lowercased(),
            source.stopBoundary?.receiptId.lowercased(),
            label: "STOP receipt",
            drift: &drift,
            incomplete: &incomplete
        )
        compareOptional(
            normalizedSHA256(local.verifiedCloudSHA256),
            normalizedSHA256(source.cloud.sha256),
            label: "stored cloud SHA-256",
            drift: &drift,
            incomplete: &incomplete
        )
        compareOptional(
            local.verifiedCloudSizeBytes,
            source.cloud.byteSize.flatMap(positiveByteCount),
            label: "stored cloud byte count",
            drift: &drift,
            incomplete: &incomplete
        )
        compareOptional(
            normalizedText(local.verifiedCloudGeneration),
            normalizedText(source.cloud.generation),
            label: "cloud generation",
            drift: &drift,
            incomplete: &incomplete
        )
        compareOptional(
            normalizedText(local.canonicalObjectPath),
            normalizedText(source.cloud.objectPath),
            label: "canonical storage path",
            drift: &drift,
            incomplete: &incomplete
        )

        let finalStatus: CaptureNestEvidenceStatus
        let issues: [String]
        if !drift.isEmpty || source.status == .drift {
            finalStatus = .drift
            issues = unique(drift + source.issues + incomplete)
        } else if source.status == .held {
            finalStatus = .held
            issues = unique(source.issues + incomplete)
        } else if !incomplete.isEmpty || source.status == .incomplete {
            finalStatus = .incomplete
            issues = unique(incomplete + source.issues)
        } else {
            finalStatus = .verifiedMatch
            issues = []
        }
        return result(
            status: finalStatus,
            source: source,
            generatedAt: generatedAt,
            now: now,
            local: local,
            issues: issues
        )
    }

    private static func result(
        status: CaptureNestEvidenceStatus,
        source: CaptureNestSourceEvidenceReceipt.Source?,
        generatedAt: Date,
        now: Date,
        local: CaptureNestLocalEvidence,
        issues: [String]
    ) -> CaptureNestEvidenceComparison {
        CaptureNestEvidenceComparison(
            status: status,
            recordingAssetID: source?.recordingAssetId,
            nestGeneratedAt: generatedAt,
            comparedAt: now,
            localSHA256: local.computedSHA256,
            localByteCount: local.computedByteCount,
            nestSHA256: normalizedSHA256(source?.cloud.sha256),
            nestByteCount: source?.cloud.byteSize.flatMap(positiveByteCount),
            nestGeneration: normalizedText(source?.cloud.generation),
            processingDisposition: normalizedText(source?.processingDisposition),
            transcriptDisposition: normalizedText(source?.transcriptDisposition),
            issues: unique(issues)
        )
    }

    private static func compareRequired<T: Equatable>(
        _ local: T,
        _ nest: T?,
        label: String,
        drift: inout [String],
        incomplete: inout [String]
    ) {
        guard let nest else {
            incomplete.append("Nest does not yet have a verified \(label).")
            return
        }
        if local != nest {
            drift.append("The local and Nest \(label) values do not match.")
        }
    }

    private static func compareOptional<T: Equatable>(
        _ local: T?,
        _ nest: T?,
        label: String,
        drift: inout [String],
        incomplete: inout [String]
    ) {
        guard let local else { return }
        guard let nest else {
            incomplete.append("Nest does not yet have the \(label) stored by \(CaptureDeviceVocabulary.thisDevice).")
            return
        }
        if local != nest {
            drift.append("The local and Nest \(label) values do not match.")
        }
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: value)
    }

    private static func validText(
        _ value: String,
        maximumLength: Int
    ) -> Bool {
        let normalized = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return !normalized.isEmpty
            && normalized.count <= maximumLength
            && normalized.unicodeScalars.allSatisfy {
                !CharacterSet.controlCharacters.contains($0)
                    || $0.value == 10
                    || $0.value == 9
            }
    }

    private static func normalizedSHA256(_ value: String?) -> String? {
        guard let value = normalizedText(value)?.lowercased(),
              value.range(of: "^[0-9a-f]{64}$", options: .regularExpression) != nil else {
            return nil
        }
        return value
    }

    private nonisolated static func positiveByteCount(_ value: String) -> Int64? {
        guard let parsed = Int64(value), parsed > 0 else { return nil }
        return parsed
    }

    private static func normalizedText(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }

    private static func unique(_ values: [String]) -> [String] {
        var seen = Set<String>()
        return values.filter { seen.insert($0).inserted }
    }

    enum ContractError: LocalizedError {
        case invalidReceipt(String)

        var errorDescription: String? {
            switch self {
            case let .invalidReceipt(message):
                message
            }
        }
    }
}
