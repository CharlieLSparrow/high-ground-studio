import SwiftUI
import AVFoundation
import Combine
import QuipslyVideoCore

@MainActor
private final class AudioRoomLiveClock: ObservableObject {
    @Published var sequenceTime = 0.0
}

private struct AudioRoomLiveTimePill: View {
    @ObservedObject var clock: AudioRoomLiveClock

    var body: some View {
        ProAudioTimePill(
            title: "TIME",
            value: audioRoomFormatDuration(clock.sequenceTime),
            tint: QuipslyStudioTheme.creekMist
        )
    }
}

private struct AudioRoomLiveTimeText: View {
    @ObservedObject var clock: AudioRoomLiveClock

    var body: some View {
        Text(audioRoomFormatDuration(clock.sequenceTime))
            .font(.title3.monospacedDigit())
            .fontWeight(.black)
            .foregroundStyle(QuipslyStudioTheme.creekMist)
    }
}

private struct AudioRoomLiveSlider: View {
    @ObservedObject var clock: AudioRoomLiveClock
    let duration: Double
    let onSetTime: (Double) -> Void

    var body: some View {
        Slider(
            value: Binding(
                get: { min(max(clock.sequenceTime, 0), duration) },
                set: onSetTime
            ),
            in: 0...max(duration, 0.01)
        )
        .tint(QuipslyStudioTheme.creekMist)
        .controlSize(.large)
    }
}

private func audioRoomFormatDuration(_ seconds: Double) -> String {
    let total = max(0, Int(seconds.rounded()))
    return String(format: "%d:%02d:%02d", total / 3600, (total % 3600) / 60, total % 60)
}

struct SourceAwareAudioWorkbenchPanel: View {
    var activeSessionName: String
    @ObservedObject var playbackEngine: PlaybackEngine
    var onSeek: (Double) -> Void
    var onOpenPath: (String, String) -> Void
    var onCopyText: (String, String) -> Void

    @State private var snapshot = SourceAwareAudioWorkbenchSnapshot.loading
    @State private var isLoadingSnapshot = false
    @State private var playingPath = ""
    @State private var playingLabel = ""
    @State private var sequenceTime = 0.0
    @State private var audioRoomClock = AudioRoomLiveClock()
    @State private var selectedTrackRoleId = "charlie"
    @State private var showListeningRoom = false
    @State private var statusNote = "Loading source-aware audio truth without blocking the editor…"

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 12) {
                headerCard
                sharedTransportCard
                stemLaneStack
                referenceMixCard
                reviewWindowsCard
                doctrineCard
            }
            .padding(14)
        }
        .background(QuipslyStudioTheme.sidePanelGradient)
        .task(id: activeSessionName) {
            await reloadSnapshot()
            sequenceTime = playbackEngine.playhead
            audioRoomClock.sequenceTime = playbackEngine.playhead
        }
        .onChange(of: playbackEngine.playhead) { _, newTime in
            guard !playbackEngine.isAuditioning else { return }
            guard newTime.isFinite else { return }
            let bounded = min(max(newTime, 0), max(snapshot.sequenceDurationSeconds, 0))
            DispatchQueue.main.async {
                sequenceTime = bounded
                audioRoomClock.sequenceTime = bounded
            }
        }
        .task(id: playbackEngine.isAuditioning && playbackEngine.isPlaying) {
            guard playbackEngine.isAuditioning, playbackEngine.isPlaying else { return }
            while !Task.isCancelled, playbackEngine.isAuditioning, playbackEngine.isPlaying {
                if let currentTime = playbackEngine.auditionClockTime() {
                    audioRoomClock.sequenceTime = min(max(currentTime, 0), max(snapshot.sequenceDurationSeconds, 0))
                }
                try? await Task.sleep(for: .milliseconds(100))
            }
        }
        .onChange(of: playbackEngine.isAuditioning) { _, isAuditioning in
            if !isAuditioning, !playingPath.isEmpty {
                DispatchQueue.main.async {
                    sequenceTime = audioRoomClock.sequenceTime
                    playingPath = ""
                    playingLabel = ""
                    statusNote = "Audio audition ended on the shared editor clock."
                }
            }
        }
        .onDisappear {
            teardownAudioPlayer()
        }
        .sheet(isPresented: $showListeningRoom) {
            SourceAwareAudioListeningRoom(
                snapshot: snapshot,
                clock: audioRoomClock,
                selectedTrackRoleId: $selectedTrackRoleId,
                isPlaying: playbackEngine.isAuditioning && playbackEngine.isPlaying,
                playingLabel: playingLabel,
                onPlayTrack: { track, time in
                    playAudio(track.path, label: track.label, startAt: time)
                },
                onPlayMix: { time in
                    playStemMix(startAt: time, label: "Charlie + Homer + source live stem mix")
                },
                onPlayTrackRange: { track, start, end, shouldLoop in
                    playAudio(track.path, label: "\(track.label) range", startAt: start, stopAt: end, loopStart: shouldLoop ? start : nil)
                },
                onPlayMixRange: { start, end, shouldLoop in
                    playStemMix(startAt: start, stopAt: end, loopStart: shouldLoop ? start : nil, label: "Charlie + Homer + source live stem mix")
                },
                onPause: pauseAudio,
                onSeekEditor: { time in
                    setSequenceTime(time, syncEditor: true)
                },
                onCopyState: {
                    onCopyText(audioStateReadback, "Copied source-aware audio state")
                }
            )
            .frame(minWidth: 1380, minHeight: 880)
        }
        .accessibilityIdentifier("quipsly.workbench.audio.sourceAware")
    }

    private var selectedTrack: SourceAwareAudioTrackSnapshot? {
        snapshot.tracks.first(where: { $0.roleId == selectedTrackRoleId && $0.roleId != "master" })
            ?? snapshot.tracks.first(where: { $0.roleId != "master" })
    }

    private var transportDuration: Double {
        max(snapshot.sequenceDurationSeconds, 1)
    }

    private var headerCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: snapshot.isReady ? "waveform.path.ecg.rectangle.fill" : "externaldrive.badge.exclamationmark")
                    .font(.title3)
                    .foregroundStyle(snapshot.isReady ? QuipslyStudioTheme.creekMist : QuipslyStudioTheme.honey)
                    .frame(width: 34, height: 34)
                    .background((snapshot.isReady ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey).opacity(0.13))
                    .clipShape(RoundedRectangle(cornerRadius: 11, style: .continuous))

                VStack(alignment: .leading, spacing: 3) {
                    Text("Audio Grove")
                        .font(.headline)
                        .fontWeight(.black)
                    Text("Canonical equal-length stems for Charlie, Homer, and source audio. Mixdowns are secondary references.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 6)

                Text(snapshot.branchRenderReady ? "RENDER READY" : "BRANCH LOCKED")
                    .font(.caption2)
                    .fontWeight(.black)
                    .tracking(0.7)
                    .foregroundStyle(snapshot.branchRenderReady ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey)
                    .padding(.horizontal, 7)
                    .padding(.vertical, 4)
                    .background((snapshot.branchRenderReady ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey).opacity(0.13), in: Capsule())
            }

            HStack(spacing: 6) {
                audioMetricPill("\(snapshot.trackCount)", "lanes", QuipslyStudioTheme.creekMist)
                audioMetricPill("\(snapshot.readyStemCount)", "stems", QuipslyStudioTheme.moss)
                audioMetricPill("\(snapshot.reviewWindows.count)", "listen marks", QuipslyStudioTheme.honey)
            }

            Button {
                showListeningRoom = true
            } label: {
                Label("Open Audio Room", systemImage: "waveform.path.ecg")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(ProAudioRoomButtonStyle())
            .controlSize(.small)
            .help("Open the large visual stem workbench for source-aware listening.")

            Text(statusNote)
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(QuipslyStudioTheme.sage)
                .fixedSize(horizontal: false, vertical: true)

            if !snapshot.isReady {
                Text(snapshot.loadError)
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.clay)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(QuipslyStudioTheme.monitorWallGradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.22), lineWidth: 1)
        )
    }

    private var sharedTransportCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            sharedTransportHeader
            sharedTransportSlider
            sharedTransportPrimaryButtons
            sharedTransportUtilityButtons
            sharedTransportNowPlaying
        }
        .padding(12)
        .background(QuipslyStudioTheme.quietWorkbenchGradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.20), lineWidth: 1)
        )
    }

    private var sharedTransportHeader: some View {
        HStack(alignment: .top, spacing: 8) {
            VStack(alignment: .leading, spacing: 2) {
                Text("One clock")
                    .font(.caption)
                    .fontWeight(.black)
                Text("Scrub once. Hear any stem at the same sequence time. Jump the main editor with the same clock.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            Text(formatDuration(sequenceTime))
                .font(.caption.monospacedDigit())
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.creekMist)
        }
    }

    private var sharedTransportSlider: some View {
        Slider(
            value: Binding<Double>(
                get: { min(max(sequenceTime, 0), transportDuration) },
                set: { setSequenceTime($0, syncEditor: false) }
            ),
            in: 0...transportDuration
        )
        .tint(QuipslyStudioTheme.creekMist)
        .help("Move the source-aware sequence clock. Stem playback seeks to this point.")
    }

    private var sharedTransportPrimaryButtons: some View {
        HStack(spacing: 6) {
            Button {
                jumpToAdjacentReviewWindow(direction: -1)
            } label: {
                Label("Prev", systemImage: "backward.end.fill")
                    .frame(maxWidth: .infinity)
            }

            Button {
                if let selectedTrack {
                    playAudio(selectedTrack.path, label: selectedTrack.label, startAt: sequenceTime)
                } else {
                    statusNote = "No refined source-aware stem is available to play."
                }
            } label: {
                Label("Play stem", systemImage: "play.fill")
                    .frame(maxWidth: .infinity)
            }

            Button {
                pauseAudio()
            } label: {
                Label("Pause", systemImage: "pause.fill")
                    .frame(maxWidth: .infinity)
            }

            Button {
                jumpToAdjacentReviewWindow(direction: 1)
            } label: {
                Label("Next", systemImage: "forward.end.fill")
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.borderedProminent)
        .controlSize(.small)
    }

    private var sharedTransportUtilityButtons: some View {
        HStack(spacing: 6) {
            Button {
                setSequenceTime(sequenceTime, syncEditor: true)
            } label: {
                Label("Jump editor", systemImage: "scope")
                    .frame(maxWidth: .infinity)
            }

            Button {
                onCopyText(audioStateReadback, "Copied source-aware audio state")
            } label: {
                Label("Copy state", systemImage: "doc.text.magnifyingglass")
                    .frame(maxWidth: .infinity)
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
    }

    @ViewBuilder
    private var sharedTransportNowPlaying: some View {
        if !playingLabel.isEmpty {
            Text("Listening: \(playingLabel)")
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(QuipslyStudioTheme.lichen)
                .lineLimit(2)
        }
    }

    private var referenceMixCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 8) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Reference mix")
                        .font(.caption)
                        .fontWeight(.black)
                    Text("Useful for a quick listen or final delivery proof. Not the editing spine.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 6)
                Text(formatDuration(snapshot.masterDurationSeconds))
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
            }

            if let masterTrack = snapshot.tracks.first(where: { $0.roleId == "master" }) {
                AudioWaveformStrip(track: masterTrack, height: 52)
                    .frame(height: 52)
            }

            HStack(spacing: 6) {
                Button {
                    playStemMix(startAt: sequenceTime, label: "Charlie + Homer + source live stem mix")
                } label: {
                    Label("Play voices together", systemImage: "person.2.wave.2.fill")
                        .frame(maxWidth: .infinity)
                }
                .help("Play a live, source-aware review mix from the separate Charlie, Homer, and source stems. This does not alter the files.")

                Button {
                    pauseAudio()
                } label: {
                    Label("Pause", systemImage: "pause.fill")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(ProAudioRoomButtonStyle())
            .controlSize(.small)

            HStack(spacing: 6) {
                Button {
                    onOpenPath(snapshot.masterListenPath, "Episode 4 v006 reference mix")
                } label: {
                    Label("Open", systemImage: "speaker.wave.2.fill")
                        .frame(maxWidth: .infinity)
                }
                Button {
                    onCopyText(snapshot.masterListenPath, "Copied v006 master path")
                } label: {
                    Label("Copy path", systemImage: "doc.on.doc")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(12)
        .background(QuipslyStudioTheme.cardGradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.20), lineWidth: 1)
        )
    }

    private var stemLaneStack: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("Source-aware stems", systemImage: "slider.horizontal.below.waveform")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                Spacer()
                Button {
                    Task {
                        await reloadSnapshot()
                    }
                } label: {
                    if isLoadingSnapshot {
                        ProgressView()
                            .controlSize(.mini)
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .disabled(isLoadingSnapshot)
                .buttonStyle(.bordered)
                .controlSize(.mini)
                .help("Reload the current source-aware audio workbench files from disk.")
            }

            ForEach(snapshot.tracks.filter { $0.roleId != "master" }) { track in
                audioTrackCard(track)
            }
        }
    }

    @MainActor
    private func reloadSnapshot() async {
        guard !isLoadingSnapshot else { return }
        isLoadingSnapshot = true
        statusNote = "Loading source-aware audio truth in the background…"
        let loaded = await Task.detached(priority: .utility) {
            SourceAwareAudioWorkbenchSnapshot.load()
        }.value
        guard !Task.isCancelled else {
            isLoadingSnapshot = false
            return
        }
        snapshot = loaded
        isLoadingSnapshot = false
        statusNote = loaded.isReady
            ? "Source-aware audio truth loaded. Ready to listen."
            : loaded.loadError
    }

    private func audioTrackCard(_ track: SourceAwareAudioTrackSnapshot) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 8) {
                Image(systemName: track.icon)
                    .font(.caption)
                    .foregroundStyle(track.tint)
                    .frame(width: 24, height: 24)
                    .background(track.tint.opacity(0.14))
                    .clipShape(RoundedRectangle(cornerRadius: 8, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(track.label)
                        .font(.caption)
                        .fontWeight(.black)
                        .lineLimit(2)
                    Text(track.purpose)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(3)
                }
                Spacer(minLength: 4)
                Text(track.status.uppercased())
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(track.exists ? QuipslyStudioTheme.creek : QuipslyStudioTheme.clay)
            }

            AudioWaveformStrip(track: track, height: 48)
                .frame(height: 48)

            HStack(spacing: 5) {
                audioMetricPill(formatPercent(track.activePercent), "active", track.tint)
                audioMetricPill(formatDb(track.meanRmsDbfs), "mean", QuipslyStudioTheme.sage)
                audioMetricPill(formatDb(track.maxPeakDbfs), "peak", track.maxPeakDbfs > -3 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.lichen)
            }

            if !track.doNotDo.isEmpty {
                Text(track.doNotDo)
                    .font(.caption2)
                    .foregroundStyle(QuipslyStudioTheme.honey.opacity(0.88))
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 6) {
                Button {
                    selectedTrackRoleId = track.roleId
                    playAudio(track.path, label: track.label, startAt: sequenceTime)
                } label: {
                    Label("Solo", systemImage: "headphones")
                        .frame(maxWidth: .infinity)
                }
                Button {
                    onOpenPath(track.path, track.label)
                } label: {
                    Label("Open", systemImage: "arrow.up.forward.app")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(10)
        .background(track.tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 15, style: .continuous)
                .stroke(track.roleId == selectedTrackRoleId ? track.tint.opacity(0.82) : track.tint.opacity(0.22), lineWidth: track.roleId == selectedTrackRoleId ? 2 : 1)
        )
        .onTapGesture {
            selectedTrackRoleId = track.roleId
            statusNote = "Selected \(track.label) for shared sequence playback."
        }
    }

    private var reviewWindowsCard: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label("Listen marks", systemImage: "ear.badge.waveform")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                Spacer()
                Text("\(snapshot.reviewWindows.count)")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
            }

            Text("Jump to the loudness windows that most deserve ears. These are edit attention marks, not paperwork gates.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            ForEach(snapshot.reviewWindows.prefix(8)) { window in
                HStack(alignment: .top, spacing: 8) {
                    Button {
                        setSequenceTime(window.startSeconds, syncEditor: true)
                        statusNote = "Jumped to \(window.time). Listen and inspect source lanes."
                    } label: {
                        Text(window.time)
                            .font(.caption2.monospacedDigit())
                            .fontWeight(.black)
                            .frame(width: 48)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.mini)

                    VStack(alignment: .leading, spacing: 2) {
                        Text(window.flagsText)
                            .font(.caption2)
                            .fontWeight(.bold)
                            .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.90))
                            .lineLimit(2)
                        Text("Master \(formatDb(window.masterRmsDbfs)) RMS · peak \(formatDb(window.masterSamplePeakDbfs))")
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
                .padding(7)
                .background(QuipslyStudioTheme.panelLift.opacity(0.24), in: RoundedRectangle(cornerRadius: 11, style: .continuous))
            }
        }
        .padding(11)
        .background(QuipslyStudioTheme.recipeCardGradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.18), lineWidth: 1)
        )
    }

    private var doctrineCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("Editor rule")
                .font(.caption2)
                .fontWeight(.black)
                .tracking(0.8)
                .foregroundStyle(QuipslyStudioTheme.creekMist)
            Text("Charlie, Homer, and source audio stems are the editing truth. Keep them equal-length and sequence-aligned so they drop into Quipsly, Premiere, or any other editor cleanly. Mixdowns are generated from stems for proof, delivery, or quick listening.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            HStack(spacing: 6) {
                Button {
                    onOpenPath(snapshot.htmlPath, "Source-aware listen workbench")
                } label: {
                    Label("Open full workbench", systemImage: "safari")
                        .frame(maxWidth: .infinity)
                }
                Button {
                    onCopyText(SourceAwareAudioWorkbenchSnapshot.workbenchPath, "Copied audio workbench JSON path")
                } label: {
                    Label("Copy JSON", systemImage: "curlybraces")
                        .frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
        }
        .padding(11)
        .background(QuipslyStudioTheme.quietWorkbenchGradient, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.18), lineWidth: 1)
        )
    }

    private var audioStateReadback: String {
        let trackLabel = selectedTrack?.label ?? "none"
        return """
        Quipsly Studio Audio Grove
        session: \(activeSessionName)
        sequenceTime: \(String(format: "%.2f", sequenceTime))s
        selectedStem: \(trackLabel)
        playing: \(playingLabel.isEmpty ? "none" : playingLabel)
        canonicalTruth: separate equal-length polished stems for Charlie, Homer, and clip/source audio
        flattenedMixRole: reference/delivery only, not editing spine
        """
    }

    private func playAudio(_ path: String, label: String, startAt: Double = 0, stopAt: Double? = nil, loopStart: Double? = nil) {
        guard !path.isEmpty, FileManager.default.fileExists(atPath: path) else {
            statusNote = "\(label) is missing or the external drive is not mounted."
            return
        }

        let boundedStart = min(max(startAt, 0), max(snapshot.sequenceDurationSeconds, 0))
        let boundedStop = stopAt.map { min(max($0, boundedStart + 0.05), max(snapshot.sequenceDurationSeconds, boundedStart + 0.05)) }
        let boundedLoopStart = loopStart.map { min(max($0, 0), boundedStart) }
        playingPath = path
        playingLabel = label
        sequenceTime = boundedStart
        audioRoomClock.sequenceTime = boundedStart
        playbackEngine.startAudition(
            item: AVPlayerItem(url: URL(fileURLWithPath: path)),
            at: boundedStart,
            stopAt: boundedStop,
            loopStart: boundedLoopStart
        )
        if let stopAt = boundedStop, let loopStart = boundedLoopStart {
            statusNote = "Looping \(label) from \(formatDuration(loopStart)) to \(formatDuration(stopAt))."
        } else if let stopAt = boundedStop {
            statusNote = "Playing \(label) range to \(formatDuration(stopAt))."
        } else {
            statusNote = "Playing \(label) at \(formatDuration(startAt))."
        }
    }

    private func playStemMix(startAt: Double = 0, stopAt: Double? = nil, loopStart: Double? = nil, label: String) {
        let mixTracks = snapshot.tracks.filter { track in
            track.roleId != "master" && !track.path.isEmpty && FileManager.default.fileExists(atPath: track.path)
        }
        guard !mixTracks.isEmpty else {
            statusNote = "No source-aware stems are available to play together."
            return
        }

        let composition = AVMutableComposition()
        let audioMix = AVMutableAudioMix()
        var parameters: [AVMutableAudioMixInputParameters] = []
        let fullDuration = CMTime(seconds: snapshot.sequenceDurationSeconds, preferredTimescale: 600)

        do {
            for track in mixTracks {
                let asset = AVURLAsset(url: URL(fileURLWithPath: track.path))
                guard let sourceTrack = asset.tracks(withMediaType: .audio).first,
                      let compositionTrack = composition.addMutableTrack(
                        withMediaType: .audio,
                        preferredTrackID: kCMPersistentTrackID_Invalid
                      ) else {
                    continue
                }
                let assetDuration = asset.duration
                let insertDuration = min(assetDuration, fullDuration)
                try compositionTrack.insertTimeRange(
                    CMTimeRange(start: .zero, duration: insertDuration),
                    of: sourceTrack,
                    at: .zero
                )

                let input = AVMutableAudioMixInputParameters(track: compositionTrack)
                input.setVolume(auditionGain(for: track), at: .zero)
                parameters.append(input)
            }
        } catch {
            statusNote = "Could not build live stem mix: \(error.localizedDescription)"
            return
        }

        guard !composition.tracks(withMediaType: .audio).isEmpty else {
            statusNote = "Live stem mix has no playable audio tracks."
            return
        }

        audioMix.inputParameters = parameters
        let playerItem = AVPlayerItem(asset: composition)
        playerItem.audioMix = audioMix

        let boundedStart = min(max(startAt, 0), max(snapshot.sequenceDurationSeconds, 0))
        let boundedStop = stopAt.map { min(max($0, boundedStart + 0.05), max(snapshot.sequenceDurationSeconds, boundedStart + 0.05)) }
        let boundedLoopStart = loopStart.map { min(max($0, 0), boundedStart) }
        playingPath = "live-source-aware-stem-mix"
        playingLabel = label
        sequenceTime = boundedStart
        audioRoomClock.sequenceTime = boundedStart
        playbackEngine.startAudition(
            item: playerItem,
            at: boundedStart,
            stopAt: boundedStop,
            loopStart: boundedLoopStart
        )
        let gainSummary = mixTracks.map { "\($0.roleId) \(String(format: "%.1fx", auditionGain(for: $0)))" }.joined(separator: ", ")
        if let stopAt = boundedStop, let loopStart = boundedLoopStart {
            statusNote = "Looping live stem mix from \(formatDuration(loopStart)) to \(formatDuration(stopAt)) with review gain: \(gainSummary)."
        } else if let stopAt = boundedStop {
            statusNote = "Playing live stem mix range to \(formatDuration(stopAt)) with review gain: \(gainSummary)."
        } else {
            statusNote = "Playing live stem mix at \(formatDuration(startAt)) with review gain: \(gainSummary)."
        }
    }

    private func auditionGain(for track: SourceAwareAudioTrackSnapshot) -> Float {
        switch track.roleId {
        case "homer":
            return gainToTargetRms(track.meanRmsDbfs, targetDbfs: -25, minimum: 1.6, maximum: 8.0)
        case "charlie":
            return gainToTargetRms(track.meanRmsDbfs, targetDbfs: -26, minimum: 0.75, maximum: 4.0)
        case "clip-source":
            return gainToTargetRms(track.meanRmsDbfs, targetDbfs: -30, minimum: 0.35, maximum: 2.5)
        default:
            return gainToTargetRms(track.meanRmsDbfs, targetDbfs: -28, minimum: 0.5, maximum: 3.0)
        }
    }

    private func gainToTargetRms(_ currentDbfs: Double, targetDbfs: Double, minimum: Float, maximum: Float) -> Float {
        guard currentDbfs.isFinite, currentDbfs > -90 else { return minimum }
        let rawGain = pow(10.0, (targetDbfs - currentDbfs) / 20.0)
        return min(max(Float(rawGain), minimum), maximum)
    }

    private func pauseAudio() {
        let status = playingPath.isEmpty ? "Nothing is playing yet." : "Paused current audio."
        playbackEngine.pause()
        statusNote = status
    }

    private func setSequenceTime(_ seconds: Double, syncEditor: Bool) {
        let bounded = min(max(seconds, 0), max(snapshot.sequenceDurationSeconds, 0))
        sequenceTime = bounded
        audioRoomClock.sequenceTime = bounded
        if syncEditor {
            onSeek(bounded)
        } else {
            playbackEngine.scrub(to: bounded)
        }
    }

    private func teardownAudioPlayer() {
        playingPath = ""
        playingLabel = ""
        statusNote = "Audio Room closed."
        sequenceTime = audioRoomClock.sequenceTime
        playbackEngine.endAudition(at: sequenceTime)
    }

    private func jumpToAdjacentReviewWindow(direction: Int) {
        guard !snapshot.reviewWindows.isEmpty else {
            statusNote = "No listen marks are available yet."
            return
        }
        let sorted = snapshot.reviewWindows.sorted { $0.startSeconds < $1.startSeconds }
        let target: SourceAwareAudioReviewWindowSnapshot?
        if direction < 0 {
            target = sorted.last(where: { $0.startSeconds < sequenceTime - 0.25 }) ?? sorted.first
        } else {
            target = sorted.first(where: { $0.startSeconds > sequenceTime + 0.25 }) ?? sorted.last
        }
        guard let target else { return }
        setSequenceTime(target.startSeconds, syncEditor: true)
        statusNote = "Jumped to listen mark \(target.time)."
    }

    private func audioMetricPill(_ value: String, _ label: String, _ tint: Color) -> some View {
        VStack(spacing: 1) {
            Text(value)
                .font(.caption2.monospacedDigit())
                .fontWeight(.black)
                .lineLimit(1)
                .minimumScaleFactor(0.72)
            Text(label.uppercased())
                .font(.system(size: 8, weight: .black))
                .tracking(0.45)
        }
        .foregroundStyle(tint)
        .frame(maxWidth: .infinity)
        .padding(.horizontal, 5)
        .padding(.vertical, 5)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    private func formatDuration(_ seconds: Double) -> String {
        guard seconds.isFinite else { return "unknown" }
        let total = Int(seconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }

    private func formatDb(_ value: Double) -> String {
        guard value.isFinite else { return "n/a" }
        return String(format: "%.1f dB", value)
    }

    private func formatPercent(_ value: Double) -> String {
        guard value.isFinite else { return "n/a" }
        return String(format: "%.0f%%", value)
    }
}

private struct AudioWaveformStrip: View {
    let track: SourceAwareAudioTrackSnapshot
    let height: CGFloat

    var body: some View {
        Canvas { context, size in
            guard !track.windows.isEmpty else {
                let rect = CGRect(x: 0, y: size.height * 0.45, width: size.width, height: 2)
                context.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(QuipslyStudioTheme.sage.opacity(0.30)))
                return
            }

            let targetBarCount = max(48, Int(size.width / 2.4))
            let stride = max(1, Int(ceil(Double(track.windows.count) / Double(targetBarCount))))
            let samples = strideWindows(track.windows, by: stride)
            let barWidth = max(1.0, size.width / CGFloat(samples.count))
            let centerY = size.height / 2

            for (index, sample) in samples.enumerated() {
                let x = CGFloat(index) * barWidth
                let normalized = normalizedRms(sample.rmsDbfs)
                let barHeight = max(2, normalized * size.height * 0.94)
                let rect = CGRect(
                    x: x + 0.5,
                    y: centerY - barHeight / 2,
                    width: max(1, barWidth * 0.72),
                    height: barHeight
                )
                var path = Path()
                path.addRoundedRect(in: rect, cornerSize: CGSize(width: 2, height: 2))
                context.fill(path, with: .color(track.tint.opacity(sample.rmsDbfs < -60 ? 0.24 : 0.80)))

                if sample.samplePeakDbfs > -3 {
                    let peakRect = CGRect(x: x + 0.5, y: 1, width: max(1, barWidth * 0.72), height: 3)
                    context.fill(Path(roundedRect: peakRect, cornerRadius: 1), with: .color(QuipslyStudioTheme.clay.opacity(0.95)))
                }
            }

            let midline = CGRect(x: 0, y: centerY - 0.5, width: size.width, height: 1)
            context.fill(Path(roundedRect: midline, cornerRadius: 0.5), with: .color(QuipslyStudioTheme.moonMilk.opacity(0.16)))
        }
        .frame(height: height)
        .padding(6)
        .background(QuipslyStudioTheme.night.opacity(0.56), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 12, style: .continuous)
                .stroke(track.tint.opacity(0.18), lineWidth: 1)
        )
        .accessibilityLabel("\(track.label) waveform and loudness strip")
    }

    private func strideWindows(_ windows: [SourceAwareAudioWindowSnapshot], by stride: Int) -> [SourceAwareAudioWindowSnapshot] {
        guard stride > 1 else { return windows }
        var result: [SourceAwareAudioWindowSnapshot] = []
        var index = 0
        while index < windows.count {
            let chunk = windows[index..<min(index + stride, windows.count)]
            if let loudest = chunk.max(by: { normalizedRms($0.rmsDbfs) < normalizedRms($1.rmsDbfs) }) {
                result.append(loudest)
            }
            index += stride
        }
        return result
    }

    private func normalizedRms(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-12.0, max(-72.0, dbfs))
        return CGFloat((clamped + 72.0) / 60.0)
    }
}

