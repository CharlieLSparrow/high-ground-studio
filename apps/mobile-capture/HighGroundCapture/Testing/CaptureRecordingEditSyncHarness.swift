import Foundation

@MainActor
final class RecordingEditTestServer {
    var revision = 3
    var state = CaptureRecordingEditDraft(selected: ["source"], startSeconds: 3, endSeconds: 13, title: "Browser draft",
        outputMediaKind: "audio", primaryVideoSourceId: "", excludedTranscriptKeys: ["job:segment"], editing: true, baseOutputId: nil, baseOutputRevision: nil)
    var lastRequestID: String?
    var calls: [String] = []
    var failNextSave = false
    var loseNextResponse = false
    var failNextLoad = false
    var currentOwner = "device-owner"

    func send(_ request: URLRequest, owner: String) async throws -> (Data, HTTPURLResponse) {
        precondition(owner == currentOwner)
        if request.httpMethod != "PUT", failNextLoad {
            failNextLoad = false
            throw URLError(.notConnectedToInternet)
        }
        var status = 200
        var failure: [String: Any]?
        if request.httpMethod == "PUT", let body = request.httpBody {
            let value = try JSONSerialization.jsonObject(with: body) as! [String: Any]
            let requestID = value["clientRequestId"] as! String
            calls.append(requestID)
            precondition(value["actorUserId"] as? String == "coach")
            if failNextSave { failNextSave = false; throw URLError(.notConnectedToInternet) }
            if requestID != lastRequestID {
                if value["expectedRevision"] as? Int != revision {
                    status = 409
                    failure = ["ok": false, "code": "RECORDING_EDIT_CONFLICT", "currentRevision": revision, "error": "Changed on another device"]
                } else {
                    state = try JSONDecoder().decode(CaptureRecordingEditDraft.self, from: JSONSerialization.data(withJSONObject: value["state"]!))
                    revision += 1
                    lastRequestID = requestID
                }
            }
            if loseNextResponse { loseNextResponse = false; throw URLError(.networkConnectionLost) }
        }
        let encodedState = try JSONSerialization.jsonObject(with: JSONEncoder().encode(state))
        let response = failure ?? ["ok": true, "actorUserId": "coach", "edit": ["revision": revision, "state": encodedState, "updatedAt": "2026-09-13T12:00:00Z"]]
        return (try JSONSerialization.data(withJSONObject: response), HTTPURLResponse(url: request.url!, statusCode: status, httpVersion: nil, headerFields: nil)!)
    }
}

@main
struct CaptureRecordingEditSyncHarness {
    @MainActor
    static func main() async throws {
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("quipsly-native-edit-tests-\(UUID().uuidString)", isDirectory: true)
        let server = RecordingEditTestServer()
        func sync() -> CaptureRecordingEditSync {
            CaptureRecordingEditSync(baseURL: URL(string: "http://localhost:3012")!, directory: directory,
                owner: { server.currentOwner }, send: { request, owner in try await server.send(request, owner: owner) })
        }
        func draft(_ title: String, start: Double = 4, cuts: [String] = ["job:segment"], outputID: String? = nil) -> CaptureRecordingEditDraft {
            CaptureRecordingEditDraft(selected: ["source"], startSeconds: start, endSeconds: 13, title: title,
                outputMediaKind: "audio", primaryVideoSourceId: "", excludedTranscriptKeys: cuts, editing: true, baseOutputId: outputID, baseOutputRevision: nil)
        }
        var history = CaptureRecordingEditHistory(draft("A"))
        history.record(draft("B"), at: 1)
        history.record(draft("C"), at: 1.2)
        precondition(history.undo() == draft("A") && !history.canUndo)
        precondition(history.redo() == draft("C"))
        history.record(draft("C", start: 5), at: 1.3)
        precondition(history.undo() == draft("C"))
        history.record(draft("C", cuts: []), at: 1.4)
        precondition(!history.canRedo && history.undo() == draft("C"))
        history.record(draft("New preview", outputID: "preview-2"), at: 2)
        precondition(!history.canUndo && !history.canRedo)
        print("PASS native undo groups typing, separates trims/cuts, branches after undo, and resets for a new preview")
        let first = sync()
        await first.load(roomID: "room", takeID: "start:take")
        precondition(first.state == server.state && first.state?.startSeconds == 3)
        let json = try JSONSerialization.jsonObject(with: JSONEncoder().encode(first.state!)) as! [String: Any]
        precondition(json["baseOutputId"] is NSNull && json["baseOutputRevision"] is NSNull)
        first.update(draft("Native edit"))
        await first.flush()
        precondition(server.revision == 4 && server.state.title == "Native edit")
        print("PASS web-compatible draft decode, explicit null encoding, and native save")

        server.revision += 1
        first.update(draft("My current edit"))
        await first.flush()
        precondition(first.conflictRevision == 5 && server.revision == 5)
        await first.keepThisEdit()
        precondition(server.revision == 6 && server.state.title == "My current edit")
        print("PASS conflict keeps local work until explicit resolution")

        server.failNextSave = true
        first.update(draft("Offline edit"))
        await first.flush()
        precondition(first.needsRetry && server.revision == 6)
        let replayID = server.calls.last!
        let reopened = sync()
        await reopened.load(roomID: "room", takeID: "start:take")
        precondition(server.revision == 7 && server.state.title == "Offline edit" && server.calls.last == replayID)
        print("PASS failed save survives editor recreation and retries the original request")

        server.loseNextResponse = true
        reopened.update(draft("Acknowledgement lost"))
        await reopened.flush()
        precondition(server.revision == 8 && reopened.needsRetry)
        let restored = sync()
        await restored.load(roomID: "room", takeID: "start:take")
        precondition(server.revision == 8 && restored.state?.title == "Acknowledgement lost" && !restored.needsRetry)
        print("PASS lost acknowledgement replays without duplicate revision")

        server.failNextLoad = true
        let interruptedLoad = sync()
        await interruptedLoad.load(roomID: "room", takeID: "start:take")
        let callsBeforeLoadRetry = server.calls.count
        interruptedLoad.update(draft("Defaults must not replace saved work"))
        await interruptedLoad.flush()
        precondition(interruptedLoad.loadedTakeID == nil && interruptedLoad.error != nil)
        precondition(interruptedLoad.status == "Edit sync unavailable" && server.calls.count == callsBeforeLoadRetry)
        await interruptedLoad.load(roomID: "room", takeID: "start:take")
        precondition(interruptedLoad.state == server.state && interruptedLoad.error == nil)
        print("PASS interrupted initial load is recoverable without overwriting saved work")

        let beforeUndo = interruptedLoad.state
        interruptedLoad.update(draft("Undo this title"))
        precondition(interruptedLoad.canUndo && interruptedLoad.undo() == beforeUndo)
        precondition(interruptedLoad.canRedo && interruptedLoad.redo() == draft("Undo this title"))
        await interruptedLoad.flush()
        precondition(server.state.title == "Undo this title" && !interruptedLoad.needsRetry)
        print("PASS undo and redo update the same durable server draft")

        let callsBeforeSwitch = server.calls.count
        server.currentOwner = "different-owner"
        restored.update(draft("Wrong account"))
        await restored.flush()
        precondition(server.calls.count == callsBeforeSwitch && restored.state?.title != "Wrong account")
        print("PASS account switch cannot send an old account's editing state")
    }
}
