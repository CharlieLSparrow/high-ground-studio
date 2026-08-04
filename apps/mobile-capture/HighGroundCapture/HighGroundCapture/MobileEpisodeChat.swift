import Combine
import CryptoKit
import SwiftUI

struct MobileChatPersistedLiveHint: Codable, Hashable {
    static let schemaVersion = "quipsly-chat-persisted-hint.v1"
    static let topic = "quipsly.chat.persisted.v1"
    private static let allowedKeys: Set<String> = [
        "schema", "threadKey", "messageId", "persistedAt",
    ]

    let schema: String
    let threadKey: String
    let messageId: String
    let persistedAt: String

    var hasValidShape: Bool {
        schema == Self.schemaVersion
            && Self.safeIdentifier(threadKey, includesColon: true)
            && Self.safeIdentifier(messageId, includesColon: false)
            && Self.parseDate(persistedAt) != nil
    }

    static func episodeThreadKey(_ episodeSlug: String?) -> String? {
        let slug = episodeSlug?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let key = "episode:\(slug)"
        return !slug.isEmpty && safeIdentifier(key, includesColon: true) ? key : nil
    }

    static func sessionThreadKey(_ callRoomID: String?) -> String? {
        let roomID = callRoomID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let key = "session:\(roomID)"
        return !roomID.isEmpty && safeIdentifier(key, includesColon: true) ? key : nil
    }

    static func decodeStrict(_ data: Data) -> Self? {
        guard data.count >= 2, data.count <= 2_048,
              let object = try? JSONSerialization.jsonObject(with: data),
              let dictionary = object as? [String: Any],
              Set(dictionary.keys) == allowedKeys,
              let hint = try? JSONDecoder().decode(Self.self, from: data),
              hint.hasValidShape else { return nil }
        return hint
    }

    private static func safeIdentifier(_ value: String, includesColon: Bool) -> Bool {
        guard !value.isEmpty, value.count <= 192 else { return false }
        let pattern = includesColon
            ? #"^[a-zA-Z0-9:_-]+$"#
            : #"^[a-zA-Z0-9_-]+$"#
        return value.range(of: pattern, options: .regularExpression) != nil
    }

    private static func parseDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value)
            ?? ISO8601DateFormatter().date(from: value)
    }
}

private struct MobileEpisodeChatCache: Codable {
    let schemaVersion: Int
    let ownerDigest: String
    let projectSlug: String
    let episodeSlug: String
    let savedAt: Date
    let threadTitle: String
    let messages: [NestChatMessage]
}

@MainActor
final class MobileEpisodeChatClient: ObservableObject {
    @Published private(set) var messages: [NestChatMessage] = []
    @Published private(set) var threadTitle = "Episode thread"
    @Published private(set) var canEdit = false
    @Published private(set) var isLoading = false
    @Published private(set) var isSending = false
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var protectedCacheSavedAt: Date?
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var outboundLiveHint: MobileChatPersistedLiveHint?

    private let baseURL: URL
    private var currentContextKey: String?
    private var pollingTask: Task<Void, Never>?
    private var accountCancellable: AnyCancellable?
    private var pendingMessageBody: String?
    private var pendingMessageID: UUID?
    private var pollingDisabledForMissingThread = false
    private var lastReceivedLiveMessageID: String?

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

    var latestMessage: NestChatMessage? {
        messages.last(where: { $0.authorEmail != "quipsly@nest.system" })
            ?? messages.last
    }

    func loadPreview(session: MobileCaptureSession) {
        reset()
        currentContextKey = "preview|\(session.id)"
        let now = ISO8601DateFormatter().string(from: Date())
        threadTitle = "The Swear Jar Chat"
        messages = [
            NestChatMessage(
                id: "preview-chat-1",
                authorEmail: "charlie@example.test",
                authorName: "Charlie",
                body: "Be Curious is first. Pause after the darts line so we can react before the clip resolves.",
                gifUrl: nil,
                createdAt: now
            ),
            NestChatMessage(
                id: "preview-chat-2",
                authorEmail: "homer@example.test",
                authorName: "Homer",
                body: "Ready. I’ll open with the swear jar story, then you cue the clip.",
                gifUrl: nil,
                createdAt: now
            ),
        ]
        canEdit = false
        statusMessage = "2 rehearsal messages"
    }

