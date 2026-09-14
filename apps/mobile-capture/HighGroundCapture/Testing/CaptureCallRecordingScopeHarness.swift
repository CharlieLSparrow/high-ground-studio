import Foundation

@main
enum CaptureCallRecordingScopeHarness {
    static func main() {
        let old = UUID(), current = UUID(), otherRoom = UUID(), late = UUID()
        let scope = CaptureCallRecordingScope(roomID: "call-1", existingRecordingIDs: [old])
        let completed = scope.complete(recordings: [
            .init(id: old, roomID: "call-1"),
            .init(id: current, roomID: "call-1"),
            .init(id: otherRoom, roomID: "call-2"),
            .init(id: late, roomID: nil)
        ])
        precondition(completed.recordingIDs == [current], "A call must not claim older takes or another session's recordings")
        precondition(scope.complete(recordings: [.init(id: old, roomID: "call-1")]).recordingIDs.isEmpty,
                     "Leaving without recording must not open the latest old recording")
        let reconnect = scope.complete(recordings: [
            .init(id: old, roomID: "call-1"), .init(id: current, roomID: "call-1"), .init(id: late, roomID: "call-1")
        ])
        precondition(reconnect.recordingIDs == [current, late], "Reconnected parts remain in the original call visit")
        precondition(completed.recordingIDs == [current], "Later recordings must not change an already completed call")
        print("PASS call recording scope: exact visit, room isolation, no recording, reconnects, stable completion")
    }
}
