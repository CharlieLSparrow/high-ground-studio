import AVFoundation
import AudioToolbox
import CryptoKit
import Foundation

#if os(macOS)
import CoreAudio

public enum ProductionAudioRecordingState: String, Codable, Equatable, Sendable {
    case inProgress = "in-progress"
    case finalized
    case interrupted
    case failed
}

public enum ProductionAudioRouteContinuityStatus:
    String,
    Codable,
    Equatable,
    Sendable
{
    case locked
    case lost
}

public enum ProductionAudioRouteContinuityReason:
    String,
    Codable,
    Equatable,
    Sendable
{
    case exactRoute = "exact-route"
    case expectedRouteUnavailable =
        "expected-route-unavailable"
    case activeRouteMismatch = "active-route-mismatch"
    case engineStopped = "engine-stopped"
    case writerFailed = "writer-failed"
    case frameFlowStalled = "frame-flow-stalled"
}

public struct ProductionAudioRouteContinuityEvidence:
    Codable,
    Equatable,
    Sendable
{
    public let expectedInputUID: String
    public let observedInputUID: String?
    public let status: ProductionAudioRouteContinuityStatus
    public let reason: ProductionAudioRouteContinuityReason
    public let evaluatedAt: Date
    public let truth: String

    public var isLocked: Bool {
        status == .locked
            && reason == .exactRoute
            && observedInputUID == expectedInputUID
    }
}

public struct ProductionAudioRecordingLiveStatus:
    Equatable,
    Sendable
{
    public let recordingID: UUID
    public let frameCount: Int64
    public let durationSeconds: Double
    public let byteCount: Int64?
    public let routeContinuity:
        ProductionAudioRouteContinuityEvidence
}

public enum ProductionAudioRouteContinuityPolicy {
    public static func evaluate(
        expectedInputUID: String,
        expectedRouteIsAvailable: Bool,
        observedInputUID: String?,
        engineIsRunning: Bool,
        requireRunningEngine: Bool = true,
        writerFailure: String? = nil,
        frameFlowIsStalled: Bool = false,
        evaluatedAt: Date = Date()
    ) -> ProductionAudioRouteContinuityEvidence {
        let status: ProductionAudioRouteContinuityStatus
        let reason: ProductionAudioRouteContinuityReason
        let truth: String

        if let writerFailure {
            status = .lost
            reason = .writerFailed
            truth =
                "The exact selected microphone route could no longer write the local master: \(writerFailure)"
        } else if !expectedRouteIsAvailable {
            status = .lost
            reason = .expectedRouteUnavailable
            truth =
                "The exact selected microphone route disappeared from Core Audio. Quipsly held the take instead of accepting a fallback."
        } else if observedInputUID != expectedInputUID {
            status = .lost
            reason = .activeRouteMismatch
            truth =
                "The active recorder route no longer matches the exact selected microphone UID. Quipsly held the take instead of accepting a fallback."
        } else if requireRunningEngine && !engineIsRunning {
            status = .lost
            reason = .engineStopped
            truth =
                "The local-master audio engine stopped while the exact selected microphone route was required. Quipsly preserved the partial take for review."
        } else if frameFlowIsStalled {
            status = .lost
            reason = .frameFlowStalled
            truth =
                "The local-master writer stopped receiving audio frames. Quipsly preserved the partial take instead of claiming uninterrupted capture."
        } else {
            status = .locked
            reason = .exactRoute
            truth =
                "The exact selected microphone UID is available, remains assigned to the recorder, and is delivering the expected local-master route."
        }

        return ProductionAudioRouteContinuityEvidence(
            expectedInputUID: expectedInputUID,
            observedInputUID: observedInputUID,
            status: status,
            reason: reason,
            evaluatedAt: evaluatedAt,
            truth: truth
        )
    }
}

public struct ProductionAudioRecordingConfiguration: Equatable, Sendable {
    public let recordingID: UUID
    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let participantID: String
    public let ownerAccountID: String?
    public let callRoomID: String?
    public let recordingConsentID: String?
    public let startReceiptID: UUID?
    public let projectSlug: String?
    public let episodeSlug: String?
    public let capturePurpose: String?
    public let clockSamples: [ProductionCaptureClockSample]
    public let inputDevice: CaptureAudioDeviceSnapshot
    public let rootDirectory: URL

