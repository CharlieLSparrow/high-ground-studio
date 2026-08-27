import SwiftUI

struct ContentView: View {
    @StateObject private var authManager = AuthManager.shared
    @StateObject private var captureModel = CaptureExperienceModel()
    @EnvironmentObject private var audioCapture: AudioCaptureController
    @EnvironmentObject private var videoCapture: VideoCaptureController
    @State private var runtimePlaybackFixtureReceipt: String?
    @State private var visibleTab: CaptureRootTab = CaptureLaunchConfiguration.previewTab ?? .today

    var body: some View {
        Group {
            if CaptureLaunchConfiguration.usesLoginPreview {
                LoginView()
            } else if authManager.isAuthenticated || CaptureLaunchConfiguration.usesPreviewData || mustKeepRecorderVisible {
                CapturePhoneShell(model: captureModel, visibleTab: $visibleTab)
                    .overlay(alignment: .topLeading) {
                        CaptureRuntimeAccountIdentityReceipt(email: authManager.userEmail)
                    }
                    .overlay(alignment: .topLeading) {
                        CaptureRuntimePlaybackFixtureReceipt(value: runtimePlaybackFixtureReceipt)
                    }
                    .task(id: authManager.isAuthenticated) {
                        guard authManager.isAuthenticated else { return }
#if DEBUG
                        do {
                            let recording = try LocalRecordingLibrary.shared
                                .installRuntimeSmokePlaybackFixtureIfRequested()
                            runtimePlaybackFixtureReceipt = recording?.recordingAssetId
                        } catch {
                            let message = error.localizedDescription
                            if message.contains("owner does not match") {
                                runtimePlaybackFixtureReceipt = "error: owner mismatch"
                            } else if message.contains("outside the protected") {
                                runtimePlaybackFixtureReceipt = "error: source bridge rejected"
                            } else if message.contains("incomplete") {
                                runtimePlaybackFixtureReceipt = "error: incomplete fixture"
                            } else if message.contains("SHA-256") {
                                runtimePlaybackFixtureReceipt = "error: checksum mismatch"
                            } else if message.contains("decoded") {
                                runtimePlaybackFixtureReceipt = "error: source not playable"
                            } else {
                                runtimePlaybackFixtureReceipt = "error: \(message)"
                            }
                        }
#endif
                    }
            } else if authManager.hasProtectedOfflineAccess {
                ProtectedOfflineLibraryShell(
                    authManager: authManager,
                    captureModel: captureModel
                )
            } else if authManager.accessMode == .checking {
                CaptureIdentityCheckingView()
            } else {
                LoginView()
            }
        }
        .onChange(of: authManager.accessMode) { previousMode, currentMode in
            guard previousMode == .online,
                  currentMode == .checkingCachedIdentity || currentMode == .offlineCachedIdentity else {
                return
            }
            // A transport failure after local finalization intentionally opens
            // the protected Library. Keep that destination when Nest verifies
            // the same person again instead of rebuilding the online shell on
            // Today and making the just-saved source appear to disappear.
            visibleTab = .library
        }
        .task {
            await authManager.resumeSavedSessionRefreshIfNeeded()
        }
    }

    /// Authentication can expire while a source recording is in progress. The recorder must
    /// remain reachable until the local file is safely finalized; sign-in can be repaired after.
    private var mustKeepRecorderVisible: Bool {
        if videoCapture.state.isActive || videoCapture.state == .paused {
            return true
        }
        switch audioCapture.captureState {
        case .preparing, .recording, .paused, .finalizing:
            return true
        case .idle, .saved, .failed:
            return false
        }
    }
}

private struct CaptureRuntimePlaybackFixtureReceipt: View {
    let value: String?

    @ViewBuilder
    var body: some View {
#if DEBUG
        if let value {
            Color.clear
                .frame(width: 1, height: 1)
                .accessibilityElement()
                .accessibilityLabel("Runtime playback fixture")
                .accessibilityValue(value)
                .accessibilityIdentifier("CaptureRuntimePlaybackFixtureReceipt")
        }
#else
        EmptyView()
#endif
    }
}

private struct CaptureRuntimeAccountIdentityReceipt: View {
    let email: String?

    @ViewBuilder
    var body: some View {
#if DEBUG
        Color.clear
            .frame(width: 1, height: 1)
            .accessibilityElement()
            .accessibilityLabel("Signed in account")
            .accessibilityValue(email ?? "Unknown")
            .accessibilityIdentifier("CaptureSignedInShellAccount")
#else
        EmptyView()
#endif
    }
}

