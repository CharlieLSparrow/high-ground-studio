import SwiftUI

struct CaptureSourceEvidenceView: View {
    private enum MasteryMonitorMode: String, CaseIterable, Identifiable {
        case fair
        case delivery

        var id: String { rawValue }
        var label: String { self == .fair ? "Fair comparison" : "Final volume" }
        var evidenceValue: String { self == .fair ? "matched" : "delivery" }
    }

    let recordingID: UUID

    @StateObject private var library = LocalRecordingLibrary.shared
    @StateObject private var playback = LocalRecordingPlaybackController()
    @StateObject private var mastery = CaptureAudioMasteryClient()
    @State private var evidenceFileURL: URL?
    @State private var isPreparing = false
    @State private var errorMessage: String?
    @State private var comparison: CaptureNestEvidenceComparison?
    @State private var isComparing = false
    @State private var comparisonError: String?
    @State private var comparisonTask: Task<Void, Never>?
    @State private var selectedAudioSeconds = 0.0
    @State private var masteryMonitorMode = MasteryMonitorMode.fair
    @State private var masteryReviewNote = ""
    @State private var masteryWithdrawalReason = ""
    @State private var showsTechnicalAudioDetails = false
    @State private var showsTechnicalSoundDetails = false
    @State private var showsRecordingDetails = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let recording = library.recording(id: recordingID) {
                    explanation
                    audioSignalCard(recording)
                    audioImprovementCard(recording)
                        .task(id: audioMasteryTaskID(recording)) {
                            await mastery.open(recording: recording)
                        }
                    audibleEventAnalysisCard(recording)
                    DisclosureGroup(
                        "Recording and upload details",
                        isExpanded: $showsRecordingDetails
                    ) {
                        VStack(alignment: .leading, spacing: 16) {
                            identityCard(recording)
                            captureCard(recording)
                            roomCard(recording)
                            cloudCard(recording)
                            nestComparisonCard(recording)
                            evidenceAction(recording)
                        }
                        .padding(.top, 12)
                    }
                    .font(.subheadline.weight(.semibold))
                    .accessibilityIdentifier("CaptureRecordingDetailsDisclosure")
                    .evidenceSurface()
                } else {
                    ContentUnavailableView(
                        "Source unavailable",
                        systemImage: "waveform.badge.exclamationmark",
                        description: Text("This source is not visible in the active account library.")
                    )
                }
            }
            .padding(18)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Recording quality")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CaptureSourceEvidenceView")
        .onReceive(playback.$currentTime) { seconds in
            guard playback.playingRecordingID == recordingID,
                  let recording = library.recording(id: recordingID) else { return }
            mastery.observeSourcePlayback(
                recording: recording,
                at: seconds,
                monitorMode: masteryMonitorMode.evidenceValue
            )
        }
        .onDisappear {
            playback.stop()
            mastery.stop()
            comparisonTask?.cancel()
            comparisonTask = nil
        }
    }

    private var explanation: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Hear the moments that matter", systemImage: "waveform.badge.magnifyingglass")
                .font(.title3.weight(.bold))
            Text("Quipsly checks the complete recording and points you to moments worth hearing. Your original stays unchanged, and technical proof is available below when you need it.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func identityCard(_ recording: LocalRecording) -> some View {
        evidenceCard(title: "Source identity", systemImage: "fingerprint") {
            EvidenceRow(label: "Source ID", value: recording.id.uuidString.lowercased())
            EvidenceRow(label: "Group ID", value: recording.captureGroupId?.uuidString.lowercased() ?? "Not grouped")
            EvidenceRow(label: "Kind", value: recording.effectiveMediaKind.rawValue.capitalized)
            EvidenceRow(label: "Started", value: recording.startedAt.formatted(date: .abbreviated, time: .standard))
            EvidenceRow(label: "Duration", value: durationLabel(recording.durationSeconds))
            EvidenceRow(
                label: "Local bytes",
                value: ByteCountFormatter.string(fromByteCount: recording.byteCount, countStyle: .file)
            )
        }
    }

    private func captureCard(_ recording: LocalRecording) -> some View {
        evidenceCard(title: "Captured with", systemImage: "iphone.gen3") {
            EvidenceRow(label: "App", value: appLabel(recording.sourceProfile))
            EvidenceRow(label: "Device", value: deviceLabel(recording.sourceProfile))
            EvidenceRow(label: "Audio route", value: routeLabel(recording.sourceProfile))
            EvidenceRow(
                label: "Input data source",
                value: nonempty(recording.sourceProfile?.audioInputDataSourceName)
                    ?? "Not exposed by this input"
            )
            EvidenceRow(
                label: "Encoded audio",
                value: audioFormatLabel(recording.sourceProfile)
            )
            EvidenceRow(
                label: "Hardware input",
                value: audioHardwareLabel(recording.sourceProfile)
            )
            EvidenceRow(label: "Pipeline", value: nonempty(recording.sourceProfile?.audioCapturePipeline) ?? "Not recorded")
            EvidenceRow(label: "Pause timeline", value: nonempty(recording.sourceProfile?.pauseTimelinePolicy) ?? "Not recorded")
            if recording.effectiveMediaKind == .video {
                EvidenceRow(label: "Camera", value: nonempty(recording.sourceProfile?.cameraPosition)?.capitalized ?? "Not recorded")
                EvidenceRow(
                    label: "Requested video",
                    value: videoQualityLabel(recording.sourceProfile)
                )
                EvidenceRow(
                    label: "Configured video",
                    value: configuredVideoLabel(recording.sourceProfile)
                )
                EvidenceRow(
                    label: "Quality intent",
                    value: videoIntentResult(recording.sourceProfile)
                )
                EvidenceRow(
                    label: "Camera pressure at Start",
                    value: nonempty(
                        recording.sourceProfile?.videoSystemPressureAtStart
                    )?.capitalized ?? "Not preserved"
                )
                EvidenceRow(label: "Recorded media", value: recording.recordedVideoProfileLabel ?? "Awaiting full decode evidence")
            }
        }
    }

    @ViewBuilder
    private func audioSignalCard(_ recording: LocalRecording) -> some View {
        if recording.sourceProfile?.includesAudio == true {
            evidenceCard(title: "Recording quality", systemImage: "waveform.path.ecg") {
                if let signal = recording.sourceProfile?.audioSignal {
                    let reviewMomentCount = signal.observations.count
                        + captureTimelineEvents(recording).count
                    Label(
                        reviewMomentCount == 0
                            ? "No level warnings found"
                            : "\(reviewMomentCount) moment\(reviewMomentCount == 1 ? "" : "s") worth checking",
                        systemImage: reviewMomentCount == 0
                            ? "checkmark.circle.fill"
                            : "waveform.badge.exclamationmark"
                    )
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(reviewMomentCount == 0 ? Color.green : Color.orange)
                    .accessibilityIdentifier("CaptureAudioQualitySummary")
                    Text(reviewMomentCount == 0
                        ? "Quipsly scanned the full decoded recording for clipping, unusual silence, and capture interruptions. Listening is still the final check."
                        : "Tap any marked moment below to hear it in the original. Quipsly never removes or repairs audio without your review.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    GeometryReader { geometry in
                        let points = compactSignalPoints(signal.waveform, maximum: 120)
                        Canvas { context, size in
                            guard !points.isEmpty else { return }
                            let barWidth = max(size.width / CGFloat(points.count), 1)
                            for (index, point) in points.enumerated() {
                                let normalized = max(0.04, min((point.rmsDbfs + 72) / 72, 1))
                                let height = size.height * normalized
                                let rect = CGRect(
                                    x: CGFloat(index) * barWidth,
                                    y: (size.height - height) / 2,
                                    width: max(barWidth - 1, 1),
                                    height: height
                                )
                                let color: Color = point.clippedFrameCount > 0
                                    ? .red
                                    : point.rmsDbfs <= signal.thresholds.nearSilenceDbfs
                                        ? .gray.opacity(0.4)
                                        : .blue
                                context.fill(Path(roundedRect: rect, cornerRadius: 1), with: .color(color))
                            }
                        }
                        .contentShape(Rectangle())
                        .gesture(
                            SpatialTapGesture().onEnded { tap in
                                let fraction = geometry.size.width > 0
                                    ? min(max(tap.location.x / geometry.size.width, 0), 1)
                                    : 0
                                selectedAudioSeconds = signal.durationSeconds * fraction
                                mastery.stop()
                                playback.play(
                                    recording: recording,
                                    library: library,
                                    from: selectedAudioSeconds
                                )
                            }
                        )
                    }
                    .frame(height: 96)
                    .accessibilityElement()
                    .accessibilityLabel("Decoded audio waveform")
                    .accessibilityHint("Use the time slider below to choose an exact position with VoiceOver")

                    HStack {
                        Text("0:00")
                        Spacer()
                        Text("Tap waveform to listen")
                        Spacer()
                        Text(durationLabel(signal.durationSeconds))
                    }
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 8) {
                        Slider(
                            value: $selectedAudioSeconds,
                            in: 0...max(signal.durationSeconds, 0.01)
                        )
                        .accessibilityLabel("Selected playback time")
                        .accessibilityValue(durationLabel(selectedAudioSeconds))
                        Button {
                            mastery.stop()
                            playback.play(
                                recording: recording,
                                library: library,
                                from: selectedAudioSeconds
                            )
                        } label: {
                            Label(
                                "Play from \(durationLabel(selectedAudioSeconds))",
                                systemImage: "play.fill"
                            )
                            .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("CaptureAudioSignalPlaySelected")
                    }

                    DisclosureGroup(
                        "Technical audio details",
                        isExpanded: $showsTechnicalAudioDetails
                    ) {
                        VStack(alignment: .leading, spacing: 10) {
                            HStack(alignment: .top, spacing: 14) {
                                signalMetric("RMS", value: String(format: "%.1f dBFS", signal.rmsDbfs), detail: "Not LUFS")
                                signalMetric("Peak", value: String(format: "%.1f dBFS", signal.samplePeakDbfs), detail: "\(signal.clippedFrameCount) clipped frames")
                            }
                            HStack(alignment: .top, spacing: 14) {
                                signalMetric("Near silent", value: String(format: "%.1f%%", signal.nearSilentFrameFraction * 100), detail: "Decoded frames")
                                signalMetric("Coverage", value: durationLabel(signal.durationSeconds), detail: "\(signal.analyzedFrameCount) frames")
                            }
                            Text("Complete-frame RMS and sample-peak observations. A possible dropout is only a listening candidate, never a claim that audio was lost.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(.top, 8)
                    }
                    .font(.caption.weight(.semibold))
                    .accessibilityIdentifier("CaptureAudioTechnicalDetails")

                    ForEach(Array(signal.observations.enumerated()), id: \.offset) { _, observation in
                        Button {
                            playEvent(
                                recording,
                                startSeconds: observation.startSeconds,
                                endSeconds: observation.endSeconds
                            )
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(durationLabel(observation.startSeconds)) · \(humanizedSignalKind(observation.kind))")
                                    .font(.caption.weight(.bold))
                                Text(observation.detail)
                                    .font(.caption)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                    }

                    ForEach(Array(captureTimelineEvents(recording).enumerated()), id: \.offset) { _, event in
                        Button {
                            playEvent(
                                recording,
                                startSeconds: event.startSeconds,
                                endSeconds: event.startSeconds + 1
                            )
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                Text("\(durationLabel(event.startSeconds)) · \(humanizedSignalKind(event.kind))")
                                    .font(.caption.weight(.bold))
                                Text(event.detail)
                                    .font(.caption)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                    }

                    if signal.observations.isEmpty && captureTimelineEvents(recording).isEmpty {
                        Label("No configured signal observation or capture boundary needs attention.", systemImage: "checkmark.circle")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.green)
                    }
                    if playback.playingRecordingID == recording.id {
                        Label("Playing this local original", systemImage: "speaker.wave.2.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.blue)
                    }
                    if let error = playback.errorMessage {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                } else {
                    Text("This source does not yet have a complete decoded signal scan. Quipsly will not infer loudness, clipping, silence, or dropout from transcript confidence.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    @ViewBuilder
    private func audioImprovementCard(_ recording: LocalRecording) -> some View {
        if recording.sourceProfile?.includesAudio == true {
            evidenceCard(title: "Improved audio", systemImage: "wand.and.sparkles") {
                if recording.projectSlug == nil
                    || recording.uploadedMediaAssetId == nil
                    || recording.uploadedSourceId == nil {
                    Label("Available after secure upload", systemImage: "icloud.and.arrow.up")
                        .font(.subheadline.weight(.bold))
                    Text("Once this recording reaches Nest, Quipsly can prepare a balanced listening copy automatically. The original always stays unchanged.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if mastery.isLoading && mastery.snapshot == nil {
                    HStack(spacing: 10) {
                        ProgressView()
                        Text("Checking the whole recording…")
                            .font(.subheadline.weight(.semibold))
                    }
                    Text("You can leave this screen. Quipsly keeps the original untouched while it checks the audio.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if let status = mastery.snapshot {
                    switch status.status {
                    case "queued", "processing", "output-ready":
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Preparing improved copy…")
                                .font(.subheadline.weight(.bold))
                        }
                        Text("Quipsly is balancing the complete recording. Your original is safe and still available above.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    case "completed" where status.derivative?.playbackUrl != nil:
                        Label("Improved copy ready", systemImage: "checkmark.circle.fill")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.green)
                            .accessibilityIdentifier("CaptureAudioMasteryReady")
                        Text("Compare the original and improved copy from the same selected time. This is a separate preview; your original has not been replaced.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if let source = status.sourceMeasurement,
                           let improved = status.derivative?.measured {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack(alignment: .top, spacing: 12) {
                                    signalMetric(
                                        "Original",
                                        value: String(format: "%.1f LUFS", source.integratedLufs),
                                        detail: String(format: "Peak %.1f dBTP · range %.1f LU", source.truePeakDbtp, source.loudnessRangeLu)
                                    )
                                    signalMetric(
                                        "Improved",
                                        value: String(format: "%.1f LUFS", improved.integratedLufs),
                                        detail: String(format: "Peak %.1f dBTP · range %.1f LU", improved.truePeakDbtp, improved.loudnessRangeLu)
                                    )
                                }
                                if let profile = status.proposal?.profile {
                                    Text(String(format: "Target: %@ · %.1f LUFS · no higher than %.1f dBTP true peak.", profile.label, profile.integratedLufs, profile.maximumTruePeakDbtp))
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                        .accessibilityIdentifier("CaptureAudioMasteryTarget")
                                }
                                Text("Comparison starts at \(durationLabel(selectedAudioSeconds)). These are complete-decode measurements; listening remains the approval step.")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                Picker("Comparison volume", selection: $masteryMonitorMode) {
                                    ForEach(MasteryMonitorMode.allCases) { mode in
                                        Text(mode.label).tag(mode)
                                    }
                                }
                                .pickerStyle(.segmented)
                                .accessibilityIdentifier("CaptureAudioMasteryMonitorMode")
                                .onChange(of: masteryMonitorMode) { _, _ in
                                    mastery.setPreviewVolume(
                                        masteryPreviewVolume(status),
                                        monitorMode: masteryMonitorMode.evidenceValue
                                    )
                                    playback.setVolume(masterySourceVolume(status))
                                }
                                Text(masteryMonitorExplanation(source: source, improved: improved))
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                                    .accessibilityIdentifier("CaptureAudioMasteryMonitorExplanation")
                            }
                            .accessibilityIdentifier("CaptureAudioMasteryMeasurements")
                        }
                        HStack(spacing: 10) {
                            Button {
                                mastery.stop()
                                if playback.playingRecordingID == recording.id {
                                    playback.stop()
                                } else {
                                    playback.play(
                                        recording: recording,
                                        library: library,
                                        from: selectedAudioSeconds,
                                        volume: masterySourceVolume(status)
                                    )
                                }
                            } label: {
                                Label(
                                    playback.playingRecordingID == recording.id ? "Stop original" : "Play original",
                                    systemImage: playback.playingRecordingID == recording.id ? "stop.fill" : "play.fill"
                                )
                                .frame(maxWidth: .infinity, minHeight: 44)
                            }
                            .buttonStyle(.bordered)
                            .accessibilityIdentifier("CaptureAudioMasteryPlayOriginal")

                            Button {
                                playback.stop()
                                Task {
                                    await mastery.togglePreview(
                                        recording: recording,
                                        from: selectedAudioSeconds,
                                        volume: masteryPreviewVolume(status),
                                        monitorMode: masteryMonitorMode.evidenceValue
                                    )
                                }
                            } label: {
                                HStack {
                                    if mastery.isLoading { ProgressView() }
                                    Label(
                                        mastery.isPlaying ? "Stop improved" : "Play improved",
                                        systemImage: mastery.isPlaying ? "stop.fill" : "play.fill"
                                    )
                                }
                                .frame(maxWidth: .infinity, minHeight: 44)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(mastery.isLoading)
                            .accessibilityIdentifier("CaptureAudioMasteryPlay")
                        }
                        masteryReviewSection(recording: recording, status: status)
                    case "completed":
                        Label("This recording is already balanced", systemImage: "checkmark.circle.fill")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.green)
                        Text("Quipsly checked the complete recording and did not create a louder copy just for the sake of making one.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    case "failed", "blocked":
                        Label("Improved copy was not prepared", systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(.orange)
                        Button("Try again") {
                            Task { await mastery.retry(recording: recording) }
                        }
                        .buttonStyle(.bordered)
                        .disabled(mastery.isLoading)
                        .accessibilityIdentifier("CaptureAudioMasteryRetry")
                    default:
                        Text("Quipsly is checking whether this recording needs an improved listening copy.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                if let notice = mastery.notice {
                    Label(notice, systemImage: "info.circle")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("CaptureAudioMasteryNotice")
                }
            }
            .accessibilityIdentifier("CaptureAudioMasteryCard")
        }
    }

    @ViewBuilder
    private func masteryReviewSection(
        recording: LocalRecording,
        status: CaptureAudioMasterySnapshot
    ) -> some View {
        if let moments = status.reviewPlan?.requiredMoments, !moments.isEmpty {
            let coverage = mastery.reviewCoverage(for: status)
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top) {
                    VStack(alignment: .leading, spacing: 3) {
                        Text("Choose the version you trust")
                            .font(.subheadline.weight(.bold))
                        Text("Hear each suggested moment in both versions. Compare once fairly and once at final volume before approving.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 8)
                    Text(coverage.approvalReady ? "Ready" : "Listening")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(coverage.approvalReady ? .green : .orange)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(.thinMaterial, in: Capsule())
                }

                ForEach(moments) { moment in
                    let sourceDone = coverage.sourceCompletedMomentIDs.contains(moment.id)
                    let previewDone = coverage.previewCompletedMomentIDs.contains(moment.id)
                    VStack(alignment: .leading, spacing: 8) {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(moment.label)
                                    .font(.caption.weight(.bold))
                                Text("\(durationLabel(moment.timeSeconds)) · \(moment.detail)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 8)
                            Image(systemName: sourceDone && previewDone ? "checkmark.circle.fill" : "circle")
                                .foregroundStyle(sourceDone && previewDone ? .green : .secondary)
                        }
                        HStack(spacing: 8) {
                            Button {
                                mastery.stop()
                                playback.play(
                                    recording: recording,
                                    library: library,
                                    from: max(moment.timeSeconds - 1, 0),
                                    volume: masterySourceVolume(status)
                                )
                            } label: {
                                Label(sourceDone ? "Original heard" : "Hear original", systemImage: sourceDone ? "checkmark" : "play.fill")
                                    .frame(maxWidth: .infinity, minHeight: 38)
                            }
                            .buttonStyle(.bordered)

                            Button {
                                playback.stop()
                                Task {
                                    await mastery.togglePreview(
                                        recording: recording,
                                        from: max(moment.timeSeconds - 1, 0),
                                        volume: masteryPreviewVolume(status),
                                        monitorMode: masteryMonitorMode.evidenceValue,
                                        restartIfPlaying: true
                                    )
                                }
                            } label: {
                                Label(previewDone ? "Improved heard" : "Hear improved", systemImage: previewDone ? "checkmark" : "play.fill")
                                    .frame(maxWidth: .infinity, minHeight: 38)
                            }
                            .buttonStyle(.bordered)
                            .disabled(mastery.isLoading)
                        }
                    }
                    .padding(10)
                    .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 12))
                }

                HStack(spacing: 8) {
                    reviewEvidenceBadge("Fair comparison", complete: coverage.matchedMonitorObserved)
                    reviewEvidenceBadge("Final volume", complete: coverage.deliveryMonitorObserved)
                }

                if let latest = status.review?.latest {
                    Label(
                        "Latest decision: \(latest.decision.capitalized) · \(latest.actorEmail)",
                        systemImage: latest.decision == "approved" ? "checkmark.seal.fill" : "arrow.uturn.backward.circle.fill"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(latest.decision == "approved" ? .green : .orange)
                    .accessibilityIdentifier("CaptureAudioMasteryLatestDecision")
                }

                TextField("Optional approval note; required when rejecting", text: $masteryReviewNote, axis: .vertical)
                    .lineLimit(2...5)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CaptureAudioMasteryReviewNote")

                HStack(spacing: 10) {
                    Button("Reject improved") {
                        Task {
                            await mastery.saveReview(
                                recording: recording,
                                decision: "rejected",
                                note: masteryReviewNote
                            )
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(
                        mastery.isReviewing
                            || mastery.previewListenedSecondBins.isEmpty
                            || masteryReviewNote.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                    )
                    .accessibilityIdentifier("CaptureAudioMasteryReject")

                    Button("Approve improved") {
                        Task {
                            await mastery.saveReview(
                                recording: recording,
                                decision: "approved",
                                note: masteryReviewNote
                            )
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(mastery.isReviewing || !coverage.approvalReady)
                    .accessibilityIdentifier("CaptureAudioMasteryApprove")
                }

                Text("Quipsly records player progress to support your choice; it cannot prove attention or audibility. Approval creates a review receipt only—it never replaces the original or publishes anything.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                masteryPromotionSection(recording: recording, status: status)
            }
            .padding(.top, 8)
            .accessibilityIdentifier("CaptureAudioMasteryReview")
        }
    }

    @ViewBuilder
    private func masteryPromotionSection(
        recording: LocalRecording,
        status: CaptureAudioMasterySnapshot
    ) -> some View {
        let activePromotion = status.promotion?.activePromotion
        let thisPreviewIsActive = activePromotion?.jobId == status.jobId
        let promotionIsHeld = status.promotion?.holdReason != nil
        VStack(alignment: .leading, spacing: 10) {
            Divider()
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Delivery version")
                        .font(.subheadline.weight(.bold))
                    Text("Selecting a version records which approved audio should be used later. It does not encode, share, or publish anything.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Text(promotionIsHeld ? "Held after review" : activePromotion == nil ? "Not selected" : thisPreviewIsActive ? "Improved selected" : "Earlier pass selected")
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(promotionIsHeld ? Color.orange : activePromotion == nil ? Color.gray : thisPreviewIsActive ? Color.green : Color.orange)
            }

            if promotionIsHeld {
                Label(
                    "The prior delivery selection is held because the latest listening decision no longer approves it.",
                    systemImage: "exclamationmark.shield.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
                .accessibilityIdentifier("CaptureAudioMasteryPromotionHeld")
                if let latest = status.review?.latest,
                   latest.decision == "approved",
                   latest.jobId == status.jobId {
                    Button("Use newly approved version for delivery") {
                        Task {
                            await mastery.changePromotion(
                                recording: recording,
                                operation: "promote",
                                reason: nil
                            )
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(mastery.isPromoting)
                    .accessibilityIdentifier("CaptureAudioMasteryPromote")
                }
            } else if let activePromotion {
                Label(
                    thisPreviewIsActive
                        ? "This improved copy is the active delivery candidate."
                        : "An earlier approved improvement is still the active delivery candidate.",
                    systemImage: "checkmark.seal.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(thisPreviewIsActive ? .green : .orange)
                .accessibilityIdentifier("CaptureAudioMasteryActivePromotion")

                TextField("Why are you changing back?", text: $masteryWithdrawalReason, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CaptureAudioMasteryWithdrawalReason")

                Button(thisPreviewIsActive ? "Stop using improved for delivery" : "Withdraw earlier delivery version") {
                    Task {
                        await mastery.changePromotion(
                            recording: recording,
                            operation: "withdraw",
                            reason: masteryWithdrawalReason
                        )
                    }
                }
                .buttonStyle(.bordered)
                .disabled(
                    mastery.isPromoting
                        || masteryWithdrawalReason.trimmingCharacters(in: .whitespacesAndNewlines).count < 3
                )
                .accessibilityIdentifier("CaptureAudioMasteryWithdraw")
            } else if let latest = status.review?.latest,
                      latest.decision == "approved",
                      latest.jobId == status.jobId {
                Button("Use improved for delivery") {
                    Task {
                        await mastery.changePromotion(
                            recording: recording,
                            operation: "promote",
                            reason: nil
                        )
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(mastery.isPromoting)
                .accessibilityIdentifier("CaptureAudioMasteryPromote")
            } else {
                Text("Approve this exact improved copy before selecting it for delivery.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Text("Your original remains source truth. Candidate selection is append-only and reversible, and every change is retained with the responsible account.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .accessibilityIdentifier("CaptureAudioMasteryPromotion")
    }

    @ViewBuilder
    private func audibleEventAnalysisCard(_ recording: LocalRecording) -> some View {
        if recording.sourceProfile?.includesAudio == true,
           let analysis = recording.sourceProfile?.audibleEventAnalysis {
            evidenceCard(title: "Sounds to review", systemImage: "waveform.badge.magnifyingglass") {
                if analysis.status == "completed" {
                    HStack(alignment: .top, spacing: 14) {
                        signalMetric(
                            "Suggestions",
                            value: "\(analysis.suggestions.count)",
                            detail: "Need listening"
                        )
                        signalMetric(
                            "Coverage",
                            value: durationLabel(analysis.durationSeconds),
                            detail: "\(analysis.resultWindowCount) windows"
                        )
                    }
                    Text("These are unqualified navigation suggestions. A score is not proof that an event is audible, distracting, or safe to edit, and Apple’s general classifier does not identify Quipsly mouth-click or plosive repair candidates.")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    DisclosureGroup(
                        "Technical sound-detection details",
                        isExpanded: $showsTechnicalSoundDetails
                    ) {
                        VStack(alignment: .leading, spacing: 8) {
                            EvidenceRow(
                                label: "Detector",
                                value: "Apple general sound classifier · \(String(format: "%.2f", analysis.effectiveWindowDurationSeconds)) s · \(Int((analysis.overlapFactor * 100).rounded()))% overlap"
                            )
                            EvidenceRow(
                                label: "Receipt",
                                value: analysis.analysisId
                            )
                            EvidenceRow(
                                label: "Source binding",
                                value: analysis.sourceSHA256 ?? "Unavailable"
                            )
                        }
                        .padding(.top, 8)
                    }
                    .font(.caption.weight(.semibold))
                    .accessibilityIdentifier("CaptureSoundDetectionTechnicalDetails")

                    ForEach(analysis.suggestions.prefix(30), id: \.eventId) { suggestion in
                        Button {
                            playEvent(
                                recording,
                                startSeconds: suggestion.startSeconds,
                                endSeconds: suggestion.endSeconds
                            )
                        } label: {
                            VStack(alignment: .leading, spacing: 3) {
                                HStack {
                                    Text("\(durationLabel(suggestion.startSeconds)) · \(suggestion.displayLabel)")
                                        .font(.caption.weight(.bold))
                                    Spacer()
                                    Text("\(Int((suggestion.confidence * 100).rounded()))% score")
                                        .font(.caption2.monospacedDigit().weight(.bold))
                                        .foregroundStyle(.secondary)
                                }
                                Text("\(suggestion.family.capitalized) · \(suggestion.detail)")
                                    .font(.caption)
                                    .multilineTextAlignment(.leading)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                    }

                    if analysis.suggestions.count > 30 {
                        Text("Showing the first 30 of \(analysis.suggestions.count) suggestions. The portable receipt preserves the complete bounded set.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    } else if analysis.suggestions.isEmpty {
                        Label(
                            "No selected classifier label crossed its review threshold. This is not proof that the recording contains no notable sounds.",
                            systemImage: "checkmark.circle"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    }
                } else {
                    Label(
                        analysis.failureDetail ?? "Audible-event analysis did not complete.",
                        systemImage: "exclamationmark.triangle.fill"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    EvidenceRow(
                        label: "Failure receipt",
                        value: analysis.failureCode ?? "analysis-incomplete"
                    )
                    Text("The original remains validated independently. Playback and upload are not held by this optional classifier layer.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    private func roomCard(_ recording: LocalRecording) -> some View {
        let roomRequired = nonempty(recording.callRoomId) != nil
        let complete = !roomRequired
            || (recording.roomStartReceiptId != nil && recording.roomStopReceiptId != nil)
        return evidenceCard(title: "Room boundary", systemImage: complete ? "lock.shield.fill" : "exclamationmark.shield") {
            EvidenceRow(label: "Room", value: nonempty(recording.callRoomId) ?? "Standalone capture")
            EvidenceRow(label: "START receipt", value: recording.roomStartReceiptId?.uuidString.lowercased() ?? (roomRequired ? "Missing" : "Not required"))
            EvidenceRow(label: "STOP receipt", value: recording.roomStopReceiptId?.uuidString.lowercased() ?? (roomRequired ? "Missing" : "Not required"))
            Label(
                complete ? "Complete capture boundary" : "Boundary evidence needs attention",
                systemImage: complete ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
            )
            .font(.caption.weight(.semibold))
            .foregroundStyle(complete ? .green : .orange)
            .accessibilityIdentifier("CaptureSourceEvidenceRoomBoundaryStatus")
        }
    }

    private func cloudCard(_ recording: LocalRecording) -> some View {
        let claimsVerified =
            nonempty(recording.serverVerificationStatus)?.lowercased() == "verified"
        let hasCompleteStoredProof =
            claimsVerified
            && nonempty(recording.verifiedCloudSHA256) != nil
            && recording.verifiedCloudSizeBytes != nil
            && nonempty(recording.verifiedCloudGeneration) != nil
            && recording.verifiedCloudAt != nil
        let statusLabel = hasCompleteStoredProof
            ? "Server verified · local comparison ready"
            : claimsVerified
                ? "Verified claim · proof incomplete"
                : nonempty(recording.serverVerificationStatus)?.capitalized
                    ?? "Not verified"
        return evidenceCard(
            title: "Cloud copy",
            systemImage: hasCompleteStoredProof ? "checkmark.icloud.fill" : "icloud"
        ) {
            EvidenceRow(label: "Status", value: statusLabel)
            EvidenceRow(label: "Source record", value: nonempty(recording.uploadedSourceId) ?? "Not assigned")
            EvidenceRow(label: "Media asset", value: nonempty(recording.uploadedMediaAssetId) ?? "Not assigned")
            EvidenceRow(label: "Transcript job", value: nonempty(recording.transcriptJobId) ?? "Not assigned")
            EvidenceRow(label: "Verified hash", value: shortenedDigest(recording.verifiedCloudSHA256))
            EvidenceRow(
                label: "Verified bytes",
                value: recording.verifiedCloudSizeBytes.map {
                    ByteCountFormatter.string(fromByteCount: $0, countStyle: .file)
                } ?? "Not verified"
            )
            EvidenceRow(label: "Generation", value: nonempty(recording.verifiedCloudGeneration) ?? "Not verified")
            if let verifiedAt = recording.verifiedCloudAt {
                EvidenceRow(label: "Verified at", value: verifiedAt.formatted(date: .abbreviated, time: .standard))
            }
        }
    }

    private func evidenceAction(_ recording: LocalRecording) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Portable evidence receipt", systemImage: "doc.badge.gearshape")
                .font(.headline)
            Text("This recomputes SHA-256 from every local source byte, checks that the file stayed unchanged, redacts the account identifier, and writes a protected versioned JSON snapshot.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureSourceEvidenceError")
            }

            if let evidenceFileURL {
                Label("Evidence receipt prepared", systemImage: "checkmark.seal.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.green)
                    .accessibilityIdentifier("CaptureSourceEvidencePrepared")
                ShareLink(item: evidenceFileURL) {
                    Label("Share evidence receipt", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .accessibilityIdentifier("CaptureSourceEvidenceShare")
            } else {
                Button {
                    prepareEvidence()
                } label: {
                    HStack {
                        if isPreparing {
                            ProgressView()
                        }
                        Label(
                            isPreparing ? "Verifying every byte…" : "Verify and prepare receipt",
                            systemImage: isPreparing ? "hourglass" : "checkmark.shield"
                        )
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(isPreparing || !recording.status.isPlaybackEligible)
                .accessibilityIdentifier("CaptureSourceEvidencePrepare")
            }
        }
        .evidenceSurface()
    }

    private func nestComparisonCard(_ recording: LocalRecording) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Independent Nest comparison", systemImage: comparisonIcon)
                .font(.headline)
            Text("Quipsly re-hashes every local source byte, then privately reads Nest’s independent Session receipt. The check never uploads, edits, releases, transcribes, or deletes anything.")
                .font(.caption)
                .foregroundStyle(.secondary)

            if let comparison {
                Label(comparisonStatusLabel(comparison.status), systemImage: comparisonIcon)
                    .font(.subheadline.weight(.bold))
                    .foregroundStyle(comparisonColor(comparison.status))
                    .accessibilityIdentifier("CaptureNestEvidenceStatus")
                EvidenceRow(
                    label: "Local SHA-256",
                    value: shortenedDigest(comparison.localSHA256)
                )
                EvidenceRow(
                    label: "Nest SHA-256",
                    value: shortenedDigest(comparison.nestSHA256)
                )
                EvidenceRow(
                    label: "Exact bytes",
                    value: "\(comparison.localByteCount)"
                )
                EvidenceRow(
                    label: "RecordingAsset",
                    value: comparison.recordingAssetID ?? "Not assigned"
                )
                EvidenceRow(
                    label: "Cloud generation",
                    value: comparison.nestGeneration ?? "Not verified"
                )
                EvidenceRow(
                    label: "Nest receipt",
                    value: comparison.nestGeneratedAt.formatted(
                        date: .abbreviated,
                        time: .standard
                    )
                )
                if let disposition = nonempty(comparison.processingDisposition) {
                    EvidenceRow(label: "Processing", value: disposition)
                }
                if let disposition = nonempty(comparison.transcriptDisposition) {
                    EvidenceRow(label: "Transcript", value: disposition)
                }
                if !comparison.issues.isEmpty {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Needs attention")
                            .font(.caption.weight(.semibold))
                        ForEach(
                            Array(comparison.issues.enumerated()),
                            id: \.offset
                        ) { _, issue in
                            Label(issue, systemImage: "exclamationmark.triangle")
                                .font(.caption)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }
                    .foregroundStyle(comparisonColor(comparison.status))
                    .accessibilityIdentifier("CaptureNestEvidenceIssues")
                }
            }

            if let comparisonError {
                Label(comparisonError, systemImage: "wifi.exclamationmark")
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureNestEvidenceError")
            }

            Button {
                compareWithNest()
            } label: {
                HStack {
                    if isComparing {
                        ProgressView()
                    }
                    Label(
                        isComparing
                            ? "Hashing and checking…"
                            : comparison == nil
                                ? "Compare with Nest"
                                : "Check again",
                        systemImage: isComparing
                            ? "hourglass"
                            : "arrow.triangle.2.circlepath"
                    )
                }
                .frame(maxWidth: .infinity, minHeight: 44)
            }
            .buttonStyle(.bordered)
            .disabled(
                isComparing
                    || nonempty(recording.callRoomId) == nil
                    || !recording.status.isPlaybackEligible
            )
            .accessibilityIdentifier("CaptureNestEvidenceCompare")

            if nonempty(recording.callRoomId) == nil {
                Text("Standalone sources have no Nest Session receipt.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .evidenceSurface()
    }

    private var comparisonIcon: String {
        guard let status = comparison?.status else {
            return "arrow.triangle.2.circlepath.icloud"
        }
        switch status {
        case .verifiedMatch:
            return "checkmark.seal.fill"
        case .held:
            return "pause.circle.fill"
        case .drift:
            return "exclamationmark.octagon.fill"
        case .incomplete:
            return "clock.badge.exclamationmark"
        }
    }

    private func comparisonStatusLabel(
        _ status: CaptureNestEvidenceStatus
    ) -> String {
        switch status {
        case .verifiedMatch:
            return "Exact local and Nest source match"
        case .held:
            return "Exact bytes preserved · processing held"
        case .drift:
            return "Source evidence drift detected"
        case .incomplete:
            return "Nest evidence is not complete yet"
        }
    }

    private func comparisonColor(
        _ status: CaptureNestEvidenceStatus
    ) -> Color {
        switch status {
        case .verifiedMatch:
            return .green
        case .held, .incomplete:
            return .orange
        case .drift:
            return .red
        }
    }

    private func compareWithNest() {
        comparisonTask?.cancel()
        comparison = nil
        comparisonError = nil
        isComparing = true
        comparisonTask = Task {
            do {
                let result = try await CaptureNestSourceEvidenceClient.compare(
                    recordingID: recordingID,
                    library: library
                )
                try Task.checkCancellation()
                comparison = result
            } catch is CancellationError {
                return
            } catch {
                comparisonError = error.localizedDescription
            }
            isComparing = false
            comparisonTask = nil
        }
    }

    private func prepareEvidence() {
        isPreparing = true
        errorMessage = nil
        Task {
            do {
                evidenceFileURL = try await CaptureSourceEvidenceExporter.prepare(
                    recordingID: recordingID,
                    library: library
                )
            } catch {
                errorMessage = error.localizedDescription
            }
            isPreparing = false
        }
    }

    private func evidenceCard<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content()
        }
        .evidenceSurface()
    }

    private func appLabel(_ profile: LocalRecordingSourceProfile?) -> String {
        let version = nonempty(profile?.captureAppVersion) ?? "unknown"
        let build = nonempty(profile?.captureAppBuild) ?? "unknown"
        return "Quipsly Capture \(version) (\(build))"
    }

    private func deviceLabel(_ profile: LocalRecordingSourceProfile?) -> String {
        let label = [
            nonempty(profile?.deviceModelIdentifier),
            nonempty(profile?.deviceSystemName),
            nonempty(profile?.deviceSystemVersion),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
        return nonempty(label) ?? "Not recorded"
    }

    private func routeLabel(_ profile: LocalRecordingSourceProfile?) -> String {
        let label = [
            nonempty(profile?.audioRouteName),
            nonempty(profile?.audioRoutePortType),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
        return nonempty(label) ?? "No captured audio route"
    }

    private func audioFormatLabel(_ profile: LocalRecordingSourceProfile?) -> String {
        guard profile?.includesAudio == true else { return "No encoded audio track claimed" }
        let recorded = profile?.recordedMedia
        let sampleRate = recorded?.audioSampleRate ?? profile?.audioSampleRate
        let channels = recorded?.audioChannelCount ?? profile?.audioChannelCount
        let trackCount = recorded?.audioTrackCount
        let pieces = [
            nonempty(profile?.codec)?.uppercased(),
            sampleRate.map { "\(Int($0.rounded())) Hz" },
            channels.map { "\($0) channel\($0 == 1 ? "" : "s")" },
            trackCount.map { "\($0) decoded track\($0 == 1 ? "" : "s")" },
        ].compactMap { $0 }
        return pieces.isEmpty ? "Audio format not recorded" : pieces.joined(separator: " · ")
    }

    private func audioHardwareLabel(_ profile: LocalRecordingSourceProfile?) -> String {
        let pieces = [
            profile?.audioHardwareSampleRate.map { "\(Int($0.rounded())) Hz" },
            profile?.audioHardwareInputChannelCount.map {
                "\($0) input channel\($0 == 1 ? "" : "s")"
            },
        ].compactMap { $0 }
        return pieces.isEmpty ? "Not measured by this capture build" : pieces.joined(separator: " · ")
    }

    private func videoQualityLabel(
        _ profile: LocalRecordingSourceProfile?
    ) -> String {
        switch profile?.requestedVideoQuality {
        case "production-4k-24": "4K · 24 fps"
        case "production-4k-30": "4K · 30 fps"
        case "endurance-1080p-24": "1080p · 24 fps endurance"
        case let value?: humanizedSignalKind(value)
        case nil: "Not preserved"
        }
    }

    private func configuredVideoLabel(
        _ profile: LocalRecordingSourceProfile?
    ) -> String {
        let dimensions: String? = if let width = profile?.width,
                                     let height = profile?.height {
            "\(width)×\(height)"
        } else {
            nil
        }
        let pieces = [
            dimensions,
            profile?.nominalFrameRate.map {
                "\(Int($0.rounded())) fps"
            },
            nonempty(profile?.codec)?.uppercased(),
            nonempty(profile?.colorSpace),
        ].compactMap { $0 }
        return pieces.isEmpty
            ? "Not preserved"
            : pieces.joined(separator: " · ")
    }

    private func videoIntentResult(
        _ profile: LocalRecordingSourceProfile?
    ) -> String {
        switch profile?.videoQualityIntentFulfilled {
        case true: "Resolved exactly"
        case false: "Intent not fulfilled · compare configured and recorded evidence"
        case nil: "Not preserved by this capture build"
        }
    }

    private func signalMetric(
        _ label: String,
        value: String,
        detail: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
            Text(value)
                .font(.headline.monospacedDigit())
            Text(detail)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func compactSignalPoints(
        _ points: [LocalRecordingAudioSignalWindow],
        maximum: Int
    ) -> [LocalRecordingAudioSignalWindow] {
        guard maximum > 0, points.count > maximum else { return points }
        let groupSize = Int(ceil(Double(points.count) / Double(maximum)))
        return stride(from: 0, to: points.count, by: groupSize).map { index in
            let group = points[index..<min(index + groupSize, points.count)]
            let first = group.first!
            let last = group.last!
            return LocalRecordingAudioSignalWindow(
                startSeconds: first.startSeconds,
                durationSeconds: last.startSeconds + last.durationSeconds
                    - first.startSeconds,
                rmsDbfs: group.map(\.rmsDbfs).max() ?? first.rmsDbfs,
                samplePeakDbfs: group.map(\.samplePeakDbfs).max()
                    ?? first.samplePeakDbfs,
                clippedFrameCount: group.reduce(Int64(0)) {
                    $0 + $1.clippedFrameCount
                }
            )
        }
    }

    private func playEvent(
        _ recording: LocalRecording,
        startSeconds: Double,
        endSeconds: Double
    ) {
        let contextStart = max(0, startSeconds - 1)
        let contextEnd = min(
            recording.durationSeconds,
            max(endSeconds, startSeconds) + 1
        )
        selectedAudioSeconds = startSeconds
        mastery.stop()
        playback.play(
            recording: recording,
            library: library,
            from: contextStart,
            until: contextEnd
        )
    }

    private func captureTimelineEvents(
        _ recording: LocalRecording
    ) -> [CaptureAudioTimelineEvent] {
        guard let json = recording.recordingSegmentsJson,
              let data = json.data(using: .utf8),
              let segments = try? JSONDecoder().decode(
                [RecordingSegment].self,
                from: data
              ) else { return [] }
        let preservesWallClock = recording.sourceProfile?.pauseTimelinePolicy
            == "silence-preserves-wall-clock"
        var cumulativeActiveSeconds = 0.0
        return segments.compactMap { segment in
            cumulativeActiveSeconds += max(segment.durationSeconds ?? 0, 0)
            guard let reason = segment.stopReason,
                  reason != .userStop else { return nil }
            let stoppedAt = segment.stoppedAt.flatMap {
                ISO8601DateFormatter().date(from: $0)
            }
            let offset = preservesWallClock
                ? stoppedAt.map {
                    max(0, $0.timeIntervalSince(recording.startedAt))
                } ?? cumulativeActiveSeconds
                : cumulativeActiveSeconds
            let route = [
                segment.boundaryAudioRouteName,
                segment.boundaryAudioRoutePortType,
            ].compactMap(nonempty).joined(separator: " · ")
            let detail = [
                nonempty(segment.boundaryDetail),
                nonempty(route),
            ].compactMap { $0 }.joined(separator: " · ")
            return CaptureAudioTimelineEvent(
                kind: reason.rawValue,
                startSeconds: offset,
                detail: nonempty(detail) ?? "Boundary preserved without route detail"
            )
        }
    }

    private func humanizedSignalKind(_ value: String) -> String {
        value
            .replacingOccurrences(of: "-", with: " ")
            .capitalized
    }

    private func shortenedDigest(_ value: String?) -> String {
        guard let value = nonempty(value), value.count >= 16 else {
            return "Not verified"
        }
        return "\(value.prefix(10))…\(value.suffix(10))"
    }

    private func durationLabel(_ duration: TimeInterval) -> String {
        let totalSeconds = max(0, Int(duration.rounded()))
        let hours = totalSeconds / 3_600
        let minutes = (totalSeconds % 3_600) / 60
        let seconds = totalSeconds % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%d:%02d", minutes, seconds)
    }

    private func audioMasteryTaskID(_ recording: LocalRecording) -> String {
        [
            recording.id.uuidString.lowercased(),
            recording.ownerAccountID ?? "",
            recording.projectSlug ?? "",
            recording.uploadedMediaAssetId ?? "",
            recording.uploadedSourceId ?? "",
        ].joined(separator: "|")
    }

    private func masteryPreviewVolume(_ status: CaptureAudioMasterySnapshot) -> Float {
        guard masteryMonitorMode == .fair,
              let source = status.sourceMeasurement,
              let improved = status.derivative?.measured else { return 1 }
        let decibelDelta = min(source.integratedLufs - improved.integratedLufs, 0)
        return Float(pow(10, decibelDelta / 20))
    }

    private func masterySourceVolume(_ status: CaptureAudioMasterySnapshot) -> Float {
        guard masteryMonitorMode == .fair,
              let source = status.sourceMeasurement,
              let improved = status.derivative?.measured else { return 1 }
        let decibelDelta = min(improved.integratedLufs - source.integratedLufs, 0)
        return Float(pow(10, decibelDelta / 20))
    }

    private func masteryMonitorExplanation(
        source: CaptureAudioMasterySnapshot.Measurement,
        improved: CaptureAudioMasterySnapshot.Measurement
    ) -> String {
        guard masteryMonitorMode == .fair else {
            return "Final volume plays both versions at their verified levels."
        }
        let delta = improved.integratedLufs - source.integratedLufs
        if abs(delta) < 0.05 {
            return "Fair comparison uses the same monitor level because both versions have the same measured integrated loudness."
        }
        return String(
            format: "Fair comparison lowers the %@ version by %.1f dB. Only listening volume changes; neither file is modified.",
            delta > 0 ? "improved" : "original",
            abs(delta)
        )
    }

    private func reviewEvidenceBadge(_ label: String, complete: Bool) -> some View {
        Label(label, systemImage: complete ? "checkmark.circle.fill" : "circle")
            .font(.caption2.weight(.semibold))
            .foregroundStyle(complete ? .green : .secondary)
            .frame(maxWidth: .infinity, minHeight: 34)
            .background(Color(uiColor: .secondarySystemGroupedBackground), in: RoundedRectangle(cornerRadius: 10))
    }

    private func nonempty(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }
}

private struct CaptureAudioTimelineEvent {
    let kind: String
    let startSeconds: Double
    let detail: String
}

private struct EvidenceRow: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.subheadline.monospaced())
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(label), \(value)")
    }
}

private extension View {
    func evidenceSurface() -> some View {
        padding(16)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color(uiColor: .secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 18, style: .continuous)
                    .stroke(Color.primary.opacity(0.06), lineWidth: 1)
            }
    }
}

struct CaptureSourceEvidencePreviewView: View {
    @State private var showsTechnicalAudioDetails = false
    @State private var showsTechnicalSoundDetails = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Hear the moments that matter", systemImage: "waveform.badge.magnifyingglass")
                        .font(.title3.weight(.bold))
                    Text("Preview data demonstrates how Quipsly points to moments worth hearing. It never claims that synthetic media was captured or verified.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                previewCard(title: "Source identity", systemImage: "fingerprint") {
                    EvidenceRow(label: "Source ID", value: "preview-source")
                    EvidenceRow(label: "Group ID", value: "preview-capture-group")
                    EvidenceRow(label: "Kind", value: "Audio")
                    EvidenceRow(label: "Local bytes", value: "18.4 MB")
                }

                previewCard(title: "Captured with", systemImage: "iphone.gen3") {
                    EvidenceRow(label: "App", value: "Quipsly Capture preview")
                    EvidenceRow(label: "Device", value: "iPhone · iOS preview")
                    EvidenceRow(label: "Audio route", value: "Preview microphone · USB audio")
                    EvidenceRow(label: "Input data source", value: "Preview mic input")
                    EvidenceRow(label: "Encoded audio", value: "AAC-LC · 48000 Hz · 1 channel · 1 decoded track")
                    EvidenceRow(label: "Hardware input", value: "48000 Hz · 1 input channel")
                    EvidenceRow(label: "Pipeline", value: "livekit-local-input-pcm")
                    EvidenceRow(label: "Pause timeline", value: "silence-preserves-wall-clock")
                }

                previewCard(title: "Video source truth", systemImage: "video.fill") {
                    EvidenceRow(label: "Requested video", value: "4K · 24 fps")
                    EvidenceRow(label: "Configured video", value: "3840×2160 · 24 fps · HEVC · P3-D65")
                    EvidenceRow(label: "Quality intent", value: "Resolved exactly")
                    EvidenceRow(label: "Camera pressure at Start", value: "Nominal")
                    EvidenceRow(label: "Recorded media", value: "4K · 24 fps · HEVC · video only")
                    Text("Preview values demonstrate the video-evidence vocabulary only. A real source compares capture intent and configured format with complete decoded movie evidence without exposing a camera hardware identifier.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                previewCard(title: "Recording quality", systemImage: "waveform.path.ecg") {
                    Label("1 moment worth checking", systemImage: "waveform.badge.exclamationmark")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("CaptureAudioQualitySummary")
                    Text("Tap a marked moment to hear it in the original. Quipsly never removes or repairs audio without your review.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Label("00:08 · Possible dropout · listen before classifying", systemImage: "play.circle")
                        .font(.caption.weight(.semibold))
                    DisclosureGroup(
                        "Technical audio details",
                        isExpanded: $showsTechnicalAudioDetails
                    ) {
                        VStack(alignment: .leading, spacing: 8) {
                            EvidenceRow(label: "Decoded coverage", value: "100% of preview frames")
                            EvidenceRow(label: "RMS", value: "−18.4 dBFS · not LUFS")
                            EvidenceRow(label: "Sample peak", value: "−1.2 dBFS · 0 clipped frames")
                            EvidenceRow(label: "Near silent", value: "4.2% of decoded frames")
                        }
                        .padding(.top, 8)
                    }
                    .accessibilityIdentifier("CaptureAudioTechnicalDetails")
                    Text("Preview values demonstrate the signal-review vocabulary only. No source was decoded and no audio-health claim was created.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                previewCard(title: "Improved audio", systemImage: "wand.and.sparkles") {
                    Label("Improved copy ready", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.green)
                        .accessibilityIdentifier("CaptureAudioMasteryReady")
                    Text("A real improved copy is downloaded privately, checked against its verified SHA-256 and byte count, and played without replacing the original.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    VStack(alignment: .leading, spacing: 8) {
                        EvidenceRow(label: "Original", value: "−21.8 LUFS · peak −2.1 dBTP · range 8.4 LU")
                        EvidenceRow(label: "Improved", value: "−16.1 LUFS · peak −1.2 dBTP · range 7.9 LU")
                    }
                    .accessibilityIdentifier("CaptureAudioMasteryMeasurements")
                    Text("Target: Apple Podcasts dialogue · −16.0 LUFS · no higher than −1.0 dBTP true peak.")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureAudioMasteryTarget")
                    Picker("Comparison volume", selection: .constant("fair")) {
                        Text("Fair comparison").tag("fair")
                        Text("Final volume").tag("delivery")
                    }
                    .pickerStyle(.segmented)
                    .disabled(true)
                    .accessibilityIdentifier("CaptureAudioMasteryMonitorMode")
                    Text("Fair comparison lowers the improved preview by 5.7 dB to match the original's measured integrated loudness.")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureAudioMasteryMonitorExplanation")
                    HStack(spacing: 10) {
                        Button("Play original") {}
                            .buttonStyle(.bordered)
                            .disabled(true)
                            .accessibilityIdentifier("CaptureAudioMasteryPlayOriginal")
                        Button("Play improved") {}
                            .buttonStyle(.borderedProminent)
                            .disabled(true)
                            .accessibilityIdentifier("CaptureAudioMasteryPlay")
                    }
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Choose the version you trust")
                            .font(.subheadline.weight(.bold))
                        Text("A real review guides you through server-selected moments in both versions and requires fair-comparison plus final-volume listening before approval.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextField("Optional approval note; required when rejecting", text: .constant(""))
                            .textFieldStyle(.roundedBorder)
                            .disabled(true)
                            .accessibilityIdentifier("CaptureAudioMasteryReviewNote")
                        HStack {
                            Button("Reject improved") {}
                                .buttonStyle(.bordered)
                                .disabled(true)
                                .accessibilityIdentifier("CaptureAudioMasteryReject")
                            Button("Approve improved") {}
                                .buttonStyle(.borderedProminent)
                                .disabled(true)
                                .accessibilityIdentifier("CaptureAudioMasteryApprove")
                        }
                        Text("Preview only · no listening receipt created")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityIdentifier("CaptureAudioMasteryReview")
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Delivery version")
                            .font(.subheadline.weight(.bold))
                        Text("A real approved copy can be deliberately selected for later delivery without encoding, sharing, publishing, or replacing the original.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button("Use improved for delivery") {}
                            .buttonStyle(.borderedProminent)
                            .disabled(true)
                            .accessibilityIdentifier("CaptureAudioMasteryPromote")
                        Text("Preview only · no promotion receipt created")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityIdentifier("CaptureAudioMasteryPromotion")
                    Label("Preview only · no audio downloaded", systemImage: "eye")
                        .font(.caption.weight(.semibold))
                        .accessibilityIdentifier("CaptureAudioMasteryPreviewBoundary")
                }

                previewCard(title: "Sounds to review", systemImage: "waveform.badge.magnifyingglass") {
                    EvidenceRow(label: "Suggestion", value: "00:12 · Cough · 86% score")
                    Text("A real suggestion is an unqualified place to listen, not proof that a sound is distracting or safe to edit. Quipsly keeps detector results separate from source integrity and repair decisions.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    DisclosureGroup(
                        "Technical sound-detection details",
                        isExpanded: $showsTechnicalSoundDetails
                    ) {
                        VStack(alignment: .leading, spacing: 8) {
                            EvidenceRow(label: "Detector", value: "Apple general sound classifier · preview vocabulary")
                            EvidenceRow(label: "Source binding", value: "Preview only · no source hash")
                        }
                        .padding(.top, 8)
                    }
                    .accessibilityIdentifier("CaptureSoundDetectionTechnicalDetails")
                    Label(
                        "Preview only · no classifier request or receipt",
                        systemImage: "ear.badge.checkmark"
                    )
                    .font(.caption.weight(.semibold))
                    .accessibilityIdentifier("CaptureAudibleEventPreviewBoundary")
                }

                previewCard(title: "Room boundary", systemImage: "lock.shield.fill") {
                    EvidenceRow(label: "Room", value: "room-preview-coaching-ready")
                    EvidenceRow(label: "START receipt", value: "preview-start-receipt")
                    EvidenceRow(label: "STOP receipt", value: "preview-stop-receipt")
                    Label("Complete capture boundary", systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.green)
                        .accessibilityIdentifier("CaptureSourceEvidenceRoomBoundaryStatus")
                }

                previewCard(title: "Cloud copy", systemImage: "icloud") {
                    EvidenceRow(label: "Status", value: "Not verified")
                    EvidenceRow(label: "Verified hash", value: "Not verified")
                    Text("A real receipt becomes shareable only after Quipsly hashes an actual finalized local source.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                previewCard(
                    title: "Independent Nest comparison",
                    systemImage: "arrow.triangle.2.circlepath.icloud"
                ) {
                    Text("A real comparison re-hashes an actual local source and privately reads its Nest Session receipt. Preview performs neither action.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Label(
                        "Preview only · no network request",
                        systemImage: "eye"
                    )
                    .font(.caption.weight(.semibold))
                    .accessibilityIdentifier("CaptureNestEvidencePreviewBoundary")
                }

                Label(
                    "Preview only · no evidence file created",
                    systemImage: "eye"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("CaptureSourceEvidencePreviewBoundary")
            }
            .padding(18)
        }
        .background(Color(uiColor: .systemGroupedBackground))
        .navigationTitle("Recording quality")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CaptureSourceEvidenceView")
    }

    private func previewCard<Content: View>(
        title: String,
        systemImage: String,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Label(title, systemImage: systemImage)
                .font(.headline)
            content()
        }
        .evidenceSurface()
    }
}
