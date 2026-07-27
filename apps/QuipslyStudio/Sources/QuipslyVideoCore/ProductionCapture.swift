import AVFoundation
import CoreMedia
import Foundation

#if os(macOS)
import CoreAudio
#endif

public enum CaptureAuthorizationState: String, Codable, Equatable, Sendable {
    case authorized
    case denied
    case restricted
    case notDetermined

    init(_ status: AVAuthorizationStatus) {
        switch status {
        case .authorized: self = .authorized
        case .denied: self = .denied
        case .restricted: self = .restricted
        case .notDetermined: self = .notDetermined
        @unknown default: self = .restricted
        }
    }
}

public struct CaptureVideoFormatSnapshot: Codable, Equatable, Sendable {
    public let width: Int
    public let height: Int
    public let maximumFrameRate: Double
    public let mediaSubType: String

    public init(
        width: Int,
        height: Int,
        maximumFrameRate: Double,
        mediaSubType: String
    ) {
        self.width = width
        self.height = height
        self.maximumFrameRate = maximumFrameRate
        self.mediaSubType = mediaSubType
    }

    public var pixelCount: Int { width * height }
    public var label: String {
        "\(width)×\(height) up to \(maximumFrameRate.formatted(.number.precision(.fractionLength(0...2)))) fps"
    }
}

public struct CaptureVideoDeviceSnapshot: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let manufacturer: String?
    public let isConnected: Bool
    public let isSuspended: Bool
    public let formats: [CaptureVideoFormatSnapshot]

    public init(
        id: String,
        name: String,
        manufacturer: String? = nil,
        isConnected: Bool = true,
        isSuspended: Bool = false,
        formats: [CaptureVideoFormatSnapshot]
    ) {
        self.id = id
        self.name = name
        self.manufacturer = manufacturer
        self.isConnected = isConnected
        self.isSuspended = isSuspended
        self.formats = formats
    }

    public var bestFormat: CaptureVideoFormatSnapshot? {
        formats.max {
            if $0.pixelCount == $1.pixelCount {
                return $0.maximumFrameRate < $1.maximumFrameRate
            }
            return $0.pixelCount < $1.pixelCount
        }
    }
}

public struct CaptureAudioDeviceSnapshot: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let manufacturer: String?
    public let inputChannels: Int
    public let outputChannels: Int
    public let nominalSampleRate: Double?
    public let isDefaultInput: Bool
    public let isDefaultOutput: Bool

    public init(
        id: String,
        name: String,
        manufacturer: String? = nil,
        inputChannels: Int,
        outputChannels: Int,
        nominalSampleRate: Double? = nil,
        isDefaultInput: Bool = false,
        isDefaultOutput: Bool = false
    ) {
        self.id = id
        self.name = name
        self.manufacturer = manufacturer
        self.inputChannels = inputChannels
        self.outputChannels = outputChannels
        self.nominalSampleRate = nominalSampleRate
        self.isDefaultInput = isDefaultInput
        self.isDefaultOutput = isDefaultOutput
    }

    public var hasInput: Bool { inputChannels > 0 }
    public var hasOutput: Bool { outputChannels > 0 }
}

public struct ProductionCaptureInventory: Codable, Equatable, Sendable {
    public let capturedAt: Date
    public let cameraAuthorization: CaptureAuthorizationState
    public let microphoneAuthorization: CaptureAuthorizationState
    public let videoDevices: [CaptureVideoDeviceSnapshot]
    public let audioDevices: [CaptureAudioDeviceSnapshot]

    public init(
        capturedAt: Date = Date(),
        cameraAuthorization: CaptureAuthorizationState,
        microphoneAuthorization: CaptureAuthorizationState,
        videoDevices: [CaptureVideoDeviceSnapshot],
        audioDevices: [CaptureAudioDeviceSnapshot]
    ) {
        self.capturedAt = capturedAt
        self.cameraAuthorization = cameraAuthorization
        self.microphoneAuthorization = microphoneAuthorization
        self.videoDevices = videoDevices
        self.audioDevices = audioDevices
    }
}

