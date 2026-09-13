import Foundation

/// Navigation identity for one call visit. It never changes source ownership,
/// upload state, or the session's canonical recording groups.
struct CaptureCallRecordingIdentity {
    let id: UUID
    let roomID: String?
}

struct CaptureCompletedCall: Equatable, Identifiable {
    let id = UUID()
    let roomID: String
    let recordingIDs: Set<UUID>
}

struct CaptureCallRecordingScope {
    let roomID: String
    let existingRecordingIDs: Set<UUID>

    func complete(recordings: [CaptureCallRecordingIdentity]) -> CaptureCompletedCall {
        CaptureCompletedCall(roomID: roomID, recordingIDs: Set(recordings.compactMap {
            $0.roomID == roomID && !existingRecordingIDs.contains($0.id) ? $0.id : nil
        }))
    }
}
