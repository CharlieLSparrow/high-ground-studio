import Foundation
import AVFoundation

let path = "/Users/wall-e/Library/CloudStorage/GoogleDrive-charlie@highgroundodyssey.com/Shared drives/HighGroundDrive/Podcast/Episode 1/First Pod Ever.wav"
let url = URL(fileURLWithPath: path)
let asset = AVURLAsset(url: url)

Task {
    print("Loading duration...")
    do {
        let duration = try await asset.load(.duration)
        print("Duration: \(duration.seconds)")
    } catch {
        print("Error: \(error)")
    }
    exit(0)
}

RunLoop.main.run()
