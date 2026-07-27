import AVFoundation
import CoreMedia
import CryptoKit
import Foundation

#if os(macOS)
public enum CanonCardImportState: String, Codable, Equatable, Sendable {
    case inProgress = "in-progress"
    case finalized
    case failed
}

public enum CanonCardImportPhase: String, Codable, Equatable, Sendable {
    case preparing
    case copying
    case verifying
    case finalizing
}

public struct CanonCardImportProgress: Equatable, Sendable {
    public let phase: CanonCardImportPhase
    public let completedBytes: Int64
    public let totalBytes: Int64

    public init(
        phase: CanonCardImportPhase,
        completedBytes: Int64,
        totalBytes: Int64
    ) {
        self.phase = phase
        self.completedBytes = completedBytes
        self.totalBytes = totalBytes
    }

    public var fractionCompleted: Double {
        guard totalBytes > 0 else { return 0 }
        return min(1, max(0, Double(completedBytes) / Double(totalBytes)))
    }
}

public struct CanonCardMediaProbe: Codable, Equatable, Sendable {
    public let durationSeconds: Double
    public let width: Int
    public let height: Int
    public let nominalFrameRate: Double
    public let videoCodec: String
    public let videoTrackCount: Int
    public let audioTrackCount: Int
    public let timecodeTrackCount: Int
    public let audioSampleRate: Double?
    public let audioChannelCount: Int?

    public init(
        durationSeconds: Double,
        width: Int,
        height: Int,
        nominalFrameRate: Double,
        videoCodec: String,
        videoTrackCount: Int,
        audioTrackCount: Int,
        timecodeTrackCount: Int,
        audioSampleRate: Double?,
        audioChannelCount: Int?
    ) {
        self.durationSeconds = durationSeconds
        self.width = width
        self.height = height
        self.nominalFrameRate = nominalFrameRate
        self.videoCodec = videoCodec
        self.videoTrackCount = videoTrackCount
        self.audioTrackCount = audioTrackCount
        self.timecodeTrackCount = timecodeTrackCount
        self.audioSampleRate = audioSampleRate
        self.audioChannelCount = audioChannelCount
    }

    public var is4K: Bool {
        width >= 3_840 && height >= 2_160
    }
}

public struct CanonCardImportConfiguration: Equatable, Sendable {
    public let importID: UUID
    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let participantID: String
    public let roomBinding: ProductionCaptureRoomBinding?
    public let declaredCameraModel: String
    public let sourceURL: URL
    public let rootDirectory: URL

    public init(
        importID: UUID = UUID(),
        captureGroupID: UUID,
        episodeSpaceID: String,
        participantID: String,
        roomBinding: ProductionCaptureRoomBinding? = nil,
        declaredCameraModel: String = "Canon EOS R8",
        sourceURL: URL,
        rootDirectory: URL = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Movies/QuipslyCaptures", isDirectory: true)
    ) {
        self.importID = importID
        self.captureGroupID = captureGroupID
        self.episodeSpaceID = episodeSpaceID
        self.participantID = participantID
        self.roomBinding = roomBinding
        self.declaredCameraModel = declaredCameraModel
        self.sourceURL = sourceURL
        self.rootDirectory = rootDirectory
    }
}

