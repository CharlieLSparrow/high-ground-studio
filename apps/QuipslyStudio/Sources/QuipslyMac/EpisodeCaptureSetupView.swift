import AppKit
import Combine
import QuipslyVideoCore
import SwiftUI

@MainActor
final class EpisodeCaptureSetupModel: ObservableObject {
    @Published private(set) var inventory: ProductionCaptureInventory?
    @Published var selectedVideoDeviceID: String?
    @Published var selectedAudioInputID: String?
    @Published var selectedAudioOutputID: String?
    @Published private(set) var isRefreshing = false
    @Published private(set) var message = "Inspecting connected production sources…"
    @Published var episodeSpaceID = "high-ground-odyssey"
    @Published var participantID = "charlie"
    @Published private(set) var activeReceipt: ProductionAudioRecordingReceipt?
    @Published private(set) var lastFinalizedReceipt: ProductionAudioRecordingReceipt?
    @Published private(set) var interruptedRecordings: [InterruptedProductionAudioRecording] = []
    @Published private(set) var elapsedSeconds = 0.0
    @Published private(set) var isFinalizing = false
    @Published private(set) var recordingError: String?

    let captureRoot = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Movies/QuipslyCaptures", isDirectory: true)

    private let recorder = ProductionAudioRecorder()
    private var elapsedTask: Task<Void, Never>?

    var isRecording: Bool { recorder.isRecording }

    var selectedAudioInput: CaptureAudioDeviceSnapshot? {
        inventory?.audioDevices.first { $0.id == selectedAudioInputID }
    }

    var canStartRecording: Bool {
        guard !isRecording,
              !isFinalizing,
              !episodeSpaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !participantID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              inventory?.microphoneAuthorization == .authorized,
              let input = selectedAudioInput,
              input.hasInput,
              let sampleRate = input.nominalSampleRate else {
            return false
        }
        return abs(sampleRate - ProductionAudioRecorder.targetSampleRate) < 1
    }

    var plan: ProductionCapturePlan? {
        guard let inventory else { return nil }
        return ProductionCapturePolicy.buildPlan(
            inventory: inventory,
            videoDeviceID: selectedVideoDeviceID,
            audioInputID: selectedAudioInputID,
            audioOutputID: selectedAudioOutputID
        )
    }

    func refresh(requestAccess: Bool = false) async {
        guard !isRefreshing else { return }
        isRefreshing = true
        message = requestAccess
            ? "Waiting for camera and microphone permission…"
            : "Reading exact Core Audio and camera routes…"
        let next = await ProductionCaptureInventoryProbe.snapshot(
            requestAccess: requestAccess
        )
        inventory = next
        resolveSelections(in: next)
        refreshInterruptedRecordings()
        message = "\(next.videoDevices.count) camera route(s) · \(next.audioDevices.count) Core Audio device(s)"
        isRefreshing = false
    }

