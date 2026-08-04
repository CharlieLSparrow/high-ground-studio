import Foundation
import Network
import QuipslyVideoCore
#if os(macOS)
import AppKit
#endif
#if canImport(Combine)
import Combine
#endif

public extension Notification.Name {
    static let quipslyAgentCommandQueued = Notification.Name("quipsly.agent.commandQueued")
}

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
    private nonisolated static let localControlHeader =
        "x-quipsly-agent-control"
    private nonisolated static let localControlValue = "local-control-v1"

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
    @Published public private(set) var lastCommandReceipt: [String: Any] = [:]

    private var pendingCommandRequests: [AgentCommandRequest] = []
    private var commandDispatchHandler: (() -> Void)?
    private var commandExecutor: ((AgentCommandRequest) -> Void)?
    private var activeCommandConsumerId: UUID?
    private var projectedShortSelectionOverlay: [String: Any]?

    private var listener: NWListener?
    public let port: UInt16 = 8080
    private nonisolated static let cachedStatusLock = NSLock()
    private nonisolated(unsafe) static var cachedStatusData: Data?
    private nonisolated static let cachedCaptureStatusLock = NSLock()
    private nonisolated(unsafe) static var cachedCaptureStatusData: Data?
    private nonisolated static let projectedShortSelectionLock = NSLock()
    private nonisolated(unsafe) static var projectedShortSelectionValues: [String: String] = [:]
    private nonisolated static let httpCommandQueueLock = NSLock()
    private nonisolated(unsafe) static var httpCommandQueue: [AgentCommandRequest] = []
    private nonisolated static let directProxyExportLock = NSLock()
    private nonisolated(unsafe) static var lastDirectProxyShortExportRequestPath: String = ""
    private nonisolated static let directProxyExportRequestDefaultsKey = "quipsly.agent.lastDirectProxyShortExportRequestPath"
    private nonisolated static let proxyShortReconciliationLock =
        NSLock()
    private nonisolated(unsafe) static var proxyShortReconciliationInFlight =
        false
    private nonisolated(unsafe) static var proxyShortReconciliationNeeded =
        true
    private nonisolated(unsafe) static var lastProxyShortReconciliationAttempt =
        Date.distantPast
    private nonisolated(unsafe) static var proxyShortReconciliationGeneration:
        UInt64 = 0

    public init() {
        start()
    }

    public func start() {
        guard listener == nil else { return }

        do {
            let port = NWEndpoint.Port(integerLiteral: self.port)
            let parameters = NWParameters.tcp
            parameters.acceptLocalOnly = true
            parameters.requiredLocalEndpoint = .hostPort(
                host: "127.0.0.1",
                port: port
            )
            listener = try NWListener(using: parameters)

            listener?.newConnectionHandler = { [weak self] connection in
                self?.handleConnection(connection)
            }

            listener?.start(queue: .global(qos: .userInitiated))
            print("AgentServer listening on loopback port \(self.port)")
        } catch {
            print("Failed to start AgentServer: \(error)")
            writeStatus([
                "agentServer": "failed",
                "error": "\(error)"
            ])
        }
    }

    private nonisolated func handleConnection(_ connection: NWConnection) {
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
            let hasLocalControlHeader =
                request.headers[Self.localControlHeader]
                    == Self.localControlValue
            let fetchSite = request.headers["sec-fetch-site"]?
                .lowercased()
            let browserOrigin = request.headers["origin"]?.lowercased()
            let browserReferer = request.headers["referer"]?.lowercased()
            let hasUntrustedBrowserOrigin = [browserOrigin, browserReferer]
                .compactMap { $0 }
                .contains { value in
                    !value.hasPrefix("http://127.0.0.1")
                        && !value.hasPrefix("http://localhost")
                }
            let isCrossSiteBrowserRequest = fetchSite == "cross-site"
                || hasUntrustedBrowserOrigin
            guard request.path == "/"
                    || request.path == "/health"
                    || hasLocalControlHeader
                    || !isCrossSiteBrowserRequest else {
                Task { @MainActor in
                    self?.sendJSON(connection, object: [
                        "error": "cross_site_agent_control_rejected",
                        "truth": "Browser cross-site GETs are not an editor authority channel. Use the loopback agent CLI, which sends the Quipsly local-control header.",
                    ], statusCode: 401, reason: "Unauthorized")
                }
                return
            }

            switch request.path {
            case "/", "/health":
                self?.sendJSON(connection, object: Self.cachedHealthPayload())
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
            case "/codex_editor_handoff":
                Task { @MainActor in
                    self?.sendJSON(connection, object: self?.codexEditorHandoffPayload() ?? ["status": "unavailable"])
                }
            case "/editor_loop_proof":
                self?.sendJSON(connection, object: Self.cachedEditorLoopProofPayload())
            case "/capture_status":
                if let cachedStatus = Self.cachedCaptureStatusResponseData() {
                    self?.sendJSONData(connection, bodyData: cachedStatus)
                } else {
                    self?.sendJSON(connection, object: [
                        "status": "no_capture_state_yet",
                        "hint": "Open Episode Capture Setup, then read /capture_status again.",
                        "truth": "The editor /state and capture /capture_status projections are intentionally independent so one window cannot overwrite the other.",
                    ])
                }
            case "/capture_open_setup":
                Task { @MainActor in
                    NotificationCenter.default.post(
                        name: .quipslyOpenEpisodeCaptureSetup,
                        object: nil
                    )
                    #if os(macOS)
                    let captureWindows = NSApp.windows.filter {
                        $0.title == "Episode Capture Setup"
                    }
                    self?.sendJSON(connection, object: [
                        "status": "capture_setup_opened",
                        "windowCount": captureWindows.count,
                        "windowVisible":
                            captureWindows.contains(where: \.isVisible),
                        "truth": "Opening setup does not request permission, select a room, join a call, start recording, upload, or publish.",
                    ])
                    #else
                    self?.sendJSON(connection, object: [
                        "status": "capture_setup_unavailable",
                        "truth": "Episode Capture Setup is a macOS surface.",
                    ], statusCode: 400, reason: "Bad Request")
                    #endif
                }
            case "/capture_prepare_local":
                let values = [
                    "episode_space_id":
                        request.query["episode_space_id"] ?? "",
                    "participant_id":
                        request.query["participant_id"] ?? "",
                    "input_device_id":
                        request.query["input_device_id"] ?? "",
                    "output_device_id":
                        request.query["output_device_id"] ?? "",
                    "video_device_id":
                        request.query["video_device_id"] ?? "",
                    "include_camera":
                        request.query["include_camera"] ?? "false",
                    "camera_signal_verified":
                        request.query[
                            "camera_signal_verified"
                        ] ?? "false",
                ]
                Task { @MainActor in
                    let receipt = self?.enqueueCommand(
                        "capture_prepare_local",
                        values: values
                    ) ?? [:]
                    self?.sendJSON(connection, object: receipt)
                }
            case "/capture_refresh_hardware":
                Task { @MainActor in
                    let receipt = self?.enqueueCommand(
                        "capture_refresh_hardware"
                    ) ?? [:]
                    self?.sendJSON(connection, object: receipt)
                }
            case "/capture_start_local":
                let values = [
                    "input_device_id":
                        request.query["input_device_id"] ?? "",
                    "video_device_id":
                        request.query["video_device_id"] ?? "",
                ]
                Task { @MainActor in
                    let receipt = self?.enqueueCommand(
                        "capture_start_local",
                        values: values
                    ) ?? [:]
                    self?.sendJSON(connection, object: receipt)
                }
            case "/capture_stop_local":
                Task { @MainActor in
                    let receipt = self?.enqueueCommand(
                        "capture_stop_local"
                    ) ?? [:]
                    self?.sendJSON(connection, object: receipt)
                }
            case "/capture_audit_local":
                Task { @MainActor in
                    let receipt = self?.enqueueCommand(
                        "capture_audit_local"
                    ) ?? [:]
                    self?.sendJSON(connection, object: receipt)
                }
            case "/capture_open_editor":
                Task { @MainActor in
                    let receipt = self?.enqueueCommand(
                        "capture_open_editor"
                    ) ?? [:]
                    self?.sendJSON(connection, object: receipt)
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
            case "/capture_sync_qualify":
                guard request.query["confirm"]
                        == "activate-reversible-alignment" else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: [
                            "error": "explicit_confirmation_required",
                            "requiredConfirm":
                                "activate-reversible-alignment",
                            "truth": "Qualification changes reversible editor metadata and appends an agent-attributed receipt. It never changes source bytes or claims human approval.",
                        ], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                let requiredKeys = [
                    "baseline_lane_id",
                    "target_lane_id",
                    "expected_offset",
                    "reviewed_offset",
                    "cue_seconds",
                    "later_seconds",
                    "residual_drift_ms",
                    "evidence_summary",
                ]
                let missing = requiredKeys.filter {
                    request.query[$0]?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                        .isEmpty != false
                }
                guard missing.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: [
                            "error": "missing_agent_sync_evidence",
                            "missing": missing,
                        ], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                var values = request.query
                values["reviewer_kind"] = "software-agent"
                values["actor_id"] = request.query["actor_id"]
                    ?? "software-agent:codex"
                values["actor_label"] = request.query["actor_label"]
                    ?? "Codex"
                values["delegation_scope"] = request.query[
                    "delegation_scope"
                ] ?? "reversible-media-alignment"
                values["reviewer_tool_version"] = request.query[
                    "reviewer_tool_version"
                ] ?? "Codex"
                Task { @MainActor in
                    var receipt = self?.enqueueCommand(
                        "capture_sync_qualify",
                        values: values
                    ) ?? [:]
                    receipt["status"] = "capture_sync_qualification_commanded"
                    receipt["truth"] = "The live editor must revalidate immutable source identity, current offset, cue/drift/assembled evidence, and any superseded receipt before activation. Re-read /state for the applied receipt or exact failure."
                    self?.sendJSON(connection, object: receipt)
                }
            case "/capture_sync_undo":
                guard request.query["confirm"]
                        == "undo-exact-reversible-alignment" else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: [
                            "error": "explicit_confirmation_required",
                            "requiredConfirm":
                                "undo-exact-reversible-alignment",
                            "truth": "Undo targets one exact active review receipt, restores its recorded prior placement, appends an agent-attributed receipt, and never changes source bytes.",
                        ], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                let requiredKeys = [
                    "approved_review_id",
                    "target_lane_id",
                    "expected_offset",
                ]
                let missing = requiredKeys.filter {
                    request.query[$0]?
                        .trimmingCharacters(in: .whitespacesAndNewlines)
                        .isEmpty != false
                }
                guard missing.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: [
                            "error": "missing_agent_sync_undo_identity",
                            "missing": missing,
                        ], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                var values = request.query
                values["reviewer_kind"] = "software-agent"
                values["actor_id"] = request.query["actor_id"]
                    ?? "software-agent:codex"
                values["actor_label"] = request.query["actor_label"]
                    ?? "Codex"
                values["delegation_scope"] = request.query[
                    "delegation_scope"
                ] ?? "reversible-media-alignment"
                values["reviewer_tool_version"] = request.query[
                    "reviewer_tool_version"
                ] ?? "Codex"
                Task { @MainActor in
                    var receipt = self?.enqueueCommand(
                        "capture_sync_undo",
                        values: values
                    ) ?? [:]
                    receipt["status"] = "capture_sync_undo_commanded"
                    receipt["truth"] = "The live editor must match the exact active receipt, target lane, and current offset before restoring the prior placement. Re-read /state for the appended undo receipt or exact failure."
                    self?.sendJSON(connection, object: receipt)
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
            case "/native_account":
                let action = (request.query["action"] ?? "status")
                    .lowercased()
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let allowedActions = Set([
                    "status",
                    "google",
                    "check_saved",
                ])
                guard allowedActions.contains(action) else {
                    self?.sendJSON(connection, object: [
                        "error": "native_account_action_not_allowed",
                        "allowedActions": allowedActions.sorted(),
                        "truth": "The local control boundary never accepts passwords and does not expose destructive account actions.",
                    ], statusCode: 400, reason: "Bad Request")
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("native_account", values: ["action": action])
                    self?.sendJSON(connection, object: [
                        "status": "native_account_commanded",
                        "action": action,
                        "truth": "The command exposes no password, Firebase token, browser handoff code, or refresh token.",
                    ])
                }
            case "/quipsly_os_operator_board":
                Task { @MainActor in
                    if let board = self?.lastStatus?["quipslyOSOperatorBoard"] as? [String: Any] {
                        self?.sendJSON(connection, object: board)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-os-operator-board",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, then run GET /left_workbench?mode=os before calling this endpoint again.",
                            "truth": "No board state has been published by the running app yet. This is not a publication or readiness claim."
                        ])
                    }
                }
            case "/nest_seed_context":
                Task { @MainActor in
                    self?.enqueueCommand("nest_seed_context")
                    self?.sendJSON(connection, object: [
                        "status": "nest_seed_context_commanded",
                        "truth": "Seeded Nest context is scaffolding and remains needs-human-review."
                    ])
                }
            case "/nest_ensure_writing_document":
                Task { @MainActor in
                    self?.enqueueCommand("nest_ensure_writing_document")
                    self?.sendJSON(connection, object: [
                        "status": "nest_ensure_writing_document_commanded",
                        "truth": "The authored writing layer is separate from seeded/imported context."
                    ])
                }
            case "/nest_writing_queue":
                Task { @MainActor in
                    if let readiness = (self?.lastStatus?["nest"] as? [String: Any])?["writingReadiness"] as? [String: Any] {
                        self?.sendJSON(connection, object: readiness)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-nest-writing-readiness-v1",
                            "status": "no_state_yet",
                            "nextActionQueue": [],
                            "seriousAgentWorkAllowed": true,
                            "creativePartnerTruth": "Codex and Quipslys may create serious first-pass writing when the workflow needs real material. The app should preserve authorship, provenance, review state, and canon boundaries instead of treating agent work as fake placeholder content.",
                            "nextDraftSuggestion": [
                                "title": "Episode 1 - Next High Ground Odyssey beat",
                                "tags": ["book", "writing", "episode-1", "agent-first-pass"],
                                "authorship": "agent-authored",
                                "reviewStatus": "agent-first-pass",
                                "truth": "Use this only after a session is loaded. It is serious first-pass material until reviewed, not disposable fixture text.",
                                "cliShortcut": "script/agentctl.sh nest-serious-draft \"Episode 1 - Next High Ground Odyssey beat\" \"<draft text>\" episode-1",
                                "fileShortcut": "script/agentctl.sh nest-serious-draft-file \"Episode 1 - The Wednesday Rule\" /Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md episode-1",
                                "towerPublicationPacketPath": "/Users/wall-e/Dev/high-ground-studio/docs/quipsly/publication-packets/hgo-episode-1-the-wednesday-rule-writing-publication-packet.md"
                            ],
                            "safeCommandsAfterSessionLoad": [
                                "GET /nest_ensure_writing_document",
                                "GET /nest_seed_context",
                                "GET /nest_append_block?title=<title>&text=<text>&tags=book,writing,episode-1&role=writing&episode=episode-1&authorship=agent-authored&provenance=<why>&review_status=agent-first-pass"
                            ],
                            "hint": "Open QuipslyStudio, load a session, and call /nest_writing_queue again."
                        ])
                    }
                }
            case "/nest_writing_packet":
                Task { @MainActor in
                    if let packet = self?.lastStatus?["nestWritingPacket"] as? [String: Any] {
                        self?.sendJSON(connection, object: packet)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-nest-writing-packet-state",
                            "status": "no_state_yet",
                            "seriousAgentWorkAllowed": true,
                            "creativePartnerTruth": "A missing packet does not mean agents must wait for a human to produce content. It means the app has not yet exposed current Nest writing state. Load a session, inspect writing readiness, then create or review serious first-pass material with visible provenance.",
                            "safeCommandsAfterSessionLoad": [
                                "GET /nest_writing_queue",
                                "GET /nest_writing_packet_generate?directory=<absolute-output-folder>&basename=<name>"
                            ],
                            "hint": "Open QuipslyStudio, load a session, and call /nest_writing_packet again."
                        ])
                    }
                }
            case "/nest_writing_packet_generate":
                let directory = request.query["directory"] ?? ""
                let basename = request.query["basename"] ?? "quipsly-nest-writing"
                Task { @MainActor in
                    self?.enqueueCommand("nest_writing_packet_generate", values: [
                        "directory": directory,
                        "basename": basename
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "nest_writing_packet_generate_commanded",
                        "directory": directory,
                        "basename": basename
                    ])
                }
            case "/nest_writing_next_action":
                let index = request.query["index"] ?? "1"
                let kind = request.query["kind"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("nest_writing_next_action", values: [
                        "index": index,
                        "kind": kind
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "nest_writing_next_action_commanded",
                        "index": index,
                        "kind": kind,
                        "observeNext": "GET /nest_writing_queue"
                    ])
                }
            case "/nest_append_block":
                let title = request.query["title"] ?? ""
                let text = request.query["text"] ?? ""
                let tags = request.query["tags"] ?? ""
                let role = request.query["role"] ?? "writing"
                let episode = request.query["episode"] ?? ""
                let authorship = request.query["authorship"] ?? "agent-authored"
                let provenance = request.query["provenance"] ?? "Added through QuipslyStudio agent/write capture. Review before canon promotion."
                let reviewStatus = request.query["review_status"] ?? "agent-first-pass"
                Task { @MainActor in
                    self?.enqueueCommand("nest_append_block", values: [
                        "title": title,
                        "text": text,
                        "tags": tags,
                        "role": role,
                        "episode": episode,
                        "authorship": authorship,
                        "provenance": provenance,
                        "review_status": reviewStatus
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "nest_append_block_commanded",
                        "title": title,
                        "role": role,
                        "episode": episode,
                        "authorship": authorship,
                        "reviewStatus": reviewStatus,
                        "truth": "Appends an authored Nest block with explicit authorship/provenance/review state. Agent-authored work may be serious first-pass material; this command does not canonize or publish it."
                    ])
                }
            case "/nest_mark_block":
                let status = request.query["status"] ?? "needs-human-review"
                let note = request.query["note"] ?? "Marked by agent through Nest review-state route."
                let blockId = request.query["block_id"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("nest_mark_block", values: [
                        "status": status,
                        "note": note,
                        "block_id": blockId
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "nest_mark_block_commanded",
                        "reviewStatus": status,
                        "note": note,
                        "blockId": blockId
                    ])
                }
            case "/nest_select_block":
                let blockId = request.query["block_id"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("nest_select_block", values: [
                        "block_id": blockId
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "nest_select_block_commanded",
                        "blockId": blockId
                    ])
                }
            case "/nest_update_block":
                let blockId = request.query["block_id"] ?? ""
                let role = request.query["role"] ?? ""
                let tags = request.query["tags"] ?? ""
                let episode = request.query["episode"] ?? ""
                let chapter = request.query["chapter"] ?? ""
                let note = request.query["note"] ?? "Structured by agent through Nest structure route."
                Task { @MainActor in
                    self?.enqueueCommand("nest_update_block", values: [
                        "block_id": blockId,
                        "role": role,
                        "tags": tags,
                        "episode": episode,
                        "chapter": chapter,
                        "note": note
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "nest_update_block_commanded",
                        "blockId": blockId,
                        "role": role,
                        "tags": tags,
                        "episode": episode,
                        "chapter": chapter,
                        "note": note
                    ])
                }
            case "/nest_replace_block_text":
                let blockId = request.query["block_id"] ?? ""
                let text = request.query["text"] ?? ""
                let note = request.query["note"] ?? "Revised by agent through Nest text route."
                let reviewStatus = request.query["review_status"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("nest_replace_block_text", values: [
                        "block_id": blockId,
                        "text": text,
                        "note": note,
                        "review_status": reviewStatus
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "nest_replace_block_text_commanded",
                        "blockId": blockId,
                        "reviewStatus": reviewStatus,
                        "note": note
                    ])
                }
            case "/production_command_center":
                let mode = request.query["mode"] ?? "fast"
                let shouldOpen = request.query["open"] ?? "false"
                Task { @MainActor in
                    self?.enqueueCommand("production_command_center", values: [
                        "mode": mode,
                        "open": shouldOpen
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "production_command_center_commanded",
                        "mode": mode,
                        "open": shouldOpen
                    ])
                }
            case "/production_command_center_open":
                Task { @MainActor in
                    self?.enqueueCommand("production_command_center_open")
                    self?.sendJSON(connection, object: [
                        "status": "production_command_center_open_commanded"
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
            case "/edit_pass":
                Task { @MainActor in
                    var values: [String: String] = [
                        "label": request.query["label"] ?? request.query["name"] ?? "Codex editing pass",
                        "actor": request.query["actor"] ?? "Codex",
                        "actor_type": request.query["actor_type"] ?? request.query["actorType"] ?? "agent",
                        "pass_number": request.query["pass_number"] ?? request.query["pass"] ?? "1",
                        "goal": request.query["goal"] ?? "Create a useful edit while improving the editor.",
                        "status": request.query["status"] ?? "active"
                    ]
                    for key in ["note"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("edit_pass", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "edit_pass_commanded",
                        "truth": "Marks the current sequence editing-pass context. It does not mutate media, decisions, or exports.",
                        "label": values["label"] ?? "",
                        "actor": values["actor"] ?? "",
                        "pass_number": values["pass_number"] ?? ""
                    ])
                }
            case "/program_ambiguity_report":
                Task { @MainActor in
                    var values: [String: String] = [:]
                    if let sampleLimit = request.query["sample_limit"] ?? request.query["limit"], !sampleLimit.isEmpty {
                        values["sample_limit"] = sampleLimit
                    }
                    self?.enqueueCommand("program_ambiguity_report", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "program_ambiguity_report_commanded",
                        "truth": "Builds an on-demand review map of overlapping SHOW decisions. It does not mutate media, decisions, exports, or publication state.",
                        "sample_limit": values["sample_limit"] ?? ""
                    ])
                }
            case "/program_ambiguity_review":
                Task { @MainActor in
                    var values: [String: String] = [
                        "mode": request.query["mode"] ?? "next"
                    ]
                    if let sampleLimit = request.query["sample_limit"] ?? request.query["limit"], !sampleLimit.isEmpty {
                        values["sample_limit"] = sampleLimit
                    }
                    self?.enqueueCommand("program_ambiguity_review", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "program_ambiguity_review_commanded",
                        "mode": values["mode"] ?? "next",
                        "truth": "Navigates to a sampled overlapping SHOW review point. It does not mutate media, decisions, exports, or publication state.",
                        "sample_limit": values["sample_limit"] ?? ""
                    ])
                }
            case "/program_ambiguity_resolve":
                Task { @MainActor in
                    let choice = request.query["choice"] ?? request.query["source"] ?? "first"
                    var values = ["choice": choice]
                    if let advance = request.query["advance"], !advance.isEmpty {
                        values["advance"] = advance
                    }
                    self?.enqueueCommand("program_ambiguity_resolve", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "program_ambiguity_resolve_commanded",
                        "choice": choice,
                        "advance": values["advance"] ?? "",
                        "truth": "Resolves the selected sampled overlap interval with explicit SHOW/SKIP metadata. Whole source media and proxies stay untouched."
                    ])
                }
            case "/program_ambiguity_batch":
                Task { @MainActor in
                    var values: [String: String] = [
                        "mode": request.query["mode"] ?? "preview"
                    ]
                    if let maxCount = request.query["max_count"] ?? request.query["count"], !maxCount.isEmpty {
                        values["max_count"] = maxCount
                    }
                    if let minConfidence = request.query["min_confidence"] ?? request.query["confidence"], !minConfidence.isEmpty {
                        values["min_confidence"] = minConfidence
                    }
                    self?.enqueueCommand("program_ambiguity_batch", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "program_ambiguity_batch_commanded",
                        "mode": values["mode"] ?? "preview",
                        "max_count": values["max_count"] ?? "",
                        "min_confidence": values["min_confidence"] ?? "",
                        "truth": "Preview mode does not mutate edit metadata. Apply mode only runs bounded recommendations above threshold, using SHOW/SKIP metadata over whole source lanes."
                    ])
                }
            case "/program_ambiguity_manual_review":
                let note = request.query["note"] ?? request.query["reason"] ?? request.query["text"] ?? ""
                guard !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_manual_review_note"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = [
                        "choice": request.query["choice"] ?? request.query["source"] ?? "manual_review",
                        "note": note,
                        "actor": request.query["actor"] ?? "Codex",
                        "actor_type": request.query["actor_type"] ?? request.query["actorType"] ?? "agent",
                        "apply": request.query["apply"] ?? "0",
                        "category": request.query["category"] ?? "program-ambiguity-manual-review"
                    ]
                    if let status = request.query["status"], !status.isEmpty {
                        values["status"] = status
                    }
                    self?.enqueueCommand("program_ambiguity_manual_review", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "program_ambiguity_manual_review_commanded",
                        "choice": values["choice"] ?? "",
                        "apply": values["apply"] ?? "0",
                        "truth": "Records an inspectable low-confidence review receipt. It only changes SHOW/SKIP metadata when apply=1 and an explicit choice is supplied."
                    ])
                }
            case "/correction_note":
                let note = request.query["note"] ?? request.query["text"] ?? ""
                guard !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_correction_note"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = [
                        "note": note,
                        "actor": request.query["actor"] ?? "Codex",
                        "actor_type": request.query["actor_type"] ?? request.query["actorType"] ?? "agent",
                        "category": request.query["category"] ?? "edit-correction",
                        "status": request.query["status"] ?? "open"
                    ]
                    for key in ["lane_id", "tag_id", "time", "before_json", "after_json"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("correction_note", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "correction_note_commanded",
                        "truth": "Records an inspectable edit/correction note on the loaded sequence. It does not mutate media, decisions, or exports.",
                        "category": values["category"] ?? "",
                        "actor": values["actor"] ?? ""
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
            case "/transcript_word":
                let mode = request.query["mode"] ?? "current"
                let segmentId = request.query["segment_id"] ?? request.query["id"] ?? ""
                let index = request.query["index"] ?? ""
                Task { @MainActor in
                    var values: [String: String] = ["mode": mode]
                    if !segmentId.isEmpty {
                        values["segment_id"] = segmentId
                    }
                    if !index.isEmpty {
                        values["index"] = index
                    }
                    self?.enqueueCommand("transcript_word", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "transcript_word_commanded",
                        "mode": mode,
                        "segment_id": segmentId,
                        "index": index
                    ])
                }
            case "/transcript_set_speaker":
                let segmentId = request.query["segment_id"] ?? request.query["id"] ?? ""
                let speaker = request.query["speaker"] ?? ""
                let actor = request.query["actor"] ?? ""
                guard !speaker.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_transcript_speaker"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = ["speaker": speaker]
                    if !segmentId.isEmpty {
                        values["segment_id"] = segmentId
                    }
                    if !actor.isEmpty {
                        values["actor"] = actor
                    }
                    self?.enqueueCommand("transcript_set_speaker", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "transcript_set_speaker_commanded",
                        "segment_id": segmentId,
                        "speaker": speaker,
                        "actor": actor,
                        "truth": "Changes only transcript speaker metadata for the selected/current segment. It does not alter source media, edit decisions, or exports."
                    ])
                }
            case "/transcript_search":
                let query = request.query["query"] ?? request.query["q"] ?? ""
                let mode = request.query["mode"] ?? "next"
                Task { @MainActor in
                    self?.enqueueCommand("transcript_search", values: [
                        "query": query,
                        "mode": mode
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "transcript_search_commanded",
                        "query": query,
                        "mode": mode,
                        "truth": "Searches the timed transcript spine and moves selection/playhead. It does not mutate media, edit decisions, exports, or publication state."
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
            case "/transcript_create_short":
                let mode = request.query["mode"] ?? "current"
                let title = request.query["title"] ?? ""
                let paddingBefore = request.query["padding_before"] ?? request.query["before"] ?? "1"
                let paddingAfter = request.query["padding_after"] ?? request.query["after"] ?? "2"
                let actor = request.query["actor"] ?? ""
                let actorType = request.query["actor_type"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("transcript_create_short", values: [
                        "mode": mode,
                        "title": title,
                        "padding_before": paddingBefore,
                        "padding_after": paddingAfter,
                        "actor": actor,
                        "actor_type": actorType
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "transcript_create_short_commanded",
                        "mode": mode,
                        "title": title,
                        "padding_before": paddingBefore,
                        "padding_after": paddingAfter
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
            case "/shorts_queue_select":
                let id = request.query["id"] ?? ""
                let title = request.query["title"] ?? ""
                let index = request.query["index"] ?? request.query["rank"] ?? ""
                guard !id.isEmpty || !title.isEmpty || !index.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_short_selector"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                let commandValues = [
                    "id": id,
                    "title": title,
                    "index": index
                ]
                let projection = Self.projectShortSelectionInCachedState(id: id, title: title, index: index)
                let receipt = self?.scheduleHTTPCommand(AgentCommandRequest(name: "shorts_queue_select", values: commandValues)) ?? [:]
                self?.sendJSON(connection, object: [
                    "status": "shorts_queue_select_commanded",
                    "id": id,
                    "title": title,
                    "index": index,
                    "commandReceipt": receipt,
                    "selectionProjection": projection,
                    "truth": "Selection is projected immediately from cached short-queue truth and scheduled on the editor MainActor. Re-read /state before claiming visible UI mutation."
                ])
            case "/shorts_review_next":
                let status = request.query["status"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("shorts_review_next", values: [
                        "status": status
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_review_next_commanded",
                        "preferredStatus": status,
                        "truth": "Selects the next reviewable short, switches to the shorts workbench, and scrubs the shared playhead. It does not approve or publish anything."
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
                var values = [
                    "field": field,
                    "value": value
                ]
                for (key, value) in Self.projectedShortSelectionCommandValues()
                    where values[key] == nil && !value.isEmpty {
                    values[key] = value
                }
                let receipt = self?.scheduleHTTPCommand(AgentCommandRequest(name: "shorts_queue_update_selected", values: values)) ?? [:]
                self?.sendJSON(connection, object: [
                    "status": "shorts_queue_update_selected_commanded",
                    "field": field,
                    "selectedShortId": values["selectedShortId"] ?? "",
                    "selectedShortTitle": values["selectedShortTitle"] ?? "",
                    "commandReceipt": receipt,
                    "truth": "Selected-short metadata update is delivered asynchronously with explicit target hints. Re-read /shorts_queue before claiming the title, hook, caption, or notes changed."
                ])
            case "/shorts_quality_action":
                let action = request.query["action"] ?? ""
                guard !action.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_short_quality_action"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("shorts_quality_action", values: [
                        "action": action
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_quality_action_commanded",
                        "action": action,
                        "truth": "Runs a selected-short quality helper against metadata only. It does not publish, move timeline decisions, or mutate source media."
                    ])
                }
            case "/shorts_platform_pack_index":
                let action = request.query["action"] ?? "save"
                Task { @MainActor in
                    self?.enqueueCommand("shorts_platform_pack_index_action", values: [
                        "action": action
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_platform_pack_index_commanded",
                        "action": action,
                        "truth": "Creates or copies a metadata-only index for every short in the active sequence. It does not publish, approve, move timeline decisions, or mutate source media."
                    ])
                }
            case "/shorts_overlay_burn_in":
                let decision = request.query["decision"] ?? "hold"
                let note = request.query["note"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("shorts_overlay_burn_in", values: [
                        "decision": decision,
                        "note": note
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_overlay_burn_in_commanded",
                        "decision": decision,
                        "truth": "Appends a selected-short text burn-in audit note. Approval affects future export pixels only; hold keeps overlay/caption text as metadata or platform copy."
                    ])
                }
            case "/shorts_listen_through":
                let note = request.query["note"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("shorts_listen_through", values: [
                        "note": note
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_listen_through_commanded",
                        "truth": "Appends selected-short listen-through proof for audio, pacing, and awkward-cut sanity. It does not change media, edits, exports, or publication receipts."
                    ])
                }
            case "/shorts_visual_review":
                let sheet = request.query["sheet"] ?? ""
                let source = request.query["source"] ?? ""
                let note = request.query["note"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("shorts_visual_review", values: [
                        "sheet": sheet,
                        "source": source,
                        "note": note
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_visual_review_commanded",
                        "sheet": sheet,
                        "source": source,
                        "truth": "Appends selected-short visual evidence for crop/framing/sync sanity. It does not mark the short keep/refine/reject or approve publication."
                    ])
                }
            case "/shorts_text_review":
                let decision = request.query["decision"] ?? "approve"
                let note = request.query["note"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("shorts_text_review", values: [
                        "decision": decision,
                        "note": note
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_text_review_commanded",
                        "decision": decision,
                        "truth": "Appends selected-short caption/on-video/platform copy review proof. It does not burn text into pixels unless the separate burn-in policy is approved."
                    ])
                }
            case "/shorts_review_selected":
                let status = request.query["status"] ?? ""
                let notes = request.query["notes"] ?? ""
                guard !status.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_short_review_status"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("shorts_review_selected", values: [
                        "status": status,
                        "notes": notes
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_review_selected_commanded",
                        "reviewStatus": status,
                        "truth": "Review status changes short recipe metadata only; source media and episode decisions remain untouched."
                    ])
                }
            case "/shorts_review":
                let id = request.query["id"] ?? ""
                let status = request.query["status"] ?? ""
                let notes = request.query["notes"] ?? ""
                guard !id.isEmpty, !status.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_short_id_or_review_status"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("shorts_review", values: [
                        "id": id,
                        "status": status,
                        "notes": notes
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_review_commanded",
                        "id": id,
                        "reviewStatus": status,
                        "truth": "Review status changes short recipe metadata in the currently loaded session only; source media and episode decisions remain untouched."
                    ])
                }
            case "/shorts_queue_append_selected_segment":
                Task { @MainActor in
                    self?.enqueueCommand("shorts_queue_append_selected_segment", values: [:])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_queue_append_selected_segment_commanded",
                        "truth": "Adds the selected SHOW decision as another recipe segment; source media remains untouched."
                    ])
                }
            case "/shorts_preview_selected":
                let play = request.query["play"] ?? "false"
                var values = ["play": play]
                for (key, value) in Self.projectedShortSelectionCommandValues()
                    where values[key] == nil && !value.isEmpty {
                    values[key] = value
                }
                let receipt = self?.scheduleHTTPCommand(AgentCommandRequest(name: "shorts_preview_selected", values: values)) ?? [:]
                self?.sendJSON(connection, object: [
                    "status": "shorts_preview_selected_commanded",
                    "play": play,
                    "selectedShortId": values["selectedShortId"] ?? "",
                    "selectedShortTitle": values["selectedShortTitle"] ?? "",
                    "commandReceipt": receipt,
                    "truth": "Preview/cue is delivered asynchronously with explicit selected-short hints. Re-read /state for playhead and preview status proof."
                ])
            case "/shorts_range_selected":
                let boundary = request.query["boundary"] ?? "start"
                var values = ["boundary": boundary]
                if let time = request.query["time"] {
                    values["time"] = time
                }
                if let delta = request.query["delta"] {
                    values["delta"] = delta
                }
                for (key, value) in Self.projectedShortSelectionCommandValues()
                    where values[key] == nil && !value.isEmpty {
                    values[key] = value
                }
                let receipt = self?.scheduleHTTPCommand(AgentCommandRequest(name: "shorts_range_selected", values: values)) ?? [:]
                self?.sendJSON(connection, object: [
                    "status": "shorts_range_selected_commanded",
                    "boundary": boundary,
                    "time": values["time"] ?? "",
                    "delta": values["delta"] ?? "",
                    "selectedShortId": values["selectedShortId"] ?? "",
                    "selectedShortTitle": values["selectedShortTitle"] ?? "",
                    "commandReceipt": receipt,
                    "truth": "Range refinement is acknowledged from the HTTP thread and delivered to the editor bridge asynchronously. Re-read /shorts_queue for updated recipe metadata."
                ])
            case "/shorts_export_selected":
                let directory = request.query["directory"] ?? ""
                let basename = request.query["basename"] ?? ""
                let sessionName = request.query["sessionName"] ?? ""
                let requestedShortId = request.query["id"] ?? request.query["selectedShortId"] ?? ""
                let requestedShortTitle = request.query["title"] ?? request.query["selectedShortTitle"] ?? ""
                let cachedStatus = Self.cachedStatusDictionary() ?? [:]
                let selectedShortProof = cachedStatus["selectedShortProof"] as? [String: Any] ?? [:]
                let selectedShortClip = cachedStatus["selectedShortClip"] as? [String: Any] ?? [:]
                let selectedShortId = requestedShortId.isEmpty
                    ? ((selectedShortProof["id"] as? String)
                    ?? (selectedShortClip["id"] as? String)
                    ?? "")
                    : requestedShortId
                let selectedShortTitle = requestedShortTitle.isEmpty
                    ? ((selectedShortProof["title"] as? String)
                    ?? (selectedShortClip["title"] as? String)
                    ?? "")
                    : requestedShortTitle
                let receipt = self?.scheduleHTTPCommand(AgentCommandRequest(name: "shorts_export_selected", values: [
                    "directory": directory,
                    "basename": basename,
                    "sessionName": sessionName,
                    "selectedShortId": selectedShortId,
                    "selectedShortTitle": selectedShortTitle
                ])) ?? [:]
                self?.sendJSON(connection, object: [
                    "status": "shorts_export_selected_commanded",
                    "directory": directory,
                    "basename": basename,
                    "sessionName": sessionName,
                    "selectedShortId": selectedShortId,
                    "selectedShortTitle": selectedShortTitle,
                    "commandReceipt": receipt,
                    "truth": "The HTTP control plane handed selected-short export to the live editor state so humans and agents use the same selected recipe. Re-read /state for progress, manifest, output path, or failure."
                ])
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
            case "/lane_production_ignore":
                guard let laneId = request.query["lane_id"], !laneId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_lane_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                let ignoreValue = request.query["ignore"] ?? "1"
                Task { @MainActor in
                    self?.enqueueCommand("lane_production_ignore", values: [
                        "lane_id": laneId,
                        "ignore": ignoreValue
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "lane_production_ignore_commanded",
                        "lane_id": laneId,
                        "ignore": ignoreValue
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
                    let receipt = self?.enqueueCommand("load_session", values: ["name": name]) ?? [:]
                    self?.sendJSON(connection, object: [
                        "status": "load_session_commanded",
                        "name": name,
                        "commandReceipt": receipt,
                        "truth": "This confirms command delivery only. Re-read /state and require nonzero laneCount plus shortClipQueueCount before treating the session as usable."
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
            case "/restore_media_access":
                Task { @MainActor in
                    self?.enqueueCommand("restore_media_access")
                    self?.sendJSON(connection, object: [
                        "status": "restore_media_access_commanded",
                        "truth": "This asks the editor to restore only its previously user-granted folder bookmark. Re-read /state for active access and validation results."
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
            case "/vertical_slice_packet_generate":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("vertical_slice_packet_generate", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-vertical-slice"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "vertical_slice_packet_generate_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-vertical-slice"
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
            case "/reviewed_social_queue_generate":
                let directory = request.query["directory"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("reviewed_social_queue_generate", values: [
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-reviewed-social"
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "reviewed_social_queue_generate_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-reviewed-social"
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
            case "/social_master_queue_load_latest":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_load_latest")
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_load_latest_commanded"
                    ])
                }
            case "/social_master_queue_promote_receipts":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_promote_receipts")
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_promote_receipts_commanded"
                    ])
                }
            case "/social_master_queue_copy_receipt_commands":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_copy_receipt_commands")
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_copy_receipt_commands_commanded"
                    ])
                }
            case "/social_master_queue_copy_receipt_command":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_copy_receipt_command")
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_copy_receipt_command_commanded"
                    ])
                }
            case "/social_master_queue_copy_posting_session":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_copy_posting_session")
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_copy_posting_session_commanded"
                    ])
                }
            case "/social_master_queue_posting_run_packet":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_posting_run_packet")
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_posting_run_packet_commanded"
                    ])
                }
            case "/social_master_queue_open_posting_run_packet":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_open_posting_run_packet")
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_open_posting_run_packet_commanded"
                    ])
                }
            case "/social_master_queue_reveal_posting_run_packet":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_reveal_posting_run_packet")
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_reveal_posting_run_packet_commanded"
                    ])
                }
            case "/social_master_queue_select_receipt_platform":
                let platform = request.query["platform"] ?? ""
                guard !platform.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_social_master_queue_receipt_platform"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_select_receipt_platform", values: [
                        "platform": platform,
                        "status": request.query["status"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_select_receipt_platform_commanded",
                        "platform": platform
                    ])
                }
            case "/social_master_queue_select_next_posting_platform":
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_select_next_posting_platform")
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_select_next_posting_platform_commanded"
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
            case "/social_master_queue_receipt_batch":
                let rows = request.query["rows"] ?? request.query["text"] ?? ""
                guard !rows.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_social_master_queue_receipt_batch_rows"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    self?.enqueueCommand("social_master_queue_receipt_batch", values: ["rows": rows])
                    self?.sendJSON(connection, object: [
                        "status": "social_master_queue_receipt_batch_commanded",
                        "rowLength": "\(rows.count)"
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
            case "/apply_edit_plan":
                guard let path = request.query["path"],
                      !path.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_edit_plan_path"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                Task { @MainActor in
                    var values: [String: String] = [
                        "path": path
                    ]
                    if let saveName = request.query["save_name"], !saveName.isEmpty {
                        values["save_name"] = saveName
                    }
                    if let backupName = request.query["backup_name"], !backupName.isEmpty {
                        values["backup_name"] = backupName
                    }
                    self?.enqueueCommand("apply_edit_plan", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "edit_plan_commanded",
                        "path": path,
                        "save_name": values["save_name"] ?? ""
                    ])
                }
            case "/sync_audio":
                Task { @MainActor in
                    self?.enqueueCommand("sync_audio")
                    self?.sendJSON(connection, object: ["status": "sync_audio_commanded"])
                }
            case "/state":
                if let cachedStatus = Self.cachedStatusResponseData() {
                    print("AgentServer: sending cached response for /state")
                    self?.sendJSONData(connection, bodyData: cachedStatus)
                    Self.scheduleProxyShortExportReconciliation()
                } else {
                    self?.sendJSON(connection, object: ["status": "no_state_yet"])
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
            case "/publication_receipt_cockpit":
                Task { @MainActor in
                    if let cockpit = self?.lastStatus?["publicationReceiptCockpit"] as? [String: Any] {
                        self?.sendJSON(connection, object: cockpit)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-publication-receipt-cockpit",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session, and call /publication_receipt_cockpit again."
                        ])
                    }
                }
            case "/publication_next_receipt":
                Task { @MainActor in
                    if let cockpit = self?.lastStatus?["publicationReceiptCockpit"] as? [String: Any],
                       let actionCard = cockpit["nextReceiptActionCard"] as? [String: Any],
                       !actionCard.isEmpty {
                        self?.sendJSON(connection, object: actionCard)
                    } else if let cockpit = self?.lastStatus?["publicationReceiptCockpit"] as? [String: Any] {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-tower-next-receipt-action-card",
                            "status": cockpit["status"] ?? "no_next_receipt",
                            "publicationComplete": cockpit["publicationComplete"] ?? false,
                            "nextAction": cockpit["nextAction"] ?? "No next receipt action card is currently available.",
                            "truth": "No live next receipt action card is available from the current publication receipt cockpit state."
                        ])
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-tower-next-receipt-action-card",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session, and call /publication_next_receipt again."
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
            case "/episode_spine", "/vertical_slice", "/nest_studio_tower":
                Task { @MainActor in
                    if let spine = (self?.lastStatus?["verticalSlice"] as? [String: Any])
                        ?? (self?.lastStatus?["episodeSpine"] as? [String: Any]) {
                        self?.sendJSON(connection, object: spine)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-episode-spine-loop",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session, and call /vertical_slice again."
                        ])
                    }
                }
            case "/vertical_slice_packet":
                Task { @MainActor in
                    if let packet = self?.lastStatus?["verticalSlicePacket"] as? [String: Any] {
                        self?.sendJSON(connection, object: packet)
                    } else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-vertical-slice-packet-state",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session, and call /vertical_slice_packet again."
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
                    let episodeHandoff = handoff["episode16x9"] ?? handoff["episode"] ?? handoff["episodeMaster"] ?? [:]
                    let socialHandoff = handoff["social9x16"] ?? [:]
                    let podcastHandoff = handoff["podcastAudio"] ?? handoff["podcast"] ?? [:]

                    self?.sendJSON(connection, object: [
                        "model": "quipsly-publication-operator-brief",
                        "version": "2026-06-18.publication-operator-brief.v2",
                        "status": missionControl["status"] ?? handoff["status"] ?? "loaded",
                        "purpose": "One read-only human/Codex publishing brief for 16:9 episode, 9:16 socials, podcast audio, and receipt proof.",
                        "episode": [
                            "handoff": episodeHandoff,
                            "missionDeliverables": missionControl["deliverables"] ?? [],
                            "copyReceiptCommands": "script/agentctl.sh episode-copy-receipt-commands",
                            "nextCommand": "script/agentctl.sh publication-mission-control"
                        ],
                        "socialShorts": [
                            "handoff": socialHandoff,
                            "postingReadiness": socialReadiness,
                            "selectedPostingPacket": selectedSocialPacket,
                            "loadLatestReviewedQueue": "script/agentctl.sh social-master-queue-load-latest",
                            "generateSelectedPostingRunPacket": "script/agentctl.sh social-master-posting-run-packet",
                            "selectedPacketCommand": "script/agentctl.sh selected-social-posting-packet",
                            "proofPolicy": "Do not call a social post complete until its public or scheduled URL is captured with social-master-queue-receipt."
                        ],
                        "podcast": [
                            "handoff": podcastHandoff,
                            "copyReceiptCommands": "script/agentctl.sh podcast-copy-receipt-commands",
                            "nextCommand": "script/agentctl.sh podcast-ready-packet-generate /absolute/podcast-manifest.json /absolute/output/folder episode-audio --zip"
                        ],
                        "receiptProof": [
                            "missing": missingReceipts,
                            "reviewCommand": "script/agentctl.sh missing-publication-receipts",
                            "captureSocialCommandTemplate": "script/agentctl.sh social-master-queue-receipt <rank> \"YouTube Shorts\" published <public-or-scheduled-url> <provider-id-or-scheduled-id> \"manual receipt\"",
                            "captureEpisodeCommandTemplate": "script/agentctl.sh episode-receipt-capture YouTube published <public-or-scheduled-url> <provider-id-or-scheduled-id> \"manual receipt\"",
                            "capturePodcastCommandTemplate": "script/agentctl.sh podcast-receipt-capture Spotify published <public-or-scheduled-url> <provider-id-or-scheduled-id> \"manual receipt\""
                        ],
                        "releaseChecklist": [
                            [
                                "step": 1,
                                "label": "Inspect Mission Control",
                                "command": "script/agentctl.sh publication-mission-control",
                                "doneWhen": "status is ready-for-platform-posting and readyLaneCount equals laneCount.",
                                "risk": "read-only"
                            ],
                            [
                                "step": 2,
                                "label": "Open the release folder",
                                "command": "script/agentctl.sh publication-reveal-release",
                                "doneWhen": "The operator can access the 16:9 master, publish packet, upload bundle, cockpit markdown, and receipt log.",
                                "risk": "read-only"
                            ],
                            [
                                "step": 3,
                                "label": "Upload or schedule YouTube and Patreon",
                                "command": "script/agentctl.sh episode-copy-receipt-commands",
                                "doneWhen": "The 16:9 episode master has a real public or scheduled URL/provider id for YouTube and Patreon.",
                                "risk": "manual-platform-work"
                            ],
                            [
                                "step": 4,
                                "label": "Work selected social posting packet",
                                "command": "script/agentctl.sh selected-social-posting-packet",
                                "doneWhen": "Each chosen short has been watched, posted or scheduled, and has a receipt URL/provider id captured.",
                                "risk": "manual-platform-work"
                            ],
                            [
                                "step": 5,
                                "label": "Upload podcast audio through host/RSS",
                                "command": "script/agentctl.sh podcast-copy-receipt-commands",
                                "doneWhen": "Spotify and Apple Podcasts have real public or scheduled URLs/provider ids captured.",
                                "risk": "manual-platform-work"
                            ],
                            [
                                "step": 6,
                                "label": "Recheck missing receipts",
                                "command": "script/agentctl.sh missing-publication-receipts",
                                "doneWhen": "missingCount is 0.",
                                "risk": "read-only"
                            ],
                            [
                                "step": 7,
                                "label": "Confirm release complete",
                                "command": "script/agentctl.sh publication-mission-control",
                                "doneWhen": "status is publication-proof-complete and publicationComplete is true.",
                                "risk": "read-only"
                            ]
                        ],
                        "safeOperatorOrder": [
                            "1. Run script/agentctl.sh publication-operator-brief.",
                            "2. Verify Mission Control says ready-for-platform-posting.",
                            "3. Work 16:9 episode, social shorts, and podcast audio from their explicit packet paths.",
                            "4. Upload or schedule manually/API-assisted only when the packet and artifact are ready.",
                            "5. Capture every real public/scheduled URL or provider id back into Quipsly.",
                            "6. Re-run script/agentctl.sh missing-publication-receipts before calling the release complete."
                        ],
                        "sourcePolicy": "Read-only brief. It references derivative exports, handoff files, and receipt commands; it does not upload, schedule, mutate source media, or mark receipts complete."
                    ])
                }
            case "/publication_operator_runbook":
                Task { @MainActor in
                    guard let status = self?.lastStatus else {
                        self?.sendJSON(connection, object: [
                            "model": "quipsly-publication-operator-runbook",
                            "status": "no_state_yet",
                            "hint": "Open QuipslyStudio, load a session or social queue, and call /publication_operator_runbook again."
                        ])
                        return
                    }

                    let missionControl = status["publicationMissionControl"] as? [String: Any] ?? [:]
                    let handoff = status["publicationReadyHandoff"] as? [String: Any] ?? [:]
                    let missingReceipts = status["missingPublicationReceipts"] as? [String: Any] ?? [:]
                    self?.sendJSON(connection, object: [
                        "model": "quipsly-publication-operator-runbook",
                        "version": "2026-06-18.publication-operator-runbook.v1",
                        "status": missionControl["status"] ?? "loaded",
                        "summary": missionControl["summary"] ?? [:],
                        "episode16x9": handoff["episode16x9"] ?? [:],
                        "social9x16": handoff["social9x16"] ?? [:],
                        "podcastAudio": handoff["podcastAudio"] ?? [:],
                        "receiptProof": [
                            "missing": missingReceipts,
                            "reviewCommand": "script/agentctl.sh missing-publication-receipts"
                        ],
                        "orderedCommands": [
                            "script/agentctl.sh publication-mission-control",
                            "script/agentctl.sh publication-reveal-release",
                            "script/agentctl.sh episode-copy-receipt-commands",
                            "script/agentctl.sh selected-social-posting-packet",
                            "script/agentctl.sh podcast-copy-receipt-commands",
                            "script/agentctl.sh missing-publication-receipts"
                        ],
                        "completionRule": "The release is not complete until Mission Control reports publication-proof-complete and missing publication receipts is 0.",
                        "sourcePolicy": "Read-only runbook. It does not upload, schedule, mutate source media, or mark receipts complete."
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
            case "/episode_copy_receipt_commands":
                Task { @MainActor in
                    self?.enqueueCommand("episode_copy_receipt_commands")
                    self?.sendJSON(connection, object: [
                        "status": "episode_copy_receipt_commands_commanded",
                        "sourcePolicy": "Clipboard-only helper. It copies YouTube/Patreon receipt command templates and does not upload, publish, or mark receipts complete."
                    ])
                }
            case "/podcast_copy_receipt_commands":
                Task { @MainActor in
                    self?.enqueueCommand("podcast_copy_receipt_commands")
                    self?.sendJSON(connection, object: [
                        "status": "podcast_copy_receipt_commands_commanded",
                        "sourcePolicy": "Clipboard-only helper. It copies Spotify/Apple receipt command templates and does not upload, publish, or mark receipts complete."
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
                self?.sendJSON(connection, object: Self.cachedShortClipQueuePayload())
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
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            guard let separator = line.firstIndex(of: ":") else { continue }
            let name = line[..<separator]
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased()
            let value = line[line.index(after: separator)...]
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !name.isEmpty {
                headers[name] = value
            }
        }

        return AgentHTTPRequest(
            method: parts[0],
            path: components?.path ?? target,
            query: query,
            headers: headers
        )
    }

    private nonisolated func sendJSON(_ connection: NWConnection, object: Any, statusCode: Int = 200, reason: String = "OK") {
        let bodyData: Data
        if JSONSerialization.isValidJSONObject(object),
           let data = try? JSONSerialization.data(withJSONObject: object, options: [.prettyPrinted, .sortedKeys]) {
            bodyData = data
        } else {
            bodyData = #"{"error":"serialization_failed"}"#.data(using: .utf8)!
        }

        sendJSONData(connection, bodyData: bodyData, statusCode: statusCode, reason: reason)
    }

    private nonisolated func sendJSONData(_ connection: NWConnection, bodyData: Data, statusCode: Int = 200, reason: String = "OK") {
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

    private nonisolated static func cachedHealthPayload() -> [String: Any] {
        [
            "status": "ok",
            "service": "quipsly-agent-server",
            "port": 8080,
            "commandsUrl": "http://127.0.0.1:8080/commands",
            "agentManualUrl": "http://127.0.0.1:8080/agent_manual",
            "stateMode": "cached-off-main-actor"
        ]
    }

    private nonisolated static func cachedStatusResponseData() -> Data? {
        cachedStatusLock.lock()
        defer { cachedStatusLock.unlock() }
        return cachedStatusData
    }

    private nonisolated static func cachedCaptureStatusResponseData() -> Data? {
        cachedCaptureStatusLock.lock()
        defer { cachedCaptureStatusLock.unlock() }
        return cachedCaptureStatusData
    }

    private nonisolated static func enqueueHTTPCommand(_ request: AgentCommandRequest) -> Int {
        httpCommandQueueLock.lock()
        httpCommandQueue.append(request)
        let count = httpCommandQueue.count
        httpCommandQueueLock.unlock()
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .quipslyAgentCommandQueued, object: nil)
        }
        return count
    }

    private nonisolated static func drainHTTPCommands() -> [AgentCommandRequest] {
        httpCommandQueueLock.lock()
        let requests = httpCommandQueue
        httpCommandQueue.removeAll()
        httpCommandQueueLock.unlock()
        return requests
    }

    private nonisolated static func httpCommandCount() -> Int {
        httpCommandQueueLock.lock()
        let count = httpCommandQueue.count
        httpCommandQueueLock.unlock()
        return count
    }

    private nonisolated static func setLastDirectProxyShortExportRequestPath(_ path: String) {
        let normalizedPath = path.trimmingCharacters(in: .whitespacesAndNewlines)
        directProxyExportLock.lock()
        lastDirectProxyShortExportRequestPath = normalizedPath
        directProxyExportLock.unlock()
        proxyShortReconciliationLock.lock()
        proxyShortReconciliationNeeded = true
        lastProxyShortReconciliationAttempt = .distantPast
        proxyShortReconciliationGeneration &+= 1
        proxyShortReconciliationLock.unlock()

        guard !normalizedPath.isEmpty else {
            UserDefaults.standard.removeObject(forKey: directProxyExportRequestDefaultsKey)
            try? FileManager.default.removeItem(at: directProxyExportRequestPointerURL())
            return
        }

        UserDefaults.standard.set(normalizedPath, forKey: directProxyExportRequestDefaultsKey)
        let pointerURL = directProxyExportRequestPointerURL()
        try? FileManager.default.createDirectory(
            at: pointerURL.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try? normalizedPath.write(to: pointerURL, atomically: true, encoding: .utf8)
    }

    private nonisolated static func getLastDirectProxyShortExportRequestPath() -> String {
        directProxyExportLock.lock()
        let path = lastDirectProxyShortExportRequestPath
        directProxyExportLock.unlock()
        if !path.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return path
        }

        if let defaultsPath = UserDefaults.standard.string(forKey: directProxyExportRequestDefaultsKey),
           !defaultsPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            return defaultsPath
        }

        let pointerURL = directProxyExportRequestPointerURL()
        if let pointerPath = try? String(contentsOf: pointerURL, encoding: .utf8)
            .trimmingCharacters(in: .whitespacesAndNewlines),
           !pointerPath.isEmpty {
            return pointerPath
        }

        return ""
    }

    private nonisolated static func directProxyExportRequestPointerURL() -> URL {
        localMediaVaultRootURL()
            .appendingPathComponent("exports", isDirectory: true)
            .appendingPathComponent("export-requests", isDirectory: true)
            .appendingPathComponent("last-selected-short-export-request-path.txt")
    }

    private nonisolated func scheduleHTTPCommand(_ request: AgentCommandRequest) -> [String: Any] {
        let receipt: [String: Any] = [
            "id": request.id.uuidString,
            "name": request.name,
            "values": request.values,
            "status": "scheduled_for_editor_main_actor",
            "mode": "http_ack_then_main_actor_delivery",
            "truth": "HTTP receipt means the command was scheduled for editor delivery. Re-read /state for execution, progress, and final artifact proof."
        ]
        Task { @MainActor in
            self.deliverScheduledHTTPCommand(request, scheduledReceipt: receipt)
        }
        return receipt
    }

    private func deliverScheduledHTTPCommand(
        _ request: AgentCommandRequest,
        scheduledReceipt: [String: Any]
    ) {
        commandSerial += 1
        let executorRegistered = commandExecutor != nil
        var receipt = scheduledReceipt
        receipt["serial"] = commandSerial
        receipt["executorRegistered"] = executorRegistered
        receipt["pendingCommandCount"] = pendingCommandRequests.count + Self.httpCommandCount()

        if let commandExecutor {
            receipt["status"] = "delivered_to_registered_view_bridge"
            receipt["mode"] = "http_ack_then_registered_view_bridge"
            lastCommandReceipt = receipt
            refreshCachedStatusCommandMetadata()
            commandExecutor(request)
            return
        }

        pendingCommandRequests.append(request)
        receipt["status"] = "queued_for_view_drain"
        receipt["mode"] = "http_ack_then_view_drain"
        receipt["pendingCommandCount"] = pendingCommandRequests.count + Self.httpCommandCount()
        lastCommandReceipt = receipt
        refreshCachedStatusCommandMetadata()
        NotificationCenter.default.post(name: .quipslyAgentCommandQueued, object: nil)
    }

    private nonisolated static func cachedStatusDictionary() -> [String: Any]? {
        guard let data = cachedStatusResponseData(),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return object
    }

    private nonisolated static func scheduleProxyShortExportReconciliation() {
        let now = Date()
        proxyShortReconciliationLock.lock()
        guard proxyShortReconciliationNeeded,
              !proxyShortReconciliationInFlight,
              now.timeIntervalSince(
                lastProxyShortReconciliationAttempt
              ) >= 5 else {
            proxyShortReconciliationLock.unlock()
            return
        }
        proxyShortReconciliationInFlight = true
        lastProxyShortReconciliationAttempt = now
        let generation = proxyShortReconciliationGeneration
        proxyShortReconciliationLock.unlock()

        DispatchQueue.global(qos: .utility).async {
            let reconciled =
                reconcileProxyShortExportIntoCachedStatus()
            proxyShortReconciliationLock.lock()
            proxyShortReconciliationInFlight = false
            if reconciled,
               generation == proxyShortReconciliationGeneration {
                proxyShortReconciliationNeeded = false
            }
            proxyShortReconciliationLock.unlock()
        }
    }

    @discardableResult
    private nonisolated static func reconcileProxyShortExportIntoCachedStatus()
        -> Bool
    {
        guard let seedStatus = cachedStatusDictionary(),
              let summary = proxyShortExportManifestSummary(
                  forCachedStatus: seedStatus
              ),
              var status = cachedStatusDictionary() else {
            return false
        }
        var lastExportProof: [String: Any] = [
            "id": summary.clipId,
            "title": summary.clipTitle,
            "sessionName": summary.sessionName
        ]
        applyProxyShortExportSummary(summary, to: &lastExportProof)
        status["lastShortExportProof"] = lastExportProof

        let activeSessionName = normalizedSessionNameForAgent(
            staticStringValue(status["activeSessionName"]).isEmpty
                ? staticStringValue(status["sessionName"])
                : staticStringValue(status["activeSessionName"])
        )
        let exportMatchesActiveSession = summary.sessionName.isEmpty || summary.sessionName == activeSessionName

        if exportMatchesActiveSession {
            status["exportStatus"] = summary.status
            status["exportOutputPaths"] = summary.outputPaths
            status["lastMediaAction"] = summary.lastMediaAction
            status["lastShortExportSessionName"] = summary.sessionName

            var exportState = status["exportState"] as? [String: Any] ?? [:]
            exportState["status"] = summary.status
            exportState["healthStatus"] = summary.status
            exportState["outputPaths"] = summary.outputPaths
            exportState["manifestPath"] = summary.manifestPath
            exportState["progressPath"] = summary.progressPath
            exportState["currentOutputPath"] = summary.outputPaths.first ?? ""
            exportState["currentItem"] = summary.clipTitle
            exportState["error"] = summary.error
            exportState["completedAt"] = summary.completedAt
            exportState["isExporting"] = false
            status["exportState"] = exportState

            status["selectedShortClipId"] = summary.clipId

            var selectedShort = status["selectedShortClip"] as? [String: Any] ?? [:]
            if staticStringValue(selectedShort["id"]) != summary.clipId {
                selectedShort = [
                    "id": summary.clipId,
                    "title": summary.clipTitle
                ]
            }
            applyProxyShortExportSummary(summary, to: &selectedShort)
            status["selectedShortClip"] = selectedShort

            var selectedProof = status["selectedShortProof"] as? [String: Any] ?? [:]
            if staticStringValue(selectedProof["id"]) != summary.clipId {
                selectedProof = [
                    "id": summary.clipId,
                    "title": summary.clipTitle
                ]
            }
            applyProxyShortExportSummary(summary, to: &selectedProof)
            status["selectedShortProof"] = selectedProof
        }

        let safeStatus = jsonSafeDictionary(status)
        updateCachedStatusResponse(safeStatus)
        return true
    }

    private struct ProxyShortExportManifestSummary {
        let clipId: String
        let clipTitle: String
        let status: String
        let outputPaths: [String]
        let manifestPath: String
        let progressPath: String
        let sessionName: String
        let completedAt: String
        let error: String

        var lastMediaAction: String {
            if status == "completed", !outputPaths.isEmpty {
                return "Short proxy export completed: \(outputPaths.joined(separator: ", "))"
            }
            if status == "failed" {
                return "Short proxy export failed: \(error.isEmpty ? manifestPath : error)"
            }
            return "Short proxy export \(status): \(manifestPath)"
        }
    }

    private nonisolated static func proxyShortExportManifestSummary(
        forCachedStatus status: [String: Any]
    ) -> ProxyShortExportManifestSummary? {
        guard let requestPath = proxyShortExportRequestPath(forCachedStatus: status),
              let requestData = try? Data(contentsOf: URL(fileURLWithPath: requestPath)),
              let request = try? JSONSerialization.jsonObject(with: requestData) as? [String: Any],
              let manifestPath = request["manifestPath"] as? String,
              !manifestPath.isEmpty,
              let manifestData = try? Data(contentsOf: URL(fileURLWithPath: manifestPath)),
              let manifest = try? JSONSerialization.jsonObject(with: manifestData) as? [String: Any],
              let manifestStatus = manifest["status"] as? String,
              manifestStatus == "completed" || manifestStatus == "failed" else {
            return nil
        }

        let clips = manifest["clips"] as? [[String: Any]] ?? []
        let exportedClips = clips.filter { staticStringValue($0["status"]) == "exported" }
        let outputPaths = exportedClips
            .compactMap { $0["outputPath"] as? String }
            .filter { FileManager.default.fileExists(atPath: $0) }

        guard manifestStatus == "failed" || !outputPaths.isEmpty else {
            return nil
        }

        let selectedId = staticStringValue(status["selectedShortClipId"])
        let matchingClip = exportedClips.first { staticStringValue($0["id"]) == selectedId }
            ?? exportedClips.first
            ?? clips.first
            ?? [:]
        let errors = (manifest["errors"] as? [[String: Any]])?
            .compactMap { $0["error"] as? String }
            .joined(separator: "\n")
            ?? ""

        return ProxyShortExportManifestSummary(
            clipId: staticStringValue(matchingClip["id"]),
            clipTitle: staticStringValue(matchingClip["title"]),
            status: manifestStatus == "completed" ? "completed" : "failed",
            outputPaths: outputPaths,
            manifestPath: manifestPath,
            progressPath: staticStringValue(manifest["progressPath"]),
            sessionName: normalizedSessionNameForAgent(staticStringValue(request["sessionName"])),
            completedAt: staticStringValue(manifest["completedAt"]),
            error: errors
        )
    }

    private nonisolated static func proxyShortExportRequestPath(forCachedStatus status: [String: Any]) -> String? {
        let exportState = status["exportState"] as? [String: Any] ?? [:]
        let candidates = [
            getLastDirectProxyShortExportRequestPath(),
            staticStringValue(exportState["requestPath"]),
            staticStringValue(status["lastProxyShortExportRequestPath"]),
            staticStringValue(status["lastMediaAction"])
        ]

        for candidate in candidates where !candidate.isEmpty {
            if candidate.hasSuffix("selected-short-export-request.json"),
               FileManager.default.fileExists(atPath: candidate) {
                return candidate
            }
            if let start = candidate.range(of: "/Users/"),
               let end = candidate.range(of: "selected-short-export-request.json", range: start.lowerBound..<candidate.endIndex) {
                let path = String(candidate[start.lowerBound..<end.upperBound])
                if FileManager.default.fileExists(atPath: path) {
                    return path
                }
            }
        }
        return nil
    }

    private nonisolated static func applyProxyShortExportSummary(
        _ summary: ProxyShortExportManifestSummary,
        to shortPayload: inout [String: Any]
    ) {
        let payloadId = staticStringValue(shortPayload["id"])
        guard payloadId.isEmpty || summary.clipId.isEmpty || payloadId == summary.clipId else {
            return
        }
        shortPayload["exportStatus"] = summary.status == "completed" ? "exported" : "export-failed"
        if let firstOutput = summary.outputPaths.first {
            shortPayload["lastExportedPath"] = firstOutput
            shortPayload["lastExportExists"] = FileManager.default.fileExists(atPath: firstOutput)
            shortPayload["postExportContactSheetCommand"] = "script/agentctl.sh shorts-contact-sheet '\(firstOutput)'"
            shortPayload["contactSheetCommand"] = "script/agentctl.sh shorts-contact-sheet '\(firstOutput)'"
        }
        shortPayload["lastExportManifestPath"] = summary.manifestPath
        shortPayload["lastExportCompletedAt"] = summary.completedAt
    }

    private nonisolated static func startDirectProxyShortExportFromCachedState(
        directory: String,
        basename: String,
        sessionName requestedSessionName: String = "",
        selectedShortId: String,
        selectedShortTitle: String
    ) -> [String: Any] {
        do {
            guard var status = cachedStatusDictionary() else {
                throw NSError(
                    domain: "QuipslyDirectShortExport",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "No cached editor state is available. Launch QuipslyStudio and load an episode first."]
                )
            }

            let sessionName = normalizedSessionNameForAgent(
                requestedSessionName.isEmpty
                    ? (
                        staticStringValue(status["activeSessionName"]).isEmpty
                            ? staticStringValue(status["sessionName"])
                            : staticStringValue(status["activeSessionName"])
                    )
                    : requestedSessionName
            )
            let sessionURL = localMediaVaultRootURL()
                .appendingPathComponent("sessions", isDirectory: true)
                .appendingPathComponent("\(safeAgentFilename(sessionName)).quipsly-session.json")
            guard FileManager.default.fileExists(atPath: sessionURL.path) else {
                throw NSError(
                    domain: "QuipslyDirectShortExport",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "Native session file not found: \(sessionURL.path)"]
                )
            }

            let sessionData = try Data(contentsOf: sessionURL)
            guard let session = try JSONSerialization.jsonObject(with: sessionData) as? [String: Any],
                  let project = session["project"] as? [String: Any],
                  let sequences = project["sequences"] as? [[String: Any]],
                  !sequences.isEmpty else {
                throw NSError(
                    domain: "QuipslyDirectShortExport",
                    code: 422,
                    userInfo: [NSLocalizedDescriptionKey: "Native session does not contain an exportable sequence."]
                )
            }

            let activeSequenceId = staticStringValue(session["activeSequenceId"])
            guard var sequence = sequences.first(where: { staticStringValue($0["id"]) == activeSequenceId }) ?? sequences.first else {
                throw NSError(
                    domain: "QuipslyDirectShortExport",
                    code: 422,
                    userInfo: [NSLocalizedDescriptionKey: "Could not resolve the active sequence in \(sessionURL.path)."]
                )
            }

            let shortQueue = sequence["shortClipQueue"] as? [[String: Any]] ?? []
            let selectedId = selectedShortId.isEmpty ? staticStringValue(status["selectedShortClipId"]) : selectedShortId
            let selectedTitle = selectedShortTitle.isEmpty
                ? staticStringValue((status["selectedShortProof"] as? [String: Any])?["title"])
                : selectedShortTitle
            guard let clip = findShortClip(
                in: shortQueue,
                selectedShortId: selectedId,
                selectedShortTitle: selectedTitle
            ) else {
                throw NSError(
                    domain: "QuipslyDirectShortExport",
                    code: 404,
                    userInfo: [NSLocalizedDescriptionKey: "Could not find selected short in session \(sessionName): \(selectedId.isEmpty ? selectedTitle : selectedId)"]
                )
            }

            let clipId = staticStringValue(clip["id"])
            let clipTitle = staticStringValue(clip["title"]).isEmpty ? "Selected short" : staticStringValue(clip["title"])
            let clipIndex = shortQueue.firstIndex { candidate in
                staticStringValue(candidate["id"]) == clipId
            }
            let requestedCleanBasename = safeSelectedShortExportBasename(
                requestedBasename: basename,
                clipTitle: clipTitle,
                clipId: clipId,
                queueIndex: clipIndex
            )
            let outputDirectory = URL(fileURLWithPath: directory.isEmpty ? NSTemporaryDirectory() : directory, isDirectory: true)
            let cleanBasename = uniqueSelectedShortExportBasename(requestedCleanBasename, in: outputDirectory)
            let outputURL = outputDirectory.appendingPathComponent("\(cleanBasename)-9x16-short.mp4")
            let batchId = UUID().uuidString
            let requestDirectory = localMediaVaultRootURL()
                .appendingPathComponent("exports", isDirectory: true)
                .appendingPathComponent("export-requests", isDirectory: true)
                .appendingPathComponent(batchId, isDirectory: true)
            let requestURL = requestDirectory.appendingPathComponent("selected-short-export-request.json")
            let progressURL = requestDirectory.appendingPathComponent("selected-short-export-progress.json")
            let manifestURL = outputDirectory.appendingPathComponent("\(cleanBasename)-short-export-manifest.json")
            let logURL = requestDirectory.appendingPathComponent("selected-short-export-bridge.log")
            let exportRanges = exportRangesForShortClip(clip)

            sequence["shortClipQueue"] = [clip]
            sequence["transcriptSegments"] = []
            sequence["transcriptJobs"] = []
            sequence["editCorrectionNotes"] = []
            sequence["editActionLedger"] = []
            sequence["publishReceipts"] = []

            let request: [String: Any] = [
                "schemaVersion": 1,
                "model": "quipsly-proxy-short-export-request",
                "batchId": batchId,
                "sessionName": sessionName,
                "outputDirectory": outputDirectory.path,
                "basename": cleanBasename,
                "manifestPath": manifestURL.path,
                "progressPath": progressURL.path,
                "sourcePolicy": "proxy-only; original media untouched",
                "sequence": sequence,
                "clips": [
                    [
                        "id": clipId,
                        "title": clipTitle,
                        "outputPath": outputURL.path,
                        "ranges": exportRanges
                    ] as [String: Any]
                ]
            ]

            try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
            try FileManager.default.createDirectory(at: requestDirectory, withIntermediateDirectories: true)
            let requestData = try JSONSerialization.data(withJSONObject: jsonSafeDictionary(request), options: [.prettyPrinted, .sortedKeys])
            try requestData.write(to: requestURL, options: .atomic)
            try launchDirectProxyShortExport(requestURL: requestURL, logURL: logURL)
            setLastDirectProxyShortExportRequestPath(requestURL.path)

            status["exportStatus"] = "running"
            status["exportOutputPaths"] = [outputURL.path]
            status["lastMediaAction"] = "Short proxy export direct worker started: \(clipTitle)"
            status["lastProxyShortExportRequestPath"] = requestURL.path
            var exportState = status["exportState"] as? [String: Any] ?? [:]
            exportState["status"] = "running"
            exportState["healthStatus"] = "running"
            exportState["requestPath"] = requestURL.path
            exportState["manifestPath"] = manifestURL.path
            exportState["progressPath"] = progressURL.path
            exportState["currentOutputPath"] = outputURL.path
            exportState["currentItem"] = clipTitle
            exportState["outputPaths"] = [outputURL.path]
            exportState["isExporting"] = true
            exportState["error"] = ""
            status["exportState"] = exportState
            var selectedProjection = clip
            selectedProjection["sessionName"] = sessionName
            selectedProjection["exportStatus"] = "exporting"
            selectedProjection["lastExportedPath"] = outputURL.path
            selectedProjection["lastExportExists"] = FileManager.default.fileExists(atPath: outputURL.path)
            selectedProjection["lastExportManifestPath"] = manifestURL.path
            status["lastShortExportProof"] = selectedProjection
            status["lastShortExportSessionName"] = sessionName

            let activeSessionName = normalizedSessionNameForAgent(
                staticStringValue(status["activeSessionName"]).isEmpty
                    ? staticStringValue(status["sessionName"])
                    : staticStringValue(status["activeSessionName"])
            )
            if sessionName == activeSessionName {
                status["selectedShortClipId"] = clipId
                status["selectedShortClip"] = selectedProjection
                status["selectedShortProof"] = selectedProjection
                updateSelectedShortExportProjection(
                    in: &status,
                    clipId: clipId,
                    status: "exporting",
                    outputPath: outputURL.path,
                    manifestPath: manifestURL.path
                )
            }
            updateCachedStatusResponse(jsonSafeDictionary(status))

            return [
                "id": UUID().uuidString,
                "name": "shorts_export_selected",
                "mode": "http_direct_proxy_worker",
                "status": "direct_proxy_worker_started",
                "sessionName": sessionName,
                "sessionPath": sessionURL.path,
                "selectedShortId": clipId,
                "selectedShortTitle": clipTitle,
                "requestPath": requestURL.path,
                "manifestPath": manifestURL.path,
                "progressPath": progressURL.path,
                "outputPath": outputURL.path,
                "logPath": logURL.path,
                "sourcePolicy": "proxy-only; original media untouched",
                "truth": "The direct agent export path reads the canonical native session and launches the app-owned proxy worker without mutating source media."
            ]
        } catch {
            var status = cachedStatusDictionary() ?? [:]
            status["exportStatus"] = "failed"
            status["lastMediaAction"] = "Short proxy export direct worker blocked: \(error.localizedDescription)"
            var exportState = status["exportState"] as? [String: Any] ?? [:]
            exportState["status"] = "failed"
            exportState["healthStatus"] = "failed"
            exportState["error"] = error.localizedDescription
            exportState["isExporting"] = false
            status["exportState"] = exportState
            updateCachedStatusResponse(jsonSafeDictionary(status))

            return [
                "id": UUID().uuidString,
                "name": "shorts_export_selected",
                "mode": "http_direct_proxy_worker",
                "status": "blocked",
                "error": error.localizedDescription,
                "truth": "The export did not start. Re-read /state for the same failure in the agent-visible read model."
            ]
        }
    }

    private nonisolated static func findShortClip(
        in clips: [[String: Any]],
        selectedShortId: String,
        selectedShortTitle: String
    ) -> [String: Any]? {
        let trimmedId = selectedShortId.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTitle = selectedShortTitle.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if !trimmedId.isEmpty {
            return clips.first { staticStringValue($0["id"]) == trimmedId }
        }
        if !trimmedTitle.isEmpty {
            return clips.first { staticStringValue($0["title"]).lowercased() == trimmedTitle }
                ?? clips.first { staticStringValue($0["title"]).lowercased().contains(trimmedTitle) }
        }
        return nil
    }

    private nonisolated static func exportRangesForShortClip(_ clip: [String: Any]) -> [[String: Any]] {
        let segments = clip["segments"] as? [[String: Any]] ?? []
        var cursor = 0.0
        let segmentRanges = segments.compactMap { segment -> [String: Any]? in
            let duration = staticDoubleValue(segment["duration"])
            guard duration > 0 else { return nil }
            defer { cursor += duration }
            return [
                "start": cursor,
                "duration": duration
            ]
        }
        if !segmentRanges.isEmpty {
            return segmentRanges
        }
        return [
            [
                "start": 0.0,
                "duration": max(0.1, staticDoubleValue(clip["duration"]))
            ]
        ]
    }

    private nonisolated static func updateSelectedShortExportProjection(
        in status: inout [String: Any],
        clipId: String,
        status exportStatus: String,
        outputPath: String,
        manifestPath: String
    ) {
        if var selected = status["selectedShortClip"] as? [String: Any] {
            let selectedId = staticStringValue(selected["id"])
            if selectedId.isEmpty || selectedId == clipId {
                selected["exportStatus"] = exportStatus
                selected["lastExportedPath"] = outputPath
                selected["lastExportExists"] = FileManager.default.fileExists(atPath: outputPath)
                selected["lastExportManifestPath"] = manifestPath
                status["selectedShortClip"] = selected
            }
        }
        if var proof = status["selectedShortProof"] as? [String: Any] {
            let proofId = staticStringValue(proof["id"])
            if proofId.isEmpty || proofId == clipId {
                proof["exportStatus"] = exportStatus
                proof["lastExportedPath"] = outputPath
                proof["lastExportExists"] = FileManager.default.fileExists(atPath: outputPath)
                proof["lastExportManifestPath"] = manifestPath
                status["selectedShortProof"] = proof
            }
        }
    }

    private nonisolated static func launchDirectProxyShortExport(requestURL: URL, logURL: URL) throws {
        #if os(macOS)
        let scriptURL = try proxyShortExportScriptURLForAgent()
        try FileManager.default.createDirectory(at: logURL.deletingLastPathComponent(), withIntermediateDirectories: true)
        if !FileManager.default.fileExists(atPath: logURL.path) {
            FileManager.default.createFile(atPath: logURL.path, contents: nil)
        }
        let logHandle = try FileHandle(forWritingTo: logURL)
        try logHandle.seekToEnd()

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/python3")
        process.arguments = [scriptURL.path, requestURL.path]
        process.standardOutput = logHandle
        process.standardError = logHandle
        process.terminationHandler = { _ in
            try? logHandle.close()
        }
        try process.run()
        #else
        throw NSError(
            domain: "QuipslyAgentServer",
            code: 4_051,
            userInfo: [
                NSLocalizedDescriptionKey:
                    "Direct Python proxy export is available only in Quipsly Studio for Mac."
            ]
        )
        #endif
    }

    private nonisolated static func proxyShortExportScriptURLForAgent() throws -> URL {
        let fileManager = FileManager.default
        var roots: [URL] = [
            URL(fileURLWithPath: fileManager.currentDirectoryPath, isDirectory: true),
            Bundle.main.bundleURL
        ]
        if let resourceURL = Bundle.main.resourceURL {
            roots.append(resourceURL)
        }

        var candidates: [URL] = []
        for root in roots {
            var current = root
            for _ in 0..<8 {
                candidates.append(current.appendingPathComponent("script/shorts_proxy_export.py"))
                candidates.append(current.appendingPathComponent("apps/QuipslyStudio/script/shorts_proxy_export.py"))
                let parent = current.deletingLastPathComponent()
                if parent.path == current.path {
                    break
                }
                current = parent
            }
        }

        if let found = candidates.first(where: { fileManager.fileExists(atPath: $0.path) }) {
            return found
        }

        throw NSError(
            domain: "QuipslyDirectShortExport",
            code: 404,
            userInfo: [
                NSLocalizedDescriptionKey: "Could not find app-owned shorts_proxy_export.py. Checked \(candidates.map(\.path).joined(separator: ", "))"
            ]
        )
    }

    private nonisolated static func localMediaVaultRootURL() -> URL {
        if let configured = ProcessInfo.processInfo.environment["QUIPSLY_MEDIA_VAULT"], !configured.isEmpty {
            return URL(fileURLWithPath: configured, isDirectory: true)
        }
        let appSupport = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
        return appSupport
            .appendingPathComponent("Quipsly", isDirectory: true)
            .appendingPathComponent("MediaVault", isDirectory: true)
    }

    private nonisolated static func normalizedSessionNameForAgent(_ value: String) -> String {
        let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? "autosave" : trimmed
    }

    private nonisolated static func safeAgentFilename(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._- "))
        let scalars = value.unicodeScalars.map { scalar in
            allowed.contains(scalar) ? Character(scalar) : "-"
        }
        let sanitized = String(scalars)
            .replacingOccurrences(of: " ", with: "_")
            .replacingOccurrences(of: "__", with: "_")
        return sanitized.isEmpty ? "asset" : sanitized
    }

    private nonisolated static func safeAgentBasename(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "._-"))
        let scalars = value.unicodeScalars.map { scalar in
            allowed.contains(scalar) ? Character(scalar) : "-"
        }
        let sanitized = String(scalars)
            .replacingOccurrences(of: "--", with: "-")
            .trimmingCharacters(in: CharacterSet(charactersIn: "-._"))
        return sanitized.isEmpty ? "selected-short" : sanitized
    }

    private nonisolated static func safeSelectedShortExportBasename(
        requestedBasename: String,
        clipTitle: String,
        clipId: String,
        queueIndex: Int?
    ) -> String {
        let base = safeAgentBasename(requestedBasename.isEmpty ? "selected-short" : requestedBasename)
        let idPrefix = clipId.isEmpty ? "short" : String(clipId.prefix(8))
        let titleSlug = safeAgentBasename(clipTitle.isEmpty ? "selected-short-\(idPrefix)" : clipTitle)
        let ordinal = queueIndex.map { String(format: "%02d", $0 + 1) } ?? idPrefix
        let selectedSuffix = "\(ordinal)-\(titleSlug)"
        let lowerBase = base.lowercased()
        let lowerSuffix = selectedSuffix.lowercased()

        if lowerBase == lowerSuffix || lowerBase.hasSuffix("-\(lowerSuffix)") {
            return base
        }

        return "\(base)-\(selectedSuffix)"
    }

    private nonisolated static func uniqueSelectedShortExportBasename(_ basename: String, in outputDirectory: URL) -> String {
        let fileManager = FileManager.default
        let suffixes = [
            "-9x16-short.mp4",
            "-short-export-manifest.json"
        ]
        var candidate = basename
        var version = 2

        while suffixes.contains(where: { suffix in
            fileManager.fileExists(atPath: outputDirectory.appendingPathComponent("\(candidate)\(suffix)").path)
        }) {
            candidate = "\(basename)-v\(String(format: "%03d", version))"
            version += 1
        }

        return candidate
    }

    private nonisolated static func staticDoubleValue(_ value: Any?) -> Double {
        switch value {
        case let double as Double:
            return double
        case let number as NSNumber:
            return number.doubleValue
        case let string as String:
            return Double(string) ?? 0
        default:
            return 0
        }
    }

    @discardableResult
    private nonisolated static func projectShortSelectionInCachedState(id rawId: String, title rawTitle: String, index rawIndex: String) -> [String: Any] {
        guard let current = cachedStatusDictionary() else {
            return [
                "status": "no_state_yet",
                "truth": "Open QuipslyStudio and load Episode 1 before selecting a short through the agent API."
            ]
        }

        let queue = current["shortClipQueue"] as? [String: Any] ?? [:]
        let clips = queue["clips"] as? [[String: Any]] ?? []
        guard !clips.isEmpty else {
            return [
                "status": "no_short_candidates",
                "shortClipQueueCount": 0,
                "truth": "The loaded session has no queued short recipes to select."
            ]
        }

        let trimmedId = rawId.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTitle = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedIndex = rawIndex.trimmingCharacters(in: .whitespacesAndNewlines)
        let selected: [String: Any]?

        if !trimmedId.isEmpty {
            selected = clips.first { staticStringValue($0["id"]) == trimmedId }
        } else if !trimmedTitle.isEmpty {
            let normalizedTitle = trimmedTitle.lowercased()
            selected = clips.first { staticStringValue($0["title"]).lowercased() == normalizedTitle }
                ?? clips.first { staticStringValue($0["title"]).lowercased().contains(normalizedTitle) }
        } else if let parsedIndex = Int(trimmedIndex) {
            let zeroBasedIndex = parsedIndex > 0 ? parsedIndex - 1 : parsedIndex
            selected = clips.indices.contains(zeroBasedIndex) ? clips[zeroBasedIndex] : nil
        } else {
            selected = nil
        }

        guard let selected else {
            return [
                "status": "not_found",
                "requested": [
                    "id": trimmedId,
                    "title": trimmedTitle,
                    "index": trimmedIndex
                ] as [String: Any],
                "shortClipQueueCount": clips.count,
                "truth": "No queued short recipe matched the selector. Selection did not change."
            ]
        }

        let id = staticStringValue(selected["id"])
        let title = staticStringValue(selected["title"])
        let proof = staticSelectedShortProofPayload(for: selected, queueCount: clips.count)
        setProjectedShortSelectionCommandValues(id: id, title: title, index: trimmedIndex)

        return [
            "status": "projected",
            "id": id,
            "title": title,
            "shortClipQueueCount": clips.count,
            "selectedShortProof": proof,
            "selectionStateSource": "agent-server-short-selection-read-model",
            "truth": "The cached short queue projected selected-short truth immediately. The live SwiftUI selection bridge will catch up through the queued command; this receipt does not rewrite the full cached editor snapshot."
        ]
    }

    private nonisolated static func staticSelectedShortProofPayload(for clip: [String: Any], queueCount: Int) -> [String: Any] {
        let segments = clip["segments"] as? [[String: Any]] ?? []
        let exportRanges = clip["exportRanges"] as? [[String: Any]] ?? []

        return [
            "status": "selected_agent_projection",
            "selected": true,
            "selectionStateSource": "agent-server-short-selection-read-model",
            "id": staticStringValue(clip["id"]),
            "title": staticStringValue(clip["title"]),
            "shortClipQueueCount": queueCount,
            "supportsMultipleSegments": true,
            "timelineRailVisible": true,
            "segmentCount": segments.count,
            "exportRangeCount": exportRanges.count,
            "sequenceStartTime": clip["sequenceStartTime"] ?? clip["startTime"] ?? 0,
            "sequenceEndTime": clip["sequenceEndTime"] ?? clip["endTime"] ?? 0,
            "recipeDuration": clip["recipeDuration"] ?? clip["duration"] ?? 0,
            "reviewStatus": clip["reviewStatus"] ?? "",
            "exportStatus": clip["exportStatus"] ?? "",
            "lastExportedPath": clip["lastExportedPath"] ?? "",
            "lastExportExists": clip["lastExportExists"] ?? false,
            "expectedExportPath": clip["expectedExportPath"] ?? "",
            "expectedExportDirectory": clip["expectedExportDirectory"] ?? "",
            "expectedExportBasename": clip["expectedExportBasename"] ?? "",
            "creatorQuality": clip["creatorQuality"] ?? [:],
            "publicationPassport": clip["publicationPassport"] ?? [:],
            "verticalFraming": clip["verticalFraming"] ?? [:],
            "reviewEvidence": clip["reviewEvidence"] ?? [:],
            "transcriptContext": clip["transcriptContext"] ?? [:],
            "segments": segments,
            "exportRanges": exportRanges,
            "contract": "Projected from the cached short queue for agent-safe inspect/select. The live SwiftUI selection bridge remains the interactive source of truth."
        ]
    }

    private nonisolated static func setProjectedShortSelectionCommandValues(id: String, title: String, index: String) {
        projectedShortSelectionLock.lock()
        projectedShortSelectionValues = [
            "selectedShortId": id,
            "selectedShortTitle": title,
            "selectedShortIndex": index
        ]
        projectedShortSelectionLock.unlock()
    }

    private nonisolated static func projectedShortSelectionCommandValues() -> [String: String] {
        projectedShortSelectionLock.lock()
        let values = projectedShortSelectionValues
        projectedShortSelectionLock.unlock()
        return values
    }

    private nonisolated static func staticStringValue(_ value: Any?) -> String {
        switch value {
        case let string as String:
            return string
        case let number as NSNumber:
            return number.stringValue
        default:
            return ""
        }
    }

    private nonisolated static func updateCachedStatusResponse(_ status: [String: Any]) {
        let safeStatus = jsonSafeDictionary(status)
        guard JSONSerialization.isValidJSONObject(safeStatus),
              let data = try? JSONSerialization.data(withJSONObject: safeStatus, options: [.prettyPrinted, .sortedKeys]) else {
            return
        }
        cachedStatusLock.lock()
        cachedStatusData = data
        cachedStatusLock.unlock()
    }

    private nonisolated static func updateCachedCaptureStatusResponse(
        _ status: [String: Any]
    ) {
        let safeStatus = jsonSafeDictionary(status)
        guard JSONSerialization.isValidJSONObject(safeStatus),
              let data = try? JSONSerialization.data(
                withJSONObject: safeStatus,
                options: [.prettyPrinted, .sortedKeys]
              ) else {
            return
        }
        cachedCaptureStatusLock.lock()
        cachedCaptureStatusData = data
        cachedCaptureStatusLock.unlock()
    }

    private nonisolated static func jsonSafeDictionary(_ dictionary: [String: Any]) -> [String: Any] {
        jsonSafeValue(dictionary) as? [String: Any] ?? [
            "serializationWarning": "Agent state could not be converted into a JSON object.",
            "agentServer": "running"
        ]
    }

    private nonisolated static func jsonSafeValue(_ value: Any) -> Any {
        let mirror = Mirror(reflecting: value)
        if mirror.displayStyle == .optional {
            guard let child = mirror.children.first else { return NSNull() }
            return jsonSafeValue(child.value)
        }

        switch value {
        case is NSNull:
            return NSNull()
        case let string as String:
            return string
        case let bool as Bool:
            return bool
        case let int as Int:
            return int
        case let int64 as Int64:
            return int64
        case let int32 as Int32:
            return int32
        case let uint as UInt:
            return uint
        case let double as Double:
            return double.isFinite ? double : NSNull()
        case let float as Float:
            return float.isFinite ? Double(float) : NSNull()
        case let number as NSNumber:
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return number.boolValue
            }
            return number.doubleValue.isFinite ? number : NSNull()
        case let date as Date:
            return ISO8601DateFormatter().string(from: date)
        case let uuid as UUID:
            return uuid.uuidString
        case let url as URL:
            return url.path
        case let dictionary as [String: Any]:
            var safe: [String: Any] = [:]
            for (key, child) in dictionary {
                safe[key] = jsonSafeValue(child)
            }
            return safe
        case let dictionary as [AnyHashable: Any]:
            var safe: [String: Any] = [:]
            for (key, child) in dictionary {
                safe[String(describing: key)] = jsonSafeValue(child)
            }
            return safe
        case let array as [Any]:
            return array.map { jsonSafeValue($0) }
        default:
            return String(describing: value)
        }
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
                "GET /codex_editor_handoff",
                "GET /editor_loop_proof",
                "GET /capture_status",
                "GET /capture_open_setup",
                "GET /capture_refresh_hardware",
                "GET /capture_prepare_local?episode_space_id=<id>&participant_id=<id>&input_device_id=<exact-id>&output_device_id=<exact-id>&video_device_id=<exact-id>&include_camera=true|false&camera_signal_verified=true|false",
                "GET /capture_start_local?input_device_id=<exact-id>&video_device_id=<exact-id>",
                "GET /capture_stop_local",
                "GET /capture_audit_local",
                "GET /capture_open_editor",
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
                "GET /left_workbench?mode=os|nest|inspector|shorts|transcript|publish|agent|closed",
                "GET /native_account?action=status|google|check_saved",
                "GET /quipsly_os_operator_board",
                "GET /nest_seed_context",
                "GET /nest_writing_queue",
                "GET /nest_writing_packet",
                "GET /nest_writing_packet_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /nest_writing_next_action?index=<one-based-row-index>&kind=<optional-kind-or-label>",
                "GET /nest_append_block?title=<title>&text=<text>&tags=<comma-tags>&role=writing&episode=<episode-slug>",
                "CLI script/agentctl.sh nest-serious-draft \"Title\" \"Draft text\" episode-1 \"book,writing,episode-1,agent-first-pass\" \"why this draft exists\"",
                "CLI script/agentctl.sh nest-serious-draft-file \"Episode 1 - The Wednesday Rule\" /Users/wall-e/Dev/high-ground-studio/docs/quipsly/content-drafts/hgo-episode-1-the-wednesday-rule-agent-first-pass.md episode-1",
                "GET /timeline_zoom?mode=fit|cut|precision|frame|in|out|set&scale=<pixels-per-second>",
                "GET /select_lane?lane_id=<uuid-or-name>",
                "GET /format?value=16:9|9:16",
                "GET /program_crop_mode?mode=baseline|keyframe",
                "GET /program_crop?lane_id=<uuid-or-name>&format=16:9|9:16&pan_x=<minus1-to-1>&pan_y=<minus1-to-1>&zoom=<1-to-4>",
                "GET /program_crop_preset?lane_id=<uuid-or-name>&format=16:9|9:16&preset=centered|tighter|looser|headroom|upper-third|left|right|solo-safe|hide-desk|weight-left|weight-right|vertical-solo|vertical-punch|stack-top|stack-bottom&mode=baseline|keyframe&time=<seconds>",
                "GET /program_crop_keyframe?lane_id=<uuid-or-name>&format=16:9|9:16&time=<sequence-seconds>&pan_x=<minus1-to-1>&pan_y=<minus1-to-1>&zoom=<1-to-4>",
                "GET /program_crop_keyframe?lane_id=<uuid-or-name>&format=16:9|9:16&time=<sequence-seconds>&pan_x_delta=<value>&pan_y_delta=<value>&zoom_delta=<value>",
                "GET /program_crop_clear_keyframes?lane_id=<uuid-or-name>&format=16:9|9:16",
                "GET /program_ambiguity_report?sample_limit=<optional-count>",
                "GET /program_ambiguity_review?mode=first|previous|next|last|nearest&sample_limit=<optional-count>",
                "GET /program_ambiguity_resolve?choice=first|second|third|first_clip|second_clip|skip|<lane-id-or-name>&advance=next",
                "GET /program_ambiguity_batch?mode=preview|apply&max_count=<small-count>&min_confidence=<0-to-1>",
                "GET /program_ambiguity_manual_review?choice=<choice>&note=<why>&actor=<name>&actor_type=human|agent&apply=0|1",
                "GET /edit_pass?label=<name>&actor=<name>&actor_type=human|agent&pass_number=<n>&goal=<text>&status=active|review|complete",
                "GET /correction_note?note=<text>&actor=<name>&actor_type=human|agent&category=edit-correction|framing|cut-choice|shorts",
                "GET /source_window?lane_id=<uuid-or-name>&action=show|cut&duration=<seconds>",
                "GET /switch_selected_decision?action=charlie|homer|both|skip|charlieClip|homerClip",
                "GET /transcript_seed_demo",
                "GET /transcript_import?path=<absolute-srt-vtt-or-json-path>&format=auto|srt|vtt|json",
                "GET /transcript_generate?lane_id=<optional-uuid-or-name>&command_path=<optional-executable-that-prints-srt-or-vtt>",
                "GET /transcript_search?query=<text>&mode=first|next|previous|current",
                "GET /transcript_select?mode=first|at_playhead|next|previous&id=<optional-transcript-segment-id>",
                "GET /transcript_word?mode=current|next|previous|first|last&segment_id=<optional-transcript-segment-id>&index=<optional-word-index>",
                "GET /transcript_set_speaker?segment_id=<optional-transcript-segment-id>&speaker=Charlie|Homer|Both|Speaker&actor=<optional>",
                "GET /transcript_create_short?mode=current|selected|first|next|previous&padding_before=<seconds>&padding_after=<seconds>&title=<optional>&actor=<name>&actor_type=human|agent",
                "GET /transcript_apply_to_short?field=caption|overlay|hook",
                "GET /transcript_clear",
                "GET /transcript_clear_jobs",
                "GET /shorts_queue",
                "GET /shorts_queue_add_selected?title=<optional-title>",
                "GET /shorts_queue_add_range?start=<sequence-seconds>&end=<sequence-seconds>&title=<optional-title>",
                "GET /shorts_queue_append_selected_segment",
                "GET /shorts_queue_select?id=<short-clip-id>|title=<text>|index=<zero-or-one-based-index>",
                "GET /shorts_review_next?status=<optional-status>",
                "GET /shorts_queue_remove?id=<short-clip-id>",
                "GET /shorts_queue_update_selected?field=title|hook|caption|overlay|notes|review_status|export_status&value=<text>",
                "GET /shorts_quality_action?action=fill-hook|draft-copy|draft-platform-pack|draft-all-platform-packs|copy-platform-pack-json|save-platform-pack-json|copy-polish-prompt|needs-refine",
                "GET /shorts_platform_pack_index?action=save|copy",
                "GET /shorts_overlay_burn_in?decision=approve|hold&note=<optional-review-note>",
                "GET /shorts_listen_through?note=<optional-review-note>",
                "GET /shorts_visual_review?sheet=<absolute-contact-sheet-path>&source=<absolute-derivative-path>&note=<optional-review-note>",
                "GET /shorts_text_review?decision=approve|rewrite&note=<optional-review-note>",
                "GET /shorts_review_selected?status=keep|refine|reject&notes=<optional>",
                "GET /shorts_review?id=<short-clip-id>&status=keep|refine|reject&notes=<optional>",
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
                "GET /restore_media_access",
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
                "GET /publication_next_receipt",
                "GET /publish_ledger_generate",
                "GET /publish_packet",
                "GET /publish_packet_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /vertical_slice",
                "GET /vertical_slice_packet",
                "GET /vertical_slice_packet_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /social_shorts_packet",
                "GET /social_shorts_packet_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /social_publication_queue_generate?directory=<absolute-output-folder>&basename=<name>",
                "GET /reviewed_social_queue_generate?directory=<absolute-output-folder>&basename=<name>",
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
                "GET /publication_operator_runbook",
                "GET /publication_mission_control",
                "GET /episode_spine",
                "GET /publication_receipt_cockpit",
                "CLI script/agentctl.sh publication-writing-packet",
                "CLI script/agentctl.sh publication-writing-packet --json",
                "CLI script/agentctl.sh publication-writing-packet-v2",
                "CLI script/agentctl.sh publication-writing-packet-v2 --json",
                "CLI script/agentctl.sh publication-destination-copy",
                "CLI script/agentctl.sh publication-destination-copy --json",
                "CLI script/agentctl.sh episode1-publication-action-queue",
                "CLI script/agentctl.sh episode1-publication-action-queue --json",
                "CLI script/agentctl.sh episode1-studio-artifact-proof-requirements",
                "CLI script/agentctl.sh episode1-studio-artifact-proof-requirements --json",
                "CLI script/agentctl.sh episode1-studio-proof-attachment-queue",
                "CLI script/agentctl.sh episode1-studio-proof-attachment-queue --json",
                "CLI script/agentctl.sh episode1-studio-proof-attach /absolute/release-manifest-or-folder [/absolute/output.json]",
                "CLI script/agentctl.sh episode1-studio-proof-attach-latest [/absolute/output.json]",
                "CLI script/agentctl.sh episode1-vertical-slice-refresh",
                "CLI script/agentctl.sh episode1-vertical-slice-refresh [/absolute/output.json]",
                "CLI script/agentctl.sh episode1-vertical-slice-brief",
                "CLI script/agentctl.sh episode1-vertical-slice-brief --json",
                "CLI script/agentctl.sh episode1-vertical-slice-next",
                "CLI script/agentctl.sh episode1-vertical-slice-next --json",
                "CLI script/agentctl.sh episode1-writing-tower-readiness",
                "CLI script/agentctl.sh episode1-writing-tower-readiness --json",
                "CLI script/agentctl.sh episode1-writing-provenance",
                "CLI script/agentctl.sh episode1-writing-provenance --json",
                "CLI script/agentctl.sh episode1-writing-draft-v2",
                "CLI script/agentctl.sh episode1-writing-draft-v2 --json",
                "CLI script/agentctl.sh episode1-writing-current",
                "CLI script/agentctl.sh episode1-writing-current --json",
                "CLI script/agentctl.sh episode1-writing-loop-status",
                "CLI script/agentctl.sh episode1-writing-loop-status --json",
                "CLI script/agentctl.sh episode1-writing-nest-intake",
                "CLI script/agentctl.sh episode1-writing-nest-intake --json",
                "CLI script/agentctl.sh episode1-writing-nest-queue",
                "CLI script/agentctl.sh episode1-writing-nest-queue --json",
                "CLI script/agentctl.sh episode1-writing-nest-ingest-receipt",
                "CLI script/agentctl.sh episode1-writing-nest-ingest-receipt --json",
                "CLI script/agentctl.sh episode1-writing-human-handoff",
                "CLI script/agentctl.sh episode1-writing-human-handoff --json",
                "CLI script/agentctl.sh episode1-writing-compare",
                "CLI script/agentctl.sh episode1-writing-compare --json",
                "CLI script/agentctl.sh episode1-writing-handoff",
                "CLI script/agentctl.sh episode1-writing-handoff --json",
                "CLI script/agentctl.sh episode1-writing-review-checklist",
                "CLI script/agentctl.sh episode1-writing-review-checklist --json",
                "CLI script/agentctl.sh episode1-writing-review-bundle",
                "CLI script/agentctl.sh episode1-writing-review-bundle --json",
                "CLI script/agentctl.sh episode1-writing-review-ledger --json",
                "CLI script/agentctl.sh episode1-writing-review-status --json",
                "CLI script/agentctl.sh episode1-writing-review-decision needs-agent-revision Codex \"what should change next\"",
                "GET /publication_reveal_release_folder",
                "GET /publication_copy_mission_control",
                "GET /publication_copy_missing_receipts",
                "GET /episode_copy_receipt_commands",
                "GET /podcast_copy_receipt_commands",
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
                "GET /capture_status",
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
                    "endpoint": "GET /select_lane, /select_decision, /source_window, /trim_selected, /timeline_zoom, /format, /program_crop, /correction_note",
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
                    "examples": ["/source_window", "/select_decision?mode=at_playhead&scope=video", "/trim_selected", "/nudge_selected", "/delete_selected_tag", "/program_crop", "/program_crop_keyframe", "/correction_note"],
                    "rule": "May change metadata overlays only. Must re-observe state afterward."
                ],
                [
                    "risk": "media-recovery",
                    "examples": ["/restore_media_access", "/relink_lane", "/match_folder", "/vault_lane", "/retry_proxies"],
                    "rule": "Requires explicit operator intent because it may touch protected folders or run proxy work."
                ]
            ],
            "trainingDataContract": [
                "capabilityParity": "Capture the agentCapabilityParity item involved so training data knows which human workflow the action belongs to.",
                "episodeState": "Capture /state snapshots before and after actions.",
                "actionLedger": "Capture endpoint, parameters, response, and resulting proof snapshot.",
                "correctionNotes": "Capture optional human/agent correction notes at the playhead so first-cut quality can improve without forcing reviewers to document every tiny edit.",
                "commandAcknowledgementRule": "Do not treat *_commanded responses as final state. Re-observe /state or /editor_snapshot before claiming completion.",
                "humanParity": "If a human can do an important edit through the UI, an agent should get a semantic command and state echo for the same concept.",
                "forbiddenShortcut": "Do not train agents to click by screen coordinates when semantic editor truth exists."
            ],
            "proofEndpoints": [
                "GET /editor_loop_proof",
                "GET /editor_snapshot",
                "GET /state",
                "GET /agent_capabilities",
                "GET /codex_editor_handoff",
                "GET /commands"
            ]
        ]
    }

    private func codexEditorHandoffPayload() -> [String: Any] {
        guard let status = lastStatus else {
            return [
                "status": "no_state_yet",
                "packetType": "quipslystudio-codex-editor-handoff",
                "activeNativeEditor": "apps/QuipslyStudio",
                "legacyReferenceOnly": ["apps/quipsly-mac", "apps/quipsly-video"],
                "hint": "Open QuipslyStudio, load a native editor session, then call /codex_editor_handoff again.",
                "operatorLoop": "observe_state_choose_semantic_action_execute_reobserve"
            ]
        }

        return [
            "status": "ok",
            "packetType": "quipslystudio-codex-editor-handoff",
            "payloadVersion": 1,
            "generatedAt": ISO8601DateFormatter().string(from: Date()),
            "truth": "This packet gives Codex current editor truth and safe actions. It is not a substitute for re-observing /state after each command.",
            "activeNativeEditor": "apps/QuipslyStudio",
            "legacyReferenceOnly": ["apps/quipsly-mac", "apps/quipsly-video"],
            "coreInvariants": [
                "one shared playhead drives Program Output, Source Grove, and Episode Spine",
                "whole synced source lanes remain intact",
                "SHOW and SKIP are reversible metadata overlays",
                "proxy-first editing protects originals",
                "prepared artifacts are not posted artifacts",
                "publication requires human or provider proof"
            ],
            "currentContext": status["agentCurrentContext"] ?? [:],
            "proofSnapshot": status["editorProofSnapshot"] ?? [:],
            "capabilities": status["agentCapabilityParity"] ?? [],
            "currentSafeActions": status["agentCurrentSafeActions"] ?? [],
            "publicationReadyHandoff": status["publicationReadyHandoff"] ?? [:],
            "socialMasterQueue": status["socialMasterQueue"] ?? [:],
            "agentAccess": [
                "observeBeforeEdit": [
                    "GET /state",
                    "GET /editor_snapshot",
                    "GET /agent_capabilities",
                    "GET /codex_editor_handoff"
                ],
                "semanticSurfaces": [
                    "quipsly.editor.monitorWall",
                    "quipsly.sourceWall",
                    "quipsly.editor.timeline",
                    "quipsly.publish.codexEditorHandoffPanel",
                    "quipsly.publish.copyCodexEditorHandoff",
                    "quipsly.publish.testFlightReadinessPanel",
                    "quipsly.ship.artifactTruthPanel",
                    "quipsly.ship.outputReadinessDeck"
                ],
                "requiredPostEditChecks": [
                    "re-read GET /state after every command acknowledgement",
                    "confirm Program Output reflects SHOW/SKIP decisions",
                    "confirm Source Grove remains whole-source review context",
                    "confirm shorts remain tied to Episode Spine ranges",
                    "confirm Ship still separates prepared approved posted and proved"
                ],
                "interactionRule": "Prefer semantic endpoints and accessibility identifiers over pixel-only clicks. If only pixels are available, observe before and after every action."
            ],
            "codexSafeActions": [
                "observe current app state",
                "scrub and inspect",
                "select lane or decision",
                "add or adjust reversible SHOW/SKIP metadata",
                "prepare output packets",
                "copy destination matrix",
                "copy human approval packet",
                "list missing receipts",
                "write handoff notes"
            ],
            "humanOrProviderRequiredActions": [
                "approve posting",
                "post to YouTube Patreon Instagram Facebook LinkedIn Spotify or Apple",
                "capture receipt without a real URL scheduled URL or provider ID",
                "claim published",
                "claim TestFlight ready before signed archive and collaborator install proof"
            ],
            "nextBestCodexMove": "Use currentSafeActions and proofSnapshot to choose the next semantic command, execute it, then re-observe /state before claiming success."
        ]
    }

    private nonisolated static func cachedShortClipQueuePayload() -> [String: Any] {
        guard let cachedStatus = cachedStatusDictionary(),
              let queue = cachedStatus["shortClipQueue"] as? [String: Any] else {
            return [
                "status": "no_short_clip_queue_yet",
                "hint": "Open QuipslyStudio and load a native editor session, then call /shorts_queue again.",
                "truth": "This endpoint reads the cached editor snapshot off the MainActor so agent observation stays responsive."
            ]
        }
        return queue
    }

    private nonisolated static func cachedEditorLoopProofPayload() -> [String: Any] {
        editorLoopProofPayload(from: cachedStatusDictionary())
    }

    private func editorLoopProofPayload() -> [String: Any] {
        Self.editorLoopProofPayload(from: lastStatus)
    }

    private nonisolated static func editorLoopProofPayload(from status: [String: Any]?) -> [String: Any] {
        guard let status else {
            return [
                "status": "no_state_yet",
                "model": "quipslystudio-editor-loop-proof",
                "hint": "Open QuipslyStudio, load Episode 1, then call /editor_loop_proof again.",
                "truth": "This compact proof endpoint is read-only. It exists so humans and agents can verify the editing loop without scraping pixels or parsing the full /state payload."
            ]
        }

        let selectedDecision = status["selectedDecision"] as? [String: Any] ?? [:]
        let selectedShort = status["selectedShortClip"] as? [String: Any] ?? [:]
        let shortQueue = status["shortClipQueue"] as? [String: Any] ?? [:]
        let selectedShortPassport = selectedShort["publicationPassport"] as? [String: Any] ?? [:]
        let selectedShortQuality = selectedShort["creatorQuality"] as? [String: Any] ?? [:]
        let selectedShortQualitySummary = selectedShortQuality["qualityPacketSummary"] as? [String: Any] ?? [:]
        let sourceProof = status["sourceMonitorSyncProof"] as? [String: Any] ?? [:]
        let programTruth = status["programOutputTruth"] as? [String: Any] ?? [:]
        let workingSet = status["workingSetTruth"] as? [String: Any] ?? [:]

        let sharedPlayhead: [String: Any] = [
            "sequenceTime": status["playhead"] ?? status["playheadSeconds"] ?? 0,
            "playbackMode": status["playbackMode"] ?? "",
            "timelinePixelsPerSecond": status["timelinePixelsPerSecond"] ?? "",
            "timelineFitToWindow": status["timelineFitToWindow"] ?? "",
            "lastMediaAction": status["lastMediaAction"] ?? ""
        ]

        let syncProof: [String: Any] = [
            "sourceMonitorVideoCount": status["sourceMonitorVideoCount"] ?? sourceProof["sourceMonitorVideoCount"] ?? 0,
            "sourcePlayerCount": sourceProof["sourcePlayerCount"] ?? 0,
            "maxSourcePlayerDelta": sourceProof["maxSourcePlayerDelta"] ?? "",
            "programOutput": status["programTitle"] ?? programTruth["title"] ?? "",
            "programMode": status["programMode"] ?? status["playbackMode"] ?? ""
        ]

        let laneTruth: [String: Any] = [
            "laneCount": status["laneCount"] ?? 0,
            "videoProxyReadyCount": status["videoProxyReadyCount"] ?? 0,
            "videoBlockedCount": status["videoBlockedCount"] ?? 0,
            "audioReadyCount": status["audioReadyCount"] ?? 0,
            "workingSetStatus": workingSet["status"] ?? "",
            "workingSetSummary": workingSet["summary"] ?? ""
        ]

        let decisionTruth: [String: Any] = [
            "showDecisionCount": status["showDecisionCount"] ?? 0,
            "skipDecisionCount": status["skipDecisionCount"] ?? 0,
            "validRangeCount": status["validRangeCount"] ?? 0,
            "selectedLaneName": selectedDecision["laneName"] ?? selectedDecision["selectedLaneName"] ?? "",
            "selectedTagType": selectedDecision["tagType"] ?? selectedDecision["selectedTagType"] ?? "",
            "selectedTagStart": selectedDecision["start"] ?? selectedDecision["selectedTagStart"] ?? "",
            "selectedTagDuration": selectedDecision["duration"] ?? selectedDecision["selectedTagDuration"] ?? ""
        ]

        let shortTruth: [String: Any] = [
            "shortRecipeCount": status["shortClipQueueCount"] ?? shortQueue["count"] ?? 0,
            "selectedShortTitle": selectedShort["title"] ?? "",
            "selectedShortId": selectedShort["id"] ?? "",
            "selectedShortRecipeDuration": selectedShort["recipeDuration"] ?? "",
            "selectedShortReviewStatus": selectedShort["reviewStatus"] ?? "",
            "selectedShortExportStatus": selectedShort["exportStatus"] ?? "",
            "selectedShortPrimaryPlatform": selectedShortPassport["primaryPlatform"] ?? selectedShortQuality["primaryPlatform"] ?? "",
            "selectedShortNextAction": selectedShortPassport["nextAction"] ?? selectedShortQualitySummary["nextSafeAction"] ?? "",
            "selectedShortPublicationPassport": selectedShortPassport,
            "selectedShortQualitySummary": selectedShortQualitySummary,
            "truth": shortQueue["truth"] ?? "Shorts are output recipes over sequence time; they do not chop source media."
        ]

        let agentCanUse: [String: Any] = [
            "observe": "script/agentctl.sh editor-loop-proof",
            "scrub": "script/agentctl.sh scrub <seconds>",
            "programScroll": "script/agentctl.sh program-scroll <delta-seconds>",
            "zoom": "script/agentctl.sh timeline-zoom precision|frame|fit|set <px-per-sec>",
            "selectDecision": "script/agentctl.sh select-decision at_playhead video",
            "sourceWindow": "script/agentctl.sh source-window \"Charlie Camera\" show 10",
            "switchSelected": "script/agentctl.sh switch-selected charlie|homer|both|skip",
            "shorts": "script/agentctl.sh shorts-select index 1 && script/agentctl.sh shorts-range-selected start delta -0.1",
            "shortPublicationProof": "script/agentctl.sh editor-loop-proof then inspect shortTruth.selectedShortPublicationPassport",
            "shortExport": "script/agentctl.sh shorts-export-selected /absolute/output/folder optional-basename",
            "shortReview": "script/agentctl.sh shorts-review-selected keep|refine|reject \"notes\""
        ]

        let payload: [String: Any] = [
            "status": "ok",
            "model": "quipslystudio-editor-loop-proof",
            "version": "2026-06-22.editor-loop-proof.v1",
            "generatedAt": ISO8601DateFormatter().string(from: Date()),
            "activeSessionName": status["activeSessionName"] ?? "",
            "coreInvariant": "Whole synced sources stay intact. Gold/red edit decisions and green short recipes are metadata over one shared sequence-time playhead.",
            "sharedPlayhead": sharedPlayhead,
            "syncProof": syncProof,
            "laneTruth": laneTruth,
            "decisionTruth": decisionTruth,
            "shortTruth": shortTruth,
            "agentCanUse": agentCanUse,
            "sourcePolicy": "Read-only proof. It does not touch originals, proxies, timeline decisions, exports, or publication receipts."
        ]
        return payload
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
            "codexEditorHandoffUrl": "http://127.0.0.1:\(port)/codex_editor_handoff",
            "editorLoopProofUrl": "http://127.0.0.1:\(port)/editor_loop_proof",
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
        if let projectedShortSelectionOverlay,
           shouldApplyProjectedShortSelection(projectedShortSelectionOverlay, to: enriched) {
            applyProjectedShortSelection(projectedShortSelectionOverlay, to: &enriched, overwriteExisting: false)
        } else if !stringValue(enriched["selectedShortClipId"]).isEmpty {
            projectedShortSelectionOverlay = nil
        }
        enriched["agentServer"] = "running"
        enriched["agentPort"] = port
        enriched["agentPendingCommandCount"] = pendingCommandRequests.count + Self.httpCommandCount()
        enriched["agentCommandExecutorRegistered"] = commandExecutor != nil
        enriched["agentLastCommandReceipt"] = lastCommandReceipt
        enriched["agentActiveCommandConsumerId"] = activeCommandConsumerId?.uuidString ?? ""
        enriched["commandsUrl"] = "http://127.0.0.1:\(port)/commands"
        enriched["agentManualUrl"] = "http://127.0.0.1:\(port)/agent_manual"
        enriched["agentCapabilitiesUrl"] = "http://127.0.0.1:\(port)/agent_capabilities"
        enriched["codexEditorHandoffUrl"] = "http://127.0.0.1:\(port)/codex_editor_handoff"
        let safeStatus = Self.jsonSafeDictionary(enriched)
        self.lastStatus = safeStatus
        Self.updateCachedStatusResponse(safeStatus)
    }

    public func writeCaptureStatus(_ status: [String: Any]) {
        var enriched = status
        enriched["agentServer"] = "running"
        enriched["agentPort"] = port
        enriched["agentPendingCommandCount"] =
            pendingCommandRequests.count + Self.httpCommandCount()
        enriched["agentCommandExecutorRegistered"] =
            commandExecutor != nil
        enriched["agentLastCommandReceipt"] = lastCommandReceipt
        enriched["agentActiveCommandConsumerId"] =
            activeCommandConsumerId?.uuidString ?? ""
        enriched["captureStatusUrl"] =
            "http://127.0.0.1:\(port)/capture_status"
        enriched["commandsUrl"] =
            "http://127.0.0.1:\(port)/commands"
        enriched["projectionOwnership"] =
            "episode-capture-setup"
        enriched["projectionIsolationTruth"] =
            "The capture projection remains readable even while the main editor continues publishing /state."
        Self.updateCachedCaptureStatusResponse(enriched)
    }

    private func refreshCachedStatusCommandMetadata() {
        guard var current = lastStatus else { return }
        if let projectedShortSelectionOverlay,
           shouldApplyProjectedShortSelection(projectedShortSelectionOverlay, to: current) {
            applyProjectedShortSelection(projectedShortSelectionOverlay, to: &current, overwriteExisting: false)
        }
        current["agentPendingCommandCount"] = pendingCommandRequests.count + Self.httpCommandCount()
        current["agentCommandExecutorRegistered"] = commandExecutor != nil
        current["agentLastCommandReceipt"] = lastCommandReceipt
        current["agentActiveCommandConsumerId"] = activeCommandConsumerId?.uuidString ?? ""
        current["agentCommandSerial"] = commandSerial
        let safeStatus = Self.jsonSafeDictionary(current)
        lastStatus = safeStatus
        Self.updateCachedStatusResponse(safeStatus)
    }

    @discardableResult
    public func enqueueCommand(_ name: String, values: [String: String] = [:]) -> [String: Any] {
        let request = AgentCommandRequest(name: name, values: values)
        commandSerial += 1
        let executorRegistered = commandExecutor != nil
        var receipt: [String: Any] = [
            "id": request.id.uuidString,
            "name": name,
            "serial": commandSerial,
            "values": values,
            "executorRegistered": executorRegistered,
            "mode": "queued-for-view-drain"
        ]

        if let commandExecutor {
            receipt["status"] = "delivered_to_registered_view_bridge"
            receipt["mode"] = "registered-view-bridge-direct"
            receipt["pendingCommandCount"] = pendingCommandRequests.count + Self.httpCommandCount()
            lastCommandReceipt = receipt
            refreshCachedStatusCommandMetadata()
            commandExecutor(request)
            return receipt
        }

        // The legacy command fields are a fallback for views that have not
        // registered the typed command bridge. Mutating them on the direct path
        // causes the same command to be applied a second time when `trigger`
        // fires (and loses typed request values such as playback mode).
        commandToExecute = name
        trigger = UUID()
        pendingCommandRequests.append(request)
        NotificationCenter.default.post(name: .quipslyAgentCommandQueued, object: nil)
        receipt["status"] = "queued"
        receipt["pendingCommandCount"] = pendingCommandRequests.count
        lastCommandReceipt = receipt
        refreshCachedStatusCommandMetadata()
        return receipt
    }

    @discardableResult
    private func projectShortSelectionIntoCachedState(id rawId: String, title rawTitle: String, index rawIndex: String) -> [String: Any] {
        guard var current = lastStatus else {
            return [
                "status": "no_state_yet",
                "truth": "Open QuipslyStudio and load Episode 1 before selecting a short through the agent API."
            ]
        }

        let queue = current["shortClipQueue"] as? [String: Any] ?? [:]
        let clips = queue["clips"] as? [[String: Any]] ?? []
        guard !clips.isEmpty else {
            return [
                "status": "no_short_candidates",
                "shortClipQueueCount": 0,
                "truth": "The loaded session has no queued short recipes to select."
            ]
        }

        let trimmedId = rawId.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedTitle = rawTitle.trimmingCharacters(in: .whitespacesAndNewlines)
        let trimmedIndex = rawIndex.trimmingCharacters(in: .whitespacesAndNewlines)
        let selected: [String: Any]?

        if !trimmedId.isEmpty {
            selected = clips.first { stringValue($0["id"]) == trimmedId }
        } else if !trimmedTitle.isEmpty {
            let normalizedTitle = trimmedTitle.lowercased()
            selected = clips.first { stringValue($0["title"]).lowercased() == normalizedTitle }
                ?? clips.first { stringValue($0["title"]).lowercased().contains(normalizedTitle) }
        } else if let parsedIndex = Int(trimmedIndex) {
            let zeroBasedIndex = parsedIndex > 0 ? parsedIndex - 1 : parsedIndex
            selected = clips.indices.contains(zeroBasedIndex) ? clips[zeroBasedIndex] : nil
        } else {
            selected = nil
        }

        guard let selected else {
            return [
                "status": "not_found",
                "requested": [
                    "id": trimmedId,
                    "title": trimmedTitle,
                    "index": trimmedIndex
                ] as [String: Any],
                "shortClipQueueCount": clips.count,
                "truth": "No queued short recipe matched the selector. Selection did not change."
            ]
        }

        let id = stringValue(selected["id"])
        let title = stringValue(selected["title"])
        let proof = projectedSelectedShortProofPayload(for: selected, queueCount: clips.count)
        let overlay: [String: Any] = [
            "activeSessionName": stringValue(current["activeSessionName"]),
            "selectedShortClipId": id,
            "selectedShortClip": selected,
            "selectedShortProof": proof,
            "agentSelectionProjectionSource": "agent-server-short-selection-read-model",
            "agentLastProcessedCommandSerial": commandSerial,
            "lastMediaAction": "Agent selected short recipe: \(title)"
        ]

        projectedShortSelectionOverlay = overlay
        applyProjectedShortSelection(overlay, to: &current, overwriteExisting: true)
        let safeStatus = Self.jsonSafeDictionary(current)
        lastStatus = safeStatus
        Self.updateCachedStatusResponse(safeStatus)

        return [
            "status": "projected",
            "id": id,
            "title": title,
            "shortClipQueueCount": clips.count,
            "selectionStateSource": "agent-server-short-selection-read-model",
            "truth": "The command was delivered to the editor bridge and also projected into /state so agents can inspect selected-short truth without relying on pixel clicks."
        ]
    }

    private func projectedSelectedShortProofPayload(for clip: [String: Any], queueCount: Int) -> [String: Any] {
        let segments = clip["segments"] as? [[String: Any]] ?? []
        let exportRanges = clip["exportRanges"] as? [[String: Any]] ?? []

        return [
            "status": "selected_agent_projection",
            "selected": true,
            "selectionStateSource": "agent-server-short-selection-read-model",
            "id": stringValue(clip["id"]),
            "title": stringValue(clip["title"]),
            "shortClipQueueCount": queueCount,
            "supportsMultipleSegments": true,
            "timelineRailVisible": true,
            "segmentCount": segments.count,
            "exportRangeCount": exportRanges.count,
            "sequenceStartTime": clip["sequenceStartTime"] ?? clip["startTime"] ?? 0,
            "sequenceEndTime": clip["sequenceEndTime"] ?? clip["endTime"] ?? 0,
            "recipeDuration": clip["recipeDuration"] ?? clip["duration"] ?? 0,
            "reviewStatus": clip["reviewStatus"] ?? "",
            "exportStatus": clip["exportStatus"] ?? "",
            "lastExportedPath": clip["lastExportedPath"] ?? "",
            "lastExportExists": clip["lastExportExists"] ?? false,
            "expectedExportPath": clip["expectedExportPath"] ?? "",
            "expectedExportDirectory": clip["expectedExportDirectory"] ?? "",
            "expectedExportBasename": clip["expectedExportBasename"] ?? "",
            "creatorQuality": clip["creatorQuality"] ?? [:],
            "publicationPassport": clip["publicationPassport"] ?? [:],
            "verticalFraming": clip["verticalFraming"] ?? [:],
            "reviewEvidence": clip["reviewEvidence"] ?? [:],
            "transcriptContext": clip["transcriptContext"] ?? [:],
            "segments": segments,
            "exportRanges": exportRanges,
            "contract": "Projected from the cached short queue for agent-safe inspect/select. The live SwiftUI selection bridge remains the interactive source of truth."
        ]
    }

    private func shouldApplyProjectedShortSelection(_ overlay: [String: Any], to status: [String: Any]) -> Bool {
        guard stringValue(status["selectedShortClipId"]).isEmpty else { return false }
        let overlaySession = stringValue(overlay["activeSessionName"])
        let statusSession = stringValue(status["activeSessionName"])
        return overlaySession.isEmpty || statusSession.isEmpty || overlaySession == statusSession
    }

    private func applyProjectedShortSelection(_ overlay: [String: Any], to status: inout [String: Any], overwriteExisting: Bool) {
        if !overwriteExisting && !stringValue(status["selectedShortClipId"]).isEmpty {
            return
        }
        status["selectedShortClipId"] = overlay["selectedShortClipId"] ?? ""
        status["selectedShortClip"] = overlay["selectedShortClip"] ?? [:]
        status["selectedShortProof"] = overlay["selectedShortProof"] ?? [:]
        status["agentSelectionProjectionSource"] = overlay["agentSelectionProjectionSource"] ?? ""
        status["agentLastProcessedCommandSerial"] = overlay["agentLastProcessedCommandSerial"] ?? commandSerial
        status["lastMediaAction"] = overlay["lastMediaAction"] ?? status["lastMediaAction"] ?? ""
    }

    private func stringValue(_ value: Any?) -> String {
        switch value {
        case let string as String:
            return string
        case let number as NSNumber:
            return number.stringValue
        default:
            return ""
        }
    }

    public func drainCommandRequests(consumerId: UUID? = nil) -> [AgentCommandRequest] {
        if let consumerId, activeCommandConsumerId != consumerId {
            return []
        }
        let httpRequests = Self.drainHTTPCommands()
        let requests = pendingCommandRequests
        pendingCommandRequests = []
        return httpRequests + requests
    }

    public func recordCommandProcessing(
        _ request: AgentCommandRequest,
        status: String,
        mode: String = "view-drain"
    ) {
        var receipt: [String: Any] = [
            "id": request.id.uuidString,
            "name": request.name,
            "serial": commandSerial,
            "values": request.values,
            "executorRegistered": commandExecutor != nil,
            "mode": mode,
            "status": status,
            "pendingCommandCount": pendingCommandRequests.count + Self.httpCommandCount()
        ]
        if let activeCommandConsumerId {
            receipt["consumerId"] = activeCommandConsumerId.uuidString
        }
        lastCommandReceipt = receipt
        refreshCachedStatusCommandMetadata()
    }

    public func claimCommandConsumer(_ id: UUID) {
        activeCommandConsumerId = id
    }

    public func registerCommandDispatchHandler(_ handler: @escaping () -> Void) {
        commandDispatchHandler = handler
        if !pendingCommandRequests.isEmpty {
            handler()
        }
    }

    public func registerCommandExecutor(_ executor: @escaping (AgentCommandRequest) -> Void) {
        commandExecutor = executor
        refreshCachedStatusCommandMetadata()
    }

    public func clearCommandDispatchHandler() {
        commandDispatchHandler = nil
    }

    public func clearCommandExecutor() {
        commandExecutor = nil
    }
}

private struct AgentHTTPRequest {
    let method: String
    let path: String
    let query: [String: String]
    let headers: [String: String]
}