public struct CanonCardImportReceipt: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let importID: UUID
    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let participantID: String
    public let roomBinding: ProductionCaptureRoomBinding?
    public let clientKind: String
    public let sourceKind: String
    public let state: CanonCardImportState
    public let declaredCameraModel: String
    public let sourceFileName: String
    public let sourcePath: String
    public let sourceVolumeIdentifier: String?
    public let sourceCreatedAt: Date?
    public let sourceModifiedAt: Date?
    public let sourceByteCount: Int64
    public let managedOriginalPath: String
    public let partialManagedOriginalPath: String?
    public let receiptPath: String
    public let sourceSHA256: String?
    public let managedOriginalSHA256: String?
    public let managedOriginalByteCount: Int64?
    public let byteIdentityVerified: Bool
    public let startedAt: Date
    public let stoppedAt: Date?
    public let startedMonotonicNanoseconds: UInt64
    public let stoppedMonotonicNanoseconds: UInt64?
    public let technicalProbe: CanonCardMediaProbe
    public let episodeAttachmentState: String
    public let alignmentState: String
    public let failure: String?
    public let truth: String

    public init(
        configuration: CanonCardImportConfiguration,
        state: CanonCardImportState,
        sourceVolumeIdentifier: String?,
        sourceCreatedAt: Date?,
        sourceModifiedAt: Date?,
        sourceByteCount: Int64,
        managedOriginalPath: String,
        partialManagedOriginalPath: String?,
        receiptPath: String,
        sourceSHA256: String?,
        managedOriginalSHA256: String?,
        managedOriginalByteCount: Int64?,
        byteIdentityVerified: Bool,
        startedAt: Date,
        stoppedAt: Date?,
        startedMonotonicNanoseconds: UInt64,
        stoppedMonotonicNanoseconds: UInt64?,
        technicalProbe: CanonCardMediaProbe,
        episodeAttachmentState: String,
        alignmentState: String,
        failure: String?
    ) {
        protocolVersion = 1
        importID = configuration.importID
        captureGroupID = configuration.captureGroupID
        episodeSpaceID = configuration.episodeSpaceID
        participantID = configuration.participantID
        roomBinding = configuration.roomBinding
        clientKind = "macos"
        sourceKind = "camera_card_original"
        self.state = state
        declaredCameraModel = configuration.declaredCameraModel
        sourceFileName = configuration.sourceURL.lastPathComponent
        sourcePath = configuration.sourceURL.path
        self.sourceVolumeIdentifier = sourceVolumeIdentifier
        self.sourceCreatedAt = sourceCreatedAt
        self.sourceModifiedAt = sourceModifiedAt
        self.sourceByteCount = sourceByteCount
        self.managedOriginalPath = managedOriginalPath
        self.partialManagedOriginalPath = partialManagedOriginalPath
        self.receiptPath = receiptPath
        self.sourceSHA256 = sourceSHA256
        self.managedOriginalSHA256 = managedOriginalSHA256
        self.managedOriginalByteCount = managedOriginalByteCount
        self.byteIdentityVerified = byteIdentityVerified
        self.startedAt = startedAt
        self.stoppedAt = stoppedAt
        self.startedMonotonicNanoseconds = startedMonotonicNanoseconds
        self.stoppedMonotonicNanoseconds = stoppedMonotonicNanoseconds
        self.technicalProbe = technicalProbe
        self.episodeAttachmentState = episodeAttachmentState
        self.alignmentState = alignmentState
        self.failure = failure

        if state == .finalized, byteIdentityVerified {
            let authority = roomBinding == nil
                ? "No immutable Episode Room authority was inherited, so this managed original remains local-only until an explicit reviewed binding exists."
                : "The source inherited the exact account, room, consent, capture group, and applied START receipt from a finalized local source in the same take."
            truth =
                "Quipsly copied the user-selected camera-card file into managed storage without modifying the card original, then independently hashed both byte streams and proved they match. \(authority) The camera model is user-declared; this receipt does not prove a camera body or serial number. Timeline alignment remains a separate reviewable decision."
        } else {
            truth =
                "This camera-card import is not a verified managed original. Preserve the source and any partial copy, then retry or review the failure; never attach it as a complete episode master."
        }
    }
}

public enum CanonCardImporterError: LocalizedError, Equatable {
    case sourceMissing
    case sourceNotRegularFile
    case sourceEmpty
    case unsupportedContainer(String)
    case noVideoTrack
    case invalidDuration
    case insufficientDestinationCapacity(required: Int64, available: Int64)
    case unableToCreatePartial
    case byteCountMismatch(expected: Int64, actual: Int64)
    case digestMismatch
    case roomBindingMismatch

    public var errorDescription: String? {
        switch self {
        case .sourceMissing:
            "The selected camera-card original is no longer reachable."
        case .sourceNotRegularFile:
            "Select a regular camera movie file, not a folder or device node."
        case .sourceEmpty:
            "The selected camera-card file is empty."
        case .unsupportedContainer(let ext):
            "The .\(ext.isEmpty ? "unknown" : ext) container is not in the supported camera-card import set (MP4, MOV, MXF)."
        case .noVideoTrack:
            "The selected file has no readable video track."
        case .invalidDuration:
            "The selected file does not report a finite positive duration."
        case .insufficientDestinationCapacity(let required, let available):
            "Managed capture storage needs \(required) bytes free, but only \(available) bytes are available."
        case .unableToCreatePartial:
            "Quipsly could not create the durable partial import file."
        case .byteCountMismatch(let expected, let actual):
            "The managed copy contains \(actual) bytes; the card source contains \(expected)."
        case .digestMismatch:
            "The managed copy digest does not match the card-source digest."
        case .roomBindingMismatch:
            "The supplied Episode Room authority does not match this camera file's capture group, episode, and participant."
        }
    }
}

