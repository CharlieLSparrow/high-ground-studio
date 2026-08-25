import Combine
import CryptoKit
import Foundation
import SwiftUI

struct MobileSessionConversationAuthor: Codable, Hashable {
    let id: String
    let label: String
    let image: String?
    let isCurrentActor: Bool
}

struct MobileSessionConversationReply: Codable, Hashable {
    let id: String
    let body: String
    let authorLabel: String
}

struct MobileSessionConversationMessage: Codable, Hashable, Identifiable {
    let id: String
    let body: String
    let revision: Int
    let editedAt: String?
    let deletedAt: String?
    let createdAt: String
    let updatedAt: String
    let author: MobileSessionConversationAuthor
    let replyTo: MobileSessionConversationReply?
    let canEdit: Bool
}

private struct MobileSessionConversationRoom: Codable {
    let id: String
    let title: String?
}

private struct MobileSessionConversationCapabilities: Codable {
    let canWrite: Bool
    let canEditOwnMessages: Bool
}

private struct MobileSessionConversationResponse: Codable {
    let ok: Bool
    let error: String?
    let room: MobileSessionConversationRoom?
    let messages: [MobileSessionConversationMessage]?
    let message: MobileSessionConversationMessage?
    let unreadCount: Int?
    let capabilities: MobileSessionConversationCapabilities?
}

private struct MobileSessionConversationCache: Codable {
    let schemaVersion: Int
    let ownerDigest: String
    let roomID: String
    let savedAt: Date
    let title: String
    let messages: [MobileSessionConversationMessage]
}

@MainActor
final class MobileSessionConversationClient: ObservableObject {
    @Published private(set) var messages: [MobileSessionConversationMessage] = []
    @Published private(set) var title = "Session conversation"
    @Published private(set) var canWrite = false
    @Published private(set) var isLoading = false
    @Published private(set) var isSending = false
    @Published private(set) var isMutating = false
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?
    @Published private(set) var outboundLiveHint: MobileChatPersistedLiveHint?

    private struct PendingSend {
        let body: String
        let replyToID: String?
        let requestID: UUID
    }

    private let baseURL: URL
    private var currentRoomID: String?
    private var pendingSend: PendingSend?
    private var pollingTask: Task<Void, Never>?
    private var accountCancellable: AnyCancellable?
    private var lastReceivedLiveMessageID: String?
    private var loadGeneration = 0

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

    var latestMessage: MobileSessionConversationMessage? {
        messages.last
    }

    func loadPreview(session: MobileCaptureSession) {
        reset()
        currentRoomID = session.callRoomId
        title = "Session conversation"
        let now = Self.timestamp(Date())
        messages = [
            MobileSessionConversationMessage(
                id: "preview-session-conversation-1",
                body: "I’m ready. What would make this Session useful today?",
                revision: 1,
                editedAt: nil,
                deletedAt: nil,
                createdAt: now,
                updatedAt: now,
                author: MobileSessionConversationAuthor(
                    id: "preview-coach",
                    label: "Coach",
                    image: nil,
                    isCurrentActor: false
                ),
                replyTo: nil,
                canEdit: false
            ),
            MobileSessionConversationMessage(
                id: "preview-session-conversation-2",
                body: "I want to leave with one clear next step.",
                revision: 1,
                editedAt: nil,
                deletedAt: nil,
                createdAt: now,
                updatedAt: now,
                author: MobileSessionConversationAuthor(
                    id: "preview-client",
                    label: "Client",
                    image: nil,
                    isCurrentActor: true
                ),
                replyTo: MobileSessionConversationReply(
                    id: "preview-session-conversation-1",
                    body: "I’m ready. What would make this Session useful today?",
                    authorLabel: "Coach"
                ),
                canEdit: false
            ),
        ]
        canWrite = false
        statusMessage = "2 messages"
    }

