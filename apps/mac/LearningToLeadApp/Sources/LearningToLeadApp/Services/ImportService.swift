import Foundation

public final class ImportService {
    private let databaseManager: DatabaseManager
    
    public init(databaseManager: DatabaseManager) {
        self.databaseManager = databaseManager
    }
    
    public func importDrafts(from directoryPath: String) throws -> Int {
        let files = try findFiles(at: directoryPath)
        var totalImported = 0
        
        try databaseManager.beginTransaction()
        do {
            for file in files {
                let content = try String(contentsOfFile: file, encoding: .utf8)
                    .replacingOccurrences(of: "\r\n", with: "\n")
                
                // Split content by double-newlines (handling whitespace on empty lines)
                let regex = try NSRegularExpression(pattern: "\\n\\s*\\n", options: [])
                let range = NSRange(location: 0, length: content.utf16.count)
                let sentinel = "\u{0000}"
                let modifiedContent = regex.stringByReplacingMatches(in: content, options: [], range: range, withTemplate: sentinel)
                let blocks = modifiedContent.components(separatedBy: sentinel)
                
                for block in blocks {
                    let trimmedBlock = block.trimmingCharacters(in: .whitespacesAndNewlines)
                    if trimmedBlock.isEmpty { continue }
                    
                    try importBlock(trimmedBlock)
                    totalImported += 1
                }
            }
            try databaseManager.commitTransaction()
        } catch {
            try? databaseManager.rollbackTransaction()
            throw error
        }
        
        return totalImported
    }
    
    private func findFiles(at path: String) throws -> [String] {
        let fileManager = FileManager.default
        var isDir: ObjCBool = false
        guard fileManager.fileExists(atPath: path, isDirectory: &isDir) else {
            throw NSError(domain: "ImportService", code: 4, userInfo: [NSLocalizedDescriptionKey: "Error: Path \(path) does not exist"])
        }
        
        if !isDir.boolValue {
            let lower = path.lowercased()
            guard lower.hasSuffix(".md") || lower.hasSuffix(".txt") else {
                throw NSError(domain: "ImportService", code: 5, userInfo: [NSLocalizedDescriptionKey: "Error: Unsupported file extension"])
            }
            return [path]
        }
        
        var files: [String] = []
        if let subpaths = try? fileManager.subpathsOfDirectory(atPath: path) {
            let sortedSubpaths = subpaths.sorted()
            for subpath in sortedSubpaths {
                let lower = subpath.lowercased()
                if lower.hasSuffix(".md") || lower.hasSuffix(".txt") {
                    let fullPath = URL(fileURLWithPath: path).appendingPathComponent(subpath).path
                    files.append(fullPath)
                }
            }
        }
        return files
    }
    
    private func importBlock(_ block: String) throws {
        let lines = block.components(separatedBy: .newlines)
        let metadataRegex = try NSRegularExpression(
            pattern: "^(Author|Mutable|Order|EventTitle|EventDate|EventDescription):\\s*(.*)$",
            options: [.caseInsensitive]
        )
        
        var metadata = [String: String]()
        var textLines = [String]()
        var finishedMetadata = false
        
        for line in lines {
            if !finishedMetadata {
                let range = NSRange(location: 0, length: line.utf16.count)
                if let match = metadataRegex.firstMatch(in: line, options: [], range: range) {
                    if let keyRange = Range(match.range(at: 1), in: line),
                       let valRange = Range(match.range(at: 2), in: line) {
                        let key = String(line[keyRange]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
                        let val = String(line[valRange]).trimmingCharacters(in: .whitespacesAndNewlines)
                        if !val.isEmpty {
                            metadata[key] = val
                        }
                    }
                } else {
                    finishedMetadata = true
                    textLines.append(line)
                }
            } else {
                textLines.append(line)
            }
        }
        
        let text = textLines.joined(separator: "\n").trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty && metadata.isEmpty { return }
        
        // Resolve Author (defaults to Homer)
        let author = metadata["author"] ?? "Homer"
        
        // Resolve Mutability
        let isMutable: Bool
        if let mutableVal = metadata["mutable"]?.lowercased() {
            isMutable = (mutableVal == "true" || mutableVal == "1" || mutableVal == "yes")
        } else {
            isMutable = (author.lowercased() == "charlie")
        }
        
        // Resolve Order Index
        let orderIndex: Int64
        if let orderStr = metadata["order"], let parsedOrder = Int64(orderStr) {
            orderIndex = parsedOrder
        } else {
            let maxOrderSQL = "SELECT COALESCE(MAX(order_index), 0) + 1 FROM paragraphs"
            if let result = try databaseManager.querySingleValue(sql: maxOrderSQL) {
                if let int64Val = result as? Int64 {
                    orderIndex = int64Val
                } else if let intVal = result as? Int {
                    orderIndex = Int64(intVal)
                } else {
                    orderIndex = 1
                }
            } else {
                orderIndex = 1
            }
        }
        
        // Insert Paragraph
        let insertSQL = """
        INSERT INTO paragraphs (text, author, is_mutable, order_index)
        VALUES (?, ?, ?, ?)
        """
        let paragraphId = try databaseManager.executeInsert(
            sql: insertSQL,
            parameters: [text, author, isMutable, orderIndex]
        )
        
        // Extract & Link Tags
        let tagRegex = try NSRegularExpression(pattern: "(?:^|\\W)#([a-zA-Z0-9_-]+)", options: [])
        let matches = tagRegex.matches(in: text, options: [], range: NSRange(location: 0, length: text.utf16.count))
        var uniqueTags = Set<String>()
        for match in matches {
            if let tagRange = Range(match.range(at: 1), in: text) {
                let tagName = String(text[tagRange])
                let isNumeric = tagName.range(of: "^[0-9]+$", options: .regularExpression) != nil
                let isHexColor = (tagName.count == 3 || tagName.count == 6 || tagName.count == 8) && tagName.range(of: "^[0-9a-fA-F]+$", options: .regularExpression) != nil
                if !isNumeric && !isHexColor {
                    uniqueTags.insert(tagName)
                }
            }
        }
        
        for tagName in uniqueTags {
            let insertTagSQL = "INSERT OR IGNORE INTO tags (name) VALUES (?)"
            _ = try databaseManager.executeInsert(sql: insertTagSQL, parameters: [tagName])
            
            let selectTagSQL = "SELECT id FROM tags WHERE name = ?"
            if let tagIdResult = try databaseManager.querySingleValue(sql: selectTagSQL, parameters: [tagName]) {
                let tagId: Int64
                if let int64Val = tagIdResult as? Int64 {
                    tagId = int64Val
                } else if let intVal = tagIdResult as? Int {
                    tagId = Int64(intVal)
                } else {
                    continue
                }
                let linkSQL = "INSERT OR IGNORE INTO paragraph_tags (paragraph_id, tag_id) VALUES (?, ?)"
                _ = try databaseManager.executeInsert(sql: linkSQL, parameters: [paragraphId, tagId])
            }
        }
        
        // Process Timeline Events
        if metadata["eventtitle"] != nil || metadata["eventdate"] != nil {
            let title = metadata["eventtitle"] ?? "Untitled Event"
            let date = metadata["eventdate"] ?? "Unknown Date"
            let desc = metadata["eventdescription"] ?? ""
            
            let insertEventSQL = """
            INSERT INTO timeline_events (event_title, event_date, description, paragraph_id)
            VALUES (?, ?, ?, ?)
            """
            _ = try databaseManager.executeInsert(sql: insertEventSQL, parameters: [title, date, desc, paragraphId])
        }
    }
}
