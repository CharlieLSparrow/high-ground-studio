import Foundation

/// Shared interpretation of decoded source levels. A single sample peak can be
/// a tap, handling noise, or codec transient; it is not proof that intelligible
/// speech was captured. Whole-source RMS plus a deliberately generous peak
/// ceiling distinguishes an effectively empty take from ordinary quiet speech
/// without changing or normalizing the retained master.
enum LocalAudioSignalClassification {
    nonisolated static let veryLowRmsDbfs = -55.0
    nonisolated static let veryLowPeakDbfs = -35.0

    nonisolated static func isVeryLowLevel(
        rmsDbfs: Double,
        samplePeakDbfs: Double
    ) -> Bool {
        rmsDbfs.isFinite
            && samplePeakDbfs.isFinite
            && rmsDbfs <= veryLowRmsDbfs
            && samplePeakDbfs <= veryLowPeakDbfs
    }

    nonisolated static func isEffectivelySilentForSpeech(
        rmsDbfs: Double,
        samplePeakDbfs: Double,
        nearSilentFrameFraction: Double,
        loudnessStatus: String?
    ) -> Bool {
        isVeryLowLevel(
            rmsDbfs: rmsDbfs,
            samplePeakDbfs: samplePeakDbfs
        ) && (nearSilentFrameFraction >= 0.5
            || loudnessStatus == "below-absolute-gate")
    }
}
