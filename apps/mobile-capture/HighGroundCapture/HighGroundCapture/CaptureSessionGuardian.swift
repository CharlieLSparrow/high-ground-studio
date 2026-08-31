import Foundation
import SwiftUI

enum CaptureSessionGuardianLevel: String {
    case ready
    case watch
    case intervene
}

struct CaptureSessionGuardianEvidenceRow: Identifiable, Equatable {
    let lane: String
    let value: String

    var id: String { lane }
}

struct CaptureSessionGuardianProjection: Equatable {
    let level: CaptureSessionGuardianLevel
    let eyebrow: String
    let title: String
    let detail: String
    let action: String
    let evidence: [CaptureSessionGuardianEvidenceRow]
}

struct CaptureSessionGuardianInput {
    let sessionSafeToRecord: Bool
    let sessionNextAction: String
    let mode: CaptureRecordingMode
    let audioState: AudioCaptureState
    let audioDuration: TimeInterval
    let audioAveragePowerDB: Float
    let audioPeakPowerDB: Float
    let audioRoute: String
    let audioAvailableBytes: Int64?
    let audioAutomaticStopReason: String?
    let audioError: String?
    let videoState: VideoCaptureState
    let videoProfileLabel: String?
    let videoEstimatedMinutes: Int?
    let videoSafetyMessage: String?
    let videoError: String?
    let providerConnected: Bool
    let providerConnecting: Bool
    let providerError: String?
    let appIsActive: Bool
}

enum CaptureSessionGuardianProjector {
    static func project(_ input: CaptureSessionGuardianInput) -> CaptureSessionGuardianProjection {
        let audioRelevant = input.mode.usesStandaloneAudioRecorder
        let videoRelevant = input.mode.recordsVideo
        let audioActive = audioRelevant && [.recording, .paused].contains(input.audioState)
        let videoActive = videoRelevant && [.arming, .recording, .paused].contains(input.videoState)
        let captureActive = audioActive || videoActive
        let evidence = evidenceRows(input)

        if let failure = firstNonempty(
            audioRelevant ? input.audioAutomaticStopReason : nil,
            audioRelevant ? input.audioError : nil,
            videoRelevant ? input.videoError : nil
        ) {
            return projection(
                .intervene,
                "Recording recovery",
                "This recording needs attention",
                failure,
                "Keep the saved recording, fix the device or storage problem, then start a new take.",
                evidence
            )
        }

        if (audioRelevant && input.audioState == .failed)
            || (videoRelevant && input.videoState == .failed) {
            return projection(
                .intervene,
                "Recording recovery",
                "This recording needs attention",
                "Quipsly saved the file but could not confirm it as a complete recording.",
                "Open Library, keep the saved file, and review what happened before starting a new take.",
                evidence
            )
        }

        if captureActive {
            if !input.appIsActive {
                return projection(
                    .watch,
                    "Background capture",
                    "Recording while Quipsly is not visible",
                    "Audio may continue in the background. iOS safely closes a camera recording when the app leaves the screen.",
                    "Return to Quipsly Capture and check the recording before continuing.",
                    evidence
                )
            }

            if audioRelevant && input.audioState == .recording {
                if let available = input.audioAvailableBytes,
                   available < 512 * 1024 * 1024 {
                    return projection(
                        .watch,
                        "Local capacity",
                        "Audio recording space is getting low",
                        "\(ByteCountFormatter.string(fromByteCount: available, countStyle: .file)) remains available on \(CaptureDeviceVocabulary.thisDevice).",
                        "Plan to end this take soon. Quipsly will stop before the safe storage reserve is used.",
                        evidence
                    )
                }
                if input.audioDuration < 2 {
                    return projection(
                        .watch,
                        "Microphone",
                        "Checking the microphone level",
                        "Quipsly waits two seconds before deciding that an initially quiet meter may be a problem.",
                        "Speak naturally and watch for the level to settle.",
                        evidence
                    )
                }
                if input.audioPeakPowerDB >= -1 {
                    return projection(
                        .intervene,
                        "Microphone",
                        "The microphone is reaching clipping risk",
                        "The live level is within 1 dB of clipping.",
                        "Lower input gain now. End and restart the take if clipping continues.",
                        evidence
                    )
                }
                if input.audioAveragePowerDB < -60 && input.audioPeakPowerDB < -54 {
                    return projection(
                        .intervene,
                        "Microphone",
                        "No useful microphone signal is reaching the recording",
                        "The recorder is running, but the observed level remains too quiet.",
                        "Check mute, cable, route, and microphone power now. Stop the take if signal does not return.",
                        evidence
                    )
                }
                if input.audioPeakPowerDB >= -3 || input.audioAveragePowerDB >= -12 {
                    return projection(
                        .watch,
                        "Microphone",
                        "The microphone is running hot",
                        "The recording has not clipped, but it has little level headroom left.",
                        "Lower input gain slightly and watch the peak lane.",
                        evidence
                    )
                }
            }

            if let safety = videoRelevant ? nonempty(input.videoSafetyMessage) : nil {
                return projection(
                    .watch,
                    "Camera protection",
                    "The camera source needs monitoring",
                    safety,
                    "Follow the displayed thermal or capacity guidance; Quipsly will close the movie before the protected reserve is crossed.",
                    evidence
                )
            }

            if !input.providerConnected && input.mode != .soloVideo {
                return projection(
                    .watch,
                    "Call disconnected",
                    "\(CaptureDeviceVocabulary.thisDeviceCapitalized) is still recording",
                    "The high-quality recording continues even though the call disconnected.",
                    "Reconnect the call. Stop the recording only if the conversation cannot continue.",
                    evidence
                )
            }

            return projection(
                .ready,
                "Recording",
                "Recording on \(CaptureDeviceVocabulary.thisDevice)",
                "The high-quality local recording is running separately from the call.",
                "Keep Quipsly visible and tap Stop when the Session is complete.",
                evidence
            )
        }

        if (audioRelevant && [.preparing, .finalizing].contains(input.audioState))
            || (videoRelevant && [.preparing, .arming, .finalizing].contains(input.videoState)) {
            return projection(
                .watch,
                "Recording",
                "Getting the recording ready",
                "Quipsly is starting or safely finishing the local file.",
                "Keep Quipsly open until the recording is ready or saved.",
                evidence
            )
        }

        if !input.sessionSafeToRecord {
            return projection(
                .intervene,
                "Before recording",
                "Recording is not ready yet",
                input.sessionNextAction,
                "Complete the highlighted item, then tap Record again.",
                evidence
            )
        }

        if videoRelevant && input.videoProfileLabel == nil {
            return projection(
                .watch,
                "Camera",
                "Camera is not ready yet",
                "Quipsly still needs to confirm the selected lens and recording quality.",
                "Tap Prepare camera, check the preview, then start recording.",
                evidence
            )
        }

        if let providerError = nonempty(input.providerError) {
            return projection(
                .watch,
                "Call",
                "The call needs attention",
                providerError,
                "Reconnect the call. The local recording remains separate.",
                evidence
            )
        }

        if !input.providerConnected && input.mode != .soloVideo {
            return projection(
                .watch,
                "Call",
                input.providerConnecting ? "Joining the call" : "Call is not connected",
                "Joining the call does not start recording.",
                "Join the call, then tap Record when everyone is ready.",
                evidence
            )
        }

        return projection(
            .ready,
            "Ready",
            "Ready to record",
            "The call and \(CaptureDeviceVocabulary.thisDevicePossessive) recorder are ready.",
            "Tap Record when everyone is ready. Sound check is optional.",
            evidence
        )
    }

