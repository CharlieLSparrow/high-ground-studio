import AVFoundation
import AVKit
import Combine
import CryptoKit
import SwiftUI

struct MobileEpisodeWatchClip: Codable, Hashable, Identifiable {
    let watchId: String?
    let assetId: String
    let sourceId: String?
    let title: String
    let kind: String
    let playbackUrl: String
    let durationSeconds: TimeInterval?
    let rangeStartSeconds: TimeInterval?
    let rangeEndSeconds: TimeInterval?

    var id: String { watchId ?? assetId }
    var isVideo: Bool { kind.lowercased() == "video" }
    var playbackStartSeconds: TimeInterval {
        max(0, rangeStartSeconds ?? 0)
    }
    var playbackEndSeconds: TimeInterval? {
        guard let end = rangeEndSeconds ?? durationSeconds else { return nil }
        return max(playbackStartSeconds, end)
    }

    func clampedPlaybackPosition(_ value: TimeInterval) -> TimeInterval {
        let lowerBound = playbackStartSeconds
        let position = max(lowerBound, value)
        guard let upperBound = playbackEndSeconds else { return position }
        return min(position, upperBound)
    }
}

struct MobileEpisodeWatchSession: Codable, Hashable {
    let id: String
    let startedAt: String
    let startedBy: String
    let recordingRoomId: String?
    let recordingStartedAt: String?
}

struct MobileEpisodeWatchSegment: Codable, Hashable, Identifiable {
    let id: String
    let sessionId: String?
    let clipId: String
    let sourceStartSeconds: TimeInterval
    let sourceEndSeconds: TimeInterval
    let episodeStartSeconds: TimeInterval
    let episodeEndSeconds: TimeInterval
}

struct MobileEpisodeWatchTimelineSync: Codable, Hashable {
    let syncedAt: String
    let syncedBy: String
    let sourceRevision: Int
    let segmentCount: Int
    let timelineClipCount: Int
    let sourceSegmentIds: [String]?
}

struct MobileEpisodeWatchReceipt: Codable, Hashable {
    let id: String
    let clientRequestId: String
    let revision: Int
    let command: String
    let acceptedAt: String
}

struct MobileEpisodeWatchLiveHint: Codable, Hashable {
    static let schemaVersion = "quipsly-episode-watch-hint.v1"
    static let topic = "quipsly.episode-watch.authority.v1"

    let schema: String
    let projectSlug: String
    let episodeSlug: String
    let callRoomId: String
    let revision: Int
    let receiptId: String
    let clientRequestId: String
    let command: String
    let acceptedAt: String
    let sentAt: String

    var hasValidShape: Bool {
        schema == Self.schemaVersion
            && revision > 0
            && !projectSlug.isEmpty
            && !episodeSlug.isEmpty
            && !callRoomId.isEmpty
            && !receiptId.isEmpty
            && !clientRequestId.isEmpty
            && !command.isEmpty
            && Self.parseDate(acceptedAt) != nil
            && Self.parseDate(sentAt) != nil
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value)
            ?? ISO8601DateFormatter().date(from: value)
    }
}

struct MobileEpisodeWatchRoom: Codable, Hashable {
    let revision: Int
    let status: String
    let selectedClipId: String?
    let positionSeconds: TimeInterval
    let effectiveAt: String
    let durationSeconds: TimeInterval?
    let session: MobileEpisodeWatchSession?
    let clips: [MobileEpisodeWatchClip]
    let segments: [MobileEpisodeWatchSegment]?
    let timelineSync: MobileEpisodeWatchTimelineSync?
    let lastCommand: MobileEpisodeWatchReceipt?

    var selectedClip: MobileEpisodeWatchClip? {
        clips.first { $0.id == selectedClipId }
    }

    var watchedSegments: [MobileEpisodeWatchSegment] {
        guard let sessionID = session?.id else { return [] }
        return segments?.filter { $0.sessionId == sessionID } ?? []
    }

    var watchedSegmentIDs: [String] {
        watchedSegments.map(\.id).sorted()
    }

    var watchedSegmentCount: Int { watchedSegments.count }

    var hasTimelineWork: Bool {
        watchedSegmentCount > 0 || (timelineSync?.timelineClipCount ?? 0) > 0
    }

    var timelineIsCurrent: Bool {
        guard let timelineSync,
              timelineSync.segmentCount == watchedSegmentCount,
              timelineSync.timelineClipCount == watchedSegmentCount else {
            return false
        }
        if let sourceSegmentIDs = timelineSync.sourceSegmentIds {
            return sourceSegmentIDs.sorted() == watchedSegmentIDs
        }
        return watchedSegmentCount > 0
            && timelineSync.sourceRevision == revision
    }

    func projectedPosition(at date: Date = Date()) -> TimeInterval {
        let elapsed: TimeInterval
        if status == "playing", let effectiveDate = Self.parseDate(effectiveAt) {
            elapsed = max(0, date.timeIntervalSince(effectiveDate))
        } else {
            elapsed = 0
        }
        let projected = max(0, positionSeconds + elapsed)
        guard let durationSeconds else { return projected }
        return min(projected, max(0, durationSeconds))
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value)
            ?? ISO8601DateFormatter().date(from: value)
    }
}

private struct MobileEpisodeWatchResponse: Codable {
    let ok: Bool
    let code: String?
    let error: String?
    let room: MobileEpisodeWatchRoom?
    let canEdit: Bool?
    let currentRevision: Int?
    let serverNow: String?
}

private struct MobileEpisodeWatchCacheReceipt: Codable {
    let schemaVersion: Int
    let ownerDigest: String
    let assetId: String
    let sourceId: String?
    let playbackUrl: String
    let byteCount: Int64
    let sha256: String
    let downloadedAt: Date
}

@MainActor
final class MobileEpisodeWatchClient: ObservableObject {
    @Published private(set) var room: MobileEpisodeWatchRoom?
    @Published private(set) var canEdit = false
    @Published private(set) var isLoading = false
    @Published private(set) var isMutating = false
    @Published private(set) var isPreparingClip = false
    @Published private(set) var preparedAssetID: String?
    @Published private(set) var player: AVPlayer?
    @Published private(set) var playerItemReady = false
    @Published private(set) var displayPosition: TimeInterval = 0
    @Published private(set) var localPreviewActive = false
    @Published private(set) var sharedConnectionReady = false
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var outboundLiveHint: MobileEpisodeWatchLiveHint?

    private let baseURL: URL
    private let audioSessionCoordinator = CaptureAudioSessionCoordinator.shared
    private var currentContextKey: String?
    private var currentSession: MobileCaptureSession?
    private var preparedClipIdentity: MobileEpisodeWatchClip?
    private var timeObserver: Any?
    private var completionObserver: NSObjectProtocol?
    private var playbackFailureObserver: NSObjectProtocol?
    private var itemStatusCancellable: AnyCancellable?
    private var accountCancellable: AnyCancellable?
    private var routeCancellable: AnyCancellable?
    private var sharedAudioLeaseActive = false
    private var endedAssetID: String?
    private var consecutivePollFailures = 0
    private var loadingRequestID: UUID?
    private var serverClockOffsetSeconds: TimeInterval = 0
    private var serverClockUncertaintySeconds: TimeInterval?

