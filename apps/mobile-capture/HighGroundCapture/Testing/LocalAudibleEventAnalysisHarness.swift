import Foundation

private func require(
    _ condition: @autoclosure () -> Bool,
    _ message: String
) {
    guard condition() else {
        fputs("FAIL \(message)\n", stderr)
        exit(1)
    }
}

private func classification(_ identifier: String, _ confidence: Double) -> LocalAudibleEventRawClassification {
    LocalAudibleEventRawClassification(
        identifier: identifier,
        confidence: confidence
    )
}

@main
struct LocalAudibleEventAnalysisHarness {
    static func main() async throws {
        let analysisId = "audible_analysis_test_receipt_001"
        let results = [
            LocalAudibleEventRawResult(
                startSeconds: -0.25,
                endSeconds: 1.25,
                classifications: [
                    classification("speech", 0.99),
                    classification("cough", 0.61),
                    classification("music", 0.20),
                ]
            ),
            LocalAudibleEventRawResult(
                startSeconds: 0.75,
                endSeconds: 2.25,
                classifications: [classification("cough", 0.82)]
            ),
            LocalAudibleEventRawResult(
                startSeconds: 4.5,
                endSeconds: 6,
                classifications: [classification("laughter", 0.72)]
            ),
            LocalAudibleEventRawResult(
                startSeconds: 9.5,
                endSeconds: 11,
                classifications: [classification("wind_noise_microphone", 0.55)]
            ),
        ]
        let suggestions = LocalAudibleEventReducer.suggestions(
            analysisId: analysisId,
            durationSeconds: 10,
            results: results
        )

        require(suggestions.count == 3, "selected labels should be bounded and low-confidence/noisy labels excluded")
        let cough = suggestions[0]
        require(cough.classificationIdentifier == "cough", "cough should project into the dialogue family")
        require(cough.family == "dialogue", "cough must remain dialogue review evidence")
        require(cough.startSeconds == 0 && cough.endSeconds == 2.25, "overlapping cough windows should merge on the source clock")
        require(cough.contributingWindowCount == 2, "merged evidence should preserve its window count")
        require(cough.confidence == 0.82, "merged evidence should retain the strongest classifier score")
        require(suggestions[1].family == "content", "laughter should project into content navigation")
        require(suggestions[2].endSeconds == 10, "suggestions must clamp to immutable source duration")
        require(suggestions.allSatisfy { $0.eventId.hasPrefix("audible_") }, "events need stable receipt-local identifiers")

        let repeated = LocalAudibleEventReducer.suggestions(
            analysisId: analysisId,
            durationSeconds: 10,
            results: results
        )
        require(repeated == suggestions, "the reducer must be deterministic for the same versioned receipt")
        let digest = LocalAudibleEventReducer.classificationsSHA256(["cough", "speech"])
        require(digest.count == 64, "known classification identity needs a full SHA-256")
        require(
            digest == LocalAudibleEventReducer.classificationsSHA256(["speech", "cough"]),
            "known classification identity must be order independent"
        )

        let boundaries = LocalRecordingAudibleEventAnalysisBoundaries(
            classifierOutputIsListeningTriageOnly: true,
            classifierScoreIsNotAudibility: true,
            noMediaChanged: true,
            noRepairOrEditAuthorized: true,
            humanReviewRequired: true
        )
        let receipt = LocalRecordingAudibleEventAnalysisProfile(
            schemaVersion: 1,
            analysisId: analysisId,
            supersedesAnalysisId: nil,
            status: "completed",
            algorithm: LocalAudibleEventReducer.algorithm,
            classifierIdentifier: LocalAudibleEventReducer.classifierIdentifier,
            analyzedAt: Date(timeIntervalSince1970: 1_786_000_000),
            sourceSHA256: String(repeating: "b", count: 64),
            sourceByteCount: 42_000,
            durationSeconds: 10,
            requestedWindowDurationSeconds: LocalAudibleEventReducer.requestedWindowDurationSeconds,
            effectiveWindowDurationSeconds: 1.5,
            overlapFactor: LocalAudibleEventReducer.overlapFactor,
            minimumCandidateConfidence: LocalAudibleEventReducer.minimumCandidateConfidence,
            knownClassificationCount: 2,
            knownClassificationsSHA256: digest,
            resultWindowCount: results.count,
            suggestions: suggestions,
            failureCode: nil,
            failureDetail: nil,
            boundaries: boundaries
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        let encoded = try encoder.encode(receipt)
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        let decoded = try decoder.decode(
            LocalRecordingAudibleEventAnalysisProfile.self,
            from: encoded
        )
        require(
            decoded == receipt,
            "the native receipt must survive the Swift/TypeScript JSON boundary"
        )

        let completed = LocalSoundFileAnalysisOperation(start: { completion in
            completion(true)
            completion(false)
        }, cancel: { fatalError("Completed analysis must not be cancelled.") })
        let completionResult = await completed.run(timeout: 0.05)
        require(completionResult, "only the first framework completion may finish analysis")

        let missingCallback = AnalysisCallbackProbe()
        let timedOut = LocalSoundFileAnalysisOperation(start: missingCallback.start, cancel: missingCallback.cancel)
        let timeoutResult = await timedOut.run(timeout: 0.02)
        require(!timeoutResult && missingCallback.cancelCount == 1,
                "missing framework completion must release the worker and cancel underlying analysis")
        missingCallback.complete(true)

        let cancelledBeforeStart = AnalysisCallbackProbe()
        let earlyCancel = LocalSoundFileAnalysisOperation(start: cancelledBeforeStart.start, cancel: cancelledBeforeStart.cancel)
        earlyCancel.cancel()
        let earlyResult = await earlyCancel.run(timeout: 1)
        require(!earlyResult && cancelledBeforeStart.startCount == 0 && cancelledBeforeStart.cancelCount == 1,
                "account cancellation before analysis begins must not start ML work or strand a continuation")

        let cancelledDuringRun = AnalysisCallbackProbe()
        let running = LocalSoundFileAnalysisOperation(start: cancelledDuringRun.start, cancel: cancelledDuringRun.cancel)
        let task = Task { await running.run(timeout: 1) }
        while cancelledDuringRun.startCount == 0 { await Task.yield() }
        running.cancel()
        let cancelledResult = await task.value
        require(!cancelledResult && cancelledDuringRun.cancelCount == 1,
                "cancelling active analysis must release its awaiting worker")
        cancelledDuringRun.complete(true)
        running.cancel()
        try await Task.sleep(for: .milliseconds(80))
        require(cancelledDuringRun.cancelCount == 1 && missingCallback.cancelCount == 1,
                "late completion and repeated cancellation must not finish twice")

        print("PASS Native audible-event analysis retains source-bound observations and handles completion, timeout, cancellation, and late callbacks.")
    }
}

private final class AnalysisCallbackProbe: @unchecked Sendable {
    private let lock = NSLock()
    private var starts = 0
    private var cancels = 0
    private var callback: (@Sendable (Bool) -> Void)?
    var startCount: Int { lock.withLock { starts } }
    var cancelCount: Int { lock.withLock { cancels } }
    func start(_ callback: @escaping @Sendable (Bool) -> Void) {
        lock.withLock { starts += 1; self.callback = callback }
    }
    func cancel() { lock.withLock { cancels += 1 } }
    func complete(_ success: Bool) { lock.withLock { callback }?(success) }
}
