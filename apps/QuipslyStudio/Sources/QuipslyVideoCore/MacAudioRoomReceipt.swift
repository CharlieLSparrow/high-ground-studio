import Foundation

#if os(macOS)
public enum MacAudioRoomEvent: String, Codable, Equatable, Sendable {
    case joined
    case left
    case muted
    case unmuted
    case failed
}

public struct MacAudioRoomEventReceipt: Codable, Equatable, Sendable {
    public let protocolVersion: Int
    public let id: UUID
    public let event: MacAudioRoomEvent
    public let occurredAt: Date
    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let callRoomID: String
    public let provider: String
    public let providerRoomName: String?
    public let participantID: String
    public let coreAudioInputUID: String
    public let coreAudioOutputUID: String
    public let providerInputDeviceID: String
    public let providerOutputDeviceID: String
    public let directPhysicalMV7iClaimed: Bool
    public let remoteParticipantCount: Int
    public let failure: String?
    public let truth: String

    public init(
        id: UUID = UUID(),
        event: MacAudioRoomEvent,
        occurredAt: Date = Date(),
        captureGroupID: UUID,
        episodeSpaceID: String,
        callRoomID: String,
        providerRoomName: String?,
        participantID: String,
        coreAudioInputUID: String,
        coreAudioOutputUID: String,
        providerInputDeviceID: String,
        providerOutputDeviceID: String,
        directPhysicalMV7iClaimed: Bool,
        remoteParticipantCount: Int,
        failure: String?
    ) {
        protocolVersion = 1
        self.id = id
        self.event = event
        self.occurredAt = occurredAt
        self.captureGroupID = captureGroupID
        self.episodeSpaceID = episodeSpaceID
        self.callRoomID = callRoomID
        provider = "livekit"
        self.providerRoomName = providerRoomName
        self.participantID = participantID
        self.coreAudioInputUID = coreAudioInputUID
        self.coreAudioOutputUID = coreAudioOutputUID
        self.providerInputDeviceID = providerInputDeviceID
        self.providerOutputDeviceID = providerOutputDeviceID
        self.directPhysicalMV7iClaimed = directPhysicalMV7iClaimed
        self.remoteParticipantCount = remoteParticipantCount
        self.failure = Self.sanitizedFailure(failure)
        truth =
            "This receipt describes the separate realtime call feed and exact selected route. It contains no provider token or secret and does not claim that LiveKit audio is the local production master. The 48 kHz/24-bit local WAV remains an independent recorder graph and source receipt."
    }

    private static func sanitizedFailure(_ value: String?) -> String? {
        guard var value, !value.isEmpty else { return value }
        let patterns = [
            #"(?i)bearer\s+[A-Za-z0-9._~+/\-]+=*"#,
            #"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b"#,
            #"(?i)(participantToken|api[_-]?secret|access[_-]?token)\s*[:=]\s*[^\s,;]+"#,
        ]
        for pattern in patterns {
            guard let expression = try? NSRegularExpression(
                pattern: pattern
            ) else { continue }
            let range = NSRange(value.startIndex..., in: value)
            value = expression.stringByReplacingMatches(
                in: value,
                range: range,
                withTemplate: "[redacted credential]"
            )
        }
        return value
    }
}

public enum MacAudioRoomReceiptWriter {
    @discardableResult
    public static func write(
        _ receipt: MacAudioRoomEventReceipt,
        root: URL
    ) throws -> URL {
        let directory = root
            .appendingPathComponent(
                ProductionAudioRecorder.safePathComponent(
                    receipt.episodeSpaceID
                ),
                isDirectory: true
            )
            .appendingPathComponent("audio-room-events", isDirectory: true)
        try FileManager.default.createDirectory(
            at: directory,
            withIntermediateDirectories: true
        )
        let filename =
            "\(receipt.occurredAt.ISO8601Format().replacingOccurrences(of: ":", with: "-"))-\(receipt.event.rawValue)-\(receipt.id.uuidString.lowercased()).json"
        let outputURL = directory.appendingPathComponent(filename)
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys, .withoutEscapingSlashes]
        try encoder.encode(receipt).write(to: outputURL, options: [.atomic])
        return outputURL
    }
}
#endif