    init() {
        let rawBaseURL = normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL")
                as? String
                ?? "https://nest.quipsly.com"
        )
        baseURL = URL(string: rawBaseURL)
            ?? URL(string: "https://nest.quipsly.com")!
        accountCancellable = NotificationCenter.default.publisher(
            for: .quipslyCaptureAccountIdentityDidChange
        ).sink { [weak self] _ in
            Task { @MainActor in
                self?.resetForAccountChange()
            }
        }
        routeCancellable = audioSessionCoordinator
            .$sharedWatchRouteFailureMessage
            .compactMap { $0 }
            .sink { [weak self] message in
                Task { @MainActor in
                    self?.holdForUnsafeAudioRoute(message)
                }
            }
    }

    deinit {
        if let completionObserver {
            NotificationCenter.default.removeObserver(completionObserver)
        }
        if let playbackFailureObserver {
            NotificationCenter.default.removeObserver(playbackFailureObserver)
        }
    }

    var selectedClip: MobileEpisodeWatchClip? { room?.selectedClip }
    var isPrepared: Bool {
        guard let selectedClip else { return false }
        return preparedAssetID == selectedClip.id
            && preparedClipIdentity == selectedClip
            && player != nil
            && playerItemReady
    }
    var isCheckingPlayback: Bool {
        player != nil && !playerItemReady
    }
    var isSharedPlaying: Bool {
        room?.status == "playing" && !localPreviewActive
    }
    var statusLabel: String {
        if isPreparingClip { return "Preparing clip" }
        if isCheckingPlayback { return "Checking playback" }
        if localPreviewActive { return "Private preview" }
        switch room?.status {
        case "playing": return isPrepared ? "Playing together" : "Playing · prepare needed"
        case "paused": return "Paused together"
        case "ended": return "Watch complete"
        case "idle": return "Choose a clip"
        default: return "Loading Watch"
        }
    }

    func loadPreview(session: MobileCaptureSession) {
        let previewState = Self.previewState
        let currentPassID = "preview-watch-pass-current"
        let currentSegmentID = "preview-watch-segment-current"
        let previousSegmentID = "preview-watch-segment-previous"
        let watchSession: MobileEpisodeWatchSession?
        let segments: [MobileEpisodeWatchSegment]
        let timelineSync: MobileEpisodeWatchTimelineSync?

        switch previewState {
        case .staged:
            watchSession = nil
            segments = []
            timelineSync = nil
        case .currentPass:
            watchSession = MobileEpisodeWatchSession(
                id: currentPassID,
                startedAt: "2026-07-30T16:00:00.000Z",
                startedBy: "preview-host",
                recordingRoomId: session.callRoomId,
                recordingStartedAt: "2026-07-30T16:00:00.000Z"
            )
            segments = [
                MobileEpisodeWatchSegment(
                    id: currentSegmentID,
                    sessionId: currentPassID,
                    clipId: "preview-be-curious",
                    sourceStartSeconds: 38.4,
                    sourceEndSeconds: 51.2,
                    episodeStartSeconds: 420.0,
                    episodeEndSeconds: 432.8
                ),
            ]
            timelineSync = MobileEpisodeWatchTimelineSync(
                syncedAt: "2026-07-30T16:12:00.000Z",
                syncedBy: "preview-host",
                sourceRevision: 7,
                segmentCount: 1,
                timelineClipCount: 1,
                sourceSegmentIds: [currentSegmentID]
            )
        case .previousPass:
            watchSession = MobileEpisodeWatchSession(
                id: currentPassID,
                startedAt: "2026-07-30T16:20:00.000Z",
                startedBy: "preview-host",
                recordingRoomId: session.callRoomId,
                recordingStartedAt: "2026-07-30T16:20:00.000Z"
            )
            segments = [
                MobileEpisodeWatchSegment(
                    id: previousSegmentID,
                    sessionId: "preview-watch-pass-previous",
                    clipId: "preview-be-curious",
                    sourceStartSeconds: 12.0,
                    sourceEndSeconds: 24.0,
                    episodeStartSeconds: 180.0,
                    episodeEndSeconds: 192.0
                ),
            ]
            timelineSync = MobileEpisodeWatchTimelineSync(
                syncedAt: "2026-07-30T16:18:00.000Z",
                syncedBy: "preview-host",
                sourceRevision: 7,
                segmentCount: 1,
                timelineClipCount: 1,
                sourceSegmentIds: [previousSegmentID]
            )
        }

        currentSession = session
        currentContextKey = "preview|\(session.id)"
        canEdit = true
        sharedConnectionReady = true
        room = MobileEpisodeWatchRoom(
            revision: 8,
            status: "paused",
            selectedClipId: "preview-be-curious",
            positionSeconds: 43.2,
            effectiveAt: ISO8601DateFormatter().string(from: Date()),
            durationSeconds: 51.2,
            session: watchSession,
            clips: [
                MobileEpisodeWatchClip(
                    watchId: "preview-be-curious",
                    assetId: "preview-be-curious",
                    sourceId: "preview-source-be-curious",
                    title: "Ted Lasso · Be Curious",
                    kind: "video",
                    playbackUrl: "/preview/be-curious.mp4",
                    durationSeconds: 254.63,
                    rangeStartSeconds: 38.4,
                    rangeEndSeconds: 51.2
                ),
                MobileEpisodeWatchClip(
                    watchId: "preview-i-love-lucy",
                    assetId: "preview-i-love-lucy",
                    sourceId: "preview-source-i-love-lucy",
                    title: "I Love Lucy",
                    kind: "video",
                    playbackUrl: "/preview/i-love-lucy.mp4",
                    durationSeconds: 135.35,
                    rangeStartSeconds: nil,
                    rangeEndSeconds: nil
                ),
                MobileEpisodeWatchClip(
                    watchId: "preview-lotr-ring-back",
                    assetId: "preview-lotr-ring-back",
                    sourceId: "preview-source-lotr-ring-back",
                    title: "LOTR · Ring Back",
                    kind: "video",
                    playbackUrl: "/preview/lotr-ring-back.mp4",
                    durationSeconds: 240.91,
                    rangeStartSeconds: nil,
                    rangeEndSeconds: nil
                )
            ],
            segments: segments,
            timelineSync: timelineSync,
            lastCommand: MobileEpisodeWatchReceipt(
                id: "preview-receipt-8",
                clientRequestId: "preview-command-8",
                revision: 8,
                command: "PAUSE",
                acceptedAt: "2026-07-30T16:20:00.000Z"
            )
        )
        displayPosition = 43.2
        statusMessage = switch previewState {
        case .staged:
            "Lead clip is staged for the episode rehearsal."
        case .currentPass:
            "The exact current Watch pass is already assembled in Nest."
        case .previousPass:
            "A previous Watch pass remains assembled; the current pass is empty."
        }
        errorMessage = nil
    }

    private enum PreviewState: String {
        case staged
        case currentPass = "current-pass"
        case previousPass = "previous-pass"
    }

    private static var previewState: PreviewState {
        #if DEBUG
        let prefix = "--capture-watch-preview-state="
        guard let argument = ProcessInfo.processInfo.arguments.first(
            where: { $0.hasPrefix(prefix) }
        ) else {
            return .staged
        }
        return PreviewState(
            rawValue: String(argument.dropFirst(prefix.count))
        ) ?? .staged
        #else
        return .staged
        #endif
    }

    func stop() {
        stopPlayer()
    }

    static func clearProtectedCache() {
        guard let cacheRoot = sharedWatchCacheRoot() else { return }
        try? FileManager.default.removeItem(at: cacheRoot)
    }

    func sharedClockReady(
        for session: MobileCaptureSession,
        captureIsActive: Bool
    ) -> Bool {
        room?.session?.recordingRoomId == session.callRoomId || captureIsActive
    }

    func load(session: MobileCaptureSession, quiet: Bool = false) async {
        guard let context = context(for: session) else {
            resetForContextChange()
            errorMessage = "This Session is not attached to an episode Watch room."
            return
        }
        currentSession = session
        if currentContextKey != context.key {
            resetForContextChange()
            currentContextKey = context.key
            currentSession = session
        }
        guard loadingRequestID == nil else { return }
        let requestID = UUID()
        loadingRequestID = requestID
        if !quiet { isLoading = true }
        defer {
            if loadingRequestID == requestID {
                loadingRequestID = nil
                if !quiet { isLoading = false }
            }
        }

        do {
            var components = URLComponents(
                url: context.endpoint,
                resolvingAgainstBaseURL: false
            )
            components?.queryItems = [
                URLQueryItem(name: "episode", value: context.episodeSlug),
                URLQueryItem(name: "watch", value: "1"),
                URLQueryItem(name: "watchProtocol", value: "2"),
            ]
            guard let url = components?.url else { throw URLError(.badURL) }
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.timeoutInterval = 20
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            let requestStartedAt = Date()
            let (data, response) = try await withTaskCancellationHandler {
                try await AuthManager.shared.authenticatedData(for: request)
            } onCancel: {
                Task { @MainActor [weak self] in
                    guard self?.loadingRequestID == requestID else { return }
                    self?.loadingRequestID = nil
                    if !quiet { self?.isLoading = false }
                }
            }
            try Task.checkCancellation()
            let payload = try JSONDecoder().decode(
                MobileEpisodeWatchResponse.self,
                from: data
            )
            guard response.statusCode < 400, payload.ok, let nextRoom = payload.room else {
                throw NSError(
                    domain: "MobileEpisodeWatch",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            payload.error ?? "The shared Watch room is unavailable."
                    ]
                )
            }
            let recoveredFromStaleConnection =
                quiet && (consecutivePollFailures >= 3 || !sharedConnectionReady)
            let nextCanEdit = payload.canEdit == true
            if canEdit != nextCanEdit {
                canEdit = nextCanEdit
            }
            consecutivePollFailures = 0
            if !sharedConnectionReady {
                sharedConnectionReady = true
            }
            updateServerClock(
                serverNow: payload.serverNow,
                requestStartedAt: requestStartedAt
            )
            // A one-second collaboration poll should not invalidate the whole
            // SwiftUI tree when the canonical room is unchanged. Apart from
            // wasting battery, unconditional @Published writes can keep the
            // accessibility tree perpetually non-quiescent for VoiceOver and
            // UI automation.
            if room != nextRoom {
                apply(nextRoom)
            }
            if !quiet {
                statusMessage = selectedClip.map {
                    "\($0.title) is ready in the shared episode room."
                }
                errorMessage = nil
            } else if recoveredFromStaleConnection {
                statusMessage = "Shared Watch reconnected to the episode room."
                errorMessage = nil
            }
        } catch {
            if Task.isCancelled || error is CancellationError {
                return
            }
            if quiet {
                consecutivePollFailures += 1
                if consecutivePollFailures >= 3 {
                    if sharedConnectionReady {
                        sharedConnectionReady = false
                        player?.pause()
                        endSharedAudioLease()
                    }
                    let disconnectedMessage =
                        "Shared Watch lost contact with Nest. Local media is preserved and playback is paused while Quipsly reconnects."
                    if errorMessage != disconnectedMessage {
                        errorMessage = disconnectedMessage
                    }
                }
            } else {
                sharedConnectionReady = false
                errorMessage = error.localizedDescription
            }
        }
    }

    func poll(session: MobileCaptureSession) async {
        while !Task.isCancelled {
            do {
                // Poll tightly while connected for responsive shared control,
                // then back off after repeated failures. LiveKit hints still
                // trigger an immediate permission-checked refresh.
                let delaySeconds = consecutivePollFailures >= 3 ? 5.0 : 1.0
                try await Task.sleep(for: .seconds(delaySeconds))
            } catch {
                return
            }
            guard context(for: session)?.key == currentContextKey else { return }
            await load(session: session, quiet: true)
        }
    }

    func receiveLiveHint(
        _ hint: MobileEpisodeWatchLiveHint,
        session: MobileCaptureSession
    ) async {
        guard hint.hasValidShape,
              let context = context(for: session),
              hint.projectSlug == context.projectSlug,
              hint.episodeSlug == context.episodeSlug,
              hint.callRoomId == session.callRoomId,
              hint.revision > (room?.revision ?? -1) else { return }
        await load(session: session, quiet: true)
    }

    func prepareSelectedClip() async {
        guard let clip = selectedClip else {
            errorMessage = "Choose a shared Watch clip first."
            return
        }
        guard let owner = AuthManager.shared.stableOwnerSnapshot() else {
            errorMessage = "Sign in again before protecting this shared clip on the iPhone."
            return
        }
        if restoreCachedClip(clip: clip, owner: owner) {
            statusMessage = "Checking \(clip.title) for playback…"
            errorMessage = nil
            return
        }
        guard let playbackURL = resolvedPlaybackURL(clip.playbackUrl) else {
            errorMessage = "Quipsly returned an invalid Watch playback URL."
            return
        }

        isPreparingClip = true
        errorMessage = nil
        statusMessage = "Downloading the protected Watch source…"
        defer { isPreparingClip = false }

        do {
            var request = URLRequest(url: playbackURL)
            request.httpMethod = "GET"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            let (temporaryURL, response) = try await AuthManager.shared
                .authenticatedDownload(
                    for: request,
                    expectedOwnerAccountID: owner.ownerAccountID
                )
            defer { try? FileManager.default.removeItem(at: temporaryURL) }
            guard let finalURL = response.url,
                  resolvedPlaybackURL(finalURL.absoluteString) != nil else {
                throw NSError(
                    domain: "MobileEpisodeWatch",
                    code: 3,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "The protected Watch source redirected outside the configured Nest origin."
                    ]
                )
            }
            guard response.statusCode < 400 else {
                throw NSError(
                    domain: "MobileEpisodeWatch",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "The protected Watch source returned HTTP \(response.statusCode)."
                    ]
                )
            }
            guard AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
                throw NSError(
                    domain: "MobileEpisodeWatch",
                    code: 401,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "The Quipsly account changed before the Watch source could be protected."
                    ]
                )
            }
            let receipt = try preserveDownloadedClip(
                temporaryURL: temporaryURL,
                clip: clip,
                owner: owner
            )
            if response.expectedContentLength > 0,
               response.expectedContentLength != receipt.byteCount {
                removeCachedClip(clip: clip, owner: owner)
                throw NSError(
                    domain: "MobileEpisodeWatch",
                    code: 2,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "The Watch download ended at a different byte count than the protected server response."
                    ]
                )
            }
            guard receipt.byteCount > 0,
                  AuthManager.shared.matchesStableOwnerSnapshot(owner),
                  restoreCachedClip(clip: clip, owner: owner) else {
                removeCachedClip(clip: clip, owner: owner)
                throw NSError(
                    domain: "MobileEpisodeWatch",
                    code: 2,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "The downloaded Watch source could not be validated and was removed."
                    ]
                )
            }
            statusMessage =
                "\(clip.title) downloaded · \(ByteCountFormatter.string(fromByteCount: receipt.byteCount, countStyle: .file)). Checking playback…"
        } catch {
            errorMessage = error.localizedDescription
            statusMessage = nil
        }
    }

    func togglePreview() {
        guard let player, isPrepared else {
            errorMessage = "Prepare the selected clip before previewing it."
            return
        }
        if localPreviewActive {
            player.pause()
            localPreviewActive = false
            endSharedAudioLease()
            statusMessage = "Private preview paused. Shared Watch did not change."
            return
        }
        do {
            try beginSharedAudioLease()
            localPreviewActive = true
            endedAssetID = nil
            let current = player.currentTime().seconds
            let target = selectedClip?.clampedPlaybackPosition(
                current.isFinite ? current : 0
            ) ?? 0
            if !current.isFinite || abs(current - target) > 0.04 {
                player.seek(
                    to: CMTime(seconds: target, preferredTimescale: 600),
                    toleranceBefore: .zero,
                    toleranceAfter: .zero
                )
                displayPosition = target
            }
            player.play()
            statusMessage = "Private iPhone preview · not added to the shared timeline."
            errorMessage = nil
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func removePreparedClip() {
        guard let clip = selectedClip,
              let owner = AuthManager.shared.stableOwnerSnapshot() else {
            errorMessage = "Sign in again before managing this protected Watch download."
            return
        }
        guard isPrepared else {
            statusMessage = "This Watch clip is not downloaded on this iPhone."
            errorMessage = nil
            return
        }
        guard !isSharedPlaying, !localPreviewActive, !isMutating else {
            errorMessage = "Pause Watch before removing its downloaded copy."
            return
        }
        stopPlayer()
        removeCachedClip(clip: clip, owner: owner)
        statusMessage =
            "Downloaded copy removed from this iPhone. The protected Nest source is unchanged."
        errorMessage = nil
    }

    func syncWatchedSpans(session: MobileCaptureSession) async {
        guard canEdit, sharedConnectionReady else {
            errorMessage = "Wait for shared Watch to reconnect before sending spans to the editor."
            return
        }
        guard let room, room.hasTimelineWork else {
            errorMessage = "Watch and pause part of a clip before sending spans to the editor."
            return
        }
        guard room.status != "playing" else {
            errorMessage = "Pause shared Watch before sending watched spans to the editor."
            return
        }
        if room.timelineIsCurrent {
            statusMessage = room.watchedSegmentCount > 0
                ? "\(room.watchedSegmentCount) watched \(room.watchedSegmentCount == 1 ? "span is" : "spans are") already in the editor."
                : "The previous Watch pass is already cleared from the editor."
            errorMessage = nil
            return
        }
        await sendCommand(type: "SYNC_TIMELINE", session: session)
    }

    func selectClip(
        _ clip: MobileEpisodeWatchClip,
        session: MobileCaptureSession
    ) async {
        guard canEdit, sharedConnectionReady else {
            errorMessage = "Wait for shared Watch to reconnect before choosing a clip."
            return
        }
        guard room?.status != "playing" else {
            errorMessage = "Pause shared Watch before choosing the next clip."
            return
        }
        guard selectedClip?.id != clip.id else {
            statusMessage = "\(clip.title) is already selected."
            errorMessage = nil
            return
        }
        await sendCommand(
            type: "SELECT_CLIP",
            session: session,
            positionSeconds: 0,
            clipID: clip.id
        )
    }

    func toggleSharedPlayback(
        session: MobileCaptureSession,
        captureIsActive: Bool
    ) async {
        guard canEdit else {
            errorMessage = "This Quipsly account can follow Watch but cannot control it."
            return
        }
        guard sharedConnectionReady else {
            errorMessage = "Wait for shared Watch to reconnect before controlling the episode."
            return
        }
        if room?.status == "playing" {
            await sendCommand(
                type: "PAUSE",
                session: session,
                positionSeconds: displayPosition
            )
            return
        }
        if !isPrepared {
            await prepareSelectedClip()
            if !isPrepared { return }
        }
        guard sharedClockReady(for: session, captureIsActive: captureIsActive) else {
            errorMessage =
                "Start the episode recording first so Watch has the same durable timeline clock. Use Preview to check the clip without changing the room."
            return
        }

        if room?.session?.recordingRoomId != session.callRoomId {
            let bound = await sendCommand(
                type: "START_SESSION",
                session: session,
                recordingRoomId: session.callRoomId
            )
            if !bound { return }
        }
        await sendCommand(
            type: "PLAY",
            session: session,
            positionSeconds: displayPosition
        )
    }

    func seekShared(
        by delta: TimeInterval,
        session: MobileCaptureSession,
        captureIsActive: Bool
    ) async {
        guard canEdit,
              sharedConnectionReady,
              sharedClockReady(for: session, captureIsActive: captureIsActive)
        else {
            errorMessage = "Start the episode recording before changing shared Watch position."
            return
        }
        let target = min(
            max(
                selectedClip?.playbackStartSeconds ?? 0,
                displayPosition + delta
            ),
            selectedClip?.playbackEndSeconds ?? .greatestFiniteMagnitude
        )
        await sendCommand(
            type: "SEEK",
            session: session,
            positionSeconds: target,
            fromPositionSeconds: displayPosition
        )
    }

    @discardableResult
    private func sendCommand(
        type: String,
        session: MobileCaptureSession,
        positionSeconds: TimeInterval? = nil,
        fromPositionSeconds: TimeInterval? = nil,
        recordingRoomId: String? = nil,
        clipID: String? = nil,
        clientRequestID: UUID = UUID(),
        retryConflict: Bool = true
    ) async -> Bool {
        guard let context = context(for: session), let room else {
            errorMessage = "Refresh the shared Watch room before controlling it."
            return false
        }
        isMutating = true
        defer { isMutating = false }

        do {
            var body: [String: Any] = [
                "episodeSlug": context.episodeSlug,
                "type": type,
                "clientRequestId": "capture-watch-\(clientRequestID.uuidString.lowercased())",
                "expectedRevision": room.revision,
            ]
            if let positionSeconds {
                body["positionSeconds"] = max(0, positionSeconds)
            }
            if let fromPositionSeconds {
                body["fromPositionSeconds"] = max(0, fromPositionSeconds)
            }
            if let recordingRoomId {
                body["recordingRoomId"] = recordingRoomId
            }
            if let clipID {
                body["clipId"] = clipID
            }
            var request = URLRequest(url: context.endpoint)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let requestStartedAt = Date()
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request
            )
            let payload = try JSONDecoder().decode(
                MobileEpisodeWatchResponse.self,
                from: data
            )
            if response.statusCode == 409,
               retryConflict,
               payload.currentRevision != nil {
                await load(session: session, quiet: true)
                return await sendCommand(
                    type: type,
                    session: session,
                    positionSeconds: positionSeconds,
                    fromPositionSeconds: fromPositionSeconds,
                    recordingRoomId: recordingRoomId,
                    clipID: clipID,
                    clientRequestID: clientRequestID,
                    retryConflict: false
                )
            }
            guard response.statusCode < 400, payload.ok, let nextRoom = payload.room else {
                throw NSError(
                    domain: "MobileEpisodeWatch",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            payload.error ?? "Shared Watch could not save that control."
                    ]
                )
            }
            localPreviewActive = false
            updateServerClock(
                serverNow: payload.serverNow,
                requestStartedAt: requestStartedAt
            )
            apply(nextRoom)
            if let receipt = nextRoom.lastCommand,
               receipt.revision == nextRoom.revision {
                outboundLiveHint = MobileEpisodeWatchLiveHint(
                    schema: MobileEpisodeWatchLiveHint.schemaVersion,
                    projectSlug: context.projectSlug,
                    episodeSlug: context.episodeSlug,
                    callRoomId: session.callRoomId,
                    revision: receipt.revision,
                    receiptId: receipt.id,
                    clientRequestId: receipt.clientRequestId,
                    command: receipt.command,
                    acceptedAt: receipt.acceptedAt,
                    sentAt: Self.iso8601String(Date())
                )
            }
            statusMessage = commandStatusMessage(type)
            errorMessage = nil
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func apply(_ nextRoom: MobileEpisodeWatchRoom) {
        let previousClip = room?.selectedClip
        room = nextRoom
        displayPosition = projectedPosition(nextRoom)
        if previousClip != nextRoom.selectedClip {
            stopPlayer()
            if let clip = nextRoom.selectedClip,
               let owner = AuthManager.shared.stableOwnerSnapshot() {
                _ = restoreCachedClip(clip: clip, owner: owner)
            }
        }
        synchronizePlayerToRoom()
    }

    private func synchronizePlayerToRoom() {
        guard !localPreviewActive, let room, let player, isPrepared else { return }
        let target = projectedPosition(room)
        displayPosition = target
        let current = player.currentTime().seconds
        if current.isFinite, abs(current - target) > 0.5 {
            player.seek(
                to: CMTime(seconds: target, preferredTimescale: 600),
                toleranceBefore: .zero,
                toleranceAfter: .zero
            )
        }
        if room.status == "playing" {
            do {
                try beginSharedAudioLease()
                endedAssetID = nil
                player.play()
            } catch {
                player.pause()
                errorMessage = error.localizedDescription
            }
        } else {
            player.pause()
            endSharedAudioLease()
        }
    }

    private func preparePlayer(
        fileURL: URL,
        clip: MobileEpisodeWatchClip
    ) {
        stopPlayer()
        let item = AVPlayerItem(url: fileURL)
        let nextPlayer = AVPlayer(playerItem: item)
        nextPlayer.actionAtItemEnd = .pause
        playerItemReady = false
        completionObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemDidPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                await self?.handlePlaybackEnded()
            }
        }
        playbackFailureObserver = NotificationCenter.default.addObserver(
            forName: .AVPlayerItemFailedToPlayToEndTime,
            object: item,
            queue: .main
        ) { [weak self] notification in
            let error = notification.userInfo?[
                AVPlayerItemFailedToPlayToEndTimeErrorKey
            ] as? Error
            Task { @MainActor in
                await self?.handlePlaybackFailed(error)
            }
        }
        player = nextPlayer
        preparedAssetID = clip.id
        preparedClipIdentity = clip
        itemStatusCancellable = item.publisher(for: \.status)
            .receive(on: DispatchQueue.main)
            .sink { [weak self, weak item] status in
                Task { @MainActor in
                    guard let self,
                          let item,
                          self.player?.currentItem === item,
                          self.preparedClipIdentity == clip else { return }
                    switch status {
                    case .readyToPlay:
                        self.playerItemReady = true
                        self.statusMessage = "\(clip.title) is ready to play."
                        self.errorMessage = nil
                        self.synchronizePlayerToRoom()
                    case .failed:
                        await self.handlePlaybackFailed(item.error)
                    case .unknown:
                        break
                    @unknown default:
                        break
                    }
                }
            }
        timeObserver = nextPlayer.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
            queue: .main
        ) { time in
            let seconds = time.seconds
            Task { @MainActor [weak self] in
                guard let self else { return }
                if seconds.isFinite {
                    let position = clip.clampedPlaybackPosition(seconds)
                    self.displayPosition = position
                    if let rangeEnd = clip.rangeEndSeconds,
                       seconds >= rangeEnd - 0.04,
                       self.endedAssetID != self.preparedAssetID {
                        await self.handlePlaybackEnded()
                    }
                }
            }
        }
    }

    private func handlePlaybackEnded() async {
        let completedIdentity = preparedAssetID
        guard endedAssetID != completedIdentity else { return }
        endedAssetID = completedIdentity
        player?.pause()
        endSharedAudioLease()
        if localPreviewActive {
            localPreviewActive = false
            statusMessage = "Private preview finished. Shared Watch did not change."
            return
        }
        guard room?.status == "playing",
              let currentSession else { return }
        await sendCommand(
            type: "ENDED",
            session: currentSession,
            positionSeconds:
                selectedClip?.playbackEndSeconds ?? displayPosition
        )
    }

    private func handlePlaybackFailed(_ error: Error?) async {
        let failedClip = preparedClipIdentity ?? selectedClip
        let failedDuringPrivatePreview = localPreviewActive
        let shouldPauseShared =
            !failedDuringPrivatePreview
                && room?.status == "playing"
                && canEdit
        let session = currentSession
        let heldPosition = displayPosition

        player?.pause()
        endSharedAudioLease()
        localPreviewActive = false
        if let failedClip,
           let owner = AuthManager.shared.stableOwnerSnapshot() {
            removeCachedClip(clip: failedClip, owner: owner)
        }
        stopPlayer()

        var pausedForEveryone = false
        if shouldPauseShared, let session {
            pausedForEveryone = await sendCommand(
                type: "PAUSE",
                session: session,
                positionSeconds: heldPosition
            )
        }

        let title = failedClip?.title ?? "The selected clip"
        let detail = error?.localizedDescription
            ?? "The downloaded media format could not be decoded."
        errorMessage = "\(title) stopped because iOS could not play it. \(detail)"
        if failedDuringPrivatePreview {
            statusMessage =
                "Private preview stopped. The unusable downloaded copy was removed; shared Watch did not change."
        } else if shouldPauseShared {
            statusMessage = pausedForEveryone
                ? "Shared Watch paused for everyone. The unusable copy was removed; tap Prepare to retry."
                : "Playback stopped on this iPhone. Ask the other editor to pause, then tap Prepare to retry."
        } else {
            statusMessage =
                "The unusable downloaded copy was removed. Tap Prepare to try again."
        }
    }

    private func beginSharedAudioLease() throws {
        guard !sharedAudioLeaseActive else { return }
        try audioSessionCoordinator.beginSharedWatchPlayback()
        sharedAudioLeaseActive = true
    }

    private func endSharedAudioLease() {
        guard sharedAudioLeaseActive else { return }
        sharedAudioLeaseActive = false
        audioSessionCoordinator.endSharedWatchPlayback()
    }

    private func holdForUnsafeAudioRoute(_ message: String) {
        guard sharedAudioLeaseActive else { return }
        player?.pause()
        endSharedAudioLease()
        if localPreviewActive {
            localPreviewActive = false
            errorMessage = message
            statusMessage =
                "Private preview paused on this iPhone. Shared Watch did not change."
            return
        }
        errorMessage = message
        statusMessage =
            "Pausing shared Watch for everyone because the private listening route disconnected."
        guard room?.status == "playing", let currentSession else { return }
        let heldPosition = displayPosition
        Task { @MainActor [weak self] in
            guard let self else { return }
            let paused = await self.sendCommand(
                type: "PAUSE",
                session: currentSession,
                positionSeconds: heldPosition
            )
            self.errorMessage = message
            self.statusMessage = paused
                ? "Shared Watch paused for everyone. Reconnect headphones before resuming together."
                : "Shared Watch paused on this iPhone. Reconnect headphones and refresh before resuming together."
        }
    }

    private func stopPlayer() {
        player?.pause()
        itemStatusCancellable?.cancel()
        itemStatusCancellable = nil
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
            self.timeObserver = nil
        }
        player = nil
        playerItemReady = false
        if let completionObserver {
            NotificationCenter.default.removeObserver(completionObserver)
            self.completionObserver = nil
        }
        if let playbackFailureObserver {
            NotificationCenter.default.removeObserver(playbackFailureObserver)
            self.playbackFailureObserver = nil
        }
        preparedAssetID = nil
        preparedClipIdentity = nil
        localPreviewActive = false
        endedAssetID = nil
        endSharedAudioLease()
    }

    private func projectedPosition(
        _ room: MobileEpisodeWatchRoom
    ) -> TimeInterval {
        room.projectedPosition(
            at: Date().addingTimeInterval(serverClockOffsetSeconds)
        )
    }

    private func updateServerClock(
        serverNow: String?,
        requestStartedAt: Date
    ) {
        guard let serverNow,
              let serverDate = Self.parseServerDate(serverNow) else { return }
        let receivedAt = Date()
        let roundTrip = max(0, receivedAt.timeIntervalSince(requestStartedAt))
        let localMidpoint = requestStartedAt.addingTimeInterval(roundTrip / 2)
        serverClockOffsetSeconds = serverDate.timeIntervalSince(localMidpoint)
        serverClockUncertaintySeconds = roundTrip / 2
    }

    private static func parseServerDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value)
            ?? ISO8601DateFormatter().date(from: value)
    }

    private func resetForContextChange() {
        loadingRequestID = nil
        isLoading = false
        stopPlayer()
        room = nil
        outboundLiveHint = nil
        canEdit = false
        sharedConnectionReady = false
        consecutivePollFailures = 0
        displayPosition = 0
        statusMessage = nil
        errorMessage = nil
    }

    private func resetForAccountChange() {
        currentContextKey = nil
        currentSession = nil
        resetForContextChange()
    }

    private func context(
        for session: MobileCaptureSession
    ) -> (key: String, projectSlug: String, episodeSlug: String, endpoint: URL)? {
        guard let projectSlug = Self.safePathSlug(session.projectSlug),
              let episodeSlug = Self.safePathSlug(session.episodeSlug) else {
            return nil
        }
        let endpoint = baseURL
            .appendingPathComponent("api", isDirectory: true)
            .appendingPathComponent("nests", isDirectory: true)
            .appendingPathComponent(projectSlug, isDirectory: true)
            .appendingPathComponent("episode-room", isDirectory: false)
        return (
            key: "\(projectSlug)|\(episodeSlug)",
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            endpoint: endpoint
        )
    }

    private static func iso8601String(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    private func resolvedPlaybackURL(_ value: String) -> URL? {
        guard let candidate = URL(
            string: value,
            relativeTo: baseURL
        )?.absoluteURL,
        candidate.scheme?.lowercased() == baseURL.scheme?.lowercased(),
        candidate.host?.lowercased() == baseURL.host?.lowercased(),
        candidate.port == baseURL.port,
        candidate.user == nil,
        candidate.password == nil else { return nil }
        return candidate
    }

    private static func safePathSlug(_ value: String?) -> String? {
        guard let slug = value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              slug.range(
                of: #"^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$"#,
                options: .regularExpression
              ) != nil else { return nil }
        return slug
    }

    private func restoreCachedClip(
        clip: MobileEpisodeWatchClip,
        owner: AuthManager.StableOwnerSnapshot
    ) -> Bool {
        guard let locations = cacheLocations(clip: clip, owner: owner),
              let receiptData = try? Data(contentsOf: locations.receipt),
              let receipt = try? JSONDecoder().decode(
                MobileEpisodeWatchCacheReceipt.self,
                from: receiptData
              ),
              receipt.schemaVersion == 1,
              receipt.ownerDigest == Self.digest(owner.ownerAccountID),
              receipt.assetId == clip.assetId,
              receipt.sourceId == clip.sourceId,
              receipt.playbackUrl == clip.playbackUrl,
              receipt.byteCount > 0,
              FileManager.default.fileExists(atPath: locations.media.path),
              let attributes = try? FileManager.default.attributesOfItem(
                atPath: locations.media.path
              ),
              (attributes[.size] as? NSNumber)?.int64Value
                == receipt.byteCount,
              let verification = try? Self.hashAndByteCount(
                at: locations.media
              ),
              verification.byteCount == receipt.byteCount,
              verification.sha256 == receipt.sha256,
              AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
            return false
        }
        preparePlayer(fileURL: locations.media, clip: clip)
        return true
    }

    private func preserveDownloadedClip(
        temporaryURL: URL,
        clip: MobileEpisodeWatchClip,
        owner: AuthManager.StableOwnerSnapshot
    ) throws -> MobileEpisodeWatchCacheReceipt {
        guard let locations = cacheLocations(clip: clip, owner: owner) else {
            throw NSError(
                domain: "MobileEpisodeWatch",
                code: 3,
                userInfo: [
                    NSLocalizedDescriptionKey:
                        "The Watch source identity is not safe for local storage."
                ]
            )
        }
        try FileManager.default.createDirectory(
            at: locations.directory,
            withIntermediateDirectories: true,
            attributes: [
                .protectionKey:
                    FileProtectionType.completeUntilFirstUserAuthentication
            ]
        )
        var directoryValues = URLResourceValues()
        directoryValues.isExcludedFromBackup = true
        var mutableDirectory = locations.directory
        try mutableDirectory.setResourceValues(directoryValues)

        try? FileManager.default.removeItem(at: locations.media)
        try? FileManager.default.removeItem(at: locations.receipt)
        try FileManager.default.moveItem(
            at: temporaryURL,
            to: locations.media
        )
        try FileManager.default.setAttributes(
            [
                .protectionKey:
                    FileProtectionType.completeUntilFirstUserAuthentication
            ],
            ofItemAtPath: locations.media.path
        )
        var mediaValues = URLResourceValues()
        mediaValues.isExcludedFromBackup = true
        var mutableMedia = locations.media
        try mutableMedia.setResourceValues(mediaValues)

        let verification = try Self.hashAndByteCount(at: locations.media)
        let receipt = MobileEpisodeWatchCacheReceipt(
            schemaVersion: 1,
            ownerDigest: Self.digest(owner.ownerAccountID),
            assetId: clip.assetId,
            sourceId: clip.sourceId,
            playbackUrl: clip.playbackUrl,
            byteCount: verification.byteCount,
            sha256: verification.sha256,
            downloadedAt: Date()
        )
        let receiptData = try JSONEncoder().encode(receipt)
        try receiptData.write(
            to: locations.receipt,
            options: [
                .atomic,
                .completeFileProtectionUntilFirstUserAuthentication,
            ]
        )
        var receiptValues = URLResourceValues()
        receiptValues.isExcludedFromBackup = true
        var mutableReceipt = locations.receipt
        try mutableReceipt.setResourceValues(receiptValues)
        return receipt
    }

    private func removeCachedClip(
        clip: MobileEpisodeWatchClip,
        owner: AuthManager.StableOwnerSnapshot
    ) {
        guard let locations = cacheLocations(clip: clip, owner: owner) else {
            return
        }
        try? FileManager.default.removeItem(at: locations.media)
        try? FileManager.default.removeItem(at: locations.receipt)
    }

    private func cacheLocations(
        clip: MobileEpisodeWatchClip,
        owner: AuthManager.StableOwnerSnapshot
    ) -> (directory: URL, media: URL, receipt: URL)? {
        guard clip.assetId.range(
            of: #"^[A-Za-z0-9_-]{1,160}$"#,
            options: .regularExpression
        ) != nil,
        let cacheRoot = Self.sharedWatchCacheRoot() else { return nil }
        let directory = cacheRoot
            .appendingPathComponent(
                Self.digest(owner.ownerAccountID),
                isDirectory: true
            )
        let sourceExtension = URL(
            string: clip.playbackUrl
        )?.pathExtension.lowercased()
        let safeExtension = [
            "mp4", "mov", "m4v", "m4a", "aac", "mp3", "wav",
        ].contains(sourceExtension ?? "")
            ? sourceExtension!
            : clip.isVideo ? "mp4" : "m4a"
        return (
            directory,
            directory.appendingPathComponent(
                "\(clip.assetId).\(safeExtension)",
                isDirectory: false
            ),
            directory.appendingPathComponent(
                "\(clip.assetId).json",
                isDirectory: false
            )
        )
    }

    private static func sharedWatchCacheRoot() -> URL? {
        FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first?
            .appendingPathComponent("QuipslyCapture", isDirectory: true)
            .appendingPathComponent("SharedWatchCache", isDirectory: true)
    }

    private static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private static func hashAndByteCount(
        at url: URL
    ) throws -> (byteCount: Int64, sha256: String) {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        var byteCount: Int64 = 0
        while true {
            let chunk = try handle.read(upToCount: 1_048_576) ?? Data()
            if chunk.isEmpty { break }
            byteCount += Int64(chunk.count)
            hasher.update(data: chunk)
        }
        return (
            byteCount,
            hasher.finalize()
                .map { String(format: "%02x", $0) }
                .joined()
        )
    }

    private func commandStatusMessage(_ type: String) -> String {
        switch type {
        case "START_SESSION":
            return "Watch is bound to the current Capture recording clock."
        case "PLAY":
            return "Playing together. Each participant can pause."
        case "PAUSE":
            return "Paused for everyone at \(displayPosition.watchTimestamp)."
        case "SEEK":
            return "Shared Watch moved to \(displayPosition.watchTimestamp)."
        case "ENDED":
            return "Shared Watch completed and preserved its timeline segment."
        case "SYNC_TIMELINE":
            let count = room?.watchedSegmentCount ?? 0
            return count > 0
                ? "\(count) watched \(count == 1 ? "span" : "spans") sent to the non-destructive editor lane."
                : "The previous Watch pass was cleared from the editor. Its receipts remain in history."
        case "SELECT_CLIP":
            return selectedClip.map {
                "\($0.title) selected for everyone at the beginning."
            } ?? "Shared Watch clip selected."
        default:
            return "Shared Watch updated."
        }
    }
}

