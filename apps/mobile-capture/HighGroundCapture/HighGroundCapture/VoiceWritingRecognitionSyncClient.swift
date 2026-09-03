import Combine
import Foundation

private struct VoiceRecognitionPendingOperation: Codable, Equatable, Identifiable {
    enum Kind: String, Codable {
        case bootstrap
        case setAdaptation = "set-adaptation"
        case learnPhrase = "learn-phrase"
        case forgetPhrase = "forget-phrase"
    }

    let id: UUID
    let ownerAccountID: String
    let kind: Kind
    let adaptationEnabled: Bool?
    let phrase: String?
    let phrases: [String]?
    let weight: Int?
    let createdAt: Date

    var requestBody: RequestBody {
        RequestBody(
            clientRequestId: id.uuidString.lowercased(),
            operationKind: kind.rawValue,
            adaptationEnabled: adaptationEnabled,
            phrase: phrase,
            phrases: phrases,
            weight: weight
        )
    }

    struct RequestBody: Encodable {
        let clientRequestId: String
        let operationKind: String
        let adaptationEnabled: Bool?
        let phrase: String?
        let phrases: [String]?
        let weight: Int?
    }
}

private struct VoiceRecognitionProfileEnvelope: Decodable {
    let ok: Bool
    let profile: Profile?
    let error: String?

    struct Profile: Decodable {
        let exists: Bool
        let revision: Int
        let adaptationEnabled: Bool
        let learnedPhrases: [Phrase]
    }

    struct Phrase: Decodable {
        let text: String
        let count: Int
        let updatedAt: String
    }
}

/// Account-scoped, local-first speech preference synchronization. Every local
/// choice is usable immediately and placed in an idempotent outbox. Network or
/// server failure cannot block recording, transcription, correction, or the
/// original audio; the outbox retries when Capture next becomes active.
@MainActor
final class VoiceWritingRecognitionSyncClient: ObservableObject {
    static let shared = VoiceWritingRecognitionSyncClient()

    @Published private(set) var isSyncing = false
    @Published private(set) var lastSyncError: String?
    @Published private(set) var lastSyncedAt: Date?

