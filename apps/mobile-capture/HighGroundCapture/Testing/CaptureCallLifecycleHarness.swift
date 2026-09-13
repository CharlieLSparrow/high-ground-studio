import Foundation

@main
enum CaptureCallLifecycleHarness {
    static func main() {
        var lifecycle = CaptureCallLifecycle()
        let first = lifecycle.beginConnection()!
        precondition(lifecycle.beginConnection() == nil, "A double tap must not start two joins")
        let leave = lifecycle.beginTeardown()
        precondition(!lifecycle.isCurrentConnection(first), "Leave cancels a suspended join immediately")
        precondition(lifecycle.beginConnection() == nil, "Do not join while local media is closing")
        let providerCleanup = lifecycle.beginTeardown()
        lifecycle.finishTeardown(leave)
        precondition(lifecycle.beginConnection() == nil, "Nested SDK cleanup must also finish before rejoin")
        lifecycle.finishTeardown(providerCleanup)
        let second = lifecycle.beginConnection()!
        precondition(second != first && lifecycle.isCurrentConnection(second))
        lifecycle.finishConnection(first)
        lifecycle.finishTeardown(leave)
        precondition(lifecycle.isCurrentConnection(second), "Delayed old completions cannot invalidate a new join")
        lifecycle.finishConnection(second)
        let third = lifecycle.beginConnection()!
        let reset = lifecycle.beginTeardown()
        precondition(!lifecycle.isCurrentConnection(third), "CallKit reset invalidates pending microphone publication")
        lifecycle.finishTeardown(reset)
        precondition(lifecycle.beginConnection() != nil, "Recovery remains available after cleanup")
        print("PASS native call lifecycle: duplicate join, cancelled join, nested teardown, stale completions, reset and rejoin")
    }
}