    private static func evidenceRows(
        _ input: CaptureSessionGuardianInput
    ) -> [CaptureSessionGuardianEvidenceRow] {
        let audioValue = input.mode.usesStandaloneAudioRecorder
            ? "\(human(input.audioState.rawValue)) · \(nonempty(input.audioRoute) ?? "route unavailable")"
            : "Not selected for this mode"
        let videoValue: String
        if input.mode.recordsVideo {
            let profile = input.videoProfileLabel ?? "profile not prepared"
            let capacity = input.videoEstimatedMinutes.map { " · about \($0) min available" } ?? ""
            videoValue = "\(human(String(describing: input.videoState))) · \(profile)\(capacity)"
        } else {
            videoValue = "Not selected for this mode"
        }
        let roomValue = input.providerConnected
            ? "Connected"
            : input.providerConnecting ? "Connecting" : "Not connected"
        let capacityValue = input.audioAvailableBytes.map {
            ByteCountFormatter.string(fromByteCount: $0, countStyle: .file)
        } ?? "Not measured"
        return [
            CaptureSessionGuardianEvidenceRow(lane: "Session", value: input.sessionSafeToRecord ? "Local start allowed" : "Held by readiness"),
            CaptureSessionGuardianEvidenceRow(lane: "Conversation", value: roomValue),
            CaptureSessionGuardianEvidenceRow(lane: "Microphone", value: audioValue),
            CaptureSessionGuardianEvidenceRow(lane: "Camera", value: videoValue),
            CaptureSessionGuardianEvidenceRow(lane: "Storage", value: capacityValue),
        ]
    }

    private static func projection(
        _ level: CaptureSessionGuardianLevel,
        _ eyebrow: String,
        _ title: String,
        _ detail: String,
        _ action: String,
        _ evidence: [CaptureSessionGuardianEvidenceRow]
    ) -> CaptureSessionGuardianProjection {
        CaptureSessionGuardianProjection(
            level: level,
            eyebrow: eyebrow,
            title: title,
            detail: detail,
            action: action,
            evidence: evidence
        )
    }

    private static func firstNonempty(_ values: String?...) -> String? {
        for value in values {
            if let normalized = nonempty(value) { return normalized }
        }
        return nil
    }

