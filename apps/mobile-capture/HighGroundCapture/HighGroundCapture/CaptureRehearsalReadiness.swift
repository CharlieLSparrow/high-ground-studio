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
    @ObservedObject var videoCapture: VideoCaptureController
    @ObservedObject var manuscript: MobileEpisodeManuscriptClient
    @ObservedObject var watch: MobileEpisodeWatchClient

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
        return "This checklist does not grant consent, join the room, or start recording. Existing capture guards remain authoritative; rerun it after changing the microphone, camera, headphones, account, or Session."
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

    private func nonempty(_ value: String?) -> String? {
        guard let normalized = value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty else { return nil }
        return normalized
    }
}
