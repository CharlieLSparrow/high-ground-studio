import AVFoundation
import AVKit
import Combine
import CryptoKit
import Foundation
import SwiftUI

private struct CaptureSessionPlaybackReceipt: Codable {
    let schemaVersion: Int
    let ownerDigest: String
    let recordingAssetID: String
    let sourceID: String
    let playbackPath: String
    let sha256: String
    let byteCount: Int64
    let fileName: String
    let downloadedAt: Date
}

@MainActor
final class CaptureSessionProtectedPlaybackController: ObservableObject {
    @Published private(set) var preparedSourceID: String?
    @Published private(set) var player: AVPlayer?
    @Published private(set) var isPreparing = false
    @Published private(set) var isPlaying = false
    @Published private(set) var position: TimeInterval = 0
    @Published private(set) var duration: TimeInterval = 0
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?

    private struct SourceBinding {
        let recordingAssetID: String
        let sourceID: String
        let playbackPath: String
        let sha256: String
        let byteCount: Int64
        let fileName: String
        let isVideo: Bool
    }

    private struct CacheLocations {
        let directory: URL
        let media: URL
        let receipt: URL
    }

    private let baseURL: URL
    private let audioSession = CaptureAudioSessionCoordinator.shared
    private var boundSource: SourceBinding?
    private var timeObserver: Any?
    private var completionObserver: NSObjectProtocol?
    private var accountCancellable: AnyCancellable?

