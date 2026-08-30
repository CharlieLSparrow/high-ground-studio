import Combine
import Foundation
import SwiftUI

struct MobileCoachingSessionPreparation: Codable, Equatable {
    struct ClientPlan: Codable, Equatable {
        let focus: String
        let desiredOutcome: String
        let successMeasure: String
        let progressScore: Int?
        let update: String
        let submittedAt: String?
    }

    struct CoachPrivatePlan: Codable, Equatable {
        let note: String
        let preparedAt: String?
    }

    let roomId: String
    let bookingId: String
    let role: String
    let revision: Int
    let client: ClientPlan
    let coachPrivate: CoachPrivatePlan?
}

private struct MobileCoachingSessionPreparationResponse: Decodable {
    let ok: Bool
    let error: String?
    let preparation: MobileCoachingSessionPreparation?
    let idempotentReplay: Bool?
}

private struct MobileClientSessionPreparationRequest: Encodable {
    let operation = "SAVE_CLIENT"
    let requestId: UUID
    let focus: String
    let desiredOutcome: String
    let successMeasure: String
    let progressScore: Int?
    let update: String
}

private struct MobileCoachSessionPreparationRequest: Encodable {
    let operation = "SAVE_COACH"
    let requestId: UUID
    let note: String
}

struct MobileCoachingSessionPreparationWorkingDraft: Codable, Equatable {
    let ownerAccountID: String
    let roomID: String
    let role: String
    let focus: String
    let desiredOutcome: String
    let successMeasure: String
    let progressScore: Int?
    let update: String
    let coachPrivateNote: String
    let baseRevision: Int?
    let updatedAt: Date
}

/// File-protected, account-partitioned working text for the pre-call plan.
/// This protects unfinished typing; it does not imply that anything has been
/// shared with the client, coach, or canonical Nest.
@MainActor
final class MobileCoachingSessionPreparationWorkingDraftStore {
    static let shared = MobileCoachingSessionPreparationWorkingDraftStore()

    private let fileManager: FileManager
    private let ledgerURL: URL
    private let lastKnownGoodURL: URL
    private var storedDrafts: [MobileCoachingSessionPreparationWorkingDraft] = []
    private var activeOwnerAccountID: String?
    private var accountObserver: NSObjectProtocol?

    init(
        fileManager: FileManager = .default,
        directoryURL: URL? = nil,
        initialOwnerAccountID: String? = nil,
        observeAccountChanges: Bool = true
    ) {
        self.fileManager = fileManager
        activeOwnerAccountID = Self.normalizedOwnerID(
            initialOwnerAccountID ?? AuthManager.currentStoredOwnerID()
        )
        let support = directoryURL
            ?? fileManager.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
                .appendingPathComponent("QuipslyCapture/CoachingPreparationWorkingDrafts", isDirectory: true)
            ?? URL(fileURLWithPath: NSHomeDirectory())
                .appendingPathComponent("Library/Application Support/QuipslyCapture/CoachingPreparationWorkingDrafts", isDirectory: true)
        ledgerURL = support.appendingPathComponent("coaching-preparation-working-drafts-v1.json")
        lastKnownGoodURL = support.appendingPathComponent("coaching-preparation-working-drafts-v1.last-known-good.json")

        do {
            try fileManager.createDirectory(at: support, withIntermediateDirectories: true)
            try? fileManager.setAttributes(
                [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication],
                ofItemAtPath: support.path
            )
            var protectedSupport = support
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            try? protectedSupport.setResourceValues(resourceValues)
            storedDrafts = try loadLedger()
        } catch {
            storedDrafts = []
        }

        if observeAccountChanges {
            accountObserver = NotificationCenter.default.addObserver(
                forName: .quipslyCaptureAccountIdentityDidChange,
                object: nil,
                queue: .main
            ) { [weak self] notification in
                MainActor.assumeIsolated {
                    self?.activeOwnerAccountID = Self.normalizedOwnerID(notification.object as? String)
                }
            }
        }
    }

    deinit {
        if let accountObserver {
            NotificationCenter.default.removeObserver(accountObserver)
        }
    }