private struct SourceAwareAudioListeningRoom: View {
    let snapshot: SourceAwareAudioWorkbenchSnapshot
    let clock: AudioRoomLiveClock
    @Binding var selectedTrackRoleId: String
    @State private var visibleStartSeconds = 0.0
    @State private var visibleDurationSeconds = 300.0
    @State private var listenRangeStartSeconds: Double?
    @State private var listenRangeEndSeconds: Double?
    @State private var lastMagnification = 1.0
    @State private var waveformGain: CGFloat = 1.35
    @State private var rankedReviewWindows: [SourceAwareAudioReviewWindowSnapshot] = []
    let isPlaying: Bool
    let playingLabel: String
    var onPlayTrack: (SourceAwareAudioTrackSnapshot, Double) -> Void
    var onPlayMix: (Double) -> Void
    var onPlayTrackRange: (SourceAwareAudioTrackSnapshot, Double, Double, Bool) -> Void
    var onPlayMixRange: (Double, Double, Bool) -> Void
    var onPause: () -> Void
    var onSeekEditor: (Double) -> Void
    var onCopyState: () -> Void

    private var duration: Double {
        snapshot.sequenceDurationSeconds
    }

    private var sequenceTime: Double {
        clock.sequenceTime
    }

    private var sourceTracks: [SourceAwareAudioTrackSnapshot] {
        snapshot.tracks.filter { $0.roleId != "master" }
    }

    private var selectedTrack: SourceAwareAudioTrackSnapshot? {
        sourceTracks.first(where: { $0.roleId == selectedTrackRoleId }) ?? sourceTracks.first
    }

    private var visibleDuration: Double {
        min(max(visibleDurationSeconds, 0.05), duration)
    }

    private var listenRange: (start: Double, end: Double)? {
        guard let listenRangeStartSeconds, let listenRangeEndSeconds else { return nil }
        let start = min(max(min(listenRangeStartSeconds, listenRangeEndSeconds), 0), duration)
        let end = min(max(max(listenRangeStartSeconds, listenRangeEndSeconds), 0), duration)
        guard end - start > 0.10 else { return nil }
        return (start, end)
    }

    private var listenRangeLabel: String {
        guard let listenRange else { return "no range selected" }
        return "\(formatDuration(listenRange.start)) -> \(formatDuration(listenRange.end))"
    }

    private var detailWindowLabel: String {
        if visibleDuration < 60 {
            return String(format: "%.1fs", visibleDuration)
        }
        return formatDuration(visibleDuration)
    }

    private var detailTierLabel: String {
        switch visibleDuration {
        case ...0.25: return "SAMPLE"
        case ...2: return "MICRO"
        case ...10: return "TRANSIENT"
        case ...30: return "PHRASE"
        case ...180: return "CONTEXT"
        default: return "EPISODE"
        }
    }

    private var detailDivisionLabel: String {
        let secondsPerDivision = visibleDuration / 12
        if secondsPerDivision < 0.001 {
            return String(format: "%.0f us/div", secondsPerDivision * 1_000_000)
        }
        if secondsPerDivision < 1 {
            return String(format: "%.1f ms/div", secondsPerDivision * 1_000)
        }
        if secondsPerDivision < 60 {
            return String(format: "%.2f s/div", secondsPerDivision)
        }
        return "\(formatDuration(secondsPerDivision))/div"
    }

    private var priorityReviewWindows: [SourceAwareAudioReviewWindowSnapshot] {
        rankedReviewWindows.isEmpty ? snapshot.reviewWindows : rankedReviewWindows
    }

    var body: some View {
        VStack(spacing: 0) {
            roomHeader
            Divider().opacity(0.35)
            ScrollView(.vertical, showsIndicators: true) {
                VStack(alignment: .leading, spacing: 16) {
                    dialogueSplitScope
                    roomTransport
                    homerStageRack
                    reviewWindowRibbon
                    ProAudioStemComparisonLegend()
                }
                .padding(22)
            }
            .simultaneousGesture(
                MagnificationGesture()
                    .onChanged { value in
                        let delta = value / max(lastMagnification, 0.01)
                        if delta > 1.08 {
                            zoomDetail(multiplier: 0.84)
                            lastMagnification = value
                        } else if delta < 0.92 {
                            zoomDetail(multiplier: 1.18)
                            lastMagnification = value
                        }
                    }
                    .onEnded { _ in
                        lastMagnification = 1.0
                    }
            )
            .background(roomBackground)
        }
        .background(roomBackground)
        .onAppear {
            AudioRoomCommandRouter.shared.setAudioRoomActive(true)
            rankReviewWindowsIfNeeded()
            jumpToFirstVoiceIfNeeded()
        }
        .onDisappear {
            AudioRoomCommandRouter.shared.setAudioRoomActive(false)
        }
        .onReceive(clock.$sequenceTime) { _ in
            DispatchQueue.main.async {
                keepVisibleWindowNearPlayhead()
            }
        }
        .onReceive(NotificationCenter.default.publisher(for: .quipslyAudioRoomCommand)) { notification in
            handleAudioRoomCommand(notification)
        }
        .accessibilityIdentifier("quipsly.audioRoom.sourceAware")
    }

    private var roomHeader: some View {
        HStack(spacing: 14) {
            Image(systemName: "waveform.path.ecg.rectangle")
                .font(.title2)
                .foregroundStyle(QuipslyStudioTheme.creekMist)
                .frame(width: 42, height: 42)
                .background(QuipslyStudioTheme.creekMist.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 2) {
                Text("Episode 4 Audio Room")
                    .font(.title3)
                    .fontWeight(.black)
                Text("Charlie, Homer, and source audio on one clock")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("Space plays together. Drag any waveform to scrub.")
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(QuipslyStudioTheme.creekMist.opacity(0.82))
            }

            Spacer()

            AudioRoomLiveTimePill(clock: clock)
            ProAudioTimePill(title: "LENGTH", value: formatDuration(duration), tint: QuipslyStudioTheme.honey)
            ProAudioTimePill(title: "STEMS", value: "\(sourceTracks.count)", tint: QuipslyStudioTheme.moss)
        }
        .padding(.horizontal, 22)
        .padding(.vertical, 14)
        .background(.regularMaterial)
    }

    private var dialogueLongCompare: some View {
        ProAudioDialogueLongCompare(
            charlieTrack: sourceTracks.first { $0.roleId == "charlie" },
            homerTrack: sourceTracks.first { $0.roleId == "homer" },
            duration: duration,
            visibleStartSeconds: visibleStartSeconds,
            visibleDurationSeconds: visibleDuration,
            sequenceTime: sequenceTime,
            rangeStartSeconds: listenRange?.start,
            rangeEndSeconds: listenRange?.end,
            onSelectTime: { time in
                setTime(time)
            }
        )
    }

    private var homerStageRack: some View {
        ProAudioHomerStageRack(
            homerTrack: sourceTracks.first { $0.roleId == "homer" },
            duration: duration
        )
        .equatable()
    }

    private var reviewWindowRibbon: some View {
        ProAudioReviewWindowRibbon(
            windows: Array(priorityReviewWindows.prefix(18)),
            totalCount: snapshot.reviewWindows.count,
            onSelect: jumpToReviewWindow
        )
        .equatable()
    }

    private var roomTransport: some View {
        VStack(alignment: .leading, spacing: 11) {
            HStack(alignment: .firstTextBaseline) {
                Label("Transport", systemImage: "playpause.fill")
                    .font(.caption)
                    .fontWeight(.black)
                    .tracking(1.1)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                    .textCase(.uppercase)
                Spacer()
                AudioRoomLiveTimeText(clock: clock)
                Text("/ \(formatDuration(duration))")
                    .font(.caption.monospacedDigit())
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
            }

            AudioRoomLiveSlider(clock: clock, duration: duration, onSetTime: setTime)

            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 10) {
                    Button {
                        setTime(sequenceTime - 10)
                    } label: {
                        audioRoomShortcutLabel("Back 10", systemImage: "gobackward.10", key: "J")
                    }
                    .help("J: move back 10 seconds")

                    Button {
                        if isPlaying {
                            onPause()
                        } else {
                            onPlayMix(sequenceTime)
                        }
                    } label: {
                        audioRoomShortcutLabel(
                            isPlaying ? "Pause" : "Play Together",
                            systemImage: isPlaying ? "pause.fill" : "play.fill",
                            key: "Space"
                        )
                        .frame(minWidth: 118)
                    }
                    .help("Space: play or pause Charlie, Homer, and source together")

                    Button {
                        setTime(sequenceTime + 10)
                    } label: {
                        audioRoomShortcutLabel("Forward 10", systemImage: "goforward.10", key: "L")
                    }
                    .help("L: move forward 10 seconds")

                    Divider().frame(height: 24)

                    Button {
                        zoomDetail(multiplier: 0.5)
                    } label: {
                        audioRoomShortcutLabel("Detail", systemImage: "plus.magnifyingglass", key: "+")
                    }
                    .help("+: zoom into the aligned audio detail")

                    Button {
                        zoomDetail(multiplier: 2.0)
                    } label: {
                        audioRoomShortcutLabel("Context", systemImage: "minus.magnifyingglass", key: "-")
                    }
                    .help("-: zoom out for more timeline context")

                    Button {
                        fitWholeEpisode()
                    } label: {
                        audioRoomShortcutLabel("Fit", systemImage: "arrow.left.and.right", key: "0")
                    }
                    .help("0: fit the full episode")

                    Text(detailWindowLabel)
                        .font(.caption2.monospacedDigit())
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.creekMist)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(QuipslyStudioTheme.night.opacity(0.78), in: Capsule())
                        .overlay(Capsule().stroke(QuipslyStudioTheme.creekMist.opacity(0.26), lineWidth: 1))
                        .accessibilityLabel("Visible audio window \(detailWindowLabel)")

                    VStack(alignment: .leading, spacing: 1) {
                        Text(detailTierLabel)
                            .font(.system(size: 8, weight: .black, design: .monospaced))
                            .tracking(0.8)
                            .foregroundStyle(QuipslyStudioTheme.honey)
                        Text(detailDivisionLabel)
                            .font(.system(size: 9, weight: .bold, design: .monospaced))
                            .foregroundStyle(QuipslyStudioTheme.sage)
                    }
                    .accessibilityElement(children: .ignore)
                    .accessibilityLabel("\(detailTierLabel) audio detail, \(detailDivisionLabel)")

                    Spacer(minLength: 8)
                }

