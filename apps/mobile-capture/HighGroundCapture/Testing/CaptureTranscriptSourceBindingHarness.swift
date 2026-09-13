import Foundation

@main
struct CaptureTranscriptSourceBindingHarness {
    static func main() {
        let hash = String(repeating: "a", count: 64)
        func matches(asset: String = "current", checksum: String? = nil, bytes: String = "100", verified: Bool? = true) -> Bool {
            CaptureTranscriptSourceBinding.matches(recordingAssetID: "current", verifiedSHA256: hash, verifiedBytes: 100,
                sourceAssetID: asset, sourceSHA256: checksum ?? hash, sourceBytes: bytes, exactBytesVerified: verified)
        }
        precondition(matches())
        precondition(matches(checksum: hash.uppercased()))
        precondition(!matches(asset: "older-recording-in-same-session"))
        precondition(!matches(checksum: String(repeating: "b", count: 64)))
        precondition(!matches(bytes: "101"))
        precondition(!matches(verified: false))
        precondition(!matches(verified: nil))
        precondition(!CaptureTranscriptSourceBinding.matches(recordingAssetID: nil, verifiedSHA256: nil, verifiedBytes: nil,
            sourceAssetID: "current", sourceSHA256: hash, sourceBytes: "100", exactBytesVerified: true))
        print("PASS post-call transcript binding: exact recording, hash, byte count, verification; old and unverified sources rejected")
    }
}
