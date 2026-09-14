import SwiftUI

/// The post-call transcript belongs to this recording, never the room's
/// latest unrelated transcript. Recognition and delivery remain owned by the
/// existing background transcript manager.
struct CapturePostCallTranscript: View {
    let recording: LocalRecording
    let session: MobileCaptureSession
    @ObservedObject var sessionClient: CaptureSessionClient
    @ObservedObject private var manager = OnDeviceTranscriptManager.shared
    @ObservedObject private var library = LocalRecordingLibrary.shared
    @State private var isRetrying = false
    @State private var retryError: String?

    private var phase: OnDeviceTranscriptPhase { manager.phase(for: recording.id) }
    private var canonicalTranscript: MobileCaptureSourceTranscriptSummary? {
        return session.captureSources?.first {
            CaptureTranscriptSourceBinding.matches(recordingAssetID: recording.recordingAssetId,
                verifiedSHA256: recording.verifiedCloudSHA256, verifiedBytes: recording.verifiedCloudSizeBytes,
                sourceAssetID: $0.recordingAssetId, sourceSHA256: $0.sha256,
                sourceBytes: $0.byteSize, exactBytesVerified: $0.exactBytesVerified)
        }?.transcript
    }
    private var readyJobID: String? {
        if let transcript = canonicalTranscript, transcript.status?.uppercased() == "COMPLETED" { return transcript.id }
        switch phase {
        case .attached(let jobID, _): return jobID
        case .cloudFallback(let jobID, let status) where status.uppercased() == "COMPLETED": return jobID
        default: return nil
        }
    }
    private var title: String {
        if readyJobID != nil { return "Transcript ready" }
        if canonicalTranscript?.failureCode == "NO_AUDIO_SIGNAL" { return "No audio was captured" }
        if !recording.shouldBeginAutomaticOnDeviceTranscript { return "Transcription was off" }
        if let message = recording.clearSpeechRetryMessage, !message.isEmpty { return "No clear speech found" }
        if let status = canonicalTranscript?.status?.uppercased() {
            return ["FAILED", "HELD"].contains(status) ? "Transcript needs attention" : "Creating transcript…"
        }
        switch phase {
        case .failed: return "Transcript needs attention"
        case .savedLocally, .waitingForVerifiedUpload: return "Transcript saved on this device"
        case .submitting: return "Syncing transcript…"
        case .installingModel, .modelDownloadRequired: return "Preparing speech recognition…"
        case .waitingForCloudFallback: return "Transcript queued"
        default: return "Creating transcript…"
        }
    }
    private var detail: String {
        if readyJobID != nil { return "Read, correct, and work with the words from this recording." }
        if !recording.shouldBeginAutomaticOnDeviceTranscript { return "You can still listen, trim, and share the recording." }
        if let message = recording.clearSpeechRetryMessage { return message }
        if let transcript = canonicalTranscript {
            if ["FAILED", "HELD"].contains(transcript.status?.uppercased() ?? "") {
                return transcript.errorMessage ?? "Transcription didn’t finish. You can retry without changing the recording."
            }
            return "Keep working here. The transcript will appear when it’s ready."
        }
        if case .failed(let message, _) = phase { return message }
        if case .savedLocally = phase { return "Your words are saved. Quipsly is syncing them with this session." }
        if case .waitingForVerifiedUpload = phase { return "The transcript will sync when this recording finishes uploading." }
        return "Keep working here. The transcript will appear when it’s ready."
    }
    private var retryAvailable: Bool {
        guard readyJobID == nil, recording.shouldBeginAutomaticOnDeviceTranscript,
              !recording.needsClearSpeechRetry else { return false }
        if canonicalTranscript?.retryable == false { return false }
        if let status = canonicalTranscript?.status?.uppercased() { return ["FAILED", "HELD"].contains(status) }
        switch phase {
        case .failed(_, let retryable): return retryable
        case .modelDownloadRequired: return library.fileURL(for: recording) != nil
        case .savedLocally, .waitingForVerifiedUpload: return recording.status.isVerified
        default: return false
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: readyJobID == nil ? "text.bubble" : "text.alignleft")
                .font(.subheadline.weight(.semibold))
                .accessibilityIdentifier("CapturePostCallTranscriptStatus_\(recording.id)")
            Text(detail).font(.caption).foregroundStyle(CapturePalette.secondaryText)
            if recording.status.isVerified, readyJobID != nil,
               let sourceID = recording.recordingAssetId, !sourceID.isEmpty {
                NavigationLink {
                    CaptureTranscriptReviewView(roomID: session.callRoomId, sessionTitle: session.displayTitle,
                        recording: recording, recordingAssetID: sourceID, transcriptJobID: readyJobID,
                        previewOnly: false, canUseProjectTeamNotes: session.canUseProjectTeamNotes == true)
                } label: {
                    Label("Open transcript", systemImage: "text.word.spacing")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("CapturePostCallTranscript_\(recording.id)")
            }
            if retryAvailable {
                Button("Retry transcript") {
                    Task { await retryTranscript() }
                }
                .buttonStyle(.bordered)
                .frame(minHeight: 44)
                .disabled(isRetrying || sessionClient.sessionsAreStale)
                .accessibilityIdentifier("CapturePostCallTranscriptRetry_\(recording.id)")
            }
            if let retryError { Text(retryError).font(.caption).foregroundStyle(CapturePalette.brass) }
        }
        .task(id: recording.id) { manager.restoreState(for: recording) }
    }

    @MainActor
    private func retryTranscript() async {
        guard !isRetrying else { return }
        retryError = nil
        if let transcript = canonicalTranscript, ["FAILED", "HELD"].contains(transcript.status?.uppercased() ?? ""),
           let sourceID = recording.recordingAssetId {
            isRetrying = true
            defer { isRetrying = false }
            if !(await sessionClient.runTranscript(for: session, recordingAssetID: sourceID)) {
                retryError = sessionClient.errorMessage ?? "Couldn’t retry transcription. Please try again."
            }
        } else {
            manager.retryTranscript(recording: recording, fileURL: library.fileURL(for: recording))
        }
    }
}