    public init(
        recordingID: UUID = UUID(),
        captureGroupID: UUID = UUID(),
        episodeSpaceID: String,
        participantID: String,
        ownerAccountID: String? = nil,
        callRoomID: String? = nil,
        recordingConsentID: String? = nil,
        startReceiptID: UUID? = nil,
        projectSlug: String? = nil,
        episodeSlug: String? = nil,
        capturePurpose: String? = nil,
        clockSamples: [ProductionCaptureClockSample] = [],
        inputDevice: CaptureAudioDeviceSnapshot,
        rootDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Movies/QuipslyCaptures", isDirectory: true)
    ) {
        self.recordingID = recordingID
        self.captureGroupID = captureGroupID
        self.episodeSpaceID = episodeSpaceID
        self.participantID = participantID
        self.ownerAccountID = ownerAccountID
        self.callRoomID = callRoomID
        self.recordingConsentID = recordingConsentID
        self.startReceiptID = startReceiptID
        self.projectSlug = projectSlug
        self.episodeSlug = episodeSlug
        self.capturePurpose = capturePurpose
        self.clockSamples = clockSamples
        self.inputDevice = inputDevice
        self.rootDirectory = rootDirectory
    }
}

public struct ProductionAudioRecordingReceipt: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let recordingID: UUID
    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let participantID: String
    public let ownerAccountID: String?
    public let callRoomID: String?
    public let recordingConsentID: String?
    public let startReceiptID: UUID?
    public let projectSlug: String?
    public let episodeSlug: String?
    public let capturePurpose: String?
    public let clockSamples: [ProductionCaptureClockSample]?
    public let clientKind: String
    public let sourceKind: String
    public let state: ProductionAudioRecordingState
    public let inputDevice: CaptureAudioDeviceSnapshot
    public let routeContinuity:
        ProductionAudioRouteContinuityEvidence?
    public let targetSampleRate: Double
    public let targetBitDepth: Int
    public let channelCount: Int
    public let startedAt: Date
    public let stoppedAt: Date?
    public let startedMonotonicNanoseconds: UInt64
    public let stoppedMonotonicNanoseconds: UInt64?
    public let frameCount: Int64
    public let durationSeconds: Double
    public let byteCount: Int64?
    public let sha256: String?
    public let recordingDirectoryPath: String
    public let audioPath: String
    public let partialAudioPath: String?
    public let failure: String?
    public let truth: String

    public var roomBinding: ProductionCaptureRoomBinding? {
        guard let ownerAccountID,
              let callRoomID,
              let recordingConsentID,
              let startReceiptID else {
            return nil
        }
        return ProductionCaptureRoomBinding(
            captureGroupID: captureGroupID,
            episodeSpaceID: episodeSpaceID,
            participantID: participantID,
            ownerAccountID: ownerAccountID,
            callRoomID: callRoomID,
            recordingConsentID: recordingConsentID,
            startReceiptID: startReceiptID,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            capturePurpose: capturePurpose
        )
    }

    public init(
        recordingID: UUID,
        configuration: ProductionAudioRecordingConfiguration,
        state: ProductionAudioRecordingState,
        channelCount: Int,
        startedAt: Date,
        stoppedAt: Date?,
        startedMonotonicNanoseconds: UInt64,
        stoppedMonotonicNanoseconds: UInt64?,
        frameCount: Int64,
        recordingDirectoryPath: String,
        audioPath: String,
        partialAudioPath: String?,
        byteCount: Int64?,
        sha256: String?,
        failure: String?,
        routeContinuity:
            ProductionAudioRouteContinuityEvidence? = nil
    ) {
        self.protocolVersion =
            routeContinuity == nil ? 1 : 2
        self.recordingID = recordingID
        self.captureGroupID = configuration.captureGroupID
        self.episodeSpaceID = configuration.episodeSpaceID
        self.participantID = configuration.participantID
        self.ownerAccountID = configuration.ownerAccountID
        self.callRoomID = configuration.callRoomID
        self.recordingConsentID = configuration.recordingConsentID
        self.startReceiptID = configuration.startReceiptID
        self.projectSlug = configuration.projectSlug
        self.episodeSlug = configuration.episodeSlug
        self.capturePurpose = configuration.capturePurpose
        self.clockSamples = configuration.clockSamples
        self.clientKind = "macos"
        self.sourceKind = "local_audio_master"
        self.state = state
        self.inputDevice = configuration.inputDevice
        self.routeContinuity = routeContinuity
        self.targetSampleRate = ProductionAudioRecorder.targetSampleRate
        self.targetBitDepth = ProductionAudioRecorder.targetBitDepth
        self.channelCount = channelCount
        self.startedAt = startedAt
        self.stoppedAt = stoppedAt
        self.startedMonotonicNanoseconds = startedMonotonicNanoseconds
        self.stoppedMonotonicNanoseconds = stoppedMonotonicNanoseconds
        self.frameCount = frameCount
        self.durationSeconds = Double(frameCount) / ProductionAudioRecorder.targetSampleRate
        self.byteCount = byteCount
        self.sha256 = sha256
        self.recordingDirectoryPath = recordingDirectoryPath
        self.audioPath = audioPath
        self.partialAudioPath = partialAudioPath
        self.failure = failure
        let normalizedDevice =
            "\(configuration.inputDevice.manufacturer ?? "") \(configuration.inputDevice.name)"
                .lowercased()
        let isVirtualRoute = normalizedDevice.contains("virtual")
            || normalizedDevice.contains("motiv mix")
        if state == .finalized,
           routeContinuity?.isLocked == true,
           isVirtualRoute {
            self.truth =
                "The WAV is finalized from the selected virtual Core Audio route. Hash, byte count, device UID, monotonic boundaries, and exact-route continuity describe this exact file, but the receipt does not prove a direct physical MV7i source."
        } else if state == .finalized,
                  routeContinuity?.isLocked == true {
            self.truth =
                "The WAV is a finalized local microphone master. Hash, byte count, device UID, monotonic boundaries, and exact-route continuity describe this exact file."
        } else if state == .finalized {
            self.truth =
                "The WAV is finalized, but this legacy receipt does not preserve exact-route continuity evidence. Hash, byte count, device UID, and monotonic boundaries describe the file; route review remains required."
        } else {
            self.truth =
                "This receipt is not a finalized master. Preserve the partial audio and review it explicitly; never upload or publish it as complete."
        }
    }
}

