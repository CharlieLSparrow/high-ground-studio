import Foundation

private struct ProductionCaptureClockRequest:
    Encodable,
    Sendable
{
    let protocolVersion: Int
    let sampleId: UUID
    let callRoomId: String
    let captureGroupId: UUID
    let clientKind: String
    let deviceWallSentAt: String
    let deviceMonotonicSentNanoseconds: String
}

private struct ProductionCaptureClockResponse:
    Decodable,
    Sendable
{
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

public enum ProductionCaptureClockError: LocalizedError {
    case rejected(String)
    case invalidResponse
    case responseIdentityMismatch
    case monotonicClockMovedBackward

    public var errorDescription: String? {
        switch self {
        case .rejected(let message):
            message
        case .invalidResponse:
            "Nest returned an invalid capture-clock sample."
        case .responseIdentityMismatch:
            "Nest returned capture-clock evidence for a different room or take."
        case .monotonicClockMovedBackward:
            "The device monotonic clock changed unexpectedly while measuring the source clock."
        }
    }
}

/// Captures uncertainty-bearing server-clock evidence without treating the
/// network as the source-media clock. Missing samples never prevent a safe
/// local recording; they keep later alignment in explicit waveform review.
@MainActor
public final class ProductionCaptureClockClient {
    public typealias AuthenticatedData =
        (URLRequest) async throws -> (Data, HTTPURLResponse)

    private let protocolVersion = 1
    private let burstCount: Int
    private let clientKind: String
    private let iso8601WithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [
            .withInternetDateTime,
            .withFractionalSeconds,
        ]
        return formatter
    }()

    public init(
        clientKind: String,
        burstCount: Int = 3
    ) {
        self.clientKind = clientKind
        self.burstCount = max(1, burstCount)
    }

    public func measureBurst(
        baseURL: URL,
        callRoomID: String,
        captureGroupID: UUID,
        authenticatedData:
            @escaping AuthenticatedData
    ) async -> [ProductionCaptureClockSample] {
        let samples = await withTaskGroup(
            of: ProductionCaptureClockSample?.self,
            returning: [ProductionCaptureClockSample].self
        ) { group in
            for _ in 0..<burstCount {
                group.addTask { @MainActor [weak self] in
                    guard let self, !Task.isCancelled else {
                        return nil
                    }
                    return try? await self.measure(
                        baseURL: baseURL,
                        callRoomID: callRoomID,
                        captureGroupID: captureGroupID,
                        authenticatedData: authenticatedData
                    )
                }
            }
            var completed: [ProductionCaptureClockSample] = []
            for await sample in group {
                if let sample {
                    completed.append(sample)
                }
            }
            return completed
        }
        return samples.sorted {
            $0.networkRoundTripMilliseconds
                < $1.networkRoundTripMilliseconds
        }
    }

    private func measure(
        baseURL: URL,
        callRoomID: String,
        captureGroupID: UUID,
        authenticatedData:
            AuthenticatedData
    ) async throws -> ProductionCaptureClockSample {
        let sampleID = UUID()
        let deviceWallSentAt = Date()
        let deviceMonotonicSent =
            DispatchTime.now().uptimeNanoseconds
        let payload = ProductionCaptureClockRequest(
            protocolVersion: protocolVersion,
            sampleId: sampleID,
            callRoomId: callRoomID,
            captureGroupId: captureGroupID,
            clientKind: clientKind,
            deviceWallSentAt:
                iso8601WithFractionalSeconds.string(
                    from: deviceWallSentAt
                ),
            deviceMonotonicSentNanoseconds:
                String(deviceMonotonicSent)
        )

        var request = URLRequest(
            url: baseURL.appending(
                path: "/api/mobile/capture/clock-sample"
            )
        )
        request.httpMethod = "POST"
        request.timeoutInterval = 2
        request.setValue(
            "application/json",
            forHTTPHeaderField: "Content-Type"
        )
        request.httpBody = try JSONEncoder().encode(payload)

        let (data, response) = try await authenticatedData(request)
        let deviceMonotonicReceived =
            DispatchTime.now().uptimeNanoseconds
        let deviceWallReceivedAt = Date()
        guard deviceMonotonicReceived >= deviceMonotonicSent else {
            throw ProductionCaptureClockError
                .monotonicClockMovedBackward
        }

        let decoded = try JSONDecoder().decode(
            ProductionCaptureClockResponse.self,
            from: data
        )
        guard (200..<300).contains(response.statusCode),
              decoded.ok else {
            throw ProductionCaptureClockError.rejected(
                decoded.error
                    ?? "Nest could not measure the capture-room clock."
            )
        }
        guard decoded.protocolVersion == protocolVersion,
              decoded.sampleId == sampleID,
              decoded.callRoomId == callRoomID,
              decoded.captureGroupId == captureGroupID,
              decoded.clientKind == clientKind,
              decoded.deviceMonotonicSentNanoseconds
                == String(deviceMonotonicSent),
              let echoedWall =
                decoded.deviceWallSentAt.flatMap(
                    iso8601WithFractionalSeconds.date
                ),
              abs(
                  echoedWall.timeIntervalSince(
                      deviceWallSentAt
                  )
              ) < 0.001 else {
            throw ProductionCaptureClockError
                .responseIdentityMismatch
        }
        guard let serverReceivedAt =
                decoded.serverReceivedAt.flatMap(
                    iso8601WithFractionalSeconds.date
                ),
              let serverSentAt =
                decoded.serverSentAt.flatMap(
                    iso8601WithFractionalSeconds.date
                ),
              serverSentAt >= serverReceivedAt else {
            throw ProductionCaptureClockError.invalidResponse
        }

        let monotonicElapsedMilliseconds =
            Double(
                deviceMonotonicReceived
                    - deviceMonotonicSent
            ) / 1_000_000
        let wallElapsedMilliseconds =
            deviceWallReceivedAt.timeIntervalSince(
                deviceWallSentAt
            ) * 1_000
        let serverProcessingMilliseconds =
            serverSentAt.timeIntervalSince(
                serverReceivedAt
            ) * 1_000
        let networkRoundTripMilliseconds = max(
            0,
            monotonicElapsedMilliseconds
                - serverProcessingMilliseconds
        )
        let t0 =
            deviceWallSentAt.timeIntervalSince1970 * 1_000
        let t1 =
            serverReceivedAt.timeIntervalSince1970 * 1_000
        let t2 = serverSentAt.timeIntervalSince1970 * 1_000
        let t3 =
            deviceWallReceivedAt.timeIntervalSince1970 * 1_000
        let serverOffsetMilliseconds =
            ((t1 - t0) + (t2 - t3)) / 2

        return ProductionCaptureClockSample(
            protocolVersion: protocolVersion,
            sampleId: sampleID,
            callRoomId: callRoomID,
            captureGroupId: captureGroupID,
            clientKind: clientKind,
            deviceWallSentAt: deviceWallSentAt,
            deviceMonotonicSentNanoseconds:
                deviceMonotonicSent,
            serverReceivedAt: serverReceivedAt,
            serverSentAt: serverSentAt,
            deviceWallReceivedAt: deviceWallReceivedAt,
            deviceMonotonicReceivedNanoseconds:
                deviceMonotonicReceived,
            networkRoundTripMilliseconds:
                networkRoundTripMilliseconds,
            serverOffsetMilliseconds:
                serverOffsetMilliseconds,
            uncertaintyMilliseconds:
                networkRoundTripMilliseconds / 2,
            wallClockDiscontinuityMilliseconds:
                wallElapsedMilliseconds
                    - monotonicElapsedMilliseconds
        )
    }
}
