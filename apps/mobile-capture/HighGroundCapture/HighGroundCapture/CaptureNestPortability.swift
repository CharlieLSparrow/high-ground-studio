import Foundation
import Combine
import SwiftUI
import UniformTypeIdentifiers

private let captureNestPortableBundleLimit = 30 * 1024 * 1024

struct CaptureNestRestorePlan: Codable, Equatable {
    let manifestSha256: String
    let sourceNestSlug: String
    let tagCreates: Int
    let tagReuses: Int
    let tagSlugCollisions: Int
    let aliasCreates: Int
    let aliasReuses: Int
    let aliasesDeferred: Int
    let mergeLinksPreservedAsHistory: Int
    let noteCreates: Int
    let noteReuses: Int
    let blockCreates: Int
    let spanCreates: Int
    let documentTagLinkCreates: Int
    let taskCreates: Int
    let taskReuses: Int
    let goalCreates: Int
    let goalReuses: Int
    let progressReceiptCreates: Int
    let goalTaskLinkCreates: Int
    let planBlockCreates: Int
    let planBlockReuses: Int
    let remindersDeferred: Int
    let recurrenceSeriesDeferred: Int
    let planBlocksCanceledForSafety: Int
    let overwrites: Int
    let sourceMutations: Int
    let externalSideEffects: Int

    var isSafeToApply: Bool {
        overwrites == 0 && sourceMutations == 0 && externalSideEffects == 0
    }
}

private struct CaptureNestPortabilityErrorResponse: Codable {
    let ok: Bool?
    let error: String?
}

private struct CaptureNestRestoreValidationResponse: Codable {
    let ok: Bool
    let error: String?
    let mode: String?
    let destinationNestSlug: String?
    let plan: CaptureNestRestorePlan?
    let planSha256: String?
    let requiresExplicitApply: Bool?
}

private struct CaptureNestRestoreBoundaries: Codable, Equatable {
    let sourceMutated: Bool
    let overwroteExisting: Bool
    let restoredPrivate: Bool
    let collaboratorAssignmentsRestored: Bool
    let remindersRestoredActive: Bool
    let recurrenceRestoredActive: Bool
    let planBlocksRestoredCanceled: Bool
    let externalResourcesFetched: Bool
    let externalSideEffects: Bool

    var provesSafeApply: Bool {
        !sourceMutated
            && !overwroteExisting
            && restoredPrivate
            && !collaboratorAssignmentsRestored
            && !remindersRestoredActive
            && !recurrenceRestoredActive
            && planBlocksRestoredCanceled
            && !externalResourcesFetched
            && !externalSideEffects
    }
}

struct CaptureNestRestoreReceipt: Codable, Equatable {
    let schema: String
    let manifestSha256: String
    let destinationProjectId: String
    let sourceNestId: String
    let sourceNestSlug: String
    let appliedAt: String
    let integrityRecomputed: Bool
    let newlyCreatedTagCount: Int
}

private struct CaptureNestRestoreApplyResponse: Codable {
    let ok: Bool
    let error: String?
    let mode: String?
    let destinationNestSlug: String?
    let manifestSha256: String?
    let plan: CaptureNestRestorePlan?
    let planSha256: String?
    let boundaries: CaptureNestRestoreBoundaries?
    let receipt: CaptureNestRestoreReceipt?
}

@MainActor
final class CaptureNestPortabilityClient: ObservableObject {
    enum Operation: Equatable {
        case loadingProjects
        case exporting
        case importing
        case validating
        case applying
    }

