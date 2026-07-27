import Foundation
import XCTest
@testable import QuipslyVideoCore

@MainActor
final class ProductionCaptureClockClientTests: XCTestCase {
    func testClockSampleWritesLosslessStringsAndReadsLegacyNumbers()
        throws
    {
        let sample = ProductionCaptureClockSample(
            protocolVersion: 1,
            sampleId: UUID(),
            callRoomId: "room-5",
            captureGroupId: UUID(),
            clientKind: "macos",
            deviceWallSentAt:
                Date(timeIntervalSince1970: 100.125),
            deviceMonotonicSentNanoseconds: UInt64.max - 1,
            serverReceivedAt:
                Date(timeIntervalSince1970: 100.135),
            serverSentAt:
                Date(timeIntervalSince1970: 100.136),
            deviceWallReceivedAt:
                Date(timeIntervalSince1970: 100.146),
            deviceMonotonicReceivedNanoseconds: UInt64.max,
            networkRoundTripMilliseconds: 20,
            serverOffsetMilliseconds: 0,
            uncertaintyMilliseconds: 10,
            wallClockDiscontinuityMilliseconds: 0
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom(
            ProductionCaptureDateCoding.encode
        )
        let encoded = try encoder.encode(sample)
        let object = try XCTUnwrap(
            JSONSerialization.jsonObject(with: encoded)
                as? [String: Any]
        )
        XCTAssertEqual(
            object["deviceMonotonicSentNanoseconds"] as? String,
            String(UInt64.max - 1)
        )
        XCTAssertEqual(
            object["deviceMonotonicReceivedNanoseconds"] as? String,
            String(UInt64.max)
        )
        XCTAssertTrue(
            try XCTUnwrap(
                object["deviceWallSentAt"] as? String
            ).contains(".125")
        )

        var legacy = object
        legacy["deviceMonotonicSentNanoseconds"] = 500
        legacy["deviceMonotonicReceivedNanoseconds"] = 521
        let legacyData = try JSONSerialization.data(
            withJSONObject: legacy
        )
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(
            ProductionCaptureDateCoding.decode
        )
        let reopened = try decoder.decode(
            ProductionCaptureClockSample.self,
            from: legacyData
        )
        XCTAssertEqual(
            reopened.deviceMonotonicSentNanoseconds,
            500
        )
        XCTAssertEqual(
            reopened.deviceMonotonicReceivedNanoseconds,
            521
        )
    }

    func testBurstPreservesExactRoomTakeAndLosslessClockIdentity()
        async throws
    {
        let captureGroupID = UUID()
        let client = ProductionCaptureClockClient(
            clientKind: "macos"
        )
        let samples = await client.measureBurst(
            baseURL: URL(string: "https://nest.example")!,
            callRoomID: "room-5",
            captureGroupID: captureGroupID
        ) { request in
            let payload = try XCTUnwrap(request.httpBody)
            let body = try XCTUnwrap(
                JSONSerialization.jsonObject(with: payload)
                    as? [String: Any]
            )
            XCTAssertEqual(
                request.url?.path,
                "/api/mobile/capture/clock-sample"
            )
            XCTAssertEqual(body["callRoomId"] as? String, "room-5")
            XCTAssertEqual(body["clientKind"] as? String, "macos")
            XCTAssertNotNil(
                UInt64(
                    try XCTUnwrap(
                        body["deviceMonotonicSentNanoseconds"]
                            as? String
                    )
                )
            )
            let sent = try XCTUnwrap(
                body["deviceWallSentAt"] as? String
            )
            let responseBody: [String: Any] = [
                "ok": true,
                "protocolVersion":
                    try XCTUnwrap(body["protocolVersion"]),
                "sampleId": try XCTUnwrap(body["sampleId"]),
                "callRoomId": try XCTUnwrap(body["callRoomId"]),
                "captureGroupId":
                    try XCTUnwrap(body["captureGroupId"]),
                "clientKind": try XCTUnwrap(body["clientKind"]),
                "deviceWallSentAt": sent,
                "deviceMonotonicSentNanoseconds":
                    try XCTUnwrap(
                        body["deviceMonotonicSentNanoseconds"]
                    ),
                "serverReceivedAt": sent,
                "serverSentAt": sent,
            ]
            let data = try JSONSerialization.data(
                withJSONObject: responseBody
            )
            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: "HTTP/1.1",
                    headerFields: nil
                )
            )
            return (data, response)
        }

        XCTAssertEqual(samples.count, 3)
        XCTAssertEqual(
            Set(samples.map(\.sampleId)).count,
            3
        )
        XCTAssertTrue(samples.allSatisfy {
            $0.callRoomId == "room-5"
                && $0.captureGroupId == captureGroupID
                && $0.clientKind == "macos"
                && $0.deviceMonotonicReceivedNanoseconds
                    >= $0.deviceMonotonicSentNanoseconds
        })
    }

    func testIdentityMismatchDropsEvidenceInsteadOfCrossingRooms()
        async throws
    {
        let client = ProductionCaptureClockClient(
            clientKind: "macos",
            burstCount: 1
        )
        let samples = await client.measureBurst(
            baseURL: URL(string: "https://nest.example")!,
            callRoomID: "room-5",
            captureGroupID: UUID()
        ) { request in
            let payload = try XCTUnwrap(request.httpBody)
            var body = try XCTUnwrap(
                JSONSerialization.jsonObject(with: payload)
                    as? [String: Any]
            )
            body["ok"] = true
            body["callRoomId"] = "other-room"
            body["serverReceivedAt"] =
                try XCTUnwrap(body["deviceWallSentAt"])
            body["serverSentAt"] =
                try XCTUnwrap(body["deviceWallSentAt"])
            let data = try JSONSerialization.data(
                withJSONObject: body
            )
            let response = try XCTUnwrap(
                HTTPURLResponse(
                    url: try XCTUnwrap(request.url),
                    statusCode: 200,
                    httpVersion: "HTTP/1.1",
                    headerFields: nil
                )
            )
            return (data, response)
        }

        XCTAssertTrue(samples.isEmpty)
    }
}
