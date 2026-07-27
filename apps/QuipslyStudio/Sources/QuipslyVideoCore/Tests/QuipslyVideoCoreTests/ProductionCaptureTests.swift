import XCTest
@testable import QuipslyVideoCore

final class ProductionCaptureTests: XCTestCase {
    private let mv7i = CaptureAudioDeviceSnapshot(
        id: "Shure-MV7i",
        name: "Shure MV7i",
        manufacturer: "Shure",
        inputChannels: 2,
        outputChannels: 2,
        nominalSampleRate: 48_000,
        isDefaultInput: true,
        isDefaultOutput: true
    )

    func testCanonR8USBIsTruthfullyA1080ReferenceNotA4KMaster() {
        let camera = CaptureVideoDeviceSnapshot(
            id: "canon-r8",
            name: "Canon EOS R8",
            manufacturer: "Canon",
            formats: [
                CaptureVideoFormatSnapshot(
                    width: 1_920,
                    height: 1_080,
                    maximumFrameRate: 30,
                    mediaSubType: "420v"
                )
            ]
        )

        let result = ProductionCapturePolicy.assessVideo(
            camera,
            authorization: .authorized
        )

        XCTAssertEqual(result.role, .previewReference)
        XCTAssertEqual(result.status, .reviewRequired)
        XCTAssertTrue(result.truth.contains("never as a 4K master"))
        XCTAssertTrue(result.warnings.contains { $0.contains("internally") })
    }

    func testMV7iOwnsLocalMasterAndSameDeviceHeadphoneRoute() {
        let result = ProductionCapturePolicy.assessAudio(
            input: mv7i,
            output: mv7i,
            authorization: .authorized
        )

        XCTAssertEqual(result.master.status, .ready)
        XCTAssertEqual(result.master.role, .localMaster)
        XCTAssertTrue(result.master.truth.contains("48 kHz"))
        XCTAssertEqual(result.callRoute.status, .ready)
        XCTAssertTrue(result.callRoute.truth.contains("same MV7i"))
    }

    func testMOTIVMixVirtualDoesNotBecomePhysicalMV7iProof() {
        let virtual = CaptureAudioDeviceSnapshot(
            id: "motiv-mix-virtual",
            name: "MOTIV Mix Virtual",
            manufacturer: "Shure Inc",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )

        let result = ProductionCapturePolicy.assessAudio(
            input: virtual,
            output: virtual,
            authorization: .authorized
        )

        XCTAssertEqual(result.master.status, .reviewRequired)
        XCTAssertEqual(result.callRoute.status, .reviewRequired)
        XCTAssertTrue(result.master.truth.contains("not proof"))
        XCTAssertTrue(result.callRoute.truth.contains("virtual mixer"))
        XCTAssertFalse(
            result.callRoute.truth.contains("return through the same MV7i")
        )
    }

    func testSplitCallOutputRequiresReviewInsteadOfClaimingEchoSafeRouting() {
        let speakers = CaptureAudioDeviceSnapshot(
            id: "mac-speakers",
            name: "MacBook Pro Speakers",
            inputChannels: 0,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )

        let result = ProductionCapturePolicy.assessAudio(
            input: mv7i,
            output: speakers,
            authorization: .authorized
        )

        XCTAssertEqual(result.master.status, .ready)
        XCTAssertEqual(result.callRoute.status, .reviewRequired)
        XCTAssertTrue(result.callRoute.truth.contains("split"))
    }

    func testReported4KNeedsLongTakeQualification() {
        let camera = CaptureVideoDeviceSnapshot(
            id: "capture-card",
            name: "Generic HDMI Capture",
            formats: [
                CaptureVideoFormatSnapshot(
                    width: 3_840,
                    height: 2_160,
                    maximumFrameRate: 60,
                    mediaSubType: "420v"
                )
            ]
        )

        let result = ProductionCapturePolicy.assessVideo(
            camera,
            authorization: .authorized
        )

        XCTAssertEqual(result.role, .needsQualification)
        XCTAssertEqual(result.status, .reviewRequired)
        XCTAssertTrue(result.warnings.contains { $0.contains("60-minute") })
    }

    func testPlanDoesNotBecomeReadyWithoutAnAudioMaster() {
        let inventory = ProductionCaptureInventory(
            cameraAuthorization: .authorized,
            microphoneAuthorization: .authorized,
            videoDevices: [],
            audioDevices: []
        )

        let plan = ProductionCapturePolicy.buildPlan(
            inventory: inventory,
            videoDeviceID: nil,
            audioInputID: nil,
            audioOutputID: nil
        )

        XCTAssertEqual(plan.status, .blocked)
        XCTAssertTrue(plan.nextActions.contains { $0.contains("microphone") })
    }

    func testCompanionRoomBindingRequiresExactSameTakeAgreement()
        throws
    {
        let groupID = UUID()
        let first = try XCTUnwrap(
            ProductionCaptureRoomBinding(
                captureGroupID: groupID,
                episodeSpaceID: "episode-5",
                participantID: "charlie",
                ownerAccountID: "Charlie@Example.com",
                callRoomID: "room-5",
                recordingConsentID: "consent-5",
                startReceiptID: UUID()
            )
        )

        XCTAssertEqual(
            ProductionCaptureRoomBinding.exactCompanionBinding(
                candidates: [first, nil, first],
                captureGroupID: groupID,
                episodeSpaceID: " episode-5 ",
                participantID: "charlie"
            ),
            first
        )
        XCTAssertNil(
            ProductionCaptureRoomBinding.exactCompanionBinding(
                candidates: [
                    first,
                    ProductionCaptureRoomBinding(
                        captureGroupID: groupID,
                        episodeSpaceID: "episode-5",
                        participantID: "charlie",
                        ownerAccountID: first.ownerAccountID,
                        callRoomID: "different-room",
                        recordingConsentID:
                            first.recordingConsentID,
                        startReceiptID:
                            first.startReceiptID
                    ),
                ],
                captureGroupID: groupID,
                episodeSpaceID: "episode-5",
                participantID: "charlie"
            )
        )
        XCTAssertNil(
            ProductionCaptureRoomBinding.exactCompanionBinding(
                candidates: [first],
                captureGroupID: UUID(),
                episodeSpaceID: "episode-5",
                participantID: "charlie"
            )
        )
        XCTAssertNil(
            ProductionCaptureRoomBinding.exactCompanionBinding(
                candidates: [
                    first,
                    ProductionCaptureRoomBinding(
                        captureGroupID: UUID(),
                        episodeSpaceID: "episode-5",
                        participantID: "charlie",
                        ownerAccountID: first.ownerAccountID,
                        callRoomID: first.callRoomID,
                        recordingConsentID:
                            first.recordingConsentID,
                        startReceiptID:
                            first.startReceiptID
                    ),
                ],
                captureGroupID: groupID,
                episodeSpaceID: "episode-5",
                participantID: "charlie"
            )
        )
    }

    func testRoomBindingDecoderRejectsIncompleteAuthority()
        throws
    {
        let data = try JSONSerialization.data(
            withJSONObject: [
                "captureGroupID": UUID().uuidString,
                "episodeSpaceID": "episode-5",
                "participantID": "charlie",
                "ownerAccountID": "   ",
                "callRoomID": "room-5",
                "recordingConsentID": "consent-5",
                "startReceiptID": UUID().uuidString,
            ],
            options: [.sortedKeys]
        )

        XCTAssertThrowsError(
            try JSONDecoder().decode(
                ProductionCaptureRoomBinding.self,
                from: data
            )
        )
    }
}
