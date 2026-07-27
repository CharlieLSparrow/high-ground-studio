import Foundation

#if os(macOS)
public struct MacEpisodeRoomCaptureSourceProxy:
    Codable,
    Equatable,
    Sendable
{
    public let required: Bool?
    public let status: String?
    public let playbackUrl: String?
    public let sourceOriginalPreserved: Bool?
}

public struct MacEpisodeRoomCaptureSourceTranscript:
    Codable,
    Equatable,
    Sendable
{
    public let id: String?
    public let status: String?
    public let provider: String?
    public let segmentCount: Int?
    public let updatedAt: String?
}

public struct MacEpisodeRoomCaptureSourceAlignment:
    Codable,
    Equatable,
    Sendable
{
    public let status: String?
    public let captureGroupId: String?
    public let sourceClockEvidence: String?
    public let sampleAccurateClaimed: Bool?
}

public struct MacEpisodeRoomCaptureSource:
    Codable,
    Equatable,
    Identifiable,
    Sendable
{
    public let recordingAssetId: String
    public let uploadSessionId: String?
    public let captureId: String?
    public let captureGroupId: String?
    public let fileName: String
    public let kind: String
    public let contentType: String?
    public let byteSize: String?
    public let durationSeconds: Double?
    public let recordedStartedAt: String?
    public let recordedStoppedAt: String?
    public let recordingStatus: String
    public let exactBytesVerified: Bool
    public let byteVerificationKind: String?
    public let processingDisposition: String
    public let transcriptDisposition: String
    public let sourceId: String?
    public let mediaAssetId: String?
    public let playbackUrl: String?
    public let alignment: MacEpisodeRoomCaptureSourceAlignment?
    public let proxy: MacEpisodeRoomCaptureSourceProxy?
    public let transcript: MacEpisodeRoomCaptureSourceTranscript?

    public var id: String { recordingAssetId }

    public var readinessLabel: String {
        if processingDisposition.uppercased() != "RELEASED" {
            return "Processing held"
        }
        if !exactBytesVerified {
            return "Verification pending"
        }
        if proxy?.required == true,
           proxy?.status?.lowercased() != "ready" {
            return "Proxy \(proxy?.status?.lowercased() ?? "pending")"
        }
        if let alignmentStatus = alignment?.status?.lowercased(),
           !["aligned", "reviewed", "locked"].contains(alignmentStatus) {
            return alignmentStatus == "needs-alignment"
                ? "Needs alignment"
                : "Alignment \(alignmentStatus)"
        }
        if transcriptDisposition.uppercased() == "RELEASED",
           let transcriptStatus = transcript?.status {
            return "Transcript \(transcriptStatus.lowercased())"
        }
        return "Source verified"
    }
}

public struct MacEpisodeRoomReadiness: Codable, Equatable, Sendable {
    public let status: String?
    public let label: String?
    public let tone: String?
    public let safeToRecordLocally: Bool?
    public let providerCanJoin: Bool?
    public let detail: String?
    public let nextAction: String?
    public let blockers: [String]?
    public let evidence: [String]?

    public init(
        status: String? = nil,
        label: String? = nil,
        tone: String? = nil,
        safeToRecordLocally: Bool? = nil,
        providerCanJoin: Bool? = nil,
        detail: String? = nil,
        nextAction: String? = nil,
        blockers: [String]? = nil,
        evidence: [String]? = nil
    ) {
        self.status = status
        self.label = label
        self.tone = tone
        self.safeToRecordLocally = safeToRecordLocally
        self.providerCanJoin = providerCanJoin
        self.detail = detail
        self.nextAction = nextAction
        self.blockers = blockers
        self.evidence = evidence
    }
}

