import Foundation

public enum CaptureEditorWorkingSessionError: Error, LocalizedError {
    case missingActiveSequence
    case missingCaptureGroupSources(UUID)
    case verificationFailed

    public var errorDescription: String? {
        switch self {
        case .missingActiveSequence:
            "The capture has no active editor sequence to preserve."
        case .missingCaptureGroupSources(let captureGroupID):
            "The editor sequence does not contain a source from capture group \(captureGroupID.uuidString.lowercased())."
        case .verificationFailed:
            "The saved capture working session did not reload as the exact project snapshot Quipsly wrote."
        }
    }
}

public struct CaptureEditorWorkingSessionReceipt: Equatable, Sendable {
    public let name: String
    public let url: URL
    public let projectID: UUID
    public let sequenceID: UUID
    public let captureGroupID: UUID
    public let captureLaneIDs: [UUID]
    public let verifiedAt: Date

    public init(
        name: String,
        url: URL,
        projectID: UUID,
        sequenceID: UUID,
        captureGroupID: UUID,
        captureLaneIDs: [UUID],
        verifiedAt: Date = Date()
    ) {
        self.name = name
        self.url = url
        self.projectID = projectID
        self.sequenceID = sequenceID
        self.captureGroupID = captureGroupID
        self.captureLaneIDs = captureLaneIDs
        self.verifiedAt = verifiedAt
    }

    public var truth: String {
        "Quipsly atomically saved and reloaded the exact local editor project containing \(captureLaneIDs.count) source lane(s) from capture group \(captureGroupID.uuidString.lowercased()). This proves durable local editor recovery, not reviewed synchronization, cloud upload, transcription, acceptance, delivery, or publication."
    }
}

public enum CaptureEditorWorkingSession {
    public static let activeSessionDefaultsKey =
        "quipsly.nativeEditor.activeSessionName"

    public static func name(
        episodeSpaceID: String,
        captureGroupID: UUID
    ) -> String {
        let cleanEpisode = episodeSpaceID
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
            .unicodeScalars
            .map { scalar -> Character in
                CharacterSet.alphanumerics.contains(scalar)
                    ? Character(scalar)
                    : "-"
            }
            .reduce(into: "") { partialResult, character in
                if character != "-"
                    || partialResult.last != "-" {
                    partialResult.append(character)
                }
            }
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        let episode = cleanEpisode.isEmpty
            ? "local-capture"
            : utf8Prefix(
                cleanEpisode,
                maxBytes: 180
            )
            .trimmingCharacters(
                in: CharacterSet(
                    charactersIn: "-"
                )
            )
        return [
            "capture",
            episode.isEmpty ? "local-capture" : episode,
            captureGroupID.uuidString.lowercased(),
            "working",
        ]
        .joined(separator: "-")
    }

    @discardableResult
    public static func persistAndVerify(
        session: NativeEditorSession,
        episodeSpaceID: String,
        captureGroupID: UUID,
        vault: LocalMediaVault = .shared
    ) async throws -> CaptureEditorWorkingSessionReceipt {
        guard let sequenceID = session.activeSequenceId,
              let sequence = session.project.sequences.first(where: {
                  $0.id == sequenceID
              }) else {
            throw CaptureEditorWorkingSessionError
                .missingActiveSequence
        }
        let captureGroup = captureGroupID.uuidString.lowercased()
        let laneIDs = sequence.lanes.compactMap { lane in
            lane.metadata?.captureGroupID == captureGroup
                ? lane.id
                : nil
        }
        guard !laneIDs.isEmpty else {
            throw CaptureEditorWorkingSessionError
                .missingCaptureGroupSources(captureGroupID)
        }

        let sessionName = name(
            episodeSpaceID: episodeSpaceID,
            captureGroupID: captureGroupID
        )
        let url = try await vault.saveSession(
            session,
            named: sessionName,
            intent: .autosave
        )
        let reloaded = try await vault.loadSession(
            named: sessionName
        )
        guard reloaded.activeSequenceId
                == session.activeSequenceId,
              reloaded.project.id == session.project.id,
              reloaded.project.sequences.contains(where: {
                  $0.id == sequenceID
              }),
              try canonicalRepresentation(reloaded)
                == canonicalRepresentation(session) else {
            throw CaptureEditorWorkingSessionError
                .verificationFailed
        }

        return CaptureEditorWorkingSessionReceipt(
            name: sessionName,
            url: url,
            projectID: session.project.id,
            sequenceID: sequenceID,
            captureGroupID: captureGroupID,
            captureLaneIDs: laneIDs
        )
    }

    private static func canonicalRepresentation(
        _ session: NativeEditorSession
    ) throws -> Data {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [
            .prettyPrinted,
            .sortedKeys,
        ]
        encoder.dateEncodingStrategy = .iso8601
        return try encoder.encode(session)
    }

    private static func utf8Prefix(
        _ value: String,
        maxBytes: Int
    ) -> String {
        var result = ""
        var byteCount = 0
        for character in value {
            let next = String(character)
            let nextByteCount = next.utf8.count
            guard byteCount + nextByteCount
                    <= maxBytes else {
                break
            }
            result.append(character)
            byteCount += nextByteCount
        }
        return result
    }
}