struct MobileEpisodeWatchCard: View {
    @ObservedObject var client: MobileEpisodeWatchClient
    let session: MobileCaptureSession
    let captureIsActive: Bool
    let previewOnly: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 10) {
                    watchHeading
                        .fixedSize()
                    Spacer()
                    watchStatus
                        .fixedSize()
                }

                VStack(alignment: .leading, spacing: 8) {
                    watchHeading
                        .fixedSize(horizontal: false, vertical: true)
                    watchStatus
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if client.isLoading && client.room == nil && client.errorMessage == nil {
                ProgressView("Loading episode Watch…")
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if let clip = client.selectedClip {
                if let clips = client.room?.clips, clips.count > 1 {
                    Menu {
                        ForEach(clips) { candidate in
                            Button {
                                Task {
                                    await client.selectClip(
                                        candidate,
                                        session: session
                                    )
                                }
                            } label: {
                                if candidate.id == clip.id {
                                    Label(
                                        candidate.title,
                                        systemImage: "checkmark"
                                    )
                                } else {
                                    Text(candidate.title)
                                }
                            }
                        }
                    } label: {
                        Label(
                            "Choose episode clip",
                            systemImage: "rectangle.stack"
                        )
                    }
                    .disabled(
                        client.isMutating
                            || !client.canEdit
                            || !client.sharedConnectionReady
                            || client.isSharedPlaying
                            || previewOnly
                    )
                    .accessibilityHint(
                        "Changes the shared selection for both editors only while playback is paused."
                    )
                    .accessibilityIdentifier(
                        "CaptureEpisodeWatchClipMenu"
                    )
                }

                VStack(alignment: .leading, spacing: 3) {
                    Text(clip.title)
                        .font(.subheadline.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("CaptureEpisodeWatchClipTitle")
                    Text(
                        "\(client.displayPosition.watchTimestamp) / \((clip.playbackEndSeconds ?? 0).watchTimestamp)"
                    )
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(.secondary)
                    if let rangeStart = clip.rangeStartSeconds,
                       let rangeEnd = clip.rangeEndSeconds {
                        Text(
                            "Saved range \(rangeStart.watchTimestamp)–\(rangeEnd.watchTimestamp)"
                        )
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier(
                            "CaptureEpisodeWatchRange"
                        )
                    }
                }

                if let player = client.player, client.isPrepared {
                    VideoPlayer(player: player)
                        .allowsHitTesting(false)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .clipShape(
                            RoundedRectangle(
                                cornerRadius: 16,
                                style: .continuous
                            )
                        )
                        .accessibilityLabel(
                            "Shared Watch video \(clip.title)"
                        )
                        .accessibilityIdentifier(
                            "CaptureEpisodeWatchPlayer"
                        )

                    HStack(spacing: 8) {
                        Button {
                            Task {
                                await client.seekShared(
                                    by: -10,
                                    session: session,
                                    captureIsActive: captureIsActive
                                )
                            }
                        } label: {
                            Label("Back 10", systemImage: "gobackward.10")
                        }
                        .buttonStyle(.bordered)
                        .disabled(
                            client.isMutating
                                || !client.canEdit
                                || !client.sharedConnectionReady
                                || !client.sharedClockReady(
                                    for: session,
                                    captureIsActive: captureIsActive
                                )
                        )
                        .accessibilityIdentifier(
                            "CaptureEpisodeWatchBackButton"
                        )

                        Button {
                            Task {
                                await client.toggleSharedPlayback(
                                    session: session,
                                    captureIsActive: captureIsActive
                                )
                            }
                        } label: {
                            Label(
                                client.isSharedPlaying
                                    ? "Pause everyone"
                                    : "Play together",
                                systemImage: client.isSharedPlaying
                                    ? "pause.fill"
                                    : "play.fill"
                            )
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(
                            client.isMutating
                                || !client.canEdit
                                || !client.sharedConnectionReady
                        )
                        .accessibilityIdentifier(
                            "CaptureEpisodeWatchPlayPauseButton"
                        )

                        Button {
                            Task {
                                await client.seekShared(
                                    by: 10,
                                    session: session,
                                    captureIsActive: captureIsActive
                                )
                            }
                        } label: {
                            Label("Forward 10", systemImage: "goforward.10")
                        }
                        .buttonStyle(.bordered)
                        .disabled(
                            client.isMutating
                                || !client.canEdit
                                || !client.sharedConnectionReady
                                || !client.sharedClockReady(
                                    for: session,
                                    captureIsActive: captureIsActive
                                )
                        )
                        .accessibilityIdentifier(
                            "CaptureEpisodeWatchForwardButton"
                        )
                    }
                    .labelStyle(.iconOnly)

                    Button(role: .destructive) {
                        client.removePreparedClip()
                    } label: {
                        Label(
                            "Remove downloaded copy",
                            systemImage: "trash"
                        )
                    }
                    .buttonStyle(.bordered)
                    .disabled(
                        client.isSharedPlaying
                            || client.localPreviewActive
                            || client.isMutating
                    )
                    .accessibilityHint(
                        "Removes only this iPhone's protected cache. The Nest source remains unchanged."
                    )
                    .accessibilityIdentifier(
                        "CaptureEpisodeWatchRemoveDownloadButton"
                    )

                    if !client.sharedClockReady(
                        for: session,
                        captureIsActive: captureIsActive
                    ) {
                        Button {
                            client.togglePreview()
                        } label: {
                            Label(
                                client.localPreviewActive
                                    ? "Pause private preview"
                                    : "Preview on this iPhone",
                                systemImage: client.localPreviewActive
                                    ? "pause.circle"
                                    : "iphone.gen3"
                            )
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier(
                            "CaptureEpisodeWatchPreviewButton"
                        )
                    }
                } else {
                    if client.isSharedPlaying && client.canEdit {
                        Button {
                            Task {
                                await client.toggleSharedPlayback(
                                    session: session,
                                    captureIsActive: captureIsActive
                                )
                            }
                        } label: {
                            Label(
                                "Pause everyone",
                                systemImage: "pause.fill"
                            )
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(
                            client.isMutating
                                || !client.sharedConnectionReady
                        )
                        .accessibilityHint(
                            "Pauses the authoritative shared clock immediately; this iPhone does not need the clip downloaded."
                        )
                        .accessibilityIdentifier(
                            "CaptureEpisodeWatchUnpreparedPauseButton"
                        )
                    }

                    Button {
                        Task { await client.prepareSelectedClip() }
                    } label: {
                        if client.isPreparingClip || client.isCheckingPlayback {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label(
                                "Prepare \(clip.title)",
                                systemImage: "arrow.down.circle.fill"
                            )
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(
                        client.isPreparingClip
                            || client.isCheckingPlayback
                            || previewOnly
                    )
                    .accessibilityHint(
                        "Downloads an authenticated, owner-partitioned local copy for reliable shared playback."
                    )
                    .accessibilityIdentifier(
                        "CaptureEpisodeWatchPrepareButton"
                    )
                }

                if client.room?.hasTimelineWork == true {
                    Button {
                        Task {
                            await client.syncWatchedSpans(session: session)
                        }
                    } label: {
                        Label(
                            timelineButtonLabel,
                            systemImage: client.room?.timelineIsCurrent == true
                                ? "checkmark.circle.fill"
                                : "timeline.selection"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(client.room?.timelineIsCurrent == true ? .green : nil)
                    .disabled(
                        client.isMutating
                            || !client.canEdit
                            || !client.sharedConnectionReady
                            || client.isSharedPlaying
                            || client.room?.timelineIsCurrent == true
                            || previewOnly
                    )
                    .accessibilityHint(
                        "Materializes receipt-backed derivatives in the episode editor without changing the source clip."
                    )
                    .accessibilityIdentifier(
                        "CaptureEpisodeWatchSyncTimelineButton"
                    )
                }

                if client.room?.timelineIsCurrent == true,
                   let editorURL {
                    Link(destination: editorURL) {
                        Label(
                            "Open assembled episode in Nest",
                            systemImage: "rectangle.portrait.and.arrow.forward"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityHint(
                        "Opens the exact non-destructive episode editor for these watched spans."
                    )
                    .accessibilityIdentifier(
                        "CaptureEpisodeWatchOpenEditorLink"
                    )
                }

                Text(boundaryMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier(
                        "CaptureEpisodeWatchBoundary"
                    )
            } else {
                Text(
                    "This episode does not have a selected Watch clip yet. Add one in Nest, then refresh."
                )
                .font(.subheadline)
                .foregroundStyle(.secondary)
            }

            if let statusMessage = client.statusMessage {
                Label(statusMessage, systemImage: "checkmark.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let errorMessage = client.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureEpisodeWatchError")
            }
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureEpisodeWatchCard")
    }

    private var watchHeading: some View {
        Label("Watch together", systemImage: "play.rectangle.on.rectangle")
            .font(.headline)
    }

    private var watchStatus: some View {
        Text(client.statusLabel)
            .font(.caption2.weight(.bold))
            .foregroundStyle(
                client.isSharedPlaying ? Color.green : Color.secondary
            )
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(.secondary.opacity(0.1), in: Capsule())
            .accessibilityIdentifier("CaptureEpisodeWatchStatus")
    }

    private var boundaryMessage: String {
        if client.room?.session?.recordingRoomId == session.callRoomId {
            return "Bound to this recording clock. Play, pause, and seek receipts become reviewed Watch segments for the episode timeline."
        }
        if captureIsActive {
            return "The first shared Play binds Watch to this active Capture clock. Headphones keep the separately preserved clip out of the microphone master."
        }
        return "Prepare and preview before the take. Start recording before Play together so the clip lands on the episode timeline; private preview never changes shared state."
    }

    private var timelineButtonLabel: String {
        let count = client.room?.watchedSegmentCount ?? 0
        if client.room?.timelineIsCurrent == true {
            return count > 0
                ? "\(count) watched \(count == 1 ? "span" : "spans") in editor"
                : "Previous watch pass cleared"
        }
        return count > 0
            ? "Send \(count) watched \(count == 1 ? "span" : "spans") to editor"
            : "Clear previous watch pass"
    }

    private var editorURL: URL? {
        guard let projectSlug = session.projectSlug?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !projectSlug.isEmpty,
              let episodeSlug = session.episodeSlug?
                .trimmingCharacters(in: .whitespacesAndNewlines),
              !episodeSlug.isEmpty else { return nil }
        let rawBaseURL = normalizedNestBaseURL(
            Bundle.main.object(
                forInfoDictionaryKey: "QUIPSLY_API_BASE_URL"
            ) as? String ?? "https://nest.quipsly.com"
        )
        guard let baseURL = URL(string: rawBaseURL),
              var components = URLComponents(
                url: baseURL,
                resolvingAgainstBaseURL: false
              ) else { return nil }
        components.path = "/editor"
        components.queryItems = [
            URLQueryItem(name: "project", value: projectSlug),
            URLQueryItem(name: "episode", value: episodeSlug),
        ]
        return components.url
    }
}

private extension TimeInterval {
    var watchTimestamp: String {
        let total = max(0, Int(self.rounded(.down)))
        let hours = total / 3_600
        let minutes = (total % 3_600) / 60
        let seconds = total % 60
        return hours > 0
            ? String(format: "%02d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%02d:%02d", minutes, seconds)
    }
}
