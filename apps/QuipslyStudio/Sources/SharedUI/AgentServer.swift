import Foundation
import Network
import QuipslyVideoCore
#if canImport(Combine)
import Combine
#endif

public struct AgentCommandRequest: Identifiable {
    public let id: UUID
    public let name: String
    public let values: [String: String]

    public init(id: UUID = UUID(), name: String, values: [String: String] = [:]) {
        self.id = id
        self.name = name
        self.values = values
    }
}

@MainActor
public class AgentServer: ObservableObject {
    public static let shared = AgentServer()
    
    @Published public var commandToExecute: String = ""
    @Published public var importFilePath: String? = nil
    @Published public var editLaneId: String? = nil
    @Published public var editAction: String? = nil
    @Published public var editValue1: Double? = nil
    @Published public var editValue2: Double? = nil
    @Published public var requestedDecision: String? = nil
    @Published public var requestedPlaybackMode: String? = nil
    @Published public var requestedPlaybackAction: String? = nil
    @Published public var premierePacketPath: String? = nil
    @Published public var requestedLaneRoleId: String? = nil
    @Published public var requestedLaneRole: String? = nil
    @Published public var requestedSessionName: String? = nil
    @Published public var requestedVaultLaneId: String? = nil
    @Published public var requestedRelinkLaneId: String? = nil
    @Published public var requestedRelinkFilePath: String? = nil
    @Published public var trigger: UUID = UUID()
    @Published public var commandSerial: Int = 0

    private var pendingCommandRequests: [AgentCommandRequest] = []
    
    private var listener: NWListener?
    public let port: UInt16 = 8080
    
    public init() {
        start()
    }
    
