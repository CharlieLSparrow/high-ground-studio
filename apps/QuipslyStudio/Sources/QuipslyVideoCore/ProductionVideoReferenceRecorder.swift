@preconcurrency import AVFoundation
import CryptoKit
import Foundation

#if os(macOS)

public enum ProductionVideoReferenceState: String, Codable, Equatable, Sendable {
    case inProgress = "in-progress"
    case finalized
    case interrupted
    case failed
}

public struct ProductionVideoRecordedFormat:
    Codable,
    Equatable,
    Sendable
{
    public let width: Int
    public let height: Int
    public let nominalFrameRate: Double
    public let codec: String

    public init(
        width: Int,
        height: Int,
        nominalFrameRate: Double,
        codec: String
    ) {
        self.width = width
        self.height = height
        self.nominalFrameRate = nominalFrameRate
        self.codec = codec
    }
}

public enum ProductionVideoSignalVerificationMethod:
    String,
    Codable,
    Equatable,
    Sendable
{
    case operatorLivePreview = "operator-live-preview"
    case agentVisualReview = "agent-visual-review"
}

public struct ProductionVideoSignalVerification:
    Codable,
    Equatable,
    Sendable
{
    public static let maximumPreflightAge: TimeInterval = 300

    public let deviceID: String
    public let method: ProductionVideoSignalVerificationMethod
    public let verifiedAt: Date
    public let truth: String

    public init(
        deviceID: String,
        method: ProductionVideoSignalVerificationMethod,
        verifiedAt: Date = Date()
    ) {
        self.deviceID = deviceID
        self.method = method
        self.verifiedAt = verifiedAt
        truth =
            "A human operator or visual-review agent explicitly confirmed that the exact selected camera route displayed a moving live image instead of a disconnected or placeholder slate. Final media still requires start-to-stop visual review."
    }

    public func isValid(
        for expectedDeviceID: String,
        recordingStartedAt: Date
    ) -> Bool {
        let age = recordingStartedAt.timeIntervalSince(verifiedAt)
        return deviceID == expectedDeviceID
            && age >= 0
            && age <= Self.maximumPreflightAge
    }
}

public struct ProductionVideoReferenceConfiguration: Equatable, Sendable {
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
    public let videoDevice: CaptureVideoDeviceSnapshot
    public let signalVerification:
        ProductionVideoSignalVerification?
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
        videoDevice: CaptureVideoDeviceSnapshot,
        signalVerification:
            ProductionVideoSignalVerification? = nil,
        rootDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent(
                "Movies/QuipslyCaptures",
                isDirectory: true
            )
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
        self.videoDevice = videoDevice
        self.signalVerification = signalVerification
        self.rootDirectory = rootDirectory
    }
}

