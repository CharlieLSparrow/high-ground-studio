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
        require(safe.title == "Safe to close", "safe evidence needs the same ordinary answer on every Quipsly client")
        require(safe.isSafe, "safe evidence must be visually distinguishable")
        require(safe.detail.contains("finished its queue"), "safe evidence must include both cloud and device completion")

        let draining = CaptureSourceExitExperience.resolve(
            state: "SERVER_COPY_COMPLETE_DEVICE_CONFIRMATION_REQUIRED",
            safeToLeaveAllEndpoints: false,
            safeForServerObservedSources: true,
            requiredSourceCount: 2,
            serverSafeRequiredSourceCount: 2,
            pendingCaptureCount: 0
        )
        require(draining.title == "Keep Quipsly open", "an undrained recording device needs one immediate action")
        require(!draining.needsAttention, "normal device drain must not be framed as an error")
        require(draining.detail.contains("One recording device is still finishing up"), "draining guidance must identify the affected device")
        require(draining.detail.contains("Keep Quipsly open there"), "draining guidance must explain the one action to take")

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
