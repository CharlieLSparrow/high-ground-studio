import SwiftUI
import QuipslyVideoCore

struct CaptureSourceSyncReviewSheet: View {
    @Environment(\.dismiss) private var dismiss

    let sequence: MediaSequence
    let targetLaneID: UUID
    let reviewerActorID: String
    let reviewerLabel: String
    let onAudition: (Double) -> Void
    let onApprove: (CaptureSourceSyncApprovalInput) -> Void
    let onUndo: (CaptureSourceSyncUndoInput) -> Void

    @State private var operationID = UUID()
    @State private var undoOperationID = UUID()
    @State private var baselineLaneID: UUID?
    @State private var reviewedOffset = ""
    @State private var cueTimeline = ""
    @State private var laterTimeline = ""
    @State private var residualDrift = "0"
    @State private var comparedCue = false
    @State private var comparedLaterDrift = false
    @State private var auditionedAssembly = false
    @State private var approvedPlacement = false
    @State private var notes = ""
    @State private var isSuperseding = false

    private var targetLane: VideoLane? {
        sequence.lanes.first { $0.id == targetLaneID }
    }

    private var targetGroupID: String? {
        targetLane?.metadata?.captureGroupID?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
    }

    private var baselineChoices: [VideoLane] {
        guard let targetGroupID, !targetGroupID.isEmpty else { return [] }
        return sequence.lanes.filter { lane in
            lane.id != targetLaneID
                && lane.sourceVideo != nil
                && lane.metadata?.captureGroupID?
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                    .lowercased() == targetGroupID
        }
        .sorted { left, right in
            let leftAudio = isAudio(left)
            let rightAudio = isAudio(right)
            if leftAudio != rightAudio { return leftAudio }
            return left.name.localizedCaseInsensitiveCompare(right.name)
                == .orderedAscending
        }
    }

    private var activeApproval: CaptureSourceSyncReviewReceipt? {
        targetLane.flatMap(
            CaptureSourceSyncReviewService.activeApproval(for:)
        )
    }

    private var reviewerIsVerified: Bool {
        !reviewerActorID.trimmingCharacters(in: .whitespacesAndNewlines)
            .isEmpty
            && !reviewerLabel.trimmingCharacters(in: .whitespacesAndNewlines)
                .isEmpty
    }

    private var parsedOffset: Double? { finite(reviewedOffset) }
    private var parsedCue: Double? { finite(cueTimeline) }
    private var parsedLater: Double? { finite(laterTimeline) }
    private var parsedDrift: Double? { finite(residualDrift) }

