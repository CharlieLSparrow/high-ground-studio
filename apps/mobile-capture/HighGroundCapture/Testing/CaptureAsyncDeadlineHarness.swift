import Foundation

enum HarnessFailure: Error { case deadline, provider }

@main
struct CaptureAsyncDeadlineHarness {
    static func main() async throws {
        let quick = try await CaptureAsyncDeadline.run(seconds: 3600, timeoutError: HarnessFailure.deadline) { 42 }
        precondition(quick == 42)
        do {
            let _: Int = try await CaptureAsyncDeadline.run(seconds: 3600, timeoutError: HarnessFailure.deadline) { throw HarnessFailure.provider }
            preconditionFailure("Provider errors must pass through")
        } catch HarnessFailure.provider {}

        // This deliberately ignores cancellation, like an OS result stream.
        let started = ContinuousClock.now
        do {
            let _: Int = try await CaptureAsyncDeadline.run(seconds: 0.02, timeoutError: HarnessFailure.deadline) {
                await withCheckedContinuation { continuation in
                    DispatchQueue.global().asyncAfter(deadline: .now() + 2) { continuation.resume(returning: 7) }
                }
            }
            preconditionFailure("Deadline must release a wedged operation")
        } catch HarnessFailure.deadline {}
        precondition(started.duration(to: .now) < .seconds(1))

        let cancelled = Task {
            try await CaptureAsyncDeadline.run(seconds: 3600, timeoutError: HarnessFailure.deadline) {
                await withCheckedContinuation { (continuation: CheckedContinuation<Int, Never>) in
                    DispatchQueue.global().asyncAfter(deadline: .now() + 2) { continuation.resume(returning: 9) }
                }
            }
        }
        try await Task.sleep(for: .milliseconds(10))
        let cancellationStarted = ContinuousClock.now
        cancelled.cancel()
        do { _ = try await cancelled.value; preconditionFailure("Cancellation must escape") }
        catch is CancellationError {}
        precondition(cancellationStarted.duration(to: .now) < .seconds(1))

        // Cancellation and callback completion can precede registration.
        let gate = CaptureAsyncResultGate<Int>()
        gate.finish(.failure(CancellationError()))
        do {
            let _: Int = try await withCheckedThrowingContinuation { continuation in
                precondition(!gate.install(continuation))
            }
            preconditionFailure("Early cancellation must reach the waiter")
        } catch is CancellationError {}
        let cleanup = Counter()
        gate.onFinish { cleanup.increment() }
        gate.finish(.success(123))
        precondition(cleanup.value == 1)

        // Reentrant cleanup must not deadlock; late callbacks cannot resume twice.
        for _ in 0..<100 {
            let race = CaptureAsyncResultGate<Int>()
            let count = Counter()
            race.onFinish { count.increment(); race.finish(.success(-1)) }
            let result: Int = try await withCheckedThrowingContinuation { continuation in
                precondition(race.install(continuation))
                DispatchQueue.concurrentPerform(iterations: 8) { race.finish(.success($0)) }
            }
            precondition((0..<8).contains(result))
            precondition(count.value == 1)
        }
        // Let the ignored-cancellation callbacks arrive and prove they are harmless.
        try await Task.sleep(for: .milliseconds(2100))
        print("PASS: deadline, parent cancellation, late callbacks, early registration and 100 completion races")
    }
}

nonisolated final class Counter: @unchecked Sendable {
    private let lock = NSLock()
    private var storage = 0
    var value: Int { lock.withLock { storage } }
    func increment() { lock.withLock { storage += 1 } }
}
