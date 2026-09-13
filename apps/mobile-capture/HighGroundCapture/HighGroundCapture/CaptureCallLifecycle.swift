import Foundation

/// Main-actor-owned operation identities. An old asynchronous join cannot
/// resume after leave/reset, and a new join waits for all teardown owners.
struct CaptureCallLifecycle {
    private var connectionID: UUID?
    private var teardownIDs: Set<UUID> = []

    mutating func beginConnection() -> UUID? {
        guard connectionID == nil, teardownIDs.isEmpty else { return nil }
        let id = UUID()
        connectionID = id
        return id
    }

    func isCurrentConnection(_ id: UUID) -> Bool { connectionID == id }

    mutating func finishConnection(_ id: UUID) {
        if connectionID == id { connectionID = nil }
    }

    mutating func beginTeardown() -> UUID {
        connectionID = nil
        let id = UUID()
        teardownIDs.insert(id)
        return id
    }

    mutating func finishTeardown(_ id: UUID) { teardownIDs.remove(id) }
}
