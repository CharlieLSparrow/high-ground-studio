import SwiftUI

struct CaptureSourceEvidenceView: View {
    let recordingID: UUID

    @StateObject private var library = LocalRecordingLibrary.shared
    @StateObject private var playback = LocalRecordingPlaybackController()
    @State private var evidenceFileURL: URL?
    @State private var isPreparing = false
    @State private var errorMessage: String?
    @State private var comparison: CaptureNestEvidenceComparison?
    @State private var isComparing = false
    @State private var comparisonError: String?
    @State private var comparisonTask: Task<Void, Never>?
    @State private var selectedAudioSeconds = 0.0
    @State private var showsTechnicalAudioDetails = false
    @State private var showsTechnicalSoundDetails = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                if let recording = library.recording(id: recordingID) {
                    explanation
                    identityCard(recording)
                    captureCard(recording)
                    audioSignalCard(recording)
                    audibleEventAnalysisCard(recording)
                    roomCard(recording)
                    cloudCard(recording)
                    nestComparisonCard(recording)
                    evidenceAction(recording)
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
        .navigationTitle("Source evidence")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CaptureSourceEvidenceView")
        .onDisappear {
            playback.stop()
            comparisonTask?.cancel()
            comparisonTask = nil
        }
    }

    private var explanation: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Proof attached to the original", systemImage: "checkmark.shield")
                .font(.title3.weight(.bold))
            Text("Quipsly keeps capture-time device details, room boundaries, local integrity, and verified cloud evidence together without changing the recording.")
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
                    Label("Proof attached to the original", systemImage: "checkmark.shield")
                        .font(.title3.weight(.bold))
                    Text("Preview data demonstrates the review surface only. It never claims that synthetic media was captured or verified.")
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
        .navigationTitle("Source evidence")
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
