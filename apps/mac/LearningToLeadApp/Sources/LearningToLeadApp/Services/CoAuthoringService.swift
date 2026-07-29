import Foundation

public enum CoAuthoringError: Error, LocalizedError {
    case paragraphImmutable(Int64)
    
    public var errorDescription: String? {
        switch self {
        case .paragraphImmutable(let id):
            return "Paragraph \(id) is immutable (Homer's text)"
        }
    }
}

public final class CoAuthoringService {
    private let databaseManager: DatabaseManager
    
    public init(databaseManager: DatabaseManager) {
        self.databaseManager = databaseManager
    }
    
    public func generateOptions(for paragraph: Paragraph) throws -> [Option] {
        guard paragraph.isMutable else {
            throw CoAuthoringError.paragraphImmutable(paragraph.id)
        }
        
        let gladwellText = "But what if we looked at this differently? In the tipping point of history, '\(paragraph.text)' becomes not just a statement, but a sudden epidemic of understanding."
        let discworldText = "It is well known that '\(paragraph.text)'. Although, to be fair, in the vast library of the universe, this was roughly equivalent to a small, damp wizard trying to find his spectacles."
        
        let gladwellId = try databaseManager.executeInsert(sql: """
            INSERT INTO options (paragraph_id, text, voice, status)
            VALUES (?, ?, ?, 'queued')
            """, parameters: [paragraph.id, gladwellText, "Gladwell"])
        
        let discworldId = try databaseManager.executeInsert(sql: """
            INSERT INTO options (paragraph_id, text, voice, status)
            VALUES (?, ?, ?, 'queued')
            """, parameters: [paragraph.id, discworldText, "Discworld"])
        
        print("Generated Option ID \(gladwellId) (Voice: Gladwell): \(gladwellText)")
        print("Generated Option ID \(discworldId) (Voice: Discworld): \(discworldText)")
        
        let gladwellOption = Option(id: gladwellId, paragraphId: paragraph.id, text: gladwellText, voice: "Gladwell", status: "queued")
        let discworldOption = Option(id: discworldId, paragraphId: paragraph.id, text: discworldText, voice: "Discworld", status: "queued")
        
        return [gladwellOption, discworldOption]
    }
}