    func startRecording() {
        guard let input = selectedAudioInput else {
            recordingError = "Select the exact microphone/interface that will own this local master."
            return
        }
        recordingError = nil
        do {
            let receipt = try recorder.start(
                configuration: ProductionAudioRecordingConfiguration(
                    captureGroupID: UUID(),
                    episodeSpaceID: episodeSpaceID.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ),
                    participantID: participantID.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ),
                    inputDevice: input,
                    rootDirectory: captureRoot
                )
            )
            activeReceipt = receipt
            elapsedSeconds = 0
            message = "Writing an untouched local microphone master from \(input.name)…"
            startElapsedClock(startedAt: receipt.startedAt)
        } catch {
            recordingError = error.localizedDescription
            message = "Local master did not start."
            refreshInterruptedRecordings()
        }
    }

    func stopRecording() async {
        guard isRecording, !isFinalizing else { return }
        elapsedTask?.cancel()
        elapsedTask = nil
        isFinalizing = true
        recordingError = nil
        message = "Finalizing WAV and computing its SHA-256 receipt…"
        defer { isFinalizing = false }

        do {
            let receipt = try await recorder.stop()
            activeReceipt = receipt
            lastFinalizedReceipt = receipt
            elapsedSeconds = receipt.durationSeconds
            message = "Local microphone master finalized and verified."
        } catch {
            activeReceipt = recorder.activeReceipt
            recordingError = error.localizedDescription
            message = "The take was preserved but needs recovery review."
        }
        refreshInterruptedRecordings()
    }

    func refreshInterruptedRecordings() {
        interruptedRecordings = ProductionAudioRecorder.interruptedRecordings(
            in: captureRoot
        )
    }

    private func startElapsedClock(startedAt: Date) {
        elapsedTask?.cancel()
        elapsedTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                self.elapsedSeconds = max(0, Date().timeIntervalSince(startedAt))
                try? await Task.sleep(for: .milliseconds(200))
            }
        }
    }

    private func resolveSelections(in inventory: ProductionCaptureInventory) {
        if !inventory.videoDevices.contains(where: { $0.id == selectedVideoDeviceID }) {
            selectedVideoDeviceID =
                inventory.videoDevices.first {
                    $0.name.localizedCaseInsensitiveContains("Canon")
                        && $0.name.localizedCaseInsensitiveContains("R8")
                }?.id
                ?? inventory.videoDevices.first?.id
        }

        if !inventory.audioDevices.contains(where: {
            $0.id == selectedAudioInputID && $0.hasInput
        }) {
            selectedAudioInputID =
                inventory.audioDevices.first {
                    $0.hasInput && $0.name.localizedCaseInsensitiveContains("MV7i")
                }?.id
                ?? inventory.audioDevices.first {
                    $0.hasInput && $0.isDefaultInput
                }?.id
                ?? inventory.audioDevices.first(where: \.hasInput)?.id
        }

        if let input = inventory.audioDevices.first(where: {
            $0.id == selectedAudioInputID
        }), input.hasOutput {
            selectedAudioOutputID = input.id
        } else if !inventory.audioDevices.contains(where: {
            $0.id == selectedAudioOutputID && $0.hasOutput
        }) {
            selectedAudioOutputID =
                inventory.audioDevices.first {
                    $0.hasOutput && $0.name.localizedCaseInsensitiveContains("MV7i")
                }?.id
                ?? inventory.audioDevices.first {
                    $0.hasOutput && $0.isDefaultOutput
                }?.id
                ?? inventory.audioDevices.first(where: \.hasOutput)?.id
        }
    }
}