                HStack(spacing: 10) {
                    Button("30s") { setDetailWindow(seconds: 30) }
                        .help("Show a 30 second phrase window with high-resolution waveform and spectrogram")
                    Button("5s") { setDetailWindow(seconds: 5) }
                        .help("Show a 5 second transient window")
                    Button("1s") { setDetailWindow(seconds: 1) }
                        .help("Show one second for precise edits")
                    Button("100ms") { setDetailWindow(seconds: 0.1) }
                        .help("Show 100 milliseconds for sample-adjacent inspection")

                    Divider().frame(height: 22)

                    Button { jumpReviewMark(direction: -1) } label: {
                        audioRoomShortcutLabel("Previous Mark", systemImage: "backward.end.fill", key: "[")
                    }
                    .help("[: previous listen mark")
                    Button { jumpReviewMark(direction: 1) } label: {
                        audioRoomShortcutLabel("Next Mark", systemImage: "forward.end.fill", key: "]")
                    }
                    .help("]: next listen mark")
                    Button { jumpToNextVoice() } label: {
                        audioRoomShortcutLabel("Next Voice", systemImage: "waveform.badge.magnifyingglass", key: "V")
                    }
                    .help("V: next voice activity")
                    Button { jumpToNextOverlap() } label: {
                        audioRoomShortcutLabel("Overlap", systemImage: "person.2.wave.2.fill", key: "Shift O")
                    }
                    .help("Shift-O: next Charlie/Homer overlap")

                    Spacer(minLength: 8)

                    Menu {
                    Button("First voice") { jumpToFirstVoice() }
                    Divider()
                    Button("Zoom in") { zoomDetail(multiplier: 0.5) }
                    Button("Zoom out") { zoomDetail(multiplier: 2.0) }
                    Button("Show 100 milliseconds") { setDetailWindow(seconds: 0.1) }
                    Button("Show 1 second") { setDetailWindow(seconds: 1) }
                    Button("Show 5 seconds") { setDetailWindow(seconds: 5) }
                    Button("Show 30 seconds") { setDetailWindow(seconds: 30) }
                    Button("Show 2 minutes") { setDetailWindow(seconds: 120) }
                    Button("Fit whole episode") { fitWholeEpisode() }
                    Divider()
                    Button("Increase waveform height") { waveformGain = min(waveformGain * 1.22, 4.0) }
                    Button("Decrease waveform height") { waveformGain = max(waveformGain / 1.22, 0.55) }
                    } label: {
                        Label("View", systemImage: "slider.horizontal.3")
                    }

                    Menu {
                        Button("Pause") { onPause() }
                        Divider()
                        Button("Sync video editor to this time") { onSeekEditor(sequenceTime) }
                        Button("Copy agent-readable state") { onCopyState() }
                    } label: {
                        Label("Tools", systemImage: "wrench.and.screwdriver")
                    }
                }
            }
            .buttonStyle(ProAudioRoomButtonStyle())
            .controlSize(.small)

            roomRangeControls

            Text("J/L jump   Space play/pause   K stop   I/O range   [ ] marks   V voice   ⇧O overlap   +/- zoom   0 fit")
                .font(.caption2.monospaced())
                .fontWeight(.semibold)
                .foregroundStyle(QuipslyStudioTheme.sage.opacity(0.86))
                .accessibilityLabel("Audio Room keyboard shortcuts")

            if isPlaying, !playingLabel.isEmpty {
                Text("Listening to \(playingLabel)")
                    .font(.caption)
                    .fontWeight(.semibold)
                    .foregroundStyle(QuipslyStudioTheme.lichen)
            }
        }
        .padding(16)
        .background(QuipslyStudioTheme.night.opacity(0.52), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.16), lineWidth: 1)
        )
    }

    private func audioRoomShortcutLabel(_ title: String, systemImage: String, key: String) -> some View {
        HStack(spacing: 7) {
            Label(title, systemImage: systemImage)
            Text(key)
                .font(.caption2.monospaced())
                .fontWeight(.black)
                .padding(.horizontal, 5)
                .padding(.vertical, 2)
                .background(QuipslyStudioTheme.moonMilk.opacity(0.10), in: RoundedRectangle(cornerRadius: 5))
                .overlay(
                    RoundedRectangle(cornerRadius: 5)
                        .stroke(QuipslyStudioTheme.moonMilk.opacity(0.16), lineWidth: 1)
                )
        }
    }

    private var roomRangeControls: some View {
        HStack(spacing: 10) {
            Text("Selection")
                .font(.caption2)
                .fontWeight(.black)
                .tracking(0.8)
                .foregroundStyle(QuipslyStudioTheme.honey)
                .textCase(.uppercase)

            Button {
                setListenRangeIn()
            } label: {
                Label("Set In", systemImage: "bracket.left")
            }
            .help("I: set selection in point")

            Button {
                setListenRangeOut()
            } label: {
                Label("Set Out", systemImage: "bracket.right")
            }
            .help("O: set selection out point")

            Button {
                setCenteredListenRange(radius: 5)
            } label: {
                Label("Select 10s", systemImage: "scope")
            }
            .help("T: select 10 seconds around the playhead")

            Button {
                setCenteredListenRange(radius: 15)
            } label: {
                Label("Select 30s", systemImage: "scope")
            }
            .help("Shift-T: select 30 seconds around the playhead")

            Divider().frame(height: 24)

            Button {
                guard let listenRange, let selectedTrack else { return }
                setTime(listenRange.start)
                onPlayTrackRange(selectedTrack, listenRange.start, listenRange.end, false)
            } label: {
                Label("Solo Range", systemImage: "waveform")
            }
            .disabled(listenRange == nil || selectedTrack == nil)

            Button {
                guard let listenRange else { return }
                setTime(listenRange.start)
                onPlayMixRange(listenRange.start, listenRange.end, false)
            } label: {
                Label("Together Range", systemImage: "person.2.wave.2")
            }
            .disabled(listenRange == nil)

            Menu {
                Button("Loop selected stem") {
                    guard let listenRange, let selectedTrack else { return }
                    setTime(listenRange.start)
                    onPlayTrackRange(selectedTrack, listenRange.start, listenRange.end, true)
                }
                .disabled(listenRange == nil || selectedTrack == nil)
                Button("Loop together") {
                    guard let listenRange else { return }
                    setTime(listenRange.start)
                    onPlayMixRange(listenRange.start, listenRange.end, true)
                }
                .disabled(listenRange == nil)
            } label: {
                Label("Loop", systemImage: "repeat")
            }
            .disabled(listenRange == nil)

            Button(role: .destructive) {
                listenRangeStartSeconds = nil
                listenRangeEndSeconds = nil
            } label: {
                Label("Clear", systemImage: "xmark")
            }
            .disabled(listenRangeStartSeconds == nil && listenRangeEndSeconds == nil)

            Spacer()

            Text(listenRangeLabel)
                .font(.caption.monospacedDigit())
                .fontWeight(.bold)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(QuipslyStudioTheme.honey.opacity(0.14), in: Capsule())
                .foregroundStyle(listenRange == nil ? .secondary : QuipslyStudioTheme.honey)
        }
        .buttonStyle(ProAudioRoomButtonStyle(tint: QuipslyStudioTheme.honey))
        .controlSize(.small)
    }

    private var overviewTimeline: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Whole episode")
                    .font(.caption)
                    .fontWeight(.black)
                    .tracking(0.8)
                    .foregroundStyle(QuipslyStudioTheme.sage)
                Spacer()
                Text("\(formatDuration(visibleStartSeconds)) -> \(formatDuration(min(visibleStartSeconds + visibleDuration, duration)))")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.bold)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
            }

            ProAudioOverviewStrip(
                tracks: sourceTracks,
                duration: duration,
                visibleStartSeconds: visibleStartSeconds,
                visibleDurationSeconds: visibleDuration,
                sequenceTime: sequenceTime,
                rangeStartSeconds: listenRange?.start,
                rangeEndSeconds: listenRange?.end,
                reviewWindows: snapshot.reviewWindows,
                onSelectTime: { time in
                    setTime(time)
                }
            )
            .frame(height: 118)
        }
    }

    private var listeningLens: some View {
        ProAudioListeningLens(
            tracks: sourceTracks,
            duration: duration,
            sequenceTime: sequenceTime,
            selectedTrackId: selectedTrackRoleId,
            rangeStartSeconds: listenRange?.start,
            rangeEndSeconds: listenRange?.end,
            waveformGain: waveformGain,
            onSelectTrack: { track in
                selectedTrackRoleId = track.roleId
            },
            onSelectTime: { time in
                setTime(time)
            },
            onPlayTrackRange: { track, start, end, loop in
                selectedTrackRoleId = track.roleId
                setTime(start)
                onPlayTrackRange(track, start, end, loop)
            },
            onPlayMixRange: { start, end, loop in
                setTime(start)
                onPlayMixRange(start, end, loop)
            },
            onPause: {
                onPause()
            }
        )
    }

    private var speakerBalanceTimeline: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Conversation map")
                    .font(.caption)
                    .fontWeight(.black)
                    .tracking(0.8)
                    .foregroundStyle(QuipslyStudioTheme.sage)
                Spacer()
                Text("Charlie / Homer / overlap")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            ProAudioSpeakerBalanceStrip(
                charlieTrack: sourceTracks.first(where: { $0.roleId == "charlie" }),
                homerTrack: sourceTracks.first(where: { $0.roleId == "homer" }),
                visibleStartSeconds: visibleStartSeconds,
                visibleDurationSeconds: visibleDuration,
                sequenceTime: sequenceTime,
                rangeStartSeconds: listenRange?.start,
                rangeEndSeconds: listenRange?.end,
                onSelectTime: { time in
                    setTime(time)
                }
            )
            .frame(height: 96)
        }
    }

    private var soundGlassTimeline: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Sound glass")
                    .font(.caption)
                    .fontWeight(.black)
                    .tracking(0.8)
                    .foregroundStyle(QuipslyStudioTheme.sage)
                Spacer()
                Text("voice • overlap • source")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            ProAudioFocusHeatMap(
                tracks: sourceTracks,
                visibleStartSeconds: visibleStartSeconds,
                visibleDurationSeconds: visibleDuration,
                sequenceTime: sequenceTime,
                rangeStartSeconds: listenRange?.start,
                rangeEndSeconds: listenRange?.end,
                onSelectTime: { time in
                    setTime(time)
                }
            )
            .frame(height: 82)
        }
    }

    private var conversationFocusPanel: some View {
        ProAudioConversationFocusPanel(
            states: currentStemStates,
            sequenceTime: sequenceTime,
            title: conversationFocusTitle,
            detail: conversationFocusDetail,
            selectedRoleId: selectedTrackRoleId,
            onSelectTrack: { track in
                selectedTrackRoleId = track.roleId
            },
            onPlayTrack: { track in
                selectedTrackRoleId = track.roleId
                onPlayTrack(track, sequenceTime)
            }
        )
    }

    private var twinStemConsole: some View {
        ProAudioTwinStemConsole(
            tracks: snapshot.tracks.filter { $0.roleId != "master" },
            duration: snapshot.sequenceDurationSeconds,
            visibleStartSeconds: visibleStartSeconds,
            visibleDurationSeconds: visibleDurationSeconds,
            sequenceTime: sequenceTime,
            rangeStartSeconds: listenRange?.start,
            rangeEndSeconds: listenRange?.end,
            waveformGain: waveformGain,
            selectedTrackId: selectedTrackRoleId,
            onSelectTrack: { selectedTrackRoleId = $0.roleId },
            onSelectTime: { newTime in
                setTime(newTime)
            },
            onPlayTrack: { track in
                onPlayTrack(track, sequenceTime)
            },
            onPlayMix: {
                onPlayMix(sequenceTime)
            },
            onPause: {
                onPause()
            },
            onNudge: { delta in
                setTime(sequenceTime + delta)
            },
            onZoom: { multiplier in
                zoomDetail(multiplier: multiplier)
            },
            onFit: {
                visibleStartSeconds = 0
                visibleDurationSeconds = duration
            }
        )
    }

    private var dialogueSplitScope: some View {
        let dialogueTracks = sourceTracks.filter { track in
            track.roleId == "charlie" || track.roleId == "homer"
        }

        return VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Dialogue scope")
                    .font(.caption)
                    .fontWeight(.black)
                    .tracking(0.8)
                    .foregroundStyle(QuipslyStudioTheme.sage)
                Spacer()
                Text("separate stems, same clock")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 14) {
                ForEach(dialogueTracks.prefix(2)) { track in
                    ProAudioDialogueScopeCard(
                        track: track,
                        duration: duration,
                        visibleStartSeconds: visibleStartSeconds,
                        visibleDurationSeconds: visibleDuration,
                        clock: clock,
                        rangeStartSeconds: listenRange?.start,
                        rangeEndSeconds: listenRange?.end,
                        isSelected: selectedTrackRoleId == track.roleId,
                        waveformGain: waveformGain,
                        onSelect: {
                            selectedTrackRoleId = track.roleId
                        },
                        onSelectTime: { time in
                            selectedTrackRoleId = track.roleId
                            setTime(time)
                        },
                        onPlay: {
                            selectedTrackRoleId = track.roleId
                            onPlayTrack(track, sequenceTime)
                        }
                    )
                }
            }
        }
    }

    private var stemMeterShelf: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Live stem meters")
                    .font(.caption)
                    .fontWeight(.black)
                    .tracking(0.8)
                    .foregroundStyle(QuipslyStudioTheme.sage)
                Spacer()
                Text("one clock, separate ears")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(sourceTracks) { track in
                        ProAudioLiveStemMeterCard(
                            track: track,
                            sequenceTime: sequenceTime,
                            isSelected: track.roleId == selectedTrackRoleId,
                            onSelect: {
                                selectedTrackRoleId = track.roleId
                            },
                            onPlay: {
                                selectedTrackRoleId = track.roleId
                                onPlayTrack(track, sequenceTime)
                            }
                        )
                        .frame(width: 310)
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }

    private var roomBackground: some View {
        LinearGradient(
            colors: [
                QuipslyStudioTheme.night,
                QuipslyStudioTheme.night.opacity(0.94),
                QuipslyStudioTheme.creek.opacity(0.44)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private var currentStemStates: [ProAudioCurrentStemState] {
        let baseStates = sourceTracks.map { track in
            ProAudioCurrentStemState(
                track: track,
                window: currentWindow(for: track, at: sequenceTime),
                isDominant: false
            )
        }
        let dominantRoleId = baseStates
            .filter { $0.isLive }
            .max { $0.activity < $1.activity }?
            .track.roleId
        return baseStates.map { state in
            state.settingDominant(state.track.roleId == dominantRoleId)
        }
    }

    private var conversationFocusTitle: String {
        let liveStates = currentStemStates.filter { $0.isLive }
        let hasCharlie = liveStates.contains { $0.track.roleId == "charlie" }
        let hasHomer = liveStates.contains { $0.track.roleId == "homer" }
        if hasCharlie && hasHomer {
            return "Charlie and Homer overlap"
        }
        if hasCharlie {
            return "Charlie is carrying this moment"
        }
        if hasHomer {
            return "Homer is carrying this moment"
        }
        if let dominant = liveStates.first(where: { $0.isDominant }) {
            return "\(dominant.track.label) is active"
        }
        return "Quiet or transition space"
    }

    private var conversationFocusDetail: String {
        let liveStates = currentStemStates.filter { $0.isLive }
        guard !liveStates.isEmpty else {
            return "No source stem is above the dialogue threshold here. This is a good candidate for silence, a cut, or a transition check."
        }
        if liveStates.count > 1 {
            let names = liveStates.map { $0.shortLabel }.joined(separator: " + ")
            return "\(names) are active at this playhead. Use solo or range playback to decide whether this is useful reaction, natural overlap, or cleanup work."
        }
        if let only = liveStates.first {
            return "\(only.shortLabel) is the main audible source at this moment. The other stems should stay visually quiet unless they contain useful reaction."
        }
        return "Source-aware stems are visible on the same clock."
    }

    private func currentWindow(for track: SourceAwareAudioTrackSnapshot, at time: Double) -> SourceAwareAudioWindowSnapshot? {
        track.windows.first { window in
            window.startSeconds <= time && time <= window.endSeconds
        }
    }

    private func setTime(_ time: Double) {
        clock.sequenceTime = min(max(time, 0), duration)
        keepVisibleWindowNearPlayhead()
    }

    private func setCenteredListenRange(radius: Double) {
        let boundedRadius = max(radius, 1)
        let start = max(sequenceTime - boundedRadius, 0)
        let end = min(sequenceTime + boundedRadius, duration)
        listenRangeStartSeconds = start
        listenRangeEndSeconds = end
        visibleStartSeconds = max(start - boundedRadius, 0)
        visibleDurationSeconds = min(max((end - start) * 2.2, 30), duration)
    }

    private func setListenRangeIn() {
        listenRangeStartSeconds = sequenceTime
        if listenRangeEndSeconds == nil || (listenRangeEndSeconds ?? 0) <= sequenceTime {
            listenRangeEndSeconds = min(sequenceTime + min(30, visibleDuration), duration)
        }
    }

    private func setListenRangeOut() {
        listenRangeEndSeconds = sequenceTime
        if listenRangeStartSeconds == nil || (listenRangeStartSeconds ?? 0) >= sequenceTime {
            listenRangeStartSeconds = max(sequenceTime - min(30, visibleDuration), 0)
        }
    }

    private func handleAudioRoomCommand(_ notification: Notification) {
        guard
            let rawValue = notification.object as? String,
            let command = AudioRoomCommand(rawValue: rawValue)
        else { return }

        switch command {
        case .togglePlayback:
            _ = toggleTogetherFromKeyboard()
        case .backTenSeconds:
            setTime(sequenceTime - 10)
        case .pause:
            onPause()
        case .forwardTenSeconds:
            setTime(sequenceTime + 10)
        case .setIn:
            setListenRangeIn()
        case .setOut:
            setListenRangeOut()
        case .previousMark:
            jumpReviewMark(direction: -1)
        case .nextMark:
            jumpReviewMark(direction: 1)
        case .nextVoice:
            jumpToNextVoice()
        case .firstVoice:
            jumpToFirstVoice()
        case .nextOverlap:
            jumpToNextOverlap()
        case .selectTenSeconds:
            setCenteredListenRange(radius: 5)
        case .selectThirtySeconds:
            setCenteredListenRange(radius: 15)
        case .zoomIn:
            zoomDetail(multiplier: 0.5)
        case .zoomOut:
            zoomDetail(multiplier: 2.0)
        case .fitEpisode:
            fitWholeEpisode()
        case .syncEditor:
            onSeekEditor(sequenceTime)
        case .copyAgentState:
            onCopyState()
        }
    }

    private func toggleTogetherFromKeyboard() -> KeyPress.Result {
        if isPlaying {
            onPause()
        } else {
            onPlayMix(sequenceTime)
        }
        return .handled
    }

    private func fitWholeEpisode() {
        visibleStartSeconds = 0
        visibleDurationSeconds = duration
    }

    private func jumpToFirstVoiceIfNeeded() {
        guard sequenceTime <= 0.25 else { return }
        jumpToFirstVoice()
    }

    private func jumpToFirstVoice() {
        guard let cue = voiceCue(after: -0.01) else { return }
        selectedTrackRoleId = cue.track.roleId
        setTime(cue.window.startSeconds)
        onSeekEditor(cue.window.startSeconds)
    }

    private func jumpToNextVoice() {
        let searchFrom = min(sequenceTime + 0.75, duration)
        let cue = voiceCue(after: searchFrom) ?? voiceCue(after: -0.01)
        guard let cue else { return }
        selectedTrackRoleId = cue.track.roleId
        setTime(cue.window.startSeconds)
        onSeekEditor(cue.window.startSeconds)
    }

    private func jumpToNextOverlap() {
        let searchFrom = min(sequenceTime + 0.75, duration)
        let target = voiceOverlapCue(after: searchFrom) ?? voiceOverlapCue(after: -0.01)
        guard let target else { return }
        setTime(target)
        onSeekEditor(target)
    }

    private func voiceOverlapCue(after time: Double) -> Double? {
        guard let charlieTrack = sourceTracks.first(where: { $0.roleId == "charlie" }),
              let homerTrack = sourceTracks.first(where: { $0.roleId == "homer" }) else {
            return nil
        }
        let charlieWindows = charlieTrack.windows.filter(isMeaningfulVoiceWindow)
        let homerWindows = homerTrack.windows.filter(isMeaningfulVoiceWindow)
        var bestStart: Double?
        for charlieWindow in charlieWindows {
            for homerWindow in homerWindows where homerWindow.endSeconds >= charlieWindow.startSeconds && homerWindow.startSeconds <= charlieWindow.endSeconds {
                let overlapStart = max(charlieWindow.startSeconds, homerWindow.startSeconds)
                let overlapEnd = min(charlieWindow.endSeconds, homerWindow.endSeconds)
                guard overlapEnd >= time else { continue }
                let candidate = max(overlapStart, time)
                if bestStart == nil || candidate < (bestStart ?? candidate) {
                    bestStart = candidate
                }
            }
        }
        return bestStart
    }

    private func voiceCue(after time: Double) -> (track: SourceAwareAudioTrackSnapshot, window: SourceAwareAudioWindowSnapshot)? {
        let candidates = sourceTracks.flatMap { track in
            track.windows
                .filter { $0.endSeconds >= time && isMeaningfulVoiceWindow($0) }
                .map { (track: track, window: $0) }
        }
        return candidates.min { left, right in
            let leftStart = max(left.window.startSeconds, time)
            let rightStart = max(right.window.startSeconds, time)
            if leftStart == rightStart {
                return left.window.rmsDbfs > right.window.rmsDbfs
            }
            return leftStart < rightStart
        }
    }

    private func isMeaningfulVoiceWindow(_ window: SourceAwareAudioWindowSnapshot) -> Bool {
        window.rmsDbfs > -58 || window.samplePeakDbfs > -35
    }

    private func jumpReviewMark(direction: Int) {
        guard !snapshot.reviewWindows.isEmpty else { return }
        let sorted = snapshot.reviewWindows.sorted { $0.startSeconds < $1.startSeconds }
        let target: SourceAwareAudioReviewWindowSnapshot?
        if direction < 0 {
            target = sorted.last(where: { $0.startSeconds < sequenceTime - 0.25 }) ?? sorted.first
        } else {
            target = sorted.first(where: { $0.startSeconds > sequenceTime + 0.25 }) ?? sorted.last
        }
        if let target {
            setTime(target.startSeconds)
            onSeekEditor(target.startSeconds)
        }
    }

    private func jumpToReviewWindow(_ window: SourceAwareAudioReviewWindowSnapshot) {
        let start = max(window.startSeconds - 5, 0)
        let end = min(max(window.endSeconds + 5, window.startSeconds + 10), duration)
        listenRangeStartSeconds = start
        listenRangeEndSeconds = end
        visibleDurationSeconds = min(max(end - start, 30), duration)
        visibleStartSeconds = min(max(window.startSeconds - visibleDurationSeconds * 0.22, 0), max(duration - visibleDurationSeconds, 0))
        setTime(window.startSeconds)
        onSeekEditor(window.startSeconds)
    }

    private func reviewWindowPriorityScore(_ window: SourceAwareAudioReviewWindowSnapshot) -> Int {
        let text = window.flagsText.lowercased()
        var score = 0
        if text.contains("proof") { score += 80 }
        if text.contains("critical") { score += 75 }
        if text.contains("asr") || text.contains("transcript") { score += 70 }
        if text.contains("bleed") || text.contains("leak") || text.contains("echo") { score += 65 }
        if text.contains("source") { score += 55 }
        if text.contains("master energy") { score += 35 }
        if text.contains("quiet") { score -= 40 }
        if window.masterSamplePeakDbfs > -6 { score += 18 }
        if window.masterRmsDbfs > -38 { score += 12 }
        return score
    }

    private func rankReviewWindowsIfNeeded() {
        guard rankedReviewWindows.isEmpty, !snapshot.reviewWindows.isEmpty else { return }
        rankedReviewWindows = snapshot.reviewWindows.sorted { left, right in
            let leftScore = reviewWindowPriorityScore(left)
            let rightScore = reviewWindowPriorityScore(right)
            if leftScore == rightScore {
                return left.startSeconds < right.startSeconds
            }
            return leftScore > rightScore
        }
    }

    private func formatReviewDb(_ dbfs: Double) -> String {
        guard dbfs.isFinite else { return "-inf" }
        if dbfs <= -89 { return "-inf" }
        return String(format: "%.1f", dbfs)
    }

    private func zoomDetail(multiplier: Double) {
        let oldDuration = visibleDuration
        let newDuration = min(max(oldDuration * multiplier, 0.05), duration)
        let center = min(max(sequenceTime, 0), duration)
        visibleDurationSeconds = newDuration
        visibleStartSeconds = min(max(center - newDuration / 2, 0), max(duration - newDuration, 0))
    }

    private func setDetailWindow(seconds: Double) {
        let newDuration = min(max(seconds, 0.05), duration)
        visibleDurationSeconds = newDuration
        visibleStartSeconds = min(max(sequenceTime - newDuration / 2, 0), max(duration - newDuration, 0))
    }

    private func keepVisibleWindowNearPlayhead() {
        let window = visibleDuration
        if sequenceTime < visibleStartSeconds {
            visibleStartSeconds = max(sequenceTime - window * 0.18, 0)
        } else if sequenceTime > visibleStartSeconds + window {
            visibleStartSeconds = min(max(sequenceTime - window * 0.82, 0), max(duration - window, 0))
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}

private struct ProAudioReviewWindowRibbon: View, Equatable {
    let windows: [SourceAwareAudioReviewWindowSnapshot]
    let totalCount: Int
    let onSelect: (SourceAwareAudioReviewWindowSnapshot) -> Void

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.totalCount == rhs.totalCount &&
            lhs.windows.map(\.id) == rhs.windows.map(\.id)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 10) {
                Label("Listen marks", systemImage: "ear.and.waveform")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                    .textCase(.uppercase)
                    .tracking(1.4)

                Spacer()

                Text("\(windows.count) shown / \(totalCount) marks")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 10) {
                    ForEach(windows) { window in
                        Button {
                            onSelect(window)
                        } label: {
                            VStack(alignment: .leading, spacing: 6) {
                                HStack(spacing: 7) {
                                    Text(window.time)
                                        .font(.caption.monospacedDigit())
                                        .fontWeight(.black)
                                        .foregroundStyle(QuipslyStudioTheme.moonMilk)
                                    Circle()
                                        .fill(window.masterSamplePeakDbfs > -3 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.honey)
                                        .frame(width: 7, height: 7)
                                }

                                Text(window.flagsText)
                                    .font(.caption2)
                                    .fontWeight(.semibold)
                                    .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.76))
                                    .lineLimit(2)
                                    .frame(width: 138, alignment: .leading)

                                Text("\(formatDb(window.masterRmsDbfs)) rms / \(formatDb(window.masterSamplePeakDbfs)) peak")
                                    .font(.system(size: 9, weight: .bold, design: .monospaced))
                                    .foregroundStyle(.secondary)
                            }
                            .padding(10)
                            .frame(width: 166, alignment: .leading)
                            .background(
                                LinearGradient(
                                    colors: [
                                        QuipslyStudioTheme.honey.opacity(0.18),
                                        QuipslyStudioTheme.night.opacity(0.54)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                ),
                                in: RoundedRectangle(cornerRadius: 15, style: .continuous)
                            )
                            .overlay(
                                RoundedRectangle(cornerRadius: 15, style: .continuous)
                                    .stroke(QuipslyStudioTheme.honey.opacity(0.20), lineWidth: 1)
                            )
                        }
                        .buttonStyle(.plain)
                        .help("Jump to \(window.time), set a focused listen range, and sync the main editor clock.")
                    }
                }
                .padding(.vertical, 2)
            }
        }
        .padding(14)
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.night.opacity(0.52),
                    QuipslyStudioTheme.honey.opacity(0.08)
                ],
                startPoint: .leading,
                endPoint: .trailing
            ),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.14), lineWidth: 1)
        )
    }

    private func formatDb(_ dbfs: Double) -> String {
        guard dbfs.isFinite, dbfs > -89 else { return "-inf" }
        return String(format: "%.1f", dbfs)
    }
}

private struct ProAudioCurrentStemState: Identifiable {
    let track: SourceAwareAudioTrackSnapshot
    let window: SourceAwareAudioWindowSnapshot?
    let isDominant: Bool

    var id: String { track.roleId }

    var rmsDbfs: Double {
        window?.rmsDbfs ?? -90
    }

    var peakDbfs: Double {
        window?.samplePeakDbfs ?? -90
    }

    var activity: CGFloat {
        normalizedRms(rmsDbfs)
    }

    var isLive: Bool {
        activity > 0.18
    }

    var shortLabel: String {
        switch track.roleId {
        case "charlie":
            return "Charlie"
        case "homer":
            return "Homer"
        case "source", "clip":
            return "Source"
        default:
            return track.label
        }
    }

    func settingDominant(_ value: Bool) -> ProAudioCurrentStemState {
        ProAudioCurrentStemState(track: track, window: window, isDominant: value)
    }

    private func normalizedRms(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-12.0, max(-72.0, dbfs))
        return CGFloat((clamped + 72.0) / 60.0)
    }
}

private struct ProAudioFocusHeatMap: View {
    let tracks: [SourceAwareAudioTrackSnapshot]
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    var onSelectTime: (Double) -> Void