public enum CanonCardImporter {
    public static let receiptFilename = "camera-card-import-receipt.json"
    public static let partialSuffix = ".quipsly-partial"
    private static let chunkSize = 8 * 1_024 * 1_024
    private static let minimumReserveBytes: Int64 = 512 * 1_024 * 1_024

    public static func importOriginal(
        configuration: CanonCardImportConfiguration,
        onProgress: @escaping @Sendable (CanonCardImportProgress) -> Void = { _ in }
    ) async throws -> CanonCardImportReceipt {
        if let binding = configuration.roomBinding,
           !binding.matchesSource(
               captureGroupID: configuration.captureGroupID,
               episodeSpaceID: configuration.episodeSpaceID,
               participantID: configuration.participantID
           ) {
            throw CanonCardImporterError.roomBindingMismatch
        }
        let probe = try await technicalProbe(at: configuration.sourceURL)
        return try await Task.detached(priority: .userInitiated) {
            try performImport(
                configuration: configuration,
                probe: probe,
                onProgress: onProgress
            )
        }.value
    }

    public static func importDirectory(
        root: URL,
        episodeSpaceID: String,
        importID: UUID
    ) -> URL {
        root
            .appendingPathComponent(
                ProductionAudioRecorder.safePathComponent(episodeSpaceID),
                isDirectory: true
            )
            .appendingPathComponent(importID.uuidString.lowercased(), isDirectory: true)
    }

    public static func technicalProbe(at url: URL) async throws -> CanonCardMediaProbe {
        let ext = url.pathExtension.lowercased()
        guard ["mp4", "mov", "mxf"].contains(ext) else {
            throw CanonCardImporterError.unsupportedContainer(ext)
        }

        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        guard duration.isFinite, duration > 0 else {
            throw CanonCardImporterError.invalidDuration
        }

        let videoTracks = try await asset.loadTracks(withMediaType: .video)
        guard let videoTrack = videoTracks.first else {
            throw CanonCardImporterError.noVideoTrack
        }
        let audioTracks = try await asset.loadTracks(withMediaType: .audio)
        let timecodeTracks = try await asset.loadTracks(withMediaType: .timecode)
        let naturalSize = try await videoTrack.load(.naturalSize)
        let transform = try await videoTrack.load(.preferredTransform)
        let presentationSize = naturalSize.applying(transform)
        let nominalFrameRate = try await videoTrack.load(.nominalFrameRate)
        let videoDescriptions = try await videoTrack.load(.formatDescriptions)
        let videoCodec = videoDescriptions.first
            .map { fourCC(CMFormatDescriptionGetMediaSubType($0)) }
            ?? "unknown"

        var audioSampleRate: Double?
        var audioChannelCount: Int?
        if let audioTrack = audioTracks.first {
            let descriptions = try await audioTrack.load(.formatDescriptions)
            if let description = descriptions.first,
               let basic = CMAudioFormatDescriptionGetStreamBasicDescription(
                   description
               ) {
                audioSampleRate = basic.pointee.mSampleRate
                audioChannelCount = Int(basic.pointee.mChannelsPerFrame)
            }
        }

        return CanonCardMediaProbe(
            durationSeconds: duration,
            width: Int(abs(presentationSize.width).rounded()),
            height: Int(abs(presentationSize.height).rounded()),
            nominalFrameRate: Double(nominalFrameRate),
            videoCodec: videoCodec,
            videoTrackCount: videoTracks.count,
            audioTrackCount: audioTracks.count,
            timecodeTrackCount: timecodeTracks.count,
            audioSampleRate: audioSampleRate,
            audioChannelCount: audioChannelCount
        )
    }