    func draft(for roomID: String) -> MobileCoachingSessionPreparationWorkingDraft? {
        guard let owner = activeOwnerAccountID else { return nil }
        return storedDrafts.first {
            Self.normalizedOwnerID($0.ownerAccountID) == owner
                && $0.roomID == roomID
        }
    }

    @discardableResult
    func save(
        roomID: String,
        role: String,
        focus: String,
        desiredOutcome: String,
        successMeasure: String,
        progressScore: Int?,
        update: String,
        coachPrivateNote: String,
        baseRevision: Int?
    ) -> Bool {
        let cleanRoomID = roomID.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanRole = role.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let fields = [focus, desiredOutcome, successMeasure, update, coachPrivateNote]
        guard let owner = activeOwnerAccountID,
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()),
              !cleanRoomID.isEmpty,
              cleanRoomID.count <= 240,
              cleanRoomID.range(
                of: #"^[A-Za-z0-9][A-Za-z0-9_-]*$"#,
                options: .regularExpression
              ) != nil,
              ["client", "coach"].contains(cleanRole),
              fields.allSatisfy({ $0.count <= 100_000 }),
              fields.reduce(0, { $0 + $1.count }) <= 500_000,
              progressScore.map({ (0...10).contains($0) }) ?? true else {
            return false
        }
        let draft = MobileCoachingSessionPreparationWorkingDraft(
            ownerAccountID: owner,
            roomID: cleanRoomID,
            role: cleanRole,
            focus: focus,
            desiredOutcome: desiredOutcome,
            successMeasure: successMeasure,
            progressScore: progressScore,
            update: update,
            coachPrivateNote: coachPrivateNote,
            baseRevision: baseRevision,
            updatedAt: Date()
        )
        var updated = storedDrafts.filter {
            !(Self.normalizedOwnerID($0.ownerAccountID) == owner && $0.roomID == cleanRoomID)
        }
        updated.append(draft)
        return commit(updated)
    }

    func remove(roomID: String) {
        guard let owner = activeOwnerAccountID else { return }
        let updated = storedDrafts.filter {
            !(Self.normalizedOwnerID($0.ownerAccountID) == owner && $0.roomID == roomID)
        }
        _ = commit(updated)
    }

    private func commit(_ updated: [MobileCoachingSessionPreparationWorkingDraft]) -> Bool {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            let data = try encoder.encode(updated)
            try data.write(
                to: lastKnownGoodURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            try data.write(
                to: ledgerURL,
                options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication]
            )
            storedDrafts = updated
            return true
        } catch {
            return false
        }
    }

    private func loadLedger() throws -> [MobileCoachingSessionPreparationWorkingDraft] {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        for url in [ledgerURL, lastKnownGoodURL] where fileManager.fileExists(atPath: url.path) {
            if let data = try? Data(contentsOf: url),
               let drafts = try? decoder.decode(
                    [MobileCoachingSessionPreparationWorkingDraft].self,
                    from: data
               ) {
                return drafts
            }
        }
        return []
    }

    nonisolated private static func normalizedOwnerID(_ value: String?) -> String? {
        guard let normalized = value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased(),
              !normalized.isEmpty,
              normalized.count <= 256 else { return nil }
        return normalized
    }
}

@MainActor
final class MobileCoachingSessionPreparationClient: ObservableObject {
    @Published private(set) var preparation: MobileCoachingSessionPreparation?
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published private(set) var isUnavailable = false
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?

    private let baseURL: URL
    private var activeRoomID: String?
    private var pendingRequestID: UUID?
    private var pendingFingerprint: String?
    private var activeLoadID: UUID?
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

    func loadPreview(session: MobileCaptureSession) {
        reset()
        activeRoomID = session.callRoomId
        preparation = MobileCoachingSessionPreparation(
            roomId: session.callRoomId,
            bookingId: "preview-booking",
            role: "client",
            revision: 1,
            client: .init(
                focus: "Choose the most useful next step.",
                desiredOutcome: "Leave with a clear decision and plan.",
                successMeasure: "I know exactly what I will do next.",
                progressScore: 6,
                update: "I tried the first step and learned where I get stuck.",
                submittedAt: ISO8601DateFormatter().string(from: Date())
            ),
            coachPrivate: nil
        )
    }

