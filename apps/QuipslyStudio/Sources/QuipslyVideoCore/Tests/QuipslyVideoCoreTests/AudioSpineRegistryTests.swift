import XCTest
@testable import QuipslyVideoCore

final class AudioSpineRegistryTests: XCTestCase {
    func testRegistryAttachesToSequenceWithoutApprovingBranches() throws {
        let registryJSON = """
        {
          "schema": "quipsly.audioSpineRegistry.v1",
          "generatedAt": "2026-07-12T00:00:00Z",
          "episodeSlug": "episode-4",
          "baselineDir": "/tmp/baseline",
          "readyDir": "/tmp/ready",
          "selectionPolicy": {
            "fullSourceDefault": "episode4-full-source-master-v006-homer-preserving-clean",
            "deadlineUploadDefault": "episode4-final-branch-remaster-v008-duration-safe",
            "selectionMustBeExplicit": true,
            "branchRenderingLockedUntilHumanListenApproval": true
          },
          "candidates": [
            {
              "id": "episode4-full-source-master-v006-homer-preserving-clean",
              "label": "Full source master v006, Homer preserving clean",
              "episodeSlug": "episode-4",
              "kind": "fullSourceMaster",
              "scope": "full-sync-source-layer",
              "status": "machine-preferred-human-listen-required",
              "sourceBaselineId": "episode-4-conformed-production-baseline-v005",
              "sourceBaselineVersion": "v005",
              "selectedProfile": "homer-preserving-clean",
              "selectedProfileIntent": "Keep Homer intact while reducing Charlie echo.",
              "timelineMapping": {
                "clock": "episode-sequence-time",
                "timelineStartSeconds": 0,
                "sourceOffsetSeconds": 0,
                "durationPolicy": "full-source-duration"
              },
              "artifacts": {
                "masterM4a": {
                  "exists": true,
                  "path": "/tmp/episode4-mastered-audio-spine-v006.m4a",
                  "durationSeconds": 6799.886,
                  "sizeBytes": 164609034,
                  "streams": [
                    {"index": 0, "codec_type": "audio", "codec_name": "aac", "sample_rate": "48000", "channels": 2}
                  ]
                }
              },
              "reports": {
                "fastReadback": "/tmp/AUDIO_FAST_READBACK_CHECK.json"
              },
              "safeFor": ["human-listen-gate", "editor-spine-candidate"],
              "notSafeFor": ["publication-without-human-listen-approval"],
              "notes": "Current official machine-preferred candidate."
            },
            {
              "id": "episode4-final-branch-remaster-v008-duration-safe",
              "label": "Final edit branch remaster v008, duration safe",
              "episodeSlug": "episode-4",
              "kind": "branchRemaster",
              "scope": "rendered-final-edit-branch",
              "status": "deadline-safe-candidate",
              "sourceBaselineId": "episode-4-main-59m26-video-v007",
              "sourceBaselineVersion": null,
              "selectedProfile": "duration-safe-final-mix-remaster",
              "selectedProfileIntent": null,
              "timelineMapping": {
                "clock": "rendered-final-edit-time",
                "timelineStartSeconds": 0,
                "sourceOffsetSeconds": 0,
                "durationPolicy": "matches-existing-final-edit-duration"
              },
              "artifacts": {
                "masterM4a": {
                  "exists": true,
                  "path": "/tmp/episode4-v008-remastered.m4a",
                  "durationSeconds": 3566.272,
                  "sizeBytes": 1000,
                  "streams": []
                }
              },
              "reports": {},
              "safeFor": ["deadline-upload-review"],
              "notSafeFor": ["full-source-sync-layer"],
              "notes": "Branch-scoped only."
            }
          ]
        }
        """

        let registry = try JSONDecoder().decode(AudioSpineRegistry.self, from: Data(registryJSON.utf8))
        var sequence = MediaSequence(title: "Episode 4")
        sequence.attachAudioSpineRegistry(registry, registryPath: "/tmp/episode4-audio-spine-registry.json")

        XCTAssertEqual(sequence.audioSpineRegistryPath, "/tmp/episode4-audio-spine-registry.json")
        XCTAssertEqual(sequence.audioSpineCandidates.count, 2)
        XCTAssertEqual(sequence.selectedAudioSpineCandidateID, "episode4-full-source-master-v006-homer-preserving-clean")
        XCTAssertEqual(sequence.selectedFullSourceAudioSpineCandidate?.selectedProfile, "homer-preserving-clean")
        XCTAssertTrue(sequence.selectedAudioSpineRequiresHumanListenBeforeBranchRendering)
        XCTAssertTrue(sequence.audioSpineBranchRenderingLocked)
        XCTAssertNil(registry.defaultDeadlineUploadCandidate?.isFullSourceMaster == true ? registry.defaultDeadlineUploadCandidate : nil)
    }
}
