import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
final class MacAudioRoomRouteTests: XCTestCase {
    func testExactPhysicalMV7iRouteIsReadyAndMayMakePhysicalClaim() {
        let interface = CaptureAudioDeviceSnapshot(
            id: "AppleUSBAudioEngine:Shure:MV7i:001",
            name: "Shure MV7i",
            manufacturer: "Shure",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )

        let result = MacAudioRoomRoutePolicy.resolve(
            coreAudioInput: interface,
            coreAudioOutput: interface,
            providerInputs: [
                ProviderAudioDeviceSnapshot(
                    id: interface.id,
                    name: "Shure MV7i"
                ),
            ],
            providerOutputs: [
                ProviderAudioDeviceSnapshot(
                    id: interface.id,
                    name: "Shure MV7i"
                ),
            ]
        )

        XCTAssertEqual(result.status, .ready)
        XCTAssertTrue(result.directPhysicalMV7iClaimed)
        XCTAssertEqual(result.providerInput?.id, interface.id)
        XCTAssertEqual(result.providerOutput?.id, interface.id)
    }

    func testExactMotivVirtualRouteIsRehearsalOnly() {
        let route = CaptureAudioDeviceSnapshot(
            id: "motiv-mix-virtual-48k",
            name: "MOTIV Mix Virtual",
            manufacturer: "Shure",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )

        let result = MacAudioRoomRoutePolicy.resolve(
            coreAudioInput: route,
            coreAudioOutput: route,
            providerInputs: [
                ProviderAudioDeviceSnapshot(
                    id: route.id,
                    name: route.name
                ),
            ],
            providerOutputs: [
                ProviderAudioDeviceSnapshot(
                    id: route.id,
                    name: route.name
                ),
            ]
        )

        XCTAssertEqual(result.status, .rehearsalOnly)
        XCTAssertFalse(result.directPhysicalMV7iClaimed)
        XCTAssertTrue(result.truth.contains("does not prove direct physical MV7i"))
    }

    func testMatchingNamesCannotSubstituteForMismatchedDeviceIDs() {
        let interface = CaptureAudioDeviceSnapshot(
            id: "core-audio-mv7i-uid",
            name: "Shure MV7i",
            manufacturer: "Shure",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )

        let result = MacAudioRoomRoutePolicy.resolve(
            coreAudioInput: interface,
            coreAudioOutput: interface,
            providerInputs: [
                ProviderAudioDeviceSnapshot(
                    id: "different-provider-input-id",
                    name: "Shure MV7i"
                ),
            ],
            providerOutputs: [
                ProviderAudioDeviceSnapshot(
                    id: "different-provider-output-id",
                    name: "Shure MV7i"
                ),
            ]
        )

        XCTAssertEqual(result.status, .blocked)
        XCTAssertFalse(result.directPhysicalMV7iClaimed)
        XCTAssertNil(result.providerInput)
        XCTAssertTrue(result.truth.contains("name-guessed"))
    }

    func testLiveKitDefaultProxyRequiresVerifiedCoreAudioDefaults() {
        let interface = CaptureAudioDeviceSnapshot(
            id: "core-audio-mv7i-uid",
            name: "Shure MV7i",
            manufacturer: "Shure",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )
        let providerDefault = ProviderAudioDeviceSnapshot(
            id: "default",
            name: "Default",
            isDefault: true
        )

        let result = MacAudioRoomRoutePolicy.resolve(
            coreAudioInput: interface,
            coreAudioOutput: interface,
            providerInputs: [providerDefault],
            providerOutputs: [providerDefault]
        )

        XCTAssertEqual(result.status, .blocked)
        XCTAssertFalse(result.usesSystemDefaultProxy)
        XCTAssertFalse(result.usesSystemDefaultInputProxy)
        XCTAssertFalse(result.usesSystemDefaultOutputProxy)
        XCTAssertTrue(result.truth.contains("not the verified macOS system default"))
    }

    func testVerifiedCoreAudioDefaultsMayBindLiveKitDefaultProxies() {
        let interface = CaptureAudioDeviceSnapshot(
            id: "core-audio-mv7i-uid",
            name: "Shure MV7i",
            manufacturer: "Shure",
            inputChannels: 2,
            outputChannels: 2,
            nominalSampleRate: 48_000,
            isDefaultInput: true,
            isDefaultOutput: true
        )
        let providerDefault = ProviderAudioDeviceSnapshot(
            id: "default",
            name: "Default",
            isDefault: true
        )

        let result = MacAudioRoomRoutePolicy.resolve(
            coreAudioInput: interface,
            coreAudioOutput: interface,
            providerInputs: [providerDefault],
            providerOutputs: [providerDefault]
        )

        XCTAssertEqual(result.status, .ready)
        XCTAssertTrue(result.usesSystemDefaultProxy)
        XCTAssertTrue(result.usesSystemDefaultInputProxy)
        XCTAssertTrue(result.usesSystemDefaultOutputProxy)
        XCTAssertTrue(result.directPhysicalMV7iClaimed)
        XCTAssertEqual(result.providerInput?.id, "default")
        XCTAssertTrue(result.truth.contains("system default"))
    }

