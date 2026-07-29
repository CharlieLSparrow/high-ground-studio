import XCTest
@testable import QuipslyVideoCore

final class LocalEditorialProposalTests: XCTestCase {
    func testResolverUsesTranscriptClockAndPreservesProvenance() {
        let first = TranscriptSegment(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000001")!,
            startTime: 42,
            endTime: 48,
            text: "Reliability matters."
        )
        let second = TranscriptSegment(
            id: UUID(uuidString: "00000000-0000-0000-0000-000000000002")!,
            startTime: 48,
            endTime: 65,
            text: "Talent is not enough."
        )
        let envelope = LocalEditorialProposalEnvelope(
            provider: "ollama",
            model: "qwen3:8b",
            promptVersion: "episode-story-v1",
            candidates: [
                .init(
                    startSegmentID: first.id.uuidString,
                    endSegmentID: second.id.uuidString,
                    title: " Reliability beats talent ",
                    hook: " Talent gets overrated. ",
                    reason: " Complete claim. ",
                    score: 1.4
                )
            ]
        )

        let result = LocalEditorialProposalResolver.resolve(envelope, against: [second, first])

        XCTAssertEqual(result.rejected, [])
        XCTAssertEqual(result.accepted.count, 1)
        XCTAssertEqual(result.accepted[0].startTime, 42)
        XCTAssertEqual(result.accepted[0].endTime, 65)
        XCTAssertEqual(result.accepted[0].title, "Reliability beats talent")
        XCTAssertEqual(result.accepted[0].score, 1)
        XCTAssertEqual(result.accepted[0].model, "qwen3:8b")
        XCTAssertEqual(result.accepted[0].status, "proposal-not-applied")
    }

    func testResolverRejectsInventedReversedAndOversizedRanges() {
        let first = TranscriptSegment(startTime: 0, endTime: 10, text: "First")
        let second = TranscriptSegment(startTime: 10, endTime: 150, text: "Second")
        let envelope = LocalEditorialProposalEnvelope(
            provider: "ollama",
            model: "qwen3:8b",
            promptVersion: "episode-story-v1",
            candidates: [
                .init(
                    startSegmentID: UUID().uuidString,
                    endSegmentID: second.id.uuidString,
                    title: "Invented",
                    hook: "",
                    reason: "",
                    score: 0.5
                ),
                .init(
                    startSegmentID: second.id.uuidString,
                    endSegmentID: first.id.uuidString,
                    title: "Reversed",
                    hook: "",
                    reason: "",
                    score: 0.5
                ),
                .init(
                    startSegmentID: first.id.uuidString,
                    endSegmentID: second.id.uuidString,
                    title: "Too long",
                    hook: "",
                    reason: "",
                    score: 0.5
                )
            ]
        )

        let result = LocalEditorialProposalResolver.resolve(
            envelope,
            against: [first, second],
            maximumDuration: 60
        )

        XCTAssertEqual(result.accepted, [])
        XCTAssertEqual(
            result.rejected.map(\.reason),
            [
                "missing-or-invented-transcript-segment-id",
                "reversed-or-empty-transcript-range",
                "range-exceeds-maximum-duration"
            ]
        )
    }

    func testResolverRejectsAmbiguousDuplicateTranscriptIDs() {
        let duplicateID = UUID()
        let first = TranscriptSegment(
            id: duplicateID,
            startTime: 0,
            endTime: 10,
            text: "First"
        )
        let duplicate = TranscriptSegment(
            id: duplicateID,
            startTime: 10,
            endTime: 20,
            text: "Duplicate"
        )
        let envelope = LocalEditorialProposalEnvelope(
            provider: "ollama",
            model: "qwen3:8b",
            promptVersion: "episode-story-v1",
            candidates: [
                .init(
                    startSegmentID: duplicateID.uuidString,
                    endSegmentID: duplicateID.uuidString,
                    title: "Ambiguous",
                    hook: "",
                    reason: "",
                    score: 0.5
                )
            ]
        )

        let result = LocalEditorialProposalResolver.resolve(
            envelope,
            against: [first, duplicate]
        )

        XCTAssertEqual(result.accepted, [])
        XCTAssertEqual(
            result.rejected.map(\.reason),
            ["ambiguous-duplicate-transcript-segment-id"]
        )
    }
}
