import Foundation

struct LocalRecordingClockSample: Codable, Equatable, Identifiable, Sendable {
    let protocolVersion: Int
    let sampleId: UUID
    let callRoomId: String
    let captureGroupId: UUID?
    let clientKind: String
    let deviceWallSentAt: Date
    let deviceMonotonicSentNanoseconds: UInt64
    let serverReceivedAt: Date
    let serverSentAt: Date
    let deviceWallReceivedAt: Date
    let deviceMonotonicReceivedNanoseconds: UInt64
    let networkRoundTripMilliseconds: Double
    let serverOffsetMilliseconds: Double
    let uncertaintyMilliseconds: Double
    let wallClockDiscontinuityMilliseconds: Double

    var id: UUID { sampleId }
}

private struct CaptureClockRequest: Encodable, Sendable {
    let protocolVersion: Int
    let sampleId: UUID
    let callRoomId: String
    let captureGroupId: UUID
    let clientKind: String
    let deviceWallSentAt: String
    let deviceMonotonicSentNanoseconds: String
}

private struct CaptureClockResponse: Decodable, Sendable {
    let ok: Bool
    let protocolVersion: Int?
    let sampleId: UUID?
    let callRoomId: String?
    let captureGroupId: UUID?
    let clientKind: String?
    let deviceWallSentAt: String?
    let deviceMonotonicSentNanoseconds: String?
    let serverReceivedAt: String?
    let serverSentAt: String?
    let error: String?
}

enum CaptureClockClientError: LocalizedError {
    case invalidNestURL
    case rejected(String)
    case invalidResponse
    case responseIdentityMismatch
    case monotonicClockMovedBackward

    var errorDescription: String? {
        switch self {
        case .invalidNestURL:
            "The configured Nest URL cannot measure capture time."
        case .rejected(let message):
            message
        case .invalidResponse:
            "Nest returned an invalid capture-clock sample."
        case .responseIdentityMismatch:
            "Nest returned a capture-clock identity that did not match this source."
        case .monotonicClockMovedBackward:
            "The device monotonic clock changed unexpectedly during capture-clock measurement."
        }
    }
}

/// Measures server offset without making the server the source clock.
///
/// AVFoundation timestamps and the device monotonic clock remain authoritative
/// inside one source. These samples only provide an uncertainty-bearing bridge
/// between independently recorded devices.
@MainActor
final class CaptureClockClient {
    static let shared = CaptureClockClient()

    private let protocolVersion = 1
    private let maximumBurstCount = 3
    private let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    func measureBurst(
        callRoomID: String,
        captureGroupID: UUID,
        expectedOwnerAccountID: String,
        sampleCount: Int = 3
    ) async -> [LocalRecordingClockSample] {
        let boundedSampleCount = min(max(1, sampleCount), maximumBurstCount)
        let samples = await withTaskGroup(
            of: LocalRecordingClockSample?.self,
            returning: [LocalRecordingClockSample].self
        ) { group in
            for _ in 0..<boundedSampleCount {
                group.addTask { @MainActor [weak self] in
                    guard let self, !Task.isCancelled else { return nil }
                    return try? await self.measure(
                        callRoomID: callRoomID,
                        captureGroupID: captureGroupID,
                        expectedOwnerAccountID: expectedOwnerAccountID
                    )
                }
            }
            var completed: [LocalRecordingClockSample] = []
            for await sample in group {
                if let sample {
                    completed.append(sample)
                }
            }
            return completed
        }
        // Clock evidence improves alignment but must not turn a Nest outage
        // into lost local media. Missing samples remain explicit in the source
        // profile and force alignment review.
        return samples.sorted {
            $0.networkRoundTripMilliseconds < $1.networkRoundTripMilliseconds
        }
    }

    private func measure(
        callRoomID: String,
        captureGroupID: UUID,
        expectedOwnerAccountID: String
    ) async throws -> LocalRecordingClockSample {
        let baseURL = normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
                ?? "https://nest.quipsly.com"
        )
        guard let url = URL(string: "\(baseURL)/api/mobile/capture/clock-sample") else {
            throw CaptureClockClientError.invalidNestURL
        }

