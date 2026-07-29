import Foundation
import Network
import QuipslyVideoCore
#if canImport(Combine)
import Combine
#endif

public extension Notification.Name {
    static let quipslyAgentCommandQueued = Notification.Name("quipsly.agent.commandQueued")
}

public struct AgentCommandRequest: Identifiable, Sendable {
    public let id: UUID
    public let name: String
    public let values: [String: String]

    public init(id: UUID = UUID(), name: String, values: [String: String] = [:]) {
        self.id = id
        self.name = name
        self.values = values
    }
}

private extension AgentCommandRequest {
    static func redactedValues(_ values: [String: String]) -> [String: String] {
        values.mapValues { value in value }.reduce(into: [String: String]()) { result, pair in
            let key = pair.key.lowercased()
            let shouldRedact =
                key.contains("password") ||
                key.contains("token") ||
                key.contains("secret") ||
                key.contains("cookie") ||
                key.contains("authorization") ||
                key.contains("private") ||
                key.contains("credential") ||
                (key.contains("api") && key.contains("key"))

            result[pair.key] = shouldRedact ? "[redacted]" : pair.value
        }
    }

    var redactedValues: [String: String] {
        Self.redactedValues(values)
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
    private nonisolated static let projectedShortSelectionLock = NSLock()
    private nonisolated(unsafe) static var projectedShortSelectionValues: [String: String] = [:]
    private nonisolated static let httpCommandQueueLock = NSLock()
    private nonisolated(unsafe) static var httpCommandQueue: [AgentCommandRequest] = []
    private nonisolated static let directProxyExportLock = NSLock()
    private nonisolated(unsafe) static var lastDirectProxyShortExportRequestPath: String = ""
    private nonisolated static let directProxyExportRequestDefaultsKey = "quipsly.agent.lastDirectProxyShortExportRequestPath"

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
                self?.handleConnection(connection)
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

            switch request.path {
            case "/", "/health":
                self?.sendJSON(connection, object: Self.cachedHealthPayload())
            case "/commands":
                self?.sendJSON(connection, object: Self.commandsPayload())
            case "/agent_manual":
                Task { @MainActor in
                    self?.sendJSON(connection, object: self?.agentManualPayload() ?? ["status": "unavailable"])
                }
            case "/agent_capabilities":
                Task { @MainActor in
                    self?.sendJSON(connection, object: self?.agentCapabilitiesPayload() ?? ["status": "unavailable"])
                }
            case "/active_source_map", "/studio_source_map", "/goal_contract":
                Task { @MainActor in
                    self?.sendJSON(connection, object: self?.activeSourceMapPayload() ?? ["status": "unavailable"])
                }
            case "/codex_editor_handoff":
                Task { @MainActor in
                    self?.sendJSON(connection, object: self?.codexEditorHandoffPayload() ?? ["status": "unavailable"])
                }
            case "/editor_loop_proof":
                self?.sendJSON(connection, object: Self.cachedEditorLoopProofPayload())
            case "/agent_playhead_context", "/playhead_context", "/current_edit_context":
                self?.sendJSON(connection, object: Self.cachedAgentPlayheadContextPayload())
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
                let commandRequest = AgentCommandRequest(name: "playback", values: [
                    "mode": mode,
                    "action": action
                ])
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "playback_commanded",
                    "mode": mode,
                    "action": action,
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/seek":
                let time = request.query["time"] ?? request.query["seconds"] ?? "0"
                let commandRequest = AgentCommandRequest(name: "seek", values: ["time": time])
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "seek_commanded",
                    "time": time,
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/scrub":
                let time = request.query["time"] ?? request.query["seconds"] ?? "0"
                let commandRequest = AgentCommandRequest(name: "scrub", values: ["time": time])
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "scrub_commanded",
                    "time": time,
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/program_scroll":
                let delta = request.query["delta"] ?? request.query["seconds"] ?? "0"
                let commandRequest = AgentCommandRequest(name: "program_scroll", values: ["delta": delta])
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "program_scroll_commanded",
                    "delta": delta,
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
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
            case "/cut_recipe_next":
                self?.sendJSON(connection, object: Self.cachedNextCutRecipePayload(mode: request.query["mode"] ?? "any"))
            case "/decision_human_flow_next", "/human_flow_next":
                self?.sendJSON(connection, object: Self.cachedNextCutRecipePayload(mode: request.query["mode"] ?? "any"))
            case "/cut_recipe_queue":
                self?.sendJSON(connection, object: Self.cachedCutRecipeQueuePayload(
                    mode: request.query["mode"] ?? "any",
                    limit: request.query["limit"] ?? ""
                ))
            case "/decision_human_flow_queue", "/human_flow_queue":
                self?.sendJSON(connection, object: Self.cachedCutRecipeQueuePayload(
                    mode: request.query["mode"] ?? "any",
                    limit: request.query["limit"] ?? ""
                ))
            case "/cut_recipe_preview":
                guard let recipeId = request.query["id"], !recipeId.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_cut_recipe_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                self?.sendJSON(connection, object: Self.cachedCutRecipePreviewPayload(recipeId: recipeId))
            case "/cut_recipe_apply":
                guard let recipeId = request.query["id"], !recipeId.isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_cut_recipe_id"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                var values: [String: String] = ["id": recipeId]
                values["confirm"] = request.query["confirm"] ?? "false"
                let commandRequest = AgentCommandRequest(name: "cut_recipe_apply", values: values)
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "cut_recipe_apply_commanded",
                    "id": recipeId,
                    "confirm": values["confirm"] ?? "false",
                    "truth": "Queues a metadata-only Cut Intelligence recipe application. Re-read /state for handled execution proof.",
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/selected_decision_intent_note":
                let note = request.query["note"] ?? request.query["text"] ?? ""
                guard !note.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_selected_decision_intent_note"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                var values: [String: String] = [
                    "note": note,
                    "actor": request.query["actor"] ?? "Codex",
                    "actor_type": request.query["actor_type"] ?? request.query["actorType"] ?? "agent",
                    "category": request.query["category"] ?? "edit-intent-review"
                ]
                if let confidence = request.query["confidence"], !confidence.isEmpty {
                    values["confidence"] = confidence
                }
                let commandRequest = AgentCommandRequest(name: "selected_decision_intent_note", values: values)
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "selected_decision_intent_note_commanded",
                    "truth": "Queues a metadata-only note on the selected SHOW/SKIP decision intent. It does not mutate source media, timing, export, or publication state.",
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/selected_decision_intent_status":
                let status = request.query["status"] ?? request.query["state"] ?? ""
                guard !status.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
                    Task { @MainActor in
                        self?.sendJSON(connection, object: ["error": "missing_selected_decision_intent_status"], statusCode: 400, reason: "Bad Request")
                    }
                    return
                }
                let values: [String: String] = [
                    "status": status,
                    "actor": request.query["actor"] ?? "Codex",
                    "actor_type": request.query["actor_type"] ?? request.query["actorType"] ?? "agent",
                    "note": request.query["note"] ?? ""
                ]
                let commandRequest = AgentCommandRequest(name: "selected_decision_intent_status", values: values)
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "selected_decision_intent_status_commanded",
                    "reviewStatus": values["status"] ?? "",
                    "truth": "Queues a metadata-only review-state change on the selected SHOW/SKIP decision intent. It does not mutate source media, timing, export, or publication state.",
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/selected_decision_state_contract":
                self?.sendJSON(connection, object: Self.cachedSelectedDecisionStateContractPayload())
            case "/selected_decision_human_cut_guidance":
                self?.sendJSON(connection, object: Self.cachedSelectedDecisionHumanCutGuidancePayload())
            case "/selected_decision_review_trail":
                self?.sendJSON(connection, object: Self.cachedSelectedDecisionReviewTrailPayload())
            case "/selected_decision_intent_evidence", "/selected_decision_cut_intelligence", "/selected_decision_intelligence", "/selected_decision_human_flow", "/human_flow":
                self?.sendJSON(connection, object: Self.cachedSelectedDecisionIntentEvidencePayload())
            case "/human_flow_review_state", "/human_flow_sidecar_state":
                self?.sendJSON(connection, object: Self.humanFlowReviewSidecarStatusPayload())
            case "/episode4_cut_intelligence_state", "/episode4_control_room_state":
                self?.sendJSON(connection, object: Self.cachedEpisode4CutIntelligenceStatePayload())
            case "/episode4_proof_listen_next", "/episode4_next_proof":
                self?.sendJSON(connection, object: Self.cachedEpisode4ProofListenNextPayload())
            case "/episode4_proof_listen_command_preview", "/episode4_next_proof_command_preview":
                self?.sendJSON(connection, object: Self.cachedEpisode4ProofListenCommandPreviewPayload(query: request.query))
            case "/selected_short_quality":
                self?.sendJSON(connection, object: Self.cachedSelectedShortQualityPayload())
            case "/selected_short_human_review_guidance":
                self?.sendJSON(connection, object: Self.cachedSelectedShortHumanReviewGuidancePayload())
            case "/selected_short_production_brief", "/selected_short_start_here":
                self?.sendJSON(connection, object: Self.cachedSelectedShortProductionBriefPayload())
            case "/focus_monitors":
                let commandRequest = AgentCommandRequest(name: "focus_monitors")
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "focus_monitors_commanded",
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/focus_timeline":
                let commandRequest = AgentCommandRequest(name: "focus_timeline")
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "focus_timeline_commanded",
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/left_workbench":
                let mode = request.query["mode"] ?? "shorts"
                let commandRequest = AgentCommandRequest(
                    name: "left_workbench",
                    values: ["mode": mode]
                )
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "left_workbench_commanded",
                    "mode": mode,
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/cut_cadence_mode":
                let mode = request.query["mode"] ?? "warm-conversation"
                let commandRequest = AgentCommandRequest(
                    name: "cut_cadence_mode",
                    values: ["mode": mode]
                )
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "cut_cadence_mode_commanded",
                    "mode": mode,
                    "truth": "Changes the read-only Cut Intelligence analysis lens. It does not mutate media or edit decisions.",
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state"
                ])
            case "/native_account":
                let allowedKeys = [
                    "action",
                    "base_url",
                    "baseURL",
                    "url",
                    "email",
                    "user",
                    "password",
                    "clear_email",
                ]
                let values = allowedKeys.reduce(into: [String: String]()) { result, key in
                    if let value = request.query[key] {
                        result[key] = value
                    }
                }
                let commandRequest = AgentCommandRequest(name: "native_account", values: values)
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "native_account_commanded",
                    "action": values["action"] ?? "status",
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "observeNext": "GET /state",
                    "truth": "Native account commands are delivered to the mounted Account workbench. Sensitive command values are redacted from receipts; re-read /state.nativeAccount for proof."
                ])
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
            case "/clip_focus_layout":
                let format = request.query["format"] ?? "16:9"
                let placement = request.query["placement"] ?? "cornerSquares"
                let reactionSize = request.query["reaction_size"] ?? "0.24"
                let contentMode = request.query["content_mode"] ?? "fit"
                Task { @MainActor in
                    self?.enqueueCommand("clip_focus_layout", values: [
                        "format": format,
                        "placement": placement,
                        "reaction_size": reactionSize,
                        "content_mode": contentMode
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "clip_focus_layout_commanded",
                        "format": format,
                        "placement": placement,
                        "reaction_size": reactionSize,
                        "content_mode": contentMode,
                        "truth": "Changes layout metadata only. Source and proxy media remain untouched."
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
            case "/create_branch":
                Task { @MainActor in
                    let name = request.query["name"] ?? request.query["title"] ?? "Branch from current edit"
                    var values: [String: String] = [
                        "name": name,
                        "role": request.query["role"] ?? "experiment",
                        "purpose": request.query["purpose"] ?? "Safe metadata-only branch over the current synced source spine.",
                        "actor": request.query["actor"] ?? "Codex"
                    ]
                    if let status = request.query["status"], !status.isEmpty {
                        values["status"] = status
                    }
                    self?.enqueueCommand("create_branch", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "create_branch_commanded",
                        "name": name,
                        "role": values["role"] ?? "",
                        "truth": "Creates a new decision branch over intact synced source lanes. It does not copy media, publish, or overwrite the parent branch."
                    ])
                }
            case "/import_render_branch":
                Task { @MainActor in
                    let path = request.query["path"] ?? request.query["manifest"] ?? ""
                    let values: [String: String] = [
                        "path": path,
                        "actor": request.query["actor"] ?? "Codex producer"
                    ]
                    self?.enqueueCommand("import_render_branch", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "import_render_branch_commanded",
                        "path": path,
                        "truth": "Imports validated keep ranges, picture choices, and render provenance as a new editable branch over intact whole sources."
                    ])
                }
            case "/switch_branch":
                Task { @MainActor in
                    var values: [String: String] = [:]
                    for key in ["id", "name", "title", "role"] {
                        if let value = request.query[key], !value.isEmpty {
                            values[key] = value
                        }
                    }
                    self?.enqueueCommand("switch_branch", values: values)
                    self?.sendJSON(connection, object: [
                        "status": "switch_branch_commanded",
                        "id": values["id"] ?? "",
                        "name": values["name"] ?? values["title"] ?? "",
                        "role": values["role"] ?? "",
                        "truth": "Switches the active decision branch only. It does not mutate source media, overwrite branches, or copy publication receipts."
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
            case "/shorts_review_next_cut_risk":
                let mode = request.query["mode"] ?? "risk"
                Task { @MainActor in
                    self?.enqueueCommand("shorts_review_next_cut_risk", values: [
                        "mode": mode
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_review_next_cut_risk_commanded",
                        "mode": mode,
                        "truth": "Selects the next short whose existing Cut Intelligence evidence overlaps a risk or opportunity. It only navigates review focus; it does not approve, publish, move timeline decisions, or mutate source media."
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
            case "/shorts_edit_flow_scan":
                let concern = request.query["concern"] ?? ""
                let note = request.query["note"] ?? ""
                Task { @MainActor in
                    self?.enqueueCommand("shorts_edit_flow_scan", values: [
                        "concern": concern,
                        "note": note
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "shorts_edit_flow_scan_commanded",
                        "truth": "Appends selected-short technical edit-flow scan evidence. This is triage only: it is not a listen-through, not approval, and not publication."
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
                let commandRequest = AgentCommandRequest(name: "load_session", values: ["name": name])
                let pendingCount = self?.queueHTTPCommandForViewDrain(commandRequest) ?? Self.enqueueHTTPCommand(commandRequest)
                self?.sendJSON(connection, object: [
                    "status": "load_session_queued",
                    "name": name,
                    "commandReceipt": Self.queuedCommandReceipt(commandRequest, pendingCount: pendingCount),
                    "truth": "This confirms asynchronous command scheduling only. Re-read /state and require activeSessionName plus nonzero laneCount or sequenceDuration before treating the session as usable."
                ])
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
                        "proof_seconds": request.query["proof_seconds"] ?? "",
                        "formats": request.query["formats"] ?? ""
                    ])
                    self?.sendJSON(connection, object: [
                        "status": "release_prepare_commanded",
                        "directory": directory,
                        "basename": request.query["basename"] ?? "quipsly-release",
                        "proof_seconds": request.query["proof_seconds"] ?? "",
                        "formats": request.query["formats"] ?? ""
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
                } else {
                    self?.sendJSON(connection, object: ["status": "no_state_yet"])
                }
            case "/state_reconciled":
                if let cachedStatus = Self.cachedStatusResponseDataReconcilingProxyShortExport() {
                    print("AgentServer: sending reconciled cached response for /state_reconciled")
                    self?.sendJSONData(connection, bodyData: cachedStatus)
                } else {
                    self?.sendJSON(connection, object: ["status": "no_state_yet"])
                }
            case "/cut_craft_guidance":
                self?.sendJSON(connection, object: Self.cachedCutCraftGuidancePayload())
            case "/cut_technique_playbook":
                self?.sendJSON(connection, object: Self.cachedCutTechniquePlaybookPayload())
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

        return AgentHTTPRequest(
            method: parts[0],
            path: components?.path ?? target,
            query: query
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

    private nonisolated static func enqueueHTTPCommand(_ request: AgentCommandRequest) -> Int {
        httpCommandQueueLock.lock()
        httpCommandQueue.append(request)
        let count = httpCommandQueue.count
        httpCommandQueueLock.unlock()
        updateCachedStatusForQueuedHTTPCommand(request, pendingCount: count)
        DispatchQueue.main.async {
            NotificationCenter.default.post(name: .quipslyAgentCommandQueued, object: nil)
        }
        return count
    }

    private nonisolated func queueHTTPCommandForViewDrain(_ request: AgentCommandRequest) -> Int {
        let count = Self.enqueueHTTPCommand(request)
        Task { @MainActor in
            self.commandDispatchHandler?()
        }
        return count
    }

    private nonisolated static func updateCachedStatusForQueuedHTTPCommand(
        _ request: AgentCommandRequest,
        pendingCount: Int
    ) {
        guard var status = cachedStatusDictionary() else { return }
        status["agentPendingCommandCount"] = pendingCount
        status["agentLastCommandReceipt"] = [
            "id": request.id.uuidString,
            "name": request.name,
            "values": request.redactedValues,
            "status": "queued_for_view_drain",
            "mode": "http_ack_then_static_queue_drain",
            "pendingCommandCount": pendingCount,
            "truth": "Command is queued for the mounted editor view. Re-read /state after the editor drains it."
        ] as [String: Any]
        if request.name == "left_workbench" {
            status["leftWorkbenchRequestedMode"] = request.values["mode"] ?? ""
            status["lastMediaAction"] = "Queued Account/workbench command for editor delivery."
        }
        updateCachedStatusResponse(status)
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
            "values": request.redactedValues,
            "status": "scheduled_for_editor_main_actor",
            "mode": "http_ack_then_main_actor_delivery",
            "truth": "HTTP receipt means the command was scheduled for editor delivery. Re-read /state for execution, progress, and final artifact proof."
        ]
        Task { @MainActor in
            self.deliverScheduledHTTPCommand(request, scheduledReceipt: receipt)
        }
        return receipt
    }

    private nonisolated static func unavailableCommandReceipt(_ request: AgentCommandRequest) -> [String: Any] {
        [
            "id": request.id.uuidString,
            "name": request.name,
            "values": request.redactedValues,
            "status": "server_unavailable",
            "mode": "http_ack_failed",
            "truth": "The HTTP listener accepted the request path, but no AgentServer instance was available to schedule editor delivery."
        ]
    }

    private nonisolated static func queuedCommandReceipt(_ request: AgentCommandRequest, pendingCount: Int) -> [String: Any] {
        [
            "id": request.id.uuidString,
            "name": request.name,
            "values": request.redactedValues,
            "status": "queued_for_view_drain",
            "mode": "http_ack_then_static_queue_drain",
            "pendingCommandCount": pendingCount,
            "truth": "HTTP receipt means the command is queued for the mounted editor loop. Re-read /state for handled execution proof."
        ]
    }

    private nonisolated func dispatchHTTPCommandToMainQueue(_ request: AgentCommandRequest) -> [String: Any] {
        let receipt: [String: Any] = [
            "id": request.id.uuidString,
            "name": request.name,
            "values": request.redactedValues,
            "status": "scheduled_for_editor_main_queue",
            "mode": "http_ack_then_main_queue_delivery",
            "truth": "HTTP receipt means the command was scheduled onto the native app main queue. Re-read /state for handled execution proof."
        ]
        DispatchQueue.main.async { [weak self] in
            guard let self else { return }
            MainActor.assumeIsolated {
                self.deliverScheduledHTTPCommand(request, scheduledReceipt: receipt)
            }
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

    private nonisolated static func cachedStatusResponseDataReconcilingProxyShortExport() -> Data? {
        guard var status = cachedStatusDictionary() else {
            return cachedStatusResponseData()
        }
        guard let summary = proxyShortExportManifestSummary(forCachedStatus: status) else {
            return cachedStatusResponseData()
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
        return cachedStatusResponseData()
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
            let exportRanges = directProxyExportRangesForShortClip(clip, sequence: sequence)

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
            let hasSequenceStart = segment["sequenceStartTime"] != nil || segment["sequenceStart"] != nil
            let start = hasSequenceStart
                ? staticDoubleValue(segment["sequenceStartTime"] ?? segment["sequenceStart"])
                : cursor
            let sourceLocalStart = staticDoubleValue(segment["sourceLocalStartTime"] ?? segment["startTime"])
            return [
                "start": start,
                "sequenceStartTime": start,
                "sequenceEndTime": start + duration,
                "duration": duration,
                "sourceLocalStartTime": sourceLocalStart,
                "sourceLocalEndTime": sourceLocalStart + duration,
                "sourceLaneId": staticStringValue(segment["sourceLaneId"]),
                "sourceTagId": staticStringValue(segment["sourceTagId"])
            ] as [String: Any]
        }
        if !segmentRanges.isEmpty {
            return segmentRanges
        }
        let hasSequenceStart = clip["sequenceStartTime"] != nil || clip["sequenceStart"] != nil
        let start = hasSequenceStart
            ? staticDoubleValue(clip["sequenceStartTime"] ?? clip["sequenceStart"])
            : 0.0
        let sourceLocalStart = staticDoubleValue(clip["sourceLocalStartTime"] ?? clip["startTime"])
        let duration = max(0.1, staticDoubleValue(clip["duration"]))
        return [
            [
                "start": start,
                "sequenceStartTime": start,
                "sequenceEndTime": start + duration,
                "duration": duration,
                "sourceLocalStartTime": sourceLocalStart,
                "sourceLocalEndTime": sourceLocalStart + duration,
                "sourceLaneId": staticStringValue(clip["sourceLaneId"]),
                "sourceTagId": staticStringValue(clip["sourceTagId"])
            ] as [String: Any]
        ]
    }

    private nonisolated static func directProxyExportRangesForShortClip(
        _ clip: [String: Any],
        sequence: [String: Any]
    ) -> [[String: Any]] {
        let segments = clip["segments"] as? [[String: Any]] ?? []
        let materializedSegments = segments.isEmpty
            ? [[
                "title": staticStringValue(clip["title"]).isEmpty ? "Segment 1" : staticStringValue(clip["title"]),
                "startTime": clip["startTime"] ?? 0,
                "duration": clip["duration"] ?? 0,
                "sourceLaneId": clip["sourceLaneId"] ?? "",
                "sourceTagId": clip["sourceTagId"] ?? ""
            ] as [String: Any]]
            : segments

        let ranges = materializedSegments.compactMap { segment -> [String: Any]? in
            let duration = staticDoubleValue(segment["duration"])
            guard duration > 0 else { return nil }

            let sourceLaneId = staticStringValue(segment["sourceLaneId"]).isEmpty
                ? staticStringValue(clip["sourceLaneId"])
                : staticStringValue(segment["sourceLaneId"])
            let sourceTagId = staticStringValue(segment["sourceTagId"]).isEmpty
                ? staticStringValue(clip["sourceTagId"])
                : staticStringValue(segment["sourceTagId"])
            let sourceLocalStart = staticDoubleValue(segment["startTime"])
            let sourceLocalEnd = sourceLocalStart + duration
            let sequenceStart = max(0, sourceLocalStart + sourceOffsetForLaneId(sourceLaneId, in: sequence))
            let sequenceEnd = sequenceStart + duration

            return [
                "start": sequenceStart,
                "sequenceStartTime": sequenceStart,
                "sequenceEndTime": sequenceEnd,
                "duration": duration,
                "sourceLocalStartTime": sourceLocalStart,
                "sourceLocalEndTime": sourceLocalEnd,
                "sourceLaneId": sourceLaneId,
                "sourceTagId": sourceTagId,
                "title": staticStringValue(segment["title"])
            ] as [String: Any]
        }

        if !ranges.isEmpty {
            return ranges
        }

        let duration = max(0.1, staticDoubleValue(clip["duration"]))
        let sourceLaneId = staticStringValue(clip["sourceLaneId"])
        let sourceTagId = staticStringValue(clip["sourceTagId"])
        let sourceLocalStart = staticDoubleValue(clip["startTime"])
        let sequenceStart = max(0, sourceLocalStart + sourceOffsetForLaneId(sourceLaneId, in: sequence))

        return [[
            "start": sequenceStart,
            "sequenceStartTime": sequenceStart,
            "sequenceEndTime": sequenceStart + duration,
            "duration": duration,
            "sourceLocalStartTime": sourceLocalStart,
            "sourceLocalEndTime": sourceLocalStart + duration,
            "sourceLaneId": sourceLaneId,
            "sourceTagId": sourceTagId,
            "title": staticStringValue(clip["title"])
        ] as [String: Any]]
    }

    private nonisolated static func sourceOffsetForLaneId(_ sourceLaneId: String, in sequence: [String: Any]) -> Double {
        let trimmed = sourceLaneId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty,
              let lanes = sequence["lanes"] as? [[String: Any]],
              let lane = lanes.first(where: { staticStringValue($0["id"]) == trimmed }),
              let sourceVideo = lane["sourceVideo"] as? [String: Any] else {
            return 0
        }

        return staticDoubleValue(sourceVideo["offset"])
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
        guard var current = cachedStatusDictionary() else {
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
        var selectedProjection = selected
        selectedProjection["selectionStateSource"] = "agent-server-short-selection-read-model"
        selectedProjection["shortClipQueueCount"] = clips.count
        current["selectedShortClipId"] = id
        current["selectedShortClip"] = selectedProjection
        current["selectedShortProof"] = proof
        current["lastMediaAction"] = "Agent selected short: \(title.isEmpty ? id : title)"
        updateCachedStatusResponse(jsonSafeDictionary(current))

        return [
            "status": "projected",
            "id": id,
            "title": title,
            "shortClipQueueCount": clips.count,
            "selectedShortProof": proof,
            "selectionStateSource": "agent-server-short-selection-read-model",
            "truth": "The cached short queue projected selected-short truth immediately and updated the agent-visible selected-short read model. The live SwiftUI selection bridge will still catch up visually through the queued command."
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
        // JSON-safe dictionaries can be sanitized more than once before they are
        // cached. On the second pass Swift numbers are boxed as NSNumber, and an
        // NSNumber(0) can bridge through `as Bool` as false. Classify NSNumber by
        // its Core Foundation type first so numeric proof counts stay numeric.
        case let number as NSNumber:
            if CFGetTypeID(number) == CFBooleanGetTypeID() {
                return number.boolValue
            }
            return number.doubleValue.isFinite ? number : NSNull()
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

    private nonisolated static func humanFlowReviewSidecarStatusPayload() -> [String: Any] {
        let root = FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Movies")
            .appendingPathComponent("QuipslyExports")
            .appendingPathComponent("human-flow-review")
        let sessionsRoot = root.appendingPathComponent("sessions")
        let board = root.appendingPathComponent("human-flow-cut-review-board.json")
        let latestSession = humanFlowReviewLatestSessionURL(sessionsRoot)
        let session = latestSession?.appendingPathComponent("review-session.json")
        let decisions = latestSession?.appendingPathComponent("review-decisions.jsonl")
        let promotionPlan = latestSession?.appendingPathComponent("review-promotion-plan.json")
        let approvals = latestSession?.appendingPathComponent("review-promotion-approvals.jsonl")
        let approvedPatchPacket = latestSession?.appendingPathComponent("review-approved-patch-packet.json")
        let startHere = root.appendingPathComponent("human-flow-cut-review-board-start-here.html")
        let runbook = URL(fileURLWithPath: "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/docs/human-flow-cut-review-runbook.md")

        let sessionJSON = session.flatMap { humanFlowReviewJSON($0) } ?? [:]
        let promotionJSON = promotionPlan.flatMap { humanFlowReviewJSON($0) } ?? [:]
        let approvedPatchJSON = approvedPatchPacket.flatMap { humanFlowReviewJSON($0) } ?? [:]
        let receiptCount = humanFlowReviewReceiptCount(sessionJSON)
        let decisionCount = decisions.map { humanFlowReviewJSONLCount($0) } ?? 0
        let promotionActionCount = humanFlowReviewInt(promotionJSON["actionCount"])
        let approvalCount = approvals.map { humanFlowReviewJSONLCount($0) } ?? 0
        let approvedPatchCount = humanFlowReviewInt(approvedPatchJSON["approvedPatchCount"])

        let nextSafeCommand: String
        let nextSafePurpose: String
        if !FileManager.default.fileExists(atPath: board.path) {
            nextSafeCommand = "script/agentctl.sh human-flow-review-workbench"
            nextSafePurpose = "Generate the current board, timestamped review session, and Start Here dashboard from the live app endpoint."
        } else if latestSession == nil {
            nextSafeCommand = "script/agentctl.sh human-flow-review-session"
            nextSafePurpose = "Turn the current board into timestamped review receipts."
        } else if decisionCount == 0 {
            nextSafeCommand = "script/agentctl.sh human-flow-review-decision latest <boundary-id> \"Keep the cadence\" Mako \"normal-speed review note\""
            nextSafePurpose = "Record sidecar review decisions after listening/watching candidate boundaries."
        } else if promotionActionCount == 0 {
            nextSafeCommand = "script/agentctl.sh human-flow-review-promotion-plan"
            nextSafePurpose = "Map review decisions into proposed metadata patches without applying them."
        } else if approvalCount == 0 {
            nextSafeCommand = "script/agentctl.sh human-flow-review-approval latest <action-ref> approve Mako \"approved after review\""
            nextSafePurpose = "Approve, reject, or hold proposed metadata actions as sidecar evidence."
        } else if approvedPatchCount == 0 {
            nextSafeCommand = "script/agentctl.sh human-flow-approved-patch-packet"
            nextSafePurpose = "Gather approved proposed metadata patches into a dry-run packet."
        } else {
            nextSafeCommand = "Inspect the approved patch packet before designing any explicit apply command."
            nextSafePurpose = "The sidecar review ladder has approved dry-run patches, but no timeline metadata should change without a future explicit apply path."
        }

        return [
            "status": "ok",
            "model": "quipslystudio-human-flow-review-sidecar-state",
            "version": "2026-06-30.human-flow-review-state.v1",
            "root": root.path,
            "sessionId": sessionJSON["sessionId"] ?? latestSession?.lastPathComponent ?? "",
            "counts": [
                "receipts": receiptCount,
                "decisions": decisionCount,
                "promotionActions": promotionActionCount,
                "approvals": approvalCount,
                "approvedPatches": approvedPatchCount
            ],
            "artifacts": [
                "board": humanFlowReviewFileStatus(board),
                "latestSession": latestSession.map { humanFlowReviewFileStatus($0) } ?? ["exists": false, "path": ""],
                "session": session.map { humanFlowReviewFileStatus($0) } ?? ["exists": false, "path": ""],
                "decisions": decisions.map { humanFlowReviewFileStatus($0) } ?? ["exists": false, "path": ""],
                "promotionPlan": promotionPlan.map { humanFlowReviewFileStatus($0) } ?? ["exists": false, "path": ""],
                "approvals": approvals.map { humanFlowReviewFileStatus($0) } ?? ["exists": false, "path": ""],
                "approvedPatchPacket": approvedPatchPacket.map { humanFlowReviewFileStatus($0) } ?? ["exists": false, "path": ""],
                "startHere": humanFlowReviewFileStatus(startHere),
                "runbook": humanFlowReviewFileStatus(runbook)
            ],
            "commands": [
                "startHere": "script/agentctl.sh human-flow-start-here",
                "pipelineCheck": "script/agentctl.sh human-flow-pipeline-check",
                "workbench": "script/agentctl.sh human-flow-review-workbench",
                "decision": "script/agentctl.sh human-flow-review-decision latest <boundary-id> \"Keep the cadence\" Mako \"normal-speed review note\"",
                "promotionPlan": "script/agentctl.sh human-flow-review-promotion-plan",
                "approval": "script/agentctl.sh human-flow-review-approval latest <action-ref> approve Mako \"approved after review\"",
                "approvedPatchPacket": "script/agentctl.sh human-flow-approved-patch-packet",
                "smoke": "script/agentctl.sh human-flow-smoke",
                "runbook": "script/agentctl.sh human-flow-runbook"
            ],
            "nextSafeCommand": nextSafeCommand,
            "nextSafePurpose": nextSafePurpose,
            "proofBoundary": "This endpoint reads sidecar artifacts only. It does not prove Episode 4 is synced, edited, exported, published, or ready for approval.",
            "truth": "Human-flow sidecar state is review evidence around whole-source edit metadata. It is not source media truth, timeline mutation truth, export truth, or publication truth."
        ]
    }

    private nonisolated static func humanFlowReviewFileStatus(_ url: URL) -> [String: Any] {
        let exists = FileManager.default.fileExists(atPath: url.path)
        let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
        return [
            "path": url.path,
            "exists": exists,
            "sizeBytes": exists ? size : 0
        ]
    }

    private nonisolated static func humanFlowReviewLatestSessionURL(_ sessionsRoot: URL) -> URL? {
        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: sessionsRoot,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else { return nil }
        return urls
            .filter { FileManager.default.fileExists(atPath: $0.appendingPathComponent("review-session.json").path) }
            .sorted { humanFlowReviewModifiedDate($0) > humanFlowReviewModifiedDate($1) }
            .first
    }

    private nonisolated static func humanFlowReviewModifiedDate(_ url: URL) -> Date {
        (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
    }

    private nonisolated static func humanFlowReviewJSON(_ url: URL) -> [String: Any] {
        guard
            let data = try? Data(contentsOf: url),
            let object = try? JSONSerialization.jsonObject(with: data),
            let dictionary = object as? [String: Any]
        else { return [:] }
        return dictionary
    }

    private nonisolated static func humanFlowReviewReceiptCount(_ json: [String: Any]) -> Int {
        if let value = json["receiptCount"] {
            return humanFlowReviewInt(value)
        }
        if let receipts = json["receipts"] as? [Any] {
            return receipts.count
        }
        return 0
    }

    private nonisolated static func humanFlowReviewJSONLCount(_ url: URL) -> Int {
        guard let text = try? String(contentsOf: url, encoding: .utf8) else { return 0 }
        return text
            .split(separator: "\n", omittingEmptySubsequences: true)
            .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            .count
    }

    private nonisolated static func humanFlowReviewInt(_ value: Any?) -> Int {
        if let value = value as? Int { return value }
        if let value = value as? Double { return Int(value) }
        if let value = value as? NSNumber { return value.intValue }
        if let value = value as? String { return Int(value) ?? 0 }
        return 0
    }

    private nonisolated static let episode4StartHerePointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-start-here/latest-episode4-start-here.json"
    private nonisolated static let episode4ApplyPreviewPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-apply-preview/latest-episode4-apply-preview.json"
    private nonisolated static let episode4YoutubeRecipeReviewPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-youtube-standard-recipe-review/latest-episode4-youtube-standard-recipe-review-ledger.json"
    private nonisolated static let episode4RecipeProofListenNextPointerPath = "/Volumes/My Passport/Episode_and_Shorts_Test/review-board/episode4-recipe-proof-listen-queue/latest-episode4-recipe-proof-listen-next.json"
    private nonisolated static let episode4SourceClipDropPath = "/Volumes/My Passport/Episode_and_Shorts_Test/Episode_04_Watched_Source_Clip_Dropbox/needs-human-identification"

    private nonisolated static func cachedEpisode4CutIntelligenceStatePayload() -> [String: Any] {
        return [
            "status": "episode4_cut_intelligence_state_bridge",
            "episode": "episode-4",
            "truth": [
                "readOnly": true,
                "clipsImported": false,
                "timelineDecisionsWritten": false,
                "exportsRendered": false,
                "externalPublishing": false,
                "sourceFilesMutated": false,
                "versionsOverwritten": false,
                "sourceClipIntakeIsEvidenceGate": true
            ],
            "paths": [
                "startHerePointerPath": episode4StartHerePointerPath,
                "applyPreviewPointerPath": episode4ApplyPreviewPointerPath,
                "sourceClipDropPath": episode4SourceClipDropPath
            ],
            "whyBridgeOnly": "The live app exposes canonical Episode 4 control-room paths without synchronously reading external-drive artifacts from the HTTP server. Use `script/agentctl.sh episode4-cut-intelligence-state` for filesystem-enriched state.",
            "agentNextActions": [
                "Use `script/agentctl.sh episode4-cut-intelligence-state` to read the enriched control-room state from the CLI.",
                "If source clip dropbox is empty, ask for or locate watched/source clips rather than inventing them.",
                "After files are dropped, run `script/agentctl.sh episode4-source-clip-intake` then `script/agentctl.sh episode4-apply-preview`.",
                "Only convert reviewed operations into metadata branches after source intake confirms the media."
            ]
        ]
    }

    private nonisolated static func cachedEpisode4ProofListenNextPayload() -> [String: Any] {
        let pointerURL = URL(fileURLWithPath: episode4RecipeProofListenNextPointerPath)
        let pointer = humanFlowReviewJSON(pointerURL)
        let payload = episode4LoadPointedPayload(pointer: pointer)
        let recipeReviewPointer = humanFlowReviewJSON(URL(fileURLWithPath: episode4YoutubeRecipeReviewPointerPath))
        let recipeReviewPayload = episode4LoadPointedPayload(pointer: recipeReviewPointer)
        let recipeReviewCounts = episode4Dictionary(recipeReviewPayload["counts"]).isEmpty
            ? episode4Dictionary(recipeReviewPointer["counts"])
            : episode4Dictionary(recipeReviewPayload["counts"])
        let recipeReviewDecisionCounts = episode4Dictionary(recipeReviewCounts["decisionCounts"])
        let item = episode4Dictionary(payload["item"])
        let audioClip = episode4Dictionary(item["audioReviewClip"])
        let uiContract = episode4Dictionary(payload["uiContract"])
        let safety = episode4Dictionary(uiContract["safety"])
        let primaryAction = episode4Dictionary(uiContract["primaryAction"])
        let secondaryActions = episode4Array(uiContract["secondaryActions"])
        let htmlPath = episode4String(payload["htmlPath"]) ?? episode4String(pointer["htmlPath"]) ?? ""
        let markdownPath = episode4String(payload["markdownPath"]) ?? episode4String(pointer["markdownPath"]) ?? ""
        let jsonPath = episode4String(payload["jsonPath"]) ?? episode4String(pointer["jsonPath"]) ?? ""
        let queueHtmlPath = episode4String(payload["queueHtmlPath"]) ?? episode4String(pointer["queueHtmlPath"]) ?? ""
        let queueJsonPath = episode4String(payload["queueJsonPath"]) ?? episode4String(pointer["queueJsonPath"]) ?? ""
        let audioPath = episode4String(audioClip["path"]) ?? episode4String(episode4Dictionary(uiContract["bindsTo"])["audioReviewClipPath"]) ?? ""
        let listenChecks = episode4StringArray(item["firstListenFor"])
        let visualChecks = episode4StringArray(item["firstVisualCheck"])
        let proofCounts = episode4Dictionary(payload["counts"])
        let proofByDecision = episode4Dictionary(proofCounts["byDecision"])
        let reviewerPrompt = episode4ProofListenReviewerPrompt(
            operationId: episode4String(item["operationId"]) ?? episode4String(payload["operationId"]) ?? episode4String(pointer["operationId"]) ?? "",
            sequenceLabel: episode4String(item["sequenceLabel"]) ?? "",
            reviewMode: episode4String(item["reviewMode"]) ?? "",
            suggestedDecision: episode4String(item["suggestedDecision"]) ?? episode4String(payload["suggestedDecision"]) ?? episode4String(pointer["suggestedDecision"]) ?? "",
            audioPath: audioPath,
            proofQuestion: episode4String(item["proofQuestion"]) ?? "",
            whyFirst: episode4String(item["whyFirst"]) ?? "",
            listenChecks: listenChecks,
            visualChecks: visualChecks
        )
        let reviewEvidenceGuidance = episode4ProofListenEvidenceGuidance(
            events: Int(episode4Double(recipeReviewCounts["events"])),
            pending: Int(episode4Double(recipeReviewDecisionCounts["pending"])),
            needsListen: Int(episode4Double(recipeReviewDecisionCounts["needs-listen"])),
            needsSource: Int(episode4Double(recipeReviewDecisionCounts["needs-source"]))
        )
        let cutCraftRubric = episode4ProofListenCutCraftRubric(
            operationKind: episode4String(item["operationKind"]) ?? episode4String(payload["operationKind"]) ?? "",
            risk: episode4String(item["risk"]) ?? ""
        )
        let decisionGuidance = episode4ProofListenDecisionGuidanceMap()
        let evidenceRequirements = episode4ProofListenEvidenceRequirementMap()
        let reviewPacket = episode4ProofListenReviewPacket(
            operationId: episode4String(item["operationId"]) ?? episode4String(payload["operationId"]) ?? episode4String(pointer["operationId"]) ?? "",
            sequenceLabel: episode4String(item["sequenceLabel"]) ?? "",
            operationKind: episode4String(item["operationKind"]) ?? episode4String(payload["operationKind"]) ?? "",
            reviewMode: episode4String(item["reviewMode"]) ?? "",
            suggestedDecision: episode4String(item["suggestedDecision"]) ?? episode4String(payload["suggestedDecision"]) ?? episode4String(pointer["suggestedDecision"]) ?? "",
            currentDecision: episode4String(item["currentDecision"]) ?? "",
            risk: episode4String(item["risk"]) ?? "",
            audioPath: audioPath,
            proofQuestion: episode4String(item["proofQuestion"]) ?? "",
            whyFirst: episode4String(item["whyFirst"]) ?? "",
            listenChecks: listenChecks,
            visualChecks: visualChecks,
            operations: Int(episode4Double(recipeReviewCounts["operations"])),
            reviewed: Int(episode4Double(recipeReviewCounts["reviewed"])),
            reviewNeeded: Int(episode4Double(recipeReviewCounts["reviewNeeded"])),
            events: Int(episode4Double(recipeReviewCounts["events"])),
            pending: Int(episode4Double(recipeReviewDecisionCounts["pending"])),
            needsListen: Int(episode4Double(recipeReviewDecisionCounts["needs-listen"])),
            needsSource: Int(episode4Double(recipeReviewDecisionCounts["needs-source"])),
            evidenceGuidance: reviewEvidenceGuidance,
            cutCraftRubric: cutCraftRubric,
            decisionGuidance: decisionGuidance,
            evidenceRequirements: evidenceRequirements
        )
        let defaultDecision = episode4Trimmed(
            episode4String(item["suggestedDecision"]) ?? episode4String(payload["suggestedDecision"]) ?? episode4String(pointer["suggestedDecision"]),
            defaultValue: "needs-listen"
        )
        let defaultRange = episode4Trimmed(episode4String(item["sequenceLabel"]), defaultValue: "current proof window")
        let defaultRisk = episode4Trimmed(episode4String(item["risk"]), defaultValue: "human-feeling cadence")
        let defaultSummaryNote = "Proof-listened \(defaultRange): review \(defaultRisk) before metadata promotion."
        let defaultAudioNote = episode4Trimmed(listenChecks.first, defaultValue: "Add what the ear proved.")
        let defaultVisualNote = episode4Trimmed(visualChecks.first, defaultValue: "Add what the picture proved.")
        let defaultCadenceNote = episode4Trimmed(episode4String(item["proofQuestion"]), defaultValue: "Preserve human rhythm unless the evidence says to tighten.")
        let defaultMissingEvidenceWarnings = episode4ProofListenMissingEvidenceWarnings(
            decision: defaultDecision,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote
        )
        let defaultEvidenceStrength = episode4ProofListenEvidenceStrength(
            missingWarnings: defaultMissingEvidenceWarnings,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote
        )
        let defaultNextSafeAction = episode4ProofListenNextSafeAction(
            decision: defaultDecision,
            missingWarnings: defaultMissingEvidenceWarnings
        )
        let defaultPromotionReadiness = episode4ProofListenPromotionReadiness(
            decision: defaultDecision,
            missingWarnings: defaultMissingEvidenceWarnings
        )
        let defaultApplyPreviewCandidate = episode4ProofListenApplyPreviewCandidate(
            decision: defaultDecision,
            missingWarnings: defaultMissingEvidenceWarnings,
            promotionReadiness: defaultPromotionReadiness
        )
        let defaultQueueTriage = episode4ProofListenQueueTriage(
            decision: defaultDecision,
            missingWarnings: defaultMissingEvidenceWarnings
        )
        let defaultCutCraftIntent = episode4ProofListenCutCraftIntent(
            decision: defaultDecision,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote,
            missingWarnings: defaultMissingEvidenceWarnings
        )
        let defaultCutCraftReviewBrief = episode4ProofListenCutCraftReviewBrief(
            decision: defaultDecision,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote,
            missingWarnings: defaultMissingEvidenceWarnings,
            evidenceStrength: defaultEvidenceStrength,
            queueTriage: defaultQueueTriage,
            cutCraftIntent: defaultCutCraftIntent
        )
        let defaultApplyPreviewWorkOrder = episode4ProofListenApplyPreviewWorkOrder(
            operationId: episode4String(item["operationId"]) ?? episode4String(payload["operationId"]) ?? episode4String(pointer["operationId"]) ?? "",
            sequenceLabel: defaultRange,
            decision: defaultDecision,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote,
            missingWarnings: defaultMissingEvidenceWarnings,
            evidenceStrength: defaultEvidenceStrength,
            queueTriage: defaultQueueTriage,
            cutCraftIntent: defaultCutCraftIntent,
            promotionReadiness: defaultPromotionReadiness
        )
        let defaultApplyPreviewCandidatePayload = episode4ProofListenApplyPreviewCandidatePayload(
            operationId: episode4String(item["operationId"]) ?? episode4String(payload["operationId"]) ?? episode4String(pointer["operationId"]) ?? "",
            sequenceLabel: defaultRange,
            decision: defaultDecision,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote,
            missingWarnings: defaultMissingEvidenceWarnings,
            evidenceStrength: defaultEvidenceStrength,
            queueTriage: defaultQueueTriage,
            cutCraftIntent: defaultCutCraftIntent,
            promotionReadiness: defaultPromotionReadiness
        )
        let defaultApplyPreviewPatchPlan = episode4ProofListenApplyPreviewPatchPlan(
            candidatePayload: defaultApplyPreviewCandidatePayload,
            queueTriage: defaultQueueTriage,
            cutCraftIntent: defaultCutCraftIntent,
            promotionReadiness: defaultPromotionReadiness
        )
        let defaultApplyPreviewApprovalChecklist = episode4ProofListenApplyPreviewApprovalChecklist(
            candidatePayload: defaultApplyPreviewCandidatePayload,
            patchPlan: defaultApplyPreviewPatchPlan,
            missingWarnings: defaultMissingEvidenceWarnings
        )
        let defaultApplyPreviewApprovalReceiptTemplate = episode4ProofListenApplyPreviewApprovalReceiptTemplate(
            candidatePayload: defaultApplyPreviewCandidatePayload,
            patchPlan: defaultApplyPreviewPatchPlan,
            checklist: defaultApplyPreviewApprovalChecklist
        )
        let defaultApplyPreviewPromotionProposal = episode4ProofListenApplyPreviewPromotionProposal(
            candidatePayload: defaultApplyPreviewCandidatePayload,
            patchPlan: defaultApplyPreviewPatchPlan,
            checklist: defaultApplyPreviewApprovalChecklist,
            receiptTemplate: defaultApplyPreviewApprovalReceiptTemplate
        )
        let defaultApplyPreviewPromotionReadinessBoard = episode4ProofListenApplyPreviewPromotionReadinessBoard(
            candidatePayload: defaultApplyPreviewCandidatePayload,
            patchPlan: defaultApplyPreviewPatchPlan,
            checklist: defaultApplyPreviewApprovalChecklist,
            receiptTemplate: defaultApplyPreviewApprovalReceiptTemplate,
            promotionProposal: defaultApplyPreviewPromotionProposal
        )
        let defaultSourceRecoveryBrief = episode4ProofListenSourceRecoveryBrief(
            operationId: episode4String(item["operationId"]) ?? episode4String(payload["operationId"]) ?? episode4String(pointer["operationId"]) ?? "",
            sequenceLabel: defaultRange,
            decision: defaultDecision,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote,
            missingWarnings: defaultMissingEvidenceWarnings,
            nextSafeAction: defaultNextSafeAction,
            promotionReadiness: defaultPromotionReadiness
        )
        let defaultVisualReviewBrief = episode4ProofListenVisualReviewBrief(
            operationId: episode4String(item["operationId"]) ?? episode4String(payload["operationId"]) ?? episode4String(pointer["operationId"]) ?? "",
            sequenceLabel: defaultRange,
            decision: defaultDecision,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote,
            missingWarnings: defaultMissingEvidenceWarnings,
            nextSafeAction: defaultNextSafeAction,
            promotionReadiness: defaultPromotionReadiness
        )
        let defaultDecisionOutcomeBrief = episode4ProofListenDecisionOutcomeBrief(
            operationId: episode4String(item["operationId"]) ?? episode4String(payload["operationId"]) ?? episode4String(pointer["operationId"]) ?? "",
            sequenceLabel: defaultRange,
            decision: defaultDecision,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote,
            missingWarnings: defaultMissingEvidenceWarnings,
            evidenceStrength: defaultEvidenceStrength,
            nextSafeAction: defaultNextSafeAction,
            promotionReadiness: defaultPromotionReadiness
        )
        let defaultApplyPreviewBrief = episode4ProofListenApplyPreviewBrief(
            operationId: episode4String(item["operationId"]) ?? episode4String(payload["operationId"]) ?? episode4String(pointer["operationId"]) ?? "",
            sequenceLabel: defaultRange,
            decision: defaultDecision,
            summary: defaultSummaryNote,
            audio: defaultAudioNote,
            visual: defaultVisualNote,
            cadence: defaultCadenceNote,
            missingWarnings: defaultMissingEvidenceWarnings,
            evidenceStrength: defaultEvidenceStrength,
            nextSafeAction: defaultNextSafeAction,
            promotionReadiness: defaultPromotionReadiness
        )
        let defaultDryRunCommand = episode4ProofListenDecisionCommand(
            commandName: "episode4-recipe-proof-listen-next-decision-dry-run",
            decision: defaultDecision,
            reviewer: "Codex",
            notes: defaultSummaryNote,
            audioNote: defaultAudioNote,
            visualNote: defaultVisualNote,
            cadenceNote: defaultCadenceNote
        )
        let defaultRecordCommand = episode4ProofListenDecisionCommand(
            commandName: "episode4-recipe-proof-listen-next-decision",
            decision: defaultDecision,
            reviewer: "Codex",
            notes: defaultSummaryNote,
            audioNote: defaultAudioNote,
            visualNote: defaultVisualNote,
            cadenceNote: defaultCadenceNote
        )

        let nextPayload: [String: Any] = [
            "operationId": episode4String(item["operationId"]) ?? episode4String(payload["operationId"]) ?? episode4String(pointer["operationId"]) ?? "",
            "operationKind": episode4String(item["operationKind"]) ?? episode4String(payload["operationKind"]) ?? "",
            "reviewMode": episode4String(item["reviewMode"]) ?? "",
            "sequenceLabel": episode4String(item["sequenceLabel"]) ?? "",
            "sequenceStartSeconds": episode4Double(item["sequenceStartSeconds"]),
            "sequenceEndSeconds": episode4Double(item["sequenceEndSeconds"]),
            "suggestedDecision": episode4String(item["suggestedDecision"]) ?? episode4String(payload["suggestedDecision"]) ?? episode4String(pointer["suggestedDecision"]) ?? "",
            "currentDecision": episode4String(item["currentDecision"]) ?? "",
            "risk": episode4String(item["risk"]) ?? "",
            "proofQuestion": episode4String(item["proofQuestion"]) ?? "",
            "whyFirst": episode4String(item["whyFirst"]) ?? "",
            "firstListenFor": listenChecks,
            "firstVisualCheck": visualChecks
        ]

        let reviewDefaultsPayload: [String: Any] = [
            "decision": defaultDecision,
            "reviewer": "Codex",
            "cutCraftRubric": cutCraftRubric,
            "decisionGuidance": decisionGuidance,
            "evidenceRequirements": evidenceRequirements,
            "selectedEvidenceRequirements": evidenceRequirements[defaultDecision] ?? [],
            "missingEvidenceWarnings": defaultMissingEvidenceWarnings,
            "reviewCompleteness": defaultMissingEvidenceWarnings.isEmpty ? "evidence-ready" : "needs-stronger-evidence",
            "evidenceStrength": defaultEvidenceStrength,
            "nextSafeAction": defaultNextSafeAction,
            "promotionReadiness": defaultPromotionReadiness,
            "applyPreviewCandidate": defaultApplyPreviewCandidate,
            "queueTriage": defaultQueueTriage,
            "cutCraftIntent": defaultCutCraftIntent,
            "cutCraftReviewBrief": defaultCutCraftReviewBrief,
            "applyPreviewWorkOrder": defaultApplyPreviewWorkOrder,
            "applyPreviewCandidatePayload": defaultApplyPreviewCandidatePayload,
            "applyPreviewPatchPlan": defaultApplyPreviewPatchPlan,
            "applyPreviewApprovalChecklist": defaultApplyPreviewApprovalChecklist,
            "applyPreviewApprovalReceiptTemplate": defaultApplyPreviewApprovalReceiptTemplate,
            "applyPreviewPromotionProposal": defaultApplyPreviewPromotionProposal,
            "applyPreviewPromotionReadinessBoard": defaultApplyPreviewPromotionReadinessBoard,
            "canCreateApplyPreviewBrief": (defaultPromotionReadiness["canCreateApplyPreview"] as? Bool) ?? false,
            "applyPreviewBrief": defaultApplyPreviewBrief,
            "canCreateSourceRecoveryBrief": defaultDecision == "needs-source",
            "sourceRecoveryBrief": defaultSourceRecoveryBrief,
            "canCreateVisualReviewBrief": defaultDecision == "needs-visual-review",
            "visualReviewBrief": defaultVisualReviewBrief,
            "canCreateDecisionOutcomeBrief": ["reject", "hold", "needs-listen"].contains(defaultDecision),
            "decisionOutcomeBrief": defaultDecisionOutcomeBrief,
            "recordCommandRecommended": defaultMissingEvidenceWarnings.isEmpty,
            "recordingRecommendation": defaultMissingEvidenceWarnings.isEmpty
                ? "Dry-run first, then record only if the proof-listen result still matches."
                : "Do not record yet. Strengthen the review evidence until missingEvidenceWarnings is empty; dry-run remains safe.",
            "notes": [
                "summary": defaultSummaryNote,
                "audio": defaultAudioNote,
                "visual": defaultVisualNote,
                "cadence": defaultCadenceNote
            ] as [String: Any],
            "commands": [
                "dryRun": defaultDryRunCommand,
                "record": defaultRecordCommand
            ] as [String: Any],
            "recommendedFirstAction": "Inspect or run the dry-run command first. Record only after proof-listening the audio and visual evidence.",
            "writesWhenCopied": "none",
            "writesWhenDryRunCommandIsExecuted": "none",
            "writesWhenRecordCommandIsExecuted": "sidecar-review-ledger-only"
        ]

        return [
            "status": episode4String(payload["status"]) ?? episode4String(pointer["status"]) ?? "missing",
            "episode": "episode-4",
            "endpoint": "/episode4_proof_listen_next",
            "proofLane": "host-spine",
            "next": nextPayload,
            "reviewerPrompt": reviewerPrompt,
            "reviewPacket": reviewPacket,
            "cutCraftRubric": cutCraftRubric,
            "decisionGuidance": decisionGuidance,
            "evidenceRequirements": evidenceRequirements,
            "reviewDefaults": reviewDefaultsPayload,
            "reviewCoverage": [
                "tasks": Int(episode4Double(proofCounts["tasks"])),
                "reviewNeeded": Int(episode4Double(proofCounts["reviewNeeded"])),
                "hostSpineReviewableNow": Int(episode4Double(proofCounts["hostSpineReviewableNow"])),
                "hostSpineListenFirst": Int(episode4Double(proofCounts["hostSpineListenFirst"])),
                "hostSpineVisualReview": Int(episode4Double(proofCounts["hostSpineVisualReview"])),
                "pending": Int(episode4Double(proofByDecision["pending"])),
                "needsListen": Int(episode4Double(proofByDecision["needs-listen"])),
                "needsSource": Int(episode4Double(proofByDecision["needs-source"])),
                "guidance": episode4ProofListenCoverageGuidance(
                    tasks: Int(episode4Double(proofCounts["tasks"])),
                    reviewNeeded: Int(episode4Double(proofCounts["reviewNeeded"])),
                    pending: Int(episode4Double(proofByDecision["pending"])),
                    needsListen: Int(episode4Double(proofByDecision["needs-listen"])),
                    needsSource: Int(episode4Double(proofByDecision["needs-source"]))
                )
            ],
            "reviewEvidence": [
                "ledgerPath": episode4String(recipeReviewPayload["ledgerPath"]) ?? episode4String(recipeReviewPointer["ledgerPath"]) ?? "",
                "events": Int(episode4Double(recipeReviewCounts["events"])),
                "operations": Int(episode4Double(recipeReviewCounts["operations"])),
                "reviewed": Int(episode4Double(recipeReviewCounts["reviewed"])),
                "reviewNeeded": Int(episode4Double(recipeReviewCounts["reviewNeeded"])),
                "pending": Int(episode4Double(recipeReviewDecisionCounts["pending"])),
                "needsListen": Int(episode4Double(recipeReviewDecisionCounts["needs-listen"])),
                "needsSource": Int(episode4Double(recipeReviewDecisionCounts["needs-source"])),
                "guidance": reviewEvidenceGuidance
            ],
            "reviewNoteComposer": [
                "decisionOptions": [
                    "needs-listen",
                    "refine",
                    "keep",
                    "reject",
                    "hold",
                    "needs-source",
                    "needs-visual-review"
                ],
                "recommendedFirstAction": "copy-dry-run-before-record",
                "dryRunCommandTemplate": "script/agentctl.sh episode4-recipe-proof-listen-next-decision-dry-run <decision> <reviewer> <notes> --audio-note <audio evidence> --visual-note <visual evidence> --cadence-note <cadence evidence> --markdown",
                "recordCommandTemplate": "script/agentctl.sh episode4-recipe-proof-listen-next-decision <decision> <reviewer> <notes> --audio-note <audio evidence> --visual-note <visual evidence> --cadence-note <cadence evidence> --markdown",
                "fieldGuidance": [
                    "notes": "One plain-English summary of the review decision.",
                    "audioNote": "What the ear proved: cadence, breath, pause, restart, or over-cleaning risk.",
                    "visualNote": "What the picture proved: reaction cover, jump cut, angle, or source need.",
                    "cadenceNote": "What Quipsly should preserve or tighten before any metadata promotion."
                ],
                "writesWhenCopied": "none",
                "writesWhenDryRunCommandIsExecuted": "none",
                "writesWhenRecordCommandIsExecuted": "sidecar-review-ledger-only"
            ],
            "audioReviewClip": [
                "path": audioPath,
                "exists": FileManager.default.fileExists(atPath: audioPath),
                "durationSeconds": episode4Double(audioClip["durationSeconds"]),
                "startSeconds": episode4Double(audioClip["startSeconds"]),
                "sourceAudioPath": episode4String(audioClip["sourceAudioPath"]) ?? ""
            ],
            "paths": [
                "pointerPath": episode4RecipeProofListenNextPointerPath,
                "pointer": humanFlowReviewFileStatus(pointerURL),
                "htmlPath": htmlPath,
                "html": htmlPath.isEmpty ? ["exists": false, "path": ""] : humanFlowReviewFileStatus(URL(fileURLWithPath: htmlPath)),
                "markdownPath": markdownPath,
                "markdown": markdownPath.isEmpty ? ["exists": false, "path": ""] : humanFlowReviewFileStatus(URL(fileURLWithPath: markdownPath)),
                "jsonPath": jsonPath,
                "json": jsonPath.isEmpty ? ["exists": false, "path": ""] : humanFlowReviewFileStatus(URL(fileURLWithPath: jsonPath)),
                "queueHtmlPath": queueHtmlPath,
                "queueJsonPath": queueJsonPath
            ],
            "uiContract": [
                "component": episode4String(uiContract["component"]) ?? "CutIntelligenceNextProofCard",
                "state": episode4String(uiContract["state"]) ?? "",
                "primaryAction": primaryAction,
                "secondaryActions": secondaryActions,
                "forbiddenActions": episode4StringArray(uiContract["forbiddenActions"]),
                "safety": safety
            ],
            "safeCommands": [
                "refresh": "script/agentctl.sh episode4-recipe-proof-listen-next --markdown",
                "openProofCard": htmlPath,
                "openProofNotes": markdownPath,
                "playProofAudio": audioPath,
                "copyReviewerPrompt": reviewerPrompt,
                "copyReviewPacket": reviewPacket,
                "copyApplyPreviewBrief": defaultApplyPreviewBrief,
                "copySourceRecoveryBrief": defaultSourceRecoveryBrief,
                "copyVisualReviewBrief": defaultVisualReviewBrief,
                "copyDecisionOutcomeBrief": defaultDecisionOutcomeBrief,
                "copyCutCraftReviewBrief": defaultCutCraftReviewBrief,
                "copyApplyPreviewWorkOrder": defaultApplyPreviewWorkOrder,
                "copyApplyPreviewPromotionProposal": defaultApplyPreviewPromotionProposal,
                "copyApplyPreviewPromotionReadinessBoard": defaultApplyPreviewPromotionReadinessBoard,
                "dryRunReviewWithDefaults": defaultDryRunCommand,
                "recordReviewWithDefaults": defaultRecordCommand,
                "dryRunReview": episode4String(primaryAction["command"]) ?? "",
                "recordCommandTemplate": episode4String(item["recordCommandTemplate"]) ?? ""
            ],
            "truth": [
                "readOnly": true,
                "timelineDecisionsWritten": false,
                "clipsImported": false,
                "sourceFilesMutated": false,
                "exportsRendered": false,
                "externalPublishing": false,
                "reviewDecisionsRecordedByThisEndpoint": false,
                "timelineWriteAllowed": episode4Bool(safety["timelineWriteAllowed"]),
                "sourceMutationAllowed": episode4Bool(safety["sourceMutationAllowed"]),
                "recordingScope": episode4String(safety["recordingScope"]) ?? "sidecar-review-ledger-only"
            ],
            "agentNextActions": [
                "Open or play the proof audio window.",
                "Answer the proof question in plain language.",
                "Use the dry-run command first if recording a review note might be useful.",
                "Do not write timeline metadata from this endpoint.",
                "If the operation needs watched/source media, route it to source recovery instead of inventing a clip."
            ]
        ]
    }

    private nonisolated static func episode4ProofListenCoverageGuidance(
        tasks: Int,
        reviewNeeded: Int,
        pending: Int,
        needsListen: Int,
        needsSource: Int
    ) -> String {
        if tasks <= 0 {
            return "No proof-listen queue has been loaded. Regenerate the queue before reviewing."
        }
        if needsSource > 0 {
            return "\(needsSource) operation(s) need watched/source clip recovery before they can become real media decisions."
        }
        if pending > 0 || reviewNeeded > 0 {
            return "\(max(pending, reviewNeeded)) operation(s) still need proof-listen review. Work one item at a time; do not promote unreviewed suggestions."
        }
        if needsListen > 0 {
            return "\(needsListen) operation(s) are marked needs-listen. Convert them into keep/refine/reject only after audio and visual evidence is clear."
        }
        return "The loaded proof-listen queue has review coverage. Next safe step is apply-preview review, not source mutation."
    }

    private nonisolated static func episode4ProofListenEvidenceGuidance(
        events: Int,
        pending: Int,
        needsListen: Int,
        needsSource: Int
    ) -> String {
        if events <= 0 {
            return "No sidecar review decisions have been recorded yet. Proof-listen one operation, preview the dry-run command, then record only if the evidence is clear."
        }
        if needsSource > 0 {
            return "\(needsSource) operation(s) need real watched/source media before they can become confident edit decisions."
        }
        if needsListen > 0 {
            return "\(needsListen) operation(s) still need ears-on proof. Keep cadence human; do not auto-tighten just because silence exists."
        }
        if pending > 0 {
            return "\(pending) operation(s) are still pending. Work one proof window at a time so review evidence stays useful."
        }
        return "Review evidence exists for the loaded operation set. Use it to refine the edit, not to pretend the whole episode is finished."
    }

    private nonisolated static func episode4ProofListenReviewPacket(
        operationId: String,
        sequenceLabel: String,
        operationKind: String,
        reviewMode: String,
        suggestedDecision: String,
        currentDecision: String,
        risk: String,
        audioPath: String,
        proofQuestion: String,
        whyFirst: String,
        listenChecks: [String],
        visualChecks: [String],
        operations: Int,
        reviewed: Int,
        reviewNeeded: Int,
        events: Int,
        pending: Int,
        needsListen: Int,
        needsSource: Int,
        evidenceGuidance: String,
        cutCraftRubric: [String],
        decisionGuidance: [String: String],
        evidenceRequirements: [String: [String]]
    ) -> String {
        var lines = [
            "Episode 4 proof-listen review packet",
            "",
            "Purpose: review one generated edit idea for human rhythm before it can become trusted metadata.",
            "Operation: \(operationId.isEmpty ? "unknown" : operationId)",
            "Range: \(sequenceLabel.isEmpty ? "unknown" : sequenceLabel)",
            "Kind: \(operationKind.isEmpty ? "review" : operationKind)",
            "Mode: \(reviewMode.isEmpty ? "listen-first" : reviewMode)",
            "Suggested decision: \(suggestedDecision.isEmpty ? "needs-listen" : suggestedDecision)",
            "Current decision: \(currentDecision.isEmpty ? "unreviewed" : currentDecision)",
            "Risk: \(risk.isEmpty ? "human cadence" : risk)",
            "",
            "Current review evidence:",
            "- Operations: \(operations)",
            "- Reviewed: \(reviewed)",
            "- Needs review: \(reviewNeeded)",
            "- Recorded events: \(events)",
            "- Pending: \(pending)",
            "- Needs listen: \(needsListen)",
            "- Needs source: \(needsSource)",
            "- Guidance: \(evidenceGuidance)",
            ""
        ]

        lines.append("Cut craft checks:")
        lines.append(contentsOf: cutCraftRubric.map { "- \($0)" })
        lines.append("")
        lines.append("Decision meanings:")
        for decision in ["keep", "refine", "reject", "hold", "needs-listen", "needs-source", "needs-visual-review"] {
            guard let guidance = decisionGuidance[decision] else { continue }
            lines.append("- \(decision): \(guidance)")
        }
        lines.append("")
        lines.append("Decision evidence requirements:")
        for decision in ["keep", "refine", "reject", "hold", "needs-listen", "needs-source", "needs-visual-review"] {
            guard let requirements = evidenceRequirements[decision], !requirements.isEmpty else { continue }
            lines.append("- \(decision): \(requirements.joined(separator: " | "))")
        }
        lines.append("")

        if !audioPath.isEmpty {
            lines.append("Proof audio: \(audioPath)")
            lines.append("")
        }

        if !proofQuestion.isEmpty {
            lines.append("Question:")
            lines.append(proofQuestion)
            lines.append("")
        }

        if !whyFirst.isEmpty {
            lines.append("Why this is first:")
            lines.append(whyFirst)
            lines.append("")
        }

        if !listenChecks.isEmpty {
            lines.append("Listen for:")
            lines.append(contentsOf: listenChecks.map { "- \($0)" })
            lines.append("")
        }

        if !visualChecks.isEmpty {
            lines.append("Look for:")
            lines.append(contentsOf: visualChecks.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Review notes to fill:")
        lines.append("- Decision: keep / refine / reject / hold / needs-listen / needs-source / needs-visual-review")
        lines.append("- Audio evidence:")
        lines.append("- Visual evidence:")
        lines.append("- Cadence guidance:")
        lines.append("")
        lines.append("Safety boundary: this packet records nothing. Do not write timeline metadata, import clips, mutate source files, export, publish, or overwrite versions from this packet.")
        return lines.joined(separator: "\n")
    }

    private nonisolated static func episode4ProofListenCutCraftRubric(
        operationKind: String,
        risk: String
    ) -> [String] {
        var checks: [String] = []
        let kindAndRisk = "\(operationKind) \(risk)".lowercased()

        if kindAndRisk.contains("reaction") {
            checks.append("Reaction cover: use the listener's face when the reaction carries meaning or covers a jump cut better than another speaker cut.")
        }
        if kindAndRisk.contains("cadence") || kindAndRisk.contains("tight") || kindAndRisk.contains("pause") {
            checks.append("Cadence: tighten dead air and false starts, but preserve thinking pauses, breath, surprise, warmth, and the moment before a real answer.")
        }

        checks.append("J-cut: let incoming audio lead the picture only when it smooths a turn or prevents a harsh visual jump.")
        checks.append("L-cut: let outgoing audio or reaction linger when it preserves emotion, context, or conversational overlap.")
        checks.append("Jump cut: avoid same-speaker visual pops; cover with reaction, source media, reframing, or accept the cut only if the rhythm matters more.")
        checks.append("Needs-source: if the watched clip or b-roll is required to understand the moment, mark it needs-source instead of inventing confidence.")

        return Array(checks.prefix(6))
    }

    private nonisolated static func episode4ProofListenDecisionGuidanceMap() -> [String: String] {
        [
            "keep": "Use keep only after the proof audio and picture both support the cut; this means the edit preserves rhythm and can move toward apply-preview.",
            "refine": "Use refine when the idea is right but the boundary, cadence, reaction cover, source timing, or framing still needs adjustment.",
            "reject": "Use reject when the suggestion makes the conversation feel less human, creates a bad jump, loses meaning, or solves a problem that was not real.",
            "hold": "Use hold when the edit may be useful later but should not move forward until more context, source media, or human taste review is available.",
            "needs-listen": "Use needs-listen when nobody has proof-listened enough yet; do not promote a generated suggestion from this state.",
            "needs-source": "Use needs-source when watched clips, b-roll, reference media, or missing camera context are required before the decision can be honest.",
            "needs-visual-review": "Use needs-visual-review when the audio sounds plausible but the picture, reaction, eye-line, or jump-cut cover has not been verified."
        ]
    }

    private nonisolated static func episode4ProofListenEvidenceRequirementMap() -> [String: [String]] {
        [
            "keep": [
                "Audio proof: the cadence still sounds human after the proposed change.",
                "Visual proof: the picture/reaction/source cut supports the moment.",
                "Tradeoff proof: the edit removes friction without removing meaning."
            ],
            "refine": [
                "Name what needs refinement: boundary, cadence, reaction cover, source timing, framing, or caption/shorts context.",
                "Describe the failure mode so the next pass can change one thing on purpose.",
                "Keep the source intact; refinement is metadata, not clip damage."
            ],
            "reject": [
                "Say what the suggestion harms: rhythm, meaning, reaction, continuity, or trust.",
                "Prefer rejecting over forcing a clever edit that feels artificial.",
                "Leave enough evidence so the same bad suggestion is less likely next time."
            ],
            "hold": [
                "State what context is missing before this can move forward.",
                "Use hold for taste/context uncertainty, not for source-media gaps.",
                "Write the next safest review action."
            ],
            "needs-listen": [
                "Proof-listen the audio window before promoting the suggestion.",
                "Write what the ear proved about cadence, pause, breath, or over-cleaning risk.",
                "Do not mark keep/refine/reject until there is actual listening evidence."
            ],
            "needs-source": [
                "Name the missing watched clip, b-roll, reference media, or camera context if known.",
                "Explain why the edit cannot be honest without that media.",
                "Route to source recovery instead of inventing confidence."
            ],
            "needs-visual-review": [
                "Audio may be plausible, but picture/reaction/eye-line/jump-cut cover still needs checking.",
                "Identify the visual risk before metadata promotion.",
                "Use this when ears are ahead of eyes."
            ]
        ]
    }

    private nonisolated static func episode4ProofListenMissingEvidenceWarnings(
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String
    ) -> [String] {
        var warnings: [String] = []

        if episode4LooksLikeEmptyOrPrompt(summary) {
            warnings.append("Short note still looks blank or prompt-like; summarize the actual review decision.")
        }
        if episode4LooksLikeEmptyOrPrompt(audio) {
            warnings.append("Audio evidence is missing or still prompt-like; write what the ear actually proved.")
        }
        if decision == "keep", episode4LooksLikeEmptyOrPrompt(visual) {
            warnings.append("Keep needs visual proof too; write what the picture/reaction/source cut actually supports.")
        }
        if decision == "needs-source", !episode4MentionsSourceNeed(summary: summary, visual: visual, cadence: cadence) {
            warnings.append("Needs-source should name the missing clip, b-roll, reference, or camera context if known.")
        }
        if decision == "refine", !episode4MentionsRefinementTarget(summary: summary, cadence: cadence) {
            warnings.append("Refine should name what changes next: boundary, cadence, reaction, source timing, framing, or captions.")
        }
        if decision == "reject", episode4LooksLikeEmptyOrPrompt(cadence) {
            warnings.append("Reject should say what the suggestion harms so the same bad cut is less likely next time.")
        }
        if decision == "needs-visual-review", episode4LooksLikeEmptyOrPrompt(visual) {
            warnings.append("Needs-visual-review should identify the picture/reaction/eye-line/jump-cut risk.")
        }

        return warnings
    }

    private nonisolated static func episode4ProofListenEvidenceStrength(
        missingWarnings: [String],
        summary: String,
        audio: String,
        visual: String,
        cadence: String
    ) -> [String: Any] {
        let usableFieldCount = [summary, audio, visual, cadence]
            .filter { !episode4LooksLikeEmptyOrPrompt($0) }
            .count
        let level: String
        if missingWarnings.isEmpty {
            level = "ready"
        } else if usableFieldCount >= 2 {
            level = "partial"
        } else {
            level = "weak"
        }

        return [
            "level": level,
            "usableFields": usableFieldCount,
            "totalFields": 4,
            "warningCount": missingWarnings.count,
            "summary": missingWarnings.isEmpty
                ? "Evidence-ready: enough review detail exists to consider a deliberate sidecar record after dry-run."
                : "Needs stronger evidence: use dry-run only until warnings are resolved."
        ]
    }

    private nonisolated static func episode4ProofListenNextSafeAction(
        decision: String,
        missingWarnings: [String]
    ) -> String {
        if !missingWarnings.isEmpty {
            return "Proof-listen and dry-run only; strengthen evidence before any sidecar record."
        }

        switch decision {
        case "keep":
            return "Dry-run, record evidence, then review apply-preview before metadata promotion."
        case "refine":
            return "Record the refinement target, then tune one boundary, reaction, source timing, framing, or cadence choice."
        case "reject":
            return "Record what this harms so future suggestions avoid the same bad cut."
        case "hold":
            return "Preserve this as context and revisit after human taste, source, or episode-shape review."
        case "needs-source":
            return "Route to source recovery or watched-clip search; do not invent confidence."
        case "needs-visual-review":
            return "Inspect the source wall/program frame before deciding."
        case "needs-listen":
            fallthrough
        default:
            return "Play the proof audio and write what the ear actually proved."
        }
    }

    private nonisolated static func episode4ProofListenPromotionReadiness(
        decision: String,
        missingWarnings: [String]
    ) -> [String: Any] {
        if !missingWarnings.isEmpty {
            return [
                "status": "not-ready",
                "canCreateApplyPreview": false,
                "canPromoteMetadata": false,
                "requiresSourceRecovery": decision == "needs-source",
                "requiresVisualReview": decision == "needs-visual-review",
                "guidance": "Review evidence is too weak for apply-preview or metadata promotion. Proof-listen and dry-run first."
            ]
        }

        switch decision {
        case "keep":
            return [
                "status": "ready-for-apply-preview",
                "canCreateApplyPreview": true,
                "canPromoteMetadata": false,
                "requiresSourceRecovery": false,
                "requiresVisualReview": false,
                "guidance": "Evidence can move to apply-preview review. Do not write timeline truth until the preview is deliberately promoted."
            ]
        case "refine":
            return [
                "status": "ready-for-refinement-preview",
                "canCreateApplyPreview": true,
                "canPromoteMetadata": false,
                "requiresSourceRecovery": false,
                "requiresVisualReview": false,
                "guidance": "Use the review as a refinement target. Tune one boundary, reaction, source timing, framing, or cadence choice before promotion."
            ]
        case "reject":
            return [
                "status": "rejected-learning-evidence",
                "canCreateApplyPreview": false,
                "canPromoteMetadata": false,
                "requiresSourceRecovery": false,
                "requiresVisualReview": false,
                "guidance": "Do not promote this edit. Preserve the rejection as learning evidence for future cut suggestions."
            ]
        case "hold":
            return [
                "status": "parked-for-context",
                "canCreateApplyPreview": false,
                "canPromoteMetadata": false,
                "requiresSourceRecovery": false,
                "requiresVisualReview": false,
                "guidance": "Keep this note as context. Revisit after human taste, source, or episode-shape review."
            ]
        case "needs-source":
            return [
                "status": "needs-source-recovery",
                "canCreateApplyPreview": false,
                "canPromoteMetadata": false,
                "requiresSourceRecovery": true,
                "requiresVisualReview": false,
                "guidance": "Recover or identify the watched clip, b-roll, reference, or camera context before considering promotion."
            ]
        case "needs-visual-review":
            return [
                "status": "needs-visual-review",
                "canCreateApplyPreview": false,
                "canPromoteMetadata": false,
                "requiresSourceRecovery": false,
                "requiresVisualReview": true,
                "guidance": "Inspect source wall/program frame proof before any apply-preview or metadata promotion."
            ]
        case "needs-listen":
            fallthrough
        default:
            return [
                "status": "needs-proof-listen",
                "canCreateApplyPreview": false,
                "canPromoteMetadata": false,
                "requiresSourceRecovery": false,
                "requiresVisualReview": false,
                "guidance": "Proof-listen the audio window and write evidence before promotion is considered."
            ]
        }
    }

    private nonisolated static func episode4ProofListenSourceRecoveryBrief(
        operationId: String,
        sequenceLabel: String,
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String,
        missingWarnings: [String],
        nextSafeAction: String,
        promotionReadiness: [String: Any]
    ) -> String {
        let promotionStatus = (promotionReadiness["status"] as? String) ?? "unknown"
        var lines = [
            "Episode 4 source-recovery brief",
            "",
            "Purpose: route a proof-listen idea to real source recovery instead of inventing confidence.",
            "Operation: \(operationId.isEmpty ? "unknown" : operationId)",
            "Range: \(sequenceLabel.isEmpty ? "unknown" : sequenceLabel)",
            "Decision: \(decision)",
            "Promotion status: \(promotionStatus)",
            "Next safe action: \(nextSafeAction)",
            "",
            "What appears missing:",
            "- Watched clip, b-roll, reference media, or camera context named in notes: \(episode4Trimmed(summary, defaultValue: "not named yet"))",
            "- Visual/source evidence: \(episode4Trimmed(visual, defaultValue: "not written"))",
            "- Audio/cadence reason this source matters: \(episode4Trimmed(audio, defaultValue: "not written"))",
            "- Preserve/tighten guidance: \(episode4Trimmed(cadence, defaultValue: "not written"))",
            "",
            "Recovery questions:",
            "- What source media would make this edit honest?",
            "- Is the missing media a watched clip, b-roll cutaway, camera angle, reference image/video, or transcript context?",
            "- Can the episode still work without it, or should this operation stay parked?",
            ""
        ]

        if !missingWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: missingWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Source-recovery boundary:")
        lines.append("- This packet does not import media.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private nonisolated static func episode4ProofListenQueueTriage(
        decision: String,
        missingWarnings: [String]
    ) -> [String: Any] {
        if !missingWarnings.isEmpty {
            return [
                "lane": "proof-listen",
                "status": "weak-evidence",
                "canRecordReview": false,
                "canCreateApplyPreview": false,
                "nextAction": "Strengthen summary, audio, visual, and cadence evidence; dry-run only.",
                "why": "The note still has missing or prompt-like evidence."
            ]
        }

        switch decision {
        case "keep":
            return [
                "lane": "apply-preview",
                "status": "candidate",
                "canRecordReview": true,
                "canCreateApplyPreview": true,
                "nextAction": "Create a reversible apply-preview packet before any timeline promotion.",
                "why": "The proof-listen evidence is strong enough and the decision supports preview work."
            ]
        case "refine":
            return [
                "lane": "refinement-preview",
                "status": "candidate",
                "canRecordReview": true,
                "canCreateApplyPreview": true,
                "nextAction": "Name one tuning target, then create a reversible refinement preview.",
                "why": "The operation may work, but the cut needs intentional adjustment."
            ]
        case "reject":
            return [
                "lane": "learning-evidence",
                "status": "do-not-promote",
                "canRecordReview": true,
                "canCreateApplyPreview": false,
                "nextAction": "Preserve why the suggestion failed so future edits avoid the same mistake.",
                "why": "Rejected suggestions are useful training/review evidence, not failed work."
            ]
        case "hold":
            return [
                "lane": "parked-review",
                "status": "parked",
                "canRecordReview": true,
                "canCreateApplyPreview": false,
                "nextAction": "Wait for human taste, episode-shape, or source-context review.",
                "why": "The operation needs a higher-level choice before it becomes an edit candidate."
            ]
        case "needs-source":
            return [
                "lane": "source-recovery",
                "status": "needs-source",
                "canRecordReview": true,
                "canCreateApplyPreview": false,
                "nextAction": "Find watched clips, b-roll, reference media, transcript context, or camera evidence.",
                "why": "Source uncertainty should become a recovery task instead of fake confidence."
            ]
        case "needs-visual-review":
            return [
                "lane": "visual-review",
                "status": "needs-picture-proof",
                "canRecordReview": true,
                "canCreateApplyPreview": false,
                "nextAction": "Inspect reaction cover, eye-line, jump cuts, source wall, and program-frame truth.",
                "why": "Audio plausibility is not enough when the picture may betray the cut."
            ]
        case "needs-listen":
            fallthrough
        default:
            return [
                "lane": "proof-listen",
                "status": "listen-first",
                "canRecordReview": true,
                "canCreateApplyPreview": false,
                "nextAction": "Proof-listen the audio window before choosing an edit direction.",
                "why": "Human-feeling cuts start with cadence, meaning, breath, and overlap evidence."
            ]
        }
    }

    private nonisolated static func episode4ProofListenCutCraftIntent(
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String,
        missingWarnings: [String]
    ) -> [String: Any] {
        let haystack = [decision, summary, audio, visual, cadence]
            .joined(separator: " ")
            .lowercased()
        let intent: String
        let tags: [String]
        let listenFor: [String]
        let watchFor: [String]

        if haystack.contains("reaction") || haystack.contains("cover") || haystack.contains("face") {
            intent = "reaction-cover"
            tags = ["reaction-cover", "visual-rhythm", "jump-cover"]
            listenFor = ["Does the listener reaction preserve the speaker cadence?", "Does the cut cover a jump without feeling evasive?"]
            watchFor = ["Meaningful listener face", "Clean eye-line/body continuity", "No accidental dead stare"]
        } else if haystack.contains("j-cut") || haystack.contains("j cut") || haystack.contains("hear before") || haystack.contains("audio lead") {
            intent = "j-cut"
            tags = ["j-cut", "audio-lead", "dialogue-transition"]
            listenFor = ["Does the next voice arrive before the picture naturally?", "Does the overlap clarify rather than rush the thought?"]
            watchFor = ["Picture change lands after the audio lead", "No visual confusion during the overlap"]
        } else if haystack.contains("l-cut") || haystack.contains("l cut") || haystack.contains("carry audio") || haystack.contains("audio tail") {
            intent = "l-cut"
            tags = ["l-cut", "audio-tail", "reaction-carry"]
            listenFor = ["Does the previous voice carry naturally over the next image?", "Does the tail preserve emotional context?"]
            watchFor = ["Reaction or b-roll earns the carried audio", "No mismatched mouth movement"]
        } else if haystack.contains("jump") || haystack.contains("twitchy") || haystack.contains("same speaker") {
            intent = "jump-cut-handling"
            tags = ["jump-cut", "same-speaker", "cover-or-accept"]
            listenFor = ["Is the jump audible, meaningful, or too abrupt?", "Would preserving a breath make it feel more human?"]
            watchFor = ["Visible head/body pop", "Need for reaction cover, crop shift, or accepted jump"]
        } else if haystack.contains("b-roll") || haystack.contains("clip") || haystack.contains("source") || haystack.contains("reference") {
            intent = "source-insertion"
            tags = ["source-insertion", "b-roll", "reference-context"]
            listenFor = ["Does the spoken context tell us when the source should enter and leave?", "Does audio need to stay under the source?"]
            watchFor = ["Correct watched/source clip", "Enough visual context without hijacking the conversation"]
        } else if haystack.contains("pause") || haystack.contains("breath") || haystack.contains("cadence") || haystack.contains("rhythm") {
            intent = "cadence-preservation"
            tags = ["cadence", "breath", "do-not-overclean"]
            listenFor = ["Which pause is meaning and which pause is drag?", "Does tightening change the speaker's intent?"]
            watchFor = ["Reaction or posture that makes the pause worth keeping", "Avoid twitchy overcutting"]
        } else if decision == "reject" {
            intent = "avoid-bad-cut"
            tags = ["reject-learning", "do-not-repeat", "negative-example"]
            listenFor = ["What made the suggestion fail?", "What should future cut scoring penalize?"]
            watchFor = ["Visual mismatch, false emphasis, or continuity harm"]
        } else {
            intent = "listen-first"
            tags = ["proof-listen", "human-cadence", "evidence-needed"]
            listenFor = ["Cadence, breath, overlap, sentence meaning, and whether the cut feels human"]
            watchFor = ["Reaction cover, source wall truth, and frame continuity if audio sounds plausible"]
        }

        return [
            "intent": intent,
            "tags": tags,
            "listenFor": listenFor,
            "watchFor": watchFor,
            "evidenceWeak": !missingWarnings.isEmpty,
            "writesTimelineMetadata": false,
            "mutatesSourceMedia": false,
            "guidance": "Use this as craft classification for review and preview work; it is not a timeline edit."
        ]
    }

    private nonisolated static func episode4ProofListenCutCraftReviewBrief(
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String,
        missingWarnings: [String],
        evidenceStrength: [String: Any],
        queueTriage: [String: Any],
        cutCraftIntent: [String: Any]
    ) -> String {
        let intent = (cutCraftIntent["intent"] as? String) ?? "unknown"
        let evidenceLevel = (evidenceStrength["level"] as? String) ?? "unknown"
        let lane = (queueTriage["lane"] as? String) ?? "unknown"
        let triageStatus = (queueTriage["status"] as? String) ?? "unknown"
        let nextAction = (queueTriage["nextAction"] as? String) ?? "unknown"
        let listenFor = (cutCraftIntent["listenFor"] as? [String]) ?? []
        let watchFor = (cutCraftIntent["watchFor"] as? [String]) ?? []

        let adjustment: String
        switch intent {
        case "reaction-cover":
            adjustment = "Preview a short reaction cover over only the unstable visual moment, then return to the speaker quickly."
        case "j-cut":
            adjustment = "Preview the next speaker audio slightly before the picture switch, keeping the overlap conversational."
        case "l-cut":
            adjustment = "Preview the previous speaker audio carrying over a reaction/source frame, then cut back before it goes stale."
        case "jump-cut-handling":
            adjustment = "Choose one: cover with reaction/source, soften with cadence, or accept the jump only if it adds energy."
        case "source-insertion":
            adjustment = "Recover or select source media first, then preview source insertion without replacing the conversation spine."
        case "cadence-preservation":
            adjustment = "Tighten drag only; preserve breath or pause when it carries thought, humor, or warmth."
        case "avoid-bad-cut":
            adjustment = "Keep this as negative learning evidence and do not turn it into an edit preview."
        default:
            adjustment = "Proof-listen first, then choose the smallest reversible preview that preserves meaning."
        }

        var lines = [
            "Episode 4 cut-craft review brief",
            "",
            "Purpose: turn proof-listen notes into a concrete craft review without writing timeline truth.",
            "Decision: \(decision)",
            "Craft intent: \(intent)",
            "Evidence strength: \(evidenceLevel)",
            "Queue lane: \(lane)",
            "Queue status: \(triageStatus)",
            "Next safe action: \(nextAction)",
            "",
            "Listen for:"
        ]
        lines.append(contentsOf: listenFor.map { "- \($0)" })
        lines.append("")
        lines.append("Watch for:")
        lines.append(contentsOf: watchFor.map { "- \($0)" })
        lines.append("")
        lines.append("Next reversible adjustment:")
        lines.append("- \(adjustment)")
        lines.append("")
        lines.append("Review evidence:")
        lines.append("- Summary: \(episode4Trimmed(summary, defaultValue: "not written"))")
        lines.append("- Audio/cadence evidence: \(episode4Trimmed(audio, defaultValue: "not written"))")
        lines.append("- Visual/reaction evidence: \(episode4Trimmed(visual, defaultValue: "not written"))")
        lines.append("- Preserve/tighten guidance: \(episode4Trimmed(cadence, defaultValue: "not written"))")
        lines.append("")

        if !missingWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: missingWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Craft-review boundary:")
        lines.append("- This packet does not record a review decision.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not import clips or mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private nonisolated static func episode4ProofListenApplyPreviewWorkOrder(
        operationId: String,
        sequenceLabel: String,
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String,
        missingWarnings: [String],
        evidenceStrength: [String: Any],
        queueTriage: [String: Any],
        cutCraftIntent: [String: Any],
        promotionReadiness: [String: Any]
    ) -> String {
        let intent = (cutCraftIntent["intent"] as? String) ?? "unknown"
        let evidenceLevel = (evidenceStrength["level"] as? String) ?? "unknown"
        let lane = (queueTriage["lane"] as? String) ?? "unknown"
        let triageStatus = (queueTriage["status"] as? String) ?? "unknown"
        let promotionStatus = (promotionReadiness["status"] as? String) ?? "unknown"
        let canCreateApplyPreview = ((promotionReadiness["canCreateApplyPreview"] as? Bool) ?? false) ? "yes" : "no"

        let previewTask: String
        switch intent {
        case "reaction-cover":
            previewTask = "Create a reaction-cover preview over the unstable visual moment, then return to the speaker before the reaction becomes filler."
        case "j-cut":
            previewTask = "Create a short audio-lead preview where the next speaker enters before the picture switch."
        case "l-cut":
            previewTask = "Create an audio-tail preview where the previous speaker carries over reaction/source context."
        case "jump-cut-handling":
            previewTask = "Create one preview that either covers the jump, softens it with cadence, or intentionally accepts it for energy."
        case "source-insertion":
            previewTask = "Create a source/b-roll insertion preview only after source context is recovered and named."
        case "cadence-preservation":
            previewTask = "Create a timing preview that tightens drag while preserving meaningful breath, pause, or warmth."
        default:
            previewTask = "Create the smallest reversible preview that tests the proof-listen hypothesis without promoting it."
        }

        var lines = [
            "Episode 4 apply-preview work order",
            "",
            "Purpose: prepare one reversible edit-preview task from proof-listen evidence without writing timeline truth.",
            "Operation: \(operationId.isEmpty ? "unknown" : operationId)",
            "Range: \(sequenceLabel.isEmpty ? "unknown" : sequenceLabel)",
            "Decision: \(decision)",
            "Craft intent: \(intent)",
            "Evidence strength: \(evidenceLevel)",
            "Queue lane: \(lane)",
            "Queue status: \(triageStatus)",
            "Promotion status: \(promotionStatus)",
            "Can create apply-preview: \(canCreateApplyPreview)",
            "",
            "Preview task:",
            "- \(previewTask)",
            "",
            "Work-order rules:",
            "- Create a reversible preview only; do not promote directly to timeline metadata.",
            "- Preserve whole synced sources and the current source-media files.",
            "- Apply the smallest adjustment that tests the craft hypothesis.",
            "- Compare against the proof-listen notes before any human approval.",
            "",
            "Review evidence:",
            "- Summary: \(episode4Trimmed(summary, defaultValue: "not written"))",
            "- Audio/cadence evidence: \(episode4Trimmed(audio, defaultValue: "not written"))",
            "- Visual/reaction evidence: \(episode4Trimmed(visual, defaultValue: "not written"))",
            "- Preserve/tighten guidance: \(episode4Trimmed(cadence, defaultValue: "not written"))",
            ""
        ]

        if !missingWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: missingWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Apply-preview work-order boundary:")
        lines.append("- This packet does not record a review decision.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not import clips or mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private nonisolated static func episode4ProofListenApplyPreviewCandidatePayload(
        operationId: String,
        sequenceLabel: String,
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String,
        missingWarnings: [String],
        evidenceStrength: [String: Any],
        queueTriage: [String: Any],
        cutCraftIntent: [String: Any],
        promotionReadiness: [String: Any]
    ) -> [String: Any] {
        let intent = (cutCraftIntent["intent"] as? String) ?? "unknown"
        let evidenceLevel = (evidenceStrength["level"] as? String) ?? "unknown"
        let lane = (queueTriage["lane"] as? String) ?? "unknown"
        let triageStatus = (queueTriage["status"] as? String) ?? "unknown"
        let canCreateApplyPreview = (promotionReadiness["canCreateApplyPreview"] as? Bool) ?? false
        let canRecordReview = (queueTriage["canRecordReview"] as? Bool) ?? false
        let status = canCreateApplyPreview ? "candidate" : "blocked"
        let previewKind: String
        switch intent {
        case "reaction-cover":
            previewKind = "reaction-cover-preview"
        case "j-cut":
            previewKind = "audio-lead-preview"
        case "l-cut":
            previewKind = "audio-tail-preview"
        case "jump-cut-handling":
            previewKind = "jump-cut-handling-preview"
        case "source-insertion":
            previewKind = "source-insertion-preview"
        case "cadence-preservation":
            previewKind = "cadence-timing-preview"
        default:
            previewKind = "generic-proof-listen-preview"
        }

        return [
            "type": "episode4.applyPreviewCandidate",
            "episode": "episode-4",
            "operationId": operationId,
            "sequenceLabel": sequenceLabel,
            "status": status,
            "decision": decision,
            "previewKind": previewKind,
            "craftIntent": intent,
            "craftTags": (cutCraftIntent["tags"] as? [String]) ?? [],
            "evidenceLevel": evidenceLevel,
            "queueLane": lane,
            "queueStatus": triageStatus,
            "canRecordReview": canRecordReview,
            "canCreateApplyPreview": canCreateApplyPreview,
            "blockers": missingWarnings,
            "inputs": [
                "summary": episode4Trimmed(summary, defaultValue: "not written"),
                "audioEvidence": episode4Trimmed(audio, defaultValue: "not written"),
                "visualEvidence": episode4Trimmed(visual, defaultValue: "not written"),
                "cadenceGuidance": episode4Trimmed(cadence, defaultValue: "not written")
            ],
            "constraints": [
                "preserveWholeSources": true,
                "useProxiesAndSessionMetadata": true,
                "smallestReversibleAdjustment": true,
                "requiresHumanApprovalBeforePromotion": true
            ],
            "truth": [
                "writesTimelineMetadata": false,
                "importsClips": false,
                "mutatesSourceMedia": false,
                "exportsRendered": false,
                "externalPublishing": false
            ]
        ]
    }

    private nonisolated static func episode4ProofListenApplyPreviewPatchPlan(
        candidatePayload: [String: Any],
        queueTriage: [String: Any],
        cutCraftIntent: [String: Any],
        promotionReadiness: [String: Any]
    ) -> [String: Any] {
        let previewKind = (candidatePayload["previewKind"] as? String) ?? "generic-proof-listen-preview"
        let canCreateApplyPreview = (candidatePayload["canCreateApplyPreview"] as? Bool)
            ?? ((promotionReadiness["canCreateApplyPreview"] as? Bool) ?? false)
        let patchKind: String
        let proposedAdjustment: String
        let risk: String

        switch previewKind {
        case "reaction-cover-preview":
            patchKind = "show-reaction-cover"
            proposedAdjustment = "Propose a reversible SHOW/source-cover decision over the unstable visual moment, then return to the primary speaker."
            risk = "Can feel evasive or like filler if the reaction face does not carry meaning."
        case "audio-lead-preview":
            patchKind = "j-cut-audio-lead"
            proposedAdjustment = "Propose a short audio-lead overlap before the picture switch."
            risk = "Can feel rushed or confusing if the incoming voice arrives before the thought is ready."
        case "audio-tail-preview":
            patchKind = "l-cut-audio-tail"
            proposedAdjustment = "Propose an audio-tail carry over reaction/source context."
            risk = "Can create mouth mismatch or stale picture if the tail carries too long."
        case "jump-cut-handling-preview":
            patchKind = "jump-cut-soften-or-cover"
            proposedAdjustment = "Propose a cover, cadence soften, or intentional accepted jump as a reversible preview."
            risk = "Can over-clean human rhythm or hide useful energy."
        case "source-insertion-preview":
            patchKind = "source-insert"
            proposedAdjustment = "Propose source/b-roll insertion only after named source context is available."
            risk = "Can invent confidence if watched/source media is missing or mismatched."
        case "cadence-timing-preview":
            patchKind = "cadence-timing"
            proposedAdjustment = "Propose timing adjustment that tightens drag while preserving breath, pause, humor, or warmth."
            risk = "Can make the conversation sound robotic if tightened too aggressively."
        default:
            patchKind = "generic-proof-listen-preview"
            proposedAdjustment = "Propose the smallest reversible metadata adjustment that tests the proof-listen hypothesis."
            risk = "Needs review because the craft intent is still generic."
        }

        return [
            "type": "episode4.applyPreviewPatchPlan",
            "episode": "episode-4",
            "operationId": candidatePayload["operationId"] ?? "",
            "sequenceLabel": candidatePayload["sequenceLabel"] ?? "",
            "status": canCreateApplyPreview ? "plan-ready" : "blocked",
            "candidateStatus": candidatePayload["status"] ?? "unknown",
            "decision": candidatePayload["decision"] ?? "",
            "previewKind": previewKind,
            "patchKind": patchKind,
            "craftIntent": (cutCraftIntent["intent"] as? String) ?? "unknown",
            "queueLane": (queueTriage["lane"] as? String) ?? "unknown",
            "queueStatus": (queueTriage["status"] as? String) ?? "unknown",
            "proposedAdjustment": proposedAdjustment,
            "tradeoff": risk,
            "inputs": candidatePayload["inputs"] ?? [:],
            "requires": [
                "proofListenEvidenceReady": canCreateApplyPreview,
                "humanOrAgentReviewBeforePromotion": true,
                "sourceContextNamedIfSourceInsertion": previewKind != "source-insertion-preview"
            ],
            "constraints": [
                "preserveWholeSources": true,
                "useProxiesAndSessionMetadata": true,
                "smallestReversibleAdjustment": true,
                "doNotOverwriteExports": true
            ],
            "truth": [
                "writesTimelineMetadata": false,
                "importsClips": false,
                "mutatesSourceMedia": false,
                "exportsRendered": false,
                "externalPublishing": false
            ]
        ]
    }

    private nonisolated static func episode4ProofListenApplyPreviewApprovalChecklist(
        candidatePayload: [String: Any],
        patchPlan: [String: Any],
        missingWarnings: [String]
    ) -> [String: Any] {
        let canCreateApplyPreview = (candidatePayload["canCreateApplyPreview"] as? Bool) ?? false
        let status = canCreateApplyPreview && missingWarnings.isEmpty ? "review-ready" : "blocked"
        return [
            "type": "episode4.applyPreviewApprovalChecklist",
            "episode": "episode-4",
            "operationId": candidatePayload["operationId"] ?? "",
            "sequenceLabel": candidatePayload["sequenceLabel"] ?? "",
            "status": status,
            "decision": candidatePayload["decision"] ?? "",
            "patchKind": patchPlan["patchKind"] ?? "",
            "previewKind": patchPlan["previewKind"] ?? "",
            "mustPassBeforePromotion": [
                "Proof-listen evidence is specific and non-placeholder.",
                "Visual/source evidence supports the craft intent.",
                "The preview preserves whole synced sources and uses metadata only.",
                "The preview is the smallest reversible adjustment that tests the hypothesis.",
                "Human or agent reviewer explicitly approves the preview before timeline metadata promotion."
            ],
            "humanFeelingChecks": [
                "Does it preserve speaker cadence, breath, humor, warmth, or useful silence?",
                "Does it avoid over-cleaned robotic pacing?",
                "Does the visual cut feel motivated instead of twitchy?",
                "Does it avoid fake confidence when source media is uncertain?"
            ],
            "blockers": missingWarnings,
            "promotionBoundary": [
                "sidecarReviewIsNotTimelineTruth": true,
                "patchPlanIsNotTimelineTruth": true,
                "requiresApprovalBeforeMetadataPromotion": true
            ],
            "truth": [
                "writesTimelineMetadata": false,
                "importsClips": false,
                "mutatesSourceMedia": false,
                "exportsRendered": false,
                "externalPublishing": false
            ]
        ]
    }

    private nonisolated static func episode4ProofListenApplyPreviewApprovalReceiptTemplate(
        candidatePayload: [String: Any],
        patchPlan: [String: Any],
        checklist: [String: Any]
    ) -> [String: Any] {
        return [
            "type": "episode4.applyPreviewApprovalReceiptTemplate",
            "episode": "episode-4",
            "operationId": candidatePayload["operationId"] ?? "",
            "sequenceLabel": candidatePayload["sequenceLabel"] ?? "",
            "status": ((checklist["status"] as? String) == "review-ready") ? "template-ready" : "blocked",
            "decision": candidatePayload["decision"] ?? "",
            "patchKind": patchPlan["patchKind"] ?? "",
            "previewKind": patchPlan["previewKind"] ?? "",
            "allowedReceiptOutcomes": [
                "approve-preview",
                "reject-preview",
                "request-refinement",
                "needs-source",
                "needs-visual-review"
            ],
            "requiredReceiptFields": [
                "reviewer",
                "outcome",
                "whatWorked",
                "whatFailedOrStillNeedsWork",
                "humanCadenceNote",
                "promotionDecision"
            ],
            "reviewQuestions": [
                "Did the preview preserve cadence, breath, humor, warmth, or useful silence?",
                "Did it avoid over-cleaned robotic pacing?",
                "Did the visual/source choice support the audio meaning?",
                "Is this ready for metadata promotion, or only useful as learning evidence?"
            ],
            "receiptTruth": [
                "templateOnly": true,
                "approvalRecorded": false,
                "timelineMetadataPromoted": false,
                "requiresExplicitReviewerOutcome": true
            ],
            "sourceContext": [
                "candidate": candidatePayload,
                "patchPlan": patchPlan,
                "checklistStatus": checklist["status"] ?? "unknown"
            ],
            "truth": [
                "writesTimelineMetadata": false,
                "importsClips": false,
                "mutatesSourceMedia": false,
                "exportsRendered": false,
                "externalPublishing": false
            ]
        ]
    }

    private nonisolated static func episode4ProofListenVisualReviewBrief(
        operationId: String,
        sequenceLabel: String,
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String,
        missingWarnings: [String],
        nextSafeAction: String,
        promotionReadiness: [String: Any]
    ) -> String {
        let promotionStatus = (promotionReadiness["status"] as? String) ?? "unknown"
        var lines = [
            "Episode 4 visual-review brief",
            "",
            "Purpose: route an audio-plausible proof-listen idea to visual proof before any apply-preview or metadata promotion.",
            "Operation: \(operationId.isEmpty ? "unknown" : operationId)",
            "Range: \(sequenceLabel.isEmpty ? "unknown" : sequenceLabel)",
            "Decision: \(decision)",
            "Promotion status: \(promotionStatus)",
            "Next safe action: \(nextSafeAction)",
            "",
            "Visual checks:",
            "- Reaction cover: does the listener face carry meaning or cover a jump better than another speaker cut?",
            "- Eye-line/body continuity: does the cut feel intentional rather than twitchy?",
            "- Source wall/program frame: does the visible frame support what the audio suggests?",
            "- Same-speaker jump: should this be covered, reframed, accepted, or rejected?",
            "",
            "Review evidence:",
            "- Summary: \(episode4Trimmed(summary, defaultValue: "not written"))",
            "- Audio/cadence evidence: \(episode4Trimmed(audio, defaultValue: "not written"))",
            "- Visual/reaction evidence needed: \(episode4Trimmed(visual, defaultValue: "not written"))",
            "- Preserve/tighten guidance: \(episode4Trimmed(cadence, defaultValue: "not written"))",
            ""
        ]

        if !missingWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: missingWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Visual-review boundary:")
        lines.append("- This packet does not inspect media by itself.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private nonisolated static func episode4ProofListenDecisionOutcomeBrief(
        operationId: String,
        sequenceLabel: String,
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String,
        missingWarnings: [String],
        evidenceStrength: [String: Any],
        nextSafeAction: String,
        promotionReadiness: [String: Any]
    ) -> String {
        let promotionStatus = (promotionReadiness["status"] as? String) ?? "unknown"
        let evidenceLevel = (evidenceStrength["level"] as? String) ?? "unknown"
        let outcomeFocus: [String]
        switch decision {
        case "reject":
            outcomeFocus = [
                "What the suggestion harmed: name the jump, cadence break, visual mismatch, or false emphasis.",
                "Future learning: avoid repeating this cut pattern unless stronger source or reaction cover evidence appears.",
                "Reviewer stance: rejection is useful evidence, not a failed workflow."
            ]
        case "hold":
            outcomeFocus = [
                "Missing choice: name the taste, episode-shape, source-context, or human-review decision that would unblock this.",
                "Revisit trigger: decide what evidence or reviewer perspective should bring it back.",
                "Reviewer stance: parked means protected, not forgotten."
            ]
        case "needs-listen":
            outcomeFocus = [
                "Proof still needed: listen for cadence, breath, overlap, sentence meaning, and whether the cut feels human.",
                "Risk: do not record or promote while the audio evidence is still prompt-like or incomplete.",
                "Reviewer stance: ears first, metadata later."
            ]
        default:
            outcomeFocus = [
                "This decision does not have a non-promoting outcome packet. Use apply-preview, source-recovery, or visual-review instead."
            ]
        }

        var lines = [
            "Episode 4 decision-outcome brief",
            "",
            "Purpose: preserve proof-listen learning without writing timeline truth.",
            "Operation: \(operationId.isEmpty ? "unknown" : operationId)",
            "Range: \(sequenceLabel.isEmpty ? "unknown" : sequenceLabel)",
            "Decision: \(decision)",
            "Evidence strength: \(evidenceLevel)",
            "Promotion status: \(promotionStatus)",
            "Next safe action: \(nextSafeAction)",
            "",
            "Outcome focus:"
        ]
        lines.append(contentsOf: outcomeFocus.map { "- \($0)" })
        lines.append("")
        lines.append("Review evidence:")
        lines.append("- Summary: \(episode4Trimmed(summary, defaultValue: "not written"))")
        lines.append("- Audio/cadence evidence: \(episode4Trimmed(audio, defaultValue: "not written"))")
        lines.append("- Visual/reaction evidence: \(episode4Trimmed(visual, defaultValue: "not written"))")
        lines.append("- Preserve/tighten guidance: \(episode4Trimmed(cadence, defaultValue: "not written"))")
        lines.append("")

        if !missingWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: missingWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Outcome boundary:")
        lines.append("- This packet does not record a review decision.")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not import clips or mutate source media.")
        lines.append("- This packet does not export or publish.")
        return lines.joined(separator: "\n")
    }

    private nonisolated static func episode4ProofListenApplyPreviewPromotionProposal(
        candidatePayload: [String: Any],
        patchPlan: [String: Any],
        checklist: [String: Any],
        receiptTemplate: [String: Any]
    ) -> [String: Any] {
        let canCreateApplyPreview = (candidatePayload["canCreateApplyPreview"] as? Bool) ?? false
        return [
            "type": "episode4.applyPreviewPromotionProposal",
            "episode": "episode-4",
            "operationId": candidatePayload["operationId"] ?? "",
            "sequenceLabel": candidatePayload["sequenceLabel"] ?? "",
            "status": canCreateApplyPreview ? "proposal-ready" : "blocked",
            "candidateStatus": candidatePayload["status"] ?? "unknown",
            "patchStatus": patchPlan["status"] ?? "unknown",
            "checklistStatus": checklist["status"] ?? "unknown",
            "receiptTemplateStatus": receiptTemplate["status"] ?? "unknown",
            "decision": candidatePayload["decision"] ?? "",
            "previewKind": candidatePayload["previewKind"] ?? "",
            "requiresReceiptOutcome": "approve-preview",
            "canPromoteNow": false,
            "proposedMetadataPromotion": [
                "target": "timelineDecisionMetadata",
                "operation": "promoteApprovedApplyPreviewMetadata",
                "sourceOfTruth": "approvedPreviewReceipt",
                "patchKind": patchPlan["patchKind"] ?? "",
                "previewKind": candidatePayload["previewKind"] ?? "",
                "fieldsToPromote": [
                    "decisionIntent",
                    "cutCraftIntent",
                    "previewKind",
                    "reviewer",
                    "humanAudioNote",
                    "humanVisualNote",
                    "humanCadenceNote",
                    "approvedPreviewReceiptId"
                ],
                "receiptFieldsRequired": [
                    "receiptId",
                    "reviewer",
                    "outcome",
                    "reviewedAt",
                    "audioPass",
                    "visualPass",
                    "cadencePass",
                    "notes"
                ]
            ],
            "mustNotPromoteIf": [
                "No approve-preview receipt exists.",
                "Proof-listen evidence is placeholder or too vague.",
                "Source or visual review is unresolved.",
                "The proposed patch would mutate original media.",
                "The reviewer marked hold, reject, needs-listen, needs-source, or needs-visual-review."
            ],
            "sourceContext": [
                "candidatePayload": candidatePayload,
                "patchPlan": patchPlan,
                "approvalChecklist": checklist,
                "approvalReceiptTemplate": receiptTemplate
            ],
            "truth": [
                "proposalOnly": true,
                "recordsApproval": false,
                "writesTimelineMetadata": false,
                "mutatesSourceMedia": false,
                "exportsMedia": false,
                "publishesExternally": false,
                "overwritesExistingVersion": false
            ]
        ]
    }

    private nonisolated static func episode4ProofListenApplyPreviewPromotionReadinessBoard(
        candidatePayload: [String: Any],
        patchPlan: [String: Any],
        checklist: [String: Any],
        receiptTemplate: [String: Any],
        promotionProposal: [String: Any]
    ) -> [String: Any] {
        let canCreateApplyPreview = (candidatePayload["canCreateApplyPreview"] as? Bool) ?? false
        return [
            "type": "episode4.applyPreviewPromotionReadinessBoard",
            "episode": "episode-4",
            "operationId": candidatePayload["operationId"] ?? "",
            "sequenceLabel": candidatePayload["sequenceLabel"] ?? "",
            "status": canCreateApplyPreview ? "awaiting-approval-receipt" : "blocked",
            "decision": candidatePayload["decision"] ?? "",
            "canCreateApplyPreview": canCreateApplyPreview,
            "canPromoteNow": false,
            "nextSafeAction": canCreateApplyPreview
                ? "Create or inspect a reversible preview, then collect an approve-preview receipt before metadata promotion."
                : "Strengthen proof-listen evidence before preview work.",
            "gates": [
                [
                    "id": "candidate-payload",
                    "status": canCreateApplyPreview ? "ready" : "blocked",
                    "why": "Candidate payload exists only for evidence-ready keep/refine decisions.",
                    "evidence": candidatePayload["status"] ?? "unknown"
                ],
                [
                    "id": "patch-plan",
                    "status": patchPlan["status"] ?? "unknown",
                    "why": "Patch plan describes a reversible metadata preview, not a timeline write.",
                    "evidence": patchPlan["patchKind"] ?? ""
                ],
                [
                    "id": "approval-checklist",
                    "status": checklist["status"] ?? "unknown",
                    "why": "Checklist names what must pass before promotion.",
                    "evidence": checklist["mustPassBeforePromotion"] ?? []
                ],
                [
                    "id": "approval-receipt",
                    "status": "missing",
                    "why": "No reviewer has recorded approve-preview yet; promotion remains forbidden.",
                    "evidence": receiptTemplate["status"] ?? "unknown"
                ],
                [
                    "id": "promotion-proposal",
                    "status": promotionProposal["status"] ?? "unknown",
                    "why": "Proposal describes future metadata promotion only after approval exists.",
                    "evidence": promotionProposal["requiresReceiptOutcome"] ?? "approve-preview"
                ],
                [
                    "id": "timeline-write",
                    "status": "forbidden",
                    "why": "This board is read-only and must not mutate timeline metadata.",
                    "evidence": "proposal-only"
                ]
            ],
            "sourceContext": [
                "candidatePayload": candidatePayload,
                "patchPlan": patchPlan,
                "approvalChecklist": checklist,
                "approvalReceiptTemplate": receiptTemplate,
                "promotionProposal": promotionProposal
            ],
            "truth": [
                "proposalOnly": true,
                "recordsApproval": false,
                "writesTimelineMetadata": false,
                "mutatesSourceMedia": false,
                "exportsMedia": false,
                "publishesExternally": false,
                "overwritesExistingVersion": false
            ]
        ]
    }

    private nonisolated static func episode4ProofListenApplyPreviewCandidate(
        decision: String,
        missingWarnings: [String],
        promotionReadiness: [String: Any]
    ) -> [String: Any] {
        let canCreate = (promotionReadiness["canCreateApplyPreview"] as? Bool) ?? false
        let status = (promotionReadiness["status"] as? String) ?? "unknown"
        let blockers: [String]
        if !missingWarnings.isEmpty {
            blockers = ["weak-review-evidence"]
        } else {
            switch decision {
            case "needs-source":
                blockers = ["source-recovery-required"]
            case "needs-visual-review":
                blockers = ["visual-review-required"]
            case "reject":
                blockers = ["rejected-learning-evidence"]
            case "hold":
                blockers = ["parked-for-context"]
            case "needs-listen":
                blockers = ["proof-listen-required"]
            default:
                blockers = canCreate ? [] : ["not-previewable-decision"]
            }
        }

        return [
            "isCandidate": canCreate,
            "decision": decision,
            "promotionStatus": status,
            "blockers": blockers,
            "recommendedPreviewKind": decision == "refine" ? "refinement-preview" : (decision == "keep" ? "apply-preview" : "none"),
            "writesTimelineMetadata": false,
            "mutatesSourceMedia": false,
            "guidance": canCreate
                ? "Create a reversible preview packet before any timeline promotion."
                : "Do not create an apply-preview yet; resolve blockers first."
        ]
    }

    private nonisolated static func episode4ProofListenApplyPreviewBrief(
        operationId: String,
        sequenceLabel: String,
        decision: String,
        summary: String,
        audio: String,
        visual: String,
        cadence: String,
        missingWarnings: [String],
        evidenceStrength: [String: Any],
        nextSafeAction: String,
        promotionReadiness: [String: Any]
    ) -> String {
        let promotionStatus = (promotionReadiness["status"] as? String) ?? "unknown"
        let canCreateApplyPreview = ((promotionReadiness["canCreateApplyPreview"] as? Bool) ?? false) ? "yes" : "no"
        let evidenceLevel = (evidenceStrength["level"] as? String) ?? "unknown"
        var lines = [
            "Episode 4 apply-preview brief",
            "",
            "Purpose: carry one proof-listen decision into a reversible apply-preview review without writing timeline truth.",
            "Operation: \(operationId.isEmpty ? "unknown" : operationId)",
            "Range: \(sequenceLabel.isEmpty ? "unknown" : sequenceLabel)",
            "Decision: \(decision)",
            "Evidence strength: \(evidenceLevel)",
            "Promotion status: \(promotionStatus)",
            "Can create apply-preview: \(canCreateApplyPreview)",
            "Next safe action: \(nextSafeAction)",
            "",
            "Review note:",
            "- Summary: \(episode4Trimmed(summary, defaultValue: "not written"))",
            "- Audio/cadence evidence: \(episode4Trimmed(audio, defaultValue: "not written"))",
            "- Visual/reaction evidence: \(episode4Trimmed(visual, defaultValue: "not written"))",
            "- Preserve/tighten guidance: \(episode4Trimmed(cadence, defaultValue: "not written"))",
            ""
        ]

        if !missingWarnings.isEmpty {
            lines.append("Warnings:")
            lines.append(contentsOf: missingWarnings.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Apply-preview boundary:")
        lines.append("- This packet does not write timeline metadata.")
        lines.append("- This packet does not import clips or mutate source media.")
        lines.append("- This packet does not export or publish.")
        lines.append("- A later apply-preview pass must remain reversible until explicitly promoted.")
        return lines.joined(separator: "\n")
    }

    private nonisolated static func episode4LooksLikeEmptyOrPrompt(_ value: String) -> Bool {
        let text = value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if text.isEmpty { return true }
        let promptMarkers = [
            "add what",
            "add note",
            "proof-listened: add",
            "preserve human rhythm unless",
            "what the ear proved",
            "what the picture proved",
            "current proof window"
        ]
        if promptMarkers.contains(where: { text.contains($0) }) { return true }
        return text.hasSuffix("?")
    }

    private nonisolated static func episode4MentionsSourceNeed(summary: String, visual: String, cadence: String) -> Bool {
        let text = "\(summary) \(visual) \(cadence)".lowercased()
        return ["source", "clip", "b-roll", "broll", "camera", "reference", "watched"].contains { text.contains($0) }
    }

    private nonisolated static func episode4MentionsRefinementTarget(summary: String, cadence: String) -> Bool {
        let text = "\(summary) \(cadence)".lowercased()
        return ["boundary", "cadence", "reaction", "source", "timing", "framing", "caption", "short", "pause", "jump"].contains { text.contains($0) }
    }

    private nonisolated static func cachedEpisode4ProofListenCommandPreviewPayload(query: [String: String]) -> [String: Any] {
        let state = cachedEpisode4ProofListenNextPayload()
        let next = episode4Dictionary(state["next"])
        let suggestedDecision = episode4String(next["suggestedDecision"]) ?? "needs-listen"
        let allowedDecisions = [
            "needs-listen",
            "refine",
            "keep",
            "reject",
            "hold",
            "needs-source",
            "needs-visual-review"
        ]
        let requestedDecision = (query["decision"] ?? query["status"] ?? suggestedDecision)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .lowercased()
        let decision = allowedDecisions.contains(requestedDecision) ? requestedDecision : "needs-listen"
        let decisionGuidance = episode4ProofListenDecisionGuidanceMap()
        let evidenceRequirements = episode4ProofListenEvidenceRequirementMap()
        let reviewer = episode4Trimmed(query["reviewer"] ?? query["actor"], defaultValue: "Codex")
        let notes = episode4Trimmed(query["notes"] ?? query["note"], defaultValue: "Proof-listened: add note here.")
        let audioNote = episode4Trimmed(query["audio_note"] ?? query["audioNote"], defaultValue: "Add what the ear proved.")
        let visualNote = episode4Trimmed(query["visual_note"] ?? query["visualNote"], defaultValue: "Add what the picture proved.")
        let cadenceNote = episode4Trimmed(query["cadence_note"] ?? query["cadenceNote"], defaultValue: "Add what to preserve or tighten.")
        let missingEvidenceWarnings = episode4ProofListenMissingEvidenceWarnings(
            decision: decision,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote
        )
        let evidenceStrength = episode4ProofListenEvidenceStrength(
            missingWarnings: missingEvidenceWarnings,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote
        )
        let nextSafeAction = episode4ProofListenNextSafeAction(
            decision: decision,
            missingWarnings: missingEvidenceWarnings
        )
        let promotionReadiness = episode4ProofListenPromotionReadiness(
            decision: decision,
            missingWarnings: missingEvidenceWarnings
        )
        let applyPreviewCandidate = episode4ProofListenApplyPreviewCandidate(
            decision: decision,
            missingWarnings: missingEvidenceWarnings,
            promotionReadiness: promotionReadiness
        )
        let queueTriage = episode4ProofListenQueueTriage(
            decision: decision,
            missingWarnings: missingEvidenceWarnings
        )
        let cutCraftIntent = episode4ProofListenCutCraftIntent(
            decision: decision,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote,
            missingWarnings: missingEvidenceWarnings
        )
        let cutCraftReviewBrief = episode4ProofListenCutCraftReviewBrief(
            decision: decision,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote,
            missingWarnings: missingEvidenceWarnings,
            evidenceStrength: evidenceStrength,
            queueTriage: queueTriage,
            cutCraftIntent: cutCraftIntent
        )
        let applyPreviewWorkOrder = episode4ProofListenApplyPreviewWorkOrder(
            operationId: episode4String(next["operationId"]) ?? "",
            sequenceLabel: episode4String(next["sequenceLabel"]) ?? "",
            decision: decision,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote,
            missingWarnings: missingEvidenceWarnings,
            evidenceStrength: evidenceStrength,
            queueTriage: queueTriage,
            cutCraftIntent: cutCraftIntent,
            promotionReadiness: promotionReadiness
        )
        let applyPreviewCandidatePayload = episode4ProofListenApplyPreviewCandidatePayload(
            operationId: episode4String(next["operationId"]) ?? "",
            sequenceLabel: episode4String(next["sequenceLabel"]) ?? "",
            decision: decision,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote,
            missingWarnings: missingEvidenceWarnings,
            evidenceStrength: evidenceStrength,
            queueTriage: queueTriage,
            cutCraftIntent: cutCraftIntent,
            promotionReadiness: promotionReadiness
        )
        let applyPreviewPatchPlan = episode4ProofListenApplyPreviewPatchPlan(
            candidatePayload: applyPreviewCandidatePayload,
            queueTriage: queueTriage,
            cutCraftIntent: cutCraftIntent,
            promotionReadiness: promotionReadiness
        )
        let applyPreviewApprovalChecklist = episode4ProofListenApplyPreviewApprovalChecklist(
            candidatePayload: applyPreviewCandidatePayload,
            patchPlan: applyPreviewPatchPlan,
            missingWarnings: missingEvidenceWarnings
        )
        let applyPreviewApprovalReceiptTemplate = episode4ProofListenApplyPreviewApprovalReceiptTemplate(
            candidatePayload: applyPreviewCandidatePayload,
            patchPlan: applyPreviewPatchPlan,
            checklist: applyPreviewApprovalChecklist
        )
        let applyPreviewPromotionProposal = episode4ProofListenApplyPreviewPromotionProposal(
            candidatePayload: applyPreviewCandidatePayload,
            patchPlan: applyPreviewPatchPlan,
            checklist: applyPreviewApprovalChecklist,
            receiptTemplate: applyPreviewApprovalReceiptTemplate
        )
        let applyPreviewPromotionReadinessBoard = episode4ProofListenApplyPreviewPromotionReadinessBoard(
            candidatePayload: applyPreviewCandidatePayload,
            patchPlan: applyPreviewPatchPlan,
            checklist: applyPreviewApprovalChecklist,
            receiptTemplate: applyPreviewApprovalReceiptTemplate,
            promotionProposal: applyPreviewPromotionProposal
        )
        let sourceRecoveryBrief = episode4ProofListenSourceRecoveryBrief(
            operationId: episode4String(next["operationId"]) ?? "",
            sequenceLabel: episode4String(next["sequenceLabel"]) ?? "",
            decision: decision,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote,
            missingWarnings: missingEvidenceWarnings,
            nextSafeAction: nextSafeAction,
            promotionReadiness: promotionReadiness
        )
        let visualReviewBrief = episode4ProofListenVisualReviewBrief(
            operationId: episode4String(next["operationId"]) ?? "",
            sequenceLabel: episode4String(next["sequenceLabel"]) ?? "",
            decision: decision,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote,
            missingWarnings: missingEvidenceWarnings,
            nextSafeAction: nextSafeAction,
            promotionReadiness: promotionReadiness
        )
        let decisionOutcomeBrief = episode4ProofListenDecisionOutcomeBrief(
            operationId: episode4String(next["operationId"]) ?? "",
            sequenceLabel: episode4String(next["sequenceLabel"]) ?? "",
            decision: decision,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote,
            missingWarnings: missingEvidenceWarnings,
            evidenceStrength: evidenceStrength,
            nextSafeAction: nextSafeAction,
            promotionReadiness: promotionReadiness
        )
        let applyPreviewBrief = episode4ProofListenApplyPreviewBrief(
            operationId: episode4String(next["operationId"]) ?? "",
            sequenceLabel: episode4String(next["sequenceLabel"]) ?? "",
            decision: decision,
            summary: notes,
            audio: audioNote,
            visual: visualNote,
            cadence: cadenceNote,
            missingWarnings: missingEvidenceWarnings,
            evidenceStrength: evidenceStrength,
            nextSafeAction: nextSafeAction,
            promotionReadiness: promotionReadiness
        )
        let dryRunCommand = episode4ProofListenDecisionCommand(
            commandName: "episode4-recipe-proof-listen-next-decision-dry-run",
            decision: decision,
            reviewer: reviewer,
            notes: notes,
            audioNote: audioNote,
            visualNote: visualNote,
            cadenceNote: cadenceNote
        )
        let recordCommand = episode4ProofListenDecisionCommand(
            commandName: "episode4-recipe-proof-listen-next-decision",
            decision: decision,
            reviewer: reviewer,
            notes: notes,
            audioNote: audioNote,
            visualNote: visualNote,
            cadenceNote: cadenceNote
        )

        return [
            "status": "episode4_proof_listen_command_preview_ready",
            "episode": "episode-4",
            "operationId": episode4String(next["operationId"]) ?? "",
            "sequenceLabel": episode4String(next["sequenceLabel"]) ?? "",
            "decision": decision,
            "decisionGuidance": decisionGuidance[decision] ?? "",
            "evidenceRequirements": evidenceRequirements[decision] ?? [],
            "missingEvidenceWarnings": missingEvidenceWarnings,
            "reviewCompleteness": missingEvidenceWarnings.isEmpty ? "evidence-ready" : "needs-stronger-evidence",
            "evidenceStrength": evidenceStrength,
            "nextSafeAction": nextSafeAction,
            "promotionReadiness": promotionReadiness,
            "applyPreviewCandidate": applyPreviewCandidate,
            "queueTriage": queueTriage,
            "cutCraftIntent": cutCraftIntent,
            "cutCraftReviewBrief": cutCraftReviewBrief,
            "applyPreviewWorkOrder": applyPreviewWorkOrder,
            "applyPreviewCandidatePayload": applyPreviewCandidatePayload,
            "applyPreviewPatchPlan": applyPreviewPatchPlan,
            "applyPreviewApprovalChecklist": applyPreviewApprovalChecklist,
            "applyPreviewApprovalReceiptTemplate": applyPreviewApprovalReceiptTemplate,
            "applyPreviewPromotionProposal": applyPreviewPromotionProposal,
            "applyPreviewPromotionReadinessBoard": applyPreviewPromotionReadinessBoard,
            "canCreateApplyPreviewBrief": (promotionReadiness["canCreateApplyPreview"] as? Bool) ?? false,
            "applyPreviewBrief": applyPreviewBrief,
            "canCreateSourceRecoveryBrief": decision == "needs-source",
            "sourceRecoveryBrief": sourceRecoveryBrief,
            "canCreateVisualReviewBrief": decision == "needs-visual-review",
            "visualReviewBrief": visualReviewBrief,
            "canCreateDecisionOutcomeBrief": ["reject", "hold", "needs-listen"].contains(decision),
            "decisionOutcomeBrief": decisionOutcomeBrief,
            "recordCommandRecommended": missingEvidenceWarnings.isEmpty,
            "recordingRecommendation": missingEvidenceWarnings.isEmpty
                ? "Dry-run first, then record only if the proof-listen result still matches."
                : "Do not record yet. Strengthen the review evidence until missingEvidenceWarnings is empty; dry-run remains safe.",
            "reviewer": reviewer,
            "notes": [
                "summary": notes,
                "audio": audioNote,
                "visual": visualNote,
                "cadence": cadenceNote
            ],
            "commands": [
                "dryRun": dryRunCommand,
                "record": recordCommand
            ],
            "recommendedFirstAction": "Run or inspect the dryRun command before using the record command.",
            "truth": [
                "readOnlyPreview": true,
                "endpointExecutedCommand": false,
                "reviewDecisionRecordedByThisEndpoint": false,
                "dryRunCommandWrites": "none",
                "recordCommandWrites": "sidecar-review-ledger-only",
                "timelineDecisionsWritten": false,
                "clipsImported": false,
                "sourceFilesMutated": false,
                "exportsRendered": false,
                "externalPublishing": false
            ]
        ]
    }

    private nonisolated static func episode4ProofListenDecisionCommand(
        commandName: String,
        decision: String,
        reviewer: String,
        notes: String,
        audioNote: String,
        visualNote: String,
        cadenceNote: String
    ) -> String {
        [
            "./script/agentctl.sh",
            commandName,
            decision,
            episode4ShellQuote(reviewer),
            episode4ShellQuote(notes),
            "--audio-note",
            episode4ShellQuote(audioNote),
            "--visual-note",
            episode4ShellQuote(visualNote),
            "--cadence-note",
            episode4ShellQuote(cadenceNote),
            "--markdown"
        ].joined(separator: " ")
    }

    private nonisolated static func episode4ShellQuote(_ value: String) -> String {
        "'\(value.replacingOccurrences(of: "'", with: "'\"'\"'"))'"
    }

    private nonisolated static func episode4ProofListenReviewerPrompt(
        operationId: String,
        sequenceLabel: String,
        reviewMode: String,
        suggestedDecision: String,
        audioPath: String,
        proofQuestion: String,
        whyFirst: String,
        listenChecks: [String],
        visualChecks: [String]
    ) -> String {
        var lines = [
            "Episode 4 proof-listen review",
            "",
            "Operation: \(operationId.isEmpty ? "unknown" : operationId)",
            "Range: \(sequenceLabel.isEmpty ? "unknown" : sequenceLabel)",
            "Mode: \(reviewMode.isEmpty ? "listen-first" : reviewMode)",
            "Suggested decision: \(suggestedDecision.isEmpty ? "needs-listen" : suggestedDecision)",
            ""
        ]

        if !audioPath.isEmpty {
            lines.append("Proof audio: \(audioPath)")
            lines.append("")
        }

        if !proofQuestion.isEmpty {
            lines.append("Main question: \(proofQuestion)")
            lines.append("")
        }

        if !whyFirst.isEmpty {
            lines.append("Why this matters: \(whyFirst)")
            lines.append("")
        }

        if !listenChecks.isEmpty {
            lines.append("Listen for:")
            lines.append(contentsOf: listenChecks.map { "- \($0)" })
            lines.append("")
        }

        if !visualChecks.isEmpty {
            lines.append("Watch for:")
            lines.append(contentsOf: visualChecks.map { "- \($0)" })
            lines.append("")
        }

        lines.append("Answer in plain English:")
        lines.append("- Keep, refine, reject, or needs-listen?")
        lines.append("- What did the audio/cadence prove?")
        lines.append("- What did the picture/reaction prove?")
        lines.append("- What should Quipsly preserve or tighten?")
        lines.append("")
        lines.append("Safety: this prompt is review-only. Do not overwrite edits or publish from this note.")
        return lines.joined(separator: "\n")
    }

    private nonisolated static func episode4LoadPointedPayload(pointer: [String: Any]) -> [String: Any] {
        for key in ["jsonPath", "ledgerPath", "manifestPath"] {
            guard let path = episode4String(pointer[key]), !path.isEmpty else { continue }
            let payload = humanFlowReviewJSON(URL(fileURLWithPath: path))
            if !payload.isEmpty { return payload }
        }
        return pointer
    }

    private nonisolated static func episode4Dictionary(_ value: Any?) -> [String: Any] {
        value as? [String: Any] ?? [:]
    }

    private nonisolated static func episode4Array(_ value: Any?) -> [[String: Any]] {
        value as? [[String: Any]] ?? []
    }

    private nonisolated static func episode4StringArray(_ value: Any?) -> [String] {
        (value as? [Any] ?? []).compactMap { episode4String($0) }
    }

    private nonisolated static func episode4String(_ value: Any?) -> String? {
        if let value = value as? String { return value }
        if let value { return String(describing: value) }
        return nil
    }

    private nonisolated static func episode4Double(_ value: Any?) -> Double {
        if let value = value as? Double { return value }
        if let value = value as? Float { return Double(value) }
        if let value = value as? Int { return Double(value) }
        if let value = value as? NSNumber { return value.doubleValue }
        if let value = value as? String { return Double(value) ?? 0 }
        return 0
    }

    private nonisolated static func episode4Bool(_ value: Any?) -> Bool {
        if let value = value as? Bool { return value }
        if let value = value as? NSNumber { return value.boolValue }
        if let value = value as? String {
            return ["1", "true", "yes", "on"].contains(value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
        }
        return false
    }

    private nonisolated static func episode4Trimmed(_ value: String?, defaultValue: String) -> String {
        let trimmed = (value ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? defaultValue : trimmed
    }

    private nonisolated static func commandsPayload() -> [String: Any] {
        [
            "status": "ok",
            "commands": [
                "GET /health",
                "GET /commands",
                "GET /agent_manual",
                "GET /agent_capabilities",
                "GET /active_source_map",
                "GET /codex_editor_handoff",
                "GET /editor_loop_proof",
                "CLI script/agentctl.sh studio-goal-review-board --markdown",
                "CLI script/agentctl.sh studio-goal-review-board --json",
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
                "GET /left_workbench?mode=os|nest|inspector|cuts|shorts|transcript|publish|agent|closed",
                "GET /cut_cadence_mode?mode=warm-conversation|tight-youtube|shorts-energy|documentary-thoughtful|chaotic-fun-but-legible",
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
                "GET /cut_recipe_queue?mode=any|jump|reaction|pause|preserve|split|safe&limit=<count>",
                "GET /decision_human_flow_queue?mode=any|jump|reaction|pause|preserve|split|safe&limit=<count>",
                "GET /cut_recipe_next?mode=any|jump|reaction|pause|preserve|split|safe",
                "GET /decision_human_flow_next?mode=any|jump|reaction|pause|preserve|split|safe",
                "GET /cut_recipe_preview?id=<recipe-id>",
                "GET /cut_recipe_apply?id=<recipe-id>&confirm=true",
                "GET /cut_craft_guidance",
                "GET /cut_technique_playbook",
                "GET /selected_decision_intent_note?note=<why-this-boundary-feels-right-or-wrong>&actor=<name>&actor_type=human|agent&category=cut-choice|cadence|reaction|jump-cut",
                "GET /selected_decision_intent_status?status=needs-listen|refine|keep|hold&actor=<name>&actor_type=human|agent&note=<optional-review-note>",
                "CLI script/agentctl.sh decision-listen [actor] [note]",
                "CLI script/agentctl.sh decision-refine [actor] [note]",
                "CLI script/agentctl.sh decision-keep [actor] [note]",
                "CLI script/agentctl.sh decision-hold [actor] [note]",
                "CLI script/agentctl.sh cut-craft-guidance",
                "CLI script/agentctl.sh cut-technique-playbook [--markdown]",
                "CLI script/agentctl.sh cut-review-brief [any|jump|reaction|pause|preserve|split|safe] [--markdown|--json]",
                "CLI script/agentctl.sh cut-review-brief-save [output-folder] [any|jump|reaction|pause|preserve|split|safe] [basename] [--markdown|--json]",
                "CLI script/agentctl.sh decision-review-brief [--markdown|--json]",
                "CLI script/agentctl.sh decision-review-brief-save [output-folder] [basename] [--markdown|--json]",
                "GET /selected_decision_state_contract",
                "GET /selected_decision_human_cut_guidance",
                "GET /selected_decision_review_trail",
                "CLI script/agentctl.sh selected-decision-state-contract-check [--markdown|--json]",
                "CLI script/agentctl.sh selected-decision-human-cut-guidance [--markdown|--json]",
                "CLI script/agentctl.sh selected-decision-review-trail",
                "CLI script/agentctl.sh selected-decision-human-cut-guidance-save [output-folder] [basename] [--markdown|--json]",
                "CLI script/agentctl.sh selected-decision-review-packet-save [output-folder] [basename] [--json]",
                "GET /selected_decision_cut_intelligence",
                "GET /selected_decision_human_flow",
                "GET /human_flow_review_state",
                "GET /selected_decision_intent_evidence",
                "GET /episode4_cut_intelligence_state",
                "GET /episode4_proof_listen_next",
                "CLI script/agentctl.sh episode4-proof-listen-evidence",
                "CLI script/agentctl.sh episode4-proof-listen-defaults",
                "CLI script/agentctl.sh episode4-proof-listen-triage",
                "CLI script/agentctl.sh episode4-proof-listen-triage-preview hold Codex \"Good idea but needs human taste review\" \"Audio is plausible\" \"Visual source is ambiguous\" \"Park until the episode shape is clearer\"",
                "CLI script/agentctl.sh episode4-proof-listen-cut-craft-intent",
                "CLI script/agentctl.sh episode4-proof-listen-cut-craft-intent-preview refine Codex \"Reaction cover may fix a same-speaker jump\" \"Preserve the breath before the answer\" \"Listener face covers the pop\" \"Do not over-tighten\"",
                "CLI script/agentctl.sh episode4-proof-listen-cut-craft-review-brief",
                "CLI script/agentctl.sh episode4-proof-listen-cut-craft-review-brief-preview refine Codex \"Reaction cover may fix a same-speaker jump\" \"Preserve the breath before the answer\" \"Listener face covers the pop\" \"Do not over-tighten\"",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-work-order",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-work-order-preview refine Codex \"Reaction cover may fix a same-speaker jump\" \"Preserve the breath before the answer\" \"Listener face covers the pop\" \"Do not over-tighten\"",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-candidate-json",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-candidate-json-preview refine Codex \"Reaction cover may fix a same-speaker jump\" \"Preserve the breath before the answer\" \"Listener face covers the pop\" \"Do not over-tighten\"",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-patch-plan-json",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-patch-plan-json-preview refine Codex \"Reaction cover may fix a same-speaker jump\" \"Preserve the breath before the answer\" \"Listener face covers the pop\" \"Do not over-tighten\"",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-approval-checklist-json",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-approval-checklist-json-preview refine Codex \"Reaction cover may fix a same-speaker jump\" \"Preserve the breath before the answer\" \"Listener face covers the pop\" \"Do not over-tighten\"",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-approval-receipt-template-json",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-approval-receipt-template-json-preview refine Codex \"Reaction cover may fix a same-speaker jump\" \"Preserve the breath before the answer\" \"Listener face covers the pop\" \"Do not over-tighten\"",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-promotion-proposal-json",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-promotion-proposal-json-preview refine Codex \"Reaction cover may fix a same-speaker jump\" \"Preserve the breath before the answer\" \"Listener face covers the pop\" \"Do not over-tighten\"",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-promotion-readiness-board-json",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-promotion-readiness-board-json-preview refine Codex \"Reaction cover may fix a same-speaker jump\" \"Preserve the breath before the answer\" \"Listener face covers the pop\" \"Do not over-tighten\"",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-brief",
                "CLI script/agentctl.sh episode4-proof-listen-apply-preview-brief-preview refine Codex \"Refine the boundary after listening\" \"Audio lands naturally\" \"Reaction cover looks clean\" \"Preserve the pause before the answer\"",
                "CLI script/agentctl.sh episode4-proof-listen-source-recovery-brief",
                "CLI script/agentctl.sh episode4-proof-listen-source-recovery-brief-preview needs-source Codex \"Missing watched clip needs recovery\" \"Audio says the source matters\" \"Need b-roll/reference media\" \"Park until source is found\"",
                "CLI script/agentctl.sh episode4-proof-listen-visual-review-brief",
                "CLI script/agentctl.sh episode4-proof-listen-visual-review-brief-preview needs-visual-review Codex \"Audio works but picture needs checking\" \"Cadence sounds plausible\" \"Check reaction cover and jump cut\" \"Do not promote until visual proof is clean\"",
                "CLI script/agentctl.sh episode4-proof-listen-decision-outcome-brief",
                "CLI script/agentctl.sh episode4-proof-listen-decision-outcome-brief-preview hold Codex \"Good idea but needs human taste review\" \"Audio is plausible\" \"Visual source is ambiguous\" \"Park until the episode shape is clearer\"",
                "GET /episode4_proof_listen_command_preview?decision=needs-listen&reviewer=Codex&notes=...&audio_note=...&visual_note=...&cadence_note=...",
                "CLI script/agentctl.sh episode4-proof-listen-command-preview needs-listen Codex \"Proof-listened notes\" \"audio evidence\" \"visual evidence\" \"cadence guidance\"",
                "CLI script/agentctl.sh decision-cut-intelligence",
                "CLI script/agentctl.sh decision-human-flow",
                "CLI script/agentctl.sh decision-human-flow-queue",
                "CLI script/agentctl.sh decision-human-flow-next",
                "CLI script/agentctl.sh human-flow-review-workbench",
                "CLI script/agentctl.sh human-flow-start-here",
                "CLI script/agentctl.sh human-flow-review-state",
                "CLI script/agentctl.sh human-flow-pipeline-check",
                "CLI script/agentctl.sh human-flow-review-decision latest <boundary-id> \"Keep the cadence\" Mako \"normal-speed review note\"",
                "CLI script/agentctl.sh human-flow-review-promotion-plan",
                "CLI script/agentctl.sh human-flow-review-approval latest <action-ref> approve Mako \"approved after review\"",
                "CLI script/agentctl.sh human-flow-approved-patch-packet",
                "CLI script/agentctl.sh human-flow-demo-fixture",
                "CLI script/agentctl.sh human-flow-smoke",
                "CLI script/agentctl.sh human-flow-runbook",
                "CLI script/agentctl.sh editor-review-cockpit [--markdown|--json]",
                "CLI script/agentctl.sh editor-review-cockpit-save [output-folder] [basename] [--markdown|--json]",
                "CLI script/agentctl.sh decision-intent-evidence",
                "CLI script/agentctl.sh selected-decision-review-mode",
                "GET /selected_short_quality",
                "GET /selected_short_human_review_guidance",
                "GET /selected_short_production_brief",
                "CLI script/agentctl.sh selected-short-quality",
                "CLI script/agentctl.sh selected-short-production-brief [--markdown|--json]",
                "CLI script/agentctl.sh selected-short-production-brief-save [output-folder] [basename] [--markdown|--json]",
                "CLI script/agentctl.sh selected-short-human-review-guidance [--markdown|--json]",
                "CLI script/agentctl.sh selected-short-review-mode",
                "CLI script/agentctl.sh selected-short-review-brief --markdown",
                "CLI script/agentctl.sh selected-short-review-brief-save",
                "GET /select_lane?lane_id=<uuid-or-name>",
                "GET /format?value=16:9|9:16",
                "GET /program_crop_mode?mode=baseline|keyframe",
                "GET /program_crop?lane_id=<uuid-or-name>&format=16:9|9:16&pan_x=<minus1-to-1>&pan_y=<minus1-to-1>&zoom=<1-to-4>",
                "GET /program_crop_preset?lane_id=<uuid-or-name>&format=16:9|9:16&preset=centered|tighter|looser|headroom|upper-third|left|right|solo-safe|hide-desk|weight-left|weight-right|vertical-solo|vertical-punch|stack-top|stack-bottom&mode=baseline|keyframe&time=<seconds>",
                "GET /program_crop_keyframe?lane_id=<uuid-or-name>&format=16:9|9:16&time=<sequence-seconds>&pan_x=<minus1-to-1>&pan_y=<minus1-to-1>&zoom=<1-to-4>",
                "GET /program_crop_keyframe?lane_id=<uuid-or-name>&format=16:9|9:16&time=<sequence-seconds>&pan_x_delta=<value>&pan_y_delta=<value>&zoom_delta=<value>",
                "GET /program_crop_clear_keyframes?lane_id=<uuid-or-name>&format=16:9|9:16",
                "GET /clip_focus_layout?format=16:9|9:16&placement=cornerSquares|clipAbove|sideRail|hostWings&reaction_size=<0.12-to-0.42>&content_mode=fit|fill",
                "GET /program_ambiguity_report?sample_limit=<optional-count>",
                "GET /program_ambiguity_review?mode=first|previous|next|last|nearest&sample_limit=<optional-count>",
                "GET /program_ambiguity_resolve?choice=first|second|third|first_clip|second_clip|skip|<lane-id-or-name>&advance=next",
                "GET /program_ambiguity_batch?mode=preview|apply&max_count=<small-count>&min_confidence=<0-to-1>",
                "GET /program_ambiguity_manual_review?choice=<choice>&note=<why>&actor=<name>&actor_type=human|agent&apply=0|1",
                "GET /edit_pass?label=<name>&actor=<name>&actor_type=human|agent&pass_number=<n>&goal=<text>&status=active|review|complete",
                "GET /create_branch?name=<branch-name>&role=experiment|short|longform|sync-baseline&purpose=<text>",
                "GET /import_render_branch?path=<absolute-manifest-json-path>&actor=<name>",
                "GET /switch_branch?id=<sequence-id>|name=<branch-name>|role=<branch-role>",
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
                "GET /shorts_review_next_cut_risk?mode=risk|opportunity|any",
                "GET /shorts_queue_remove?id=<short-clip-id>",
                "GET /shorts_queue_update_selected?field=title|hook|caption|overlay|notes|review_status|export_status&value=<text>",
                "GET /shorts_quality_action?action=fill-hook|sharpen-hook|draft-copy|draft-platform-pack|draft-all-platform-packs|copy-platform-pack-json|save-platform-pack-json|copy-polish-prompt|needs-refine",
                "GET /shorts_platform_pack_index?action=save|copy",
                "GET /shorts_overlay_burn_in?decision=approve|hold&note=<optional-review-note>",
                "GET /shorts_listen_through?note=<optional-review-note>",
                "GET /shorts_edit_flow_scan?concern=true|false&note=<technical-scan-note>",
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
                    "examples": ["/relink_lane", "/match_folder", "/vault_lane", "/retry_proxies"],
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
                "GET /active_source_map",
                "GET /agent_capabilities",
                "GET /codex_editor_handoff",
                "GET /commands"
            ]
        ]
    }

    private func activeSourceMapPayload() -> [String: Any] {
        let status = lastStatus ?? [:]
        let currentSwiftRoots: [String] = [
            "apps/QuipslyStudio/Sources/SharedUI",
            "apps/QuipslyStudio/Sources/QuipslyVideoCore",
            "apps/QuipslyStudio/Sources/QuipslyMac",
            "apps/QuipslyStudio/Sources/QuipslyiOS"
        ]
        let importantLiveFiles: [String] = [
            "apps/QuipslyStudio/Sources/SharedUI/WorkspaceView.swift",
            "apps/QuipslyStudio/Sources/SharedUI/TimelineEditorView.swift",
            "apps/QuipslyStudio/Sources/SharedUI/RightSidebarView.swift",
            "apps/QuipslyStudio/Sources/SharedUI/InspectorSidebarView.swift",
            "apps/QuipslyStudio/Sources/SharedUI/AgentServer.swift",
            "apps/QuipslyStudio/Sources/QuipslyVideoCore/CoreModels.swift",
            "apps/QuipslyStudio/Sources/QuipslyVideoCore/ProjectStore.swift",
            "apps/QuipslyStudio/Sources/QuipslyVideoCore/PlaybackEngine.swift",
            "apps/QuipslyStudio/Sources/QuipslyVideoCore/CutIntelligence.swift",
            "apps/QuipslyStudio/Sources/QuipslyVideoCore/AVExportRenderer.swift"
        ]
        let agentLoop: [[String: String]] = [
            ["step": "observe", "proof": "GET /state, GET /editor_snapshot, GET /active_source_map"],
            ["step": "choose", "proof": "Use semantic commands and currentSafeActions, not pixel guessing."],
            ["step": "act", "proof": "Use endpoints such as /scrub, /select_decision, /decision, /trim_selected, /source_window, /timeline_zoom, /selected_decision_intent_note."],
            ["step": "reobserve", "proof": "Command acknowledgements are not final state. Re-read /state or /editor_snapshot."],
            ["step": "explain", "proof": "Record why the edit helps or why it is held for review."]
        ]
        let runtimeContext: [String: Any] = [
            "activeSessionName": status["activeSessionName"] ?? "",
            "sequenceTitle": status["sequenceTitle"] ?? status["activeSequenceTitle"] ?? "",
            "playhead": status["playhead"] ?? status["playheadSeconds"] ?? 0,
            "playbackMode": status["playbackMode"] ?? "",
            "playbackFormat": status["playbackFormat"] ?? "",
            "selectedLaneName": status["selectedLaneName"] ?? "",
            "selectedTagType": status["selectedTagType"] ?? "",
            "selectedShortClipId": status["selectedShortClipId"] ?? "",
            "productionReady": status["productionReady"] ?? false,
            "visualRoughCutReady": status["visualRoughCutReady"] ?? false
        ]

        let payload: [String: Any] = [
            "status": "ok",
            "packetType": "quipslystudio-active-source-map",
            "payloadVersion": 1,
            "generatedAt": ISO8601DateFormatter().string(from: Date()),
            "purpose": "Prevent stale-path drift and keep humans, Codex, and helper agents aligned on the live Quipsly Studio product surface.",
            "activeProductSurface": "apps/QuipslyStudio",
            "sourceMapFile": "/Users/wall-e/Dev/high-ground-studio/apps/QuipslyStudio/docs/coordination/active-source-map.md",
            "currentSwiftRoots": currentSwiftRoots,
            "importantLiveFiles": importantLiveFiles,
            "legacyReferenceOnly": [
                "apps/quipsly-mac",
                "apps/quipsly-video",
                "apps/quipsly-video-desktop-trash",
                "older apps/studio editor patterns",
                "stale paths like apps/QuipslyStudio/Sources/QuipslyStudio"
            ],
            "purposefulChangeRule": [
                "This map is not a prison. Change structure when product truth demands it, but do not drift by accident.",
                "Before changing architecture, name the active truth, the proposed truth, and why the new shape helps users, agents, validation, publishing, or source safety.",
                "Move, archive, or delete old code deliberately instead of leaving mystery duplicates.",
                "Update the source map and affected runbooks before another agent has to guess.",
                "Prove the new path through the narrowest useful running-app, endpoint, or script evidence."
            ],
            "rabbitHoleWarnings": [
                "A prompt, old doc, or memory references a path that no current map confirms.",
                "Code is added beside a legacy system because the agent is unsure which one is live.",
                "A UI or workflow is rebuilt to match a stale architecture instead of the current product invariant.",
                "A compatibility layer exists only because no one wanted to make a decision.",
                "The app works in one script but the visible product surface, source map, and agent endpoint disagree."
            ],
            "migrationRule": [
                "Moving or replacing architecture is allowed.",
                "Before a substantial move, name the current active path and proposed new path.",
                "Explain why the move improves product truth or agent/human usability.",
                "Preserve or intentionally archive useful code before deletion.",
                "Update this endpoint's backing source map and run the narrowest validation that proves the new path is active."
            ],
            "currentGoalContract": [
                "primarySurface": "apps/QuipslyStudio",
                "proofLanes": ["episode-1", "episode-2", "episode-3", "episode-5", "episode-6"],
                "episode4Policy": "Keep Episode 4 synced and reviewable with current media, but do not stall while watched/source clips are missing.",
                "editorInvention": "Whole synced sources stay intact. SHOW/SKIP, source windows, trims, reframes, shorts recipes, and publication packets are transparent metadata.",
                "qualityDirection": [
                    "improve human-feeling cuts",
                    "support J-cuts and L-cuts as metadata decisions",
                    "use reaction covers intentionally",
                    "preserve cadence when silence carries meaning",
                    "make shorts recipes platform-ready without hiding tradeoffs"
                ]
            ],
            "nonNegotiableInvariants": [
                "Never mutate original source media.",
                "Never overwrite previous exports.",
                "Use proxies, sidecars, manifests, and session metadata.",
                "Prepared artifacts are not published artifacts.",
                "Publication requires explicit human approval and real receipt truth.",
                "Do not infer product truth from screen coordinates when /state or semantic endpoints can answer."
            ],
            "agentLoop": agentLoop,
            "safeFallbackLadder": [
                "If one episode stalls, work another proof lane.",
                "If Episode 4 is missing clips, mark the uncertainty and continue elsewhere.",
                "If UI work blocks editing, improve agent state/control surfaces.",
                "If export or publishing blocks, improve manifests, review boards, metadata packets, or receipt slots.",
                "If architecture is wrong, refactor deliberately rather than layering more patchwork."
            ],
            "runtimeContext": runtimeContext,
            "truth": "This endpoint is orientation and guardrail truth for active Studio work. It does not claim export readiness, human approval, or publication."
        ]
        return payload
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

    private nonisolated static func cachedCutRecipePreviewPayload(recipeId rawRecipeId: String) -> [String: Any] {
        func fallbackSplitRecommendation(from intent: [String: Any]) -> [String: Any] {
            let cutStyle = staticStringValue(intent["cutStyle"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let cover = staticStringValue(intent["coverStrategy"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let lane = staticStringValue(intent["reactionCoverLaneName"]).trimmingCharacters(in: .whitespacesAndNewlines)
            let lead = staticDoubleValue(intent["audioLeadSeconds"])
            let tail = staticDoubleValue(intent["audioTailSeconds"])
            if cutStyle.contains("j-cut") || lead > 0.03 {
                return [
                    "recommendedTechnique": "j-cut",
                    "timingIntent": "Let the next speaker's audio lead the visual cut by a small amount.",
                    "audioTreatment": String(format: "Try next-speaker audio lead around %.2fs; keep it subtle.", max(0.12, abs(lead))),
                    "visualTreatment": "Keep the visual change at the decision boundary unless the reaction reads better slightly later.",
                    "reviewQuestion": "Does the reply gain momentum, or does it feel like the next speaker is stepping on the previous thought?",
                    "doNotAutomate": "Do not increase the lead just to remove silence; protect interruption timing and emotional beats."
                ]
            }
            if cutStyle.contains("l-cut") || tail > 0.03 {
                return [
                    "recommendedTechnique": "l-cut",
                    "timingIntent": "Let the previous speaker's audio tail continue under the next visual source.",
                    "audioTreatment": String(format: "Try previous-speaker audio tail around %.2fs; review by ear.", max(0.18, abs(tail))),
                    "visualTreatment": lane.isEmpty ? "Try a reaction or alternate source while the prior thought lands." : "Use \(lane) only while it clarifies the moment.",
                    "reviewQuestion": "Does the audio tail preserve warmth and thought, or does it hide a timing problem too neatly?",
                    "doNotAutomate": "Do not smooth every boundary; some straight cuts and pauses should stay honest."
                ]
            }
            if cover.contains("reaction") {
                return [
                    "recommendedTechnique": "reaction-cover",
                    "timingIntent": "Hold the conversation timing while covering a visual jump with a reaction or listening shot.",
                    "audioTreatment": "Keep source audio continuous unless a tiny J/L offset makes the exchange feel more natural.",
                    "visualTreatment": lane.isEmpty ? "Find the best listening/reaction source at this sequence time." : "Try \(lane) as the cover source.",
                    "reviewQuestion": "Does the reaction add human context, or is it only hiding a cut?",
                    "doNotAutomate": "Do not use a reaction cover if it distracts from the speaker or feels emotionally false."
                ]
            }
            if cutStyle.contains("pause") || cutStyle.contains("cadence") || cutStyle.contains("over-tightened") {
                return [
                    "recommendedTechnique": "preserve-or-gently-shape-air",
                    "timingIntent": "Classify the pause before deleting it.",
                    "audioTreatment": "Preserve breath, laugh, thinking, comic timing, or emotional reset when it carries meaning.",
                    "visualTreatment": "Leave the visual source stable unless a reaction or reframe helps the pause read as intentional.",
                    "reviewQuestion": "Is this dead air, or is it doing social, comic, or emotional work?",
                    "doNotAutomate": "Do not treat silence as waste until transcript, listening, and reaction context agree."
                ]
            }
            return [
                "recommendedTechnique": "straight-cut-review",
                "timingIntent": "Start with a straight cut and only add split timing if the boundary feels stiff.",
                "audioTreatment": "Keep audio aligned unless a small lead/tail improves human flow.",
                "visualTreatment": "Use the selected source decision as-is unless the monitor wall reveals a better reaction.",
                "reviewQuestion": "Does the boundary disappear, or does it need a tiny timing or cover adjustment?",
                "doNotAutomate": "Do not decorate clean cuts; invisible is often better than clever."
            ]
        }

        let recipeId = rawRecipeId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !recipeId.isEmpty else {
            return [
                "status": "missing_cut_recipe_id",
                "model": "quipslystudio-cut-recipe-preview",
                "truth": "Read-only preview. It does not approve, apply, export, publish, trim, or mutate source media."
            ]
        }
        guard let status = cachedStatusDictionary() else {
            return [
                "status": "no_state_yet",
                "model": "quipslystudio-cut-recipe-preview",
                "hint": "Open QuipslyStudio and load a native editor session, then call /cut_recipe_preview again.",
                "truth": "Read-only preview. It does not approve, apply, export, publish, trim, or mutate source media."
            ]
        }
        let cutIntelligence = (status["cutIntelligenceReport"] as? [String: Any])
            ?? (status["cutIntelligence"] as? [String: Any])
            ?? [:]
        let modelQueue = cutIntelligence["recipeReviewQueue"] as? [[String: Any]] ?? []
        let normalizedMode = "any"
        let limit = 8
        if !modelQueue.isEmpty {
            func queueEntryText(_ entry: [String: Any]) -> String {
                [
                    staticStringValue(entry["label"]),
                    staticStringValue(entry["recommendedTechnique"]),
                    staticStringValue(entry["reviewClass"]),
                    staticStringValue(entry["reviewClassExplanation"]),
                    staticStringValue(entry["techniqueTradeoffExplanation"]),
                    staticStringValue(entry["techniqueReviewQuestion"]),
                    staticStringValue(entry["agentTechniqueRule"]),
                    staticStringValue(entry["preservationWarning"]),
                    staticStringValue(entry["risk"]),
                    staticStringValue(entry["cutStyle"]),
                    staticStringValue(entry["coverStrategy"]),
                    staticStringValue(entry["nextReviewAction"]),
                    (entry["humanReviewChecklist"] as? [String] ?? []).joined(separator: " ")
                ]
                .joined(separator: " ")
                .lowercased()
            }
            func queueEntryMatchesMode(_ entry: [String: Any]) -> Bool {
                let text = queueEntryText(entry)
                switch normalizedMode {
                case "jump", "jump-cut", "jumpcut":
                    return text.contains("jump")
                case "reaction", "cover":
                    return text.contains("reaction") || text.contains("cover")
                case "pause", "air", "cadence":
                    return text.contains("pause") || text.contains("air") || text.contains("cadence") || text.contains("breath") || text.contains("laugh")
                case "preserve", "preservation", "human-air", "protect-air", "meaning-air", "do-not-cut":
                    return !staticStringValue(entry["preservationWarning"]).isEmpty
                        || text.contains("meaning-bearing")
                        || text.contains("do not optimize")
                        || text.contains("preserve")
                        || text.contains("awkward warmth")
                        || text.contains("emotional reset")
                        || text.contains("thinking time")
                        || text.contains("breath")
                        || text.contains("laugh")
                case "split", "j-l", "jl":
                    return text.contains("j-cut") || text.contains("l-cut") || text.contains("split") || text.contains("reaction")
                case "safe", "low-risk":
                    let risk = staticStringValue(entry["risk"]).lowercased()
                    let confidence = staticDoubleValue(entry["confidence"])
                    let reviewClass = staticStringValue(entry["reviewClass"]).lowercased()
                    return reviewClass == "safe_preview_candidate" || (!risk.contains("high") && confidence >= 0.45)
                default:
                    return true
                }
            }

            let filteredQueue = modelQueue.filter(queueEntryMatchesMode)
            let rankedQueue = (filteredQueue.isEmpty ? modelQueue : filteredQueue)
                .sorted { left, right in
                    let leftPriority = Int(staticDoubleValue(left["reviewPriority"]))
                    let rightPriority = Int(staticDoubleValue(right["reviewPriority"]))
                    if leftPriority == rightPriority {
                        return staticDoubleValue(left["sequenceTime"]) < staticDoubleValue(right["sequenceTime"])
                    }
                    return leftPriority > rightPriority
                }
            let cards = rankedQueue.prefix(limit).map { entry -> [String: Any] in
                let recipeId = staticStringValue(entry["id"])
                return [
                    "id": recipeId,
                    "label": entry["label"] ?? "",
                    "sequenceTime": entry["sequenceTime"] ?? 0,
                    "targetLaneName": entry["targetLaneName"] ?? "",
                    "technique": entry["recommendedTechnique"] ?? "",
                    "reviewClass": entry["reviewClass"] ?? "",
                    "reviewClassExplanation": entry["reviewClassExplanation"] ?? "",
                    "reviewPriority": entry["reviewPriority"] ?? 0,
                    "risk": entry["risk"] ?? "",
                    "confidence": entry["confidence"] ?? 0,
                    "cutStyle": entry["cutStyle"] ?? "",
                    "coverStrategy": entry["coverStrategy"] ?? "",
                    "nextReviewAction": entry["nextReviewAction"] ?? "Preview and listen before applying metadata.",
                    "previewCommand": "script/agentctl.sh cut-recipe-preview \(recipeId)",
                    "nextCommand": "script/agentctl.sh cut-recipe-next \(normalizedMode)",
                    "truth": entry["truth"] ?? "Queue card only. Preview before applying; source media stays untouched."
                ]
            }
            let counts = Dictionary(grouping: cards, by: { staticStringValue($0["reviewClass"]) })
                .mapValues { $0.count }
            return [
                "status": "cut_recipe_queue",
                "model": "quipslystudio-cut-recipe-queue",
                "source": "model-owned-recipe-review-queue",
                "mode": normalizedMode,
                "returnedCount": cards.count,
                "matchingRecipeCount": filteredQueue.count,
                "totalRecipeCount": modelQueue.count,
                "reviewClassCounts": counts,
                "nextRecipe": cards.first ?? [:],
                "recipes": cards,
                "safeCommands": [
                    "nextAny": "script/agentctl.sh cut-recipe-next any",
                    "nextJump": "script/agentctl.sh cut-recipe-next jump",
                    "nextReaction": "script/agentctl.sh cut-recipe-next reaction",
                    "nextPause": "script/agentctl.sh cut-recipe-next pause",
                    "nextPreserve": "script/agentctl.sh cut-recipe-next preserve",
                    "preservationQueue": "script/agentctl.sh cut-recipe-queue preserve",
                    "preview": "script/agentctl.sh cut-recipe-preview <recipe-id>",
                    "craftGuidance": "script/agentctl.sh cut-craft-guidance",
                    "techniquePlaybook": "script/agentctl.sh cut-technique-playbook --markdown",
                    "cutReviewBrief": "script/agentctl.sh cut-review-brief any",
                    "cutReviewBriefPreserve": "script/agentctl.sh cut-review-brief preserve",
                    "cutPreservationBrief": "script/agentctl.sh cut-preservation-brief",
                    "cutPreservationBriefSave": "script/agentctl.sh cut-preservation-brief-save",
                "cutReviewBriefSave": "script/agentctl.sh cut-review-brief-save"
                ],
                "truth": "Read-only model-owned recipe queue over whole source lanes. It does not approve, apply, export, publish, trim, delete, or mutate source media."
            ]
        }
        let recipes = cutIntelligence["recipes"] as? [[String: Any]] ?? []
        guard !recipes.isEmpty else {
            return [
                "status": "no_cut_recipes",
                "model": "quipslystudio-cut-recipe-preview",
                "recipeId": recipeId,
                "hint": "Open Cut Intelligence or load SHOW/SKIP decisions so recipes can be generated.",
                "truth": "Read-only preview. It does not approve, apply, export, publish, trim, or mutate source media."
            ]
        }
        guard let recipe = recipes.first(where: { staticStringValue($0["id"]) == recipeId }) else {
            return [
                "status": "cut_recipe_not_found",
                "model": "quipslystudio-cut-recipe-preview",
                "recipeId": recipeId,
                "availableRecipeIds": recipes.map { staticStringValue($0["id"]) }.filter { !$0.isEmpty },
                "truth": "Read-only preview. It does not approve, apply, export, publish, trim, or mutate source media."
            ]
        }
        let intent = recipe["intent"] as? [String: Any] ?? [:]
        let splitRecommendation = (intent["splitEditRecommendation"] as? [String: Any])
            ?? fallbackSplitRecommendation(from: intent)
        return [
            "status": "cut_recipe_preview",
            "model": "quipslystudio-cut-recipe-preview",
            "recipeId": recipeId,
            "label": recipe["label"] ?? "",
            "sequenceTime": recipe["sequenceTime"] ?? 0,
            "targetLaneName": recipe["targetLaneName"] ?? "",
            "sourceFindingId": recipe["sourceFindingId"] ?? "",
            "recipeStatus": recipe["status"] ?? "",
            "explanation": recipe["explanation"] ?? "",
            "safety": recipe["safety"] ?? "Suggestion-only until explicitly applied.",
            "intent": intent,
            "splitEditRecommendation": splitRecommendation,
            "recommendedTechnique": recipe["recommendedTechnique"] ?? "",
            "techniqueGuidance": recipe["techniqueGuidance"] ?? [:],
            "techniqueTradeoffExplanation": recipe["techniqueTradeoffExplanation"] ?? intent["tradeoffExplanation"] ?? "",
            "techniqueReviewQuestion": recipe["techniqueReviewQuestion"] ?? intent["nextReviewAction"] ?? "",
            "agentTechniqueRule": recipe["agentTechniqueRule"] ?? "Cue, listen at normal speed, and explain the human benefit before applying metadata.",
            "humanReviewChecklist": recipe["humanReviewChecklist"] ?? [],
            "preservationWarning": recipe["preservationWarning"] ?? "",
            "reviewClass": recipe["reviewClass"] ?? "",
            "reviewClassExplanation": recipe["reviewClassExplanation"] ?? "",
            "reviewPriority": recipe["reviewPriority"] ?? 0,
            "reviewEvidence": intent["reviewEvidence"] ?? [],
            "nextReviewAction": intent["nextReviewAction"] ?? "Preview the boundary by ear before applying this metadata intent.",
            "safeCommands": [
                "cueBoundary": "script/agentctl.sh scrub \(staticStringValue(recipe["sequenceTime"]))",
                "applyIntent": "script/agentctl.sh cut-recipe-apply \(recipeId) true",
                "fullReport": "script/agentctl.sh cut-intelligence",
                "craftGuidance": "script/agentctl.sh cut-craft-guidance",
                "techniquePlaybook": "script/agentctl.sh cut-technique-playbook --markdown",
                "cutReviewBrief": "script/agentctl.sh cut-review-brief any",
                "cutReviewBriefPreserve": "script/agentctl.sh cut-review-brief preserve",
                "cutPreservationBrief": "script/agentctl.sh cut-preservation-brief",
                "cutPreservationBriefSave": "script/agentctl.sh cut-preservation-brief-save",
                    "cutReviewBriefSave": "script/agentctl.sh cut-review-brief-save"
            ],
            "truth": "Read-only recipe preview over whole source lanes. Applying later attaches metadata intent to a decision; it still does not mutate source media, export, publish, or delete anything."
        ]
    }

    private nonisolated static func cachedNextCutRecipePayload(mode rawMode: String) -> [String: Any] {
        let mode = rawMode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedMode = mode.isEmpty ? "any" : mode
        guard let status = cachedStatusDictionary() else {
            return [
                "status": "no_state_yet",
                "model": "quipslystudio-cut-recipe-next",
                "mode": normalizedMode,
                "hint": "Open QuipslyStudio and load a native editor session, then call /cut_recipe_next again.",
                "truth": "Read-only next-recipe selector. It does not approve, apply, export, publish, trim, or mutate source media."
            ]
        }
        let cutIntelligence = (status["cutIntelligenceReport"] as? [String: Any])
            ?? (status["cutIntelligence"] as? [String: Any])
            ?? [:]
        let recipes = cutIntelligence["recipes"] as? [[String: Any]] ?? []
        guard !recipes.isEmpty else {
            return [
                "status": "no_cut_recipes",
                "model": "quipslystudio-cut-recipe-next",
                "mode": normalizedMode,
                "hint": "Open Cut Intelligence or load SHOW/SKIP decisions so recipes can be generated.",
                "truth": "Read-only next-recipe selector. It does not approve, apply, export, publish, trim, or mutate source media."
            ]
        }

        func recipeIntent(_ recipe: [String: Any]) -> [String: Any] {
            recipe["intent"] as? [String: Any] ?? [:]
        }
        func recipeText(_ recipe: [String: Any]) -> String {
            let intent = recipeIntent(recipe)
            return [
                staticStringValue(recipe["label"]),
                staticStringValue(recipe["explanation"]),
                staticStringValue(recipe["recommendedTechnique"]),
                staticStringValue(recipe["reviewClass"]),
                staticStringValue(recipe["reviewClassExplanation"]),
                staticStringValue(recipe["techniqueTradeoffExplanation"]),
                staticStringValue(recipe["techniqueReviewQuestion"]),
                staticStringValue(recipe["agentTechniqueRule"]),
                staticStringValue(recipe["preservationWarning"]),
                (recipe["humanReviewChecklist"] as? [String] ?? []).joined(separator: " "),
                staticStringValue(intent["cutStyle"]),
                staticStringValue(intent["coverStrategy"]),
                staticStringValue(intent["risk"]),
                staticStringValue(intent["nextReviewAction"])
            ]
            .joined(separator: " ")
            .lowercased()
        }
        func matchesMode(_ recipe: [String: Any]) -> Bool {
            let text = recipeText(recipe)
            switch normalizedMode {
            case "jump", "jump-cut", "jumpcut":
                return text.contains("jump")
            case "reaction", "cover":
                return text.contains("reaction") || text.contains("cover")
            case "pause", "air", "cadence":
                return text.contains("pause") || text.contains("air") || text.contains("cadence") || text.contains("tightened")
            case "preserve", "preservation", "human-air", "protect-air", "meaning-air", "do-not-cut":
                return !staticStringValue(recipe["preservationWarning"]).isEmpty
                    || text.contains("meaning-bearing")
                    || text.contains("do not optimize")
                    || text.contains("preserve")
                    || text.contains("awkward warmth")
                    || text.contains("emotional reset")
                    || text.contains("thinking time")
                    || text.contains("breath")
                    || text.contains("laugh")
            case "split", "j-l", "jl":
                return text.contains("j-cut") || text.contains("l-cut") || text.contains("split") || text.contains("reaction")
            case "safe", "low-risk":
                let risk = staticStringValue(recipeIntent(recipe)["risk"]).lowercased()
                let confidence = staticDoubleValue(recipeIntent(recipe)["confidence"])
                return !risk.contains("high") && confidence >= 0.45
            default:
                return true
            }
        }
        func priority(_ recipe: [String: Any]) -> Int {
            let text = recipeText(recipe)
            let intent = recipeIntent(recipe)
            let risk = staticStringValue(intent["risk"]).lowercased()
            let confidence = staticDoubleValue(intent["confidence"])
            var score = 0
            if risk.contains("high") { score += 50 }
            if text.contains("jump") { score += 35 }
            if text.contains("reaction") || text.contains("cover") { score += 25 }
            if text.contains("j-cut") || text.contains("l-cut") || text.contains("split") { score += 20 }
            if text.contains("pause") || text.contains("cadence") || text.contains("air") { score += 16 }
            score += Int((confidence * 20).rounded())
            return score
        }

        let candidates = recipes.filter(matchesMode)
        let selected = (candidates.isEmpty ? recipes : candidates)
            .sorted { left, right in
                let leftPriority = priority(left)
                let rightPriority = priority(right)
                if leftPriority == rightPriority {
                    return staticDoubleValue(left["sequenceTime"]) < staticDoubleValue(right["sequenceTime"])
                }
                return leftPriority > rightPriority
            }
            .first

        guard let selectedRecipe = selected else {
            return [
                "status": "no_matching_cut_recipe",
                "model": "quipslystudio-cut-recipe-next",
                "mode": normalizedMode,
                "availableRecipeIds": recipes.map { staticStringValue($0["id"]) }.filter { !$0.isEmpty },
                "truth": "Read-only next-recipe selector. It does not approve, apply, export, publish, trim, or mutate source media."
            ]
        }
        let selectedId = staticStringValue(selectedRecipe["id"])
        var preview = cachedCutRecipePreviewPayload(recipeId: selectedId)
        preview["status"] = "cut_recipe_next"
        preview["model"] = "quipslystudio-cut-recipe-next"
        preview["mode"] = normalizedMode
        preview["candidateCount"] = candidates.count
        preview["totalRecipeCount"] = recipes.count
        preview["selectionRationale"] = "Selected the highest-priority \(normalizedMode) recipe using risk, cut style, cover/split cues, cadence cues, confidence, and sequence order. Preview and listen before applying metadata."
        preview["safeCommands"] = [
            "previewRecipe": "script/agentctl.sh cut-recipe-preview \(selectedId)",
            "cueBoundary": "script/agentctl.sh scrub \(staticStringValue(selectedRecipe["sequenceTime"]))",
            "applyIntent": "script/agentctl.sh cut-recipe-apply \(selectedId) true",
            "nextJump": "script/agentctl.sh cut-recipe-next jump",
            "nextReaction": "script/agentctl.sh cut-recipe-next reaction",
            "nextPause": "script/agentctl.sh cut-recipe-next pause",
            "nextPreserve": "script/agentctl.sh cut-recipe-next preserve",
            "preservationQueue": "script/agentctl.sh cut-recipe-queue preserve",
            "cutReviewBriefPreserve": "script/agentctl.sh cut-review-brief preserve",
                "cutPreservationBrief": "script/agentctl.sh cut-preservation-brief"
        ,
            "cutPreservationBriefSave": "script/agentctl.sh cut-preservation-brief-save"
        ]
        preview["truth"] = "Read-only next-recipe selector plus preview. It does not approve, apply, export, publish, trim, or mutate source media."
        return preview
    }

    private nonisolated static func cachedCutRecipeQueuePayload(mode rawMode: String, limit rawLimit: String) -> [String: Any] {
        let mode = rawMode.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let normalizedMode = mode.isEmpty ? "any" : mode
        let parsedLimit = Int(rawLimit.trimmingCharacters(in: .whitespacesAndNewlines)) ?? 12
        let limit = max(1, min(40, parsedLimit))

        guard let status = cachedStatusDictionary() else {
            return [
                "status": "no_state_yet",
                "model": "quipslystudio-cut-recipe-queue",
                "mode": normalizedMode,
                "hint": "Open QuipslyStudio and load a native editor session, then call /cut_recipe_queue again.",
                "truth": "Read-only recipe queue. It does not approve, apply, export, publish, trim, or mutate source media."
            ]
        }
        let cutIntelligence = (status["cutIntelligenceReport"] as? [String: Any])
            ?? (status["cutIntelligence"] as? [String: Any])
            ?? [:]
        let recipes = cutIntelligence["recipes"] as? [[String: Any]] ?? []
        guard !recipes.isEmpty else {
            return [
                "status": "no_cut_recipes",
                "model": "quipslystudio-cut-recipe-queue",
                "mode": normalizedMode,
                "hint": "Open Cut Intelligence or load SHOW/SKIP decisions so recipes can be generated.",
                "truth": "Read-only recipe queue. It does not approve, apply, export, publish, trim, or mutate source media."
            ]
        }

        func intent(for recipe: [String: Any]) -> [String: Any] {
            recipe["intent"] as? [String: Any] ?? [:]
        }
        func text(for recipe: [String: Any]) -> String {
            let intent = intent(for: recipe)
            return [
                staticStringValue(recipe["label"]),
                staticStringValue(recipe["explanation"]),
                staticStringValue(recipe["recommendedTechnique"]),
                staticStringValue(recipe["reviewClass"]),
                staticStringValue(recipe["reviewClassExplanation"]),
                staticStringValue(recipe["techniqueTradeoffExplanation"]),
                staticStringValue(recipe["techniqueReviewQuestion"]),
                staticStringValue(recipe["agentTechniqueRule"]),
                staticStringValue(recipe["preservationWarning"]),
                (recipe["humanReviewChecklist"] as? [String] ?? []).joined(separator: " "),
                staticStringValue(intent["cutStyle"]),
                staticStringValue(intent["coverStrategy"]),
                staticStringValue(intent["risk"]),
                staticStringValue(intent["nextReviewAction"])
            ]
            .joined(separator: " ")
            .lowercased()
        }
        func technique(for recipe: [String: Any]) -> String {
            let recipeText = text(for: recipe)
            if recipeText.contains("jump") { return "jump-cut-cover" }
            if recipeText.contains("reaction") { return "reaction-cover" }
            if recipeText.contains("j-cut") { return "j-cut" }
            if recipeText.contains("l-cut") { return "l-cut" }
            if recipeText.contains("b-roll") || recipeText.contains("clip") { return "b-roll-or-clip-cover" }
            if recipeText.contains("pause") || recipeText.contains("cadence") || recipeText.contains("air") || recipeText.contains("preserve") || recipeText.contains("meaning-bearing") { return "preserve-or-shape-air" }
            return "straight-cut-review"
        }
        func reviewClass(for recipe: [String: Any]) -> String {
            let recipeText = text(for: recipe)
            let recipeIntent = intent(for: recipe)
            let risk = staticStringValue(recipeIntent["risk"]).lowercased()
            let confidence = staticDoubleValue(recipeIntent["confidence"])
            if risk.contains("high") || recipeText.contains("jump") { return "cover_or_hold_before_tightening" }
            if recipeText.contains("pause") || recipeText.contains("cadence") || recipeText.contains("air") || recipeText.contains("preserve") || recipeText.contains("meaning-bearing") { return "listen_for_human_air" }
            if recipeText.contains("reaction") || recipeText.contains("j-cut") || recipeText.contains("l-cut") || recipeText.contains("split") { return "preview_split_edit_by_ear" }
            if confidence < 0.5 { return "low_confidence_listen_first" }
            return "safe_preview_candidate"
        }
        func matchesMode(_ recipe: [String: Any]) -> Bool {
            let recipeText = text(for: recipe)
            switch normalizedMode {
            case "jump", "jump-cut", "jumpcut":
                return recipeText.contains("jump")
            case "reaction", "cover":
                return recipeText.contains("reaction") || recipeText.contains("cover")
            case "pause", "air", "cadence":
                return recipeText.contains("pause") || recipeText.contains("air") || recipeText.contains("cadence") || recipeText.contains("tightened")
            case "preserve", "preservation", "human-air", "protect-air", "meaning-air", "do-not-cut":
                return !staticStringValue(recipe["preservationWarning"]).isEmpty
                    || recipeText.contains("meaning-bearing")
                    || recipeText.contains("do not optimize")
                    || recipeText.contains("preserve")
                    || recipeText.contains("awkward warmth")
                    || recipeText.contains("emotional reset")
                    || recipeText.contains("thinking time")
                    || recipeText.contains("breath")
                    || recipeText.contains("laugh")
            case "split", "j-l", "jl":
                return recipeText.contains("j-cut") || recipeText.contains("l-cut") || recipeText.contains("split") || recipeText.contains("reaction")
            case "safe", "low-risk":
                let recipeIntent = intent(for: recipe)
                let risk = staticStringValue(recipeIntent["risk"]).lowercased()
                let confidence = staticDoubleValue(recipeIntent["confidence"])
                return !risk.contains("high") && confidence >= 0.45
            default:
                return true
            }
        }
        func priority(_ recipe: [String: Any]) -> Int {
            let recipeText = text(for: recipe)
            let recipeIntent = intent(for: recipe)
            let risk = staticStringValue(recipeIntent["risk"]).lowercased()
            let confidence = staticDoubleValue(recipeIntent["confidence"])
            var score = 0
            if risk.contains("high") { score += 50 }
            if recipeText.contains("jump") { score += 35 }
            if recipeText.contains("reaction") || recipeText.contains("cover") { score += 25 }
            if recipeText.contains("j-cut") || recipeText.contains("l-cut") || recipeText.contains("split") { score += 20 }
            if recipeText.contains("pause") || recipeText.contains("cadence") || recipeText.contains("air") { score += 16 }
            score += Int((confidence * 20).rounded())
            return score
        }

        let filtered = recipes.filter(matchesMode)
        let ranked = (filtered.isEmpty ? recipes : filtered)
            .sorted { left, right in
                let leftPriority = priority(left)
                let rightPriority = priority(right)
                if leftPriority == rightPriority {
                    return staticDoubleValue(left["sequenceTime"]) < staticDoubleValue(right["sequenceTime"])
                }
                return leftPriority > rightPriority
            }
        let cards = ranked.prefix(limit).map { recipe -> [String: Any] in
            let recipeIntent = intent(for: recipe)
            let recipeId = staticStringValue(recipe["id"])
            let recipeReviewClass = reviewClass(for: recipe)
            return [
                "id": recipeId,
                "label": recipe["label"] ?? "",
                "sequenceTime": recipe["sequenceTime"] ?? 0,
                "targetLaneName": recipe["targetLaneName"] ?? "",
                "technique": technique(for: recipe),
                "reviewClass": recipeReviewClass,
                "risk": recipeIntent["risk"] ?? "",
                "confidence": recipeIntent["confidence"] ?? 0,
                "cutStyle": recipeIntent["cutStyle"] ?? "",
                "coverStrategy": recipeIntent["coverStrategy"] ?? "",
                "nextReviewAction": recipeIntent["nextReviewAction"] ?? "Preview and listen before applying metadata.",
                "previewCommand": "script/agentctl.sh cut-recipe-preview \(recipeId)",
                "nextCommand": "script/agentctl.sh cut-recipe-next \(normalizedMode)",
                "truth": "Queue card only. Preview before applying; source media stays untouched."
            ]
        }
        let counts = Dictionary(grouping: cards, by: { staticStringValue($0["reviewClass"]) })
            .mapValues { $0.count }
        let nextCard = cards.first ?? [:]

        return [
            "status": "cut_recipe_queue",
            "model": "quipslystudio-cut-recipe-queue",
            "mode": normalizedMode,
            "returnedCount": cards.count,
            "matchingRecipeCount": filtered.count,
            "totalRecipeCount": recipes.count,
            "reviewClassCounts": counts,
            "nextRecipe": nextCard,
            "recipes": cards,
            "safeCommands": [
                "nextAny": "script/agentctl.sh cut-recipe-next any",
                "nextJump": "script/agentctl.sh cut-recipe-next jump",
                "nextReaction": "script/agentctl.sh cut-recipe-next reaction",
                "nextPause": "script/agentctl.sh cut-recipe-next pause",
                "nextPreserve": "script/agentctl.sh cut-recipe-next preserve",
                "preservationQueue": "script/agentctl.sh cut-recipe-queue preserve",
                "preview": "script/agentctl.sh cut-recipe-preview <recipe-id>",
                "craftGuidance": "script/agentctl.sh cut-craft-guidance",
                "cutReviewBriefPreserve": "script/agentctl.sh cut-review-brief preserve",
                "cutPreservationBrief": "script/agentctl.sh cut-preservation-brief",
                "cutReviewBriefSavePreserve": "script/agentctl.sh cut-review-brief-save",
                "cutPreservationBriefSave": "script/agentctl.sh cut-preservation-brief-save"
            ],
            "truth": "Read-only recipe queue over whole source lanes. It does not approve, apply, export, publish, trim, delete, or mutate source media."
        ]
    }

    private nonisolated static func cachedCutCraftGuidancePayload() -> [String: Any] {
        guard let status = cachedStatusDictionary() else {
            return [
                "status": "no_state_yet",
                "model": "quipslystudio-cut-craft-guidance",
                "hint": "Open QuipslyStudio and load a native editor session, then call /cut_craft_guidance again.",
                "truth": "This endpoint is read-only. It does not approve, publish, export, trim, or mutate source media."
            ]
        }

        let cutIntelligence = (status["cutIntelligenceReport"] as? [String: Any])
            ?? (status["cutIntelligence"] as? [String: Any])
            ?? [:]
        let profile = cutIntelligence["craftProfile"] as? [String: Any] ?? [:]
        guard !profile.isEmpty else {
            return [
                "status": "missing_cut_craft_guidance",
                "model": "quipslystudio-cut-craft-guidance",
                "hint": "Load a session with SHOW/SKIP decisions or open Cut Intelligence so the craft profile can be generated.",
                "truth": "This endpoint is read-only. It does not approve, publish, export, trim, or mutate source media."
            ]
        }

        let doNotCutSignals = profile["doNotCutSignals"] as? [String] ?? []
        let guardrails = profile["automationGuardrails"] as? [String] ?? []
        let warnings = profile["craftWarnings"] as? [String] ?? []
        let coverNeededCount = profile["coverNeededCount"] as? Int ?? 0
        let pauseReviewCount = profile["pauseReviewCount"] as? Int ?? 0
        let recipeReviewQueue = cutIntelligence["recipeReviewQueue"] as? [[String: Any]] ?? []
        let preservationReviewCount = recipeReviewQueue.filter { entry in
            let checklist = (entry["humanReviewChecklist"] as? [String] ?? []).joined(separator: " ")
            let text = [
                staticStringValue(entry["reviewClass"]),
                staticStringValue(entry["reviewClassExplanation"]),
                staticStringValue(entry["techniqueTradeoffExplanation"]),
                staticStringValue(entry["techniqueReviewQuestion"]),
                staticStringValue(entry["preservationWarning"]),
                checklist
            ]
            .joined(separator: " ")
            .lowercased()
            return !staticStringValue(entry["preservationWarning"]).isEmpty
                || text.contains("meaning-bearing")
                || text.contains("do not optimize")
                || text.contains("preserve")
                || text.contains("awkward warmth")
                || text.contains("emotional reset")
                || text.contains("thinking time")
                || text.contains("breath")
                || text.contains("laugh")
        }.count
        let nextFocus: String
        if preservationReviewCount > 0 {
            nextFocus = "Review preservation-risk cuts first; protect meaning-bearing air before approving any tightening."
        } else if !doNotCutSignals.isEmpty {
            nextFocus = "Protect the first do-not-cut signal before applying any tightening recipe."
        } else if coverNeededCount > 0 {
            nextFocus = "Find cover, reframe, or preserved-air options before shaving same-person jumps."
        } else if pauseReviewCount > 0 {
            nextFocus = "Classify pauses before deleting them."
        } else {
            nextFocus = "Review by ear before changing timing."
        }

        return [
            "status": "cut_craft_guidance",
            "model": "quipslystudio-cut-craft-guidance",
            "sequenceTitle": cutIntelligence["sequenceTitle"] ?? status["sequenceTitle"] ?? "",
            "cadenceMode": cutIntelligence["cadenceMode"] ?? status["cutIntelligenceCadenceMode"] ?? "",
            "transcriptCoverageStatus": profile["transcriptCoverageStatus"] ?? "",
            "humanFlowStance": profile["humanFlowStance"] ?? "",
            "branchAdvice": profile["branchAdvice"] ?? "",
            "shortsAdvice": profile["shortsAdvice"] ?? "",
            "reviewerPrompt": profile["reviewerPrompt"] ?? "",
            "doNotCutSignals": doNotCutSignals,
            "pauseReviewSignals": profile["pauseReviewSignals"] ?? [],
            "automationGuardrails": guardrails,
            "craftWarnings": warnings,
            "counts": [
                "splitEditOpportunityCount": profile["splitEditOpportunityCount"] ?? 0,
                "coverNeededCount": coverNeededCount,
                "pauseReviewCount": pauseReviewCount,
                "preservationReviewCount": preservationReviewCount,
                "straightCutCount": profile["straightCutCount"] ?? 0
            ],
            "nextFocus": nextFocus,
            "safeCommands": [
                "fullReport": "script/agentctl.sh cut-intelligence",
                "recipeQueue": "script/agentctl.sh cut-recipe-queue any",
                "preservationQueue": "script/agentctl.sh cut-recipe-queue preserve",
                "nextRecipe": "script/agentctl.sh cut-recipe-next any",
                "nextPreservationRecipe": "script/agentctl.sh cut-recipe-next preserve",
                "recipePreview": "script/agentctl.sh cut-recipe-preview <recipe-id>",
                "selectedDecisionEvidence": "script/agentctl.sh decision-intent-evidence",
                "techniquePlaybook": "script/agentctl.sh cut-technique-playbook --markdown",
                "cutReviewBriefPreserve": "script/agentctl.sh cut-review-brief preserve",
                "cutPreservationBrief": "script/agentctl.sh cut-preservation-brief",
                "cutReviewBriefSavePreserve": "script/agentctl.sh cut-review-brief-save",
                "cutPreservationBriefSave": "script/agentctl.sh cut-preservation-brief-save",
                "warmConversationLens": "script/agentctl.sh cut-cadence warm-conversation",
                "shortsEnergyLens": "script/agentctl.sh cut-cadence shorts-energy"
            ],
            "truth": "Read-only craft guidance over whole source lanes and metadata decisions. It does not approve, publish, export, trim, or mutate source media."
        ]
    }

    private nonisolated static func cachedCutTechniquePlaybookPayload() -> [String: Any] {
        guard let status = cachedStatusDictionary() else {
            return [
                "status": "no_state_yet",
                "model": "quipslystudio-cut-technique-playbook",
                "hint": "Open QuipslyStudio and load a native editor session, then call /cut_technique_playbook again.",
                "truth": "This endpoint is read-only. It does not approve, publish, export, trim, or mutate source media."
            ]
        }

        let cutIntelligence = (status["cutIntelligenceReport"] as? [String: Any])
            ?? (status["cutIntelligence"] as? [String: Any])
            ?? [:]
        let profile = cutIntelligence["craftProfile"] as? [String: Any] ?? [:]
        let playbook = profile["techniquePlaybook"] as? [[String: Any]] ?? []
        guard !playbook.isEmpty else {
            return [
                "status": "missing_cut_technique_playbook",
                "model": "quipslystudio-cut-technique-playbook",
                "hint": "Open Cut Intelligence or load a session with SHOW/SKIP decisions so the technique playbook can be generated.",
                "safeCommands": [
                    "craftGuidance": "script/agentctl.sh cut-craft-guidance",
                    "fullReport": "script/agentctl.sh cut-intelligence"
                ],
                "truth": "This endpoint is read-only. It does not approve, publish, export, trim, or mutate source media."
            ]
        }

        return [
            "status": "cut_technique_playbook",
            "model": "quipslystudio-cut-technique-playbook",
            "sequenceTitle": cutIntelligence["sequenceTitle"] ?? status["sequenceTitle"] ?? "",
            "cadenceMode": cutIntelligence["cadenceMode"] ?? status["cutIntelligenceCadenceMode"] ?? "",
            "techniques": playbook,
            "howToUse": [
                "Use the playbook before applying any recipe that changes perceived cadence.",
                "Prefer reaction cover, J-cut, L-cut, or context cover when a same-speaker visual jump would feel mechanical.",
                "Choose quiet-gap protection when silence carries thought, emotion, humor, or listener orientation."
            ],
            "safeCommands": [
                "fullReport": "script/agentctl.sh cut-intelligence",
                "craftGuidance": "script/agentctl.sh cut-craft-guidance",
                "recipeQueue": "script/agentctl.sh cut-recipe-queue any",
                "selectedDecisionEvidence": "script/agentctl.sh decision-intent-evidence"
            ],
            "truth": "Read-only technique playbook over whole source lanes and metadata decisions. It does not approve, publish, export, trim, or mutate source media."
        ]
    }

    private nonisolated static func cachedSelectedDecisionHumanCutGuidancePayload() -> [String: Any] {
        let evidence = cachedSelectedDecisionIntentEvidencePayload()
        let guidance = evidence["humanCutGuidance"] as? [String: Any] ?? [:]
        func trimmed(_ value: Any?) -> String {
            if let text = value as? String {
                return text.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if let number = value as? NSNumber {
                return number.stringValue.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            return ""
        }
        let selectedTagId = trimmed(evidence["selectedTagId"])
        let selectedLaneName = trimmed(evidence["selectedLaneName"])
        let hasSelectedDecision = !selectedTagId.isEmpty || !selectedLaneName.isEmpty
        let ok = hasSelectedDecision
        let status: String
        if !hasSelectedDecision {
            status = "needs-selected-decision"
        } else if guidance.isEmpty {
            status = "selected-decision-needs-guidance"
        } else {
            status = "ready"
        }
        return [
            "ok": ok,
            "status": status,
            "model": "quipslystudio-selected-decision-human-cut-guidance",
            "version": "2026-06-30.selected-decision-human-cut-guidance.v1",
            "selectedDecision": [
                "tagId": evidence["selectedTagId"] ?? "",
                "laneName": evidence["selectedLaneName"] ?? "",
                "tagType": evidence["selectedTagType"] ?? "",
                "intentStatus": evidence["intentStatus"] ?? "",
                "risk": evidence["risk"] ?? "",
                "confidence": evidence["confidence"] ?? 0,
                "cutStyle": evidence["cutStyle"] ?? "",
                "coverStrategy": evidence["coverStrategy"] ?? "",
                "cadenceMode": evidence["cadenceMode"] ?? ""
            ],
            "humanCutGuidance": guidance,
            "nextAction": guidance["primaryQuestion"] ?? (hasSelectedDecision ? "Listen through the selected boundary at normal speed, then decide Keep, Refine, or Hold." : "Select a SHOW/SKIP decision, then listen at normal speed before changing metadata."),
            "safeCommands": [
                "stateContractJson": "GET /selected_decision_state_contract",
                "intentEvidence": "GET /selected_decision_intent_evidence",
                "productionBrief": "script/agentctl.sh selected-decision-production-brief --markdown",
                "humanCutGuidance": "script/agentctl.sh selected-decision-human-cut-guidance --markdown",
                "saveHumanCutGuidance": "script/agentctl.sh selected-decision-human-cut-guidance-save",
                "saveReviewPacket": "script/agentctl.sh selected-decision-review-packet-save",
                "markListen": "script/agentctl.sh decision-record-review needs-listen \"proof-listen before changing this boundary\"",
                "markRefine": "script/agentctl.sh decision-record-review refine \"human-cut guidance suggests timing or cover refinement\"",
                "markHold": "script/agentctl.sh decision-record-review hold \"human cadence may carry meaning here\""
            ],
            "truth": "Read-only human cut guidance. It does not approve, edit, export, publish, relink, or mutate source media."
        ]
    }

    private nonisolated static func cachedSelectedDecisionStateContractPayload() -> [String: Any] {
        let state = cachedStatusDictionary() ?? [:]
        let intentEvidence = cachedSelectedDecisionIntentEvidencePayload()
        let cutIntelligence = intentEvidence

        func dictionary(_ value: Any?) -> [String: Any] {
            value as? [String: Any] ?? [:]
        }

        func string(_ value: Any?) -> String {
            if let text = value as? String {
                return text.trimmingCharacters(in: .whitespacesAndNewlines)
            }
            if let number = value as? NSNumber {
                return number.stringValue
            }
            if let double = value as? Double {
                return String(format: "%.3f", double)
            }
            if let int = value as? Int {
                return String(int)
            }
            return ""
        }

        func first(_ payload: [String: Any], _ keys: [String]) -> String {
            for key in keys {
                let value = string(payload[key])
                if !value.isEmpty {
                    return value
                }
            }
            return ""
        }

        func selectedContainer(_ payload: [String: Any]) -> [String: Any] {
            for key in [
                "selectedDecision",
                "selectedDecisionIntentEvidence",
                "selectedDecisionCutIntelligence",
                "selectedDecisionIntent",
                "decision",
                "tag",
                "selectedTag"
            ] {
                let nested = dictionary(payload[key])
                if !nested.isEmpty {
                    return nested
                }
            }
            return [:]
        }

        func identity(from payload: [String: Any], source: String) -> [String: Any] {
            var combined = payload
            selectedContainer(payload).forEach { key, value in
                combined[key] = value
            }
            let decisionId = first(combined, [
                "selectedDecisionId",
                "decisionId",
                "selectedTagId",
                "tagId",
                "id",
                "uuid"
            ])
            let laneId = first(combined, [
                "selectedLaneId",
                "laneId",
                "trackId",
                "sourceLaneId",
                "sourceId"
            ])
            let kind = first(combined, [
                "decisionType",
                "selectedTagType",
                "tagType",
                "type",
                "kind",
                "intent",
                "action"
            ])
            let start = first(combined, [
                "selectedTagStart",
                "sequenceStart",
                "sequenceStartSeconds",
                "start",
                "startSeconds",
                "in",
                "inSeconds"
            ])
            let end = first(combined, [
                "selectedTagEnd",
                "sequenceEnd",
                "sequenceEndSeconds",
                "end",
                "endSeconds",
                "out",
                "outSeconds"
            ])
            let duration = first(combined, [
                "selectedTagDuration",
                "duration",
                "durationSeconds",
                "lengthSeconds"
            ])
            let nextAction = first(combined, [
                "nextAction",
                "nextSafeAction",
                "nextSafestAction",
                "recommendedAction"
            ])
            return [
                "source": source,
                "decisionId": decisionId,
                "laneId": laneId,
                "kind": kind,
                "start": start,
                "end": end,
                "duration": duration,
                "nextAction": nextAction,
                "status": string(payload["status"])
            ]
        }

        func boundary(_ identity: [String: Any]) -> String {
            let start = string(identity["start"])
            let end = string(identity["end"])
            if start.isEmpty && end.isEmpty {
                return ""
            }
            let lane = string(identity["laneId"])
            return "\(lane.isEmpty ? "unknown-lane" : lane):\(start)->\(end)"
        }

        let identities = [
            "state": identity(from: state, source: "state"),
            "intentEvidence": identity(from: intentEvidence, source: "intentEvidence"),
            "cutIntelligence": identity(from: cutIntelligence, source: "cutIntelligence")
        ]
        let presentIds = identities.compactMapValues { identity -> String? in
            let value = string(identity["decisionId"])
            return value.isEmpty ? nil : value
        }
        let idValues = Set(presentIds.values)
        let idsMatch = idValues.count <= 1 && presentIds.count >= 2
        let boundaries = identities.compactMapValues { identity -> String? in
            let value = boundary(identity)
            return value.isEmpty ? nil : value
        }
        let boundaryValues = Set(boundaries.values)
        let boundariesMatch = boundaryValues.count <= 1 && boundaries.count >= 2

        var problems: [String] = []
        if !idsMatch {
            problems.append("selected decision ids are missing or disagree")
        }
        if !boundariesMatch && boundaries.count >= 2 {
            problems.append("selected decision boundaries disagree")
        }
        if presentIds.isEmpty && boundaries.isEmpty {
            problems.append("no selected decision identity or boundary was discoverable")
        }
        let status = problems.isEmpty ? "contract-ok" : "needs-attention"

        return [
            "status": status,
            "model": "quipslystudio-selected-decision-state-contract",
            "version": "2026-06-30.selected-decision-state-contract.v1",
            "truth": [
                "readOnly": true,
                "mutatesSession": false,
                "exportsFiles": false,
                "publishesExternally": false,
                "touchesSourceMedia": false,
                "purpose": "Confirm selected decision surfaces agree before review or edit actions."
            ],
            "checks": [
                "idsMatch": idsMatch,
                "boundariesMatch": boundariesMatch,
                "presentIds": presentIds,
                "boundaries": boundaries,
                "problems": problems
            ],
            "selectedDecision": identities["state"] ?? [:],
            "intentEvidence": identities["intentEvidence"] ?? [:],
            "cutIntelligence": identities["cutIntelligence"] ?? [:],
            "safeCommands": [
                "intentEvidence": "GET /selected_decision_intent_evidence",
                "cutIntelligence": "GET /selected_decision_cut_intelligence",
                "productionBrief": "script/agentctl.sh selected-decision-production-brief --markdown",
                "stateContract": "script/agentctl.sh selected-decision-state-contract-check --markdown"
            ]
        ]
    }

    private nonisolated static func cachedSelectedDecisionIntentEvidencePayload() -> [String: Any] {
        func stringValue(_ value: Any?) -> String {
            if let value = value as? String { return value }
            if let value = value { return "\(value)" }
            return ""
        }
        func doubleValue(_ value: Any?) -> Double {
            if let value = value as? Double { return value }
            if let value = value as? Int { return Double(value) }
            if let value = value as? String, let parsed = Double(value) { return parsed }
            return 0
        }
        func recommendedReviewModePayload(tagType: String, intent: [String: Any], cadenceGuard: [String: Any]) -> [String: Any] {
            let normalizedTagType = tagType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let confidence = doubleValue(intent["confidence"])
            let risk = stringValue(intent["risk"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let cover = stringValue(intent["coverStrategy"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let lead = abs(doubleValue(intent["audioLeadSeconds"]))
            let tail = abs(doubleValue(intent["audioTailSeconds"]))
            let cadenceRiskLevel = stringValue(cadenceGuard["riskLevel"]).lowercased()
            let cadenceDetail = stringValue(cadenceGuard["detail"])
            let preserveAir = (cadenceGuard["preserveAir"] as? Bool) ?? cadenceRiskLevel.contains("preserve")

            if normalizedTagType == "cut" || normalizedTagType == "skip" {
                return [
                    "mode": "preserve-air",
                    "label": "Prove this should disappear",
                    "reason": "This is a SKIP decision. Removed time must be reviewed as human cadence, not treated as automatically wasted time.",
                    "firstAction": preserveAir
                        ? "Play Through this span and mark Hold or Refine if it contains breath, laughter, thought, awkward warmth, or reaction."
                        : "Play Through once and keep the skip only if the span is truly dead air, reset noise, or repeated setup.",
                    "riskLevel": cadenceRiskLevel
                ]
            }

            if preserveAir {
                return [
                    "mode": "cadence-hold",
                    "label": "Protect the human beat",
                    "reason": "The decision touches rhythm or a meaning-bearing pause. This is where over-cleaned podcast editing starts sounding fake.",
                    "firstAction": cadenceDetail.isEmpty ? "Listen at normal speed before tightening." : cadenceDetail,
                    "riskLevel": cadenceRiskLevel
                ]
            }

            if confidence > 0 && confidence < 0.50 || risk.contains("high") {
                return [
                    "mode": "high-care",
                    "label": "Listen before trusting it",
                    "reason": "This decision has low confidence or elevated risk, so the metadata is a review prompt, not a recommendation to approve.",
                    "firstAction": "Cue the boundary, compare source monitors, and add a note before marking Keep.",
                    "riskLevel": risk.isEmpty ? "low_confidence" : risk
                ]
            }

            if lead > 0.03 || tail > 0.03 {
                return [
                    "mode": "split-timing",
                    "label": "Check the J/L timing by ear",
                    "reason": "The decision uses audio lead or tail timing. Good split edits feel invisible; bad ones feel like people stepping on each other.",
                    "firstAction": "Play two seconds before and after the boundary and confirm the audio move adds flow instead of confusion.",
                    "riskLevel": "split_timing_review"
                ]
            }

            if !cover.isEmpty && cover != "none" {
                return [
                    "mode": "cover-check",
                    "label": "Confirm the cover earns its keep",
                    "reason": "A cover strategy is attached. It should clarify the moment, not hide a cut just because hiding cuts feels clever.",
                    "firstAction": "Compare Program Output with the source monitors and confirm the cover improves attention, reaction, or context.",
                    "riskLevel": "cover_review"
                ]
            }

            if intent.isEmpty {
                return [
                    "mode": "intent-metadata",
                    "label": "Explain the decision",
                    "reason": "This selected span has no structured intent payload yet. Training-quality edits need a visible why.",
                    "firstAction": "Add or apply intent metadata before treating this decision as reusable evidence.",
                    "riskLevel": "missing_intent"
                ]
            }

            return [
                "mode": "normal-listen",
                "label": "Do one normal-speed listen",
                "reason": "The decision looks reviewable. The remaining risk is whether it feels natural in the conversation.",
                "firstAction": "Play the boundary once at normal speed and listen for jumpiness, clipped breath, or missing reaction context.",
                "riskLevel": "normal_listen_pass"
            ]
        }
        func cadenceGuardPayload(tagType: String, intent: [String: Any]) -> [String: Any] {
            let evidence = (intent["reviewEvidence"] as? [String] ?? []).joined(separator: " ")
            let text = [
                stringValue(intent["cutStyle"]),
                stringValue(intent["coverStrategy"]),
                stringValue(intent["cadenceMode"]),
                stringValue(intent["humanRhythmNote"]),
                stringValue(intent["whyThisCutExists"]),
                stringValue(intent["tradeoffExplanation"]),
                evidence
            ]
            .joined(separator: " ")
            .lowercased()
            let humanBeatWords = ["breath", "laugh", "hesitat", "thinking", "thought", "comic", "joke", "warm", "emotional", "reaction", "pause", "awkward", "beat", "reset"]
            let mentionsHumanBeat = humanBeatWords.contains { text.contains($0) }
            let normalizedTagType = tagType.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let isQuietGap = normalizedTagType == "cut" || normalizedTagType == "skip"
            let lead = intent["audioLeadSeconds"] as? Double ?? 0
            let tail = intent["audioTailSeconds"] as? Double ?? 0
            let hasSplitTiming = abs(lead) > 0.03 || abs(tail) > 0.03
            let explicitCadenceRisk = text.contains("over-tightened") || text.contains("cadence") || text.contains("too clean") || text.contains("robotic")

            if isQuietGap && mentionsHumanBeat {
                return [
                    "title": "Preserve-air warning",
                    "detail": "This is marked SKIP, but the metadata mentions a human beat. Listen before keeping the gap removed.",
                    "icon": "wind",
                    "preserveAir": true,
                    "riskLevel": "preserve_air_before_skip"
                ]
            }
            if isQuietGap {
                return [
                    "title": "Quiet-gap proof",
                    "detail": "Play Edit jumps this span. Confirm it is filler, reset noise, or dead air before using it as training-quality evidence.",
                    "icon": "forward.end.fill",
                    "preserveAir": false,
                    "riskLevel": "prove_gap_is_safe"
                ]
            }
            if explicitCadenceRisk || mentionsHumanBeat {
                return [
                    "title": "Cadence-sensitive",
                    "detail": "This visible decision touches rhythm or a human beat. Prefer a normal-speed listen over automatic tightening.",
                    "icon": "metronome",
                    "preserveAir": true,
                    "riskLevel": "cadence_sensitive"
                ]
            }
            if hasSplitTiming {
                return [
                    "title": "Split timing by ear",
                    "detail": "This cut has J/L-style audio timing. Review it by ear before treating it as training-quality.",
                    "icon": "waveform.path",
                    "preserveAir": false,
                    "riskLevel": "split_timing_review"
                ]
            }
            return [
                "title": "Normal cadence check",
                "detail": "Listen once at normal speed for jumpiness, clipped breaths, missing reaction context, or a cut that feels too clever.",
                "icon": "ear",
                "preserveAir": false,
                "riskLevel": "normal_listen_pass"
            ]
        }

        guard let status = cachedStatusDictionary() else {
            return [
                "status": "no_state_yet",
                "model": "quipslystudio-selected-decision-intent-evidence",
                "hint": "Open QuipslyStudio and load a native editor session, then call /selected_decision_intent_evidence again.",
                "truth": "This endpoint is read-only. It does not approve, publish, export, trim, or mutate source media."
            ]
        }

        let selectedTagId = stringValue(status["selectedTagId"])
        guard !selectedTagId.isEmpty else {
            return [
                "status": "no_selected_decision",
                "model": "quipslystudio-selected-decision-intent-evidence",
                "truth": "Select a SHOW/SKIP decision first. This readout does not mutate source media, timing, exports, or publication state.",
                "nextAction": "Use select-decision at_playhead, next_video, or previous_video, then rerun selected decision evidence.",
                "safeCommands": [
                    "selectAtPlayhead": "GET /select_decision?mode=at_playhead&scope=video",
                    "selectNext": "GET /select_decision?mode=next_video&scope=video",
                    "selectPrevious": "GET /select_decision?mode=previous_video&scope=video"
                ]
            ]
        }

        let intent = status["selectedTagEditIntent"] as? [String: Any] ?? [:]
        let cutIntelligence = status["selectedDecisionCutIntelligence"] as? [String: Any] ?? [:]
        if stringValue(cutIntelligence["status"]) == "selected_decision_cut_intelligence" {
            var payload = cutIntelligence
            payload["compatibilityEndpoint"] = "/selected_decision_intent_evidence"
            payload["selectedDecisionIntentEvidenceStatus"] = intent.isEmpty ? "baseline_no_stored_intent" : "stored_intent"
            let revisionLedger = payload["revisionLedger"] as? [[String: Any]] ?? []
            if payload["latestStructuredRevision"] == nil {
                payload["latestStructuredRevision"] = revisionLedger.last ?? [:]
            }
            if payload["reviewTrailSummary"] == nil {
                payload["reviewTrailSummary"] = [
                    "structuredRevisionCount": revisionLedger.count,
                    "hasStructuredTrail": !revisionLedger.isEmpty,
                    "truth": "Use revisionLedger for machine-readable review history before treating this decision as training-quality evidence."
                ]
            }
            if payload["humanReviewChecklist"] == nil {
                let reviewQuestion = stringValue(payload["techniqueReviewQuestion"]).trimmingCharacters(in: .whitespacesAndNewlines)
                payload["humanReviewChecklist"] = [
                    "Cue the selected boundary and listen at normal speed.",
                    reviewQuestion.isEmpty ? "Does this edit make the conversation clearer and more human, or only shorter?" : reviewQuestion,
                    "Confirm it protects meaning, warmth, timing, or clarity before treating it as training-quality evidence."
                ]
            }
            if payload["agentTechniqueRule"] == nil {
                payload["agentTechniqueRule"] = "Cue, listen at normal speed, and explain the human benefit before applying or revising metadata."
            }
            if payload["preservationWarning"] == nil {
                payload["preservationWarning"] = "Listen for meaning-bearing air before tightening this selected boundary."
            }
            payload["truth"] = payload["truth"] ?? "Read-only selected-decision evidence over whole source lanes. It does not approve, publish, export, trim, or mutate source media."
            return payload
        }

        guard !intent.isEmpty else {
            let tagType = stringValue(status["selectedTagType"])
            let cadenceGuard = cadenceGuardPayload(tagType: tagType, intent: [:])
            return [
                "status": "selected_decision_missing_intent",
                "model": "quipslystudio-selected-decision-intent-evidence",
                "selectedLaneName": status["selectedTagLaneName"] ?? "",
                "selectedTagId": selectedTagId,
                "selectedTagType": status["selectedTagType"] ?? "",
                "selectedTagStart": status["selectedTagStart"] ?? 0,
                "selectedTagDuration": status["selectedTagDuration"] ?? 0,
                "recommendedReviewMode": recommendedReviewModePayload(tagType: tagType, intent: [:], cadenceGuard: cadenceGuard),
                "cadenceGuard": cadenceGuard,
                "truth": "A SHOW/SKIP decision is selected, but it does not yet carry Cut Intelligence intent metadata.",
                "nextAction": "Apply a Cut Intelligence recipe, append a decision note, or set a review state to create inspectable metadata.",
                "safeCommands": [
                    "cutIntelligence": "GET /cut_craft_guidance",
                    "techniquePlaybook": "GET /cut_technique_playbook",
                    "fullCutReport": "script/agentctl.sh cut-intelligence",
                    "addNote": "script/agentctl.sh decision-intent-note \"why this cut works or needs review\" Codex cut-choice",
                    "reviewMode": "script/agentctl.sh selected-decision-review-mode",
                    "markListen": "script/agentctl.sh decision-listen Codex \"needs an ear pass\""
                ]
            ]
        }

        var evidence = intent["reviewEvidence"] as? [String] ?? []
        if evidence.isEmpty {
            for (label, key) in [
                ("Reason", "whyThisCutExists"),
                ("Tradeoff", "tradeoffExplanation"),
                ("Rhythm", "humanRhythmNote")
            ] {
                let value = stringValue(intent[key]).trimmingCharacters(in: .whitespacesAndNewlines)
                if !value.isEmpty {
                    evidence.append("\(label): \(value)")
                }
            }
        }

        let confidence = intent["confidence"] as? Double ?? 0
        var nextAction = stringValue(intent["nextReviewAction"]).trimmingCharacters(in: .whitespacesAndNewlines)
        if nextAction.isEmpty {
            nextAction = confidence < 0.5
                ? "Listen through this boundary and mark Hold or Refine before using it as training-quality evidence."
                : "Review cadence and visual jumpiness, then mark Keep, Refine, or Hold."
        }
        let cutCraftReview = intent["cutCraftReview"] as? [String: Any] ?? [:]
        let techniqueReviewQuestion = stringValue(cutCraftReview["reviewQuestion"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let techniqueTradeoff = stringValue(intent["tradeoffExplanation"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let agentTechniqueRule = stringValue(cutCraftReview["agentRule"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let preservationWarning = stringValue(cutCraftReview["preservationWarning"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let humanReviewChecklist = [
            "Cue the selected boundary and listen at normal speed.",
            techniqueReviewQuestion.isEmpty ? nextAction : techniqueReviewQuestion,
            "Confirm it protects meaning, warmth, timing, or clarity rather than only making the episode shorter."
        ]
        let tagType = stringValue(status["selectedTagType"])
        let cadenceGuard = cadenceGuardPayload(tagType: tagType, intent: intent)
        let revisionLedger = intent["revisionLedger"] as? [[String: Any]] ?? []
        let revisionHistory = intent["revisionHistory"] as? [String] ?? []
        let humanAgentNotes = intent["humanAgentNotes"] as? [String] ?? []
        let reviewProvenance = intent["reviewProvenance"] as? [String: Any] ?? [
            "structuredRevisionCount": revisionLedger.count,
            "legacyRevisionCount": revisionHistory.count,
            "latestStructuredRevision": revisionLedger.last ?? [:],
            "truth": "Use revisionLedger for machine-readable review history. revisionHistory remains a legacy human-readable trail."
        ]

        return [
            "status": "selected_decision_intent_evidence",
            "model": "quipslystudio-selected-decision-intent-evidence",
            "selectedLaneName": status["selectedTagLaneName"] ?? "",
            "selectedTagId": selectedTagId,
            "selectedTagType": status["selectedTagType"] ?? "",
            "selectedTagStart": status["selectedTagStart"] ?? 0,
            "selectedTagDuration": status["selectedTagDuration"] ?? 0,
            "playhead": status["playhead"] ?? 0,
            "intentStatus": intent["status"] ?? "",
            "risk": intent["risk"] ?? "",
            "confidence": intent["confidence"] ?? 0,
            "cutStyle": intent["cutStyle"] ?? "",
            "coverStrategy": intent["coverStrategy"] ?? "",
            "cadenceMode": intent["cadenceMode"] ?? "",
            "splitEditRecommendation": intent["splitEditRecommendation"] ?? [:],
            "techniqueTradeoffExplanation": techniqueTradeoff.isEmpty ? "Review the human tradeoff before changing cadence or hiding a visual seam." : techniqueTradeoff,
            "techniqueReviewQuestion": techniqueReviewQuestion.isEmpty ? nextAction : techniqueReviewQuestion,
            "agentTechniqueRule": agentTechniqueRule.isEmpty ? "Cue, listen at normal speed, and explain the human benefit before applying or revising metadata." : agentTechniqueRule,
            "humanReviewChecklist": humanReviewChecklist,
            "preservationWarning": preservationWarning.isEmpty ? "Listen for meaning-bearing air before tightening this selected boundary." : preservationWarning,
            "reviewEvidence": evidence,
            "revisionLedger": revisionLedger,
            "revisionHistory": revisionHistory,
            "reviewProvenance": reviewProvenance,
            "latestStructuredRevision": revisionLedger.last ?? [:],
            "humanAgentNotes": humanAgentNotes,
            "nextReviewAction": nextAction,
            "recommendedReviewMode": recommendedReviewModePayload(tagType: tagType, intent: intent, cadenceGuard: cadenceGuard),
            "cadenceGuard": cadenceGuard,
            "cutCraftReview": cutCraftReview,
            "truth": "Read-only selected-decision evidence over whole source lanes. It does not approve, publish, export, trim, or mutate source media.",
            "safeCommands": [
                "markListen": "script/agentctl.sh decision-listen Codex \"needs an ear pass\"",
                "markRefine": "script/agentctl.sh decision-refine Codex \"needs timing, cover, cadence, or source-choice refinement\"",
                "markKeep": "script/agentctl.sh decision-keep Codex \"reviewed for now; not publication approval\"",
                "markHold": "script/agentctl.sh decision-hold Codex \"hold for human context or uncertainty\"",
                "addNote": "script/agentctl.sh decision-intent-note \"what changed or what to check\" Codex cut-choice",
                "reviewMode": "script/agentctl.sh selected-decision-review-mode",
                "stateContractJson": "GET /selected_decision_state_contract",
                "stateContract": "script/agentctl.sh selected-decision-state-contract-check --markdown",
                "humanCutGuidanceJson": "GET /selected_decision_human_cut_guidance",
                "humanCutGuidance": "script/agentctl.sh selected-decision-human-cut-guidance --markdown",
                "saveHumanCutGuidance": "script/agentctl.sh selected-decision-human-cut-guidance-save",
                "saveReviewPacket": "script/agentctl.sh selected-decision-review-packet-save",
                "craftGuidance": "GET /cut_craft_guidance",
                "techniquePlaybook": "GET /cut_technique_playbook",
                "cutReviewBrief": "script/agentctl.sh cut-review-brief any",
                "cutReviewBriefSave": "script/agentctl.sh cut-review-brief-save"
            ]
        ]
    }

    private nonisolated static func cachedSelectedDecisionReviewTrailPayload() -> [String: Any] {
        func stringValue(_ value: Any?) -> String {
            if let value = value as? String { return value }
            if let value { return "\(value)" }
            return ""
        }
        func doubleValue(_ value: Any?) -> Double {
            if let value = value as? Double { return value }
            if let value = value as? Int { return Double(value) }
            if let value = value as? String, let parsed = Double(value) { return parsed }
            return 0
        }

        let evidence = cachedSelectedDecisionIntentEvidencePayload()
        let sourceStatus = stringValue(evidence["status"])
        guard sourceStatus == "selected_decision_intent_evidence" || sourceStatus == "selected_decision_cut_intelligence" else {
            var unavailable = evidence
            unavailable["status"] = "selected_decision_review_trail_unavailable"
            unavailable["model"] = "quipslystudio-selected-decision-review-trail"
            unavailable["truth"] = "No selected decision review trail is available yet. This readout is read-only and never mutates source media."
            return unavailable
        }

        let revisionLedger = evidence["revisionLedger"] as? [[String: Any]] ?? []
        let revisionHistory = evidence["revisionHistory"] as? [String] ?? []
        let humanAgentNotes = evidence["humanAgentNotes"] as? [String] ?? []
        let latestRevision = revisionLedger.last ?? [:]
        let recommendedMode = evidence["recommendedReviewMode"] as? [String: Any] ?? [:]
        let cadenceGuard = evidence["cadenceGuard"] as? [String: Any] ?? [:]
        let intentStatus = stringValue(evidence["intentStatus"])
        let confidence = doubleValue(evidence["confidence"])
        let nextAction = stringValue(evidence["nextReviewAction"]).isEmpty
            ? stringValue(recommendedMode["firstAction"])
            : stringValue(evidence["nextReviewAction"])
        let latestNote = stringValue(latestRevision["note"]).isEmpty
            ? humanAgentNotes.last ?? ""
            : stringValue(latestRevision["note"])
        let statusTransition: String
        let previousStatus = stringValue(latestRevision["previousStatus"])
        let nextStatus = stringValue(latestRevision["nextStatus"])
        if previousStatus.isEmpty && nextStatus.isEmpty {
            statusTransition = intentStatus.isEmpty ? "not recorded" : intentStatus
        } else {
            statusTransition = "\(previousStatus.isEmpty ? "new" : previousStatus) -> \(nextStatus.isEmpty ? "noted" : nextStatus)"
        }
        let trainingReadiness: String
        if revisionLedger.isEmpty {
            trainingReadiness = "not-ready-no-structured-review"
        } else if ["keep", "approved", "reviewed-metadata"].contains(intentStatus.lowercased()) && confidence >= 0.5 {
            trainingReadiness = "usable-with-review-context"
        } else if intentStatus.lowercased().contains("hold") {
            trainingReadiness = "held-for-human-context"
        } else if intentStatus.lowercased().contains("refine") || intentStatus.lowercased().contains("listen") {
            trainingReadiness = "needs-more-review"
        } else {
            trainingReadiness = "reviewed-but-not-final"
        }

        return [
            "status": "selected_decision_review_trail",
            "model": "quipslystudio-selected-decision-review-trail",
            "sourceStatus": sourceStatus,
            "selectedDecision": [
                "laneName": evidence["selectedLaneName"] ?? "",
                "tagId": evidence["selectedTagId"] ?? "",
                "tagType": evidence["selectedTagType"] ?? "",
                "start": evidence["selectedTagStart"] ?? 0,
                "duration": evidence["selectedTagDuration"] ?? 0,
                "playhead": evidence["playhead"] ?? 0
            ],
            "workingSummary": [
                "intentStatus": intentStatus,
                "confidence": confidence,
                "risk": evidence["risk"] ?? "",
                "structuredRevisionCount": revisionLedger.count,
                "legacyRevisionCount": revisionHistory.count,
                "latestActor": latestRevision["actor"] ?? "",
                "latestActorType": latestRevision["actorType"] ?? "",
                "latestAction": latestRevision["action"] ?? "",
                "latestNote": latestNote,
                "statusTransition": statusTransition,
                "trainingReadiness": trainingReadiness,
                "nextSafeAction": nextAction
            ],
            "reviewTrail": [
                "structuredEvents": revisionLedger,
                "latestStructuredRevision": latestRevision,
                "legacyLines": revisionHistory,
                "humanAgentNotes": humanAgentNotes,
                "reviewEvidence": evidence["reviewEvidence"] ?? []
            ],
            "reviewMode": recommendedMode,
            "cadenceGuard": cadenceGuard,
            "safeCommands": [
                "evidence": "script/agentctl.sh decision-intent-evidence",
                "reviewTrail": "script/agentctl.sh selected-decision-review-trail",
                "markListen": "script/agentctl.sh decision-listen Codex \"needs an ear pass\"",
                "markRefine": "script/agentctl.sh decision-refine Codex \"needs timing, cover, cadence, or source-choice refinement\"",
                "markKeep": "script/agentctl.sh decision-keep Codex \"reviewed for now; not publication approval\"",
                "markHold": "script/agentctl.sh decision-hold Codex \"hold for human context or uncertainty\"",
                "addNote": "script/agentctl.sh decision-intent-note \"what changed or what to check\" Codex cut-choice"
            ],
            "truth": "Read-only selected-decision review trail. It summarizes reversible edit metadata and never approves, exports, publishes, trims, deletes, or mutates source media."
        ]
    }

    private nonisolated static func cachedSelectedShortProductionBriefPayload() -> [String: Any] {
        func stringValue(_ value: Any?) -> String {
            if let value = value as? String { return value }
            if let value { return "\(value)" }
            return ""
        }

        guard let status = cachedStatusDictionary() else {
            return [
                "status": "no_state_yet",
                "model": "quipsly-selected-short-production-brief",
                "hint": "Open QuipslyStudio and load a native editor session, then call /selected_short_production_brief again.",
                "truth": "This endpoint is read-only. It does not approve, publish, export, trim, or mutate source media."
            ]
        }

        let selectedShort = status["selectedShortClip"] as? [String: Any] ?? [:]
        let selectedShortId = stringValue(selectedShort["id"]).isEmpty
            ? stringValue(status["selectedShortClipId"])
            : stringValue(selectedShort["id"])

        guard !selectedShortId.isEmpty else {
            return [
                "status": "no_selected_short",
                "model": "quipsly-selected-short-production-brief",
                "truth": "Select a short recipe first. This endpoint reads selected-short guidance only and does not mutate media.",
                "nextAction": "Use the shorts panel or script/agentctl.sh shorts-review-next, then rerun selected-short production brief.",
                "safeCommands": [
                    "nextShort": "script/agentctl.sh shorts-review-next",
                    "cutRiskShort": "script/agentctl.sh shorts-review-next-cut-risk any",
                    "quality": "script/agentctl.sh selected-short-quality"
                ]
            ]
        }

        if var productionBrief = selectedShort["productionBrief"] as? [String: Any], !productionBrief.isEmpty {
            productionBrief["status"] = "selected_short_production_brief"
            productionBrief["selectedShortId"] = selectedShortId
            productionBrief["selectedShortTitle"] = selectedShort["title"] ?? ""
            productionBrief["source"] = "selectedShortClip.productionBrief"
            productionBrief["safeCommands"] = [
                "quality": "script/agentctl.sh selected-short-quality",
                "humanReviewGuidanceJson": "GET /selected_short_human_review_guidance",
                "humanReviewGuidance": "script/agentctl.sh selected-short-human-review-guidance --markdown",
                "storyContract": "script/agentctl.sh selected-short-story-contract --markdown",
                "productionBrief": "script/agentctl.sh selected-short-production-brief --markdown",
                "copyNext": "Read recommendedAction.nextCommand from this endpoint before applying anything.",
                "reviewReceipt": "script/agentctl.sh shorts-record-review <action> --note \"normal-speed proof note\""
            ]
            return productionBrief
        }

        let quality = selectedShort["creatorQuality"] as? [String: Any] ?? [:]
        let passport = selectedShort["publicationPassport"] as? [String: Any] ?? [:]
        let qualitySummary = quality["qualityPacketSummary"] as? [String: Any] ?? [:]
        let fallbackNextAction = stringValue(
            passport["safeAction"]
                ?? passport["nextAction"]
                ?? qualitySummary["nextSafeAction"]
                ?? quality["nextAction"]
        )
        let nextAction = fallbackNextAction.isEmpty
            ? "Read selected-short quality and story contract; this running app has not yet attached productionBrief to selectedShortClip."
            : fallbackNextAction

        return [
            "status": "selected_short_production_brief_fallback",
            "model": "quipsly-selected-short-production-brief",
            "version": "2026-06-30.selected-short-production-brief.fallback-v1",
            "selectedShortId": selectedShortId,
            "selectedShortTitle": selectedShort["title"] ?? "",
            "recommendedAction": [
                "label": "Inspect selected-short quality",
                "why": nextAction,
                "command": "script/agentctl.sh selected-short-quality",
                "tone": "creek"
            ],
            "source": "selectedShortClip.productionBrief missing; fallback built from creatorQuality/publicationPassport.",
            "safeCommands": [
                "quality": "script/agentctl.sh selected-short-quality",
                "humanReviewGuidanceJson": "GET /selected_short_human_review_guidance",
                "humanReviewGuidance": "script/agentctl.sh selected-short-human-review-guidance --markdown",
                "storyContract": "script/agentctl.sh selected-short-story-contract --markdown",
                "productionBrief": "script/agentctl.sh selected-short-production-brief --markdown"
            ],
            "truth": "Read-only selected-short production guidance. Fallback means the loaded app state is older or has not refreshed selectedShortClip.productionBrief yet."
        ]
    }

    private nonisolated static func cachedSelectedShortHumanReviewGuidancePayload() -> [String: Any] {
        func stringValue(_ value: Any?) -> String {
            if let value = value as? String { return value.trimmingCharacters(in: .whitespacesAndNewlines) }
            if let value { return "\(value)".trimmingCharacters(in: .whitespacesAndNewlines) }
            return ""
        }
        func doubleValue(_ value: Any?) -> Double {
            if let value = value as? Double { return value }
            if let value = value as? Int { return Double(value) }
            if let value = value as? String, let parsed = Double(value) { return parsed }
            return 0
        }
        func intValue(_ value: Any?) -> Int {
            if let value = value as? Int { return value }
            if let value = value as? Double { return Int(value) }
            if let value = value as? String, let parsed = Int(value) { return parsed }
            return 0
        }
        func boolValue(_ value: Any?) -> Bool {
            if let value = value as? Bool { return value }
            if let value = value as? Int { return value != 0 }
            if let value = value as? Double { return value != 0 }
            if let value = value as? String {
                return ["1", "true", "yes", "risk", "warning"].contains(value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
            }
            return false
        }
        func dictionaryValue(_ value: Any?) -> [String: Any] {
            value as? [String: Any] ?? [:]
        }
        func hasItems(_ value: Any?) -> Bool {
            if let value = value as? [Any] { return !value.isEmpty }
            if let value = value as? [String: Any] { return !value.isEmpty }
            if let value = value as? String { return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            return false
        }
        func checklistStatus(_ quality: [String: Any], _ itemId: String) -> String {
            guard let items = quality["reviewChecklist"] as? [[String: Any]] else { return "unknown" }
            return items.first { stringValue($0["id"]) == itemId }.map { stringValue($0["status"]) } ?? "unknown"
        }
        func cutEvidenceHasRisk(_ evidence: [String: Any]) -> Bool {
            boolValue(evidence["hasRisk"])
                || intValue(evidence["highSeverityCount"]) > 0
                || intValue(evidence["cadenceWarningCount"]) > 0
                || intValue(evidence["jumpCutRiskCount"]) > 0
                || intValue(evidence["overlappedFindingCount"]) > 0
        }

        let quality = cachedSelectedShortQualityPayload()
        let qualityStatus = stringValue(quality["status"])
        let selectedShortId = stringValue(quality["selectedShortId"])
        guard qualityStatus == "selected_short_quality", !selectedShortId.isEmpty else {
            return [
                "ok": false,
                "status": "needs-selected-short",
                "model": "quipslystudio-selected-short-human-review-guidance",
                "version": "2026-06-30.selected-short-human-review-guidance.app-v1",
                "nextAction": quality["nextAction"] ?? quality["nextSafeAction"] ?? "Select a short recipe, then rerun selected-short human review guidance.",
                "qualityStatus": qualityStatus,
                "safeCommands": [
                    "shortsQueue": "script/agentctl.sh shorts-queue",
                    "nextShort": "script/agentctl.sh shorts-review-next",
                    "cutRiskShort": "script/agentctl.sh shorts-review-next-cut-risk any",
                    "quality": "script/agentctl.sh selected-short-quality"
                ],
                "truth": "Read-only selected-short review guidance. No media, timeline, export, or publication state changed."
            ]
        }

        let hook = stringValue(quality["hook"])
        let caption = stringValue(quality["captionDraft"])
        let overlay = stringValue(quality["primaryOverlayText"])
        let duration = doubleValue(quality["recipeDuration"])
        let reviewMode = dictionaryValue(quality["recommendedReviewMode"])
        let structure = dictionaryValue(quality["shortRecipeStructure"])
        let transitionReview = quality["shortTransitionReview"] as? [[String: Any]] ?? []
        let cutEvidence = dictionaryValue(quality["cutIntelligenceEvidence"])
        let platformVariants = quality["platformVariants"]
        let exportStatus = stringValue(quality["exportStatus"])
        let segmentCount = intValue(structure["segmentCount"])
        let structureName = stringValue(structure["structure"]).lowercased()

        let hookMissing = hook.isEmpty
        let captionMissing = caption.isEmpty && overlay.isEmpty
        let longShort = duration > 65
        let multiSegment = segmentCount > 1 || structureName.contains("multi") || !transitionReview.isEmpty
        let cutRisk = cutEvidenceHasRisk(cutEvidence)
        let platformsMissing = !hasItems(platformVariants)
        let exportMissing = exportStatus.isEmpty || exportStatus.lowercased() == "not-exported"

        let reviewRead: String
        let primaryQuestion: String
        if hookMissing {
            reviewRead = "hook-first"
            primaryQuestion = "Does this short make a clear promise, tension, mistake, or question in the first few seconds?"
        } else if multiSegment {
            reviewRead = "join-rhythm"
            primaryQuestion = "Do the internal joins feel intentional, or do they clip thought, reset captions, or fake momentum?"
        } else if cutRisk {
            reviewRead = "cut-risk-proof"
            primaryQuestion = "Does Cut Intelligence point to a cadence, jump-cut, or reaction issue that changes whether this should be kept?"
        } else if captionMissing {
            reviewRead = "caption-framing"
            primaryQuestion = "Can someone understand and want this short without audio, and does text stay off faces?"
        } else if platformsMissing {
            reviewRead = "platform-fit"
            primaryQuestion = "What native promise does this short make on YouTube Shorts, Instagram, Facebook, or LinkedIn?"
        } else if longShort {
            reviewRead = "duration-tradeoff"
            primaryQuestion = "Is the longer duration earning attention, or should this become a tighter short or a separate clip?"
        } else if exportMissing {
            reviewRead = "export-proof"
            primaryQuestion = "Does the actual rendered file prove pacing, audio, captions, and framing, or is this still only metadata?"
        } else {
            reviewRead = "human-final-pass"
            primaryQuestion = "Would a real viewer keep watching, understand the point, and feel the people rather than the edit?"
        }

        let guidance: [String: Any] = [
            "reviewRead": reviewRead,
            "primaryQuestion": primaryQuestion,
            "proofInstruction": "Watch the short at normal speed before Keep. Scrub for repairs, but judge the viewer experience in playback.",
            "doNotPostIf": [
                "The hook is vague, missing, or starts after the viewer would scroll away.",
                "A jump or join makes the speaker feel chopped up or falsely frantic.",
                "Captions, overlays, or crop land on faces or hide the emotional cue.",
                "The payoff does not reward the hook.",
                "The clip is technically exportable but not emotionally worth posting."
            ],
            "refineIf": [
                "The first sentence can be tightened without losing warmth.",
                "A reaction, cover, or B-roll moment clarifies the emotional beat.",
                "The caption can become a clearer promise instead of a summary.",
                "A boundary nudge preserves breath while removing pure reset noise.",
                "A platform variant needs a more native title, caption, or framing choice."
            ],
            "keepIf": [
                "The first three seconds create curiosity or useful tension.",
                "The edit sounds like a person talking, not a machine removing silence.",
                "The visual crop, captions, and payoff all support the same idea.",
                "The platform packet tells a human exactly what to post and why."
            ],
            "signals": [
                "hookMissing": hookMissing,
                "captionOrOverlayMissing": captionMissing,
                "multiSegment": multiSegment,
                "cutRiskEvidencePresent": cutRisk,
                "platformVariantsMissing": platformsMissing,
                "exportProofMissing": exportMissing,
                "longerThan65Seconds": longShort,
                "recommendedMode": reviewMode["mode"] ?? "",
                "hookStatus": checklistStatus(quality, "hook"),
                "pacingStatus": checklistStatus(quality, "pacing"),
                "captionFramingStatus": checklistStatus(quality, "caption-framing"),
                "platformStatus": checklistStatus(quality, "platform-variants"),
                "exportStatus": checklistStatus(quality, "export-proof")
            ],
            "agentRule": "Optimize for viewer attention and human cadence together. Do not turn people into hyper-clean clip paste."
        ]

        return [
            "ok": true,
            "status": "selected_short_human_review_guidance",
            "model": "quipslystudio-selected-short-human-review-guidance",
            "version": "2026-06-30.selected-short-human-review-guidance.app-v1",
            "selectedShort": [
                "id": selectedShortId,
                "title": quality["title"] ?? "",
                "sequenceStart": quality["sequenceStart"] ?? 0,
                "sequenceEnd": quality["sequenceEnd"] ?? 0,
                "recipeDuration": quality["recipeDuration"] ?? 0,
                "reviewStatus": quality["reviewStatus"] ?? "",
                "exportStatus": quality["exportStatus"] ?? "",
                "primaryPlatform": quality["primaryPlatform"] ?? ""
            ],
            "humanReviewGuidance": guidance,
            "nextAction": primaryQuestion,
            "safeCommands": [
                "qualityJson": "GET /selected_short_quality",
                "productionBriefJson": "GET /selected_short_production_brief",
                "quality": "script/agentctl.sh selected-short-quality",
                "productionBrief": "script/agentctl.sh selected-short-production-brief --markdown",
                "stateContract": "script/agentctl.sh selected-short-state-contract-check --markdown",
                "previewSelected": "script/agentctl.sh shorts-preview-selected true",
                "markKeep": "script/agentctl.sh shorts-review-selected keep \"human-reviewed for viewer attention and cadence\"",
                "markRefine": "script/agentctl.sh shorts-review-selected refine \"needs hook, pacing, caption, framing, or cut-risk refinement\"",
                "markReject": "script/agentctl.sh shorts-review-selected reject \"not strong enough for this platform batch\""
            ],
            "truth": "Read-only selected-short human review guidance. It does not approve, export, publish, relink, move timeline decisions, or mutate source media."
        ]
    }

    private nonisolated static func cachedSelectedShortQualityPayload() -> [String: Any] {
        func stringValue(_ value: Any?) -> String {
            if let value = value as? String { return value }
            if let value { return "\(value)" }
            return ""
        }
        func doubleValue(_ value: Any?) -> Double {
            if let value = value as? Double { return value }
            if let value = value as? Int { return Double(value) }
            if let value = value as? String, let parsed = Double(value) { return parsed }
            return 0
        }
        func intValue(_ value: Any?) -> Int {
            if let value = value as? Int { return value }
            if let value = value as? Double { return Int(value) }
            if let value = value as? String, let parsed = Int(value) { return parsed }
            return 0
        }
        func boolValue(_ value: Any?) -> Bool {
            if let value = value as? Bool { return value }
            if let value = value as? Int { return value != 0 }
            if let value = value as? Double { return value != 0 }
            if let value = value as? String {
                return ["1", "true", "yes", "risk", "warning"].contains(value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
            }
            return false
        }
        func cutEvidenceHasRisk(_ evidence: [String: Any]) -> Bool {
            boolValue(evidence["hasRisk"])
                || intValue(evidence["highSeverityCount"]) > 0
                || intValue(evidence["cadenceWarningCount"]) > 0
                || intValue(evidence["jumpCutRiskCount"]) > 0
                || intValue(evidence["overlappedFindingCount"]) > 0
        }
        func hasItems(_ value: Any?) -> Bool {
            if let value = value as? [Any] { return !value.isEmpty }
            if let value = value as? [[String: Any]] { return !value.isEmpty }
            if let value = value as? [String: Any] { return !value.isEmpty }
            if let value = value as? String { return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            return false
        }

        guard let status = cachedStatusDictionary() else {
            return [
                "status": "no_state_yet",
                "model": "quipslystudio-selected-short-quality",
                "hint": "Open QuipslyStudio and load a native editor session, then call /selected_short_quality again.",
                "truth": "This endpoint is read-only. It does not approve, publish, export, trim, or mutate source media."
            ]
        }

        let selectedShort = status["selectedShortClip"] as? [String: Any] ?? [:]
        let selectedShortId = selectedShort["id"] as? String ?? status["selectedShortClipId"] as? String ?? ""
        guard !selectedShortId.isEmpty else {
            return [
                "status": "no_selected_short",
                "model": "quipslystudio-selected-short-quality",
                "truth": "Select a short recipe first. Shorts are metadata recipes over sequence time; this endpoint does not chop source media.",
                "nextAction": "Use the shorts panel or script/agentctl.sh shorts-review-next, then rerun selected-short quality.",
                "safeCommands": [
                    "shortsQueue": "script/agentctl.sh shorts-queue",
                    "nextShort": "script/agentctl.sh shorts-review-next",
                    "cutRiskShort": "script/agentctl.sh shorts-review-next-cut-risk any",
                    "reviewMode": "script/agentctl.sh selected-short-review-mode",
                    "humanReviewGuidanceJson": "GET /selected_short_human_review_guidance",
                    "humanReviewGuidance": "script/agentctl.sh selected-short-human-review-guidance --markdown",
                    "productionBrief": "script/agentctl.sh selected-short-production-brief --markdown",
                    "saveProductionBrief": "script/agentctl.sh selected-short-production-brief-save",
                    "reviewBrief": "script/agentctl.sh selected-short-review-brief --markdown",
                    "saveReviewBrief": "script/agentctl.sh selected-short-review-brief-save"
                ]
            ]
        }

        let quality = selectedShort["creatorQuality"] as? [String: Any] ?? [:]
        let passport = selectedShort["publicationPassport"] as? [String: Any] ?? [:]
        let qualitySummary = quality["qualityPacketSummary"] as? [String: Any] ?? [:]
        let weakestDimensions = quality["weakestQualityDimensions"] ?? quality["qualityDimensions"] ?? []
        let cutEvidence = selectedShort["cutIntelligenceEvidence"] as? [String: Any] ?? quality["cutIntelligenceEvidence"] as? [String: Any] ?? [:]
        let platformVariants = selectedShort["platformVariants"] ?? quality["platformVariants"] ?? passport["platformVariants"] ?? []
        let hookText = stringValue(selectedShort["hookText"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let captionDraft = stringValue(selectedShort["captionDraft"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let overlayText = stringValue(selectedShort["primaryOverlayText"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let duration = doubleValue(selectedShort["recipeDuration"] ?? selectedShort["duration"])
        let exportRanges = exportRangesForShortClip(selectedShort)
        let shortRecipeSegments: [[String: Any]] = exportRanges.enumerated().map { index, range in
            let start = doubleValue(range["start"] ?? range["sequenceStart"] ?? range["sequenceStartTime"])
            let end = doubleValue(range["end"] ?? range["sequenceEnd"] ?? range["sequenceEndTime"])
            let rangeDuration = doubleValue(range["duration"])
            let resolvedDuration = rangeDuration > 0 ? rangeDuration : max(0, end - start)
            return [
                "index": index + 1,
                "sequenceStart": start,
                "sequenceEnd": end,
                "duration": resolvedDuration,
                "source": range["source"] ?? range["sourceLabel"] ?? "selected-short-recipe"
            ]
        }
        let shortRecipeStructure: [String: Any] = [
            "segmentCount": shortRecipeSegments.count,
            "structure": shortRecipeSegments.count > 1 ? "multi-segment-highlight" : "single-continuous-pull",
            "editingImplication": shortRecipeSegments.count > 1
                ? "Review transitions between segments for cadence, reaction continuity, captions, and whether the assembled highlight feels earned."
                : "Review hook, payoff, breathing room, and the in/out points around one continuous idea.",
            "segments": shortRecipeSegments
        ]
        let shortTransitionReview: [[String: Any]] = shortRecipeSegments.count > 1
            ? shortRecipeSegments.dropLast().enumerated().map { index, segment in
                let nextSegment = shortRecipeSegments[index + 1]
                let outTime = doubleValue(segment["sequenceEnd"])
                let inTime = doubleValue(nextSegment["sequenceStart"])
                let sequenceGap = inTime - outTime
                let joinType: String
                if abs(sequenceGap) < 0.05 {
                    joinType = "hard-join"
                } else if sequenceGap > 0 {
                    joinType = "time-jump"
                } else {
                    joinType = "overlap-or-l-cut-candidate"
                }
                return [
                    "joinIndex": index + 1,
                    "fromSegment": index + 1,
                    "toSegment": index + 2,
                    "outSequenceTime": outTime,
                    "inSequenceTime": inTime,
                    "sequenceGap": sequenceGap,
                    "joinType": joinType,
                    "risk": joinType == "hard-join"
                        ? "Check for clipped words, face pop, caption reset, or missing breath."
                        : "Check whether this jump is clearly motivated by the hook and payoff.",
                    "reviewAction": "Play 1-2 seconds before and after this join in Program output, then confirm the short still feels like one thought."
                ]
            }
            : []
        let exported = !stringValue(selectedShort["exportStatus"]).isEmpty
            && stringValue(selectedShort["exportStatus"]).lowercased() != "not-exported"
        let hasCutEvidence = cutEvidenceHasRisk(cutEvidence)
        let hasPlatformVariants = hasItems(platformVariants)
        let needsCaptionOrOverlay = captionDraft.isEmpty && overlayText.isEmpty
        let recommendedReviewMode: [String: Any]
        if !shortTransitionReview.isEmpty {
            recommendedReviewMode = [
                "mode": "join-rhythm-pass",
                "label": "Proof the joins first",
                "reason": "This short is assembled from multiple sequence segments, so the biggest risk is cadence, face pops, caption resets, or an unearned jump.",
                "firstAction": "Play each join with 1-2 seconds of handles before judging hook copy."
            ]
        } else if hookText.isEmpty {
            recommendedReviewMode = [
                "mode": "hook-pass",
                "label": "Write the hook first",
                "reason": "The short is continuous, but it does not yet explain why a viewer should stop scrolling.",
                "firstAction": "Draft a concrete first-second promise, question, mistake, or tension."
            ]
        } else if duration > 65 {
            recommendedReviewMode = [
                "mode": "pacing-pass",
                "label": "Check length and payoff",
                "reason": "This recipe is longer than a typical tight short, so it needs a clear payoff or a deliberate platform-native reason.",
                "firstAction": "Listen for dead air, repeated setup, or an ending that arrives too late."
            ]
        } else if needsCaptionOrOverlay {
            recommendedReviewMode = [
                "mode": "caption-framing-pass",
                "label": "Add text and check safe zones",
                "reason": "No caption or overlay draft is attached yet, so the short may be hard to evaluate in a social feed context.",
                "firstAction": "Add platform caption copy or one face-safe on-screen phrase, then check crop/framing."
            ]
        } else if !hasCutEvidence {
            recommendedReviewMode = [
                "mode": "listen-through-pass",
                "label": "Watch and listen once",
                "reason": "No Cut Intelligence overlap is attached, so the safest next move is a simple human-feeling proof pass.",
                "firstAction": "Watch the whole short once at normal speed before marking Keep or Refine."
            ]
        } else if !exported {
            recommendedReviewMode = [
                "mode": "export-proof-pass",
                "label": "Render proof before posting",
                "reason": "Metadata looks reviewable, but there is no rendered export proof yet.",
                "firstAction": "Export a versioned proof and watch the actual file before platform handoff."
            ]
        } else {
            recommendedReviewMode = [
                "mode": "publication-sanity-pass",
                "label": "Final human sanity pass",
                "reason": "Core review metadata is present. The remaining risk is whether the rendered short feels worth posting today.",
                "firstAction": "Watch the export, confirm title/caption/platform fit, then mark Keep/Refine/Reject."
            ]
        }
        let reviewChecklist: [[String: Any]] = [
            [
                "id": "recommended-review-mode",
                "label": "Start here",
                "status": recommendedReviewMode["mode"] ?? "unknown",
                "evidence": recommendedReviewMode["reason"] ?? "",
                "nextAction": recommendedReviewMode["firstAction"] ?? ""
            ],
            [
                "id": "recipe-structure",
                "label": "Short recipe shape",
                "status": shortRecipeSegments.count > 1 ? "multi_segment" : "continuous",
                "evidence": shortRecipeSegments.count > 1
                    ? "\(shortRecipeSegments.count) sequence segments in this short recipe."
                    : "One continuous sequence range.",
                "nextAction": shortRecipeSegments.count > 1
                    ? "Proof the joins like real edits: listen for cadence bumps, face jumps, and caption resets."
                    : "Tune start/end tightly enough to feel intentional without choking the thought."
            ],
            [
                "id": "segment-joins",
                "label": "Segment join rhythm",
                "status": shortTransitionReview.isEmpty ? "no_joins" : "needs_join_review",
                "evidence": shortTransitionReview.isEmpty
                    ? "No internal joins; this is a continuous short recipe."
                    : "\(shortTransitionReview.count) internal join(s) need a human-feeling pass.",
                "nextAction": shortTransitionReview.isEmpty
                    ? "Review the entry and exit point instead of transition joins."
                    : "Proof each join for clipped speech, false reaction, caption reset, and whether the jump helps the hook."
            ],
            [
                "id": "hook",
                "label": "First-second hook",
                "status": hookText.isEmpty ? "needs_work" : "present",
                "evidence": hookText.isEmpty ? "No hook text on selected short." : hookText,
                "nextAction": hookText.isEmpty ? "Write a concrete promise, tension, question, or mistake before Keep." : "Watch the first 3 seconds and verify the video supports the hook."
            ],
            [
                "id": "pacing",
                "label": "Pacing and payoff",
                "status": duration <= 0 ? "unknown" : (duration > 65 ? "review_long" : "review"),
                "evidence": duration <= 0 ? "Duration unavailable." : String(format: "%.1fs recipe", duration),
                "nextAction": duration > 65 ? "Check whether this should become a tighter short or a longer platform-native clip." : "Proof-listen for rushed cuts, dead air, and whether the ending rewards the hook."
            ],
            [
                "id": "caption-framing",
                "label": "Caption and 9:16 framing",
                "status": (captionDraft.isEmpty && overlayText.isEmpty) ? "needs_metadata" : "metadata_present",
                "evidence": (captionDraft.isEmpty && overlayText.isEmpty) ? "No caption or overlay draft present." : "Caption/overlay metadata exists; keep text face-safe before burn-in.",
                "nextAction": (captionDraft.isEmpty && overlayText.isEmpty) ? "Add platform caption copy or one face-safe on-screen phrase." : "Inspect crop and safe zones so text does not land on faces."
            ],
            [
                "id": "platform-variants",
                "label": "Native platform variants",
                "status": hasPlatformVariants ? "present" : "missing",
                "evidence": hasPlatformVariants ? "Platform variant metadata exists." : "No platform variants found in selected-short packet.",
                "nextAction": hasPlatformVariants ? "Review title, caption, hashtags, and destination fit." : "Draft native variants before queueing this short."
            ],
            [
                "id": "cut-risk",
                "label": "Cut Intelligence overlap",
                "status": hasCutEvidence ? "review" : "clear",
                "evidence": hasCutEvidence ? "Cut Intelligence risk evidence is attached." : "No Cut Intelligence warnings overlap this short.",
                "nextAction": hasCutEvidence ? "Review jump-cut, cadence, or preserved-air warnings before Keep." : "Proof-listen once; no cut-risk detour is required unless the edit feels odd."
            ],
            [
                "id": "export-proof",
                "label": "Export proof",
                "status": exported ? "has_status" : "not_proven",
                "evidence": stringValue(selectedShort["exportStatus"]).isEmpty ? "No export status present." : "Export status: \(selectedShort["exportStatus"] ?? "")",
                "nextAction": exported ? "Watch the real export before publication handoff." : "Do not treat metadata quality as rendered proof; export when the recipe is ready."
            ]
        ]
        let nextAction = passport["nextAction"]
            ?? qualitySummary["nextSafeAction"]
            ?? quality["nextAction"]
            ?? "Review hook, pacing, caption/framing, and Cut Intelligence overlap before Keep/Refine/Reject."

        return [
            "status": "selected_short_quality",
            "model": "quipslystudio-selected-short-quality",
            "selectedShortId": selectedShortId,
            "title": selectedShort["title"] ?? "",
            "sequenceStart": selectedShort["sequenceStartTime"] ?? selectedShort["startTime"] ?? 0,
            "sequenceEnd": selectedShort["sequenceEndTime"] ?? selectedShort["endTime"] ?? 0,
            "recipeDuration": selectedShort["recipeDuration"] ?? selectedShort["duration"] ?? 0,
            "hook": hookText,
            "captionDraft": captionDraft,
            "primaryOverlayText": overlayText,
            "platforms": selectedShort["platforms"] ?? passport["platforms"] ?? quality["platforms"] ?? [],
            "reviewStatus": selectedShort["reviewStatus"] ?? "",
            "reviewEvents": selectedShort["reviewEvents"] ?? [],
            "exportStatus": selectedShort["exportStatus"] ?? "",
            "primaryPlatform": passport["primaryPlatform"] ?? quality["primaryPlatform"] ?? "",
            "reviewClass": quality["reviewClass"] ?? qualitySummary["reviewClass"] ?? passport["reviewClass"] ?? "",
            "reviewClassLabel": quality["reviewClassLabel"] ?? qualitySummary["reviewClassLabel"] ?? passport["reviewClassLabel"] ?? "",
            "reviewClassExplanation": quality["reviewClassExplanation"] ?? qualitySummary["reviewClassExplanation"] ?? passport["reviewClassExplanation"] ?? "",
            "reviewPriority": quality["reviewPriority"] ?? qualitySummary["reviewPriority"] ?? passport["reviewPriority"] ?? 0,
            "nextReviewAction": quality["nextReviewAction"] ?? passport["nextReviewAction"] ?? nextAction,
            "publicationPassport": passport,
            "qualitySummary": qualitySummary,
            "weakestQualityDimensions": weakestDimensions,
            "recommendedReviewMode": recommendedReviewMode,
            "shortRecipeStructure": shortRecipeStructure,
            "shortTransitionReview": shortTransitionReview,
            "platformVariants": platformVariants,
            "destinationPresets": selectedShort["destinationPresets"] ?? [],
            "platformTargets": selectedShort["platformTargets"] ?? quality["platformTargets"] ?? passport["platformTargets"] ?? [],
            "platformTargetSummary": selectedShort["platformTargetSummary"] ?? quality["platformTargetSummary"] ?? passport["platformTargetSummary"] ?? [:],
            "platformDraftSummary": selectedShort["platformDraftSummary"] ?? quality["platformDraftSummary"] ?? [:],
            "cutIntelligenceEvidence": cutEvidence,
            "reviewChecklist": reviewChecklist,
            "nextSafeAction": nextAction,
            "safeCommands": [
                "reviewMode": "script/agentctl.sh selected-short-review-mode",
                "humanReviewGuidanceJson": "GET /selected_short_human_review_guidance",
                "humanReviewGuidance": "script/agentctl.sh selected-short-human-review-guidance --markdown",
                "productionBrief": "script/agentctl.sh selected-short-production-brief --markdown",
                "saveProductionBrief": "script/agentctl.sh selected-short-production-brief-save",
                "reviewBrief": "script/agentctl.sh selected-short-review-brief --markdown",
                "saveReviewBrief": "script/agentctl.sh selected-short-review-brief-save",
                "selectNext": "script/agentctl.sh shorts-review-next",
                "selectCutRisk": "script/agentctl.sh shorts-review-next-cut-risk any",
                "previewSelected": "script/agentctl.sh shorts-preview-selected true",
                "appendSegment": "script/agentctl.sh shorts-append-selected-segment",
                "nudgeStart": "script/agentctl.sh shorts-range-selected start delta -0.1",
                "nudgeEnd": "script/agentctl.sh shorts-range-selected end delta 0.1",
                "markKeep": "script/agentctl.sh shorts-review-selected keep \"reviewed for now; not publication approval\"",
                "markRefine": "script/agentctl.sh shorts-review-selected refine \"needs hook, pacing, caption, framing, or cut-overlap refinement\"",
                "markReject": "script/agentctl.sh shorts-review-selected reject \"not strong enough for this platform batch\"",
                "craftGuidance": "script/agentctl.sh cut-craft-guidance"
            ],
            "truth": "Read-only selected-short quality passport. Shorts remain output recipes over sequence time; this does not approve, export, publish, or mutate source media."
        ]
    }

    private nonisolated static func cachedEditorLoopProofPayload() -> [String: Any] {
        editorLoopProofPayload(from: cachedStatusDictionary())
    }

    private nonisolated static func cachedAgentPlayheadContextPayload() -> [String: Any] {
        agentPlayheadContextPayload(from: cachedStatusDictionary())
    }

    private nonisolated static func agentPlayheadContextPayload(from status: [String: Any]?) -> [String: Any] {
        guard let status else {
            return [
                "status": "no_state_yet",
                "model": "quipslystudio-agent-playhead-context",
                "hint": "Open QuipslyStudio, load a native editor session, then call /agent_playhead_context again.",
                "truth": "This is a compact read-only cockpit for agent editing. It does not mutate decisions, media, exports, or publication state."
            ]
        }

        func stringValue(_ value: Any?) -> String {
            if let value = value as? String { return value }
            if let value = value as? NSNumber { return value.stringValue }
            if let value { return "\(value)" }
            return ""
        }

        func doubleValue(_ value: Any?) -> Double {
            if let value = value as? Double { return value }
            if let value = value as? Float { return Double(value) }
            if let value = value as? Int { return Double(value) }
            if let value = value as? NSNumber { return value.doubleValue }
            if let value = value as? String, let parsed = Double(value) { return parsed }
            return 0
        }

        func intValue(_ value: Any?) -> Int {
            if let value = value as? Int { return value }
            if let value = value as? NSNumber { return value.intValue }
            if let value = value as? String, let parsed = Int(value) { return parsed }
            return 0
        }

        func boolValue(_ value: Any?) -> Bool {
            if let value = value as? Bool { return value }
            if let value = value as? NSNumber { return value.boolValue }
            if let value = value as? String {
                return ["1", "true", "yes", "ready", "ok"].contains(value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased())
            }
            return false
        }

        func dict(_ value: Any?) -> [String: Any] {
            value as? [String: Any] ?? [:]
        }

        func arrayOfDicts(_ value: Any?) -> [[String: Any]] {
            value as? [[String: Any]] ?? []
        }

        func round2(_ value: Double) -> Double {
            (value * 100).rounded() / 100
        }

        let playhead = doubleValue(status["playhead"] ?? status["playheadSeconds"])
        let lanes = arrayOfDicts(status["sourceLaneInventory"]).isEmpty
            ? arrayOfDicts(status["lanes"])
            : arrayOfDicts(status["sourceLaneInventory"])
        let selectedDecision = dict(status["selectedDecision"])
        let selectedShort = dict(status["selectedShortClip"])
        let shortQueue = dict(status["shortClipQueue"])
        let cutIntelligence = dict(status["cutIntelligenceReport"]).isEmpty
            ? dict(status["cutIntelligence"])
            : dict(status["cutIntelligenceReport"])
        let cutCraftProfile = dict(cutIntelligence["craftProfile"])
        let branchTruth = dict(status["branchTruth"])
        let programOutputTruth = dict(status["programOutputTruth"])

        let sourceCards = lanes.map { lane -> [String: Any] in
            let duration = doubleValue(lane["durationSeconds"])
            let offset = doubleValue(lane["offsetSeconds"])
            let sourceTime = playhead - offset
            let present = sourceTime >= 0 && (duration <= 0 || sourceTime <= duration)
            let ready = boolValue(lane["isReady"]) || stringValue(lane["readiness"]).lowercased().contains("proxy ready")
            let held = boolValue(lane["ignoreForProduction"]) || stringValue(lane["readiness"]).lowercased().contains("held")
            let blocked = !ready || held
            let mediaKind = stringValue(lane["mediaKind"])
            let role = stringValue(lane["role"])
            let showCount = intValue(lane["showDecisionCount"])
            let skipCount = intValue(lane["skipDecisionCount"])
            let playheadDecision = dict(lane["playheadDecision"])
            let playheadDecisionLabel = stringValue(playheadDecision["label"])
            let playheadDecisionEffect = stringValue(playheadDecision["effect"])

            var nextAction = "Inspect this whole source lane against Program Output before writing metadata."
            if held {
                nextAction = "Preserved for recovery. Do not use for Play Edit until relinked, unheld, or intentionally restored."
            } else if !present {
                nextAction = "Out of range at the current playhead. Scrub to this source's synced range before judging it."
            } else if !ready {
                nextAction = stringValue(lane["recoveryNextAction"]).isEmpty
                    ? "Attach or generate a proxy before visual review."
                    : stringValue(lane["recoveryNextAction"])
            } else if playheadDecisionLabel == "SHOW" {
                nextAction = "Program Output may use this source in Play Edit now. Review framing, cadence, and whether this source choice earns the moment."
            } else if playheadDecisionLabel == "SKIP" {
                nextAction = "Play Through this span before trusting the skip. Preserve breath, laughter, reaction, and useful thinking air."
            } else if mediaKind == "video" {
                nextAction = "Source is available but quiet. Mark SHOW only if this picture should appear in Program Output."
            }

            return [
                "laneId": stringValue(lane["laneId"]),
                "name": stringValue(lane["laneName"]),
                "role": role,
                "mediaKind": mediaKind,
                "readiness": stringValue(lane["readiness"]),
                "ready": ready,
                "held": held,
                "blocked": blocked,
                "presentAtPlayhead": present,
                "sequenceTime": round2(playhead),
                "sourceTime": round2(max(0, sourceTime)),
                "duration": round2(duration),
                "offset": round2(offset),
                "playheadDecision": [
                    "label": playheadDecisionLabel.isEmpty ? (present ? "AVAILABLE" : "OUT_OF_RANGE") : playheadDecisionLabel,
                    "type": stringValue(playheadDecision["type"]),
                    "tagId": stringValue(playheadDecision["tagId"]),
                    "effect": playheadDecisionEffect.isEmpty
                        ? (present ? "Present for review; no explicit SHOW/SKIP decision reported here." : "Not present at this playhead.")
                        : playheadDecisionEffect,
                    "sourceStartSeconds": playheadDecision["sourceStartSeconds"] ?? NSNull(),
                    "sequenceStartSeconds": playheadDecision["sequenceStartSeconds"] ?? NSNull(),
                    "durationSeconds": playheadDecision["durationSeconds"] ?? NSNull()
                ],
                "showDecisionCount": showCount,
                "skipDecisionCount": skipCount,
                "nextAction": nextAction
            ] as [String: Any]
        }

        let videoSourceCards = sourceCards.filter { stringValue($0["mediaKind"]) == "video" }
        let presentVideoSources = videoSourceCards.filter { boolValue($0["presentAtPlayhead"]) }
        let readyPresentVideoSources = presentVideoSources.filter { boolValue($0["ready"]) && !boolValue($0["held"]) }
        let blockedPresentSources = presentVideoSources.filter { boolValue($0["blocked"]) }
        let showingSources = readyPresentVideoSources.filter { stringValue(dict($0["playheadDecision"])["label"]) == "SHOW" }
        let skippedSources = presentVideoSources.filter { stringValue(dict($0["playheadDecision"])["label"]) == "SKIP" }
        let availableQuietSources = readyPresentVideoSources.filter { stringValue(dict($0["playheadDecision"])["label"]) == "AVAILABLE" }
        let visibleSourceSummary = readyPresentVideoSources.prefix(6).map {
            [
                "laneId": stringValue($0["laneId"]),
                "name": stringValue($0["name"]),
                "role": stringValue($0["role"]),
                "sourceTime": $0["sourceTime"] ?? 0,
                "readiness": stringValue($0["readiness"]),
                "playheadDecision": dict($0["playheadDecision"]),
                "showDecisionCount": $0["showDecisionCount"] ?? 0,
                "skipDecisionCount": $0["skipDecisionCount"] ?? 0
            ] as [String: Any]
        }

        let playbackMode = stringValue(status["playbackMode"])
        let playEditMode = playbackMode.lowercased().contains("edit")
        let programMomentStatus: String
        let programMomentPlainEnglish: String
        let playEditBehavior: String
        let playThroughBehavior: String
        if lanes.isEmpty {
            programMomentStatus = "no-sequence"
            programMomentPlainEnglish = "No native editor session is loaded, so there is no episode spine to judge yet."
            playEditBehavior = "Load a session before trusting edit state."
            playThroughBehavior = "Load a session before reviewing source continuity."
        } else if !showingSources.isEmpty {
            programMomentStatus = "showing"
            let names = showingSources.map { stringValue($0["name"]) }.filter { !$0.isEmpty }.joined(separator: " + ")
            programMomentPlainEnglish = "Program Output is showing \(names.isEmpty ? "one or more SHOW sources" : names) at this sequence time."
            playEditBehavior = "Play Edit uses SHOW metadata here; confirm the source choice, crop, and cadence earn the moment."
            playThroughBehavior = "Play Through keeps the same spine time so source monitors can reveal alternate camera/context choices."
        } else if playEditMode && !skippedSources.isEmpty {
            programMomentStatus = "skip-gap"
            programMomentPlainEnglish = "This playhead sits inside SKIP metadata. Play Edit should jump this quiet gap; Play Through should reveal it for proof-listening."
            playEditBehavior = "Play Edit skips this span. Keep it only if the removed air is truly reset noise, dead air, or repeated setup."
            playThroughBehavior = "Play Through should expose the gap so a human or Codex can listen for breath, laugh, reaction, or thinking time before approving the skip."
        } else if !availableQuietSources.isEmpty {
            programMomentStatus = "available-quiet"
            programMomentPlainEnglish = "Ready sources are present, but no SHOW decision is active at this exact playhead. Program Output should be blank or hold according to the current playback mode."
            playEditBehavior = "If this moment should be visible, choose a source and write SHOW metadata. Otherwise preserve it as quiet review space."
            playThroughBehavior = "Play Through can still inspect the whole synced source lanes without making an edit decision."
        } else {
            programMomentStatus = "blocked-or-out-of-range"
            programMomentPlainEnglish = "No ready source is both present and visible at this playhead. This is either a real gap, a recovery moment, or an unloaded/proxy-blocked source."
            playEditBehavior = "Do not invent a cut from missing media. Recover proxies or move to a ready moment."
            playThroughBehavior = "Play Through may show nothing useful until source media is relinked or the playhead enters a ready range."
        }

        let programAtPlayhead: [String: Any] = [
            "status": programMomentStatus,
            "plainEnglish": programMomentPlainEnglish,
            "playEditBehavior": playEditBehavior,
            "playThroughBehavior": playThroughBehavior,
            "showingSourceCount": showingSources.count,
            "skippedSourceCount": skippedSources.count,
            "availableQuietSourceCount": availableQuietSources.count,
            "blockedPresentSourceCount": blockedPresentSources.count,
            "showingSources": showingSources.prefix(4).map { [
                "laneId": stringValue($0["laneId"]),
                "name": stringValue($0["name"]),
                "role": stringValue($0["role"]),
                "sourceTime": $0["sourceTime"] ?? 0
            ] as [String: Any] },
            "truth": "Program state is derived from whole source lanes plus SHOW/SKIP metadata at the shared playhead; it is not a chopped media timeline."
        ]

        let selectedDecisionContext: [String: Any] = [
            "selected": !stringValue(status["selectedTagId"]).isEmpty || !selectedDecision.isEmpty,
            "laneId": stringValue(status["selectedLaneId"]),
            "laneName": stringValue(status["selectedTagLaneName"]).isEmpty
                ? stringValue(selectedDecision["laneName"] ?? selectedDecision["selectedLaneName"])
                : stringValue(status["selectedTagLaneName"]),
            "tagId": stringValue(status["selectedTagId"]),
            "tagType": stringValue(status["selectedTagType"]).isEmpty
                ? stringValue(selectedDecision["tagType"] ?? selectedDecision["selectedTagType"])
                : stringValue(status["selectedTagType"]),
            "start": doubleValue(status["selectedTagStart"] ?? selectedDecision["start"] ?? selectedDecision["selectedTagStart"]),
            "duration": doubleValue(status["selectedTagDuration"] ?? selectedDecision["duration"] ?? selectedDecision["selectedTagDuration"]),
            "hasIntent": boolValue(status["selectedTagHasEditIntent"]) || !dict(status["selectedTagEditIntent"]).isEmpty,
            "cutIntelligenceEndpoint": "GET /selected_decision_intent_evidence",
            "humanGuidanceEndpoint": "GET /selected_decision_human_cut_guidance"
        ]

        let selectedShortContext: [String: Any] = [
            "selected": !stringValue(status["selectedShortClipId"]).isEmpty || !selectedShort.isEmpty,
            "shortRecipeCount": intValue(status["shortClipQueueCount"] ?? shortQueue["count"]),
            "selectedId": stringValue(status["selectedShortClipId"]).isEmpty
                ? stringValue(selectedShort["id"])
                : stringValue(status["selectedShortClipId"]),
            "selectedTitle": stringValue(selectedShort["title"]),
            "reviewStatus": stringValue(selectedShort["reviewStatus"]),
            "exportStatus": stringValue(selectedShort["exportStatus"]),
            "qualityEndpoint": "GET /selected_short_quality",
            "productionBriefEndpoint": "GET /selected_short_production_brief"
        ]

        let cadenceWarnings = arrayOfDicts(cutIntelligence["cadenceWarnings"])
        let jumpRisks = arrayOfDicts(cutIntelligence["jumpCutRisks"])
        let reactionOpportunities = arrayOfDicts(cutIntelligence["reactionOpportunities"])
        let nextCutActions = cutIntelligence["nextActions"] as? [Any] ?? []

        var nextSafeActions: [[String: Any]] = []
        if readyPresentVideoSources.isEmpty {
            nextSafeActions.append([
                "label": "Recover or attach source proxies before judging this playhead",
                "command": "script/agentctl.sh match-folder /absolute/episode-folder",
                "reason": "No ready video source is present at the current playhead."
            ])
        } else {
            nextSafeActions.append([
                "label": "Compare Program Output against ready source monitors",
                "command": "script/agentctl.sh source-window \"\(stringValue(readyPresentVideoSources.first?["name"]))\" show 10",
                "reason": "Ready sources are present; judge the picture before writing SHOW/SKIP metadata."
            ])
        }
        if !boolValue(selectedDecisionContext["selected"]) {
            nextSafeActions.append([
                "label": "Select the nearest decision before trimming or adding intent",
                "command": "script/agentctl.sh select-decision at_playhead video",
                "reason": "No selected SHOW/SKIP decision is available in the compact context."
            ])
        } else if !boolValue(selectedDecisionContext["hasIntent"]) {
            nextSafeActions.append([
                "label": "Explain the selected decision before using it as training evidence",
                "command": "script/agentctl.sh decision-intent-evidence",
                "reason": "Selected decision timing exists, but its why/tradeoff metadata is missing or not exposed."
            ])
        }
        if intValue(selectedShortContext["shortRecipeCount"]) > 0 && !boolValue(selectedShortContext["selected"]) {
            nextSafeActions.append([
                "label": "Select a short recipe for hook/pacing/framing review",
                "command": "script/agentctl.sh shorts-review-next",
                "reason": "Short recipes exist, but none is selected in the current readback."
            ])
        }
        if !cadenceWarnings.isEmpty || !jumpRisks.isEmpty || !reactionOpportunities.isEmpty {
            nextSafeActions.append([
                "label": "Open cut-craft guidance before tightening",
                "command": "script/agentctl.sh cut-craft-guidance",
                "reason": "Cut Intelligence sees cadence, jump-cut, or reaction-cover evidence that can make the edit more human."
            ])
        }

        return [
            "status": "ok",
            "model": "quipslystudio-agent-playhead-context",
            "version": "2026-07-02.agent-playhead-context.v1",
            "generatedAt": ISO8601DateFormatter().string(from: Date()),
            "activeSessionName": status["activeSessionName"] ?? "",
            "branch": [
                "name": branchTruth["branchName"] ?? status["activeSessionName"] ?? "",
                "role": branchTruth["branchRole"] ?? "",
                "truth": branchTruth["truth"] ?? "Branch is a metadata-only decision layer over intact synced source lanes."
            ],
            "sharedPlayhead": [
                "sequenceTime": round2(playhead),
                "playbackMode": status["playbackMode"] ?? "",
                "timelinePixelsPerSecond": status["timelinePixelsPerSecond"] ?? "",
                "lastMediaAction": status["lastMediaAction"] ?? ""
            ],
            "program": [
                "title": status["programTitle"] ?? programOutputTruth["title"] ?? "",
                "mode": status["programMode"] ?? status["playbackMode"] ?? "",
                "outputFormat": status["outputFormat"] ?? "",
                "truth": programOutputTruth["truth"] ?? "Program Output is driven by SHOW/SKIP metadata over the shared playhead."
            ],
            "programAtPlayhead": programAtPlayhead,
            "sourceWall": [
                "laneCount": lanes.count,
                "videoSourceCount": videoSourceCards.count,
                "presentVideoSourceCount": presentVideoSources.count,
                "readyPresentVideoSourceCount": readyPresentVideoSources.count,
                "blockedPresentSourceCount": blockedPresentSources.count,
                "showingSourceCount": showingSources.count,
                "skippedSourceCount": skippedSources.count,
                "availableQuietSourceCount": availableQuietSources.count,
                "readyPresentSources": Array(visibleSourceSummary),
                "allSourcesEndpoint": "GET /state then inspect sourceLaneInventory"
            ],
            "selectedDecision": selectedDecisionContext,
            "shorts": selectedShortContext,
            "cutAwareness": [
                "cadenceMode": cutIntelligence["cadenceMode"] ?? status["cutIntelligenceCadenceMode"] ?? "",
                "summary": cutIntelligence["summary"] ?? "",
                "humanFlowStance": cutCraftProfile["humanFlowStance"] ?? "",
                "cadenceWarningCount": cadenceWarnings.count,
                "jumpCutRiskCount": jumpRisks.count,
                "reactionOpportunityCount": reactionOpportunities.count,
                "nextActions": nextCutActions,
                "truth": cutIntelligence["truth"] ?? "Cut Intelligence is advisory review evidence; it is not an automatic approval to trim."
            ],
            "nextSafeActions": nextSafeActions,
            "agentCanUse": [
                "scrub": "script/agentctl.sh scrub <seconds>",
                "programScroll": "script/agentctl.sh program-scroll <delta-seconds>",
                "selectDecision": "script/agentctl.sh select-decision at_playhead video",
                "sourceWindow": "script/agentctl.sh source-window \"<source name>\" show 10",
                "decisionEvidence": "script/agentctl.sh decision-intent-evidence",
                "shortQuality": "script/agentctl.sh selected-short-quality"
            ],
            "sourcePolicy": "Read-only context. Whole source media stays intact; edits remain transparent metadata."
        ]
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
        let selectedShortQualityDimensions = selectedShortQuality["weakestQualityDimensions"] ?? selectedShortQuality["qualityDimensions"] ?? []
        let sourceProof = status["sourceMonitorSyncProof"] as? [String: Any] ?? [:]
        let programTruth = status["programOutputTruth"] as? [String: Any] ?? [:]
        let workingSet = status["workingSetTruth"] as? [String: Any] ?? [:]
        let branchTruth = status["branchTruth"] as? [String: Any] ?? [:]
        let branchList = status["branchList"] as? [[String: Any]] ?? []
        let cutIntelligence = (status["cutIntelligenceReport"] as? [String: Any])
            ?? (status["cutIntelligence"] as? [String: Any])
            ?? [:]
        let cutCraftProfile = cutIntelligence["craftProfile"] as? [String: Any] ?? [:]
        let cutCraftTruth: [String: Any] = [
            "transcriptCoverageStatus": cutCraftProfile["transcriptCoverageStatus"] ?? "",
            "splitEditOpportunityCount": cutCraftProfile["splitEditOpportunityCount"] ?? 0,
            "coverNeededCount": cutCraftProfile["coverNeededCount"] ?? 0,
            "pauseReviewCount": cutCraftProfile["pauseReviewCount"] ?? 0,
            "straightCutCount": cutCraftProfile["straightCutCount"] ?? 0,
            "humanFlowStance": cutCraftProfile["humanFlowStance"] ?? "",
            "branchAdvice": cutCraftProfile["branchAdvice"] ?? "",
            "shortsAdvice": cutCraftProfile["shortsAdvice"] ?? "",
            "reviewerPrompt": cutCraftProfile["reviewerPrompt"] ?? "",
            "agentInstruction": cutCraftProfile["agentInstruction"] ?? "",
            "craftWarnings": cutCraftProfile["craftWarnings"] ?? [],
            "doNotCutSignals": cutCraftProfile["doNotCutSignals"] ?? [],
            "pauseReviewSignals": cutCraftProfile["pauseReviewSignals"] ?? [],
            "automationGuardrails": cutCraftProfile["automationGuardrails"] ?? []
        ]

        let selectedTagIntent = status["selectedTagEditIntent"] as? [String: Any] ?? [:]
        let selectedIntentEvidence = selectedTagIntent["reviewEvidence"] as? [String] ?? []
        let selectedIntentNextAction = selectedTagIntent["nextReviewAction"] as? String ?? ""
        func selectedDecisionProofString(_ value: Any?) -> String {
            if let value = value as? String { return value }
            if let value { return "\(value)" }
            return ""
        }
        func selectedDecisionProofDouble(_ value: Any?) -> Double {
            if let value = value as? Double { return value }
            if let value = value as? Int { return Double(value) }
            if let value = value as? String, let parsed = Double(value) { return parsed }
            return 0
        }
        func selectedDecisionRecommendedReviewModePayload(tagType: Any?, intent: [String: Any]) -> [String: Any] {
            let normalizedTagType = selectedDecisionProofString(tagType).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let confidence = selectedDecisionProofDouble(intent["confidence"])
            let risk = selectedDecisionProofString(intent["risk"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let cover = selectedDecisionProofString(intent["coverStrategy"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let lead = abs(selectedDecisionProofDouble(intent["audioLeadSeconds"]))
            let tail = abs(selectedDecisionProofDouble(intent["audioTailSeconds"]))
            let text = [
                intent["cutStyle"],
                intent["coverStrategy"],
                intent["cadenceMode"],
                intent["humanRhythmNote"],
                intent["whyThisCutExists"],
                intent["tradeoffExplanation"],
                selectedIntentEvidence.joined(separator: " ")
            ]
            .map { selectedDecisionProofString($0).lowercased() }
            .joined(separator: " ")
            let preserveAir = [
                "breath", "laugh", "hesitat", "thinking", "thought", "comic", "joke",
                "warm", "emotional", "reaction", "pause", "awkward", "beat", "reset",
                "cadence", "too clean", "robotic", "over-tightened"
            ]
            .contains { text.contains($0) }

            if normalizedTagType == "cut" || normalizedTagType == "skip" {
                return [
                    "mode": "preserve-air",
                    "label": "Prove this should disappear",
                    "reason": "This is a SKIP decision. Removed time must be reviewed as human cadence, not treated as automatically wasted time.",
                    "firstAction": preserveAir
                        ? "Play Through this span and mark Hold or Refine if it contains breath, laughter, thought, awkward warmth, or reaction."
                        : "Play Through once and keep the skip only if the span is truly dead air, reset noise, or repeated setup.",
                    "riskLevel": preserveAir ? "preserve_air_before_skip" : "prove_gap_is_safe"
                ]
            }

            if preserveAir {
                return [
                    "mode": "cadence-hold",
                    "label": "Protect the human beat",
                    "reason": "The decision touches rhythm or a meaning-bearing pause. This is where over-cleaned podcast editing starts sounding fake.",
                    "firstAction": "Listen at normal speed before tightening, then preserve any pause, laugh, reaction, or breath that helps the thought land.",
                    "riskLevel": "cadence_sensitive"
                ]
            }

            if (confidence > 0 && confidence < 0.50) || risk.contains("high") {
                return [
                    "mode": "high-care",
                    "label": "Listen before trusting it",
                    "reason": "This decision has low confidence or elevated risk, so the metadata is a review prompt, not a recommendation to approve.",
                    "firstAction": "Cue the boundary, compare source monitors, and add a note before marking Keep.",
                    "riskLevel": risk.isEmpty ? "low_confidence" : risk
                ]
            }

            if lead > 0.03 || tail > 0.03 {
                return [
                    "mode": "split-timing",
                    "label": "Check the J/L timing by ear",
                    "reason": "The decision uses audio lead or tail timing. Good split edits feel invisible; bad ones feel like people stepping on each other.",
                    "firstAction": "Play two seconds before and after the boundary and confirm the audio move adds flow instead of confusion.",
                    "riskLevel": "split_timing_review"
                ]
            }

            if !cover.isEmpty && cover != "none" {
                return [
                    "mode": "cover-check",
                    "label": "Confirm the cover earns its keep",
                    "reason": "A cover strategy is attached. It should clarify the moment, not hide a cut just because hiding cuts feels clever.",
                    "firstAction": "Compare Program Output with the source monitors and confirm the cover improves attention, reaction, or context.",
                    "riskLevel": "cover_review"
                ]
            }

            if intent.isEmpty {
                return [
                    "mode": "intent-metadata",
                    "label": "Explain the decision",
                    "reason": "This selected span has no structured intent payload yet. Training-quality edits need a visible why.",
                    "firstAction": "Add or apply intent metadata before treating this decision as reusable evidence.",
                    "riskLevel": "missing_intent"
                ]
            }

            return [
                "mode": "normal-listen",
                "label": "Do one normal-speed listen",
                "reason": "The decision looks reviewable. The remaining risk is whether it feels natural in the conversation.",
                "firstAction": "Play the boundary once at normal speed and listen for jumpiness, clipped breath, or missing reaction context.",
                "riskLevel": "normal_listen_pass"
            ]
        }
        func selectedDecisionHumanCutGuidancePayload(tagType: Any?, intent: [String: Any]) -> [String: Any] {
            let normalizedTagType = selectedDecisionProofString(tagType).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let confidence = selectedDecisionProofDouble(intent["confidence"])
            let risk = selectedDecisionProofString(intent["risk"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let cover = selectedDecisionProofString(intent["coverStrategy"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let cutStyle = selectedDecisionProofString(intent["cutStyle"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let cadenceMode = selectedDecisionProofString(intent["cadenceMode"]).trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            let lead = abs(selectedDecisionProofDouble(intent["audioLeadSeconds"]))
            let tail = abs(selectedDecisionProofDouble(intent["audioTailSeconds"]))
            let evidenceText = [
                intent["cutStyle"],
                intent["coverStrategy"],
                intent["cadenceMode"],
                intent["humanRhythmNote"],
                intent["whyThisCutExists"],
                intent["tradeoffExplanation"],
                selectedIntentEvidence.joined(separator: " ")
            ]
            .map { selectedDecisionProofString($0).lowercased() }
            .joined(separator: " ")
            let isSkip = normalizedTagType == "cut" || normalizedTagType == "skip"
            let splitEdit = lead > 0.03 || tail > 0.03 || evidenceText.contains("j-cut") || evidenceText.contains("l-cut") || evidenceText.contains("split")
            let reactionCover = !cover.isEmpty && cover != "none" || evidenceText.contains("reaction") || evidenceText.contains("cover")
            let jumpCut = cutStyle.contains("jump") || evidenceText.contains("jump cut") || evidenceText.contains("jump-cut")
            let preserveAir = [
                "breath", "laugh", "hesitat", "thinking", "thought", "comic", "joke",
                "warm", "emotional", "reaction", "pause", "awkward", "beat", "reset",
                "cadence", "too clean", "robotic", "over-tightened", "silence means"
            ]
            .contains { evidenceText.contains($0) }

            let editRead: String
            if isSkip && preserveAir {
                editRead = "dangerous-skip"
            } else if isSkip {
                editRead = "candidate-skip"
            } else if splitEdit {
                editRead = "split-edit-flow"
            } else if reactionCover {
                editRead = "reaction-or-cover"
            } else if jumpCut {
                editRead = "jump-cut"
            } else if preserveAir {
                editRead = "cadence-sensitive-show"
            } else if intent.isEmpty {
                editRead = "unexplained-decision"
            } else {
                editRead = "normal-human-proof"
            }

            let primaryQuestion: String
            switch editRead {
            case "dangerous-skip":
                primaryQuestion = "Does this removed span contain a breath, laugh, reaction, or thinking beat that makes the conversation feel human?"
            case "candidate-skip":
                primaryQuestion = "Is this genuinely dead air or repeated setup, or are we making the conversation too clean?"
            case "split-edit-flow":
                primaryQuestion = "Does the audio lead/tail make the next thought feel natural, or does it make speakers feel like they are stepping on each other?"
            case "reaction-or-cover":
                primaryQuestion = "Does the cover improve attention, reaction, or context, or is it only hiding an awkward cut?"
            case "jump-cut":
                primaryQuestion = "Does the jump cut preserve meaning and energy without making the speaker feel chopped up?"
            case "cadence-sensitive-show":
                primaryQuestion = "Is this pause or reaction doing useful emotional work?"
            case "unexplained-decision":
                primaryQuestion = "What is this decision trying to improve for the listener?"
            default:
                primaryQuestion = "Does the boundary feel like a person edited it after listening at normal speed?"
            }

            let shouldNotCutIf = [
                "The pause lets a thought land.",
                "A laugh, breath, hesitation, or awkward warmth makes the moment more human.",
                "The reaction shot explains the emotional meaning better than cleaner pacing would.",
                "Removing the gap makes the speaker sound rushed, robotic, or falsely certain.",
                "The cut hides useful context the listener needs for the next sentence."
            ]
            let shouldTightenIf = [
                "The span is pure reset noise, repeated setup, or dead air.",
                "The listener would understand the same thought faster without losing warmth.",
                "The visual cover or reaction makes the seam feel intentional.",
                "The next sentence starts stronger when the boundary moves earlier or later."
            ]
            let metadataToCapture = [
                "whyThisCutExists",
                "tradeoffExplanation",
                "humanRhythmNote",
                "coverStrategy",
                "audioLeadSeconds/audioTailSeconds",
                "normalSpeedProofNote"
            ]

            return [
                "editRead": editRead,
                "primaryQuestion": primaryQuestion,
                "proofInstruction": "Listen at normal speed before marking Keep. Scrubbing proves timing; normal playback proves humanity.",
                "shouldNotCutIf": shouldNotCutIf,
                "shouldTightenIf": shouldTightenIf,
                "metadataToCapture": metadataToCapture,
                "signals": [
                    "isSkip": isSkip,
                    "splitEdit": splitEdit,
                    "reactionCover": reactionCover,
                    "jumpCut": jumpCut,
                    "preserveAir": preserveAir,
                    "lowConfidence": confidence > 0 && confidence < 0.5,
                    "highRisk": risk.contains("high"),
                    "cadenceMode": cadenceMode
                ],
                "agentRule": "Do not optimize for maximum tightness. Optimize for listener trust, clarity, energy, and human cadence.",
                "reviewerLanguage": "Keep if it feels natural. Refine if timing or cover feels off. Hold if the removed air may carry meaning."
            ]
        }
        let selectedDecisionIntentEvidence: [String: Any] = [
            "status": selectedTagIntent.isEmpty ? "missing_or_unselected" : "available",
            "selectedTagId": status["selectedTagId"] ?? "",
            "selectedLaneName": status["selectedTagLaneName"] ?? selectedDecision["laneName"] ?? "",
            "selectedTagType": status["selectedTagType"] ?? selectedDecision["tagType"] ?? "",
            "intentStatus": selectedTagIntent["status"] ?? "",
            "risk": selectedTagIntent["risk"] ?? "",
            "confidence": selectedTagIntent["confidence"] ?? 0,
            "cutStyle": selectedTagIntent["cutStyle"] ?? "",
            "coverStrategy": selectedTagIntent["coverStrategy"] ?? "",
            "cadenceMode": selectedTagIntent["cadenceMode"] ?? "",
            "splitEditRecommendation": selectedTagIntent["splitEditRecommendation"] ?? [:],
            "recommendedReviewMode": selectedDecisionRecommendedReviewModePayload(
                tagType: status["selectedTagType"] ?? selectedDecision["tagType"],
                intent: selectedTagIntent
            ),
            "humanCutGuidance": selectedDecisionHumanCutGuidancePayload(
                tagType: status["selectedTagType"] ?? selectedDecision["tagType"],
                intent: selectedTagIntent
            ),
            "reviewEvidence": selectedIntentEvidence,
            "nextReviewAction": selectedIntentNextAction.isEmpty
                ? "Select a SHOW/SKIP decision and call /selected_decision_intent_evidence before changing timing."
                : selectedIntentNextAction,
            "truth": "Selected decision evidence is read-only proof over metadata. It does not trim, export, publish, or mutate source media."
        ]

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

        func proofString(_ value: Any?) -> String {
            if let value = value as? String { return value }
            if let value = value { return "\(value)" }
            return ""
        }
        func proofDouble(_ value: Any?) -> Double {
            if let value = value as? Double { return value }
            if let value = value as? Int { return Double(value) }
            if let value = value as? String, let parsed = Double(value) { return parsed }
            return 0
        }
        func proofHasItems(_ value: Any?) -> Bool {
            if let value = value as? [[String: Any]] { return !value.isEmpty }
            if let value = value as? [Any] { return !value.isEmpty }
            if let value = value as? [String: Any] { return !value.isEmpty }
            if let value = value as? String { return !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
            return false
        }

        let selectedShortId = proofString(selectedShort["id"])
        let selectedShortHook = proofString(selectedShort["hookText"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedShortCaption = proofString(selectedShort["captionDraft"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedShortOverlay = proofString(selectedShort["primaryOverlayText"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedShortDuration = proofDouble(selectedShort["recipeDuration"] ?? selectedShort["duration"])
        let selectedShortExportStatus = proofString(selectedShort["exportStatus"]).trimmingCharacters(in: .whitespacesAndNewlines)
        let selectedShortCutEvidence = selectedShort["cutIntelligenceEvidence"] as? [String: Any]
            ?? selectedShortQuality["cutIntelligenceEvidence"] as? [String: Any]
            ?? [:]
        let selectedShortPlatformVariants = selectedShort["platformVariants"]
            ?? selectedShortQuality["platformVariants"]
            ?? selectedShortPassport["platformVariants"]
        let selectedShortHasPlatformVariants = proofHasItems(selectedShortPlatformVariants)
        let selectedShortHasCutEvidence = !selectedShortCutEvidence.isEmpty
        let selectedShortHasExportProof = !selectedShortExportStatus.isEmpty
            && selectedShortExportStatus.lowercased() != "not-exported"
        let selectedShortReviewChecklist: [[String: Any]] = selectedShortId.isEmpty
            ? [
                [
                    "id": "select-short",
                    "label": "Select a short recipe",
                    "status": "needed",
                    "evidence": "No selected short recipe is present in the editor-loop proof packet.",
                    "nextAction": "Use script/agentctl.sh shorts-review-next or choose a short in the Shorts panel before scoring quality."
                ]
            ]
            : [
                [
                    "id": "hook",
                    "label": "First-second hook",
                    "status": selectedShortHook.isEmpty ? "needs_work" : "present",
                    "evidence": selectedShortHook.isEmpty ? "No hook text on selected short." : selectedShortHook,
                    "nextAction": selectedShortHook.isEmpty ? "Write a concrete promise, tension, question, or mistake before Keep." : "Watch the first 3 seconds and verify the video supports the hook."
                ],
                [
                    "id": "pacing",
                    "label": "Pacing and payoff",
                    "status": selectedShortDuration <= 0 ? "unknown" : (selectedShortDuration > 65 ? "review_long" : "review"),
                    "evidence": selectedShortDuration <= 0 ? "Duration unavailable." : String(format: "%.1fs recipe", selectedShortDuration),
                    "nextAction": selectedShortDuration > 65 ? "Check whether this should become a tighter short or a longer platform-native clip." : "Proof-listen for rushed cuts, dead air, and whether the ending rewards the hook."
                ],
                [
                    "id": "caption-framing",
                    "label": "Caption and 9:16 framing",
                    "status": (selectedShortCaption.isEmpty && selectedShortOverlay.isEmpty) ? "needs_metadata" : "metadata_present",
                    "evidence": (selectedShortCaption.isEmpty && selectedShortOverlay.isEmpty) ? "No caption or overlay draft present." : "Caption/overlay metadata exists; keep text face-safe before burn-in.",
                    "nextAction": (selectedShortCaption.isEmpty && selectedShortOverlay.isEmpty) ? "Add platform caption copy or one face-safe on-screen phrase." : "Inspect crop and safe zones so text does not land on faces."
                ],
                [
                    "id": "platform-variants",
                    "label": "Native platform variants",
                    "status": selectedShortHasPlatformVariants ? "present" : "missing",
                    "evidence": selectedShortHasPlatformVariants ? "Platform variant metadata exists." : "No platform variants found in selected-short packet.",
                    "nextAction": selectedShortHasPlatformVariants ? "Review title, caption, hashtags, and destination fit." : "Draft native variants before queueing this short."
                ],
                [
                    "id": "cut-risk",
                    "label": "Cut Intelligence overlap",
                    "status": selectedShortHasCutEvidence ? "review" : "clear",
                    "evidence": selectedShortHasCutEvidence ? "Cut Intelligence risk evidence is attached." : "No Cut Intelligence warnings overlap this short.",
                    "nextAction": selectedShortHasCutEvidence ? "Review jump-cut, cadence, or preserved-air warnings before Keep." : "Proof-listen once; no cut-risk detour is required unless the edit feels odd."
                ],
                [
                    "id": "export-proof",
                    "label": "Export proof",
                    "status": selectedShortHasExportProof ? "has_status" : "not_proven",
                    "evidence": selectedShortExportStatus.isEmpty ? "No export status present." : "Export status: \(selectedShortExportStatus)",
                    "nextAction": selectedShortHasExportProof ? "Watch the real export before publication handoff." : "Do not treat metadata quality as rendered proof; export when the recipe is ready."
                ]
            ]
        let selectedShortReviewNextAction = selectedShortId.isEmpty
            ? "Select a short recipe before judging hook, pacing, caption/framing, platform variants, cut risk, or export proof."
            : (selectedShortPassport["nextAction"]
                ?? selectedShortQualitySummary["nextSafeAction"]
                ?? selectedShortQuality["nextAction"]
                ?? "Review hook, pacing, caption/framing, platform variants, Cut Intelligence overlap, and export proof before Keep/Refine/Reject.")
        let selectedShortChecklistStatusCounts = Dictionary(
            grouping: selectedShortReviewChecklist,
            by: { proofString($0["status"]) }
        )
        .mapValues { $0.count }
        let selectedShortNextChecklistItem = selectedShortReviewChecklist.first { item in
            let status = proofString(item["status"])
            return ["needed", "needs_work", "needs_metadata", "missing", "not_proven", "review_long", "unknown"].contains(status)
        } ?? selectedShortReviewChecklist.first ?? [:]
        let selectedShortReviewReadiness: String
        if selectedShortId.isEmpty {
            selectedShortReviewReadiness = "select_short_first"
        } else if selectedShortChecklistStatusCounts["needs_work", default: 0] > 0
            || selectedShortChecklistStatusCounts["needs_metadata", default: 0] > 0
            || selectedShortChecklistStatusCounts["missing", default: 0] > 0
            || selectedShortChecklistStatusCounts["not_proven", default: 0] > 0 {
            selectedShortReviewReadiness = "needs_human_or_agent_refine"
        } else if selectedShortChecklistStatusCounts["review_long", default: 0] > 0
            || selectedShortChecklistStatusCounts["unknown", default: 0] > 0 {
            selectedShortReviewReadiness = "needs_watch_or_listen_review"
        } else {
            selectedShortReviewReadiness = "ready_for_human_keep_reject_decision"
        }

        let shortTruth: [String: Any] = [
            "shortRecipeCount": status["shortClipQueueCount"] ?? shortQueue["count"] ?? 0,
            "selectedShortTitle": selectedShort["title"] ?? "",
            "selectedShortId": selectedShortId,
            "selectedShortRecipeDuration": selectedShort["recipeDuration"] ?? "",
            "selectedShortReviewStatus": selectedShort["reviewStatus"] ?? "",
            "selectedShortExportStatus": selectedShort["exportStatus"] ?? "",
            "selectedShortPrimaryPlatform": selectedShortPassport["primaryPlatform"] ?? selectedShortQuality["primaryPlatform"] ?? "",
            "selectedShortReviewClass": selectedShortQuality["reviewClass"] ?? selectedShortQualitySummary["reviewClass"] ?? selectedShortPassport["reviewClass"] ?? "",
            "selectedShortReviewClassLabel": selectedShortQuality["reviewClassLabel"] ?? selectedShortQualitySummary["reviewClassLabel"] ?? selectedShortPassport["reviewClassLabel"] ?? "",
            "selectedShortReviewPriority": selectedShortQuality["reviewPriority"] ?? selectedShortQualitySummary["reviewPriority"] ?? selectedShortPassport["reviewPriority"] ?? 0,
            "selectedShortNextReviewAction": selectedShortQuality["nextReviewAction"] ?? selectedShortPassport["nextReviewAction"] ?? selectedShortReviewNextAction,
            "selectedShortNextAction": selectedShortReviewNextAction,
            "selectedShortPublicationPassport": selectedShortPassport,
            "selectedShortQualitySummary": selectedShortQualitySummary,
            "selectedShortQualityDimensions": selectedShortQualityDimensions,
            "selectedShortReviewChecklist": selectedShortReviewChecklist,
            "selectedShortChecklistStatusCounts": selectedShortChecklistStatusCounts,
            "selectedShortNextChecklistItem": selectedShortNextChecklistItem,
            "selectedShortReviewReadiness": selectedShortReviewReadiness,
            "selectedShortQualityEndpoint": "GET /selected_short_quality",
            "selectedShortQualityTruth": selectedShortQuality["truth"] ?? "Short quality should come from one visible selected-short quality passport, not parallel hidden scorers.",
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
            "createBranch": "script/agentctl.sh create-branch \"Episode 4 clip weave v001\" experiment",
            "importRenderBranch": "script/agentctl.sh import-render-branch /absolute/path/to/manifest.json",
            "switchBranch": "script/agentctl.sh switch-branch name \"Episode 4 clip weave v001\"",
            "shorts": "script/agentctl.sh shorts-select index 1 && script/agentctl.sh shorts-range-selected start delta -0.1",
            "shortPublicationProof": "script/agentctl.sh editor-loop-proof then inspect shortTruth.selectedShortPublicationPassport",
            "shortQuality": "script/agentctl.sh selected-short-quality",
            "shortReviewMode": "script/agentctl.sh selected-short-review-mode",
            "shortReviewBrief": "script/agentctl.sh selected-short-review-brief --markdown",
            "shortReviewBriefSave": "script/agentctl.sh selected-short-review-brief-save",
            "shortExport": "script/agentctl.sh shorts-export-selected /absolute/output/folder optional-basename",
            "shortReview": "script/agentctl.sh shorts-review-selected keep|refine|reject \"notes\"",
            "cutCraftGuidance": "script/agentctl.sh cut-craft-guidance",
            "cutTechniquePlaybook": "script/agentctl.sh cut-technique-playbook [--markdown]",
            "cutReviewBrief": "script/agentctl.sh cut-review-brief [any|jump|reaction|pause|preserve|split|safe] [--markdown|--json]",
            "cutReviewBriefSave": "script/agentctl.sh cut-review-brief-save [output-folder] [any|jump|reaction|pause|preserve|split|safe] [basename] [--markdown|--json]",
            "cutPreservationBrief": "script/agentctl.sh cut-preservation-brief [--markdown|--json]",
            "cutPreservationBriefSave": "script/agentctl.sh cut-preservation-brief-save [output-folder] [basename] [--markdown|--json]",
            "cutRecipeQueue": "script/agentctl.sh cut-recipe-queue any|jump|reaction|pause|preserve|split|safe [limit]",
            "cutRecipeNext": "script/agentctl.sh cut-recipe-next any|jump|reaction|pause|preserve|split|safe",
            "cutRecipePreview": "script/agentctl.sh cut-recipe-preview <recipe-id>",
            "humanFlowReviewWorkbench": "script/agentctl.sh human-flow-review-workbench any 12",
            "humanFlowReviewState": "script/agentctl.sh human-flow-review-state",
            "humanFlowReviewStateEndpoint": "GET /human_flow_review_state",
            "humanFlowStartHere": "script/agentctl.sh human-flow-start-here",
            "humanFlowPipelineCheck": "script/agentctl.sh human-flow-pipeline-check --markdown",
            "humanFlowReviewDecision": "script/agentctl.sh human-flow-review-decision latest <boundary-id> \"Keep the cadence\" Mako \"review note\"",
            "humanFlowPromotionPlan": "script/agentctl.sh human-flow-review-promotion-plan",
            "humanFlowApproval": "script/agentctl.sh human-flow-review-approval latest <action-ref> approve Mako \"approval note\"",
            "humanFlowApprovedPatchPacket": "script/agentctl.sh human-flow-approved-patch-packet",
            "humanFlowDemo": "script/agentctl.sh human-flow-demo-fixture",
            "humanFlowSmoke": "script/agentctl.sh human-flow-smoke",
            "humanFlowRunbook": "script/agentctl.sh human-flow-runbook",
            "decisionEvidence": "script/agentctl.sh decision-intent-evidence",
            "decisionReviewMode": "script/agentctl.sh selected-decision-review-mode",
            "editorReviewCockpit": "script/agentctl.sh editor-review-cockpit --markdown",
            "editorReviewCockpitSave": "script/agentctl.sh editor-review-cockpit-save"
        ]

        let payload: [String: Any] = [
            "status": "ok",
            "model": "quipslystudio-editor-loop-proof",
            "version": "2026-06-30.editor-loop-proof.v8",
            "generatedAt": ISO8601DateFormatter().string(from: Date()),
            "activeSessionName": status["activeSessionName"] ?? "",
            "coreInvariant": "Whole synced sources stay intact. Gold/red edit decisions and green short recipes are metadata over one shared sequence-time playhead.",
            "sharedPlayhead": sharedPlayhead,
            "branchTruth": [
                "branchId": branchTruth["branchId"] ?? "",
                "branchName": branchTruth["branchName"] ?? status["activeSessionName"] ?? "",
                "branchRole": branchTruth["branchRole"] ?? "legacy-session",
                "branchStatus": branchTruth["branchStatus"] ?? "metadata-fallback",
                "branchPurpose": branchTruth["branchPurpose"] ?? "",
                "parentSequenceId": branchTruth["parentSequenceId"] ?? "",
                "sourceBaselineSequenceId": branchTruth["sourceBaselineSequenceId"] ?? "",
                "truth": branchTruth["truth"] ?? "Branch truth is a named metadata layer over the current synced source spine."
            ],
            "branchList": branchList.map { branch in
                [
                    "sequenceId": branch["sequenceId"] ?? "",
                    "branchName": branch["branchName"] ?? branch["title"] ?? "",
                    "branchRole": branch["branchRole"] ?? "",
                    "branchStatus": branch["branchStatus"] ?? "",
                    "laneCount": branch["laneCount"] ?? 0,
                    "shortRecipeCount": branch["shortRecipeCount"] ?? 0,
                    "active": branch["active"] ?? false
                ]
            },
            "syncProof": syncProof,
            "laneTruth": laneTruth,
            "decisionTruth": decisionTruth,
            "selectedDecisionIntentEvidence": selectedDecisionIntentEvidence,
            "shortTruth": shortTruth,
            "cutCraftTruth": cutCraftTruth,
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
            "activeSourceMapUrl": "http://127.0.0.1:\(port)/active_source_map",
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
        enriched["activeSourceMapUrl"] = "http://127.0.0.1:\(port)/active_source_map"
        enriched["codexEditorHandoffUrl"] = "http://127.0.0.1:\(port)/codex_editor_handoff"
        let safeStatus = Self.jsonSafeDictionary(enriched)
        self.lastStatus = safeStatus
        Self.updateCachedStatusResponse(safeStatus)
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
        commandToExecute = name
        trigger = UUID()
        commandSerial += 1
        let executorRegistered = commandExecutor != nil
        var receipt: [String: Any] = [
            "id": request.id.uuidString,
            "name": name,
            "serial": commandSerial,
            "values": request.redactedValues,
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
        let httpRequests = Self.drainHTTPCommands()
        if let consumerId, activeCommandConsumerId != consumerId {
            return httpRequests
        }
        let requests = pendingCommandRequests
        pendingCommandRequests = []
        return httpRequests + requests
    }

    public func recordCommandProcessing(_ request: AgentCommandRequest, status: String) {
        if status == "drained_by_editor_loop" {
            commandSerial += 1
        }
        var receipt: [String: Any] = [
            "id": request.id.uuidString,
            "name": request.name,
            "serial": commandSerial,
            "values": request.redactedValues,
            "executorRegistered": commandExecutor != nil,
            "mode": "view-drain",
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
}
