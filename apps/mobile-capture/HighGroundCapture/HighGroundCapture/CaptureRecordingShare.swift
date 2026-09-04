import AVFAudio
import AVKit
import Combine
import CryptoKit
import Foundation
import SwiftUI

struct CaptureRecordingShareSource: Codable, Identifiable, Equatable {
    let id: String
    let participantId: String
    let participantLabel: String
    let kind: String
    let fileName: String?
    let contentType: String?
    let sizeBytes: Int64
    let sha256: String
    let startedAt: String
    let stoppedAt: String
    let programOffsetSeconds: TimeInterval
    let playbackUrl: String

    var mobileProtectedSource: MobileCaptureSourceSummary {
        MobileCaptureSourceSummary(
            recordingAssetId: id,
            captureGroupId: nil,
            fileName: fileName,
            kind: kind,
            contentType: contentType,
            recordingStatus: "VERIFIED",
            exactBytesVerified: true,
            processingDisposition: "RELEASED",
            recordedStartedAt: startedAt,
            recordedStoppedAt: stoppedAt,
            mediaAssetId: nil,
            playbackUrl: nil,
            byteSize: String(sizeBytes),
            sha256: sha256,
            durationSeconds: nil,
            sourceId: id,
            sessionPlaybackUrl: playbackUrl
        )
    }
}

struct CaptureRecordingShareTranscriptSegment: Codable, Identifiable, Equatable {
    let transcriptJobId: String
    let segmentId: String
    let sourceRecordingAssetId: String
    let providerTextSha256: String
    let speakerLabel: String
    let text: String
    let startSeconds: TimeInterval
    let endSeconds: TimeInterval
    let cutStartSeconds: TimeInterval?
    let cutEndSeconds: TimeInterval?
    let timingFingerprint: String?
    let timingBasis: String?
    let cutSafety: String?
    let cutSafetyReason: String?

    var id: String { "\(transcriptJobId):\(segmentId)" }
    var canRippleDelete: Bool { cutSafety == "safe" && !(timingFingerprint ?? "").isEmpty }
}

struct CaptureRecordingShareOutput: Codable, Identifiable, Equatable {
    struct Recipient: Codable, Equatable {
        let id: String
        let label: String
    }

    struct Render: Codable, Equatable {
        let status: String
        let durationSeconds: TimeInterval?
        let sizeBytes: Int64?
        let sha256: String?
        let mediaKind: String?
        let contentType: String?
        let primaryVideoSourceId: String?
    }

    struct Body: Codable, Equatable {
        struct Edit: Codable, Equatable {
            let startSeconds: TimeInterval?
            let endSeconds: TimeInterval?
            let transcriptExclusions: [CaptureRecordingShareTranscriptSegment]?
        }

        let edit: Edit?
    }

    struct SourceManifest: Codable, Equatable {
        struct Source: Codable, Equatable {
            let recordingAssetId: String?
        }

        let sources: [Source]?
    }

    struct PlaybackReview: Codable, Equatable {
        let schema: String
        let requiredSecondBins: [Int]
        let joinSecondBins: [Int]
        let reviewed: Bool
        let reviewedAt: String?
        let clientTrackedPlaybackIsNotProofOfAudibility: Bool
    }

    let id: String
    let status: String
    let title: String
    let revision: Int
    let contentSha256: String
    let recipient: Recipient
    let render: Render
    let mediaUrl: String?
    let playbackReview: PlaybackReview?
    let body: Body
    let sourceManifest: SourceManifest?
}

struct CaptureRecordingShareSnapshot: Codable, Equatable {
    struct Person: Codable, Equatable {
        let id: String
        let label: String
    }

    struct Room: Codable, Equatable {
        let id: String
        let title: String
        let client: Person
        let coach: Person?
    }

    struct Available: Codable, Equatable {
        struct Timeline: Codable, Equatable {
            struct Source: Codable, Equatable {
                let recordingAssetId: String
                let programOffsetSeconds: TimeInterval
                let timingUncertaintyMilliseconds: TimeInterval?
            }

            let authority: String
            let precision: String
            let reason: String
            let sources: [Source]

            var maximumUncertaintyMilliseconds: TimeInterval? {
                sources.compactMap(\.timingUncertaintyMilliseconds).max()
            }

            var title: String {
                switch authority {
                case "capture-clock-proposal":
                    "Synced automatically from device clocks"
                case "reported-wall-clock-fallback":
                    "Placed automatically from recording start times"
                case "reviewed-waveform-placement":
                    "Synced from measured audio"
                default:
                    "Recording timeline ready"
                }
            }
        }

        let programDurationSeconds: TimeInterval
        let timeline: Timeline?
        let sources: [CaptureRecordingShareSource]
        let transcriptSegments: [CaptureRecordingShareTranscriptSegment]
    }

    struct Readiness: Codable, Equatable {
        let canPrepare: Bool
        let hasVerifiedParticipantSources: Bool
        let localRendererAvailable: Bool
        let cloudRendererAvailable: Bool

        var verifiedRendererAvailable: Bool {
            localRendererAvailable || cloudRendererAvailable
        }
    }

    let ok: Bool
    let code: String?
    let error: String?
    let role: String?
    let room: Room?
    let available: Available?
    let output: CaptureRecordingShareOutput?
    let readiness: Readiness?
}

private struct CaptureRecordingShareErrorEnvelope: Codable {
    let error: String?
}

