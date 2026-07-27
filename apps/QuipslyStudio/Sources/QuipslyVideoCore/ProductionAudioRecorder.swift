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
        failure: String?
    ) {
        self.protocolVersion = 1
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
        if state == .finalized, isVirtualRoute {
            self.truth =
                "The WAV is finalized from the selected virtual Core Audio route. Hash, byte count, device UID, and monotonic boundaries describe this exact file, but the receipt does not prove a direct physical MV7i source."
        } else if state == .finalized {
            self.truth =
                "The WAV is a finalized local microphone master. Hash, byte count, device UID, and monotonic boundaries describe this exact file."
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

    private let engine = AVAudioEngine()
    private var session: RecordingSession?

    public init() {}

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
            failure: nil
        )
        try Self.writeReceipt(inProgress, to: receiptURL)

        inputNode.installTap(
            onBus: 0,
            bufferSize: 4_096,
            format: inputFormat
        ) { buffer, _ in
            writer.write(buffer)
        }

        do {
            engine.prepare()
            try engine.start()
        } catch {
            inputNode.removeTap(onBus: 0)
            let writerSnapshot = writer.closeAndSnapshot()
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
                failure: error.localizedDescription
            )
            try? Self.writeReceipt(failed, to: receiptURL)
            activeReceipt = failed
            throw error
        }

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
        activeReceipt = inProgress
        return inProgress
    }

    @discardableResult
    public func stop() async throws -> ProductionAudioRecordingReceipt {
        guard let session else {
            throw ProductionAudioRecorderError.notRecording
        }

        engine.inputNode.removeTap(onBus: 0)
        engine.stop()
        self.session = nil
        isFinalizing = true
        defer { isFinalizing = false }

        let writerSnapshot = session.writer.closeAndSnapshot()
        let stoppedAt = Date()
        let stoppedMonotonic = DispatchTime.now().uptimeNanoseconds

        if let writeFailure = writerSnapshot.failure {
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
                failure: writeFailure
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
                failure: nil
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
                failure: error.localizedDescription
            )
            try? Self.writeReceipt(interrupted, to: session.receiptURL)
            activeReceipt = interrupted
            throw ProductionAudioRecorderError.finalizationFailed(
                error.localizedDescription
            )
        }
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
