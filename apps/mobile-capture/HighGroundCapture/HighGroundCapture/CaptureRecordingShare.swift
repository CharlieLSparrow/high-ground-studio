import AVFAudio
import Combine
import CryptoKit
import Foundation
import SwiftUI

struct CaptureRecordingShareSource: Codable, Identifiable, Equatable {
    let id: String
    let participantLabel: String
    let kind: String
    let fileName: String?
    let sizeBytes: Int64
    let startedAt: String
    let stoppedAt: String
    let programOffsetSeconds: TimeInterval
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
    }

    struct Body: Codable, Equatable {
        struct Edit: Codable, Equatable {
            let startSeconds: TimeInterval?
            let endSeconds: TimeInterval?
            let transcriptExclusions: [CaptureRecordingShareTranscriptSegment]?
        }

        let edit: Edit?
    }

    let id: String
    let status: String
    let title: String
    let revision: Int
    let contentSha256: String
    let recipient: Recipient
    let render: Render
    let mediaUrl: String?
    let body: Body
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
        let programDurationSeconds: TimeInterval
        let sources: [CaptureRecordingShareSource]
        let transcriptSegments: [CaptureRecordingShareTranscriptSegment]
    }

    struct Readiness: Codable, Equatable {
        let canPrepare: Bool
        let hasVerifiedParticipantSources: Bool
        let localRendererAvailable: Bool
        let cloudRendererAvailable: Bool
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

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )
    private var requestIDs: [String: UUID] = [:]
    private var player: AVAudioPlayer?
    private var protectedPreviewURL: URL?
    private var protectedPreviewOutputID: String?
    private var protectedPreviewSHA256: String?

    deinit {
        if let protectedPreviewURL {
            try? FileManager.default.removeItem(at: protectedPreviewURL)
        }
    }

    func load(roomID: String, quiet: Bool = false) async {
        guard AuthManager.shared.networkActionsAllowed else {
            notice = "Reconnect to Nest before opening the private recording edit."
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
                throw responseError(data, fallback: "The private recording workspace could not load.")
            }
            let decoded = try JSONDecoder().decode(CaptureRecordingShareSnapshot.self, from: data)
            guard decoded.ok else {
                throw CaptureRecordingShareClientError.message(decoded.error ?? "The private recording workspace could not load.")
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

    func togglePreview(roomID: String) async {
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
        guard let output = snapshot?.output,
              output.render.status == "VERIFIED",
              output.mediaUrl != nil,
              let expectedSHA256 = Self.normalizedSHA256(output.render.sha256),
              let expectedSizeBytes = output.render.sizeBytes,
              expectedSizeBytes > 0,
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              let url = mediaEndpoint(roomID: roomID, outputID: output.id) else {
            notice = "The private preview has not finished verification yet."
            return
        }
        busyAction = "PLAY"
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
                throw CaptureRecordingShareClientError.message("The private preview is not available to this account.")
            }
            let digest = try await Task.detached(priority: .userInitiated) {
                try Self.computeFileDigest(at: temporaryURL)
            }.value
            guard digest.sha256 == expectedSHA256,
                  digest.sizeBytes == expectedSizeBytes else {
                try? FileManager.default.removeItem(at: temporaryURL)
                throw CaptureRecordingShareClientError.message(
                    "The downloaded preview did not match Quipsly's verified receipt, so it was not opened."
                )
            }
            clearPlayback()
            let destination = FileManager.default.temporaryDirectory
                .appendingPathComponent("quipsly-private-preview-\(UUID().uuidString.lowercased()).m4a")
            try FileManager.default.moveItem(at: temporaryURL, to: destination)
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: destination.path
            )
            let player = try AVAudioPlayer(contentsOf: destination)
            player.delegate = self
            player.prepareToPlay()
            self.protectedPreviewURL = destination
            self.protectedPreviewOutputID = output.id
            self.protectedPreviewSHA256 = expectedSHA256
            self.player = player
            player.play()
            isPlaying = true
            notice = nil
        } catch {
            notice = error.localizedDescription
        }
    }

    func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        isPlaying = false
    }

    private func reconcilePlaybackAuthorization(with snapshot: CaptureRecordingShareSnapshot) {
        guard player != nil || protectedPreviewURL != nil else { return }
        guard let output = snapshot.output,
              output.id == protectedPreviewOutputID,
              output.render.status == "VERIFIED",
              Self.normalizedSHA256(output.render.sha256) == protectedPreviewSHA256,
              snapshot.role == "COACH" || output.status == "RELEASED" else {
            clearPlayback()
            return
        }
    }

    private func clearPlayback() {
        player?.stop()
        player = nil
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
            notice = "Reconnect to Nest before changing the private recording."
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
                throw responseError(data, fallback: "The private recording decision was not confirmed.")
            }
            requestIDs[action] = nil
            notice = action == "PREPARE"
                ? "Private preview queued. Your client cannot see it until you listen and release it."
                : action == "RELEASE"
                    ? "Released only inside this client's private Session."
                    : "Client access revoked; originals and decision history remain."
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

