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
                "Bearer secret-bearer participantToken=eyJabc.def.ghi api_secret=room-secret"
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
    }
}
#endif
