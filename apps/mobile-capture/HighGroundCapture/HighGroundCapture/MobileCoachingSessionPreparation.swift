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
        isLoading = true
        errorMessage = nil
        defer { isLoading = false }
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
            errorMessage = error.localizedDescription
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
    @ObservedObject var client: MobileCoachingSessionPreparationClient
    let session: MobileCaptureSession
    let previewOnly: Bool

    @State private var focus = ""
    @State private var desiredOutcome = ""
    @State private var successMeasure = ""
    @State private var progressScore: Int?
    @State private var update = ""
    @State private var coachPrivateNote = ""
    @State private var hydratedRevision: Int?

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
                .accessibilityIdentifier("CaptureSessionPreparationCard")
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
                    _ = await client.saveClient(
                        session: session,
                        focus: focus,
                        desiredOutcome: desiredOutcome,
                        successMeasure: successMeasure,
                        progressScore: progressScore,
                        update: update
                    )
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
                .accessibilityLabel("Private coach preparation")
                .accessibilityIdentifier("CaptureSessionPreparationCoachNote")

            Button {
                Task {
                    _ = await client.saveCoach(
                        session: session,
                        note: coachPrivateNote
                    )
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
            }
            .accessibilityIdentifier(identifier)
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
        hydratedRevision = preparation.revision
        focus = preparation.client.focus
        desiredOutcome = preparation.client.desiredOutcome
        successMeasure = preparation.client.successMeasure
        progressScore = preparation.client.progressScore
        update = preparation.client.update
        coachPrivateNote = preparation.coachPrivate?.note ?? ""
    }
}
