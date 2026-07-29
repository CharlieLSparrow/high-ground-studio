import Foundation
#if canImport(SQLite3)
import SQLite3
#endif

// SQLite transient destructor bridge for Swift
private let SQLITE_TRANSIENT = unsafeBitCast(OpaquePointer(bitPattern: -1), to: sqlite3_destructor_type.self)

public final class DatabaseManager {
    private var db: OpaquePointer?
    
    public var dbPointer: OpaquePointer? {
        return db
    }
    
    /// Initializes a database connection.
    /// - Parameter databasePath: An optional path. If nil, checks `LTL_DB_PATH` environment variable.
    ///   If the environment variable is missing, defaults to `test_e2e.db` in current directory.
    public init(databasePath: String? = nil) throws {
        let resolvedPath: String
        
        if let explicitPath = databasePath {
            resolvedPath = explicitPath
        } else if let envPath = ProcessInfo.processInfo.environment["LTL_DB_PATH"], !envPath.isEmpty {
            resolvedPath = envPath
        } else {
            resolvedPath = "test_e2e.db"
        }
        
        // Ensure parent directory exists for file databases
        if resolvedPath != ":memory:" {
            let url = URL(fileURLWithPath: resolvedPath)
            let directory = url.deletingLastPathComponent()
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        }
        
        #if canImport(SQLite3)
        if sqlite3_open(resolvedPath, &db) != SQLITE_OK {
            let errorMessage: String
            if let db = db {
                errorMessage = String(cString: sqlite3_errmsg(db))
            } else {
                errorMessage = "Unknown error opening database"
            }
            throw NSError(domain: "DatabaseManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "Unable to open database: \(errorMessage)"])
        }
        #else
        throw NSError(domain: "DatabaseManager", code: 1, userInfo: [NSLocalizedDescriptionKey: "SQLite3 is not available on this platform"])
        #endif
        
        // Enforce referential integrity
        try execute(sql: "PRAGMA foreign_keys = ON;")
        
        // Ensure tables exist
        try setupSchema()
    }
    
    deinit {
        #if canImport(SQLite3)
        if let db = db {
            sqlite3_close(db)
        }
        #endif
    }
    
    /// Executes a raw DDL/DML SQL statement without parameters.
    public func execute(sql: String) throws {
        #if canImport(SQLite3)
        var errorMsg: UnsafeMutablePointer<Int8>? = nil
        if sqlite3_exec(db, sql, nil, nil, &errorMsg) != SQLITE_OK {
            let error = errorMsg.map { String(cString: $0) } ?? "Unknown SQLite error"
            if let errorMsg = errorMsg {
                sqlite3_free(errorMsg)
            }
            throw NSError(domain: "DatabaseManager", code: 2, userInfo: [NSLocalizedDescriptionKey: "Error executing SQL: \(error)"])
        }
        #endif
    }
    
    /// Helper to unwrap any Swift optional value recursively
    private func unwrapOptional(_ value: Any) -> Any? {
        let mirror = Mirror(reflecting: value)
        if mirror.displayStyle != .optional {
            return value
        }
        if mirror.children.isEmpty {
            return nil
        }
        let (_, some) = mirror.children.first!
        return unwrapOptional(some)
    }
    
    /// Binds parameters to a prepared statement.
    private func bind(parameters: [Any], to statement: OpaquePointer?) throws {
        #if canImport(SQLite3)
        for (index, arg) in parameters.enumerated() {
            let bindIndex = Int32(index + 1)
            var status: Int32
            
            let unwrapped = unwrapOptional(arg)
            if unwrapped == nil {
                status = sqlite3_bind_null(statement, bindIndex)
            } else {
                let val = unwrapped!
                if let stringVal = val as? String {
                    status = stringVal.withCString { cStr in
                        sqlite3_bind_text(statement, bindIndex, cStr, -1, SQLITE_TRANSIENT)
                    }
                } else if let intVal = val as? Int {
                    status = sqlite3_bind_int64(statement, bindIndex, Int64(intVal))
                } else if let int64Val = val as? Int64 {
                    status = sqlite3_bind_int64(statement, bindIndex, int64Val)
                } else if let boolVal = val as? Bool {
                    status = sqlite3_bind_int(statement, bindIndex, boolVal ? 1 : 0)
                } else if let doubleVal = val as? Double {
                    status = sqlite3_bind_double(statement, bindIndex, doubleVal)
                } else if val is NSNull {
                    status = sqlite3_bind_null(statement, bindIndex)
                } else {
                    throw NSError(
                        domain: "DatabaseManager",
                        code: 4,
                        userInfo: [NSLocalizedDescriptionKey: "Unsupported argument type at index \(index): \(type(of: arg))"]
                    )
                }
            }
            
            if status != SQLITE_OK {
                let error = db.map { String(cString: sqlite3_errmsg($0)) } ?? "Unknown error"
                throw NSError(
                    domain: "DatabaseManager",
                    code: 4,
                    userInfo: [NSLocalizedDescriptionKey: "Failed to bind parameter at index \(index): \(error)"]
                )
            }
        }
        #endif
    }
    
    /// Executes a prepared SQL statement (INSERT, UPDATE, DELETE) with bindings.
    /// - Parameters:
    ///   - sql: The SQL statement with standard placeholders (`?`).
    ///   - parameters: An array of values to bind.
    /// - Returns: The row ID of the last inserted row.
    @discardableResult
    public func execute(sql: String, parameters: [Any]) throws -> Int64 {
        #if canImport(SQLite3)
        var statement: OpaquePointer?
        defer {
            sqlite3_finalize(statement)
        }
        
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) != SQLITE_OK {
            let error = db.map { String(cString: sqlite3_errmsg($0)) } ?? "Unknown error"
            throw NSError(domain: "DatabaseManager", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to prepare statement: \(error)"])
        }
        
        try bind(parameters: parameters, to: statement)
        
        let status = sqlite3_step(statement)
        if status != SQLITE_DONE {
            let error = db.map { String(cString: sqlite3_errmsg($0)) } ?? "Unknown error"
            throw NSError(domain: "DatabaseManager", code: 5, userInfo: [NSLocalizedDescriptionKey: "Failed to execute statement: \(error)"])
        }
        
        return sqlite3_last_insert_rowid(db)
        #else
        return 0
        #endif
    }
    
    /// Alias for execute(sql:parameters:) returning last insert rowid.
    @discardableResult
    public func executeInsert(sql: String, parameters: [Any]) throws -> Int64 {
        return try execute(sql: sql, parameters: parameters)
    }
    
    /// Queries the database and returns all matching rows as dictionaries.
    /// - Parameters:
    ///   - sql: The SELECT statement with optional placeholders.
    ///   - parameters: Values to bind to placeholders.
    /// - Returns: An array of row dictionaries mapping column names to values.
    public func query(sql: String, parameters: [Any] = []) throws -> [[String: Any]] {
        #if canImport(SQLite3)
        var statement: OpaquePointer?
        defer {
            sqlite3_finalize(statement)
        }
        
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) != SQLITE_OK {
            let error = db.map { String(cString: sqlite3_errmsg($0)) } ?? "Unknown error"
            throw NSError(domain: "DatabaseManager", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to prepare statement: \(error)"])
        }
        
        try bind(parameters: parameters, to: statement)
        
        var rows: [[String: Any]] = []
        
        while sqlite3_step(statement) == SQLITE_ROW {
            var row: [String: Any] = [:]
            let columnCount = sqlite3_column_count(statement)
            
            for i in 0..<columnCount {
                guard let cName = sqlite3_column_name(statement, i) else { continue }
                let columnName = String(cString: cName)
                let columnType = sqlite3_column_type(statement, i)
                
                switch columnType {
                case SQLITE_INTEGER:
                    let val = sqlite3_column_int64(statement, i)
                    row[columnName] = Int64(val)
                case SQLITE_FLOAT:
                    let val = sqlite3_column_double(statement, i)
                    row[columnName] = val
                case SQLITE_TEXT:
                    if let cText = sqlite3_column_text(statement, i) {
                        row[columnName] = String(cString: cText)
                    } else {
                        row[columnName] = ""
                    }
                case SQLITE_BLOB:
                    let bytes = sqlite3_column_bytes(statement, i)
                    if let dataPointer = sqlite3_column_blob(statement, i) {
                        row[columnName] = Data(bytes: dataPointer, count: Int(bytes))
                    } else {
                        row[columnName] = Data()
                    }
                case SQLITE_NULL:
                    row[columnName] = NSNull()
                default:
                    row[columnName] = NSNull()
                }
            }
            rows.append(row)
        }
        
        return rows
        #else
        return []
        #endif
    }
    
    /// Queries a single value (such as MAX, COUNT) and returns it.
    public func querySingleValue(sql: String, parameters: [Any] = []) throws -> Any? {
        #if canImport(SQLite3)
        var statement: OpaquePointer?
        defer {
            sqlite3_finalize(statement)
        }
        
        if sqlite3_prepare_v2(db, sql, -1, &statement, nil) != SQLITE_OK {
            let error = db.map { String(cString: sqlite3_errmsg($0)) } ?? "Unknown error"
            throw NSError(domain: "DatabaseManager", code: 3, userInfo: [NSLocalizedDescriptionKey: "Failed to prepare statement: \(error)"])
        }
        
        try bind(parameters: parameters, to: statement)
        
        if sqlite3_step(statement) == SQLITE_ROW {
            let columnType = sqlite3_column_type(statement, 0)
            switch columnType {
            case SQLITE_INTEGER:
                return sqlite3_column_int64(statement, 0)
            case SQLITE_FLOAT:
                return sqlite3_column_double(statement, 0)
            case SQLITE_TEXT:
                if let cText = sqlite3_column_text(statement, 0) {
                    return String(cString: cText)
                }
                return nil
            default:
                return nil
            }
        }
        return nil
        #else
        return nil
        #endif
    }
    
    // MARK: - Transaction Helpers
    
    public func beginTransaction() throws {
        try execute(sql: "BEGIN TRANSACTION;")
    }
    
    public func commitTransaction() throws {
        try execute(sql: "COMMIT;")
    }
    
    public func rollbackTransaction() throws {
        try execute(sql: "ROLLBACK;")
    }
    
    // MARK: - Schema Setup
    
    public func setupSchema() throws {
        let sql = """
        CREATE TABLE IF NOT EXISTS paragraphs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT,
            author TEXT,
            is_mutable BOOLEAN,
            order_index INTEGER
        );
        CREATE TABLE IF NOT EXISTS tags (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE COLLATE NOCASE
        );
        CREATE TABLE IF NOT EXISTS paragraph_tags (
            paragraph_id INTEGER,
            tag_id INTEGER,
            PRIMARY KEY (paragraph_id, tag_id),
            FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id) ON DELETE CASCADE,
            FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS options (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paragraph_id INTEGER,
            text TEXT,
            voice TEXT,
            status TEXT,
            FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS timeline_events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            event_title TEXT,
            event_date TEXT,
            description TEXT,
            paragraph_id INTEGER,
            FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id) ON DELETE CASCADE
        );
        CREATE TABLE IF NOT EXISTS annotations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            paragraph_id INTEGER,
            text TEXT,
            author TEXT,
            FOREIGN KEY (paragraph_id) REFERENCES paragraphs(id) ON DELETE CASCADE
        );
        """
        try execute(sql: sql)
    }
}