@MainActor
final class CaptureRecordingShareClient: NSObject, ObservableObject, AVAudioPlayerDelegate {
    @Published private(set) var snapshot: CaptureRecordingShareSnapshot?
    @Published private(set) var busyAction: String?
    @Published private(set) var notice: String?
    @Published private(set) var isPlaying = false
    @Published private(set) var previewVideoPlayer: AVPlayer?

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )
    private var requestIDs: [String: UUID] = [:]
    private var player: AVAudioPlayer?
    private var videoPlaybackEndObserver: NSObjectProtocol?
    private var protectedPreviewURL: URL?
    private var protectedPreviewOutputID: String?
    private var protectedPreviewSHA256: String?

    deinit {
        if let videoPlaybackEndObserver {
            NotificationCenter.default.removeObserver(videoPlaybackEndObserver)
        }
        if let protectedPreviewURL {
            try? FileManager.default.removeItem(at: protectedPreviewURL)
        }
    }

    func load(roomID: String, quiet: Bool = false) async {
        guard AuthManager.shared.networkActionsAllowed else {
            notice = "Reconnect to Nest before opening the recording editor."
            return
        }
        guard let url = endpoint(roomID: roomID) else {
            notice = "The configured Nest URL is invalid."
            return
        }
        if !quiet { busyAction = "LOAD" }
        defer { if !quiet { busyAction = nil } }
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.statusCode < 400 else {
                throw responseError(data, fallback: "The recording editor could not load.")
            }
            let decoded = try JSONDecoder().decode(CaptureRecordingShareSnapshot.self, from: data)
            guard decoded.ok else {
                throw CaptureRecordingShareClientError.message(decoded.error ?? "The recording editor could not load.")
            }
            reconcilePlaybackAuthorization(with: decoded)
            snapshot = decoded
            if !quiet { notice = nil }
        } catch {
            notice = error.localizedDescription
        }
    }

    func prepare(
        roomID: String,
        title: String,
        sourceIDs: [String],
        outputMediaKind: String,
        primaryVideoSourceID: String?,
        startSeconds: TimeInterval,
        endSeconds: TimeInterval,
        exclusions: [CaptureRecordingShareTranscriptSegment]
    ) async -> Bool {
        await mutate(
            roomID: roomID,
            action: "PREPARE",
            payload: [
                "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                "sourceIds": sourceIDs,
                "outputMediaKind": outputMediaKind,
                "primaryVideoSourceId": primaryVideoSourceID ?? "",
                "startSeconds": startSeconds,
                "endSeconds": endSeconds,
                "excludedTranscriptSegments": exclusions.map { exclusion in
                    var item: [String: Any] = [
                        "transcriptJobId": exclusion.transcriptJobId,
                        "segmentId": exclusion.segmentId,
                        "providerTextSha256": exclusion.providerTextSha256,
                    ]
                    if let timingFingerprint = exclusion.timingFingerprint {
                        item["timingFingerprint"] = timingFingerprint
                    }
                    return item
                },
            ]
        )
    }

    func changeVisibility(roomID: String, action: String) async -> Bool {
        guard let output = snapshot?.output else {
            notice = "Refresh before changing recording visibility."
            return false
        }
        return await mutate(
            roomID: roomID,
            action: action,
            payload: ["outputId": output.id, "expectedRevision": output.revision]
        )
    }

    func stopPreviewPlayback() {
        clearPlayback()
    }

    func preparePreviewExport(roomID: String) async -> URL? {
        player?.pause()
        previewVideoPlayer?.pause()
        isPlaying = false
        return await verifiedPreviewFile(roomID: roomID, busyAction: "EXPORT")
    }

    func togglePreview(roomID: String) async {
        if let videoPlayer = previewVideoPlayer {
            if videoPlayer.timeControlStatus == .playing {
                videoPlayer.pause()
                isPlaying = false
            } else {
                videoPlayer.play()
                isPlaying = true
            }
            return
        }
        if let player, player.isPlaying {
            player.pause()
            isPlaying = false
            return
        }
        if let player {
            player.play()
            isPlaying = true
            return
        }
        guard let destination = await verifiedPreviewFile(roomID: roomID, busyAction: "PLAY"),
              let output = snapshot?.output else { return }
        let isVideo = output.render.mediaKind == "video"
        if isVideo {
            let videoPlayer = AVPlayer(url: destination)
            previewVideoPlayer = videoPlayer
            if let item = videoPlayer.currentItem {
                videoPlaybackEndObserver = NotificationCenter.default.addObserver(
                    forName: .AVPlayerItemDidPlayToEndTime,
                    object: item,
                    queue: .main
                ) { [weak self] _ in
                    Task { @MainActor [weak self] in self?.videoPlayerDidFinish() }
                }
            }
            videoPlayer.play()
            isPlaying = true
        } else {
            do {
                let player = try AVAudioPlayer(contentsOf: destination)
                player.delegate = self
                player.prepareToPlay()
                self.player = player
                player.play()
                isPlaying = true
            } catch {
                clearPlayback()
                notice = "The verified audio copy could not be opened on \(CaptureDeviceVocabulary.thisDevice): \(error.localizedDescription)"
            }
        }
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        isPlaying = false
    }

    private func reconcilePlaybackAuthorization(with snapshot: CaptureRecordingShareSnapshot) {
        guard player != nil || previewVideoPlayer != nil || protectedPreviewURL != nil else { return }
        guard let output = snapshot.output,
              output.id == protectedPreviewOutputID,
              output.render.status == "VERIFIED",
              Self.normalizedSHA256(output.render.sha256) == protectedPreviewSHA256,
              snapshot.role == "COACH" || output.status == "RELEASED" else {
            clearPlayback()
            return
        }
    }

    private func verifiedPreviewFile(roomID: String, busyAction action: String) async -> URL? {
        guard let output = snapshot?.output,
              output.render.status == "VERIFIED",
              output.mediaUrl != nil,
              snapshot?.role == "COACH" || output.status == "RELEASED",
              let expectedSHA256 = Self.normalizedSHA256(output.render.sha256),
              let expectedSizeBytes = output.render.sizeBytes,
              expectedSizeBytes > 0 else {
            notice = "The edited copy has not finished processing or is not available to this account."
            return nil
        }
        if let protectedPreviewURL,
           protectedPreviewOutputID == output.id,
           protectedPreviewSHA256 == expectedSHA256,
           FileManager.default.fileExists(atPath: protectedPreviewURL.path) {
            return protectedPreviewURL
        }
        guard busyAction == nil else { return nil }
        guard let owner = AuthManager.shared.stableOwnerSnapshot(),
              let url = mediaEndpoint(roomID: roomID, outputID: output.id) else {
            notice = "The verified preview address is unavailable."
            return nil
        }
        busyAction = action
        defer { busyAction = nil }
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            let (temporaryURL, response) = try await AuthManager.shared.authenticatedDownload(
                for: request,
                expectedOwnerAccountID: owner.ownerAccountID
            )
            guard response.statusCode < 400 else {
                try? FileManager.default.removeItem(at: temporaryURL)
                throw CaptureRecordingShareClientError.message("The edited copy is not available to this account.")
            }
            let digest = try await Task.detached(priority: .userInitiated) {
                try Self.computeFileDigest(at: temporaryURL)
            }.value
            guard digest.sha256 == expectedSHA256,
                  digest.sizeBytes == expectedSizeBytes else {
                try? FileManager.default.removeItem(at: temporaryURL)
                throw CaptureRecordingShareClientError.message(
                    "The downloaded preview did not match Quipsly's verified receipt, so it was not opened or exported."
                )
            }
            clearPlayback()
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent(Self.editedExportFileName(output))
            try FileManager.default.moveItem(at: temporaryURL, to: destination)
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: destination.path
            )
            protectedPreviewURL = destination
            protectedPreviewOutputID = output.id
            protectedPreviewSHA256 = expectedSHA256
            notice = nil
            return destination
        } catch {
            notice = error.localizedDescription
            return nil
        }
    }

    private func videoPlayerDidFinish() {
        isPlaying = false
    }

    private func clearPlayback() {
        player?.stop()
        player = nil
        previewVideoPlayer?.pause()
        previewVideoPlayer = nil
        if let videoPlaybackEndObserver {
            NotificationCenter.default.removeObserver(videoPlaybackEndObserver)
            self.videoPlaybackEndObserver = nil
        }
        isPlaying = false
        if let protectedPreviewURL {
            try? FileManager.default.removeItem(at: protectedPreviewURL)
        }
        protectedPreviewURL = nil
        protectedPreviewOutputID = nil
        protectedPreviewSHA256 = nil
    }

    private func mutate(
        roomID: String,
        action: String,
        payload: [String: Any]
    ) async -> Bool {
        guard AuthManager.shared.networkActionsAllowed else {
            notice = "Reconnect to Nest before changing the recording edit."
            return false
        }
        guard let url = endpoint(roomID: roomID) else {
            notice = "The configured Nest URL is invalid."
            return false
        }
        busyAction = action
        notice = nil
        defer { busyAction = nil }
        do {
            let requestID = requestIDs[action] ?? UUID()
            requestIDs[action] = requestID
            var body = payload
            body["action"] = action
            body["clientRequestId"] = requestID.uuidString.lowercased()
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.statusCode < 400 else {
                throw responseError(data, fallback: "The recording change was not confirmed.")
            }
            requestIDs[action] = nil
            switch action {
            case "PREPARE":
                notice = "Edited copy is being prepared. Your client cannot see it until you share it."
            case "RELEASE":
                notice = "Shared with your client in this session."
            default:
                notice = "Client access revoked; originals and decision history remain."
            }
            await load(roomID: roomID, quiet: true)
            return true
        } catch {
            notice = error.localizedDescription
            return false
        }
    }

    private func endpoint(roomID: String) -> URL? {
        guard let room = Self.encodedPathComponent(roomID) else { return nil }
        return URL(string: "\(baseURL)/api/sessions/\(room)/recording-share")
    }

    private func mediaEndpoint(roomID: String, outputID: String) -> URL? {
        guard let room = Self.encodedPathComponent(roomID),
              let output = Self.encodedPathComponent(outputID) else { return nil }
        return URL(string: "\(baseURL)/api/sessions/\(room)/recording-share/media/\(output)")
    }

    private struct FileDigest: Sendable {
        let sha256: String
        let sizeBytes: Int64
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

    private nonisolated static func normalizedSHA256(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              normalized.count == 64,
              normalized.unicodeScalars.allSatisfy({ CharacterSet(charactersIn: "0123456789abcdef").contains($0) }) else {
            return nil
        }
        return normalized
    }

    private nonisolated static func editedExportFileName(_ output: CaptureRecordingShareOutput) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_ "))
        let filtered = output.title.unicodeScalars.map { allowed.contains($0) ? String($0) : "-" }.joined()
        let collapsed = filtered
            .replacingOccurrences(of: "\\s+", with: "-", options: .regularExpression)
            .replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        let stem = collapsed.isEmpty ? "Quipsly-session" : String(collapsed.prefix(80))
        let fileExtension = output.render.mediaKind == "video" ? "mp4" : "m4a"
        let uniqueSuffix = UUID().uuidString.lowercased().prefix(8)
        return "\(stem)-edited-r\(output.revision)-\(uniqueSuffix).\(fileExtension)"
    }

    private nonisolated static func encodedPathComponent(_ value: String) -> String? {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        return value.addingPercentEncoding(withAllowedCharacters: allowed)
    }

    private func responseError(_ data: Data, fallback: String) -> Error {
        let envelope = try? JSONDecoder().decode(CaptureRecordingShareErrorEnvelope.self, from: data)
        return CaptureRecordingShareClientError.message(envelope?.error ?? fallback)
    }
}