    private var visibleEndSeconds: Double {
        visibleStartSeconds + max(visibleDurationSeconds, 1)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Canvas { context, size in
                    drawBackground(context: context, size: size)
                    drawSourceBed(context: context, size: size)
                    drawDialogue(track: track(roleId: "charlie"), yRange: 0.10...0.42, context: context, size: size)
                    drawDialogue(track: track(roleId: "homer"), yRange: 0.58...0.90, context: context, size: size)
                    drawOverlap(context: context, size: size)
                    drawRange(context: context, size: size)
                    drawPlayhead(context: context, size: size)
                }

                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                let ratio = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                                onSelectTime(visibleStartSeconds + Double(ratio) * max(visibleDurationSeconds, 1))
                            }
                    )
            }
        }
        .padding(8)
        .background(QuipslyStudioTheme.night.opacity(0.50), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.18), lineWidth: 1)
        )
    }

    private func track(roleId: String) -> SourceAwareAudioTrackSnapshot? {
        tracks.first { $0.roleId == roleId }
    }

    private func drawBackground(context: GraphicsContext, size: CGSize) {
        context.fill(Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 12), with: .color(QuipslyStudioTheme.night.opacity(0.35)))
        context.fill(Path(CGRect(x: 0, y: size.height * 0.50, width: size.width, height: 1)), with: .color(QuipslyStudioTheme.moonMilk.opacity(0.12)))
        for index in 1..<8 {
            let x = CGFloat(index) / 8.0 * size.width
            context.fill(Path(CGRect(x: x, y: 0, width: 1, height: size.height)), with: .color(QuipslyStudioTheme.moonMilk.opacity(0.055)))
        }
    }

    private func drawSourceBed(context: GraphicsContext, size: CGSize) {
        let sourceTracks = tracks.filter { $0.roleId != "charlie" && $0.roleId != "homer" }
        guard !sourceTracks.isEmpty else { return }
        for track in sourceTracks {
            for window in visibleWindows(for: track) {
                let intensity = normalizedRms(window.rmsDbfs)
                guard intensity > 0.10 || window.samplePeakDbfs > -38 else { continue }
                let rect = rectForWindow(window, y: size.height * 0.42, height: size.height * 0.16, size: size)
                context.fill(Path(roundedRect: rect, cornerRadius: 4), with: .color(QuipslyStudioTheme.honey.opacity(0.16 + Double(intensity) * 0.52)))
            }
        }
    }

    private func drawDialogue(track: SourceAwareAudioTrackSnapshot?, yRange: ClosedRange<CGFloat>, context: GraphicsContext, size: CGSize) {
        guard let track else { return }
        for window in visibleWindows(for: track) {
            let intensity = normalizedRms(window.rmsDbfs)
            guard intensity > 0.12 || window.samplePeakDbfs > -40 else { continue }
            let laneTop = size.height * yRange.lowerBound
            let laneHeight = size.height * (yRange.upperBound - yRange.lowerBound)
            let pulseHeight = max(4, laneHeight * intensity)
            let rect = rectForWindow(window, y: laneTop + (laneHeight - pulseHeight) / 2, height: pulseHeight, size: size)
            context.fill(Path(roundedRect: rect, cornerRadius: 5), with: .color(track.tint.opacity(0.18 + Double(intensity) * 0.72)))
            if window.samplePeakDbfs > -3 {
                let peakRect = CGRect(x: rect.minX, y: laneTop, width: max(1.5, rect.width), height: 3)
                context.fill(Path(peakRect), with: .color(QuipslyStudioTheme.clay.opacity(0.95)))
            }
        }
    }

    private func drawOverlap(context: GraphicsContext, size: CGSize) {
        guard let charlie = track(roleId: "charlie"),
              let homer = track(roleId: "homer") else { return }
        let homerWindows = visibleWindows(for: homer).filter(isVoice)
        for charlieWindow in visibleWindows(for: charlie).filter(isVoice) {
            for homerWindow in homerWindows where homerWindow.endSeconds >= charlieWindow.startSeconds && homerWindow.startSeconds <= charlieWindow.endSeconds {
                let start = max(max(charlieWindow.startSeconds, homerWindow.startSeconds), visibleStartSeconds)
                let end = min(min(charlieWindow.endSeconds, homerWindow.endSeconds), visibleEndSeconds)
                guard end > start else { continue }
                let x1 = CGFloat((start - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
                let x2 = CGFloat((end - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
                let rect = CGRect(x: x1, y: size.height * 0.18, width: max(2, x2 - x1), height: size.height * 0.64)
                context.fill(Path(roundedRect: rect, cornerRadius: 5), with: .color(QuipslyStudioTheme.honey.opacity(0.36)))
            }
        }
    }

    private func drawRange(context: GraphicsContext, size: CGSize) {
        guard let rangeStartSeconds, let rangeEndSeconds else { return }
        let start = max(min(rangeStartSeconds, rangeEndSeconds), visibleStartSeconds)
        let end = min(max(rangeStartSeconds, rangeEndSeconds), visibleEndSeconds)
        guard end > start else { return }
        let x1 = CGFloat((start - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        let x2 = CGFloat((end - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        let rect = CGRect(x: x1, y: 0, width: max(3, x2 - x1), height: size.height)
        context.stroke(Path(roundedRect: rect.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 8), with: .color(QuipslyStudioTheme.honey.opacity(0.72)), lineWidth: 1.5)
    }

    private func drawPlayhead(context: GraphicsContext, size: CGSize) {
        guard sequenceTime >= visibleStartSeconds && sequenceTime <= visibleEndSeconds else { return }
        let x = CGFloat((sequenceTime - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        context.fill(Path(CGRect(x: x - 1.25, y: 0, width: 2.5, height: size.height)), with: .color(QuipslyStudioTheme.clay))
        context.fill(Path(ellipseIn: CGRect(x: x - 5, y: 2, width: 10, height: 10)), with: .color(QuipslyStudioTheme.clay))
    }

    private func visibleWindows(for track: SourceAwareAudioTrackSnapshot) -> [SourceAwareAudioWindowSnapshot] {
        track.windows.filter { $0.endSeconds >= visibleStartSeconds && $0.startSeconds <= visibleEndSeconds }
    }

    private func rectForWindow(_ window: SourceAwareAudioWindowSnapshot, y: CGFloat, height: CGFloat, size: CGSize) -> CGRect {
        let start = max(window.startSeconds, visibleStartSeconds)
        let end = min(window.endSeconds, visibleEndSeconds)
        let x1 = CGFloat((start - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        let x2 = CGFloat((end - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        return CGRect(x: x1, y: y, width: max(1.5, x2 - x1), height: height)
    }

    private func isVoice(_ window: SourceAwareAudioWindowSnapshot) -> Bool {
        window.rmsDbfs > -58 || window.samplePeakDbfs > -35
    }

    private func normalizedRms(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-12.0, max(-72.0, dbfs))
        return CGFloat((clamped + 72.0) / 60.0)
    }
}

private struct ProAudioConversationFocusPanel: View {
    let states: [ProAudioCurrentStemState]
    let sequenceTime: Double
    let title: String
    let detail: String
    let selectedRoleId: String
    var onSelectTrack: (SourceAwareAudioTrackSnapshot) -> Void
    var onPlayTrack: (SourceAwareAudioTrackSnapshot) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .center, spacing: 12) {
                Label(title, systemImage: iconName)
                    .font(.headline)
                    .fontWeight(.black)
                    .foregroundStyle(titleTint)
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)

                Spacer(minLength: 10)

                Text(formatDuration(sequenceTime))
                    .font(.headline.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(QuipslyStudioTheme.creekMist.opacity(0.12), in: Capsule())
            }

            HStack(spacing: 12) {
                ForEach(states) { state in
                    ProAudioConversationStemTile(
                        state: state,
                        isSelected: state.track.roleId == selectedRoleId,
                        onSelect: {
                            onSelectTrack(state.track)
                        },
                        onPlay: {
                            onPlayTrack(state.track)
                        }
                    )
                }
            }

        }
        .padding(16)
        .background(
            LinearGradient(
                colors: [
                    titleTint.opacity(0.12),
                    QuipslyStudioTheme.night.opacity(0.58)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(titleTint.opacity(0.30), lineWidth: 1)
        )
        .help(detail)
    }

    private var liveCount: Int {
        states.filter { $0.isLive }.count
    }

    private var titleTint: Color {
        if liveCount > 1 {
            return QuipslyStudioTheme.honey
        }
        return states.first(where: { $0.isDominant })?.track.tint ?? QuipslyStudioTheme.sage
    }

    private var iconName: String {
        if liveCount > 1 {
            return "person.2.wave.2.fill"
        }
        if liveCount == 1 {
            return "waveform.circle.fill"
        }
        return "moon.zzz.fill"
    }

    private func formatDuration(_ seconds: Double) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }
        return String(format: "%d:%02d", minutes, secs)
    }
}

private struct ProAudioConversationStemTile: View {
    let state: ProAudioCurrentStemState
    let isSelected: Bool
    var onSelect: () -> Void
    var onPlay: () -> Void

    var body: some View {
        Button(action: onSelect) {
            VStack(alignment: .leading, spacing: 10) {
                HStack(spacing: 8) {
                    Image(systemName: state.track.icon)
                        .font(.headline)
                        .foregroundStyle(state.track.tint)
                    Text(state.shortLabel)
                        .font(.caption)
                        .fontWeight(.black)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Circle()
                        .fill(state.isLive ? QuipslyStudioTheme.lichen : QuipslyStudioTheme.moonMilk.opacity(0.26))
                        .frame(width: 8, height: 8)
                        .shadow(color: state.isLive ? QuipslyStudioTheme.lichen.opacity(0.72) : .clear, radius: 5)
                }

                ProAudioHorizontalLevelMeter(level: state.activity, tint: state.track.tint, peakHot: state.peakDbfs > -3)
                    .frame(height: 18)

                HStack(spacing: 8) {
                    Text(formatDb(state.rmsDbfs))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Text(formatDb(state.peakDbfs))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(state.peakDbfs > -3 ? QuipslyStudioTheme.clay : .secondary)
                    Spacer()
                    Button(action: onPlay) {
                        Image(systemName: "play.fill")
                    }
                    .buttonStyle(ProAudioRoomButtonStyle(tint: state.track.tint))
                    .controlSize(.mini)
                }
            }
            .padding(12)
            .frame(minHeight: 104)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                LinearGradient(
                    colors: [
                        state.track.tint.opacity(state.isDominant ? 0.20 : 0.10),
                        QuipslyStudioTheme.night.opacity(0.46)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: RoundedRectangle(cornerRadius: 18, style: .continuous)
            )
            .overlay(
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(state.track.tint.opacity(isSelected ? 0.82 : state.isDominant ? 0.56 : 0.20), lineWidth: isSelected ? 2 : 1)
            )
        }
        .buttonStyle(.plain)
        .help("Select \(state.track.label). The level meter reflects this stem at the shared playhead.")
    }

    private func formatDb(_ dbfs: Double) -> String {
        guard dbfs.isFinite else { return "-inf dB" }
        if dbfs <= -89 { return "-inf dB" }
        return String(format: "%.1f dB", dbfs)
    }
}

private struct ProAudioSpeakerBalanceStrip: View {
    let charlieTrack: SourceAwareAudioTrackSnapshot?
    let homerTrack: SourceAwareAudioTrackSnapshot?
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    var onSelectTime: (Double) -> Void

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Canvas { context, size in
                    drawBackground(context: context, size: size)
                    drawActivity(for: charlieTrack, yRange: 0.12...0.43, tint: QuipslyStudioTheme.creekMist, context: context, size: size)
                    drawActivity(for: homerTrack, yRange: 0.57...0.88, tint: QuipslyStudioTheme.moss, context: context, size: size)
                    drawOverlap(context: context, size: size)
                    drawDominanceRiver(context: context, size: size)
                    drawRange(context: context, size: size)
                    drawPlayhead(context: context, size: size)
                }

                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                let ratio = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                                onSelectTime(visibleStartSeconds + Double(ratio) * max(visibleDurationSeconds, 1))
                            }
                    )
            }
        }
        .padding(8)
        .background(QuipslyStudioTheme.night.opacity(0.46), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.18), lineWidth: 1)
        )
    }

    private func drawBackground(context: GraphicsContext, size: CGSize) {
        context.fill(Path(roundedRect: CGRect(origin: .zero, size: size), cornerRadius: 12), with: .color(QuipslyStudioTheme.night.opacity(0.40)))
        context.fill(Path(CGRect(x: 0, y: size.height * 0.50, width: size.width, height: 1)), with: .color(QuipslyStudioTheme.moonMilk.opacity(0.10)))
    }

    private func drawRange(context: GraphicsContext, size: CGSize) {
        guard let rangeStartSeconds, let rangeEndSeconds else { return }
        let visibleEnd = visibleStartSeconds + max(visibleDurationSeconds, 1)
        let start = max(min(rangeStartSeconds, rangeEndSeconds), visibleStartSeconds)
        let end = min(max(rangeStartSeconds, rangeEndSeconds), visibleEnd)
        guard end > start else { return }
        let x1 = CGFloat((start - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        let x2 = CGFloat((end - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        let rect = CGRect(x: x1, y: 0, width: max(4, x2 - x1), height: size.height)
        context.fill(Path(roundedRect: rect, cornerRadius: 8), with: .color(QuipslyStudioTheme.honey.opacity(0.13)))
        context.stroke(Path(roundedRect: rect.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 8), with: .color(QuipslyStudioTheme.honey.opacity(0.72)), lineWidth: 1.5)
    }

    private func drawActivity(for track: SourceAwareAudioTrackSnapshot?, yRange: ClosedRange<CGFloat>, tint: Color, context: GraphicsContext, size: CGSize) {
        guard let track else { return }
        let visibleEnd = visibleStartSeconds + max(visibleDurationSeconds, 1)
        for window in track.windows where window.endSeconds >= visibleStartSeconds && window.startSeconds <= visibleEnd {
            let loudness = normalizedRms(window.rmsDbfs)
            guard loudness > 0.16 else { continue }
            let x1 = CGFloat((max(window.startSeconds, visibleStartSeconds) - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
            let x2 = CGFloat((min(window.endSeconds, visibleEnd) - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
            let laneTop = size.height * yRange.lowerBound
            let laneBottom = size.height * yRange.upperBound
            let laneHeight = laneBottom - laneTop
            let pulseHeight = max(3, laneHeight * loudness)
            let rect = CGRect(x: x1, y: laneTop + (laneHeight - pulseHeight) / 2, width: max(1.5, x2 - x1), height: pulseHeight)
            var path = Path()
            path.addRoundedRect(in: rect, cornerSize: CGSize(width: 4, height: 4))
            context.fill(path, with: .color(tint.opacity(0.22 + Double(loudness) * 0.68)))
        }
    }

    private func drawOverlap(context: GraphicsContext, size: CGSize) {
        guard let charlieTrack, let homerTrack else { return }
        let visibleEnd = visibleStartSeconds + max(visibleDurationSeconds, 1)
        let homerActive = homerTrack.windows.filter { $0.endSeconds >= visibleStartSeconds && $0.startSeconds <= visibleEnd && normalizedRms($0.rmsDbfs) > 0.16 }
        for charlieWindow in charlieTrack.windows where charlieWindow.endSeconds >= visibleStartSeconds && charlieWindow.startSeconds <= visibleEnd && normalizedRms(charlieWindow.rmsDbfs) > 0.16 {
            for homerWindow in homerActive where homerWindow.endSeconds >= charlieWindow.startSeconds && homerWindow.startSeconds <= charlieWindow.endSeconds {
                let start = max(max(charlieWindow.startSeconds, homerWindow.startSeconds), visibleStartSeconds)
                let end = min(min(charlieWindow.endSeconds, homerWindow.endSeconds), visibleEnd)
                guard end > start else { continue }
                let x1 = CGFloat((start - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
                let x2 = CGFloat((end - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
                let rect = CGRect(x: x1, y: size.height * 0.40, width: max(2, x2 - x1), height: size.height * 0.20)
                context.fill(Path(roundedRect: rect, cornerRadius: 3), with: .color(QuipslyStudioTheme.honey.opacity(0.66)))
            }
        }
    }

    private func drawDominanceRiver(context: GraphicsContext, size: CGSize) {
        guard let charlieTrack, let homerTrack else { return }
        let visibleEnd = visibleStartSeconds + max(visibleDurationSeconds, 1)
        let homerWindows = homerTrack.windows.filter { $0.endSeconds >= visibleStartSeconds && $0.startSeconds <= visibleEnd }

        for charlieWindow in charlieTrack.windows where charlieWindow.endSeconds >= visibleStartSeconds && charlieWindow.startSeconds <= visibleEnd {
            let start = max(charlieWindow.startSeconds, visibleStartSeconds)
            let end = min(charlieWindow.endSeconds, visibleEnd)
            guard end > start else { continue }
            let homerWindow = homerWindows.first { $0.endSeconds >= start && $0.startSeconds <= end }
            let charlieLevel = normalizedRms(charlieWindow.rmsDbfs)
            let homerLevel = normalizedRms(homerWindow?.rmsDbfs ?? -120)
            let total = charlieLevel + homerLevel
            guard total > 0.22 else { continue }

            let x = CGFloat(((start + end) / 2 - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
            let balance = (homerLevel - charlieLevel) / max(total, 0.001)
            let y = size.height * (0.50 + balance * 0.30)
            let radius = min(max(2.0, total * 6.0), 7.0)
            let tint: Color
            if abs(balance) < 0.18 {
                tint = QuipslyStudioTheme.honey
            } else if balance < 0 {
                tint = QuipslyStudioTheme.creekMist
            } else {
                tint = QuipslyStudioTheme.moss
            }
            let rect = CGRect(x: x - radius, y: y - radius, width: radius * 2, height: radius * 2)
            context.fill(Path(ellipseIn: rect), with: .color(tint.opacity(0.24 + Double(min(total, 1)) * 0.50)))
        }
    }

    private func drawPlayhead(context: GraphicsContext, size: CGSize) {
        guard sequenceTime >= visibleStartSeconds,
              sequenceTime <= visibleStartSeconds + visibleDurationSeconds else {
            return
        }
        let x = CGFloat((sequenceTime - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        context.fill(Path(CGRect(x: x - 1.25, y: 0, width: 2.5, height: size.height)), with: .color(QuipslyStudioTheme.clay))
        context.fill(Path(ellipseIn: CGRect(x: x - 5, y: 2, width: 10, height: 10)), with: .color(QuipslyStudioTheme.clay))
    }

    private func normalizedRms(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-18.0, max(-78.0, dbfs))
        return CGFloat((clamped + 78.0) / 60.0)
    }
}

private struct ProAudioDialogueScopeCard: View {
    let track: SourceAwareAudioTrackSnapshot
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    @ObservedObject var clock: AudioRoomLiveClock
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let isSelected: Bool
    let waveformGain: CGFloat
    var onSelect: () -> Void
    var onSelectTime: (Double) -> Void
    var onPlay: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: track.icon)
                    .font(.headline)
                    .foregroundStyle(track.tint)
                    .frame(width: 32, height: 32)
                    .background(track.tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                VStack(alignment: .leading, spacing: 1) {
                    Text(shortName)
                        .font(.headline)
                        .fontWeight(.black)
                    Text(track.exists ? "refined stem" : "missing stem")
                        .font(.caption2)
                        .foregroundStyle(track.exists ? QuipslyStudioTheme.lichen : QuipslyStudioTheme.clay)
                }

                Spacer()

                ProAudioTimePill(title: "MEAN", value: String(format: "%.1f", track.meanRmsDbfs), tint: QuipslyStudioTheme.sage)
                ProAudioTimePill(title: "PEAK", value: String(format: "%.1f", track.maxPeakDbfs), tint: track.maxPeakDbfs > -3 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.lichen)

                Button(action: onPlay) {
                    Image(systemName: "play.fill")
                }
                .buttonStyle(ProAudioRoomButtonStyle(tint: track.tint))
                .controlSize(.mini)
            }

            ProAudioStageGateMiniBar(track: track)

            ProAudioWaveformAnalysisLegend(tint: track.tint)

            GeometryReader { proxy in
                ZStack(alignment: .topLeading) {
                    ProAudioStemWaveformCanvas(
                        track: track,
                        duration: duration,
                        visibleStartSeconds: visibleStartSeconds,
                        visibleDurationSeconds: visibleDurationSeconds,
                        sequenceTime: clock.sequenceTime,
                        rangeStartSeconds: rangeStartSeconds,
                        rangeEndSeconds: rangeEndSeconds,
                        detailed: true,
                        waveformGain: waveformGain
                    )
                    .frame(width: proxy.size.width, height: proxy.size.height)

                    Color.clear
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    let ratio = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                                    onSelectTime(visibleStartSeconds + Double(ratio) * max(visibleDurationSeconds, 1))
                                }
                        )
                }
            }
            .frame(height: detailHeight)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            LinearGradient(
                colors: [
                    track.tint.opacity(isSelected ? 0.18 : 0.10),
                    QuipslyStudioTheme.night.opacity(0.62)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 22, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(track.tint.opacity(isSelected ? 0.74 : 0.24), lineWidth: isSelected ? 2 : 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .onTapGesture(perform: onSelect)
    }

    private var detailHeight: CGFloat {
        switch visibleDurationSeconds {
        case ...2: return 280
        case ...10: return 240
        case ...30: return 210
        default: return 160
        }
    }

    private var shortName: String {
        switch track.roleId {
        case "charlie":
            return "Charlie"
        case "homer":
            return "Homer"
        default:
            return track.label
        }
    }
}

private struct ProAudioLiveStemMeterCard: View {
    let track: SourceAwareAudioTrackSnapshot
    let sequenceTime: Double
    let isSelected: Bool
    var onSelect: () -> Void
    var onPlay: () -> Void

    private var currentWindow: SourceAwareAudioWindowSnapshot? {
        if let direct = track.windows.first(where: { $0.startSeconds <= sequenceTime && sequenceTime <= $0.endSeconds }) {
            return direct
        }
        return track.windows.min { left, right in
            abs(((left.startSeconds + left.endSeconds) / 2.0) - sequenceTime) < abs(((right.startSeconds + right.endSeconds) / 2.0) - sequenceTime)
        }
    }

    private var rmsDbfs: Double {
        currentWindow?.rmsDbfs ?? -90
    }

    private var peakDbfs: Double {
        currentWindow?.samplePeakDbfs ?? -90
    }

    private var activity: CGFloat {
        normalizedRms(rmsDbfs)
    }

    private var isLive: Bool {
        activity > 0.18
    }

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: track.icon)
                .font(.title3)
                .foregroundStyle(track.tint)
                .frame(width: 42, height: 42)
                .background(track.tint.opacity(0.14), in: RoundedRectangle(cornerRadius: 14, style: .continuous))

            VStack(alignment: .leading, spacing: 7) {
                HStack(spacing: 7) {
                    Text(track.label)
                        .font(.subheadline)
                        .fontWeight(.black)
                        .lineLimit(1)
                    Spacer(minLength: 4)
                    Circle()
                        .fill(isLive ? QuipslyStudioTheme.lichen : QuipslyStudioTheme.moonMilk.opacity(0.28))
                        .frame(width: 8, height: 8)
                        .shadow(color: isLive ? QuipslyStudioTheme.lichen.opacity(0.65) : .clear, radius: 5)
                }

                ProAudioHorizontalLevelMeter(level: activity, tint: track.tint, peakHot: peakDbfs > -3)
                    .frame(height: 12)

                HStack(spacing: 8) {
                    Text(formatDb(rmsDbfs))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                    Text(formatDb(peakDbfs))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(peakDbfs > -3 ? QuipslyStudioTheme.clay : .secondary)
                    Spacer()
                    Button {
                        onPlay()
                    } label: {
                        Image(systemName: "play.fill")
                    }
                    .buttonStyle(ProAudioRoomButtonStyle(tint: track.tint))
                    .controlSize(.mini)
                }
            }
        }
        .padding(12)
        .background(
            LinearGradient(
                colors: [
                    track.tint.opacity(isSelected ? 0.18 : 0.09),
                    QuipslyStudioTheme.night.opacity(0.58)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 20, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(track.tint.opacity(isSelected ? 0.72 : 0.24), lineWidth: isSelected ? 2 : 1)
        )
        .contentShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
        .onTapGesture(perform: onSelect)
    }

    private func formatDb(_ dbfs: Double) -> String {
        guard dbfs.isFinite else { return "-inf dB" }
        if dbfs <= -89 { return "-inf dB" }
        return String(format: "%.1f dB", dbfs)
    }

    private func normalizedRms(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-12.0, max(-72.0, dbfs))
        return CGFloat((clamped + 72.0) / 60.0)
    }
}

private struct ProAudioHorizontalLevelMeter: View {
    let level: CGFloat
    let tint: Color
    let peakHot: Bool

    var body: some View {
        GeometryReader { proxy in
            let width = max(proxy.size.width, 1)
            let clamped = min(max(level, 0), 1)
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(QuipslyStudioTheme.moonMilk.opacity(0.10))
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [
                                tint.opacity(0.58),
                                peakHot ? QuipslyStudioTheme.clay : tint
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: max(3, width * clamped))
                Rectangle()
                    .fill(QuipslyStudioTheme.honey.opacity(0.65))
                    .frame(width: 1.5)
                    .offset(x: width * 0.74)
                Rectangle()
                    .fill(QuipslyStudioTheme.clay.opacity(0.75))
                    .frame(width: 1.5)
                    .offset(x: width * 0.90)
            }
        }
        .clipShape(Capsule())
    }
}

private struct ProAudioStemLane: View {
    let track: SourceAwareAudioTrackSnapshot
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let isSelected: Bool
    let waveformGain: CGFloat
    var onSelectTime: (Double) -> Void
    var onSelectTrack: () -> Void
    var onPlay: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            laneHeader
            GeometryReader { proxy in
                ZStack(alignment: .topLeading) {
                    ProAudioStemWaveformCanvas(
                        track: track,
                        duration: duration,
                        visibleStartSeconds: visibleStartSeconds,
                        visibleDurationSeconds: visibleDurationSeconds,
                        sequenceTime: sequenceTime,
                        rangeStartSeconds: rangeStartSeconds,
                        rangeEndSeconds: rangeEndSeconds,
                        detailed: true,
                        waveformGain: waveformGain
                    )
                    .frame(width: proxy.size.width, height: proxy.size.height)

                    Color.clear
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    let width = max(proxy.size.width, 1)
                                    let ratio = min(max(value.location.x / width, 0), 1)
                                    onSelectTime(visibleStartSeconds + Double(ratio) * max(visibleDurationSeconds, 1))
                                    onSelectTrack()
                                }
                        )
                        .simultaneousGesture(
                            TapGesture(count: 2).onEnded {
                                onPlay()
                            }
                        )
                }
            }
            .frame(height: 148)
        }
        .background(track.tint.opacity(isSelected ? 0.14 : 0.07), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(track.tint.opacity(isSelected ? 0.72 : 0.22), lineWidth: isSelected ? 2 : 1)
        )
        .shadow(color: track.tint.opacity(isSelected ? 0.20 : 0.06), radius: isSelected ? 18 : 8, y: 8)
        .onTapGesture {
            onSelectTrack()
        }
    }

    private var laneHeader: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 12) {
                Image(systemName: track.icon)
                    .foregroundStyle(track.tint)
                    .font(.headline)
                    .frame(width: 34, height: 34)
                    .background(track.tint.opacity(0.13), in: RoundedRectangle(cornerRadius: 11, style: .continuous))

                VStack(alignment: .leading, spacing: 2) {
                    Text(track.label)
                        .font(.headline)
                        .fontWeight(.black)
                        .lineLimit(1)
                    Text(track.exists ? "source stem ready" : "stem missing")
                        .font(.caption)
                        .foregroundStyle(track.exists ? QuipslyStudioTheme.lichen : QuipslyStudioTheme.clay)
                }

                Spacer()

                ProAudioTimePill(title: "ACTIVE", value: String(format: "%.0f%%", track.activePercent), tint: track.tint)
                ProAudioTimePill(title: "MEAN", value: String(format: "%.1f", track.meanRmsDbfs), tint: QuipslyStudioTheme.sage)
                ProAudioTimePill(title: "PEAK", value: String(format: "%.1f", track.maxPeakDbfs), tint: track.maxPeakDbfs > -3 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.lichen)

                Button {
                    onPlay()
                } label: {
                    Image(systemName: "play.fill")
                }
                .buttonStyle(ProAudioRoomButtonStyle(tint: track.tint))
                .controlSize(.small)
            }

            ProAudioStageGateMiniBar(track: track)
        }
        .padding(.horizontal, 16)
        .padding(.top, 14)
        .padding(.bottom, 8)
    }
}

private struct ProAudioStageGateMiniBar: View {
    let track: SourceAwareAudioTrackSnapshot

    var body: some View {
        VStack(alignment: .leading, spacing: 5) {
            GeometryReader { proxy in
                let width = max(proxy.size.width, 1)
                let sourceWidth = width * percentWidth(track.alignedActivePercent)
                let refinedWidth = width * percentWidth(track.refinedActivePercent)

                ZStack(alignment: .leading) {
                    Capsule()
                        .fill(QuipslyStudioTheme.moonMilk.opacity(0.08))
                    Capsule()
                        .fill(track.tint.opacity(0.18))
                        .frame(width: sourceWidth)
                    Capsule()
                        .fill(track.tint.opacity(0.72))
                        .frame(width: refinedWidth)
                        .frame(height: 8)
                        .offset(y: 5)
                }
            }
            .frame(height: 16)

            HStack(spacing: 8) {
                stagePill("SRC", track.alignedActivePercent, tint: track.tint.opacity(0.72))
                stagePill("REF", track.refinedActivePercent, tint: track.tint)
                stagePill("KEEP", track.contributionRetentionPercent, tint: retentionTint)
                Spacer(minLength: 0)
            }
        }
        .help(stageHelp)
    }

    private var retentionTint: Color {
        if track.contributionRetentionPercent < 45 { return QuipslyStudioTheme.clay }
        if track.contributionRetentionPercent < 70 { return QuipslyStudioTheme.honey }
        return QuipslyStudioTheme.lichen
    }

    private var stageHelp: String {
        "Aligned source activity \(String(format: "%.1f", track.alignedActiveSeconds))s; refined contribution activity \(String(format: "%.1f", track.refinedActiveSeconds))s; retained \(String(format: "%.0f", track.contributionRetentionPercent))%."
    }

    private func percentWidth(_ value: Double) -> CGFloat {
        CGFloat(min(max(value / 100, 0), 1))
    }

    private func stagePill(_ title: String, _ value: Double, tint: Color) -> some View {
        HStack(spacing: 3) {
            Text(title)
                .font(.system(size: 8, weight: .black))
                .tracking(0.55)
            Text(String(format: "%.0f%%", value))
                .font(.caption2.monospacedDigit())
                .fontWeight(.black)
        }
        .foregroundStyle(tint)
        .padding(.horizontal, 7)
        .padding(.vertical, 3)
        .background(tint.opacity(0.11), in: Capsule())
    }
}

private struct ProAudioListeningLens: View {
    let tracks: [SourceAwareAudioTrackSnapshot]
    let duration: Double
    let sequenceTime: Double
    let selectedTrackId: String
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let waveformGain: CGFloat
    var onSelectTrack: (SourceAwareAudioTrackSnapshot) -> Void
    var onSelectTime: (Double) -> Void
    var onPlayTrackRange: (SourceAwareAudioTrackSnapshot, Double, Double, Bool) -> Void
    var onPlayMixRange: (Double, Double, Bool) -> Void
    var onPause: () -> Void

    private var lensDuration: Double {
        min(max(duration, 1), 64)
    }

    private var lensStart: Double {
        let proposed = sequenceTime - lensDuration / 2
        let latestStart = max(duration - lensDuration, 0)
        return min(max(proposed, 0), latestStart)
    }

    private var lensEnd: Double {
        min(lensStart + lensDuration, duration)
    }

    var body: some View {
        lensBody
            .padding(16)
            .background(lensBackground)
            .accessibilityLabel("Listening lens with Charlie Homer and source audio stems")
            .focusable(true)
            .onKeyPress(characters: CharacterSet(charactersIn: "1")) { _ in playTrack(at: 0, loop: false) }
            .onKeyPress(characters: CharacterSet(charactersIn: "2")) { _ in playTrack(at: 1, loop: false) }
            .onKeyPress(characters: CharacterSet(charactersIn: "3")) { _ in playTrack(at: 2, loop: false) }
            .onKeyPress(characters: CharacterSet(charactersIn: "mM")) { _ in playMix(loop: false) }
            .onKeyPress(characters: CharacterSet(charactersIn: "lL")) { _ in playMix(loop: true) }
            .onKeyPress(.space) { playMix(loop: false) }
    }

    private var lensBody: some View {
        VStack(alignment: .leading, spacing: 12) {
            lensHeader
            shortcutStrip
            lensRuler
            stemCards
            braid
            healthRail
            lensTransport
        }
    }

    private var lensHeader: some View {
        HStack(spacing: 10) {
            Label("Listening lens", systemImage: "scope")
                .font(.caption)
                .fontWeight(.black)
                .tracking(1.5)
                .textCase(.uppercase)
                .foregroundStyle(QuipslyStudioTheme.creekMist)

            Spacer()

            Text("\(formatDuration(lensStart)) -> \(formatDuration(lensEnd))")
                .font(.caption2.monospacedDigit())
                .fontWeight(.bold)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 9)
                .padding(.vertical, 5)
                .background(.white.opacity(0.06), in: Capsule())
        }
    }

    private var shortcutStrip: some View {
        HStack(spacing: 8) {
            keyChip("1", "Charlie", QuipslyStudioTheme.creekMist)
            keyChip("2", "Homer", QuipslyStudioTheme.moss)
            keyChip("3", "Source", QuipslyStudioTheme.marigold)
            keyChip("M", "Together", QuipslyStudioTheme.honey)
            keyChip("L", "Loop", QuipslyStudioTheme.lichen)
            keyChip("Space", "Play", QuipslyStudioTheme.sage)
            Spacer()
        }
    }

    private var lensRuler: some View {
        ProAudioListeningLensRuler(
            visibleStartSeconds: lensStart,
            visibleEndSeconds: lensEnd,
            sequenceTime: sequenceTime,
            onSelectTime: onSelectTime
        )
        .frame(height: 30)
    }

    private var stemCards: some View {
        HStack(spacing: 12) {
            ForEach(tracks.prefix(3)) { track in
                ProAudioListeningLensCard(
                    track: track,
                    visibleStartSeconds: lensStart,
                    visibleEndSeconds: lensEnd,
                    sequenceTime: sequenceTime,
                    rangeStartSeconds: rangeStartSeconds,
                    rangeEndSeconds: rangeEndSeconds,
                    isSelected: track.roleId == selectedTrackId,
                    waveformGain: waveformGain,
                    onSelectTrack: {
                        onSelectTrack(track)
                    },
                    onSelectTime: onSelectTime,
                    onPlayStem: {
                        onPlayTrackRange(track, lensStart, lensEnd, false)
                    },
                    onLoopStem: {
                        onPlayTrackRange(track, lensStart, lensEnd, true)
                    }
                )
            }
        }
        .frame(minHeight: 210)
    }

    private var braid: some View {
        ProAudioListeningLensBraid(
            tracks: tracks,
            visibleStartSeconds: lensStart,
            visibleEndSeconds: lensEnd,
            sequenceTime: sequenceTime,
            onSelectTime: onSelectTime
        )
        .frame(height: 42)
    }

    private var healthRail: some View {
        ProAudioListeningLensHealthRail(
            tracks: tracks,
            visibleStartSeconds: lensStart,
            visibleEndSeconds: lensEnd,
            sequenceTime: sequenceTime
        )
        .frame(height: 88)
    }

    private var lensTransport: some View {
        HStack(spacing: 9) {
                Button {
                    onPlayMixRange(lensStart, lensEnd, false)
                } label: {
                    Label("Together", systemImage: "person.2.wave.2.fill")
                }
                .help("Play Charlie, Homer, and source together from the separate stems")

                Button {
                    onPlayMixRange(lensStart, lensEnd, true)
                } label: {
                    Label("Loop together", systemImage: "repeat")
                }
                .help("Loop Charlie, Homer, and source together from the separate stems")

            Button {
                onPause()
            } label: {
                Label("Pause", systemImage: "pause.fill")
            }
            .help("Pause Audio Room playback")

            Spacer()

            Text("lens range")
                .font(.caption2)
                .fontWeight(.black)
                .tracking(0.7)
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
        }
        .buttonStyle(ProAudioRoomButtonStyle(tint: QuipslyStudioTheme.creekMist))
        .controlSize(.small)
    }

    private var lensBackground: some View {
        RoundedRectangle(cornerRadius: 26, style: .continuous)
            .fill(.black.opacity(0.20))
            .overlay(
                RoundedRectangle(cornerRadius: 26, style: .continuous)
                    .stroke(QuipslyStudioTheme.creekMist.opacity(0.22), lineWidth: 1)
            )
            .shadow(color: QuipslyStudioTheme.creekMist.opacity(0.10), radius: 18, x: 0, y: 10)
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

    private func playTrack(at index: Int, loop: Bool) -> KeyPress.Result {
        let visibleTracks = Array(tracks.prefix(3))
        guard visibleTracks.indices.contains(index) else { return .ignored }
        let track = visibleTracks[index]
        onSelectTrack(track)
        onPlayTrackRange(track, lensStart, lensEnd, loop)
        return .handled
    }

    private func playMix(loop: Bool) -> KeyPress.Result {
        onPlayMixRange(lensStart, lensEnd, loop)
        return .handled
    }

    private func pauseFromKey() -> KeyPress.Result {
        onPause()
        return .handled
    }

    private func keyChip(_ key: String, _ label: String, _ tint: Color) -> some View {
        HStack(spacing: 5) {
            Text(key)
                .font(.system(size: 9, weight: .black, design: .monospaced))
                .foregroundStyle(.black.opacity(0.82))
                .padding(.horizontal, key.count > 1 ? 6 : 5)
                .padding(.vertical, 3)
                .background(tint.opacity(0.92), in: Capsule())

            Text(label)
                .font(.system(size: 9, weight: .black))
                .tracking(0.5)
                .textCase(.uppercase)
                .foregroundStyle(tint.opacity(0.86))
        }
        .padding(.horizontal, 6)
        .padding(.vertical, 4)
        .background(tint.opacity(0.10), in: Capsule())
    }
}

private struct ProAudioListeningLensCard: View {
    let track: SourceAwareAudioTrackSnapshot
    let visibleStartSeconds: Double
    let visibleEndSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let isSelected: Bool
    let waveformGain: CGFloat
    var onSelectTrack: () -> Void
    var onSelectTime: (Double) -> Void
    var onPlayStem: () -> Void
    var onLoopStem: () -> Void

    private var visibleDuration: Double {
        max(visibleEndSeconds - visibleStartSeconds, 0.25)
    }

    private var currentWindow: SourceAwareAudioWindowSnapshot? {
        track.windows.first { window in
            sequenceTime >= window.startSeconds && sequenceTime <= window.endSeconds
        }
    }

    private var currentDbText: String {
        guard let currentWindow else { return "-inf" }
        return "\(String(format: "%.1f", currentWindow.rmsDbfs)) dB"
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                RoundedRectangle(cornerRadius: 22, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                track.tint.opacity(isSelected ? 0.34 : 0.20),
                                .black.opacity(0.30),
                                .black.opacity(0.44)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .stroke(isSelected ? track.tint.opacity(0.88) : track.tint.opacity(0.28), lineWidth: isSelected ? 2 : 1)
                    )

                Canvas { context, size in
                    drawLevelBands(in: &context, size: size)
                    drawSelectedRange(in: &context, size: size)
                    drawWaveform(in: &context, size: size)
                    drawPlayhead(in: &context, size: size)
                }
                .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))

                VStack(alignment: .leading, spacing: 8) {
                    HStack(alignment: .firstTextBaseline) {
                        Label(track.label.replacingOccurrences(of: " Audio", with: ""), systemImage: track.icon)
                            .font(.headline)
                            .fontWeight(.black)
                            .lineLimit(1)
                            .foregroundStyle(.white.opacity(0.92))

                        Spacer()

                        Text(currentDbText)
                            .font(.caption.monospacedDigit())
                            .fontWeight(.black)
                            .foregroundStyle(track.tint)
                    }

                    HStack(spacing: 7) {
                        Text(track.roleId == "clip-source" ? "source" : "voice")
                            .font(.caption2)
                            .fontWeight(.black)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 4)
                            .background(track.tint.opacity(0.18), in: Capsule())
                            .foregroundStyle(track.tint)

                        Text("\(Int(track.contributionRetentionPercent.rounded()))%")
                            .font(.caption2.monospacedDigit())
                            .fontWeight(.bold)
                            .foregroundStyle(.white.opacity(0.72))

                        Spacer()
                    }

                    Spacer()

                    HStack {
                        Text(formatDuration(visibleStartSeconds))
                        Spacer()
                        Text(formatDuration(sequenceTime))
                            .foregroundStyle(track.tint)
                        Spacer()
                        Text(formatDuration(visibleEndSeconds))
                    }
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.bold)
                    .foregroundStyle(.white.opacity(0.48))

                    HStack(spacing: 8) {
                        Button {
                            onSelectTrack()
                            onPlayStem()
                        } label: {
                            Image(systemName: "play.fill")
                                .font(.caption)
                        }
                        .buttonStyle(ProAudioLensIconButtonStyle(tint: track.tint))
                        .help("Play this stem through the visible lens range")

                        Button {
                            onSelectTrack()
                            onLoopStem()
                        } label: {
                            Image(systemName: "repeat")
                                .font(.caption)
                        }
                        .buttonStyle(ProAudioLensIconButtonStyle(tint: track.tint))
                        .help("Loop this stem through the visible lens range")

                        Spacer()
                    }
                }
                .padding(14)
            }
            .contentShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        onSelectTrack()
                        let ratio = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                        onSelectTime(visibleStartSeconds + Double(ratio) * visibleDuration)
                    }
            )
        }
        .frame(height: 220)
    }

    private func drawLevelBands(in context: inout GraphicsContext, size: CGSize) {
        let hotY = size.height * 0.28
        let dialogueY = size.height * 0.50
        let quietY = size.height * 0.72

        var hot = Path()
        hot.move(to: CGPoint(x: 0, y: hotY))
        hot.addLine(to: CGPoint(x: size.width, y: hotY))
        context.stroke(hot, with: .color(.red.opacity(0.22)), lineWidth: 1)

        var dialogue = Path()
        dialogue.move(to: CGPoint(x: 0, y: dialogueY))
        dialogue.addLine(to: CGPoint(x: size.width, y: dialogueY))
        context.stroke(dialogue, with: .color(QuipslyStudioTheme.honey.opacity(0.20)), lineWidth: 1)

        var quiet = Path()
        quiet.move(to: CGPoint(x: 0, y: quietY))
        quiet.addLine(to: CGPoint(x: size.width, y: quietY))
        context.stroke(quiet, with: .color(QuipslyStudioTheme.sage.opacity(0.18)), lineWidth: 1)
    }

    private func drawSelectedRange(in context: inout GraphicsContext, size: CGSize) {
        guard let rangeStartSeconds, let rangeEndSeconds else { return }
        let start = max(min(rangeStartSeconds, rangeEndSeconds), visibleStartSeconds)
        let end = min(max(rangeStartSeconds, rangeEndSeconds), visibleEndSeconds)
        guard end > start else { return }

        let rect = CGRect(
            x: x(for: start, width: size.width),
            y: 0,
            width: max(x(for: end, width: size.width) - x(for: start, width: size.width), 2),
            height: size.height
        )
        context.fill(Path(roundedRect: rect, cornerRadius: 8), with: .color(QuipslyStudioTheme.honey.opacity(0.10)))
    }

    private func drawWaveform(in context: inout GraphicsContext, size: CGSize) {
        let centerY = size.height * 0.56
        let windows = track.windows.filter { window in
            window.endSeconds >= visibleStartSeconds && window.startSeconds <= visibleEndSeconds
        }
        guard !windows.isEmpty else {
            var baseline = Path()
            baseline.move(to: CGPoint(x: 0, y: centerY))
            baseline.addLine(to: CGPoint(x: size.width, y: centerY))
            context.stroke(baseline, with: .color(track.tint.opacity(0.22)), lineWidth: 1)
            return
        }

        for window in windows {
            let startX = x(for: window.startSeconds, width: size.width)
            let endX = x(for: window.endSeconds, width: size.width)
            let width = max(endX - startX, 1.5)
            let rms = min(max(normalized(window.rmsDbfs) * waveformGain, 0.02), 1.0)
            let peak = min(max(normalized(window.samplePeakDbfs) * waveformGain, 0.04), 1.0)
            let rmsHeight = rms * size.height * 0.42
            let peakHeight = peak * size.height * 0.48

            let fillRect = CGRect(
                x: startX,
                y: centerY - rmsHeight / 2,
                width: width,
                height: max(rmsHeight, 1.2)
            )
            context.fill(Path(roundedRect: fillRect, cornerRadius: min(width / 2, 5)), with: .color(track.tint.opacity(0.52)))

            if peak > 0.62 {
                var peakPath = Path()
                let peakX = startX + width / 2
                peakPath.move(to: CGPoint(x: peakX, y: centerY - peakHeight / 2))
                peakPath.addLine(to: CGPoint(x: peakX, y: centerY + peakHeight / 2))
                context.stroke(peakPath, with: .color(QuipslyStudioTheme.honey.opacity(0.70)), lineWidth: 1.5)
            }
        }
    }

    private func drawPlayhead(in context: inout GraphicsContext, size: CGSize) {
        guard sequenceTime >= visibleStartSeconds && sequenceTime <= visibleEndSeconds else { return }
        let px = x(for: sequenceTime, width: size.width)
        var line = Path()
        line.move(to: CGPoint(x: px, y: 0))
        line.addLine(to: CGPoint(x: px, y: size.height))
        context.stroke(line, with: .color(QuipslyStudioTheme.marigold.opacity(0.95)), lineWidth: 3)

        let handle = CGRect(x: px - 5, y: 8, width: 10, height: 10)
        context.fill(Path(ellipseIn: handle), with: .color(QuipslyStudioTheme.marigold))
    }

    private func x(for seconds: Double, width: CGFloat) -> CGFloat {
        let ratio = (seconds - visibleStartSeconds) / max(visibleDuration, 0.001)
        return min(max(CGFloat(ratio) * width, 0), width)
    }

    private func normalized(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0 }
        let clamped = min(-10.0, max(-82.0, dbfs))
        return CGFloat((clamped + 82.0) / 72.0)
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}

