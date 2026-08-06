import SwiftUI

private enum CaptureRehearsalCheckState {
    case ready
    case action
    case blocked

    var systemImage: String {
        switch self {
        case .ready: "checkmark.circle.fill"
        case .action: "circle.dashed"
        case .blocked: "exclamationmark.triangle.fill"
        }
    }

    var tint: Color {
        switch self {
        case .ready: .green
        case .action: .orange
        case .blocked: .red
        }
    }
}

private struct CaptureRehearsalCheckItem: Identifiable {
    let id: String
    let title: String
    let detail: String
    let state: CaptureRehearsalCheckState
    let required: Bool
}

struct CaptureRehearsalReadinessCard: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    @ObservedObject private var auth = AuthManager.shared
    @ObservedObject private var audioSession =
        CaptureAudioSessionCoordinator.shared
    @ObservedObject var audioCapture: AudioCaptureController
    @ObservedObject var soundCheck: CaptureAudioSoundCheckController
    @ObservedObject var videoCapture: VideoCaptureController
    @ObservedObject var manuscript: MobileEpisodeManuscriptClient
    @ObservedObject var watch: MobileEpisodeWatchClient
    @ObservedObject var preflight: CaptureSessionPreflightClient

    let session: MobileCaptureSession
    let mode: CaptureRecordingMode
    let providerConnected: Bool
    let previewOnly: Bool
    let isRunningCheck: Bool
    let isCaptureActive: Bool
    let onRunCheck: () -> Void

    @State private var isExpanded = false

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            Button {
                isExpanded.toggle()
            } label: {
                if dynamicTypeSize.isAccessibilitySize {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            Label("Before you record", systemImage: summarySystemImage)
                                .font(.headline)
                                .foregroundStyle(summaryTint)
                            Spacer(minLength: 8)
                            readinessChevron
                        }
                        Text(summaryLabel)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(summaryTint)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .contentShape(Rectangle())
                } else {
                    HStack(alignment: .center, spacing: 10) {
                        Label("Before you record", systemImage: summarySystemImage)
                            .font(.headline)
                            .foregroundStyle(summaryTint)
                        Spacer(minLength: 8)
                        Text(summaryLabel)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(summaryTint)
                            .multilineTextAlignment(.trailing)
                        readinessChevron
                    }
                    .contentShape(Rectangle())
                }
            }
            .buttonStyle(.plain)
            .accessibilityLabel(
                "Before you record, \(summaryLabel)"
            )
            .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
            .accessibilityHint(
                isExpanded
                    ? "Collapses the rehearsal checks."
                    : "Shows every rehearsal check."
            )
            .accessibilityIdentifier("CaptureRehearsalReadinessDisclosure")

            if isExpanded {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(items) { item in
                        HStack(alignment: .top, spacing: 11) {
                            Image(systemName: item.state.systemImage)
                                .foregroundStyle(item.state.tint)
                                .frame(width: 22)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(item.title)
                                    .font(.subheadline.weight(.semibold))
                                Text(item.detail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                            Spacer(minLength: 0)
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityLabel(
                            "\(item.title), \(stateLabel(item.state)), \(item.detail)"
                        )
                        .accessibilityIdentifier(
                            "CaptureRehearsalCheck_\(item.id)"
                        )
                    }

                    #if DEBUG && targetEnvironment(simulator)
                    if CaptureLaunchConfiguration.usesSessionPreflightOutboxUITest,
                       let receipt = preflight.receipt(roomID: session.callRoomId) {
                        Text(receipt.id.uuidString.lowercased())
                            .font(.caption2.monospaced())
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("CaptureSessionPreflightOutboxReceiptID")
                    }
                    #endif

                    if mode.requiresAudioConsent {
                        CaptureAudioSoundCheckControls(
                            controller: soundCheck,
                            routeName: audioCapture.inputRouteName,
                            consentReady:
                                session.canRecordAudioNow
                                ?? session.canRecordNow,
                            previewOnly: previewOnly,
                            providerConnected: providerConnected,
                            captureIsActive: isCaptureActive,
                            onDecision: { decision in
                                soundCheck.recordPlaybackDecision(decision)
                                Task {
                                    await preflight.save(
                                        soundCheck: soundCheck,
                                        session: session,
                                        mode: mode,
                                        videoProfile: videoCapture.resolvedProfile
                                    )
                                }
                            }
                        )
                    }

                    Button(action: onRunCheck) {
                        if isRunningCheck {
                            HStack {
                                ProgressView()
                                Text("Checking this iPhone…")
                            }
                            .frame(maxWidth: .infinity)
                        } else {
                            Label(
                                providerConnected
                                    ? "Refresh script and clip"
                                    : "Check this iPhone",
                                systemImage: "checkmark.shield"
                            )
                            .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(runCheckDisabled)
                    .accessibilityHint(runCheckHint)
                    .accessibilityIdentifier("CaptureRehearsalRunCheck")

                    Text(boundaryCopy)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier(
                            "CaptureRehearsalReadinessBoundary"
                        )
                }
                .padding(.top, 12)
            }
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .fill(.regularMaterial)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(summaryTint.opacity(0.22), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureRehearsalReadinessCard")
    }

    private var items: [CaptureRehearsalCheckItem] {
        var result = [
            accountItem,
            sessionItem,
            consentItem,
            microphoneItem,
        ]
        if mode.requiresAudioConsent {
            result.append(soundCheckItem)
            result.append(sharedPreflightItem)
        }
        if mode.recordsVideo {
            result.append(cameraItem)
        }
        if hasEpisodeContext {
            result.append(contentsOf: [
                manuscriptItem,
                watchItem,
                headphonesItem,
            ])
        }
        if session.providerCanJoin == true {
            result.append(liveRoomItem)
        }
        return result
    }

    private var accountItem: CaptureRehearsalCheckItem {
        if previewOnly {
            return item(
                "account",
                "Quipsly account",
                "Preview is read-only; a physical test must verify the signed-in owner.",
                .action
            )
        }
        if auth.networkActionsAllowed {
            return item(
                "account",
                "Quipsly account",
                "Nest verified the current account for new recording actions.",
                .ready
            )
        }
        return item(
            "account",
            "Quipsly account",
            "Reconnect and verify the intended account before recording.",
            .blocked
        )
    }

    private var sessionItem: CaptureRehearsalCheckItem {
        guard hasEpisodeContext else {
            return item(
                "session",
                "Session destination",
                "\(session.displayTitle) is selected, but it is not bound to an episode.",
                .action
            )
        }
        return item(
            "session",
            "Exact episode room",
            "\(nonempty(session.projectName) ?? session.projectSlug ?? "Project") · \(session.episodeSlug ?? "Episode")",
            .ready
        )
    }

    private var consentItem: CaptureRehearsalCheckItem {
        let audioReady = session.canRecordAudioNow ?? session.canRecordNow
        let videoReady =
            session.recordingConsentVideoGranted == true
            && session.canRecordVideoNow == true
        let ready =
            (!mode.requiresAudioConsent || audioReady)
            && (!mode.recordsVideo || videoReady)
        let required = session.consentRequiredParticipantCount
        let audioGranted = session.consentGrantedParticipantCount ?? 0
        let videoGranted = session.videoConsentGrantedParticipantCount ?? 0
        let detail: String
        if let required, required > 1 {
            let parts = [
                mode.requiresAudioConsent
                    ? "audio \(audioGranted)/\(required)"
                    : nil,
                mode.recordsVideo
                    ? "video \(videoGranted)/\(required)"
                    : nil,
            ].compactMap { $0 }
            detail = ready
                ? "Every required participant has current \(parts.joined(separator: " and ")) consent."
                : "Waiting for current \(parts.joined(separator: " and ")) consent."
        } else {
            detail = ready
                ? "Current \(mode.title.lowercased()) consent is ready."
                : "Review and save the required consent choices."
        }
        return item(
            "consent",
            "Participant consent",
            detail,
            ready ? .ready : .blocked
        )
    }

    private var microphoneItem: CaptureRehearsalCheckItem {
        if previewOnly {
            return item(
                "microphone",
                "Microphone and storage",
                "A physical iPhone must verify its real input route and local capacity.",
                .action
            )
        }
        if audioCapture.microphonePreflightState == .denied {
            return item(
                "microphone",
                "Microphone and storage",
                "Microphone access is denied. Enable it in Settings before the take.",
                .blocked
            )
        }
        if audioCapture.microphonePreflightState == .granted,
           let available = audioCapture.availableCaptureCapacityBytes {
            return item(
                "microphone",
                "Microphone and storage",
                "\(audioCapture.inputRouteName) · \(storageLabel(available)) available",
                .ready
            )
        }
        return item(
            "microphone",
            "Microphone and storage",
            "Run the check before joining the live room to verify the real route and reserve.",
            .action
        )
    }

    private var soundCheckItem: CaptureRehearsalCheckItem {
        guard let summary = soundCheck.summary else {
            if soundCheck.state == .recording {
                return item(
                    "sound-check",
                    "Listen-back sound check",
                    "Speak at normal episode level while Quipsly records up to ten local-only seconds.",
                    .action
                )
            }
            return item(
                "sound-check",
                "Listen-back sound check",
                "Record and replay normal speech on the selected microphone before the real take.",
                .action
            )
        }
        guard summary.routeName == audioCapture.inputRouteName else {
            return item(
                "sound-check",
                "Listen-back sound check",
                "The check used \(summary.routeName), but the selected route is now \(audioCapture.inputRouteName). Run it again.",
                .blocked
            )
        }
        guard summary.duration >= soundCheck.minimumUsefulDuration else {
            return item(
                "sound-check",
                "Listen-back sound check",
                "The check lasted \(formattedDuration(summary.duration)). Run at least three seconds of normal speech so the level evidence is representative.",
                .action
            )
        }
        guard soundCheck.playbackCompleted else {
            return item(
                "sound-check",
                "Listen-back sound check",
                "The level reading is available, but the complete private sample has not been heard yet.",
                .action
            )
        }
        guard let decision = soundCheck.playbackDecision else {
            return item(
                "sound-check",
                "Listen-back sound check",
                "Full playback completed on \(soundCheck.playbackOutputRouteName ?? "the current output"). Record whether it sounded clear or needs adjustment.",
                .action
            )
        }
        let detail = "\(summary.routeName) · average \(formattedDBFS(summary.averagePowerDBFS)) · peak \(formattedDBFS(summary.peakPowerDBFS)). \(summary.health.guidance)"
        return item(
            "sound-check",
            "Listen-back sound check",
            detail,
            summary.health == .healthy && decision == .heardClear ? .ready : .blocked
        )
    }

    private var sharedPreflightItem: CaptureRehearsalCheckItem {
        guard let checkID = soundCheck.checkID,
              soundCheck.playbackDecision != nil else {
            return item(
                "shared-preflight",
                "Shared setup receipt",
                "Complete the private listen-back before this iPhone can share exact setup evidence with collaborators.",
                .action
            )
        }
        guard let receipt = preflight.receipt(
            roomID: session.callRoomId,
            checkID: checkID
        ) else {
            return item(
                "shared-preflight",
                "Shared setup receipt",
                "The listening decision has not yet been committed to the protected iPhone outbox.",
                .action
            )
        }
        switch receipt.deliveryState {
        case .pending:
            return item(
                "shared-preflight",
                "Shared setup receipt",
                "Saved on this iPhone and waiting for Nest. Local capture remains available; collaborators do not see a current receipt yet.",
                .action
            )
        case .rejected:
            return item(
                "shared-preflight",
                "Shared setup receipt",
                receipt.serverError ?? "Nest held this receipt. Run a fresh check.",
                .blocked
            )
        case .acknowledged:
            if receipt.isCurrentReady {
                return item(
                    "shared-preflight",
                    "Shared setup receipt",
                    "Nest verified this exact iPhone, microphone, output, full playback, and listener decision for the current Session.",
                    .ready
                )
            }
            let issues = receipt.serverIssueCodes.isEmpty
                ? "This receipt is no longer a current ready claim."
                : receipt.serverIssueCodes.joined(separator: ", ")
            return item(
                "shared-preflight",
                "Shared setup receipt",
                "Nest saved the evidence without painting it ready: \(issues)",
                .blocked
            )
        }
    }

    private func formattedDuration(_ duration: TimeInterval) -> String {
        String(format: "%.1f seconds", max(0, duration))
    }

    private var cameraItem: CaptureRehearsalCheckItem {
        if previewOnly {
            return item(
                "camera",
                "Camera source",
                "A physical iPhone must resolve its real camera, codec, framing, and capacity.",
                .action
            )
        }
        guard videoCapture.state == .ready,
              let profile = videoCapture.resolvedProfile else {
            return item(
                "camera",
                "Camera source",
                "Prepare the \(videoCapture.cameraPosition.rawValue) camera and review the exact profile.",
                videoCapture.state == .failed ? .blocked : .action
            )
        }
        let minutes = videoCapture.estimatedAvailableMinutes
            .map { " · about \($0) min free" }
            ?? ""
        return item(
            "camera",
            "Camera source",
            "\(profile.profileLabel) · \(profile.cameraLocalizedName)\(minutes)",
            .ready
        )
    }

    private var manuscriptItem: CaptureRehearsalCheckItem {
        guard manuscript.hasReadableCopy else {
            return item(
                "manuscript",
                "Episode script",
                "Load the canonical Nest manuscript before the take.",
                .action
            )
        }
        let count = manuscript.writing?.blockCount ?? manuscript.blocks.count
        return item(
            "manuscript",
            "Episode script",
            "\(manuscript.displayTitle) · \(count) protected blocks",
            .ready
        )
    }

    private var watchItem: CaptureRehearsalCheckItem {
        guard let clip = watch.selectedClip else {
            return item(
                "watch",
                "First shared clip",
                "Choose the first Episode Watch source.",
                .blocked
            )
        }
        if previewOnly {
            return item(
                "watch",
                "First shared clip",
                "\(clip.title) is selected; preview does not fake a protected download.",
                .action
            )
        }
        return item(
            "watch",
            "First shared clip",
            watch.isPrepared
                ? "\(clip.title) is protected and decodable on this iPhone."
                : "\(clip.title) is selected but still needs local preparation.",
            watch.isPrepared ? .ready : .action
        )
    }

    private var headphonesItem: CaptureRehearsalCheckItem {
        if previewOnly {
            return item(
                "headphones",
                "Private listening route",
                "The physical rehearsal must prove headphones before shared playback.",
                .action
            )
        }
        return item(
            "headphones",
            "Private listening route",
            audioSession.privateListeningRouteAvailable
                ? "Headphones or a private audio device are connected."
                : "Connect headphones so the reference clip stays out of the microphone master.",
            audioSession.privateListeningRouteAvailable ? .ready : .blocked
        )
    }

    private var liveRoomItem: CaptureRehearsalCheckItem {
        item(
            "live-room",
            "Live room",
            providerConnected
                ? "\(session.providerLabel) is connected for conversation."
                : "\(session.providerLabel) is ready to join after the device check.",
            providerConnected ? .ready : .action
        )
    }

    private var remainingRequiredCount: Int {
        items.filter { $0.required && $0.state != .ready }.count
    }

    private var summaryLabel: String {
        if previewOnly { return "Physical proof needed" }
        if remainingRequiredCount == 0 { return "Ready for rehearsal" }
        return "\(remainingRequiredCount) \(remainingRequiredCount == 1 ? "check" : "checks") left"
    }

    private var summarySystemImage: String {
        remainingRequiredCount == 0 && !previewOnly
            ? "checkmark.seal.fill"
            : "checklist"
    }

    private var summaryTint: Color {
        remainingRequiredCount == 0 && !previewOnly ? .green : .orange
    }

    private var readinessChevron: some View {
        Image(systemName: "chevron.right")
            .font(.caption.weight(.bold))
            .foregroundStyle(.secondary)
            .rotationEffect(.degrees(isExpanded ? 90 : 0))
            .accessibilityHidden(true)
    }

    private var runCheckDisabled: Bool {
        previewOnly
            || isCaptureActive
            || isRunningCheck
            || !auth.networkActionsAllowed
    }

    private var runCheckHint: String {
        if previewOnly {
            return "Preview never invents microphone, camera, storage, or protected-download proof."
        }
        if providerConnected {
            return "Refreshes the canonical script and selected protected clip without reconfiguring live audio."
        }
        return "Verifies microphone, storage, camera when selected, canonical script, and the first protected Watch clip. It never starts recording or joins the live room."
    }

    private var boundaryCopy: String {
        if previewOnly {
            return "Preview shows the checklist shape only. It never claims physical-device, consent, route, storage, protected-download, or room proof."
        }
        return "This checklist does not grant consent, join the room, or start recording. A protected iPhone outbox can delay the collaboration receipt without blocking local capture. Existing capture guards remain authoritative; rerun after changing the microphone, camera, headphones, account, or Session."
    }

    private var hasEpisodeContext: Bool {
        nonempty(session.projectSlug) != nil
            && nonempty(session.episodeSlug) != nil
    }

    private func item(
        _ id: String,
        _ title: String,
        _ detail: String,
        _ state: CaptureRehearsalCheckState,
        required: Bool = true
    ) -> CaptureRehearsalCheckItem {
        CaptureRehearsalCheckItem(
            id: id,
            title: title,
            detail: detail,
            state: state,
            required: required
        )
    }

    private func stateLabel(_ state: CaptureRehearsalCheckState) -> String {
        switch state {
        case .ready: "ready"
        case .action: "needs a check"
        case .blocked: "blocked"
        }
    }

    private func storageLabel(_ bytes: Int64) -> String {
        let formatter = ByteCountFormatter()
        formatter.allowedUnits = [.useGB, .useMB]
        formatter.countStyle = .file
        return formatter.string(fromByteCount: max(0, bytes))
    }

    private func formattedDBFS(_ value: Float) -> String {
        guard value > -120 else { return "below -120 dBFS" }
        return String(format: "%.1f dBFS", value)
    }

    private func nonempty(_ value: String?) -> String? {
        guard let normalized = value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty else { return nil }
        return normalized
    }
}

private struct CaptureAudioSoundCheckControls: View {
    @ObservedObject var controller: CaptureAudioSoundCheckController
    let routeName: String
    let consentReady: Bool
    let previewOnly: Bool
    let providerConnected: Bool
    let captureIsActive: Bool
    let onDecision: (CaptureAudioSoundCheckPlaybackDecision) -> Void

    private var canStart: Bool {
        !previewOnly
            && consentReady
            && !providerConnected
            && !captureIsActive
            && !controller.state.isBusy
    }

    private var routeMatchesSummary: Bool {
        controller.summary?.routeName == routeName
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Label("Local sound check", systemImage: "waveform.badge.mic")
                    .font(.subheadline.weight(.bold))
                Spacer()
                if controller.state == .recording {
                    Text("\(max(0, Int(ceil(controller.maximumDuration - controller.elapsed))))s")
                        .font(.caption.monospacedDigit().weight(.bold))
                        .foregroundStyle(.red)
                } else if let summary = controller.summary {
                    Text(summary.health.title)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(summaryTint(summary.health))
                }
            }

            if controller.state == .recording {
                InputLevelMeter(
                    averagePowerDB: controller.liveAveragePowerDBFS,
                    peakPowerDB: controller.livePeakPowerDBFS,
                    isActive: true
                )
                Button {
                    controller.finishRecording()
                } label: {
                    Label("Stop and evaluate", systemImage: "stop.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.red)
                .accessibilityIdentifier("CaptureSoundCheckStop")
            } else if let summary = controller.summary {
                VStack(alignment: .leading, spacing: 5) {
                    Text("\(summary.routeName) · \(formattedDuration(summary.duration))")
                        .font(.caption.weight(.semibold))
                    Text("Average \(formattedDBFS(summary.averagePowerDBFS)) · peak \(formattedDBFS(summary.peakPowerDBFS))")
                        .font(.caption.monospacedDigit().weight(.semibold))
                    if !routeMatchesSummary {
                        Label(
                            "Route changed to \(routeName). This result is stale.",
                            systemImage: "arrow.trianglehead.2.clockwise.rotate.90"
                        )
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.orange)
                    }
                    Text(summary.health.guidance)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("CaptureSoundCheckResult")

                HStack(spacing: 8) {
                    Button {
                        if controller.state == .playing {
                            controller.stopPlayback()
                        } else {
                            controller.play()
                        }
                    } label: {
                        Label(
                            controller.state == .playing ? "Stop playback" : "Listen back",
                            systemImage: controller.state == .playing ? "stop.fill" : "play.fill"
                        )
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(providerConnected || captureIsActive)
                    .accessibilityIdentifier("CaptureSoundCheckPlayback")

                    Button("Run again") {
                        Task { await controller.start(currentRouteName: routeName) }
                    }
                    .buttonStyle(.bordered)
                    .disabled(!canStart)
                    .accessibilityIdentifier("CaptureSoundCheckAgain")

                    Button(role: .destructive) {
                        controller.discard()
                    } label: {
                        Image(systemName: "trash")
                    }
                    .buttonStyle(.bordered)
                    .accessibilityLabel("Delete local sound check")
                    .accessibilityIdentifier("CaptureSoundCheckDelete")
                }

                if controller.playbackCompleted {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("What did the full playback sound like?")
                            .font(.caption.weight(.bold))
                        HStack(spacing: 8) {
                            Button {
                                onDecision(.heardClear)
                            } label: {
                                Label("Sounds clear", systemImage: "checkmark.circle")
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.green)
                            .disabled(controller.playbackDecision == .heardClear)
                            .accessibilityIdentifier("CaptureSoundCheckHeardClear")

                            Button {
                                onDecision(.needsAdjustment)
                            } label: {
                                Label("Needs adjustment", systemImage: "slider.horizontal.3")
                            }
                            .buttonStyle(.bordered)
                            .disabled(controller.playbackDecision == .needsAdjustment)
                            .accessibilityIdentifier("CaptureSoundCheckNeedsAdjustment")
                        }
                        if let decision = controller.playbackDecision {
                            Text(decision.title)
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(
                                    decision == .heardClear ? Color.green : Color.orange
                                )
                                .accessibilityIdentifier("CaptureSoundCheckPlaybackDecision")
                        }
                    }
                } else {
                    Text("A meter reading cannot approve mouth noise, echo, rubbing, or playback bleed. Listen to the complete sample before Quipsly can share a ready receipt.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
            } else {
                Button {
                    Task { await controller.start(currentRouteName: routeName) }
                } label: {
                    if controller.state == .requestingPermission {
                        HStack {
                            ProgressView()
                            Text("Opening microphone…")
                        }
                        .frame(maxWidth: .infinity)
                    } else {
                        Label("Record 10-second sound check", systemImage: "record.circle")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!canStart)
                .accessibilityHint(startHint)
                .accessibilityIdentifier("CaptureSoundCheckStart")
            }

            if let message = controller.message {
                Text(message)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(controller.state == .failed ? Color.red : Color.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureSoundCheckMessage")
            }

            Text("This explicit check records only a temporary protected file on this iPhone. Quipsly never uploads it, creates no Session source, and deletes abandoned checks on launch. Consent is still required because another person could be audible.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CaptureSoundCheckBoundary")
        }
        .padding(12)
        .background(
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .fill(Color.accentColor.opacity(0.06))
        )
        .overlay {
            RoundedRectangle(cornerRadius: 14, style: .continuous)
                .stroke(Color.accentColor.opacity(0.16), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureSoundCheckControls")
    }

    private var startHint: String {
        if previewOnly {
            return "Preview shows the sound-check workflow without opening a microphone or inventing level evidence."
        }
        if !consentReady {
            return "Save current audio consent before recording a sound check."
        }
        if providerConnected {
            return "Leave the live room before opening a separate microphone sound check."
        }
        if captureIsActive {
            return "Stop the current take before recording a sound check."
        }
        return "Records up to ten seconds locally for level evidence and listen-back. It is never uploaded."
    }

    private func summaryTint(_ health: CaptureAudioSoundCheckHealth) -> Color {
        switch health {
        case .healthy: .green
        case .tooQuiet, .hot: .orange
        case .noSignal, .clippingRisk: .red
        }
    }

    private func formattedDBFS(_ value: Float) -> String {
        guard value > -120 else { return "below -120 dBFS" }
        return String(format: "%.1f dBFS", value)
    }

    private func formattedDuration(_ value: TimeInterval) -> String {
        String(format: "%.1f seconds", max(0, value))
    }
}
