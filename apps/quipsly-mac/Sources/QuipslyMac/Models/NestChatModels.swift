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

struct NestChatThread: Codable, Hashable {
    let title: String
}

struct NestChatLoadResponse: Codable {
    let ok: Bool
    let error: String?
    let project: NestChatProject?
    let thread: NestChatThread?
    let messages: [NestChatMessage]?
}

struct NestChatPostResponse: Codable {
    let ok: Bool
    let error: String?
    let message: NestChatMessage?
}
