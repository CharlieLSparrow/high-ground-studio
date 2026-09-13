import Foundation
import CoreImage
import CoreVideo
import LiveKit

// A real provider peer for local runtime tests. It uses an application-issued
// token from stdin and publishes generated pixels, never camera or microphone
// input. It deliberately lives outside the app target and ordinary navigation.
private struct PeerInput: Decodable {
    let serverUrl: String
    let participantToken: String
    let durationSeconds: Int
    let blue: Bool
}

private struct QuietPeerLogger: LiveKit.Logger {
    func log(_ message: @autoclosure () -> any CustomStringConvertible,
             _ level: LiveKit.LogLevel, source: @autoclosure () -> String?,
             file: StaticString, type: Any.Type, function: StaticString,
             line: UInt, metaData: LiveKit.ScopedMetadataContainer) {}
}

@main
struct SyntheticCallVideoPeer {
    static func main() async throws {
        let input = try JSONDecoder().decode(PeerInput.self,
            from: FileHandle.standardInput.readDataToEndOfFile())
        guard let url = URL(string: input.serverUrl),
              ["localhost", "127.0.0.1", "::1"].contains(url.host ?? "") else {
            fatalError("Synthetic peer only connects to a local test provider")
        }
        LiveKitSDK.setLogger(QuietPeerLogger())
        let room = Room()
        try await room.connect(url: input.serverUrl, token: input.participantToken,
            connectOptions: ConnectOptions(autoSubscribe: false))
        let track = LocalVideoTrack.createBufferTrack(name: "Synthetic call video", source: .camera)
        guard let capturer = track.capturer as? BufferCapturer else { fatalError("Buffer capturer unavailable") }
        let context = CIContext()
        let frames = Task {
            var frame = 0
            while !Task.isCancelled {
                // Each published frame owns its pixels while the asynchronous
                // encoder is using them; never repaint an in-flight buffer.
                var buffer: CVPixelBuffer?
                precondition(CVPixelBufferCreate(kCFAllocatorDefault, 640, 360,
                    kCVPixelFormatType_32BGRA, [kCVPixelBufferIOSurfacePropertiesKey: [:]] as CFDictionary,
                    &buffer) == kCVReturnSuccess)
                guard let buffer else { fatalError("Pixel buffer unavailable") }
                let pulse = CGFloat(frame % 30) / 150
                let color = input.blue
                    ? CIColor(red: 0.08, green: 0.35 + pulse, blue: 0.75)
                    : CIColor(red: 0.75, green: 0.48 + pulse, blue: 0.12)
                context.render(CIImage(color: color), to: buffer)
                capturer.capture(buffer)
                frame += 1
                try? await Task.sleep(for: .milliseconds(67))
            }
        }
        _ = try await room.localParticipant.publish(videoTrack: track)
        print("Synthetic video published; no microphone or camera was opened")
        try await Task.sleep(for: .seconds(max(1, min(600, input.durationSeconds))))
        frames.cancel()
        await room.disconnect()
        print("Synthetic video peer disconnected")
    }
}