public enum ProductionCaptureRole: String, Codable, Equatable, Sendable {
    case localMaster
    case previewReference
    case callAndMonitoring
    case needsQualification
    case unavailable
}

public enum ProductionCaptureAssessmentStatus: String, Codable, Equatable, Sendable {
    case ready
    case reviewRequired
    case blocked
}

public struct ProductionCaptureAssessment: Identifiable, Codable, Equatable, Sendable {
    public let id: String
    public let title: String
    public let role: ProductionCaptureRole
    public let status: ProductionCaptureAssessmentStatus
    public let truth: String
    public let strengths: [String]
    public let warnings: [String]
    public let blockers: [String]

    public init(
        id: String,
        title: String,
        role: ProductionCaptureRole,
        status: ProductionCaptureAssessmentStatus,
        truth: String,
        strengths: [String] = [],
        warnings: [String] = [],
        blockers: [String] = []
    ) {
        self.id = id
        self.title = title
        self.role = role
        self.status = status
        self.truth = truth
        self.strengths = strengths
        self.warnings = warnings
        self.blockers = blockers
    }
}

public struct ProductionCapturePlan: Codable, Equatable, Sendable {
    public let status: ProductionCaptureAssessmentStatus
    public let video: ProductionCaptureAssessment?
    public let audio: ProductionCaptureAssessment?
    public let callRoute: ProductionCaptureAssessment?
    public let localAudioFormat: String
    public let sourceOwnership: [String]
    public let nextActions: [String]

    public init(
        status: ProductionCaptureAssessmentStatus,
        video: ProductionCaptureAssessment?,
        audio: ProductionCaptureAssessment?,
        callRoute: ProductionCaptureAssessment?,
        localAudioFormat: String,
        sourceOwnership: [String],
        nextActions: [String]
    ) {
        self.status = status
        self.video = video
        self.audio = audio
        self.callRoute = callRoute
        self.localAudioFormat = localAudioFormat
        self.sourceOwnership = sourceOwnership
        self.nextActions = nextActions
    }
}

public enum ProductionCapturePolicy {
    public static let localAudioFormat = "48 kHz · 24-bit linear PCM WAV"

    public static func assessVideo(
        _ device: CaptureVideoDeviceSnapshot,
        authorization: CaptureAuthorizationState
    ) -> ProductionCaptureAssessment {
        guard authorization == .authorized else {
            return ProductionCaptureAssessment(
                id: device.id,
                title: device.name,
                role: .unavailable,
                status: .blocked,
                truth: "Camera permission is required before Quipsly can verify this source.",
                blockers: ["Allow camera access in System Settings, then run preflight again."]
            )
        }
        guard device.isConnected, !device.isSuspended, let best = device.bestFormat else {
            return ProductionCaptureAssessment(
                id: device.id,
                title: device.name,
                role: .unavailable,
                status: .blocked,
                truth: "The camera is unavailable or reported no usable formats.",
                blockers: ["Reconnect and wake the camera, then verify its exact negotiated format."]
            )
        }

        let normalized = "\(device.manufacturer ?? "") \(device.name)".lowercased()
        let isCanonR8 = normalized.contains("canon")
            && (normalized.contains("eos r8") || normalized.contains(" r8"))
        if isCanonR8 {
            let usbWithinDocumentedLimit =
                best.width <= 1_920
                && best.height <= 1_080
                && best.maximumFrameRate <= 30.5
            return ProductionCaptureAssessment(
                id: device.id,
                title: device.name,
                role: .previewReference,
                status: .reviewRequired,
                truth: usbWithinDocumentedLimit
                    ? "Canon R8 USB is negotiated at \(best.label). Quipsly treats it as a framing/call reference, never as a 4K master."
                    : "This Canon R8 route reports \(best.label), outside the documented Quipsly USB profile. It is held for qualification and is not a master.",
                strengths: [
                    "Useful for framing, confidence monitoring, and a recoverable reference.",
                    "Can share one episode capture group with the camera-card original."
                ],
                warnings: [
                    "Record the 4K master internally to the Canon card.",
                    "USB streaming does not power the camera; verify battery or external power before a long take."
                ]
            )
        }

        if best.width >= 3_840 && best.height >= 2_160 {
            return ProductionCaptureAssessment(
                id: device.id,
                title: device.name,
                role: .needsQualification,
                status: .reviewRequired,
                truth: "The route reports \(best.label), but reported resolution alone does not prove a reliable long-take master.",
                strengths: ["The negotiated format is large enough for a 4K qualification run."],
                warnings: [
                    "Pass dropped-frame, storage-throughput, heat, cable, and 60-minute recovery tests before calling this a production master."
                ]
            )
        }

        return ProductionCaptureAssessment(
            id: device.id,
            title: device.name,
            role: .previewReference,
            status: .reviewRequired,
            truth: "The best negotiated route is \(best.label). Quipsly can use it as a reference, not a 4K master.",
            warnings: ["Choose a separately verified local camera master for the final episode."]
        )
    }

