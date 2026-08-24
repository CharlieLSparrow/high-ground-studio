import AVFoundation
import Combine
import CryptoKit
import Foundation

struct CaptureAudioMasterySnapshot: Decodable, Equatable {
    struct Measurement: Decodable, Equatable {
        let durationSeconds: TimeInterval
        let integratedLufs: Double
        let truePeakDbtp: Double
        let loudnessRangeLu: Double
    }

    struct Derivative: Decodable, Equatable {
        let playbackUrl: String?
        let sha256: String
        let sizeBytes: Int64
        let measured: Measurement?
    }

    struct Proposal: Decodable, Equatable {
        struct Profile: Decodable, Equatable {
            let label: String
            let integratedLufs: Double
            let maximumTruePeakDbtp: Double
        }

        let action: String
        let profile: Profile?
    }

    struct ReviewSummary: Decodable, Equatable {
        struct Receipt: Decodable, Equatable {
            let id: String
            let jobId: String
            let decision: String
            let note: String?
            let reviewedAt: String
            let actorEmail: String
        }

        let latest: Receipt?
        let approvalCount: Int
        let rejectionCount: Int
    }

    struct ReviewPlan: Decodable, Equatable {
        struct Moment: Decodable, Equatable, Identifiable {
            let id: String
            let timeSeconds: TimeInterval
            let label: String
            let detail: String
        }

        let requiredMoments: [Moment]
    }

    let ok: Bool
    let jobId: String?
    let status: String
    let sourceMeasurement: Measurement?
    let proposal: Proposal?
    let derivative: Derivative?
    var review: ReviewSummary?
    let reviewPlan: ReviewPlan?
    let error: String?

    var isWorking: Bool {
        ["queued", "processing", "output-ready"].contains(status)
    }
}

struct CaptureAudioMasteryReviewCoverage: Equatable {
    let requiredMomentIDs: Set<String>
    let sourceCompletedMomentIDs: Set<String>
    let previewCompletedMomentIDs: Set<String>
    let matchedMonitorObserved: Bool
    let deliveryMonitorObserved: Bool

    var approvalReady: Bool {
        !requiredMomentIDs.isEmpty
            && sourceCompletedMomentIDs == requiredMomentIDs
            && previewCompletedMomentIDs == requiredMomentIDs
            && matchedMonitorObserved
            && deliveryMonitorObserved
    }
}

private struct CaptureAudioMasteryErrorEnvelope: Decodable {
    let error: String?
}

private struct CaptureAudioMasteryReviewResponse: Decodable {
    let ok: Bool
    let review: CaptureAudioMasterySnapshot.ReviewSummary?
    let error: String?
}

