import CryptoKit
import Foundation
import SwiftUI

#if os(macOS)
private let deviceMediaFolderObservationSchema =
    "quipsly-device-media-folder-observation-v1"

private struct DeviceFolderFileObservation: Encodable {
    let id: String
    let name: String
    let mimeType: String?
    let sizeBytes: String
    let createdTime: String?
    let modifiedTime: String
    let durationSeconds: Double?
    let widthPixels: Int?
    let heightPixels: Int?
}

private struct DeviceFolderBatchObservation: Encodable {
    let id: String
    let name: String
    let files: [DeviceFolderFileObservation]
}

private struct DeviceFolderObservation: Encodable {
    struct Root: Encodable {
        let id: String
        let name: String
    }

    let schema: String
    let deviceId: String
    let folderGrantId: String
    let root: Root
    let batches: [DeviceFolderBatchObservation]
}

private struct DeviceFolderFollowRequest: Encodable {
    let action = "observe-device-media-folder"
    let clientRequestId: String
    let observation: DeviceFolderObservation
}

private struct DeviceFolderFollowResponse: Decodable {
    struct Operation: Decodable {
        struct Plan: Decodable {
            let totalFiles: Int
            let readySegmentCount: Int
            let heldSegmentCount: Int
        }
        struct Library: Decodable {
            let id: String
            let revision: Int
            let status: String
        }
        let plan: Plan
        let attachedCount: Int
        let sourceUnitCount: Int
        let sourceSetCount: Int
        let exactByteVerificationPending: Bool
        let library: Library
        let localPathWithheld: Bool
    }

    let ok: Bool
    let operation: Operation?
    let error: String?
    let errorCode: String?
}

private struct DeviceFolderScan {
    let observation: DeviceFolderObservation
    let relativeLocators: [String: String]
}

private enum DeviceMediaFolderScanner {
    private static let installationIdKey =
        "quipsly.nativeEditor.deviceMediaInstallationId"

    static func scan(rootURL: URL, folderGrantId: String) throws -> DeviceFolderScan {
        let fileManager = FileManager.default
        let keys: Set<URLResourceKey> = [
            .isDirectoryKey,
            .isRegularFileKey,
            .isSymbolicLinkKey,
            .fileSizeKey,
            .creationDateKey,
            .contentModificationDateKey,
        ]
        let rootChildren = try fileManager.contentsOfDirectory(
            at: rootURL,
            includingPropertiesForKeys: Array(keys),
            options: [.skipsHiddenFiles]
        )
        let captureFolders = try rootChildren.compactMap { child -> URL? in
            let values = try child.resourceValues(forKeys: keys)
            guard values.isDirectory == true,
                  values.isSymbolicLink != true else { return nil }
            return child
        }
        guard captureFolders.count <= 1_000 else {
            throw NSError(
                domain: "QuipslyDeviceMediaFolder",
                code: 2,
                userInfo: [NSLocalizedDescriptionKey:
                    "This folder has more than 1,000 immediate subfolders. Choose a narrower 360 library root."]
            )
        }
        let deviceId = installationID()
        let rootId = opaqueID(
            prefix: "device-folder",
            value: "\(deviceId):\(folderGrantId)"
        )
        var relativeLocators: [String: String] = [:]
        var observedFileCount = 0
        let batches = try captureFolders.sorted {
            $0.lastPathComponent.localizedStandardCompare($1.lastPathComponent)
                == .orderedAscending
        }.map { folder -> DeviceFolderBatchObservation in
            let relativeFolder = folder.lastPathComponent
            let batchId = opaqueID(
                prefix: "device-batch",
                value: "\(rootId):\(relativeFolder)"
            )
            let children = try fileManager.contentsOfDirectory(
                at: folder,
                includingPropertiesForKeys: Array(keys),
                options: [.skipsHiddenFiles]
            )
            observedFileCount += children.count
            guard observedFileCount <= 20_000 else {
                throw NSError(
                    domain: "QuipslyDeviceMediaFolder",
                    code: 3,
                    userInfo: [NSLocalizedDescriptionKey:
                        "This observation exceeds 20,000 files. Choose a narrower library root so refresh stays fast and explainable."]
                )
            }
            let files = try children.compactMap {
                child -> DeviceFolderFileObservation? in
                let values = try child.resourceValues(forKeys: keys)
                guard values.isRegularFile == true,
                      values.isSymbolicLink != true,
                      let modifiedAt = values.contentModificationDate else {
                    return nil
                }
                let relativePath = "\(relativeFolder)/\(child.lastPathComponent)"
                let fileId = opaqueID(
                    prefix: "device-file",
                    value: "\(rootId):\(relativePath)"
                )
                relativeLocators[fileId] = relativePath
                return DeviceFolderFileObservation(
                    id: fileId,
                    name: child.lastPathComponent,
                    mimeType: mimeType(for: child.pathExtension),
                    sizeBytes: String(values.fileSize ?? 0),
                    createdTime: values.creationDate.map(iso8601),
                    modifiedTime: iso8601(modifiedAt),
                    durationSeconds: nil,
                    widthPixels: nil,
                    heightPixels: nil
                )
            }.sorted {
                $0.name.localizedStandardCompare($1.name) == .orderedAscending
            }
            return DeviceFolderBatchObservation(
                id: batchId,
                name: relativeFolder,
                files: files
            )
        }
        return DeviceFolderScan(
            observation: DeviceFolderObservation(
                schema: deviceMediaFolderObservationSchema,
                deviceId: deviceId,
                folderGrantId: folderGrantId,
                root: .init(id: rootId, name: rootURL.lastPathComponent),
                batches: batches
            ),
            relativeLocators: relativeLocators
        )
    }

