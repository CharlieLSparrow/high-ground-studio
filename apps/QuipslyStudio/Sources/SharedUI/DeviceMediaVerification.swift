import AVFoundation
import CryptoKit
import Foundation

#if os(macOS)
struct DeviceMediaVerificationCandidate: Decodable, Identifiable, Sendable {
    let libraryId: String
    let deviceId: String
    let folderGrantId: String
    let sourceUnitId: String
    let externalFileId: String
    let externalReferenceId: String
    let sourceRevisionId: String
    let observedRevisionKey: String
    let expectedSizeBytes: String
    let fileName: String
    let captureKey: String
    let capturedAt: String
    let memberRole: String
    let channel: String?
    let exactBytesVerified: Bool

    var id: String { sourceRevisionId }
}

struct DeviceMediaVerificationReceipt: Encodable, Sendable {
    struct Technical: Encodable, Sendable {
        let durationSeconds: Double?
        let widthPixels: Int?
        let heightPixels: Int?
        let framesPerSecond: Double?
    }

    struct Worker: Encodable, Sendable {
        let executionId: String
        let buildId: String
    }

    let schema = "quipsly-device-media-verification-receipt-v1"
    let libraryId: String
    let deviceId: String
    let folderGrantId: String
    let externalFileId: String
    let externalReferenceId: String
    let sourceRevisionId: String
    let observedRevisionKey: String
    let expectedSizeBytes: String
    let contentSha256: String
    let completedAt: String
    let technical: Technical
    let worker: Worker
}

enum DeviceMediaVerification {
    private static let bufferSize = 4 * 1_024 * 1_024

    static func verify(
        candidate: DeviceMediaVerificationCandidate,
        sourceRoot: URL,
        relativeLocator: String,
        progress: @escaping @Sendable (Int64, Int64) -> Void
    ) async throws -> DeviceMediaVerificationReceipt {
        let expectedSize = try positiveByteCount(candidate.expectedSizeBytes)
        let sourceURL = try authorizedSourceURL(
            root: sourceRoot,
            relativeLocator: relativeLocator
        )
        let before = try sourceSnapshot(sourceURL)
        guard before.size == expectedSize else {
            throw verificationError(
                10,
                "The source size changed after Nest planned verification. Follow the folder again before retrying."
            )
        }
        let source = try FileHandle(forReadingFrom: sourceURL)
        defer { try? source.close() }
        var hasher = SHA256()
        var read: Int64 = 0
        while true {
            try Task.checkCancellation()
            guard let data = try source.read(upToCount: bufferSize),
                  !data.isEmpty else { break }
            read += Int64(data.count)
            guard read <= expectedSize else {
                throw verificationError(11, "The source grew while it was being verified.")
            }
            hasher.update(data: data)
            progress(read, expectedSize)
        }
        guard read == expectedSize else {
            throw verificationError(12, "The source ended before its observed byte count.")
        }
        let after = try sourceSnapshot(sourceURL)
        guard before == after else {
            throw verificationError(
                13,
                "The source changed while Quipsly read it. No checksum was registered."
            )
        }
        let technical = await technicalMetadata(for: sourceURL)
        return DeviceMediaVerificationReceipt(
            libraryId: candidate.libraryId,
            deviceId: candidate.deviceId,
            folderGrantId: candidate.folderGrantId,
            externalFileId: candidate.externalFileId,
            externalReferenceId: candidate.externalReferenceId,
            sourceRevisionId: candidate.sourceRevisionId,
            observedRevisionKey: candidate.observedRevisionKey,
            expectedSizeBytes: candidate.expectedSizeBytes,
            contentSha256: hasher.finalize()
                .map { String(format: "%02x", $0) }
                .joined(),
            completedAt: ISO8601DateFormatter().string(from: Date()),
            technical: technical,
            worker: .init(
                executionId: "device-verify:\(UUID().uuidString.lowercased())",
                buildId: Bundle.main.object(
                    forInfoDictionaryKey: "CFBundleVersion"
                ) as? String ?? "local-development"
            )
        )
    }

    private static func technicalMetadata(
        for sourceURL: URL
    ) async -> DeviceMediaVerificationReceipt.Technical {
        let asset = AVURLAsset(url: sourceURL)
        let duration: Double? = if let time = try? await asset.load(.duration) {
            finitePositive(CMTimeGetSeconds(time))
        } else {
            nil
        }
        guard let track = try? await asset.loadTracks(withMediaType: .video).first else {
            return .init(
                durationSeconds: duration,
                widthPixels: nil,
                heightPixels: nil,
                framesPerSecond: nil
            )
        }
        let naturalSize = try? await track.load(.naturalSize)
        let transform = try? await track.load(.preferredTransform)
        let presentedSize = naturalSize.map { size in
            transform.map { size.applying($0) } ?? size
        }
        let fps = try? await track.load(.nominalFrameRate)
        return .init(
            durationSeconds: duration,
            widthPixels: presentedSize.map { Int(abs($0.width.rounded())) }.flatMap(positive),
            heightPixels: presentedSize.map { Int(abs($0.height.rounded())) }.flatMap(positive),
            framesPerSecond: fps.flatMap { finitePositive(Double($0)) }
        )
    }

    private static func finitePositive(_ value: Double) -> Double? {
        value.isFinite && value > 0 ? value : nil
    }

    private static func positive(_ value: Int) -> Int? {
        value > 0 ? value : nil
    }

    private static func authorizedSourceURL(
        root: URL,
        relativeLocator: String
    ) throws -> URL {
        guard isSafeRelativePath(relativeLocator) else {
            throw verificationError(14, "The private folder ledger contains an unsafe source locator.")
        }
        let resolvedRoot = root.standardizedFileURL.resolvingSymlinksInPath()
        let source = resolvedRoot
            .appendingPathComponent(relativeLocator)
            .standardizedFileURL
            .resolvingSymlinksInPath()
        guard source.path.hasPrefix(resolvedRoot.path + "/") else {
            throw verificationError(15, "The selected source escaped the granted folder.")
        }
        return source
    }

    private static func isSafeRelativePath(_ value: String) -> Bool {
        !value.isEmpty &&
            !value.hasPrefix("/") &&
            !value.contains("\0") &&
            !value.split(separator: "/", omittingEmptySubsequences: false)
                .contains(where: { $0.isEmpty || $0 == "." || $0 == ".." })
    }

    private struct Snapshot: Equatable {
        let size: Int64
        let modifiedAt: Date
    }

    private static func sourceSnapshot(_ url: URL) throws -> Snapshot {
        let values = try url.resourceValues(forKeys: [
            .isRegularFileKey,
            .isSymbolicLinkKey,
            .fileSizeKey,
            .contentModificationDateKey,
        ])
        guard values.isRegularFile == true,
              values.isSymbolicLink != true,
              let size = values.fileSize,
              let modifiedAt = values.contentModificationDate else {
            throw verificationError(16, "The source is no longer a readable regular file.")
        }
        return Snapshot(size: Int64(size), modifiedAt: modifiedAt)
    }

    private static func positiveByteCount(_ value: String) throws -> Int64 {
        guard let parsed = Int64(value), parsed > 0 else {
            throw verificationError(17, "The verification plan has an invalid byte count.")
        }
        return parsed
    }

    private static func verificationError(_ code: Int, _ message: String) -> NSError {
        NSError(
            domain: "QuipslyDeviceMediaVerification",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}
#endif