    private static func performImport(
        configuration: CanonCardImportConfiguration,
        probe: CanonCardMediaProbe,
        onProgress: @escaping @Sendable (CanonCardImportProgress) -> Void
    ) throws -> CanonCardImportReceipt {
        let fileManager = FileManager.default
        guard fileManager.fileExists(atPath: configuration.sourceURL.path) else {
            throw CanonCardImporterError.sourceMissing
        }
        let resourceKeys: Set<URLResourceKey> = [
            .isRegularFileKey,
            .fileSizeKey,
            .creationDateKey,
            .contentModificationDateKey,
            .volumeIdentifierKey,
        ]
        let values = try configuration.sourceURL.resourceValues(
            forKeys: resourceKeys
        )
        guard values.isRegularFile == true else {
            throw CanonCardImporterError.sourceNotRegularFile
        }
        let sourceByteCount = Int64(values.fileSize ?? 0)
        guard sourceByteCount > 0 else {
            throw CanonCardImporterError.sourceEmpty
        }

        try fileManager.createDirectory(
            at: configuration.rootDirectory,
            withIntermediateDirectories: true
        )
        let available = Int64(
            try configuration.rootDirectory.resourceValues(
                forKeys: [.volumeAvailableCapacityForImportantUsageKey]
            ).volumeAvailableCapacityForImportantUsage ?? 0
        )
        let required = sourceByteCount + minimumReserveBytes
        guard available >= required else {
            throw CanonCardImporterError.insufficientDestinationCapacity(
                required: required,
                available: available
            )
        }

        let directory = importDirectory(
            root: configuration.rootDirectory,
            episodeSpaceID: configuration.episodeSpaceID,
            importID: configuration.importID
        )
        try fileManager.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let managedURL = directory.appendingPathComponent(
            configuration.sourceURL.lastPathComponent
        )
        let partialURL = directory.appendingPathComponent(
            configuration.sourceURL.lastPathComponent + partialSuffix
        )
        let receiptURL = directory.appendingPathComponent(receiptFilename)
        let startedAt = Date()
        let startedMonotonic = DispatchTime.now().uptimeNanoseconds
        let sourceVolumeIdentifier = values.volumeIdentifier
            .map { String(describing: $0) }

        let initialReceipt = CanonCardImportReceipt(
            configuration: configuration,
            state: .inProgress,
            sourceVolumeIdentifier: sourceVolumeIdentifier,
            sourceCreatedAt: values.creationDate,
            sourceModifiedAt: values.contentModificationDate,
            sourceByteCount: sourceByteCount,
            managedOriginalPath: managedURL.path,
            partialManagedOriginalPath: partialURL.path,
            receiptPath: receiptURL.path,
            sourceSHA256: nil,
            managedOriginalSHA256: nil,
            managedOriginalByteCount: nil,
            byteIdentityVerified: false,
            startedAt: startedAt,
            stoppedAt: nil,
            startedMonotonicNanoseconds: startedMonotonic,
            stoppedMonotonicNanoseconds: nil,
            technicalProbe: probe,
            episodeAttachmentState: "not-attached",
            alignmentState: "not-aligned",
            failure: nil
        )
        try writeReceipt(initialReceipt, to: receiptURL)
        onProgress(
            CanonCardImportProgress(
                phase: .preparing,
                completedBytes: 0,
                totalBytes: sourceByteCount
            )
        )

        var copiedBytes: Int64 = 0
        var sourceDigest: String?
        var managedDigest: String?
        do {
            if fileManager.fileExists(atPath: partialURL.path) {
                try fileManager.removeItem(at: partialURL)
            }
            guard fileManager.createFile(atPath: partialURL.path, contents: nil) else {
                throw CanonCardImporterError.unableToCreatePartial
            }

            let result = try copyAndHash(
                source: configuration.sourceURL,
                destination: partialURL,
                totalBytes: sourceByteCount,
                onProgress: onProgress
            )
            copiedBytes = result.byteCount
            sourceDigest = result.sha256
            guard copiedBytes == sourceByteCount else {
                throw CanonCardImporterError.byteCountMismatch(
                    expected: sourceByteCount,
                    actual: copiedBytes
                )
            }

            onProgress(
                CanonCardImportProgress(
                    phase: .verifying,
                    completedBytes: 0,
                    totalBytes: sourceByteCount
                )
            )
            let verification = try hash(
                url: partialURL,
                totalBytes: sourceByteCount,
                phase: .verifying,
                onProgress: onProgress
            )
            managedDigest = verification.sha256
            guard verification.byteCount == sourceByteCount else {
                throw CanonCardImporterError.byteCountMismatch(
                    expected: sourceByteCount,
                    actual: verification.byteCount
                )
            }
            guard sourceDigest == managedDigest else {
                throw CanonCardImporterError.digestMismatch
            }

            onProgress(
                CanonCardImportProgress(
                    phase: .finalizing,
                    completedBytes: sourceByteCount,
                    totalBytes: sourceByteCount
                )
            )
            try fileManager.moveItem(at: partialURL, to: managedURL)
            let finalized = CanonCardImportReceipt(
                configuration: configuration,
                state: .finalized,
                sourceVolumeIdentifier: sourceVolumeIdentifier,
                sourceCreatedAt: values.creationDate,
                sourceModifiedAt: values.contentModificationDate,
                sourceByteCount: sourceByteCount,
                managedOriginalPath: managedURL.path,
                partialManagedOriginalPath: nil,
                receiptPath: receiptURL.path,
                sourceSHA256: sourceDigest,
                managedOriginalSHA256: managedDigest,
                managedOriginalByteCount: copiedBytes,
                byteIdentityVerified: true,
                startedAt: startedAt,
                stoppedAt: Date(),
                startedMonotonicNanoseconds: startedMonotonic,
                stoppedMonotonicNanoseconds: DispatchTime.now().uptimeNanoseconds,
                technicalProbe: probe,
                episodeAttachmentState: "ready-for-local-editor-attachment",
                alignmentState: "needs-alignment",
                failure: nil
            )
            try writeReceipt(finalized, to: receiptURL)
            return finalized
        } catch {
            let failed = CanonCardImportReceipt(
                configuration: configuration,
                state: .failed,
                sourceVolumeIdentifier: sourceVolumeIdentifier,
                sourceCreatedAt: values.creationDate,
                sourceModifiedAt: values.contentModificationDate,
                sourceByteCount: sourceByteCount,
                managedOriginalPath: managedURL.path,
                partialManagedOriginalPath: fileManager.fileExists(
                    atPath: partialURL.path
                ) ? partialURL.path : nil,
                receiptPath: receiptURL.path,
                sourceSHA256: sourceDigest,
                managedOriginalSHA256: managedDigest,
                managedOriginalByteCount: copiedBytes,
                byteIdentityVerified: false,
                startedAt: startedAt,
                stoppedAt: Date(),
                startedMonotonicNanoseconds: startedMonotonic,
                stoppedMonotonicNanoseconds: DispatchTime.now().uptimeNanoseconds,
                technicalProbe: probe,
                episodeAttachmentState: "not-attached",
                alignmentState: "not-aligned",
                failure: error.localizedDescription
            )
            try? writeReceipt(failed, to: receiptURL)
            throw error
        }
    }

