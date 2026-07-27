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
}
#endif
