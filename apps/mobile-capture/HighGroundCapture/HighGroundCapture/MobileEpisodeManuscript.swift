import Combine
import CryptoKit
import SwiftUI

struct MobileEpisodeManuscriptBlock: Codable, Hashable, Identifiable {
    let id: String
    let stableId: String
    let order: Int
    let title: String?
    let body: String
}

struct MobileEpisodeManuscriptEpisode: Codable, Hashable {
    let id: String
    let slug: String
    let title: String
    let status: String
    let updatedAt: String
    let documentId: String
    let documentTitle: String

    var displayTitle: String {
        let canonicalDocumentTitle = documentTitle.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return canonicalDocumentTitle.isEmpty ? title : canonicalDocumentTitle
    }
}

struct MobileEpisodeManuscriptWriting: Codable, Hashable {
    let version: String
    let updatedAt: String
    let blockCount: Int
    let visibleBlockCount: Int
    let truncated: Bool
    let textBlocks: [MobileEpisodeManuscriptBlock]?
}

private struct MobileEpisodeManuscriptResponse: Codable {
    let ok: Bool
    let code: String?
    let error: String?
    let episode: MobileEpisodeManuscriptEpisode?
    let writing: MobileEpisodeManuscriptWriting?
    let canEdit: Bool?
    let serverNow: String?
}

private struct MobileEpisodeManuscriptCache: Codable {
    let schemaVersion: Int
    let ownerDigest: String
    let projectSlug: String
    let episodeSlug: String
    let savedAt: Date
    let episode: MobileEpisodeManuscriptEpisode
    let writing: MobileEpisodeManuscriptWriting
    let blocks: [MobileEpisodeManuscriptBlock]
}

@MainActor
final class MobileEpisodeManuscriptClient: ObservableObject {
    @Published private(set) var episode: MobileEpisodeManuscriptEpisode?
    @Published private(set) var writing: MobileEpisodeManuscriptWriting?
    @Published private(set) var blocks: [MobileEpisodeManuscriptBlock] = []
    @Published private(set) var canEdit = false
    @Published private(set) var isLoading = false
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var protectedCacheSavedAt: Date?
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?

