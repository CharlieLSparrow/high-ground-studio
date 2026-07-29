import Foundation

@main
enum CaptureNestSourceEvidenceContractTests {
    static func main() throws {
        try testVerifiedMatch()
        try testHashDriftWins()
        try testProcessingHoldStaysDistinct()
        try testMissingSourceIsIncomplete()
        try testAmbiguousSourceIsDrift()
        try testWrongAuthorityFailsClosed()
        try testWrongRoomFailsClosed()
        try testMalformedHashFailsClosed()
        try testUnknownStatusFailsClosed()
        try testInconsistentCountsFailClosed()
        print("PASS 10 Capture Nest source-evidence contract tests")
    }

    private static func testVerifiedMatch() throws {
        let receipt = try decode()
        let comparison = try CaptureNestSourceEvidenceContract.compare(
            local: local(),
            nest: receipt,
            now: date("2026-07-29T15:01:00.000Z")
        )
        expect(comparison.status == .verifiedMatch, "exact evidence should verify")
        expect(comparison.issues.isEmpty, "exact evidence should have no issues")
        expect(comparison.recordingAssetID == "asset-1", "asset identity should survive comparison")
    }

    private static func testHashDriftWins() throws {
        var source = validSource()
        var cloud = source["cloud"] as! [String: Any]
        cloud["sha256"] = String(repeating: "b", count: 64)
        source["cloud"] = cloud
        let receipt = try decode(sources: [source])
        let comparison = try CaptureNestSourceEvidenceContract.compare(
            local: local(),
            nest: receipt
        )
        expect(comparison.status == .drift, "hash mismatch must be drift")
        expect(
            comparison.issues.contains(where: { $0.contains("SHA-256") }),
            "hash drift should be explicit"
        )
    }

    private static func testProcessingHoldStaysDistinct() throws {
        var source = validSource()
        source["status"] = "HELD"
        source["processingDisposition"] = "HELD"
        source["issues"] = ["Processing is held for human review."]
        let receipt = try decode(sources: [source])
        let comparison = try CaptureNestSourceEvidenceContract.compare(
            local: local(),
            nest: receipt
        )
        expect(comparison.status == .held, "processing hold must not imply byte drift")
    }

    private static func testMissingSourceIsIncomplete() throws {
        let receipt = try decode(sources: [])
        let comparison = try CaptureNestSourceEvidenceContract.compare(
            local: local(),
            nest: receipt
        )
        expect(comparison.status == .incomplete, "a not-yet-projected source should be incomplete")
    }

    private static func testAmbiguousSourceIsDrift() throws {
        var duplicate = validSource()
        duplicate["recordingAssetId"] = "asset-2"
        let receipt = try decode(sources: [validSource(), duplicate])
        let comparison = try CaptureNestSourceEvidenceContract.compare(
            local: local(),
            nest: receipt
        )
        expect(comparison.status == .drift, "two rows for one capture identity must fail closed")
    }

    private static func testWrongAuthorityFailsClosed() throws {
        expectThrows {
            _ = try decode(authority: "phone-import")
        }
    }

    private static func testWrongRoomFailsClosed() throws {
        expectThrows {
            _ = try decode(roomID: "other-room")
        }
    }

    private static func testMalformedHashFailsClosed() throws {
        var source = validSource()
        var cloud = source["cloud"] as! [String: Any]
        cloud["sha256"] = "not-a-hash"
        source["cloud"] = cloud
        expectThrows {
            _ = try decode(sources: [source])
        }
    }

    private static func testUnknownStatusFailsClosed() throws {
        var source = validSource()
        source["status"] = "PROBABLY_FINE"
        expectThrows {
            _ = try decode(sources: [source])
        }
    }

    private static func testInconsistentCountsFailClosed() throws {
        let body: [String: Any] = [
            "schema": "quipsly-nest-source-evidence",
            "version": 1,
            "generatedAt": "2026-07-29T15:00:00.000Z",
            "authority": "nest-independent-projection",
            "roomId": "room-1",
            "phoneReceiptImportedAsAuthority": false,
            "evidence": [
                "sources": [validSource()],
                "counts": [
                    "VERIFIED_MATCH": 0,
                    "HELD": 0,
                    "DRIFT": 0,
                    "INCOMPLETE": 0,
                ],
            ],
        ]
        let data = try JSONSerialization.data(withJSONObject: body)
        expectThrows {
            _ = try CaptureNestSourceEvidenceContract.decode(
                data,
                expectedRoomID: "room-1"
            )
        }
    }

