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
                "Protected recovery",
                "The retained source needs attention",
                failure,
                "Keep the saved local source, correct the device or capacity problem, then begin a new take.",
                evidence
            )
        }

        if (audioRelevant && input.audioState == .failed)
            || (videoRelevant && input.videoState == .failed) {
            return projection(
                .intervene,
                "Protected recovery",
                "A local source is held for review",
                "Quipsly did not promote this source as a healthy completed master.",
                "Open Library, retain the protected file, and review its exact failure evidence before retrying.",
                evidence
            )
        }

        if captureActive {
            if !input.appIsActive {
                return projection(
                    .watch,
                    "Background capture",
                    "A protected source is active while Capture is not visible",
                    "Audio may continue under its recorded background contract; video closes safely when iOS backgrounds the camera.",
                    "Return to Quipsly Capture and confirm the current source state before continuing the Session.",
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
                        "\(ByteCountFormatter.string(fromByteCount: available, countStyle: .file)) remains available to the retained microphone source.",
                        "Plan to end this take soon. Quipsly will stop before its protected reserve is consumed.",
                        evidence
                    )
                }
                if input.audioDuration < 2 {
                    return projection(
                        .watch,
                        "Signal baseline",
                        "Listening for a stable microphone level",
                        "Quipsly waits two seconds before treating an initial quiet meter as a missing signal.",
                        "Speak naturally and watch for the Guardian to settle before continuing the take.",
                        evidence
                    )
                }
                if input.audioPeakPowerDB >= -1 {
                    return projection(
                        .intervene,
                        "Live retained-source watch",
                        "The microphone is reaching clipping risk",
                        "Recorder sample peak is within 1 dB of digital full scale. This is dBFS evidence, not true peak or LUFS.",
                        "Lower input gain now. End and restart the take if clipping continues.",
                        evidence
                    )
                }
                if input.audioAveragePowerDB < -60 && input.audioPeakPowerDB < -54 {
                    return projection(
                        .intervene,
                        "Live retained-source watch",
                        "No useful microphone signal is reaching the master",
                        "The retained recorder is active, but its observed average and peak remain below the useful-signal threshold.",
                        "Check mute, cable, route, and microphone power now. Stop the take if signal does not return.",
                        evidence
                    )
                }
                if input.audioPeakPowerDB >= -3 || input.audioAveragePowerDB >= -12 {
                    return projection(
                        .watch,
                        "Live retained-source watch",
                        "The microphone is running hot",
                        "The retained source has not reached the clipping threshold, but it has little remaining headroom.",
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
                    "Independent capture",
                    "Retained master continues while the conversation is unavailable",
                    "The iPhone recorder is independent from the provider call and preserves its own source clock and bytes.",
                    "Reconnect the conversation without changing Session or source identity. Stop locally only if the conversation cannot recover.",
                    evidence
                )
            }

            return projection(
                .ready,
                "Session Guardian",
                "Protected iPhone source is recording",
                "The selected local master is active and the live conversation remains a separate path.",
                "Keep Capture visible, monitor with headphones, and stop from Quipsly when the take is complete.",
                evidence
            )
        }

        if (audioRelevant && [.preparing, .finalizing].contains(input.audioState))
            || (videoRelevant && [.preparing, .arming, .finalizing].contains(input.videoState)) {
            return projection(
                .watch,
                "Protected transition",
                "Quipsly is changing retained-source state",
                "The recorder is preparing or finalizing a protected local file.",
                "Keep Capture open until the source reaches a stable ready, saved, or recovery state.",
                evidence
            )
        }

        if !input.sessionSafeToRecord {
            return projection(
                .intervene,
                "Recording boundary",
                "Session readiness is holding the local start",
                input.sessionNextAction,
                "Complete the highlighted consent or Session requirement before recording.",
                evidence
            )
        }

        if videoRelevant && input.videoProfileLabel == nil {
            return projection(
                .watch,
                "Camera preflight",
                "Prepare the exact camera profile",
                "Quipsly has not yet resolved the selected lens, dimensions, frame rate, orientation, audio inclusion, and capacity estimate.",
                "Tap Prepare camera, review the measured profile, then start the retained source.",
                evidence
            )
        }

        if let providerError = nonempty(input.providerError) {
            return projection(
                .watch,
                "Conversation path",
                "The provider room needs attention",
                providerError,
                "Repair the conversation path. Local capture stays explicit and independent.",
                evidence
            )
        }

        if !input.providerConnected && input.mode != .soloVideo {
            return projection(
                .watch,
                "Conversation preflight",
                input.providerConnecting ? "Joining the conversation" : "Live conversation is not connected",
                "Joining never starts a retained source, and a prepared recorder never proves live presence.",
                "Join when collaboration is needed, then start the retained source explicitly after everyone is ready.",
                evidence
            )
        }

        return projection(
            .ready,
            "Session Guardian",
            "iPhone paths are ready for a deliberate start",
            "Session readiness, the selected local source, and the live conversation have no observed blocker.",
            "Start recording when everyone is ready. The private sound check remains optional.",
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
            CaptureSessionGuardianEvidenceRow(lane: "Audio master", value: audioValue),
            CaptureSessionGuardianEvidenceRow(lane: "Camera master", value: videoValue),
            CaptureSessionGuardianEvidenceRow(lane: "Audio capacity", value: capacityValue),
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

    var body: some View {
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

            DisclosureGroup("Why Quipsly says this", isExpanded: $showsEvidence) {
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
                    Text("The live conversation is not a retained master. Local-source claims require this iPhone's recorder and preserved file evidence.")
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
