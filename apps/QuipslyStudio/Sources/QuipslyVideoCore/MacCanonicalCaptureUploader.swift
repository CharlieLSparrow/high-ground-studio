import Foundation

#if os(macOS)
public enum MacCanonicalCaptureUploadPolicy {
    public static func isTrustedProductionStorageURL(
        _ url: URL
    ) -> Bool {
        let host = url.host?.lowercased() ?? ""
        return url.scheme?.lowercased() == "https"
            && (
                host == "storage.googleapis.com"
                    || host.hasSuffix(".storage.googleapis.com")
            )
    }
}

public struct MacCanonicalCaptureUploadUpdate:
    Equatable,
    Sendable
{
    public let progress: Double
    public let message: String

    public init(progress: Double, message: String) {
        self.progress = progress
        self.message = message
    }
}

@MainActor
public final class MacCanonicalCaptureUploader {
    public typealias AuthenticatedData =
        (URLRequest) async throws -> (Data, HTTPURLResponse)
    public typealias UpdateHandler =
        (MacCanonicalCaptureUploadUpdate) -> Void

    private let jobStore: MacCaptureUploadJobStore

    public init(jobStore: MacCaptureUploadJobStore) {
        self.jobStore = jobStore
    }

    public func upload(
        jobID: UUID,
        ownerAccountID: String,
        baseURL: URL,
        authenticatedData: AuthenticatedData,
        onUpdate: UpdateHandler
    ) async throws -> MacCaptureUploadJob {
        guard var job = jobStore.job(
            id: jobID,
            ownerAccountID: ownerAccountID
        ) else {
            throw uploadError(
                code: 1,
                message:
                    "The protected canonical upload job could not be found for this verified account."
            )
        }

        do {
            onUpdate(
                .init(
                    progress: 0.04,
                    message:
                        "Re-reading the exact local bytes before issuing a private upload capability…"
                )
            )
            let evidence = try await Task.detached(
                priority: .utility
            ) {
                try MacCaptureUploadJobStore.exactSourceEvidence(
                    for: job
                )
            }.value
            guard evidence.sizeBytes == job.expectedSizeBytes,
                  evidence.sha256 == job.expectedSHA256 else {
                throw uploadError(
                    code: 2,
                    message:
                        "The local source bytes no longer match the finalized size and SHA-256 receipt."
                )
            }

            job.phase = .creating
            job.attemptCount += 1
            job.lastAttemptAt = Date()
            job.updatedAt = Date()
            job.lastError = nil
            try jobStore.save(job)
            onUpdate(
                .init(
                    progress: 0.12,
                    message:
                        "Creating or recovering the immutable private upload session…"
                )
            )

            let created = try await createCanonicalUpload(
                job: job,
                baseURL: baseURL,
                authenticatedData: authenticatedData
            )
            job.objectPath =
                created.objectPath
                    ?? created.objectName
                    ?? job.objectPath
            let stage =
                created.uploadStage?.lowercased()
                    ?? "uploading"

            if stage == "uploading" {
                guard let instruction = created.upload else {
                    throw uploadError(
                        code: 3,
                        message:
                            "Nest did not return the direct private-storage upload instruction."
                    )
                }
                job.phase = .uploading
                job.updatedAt = Date()
                try jobStore.save(job)
                onUpdate(
                    .init(
                        progress: 0.2,
                        message:
                            "Uploading the original directly to private storage. Nest is not proxying the bytes…"
                    )
                )
                try await uploadSourceFile(
                    job: job,
                    instruction: instruction,
                    baseURL: baseURL
                )
                job.phase = .finalizing
                job.restartUploadSession = false
                job.updatedAt = Date()
                try jobStore.save(job)
            } else if [
                "uploaded-unverified",
                "verifying",
                "verified",
            ].contains(stage) {
                job.phase =
                    stage == "verifying"
                        ? .verifying
                        : .finalizing
                job.restartUploadSession = false
                job.updatedAt = Date()
                try jobStore.save(job)
            } else {
                throw uploadError(
                    code: 4,
                    message:
                        created.error
                            ?? "Nest returned an unsupported upload stage: \(stage)."
                )
            }

            onUpdate(
                .init(
                    progress: 0.78,
                    message:
                        "Nest is verifying stored size and SHA-256 before creating editor records…"
                )
            )
            let verified = try await finalizeCanonicalUpload(
                job: job,
                finalizePath:
                    created.finalizeUrl
                        ?? "/api/mobile/capture/uploads/resumable/finalize",
                baseURL: baseURL,
                authenticatedData: authenticatedData,
                onUpdate: onUpdate
            )
            job.phase = .verified
            job.updatedAt = Date()
            job.restartUploadSession = false
            job.objectPath =
                verified.objectPath
                    ?? verified.objectName
                    ?? job.objectPath
            job.processingDisposition =
                verified.finalization?.processingDisposition
                    ?? verified.processingDisposition
            job.holdReason =
                verified.finalization?.holdReason
                    ?? verified.holdReason
            job.serverSourceID =
                verified.finalization?.sourceId
            job.serverMediaAssetID =
                verified.finalization?.mediaAssetId
            job.serverRecordingAssetID =
                verified.finalization?.recordingAssetId
            job.serverTranscriptJobID =
                verified.finalization?.transcriptJobId
            job.lastError = nil
            try jobStore.save(job)
            onUpdate(
                .init(
                    progress: 1,
                    message: job.userFacingVerificationSummary
                )
            )
            return job
        } catch {
            job.phase = .held
            job.restartUploadSession = true
            job.updatedAt = Date()
            job.lastError = error.localizedDescription
            try? jobStore.save(job)
            throw error
        }
    }