    private static func copyAndHash(
        source: URL,
        destination: URL,
        totalBytes: Int64,
        onProgress: @escaping @Sendable (CanonCardImportProgress) -> Void
    ) throws -> (byteCount: Int64, sha256: String) {
        let sourceHandle = try FileHandle(forReadingFrom: source)
        let destinationHandle = try FileHandle(forWritingTo: destination)
        defer {
            try? sourceHandle.close()
            try? destinationHandle.close()
        }

        var hasher = SHA256()
        var copied: Int64 = 0
        while true {
            try Task.checkCancellation()
            guard let data = try sourceHandle.read(upToCount: chunkSize),
                  !data.isEmpty else {
                break
            }
            try destinationHandle.write(contentsOf: data)
            hasher.update(data: data)
            copied += Int64(data.count)
            onProgress(
                CanonCardImportProgress(
                    phase: .copying,
                    completedBytes: copied,
                    totalBytes: totalBytes
                )
            )
        }
        try destinationHandle.synchronize()
        return (copied, hasher.finalize().hexString)
    }

    private static func hash(
        url: URL,
        totalBytes: Int64,
        phase: CanonCardImportPhase,
        onProgress: @escaping @Sendable (CanonCardImportProgress) -> Void
    ) throws -> (byteCount: Int64, sha256: String) {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        var processed: Int64 = 0
        while true {
            try Task.checkCancellation()
            guard let data = try handle.read(upToCount: chunkSize),
                  !data.isEmpty else {
                break
            }
            hasher.update(data: data)
            processed += Int64(data.count)
            onProgress(
                CanonCardImportProgress(
                    phase: phase,
                    completedBytes: processed,
                    totalBytes: totalBytes
                )
            )
        }
        return (processed, hasher.finalize().hexString)
    }

    private static func writeReceipt(
        _ receipt: CanonCardImportReceipt,
        to url: URL
    ) throws {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom(
            ProductionCaptureDateCoding.encode
        )
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(receipt).write(to: url, options: [.atomic])
    }

    private static func fourCC(_ value: FourCharCode) -> String {
        let bytes: [UInt8] = [
            UInt8((value >> 24) & 0xff),
            UInt8((value >> 16) & 0xff),
            UInt8((value >> 8) & 0xff),
            UInt8(value & 0xff),
        ]
        return String(bytes: bytes, encoding: .ascii)?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            ?? String(format: "0x%08x", value)
    }
}

private extension SHA256.Digest {
    var hexString: String {
        map { String(format: "%02x", $0) }.joined()
    }
}
#endif
