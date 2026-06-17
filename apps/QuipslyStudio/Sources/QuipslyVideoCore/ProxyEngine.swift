import Foundation

public enum ProxyError: Error, LocalizedError {
    case exportSessionCreationFailed
    case exportFailed(Error?)
    case ffmpegMissing
    case ffmpegFailed(status: Int32, output: String)

    public var errorDescription: String? {
        switch self {
        case .exportSessionCreationFailed:
            return "Could not create a native proxy export session."
        case .exportFailed(let error):
            return "Proxy export failed: \(error?.localizedDescription ?? "unknown export error")"
        case .ffmpegMissing:
            return "ffmpeg is not installed or is not available on PATH. Quipsly needs ffmpeg to create lightweight local proxies."
        case .ffmpegFailed(let status, let output):
            let trimmed = output.trimmingCharacters(in: .whitespacesAndNewlines)
            return "ffmpeg proxy generation failed with status \(status): \(trimmed.isEmpty ? "no diagnostic output" : trimmed)"
        }
    }
}

public actor ProxyEngine {
    public static let shared = ProxyEngine()
    
    private init() {}
    
    public func generateProxy(for url: URL) async throws -> URL {
        let outputURL = try LocalMediaVault.shared.proxyURL(for: url)
        let proxyDir = outputURL.deletingLastPathComponent()
        if FileManager.default.fileExists(atPath: outputURL.path) {
            return outputURL
        }

        if !FileManager.default.fileExists(atPath: proxyDir.path) {
            try FileManager.default.createDirectory(at: proxyDir, withIntermediateDirectories: true)
        }

        guard let ffmpegURL = Self.resolveExecutable(named: "ffmpeg", envKey: "QUIPSLY_FFMPEG_PATH") else {
            throw ProxyError.ffmpegMissing
        }

        let temporaryOutputURL = outputURL
            .deletingLastPathComponent()
            .appendingPathComponent(".\(outputURL.deletingPathExtension().lastPathComponent).partial-\(UUID().uuidString).\(outputURL.pathExtension)")

        try? FileManager.default.removeItem(at: temporaryOutputURL)

        let process = Process()
        process.executableURL = ffmpegURL
        if LocalMediaVault.isAudioExtension(url.pathExtension) {
            process.arguments = [
                "-y",
                "-hide_banner",
                "-nostdin",
                "-loglevel", "error",
                "-i", url.path,
                "-map", "0:a:0",
                "-vn",
                "-c:a", "aac",
                "-b:a", "160k",
                "-ar", "48000",
                "-ac", "2",
                "-movflags", "+faststart",
                temporaryOutputURL.path
            ]
        } else {
            process.arguments = [
                "-y",
                "-hide_banner",
                "-nostdin",
                "-loglevel", "error",
                "-i", url.path,
                "-map", "0:v:0",
                "-an",
                "-vf", "scale=960:-2,fps=30",
                "-c:v", "libx264",
                "-preset", "veryfast",
                "-crf", "30",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                temporaryOutputURL.path
            ]
        }

        let outputPipe = Pipe()
        process.standardOutput = outputPipe
        process.standardError = outputPipe

        do {
            try process.run()
            process.waitUntilExit()
            let outputData = outputPipe.fileHandleForReading.readDataToEndOfFile()
            let output = String(data: outputData, encoding: .utf8) ?? ""

            guard process.terminationStatus == 0 else {
                try? FileManager.default.removeItem(at: temporaryOutputURL)
                throw ProxyError.ffmpegFailed(status: process.terminationStatus, output: output)
            }

            try? FileManager.default.removeItem(at: outputURL)
            try FileManager.default.moveItem(at: temporaryOutputURL, to: outputURL)
            return outputURL
        } catch {
            try? FileManager.default.removeItem(at: temporaryOutputURL)
            throw error
        }
    }

    private static func resolveExecutable(named name: String, envKey: String) -> URL? {
        let fileManager = FileManager.default
        let env = ProcessInfo.processInfo.environment

        if let configured = env[envKey], !configured.isEmpty, fileManager.isExecutableFile(atPath: configured) {
            return URL(fileURLWithPath: configured)
        }

        let pathEntries = (env["PATH"] ?? "")
            .split(separator: ":")
            .map(String.init)
        let candidatePaths = pathEntries + ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"]

        for directory in candidatePaths {
            let candidate = URL(fileURLWithPath: directory).appendingPathComponent(name).path
            if fileManager.isExecutableFile(atPath: candidate) {
                return URL(fileURLWithPath: candidate)
            }
        }

        return nil
    }
}
