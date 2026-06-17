import SwiftUI
import QuipslyVideoCore

public struct WaveformView: View {
    let sourceVideo: SourceVideo
    let allowExternalOriginalMedia: Bool
    @ObservedObject var generator = WaveformGenerator.shared

    public init(sourceVideo: SourceVideo, allowExternalOriginalMedia: Bool = false) {
        self.sourceVideo = sourceVideo
        self.allowExternalOriginalMedia = allowExternalOriginalMedia
    }

    public var body: some View {
        GeometryReader { geo in
            if let samples = generator.waveforms[sourceVideo.id] {
                waveformPath(samples: samples, size: geo.size)
                    .fill(Color.blue.opacity(0.8))
            } else if generator.inFlight.contains(sourceVideo.id) {
                blockedWaveformLabel(icon: "waveform", text: "reading waveform", color: .blue, showProgress: true)
            } else if let error = generator.waveformErrors[sourceVideo.id] {
                blockedWaveformLabel(icon: "waveform.badge.exclamationmark", text: shortError(error), color: .orange)
            } else if case let .blocked(icon, text, color) = waveformReadiness {
                blockedWaveformLabel(icon: icon, text: text, color: color)
            } else {
                Color.clear
                    .onAppear {
                        guard case let .ready(url) = waveformReadiness else { return }
                        generator.generateWaveform(
                            for: sourceVideo,
                            analysisURL: url,
                            targetSamples: Int(geo.size.width)
                        )
                    }
            }
        }
    }

    private func waveformPath(samples: [Float], size: CGSize) -> Path {
        Path { path in
            guard !samples.isEmpty else { return }
            let width = size.width
            let height = size.height
            let step = width / CGFloat(samples.count)
            let centerY = height / 2

            path.move(to: CGPoint(x: 0, y: centerY))

            for (index, sample) in samples.enumerated() {
                let x = CGFloat(index) * step
                let normalizedAmplitude = CGFloat(min(max(sample * 10, 0), 1.0))
                let y = centerY - (normalizedAmplitude * centerY)
                path.addLine(to: CGPoint(x: x, y: y))
            }

            for (index, sample) in samples.enumerated().reversed() {
                let x = CGFloat(index) * step
                let normalizedAmplitude = CGFloat(min(max(sample * 10, 0), 1.0))
                let y = centerY + (normalizedAmplitude * centerY)
                path.addLine(to: CGPoint(x: x, y: y))
            }
            path.closeSubpath()
        }
    }

    private var waveformReadiness: WaveformReadiness {
        guard sourceVideo.duration.isFinite, sourceVideo.duration > 0 else {
            return .blocked(icon: "waveform.badge.exclamationmark", text: "duration unknown", color: .orange)
        }

        if let proxyURL = sourceVideo.proxyURL {
            if ExternalMediaAccess.shared.fileExistsWithoutPrompt(at: proxyURL) == true {
                return .ready(proxyURL)
            }
            if ExternalMediaAccess.shared.fileExistsWithoutPrompt(at: proxyURL) == nil {
                return .blocked(icon: "externaldrive.badge.exclamationmark", text: "proxy protected", color: .orange)
            }
            return .blocked(icon: "waveform.badge.exclamationmark", text: "proxy missing", color: .orange)
        }

        if sourceVideo.mediaURL.path.hasPrefix("/__quipsly_missing_media__") {
            return .blocked(icon: "questionmark.folder", text: "source missing", color: .red)
        }

        if isVideoURL(sourceVideo.mediaURL) {
            return .blocked(icon: "bolt.shield", text: "proxy needed", color: .green)
        }

        let originalURL = sourceVideo.mediaURL
        let originalPath = originalURL.standardizedFileURL.path
        if ExternalMediaAccess.isProtectedUserMediaPath(originalPath) {
            guard allowExternalOriginalMedia,
                  ExternalMediaAccess.shared.hasReadableAccess(to: originalURL) else {
                return .blocked(icon: "externaldrive.badge.exclamationmark", text: "proxy needed", color: .orange)
            }
        }

        if ExternalMediaAccess.shared.fileExistsWithoutPrompt(at: originalURL) != true {
            return .blocked(icon: "questionmark.folder", text: "source offline", color: .red)
        }

        return .ready(originalURL)
    }

    private func blockedWaveformLabel(icon: String, text: String, color: Color, showProgress: Bool = false) -> some View {
        ZStack {
            Color.clear
            HStack(spacing: 6) {
                if showProgress {
                    ProgressView()
                        .controlSize(.small)
                } else {
                    Image(systemName: icon)
                }
                Text(text)
            }
            .font(.caption2)
            .fontWeight(.semibold)
            .foregroundStyle(color.opacity(0.88))
            .padding(.horizontal, 6)
            .padding(.vertical, 3)
            .background(color.opacity(0.08))
            .clipShape(Capsule())
        }
    }

    private func shortError(_ error: String) -> String {
        if error.lowercased().contains("no audio") {
            return "no waveform audio"
        }
        return "waveform unavailable"
    }

    private func isVideoURL(_ url: URL) -> Bool {
        let ext = url.pathExtension.lowercased()
        return ["mp4", "mov", "m4v", "avi", "mkv", "webm"].contains(ext)
    }
}

private enum WaveformReadiness {
    case ready(URL)
    case blocked(icon: String, text: String, color: Color)
}
