import Foundation

enum CaptureTranscriptSourceBinding {
    nonisolated static func matches(recordingAssetID: String?, verifiedSHA256: String?, verifiedBytes: Int64?,
                                    sourceAssetID: String, sourceSHA256: String?, sourceBytes: String?, exactBytesVerified: Bool?) -> Bool {
        guard let recordingAssetID, !recordingAssetID.isEmpty,
              let verifiedSHA256, verifiedSHA256.count == 64,
              let verifiedBytes, verifiedBytes > 0 else { return false }
        return recordingAssetID == sourceAssetID && exactBytesVerified == true
            && verifiedSHA256.lowercased() == sourceSHA256?.lowercased()
            && String(verifiedBytes) == sourceBytes
    }
}
