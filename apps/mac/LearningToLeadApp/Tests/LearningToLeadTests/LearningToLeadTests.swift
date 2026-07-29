import XCTest
import class Foundation.Bundle
@testable import LearningToLeadApp

final class LearningToLeadTests: XCTestCase {
    
    private var bundleProductsDirectory: URL {
        #if os(macOS)
        for bundle in Bundle.allBundles where bundle.bundlePath.hasSuffix(".xctest") {
            return bundle.bundleURL.deletingLastPathComponent()
        }
        fatalError("Couldn't find the products directory URL")
        #else
        return Bundle.main.bundleURL
        #endif
    }
    
    func testExecutableRunsAndOutputsVersion() throws {
        let binaryURL = bundleProductsDirectory.appendingPathComponent("LearningToLeadApp")
        
        let process = Process()
        process.executableURL = binaryURL
        process.arguments = ["--version"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        
        try process.run()
        process.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines)
        
        XCTAssertEqual(process.terminationStatus, 0)
        XCTAssertEqual(output, "1.0.0")
    }

    func testExecutableHelpPrintsUsage() throws {
        let binaryURL = bundleProductsDirectory.appendingPathComponent("LearningToLeadApp")
        
        let process = Process()
        process.executableURL = binaryURL
        process.arguments = ["--help"]
        
        let pipe = Pipe()
        process.standardOutput = pipe
        
        try process.run()
        process.waitUntilExit()
        
        let data = pipe.fileHandleForReading.readDataToEndOfFile()
        let output = String(data: data, encoding: .utf8) ?? ""
        
        XCTAssertEqual(process.terminationStatus, 0)
        XCTAssertTrue(output.contains("Usage:"), "Output was: \(output)")
        XCTAssertTrue(output.contains("LearningToLeadApp [options]"), "Output was: \(output)")
    }
    
    func testDatabaseManagerInVolumeOrMemory() throws {
        let dbManager = try DatabaseManager(databasePath: ":memory:")
        
        try dbManager.execute(sql: """
        CREATE TABLE IF NOT EXISTS test_paragraphs (
            id TEXT PRIMARY KEY,
            text TEXT NOT NULL
        );
        """)
        
        try dbManager.execute(sql: """
        INSERT INTO test_paragraphs (id, text) VALUES ('123', 'Hello world');
        """)
    }
    
    func testCoAuthoringServiceGenerateOptionsOnMutableParagraph() throws {
        let dbManager = try DatabaseManager(databasePath: ":memory:")
        let service = CoAuthoringService(databaseManager: dbManager)
        
        // Insert a mutable paragraph in DB
        let paragraphId = try dbManager.executeInsert(sql: """
            INSERT INTO paragraphs (text, author, is_mutable, order_index)
            VALUES (?, ?, ?, ?)
            """, parameters: ["This is a test paragraph.", "Charlie", true, 0])
        
        let paragraph = Paragraph(id: paragraphId, text: "This is a test paragraph.", author: "Charlie", isMutable: true, orderIndex: 0)
        
        let options = try service.generateOptions(for: paragraph)
        
        XCTAssertEqual(options.count, 2)
        XCTAssertEqual(options[0].paragraphId, paragraphId)
        XCTAssertEqual(options[0].voice, "Gladwell")
        XCTAssertEqual(options[0].status, "queued")
        XCTAssertEqual(options[1].paragraphId, paragraphId)
        XCTAssertEqual(options[1].voice, "Discworld")
        XCTAssertEqual(options[1].status, "queued")
        
        // Check database actually has the two options
        let dbOptions = try dbManager.query(sql: "SELECT * FROM options WHERE paragraph_id = ?;", parameters: [paragraphId])
        XCTAssertEqual(dbOptions.count, 2)
    }
    
    func testCoAuthoringServiceGenerateOptionsOnImmutableParagraphThrowsError() throws {
        let dbManager = try DatabaseManager(databasePath: ":memory:")
        let service = CoAuthoringService(databaseManager: dbManager)
        
        let paragraph = Paragraph(id: 1, text: "This is immutable.", author: "Homer", isMutable: false, orderIndex: 0)
        
        XCTAssertThrowsError(try service.generateOptions(for: paragraph)) { error in
            guard let coAuthoringError = error as? CoAuthoringError else {
                XCTFail("Unexpected error type: \(error)")
                return
            }
            switch coAuthoringError {
            case .paragraphImmutable(let id):
                XCTAssertEqual(id, 1)
            }
        }
    }
    
    struct UnsupportedType {
        let value: String
    }

    func testDatabaseManagerBindUnsupportedTypeThrowsError() throws {
        let dbManager = try DatabaseManager(databasePath: ":memory:")
        let unsupported = UnsupportedType(value: "test")
        
        XCTAssertThrowsError(try dbManager.execute(sql: "INSERT INTO paragraphs (text) VALUES (?);", parameters: [unsupported])) { error in
            let nsError = error as NSError
            XCTAssertEqual(nsError.domain, "DatabaseManager")
            XCTAssertEqual(nsError.code, 4)
            XCTAssertTrue(nsError.localizedDescription.contains("Unsupported argument type"))
        }
    }

    func testDatabaseManagerForeignKeyConstraintViolationThrows() throws {
        let dbManager = try DatabaseManager(databasePath: ":memory:")
        
        // Attempt to insert an option for non-existent paragraph ID 999
        XCTAssertThrowsError(try dbManager.execute(sql: """
            INSERT INTO options (paragraph_id, text, voice, status)
            VALUES (?, ?, ?, 'queued')
            """, parameters: [999, "Gladwell text", "Gladwell"])) { error in
            let nsError = error as NSError
            XCTAssertEqual(nsError.domain, "DatabaseManager")
            XCTAssertEqual(nsError.code, 5) // Execution failure due to SQLite constraint
        }
    }