    private static func installationID() -> String {
        if let saved = UserDefaults.standard.string(forKey: installationIdKey),
           !saved.isEmpty {
            return saved
        }
        let created = "device:\(UUID().uuidString.lowercased())"
        UserDefaults.standard.set(created, forKey: installationIdKey)
        return created
    }

    private static func opaqueID(prefix: String, value: String) -> String {
        let digest = SHA256.hash(data: Data(value.utf8))
        return "\(prefix):\(digest.map { String(format: "%02x", $0) }.joined())"
    }

    private static func iso8601(_ date: Date) -> String {
        ISO8601DateFormatter().string(from: date)
    }

    private static func mimeType(for extensionValue: String) -> String? {
        switch extensionValue.lowercased() {
        case "insv": return "video/mp4"
        case "lrv": return "video/mp4"
        case "mp4": return "video/mp4"
        case "mov": return "video/quicktime"
        case "wav": return "audio/wav"
        case "m4a": return "audio/mp4"
        default: return nil
        }
    }
}

private enum DeviceMediaFolderLocatorLedger {
    private struct Payload: Encodable {
        let schema = "quipsly-device-media-folder-locator-ledger-v1"
        let folderGrantId: String
        let rootId: String
        let updatedAt: String
        let relativeLocators: [String: String]
    }

    static func persist(scan: DeviceFolderScan) throws {
        let base = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        ).appendingPathComponent("QuipslyStudio/DeviceMediaFolders", isDirectory: true)
        try FileManager.default.createDirectory(
            at: base,
            withIntermediateDirectories: true,
            attributes: [.posixPermissions: 0o700]
        )
        let target = base.appendingPathComponent(
            "\(scan.observation.folderGrantId).json",
            isDirectory: false
        )
        let payload = Payload(
            folderGrantId: scan.observation.folderGrantId,
            rootId: scan.observation.root.id,
            updatedAt: ISO8601DateFormatter().string(from: Date()),
            relativeLocators: scan.relativeLocators
        )
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        try encoder.encode(payload).write(to: target, options: .atomic)
        try FileManager.default.setAttributes(
            [.posixPermissions: 0o600],
            ofItemAtPath: target.path
        )
    }
}

