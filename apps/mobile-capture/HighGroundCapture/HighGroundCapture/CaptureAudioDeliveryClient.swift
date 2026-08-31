import AVFoundation
import Combine
import CryptoKit
import Foundation

struct CaptureAudioDeliverySnapshot: Decodable, Equatable {
    struct Output: Decodable, Equatable {
        let playbackUrl: String?
        let sha256: String
        let sizeBytes: Int64
        let durationSeconds: TimeInterval
        let codec: String
        let codecProfile: String
        let sampleRateHz: Int
        let channels: Int
        let bitrateBps: Int
        let integratedLufs: Double
        let truePeakDbtp: Double
        let fastStart: Bool
        let completeDecode: Bool
    }

    struct ReviewSummary: Decodable, Equatable {
        struct Receipt: Decodable, Equatable {
            let id: String
            let jobId: String
            let clientRequestId: String?
            let decision: String
            let note: String?
            let reviewedAt: String
            let actorEmail: String
        }

        let latest: Receipt?
        let approvalCount: Int
        let rejectionCount: Int
    }

    let ok: Bool
    let jobId: String?
    let status: String
    let masteryJobId: String?
    let promotionReceiptId: String?
    let profileId: String?
    let output: Output?
    var review: ReviewSummary
    let promotionStillActive: Bool
    let error: String?

    var isWorking: Bool {
        ["queued", "processing", "output-ready"].contains(status)
    }
}

struct CaptureAudioDeliveryCoverage: Equatable {
    let requiredSecondBins: Set<Int>
    let listenedSecondBins: Set<Int>

    var missingSecondBins: Set<Int> { requiredSecondBins.subtracting(listenedSecondBins) }
    var approvalReady: Bool { !requiredSecondBins.isEmpty && missingSecondBins.isEmpty }
}

private struct CaptureAudioDeliveryErrorEnvelope: Decodable {
    let code: String?
    let error: String?
}

private struct CaptureAudioDeliveryReviewResponse: Decodable {
    let ok: Bool
    let receipt: CaptureAudioDeliverySnapshot.ReviewSummary.Receipt?
    let review: CaptureAudioDeliverySnapshot.ReviewSummary?
    let error: String?
}

private struct CaptureAudioDeliveryReviewRequest: Encodable {
    struct PlaybackEvidence: Encodable {
        let schema: String
        let listenedSecondBins: [Int]
        let completedAt: Date
    }

    let projectSlug: String
    let assetId: String
    let sourceId: String
    let deliveryJobId: String
    let clientRequestId: String
    let decision: String
    let playbackEvidence: PlaybackEvidence
    let note: String?
}

