import Foundation

public struct TimelineEvent: Identifiable, Codable {
    public let id: Int64
    public var title: String
    public var dateString: String // matches event_date TEXT in DB
    public var description: String
    public var paragraphId: Int64
    
    public init(id: Int64, title: String, dateString: String, description: String, paragraphId: Int64) {
        self.id = id
        self.title = title
        self.dateString = dateString
        self.description = description
        self.paragraphId = paragraphId
    }
}
