import CoreMedia
import CryptoKit
import Foundation
import SoundAnalysis

struct LocalRecordingAudibleEventSuggestion: Codable, Equatable, Sendable {
    let eventId: String
    let classificationIdentifier: String
    let displayLabel: String
    let family: String
    let startSeconds: Double
    let endSeconds: Double
    let confidence: Double
    let contributingWindowCount: Int
    let detail: String
}

struct LocalRecordingAudibleEventAnalysisBoundaries: Codable, Equatable, Sendable {
    let classifierOutputIsListeningTriageOnly: Bool
    let classifierScoreIsNotAudibility: Bool
    let noMediaChanged: Bool
    let noRepairOrEditAuthorized: Bool
    let humanReviewRequired: Bool
}

/// A versioned, source-clock receipt from Apple's general-purpose sound
/// classifier. This is deliberately separate from deterministic decoded-signal
/// evidence: a classifier suggestion is not a measurement and is never an
/// authorization to change source media.
struct LocalRecordingAudibleEventAnalysisProfile: Codable, Equatable, Sendable {
    let schemaVersion: Int
    let analysisId: String
    let supersedesAnalysisId: String?
    let status: String
    let algorithm: String
    let classifierIdentifier: String
    let analyzedAt: Date
    let sourceSHA256: String?
    let sourceByteCount: Int64
    let durationSeconds: Double
    let requestedWindowDurationSeconds: Double
    let effectiveWindowDurationSeconds: Double
    let overlapFactor: Double
    let minimumCandidateConfidence: Double
    let knownClassificationCount: Int
    let knownClassificationsSHA256: String
    let resultWindowCount: Int
    let suggestions: [LocalRecordingAudibleEventSuggestion]
    let failureCode: String?
    let failureDetail: String?
    let boundaries: LocalRecordingAudibleEventAnalysisBoundaries
}

struct LocalAudibleEventRawClassification: Equatable, Sendable {
    let identifier: String
    let confidence: Double
}

struct LocalAudibleEventRawResult: Equatable, Sendable {
    let startSeconds: Double
    let endSeconds: Double
    let classifications: [LocalAudibleEventRawClassification]
}

enum LocalAudibleEventReducer {
    static let algorithm = "apple-sound-classifier-file-v1"
    static let classifierIdentifier = "SNClassifierIdentifierVersion1"
    static let requestedWindowDurationSeconds = 1.5
    static let overlapFactor = 0.5
    static let minimumCandidateConfidence = 0.35
    static let maximumSuggestions = 500

    private struct ClassificationRule {
        let displayLabel: String
        let family: String
        let minimumConfidence: Double
    }

    // These labels are useful for podcast/coaching navigation. `speech` and
    // `silence` are intentionally excluded: they would flood the queue and are
    // better represented by transcript timing and deterministic signal scans.
    private static let rules: [String: ClassificationRule] = [
        "applause": .init(displayLabel: "Applause", family: "content", minimumConfidence: 0.40),
        "belly_laugh": .init(displayLabel: "Belly laugh", family: "content", minimumConfidence: 0.40),
        "booing": .init(displayLabel: "Booing", family: "content", minimumConfidence: 0.45),
        "cheering": .init(displayLabel: "Cheering", family: "content", minimumConfidence: 0.40),
        "chuckle_chortle": .init(displayLabel: "Chuckle", family: "content", minimumConfidence: 0.40),
        "clapping": .init(displayLabel: "Clapping", family: "content", minimumConfidence: 0.40),
        "giggling": .init(displayLabel: "Giggling", family: "content", minimumConfidence: 0.40),
        "laughter": .init(displayLabel: "Laughter", family: "content", minimumConfidence: 0.40),
        "music": .init(displayLabel: "Music", family: "content", minimumConfidence: 0.50),
        "rapping": .init(displayLabel: "Rapping", family: "content", minimumConfidence: 0.50),
        "singing": .init(displayLabel: "Singing", family: "content", minimumConfidence: 0.50),
        "snicker": .init(displayLabel: "Snicker", family: "content", minimumConfidence: 0.40),

        "breathing": .init(displayLabel: "Breathing", family: "dialogue", minimumConfidence: 0.45),
        "cough": .init(displayLabel: "Cough", family: "dialogue", minimumConfidence: 0.40),
        "gasp": .init(displayLabel: "Gasp", family: "dialogue", minimumConfidence: 0.40),
        "nose_blowing": .init(displayLabel: "Nose blowing", family: "dialogue", minimumConfidence: 0.45),
        "sigh": .init(displayLabel: "Sigh", family: "dialogue", minimumConfidence: 0.40),
        "sneeze": .init(displayLabel: "Sneeze", family: "dialogue", minimumConfidence: 0.40),
        "whispering": .init(displayLabel: "Whispering", family: "dialogue", minimumConfidence: 0.50),

        "alarm_clock": .init(displayLabel: "Alarm", family: "environment", minimumConfidence: 0.45),
        "baby_crying": .init(displayLabel: "Baby crying", family: "environment", minimumConfidence: 0.50),
        "dog_bark": .init(displayLabel: "Dog bark", family: "environment", minimumConfidence: 0.45),
        "door_slam": .init(displayLabel: "Door slam", family: "environment", minimumConfidence: 0.40),
        "siren": .init(displayLabel: "Siren", family: "environment", minimumConfidence: 0.50),
        "smoke_detector": .init(displayLabel: "Smoke detector", family: "environment", minimumConfidence: 0.45),
        "telephone_bell_ringing": .init(displayLabel: "Telephone ringing", family: "environment", minimumConfidence: 0.45),
        "traffic_noise": .init(displayLabel: "Traffic noise", family: "environment", minimumConfidence: 0.50),
        "wind_noise_microphone": .init(displayLabel: "Microphone wind noise", family: "environment", minimumConfidence: 0.40),

        "beep": .init(displayLabel: "Beep", family: "capture", minimumConfidence: 0.45),
        "camera": .init(displayLabel: "Camera sound", family: "capture", minimumConfidence: 0.45),
        "click": .init(displayLabel: "Click", family: "capture", minimumConfidence: 0.55),
        "keyboard_musical": .init(displayLabel: "Keyboard instrument", family: "environment", minimumConfidence: 0.55),
        "knock": .init(displayLabel: "Knock", family: "capture", minimumConfidence: 0.45),
        "tap": .init(displayLabel: "Tap", family: "capture", minimumConfidence: 0.50),
        "thump_thud": .init(displayLabel: "Thump or thud", family: "capture", minimumConfidence: 0.45),
        "typing": .init(displayLabel: "Typing", family: "environment", minimumConfidence: 0.50),
        "typing_computer_keyboard": .init(displayLabel: "Computer keyboard", family: "environment", minimumConfidence: 0.45),
    ]