    public static func assessAudio(
        input: CaptureAudioDeviceSnapshot,
        output: CaptureAudioDeviceSnapshot?,
        authorization: CaptureAuthorizationState
    ) -> (master: ProductionCaptureAssessment, callRoute: ProductionCaptureAssessment) {
        guard authorization == .authorized else {
            let blocked = ProductionCaptureAssessment(
                id: input.id,
                title: input.name,
                role: .unavailable,
                status: .blocked,
                truth: "Microphone permission is required before Quipsly can verify or record this source.",
                blockers: ["Allow microphone access in System Settings, then run preflight again."]
            )
            return (blocked, blocked)
        }
        guard input.hasInput else {
            let blocked = ProductionCaptureAssessment(
                id: input.id,
                title: input.name,
                role: .unavailable,
                status: .blocked,
                truth: "The selected Core Audio device has no input channels.",
                blockers: ["Select the MV7i microphone input or another verified input device."]
            )
            return (blocked, blocked)
        }

        let normalized = "\(input.manufacturer ?? "") \(input.name)".lowercased()
        let isMV7i = normalized.contains("mv7i")
        let isVirtualRoute = normalized.contains("virtual")
            || normalized.contains("motiv mix")
        let rateReady = input.nominalSampleRate.map { abs($0 - 48_000) < 1 } ?? false
        var masterWarnings: [String] = []
        if !rateReady {
            masterWarnings.append(
                "The device is not currently reporting 48 kHz. Resolve the hardware sample rate before recording."
            )
        }
        if isVirtualRoute {
            masterWarnings.append(
                "A virtual mixer route does not prove which physical input, gain stage, processing, or headphone output owns the take. Select and qualify the direct MV7i device for production."
            )
        }
        let master = ProductionCaptureAssessment(
            id: input.id,
            title: input.name,
            role: .localMaster,
            status: rateReady && !isVirtualRoute ? .ready : .reviewRequired,
            truth: isVirtualRoute
                ? "Quipsly can rehearse a \(localAudioFormat) recording through this virtual mixer, but it is not proof of a direct physical MV7i master."
                : isMV7i
                    ? "The Shure MV7i owns the pre-call local microphone master at \(localAudioFormat)."
                    : "Quipsly can record this input as \(localAudioFormat), but it is not the named MV7i production profile.",
            strengths: isMV7i
                ? [
                    "The local master is tapped before call processing.",
                    "The same interface can provide direct headphone monitoring."
                ]
                : ["The local master remains independent from network call quality."],
            warnings: masterWarnings
        )

        let sameDevice = output?.id == input.id
        let outputHasChannels = output?.hasOutput == true
        let callReady = sameDevice
            && outputHasChannels
            && isMV7i
            && !isVirtualRoute
        let unresolvedTruth: String
        if isVirtualRoute {
            unresolvedTruth =
                "The selected input is a virtual mixer route. Quipsly will not claim direct MV7i headphone monitoring or an echo-safe hardware loop from this route."
        } else if sameDevice && outputHasChannels {
            unresolvedTruth =
                "One Core Audio interface owns input and output, but it is not the qualified MV7i profile. Rehearse and review the route before an episode."
        } else {
            unresolvedTruth =
                "The microphone and call-output routes are split. Quipsly will not claim echo-safe MV7i monitoring until both resolve to the same interface."
        }
        let callRoute = ProductionCaptureAssessment(
            id: output?.id ?? "missing-output",
            title: output?.name ?? "No monitoring output selected",
            role: .callAndMonitoring,
            status: callReady ? .ready : .reviewRequired,
            truth: callReady
                ? "Call playback and headphone monitoring return through the same MV7i hardware route."
                : unresolvedTruth,
            strengths: callReady
                ? ["One interface owns mic input, headphone output, and the operator's hardware monitoring path."]
                : [],
            warnings: callReady
                ? []
                : [
                    "Select the direct MV7i as both input and output before joining the audio room."
                ]
        )
        return (master, callRoute)
    }

