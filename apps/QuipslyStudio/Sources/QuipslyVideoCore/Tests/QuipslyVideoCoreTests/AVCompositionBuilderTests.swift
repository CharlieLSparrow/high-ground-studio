import XCTest
import AVFoundation
@testable import QuipslyVideoCore

final class AVCompositionBuilderTests: XCTestCase {

    @MainActor
    func testCompositionLayeringOrder() async throws {
        // Use the checked-in tiny media fixture. The production builder
        // intentionally refuses nonexistent files and original-only video
        // paths, so a fake `/test.mp4` can no longer prove composition output.
        let url = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent("Charlie.mp4")
        XCTAssertTrue(FileManager.default.fileExists(atPath: url.path))
        let sourceVideo = SourceVideo(
            mediaURL: url,
            proxyURL: url,
            duration: 5
        )
        let lane1 = VideoLane(name: "V1 Base", sourceVideo: sourceVideo)
        let lane2 = VideoLane(name: "V2 Overlay", sourceVideo: sourceVideo)

        // V2 is first in the array, meaning it should be top-most in layerInstructions
        let sequence = MediaSequence(title: "Test", lanes: [lane2, lane1])

        let builder = AVCompositionBuilder()
        let playerItem = try await builder.buildPlayerItem(
            for: sequence,
            mode: .playThrough
        )

        // Verify video composition was created
        guard let videoComposition = playerItem.videoComposition else {
            XCTFail("Expected AVVideoComposition")
            return
        }

        // Verify instructions exist
        guard let instruction = videoComposition.instructions.first as? AVVideoCompositionInstruction else {
            XCTFail("Expected AVVideoCompositionInstruction")
            return
        }

        // We added two tracks, so we expect 2 layer instructions
        XCTAssertEqual(instruction.layerInstructions.count, 2)

        // Check frame duration defaults to 30fps
        XCTAssertEqual(videoComposition.frameDuration, CMTime(value: 1, timescale: 30))

        // Check render size
        XCTAssertEqual(videoComposition.renderSize, CGSize(width: 1920, height: 1080))
    }
}