struct CaptureRecordingEditorFocus: Equatable, Hashable {
    let transcriptJobID: String
    let segmentID: String
}

struct CaptureRecordingShareEditor: View {
    let roomID: String
    let focus: CaptureRecordingEditorFocus?

    @StateObject private var client = CaptureRecordingShareClient()
    @State private var selectedSourceIDs = Set<String>()
    @State private var excludedSegmentIDs = Set<String>()
    @State private var startSeconds: TimeInterval = 0
    @State private var endSeconds: TimeInterval = 0
    @State private var title = ""
    @State private var initializedSnapshot = false
    @State private var editing = false

    init(roomID: String, focus: CaptureRecordingEditorFocus? = nil) {
        self.roomID = roomID
        self.focus = focus
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "scissors")
                    .font(.title3.weight(.bold))
                    .foregroundStyle(.indigo)
                    .frame(width: 38, height: 38)
                    .background(Color.indigo.opacity(0.1), in: RoundedRectangle(cornerRadius: 12))
                VStack(alignment: .leading, spacing: 3) {
                    Text("Private recording edit")
                        .font(.headline)
                    Text("Remove passages, listen, then share inside this Session.")
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
                .accessibilityLabel("Refresh private recording")
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

            Text("Original recordings never change. A prepared copy stays coach-only until an explicit release.")
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

            if sources.isEmpty {
                Text("Finish the verified participant uploads before preparing a private copy.")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.orange)
            } else {
                VStack(alignment: .leading, spacing: 12) {
                    Text("1 · Trim the beginning and end")
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
                .background(Color.indigo.opacity(0.05), in: RoundedRectangle(cornerRadius: 14))

                DisclosureGroup("Name and recording sources (\(selectedSourceIDs.count) selected)") {
                    VStack(alignment: .leading, spacing: 10) {
                        TextField("Recording title", text: $title)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("CaptureRecordingShareTitle")
                        Text("Quipsly already chose one high-quality track for each person. Change this only when you need a different recording.")
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
                            .tint(.indigo)
                            .accessibilityIdentifier("CaptureRecordingShareSource_\(source.id)")
                        }
                    }
                    .padding(.top, 8)
                }
                .font(.caption.weight(.bold))

                if transcript.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("2 · Remove any passages")
                            .font(.subheadline.weight(.bold))
                        Text("The transcript will appear here when it is ready. You can create a simple trimmed preview now.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } else {
                    HStack {
                        Text("2 · Remove any passages").font(.subheadline.weight(.bold))
                        Spacer()
                        if !excludedSegmentIDs.isEmpty {
                            Button("Include all") { excludedSegmentIDs.removeAll() }
                                .font(.caption.weight(.bold))
                        }
                    }
                    Text("Turn off a passage to remove its word-timed audio. Quipsly keeps passages that overlap another speaker.")
                        .font(.caption).foregroundStyle(.secondary)
                    ForEach(transcript) { segment in
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
                        .tint(.indigo)
                        .disabled(!segment.canRippleDelete)
                        .padding(10)
                        .background(segment.canRippleDelete ? Color.indigo.opacity(0.06) : Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                        .accessibilityIdentifier("CaptureRecordingShareSegment_\(segment.segmentId)")
                        if !segment.canRippleDelete {
                            Text(segment.cutSafetyReason ?? "Precise source timing is unavailable, so this passage stays included.")
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.orange)
                                .padding(.horizontal, 10)
                        }
                    }
                }

                Text("Prepared \(captureRecordingShareTime(startSeconds))–\(captureRecordingShareTime(endSeconds)) · \(selectedSourceIDs.count) participant source\(selectedSourceIDs.count == 1 ? "" : "s")")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)