    private var canApprove: Bool {
            reviewerIsVerified
            && (activeApproval == nil || isSuperseding)
            && baselineLaneID != nil
            && parsedOffset.map { $0 >= -86_400 && $0 <= 86_400 } == true
            && parsedCue.map { $0 >= 0 } == true
            && parsedLater.map {
                guard let cue = parsedCue else { return false }
                return $0 > cue && $0 <= 86_400
            } == true
            && parsedDrift.map { abs($0) <= 60_000 } == true
            && comparedCue
            && comparedLaterDrift
            && auditionedAssembly
            && approvedPlacement
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    truthHeader

                    if let activeApproval, !isSuperseding {
                        activeReviewCard(activeApproval)
                    } else {
                        reviewForm
                    }
                }
                .padding(22)
            }
            .frame(minWidth: 560, idealWidth: 640, minHeight: 620)
            .background(QuipslyStudioTheme.studioGradient)
            .navigationTitle("Review source sync")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
            }
        }
        .onAppear(perform: seedDraft)
        .accessibilityIdentifier("quipsly.captureSync.sheet")
    }

    private var truthHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "waveform.path.ecg.rectangle")
                    .font(.title2)
                    .foregroundStyle(QuipslyStudioTheme.honey)
                VStack(alignment: .leading, spacing: 3) {
                    Text(targetLane?.name ?? "Source")
                        .font(.title3)
                        .fontWeight(.black)
                    Text("Align one whole immutable source to the shared episode clock. This changes reversible editor metadata only—never the recording bytes.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }

            if reviewerIsVerified {
                Label("Reviewer: \(reviewerLabel)", systemImage: "person.badge.shield.checkmark")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(QuipslyStudioTheme.moss)
            } else {
                Label("Verify your Quipsly account to record a person review. Authorized agent reviews arrive with their own disclosed evidence.", systemImage: "person.crop.circle.badge.exclamationmark")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(QuipslyStudioTheme.clay)
            }
        }
        .padding(16)
        .background(QuipslyStudioTheme.honey.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(QuipslyStudioTheme.honey.opacity(0.2), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private var reviewForm: some View {
        VStack(alignment: .leading, spacing: 16) {
            if let activeApproval, isSuperseding {
                Label(
                    "This review will supersede \(activeApproval.effectiveReviewerKind.displayName.lowercased()) receipt \(activeApproval.approvedReviewID.uuidString.lowercased()). The earlier receipt remains in history and returns if this review is undone.",
                    systemImage: "arrow.triangle.2.circlepath"
                )
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(QuipslyStudioTheme.honey)
                .fixedSize(horizontal: false, vertical: true)
            }
            VStack(alignment: .leading, spacing: 8) {
                Text("1. Choose the episode spine")
                    .font(.headline)
                    .fontWeight(.black)
                Picker("Baseline source", selection: $baselineLaneID) {
                    Text("Choose a source").tag(UUID?.none)
                    ForEach(baselineChoices) { lane in
                        Text("\(lane.name) · \(isAudio(lane) ? "audio" : "video")")
                            .tag(UUID?.some(lane.id))
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("quipsly.captureSync.baseline")

                Text("Prefer the production microphone master when it carries the episode clock. A camera or room mix can be the baseline only when that is the source you actually reviewed.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()

            VStack(alignment: .leading, spacing: 10) {
                Text("2. Compare the beginning and later drift")
                    .font(.headline)
                    .fontWeight(.black)

                Grid(alignment: .leading, horizontalSpacing: 12, verticalSpacing: 10) {
                    GridRow {
                        Text("Target begins at")
                        TextField("seconds", text: $reviewedOffset)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("quipsly.captureSync.offset")
                        Text("episode seconds")
                            .foregroundStyle(.secondary)
                    }
                    GridRow {
                        Text("First cue")
                        TextField("seconds", text: $cueTimeline)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("quipsly.captureSync.cue")
                        Button("Play assembled cue") {
                            guard let cue = parsedCue else { return }
                            onAudition(cue)
                        }
                        .disabled(parsedCue == nil)
                        .accessibilityIdentifier("quipsly.captureSync.auditionCue")
                    }
                    GridRow {
                        Text("Later check")
                        TextField("seconds", text: $laterTimeline)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("quipsly.captureSync.later")
                        Button("Play later assembly") {
                            guard let later = parsedLater else { return }
                            onAudition(later)
                        }
                        .disabled(parsedLater == nil)
                        .accessibilityIdentifier("quipsly.captureSync.auditionLater")
                    }
                    GridRow {
                        Text("Residual drift")
                        TextField("milliseconds", text: $residualDrift)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("quipsly.captureSync.drift")
                        Text("milliseconds")
                            .foregroundStyle(.secondary)
                    }
                }

                Text("The offset places source time 0 on the episode clock. Residual drift records what remained at the later comparison; it does not silently time-stretch the source.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider()

            VStack(alignment: .leading, spacing: 10) {
                Text("3. Record what you actually checked")
                    .font(.headline)
                    .fontWeight(.black)

                Toggle("I compared a real waveform, clap, word, or visible cue.", isOn: $comparedCue)
                    .accessibilityIdentifier("quipsly.captureSync.checkCue")
                Toggle("I compared a later point for drift.", isOn: $comparedLaterDrift)
                    .accessibilityIdentifier("quipsly.captureSync.checkDrift")
                Toggle("I played the assembled sources, not only isolated files.", isOn: $auditionedAssembly)
                    .accessibilityIdentifier("quipsly.captureSync.checkAssembly")
                Toggle("I approve this placement as the current person-reviewed alignment.", isOn: $approvedPlacement)
                    .accessibilityIdentifier("quipsly.captureSync.checkApproval")

                TextField("Review notes (recommended)", text: $notes, axis: .vertical)
                    .lineLimit(3...7)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("quipsly.captureSync.notes")
            }

            Button {
                approve()
            } label: {
                Label("Save reviewed alignment", systemImage: "checkmark.seal.fill")
                    .fontWeight(.black)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
            }
            .buttonStyle(.borderedProminent)
            .tint(QuipslyStudioTheme.moss)
            .disabled(!canApprove)
            .accessibilityIdentifier("quipsly.captureSync.approve")

            Text("Saving appends a review receipt, changes only the target lane's offset/status, rebuilds assembled playback, and autosaves the working session. It does not upload, transcribe, export, publish, or claim sample accuracy.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(16)
        .background(QuipslyStudioTheme.panelLift.opacity(0.28))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func activeReviewCard(
        _ review: CaptureSourceSyncReviewReceipt
    ) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label(
                review.effectiveReviewerKind == .person
                    ? "Person-reviewed placement"
                    : "Agent-qualified placement",
                systemImage: review.effectiveReviewerKind == .person
                    ? "person.crop.circle.badge.checkmark"
                    : "cpu"
            )
                .font(.headline)
                .fontWeight(.black)
                .foregroundStyle(QuipslyStudioTheme.moss)

            Grid(alignment: .leading, horizontalSpacing: 14, verticalSpacing: 7) {
                reviewRow("Baseline", review.baseline.role)
                reviewRow("Placement", String(format: "%.6f s", review.reviewedTargetOffsetSeconds))
                reviewRow("Compared", String(format: "%.2f s → %.2f s", review.cueTimelineSeconds, review.laterTimelineSeconds))
                reviewRow("Residual drift", String(format: "%.2f ms · %.2f ppm", review.residualDriftMilliseconds, review.observedPartsPerMillion))
                reviewRow("Reviewer", review.reviewerLabel)
                reviewRow("Authority", review.effectiveReviewerKind.displayName)
                reviewRow("Decision basis", (review.decisionBasis ?? .audiovisualInspection).displayName)
                if let delegationScope = review.delegationScope {
                    reviewRow("Delegation", delegationScope)
                }
                if let reviewerToolVersion = review.reviewerToolVersion {
                    reviewRow("Reviewer tool", reviewerToolVersion)
                }
                if let supersedesReviewID = review.supersedesReviewID {
                    reviewRow(
                        "Supersedes",
                        supersedesReviewID.uuidString.lowercased()
                    )
                }
                reviewRow("Receipt", review.approvedReviewID.uuidString.lowercased())
                reviewRow("History", "\(targetLane?.metadata?.syncReviewHistory.count ?? 0) append-only receipts")
            }

            if let evidenceSummary = review.evidenceSummary {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Evidence used")
                        .font(.caption)
                        .fontWeight(.black)
                        .foregroundStyle(.secondary)
                    Text(evidenceSummary)
                        .font(.subheadline)
                        .textSelection(.enabled)
                }
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(QuipslyStudioTheme.honey.opacity(0.07))
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            if let notes = review.notes {
                Text(notes)
                    .font(.subheadline)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(QuipslyStudioTheme.moss.opacity(0.07))
                    .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
            }

            Text(review.truth)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if reviewerIsVerified {
                Button {
                    operationID = UUID()
                    isSuperseding = true
                    seedDraft()
                } label: {
                    Label(
                        review.effectiveReviewerKind == .softwareAgent
                            ? "Review this alignment yourself"
                            : "Create a superseding review",
                        systemImage: "arrow.triangle.2.circlepath"
                    )
                    .fontWeight(.bold)
                }
                .accessibilityIdentifier("quipsly.captureSync.supersede")
            }

            Button(role: .destructive) {
                guard let targetLane,
                      let offset = targetLane.sourceVideo?.offset else { return }
                onUndo(
                    CaptureSourceSyncUndoInput(
                        operationID: undoOperationID,
                        approvedReviewID: review.approvedReviewID,
                        reviewerActorID: reviewerActorID,
                        reviewerLabel: reviewerLabel,
                        targetLaneID: targetLaneID,
                        expectedTargetOffsetSeconds: offset
                    )
                )
                dismiss()
            } label: {
                Label("Undo reviewed placement", systemImage: "arrow.uturn.backward.circle")
                    .fontWeight(.bold)
            }
            .disabled(!reviewerIsVerified)
            .accessibilityIdentifier("quipsly.captureSync.undo")
        }
        .padding(16)
        .background(QuipslyStudioTheme.moss.opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(QuipslyStudioTheme.moss.opacity(0.22), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func reviewRow(_ label: String, _ value: String) -> some View {
        GridRow {
            Text(label)
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(.secondary)
            Text(value)
                .font(.caption.monospacedDigit())
                .textSelection(.enabled)
        }
    }

    private func seedDraft() {
        guard let targetLane, let targetSource = targetLane.sourceVideo else {
            return
        }
        baselineLaneID = baselineLaneID ?? baselineChoices.first?.id
        reviewedOffset = String(format: "%.6f", targetSource.offset)
        let cue = max(0, targetSource.offset)
        let later = min(
            max(cue + 1, sequence.duration - 1),
            cue + max(1, targetSource.duration - 0.5)
        )
        cueTimeline = String(format: "%.3f", cue)
        laterTimeline = String(format: "%.3f", later)
    }

    private func approve() {
        guard canApprove,
              let targetLane,
              let targetSource = targetLane.sourceVideo,
              let baselineLaneID,
              let reviewedOffset = parsedOffset,
              let cueTimeline = parsedCue,
              let laterTimeline = parsedLater,
              let residualDrift = parsedDrift else { return }
        onApprove(
            CaptureSourceSyncApprovalInput(
                operationID: operationID,
                reviewerActorID: reviewerActorID,
                reviewerLabel: reviewerLabel,
                supersedesReviewID: isSuperseding
                    ? activeApproval?.approvedReviewID
                    : nil,
                baselineLaneID: baselineLaneID,
                targetLaneID: targetLaneID,
                expectedTargetOffsetSeconds: targetSource.offset,
                reviewedTargetOffsetSeconds: reviewedOffset,
                cueTimelineSeconds: cueTimeline,
                laterTimelineSeconds: laterTimeline,
                residualDriftMilliseconds: residualDrift,
                checks: CaptureSourceSyncReviewChecks(
                    waveformOrVisibleCueCompared: comparedCue,
                    laterDriftCompared: comparedLaterDrift,
                    assembledPlaybackAuditioned: auditionedAssembly,
                    reviewerPlacementApproved: approvedPlacement
                ),
                notes: notes
            )
        )
        dismiss()
    }

    private func isAudio(_ lane: VideoLane) -> Bool {
        let role = lane.metadata?.role.lowercased() ?? ""
        let kind = lane.metadata?.mediaKind.lowercased() ?? ""
        let ext = lane.sourceVideo?.mediaURL.pathExtension.lowercased() ?? ""
        return role.contains("audio")
            || kind == "audio"
            || ["wav", "aif", "aiff", "mp3", "m4a", "aac", "flac"]
                .contains(ext)
    }

    private func finite(_ value: String) -> Double? {
        let parsed = Double(
            value.trimmingCharacters(in: .whitespacesAndNewlines)
        )
        return parsed?.isFinite == true ? parsed : nil
    }
}
