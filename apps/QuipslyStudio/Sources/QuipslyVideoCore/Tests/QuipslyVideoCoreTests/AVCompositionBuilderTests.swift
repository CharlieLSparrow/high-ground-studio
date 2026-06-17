import XCTest
import AVFoundation
@testable import QuipslyVideoCore

final class AVCompositionBuilderTests: XCTestCase {
    
    @MainActor
    func testCompositionLayeringOrder() async throws {
        // Create a dummy sequence with two lanes containing dummy source videos
        let url = URL(fileURLWithPath: "/test.mp4")
        let sourceVideo = SourceVideo(mediaURL: url, duration: 5)
        let lane1 = VideoLane(name: "V1 Base", sourceVideo: sourceVideo)
        let lane2 = VideoLane(name: "V2 Overlay", sourceVideo: sourceVideo)
        
        // V2 is first in the array, meaning it should be top-most in layerInstructions
        let sequence = MediaSequence(title: "Test", lanes: [lane2, lane1])
        
        let builder = AVCompositionBuilder()
        let playerItem = try await builder.buildPlayerItem(for: sequence)
        
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