    func load(
        session: MobileCaptureSession,
        forceRefresh: Bool = false,
        quietly: Bool = false
    ) async {
        guard let context = context(for: session) else {
            reset()
            errorMessage = "This Session does not have a valid conversation room."
            return
        }
        if currentRoomID != context.roomID {
            reset()
            currentRoomID = context.roomID
            _ = restoreProtectedCache(context: context)
        }
        guard !isLoading else { return }
        guard AuthManager.shared.networkActionsAllowed else {
            canWrite = false
            if !messages.isEmpty {
                isUsingProtectedCache = true
                statusMessage = "Protected offline copy"
                errorMessage = nil
            } else if !quietly {
                errorMessage = "Connect to Nest once to protect this conversation for offline reading."
            }
            return
        }

        loadGeneration += 1
        let generation = loadGeneration
        if !quietly { isLoading = true }
        defer {
            if generation == loadGeneration {
                isLoading = false
            }
        }
        do {
            var request = URLRequest(url: context.endpoint)
            request.httpMethod = "GET"
            request.cachePolicy = forceRefresh
                ? .reloadIgnoringLocalAndRemoteCacheData
                : .reloadRevalidatingCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            try validateOrigin(response.url)
            let payload = try JSONDecoder().decode(
                MobileSessionConversationResponse.self,
                from: data
            )
            guard response.statusCode < 400,
                  payload.ok,
                  payload.room?.id == context.roomID,
                  let loaded = payload.messages else {
                throw Self.error(
                    payload.error ?? "The Session conversation is unavailable.",
                    code: response.statusCode
                )
            }
            guard generation == loadGeneration,
                  currentRoomID == context.roomID else { return }
            messages = Array(loaded.suffix(200))
            let roomTitle = payload.room?.title?
                .trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            title = roomTitle.isEmpty ? "Session conversation" : roomTitle
            canWrite = payload.capabilities?.canWrite == true
            isUsingProtectedCache = false
            errorMessage = nil
            statusMessage = messages.isEmpty
                ? "Start the conversation"
                : "\(messages.count) \(messages.count == 1 ? "message" : "messages")"
            persist(context: context)
            if (payload.unreadCount ?? 0) > 0, let latest = messages.last {
                await markRead(context: context, messageID: latest.id)
            }
        } catch {
            guard generation == loadGeneration,
                  currentRoomID == context.roomID else { return }
            if messages.isEmpty {
                _ = restoreProtectedCache(context: context)
            }
            canWrite = false
            if !messages.isEmpty {
                isUsingProtectedCache = true
                if !quietly {
                    statusMessage = "Nest is unavailable · protected offline copy"
                    errorMessage = nil
                }
            } else if !quietly {
                errorMessage = error.localizedDescription
            }
        }
    }

