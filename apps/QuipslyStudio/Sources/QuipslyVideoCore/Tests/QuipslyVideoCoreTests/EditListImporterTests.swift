import XCTest
@testable import QuipslyVideoCore

final class EditListImporterTests: XCTestCase {

    func testEditListGeneratesTags() {
        let sourceID = UUID()
        let mockEditList = EditListImporter.generateMockPremiereEdit(sourceID: sourceID)

        let tags = EditListImporter.tagsFromEditList(sequence: mockEditList, forSourceID: sourceID)

        // Ensure 50 tags were created from the 50 mock cuts
        XCTAssertEqual(tags.count, 50)

        // Check the first tag
        XCTAssertEqual(tags[0].startTime, 0.0)
        XCTAssertEqual(tags[0].duration, 5.0)
        XCTAssertEqual(tags[0].type, .highlight)

        // Check the second tag
        XCTAssertEqual(tags[1].startTime, 10.0)
        XCTAssertEqual(tags[1].duration, 5.0)
        XCTAssertEqual(tags[1].type, .highlight)
    }

    func testImportTagsOntoSequence() {
        let sourceID = UUID()
        let sourceVideo = SourceVideo(id: sourceID, mediaURL: URL(fileURLWithPath: "/test.mp4"), duration: 3600)
        let laneID = UUID()
        let lane = VideoLane(id: laneID, name: "V1", sourceVideo: sourceVideo, tags: [])

        var sequence = MediaSequence(title: "Test Sequence", lanes: [lane])

        // Ensure lane is empty initially
        XCTAssertEqual(sequence.lanes[0].tags.count, 0)

        // Generate mock edit and import
        let mockEditList = EditListImporter.generateMockPremiereEdit(sourceID: sourceID)
        let newTags = EditListImporter.tagsFromEditList(sequence: mockEditList, forSourceID: sourceID)

        sequence.importTags(newTags, toLaneWithID: laneID)

        // Ensure tags were applied
        XCTAssertEqual(sequence.lanes[0].tags.count, 50)
    }

    func testEditListIgnoresUnmatchedSources() {
        let wrongSourceID = UUID()
        let correctSourceID = UUID()
        let mockEditList = EditListImporter.generateMockPremiereEdit(sourceID: wrongSourceID)

        // Asking for tags for the correctSourceID should return 0 since the mock is built for the wrongSourceID
        let tags = EditListImporter.tagsFromEditList(sequence: mockEditList, forSourceID: correctSourceID)

        XCTAssertEqual(tags.count, 0)
    }
}