    public static func buildPlan(
        inventory: ProductionCaptureInventory,
        videoDeviceID: String?,
        audioInputID: String?,
        audioOutputID: String?
    ) -> ProductionCapturePlan {
        let video = videoDeviceID
            .flatMap { id in inventory.videoDevices.first { $0.id == id } }
            .map { assessVideo($0, authorization: inventory.cameraAuthorization) }
        let input = audioInputID
            .flatMap { id in inventory.audioDevices.first { $0.id == id } }
        let output = audioOutputID
            .flatMap { id in inventory.audioDevices.first { $0.id == id } }
        let audioPair = input.map {
            assessAudio(
                input: $0,
                output: output,
                authorization: inventory.microphoneAuthorization
            )
        }

        let assessments = [video, audioPair?.master, audioPair?.callRoute].compactMap { $0 }
        let status: ProductionCaptureAssessmentStatus
        if input == nil || assessments.contains(where: { $0.status == .blocked }) {
            status = .blocked
        } else if assessments.contains(where: { $0.status == .reviewRequired }) {
            status = .reviewRequired
        } else {
            status = .ready
        }

        var nextActions: [String] = []
        if input == nil {
            nextActions.append("Select the microphone/interface that will own the local master.")
        }
        if video?.role == .previewReference {
            nextActions.append("Arm the Canon R8 internal 4K card recording before Quipsly starts the room.")
        }
        if audioPair?.callRoute.status != .ready {
            nextActions.append("Route both call input and headphone output through the MV7i.")
        }
        if nextActions.isEmpty {
            nextActions.append("Run a 60-second rehearsal, stop cleanly, and inspect every local source before the full episode.")
        }

        return ProductionCapturePlan(
            status: status,
            video: video,
            audio: audioPair?.master,
            callRoute: audioPair?.callRoute,
            localAudioFormat: localAudioFormat,
            sourceOwnership: [
                "Quipsly Studio owns one untouched local microphone master.",
                "LiveKit receives a separate call feed and never becomes the local-master source of truth.",
                "Canon camera-card media remains immutable and joins the episode through an import receipt.",
                "Nest owns consent, episode identity, commands, chat, clock exchange, and source status."
            ],
            nextActions: nextActions
        )
    }
}