private enum CaptureRecordingShareClientError: LocalizedError {
    case message(String)

    var errorDescription: String? {
        switch self {
        case .message(let message): message
        }
    }
}

private struct CaptureRecordingShareSheet: UIViewControllerRepresentable {
    let fileURL: URL
    let title: String
    let completion: (Bool, Error?) -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(
            activityItems: [title, fileURL],
            applicationActivities: nil
        )
        controller.completionWithItemsHandler = { _, completed, _, error in
            completion(completed, error)
        }
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

struct CaptureRecordingEditorFocus: Equatable, Hashable {
    let transcriptJobID: String
    let segmentID: String
}

struct CaptureRecordingShareEditor: View {
    let roomID: String
    let focus: CaptureRecordingEditorFocus?

    @StateObject private var client = CaptureRecordingShareClient()
    @StateObject private var sourcePlayback = CaptureSessionProtectedPlaybackController()
    @State private var selectedSourceIDs = Set<String>()
    @State private var excludedSegmentIDs = Set<String>()
    @State private var startSeconds: TimeInterval = 0
    @State private var endSeconds: TimeInterval = 0
    @State private var title = ""
    @State private var outputMediaKind = "audio"
    @State private var primaryVideoSourceID = ""
    @State private var initializedSnapshot = false
    @State private var editing = false
    @State private var auditionSegmentID: String?
    @State private var auditionNotice: String?
    @State private var transcriptQuery = ""
    @State private var showsRemovedPassagesOnly = false
    @State private var exportURL: URL?
    @State private var isPresentingExport = false
    @State private var exportNotice: String?

    init(roomID: String, focus: CaptureRecordingEditorFocus? = nil) {
        self.roomID = roomID
        self.focus = focus
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "scissors")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(CapturePalette.plum)
                    .frame(width: 38, height: 38)
                    .background(CapturePalette.plum.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Edit recording")
                        .font(.headline)
                    Text("Trim or remove passages, listen, and share an edited copy.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button {
                    Task { await client.load(roomID: roomID) }
                } label: {
                    Image(systemName: "arrow.clockwise")
                }
                .disabled(client.busyAction != nil)
                .accessibilityLabel("Refresh recording edit")
            }

            if let notice = client.notice {
                Text(notice)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    .accessibilityIdentifier("CaptureRecordingShareNotice")
            }

