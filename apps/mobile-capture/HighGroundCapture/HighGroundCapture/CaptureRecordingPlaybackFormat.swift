import Foundation

enum CaptureRecordingPlaybackFormat {
    nonisolated static func fileExtension(fileName: String, isVideo: Bool) -> String {
        let candidate = URL(fileURLWithPath: fileName).pathExtension.lowercased()
        // Keep the actual container format. AVFoundation can reject valid CAF
        // source bytes if the protected cache labels them as an MPEG-4 file.
        let allowed = ["aac", "caf", "m4a", "mp3", "ogg", "wav", "webm", "m4v", "mov", "mp4"]
        return allowed.contains(candidate) ? candidate : (isVideo ? "mp4" : "m4a")
    }
}
