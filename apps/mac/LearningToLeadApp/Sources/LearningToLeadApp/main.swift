import Foundation

struct LearningToLeadCLI {
    static let version = "1.0.0"
    
    static func writeError(_ message: String) {
        if let data = (message + "\n").data(using: .utf8) {
            FileHandle.standardError.write(data)
        }
    }
    
    static func main() {
        let arguments = CommandLine.arguments
        
        if arguments.count <= 1 {
            #if canImport(AppKit)
            LearningToLeadApp.main()
            #else
            printUsage()
            exit(0)
            #endif
        }
        
        // 1. Resolve DB path
        let env = ProcessInfo.processInfo.environment
        let dbPath = env["LTL_DB_PATH"] ?? "test_e2e.db"
        
        let dbManager: DatabaseManager
        do {
            dbManager = try DatabaseManager(databasePath: dbPath)
            try dbManager.setupSchema()
        } catch {
            writeError("Error: Failed to initialize database: \(error.localizedDescription)")
            exit(1)
        }
        
        let flag = arguments[1]
        switch flag {
        case "--version", "-v":
            print("\(version)")
            exit(0)
            
        case "--help", "-h":
            printUsage()
            exit(0)
            
        case "--import-inbox":
            guard arguments.count > 2 else {
                writeError("Error: Missing path for --import-inbox")
                exit(1)
            }
            let path = arguments[2]
            let importer = ImportService(databaseManager: dbManager)
            do {
                let importedCount = try importer.importDrafts(from: path)
                print("Successfully imported \(importedCount) paragraphs.")
                exit(0)
            } catch {
                writeError("Error: \(error.localizedDescription)")
                exit(1)
            }
            
        case "--list-paragraphs":
            var tag: String? = nil
            if let tagIndex = arguments.firstIndex(of: "--tag") {
                if tagIndex + 1 < arguments.count {
                    tag = arguments[tagIndex + 1]
                } else {
                    writeError("Error: --tag requires a value")
                    exit(1)
                }
            }
            
            do {
                let rows: [[String: Any]]
                if let tag = tag {
                    rows = try dbManager.query(sql: """
                        SELECT p.id, p.author, p.is_mutable, p.order_index, 
                               COALESCE(o.text, p.text) AS display_text,
                               o.id AS active_option_id
                        FROM paragraphs p
                        LEFT JOIN options o ON p.id = o.paragraph_id AND o.status = 'active'
                        JOIN paragraph_tags pt ON p.id = pt.paragraph_id
                        JOIN tags t ON pt.tag_id = t.id
                        WHERE t.name = ? COLLATE NOCASE
                        ORDER BY p.order_index ASC
                        """, parameters: [tag])
                } else {
                    rows = try dbManager.query(sql: """
                        SELECT p.id, p.author, p.is_mutable, p.order_index, 
                               COALESCE(o.text, p.text) AS display_text,
                               o.id AS active_option_id
                        FROM paragraphs p
                        LEFT JOIN options o ON p.id = o.paragraph_id AND o.status = 'active'
                        ORDER BY p.order_index ASC
                        """)
                }
                
                for row in rows {
                    let id = row["id"] as? Int64 ?? 0
                    let author = row["author"] as? String ?? ""
                    let displayText = row["display_text"] as? String ?? ""
                    let isMutable = (row["is_mutable"] as? Int64 ?? 0) != 0
                    let orderIndex = row["order_index"] as? Int64 ?? 0
                    let activeOpt: String
                    if let activeOptionId = row["active_option_id"] as? Int64 {
                        activeOpt = " [Active Option: \(activeOptionId)]"
                    } else {
                        activeOpt = ""
                    }
                    print("ID: \(id) | Author: \(author) | Text: \(displayText) | Mutable: \(isMutable ? "True" : "False") | Order: \(orderIndex)\(activeOpt)")
                }
                exit(0)
            } catch {
                writeError("Error: \(error.localizedDescription)")
                exit(1)
            }
            
        case "--generate-options":
            guard arguments.count > 3 && arguments[2] == "--paragraph-id" else {
                writeError("Error: Missing --paragraph-id <id> for --generate-options")
                exit(1)
            }
            let paragraphIdStr = arguments[3]
            guard let paragraphId = Int64(paragraphIdStr) else {
                writeError("Error: Invalid paragraph ID format")
                exit(1)
            }
            
            do {
                let paragraphRows = try dbManager.query(sql: "SELECT * FROM paragraphs WHERE id = ?;", parameters: [paragraphId])
                guard let paragraphRow = paragraphRows.first else {
                    writeError("Error: Paragraph with ID \(paragraphId) not found")
                    exit(1)
                }
                
                guard let id = paragraphRow["id"] as? Int64,
                      let text = paragraphRow["text"] as? String,
                      let author = paragraphRow["author"] as? String,
                      let isMutableVal = paragraphRow["is_mutable"] as? Int64,
                      let orderIndexVal = paragraphRow["order_index"] as? Int64 else {
                    writeError("Error: Failed to parse paragraph row from database")
                    exit(1)
                }
                let isMutable = isMutableVal != 0
                let orderIndex = Int(orderIndexVal)
                
                let paragraphModel = Paragraph(
                    id: id,
                    text: text,
                    author: author,
                    isMutable: isMutable,
                    orderIndex: orderIndex
                )
                
                let coAuthoringService = CoAuthoringService(databaseManager: dbManager)
                _ = try coAuthoringService.generateOptions(for: paragraphModel)
                exit(0)
            } catch {
                writeError("Error: \(error.localizedDescription)")
                exit(1)
            }
            
        case "--hot-swap":
            var paragraphIdStr: String? = nil
            var optionIdStr: String? = nil
            
            var i = 2
            while i < arguments.count {
                if arguments[i] == "--paragraph-id" && i + 1 < arguments.count {
                    paragraphIdStr = arguments[i+1]
                    i += 2
                } else if arguments[i] == "--option-id" && i + 1 < arguments.count {
                    optionIdStr = arguments[i+1]
                    i += 2
                } else {
                    i += 1
                }
            }
            
            guard let pStr = paragraphIdStr, let oStr = optionIdStr else {
                writeError("Error: --hot-swap requires both --paragraph-id <id> and --option-id <id>")
                exit(1)
            }
            
            guard let pId = Int64(pStr), let oId = Int64(oStr) else {
                writeError("Error: Invalid paragraph ID or option ID format")
                exit(1)
            }
            
            do {
                let paragraphRows = try dbManager.query(sql: "SELECT * FROM paragraphs WHERE id = ?;", parameters: [pId])
                guard let paragraph = paragraphRows.first else {
                    writeError("Error: Paragraph with ID \(pId) not found")
                    exit(1)
                }
                
                let isMutable = (paragraph["is_mutable"] as? Int64 ?? 0) != 0
                if !isMutable {
                    writeError("Error: Paragraph \(pId) is immutable (Homer's text)")
                    exit(1)
                }
                
                let optionRows = try dbManager.query(sql: "SELECT * FROM options WHERE id = ? AND paragraph_id = ?;", parameters: [oId, pId])
                guard !optionRows.isEmpty else {
                    writeError("Error: Option with ID \(oId) not found for Paragraph \(pId)")
                    exit(1)
                }
                
                try dbManager.beginTransaction()
                do {
                    try dbManager.execute(sql: "UPDATE options SET status = 'queued' WHERE paragraph_id = ?;", parameters: [pId])
                    try dbManager.execute(sql: "UPDATE options SET status = 'active' WHERE id = ?;", parameters: [oId])
                    try dbManager.commitTransaction()
                } catch {
                    try? dbManager.rollbackTransaction()
                    throw error
                }
                
                print("Successfully activated option \(oId) for paragraph \(pId).")
                exit(0)
            } catch {
                writeError("Error: \(error.localizedDescription)")
                exit(1)
            }
            
        case "--list-timeline":
            struct TimelineEntry {
                let id: Int64
                let title: String
                let dateString: String
                let description: String
                let paragraphId: Int64
            }
            
            do {
                let rows = try dbManager.query(sql: """
                    SELECT id, event_title, event_date, description, paragraph_id
                    FROM timeline_events
                    """)
                var entries = rows.compactMap { row -> TimelineEntry? in
                    let id = row["id"] as? Int64 ?? 0
                    let title = row["event_title"] as? String ?? ""
                    let date = row["event_date"] as? String ?? ""
                    let desc = row["description"] as? String ?? ""
                    let paragraphId = row["paragraph_id"] as? Int64 ?? 0
                    return TimelineEntry(id: id, title: title, dateString: date, description: desc, paragraphId: paragraphId)
                }
                
                let dateFormatter1 = DateFormatter()
                dateFormatter1.dateFormat = "yyyy-MM-dd"
                dateFormatter1.locale = Locale(identifier: "en_US_POSIX")
                dateFormatter1.timeZone = TimeZone(secondsFromGMT: 0)
                
                let dateFormatter2 = DateFormatter()
                dateFormatter2.dateFormat = "MM/dd/yyyy"
                dateFormatter2.locale = Locale(identifier: "en_US_POSIX")
                dateFormatter2.timeZone = TimeZone(secondsFromGMT: 0)
                
                func parseDate(_ str: String) -> Date {
                    let trimmed = str.trimmingCharacters(in: .whitespacesAndNewlines)
                    if let d1 = dateFormatter1.date(from: trimmed) {
                        return d1
                    }
                    if let d2 = dateFormatter2.date(from: trimmed) {
                        return d2
                    }
                    return Date.distantPast
                }
                
                entries.sort { (e1, e2) -> Bool in
                    let d1 = parseDate(e1.dateString)
                    let d2 = parseDate(e2.dateString)
                    if d1 == d2 {
                        return e1.id < e2.id
                    }
                    return d1 < d2
                }
                
                for entry in entries {
                    print("Date: \(entry.dateString) | Event: \(entry.title) | Description: \(entry.description) | Paragraph ID: \(entry.paragraphId)")
                }
                exit(0)
            } catch {
                writeError("Error: \(error.localizedDescription)")
                exit(1)
            }
            
        default:
            writeError("Unknown option: \(flag)")
            printUsage()
            exit(1)
        }
    }
    
    static func printUsage() {
        print("""
        LearningToLeadApp - Co-Authoring System CLI & GUI (v\(version))
        
        Usage:
          LearningToLeadApp [options]
          
        Options:
          -h, --help                            Show this help message.
          -v, --version                         Show application version.
          --import-inbox <path>                 Scan and import all drafts from the specified directory path.
          --list-paragraphs [--tag <name>]      List imported paragraphs, optionally filtered by tag.
          --generate-options --paragraph-id <id> Generate co-authoring options for a paragraph.
          --hot-swap --paragraph-id <id> --option-id <id> Activate a specific option for a paragraph.
          --list-timeline                       Print the chronological timeline of events.
        """)
    }
}

LearningToLeadCLI.main()