    func testImportServiceImportSingleFileWithoutExtensionThrowsError() throws {
        let dbManager = try DatabaseManager(databasePath: ":memory:")
        let importer = ImportService(databaseManager: dbManager)
        
        // Create temp folder and write a file with no extension
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent("draft_without_extension")
        let draftContent = "Author: Charlie\nMutable: True\nThis is paragraph one #leadership."
        try draftContent.write(to: fileURL, atomically: true, encoding: .utf8)
        
        defer {
            try? FileManager.default.removeItem(at: fileURL)
        }
        
        // Importing single file directly should throw an error because it doesn't have .md or .txt
        XCTAssertThrowsError(try importer.importDrafts(from: fileURL.path))
    }

    func testImportServiceTagExtractionIgnoreNumericAndHexColor() throws {
        let dbManager = try DatabaseManager(databasePath: ":memory:")
        let importer = ImportService(databaseManager: dbManager)
        
        let tempDir = FileManager.default.temporaryDirectory
        let fileURL = tempDir.appendingPathComponent("draft_tags.md")
        let draftContent = """
        Author: Charlie
        Mutable: True
        This paragraph has numeric tags #123 and #4567, hex colors #aabbcc, #ABC, and #ff00ff00, and valid tags #123a, #g12, and #leadership.
        """
        try draftContent.write(to: fileURL, atomically: true, encoding: .utf8)
        
        defer {
            try? FileManager.default.removeItem(at: fileURL)
        }
        
        _ = try importer.importDrafts(from: fileURL.path)
        
        let tags = try dbManager.query(sql: "SELECT name FROM tags ORDER BY name ASC;")
        let tagNames = tags.compactMap { $0["name"] as? String }
        
        XCTAssertEqual(tagNames.count, 3)
        XCTAssertEqual(tagNames, ["123a", "g12", "leadership"])
        XCTAssertFalse(tagNames.contains("123"))
        XCTAssertFalse(tagNames.contains("aabbcc"))
        XCTAssertFalse(tagNames.contains("ABC"))
        XCTAssertFalse(tagNames.contains("ff00ff00"))
    }

    func testImportServiceTransactionRollbackOnError() throws {
        let dbManager = try DatabaseManager(databasePath: ":memory:")
        let importer = ImportService(databaseManager: dbManager)
        
        let tempDir = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        try FileManager.default.createDirectory(at: tempDir, withIntermediateDirectories: true)
        
        defer {
            try? FileManager.default.removeItem(at: tempDir)
        }
        
        // Write a valid UTF-8 file
        let file1URL = tempDir.appendingPathComponent("1_valid.md")
        try "Author: Charlie\nParagraph one #valid.".write(to: file1URL, atomically: true, encoding: .utf8)
        
        // Write an invalid UTF-8 file (using binary data that is invalid UTF-8)
        let file2URL = tempDir.appendingPathComponent("2_invalid.md")
        let invalidBytes: [UInt8] = [0xC0, 0xAF, 0x80] // Invalid UTF-8 sequence
        let invalidData = Data(invalidBytes)
        try invalidData.write(to: file2URL)
        
        // Importing directory should throw encoding error because of 2_invalid.md
        XCTAssertThrowsError(try importer.importDrafts(from: tempDir.path))
        
        // Verify database is completely empty (the transaction was rolled back atomically)
        let paragraphs = try dbManager.query(sql: "SELECT * FROM paragraphs;")
        XCTAssertEqual(paragraphs.count, 0)
    }

    func testExtractionServicePlaceholderReturnsEmpty() throws {
        let service = ExtractionService()
        let paragraphs = [
            Paragraph(id: 1, text: "Some text", orderIndex: 0)
        ]
        let events = try service.extractTimelineEvents(from: paragraphs)
        XCTAssertEqual(events.count, 0)
    }

    func testViewModelHotSwapCrossActivationVulnerability() throws {
        let dbManager = try DatabaseManager(databasePath: ":memory:")
        let service = CoAuthoringService(databaseManager: dbManager)
        
        // 1. Insert Paragraph 1 (mutable)
        let p1Id = try dbManager.executeInsert(sql: """
            INSERT INTO paragraphs (text, author, is_mutable, order_index)
            VALUES (?, ?, ?, ?)
            """, parameters: ["Paragraph One", "Charlie", true, 0])
        
        // 2. Insert Paragraph 2 (mutable)
        let p2Id = try dbManager.executeInsert(sql: """
            INSERT INTO paragraphs (text, author, is_mutable, order_index)
            VALUES (?, ?, ?, ?)
            """, parameters: ["Paragraph Two", "Charlie", true, 1])
        
        // 3. Generate options for both paragraphs
        let _ = try service.generateOptions(for: Paragraph(id: p1Id, text: "Paragraph One", author: "Charlie", isMutable: true, orderIndex: 0))
        let optionsP2 = try service.generateOptions(for: Paragraph(id: p2Id, text: "Paragraph Two", author: "Charlie", isMutable: true, orderIndex: 1))
        
        // First option ID for paragraph 2
        let p2OptionId = optionsP2[0].id
        
        // 4. Instantiate view model
        let viewModel = DocumentViewModel(databaseManager: dbManager)
        
        // 5. Invoke hotSwapOption for paragraph 1 using paragraph 2's option ID
        viewModel.hotSwapOption(paragraphId: p1Id, optionId: p2OptionId)
        
        // 6. Query the database to check active options
        let activeOptions = try dbManager.query(sql: "SELECT * FROM options WHERE status = 'active'")
        XCTAssertEqual(activeOptions.count, 0, "No options should be active globally since the mismatched hotswap must be rejected.")
    }
}