public struct InterruptedProductionAudioRecording: Identifiable, Equatable, Sendable {
    public let id: UUID
    public let directory: URL
    public let partialAudioURL: URL
    public let receiptURL: URL
    public let receipt: ProductionAudioRecordingReceipt?

    public init(
        id: UUID,
        directory: URL,
        partialAudioURL: URL,
        receiptURL: URL,
        receipt: ProductionAudioRecordingReceipt?
    ) {
        self.id = id
        self.directory = directory
        self.partialAudioURL = partialAudioURL
        self.receiptURL = receiptURL
        self.receipt = receipt
    }
}

public enum ProductionAudioRecorderError: LocalizedError, Equatable {
    case alreadyRecording
    case notRecording
    case microphonePermissionRequired
    case inputDeviceUnavailable(String)
    case inputDeviceHasNoChannels(String)
    case unsupportedSampleRate(Double)
    case unableToSelectInputDevice(OSStatus)
    case routeContinuityLost(String)
    case audioWriteFailed(String)
    case finalizationFailed(String)

    public var errorDescription: String? {
        switch self {
        case .alreadyRecording:
            "A local microphone master is already recording."
        case .notRecording:
            "No local microphone master is recording."
        case .microphonePermissionRequired:
            "Microphone permission is required before Quipsly can write a local master."
        case .inputDeviceUnavailable(let name):
            "The selected input device is no longer available: \(name)."
        case .inputDeviceHasNoChannels(let name):
            "The selected input device has no readable channels: \(name)."
        case .unsupportedSampleRate(let sampleRate):
            "The selected input is running at \(Int(sampleRate.rounded())) Hz. Quipsly requires an exact 48 kHz local-master route."
        case .unableToSelectInputDevice(let status):
            "Core Audio could not select the requested input device (OSStatus \(status))."
        case .routeContinuityLost(let detail):
            "The exact microphone route was lost and the take was held: \(detail)"
        case .audioWriteFailed(let detail):
            "The local master stopped because audio could not be written: \(detail)"
        case .finalizationFailed(let detail):
            "The local master exists as a partial take but could not be finalized: \(detail)"
        }
    }
}

@MainActor
public final class ProductionAudioRecorder {
    nonisolated public static let targetSampleRate = 48_000.0
    nonisolated public static let targetBitDepth = 24
    nonisolated public static let partialAudioFilename =
        "local-mic-master.partial.wav"
    nonisolated public static let finalizedAudioFilename =
        "local-mic-master.wav"
    nonisolated public static let receiptFilename = "source-receipt.json"

    public private(set) var activeReceipt: ProductionAudioRecordingReceipt?
    public private(set) var lastFinalizedReceipt: ProductionAudioRecordingReceipt?
    public var isRecording: Bool { session != nil }
    public private(set) var isFinalizing = false
    public var liveStatus:
        ProductionAudioRecordingLiveStatus? {
        guard let session else { return nil }
        let snapshot = session.writer.snapshot
        return ProductionAudioRecordingLiveStatus(
            recordingID: session.recordingID,
            frameCount: snapshot.frameCount,
            durationSeconds:
                Double(snapshot.frameCount)
                / Self.targetSampleRate,
            byteCount: Self.fileSize(
                at: session.partialAudioURL
            ),
            routeContinuity:
                routeContinuityEvidence(
                    expectedInputUID:
                        session.configuration
                            .inputDevice.id,
                    writerFailure: snapshot.failure
                )
        )
    }
    public var onRouteContinuityLost:
        (@MainActor (ProductionAudioRecordingReceipt) async -> Void)?

