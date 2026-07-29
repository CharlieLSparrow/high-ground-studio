import Foundation

public struct Clip: Identifiable, Codable {
    public let id: Int64
    public var title: String
    public var url: String
    public var description: String
    public var paragraphId: Int64
    
    public init(id: Int64, title: String, url: String, description: String, paragraphId: Int64) {
        self.id = id
        self.title = title
        self.url = url
        self.description = description
        self.paragraphId = paragraphId
    }
}