/// Authenticated, account-bound access to the verified cloud listening copy.
/// The client never promotes, overwrites, or deletes the immutable original.
@MainActor
final class CaptureAudioMasteryClient: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var snapshot: CaptureAudioMasterySnapshot?
    @Published private(set) var isLoading = false
    @Published private(set) var isPlaying = false
    @Published private(set) var isReviewing = false
    @Published private(set) var notice: String?
    @Published private(set) var sourceListenedSecondBins: Set<Int> = []
    @Published private(set) var previewListenedSecondBins: Set<Int> = []
    @Published private(set) var observedMonitorModes: Set<String> = []

    private struct RecordingBinding: Equatable, Sendable {
        let recordingID: UUID
        let ownerAccountID: String
        let projectSlug: String
        let assetID: String
        let sourceID: String
    }

    private struct FileDigest: Sendable {
        let sha256: String
        let sizeBytes: Int64
    }

    private let baseURL = URL(
        string: normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
                ?? "https://nest.quipsly.com"
        )
    )!
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared
    private var player: AVAudioPlayer?
    private var protectedPreviewURL: URL?
    private var playbackBinding: RecordingBinding?
    private var playbackSHA256: String?
    private var accountCancellable: AnyCancellable?
    private var playbackTimer: Timer?
    private var activePreviewMonitorMode: String?
    private var evidenceJobID: String?
    private var reviewRequestIDs: [String: String] = [:]

    override init() {
        super.init()
        accountCancellable = NotificationCenter.default.publisher(
            for: .quipslyCaptureAccountIdentityDidChange
        ).sink { [weak self] _ in
            Task { @MainActor in
                self?.reset()
            }
        }
    }

    deinit {
        playbackTimer?.invalidate()
        if let protectedPreviewURL {
            try? FileManager.default.removeItem(at: protectedPreviewURL)
        }
    }

    func open(recording: LocalRecording) async {
        guard let binding = binding(for: recording) else {
            snapshot = nil
            notice = nil
            resetReviewEvidence()
            return
        }
        if playbackBinding != nil && playbackBinding != binding {
            clearPlayback()
        }
        isLoading = true
        defer { isLoading = false }
        do {
            var current = try await requestStatus(binding: binding)
            try validate(binding)
            if current.status == "not-queued" {
                current = try await operate("queue", binding: binding)
            }
            acceptSnapshot(current)
            reconcilePlaybackAuthorization(with: current, binding: binding)
            notice = nil
            current = try await reconcileUntilSettled(current, binding: binding)
            if current.isWorking {
                notice = "Audio improvement is still preparing. Check again in a moment."
            } else if current.status == "failed" || current.status == "blocked" {
                notice = current.error ?? "Quipsly could not prepare an improved copy. Your original is safe."
            }
        } catch is CancellationError {
            return
        } catch {
            notice = error.localizedDescription
        }
    }

    func retry(recording: LocalRecording) async {
        guard let binding = binding(for: recording) else {
            notice = "Upload this recording before preparing an improved copy."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            let queued = try await operate("queue", binding: binding)
            acceptSnapshot(queued)
            reconcilePlaybackAuthorization(with: queued, binding: binding)
            notice = nil
            let current = try await reconcileUntilSettled(queued, binding: binding)
            if current.isWorking {
                notice = "Audio improvement is still preparing. Check again in a moment."
            } else if current.status == "failed" || current.status == "blocked" {
                notice = current.error ?? "Quipsly could not prepare an improved copy. Your original is safe."
            }
        } catch is CancellationError {
            return
        } catch {
            notice = error.localizedDescription
        }
    }

    func togglePreview(
        recording: LocalRecording,
        from requestedSeconds: TimeInterval = 0,
        volume requestedVolume: Float = 1,
        monitorMode: String,
        restartIfPlaying: Bool = false
    ) async {
        if let player, player.isPlaying {
            if restartIfPlaying {
                player.currentTime = Self.clampedPlaybackTime(requestedSeconds, duration: player.duration)
                player.volume = Self.clampedVolume(requestedVolume)
                activePreviewMonitorMode = Self.supportedMonitorMode(monitorMode)
                notice = nil
                return
            }
            player.pause()
            isPlaying = false
            stopPlaybackTimer()
            audioSessionCoordinator.endLocalPlayback()
            return
        }
        if let player {
            do {
                player.currentTime = Self.clampedPlaybackTime(requestedSeconds, duration: player.duration)
                player.volume = Self.clampedVolume(requestedVolume)
                activePreviewMonitorMode = Self.supportedMonitorMode(monitorMode)
                try audioSessionCoordinator.beginLocalPlayback()
                guard player.play() else { throw ClientError.message("The improved copy could not begin playback.") }
                startPlaybackTimer()
                isPlaying = true
                notice = nil
            } catch {
                audioSessionCoordinator.endLocalPlayback()
                notice = error.localizedDescription
            }
            return
        }
        guard let binding = binding(for: recording),
              let derivative = snapshot?.derivative,
              let expectedSHA256 = Self.normalizedSHA256(derivative.sha256),
              derivative.sizeBytes > 0,
              let playbackURL = playbackURL(derivative.playbackUrl),
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              owner.ownerAccountID == binding.ownerAccountID else {
            notice = "The improved copy has not finished verification yet."
            return
        }

        isLoading = true
        defer { isLoading = false }
        do {
            var request = URLRequest(url: playbackURL)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            let (temporaryURL, response) = try await AuthManager.shared.authenticatedDownload(
                for: request,
                expectedOwnerAccountID: binding.ownerAccountID
            )
            guard response.statusCode < 400,
                  Self.sameOrigin(response.url, baseURL) else {
                try? FileManager.default.removeItem(at: temporaryURL)
                throw ClientError.message("The improved copy is not available to this account.")
            }
            let digest = try await Task.detached(priority: .userInitiated) {
                try Self.computeFileDigest(at: temporaryURL)
            }.value
            guard digest.sha256 == expectedSHA256,
                  digest.sizeBytes == derivative.sizeBytes else {
                try? FileManager.default.removeItem(at: temporaryURL)
                throw ClientError.message("The downloaded copy did not match Quipsly's verified receipt, so it was not opened.")
            }
            try validate(binding)
            guard AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
                try? FileManager.default.removeItem(at: temporaryURL)
                throw ClientError.message("The active account changed before playback.")
            }

            clearPlayback()
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("quipsly-improved-audio-\(UUID().uuidString.lowercased()).wav")
            try FileManager.default.moveItem(at: temporaryURL, to: destination)
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: destination.path
            )
            try audioSessionCoordinator.beginLocalPlayback()
            let player = try AVAudioPlayer(contentsOf: destination)
            player.delegate = self
            player.currentTime = Self.clampedPlaybackTime(requestedSeconds, duration: player.duration)
            player.volume = Self.clampedVolume(requestedVolume)
            guard player.prepareToPlay(), player.play() else {
                throw ClientError.message("The improved copy could not begin playback.")
            }
            protectedPreviewURL = destination
            playbackBinding = binding
            playbackSHA256 = expectedSHA256
            self.player = player
            activePreviewMonitorMode = Self.supportedMonitorMode(monitorMode)
            isPlaying = true
            startPlaybackTimer()
            notice = nil
        } catch {
            audioSessionCoordinator.endLocalPlayback()
            notice = error.localizedDescription
        }
    }

    func stop() {
        player?.stop()
        isPlaying = false
        stopPlaybackTimer()
        audioSessionCoordinator.endLocalPlayback()
    }

    func setPreviewVolume(_ requestedVolume: Float, monitorMode: String) {
        player?.volume = Self.clampedVolume(requestedVolume)
        activePreviewMonitorMode = Self.supportedMonitorMode(monitorMode)
    }

    func observeSourcePlayback(
        recording: LocalRecording,
        at seconds: TimeInterval,
        monitorMode: String
    ) {
        guard binding(for: recording) != nil,
              snapshot?.jobId == evidenceJobID,
              let durationSeconds = snapshot?.sourceMeasurement?.durationSeconds,
              seconds.isFinite,
              seconds >= 0 else { return }
        sourceListenedSecondBins.insert(
            Self.boundedSecondBin(seconds, durationSeconds: durationSeconds)
        )
        if let mode = Self.supportedMonitorMode(monitorMode) {
            observedMonitorModes.insert(mode)
        }
    }

    func reviewCoverage(for status: CaptureAudioMasterySnapshot) -> CaptureAudioMasteryReviewCoverage {
        let moments = status.reviewPlan?.requiredMoments ?? []
        let sourceDuration = status.sourceMeasurement?.durationSeconds ?? 0
        let previewDuration = status.derivative?.measured?.durationSeconds ?? 0
        let requiredMomentIDs = Set(moments.map(\.id))
        let sourceCompleted = Set(moments.compactMap { moment in
            Self.requiredBins(for: moment, durationSeconds: sourceDuration)
                .isSubset(of: sourceListenedSecondBins) ? moment.id : nil
        })
        let previewCompleted = Set(moments.compactMap { moment in
            Self.requiredBins(for: moment, durationSeconds: previewDuration)
                .isSubset(of: previewListenedSecondBins) ? moment.id : nil
        })
        return CaptureAudioMasteryReviewCoverage(
            requiredMomentIDs: requiredMomentIDs,
            sourceCompletedMomentIDs: sourceCompleted,
            previewCompletedMomentIDs: previewCompleted,
            matchedMonitorObserved: observedMonitorModes.contains("matched"),
            deliveryMonitorObserved: observedMonitorModes.contains("delivery")
        )
    }

    func saveReview(
        recording: LocalRecording,
        decision: String,
        note rawNote: String?
    ) async {
        guard let binding = binding(for: recording),
              let status = snapshot,
              let jobID = status.jobId,
              jobID == evidenceJobID,
              status.derivative != nil,
              decision == "approved" || decision == "rejected" else {
            notice = "The exact improved copy is no longer available for review."
            return
        }
        let note = rawNote?.trimmingCharacters(in: .whitespacesAndNewlines)
        let coverage = reviewCoverage(for: status)
        if decision == "approved" && !coverage.approvalReady {
            notice = "Hear every suggested moment in both versions at fair comparison and final volume before approving."
            return
        }
        if decision == "rejected" && (previewListenedSecondBins.isEmpty || note?.isEmpty != false) {
            notice = "Hear the improved copy and add a note before rejecting it."
            return
        }
        guard AuthManager.shared.networkActionsAllowed else {
            notice = "Reconnect to Nest to save this listening decision."
            return
        }

        let sourceBins = sourceListenedSecondBins.sorted()
        let previewBins = previewListenedSecondBins.sorted()
        let monitorModes = observedMonitorModes.sorted()
        let fingerprint = [
            jobID,
            decision,
            sourceBins.map(String.init).joined(separator: ","),
            previewBins.map(String.init).joined(separator: ","),
            monitorModes.joined(separator: ","),
            note ?? "",
        ].joined(separator: "|")
        let clientRequestID = reviewRequestIDs[fingerprint] ?? UUID().uuidString.lowercased()
        reviewRequestIDs[fingerprint] = clientRequestID

        isReviewing = true
        defer { isReviewing = false }
        do {
            let url = baseURL.appendingPathComponent("api/media-vault/audio-mastery/review")
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let reviewBody: [String: Any] = [
                "projectSlug": binding.projectSlug,
                "assetId": binding.assetID,
                "sourceId": binding.sourceID,
                "jobId": jobID,
                "clientRequestId": clientRequestID,
                "decision": decision,
                "playbackEvidence": [
                    "schema": "quipsly-audio-mastery-playback-review-v1",
                    "sourceListenedSecondBins": sourceBins,
                    "masteredListenedSecondBins": previewBins,
                    "monitorModes": monitorModes,
                    "completedAt": ISO8601DateFormatter().string(from: Date()),
                ],
                "note": note.map { $0 as Any } ?? NSNull(),
            ]
            request.httpBody = try JSONSerialization.data(withJSONObject: reviewBody)
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: binding.ownerAccountID
            )
            guard response.statusCode < 400, Self.sameOrigin(response.url, baseURL) else {
                let envelope = try? JSONDecoder().decode(CaptureAudioMasteryErrorEnvelope.self, from: data)
                throw ClientError.message(envelope?.error ?? "Quipsly could not save this listening decision.")
            }
            let result = try JSONDecoder().decode(CaptureAudioMasteryReviewResponse.self, from: data)
            guard result.ok, let review = result.review else {
                throw ClientError.message(result.error ?? "Quipsly did not return the saved listening receipt.")
            }
            try validate(binding)
            snapshot?.review = review
            notice = decision == "approved"
                ? "Approved as heard. The improved copy is still separate from your original."
                : "Rejected as heard. Both versions remain unchanged."
        } catch is CancellationError {
            return
        } catch {
            notice = error.localizedDescription
        }
    }

    func reset() {
        clearPlayback()
        snapshot = nil
        notice = nil
        isLoading = false
        isReviewing = false
        resetReviewEvidence()
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.isPlaying = false
            self.stopPlaybackTimer()
            self.audioSessionCoordinator.endLocalPlayback()
            if !flag { self.notice = "Playback ended before iOS could finish the improved copy." }
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            self.clearPlayback()
            self.notice = error?.localizedDescription ?? "The improved copy could not be decoded."
        }
    }

    private func requestStatus(binding: RecordingBinding) async throws -> CaptureAudioMasterySnapshot {
        var components = URLComponents(
            url: baseURL.appendingPathComponent("api/media-vault/audio-mastery"),
            resolvingAgainstBaseURL: false
        )
        components?.queryItems = [
            URLQueryItem(name: "projectSlug", value: binding.projectSlug),
            URLQueryItem(name: "assetId", value: binding.assetID),
        ]
        guard let url = components?.url else { throw ClientError.message("The configured Nest URL is invalid.") }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        return try await send(request, binding: binding)
    }

    private func operate(_ action: String, binding: RecordingBinding) async throws -> CaptureAudioMasterySnapshot {
        let url = baseURL.appendingPathComponent("api/media-vault/audio-mastery")
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "action": action,
            "projectSlug": binding.projectSlug,
            "assetId": binding.assetID,
            "sourceId": binding.sourceID,
            "profileId": "apple-podcasts-dialogue-v1",
        ])
        return try await send(request, binding: binding)
    }

    private func send(_ request: URLRequest, binding: RecordingBinding) async throws -> CaptureAudioMasterySnapshot {
        guard AuthManager.shared.networkActionsAllowed else {
            throw ClientError.message("Reconnect to Nest to check this recording's audio.")
        }
        let (data, response) = try await AuthManager.shared.authenticatedData(
            for: request,
            expectedOwnerAccountID: binding.ownerAccountID
        )
        guard response.statusCode < 400,
              Self.sameOrigin(response.url, baseURL) else {
            let envelope = try? JSONDecoder().decode(CaptureAudioMasteryErrorEnvelope.self, from: data)
            throw ClientError.message(envelope?.error ?? "Quipsly could not check this recording's audio.")
        }
        let decoded = try JSONDecoder().decode(CaptureAudioMasterySnapshot.self, from: data)
        guard decoded.ok else {
            throw ClientError.message(decoded.error ?? "Quipsly could not check this recording's audio.")
        }
        try validate(binding)
        return decoded
    }

    private func reconcileUntilSettled(
        _ initial: CaptureAudioMasterySnapshot,
        binding: RecordingBinding
    ) async throws -> CaptureAudioMasterySnapshot {
        var current = initial
        var attempts = 0
        while current.isWorking && attempts < 120 && !Task.isCancelled {
            try await Task.sleep(for: .seconds(2.5))
            try Task.checkCancellation()
            current = try await operate("reconcile", binding: binding)
            acceptSnapshot(current)
            reconcilePlaybackAuthorization(with: current, binding: binding)
            attempts += 1
        }
        return current
    }

    private func acceptSnapshot(_ current: CaptureAudioMasterySnapshot) {
        if evidenceJobID != current.jobId {
            resetReviewEvidence()
            evidenceJobID = current.jobId
        }
        snapshot = current
    }

    private func startPlaybackTimer() {
        stopPlaybackTimer()
        let timer = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self,
                      let player = self.player,
                      player.isPlaying,
                      self.snapshot?.jobId == self.evidenceJobID,
                      let durationSeconds = self.snapshot?.derivative?.measured?.durationSeconds else { return }
                self.previewListenedSecondBins.insert(
                    Self.boundedSecondBin(player.currentTime, durationSeconds: durationSeconds)
                )
                if let mode = self.activePreviewMonitorMode {
                    self.observedMonitorModes.insert(mode)
                }
            }
        }
        playbackTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func stopPlaybackTimer() {
        playbackTimer?.invalidate()
        playbackTimer = nil
    }

    private func resetReviewEvidence() {
        sourceListenedSecondBins = []
        previewListenedSecondBins = []
        observedMonitorModes = []
        evidenceJobID = nil
        activePreviewMonitorMode = nil
        reviewRequestIDs = [:]
    }

    private func binding(for recording: LocalRecording) -> RecordingBinding? {
        guard let ownerAccountID = Self.nonempty(recording.ownerAccountID),
              ownerAccountID == AuthManager.currentStoredOwnerID(),
              let projectSlug = Self.nonempty(recording.projectSlug),
              let assetID = Self.nonempty(recording.uploadedMediaAssetId),
              let sourceID = Self.nonempty(recording.uploadedSourceId) else { return nil }
        return RecordingBinding(
            recordingID: recording.id,
            ownerAccountID: ownerAccountID,
            projectSlug: projectSlug,
            assetID: assetID,
            sourceID: sourceID
        )
    }

    private func validate(_ binding: RecordingBinding) throws {
        guard let current = LocalRecordingLibrary.shared.recording(id: binding.recordingID),
              self.binding(for: current) == binding else {
            throw ClientError.message("The recording or active account changed before this audio check finished.")
        }
    }

    private func playbackURL(_ rawValue: String?) -> URL? {
        guard let rawValue = Self.nonempty(rawValue),
              let candidate = URL(string: rawValue, relativeTo: baseURL)?.absoluteURL,
              Self.sameOrigin(candidate, baseURL),
              candidate.path.hasPrefix("/api/ingest/media/") else { return nil }
        return candidate
    }

    private func reconcilePlaybackAuthorization(
        with snapshot: CaptureAudioMasterySnapshot,
        binding: RecordingBinding
    ) {
        guard player != nil || protectedPreviewURL != nil else { return }
        guard playbackBinding == binding,
              snapshot.status == "completed",
              let derivative = snapshot.derivative,
              Self.normalizedSHA256(derivative.sha256) == playbackSHA256,
              playbackURL(derivative.playbackUrl) != nil else {
            clearPlayback()
            return
        }
    }

    private func clearPlayback() {
        player?.stop()
        player = nil
        isPlaying = false
        stopPlaybackTimer()
        audioSessionCoordinator.endLocalPlayback()
        if let protectedPreviewURL { try? FileManager.default.removeItem(at: protectedPreviewURL) }
        protectedPreviewURL = nil
        playbackBinding = nil
        playbackSHA256 = nil
    }

    private static func requiredBins(
        for moment: CaptureAudioMasterySnapshot.ReviewPlan.Moment,
        durationSeconds: TimeInterval
    ) -> Set<Int> {
        guard durationSeconds.isFinite, durationSeconds > 0 else { return [] }
        let finalBin = max(0, Int(ceil(durationSeconds)) - 1)
        let center = min(max(Int(floor(moment.timeSeconds)), 0), finalBin)
        return Set([center - 1, center, center + 1].map { min(max($0, 0), finalBin) })
    }

    private static func boundedSecondBin(
        _ seconds: TimeInterval,
        durationSeconds: TimeInterval
    ) -> Int {
        let finalBin = max(0, Int(ceil(max(durationSeconds, 0))) - 1)
        return min(max(Int(floor(max(seconds, 0))), 0), finalBin)
    }

    private static func supportedMonitorMode(_ rawValue: String) -> String? {
        rawValue == "matched" || rawValue == "delivery" ? rawValue : nil
    }

    private nonisolated static func computeFileDigest(at url: URL) throws -> FileDigest {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        var sizeBytes: Int64 = 0
        while true {
            let data = try handle.read(upToCount: 1_048_576) ?? Data()
            guard !data.isEmpty else { break }
            hasher.update(data: data)
            sizeBytes += Int64(data.count)
        }
        return FileDigest(
            sha256: hasher.finalize().map { String(format: "%02x", $0) }.joined(),
            sizeBytes: sizeBytes
        )
    }

    private nonisolated static func sameOrigin(_ responseURL: URL?, _ baseURL: URL) -> Bool {
        guard let responseURL else { return false }
        return responseURL.scheme?.lowercased() == baseURL.scheme?.lowercased()
            && responseURL.host?.lowercased() == baseURL.host?.lowercased()
            && responseURL.port == baseURL.port
    }

    private nonisolated static func normalizedSHA256(_ value: String?) -> String? {
        guard let normalized = nonempty(value)?.lowercased(),
              normalized.count == 64,
              normalized.unicodeScalars.allSatisfy({
                  CharacterSet(charactersIn: "0123456789abcdef").contains($0)
              }) else { return nil }
        return normalized
    }

    private nonisolated static func clampedPlaybackTime(
        _ requestedSeconds: TimeInterval,
        duration: TimeInterval
    ) -> TimeInterval {
        min(max(requestedSeconds.isFinite ? requestedSeconds : 0, 0), max(duration - 0.05, 0))
    }

    private nonisolated static func clampedVolume(_ requestedVolume: Float) -> Float {
        min(max(requestedVolume.isFinite ? requestedVolume : 1, 0), 1)
    }

    private nonisolated static func nonempty(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }

    private enum ClientError: LocalizedError {
        case message(String)

        var errorDescription: String? {
            switch self { case .message(let message): message }
        }
    }
}