    private static func nonempty(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    private static func human(_ value: String) -> String {
        value.replacingOccurrences(of: "-", with: " ").capitalized
    }
}

struct CaptureSessionGuardianCard: View {
    @Environment(\.scenePhase) private var scenePhase
    @ObservedObject var audioCapture: AudioCaptureController
    @ObservedObject var videoCapture: VideoCaptureController

    let session: MobileCaptureSession
    let mode: CaptureRecordingMode
    let providerConnected: Bool
    let providerConnecting: Bool
    let providerError: String?

    @State private var showsEvidence = false

    private var projection: CaptureSessionGuardianProjection {
        CaptureSessionGuardianProjector.project(
            CaptureSessionGuardianInput(
                sessionSafeToRecord: localStartReady,
                sessionNextAction: localStartNextAction,
                mode: mode,
                audioState: audioCapture.captureState,
                audioDuration: audioCapture.currentDuration,
                audioAveragePowerDB: audioCapture.inputLevelDB,
                audioPeakPowerDB: audioCapture.peakInputLevelDB,
                audioRoute: audioCapture.inputRouteName,
                audioAvailableBytes: audioCapture.availableCaptureCapacityBytes,
                audioAutomaticStopReason: audioCapture.automaticStopReason,
                audioError: audioCapture.lastErrorMessage ?? audioCapture.failureMessage,
                videoState: videoCapture.state,
                videoProfileLabel: videoCapture.resolvedProfile.map {
                    $0.profileLabel
                },
                videoEstimatedMinutes: videoCapture.estimatedAvailableMinutes,
                videoSafetyMessage: videoCapture.safetyMessage,
                videoError: videoCapture.lastErrorMessage,
                providerConnected: providerConnected,
                providerConnecting: providerConnecting,
                providerError: providerError,
                appIsActive: scenePhase == .active
            )
        )
    }

    private var localStartReady: Bool {
        switch mode {
        case .audio:
            session.canRecordNow
        case .podcastAV:
            session.canRecordVideoNow == true
                && (session.canRecordAudioNow ?? session.canRecordNow)
        case .soloVideo:
            session.canRecordVideoNow == true
                && (session.canRecordAudioNow ?? session.canRecordNow)
        case .podcastCamera:
            session.canRecordVideoNow == true
        }
    }

    private var localStartNextAction: String {
        if mode.recordsVideo,
           let next = videoCaptureNextAction {
            return next
        }
        return session.captureReadinessNextAction
    }

    private var videoCaptureNextAction: String? {
        let value = session.videoCaptureReadiness?.nextAction?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? nil : value
    }

    @ViewBuilder var body: some View {
        if shouldPresent {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: iconName)
                        .font(.headline)
                        .foregroundStyle(tint)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(projection.eyebrow)
                            .font(.caption2.weight(.black))
                            .textCase(.uppercase)
                            .tracking(1.1)
                        Text(projection.title)
                            .font(.headline)
                        Text(projection.detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }

                Text("Next: \(projection.action)")
                    .font(.caption.weight(.bold))
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(10)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.background.opacity(0.72), in: RoundedRectangle(cornerRadius: 12))

                DisclosureGroup("Details", isExpanded: $showsEvidence) {
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(projection.evidence) { row in
                            HStack(alignment: .top, spacing: 8) {
                                Text(row.lane)
                                    .font(.caption2.weight(.black))
                                    .frame(width: 92, alignment: .leading)
                                Text(row.value)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .frame(maxWidth: .infinity, alignment: .leading)
                            }
                        }
                        Text("Call audio is for conversation. \(CaptureDeviceVocabulary.thisDevicePossessive) saved recording is the high-quality copy.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.top, 8)
                }
                .font(.caption.weight(.bold))
                .accessibilityIdentifier("CaptureSessionGuardianEvidence")
            }
            .padding(14)
            .background(tint.opacity(0.10), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(tint.opacity(0.35), lineWidth: 1)
            }
            .accessibilityElement(children: .contain)
            .accessibilityIdentifier("CaptureSessionGuardian")
        }
    }

    /// Routine lobby and ready-to-record states already have obvious controls.
    /// The Guardian earns space only for an actionable problem or while it is
    /// actively protecting a recording transition.
    private var shouldPresent: Bool {
        projection.level == .intervene
            || [.preparing, .recording, .paused, .finalizing].contains(audioCapture.captureState)
            || [.preparing, .arming, .recording, .paused, .finalizing].contains(videoCapture.state)
            || providerConnecting
            || providerError?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false
    }

    private var tint: Color {
        switch projection.level {
        case .ready: .green
        case .watch: .orange
        case .intervene: .red
        }
    }

    private var iconName: String {
        switch projection.level {
        case .ready: "checkmark.shield.fill"
        case .watch: "exclamationmark.triangle.fill"
        case .intervene: "exclamationmark.shield.fill"
        }
    }
}
