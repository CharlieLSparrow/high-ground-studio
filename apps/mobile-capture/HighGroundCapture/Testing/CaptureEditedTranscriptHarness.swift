import Foundation

@main
struct CaptureEditedTranscriptHarness {
    static func main() throws {
        let sha = String(repeating: "a", count: 64)
        let data = Data("""
        {"ok":true,"outputId":"edit-1","outputSha256":"\(sha)","segments":[
          {"text":"A corrected next step.","speakerLabel":"Riley","startSeconds":3.99,"endSeconds":5}
        ],"notice":"Some recording tracks do not have a transcript yet."}
        """.utf8)
        let transcript = try JSONDecoder().decode(CaptureEditedTranscript.self, from: data)
        precondition(transcript.matches(outputID: "edit-1", sha256: sha, duration: 8))
        precondition(transcript.segments[0].startSeconds == 3.99)
        precondition(transcript.segments[0].speakerLabel == "Riley")
        precondition(!transcript.matches(outputID: "edit-2", sha256: sha, duration: 8))
        precondition(!transcript.matches(outputID: "edit-1", sha256: String(repeating: "b", count: 64), duration: 8))
        precondition(!transcript.matches(outputID: "edit-1", sha256: sha, duration: 4))
        precondition(!transcript.matches(outputID: "edit-1", sha256: sha, duration: .nan))
        precondition(!transcript.matches(outputID: "edit-1", sha256: nil, duration: 8))
        for (start, end) in [(-1.0, 2.0), (2.0, 2.0), (3.0, 2.0)] {
            let invalid = CaptureEditedTranscript(ok: true, outputId: "edit-1", outputSha256: sha,
                segments: [.init(text: "Invalid", speakerLabel: nil, startSeconds: start, endSeconds: end)], notice: nil)
            precondition(!invalid.matches(outputID: "edit-1", sha256: sha, duration: 8))
        }
        let empty = CaptureEditedTranscript(ok: true, outputId: "edit-1", outputSha256: sha, segments: [], notice: "No transcript yet.")
        precondition(empty.matches(outputID: "edit-1", sha256: sha, duration: 8))
        print("PASS edited transcript JSON decoding, rendered identity, ripple timestamps, incomplete coverage, and invalid timing")
    }
}