public enum ProductionCaptureInventoryProbe {
    public static func snapshot(requestAccess: Bool = false) async -> ProductionCaptureInventory {
        if requestAccess {
            if AVCaptureDevice.authorizationStatus(for: .video) == .notDetermined {
                _ = await AVCaptureDevice.requestAccess(for: .video)
            }
            if AVCaptureDevice.authorizationStatus(for: .audio) == .notDetermined {
                _ = await AVCaptureDevice.requestAccess(for: .audio)
            }
        }

        #if os(macOS)
        let videoDeviceTypes: [AVCaptureDevice.DeviceType] = [
            .builtInWideAngleCamera,
            .continuityCamera,
            .external,
        ]
        #else
        let videoDeviceTypes: [AVCaptureDevice.DeviceType] = [
            .builtInWideAngleCamera,
            .builtInUltraWideCamera,
            .builtInTelephotoCamera,
            .builtInTrueDepthCamera,
        ]
        #endif

        let videoDevices = AVCaptureDevice.DiscoverySession(
            deviceTypes: videoDeviceTypes,
            mediaType: .video,
            position: .unspecified
        ).devices.map { device in
            CaptureVideoDeviceSnapshot(
                id: device.uniqueID,
                name: device.localizedName,
                manufacturer: device.manufacturer,
                isConnected: device.isConnected,
                isSuspended: device.isSuspended,
                formats: device.formats.map { format in
                    let dimensions = CMVideoFormatDescriptionGetDimensions(
                        format.formatDescription
                    )
                    let maximumFrameRate =
                        format.videoSupportedFrameRateRanges
                            .map(\.maxFrameRate)
                            .max()
                        ?? 0
                    return CaptureVideoFormatSnapshot(
                        width: Int(dimensions.width),
                        height: Int(dimensions.height),
                        maximumFrameRate: maximumFrameRate,
                        mediaSubType: fourCC(
                            CMFormatDescriptionGetMediaSubType(
                                format.formatDescription
                            )
                        )
                    )
                }
            )
        }

        #if os(macOS)
        let audioDevices = MacAudioHardwareProbe.snapshot()
        #else
        let audioDevices: [CaptureAudioDeviceSnapshot] = []
        #endif

        return ProductionCaptureInventory(
            cameraAuthorization: CaptureAuthorizationState(
                AVCaptureDevice.authorizationStatus(for: .video)
            ),
            microphoneAuthorization: CaptureAuthorizationState(
                AVCaptureDevice.authorizationStatus(for: .audio)
            ),
            videoDevices: videoDevices,
            audioDevices: audioDevices
        )
    }

    private static func fourCC(_ value: FourCharCode) -> String {
        let scalars = [
            UnicodeScalar((value >> 24) & 0xff),
            UnicodeScalar((value >> 16) & 0xff),
            UnicodeScalar((value >> 8) & 0xff),
            UnicodeScalar(value & 0xff)
        ]
        return String(String.UnicodeScalarView(scalars.compactMap { $0 }))
    }
}

