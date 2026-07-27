import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
final class MacEpisodeRoomCatalogTests: XCTestCase {
    func testSelectionPreservesExistingAuthorizedRoom() {
        let held = room(
            id: "held",
            canJoin: false,
            safeToRecord: false
        )
        let ready = room(
            id: "ready",
            canJoin: true,
            safeToRecord: true
        )

        XCTAssertEqual(
            MacEpisodeRoomSelectionPolicy.preferredRoomID(
                rooms: [ready, held],
                preserving: held.id
            ),
            held.id
        )
    }

    func testSelectionPrefersJoinableAndRecordableRoom() {
        let localOnly = room(
            id: "local-only",
            canJoin: false,
            safeToRecord: true
        )
        let ready = room(
            id: "ready",
            canJoin: true,
            safeToRecord: true
        )

        XCTAssertEqual(
            MacEpisodeRoomSelectionPolicy.preferredRoomID(
                rooms: [localOnly, ready],
                preserving: nil
            ),
            ready.id
        )
    }

    func testRefreshClearsAFormerRoomInsteadOfSilentlyChangingEpisodes() {
        let anotherRoom = room(
            id: "another-room",
            canJoin: true,
            safeToRecord: true
        )

        XCTAssertNil(
            MacEpisodeRoomSelectionPolicy.refreshedRoomID(
                rooms: [anotherRoom],
                previousID: "no-longer-authorized"
            )
        )
    }

    func testCanonicalIdentityNeverUsesEditableDisplayTitle() {
        let episode = MacEpisodeRoomSummary(
            id: "room-id",
            callRoomId: "call-room-id",
            title: "A human-facing title",
            projectSlug: "high-ground-odyssey",
            episodeSlug: "episode-5",
            participantId: "participant-1",
            recordingConsentGranted: true,
            canRecordNow: true
        )

        XCTAssertEqual(episode.canonicalEpisodeSpaceID, "episode-5")
        XCTAssertNotEqual(
            episode.canonicalEpisodeSpaceID,
            episode.title
        )
    }

    func testCaptureReadinessIsFailClosedForAuthorizedRoom() {
        let held = room(
            id: "held",
            canJoin: true,
            safeToRecord: false
        )

        XCTAssertFalse(held.safeToRecordLocally)
        XCTAssertTrue(held.canJoinProvider)
        XCTAssertEqual(held.readinessLabel, "Recording held")
    }

    func testCaptureReadinessRejectsInconsistentServerEvidence() {
        let inconsistent = MacEpisodeRoomSummary(
            id: "inconsistent",
            callRoomId: "inconsistent-call",
            title: "Inconsistent",
            providerCanJoin: true,
            recordingConsentStatus: "GRANTED",
            recordingConsentGranted: true,
            canRecordNow: true,
            captureReadiness: MacEpisodeRoomReadiness(
                safeToRecordLocally: false,
                providerCanJoin: true,
                detail: "A newer server verdict holds recording."
            )
        )

        XCTAssertFalse(inconsistent.safeToRecordLocally)
        XCTAssertEqual(
            inconsistent.readinessDetail,
            "A newer server verdict holds recording."
        )
    }

    func testCatalogDecodesTheNestMobileSessionsContract() throws {
        let payload = """
        {
          "ok": true,
          "user": {"id": "user-1"},
          "sessions": [{
            "id": "room-1",
            "callRoomId": "room-1",
            "title": "Episode 5",
            "purpose": "PODCAST",
            "provider": "livekit",
            "providerCanJoin": true,
            "projectSlug": "high-ground-odyssey",
            "projectName": "High Ground Odyssey",
            "episodeSlug": "episode-5",
            "participantId": "participant-1",
            "recordingConsentStatus": "GRANTED",
            "recordingConsentGranted": true,
            "canRecordNow": true,
            "captureReadiness": {
              "status": "ready-provider",
              "label": "Ready to join",
              "safeToRecordLocally": true,
              "providerCanJoin": true,
              "detail": "Consent and room evidence are current.",
              "blockers": [],
              "evidence": ["actor-consent-granted"]
            },
            "unknownFutureField": {"keptByNest": true}
          }]
        }
        """

        let catalog = try JSONDecoder().decode(
            MacEpisodeRoomCatalogResponse.self,
            from: Data(payload.utf8)
        )

        XCTAssertTrue(catalog.ok)
        let episode = try XCTUnwrap(catalog.sessions?.first)
        XCTAssertTrue(episode.safeToRecordLocally)
        XCTAssertEqual(episode.canonicalEpisodeSpaceID, "episode-5")
        XCTAssertEqual(
            episode.captureReadiness?.evidence,
            ["actor-consent-granted"]
        )
    }

    private func room(
        id: String,
        canJoin: Bool,
        safeToRecord: Bool
    ) -> MacEpisodeRoomSummary {
        MacEpisodeRoomSummary(
            id: id,
            callRoomId: "\(id)-call",
            title: id.capitalized,
            provider: "livekit",
            providerCanJoin: canJoin,
            projectSlug: "high-ground-odyssey",
            recordingConsentStatus:
                safeToRecord ? "GRANTED" : "PENDING",
            recordingConsentGranted: safeToRecord,
            canRecordNow: safeToRecord,
            captureReadiness: MacEpisodeRoomReadiness(
                safeToRecordLocally: safeToRecord,
                providerCanJoin: canJoin
            )
        )
    }
}
#endif