    private struct CreateRequest: Encodable {
        let uploadSessionId: String
        let captureId: String
        let captureGroupId: String
        let projectSlug: String?
        let episodeSlug: String?
        let fileName: String
        let contentType: String
        let sourceType: String
        let expectedSizeBytes: Int64
        let sha256: String
        let trackId: String
        let callRoomId: String
        let participantId: String
        let recordingConsentId: String
        let capturePurpose: String?
        let sourceProfileJson: String
        let startedAt: Date
        let stoppedAt: Date
        let restartUploadSession: Bool

        init(job: MacCaptureUploadJob) {
            uploadSessionId = job.id.uuidString.lowercased()
            captureId = job.captureID.uuidString.lowercased()
            captureGroupId =
                job.captureGroupID.uuidString.lowercased()
            projectSlug = job.projectSlug
            episodeSlug = job.episodeSlug
            fileName = job.fileName
            contentType = job.contentType
            sourceType = job.sourceType
            expectedSizeBytes = job.expectedSizeBytes
            sha256 = job.expectedSHA256
            trackId = job.trackID
            callRoomId = job.callRoomID
            participantId = job.participantID
            recordingConsentId = job.recordingConsentID
            capturePurpose = job.capturePurpose
            sourceProfileJson = job.sourceProfileJSON
            startedAt = job.startedAt
            stoppedAt = job.stoppedAt
            restartUploadSession =
                job.restartUploadSession
        }
    }

    private struct Envelope: Decodable {
        struct UploadInstruction: Decodable {
            let method: String?
            let url: String?
            let contentType: String?
            let contentLength: Int64?
        }

        struct Verification: Decodable {
            let computedSha256: String?
            let verifiedSizeBytes: Int64?
        }

        struct Finalization: Decodable {
            let sourceId: String?
            let mediaAssetId: String?
            let recordingAssetId: String?
            let transcriptJobId: String?
            let processingDisposition: String?
            let holdReason: String?
        }

