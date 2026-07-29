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

/// Immutable authority copied from a source opened only after Nest applied the
/// exact recording START. Later companion sources may inherit this receipt,
/// but must never infer it from the room currently selected in the UI.
public struct ProductionCaptureRoomBinding:
    Codable,
    Equatable,
    Sendable
{
    private enum CodingKeys: String, CodingKey {
        case captureGroupID
        case episodeSpaceID
        case participantID
        case ownerAccountID
        case callRoomID
        case recordingConsentID
        case startReceiptID
        case projectSlug
        case episodeSlug
        case capturePurpose
    }

    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let participantID: String
    public let ownerAccountID: String
    public let callRoomID: String
    public let recordingConsentID: String
    public let startReceiptID: UUID
    public let projectSlug: String?
    public let episodeSlug: String?
    public let capturePurpose: String?

    public init?(
        captureGroupID: UUID,
        episodeSpaceID: String,
        participantID: String,
        ownerAccountID: String,
        callRoomID: String,
        recordingConsentID: String,
        startReceiptID: UUID,
        projectSlug: String? = nil,
        episodeSlug: String? = nil,
        capturePurpose: String? = nil
    ) {
        let episode = Self.nonempty(episodeSpaceID)
        let participant = Self.nonempty(participantID)
        let owner = Self.nonempty(ownerAccountID)?
            .lowercased()
        let room = Self.nonempty(callRoomID)
        let consent = Self.nonempty(recordingConsentID)
        guard let episode,
              let participant,
              let owner,
              let room,
              let consent else {
            return nil
        }
        self.captureGroupID = captureGroupID
        self.episodeSpaceID = episode
        self.participantID = participant
        self.ownerAccountID = owner
        self.callRoomID = room
        self.recordingConsentID = consent
        self.startReceiptID = startReceiptID
        self.projectSlug = Self.nonempty(projectSlug)
        self.episodeSlug = Self.nonempty(episodeSlug)
        self.capturePurpose = Self.nonempty(capturePurpose)
    }

    public init(from decoder: Decoder) throws {
        let values = try decoder.container(
            keyedBy: CodingKeys.self
        )
        guard let binding = Self(
            captureGroupID: try values.decode(
                UUID.self,
                forKey: .captureGroupID
            ),
            episodeSpaceID: try values.decode(
                String.self,
                forKey: .episodeSpaceID
            ),
            participantID: try values.decode(
                String.self,
                forKey: .participantID
            ),
            ownerAccountID: try values.decode(
                String.self,
                forKey: .ownerAccountID
            ),
            callRoomID: try values.decode(
                String.self,
                forKey: .callRoomID
            ),
            recordingConsentID: try values.decode(
                String.self,
                forKey: .recordingConsentID
            ),
            startReceiptID: try values.decode(
                UUID.self,
                forKey: .startReceiptID
            ),
            projectSlug: try values.decodeIfPresent(
                String.self,
                forKey: .projectSlug
            ),
            episodeSlug: try values.decodeIfPresent(
                String.self,
                forKey: .episodeSlug
            ),
            capturePurpose: try values.decodeIfPresent(
                String.self,
                forKey: .capturePurpose
            )
        ) else {
            throw DecodingError.dataCorrupted(
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription:
                        "The Episode Room binding is incomplete."
                )
            )
        }
        self = binding
    }

    public func matchesSource(
        captureGroupID: UUID,
        episodeSpaceID: String,
        participantID: String
    ) -> Bool {
        self.captureGroupID == captureGroupID
            && self.episodeSpaceID
                == Self.nonempty(episodeSpaceID)
            && self.participantID
                == Self.nonempty(participantID)
    }

    /// Resolves authority for a later same-take companion source. Every
    /// non-nil candidate must name the exact source and agree byte-for-byte;
    /// any disagreement fails closed instead of picking whichever receipt was
    /// observed last.
    public static func exactCompanionBinding(
        candidates: [ProductionCaptureRoomBinding?],
        captureGroupID: UUID,
        episodeSpaceID: String,
        participantID: String
    ) -> ProductionCaptureRoomBinding? {
        let present = candidates.compactMap { $0 }
        guard let first = present.first,
              present.allSatisfy({
                  $0 == first
                      && $0.matchesSource(
                          captureGroupID: captureGroupID,
                          episodeSpaceID: episodeSpaceID,
                          participantID: participantID
                      )
              }) else {
            return nil
        }
        return first
    }

    private static func nonempty(
        _ value: String?
    ) -> String? {
        let clean = value?.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return clean?.isEmpty == false ? clean : nil
    }
}