    private let engine = AVAudioEngine()
    private var session: RecordingSession?
    private var continuityTask: Task<Void, Never>?
    private var engineConfigurationObserver: NSObjectProtocol?
    private var lastObservedFrameCount: Int64 = 0
    private var lastFrameProgressMonotonicNanoseconds: UInt64 = 0
    private var routeLossIsBeingHandled = false

    public init() {
        engineConfigurationObserver =
            NotificationCenter.default.addObserver(
                forName: .AVAudioEngineConfigurationChange,
                object: engine,
                queue: nil
            ) { [weak self] _ in
                Task { @MainActor [weak self] in
                    await self?.evaluateActiveRouteContinuity()
                }
            }
    }

    deinit {
        if let engineConfigurationObserver {
            NotificationCenter.default.removeObserver(
                engineConfigurationObserver
            )
        }
        continuityTask?.cancel()
    }

    @discardableResult
    public func start(
        configuration: ProductionAudioRecordingConfiguration
    ) throws -> ProductionAudioRecordingReceipt {
        guard session == nil, !isFinalizing else {
            throw ProductionAudioRecorderError.alreadyRecording
        }
        guard AVCaptureDevice.authorizationStatus(for: .audio) == .authorized else {
            throw ProductionAudioRecorderError.microphonePermissionRequired
        }
        guard configuration.inputDevice.hasInput,
              let deviceID = MacAudioHardwareProbe.deviceID(
                forUID: configuration.inputDevice.id
              ) else {
            throw ProductionAudioRecorderError.inputDeviceUnavailable(
                configuration.inputDevice.name
            )
        }

        engine.stop()
        try selectInputDevice(deviceID)

        let inputNode = engine.inputNode
        let inputFormat = inputNode.outputFormat(forBus: 0)
        guard inputFormat.channelCount > 0 else {
            throw ProductionAudioRecorderError.inputDeviceHasNoChannels(
                configuration.inputDevice.name
            )
        }
        guard abs(inputFormat.sampleRate - Self.targetSampleRate) < 1 else {
            throw ProductionAudioRecorderError.unsupportedSampleRate(
                inputFormat.sampleRate
            )
        }
        let preflightContinuity = routeContinuityEvidence(
            expectedInputUID: configuration.inputDevice.id,
            requireRunningEngine: false
        )
        guard preflightContinuity.isLocked else {
            throw ProductionAudioRecorderError.routeContinuityLost(
                preflightContinuity.truth
            )
        }

        let recordingID = configuration.recordingID
        let startedAt = Date()
        let startedMonotonic = DispatchTime.now().uptimeNanoseconds
        let directory = Self.recordingDirectory(
            root: configuration.rootDirectory,
            episodeSpaceID: configuration.episodeSpaceID,
            recordingID: recordingID
        )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let partialAudioURL = directory.appendingPathComponent(
            Self.partialAudioFilename
        )
        let finalizedAudioURL = directory.appendingPathComponent(
            Self.finalizedAudioFilename
        )
        let receiptURL = directory.appendingPathComponent(Self.receiptFilename)
        let audioFile = try AVAudioFile(
            forWriting: partialAudioURL,
            settings: Self.localMasterFileSettings(
                channelCount: Int(inputFormat.channelCount)
            ),
            commonFormat: .pcmFormatFloat32,
            interleaved: false
        )
        let writer = RecordingWriter(audioFile: audioFile)
        let inProgress = ProductionAudioRecordingReceipt(
            recordingID: recordingID,
            configuration: configuration,
            state: .inProgress,
            channelCount: Int(inputFormat.channelCount),
            startedAt: startedAt,
            stoppedAt: nil,
            startedMonotonicNanoseconds: startedMonotonic,
            stoppedMonotonicNanoseconds: nil,
            frameCount: 0,
            recordingDirectoryPath: directory.path,
            audioPath: finalizedAudioURL.path,
            partialAudioPath: partialAudioURL.path,
            byteCount: nil,
            sha256: nil,
            failure: nil,
            routeContinuity: preflightContinuity
        )
        try Self.writeReceipt(inProgress, to: receiptURL)

        inputNode.installTap(
            onBus: 0,
            bufferSize: 4_096,
            format: inputFormat
        ) { buffer, _ in
            writer.write(buffer)
        }

        let lockedContinuity: ProductionAudioRouteContinuityEvidence
        do {
            engine.prepare()
            try engine.start()
            let runningContinuity = routeContinuityEvidence(
                expectedInputUID: configuration.inputDevice.id
            )
            guard runningContinuity.isLocked else {
                throw ProductionAudioRecorderError
                    .routeContinuityLost(
                        runningContinuity.truth
                    )
            }
            lockedContinuity = runningContinuity
        } catch {
            inputNode.removeTap(onBus: 0)
            engine.stop()
            let writerSnapshot = writer.closeAndSnapshot()
            let failedContinuity = routeContinuityEvidence(
                expectedInputUID: configuration.inputDevice.id,
                writerFailure:
                    writerSnapshot.failure
                        ?? error.localizedDescription
            )
            let failed = ProductionAudioRecordingReceipt(
                recordingID: recordingID,
                configuration: configuration,
                state: .failed,
                channelCount: Int(inputFormat.channelCount),
                startedAt: startedAt,
                stoppedAt: Date(),
                startedMonotonicNanoseconds: startedMonotonic,
                stoppedMonotonicNanoseconds: DispatchTime.now().uptimeNanoseconds,
                frameCount: writerSnapshot.frameCount,
                recordingDirectoryPath: directory.path,
                audioPath: finalizedAudioURL.path,
                partialAudioPath: partialAudioURL.path,
                byteCount: Self.fileSize(at: partialAudioURL),
                sha256: nil,
                failure: error.localizedDescription,
                routeContinuity: failedContinuity
            )
            try? Self.writeReceipt(failed, to: receiptURL)
            activeReceipt = failed
            throw error
        }

        let lockedInProgress =
            ProductionAudioRecordingReceipt(
                recordingID: recordingID,
                configuration: configuration,
                state: .inProgress,
                channelCount: Int(inputFormat.channelCount),
                startedAt: startedAt,
                stoppedAt: nil,
                startedMonotonicNanoseconds: startedMonotonic,
                stoppedMonotonicNanoseconds: nil,
                frameCount: 0,
                recordingDirectoryPath: directory.path,
                audioPath: finalizedAudioURL.path,
                partialAudioPath: partialAudioURL.path,
                byteCount: nil,
                sha256: nil,
                failure: nil,
                routeContinuity: lockedContinuity
            )
        try Self.writeReceipt(
            lockedInProgress,
            to: receiptURL
        )
        session = RecordingSession(
            configuration: configuration,
            recordingID: recordingID,
            startedAt: startedAt,
            startedMonotonicNanoseconds: startedMonotonic,
            channelCount: Int(inputFormat.channelCount),
            directory: directory,
            partialAudioURL: partialAudioURL,
            finalizedAudioURL: finalizedAudioURL,
            receiptURL: receiptURL,
            writer: writer
        )
        activeReceipt = lockedInProgress
        beginRouteContinuityMonitoring()
        return lockedInProgress
    }

