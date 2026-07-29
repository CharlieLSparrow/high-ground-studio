import Foundation

#if os(macOS)
public struct ProviderAudioDeviceSnapshot: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String
    public let isDefault: Bool

    public init(
        id: String,
        name: String,
        isDefault: Bool = false
    ) {
        self.id = id
        self.name = name
        self.isDefault = isDefault
    }
}

public enum MacAudioRoomRouteStatus: String, Equatable, Sendable {
    case ready
    case rehearsalOnly = "rehearsal-only"
    case blocked
}

public struct MacAudioRoomRouteResolution: Equatable, Sendable {
    public let status: MacAudioRoomRouteStatus
    public let providerInput: ProviderAudioDeviceSnapshot?
    public let providerOutput: ProviderAudioDeviceSnapshot?
    public let directPhysicalMV7iClaimed: Bool
    public let usesSystemDefaultInputProxy: Bool
    public let usesSystemDefaultOutputProxy: Bool
    public var usesSystemDefaultProxy: Bool {
        usesSystemDefaultInputProxy || usesSystemDefaultOutputProxy
    }
    public let truth: String

    public init(
        status: MacAudioRoomRouteStatus,
        providerInput: ProviderAudioDeviceSnapshot?,
        providerOutput: ProviderAudioDeviceSnapshot?,
        directPhysicalMV7iClaimed: Bool,
        usesSystemDefaultInputProxy: Bool,
        usesSystemDefaultOutputProxy: Bool,
        truth: String
    ) {
        self.status = status
        self.providerInput = providerInput
        self.providerOutput = providerOutput
        self.directPhysicalMV7iClaimed = directPhysicalMV7iClaimed
        self.usesSystemDefaultInputProxy = usesSystemDefaultInputProxy
        self.usesSystemDefaultOutputProxy = usesSystemDefaultOutputProxy
        self.truth = truth
    }
}

public enum MacAudioRoomRouteIntegrityStatus:
    String,
    Codable,
    Equatable,
    Sendable
{
    case verified
    case lost
}

public struct MacAudioRoomRouteIntegrity: Equatable, Sendable {
    public let status: MacAudioRoomRouteIntegrityStatus
    public let expectedInputDeviceID: String
    public let expectedOutputDeviceID: String
    public let observedInputDeviceID: String?
    public let observedOutputDeviceID: String?
    public let truth: String

    public init(
        status: MacAudioRoomRouteIntegrityStatus,
        expectedInputDeviceID: String,
        expectedOutputDeviceID: String,
        observedInputDeviceID: String?,
        observedOutputDeviceID: String?,
        truth: String
    ) {
        self.status = status
        self.expectedInputDeviceID = expectedInputDeviceID
        self.expectedOutputDeviceID = expectedOutputDeviceID
        self.observedInputDeviceID = observedInputDeviceID
        self.observedOutputDeviceID = observedOutputDeviceID
        self.truth = truth
    }
}

public enum MacAudioRoomRoutePolicy {
    public static func resolve(
        coreAudioInput: CaptureAudioDeviceSnapshot?,
        coreAudioOutput: CaptureAudioDeviceSnapshot?,
        providerInputs: [ProviderAudioDeviceSnapshot],
        providerOutputs: [ProviderAudioDeviceSnapshot]
    ) -> MacAudioRoomRouteResolution {
        guard let coreAudioInput, let coreAudioOutput else {
            return blocked(
                "Select both the exact call microphone and headphone output before preparing the room."
            )
        }
        let exactProviderInput = providerInputs.first {
            $0.id == coreAudioInput.id
        }
        let providerInput =
            exactProviderInput
            ?? (
                coreAudioInput.isDefaultInput
                    ? providerInputs.first(where: \.isDefault)
                    : nil
            )
        guard let providerInput else {
            return blocked(
                "LiveKit does not expose the selected Core Audio input UID, and that input is not the verified macOS system default. Quipsly will not join with a name-guessed microphone."
            )
        }
        let exactProviderOutput = providerOutputs.first {
            $0.id == coreAudioOutput.id
        }
        let providerOutput =
            exactProviderOutput
            ?? (
                coreAudioOutput.isDefaultOutput
                    ? providerOutputs.first(where: \.isDefault)
                    : nil
            )
        guard let providerOutput else {
            return blocked(
                "LiveKit does not expose the selected Core Audio output UID, and that output is not the verified macOS system default. Quipsly will not join with a name-guessed headphone route."
            )
        }

        let usesSystemDefaultInputProxy = exactProviderInput == nil
        let usesSystemDefaultOutputProxy = exactProviderOutput == nil
        let usesSystemDefaultProxy =
            usesSystemDefaultInputProxy || usesSystemDefaultOutputProxy
        let routeText =
            "\(coreAudioInput.manufacturer ?? "") \(coreAudioInput.name) \(coreAudioOutput.manufacturer ?? "") \(coreAudioOutput.name) \(providerInput.name) \(providerOutput.name)"
                .lowercased()
        let virtual = routeText.contains("virtual")
            || routeText.contains("motiv mix")
        if virtual {
            return MacAudioRoomRouteResolution(
                status: .rehearsalOnly,
                providerInput: providerInput,
                providerOutput: providerOutput,
                directPhysicalMV7iClaimed: false,
                usesSystemDefaultInputProxy: usesSystemDefaultInputProxy,
                usesSystemDefaultOutputProxy: usesSystemDefaultOutputProxy,
                truth:
                    usesSystemDefaultProxy
                        ? "Core Audio proves the selected virtual input/output UIDs are the macOS system defaults, and LiveKit is bound to its default-device proxies. This can rehearse call transport, but it does not prove direct physical MV7i capture or headphone monitoring."
                        : "LiveKit and Core Audio agree on the exact virtual input/output IDs. This can rehearse call transport, but it does not prove direct physical MV7i capture or headphone monitoring."
            )
        }

        let sameInterface = coreAudioInput.id == coreAudioOutput.id
        let mv7i = routeText.contains("mv7i")
        let directPhysicalMV7i = sameInterface && mv7i
        return MacAudioRoomRouteResolution(
            status: .ready,
            providerInput: providerInput,
            providerOutput: providerOutput,
            directPhysicalMV7iClaimed: directPhysicalMV7i,
            usesSystemDefaultInputProxy: usesSystemDefaultInputProxy,
            usesSystemDefaultOutputProxy: usesSystemDefaultOutputProxy,
            truth: directPhysicalMV7i
                ? usesSystemDefaultProxy
                    ? "Core Audio proves the direct MV7i UID is the macOS system default for both microphone and headphones, and LiveKit is bound to its default-device proxies. The call feed remains separate from the local WAV recorder."
                    : "LiveKit and Core Audio agree on the exact direct MV7i device UID for microphone input and headphone output. The call feed remains separate from the local WAV recorder."
                : usesSystemDefaultProxy
                    ? "Core Audio proves the selected input/output UIDs are the macOS system defaults, and LiveKit is bound to its default-device proxies. The route is ready for an audio-only call, but Quipsly does not label it as a physical MV7i path."
                    : "LiveKit and Core Audio agree on both exact device UIDs. The route is ready for an audio-only call, but Quipsly does not label it as a physical MV7i path."
        )
    }