private struct ProAudioLensIconButtonStyle: ButtonStyle {
    let tint: Color

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.white.opacity(0.92))
            .frame(width: 28, height: 24)
            .background(
                Capsule()
                    .fill(tint.opacity(configuration.isPressed ? 0.36 : 0.22))
                    .overlay(
                        Capsule()
                            .stroke(tint.opacity(configuration.isPressed ? 0.90 : 0.46), lineWidth: 1)
                    )
            )
            .shadow(color: tint.opacity(configuration.isPressed ? 0.08 : 0.18), radius: configuration.isPressed ? 2 : 8, x: 0, y: 3)
            .scaleEffect(configuration.isPressed ? 0.96 : 1)
    }
}

private struct ProAudioListeningLensBraid: View {
    let tracks: [SourceAwareAudioTrackSnapshot]
    let visibleStartSeconds: Double
    let visibleEndSeconds: Double
    let sequenceTime: Double
    var onSelectTime: (Double) -> Void

    private var visibleDuration: Double {
        max(visibleEndSeconds - visibleStartSeconds, 0.25)
    }

    private var charlieTrack: SourceAwareAudioTrackSnapshot? {
        tracks.first { $0.roleId == "charlie" }
    }

    private var homerTrack: SourceAwareAudioTrackSnapshot? {
        tracks.first { $0.roleId == "homer" }
    }

    private var sourceTrack: SourceAwareAudioTrackSnapshot? {
        tracks.first { $0.roleId != "charlie" && $0.roleId != "homer" && $0.roleId != "master" }
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .fill(.black.opacity(0.24))
                    .overlay(
                        RoundedRectangle(cornerRadius: 18, style: .continuous)
                            .stroke(QuipslyStudioTheme.creekMist.opacity(0.20), lineWidth: 1)
                    )

                Canvas { context, size in
                    drawBraid(in: &context, size: size)
                    drawPlayhead(in: &context, size: size)
                }
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                HStack(spacing: 8) {
                    Image(systemName: "point.3.connected.trianglepath.dotted")
                        .font(.caption)
                        .foregroundStyle(QuipslyStudioTheme.creekMist)
                    Text("conversation braid")
                        .font(.caption2)
                        .fontWeight(.black)
                        .tracking(0.8)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.72))
                    Spacer()
                }
                .padding(.horizontal, 12)
                .allowsHitTesting(false)
            }
            .contentShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        let ratio = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                        onSelectTime(visibleStartSeconds + Double(ratio) * visibleDuration)
                    }
            )
        }
        .accessibilityLabel("Focused conversation braid")
    }

    private func drawBraid(in context: inout GraphicsContext, size: CGSize) {
        let sliceCount = max(Int(size.width / 7), 12)
        let sliceWidth = size.width / CGFloat(sliceCount)
        for index in 0..<sliceCount {
            let midSeconds = visibleStartSeconds + (Double(index) + 0.5) / Double(sliceCount) * visibleDuration
            let state = stateAt(midSeconds)
            let rect = CGRect(
                x: CGFloat(index) * sliceWidth,
                y: state.yOffset * size.height,
                width: max(sliceWidth + 1, 2),
                height: state.height * size.height
            )
            context.fill(
                Path(roundedRect: rect, cornerRadius: min(rect.height / 2, 9)),
                with: .color(state.color.opacity(state.opacity))
            )
        }
    }

    private func drawPlayhead(in context: inout GraphicsContext, size: CGSize) {
        guard sequenceTime >= visibleStartSeconds && sequenceTime <= visibleEndSeconds else { return }
        let x = CGFloat((sequenceTime - visibleStartSeconds) / visibleDuration) * size.width
        var path = Path()
        path.move(to: CGPoint(x: x, y: 0))
        path.addLine(to: CGPoint(x: x, y: size.height))
        context.stroke(path, with: .color(QuipslyStudioTheme.marigold.opacity(0.95)), lineWidth: 2)
    }

    private func stateAt(_ seconds: Double) -> BraidState {
        let charlie = normalizedEnergy(charlieTrack, at: seconds)
        let homer = normalizedEnergy(homerTrack, at: seconds)
        let source = normalizedEnergy(sourceTrack, at: seconds)
        let total = charlie + homer + source
        if total < 0.12 {
            return BraidState(color: QuipslyStudioTheme.sage, opacity: 0.24, yOffset: 0.44, height: 0.12)
        }
        if source > max(charlie, homer) * 0.85 && source > 0.18 {
            return BraidState(color: QuipslyStudioTheme.marigold, opacity: 0.78, yOffset: 0.12, height: 0.76)
        }
        if charlie > 0.16 && homer > 0.16 && abs(charlie - homer) < max(charlie, homer) * 0.46 {
            return BraidState(color: QuipslyStudioTheme.honey, opacity: 0.82, yOffset: 0.18, height: 0.64)
        }
        if charlie >= homer {
            return BraidState(color: QuipslyStudioTheme.creekMist, opacity: 0.78, yOffset: 0.10, height: 0.42)
        }
        return BraidState(color: QuipslyStudioTheme.moss, opacity: 0.78, yOffset: 0.48, height: 0.42)
    }

    private func normalizedEnergy(_ track: SourceAwareAudioTrackSnapshot?, at seconds: Double) -> Double {
        guard let window = track?.windows.first(where: { seconds >= $0.startSeconds && seconds <= $0.endSeconds }),
              window.rmsDbfs.isFinite else {
            return 0
        }
        let clamped = min(-12.0, max(-80.0, window.rmsDbfs))
        return (clamped + 80.0) / 68.0
    }

    private struct BraidState {
        let color: Color
        let opacity: Double
        let yOffset: CGFloat
        let height: CGFloat
    }
}

private struct ProAudioListeningLensRuler: View {
    let visibleStartSeconds: Double
    let visibleEndSeconds: Double
    let sequenceTime: Double
    var onSelectTime: (Double) -> Void

    private var visibleDuration: Double {
        max(visibleEndSeconds - visibleStartSeconds, 0.25)
    }

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.black.opacity(0.22))
                    .overlay(
                        Capsule()
                            .stroke(QuipslyStudioTheme.creekMist.opacity(0.16), lineWidth: 1)
                    )

                Canvas { context, size in
                    drawTicks(in: &context, size: size)
                    drawPlayhead(in: &context, size: size)
                }
                .clipShape(Capsule())

                HStack {
                    Text(formatDuration(visibleStartSeconds))
                    Spacer()
                    Text(formatDuration(visibleEndSeconds))
                }
                .font(.system(size: 9, weight: .black, design: .monospaced))
                .foregroundStyle(.white.opacity(0.42))
                .padding(.horizontal, 10)
                .allowsHitTesting(false)
            }
            .contentShape(Capsule())
            .gesture(
                DragGesture(minimumDistance: 0)
                    .onEnded { value in
                        let ratio = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                        onSelectTime(visibleStartSeconds + Double(ratio) * visibleDuration)
                    }
            )
        }
        .accessibilityLabel("Listening lens scrub ruler")
    }

    private func drawTicks(in context: inout GraphicsContext, size: CGSize) {
        let majorEverySeconds = visibleDuration <= 35 ? 5.0 : 10.0
        let minorEverySeconds = majorEverySeconds / 5
        let firstTick = floor(visibleStartSeconds / minorEverySeconds) * minorEverySeconds
        var tick = firstTick
        while tick <= visibleEndSeconds + minorEverySeconds {
            if tick >= visibleStartSeconds {
                let x = CGFloat((tick - visibleStartSeconds) / visibleDuration) * size.width
                let isMajor = abs(tick / majorEverySeconds - round(tick / majorEverySeconds)) < 0.001
                var path = Path()
                path.move(to: CGPoint(x: x, y: isMajor ? 5 : 10))
                path.addLine(to: CGPoint(x: x, y: size.height - (isMajor ? 5 : 10)))
                context.stroke(
                    path,
                    with: .color((isMajor ? QuipslyStudioTheme.honey : QuipslyStudioTheme.creekMist).opacity(isMajor ? 0.42 : 0.18)),
                    lineWidth: isMajor ? 1.3 : 0.8
                )
            }
            tick += minorEverySeconds
        }
    }

    private func drawPlayhead(in context: inout GraphicsContext, size: CGSize) {
        guard sequenceTime >= visibleStartSeconds && sequenceTime <= visibleEndSeconds else { return }
        let x = CGFloat((sequenceTime - visibleStartSeconds) / visibleDuration) * size.width
        var path = Path()
        path.move(to: CGPoint(x: x, y: 2))
        path.addLine(to: CGPoint(x: x, y: size.height - 2))
        context.stroke(path, with: .color(QuipslyStudioTheme.marigold.opacity(0.98)), lineWidth: 2)
        context.fill(Path(ellipseIn: CGRect(x: x - 4, y: 3, width: 8, height: 8)), with: .color(QuipslyStudioTheme.marigold))
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}

private struct ProAudioHomerStageRack: View, Equatable {
    let homerTrack: SourceAwareAudioTrackSnapshot?
    let duration: Double