struct EpisodeCaptureSetupView: View {
    @StateObject private var model = EpisodeCaptureSetupModel()

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    routeSelectors
                    localMasterCard
                    if let plan = model.plan {
                        planSummary(plan)
                        assessmentGrid(plan)
                        ownershipCard(plan)
                    } else {
                        ProgressView(model.message)
                            .frame(maxWidth: .infinity, minHeight: 240)
                    }
                }
                .padding(24)
            }
        }
        .frame(minWidth: 820, minHeight: 680)
        .task {
            await model.refresh()
        }
        .onDisappear {
            if model.isRecording {
                Task { await model.stopRecording() }
            }
        }
        .accessibilityIdentifier("EpisodeCaptureSetup")
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: "waveform.and.person.filled")
                .font(.system(size: 30))
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 3) {
                Text("Episode Capture Setup")
                    .font(.title2.weight(.bold))
                Text("Verify the exact local masters, call route, and Canon handoff before recording.")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 5) {
                Text(model.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button(model.isRefreshing ? "Refreshing…" : "Refresh hardware") {
                    Task { await model.refresh(requestAccess: true) }
                }
                .disabled(
                    model.isRefreshing || model.isRecording || model.isFinalizing
                )
                .accessibilityIdentifier("EpisodeCaptureRefreshHardware")
            }
        }
        .padding(20)
    }

    @ViewBuilder
    private var routeSelectors: some View {
        if let inventory = model.inventory {
            GroupBox("Connected routes") {
                Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 14) {
                    GridRow {
                        Label("Camera", systemImage: "video.fill")
                        Picker("Camera", selection: $model.selectedVideoDeviceID) {
                            Text("No camera reference").tag(String?.none)
                            ForEach(inventory.videoDevices) { device in
                                Text(videoDeviceLabel(device)).tag(Optional(device.id))
                            }
                        }
                        .labelsHidden()
                        .disabled(model.isRecording || model.isFinalizing)
                        .accessibilityIdentifier("EpisodeCaptureCameraPicker")
                    }
                    GridRow {
                        Label("Local mic master", systemImage: "mic.fill")
                        Picker("Local mic master", selection: $model.selectedAudioInputID) {
                            Text("Select an input").tag(String?.none)
                            ForEach(inventory.audioDevices.filter(\.hasInput)) { device in
                                Text(audioDeviceLabel(device, input: true)).tag(Optional(device.id))
                            }
                        }
                        .labelsHidden()
                        .disabled(model.isRecording || model.isFinalizing)
                        .accessibilityIdentifier("EpisodeCaptureAudioInputPicker")
                    }
                    GridRow {
                        Label("Call + headphones", systemImage: "headphones")
                        Picker("Call and headphones", selection: $model.selectedAudioOutputID) {
                            Text("Select an output").tag(String?.none)
                            ForEach(inventory.audioDevices.filter(\.hasOutput)) { device in
                                Text(audioDeviceLabel(device, input: false)).tag(Optional(device.id))
                            }
                        }
                        .labelsHidden()
                        .disabled(model.isRecording || model.isFinalizing)
                        .accessibilityIdentifier("EpisodeCaptureAudioOutputPicker")
                    }
                }
                .padding(10)
            }

            if inventory.cameraAuthorization != .authorized
                || inventory.microphoneAuthorization != .authorized {
                Label(
                    "Camera: \(inventory.cameraAuthorization.rawValue) · Microphone: \(inventory.microphoneAuthorization.rawValue). Refresh hardware to request any undecided access.",
                    systemImage: "lock.trianglebadge.exclamationmark"
                )
                .foregroundStyle(.orange)
            }
        }
    }

    private var localMasterCard: some View {
        GroupBox("Local microphone master") {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    TextField("Episode space ID", text: $model.episodeSpaceID)
                        .textFieldStyle(.roundedBorder)
                        .disabled(model.isRecording || model.isFinalizing)
                        .accessibilityIdentifier("EpisodeCaptureEpisodeSpaceID")
                    TextField("Participant ID", text: $model.participantID)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 220)
                        .disabled(model.isRecording || model.isFinalizing)
                        .accessibilityIdentifier("EpisodeCaptureParticipantID")
                }

                HStack(spacing: 12) {
                    if model.isRecording {
                        Button(role: .destructive) {
                            Task { await model.stopRecording() }
                        } label: {
                            Label("Stop and finalize", systemImage: "stop.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("EpisodeCaptureStopAudioMaster")
                    } else {
                        Button {
                            model.startRecording()
                        } label: {
                            Label("Record local master", systemImage: "record.circle")
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                        .disabled(!model.canStartRecording)
                        .accessibilityIdentifier("EpisodeCaptureStartAudioMaster")
                    }

                    if model.isRecording {
                        Label(
                            formatDuration(model.elapsedSeconds),
                            systemImage: "waveform.circle.fill"
                        )
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.red)
                        Text("REC")
                            .font(.caption.weight(.black))
                            .foregroundStyle(.red)
                    } else if model.isFinalizing {
                        ProgressView()
                            .controlSize(.small)
                        Text("Finalizing and hashing off the UI thread…")
                            .foregroundStyle(.secondary)
                    } else {
                        Text("48 kHz · 24-bit PCM WAV · pre-call local source")
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Show captures") {
                        NSWorkspace.shared.open(model.captureRoot)
                    }
                    .accessibilityIdentifier("EpisodeCaptureShowCaptures")
                }

                if let error = model.recordingError {
                    Label(error, systemImage: "exclamationmark.octagon.fill")
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                if !model.canStartRecording,
                   !model.isRecording,
                   !model.isFinalizing {
                    Text(recordingReadinessMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let receipt = model.lastFinalizedReceipt {
                    Divider()
                    finalizedReceiptRow(receipt)
                }

                if !model.interruptedRecordings.isEmpty {
                    Divider()
                    Label(
                        "\(model.interruptedRecordings.count) interrupted take(s) are preserved as partial WAV files. Review them before deleting or importing.",
                        systemImage: "lifepreserver.fill"
                    )
                    .font(.callout)
                    .foregroundStyle(.orange)
                }
            }
            .padding(10)
        }
        .accessibilityIdentifier("EpisodeCaptureLocalMaster")
    }

    private func finalizedReceiptRow(
        _ receipt: ProductionAudioRecordingReceipt
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(.green)
                .font(.title2)
            VStack(alignment: .leading, spacing: 4) {
                Text("Verified local master")
                    .font(.headline)
                Text(
                    "\(formatDuration(receipt.durationSeconds)) · \(receipt.channelCount) ch · \(ByteCountFormatter.string(fromByteCount: receipt.byteCount ?? 0, countStyle: .file))"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                Text("SHA-256 \(receipt.sha256?.prefix(16) ?? "missing")…")
                    .font(.caption.monospaced())
                    .textSelection(.enabled)
            }
            Spacer()
            Button("Reveal take") {
                NSWorkspace.shared.activateFileViewerSelecting([
                    URL(fileURLWithPath: receipt.audioPath)
                ])
            }
            .accessibilityIdentifier("EpisodeCaptureRevealFinalizedTake")
        }
    }

    private var recordingReadinessMessage: String {
        if model.inventory?.microphoneAuthorization != .authorized {
            return "Grant microphone access with Refresh hardware before recording."
        }
        guard let input = model.selectedAudioInput else {
            return "Select a local microphone master."
        }
        guard let sampleRate = input.nominalSampleRate,
              abs(sampleRate - ProductionAudioRecorder.targetSampleRate) < 1 else {
            return "\(input.name) must be configured for exactly 48 kHz before Quipsly will record."
        }
        return "Enter both the episode space and participant identity."
    }

    private func planSummary(_ plan: ProductionCapturePlan) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(
                systemName: plan.status == .ready
                    ? "checkmark.seal.fill"
                    : plan.status == .blocked
                        ? "xmark.octagon.fill"
                        : "checklist.unchecked"
            )
            .font(.title)
            .foregroundStyle(
                plan.status == .ready
                    ? .green
                    : plan.status == .blocked
                        ? .red
                        : .orange
            )
            VStack(alignment: .leading, spacing: 5) {
                Text(planStatusTitle(plan.status))
                    .font(.headline)
                Text("Local audio target: \(plan.localAudioFormat)")
                    .font(.subheadline)
                ForEach(plan.nextActions, id: \.self) { action in
                    Text("• \(action)")
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text("ROUTES + LOCAL MASTER")
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 9)
                .padding(.vertical, 6)
                .background(.quaternary, in: Capsule())
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
        .accessibilityIdentifier("EpisodeCapturePlanSummary")
    }

    private func assessmentGrid(_ plan: ProductionCapturePlan) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible())],
            alignment: .leading,
            spacing: 14
        ) {
            if let video = plan.video {
                assessmentCard(video, icon: "video.fill")
            } else {
                missingCard(
                    title: "Camera reference",
                    detail: "No camera route selected. Canon card recording can still be imported, but Quipsly cannot provide framing/reference evidence."
                )
            }
            if let audio = plan.audio {
                assessmentCard(audio, icon: "waveform")
            }
            if let callRoute = plan.callRoute {
                assessmentCard(callRoute, icon: "headphones")
            }
        }
    }

    private func assessmentCard(
        _ assessment: ProductionCaptureAssessment,
        icon: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label(assessment.title, systemImage: icon)
                    .font(.headline)
                Spacer()
                Text(assessment.status.rawValue.replacingOccurrences(of: "Required", with: " required"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor(assessment.status))
            }
            Text(assessment.truth)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(assessment.strengths, id: \.self) {
                Label($0, systemImage: "checkmark.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(assessment.warnings, id: \.self) {
                Label($0, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            ForEach(assessment.blockers, id: \.self) {
                Label($0, systemImage: "xmark.octagon")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(15)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 12))
    }

    private func missingCard(title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: "questionmark.video")
                .font(.headline)
            Text(detail)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(15)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 12))
    }

    private func ownershipCard(_ plan: ProductionCapturePlan) -> some View {
        GroupBox("Source ownership") {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(plan.sourceOwnership, id: \.self) {
                    Label($0, systemImage: "lock.doc")
                        .font(.callout)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
        }
    }

    private func videoDeviceLabel(_ device: CaptureVideoDeviceSnapshot) -> String {
        if let best = device.bestFormat {
            return "\(device.name) — \(best.label)"
        }
        return "\(device.name) — no reported format"
    }

    private func audioDeviceLabel(
        _ device: CaptureAudioDeviceSnapshot,
        input: Bool
    ) -> String {
        let channels = input ? device.inputChannels : device.outputChannels
        let rate = device.nominalSampleRate.map {
            " · \(Int($0.rounded())) Hz"
        } ?? ""
        let defaultLabel =
            (input && device.isDefaultInput) || (!input && device.isDefaultOutput)
                ? " · default"
                : ""
        return "\(device.name) · \(channels) ch\(rate)\(defaultLabel)"
    }

    private func planStatusTitle(
        _ status: ProductionCaptureAssessmentStatus
    ) -> String {
        switch status {
        case .ready: "Routes ready for rehearsal"
        case .reviewRequired: "Resolve these truths before the episode"
        case .blocked: "Capture is blocked"
        }
    }

    private func statusColor(
        _ status: ProductionCaptureAssessmentStatus
    ) -> Color {
        switch status {
        case .ready: .green
        case .reviewRequired: .orange
        case .blocked: .red
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded(.down)))
        let hours = total / 3_600
        let minutes = (total % 3_600) / 60
        let remainingSeconds = total % 60
        if hours > 0 {
            return String(
                format: "%d:%02d:%02d",
                hours,
                minutes,
                remainingSeconds
            )
        }
        return String(format: "%02d:%02d", minutes, remainingSeconds)
    }
}
