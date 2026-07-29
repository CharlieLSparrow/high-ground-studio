import Foundation

public struct Option: Identifiable, Codable {
    public let id: Int64
    public let paragraphId: Int64
    public var text: String
    public var voice: String
    public var status: String // "queued" or "active"
    
    public init(id: Int64, paragraphId: Int64, text: String, voice: String, status: String = "queued") {
        self.id = id
        self.paragraphId = paragraphId
        self.text = text
        self.voice = voice
        self.status = status
    }
}