    @discardableResult
    public func stop() async throws -> ProductionAudioRecordingReceipt {
        guard let session else {
            throw ProductionAudioRecorderError.notRecording
        }
        let stopContinuity = routeContinuityEvidence(
            expectedInputUID:
                session.configuration.inputDevice.id,
            writerFailure: session.writer.snapshot.failure
        )
        guard stopContinuity.isLocked else {
            _ = await interruptForRouteContinuityLoss(
                stopContinuity,
                notifyCoordinator: false
            )
            throw ProductionAudioRecorderError
                .routeContinuityLost(stopContinuity.truth)
        }

        stopRouteContinuityMonitoring()
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        self.session = nil
        isFinalizing = true
        defer { isFinalizing = false }

        let writerSnapshot = session.writer.closeAndSnapshot()
        let stoppedAt = Date()
        let stoppedMonotonic = DispatchTime.now().uptimeNanoseconds

        if let writeFailure = writerSnapshot.failure {
            let failedContinuity =
                ProductionAudioRouteContinuityPolicy.evaluate(
                    expectedInputUID:
                        session.configuration.inputDevice.id,
                    expectedRouteIsAvailable:
                        MacAudioHardwareProbe.deviceID(
                            forUID:
                                session.configuration.inputDevice.id
                        ) != nil,
                    observedInputUID:
                        currentInputDeviceUID(),
                    engineIsRunning: false,
                    writerFailure: writeFailure
                )
            let failed = ProductionAudioRecordingReceipt(
                recordingID: session.recordingID,
                configuration: session.configuration,
                state: .failed,
                channelCount: session.channelCount,
                startedAt: session.startedAt,
                stoppedAt: stoppedAt,
                startedMonotonicNanoseconds: session.startedMonotonicNanoseconds,
                stoppedMonotonicNanoseconds: stoppedMonotonic,
                frameCount: writerSnapshot.frameCount,
                recordingDirectoryPath: session.directory.path,
                audioPath: session.finalizedAudioURL.path,
                partialAudioPath: session.partialAudioURL.path,
                byteCount: Self.fileSize(at: session.partialAudioURL),
                sha256: nil,
                failure: writeFailure,
                routeContinuity: failedContinuity
            )
            try Self.writeReceipt(failed, to: session.receiptURL)
            activeReceipt = failed
            throw ProductionAudioRecorderError.audioWriteFailed(writeFailure)
        }

        do {
            let finalization = try await Task.detached(priority: .utility) {
                if FileManager.default.fileExists(
                    atPath: session.finalizedAudioURL.path
                ) {
                    try FileManager.default.removeItem(
                        at: session.finalizedAudioURL
                    )
                }
                try FileManager.default.moveItem(
                    at: session.partialAudioURL,
                    to: session.finalizedAudioURL
                )
                return (
                    Self.fileSize(at: session.finalizedAudioURL),
                    try Self.sha256(at: session.finalizedAudioURL)
                )
            }.value
            let finalized = ProductionAudioRecordingReceipt(
                recordingID: session.recordingID,
                configuration: session.configuration,
                state: .finalized,
                channelCount: session.channelCount,
                startedAt: session.startedAt,
                stoppedAt: stoppedAt,
                startedMonotonicNanoseconds: session.startedMonotonicNanoseconds,
                stoppedMonotonicNanoseconds: stoppedMonotonic,
                frameCount: writerSnapshot.frameCount,
                recordingDirectoryPath: session.directory.path,
                audioPath: session.finalizedAudioURL.path,
                partialAudioPath: nil,
                byteCount: finalization.0,
                sha256: finalization.1,
                failure: nil,
                routeContinuity: stopContinuity
            )
            try Self.writeReceipt(finalized, to: session.receiptURL)
            activeReceipt = finalized
            lastFinalizedReceipt = finalized
            return finalized
        } catch {
            let interrupted = ProductionAudioRecordingReceipt(
                recordingID: session.recordingID,
                configuration: session.configuration,
                state: .interrupted,
                channelCount: session.channelCount,
                startedAt: session.startedAt,
                stoppedAt: stoppedAt,
                startedMonotonicNanoseconds: session.startedMonotonicNanoseconds,
                stoppedMonotonicNanoseconds: stoppedMonotonic,
                frameCount: writerSnapshot.frameCount,
                recordingDirectoryPath: session.directory.path,
                audioPath: session.finalizedAudioURL.path,
                partialAudioPath: FileManager.default.fileExists(
                    atPath: session.partialAudioURL.path
                ) ? session.partialAudioURL.path : nil,
                byteCount: Self.fileSize(
                    at: FileManager.default.fileExists(
                        atPath: session.finalizedAudioURL.path
                    ) ? session.finalizedAudioURL : session.partialAudioURL
                ),
                sha256: nil,
                failure: error.localizedDescription,
                routeContinuity: stopContinuity
            )
            try? Self.writeReceipt(interrupted, to: session.receiptURL)
            activeReceipt = interrupted
            throw ProductionAudioRecorderError.finalizationFailed(
                error.localizedDescription
            )
        }
    }