    private static func decode(
        roomID: String = "room-1",
        authority: String = "nest-independent-projection",
        sources: [[String: Any]] = [validSource()]
    ) throws -> CaptureNestSourceEvidenceReceipt {
        let body: [String: Any] = [
            "schema": "quipsly-nest-source-evidence",
            "version": 1,
            "generatedAt": "2026-07-29T15:00:00.000Z",
            "authority": authority,
            "roomId": roomID,
            "phoneReceiptImportedAsAuthority": false,
            "evidence": [
                "sources": sources,
                "counts": [
                    "VERIFIED_MATCH": sources.filter { $0["status"] as? String == "VERIFIED_MATCH" }.count,
                    "HELD": sources.filter { $0["status"] as? String == "HELD" }.count,
                    "DRIFT": sources.filter { $0["status"] as? String == "DRIFT" }.count,
                    "INCOMPLETE": sources.filter { $0["status"] as? String == "INCOMPLETE" }.count,
                ],
            ],
        ]
        let data = try JSONSerialization.data(
            withJSONObject: body,
            options: [.sortedKeys]
        )
        return try CaptureNestSourceEvidenceContract.decode(
            data,
            expectedRoomID: "room-1"
        )
    }

    private static func validSource() -> [String: Any] {
        [
            "recordingAssetId": "asset-1",
            "fileName": "capture.m4a",
            "kind": "LOCAL_TRACK",
            "recordingStatus": "VERIFIED",
            "status": "VERIFIED_MATCH",
            "captureId": "11111111-1111-1111-1111-111111111111",
            "captureGroupId": "22222222-2222-2222-2222-222222222222",
            "uploadSessionId": "11111111-1111-1111-1111-111111111111",
            "startBoundary": [
                "receiptId": "33333333-3333-3333-3333-333333333333",
                "occurredAt": "2026-07-29T14:00:00.000Z",
            ],
            "stopBoundary": [
                "receiptId": "44444444-4444-4444-4444-444444444444",
                "occurredAt": "2026-07-29T14:10:00.000Z",
            ],
            "cloud": [
                "sha256": String(repeating: "a", count: 64),
                "byteSize": "4096",
                "generation": "1785333600000",
                "bucket": "private-capture",
                "objectPath": "room-1/asset-1.m4a",
                "verifiedAt": "2026-07-29T14:11:00.000Z",
            ],
            "captureRuntime": [
                "appVersion": "1.0",
                "appBuild": "10",
                "deviceModel": "iPhone17,3",
                "operatingSystem": "iOS 26.2",
                "audioRoute": "Built-in Microphone",
            ],
            "processingDisposition": "RELEASED",
            "transcriptDisposition": "RELEASED",
            "issues": [],
        ]
    }

    private static func local() -> CaptureNestLocalEvidence {
        CaptureNestLocalEvidence(
            sourceID: "11111111-1111-1111-1111-111111111111",
            roomID: "room-1",
            recordingAssetIDs: ["asset-1"],
            captureGroupID: "22222222-2222-2222-2222-222222222222",
            startReceiptID: "33333333-3333-3333-3333-333333333333",
            stopReceiptID: "44444444-4444-4444-4444-444444444444",
            computedSHA256: String(repeating: "a", count: 64),
            computedByteCount: 4096,
            verifiedCloudSHA256: String(repeating: "a", count: 64),
            verifiedCloudSizeBytes: 4096,
            verifiedCloudGeneration: "1785333600000",
            canonicalObjectPath: "room-1/asset-1.m4a",
            localTruthChecksPass: true
        )
    }

    private static func date(_ value: String) -> Date {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.date(from: value)!
    }

    private static func expect(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) {
        guard condition() else {
            fatalError("FAIL \(message)")
        }
    }

    private static func expectThrows(_ operation: () throws -> Void) {
        do {
            try operation()
            fatalError("FAIL expected operation to throw")
        } catch {
            return
        }
    }
}