public struct ProductionVideoReferenceReceipt: Codable, Equatable, Sendable {
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
    public let state: ProductionVideoReferenceState
    public let videoDevice: CaptureVideoDeviceSnapshot
    public let signalVerification:
        ProductionVideoSignalVerification?
    public let negotiatedFormat: CaptureVideoFormatSnapshot
    public let recordedFormat: ProductionVideoRecordedFormat?
    public let containsAudio: Bool
    public let startedAt: Date
    public let stoppedAt: Date?
    public let startedMonotonicNanoseconds: UInt64
    public let stoppedMonotonicNanoseconds: UInt64?
    public let durationSeconds: Double
    public let byteCount: Int64?
    public let sha256: String?
    public let recordingDirectoryPath: String
    public let videoPath: String
    public let partialVideoPath: String?
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
        configuration: ProductionVideoReferenceConfiguration,
        state: ProductionVideoReferenceState,
        negotiatedFormat: CaptureVideoFormatSnapshot,
        recordedFormat: ProductionVideoRecordedFormat? = nil,
        startedAt: Date,
        stoppedAt: Date?,
        startedMonotonicNanoseconds: UInt64,
        stoppedMonotonicNanoseconds: UInt64?,
        durationSeconds: Double,
        recordingDirectoryPath: String,
        videoPath: String,
        partialVideoPath: String?,
        byteCount: Int64?,
        sha256: String?,
        failure: String?
    ) {
        protocolVersion =
            configuration.signalVerification == nil ? 2 : 3
        recordingID = configuration.recordingID
        captureGroupID = configuration.captureGroupID
        episodeSpaceID = configuration.episodeSpaceID
        participantID = configuration.participantID
        ownerAccountID = configuration.ownerAccountID
        callRoomID = configuration.callRoomID
        recordingConsentID = configuration.recordingConsentID
        startReceiptID = configuration.startReceiptID
        projectSlug = configuration.projectSlug
        episodeSlug = configuration.episodeSlug
        capturePurpose = configuration.capturePurpose
        clockSamples = configuration.clockSamples
        clientKind = "macos"
        sourceKind = "local_video_reference"
        self.state = state
        videoDevice = configuration.videoDevice
        signalVerification = configuration.signalVerification
        self.negotiatedFormat = negotiatedFormat
        self.recordedFormat = recordedFormat
        containsAudio = false
        self.startedAt = startedAt
        self.stoppedAt = stoppedAt
        self.startedMonotonicNanoseconds = startedMonotonicNanoseconds
        self.stoppedMonotonicNanoseconds = stoppedMonotonicNanoseconds
        self.durationSeconds = durationSeconds
        self.byteCount = byteCount
        self.sha256 = sha256
        self.recordingDirectoryPath = recordingDirectoryPath
        self.videoPath = videoPath
        self.partialVideoPath = partialVideoPath
        self.failure = failure
        if state == .finalized {
            truth = configuration.signalVerification == nil
                ? "This silent movie is a finalized local camera reference from the exact selected macOS route. Its hash, byte count, negotiated input format, recorded media format, and monotonic boundaries are verified, but no preflight live-image confirmation is recorded. Start-to-stop visual review is mandatory. It is not proof of a Canon camera-card 4K master."
                : "This silent movie is a finalized local camera reference from the exact selected macOS route. Its hash, byte count, negotiated input format, recorded media format, monotonic boundaries, and fresh preflight live-image confirmation are preserved. Start-to-stop visual review is still mandatory. It is not proof of a Canon camera-card 4K master."
        } else {
            truth =
                "This camera-reference receipt is not finalized. Preserve and explicitly review any partial movie; never treat it as a complete source or Canon camera-card master."
        }
    }
}

public struct InterruptedProductionVideoReference:
    Identifiable,
    Equatable,
    Sendable
{
    public let id: UUID
    public let directory: URL
    public let preservedVideoURL: URL
    public let receiptURL: URL
    public let receipt: ProductionVideoReferenceReceipt?

    public init(
        id: UUID,
        directory: URL,
        preservedVideoURL: URL,
        receiptURL: URL,
        receipt: ProductionVideoReferenceReceipt?
    ) {
        self.id = id
        self.directory = directory
        self.preservedVideoURL = preservedVideoURL
        self.receiptURL = receiptURL
        self.receipt = receipt
    }
}

public enum ProductionVideoReferenceRecorderError:
    LocalizedError,
    Equatable
{
    case alreadyRecording
    case notRecording
    case cameraPermissionRequired
    case cameraUnavailable(String)
    case unsupportedFrameRate(String)
    case unableToAddCamera(String)
    case unableToAddMovieOutput
    case previewNotPrepared
    case recordingDidNotStart(String)
    case recordingFailed(String)
    case finalizationFailed(String)

    public var errorDescription: String? {
        switch self {
        case .alreadyRecording:
            "A local camera reference is already recording."
        case .notRecording:
            "No local camera reference is recording."
        case .cameraPermissionRequired:
            "Camera permission is required before Quipsly can preview or record this reference."
        case .cameraUnavailable(let name):
            "The selected camera route is no longer available: \(name)."
        case .unsupportedFrameRate(let name):
            "Quipsly could not negotiate a finite supported frame rate for \(name)."
        case .unableToAddCamera(let name):
            "Quipsly could not add \(name) to the camera-reference session."
        case .unableToAddMovieOutput:
            "Quipsly could not add a crash-recoverable movie output to the camera session."
        case .previewNotPrepared:
            "The exact selected camera route was not prepared for recording."
        case .recordingDidNotStart(let detail):
            "The local camera reference did not start: \(detail)"
        case .recordingFailed(let detail):
            "The local camera reference stopped unexpectedly: \(detail)"
        case .finalizationFailed(let detail):
            "The camera reference remains preserved as a partial movie but could not be finalized: \(detail)"
        }
    }
}

enum ProductionVideoFrameDurationPlan: Equatable {
    case formatDefault
    case explicit(CMTime)
    case unsupported
}