/// One uncertainty-bearing bridge between an immutable local source clock and
/// the Episode Room server clock. Source media timestamps remain authoritative;
/// this evidence may only seed reviewed alignment.
public struct ProductionCaptureClockSample:
    Codable,
    Equatable,
    Identifiable,
    Sendable
{
    public let protocolVersion: Int
    public let sampleId: UUID
    public let callRoomId: String
    public let captureGroupId: UUID
    public let clientKind: String
    public let deviceWallSentAt: Date
    public let deviceMonotonicSentNanoseconds: UInt64
    public let serverReceivedAt: Date
    public let serverSentAt: Date
    public let deviceWallReceivedAt: Date
    public let deviceMonotonicReceivedNanoseconds: UInt64
    public let networkRoundTripMilliseconds: Double
    public let serverOffsetMilliseconds: Double
    public let uncertaintyMilliseconds: Double
    public let wallClockDiscontinuityMilliseconds: Double

    public var id: UUID { sampleId }

    public init(
        protocolVersion: Int,
        sampleId: UUID,
        callRoomId: String,
        captureGroupId: UUID,
        clientKind: String,
        deviceWallSentAt: Date,
        deviceMonotonicSentNanoseconds: UInt64,
        serverReceivedAt: Date,
        serverSentAt: Date,
        deviceWallReceivedAt: Date,
        deviceMonotonicReceivedNanoseconds: UInt64,
        networkRoundTripMilliseconds: Double,
        serverOffsetMilliseconds: Double,
        uncertaintyMilliseconds: Double,
        wallClockDiscontinuityMilliseconds: Double
    ) {
        self.protocolVersion = protocolVersion
        self.sampleId = sampleId
        self.callRoomId = callRoomId
        self.captureGroupId = captureGroupId
        self.clientKind = clientKind
        self.deviceWallSentAt = deviceWallSentAt
        self.deviceMonotonicSentNanoseconds =
            deviceMonotonicSentNanoseconds
        self.serverReceivedAt = serverReceivedAt
        self.serverSentAt = serverSentAt
        self.deviceWallReceivedAt = deviceWallReceivedAt
        self.deviceMonotonicReceivedNanoseconds =
            deviceMonotonicReceivedNanoseconds
        self.networkRoundTripMilliseconds =
            networkRoundTripMilliseconds
        self.serverOffsetMilliseconds = serverOffsetMilliseconds
        self.uncertaintyMilliseconds = uncertaintyMilliseconds
        self.wallClockDiscontinuityMilliseconds =
            wallClockDiscontinuityMilliseconds
    }

    private enum CodingKeys: String, CodingKey {
        case protocolVersion
        case sampleId
        case callRoomId
        case captureGroupId
        case clientKind
        case deviceWallSentAt
        case deviceMonotonicSentNanoseconds
        case serverReceivedAt
        case serverSentAt
        case deviceWallReceivedAt
        case deviceMonotonicReceivedNanoseconds
        case networkRoundTripMilliseconds
        case serverOffsetMilliseconds
        case uncertaintyMilliseconds
        case wallClockDiscontinuityMilliseconds
    }

    public init(from decoder: Decoder) throws {
        let container = try decoder.container(
            keyedBy: CodingKeys.self
        )
        protocolVersion = try container.decode(
            Int.self,
            forKey: .protocolVersion
        )
        sampleId = try container.decode(
            UUID.self,
            forKey: .sampleId
        )
        callRoomId = try container.decode(
            String.self,
            forKey: .callRoomId
        )
        captureGroupId = try container.decode(
            UUID.self,
            forKey: .captureGroupId
        )
        clientKind = try container.decode(
            String.self,
            forKey: .clientKind
        )
        deviceWallSentAt = try container.decode(
            Date.self,
            forKey: .deviceWallSentAt
        )
        deviceMonotonicSentNanoseconds = try Self.decodeNanoseconds(
            from: container,
            forKey: .deviceMonotonicSentNanoseconds
        )
        serverReceivedAt = try container.decode(
            Date.self,
            forKey: .serverReceivedAt
        )
        serverSentAt = try container.decode(
            Date.self,
            forKey: .serverSentAt
        )
        deviceWallReceivedAt = try container.decode(
            Date.self,
            forKey: .deviceWallReceivedAt
        )
        deviceMonotonicReceivedNanoseconds =
            try Self.decodeNanoseconds(
                from: container,
                forKey: .deviceMonotonicReceivedNanoseconds
            )
        networkRoundTripMilliseconds = try container.decode(
            Double.self,
            forKey: .networkRoundTripMilliseconds
        )
        serverOffsetMilliseconds = try container.decode(
            Double.self,
            forKey: .serverOffsetMilliseconds
        )
        uncertaintyMilliseconds = try container.decode(
            Double.self,
            forKey: .uncertaintyMilliseconds
        )
        wallClockDiscontinuityMilliseconds = try container.decode(
            Double.self,
            forKey: .wallClockDiscontinuityMilliseconds
        )
    }

    public func encode(to encoder: Encoder) throws {
        var container = encoder.container(
            keyedBy: CodingKeys.self
        )
        try container.encode(
            protocolVersion,
            forKey: .protocolVersion
        )
        try container.encode(sampleId, forKey: .sampleId)
        try container.encode(callRoomId, forKey: .callRoomId)
        try container.encode(
            captureGroupId,
            forKey: .captureGroupId
        )
        try container.encode(clientKind, forKey: .clientKind)
        try container.encode(
            deviceWallSentAt,
            forKey: .deviceWallSentAt
        )
        try container.encode(
            String(deviceMonotonicSentNanoseconds),
            forKey: .deviceMonotonicSentNanoseconds
        )
        try container.encode(
            serverReceivedAt,
            forKey: .serverReceivedAt
        )
        try container.encode(
            serverSentAt,
            forKey: .serverSentAt
        )
        try container.encode(
            deviceWallReceivedAt,
            forKey: .deviceWallReceivedAt
        )
        try container.encode(
            String(deviceMonotonicReceivedNanoseconds),
            forKey: .deviceMonotonicReceivedNanoseconds
        )
        try container.encode(
            networkRoundTripMilliseconds,
            forKey: .networkRoundTripMilliseconds
        )
        try container.encode(
            serverOffsetMilliseconds,
            forKey: .serverOffsetMilliseconds
        )
        try container.encode(
            uncertaintyMilliseconds,
            forKey: .uncertaintyMilliseconds
        )
        try container.encode(
            wallClockDiscontinuityMilliseconds,
            forKey: .wallClockDiscontinuityMilliseconds
        )
    }

    private static func decodeNanoseconds(
        from container: KeyedDecodingContainer<CodingKeys>,
        forKey key: CodingKeys
    ) throws -> UInt64 {
        if let value = try? container.decode(
            UInt64.self,
            forKey: key
        ) {
            return value
        }
        let encoded = try container.decode(
            String.self,
            forKey: key
        )
        guard let value = UInt64(encoded) else {
            throw DecodingError.dataCorruptedError(
                forKey: key,
                in: container,
                debugDescription:
                    "Expected unsigned nanoseconds as a decimal string."
            )
        }
        return value
    }
}

