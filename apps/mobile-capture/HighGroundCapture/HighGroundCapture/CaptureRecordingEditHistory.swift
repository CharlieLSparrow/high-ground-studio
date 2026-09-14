import Foundation

/// In-session undo groups a typing/slider gesture, while every draft still
/// reaches the local outbox immediately. Published previews start a new history.
struct CaptureRecordingEditHistory {
    private var values: [CaptureRecordingEditDraft] = []
    private var cursor = -1
    private var lastFacet: String?
    private var lastChange: TimeInterval = 0
    var canUndo: Bool { cursor > 0 }
    var canRedo: Bool { cursor >= 0 && cursor < values.count - 1 }

    init(_ initial: CaptureRecordingEditDraft? = nil) {
        if let initial { values = [initial]; cursor = 0 }
    }

    mutating func record(_ draft: CaptureRecordingEditDraft, at time: TimeInterval = Date.timeIntervalSinceReferenceDate) {
        guard cursor >= 0 else { self = Self(draft); return }
        let previous = values[cursor]
        guard draft != previous else { return }
        guard draft.baseOutputId == previous.baseOutputId else { self = Self(draft); return }
        let facet = changedFacet(previous, draft)
        if facet.isEmpty {
            // Opening editing controls or receiving a render status update is
            // not an edit that should consume Undo.
            values[cursor] = draft
            return
        }
        if cursor == values.count - 1 && cursor > 0 && lastFacet == facet && time >= lastChange && time - lastChange < 0.8 {
            values[cursor] = draft
        } else {
            values = Array(values.prefix(cursor + 1))
            values.append(draft)
            if values.count > 100 { values.removeFirst() }
            cursor = values.count - 1
        }
        lastFacet = facet
        lastChange = time
    }

    mutating func undo() -> CaptureRecordingEditDraft? {
        guard canUndo else { return nil }
        cursor -= 1
        lastFacet = nil
        return values[cursor]
    }

    mutating func redo() -> CaptureRecordingEditDraft? {
        guard canRedo else { return nil }
        cursor += 1
        lastFacet = nil
        return values[cursor]
    }

    private func changedFacet(_ a: CaptureRecordingEditDraft, _ b: CaptureRecordingEditDraft) -> String {
        var fields: [String] = []
        if a.title != b.title { fields.append("title") }
        if a.startSeconds != b.startSeconds { fields.append("start") }
        if a.endSeconds != b.endSeconds { fields.append("end") }
        if a.selected != b.selected { fields.append("sources") }
        if a.outputMediaKind != b.outputMediaKind { fields.append("media") }
        if a.primaryVideoSourceId != b.primaryVideoSourceId { fields.append("camera") }
        if a.excludedTranscriptKeys != b.excludedTranscriptKeys { fields.append("passages") }
        if (a.manualCuts ?? []) != (b.manualCuts ?? []) { fields.append("timeline-cuts") }
        return fields.joined(separator: ":")
    }
}
