import SwiftUI
import QuipslyVideoCore
import Network

@main
struct QuipslyVideoMacApp: App {
    init() {
        AgentServer.shared.start()
    }
    
    var body: some Scene {
        WindowGroup {
            ContentView()
                .frame(minWidth: 800, minHeight: 600)
        }
    }
}

struct ContentView: View {
    @StateObject private var playbackEngine = PlaybackEngine()
    @StateObject private var projectStore = ProjectStore(project: VideoProject(title: "New Project"))
    
    var body: some View {
        WorkspaceView(playbackEngine: playbackEngine, projectStore: projectStore)
    }
}


@MainActor
public class AgentServer: ObservableObject {
    public static let shared = AgentServer()
    
    @Published var commandToExecute: String = ""
    @Published var importFilePath: String? = nil
    @Published var editLaneId: String? = nil
    @Published var editAction: String? = nil
    @Published var editValue1: Double? = nil
    @Published var editValue2: Double? = nil
    @Published var trigger: UUID = UUID()
    
    private var listener: NWListener?
    
    public init() {
        start()
    }
    
    public func start() {
        do {
            let port = NWEndpoint.Port(integerLiteral: 8080)
            let parameters = NWParameters.tcp
            listener = try NWListener(using: parameters, on: port)
            
            listener?.newConnectionHandler = { [weak self] connection in
                Task { @MainActor in
                    self?.handleConnection(connection)
                }
            }
            
            listener?.start(queue: .global(qos: .userInitiated))
            print("AgentServer listening on port 8080")
        } catch {
            print("Failed to start AgentServer: \(error)")
        }
    }
    
    private func handleConnection(_ connection: NWConnection) {
        connection.start(queue: .global(qos: .userInitiated))
        
        connection.receive(minimumIncompleteLength: 1, maximumLength: 65536) { [weak self] data, context, isComplete, error in
            print("AgentServer: connection.receive triggered! error=\(String(describing: error)), data size=\(data?.count ?? 0)")
            guard let data = data, let requestString = String(data: data, encoding: .utf8) else {
                print("AgentServer: cancel connection because of invalid data")
                connection.cancel()
                return
            }
            
            // Very basic HTTP parsing
            let lines = requestString.components(separatedBy: "\r\n")
            guard let firstLine = lines.first else {
                print("AgentServer: cancel connection because no first line")
                connection.cancel()
                return
            }
            print("AgentServer: request line: \(firstLine)")
            let parts = firstLine.components(separatedBy: " ")
            if parts.count >= 2, parts[0] == "GET" {
                let pathAndQuery = parts[1]
                let comps = URLComponents(string: pathAndQuery)
                let path = comps?.path ?? "/"
                
                var queryDict: [String: String] = [:]
                comps?.queryItems?.forEach { queryDict[$0.name] = $0.value }
                
                if path == "/import" {
                    if let filePath = queryDict["path"] {
                        Task { @MainActor in
                            self?.commandToExecute = "import_file"
                            self?.importFilePath = filePath
                            self?.trigger = UUID()
                            self?.sendResponse(connection, body: "{\"status\": \"import_commanded\"}")
                        }
                    } else {
                        Task { @MainActor in
                            self?.sendResponse(connection, body: "{\"error\": \"missing_path\"}", statusCode: 400)
                        }
                    }
                } else if path.starts(with: "/edit") {
                    if let query = parts.count > 1 ? parts[1].components(separatedBy: "?").last : nil,
                       let urlParams = URLComponents(string: "?" + query)?.queryItems,
                       let laneId = urlParams.first(where: { $0.name == "lane_id" })?.value,
                       let action = urlParams.first(where: { $0.name == "action" })?.value {
                        let val1 = Double(urlParams.first(where: { $0.name == "v1" })?.value ?? "")
                        let val2 = Double(urlParams.first(where: { $0.name == "v2" })?.value ?? "")
                        Task { @MainActor in
                            self?.commandToExecute = "edit"
                            self?.editLaneId = laneId
                            self?.editAction = action
                            self?.editValue1 = val1
                            self?.editValue2 = val2
                            self?.trigger = UUID()
                            self?.sendResponse(connection, body: "{\"status\": \"edit_commanded\"}")
                        }
                    } else {
                        Task { @MainActor in
                            self?.sendResponse(connection, body: "{\"error\": \"missing_edit_params\"}", statusCode: 400)
                        }
                    }
                } else if path == "/state" {
                    Task { @MainActor in
                        self?.commandToExecute = "get_state"
                        self?.trigger = UUID()
                        let statusStr: String
                        if let status = self?.lastStatus {
                            var dictParts: [String] = []
                            for (k, v) in status {
                                if let arr = v as? [[String: Any]] {
                                    var arrParts: [String] = []
                                    for dict in arr {
                                        let id = dict["id"] as? String ?? ""
                                        let name = dict["name"] as? String ?? ""
                                        let duration = dict["duration"] as? Double ?? 0
                                        arrParts.append("{\"id\": \"\(id)\", \"name\": \"\(name)\", \"duration\": \(duration)}")
                                    }
                                    let joinedArr = arrParts.joined(separator: ",")
                                    dictParts.append("\"\(k)\": [\(joinedArr)]")
                                } else if let str = v as? String {
                                    let safeStr = str.replacingOccurrences(of: "\"", with: "\\\"").replacingOccurrences(of: "\n", with: "\\n")
                                    dictParts.append("\"\(k)\": \"\(safeStr)\"")
                                }
                            }
                            statusStr = "{ " + dictParts.joined(separator: ", ") + " }"
                        } else {
                            statusStr = "{\"status\": \"no_state_yet\"}"
                        }
                        print("AgentServer: sending response for /state: \(statusStr)")
                        self?.sendResponse(connection, body: statusStr)
                    }
                } else {
                    print("AgentServer: not found path \\(path)")
                    Task { @MainActor in
                        self?.sendResponse(connection, body: "{\"error\": \"not_found\"}", statusCode: 404)
                    }
                }
            } else {
                print("AgentServer: invalid HTTP request")
                connection.cancel()
            }
        }
    }
    
    private func sendResponse(_ connection: NWConnection, body: String, statusCode: Int = 200) {
        let response = """
        HTTP/1.1 \(statusCode) OK\r
        Content-Type: application/json\r
        Connection: close\r
        \r
        \(body)
        """
        
        print("AgentServer: actually sending data to connection")
        let data = response.data(using: .utf8)!
        connection.send(content: data, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }
    public var lastStatus: [String: Any]? = nil
    
    public func writeStatus(_ status: [String: Any]) {
        self.lastStatus = status
    }
}