        let ok: Bool?
        let canonical: Bool?
        let error: String?
        let uploadSessionId: String?
        let captureId: String?
        let captureGroupId: String?
        let uploadStage: String?
        let expectedSizeBytes: Int64?
        let expectedSha256: String?
        let upload: UploadInstruction?
        let finalizeUrl: String?
        let objectPath: String?
        let objectName: String?
        let verification: Verification?
        let finalization: Finalization?
        let processingDisposition: String?
        let holdReason: String?
    }

    private struct FinalizeRequest: Encodable {
        let uploadSessionId: String
    }

    private func createCanonicalUpload(
        job: MacCaptureUploadJob,
        baseURL: URL,
        authenticatedData: AuthenticatedData
    ) async throws -> Envelope {
        var request = URLRequest(
            url: baseURL.appending(
                path: "/api/mobile/capture/uploads/resumable"
            )
        )
        request.httpMethod = "POST"
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Content-Type"
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(
            CreateRequest(job: job)
        )
        let (data, response) = try await authenticatedData(
            request
        )
        let envelope = try JSONDecoder().decode(
            Envelope.self,
            from: data
        )
        guard (200 ..< 300).contains(response.statusCode),
              envelope.ok != false,
              envelope.canonical == true else {
            throw uploadError(
                code: response.statusCode,
                message:
                    envelope.error
                        ?? "Nest could not create the canonical upload."
            )
        }
        guard envelope.uploadSessionId?.lowercased()
                == job.id.uuidString.lowercased(),
              envelope.captureId?.lowercased()
                == job.captureID.uuidString.lowercased(),
              envelope.captureGroupId?.lowercased()
                == job.captureGroupID.uuidString.lowercased(),
              envelope.expectedSizeBytes
                == job.expectedSizeBytes,
              envelope.expectedSha256?.lowercased()
                == job.expectedSHA256 else {
            throw uploadError(
                code: 5,
                message:
                    "Nest returned an upload binding that does not match this source, take, size, or SHA-256 receipt."
            )
        }
        return envelope
    }

    private func uploadSourceFile(
        job: MacCaptureUploadJob,
        instruction: Envelope.UploadInstruction,
        baseURL: URL
    ) async throws {
        guard instruction.method?.uppercased() == "PUT",
              instruction.contentType?.lowercased()
                == job.contentType.lowercased(),
              instruction.contentLength
                == job.expectedSizeBytes,
              let rawURL = instruction.url.flatMap({
                  URL(string: $0)
              }),
              let capability = validatedUploadCapability(
                rawURL,
                baseURL: baseURL
              ) else {
            throw uploadError(
                code: 6,
                message:
                    "Nest returned an invalid or untrusted private-storage upload capability."
            )
        }
        var request = URLRequest(url: capability.url)
        request.httpMethod = "PUT"
        request.setValue(
            job.contentType,
            forHTTPHeaderField: "Content-Type"
        )
        request.setValue(
            String(job.expectedSizeBytes),
            forHTTPHeaderField: "Content-Length"
        )
        request.setValue(
            "bytes 0-\(job.expectedSizeBytes - 1)/\(job.expectedSizeBytes)",
            forHTTPHeaderField: "Content-Range"
        )
        if let localToken = capability.localDevelopmentToken {
            request.setValue(
                localToken,
                forHTTPHeaderField:
                    "X-Quipsly-Local-Capture-Capability"
            )
        }
        let (_, response) = try await URLSession.shared.upload(
            for: request,
            fromFile: job.localFileURL
        )
        guard let http = response as? HTTPURLResponse,
              (200 ..< 300).contains(http.statusCode) else {
            throw uploadError(
                code:
                    (response as? HTTPURLResponse)?.statusCode
                        ?? 7,
                message:
                    "Private storage did not acknowledge the complete file upload."
            )
        }
    }