    func load(
        session: MobileCaptureSession,
        forceRefresh: Bool = false,
        quietly: Bool = false
    ) async {
        guard let context = context(for: session) else {
            reset()
            errorMessage = "This Session is not attached to a valid episode thread."
            return
        }
        if currentContextKey != context.key {
            reset()
            currentContextKey = context.key
            _ = restoreProtectedCache(context: context)
        }
        if forceRefresh {
            pollingDisabledForMissingThread = false
        } else if quietly, pollingDisabledForMissingThread {
            return
        }
        guard !isLoading else { return }
        guard AuthManager.shared.networkActionsAllowed else {
            if !messages.isEmpty {
                isUsingProtectedCache = true
                statusMessage = "Protected offline copy"
                errorMessage = nil
            } else if !quietly {
                errorMessage = "Connect to Nest once to protect this episode thread for offline reading."
            }
            return
        }

        if !quietly { isLoading = true }
        defer { if !quietly { isLoading = false } }
        do {
            var components = URLComponents(
                url: context.endpoint,
                resolvingAgainstBaseURL: false
            )
            components?.queryItems = [
                URLQueryItem(name: "projectSlug", value: context.projectSlug),
                URLQueryItem(name: "episodeSlug", value: context.episodeSlug),
            ]
            guard let url = components?.url else { throw URLError(.badURL) }
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.cachePolicy = forceRefresh
                ? .reloadIgnoringLocalAndRemoteCacheData
                : .reloadRevalidatingCacheData
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request
            )
            guard Self.isSameOrigin(response.url, baseURL) else {
                throw Self.error(
                    "The protected episode thread response left the configured Nest origin.",
                    code: response.statusCode
                )
            }
            let payload = try JSONDecoder().decode(
                NestChatLoadResponse.self,
                from: data
            )
            guard response.statusCode < 400,
                  payload.ok,
                  payload.episode?.slug == context.episodeSlug else {
                throw Self.error(
                    payload.error ?? "The episode thread is unavailable.",
                    code: response.statusCode
                )
            }

            messages = Array((payload.messages ?? []).suffix(200))
            threadTitle = payload.thread?.title ?? "Episode thread"
            canEdit = ["OWNER", "EDITOR"].contains(
                payload.actor?.role?.uppercased() ?? ""
            )
            isUsingProtectedCache = false
            errorMessage = nil
            statusMessage = messages.isEmpty
                ? "Start the episode conversation"
                : "\(messages.count) \(messages.count == 1 ? "message" : "messages")"
            persist(context: context)
        } catch {
            let responseCode = (error as NSError).code
            if messages.isEmpty {
                _ = restoreProtectedCache(context: context)
            }
            if responseCode == 404 {
                pollingDisabledForMissingThread = true
                canEdit = false
                statusMessage = messages.isEmpty
                    ? "Episode thread unavailable"
                    : "Episode thread unavailable · protected copy"
            }
            if !messages.isEmpty {
                isUsingProtectedCache = true
                if responseCode != 404 {
                    statusMessage = quietly
                        ? statusMessage
                        : "Nest is unavailable · protected offline copy"
                }
                if !quietly { errorMessage = nil }
            } else if !quietly {
                errorMessage = error.localizedDescription
            }
        }
    }

    func startPolling(session: MobileCaptureSession) {
        stopPolling()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled, let self else { return }
                guard !self.pollingDisabledForMissingThread else { return }
                await self.load(session: session, quietly: true)
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    @discardableResult
    func send(session: MobileCaptureSession, body: String) async -> Bool {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              trimmed.count <= 4_000,
              canEdit,
              !isSending,
              AuthManager.shared.networkActionsAllowed,
              let context = context(for: session) else {
            return false
        }
        let requestID: UUID
        if pendingMessageBody == trimmed, let pendingMessageID {
            requestID = pendingMessageID
        } else {
            requestID = UUID()
            pendingMessageBody = trimmed
            pendingMessageID = requestID
        }

        isSending = true
        errorMessage = nil
        defer { isSending = false }
        do {
            var request = URLRequest(url: context.endpoint)
            request.httpMethod = "POST"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "projectSlug": context.projectSlug,
                "episodeSlug": context.episodeSlug,
                "body": trimmed,
                "clientMessageId": requestID.uuidString.lowercased(),
                "clientSurface": "capture-ios",
            ])
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request
            )
            guard Self.isSameOrigin(response.url, baseURL) else {
                throw Self.error(
                    "The protected message response left the configured Nest origin.",
                    code: response.statusCode
                )
            }
            let payload = try JSONDecoder().decode(
                NestChatPostResponse.self,
                from: data
            )
            guard response.statusCode < 400,
                  payload.ok,
                  let message = payload.message else {
                throw Self.error(
                    payload.error ?? "The message could not be sent.",
                    code: response.statusCode
                )
            }
            if !messages.contains(where: { $0.id == message.id }) {
                messages.append(message)
                messages = Array(messages.suffix(200))
            }
            pendingMessageBody = nil
            pendingMessageID = nil
            if let threadKey = MobileChatPersistedLiveHint.episodeThreadKey(
                context.episodeSlug
            ) {
                outboundLiveHint = MobileChatPersistedLiveHint(
                    schema: MobileChatPersistedLiveHint.schemaVersion,
                    threadKey: threadKey,
                    messageId: message.id,
                    persistedAt: message.createdAt
                )
            }
            isUsingProtectedCache = false
            statusMessage = "\(messages.count) \(messages.count == 1 ? "message" : "messages")"
            errorMessage = nil
            persist(context: context)
            return true
        } catch {
            errorMessage = error.localizedDescription
            statusMessage = "Message preserved for retry"
            return false
        }
    }

    func receiveLiveHint(
        _ hint: MobileChatPersistedLiveHint,
        session: MobileCaptureSession
    ) async {
        guard hint.hasValidShape,
              hint.messageId != lastReceivedLiveMessageID,
              let context = context(for: session),
              hint.threadKey == MobileChatPersistedLiveHint.episodeThreadKey(
                context.episodeSlug
              ) else { return }
        lastReceivedLiveMessageID = hint.messageId
        await load(session: session, forceRefresh: true, quietly: true)
    }

    static func clearProtectedCache() {
        guard let root = protectedCacheRoot() else { return }
        try? FileManager.default.removeItem(at: root)
    }

    private struct Context {
        let key: String
        let projectSlug: String
        let episodeSlug: String
        let endpoint: URL
    }

    private func context(for session: MobileCaptureSession) -> Context? {
        guard let projectSlug = Self.safeSlug(session.projectSlug),
              let episodeSlug = Self.safeSlug(session.episodeSlug) else {
            return nil
        }
        let endpoint = baseURL
            .appendingPathComponent("api", isDirectory: true)
            .appendingPathComponent("nest-chat", isDirectory: false)
        return Context(
            key: "\(projectSlug)|\(episodeSlug)",
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            endpoint: endpoint
        )
    }

    private func reset() {
        stopPolling()
        currentContextKey = nil
        messages = []
        threadTitle = "Episode thread"
        canEdit = false
        isLoading = false
        isSending = false
        isUsingProtectedCache = false
        protectedCacheSavedAt = nil
        statusMessage = nil
        errorMessage = nil
        pendingMessageBody = nil
        pendingMessageID = nil
        pollingDisabledForMissingThread = false
        outboundLiveHint = nil
        lastReceivedLiveMessageID = nil
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
            let cache = try decoder.decode(MobileEpisodeChatCache.self, from: data)
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
            threadTitle = cache.threadTitle
            messages = cache.messages
            canEdit = false
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
              let url = cacheURL(context: context, owner: owner) else { return }
        let savedAt = Date()
        let cache = MobileEpisodeChatCache(
            schemaVersion: 1,
            ownerDigest: Self.digest(owner.ownerAccountID),
            projectSlug: context.projectSlug,
            episodeSlug: context.episodeSlug,
            savedAt: savedAt,
            threadTitle: threadTitle,
            messages: messages
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
            print("Protected episode chat cache could not be updated: \(error.localizedDescription)")
        }
    }

    private func cacheURL(
        context: Context,
        owner: AuthManager.StableOwnerSnapshot
    ) -> URL? {
        Self.protectedCacheRoot()?
            .appendingPathComponent(Self.digest(owner.ownerAccountID), isDirectory: true)
            .appendingPathComponent(Self.digest(context.projectSlug), isDirectory: true)
            .appendingPathComponent("\(Self.digest(context.episodeSlug)).json")
    }

    nonisolated private static func protectedCacheRoot() -> URL? {
        FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first?
            .appendingPathComponent(
                "QuipslyCapture/EpisodeChat",
                isDirectory: true
            )
    }

    nonisolated private static func safeSlug(_ input: String?) -> String? {
        let value = input?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased() ?? ""
        guard !value.isEmpty,
              value.count <= 120,
              value.range(of: #"^[a-z0-9][a-z0-9_-]*$"#, options: .regularExpression) != nil else {
            return nil
        }
        return value
    }

    nonisolated private static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
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

    nonisolated private static func error(_ message: String, code: Int) -> NSError {
        NSError(
            domain: "MobileEpisodeChat",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

struct MobileEpisodeChatCard: View {
    @ObservedObject var client: MobileEpisodeChatClient
    let session: MobileCaptureSession
    let previewOnly: Bool
    @State private var isPresented = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 10) {
                    heading
                    Spacer()
                    status
                }
                VStack(alignment: .leading, spacing: 6) {
                    heading
                    status
                }
            }

            if client.isLoading && client.messages.isEmpty {
                ProgressView("Loading episode thread…")
            } else if let latest = client.latestMessage {
                Text(latest.authorName ?? latest.authorEmail ?? "Collaborator")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tint)
                Text(latest.body)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureEpisodeChatLatestMessage")
            } else {
                Text("Keep writing, recording, editing, and publishing decisions with this exact episode.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Button {
                isPresented = true
            } label: {
                Label("Open episode thread", systemImage: "bubble.left.and.bubble.right.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(client.isLoading && client.messages.isEmpty)
            .accessibilityIdentifier("CaptureEpisodeChatOpenButton")

            if let errorMessage = client.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("CaptureEpisodeChatError")
            }
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureEpisodeChatCard")
        .sheet(isPresented: $isPresented) {
            MobileEpisodeChatThread(
                client: client,
                session: session,
                previewOnly: previewOnly
            )
        }
    }

    private var heading: some View {
        Label("Episode thread", systemImage: "person.2.fill")
            .font(.headline)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var status: some View {
        Text(client.isUsingProtectedCache ? "Offline copy" : (client.statusMessage ?? "Nest chat"))
            .font(.caption.weight(.semibold))
            .foregroundStyle(client.isUsingProtectedCache ? .orange : .secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("CaptureEpisodeChatStatus")
    }
}

private struct MobileEpisodeChatThread: View {
    @ObservedObject var client: MobileEpisodeChatClient
    let session: MobileCaptureSession
    let previewOnly: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            boundary
                            ForEach(client.messages) { message in
                                messageCard(message)
                                    .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .onChange(of: client.messages.count) {
                        guard let last = client.messages.last else { return }
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }

                composer
            }
            .background(MobileStudioBackground())
            .navigationTitle(client.threadTitle)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
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
                    .accessibilityLabel("Refresh episode thread")
                    .accessibilityIdentifier("CaptureEpisodeChatRefreshButton")
                }
            }
        }
        .accessibilityIdentifier("CaptureEpisodeChatThread")
    }

    private var boundary: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(
                client.isUsingProtectedCache
                    ? "Protected offline copy"
                    : "Canonical episode conversation",
                systemImage: client.isUsingProtectedCache
                    ? "lock.bubble.left.fill"
                    : "checkmark.seal.fill"
            )
            .font(.subheadline.weight(.bold))
            Text("Posts stay with this episode. Recording and playback never start from chat.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("CaptureEpisodeChatBoundary")
    }

    private func messageCard(_ message: NestChatMessage) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline) {
                Text(message.authorName ?? message.authorEmail ?? "Collaborator")
                    .font(.subheadline.weight(.bold))
                Spacer()
                Text(Self.formattedTime(message.createdAt))
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            if !message.body.isEmpty {
                Text(message.body)
                    .font(.body)
                    .textSelection(.enabled)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if message.gifUrl != nil {
                Label("Shared GIF · open Nest to view", systemImage: "photo")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            Color.secondary.opacity(0.08),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("CaptureEpisodeChatMessage_\(message.id)")
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let errorMessage = client.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField(
                    client.canEdit ? "Message the episode team" : "View-only episode thread",
                    text: $draft,
                    axis: .vertical
                )
                .lineLimit(2 ... 6)
                .textFieldStyle(.roundedBorder)
                .disabled(!client.canEdit || previewOnly)
                .accessibilityIdentifier("CaptureEpisodeChatComposer")

                Button {
                    let body = draft
                    Task {
                        if await client.send(session: session, body: body) {
                            draft = ""
                        }
                    }
                } label: {
                    if client.isSending {
                        ProgressView()
                    } else {
                        Image(systemName: "paperplane.fill")
                    }
                }
                .buttonStyle(.borderedProminent)
                .disabled(
                    draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || !client.canEdit
                        || client.isSending
                        || previewOnly
                )
                .accessibilityLabel("Send episode message")
                .accessibilityIdentifier("CaptureEpisodeChatSendButton")
            }
            Text("A failed send keeps this draft and reuses the same message identity on retry.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.regularMaterial)
    }

    nonisolated private static func formattedTime(_ value: String) -> String {
        guard let date = ISO8601DateFormatter().date(from: value) else {
            return value
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
