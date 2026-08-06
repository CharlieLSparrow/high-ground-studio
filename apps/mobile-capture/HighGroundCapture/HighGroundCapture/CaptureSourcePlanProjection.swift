import CryptoKit
import Foundation

struct CaptureSourcePlanPayload: Codable, Equatable {
    let requestId: UUID
    let participantId: String?
    let label: String
    let sourceKind: String
    let retentionRole: String
    let expectedClientKind: String
    let expectedDeviceLabel: String
    let captureId: UUID
    let reason: String
}

enum CaptureSourcePlanProjection {
    static func payload(
        captureID: UUID,
        participantID: String?,
        sourceKind: String,
        deviceModelIdentifier: String?
    ) -> CaptureSourcePlanPayload {
        let normalizedKind = sourceKind.uppercased() == "VIDEO"
            ? "VIDEO"
            : "AUDIO"
        let shortID = captureID.uuidString.lowercased().prefix(8)
        let normalizedDevice = deviceModelIdentifier?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let deviceLabel: String
        if let normalizedDevice, !normalizedDevice.isEmpty {
            deviceLabel = "Quipsly Capture · \(normalizedDevice)"
        } else {
            deviceLabel = "Quipsly Capture · iPhone"
        }
        return CaptureSourcePlanPayload(
            requestId: deterministicRequestID(captureID: captureID),
            participantId: participantID,
            label: "iPhone \(normalizedKind.lowercased()) master · \(shortID)",
            sourceKind: normalizedKind,
            retentionRole: "REQUIRED_MASTER",
            expectedClientKind: "ios",
            expectedDeviceLabel: deviceLabel,
            captureId: captureID,
            reason: "Declared from the protected iPhone source ledger before server byte verification."
        )
    }

    static func deterministicRequestID(captureID: UUID) -> UUID {
        var bytes = Array(
            SHA256.hash(
                data: Data(
                    "quipsly-ios-source-plan\u{0}\(captureID.uuidString.lowercased())".utf8
                )
            ).prefix(16)
        )
        bytes[6] = (bytes[6] & 0x0f) | 0x50
        bytes[8] = (bytes[8] & 0x3f) | 0x80
        let hex = bytes.map { String(format: "%02x", $0) }.joined()
        let value = "\(hex.prefix(8))-\(hex.dropFirst(8).prefix(4))-\(hex.dropFirst(12).prefix(4))-\(hex.dropFirst(16).prefix(4))-\(hex.dropFirst(20))"
        return UUID(uuidString: value)!
    }
}