    private let defaults: UserDefaults
    private let operationsKey = "com.quipsly.capture.voiceWriting.recognitionOutbox.v1"
    private let bootstrappedOwnersKey = "com.quipsly.capture.voiceWriting.recognitionBootstrap.v1"
    private let nestBaseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )
    private var scheduledTask: Task<Void, Never>?

    init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
    }

    func enqueueAdaptation(_ enabled: Bool, ownerAccountID: String?) {
        guard let owner = Self.normalizedOwnerID(ownerAccountID) else { return }
        enqueue(.init(
            id: UUID(),
            ownerAccountID: owner,
            kind: .setAdaptation,
            adaptationEnabled: enabled,
            phrase: nil,
            phrases: nil,
            weight: nil,
            createdAt: Date()
        ))
    }

    func enqueueLearnedPhrase(_ phrase: String, weight: Int, ownerAccountID: String?) {
        guard let owner = Self.normalizedOwnerID(ownerAccountID),
              let phrase = Self.normalizedPhrase(phrase) else { return }
        enqueue(.init(
            id: UUID(),
            ownerAccountID: owner,
            kind: .learnPhrase,
            adaptationEnabled: nil,
            phrase: phrase,
            phrases: nil,
            weight: min(max(weight, 1), 10),
            createdAt: Date()
        ))
    }

    func enqueueForgottenPhrase(_ phrase: String, ownerAccountID: String?) {
        guard let owner = Self.normalizedOwnerID(ownerAccountID),
              let phrase = Self.normalizedPhrase(phrase) else { return }
        enqueue(.init(
            id: UUID(),
            ownerAccountID: owner,
            kind: .forgetPhrase,
            adaptationEnabled: nil,
            phrase: phrase,
            phrases: nil,
            weight: nil,
            createdAt: Date()
        ))
    }

    func synchronize(ownerAccountID: String? = AuthManager.currentStoredOwnerID()) async {
        guard !isSyncing,
              AuthManager.shared.networkActionsAllowed,
              let owner = Self.normalizedOwnerID(ownerAccountID),
              owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID()),
              let endpoint = URL(string: "\(nestBaseURL)/api/mobile/capture/speech-profile") else { return }

        ensureBootstrapQueued(for: owner)
        isSyncing = true
        lastSyncError = nil
        defer { isSyncing = false }
        do {
            while let operation = operations().first(where: { $0.ownerAccountID == owner }) {
                var request = URLRequest(url: endpoint)
                request.httpMethod = "POST"
                request.setValue("application/json", forHTTPHeaderField: "Content-Type")
                request.setValue("application/json", forHTTPHeaderField: "Accept")
                request.httpBody = try JSONEncoder().encode(operation.requestBody)
                let (data, response) = try await AuthManager.shared.authenticatedData(
                    for: request,
                    expectedOwnerAccountID: owner
                )
                let payload = try JSONDecoder().decode(VoiceRecognitionProfileEnvelope.self, from: data)
                guard (200...299).contains(response.statusCode), payload.ok else {
                    throw NSError(
                        domain: "QuipslyVoiceRecognition",
                        code: response.statusCode,
                        userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Speech preferences could not sync yet."]
                    )
                }
                remove(operationID: operation.id)
                if operation.kind == .bootstrap { markBootstrapped(owner) }
            }

            var request = URLRequest(url: endpoint)
            request.httpMethod = "GET"
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await AuthManager.shared.authenticatedData(
                for: request,
                expectedOwnerAccountID: owner
            )
            let payload = try JSONDecoder().decode(VoiceRecognitionProfileEnvelope.self, from: data)
            guard (200...299).contains(response.statusCode), payload.ok, let profile = payload.profile else {
                throw NSError(
                    domain: "QuipslyVoiceRecognition",
                    code: response.statusCode,
                    userInfo: [NSLocalizedDescriptionKey: payload.error ?? "Speech preferences could not refresh yet."]
                )
            }
            let phrases = profile.learnedPhrases.compactMap { phrase -> VoiceWritingRecognitionSyncedPhrase? in
                guard let date = Self.serverDate(phrase.updatedAt) else { return nil }
                return VoiceWritingRecognitionSyncedPhrase(
                    text: phrase.text,
                    count: phrase.count,
                    updatedAt: date
                )
            }
            VoiceWritingRecognitionPreferences.shared.applySyncedProfile(
                adaptationEnabled: profile.adaptationEnabled,
                learnedPhrases: phrases,
                ownerAccountID: owner
            )
            lastSyncedAt = Date()
        } catch {
            lastSyncError = error.localizedDescription
        }
    }

    private func enqueue(_ operation: VoiceRecognitionPendingOperation) {
        var pending = operations()
        pending.append(operation)
        persist(pending)
        scheduledTask?.cancel()
        scheduledTask = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(500))
            guard !Task.isCancelled else { return }
            await self?.synchronize(ownerAccountID: operation.ownerAccountID)
        }
    }

    private func ensureBootstrapQueued(for owner: String) {
        guard !bootstrappedOwners().contains(owner),
              !operations().contains(where: { $0.ownerAccountID == owner && $0.kind == .bootstrap }) else { return }
        let preferences = VoiceWritingRecognitionPreferences.shared
        var pending = operations()
        pending.insert(.init(
            id: UUID(),
            ownerAccountID: owner,
            kind: .bootstrap,
            adaptationEnabled: preferences.profile(for: owner).adaptsToSpeech,
            phrase: nil,
            phrases: preferences.learnedPhrases(for: owner),
            weight: nil,
            createdAt: Date()
        ), at: pending.firstIndex(where: { $0.ownerAccountID == owner }) ?? pending.endIndex)
        persist(pending)
    }

    private func operations() -> [VoiceRecognitionPendingOperation] {
        guard let data = defaults.data(forKey: operationsKey),
              let values = try? JSONDecoder().decode([VoiceRecognitionPendingOperation].self, from: data) else {
            return []
        }
        return values.sorted { left, right in
            if left.createdAt != right.createdAt { return left.createdAt < right.createdAt }
            return left.id.uuidString < right.id.uuidString
        }
    }

    private func persist(_ values: [VoiceRecognitionPendingOperation]) {
        guard let data = try? JSONEncoder().encode(values) else { return }
        defaults.set(data, forKey: operationsKey)
    }

    private func remove(operationID: UUID) {
        persist(operations().filter { $0.id != operationID })
    }

    private func bootstrappedOwners() -> Set<String> {
        Set(defaults.stringArray(forKey: bootstrappedOwnersKey) ?? [])
    }

    private func markBootstrapped(_ owner: String) {
        var values = bootstrappedOwners()
        values.insert(owner)
        defaults.set(Array(values).sorted(), forKey: bootstrappedOwnersKey)
    }

    private static func normalizedOwnerID(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines)
        return normalized?.isEmpty == false ? normalized : nil
    }

    private static func normalizedPhrase(_ value: String) -> String? {
        let normalized = value
            .split(whereSeparator: { $0.isWhitespace })
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !normalized.isEmpty,
              normalized.count <= 80,
              normalized.split(separator: " ").count <= 8 else { return nil }
        return normalized
    }

    private static func serverDate(_ value: String) -> Date? {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let date = fractional.date(from: value) { return date }
        return ISO8601DateFormatter().date(from: value)
    }
}
