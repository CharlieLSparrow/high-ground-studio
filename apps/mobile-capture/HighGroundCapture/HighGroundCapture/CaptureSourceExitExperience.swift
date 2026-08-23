import Foundation

/// Plain-language projection of Quipsly's retained-source and endpoint evidence.
///
/// The underlying evidence remains exact and inspectable. This projection is the
/// ordinary product surface: one answer about whether a person can move on, plus
/// a short recovery instruction when they cannot.
struct CaptureSourceExitExperience: Equatable, Sendable {
    let title: String
    let detail: String
    let systemImage: String
    let isSafe: Bool
    let needsAttention: Bool

    static func resolve(
        state: String,
        safeToLeaveAllEndpoints: Bool,
        safeForServerObservedSources: Bool,
        requiredSourceCount: Int,
        serverSafeRequiredSourceCount: Int,
        pendingCaptureCount: Int
    ) -> CaptureSourceExitExperience {
        if safeToLeaveAllEndpoints {
            return CaptureSourceExitExperience(
                title: "Recording is safe",
                detail: "Every expected recording has a verified cloud copy. You can leave this session.",
                systemImage: "checkmark.icloud.fill",
                isSafe: true,
                needsAttention: false
            )
        }

        switch state.uppercased() {
        case "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED":
            return CaptureSourceExitExperience(
                title: "Cloud copies are safe",
                detail: "Keep Quipsly open on any device that still shows an upload or recovery. You can keep working here.",
                systemImage: "icloud.and.arrow.up",
                isSafe: false,
                needsAttention: false
            )
        case "PLANNED_SOURCE_INCOMPLETE", "PARTICIPANT_SOURCE_INCOMPLETE":
            return CaptureSourceExitExperience(
                title: "A recording needs attention",
                detail: "One expected recording has not arrived. Anything already captured stays protected while you review it.",
                systemImage: "exclamationmark.triangle.fill",
                isSafe: false,
                needsAttention: true
            )
        case "NO_CAPTURE_EVIDENCE":
            return CaptureSourceExitExperience(
                title: "No recording found yet",
                detail: "Quipsly has not received a recording for this session. Check the recording devices before leaving.",
                systemImage: "waveform.badge.exclamationmark",
                isSafe: false,
                needsAttention: true
            )
        default:
            let verifiedCount = min(
                max(0, serverSafeRequiredSourceCount),
                max(0, requiredSourceCount)
            )
            let progress: String
            if requiredSourceCount > 0 {
                progress = " \(verifiedCount) of \(requiredSourceCount) expected recording\(requiredSourceCount == 1 ? "" : "s") are safely in the cloud."
            } else if pendingCaptureCount > 0 {
                progress = " Quipsly is still waiting for recording data."
            } else {
                progress = ""
            }
            return CaptureSourceExitExperience(
                title: safeForServerObservedSources ? "Finishing recording" : "Keep Quipsly open",
                detail: "Quipsly is still protecting and uploading this session.\(progress)",
                systemImage: "icloud.and.arrow.up",
                isSafe: false,
                needsAttention: false
            )
        }
    }
}