public struct MacEpisodeRoomSummary:
    Codable,
    Equatable,
    Identifiable,
    Sendable
{
    public let id: String
    public let callRoomId: String
    public let title: String
    public let purpose: String?
    public let status: String?
    public let updatedAt: String?
    public let provider: String?
    public let providerCanJoin: Bool?
    public let providerReadiness: String?
    public let providerNextAction: String?
    public let projectSlug: String?
    public let projectName: String?
    public let episodeSlug: String?
    public let scheduledStart: String?
    public let participantId: String?
    public let recordingConsentId: String?
    public let recordingConsentStatus: String?
    public let recordingConsentGranted: Bool
    public let canRecordNow: Bool
    public let captureReadiness: MacEpisodeRoomReadiness?
    public let captureSources: [MacEpisodeRoomCaptureSource]?
    public let nextAction: String?

    public init(
        id: String,
        callRoomId: String,
        title: String,
        purpose: String? = nil,
        status: String? = nil,
        updatedAt: String? = nil,
        provider: String? = nil,
        providerCanJoin: Bool? = nil,
        providerReadiness: String? = nil,
        providerNextAction: String? = nil,
        projectSlug: String? = nil,
        projectName: String? = nil,
        episodeSlug: String? = nil,
        scheduledStart: String? = nil,
        participantId: String? = nil,
        recordingConsentId: String? = nil,
        recordingConsentStatus: String? = nil,
        recordingConsentGranted: Bool,
        canRecordNow: Bool,
        captureReadiness: MacEpisodeRoomReadiness? = nil,
        captureSources: [MacEpisodeRoomCaptureSource]? = nil,
        nextAction: String? = nil
    ) {
        self.id = id
        self.callRoomId = callRoomId
        self.title = title
        self.purpose = purpose
        self.status = status
        self.updatedAt = updatedAt
        self.provider = provider
        self.providerCanJoin = providerCanJoin
        self.providerReadiness = providerReadiness
        self.providerNextAction = providerNextAction
        self.projectSlug = projectSlug
        self.projectName = projectName
        self.episodeSlug = episodeSlug
        self.scheduledStart = scheduledStart
        self.participantId = participantId
        self.recordingConsentId = recordingConsentId
        self.recordingConsentStatus = recordingConsentStatus
        self.recordingConsentGranted = recordingConsentGranted
        self.canRecordNow = canRecordNow
        self.captureReadiness = captureReadiness
        self.captureSources = captureSources
        self.nextAction = nextAction
    }

    public var safeToRecordLocally: Bool {
        recordingConsentGranted
            && canRecordNow
            && captureReadiness?.safeToRecordLocally == true
    }

    public var canJoinProvider: Bool {
        captureReadiness?.providerCanJoin == true
            || providerCanJoin == true
    }

    public var canonicalEpisodeSpaceID: String {
        nonempty(episodeSlug)
            ?? nonempty(projectSlug)
            ?? callRoomId
    }

    public var displaySubtitle: String {
        [
            nonempty(purpose)?.lowercased(),
            nonempty(projectName),
            nonempty(status)?.lowercased(),
        ]
        .compactMap { $0 }
        .joined(separator: " · ")
    }

    public var readinessLabel: String {
        nonempty(captureReadiness?.label)
            ?? (safeToRecordLocally
                ? "Ready to record"
                : "Recording held")
    }

    public var readinessDetail: String {
        nonempty(captureReadiness?.detail)
            ?? nonempty(captureReadiness?.nextAction)
            ?? nonempty(nextAction)
            ?? "Nest has not supplied a capture-readiness explanation."
    }

    private func nonempty(_ value: String?) -> String? {
        let clean = value?.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return clean?.isEmpty == false ? clean : nil
    }
}

public struct MacEpisodeRoomCatalogUser:
    Codable,
    Equatable,
    Sendable
{
    public let id: String
    public let email: String
    public let name: String?
    public let isStaff: Bool?

    public init(
        id: String,
        email: String,
        name: String? = nil,
        isStaff: Bool? = nil
    ) {
        self.id = id
        self.email = email
        self.name = name
        self.isStaff = isStaff
    }
}

public struct MacEpisodeRoomCatalogResponse:
    Codable,
    Equatable,
    Sendable
{
    public let ok: Bool
    public let error: String?
    public let user: MacEpisodeRoomCatalogUser?
    public let sessions: [MacEpisodeRoomSummary]?

    public init(
        ok: Bool,
        error: String? = nil,
        user: MacEpisodeRoomCatalogUser? = nil,
        sessions: [MacEpisodeRoomSummary]? = nil
    ) {
        self.ok = ok
        self.error = error
        self.user = user
        self.sessions = sessions
    }
}

public enum MacEpisodeRoomSelectionPolicy {
    public static func refreshedRoomID(
        rooms: [MacEpisodeRoomSummary],
        previousID: String?
    ) -> String? {
        if let previousID {
            return rooms.contains(where: { $0.id == previousID })
                ? previousID
                : nil
        }
        return preferredRoomID(
            rooms: rooms,
            preserving: nil
        )
    }

    public static func preferredRoomID(
        rooms: [MacEpisodeRoomSummary],
        preserving currentID: String?
    ) -> String? {
        if let currentID,
           rooms.contains(where: { $0.id == currentID }) {
            return currentID
        }
        return rooms.first(where: {
            $0.safeToRecordLocally && $0.canJoinProvider
        })?.id
            ?? rooms.first(where: \.safeToRecordLocally)?.id
            ?? rooms.first(where: \.canJoinProvider)?.id
            ?? rooms.first?.id
    }
}
#endif
