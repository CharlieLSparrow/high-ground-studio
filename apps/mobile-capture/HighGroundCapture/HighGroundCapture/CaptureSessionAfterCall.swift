import Combine
import Foundation

struct CaptureSessionAfterCallSummary: Decodable, Equatable {
    struct Recordings: Decodable, Equatable {
        let uploaded: Int
        let pending: Int
        let attention: Int
    }
    struct Transcripts: Decodable, Equatable {
        let available: Int
        let processing: Int
        let attention: Int
    }
    let roomId: String
    let recordings: Recordings
    let transcripts: Transcripts
    let transcriptSourceId: String?

    func matches(roomID: String) -> Bool {
        roomId == roomID
            && [recordings.uploaded, recordings.pending, recordings.attention,
                transcripts.available, transcripts.processing, transcripts.attention].allSatisfy { $0 >= 0 }
            && (transcriptSourceId == nil || !(transcriptSourceId?.isEmpty ?? true) && (transcriptSourceId?.count ?? 0) <= 240)
    }
    var isProcessing: Bool { recordings.pending > 0 || transcripts.processing > 0 }
    /// A multi-source session opens the assembled conversation. A single
    /// source keeps its exact binding instead of choosing unrelated room text.
    var focusedTranscriptAssetID: String? {
        transcripts.available == 1 && recordings.uploaded == 1 && recordings.pending == 0 && recordings.attention == 0
            ? transcriptSourceId : nil
    }
}

private struct CaptureSessionAfterCallResponse: Decodable {
    let ok: Bool
    let summary: CaptureSessionAfterCallSummary?
}

/// Reads the same shared availability as Nest; it does not infer remote uploads
/// from this device's library or treat playback availability as transcript accuracy.
@MainActor
final class CaptureSessionAfterCallClient: ObservableObject {
    @Published private(set) var summary: CaptureSessionAfterCallSummary?
    @Published private(set) var errorMessage: String?
    private var scope = ""
    private var generation = 0
    private var accountObservation: AnyCancellable?
    private let baseURL: URL
    private let ownerID: @MainActor () -> String?
    private let transport: @MainActor (URLRequest) async throws -> (Data, HTTPURLResponse)

    init(baseURL: URL? = nil,
         ownerID: @escaping @MainActor () -> String? = { AuthManager.shared.stableOwnerSnapshot()?.ownerAccountID },
         transport: @escaping @MainActor (URLRequest) async throws -> (Data, HTTPURLResponse) = { try await AuthManager.shared.authenticatedData(for: $0, transitionToOfflineOnNetworkFailure: false) }) {
        self.baseURL = baseURL ?? URL(string: normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com"))!
        self.ownerID = ownerID
        self.transport = transport
        accountObservation = NotificationCenter.default.publisher(for: .quipslyCaptureAccountIdentityDidChange)
            .sink { [weak self] _ in Task { @MainActor in self?.reset() } }
    }

    func reset() {
        generation += 1
        scope = ""
        summary = nil
        errorMessage = nil
    }

    func currentSummary(for roomID: String) -> CaptureSessionAfterCallSummary? {
        guard let owner = ownerID(), scope == "\(owner)|\(roomID)", summary?.roomId == roomID else { return nil }
        return summary
    }

    /// False stops automatic polling after lost access; explicit retry is still available.
    func refresh(roomID: String) async -> Bool {
        guard let owner = ownerID(), !roomID.isEmpty else { reset(); return false }
        let requestedScope = "\(owner)|\(roomID)"
        if scope != requestedScope { reset(); scope = requestedScope }
        generation += 1
        let requestGeneration = generation
        var request = URLRequest(url: baseURL.appendingPathComponent("api/sessions").appendingPathComponent(roomID).appendingPathComponent("after-call"))
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.timeoutInterval = 15
        do {
            let (data, response) = try await transport(request)
            guard !Task.isCancelled, requestGeneration == generation, requestedScope == scope, ownerID() == owner else { return false }
            if [401, 403, 404].contains(response.statusCode) {
                summary = nil
                errorMessage = response.statusCode == 401 ? "Sign in again to see session updates." : "This session is no longer available to this account."
                return false
            }
            guard (200...299).contains(response.statusCode) else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(CaptureSessionAfterCallResponse.self, from: data)
            guard payload.ok, let value = payload.summary, value.matches(roomID: roomID) else { throw URLError(.cannotParseResponse) }
            summary = value
            errorMessage = nil
            return true
        } catch {
            guard !Task.isCancelled, requestGeneration == generation, requestedScope == scope, ownerID() == owner else { return false }
            summary = nil
            errorMessage = "Couldn't refresh session updates. Your local recordings and work are still here."
            return true
        }
    }
}