    func load(session: MobileCaptureSession) async {
        let requestedRoomID = session.callRoomId
        guard let endpoint = endpoint(for: session.callRoomId) else {
            reset()
            isUnavailable = true
            return
        }
        if activeRoomID != session.callRoomId {
            reset()
            activeRoomID = session.callRoomId
        }
        guard AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Connect to Nest to load this Session plan."
            return
        }
        let loadID = UUID()
        activeLoadID = loadID
        isLoading = true
        errorMessage = nil
        defer {
            if activeLoadID == loadID {
                isLoading = false
            }
        }
        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "GET"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.url?.host == baseURL.host else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(
                MobileCoachingSessionPreparationResponse.self,
                from: data
            )
            guard activeLoadID == loadID,
                  activeRoomID == requestedRoomID else { return }
            if response.statusCode == 404 {
                isUnavailable = true
                preparation = nil
                return
            }
            guard response.statusCode < 400,
                  payload.ok,
                  let loaded = payload.preparation,
                  loaded.roomId == session.callRoomId else {
                throw Self.failure(payload.error ?? "This Session plan is unavailable.")
            }
            preparation = loaded
            isUnavailable = false
        } catch {
            if activeLoadID == loadID,
               activeRoomID == requestedRoomID {
                errorMessage = error.localizedDescription
            }
        }
    }

    func saveClient(
        session: MobileCaptureSession,
        focus: String,
        desiredOutcome: String,
        successMeasure: String,
        progressScore: Int?,
        update: String
    ) async -> Bool {
        let fingerprint = [
            "client", focus, desiredOutcome, successMeasure,
            progressScore.map(String.init) ?? "", update,
        ].joined(separator: "\u{1f}")
        let requestID = requestID(for: fingerprint)
        return await save(
            session: session,
            fingerprint: fingerprint,
            requestID: requestID,
            body: MobileClientSessionPreparationRequest(
                requestId: requestID,
                focus: focus,
                desiredOutcome: desiredOutcome,
                successMeasure: successMeasure,
                progressScore: progressScore,
                update: update
            ),
            successMessage: "Session plan saved. You can change it anytime."
        )
    }

    func saveCoach(
        session: MobileCaptureSession,
        note: String
    ) async -> Bool {
        let fingerprint = "coach\u{1f}\(note)"
        let requestID = requestID(for: fingerprint)
        return await save(
            session: session,
            fingerprint: fingerprint,
            requestID: requestID,
            body: MobileCoachSessionPreparationRequest(
                requestId: requestID,
                note: note
            ),
            successMessage: "Private coach prep saved."
        )
    }

    func reset() {
        preparation = nil
        isLoading = false
        isSaving = false
        isUnavailable = false
        statusMessage = nil
        errorMessage = nil
        activeRoomID = nil
        pendingRequestID = nil
        pendingFingerprint = nil
        activeLoadID = nil
    }

    private func save<Body: Encodable>(
        session: MobileCaptureSession,
        fingerprint: String,
        requestID: UUID,
        body: Body,
        successMessage: String
    ) async -> Bool {
        guard let endpoint = endpoint(for: session.callRoomId),
              AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Connect to Nest to save this Session plan. Your text is still here."
            return false
        }
        isSaving = true
        errorMessage = nil
        statusMessage = nil
        defer { isSaving = false }
        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "PUT"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONEncoder().encode(body)
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.url?.host == baseURL.host else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(
                MobileCoachingSessionPreparationResponse.self,
                from: data
            )
            guard response.statusCode < 400,
                  payload.ok,
                  let saved = payload.preparation,
                  saved.roomId == session.callRoomId else {
                throw Self.failure(
                    payload.error
                        ?? "Preparation could not be saved. Your text is still here; try again."
                )
            }
            guard activeRoomID == session.callRoomId else { return false }
            preparation = saved
            pendingFingerprint = nil
            pendingRequestID = nil
            statusMessage = successMessage
            return true
        } catch {
            pendingFingerprint = fingerprint
            pendingRequestID = requestID
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func requestID(for fingerprint: String) -> UUID {
        if pendingFingerprint == fingerprint, let pendingRequestID {
            return pendingRequestID
        }
        let next = UUID()
        pendingFingerprint = fingerprint
        pendingRequestID = next
        return next
    }

    private func endpoint(for rawRoomID: String) -> URL? {
        let roomID = rawRoomID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !roomID.isEmpty,
              roomID.count <= 240,
              roomID.range(
                of: #"^[A-Za-z0-9][A-Za-z0-9_-]*$"#,
                options: .regularExpression
              ) != nil else { return nil }
        return baseURL
            .appendingPathComponent("api", isDirectory: true)
            .appendingPathComponent("sessions", isDirectory: true)
            .appendingPathComponent(roomID, isDirectory: true)
            .appendingPathComponent("preparation", isDirectory: false)
    }

    private static func failure(_ message: String) -> NSError {
        NSError(
            domain: "QuipslyCoachingSessionPreparation",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }
}

struct MobileCoachingSessionPreparationCard: View {
    private struct EditorSnapshot: Equatable {
        let role: String
        let focus: String
        let desiredOutcome: String
        let successMeasure: String
        let progressScore: Int?
        let update: String
        let coachPrivateNote: String

        init(preparation: MobileCoachingSessionPreparation) {
            role = preparation.role.lowercased()
            focus = preparation.client.focus
            desiredOutcome = preparation.client.desiredOutcome
            successMeasure = preparation.client.successMeasure
            progressScore = preparation.client.progressScore
            update = preparation.client.update
            coachPrivateNote = preparation.coachPrivate?.note ?? ""
        }

        init(
            role: String,
            focus: String,
            desiredOutcome: String,
            successMeasure: String,
            progressScore: Int?,
            update: String,
            coachPrivateNote: String
        ) {
            self.role = role
            self.focus = focus
            self.desiredOutcome = desiredOutcome
            self.successMeasure = successMeasure
            self.progressScore = progressScore
            self.update = update
            self.coachPrivateNote = coachPrivateNote
        }

        var hasMeaningfulContent: Bool {
            progressScore != nil || [
                focus,
                desiredOutcome,
                successMeasure,
                update,
                coachPrivateNote,
            ].contains { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        }
    }

    @ObservedObject var client: MobileCoachingSessionPreparationClient
    let session: MobileCaptureSession
    let previewOnly: Bool

    @Environment(\.scenePhase) private var scenePhase
    @FocusState private var preparationEditorIsFocused: Bool
    @State private var focus: String
    @State private var desiredOutcome: String
    @State private var successMeasure: String
    @State private var progressScore: Int?
    @State private var update: String
    @State private var coachPrivateNote: String
    @State private var hydratedRevision: Int?
    @State private var canonicalSnapshot: EditorSnapshot?
    @State private var workingDraftRole: String?
    @State private var workingDraftWasRestored: Bool
    @State private var workingDraftStatus: String?
    @State private var workingDraftError: String?
    @State private var workingDraftSaveTask: Task<Void, Never>?
    private let workingDraftStore = MobileCoachingSessionPreparationWorkingDraftStore.shared

    init(
        client: MobileCoachingSessionPreparationClient,
        session: MobileCaptureSession,
        previewOnly: Bool
    ) {
        self.client = client
        self.session = session
        self.previewOnly = previewOnly
        let draft = MobileCoachingSessionPreparationWorkingDraftStore.shared.draft(
            for: session.callRoomId
        )
        _focus = State(initialValue: draft?.focus ?? "")
        _desiredOutcome = State(initialValue: draft?.desiredOutcome ?? "")
        _successMeasure = State(initialValue: draft?.successMeasure ?? "")
        _progressScore = State(initialValue: draft?.progressScore)
        _update = State(initialValue: draft?.update ?? "")
        _coachPrivateNote = State(initialValue: draft?.coachPrivateNote ?? "")
        _hydratedRevision = State(initialValue: nil)
        _canonicalSnapshot = State(initialValue: nil)
        _workingDraftRole = State(initialValue: draft?.role)
        _workingDraftWasRestored = State(initialValue: draft != nil)
        _workingDraftStatus = State(
            initialValue: draft == nil
                ? nil
                : "Recovered your saved iPhone draft."
        )
        _workingDraftError = State(initialValue: nil)
        _workingDraftSaveTask = State(initialValue: nil)
    }

    var body: some View {
        Group {
            if !client.isUnavailable {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "scope")
                            .font(.title3.weight(.bold))
                            .foregroundStyle(.purple)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("OPTIONAL · BEFORE THE CALL")
                                .font(.caption2.weight(.black))
                                .foregroundStyle(.purple)
                            Text("Plan this Session")
                                .font(.headline)
                            Text("A little focus helps you spend the call on what matters. Nothing here is required to join.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                    }

                    if client.isLoading && client.preparation == nil {
                        HStack(spacing: 10) {
                            ProgressView()
                            Text("Loading your Session plan…")
                                .font(.caption.weight(.semibold))
                        }
                    } else if client.preparation?.role == "client" {
                        clientForm
                    } else if client.preparation?.role == "coach" {
                        coachForm
                    }

                    if let message = client.statusMessage {
                        Label(message, systemImage: "checkmark.circle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.green)
                            .accessibilityIdentifier("CaptureSessionPreparationSaved")
                    }
                    if let error = client.errorMessage {
                        VStack(alignment: .leading, spacing: 8) {
                            Label(error, systemImage: "exclamationmark.circle")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.orange)
                            if client.preparation == nil {
                                Button("Try again") {
                                    Task { await client.load(session: session) }
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.large)
                            }
                        }
                        .accessibilityIdentifier("CaptureSessionPreparationError")
                    }
                }
                .captureCard()
            }
        }
        .task(id: "session-preparation|\(session.callRoomId)|\(previewOnly)") {
            if previewOnly {
                client.loadPreview(session: session)
            } else {
                await client.load(session: session)
            }
            hydrateIfNeeded(force: true)
        }
        .onChange(of: client.preparation?.revision) { _, _ in
            hydrateIfNeeded(force: false)
        }
        .onChange(of: focus) { _, _ in scheduleWorkingDraftSave() }
        .onChange(of: desiredOutcome) { _, _ in scheduleWorkingDraftSave() }
        .onChange(of: successMeasure) { _, _ in scheduleWorkingDraftSave() }
        .onChange(of: progressScore) { _, _ in scheduleWorkingDraftSave() }
        .onChange(of: update) { _, _ in scheduleWorkingDraftSave() }
        .onChange(of: coachPrivateNote) { _, _ in scheduleWorkingDraftSave() }
        .onChange(of: scenePhase) { _, phase in
            guard phase != .active else { return }
            workingDraftSaveTask?.cancel()
            saveWorkingDraftImmediately()
        }
        .onDisappear {
            workingDraftSaveTask?.cancel()
            saveWorkingDraftImmediately()
        }
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    preparationEditorIsFocused = false
                }
                .accessibilityIdentifier("CaptureSessionPreparationKeyboardDone")
            }
        }
    }

    private var clientForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            preparationEditor(
                title: "What would make this Session useful?",
                prompt: "The situation, decision, or goal you want to focus on",
                text: $focus,
                identifier: "CaptureSessionPreparationFocus"
            )
            preparationEditor(
                title: "What would you like to leave with?",
                prompt: "Clarity, a decision, a plan, or another useful result",
                text: $desiredOutcome,
                identifier: "CaptureSessionPreparationOutcome"
            )
            preparationEditor(
                title: "How will you know the Session helped?",
                prompt: "What will feel different by the end?",
                text: $successMeasure,
                identifier: "CaptureSessionPreparationSuccess"
            )
            preparationEditor(
                title: "What has changed since last time?",
                prompt: "Wins, obstacles, experiments, or anything your coach should know",
                text: $update,
                identifier: "CaptureSessionPreparationUpdate"
            )
            Picker("Progress (optional)", selection: $progressScore) {
                Text("Not set").tag(Int?.none)
                ForEach(0...10, id: \.self) { score in
                    Text("\(score) / 10").tag(Int?.some(score))
                }
            }
            .pickerStyle(.menu)
            .accessibilityIdentifier("CaptureSessionPreparationProgress")

            Button {
                Task {
                    let saved = await client.saveClient(
                        session: session,
                        focus: focus,
                        desiredOutcome: desiredOutcome,
                        successMeasure: successMeasure,
                        progressScore: progressScore,
                        update: update
                    )
                    if saved { finishCanonicalSave() }
                }
            } label: {
                if client.isSaving {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text("Save Session plan").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(client.isSaving || previewOnly)
            .accessibilityIdentifier("CaptureSessionPreparationSaveClient")

            workingDraftState

            Text("Shared only with your assigned coach · editable anytime")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
    }

    private var coachForm: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Label("Client check-in", systemImage: "person.crop.circle.badge.checkmark")
                    .font(.subheadline.weight(.bold))
                clientSummary("Focus", value: client.preparation?.client.focus)
                clientSummary("Desired outcome", value: client.preparation?.client.desiredOutcome)
                clientSummary("Success measure", value: client.preparation?.client.successMeasure)
                clientSummary("Since last time", value: client.preparation?.client.update)
                if let score = client.preparation?.client.progressScore {
                    clientSummary("Progress", value: "\(score) / 10")
                }
                if client.preparation?.client.submittedAt == nil {
                    Text("No client check-in yet. They can still join normally.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Divider()

            Label("Private coach prep", systemImage: "lock.fill")
                .font(.subheadline.weight(.bold))
            Text("Only you can see this. It is not copied into shared notes, tasks, or chat.")
                .font(.caption)
                .foregroundStyle(.secondary)
            TextEditor(text: $coachPrivateNote)
                .frame(minHeight: 112)
                .padding(8)
                .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                .focused($preparationEditorIsFocused)
                .accessibilityLabel("Private coach preparation")
                .accessibilityIdentifier("CaptureSessionPreparationCoachNote")

            Button {
                Task {
                    let saved = await client.saveCoach(
                        session: session,
                        note: coachPrivateNote
                    )
                    if saved { finishCanonicalSave() }
                }
            } label: {
                if client.isSaving {
                    ProgressView().frame(maxWidth: .infinity)
                } else {
                    Text("Save private prep").frame(maxWidth: .infinity)
                }
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(client.isSaving || previewOnly)
            .accessibilityIdentifier("CaptureSessionPreparationSaveCoach")

            workingDraftState
        }
    }

    private func preparationEditor(
        title: String,
        prompt: String,
        text: Binding<String>,
        identifier: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(title).font(.subheadline.weight(.bold))
            ZStack(alignment: .topLeading) {
                if text.wrappedValue.isEmpty {
                    Text(prompt)
                        .font(.body)
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 13)
                        .padding(.vertical, 16)
                        .allowsHitTesting(false)
                }
                TextEditor(text: text)
                    .frame(minHeight: 92)
                    .padding(8)
                    .scrollContentBackground(.hidden)
                    .background(.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12))
                    .focused($preparationEditorIsFocused)
                    .accessibilityIdentifier(identifier)
            }
        }
    }

    @ViewBuilder
    private var workingDraftState: some View {
        if let workingDraftStatus {
            Label(workingDraftStatus, systemImage: "checkmark.icloud")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("CaptureSessionPreparationWorkingDraftStatus")
        }
        if let workingDraftError {
            Label(workingDraftError, systemImage: "exclamationmark.triangle")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
                .accessibilityIdentifier("CaptureSessionPreparationWorkingDraftError")
        }
    }

    @ViewBuilder
    private func clientSummary(_ label: String, value: String?) -> some View {
        if let value = value?.trimmingCharacters(in: .whitespacesAndNewlines), !value.isEmpty {
            VStack(alignment: .leading, spacing: 2) {
                Text(label.uppercased())
                    .font(.caption2.weight(.black))
                    .foregroundStyle(.secondary)
                Text(value)
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
    }

    private func hydrateIfNeeded(force: Bool) {
        guard let preparation = client.preparation else { return }
        guard force || hydratedRevision != preparation.revision else { return }
        let nextCanonical = EditorSnapshot(preparation: preparation)
        let current = editorSnapshot
        let mayReplaceEditor: Bool
        if let canonicalSnapshot {
            mayReplaceEditor = current == canonicalSnapshot
        } else {
            mayReplaceEditor = !workingDraftWasRestored && !current.hasMeaningfulContent
        }
        hydratedRevision = preparation.revision
        canonicalSnapshot = nextCanonical
        if mayReplaceEditor {
            apply(nextCanonical)
            workingDraftRole = nextCanonical.role
            workingDraftWasRestored = false
            workingDraftStatus = nil
            workingDraftStore.remove(roomID: session.callRoomId)
        } else if current == nextCanonical {
            workingDraftWasRestored = false
            workingDraftStatus = nil
            workingDraftStore.remove(roomID: session.callRoomId)
        } else {
            let currentRole = current.role.trimmingCharacters(in: .whitespacesAndNewlines)
            workingDraftRole = currentRole.isEmpty ? nextCanonical.role : currentRole
            saveWorkingDraftImmediately()
        }
    }

    private var editorSnapshot: EditorSnapshot {
        EditorSnapshot(
            role: client.preparation?.role.lowercased()
                ?? workingDraftRole
                ?? "",
            focus: focus,
            desiredOutcome: desiredOutcome,
            successMeasure: successMeasure,
            progressScore: progressScore,
            update: update,
            coachPrivateNote: coachPrivateNote
        )
    }

    private var hasWorkingChanges: Bool {
        if let canonicalSnapshot {
            return editorSnapshot != canonicalSnapshot
        }
        return workingDraftWasRestored || editorSnapshot.hasMeaningfulContent
    }

    private func apply(_ snapshot: EditorSnapshot) {
        focus = snapshot.focus
        desiredOutcome = snapshot.desiredOutcome
        successMeasure = snapshot.successMeasure
        progressScore = snapshot.progressScore
        update = snapshot.update
        coachPrivateNote = snapshot.coachPrivateNote
    }

    private func scheduleWorkingDraftSave() {
        workingDraftSaveTask?.cancel()
        workingDraftSaveTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(220))
            guard !Task.isCancelled else { return }
            saveWorkingDraftImmediately()
        }
    }

    private func saveWorkingDraftImmediately() {
        guard hasWorkingChanges else {
            workingDraftStore.remove(roomID: session.callRoomId)
            workingDraftWasRestored = false
            workingDraftStatus = nil
            workingDraftError = nil
            return
        }
        let snapshot = editorSnapshot
        let saved = workingDraftStore.save(
            roomID: session.callRoomId,
            role: snapshot.role,
            focus: snapshot.focus,
            desiredOutcome: snapshot.desiredOutcome,
            successMeasure: snapshot.successMeasure,
            progressScore: snapshot.progressScore,
            update: snapshot.update,
            coachPrivateNote: snapshot.coachPrivateNote,
            baseRevision: canonicalSnapshot == nil ? nil : hydratedRevision
        )
        if saved {
            workingDraftWasRestored = true
            workingDraftStatus = "Saved on this iPhone while you work."
            workingDraftError = nil
        } else if ["client", "coach"].contains(snapshot.role) {
            workingDraftError = "This draft could not be protected on this iPhone yet. Keep this Session open and try again."
        }
    }

    private func finishCanonicalSave() {
        workingDraftSaveTask?.cancel()
        workingDraftStore.remove(roomID: session.callRoomId)
        workingDraftWasRestored = false
        workingDraftStatus = nil
        workingDraftError = nil
        if let preparation = client.preparation {
            canonicalSnapshot = EditorSnapshot(preparation: preparation)
            hydratedRevision = preparation.revision
        }
    }
}
