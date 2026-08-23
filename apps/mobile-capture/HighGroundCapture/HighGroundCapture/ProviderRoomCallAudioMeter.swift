import AVFoundation
import Foundation

#if canImport(LiveKit)
@preconcurrency import LiveKit

/// Observes LiveKit's exact local microphone input while a call is joined.
/// It computes transient levels only: no PCM is retained, written, uploaded,
/// transcribed, or treated as Quipsly recording consent.
final class ProviderRoomCallAudioMeter: NSObject, @unchecked Sendable, AudioRenderer {
    typealias LevelHandler = @Sendable (ProviderAudioPCMLevelSnapshot, Date) -> Void

    private let stateLock = NSLock()
    private let minimumDeliveryInterval: TimeInterval
    private let onLevels: LevelHandler
    private var isAttached = false
    private var lastDeliveryAt: Date?

    init(
        minimumDeliveryInterval: TimeInterval = 0.1,
        onLevels: @escaping LevelHandler
    ) {
        self.minimumDeliveryInterval = max(0.05, minimumDeliveryInterval)
        self.onLevels = onLevels
        super.init()
    }

    func start() {
        stateLock.lock()
        guard !isAttached else {
            stateLock.unlock()
            return
        }
        isAttached = true
        lastDeliveryAt = nil
        stateLock.unlock()
        AudioManager.shared.add(localAudioRenderer: self)
    }

    func stop() {
        stateLock.lock()
        let shouldDetach = isAttached
        isAttached = false
        lastDeliveryAt = nil
        stateLock.unlock()
        if shouldDetach {
            AudioManager.shared.remove(localAudioRenderer: self)
        }
    }

    @objc func render(pcmBuffer: AVAudioPCMBuffer) {
        let now = Date()
        stateLock.lock()
        let shouldDeliver: Bool
        if isAttached,
           lastDeliveryAt.map({ now.timeIntervalSince($0) >= minimumDeliveryInterval }) ?? true {
            lastDeliveryAt = now
            shouldDeliver = true
        } else {
            shouldDeliver = false
        }
        stateLock.unlock()
        guard shouldDeliver else { return }
        onLevels(ProviderAudioPCMLevelAnalyzer.levels(for: pcmBuffer), now)
    }

    deinit {
        stop()
    }
}
#endif