    private let stages: [HomerAudioStage] = [
        HomerAudioStage(
            number: "01",
            title: "Raw synced",
            subtitle: "alignment only",
            systemImage: "waveform",
            tint: QuipslyStudioTheme.creekMist,
            description: "Homer DJI files padded onto the episode clock. This is the trust layer before any cleanup.",
            chips: ["offset aware", "no denoise", "no gate"]
        ),
        HomerAudioStage(
            number: "02",
            title: "Clean",
            subtitle: "remove mud gently",
            systemImage: "sparkles",
            tint: QuipslyStudioTheme.sage,
            description: "High-pass, low-pass, and light spectral denoise. Useful, but easy to overcook outside audio.",
            chips: ["HPF 80", "LPF 16k", "afftdn -20"]
        ),
        HomerAudioStage(
            number: "03",
            title: "Contribution",
            subtitle: "voice activity gate",
            systemImage: "ear.trianglebadge.exclamationmark",
            tint: QuipslyStudioTheme.clay,
            description: "This is the danger zone. It removes park noise and echo, but a bad threshold can make Homer vanish.",
            chips: ["gate 0.0025", "ratio 1.65", "release 1050ms"]
        ),
        HomerAudioStage(
            number: "04",
            title: "Restore",
            subtitle: "AI assist candidate",
            systemImage: "wand.and.stars",
            tint: QuipslyStudioTheme.marigold,
            description: "Optional restored duplicate stem: dxRevive, DeepFilterNet, or another local model. Originals stay untouched.",
            chips: ["duplicate stem", "A/B required", "metadata recipe"]
        ),
        HomerAudioStage(
            number: "05",
            title: "Presence",
            subtitle: "richness and match",
            systemImage: "slider.horizontal.3",
            tint: QuipslyStudioTheme.honey,
            description: "Tone, compression, and gain matching so Homer feels present beside Charlie without sounding artificial.",
            chips: ["gain 1.55", "compress", "match Charlie"]
        ),
        HomerAudioStage(
            number: "06",
            title: "Delivery",
            subtitle: "episode master",
            systemImage: "dot.radiowaves.left.and.right",
            tint: QuipslyStudioTheme.moss,
            description: "Final loudness and limiter pass for podcast/video export. This is a delivery artifact, not the edit truth.",
            chips: ["-16 LUFS", "TP -1.8", "separate stems first"]
        )
    ]

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.homerTrack?.id == rhs.homerTrack?.id
            && lhs.homerTrack?.windowCount == rhs.homerTrack?.windowCount
            && lhs.duration == rhs.duration
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header
            HStack(spacing: 10) {
                ForEach(stages) { stage in
                    stageCard(stage)
                }
            }
        }
        .padding(14)
        .background(rackBackground)
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.22), lineWidth: 1)
        )
        .accessibilityIdentifier("quipsly.audioRoom.homerStageRack")
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Label("Homer audio rack", systemImage: "dial.high")
                .font(.caption)
                .fontWeight(.black)
                .tracking(1.4)
                .foregroundStyle(QuipslyStudioTheme.honey)
                .textCase(.uppercase)

            Text("stage the sound before mastering")
                .font(.caption2)
                .fontWeight(.heavy)
                .foregroundStyle(.secondary)

            Spacer()

            if let homerTrack {
                Text("\(homerTrack.windowCount) windows")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Capsule().fill(QuipslyStudioTheme.moss.opacity(0.18)))
                    .foregroundStyle(QuipslyStudioTheme.moss)
            }
        }
    }

    private func stageCard(_ stage: HomerAudioStage) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Text(stage.number)
                    .font(.caption.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(stage.tint)
                    .frame(width: 26, height: 26)
                    .background(Circle().fill(stage.tint.opacity(0.18)))

                Image(systemName: stage.systemImage)
                    .font(.caption)
                    .foregroundStyle(stage.tint)

                Spacer()
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(stage.title)
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.moonMilk)
                Text(stage.subtitle)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(stage.tint.opacity(0.88))
            }

            Text(stage.description)
                .font(.caption2)
                .fontWeight(.semibold)
                .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.68))
                .lineLimit(4)
                .fixedSize(horizontal: false, vertical: true)

            Spacer(minLength: 0)

            VStack(alignment: .leading, spacing: 4) {
                ForEach(stage.chips, id: \.self) { chip in
                    Text(chip)
                        .font(.caption2.monospacedDigit())
                        .fontWeight(.heavy)
                        .lineLimit(1)
                        .padding(.horizontal, 7)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(stage.tint.opacity(0.14)))
                        .foregroundStyle(stage.tint)
                }
            }
        }
        .padding(10)
        .frame(maxWidth: .infinity, minHeight: 190, alignment: .topLeading)
        .background(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .fill(stage.tint.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(stage.tint.opacity(stage.title == "Contribution" ? 0.46 : 0.20), lineWidth: stage.title == "Contribution" ? 1.4 : 1)
        )
    }

    private var rackBackground: some ShapeStyle {
        LinearGradient(
            colors: [
                QuipslyStudioTheme.night.opacity(0.62),
                QuipslyStudioTheme.forest.opacity(0.26),
                QuipslyStudioTheme.honey.opacity(0.10)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

}

private struct HomerAudioStage: Identifiable {
    let number: String
    let title: String
    let subtitle: String
    let systemImage: String
    let tint: Color
    let description: String
    let chips: [String]

    var id: String { number }
}

private struct ProAudioDialogueLongCompare: View {
    let charlieTrack: SourceAwareAudioTrackSnapshot?
    let homerTrack: SourceAwareAudioTrackSnapshot?
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    var onSelectTime: (Double) -> Void

    private var visibleEndSeconds: Double {
        min(duration, visibleStartSeconds + visibleDurationSeconds)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            header

            HStack(alignment: .top, spacing: 12) {
                compareColumn(
                    title: "Charlie",
                    subtitle: "local mic stem",
                    track: charlieTrack,
                    tint: QuipslyStudioTheme.creekMist
                )

                compareColumn(
                    title: "Homer",
                    subtitle: "remote mic stem",
                    track: homerTrack,
                    tint: QuipslyStudioTheme.moss
                )
            }
        }
        .padding(14)
        .background(compareBackground)
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(QuipslyStudioTheme.creekMist.opacity(0.22), lineWidth: 1)
        )
    }

    private var header: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Label("Voice compare", systemImage: "waveform.path.ecg.rectangle")
                .font(.caption)
                .fontWeight(.black)
                .tracking(1.4)
                .foregroundStyle(QuipslyStudioTheme.honey)
                .textCase(.uppercase)

            Text("same clock")
                .font(.caption2)
                .fontWeight(.heavy)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Capsule().fill(QuipslyStudioTheme.moss.opacity(0.18)))
                .foregroundStyle(QuipslyStudioTheme.moss)

            Text("drag either lane")
                .font(.caption2)
                .fontWeight(.heavy)
                .padding(.horizontal, 8)
                .padding(.vertical, 3)
                .background(Capsule().fill(QuipslyStudioTheme.creekMist.opacity(0.14)))
                .foregroundStyle(QuipslyStudioTheme.creekMist)

            Spacer()

            Text("\(formatDuration(visibleStartSeconds)) -> \(formatDuration(visibleEndSeconds))")
                .font(.caption.monospacedDigit())
                .fontWeight(.bold)
                .foregroundStyle(QuipslyStudioTheme.creekMist.opacity(0.82))
        }
    }

    @ViewBuilder
    private func compareColumn(
        title: String,
        subtitle: String,
        track: SourceAwareAudioTrackSnapshot?,
        tint: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline) {
                Text(title)
                    .font(.subheadline)
                    .fontWeight(.black)
                    .foregroundStyle(tint)
                Text(subtitle)
                    .font(.caption2)
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
                Spacer()
            }

            if let track {
                ProAudioOverviewStrip(
                    tracks: [track],
                    duration: duration,
                    visibleStartSeconds: visibleStartSeconds,
                    visibleDurationSeconds: visibleDurationSeconds,
                    sequenceTime: sequenceTime,
                    rangeStartSeconds: rangeStartSeconds,
                    rangeEndSeconds: rangeEndSeconds,
                    reviewWindows: [],
                    onSelectTime: onSelectTime
                )
                .frame(height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
            } else {
                missingLane(title: title, tint: tint)
            }
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(tint.opacity(0.08))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(tint.opacity(0.22), lineWidth: 1)
        )
    }

    private func missingLane(title: String, tint: Color) -> some View {
        RoundedRectangle(cornerRadius: 16, style: .continuous)
            .fill(QuipslyStudioTheme.night.opacity(0.30))
            .overlay(
                VStack(spacing: 6) {
                    Image(systemName: "waveform.badge.exclamationmark")
                        .font(.title3)
                    Text("\(title) stem missing")
                        .font(.caption)
                        .fontWeight(.heavy)
                }
                .foregroundStyle(tint.opacity(0.72))
            )
            .frame(height: 96)
    }

    private var compareBackground: some ShapeStyle {
        LinearGradient(
            colors: [
                QuipslyStudioTheme.night.opacity(0.58),
                QuipslyStudioTheme.creek.opacity(0.23),
                QuipslyStudioTheme.moss.opacity(0.10)
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}

private struct ProAudioListeningLensHealthRail: View {
    let tracks: [SourceAwareAudioTrackSnapshot]
    let visibleStartSeconds: Double
    let visibleEndSeconds: Double
    let sequenceTime: Double

    private var visibleDuration: Double {
        max(visibleEndSeconds - visibleStartSeconds, 0.25)
    }

    private var charlieTrack: SourceAwareAudioTrackSnapshot? {
        tracks.first { $0.roleId == "charlie" }
    }

    private var homerTrack: SourceAwareAudioTrackSnapshot? {
        tracks.first { $0.roleId == "homer" }
    }

    private var sourceTrack: SourceAwareAudioTrackSnapshot? {
        tracks.first { $0.roleId != "charlie" && $0.roleId != "homer" && $0.roleId != "master" }
    }

    private var metrics: HealthMetrics {
        let samples = focusedSamples
        guard !samples.isEmpty else { return HealthMetrics.empty }

        let count = Double(samples.count)
        let charlieMean = samples.map(\.charlie).reduce(0, +) / count
        let homerMean = samples.map(\.homer).reduce(0, +) / count
        let sourceMean = samples.map(\.source).reduce(0, +) / count
        let voiceTotal = charlieMean + homerMean
        let balance = voiceTotal > 0.001 ? charlieMean / voiceTotal : 0.5
        let overlap = samples.filter { $0.charlie > 0.15 && $0.homer > 0.15 }.count
        let quiet = samples.filter { $0.charlie + $0.homer + $0.source < 0.12 }.count
        let source = samples.filter { $0.source > max($0.charlie, $0.homer) * 0.85 && $0.source > 0.18 }.count

        return HealthMetrics(
            charlieMean: charlieMean,
            homerMean: homerMean,
            sourceMean: sourceMean,
            balance: balance,
            overlapRatio: Double(overlap) / count,
            quietRatio: Double(quiet) / count,
            sourceRatio: Double(source) / count
        )
    }

    private var focusedSamples: [HealthSample] {
        let sampleCount = 96
        return (0..<sampleCount).map { index in
            let seconds = visibleStartSeconds + (Double(index) + 0.5) / Double(sampleCount) * visibleDuration
            return HealthSample(
                seconds: seconds,
                charlie: normalizedEnergy(charlieTrack, at: seconds),
                homer: normalizedEnergy(homerTrack, at: seconds),
                source: normalizedEnergy(sourceTrack, at: seconds)
            )
        }
    }

    var body: some View {
        HStack(spacing: 12) {
            playheadMeter
                .frame(width: 210)

            balanceRibbon
                .frame(minWidth: 260)

            HStack(spacing: 8) {
                metricPill("overlap", metrics.overlapRatio, QuipslyStudioTheme.honey)
                metricPill("source", metrics.sourceRatio, QuipslyStudioTheme.marigold)
                metricPill("quiet", metrics.quietRatio, QuipslyStudioTheme.sage)
            }
            .frame(width: 252)
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(
                    LinearGradient(
                        colors: [
                            QuipslyStudioTheme.night.opacity(0.48),
                            QuipslyStudioTheme.creek.opacity(0.18)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 20, style: .continuous)
                        .stroke(QuipslyStudioTheme.creekMist.opacity(0.18), lineWidth: 1)
                )
        )
        .accessibilityLabel("Listening lens health rail")
    }

    private var playheadMeter: some View {
        HStack(alignment: .bottom, spacing: 8) {
            miniStemMeter("C", value: normalizedEnergy(charlieTrack, at: sequenceTime), tint: QuipslyStudioTheme.creekMist)
            miniStemMeter("H", value: normalizedEnergy(homerTrack, at: sequenceTime), tint: QuipslyStudioTheme.moss)
            miniStemMeter("S", value: normalizedEnergy(sourceTrack, at: sequenceTime), tint: QuipslyStudioTheme.marigold)

            VStack(alignment: .leading, spacing: 3) {
                Text("now")
                    .font(.system(size: 9, weight: .black))
                    .tracking(1.0)
                    .textCase(.uppercase)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)

                Text(formatDuration(sequenceTime))
                    .font(.caption.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(.white.opacity(0.82))
            }
            .padding(.leading, 2)
        }
    }

    private var balanceRibbon: some View {
        GeometryReader { proxy in
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(.black.opacity(0.22))

                Canvas { context, size in
                    drawDominanceRibbon(in: &context, size: size)
                    drawBalanceMarker(in: &context, size: size)
                }
                .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                HStack {
                    Text("Charlie")
                        .foregroundStyle(QuipslyStudioTheme.creekMist)
                    Spacer()
                    Text("Homer")
                        .foregroundStyle(QuipslyStudioTheme.moss)
                }
                .font(.system(size: 9, weight: .black))
                .tracking(0.8)
                .textCase(.uppercase)
                .padding(.horizontal, 10)
                .padding(.top, 7)
                .frame(width: proxy.size.width, alignment: .top)
                .allowsHitTesting(false)
            }
        }
    }

    private func metricPill(_ label: String, _ value: Double, _ tint: Color) -> some View {
        VStack(spacing: 6) {
            ZStack(alignment: .bottom) {
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(.white.opacity(0.07))
                RoundedRectangle(cornerRadius: 9, style: .continuous)
                    .fill(tint.opacity(0.70))
                    .frame(height: max(CGFloat(value) * 42, 2))
            }
            .frame(width: 46, height: 42)

            Text(label)
                .font(.system(size: 9, weight: .black))
                .tracking(0.7)
                .textCase(.uppercase)
                .foregroundStyle(tint)
                .lineLimit(1)
                .minimumScaleFactor(0.74)
        }
        .frame(maxWidth: .infinity)
    }

    private func miniStemMeter(_ title: String, value: Double, tint: Color) -> some View {
        VStack(spacing: 5) {
            ZStack(alignment: .bottom) {
                Capsule()
                    .fill(.white.opacity(0.06))
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [tint.opacity(0.58), tint],
                            startPoint: .bottom,
                            endPoint: .top
                        )
                    )
                    .frame(height: max(CGFloat(value) * 48, 3))
            }
            .frame(width: 18, height: 52)

            Text(title)
                .font(.system(size: 10, weight: .black))
                .foregroundStyle(tint)
        }
    }

    private func drawDominanceRibbon(in context: inout GraphicsContext, size: CGSize) {
        let samples = focusedSamples
        guard !samples.isEmpty else { return }
        let sliceWidth = size.width / CGFloat(samples.count)
        for (index, sample) in samples.enumerated() {
            let total = sample.charlie + sample.homer + sample.source
            let rect = CGRect(x: CGFloat(index) * sliceWidth, y: 0, width: max(sliceWidth + 1, 2), height: size.height)
            let color: Color
            let opacity: Double
            if total < 0.12 {
                color = QuipslyStudioTheme.sage
                opacity = 0.16
            } else if sample.source > max(sample.charlie, sample.homer) * 0.85 && sample.source > 0.18 {
                color = QuipslyStudioTheme.marigold
                opacity = 0.58
            } else if sample.charlie > 0.15 && sample.homer > 0.15 {
                color = QuipslyStudioTheme.honey
                opacity = 0.58
            } else if sample.charlie >= sample.homer {
                color = QuipslyStudioTheme.creekMist
                opacity = 0.50
            } else {
                color = QuipslyStudioTheme.moss
                opacity = 0.50
            }
            context.fill(Path(rect), with: .color(color.opacity(opacity)))
        }
    }

    private func drawBalanceMarker(in context: inout GraphicsContext, size: CGSize) {
        let centerX = size.width / 2
        var center = Path()
        center.move(to: CGPoint(x: centerX, y: 10))
        center.addLine(to: CGPoint(x: centerX, y: size.height - 10))
        context.stroke(center, with: .color(.white.opacity(0.18)), style: StrokeStyle(lineWidth: 1, dash: [3, 4]))

        let markerX = CGFloat(metrics.balance) * size.width
        let markerRect = CGRect(x: markerX - 4, y: 6, width: 8, height: size.height - 12)
        context.fill(Path(roundedRect: markerRect, cornerRadius: 4), with: .color(QuipslyStudioTheme.moonMilk.opacity(0.92)))
    }

    private func normalizedEnergy(_ track: SourceAwareAudioTrackSnapshot?, at seconds: Double) -> Double {
        guard let window = track?.windows.first(where: { seconds >= $0.startSeconds && seconds <= $0.endSeconds }),
              window.rmsDbfs.isFinite else {
            return 0
        }
        let clamped = min(-12.0, max(-80.0, window.rmsDbfs))
        return (clamped + 80.0) / 68.0
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }

    private struct HealthSample {
        let seconds: Double
        let charlie: Double
        let homer: Double
        let source: Double
    }

    private struct HealthMetrics {
        let charlieMean: Double
        let homerMean: Double
        let sourceMean: Double
        let balance: Double
        let overlapRatio: Double
        let quietRatio: Double
        let sourceRatio: Double

        static let empty = HealthMetrics(
            charlieMean: 0,
            homerMean: 0,
            sourceMean: 0,
            balance: 0.5,
            overlapRatio: 0,
            quietRatio: 0,
            sourceRatio: 0
        )
    }
}

private struct ProAudioTwinStemConsole: View {
    let tracks: [SourceAwareAudioTrackSnapshot]
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let waveformGain: CGFloat
    let selectedTrackId: String
    var onSelectTrack: (SourceAwareAudioTrackSnapshot) -> Void
    var onSelectTime: (Double) -> Void
    var onPlayTrack: (SourceAwareAudioTrackSnapshot) -> Void
    var onPlayMix: () -> Void
    var onPause: () -> Void
    var onNudge: (Double) -> Void
    var onZoom: (Double) -> Void
    var onFit: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                Label("Mixing desk", systemImage: "slider.horizontal.3")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                    .textCase(.uppercase)
                    .tracking(1.8)

                Spacer()

                ProAudioTimePill(title: "CLOCK", value: localFormatDuration(sequenceTime), tint: QuipslyStudioTheme.creekMist)
                ProAudioTimePill(title: "VIEW", value: "\(Int(max(1, visibleDurationSeconds)))s", tint: QuipslyStudioTheme.lichen)
            }

            ProAudioDialogueScope(
                charlieTrack: tracks.first { $0.roleId == "charlie" },
                homerTrack: tracks.first { $0.roleId == "homer" },
                sourceTrack: tracks.first { $0.roleId != "charlie" && $0.roleId != "homer" },
                duration: duration,
                visibleStartSeconds: visibleStartSeconds,
                visibleDurationSeconds: visibleDurationSeconds,
                sequenceTime: sequenceTime,
                rangeStartSeconds: rangeStartSeconds,
                rangeEndSeconds: rangeEndSeconds,
                waveformGain: waveformGain,
                onSelectTime: onSelectTime
            )

            consoleControls

            ProAudioPlayheadBalanceMeter(
                charlieTrack: tracks.first { $0.roleId == "charlie" },
                homerTrack: tracks.first { $0.roleId == "homer" },
                sequenceTime: sequenceTime
            )
            .frame(height: 46)

            if tracks.isEmpty {
                Label("No speaker stems", systemImage: "waveform.badge.exclamationmark")
                    .font(.headline)
                    .foregroundStyle(QuipslyStudioTheme.clay)
                    .frame(maxWidth: .infinity, minHeight: 92)
                    .background(.black.opacity(0.20), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            } else {
                HStack(alignment: .top, spacing: 12) {
                    ForEach(tracks) { track in
                        ProAudioTwinStemStrip(
                            track: track,
                            duration: duration,
                            visibleStartSeconds: visibleStartSeconds,
                            visibleDurationSeconds: visibleDurationSeconds,
                            sequenceTime: sequenceTime,
                            rangeStartSeconds: rangeStartSeconds,
                            rangeEndSeconds: rangeEndSeconds,
                            waveformGain: waveformGain,
                            isSelected: selectedTrackId == track.roleId,
                            onSelectTime: onSelectTime,
                            onSelectTrack: { onSelectTrack(track) },
                            onPlay: { onPlayTrack(track) }
                        )
                    }
                }
            }
        }
        .padding(14)
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.forest.opacity(0.54),
                    QuipslyStudioTheme.moss.opacity(0.18)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 26, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 26, style: .continuous)
                .stroke(QuipslyStudioTheme.lichen.opacity(0.18), lineWidth: 1)
        )
    }

    private var consoleControls: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                Button { onNudge(-5) } label: {
                    Label("5", systemImage: "gobackward.5")
                }
                .help("Back 5 seconds")

                Button { onPlayMix() } label: {
                    Label("Mix", systemImage: "speaker.wave.2.fill")
                }
                .help("Play the current mixed audio")

                Button { onPause() } label: {
                    Label("Pause", systemImage: "pause.fill")
                }
                .help("Pause audio playback")

                Button { onNudge(5) } label: {
                    Label("5", systemImage: "goforward.5")
                }
                .help("Forward 5 seconds")

                Button { onZoom(0.5) } label: {
                    Label("In", systemImage: "plus.magnifyingglass")
                }
                .help("Zoom into the waveform")

                Button { onZoom(2.0) } label: {
                    Label("Out", systemImage: "minus.magnifyingglass")
                }
                .help("Zoom out of the waveform")

                Button { onFit() } label: {
                    Label("Fit", systemImage: "arrow.left.and.right")
                }
                .help("Show the whole episode")
            }
            .fixedSize(horizontal: true, vertical: false)
            .buttonStyle(ProAudioRoomButtonStyle())
            .controlSize(.small)
        }
    }

    private func localFormatDuration(_ seconds: Double) -> String {
        guard seconds.isFinite else { return "unknown" }
        let totalSeconds = max(Int(seconds.rounded()), 0)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let secs = totalSeconds % 60
        if hours > 0 {
            return "\(hours):\(String(format: "%02d", minutes)):\(String(format: "%02d", secs))"
        }
        return "\(minutes):\(String(format: "%02d", secs))"
    }
}

private struct ProAudioDialogueScope: View {
    let charlieTrack: SourceAwareAudioTrackSnapshot?
    let homerTrack: SourceAwareAudioTrackSnapshot?
    let sourceTrack: SourceAwareAudioTrackSnapshot?
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let waveformGain: CGFloat
    var onSelectTime: (Double) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Label("Dialogue scope", systemImage: "waveform.path.ecg")
                    .font(.caption)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.lichen)
                    .textCase(.uppercase)
                    .tracking(1.6)

                Spacer()

                Text(playheadLabel)
                    .font(.caption.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creekMist)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(QuipslyStudioTheme.creek.opacity(0.15), in: Capsule())
            }

            HStack(alignment: .top, spacing: 12) {
                ProAudioDialogueSpeakerScope(
                    title: "Charlie",
                    track: charlieTrack,
                    duration: duration,
                    visibleStartSeconds: visibleStartSeconds,
                    visibleDurationSeconds: visibleDurationSeconds,
                    sequenceTime: sequenceTime,
                    rangeStartSeconds: rangeStartSeconds,
                    rangeEndSeconds: rangeEndSeconds,
                    waveformGain: waveformGain,
                    fallbackTint: QuipslyStudioTheme.creekMist,
                    onSelectTime: onSelectTime
                )

                ProAudioDialogueSpeakerScope(
                    title: "Homer",
                    track: homerTrack,
                    duration: duration,
                    visibleStartSeconds: visibleStartSeconds,
                    visibleDurationSeconds: visibleDurationSeconds,
                    sequenceTime: sequenceTime,
                    rangeStartSeconds: rangeStartSeconds,
                    rangeEndSeconds: rangeEndSeconds,
                    waveformGain: waveformGain,
                    fallbackTint: QuipslyStudioTheme.lichen,
                    onSelectTime: onSelectTime
                )
            }

            if let sourceTrack {
                ProAudioDialogueSpeakerScope(
                    title: "Clip source",
                    track: sourceTrack,
                    duration: duration,
                    visibleStartSeconds: visibleStartSeconds,
                    visibleDurationSeconds: visibleDurationSeconds,
                    sequenceTime: sequenceTime,
                    rangeStartSeconds: rangeStartSeconds,
                    rangeEndSeconds: rangeEndSeconds,
                    waveformGain: waveformGain,
                    fallbackTint: sourceTrack.tint,
                    onSelectTime: onSelectTime
                )
            }

            ProAudioConversationRiver(
                charlieTrack: charlieTrack,
                homerTrack: homerTrack,
                visibleStartSeconds: visibleStartSeconds,
                visibleDurationSeconds: visibleDurationSeconds,
                sequenceTime: sequenceTime,
                onSelectTime: onSelectTime
            )
            .frame(height: 64)
        }
        .padding(12)
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.night.opacity(0.78),
                    QuipslyStudioTheme.forest.opacity(0.42),
                    QuipslyStudioTheme.honey.opacity(0.08)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 24, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(QuipslyStudioTheme.lichen.opacity(0.18), lineWidth: 1)
        )
    }

    private var playheadLabel: String {
        let value = max(0, sequenceTime)
        let hours = Int(value) / 3600
        let minutes = (Int(value) % 3600) / 60
        let seconds = Int(value) % 60
        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, seconds)
        }
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

private struct ProAudioConversationRiver: View {
    let charlieTrack: SourceAwareAudioTrackSnapshot?
    let homerTrack: SourceAwareAudioTrackSnapshot?
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    var onSelectTime: (Double) -> Void

    private let sampleCount = 180

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Canvas { context, size in
                    let columns = max(12, sampleCount)
                    let columnWidth = max(1.0, size.width / CGFloat(columns))

                    let midline = size.height / 2.0
                    context.stroke(
                        Path { path in
                            path.move(to: CGPoint(x: 0, y: midline))
                            path.addLine(to: CGPoint(x: size.width, y: midline))
                        },
                        with: .color(QuipslyStudioTheme.moonMilk.opacity(0.14)),
                        lineWidth: 1
                    )

                    for index in 0..<columns {
                        let ratio = Double(index) / Double(max(columns - 1, 1))
                        let time = visibleStartSeconds + ratio * max(visibleDurationSeconds, 1)
                        let charlieLevel = normalizedDb(dbForTrack(charlieTrack, at: time))
                        let homerLevel = normalizedDb(dbForTrack(homerTrack, at: time))
                        let color = dominanceColor(charlie: charlieLevel, homer: homerLevel)
                        let intensity = max(charlieLevel, homerLevel)
                        let overlap = min(charlieLevel, homerLevel)
                        let height = max(5, size.height * (0.18 + intensity * 0.66))
                        let y = midline - (height / 2.0)
                        let rect = CGRect(
                            x: CGFloat(index) * columnWidth,
                            y: y,
                            width: max(1.0, columnWidth * 0.88),
                            height: height
                        )
                        context.fill(
                            Path(roundedRect: rect, cornerRadius: columnWidth * 0.36),
                            with: .color(color.opacity(0.20 + intensity * 0.52))
                        )

                        if overlap > 0.28 {
                            let overlapHeight = max(4, size.height * overlap * 0.36)
                            let overlapRect = CGRect(
                                x: CGFloat(index) * columnWidth,
                                y: midline - overlapHeight / 2,
                                width: max(1.0, columnWidth * 0.88),
                                height: overlapHeight
                            )
                            context.fill(
                                Path(roundedRect: overlapRect, cornerRadius: columnWidth * 0.36),
                                with: .color(QuipslyStudioTheme.honey.opacity(0.26 + overlap * 0.42))
                            )
                        }
                    }
                }
                .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                ProAudioDialoguePlayheadLine(
                    sequenceTime: sequenceTime,
                    visibleStartSeconds: visibleStartSeconds,
                    visibleDurationSeconds: visibleDurationSeconds
                )

