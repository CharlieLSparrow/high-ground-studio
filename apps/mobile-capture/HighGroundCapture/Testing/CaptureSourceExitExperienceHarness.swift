import Foundation

private func require(
    _ condition: @autoclosure () -> Bool,
    _ message: String
) {
    guard condition() else {
        fputs("FAIL \(message)\n", stderr)
        exit(1)
    }
}
@main
struct CaptureSourceExitExperienceHarness {
    static func main() {
        let safe = CaptureSourceExitExperience.resolve(
            state: "SAFE_TO_LEAVE",
            safeToLeaveAllEndpoints: true,
            safeForServerObservedSources: true,
            requiredSourceCount: 2,
            serverSafeRequiredSourceCount: 2,
            pendingCaptureCount: 0
        )
        require(safe.title == "Recording is safe", "safe evidence needs one ordinary answer")
        require(safe.isSafe, "safe evidence must be visually distinguishable")
        require(safe.detail.contains("You can leave"), "safe evidence must answer whether the person can move on")

        let draining = CaptureSourceExitExperience.resolve(
            state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED",
            safeToLeaveAllEndpoints: false,
            safeForServerObservedSources: true,
            requiredSourceCount: 2,
            serverSafeRequiredSourceCount: 2,
            pendingCaptureCount: 0
        )
        require(draining.title == "Cloud copies are safe", "verified cloud bytes must not sound lost")
        require(!draining.needsAttention, "normal device drain must not be framed as an error")
        require(draining.detail.contains("still shows an upload or recovery"), "draining guidance must identify the affected devices")

        let uploading = CaptureSourceExitExperience.resolve(
            state: "SERVER_COPY_INCOMPLETE",
            safeToLeaveAllEndpoints: false,
            safeForServerObservedSources: false,
            requiredSourceCount: 2,
            serverSafeRequiredSourceCount: 1,
            pendingCaptureCount: 1
        )
        require(uploading.title == "Keep Quipsly open", "incomplete upload must give the immediate safe action")
        require(uploading.detail.contains("1 of 2 expected recordings"), "uploading guidance must preserve useful progress")

        let missing = CaptureSourceExitExperience.resolve(
            state: "PARTICIPANT_SOURCE_INCOMPLETE",
            safeToLeaveAllEndpoints: false,
            safeForServerObservedSources: true,
            requiredSourceCount: 2,
            serverSafeRequiredSourceCount: 1,
            pendingCaptureCount: 0
        )
        require(missing.needsAttention, "a missing participant master must remain visible")
        require(missing.detail.contains("already captured stays protected"), "recovery copy must reduce source-loss anxiety truthfully")

        let none = CaptureSourceExitExperience.resolve(
            state: "NO_CAPTURE_EVIDENCE",
            safeToLeaveAllEndpoints: false,
            safeForServerObservedSources: false,
            requiredSourceCount: 0,
            serverSafeRequiredSourceCount: 0,
            pendingCaptureCount: 0
        )
        require(none.title == "No recording found yet", "no evidence must never be presented as upload progress")
        require(none.needsAttention, "no evidence must remain an explicit attention state")

        print("PASS Capture source-exit evidence stays exact underneath one conventional post-call answer.")
    }
}
