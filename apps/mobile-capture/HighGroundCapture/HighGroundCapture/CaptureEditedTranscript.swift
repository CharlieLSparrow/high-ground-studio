import Foundation

/// The server projects corrected words onto the saved rendered edit, including
/// ripple cuts and crossfades. Native playback never remaps the source clock.
struct CaptureEditedTranscript: Decodable {
    struct Passage: Decodable {
        let text: String
        let speakerLabel: String?
        let startSeconds: Double
        let endSeconds: Double
    }
    let ok: Bool
    let outputId: String
    let outputSha256: String
    let segments: [Passage]
    let notice: String?

    func matches(outputID: String, sha256: String?, duration: Double?) -> Bool {
        guard let duration, duration.isFinite, duration > 0,
              let sha256, sha256.count == 64 else { return false }
        return ok && outputId == outputID && outputSha256 == sha256
            && segments.allSatisfy { $0.startSeconds.isFinite && $0.endSeconds.isFinite
                && $0.startSeconds >= 0 && $0.endSeconds > $0.startSeconds
                && $0.endSeconds <= duration + 0.25 }
    }
}