    private func beginRouteContinuityMonitoring() {
        stopRouteContinuityMonitoring()
        guard let session else { return }
        lastObservedFrameCount =
            session.writer.snapshot.frameCount
        lastFrameProgressMonotonicNanoseconds =
            DispatchTime.now().uptimeNanoseconds
        continuityTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(
                    for: .milliseconds(200)
                )
                guard !Task.isCancelled else { return }
                await self?.evaluateActiveRouteContinuity()
            }
        }
    }

    private func stopRouteContinuityMonitoring() {
        continuityTask?.cancel()
        continuityTask = nil
        lastObservedFrameCount = 0
        lastFrameProgressMonotonicNanoseconds = 0
    }

    private func evaluateActiveRouteContinuity() async {
        guard let session,
              !isFinalizing,
              !routeLossIsBeingHandled else {
            return
        }
        let writerSnapshot = session.writer.snapshot
        let now = DispatchTime.now().uptimeNanoseconds
        if writerSnapshot.frameCount
            > lastObservedFrameCount {
            lastObservedFrameCount =
                writerSnapshot.frameCount
            lastFrameProgressMonotonicNanoseconds = now
        }
        let frameFlowIsStalled =
            lastFrameProgressMonotonicNanoseconds > 0
            && now
                >= lastFrameProgressMonotonicNanoseconds
                    + 3_000_000_000
        let continuity = routeContinuityEvidence(
            expectedInputUID:
                session.configuration.inputDevice.id,
            writerFailure: writerSnapshot.failure,
            frameFlowIsStalled: frameFlowIsStalled
        )
        guard !continuity.isLocked else { return }
        _ = await interruptForRouteContinuityLoss(
            continuity,
            notifyCoordinator: true
        )
    }

    private func routeContinuityEvidence(
        expectedInputUID: String,
        requireRunningEngine: Bool = true,
        writerFailure: String? = nil,
        frameFlowIsStalled: Bool = false
    ) -> ProductionAudioRouteContinuityEvidence {
        ProductionAudioRouteContinuityPolicy.evaluate(
            expectedInputUID: expectedInputUID,
            expectedRouteIsAvailable:
                MacAudioHardwareProbe.deviceID(
                    forUID: expectedInputUID
                ) != nil,
            observedInputUID: currentInputDeviceUID(),
            engineIsRunning: engine.isRunning,
            requireRunningEngine: requireRunningEngine,
            writerFailure: writerFailure,
            frameFlowIsStalled: frameFlowIsStalled
        )
    }

    private func currentInputDeviceUID() -> String? {
        guard let audioUnit = engine.inputNode.audioUnit else {
            return nil
        }
        var deviceID = AudioDeviceID(0)
        var byteCount =
            UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioUnitGetProperty(
            audioUnit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global,
            0,
            &deviceID,
            &byteCount
        )
        guard status == noErr, deviceID != 0 else {
            return nil
        }
        return MacAudioHardwareProbe.deviceUID(
            for: deviceID
        )
    }

    @discardableResult
    private func interruptForRouteContinuityLoss(
        _ continuity:
            ProductionAudioRouteContinuityEvidence,
        notifyCoordinator: Bool
    ) async -> ProductionAudioRecordingReceipt? {
        guard let session,
              !routeLossIsBeingHandled else {
            return activeReceipt
        }
        routeLossIsBeingHandled = true
        stopRouteContinuityMonitoring()
        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        self.session = nil
        isFinalizing = true

        let writerSnapshot =
            session.writer.closeAndSnapshot()
        let stoppedAt = Date()
        let stoppedMonotonic =
            DispatchTime.now().uptimeNanoseconds
        let partialPath =
            FileManager.default.fileExists(
                atPath: session.partialAudioURL.path
            )
            ? session.partialAudioURL.path
            : nil
        let partialHash: String? =
            await Task.detached(priority: .utility) {
                guard partialPath != nil else { return nil }
                return try? Self.sha256(
                    at: session.partialAudioURL
                )
            }.value
        let interrupted =
            ProductionAudioRecordingReceipt(
                recordingID: session.recordingID,
                configuration: session.configuration,
                state: .interrupted,
                channelCount: session.channelCount,
                startedAt: session.startedAt,
                stoppedAt: stoppedAt,
                startedMonotonicNanoseconds:
                    session.startedMonotonicNanoseconds,
                stoppedMonotonicNanoseconds:
                    stoppedMonotonic,
                frameCount: writerSnapshot.frameCount,
                recordingDirectoryPath:
                    session.directory.path,
                audioPath:
                    session.finalizedAudioURL.path,
                partialAudioPath: partialPath,
                byteCount: Self.fileSize(
                    at: session.partialAudioURL
                ),
                sha256: partialHash,
                failure: continuity.truth,
                routeContinuity: continuity
            )
        try? Self.writeReceipt(
            interrupted,
            to: session.receiptURL
        )
        activeReceipt = interrupted
        isFinalizing = false
        routeLossIsBeingHandled = false
        if notifyCoordinator,
           let onRouteContinuityLost {
            await onRouteContinuityLost(interrupted)
        }
        return interrupted
    }

    nonisolated public static func interruptedRecordings(
        in rootDirectory: URL
    ) -> [InterruptedProductionAudioRecording] {
        guard let episodeDirectories = try? FileManager.default.contentsOfDirectory(
            at: rootDirectory,
            includingPropertiesForKeys: [.isDirectoryKey],
            options: [.skipsHiddenFiles]
        ) else { return [] }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(
            ProductionCaptureDateCoding.decode
        )
        var results: [InterruptedProductionAudioRecording] = []
        for episodeDirectory in episodeDirectories {
            guard let recordingDirectories = try? FileManager.default.contentsOfDirectory(
                at: episodeDirectory,
                includingPropertiesForKeys: [.isDirectoryKey],
                options: [.skipsHiddenFiles]
            ) else { continue }
            for directory in recordingDirectories {
                let partial = directory.appendingPathComponent(partialAudioFilename)
                guard FileManager.default.fileExists(atPath: partial.path) else {
                    continue
                }
                let receiptURL = directory.appendingPathComponent(receiptFilename)
                let receipt: ProductionAudioRecordingReceipt?
                if let data = try? Data(contentsOf: receiptURL) {
                    receipt = try? decoder.decode(
                        ProductionAudioRecordingReceipt.self,
                        from: data
                    )
                } else {
                    receipt = nil
                }
                let id = receipt?.recordingID
                    ?? UUID(uuidString: directory.lastPathComponent)
                    ?? UUID()
                results.append(
                    InterruptedProductionAudioRecording(
                        id: id,
                        directory: directory,
                        partialAudioURL: partial,
                        receiptURL: receiptURL,
                        receipt: receipt
                    )
                )
            }
        }
        return results.sorted {
            $0.directory.path.localizedStandardCompare($1.directory.path)
                == .orderedAscending
        }
    }

    nonisolated public static func recordingDirectory(
        root: URL,
        episodeSpaceID: String,
        recordingID: UUID
    ) -> URL {
        root
            .appendingPathComponent(safePathComponent(episodeSpaceID), isDirectory: true)
            .appendingPathComponent(recordingID.uuidString.lowercased(), isDirectory: true)
    }

    nonisolated public static func safePathComponent(_ value: String) -> String {
        let normalized = value
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let allowed = CharacterSet.alphanumerics.union(
            CharacterSet(charactersIn: "-_")
        )
        let scalars = normalized.unicodeScalars.map {
            allowed.contains($0) ? Character(String($0)) : "-"
        }
        let collapsed = String(scalars)
            .replacingOccurrences(
                of: "-+",
                with: "-",
                options: .regularExpression
            )
            .trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        return collapsed.isEmpty ? "untitled-episode" : String(collapsed.prefix(80))
    }

    nonisolated static func localMasterFileSettings(
        channelCount: Int
    ) -> [String: Any] {
        [
            AVFormatIDKey: kAudioFormatLinearPCM,
            AVSampleRateKey: targetSampleRate,
            AVNumberOfChannelsKey: channelCount,
            AVLinearPCMBitDepthKey: targetBitDepth,
            AVLinearPCMIsBigEndianKey: false,
            AVLinearPCMIsFloatKey: false,
            AVLinearPCMIsNonInterleaved: false
        ]
    }

    private func selectInputDevice(_ deviceID: AudioDeviceID) throws {
        guard let audioUnit = engine.inputNode.audioUnit else {
            throw ProductionAudioRecorderError.inputDeviceUnavailable(
                "Core Audio input unit"
            )
        }
        var mutableDeviceID = deviceID
        let status = AudioUnitSetProperty(
            audioUnit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global,
            0,
            &mutableDeviceID,
            UInt32(MemoryLayout<AudioDeviceID>.size)
        )
        guard status == noErr else {
            throw ProductionAudioRecorderError.unableToSelectInputDevice(status)
        }
    }

    nonisolated private static func writeReceipt(
        _ receipt: ProductionAudioRecordingReceipt,
        to url: URL
    ) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom(
            ProductionCaptureDateCoding.encode
        )
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(receipt)
        try data.write(to: url, options: [.atomic])
    }

    nonisolated private static func fileSize(at url: URL) -> Int64? {
        let values = try? url.resourceValues(forKeys: [.fileSizeKey])
        return values?.fileSize.map(Int64.init)
    }

    nonisolated private static func sha256(at url: URL) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
            let data = try handle.read(upToCount: 4 * 1_024 * 1_024) ?? Data()
            if data.isEmpty { break }
            hasher.update(data: data)
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private struct RecordingSession {
        let configuration: ProductionAudioRecordingConfiguration
        let recordingID: UUID
        let startedAt: Date
        let startedMonotonicNanoseconds: UInt64
        let channelCount: Int
        let directory: URL
        let partialAudioURL: URL
        let finalizedAudioURL: URL
        let receiptURL: URL
        let writer: RecordingWriter
    }
}

private final class RecordingWriter: @unchecked Sendable {
    struct Snapshot {
        let frameCount: Int64
        let failure: String?
    }

    private let lock = NSLock()
    private var audioFile: AVAudioFile?
    private var frameCount: Int64 = 0
    private var failure: String?

    init(audioFile: AVAudioFile) {
        self.audioFile = audioFile
    }

    var snapshot: Snapshot {
        lock.withLock {
            Snapshot(frameCount: frameCount, failure: failure)
        }
    }

    func closeAndSnapshot() -> Snapshot {
        lock.withLock {
            audioFile = nil
            return Snapshot(frameCount: frameCount, failure: failure)
        }
    }

    func write(_ buffer: AVAudioPCMBuffer) {
        lock.withLock {
            guard failure == nil else { return }
            guard let audioFile else {
                failure = "The recording writer was closed before the tap stopped."
                return
            }
            do {
                try audioFile.write(from: buffer)
                frameCount += Int64(buffer.frameLength)
            } catch {
                failure = error.localizedDescription
            }
        }
    }
}

#endif
