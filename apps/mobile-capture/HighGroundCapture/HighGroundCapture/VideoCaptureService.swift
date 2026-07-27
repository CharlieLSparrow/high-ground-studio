@preconcurrency import AVFoundation
import CoreMedia
import Foundation

enum VideoCaptureCameraPosition: String, Codable, CaseIterable, Sendable {
    case front
    case back

    var opposite: Self {
        self == .front ? .back : .front
    }

    nonisolated fileprivate var avPosition: AVCaptureDevice.Position {
        self == .front ? .front : .back
    }
}

struct VideoCaptureResolvedProfile: Codable, Equatable, Sendable {
    let cameraPosition: VideoCaptureCameraPosition
    let cameraDeviceUniqueID: String
    let cameraLocalizedName: String
    let width: Int
    let height: Int
    let framesPerSecond: Double
    let codec: String
    let colorSpace: String
    let includesAudio: Bool
    let audioSampleRate: Double?
    let audioChannelCount: Int?
    let movieFragmentSeconds: Double
    let captureRotationDegrees: Double

    var resolutionLabel: String {
        if width >= 3_840 && height >= 2_160 { return "4K" }
        if width >= 1_920 && height >= 1_080 { return "1080p" }
        return "\(width)×\(height)"
    }

    var presentationOrientation: String {
        let quarterTurn = !Int(captureRotationDegrees.rounded())
            .isMultiple(of: 180)
        let presentationWidth = quarterTurn ? height : width
        let presentationHeight = quarterTurn ? width : height
        return presentationHeight >= presentationWidth
            ? "portrait"
            : "landscape"
    }

    var presentationOrientationLabel: String {
        presentationOrientation.capitalized
    }

    var profileLabel: String {
        "\(resolutionLabel) · \(Int(framesPerSecond.rounded())) fps · \(codec.uppercased()) · \(presentationOrientationLabel)"
    }

    var estimatedBytesPerSecond: Int64 {
        // Conservative planning estimate, not an assertion about encoder
        // output. Storage UI labels it as an estimate and runtime checks the
        // actual remaining capacity without changing quality mid-file.
        let videoBitsPerSecond: Double
        if width >= 3_840 {
            videoBitsPerSecond = codec == AVVideoCodecType.hevc.rawValue
                ? 60_000_000
                : 100_000_000
        } else if width >= 1_920 {
            videoBitsPerSecond = 24_000_000
        } else {
            videoBitsPerSecond = 12_000_000
        }
        let audioBitsPerSecond = includesAudio ? 256_000.0 : 0
        return Int64(((videoBitsPerSecond + audioBitsPerSecond) / 8).rounded(.up))
    }
}

enum VideoCaptureServiceEvent: Sendable {
    case started(URL)
    case finished(URL, Error?)
}

enum VideoCaptureServiceError: LocalizedError {
    case cameraPermissionDenied
    case microphonePermissionDenied
    case cameraUnavailable(VideoCaptureCameraPosition)
    case compatibleFormatUnavailable(VideoCaptureCameraPosition)
    case cameraInputUnavailable(String)
    case microphoneInputUnavailable(String)
    case movieOutputUnavailable
    case captureRotationUnavailable(Double)
    case notPrepared
    case alreadyRecording
    case notRecording
    case sourceURLAlreadyExists

    var errorDescription: String? {
        switch self {
        case .cameraPermissionDenied:
            "Camera access is off. Quipsly did not start or create a video source."
        case .microphonePermissionDenied:
            "Microphone access is off. Quipsly did not start the solo video source."
        case .cameraUnavailable(let position):
            "The \(position.rawValue) camera is not available on this device."
        case .compatibleFormatUnavailable(let position):
            "The \(position.rawValue) camera has no reliable recording format at 1080p or better."
        case .cameraInputUnavailable(let detail):
            "The selected camera could not be attached: \(detail)"
        case .microphoneInputUnavailable(let detail):
            "The selected microphone could not be attached: \(detail)"
        case .movieOutputUnavailable:
            "The iPhone could not attach a fragmented movie output."
        case .captureRotationUnavailable(let angle):
            "The camera reported an unsupported \(Int(angle.rounded()))° capture rotation. Quipsly did not arm a possibly sideways source."
        case .notPrepared:
            "Prepare and verify the camera profile before recording."
        case .alreadyRecording:
            "A video source is already recording."
        case .notRecording:
            "No video source is currently recording."
        case .sourceURLAlreadyExists:
            "Quipsly refused to overwrite an existing local source file."
        }
    }
}