/// Shared receipt date coding preserves millisecond clock evidence while
/// continuing to read Quipsly's earlier whole-second ISO and Foundation-date
/// receipts.
public enum ProductionCaptureDateCoding {
    public static let encode:
        @Sendable (Date, Encoder) throws -> Void =
    { date, encoder in
        var container = encoder.singleValueContainer()
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        try container.encode(formatter.string(from: date))
    }

    public static let decode:
        @Sendable (Decoder) throws -> Date =
    { decoder in
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(String.self) {
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [
                .withInternetDateTime,
                .withFractionalSeconds,
            ]
            if let date = fractional.date(from: value) {
                return date
            }
            let wholeSeconds = ISO8601DateFormatter()
            wholeSeconds.formatOptions = [.withInternetDateTime]
            if let date = wholeSeconds.date(from: value) {
                return date
            }
        }
        if let referenceSeconds =
            try? container.decode(Double.self),
           referenceSeconds.isFinite {
            return Date(
                timeIntervalSinceReferenceDate:
                    referenceSeconds
            )
        }
        throw DecodingError.dataCorruptedError(
            in: container,
            debugDescription:
                "Expected a Quipsly ISO-8601 or legacy Foundation date."
        )
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
public struct MacAudioSystemDefaultRoute: Equatable, Sendable {
    public let inputUID: String?
    public let outputUID: String?

    public init(inputUID: String?, outputUID: String?) {
        self.inputUID = inputUID
        self.outputUID = outputUID
    }
}

public enum MacAudioSystemRouteError: LocalizedError, Equatable {
    case missingInput(String)
    case missingOutput(String)
    case inputHasNoChannels(String)
    case outputHasNoChannels(String)
    case coreAudioWrite(String, Int32)
    case verificationFailed(
        expectedInput: String,
        expectedOutput: String,
        observedInput: String?,
        observedOutput: String?
    )

    public var errorDescription: String? {
        switch self {
        case .missingInput(let uid):
            "Core Audio no longer exposes the selected microphone UID \(uid)."
        case .missingOutput(let uid):
            "Core Audio no longer exposes the selected headphone UID \(uid)."
        case .inputHasNoChannels(let uid):
            "The selected microphone UID \(uid) has no input channels."
        case .outputHasNoChannels(let uid):
            "The selected headphone UID \(uid) has no output channels."
        case .coreAudioWrite(let route, let status):
            "macOS refused to change the system-default \(route) (Core Audio status \(status))."
        case .verificationFailed(
            let expectedInput,
            let expectedOutput,
            let observedInput,
            let observedOutput
        ):
            "macOS did not retain the requested system call route. Expected \(expectedInput) / \(expectedOutput), observed \(observedInput ?? "none") / \(observedOutput ?? "none")."
        }
    }
}

public enum MacAudioSystemRouteController {
    public static func currentDefaultRoute() -> MacAudioSystemDefaultRoute {
        MacAudioHardwareProbe.systemDefaultRoute()
    }

    @discardableResult
    public static func makeSystemDefault(
        inputUID: String,
        outputUID: String
    ) throws -> MacAudioSystemDefaultRoute {
        try MacAudioHardwareProbe.makeSystemDefault(
            inputUID: inputUID,
            outputUID: outputUID
        )
    }
}

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

    static func deviceUID(
        for deviceID: AudioDeviceID
    ) -> String? {
        readString(
            object: deviceID,
            selector: kAudioDevicePropertyDeviceUID
        )
    }

    static func systemDefaultRoute() -> MacAudioSystemDefaultRoute {
        let system = AudioObjectID(kAudioObjectSystemObject)
        let input = readDeviceID(
            object: system,
            selector: kAudioHardwarePropertyDefaultInputDevice
        ).flatMap(deviceUID(for:))
        let output = readDeviceID(
            object: system,
            selector: kAudioHardwarePropertyDefaultOutputDevice
        ).flatMap(deviceUID(for:))
        return MacAudioSystemDefaultRoute(
            inputUID: input,
            outputUID: output
        )
    }

    static func makeSystemDefault(
        inputUID: String,
        outputUID: String
    ) throws -> MacAudioSystemDefaultRoute {
        guard let inputID = deviceID(forUID: inputUID) else {
            throw MacAudioSystemRouteError.missingInput(inputUID)
        }
        guard let outputID = deviceID(forUID: outputUID) else {
            throw MacAudioSystemRouteError.missingOutput(outputUID)
        }
        guard channelCount(
            deviceID: inputID,
            scope: kAudioDevicePropertyScopeInput
        ) > 0 else {
            throw MacAudioSystemRouteError.inputHasNoChannels(inputUID)
        }
        guard channelCount(
            deviceID: outputID,
            scope: kAudioDevicePropertyScopeOutput
        ) > 0 else {
            throw MacAudioSystemRouteError.outputHasNoChannels(outputUID)
        }

        let system = AudioObjectID(kAudioObjectSystemObject)
        let previousInput = readDeviceID(
            object: system,
            selector: kAudioHardwarePropertyDefaultInputDevice
        )
        let previousOutput = readDeviceID(
            object: system,
            selector: kAudioHardwarePropertyDefaultOutputDevice
        )

        do {
            try writeDeviceID(
                inputID,
                object: system,
                selector: kAudioHardwarePropertyDefaultInputDevice,
                routeLabel: "microphone"
            )
            try writeDeviceID(
                outputID,
                object: system,
                selector: kAudioHardwarePropertyDefaultOutputDevice,
                routeLabel: "headphone output"
            )
            let observed = systemDefaultRoute()
            guard observed.inputUID == inputUID,
                  observed.outputUID == outputUID else {
                throw MacAudioSystemRouteError.verificationFailed(
                    expectedInput: inputUID,
                    expectedOutput: outputUID,
                    observedInput: observed.inputUID,
                    observedOutput: observed.outputUID
                )
            }
            return observed
        } catch {
            if let previousInput {
                try? writeDeviceID(
                    previousInput,
                    object: system,
                    selector: kAudioHardwarePropertyDefaultInputDevice,
                    routeLabel: "microphone rollback"
                )
            }
            if let previousOutput {
                try? writeDeviceID(
                    previousOutput,
                    object: system,
                    selector: kAudioHardwarePropertyDefaultOutputDevice,
                    routeLabel: "headphone rollback"
                )
            }
            throw error
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

    private static func writeDeviceID(
        _ deviceID: AudioDeviceID,
        object: AudioObjectID,
        selector: AudioObjectPropertySelector,
        routeLabel: String
    ) throws {
        var property = address(selector: selector)
        var value = deviceID
        let byteCount = UInt32(MemoryLayout<AudioDeviceID>.size)
        let status = AudioObjectSetPropertyData(
            object,
            &property,
            0,
            nil,
            byteCount,
            &value
        )
        guard status == noErr else {
            throw MacAudioSystemRouteError.coreAudioWrite(
                routeLabel,
                status
            )
        }
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