    private func finalizeCanonicalUpload(
        job: MacCaptureUploadJob,
        finalizePath: String,
        baseURL: URL,
        authenticatedData: AuthenticatedData,
        onUpdate: UpdateHandler
    ) async throws -> Envelope {
        guard let endpoint = URL(
            string: finalizePath,
            relativeTo: baseURL
        )?.absoluteURL,
        endpoint.scheme?.lowercased()
            == baseURL.scheme?.lowercased(),
        endpoint.host?.lowercased()
            == baseURL.host?.lowercased(),
        endpoint.port == baseURL.port,
        endpoint.path
            == "/api/mobile/capture/uploads/resumable/finalize" else {
            throw uploadError(
                code: 8,
                message:
                    "Nest returned an invalid finalization address."
            )
        }
        for attempt in 0 ..< 5 {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "POST"
            request.setValue(
                "application/json",
                forHTTPHeaderField: "Content-Type"
            )
            request.httpBody = try JSONEncoder().encode(
                FinalizeRequest(
                    uploadSessionId:
                        job.id.uuidString.lowercased()
                )
            )
            let (data, response) = try await authenticatedData(
                request
            )
            let envelope = try JSONDecoder().decode(
                Envelope.self,
                from: data
            )
            let stage = envelope.uploadStage?.lowercased()
            if response.statusCode == 202
                || stage == "verifying" {
                var waiting = job
                waiting.phase = .verifying
                waiting.updatedAt = Date()
                try jobStore.save(waiting)
                onUpdate(
                    .init(
                        progress:
                            min(
                                0.96,
                                0.82 + Double(attempt) * 0.03
                            ),
                        message:
                            "Nest is still verifying the immutable storage generation…"
                    )
                )
                try await Task.sleep(
                    for: .seconds(1 + attempt)
                )
                continue
            }
            guard (200 ..< 300).contains(
                response.statusCode
            ),
            envelope.ok != false,
            stage == "verified",
            envelope.uploadSessionId?.lowercased()
                == job.id.uuidString.lowercased(),
            envelope.captureId?.lowercased()
                == job.captureID.uuidString.lowercased(),
            envelope.captureGroupId?.lowercased()
                == job.captureGroupID.uuidString.lowercased(),
            envelope.verification?.computedSha256?
                .lowercased() == job.expectedSHA256,
            envelope.verification?.verifiedSizeBytes
                == job.expectedSizeBytes else {
                throw uploadError(
                    code: response.statusCode,
                    message:
                        envelope.error
                            ?? "Nest did not return exact verified byte evidence for this source."
                )
            }
            return envelope
        }
        throw uploadError(
            code: 9,
            message:
                "Nest is still verifying the upload. Retry will continue from the durable job without deleting the local source."
        )
    }

    private struct ValidatedUploadCapability {
        let url: URL
        let localDevelopmentToken: String?
    }

    private func validatedUploadCapability(
        _ url: URL,
        baseURL: URL
    ) -> ValidatedUploadCapability? {
        let host = url.host?.lowercased() ?? ""
        if MacCanonicalCaptureUploadPolicy
            .isTrustedProductionStorageURL(url) {
            return .init(
                url: url,
                localDevelopmentToken: nil
            )
        }
        #if DEBUG
        guard ["127.0.0.1", "localhost", "::1"].contains(host),
              host == baseURL.host?.lowercased(),
              url.scheme?.lowercased()
                == baseURL.scheme?.lowercased(),
              url.port == baseURL.port,
              var components = URLComponents(
                url: url,
                resolvingAgainstBaseURL: false
              ),
              let token = components.queryItems?.first(where: {
                  $0.name == "token"
              })?.value,
              !token.isEmpty else {
            return nil
        }
        components.queryItems = nil
        guard let redacted = components.url else { return nil }
        return .init(
            url: redacted,
            localDevelopmentToken: token
        )
        #else
        return nil
        #endif
    }

    private func uploadError(
        code: Int,
        message: String
    ) -> NSError {
        NSError(
            domain: "QuipslyMacCaptureUpload",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}
#endif