#if os(macOS)
enum MacAudioHardwareProbe {
    static func snapshot() -> [CaptureAudioDeviceSnapshot] {
        let system = AudioObjectID(kAudioObjectSystemObject)
        let deviceIDs = readDeviceIDs(system: system)
        let defaultInput = readDeviceID(
            object: system,
            selector: kAudioHardwarePropertyDefaultInputDevice
        )
        let defaultOutput = readDeviceID(
            object: system,
            selector: kAudioHardwarePropertyDefaultOutputDevice
        )

        return deviceIDs.compactMap { deviceID in
            let inputChannels = channelCount(
                deviceID: deviceID,
                scope: kAudioDevicePropertyScopeInput
            )
            let outputChannels = channelCount(
                deviceID: deviceID,
                scope: kAudioDevicePropertyScopeOutput
            )
            guard inputChannels > 0 || outputChannels > 0 else { return nil }
            let uid = readString(
                object: deviceID,
                selector: kAudioDevicePropertyDeviceUID
            ) ?? "coreaudio-\(deviceID)"
            let name = readString(
                object: deviceID,
                selector: kAudioObjectPropertyName
            ) ?? "Core Audio device \(deviceID)"
            let manufacturer = readString(
                object: deviceID,
                selector: kAudioObjectPropertyManufacturer
            )
            return CaptureAudioDeviceSnapshot(
                id: uid,
                name: name,
                manufacturer: manufacturer,
                inputChannels: inputChannels,
                outputChannels: outputChannels,
                nominalSampleRate: readDouble(
                    object: deviceID,
                    selector: kAudioDevicePropertyNominalSampleRate
                ),
                isDefaultInput: deviceID == defaultInput,
                isDefaultOutput: deviceID == defaultOutput
            )
        }
        .sorted {
            if $0.isDefaultInput != $1.isDefaultInput {
                return $0.isDefaultInput
            }
            if $0.isDefaultOutput != $1.isDefaultOutput {
                return $0.isDefaultOutput
            }
            return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }

    static func deviceID(forUID requestedUID: String) -> AudioDeviceID? {
        let system = AudioObjectID(kAudioObjectSystemObject)
        return readDeviceIDs(system: system).first { deviceID in
            readString(
                object: deviceID,
                selector: kAudioDevicePropertyDeviceUID
            ) == requestedUID
        }
    }

    private static func address(
        selector: AudioObjectPropertySelector,
        scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal
    ) -> AudioObjectPropertyAddress {
        AudioObjectPropertyAddress(
            mSelector: selector,
            mScope: scope,
            mElement: kAudioObjectPropertyElementMain
        )
    }

    private static func readDeviceIDs(system: AudioObjectID) -> [AudioDeviceID] {
        var property = address(selector: kAudioHardwarePropertyDevices)
        var byteCount: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(
            system,
            &property,
            0,
            nil,
            &byteCount
        ) == noErr else { return [] }
        var values = Array(
            repeating: AudioDeviceID(0),
            count: Int(byteCount) / MemoryLayout<AudioDeviceID>.stride
        )
        guard AudioObjectGetPropertyData(
            system,
            &property,
            0,
            nil,
            &byteCount,
            &values
        ) == noErr else { return [] }
        return values
    }

    private static func readDeviceID(
        object: AudioObjectID,
        selector: AudioObjectPropertySelector
    ) -> AudioDeviceID? {
        var property = address(selector: selector)
        var value = AudioDeviceID(0)
        var byteCount = UInt32(MemoryLayout<AudioDeviceID>.size)
        guard AudioObjectGetPropertyData(
            object,
            &property,
            0,
            nil,
            &byteCount,
            &value
        ) == noErr else { return nil }
        return value
    }

    private static func readString(
        object: AudioObjectID,
        selector: AudioObjectPropertySelector
    ) -> String? {
        var property = address(selector: selector)
        var value: Unmanaged<CFString>?
        var byteCount = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
        guard AudioObjectGetPropertyData(
            object,
            &property,
            0,
            nil,
            &byteCount,
            &value
        ) == noErr else { return nil }
        return value?.takeUnretainedValue() as String?
    }

    private static func readDouble(
        object: AudioObjectID,
        selector: AudioObjectPropertySelector
    ) -> Double? {
        var property = address(selector: selector)
        var value = Double(0)
        var byteCount = UInt32(MemoryLayout<Double>.size)
        guard AudioObjectGetPropertyData(
            object,
            &property,
            0,
            nil,
            &byteCount,
            &value
        ) == noErr else { return nil }
        return value
    }

    private static func channelCount(
        deviceID: AudioDeviceID,
        scope: AudioObjectPropertyScope
    ) -> Int {
        var property = address(
            selector: kAudioDevicePropertyStreamConfiguration,
            scope: scope
        )
        var byteCount: UInt32 = 0
        guard AudioObjectGetPropertyDataSize(
            deviceID,
            &property,
            0,
            nil,
            &byteCount
        ) == noErr, byteCount > 0 else { return 0 }

        let raw = UnsafeMutableRawPointer.allocate(
            byteCount: Int(byteCount),
            alignment: MemoryLayout<AudioBufferList>.alignment
        )
        defer { raw.deallocate() }
        guard AudioObjectGetPropertyData(
            deviceID,
            &property,
            0,
            nil,
            &byteCount,
            raw
        ) == noErr else { return 0 }

        let list = raw.bindMemory(to: AudioBufferList.self, capacity: 1)
        return UnsafeMutableAudioBufferListPointer(list).reduce(0) {
            $0 + Int($1.mNumberChannels)
        }
    }
}
#endif
