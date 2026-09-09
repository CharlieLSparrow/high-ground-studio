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
    case nest
    case episode
    case session
    case engagement

    var title: String {
        switch self {
        case .nest: "Conversation"
        case .episode: "Episode thread"
        case .session: "Session thread"
        case .engagement: "Coaching conversation"
        }
    }

    var conversationLabel: String {
        switch self {
        case .nest: "Nest conversation"
        case .episode: "Canonical episode conversation"
        case .session: "Canonical take conversation"
        case .engagement: "Private coaching conversation"
        }
    }

    var openLabel: String {
        switch self {
        case .nest: "Open conversation"
        case .episode: "Open episode thread"
        case .session: "Open Session thread"
        case .engagement: "Open coaching conversation"
        }
    }

    var accessibilityPrefix: String {
        switch self {
        case .nest: "CaptureNestConversation"
        case .episode: "CaptureEpisodeChat"
        case .session: "CaptureSessionChat"
        case .engagement: "CaptureCoachingConversation"
        }
    }

    var openButtonAccessibilityIdentifier: String {
        switch self {
        case .nest: "CaptureNestConversationOpenButton"
        case .episode: "CaptureEpisodeChatOpenButton"
        case .session: "CaptureSessionChatOpenButton"
        case .engagement: "CaptureCoachingConversationOpenButton"
        }
    }

    var startNoun: String {
        switch self {
        case .nest: "Nest"
        case .episode: "episode"
        case .session: "Session"
        case .engagement: "coaching"
        }
    }

    var composerPlaceholder: String {
        switch self {
        case .nest: "Message this Nest"
        case .episode: "Message the episode team"
        case .session: "Message this Session"
        case .engagement: "Message this coaching space"
        }
    }

    var emptyExplanation: String {
        switch self {
        case .nest: "Talk through ideas and keep the next steps with your shared work."
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
        case .nest: "Everyone with access to this Nest can read this conversation. Client conversations stay in their private spaces."
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
    @Published private(set) var updatingTaskIDs: Set<String> = []
    @Published private(set) var taskErrors: [String: String] = [:]
    @Published private(set) var composerDraft = CaptureConversationDraft()
    @Published private(set) var draftErrorMessage: String?
    private let draftStore = CaptureConversationDraftStore()
    private var draftKey: CaptureConversationDraftKey?

    private let baseURL: URL
    let scope: MobileCollaborationChatScope
    private var currentContextKey: String?
    private var openingID = UUID()
    private var readRevision = 0
    private var requestScope: CaptureConversationRequestScope? {
        currentContextKey.map { CaptureConversationRequestScope(contextKey: $0,
            ownerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID,
            openingID: openingID, readRevision: readRevision) }
    }
    private func invalidateOlderReads() {
        readRevision += 1
        isLoading = false
    }
    private var pollingTask: Task<Void, Never>?
    private var accountCancellable: AnyCancellable?
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
            if Thread.isMainThread { MainActor.assumeIsolated { self?.reset() } }
            else { Task { @MainActor in self?.reset() } }
        }
    }

    func updateComposerDraft(_ body: String) {
        guard let draftKey,
              draftKey.ownerAccountID == AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID else { return }
        composerDraft.body = body
        _ = persistComposerDraft()
    }

    private func persistComposerDraft() -> Bool {
        guard let draftKey,
              draftKey.ownerAccountID == AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID else { return false }
        do {
            try draftStore.save(composerDraft, for: draftKey)
            draftErrorMessage = nil
            return true
        } catch {
            draftErrorMessage = "This device couldn't save your draft. Keep this conversation open and try again."
            return false
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
                    : "Device source is framed and consent is current. Call audio is not the retained recording.",
                gifUrl: nil,
                createdAt: now
            ),
        ]
        canEdit = false
        statusMessage = "2 rehearsal messages"
    }

    func loadPreview(engagement: MobileCaptureCoachingEngagement) {
        reset()
        currentContextKey = "preview|\(engagement.id)"
        threadTitle = engagement.title
        var message = NestChatMessage(id: "preview-work-idea", authorEmail: "client@example.test",
            authorName: "Homer", body: "Outline chapter one before our next conversation.",
            gifUrl: nil, createdAt: "2026-09-08T12:00:00Z")
        message.linkedTasks = [NestChatLinkedTask(id: "preview-linked-task", title: "Review the final cut", status: "OPEN",
            tags: [MobileWorkTagLabel(id: "research", label: "Research and source material", hexColor: "#23543a", isActive: true)])]
        messages = [message]
        canEdit = true
        statusMessage = "1 message"
    }

    func loadPreview(project: MobileCaptureWorkProject) {
        reset()
        currentContextKey = "preview|\(project.id)"
        threadTitle = project.name
        var message = NestChatMessage(id: "preview-nest-idea", authorEmail: "writer@example.test",
            authorName: "Alex", body: "Collect three examples for our opening chapter.",
            gifUrl: nil, createdAt: "2026-09-08T12:00:00Z")
        message.linkedTasks = [NestChatLinkedTask(id: "preview-nest-task", title: "Find the opening story", status: "OPEN",
            tags: [MobileWorkTagLabel(id: "research", label: "Research", hexColor: "#506b46", isActive: true)])]
        messages = [message]
        canEdit = project.canWrite
    }

    func load(project: MobileCaptureWorkProject, forceRefresh: Bool = false, quietly: Bool = false) async {
        guard let context = context(for: project) else { return }
        await load(context: context, forceRefresh: forceRefresh, quietly: quietly)
    }

    func startPolling(project: MobileCaptureWorkProject) {
        stopPolling()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(5))
                guard !Task.isCancelled, let self, !self.pollingDisabledForMissingThread else { return }
                await self.load(project: project, quietly: true)
            }
        }
    }

    func send(project: MobileCaptureWorkProject, body: String) async -> Bool {
        guard let context = context(for: project) else { return false }
        return await send(context: context, body: body)
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
            if let owner = AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID {
                let key = CaptureConversationDraftKey(ownerAccountID: owner, origin: baseURL.absoluteString, context: context.key)
                draftKey = key
                do { composerDraft = try draftStore.load(key) }
                catch { draftErrorMessage = "This device couldn't open your saved draft. Try reopening this conversation." }
            }
            _ = restoreProtectedCache(context: context)
        }
        if forceRefresh {
            pollingDisabledForMissingThread = false
        } else if quietly, pollingDisabledForMissingThread {
            return
        }
        guard !isLoading, !isSending, updatingTaskIDs.isEmpty else { return }
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

        readRevision += 1
        guard let readScope = requestScope,
              readScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return }
        if !quietly { isLoading = true }
        defer {
            if !quietly, readScope.permitsDisplay(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) { isLoading = false }
        }
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
            guard readScope.permitsDisplay(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return }
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
            let nextCanEdit = scope == .episode || scope == .nest
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
            guard readScope.permitsDisplay(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return }
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
              context.key == currentContextKey,
              AuthManager.shared.networkActionsAllowed else {
            return false
        }
        guard let sendScope = requestScope,
              sendScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return false }
        let schedulingEvidence = Self.schedulingEvidence(
            request: coachingScheduleRequest,
            decision: coachingScheduleDecision
        )
        let pendingSend = composerDraft.prepareSend(body: trimmed, schedulingEvidence: schedulingEvidence)
        guard persistComposerDraft() else { return false }
        let requestID = pendingSend.id

        invalidateOlderReads()
        isSending = true
        errorMessage = nil
        defer {
            if sendScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) { isSending = false }
        }
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
            guard sendScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return false }
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
            invalidateOlderReads()
            if !messages.contains(where: { $0.id == message.id }) {
                messages.append(message)
                messages = Array(messages.suffix(200))
            }
            composerDraft.acknowledge(pendingSend)
            _ = persistComposerDraft()
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
            guard sendScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return false }
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
        for scope in [MobileCollaborationChatScope.episode, .session, .engagement, .nest] {
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
        case .engagement, .nest:
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
        case .nest:
            payload.project?.slug == context.projectSlug && payload.episode == nil
                && payload.session == nil && payload.engagement == nil
        case .episode:
            payload.episode?.slug == context.scopeKey
        case .session:
            payload.session?.id.lowercased() == context.scopeKey
        case .engagement:
            payload.engagement?.id.lowercased() == context.scopeKey
        }
    }

    private func context(for project: MobileCaptureWorkProject) -> Context? {
        guard scope == .nest, let slug = Self.safeSlug(project.slug) else { return nil }
        return Context(key: "nest|\(slug)|default", projectSlug: slug, scopeKey: "default",
            threadKey: "default", endpoint: baseURL.appendingPathComponent("api/nest-chat"))
    }

    func createTask(_ command: NestConversationTaskCommand, project: MobileCaptureWorkProject) async -> NestChatLinkedTask? {
        guard canEdit, let context = context(for: project), context.key == currentContextKey,
              command.projectSlug == project.slug, messages.contains(where: { $0.id == command.sourceMessageId }),
              let activeScope = requestScope,
              activeScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return nil }
        invalidateOlderReads()
        errorMessage = nil
        do {
            var request = URLRequest(url: baseURL.appendingPathComponent("api/nest-chat/tasks"))
            request.httpMethod = "POST"
            request.timeoutInterval = 20
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(command)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard activeScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return nil }
            let payload = try JSONDecoder().decode(NestConversationTaskResponse.self, from: data)
            guard (200...299).contains(response.statusCode), payload.ok, let entry = payload.entry,
                  Self.isSameOrigin(response.url, baseURL) else {
                throw Self.error(payload.error ?? "Your task couldn't save. Try again.", code: response.statusCode)
            }
            invalidateOlderReads()
            messages = messages.map { message in
                guard message.id == command.sourceMessageId else { return message }
                var updated = message
                updated.linkedTasks = (message.linkedTasks ?? []).filter { $0.id != entry.id } + [entry]
                return updated
            }
            persist(context: context)
            return entry
        } catch {
            guard activeScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return nil }
            errorMessage = error.localizedDescription
            return nil
        }
    }

    func setTaskCompletion(_ task: NestChatLinkedTask, engagement: MobileCaptureCoachingEngagement) async -> Bool {
        guard canEdit, !updatingTaskIDs.contains(task.id),
              let context = context(for: engagement), context.key == currentContextKey,
              let taskScope = requestScope,
              taskScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return false }
        invalidateOlderReads()
        updatingTaskIDs.insert(task.id)
        taskErrors[task.id] = nil
        defer {
            if taskScope.belongsToOpening(requestScope,
                currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) {
                updatingTaskIDs.remove(task.id)
            }
        }
        let work = MobileCoachingEngagementWorkspaceClient(engagementID: engagement.id, itemID: task.id)
        let saved = await work.setTaskCompletion(id: task.id, completed: task.status != "DONE")
        guard taskScope.belongsToOpening(requestScope,
            currentOwnerAccountID: AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID) else { return false }
        guard let saved, let status = saved.status else {
            taskErrors[task.id] = work.errorMessage ?? "Couldn't update this task. Try again."
            return false
        }
        invalidateOlderReads()
        let confirmed = NestChatLinkedTask(id: saved.id, title: saved.displayTitle, status: status, tags: saved.tags)
        messages = messages.map { message in
            var updated = message
            updated.linkedTasks = message.linkedTasks?.map { $0.id == saved.id ? confirmed : $0 }
            return updated
        }
        persist(context: context)
        return true
    }

    private func reset() {
        openingID = UUID()
        invalidateOlderReads()
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
        composerDraft = CaptureConversationDraft()
        draftKey = nil
        draftErrorMessage = nil
        pollingDisabledForMissingThread = false
        outboundLiveHint = nil
        lastReceivedLiveMessageID = nil
        updatingTaskIDs = []
        taskErrors = [:]
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
                scope == .nest ? "QuipslyCapture/NestChat" : scope == .episode
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

    private static func jsonObject<T: Encodable>(
        _ value: T
    ) throws -> Any {
        try JSONSerialization.jsonObject(with: JSONEncoder().encode(value))
    }

    private static func schedulingEvidence(
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

enum MobileCollaborationChatTarget {
    case nest(MobileCaptureWorkProject)
    case session(MobileCaptureSession)
    case engagement(MobileCaptureCoachingEngagement)

    func load(
        with client: MobileEpisodeChatClient,
        forceRefresh: Bool = false
    ) async {
        switch self {
        case let .nest(project):
            await client.load(project: project, forceRefresh: forceRefresh)
        case let .session(session):
            await client.load(session: session, forceRefresh: forceRefresh)
        case let .engagement(engagement):
            await client.load(engagement: engagement, forceRefresh: forceRefresh)
        }
    }

    func send(with client: MobileEpisodeChatClient, body: String) async -> Bool {
        switch self {
        case let .nest(project):
            await client.send(project: project, body: body)
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
            .captureProminentButton()
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
            .foregroundStyle(client.isUsingProtectedCache ? CapturePalette.brass : .secondary)
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Status")
    }
}

struct MobileEngagementChatCard: View {
    @ObservedObject var client: MobileEpisodeChatClient
    let engagement: MobileCaptureCoachingEngagement
    let previewOnly: Bool
    var onWorkChanged: @MainActor @Sendable () async -> Void = {}
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
            .captureProminentButton()
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
                previewOnly: previewOnly,
                onWorkChanged: onWorkChanged
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
            .foregroundStyle(client.isUsingProtectedCache ? CapturePalette.brass : .secondary)
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

struct MobileEpisodeChatThread: View {
    @ObservedObject var client: MobileEpisodeChatClient
    let target: MobileCollaborationChatTarget
    let previewOnly: Bool
    var onWorkChanged: @MainActor @Sendable () async -> Void = {}
    var nestTags: [MobileWorkTagLabel] = []
    var onOpenNestTask: (String) -> Void = { _ in }
    @Environment(\.dismiss) private var dismiss
    @State private var workAction: MobileConversationWorkAction?
    @State private var workSourceMessageID: String?
    @State private var workReturnRevision = 0
    @FocusState private var composerIsFocused: Bool

    init(client: MobileEpisodeChatClient, target: MobileCollaborationChatTarget, previewOnly: Bool,
         onWorkChanged: @escaping @MainActor @Sendable () async -> Void = {},
         nestTags: [MobileWorkTagLabel] = [], onOpenNestTask: @escaping (String) -> Void = { _ in }) {
        self.client = client
        self.target = target
        self.previewOnly = previewOnly
        self.onWorkChanged = onWorkChanged
        self.nestTags = nestTags
        self.onOpenNestTask = onOpenNestTask
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(alignment: .leading, spacing: 12) {
                            if client.isUsingProtectedCache { boundary }
                            if client.isLoading && client.messages.isEmpty {
                                ProgressView("Loading conversation…")
                                    .frame(maxWidth: .infinity)
                            }
                            ForEach(client.messages) { message in
                                messageCard(message)
                                    .id(message.id)
                            }
                        }
                        .padding()
                    }
                    .scrollDismissesKeyboard(.interactively)
                    .onAppear {
                        if let last = client.messages.last { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                    .onChange(of: workReturnRevision) {
                        if let workSourceMessageID { proxy.scrollTo(workSourceMessageID, anchor: .center) }
                    }
                    .onChange(of: client.messages.count) {
                        guard let last = client.messages.last else { return }
                        withAnimation { proxy.scrollTo(last.id, anchor: .bottom) }
                    }
                }

                composer
            }
            .background(CaptureCanvas())
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
        .sheet(item: $workAction, onDismiss: {
            guard !previewOnly else { return }
            // Return to the source when the editor closes, not after network
            // refreshes finish and the person may already be tapping a task.
            workReturnRevision += 1
            Task {
                await target.load(with: client, forceRefresh: true)
                await onWorkChanged()
            }
        }) { action in
            if case let .nest(project) = target, case let .create(message) = action {
                CaptureNestConversationTaskEditor(client: client, project: project, message: message,
                    tags: nestTags, previewOnly: previewOnly)
            }
            if case let .engagement(engagement) = target {
                switch action {
                case let .create(message):
                    CaptureConversationWorkEditor(engagementID: engagement.id, message: message, previewOnly: previewOnly)
                case let .edit(task):
                    CaptureCoachingWorkItemEditor(engagementID: engagement.id, entryID: task.id, kind: "TASK")
                }
            }
        }
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
                    .accessibilityIdentifier("CaptureConversationMessageTime_\(message.id)")
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
            if case .nest = target {
                ForEach(message.linkedTasks ?? []) { task in
                    Button { onOpenNestTask(task.id) } label: {
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: task.status == "DONE" ? "checkmark.circle.fill" : "circle")
                            VStack(alignment: .leading, spacing: 6) {
                                Text(task.title).font(.subheadline.weight(.semibold))
                                CaptureWorkTags(tags: task.tags ?? [], workID: task.id)
                            }
                        }.frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Task: \(task.title), \(task.status.lowercased())")
                    .accessibilityIdentifier("CaptureNestConversationTask_\(task.id)")
                    .disabled(previewOnly)
                }
                if client.canEdit, !message.suggestedTaskTitle.isEmpty {
                    Button {
                        composerIsFocused = false
                        workSourceMessageID = message.id
                        workAction = .create(message)
                    } label: {
                        Label("Create task", systemImage: "checkmark.circle.badge.plus").frame(minHeight: 44)
                    }
                    .accessibilityIdentifier("CaptureNestConversationCreateTask_\(message.id)")
                }
            }
            if case let .engagement(engagement) = target {
                ForEach(message.linkedTasks ?? []) { task in
                    HStack(alignment: .top, spacing: 4) {
                        Button {
                            composerIsFocused = false
                            Task {
                                if await client.setTaskCompletion(task, engagement: engagement) {
                                    await onWorkChanged()
                                }
                            }
                        } label: {
                            Group {
                                if client.updatingTaskIDs.contains(task.id) { ProgressView() }
                                else { Image(systemName: task.status == "DONE" ? "checkmark.circle.fill" : "circle") }
                            }
                            .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                        .disabled(!client.canEdit || previewOnly || client.updatingTaskIDs.contains(task.id))
                        .accessibilityLabel("\(task.status == "DONE" ? "Reopen" : "Complete") task: \(task.title)")
                        .accessibilityValue(task.status)
                        .accessibilityIdentifier("CaptureConversationToggleTask_\(task.id)")
                        Button {
                            composerIsFocused = false
                            workSourceMessageID = message.id
                            workAction = .edit(task)
                        } label: {
                            HStack(alignment: .top, spacing: 8) {
                                VStack(alignment: .leading, spacing: 5) {
                                    Text(task.title).font(.subheadline.weight(.semibold))
                                        .fixedSize(horizontal: false, vertical: true)
                                    if let tags = task.tags, !tags.isEmpty {
                                        CaptureWorkTags(tags: tags, workID: task.id)
                                    }
                                }
                                Spacer(minLength: 0)
                            }
                            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Task: \(task.title), \(task.status.lowercased())")
                        .accessibilityIdentifier("CaptureConversationTask_\(task.id)")
                    }
                    if let error = client.taskErrors[task.id] {
                        Text(error).font(.caption).foregroundStyle(CapturePalette.brass)
                            .accessibilityIdentifier("CaptureConversationTaskError_\(task.id)")
                    }
                }
                if client.canEdit, !message.suggestedTaskTitle.isEmpty {
                    Button {
                        composerIsFocused = false
                        workSourceMessageID = message.id
                        workAction = .create(message)
                    } label: {
                        Label((message.linkedTasks ?? []).isEmpty ? "Create task" : "Create another task", systemImage: "checkmark.circle.badge.plus")
                            .frame(minHeight: 44)
                    }
                    .accessibilityIdentifier("CaptureConversationCreateTask_\(message.id)")
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            Color.secondary.opacity(0.08),
            in: RoundedRectangle(cornerRadius: 14, style: .continuous)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Message_\(message.id)")
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if client.composerDraft.body.trimmingCharacters(in: .whitespacesAndNewlines).count > 4_000 {
                Text("Messages can contain up to 4,000 characters.")
                    .font(.caption).foregroundStyle(CapturePalette.brass)
            }
            if let message = client.draftErrorMessage {
                Text(message).font(.caption).foregroundStyle(CapturePalette.brass)
            }
            if let errorMessage = client.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CapturePalette.brass)
            }
            HStack(alignment: .bottom, spacing: 8) {
                TextField(
                    client.canEdit
                        ? client.scope.composerPlaceholder
                        : "View-only \(client.scope.title.lowercased())",
                    text: Binding(get: { client.composerDraft.body }, set: { client.updateComposerDraft($0) }),
                    axis: .vertical
                )
                .lineLimit(2 ... 6)
                .focused($composerIsFocused)
                .textFieldStyle(.roundedBorder)
                .disabled(!client.canEdit || previewOnly)
                .accessibilityIdentifier("\(client.scope.accessibilityPrefix)Composer")

                Button {
                    let body = client.composerDraft.body
                    Task {
                        _ = await target.send(with: client, body: body)
                    }
                } label: {
                    if client.isSending {
                        ProgressView()
                    } else {
                        Image(systemName: "paperplane.fill")
                    }
                }
                .captureProminentButton()
                .disabled(
                    client.composerDraft.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || client.composerDraft.body.trimmingCharacters(in: .whitespacesAndNewlines).count > 4_000
                        || !client.canEdit
                        || client.isSending
                        || previewOnly
                )
                .accessibilityLabel("Send \(client.scope.startNoun) message")
                .accessibilityIdentifier("\(client.scope.accessibilityPrefix)SendButton")
            }
        }
        .padding()
        .background(CapturePalette.locationBarBackground)
    }

    nonisolated private static func formattedTime(_ value: String) -> String {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fractional.date(from: value)
            ?? ISO8601DateFormatter().date(from: value) else {
            return "Time unavailable"
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