    @Published private(set) var projects: [MobileCaptureWorkProject] = []
    @Published private(set) var selectedProjectID: String?
    @Published private(set) var operation: Operation?
    @Published private(set) var exportedFileURL: URL?
    @Published private(set) var importedFileName: String?
    @Published private(set) var importedByteCount: Int?
    @Published private(set) var restorePlan: CaptureNestRestorePlan?
    @Published private(set) var appliedReceipt: CaptureNestRestoreReceipt?
    @Published var statusMessage: String?
    @Published var errorMessage: String?

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )
    private var importedBundleData: Data?
    private var verifiedPlanSha256: String?

    var selectedProject: MobileCaptureWorkProject? {
        projects.first(where: { $0.id == selectedProjectID })
    }

    var canUseNetworkActions: Bool {
        AuthManager.shared.networkActionsAllowed
    }

    var isBusy: Bool { operation != nil }

    func selectProject(_ projectID: String) {
        guard projects.contains(where: { $0.id == projectID }) else { return }
        guard selectedProjectID != projectID else { return }
        selectedProjectID = projectID
        restorePlan = nil
        verifiedPlanSha256 = nil
        appliedReceipt = nil
        errorMessage = nil
        statusMessage = importedBundleData == nil
            ? nil
            : "Destination changed. Validate the loaded package against this Nest before applying it."
    }

    func loadProjects(usesPreviewData: Bool) async {
        guard operation == nil else { return }
        if usesPreviewData {
            projects = [
                MobileCaptureWorkProject(
                    id: "preview-home-nest",
                    slug: "alex-home",
                    name: "Alex's Nest",
                    role: "OWNER",
                    canWrite: true,
                    isHomeNest: true,
                    updatedAt: ISO8601DateFormatter().string(from: Date())
                ),
                MobileCaptureWorkProject(
                    id: "preview-production-nest",
                    slug: "high-ground-odyssey",
                    name: "High Ground Odyssey",
                    role: "OWNER",
                    canWrite: true,
                    isHomeNest: false,
                    updatedAt: ISO8601DateFormatter().string(from: Date())
                ),
            ]
            selectedProjectID = projects.first?.id
            statusMessage = "Preview mode shows the owner workflow without exporting or restoring private data."
            return
        }

        operation = .loadingProjects
        errorMessage = nil
        defer { operation = nil }

        guard let url = URL(string: "\(baseURL)/api/mobile/capture/work") else {
            errorMessage = "The configured Nest URL is not valid."
            return
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCaptureWorkResponse.self, from: data)
            guard response.statusCode < 400, payload.ok else {
                throw portabilityError(
                    statusCode: response.statusCode,
                    message: payload.error ?? "Your owned Nests could not be loaded."
                )
            }

            projects = (payload.projects ?? [])
                .filter { $0.role.uppercased() == "OWNER" }
                .sorted {
                    if $0.isHomeNest != $1.isHomeNest { return $0.isHomeNest }
                    return $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
                }
            if let selectedProjectID,
               projects.contains(where: { $0.id == selectedProjectID }) {
                self.selectedProjectID = selectedProjectID
            } else {
                selectedProjectID = projects.first?.id
            }
            statusMessage = projects.isEmpty
                ? "Only Nest owners can create or restore a complete private package."
                : nil
        } catch {
            errorMessage = portabilityMessage(for: error)
        }
    }

    func exportSelectedNest(usesPreviewData: Bool) async {
        guard !usesPreviewData else {
            statusMessage = "Preview mode never exports private data. Sign in normally to create a verified package."
            return
        }
        guard operation == nil, let project = selectedProject else { return }
        guard canUseNetworkActions else {
            errorMessage = "Reconnect to Nest before creating a verified backup. Your local recordings remain available offline."
            return
        }
        operation = .exporting
        errorMessage = nil
        statusMessage = "Nest is verifying every included record and reference…"
        defer { operation = nil }

        guard let url = portableURL(projectSlug: project.slug, endpoint: "portable-export") else {
            errorMessage = "The Nest export URL is not valid."
            return
        }

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.statusCode < 400 else {
                throw decodeServerError(data, response: response, fallback: "Nest could not create this private package.")
            }
            guard !data.isEmpty, data.count <= captureNestPortableBundleLimit else {
                throw portabilityError(
                    statusCode: 413,
                    message: "This package exceeds the current 30 MB phone transfer limit. Nothing was saved."
                )
            }
            guard (try? JSONSerialization.jsonObject(with: data)) != nil else {
                throw portabilityError(statusCode: 422, message: "Nest returned a package that was not valid JSON.")
            }

            let filename = safeExportFilename(
                response.value(forHTTPHeaderField: "Content-Disposition"),
                fallbackSlug: project.slug
            )
            let destination = try uniqueExportDestination(
                in: secureExportDirectory(),
                preferredFilename: filename
            )
            do {
                try data.write(to: destination, options: [.atomic, .completeFileProtection])
                var resourceValues = URLResourceValues()
                resourceValues.isExcludedFromBackup = true
                var mutableDestination = destination
                try mutableDestination.setResourceValues(resourceValues)

                let storedValues = try destination.resourceValues(
                    forKeys: [.fileSizeKey, .isRegularFileKey, .isExcludedFromBackupKey]
                )
                let storedData = try Data(contentsOf: destination, options: [.mappedIfSafe])
                guard storedValues.isRegularFile == true,
                      storedValues.fileSize == data.count,
                      storedValues.isExcludedFromBackup == true,
                      storedData == data else {
                    throw portabilityError(
                        statusCode: 500,
                        message: "The protected backup could not be read back exactly. The incomplete copy was removed."
                    )
                }
            } catch {
                try? FileManager.default.removeItem(at: destination)
                throw error
            }

            exportedFileURL = destination
            statusMessage = "Verified backup saved on this iPhone. Share it to Files or another location you control."
        } catch {
            errorMessage = portabilityMessage(for: error)
            statusMessage = nil
        }
    }

    func loadImportedBundle(from url: URL) async {
        guard operation == nil else { return }
        operation = .importing
        errorMessage = nil
        statusMessage = nil
        restorePlan = nil
        verifiedPlanSha256 = nil
        appliedReceipt = nil
        defer { operation = nil }

        let didAccess = url.startAccessingSecurityScopedResource()
        defer {
            if didAccess { url.stopAccessingSecurityScopedResource() }
        }

        do {
            let values = try url.resourceValues(forKeys: [.fileSizeKey, .isRegularFileKey])
            guard values.isRegularFile != false else {
                throw portabilityError(statusCode: 400, message: "Choose one Quipsly Nest JSON file.")
            }
            if let fileSize = values.fileSize, fileSize > captureNestPortableBundleLimit {
                throw portabilityError(statusCode: 413, message: "That file is larger than the 30 MB restore limit.")
            }
            let data = try Data(contentsOf: url, options: [.mappedIfSafe])
            guard !data.isEmpty, data.count <= captureNestPortableBundleLimit else {
                throw portabilityError(statusCode: 413, message: "That file is empty or larger than the 30 MB restore limit.")
            }
            guard (try? JSONSerialization.jsonObject(with: data)) != nil else {
                throw portabilityError(statusCode: 400, message: "That file is not valid JSON. Nothing was sent or restored.")
            }

            importedBundleData = data
            importedFileName = url.lastPathComponent
            importedByteCount = data.count
            statusMessage = "Package loaded only on this iPhone. Validate its manifest and destination plan before restoring anything."
        } catch {
            importedBundleData = nil
            importedFileName = nil
            importedByteCount = nil
            errorMessage = portabilityMessage(for: error)
        }
    }

    func validateRestore(usesPreviewData: Bool) async {
        guard !usesPreviewData else {
            statusMessage = "Preview mode does not send or restore a package."
            return
        }
        guard operation == nil,
              let project = selectedProject,
              let importedBundleData else { return }
        guard canUseNetworkActions else {
            errorMessage = "Reconnect to Nest to validate this package. The loaded file remains unchanged on your iPhone."
            return
        }

        operation = .validating
        errorMessage = nil
        statusMessage = "Checking the manifest, references, permissions, and destination plan…"
        restorePlan = nil
        verifiedPlanSha256 = nil
        appliedReceipt = nil
        defer { operation = nil }

        do {
            let (data, response) = try await sendRestore(
                bundleData: importedBundleData,
                projectSlug: project.slug,
                mode: "validate"
            )
            let payload = try JSONDecoder().decode(CaptureNestRestoreValidationResponse.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  payload.requiresExplicitApply == true,
                  payload.mode == "validate",
                  payload.destinationNestSlug == project.slug,
                  let plan = payload.plan,
                  let planSha256 = payload.planSha256,
                  planSha256.range(of: "^[a-f0-9]{64}$", options: .regularExpression) != nil else {
                throw decodeServerError(data, response: response, fallback: "Nest could not verify this package.")
            }
            guard plan.isSafeToApply else {
                throw portabilityError(
                    statusCode: 409,
                    message: "Nest returned a plan with an overwrite, source mutation, or external effect. Apply remains disabled."
                )
            }
            restorePlan = plan
            verifiedPlanSha256 = planSha256
            statusMessage = "Manifest and destination checks passed. Review the complete no-overwrite plan before applying it."
        } catch {
            errorMessage = portabilityMessage(for: error)
            statusMessage = nil
        }
    }

    func applyRestore(usesPreviewData: Bool) async {
        guard !usesPreviewData else { return }
        guard operation == nil,
              let project = selectedProject,
              let importedBundleData,
              let verifiedPlan = restorePlan,
              let verifiedPlanSha256,
              verifiedPlan.isSafeToApply else { return }
        guard canUseNetworkActions else {
            errorMessage = "Reconnect to Nest before applying the verified plan. Nothing was restored."
            return
        }

        operation = .applying
        errorMessage = nil
        statusMessage = "Restoring private deterministic copies into \(project.name)…"
        defer { operation = nil }

        do {
            let (data, response) = try await sendRestore(
                bundleData: importedBundleData,
                projectSlug: project.slug,
                mode: "apply",
                expectedPlanSha256: verifiedPlanSha256
            )
            let payload = try JSONDecoder().decode(CaptureNestRestoreApplyResponse.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  payload.mode == "apply",
                  payload.destinationNestSlug == project.slug,
                  payload.manifestSha256 == verifiedPlan.manifestSha256,
                  payload.planSha256 == verifiedPlanSha256,
                  let appliedPlan = payload.plan,
                  appliedPlan == verifiedPlan,
                  appliedPlan.isSafeToApply,
                  payload.boundaries?.provesSafeApply == true,
                  let receipt = payload.receipt,
                  receipt.schema == "quipsly-nest-restore-receipt-v1",
                  receipt.manifestSha256 == verifiedPlan.manifestSha256,
                  receipt.integrityRecomputed else {
                throw decodeServerError(
                    data,
                    response: response,
                    fallback: "Nest did not return the complete safe-restore receipt."
                )
            }
            appliedReceipt = receipt
            statusMessage = "Restore confirmed. Private notes and work now have stable identities; alerts and calendar effects remain inactive."
        } catch {
            errorMessage = "\(portabilityMessage(for: error)) Validate the package again before retrying."
            restorePlan = nil
            self.verifiedPlanSha256 = nil
            statusMessage = nil
        }
    }

    func clearMessages() {
        errorMessage = nil
        statusMessage = nil
    }

    func reportImportFailure(_ error: Error) {
        errorMessage = error.localizedDescription
        statusMessage = nil
    }

    private func sendRestore(
        bundleData: Data,
        projectSlug: String,
        mode: String,
        expectedPlanSha256: String? = nil
    ) async throws -> (Data, HTTPURLResponse) {
        guard let base = portableURL(projectSlug: projectSlug, endpoint: "portable-restore"),
              var components = URLComponents(url: base, resolvingAgainstBaseURL: false) else {
            throw portabilityError(statusCode: 400, message: "The Nest restore URL is not valid.")
        }
        components.queryItems = [URLQueryItem(name: "mode", value: mode)]
        guard let url = components.url else {
            throw portabilityError(statusCode: 400, message: "The Nest restore URL is not valid.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let expectedPlanSha256 {
            request.setValue(expectedPlanSha256, forHTTPHeaderField: "x-quipsly-restore-plan-sha256")
        }
        request.httpBody = bundleData
        return try await AuthManager.shared.authenticatedData(for: request)
    }

    private func portableURL(projectSlug: String, endpoint: String) -> URL? {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-._~"))
        guard let encodedSlug = projectSlug.addingPercentEncoding(withAllowedCharacters: allowed) else { return nil }
        return URL(string: "\(baseURL)/api/nests/\(encodedSlug)/\(endpoint)")
    }

    private func secureExportDirectory() throws -> URL {
        let support = try FileManager.default.url(
            for: .applicationSupportDirectory,
            in: .userDomainMask,
            appropriateFor: nil,
            create: true
        )
        let directory = support.appendingPathComponent("PortableNestExports", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true,
            attributes: [.protectionKey: FileProtectionType.complete]
        )
        var values = URLResourceValues()
        values.isExcludedFromBackup = true
        var mutableDirectory = directory
        try mutableDirectory.setResourceValues(values)
        return directory
    }

    private func uniqueExportDestination(
        in directory: URL,
        preferredFilename: String
    ) throws -> URL {
        let fileManager = FileManager.default
        let preferred = directory.appendingPathComponent(preferredFilename, isDirectory: false)
        guard fileManager.fileExists(atPath: preferred.path) else { return preferred }

        let preferredURL = URL(fileURLWithPath: preferredFilename)
        let fileExtension = preferredURL.pathExtension.isEmpty ? "json" : preferredURL.pathExtension
        let stem = preferredURL.deletingPathExtension().lastPathComponent
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        let timestamp = formatter.string(from: Date())

        for _ in 0..<8 {
            let nonce = UUID().uuidString.prefix(8).lowercased()
            let filename = "\(stem)-\(timestamp)-\(nonce).\(fileExtension)"
            let candidate = directory.appendingPathComponent(filename, isDirectory: false)
            if !fileManager.fileExists(atPath: candidate.path) { return candidate }
        }

        throw portabilityError(
            statusCode: 409,
            message: "Quipsly could not allocate a new protected backup filename. No existing backup was changed."
        )
    }

    private func safeExportFilename(_ contentDisposition: String?, fallbackSlug: String) -> String {
        let serverName = contentDisposition?
            .components(separatedBy: "filename=")
            .dropFirst()
            .first?
            .trimmingCharacters(in: CharacterSet(charactersIn: "\"' "))
        let fallbackDate = ISO8601DateFormatter().string(from: Date()).prefix(10)
        let candidate = serverName?.isEmpty == false
            ? serverName!
            : "quipsly-\(fallbackSlug)-nest-\(fallbackDate).json"
        let safe = candidate.map { character in
            character.isLetter || character.isNumber || ".-_".contains(character)
                ? character
                : "-"
        }
        let normalized = String(safe.prefix(180))
        return normalized.lowercased().hasSuffix(".json") ? normalized : "\(normalized).json"
    }

    private func decodeServerError(
        _ data: Data,
        response: HTTPURLResponse,
        fallback: String
    ) -> Error {
        let decoded = try? JSONDecoder().decode(CaptureNestPortabilityErrorResponse.self, from: data)
        return portabilityError(
            statusCode: response.statusCode,
            message: decoded?.error ?? fallback
        )
    }

    private func portabilityError(statusCode: Int, message: String) -> Error {
        NSError(
            domain: "CaptureNestPortability",
            code: statusCode,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }

    private func portabilityMessage(for error: Error) -> String {
        return error.localizedDescription
    }
}

struct CaptureNestPortabilityView: View {
    let usesPreviewData: Bool

    @StateObject private var client = CaptureNestPortabilityClient()
    @StateObject private var auth = AuthManager.shared
    @State private var showsImporter = false
    @State private var showsApplyConfirmation = false

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                boundaryCard
                destinationCard
                exportCard
                restoreCard
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 80)
        }
        .background(CaptureCanvas())
        .navigationTitle("Backup & transfer")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CaptureNestPortabilityView")
        .task {
            await client.loadProjects(usesPreviewData: usesPreviewData)
        }
        .fileImporter(
            isPresented: $showsImporter,
            allowedContentTypes: [.json],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let urls):
                guard let url = urls.first else { return }
                Task { await client.loadImportedBundle(from: url) }
            case .failure(let error):
                client.reportImportFailure(error)
            }
        }
        .alert("Apply this verified restore?", isPresented: $showsApplyConfirmation) {
            Button("Keep reviewing", role: .cancel) {}
            Button("Apply restore") {
                Task { await client.applyRestore(usesPreviewData: usesPreviewData) }
            }
        } message: {
            Text(applyConfirmationMessage)
        }
    }

    private var boundaryCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Portable by design", systemImage: "externaldrive.badge.checkmark")
                .font(.headline)
            Text("Keep your canonical notes, tasks, goals, tag vocabulary, exact note anchors, and focus history portable without copying the database or weakening permissions.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
            Label(
                auth.networkActionsAllowed ? "Nest connected" : "Reconnect to verify a package",
                systemImage: auth.networkActionsAllowed ? "checkmark.icloud.fill" : "icloud.slash"
            )
            .font(.caption.weight(.semibold))
            .foregroundStyle(auth.networkActionsAllowed ? .green : .orange)
        }
        .captureCard()
        .accessibilityIdentifier("CaptureNestPortabilityBoundary")
    }

    private var destinationCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Owner Nest", systemImage: "house.and.flag")
                .font(.headline)

            if client.operation == .loadingProjects {
                ProgressView("Loading owned Nests…")
                    .frame(maxWidth: .infinity, alignment: .leading)
            } else if client.projects.isEmpty {
                Text("No owned Nest is available to this account. Editors and viewers cannot export or restore a complete private package.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                Picker(
                    "Nest",
                    selection: Binding(
                        get: { client.selectedProjectID ?? client.projects[0].id },
                        set: { client.selectProject($0) }
                    )
                ) {
                    ForEach(client.projects) { project in
                        Text(project.name).tag(project.id)
                    }
                }
                .pickerStyle(.menu)
                .accessibilityIdentifier("CaptureNestPortabilityProjectPicker")
            }
        }
        .captureCard()
    }

    private var exportCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Create verified backup", systemImage: "arrow.down.doc.fill")
                .font(.headline)
            Text("Nest recomputes the SHA-256 manifest and creates inspectable JSON. The protected phone copy stays private until you share it.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                Task { await client.exportSelectedNest(usesPreviewData: usesPreviewData) }
            } label: {
                Label(
                    client.operation == .exporting ? "Creating backup…" : "Create verified backup",
                    systemImage: "externaldrive.badge.plus"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(client.isBusy || client.selectedProject == nil || !auth.networkActionsAllowed || usesPreviewData)
            .accessibilityIdentifier("CaptureNestExportButton")

            if let exportedFileURL = client.exportedFileURL {
                ShareLink(
                    item: exportedFileURL,
                    subject: Text("Quipsly Nest backup")
                ) {
                    Label("Share backup", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .accessibilityHint("Opens the share sheet for the protected JSON package created on this iPhone.")
                .accessibilityIdentifier("CaptureNestShareBackup")

                Text(exportedFileURL.lastPathComponent)
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
                    .accessibilityIdentifier("CaptureNestExportFilename")
            }
        }
        .captureCard()
    }

    private var restoreCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Preview, then restore", systemImage: "arrow.triangle.2.circlepath.doc.on.clipboard")
                .font(.headline)
            Text("Choose a Quipsly Nest JSON package. Validation is read-only. Apply creates deterministic private copies and reuses them on retry; it never replaces a destination record.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                showsImporter = true
            } label: {
                Label(
                    client.importedFileName ?? "Choose Nest JSON package",
                    systemImage: "doc.badge.plus"
                )
                .frame(maxWidth: .infinity)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
            }
            .buttonStyle(.bordered)
            .disabled(client.isBusy)
            .accessibilityIdentifier("CaptureNestChooseRestorePackage")

            if let importedByteCount = client.importedByteCount {
                Text(ByteCountFormatter.string(fromByteCount: Int64(importedByteCount), countStyle: .file))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Button {
                Task { await client.validateRestore(usesPreviewData: usesPreviewData) }
            } label: {
                Text(client.operation == .validating ? "Validating…" : "Validate restore plan")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
            .disabled(
                client.isBusy
                    || client.importedFileName == nil
                    || client.selectedProject == nil
                    || !auth.networkActionsAllowed
                    || usesPreviewData
            )
            .accessibilityIdentifier("CaptureNestValidateRestore")

            noticeContent

            if let plan = client.restorePlan {
                restorePlanCard(plan)
            }

            if let receipt = client.appliedReceipt {
                Label(
                    "Integrity recomputed · applied \(receipt.appliedAt)",
                    systemImage: "checkmark.seal.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.green)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CaptureNestRestoreReceipt")
            }

            Divider()
            Text("Not included: recordings and media bytes, Sessions, collaborators' assignments, credentials, provider data, notifications, or external calendar events.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .captureCard()
    }

    @ViewBuilder
    private var noticeContent: some View {
        if let errorMessage = client.errorMessage {
            Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.red)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CaptureNestPortabilityError")
        } else if let statusMessage = client.statusMessage {
            Label(statusMessage, systemImage: "info.circle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CaptureNestPortabilityStatus")
        }
    }

    private func restorePlanCard(_ plan: CaptureNestRestorePlan) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Verified no-overwrite plan", systemImage: "checkmark.shield.fill")
                .font(.subheadline.weight(.bold))
                .foregroundStyle(.blue)
            Text("SHA-256 \(plan.manifestSha256)")
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
                .textSelection(.enabled)

            LabeledContent("Vocabulary", value: "\(plan.tagCreates) tags · \(plan.aliasCreates) aliases")
            LabeledContent("Notes", value: "\(plan.noteCreates) notes · \(plan.blockCreates) blocks")
            LabeledContent("Exact anchors", value: "\(plan.spanCreates)")
            LabeledContent("Tasks", value: "\(plan.taskCreates) new · \(plan.taskReuses) reused")
            LabeledContent("Goals", value: "\(plan.goalCreates) new · \(plan.goalReuses) reused")
            LabeledContent("Focus history", value: "\(plan.planBlockCreates) new · \(plan.planBlockReuses) reused")
            LabeledContent("Deferred alerts", value: "\(plan.remindersDeferred + plan.recurrenceSeriesDeferred)")

            Text("\(plan.overwrites) overwrites · \(plan.sourceMutations) source mutations · \(plan.externalSideEffects) external effects")
                .font(.caption.weight(.bold))
                .foregroundStyle(plan.isSafeToApply ? .green : .red)
                .fixedSize(horizontal: false, vertical: true)

            Button {
                showsApplyConfirmation = true
            } label: {
                Text(client.operation == .applying ? "Restoring…" : client.appliedReceipt == nil ? "Apply verified restore" : "Restore confirmed")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.blue)
            .disabled(client.isBusy || !plan.isSafeToApply || client.appliedReceipt != nil || !auth.networkActionsAllowed)
            .accessibilityIdentifier("CaptureNestApplyRestore")
        }
        .padding(14)
        .background(.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureNestVerifiedRestorePlan")
    }

    private var applyConfirmationMessage: String {
        guard let project = client.selectedProject,
              let plan = client.restorePlan else {
            return "Return to the verified plan before restoring."
        }
        return "Create \(plan.noteCreates) notes, \(plan.taskCreates) tasks, \(plan.goalCreates) goals, and \(plan.tagCreates) tags in \(project.name)? Existing records will not be overwritten. Notifications, recurrence, and calendar effects stay inactive."
    }
}