    private let baseURL: URL
    private var currentContextKey: String?
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
            Task { @MainActor in self?.reset() }
        }
    }

    var hasReadableCopy: Bool { episode != nil && !blocks.isEmpty }
    var displayTitle: String {
        for block in blocks.prefix(3) {
            if let heading = Self.manuscriptHeading(block) {
                return heading
            }
        }
        return episode?.displayTitle ?? "Episode script"
    }

    func loadPreview(session: MobileCaptureSession) {
        reset()
        currentContextKey = "preview|\(session.id)"
        let now = ISO8601DateFormatter().string(from: Date())
        episode = MobileEpisodeManuscriptEpisode(
            id: "preview-swear-jar",
            slug: session.episodeSlug ?? "the-swear-jar",
            title: "The Swear Jar",
            status: "READY_TO_RECORD",
            updatedAt: now,
            documentId: "preview-hgo-document",
            documentTitle: "The Swear Jar"
        )
        blocks = [
            MobileEpisodeManuscriptBlock(
                id: "preview-1",
                stableId: "preview-title",
                order: 1,
                title: "**THE SWEAR JAR**",
                body: "High Ground Odyssey episode rehearsal manuscript."
            ),
            MobileEpisodeManuscriptBlock(
                id: "preview-2",
                stableId: "preview-opening-homer",
                order: 2,
                title: "Homer",
                body: "Open with the personal story and establish why the idea matters."
            ),
            MobileEpisodeManuscriptBlock(
                id: "preview-3",
                stableId: "preview-response-charlie",
                order: 3,
                title: "Charlie",
                body: "Respond, sharpen the question, and set up the first shared clip."
            ),
            MobileEpisodeManuscriptBlock(
                id: "preview-4",
                stableId: "preview-clip-be-curious",
                order: 4,
                title: "Clip · Be Curious",
                body: "Watch together, then pause before the conversation resumes."
            ),
            MobileEpisodeManuscriptBlock(
                id: "preview-5",
                stableId: "preview-discussion",
                order: 5,
                title: "Discussion",
                body: "Connect the clip to the episode’s central argument and invite disagreement."
            ),
        ]
        writing = MobileEpisodeManuscriptWriting(
            version: "preview-swear-jar-v1",
            updatedAt: now,
            blockCount: 34,
            visibleBlockCount: 34,
            truncated: false,
            textBlocks: nil
        )
        canEdit = true
        isUsingProtectedCache = false
        protectedCacheSavedAt = nil
        statusMessage = "The 34-block rehearsal script is available on this iPhone."
        errorMessage = nil
    }

    func load(session: MobileCaptureSession, forceRefresh: Bool = false) async {
        guard let context = context(for: session) else {
            reset()
            errorMessage = "This Session is not attached to a valid episode script."
            return
        }
        if currentContextKey != context.key {
            reset()
            currentContextKey = context.key
            _ = restoreProtectedCache(context: context)
        }
        guard !isLoading else { return }
        guard AuthManager.shared.networkActionsAllowed else {
            if hasReadableCopy {
                isUsingProtectedCache = true
                statusMessage = "Protected offline copy"
                errorMessage = nil
            } else {
                errorMessage = "Connect to Nest once to protect this episode script for offline reading."
            }
            return
        }

        isLoading = true
        defer { isLoading = false }
        do {
            var components = URLComponents(
                url: context.endpoint,
                resolvingAgainstBaseURL: false
            )
            var queryItems = [
                URLQueryItem(name: "episode", value: context.episodeSlug),
                URLQueryItem(name: "writing", value: "1"),
            ]
            if !forceRefresh, let version = writing?.version, !version.isEmpty {
                queryItems.append(URLQueryItem(name: "writingVersion", value: version))
            }
            components?.queryItems = queryItems
            guard let url = components?.url else { throw URLError(.badURL) }
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request
            )
            guard Self.isSameOrigin(response.url, baseURL) else {
                throw NSError(
                    domain: "MobileEpisodeManuscript",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "The protected manuscript response left the configured Nest origin."
                    ]
                )
            }
            let payload = try JSONDecoder().decode(
                MobileEpisodeManuscriptResponse.self,
                from: data
            )
            guard response.statusCode < 400,
                  payload.ok,
                  let nextEpisode = payload.episode,
                  let nextWriting = payload.writing else {
                throw NSError(
                    domain: "MobileEpisodeManuscript",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            payload.error ?? "The episode script is unavailable."
                    ]
                )
            }

            let nextBlocks: [MobileEpisodeManuscriptBlock]
            if let deliveredBlocks = nextWriting.textBlocks {
                nextBlocks = deliveredBlocks
            } else if nextWriting.version == writing?.version {
                nextBlocks = blocks
            } else {
                throw NSError(
                    domain: "MobileEpisodeManuscript",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "Nest returned new script metadata without the matching canonical blocks."
                    ]
                )
            }
            guard nextWriting.blockCount == 0 || !nextBlocks.isEmpty else {
                throw NSError(
                    domain: "MobileEpisodeManuscript",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "Nest did not return the canonical episode script blocks."
                    ]
                )
            }

            episode = nextEpisode
            writing = MobileEpisodeManuscriptWriting(
                version: nextWriting.version,
                updatedAt: nextWriting.updatedAt,
                blockCount: nextWriting.blockCount,
                visibleBlockCount: nextWriting.visibleBlockCount,
                truncated: nextWriting.truncated,
                textBlocks: nil
            )
            blocks = nextBlocks
            canEdit = payload.canEdit == true
            isUsingProtectedCache = false
            errorMessage = nil
            statusMessage = nextWriting.truncated
                ? "Showing \(nextBlocks.count) of \(nextWriting.blockCount) blocks."
                : "\(nextWriting.blockCount) blocks · protected on this iPhone"
            persist(context: context)
        } catch {
            if !hasReadableCopy {
                _ = restoreProtectedCache(context: context)
            }
            isUsingProtectedCache = hasReadableCopy
            errorMessage = hasReadableCopy
                ? nil
                : error.localizedDescription
            statusMessage = hasReadableCopy
                ? "Nest is unavailable · protected offline copy"
                : nil
        }
    }

    func editorURL(for session: MobileCaptureSession) -> URL? {
        guard let projectSlug = Self.safePathSlug(session.projectSlug),
              let episodeSlug = Self.safePathSlug(session.episodeSlug),
              var components = URLComponents(
                url: baseURL,
                resolvingAgainstBaseURL: false
              ) else { return nil }
        components.path = "/nests/\(projectSlug)/episodes/\(episodeSlug)"
        components.queryItems = nil
        return components.url
    }

    static func clearProtectedCache() {
        guard let root = protectedCacheRoot() else { return }
        try? FileManager.default.removeItem(at: root)
    }

    private func reset() {
        currentContextKey = nil
        episode = nil
        writing = nil
        blocks = []
        canEdit = false
        isLoading = false
        isUsingProtectedCache = false
        protectedCacheSavedAt = nil
        statusMessage = nil
        errorMessage = nil
    }

    private struct Context {
        let key: String
        let projectSlug: String
        let episodeSlug: String
        let endpoint: URL
    }

    private func context(for session: MobileCaptureSession) -> Context? {
        guard let projectSlug = Self.safePathSlug(session.projectSlug),
              let episodeSlug = Self.safePathSlug(session.episodeSlug) else {
            return nil
        }
        let endpoint = baseURL
            .appendingPathComponent("api", isDirectory: true)
            .appendingPathComponent("nests", isDirectory: true)
            .appendingPathComponent(projectSlug, isDirectory: true)
            .appendingPathComponent("episode-room", isDirectory: false)
        return Context(
            key: "\(projectSlug)|\(episodeSlug)",
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            endpoint: endpoint
        )
    }

    @discardableResult
    private func restoreProtectedCache(context: Context) -> Bool {
        guard let owner = AuthManager.shared.stableOwnerSnapshot(),
              let url = cacheURL(context: context, owner: owner),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe) else {
            return false
        }
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let cache = try decoder.decode(
                MobileEpisodeManuscriptCache.self,
                from: data
            )
            let age = Date().timeIntervalSince(cache.savedAt)
            guard cache.schemaVersion == 1,
                  cache.ownerDigest == Self.digest(owner.ownerAccountID),
                  cache.projectSlug == context.projectSlug,
                  cache.episodeSlug == context.episodeSlug,
                  age >= 0,
                  age <= 30 * 24 * 60 * 60 else {
                try? FileManager.default.removeItem(at: url)
                return false
            }
            episode = cache.episode
            writing = cache.writing
            blocks = cache.blocks
            protectedCacheSavedAt = cache.savedAt
            isUsingProtectedCache = true
            statusMessage = "Protected offline copy"
            errorMessage = nil
            return true
        } catch {
            try? FileManager.default.removeItem(at: url)
            return false
        }
    }

    private func persist(context: Context) {
        guard AuthManager.shared.networkActionsAllowed,
              let owner = AuthManager.shared.stableOwnerSnapshot(),
              let episode,
              let writing,
              let url = cacheURL(context: context, owner: owner) else { return }
        let savedAt = Date()
        let cache = MobileEpisodeManuscriptCache(
            schemaVersion: 1,
            ownerDigest: Self.digest(owner.ownerAccountID),
            projectSlug: context.projectSlug,
            episodeSlug: context.episodeSlug,
            savedAt: savedAt,
            episode: episode,
            writing: writing,
            blocks: blocks
        )
        do {
            let directory = url.deletingLastPathComponent()
            try FileManager.default.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.complete]
            )
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: directory.path
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            try encoder.encode(cache).write(
                to: url,
                options: [.atomic, .completeFileProtection]
            )
            try FileManager.default.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: url.path
            )
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableURL = url
            try mutableURL.setResourceValues(values)
            protectedCacheSavedAt = savedAt
        } catch {
            print("Protected manuscript cache could not be updated: \(error.localizedDescription)")
        }
    }

    private func cacheURL(
        context: Context,
        owner: AuthManager.StableOwnerSnapshot
    ) -> URL? {
        Self.protectedCacheRoot()?
            .appendingPathComponent(
                Self.digest(owner.ownerAccountID),
                isDirectory: true
            )
            .appendingPathComponent(
                Self.digest(context.projectSlug),
                isDirectory: true
            )
            .appendingPathComponent(
                "\(Self.digest(context.episodeSlug)).json",
                isDirectory: false
            )
    }

    nonisolated private static func protectedCacheRoot() -> URL? {
        FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first?
            .appendingPathComponent("QuipslyCapture", isDirectory: true)
            .appendingPathComponent("EpisodeManuscriptCache", isDirectory: true)
    }

    nonisolated private static func safePathSlug(_ value: String?) -> String? {
        guard let slug = value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              slug.range(
                of: #"^[A-Za-z0-9][A-Za-z0-9_-]{0,159}$"#,
                options: .regularExpression
              ) != nil else { return nil }
        return slug
    }

    nonisolated private static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    nonisolated private static func manuscriptHeading(
        _ block: MobileEpisodeManuscriptBlock
    ) -> String? {
        let firstBodyLine = block.body
            .split(separator: "\n", maxSplits: 1, omittingEmptySubsequences: true)
            .first
            .map(String.init)
        for candidate in [block.title, firstBodyLine] {
            if let heading = normalizedHeading(candidate) {
                return heading
            }
        }
        return nil
    }

    nonisolated private static func normalizedHeading(
        _ value: String?
    ) -> String? {
        guard let raw = value?
            .trimmingCharacters(in: .whitespacesAndNewlines),
              !raw.isEmpty else { return nil }
        let trimSet = CharacterSet.whitespacesAndNewlines.union(
            CharacterSet(charactersIn: "*#_")
        )
        let cleaned = raw.trimmingCharacters(in: trimSet)
        let words = cleaned.split(whereSeparator: \.isWhitespace)
        let letters = cleaned.filter(\.isLetter)
        let looksLikeHeading =
            words.count >= 2
            && (
                raw.contains("**")
                || (!letters.isEmpty && cleaned == cleaned.uppercased())
            )
        guard looksLikeHeading else { return nil }
        return cleaned == cleaned.uppercased()
            ? cleaned.localizedCapitalized
            : cleaned
    }

    nonisolated private static func isSameOrigin(
        _ candidate: URL?,
        _ expected: URL
    ) -> Bool {
        candidate?.scheme?.lowercased() == expected.scheme?.lowercased()
            && candidate?.host?.lowercased() == expected.host?.lowercased()
            && candidate?.port == expected.port
            && candidate?.user == nil
            && candidate?.password == nil
    }
}