private struct CaptureIdentityCheckingView: View {
    var body: some View {
        VStack(spacing: 16) {
            ProgressView()
                .controlSize(.large)
            Text("Connecting to Quipsly…")
                .font(.headline)
            Text("Getting your Sessions and recordings ready.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)
        }
        .padding(28)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("CaptureIdentityCheckingView")
    }
}

private struct ProtectedOfflineLibraryShell: View {
    @ObservedObject var authManager: AuthManager
    @ObservedObject var captureModel: CaptureExperienceModel
    @StateObject private var library = LocalRecordingLibrary.shared
    @StateObject private var playback = LocalRecordingPlaybackController()
    @State private var quickEntryKind: MobileQuickEntryKind?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(authManager.accessMode == .checkingCachedIdentity ? "Connecting to Quipsly" : "Offline")
                                .font(.headline)
                            Text(authManager.offlineAccessMessage ?? "Protected local recordings and private work capture remain available.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: authManager.accessMode == .checkingCachedIdentity ? "person.badge.clock" : "wifi.slash")
                            .foregroundStyle(.orange)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("CaptureOfflineAccessBanner")

                    Text("Your saved recordings, transcripts, notes, tasks, goals, and sources remain available on this iPhone. Reconnect to join calls, record, or sync changes.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Local Library") {
                    if library.recordings.isEmpty {
                        ContentUnavailableView(
                            "No local recordings",
                            systemImage: "waveform",
                            description: Text("Nothing has been saved in this iPhone's protected recording library yet.")
                        )
                    } else {
                        ForEach(library.recordings) { recording in
                            ProtectedOfflineRecordingRow(
                                recording: recording,
                                isPlaying: playback.playingRecordingID == recording.id,
                                onPlay: { playback.toggle(recording: recording, library: library) }
                            )
                        }
                    }
                }

                if let playbackError = playback.errorMessage {
                    Section("Playback") {
                        Label(playbackError, systemImage: "exclamationmark.triangle")
                            .foregroundStyle(.orange)
                    }
                }

                Section("Continue transcript review") {
                    if offlineTranscriptRecordings.isEmpty {
                        Label {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("No transcript is available offline")
                                    .font(.subheadline.weight(.semibold))
                                Text("Open transcript review once while online to protect a 30-day snapshot on this iPhone.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } icon: {
                            Image(systemName: "text.badge.xmark")
                                .foregroundStyle(.secondary)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("CaptureOfflineTranscriptReviewEmptyState")
                    } else {
                        ForEach(offlineTranscriptRecordings) { recording in
                            if let roomID = recording.callRoomId?
                                .trimmingCharacters(in: .whitespacesAndNewlines),
                               !roomID.isEmpty {
                                NavigationLink {
                                    CaptureTranscriptReviewView(
                                        roomID: roomID,
                                        sessionTitle: offlineReviewTitle(for: recording),
                                        recording: recording,
                                        previewOnly: false
                                    )
                                } label: {
                                    Label {
                                        VStack(alignment: .leading, spacing: 3) {
                                            Text(offlineReviewTitle(for: recording))
                                                .font(.subheadline.weight(.semibold))
                                                .lineLimit(2)
                                            Text("Protected snapshot · Exact local source")
                                                .font(.caption)
                                                .foregroundStyle(.secondary)
                                        }
                                    } icon: {
                                        Image(systemName: "text.badge.checkmark")
                                            .foregroundStyle(Color.accentColor)
                                    }
                                    .frame(minHeight: 52)
                                }
                                .accessibilityIdentifier("CaptureOfflineTranscriptReviewLink_\(recording.id)")
                                .accessibilityHint("Opens the protected transcript snapshot against this exact local source. Canonical work remains unchanged until Nest reconnects.")
                            }
                        }
                    }
                }

                Section("Capture work offline") {
                    if captureModel.sessions.isEmpty {
                        Label("No recently verified Session snapshot is available for Note, Task, or Goal capture. Personal Source capture remains available.", systemImage: "lock.trianglebadge.exclamationmark")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else {
                        Menu {
                            ForEach(captureModel.sessions) { session in
                                Button {
                                    captureModel.select(session)
                                } label: {
                                    if session.id == captureModel.selectedSession?.id {
                                        Label(session.displayTitle, systemImage: "checkmark")
                                    } else {
                                        Text(session.displayTitle)
                                    }
                                }
                                .accessibilityIdentifier("CaptureOfflineSession_\(session.id)")
                            }
                        } label: {
                            LabeledContent(
                                "Session",
                                value: captureModel.selectedSession?.displayTitle ?? "Choose a cached Session"
                            )
                        }
                        .accessibilityIdentifier("CaptureOfflineSessionChooser")
                    }

                    CaptureQuickEntryBar(session: captureModel.selectedSession) { kind in
                        quickEntryKind = kind
                    }

                    CaptureQuickEntrySyncStatus(model: captureModel)

                    Text("Saving here writes only to this account's file-protected iPhone outbox. Nothing is sent until Nest is reachable and re-verifies the account; retry keeps the same canonical ID.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureOfflineQuickEntryBoundary")
                }

                Section("Follow-through offline") {
                    TodayFollowThroughCard(
                        client: captureModel.todayClient,
                        inboxClient: captureModel.sourceInboxClient,
                        previewOnly: false,
                        onOpenClientFollowUp: { roomID in
                            guard let session = captureModel.sessions.first(where: { $0.id == roomID }) else {
                                captureModel.message = "Refresh Sessions to open this exact coaching follow-up. The released snapshot remains unchanged."
                                return
                            }
                            captureModel.select(session)
                            captureModel.message = "Session selected. Open Capture to see the shared follow-up."
                        }
                    )
                }

            }
            .navigationTitle("Local Library")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Sign out", role: .destructive) {
                        playback.stop()
                        authManager.signOut()
                    }
                    .accessibilityIdentifier("CaptureOfflineSignOutButton")
                }
            }
        }
        .sheet(item: $quickEntryKind) { kind in
            CaptureQuickEntrySheet(kind: kind, session: captureModel.selectedSession, model: captureModel)
                .presentationDetents([.medium, .large])
        }
        .task(id: authManager.accessMode) {
            // This shell now owns recovered-source publication only after it is
            // mounted. Publishing one restored row per verified local source
            // must not overlap the parent authentication shell replacement.
            await library.validatePendingRecoveredSources()
            // During a normal launch this destination briefly protects local
            // sources while the saved account is being verified. Do not start
            // the canonical network graph only to cancel it when verification
            // succeeds and the online shell replaces this one. A genuine
            // offline fallback reruns this task with the stable offline mode.
            guard authManager.accessMode == .offlineCachedIdentity else { return }
            await captureModel.load()
        }
        .onDisappear { playback.stop() }
    }

    private var offlineTranscriptRecordings: [LocalRecording] {
        library.recordings.filter { recording in
            guard recording.status.isPlaybackEligible,
                  let roomID = recording.callRoomId?
                    .trimmingCharacters(in: .whitespacesAndNewlines),
                  !roomID.isEmpty else {
                return false
            }
            return CaptureTranscriptCorrectionClient.hasUsableProtectedCache(roomID: roomID)
        }
    }

    private func offlineReviewTitle(for recording: LocalRecording) -> String {
        guard let sessionTitle = recording.sessionTitle?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !sessionTitle.isEmpty else {
            return recording.displayTitle
        }
        return sessionTitle
    }
}

