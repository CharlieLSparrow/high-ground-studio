import Foundation

struct CaptureTaskTagSelection: Equatable {
    var tagIDs: [String] = []
    var newTagLabels: [String] = []

    var body: [String: Any] { ["tagIds": tagIDs.sorted(), "newTagLabels": newTagLabels] }
    var isValid: Bool {
        Set(tagIDs).count == tagIDs.count && tagIDs.count + newTagLabels.count <= 24
            && newTagLabels.count <= 8
            && newTagLabels.allSatisfy { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && $0.utf16.count <= 80 }
    }
}

/// The editable values of canonical work, not a second stored work model.
struct CaptureCoachingWorkDraft: Equatable {
    let kind: String
    var title: String
    var body: String
    var visibility: String
    var ownerUserID: String
    var status: String
    var targetAt: String?
    var tags: CaptureTaskTagSelection? = nil

    var fields: [String: String] {
        var values = ["title": title, "body": body]
        if kind == "NOTE" { values["visibility"] = visibility }
        else {
            values["ownerUserId"] = ownerUserID
            values["status"] = status
            values["targetAt"] = targetAt ?? ""
        }
        return values
    }

    func createBody(requestID: String) -> [String: Any] {
        var values: [String: Any] = ["clientRequestId": requestID, "kind": kind, "title": title, "body": body]
        if kind == "NOTE" { values["visibility"] = visibility }
        else {
            values["ownerUserId"] = ownerUserID
            values["targetAt"] = targetAt.map { $0 as Any } ?? NSNull()
        }
        if kind == "TASK", let tags { values["tags"] = tags.body }
        return values
    }

    /// Change only fields edited since the first attempt. A successful retry may
    /// return work that another participant has already updated.
    func amendment(from original: Self, to latest: Self) -> (body: [String: Any], conflicts: [String]) {
        var values = latest.fields
        var conflicts: [String] = []
        for (key, value) in fields where value != original.fields[key] {
            if latest.fields[key] != original.fields[key] && latest.fields[key] != value {
                conflicts.append(key)
            }
            values[key] = value
        }
        var body: [String: Any] = values.mapValues { $0 as Any }
        if kind != "NOTE", values["targetAt"] == "" { body["targetAt"] = NSNull() }
        return (body, conflicts.sorted())
    }
}

struct CaptureCoachingCreateAttempt {
    let requestID: String
    let original: CaptureCoachingWorkDraft
    var sourceMessageID: String? = nil
    var body: [String: Any] {
        var body = original.createBody(requestID: requestID)
        if let sourceMessageID { body["sourceMessageId"] = sourceMessageID }
        return body
    }
}
