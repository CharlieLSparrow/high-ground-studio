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
struct LocalAudioSignalClassificationHarness {
    static func main() {
        require(
            LocalAudioSignalClassification.isVeryLowLevel(
                rmsDbfs: -60.58,
                samplePeakDbfs: -43.49
            ),
            "a retained source rejected by ASR with Morbo's measured levels should be labeled very low"
        )
        require(
            LocalAudioSignalClassification.isEffectivelySilentForSpeech(
                rmsDbfs: -60.58,
                samplePeakDbfs: -43.49,
                nearSilentFrameFraction: 0.9,
                loudnessStatus: "below-absolute-gate"
            ),
            "very-low gated source should explain an empty speech result instead of inviting repeated paid retries"
        )
        require(
            !LocalAudioSignalClassification.isVeryLowLevel(
                rmsDbfs: -45,
                samplePeakDbfs: -18
            ),
            "ordinary quiet speech must remain usable"
        )
        require(
            !LocalAudioSignalClassification.isVeryLowLevel(
                rmsDbfs: -52,
                samplePeakDbfs: -28
            ),
            "a quiet close-mic voice with healthy peaks must not be called empty"
        )
        require(
            !LocalAudioSignalClassification.isEffectivelySilentForSpeech(
                rmsDbfs: -60,
                samplePeakDbfs: -30,
                nearSilentFrameFraction: 0.95,
                loudnessStatus: "below-absolute-gate"
            ),
            "the speech-empty claim remains conservative when source peaks could contain a real utterance"
        )

        print("PASS Local audio signal classification distinguishes effectively empty takes from quiet speech.")
    }
}
