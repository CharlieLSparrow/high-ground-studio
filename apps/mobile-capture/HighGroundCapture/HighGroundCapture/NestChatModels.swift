import Foundation

struct NestChatMessage: Identifiable, Codable, Hashable {
    let id: String
    let authorEmail: String?
    let authorName: String?
    let body: String
    let gifUrl: String?
    let createdAt: String
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
    let thread: NestChatThread?
    let actor: NestChatActor?
    let messages: [NestChatMessage]?
}

struct NestChatPostResponse: Codable {
    let ok: Bool
    let error: String?
    let message: NestChatMessage?
}
