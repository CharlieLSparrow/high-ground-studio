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
struct ProviderRoomCallAudioEvidenceHarness {
    static func main() {
        let now = Date(timeIntervalSince1970: 1_787_500_000)

        func health(
            connected: Bool = true,
            muted: Bool = false,
            average: Float = -24,
            peak: Float = -9,
            receivedAt: Date? = nil
        ) -> ProviderRoomCallAudioHealth {
            ProviderRoomCallAudioEvidence.resolve(
                isConnected: connected,
                isMuted: muted,
                averagePowerDBFS: average,
                peakPowerDBFS: peak,
                receivedPCMAt: receivedAt,
                now: now
            )
        }

        require(
            health(connected: false) == .checking,
            "a disconnected room must not imply that audio is being observed"
        )
        require(
            health(muted: true, receivedAt: now) == .muted,
            "a deliberately muted microphone must not be reported as broken"
        )
        require(
            health(receivedAt: nil) == .checking,
            "an unmuted room waiting for its first PCM buffer must show checking"
        )
        require(
            health(average: -160, peak: -160, receivedAt: now) == .noSignal,
            "observed digital silence must be a no-signal state"
        )
        require(
            health(average: -70, peak: -52, receivedAt: now) == .tooQuiet,
            "very low speech must be called low in ordinary language"
        )
        require(
            health(average: -24, peak: -9, receivedAt: now) == .healthy,
            "representative speech with headroom must be healthy"
        )
        require(
            health(average: -11.5, peak: -5, receivedAt: now) == .hot,
            "high average level must be loud before it clips"
        )
        require(
            health(average: -18, peak: -0.8, receivedAt: now) == .clippingRisk,
            "near-full-scale speech must expose clipping risk"
        )
        require(
            health(
                receivedAt: now.addingTimeInterval(
                    -(ProviderRoomCallAudioEvidence.staleInputInterval + 0.1)
                )
            ) == .needsAttention,
            "a previously live microphone that stops delivering PCM must need attention"
        )
        require(
            ProviderRoomCallAudioHealth.healthy.detail == nil,
            "healthy audio must not clutter the call with instructions"
        )
        require(
            ProviderRoomCallAudioHealth.noSignal.detail?.contains("Speak once") == true,
            "no-signal recovery must be short and actionable"
        )
        require(
            ProviderRoomCallAudioHealth.clippingRisk.title == "Microphone may clip",
            "ordinary call copy must avoid unexplained technical units"
        )

        print("PASS Provider room call audio evidence keeps live mic confidence plain, transient, and distinct from recording.")
    }
}
