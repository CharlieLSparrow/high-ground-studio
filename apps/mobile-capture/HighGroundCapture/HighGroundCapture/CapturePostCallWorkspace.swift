import AVKit
import SwiftUI

struct CapturePostCallWorkspace: View {
    @ObservedObject var model: CaptureExperienceModel
    let session: MobileCaptureSession
    let completedCall: CaptureCompletedCall
    let onNotes: () -> Void
    let onConversation: () -> Void
    let onSession: () -> Void
    let onLibrary: () -> Void
    @StateObject private var library = LocalRecordingLibrary.shared
    @StateObject private var playback = LocalRecordingPlaybackController()

    private var recordings: [LocalRecording] {
        library.recordings.filter {
            $0.callRoomId == completedCall.roomID && completedCall.recordingIDs.contains($0.id)
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 20) {
            VStack(alignment: .leading, spacing: 8) {
                Label("You left the call", systemImage: "phone.down.fill")
                    .font(.headline)
                Text(session.displayTitle)
                    .font(.title2.bold())
                Text("Keep the conversation and your work together.")
                    .foregroundStyle(CapturePalette.secondaryText)
            }

            if recordings.isEmpty {
                Text("No recording was made on this device during this call. Recordings shared with you are in the session.")
                    .font(.callout)
                    .foregroundStyle(CapturePalette.secondaryText)
                    .accessibilityIdentifier("CapturePostCallNoLocalRecording")
            } else {
                ForEach(recordings) { recording in
                    recordingRow(recording)
                }
            }

            if let error = playback.errorMessage {
                Text(error).font(.callout).foregroundStyle(CapturePalette.brass)
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 12)], spacing: 12) {
                Button(action: onNotes) {
                    Label("Notes", systemImage: "note.text")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .accessibilityIdentifier("CapturePostCallNotes")
                Button(action: onConversation) {
                    Label("Chat", systemImage: "bubble.left.and.bubble.right")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .accessibilityIdentifier("CapturePostCallConversation")
            }
            .buttonStyle(.bordered)

            Button(action: onSession) {
                Label("Session workspace", systemImage: "rectangle.3.group")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .captureProminentButton(fill: CapturePalette.actionFill)
            .accessibilityIdentifier("CapturePostCallSession")
            Button {
                model.dismissCompletedCall()
            } label: {
                Label("Return to call lobby", systemImage: "phone")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.borderless)
            .accessibilityIdentifier("CapturePostCallRejoin")
        }
        .padding(18)
        .frame(maxWidth: 760, alignment: .leading)
        .frame(maxWidth: .infinity, alignment: .center)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CapturePostCallWorkspace")
        .onDisappear { playback.stop() }
        .sheet(isPresented: Binding(
            get: { playback.videoPlayer != nil },
            set: { if !$0 { playback.stop() } }
        )) {
            if let player = playback.videoPlayer {
                VideoPlayer(player: player)
                    .ignoresSafeArea()
                    .onDisappear { playback.stop() }
            }
        }
    }

    private func recordingRow(_ recording: LocalRecording) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(recording.displayTitle, systemImage: recording.effectiveMediaKind == .video ? "video" : "waveform")
                .font(.headline)
            Text(recording.status.isVerified ? "Saved and uploaded" : recording.status.isPlaybackEligible ? "Saved on this device" : "Recording needs attention")
                .font(.subheadline.weight(.semibold))
            if !recording.status.isVerified {
                Text(!recording.status.isPlaybackEligible ? "This recording is not ready to play. Open the recording in Library for recovery options."
                     : recording.status == .uploadHeld
                     ? "Upload needs attention. Your local recording is still available."
                     : "Keep Quipsly open while this recording uploads. You can keep working here.")
                    .font(.caption).foregroundStyle(CapturePalette.secondaryText)
                if recording.status == .uploading, let progress = recording.uploadProgress, progress.isFinite {
                    ProgressView("Uploading", value: min(1, max(0, progress)))
                        .font(.caption)
                }
            }
            if recording.status.isPlaybackEligible && library.fileURL(for: recording) != nil {
                Button {
                    playback.toggle(recording: recording, library: library)
                } label: {
                    Label(playback.isPlaying(recordingID: recording.id) ? "Pause" : "Play recording",
                          systemImage: playback.isPlaying(recordingID: recording.id) ? "pause.fill" : "play.fill")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("CapturePostCallPlay_\(recording.id)")
            }
            if recording.status.isVerified, let sourceID = recording.recordingAssetId, !sourceID.isEmpty {
                NavigationLink {
                    CaptureRecordingEditScreen(roomID: session.callRoomId, sessionTitle: session.title,
                                               focus: CaptureRecordingEditorFocus(recordingAssetID: sourceID))
                } label: {
                    Label("Edit and share", systemImage: "scissors")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .captureProminentButton(fill: CapturePalette.actionFill)
                .accessibilityIdentifier("CapturePostCallEdit_\(recording.id)")
            }
            if recording.status == .uploadHeld || recording.status == .saved || recording.status == .recovered {
                Button("Retry upload") { model.retryUpload(for: recording) }
                    .frame(minHeight: 44)
            }
            if !recording.status.isPlaybackEligible || library.fileURL(for: recording) == nil {
                Button("Open recording recovery", action: onLibrary)
                    .frame(minHeight: 44)
            }
        }
        .captureCard()
    }
}
