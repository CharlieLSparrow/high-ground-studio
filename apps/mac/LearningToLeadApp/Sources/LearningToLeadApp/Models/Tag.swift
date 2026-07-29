import Foundation

public struct Tag: Identifiable, Codable, Hashable, Equatable {
    public let id: Int64
    public var name: String
    
    public init(id: Int64, name: String) {
        self.id = id
        self.name = name
    }
}
