import CryptoKit
import Darwin
import Foundation

#if os(macOS)
struct DeviceMediaPreparationCandidate: Decodable, Identifiable {
    let libraryId: String
    let deviceId: String
    let folderGrantId: String
    let custodianNodeId: String
    let storageScopeId: String
    let externalFileId: String
    let externalReferenceId: String
    let sourceRevisionId: String
    let observedRevisionKey: String
    let expectedSizeBytes: String
    let fileName: String
    let captureKey: String
    let capturedAt: String
    let targetLocator: String
    let exactReplicaReady: Bool
    let proxyReady: Bool

    var id: String { sourceRevisionId }
}

struct DeviceMediaPreparationReceipt: Encodable {
    struct Technical: Encodable {
        let durationSeconds: Double?
        let widthPixels: Int?
        let heightPixels: Int?
        let framesPerSecond: Double?
    }

    struct Worker: Encodable {
        let executionId: String
        let buildId: String
    }

    let schema = "quipsly-device-media-preparation-receipt-v2"
    let libraryId: String
    let deviceId: String
    let folderGrantId: String
    let custodianNodeId: String
    let storageScopeId: String
    let externalFileId: String
    let externalReferenceId: String
    let sourceRevisionId: String
    let observedRevisionKey: String
    let expectedSizeBytes: String
    let targetLocator: String
    let contentSha256: String
    let completedAt: String
    let technical: Technical
    let worker: Worker
}

private struct DeviceMediaWorkspaceConfiguration: Decodable {
    let schema: String
    let status: String
    let workerMediaRoot: String
}

struct DeviceMediaLocalExecutionIdentity: Equatable {
    let custodianNodeId: String
    let storageScopeId: String
    let workerMediaRoot: URL
}

enum DeviceMediaPreparation {
    private static let bufferSize = 4 * 1_024 * 1_024
    private static let reserveBytes: Int64 = 10 * 1_024 * 1_024 * 1_024

    static func prepare(
        candidate: DeviceMediaPreparationCandidate,
        sourceRoot: URL,
        relativeLocator: String,
        progress: @escaping @Sendable (Int64, Int64) -> Void
    ) throws -> DeviceMediaPreparationReceipt {
        let executionIdentity = try localExecutionIdentity()
        guard candidate.custodianNodeId == executionIdentity.custodianNodeId,
              candidate.storageScopeId == executionIdentity.storageScopeId else {
            throw preparationError(
                9,
                "This preparation was planned for a different Mac media workspace. Follow the folder again from this Mac."
            )
        }
        let expectedSize = try positiveByteCount(candidate.expectedSizeBytes)
        let sourceURL = try authorizedSourceURL(
            root: sourceRoot,
            relativeLocator: relativeLocator
        )
        let sourceBefore = try sourceSnapshot(sourceURL)
        guard sourceBefore.size == expectedSize else {
            throw preparationError(
                10,
                "The source size changed after Nest planned this preparation. Follow the folder again before retrying."
            )
        }

        let workerRoot = executionIdentity.workerMediaRoot
        let targetURL = try authorizedTargetURL(
            workerRoot: workerRoot,
            relativeLocator: candidate.targetLocator
        )
        try FileManager.default.createDirectory(
            at: targetURL.deletingLastPathComponent(),
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )

        let existing = try? sourceSnapshot(targetURL)
        let sha256: String
        if existing?.size == expectedSize {
            sha256 = try verifyExactReplica(
                sourceURL: sourceURL,
                targetURL: targetURL,
                expectedSize: expectedSize,
                progress: progress
            )
        } else {
            if existing != nil {
                throw preparationError(
                    11,
                    "A different partial replica already occupies the authorized target. Quipsly left it untouched for inspection."
                )
            }
            try assertCapacity(for: expectedSize, at: workerRoot)
            sha256 = try copyAndHash(
                sourceURL: sourceURL,
                targetURL: targetURL,
                expectedSize: expectedSize,
                progress: progress
            )
        }

        let sourceAfter = try sourceSnapshot(sourceURL)
        guard sourceAfter == sourceBefore else {
            throw preparationError(
                12,
                "The source changed while Quipsly copied it. The uncommitted replica was not registered."
            )
        }
        let target = try sourceSnapshot(targetURL)
        guard target.size == expectedSize else {
            throw preparationError(
                13,
                "The retained replica byte count does not match the source observation."
            )
        }
        return DeviceMediaPreparationReceipt(
            libraryId: candidate.libraryId,
            deviceId: candidate.deviceId,
            folderGrantId: candidate.folderGrantId,
            custodianNodeId: candidate.custodianNodeId,
            storageScopeId: candidate.storageScopeId,
            externalFileId: candidate.externalFileId,
            externalReferenceId: candidate.externalReferenceId,
            sourceRevisionId: candidate.sourceRevisionId,
            observedRevisionKey: candidate.observedRevisionKey,
            expectedSizeBytes: candidate.expectedSizeBytes,
            targetLocator: candidate.targetLocator,
            contentSha256: sha256,
            completedAt: ISO8601DateFormatter().string(from: Date()),
            technical: .init(
                durationSeconds: nil,
                widthPixels: nil,
                heightPixels: nil,
                framesPerSecond: nil
            ),
            worker: .init(
                executionId: "device-prep:\(UUID().uuidString.lowercased())",
                buildId: Bundle.main.object(
                    forInfoDictionaryKey: "CFBundleVersion"
                ) as? String ?? "local-development"
            )
        )
    }

