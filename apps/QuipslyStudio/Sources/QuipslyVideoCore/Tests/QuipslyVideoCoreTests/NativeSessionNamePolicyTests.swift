import XCTest
@testable import QuipslyVideoCore

final class NativeSessionNamePolicyTests: XCTestCase {
    func testNormalizesBlankNamesToAutosave() {
        XCTAssertEqual(
            NativeSessionNamePolicy.normalized(" \n "),
            "autosave"
        )
    }

    func testRecognizesOnlyExplicitWorkingSessionConventions() {
        XCTAssertTrue(
            NativeSessionNamePolicy.isMutableWorkingSession("autosave")
        )
        XCTAssertTrue(
            NativeSessionNamePolicy.isMutableWorkingSession(
                "episode-4-proxy-recovery-working"
            )
        )
        XCTAssertTrue(
            NativeSessionNamePolicy.isMutableWorkingSession(
                "episode-4-working-20260728T120000000Z-acde1234"
            )
        )
        XCTAssertFalse(
            NativeSessionNamePolicy.isMutableWorkingSession(
                "episode-4-producer-v016"
            )
        )
        XCTAssertFalse(
            NativeSessionNamePolicy.isMutableWorkingSession(
                "working-notes"
            )
        )
    }

    func testBuildsDeterministicUniqueWorkingCopyNameForCheckpoint() {
        let name = NativeSessionNamePolicy.workingCopyName(
            checkpointName: "episode-4-producer-v016",
            createdAt: Date(timeIntervalSince1970: 0),
            nonce: UUID(
                uuidString: "00112233-4455-6677-8899-AABBCCDDEEFF"
            )!
        )

        XCTAssertEqual(
            name,
            "episode-4-producer-v016-working-19700101T000000000Z-00112233"
        )
        XCTAssertTrue(
            NativeSessionNamePolicy.isMutableWorkingSession(name)
        )
    }

    func testWorkingCopyNamingIsIdempotentForExistingWorkingSession() {
        XCTAssertEqual(
            NativeSessionNamePolicy.workingCopyName(
                checkpointName: "episode-4-proxy-recovery-working",
                createdAt: Date(timeIntervalSince1970: 0),
                nonce: UUID()
            ),
            "episode-4-proxy-recovery-working"
        )
    }

    func testWorkingCopyNameFitsCommonFilesystemComponentLimit() {
        for checkpointName in [
            String(repeating: "a", count: 400),
            String(repeating: "界", count: 400)
        ] {
            let name = NativeSessionNamePolicy.workingCopyName(
                checkpointName: checkpointName,
                createdAt: Date(timeIntervalSince1970: 0),
                nonce: UUID(
                    uuidString: "00112233-4455-6677-8899-AABBCCDDEEFF"
                )!
            )

            XCTAssertLessThanOrEqual(
                "\(name).quipsly-session.json".utf8.count,
                255
            )
            XCTAssertTrue(name.hasSuffix("-00112233"))
        }
    }

    func testRoleLabelMatchesMutationPolicy() {
        XCTAssertEqual(
            NativeSessionNamePolicy.roleLabel("episode-4-producer-v016"),
            "checkpoint"
        )
        XCTAssertEqual(
            NativeSessionNamePolicy.roleLabel("episode-4-working"),
            "working"
        )
    }

    func testMediaVaultRefusesAutosaveIntoExistingCheckpointWithoutChangingBytes() async throws {
        let directory = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: directory) }
        let vault = LocalMediaVault(rootURL: directory)
        let checkpointName = "episode-4-producer-v016"
        let original = NativeEditorSession(
            savedAt: Date(timeIntervalSince1970: 1),
            activeSequenceId: nil,
            project: VideoProject(title: "Original checkpoint")
        )
        let checkpointURL = try await vault.saveSession(
            original,
            named: checkpointName,
            intent: .explicitCheckpoint
        )
        let originalBytes = try Data(contentsOf: checkpointURL)
        let changed = NativeEditorSession(
            savedAt: Date(timeIntervalSince1970: 2),
            activeSequenceId: nil,
            project: VideoProject(title: "Changed working state")
        )

        do {
            _ = try await vault.saveSession(
                changed,
                named: checkpointName,
                intent: .autosave
            )
            XCTFail("Autosave should not be allowed to target a checkpoint.")
        } catch let error as LocalMediaVaultError {
            guard case .autosaveCannotTargetCheckpoint(let name) = error else {
                return XCTFail("Unexpected media vault error: \(error)")
            }
            XCTAssertEqual(name, checkpointName)
        }

        XCTAssertEqual(
            try Data(contentsOf: checkpointURL),
            originalBytes
        )
        let loadedCheckpoint = try await vault.loadSession(
            named: checkpointName
        )
        XCTAssertEqual(loadedCheckpoint, original)
    }
}
