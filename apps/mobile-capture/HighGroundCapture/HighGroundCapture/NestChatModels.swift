import Foundation

struct NestChatMessage: Identifiable, Codable, Hashable {
    let id: String
    let authorEmail: String?
    let authorName: String?
    let body: String
    let gifUrl: String?
    let metadataJson: NestChatMessageMetadata?
    let createdAt: String
    var linkedTasks: [NestChatLinkedTask]? = nil

    var suggestedTaskTitle: String {
        String(body.split(whereSeparator: { $0.isWhitespace }).joined(separator: " ").prefix(160))
    }

    init(
        id: String,
        authorEmail: String?,
        authorName: String?,
        body: String,
        gifUrl: String?,
        metadataJson: NestChatMessageMetadata? = nil,
        createdAt: String
    ) {
        self.id = id
        self.authorEmail = authorEmail
        self.authorName = authorName
        self.body = body
        self.gifUrl = gifUrl
        self.metadataJson = metadataJson
        self.createdAt = createdAt
    }
}

/// A conversation projects canonical tasks; the task stays in shared work.
struct NestChatLinkedTask: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let status: String
    let tags: [MobileWorkTagLabel]?
}

/// Retries keep the same identity; editing the input starts a new command.
struct NestConversationTaskCommand: Encodable, Equatable {
    struct Tags: Encodable, Equatable {
        let tagIds: [String]
        let newTagLabels: [String]
    }
    let projectSlug: String
    let sourceMessageId: String
    let title: String
    let clientRequestId: String
    let tags: Tags

    init(projectSlug: String, messageID: String, title: String, tagIDs: [String], newTagLabels: [String] = [], previous: Self? = nil) {
        self.projectSlug = projectSlug
        sourceMessageId = messageID
        self.title = title.split(whereSeparator: \.isWhitespace).joined(separator: " ")
        tags = Tags(tagIds: Array(Set(tagIDs)).sorted(),
                    newTagLabels: newTagLabels.map { $0.split(whereSeparator: \.isWhitespace).joined(separator: " ") }.sorted())
        if let previous, previous.projectSlug == projectSlug, previous.sourceMessageId == messageID,
           previous.title == self.title, previous.tags == tags {
            clientRequestId = previous.clientRequestId
        } else { clientRequestId = UUID().uuidString.lowercased() }
    }
}

struct NestConversationTaskResponse: Decodable {
    let ok: Bool
    let error: String?
    let entry: NestChatLinkedTask?
}

struct NestChatMessageMetadata: Codable, Hashable {
    let coachingScheduleRequest: NestChatCoachingScheduleRequest?
    let coachingScheduleDecision: NestChatCoachingScheduleDecision?
}

struct NestChatCoachingScheduleRequest: Codable, Hashable {
    let schema: String
    let bookingId: String
    let kind: String
    let currentScheduledStart: String
    let requestedScheduledStart: String?
    let note: String?
}

struct NestChatCoachingScheduleDecision: Codable, Hashable {
    let schema: String
    let bookingId: String
    let requestMessageId: String
    let decision: String
}

struct MobileCoachingScheduleRequestEnvelope: Codable, Hashable {
    static let schemaVersion = "quipsly.coaching.schedule-request.v1"

    let schema: String
    let bookingId: String
    let kind: String
    let currentScheduledStart: String
    let requestedScheduledStart: String?
    let note: String?

    init(
        bookingId: String,
        kind: String,
        currentScheduledStart: String,
        requestedScheduledStart: String?,
        note: String?
    ) {
        schema = Self.schemaVersion
        self.bookingId = bookingId
        self.kind = kind
        self.currentScheduledStart = currentScheduledStart
        self.requestedScheduledStart = requestedScheduledStart
        self.note = note
    }
}

struct MobileCoachingScheduleDecisionEnvelope: Codable, Hashable {
    static let schemaVersion = "quipsly.coaching.schedule-decision.v1"

    let schema: String
    let bookingId: String
    let requestMessageId: String
    let decision: String

    init(bookingId: String, requestMessageId: String, decision: String) {
        schema = Self.schemaVersion
        self.bookingId = bookingId
        self.requestMessageId = requestMessageId
        self.decision = decision
    }
}

struct NestChatProject: Codable, Hashable {
    let slug: String
    let name: String
}

struct NestChatEpisode: Codable, Hashable {
    let id: String
    let slug: String
    let title: String
    let status: String
}

struct NestChatSession: Codable, Hashable {
    let id: String
    let title: String
    let purpose: String
    let status: String
}

struct NestChatEngagement: Codable, Hashable {
    let id: String
    let title: String
    let status: String
}

struct NestChatThread: Codable, Hashable {
    let key: String?
    let title: String
}

struct NestChatActor: Codable, Hashable {
    let email: String?
    let name: String?
    let role: String?
}

struct NestChatLoadResponse: Codable {
    let ok: Bool
    let error: String?
    let project: NestChatProject?
    let episode: NestChatEpisode?
    let session: NestChatSession?
    let engagement: NestChatEngagement?
    let thread: NestChatThread?
    let actor: NestChatActor?
    let messages: [NestChatMessage]?
}

struct NestChatPostResponse: Codable {
    let ok: Bool
    let error: String?
    let message: NestChatMessage?
}