            if client.busyAction == "LOAD" && client.snapshot == nil {
                ProgressView("Loading private edit…")
                    .frame(maxWidth: .infinity, minHeight: 80)
            } else if let snapshot = client.snapshot,
                      let room = snapshot.room {
                if snapshot.role == "COACH" {
                    coachEditor(snapshot: snapshot, room: room)
                } else {
                    recipientView(snapshot: snapshot)
                }
            } else if client.notice == nil {
                Text("Private edit appears when verified Session recordings are ready.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text("Your original recordings stay unchanged.")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(Color(uiColor: .secondarySystemGroupedBackground))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.secondary.opacity(0.16), lineWidth: 1)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureRecordingShareEditor")
        .task {
            await client.load(roomID: roomID)
            initializeFromSnapshotIfNeeded()
        }
        .task(id: pollKey) {
            guard pollKey != nil else { return }
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(2))
                guard !Task.isCancelled else { return }
                await client.load(roomID: roomID, quiet: true)
            }
        }
        .onChange(of: client.snapshot) { _, _ in initializeFromSnapshotIfNeeded() }
        .onDisappear {
            client.stopPreviewPlayback()
            sourcePlayback.close()
        }
        .sheet(isPresented: $isPresentingExport) {
            if let exportURL {
                CaptureRecordingShareSheet(
                    fileURL: exportURL,
                    title: "Quipsly edited \(client.snapshot?.output?.render.mediaKind == "video" ? "video" : "audio") copy"
                ) { completed, error in
                    isPresentingExport = false
                    if let error {
                        exportNotice = "The system share sheet could not finish: \(error.localizedDescription)"
                    } else if completed {
                        exportNotice = "The system share sheet finished. Quipsly does not claim who received the file."
                    } else {
                        exportNotice = "Export canceled. The edited copy and original recordings are unchanged."
                    }
                }
            }
        }
    }

    @ViewBuilder
    private func coachEditor(
        snapshot: CaptureRecordingShareSnapshot,
        room: CaptureRecordingShareSnapshot.Room
    ) -> some View {
        if let focus {
            focusedPassageCard(snapshot: snapshot, focus: focus)
        }
        if let output = snapshot.output {
            outputCard(output, coach: true)
        }
        if snapshot.output == nil || editing {
            let available = snapshot.available
            let sources = available?.sources ?? []
            let duration = available?.programDurationSeconds ?? 0
            let transcript = editableTranscript(snapshot)
            let visibleTranscript = visibleEditableTranscript(transcript)
            let removedPassageCount = transcript.filter {
                excludedSegmentIDs.contains($0.id)
            }.count
            let videoSources = sources.filter { $0.kind == "LOCAL_VIDEO" || ($0.contentType ?? "").hasPrefix("video/") }

            if sources.isEmpty {
                Text("Finish the verified participant uploads before preparing a private copy.")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(CapturePalette.brass)
            } else {
                if let output = snapshot.output,
                   editing,
                   missingOutputSourceCount(output, available: sources) > 0 {
                    let missingCount = missingOutputSourceCount(output, available: sources)
                    Label(
                        "\(missingCount) source\(missingCount == 1 ? " is" : "s are") no longer in the verified Session take. Quipsly kept the remaining exact source selection and will not substitute another track. Restore or deliberately replace the missing source before creating a new preview.",
                        systemImage: "waveform.badge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CapturePalette.brass)
                    .padding(12)
                    .background(CapturePalette.brass.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                    .accessibilityIdentifier("CaptureRecordingShareMissingSources")
                }

                if let timeline = available?.timeline,
                   timeline.precision != "unavailable" {
                    VStack(alignment: .leading, spacing: 4) {
                        Label {
                            Text(timeline.maximumUncertaintyMilliseconds.map {
                                "\(timeline.title) · estimated within ±\(Int($0.rounded())) ms"
                            } ?? timeline.title)
                        } icon: {
                            Image(systemName: "waveform.path.ecg")
                        }
                        .font(.caption.weight(.bold))
                        Text(timeline.reason)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(12)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(CapturePalette.success.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                    .accessibilityIdentifier("CaptureRecordingShareTimelineStatus")
                }

                VStack(alignment: .leading, spacing: 12) {
                    Text("Trim")
                        .font(.subheadline.weight(.bold))
                    recordingRangeSlider(
                        "Start",
                        value: $startSeconds,
                        lowerBound: 0,
                        upperBound: max(0, endSeconds - 0.1)
                    )
                    recordingRangeSlider(
                        "End",
                        value: $endSeconds,
                        lowerBound: min(duration, startSeconds + 0.1),
                        upperBound: duration
                    )
                    HStack {
                        Text("\(captureRecordingShareTime(startSeconds))–\(captureRecordingShareTime(endSeconds))")
                        Spacer()
                        Text("\(captureRecordingShareTime(max(0, endSeconds - startSeconds))) selected")
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    DisclosureGroup("Precise timing") {
                        HStack(spacing: 12) {
                            timeField("Start", value: $startSeconds, maximum: duration)
                            timeField("End", value: $endSeconds, maximum: duration)
                        }
                        .padding(.top, 8)
                    }
                    .font(.caption.weight(.bold))
                }
                .padding(12)
                .background(CapturePalette.plum.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))

                if !videoSources.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        Text("Format")
                            .font(.subheadline.weight(.bold))
                        Picker("Preview format", selection: $outputMediaKind) {
                            Label("Audio", systemImage: "waveform").tag("audio")
                            Label("Video", systemImage: "video.fill").tag("video")
                        }
                        .pickerStyle(.segmented)
                        .accessibilityIdentifier("CaptureRecordingShareMediaKind")
                        .onChange(of: outputMediaKind) { _, kind in
                            if kind == "video", primaryVideoSourceID.isEmpty, let camera = videoSources.first {
                                primaryVideoSourceID = camera.id
                                selectedSourceIDs.insert(camera.id)
                            }
                        }

                        if outputMediaKind == "video" {
                            Picker("Primary camera", selection: $primaryVideoSourceID) {
                                ForEach(videoSources) { source in
                                    Text("\(source.participantLabel) · \(source.fileName ?? "Camera")").tag(source.id)
                                }
                            }
                            .pickerStyle(.menu)
                            .accessibilityIdentifier("CaptureRecordingSharePrimaryVideo")
                            .onChange(of: primaryVideoSourceID) { _, sourceID in
                                if !sourceID.isEmpty { selectedSourceIDs.insert(sourceID) }
                            }
                            Text("Quipsly uses this exact camera for the picture and one preferred local microphone per person for the sound. It never mixes the camera mic over a selected dedicated mic.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(12)
                    .background(CapturePalette.plum.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))
                }

                DisclosureGroup("Title and sources (\(selectedSourceIDs.count) selected)") {
                    VStack(alignment: .leading, spacing: 10) {
                        TextField("Recording title", text: $title)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("CaptureRecordingShareTitle")
                        Text("Quipsly already chose one high-quality track for each person and keeps reconnect segments together. Change this only when you need a different recording.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        ForEach(sources) { source in
                            Toggle(isOn: sourceBinding(source.id)) {
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(source.participantLabel).font(.subheadline.weight(.semibold))
                                    Text(source.kind == "LOCAL_VIDEO" ? "Camera audio" : "Local audio")
                                        .font(.caption2).foregroundStyle(.secondary)
                                }
                            }
                            .tint(CapturePalette.plum)
                            .accessibilityIdentifier("CaptureRecordingShareSource_\(source.id)")
                        }
                    }
                    .padding(.top, 8)
                }
                .font(.caption.weight(.bold))

                if transcript.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Transcript edit")
                            .font(.subheadline.weight(.bold))
                        Text("The transcript will appear here when it is ready. You can create a trimmed copy now.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    HStack {
                        Text("Transcript edit").font(.subheadline.weight(.bold))
                        Spacer()
                        if !excludedSegmentIDs.isEmpty {
                            Button("Include all") {
                                excludedSegmentIDs.removeAll()
                                showsRemovedPassagesOnly = false
                            }
                                .font(.caption.weight(.bold))
                        }
                    }
                    Text("Turn off a passage to remove it from the edited copy. Overlapping speech stays included.")
                        .font(.caption).foregroundStyle(.secondary)
                    Text("Listen plays the original source without changing your edit.")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)

                    HStack(spacing: 8) {
                        Image(systemName: "magnifyingglass")
                            .foregroundStyle(.secondary)
                            .accessibilityHidden(true)
                        TextField("Find words or a speaker", text: $transcriptQuery)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .accessibilityLabel("Find a transcript passage")
                            .accessibilityIdentifier("CaptureRecordingShareTranscriptSearch")
                        if !transcriptQuery.isEmpty {
                            Button {
                                transcriptQuery = ""
                            } label: {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundStyle(.secondary)
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Clear transcript search")
                            .accessibilityIdentifier("CaptureRecordingShareTranscriptSearchClear")
                        }
                    }
                    .padding(.horizontal, 10)
                    .frame(minHeight: 44)
                    .background(Color.secondary.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))

                    if removedPassageCount > 0 {
                        Picker("Passages", selection: $showsRemovedPassagesOnly) {
                            Text("All \(transcript.count)").tag(false)
                            Text("Removed \(removedPassageCount)").tag(true)
                        }
                        .pickerStyle(.segmented)
                        .accessibilityHint("Switch between every editable passage and passages removed from this private edit.")
                        .accessibilityIdentifier("CaptureRecordingShareTranscriptScope")
                    }

                    Text(transcriptEditSummary(
                        totalCount: transcript.count,
                        visibleCount: visibleTranscript.count,
                        removedCount: removedPassageCount
                    ))
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("CaptureRecordingShareTranscriptSummary")

                    if visibleTranscript.isEmpty {
                        Label(
                            showsRemovedPassagesOnly
                                ? "No removed passages match this search."
                                : "No transcript passages match this search.",
                            systemImage: "text.magnifyingglass"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .padding(12)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityIdentifier("CaptureRecordingShareTranscriptEmpty")
                    }

                    ForEach(visibleTranscript) { segment in
                        Toggle(isOn: segmentBinding(segment.id)) {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text(segment.speakerLabel).font(.caption.weight(.bold))
                                    Spacer()
                                    Text(captureRecordingShareTime(segment.startSeconds))
                                        .font(.caption2.monospacedDigit().weight(.semibold))
                                        .foregroundStyle(.secondary)
                                }
                                Text(segment.text)
                                    .font(.callout)
                                    .strikethrough(excludedSegmentIDs.contains(segment.id), color: .red)
                            }
                        }
                        .tint(CapturePalette.plum)
                        .disabled(!segment.canRippleDelete)
                        .padding(10)
                        .background(segment.canRippleDelete ? CapturePalette.plum.opacity(0.06) : CapturePalette.brass.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityIdentifier("CaptureRecordingShareSegment_\(segment.segmentId)")
                        if segment.canRippleDelete {
                            Button {
                                Task { await auditionPassage(segment, snapshot: snapshot) }
                            } label: {
                                if sourcePlayback.isPreparing && auditionSegmentID == segment.id {
                                    Label("Preparing exact source…", systemImage: "arrow.down.circle")
                                } else {
                                    Label(
                                        sourcePlayback.isPlaying && auditionSegmentID == segment.id
                                            ? "Playing exact passage"
                                            : "Listen to exact passage",
                                        systemImage: sourcePlayback.isPlaying && auditionSegmentID == segment.id
                                            ? "speaker.wave.2.fill"
                                            : "waveform"
                                    )
                                }
                            }
                            .font(.caption.weight(.bold))
                            .buttonStyle(.bordered)
                            .disabled(sourcePlayback.isPreparing || client.busyAction != nil)
                            .padding(.horizontal, 10)
                            .accessibilityIdentifier("CaptureRecordingShareAudition_\(segment.segmentId)")
                        } else {
                            Text(segment.cutSafetyReason ?? "Precise source timing is unavailable, so this passage stays included.")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(CapturePalette.brass)
                                .padding(.horizontal, 10)
                        }
                    }
                    if let auditionNotice {
                        Text(auditionNotice)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(sourcePlayback.errorMessage == nil ? Color.secondary : CapturePalette.brass)
                            .padding(10)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.secondary.opacity(0.07), in: RoundedRectangle(cornerRadius: 12))
                            .accessibilityIdentifier("CaptureRecordingShareAuditionNotice")
                    }
                }

                Text("Edited range \(captureRecordingShareTime(startSeconds))–\(captureRecordingShareTime(endSeconds)) · \(selectedSourceIDs.count) participant source\(selectedSourceIDs.count == 1 ? "" : "s")")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Button {
                    Task {
                        let success = await client.prepare(
                            roomID: roomID,
                            title: title,
                            sourceIDs: Array(selectedSourceIDs).sorted(),
                            outputMediaKind: outputMediaKind,
                            primaryVideoSourceID: outputMediaKind == "video" ? primaryVideoSourceID : nil,
                            startSeconds: startSeconds,
                            endSeconds: endSeconds,
                            exclusions: transcript.filter { excludedSegmentIDs.contains($0.id) }
                        )
                        if success { editing = false }
                    }
                } label: {
                    if client.busyAction == "PREPARE" {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Text("Create edited \(outputMediaKind) copy").frame(maxWidth: .infinity)
                    }
                }
                .captureProminentButton(fill: CapturePalette.plumFill)
                .disabled(
                    client.busyAction != nil
                        || selectedSourceIDs.isEmpty
                        || (outputMediaKind == "video" && (primaryVideoSourceID.isEmpty || !selectedSourceIDs.contains(primaryVideoSourceID)))
                        || startSeconds < 0
                        || endSeconds <= startSeconds
                        || endSeconds > duration + 0.05
                        || snapshot.readiness?.verifiedRendererAvailable != true
                )
                .accessibilityIdentifier("CaptureRecordingSharePrepare")

                if snapshot.readiness?.verifiedRendererAvailable != true {
                    Text("Preview preparation is temporarily unavailable. Your trim and transcript choices stay here; try again shortly.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(CapturePalette.brass)
                }
            }
        } else if snapshot.output != nil {
            Button(snapshot.output?.render.status == "FAILED" ? "Adjust edit and try again" : "Make another edit") {
                restoreEditorFromCurrentOutput(snapshot)
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("CaptureRecordingShareEditAgain")
        }

        Text("Recipient: \(room.client.label)")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(.secondary)
    }

    @ViewBuilder
    private func focusedPassageCard(
        snapshot: CaptureRecordingShareSnapshot,
        focus: CaptureRecordingEditorFocus
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Opened from transcript", systemImage: "text.line.first.and.arrowtriangle.forward")
                .font(.caption.weight(.bold))
                .foregroundStyle(CapturePalette.plum)

            if let segment = snapshot.available?.transcriptSegments.first(where: {
                $0.transcriptJobId == focus.transcriptJobID && $0.segmentId == focus.segmentID
            }) {
                HStack(alignment: .firstTextBaseline) {
                    Text(segment.speakerLabel)
                        .font(.subheadline.weight(.bold))
                    Spacer(minLength: 8)
                    Text(captureRecordingShareTime(segment.startSeconds))
                        .font(.caption.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Text(segment.text)
                    .font(.callout)
                    .fixedSize(horizontal: false, vertical: true)

                if segment.canRippleDelete {
                    Button {
                        Task { await auditionPassage(segment, snapshot: snapshot) }
                    } label: {
                        if sourcePlayback.isPreparing && auditionSegmentID == segment.id {
                            Label("Preparing exact source…", systemImage: "arrow.down.circle")
                        } else {
                            Label(
                                sourcePlayback.isPlaying && auditionSegmentID == segment.id
                                    ? "Playing exact passage"
                                    : "Listen to exact passage",
                                systemImage: sourcePlayback.isPlaying && auditionSegmentID == segment.id
                                    ? "speaker.wave.2.fill"
                                    : "waveform"
                            )
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(sourcePlayback.isPreparing || client.busyAction != nil)
                    .accessibilityIdentifier("CaptureRecordingShareFocusedAudition_\(segment.segmentId)")
                }

                if !selectedSourceIDs.contains(segment.sourceRecordingAssetId) {
                    Label(
                        "This passage belongs to a recording source that is not selected. Choose that source below; Quipsly did not change the source set.",
                        systemImage: "waveform.badge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CapturePalette.brass)
                } else if segment.endSeconds <= startSeconds || segment.startSeconds >= endSeconds {
                    Label(
                        "This passage is outside the current start and end trim. Adjust the range below; Quipsly did not widen it automatically.",
                        systemImage: "timeline.selection"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CapturePalette.brass)
                } else if segment.canRippleDelete {
                    Toggle(
                        "Include this passage",
                        isOn: segmentBinding(segment.id)
                    )
                    .font(.subheadline.weight(.semibold))
                    .tint(CapturePalette.plum)
                    .accessibilityIdentifier("CaptureRecordingShareFocusedSegmentToggle_\(segment.segmentId)")
                    Text("Changing this switch only updates the private draft below. The original and transcript stay unchanged until you deliberately create a preview.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                } else {
                    Label(
                        segment.cutSafetyReason ?? "This passage does not have qualified source timing, so it remains included.",
                        systemImage: "shield.lefthalf.filled"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CapturePalette.brass)
                }
            } else {
                Label(
                    "This exact transcript passage is not present in the current editable source set. Refresh the Session instead of substituting another passage.",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(CapturePalette.brass)
            }
        }
        .padding(12)
        .background(CapturePalette.plum.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureRecordingShareFocusedPassage")
    }

    @ViewBuilder
    private func recipientView(snapshot: CaptureRecordingShareSnapshot) -> some View {
        if let output = snapshot.output, output.status == "RELEASED" {
            outputCard(output, coach: false)
        } else {
            Text("No edited recording has been shared in this Session yet.")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func outputCard(_ output: CaptureRecordingShareOutput, coach: Bool) -> some View {
        let mediaKind = output.render.mediaKind == "video" ? "video" : "audio"
        let sourceIDs = output.sourceManifest?.sources?.compactMap(\.recordingAssetId) ?? []
        let primaryCamera = client.snapshot?.available?.sources.first {
            $0.id == output.render.primaryVideoSourceId
        }
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(output.title).font(.subheadline.weight(.bold))
                    Text(outputStatus(output)).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
                Text(output.render.status.replacingOccurrences(of: "_", with: " "))
                    .font(.caption2.weight(.black))
                    .padding(.horizontal, 8).padding(.vertical, 5)
                    .background(CapturePalette.plum.opacity(0.1), in: Capsule())
            }

            if output.render.status == "VERIFIED" {
                if output.render.mediaKind == "video", let videoPlayer = client.previewVideoPlayer {
                    VideoPlayer(player: videoPlayer)
                        .aspectRatio(16 / 9, contentMode: .fit)
                        .clipShape(RoundedRectangle(cornerRadius: 12))
                        .accessibilityLabel("Edited video preview")
                        .accessibilityIdentifier("CaptureRecordingShareVideoPreview")
                }
                Button {
                    sourcePlayback.close()
                    auditionSegmentID = nil
                    auditionNotice = nil
                    Task { await client.togglePreview(roomID: roomID) }
                } label: {
                    Label(client.isPlaying ? "Pause edited copy" : "Play edited copy", systemImage: client.isPlaying ? "pause.fill" : "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(client.busyAction != nil)
                .accessibilityIdentifier("CaptureRecordingSharePlay")

                Button {
                    Task {
                        exportNotice = nil
                        guard let url = await client.preparePreviewExport(roomID: roomID) else { return }
                        exportURL = url
                        isPresentingExport = true
                    }
                } label: {
                    if client.busyAction == "EXPORT" {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Label(
                            output.render.mediaKind == "video"
                                ? "Export edited video"
                                : "Export edited audio",
                            systemImage: "square.and.arrow.up"
                        )
                        .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.bordered)
                .disabled(client.busyAction != nil)
                .accessibilityIdentifier("CaptureRecordingShareExport")
                .accessibilityHint("Verifies the exact edited bytes, then opens the standard system share sheet. Quipsly does not choose or claim a recipient.")

                if let exportNotice {
                    Text(exportNotice)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureRecordingShareExportNotice")
                }

                DisclosureGroup("Verified copy details") {
                    VStack(alignment: .leading, spacing: 8) {
                        LabeledContent("Format") {
                            Text(mediaKind == "video" ? "1080p · 24 fps · H.264/AAC · MP4" : "AAC · 48 kHz · stereo · M4A")
                        }
                        if let duration = output.render.durationSeconds, duration > 0 {
                            LabeledContent("Duration", value: captureRecordingShareTime(duration))
                        }
                        if let size = output.render.sizeBytes, size > 0 {
                            LabeledContent("File size", value: captureRecordingShareFileSize(size))
                        }
                        if !sourceIDs.isEmpty {
                            LabeledContent("Exact sources", value: "\(sourceIDs.count)")
                        }
                        if mediaKind == "video" {
                            LabeledContent("Picture") {
                                if let primaryCamera {
                                    Text("\(primaryCamera.participantLabel) · \(primaryCamera.fileName ?? "Camera")")
                                } else {
                                    Text("Selected camera retained in render receipt")
                                }
                            }
                        }
                        if let sha256 = output.render.sha256, !sha256.isEmpty {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("SHA-256")
                                    .fontWeight(.semibold)
                                Text(sha256)
                                    .font(.caption2.monospaced())
                                    .textSelection(.enabled)
                            }
                        }
                        Text("Revision \(output.revision) · Originals remain unchanged")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 8)
                }
                .font(.caption)
                .accessibilityIdentifier("CaptureRecordingShareVerifiedDetails")
            } else if output.render.status == "QUEUED" || output.render.status == "PROCESSING" {
                ProgressView(output.render.mediaKind == "video"
                    ? "Aligning picture and sound, leveling, decoding, and verifying…"
                    : "Aligning, leveling, decoding, and verifying…")
            } else if output.render.status == "FAILED" {
                Text("The private copy did not pass verification, so nothing was shared. Your original recording and edit choices are safe.")
                    .font(.caption.weight(.bold)).foregroundStyle(.red)
            }

            if coach && output.status == "DRAFT" && output.render.status == "VERIFIED" {
                Text("Play this edit above, or share it now. The original recording stays unchanged.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Button("Share with \(output.recipient.label)") {
                    Task { _ = await client.changeVisibility(roomID: roomID, action: "RELEASE") }
                }
                .captureProminentButton(fill: CapturePalette.successFill)
                .disabled(client.busyAction != nil)
                .accessibilityIdentifier("CaptureRecordingShareRelease")
            }

            if coach && output.status == "RELEASED" {
                Button("Revoke client access", role: .destructive) {
                    Task { _ = await client.changeVisibility(roomID: roomID, action: "REVOKE") }
                }
                .buttonStyle(.bordered)
                .disabled(client.busyAction != nil)
                .accessibilityIdentifier("CaptureRecordingShareRevoke")
            }
        }
        .padding(12)
        .background(CapturePalette.plum.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
    }

    private var pollKey: String? {
        guard let output = client.snapshot?.output,
              output.render.status == "QUEUED" || output.render.status == "PROCESSING" else { return nil }
        return "\(output.id):\(output.revision):\(output.render.status)"
    }

    @MainActor
    private func auditionPassage(
        _ segment: CaptureRecordingShareTranscriptSegment,
        snapshot: CaptureRecordingShareSnapshot
    ) async {
        guard let source = snapshot.available?.sources.first(where: {
            $0.id == segment.sourceRecordingAssetId
        }) else {
            auditionSegmentID = segment.id
            auditionNotice = "The exact retained source for this passage is unavailable. Quipsly did not substitute another track."
            return
        }
        client.stopPreviewPlayback()
        auditionSegmentID = segment.id
        auditionNotice = "Preparing \(source.participantLabel)'s exact retained source…"
        await sourcePlayback.prepareTranscriptAudition(source: source.mobileProtectedSource)
        guard sourcePlayback.preparedSourceID == source.id else {
            auditionNotice = sourcePlayback.errorMessage
                ?? "The exact retained participant source could not be prepared on \(CaptureDeviceVocabulary.thisDevice)."
            return
        }
        let programStart = segment.cutStartSeconds ?? segment.startSeconds
        let programEnd = segment.cutEndSeconds ?? segment.endSeconds
        let sourceStart = max(0, programStart - source.programOffsetSeconds)
        let sourceEnd = max(sourceStart, programEnd - source.programOffsetSeconds)
        sourcePlayback.playRange(startSeconds: sourceStart, endSeconds: sourceEnd)
        if let error = sourcePlayback.errorMessage {
            auditionNotice = error
        } else {
            auditionNotice = "Exact \(source.participantLabel) master · \(captureRecordingShareTime(sourceStart))–\(captureRecordingShareTime(sourceEnd)) source time. Listening does not change your edit."
        }
    }

    private func editableTranscript(_ snapshot: CaptureRecordingShareSnapshot) -> [CaptureRecordingShareTranscriptSegment] {
        (snapshot.available?.transcriptSegments ?? []).filter {
            selectedSourceIDs.contains($0.sourceRecordingAssetId)
                && $0.endSeconds > startSeconds
                && $0.startSeconds < endSeconds
        }
    }

    private func visibleEditableTranscript(
        _ transcript: [CaptureRecordingShareTranscriptSegment]
    ) -> [CaptureRecordingShareTranscriptSegment] {
        let query = transcriptQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        return transcript.filter { segment in
            if showsRemovedPassagesOnly && !excludedSegmentIDs.contains(segment.id) {
                return false
            }
            guard !query.isEmpty else { return true }
            return segment.text.localizedCaseInsensitiveContains(query)
                || segment.speakerLabel.localizedCaseInsensitiveContains(query)
        }
    }

    private func transcriptEditSummary(
        totalCount: Int,
        visibleCount: Int,
        removedCount: Int
    ) -> String {
        let removed = removedCount == 1 ? "1 passage removed" : "\(removedCount) passages removed"
        let query = transcriptQuery.trimmingCharacters(in: .whitespacesAndNewlines)
        if showsRemovedPassagesOnly || !query.isEmpty {
            let shown = visibleCount == 1 ? "1 passage shown" : "\(visibleCount) passages shown"
            return "\(shown) · \(removed) · \(totalCount) editable"
        }
        return "\(totalCount) editable · \(removed)"
    }

    private func sourceBinding(_ sourceID: String) -> Binding<Bool> {
        Binding(
            get: { selectedSourceIDs.contains(sourceID) },
            set: { included in
                if included { selectedSourceIDs.insert(sourceID) }
                else { selectedSourceIDs.remove(sourceID) }
            }
        )
    }

    private func segmentBinding(_ segmentID: String) -> Binding<Bool> {
        Binding(
            get: { !excludedSegmentIDs.contains(segmentID) },
            set: { included in
                if included { excludedSegmentIDs.remove(segmentID) }
                else { excludedSegmentIDs.insert(segmentID) }
            }
        )
    }

    private func timeField(
        _ label: String,
        value: Binding<TimeInterval>,
        maximum: TimeInterval
    ) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(label).font(.caption.weight(.bold))
            TextField(label, value: value, format: .number.precision(.fractionLength(1)))
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .accessibilityValue("\(captureRecordingShareTime(value.wrappedValue)) of \(captureRecordingShareTime(maximum))")
        }
    }

    private func recordingRangeSlider(
        _ label: String,
        value: Binding<TimeInterval>,
        lowerBound: TimeInterval,
        upperBound: TimeInterval
    ) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(label).font(.caption.weight(.bold))
                Spacer()
                Text(captureRecordingShareTime(value.wrappedValue))
                    .font(.caption.monospacedDigit().weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Slider(
                value: value,
                in: min(lowerBound, upperBound)...max(lowerBound, upperBound),
                step: 0.1
            )
            .tint(CapturePalette.plum)
            .accessibilityLabel("Recording \(label.lowercased())")
            .accessibilityValue(captureRecordingShareTime(value.wrappedValue))
        }
    }

    private func initializeFromSnapshotIfNeeded() {
        guard !initializedSnapshot,
              let snapshot = client.snapshot,
              let available = snapshot.available else { return }
        selectedSourceIDs = sourceIDsForEditing(snapshot.output, available: available.sources)
        startSeconds = snapshot.output?.body.edit?.startSeconds ?? 0
        endSeconds = snapshot.output?.body.edit?.endSeconds ?? available.programDurationSeconds
        title = snapshot.output?.title ?? "\(snapshot.room?.title ?? "Coaching Session") recording"
        outputMediaKind = snapshot.output?.render.mediaKind == "video" ? "video" : "audio"
        primaryVideoSourceID = snapshot.output?.render.primaryVideoSourceId ?? ""
        excludedSegmentIDs = Set(snapshot.output?.body.edit?.transcriptExclusions?.map(\.id) ?? [])
        if focus != nil {
            // Entering from an exact transcript passage is an editing intent,
            // but it is not an edit decision. Reveal the existing draft controls
            // without changing the source set, range, exclusions, or output.
            editing = true
        }
        initializedSnapshot = true
    }

    private func restoreEditorFromCurrentOutput(_ snapshot: CaptureRecordingShareSnapshot) {
        guard let output = snapshot.output else { return }
        let sources = snapshot.available?.sources ?? []
        selectedSourceIDs = sourceIDsForEditing(output, available: sources)
        startSeconds = output.body.edit?.startSeconds ?? 0
        endSeconds = output.body.edit?.endSeconds ?? snapshot.available?.programDurationSeconds ?? 0
        title = output.title
        outputMediaKind = output.render.mediaKind == "video" ? "video" : "audio"
        primaryVideoSourceID = output.render.primaryVideoSourceId ?? ""
        excludedSegmentIDs = Set(output.body.edit?.transcriptExclusions?.map(\.id) ?? [])
        editing = true
    }

    private func sourceIDsForEditing(
        _ output: CaptureRecordingShareOutput?,
        available: [CaptureRecordingShareSource]
    ) -> Set<String> {
        let availableIDs = Set(available.map(\.id))
        let requestedIDs = output?.sourceManifest?.sources?
            .compactMap(\.recordingAssetId)
            .filter { !$0.isEmpty }
        if let requestedIDs, !requestedIDs.isEmpty {
            return Set(requestedIDs.filter { availableIDs.contains($0) })
        }

        return defaultSourceIDs(available)
    }

    private func defaultSourceIDs(
        _ available: [CaptureRecordingShareSource]
    ) -> Set<String> {
        var selected = Set<String>()
        for participantSources in Dictionary(grouping: available, by: \.participantId).values {
            let audio = participantSources.filter {
                $0.kind == "LOCAL_AUDIO" || ($0.contentType ?? "").hasPrefix("audio/")
            }
            let candidates = audio.isEmpty ? participantSources : audio
            let interval: (CaptureRecordingShareSource) -> (start: TimeInterval, end: TimeInterval)? = { source in
                let duration = recordingShareDuration(source)
                guard source.programOffsetSeconds.isFinite, duration > 0 else { return nil }
                return (
                    start: source.programOffsetSeconds,
                    end: source.programOffsetSeconds + duration
                )
            }
            let timed = candidates.allSatisfy { interval($0) != nil }
            guard timed else {
                if let first = candidates.first { selected.insert(first.id) }
                continue
            }

            var overlapGroups: [[CaptureRecordingShareSource]] = []
            let ordered = candidates.sorted {
                let left = interval($0)?.start ?? -.infinity
                let right = interval($1)?.start ?? -.infinity
                return left == right ? $0.id < $1.id : left < right
            }
            for source in ordered {
                let latestEnd = overlapGroups.last?
                    .compactMap { interval($0)?.end }
                    .max() ?? -.infinity
                let startedAt = interval(source)?.start ?? -.infinity
                if overlapGroups.isEmpty || startedAt >= latestEnd {
                    overlapGroups.append([source])
                } else {
                    overlapGroups[overlapGroups.count - 1].append(source)
                }
            }
            for group in overlapGroups {
                let preferred = group.sorted {
                    let left = recordingShareDuration($0)
                    let right = recordingShareDuration($1)
                    return left == right ? $0.id < $1.id : left > right
                }.first
                if let preferred { selected.insert(preferred.id) }
            }
        }
        return selected
    }

    private func recordingShareDuration(
        _ source: CaptureRecordingShareSource
    ) -> TimeInterval {
        guard let startedAt = recordingShareDate(source.startedAt),
              let stoppedAt = recordingShareDate(source.stoppedAt) else { return 0 }
        return max(0, stoppedAt.timeIntervalSince(startedAt))
    }

    private func recordingShareDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        let standard = ISO8601DateFormatter()
        standard.formatOptions = [.withInternetDateTime]
        return standard.date(from: value)
    }

    private func missingOutputSourceCount(
        _ output: CaptureRecordingShareOutput,
        available: [CaptureRecordingShareSource]
    ) -> Int {
        let availableIDs = Set(available.map(\.id))
        return output.sourceManifest?.sources?
            .compactMap(\.recordingAssetId)
            .filter { !$0.isEmpty && !availableIDs.contains($0) }
            .count ?? 0
    }

    private func outputStatus(_ output: CaptureRecordingShareOutput) -> String {
        switch output.status {
        case "DRAFT": "Private coach draft · revision \(output.revision)"
        case "RELEASED": "Visible to \(output.recipient.label) · revision \(output.revision)"
        case "REVOKED": "Client access revoked · revision \(output.revision)"
        default: "Revision \(output.revision)"
        }
    }
}

private func captureRecordingShareTime(_ value: TimeInterval) -> String {
    let seconds = max(0, Int(value.rounded()))
    let hours = seconds / 3_600
    let minutes = (seconds % 3_600) / 60
    let remainder = seconds % 60
    if hours > 0 {
        return "\(hours):\(String(format: "%02d", minutes)):\(String(format: "%02d", remainder))"
    }
    return "\(minutes):\(String(format: "%02d", remainder))"
}

private func captureRecordingShareFileSize(_ value: Int64) -> String {
    ByteCountFormatter.string(fromByteCount: value, countStyle: .file)
}
