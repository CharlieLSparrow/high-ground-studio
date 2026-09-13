import SwiftUI

struct CaptureSharedAfterCallCard: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject private var auth = AuthManager.shared
    @StateObject private var client = CaptureSessionAfterCallClient()
    let session: MobileCaptureSession
    let previewOnly: Bool
    @State private var retryVersion = 0

    private var monitorID: String {
        "\(session.callRoomId)|\(auth.stableOwnerSnapshot()?.ownerAccountID ?? "signed-out")|\(scenePhase)|\(auth.networkActionsAllowed)|\(retryVersion)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("In this session", systemImage: "person.2.wave.2")
                .font(.headline)
            if let summary = client.currentSummary(for: session.callRoomId) {
                if summary.recordings.uploaded > 0 {
                    Text("\(summary.recordings.uploaded) uploaded recording\(summary.recordings.uploaded == 1 ? "" : "s") available")
                        .font(.subheadline)
                } else if summary.recordings.pending == 0 && summary.recordings.attention == 0 {
                    Text("Recordings from your other devices appear here after upload.")
                        .font(.callout).foregroundStyle(CapturePalette.secondaryText)
                }
                if summary.recordings.pending > 0 {
                    Label("\(summary.recordings.pending) recording\(summary.recordings.pending == 1 ? "" : "s") uploading or being checked", systemImage: "icloud.and.arrow.up")
                        .font(.callout).foregroundStyle(CapturePalette.secondaryText)
                }
                if summary.recordings.attention > 0 {
                    Text("\(summary.recordings.attention) upload\(summary.recordings.attention == 1 ? " needs" : "s need") attention. You can still work with the recordings already available.")
                        .font(.callout).foregroundStyle(CapturePalette.secondaryText)
                }
                if summary.transcripts.processing > 0 {
                    Text("Transcribing \(summary.transcripts.processing) recording\(summary.transcripts.processing == 1 ? "" : "s")… You can keep working here.")
                        .font(.callout).foregroundStyle(CapturePalette.secondaryText)
                }
                if summary.transcripts.attention > 0 {
                    Text("Transcription couldn't finish for \(summary.transcripts.attention) recording\(summary.transcripts.attention == 1 ? "" : "s"). Your recordings remain available.")
                        .font(.callout).foregroundStyle(CapturePalette.secondaryText)
                }
                if let sourceID = summary.transcriptSourceId, summary.transcripts.available > 0 {
                    NavigationLink {
                        CaptureTranscriptReviewView(roomID: session.callRoomId, sessionTitle: session.displayTitle,
                            recording: nil, recordingAssetID: sourceID, previewOnly: previewOnly,
                            canUseProjectTeamNotes: session.canUseProjectTeamNotes == true)
                    } label: {
                        Label("Open transcript", systemImage: "text.word.spacing")
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("CapturePostCallSharedTranscript")
                }
            } else if let error = client.errorMessage {
                Text(error).font(.callout).foregroundStyle(CapturePalette.secondaryText)
                Button("Refresh session updates") { retryVersion += 1 }
                    .frame(minHeight: 44)
                    .accessibilityIdentifier("CapturePostCallSharedRetry")
            } else {
                Text("Recordings and transcripts shared with you stay in this session.")
                    .font(.callout).foregroundStyle(CapturePalette.secondaryText)
            }
            NavigationLink {
                CaptureRecordingEditScreen(roomID: session.callRoomId, sessionTitle: session.displayTitle)
            } label: {
                Label("Session recordings", systemImage: "play.rectangle")
                    .frame(maxWidth: .infinity, minHeight: 44)
            }
            .captureProminentButton(fill: CapturePalette.actionFill)
            .accessibilityIdentifier("CapturePostCallSharedRecordings")
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CapturePostCallSharedResults")
        .task(id: monitorID) {
            guard scenePhase == .active, !previewOnly, auth.networkActionsAllowed else { return }
            var polls = 0
            while !Task.isCancelled {
                guard await client.refresh(roomID: session.callRoomId), !Task.isCancelled else { return }
                polls += 1
                let delay: Double = client.errorMessage != nil ? 30 : client.summary?.isProcessing == true || polls < 6 ? 5 : 30
                do { try await Task.sleep(for: .seconds(delay)) } catch { return }
            }
        }
    }
}