    init() {
        let rawBaseURL = normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL")
                as? String
                ?? "https://nest.quipsly.com"
        )
        baseURL = URL(string: rawBaseURL)
            ?? URL(string: "https://nest.quipsly.com")!
        accountCancellable = NotificationCenter.default.publisher(
            for: .quipslyCaptureAccountIdentityDidChange
        ).sink { [weak self] _ in
            Task { @MainActor in self?.close() }
        }
    }

    func restoreIfAvailable(source: MobileCaptureSourceSummary) {
        guard !isPreparing,
              let binding = binding(for: source),
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              let locations = cacheLocations(binding: binding, owner: owner) else {
            clearPreparedState()
            return
        }
        guard let receiptData = try? Data(contentsOf: locations.receipt),
              let receipt = try? Self.receiptDecoder.decode(
                  CaptureSessionPlaybackReceipt.self,
                  from: receiptData
              ),
              receipt.schemaVersion == 1,
              receipt.ownerDigest == Self.digest(owner.ownerAccountID),
              receipt.recordingAssetID == binding.recordingAssetID,
              receipt.sourceID == binding.sourceID,
              receipt.playbackPath == binding.playbackPath,
              receipt.sha256 == binding.sha256,
              receipt.byteCount == binding.byteCount,
              receipt.fileName == locations.media.lastPathComponent,
              FileManager.default.fileExists(atPath: locations.media.path),
              let attributes = try? FileManager.default.attributesOfItem(
                  atPath: locations.media.path
              ),
              (attributes[.size] as? NSNumber)?.int64Value == binding.byteCount,
              Date().timeIntervalSince(receipt.downloadedAt) >= -300,
              Date().timeIntervalSince(receipt.downloadedAt) <= 30 * 24 * 60 * 60,
              AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
            try? FileManager.default.removeItem(at: locations.directory)
            clearPreparedState()
            return
        }
        configurePlayer(fileURL: locations.media, binding: binding)
        statusMessage = "Protected copy ready on this iPhone"
        errorMessage = nil
    }

    func prepare(source: MobileCaptureSourceSummary) async {
        guard !isPreparing,
              let binding = binding(for: source),
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              let playbackURL = playbackURL(binding: binding),
              let locations = cacheLocations(binding: binding, owner: owner) else {
            errorMessage = "This verified Session source is not ready for protected iPhone playback."
            return
        }
        restoreIfAvailable(source: source)
        if preparedSourceID == binding.recordingAssetID { return }
        guard AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Connect to Nest once to prepare this recording on the iPhone."
            return
        }
        guard hasCapacity(for: binding.byteCount, at: locations.directory) else {
            errorMessage = "This iPhone needs more free space before it can protect the exact recording."
            return
        }

        isPreparing = true
        errorMessage = nil
        statusMessage = "Preparing the exact verified source…"
        defer { isPreparing = false }
        do {
            var request = URLRequest(url: playbackURL)
            request.httpMethod = "GET"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/octet-stream", forHTTPHeaderField: "Accept")
            let (temporaryURL, response) = try await AuthManager.shared
                .authenticatedDownload(
                    for: request,
                    expectedOwnerAccountID: owner.ownerAccountID
                )
            defer { try? FileManager.default.removeItem(at: temporaryURL) }
            try validateResponse(response, binding: binding)
            guard AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
                throw Self.error(
                    "The Quipsly account changed before playback preparation finished.",
                    code: 401
                )
            }
            let verification = try Self.hashAndByteCount(at: temporaryURL)
            guard verification.byteCount == binding.byteCount,
                  verification.sha256 == binding.sha256 else {
                throw Self.error(
                    "The downloaded recording did not match its exact server receipt and was removed.",
                    code: 409
                )
            }
            try preserve(
                temporaryURL: temporaryURL,
                locations: locations,
                binding: binding,
                owner: owner
            )
            guard AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
                try? FileManager.default.removeItem(at: locations.directory)
                throw Self.error(
                    "The Quipsly account changed before the protected copy could be opened.",
                    code: 401
                )
            }
            configurePlayer(fileURL: locations.media, binding: binding)
            statusMessage = "Exact source ready · \(Self.fileSize(binding.byteCount))"
        } catch {
            clearPreparedState()
            errorMessage = error.localizedDescription
            statusMessage = nil
        }
    }

    /// Reuses the verified Session cache for transcript review. The caller gets
    /// only the account-bound file that passed the same receipt, byte-count,
    /// and SHA-256 checks as the ordinary protected playback sheet.
    func prepareTranscriptReviewFile(
        source: MobileCaptureSourceSummary
    ) async -> URL? {
        await prepare(source: source)
        guard preparedSourceID == source.recordingAssetId,
              let binding = binding(for: source),
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              let locations = cacheLocations(binding: binding, owner: owner),
              FileManager.default.fileExists(atPath: locations.media.path),
              AuthManager.shared.matchesStableOwnerSnapshot(owner) else {
            return nil
        }
        close()
        return locations.media
    }

    func togglePlayback() {
        guard let player, preparedSourceID != nil else {
            errorMessage = "Prepare the exact recording before playback."
            return
        }
        if isPlaying {
            player.pause()
            isPlaying = false
            audioSession.endLocalPlayback()
            return
        }
        do {
            try audioSession.beginLocalPlayback()
            if duration > 0, position >= duration - 0.05 {
                seek(to: 0)
            }
            player.play()
            isPlaying = true
            errorMessage = nil
        } catch {
            isPlaying = false
            errorMessage = error.localizedDescription
        }
    }

    func seek(to requestedSeconds: TimeInterval) {
        guard let player else { return }
        let bounded = min(max(requestedSeconds.isFinite ? requestedSeconds : 0, 0), max(duration, 0))
        player.seek(
            to: CMTime(seconds: bounded, preferredTimescale: 600),
            toleranceBefore: .zero,
            toleranceAfter: .zero
        )
        position = bounded
    }

    func remove(source: MobileCaptureSourceSummary) {
        guard let binding = binding(for: source),
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              let locations = cacheLocations(binding: binding, owner: owner) else {
            return
        }
        close()
        try? FileManager.default.removeItem(at: locations.directory)
        statusMessage = "Protected iPhone copy removed. The retained server source is unchanged."
    }

    func close() {
        player?.pause()
        if let timeObserver, let player {
            player.removeTimeObserver(timeObserver)
        }
        timeObserver = nil
        if let completionObserver {
            NotificationCenter.default.removeObserver(completionObserver)
        }
        completionObserver = nil
        player = nil
        boundSource = nil
        preparedSourceID = nil
        isPlaying = false
        position = 0
        duration = 0
        audioSession.endLocalPlayback()
    }

    static func clearProtectedCache() {
        guard let root = protectedCacheRoot else { return }
        try? FileManager.default.removeItem(at: root)
    }

    private func configurePlayer(fileURL: URL, binding: SourceBinding) {
        close()
        boundSource = binding
        preparedSourceID = binding.recordingAssetID
        let player = AVPlayer(url: fileURL)
        player.actionAtItemEnd = .pause
        self.player = player
        duration = 0
        position = 0
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: CMTime(seconds: 0.25, preferredTimescale: 600),
            queue: .main
        ) { [weak self, weak player] time in
            MainActor.assumeIsolated {
                guard let self else { return }
                let seconds = time.seconds
                if seconds.isFinite { self.position = max(seconds, 0) }
                let itemDuration = player?.currentItem?.duration.seconds ?? 0
                if itemDuration.isFinite, itemDuration > 0 {
                    self.duration = itemDuration
                }
            }
        }
        if let item = player.currentItem {
            completionObserver = NotificationCenter.default.addObserver(
                forName: .AVPlayerItemDidPlayToEndTime,
                object: item,
                queue: .main
            ) { [weak self] _ in
                MainActor.assumeIsolated {
                    self?.isPlaying = false
                    self?.audioSession.endLocalPlayback()
                }
            }
        }
    }

    private func clearPreparedState() {
        close()
        errorMessage = nil
        statusMessage = nil
    }

    private func binding(for source: MobileCaptureSourceSummary) -> SourceBinding? {
        guard source.protectedPlaybackReady,
              let path = source.sessionPlaybackUrl?
                .trimmingCharacters(in: .whitespacesAndNewlines),
              path.hasSuffix(
                "/recordings/\(source.recordingAssetId)/media"
              ),
              let sha256 = source.sha256?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              sha256.range(of: #"^[0-9a-f]{64}$"#, options: .regularExpression) != nil,
              let rawBytes = source.byteSize,
              let byteCount = Int64(rawBytes),
              byteCount > 0 else { return nil }
        let trimmedFileName = source.fileName?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let fileName = trimmedFileName.isEmpty ? "session-source" : trimmedFileName
        return SourceBinding(
            recordingAssetID: source.recordingAssetId,
            sourceID: source.recordingAssetId,
            playbackPath: path,
            sha256: sha256,
            byteCount: byteCount,
            fileName: fileName,
            isVideo: source.isVideoSource
        )
    }

    private func playbackURL(binding: SourceBinding) -> URL? {
        guard let url = URL(string: binding.playbackPath, relativeTo: baseURL)?.absoluteURL,
              sameOrigin(url, baseURL),
              url.path == binding.playbackPath,
              url.user == nil,
              url.password == nil,
              url.query == nil,
              url.fragment == nil else { return nil }
        return url
    }

    private func validateResponse(
        _ response: HTTPURLResponse,
        binding: SourceBinding
    ) throws {
        guard response.statusCode == 200 else {
            throw Self.error(
                "The protected recording returned HTTP \(response.statusCode).",
                code: response.statusCode
            )
        }
        guard let finalURL = response.url,
              sameOrigin(finalURL, baseURL),
              finalURL.path == binding.playbackPath,
              finalURL.query == nil,
              finalURL.fragment == nil else {
            throw Self.error(
                "The protected recording response left the configured Nest origin.",
                code: 502
            )
        }
        if response.expectedContentLength > 0,
           response.expectedContentLength != binding.byteCount {
            throw Self.error(
                "The protected response size no longer matches the recording receipt.",
                code: 409
            )
        }
    }

    private func preserve(
        temporaryURL: URL,
        locations: CacheLocations,
        binding: SourceBinding,
        owner: AuthManager.StableOwnerSnapshot
    ) throws {
        try FileManager.default.createDirectory(
            at: locations.directory,
            withIntermediateDirectories: true,
            attributes: [
                .protectionKey:
                    FileProtectionType.completeUntilFirstUserAuthentication
            ]
        )
        try? FileManager.default.removeItem(at: locations.media)
        try? FileManager.default.removeItem(at: locations.receipt)
        try FileManager.default.moveItem(at: temporaryURL, to: locations.media)
        try FileManager.default.setAttributes(
            [
                .protectionKey:
                    FileProtectionType.completeUntilFirstUserAuthentication
            ],
            ofItemAtPath: locations.media.path
        )
        let receipt = CaptureSessionPlaybackReceipt(
            schemaVersion: 1,
            ownerDigest: Self.digest(owner.ownerAccountID),
            recordingAssetID: binding.recordingAssetID,
            sourceID: binding.sourceID,
            playbackPath: binding.playbackPath,
            sha256: binding.sha256,
            byteCount: binding.byteCount,
            fileName: locations.media.lastPathComponent,
            downloadedAt: Date()
        )
        try Self.receiptEncoder.encode(receipt).write(
            to: locations.receipt,
            options: [
                .atomic,
                .completeFileProtectionUntilFirstUserAuthentication,
            ]
        )
        for target in [locations.directory, locations.media, locations.receipt] {
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableTarget = target
            try mutableTarget.setResourceValues(values)
        }
    }

    private func cacheLocations(
        binding: SourceBinding,
        owner: AuthManager.StableOwnerSnapshot
    ) -> CacheLocations? {
        guard let root = Self.protectedCacheRoot else { return nil }
        let directory = root
            .appendingPathComponent(Self.digest(owner.ownerAccountID), isDirectory: true)
            .appendingPathComponent(Self.digest(binding.recordingAssetID), isDirectory: true)
        let fileExtension = Self.safeExtension(
            fileName: binding.fileName,
            isVideo: binding.isVideo
        )
        return CacheLocations(
            directory: directory,
            media: directory.appendingPathComponent("source.\(fileExtension)"),
            receipt: directory.appendingPathComponent("receipt.json")
        )
    }

    private func hasCapacity(for bytes: Int64, at location: URL) -> Bool {
        let parent = location.deletingLastPathComponent()
        let available = try? parent.resourceValues(
            forKeys: [.volumeAvailableCapacityForImportantUsageKey]
        ).volumeAvailableCapacityForImportantUsage
        guard let available else { return true }
        return available > bytes + 512 * 1_024 * 1_024
    }

    private func sameOrigin(_ left: URL, _ right: URL) -> Bool {
        left.scheme?.lowercased() == right.scheme?.lowercased()
            && left.host?.lowercased() == right.host?.lowercased()
            && left.port == right.port
    }

    nonisolated private static var protectedCacheRoot: URL? {
        FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first?
            .appendingPathComponent(
                "QuipslyCapture/SessionPlayback",
                isDirectory: true
            )
    }

    nonisolated private static var receiptEncoder: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    nonisolated private static var receiptDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    nonisolated private static func safeExtension(
        fileName: String,
        isVideo: Bool
    ) -> String {
        let candidate = URL(fileURLWithPath: fileName).pathExtension.lowercased()
        let allowed = [
            "aac", "m4a", "mp3", "ogg", "wav", "webm",
            "m4v", "mov", "mp4",
        ]
        return allowed.contains(candidate) ? candidate : (isVideo ? "mp4" : "m4a")
    }

    nonisolated private static func hashAndByteCount(
        at url: URL
    ) throws -> (sha256: String, byteCount: Int64) {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        var byteCount: Int64 = 0
        while let data = try handle.read(upToCount: 1_024 * 1_024), !data.isEmpty {
            hasher.update(data: data)
            byteCount += Int64(data.count)
        }
        return (
            hasher.finalize().map { String(format: "%02x", $0) }.joined(),
            byteCount
        )
    }

    nonisolated private static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    nonisolated private static func fileSize(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }

    nonisolated private static func error(_ message: String, code: Int) -> NSError {
        NSError(
            domain: "CaptureSessionProtectedPlayback",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

struct CaptureSessionProtectedPlaybackSheet: View {
    let source: MobileCaptureSourceSummary
    @ObservedObject var controller: CaptureSessionProtectedPlaybackController
    let previewOnly: Bool
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 5) {
                        Label(
                            source.isVideoSource ? "Protected video" : "Protected audio",
                            systemImage: source.isVideoSource ? "video.fill" : "waveform"
                        )
                        .font(.title2.weight(.bold))
                        Text(sourceTitle)
                            .font(.subheadline.weight(.semibold))
                        Text(sourcePlaybackSummary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if controller.preparedSourceID == source.recordingAssetId,
                       let player = controller.player {
                        if source.isVideoSource {
                            VideoPlayer(player: player)
                                .aspectRatio(16 / 9, contentMode: .fit)
                                .clipShape(RoundedRectangle(cornerRadius: 16))
                        } else {
                            Image(systemName: "waveform.circle.fill")
                                .resizable()
                                .scaledToFit()
                                .frame(maxWidth: .infinity, minHeight: 120, maxHeight: 180)
                                .foregroundStyle(.tint)
                                .accessibilityHidden(true)
                        }

                        Slider(
                            value: Binding(
                                get: { controller.position },
                                set: { controller.seek(to: $0) }
                            ),
                            in: 0 ... max(controller.duration, 0.1)
                        )
                        .accessibilityLabel("Recording position")

                        HStack {
                            Text(clock(controller.position))
                            Spacer()
                            Text(clock(controller.duration))
                        }
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)

                        Button {
                            controller.togglePlayback()
                        } label: {
                            Label(
                                controller.isPlaying ? "Pause" : "Play",
                                systemImage: controller.isPlaying ? "pause.fill" : "play.fill"
                            )
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("CaptureSessionProtectedPlaybackToggle")

                        Button("Remove protected copy from this iPhone", role: .destructive) {
                            controller.remove(source: source)
                        }
                        .font(.caption.weight(.semibold))
                    } else {
                        Button {
                            Task { await controller.prepare(source: source) }
                        } label: {
                            if controller.isPreparing {
                                ProgressView()
                                    .frame(maxWidth: .infinity)
                            } else {
                                Label(
                                    "Prepare \(sourcePlaybackSize)",
                                    systemImage: "arrow.down.circle.fill"
                                )
                                .frame(maxWidth: .infinity)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(controller.isPreparing || previewOnly)
                        .accessibilityIdentifier("CaptureSessionProtectedPlaybackPrepare")
                    }

                    if previewOnly {
                        Text("Preview only · no recording is downloaded")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                    }

                    if let status = controller.statusMessage {
                        Label(status, systemImage: "checkmark.shield.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.green)
                    }
                    if let error = controller.errorMessage {
                        Label(error, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                    }

                    Text("Quipsly verifies the downloaded bytes against the retained source receipt. Playback never changes or replaces the original.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding()
            }
            .navigationTitle("Review recording")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") {
                        controller.close()
                        dismiss()
                    }
                }
            }
        }
        .onAppear { controller.restoreIfAvailable(source: source) }
        .onDisappear { controller.close() }
    }

    private var sourcePlaybackSize: String {
        guard let raw = source.byteSize, let bytes = Int64(raw), bytes > 0 else {
            return "recording"
        }
        return Self.fileSize(bytes)
    }

    private var sourceTitle: String {
        let value = source.fileName?
            .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return value.isEmpty ? "Session recording" : value
    }

    private var sourcePlaybackSummary: String {
        let duration = source.durationSeconds.map(clock) ?? "Duration unavailable"
        return "\(sourcePlaybackSize) · \(duration) · exact source"
    }

    private func clock(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite, seconds >= 0 else { return "0:00" }
        let total = Int(seconds.rounded(.down))
        let hours = total / 3_600
        let minutes = (total % 3_600) / 60
        let remainder = total % 60
        return hours > 0
            ? String(format: "%d:%02d:%02d", hours, minutes, remainder)
            : String(format: "%d:%02d", minutes, remainder)
    }

    nonisolated private static func fileSize(_ bytes: Int64) -> String {
        ByteCountFormatter.string(fromByteCount: bytes, countStyle: .file)
    }
}