    static func suggestions(
        analysisId: String,
        durationSeconds: Double,
        results: [LocalAudibleEventRawResult]
    ) -> [LocalRecordingAudibleEventSuggestion] {
        struct Candidate {
            let identifier: String
            let rule: ClassificationRule
            var startSeconds: Double
            var endSeconds: Double
            var confidence: Double
            var windowCount: Int
        }

        let duration = max(0, durationSeconds)
        let selected = results.flatMap { result -> [Candidate] in
            let start = rounded(max(0, min(result.startSeconds, duration)))
            let end = rounded(max(start, min(result.endSeconds, duration)))
            guard end > start else { return [] }
            return result.classifications.compactMap { classification in
                guard let rule = rules[classification.identifier],
                      classification.confidence.isFinite,
                      classification.confidence >= max(minimumCandidateConfidence, rule.minimumConfidence) else {
                    return nil
                }
                return Candidate(
                    identifier: classification.identifier,
                    rule: rule,
                    startSeconds: start,
                    endSeconds: end,
                    confidence: min(max(classification.confidence, 0), 1),
                    windowCount: 1
                )
            }
        }
        .sorted {
            $0.startSeconds == $1.startSeconds
                ? $0.identifier < $1.identifier
                : $0.startSeconds < $1.startSeconds
        }

        var merged: [Candidate] = []
        let maximumMergeGap = requestedWindowDurationSeconds * (1 - overlapFactor) + 0.05
        for candidate in selected {
            if let index = merged.indices.last,
               merged[index].identifier == candidate.identifier,
               candidate.startSeconds <= merged[index].endSeconds + maximumMergeGap {
                merged[index].endSeconds = max(merged[index].endSeconds, candidate.endSeconds)
                merged[index].confidence = max(merged[index].confidence, candidate.confidence)
                merged[index].windowCount += candidate.windowCount
            } else {
                merged.append(candidate)
            }
        }

        return merged
            .prefix(maximumSuggestions)
            .map { candidate in
                let identifierSeed = [
                    analysisId,
                    candidate.identifier,
                    String(format: "%.4f", candidate.startSeconds),
                    String(format: "%.4f", candidate.endSeconds),
                ].joined(separator: "|")
                let eventDigest = SHA256.hash(data: Data(identifierSeed.utf8))
                    .map { String(format: "%02x", $0) }
                    .joined()
                return LocalRecordingAudibleEventSuggestion(
                    eventId: "audible_\(eventDigest.prefix(24))",
                    classificationIdentifier: candidate.identifier,
                    displayLabel: candidate.rule.displayLabel,
                    family: candidate.rule.family,
                    startSeconds: rounded(candidate.startSeconds),
                    endSeconds: rounded(candidate.endSeconds),
                    confidence: rounded(candidate.confidence),
                    contributingWindowCount: candidate.windowCount,
                    detail: "Apple's general sound classifier suggested \(candidate.rule.displayLabel.lowercased()). Listen to the protected source context before deciding what is audible or consequential."
                )
            }
    }