struct DeviceMediaFolderFollowView: View {
    @ObservedObject var accountStore: QuipslyNativeAccountStore
    @ObservedObject private var externalMediaAccess = ExternalMediaAccess.shared
    @AppStorage("quipsly.nativeEditor.deviceFolderNestSlug")
    private var selectedNestSlug = ""
    @State private var isFollowing = false
    @State private var status =
        "Follow this folder to make its 360 packages visible in Nest without uploading originals."
    @State private var lastLibraryId = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 8) {
                Label("Nest library", systemImage: "arrow.triangle.2.circlepath")
                    .font(.caption)
                    .fontWeight(.bold)
                Picker("Nest", selection: $selectedNestSlug) {
                    if accountStore.visibleProjects.isEmpty {
                        Text("Connect account first").tag("")
                    } else {
                        ForEach(accountStore.visibleProjects) { project in
                            Text(project.name).tag(project.slug)
                        }
                    }
                }
                .labelsHidden()
                .frame(maxWidth: 260)

                Button(isFollowing ? "Observing…" : "Follow in Nest") {
                    Task { await followFolder() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(
                    isFollowing ||
                    !accountStore.isVerified ||
                    selectedNestSlug.isEmpty ||
                    !externalMediaAccess.hasExplicitFolderGrant
                )
                .accessibilityIdentifier("quipsly.storage.followInNest")

                if !lastLibraryId.isEmpty {
                    Image(systemName: "checkmark.seal.fill")
                        .foregroundStyle(.green)
                        .accessibilityLabel("Nest library observation saved")
                }
            }
            Text(status)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .task { chooseDefaultNestIfNeeded() }
        .onChange(of: accountStore.visibleProjects.map(\.slug)) { _, _ in
            chooseDefaultNestIfNeeded()
        }
    }

    private func chooseDefaultNestIfNeeded() {
        guard !accountStore.visibleProjects.contains(where: {
            $0.slug == selectedNestSlug
        }) else { return }
        selectedNestSlug = accountStore.visibleProjects.first(where: {
            $0.slug == "high-ground-odyssey"
        })?.slug ?? accountStore.visibleProjects.first?.slug ?? ""
    }

    @MainActor
    private func followFolder() async {
        guard let folderGrantId = externalMediaAccess.folderGrantID,
              let baseURL = accountStore.normalizedBaseURL else {
            status = "Restore the folder grant and native Quipsly account first."
            return
        }
        isFollowing = true
        defer { isFollowing = false }
        do {
            status = "Reading folder names and file metadata. Originals are not being downloaded or uploaded…"
            let rootURL = try externalMediaAccess.withGrantedFolderURL { $0 }
            let scan = try await Task.detached(priority: .userInitiated) {
                try DeviceMediaFolderScanner.scan(
                    rootURL: rootURL,
                    folderGrantId: folderGrantId
                )
            }.value
            guard !scan.observation.batches.isEmpty else {
                throw NSError(
                    domain: "QuipslyDeviceMediaFolder",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey:
                        "No capture folders were found immediately beneath the granted folder."]
                )
            }
            var request = URLRequest(
                url: baseURL.appending(
                    path: "/api/nests/\(selectedNestSlug)/source-story"
                )
            )
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            let encoder = JSONEncoder()
            request.httpBody = try encoder.encode(
                DeviceFolderFollowRequest(
                    clientRequestId: UUID().uuidString.lowercased(),
                    observation: scan.observation
                )
            )
            let (data, response) = try await accountStore.authenticatedData(
                for: request
            )
            let payload = try JSONDecoder().decode(
                DeviceFolderFollowResponse.self,
                from: data
            )
            guard (200 ..< 300).contains(response.statusCode),
                  payload.ok,
                  let operation = payload.operation else {
                throw NSError(
                    domain: "QuipslyDeviceMediaFolder",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey:
                        payload.error ?? "Nest did not accept the folder observation."]
                )
            }
            try DeviceMediaFolderLocatorLedger.persist(scan: scan)
            lastLibraryId = operation.library.id
            status =
                "Nest saved revision \(operation.library.revision): \(operation.plan.totalFiles) files, \(operation.plan.readySegmentCount) ready packages, \(operation.plan.heldSegmentCount) held for attention, and \(operation.attachedCount) canonical source members. Original paths stayed on this Mac; exact byte verification waits for an explicit local conform or render operation."
        } catch {
            status = "Could not follow this folder: \(error.localizedDescription)"
        }
    }
}
#endif