    public func start() {
        guard listener == nil else { return }
        
        do {
            let port = NWEndpoint.Port(integerLiteral: self.port)
            let parameters = NWParameters.tcp
            listener = try NWListener(using: parameters, on: port)
            
            listener?.newConnectionHandler = { [weak self] connection in
                Task { @MainActor in
                    self?.handleConnection(connection)
                }
            }
            
            listener?.start(queue: .global(qos: .userInitiated))
            print("AgentServer listening on port \(self.port)")
        } catch {
            print("Failed to start AgentServer: \(error)")
            writeStatus([
                "agentServer": "failed",
                "error": "\(error)"
            ])
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
            let request = self?.parseRequest(requestString)
            guard let request else {
                print("AgentServer: cancel connection because no first line")
                connection.cancel()
                return
            }

            print("AgentServer: request line: \(request.method) \(request.path)")
            guard request.method == "GET" else {
                Task { @MainActor in
                    self?.sendJSON(connection, object: ["error": "method_not_allowed"], statusCode: 405, reason: "Method Not Allowed")
                }
                return
            }
            
            switch request.path {
            case "/", "/health":
                Task { @MainActor in
                    self?.sendJSON(connection, object: self?.healthPayload() ?? ["status": "unavailable"])
                }
            case "/commands":
                Task { @MainActor in
                    self?.sendJSON(connection, object: self?.commandsPayload() ?? ["commands": []])
                }
            case "/agent_manual":
                Task { @MainActor in
                    self?.sendJSON(connection, object: self?.agentManualPayload() ?? ["status": "unavailable"])
                }
            case "/agent_capabilities":
                Task { @MainActor in
                    self?.sendJSON(connection, object: self?.agentCapabilitiesPayload() ?? ["status": "unavailable"])
                }
            case "/demo":
                Task { @MainActor in
                    self?.enqueueCommand("load_demo")
                    self?.sendJSON(connection, object: ["status": "load_demo_commanded"])
                }
            case "/premiere_packet":
                guard let filePath = request.query["path"], !filePath.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_path"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("load_premiere_packet", values: ["path": filePath])
                    self?.sendJSON(connection, object: ["status": "premiere_packet_commanded", "path": filePath])
                }
            case "/import":
                guard let filePath = request.query["path"], !filePath.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_path"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("import_file", values: ["path": filePath])
                    self?.sendJSON(connection, object: ["status": "import_commanded", "path": filePath])
                }
            case "/decision":
                guard let decision = request.query["action"], !decision.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_decision_action"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = ["action": decision]
                    if let start = request.query["start"] {
                        values["start"] = start
                    }
                    if let duration = request.query["duration"] {
                        values["duration"] = duration
                    }
                    self?.enqueueCommand("decision", values: values)
                    var response: [String: Any] = [
                        "status": "decision_commanded",
                        "action": decision
                    ]
                    if let start = Double(request.query["start"] ?? "") {
                        response["start"] = start
                    }
                    if let duration = Double(request.query["duration"] ?? "") {
                        response["duration"] = duration
                    }
                    self?.sendJSON(connection, object: response)
                }
            case "/playback":
                let mode = request.query["mode"] ?? "edit"
                let action = request.query["action"] ?? "toggle"
                Task { @MainActor in
                    self?.enqueueCommand("playback", values: [
                        "mode": mode,
                        "action": action
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "playback_commanded",
                        "mode": mode,
                        "action": action
                    ])
                }
            case "/seek":
                let time = request.query["time"] ?? request.query["seconds"] ?? "0"
                Task { @MainActor in
                    self?.enqueueCommand("seek", values: ["time": time])
                    self?.sendJSON(connection, object: [
                        "status": "seek_commanded",
                        "time": time
                    ])
                }
            case "/scrub":
                let time = request.query["time"] ?? request.query["seconds"] ?? "0"
                Task { @MainActor in
                    self?.enqueueCommand("scrub", values: ["time": time])
                    self?.sendJSON(connection, object: [
                        "status": "scrub_commanded",
                        "time": time
                    ])
                }
            case "/program_scroll":
                let delta = request.query["delta"] ?? request.query["seconds"] ?? "0"
                Task { @MainActor in
                    self?.enqueueCommand("program_scroll", values: ["delta": delta])
                    self?.sendJSON(connection, object: [
                        "status": "program_scroll_commanded",
                        "delta": delta
                    ])
                }
            case "/select_tag":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty,
                      let tagId = request.query["tag_id"], !tagId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_select_tag_params"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("select_tag", values: [
                        "lane_id": laneId,
                        "tag_id": tagId
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "select_tag_commanded",
                        "lane_id": laneId,
                        "tag_id": tagId
                    ])
                }
            case "/select_decision":
                let mode = request.query["mode"] ?? "at_playhead"
                let scope = request.query["scope"] ?? ""
                Task { @MainActor in
                    var values: [String: String] = ["mode": mode]
                    if !scope.isEmpty {
                        values["scope"] = scope
                    }
                    if let laneId = request.query["lane_id"], !laneId.isEmpty {
                        values["lane_id"] = laneId
                    }
                    self?.enqueueCommand("select_decision", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "select_decision_commanded",
                        "mode": mode,
                        "scope": scope,
                        "lane_id": values["lane_id"] ?? ""
                    ])
                }
            case "/nudge_selected":
                let delta = request.query["delta"] ?? "0"
                Task { @MainActor in
                    self?.enqueueCommand("nudge_selected", values: ["delta": delta])
                    self?.sendJSON(connection, object: [
                        "status": "nudge_selected_commanded",
                        "delta": delta
                    ])
                }
            case "/trim_selected":
                let startDelta = request.query["start_delta"] ?? "0"
                let durationDelta = request.query["duration_delta"] ?? "0"
                Task { @MainActor in
                    self?.enqueueCommand("trim_selected", values: [
                        "start_delta": startDelta,
                        "duration_delta": durationDelta
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "trim_selected_commanded",
                        "start_delta": startDelta,
                        "duration_delta": durationDelta
                    ])
                }
            case "/delete_selected_tag":
                Task { @MainActor in
                    self?.enqueueCommand("delete_selected_tag")
                    self?.sendJSON(connection, object: ["status": "delete_selected_tag_commanded"])
                }
            case "/focus_monitors":
                Task { @MainActor in
                    self?.enqueueCommand("focus_monitors")
                    self?.sendJSON(connection, object: ["status": "focus_monitors_commanded"])
                }
            case "/focus_timeline":
                Task { @MainActor in
                    self?.enqueueCommand("focus_timeline")
                    self?.sendJSON(connection, object: ["status": "focus_timeline_commanded"])
                }
            case "/left_workbench":
                let mode = request.query["mode"] ?? "shorts"
                Task { @MainActor in
                    self?.enqueueCommand("left_workbench", values: ["mode": mode])
                    self?.sendJSON(connection, object: [
                        "status": "left_workbench_commanded",
                        "mode": mode
                    ])
                }
            case "/timeline_zoom":
                Task { @MainActor in
                    var values: [String: String] = [:]
                    if let mode = request.query["mode"] {
                        values["mode"] = mode
                    }
                    if let scale = request.query["scale"] ?? request.query["pixels_per_second"] {
                        values["scale"] = scale
                    }
                    self?.enqueueCommand("timeline_zoom", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "timeline_zoom_commanded",
                        "mode": values["mode"] ?? "",
                        "scale": values["scale"] ?? ""
                    ])
                }
            case "/select_lane":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_lane_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("select_lane", values: ["lane_id": laneId])
                    self?.sendJSON(connection, object: [
                        "status": "select_lane_commanded",
                        "lane_id": laneId
                    ])
                }
            case "/format":
                let value = request.query["value"] ?? request.query["format"] ?? "16:9"
                Task { @MainActor in
                    self?.enqueueCommand("format", values: ["value": value])
                    self?.sendJSON(connection, object: [
                        "status": "format_commanded",
                        "value": value
                    ])
                }
            case "/program_crop_mode":
                let mode = request.query["mode"] ?? "baseline"
                Task { @MainActor in
                    self?.enqueueCommand("program_crop_mode", values: ["mode": mode])
                    self?.sendJSON(connection, object: [
                        "status": "program_crop_mode_commanded",
                        "mode": mode,
                        "meaning": "baseline fixes the whole selected lane; keyframe writes timed position/zoom at the shared playhead"
                    ])
                }
            case "/program_crop":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_lane_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = [
                        "lane_id": laneId,
                        "format": request.query["format"] ?? ""
                    ]
                    for key in ["pan_x", "pan_y", "zoom", "pan_x_delta", "pan_y_delta", "zoom_delta"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("program_crop", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "program_crop_commanded",
                        "lane_id": laneId,
                        "format": values["format"] ?? "",
                        "pan_x": values["pan_x"] ?? "",
                        "pan_y": values["pan_y"] ?? "",
                        "zoom": values["zoom"] ?? ""
                    ])
                }
            case "/program_crop_preset":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_lane_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                guard let preset = request.query["preset"], !preset.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_preset"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = [
                        "lane_id": laneId,
                        "preset": preset,
                        "format": request.query["format"] ?? "",
                        "mode": request.query["mode"] ?? "baseline"
                    ]
                    if let time = request.query["time"], !time.isEmpty {
                        values["time"] = time
                    }
                    self?.enqueueCommand("program_crop_preset", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "program_crop_preset_commanded",
                        "lane_id": laneId,
                        "format": values["format"] ?? "",
                        "mode": values["mode"] ?? "",
                        "preset": preset
                    ])
                }
            case "/program_crop_keyframe":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_lane_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = [
                        "lane_id": laneId,
                        "format": request.query["format"] ?? ""
                    ]
                    for key in ["time", "pan_x", "pan_y", "zoom", "pan_x_delta", "pan_y_delta", "zoom_delta"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("program_crop_keyframe", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "program_crop_keyframe_commanded",
                        "lane_id": laneId,
                        "format": values["format"] ?? "",
                        "time": values["time"] ?? ""
                    ])
                }
            case "/program_crop_clear_keyframes":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_lane_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("program_crop_clear_keyframes", values: [
                        "lane_id": laneId,
                        "format": request.query["format"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "program_crop_clear_keyframes_commanded",
                        "lane_id": laneId,
                        "format": request.query["format"] ?? ""
                    ])
                }
            case "/source_window":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_lane_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                let action = request.query["action"] ?? "show"
                let duration = request.query["duration"] ?? "10"
                Task { @MainActor in
                    self?.enqueueCommand("source_window", values: [
                        "lane_id": laneId,
                        "action": action,
                        "duration": duration
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "source_window_commanded",
                        "lane_id": laneId,
                        "action": action,
                        "duration": duration
                    ])
                }
            case "/switch_selected_decision":
                guard let action = request.query["action"], !action.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_switch_action"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("switch_selected_decision", values: ["action": action])
                    self?.sendJSON(connection, object: [
                        "status": "switch_selected_decision_commanded",
                        "action": action
                    ])
                }
            case "/transcript_seed_demo":
                Task { @MainActor in
                    self?.enqueueCommand("transcript_seed_demo")
                    self?.sendJSON(connection, object: ["status": "transcript_seed_demo_commanded"])
                }
            case "/transcript_import":
                guard let path = request.query["path"], !path.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_transcript_path"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                let format = request.query["format"] ?? "auto"
                Task { @MainActor in
                    self?.enqueueCommand("transcript_import", values: [
                        "path": path,
                        "format": format
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "transcript_import_commanded",
                        "path": path,
                        "format": format
                    ])
                }
            case "/transcript_generate":
                Task { @MainActor in
                    var values: [String: String] = [:]
                    if let laneId = request.query["lane_id"], !laneId.isEmpty {
                        values["lane_id"] = laneId
                    }
                    if let commandPath = request.query["command_path"], !commandPath.isEmpty {
                        values["command_path"] = commandPath
                    }
                    self?.enqueueCommand("transcript_generate", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "transcript_generate_commanded",
                        "lane_id": values["lane_id"] ?? "",
                        "command_path": values["command_path"] ?? ""
                    ])
                }
            case "/transcript_clear":
                Task { @MainActor in
                    self?.enqueueCommand("transcript_clear")
                    self?.sendJSON(connection, object: ["status": "transcript_clear_commanded"])
                }
            case "/transcript_clear_jobs":
                Task { @MainActor in
                    self?.enqueueCommand("transcript_clear_jobs")
                    self?.sendJSON(connection, object: ["status": "transcript_clear_jobs_commanded"])
                }
            case "/transcript_select":
                let mode = request.query["mode"] ?? "at_playhead"
                let id = request.query["id"] ?? ""
                Task { @MainActor in
                    var values: [String: String] = ["mode": mode]
                    if !id.isEmpty {
                        values["id"] = id
                    }
                    self?.enqueueCommand("transcript_select", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "transcript_select_commanded",
                        "mode": mode,
                        "id": id
                    ])
                }
            case "/transcript_apply_to_short":
                let field = request.query["field"] ?? "caption"
                Task { @MainActor in
                    self?.enqueueCommand("transcript_apply_to_short", values: ["field": field])
                    self?.sendJSON(connection, object: [
                        "status": "transcript_apply_to_short_commanded",
                        "field": field
                    ])
                }
            case "/shorts_queue_add_selected":
                let title = request.query["title"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("shorts_queue_add_selected", values: ["title": title])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_queue_add_selected_commanded",
                        "title": title
                    ])
                }
            case "/shorts_queue_add_range":
                let title = request.query["title"] ?? ""
                guard let start = request.query["start"], Double(start) != nil,
                      let end = request.query["end"], Double(end) != nil else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_or_invalid_short_sequence_range"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("shorts_queue_add_range", values: [
                        "title": title,
                        "start": start,
                        "end": end
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_queue_add_range_commanded",
                        "title": title,
                        "start": start,
                        "end": end,
                        "timeBase": "sequence-seconds"
                    ])
                }
            case "/shorts_queue_remove":
                guard let id = request.query["id"], !id.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_short_clip_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("shorts_queue_remove", values: ["id": id])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_queue_remove_commanded",
                        "id": id
                    ])
                }
            case "/shorts_queue_update_selected":
                let field = request.query["field"] ?? ""
                let value = request.query["value"] ?? ""
                guard !field.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_short_field"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("shorts_queue_update_selected", values: [
                        "field": field,
                        "value": value
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_queue_update_selected_commanded",
                        "field": field
                    ])
                }
            case "/shorts_preview_selected":
                let play = request.query["play"] ?? "false"
                Task { @MainActor in
                    self?.enqueueCommand("shorts_preview_selected", values: ["play": play])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_preview_selected_commanded",
                        "play": play
                    ])
                }
            case "/shorts_range_selected":
                let boundary = request.query["boundary"] ?? "start"
                var values = ["boundary": boundary]
                if let time = request.query["time"] {
                    values["time"] = time
                }
                if let delta = request.query["delta"] {
                    values["delta"] = delta
                }
                Task { @MainActor in
                    self?.enqueueCommand("shorts_range_selected", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "shorts_range_selected_commanded",
                        "boundary": boundary,
                        "time": values["time"] ?? "",
                        "delta": values["delta"] ?? ""
                    ])
                }
            case "/shorts_export_selected":
                let directory = request.query["directory"] ?? ""
                let basename = request.query["basename"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("shorts_export_selected", values: [
                        "directory": directory,
                        "basename": basename
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_export_selected_commanded",
                        "directory": directory,
                        "basename": basename
                    ])
                }
            case "/shorts_export_all":
                let directory = request.query["directory"] ?? ""
                let basename = request.query["basename"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("shorts_export_all", values: [
                        "directory": directory,
                        "basename": basename
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_export_all_commanded",
                        "directory": directory,
                        "basename": basename
                    ])
                }
            case "/lane_role":
                guard let laneId = request.query["lane_id"],
                      let role = request.query["role"],
                      !laneId.isEmpty,
                      !role.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_lane_role_params"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("lane_role", values: [
                        "lane_id": laneId,
                        "role": role
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "lane_role_commanded",
                        "lane_id": laneId,
                        "role": role
                    ])
                }
            case "/save_session":
                let name = request.query["name"] ?? "autosave"
                Task { @MainActor in
                    self?.enqueueCommand("save_session", values: ["name": name])
                    self?.sendJSON(connection, object: [
                        "status": "save_session_commanded",
                        "name": name
                    ])
                }
            case "/load_session":
                let name = request.query["name"] ?? "autosave"
                Task { @MainActor in
                    self?.enqueueCommand("load_session", values: ["name": name])
                    self?.sendJSON(connection, object: [
                        "status": "load_session_commanded",
                        "name": name
                    ])
                }
            case "/vault_lane":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_lane_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("vault_lane", values: ["lane_id": laneId])
                    self?.sendJSON(connection, object: [
                        "status": "vault_lane_commanded",
                        "lane_id": laneId
                    ])
                }
            case "/retry_proxies":
                Task { @MainActor in
                    self?.enqueueCommand("retry_proxies")
                    self?.sendJSON(connection, object: ["status": "retry_proxies_commanded"])
                }
            case "/relink_lane":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty,
                      let filePath = request.query["path"], !filePath.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_relink_params"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("relink_lane", values: [
                        "lane_id": laneId,
                        "path": filePath,
                        "queue_proxy": request.query["queue_proxy"] ?? "0"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "relink_lane_commanded",
                        "lane_id": laneId,
                        "path": filePath
                    ])
                }
            case "/attach_proxy":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty,
                      let filePath = request.query["path"], !filePath.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_attach_proxy_params"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("attach_proxy", values: [
                        "lane_id": laneId,
                        "path": filePath
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "attach_proxy_commanded",
                        "lane_id": laneId,
                        "path": filePath
                    ])
                }
            case "/match_folder":
                Task { @MainActor in
                    self?.enqueueCommand("match_folder", values: [
                        "path": request.query["path"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "match_folder_commanded",
                        "path": request.query["path"] ?? ""
                    ])
                }
            case "/export_proxy_package":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("export_proxy_package", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-export-proof",
                        "proof_seconds": request.query["proof_seconds"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "export_proxy_package_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-export-proof",
                        "proof_seconds": request.query["proof_seconds"] ?? ""
                    ])
                }
            case "/audio_master_export":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("audio_master_export", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-audio-master",
                        "proof_seconds": request.query["proof_seconds"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "audio_master_export_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-audio-master",
                        "proof_seconds": request.query["proof_seconds"] ?? ""
                    ])
                }
            case "/delivery_packet_generate":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("delivery_packet_generate", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-delivery"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "delivery_packet_generate_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-delivery"
                    ])
                }
            case "/release_prepare":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("release_prepare", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-release",
                        "proof_seconds": request.query["proof_seconds"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "release_prepare_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-release",
                        "proof_seconds": request.query["proof_seconds"] ?? ""
                    ])
                }
            case "/full_release_prepare":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("full_release_prepare", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-full-release",
                        "proof_seconds": request.query["proof_seconds"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "full_release_prepare_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-full-release",
                        "proof_seconds": request.query["proof_seconds"] ?? ""
                    ])
                }
            case "/publish_ledger_generate":
                Task { @MainActor in
                    self?.enqueueCommand("publish_ledger_generate")
                    self?.sendJSON(connection, object: ["status": "publish_ledger_generate_commanded"])
                }
            case "/publish_packet_generate":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("publish_packet_generate", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-publish"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "publish_packet_generate_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-publish"
                    ])
                }
            case "/social_shorts_packet_generate":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("social_shorts_packet_generate", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-social-shorts"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "social_shorts_packet_generate_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-social-shorts"
                    ])
                }
            case "/social_publication_queue_generate":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("social_publication_queue_generate", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-social-publication"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "social_publication_queue_generate_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-social-publication"
                    ])
                }
            case "/social_ready_packet_generate":
                let queuePath = request.query["queue_path"] ?? request.query["path"] ?? ""
                let output = request.query["output"] ?? request.query["directory"] ?? ""
                guard !queuePath.isEmpty, !output.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_social_ready_packet_queue_or_output"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("social_ready_packet_generate", values: [
                        "queue_path": queuePath,
                        "output": output,
                        "basename": request.query["basename"] ?? "social-clips-ready",
                        "top_count": request.query["top_count"] ?? "12",
                        "zip": request.query["zip"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "social_ready_packet_generate_commanded",
                        "queue_path": queuePath,
                        "output": output,
                        "basename": request.query["basename"] ?? "social-clips-ready",
                        "top_count": request.query["top_count"] ?? "12"
                    ])
                }
            case "/social_master_queue_load":
                guard let path = request.query["path"], !path.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_social_master_queue_path"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_load", values: ["path": path])
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_load_commanded",
                        "path": path
                    ])
                }
            case "/social_master_queue_select":
                guard let rank = request.query["rank"], !rank.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_social_master_queue_rank"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_select", values: ["rank": rank])
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_select_commanded",
                        "rank": rank
                    ])
                }
            case "/social_master_queue_artifact":
                let action = request.query["action"] ?? ""
                guard !action.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_social_master_queue_artifact_action"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_artifact", values: [
                        "action": action,
                        "key": request.query["key"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_artifact_commanded",
                        "action": action,
                        "key": request.query["key"] ?? ""
                    ])
                }
            case "/social_master_queue_receipt":
                let publicURL = request.query["public_url"] ?? request.query["url"] ?? ""
                guard !publicURL.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_social_master_queue_receipt_url"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = ["public_url": publicURL]
                    for key in ["rank", "platform", "status", "provider_receipt_id", "provider_id", "notes"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("social_master_queue_receipt", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_receipt_commanded",
                        "rank": values["rank"] ?? "",
                        "platform": values["platform"] ?? "",
                        "public_url": publicURL
                    ])
                }
            case "/podcast_packet_generate":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("podcast_packet_generate", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-podcast"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "podcast_packet_generate_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-podcast"
                    ])
                }
            case "/podcast_ready_packet_generate":
                let manifestPath = request.query["manifest_path"] ?? request.query["path"] ?? ""
                let output = request.query["output"] ?? request.query["directory"] ?? ""
                guard !manifestPath.isEmpty, !output.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_podcast_ready_packet_manifest_or_output"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("podcast_ready_packet_generate", values: [
                        "manifest_path": manifestPath,
                        "output": output,
                        "basename": request.query["basename"] ?? "podcast-ready",
                        "zip": request.query["zip"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "podcast_ready_packet_generate_commanded",
                        "manifest_path": manifestPath,
                        "output": output,
                        "basename": request.query["basename"] ?? "podcast-ready"
                    ])
                }
            case "/podcast_receipt_capture":
                let platform = request.query["platform"] ?? ""
                let publicURL = request.query["public_url"] ?? request.query["url"] ?? ""
                guard !platform.isEmpty, !publicURL.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_podcast_receipt_platform_or_url"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = [
                        "platform": platform,
                        "lane_id": "podcast-audio-master",
                        "status": request.query["status"] ?? "published",
                        "public_url": publicURL
                    ]
                    for key in ["provider_receipt_id", "provider_id", "notes", "title", "description"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("publish_receipt_update_by_platform", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "podcast_receipt_capture_commanded",
                        "platform": platform,
                        "deliveryLaneId": "podcast-audio-master",
                        "public_url": publicURL
                    ])
                }
            case "/episode_receipt_capture":
                let platform = request.query["platform"] ?? ""
                let publicURL = request.query["public_url"] ?? request.query["url"] ?? ""
                guard !platform.isEmpty, !publicURL.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_episode_receipt_platform_or_url"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = [
                        "platform": platform,
                        "lane_id": "episode-16x9-master",
                        "status": request.query["status"] ?? "published",
                        "public_url": publicURL
                    ]
                    for key in ["provider_receipt_id", "provider_id", "notes", "title", "description"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("publish_receipt_update_by_platform", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "episode_receipt_capture_commanded",
                        "platform": platform,
                        "deliveryLaneId": "episode-16x9-master",
                        "public_url": publicURL
                    ])
                }
            case "/publish_receipt_update":
                guard let receiptId = request.query["id"], !receiptId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_publish_receipt_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values = ["id": receiptId]
                    for key in ["status", "title", "description", "provider_receipt_id", "public_url", "receipt_json", "metadata_json", "metadata_status", "upload_job_status", "upload_job_json", "notes"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("publish_receipt_update", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "publish_receipt_update_commanded",
                        "id": receiptId
                    ])
                }
            case "/publish_receipt_update_by_platform":
                guard let platform = request.query["platform"], !platform.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_publish_platform"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values = ["platform": platform]
                    for key in ["lane_id", "delivery_lane_id", "format", "artifact_type", "status", "title", "description", "provider_receipt_id", "public_url", "receipt_json", "metadata_json", "metadata_status", "upload_job_status", "upload_job_json", "notes"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("publish_receipt_update_by_platform", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "publish_receipt_update_by_platform_commanded",
                        "platform": platform,
                        "lane_id": values["lane_id"] ?? values["delivery_lane_id"] ?? ""
                    ])
                }
            case "/vault_state":
                Task { @MainActor in
                    do {
                        let state = try await LocalMediaVault.shared.state()
                        self?.sendJSON(connection, object: ["status": "ok", "vault": state])
                    } catch {
                        self?.sendJSON(connection, object: ["error": error.localizedDescription], statusCode: 500, reason: "Vault Error")
                    }
                }
            case "/sessions":
                Task { @MainActor in
                    do {
                        let sessions = try await LocalMediaVault.shared.listSessions()
                        self?.sendJSON(connection, object: ["status": "ok", "sessions": sessions])
                    } catch {
                        self?.sendJSON(connection, object: ["error": error.localizedDescription], statusCode: 500, reason: "Vault Error")
                    }
                }
            case "/edit":
                guard let laneId = request.query["lane_id"],
                      let action = request.query["action"],
                      !laneId.isEmpty,
                      !action.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_edit_params"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = [
                        "lane_id": laneId,
                        "action": action
                    ]
                    if let v1 = request.query["v1"] {
                        values["v1"] = v1
                    }
                    if let v2 = request.query["v2"] {
                        values["v2"] = v2
                    }
                    self?.enqueueCommand("edit", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "edit_commanded",
                        "lane_id": laneId,
                        "action": action
                    ])
                }
            case "/sync_audio":
                Task { @MainActor in
                    self?.enqueueCommand("sync_audio")
                    self?.sendJSON(connection, object: ["status": "sync_audio_commanded"])
                }
            case "/state":
                Task { @MainActor in
                    let status = self?.lastStatus ?? ["status": "no_state_yet"]
                    print("AgentServer: sending response for /state")
                    self?.sendJSON(connection, object: status)
                }
            case "/social_master_queue":
                Task { @MainActor in
                    if let queue = self?.lastStatus?["socialMasterQueue"] as? [String: Any] {
                        self?.sendJSON(connection, object: queue)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-social-master-queue-state",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session or social queue, and call /social_master_queue again."
                        ])
                    }
                }
            case "/social_master_queue_first_wave":
                Task { @MainActor in
                    if let queue = self?.lastStatus?["socialMasterQueue"] as? [String: Any],
                       let readiness = queue["postingReadiness"] as? [String: Any] {
                        self?.sendJSON(connection, object: readiness)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-social-posting-readiness",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a social queue with script/agentctl.sh episode1-socials-load, and call /social_master_queue_first_wave again."
                        ])
                    }
                }
            case "/social_master_queue_selected":
                Task { @MainActor in
                    if let queue = self?.lastStatus?["socialMasterQueue"] as? [String: Any] {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-selected-social-master-candidate",
                            "version": "2026-06-17.selected-social-master-candidate.v1",
                            "status": queue["status"] ?? "unknown",
                            "selectedCandidateRank": queue["selectedCandidateRank"] ?? "",
                            "selectedCandidate": queue["selectedCandidate"] ?? [:],
                            "selectedReceiptTarget": queue["selectedReceiptTarget"] ?? [:],
                            "selectedArtifactReadiness": queue["selectedArtifactReadiness"] ?? [:],
                            "nextAction": queue["nextAction"] ?? [:],
                            "queueCommand": "script/agentctl.sh social-master-queue-state",
                            "selectCommand": "script/agentctl.sh social-master-queue-select <rank>",
                            "artifactCommand": "script/agentctl.sh social-master-queue-artifact open clipPath",
                            "receiptCaptureCommand": "script/agentctl.sh social-master-queue-receipt <rank> \"YouTube Shorts\" published <public-url> <provider-id> \"manual receipt\"",
                            "sourcePolicy": "Read-only selected candidate view. It references derivative social artifacts and receipt targets; it does not upload, post, schedule, or mutate source media."
                        ])
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-selected-social-master-candidate",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a social queue, select a candidate, and call /social_master_queue_selected again."
                        ])
                    }
                }
            case "/social_master_queue_selected_receipts":
                Task { @MainActor in
                    if let queue = self?.lastStatus?["socialMasterQueue"] as? [String: Any],
                       let checklist = queue["selectedReceiptChecklist"] as? [String: Any] {
                        self?.sendJSON(connection, object: checklist)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-selected-social-receipt-checklist",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a social queue, select a candidate, and call /social_master_queue_selected_receipts again."
                        ])
                    }
                }
            case "/social_master_queue_selected_posting_packet":
                Task { @MainActor in
                    if let queue = self?.lastStatus?["socialMasterQueue"] as? [String: Any],
                       let packet = queue["selectedPostingPacket"] as? [String: Any] {
                        self?.sendJSON(connection, object: packet)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-selected-social-posting-packet",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a social queue, select a candidate, and call /social_master_queue_selected_posting_packet again."
                        ])
                    }
                }
            case "/social_master_queue_open_selected_clip":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_artifact", values: [
                        "action": "open",
                        "key": "clipPath"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_open_selected_clip_commanded",
                        "selectedCandidateUrl": "/social_master_queue_selected"
                    ])
                }
            case "/social_master_queue_copy_selected_platform_copy":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_artifact", values: [
                        "action": "copy_platform_copy",
                        "key": "platformCopyPath"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_copy_selected_platform_copy_commanded",
                        "selectedCandidateUrl": "/social_master_queue_selected"
                    ])
                }
            case "/publication_ready_handoff":
                Task { @MainActor in
                    if let handoff = self?.lastStatus?["publicationReadyHandoff"] as? [String: Any] {
                        self?.sendJSON(connection, object: handoff)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-publication-ready-handoff",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session, and call /publication_ready_handoff again."
                        ])
                    }
                }
            case "/missing_publication_receipts":
                Task { @MainActor in
                    if let receipts = self?.lastStatus?["missingPublicationReceipts"] as? [String: Any] {
                        self?.sendJSON(connection, object: receipts)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-missing-publication-receipts",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session, and call /missing_publication_receipts again."
                        ])
                    }
                }
            case "/publication_mission_control":
                Task { @MainActor in
                    if let missionControl = self?.lastStatus?["publicationMissionControl"] as? [String: Any] {
                        self?.sendJSON(connection, object: missionControl)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-publication-mission-control",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session, and call /publication_mission_control again."
                        ])
                    }
                }
            case "/publication_operator_brief":
                Task { @MainActor in
                    guard let status = self?.lastStatus else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-publication-operator-brief",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session or social queue, and call /publication_operator_brief again."
                        ])
                        return
                    }

                    let missionControl = status["publicationMissionControl"] as? [String: Any] ?? [:]
                    let handoff = status["publicationReadyHandoff"] as? [String: Any] ?? [:]
                    let missingReceipts = status["missingPublicationReceipts"] as? [String: Any] ?? [:]
                    let socialQueue = status["socialMasterQueue"] as? [String: Any] ?? [:]
                    let socialReadiness = socialQueue["postingReadiness"] as? [String: Any] ?? [:]
                    let selectedSocialPacket = socialQueue["selectedPostingPacket"] as? [String: Any] ?? [:]

                    self?.sendJSON(connection, object: [
                        "model": "quipsly-publication-operator-brief",
                        "version": "2026-06-17.publication-operator-brief.v1",
                        "status": missionControl["status"] ?? handoff["status"] ?? "loaded",
                        "purpose": "One read-only human/Codex publishing brief for 16:9 episode, 9:16 socials, podcast audio, and receipt proof.",
                        "episode": [
                            "handoff": handoff["episode"] ?? handoff["episodeMaster"] ?? [:],
                            "missionDeliverables": missionControl["deliverables"] ?? [],
                            "nextCommand": "script/agentctl.sh publication-mission-control"
                        ],
                        "socialShorts": [
                            "postingReadiness": socialReadiness,
                            "selectedPostingPacket": selectedSocialPacket,
                            "loadCommand": "script/agentctl.sh episode1-socials-load",
                            "firstWaveCommand": "script/agentctl.sh episode1-socials-first-wave",
                            "selectedPacketCommand": "script/agentctl.sh selected-social-posting-packet",
                            "proofPolicy": "Do not call a social post complete until its public or scheduled URL is captured with social-master-queue-receipt."
                        ],
                        "podcast": [
                            "handoff": handoff["podcast"] ?? handoff["podcastAudio"] ?? [:],
                            "nextCommand": "script/agentctl.sh podcast-ready-packet-generate /absolute/podcast-manifest.json /absolute/output/folder episode-audio --zip"
                        ],
                        "receiptProof": [
                            "missing": missingReceipts,
                            "reviewCommand": "script/agentctl.sh missing-publication-receipts",
                            "captureSocialCommandTemplate": "script/agentctl.sh social-master-queue-receipt <rank> \"YouTube Shorts\" published <public-or-scheduled-url> <provider-id-or-scheduled-id> \"manual receipt\"",
                            "captureEpisodeCommandTemplate": "script/agentctl.sh episode-receipt-capture YouTube published <public-or-scheduled-url> <provider-id-or-scheduled-id> \"manual receipt\"",
                            "capturePodcastCommandTemplate": "script/agentctl.sh podcast-receipt-capture Spotify published <public-or-scheduled-url> <provider-id-or-scheduled-id> \"manual receipt\""
                        ],
                        "safeOperatorOrder": [
                            "1. Run script/agentctl.sh publication-operator-brief.",
                            "2. For Episode 1 socials, run script/agentctl.sh episode1-socials-load then script/agentctl.sh episode1-socials-first-wave.",
                            "3. Watch a first-wave clip once before posting.",
                            "4. Copy platform text, post or schedule manually, then capture the receipt URL.",
                            "5. Re-run script/agentctl.sh missing-publication-receipts before calling the release complete."
                        ],
                        "sourcePolicy": "Read-only brief. It references derivative exports, handoff files, and receipt commands; it does not upload, schedule, mutate source media, or mark receipts complete."
                    ])
                }
            case "/publication_reveal_release_folder":
                Task { @MainActor in
                    self?.enqueueCommand("publication_reveal_release_folder")
                    self?.sendJSON(connection, object: [
                        "status": "publication_reveal_release_folder_commanded",
                        "missionControlUrl": "/publication_mission_control"
                    ])
                }
            case "/publication_copy_mission_control":
                Task { @MainActor in
                    self?.enqueueCommand("publication_copy_mission_control")
                    self?.sendJSON(connection, object: [
                        "status": "publication_copy_mission_control_commanded",
                        "missionControlUrl": "/publication_mission_control"
                    ])
                }
            case "/publication_copy_missing_receipts":
                Task { @MainActor in
                    self?.enqueueCommand("publication_copy_missing_receipts")
                    self?.sendJSON(connection, object: [
                        "status": "publication_copy_missing_receipts_commanded",
                        "missingReceiptsUrl": "/missing_publication_receipts"
                    ])
                }
            case "/editor_snapshot":
                Task { @MainActor in
                    if let snapshot = self?.lastStatus?["editorProofSnapshot"] as? [String: Any] {
                        self?.sendJSON(connection, object: snapshot)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_snapshot_yet",
                            "hint": "Open QuipslyStudio and load a native editor session, then call /editor_snapshot again."
                        ])
                    }
                }
            case "/control_plane":
                Task { @MainActor in
                    if let controlPlane = self?.lastStatus?["editorControlPlane"] as? [String: Any] {
                        self?.sendJSON(connection, object: controlPlane)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_control_plane_yet",
                            "hint": "Open QuipslyStudio and load a native editor session, then call /control_plane again."
                        ])
                    }
                }
            case "/delivery_readiness":
                Task { @MainActor in
                    if let deliveryReadiness = self?.lastStatus?["deliveryReadiness"] as? [String: Any] {
                        self?.sendJSON(connection, object: deliveryReadiness)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_delivery_readiness_yet",
                            "hint": "Open QuipslyStudio and load a native editor session, then call /delivery_readiness again."
                        ])
                    }
                }
            case "/delivery_packet":
                Task { @MainActor in
                    if let deliveryPacket = self?.lastStatus?["deliveryPacket"] as? [String: Any] {
                        self?.sendJSON(connection, object: deliveryPacket)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_delivery_packet_yet",
                            "hint": "Open QuipslyStudio and load a native editor session, then call /delivery_packet again."
                        ])
                    }
                }
            case "/publish_ledger":
                Task { @MainActor in
                    if let publishLedger = self?.lastStatus?["publishLedger"] as? [String: Any] {
                        self?.sendJSON(connection, object: publishLedger)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_publish_ledger_yet",
                            "hint": "Open QuipslyStudio and load a native editor session, then call /publish_ledger again."
                        ])
                    }
                }
            case "/publish_destinations":
                Task { @MainActor in
                    self?.sendJSON(
                        connection,
                        object: self?.staticCatalogPayload(filename: "quipslystudio-publish-destinations.json") ?? [
                            "status": "catalog_unavailable"
                        ]
                    )
                }
            case "/publish_destination_guidance":
                let platform = request.query["platform"] ?? ""
                let laneId = request.query["lane_id"] ?? request.query["delivery_lane_id"] ?? ""
                let format = request.query["format"] ?? ""
                Task { @MainActor in
                    self?.sendJSON(
                        connection,
                        object: self?.publishDestinationGuidancePayload(
                            platform: platform,
                            deliveryLaneId: laneId,
                            format: format
                        ) ?? [
                            "status": "catalog_unavailable"
                        ]
                    )
                }
            case "/publish_release_checklist":
                Task { @MainActor in
                    if let checklist = self?.lastStatus?["publishReleaseChecklist"] as? [String: Any] {
                        self?.sendJSON(connection, object: checklist)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_publish_release_checklist_yet",
                            "hint": "Open QuipslyStudio, load a session, and generate the publish ledger before calling /publish_release_checklist."
                        ])
                    }
                }
            case "/publish_packet":
                Task { @MainActor in
                    if let publishPacket = self?.lastStatus?["publishPacket"] as? [String: Any] {
                        self?.sendJSON(connection, object: publishPacket)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_publish_packet_yet",
                            "hint": "Open QuipslyStudio and generate a publish packet, then call /publish_packet again."
                        ])
                    }
                }
            case "/publish_connector_readiness":
                Task { @MainActor in
                    if let connectorReadiness = self?.lastStatus?["publishConnectorReadiness"] as? [String: Any] {
                        self?.sendJSON(connection, object: connectorReadiness)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_publish_connector_readiness_yet",
                            "hint": "Open QuipslyStudio, load a session, and generate the publish ledger before calling /publish_connector_readiness."
                        ])
                    }
                }
            case "/social_shorts_packet":
                Task { @MainActor in
                    if let packet = self?.lastStatus?["socialShortsPacket"] as? [String: Any] {
                        self?.sendJSON(connection, object: packet)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_social_shorts_packet_yet",
                            "hint": "Open QuipslyStudio, load a session, queue shorts, then call /social_shorts_packet_generate."
                        ])
                    }
                }
            case "/podcast_packet":
                Task { @MainActor in
                    if let packet = self?.lastStatus?["podcastPacket"] as? [String: Any] {
                        self?.sendJSON(connection, object: packet)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_podcast_packet_yet",
                            "hint": "Open QuipslyStudio, export podcast audio or run full release prep, then call /podcast_packet_generate."
                        ])
                    }
                }
            case "/publish_connector_preflight":
                Task { @MainActor in
                    if let connectorPreflight = self?.lastStatus?["publishConnectorPreflight"] as? [String: Any] {
                        self?.sendJSON(connection, object: connectorPreflight)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_publish_connector_preflight_yet",
                            "hint": "Open QuipslyStudio, load a session, and generate the publish ledger before calling /publish_connector_preflight."
                        ])
                    }
                }
            case "/publish_connector_worker":
                Task { @MainActor in
                    if let worker = self?.lastStatus?["publishConnectorWorker"] as? [String: Any] {
                        self?.sendJSON(connection, object: worker)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_publish_connector_worker_yet",
                            "hint": "Run /publish_connector_worker_dry_run with a platform, lane_id, and executable worker_path first."
                        ])
                    }
                }
            case "/publish_connector_worker_dry_run":
                let platform = request.query["platform"] ?? ""
                let laneId = request.query["lane_id"] ?? request.query["delivery_lane_id"] ?? ""
                let workerPath = request.query["worker_path"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("publish_connector_worker_dry_run", values: [
                        "platform": platform,
                        "lane_id": laneId,
                        "worker_path": workerPath
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "publish_connector_worker_dry_run_commanded",
                        "platform": platform,
                        "lane_id": laneId,
                        "worker_path": workerPath
                    ])
                }
            case "/publish_connector_workers_dry_run_all":
                let platform = request.query["platform"] ?? ""
                let laneId = request.query["lane_id"] ?? request.query["delivery_lane_id"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("publish_connector_workers_dry_run_all", values: [
                        "platform": platform,
                        "lane_id": laneId
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "publish_connector_workers_dry_run_all_commanded",
                        "platform": platform,
                        "lane_id": laneId,
                        "worker_path": "bundled"
                    ])
                }
            case "/full_release":
                Task { @MainActor in
                    if let fullRelease = self?.lastStatus?["fullRelease"] as? [String: Any] {
                        self?.sendJSON(connection, object: fullRelease)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_full_release_yet",
                            "hint": "Open QuipslyStudio, load a session, and run /full_release_prepare before calling /full_release."
                        ])
                    }
                }
            case "/shorts_queue":
                Task { @MainActor in
                    if let queue = self?.lastStatus?["shortClipQueue"] as? [String: Any] {
                        self?.sendJSON(connection, object: queue)
                    } else {
                        self?.sendJSON(connection, object: [
                            "status": "no_short_clip_queue_yet",
                            "hint": "Open QuipslyStudio and load a native editor session, then call /shorts_queue again."
                        ])
                    }
                }
            default:
                print("AgentServer: not found path \(request.path)")
                Task { @MainActor in
                    self?.sendJSON(connection, object: ["error": "not_found", "path": request.path], statusCode: 404, reason: "Not Found")
                }
            }
        }
    }
    
    private nonisolated func parseRequest(_ requestString: String) -> AgentHTTPRequest? {
        let lines = requestString.components(separatedBy: "\r\n")
        guard let firstLine = lines.first else { return nil }
        let parts = firstLine.components(separatedBy: " ")
        guard parts.count >= 2 else { return nil }
        
        let target = parts[1]
        let components = URLComponents(string: "http://127.0.0.1\(target)")
        var query: [String: String] = [:]
        components?.queryItems?.forEach { item in
            // curl --data-urlencode and standard form-style query strings encode spaces as "+".
            // URLComponents percent-decodes values but intentionally leaves "+" as a literal plus,
            // so normalize it here for local agent commands that pass file paths and lane names.
            query[item.name] = (item.value ?? "").replacingOccurrences(of: "+", with: " ")
        }
        
        return AgentHTTPRequest(
            method: parts[0],
            path: components?.path ?? target,
            query: query
        )
    }
    
    private func sendJSON(_ connection: NWConnection, object: Any, statusCode: Int = 200, reason: String = "OK") {
        let bodyData: Data
        if JSONSerialization.isValidJSONObject(object),
           let data = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]) {
            bodyData = data
        } else {
            bodyData = #"{"error":"serialization_failed"}"#.data(using: .utf8)!
        }
        
        let header = "HTTP/1.1 \(statusCode) \(reason)\r\n" +
            "Content-Type: application/json; charset=utf-8\r\n" +
            "Connection: close\r\n" +
            "Access-Control-Allow-Origin: http://127.0.0.1\r\n" +
            "\r\n"
        
        print("AgentServer: sending JSON response")
        var data = header.data(using: .utf8)!
        data.append(bodyData)
        connection.send(content: data, completion: .contentProcessed { _ in
            connection.cancel()
        })
    }

    private func staticCatalogPayload(filename: String) -> [String: Any] {
        let fileURL = URL(fileURLWithPath: #filePath)
        let sourceRoot = fileURL
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .deletingLastPathComponent()
        let cwdRoot = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
        let candidates = [
            sourceRoot.appendingPathComponent("docs").appendingPathComponent(filename),
            cwdRoot.appendingPathComponent("docs").appendingPathComponent(filename),
            Bundle.main.resourceURL?.appendingPathComponent(filename)
        ].compactMap { $0 }

        for url in candidates {
            guard
                let data = try? Data(contentsOf: url),
                let object = try? JSONSerialization.jsonObject(with: data),
                let payload = object as? [String: Any]
            else {
                continue
            }
            return payload
        }

        return [
            "status": "catalog_missing",
            "filename": filename,
            "checkedPaths": candidates.map(\.path)
        ]
    }

    private func publishDestinationGuidancePayload(
        platform rawPlatform: String,
        deliveryLaneId rawDeliveryLaneId: String,
        format rawFormat: String
    ) -> [String: Any] {
        let platform = rawPlatform.trimmingCharacters(in: .whitespacesAndNewlines)
        let deliveryLaneId = rawDeliveryLaneId.trimmingCharacters(in: .whitespacesAndNewlines)
        let format = rawFormat.trimmingCharacters(in: .whitespacesAndNewlines)
        let catalog = staticCatalogPayload(filename: "quipslystudio-publish-destinations.json")
        let destinationId = publishDestinationId(
            platform: platform,
            deliveryLaneId: deliveryLaneId,
            format: format
        )
        let destinations = catalog["destinations"] as? [[String: Any]] ?? []
        let destination = destinations.first { destination in
            (destination["id"] as? String) == destinationId
        } ?? destinations.first { destination in
            normalizedPublishPlatformName(destination["platform"] as? String ?? "") == normalizedPublishPlatformName(platform)
        }

        guard let destination else {
            return [
                "status": "destination-guidance-missing",
                "requested": [
                    "platform": platform,
                    "deliveryLaneId": deliveryLaneId,
                    "format": format
                ],
                "destinationId": destinationId,
                "catalogVersion": catalog["version"] ?? "",
                "nextAction": "Call /publish_destinations and choose a destination id before preparing upload metadata."
            ]
        }

        return [
            "status": "ok",
            "model": "quipsly-publish-destination-guidance",
            "version": "2026-06-16.publish-destination-guidance.v1",
            "requested": [
                "platform": platform,
                "deliveryLaneId": deliveryLaneId,
                "format": format
            ],
            "destinationId": destination["id"] ?? destinationId,
            "catalogVersion": catalog["version"] ?? "",
            "destinationGuidance": destination,
            "sourcePolicy": "Destination guidance is platform metadata knowledge. It does not depend on a loaded session and never mutates edit/source/proxy state."
        ]
    }

    private func publishDestinationId(
        platform rawPlatform: String,
        deliveryLaneId: String,
        format rawFormat: String
    ) -> String {
        let platform = normalizedPublishPlatformName(rawPlatform)
        let lane = deliveryLaneId.lowercased()
        let format = rawFormat.lowercased()

        if platform.contains("youtube shorts") || lane.contains("short") {
            return "youtube_short"
        }
        if platform.contains("youtube") {
            return "youtube_episode"
        }
        if platform.contains("patreon") {
            return "patreon_episode"
        }
        if platform.contains("instagram") {
            return "instagram_reel"
        }
        if platform.contains("facebook") {
            return "facebook_reel"
        }
        if platform.contains("linkedin") {
            return "linkedin_video"
        }
        if platform.contains("spotify") {
            return "spotify_podcast"
        }
        if platform.contains("apple") {
            return "apple_podcasts"
        }
        if format.contains("9:16") {
            return "youtube_short"
        }
        return platform.isEmpty
            ? "unknown"
            : platform.replacingOccurrences(of: " ", with: "_")
    }

    private func normalizedPublishPlatformName(_ value: String) -> String {
        value
            .lowercased()
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: "-", with: " ")
            .replacingOccurrences(of: "_", with: " ")
    }
    
    private func healthPayload() -> [String: Any] {
        [
            "status": "ok",
            "service": "quipsly-agent-server",
            "port": port,
            "commandsUrl": "http://127.0.0.1:\(port)/commands",
            "agentManualUrl": "http://127.0.0.1:\(port)/agent_manual"
        ]
    }
    
    private func commandsPayload() -> [String: Any] {
        [
            "status": "ok",
            "commands": [
                "GET /health",
                "GET /commands",
                "GET /agent_manual",
                "GET /agent_capabilities",
                "GET /demo",
                "GET /premiere_packet?path=<absolute-packet-json-path>",
                "GET /import?path=<absolute-file-path>",
                "GET /decision?action=charlie|homer|both|skip|charlieClip|homerClip&start=<seconds>&duration=<seconds>",
                "GET /playback?mode=edit|through&action=toggle|play|pause|set",
                "GET /seek?time=<seconds>",
                "GET /scrub?time=<seconds>",
                "GET /program_scroll?delta=<seconds>",
                "GET /select_tag?lane_id=<uuid-or-name>&tag_id=<uuid>",
                "GET /select_decision?mode=first|at_playhead|next|previous|first_video|next_video|previous_video&scope=all|video|support&lane_id=<optional-uuid-or-name>",
                "GET /nudge_selected?delta=<seconds>",
                "GET /trim_selected?start_delta=<seconds>&duration_delta=<seconds>",
                "GET /delete_selected_tag",
                "GET /focus_monitors",
                "GET /focus_timeline",
                "GET /left_workbench?mode=inspector|shorts|transcript|closed",
                "GET /timeline_zoom?mode=fit|cut|precision|frame|in|out|set&scale=<pixels-per-second>",
                "GET /select_lane?lane_id=<uuid-or-name>",
                "GET /format?value=16:9|9:16",
                "GET /program_crop_mode?mode=baseline|keyframe",
                "GET /program_crop?lane_id=<uuid-or-name>&format=16:9|9:16&pan_x=<minus1-to-1>&pan_y=<minus1-to-1>&zoom=<1-to-4>",
                "GET /program_crop_preset?lane_id=<uuid-or-name>&format=16:9|9:16&preset=centered|tighter|looser|headroom|left|right|solo-safe|hide-desk|weight-left|weight-right|vertical-solo|vertical-punch|stack-top|stack-bottom&mode=baseline|keyframe&time=<seconds>",
                "GET /program_crop_keyframe?lane_id=<uuid-or-name>&format=16:9|9:16&time=<sequence-seconds>&pan_x=<minus1-to-1>&pan_y=<minus1-to-1>&zoom=<1-to-4>",
                "GET /program_crop_keyframe?lane_id=<uuid-or-name>&format=16:9|9:16&time=<sequence-seconds>&pan_x_delta=<value>&pan_y_delta=<value>&zoom_delta=<value>",
                "GET /program_crop_clear_keyframes?lane_id=<uuid-or-name>&format=16:9|9:16",
                "GET /source_window?lane_id=<uuid-or-name>&action=show|cut&duration=<seconds>",
                "GET /switch_selected_decision?action=charlie|homer|both|skip|charlieClip|homerClip",
                "GET /transcript_seed_demo",
                "GET /transcript_import?path=<absolute-srt-or-vtt-path>&format=auto|srt|vtt",
                "GET /transcript_generate?lane_id=<optional-uuid-or-name>&command_path=<optional-executable-that-prints-srt-or-vtt>",
                "GET /transcript_select?mode=first|at_playhead|next|previous&id=<optional-transcript-segment-id>",
                "GET /transcript_apply_to_short?field=caption|overlay|hook",
                "GET /transcript_clear",
                "GET /transcript_clear_jobs",
                "GET /shorts_queue",
                "GET /shorts_queue_add_selected?title=<optional-title>",
                "GET /shorts_queue_add_range?start=<sequence-seconds>&end=<sequence-seconds>&title=<optional-title>",
                "GET /shorts_queue_remove?id=<short-clip-id>",
                "GET /shorts_queue_update_selected?field=title|hook|caption|overlay|notes|review_status|export_status&value=<text>",
                "GET /shorts_preview_selected?play=true|false",
                "GET /shorts_range_selected?boundary=start|end&time=<sequence-seconds>|delta=<seconds>",
                "GET /shorts_export_selected?directory=<absolute-output-folder>&basename=<name>",
                "GET /shorts_export_all?directory=<absolute-output-folder>&basename=<name>",
                "GET /lane_role?lane_id=<uuid-or-name>&role=charlie_camera|homer_camera|source_clip|reference_clip|audio",
                "GET /save_session?name=<session-name>",
                "GET /load_session?name=<session-name>",
                "GET /vault_lane?lane_id=<uuid-or-name>",
                "GET /retry_proxies",
                "GET /relink_lane?lane_id=<uuid-or-name>&path=<absolute-file-path>",
                "GET /match_folder?path=<absolute-folder-path>",
                "GET /export_proxy_package?directory=<absolute-output-folder>&basename=<name>&proof_seconds=<seconds>",
                "GET /audio_master_export?directory=<absolute-output-folder>&basename=<name>&proof_seconds=<seconds>",
                "GET /delivery_packet",
                "GET /delivery_packet_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /release_prepare?directory=<absolute-output-folder>&basename=<name>&proof_seconds=<seconds>",
                "GET /full_release",
                "GET /full_release_prepare?directory=<absolute-output-folder>&basename=<name>&proof_seconds=<seconds>",
                "GET /publish_ledger",
                "GET /publish_destinations",
                "GET /publish_destination_guidance?platform=YouTube%20Shorts&lane_id=short-9x16-01&format=9:16",
                "GET /publish_release_checklist",
                "GET /publish_connector_readiness",
                "GET /publish_connector_preflight",
                "GET /publish_connector_worker",
                "GET /publish_connector_worker_dry_run?platform=YouTube%20Shorts&lane_id=social-short-clips&worker_path=<absolute-executable-worker-path>",
                "GET /publish_connector_workers_dry_run_all?platform=<optional>&lane_id=<optional>",
                "GET /publish_ledger_generate",
                "GET /publish_packet",
                "GET /publish_packet_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /social_shorts_packet",
                "GET /social_shorts_packet_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /social_publication_queue_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /social_ready_packet_generate?queue_path=<absolute-social-queue-json>&output=<absolute-output-folder>&basename=<name>&top_count=12&zip=1",
                "GET /social_master_queue",
                "GET /social_master_queue_first_wave",
                "GET /social_master_queue_selected",
                "GET /social_master_queue_selected_receipts",
                "GET /social_master_queue_selected_posting_packet",
                "GET /social_master_queue_open_selected_clip",
                "GET /social_master_queue_copy_selected_platform_copy",
                "GET /social_master_queue_load?path=<absolute-social-master-queue-json>",
                "GET /social_master_queue_select?rank=<candidate-rank>",
                "GET /social_master_queue_artifact?action=open|reveal|copy_handoff|copy_platform_copy&key=clipPath|thumbnailPath|captionSrtPath|platformCopyPath",
                "GET /social_master_queue_receipt?rank=<candidate-rank>&platform=YouTube%20Shorts&status=published&public_url=<url>&provider_receipt_id=<id>&notes=<text>",
                "GET /publication_operator_brief",
                "GET /publication_mission_control",
                "GET /publication_reveal_release_folder",
                "GET /publication_copy_mission_control",
                "GET /publication_copy_missing_receipts",
                "GET /podcast_packet",
                "GET /podcast_packet_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /podcast_ready_packet_generate?manifest_path=<absolute-podcast-manifest-json>&output=<absolute-output-folder>&basename=<name>&zip=1",
                "GET /podcast_receipt_capture?platform=Spotify&status=published&public_url=<url>&provider_receipt_id=<id>&notes=<text>",
                "GET /episode_receipt_capture?platform=YouTube&status=published&public_url=<url>&provider_receipt_id=<id>&notes=<text>",
                "GET /publish_receipt_update?id=<receipt-id>&status=ready-to-upload|uploaded|scheduled|published|failed&public_url=<url>&provider_receipt_id=<id>&metadata_json=<json>&upload_job_status=<status>&notes=<text>",
                "GET /publish_receipt_update_by_platform?platform=YouTube&lane_id=episode-16x9-master&status=published&public_url=<url>&provider_receipt_id=<id>&title=<text>&description=<text>&notes=<text>",
                "GET /publication_ready_handoff",
                "GET /missing_publication_receipts",
                "GET /vault_state",
                "GET /sessions",
                "GET /edit?lane_id=<uuid-or-name>&action=offset&v1=<seconds>",
                "GET /edit?lane_id=<uuid-or-name>&action=active|cut&v1=<start-seconds>&v2=<duration-seconds>",
                "GET /edit?lane_id=<uuid-or-name>&action=clear_tags",
                "GET /sync_audio",
                "GET /state",
                "GET /editor_snapshot",
                "GET /control_plane",
                "GET /delivery_readiness",
                "GET /delivery_packet",
                "GET /publish_ledger"
            ]
        ]
    }

    private func agentManualPayload() -> [String: Any] {
        [
            "status": "ok",
            "title": "QuipslyStudio Agent Operator Manual",
            "purpose": "Give agents the same editorial capacity as humans without asking them to screen-scrape or infer hidden state.",
            "coreInvariant": "Whole synced source lanes stay intact. SHOW/SKIP decisions, source windows, trims, reframes, and format choices are metadata overlays.",
            "operatorLoop": [
                [
                    "step": 1,
                    "name": "Observe",
                    "endpoint": "GET /state",
                    "proof": "Read selected lane/tag, source monitor readiness, current program state, proof snapshot, and safe actions."
                ],
                [
                    "step": 2,
                    "name": "Choose semantic action",
                    "endpoint": "Read agentCapabilityParity and agentCurrentSafeActions",
                    "proof": "Prefer named actions like select-lane, select-decision with scope=video, source-window, trim-selected, format, and timeline-zoom over UI coordinates."
                ],
                [
                    "step": 3,
                    "name": "Execute",
                    "endpoint": "GET /select_lane, /select_decision, /source_window, /trim_selected, /timeline_zoom, /format",
                    "proof": "Actions return command acknowledgements. They mutate only selection, view state, or non-destructive edit metadata unless clearly labeled otherwise."
                ],
                [
                    "step": 4,
                    "name": "Re-observe",
                    "endpoint": "GET /editor_snapshot and GET /state",
                    "proof": "Confirm canScrubSyncedSources, canPlayEdit, proxyFirst, selected state, and decision counts after the action. CLI agents should prefer `script/agentctl.sh observe-after <command>` for this loop."
                ]
            ],
            "safeActionClasses": [
                [
                    "risk": "read-only",
                    "examples": ["/state", "/editor_snapshot", "/commands", "/agent_manual", "/agent_capabilities"],
                    "rule": "Can run freely for planning, diagnostics, and proof."
                ],
                [
                    "risk": "view-or-selection",
                    "examples": ["/select_lane", "/format", "/focus_timeline", "/timeline_zoom"],
                    "rule": "May change focus or preview state, but not editorial decisions or source files."
                ],
                [
                    "risk": "non-destructive-edit",
                    "examples": ["/source_window", "/select_decision?mode=at_playhead&scope=video", "/trim_selected", "/nudge_selected", "/delete_selected_tag"],
                    "rule": "May change metadata overlays only. Must re-observe state afterward."
                ],
                [
                    "risk": "media-recovery",
                    "examples": ["/relink_lane", "/match_folder", "/vault_lane", "/retry_proxies"],
                    "rule": "Requires explicit operator intent because it may touch protected folders or run proxy work."
                ]
            ],
            "trainingDataContract": [
                "capabilityParity": "Capture the agentCapabilityParity item involved so training data knows which human workflow the action belongs to.",
                "episodeState": "Capture /state snapshots before and after actions.",
                "actionLedger": "Capture endpoint, parameters, response, and resulting proof snapshot.",
                "commandAcknowledgementRule": "Do not treat *_commanded responses as final state. Re-observe /state or /editor_snapshot before claiming completion.",
                "humanParity": "If a human can do an important edit through the UI, an agent should get a semantic command and state echo for the same concept.",
                "forbiddenShortcut": "Do not train agents to click by screen coordinates when semantic editor truth exists."
            ],
            "proofEndpoints": [
                "GET /editor_snapshot",
                "GET /state",
                "GET /agent_capabilities",
                "GET /commands"
            ]
        ]
    }

    private func agentCapabilitiesPayload() -> [String: Any] {
        guard let status = lastStatus else {
            return [
                "status": "no_state_yet",
                "hint": "Open QuipslyStudio and load a native editor session, then call /agent_capabilities again.",
                "operatorLoop": "observe_state_choose_semantic_action_execute_reobserve"
            ]
        }

        return [
            "status": "ok",
            "purpose": "Expose human-editor workflow parity for agents, automation, and future model training.",
            "agentAccessibilityModel": status["agentAccessibilityModel"] ?? "semantic_commands_with_state_echo",
            "agentInterfaceModel": status["agentInterfaceModel"] ?? "observe_state_choose_semantic_action_execute_reobserve",
            "capabilities": status["agentCapabilityParity"] ?? [],
            "currentSafeActions": status["agentCurrentSafeActions"] ?? [],
            "currentContext": status["agentCurrentContext"] ?? [:],
            "proofSnapshot": status["editorProofSnapshot"] ?? [:],
            "rule": "If a human can perform a serious editor workflow, agents need matching observation fields, semantic commands, and proof fields before we train against it."
        ]
    }
    
    public var lastStatus: [String: Any]? = nil
    
    public func writeStatus(_ status: [String: Any]) {
        var enriched = status
        enriched["agentServer"] = "running"
        enriched["agentPort"] = port
        enriched["commandsUrl"] = "http://127.0.0.1:\(port)/commands"
        enriched["agentManualUrl"] = "http://127.0.0.1:\(port)/agent_manual"
        enriched["agentCapabilitiesUrl"] = "http://127.0.0.1:\(port)/agent_capabilities"
        self.lastStatus = enriched
    }

    public func enqueueCommand(_ name: String, values: [String: String] = [:]) {
        pendingCommandRequests.append(AgentCommandRequest(name: name, values: values))
        commandToExecute = name
        trigger = UUID()
        commandSerial += 1
    }

    public func drainCommandRequests() -> [AgentCommandRequest] {
        let requests = pendingCommandRequests
        pendingCommandRequests = []
        return requests
    }
}

private struct AgentHTTPRequest {
    let method: String
    let path: String
    let query: [String: String]
}
