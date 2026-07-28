import Foundation
import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
final class MacAudioRoomReceiptTests: XCTestCase {
    func testRoomReceiptPreservesRouteTruthWithoutProviderSecret() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let receipt = MacAudioRoomEventReceipt(
            event: .joined,
            captureGroupID: UUID(),
            episodeSpaceID: "HGO Episode 5",
            callRoomID: "call-room-1",
            providerRoomName: "livekit-room-1",
            participantID: "charlie",
            coreAudioInputUID: "shure-mv7i-input-uid",
            coreAudioOutputUID: "shure-mv7i-output-uid",
            providerInputDeviceID: "shure-mv7i-input-uid",
            providerOutputDeviceID: "shure-mv7i-output-uid",
            directPhysicalMV7iClaimed: true,
            remoteParticipantCount: 1,
            failure:
                "Bearer secret-bearer participantToken=eyJabc.def.ghi api_secret=room-secret",
            observedProviderInputDeviceID:
                "shure-mv7i-input-uid",
            observedProviderOutputDeviceID:
                "shure-mv7i-output-uid"
        )

        let url = try MacAudioRoomReceiptWriter.write(receipt, root: root)
        let data = try Data(contentsOf: url)
        let text = String(decoding: data, as: UTF8.self)

        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        XCTAssertTrue(url.path.contains("hgo-episode-5/audio-room-events"))
        XCTAssertTrue(receipt.truth.contains("separate realtime call feed"))
        XCTAssertTrue(receipt.truth.contains("independent recorder graph"))
        XCTAssertFalse(text.lowercased().contains("participanttoken"))
        XCTAssertFalse(text.lowercased().contains("api_secret"))
        XCTAssertFalse(text.lowercased().contains("bearer"))
        XCTAssertFalse(text.contains("secret-bearer"))
        XCTAssertFalse(text.contains("eyJabc.def.ghi"))
        XCTAssertFalse(text.contains("room-secret"))
        XCTAssertTrue(text.contains("[redacted credential]"))

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(
            MacAudioRoomEventReceipt.self,
            from: data
        )
        XCTAssertEqual(decoded.event, .joined)
        XCTAssertEqual(decoded.callRoomID, "call-room-1")
        XCTAssertEqual(
            decoded.providerInputDeviceID,
            "shure-mv7i-input-uid"
        )
        XCTAssertEqual(decoded.protocolVersion, 2)
        XCTAssertEqual(decoded.routeIntegrity, .verified)
        XCTAssertEqual(
            decoded.observedProviderOutputDeviceID,
            "shure-mv7i-output-uid"
        )
    }

    func testRouteLossReceiptPreservesExpectedAndObservedRoutes() {
        let receipt = MacAudioRoomEventReceipt(
            event: .routeLost,
            captureGroupID: UUID(),
            episodeSpaceID: "HGO Episode 5",
            callRoomID: "call-room-1",
            providerRoomName: "livekit-room-1",
            participantID: "charlie",
            coreAudioInputUID: "mv7i",
            coreAudioOutputUID: "mv7i",
            providerInputDeviceID: "mv7i",
            providerOutputDeviceID: "mv7i",
            directPhysicalMV7iClaimed: true,
            remoteParticipantCount: 1,
            failure: "Provider changed the microphone.",
            observedProviderInputDeviceID: "macbook-mic",
            observedProviderOutputDeviceID: "mv7i",
            routeIntegrity: .lost
        )

        XCTAssertEqual(receipt.event, .routeLost)
        XCTAssertEqual(receipt.routeIntegrity, .lost)
        XCTAssertEqual(
            receipt.observedProviderInputDeviceID,
            "macbook-mic"
        )
        XCTAssertEqual(receipt.providerInputDeviceID, "mv7i")
        XCTAssertTrue(receipt.truth.contains("muted and left"))
        XCTAssertTrue(receipt.truth.contains("independent"))
    }

    func testRouteLossReceiptCanProveSelectedDeviceDisappeared() {
        let receipt = MacAudioRoomEventReceipt(
            event: .routeLost,
            captureGroupID: UUID(),
            episodeSpaceID: "HGO Episode 5",
            callRoomID: "call-room-1",
            providerRoomName: "livekit-room-1",
            participantID: "charlie",
            coreAudioInputUID: "mv7i",
            coreAudioOutputUID: "mv7i",
            providerInputDeviceID: "mv7i",
            providerOutputDeviceID: "mv7i",
            directPhysicalMV7iClaimed: true,
            remoteParticipantCount: 0,
            failure: "The selected interface disappeared.",
            observedProviderInputDeviceID: nil,
            observedProviderOutputDeviceID: nil,
            routeIntegrity: .lost
        )

        XCTAssertNil(receipt.observedProviderInputDeviceID)
        XCTAssertNil(receipt.observedProviderOutputDeviceID)
        XCTAssertEqual(receipt.providerInputDeviceID, "mv7i")
        XCTAssertEqual(receipt.providerOutputDeviceID, "mv7i")
    }

    func testVersionOneReceiptStillDecodesWithoutContinuityFields() throws {
        let receipt = MacAudioRoomEventReceipt(
            event: .joined,
            captureGroupID: UUID(),
            episodeSpaceID: "legacy-episode",
            callRoomID: "legacy-room",
            providerRoomName: "legacy-provider-room",
            participantID: "charlie",
            coreAudioInputUID: "legacy-input",
            coreAudioOutputUID: "legacy-output",
            providerInputDeviceID: "legacy-input",
            providerOutputDeviceID: "legacy-output",
            directPhysicalMV7iClaimed: false,
            remoteParticipantCount: 0,
            failure: nil
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        var object = try XCTUnwrap(
            JSONSerialization.jsonObject(
                with: encoder.encode(receipt)
            ) as? [String: Any]
        )
        object["protocolVersion"] = 1
        object.removeValue(forKey: "observedProviderInputDeviceID")
        object.removeValue(forKey: "observedProviderOutputDeviceID")
        object.removeValue(forKey: "routeIntegrity")

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(
            MacAudioRoomEventReceipt.self,
            from: JSONSerialization.data(withJSONObject: object)
        )

        XCTAssertEqual(decoded.protocolVersion, 1)
        XCTAssertNil(decoded.observedProviderInputDeviceID)
        XCTAssertNil(decoded.observedProviderOutputDeviceID)
        XCTAssertNil(decoded.routeIntegrity)
    }
}
#endif