struct MobileEpisodeManuscriptCard: View {
    @ObservedObject var client: MobileEpisodeManuscriptClient
    let session: MobileCaptureSession
    let previewOnly: Bool
    @State private var isPresented = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .center, spacing: 10) {
                    heading
                    Spacer()
                    status
                }
                VStack(alignment: .leading, spacing: 6) {
                    heading
                    status
                }
            }

            if client.episode != nil {
                Text(client.displayTitle)
                    .font(.title3.weight(.bold))
                    .accessibilityIdentifier("CaptureEpisodeManuscriptTitle")
                Text(summary)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else if client.isLoading {
                ProgressView("Loading canonical episode script…")
            } else {
                Text("Keep the canonical episode text beside the recorder, including when the network drops.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Button {
                isPresented = true
            } label: {
                Label(
                    client.hasReadableCopy ? "Read episode script" : "Load episode script",
                    systemImage: "doc.text.magnifyingglass"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(!client.hasReadableCopy && client.isLoading)
            .accessibilityHint("Opens a read-only copy of the canonical Nest manuscript.")
            .accessibilityIdentifier("CaptureEpisodeManuscriptOpenButton")

            if let errorMessage = client.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("CaptureEpisodeManuscriptError")
            }
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureEpisodeManuscriptCard")
        .sheet(isPresented: $isPresented) {
            MobileEpisodeManuscriptReader(
                client: client,
                session: session,
                previewOnly: previewOnly
            )
        }
    }

    private var heading: some View {
        Label("Episode script", systemImage: "doc.richtext")
            .font(.headline)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var status: some View {
        Text(client.isUsingProtectedCache ? "Offline copy" : "Nest manuscript")
            .font(.caption.weight(.semibold))
            .foregroundStyle(client.isUsingProtectedCache ? .orange : .secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("CaptureEpisodeManuscriptStatus")
    }

    private var summary: String {
        let count = client.writing?.blockCount ?? client.blocks.count
        if client.writing?.truncated == true {
            return "\(client.blocks.count) of \(count) blocks available · source stays unchanged"
        }
        return "\(count) \(count == 1 ? "block" : "blocks") · read-only on iPhone"
    }
}

private struct MobileEpisodeManuscriptReader: View {
    @ObservedObject var client: MobileEpisodeManuscriptClient
    let session: MobileCaptureSession
    let previewOnly: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 14) {
                    manuscriptBoundary
                    ForEach(filteredBlocks) { block in
                        VStack(alignment: .leading, spacing: 7) {
                            if let title = block.title?
                                .trimmingCharacters(in: .whitespacesAndNewlines),
                               !title.isEmpty {
                                Text(title)
                                    .font(.headline)
                                    .foregroundStyle(.tint)
                            }
                            Text(block.body)
                                .font(.body)
                                .textSelection(.enabled)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(14)
                        .background(
                            Color.secondary.opacity(0.08),
                            in: RoundedRectangle(
                                cornerRadius: 14,
                                style: .continuous
                            )
                        )
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier(
                            "CaptureEpisodeManuscriptBlock_\(block.stableId)"
                        )
                    }
                }
                .padding()
            }
            .navigationTitle(client.displayTitle)
            .navigationBarTitleDisplayMode(.inline)
            .searchable(
                text: $searchText,
                placement: .navigationBarDrawer(displayMode: .always),
                prompt: "Search this script"
            )
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItemGroup(placement: .primaryAction) {
                    if !previewOnly, let editorURL = client.editorURL(for: session) {
                        Link(destination: editorURL) {
                            Image(systemName: "rectangle.portrait.and.arrow.forward")
                        }
                        .accessibilityLabel("Open canonical episode in Nest")
                    }
                    Button {
                        Task {
                            await client.load(
                                session: session,
                                forceRefresh: true
                            )
                        }
                    } label: {
                        if client.isLoading {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(client.isLoading || previewOnly)
                    .accessibilityLabel("Refresh episode script")
                    .accessibilityIdentifier("CaptureEpisodeManuscriptRefreshButton")
                }
            }
        }
        .accessibilityIdentifier("CaptureEpisodeManuscriptReader")
    }

    private var manuscriptBoundary: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(
                client.isUsingProtectedCache
                    ? "Protected offline copy"
                    : "Canonical Nest manuscript",
                systemImage: client.isUsingProtectedCache
                    ? "lock.doc.fill"
                    : "checkmark.seal.fill"
            )
            .font(.subheadline.weight(.bold))
            Text("Read-only here. Refresh or open Nest to edit without creating a competing copy.")
                .font(.caption)
                .foregroundStyle(.secondary)
            if client.writing?.truncated == true {
                Text("This episode is longer than the mobile reading limit. Open Nest for the complete manuscript.")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("CaptureEpisodeManuscriptBoundary")
    }

    private var filteredBlocks: [MobileEpisodeManuscriptBlock] {
        let query = searchText.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !query.isEmpty else { return client.blocks }
        return client.blocks.filter {
            $0.body.localizedCaseInsensitiveContains(query)
                || ($0.title?.localizedCaseInsensitiveContains(query) == true)
        }
    }
}