    static func classificationsSHA256(_ classifications: [String]) -> String {
        let canonical = classifications.sorted().joined(separator: "\n")
        return SHA256.hash(data: Data(canonical.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private static func rounded(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return (value * 10_000).rounded() / 10_000
    }
}

enum LocalAudibleEventAnalyzer {
    static func analyze(
        fileURL: URL,
        durationSeconds: Double,
        sourceByteCount: Int64,
        supersedesAnalysisId: String?
    ) async -> LocalRecordingAudibleEventAnalysisProfile {
        let analysisId = "audible_analysis_\(UUID().uuidString.lowercased().replacingOccurrences(of: "-", with: ""))"
        let digestTask = Task.detached(priority: .utility) {
            try sourceDigest(at: fileURL)
        }
        let boundaries = LocalRecordingAudibleEventAnalysisBoundaries(
            classifierOutputIsListeningTriageOnly: true,
            classifierScoreIsNotAudibility: true,
            noMediaChanged: true,
            noRepairOrEditAuthorized: true,
            humanReviewRequired: true
        )

        do {
            let analyzer = try SNAudioFileAnalyzer(url: fileURL)
            let request = try SNClassifySoundRequest(classifierIdentifier: .version1)
            request.windowDuration = CMTime(
                seconds: LocalAudibleEventReducer.requestedWindowDurationSeconds,
                preferredTimescale: 48_000
            )
            request.overlapFactor = LocalAudibleEventReducer.overlapFactor
            let observer = LocalSoundClassificationObserver()
            try analyzer.add(request, withObserver: observer)
            let reachedEnd = await withCheckedContinuation { continuation in
                analyzer.analyze { didReachEndOfFile in
                    continuation.resume(returning: didReachEndOfFile)
                }
            }
            let snapshot = observer.snapshot()
            let digest = try await digestTask.value
            guard digest.sizeBytes > 0,
                  digest.sizeBytes == sourceByteCount else {
                return failureProfile(
                    analysisId: analysisId,
                    supersedesAnalysisId: supersedesAnalysisId,
                    durationSeconds: durationSeconds,
                    sourceSHA256: digest.sha256,
                    sourceByteCount: digest.sizeBytes,
                    effectiveWindowDurationSeconds: request.windowDuration.seconds,
                    knownClassifications: request.knownClassifications,
                    failureCode: "source-changed-during-analysis",
                    boundaries: boundaries
                )
            }
            guard reachedEnd, snapshot.failureCode == nil else {
                return failureProfile(
                    analysisId: analysisId,
                    supersedesAnalysisId: supersedesAnalysisId,
                    durationSeconds: durationSeconds,
                    sourceSHA256: digest.sha256,
                    sourceByteCount: digest.sizeBytes,
                    effectiveWindowDurationSeconds: request.windowDuration.seconds,
                    knownClassifications: request.knownClassifications,
                    failureCode: snapshot.failureCode ?? "analysis-incomplete",
                    boundaries: boundaries
                )
            }
            let suggestions = LocalAudibleEventReducer.suggestions(
                analysisId: analysisId,
                durationSeconds: durationSeconds,
                results: snapshot.results
            )
            return LocalRecordingAudibleEventAnalysisProfile(
                schemaVersion: 1,
                analysisId: analysisId,
                supersedesAnalysisId: supersedesAnalysisId,
                status: "completed",
                algorithm: LocalAudibleEventReducer.algorithm,
                classifierIdentifier: LocalAudibleEventReducer.classifierIdentifier,
                analyzedAt: Date(),
                sourceSHA256: digest.sha256,
                sourceByteCount: digest.sizeBytes,
                durationSeconds: rounded(durationSeconds),
                requestedWindowDurationSeconds: LocalAudibleEventReducer.requestedWindowDurationSeconds,
                effectiveWindowDurationSeconds: rounded(request.windowDuration.seconds),
                overlapFactor: LocalAudibleEventReducer.overlapFactor,
                minimumCandidateConfidence: LocalAudibleEventReducer.minimumCandidateConfidence,
                knownClassificationCount: request.knownClassifications.count,
                knownClassificationsSHA256: LocalAudibleEventReducer.classificationsSHA256(request.knownClassifications),
                resultWindowCount: snapshot.results.count,
                suggestions: suggestions,
                failureCode: nil,
                failureDetail: nil,
                boundaries: boundaries
            )
        } catch {
            let failure = error as NSError
            let digest = try? await digestTask.value
            return failureProfile(
                analysisId: analysisId,
                supersedesAnalysisId: supersedesAnalysisId,
                durationSeconds: durationSeconds,
                sourceSHA256: digest?.sha256,
                sourceByteCount: digest?.sizeBytes ?? sourceByteCount,
                effectiveWindowDurationSeconds: LocalAudibleEventReducer.requestedWindowDurationSeconds,
                knownClassifications: [],
                failureCode: "\(failure.domain)-\(failure.code)",
                boundaries: boundaries
            )
        }
    }

    private static func failureProfile(
        analysisId: String,
        supersedesAnalysisId: String?,
        durationSeconds: Double,
        sourceSHA256: String?,
        sourceByteCount: Int64,
        effectiveWindowDurationSeconds: Double,
        knownClassifications: [String],
        failureCode: String,
        boundaries: LocalRecordingAudibleEventAnalysisBoundaries
    ) -> LocalRecordingAudibleEventAnalysisProfile {
        LocalRecordingAudibleEventAnalysisProfile(
            schemaVersion: 1,
            analysisId: analysisId,
            supersedesAnalysisId: supersedesAnalysisId,
            status: "failed",
            algorithm: LocalAudibleEventReducer.algorithm,
            classifierIdentifier: LocalAudibleEventReducer.classifierIdentifier,
            analyzedAt: Date(),
            sourceSHA256: sourceSHA256,
            sourceByteCount: max(0, sourceByteCount),
            durationSeconds: rounded(durationSeconds),
            requestedWindowDurationSeconds: LocalAudibleEventReducer.requestedWindowDurationSeconds,
            effectiveWindowDurationSeconds: rounded(effectiveWindowDurationSeconds),
            overlapFactor: LocalAudibleEventReducer.overlapFactor,
            minimumCandidateConfidence: LocalAudibleEventReducer.minimumCandidateConfidence,
            knownClassificationCount: knownClassifications.count,
            knownClassificationsSHA256: LocalAudibleEventReducer.classificationsSHA256(knownClassifications),
            resultWindowCount: 0,
            suggestions: [],
            failureCode: normalizedFailureCode(failureCode),
            failureDetail: "Apple Sound Analysis could not complete this review map. Source validation, preservation, playback, and upload remain independent.",
            boundaries: boundaries
        )
    }

    private static func normalizedFailureCode(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
        let normalized = value.unicodeScalars.map { allowed.contains($0) ? Character(String($0)) : "-" }
        return String(normalized).prefix(120).lowercased()
    }

    private struct SourceDigest: Sendable {
        let sha256: String
        let sizeBytes: Int64
    }

    nonisolated private static func sourceDigest(
        at fileURL: URL
    ) throws -> SourceDigest {
        let handle = try FileHandle(forReadingFrom: fileURL)
        defer { try? handle.close() }
        var hasher = SHA256()
        var sizeBytes: Int64 = 0
        while true {
            let data = try handle.read(upToCount: 1024 * 1024) ?? Data()
            guard !data.isEmpty else { break }
            hasher.update(data: data)
            sizeBytes += Int64(data.count)
        }
        return SourceDigest(
            sha256: hasher.finalize().map { String(format: "%02x", $0) }.joined(),
            sizeBytes: sizeBytes
        )
    }

    private static func rounded(_ value: Double) -> Double {
        guard value.isFinite else { return 0 }
        return (value * 10_000).rounded() / 10_000
    }
}

private final class LocalSoundClassificationObserver: NSObject, SNResultsObserving, @unchecked Sendable {
    private let lock = NSLock()
    private var storedResults: [LocalAudibleEventRawResult] = []
    private var storedFailureCode: String?

    func request(_ request: any SNRequest, didProduce result: any SNResult) {
        guard let result = result as? SNClassificationResult else { return }
        let timeRange = result.timeRange
        let start = timeRange.start.seconds
        let duration = timeRange.duration.seconds
        guard start.isFinite, duration.isFinite, duration > 0 else { return }
        let classifications = result.classifications.map {
            LocalAudibleEventRawClassification(
                identifier: $0.identifier,
                confidence: $0.confidence
            )
        }
        lock.lock()
        storedResults.append(
            LocalAudibleEventRawResult(
                startSeconds: start,
                endSeconds: start + duration,
                classifications: classifications
            )
        )
        lock.unlock()
    }

    func request(_ request: any SNRequest, didFailWithError error: any Error) {
        let failure = error as NSError
        lock.lock()
        storedFailureCode = "\(failure.domain)-\(failure.code)"
        lock.unlock()
    }

    func requestDidComplete(_ request: any SNRequest) {}

    func snapshot() -> (results: [LocalAudibleEventRawResult], failureCode: String?) {
        lock.lock()
        defer { lock.unlock() }
        return (storedResults, storedFailureCode)
    }
}