private final class VideoCaptureMovieDelegate: NSObject, AVCaptureFileOutputRecordingDelegate, @unchecked Sendable {
    private let onStart: @Sendable (URL) -> Void
    private let onFinish: @Sendable (URL, Error?) -> Void

    nonisolated init(
        onStart: @escaping @Sendable (URL) -> Void,
        onFinish: @escaping @Sendable (URL, Error?) -> Void
    ) {
        self.onStart = onStart
        self.onFinish = onFinish
    }

    nonisolated func fileOutput(
        _ output: AVCaptureFileOutput,
        didStartRecordingTo fileURL: URL,
        from connections: [AVCaptureConnection]
    ) {
        onStart(fileURL)
    }

    nonisolated func fileOutput(
        _ output: AVCaptureFileOutput,
        didFinishRecordingTo outputFileURL: URL,
        from connections: [AVCaptureConnection],
        error: Error?
    ) {
        let nsError = error as NSError?
        let finishedSuccessfully =
            nsError?.userInfo[AVErrorRecordingSuccessfullyFinishedKey] as? Bool
        onFinish(outputFileURL, finishedSuccessfully == true ? nil : error)
    }
}

actor VideoCaptureService {
    // The preview layer may read the session on MainActor. Every mutation and
    // start/stop call remains isolated to this actor.
    nonisolated let captureSession = AVCaptureSession()
    nonisolated let events: AsyncStream<VideoCaptureServiceEvent>

    private let eventContinuation: AsyncStream<VideoCaptureServiceEvent>.Continuation
    private let movieOutput = AVCaptureMovieFileOutput()
    private var cameraInput: AVCaptureDeviceInput?
    private var microphoneInput: AVCaptureDeviceInput?
    private var rotationCoordinator: AVCaptureDevice.RotationCoordinator?
    private var activeDelegate: VideoCaptureMovieDelegate?
    private var resolvedProfile: VideoCaptureResolvedProfile?
    private var configuredPosition: VideoCaptureCameraPosition?
    private var configuredIncludesAudio = false

    init() {
        var continuation: AsyncStream<VideoCaptureServiceEvent>.Continuation?
        events = AsyncStream { continuation = $0 }
        eventContinuation = continuation!
    }

    func prepare(
        position: VideoCaptureCameraPosition,
        includesAudio: Bool
    ) async throws -> VideoCaptureResolvedProfile {
        guard await permission(for: .video) else {
            throw VideoCaptureServiceError.cameraPermissionDenied
        }
        if includesAudio {
            guard await permission(for: .audio) else {
                throw VideoCaptureServiceError.microphonePermissionDenied
            }
        }
        if movieOutput.isRecording {
            throw VideoCaptureServiceError.alreadyRecording
        }

        let device = try cameraDevice(position: position)
        let selection = try selectFormat(device: device, position: position)
        let newCameraInput: AVCaptureDeviceInput
        do {
            newCameraInput = try AVCaptureDeviceInput(device: device)
        } catch {
            throw VideoCaptureServiceError.cameraInputUnavailable(error.localizedDescription)
        }

        var newMicrophoneInput: AVCaptureDeviceInput?
        if includesAudio {
            guard let microphone = AVCaptureDevice.default(for: .audio) else {
                throw VideoCaptureServiceError.microphoneInputUnavailable(
                    "No audio input is available."
                )
            }
            do {
                newMicrophoneInput = try AVCaptureDeviceInput(device: microphone)
            } catch {
                throw VideoCaptureServiceError.microphoneInputUnavailable(
                    error.localizedDescription
                )
            }
        }

        let previousCameraInput = cameraInput
        let previousMicrophoneInput = microphoneInput
        var configurationSucceeded = false
        var movieOutputWasAdded = false
        var configurationIsOpen = true
        resolvedProfile = nil
        configuredPosition = nil
        configuredIncludesAudio = false

        captureSession.beginConfiguration()
        defer {
            if configurationIsOpen {
                if !configurationSucceeded {
                    if captureSession.inputs.contains(where: { $0 === newCameraInput }) {
                        captureSession.removeInput(newCameraInput)
                    }
                    if let newMicrophoneInput,
                       captureSession.inputs.contains(where: { $0 === newMicrophoneInput }) {
                        captureSession.removeInput(newMicrophoneInput)
                    }
                    if movieOutputWasAdded {
                        captureSession.removeOutput(movieOutput)
                    }
                    if let previousCameraInput,
                       captureSession.canAddInput(previousCameraInput) {
                        captureSession.addInput(previousCameraInput)
                    }
                    if let previousMicrophoneInput,
                       captureSession.canAddInput(previousMicrophoneInput) {
                        captureSession.addInput(previousMicrophoneInput)
                    }
                }
                captureSession.commitConfiguration()
                configurationIsOpen = false
            }
        }
        captureSession.sessionPreset = .inputPriority

        if let previousCameraInput {
            captureSession.removeInput(previousCameraInput)
        }
        if let previousMicrophoneInput {
            captureSession.removeInput(previousMicrophoneInput)
        }

        guard captureSession.canAddInput(newCameraInput) else {
            throw VideoCaptureServiceError.cameraInputUnavailable(
                "AVCaptureSession rejected the selected camera input."
            )
        }
        captureSession.addInput(newCameraInput)

        if let newMicrophoneInput {
            guard captureSession.canAddInput(newMicrophoneInput) else {
                throw VideoCaptureServiceError.microphoneInputUnavailable(
                    "AVCaptureSession rejected the selected microphone input."
                )
            }
            captureSession.addInput(newMicrophoneInput)
        }

        if !captureSession.outputs.contains(where: { $0 === movieOutput }) {
            guard captureSession.canAddOutput(movieOutput) else {
                throw VideoCaptureServiceError.movieOutputUnavailable
            }
            captureSession.addOutput(movieOutput)
            movieOutputWasAdded = true
        }

        do {
            try device.lockForConfiguration()
            defer { device.unlockForConfiguration() }
            device.activeFormat = selection.format
            device.activeVideoMinFrameDuration = selection.frameDuration
            device.activeVideoMaxFrameDuration = selection.frameDuration
            if selection.colorSpace != device.activeColorSpace,
               selection.format.supportedColorSpaces.contains(selection.colorSpace) {
                device.activeColorSpace = selection.colorSpace
            }
        } catch {
            throw VideoCaptureServiceError.cameraInputUnavailable(
                "The selected quality profile could not be locked: \(error.localizedDescription)"
            )
        }

        movieOutput.movieFragmentInterval = CMTime(seconds: 10, preferredTimescale: 600)
        guard let videoConnection = movieOutput.connection(with: .video) else {
            throw VideoCaptureServiceError.movieOutputUnavailable
        }
        if videoConnection.isVideoStabilizationSupported {
            videoConnection.preferredVideoStabilizationMode = .auto
        }
        let newRotationCoordinator = AVCaptureDevice.RotationCoordinator(
            device: device,
            previewLayer: nil
        )
        let captureRotationDegrees = try applyCaptureRotation(
            coordinator: newRotationCoordinator,
            connection: videoConnection
        )

        let codec = movieOutput.availableVideoCodecTypes.contains(.hevc)
            ? AVVideoCodecType.hevc
            : AVVideoCodecType.h264
        movieOutput.setOutputSettings(
            [AVVideoCodecKey: codec.rawValue],
            for: videoConnection
        )

        let audioDescription = newMicrophoneInput.map { input in
            let format = input.device.activeFormat.formatDescription
            let streamDescription = CMAudioFormatDescriptionGetStreamBasicDescription(format)
            return (
                sampleRate: streamDescription?.pointee.mSampleRate,
                channels: streamDescription.map { Int($0.pointee.mChannelsPerFrame) }
            )
        }
        let profile = VideoCaptureResolvedProfile(
            cameraPosition: position,
            cameraDeviceUniqueID: device.uniqueID,
            cameraLocalizedName: device.localizedName,
            width: Int(selection.dimensions.width),
            height: Int(selection.dimensions.height),
            framesPerSecond: selection.framesPerSecond,
            codec: codec.rawValue,
            colorSpace: colorSpaceLabel(selection.colorSpace),
            includesAudio: includesAudio,
            audioSampleRate: audioDescription?.sampleRate,
            audioChannelCount: audioDescription?.channels,
            movieFragmentSeconds: 10,
            captureRotationDegrees: captureRotationDegrees
        )
        cameraInput = newCameraInput
        microphoneInput = newMicrophoneInput
        resolvedProfile = profile
        configuredPosition = position
        configuredIncludesAudio = includesAudio
        rotationCoordinator = newRotationCoordinator
        configurationSucceeded = true
        captureSession.commitConfiguration()
        configurationIsOpen = false

        if !captureSession.isRunning {
            captureSession.startRunning()
        }
        return profile
    }

    func currentProfile() -> VideoCaptureResolvedProfile? {
        resolvedProfile
    }

    func lockCaptureOrientationForArming() throws -> VideoCaptureResolvedProfile {
        guard let profile = resolvedProfile,
              let rotationCoordinator,
              let videoConnection = movieOutput.connection(with: .video),
              captureSession.isRunning,
              !movieOutput.isRecording else {
            throw VideoCaptureServiceError.notPrepared
        }
        let captureRotationDegrees = try applyCaptureRotation(
            coordinator: rotationCoordinator,
            connection: videoConnection
        )
        let armedProfile = VideoCaptureResolvedProfile(
            cameraPosition: profile.cameraPosition,
            cameraDeviceUniqueID: profile.cameraDeviceUniqueID,
            cameraLocalizedName: profile.cameraLocalizedName,
            width: profile.width,
            height: profile.height,
            framesPerSecond: profile.framesPerSecond,
            codec: profile.codec,
            colorSpace: profile.colorSpace,
            includesAudio: profile.includesAudio,
            audioSampleRate: profile.audioSampleRate,
            audioChannelCount: profile.audioChannelCount,
            movieFragmentSeconds: profile.movieFragmentSeconds,
            captureRotationDegrees: captureRotationDegrees
        )
        resolvedProfile = armedProfile
        return armedProfile
    }

    func startRecording(to fileURL: URL) throws {
        guard resolvedProfile != nil, captureSession.isRunning else {
            throw VideoCaptureServiceError.notPrepared
        }
        guard !movieOutput.isRecording else {
            throw VideoCaptureServiceError.alreadyRecording
        }
        guard !FileManager.default.fileExists(atPath: fileURL.path) else {
            throw VideoCaptureServiceError.sourceURLAlreadyExists
        }

        let delegate = VideoCaptureMovieDelegate(
            onStart: { [weak self] url in
                Task { await self?.recordingDidStart(url) }
            },
            onFinish: { [weak self] url, error in
                Task { await self?.recordingDidFinish(url, error: error) }
            }
        )
        activeDelegate = delegate
        movieOutput.startRecording(to: fileURL, recordingDelegate: delegate)
    }

    func stopRecording() throws {
        guard movieOutput.isRecording else {
            throw VideoCaptureServiceError.notRecording
        }
        movieOutput.stopRecording()
    }

    func shutdownPreview() {
        guard !movieOutput.isRecording else { return }
        if captureSession.isRunning {
            captureSession.stopRunning()
        }
    }

    private func recordingDidStart(_ url: URL) {
        eventContinuation.yield(.started(url))
    }

    private func recordingDidFinish(_ url: URL, error: Error?) {
        activeDelegate = nil
        eventContinuation.yield(.finished(url, error))
    }

    private func permission(for mediaType: AVMediaType) async -> Bool {
        switch AVCaptureDevice.authorizationStatus(for: mediaType) {
        case .authorized:
            return true
        case .notDetermined:
            return await AVCaptureDevice.requestAccess(for: mediaType)
        case .denied, .restricted:
            return false
        @unknown default:
            return false
        }
    }

    private func cameraDevice(
        position: VideoCaptureCameraPosition
    ) throws -> AVCaptureDevice {
        let preferredTypes: [AVCaptureDevice.DeviceType] = position == .front
            ? [.builtInTrueDepthCamera, .builtInWideAngleCamera]
            : [.builtInWideAngleCamera]
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: preferredTypes,
            mediaType: .video,
            position: position.avPosition
        )
        guard let device = discovery.devices.first else {
            throw VideoCaptureServiceError.cameraUnavailable(position)
        }
        return device
    }

    private struct FormatSelection {
        let format: AVCaptureDevice.Format
        let dimensions: CMVideoDimensions
        let framesPerSecond: Double
        let frameDuration: CMTime
        let colorSpace: AVCaptureColorSpace
    }

    private func selectFormat(
        device: AVCaptureDevice,
        position: VideoCaptureCameraPosition
    ) throws -> FormatSelection {
        let requestedFramesPerSecond = 30.0
        let candidates = device.formats.compactMap { format -> FormatSelection? in
            let dimensions = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            guard dimensions.width >= 1_920,
                  dimensions.height >= 1_080,
                  dimensions.width <= 4_096,
                  dimensions.height <= 2_304,
                  format.videoSupportedFrameRateRanges.contains(where: {
                      $0.minFrameRate <= requestedFramesPerSecond
                          && $0.maxFrameRate >= requestedFramesPerSecond
                  }) else {
                return nil
            }
            let colorSpace: AVCaptureColorSpace =
                format.supportedColorSpaces.contains(.P3_D65) ? .P3_D65 : .sRGB
            return FormatSelection(
                format: format,
                dimensions: dimensions,
                framesPerSecond: requestedFramesPerSecond,
                frameDuration: CMTime(value: 1, timescale: 30),
                colorSpace: colorSpace
            )
        }
        let sorted = candidates.sorted { lhs, rhs in
            let leftPixels = Int64(lhs.dimensions.width) * Int64(lhs.dimensions.height)
            let rightPixels = Int64(rhs.dimensions.width) * Int64(rhs.dimensions.height)
            if leftPixels != rightPixels { return leftPixels > rightPixels }
            return lhs.format.isVideoBinned == false && rhs.format.isVideoBinned == true
        }
        guard let selection = sorted.first else {
            throw VideoCaptureServiceError.compatibleFormatUnavailable(position)
        }
        return selection
    }

    private func colorSpaceLabel(_ colorSpace: AVCaptureColorSpace) -> String {
        switch colorSpace {
        case .sRGB: "sRGB"
        case .P3_D65: "P3-D65"
        case .HLG_BT2020: "HLG-BT.2020"
        default: "unknown-\(colorSpace.rawValue)"
        }
    }

    private func applyCaptureRotation(
        coordinator: AVCaptureDevice.RotationCoordinator,
        connection: AVCaptureConnection
    ) throws -> Double {
        let reportedAngle =
            coordinator.videoRotationAngleForHorizonLevelCapture
        let normalizedAngle = normalizedQuarterTurn(reportedAngle)
        guard connection.isVideoRotationAngleSupported(normalizedAngle) else {
            throw VideoCaptureServiceError.captureRotationUnavailable(
                Double(reportedAngle)
            )
        }
        connection.videoRotationAngle = normalizedAngle
        return Double(normalizedAngle)
    }

    private func normalizedQuarterTurn(_ angle: CGFloat) -> CGFloat {
        let normalized = angle.truncatingRemainder(dividingBy: 360)
        let positive = normalized < 0 ? normalized + 360 : normalized
        let quarterTurn = (positive / 90).rounded() * 90
        return quarterTurn == 360 ? 0 : quarterTurn
    }
}
