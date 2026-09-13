import Foundation
import AVFoundation

private func require(
    _ condition: @autoclosure () -> Bool,
    _ message: String
) {
    guard condition() else {
        fputs("FAIL \(message)\n", stderr)
        exit(1)
    }
}

@main
struct ProviderRoomCallAudioEvidenceHarness {
    static func main() throws {
        // Exercise the real PCM transform, including interleaved and integer
        // formats. Never modify the SDK-owned input buffer while muting it.
        for format in [AVAudioCommonFormat.pcmFormatFloat32, .pcmFormatInt16, .pcmFormatInt32] {
            for interleaved in [false, true] {
                let audioFormat = AVAudioFormat(commonFormat: format, sampleRate: 48_000, channels: 2, interleaved: interleaved)!
                let original = AVAudioPCMBuffer(pcmFormat: audioFormat, frameCapacity: 480)!
                original.frameLength = 480
                for buffer in UnsafeMutableAudioBufferListPointer(original.mutableAudioBufferList) {
                    memset(buffer.mData!, 0x3f, Int(buffer.mDataByteSize))
                }
                let silence = ProviderAudioPrivacyBuffer.silence(matching: original)!
                require(silence.frameLength == original.frameLength && silence.format == original.format, "mute must preserve PCM duration, rate and channels")
                for buffer in UnsafeMutableAudioBufferListPointer(silence.mutableAudioBufferList) {
                    let bytes = UnsafeRawBufferPointer(start: buffer.mData, count: Int(buffer.mDataByteSize))
                    require(bytes.allSatisfy { $0 == 0 }, "every muted sample must be silence")
                }
                for buffer in UnsafeMutableAudioBufferListPointer(original.mutableAudioBufferList) {
                    let bytes = UnsafeRawBufferPointer(start: buffer.mData, count: Int(buffer.mDataByteSize))
                    require(bytes.allSatisfy { $0 == 0x3f }, "mute must not overwrite provider-owned input")
                }
            }
        }

        // Materialize a three-part file, then read it back: speech, mute,
        // speech must remain one continuous clock, with no private middle PCM.
        let format = AVAudioFormat(standardFormatWithSampleRate: 48_000, channels: 1)!
        let input = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4_800)!
        input.frameLength = 4_800
        for i in 0..<4_800 { input.floatChannelData![0][i] = 0.25 }
        let fileURL = FileManager.default.temporaryDirectory.appendingPathComponent("quipsly-mute-\(UUID().uuidString).caf")
        defer { try? FileManager.default.removeItem(at: fileURL) }
        var writer: AVAudioFile? = try AVAudioFile(forWriting: fileURL, settings: format.settings)
        try writer!.write(from: input)
        try writer!.write(from: ProviderAudioPrivacyBuffer.silence(matching: input)!)
        try writer!.write(from: input)
        writer = nil // Close and flush the container before independent readback.
        let reader = try AVAudioFile(forReading: fileURL)
        require(reader.length == 14_400, "mute must preserve the three-part recording duration")
        let readback = AVAudioPCMBuffer(pcmFormat: reader.processingFormat, frameCapacity: 14_400)!
        var readFrames = 0
        while readFrames < reader.length {
            try reader.read(into: readback)
            require(readback.frameLength > 0, "the PCM reader must reach the saved final frame")
            for index in 0..<Int(readback.frameLength) {
                let position = readFrames + index
                let expected: Float = (4_800..<9_600).contains(position) ? 0 : 0.25
                require(abs(readback.floatChannelData![0][index] - expected) < 0.000001, "saved sample \(position) was \(readback.floatChannelData![0][index]), expected \(expected)")
            }
            readFrames += Int(readback.frameLength)
        }
        require(readFrames == 14_400, "all retained PCM samples must be read")

        let now = Date(timeIntervalSince1970: 1_787_500_000)

        func health(
            connected: Bool = true,
            muted: Bool = false,
            average: Float = -24,
            peak: Float = -9,
            receivedAt: Date? = nil
        ) -> ProviderRoomCallAudioHealth {
            ProviderRoomCallAudioEvidence.resolve(
                isConnected: connected,
                isMuted: muted,
                averagePowerDBFS: average,
                peakPowerDBFS: peak,
                receivedPCMAt: receivedAt,
                now: now
            )
        }

        require(
            health(connected: false) == .checking,
            "a disconnected room must not imply that audio is being observed"
        )
        require(
            health(muted: true, receivedAt: now) == .muted,
            "a deliberately muted microphone must not be reported as broken"
        )
        require(
            health(receivedAt: nil) == .checking,
            "an unmuted room waiting for its first PCM buffer must show checking"
        )
        require(
            health(average: -160, peak: -160, receivedAt: now) == .noSignal,
            "observed digital silence must be a no-signal state"
        )
        require(
            health(average: -70, peak: -52, receivedAt: now) == .tooQuiet,
            "very low speech must be called low in ordinary language"
        )
        require(
            health(average: -24, peak: -9, receivedAt: now) == .healthy,
            "representative speech with headroom must be healthy"
        )
        require(
            health(average: -11.5, peak: -5, receivedAt: now) == .hot,
            "high average level must be loud before it clips"
        )
        require(
            health(average: -18, peak: -0.8, receivedAt: now) == .clippingRisk,
            "near-full-scale speech must expose clipping risk"
        )
        require(
            health(
                receivedAt: now.addingTimeInterval(
                    -(ProviderRoomCallAudioEvidence.staleInputInterval + 0.1)
                )
            ) == .needsAttention,
            "a previously live microphone that stops delivering PCM must need attention"
        )
        require(
            ProviderRoomCallAudioHealth.healthy.detail == nil,
            "healthy audio must not clutter the call with instructions"
        )
        require(
            ProviderRoomCallAudioHealth.noSignal.detail?.contains("Speak once") == true,
            "no-signal recovery must be short and actionable"
        )
        require(
            ProviderRoomCallAudioHealth.clippingRisk.title == "Microphone may clip",
            "ordinary call copy must avoid unexplained technical units"
        )
        require(
            ProviderRoomParticipantPresence.label(remoteParticipantCount: 0)
                == "Waiting for others",
            "a solo joined participant must get a familiar waiting state"
        )
        require(
            ProviderRoomParticipantPresence.label(remoteParticipantCount: 1)
                == "2 people here",
            "one remote participant must produce the ordinary total-person count"
        )
        require(
            ProviderRoomParticipantPresence.label(remoteParticipantCount: 4)
                == "5 people here",
            "larger calls must include the local participant in the total"
        )

        print("PASS Provider room call audio evidence keeps live mic confidence plain, transient, and distinct from recording.")
    }
}