                Button {
                    Task {
                        let success = await client.prepare(
                            roomID: roomID,
                            title: title,
                            sourceIDs: Array(selectedSourceIDs).sorted(),
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
                        Text("3 · Create private preview").frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .tint(.indigo)
                .disabled(
                    client.busyAction != nil
                        || selectedSourceIDs.isEmpty
                        || startSeconds < 0
                        || endSeconds <= startSeconds
                        || endSeconds > duration + 0.05
                        || snapshot.readiness?.localRendererAvailable != true
                )
                .accessibilityIdentifier("CaptureRecordingSharePrepare")

                if snapshot.readiness?.localRendererAvailable != true {
                    Text("The verified renderer is unavailable here, so Quipsly will not create a misleading draft.")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }
        } else if snapshot.output != nil {
            Button("Make another private edit") {
                excludedSegmentIDs.removeAll()
                editing = true
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
                .foregroundStyle(.indigo)

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

                if !selectedSourceIDs.contains(segment.sourceRecordingAssetId) {
                    Label(
                        "This passage belongs to a recording source that is not selected. Choose that source below; Quipsly did not change the source set.",
                        systemImage: "waveform.badge.exclamationmark"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                } else if segment.endSeconds <= startSeconds || segment.startSeconds >= endSeconds {
                    Label(
                        "This passage is outside the current start and end trim. Adjust the range below; Quipsly did not widen it automatically.",
                        systemImage: "timeline.selection"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                } else if segment.canRippleDelete {
                    Toggle(
                        "Include this passage",
                        isOn: segmentBinding(segment.id)
                    )
                    .font(.subheadline.weight(.semibold))
                    .tint(.indigo)
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
                    .foregroundStyle(.orange)
                }
            } else {
                Label(
                    "This exact transcript passage is not present in the current editable source set. Refresh the Session instead of substituting another passage.",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
            }
        }
        .padding(12)
        .background(Color.indigo.opacity(0.07), in: RoundedRectangle(cornerRadius: 14))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureRecordingShareFocusedPassage")
    }

    @ViewBuilder
    private func recipientView(snapshot: CaptureRecordingShareSnapshot) -> some View {
        if let output = snapshot.output, output.status == "RELEASED" {
            outputCard(output, coach: false)
        } else {
            Text("No reviewed recording has been shared in this Session yet.")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func outputCard(_ output: CaptureRecordingShareOutput, coach: Bool) -> some View {
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
                    .background(Color.indigo.opacity(0.1), in: Capsule())
            }

            if output.render.status == "VERIFIED" {
                Button {
                    Task { await client.togglePreview(roomID: roomID) }
                } label: {
                    Label(client.isPlaying ? "Pause private preview" : "Play private preview", systemImage: client.isPlaying ? "pause.fill" : "play.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .disabled(client.busyAction != nil)
                .accessibilityIdentifier("CaptureRecordingSharePlay")
            } else if output.render.status == "QUEUED" || output.render.status == "PROCESSING" {
                ProgressView("Aligning, leveling, decoding, and verifying…")
            } else if output.render.status == "FAILED" {
                Text("This copy did not pass verification. Nothing was released.")
                    .font(.caption.weight(.bold)).foregroundStyle(.red)
            }

            if coach && output.status == "DRAFT" && output.render.status == "VERIFIED" {
                Text("Listen once, then share this private copy with \(output.recipient.label).")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                Button("Share with \(output.recipient.label)") {
                    Task { _ = await client.changeVisibility(roomID: roomID, action: "RELEASE") }
                }
                .buttonStyle(.borderedProminent)
                .tint(.green)
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
        .background(Color.indigo.opacity(0.06), in: RoundedRectangle(cornerRadius: 14))
    }

    private var pollKey: String? {
        guard let output = client.snapshot?.output,
              output.render.status == "QUEUED" || output.render.status == "PROCESSING" else { return nil }
        return "\(output.id):\(output.revision):\(output.render.status)"
    }

    private func editableTranscript(_ snapshot: CaptureRecordingShareSnapshot) -> [CaptureRecordingShareTranscriptSegment] {
        (snapshot.available?.transcriptSegments ?? []).filter {
            selectedSourceIDs.contains($0.sourceRecordingAssetId)
                && $0.endSeconds > startSeconds
                && $0.startSeconds < endSeconds
        }
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
            .tint(.indigo)
            .accessibilityLabel("Recording \(label.lowercased())")
            .accessibilityValue(captureRecordingShareTime(value.wrappedValue))
        }
    }

    private func initializeFromSnapshotIfNeeded() {
        guard !initializedSnapshot,
              let snapshot = client.snapshot,
              let available = snapshot.available else { return }
        var preferred: [String: CaptureRecordingShareSource] = [:]
        for source in available.sources {
            let current = preferred[source.participantLabel]
            if current == nil || (source.kind == "LOCAL_AUDIO" && current?.kind != "LOCAL_AUDIO") {
                preferred[source.participantLabel] = source
            }
        }
        selectedSourceIDs = Set(preferred.values.map(\.id))
        startSeconds = snapshot.output?.body.edit?.startSeconds ?? 0
        endSeconds = snapshot.output?.body.edit?.endSeconds ?? available.programDurationSeconds
        title = snapshot.output?.title ?? "\(snapshot.room?.title ?? "Coaching Session") recording"
        excludedSegmentIDs = Set(snapshot.output?.body.edit?.transcriptExclusions?.map(\.id) ?? [])
        if focus != nil {
            // Entering from an exact transcript passage is an editing intent,
            // but it is not an edit decision. Reveal the existing draft controls
            // without changing the source set, range, exclusions, or output.
            editing = true
        }
        initializedSnapshot = true
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
