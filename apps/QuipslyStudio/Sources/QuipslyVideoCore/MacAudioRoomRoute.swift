import Foundation

#if os(macOS)
public struct ProviderAudioDeviceSnapshot: Identifiable, Equatable, Sendable {
    public let id: String
    public let name: String

    public init(id: String, name: String) {
        self.id = id
        self.name = name
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
    public let truth: String

    public init(
        status: MacAudioRoomRouteStatus,
        providerInput: ProviderAudioDeviceSnapshot?,
        providerOutput: ProviderAudioDeviceSnapshot?,
        directPhysicalMV7iClaimed: Bool,
        truth: String
    ) {
        self.status = status
        self.providerInput = providerInput
        self.providerOutput = providerOutput
        self.directPhysicalMV7iClaimed = directPhysicalMV7iClaimed
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
        guard let providerInput = providerInputs.first(where: {
            $0.id == coreAudioInput.id
        }) else {
            return blocked(
                "LiveKit does not expose the selected Core Audio input UID. Quipsly will not join with a name-guessed microphone."
            )
        }
        guard let providerOutput = providerOutputs.first(where: {
            $0.id == coreAudioOutput.id
        }) else {
            return blocked(
                "LiveKit does not expose the selected Core Audio output UID. Quipsly will not join with a name-guessed headphone route."
            )
        }

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
                truth:
                    "LiveKit and Core Audio agree on the exact virtual input/output IDs. This can rehearse call transport, but it does not prove direct physical MV7i capture or headphone monitoring."
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
            truth: directPhysicalMV7i
                ? "LiveKit and Core Audio agree on the exact direct MV7i device UID for microphone input and headphone output. The call feed remains separate from the local WAV recorder."
                : "LiveKit and Core Audio agree on both exact device UIDs. The route is ready for an audio-only call, but Quipsly does not label it as a physical MV7i path."
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
            truth: truth
        )
    }
}
#endif