                HStack {
                    Text("Charlie")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.creekMist.opacity(0.88))
                    Spacer()
                    Text("Both")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.honey.opacity(0.88))
                    Spacer()
                    Text("Homer")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(QuipslyStudioTheme.lichen.opacity(0.88))
                }
                .padding(.horizontal, 12)
                .padding(.top, 8)

                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                let ratio = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                                onSelectTime(visibleStartSeconds + Double(ratio) * max(visibleDurationSeconds, 1))
                            }
                    )
            }
        }
        .background(
            LinearGradient(
                colors: [
                    QuipslyStudioTheme.night.opacity(0.54),
                    QuipslyStudioTheme.forest.opacity(0.35)
                ],
                startPoint: .leading,
                endPoint: .trailing
            ),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(QuipslyStudioTheme.moonMilk.opacity(0.12), lineWidth: 1)
        )
    }

    private func dbForTrack(_ track: SourceAwareAudioTrackSnapshot?, at time: Double) -> Double {
        guard let track else { return -90 }
        if let direct = track.windows.first(where: { $0.startSeconds <= time && time <= $0.endSeconds }) {
            return direct.rmsDbfs
        }
        return track.windows.min { left, right in
            abs(((left.startSeconds + left.endSeconds) / 2.0) - time) < abs(((right.startSeconds + right.endSeconds) / 2.0) - time)
        }?.rmsDbfs ?? -90
    }

    private func normalizedDb(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-14.0, max(-68.0, dbfs))
        return CGFloat((clamped + 68.0) / 54.0)
    }

    private func dominanceColor(charlie: CGFloat, homer: CGFloat) -> Color {
        let quietThreshold: CGFloat = 0.16
        if max(charlie, homer) < quietThreshold {
            return QuipslyStudioTheme.sage
        }
        if min(charlie, homer) > 0.34 && abs(charlie - homer) < 0.22 {
            return QuipslyStudioTheme.honey
        }
        return charlie >= homer ? QuipslyStudioTheme.creekMist : QuipslyStudioTheme.lichen
    }
}

private struct ProAudioDialogueSpeakerScope: View {
    let title: String
    let track: SourceAwareAudioTrackSnapshot?
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let waveformGain: CGFloat
    let fallbackTint: Color
    var onSelectTime: (Double) -> Void

    private var tint: Color {
        track?.tint ?? fallbackTint
    }

    private var currentWindow: SourceAwareAudioWindowSnapshot? {
        guard let track else { return nil }
        if let direct = track.windows.first(where: { $0.startSeconds <= sequenceTime && sequenceTime <= $0.endSeconds }) {
            return direct
        }
        return track.windows.min { left, right in
            abs(((left.startSeconds + left.endSeconds) / 2.0) - sequenceTime) < abs(((right.startSeconds + right.endSeconds) / 2.0) - sequenceTime)
        }
    }

    private var currentRmsDbfs: Double {
        currentWindow?.rmsDbfs ?? -90
    }

    private var currentPeakDbfs: Double {
        currentWindow?.samplePeakDbfs ?? -90
    }

    private var currentLevel: CGFloat {
        normalizedDb(currentRmsDbfs)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .fill(tint.opacity(0.15))
                    Circle()
                        .trim(from: 0, to: max(0.04, currentLevel))
                        .stroke(tint, style: StrokeStyle(lineWidth: 4, lineCap: .round))
                        .rotationEffect(.degrees(-90))
                    Image(systemName: track?.icon ?? "person.wave.2.fill")
                        .font(.headline)
                        .foregroundStyle(tint)
                }
                .frame(width: 44, height: 44)

                VStack(alignment: .leading, spacing: 2) {
                    Text(title)
                        .font(.title3)
                        .fontWeight(.black)
                    Text(activityLabel)
                        .font(.caption)
                        .fontWeight(.bold)
                        .foregroundStyle(activityTint)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 2) {
                    Text(formatDb(currentRmsDbfs))
                        .font(.caption.monospacedDigit())
                        .fontWeight(.black)
                        .foregroundStyle(.primary)
                    Text(formatDb(currentPeakDbfs))
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(currentPeakDbfs > -3 ? QuipslyStudioTheme.clay : .secondary)
                }
            }

            GeometryReader { proxy in
                ZStack(alignment: .topLeading) {
                    RoundedRectangle(cornerRadius: 18, style: .continuous)
                        .fill(.black.opacity(0.26))

                    if let track {
                        ProAudioSpectralActivityBed(
                            track: track,
                            visibleStartSeconds: visibleStartSeconds,
                            visibleDurationSeconds: visibleDurationSeconds
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))

                        ProAudioStemWaveformCanvas(
                            track: track,
                            duration: duration,
                            visibleStartSeconds: visibleStartSeconds,
                            visibleDurationSeconds: visibleDurationSeconds,
                            sequenceTime: sequenceTime,
                            rangeStartSeconds: rangeStartSeconds,
                            rangeEndSeconds: rangeEndSeconds,
                            detailed: true,
                            waveformGain: waveformGain
                        )
                        .padding(.vertical, 4)
                    } else {
                        Image(systemName: "waveform.badge.exclamationmark")
                            .font(.largeTitle)
                            .foregroundStyle(tint.opacity(0.72))
                            .frame(maxWidth: .infinity, maxHeight: .infinity)
                    }

                    ProAudioDialoguePlayheadLine(
                        sequenceTime: sequenceTime,
                        visibleStartSeconds: visibleStartSeconds,
                        visibleDurationSeconds: visibleDurationSeconds
                    )

                    Color.clear
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    let ratio = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                                    onSelectTime(visibleStartSeconds + Double(ratio) * max(visibleDurationSeconds, 1))
                                }
                        )
                }
            }
            .frame(height: 190)
        }
        .padding(14)
        .background(
            LinearGradient(
                colors: [
                    tint.opacity(0.18),
                    QuipslyStudioTheme.night.opacity(0.74),
                    QuipslyStudioTheme.forest.opacity(0.28)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            ),
            in: RoundedRectangle(cornerRadius: 24, style: .continuous)
        )
        .overlay(
            RoundedRectangle(cornerRadius: 24, style: .continuous)
                .stroke(tint.opacity(0.28), lineWidth: 1)
        )
    }

    private var activityLabel: String {
        switch currentRmsDbfs {
        case let value where value > -24:
            return "present"
        case let value where value > -38:
            return "supporting"
        case let value where value > -54:
            return "room tone"
        default:
            return "quiet"
        }
    }

    private var activityTint: Color {
        switch currentRmsDbfs {
        case let value where value > -24:
            return QuipslyStudioTheme.lichen
        case let value where value > -38:
            return QuipslyStudioTheme.honey
        case let value where value > -54:
            return QuipslyStudioTheme.sage
        default:
            return QuipslyStudioTheme.moonMilk.opacity(0.55)
        }
    }

    private func normalizedDb(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-10.0, max(-70.0, dbfs))
        return CGFloat((clamped + 70.0) / 60.0)
    }

    private func formatDb(_ dbfs: Double) -> String {
        guard dbfs.isFinite else { return "-inf" }
        if dbfs <= -89 { return "-inf" }
        return String(format: "%.1f dB", dbfs)
    }
}

private struct ProAudioSpectralActivityBed: View {
    let track: SourceAwareAudioTrackSnapshot
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double

    var body: some View {
        Canvas { context, size in
            let visibleEnd = visibleStartSeconds + max(visibleDurationSeconds, 1)
            let candidates = track.windows.filter { window in
                window.endSeconds >= visibleStartSeconds && window.startSeconds <= visibleEnd
            }

            for window in candidates {
                let rawStartRatio = CGFloat((max(window.startSeconds, visibleStartSeconds) - visibleStartSeconds) / max(visibleDurationSeconds, 1))
                let rawEndRatio = CGFloat((min(window.endSeconds, visibleEnd) - visibleStartSeconds) / max(visibleDurationSeconds, 1))
                let startRatio = min(max(rawStartRatio, 0), 1)
                let endRatio = min(max(rawEndRatio, 0), 1)
                let x = startRatio * size.width
                let width = max(1.2, (endRatio - startRatio) * size.width)
                let rms = normalizedDb(window.rmsDbfs)
                let peak = normalizedDb(window.samplePeakDbfs)
                let height = max(6, size.height * (0.16 + peak * 0.76))
                let y = size.height - height
                let rect = CGRect(x: x, y: y, width: width, height: height)
                context.fill(Path(rect), with: .color(track.tint.opacity(0.08 + rms * 0.38)))

                if window.samplePeakDbfs > -6 {
                    let hotRect = CGRect(x: x, y: 0, width: max(1.0, width), height: size.height)
                    context.fill(Path(hotRect), with: .color(QuipslyStudioTheme.honey.opacity(0.06)))
                }
            }
        }
    }

    private func normalizedDb(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-10.0, max(-72.0, dbfs))
        return CGFloat((clamped + 72.0) / 62.0)
    }
}

private struct ProAudioDialoguePlayheadLine: View {
    let sequenceTime: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double

    var body: some View {
        GeometryReader { proxy in
            let ratio = CGFloat((sequenceTime - visibleStartSeconds) / max(visibleDurationSeconds, 1))
            if ratio >= 0 && ratio <= 1 {
                Rectangle()
                    .fill(QuipslyStudioTheme.moonMilk.opacity(0.95))
                    .frame(width: 2)
                    .shadow(color: QuipslyStudioTheme.moonMilk.opacity(0.8), radius: 7)
                    .offset(x: max(0, min(proxy.size.width - 2, proxy.size.width * ratio)))
            }
        }
    }
}

private struct ProAudioPlayheadBalanceMeter: View {
    let charlieTrack: SourceAwareAudioTrackSnapshot?
    let homerTrack: SourceAwareAudioTrackSnapshot?
    let sequenceTime: Double

    var body: some View {
        GeometryReader { proxy in
            let state = balanceState
            ZStack(alignment: .leading) {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(QuipslyStudioTheme.night.opacity(0.34))

                LinearGradient(
                    colors: [
                        QuipslyStudioTheme.creekMist.opacity(0.72),
                        QuipslyStudioTheme.honey.opacity(0.58),
                        QuipslyStudioTheme.moss.opacity(0.72)
                    ],
                    startPoint: .leading,
                    endPoint: .trailing
                )
                .opacity(max(0.18, state.energy))
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))

                Capsule()
                    .fill(.black.opacity(0.28))
                    .frame(height: 2)
                    .padding(.horizontal, 16)

                Circle()
                    .fill(state.tint)
                    .frame(width: 16, height: 16)
                    .shadow(color: state.tint.opacity(0.72), radius: 9)
                    .offset(x: needleX(width: proxy.size.width, balance: state.balance) - 8, y: 15)

                HStack {
                    meterLabel("Charlie", tint: QuipslyStudioTheme.creekMist, value: state.charlieDbfs)
                    Spacer()
                    Text(state.title)
                        .font(.caption)
                        .fontWeight(.black)
                        .foregroundStyle(state.tint)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 5)
                        .background(.black.opacity(0.22), in: Capsule())
                    Spacer()
                    meterLabel("Homer", tint: QuipslyStudioTheme.moss, value: state.homerDbfs)
                }
                .padding(.horizontal, 12)
            }
        }
        .accessibilityLabel("Playhead speaker balance")
    }

    private struct BalanceState {
        let balance: CGFloat
        let energy: Double
        let charlieDbfs: Double
        let homerDbfs: Double
        let title: String
        let tint: Color
    }

    private var balanceState: BalanceState {
        let charlieDbfs = currentDbfs(charlieTrack)
        let homerDbfs = currentDbfs(homerTrack)
        let charlieLevel = normalizedLevel(charlieDbfs)
        let homerLevel = normalizedLevel(homerDbfs)
        let total = charlieLevel + homerLevel
        let balance = total <= 0.001 ? CGFloat(0) : CGFloat((homerLevel - charlieLevel) / total)
        let title: String
        let tint: Color
        if total < 0.12 {
            title = "quiet"
            tint = QuipslyStudioTheme.sage
        } else if abs(balance) < 0.18 {
            title = "overlap"
            tint = QuipslyStudioTheme.honey
        } else if balance < 0 {
            title = "Charlie"
            tint = QuipslyStudioTheme.creekMist
        } else {
            title = "Homer"
            tint = QuipslyStudioTheme.moss
        }
        return BalanceState(
            balance: balance,
            energy: min(max(total / 1.6, 0.10), 1.0),
            charlieDbfs: charlieDbfs,
            homerDbfs: homerDbfs,
            title: title,
            tint: tint
        )
    }

    private func currentDbfs(_ track: SourceAwareAudioTrackSnapshot?) -> Double {
        guard let track,
              let window = track.windows.first(where: { sequenceTime >= $0.startSeconds && sequenceTime <= $0.endSeconds }) else {
            return -120
        }
        return window.rmsDbfs
    }

    private func normalizedLevel(_ dbfs: Double) -> Double {
        guard dbfs.isFinite else { return 0 }
        let clamped = min(-12.0, max(-78.0, dbfs))
        return (clamped + 78.0) / 66.0
    }

    private func needleX(width: CGFloat, balance: CGFloat) -> CGFloat {
        let margin: CGFloat = 20
        let usable = max(width - margin * 2, 1)
        let ratio = min(max((balance + 1) / 2, 0), 1)
        return margin + usable * ratio
    }

    private func meterLabel(_ title: String, tint: Color, value: Double) -> some View {
        HStack(spacing: 5) {
            Circle()
                .fill(tint)
                .frame(width: 7, height: 7)
            Text(title)
                .font(.caption2)
                .fontWeight(.black)
            Text(formatDb(value))
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
        }
        .foregroundStyle(tint)
    }

    private func formatDb(_ value: Double) -> String {
        guard value.isFinite, value > -100 else { return "-inf" }
        return String(format: "%.0f", value)
    }
}

private struct ProAudioTwinStemStrip: View {
    let track: SourceAwareAudioTrackSnapshot
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let waveformGain: CGFloat
    let isSelected: Bool
    var onSelectTime: (Double) -> Void
    var onSelectTrack: () -> Void
    var onPlay: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: track.icon)
                    .font(.headline)
                    .foregroundStyle(track.tint)
                    .frame(width: 34, height: 34)
                    .background(track.tint.opacity(0.14), in: Circle())

                VStack(alignment: .leading, spacing: 1) {
                    Text(trackTitle)
                        .font(.headline)
                        .fontWeight(.black)
                    Text(levelLine)
                        .font(.caption2.monospacedDigit())
                        .foregroundStyle(.secondary)
                }

                Spacer()

                ProAudioCurrentLevelMeter(track: track, sequenceTime: sequenceTime)
                    .frame(width: 74, height: 18)

                Button(action: onPlay) {
                    Image(systemName: "play.fill")
                }
                .buttonStyle(ProAudioRoomButtonStyle(tint: track.tint))
                .controlSize(.mini)
            }

            ProAudioStageGateMiniBar(track: track)

            GeometryReader { proxy in
                ZStack(alignment: .topLeading) {
                    ProAudioStemWaveformCanvas(
                        track: track,
                        duration: duration,
                        visibleStartSeconds: visibleStartSeconds,
                        visibleDurationSeconds: visibleDurationSeconds,
                        sequenceTime: sequenceTime,
                        rangeStartSeconds: rangeStartSeconds,
                        rangeEndSeconds: rangeEndSeconds,
                        detailed: true,
                        waveformGain: waveformGain
                    )
                    .frame(width: proxy.size.width, height: proxy.size.height)

                    ProAudioPresentMomentHalo(track: track, sequenceTime: sequenceTime)
                        .frame(width: proxy.size.width, height: proxy.size.height)

                    Color.clear
                        .contentShape(Rectangle())
                        .gesture(
                            DragGesture(minimumDistance: 0)
                                .onChanged { value in
                                    let width = max(proxy.size.width, 1)
                                    let ratio = min(max(value.location.x / width, 0), 1)
                                    onSelectTime(visibleStartSeconds + Double(ratio) * max(visibleDurationSeconds, 1))
                                    onSelectTrack()
                                }
                        )
                }
            }
            .frame(height: 186)
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .fill(track.tint.opacity(isSelected ? 0.17 : 0.09))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(track.tint.opacity(isSelected ? 0.78 : 0.24), lineWidth: isSelected ? 2 : 1)
        )
        .onTapGesture(perform: onSelectTrack)
    }

    private var trackTitle: String {
        let key = track.roleId.lowercased()
        if key.contains("charlie") { return "Charlie" }
        if key.contains("homer") { return "Homer" }
        return track.label
    }

    private var levelLine: String {
        "mean \(String(format: "%.1f", track.meanRmsDbfs)) dB  peak \(String(format: "%.1f", track.maxPeakDbfs)) dB"
    }
}

private struct ProAudioCurrentLevelMeter: View {
    let track: SourceAwareAudioTrackSnapshot
    let sequenceTime: Double

    var body: some View {
        GeometryReader { proxy in
            let level = currentLevel
            ZStack(alignment: .leading) {
                Capsule()
                    .fill(.black.opacity(0.24))
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [
                                track.tint.opacity(0.62),
                                level > 0.85 ? QuipslyStudioTheme.clay : QuipslyStudioTheme.honey
                            ],
                            startPoint: .leading,
                            endPoint: .trailing
                        )
                    )
                    .frame(width: max(3, proxy.size.width * level))
                Rectangle()
                    .fill(.white.opacity(0.34))
                    .frame(width: 1)
                    .offset(x: proxy.size.width * 0.72)
                Rectangle()
                    .fill(QuipslyStudioTheme.clay.opacity(0.64))
                    .frame(width: 1)
                    .offset(x: proxy.size.width * 0.90)
            }
        }
        .accessibilityLabel("\(track.label) current level")
    }

    private var currentLevel: CGFloat {
        guard let window = track.windows.first(where: { sequenceTime >= $0.startSeconds && sequenceTime <= $0.endSeconds }) else {
            return 0.02
        }
        let clamped = min(-12.0, max(-78.0, window.rmsDbfs))
        return CGFloat((clamped + 78.0) / 66.0)
    }
}

private struct ProAudioPresentMomentHalo: View {
    let track: SourceAwareAudioTrackSnapshot
    let sequenceTime: Double

    var body: some View {
        GeometryReader { proxy in
            if let window = track.windows.first(where: { sequenceTime >= $0.startSeconds && sequenceTime <= $0.endSeconds }) {
                let level = normalized(window.rmsDbfs)
                let height = max(12, proxy.size.height * level)
                let y = (proxy.size.height - height) / 2
                RoundedRectangle(cornerRadius: 10, style: .continuous)
                    .fill(track.tint.opacity(0.10 + Double(level) * 0.28))
                    .frame(width: proxy.size.width, height: height)
                    .offset(y: y)
                    .blendMode(.screen)
            }
        }
        .allowsHitTesting(false)
    }

    private func normalized(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-12.0, max(-78.0, dbfs))
        return CGFloat((clamped + 78.0) / 66.0)
    }
}

private struct ProAudioOverviewStrip: View {
    let tracks: [SourceAwareAudioTrackSnapshot]
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let reviewWindows: [SourceAwareAudioReviewWindowSnapshot]
    var onSelectTime: (Double) -> Void

    var body: some View {
        GeometryReader { proxy in
            ZStack(alignment: .topLeading) {
                Canvas { context, size in
                    let laneHeight = max(10, size.height / CGFloat(max(tracks.count, 1)))
                    for (laneIndex, track) in tracks.enumerated() {
                        let y = CGFloat(laneIndex) * laneHeight
                        drawTrack(track, in: CGRect(x: 0, y: y, width: size.width, height: laneHeight - 4), context: context)
                    }

                    for window in reviewWindows.prefix(80) {
                        let x = CGFloat(min(max(window.startSeconds / max(duration, 1), 0), 1)) * size.width
                        let rect = CGRect(x: x, y: 0, width: 1.5, height: size.height)
                        context.fill(Path(rect), with: .color(QuipslyStudioTheme.honey.opacity(0.65)))
                    }

                    let visibleStartRatio = CGFloat(min(max(visibleStartSeconds / max(duration, 1), 0), 1))
                    let visibleEndRatio = CGFloat(min(max((visibleStartSeconds + visibleDurationSeconds) / max(duration, 1), 0), 1))
                    let visibleRect = CGRect(
                        x: visibleStartRatio * size.width,
                        y: 0,
                        width: max(2, (visibleEndRatio - visibleStartRatio) * size.width),
                        height: size.height
                    )
                    context.fill(Path(visibleRect), with: .color(QuipslyStudioTheme.creekMist.opacity(0.09)))
                    context.stroke(Path(roundedRect: visibleRect, cornerRadius: 5), with: .color(QuipslyStudioTheme.creekMist.opacity(0.55)), lineWidth: 1.5)

                    drawRange(context: context, size: size)

                    let playheadX = CGFloat(min(max(sequenceTime / max(duration, 1), 0), 1)) * size.width
                    context.fill(Path(CGRect(x: playheadX - 1, y: 0, width: 2, height: size.height)), with: .color(QuipslyStudioTheme.clay))
                }

                Color.clear
                    .contentShape(Rectangle())
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                let ratio = min(max(value.location.x / max(proxy.size.width, 1), 0), 1)
                                onSelectTime(Double(ratio) * max(duration, 1))
                            }
                    )
            }
        }
        .padding(8)
        .background(QuipslyStudioTheme.night.opacity(0.54), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(QuipslyStudioTheme.sage.opacity(0.18), lineWidth: 1)
        )
    }

    private func drawRange(context: GraphicsContext, size: CGSize) {
        guard let rangeStartSeconds, let rangeEndSeconds else { return }
        let start = min(max(min(rangeStartSeconds, rangeEndSeconds) / max(duration, 1), 0), 1)
        let end = min(max(max(rangeStartSeconds, rangeEndSeconds) / max(duration, 1), 0), 1)
        guard end > start else { return }
        let rect = CGRect(x: CGFloat(start) * size.width, y: 0, width: max(3, CGFloat(end - start) * size.width), height: size.height)
        context.fill(Path(roundedRect: rect, cornerRadius: 6), with: .color(QuipslyStudioTheme.honey.opacity(0.12)))
        context.stroke(Path(roundedRect: rect.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 6), with: .color(QuipslyStudioTheme.honey.opacity(0.70)), lineWidth: 1.5)
    }

    private func drawTrack(_ track: SourceAwareAudioTrackSnapshot, in rect: CGRect, context: GraphicsContext) {
        guard !track.windows.isEmpty else { return }
        let count = max(track.windows.count, 1)
        let barWidth = max(1, rect.width / CGFloat(count))
        let centerY = rect.midY
        for (index, window) in track.windows.enumerated() {
            let x = rect.minX + CGFloat(index) * barWidth
            let normalized = normalizedRms(window.rmsDbfs)
            let barHeight = max(1.5, normalized * rect.height)
            let barRect = CGRect(x: x, y: centerY - barHeight / 2, width: max(1, barWidth * 0.8), height: barHeight)
            context.fill(Path(barRect), with: .color(track.tint.opacity(window.rmsDbfs < -60 ? 0.20 : 0.78)))
        }
    }

    private func normalizedRms(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-12.0, max(-72.0, dbfs))
        return CGFloat((clamped + 72.0) / 60.0)
    }
}

private struct ProAudioWaveformAnalysisLegend: View {
    let tint: Color

    var body: some View {
        HStack(spacing: 12) {
            legendItem("RMS body", color: tint, style: .solid)
            legendItem("sample peak", color: tint.opacity(0.34), style: .outline)
            legendItem("voice activity", color: QuipslyStudioTheme.lichen, style: .rail)
            legendItem("hot", color: QuipslyStudioTheme.honey, style: .flag)
            legendItem("clip risk", color: QuipslyStudioTheme.clay, style: .flag)
            Spacer(minLength: 0)
        }
        .font(.system(size: 9, weight: .bold))
        .foregroundStyle(QuipslyStudioTheme.moonMilk.opacity(0.68))
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Waveform legend. Solid is RMS, translucent outline is sample peak, green rail is voice activity, honey is hot, red is clip risk.")
    }

    private enum SwatchStyle {
        case solid
        case outline
        case rail
        case flag
    }

    @ViewBuilder
    private func legendItem(_ title: String, color: Color, style: SwatchStyle) -> some View {
        HStack(spacing: 5) {
            Group {
                switch style {
                case .solid:
                    RoundedRectangle(cornerRadius: 2).fill(color)
                case .outline:
                    RoundedRectangle(cornerRadius: 2).stroke(color, lineWidth: 2)
                case .rail:
                    Capsule().fill(color)
                case .flag:
                    Circle().fill(color)
                }
            }
            .frame(width: style == .rail ? 17 : 9, height: style == .rail ? 3 : 9)
            Text(title)
        }
    }
}

private struct ProAudioStemWaveformCanvas: View {
    let track: SourceAwareAudioTrackSnapshot
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let sequenceTime: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let detailed: Bool
    var waveformGain: CGFloat = 1.0

    var body: some View {
        ZStack {
            ProAudioStemWaveformBed(
                track: track,
                duration: duration,
                visibleStartSeconds: visibleStartSeconds,
                visibleDurationSeconds: visibleDurationSeconds,
                rangeStartSeconds: rangeStartSeconds,
                rangeEndSeconds: rangeEndSeconds,
                detailed: detailed,
                waveformGain: waveformGain
            )
            .equatable()

            if detailed,
               track.exists,
               visibleDurationSeconds <= 30 {
                ProAudioHighResolutionEnvelope(
                    path: track.path,
                    tint: track.tint,
                    visibleStartSeconds: visibleStartSeconds,
                    visibleDurationSeconds: visibleDurationSeconds,
                    waveformGain: waveformGain
                )
                .padding(.horizontal, 14)
                .padding(.bottom, 14)
            }

            GeometryReader { proxy in
                if sequenceTime >= visibleStartSeconds,
                   sequenceTime <= visibleStartSeconds + visibleDurationSeconds {
                    let usableWidth = max(proxy.size.width - 28, 1)
                    let fraction = min(max((sequenceTime - visibleStartSeconds) / max(visibleDurationSeconds, 1), 0), 1)
                    let x = 14 + CGFloat(fraction) * usableWidth
                    let usableHeight = max(proxy.size.height - 14, 1)
                    Path { path in
                        path.addRect(CGRect(x: x - 1.5, y: 0, width: 3, height: usableHeight))
                        path.addEllipse(in: CGRect(x: x - 5, y: 0, width: 10, height: 10))
                    }
                    .fill(QuipslyStudioTheme.clay)
                }
            }
            .allowsHitTesting(false)
        }
    }
}

private struct ProAudioStemWaveformBed: View, Equatable {
    let track: SourceAwareAudioTrackSnapshot
    let duration: Double
    let visibleStartSeconds: Double
    let visibleDurationSeconds: Double
    let rangeStartSeconds: Double?
    let rangeEndSeconds: Double?
    let detailed: Bool
    var waveformGain: CGFloat = 1.0