    func startPolling(session: MobileCaptureSession) {
        stopPolling()
        pollingTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(6))
                guard !Task.isCancelled, let self else { return }
                await self.load(session: session, quietly: true)
            }
        }
    }

    func stopPolling() {
        pollingTask?.cancel()
        pollingTask = nil
    }

    @discardableResult
    func send(
        session: MobileCaptureSession,
        body: String,
        replyToID: String?
    ) async -> Bool {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              trimmed.count <= 6_000,
              canWrite,
              !isSending,
              AuthManager.shared.networkActionsAllowed,
              let context = context(for: session) else { return false }
        let send: PendingSend
        if let pendingSend,
           pendingSend.body == trimmed,
           pendingSend.replyToID == replyToID {
            send = pendingSend
        } else {
            send = PendingSend(
                body: trimmed,
                replyToID: replyToID,
                requestID: UUID()
            )
            pendingSend = send
        }
        isSending = true
        errorMessage = nil
        defer { isSending = false }
        do {
            var body: [String: Any] = [
                "clientRequestId": send.requestID.uuidString.lowercased(),
                "body": send.body,
            ]
            if let replyToID = send.replyToID { body["replyToId"] = replyToID }
            let payload = try await mutate(context: context, method: "POST", body: body)
            guard let message = payload.message else {
                throw Self.error("The message was not returned after saving.", code: 500)
            }
            invalidateLoads()
            upsert(message)
            pendingSend = nil
            outboundLiveHint = MobileChatPersistedLiveHint(
                schema: MobileChatPersistedLiveHint.schemaVersion,
                threadKey: "session:\(context.roomID)",
                messageId: message.id,
                persistedAt: message.createdAt
            )
            statusMessage = "\(messages.count) \(messages.count == 1 ? "message" : "messages")"
            persist(context: context)
            return true
        } catch {
            errorMessage = error.localizedDescription
            statusMessage = "Message preserved for retry"
            return false
        }
    }

    @discardableResult
    func edit(
        session: MobileCaptureSession,
        message: MobileSessionConversationMessage,
        body: String
    ) async -> Bool {
        let trimmed = body.trimmingCharacters(in: .whitespacesAndNewlines)
        guard message.canEdit,
              !trimmed.isEmpty,
              trimmed.count <= 6_000,
              !isMutating,
              let context = context(for: session) else { return false }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            let payload = try await mutate(
                context: context,
                method: "PATCH",
                body: [
                    "messageId": message.id,
                    "body": trimmed,
                    "expectedRevision": message.revision,
                ]
            )
            if let updated = payload.message {
                invalidateLoads()
                upsert(updated)
            } else {
                await load(session: session, forceRefresh: true)
            }
            persist(context: context)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func remove(
        session: MobileCaptureSession,
        message: MobileSessionConversationMessage
    ) async -> Bool {
        guard message.canEdit,
              !isMutating,
              let context = context(for: session) else { return false }
        isMutating = true
        errorMessage = nil
        defer { isMutating = false }
        do {
            let payload = try await mutate(
                context: context,
                method: "DELETE",
                body: [
                    "messageId": message.id,
                    "expectedRevision": message.revision,
                ]
            )
            guard let removed = payload.message else {
                throw Self.error("The removed message was not returned.", code: 500)
            }
            invalidateLoads()
            upsert(removed)
            persist(context: context)
            return true
        } catch {
            errorMessage = error.localizedDescription
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
              hint.threadKey == "session:\(context.roomID)" else { return }
        lastReceivedLiveMessageID = hint.messageId
        await load(session: session, forceRefresh: true, quietly: true)
    }

    static func clearProtectedCache() {
        guard let root = protectedCacheRoot else { return }
        try? FileManager.default.removeItem(at: root)
    }

    private struct Context {
        let roomID: String
        let endpoint: URL
    }

    private func context(for session: MobileCaptureSession) -> Context? {
        let roomID = session.callRoomId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !roomID.isEmpty,
              roomID.count <= 240,
              roomID.range(
                of: #"^[A-Za-z0-9][A-Za-z0-9_-]*$"#,
                options: .regularExpression
              ) != nil else { return nil }
        let endpoint = baseURL
            .appendingPathComponent("api", isDirectory: true)
            .appendingPathComponent("sessions", isDirectory: true)
            .appendingPathComponent(roomID, isDirectory: true)
            .appendingPathComponent("conversation", isDirectory: false)
        return Context(roomID: roomID, endpoint: endpoint)
    }

    private func mutate(
        context: Context,
        method: String,
        body: [String: Any]
    ) async throws -> MobileSessionConversationResponse {
        guard AuthManager.shared.networkActionsAllowed else {
            throw Self.error("Connect to Nest before changing this conversation.", code: 503)
        }
        var request = URLRequest(url: context.endpoint)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
        try validateOrigin(response.url)
        let payload = try JSONDecoder().decode(
            MobileSessionConversationResponse.self,
            from: data
        )
        guard response.statusCode < 400, payload.ok else {
            throw Self.error(
                payload.error ?? "The Session conversation could not be updated.",
                code: response.statusCode
            )
        }
        return payload
    }

    private func markRead(context: Context, messageID: String) async {
        _ = try? await mutate(
            context: context,
            method: "POST",
            body: ["action": "MARK_READ", "lastReadMessageId": messageID]
        )
    }

    private func upsert(_ message: MobileSessionConversationMessage) {
        messages.removeAll(where: { $0.id == message.id })
        messages.append(message)
        messages.sort { left, right in
            if left.createdAt == right.createdAt { return left.id < right.id }
            return left.createdAt < right.createdAt
        }
        messages = Array(messages.suffix(200))
    }

    private func invalidateLoads() {
        loadGeneration += 1
        isLoading = false
    }

    private func validateOrigin(_ candidate: URL?) throws {
        guard candidate?.scheme?.lowercased() == baseURL.scheme?.lowercased(),
              candidate?.host?.lowercased() == baseURL.host?.lowercased(),
              candidate?.port == baseURL.port,
              candidate?.user == nil,
              candidate?.password == nil else {
            throw Self.error(
                "The protected conversation response left the configured Nest origin.",
                code: 502
            )
        }
    }

    private func reset() {
        stopPolling()
        loadGeneration += 1
        currentRoomID = nil
        messages = []
        title = "Session conversation"
        canWrite = false
        isLoading = false
        isSending = false
        isMutating = false
        isUsingProtectedCache = false
        statusMessage = nil
        errorMessage = nil
        pendingSend = nil
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
            let cache = try decoder.decode(MobileSessionConversationCache.self, from: data)
            let age = Date().timeIntervalSince(cache.savedAt)
            guard cache.schemaVersion == 1,
                  cache.ownerDigest == Self.digest(owner.ownerAccountID),
                  cache.roomID == context.roomID,
                  age >= 0,
                  age <= 30 * 24 * 60 * 60 else {
                try? FileManager.default.removeItem(at: url)
                return false
            }
            messages = cache.messages
            title = cache.title
            canWrite = false
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
        let cache = MobileSessionConversationCache(
            schemaVersion: 1,
            ownerDigest: Self.digest(owner.ownerAccountID),
            roomID: context.roomID,
            savedAt: Date(),
            title: title,
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
        } catch {
            print("Protected Session conversation cache could not be updated: \(error.localizedDescription)")
        }
    }

    private func cacheURL(
        context: Context,
        owner: AuthManager.StableOwnerSnapshot
    ) -> URL? {
        Self.protectedCacheRoot?
            .appendingPathComponent(Self.digest(owner.ownerAccountID), isDirectory: true)
            .appendingPathComponent("\(Self.digest(context.roomID)).json")
    }

    nonisolated private static var protectedCacheRoot: URL? {
        FileManager.default.urls(
            for: .applicationSupportDirectory,
            in: .userDomainMask
        ).first?
            .appendingPathComponent(
                "QuipslyCapture/SessionConversation",
                isDirectory: true
            )
    }

    nonisolated private static func digest(_ value: String) -> String {
        SHA256.hash(data: Data(value.utf8))
            .map { String(format: "%02x", $0) }
            .joined()
    }

    nonisolated private static func timestamp(_ date: Date) -> String {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter.string(from: date)
    }

    nonisolated private static func error(_ message: String, code: Int) -> NSError {
        NSError(
            domain: "MobileSessionConversation",
            code: code,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

struct MobileSessionConversationCard: View {
    @ObservedObject var client: MobileSessionConversationClient
    let session: MobileCaptureSession
    let previewOnly: Bool
    @State private var isPresented = false

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                Label("Conversation", systemImage: "bubble.left.and.bubble.right.fill")
                    .font(.headline)
                Spacer()
                Text(client.isUsingProtectedCache
                    ? "Offline copy"
                    : (client.statusMessage ?? "Session"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(client.isUsingProtectedCache ? .orange : .secondary)
            }

            if client.isLoading && client.messages.isEmpty {
                ProgressView("Loading conversation…")
            } else if let latest = client.latestMessage {
                Text(latest.author.label)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tint)
                Text(latest.deletedAt == nil ? latest.body : "Message removed")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .accessibilityIdentifier("CaptureSessionChatLatestMessage")
            } else {
                Text("Share an agenda, a link, or what you want to cover with everyone in this Session.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            Button {
                isPresented = true
            } label: {
                Label("Open conversation", systemImage: "bubble.left.and.bubble.right.fill")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(client.isLoading && client.messages.isEmpty)
            .accessibilityIdentifier("CaptureSessionChatOpenButton")

            if let errorMessage = client.errorMessage {
                Text(errorMessage)
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .accessibilityIdentifier("CaptureSessionChatError")
            }
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureSessionChatCard")
        .sheet(isPresented: $isPresented) {
            MobileSessionConversationThread(
                client: client,
                session: session,
                previewOnly: previewOnly
            )
        }
    }
}

private struct MobileSessionConversationThread: View {
    @ObservedObject var client: MobileSessionConversationClient
    let session: MobileCaptureSession
    let previewOnly: Bool
    @Environment(\.dismiss) private var dismiss
    @State private var draft = ""
    @State private var replyTo: MobileSessionConversationMessage?
    @State private var editing: MobileSessionConversationMessage?
    @State private var editDraft = ""
    @State private var removeCandidate: MobileSessionConversationMessage?

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                ScrollViewReader { proxy in
                    ScrollView {
                        LazyVStack(spacing: 10) {
                            boundary
                            ForEach(client.messages) { message in
                                messageRow(message)
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
            .navigationTitle(client.title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Done") { dismiss() }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        Task { await client.load(session: session, forceRefresh: true) }
                    } label: {
                        if client.isLoading { ProgressView() }
                        else { Image(systemName: "arrow.clockwise") }
                    }
                    .disabled(client.isLoading || previewOnly)
                    .accessibilityLabel("Refresh session conversation")
                    .accessibilityIdentifier("CaptureSessionChatRefreshButton")
                }
            }
            .confirmationDialog(
                "Remove this message?",
                isPresented: Binding(
                    get: { removeCandidate != nil },
                    set: { if !$0 { removeCandidate = nil } }
                ),
                titleVisibility: .visible
            ) {
                Button("Remove message", role: .destructive) {
                    guard let message = removeCandidate else { return }
                    Task {
                        if await client.remove(session: session, message: message) {
                            removeCandidate = nil
                            if replyTo?.id == message.id { replyTo = nil }
                        }
                    }
                }
                Button("Keep message", role: .cancel) { removeCandidate = nil }
            }
        }
        .accessibilityIdentifier("CaptureSessionChatThread")
    }

    private var boundary: some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(
                client.isUsingProtectedCache ? "Protected offline copy" : "Session conversation",
                systemImage: client.isUsingProtectedCache ? "lock.fill" : "person.2.fill"
            )
            .font(.subheadline.weight(.bold))
            Text("Messages stay with this Session. Personal notes and commitments stay in Notes and Work.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("CaptureSessionChatBoundary")
    }

    @ViewBuilder
    private func messageRow(_ message: MobileSessionConversationMessage) -> some View {
        HStack(alignment: .bottom, spacing: 6) {
            if message.author.isCurrentActor { Spacer(minLength: 46) }
            VStack(alignment: message.author.isCurrentActor ? .trailing : .leading, spacing: 4) {
                if !message.author.isCurrentActor {
                    Text(message.author.label)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                }
                HStack(alignment: .top, spacing: 5) {
                    if message.author.isCurrentActor,
                       message.deletedAt == nil,
                       client.canWrite,
                       !previewOnly {
                        messageMenu(message)
                    }
                    VStack(alignment: .leading, spacing: 6) {
                        if let reply = message.replyTo {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(reply.authorLabel).font(.caption2.weight(.bold))
                                Text(reply.body).font(.caption2).lineLimit(2)
                            }
                            .padding(.leading, 7)
                            .overlay(alignment: .leading) {
                                Rectangle().frame(width: 2).opacity(0.45)
                            }
                        }
                        Text(message.deletedAt == nil ? message.body : "Message removed")
                            .italic(message.deletedAt != nil)
                            .textSelection(.enabled)
                            .fixedSize(horizontal: false, vertical: true)
                        HStack(spacing: 3) {
                            Text(Self.formattedTime(message.createdAt))
                            if message.editedAt != nil && message.deletedAt == nil {
                                Text("· Edited")
                            }
                        }
                        .font(.caption2)
                        .opacity(0.7)
                    }
                    .padding(12)
                    .foregroundStyle(message.author.isCurrentActor ? Color.white : Color.primary)
                    .background(
                        message.author.isCurrentActor ? Color.accentColor : Color.secondary.opacity(0.1),
                        in: RoundedRectangle(cornerRadius: 16, style: .continuous)
                    )
                    if !message.author.isCurrentActor,
                       message.deletedAt == nil,
                       client.canWrite,
                       !previewOnly {
                        messageMenu(message)
                    }
                }
            }
            if !message.author.isCurrentActor { Spacer(minLength: 46) }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureSessionChatMessage_\(message.id)")
    }

    private func messageMenu(_ message: MobileSessionConversationMessage) -> some View {
        Menu {
            Button {
                editing = nil
                replyTo = message
            } label: {
                Label("Reply", systemImage: "arrowshape.turn.up.left")
            }
            if message.canEdit {
                Button {
                    replyTo = nil
                    editing = message
                    editDraft = message.body
                } label: {
                    Label("Edit", systemImage: "pencil")
                }
                Button(role: .destructive) {
                    removeCandidate = message
                } label: {
                    Label("Remove", systemImage: "trash")
                }
            }
        } label: {
            Image(systemName: "ellipsis.circle")
                .frame(width: 36, height: 36)
        }
        .accessibilityLabel("Message actions")
    }

    private var composer: some View {
        VStack(alignment: .leading, spacing: 8) {
            if let errorMessage = client.errorMessage {
                Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
            }
            if let editing {
                HStack {
                    Text("Editing message").font(.caption.weight(.bold))
                    Spacer()
                    Button("Cancel") {
                        self.editing = nil
                        editDraft = ""
                    }
                }
                TextField("Edit message", text: $editDraft, axis: .vertical)
                    .lineLimit(2 ... 6)
                    .textFieldStyle(.roundedBorder)
                Button {
                    Task {
                        if await client.edit(
                            session: session,
                            message: editing,
                            body: editDraft
                        ) {
                            self.editing = nil
                            editDraft = ""
                        }
                    }
                } label: {
                    Label("Save changes", systemImage: "checkmark")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(editDraft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || client.isMutating)
            } else {
                if let replyTo {
                    HStack(alignment: .top) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text("Replying to \(replyTo.author.label)")
                                .font(.caption.weight(.bold))
                            Text(replyTo.body).font(.caption).lineLimit(1)
                        }
                        Spacer()
                        Button {
                            self.replyTo = nil
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                        }
                        .accessibilityLabel("Cancel reply")
                    }
                }
                HStack(alignment: .bottom, spacing: 8) {
                    TextField(
                        client.canWrite ? "Message everyone in this Session" : "View-only conversation",
                        text: $draft,
                        axis: .vertical
                    )
                    .lineLimit(2 ... 6)
                    .textFieldStyle(.roundedBorder)
                    .disabled(!client.canWrite || previewOnly)
                    .accessibilityIdentifier("CaptureSessionChatComposer")
                    Button {
                        let body = draft
                        let replyID = replyTo?.id
                        Task {
                            if await client.send(
                                session: session,
                                body: body,
                                replyToID: replyID
                            ) {
                                draft = ""
                                replyTo = nil
                            }
                        }
                    } label: {
                        if client.isSending { ProgressView() }
                        else { Image(systemName: "paperplane.fill") }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(
                        draft.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                            || !client.canWrite
                            || client.isSending
                            || previewOnly
                    )
                    .accessibilityLabel("Send Session message")
                    .accessibilityIdentifier("CaptureSessionChatSendButton")
                }
            }
        }
        .padding()
        .background(.regularMaterial)
    }

    nonisolated private static func formattedTime(_ value: String) -> String {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fractional.date(from: value)
            ?? ISO8601DateFormatter().date(from: value) else { return value }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}
