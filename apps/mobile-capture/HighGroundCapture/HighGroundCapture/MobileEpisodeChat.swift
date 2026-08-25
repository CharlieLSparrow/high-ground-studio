import Combine
import CryptoKit
import SwiftUI

struct MobileChatPersistedLiveHint: Codable, Hashable {
    static let schemaVersion = "quipsly-chat-persisted-hint.v1"
    // LiveKit delivers data messages through a nonisolated delegate callback.
    // This immutable wire identifier is safe to read there without hopping to
    // the UI actor; decoding and published state updates still occur on MainActor.
    nonisolated static let topic = "quipsly.chat.persisted.v1"
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

    static func engagementThreadKey(_ engagementID: String?) -> String? {
        let identifier = engagementID?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        let key = "engagement:\(identifier)"
        return !identifier.isEmpty && safeIdentifier(key, includesColon: true) ? key : nil
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

enum MobileCollaborationChatScope: String, Codable {
    case episode
    case session
    case engagement

    var title: String {
        switch self {
        case .episode: "Episode thread"
        case .session: "Session thread"
        case .engagement: "Coaching conversation"
        }
    }

    var conversationLabel: String {
        switch self {
        case .episode: "Canonical episode conversation"
        case .session: "Canonical take conversation"
        case .engagement: "Private coaching conversation"
        }
    }

    var openLabel: String {
        switch self {
        case .episode: "Open episode thread"
        case .session: "Open Session thread"
        case .engagement: "Open coaching conversation"
        }
    }

    var accessibilityPrefix: String {
        switch self {
        case .episode: "CaptureEpisodeChat"
        case .session: "CaptureSessionChat"
        case .engagement: "CaptureCoachingConversation"
        }
    }

    var openButtonAccessibilityIdentifier: String {
        switch self {
        case .episode: "CaptureEpisodeChatOpenButton"
        case .session: "CaptureSessionChatOpenButton"
        case .engagement: "CaptureCoachingConversationOpenButton"
        }
    }

    var startNoun: String {
        switch self {
        case .episode: "episode"
        case .session: "Session"
        case .engagement: "coaching"
        }
    }

    var composerPlaceholder: String {
        switch self {
        case .episode: "Message the episode team"
        case .session: "Message this Session"
        case .engagement: "Message this coaching space"
        }
    }

    var emptyExplanation: String {
        switch self {
        case .episode:
            "Keep writing, recording, editing, and publishing decisions with this exact episode."
        case .session:
            "Coordinate device checks, consent, this take, and immediate handoff with everyone in this exact Session."
        case .engagement:
            "Keep the conversation with this coaching relationship across every Session, note, task, and goal."
        }
    }

    var boundaryExplanation: String {
        switch self {
        case .episode:
            "Posts stay with this episode. Recording and playback never start from chat."
        case .session:
            "Posts stay with this exact call. They do not become notes, goals, or tasks, and chat never starts recording."
        case .engagement:
            "Only members of this coaching relationship can read these posts. Messages stay separate from shared notes, goals, tasks, and recording controls."
        }
    }
}

private struct MobileEpisodeChatCache: Codable {
    let schemaVersion: Int
    let ownerDigest: String
    let projectSlug: String
    let scope: MobileCollaborationChatScope?
    let scopeKey: String?
    let episodeSlug: String?
    let savedAt: Date
    let threadTitle: String
    let messages: [NestChatMessage]
}

@MainActor
final class MobileEpisodeChatClient: ObservableObject {
    @Published private(set) var messages: [NestChatMessage] = []
    @Published private(set) var threadTitle: String
    @Published private(set) var canEdit = false
    @Published private(set) var isLoading = false
    @Published private(set) var isSending = false
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var protectedCacheSavedAt: Date?
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var outboundLiveHint: MobileChatPersistedLiveHint?

    private let baseURL: URL
    let scope: MobileCollaborationChatScope
    private var currentContextKey: String?
    private var pollingTask: Task<Void, Never>?
    private var accountCancellable: AnyCancellable?
    private var pendingMessageBody: String?
    private var pendingMessageSchedulingEvidence: String?
    private var pendingMessageID: UUID?
    private var pollingDisabledForMissingThread = false
    private var lastReceivedLiveMessageID: String?

    init(scope: MobileCollaborationChatScope = .episode) {
        self.scope = scope
        threadTitle = scope.title
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
        threadTitle = scope == .episode
            ? "The Swear Jar Chat"
            : "Episode rehearsal · Session thread"
        messages = [
            NestChatMessage(
                id: "preview-chat-1",
                authorEmail: "charlie@example.test",
                authorName: "Charlie",
                body: scope == .episode
                    ? "Be Curious is first. Pause after the darts line so we can react before the clip resolves."
                    : "Canon and MV7i are checked. I’m ready to join and start the retained source separately.",
                gifUrl: nil,
                createdAt: now
            ),
            NestChatMessage(
                id: "preview-chat-2",
                authorEmail: "homer@example.test",
                authorName: "Homer",
                body: scope == .episode
                    ? "Ready. I’ll open with the swear jar story, then you cue the clip."
                    : "iPhone source is framed and consent is current. Call audio is not the retained recording.",
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
            errorMessage = scope == .episode
                ? "This Session is not attached to a valid episode thread."
                : "This Session is not attached to a valid Nest Session thread."
            return
        }
        await load(
            context: context,
            forceRefresh: forceRefresh,
            quietly: quietly
        )
    }

    func load(
        engagement: MobileCaptureCoachingEngagement,
        forceRefresh: Bool = false,
        quietly: Bool = false
    ) async {
        guard scope == .engagement,
              let context = context(for: engagement) else {
            reset()
            errorMessage = "This coaching relationship is not attached to a valid private conversation."
            return
        }
        await load(
            context: context,
            forceRefresh: forceRefresh,
            quietly: quietly
        )
    }

    private func load(
        context: Context,
        forceRefresh: Bool,
        quietly: Bool
    ) async {
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
                errorMessage = "Connect to Nest once to protect this \(scope.title.lowercased()) for offline reading."
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
                URLQueryItem(
                    name: scope == .episode ? "episodeSlug" : "threadKey",
                    value: scope == .episode ? context.scopeKey : context.threadKey
                ),
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
                    "The protected \(scope.title.lowercased()) response left the configured Nest origin.",
                    code: response.statusCode
                )
            }
            let payload = try JSONDecoder().decode(
                NestChatLoadResponse.self,
                from: data
            )
            guard response.statusCode < 400,
                  payload.ok,
                  payload.thread?.key == context.threadKey,
                  payloadMatchesScope(payload, context: context) else {
                throw Self.error(
                    payload.error ?? "The \(scope.title.lowercased()) is unavailable.",
                    code: response.statusCode
                )
            }

            let nextMessages = Array((payload.messages ?? []).suffix(200))
            let messagesChanged = messages != nextMessages
            if messagesChanged {
                messages = nextMessages
            }
            let nextThreadTitle = payload.thread?.title ?? scope.title
            if threadTitle != nextThreadTitle {
                threadTitle = nextThreadTitle
            }
            let actorRole = payload.actor?.role?.uppercased() ?? ""
            let nextCanEdit = scope == .episode
                ? ["OWNER", "EDITOR"].contains(actorRole)
                : !actorRole.isEmpty && !["OBSERVER", "VIEWER"].contains(actorRole)
            if canEdit != nextCanEdit {
                canEdit = nextCanEdit
            }
            if isUsingProtectedCache {
                isUsingProtectedCache = false
            }
            if errorMessage != nil {
                errorMessage = nil
            }
            let nextStatusMessage = nextMessages.isEmpty
                ? "Start the \(scope.startNoun) conversation"
                : "\(nextMessages.count) \(nextMessages.count == 1 ? "message" : "messages")"
            if statusMessage != nextStatusMessage {
                statusMessage = nextStatusMessage
            }
            if !quietly || messagesChanged {
                persist(context: context)
            }
        } catch {
            let responseCode = (error as NSError).code
            if messages.isEmpty {
                _ = restoreProtectedCache(context: context)
            }
            if responseCode == 404 {
                pollingDisabledForMissingThread = true
                canEdit = false
                statusMessage = messages.isEmpty
                    ? "\(scope.title) unavailable"
                    : "\(scope.title) unavailable · protected copy"
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

    func startPolling(engagement: MobileCaptureCoachingEngagement) {
        stopPolling()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled, let self else { return }
                guard !self.pollingDisabledForMissingThread else { return }
                await self.load(engagement: engagement, quietly: true)
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    @discardableResult
    func send(session: MobileCaptureSession, body: String) async -> Bool {
        guard let context = context(for: session) else { return false }
        return await send(context: context, body: body)
    }

    @discardableResult
    func send(
        engagement: MobileCaptureCoachingEngagement,
        body: String,
        coachingScheduleRequest: MobileCoachingScheduleRequestEnvelope? = nil,
        coachingScheduleDecision: MobileCoachingScheduleDecisionEnvelope? = nil
    ) async -> Bool {
        guard scope == .engagement,
              let context = context(for: engagement) else { return false }
        return await send(
            context: context,
            body: body,
            coachingScheduleRequest: coachingScheduleRequest,
            coachingScheduleDecision: coachingScheduleDecision
        )
    }

    @discardableResult
    private func send(
        context: Context,
        body: String,
        coachingScheduleRequest: MobileCoachingScheduleRequestEnvelope? = nil,
        coachingScheduleDecision: MobileCoachingScheduleDecisionEnvelope? = nil
    ) async -> Bool {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              trimmed.count <= 4_000,
              canEdit,
              !isSending,
              AuthManager.shared.networkActionsAllowed else {
            return false
        }
        let schedulingEvidence = Self.schedulingEvidence(
            request: coachingScheduleRequest,
            decision: coachingScheduleDecision
        )
        let requestID: UUID
        if pendingMessageBody == trimmed,
           pendingMessageSchedulingEvidence == schedulingEvidence,
           let pendingMessageID {
            requestID = pendingMessageID
        } else {
            requestID = UUID()
            pendingMessageBody = trimmed
            pendingMessageSchedulingEvidence = schedulingEvidence
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
            var requestBody: [String: Any] = [
                "projectSlug": context.projectSlug,
                "body": trimmed,
                "clientMessageId": requestID.uuidString.lowercased(),
                "clientSurface": "capture-ios",
            ]
            requestBody[scope == .episode ? "episodeSlug" : "threadKey"] =
                scope == .episode ? context.scopeKey : context.threadKey
            if let coachingScheduleRequest {
                requestBody["coachingScheduleRequest"] = try Self.jsonObject(
                    coachingScheduleRequest
                )
            }
            if let coachingScheduleDecision {
                requestBody["coachingScheduleDecision"] = try Self.jsonObject(
                    coachingScheduleDecision
                )
            }
            request.httpBody = try JSONSerialization.data(withJSONObject: requestBody)
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
            pendingMessageSchedulingEvidence = nil
            pendingMessageID = nil
            outboundLiveHint = MobileChatPersistedLiveHint(
                schema: MobileChatPersistedLiveHint.schemaVersion,
                threadKey: context.threadKey,
                messageId: message.id,
                persistedAt: message.createdAt
            )
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
              hint.threadKey == context.threadKey else { return }
        lastReceivedLiveMessageID = hint.messageId
        await load(session: session, forceRefresh: true, quietly: true)
    }

    static func clearProtectedCache() {
        for scope in [MobileCollaborationChatScope.episode, .session, .engagement] {
            guard let root = protectedCacheRoot(scope: scope) else { continue }
            try? FileManager.default.removeItem(at: root)
        }
    }

    private struct Context {
        let key: String
        let projectSlug: String
        let scopeKey: String
        let threadKey: String
        let endpoint: URL
    }

    private func context(for session: MobileCaptureSession) -> Context? {
        guard let projectSlug = Self.safeSlug(session.projectSlug) else { return nil }
        let scopeKey: String
        let threadKey: String
        switch scope {
        case .episode:
            guard let episodeSlug = Self.safeSlug(session.episodeSlug),
                  let episodeThreadKey = MobileChatPersistedLiveHint.episodeThreadKey(episodeSlug) else { return nil }
            scopeKey = episodeSlug
            threadKey = episodeThreadKey
        case .session:
            guard let callRoomID = Self.safeSlug(session.callRoomId),
                  let sessionThreadKey = MobileChatPersistedLiveHint.sessionThreadKey(callRoomID) else { return nil }
            scopeKey = callRoomID
            threadKey = sessionThreadKey
        case .engagement:
            return nil
        }
        let endpoint = baseURL
            .appendingPathComponent("api", isDirectory: true)
            .appendingPathComponent("nest-chat", isDirectory: false)
        return Context(
            key: "\(scope.rawValue)|\(projectSlug)|\(scopeKey)",
            projectSlug: projectSlug,
            scopeKey: scopeKey,
            threadKey: threadKey,
            endpoint: endpoint
        )
    }

    private func context(for engagement: MobileCaptureCoachingEngagement) -> Context? {
        guard scope == .engagement,
              let projectSlug = Self.safeSlug(engagement.projectSlug),
              let engagementID = Self.safeSlug(engagement.id),
              let threadKey = MobileChatPersistedLiveHint.engagementThreadKey(engagementID) else {
            return nil
        }
        let endpoint = baseURL
            .appendingPathComponent("api", isDirectory: true)
            .appendingPathComponent("nest-chat", isDirectory: false)
        return Context(
            key: "\(scope.rawValue)|\(projectSlug)|\(engagementID)",
            projectSlug: projectSlug,
            scopeKey: engagementID,
            threadKey: threadKey,
            endpoint: endpoint
        )
    }

    private func payloadMatchesScope(
        _ payload: NestChatLoadResponse,
        context: Context
    ) -> Bool {
        switch scope {
        case .episode:
            payload.episode?.slug == context.scopeKey
        case .session:
            payload.session?.id.lowercased() == context.scopeKey
        case .engagement:
            payload.engagement?.id.lowercased() == context.scopeKey
        }
    }

    private func reset() {
        stopPolling()
        currentContextKey = nil
        messages = []
        threadTitle = scope.title
        canEdit = false
        isLoading = false
        isSending = false
        isUsingProtectedCache = false
        protectedCacheSavedAt = nil
        statusMessage = nil
        errorMessage = nil
        pendingMessageBody = nil
        pendingMessageSchedulingEvidence = nil
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
            let cachedScope = cache.scope ?? .episode
            let cachedScopeKey = cache.scopeKey ?? cache.episodeSlug
            guard [1, 2].contains(cache.schemaVersion),
                  cache.ownerDigest == Self.digest(owner.ownerAccountID),
                  cache.projectSlug == context.projectSlug,
                  cachedScope == scope,
                  cachedScopeKey == context.scopeKey,
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
            schemaVersion: 2,
            ownerDigest: Self.digest(owner.ownerAccountID),
            projectSlug: context.projectSlug,
            scope: scope,
            scopeKey: context.scopeKey,
            episodeSlug: scope == .episode ? context.scopeKey : nil,
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
            print("Protected \(scope.rawValue) chat cache could not be updated: \(error.localizedDescription)")
        }
    }

    private func cacheURL(
        context: Context,
        owner: AuthManager.StableOwnerSnapshot
    ) -> URL? {
        Self.protectedCacheRoot(scope: scope)?
            .appendingPathComponent(Self.digest(owner.ownerAccountID), isDirectory: true)
            .appendingPathComponent(Self.digest(context.projectSlug), isDirectory: true)
            .appendingPathComponent("\(Self.digest(context.scopeKey)).json")
    }

    nonisolated private static func protectedCacheRoot(
        scope: MobileCollaborationChatScope
    ) -> URL? {
        FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first?
            .appendingPathComponent(
                scope == .episode
                    ? "QuipslyCapture/EpisodeChat"
                    : "QuipslyCapture/SessionChat",
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

    nonisolated private static func jsonObject<T: Encodable>(
        _ value: T
    ) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
    }

    nonisolated private static func schedulingEvidence(
        request: MobileCoachingScheduleRequestEnvelope?,
        decision: MobileCoachingScheduleDecisionEnvelope?
    ) -> String {
        let encoder = JSONEncoder()
        let requestBytes = request.flatMap { try? encoder.encode($0) }
        let decisionBytes = decision.flatMap { try? encoder.encode($0) }
        return [requestBytes, decisionBytes]
            .map { $0?.base64EncodedString() ?? "-" }
            .joined(separator: "|")
    }
}

private enum MobileCollaborationChatTarget {
    case session(MobileCaptureSession)
    case engagement(MobileCaptureCoachingEngagement)

    func load(
        with client: MobileEpisodeChatClient,
        forceRefresh: Bool = false
    ) async {
        switch self {
        case let .session(session):
            await client.load(session: session, forceRefresh: forceRefresh)
        case let .engagement(engagement):
            await client.load(engagement: engagement, forceRefresh: forceRefresh)
        }
    }

    func send(with client: MobileEpisodeChatClient, body: String) async -> Bool {
        switch self {
        case let .session(session):
            await client.send(session: session, body: body)
        case let .engagement(engagement):
            await client.send(engagement: engagement, body: body)
        }
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
                ProgressView("Loading \(client.scope.title.lowercased())…")
            } else if let latest = client.latestMessage {
                Text(latest.authorName ?? latest.authorEmail ?? "Collaborator")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tint)
                Text(latest.body)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("\(client.scope.accessibilityPrefix)LatestMessage")
            } else {
                Text(client.scope.emptyExplanation)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Button {
                isPresented = true
            } label: {
                Label(client.scope.openLabel, systemImage: "bubble.left.and.bubble.right.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(client.isLoading && client.messages.isEmpty)
            .accessibilityIdentifier(client.scope.openButtonAccessibilityIdentifier)

            if let errorMessage = client.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Error")
            }
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Card")
        .sheet(isPresented: $isPresented) {
            MobileEpisodeChatThread(
                client: client,
                target: .session(session),
                previewOnly: previewOnly
            )
        }
    }

    private var heading: some View {
        Label(client.scope.title, systemImage: "person.2.fill")
            .font(.headline)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var status: some View {
        Text(client.isUsingProtectedCache ? "Offline copy" : (client.statusMessage ?? "Nest chat"))
            .font(.caption.weight(.semibold))
            .foregroundStyle(client.isUsingProtectedCache ? .orange : .secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Status")
    }
}

struct MobileEngagementChatCard: View {
    @ObservedObject var client: MobileEpisodeChatClient
    let engagement: MobileCaptureCoachingEngagement
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
                ProgressView("Loading coaching conversation…")
            } else if let latest = client.latestMessage {
                Text(latest.authorName ?? latest.authorEmail ?? "Collaborator")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tint)
                Text(latest.body)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureCoachingConversationLatestMessage")
            } else {
                Text(client.scope.emptyExplanation)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Button {
                isPresented = true
            } label: {
                Label(client.scope.openLabel, systemImage: "bubble.left.and.bubble.right.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(client.isLoading && client.messages.isEmpty)
            .accessibilityIdentifier("CaptureCoachingConversationOpenButton")

            if let errorMessage = client.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.red)
                    .accessibilityIdentifier("CaptureCoachingConversationError")
            }
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureCoachingConversationCard")
        .sheet(isPresented: $isPresented) {
            MobileEpisodeChatThread(
                client: client,
                target: .engagement(engagement),
                previewOnly: previewOnly
            )
        }
    }

    private var heading: some View {
        Label(client.scope.title, systemImage: "person.2.fill")
            .font(.headline)
            .fixedSize(horizontal: false, vertical: true)
    }

    private var status: some View {
        Text(client.isUsingProtectedCache ? "Offline copy" : (client.statusMessage ?? "Private chat"))
            .font(.caption.weight(.semibold))
            .foregroundStyle(client.isUsingProtectedCache ? .orange : .secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("CaptureCoachingConversationStatus")
    }
}

struct MobileSessionChatCard: View {
    @ObservedObject var client: MobileEpisodeChatClient
    let session: MobileCaptureSession
    let previewOnly: Bool

    var body: some View {
        MobileEpisodeChatCard(
            client: client,
            session: session,
            previewOnly: previewOnly
        )
    }
}

private struct MobileEpisodeChatThread: View {
    @ObservedObject var client: MobileEpisodeChatClient
    let target: MobileCollaborationChatTarget
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
                            await target.load(with: client, forceRefresh: true)
                        }
                    } label: {
                        if client.isLoading {
                            ProgressView()
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                    .disabled(client.isLoading || previewOnly)
                    .accessibilityLabel("Refresh \(client.scope.title.lowercased())")
                    .accessibilityIdentifier("\(client.scope.accessibilityPrefix)RefreshButton")
                }
            }
        }
        .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Thread")
    }

    private var boundary: some View {
        VStack(alignment: .leading, spacing: 5) {
            Label(
                client.isUsingProtectedCache
                    ? "Protected offline copy"
                    : client.scope.conversationLabel,
                systemImage: client.isUsingProtectedCache
                    ? "lock.bubble.left.fill"
                    : "checkmark.seal.fill"
            )
            .font(.subheadline.weight(.bold))
            Text(client.scope.boundaryExplanation)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Boundary")
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
        .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Message_\(message.id)")
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
                    client.canEdit
                        ? client.scope.composerPlaceholder
                        : "View-only \(client.scope.title.lowercased())",
                    text: $draft,
                    axis: .vertical
                )
                .lineLimit(2 ... 6)
                .textFieldStyle(.roundedBorder)
                .disabled(!client.canEdit || previewOnly)
                .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Composer")

                Button {
                    let body = draft
                    Task {
                        if await target.send(with: client, body: body) {
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
                .accessibilityLabel("Send \(client.scope.startNoun) message")
                .accessibilityIdentifier("\(client.scope.accessibilityPrefix)SendButton")
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
