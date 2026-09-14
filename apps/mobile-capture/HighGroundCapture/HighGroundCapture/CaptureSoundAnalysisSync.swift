import Foundation

/// Delivers a recomputable observation after the immutable source is verified.
/// The recording library owns retries; no new upload or user approval is needed.
@MainActor
enum CaptureSoundAnalysisSync {
    private struct Submission: Encodable {
        let recordingAssetId: String
        let analysis: LocalRecordingAudibleEventAnalysisProfile
    }
    struct Receipt: Decodable {
        let ok: Bool
        let recordingAssetId: String
        let analysisId: String
        let sourceSHA256: String
        let sourceByteCount: Int64
    }

    static func deliver(recording: LocalRecording) async throws -> Receipt {
        guard AuthManager.shared.networkActionsAllowed,
              let owner = recording.ownerAccountID,
              AuthManager.currentStoredOwnerID() == owner,
              let assetID = recording.recordingAssetId,
              let analysis = recording.sourceProfile?.audibleEventAnalysis,
              analysis.status == "completed", recording.status.isVerified,
              analysis.sourceSHA256 == recording.verifiedCloudSHA256,
              analysis.sourceByteCount == recording.verifiedCloudSizeBytes else {
            throw URLError(.userAuthenticationRequired)
        }
        let origin = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")
        guard let url = URL(string: origin + "/api/mobile/capture/recordings/sound-analysis") else { throw URLError(.badURL) }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 30
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        request.httpBody = try encoder.encode(Submission(recordingAssetId: assetID, analysis: analysis))
        let (data, response) = try await AuthManager.shared.authenticatedData(for: request, expectedOwnerAccountID: owner)
        guard response.statusCode == 200 else { throw URLError(.badServerResponse) }
        let receipt = try JSONDecoder().decode(Receipt.self, from: data)
        guard receipt.ok, receipt.recordingAssetId == assetID, receipt.analysisId == analysis.analysisId,
              receipt.sourceSHA256 == analysis.sourceSHA256, receipt.sourceByteCount == analysis.sourceByteCount else {
            throw URLError(.cannotParseResponse)
        }
        return receipt
    }
}