    func testDifferentExactNonVirtualDevicesRemainTruthfulAndReady() {
        let microphone = CaptureAudioDeviceSnapshot(
            id: "exact-input",
            name: "Studio USB Microphone",
            manufacturer: "Example",
            inputChannels: 1,
            outputChannels: 0,
            nominalSampleRate: 48_000
        )
        let headphones = CaptureAudioDeviceSnapshot(
            id: "exact-output",
            name: "Studio Headphones",
            manufacturer: "Example",
            inputChannels: 0,
            outputChannels: 2,
            nominalSampleRate: 48_000
        )

        let result = MacAudioRoomRoutePolicy.resolve(
            coreAudioInput: microphone,
            coreAudioOutput: headphones,
            providerInputs: [
                ProviderAudioDeviceSnapshot(
                    id: microphone.id,
                    name: microphone.name
                ),
            ],
            providerOutputs: [
                ProviderAudioDeviceSnapshot(
                    id: headphones.id,
                    name: headphones.name
                ),
            ]
        )

        XCTAssertEqual(result.status, .ready)
        XCTAssertFalse(result.directPhysicalMV7iClaimed)
        XCTAssertTrue(result.truth.contains("does not label it as a physical MV7i"))
    }

    func testActiveRouteIntegrityRequiresExactAvailableInputAndOutput() {
        let input = ProviderAudioDeviceSnapshot(
            id: "mv7i-input",
            name: "Shure MV7i"
        )
        let output = ProviderAudioDeviceSnapshot(
            id: "mv7i-output",
            name: "Shure MV7i"
        )

        let result = MacAudioRoomRoutePolicy.verifyActiveProviderRoute(
            expectedInputDeviceID: input.id,
            expectedOutputDeviceID: output.id,
            providerInputs: [input],
            providerOutputs: [output],
            activeInputDeviceID: input.id,
            activeOutputDeviceID: output.id
        )

        XCTAssertEqual(result.status, .verified)
        XCTAssertEqual(result.observedInputDeviceID, input.id)
        XCTAssertEqual(result.observedOutputDeviceID, output.id)
        XCTAssertTrue(result.truth.contains("exact locked Core Audio"))
    }

    func testActiveRouteIntegrityFailsWhenSelectedHeadphonesDisappear() {
        let result = MacAudioRoomRoutePolicy.verifyActiveProviderRoute(
            expectedInputDeviceID: "mv7i",
            expectedOutputDeviceID: "mv7i",
            providerInputs: [
                ProviderAudioDeviceSnapshot(
                    id: "mv7i",
                    name: "Shure MV7i"
                ),
            ],
            providerOutputs: [],
            activeInputDeviceID: "mv7i",
            activeOutputDeviceID: "macbook-speakers"
        )

        XCTAssertEqual(result.status, .lost)
        XCTAssertEqual(
            result.observedOutputDeviceID,
            "macbook-speakers"
        )
        XCTAssertTrue(
            result.truth.contains(
                "selected headphone output disappeared"
            )
        )
        XCTAssertTrue(result.truth.contains("mute and leave"))
    }

    func testActiveRouteIntegrityRejectsSilentProviderFallback() {
        let mv7i = ProviderAudioDeviceSnapshot(
            id: "mv7i",
            name: "Shure MV7i"
        )

        let result = MacAudioRoomRoutePolicy.verifyActiveProviderRoute(
            expectedInputDeviceID: mv7i.id,
            expectedOutputDeviceID: mv7i.id,
            providerInputs: [
                mv7i,
                ProviderAudioDeviceSnapshot(
                    id: "macbook-mic",
                    name: "MacBook Microphone"
                ),
            ],
            providerOutputs: [mv7i],
            activeInputDeviceID: "macbook-mic",
            activeOutputDeviceID: mv7i.id
        )

        XCTAssertEqual(result.status, .lost)
        XCTAssertTrue(
            result.truth.contains("LiveKit changed the call microphone")
        )
    }

    func testDefaultProxyIntegrityFailsWhenMacOSDefaultRouteChanges() {
        let providerDefault = ProviderAudioDeviceSnapshot(
            id: "default",
            name: "Default",
            isDefault: true
        )

        let result = MacAudioRoomRoutePolicy.verifyActiveProviderRoute(
            expectedInputDeviceID: providerDefault.id,
            expectedOutputDeviceID: providerDefault.id,
            providerInputs: [providerDefault],
            providerOutputs: [providerDefault],
            activeInputDeviceID: providerDefault.id,
            activeOutputDeviceID: providerDefault.id,
            expectedCoreAudioInputUID: "mv7i",
            expectedCoreAudioOutputUID: "mv7i",
            observedDefaultCoreAudioInputUID: "macbook-mic",
            observedDefaultCoreAudioOutputUID: "mv7i"
        )

        XCTAssertEqual(result.status, .lost)
        XCTAssertTrue(
            result.truth.contains("macOS changed the system-default microphone")
        )
        XCTAssertTrue(result.truth.contains("mute and leave"))
    }

    func testHybridProxyIntegrityTracksOnlyTheProxiedDirection() {
        let exactInput = ProviderAudioDeviceSnapshot(
            id: "mv7i",
            name: "Shure MV7i"
        )
        let defaultOutput = ProviderAudioDeviceSnapshot(
            id: "default",
            name: "Default",
            isDefault: true
        )

        let result = MacAudioRoomRoutePolicy.verifyActiveProviderRoute(
            expectedInputDeviceID: exactInput.id,
            expectedOutputDeviceID: defaultOutput.id,
            providerInputs: [exactInput],
            providerOutputs: [defaultOutput],
            activeInputDeviceID: exactInput.id,
            activeOutputDeviceID: defaultOutput.id,
            expectedCoreAudioOutputUID: "mv7i",
            observedDefaultCoreAudioInputUID: "macbook-mic",
            observedDefaultCoreAudioOutputUID: "mv7i"
        )

        XCTAssertEqual(result.status, .verified)
    }
}
#endif