        let sampleID = UUID()
        let deviceWallSentAt = Date()
        let deviceMonotonicSent = DispatchTime.now().uptimeNanoseconds
        let payload = CaptureClockRequest(
            protocolVersion: protocolVersion,
            sampleId: sampleID,
            callRoomId: callRoomID,
            captureGroupId: captureGroupID,
            clientKind: "ios",
            deviceWallSentAt: iso8601WithFractionalSeconds.string(from: deviceWallSentAt),
            deviceMonotonicSentNanoseconds: String(deviceMonotonicSent)
        )

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.timeoutInterval = 2
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONEncoder().encode(payload)

        let (data, response) = try await AuthManager.shared.authenticatedData(
            for: request,
            expectedOwnerAccountID: expectedOwnerAccountID
        )
        let deviceMonotonicReceived = DispatchTime.now().uptimeNanoseconds
        let deviceWallReceivedAt = Date()
        guard deviceMonotonicReceived >= deviceMonotonicSent else {
            throw CaptureClockClientError.monotonicClockMovedBackward
        }

        let decoded = try JSONDecoder().decode(CaptureClockResponse.self, from: data)
        guard response.statusCode < 400, decoded.ok else {
            throw CaptureClockClientError.rejected(
                decoded.error ?? "Nest could not measure the capture-room clock."
            )
        }
        guard decoded.protocolVersion == protocolVersion,
              decoded.sampleId == sampleID,
              decoded.callRoomId == callRoomID,
              decoded.captureGroupId == captureGroupID,
              decoded.clientKind == "ios",
              decoded.deviceMonotonicSentNanoseconds == String(deviceMonotonicSent),
              let echoedWall = decoded.deviceWallSentAt.flatMap(iso8601WithFractionalSeconds.date),
              abs(echoedWall.timeIntervalSince(deviceWallSentAt)) < 0.001 else {
            throw CaptureClockClientError.responseIdentityMismatch
        }
        guard let serverReceivedAt = decoded.serverReceivedAt.flatMap(iso8601WithFractionalSeconds.date),
              let serverSentAt = decoded.serverSentAt.flatMap(iso8601WithFractionalSeconds.date),
              serverSentAt >= serverReceivedAt else {
            throw CaptureClockClientError.invalidResponse
        }

        let monotonicElapsedMilliseconds =
            Double(deviceMonotonicReceived - deviceMonotonicSent) / 1_000_000
        let wallElapsedMilliseconds =
            deviceWallReceivedAt.timeIntervalSince(deviceWallSentAt) * 1_000
        let serverProcessingMilliseconds =
            serverSentAt.timeIntervalSince(serverReceivedAt) * 1_000
        let networkRoundTripMilliseconds = max(
            0,
            monotonicElapsedMilliseconds - serverProcessingMilliseconds
        )
        let t0 = deviceWallSentAt.timeIntervalSince1970 * 1_000
        let t1 = serverReceivedAt.timeIntervalSince1970 * 1_000
        let t2 = serverSentAt.timeIntervalSince1970 * 1_000
        let t3 = deviceWallReceivedAt.timeIntervalSince1970 * 1_000
        let serverOffsetMilliseconds = ((t1 - t0) + (t2 - t3)) / 2

        return LocalRecordingClockSample(
            protocolVersion: protocolVersion,
            sampleId: sampleID,
            callRoomId: callRoomID,
            captureGroupId: captureGroupID,
            clientKind: "ios",
            deviceWallSentAt: deviceWallSentAt,
            deviceMonotonicSentNanoseconds: deviceMonotonicSent,
            serverReceivedAt: serverReceivedAt,
            serverSentAt: serverSentAt,
            deviceWallReceivedAt: deviceWallReceivedAt,
            deviceMonotonicReceivedNanoseconds: deviceMonotonicReceived,
            networkRoundTripMilliseconds: networkRoundTripMilliseconds,
            serverOffsetMilliseconds: serverOffsetMilliseconds,
            uncertaintyMilliseconds: networkRoundTripMilliseconds / 2,
            wallClockDiscontinuityMilliseconds:
                wallElapsedMilliseconds - monotonicElapsedMilliseconds
        )
    }
}
