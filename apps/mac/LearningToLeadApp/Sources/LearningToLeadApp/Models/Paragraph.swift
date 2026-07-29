import Foundation

public struct Paragraph: Identifiable, Codable {
    public let id: Int64
    public var text: String
    public var author: String
    public var isMutable: Bool
    public var orderIndex: Int
    public var tags: [String]
    public var activeOptionId: Int64?
    public var clips: [Clip]
    public var annotations: [Annotation]
    
    public init(id: Int64, text: String, author: String = "Homer", isMutable: Bool = false, orderIndex: Int, tags: [String] = [], activeOptionId: Int64? = nil, clips: [Clip] = [], annotations: [Annotation] = []) {
        self.id = id
        self.text = text
        self.author = author
        self.isMutable = isMutable
        self.orderIndex = orderIndex
        self.tags = tags
        self.activeOptionId = activeOptionId
        self.clips = clips
        self.annotations = annotations
    }
}
