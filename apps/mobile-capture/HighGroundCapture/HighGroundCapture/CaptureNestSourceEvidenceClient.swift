import Foundation

@MainActor
enum CaptureNestSourceEvidenceClient {
    private struct FileFingerprint: Equatable {
        let url: URL
        let size: Int64
        let modificationDate: Date?
    }

    static func compare(
        recordingID: UUID,
        library: LocalRecordingLibrary
    ) async throws -> CaptureNestEvidenceComparison {
        guard let initialRecording = library.recording(id: recordingID) else {
            throw ClientError.recordingUnavailable
        }
        guard let roomID = normalized(initialRecording.callRoomId) else {
            throw ClientError.standaloneSource
        }
        guard roomID.range(
            of: "^[A-Za-z0-9_-]{1,256}$",
            options: .regularExpression
        ) != nil else {
            throw ClientError.invalidRoomIdentity
        }
        guard let ownerAccountID = normalized(initialRecording.ownerAccountID),
              AuthManager.currentStoredOwnerID()?.lowercased() == ownerAccountID.lowercased() else {
            throw ClientError.accountMismatch
        }
        guard let initialFileFingerprint = fileFingerprint(
            recording: initialRecording,
            library: library
        ) else {
            throw ClientError.localSourceUnavailable
        }

        let localReceipt = try await CaptureSourceEvidenceExporter.evaluate(
            recordingID: recordingID,
            library: library
        )
        guard let currentRecording = library.recording(id: recordingID),
              normalized(currentRecording.ownerAccountID)?.lowercased()
                == ownerAccountID.lowercased(),
              normalized(currentRecording.callRoomId) == roomID else {
            throw ClientError.accountOrSourceChanged
        }

        let baseURLString = normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL")
                as? String
                ?? "https://nest.quipsly.com"
        )
        guard let baseURL = URL(string: baseURLString) else {
            throw ClientError.invalidNestURL
        }
        let endpoint = baseURL
            .appendingPathComponent("api", isDirectory: true)
            .appendingPathComponent("sessions", isDirectory: true)
            .appendingPathComponent(roomID, isDirectory: true)
            .appendingPathComponent("source-evidence", isDirectory: false)
        var request = URLRequest(url: endpoint)
        request.httpMethod = "GET"
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        let (data, response) = try await AuthManager.shared.authenticatedData(
            for: request,
            expectedOwnerAccountID: ownerAccountID
        )
        guard sameOrigin(response.url, baseURL) else {
            throw ClientError.untrustedResponseOrigin
        }
        guard response.statusCode == 200 else {
            throw ClientError.server(
                status: response.statusCode,
                message: safeServerMessage(data)
            )
        }
        guard response.mimeType?.lowercased() == "application/json" else {
            throw ClientError.invalidContentType
        }

        let nestReceipt = try CaptureNestSourceEvidenceContract.decode(
            data,
            expectedRoomID: roomID
        )
        let local = CaptureNestLocalEvidence(
            sourceID: currentRecording.id.uuidString.lowercased(),
            roomID: roomID,
            recordingAssetIDs: [
                currentRecording.uploadedMediaAssetId,
                currentRecording.recordingAssetId,
            ].compactMap(normalized),
            captureGroupID: currentRecording.captureGroupId?.uuidString.lowercased(),
            startReceiptID: currentRecording.roomStartReceiptId?.uuidString.lowercased(),
            stopReceiptID: currentRecording.roomStopReceiptId?.uuidString.lowercased(),
            computedSHA256: localReceipt.localIntegrity.computedSHA256,
            computedByteCount: localReceipt.localIntegrity.computedByteCount,
            verifiedCloudSHA256: currentRecording.verifiedCloudSHA256,
            verifiedCloudSizeBytes: currentRecording.verifiedCloudSizeBytes,
            verifiedCloudGeneration: currentRecording.verifiedCloudGeneration,
            canonicalObjectPath: currentRecording.canonicalObjectPath,
            localTruthChecksPass: localReceipt.checks.sourceTruthChecksPass
        )
        let comparison = try CaptureNestSourceEvidenceContract.compare(
            local: local,
            nest: nestReceipt
        )

        guard AuthManager.currentStoredOwnerID()?.lowercased()
                == ownerAccountID.lowercased(),
              let finalRecording = library.recording(id: recordingID),
              normalized(finalRecording.ownerAccountID)?.lowercased()
                == ownerAccountID.lowercased(),
              normalized(finalRecording.callRoomId) == roomID,
              finalRecording.fileName == currentRecording.fileName,
              finalRecording.startedAt == currentRecording.startedAt,
              fileFingerprint(
                recording: finalRecording,
                library: library
              ) == initialFileFingerprint else {
            throw ClientError.accountOrSourceChanged
        }
        return comparison
    }

    private static func sameOrigin(_ responseURL: URL?, _ baseURL: URL) -> Bool {
        guard let responseURL else { return false }
        return responseURL.scheme?.lowercased() == baseURL.scheme?.lowercased()
            && responseURL.host?.lowercased() == baseURL.host?.lowercased()
            && responseURL.port == baseURL.port
    }

    private static func fileFingerprint(
        recording: LocalRecording,
        library: LocalRecordingLibrary
    ) -> FileFingerprint? {
        guard let url = library.fileURL(for: recording),
              let values = try? url.resourceValues(
                forKeys: [
                    .fileSizeKey,
                    .contentModificationDateKey,
                    .isRegularFileKey,
                ]
              ),
              values.isRegularFile == true,
              let size = values.fileSize,
              size >= 0 else {
            return nil
        }
        return FileFingerprint(
            url: url.standardizedFileURL,
            size: Int64(size),
            modificationDate: values.contentModificationDate
        )
    }

    private static func safeServerMessage(_ data: Data) -> String? {
        guard data.count <= 64 * 1_024,
              let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any],
              let message = dictionary["error"] as? String else {
            return nil
        }
        let normalized = message.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized.isEmpty ? nil : String(normalized.prefix(500))
    }

    private static func normalized(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }

    enum ClientError: LocalizedError {
        case recordingUnavailable
        case standaloneSource
        case accountMismatch
        case localSourceUnavailable
        case accountOrSourceChanged
        case invalidRoomIdentity
        case invalidNestURL
        case untrustedResponseOrigin
        case invalidContentType
        case server(status: Int, message: String?)

        var errorDescription: String? {
            switch self {
            case .recordingUnavailable:
                "This source is no longer available in the active account library."
            case .standaloneSource:
                "Standalone recordings have no Nest Session receipt to compare."
            case .accountMismatch:
                "The source belongs to a different account. Quipsly did not request its private Nest evidence."
            case .localSourceUnavailable:
                "The immutable local source bytes are not available on this iPhone."
            case .accountOrSourceChanged:
                "The active account or source identity changed during comparison."
            case .invalidRoomIdentity:
                "This source does not contain a safe canonical Nest Session identity."
            case .invalidNestURL:
                "The configured Nest address is invalid."
            case .untrustedResponseOrigin:
                "The evidence response left the configured Nest origin."
            case .invalidContentType:
                "Nest did not return a JSON source-evidence receipt."
            case let .server(status, message):
                message ?? "Nest source evidence is unavailable (HTTP \(status)). No source or cloud object changed."
            }
        }
    }
}