/// Owns the encoded AAC artifact lifecycle only. It never promotes a master,
/// creates an output packet, shares media, publishes, or mutates source bytes.
@MainActor
final class CaptureAudioDeliveryClient: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var snapshot: CaptureAudioDeliverySnapshot?
    @Published private(set) var isLoading = false
    @Published private(set) var isPlaying = false
    @Published private(set) var isReviewing = false
    @Published private(set) var notice: String?
    @Published private(set) var listenedSecondBins: Set<Int> = []
    @Published private(set) var savedDecision: PendingCaptureAudioDeliveryReview?

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
    private let decisionOutbox = CaptureAudioDecisionOutbox.shared
    private var player: AVAudioPlayer?
    private var protectedArtifactURL: URL?
    private var playbackTimer: Timer?
    private var currentBinding: RecordingBinding?
    private var playbackBinding: RecordingBinding?
    private var playbackSHA256: String?
    private var playbackSizeBytes: Int64?
    private var evidenceJobID: String?
    private var accountCancellable: AnyCancellable?
    private var outboxCancellable: AnyCancellable?

    override init() {
        super.init()
        accountCancellable = NotificationCenter.default.publisher(
            for: .quipslyCaptureAccountIdentityDidChange
        ).sink { [weak self] _ in
            Task { @MainActor in self?.reset() }
        }
        outboxCancellable = decisionOutbox.$entries.sink { [weak self] _ in
            Task { @MainActor in self?.refreshSavedDecision() }
        }
    }

    deinit {
        playbackTimer?.invalidate()
        if let protectedArtifactURL { try? FileManager.default.removeItem(at: protectedArtifactURL) }
    }

    func open(recording: LocalRecording) async {
        guard let binding = binding(for: recording) else {
            reset()
            return
        }
        currentBinding = binding
        isLoading = true
        defer { isLoading = false }
        do {
            let current = try await requestStatus(binding: binding)
            acceptSnapshot(current)
            refreshSavedDecision(binding: binding)
            if let savedDecision, savedDecision.disposition == .pending {
                await sendPersistedReview(savedDecision, binding: binding)
            } else if savedDecision?.disposition == .held {
                notice = savedDecision?.lastErrorMessage ?? "A saved encoded-audio decision needs review before retrying."
            } else {
                notice = nil
            }
        } catch is CancellationError {
            return
        } catch {
            clearPlayback()
            notice = error.localizedDescription
        }
    }

    func prepare(recording: LocalRecording, masteryJobID: String) async {
        guard let binding = binding(for: recording), !masteryJobID.isEmpty else {
            notice = "Select an approved improved copy before preparing delivery audio."
            return
        }
        guard AuthManager.shared.networkActionsAllowed else {
            notice = "Reconnect to Nest to prepare delivery audio."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            var current = try await operate("queue", binding: binding, masteryJobID: masteryJobID)
            acceptSnapshot(current)
            current = try await reconcileUntilSettled(current, binding: binding, masteryJobID: masteryJobID)
            if current.isWorking {
                notice = "Delivery audio is still preparing. Check again in a moment."
            } else if current.status == "failed" {
                notice = current.error ?? "Quipsly could not prepare the encoded audio."
            } else {
                notice = nil
            }
        } catch is CancellationError {
            return
        } catch {
            notice = error.localizedDescription
        }
    }

    func togglePlayback(recording: LocalRecording, from requestedSeconds: TimeInterval = 0, restartIfPlaying: Bool = false) async {
        if let player, player.isPlaying {
            if restartIfPlaying {
                player.currentTime = Self.clampedTime(requestedSeconds, duration: player.duration)
                notice = nil
                return
            }
            player.pause()
            stopPlaybackTimer()
            isPlaying = false
            audioSessionCoordinator.endLocalPlayback()
            return
        }
        if let player {
            do {
                player.currentTime = Self.clampedTime(requestedSeconds, duration: player.duration)
                try audioSessionCoordinator.beginLocalPlayback()
                guard player.play() else { throw ClientError.message("The encoded audio could not begin playback.") }
                isPlaying = true
                startPlaybackTimer()
                notice = nil
            } catch {
                audioSessionCoordinator.endLocalPlayback()
                notice = error.localizedDescription
            }
            return
        }
        guard let binding = binding(for: recording),
              let output = snapshot?.output,
              snapshot?.promotionStillActive == true,
              let expectedSHA256 = Self.normalizedSHA256(output.sha256),
              output.sizeBytes > 0,
              let playbackURL = playbackURL(output.playbackUrl),
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              owner.ownerAccountID == binding.ownerAccountID else {
            notice = "The exact encoded artifact is not available to this account."
            return
        }
        isLoading = true
        defer { isLoading = false }
        do {
            var request = URLRequest(url: playbackURL)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            let (temporaryURL, response) = try await AuthManager.shared.authenticatedDownload(for: request, expectedOwnerAccountID: binding.ownerAccountID)
            guard response.statusCode < 400, Self.sameOrigin(response.url, baseURL) else {
                try? FileManager.default.removeItem(at: temporaryURL)
                throw ClientError.message("The encoded artifact is not available to this account.")
            }
            let digest = try await Task.detached(priority: .userInitiated) { try Self.computeDigest(at: temporaryURL) }.value
            guard digest.sha256 == expectedSHA256, digest.sizeBytes == output.sizeBytes else {
                try? FileManager.default.removeItem(at: temporaryURL)
                throw ClientError.message("The downloaded artifact did not match Quipsly's verified receipt.")
            }
            try validate(binding)
            guard AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
                try? FileManager.default.removeItem(at: temporaryURL)
                throw ClientError.message("The active account changed before encoded playback.")
            }
            clearPlayback()
            let destination = FileManager.default.temporaryDirectory.appendingPathComponent("quipsly-delivery-audio-\(UUID().uuidString.lowercased()).m4a")
            try FileManager.default.moveItem(at: temporaryURL, to: destination)
            try FileManager.default.setAttributes([.protectionKey: FileProtectionType.complete], ofItemAtPath: destination.path)
            protectedArtifactURL = destination
            try audioSessionCoordinator.beginLocalPlayback()
            let player = try AVAudioPlayer(contentsOf: destination)
            player.delegate = self
            player.currentTime = Self.clampedTime(requestedSeconds, duration: player.duration)
            guard player.prepareToPlay(), player.play() else { throw ClientError.message("The encoded artifact could not begin playback.") }
            playbackBinding = binding
            playbackSHA256 = expectedSHA256
            playbackSizeBytes = output.sizeBytes
            self.player = player
            isPlaying = true
            startPlaybackTimer()
            notice = nil
        } catch {
            clearPlayback()
            notice = error.localizedDescription
        }
    }

    func coverage(for status: CaptureAudioDeliverySnapshot) -> CaptureAudioDeliveryCoverage {
        guard let duration = status.output?.durationSeconds, duration.isFinite, duration > 0 else {
            return CaptureAudioDeliveryCoverage(requiredSecondBins: [], listenedSecondBins: listenedSecondBins)
        }
        let finalBin = max(0, Int(floor(duration - 0.001)))
        let anchors = Set([0, Int(floor(duration / 2)), finalBin])
        let required = Set(anchors.flatMap { anchor in [anchor - 1, anchor, anchor + 1].filter { $0 >= 0 && $0 <= finalBin } })
        return CaptureAudioDeliveryCoverage(requiredSecondBins: required, listenedSecondBins: listenedSecondBins)
    }

    func saveReview(recording: LocalRecording, decision: String, note rawNote: String?) async {
        guard let binding = binding(for: recording),
              let status = snapshot,
              let jobID = status.jobId,
              jobID == evidenceJobID,
              let output = status.output,
              let sha256 = Self.normalizedSHA256(output.sha256),
              output.sizeBytes > 0,
              status.promotionStillActive,
              let typedDecision = PendingCaptureAudioDeliveryReview.Decision(rawValue: decision) else {
            notice = "The exact encoded artifact is no longer available for review."
            return
        }
        let note = rawNote?.trimmingCharacters(in: .whitespacesAndNewlines)
        if decision == "approved" && !coverage(for: status).approvalReady {
            notice = "Hear the beginning, middle, and ending before approving the encoded audio."
            return
        }
        if decision == "rejected" && (listenedSecondBins.isEmpty || note?.isEmpty != false) {
            notice = "Hear the encoded audio and add a note before rejecting it."
            return
        }
        let bins = listenedSecondBins.sorted()
        do {
            let entry = try decisionOutbox.enqueueDeliveryReview(
                projectSlug: binding.projectSlug,
                assetID: binding.assetID,
                sourceID: binding.sourceID,
                deliveryJobID: jobID,
                deliverySHA256: sha256,
                deliverySizeBytes: output.sizeBytes,
                decision: typedDecision,
                listenedSecondBins: bins,
                note: note
            )
            savedDecision = entry
            if AuthManager.shared.networkActionsAllowed {
                await sendPersistedReview(entry, binding: binding)
            } else {
                notice = "Decision saved securely on \(CaptureDeviceVocabulary.thisDevice). Quipsly will retry when Nest is reachable."
            }
        } catch {
            notice = error.localizedDescription
        }
    }

    func retrySavedReview(recording: LocalRecording) async {
        guard let binding = binding(for: recording), let entry = savedDecision else { return }
        decisionOutbox.releaseForRetry(entry.id)
        refreshSavedDecision(binding: binding)
        guard let pending = savedDecision else { return }
        await sendPersistedReview(pending, binding: binding)
    }

    func stop() {
        player?.stop()
        stopPlaybackTimer()
        isPlaying = false
        audioSessionCoordinator.endLocalPlayback()
    }

    func reset() {
        clearPlayback()
        snapshot = nil
        isLoading = false
        isReviewing = false
        notice = nil
        listenedSecondBins = []
        evidenceJobID = nil
        savedDecision = nil
        currentBinding = nil
    }

    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.stopPlaybackTimer()
            self.isPlaying = false
            self.audioSessionCoordinator.endLocalPlayback()
            if !flag { self.notice = "Encoded playback ended before iOS could finish the artifact." }
        }
    }

    nonisolated func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
        Task { @MainActor in
            self.clearPlayback()
            self.notice = error?.localizedDescription ?? "The encoded artifact could not be decoded."
        }
    }

    private func refreshSavedDecision(binding: RecordingBinding? = nil) {
        let resolved = binding ?? currentBinding
        guard let resolved else {
            savedDecision = nil
            return
        }
        savedDecision = decisionOutbox.decision(
            projectSlug: resolved.projectSlug,
            assetID: resolved.assetID
        )
    }

    private func sendPersistedReview(
        _ entry: PendingCaptureAudioDeliveryReview,
        binding: RecordingBinding
    ) async {
        guard !isReviewing else { return }
        guard entry.ownerAccountID == binding.ownerAccountID,
              entry.projectSlug == binding.projectSlug,
              entry.assetID == binding.assetID,
              entry.sourceID == binding.sourceID,
              let status = snapshot,
              status.jobId == entry.deliveryJobID,
              status.promotionStillActive,
              let output = status.output,
              Self.normalizedSHA256(output.sha256) == entry.deliverySHA256,
              output.sizeBytes == entry.deliverySizeBytes else {
            decisionOutbox.markHeld(
                entry.id,
                code: "audio-delivery-review-lineage-changed",
                message: "The encoded file changed after this phone decision was saved. Review the current file before retrying."
            )
            refreshSavedDecision(binding: binding)
            notice = savedDecision?.lastErrorMessage
            return
        }
        if status.review.latest?.clientRequestId == entry.clientRequestID {
            let acknowledged = decisionOutbox.markAcknowledged(entry.id)
            refreshSavedDecision(binding: binding)
            notice = acknowledged
                ? "Nest already has this exact encoded-audio decision."
                : "Nest already has this decision. \(CaptureDeviceVocabulary.thisDeviceCapitalized) will confirm its protected outbox on the next refresh."
            return
        }
        guard AuthManager.shared.networkActionsAllowed else {
            decisionOutbox.markRetryable(entry.id, message: "Nest is not reachable yet.")
            refreshSavedDecision(binding: binding)
            notice = "Decision saved securely on \(CaptureDeviceVocabulary.thisDevice). Quipsly will retry when Nest is reachable."
            return
        }

        isReviewing = true
        decisionOutbox.markAttempting(entry.id)
        refreshSavedDecision(binding: binding)
        defer { isReviewing = false }
        do {
            var request = URLRequest(url: baseURL.appendingPathComponent("api/media-vault/audio-delivery/review"))
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let body = CaptureAudioDeliveryReviewRequest(
                projectSlug: entry.projectSlug,
                assetId: entry.assetID,
                sourceId: entry.sourceID,
                deliveryJobId: entry.deliveryJobID,
                clientRequestId: entry.clientRequestID,
                decision: entry.decision.rawValue,
                playbackEvidence: .init(
                    schema: "quipsly-audio-delivery-playback-review-v1",
                    listenedSecondBins: entry.listenedSecondBins,
                    completedAt: entry.completedAt
                ),
                note: entry.note
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            request.httpBody = try encoder.encode(body)
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: binding.ownerAccountID
            )
            guard Self.sameOrigin(response.url, baseURL) else {
                throw ReviewFailure(
                    retryable: false,
                    code: "audio-delivery-review-origin-mismatch",
                    message: "Nest returned the audio decision from an unexpected origin."
                )
            }
            guard response.statusCode < 400 else {
                let envelope = try? JSONDecoder().decode(CaptureAudioDeliveryErrorEnvelope.self, from: data)
                throw ReviewFailure(
                    retryable: Self.isRetryableStatus(response.statusCode),
                    code: envelope?.code ?? "http-\(response.statusCode)",
                    message: envelope?.error ?? "Quipsly could not save this encoded-audio decision."
                )
            }
            let result = try JSONDecoder().decode(CaptureAudioDeliveryReviewResponse.self, from: data)
            guard result.ok, let review = result.review else {
                throw ReviewFailure(
                    retryable: true,
                    code: "audio-delivery-review-receipt-missing",
                    message: result.error ?? "Nest did not return the saved proof-listen receipt."
                )
            }
            if let returnedRequestID = result.receipt?.clientRequestId,
               returnedRequestID != entry.clientRequestID {
                throw ReviewFailure(
                    retryable: false,
                    code: "audio-delivery-review-receipt-mismatch",
                    message: "Nest returned a receipt for a different encoded-audio decision."
                )
            }
            do {
                try validate(binding)
            } catch {
                throw ReviewFailure(
                    retryable: false,
                    code: "audio-delivery-review-local-lineage-changed",
                    message: "Nest saved the decision, but the active recording changed before \(CaptureDeviceVocabulary.thisDevice) could confirm it."
                )
            }
            snapshot?.review = review
            let acknowledged = decisionOutbox.markAcknowledged(entry.id)
            refreshSavedDecision(binding: binding)
            if acknowledged {
                notice = entry.decision == .approved
                    ? "Encoded audio approved as heard. Sharing and publishing have not started."
                    : "Encoded audio rejected as heard. The artifact and history remain available."
            } else {
                notice = "Nest saved the decision. \(CaptureDeviceVocabulary.thisDeviceCapitalized) will confirm its protected outbox on the next refresh."
            }
        } catch is CancellationError {
            refreshSavedDecision(binding: binding)
            notice = "Decision saved securely on \(CaptureDeviceVocabulary.thisDevice). Quipsly will retry after this screen reopens."
        } catch let failure as ReviewFailure {
            if failure.retryable {
                decisionOutbox.markRetryable(entry.id, message: failure.message)
                notice = "Decision saved securely on \(CaptureDeviceVocabulary.thisDevice). \(failure.message)"
            } else {
                decisionOutbox.markHeld(entry.id, code: failure.code, message: failure.message)
                notice = failure.message
            }
            refreshSavedDecision(binding: binding)
        } catch {
            decisionOutbox.markRetryable(entry.id, message: error.localizedDescription)
            refreshSavedDecision(binding: binding)
            notice = "Decision saved securely on \(CaptureDeviceVocabulary.thisDevice). \(error.localizedDescription)"
        }
    }

    private func requestStatus(binding: RecordingBinding) async throws -> CaptureAudioDeliverySnapshot {
        var components = URLComponents(url: baseURL.appendingPathComponent("api/media-vault/audio-delivery"), resolvingAgainstBaseURL: false)
        components?.queryItems = [URLQueryItem(name: "projectSlug", value: binding.projectSlug), URLQueryItem(name: "assetId", value: binding.assetID)]
        guard let url = components?.url else { throw ClientError.message("The configured Nest URL is invalid.") }
        var request = URLRequest(url: url)
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        return try await send(request, binding: binding)
    }

    private func operate(_ action: String, binding: RecordingBinding, masteryJobID: String) async throws -> CaptureAudioDeliverySnapshot {
        var request = URLRequest(url: baseURL.appendingPathComponent("api/media-vault/audio-delivery"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: ["action": action, "projectSlug": binding.projectSlug, "assetId": binding.assetID, "sourceId": binding.sourceID, "masteryJobId": masteryJobID, "profileId": "apple-podcasts-aac-stereo-v1"])
        return try await send(request, binding: binding)
    }

    private func send(_ request: URLRequest, binding: RecordingBinding) async throws -> CaptureAudioDeliverySnapshot {
        guard AuthManager.shared.networkActionsAllowed else { throw ClientError.message("Reconnect to Nest to check delivery audio.") }
        let (data, response) = try await AuthManager.shared.authenticatedData(for: request, expectedOwnerAccountID: binding.ownerAccountID)
        guard response.statusCode < 400, Self.sameOrigin(response.url, baseURL) else {
            let envelope = try? JSONDecoder().decode(CaptureAudioDeliveryErrorEnvelope.self, from: data)
            throw ClientError.message(envelope?.error ?? "Quipsly could not operate delivery audio.")
        }
        let decoded = try JSONDecoder().decode(CaptureAudioDeliverySnapshot.self, from: data)
        guard decoded.ok else { throw ClientError.message(decoded.error ?? "Quipsly could not operate delivery audio.") }
        try validate(binding)
        return decoded
    }

    private func reconcileUntilSettled(_ initial: CaptureAudioDeliverySnapshot, binding: RecordingBinding, masteryJobID: String) async throws -> CaptureAudioDeliverySnapshot {
        var current = initial
        var attempts = 0
        while current.isWorking && attempts < 120 && !Task.isCancelled {
            try await Task.sleep(for: .seconds(2.5))
            try Task.checkCancellation()
            current = try await operate("reconcile", binding: binding, masteryJobID: masteryJobID)
            acceptSnapshot(current)
            attempts += 1
        }
        return current
    }

    private func acceptSnapshot(_ current: CaptureAudioDeliverySnapshot) {
        if evidenceJobID != current.jobId {
            clearPlayback()
            listenedSecondBins = []
            evidenceJobID = current.jobId
        }
        snapshot = current
        if protectedArtifactURL != nil, !playbackIsStillAuthorized(by: current) {
            clearPlayback()
        }
    }

    private func startPlaybackTimer() {
        stopPlaybackTimer()
        let timer = Timer(timeInterval: 0.2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated {
                guard let self, let player = self.player, player.isPlaying, let duration = self.snapshot?.output?.durationSeconds, self.snapshot?.jobId == self.evidenceJobID else { return }
                let finalBin = max(0, Int(ceil(max(duration, 0))) - 1)
                self.listenedSecondBins.insert(min(max(Int(floor(max(player.currentTime, 0))), 0), finalBin))
            }
        }
        playbackTimer = timer
        RunLoop.main.add(timer, forMode: .common)
    }

    private func stopPlaybackTimer() { playbackTimer?.invalidate(); playbackTimer = nil }

    private func binding(for recording: LocalRecording) -> RecordingBinding? {
        guard let owner = Self.nonempty(recording.ownerAccountID), owner == AuthManager.currentStoredOwnerID(), let project = Self.nonempty(recording.projectSlug), let asset = Self.nonempty(recording.uploadedMediaAssetId), let source = Self.nonempty(recording.uploadedSourceId) else { return nil }
        return RecordingBinding(recordingID: recording.id, ownerAccountID: owner, projectSlug: project, assetID: asset, sourceID: source)
    }

    private func validate(_ binding: RecordingBinding) throws {
        guard let current = LocalRecordingLibrary.shared.recording(id: binding.recordingID), self.binding(for: current) == binding else { throw ClientError.message("The recording or active account changed before delivery audio finished.") }
    }

    private func playbackURL(_ raw: String?) -> URL? {
        guard let raw = Self.nonempty(raw), let candidate = URL(string: raw, relativeTo: baseURL)?.absoluteURL, Self.sameOrigin(candidate, baseURL), candidate.path.hasPrefix("/api/ingest/media/") else { return nil }
        return candidate
    }

    private func clearPlayback() {
        player?.stop(); player = nil; stopPlaybackTimer(); isPlaying = false; audioSessionCoordinator.endLocalPlayback()
        if let protectedArtifactURL { try? FileManager.default.removeItem(at: protectedArtifactURL) }
        protectedArtifactURL = nil; playbackBinding = nil; playbackSHA256 = nil; playbackSizeBytes = nil
    }

    private func playbackIsStillAuthorized(by current: CaptureAudioDeliverySnapshot) -> Bool {
        guard current.status == "completed",
              current.promotionStillActive,
              current.jobId == evidenceJobID,
              let output = current.output,
              playbackURL(output.playbackUrl) != nil,
              Self.normalizedSHA256(output.sha256) == playbackSHA256,
              output.sizeBytes == playbackSizeBytes,
              let binding = playbackBinding else { return false }
        do {
            try validate(binding)
            return true
        } catch {
            return false
        }
    }

    private nonisolated static func computeDigest(at url: URL) throws -> FileDigest {
        let handle = try FileHandle(forReadingFrom: url); defer { try? handle.close() }
        var hasher = SHA256(); var size: Int64 = 0
        while true { let data = try handle.read(upToCount: 1_048_576) ?? Data(); guard !data.isEmpty else { break }; hasher.update(data: data); size += Int64(data.count) }
        return FileDigest(sha256: hasher.finalize().map { String(format: "%02x", $0) }.joined(), sizeBytes: size)
    }

    private static func clampedTime(_ requested: TimeInterval, duration: TimeInterval) -> TimeInterval { min(max(requested.isFinite ? requested : 0, 0), max(duration - 0.01, 0)) }
    private static func normalizedSHA256(_ value: String) -> String? { let value = value.lowercased(); return value.range(of: "^[0-9a-f]{64}$", options: .regularExpression) == nil ? nil : value }
    private static func isRetryableStatus(_ status: Int) -> Bool { status == 408 || status == 425 || status == 429 || status >= 500 }
    private static func nonempty(_ value: String?) -> String? { let value = value?.trimmingCharacters(in: .whitespacesAndNewlines); return value?.isEmpty == false ? value : nil }
    private static func sameOrigin(_ url: URL?, _ expected: URL) -> Bool { guard let url, let left = URLComponents(url: url, resolvingAgainstBaseURL: false), let right = URLComponents(url: expected, resolvingAgainstBaseURL: false) else { return false }; return left.scheme?.lowercased() == right.scheme?.lowercased() && left.host?.lowercased() == right.host?.lowercased() && (left.port ?? Self.defaultPort(left.scheme)) == (right.port ?? Self.defaultPort(right.scheme)) }
    private static func defaultPort(_ scheme: String?) -> Int? { scheme?.lowercased() == "https" ? 443 : scheme?.lowercased() == "http" ? 80 : nil }

    private enum ClientError: LocalizedError {
        case message(String)

        var errorDescription: String? {
            switch self { case .message(let message): message }
        }
    }

    private struct ReviewFailure: LocalizedError {
        let retryable: Bool
        let code: String
        let message: String

        var errorDescription: String? { message }
    }
}
