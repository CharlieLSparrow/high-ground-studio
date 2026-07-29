import Foundation

public struct Annotation: Identifiable, Codable, Equatable {
    public let id: Int64
    public let paragraphId: Int64
    public var text: String
    public var author: String
    
    public init(id: Int64, paragraphId: Int64, text: String, author: String = "Charlie") {
        self.id = id
        self.paragraphId = paragraphId
        self.text = text
        self.author = author
    }
}