    public static func verifyActiveProviderRoute(
        expectedInputDeviceID: String,
        expectedOutputDeviceID: String,
        providerInputs: [ProviderAudioDeviceSnapshot],
        providerOutputs: [ProviderAudioDeviceSnapshot],
        activeInputDeviceID: String?,
        activeOutputDeviceID: String?,
        expectedCoreAudioInputUID: String? = nil,
        expectedCoreAudioOutputUID: String? = nil,
        observedDefaultCoreAudioInputUID: String? = nil,
        observedDefaultCoreAudioOutputUID: String? = nil
    ) -> MacAudioRoomRouteIntegrity {
        let inputStillAvailable = providerInputs.contains {
            $0.id == expectedInputDeviceID
        }
        let outputStillAvailable = providerOutputs.contains {
            $0.id == expectedOutputDeviceID
        }
        let exactInputStillActive =
            activeInputDeviceID == expectedInputDeviceID
        let exactOutputStillActive =
            activeOutputDeviceID == expectedOutputDeviceID
        let coreAudioInputStillDefault =
            expectedCoreAudioInputUID == nil
            || observedDefaultCoreAudioInputUID == expectedCoreAudioInputUID
        let coreAudioOutputStillDefault =
            expectedCoreAudioOutputUID == nil
            || observedDefaultCoreAudioOutputUID == expectedCoreAudioOutputUID

        guard inputStillAvailable,
              outputStillAvailable,
              exactInputStillActive,
              exactOutputStillActive,
              coreAudioInputStillDefault,
              coreAudioOutputStillDefault else {
            var reasons: [String] = []
            if !inputStillAvailable {
                reasons.append("the selected call microphone disappeared")
            } else if !exactInputStillActive {
                reasons.append("LiveKit changed the call microphone")
            }
            if !outputStillAvailable {
                reasons.append("the selected headphone output disappeared")
            } else if !exactOutputStillActive {
                reasons.append("LiveKit changed the headphone output")
            }
            if !coreAudioInputStillDefault {
                reasons.append("macOS changed the system-default microphone")
            }
            if !coreAudioOutputStillDefault {
                reasons.append("macOS changed the system-default headphone output")
            }
            return MacAudioRoomRouteIntegrity(
                status: .lost,
                expectedInputDeviceID: expectedInputDeviceID,
                expectedOutputDeviceID: expectedOutputDeviceID,
                observedInputDeviceID: activeInputDeviceID,
                observedOutputDeviceID: activeOutputDeviceID,
                truth:
                    "The locked audio-room route is no longer exact: \(reasons.joined(separator: " and ")). Quipsly must mute and leave instead of continuing through a fallback device."
            )
        }

        return MacAudioRoomRouteIntegrity(
            status: .verified,
            expectedInputDeviceID: expectedInputDeviceID,
            expectedOutputDeviceID: expectedOutputDeviceID,
            observedInputDeviceID: activeInputDeviceID,
            observedOutputDeviceID: activeOutputDeviceID,
            truth:
                expectedCoreAudioInputUID == nil
                    ? "The active LiveKit call microphone and headphone output still match the exact locked Core Audio device UIDs."
                    : "The active LiveKit default-device proxies remain selected, and macOS still reports the exact locked Core Audio microphone and headphone UIDs as its system defaults."
        )
    }

    private static func blocked(
        _ truth: String
    ) -> MacAudioRoomRouteResolution {
        MacAudioRoomRouteResolution(
            status: .blocked,
            providerInput: nil,
            providerOutput: nil,
            directPhysicalMV7iClaimed: false,
            usesSystemDefaultInputProxy: false,
            usesSystemDefaultOutputProxy: false,
            truth: truth
        )
    }
}
#endif
