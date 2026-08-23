import AVFoundation
import Foundation

#if canImport(LiveKit)
@preconcurrency import LiveKit

/// Records the exact local-input PCM stream already owned by LiveKit.
///
/// A connected CallKit/LiveKit room must not compete with a second independent
/// microphone client. This adapter observes LiveKit's local input and feeds the
/// SDK's file recorder instead. Removing the renderer pauses private capture
/// while the file writer preserves elapsed timeline as silence for later
/// double-ended alignment.
final class ProviderAudioMasterRecorder: NSObject, @unchecked Sendable, AudioRenderer {
    struct MeterSnapshot: Sendable {
        let averagePowerDB: Float
        let peakPowerDB: Float
        let receivedPCMAt: Date?
    }

    private let recorder: AudioMixRecorder
    private let source: AudioMixRecorderSource
    private let stateLock = NSLock()

    private var acceptsPCM = false
    private var didReportFirstPCM = false
    private var startedAt: Date?
    private var stoppedAt: Date?
    private var averagePowerDB: Float = -160
    private var peakPowerDB: Float = -160
    private var receivedPCMAt: Date?

    var onFirstPCMBuffer: (@Sendable () -> Void)?

    init(fileURL: URL, audioSettings: [String: Any]) throws {
        recorder = try AudioMixRecorder(
            filePath: fileURL,
            audioSettings: audioSettings
        )
        source = recorder.addSource()
        super.init()
    }

    func start(at date: Date = Date()) throws {
        try recorder.start()
        stateLock.quipslyLocked {
            startedAt = date
            stoppedAt = nil
            acceptsPCM = true
            didReportFirstPCM = false
            averagePowerDB = -160
            peakPowerDB = -160
            receivedPCMAt = nil
        }
        AudioManager.shared.add(localAudioRenderer: self)
    }

    func pause() {
        let shouldDetach = stateLock.quipslyLocked {
            let wasAccepting = acceptsPCM
            acceptsPCM = false
            averagePowerDB = -160
            peakPowerDB = -160
            return wasAccepting
        }
        if shouldDetach {
            AudioManager.shared.remove(localAudioRenderer: self)
        }
    }

    func resume() {
        let shouldAttach = stateLock.quipslyLocked {
            guard recorder.isRecording, !acceptsPCM else { return false }
            acceptsPCM = true
            didReportFirstPCM = false
            receivedPCMAt = nil
            return true
        }
        if shouldAttach {
            AudioManager.shared.add(localAudioRenderer: self)
        }
    }

    func stop(at date: Date = Date()) {
        pause()
        stateLock.quipslyLocked {
            stoppedAt = date
        }
        // LiveKit drains its utility writer queue and closes AVAudioFile before
        // returning, so the caller can immediately run Quipsly's full-file
        // validation and durable finalization boundary.
        recorder.stop()
    }

    var currentTime: TimeInterval {
        stateLock.quipslyLocked {
            guard let startedAt else { return 0 }
            return max(0, (stoppedAt ?? Date()).timeIntervalSince(startedAt))
        }
    }

    var isReceivingPCM: Bool {
        stateLock.quipslyLocked {
            acceptsPCM && receivedPCMAt != nil
        }
    }

    var meterSnapshot: MeterSnapshot {
        stateLock.quipslyLocked {
            MeterSnapshot(
                averagePowerDB: averagePowerDB,
                peakPowerDB: peakPowerDB,
                receivedPCMAt: receivedPCMAt
            )
        }
    }

    @objc func render(pcmBuffer: AVAudioPCMBuffer) {
        let acceptsPCM = stateLock.quipslyLocked { self.acceptsPCM }
        guard acceptsPCM else { return }

        // AudioMixRecorderSource performs the SDK-owned format conversion and
        // schedules the buffer without opening another hardware input.
        source.render(pcmBuffer: pcmBuffer)

        let levels = ProviderAudioPCMLevelAnalyzer.levels(for: pcmBuffer)
        var firstPCMCallback: (@Sendable () -> Void)?
        stateLock.quipslyLocked {
            averagePowerDB = levels.averagePowerDBFS
            peakPowerDB = levels.peakPowerDBFS
            receivedPCMAt = Date()
            if !didReportFirstPCM {
                didReportFirstPCM = true
                firstPCMCallback = onFirstPCMBuffer
            }
        }
        firstPCMCallback?()
    }

}

private extension NSLock {
    @discardableResult
    func quipslyLocked<Result>(_ operation: () throws -> Result) rethrows -> Result {
        lock()
        defer { unlock() }
        return try operation()
    }
}
#endif