@MainActor
public final class ProductionVideoReferenceRecorder:
    NSObject,
    AVCaptureFileOutputRecordingDelegate
{
    nonisolated public static let partialVideoFilename =
        "local-camera-reference.partial.mov"
    nonisolated public static let finalizedVideoFilename =
        "local-camera-reference.mov"
    nonisolated public static let receiptFilename =
        "camera-reference-receipt.json"

    nonisolated(unsafe) public let captureSession =
        AVCaptureSession()
    public private(set) var preparedDeviceID: String?
    public private(set) var negotiatedFormat: CaptureVideoFormatSnapshot?
    public private(set) var activeReceipt: ProductionVideoReferenceReceipt?
    public private(set) var lastFinalizedReceipt:
        ProductionVideoReferenceReceipt?
    public private(set) var isPreparing = false
    public private(set) var isFinalizing = false
    public var isPreviewing: Bool { captureSession.isRunning }
    public var isRecording: Bool { movieOutput.isRecording }

    nonisolated(unsafe) private let movieOutput =
        AVCaptureMovieFileOutput()
    nonisolated private let sessionQueue = DispatchQueue(
        label: "com.quipsly.capture.camera-reference"
    )
    private var recordingSession: RecordingSession?
    private var startContinuation:
        CheckedContinuation<ProductionVideoReferenceReceipt, Error>?
    private var stopContinuation:
        CheckedContinuation<ProductionVideoReferenceReceipt, Error>?

    public override init() {
        super.init()
        movieOutput.movieFragmentInterval = CMTime(
            seconds: 5,
            preferredTimescale: 600
        )
        movieOutput.minFreeDiskSpaceLimit = 1_000_000_000
    }

    public func preparePreview(
        deviceID: String
    ) async throws -> CaptureVideoFormatSnapshot {
        guard !isRecording, !isFinalizing else {
            throw ProductionVideoReferenceRecorderError.alreadyRecording
        }
        guard AVCaptureDevice.authorizationStatus(for: .video)
                == .authorized else {
            throw ProductionVideoReferenceRecorderError
                .cameraPermissionRequired
        }
        if preparedDeviceID == deviceID,
           captureSession.isRunning,
           let negotiatedFormat {
            return negotiatedFormat
        }

        isPreparing = true
        defer { isPreparing = false }
        let result = try await withCheckedThrowingContinuation {
            (
                continuation:
                    CheckedContinuation<CaptureVideoFormatSnapshot, Error>
            ) in
            sessionQueue.async { [weak self] in
                guard let self else {
                    continuation.resume(
                        throwing:
                            ProductionVideoReferenceRecorderError
                                .previewNotPrepared
                    )
                    return
                }
                do {
                    let format = try self.configureSession(
                        deviceID: deviceID
                    )
                    if !self.captureSession.isRunning {
                        self.captureSession.startRunning()
                    }
                    continuation.resume(returning: format)
                } catch {
                    continuation.resume(throwing: error)
                }
            }
        }
        preparedDeviceID = deviceID
        negotiatedFormat = result
        return result
    }

    public func stopPreview() {
        guard !isRecording else { return }
        preparedDeviceID = nil
        negotiatedFormat = nil
        sessionQueue.async { [captureSession] in
            if captureSession.isRunning {
                captureSession.stopRunning()
            }
        }
    }

    @discardableResult
    public func start(
        configuration: ProductionVideoReferenceConfiguration
    ) async throws -> ProductionVideoReferenceReceipt {
        guard recordingSession == nil,
              startContinuation == nil,
              stopContinuation == nil,
              !movieOutput.isRecording,
              !isFinalizing else {
            throw ProductionVideoReferenceRecorderError.alreadyRecording
        }
        guard preparedDeviceID == configuration.videoDevice.id,
              captureSession.isRunning,
              let negotiatedFormat else {
            throw ProductionVideoReferenceRecorderError.previewNotPrepared
        }

        let directory = Self.recordingDirectory(
            root: configuration.rootDirectory,
            episodeSpaceID: configuration.episodeSpaceID,
            recordingID: configuration.recordingID
        )
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let partialURL = directory.appendingPathComponent(
            Self.partialVideoFilename
        )
        let finalURL = directory.appendingPathComponent(
            Self.finalizedVideoFilename
        )
        let receiptURL = directory.appendingPathComponent(
            Self.receiptFilename
        )
        let protectedPaths = [
            partialURL,
            finalURL,
            receiptURL,
        ]
        if let collision = protectedPaths.first(where: {
            FileManager.default.fileExists(atPath: $0.path)
        }) {
            throw ProductionVideoReferenceRecorderError
                .recordingDidNotStart(
                    "The protected output already exists: \(collision.lastPathComponent). Start a new recording identity; existing evidence was not changed."
                )
        }

        let requestedAt = Date()
        let requestedMonotonic = DispatchTime.now().uptimeNanoseconds
        let provisional = ProductionVideoReferenceReceipt(
            configuration: configuration,
            state: .inProgress,
            negotiatedFormat: negotiatedFormat,
            startedAt: requestedAt,
            stoppedAt: nil,
            startedMonotonicNanoseconds: requestedMonotonic,
            stoppedMonotonicNanoseconds: nil,
            durationSeconds: 0,
            recordingDirectoryPath: directory.path,
            videoPath: finalURL.path,
            partialVideoPath: partialURL.path,
            byteCount: nil,
            sha256: nil,
            failure: nil
        )
        try Self.writeReceipt(provisional, to: receiptURL)
        recordingSession = RecordingSession(
            configuration: configuration,
            negotiatedFormat: negotiatedFormat,
            directory: directory,
            partialVideoURL: partialURL,
            finalizedVideoURL: finalURL,
            receiptURL: receiptURL,
            startedAt: requestedAt,
            startedMonotonicNanoseconds: requestedMonotonic
        )
        activeReceipt = provisional

        return try await withCheckedThrowingContinuation {
            (
                continuation:
                    CheckedContinuation<
                        ProductionVideoReferenceReceipt,
                        Error
                    >
            ) in
            startContinuation = continuation
            movieOutput.startRecording(
                to: partialURL,
                recordingDelegate: self
            )
        }
    }

    @discardableResult
    public func stop() async throws -> ProductionVideoReferenceReceipt {
        guard recordingSession != nil else {
            throw ProductionVideoReferenceRecorderError.notRecording
        }
        guard stopContinuation == nil else {
            throw ProductionVideoReferenceRecorderError.alreadyRecording
        }
        isFinalizing = true
        return try await withCheckedThrowingContinuation {
            (
                continuation:
                    CheckedContinuation<
                        ProductionVideoReferenceReceipt,
                        Error
                    >
            ) in
            stopContinuation = continuation
            movieOutput.stopRecording()
        }
    }

    nonisolated public func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        from connections: [AVCaptureConnection]
    ) {
        Task { @MainActor in
            guard var session = recordingSession else { return }
            let startedAt = Date()
            let startedMonotonic =
                DispatchTime.now().uptimeNanoseconds
            session.startedAt = startedAt
            session.startedMonotonicNanoseconds = startedMonotonic
            recordingSession = session
            let receipt = ProductionVideoReferenceReceipt(
                configuration: session.configuration,
                state: .inProgress,
                negotiatedFormat: session.negotiatedFormat,
                startedAt: startedAt,
                stoppedAt: nil,
                startedMonotonicNanoseconds: startedMonotonic,
                stoppedMonotonicNanoseconds: nil,
                durationSeconds: 0,
                recordingDirectoryPath: session.directory.path,
                videoPath: session.finalizedVideoURL.path,
                partialVideoPath: session.partialVideoURL.path,
                byteCount: nil,
                sha256: nil,
                failure: nil
            )
            do {
                try Self.writeReceipt(
                    receipt,
                    to: session.receiptURL
                )
                activeReceipt = receipt
                startContinuation?.resume(returning: receipt)
                startContinuation = nil
            } catch {
                startContinuation?.resume(throwing: error)
                startContinuation = nil
                output.stopRecording()
            }
        }
    }

    nonisolated public func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        Task { @MainActor in
            await finishRecording(error: error)
        }
    }

    nonisolated public static func interruptedRecordings(
        in rootDirectory: URL
    ) -> [InterruptedProductionVideoReference] {
        guard let episodeDirectories =
                try? FileManager.default.contentsOfDirectory(
                    at: rootDirectory,
                    includingPropertiesForKeys: [.isDirectoryKey],
                    options: [.skipsHiddenFiles]
                ) else {
            return []
        }

        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom(
            ProductionCaptureDateCoding.decode
        )
        var results: [InterruptedProductionVideoReference] = []
        for episodeDirectory in episodeDirectories {
            guard let recordingDirectories =
                    try? FileManager.default.contentsOfDirectory(
                        at: episodeDirectory,
                        includingPropertiesForKeys: [.isDirectoryKey],
                        options: [.skipsHiddenFiles]
                    ) else {
                continue
            }
            for directory in recordingDirectories {
                let partial = directory.appendingPathComponent(
                    partialVideoFilename
                )
                let finalized = directory.appendingPathComponent(
                    finalizedVideoFilename
                )
                let receiptURL = directory.appendingPathComponent(
                    receiptFilename
                )
                let receipt:
                    ProductionVideoReferenceReceipt?
                if let data = try? Data(contentsOf: receiptURL) {
                    receipt = try? decoder.decode(
                        ProductionVideoReferenceReceipt.self,
                        from: data
                    )
                } else {
                    receipt = nil
                }
                let preservedVideoURL: URL
                if FileManager.default.fileExists(
                    atPath: partial.path
                ) {
                    preservedVideoURL = partial
                } else if receipt?.state != .finalized,
                          FileManager.default.fileExists(
                            atPath: finalized.path
                          ) {
                    preservedVideoURL = finalized
                } else {
                    continue
                }
                results.append(
                    InterruptedProductionVideoReference(
                        id: receipt?.recordingID
                            ?? UUID(
                                uuidString:
                                    directory.lastPathComponent
                            )
                            ?? UUID(),
                        directory: directory,
                        preservedVideoURL: preservedVideoURL,
                        receiptURL: receiptURL,
                        receipt: receipt
                    )
                )
            }
        }
        return results.sorted {
            $0.directory.path.localizedStandardCompare(
                $1.directory.path
            ) == .orderedAscending
        }
    }

    nonisolated public static func recordingDirectory(
        root: URL,
        episodeSpaceID: String,
        recordingID: UUID
    ) -> URL {
        root
            .appendingPathComponent(
                ProductionAudioRecorder.safePathComponent(
                    episodeSpaceID
                ),
                isDirectory: true
            )
            .appendingPathComponent(
                recordingID.uuidString.lowercased(),
                isDirectory: true
            )
    }

    private nonisolated func configureSession(
        deviceID: String
    ) throws -> CaptureVideoFormatSnapshot {
        guard let device = AVCaptureDevice.DiscoverySession(
            deviceTypes: [
                .builtInWideAngleCamera,
                .continuityCamera,
                .external,
            ],
            mediaType: .video,
            position: .unspecified
        ).devices.first(where: { $0.uniqueID == deviceID }) else {
            throw ProductionVideoReferenceRecorderError
                .cameraUnavailable(deviceID)
        }

        captureSession.beginConfiguration()
        defer { captureSession.commitConfiguration() }
        for input in captureSession.inputs {
            captureSession.removeInput(input)
        }
        for output in captureSession.outputs {
            captureSession.removeOutput(output)
        }
        let selected = Self.preferredFormat(for: device)
        let resolutionPreset: AVCaptureSession.Preset
        if selected.snapshot.width >= 1_920,
           selected.snapshot.height >= 1_080 {
            resolutionPreset = .hd1920x1080
        } else if selected.snapshot.width >= 1_280,
                  selected.snapshot.height >= 720 {
            resolutionPreset = .hd1280x720
        } else {
            resolutionPreset = .high
        }
        if captureSession.canSetSessionPreset(resolutionPreset) {
            captureSession.sessionPreset = resolutionPreset
        } else if captureSession.canSetSessionPreset(.high) {
            captureSession.sessionPreset = .high
        }

        try device.lockForConfiguration()
        do {
            defer { device.unlockForConfiguration() }
            device.activeFormat = selected.format
            let frameDurationPlan = Self.frameDurationPlan(
                frameRate: selected.frameRate,
                supportedRanges: selected.format
                    .videoSupportedFrameRateRanges
                    .map {
                        (
                            minimum: $0.minFrameRate,
                            maximum: $0.maxFrameRate
                        )
                    }
            )
            switch frameDurationPlan {
            case .formatDefault:
                // Fixed-rate external drivers already own the only legal
                // duration. Reading activeVideoMinFrameDuration back from
                // some DAL devices returns invalid 0/0 even after a
                // successful set, so do not manufacture a second assignment
                // from that getter.
                break
            case .explicit(let frameDuration):
                device.activeVideoMinFrameDuration = frameDuration
                device.activeVideoMaxFrameDuration = frameDuration
            case .unsupported:
                throw ProductionVideoReferenceRecorderError
                    .unsupportedFrameRate(device.localizedName)
            }
        }

        let input = try AVCaptureDeviceInput(device: device)
        guard captureSession.canAddInput(input) else {
            throw ProductionVideoReferenceRecorderError
                .unableToAddCamera(device.localizedName)
        }
        captureSession.addInput(input)
        guard captureSession.canAddOutput(movieOutput) else {
            throw ProductionVideoReferenceRecorderError
                .unableToAddMovieOutput
        }
        captureSession.addOutput(movieOutput)
        return selected.snapshot
    }

    nonisolated static func frameDurationPlan(
        frameRate: Double,
        supportedRanges: [(minimum: Double, maximum: Double)]
    ) -> ProductionVideoFrameDurationPlan {
        guard frameRate.isFinite, frameRate > 0 else {
            return .unsupported
        }
        let tolerance = 0.001
        guard let supportedRange = supportedRanges.first(where: {
            $0.minimum.isFinite
                && $0.maximum.isFinite
                && $0.minimum > 0
                && $0.maximum >= $0.minimum
                && frameRate >= ($0.minimum - tolerance)
                && frameRate <= ($0.maximum + tolerance)
        }) else {
            return .unsupported
        }
        if abs(supportedRange.maximum - supportedRange.minimum)
            <= tolerance {
            return .formatDefault
        }

        let duration = CMTime(
            seconds: 1 / frameRate,
            preferredTimescale: 60_000
        )
        let durationSeconds = CMTimeGetSeconds(duration)
        guard duration.value > 0,
              duration.timescale > 0,
              durationSeconds.isFinite,
              durationSeconds > 0 else {
            return .unsupported
        }
        return .explicit(duration)
    }

    private func finishRecording(error: Error?) async {
        guard let session = recordingSession else {
            startContinuation?.resume(
                throwing:
                    ProductionVideoReferenceRecorderError
                        .recordingDidNotStart(
                            error?.localizedDescription
                                ?? "The capture session ended before a receipt was armed."
                        )
            )
            startContinuation = nil
            stopContinuation?.resume(
                throwing:
                    ProductionVideoReferenceRecorderError
                        .recordingFailed(
                            error?.localizedDescription
                                ?? "The capture session ended unexpectedly."
                        )
            )
            stopContinuation = nil
            isFinalizing = false
            return
        }
        recordingSession = nil
        let stoppedAt = Date()
        let stoppedMonotonic =
            DispatchTime.now().uptimeNanoseconds
        let successfulDespiteError = (error as NSError?)?
            .userInfo[AVErrorRecordingSuccessfullyFinishedKey]
            as? Bool == true

        if let error, !successfulDespiteError {
            let failed = ProductionVideoReferenceReceipt(
                configuration: session.configuration,
                state: .failed,
                negotiatedFormat: session.negotiatedFormat,
                startedAt: session.startedAt,
                stoppedAt: stoppedAt,
                startedMonotonicNanoseconds:
                    session.startedMonotonicNanoseconds,
                stoppedMonotonicNanoseconds: stoppedMonotonic,
                durationSeconds: max(
                    0,
                    Self.monotonicDurationSeconds(
                        from:
                            session.startedMonotonicNanoseconds,
                        to: stoppedMonotonic
                    )
                ),
                recordingDirectoryPath: session.directory.path,
                videoPath: session.finalizedVideoURL.path,
                partialVideoPath: session.partialVideoURL.path,
                byteCount: Self.fileSize(
                    at: session.partialVideoURL
                ),
                sha256: nil,
                failure: error.localizedDescription
            )
            try? Self.writeReceipt(failed, to: session.receiptURL)
            activeReceipt = failed
            let recorderError =
                ProductionVideoReferenceRecorderError.recordingFailed(
                    error.localizedDescription
                )
            startContinuation?.resume(throwing: recorderError)
            startContinuation = nil
            stopContinuation?.resume(throwing: recorderError)
            stopContinuation = nil
            isFinalizing = false
            return
        }

        do {
            let finalized = try await Task.detached(
                priority: .utility
            ) {
                let validation = try await Self.validatedVideo(
                    at: session.partialVideoURL
                )
                guard let byteCount = Self.fileSize(
                    at: session.partialVideoURL
                ), byteCount > 0 else {
                    throw ProductionVideoReferenceRecorderError
                        .finalizationFailed(
                            "The finalized movie reported no readable bytes."
                        )
                }
                let sha256 = try Self.sha256(
                    at: session.partialVideoURL
                )
                try FileManager.default.moveItem(
                    at: session.partialVideoURL,
                    to: session.finalizedVideoURL
                )
                return ProductionVideoReferenceReceipt(
                    configuration: session.configuration,
                    state: .finalized,
                    negotiatedFormat: session.negotiatedFormat,
                    recordedFormat: validation.format,
                    startedAt: session.startedAt,
                    stoppedAt: stoppedAt,
                    startedMonotonicNanoseconds:
                        session.startedMonotonicNanoseconds,
                    stoppedMonotonicNanoseconds: stoppedMonotonic,
                    durationSeconds: validation.durationSeconds,
                    recordingDirectoryPath:
                        session.directory.path,
                    videoPath:
                        session.finalizedVideoURL.path,
                    partialVideoPath: nil,
                    byteCount: byteCount,
                    sha256: sha256,
                    failure: nil
                )
            }.value
            try Self.writeReceipt(
                finalized,
                to: session.receiptURL
            )
            activeReceipt = finalized
            lastFinalizedReceipt = finalized
            startContinuation?.resume(returning: finalized)
            startContinuation = nil
            stopContinuation?.resume(returning: finalized)
            stopContinuation = nil
        } catch {
            let interrupted = ProductionVideoReferenceReceipt(
                configuration: session.configuration,
                state: .interrupted,
                negotiatedFormat: session.negotiatedFormat,
                startedAt: session.startedAt,
                stoppedAt: stoppedAt,
                startedMonotonicNanoseconds:
                    session.startedMonotonicNanoseconds,
                stoppedMonotonicNanoseconds: stoppedMonotonic,
                durationSeconds: max(
                    0,
                    Self.monotonicDurationSeconds(
                        from:
                            session.startedMonotonicNanoseconds,
                        to: stoppedMonotonic
                    )
                ),
                recordingDirectoryPath: session.directory.path,
                videoPath: session.finalizedVideoURL.path,
                partialVideoPath:
                    FileManager.default.fileExists(
                        atPath: session.partialVideoURL.path
                    )
                    ? session.partialVideoURL.path
                    : nil,
                byteCount: Self.fileSize(
                    at:
                        FileManager.default.fileExists(
                            atPath:
                                session.finalizedVideoURL.path
                        )
                        ? session.finalizedVideoURL
                        : session.partialVideoURL
                ),
                sha256: nil,
                failure: error.localizedDescription
            )
            try? Self.writeReceipt(
                interrupted,
                to: session.receiptURL
            )
            activeReceipt = interrupted
            let recorderError =
                ProductionVideoReferenceRecorderError
                    .finalizationFailed(
                        error.localizedDescription
                    )
            startContinuation?.resume(throwing: recorderError)
            startContinuation = nil
            stopContinuation?.resume(throwing: recorderError)
            stopContinuation = nil
        }
        isFinalizing = false
    }

    private nonisolated static func preferredFormat(
        for device: AVCaptureDevice
    ) -> (
        format: AVCaptureDevice.Format,
        frameRate: Double,
        snapshot: CaptureVideoFormatSnapshot
    ) {
        let candidates = device.formats.compactMap {
            format -> (
                AVCaptureDevice.Format,
                Double,
                CaptureVideoFormatSnapshot
            )? in
            let dimensions = CMVideoFormatDescriptionGetDimensions(
                format.formatDescription
            )
            guard dimensions.width >= dimensions.height,
                  dimensions.width <= 1_920,
                  dimensions.height <= 1_080 else {
                return nil
            }
            let maximum = format.videoSupportedFrameRateRanges
                .map(\.maxFrameRate)
                .filter { $0.isFinite && $0 > 0 }
                .max() ?? 0
            let frameRate = min(30, maximum)
            guard frameRate > 0 else { return nil }
            return (
                format,
                frameRate,
                CaptureVideoFormatSnapshot(
                    width: Int(dimensions.width),
                    height: Int(dimensions.height),
                    maximumFrameRate: frameRate,
                    mediaSubType: fourCC(
                        CMFormatDescriptionGetMediaSubType(
                            format.formatDescription
                        )
                    )
                )
            )
        }
        return candidates.max {
            let lhsPixels =
                $0.2.width * $0.2.height
            let rhsPixels =
                $1.2.width * $1.2.height
            if lhsPixels == rhsPixels {
                return $0.1 < $1.1
            }
            return lhsPixels < rhsPixels
        } ?? {
            let format = device.activeFormat
            let dimensions = CMVideoFormatDescriptionGetDimensions(
                format.formatDescription
            )
            let maximum = format.videoSupportedFrameRateRanges
                .map(\.maxFrameRate)
                .filter { $0.isFinite && $0 > 0 }
                .max() ?? 30
            let frameRate = max(1, min(30, maximum))
            return (
                format,
                frameRate,
                CaptureVideoFormatSnapshot(
                    width: Int(dimensions.width),
                    height: Int(dimensions.height),
                    maximumFrameRate: frameRate,
                    mediaSubType: fourCC(
                        CMFormatDescriptionGetMediaSubType(
                            format.formatDescription
                        )
                    )
                )
            )
        }()
    }

    private nonisolated static func validatedVideo(
        at url: URL
    ) async throws -> (
        durationSeconds: Double,
        format: ProductionVideoRecordedFormat
    ) {
        let asset = AVURLAsset(url: url)
        let videoTracks = try await asset.loadTracks(
            withMediaType: .video
        )
        guard let videoTrack = videoTracks.first else {
            throw ProductionVideoReferenceRecorderError
                .finalizationFailed(
                    "The finalized camera reference contains no video track."
                )
        }
        let duration = try await asset.load(.duration)
        let seconds = duration.seconds
        guard seconds.isFinite, seconds > 0 else {
            throw ProductionVideoReferenceRecorderError
                .finalizationFailed(
                    "The finalized movie reported no usable duration."
                )
        }
        let naturalSize = try await videoTrack.load(.naturalSize)
        let transform = try await videoTrack.load(
            .preferredTransform
        )
        let displaySize = naturalSize.applying(transform)
        let nominalFrameRate = Double(
            try await videoTrack.load(.nominalFrameRate)
        )
        let descriptions = try await videoTrack.load(
            .formatDescriptions
        )
        guard displaySize.width.isFinite,
              displaySize.height.isFinite,
              abs(displaySize.width) >= 1,
              abs(displaySize.height) >= 1,
              nominalFrameRate.isFinite,
              nominalFrameRate > 0,
              let description = descriptions.first else {
            throw ProductionVideoReferenceRecorderError
                .finalizationFailed(
                    "The finalized movie reported no usable recorded media format."
                )
        }
        return (
            seconds,
            ProductionVideoRecordedFormat(
                width: Int(abs(displaySize.width).rounded()),
                height: Int(abs(displaySize.height).rounded()),
                nominalFrameRate: nominalFrameRate,
                codec: fourCC(
                    CMFormatDescriptionGetMediaSubType(
                        description
                    )
                )
            )
        )
    }

    private nonisolated static func monotonicDurationSeconds(
        from start: UInt64,
        to stop: UInt64
    ) -> Double {
        guard stop >= start else { return 0 }
        return Double(stop - start) / 1_000_000_000
    }

    private nonisolated static func writeReceipt(
        _ receipt: ProductionVideoReferenceReceipt,
        to url: URL
    ) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom(
            ProductionCaptureDateCoding.encode
        )
        encoder.outputFormatting = [
            .prettyPrinted,
            .sortedKeys,
            .withoutEscapingSlashes,
        ]
        try encoder.encode(receipt).write(
            to: url,
            options: [.atomic]
        )
    }

    private nonisolated static func fileSize(
        at url: URL
    ) -> Int64? {
        let values = try? url.resourceValues(
            forKeys: [.fileSizeKey]
        )
        return values?.fileSize.map(Int64.init)
    }

    private nonisolated static func sha256(
        at url: URL
    ) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
            let data =
                try handle.read(upToCount: 4 * 1_024 * 1_024)
                    ?? Data()
            if data.isEmpty { break }
            hasher.update(data: data)
        }
        return hasher.finalize()
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private nonisolated static func fourCC(
        _ value: FourCharCode
    ) -> String {
        let scalars = [
            UnicodeScalar((value >> 24) & 0xff),
            UnicodeScalar((value >> 16) & 0xff),
            UnicodeScalar((value >> 8) & 0xff),
            UnicodeScalar(value & 0xff),
        ]
        return String(
            String.UnicodeScalarView(
                scalars.compactMap { $0 }
            )
        )
    }

    private struct RecordingSession {
        let configuration: ProductionVideoReferenceConfiguration
        let negotiatedFormat: CaptureVideoFormatSnapshot
        let directory: URL
        let partialVideoURL: URL
        let finalizedVideoURL: URL
        let receiptURL: URL
        var startedAt: Date
        var startedMonotonicNanoseconds: UInt64
    }
}

#endif
