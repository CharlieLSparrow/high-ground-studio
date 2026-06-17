import XCTest
import AVFoundation
@testable import QuipslyVideoCore

final class AVExportRendererTests: XCTestCase {
    
    @MainActor
    func testExportRendererSlicesClips() async throws {
        // Create a dummy sequence with one lane and one highlight tag
        let url = URL(fileURLWithPath: "/test.mp4")
        let sourceVideo = SourceVideo(mediaURL: url, duration: 10)
        let tag = VideoTag(type: .highlight, startTime: 2.0, duration: 3.0)
        let lane1 = VideoLane(name: "V1 Base", sourceVideo: sourceVideo, tags: [tag])
        
        let sequence = MediaSequence(title: "ExportTest", lanes: [lane1])
        let renderer = AVExportRenderer()
        
        let outputDirectory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        
        // This test will likely throw `exportFailed` because the source video file doesn't actually exist
        // to be exported, but we can verify it doesn't crash before that point and throws the expected error.
        do {
            _ = try await renderer.exportClips(from: sequence, withTag: .highlight, format: .horizontal16x9, to: outputDirectory)
            XCTFail("Should have thrown because the dummy URL /test.mp4 doesn't exist.")
        } catch AVExportError.exportFailed(_) {
            // Expected
        } catch {
            XCTFail("Unexpected error: \(error)")
        }
    }
}
