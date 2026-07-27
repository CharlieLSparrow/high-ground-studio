import Foundation
import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
@MainActor
final class MacCanonicalCaptureUploaderTests: XCTestCase {
    func testProductionStorageTrustRequiresExactGoogleStorageHTTPSHost() {
        XCTAssertTrue(
            MacCanonicalCaptureUploadPolicy
                .isTrustedProductionStorageURL(
                    URL(
                        string:
                            "https://storage.googleapis.com/quipsly-private/source.wav?signature=redacted"
                    )!
                )
        )
        XCTAssertTrue(
            MacCanonicalCaptureUploadPolicy
                .isTrustedProductionStorageURL(
                    URL(
                        string:
                            "https://quipsly-private.storage.googleapis.com/source.wav"
                    )!
                )
        )

        XCTAssertFalse(
            MacCanonicalCaptureUploadPolicy
                .isTrustedProductionStorageURL(
                    URL(
                        string:
                            "http://storage.googleapis.com/quipsly-private/source.wav"
                    )!
                )
        )
        XCTAssertFalse(
            MacCanonicalCaptureUploadPolicy
                .isTrustedProductionStorageURL(
                    URL(
                        string:
                            "https://storage.googleapis.com.attacker.example/source.wav"
                    )!
                )
        )
        XCTAssertFalse(
            MacCanonicalCaptureUploadPolicy
                .isTrustedProductionStorageURL(
                    URL(
                        string:
                            "https://attackerstorage.googleapis.com/source.wav"
                    )!
                )
        )
    }

    func testVerifiedServerRecoveryCommitsExactCanonicalEvidence()
        async throws
    {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "quipsly-canonical-uploader-\(UUID().uuidString)",
                isDirectory: true
            )
        defer { try? FileManager.default.removeItem(at: root) }
        try FileManager.default.createDirectory(
            at: root,
            withIntermediateDirectories: true
        )
        let sourceURL = root.appendingPathComponent("master.wav")
        try Data("verified-wave-bytes".utf8).write(to: sourceURL)
        let job = MacCaptureUploadJob(
            id: UUID(),
            ownerAccountID: "charlie@example.com",
            captureID: UUID(),
            captureGroupID: UUID(),
            filePath: sourceURL.path,
            sourceReceiptPath:
                root.appendingPathComponent("source-receipt.json")
                    .path,
            fileName: "master.wav",
            contentType: "audio/wav",
            sourceType: "audio",
            expectedSizeBytes: 19,
            expectedSHA256:
                "ba234af15d4d1776399b42a7a8f084e79f04a93dc062e2be1d77f7510d5c7415",
            projectSlug: "high-ground-odyssey",
            episodeSlug: "episode-5",
            trackID: "charlie-microphone-master",
            callRoomID: "room-5",
            participantID: "participant-5",
            recordingConsentID: "consent-5",
            capturePurpose: "PODCAST",
            sourceProfileJSON: #"{"sampleRate":48000}"#,
            startedAt: Date(timeIntervalSince1970: 100),
            stoppedAt: Date(timeIntervalSince1970: 102)
        )
        let store = MacCaptureUploadJobStore(
            rootDirectory: root
        )
        try store.save(job)
        let uploader = MacCanonicalCaptureUploader(
            jobStore: store
        )
        let baseURL = URL(string: "https://nest.quipsly.com")!
        var requestPaths: [String] = []
        var updates: [MacCanonicalCaptureUploadUpdate] = []

        let verified = try await uploader.upload(
            jobID: job.id,
            ownerAccountID: job.ownerAccountID,
            baseURL: baseURL,
            authenticatedData: { request in
                let path = try XCTUnwrap(request.url?.path)
                requestPaths.append(path)
                let body: String
                if path
                    == "/api/mobile/capture/uploads/resumable" {
                    body = """
                    {
                      "ok": true,
                      "canonical": true,
                      "uploadSessionId": "\(job.id.uuidString.lowercased())",
                      "captureId": "\(job.captureID.uuidString.lowercased())",
                      "captureGroupId": "\(job.captureGroupID.uuidString.lowercased())",
                      "uploadStage": "verified",
                      "expectedSizeBytes": \(job.expectedSizeBytes),
                      "expectedSha256": "\(job.expectedSHA256)",
                      "objectName": "capture/original.wav",
                      "finalizeUrl": "/api/mobile/capture/uploads/resumable/finalize"
                    }
                    """
                } else {
                    body = """
                    {
                      "ok": true,
                      "canonical": true,
                      "uploadSessionId": "\(job.id.uuidString.lowercased())",
                      "captureId": "\(job.captureID.uuidString.lowercased())",
                      "captureGroupId": "\(job.captureGroupID.uuidString.lowercased())",
                      "uploadStage": "verified",
                      "objectName": "capture/original.wav",
                      "verification": {
                        "computedSha256": "\(job.expectedSHA256)",
                        "verifiedSizeBytes": \(job.expectedSizeBytes)
                      },
                      "finalization": {
                        "sourceId": "source-5",
                        "mediaAssetId": "media-5",
                        "recordingAssetId": "recording-5",
                        "transcriptJobId": "transcript-5",
                        "processingDisposition": "READY"
                      }
                    }
                    """
                }
                return (
                    Data(body.utf8),
                    HTTPURLResponse(
                        url: try XCTUnwrap(request.url),
                        statusCode: 200,
                        httpVersion: "HTTP/1.1",
                        headerFields: nil
                    )!
                )
            },
            onUpdate: { updates.append($0) }
        )

        XCTAssertEqual(verified.phase, .verified)
        XCTAssertEqual(verified.serverSourceID, "source-5")
        XCTAssertEqual(verified.serverMediaAssetID, "media-5")
        XCTAssertEqual(
            verified.serverRecordingAssetID,
            "recording-5"
        )
        XCTAssertEqual(
            verified.serverTranscriptJobID,
            "transcript-5"
        )
        XCTAssertEqual(verified.objectPath, "capture/original.wav")
        XCTAssertEqual(verified.attemptCount, 1)
        XCTAssertEqual(
            requestPaths,
            [
                "/api/mobile/capture/uploads/resumable",
                "/api/mobile/capture/uploads/resumable/finalize",
            ]
        )
        XCTAssertEqual(updates.last?.progress, 1)

        let reopened = MacCaptureUploadJobStore(
            rootDirectory: root
        )
        let reopenedJob = try XCTUnwrap(
            reopened.job(
                id: job.id,
                ownerAccountID: job.ownerAccountID
            )
        )
        XCTAssertEqual(reopenedJob.phase, .verified)
        XCTAssertEqual(
            reopenedJob.expectedSHA256,
            verified.expectedSHA256
        )
        XCTAssertEqual(
            reopenedJob.expectedSizeBytes,
            verified.expectedSizeBytes
        )
        XCTAssertEqual(
            reopenedJob.serverSourceID,
            verified.serverSourceID
        )
    }
}
#endif
