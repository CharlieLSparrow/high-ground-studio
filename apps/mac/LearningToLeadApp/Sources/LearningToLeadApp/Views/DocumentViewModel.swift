import Foundation
import Combine

public final class DocumentViewModel: ObservableObject {
    @Published public var paragraphs: [Paragraph] = []
    @Published public var tags: [Tag] = []
    @Published public var selectedTag: Tag? = nil
    @Published public var timelineEvents: [TimelineEvent] = []
    @Published public var importErrorMessage: String? = nil
    @Published public var showImportAlert: Bool = false
    @Published public var tableOfContents: [TableOfContentsItem] = []
    
    public struct TableOfContentsItem: Identifiable, Equatable {
        public let id: Int64
        public let title: String
    }
    
    private let databaseManager: DatabaseManager
    
    public init() throws {
        self.databaseManager = try DatabaseManager()
        loadData()
    }
    
    public init(databaseManager: DatabaseManager) {
        self.databaseManager = databaseManager
        loadData()
    }
    
    public func loadData() {
        do {
            // Load tags
            let tagRows = try databaseManager.query(sql: "SELECT id, name FROM tags ORDER BY name ASC")
            self.tags = tagRows.compactMap { row -> Tag? in
                guard let id = row["id"] as? Int64, let name = row["name"] as? String else { return nil }
                return Tag(id: id, name: name)
            }
            
            // Load paragraphs
            let pSQL: String
            let pParams: [Any]
            if let selectedTag = selectedTag {
                pSQL = """
                SELECT p.id, p.text, p.author, p.is_mutable, p.order_index, 
                       (SELECT o.id FROM options o WHERE o.paragraph_id = p.id AND o.status = 'active') as active_option_id
                FROM paragraphs p
                JOIN paragraph_tags pt ON p.id = pt.paragraph_id
                WHERE pt.tag_id = ?
                ORDER BY p.order_index ASC
                """
                pParams = [selectedTag.id]
            } else {
                pSQL = """
                SELECT p.id, p.text, p.author, p.is_mutable, p.order_index, 
                       (SELECT o.id FROM options o WHERE o.paragraph_id = p.id AND o.status = 'active') as active_option_id
                FROM paragraphs p
                ORDER BY p.order_index ASC
                """
                pParams = []
            }
            
            let pRows = try databaseManager.query(sql: pSQL, parameters: pParams)
            
            // Fetch tags for paragraphs
            let ptRows = try databaseManager.query(sql: """
                SELECT pt.paragraph_id, t.name
                FROM paragraph_tags pt
                JOIN tags t ON pt.tag_id = t.id
                """)
            var tagsByParagraphId: [Int64: [String]] = [:]
            for r in ptRows {
                if let pid = r["paragraph_id"] as? Int64, let tagName = r["name"] as? String {
                    tagsByParagraphId[pid, default: []].append(tagName)
                }
            }
            
            // Fetch clips for paragraphs
            let clipRows = try databaseManager.query(sql: """
                SELECT id, title, url, description, paragraph_id
                FROM clips
                """)
            var clipsByParagraphId: [Int64: [Clip]] = [:]
            for r in clipRows {
                if let id = r["id"] as? Int64,
                   let title = r["title"] as? String,
                   let url = r["url"] as? String,
                   let desc = r["description"] as? String,
                   let pid = r["paragraph_id"] as? Int64 {
                    let clip = Clip(id: id, title: title, url: url, description: desc, paragraphId: pid)
                    clipsByParagraphId[pid, default: []].append(clip)
                }
            }
            
            // Fetch annotations for paragraphs
            let annotationRows = try databaseManager.query(sql: """
                SELECT id, paragraph_id, text, author
                FROM annotations
                """)
            var annotationsByParagraphId: [Int64: [Annotation]] = [:]
            for r in annotationRows {
                if let id = r["id"] as? Int64,
                   let pid = r["paragraph_id"] as? Int64,
                   let text = r["text"] as? String,
                   let author = r["author"] as? String {
                    let ann = Annotation(id: id, paragraphId: pid, text: text, author: author)
                    annotationsByParagraphId[pid, default: []].append(ann)
                }
            }
            
            self.paragraphs = pRows.compactMap { row -> Paragraph? in
                guard let id = row["id"] as? Int64,
                      let text = row["text"] as? String,
                      let author = row["author"] as? String,
                      let isMutableVal = row["is_mutable"] as? Int64,
                      let orderIndexVal = row["order_index"] as? Int64 else {
                    return nil
                }
                let isMutable = isMutableVal != 0
                let orderIndex = Int(orderIndexVal)
                let activeOptionId = row["active_option_id"] as? Int64
                let paragraphTags = tagsByParagraphId[id] ?? []
                let paragraphClips = clipsByParagraphId[id] ?? []
                let paragraphAnnotations = annotationsByParagraphId[id] ?? []
                
                return Paragraph(id: id, text: text, author: author, isMutable: isMutable, orderIndex: orderIndex, tags: paragraphTags, activeOptionId: activeOptionId, clips: paragraphClips, annotations: paragraphAnnotations)
            }
            
            var newTOC: [TableOfContentsItem] = []
            for p in self.paragraphs {
                let lowerText = p.text.lowercased()
                if (p.text.hasPrefix("#") && lowerText.contains("chapter")) || lowerText.hasPrefix("episode") || lowerText.hasPrefix("## episode") || lowerText.hasPrefix("# episode") {
                    // Clean up markdown hashes for the title
                    var title = p.text.replacingOccurrences(of: "#", with: "").trimmingCharacters(in: .whitespacesAndNewlines)
                    if title.count > 40 {
                        title = String(title.prefix(40)) + "..."
                    }
                    newTOC.append(TableOfContentsItem(id: p.id, title: title))
                }
            }
            self.tableOfContents = newTOC
            
            // Load timeline events
            let tRows = try databaseManager.query(sql: """
                SELECT id, event_title, event_date, description, paragraph_id
                FROM timeline_events
                """)
            var loadedEvents = tRows.compactMap { row -> TimelineEvent? in
                guard let id = row["id"] as? Int64,
                      let title = row["event_title"] as? String,
                      let dateStr = row["event_date"] as? String,
                      let desc = row["description"] as? String,
                      let pid = row["paragraph_id"] as? Int64 else {
                    return nil
                }
                return TimelineEvent(id: id, title: title, dateString: dateStr, description: desc, paragraphId: pid)
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
            
            loadedEvents.sort { (e1, e2) -> Bool in
                let d1 = parseDate(e1.dateString)
                let d2 = parseDate(e2.dateString)
                if d1 == d2 {
                    return e1.id < e2.id
                }
                return d1 < d2
            }
            self.timelineEvents = loadedEvents
        } catch {
            print("Error loading data: \(error)")
        }
    }
    
    public func selectTag(_ tag: Tag?) {
        self.selectedTag = tag
        loadData()
    }
    
    public func getOptions(for paragraphId: Int64) -> [Option] {
        do {
            let rows = try databaseManager.query(sql: """
                SELECT id, paragraph_id, text, voice, status
                FROM options
                WHERE paragraph_id = ?
                """, parameters: [paragraphId])
            return rows.compactMap { row -> Option? in
                guard let id = row["id"] as? Int64,
                      let pid = row["paragraph_id"] as? Int64,
                      let text = row["text"] as? String,
                      let voice = row["voice"] as? String,
                      let status = row["status"] as? String else {
                    return nil
                }
                return Option(id: id, paragraphId: pid, text: text, voice: voice, status: status)
            }
        } catch {
            print("Error getting options: \(error)")
            return []
        }
    }
    
    public func hotSwapOption(paragraphId: Int64, optionId: Int64?) {
        do {
            try databaseManager.beginTransaction()
            do {
                if let optionId = optionId {
                    let checkSQL = "SELECT 1 FROM options WHERE id = ? AND paragraph_id = ?"
                    let results = try databaseManager.query(sql: checkSQL, parameters: [optionId, paragraphId])
                    guard !results.isEmpty else {
                        throw NSError(domain: "DocumentViewModel", code: 1, userInfo: [NSLocalizedDescriptionKey: "Error: Option with ID \(optionId) not found for Paragraph \(paragraphId)"])
                    }
                }
                
                try databaseManager.execute(sql: "UPDATE options SET status = 'queued' WHERE paragraph_id = ?;", parameters: [paragraphId])
                if let optionId = optionId {
                    try databaseManager.execute(sql: "UPDATE options SET status = 'active' WHERE id = ?;", parameters: [optionId])
                }
                try databaseManager.commitTransaction()
            } catch {
                try? databaseManager.rollbackTransaction()
                throw error
            }
            loadData()
        } catch {
            print("Error hot swapping option: \(error)")
        }
    }
    
    public func generateOptions(for paragraphId: Int64) {
        do {
            let paragraphRows = try databaseManager.query(sql: "SELECT * FROM paragraphs WHERE id = ?;", parameters: [paragraphId])
            guard let paragraphRow = paragraphRows.first else {
                print("Paragraph with ID \(paragraphId) not found")
                return
            }
            
            guard let id = paragraphRow["id"] as? Int64,
                  let text = paragraphRow["text"] as? String,
                  let author = paragraphRow["author"] as? String,
                  let isMutableVal = paragraphRow["is_mutable"] as? Int64,
                  let orderIndexVal = paragraphRow["order_index"] as? Int64 else {
                print("Error: Failed to parse paragraph row from database")
                return
            }
            let isMutable = isMutableVal != 0
            let orderIndex = Int(orderIndexVal)
            
            let paragraph = Paragraph(
                id: id,
                text: text,
                author: author,
                isMutable: isMutable,
                orderIndex: orderIndex
            )
            
            let service = CoAuthoringService(databaseManager: databaseManager)
            _ = try service.generateOptions(for: paragraph)
            
            loadData()
        } catch {
            print("Error generating options: \(error)")
        }
    }
    
    public func importFromInbox(path: String) {
        do {
            let importer = ImportService(databaseManager: databaseManager)
            _ = try importer.importDrafts(from: path)
            loadData()
            self.importErrorMessage = nil
            self.showImportAlert = false
        } catch {
            print("Error importing drafts: \(error)")
            self.importErrorMessage = error.localizedDescription
            self.showImportAlert = true
        }
    }
    
    public func paragraphText(for paragraphId: Int64) -> String {
        guard let p = paragraphs.first(where: { $0.id == paragraphId }) else { return "" }
        if let activeOptId = p.activeOptionId {
            let options = getOptions(for: paragraphId)
            if let activeOpt = options.first(where: { $0.id == activeOptId }) {
                return activeOpt.text
            }
        }
        return p.text
    }
    
    public func addAnnotation(paragraphId: Int64, text: String, author: String = "Charlie") {
        do {
            try databaseManager.executeInsert(sql: "INSERT INTO annotations (paragraph_id, text, author) VALUES (?, ?, ?)", parameters: [paragraphId, text, author])
            loadData()
        } catch {
            print("Error adding annotation: \(error)")
        }
    }
}
