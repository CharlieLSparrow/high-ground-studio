import Foundation

/// A single terminal result plus resource cleanup, including cancellation that
/// arrives before a callback API has installed its continuation or task.
nonisolated final class CaptureAsyncResultGate<Value: Sendable>: @unchecked Sendable {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<Value, Error>?
    private var pendingResult: Result<Value, Error>?
    private var finished = false
    private var installed = false
    private var cleanup: [@Sendable () -> Void] = []

    func install(_ continuation: CheckedContinuation<Value, Error>) -> Bool {
        lock.lock()
        precondition(!installed, "A result gate has one waiter")
        installed = true
        if finished {
            let result = pendingResult!
            pendingResult = nil
            lock.unlock()
            continuation.resume(with: result)
            return false
        }
        self.continuation = continuation
        lock.unlock()
        return true
    }

    func onFinish(_ action: @escaping @Sendable () -> Void) {
        lock.lock()
        if finished {
            lock.unlock()
            action()
        } else {
            cleanup.append(action)
            lock.unlock()
        }
    }

    func finish(_ result: Result<Value, Error>) {
        lock.lock()
        guard !finished else { lock.unlock(); return }
        finished = true
        let continuation = self.continuation
        self.continuation = nil
        if continuation == nil { pendingResult = result }
        let cleanup = self.cleanup
        self.cleanup.removeAll()
        lock.unlock()
        // Release the waiter without waiting for a wedged provider. Cleanup is
        // outside the lock: cancelling a callback API may reenter finish().
        continuation?.resume(with: result)
        cleanup.forEach { $0() }
    }
}

nonisolated enum CaptureAsyncDeadline {
    static func run<Value: Sendable>(
        seconds: Double,
        timeoutError: any Error,
        operation: @escaping @Sendable () async throws -> Value
    ) async throws -> Value {
        let gate = CaptureAsyncResultGate<Value>()
        return try await withTaskCancellationHandler {
            try Task.checkCancellation()
            return try await withCheckedThrowingContinuation { continuation in
                guard gate.install(continuation) else { return }
                let operationTask = Task {
                    do {
                        try Task.checkCancellation()
                        gate.finish(.success(try await operation()))
                    } catch { gate.finish(.failure(error)) }
                }
                gate.onFinish { operationTask.cancel() }
                let timer = Task {
                    do { try await Task.sleep(for: .seconds(seconds.isFinite ? max(0, seconds) : 0)) }
                    catch { return }
                    gate.finish(.failure(timeoutError))
                }
                gate.onFinish { timer.cancel() }
            }
        } onCancel: {
            gate.finish(.failure(CancellationError()))
        }
    }
}