    static func == (lhs: Self, rhs: Self) -> Bool {
        lhs.track.id == rhs.track.id
            && lhs.track.windows.count == rhs.track.windows.count
            && lhs.duration == rhs.duration
            && lhs.visibleStartSeconds == rhs.visibleStartSeconds
            && lhs.visibleDurationSeconds == rhs.visibleDurationSeconds
            && lhs.rangeStartSeconds == rhs.rangeStartSeconds
            && lhs.rangeEndSeconds == rhs.rangeEndSeconds
            && lhs.detailed == rhs.detailed
            && lhs.waveformGain == rhs.waveformGain
    }

    var body: some View {
        Canvas { context, size in
            drawGrid(context: context, size: size)
            drawLevelGuides(context: context, size: size)
            drawRange(context: context, size: size)
            drawWaveform(context: context, size: size)
        }
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal, 14)
        .padding(.bottom, 14)
    }

    private func drawGrid(context: GraphicsContext, size: CGSize) {
        let gridColor = QuipslyStudioTheme.moonMilk.opacity(0.08)
        let divisions = 12
        for index in 0...divisions {
            let x = CGFloat(index) / CGFloat(divisions) * size.width
            context.fill(Path(CGRect(x: x, y: 0, width: 1, height: size.height)), with: .color(gridColor))
        }
        context.fill(Path(CGRect(x: 0, y: size.height / 2, width: size.width, height: 1)), with: .color(QuipslyStudioTheme.moonMilk.opacity(0.18)))
    }

    private func drawLevelGuides(context: GraphicsContext, size: CGSize) {
        guard detailed else { return }
        let centerY = size.height / 2
        let guides: [(dbfs: Double, color: Color, opacity: Double, lineWidth: CGFloat)] = [
            (-58, QuipslyStudioTheme.sage, 0.10, 1),
            (-36, track.tint, 0.12, 1),
            (-18, QuipslyStudioTheme.honey, 0.16, 1.25),
            (-6, QuipslyStudioTheme.clay, 0.20, 1.5)
        ]

        for guide in guides {
            let amplitude = normalizedRms(guide.dbfs) * size.height * 0.46
            guard amplitude > 1 else { continue }
            let topY = max(centerY - amplitude, 0)
            let bottomY = min(centerY + amplitude, size.height)
            let topRect = CGRect(x: 0, y: topY, width: size.width, height: guide.lineWidth)
            let bottomRect = CGRect(x: 0, y: bottomY, width: size.width, height: guide.lineWidth)
            context.fill(Path(topRect), with: .color(guide.color.opacity(guide.opacity)))
            context.fill(Path(bottomRect), with: .color(guide.color.opacity(guide.opacity)))
        }

        let hotAmp = normalizedRms(-6) * size.height * 0.46
        if hotAmp > 1 {
            let topRect = CGRect(x: 0, y: 0, width: size.width, height: max(centerY - hotAmp, 0))
            let bottomRect = CGRect(x: 0, y: min(centerY + hotAmp, size.height), width: size.width, height: max(centerY - hotAmp, 0))
            context.fill(Path(topRect), with: .color(QuipslyStudioTheme.clay.opacity(0.035)))
            context.fill(Path(bottomRect), with: .color(QuipslyStudioTheme.clay.opacity(0.035)))
        }
    }

    private func drawRange(context: GraphicsContext, size: CGSize) {
        guard let rangeStartSeconds, let rangeEndSeconds else { return }
        let visibleEndSeconds = visibleStartSeconds + max(visibleDurationSeconds, 1)
        let startSeconds = max(min(rangeStartSeconds, rangeEndSeconds), visibleStartSeconds)
        let endSeconds = min(max(rangeStartSeconds, rangeEndSeconds), visibleEndSeconds)
        guard endSeconds > startSeconds else { return }
        let x1 = CGFloat((startSeconds - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        let x2 = CGFloat((endSeconds - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
        let rect = CGRect(x: x1, y: 0, width: max(4, x2 - x1), height: size.height)
        context.fill(Path(roundedRect: rect, cornerRadius: 12), with: .color(QuipslyStudioTheme.honey.opacity(0.11)))
        context.stroke(Path(roundedRect: rect.insetBy(dx: 0.75, dy: 0.75), cornerRadius: 12), with: .color(QuipslyStudioTheme.honey.opacity(0.64)), lineWidth: 1.5)
    }

    private func drawWaveform(context: GraphicsContext, size: CGSize) {
        let visibleEndSeconds = min(visibleStartSeconds + max(visibleDurationSeconds, 1), duration)
        let visibleWindows = track.windows.filter { window in
            window.endSeconds >= visibleStartSeconds && window.startSeconds <= visibleEndSeconds
        }

        guard !visibleWindows.isEmpty else {
            context.fill(Path(CGRect(x: 0, y: size.height * 0.48, width: size.width, height: 3)), with: .color(QuipslyStudioTheme.sage.opacity(0.24)))
            return
        }

        let maxBars = detailed ? Int(size.width / 3.0) : Int(size.width / 6.0)
        let stride = max(1, Int(ceil(Double(visibleWindows.count) / Double(max(maxBars, 1)))))
        let samples = strideWindows(visibleWindows, by: stride)
        let secondsPerPixel = max(visibleDurationSeconds, 1) / Double(max(size.width, 1))
        let fallbackBarWidth = max(1.0, size.width / CGFloat(max(samples.count, 1)))
        let centerY = size.height / 2

        for sample in samples {
            let sampleStart = min(max(sample.startSeconds, visibleStartSeconds), visibleEndSeconds)
            let sampleEnd = min(max(sample.endSeconds, sampleStart + secondsPerPixel), visibleEndSeconds)
            let x = CGFloat((sampleStart - visibleStartSeconds) / max(visibleDurationSeconds, 1)) * size.width
            let normalized = normalizedRms(sample.rmsDbfs)
            let normalizedPeak = normalizedPeak(sample.samplePeakDbfs)
            let barHeight = max(2, normalized * size.height * 0.82)
            let peakHeight = max(barHeight + 2, normalizedPeak * size.height * 0.92)
            let opacity = sample.rmsDbfs < -60 ? 0.24 : 0.88
            let sampleWidth = CGFloat((sampleEnd - sampleStart) / max(visibleDurationSeconds, 1)) * size.width
            let width = max(1.4, min(fallbackBarWidth * 0.86, sampleWidth * 0.86))
            let peakRect = CGRect(x: x + 0.5, y: centerY - peakHeight / 2, width: width, height: peakHeight)
            let rect = CGRect(x: x + 0.5, y: centerY - barHeight / 2, width: width, height: barHeight)

            var peakPath = Path()
            peakPath.addRoundedRect(in: peakRect, cornerSize: CGSize(width: 2.5, height: 2.5))
            context.fill(peakPath, with: .color(track.tint.opacity(sample.rmsDbfs < -60 ? 0.07 : 0.20)))

            var path = Path()
            path.addRoundedRect(in: rect, cornerSize: CGSize(width: 2.5, height: 2.5))
            context.fill(path, with: .color(track.tint.opacity(opacity)))

            if detailed, peakHeight > barHeight + 3 {
                let topCap = CGRect(x: peakRect.minX, y: peakRect.minY, width: peakRect.width, height: 1.5)
                let bottomCap = CGRect(x: peakRect.minX, y: peakRect.maxY - 1.5, width: peakRect.width, height: 1.5)
                context.fill(Path(topCap), with: .color(track.tint.opacity(0.66)))
                context.fill(Path(bottomCap), with: .color(track.tint.opacity(0.66)))
            }

            if sample.rmsDbfs > -48 || sample.samplePeakDbfs > -30 {
                let activity = CGRect(x: x + 0.5, y: size.height - 6, width: width, height: 3)
                context.fill(Path(activity), with: .color(QuipslyStudioTheme.lichen.opacity(0.82)))
            }

            if sample.samplePeakDbfs > -1 {
                let clipFlag = CGRect(x: x + 0.5, y: 2, width: width, height: 6)
                context.fill(Path(clipFlag), with: .color(QuipslyStudioTheme.clay.opacity(0.98)))
            } else if sample.samplePeakDbfs > -3 {
                let hotFlag = CGRect(x: x + 0.5, y: 3, width: width, height: 4)
                context.fill(Path(hotFlag), with: .color(QuipslyStudioTheme.honey.opacity(0.96)))
            }
        }
    }

    private func strideWindows(_ windows: [SourceAwareAudioWindowSnapshot], by stride: Int) -> [SourceAwareAudioWindowSnapshot] {
        guard stride > 1 else { return windows }
        var result: [SourceAwareAudioWindowSnapshot] = []
        var index = 0
        while index < windows.count {
            let chunk = windows[index..<min(index + stride, windows.count)]
            if let loudest = chunk.max(by: { normalizedRms($0.rmsDbfs) < normalizedRms($1.rmsDbfs) }) {
                result.append(loudest)
            }
            index += stride
        }
        return result
    }

    private func normalizedRms(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(-12.0, max(-72.0, dbfs))
        return min(CGFloat((clamped + 72.0) / 60.0) * max(waveformGain, 0.1), 1.0)
    }

    private func normalizedPeak(_ dbfs: Double) -> CGFloat {
        guard dbfs.isFinite else { return 0.02 }
        let clamped = min(0.0, max(-60.0, dbfs))
        return min(CGFloat((clamped + 60.0) / 60.0) * max(waveformGain, 0.1), 1.0)
    }
}

private struct ProAudioRoomButtonStyle: ButtonStyle {
    var tint: Color = QuipslyStudioTheme.creekMist

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.caption)
            .fontWeight(.black)
            .foregroundStyle(QuipslyStudioTheme.moonMilk)
            .padding(.horizontal, 11)
            .padding(.vertical, 7)
            .background(
                LinearGradient(
                    colors: [
                        tint.opacity(configuration.isPressed ? 0.34 : 0.26),
                        QuipslyStudioTheme.night.opacity(0.72)
                    ],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ),
                in: Capsule()
            )
            .overlay(
                Capsule()
                    .stroke(tint.opacity(configuration.isPressed ? 0.78 : 0.38), lineWidth: 1)
            )
            .shadow(color: tint.opacity(configuration.isPressed ? 0.05 : 0.16), radius: configuration.isPressed ? 2 : 8, y: configuration.isPressed ? 1 : 4)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

private struct ProAudioTimePill: View {
    let title: String
    let value: String
    let tint: Color

    var body: some View {
        VStack(spacing: 2) {
            Text(title)
                .font(.system(size: 8, weight: .black))
                .tracking(0.9)
                .foregroundStyle(tint.opacity(0.78))
            Text(value)
                .font(.caption.monospacedDigit())
                .fontWeight(.black)
                .foregroundStyle(tint)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

private struct ProAudioStemComparisonLegend: View {
    var body: some View {
        HStack(spacing: 10) {
            Label("separate stems", systemImage: "rectangle.split.3x1")
            Label("red line = shared playhead", systemImage: "line.diagonal")
            Label("gold ticks = listen marks", systemImage: "ear")
            Spacer()
        }
        .font(.caption2)
        .fontWeight(.semibold)
        .foregroundStyle(.secondary)
        .padding(.horizontal, 4)
    }
}

private struct SourceAwareAudioWorkbenchSnapshot: @unchecked Sendable {
    static let baselineDir = "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_4_Sync_Producer_Takes/20260709-episode4-conformed-audio-baseline-v005-20260709-183059/work/conformed-production-baseline/profile-promotion-v005-to-v006-homer-preserving-clean-20260710-030310"
    static let workbenchPath = "\(baselineDir)/AUDIO_SOURCE_AWARE_LISTEN_WORKBENCH.json"
    static let segmentMapPath = "\(baselineDir)/AUDIO_SEGMENT_LOUDNESS_MAP.json"
    static let fineWaveformMapPath = "\(baselineDir)/AUDIO_FINE_WAVEFORM_MAP.json"
    static let editorialStemRegistryPath = "/Volumes/My Passport/Quipsly Media Vault/audio/episode-4/v015-editorial-stems/manifest.json"

    let status: String
    let approvalStatus: String
    let branchRenderReady: Bool
    let readyStemCount: Int
    let htmlPath: String
    let masterListenPath: String
    let masterDurationSeconds: Double
    let tracks: [SourceAwareAudioTrackSnapshot]
    let reviewWindows: [SourceAwareAudioReviewWindowSnapshot]
    let loadError: String

    static let loading = SourceAwareAudioWorkbenchSnapshot(
        status: "loading",
        approvalStatus: "loading",
        branchRenderReady: false,
        readyStemCount: 0,
        htmlPath: "",
        masterListenPath: "",
        masterDurationSeconds: 0,
        tracks: [],
        reviewWindows: [],
        loadError: "Loading source-aware audio evidence…"
    )

    var isReady: Bool {
        loadError.isEmpty && !tracks.isEmpty
    }

    var trackCount: Int {
        tracks.count
    }

    var sequenceDurationSeconds: Double {
        let durations = tracks.map(\.durationSeconds) + [masterDurationSeconds]
        return max(durations.max() ?? 0, 1)
    }

    static func load() -> SourceAwareAudioWorkbenchSnapshot {
        guard let workbench = readJSONObject(path: workbenchPath) else {
            return SourceAwareAudioWorkbenchSnapshot(
                status: "missing",
                approvalStatus: "unknown",
                branchRenderReady: false,
                readyStemCount: 0,
                htmlPath: "",
                masterListenPath: "",
                masterDurationSeconds: 0,
                tracks: [],
                reviewWindows: [],
                loadError: "Missing \(workbenchPath). Mount the external drive or regenerate the source-aware listen workbench."
            )
        }

        let segmentMap = readJSONObject(path: fineWaveformMapPath) ?? readJSONObject(path: segmentMapPath) ?? [:]
        let stemRows = workbench["stems"] as? [[String: Any]] ?? []
        let stemLookup = Dictionary(uniqueKeysWithValues: stemRows.compactMap { row -> (String, [String: Any])? in
            let role = string(row["roleId"])
            return role.isEmpty ? nil : (role, row)
        })
        let trackRows = segmentMap["tracks"] as? [[String: Any]] ?? []
        let playbackOverrides = editorialStemPlaybackPaths()
        let tracks = trackRows.compactMap {
            let roleId = string($0["roleId"])
            return SourceAwareAudioTrackSnapshot(
                json: $0,
                stem: stemLookup[roleId],
                playbackOverridePath: playbackOverrides[roleId]
            )
        }
        let reviewRows = workbench["reviewWindows"] as? [[String: Any]] ?? []
        let reviewWindows = reviewRows.compactMap(SourceAwareAudioReviewWindowSnapshot.init(json:))
        let master = workbench["master"] as? [String: Any] ?? [:]
        let masterM4A = (master["m4a"] as? [String: Any]) ?? [:]
        let masterWAV = (master["wav"] as? [String: Any]) ?? [:]

        return SourceAwareAudioWorkbenchSnapshot(
            status: string(workbench["status"], fallback: "unknown"),
            approvalStatus: string(workbench["approvalStatus"], fallback: "unknown"),
            branchRenderReady: bool(workbench["branchRenderReady"]),
            readyStemCount: int(workbench["sourceAwareStemReadyCount"]),
            htmlPath: string(workbench["htmlPath"]),
            masterListenPath: string(masterM4A["path"], fallback: string(masterWAV["path"])),
            masterDurationSeconds: double(masterM4A["durationSeconds"], fallback: double(masterWAV["durationSeconds"])),
            tracks: tracks,
            reviewWindows: reviewWindows,
            loadError: tracks.isEmpty ? "Segment loudness map did not provide track windows yet." : ""
        )
    }

    private static func readJSONObject(path: String) -> [String: Any]? {
        guard let data = FileManager.default.contents(atPath: path),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json
    }

    private static func editorialStemPlaybackPaths() -> [String: String] {
        guard let registry = readJSONObject(path: editorialStemRegistryPath) else { return [:] }
        let roleMap = ["charlie": "charlie", "homer": "homer", "reference": "clip-source"]
        let artifacts = registry["artifacts"] as? [[String: Any]] ?? []
        return artifacts.reduce(into: [:]) { result, artifact in
            let speaker = string(artifact["speaker"])
            let path = string(artifact["path"])
            guard let roleId = roleMap[speaker],
                  !path.isEmpty,
                  FileManager.default.fileExists(atPath: path) else { return }
            result[roleId] = path
        }
    }

    static func string(_ value: Any?, fallback: String = "") -> String {
        if let value = value as? String { return value }
        if let value { return "\(value)" }
        return fallback
    }

    static func double(_ value: Any?, fallback: Double = 0) -> Double {
        if let value = value as? Double { return value }
        if let value = value as? Int { return Double(value) }
        if let value = value as? String, let parsed = Double(value) { return parsed }
        return fallback
    }

    static func int(_ value: Any?, fallback: Int = 0) -> Int {
        if let value = value as? Int { return value }
        if let value = value as? Double { return Int(value) }
        if let value = value as? String, let parsed = Int(value) { return parsed }
        return fallback
    }

    static func bool(_ value: Any?, fallback: Bool = false) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? String {
            return ["true", "yes", "1"].contains(value.lowercased())
        }
        if let value = value as? Int { return value != 0 }
        return fallback
    }
}

private struct SourceAwareAudioTrackSnapshot: Identifiable {
    let id: String
    let roleId: String
    let label: String
    let status: String
    let path: String
    let exists: Bool
    let durationSeconds: Double
    let windowSeconds: Double
    let activeWindowCount: Int
    let windowCount: Int
    let meanRmsDbfs: Double
    let maxPeakDbfs: Double
    let purpose: String
    let doNotDo: String
    let alignedSourcePath: String
    let refinedStemPath: String
    let alignedActiveSeconds: Double
    let refinedActiveSeconds: Double
    let alignedActivePercent: Double
    let refinedActivePercent: Double
    let durationDeltaToMasterSeconds: Double
    let windows: [SourceAwareAudioWindowSnapshot]

    init?(json: [String: Any], stem: [String: Any]?, playbackOverridePath: String? = nil) {
        let roleId = SourceAwareAudioWorkbenchSnapshot.string(json["roleId"])
        let label = SourceAwareAudioWorkbenchSnapshot.string(json["label"], fallback: roleId)
        guard !roleId.isEmpty || !label.isEmpty else { return nil }

        let summary = json["summary"] as? [String: Any] ?? [:]
        let rms = summary["rmsDbfs"] as? [String: Any] ?? [:]
        let peak = summary["samplePeakDbfs"] as? [String: Any] ?? [:]
        let selectedRefinedStem = stem?["selectedRefinedStem"] as? [String: Any] ?? [:]
        let alignedSourceStem = stem?["alignedSourceStem"] as? [String: Any] ?? [:]
        let alignedSummary = stem?["alignedSummary"] as? [String: Any] ?? [:]
        let contributionSummary = stem?["contributionSummary"] as? [String: Any] ?? [:]
        let segmentPath = SourceAwareAudioWorkbenchSnapshot.string(json["path"])
        let playablePath = playbackOverridePath ?? segmentPath

        self.roleId = roleId.isEmpty ? label : roleId
        self.id = self.roleId
        self.label = label.isEmpty ? self.roleId : label
        self.status = SourceAwareAudioWorkbenchSnapshot.string(json["status"], fallback: "unknown")
        self.path = playablePath
        self.exists = FileManager.default.fileExists(atPath: playablePath)
        self.durationSeconds = SourceAwareAudioWorkbenchSnapshot.double(json["durationSeconds"])
        self.windowSeconds = SourceAwareAudioWorkbenchSnapshot.double(json["windowSeconds"], fallback: 10)
        self.activeWindowCount = SourceAwareAudioWorkbenchSnapshot.int(summary["activeWindowCount"])
        self.windowCount = SourceAwareAudioWorkbenchSnapshot.int(summary["windowCount"], fallback: (json["windows"] as? [[String: Any]])?.count ?? 0)
        self.meanRmsDbfs = SourceAwareAudioWorkbenchSnapshot.double(rms["mean"], fallback: -96)
        self.maxPeakDbfs = SourceAwareAudioWorkbenchSnapshot.double(peak["max"], fallback: -96)
        self.purpose = SourceAwareAudioWorkbenchSnapshot.string(stem?["purpose"], fallback: Self.defaultPurpose(for: self.roleId))
        self.doNotDo = SourceAwareAudioWorkbenchSnapshot.string(stem?["doNotDo"])
        self.alignedSourcePath = SourceAwareAudioWorkbenchSnapshot.string(alignedSourceStem["path"], fallback: segmentPath)
        self.refinedStemPath = playbackOverridePath ?? SourceAwareAudioWorkbenchSnapshot.string(selectedRefinedStem["path"], fallback: segmentPath)
        self.alignedActiveSeconds = SourceAwareAudioWorkbenchSnapshot.double(alignedSummary["activeSeconds"], fallback: Double(self.activeWindowCount) * self.windowSeconds)
        self.refinedActiveSeconds = SourceAwareAudioWorkbenchSnapshot.double(contributionSummary["activeSeconds"], fallback: Double(self.activeWindowCount) * self.windowSeconds)
        let segmentActivePercent = windowCount > 0 ? Double(activeWindowCount) / Double(windowCount) * 100 : 0
        self.alignedActivePercent = SourceAwareAudioWorkbenchSnapshot.double(alignedSummary["activePercent"], fallback: segmentActivePercent)
        self.refinedActivePercent = SourceAwareAudioWorkbenchSnapshot.double(contributionSummary["activePercent"], fallback: segmentActivePercent)
        self.durationDeltaToMasterSeconds = SourceAwareAudioWorkbenchSnapshot.double(stem?["durationDeltaToMasterSeconds"])
        self.windows = (json["windows"] as? [[String: Any]] ?? []).compactMap(SourceAwareAudioWindowSnapshot.init(json:))
    }

    var activePercent: Double {
        guard windowCount > 0 else { return 0 }
        return Double(activeWindowCount) / Double(windowCount) * 100
    }

    var contributionRetentionPercent: Double {
        guard alignedActiveSeconds > 0 else {
            return refinedActiveSeconds > 0 ? 100 : 0
        }
        return min(max(refinedActiveSeconds / alignedActiveSeconds * 100, 0), 999)
    }

    var tint: Color {
        switch roleId {
        case "master":
            return QuipslyStudioTheme.honey
        case "charlie":
            return QuipslyStudioTheme.creekMist
        case "homer":
            return QuipslyStudioTheme.moss
        case "clip-source":
            return QuipslyStudioTheme.marigold
        default:
            return QuipslyStudioTheme.lichen
        }
    }

    var icon: String {
        switch roleId {
        case "master":
            return "speaker.wave.3.fill"
        case "charlie":
            return "person.wave.2.fill"
        case "homer":
            return "person.crop.circle.fill"
        case "clip-source":
            return "film.stack.fill"
        default:
            return "waveform"
        }
    }

    private static func defaultPurpose(for roleId: String) -> String {
        switch roleId {
        case "master":
            return "Full listener-facing mix for judging the episode experience."
        case "charlie":
            return "Charlie voice, laughs, reactions, and intentional room texture."
        case "homer":
            return "Homer voice, laughs, reactions, and park/room texture after cleanup."
        case "clip-source":
            return "Watched clip/source audio kept synced for edit branches."
        default:
            return "Source-aware audio lane."
        }
    }
}

private struct SourceAwareAudioWindowSnapshot: Identifiable {
    let id: String
    let index: Int
    let startSeconds: Double
    let endSeconds: Double
    let rmsDbfs: Double
    let samplePeakDbfs: Double
    let time: String

    init?(json: [String: Any]) {
        self.index = SourceAwareAudioWorkbenchSnapshot.int(json["index"])
        self.startSeconds = SourceAwareAudioWorkbenchSnapshot.double(json["startSeconds"])
        self.endSeconds = SourceAwareAudioWorkbenchSnapshot.double(json["endSeconds"])
        self.rmsDbfs = SourceAwareAudioWorkbenchSnapshot.double(json["rmsDbfs"], fallback: -96)
        self.samplePeakDbfs = SourceAwareAudioWorkbenchSnapshot.double(json["samplePeakDbfs"], fallback: -96)
        self.time = SourceAwareAudioWorkbenchSnapshot.string(json["time"], fallback: Self.formatTime(startSeconds))
        self.id = "\(index)-\(startSeconds)"
    }

    private static func formatTime(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}

private struct SourceAwareAudioReviewWindowSnapshot: Identifiable {
    let id: String
    let startSeconds: Double
    let endSeconds: Double
    let time: String
    let flags: [String]
    let masterRmsDbfs: Double
    let masterSamplePeakDbfs: Double

    init?(json: [String: Any]) {
        self.startSeconds = SourceAwareAudioWorkbenchSnapshot.double(json["startSeconds"])
        self.endSeconds = SourceAwareAudioWorkbenchSnapshot.double(json["endSeconds"])
        self.time = SourceAwareAudioWorkbenchSnapshot.string(json["time"], fallback: Self.formatTime(startSeconds))
        self.flags = (json["flags"] as? [String]) ?? []
        self.masterRmsDbfs = SourceAwareAudioWorkbenchSnapshot.double(json["masterRmsDbfs"], fallback: -96)
        self.masterSamplePeakDbfs = SourceAwareAudioWorkbenchSnapshot.double(json["masterSamplePeakDbfs"], fallback: -96)
        self.id = "\(time)-\(startSeconds)"
    }

    var flagsText: String {
        flags.isEmpty ? "listen check" : flags.map { $0.replacingOccurrences(of: "-", with: " ") }.joined(separator: ", ")
    }

    private static func formatTime(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded()))
        return String(format: "%02d:%02d", total / 60, total % 60)
    }
}