    static func localExecutionIdentity() throws -> DeviceMediaLocalExecutionIdentity {
        let configuredRoot = try activeWorkerRoot()
        guard let canonicalPointer = Darwin.realpath(configuredRoot.path, nil) else {
            throw preparationError(
                19,
                "Quipsly could not resolve the active local media workspace."
            )
        }
        defer { free(canonicalPointer) }
        let workerRoot = URL(
            fileURLWithPath: String(cString: canonicalPointer),
            isDirectory: true
        )
        let details = try FileManager.default.attributesOfItem(
            atPath: workerRoot.path
        )
        guard let deviceNumber = details[.systemNumber] as? NSNumber,
              let fileNumber = details[.systemFileNumber] as? NSNumber else {
            throw preparationError(
                19,
                "Quipsly could not identify the active local media workspace."
            )
        }
        var hostBuffer = [CChar](repeating: 0, count: Int(NI_MAXHOST))
        guard gethostname(&hostBuffer, hostBuffer.count) == 0 else {
            throw preparationError(20, "Quipsly could not identify this Mac.")
        }
        let host = String(cString: hostBuffer)
        let hostName = String("quipsly-media-worker:\(host)".prefix(220))
        let storageMaterial = "\(hostName)\0\(workerRoot.path)\0\(deviceNumber.stringValue)\0\(fileNumber.stringValue)"
        let storageDigest = SHA256.hash(data: Data(storageMaterial.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
        return DeviceMediaLocalExecutionIdentity(
            custodianNodeId: "execution_worker_\(stableHostID(hostName))",
            storageScopeId: "storage_scope_\(storageDigest.prefix(40))",
            workerMediaRoot: workerRoot
        )
    }

    private static func stableHostID(_ value: String) -> String {
        var hash: UInt32 = 2_166_136_261
        for scalar in value.unicodeScalars {
            hash ^= scalar.value
            hash = hash &* 16_777_619
        }
        return String(format: "%08x", hash)
    }

    private static func activeWorkerRoot() throws -> URL {
        let applicationSupport = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let configurationURL = applicationSupport
            .appendingPathComponent("Quipsly", isDirectory: true)
            .appendingPathComponent("local-media-workspace.json")
        if let data = try? Data(contentsOf: configurationURL),
           let configuration = try? JSONDecoder().decode(
               DeviceMediaWorkspaceConfiguration.self,
               from: data
           ),
           configuration.schema == "quipsly-local-media-workspace-v1",
           configuration.status == "active",
           configuration.workerMediaRoot.hasPrefix("/") {
            return try ensureDedicatedRoot(
                URL(fileURLWithPath: configuration.workerMediaRoot, isDirectory: true)
            )
        }
        return try ensureDedicatedRoot(
            URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
                .appendingPathComponent("quipsly-media-ingest", isDirectory: true)
        )
    }

    private static func ensureDedicatedRoot(_ root: URL) throws -> URL {
        let normalized = root.standardizedFileURL
        guard normalized.isFileURL,
              normalized.pathComponents.count > 2,
              normalized.path != "/",
              normalized.path != FileManager.default.homeDirectoryForCurrentUser.path else {
            throw preparationError(14, "The local worker root is not a dedicated media directory.")
        }
        try FileManager.default.createDirectory(
            at: normalized,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        return normalized
    }

    private static func authorizedSourceURL(
        root: URL,
        relativeLocator: String
    ) throws -> URL {
        guard isSafeRelativePath(relativeLocator) else {
            throw preparationError(15, "The local folder ledger contains an unsafe source locator.")
        }
        let normalizedRoot = root.standardizedFileURL
        let source = normalizedRoot
            .appendingPathComponent(relativeLocator)
            .standardizedFileURL
        guard source.path.hasPrefix(normalizedRoot.path + "/") else {
            throw preparationError(16, "The selected source escaped the granted folder.")
        }
        return source
    }

    private static func authorizedTargetURL(
        workerRoot: URL,
        relativeLocator: String
    ) throws -> URL {
        guard isSafeRelativePath(relativeLocator),
              relativeLocator.lowercased().hasSuffix(".lrv") else {
            throw preparationError(17, "Nest returned an unsafe local replica locator.")
        }
        let target = workerRoot
            .appendingPathComponent(relativeLocator)
            .standardizedFileURL
        guard target.path.hasPrefix(workerRoot.path + "/") else {
            throw preparationError(18, "The local replica target escaped the worker root.")
        }
        return target
    }

    private static func isSafeRelativePath(_ value: String) -> Bool {
        !value.isEmpty &&
            !value.hasPrefix("/") &&
            !value.contains("\0") &&
            !value.split(separator: "/", omittingEmptySubsequences: false)
                .contains(where: { $0.isEmpty || $0 == "." || $0 == ".." })
    }

    private static func copyAndHash(
        sourceURL: URL,
        targetURL: URL,
        expectedSize: Int64,
        progress: @escaping @Sendable (Int64, Int64) -> Void
    ) throws -> String {
        let partialURL = targetURL.deletingPathExtension()
            .appendingPathExtension("partial-\(UUID().uuidString.lowercased()).lrv")
        FileManager.default.createFile(
            atPath: partialURL.path,
            contents: nil,
            attributes: [.posixPermissions: 0o600]
        )
        do {
            let source = try FileHandle(forReadingFrom: sourceURL)
            let output = try FileHandle(forWritingTo: partialURL)
            defer {
                try? source.close()
                try? output.close()
            }
            var hasher = SHA256()
            var copied: Int64 = 0
            while true {
                try Task.checkCancellation()
                guard let data = try source.read(upToCount: bufferSize),
                      !data.isEmpty else { break }
                copied += Int64(data.count)
                guard copied <= expectedSize else {
                    throw preparationError(19, "The source grew while it was being copied.")
                }
                hasher.update(data: data)
                try output.write(contentsOf: data)
                progress(copied, expectedSize)
            }
            guard copied == expectedSize else {
                throw preparationError(20, "The source ended before its observed byte count.")
            }
            try output.synchronize()
            try FileManager.default.moveItem(at: partialURL, to: targetURL)
            try FileManager.default.setAttributes(
                [.posixPermissions: 0o600],
                ofItemAtPath: targetURL.path
            )
            return hasher.finalize().map { String(format: "%02x", $0) }.joined()
        } catch {
            try? FileManager.default.removeItem(at: partialURL)
            throw error
        }
    }

    private static func verifyExactReplica(
        sourceURL: URL,
        targetURL: URL,
        expectedSize: Int64,
        progress: @escaping @Sendable (Int64, Int64) -> Void
    ) throws -> String {
        let source = try FileHandle(forReadingFrom: sourceURL)
        let target = try FileHandle(forReadingFrom: targetURL)
        defer {
            try? source.close()
            try? target.close()
        }
        var hasher = SHA256()
        var read: Int64 = 0
        while true {
            try Task.checkCancellation()
            let sourceData = try source.read(upToCount: bufferSize) ?? Data()
            let targetData = try target.read(upToCount: bufferSize) ?? Data()
            guard !sourceData.isEmpty || !targetData.isEmpty else { break }
            guard sourceData == targetData else {
                throw preparationError(
                    21,
                    "The retained replica does not match the granted source bytes. Quipsly left both files untouched for inspection."
                )
            }
            read += Int64(sourceData.count)
            hasher.update(data: sourceData)
            progress(read, expectedSize)
        }
        guard read == expectedSize else {
            throw preparationError(25, "The existing replica is not the expected size.")
        }
        return hasher.finalize().map { String(format: "%02x", $0) }.joined()
    }

    private static func assertCapacity(for bytes: Int64, at root: URL) throws {
        let values = try root.resourceValues(forKeys: [
            .volumeAvailableCapacityForImportantUsageKey,
            .volumeAvailableCapacityKey,
        ])
        let available = values.volumeAvailableCapacityForImportantUsage
            ?? values.volumeAvailableCapacity.map(Int64.init)
        if let available, available - reserveBytes < bytes {
            let shortfall = bytes - max(0, available - reserveBytes)
            throw preparationError(
                22,
                "The active media workspace is \(ByteCountFormatter.string(fromByteCount: shortfall, countStyle: .file)) short after preserving Quipsly's 10 GB safety reserve."
            )
        }
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
            throw preparationError(23, "The source is no longer a readable regular file.")
        }
        return Snapshot(size: Int64(size), modifiedAt: modifiedAt)
    }

    private static func positiveByteCount(_ value: String) throws -> Int64 {
        guard let parsed = Int64(value), parsed > 0 else {
            throw preparationError(24, "The preparation plan has an invalid byte count.")
        }
        return parsed
    }

    private static func preparationError(_ code: Int, _ message: String) -> NSError {
        NSError(
            domain: "QuipslyDeviceMediaPreparation",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}
#endif