private struct ProtectedOfflineRecordingRow: View {
    let recording: LocalRecording
    let isPlaying: Bool
    let onPlay: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: recording.status.isVerified ? "checkmark.circle.fill" : "waveform")
                    .foregroundStyle(recording.status.isVerified ? Color.green : Color.accentColor)
                    .frame(width: 32, height: 32)
                VStack(alignment: .leading, spacing: 3) {
                    Text(recording.displayTitle)
                        .font(.headline)
                    Text(recording.startedAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Text(recording.statusLabel)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.trailing)
            }

            HStack(spacing: 14) {
                Label(durationLabel, systemImage: "clock")
                Label(
                    ByteCountFormatter.string(fromByteCount: recording.byteCount, countStyle: .file),
                    systemImage: "doc"
                )
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            Button(action: onPlay) {
                Label(isPlaying ? "Stop playback" : "Play local source", systemImage: isPlaying ? "stop.fill" : "play.fill")
                    .frame(minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(!canPlay)
        }
        .padding(.vertical, 5)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureOfflineRecording_\(recording.id)")
    }

    private var canPlay: Bool {
        recording.status.isPlaybackEligible
    }

    private var durationLabel: String {
        let totalSeconds = max(0, Int(recording.durationSeconds.rounded()))
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%d:%02d", minutes, seconds)
    }
}

#Preview {
    ContentView()
        .environmentObject(AudioCaptureController())
        .environmentObject(VideoCaptureController())
}
