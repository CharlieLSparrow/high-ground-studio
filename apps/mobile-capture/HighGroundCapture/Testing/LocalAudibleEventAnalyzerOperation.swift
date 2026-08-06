import AVFAudio
import Foundation

@main
struct LocalAudibleEventAnalyzerOperation {
    static func main() async throws {
        guard CommandLine.arguments.count == 2 else {
            fputs("Usage: LocalAudibleEventAnalyzerOperation /absolute/path/to/audio\n", stderr)
            exit(64)
        }
        let fileURL = URL(fileURLWithPath: CommandLine.arguments[1])
            .standardizedFileURL
        let values = try fileURL.resourceValues(forKeys: [
            .isRegularFileKey,
            .fileSizeKey,
        ])
        guard values.isRegularFile == true else {
            fputs("The input must be one regular local audio file.\n", stderr)
            exit(65)
        }
        let audioFile = try AVAudioFile(forReading: fileURL)
        let sampleRate = audioFile.processingFormat.sampleRate
        guard sampleRate.isFinite, sampleRate > 0, audioFile.length > 0 else {
            fputs("The input must contain a positive decoded audio duration.\n", stderr)
            exit(65)
        }
        let durationSeconds = Double(audioFile.length) / sampleRate
        let started = ContinuousClock.now
        let receipt = await LocalAudibleEventAnalyzer.analyze(
            fileURL: fileURL,
            durationSeconds: durationSeconds,
            sourceByteCount: Int64(values.fileSize ?? 0),
            supersedesAnalysisId: nil
        )
        let elapsed = started.duration(to: .now)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        let data = try encoder.encode(receipt)
        guard let json = String(data: data, encoding: .utf8) else {
            exit(70)
        }
        fputs(
            "Analyzed \(String(format: "%.3f", durationSeconds)) source seconds in \(elapsed). Original bytes were read only.\n",
            stderr
        )
        print(json)
    }
}
