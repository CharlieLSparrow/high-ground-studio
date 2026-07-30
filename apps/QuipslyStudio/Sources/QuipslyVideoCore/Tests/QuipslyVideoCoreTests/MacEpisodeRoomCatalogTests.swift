import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
final class MacEpisodeRoomCatalogTests: XCTestCase {
    func testCanonicalTranscriptHandoffDecodesStableProviderAnchors() throws {
        let data = Data(
            """
            {
              "ok": true,
              "schema": "quipsly-canonical-transcript-handoff-v1",
              "roomId": "room-1",
              "transcriptJobId": "job-1",
              "source": {
                "recordingAssetId": "asset-1",
                "playbackUrl": "/api/playback/asset-1",
                "immutableProviderWords": true,
                "reviewedCorrectionsAreOverlays": true
              },
              "segments": [{
                "id": "segment-1",
                "speaker": "Charlie",
                "providerSpeaker": "speaker_0",
                "startTime": 1.25,
                "endTime": 2.75,
                "text": "Reviewed sentence.",
                "providerText": "Reviewd sentence.",
                "confidence": 0.96,
                "reviewStatus": "human-reviewed",
                "acceptedCorrectionId": "correction-1",
                "words": [{
                  "id": "word-1",
                  "providerWordIndex": 0,
                  "word": "Reviewed",
                  "rawWord": "reviewed",
                  "startTime": 1.25,
                  "endTime": 1.7,
                  "confidence": 0.97,
                  "speaker": "speaker_0",
                  "channel": 0,
                  "source": "deepgram-word-anchor"
                }]
              }]
            }
            """.utf8
        )

        let handoff = try JSONDecoder().decode(
            MacCanonicalTranscriptHandoffResponse.self,
            from: data
        )

        XCTAssertEqual(
            handoff.schema,
            "quipsly-canonical-transcript-handoff-v1"
        )
        XCTAssertEqual(handoff.transcriptJobId, "job-1")
        XCTAssertEqual(
            handoff.segments?.first?.reviewStatus,
            "human-reviewed"
        )
        XCTAssertEqual(
            handoff.segments?.first?.words.first?
                .providerWordIndex,
            0
        )
        XCTAssertEqual(
            handoff.segments?.first?.words.first?.source,
            "deepgram-word-anchor"
        )
        XCTAssertEqual(
            handoff.source?.immutableProviderWords,
            true
        )
    }

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
          "user": {
            "id": "user-1",
            "email": "charlie@example.com",
            "name": "Charlie",
            "isStaff": true
          },
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
            "recordingConsentId": "consent-1",
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
            "captureSources": [{
              "recordingAssetId": "recording-1",
              "uploadSessionId": "upload-1",
              "captureId": "capture-1",
              "captureGroupId": "take-1",
              "fileName": "charlie-master.wav",
              "kind": "LOCAL_AUDIO",
              "contentType": "audio/wav",
              "byteSize": "96000000",
              "durationSeconds": 1000,
              "recordingStatus": "VERIFIED",
              "exactBytesVerified": true,
              "byteVerificationKind": "server-size-and-sha256",
              "processingDisposition": "RELEASED",
              "transcriptDisposition": "RELEASED",
              "sourceId": "source-1",
              "mediaAssetId": "media-1",
              "playbackUrl": "/api/ingest/media/source-1",
              "alignment": {
                "status": "proposal-ready",
                "captureGroupId": "take-1",
                "sourceClockEvidence": "lowest-rtt-monotonic-projection",
                "method": "lowest-rtt-monotonic-server-projection-v1",
                "estimatedServerStartedAt": "2026-07-27T18:00:00.010Z",
                "uncertaintyMilliseconds": 52,
                "sampleAccurateClaimed": false,
                "reviewRequired": true,
                "reason": "Waveform and drift review are required.",
                "captureGroup": {
                  "baselineRecordingAssetId": "recording-1",
                  "baselineEstimatedServerStartedAt": "2026-07-27T18:00:00.010Z",
                  "estimatedOffsetMilliseconds": 0,
                  "proposalSourceCount": 2,
                  "sampleAccurateClaimed": false
                }
              },
              "proxy": {
                "required": false,
                "status": "not-required",
                "sourceOriginalPreserved": true
              },
              "transcript": {
                "id": "transcript-1",
                "status": "QUEUED",
                "provider": "pending",
                "segmentCount": 0
              }
            }],
            "unknownFutureField": {"keptByNest": true}
          }]
        }
        """

        let catalog = try JSONDecoder().decode(
            MacEpisodeRoomCatalogResponse.self,
            from: Data(payload.utf8)
        )

        XCTAssertTrue(catalog.ok)
        XCTAssertEqual(catalog.user?.email, "charlie@example.com")
        let episode = try XCTUnwrap(catalog.sessions?.first)
        XCTAssertEqual(episode.recordingConsentId, "consent-1")
        XCTAssertTrue(episode.safeToRecordLocally)
        XCTAssertEqual(episode.canonicalEpisodeSpaceID, "episode-5")
        XCTAssertEqual(
            episode.captureReadiness?.evidence,
            ["actor-consent-granted"]
        )
        let source = try XCTUnwrap(episode.captureSources?.first)
        XCTAssertEqual(source.recordingAssetId, "recording-1")
        XCTAssertEqual(source.captureGroupId, "take-1")
        XCTAssertEqual(source.alignment?.sampleAccurateClaimed, false)
        XCTAssertEqual(source.alignment?.uncertaintyMilliseconds, 52)
        XCTAssertEqual(
            source.alignment?.captureGroup?.baselineRecordingAssetId,
            "recording-1"
        )
        XCTAssertEqual(source.readinessLabel, "Alignment proposal ready")
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
