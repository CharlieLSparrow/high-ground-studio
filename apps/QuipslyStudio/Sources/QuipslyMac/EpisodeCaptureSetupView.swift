import AppKit
import AVFoundation
import Combine
import QuipslyVideoCore
import SwiftUI
import UniformTypeIdentifiers

@MainActor
final class EpisodeCaptureSetupModel: ObservableObject {
    @Published private(set) var inventory: ProductionCaptureInventory?
    @Published var selectedVideoDeviceID: String?
    @Published var selectedAudioInputID: String?
    @Published var selectedAudioOutputID: String?
    @Published var includeCameraReference = false
    @Published private(set) var cameraPreviewFormat:
        CaptureVideoFormatSnapshot?
    @Published private(set) var cameraPreviewMessage =
        "Choose a camera route to prepare a silent local reference."
    @Published private(set) var cameraPreviewError: String?
    @Published private(set) var cameraSignalVerification:
        ProductionVideoSignalVerification?
    @Published private(set) var activeVideoReceipt:
        ProductionVideoReferenceReceipt?
    @Published private(set) var lastFinalizedVideoReceipt:
        ProductionVideoReferenceReceipt?
    @Published private(set) var interruptedVideoReferences:
        [InterruptedProductionVideoReference] = []
    @Published private(set) var isRefreshing = false
    @Published private(set) var message = "Inspecting connected production sources…"
    @Published var episodeSpaceID = "high-ground-odyssey"
    @Published var participantID = "charlie"
    @Published var callRoomID = ""
    @Published private(set) var activeReceipt: ProductionAudioRecordingReceipt?
    @Published private(set) var lastFinalizedReceipt: ProductionAudioRecordingReceipt?
    @Published private(set) var interruptedRecordings: [InterruptedProductionAudioRecording] = []
    @Published private(set) var elapsedSeconds = 0.0
    @Published private(set) var activeAudioLiveStatus:
        ProductionAudioRecordingLiveStatus?
    @Published private(set) var isFinalizing = false
    @Published private(set) var recordingError: String?
    @Published private(set) var captureGroupID = UUID()
    @Published private(set) var captureGroupIsClosed = false
    @Published private(set) var isImportingCanon = false
    @Published private(set) var canonImportProgress: CanonCardImportProgress?
    @Published private(set) var canonImportMessage = "No camera-card originals imported."
    @Published private(set) var canonImportError: String?
    @Published private(set) var importedCanonReceipts: [CanonCardImportReceipt] = []
    @Published private(set) var attachedLaneIDs: [UUID] = []
    @Published private(set) var canonUploadJobs:
        [UUID: MacCaptureUploadJob] = [:]
    @Published private(set) var canonUploadProgress:
        [UUID: Double] = [:]
    @Published private(set) var canonUploadErrors:
        [UUID: String] = [:]
    @Published private(set) var episodeRooms: [MacEpisodeRoomSummary] = []
    @Published private(set) var selectedEpisodeRoomID: String?
    @Published private(set) var isRefreshingEpisodeRooms = false
    @Published private(set) var episodeRoomMessage =
        "Connect the native account to load authorized Episode Rooms."
    @Published private(set) var episodeRoomError: String?
    @Published private(set) var isLocalOnlyCapture = false
    @Published private(set) var episodeRoomCatalogIsFresh = false
    @Published private(set) var episodeRoomOwnerAccountID: String?
    @Published private(set) var roomReceiptMessage =
        "No Nest recording boundary is active."
    @Published private(set) var roomReceiptError: String?
    @Published private(set) var pendingRoomReceiptCount = 0
    @Published private(set) var isRecoveringRoomReceipts = false
    @Published private(set) var activeUploadJob:
        MacCaptureUploadJob?
    @Published private(set) var activeVideoUploadJob:
        MacCaptureUploadJob?
    @Published private(set) var isUploadingMaster = false
    @Published private(set) var uploadProgress = 0.0
    @Published private(set) var uploadMessage =
        "Finalized Episode Room masters can be uploaded directly to Quipsly's private media vault."
    @Published private(set) var uploadError: String?
    @Published private(set) var videoUploadProgress = 0.0
    @Published private(set) var videoUploadMessage =
        "Authorized camera references can be preserved in Quipsly and projected into the Episode Room after exact-byte verification."
    @Published private(set) var videoUploadError: String?
    @Published private(set) var isAuditingTake = false
    @Published private(set) var lastTakeAudit:
        ProductionCaptureTakeAuditResult?
    @Published private(set) var takeAuditError: String?
    @Published private(set) var editorWorkingSession:
        CaptureEditorWorkingSessionReceipt?
    @Published private(set) var isPersistingEditorSession = false
    @Published private(set) var editorSessionError: String?
    @Published private(set) var agentCommandStatus = "idle"
    @Published private(set) var isImportingCanonicalTranscript = false
    @Published private(set) var transcriptImportMessage =
        "Completed Nest transcripts can become the active Studio transcript spine."
    @Published private(set) var transcriptImportError: String?

    let captureRoot = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Movies/QuipslyCaptures", isDirectory: true)

    private let recorder = ProductionAudioRecorder()
    let videoRecorder = ProductionVideoReferenceRecorder()
    private let captureClockClient =
        ProductionCaptureClockClient(clientKind: "macos")
    private let roomReceiptOutbox = MacCaptureRoomReceiptOutbox()
    private let uploadJobStore = MacCaptureUploadJobStore()
    private lazy var canonicalUploader = MacCanonicalCaptureUploader(
        jobStore: uploadJobStore
    )
    private let projectStore: ProjectStore
    private let playbackEngine: PlaybackEngine
    let nativeAccountStore: QuipslyNativeAccountStore
    private var elapsedTask: Task<Void, Never>?
    private var activeRoomCapture: ActiveRoomCapture?
    private var didAttemptLaunchReceiptRecovery = false
    private var didAttemptLaunchUploadRecovery = false

    private struct ActiveRoomCapture {
        let ownerAccountID: String
        let captureID: UUID
        let sessionID: String
        let callRoomID: String
        let recordingConsentID: String
        let projectSlug: String?
        let episodeSlug: String?
        let capturePurpose: String?
        let startReceipt: MacCaptureRoomReceipt
    }

    init(
        projectStore: ProjectStore,
        playbackEngine: PlaybackEngine,
        nativeAccountStore: QuipslyNativeAccountStore
    ) {
        self.projectStore = projectStore
        self.playbackEngine = playbackEngine
        self.nativeAccountStore = nativeAccountStore
        recorder.onRouteContinuityLost = {
            [weak self] receipt in
            await self?.stopRecording(
                audioInterruption: receipt
            )
        }
        if !roomReceiptOutbox.isWritable {
            roomReceiptError =
                roomReceiptOutbox.persistenceError
                    ?? "The Nest receipt outbox is locked read-only."
        }
        if !uploadJobStore.isWritable {
            uploadError =
                uploadJobStore.persistenceError
                    ?? "The canonical upload outbox is locked read-only."
        }
    }

    func publishAgentAcceptanceState() {
        let selectedInputState: [String: Any]
        if let selectedAudioInput {
            selectedInputState = [
                "id": selectedAudioInput.id,
                "name": selectedAudioInput.name,
                "manufacturer":
                    selectedAudioInput.manufacturer ?? "",
                "inputChannels":
                    selectedAudioInput.inputChannels,
                "outputChannels":
                    selectedAudioInput.outputChannels,
                "sampleRate":
                    selectedAudioInput.nominalSampleRate ?? 0,
                "isDefaultInput":
                    selectedAudioInput.isDefaultInput,
                "isDefaultOutput":
                    selectedAudioInput.isDefaultOutput,
            ]
        } else {
            selectedInputState = [:]
        }

        let selectedOutputState: [String: Any]
        if let selectedAudioOutput {
            selectedOutputState = [
                "id": selectedAudioOutput.id,
                "name": selectedAudioOutput.name,
                "manufacturer":
                    selectedAudioOutput.manufacturer ?? "",
                "inputChannels":
                    selectedAudioOutput.inputChannels,
                "outputChannels":
                    selectedAudioOutput.outputChannels,
                "sampleRate":
                    selectedAudioOutput.nominalSampleRate ?? 0,
                "isDefaultInput":
                    selectedAudioOutput.isDefaultInput,
                "isDefaultOutput":
                    selectedAudioOutput.isDefaultOutput,
            ]
        } else {
            selectedOutputState = [:]
        }

        let selectedVideoState: [String: Any]
        if let selectedVideoDevice {
            selectedVideoState = [
                "id": selectedVideoDevice.id,
                "name": selectedVideoDevice.name,
            ]
        } else {
            selectedVideoState = [:]
        }

        let availableInputs: [[String: Any]] =
            inventory?.audioDevices.filter(\.hasInput).map {
                [
                    "id": $0.id,
                    "name": $0.name,
                    "manufacturer":
                        ($0.manufacturer ?? "") as Any,
                    "inputChannels": $0.inputChannels,
                    "outputChannels": $0.outputChannels,
                    "sampleRate":
                        $0.nominalSampleRate ?? 0,
                    "isDefaultInput": $0.isDefaultInput,
                    "isDefaultOutput": $0.isDefaultOutput,
                ]
            } ?? []
        let availableOutputs: [[String: Any]] =
            inventory?.audioDevices.filter(\.hasOutput).map {
                [
                    "id": $0.id,
                    "name": $0.name,
                    "manufacturer":
                        ($0.manufacturer ?? "") as Any,
                    "inputChannels": $0.inputChannels,
                    "outputChannels": $0.outputChannels,
                    "sampleRate":
                        $0.nominalSampleRate ?? 0,
                    "isDefaultInput": $0.isDefaultInput,
                    "isDefaultOutput": $0.isDefaultOutput,
                ]
            } ?? []
        let availableVideoDevices: [[String: Any]] =
            inventory?.videoDevices.map {
                [
                    "id": $0.id,
                    "name": $0.name,
                ]
            } ?? []

        let lastAudioState: [String: Any]
        if let lastFinalizedReceipt {
            lastAudioState = [
                "state": lastFinalizedReceipt.state.rawValue,
                "path": lastFinalizedReceipt.audioPath,
                "durationSeconds":
                    lastFinalizedReceipt.durationSeconds,
                "targetSampleRate":
                    lastFinalizedReceipt.targetSampleRate,
                "targetBitDepth":
                    lastFinalizedReceipt.targetBitDepth,
                "channelCount":
                    lastFinalizedReceipt.channelCount,
                "frameCount":
                    lastFinalizedReceipt.frameCount,
                "byteCount":
                    lastFinalizedReceipt.byteCount ?? 0,
                "sha256":
                    lastFinalizedReceipt.sha256 ?? "",
                "routeContinuity":
                    lastFinalizedReceipt
                        .routeContinuity?
                        .status.rawValue ?? "legacy-unproved",
                "inputDevice": [
                    "id":
                        lastFinalizedReceipt.inputDevice.id,
                    "name":
                        lastFinalizedReceipt.inputDevice.name,
                    "inputChannels":
                        lastFinalizedReceipt.inputDevice
                            .inputChannels,
                    "outputChannels":
                        lastFinalizedReceipt.inputDevice
                            .outputChannels,
                ],
            ]
        } else {
            lastAudioState = [:]
        }

        let activeAudioState: [String: Any]
        if let activeReceipt {
            let liveStatus = recorder.liveStatus
            activeAudioState = [
                "state": activeReceipt.state.rawValue,
                "path":
                    activeReceipt.partialAudioPath
                        ?? activeReceipt.audioPath,
                "durationSeconds":
                    liveStatus?.durationSeconds
                        ?? activeReceipt.durationSeconds,
                "byteCount":
                    liveStatus?.byteCount
                        ?? activeReceipt.byteCount
                        ?? 0,
                "frameCount":
                    liveStatus?.frameCount
                        ?? activeReceipt.frameCount,
                "targetSampleRate":
                    activeReceipt.targetSampleRate,
                "targetBitDepth":
                    activeReceipt.targetBitDepth,
                "channelCount":
                    activeReceipt.channelCount,
                "sha256":
                    activeReceipt.sha256 ?? "",
                "failure": activeReceipt.failure ?? "",
                "routeContinuity":
                    liveStatus?.routeContinuity
                        .status.rawValue
                        ?? activeReceipt.routeContinuity?
                        .status.rawValue
                        ?? "legacy-unproved",
                "routeContinuityReason":
                    liveStatus?.routeContinuity
                        .reason.rawValue
                        ?? activeReceipt.routeContinuity?
                        .reason.rawValue
                        ?? "",
                "expectedInputUID":
                    liveStatus?.routeContinuity
                        .expectedInputUID
                        ?? activeReceipt.routeContinuity?
                        .expectedInputUID
                        ?? activeReceipt.inputDevice.id,
                "observedInputUID":
                    liveStatus?.routeContinuity
                        .observedInputUID
                        ?? activeReceipt.routeContinuity?
                        .observedInputUID ?? "",
            ]
        } else {
            activeAudioState = [:]
        }

        let lastVideoState: [String: Any]
        if let lastFinalizedVideoReceipt {
            let recordedFormat: [String: Any]
            if let value =
                lastFinalizedVideoReceipt.recordedFormat {
                recordedFormat = [
                    "width": value.width,
                    "height": value.height,
                    "nominalFrameRate":
                        value.nominalFrameRate,
                    "codec": value.codec,
                ]
            } else {
                recordedFormat = [:]
            }
            lastVideoState = [
                "state":
                    lastFinalizedVideoReceipt.state.rawValue,
                "path": lastFinalizedVideoReceipt.videoPath,
                "durationSeconds":
                    lastFinalizedVideoReceipt.durationSeconds,
                "byteCount":
                    lastFinalizedVideoReceipt.byteCount ?? 0,
                "sha256":
                    lastFinalizedVideoReceipt.sha256 ?? "",
                "liveSignalVerified":
                    lastFinalizedVideoReceipt
                        .signalVerification != nil,
                "liveSignalVerificationMethod":
                    lastFinalizedVideoReceipt
                        .signalVerification?
                        .method.rawValue ?? "",
                "negotiatedFormat": [
                    "width":
                        lastFinalizedVideoReceipt
                            .negotiatedFormat.width,
                    "height":
                        lastFinalizedVideoReceipt
                            .negotiatedFormat.height,
                    "maximumFrameRate":
                        lastFinalizedVideoReceipt
                            .negotiatedFormat
                            .maximumFrameRate,
                    "mediaSubType":
                        lastFinalizedVideoReceipt
                            .negotiatedFormat.mediaSubType,
                ],
                "recordedFormat": recordedFormat,
            ]
        } else {
            lastVideoState = [:]
        }

        let lastTakeAuditState: [String: Any]
        if let lastTakeAudit {
            lastTakeAuditState = [
                "sourceMode": lastTakeAudit.sourceMode,
                "disposition":
                    lastTakeAudit.disposition.rawValue,
                "receiptPath": lastTakeAudit.receiptPath,
                "holdCount": lastTakeAudit.holdCount,
                "warningCount": lastTakeAudit.warningCount,
                "checks": lastTakeAudit.checks.map {
                    [
                        "id": $0.id,
                        "status": $0.status.rawValue,
                        "summary": $0.summary,
                    ]
                },
            ]
        } else {
            lastTakeAuditState = [:]
        }

        let cameraSignalVerificationState: [String: Any]
        if let verification = cameraSignalVerification {
            cameraSignalVerificationState = [
                "deviceID": verification.deviceID,
                "method": verification.method.rawValue,
                "verifiedAt": verification.verifiedAt.ISO8601Format(),
                "truth": verification.truth,
            ]
        } else {
            cameraSignalVerificationState = [:]
        }

        let editorSessionState: [String: Any]
        if let editorWorkingSession {
            editorSessionState = [
                "name": editorWorkingSession.name,
                "path": editorWorkingSession.url.path,
                "projectID":
                    editorWorkingSession.projectID
                    .uuidString.lowercased(),
                "sequenceID":
                    editorWorkingSession.sequenceID
                    .uuidString.lowercased(),
                "captureGroupID":
                    editorWorkingSession.captureGroupID
                    .uuidString.lowercased(),
                "captureLaneIDs":
                    editorWorkingSession.captureLaneIDs.map {
                        $0.uuidString.lowercased()
                    },
                "captureLaneCount":
                    editorWorkingSession.captureLaneIDs.count,
                "verifiedAt":
                    editorWorkingSession.verifiedAt
                    .ISO8601Format(),
                "truth": editorWorkingSession.truth,
                "durableAndReloadVerified": true,
            ]
        } else {
            editorSessionState = [:]
        }

        let captureState: [String: Any] = [
            "episodeSpaceID": episodeSpaceID,
            "participantID": participantID,
            "captureGroupID":
                captureGroupID.uuidString.lowercased(),
            "captureGroupIsClosed": captureGroupIsClosed,
            "isLocalOnly": isLocalOnlyCapture,
            "includeCameraReference": includeCameraReference,
            "canStartRecording": canStartRecording,
            "isRecording": isRecording,
            "isFinalizing": isFinalizing,
            "elapsedSeconds": elapsedSeconds,
            "message": message,
            "recordingError": recordingError ?? "",
            "cameraPreviewMessage": cameraPreviewMessage,
            "cameraPreviewError": cameraPreviewError ?? "",
            "cameraPreviewReady":
                cameraPreviewFormat != nil
                    && videoRecorder.preparedDeviceID
                        == selectedVideoDeviceID,
            "cameraSignalVerification":
                cameraSignalVerificationState,
            "cameraSignalVerified":
                cameraSignalVerificationIsFresh,
            "cameraAuthorization":
                inventory?.cameraAuthorization.rawValue
                    ?? "unknown",
            "microphoneAuthorization":
                inventory?.microphoneAuthorization.rawValue
                    ?? "unknown",
            "selectedInput": selectedInputState,
            "selectedOutput": selectedOutputState,
            "selectedVideo": selectedVideoState,
            "availableInputs": availableInputs,
            "availableOutputs": availableOutputs,
            "availableVideoDevices": availableVideoDevices,
            "activeAudio": activeAudioState,
            "lastAudio": lastAudioState,
            "lastVideo": lastVideoState,
            "lastTakeAudit": lastTakeAuditState,
            "editorWorkingSession": editorSessionState,
            "isPersistingEditorSession":
                isPersistingEditorSession,
            "editorSessionError":
                editorSessionError ?? "",
        ]
        let status: [String: Any] = [
            "projectTitle": "Episode Capture Setup",
            "launchStage":
                inventory == nil
                    ? "capture_inventory_loading"
                    : "capture_setup_ready",
            "windowVisible": true,
            "captureAcceptanceMode": "local-only",
            "captureExternalSideEffectsAllowed": false,
            "captureAgentCommandStatus": agentCommandStatus,
            "capture": captureState,
            "agentAccessibilityModel":
                "semantic_local_capture_commands_with_state_echo",
            "agentInterfaceModel":
                "observe_exact_routes_prepare_local_start_stop_audit_reobserve",
            "agentCapabilityParity": [
                "read exact camera, microphone, and output routes",
                "prepare a local-only capture without joining a room",
                "keep negotiated camera format separate from explicit live-image verification",
                "start only when exact selected device IDs are reconfirmed",
                "stop and finalize every active local source",
                "run deterministic byte and media acceptance",
                "save and re-open the exact capture-backed editor session before claiming durable handoff",
                "open the same in-memory project in the normal Studio workspace",
            ],
            "agentCurrentSafeActions": [
                "GET /capture_status",
                "GET /capture_refresh_hardware",
                "GET /capture_prepare_local",
                "GET /capture_start_local",
                "GET /capture_stop_local",
                "GET /capture_audit_local",
                "GET /capture_open_editor",
            ],
            "captureAgentBoundary":
                "This launch-only acceptance surface can write local media. It cannot request privacy permission, join a provider room, create a Nest START, upload, deliver, or publish.",
        ]
        AgentServer.shared.writeCaptureStatus(status)
    }

    func handleAgentAcceptanceCommand(_ request: AgentCommandRequest) {
        switch request.name {
        case "capture_refresh_hardware":
            agentCommandStatus = "refreshing-hardware"
            publishAgentAcceptanceState()
            Task {
                await refresh(requestAccess: false)
                agentCommandStatus = "hardware-refreshed"
                publishAgentAcceptanceState()
            }
        case "capture_prepare_local":
            guard !isRecording, !isFinalizing else {
                agentCommandStatus =
                    "prepare-rejected-active-recording"
                publishAgentAcceptanceState()
                return
            }
            let episode = request.values["episode_space_id"]?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            let participant = request.values["participant_id"]?
                .trimmingCharacters(in: .whitespacesAndNewlines)
            guard let episode, !episode.isEmpty,
                  let participant, !participant.isEmpty,
                  let inventory else {
                agentCommandStatus =
                    "prepare-rejected-missing-identity-or-inventory"
                publishAgentAcceptanceState()
                return
            }
            let inputID = request.values["input_device_id"] ?? ""
            let outputID = request.values["output_device_id"] ?? ""
            let videoID = request.values["video_device_id"] ?? ""
            guard inventory.audioDevices.contains(where: {
                $0.id == inputID && $0.hasInput
            }),
            inventory.audioDevices.contains(where: {
                $0.id == outputID && $0.hasOutput
            }) else {
                agentCommandStatus =
                    "prepare-rejected-exact-audio-route-not-found"
                publishAgentAcceptanceState()
                return
            }
            let includeCamera = ["1", "true", "yes"].contains(
                (request.values["include_camera"] ?? "false")
                    .lowercased()
            )
            let cameraSignalWasVisuallyVerified =
                ["1", "true", "yes"].contains(
                    (
                        request.values[
                            "camera_signal_verified"
                        ] ?? "false"
                    ).lowercased()
                )
            if includeCamera,
               !inventory.videoDevices.contains(where: {
                   $0.id == videoID
               }) {
                agentCommandStatus =
                    "prepare-rejected-exact-camera-route-not-found"
                publishAgentAcceptanceState()
                return
            }

            selectEpisodeRoom(nil)
            episodeSpaceID = episode
            participantID = participant
            cameraSignalVerification = nil
            selectedAudioInputID = inputID
            selectedAudioOutputID = outputID
            selectedVideoDeviceID =
                includeCamera ? videoID : nil
            includeCameraReference = includeCamera
            agentCommandStatus = "preparing-local-capture"
            publishAgentAcceptanceState()
            Task {
                await prepareSelectedCameraReference()
                if includeCamera,
                   cameraSignalWasVisuallyVerified {
                    confirmCameraSignal(
                        method: .agentVisualReview
                    )
                }
                agentCommandStatus =
                    cameraPreviewError != nil
                        ? "local-capture-camera-not-ready"
                        : includeCamera
                            && !cameraSignalVerificationIsFresh
                            ? "local-capture-camera-signal-unverified"
                            : "local-capture-prepared"
                publishAgentAcceptanceState()
            }
        case "capture_start_local":
            let expectedInput =
                request.values["input_device_id"] ?? ""
            let expectedVideo =
                request.values["video_device_id"] ?? ""
            guard isLocalOnlyCapture,
                  selectedEpisodeRoom == nil else {
                agentCommandStatus =
                    "start-rejected-not-local-only"
                publishAgentAcceptanceState()
                return
            }
            guard expectedInput == selectedAudioInputID,
                  !expectedInput.isEmpty else {
                agentCommandStatus =
                    "start-rejected-input-route-drift"
                publishAgentAcceptanceState()
                return
            }
            if includeCameraReference,
               expectedVideo != selectedVideoDeviceID {
                agentCommandStatus =
                    "start-rejected-camera-route-drift"
                publishAgentAcceptanceState()
                return
            }
            guard canStartRecording else {
                agentCommandStatus =
                    "start-rejected-preflight-not-ready"
                publishAgentAcceptanceState()
                return
            }
            agentCommandStatus = "starting-local-capture"
            publishAgentAcceptanceState()
            Task {
                await startRecording()
                agentCommandStatus =
                    isRecording
                        ? "local-capture-recording"
                        : "local-capture-start-failed"
                publishAgentAcceptanceState()
            }
        case "capture_stop_local":
            guard isRecording else {
                agentCommandStatus =
                    "stop-rejected-no-active-recording"
                publishAgentAcceptanceState()
                return
            }
            agentCommandStatus = "stopping-local-capture"
            publishAgentAcceptanceState()
            Task {
                await stopRecording()
                agentCommandStatus =
                    recordingError == nil
                        ? "local-capture-finalized"
                        : "local-capture-finalized-with-attention"
                publishAgentAcceptanceState()
            }
        case "capture_audit_local":
            guard canAuditLastFinalizedTake else {
                agentCommandStatus =
                    "audit-rejected-no-finalized-source"
                publishAgentAcceptanceState()
                return
            }
            agentCommandStatus = "auditing-local-capture"
            publishAgentAcceptanceState()
            Task {
                await auditLastFinalizedTake()
                switch lastTakeAudit?.disposition {
                case .held:
                    agentCommandStatus =
                        "local-capture-audited-held"
                case .machinePassHumanReviewRequired:
                    agentCommandStatus =
                        "local-capture-audited-human-review-required"
                case nil:
                    agentCommandStatus =
                        "local-capture-audit-failed"
                }
                publishAgentAcceptanceState()
            }
        case "capture_open_editor":
            guard editorWorkingSession != nil else {
                agentCommandStatus =
                    "open-editor-rejected-no-durable-session"
                publishAgentAcceptanceState()
                return
            }
            openCaptureInEditor()
            agentCommandStatus = "capture-editor-opened"
            publishAgentAcceptanceState()
        default:
            agentCommandStatus =
                "rejected-unsupported-capture-command"
            publishAgentAcceptanceState()
        }
    }

    var isRecording: Bool {
        recorder.isRecording || videoRecorder.isRecording
    }

    var canAuditLastFinalizedTake: Bool {
        guard !isRecording,
              !isFinalizing,
              !isImportingCanon,
              !isUploadingMaster,
              !isAuditingTake,
              let audio = lastFinalizedReceipt,
              audio.state == .finalized,
              audio.partialAudioPath == nil else {
            return false
        }
        guard let video = lastFinalizedVideoReceipt else {
            return true
        }
        return video.state == .finalized
            && video.partialVideoPath == nil
    }

    var canOpenCaptureInEditor: Bool {
        editorWorkingSession != nil
            && !isPersistingEditorSession
    }

    var selectedVideoDevice: CaptureVideoDeviceSnapshot? {
        inventory?.videoDevices.first {
            $0.id == selectedVideoDeviceID
        }
    }

    var selectedAudioInput: CaptureAudioDeviceSnapshot? {
        inventory?.audioDevices.first { $0.id == selectedAudioInputID }
    }

    var selectedAudioOutput: CaptureAudioDeviceSnapshot? {
        inventory?.audioDevices.first { $0.id == selectedAudioOutputID }
    }

    var selectedEpisodeRoom: MacEpisodeRoomSummary? {
        guard let selectedEpisodeRoomID else { return nil }
        return episodeRooms.first { $0.id == selectedEpisodeRoomID }
    }

    var cameraSignalVerificationIsFresh: Bool {
        guard let selectedVideoDeviceID,
              let cameraSignalVerification else {
            return false
        }
        return cameraSignalVerification.isValid(
            for: selectedVideoDeviceID,
            recordingStartedAt: Date()
        )
    }

    var canStartRecording: Bool {
        guard !isRecording,
              !isFinalizing,
              !isImportingCanon,
              !isRefreshingEpisodeRooms,
              !isUploadingMaster,
              !isAuditingTake,
              !captureGroupIsClosed,
              !episodeSpaceID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              !participantID.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
              inventory?.microphoneAuthorization == .authorized,
              let input = selectedAudioInput,
              input.hasInput,
              let sampleRate = input.nominalSampleRate else {
            return false
        }
        if !isLocalOnlyCapture {
            guard let selectedEpisodeRoom,
                  episodeRoomCatalogIsFresh,
                  selectedEpisodeRoom.safeToRecordLocally,
                  episodeRoomOwnerAccountID != nil,
                  selectedEpisodeRoom.recordingConsentId != nil,
                  roomReceiptOutbox.isWritable else {
                return false
            }
        } else if selectedEpisodeRoom != nil {
            return false
        }
        if includeCameraReference {
            guard inventory?.cameraAuthorization == .authorized,
                  selectedVideoDevice != nil,
                  cameraPreviewFormat != nil,
                  videoRecorder.preparedDeviceID
                    == selectedVideoDeviceID,
                  cameraPreviewError == nil,
                  cameraSignalVerificationIsFresh else {
                return false
            }
        }
        return abs(sampleRate - ProductionAudioRecorder.targetSampleRate) < 1
    }

    var lastFinalizedMasterIsRoomBound: Bool {
        guard let receipt = lastFinalizedReceipt,
              receipt.state == .finalized,
              receipt.callRoomID != nil,
              receipt.recordingConsentID != nil,
              receipt.startReceiptID != nil,
              normalizedOwnerAccountID(
                  receipt.ownerAccountID
              ) == normalizedOwnerAccountID(
                    episodeRoomOwnerAccountID
                ) else {
            return false
        }
        return true
    }

    var canUploadLastFinalizedMaster: Bool {
        guard !isUploadingMaster,
              uploadJobStore.isWritable,
              let receipt = lastFinalizedReceipt,
              lastFinalizedMasterIsRoomBound else {
            return false
        }
        return activeUploadJob?.phase != .verified
            || activeUploadJob?.id != receipt.recordingID
    }

    var audioUploadSystemImage: String {
        if activeUploadJob?.phase == .verified {
            return "checkmark.icloud.fill"
        }
        if !lastFinalizedMasterIsRoomBound {
            return "externaldrive.fill"
        }
        return uploadError == nil
            ? "icloud.and.arrow.up.fill"
            : "exclamationmark.icloud.fill"
    }

    var lastFinalizedVideoReferenceIsRoomBound: Bool {
        guard let receipt = lastFinalizedVideoReceipt,
              receipt.state == .finalized,
              receipt.callRoomID != nil,
              receipt.recordingConsentID != nil,
              receipt.startReceiptID != nil,
              normalizedOwnerAccountID(
                  receipt.ownerAccountID
              ) == normalizedOwnerAccountID(
                    episodeRoomOwnerAccountID
                ) else {
            return false
        }
        return true
    }

    var canUploadLastFinalizedVideoReference: Bool {
        guard !isUploadingMaster,
              uploadJobStore.isWritable,
              let receipt = lastFinalizedVideoReceipt,
              lastFinalizedVideoReferenceIsRoomBound else {
            return false
        }
        return activeVideoUploadJob?.phase != .verified
            || activeVideoUploadJob?.id
                != receipt.recordingID
    }

    var videoUploadSystemImage: String {
        if activeVideoUploadJob?.phase == .verified {
            return "checkmark.icloud.fill"
        }
        if !lastFinalizedVideoReferenceIsRoomBound {
            return "externaldrive.fill"
        }
        return videoUploadError == nil
            ? "icloud.and.arrow.up.fill"
            : "exclamationmark.icloud.fill"
    }

    func canUploadCanonOriginal(
        _ receipt: CanonCardImportReceipt
    ) -> Bool {
        guard !isUploadingMaster,
              uploadJobStore.isWritable,
              receipt.state == .finalized,
              receipt.byteIdentityVerified,
              let binding = receipt.roomBinding,
              normalizedOwnerAccountID(binding.ownerAccountID)
                == normalizedOwnerAccountID(
                    episodeRoomOwnerAccountID
                ) else {
            return false
        }
        return canonUploadJobs[receipt.importID]?.phase
            != .verified
    }

    func canonUploadSystemImage(
        for receipt: CanonCardImportReceipt
    ) -> String {
        if canonUploadJobs[receipt.importID]?.phase == .verified {
            return "checkmark.icloud.fill"
        }
        if receipt.roomBinding == nil {
            return "externaldrive.fill"
        }
        return canonUploadErrors[receipt.importID] == nil
            ? "icloud.and.arrow.up.fill"
            : "exclamationmark.icloud.fill"
    }

    var plan: ProductionCapturePlan? {
        guard let inventory else { return nil }
        return ProductionCapturePolicy.buildPlan(
            inventory: inventory,
            videoDeviceID: selectedVideoDeviceID,
            audioInputID: selectedAudioInputID,
            audioOutputID: selectedAudioOutputID
        )
    }

    func refresh(requestAccess: Bool = false) async {
        guard !isRefreshing else { return }
        isRefreshing = true
        cameraSignalVerification = nil
        message = requestAccess
            ? "Waiting for camera and microphone permission…"
            : "Reading exact Core Audio and camera routes…"
        let next = await ProductionCaptureInventoryProbe.snapshot(
            requestAccess: requestAccess
        )
        inventory = next
        resolveSelections(in: next)
        refreshInterruptedRecordings()
        isRefreshing = false
        await prepareSelectedCameraReference()
        message =
            "\(next.videoDevices.count) camera route(s) · \(next.audioDevices.count) Core Audio device(s)"
    }

    func prepareSelectedCameraReference() async {
        guard !isRecording, !isFinalizing else { return }
        guard let device = selectedVideoDevice else {
            videoRecorder.stopPreview()
            cameraSignalVerification = nil
            cameraPreviewFormat = nil
            cameraPreviewError = nil
            cameraPreviewMessage =
                "No camera reference selected. The Canon card master can still be imported after the take."
            return
        }
        cameraPreviewError = nil
        cameraPreviewMessage =
            "Preparing the exact \(device.name) route off the UI thread…"
        do {
            let format = try await videoRecorder.preparePreview(
                deviceID: device.id
            )
            cameraPreviewFormat = format
            if cameraSignalVerificationIsFresh {
                cameraPreviewMessage =
                    "\(device.name) negotiated \(format.label), and its moving live image was explicitly confirmed. Final media still requires visual review."
            } else {
                cameraPreviewMessage =
                    "\(device.name) negotiated \(format.label). Inspect the preview and explicitly confirm a moving live image; format negotiation alone cannot reject a disconnected slate."
            }
        } catch {
            cameraSignalVerification = nil
            cameraPreviewFormat = nil
            cameraPreviewError = error.localizedDescription
            cameraPreviewMessage =
                "The selected camera route is not ready."
        }
    }

    func selectedCameraDidChange() async {
        if cameraSignalVerification?.deviceID
            != selectedVideoDeviceID {
            cameraSignalVerification = nil
        }
        await prepareSelectedCameraReference()
    }

    func confirmCameraSignal(
        method: ProductionVideoSignalVerificationMethod =
            .operatorLivePreview
    ) {
        guard !isRecording,
              !isFinalizing,
              cameraPreviewError == nil,
              cameraPreviewFormat != nil,
              videoRecorder.preparedDeviceID
                == selectedVideoDeviceID,
              let selectedVideoDeviceID else {
            return
        }
        cameraSignalVerification =
            ProductionVideoSignalVerification(
                deviceID: selectedVideoDeviceID,
                method: method
            )
        cameraPreviewMessage =
            "Moving live image confirmed for the exact selected route. This fresh preflight proof will be written into the camera receipt; the finalized movie still requires start-to-stop review."
    }

    func stopCameraPreview() {
        videoRecorder.stopPreview()
    }

    func refreshEpisodeRooms() async {
        guard !isRefreshingEpisodeRooms else { return }
        guard nativeAccountStore.hasSavedSession else {
            episodeRoomCatalogIsFresh = false
            episodeRoomError = nil
            episodeRoomMessage =
                "Connect the native account in Workspace, then refresh Episode Rooms."
            return
        }
        guard let baseURL = nativeAccountStore.normalizedBaseURL else {
            episodeRoomCatalogIsFresh = false
            episodeRoomError = "The configured Nest base URL is not valid."
            return
        }

        isRefreshingEpisodeRooms = true
        episodeRoomCatalogIsFresh = false
        episodeRoomError = nil
        episodeRoomMessage = "Loading authorized Episode Rooms from Nest…"
        defer { isRefreshingEpisodeRooms = false }

        do {
            let request = URLRequest(
                url: baseURL.appending(
                    path: "/api/mobile/capture/sessions"
                )
            )
            let (data, response) =
                try await nativeAccountStore.authenticatedData(
                    for: request
                )
            let catalog = try JSONDecoder().decode(
                MacEpisodeRoomCatalogResponse.self,
                from: data
            )
            guard (200 ..< 300).contains(response.statusCode),
                  catalog.ok else {
                throw NSError(
                    domain: "QuipslyEpisodeRoomCatalog",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            catalog.error
                                ?? "Nest could not load authorized Episode Rooms.",
                    ]
                )
            }
            guard let serverOwner = normalizedOwnerAccountID(
                catalog.user?.email
            ) else {
                throw NSError(
                    domain: "QuipslyEpisodeRoomCatalog",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "Nest did not return the verified account identity required for durable recording receipts.",
                    ]
                )
            }

            episodeRooms = catalog.sessions ?? []
            episodeRoomOwnerAccountID = serverOwner
            updatePendingRoomReceiptCount(
                ownerAccountID: serverOwner
            )
            episodeRoomCatalogIsFresh = true
            if !isLocalOnlyCapture {
                let preferredID =
                    MacEpisodeRoomSelectionPolicy.refreshedRoomID(
                        rooms: episodeRooms,
                        previousID: selectedEpisodeRoomID
                    )
                applyEpisodeRoomSelection(
                    preferredID,
                    beginNewGroup:
                        preferredID != selectedEpisodeRoomID
                )
            }
            episodeRoomMessage = episodeRooms.isEmpty
                ? "No authorized capture sessions are available. Create one in Nest or use Local-only / solo source."
                : selectedEpisodeRoom.map {
                    "\(episodeRooms.count) authorized session(s) loaded · \($0.title) selected · \($0.readinessLabel)."
                } ?? "\(episodeRooms.count) authorized session(s) loaded from Nest."
            if !didAttemptLaunchReceiptRecovery, !isRecording {
                await recoverRoomReceiptsAfterLaunch()
            }
        } catch {
            episodeRoomCatalogIsFresh = false
            episodeRoomOwnerAccountID = nil
            episodeRoomError = error.localizedDescription
            episodeRoomMessage =
                "Episode Room refresh needs attention. Existing local sources were not changed."
        }
    }

    func importCanonicalTranscript(
        _ source: MacEpisodeRoomCaptureSource,
        room: MacEpisodeRoomSummary
    ) async {
        guard !isImportingCanonicalTranscript else { return }
        guard let transcript = source.transcript,
              transcript.status?.uppercased() == "COMPLETED",
              let handoffPath = transcript.handoffUrl,
              !handoffPath.isEmpty else {
            transcriptImportError =
                "This capture source has no completed canonical transcript handoff."
            return
        }
        guard nativeAccountStore.hasSavedSession,
              let baseURL = nativeAccountStore.normalizedBaseURL,
              let handoffURL = URL(
                string: handoffPath,
                relativeTo: baseURL
              )?.absoluteURL else {
            transcriptImportError =
                "Connect the native account before importing a Nest transcript."
            return
        }

        isImportingCanonicalTranscript = true
        transcriptImportError = nil
        transcriptImportMessage =
            "Loading the exact Nest transcript version and word anchors…"
        defer { isImportingCanonicalTranscript = false }

        do {
            let request = URLRequest(url: handoffURL)
            let (data, response) =
                try await nativeAccountStore.authenticatedData(
                    for: request
                )
            let handoff = try JSONDecoder().decode(
                MacCanonicalTranscriptHandoffResponse.self,
                from: data
            )
            guard (200 ..< 300).contains(response.statusCode),
                  handoff.ok,
                  handoff.schema
                    == "quipsly-canonical-transcript-handoff-v1",
                  let transcriptJobID = handoff.transcriptJobId,
                  transcriptJobID == transcript.id,
                  handoff.source?.recordingAssetId
                    == source.recordingAssetId,
                  handoff.source?.immutableProviderWords
                    == true,
                  handoff.source?.reviewedCorrectionsAreOverlays
                    == true,
                  let remoteSegments = handoff.segments,
                  !remoteSegments.isEmpty,
                  remoteSegments.allSatisfy({ segment in
                      !segment.id.isEmpty
                          && ((segment.acceptedCorrectionId == nil
                                  && segment.reviewStatus == "provider")
                              || (segment.acceptedCorrectionId?.isEmpty == false
                                  && segment.reviewStatus == "human-reviewed"))
                          && segment.startTime.isFinite
                          && segment.endTime.isFinite
                          && segment.startTime >= 0
                          && segment.endTime >= segment.startTime
                          && !segment.words.isEmpty
                          && segment.words.allSatisfy { word in
                              !word.id.isEmpty
                                  && word.startTime.isFinite
                                  && word.endTime.isFinite
                                  && word.startTime >= segment.startTime
                                  && word.endTime <= segment.endTime
                                  && word.endTime >= word.startTime
                          }
                  }),
                  remoteSegments.flatMap(\.words)
                    .map(\.providerWordIndex)
                    == Array(
                        0 ..< remoteSegments
                            .flatMap(\.words).count
                    ) else {
                throw NSError(
                    domain: "QuipslyCanonicalTranscript",
                    code: response.statusCode,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            handoff.error
                                ?? "Nest returned an incomplete canonical transcript handoff.",
                    ]
                )
            }
            let segments = remoteSegments.map { segment in
                TranscriptSegment(
                    sourceExternalID: segment.id,
                    sourceTranscriptJobID: transcriptJobID,
                    speaker:
                        segment.speaker
                        ?? segment.providerSpeaker
                        ?? "Speaker",
                    startTime: segment.startTime,
                    endTime: segment.endTime,
                    text: segment.text,
                    providerText: segment.providerText,
                    providerSpeaker: segment.providerSpeaker,
                    acceptedCorrectionExternalID:
                        segment.acceptedCorrectionId,
                    words: segment.words.map { word in
                        TranscriptWordTiming(
                            sourceExternalID: word.id,
                            providerWordIndex:
                                word.providerWordIndex,
                            word: word.word,
                            rawWord: word.rawWord,
                            startTime: word.startTime,
                            endTime: word.endTime,
                            confidence: word.confidence,
                            speaker: word.speaker,
                            channel: word.channel,
                            source: word.source
                        )
                    },
                    confidence: segment.confidence,
                    reviewStatus: segment.reviewStatus
                )
            }
            let priorSequence = projectStore.activeSequence
            let priorSegmentsByExternalID =
                (priorSequence?.transcriptSegments ?? []).reduce(
                    into: [String: TranscriptSegment]()
                ) { result, segment in
                    guard let externalID = segment.sourceExternalID,
                          result[externalID] == nil else {
                        return
                    }
                    result[externalID] = segment
                }
            let priorJobID = priorSequence?.transcriptJobs.first {
                $0.sourceExternalID == transcriptJobID
            }?.id
            let priorReceiptCount = priorSequence?
                .editActionLedger.filter {
                    $0.category == "transcript-handoff"
                        && $0.endpoint
                            == "nest-canonical-transcript"
                        && $0.afterJson.contains(transcriptJobID)
                }.count ?? 0
            let replay = try projectStore
                .applyCanonicalTranscriptHandoff(
                    transcriptJobID: transcriptJobID,
                    provider: transcript.provider ?? "deepgram",
                    sourcePath: handoffURL.absoluteString,
                    segments: segments
                )
            let sessionName =
                "Nest Transcript \(room.canonicalEpisodeSpaceID)"
            let savedURL = try await projectStore.saveNativeSession(
                named: sessionName,
                intent: .explicitCheckpoint
            )
            let readback = try await projectStore.readNativeSession(
                named: sessionName
            )
            guard let importedSequence = readback.session.project
                .sequences.first(where: { sequence in
                    sequence.transcriptSegments.contains {
                        $0.sourceTranscriptJobID == transcriptJobID
                    }
                }) else {
                throw NSError(
                    domain: "QuipslyCanonicalTranscript",
                    code: 409,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "The saved Studio session did not contain the canonical transcript job.",
                    ]
                )
            }
            let imported = importedSequence.transcriptSegments
                .filter {
                    $0.sourceTranscriptJobID == transcriptJobID
                }
            let expectedSegmentIDs = Set(
                segments.compactMap(\.sourceExternalID)
            )
            let importedSegmentIDs = Set(
                imported.compactMap(\.sourceExternalID)
            )
            let expectedWordIDs = Set(
                segments.flatMap(\.words)
                    .compactMap(\.sourceExternalID)
            )
            let importedWordIDs = Set(
                imported.flatMap(\.words)
                    .compactMap(\.sourceExternalID)
            )
            let expectedCorrections = segments.reduce(
                into: [String: String]()
            ) { result, segment in
                guard let externalID = segment.sourceExternalID else {
                    return
                }
                result[externalID] =
                    segment.acceptedCorrectionExternalID ?? ""
            }
            let importedCorrections = imported.reduce(
                into: [String: String]()
            ) { result, segment in
                guard let externalID = segment.sourceExternalID else {
                    return
                }
                result[externalID] =
                    segment.acceptedCorrectionExternalID ?? ""
            }
            let importedJob = importedSequence.transcriptJobs.first {
                $0.sourceExternalID == transcriptJobID
            }
            let importedReceiptCount = importedSequence
                .editActionLedger.filter {
                    $0.category == "transcript-handoff"
                        && $0.endpoint
                            == "nest-canonical-transcript"
                        && $0.afterJson.contains(transcriptJobID)
                }.count
            let stableSegmentIDs = priorSegmentsByExternalID
                .allSatisfy { externalID, priorSegment in
                    guard let refreshed = imported.first(where: {
                        $0.sourceExternalID == externalID
                    }), refreshed.id == priorSegment.id else {
                        return false
                    }
                    let priorWordsByExternalID = priorSegment.words
                        .reduce(
                            into: [String: TranscriptWordTiming]()
                        ) { result, word in
                            guard let wordID = word.sourceExternalID,
                                  result[wordID] == nil else {
                                return
                            }
                            result[wordID] = word
                        }
                    return priorWordsByExternalID.allSatisfy {
                        wordID,
                        priorWord in
                        refreshed.words.first {
                            $0.sourceExternalID == wordID
                        }?.id == priorWord.id
                    }
                }
            guard imported.count == segments.count,
                  imported.flatMap(\.words).count
                    == segments.flatMap(\.words).count,
                  importedSegmentIDs == expectedSegmentIDs,
                  importedWordIDs == expectedWordIDs,
                  importedCorrections == expectedCorrections,
                  importedJob != nil,
                  priorJobID == nil || importedJob?.id == priorJobID,
                  stableSegmentIDs,
                  importedReceiptCount
                    == priorReceiptCount + (replay ? 0 : 1) else {
                throw NSError(
                    domain: "QuipslyCanonicalTranscript",
                    code: 409,
                    userInfo: [
                        NSLocalizedDescriptionKey:
                            "The saved Studio session did not read back the complete canonical transcript.",
                    ]
                )
            }
            transcriptImportMessage = replay
                ? "Canonical transcript already matched Studio. Durable readback passed."
                : "Imported \(segments.count) segments and \(segments.flatMap(\.words).count) exact word anchors. Saved and read back \(savedURL.lastPathComponent)."
        } catch {
            transcriptImportError = error.localizedDescription
            transcriptImportMessage =
                "The existing Studio transcript and source media were left unchanged."
        }
    }

    func selectEpisodeRoom(_ roomID: String?) {
        guard !isRecording, !isFinalizing, !isImportingCanon else {
            return
        }
        let nextIsLocalOnly = roomID == nil
        let shouldBeginNewGroup =
            roomID != selectedEpisodeRoomID
                || nextIsLocalOnly != isLocalOnlyCapture
        isLocalOnlyCapture = nextIsLocalOnly
        applyEpisodeRoomSelection(
            roomID,
            beginNewGroup: shouldBeginNewGroup
        )
    }

    func startRecording() async {
        roomReceiptError = nil
        var verifiedCameraSignal:
            ProductionVideoSignalVerification?
        if includeCameraReference {
            guard selectedVideoDevice != nil else {
                recordingError =
                    "Choose the exact camera route or turn off Include camera reference."
                return
            }
            await prepareSelectedCameraReference()
            guard cameraPreviewError == nil,
                  cameraPreviewFormat != nil else {
                recordingError =
                    cameraPreviewError
                        ?? "The selected camera reference is not ready."
                return
            }
            guard cameraSignalVerificationIsFresh,
                  let cameraSignalVerification else {
                recordingError =
                    "Confirm a moving live image in the exact camera preview before recording. Format negotiation alone cannot reject a disconnected slate."
                return
            }
            verifiedCameraSignal = cameraSignalVerification
        }
        guard let input = selectedAudioInput else {
            recordingError =
                "Select the exact microphone/interface that will own this local master."
            return
        }
        var roomCapture: ActiveRoomCapture?
        var clockSamples: [ProductionCaptureClockSample] = []
        if !isLocalOnlyCapture {
            guard let intendedRoomID = selectedEpisodeRoomID else {
                recordingError =
                    "Choose an authorized Episode Room before recording."
                return
            }
            await refreshEpisodeRooms()
            guard selectedEpisodeRoomID == intendedRoomID,
                  episodeRoomCatalogIsFresh,
                  selectedEpisodeRoom?.safeToRecordLocally == true else {
                recordingError = selectedEpisodeRoom.map {
                    "\($0.readinessLabel): \($0.readinessDetail)"
                } ?? "That Episode Room is no longer authorized for this account. Choose it again after reviewing Nest."
                message = "Local master did not start."
                return
            }
            guard let room = selectedEpisodeRoom,
                  let ownerAccountID = episodeRoomOwnerAccountID,
                  let recordingConsentID = nonempty(
                    room.recordingConsentId
                  ) else {
                recordingError =
                    "Nest did not return the verified account and consent identity required to arm this take."
                message = "Local master did not start."
                return
            }
            do {
                let startReceipt = try roomReceiptOutbox
                    .enqueueStart(
                        ownerAccountID: ownerAccountID,
                        captureID: captureGroupID,
                        sessionID: room.id,
                        callRoomID: room.callRoomId
                    )
                updatePendingRoomReceiptCount(
                    ownerAccountID: ownerAccountID
                )
                roomReceiptMessage =
                    "START is durable locally. Waiting for Nest to apply it before opening the microphone master…"
                let delivery = await deliverRoomReceipt(
                    startReceipt
                )
                switch delivery {
                case .accepted(let stateApplied):
                    guard stateApplied else {
                        try roomReceiptOutbox.markAcknowledged(
                            startReceipt.id,
                            stateApplied: false
                        )
                        updatePendingRoomReceiptCount(
                            ownerAccountID: ownerAccountID
                        )
                        captureGroupID = UUID()
                        recordingError =
                            "Nest preserved START but did not apply it. Quipsly rotated to a new take identity; refresh the room before trying again."
                        roomReceiptMessage =
                            "START was not applied. No audio engine was opened."
                        message = "Local master did not start."
                        return
                    }
                    roomReceiptMessage =
                        "Nest applied START. Opening the local microphone master…"
                    roomCapture = ActiveRoomCapture(
                        ownerAccountID: ownerAccountID,
                        captureID: captureGroupID,
                        sessionID: room.id,
                        callRoomID: room.callRoomId,
                        recordingConsentID: recordingConsentID,
                        projectSlug: room.projectSlug,
                        episodeSlug: room.episodeSlug,
                        capturePurpose: room.purpose,
                        startReceipt: startReceipt
                    )
                case .terminallyRejected(
                    let message,
                    let errorCode
                ):
                    try roomReceiptOutbox.markRejectedByNest(
                        startReceipt.id,
                        errorCode: errorCode,
                        message: message
                    )
                    updatePendingRoomReceiptCount(
                        ownerAccountID: ownerAccountID
                    )
                    captureGroupID = UUID()
                    recordingError = message
                    roomReceiptMessage =
                        "Nest preserved and rejected START. No audio engine was opened; a new take identity is ready."
                    self.message = "Local master did not start."
                    return
                case .retryable(let detail):
                    recordingError =
                        "START is safe in the local outbox but Nest has not acknowledged it: \(detail)"
                    roomReceiptMessage =
                        "START is waiting in the durable outbox. No audio engine was opened."
                    message = "Local master did not start."
                    return
                }
            } catch {
                recordingError =
                    "Quipsly could not durably arm the Episode Room boundary: \(error.localizedDescription)"
                roomReceiptError = error.localizedDescription
                roomReceiptMessage =
                    "No audio engine was opened because START was not durably armed."
                message = "Local master did not start."
                return
            }
        }
        if let roomCapture {
            roomReceiptMessage =
                "Nest applied START. Measuring the Mac source clock before opening either media engine…"
            if let baseURL = nativeAccountStore.normalizedBaseURL {
                clockSamples = await captureClockClient
                    .measureBurst(
                        baseURL: baseURL,
                        callRoomID: roomCapture.callRoomID,
                        captureGroupID: captureGroupID,
                        authenticatedData: {
                            [nativeAccountStore] request in
                            try await nativeAccountStore
                                .authenticatedData(for: request)
                        }
                    )
            }
            let expectedOwner = normalizedOwnerAccountID(
                roomCapture.ownerAccountID
            )
            let currentVerifiedOwner =
                normalizedOwnerAccountID(
                    nativeAccountStore.userEmail
                )
            let accountStillMatches =
                nativeAccountStore.hasSavedSession
                    && expectedOwner != nil
                    && normalizedOwnerAccountID(
                        episodeRoomOwnerAccountID
                    ) == expectedOwner
                    && (
                        currentVerifiedOwner == nil
                            || currentVerifiedOwner
                                == expectedOwner
                    )
            guard accountStillMatches else {
                let boundaryError =
                    await closeRoomBoundaryAfterLocalStop(
                        roomCapture,
                        localSourceWasOpened: false
                    )
                captureGroupID = UUID()
                captureGroupIsClosed = false
                recordingError = [
                    "The Quipsly account changed during source-clock measurement. No media engine was opened.",
                    boundaryError.map {
                        "Nest STOP needs attention: \($0)"
                    },
                ]
                .compactMap { $0 }
                .joined(separator: " ")
                message = "Local master did not start."
                return
            }
            roomReceiptMessage = clockSamples.isEmpty
                ? "Nest START is applied. Clock evidence was unavailable, so this source will require waveform alignment review."
                : "Nest START is applied · \(clockSamples.count) Mac clock sample(s) preserved for reviewed alignment."
        }
        recordingError = nil
        if includeCameraReference {
            guard let selectedVideoDeviceID,
                  let verifiedCameraSignal,
                  verifiedCameraSignal.isValid(
                    for: selectedVideoDeviceID,
                    recordingStartedAt: Date()
                  ) else {
                recordingError =
                    "The live-image confirmation expired or the exact camera route changed while Quipsly prepared the take. Confirm the preview again."
                return
            }
        }
        let recordingID = UUID()
        let videoRecordingID = UUID()
        do {
            if includeCameraReference,
               let videoDevice = selectedVideoDevice {
                let videoReceipt = try await videoRecorder.start(
                    configuration:
                        ProductionVideoReferenceConfiguration(
                            recordingID: videoRecordingID,
                            captureGroupID: captureGroupID,
                            episodeSpaceID:
                                episodeSpaceID.trimmingCharacters(
                                    in: .whitespacesAndNewlines
                                ),
                            participantID:
                                participantID.trimmingCharacters(
                                    in: .whitespacesAndNewlines
                                ),
                            ownerAccountID:
                                roomCapture?.ownerAccountID,
                            callRoomID: roomCapture?.callRoomID,
                            recordingConsentID:
                                roomCapture?.recordingConsentID,
                            startReceiptID:
                                roomCapture?.startReceipt.id,
                            projectSlug:
                                roomCapture?.projectSlug,
                            episodeSlug:
                                roomCapture?.episodeSlug,
                            capturePurpose:
                                roomCapture?.capturePurpose,
                            clockSamples: clockSamples,
                            videoDevice: videoDevice,
                            signalVerification:
                                verifiedCameraSignal,
                            rootDirectory: captureRoot
                        )
                )
                activeVideoReceipt = videoReceipt
            }
            let receipt = try recorder.start(
                configuration: ProductionAudioRecordingConfiguration(
                    recordingID: recordingID,
                    captureGroupID: captureGroupID,
                    episodeSpaceID: episodeSpaceID.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ),
                    participantID: participantID.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ),
                    ownerAccountID:
                        roomCapture?.ownerAccountID,
                    callRoomID: roomCapture?.callRoomID,
                    recordingConsentID:
                        roomCapture?.recordingConsentID,
                    startReceiptID: roomCapture?.startReceipt.id,
                    projectSlug: roomCapture?.projectSlug,
                    episodeSlug: roomCapture?.episodeSlug,
                    capturePurpose: roomCapture?.capturePurpose,
                    clockSamples: clockSamples,
                    inputDevice: input,
                    rootDirectory: captureRoot
                )
            )
            activeRoomCapture = roomCapture
            activeReceipt = receipt
            activeAudioLiveStatus =
                recorder.liveStatus
            elapsedSeconds = 0
            message = includeCameraReference
                ? "Writing the untouched microphone master and silent camera reference…"
                : "Writing an untouched local microphone master from \(input.name)…"
            roomReceiptMessage = roomCapture == nil
                ? "Local-only source: no Nest recording boundary was inferred."
                : "Nest START is applied · capture group \(captureGroupID.uuidString.lowercased()) is recording."
            startElapsedClock(startedAt: receipt.startedAt)
        } catch {
            let startFailure = error.localizedDescription
            if videoRecorder.isRecording {
                do {
                    let videoReceipt =
                        try await videoRecorder.stop()
                    activeVideoReceipt = videoReceipt
                    if videoReceipt.state == .finalized {
                        lastFinalizedVideoReceipt =
                            videoReceipt
                    }
                } catch {
                    activeVideoReceipt =
                        videoRecorder.activeReceipt
                }
            }
            if activeVideoReceipt != nil {
                captureGroupIsClosed = true
            }
            if let roomCapture {
                let closureError =
                    await closeRoomBoundaryAfterLocalStop(
                        roomCapture
                    )
                captureGroupIsClosed = true
                if let closureError {
                    roomReceiptError = closureError
                }
            }
            if let videoReceipt =
                lastFinalizedVideoReceipt {
                do {
                    let videoLaneID =
                        try attachVideoReferenceToEditor(
                            videoReceipt,
                            timelineOffsetSeconds: 0,
                            alignmentStatus:
                                "needs-alignment"
                        )
                    attachedLaneIDs.append(videoLaneID)
                    let editorSessionIsDurable =
                        await persistCaptureEditorSession()
                    recordingError =
                        "The microphone master did not start: \(startFailure)"
                    if editorSessionIsDurable {
                        message =
                            "The silent camera reference is finalized, byte-verified, and saved in a reload-verified Studio session; the microphone master did not start."
                    } else {
                        recordingError = [
                            recordingError,
                            editorSessionError.map {
                                "Durable editor recovery failed: \($0)"
                            },
                        ]
                        .compactMap { $0 }
                        .joined(separator: " ")
                        message =
                            "The silent camera reference is safe and attached in this process, but durable editor recovery needs retry; the microphone master did not start."
                    }
                } catch {
                    recordingError =
                        "The microphone master did not start: \(startFailure) The camera reference is finalized and safe, but its editor attachment needs retry: \(error.localizedDescription)"
                    message =
                        "The camera reference is safe; microphone start and editor attachment need attention."
                }
            } else {
                recordingError = startFailure
                message = activeVideoReceipt == nil
                    ? "Local master did not start."
                    : "The camera reference is preserved; microphone start failed and recovery review is required."
            }
            refreshInterruptedRecordings()
        }
    }

    func stopRecording(
        audioInterruption:
            ProductionAudioRecordingReceipt? = nil
    ) async {
        guard (isRecording || audioInterruption != nil),
              !isFinalizing else {
            return
        }
        let roomCapture = activeRoomCapture
        var resolvedAudioInterruption =
            audioInterruption
        elapsedTask?.cancel()
        elapsedTask = nil
        activeAudioLiveStatus = nil
        isFinalizing = true
        activeReceipt = resolvedAudioInterruption
            ?? activeReceipt
        recordingError =
            resolvedAudioInterruption?.failure
        message = resolvedAudioInterruption == nil
            ? "Stopping every local source, then hashing finalized media off the UI thread…"
            : "The exact microphone route was lost. Preserving its partial WAV and stopping every paired source…"
        defer { isFinalizing = false }

        let videoStopTask:
            Task<ProductionVideoReferenceReceipt, Error>? =
                videoRecorder.isRecording
                    ? Task { @MainActor in
                        try await videoRecorder.stop()
                    }
                    : nil

        var finalizedAudioReceipt:
            ProductionAudioRecordingReceipt?
        if recorder.isRecording {
            do {
                let receipt = try await recorder.stop()
                activeReceipt = receipt
                lastFinalizedReceipt = receipt
                finalizedAudioReceipt = receipt
                activeUploadJob =
                    receipt.ownerAccountID.flatMap {
                        uploadJobStore.job(
                            id: receipt.recordingID,
                            ownerAccountID: $0
                        )
                    }
                uploadProgress =
                    activeUploadJob?.phase == .verified ? 1 : 0
                uploadError = nil
                uploadMessage =
                    receipt.ownerAccountID == nil
                    ? "Finalized local-only microphone master will remain on this Mac; Quipsly will not infer Episode Room authority later."
                    : "Finalized microphone master is ready for direct private-vault upload. The local WAV will be retained."
                elapsedSeconds = receipt.durationSeconds
            } catch {
                activeReceipt = recorder.activeReceipt
                if recorder.activeReceipt?.state
                    == .interrupted {
                    resolvedAudioInterruption =
                        recorder.activeReceipt
                }
                recordingError = error.localizedDescription
            }
        }

        var finalizedVideoReceipt:
            ProductionVideoReferenceReceipt?
        if let videoStopTask {
            do {
                let receipt = try await videoStopTask.value
                activeVideoReceipt = receipt
                lastFinalizedVideoReceipt = receipt
                finalizedVideoReceipt = receipt
                activeVideoUploadJob =
                    receipt.ownerAccountID.flatMap {
                        uploadJobStore.job(
                            id: receipt.recordingID,
                            ownerAccountID: $0
                        )
                    }
                videoUploadProgress =
                    activeVideoUploadJob?.phase
                        == .verified ? 1 : 0
                videoUploadError = nil
                videoUploadMessage =
                    receipt.ownerAccountID == nil
                    ? "Finalized local-only camera reference will remain on this Mac; Quipsly will not infer Episode Room authority later."
                    : "Finalized camera reference is ready for direct private-vault upload. The local MOV will be retained."
                elapsedSeconds = max(
                    elapsedSeconds,
                    receipt.durationSeconds
                )
            } catch {
                activeVideoReceipt = videoRecorder.activeReceipt
                recordingError = [
                    recordingError,
                    error.localizedDescription,
                ]
                .compactMap { $0 }
                .joined(separator: " ")
            }
        }

        if finalizedAudioReceipt != nil || finalizedVideoReceipt != nil {
            switch (
                finalizedAudioReceipt != nil,
                finalizedVideoReceipt != nil
            ) {
            case (true, true):
                message =
                    "Local microphone master and camera reference finalized and byte-verified. Closing the Nest recording boundary…"
            case (true, false):
                message =
                    "Local microphone master finalized and verified. Closing the Nest recording boundary…"
            case (false, true):
                message =
                    "Camera reference finalized and verified; microphone master needs recovery review. Closing the Nest recording boundary…"
            case (false, false):
                break
            }
        } else {
            message =
                "The take was preserved but needs recovery review."
        }

        if let roomCapture {
            if let boundaryError =
                await closeRoomBoundaryAfterLocalStop(roomCapture) {
                roomReceiptError = boundaryError
                recordingError = [
                    recordingError,
                    "The local source is safe, but Nest STOP needs attention: \(boundaryError)",
                ]
                .compactMap { $0 }
                .joined(separator: " ")
            }
        } else {
            roomReceiptMessage =
                resolvedAudioInterruption == nil
                ? "Local-only source finalized without creating a Nest recording boundary."
                : "Local-only take held after microphone-route loss; no Nest recording boundary was created."
        }
        captureGroupIsClosed = true
        activeRoomCapture = nil

        if finalizedAudioReceipt != nil || finalizedVideoReceipt != nil {
            do {
                let anchor = [
                    finalizedAudioReceipt?
                        .startedMonotonicNanoseconds,
                    finalizedVideoReceipt?
                        .startedMonotonicNanoseconds,
                ]
                .compactMap { $0 }
                .min() ?? 0
                let isCaptureClockPair =
                    finalizedAudioReceipt != nil
                        && finalizedVideoReceipt != nil
                let alignmentStatus = isCaptureClockPair
                    ? "capture-clock-proposed"
                    : "needs-alignment"

                if let audioReceipt = finalizedAudioReceipt {
                    let audioLaneID = try attachAudioMasterToEditor(
                        audioReceipt,
                        timelineOffsetSeconds:
                            monotonicOffsetSeconds(
                                audioReceipt
                                    .startedMonotonicNanoseconds,
                                from: anchor
                            ),
                        alignmentStatus: alignmentStatus
                    )
                    attachedLaneIDs.append(audioLaneID)
                }

                if let videoReceipt = finalizedVideoReceipt {
                    let videoLaneID =
                        try attachVideoReferenceToEditor(
                            videoReceipt,
                            timelineOffsetSeconds:
                                monotonicOffsetSeconds(
                                    videoReceipt
                                        .startedMonotonicNanoseconds,
                                    from: anchor
                                ),
                            alignmentStatus: alignmentStatus
                        )
                    attachedLaneIDs.append(videoLaneID)
                }
                let editorSessionIsDurable =
                    await persistCaptureEditorSession()
                let sourceSummary: String
                switch (
                    finalizedAudioReceipt != nil,
                    finalizedVideoReceipt != nil
                ) {
                case (true, true):
                    sourceSummary =
                        "Microphone master and silent camera reference"
                case (true, false):
                    sourceSummary = "Local microphone master"
                case (false, true):
                    sourceSummary = "Silent camera reference"
                case (false, false):
                    sourceSummary = "Local source"
                }
                if !editorSessionIsDurable {
                    recordingError = [
                        recordingError,
                        editorSessionError.map {
                            "Durable editor recovery failed: \($0)"
                        },
                    ]
                    .compactMap { $0 }
                    .joined(separator: " ")
                    message =
                        "\(sourceSummary) finalized and byte-verified. The lanes exist in this process, but the reload-verified Studio working session needs retry."
                } else if roomCapture == nil {
                    message =
                        "\(sourceSummary) finalized, byte-verified, and saved in a reload-verified Studio working session. No Nest recording boundary was created."
                } else if roomReceiptError == nil {
                    message =
                        "\(sourceSummary) finalized, byte-verified, saved in a reload-verified Studio working session, and closed in Nest."
                } else {
                    message =
                        "\(sourceSummary) finalized, byte-verified, and saved in a reload-verified Studio working session; Nest boundary sync needs retry."
                }
            } catch {
                recordingError = [
                    recordingError,
                    "The local sources are finalized and safe, but an editor attachment receipt failed: \(error.localizedDescription)",
                ]
                .compactMap { $0 }
                .joined(separator: " ")
                message =
                    "Local sources are safe; editor attachment needs retry."
            }
        }
        if let resolvedAudioInterruption {
            activeReceipt = resolvedAudioInterruption
            let cameraResult =
                finalizedVideoReceipt == nil
                    ? "No paired camera reference was finalized."
                    : "The paired camera reference was finalized separately and remains review-only."
            message =
                "Microphone route safety hold. The partial WAV and interruption receipt are preserved; this take cannot become a finalized master. \(cameraResult)"
            recordingError = [
                resolvedAudioInterruption.failure,
                recordingError,
            ]
            .compactMap { $0 }
            .reduce(into: [String]()) {
                if !$0.contains($1) {
                    $0.append($1)
                }
            }
            .joined(separator: " ")
        }
        refreshInterruptedRecordings()
        publishAgentAcceptanceState()
    }

    func beginNewCaptureGroup() {
        guard !isRecording,
              !isFinalizing,
              !isImportingCanon,
              !isUploadingMaster,
              !isAuditingTake else { return }
        captureGroupID = UUID()
        captureGroupIsClosed = false
        activeReceipt = nil
        activeAudioLiveStatus = nil
        lastFinalizedReceipt = nil
        activeVideoReceipt = nil
        lastFinalizedVideoReceipt = nil
        activeUploadJob = nil
        activeVideoUploadJob = nil
        uploadProgress = 0
        videoUploadProgress = 0
        uploadError = nil
        videoUploadError = nil
        uploadMessage =
            "Finalized Episode Room masters can be uploaded directly to Quipsly's private media vault."
        videoUploadMessage =
            "Authorized camera references can be preserved in Quipsly and projected into the Episode Room after exact-byte verification."
        importedCanonReceipts = []
        attachedLaneIDs = []
        canonUploadJobs = [:]
        canonUploadProgress = [:]
        canonUploadErrors = [:]
        canonImportProgress = nil
        canonImportError = nil
        canonImportMessage = "New capture group ready."
        lastTakeAudit = nil
        takeAuditError = nil
        editorWorkingSession = nil
        editorSessionError = nil
        cameraSignalVerification = nil
        elapsedSeconds = 0
        message = "New episode capture group ready."
    }

    func auditLastFinalizedTake() async {
        guard canAuditLastFinalizedTake,
              let audio = lastFinalizedReceipt else {
            takeAuditError =
                "A finalized microphone master is required. If this take includes a camera reference, that source must also be finalized."
            return
        }
        isAuditingTake = true
        takeAuditError = nil
        defer { isAuditingTake = false }
        do {
            if let video = lastFinalizedVideoReceipt {
                lastTakeAudit = .sourcePair(
                    try await ProductionCaptureTakeAuditor.audit(
                        audio: audio,
                        video: video,
                        rootDirectory: captureRoot
                    )
                )
            } else {
                lastTakeAudit = .audioOnly(
                    try await ProductionCaptureTakeAuditor.audit(
                        audio: audio,
                        rootDirectory: captureRoot
                    )
                )
            }
        } catch {
            takeAuditError = error.localizedDescription
        }
    }

    @discardableResult
    func persistCaptureEditorSession() async -> Bool {
        guard !attachedLaneIDs.isEmpty else {
            editorSessionError =
                "No verified capture source is attached to the editor yet."
            editorWorkingSession = nil
            return false
        }
        isPersistingEditorSession = true
        editorSessionError = nil
        defer { isPersistingEditorSession = false }

        let snapshot = NativeEditorSession(
            activeSequenceId: projectStore.activeSequenceId,
            project: projectStore.project
        )
        do {
            let receipt =
                try await CaptureEditorWorkingSession
                .persistAndVerify(
                    session: snapshot,
                    episodeSpaceID: episodeSpaceID,
                    captureGroupID: captureGroupID
                )
            UserDefaults.standard.set(
                receipt.name,
                forKey:
                    CaptureEditorWorkingSession
                    .activeSessionDefaultsKey
            )
            editorWorkingSession = receipt
            return true
        } catch {
            editorWorkingSession = nil
            editorSessionError = error.localizedDescription
            return false
        }
    }

    func openCaptureInEditor() {
        guard editorWorkingSession != nil else {
            editorSessionError =
                "Save and verify the capture-backed editor session before opening Studio."
            return
        }
        NotificationCenter.default.post(
            name: .quipslyOpenMainStudio,
            object: nil
        )
    }

    func importCanonOriginals(_ urls: [URL]) async {
        guard !urls.isEmpty,
              !isRecording,
              !isFinalizing,
              !isImportingCanon,
              !isUploadingMaster else {
            return
        }
        let cleanEpisode = episodeSpaceID.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        let cleanParticipant = participantID.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        guard !cleanEpisode.isEmpty, !cleanParticipant.isEmpty else {
            canonImportError = "Enter the episode space and participant before importing camera masters."
            return
        }

        isImportingCanon = true
        canonImportError = nil
        let attachedLaneCountBeforeImport =
            attachedLaneIDs.count
        defer {
            isImportingCanon = false
            canonImportProgress = nil
        }

        var failures: [String] = []
        let roomBinding = ProductionCaptureRoomBinding
            .exactCompanionBinding(
                candidates: [
                    lastFinalizedReceipt?.roomBinding,
                    lastFinalizedVideoReceipt?.roomBinding,
                ],
                captureGroupID: captureGroupID,
                episodeSpaceID: cleanEpisode,
                participantID: cleanParticipant
            )
        for (index, url) in urls.enumerated() {
            canonImportMessage =
                "Importing \(index + 1) of \(urls.count): \(url.lastPathComponent)"
            let securityScope = url.startAccessingSecurityScopedResource()
            defer {
                if securityScope {
                    url.stopAccessingSecurityScopedResource()
                }
            }

            do {
                let receipt = try await CanonCardImporter.importOriginal(
                    configuration: CanonCardImportConfiguration(
                        captureGroupID: captureGroupID,
                        episodeSpaceID: cleanEpisode,
                        participantID: cleanParticipant,
                        roomBinding: roomBinding,
                        sourceURL: url,
                        rootDirectory: captureRoot
                    ),
                    onProgress: { [weak self] progress in
                        Task { @MainActor in
                            self?.canonImportProgress = progress
                        }
                    }
                )
                let laneID = try attachCanonMasterToEditor(receipt)
                importedCanonReceipts.append(receipt)
                attachedLaneIDs.append(laneID)
                canonImportMessage =
                    receipt.roomBinding == nil
                        ? "Verified and attached \(index + 1) of \(urls.count): \(receipt.sourceFileName). No same-take Episode Room authority was available, so it remains local-only."
                        : "Verified and attached \(index + 1) of \(urls.count): \(receipt.sourceFileName). It inherited the same take's applied START authority and is eligible for explicit preservation."
            } catch {
                failures.append("\(url.lastPathComponent): \(error.localizedDescription)")
            }
        }

        let importedAnySource =
            attachedLaneIDs.count
                > attachedLaneCountBeforeImport
        let editorSessionIsDurable =
            importedAnySource
                ? await persistCaptureEditorSession()
                : false
        let editorDurabilityFailure =
            importedAnySource
                && !editorSessionIsDurable
                ? editorSessionError
                : nil

        if failures.isEmpty,
           editorDurabilityFailure == nil {
            canonImportMessage =
                roomBinding == nil
                    ? "\(urls.count) camera-card original(s) are byte verified and saved in a reload-verified Studio working session. Quipsly will not infer Episode Room authority later; alignment and proxy review remain."
                    : "\(urls.count) camera-card original(s) are byte verified, saved in a reload-verified Studio working session, and bound to this take's applied START. Preserve them explicitly when ready; waveform, drift, and proxy review remain."
        } else {
            canonImportError = (
                failures
                    + (
                        editorDurabilityFailure.map {
                            ["Studio recovery: \($0)"]
                        } ?? []
                    )
            )
            .joined(separator: "\n")
            canonImportMessage =
                editorDurabilityFailure == nil
                    ? "\(urls.count - failures.count) of \(urls.count) camera-card original(s) imported."
                    : "\(urls.count - failures.count) of \(urls.count) camera-card original(s) are byte verified and safe, but the reload-verified Studio working session needs retry."
        }
    }

    func recoverRoomReceiptsAfterLaunch() async {
        guard !didAttemptLaunchReceiptRecovery else { return }
        guard !isRecording,
              let ownerAccountID = episodeRoomOwnerAccountID else {
            updatePendingRoomReceiptCount(
                ownerAccountID: episodeRoomOwnerAccountID
            )
            if !roomReceiptOutbox.isWritable {
                roomReceiptError =
                    roomReceiptOutbox.persistenceError
                        ?? "The Nest receipt outbox is locked read-only."
            }
            return
        }
        didAttemptLaunchReceiptRecovery = true

        isRecoveringRoomReceipts = true
        roomReceiptError = nil
        defer { isRecoveringRoomReceipts = false }
        do {
            _ = try roomReceiptOutbox.closeOrphanedStarts(
                ownerAccountID: ownerAccountID
            )
            var blockedCaptureIDs: Set<UUID> = []
            for receipt in roomReceiptOutbox.pendingReceipts(
                ownerAccountID: ownerAccountID
            ) {
                if blockedCaptureIDs.contains(receipt.captureID) {
                    continue
                }
                let delivery = await deliverRoomReceipt(receipt)
                switch delivery {
                case .accepted(let stateApplied):
                    try roomReceiptOutbox.markAcknowledged(
                        receipt.id,
                        stateApplied: stateApplied
                    )
                case .terminallyRejected(
                    let message,
                    let errorCode
                ):
                    try roomReceiptOutbox.markRejectedByNest(
                        receipt.id,
                        errorCode: errorCode,
                        message: message
                    )
                case .retryable(let detail):
                    blockedCaptureIDs.insert(receipt.captureID)
                    roomReceiptError = detail
                }
            }
            updatePendingRoomReceiptCount(
                ownerAccountID: ownerAccountID
            )
            roomReceiptMessage = pendingRoomReceiptCount == 0
                ? "Recovered Nest recording boundaries are synchronized."
                : "\(pendingRoomReceiptCount) Nest recording boundary receipt(s) remain safely queued."
        } catch {
            updatePendingRoomReceiptCount(
                ownerAccountID: ownerAccountID
            )
            roomReceiptError = error.localizedDescription
            roomReceiptMessage =
                "Protected room-boundary recovery needs attention; existing receipt bytes were preserved."
        }
    }

    func uploadLastFinalizedMaster() async {
        guard let receipt = lastFinalizedReceipt,
              let ownerAccountID = episodeRoomOwnerAccountID else {
            uploadError =
                "A finalized Episode Room source and verified Nest account are required before upload."
            return
        }
        do {
            let job = try uploadJobStore.enqueueFinalizedAudio(
                receipt: receipt,
                ownerAccountID: ownerAccountID
            )
            activeUploadJob = job
            await runCanonicalUpload(
                jobID: job.id,
                expectedSourceType: "audio"
            )
        } catch {
            uploadError = error.localizedDescription
            uploadMessage =
                "The source remains local; its canonical upload was not armed."
        }
    }

    func uploadLastFinalizedVideoReference() async {
        guard let receipt = lastFinalizedVideoReceipt,
              let ownerAccountID = episodeRoomOwnerAccountID else {
            videoUploadError =
                "A finalized, byte-verified Episode Room camera reference and verified Nest account are required before upload."
            return
        }
        do {
            let job = try uploadJobStore
                .enqueueFinalizedVideoReference(
                    receipt: receipt,
                    ownerAccountID: ownerAccountID
            )
            activeVideoUploadJob = job
            await runCanonicalUpload(
                jobID: job.id,
                expectedSourceType: "video"
            )
        } catch {
            videoUploadError = error.localizedDescription
            videoUploadMessage =
                "The camera reference remains local; its canonical upload was not armed."
        }
    }

    func uploadCanonOriginal(
        _ receipt: CanonCardImportReceipt
    ) async {
        guard let ownerAccountID = episodeRoomOwnerAccountID else {
            canonUploadErrors[receipt.importID] =
                "A verified Nest account is required before this room-bound original can be preserved."
            return
        }
        do {
            let job = try uploadJobStore
                .enqueueFinalizedCanonCardOriginal(
                    receipt: receipt,
                    ownerAccountID: ownerAccountID
                )
            canonUploadJobs[receipt.importID] = job
            canonUploadErrors[receipt.importID] = nil
            await runCanonicalUpload(
                jobID: job.id,
                expectedSourceType: "video",
                canonImportID: receipt.importID
            )
        } catch {
            canonUploadErrors[receipt.importID] =
                error.localizedDescription
        }
    }

    func recoverUploadsAfterLaunch() async {
        guard !didAttemptLaunchUploadRecovery,
              let ownerAccountID = episodeRoomOwnerAccountID else {
            return
        }
        didAttemptLaunchUploadRecovery = true
        let ownerJobs = uploadJobStore.jobs(
            ownerAccountID: ownerAccountID
        )
        let audioJobs = ownerJobs.filter {
            $0.sourceType == "audio"
        }
        let videoJobs = ownerJobs.filter {
            $0.sourceType == "video"
        }
        let canonVideoJobs = videoJobs.filter {
            $0.trackID.hasSuffix("-camera-card-master")
        }
        let cameraReferenceJobs = videoJobs.filter {
            !$0.trackID.hasSuffix("-camera-card-master")
        }
        activeUploadJob = audioJobs.last
        activeVideoUploadJob = cameraReferenceJobs.last
        canonUploadJobs = Dictionary(
            canonVideoJobs.map { ($0.id, $0) },
            uniquingKeysWith: { _, latest in latest }
        )
        for job in canonVideoJobs where job.phase == .verified {
            canonUploadProgress[job.id] = 1
        }
        if lastFinalizedReceipt == nil,
           let latestJob = audioJobs.last,
           let data = try? Data(
               contentsOf: URL(
                   fileURLWithPath:
                       latestJob.sourceReceiptPath
               )
           ) {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .custom(
                ProductionCaptureDateCoding.decode
            )
            lastFinalizedReceipt = try? decoder.decode(
                ProductionAudioRecordingReceipt.self,
                from: data
            )
        }
        if lastFinalizedVideoReceipt == nil,
           let latestJob = cameraReferenceJobs.last,
           let data = try? Data(
               contentsOf: URL(
                   fileURLWithPath:
                       latestJob.sourceReceiptPath
               )
           ) {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .custom(
                ProductionCaptureDateCoding.decode
            )
            lastFinalizedVideoReceipt = try? decoder.decode(
                ProductionVideoReferenceReceipt.self,
                from: data
            )
        }
        if let verified = audioJobs.last,
           verified.phase == .verified {
            uploadMessage =
                verified.userFacingVerificationSummary
            uploadProgress = 1
        }
        if let verified = cameraReferenceJobs.last,
           verified.phase == .verified {
            videoUploadMessage =
                verified.userFacingVerificationSummary
            videoUploadProgress = 1
        }
        let receiptDecoder = JSONDecoder()
        receiptDecoder.dateDecodingStrategy = .custom(
            ProductionCaptureDateCoding.decode
        )
        for job in canonVideoJobs {
            guard !importedCanonReceipts.contains(where: {
                $0.importID == job.id
            }),
            let data = try? Data(
                contentsOf: URL(
                    fileURLWithPath: job.sourceReceiptPath
                )
            ),
            let receipt = try? receiptDecoder.decode(
                CanonCardImportReceipt.self,
                from: data
            ),
            receipt.importID == job.id,
            normalizedOwnerAccountID(
                receipt.roomBinding?.ownerAccountID
            ) == normalizedOwnerAccountID(ownerAccountID) else {
                continue
            }
            importedCanonReceipts.append(receipt)
        }
        let pendingJobs = ownerJobs.filter {
            $0.phase != .verified
        }
        guard !pendingJobs.isEmpty else {
            return
        }
        for pending in pendingJobs {
            let canonImportID = pending.trackID
                .hasSuffix("-camera-card-master")
                ? pending.id
                : nil
            if canonImportID != nil {
                canonUploadErrors[pending.id] = nil
            } else if pending.sourceType == "video" {
                videoUploadMessage =
                    "Recovering the previously authorized camera-reference upload from its durable job receipt…"
            } else {
                uploadMessage =
                    "Recovering the previously authorized microphone-master upload from its durable job receipt…"
            }
            await runCanonicalUpload(
                jobID: pending.id,
                expectedSourceType: pending.sourceType,
                canonImportID: canonImportID
            )
        }
    }

    private func runCanonicalUpload(
        jobID: UUID,
        expectedSourceType: String,
        canonImportID: UUID? = nil
    ) async {
        guard !isUploadingMaster,
              let ownerAccountID = episodeRoomOwnerAccountID,
              let baseURL = nativeAccountStore.normalizedBaseURL,
              let sourceJob = uploadJobStore.job(
                id: jobID,
                ownerAccountID: ownerAccountID
              ),
              sourceJob.sourceType == expectedSourceType else {
            let error =
                "The configured Nest account, URL, or protected upload job is unavailable."
            if let canonImportID {
                canonUploadErrors[canonImportID] = error
            } else if expectedSourceType == "video" {
                videoUploadError = error
            } else {
                uploadError = error
            }
            return
        }
        let isVideo = sourceJob.sourceType == "video"
        isUploadingMaster = true
        if let canonImportID {
            canonUploadErrors[canonImportID] = nil
            canonUploadProgress[canonImportID] = 0.04
        } else if isVideo {
            videoUploadError = nil
            videoUploadProgress = 0.04
        } else {
            uploadError = nil
            uploadProgress = 0.04
        }
        defer { isUploadingMaster = false }

        do {
            let verified = try await canonicalUploader.upload(
                jobID: jobID,
                ownerAccountID: ownerAccountID,
                baseURL: baseURL,
                authenticatedData: { [nativeAccountStore] request in
                    try await nativeAccountStore.authenticatedData(
                        for: request
                    )
                },
                onUpdate: { [weak self] update in
                    guard let self else { return }
                    let current = uploadJobStore.job(
                        id: jobID,
                        ownerAccountID: ownerAccountID
                    )
                    if let canonImportID {
                        canonUploadProgress[canonImportID] =
                            update.progress
                        if let current {
                            canonUploadJobs[canonImportID] =
                                current
                        }
                    } else if isVideo {
                        videoUploadProgress =
                            update.progress
                        videoUploadMessage = update.message
                        activeVideoUploadJob = current
                    } else {
                        uploadProgress = update.progress
                        uploadMessage = update.message
                        activeUploadJob = current
                    }
                }
            )
            if let canonImportID {
                canonUploadJobs[canonImportID] = verified
                canonUploadProgress[canonImportID] = 1
                canonUploadErrors[canonImportID] = nil
            } else if isVideo {
                activeVideoUploadJob = verified
                videoUploadProgress = 1
                videoUploadMessage =
                    verified.userFacingVerificationSummary
            } else {
                activeUploadJob = verified
                uploadProgress = 1
                uploadMessage =
                    verified.userFacingVerificationSummary
            }
        } catch {
            let current = uploadJobStore.job(
                id: jobID,
                ownerAccountID: ownerAccountID
            )
            if let canonImportID {
                if let current {
                    canonUploadJobs[canonImportID] = current
                }
                canonUploadErrors[canonImportID] =
                    error.localizedDescription
            } else if isVideo {
                activeVideoUploadJob = current
                videoUploadError =
                    error.localizedDescription
                videoUploadMessage =
                    "Upload held for explicit retry. The finalized MOV and its source receipt remain untouched."
            } else {
                activeUploadJob = current
                uploadError = error.localizedDescription
                uploadMessage =
                    "Upload held for explicit retry. The finalized WAV and its source receipt remain untouched."
            }
        }
    }

    func refreshInterruptedRecordings() {
        interruptedRecordings = ProductionAudioRecorder.interruptedRecordings(
            in: captureRoot
        )
        interruptedVideoReferences =
            ProductionVideoReferenceRecorder.interruptedRecordings(
                in: captureRoot
            )
    }

    private enum RoomReceiptDelivery {
        case accepted(stateApplied: Bool)
        case terminallyRejected(
            message: String,
            errorCode: String?
        )
        case retryable(message: String)
    }

    private struct RoomReceiptRequest: Encodable {
        let callRoomId: String
        let action: String
        let receiptId: String
        let captureId: String
        let occurredAt: Date
        let source: String

        init(receipt: MacCaptureRoomReceipt) {
            callRoomId = receipt.callRoomID
            action = receipt.action.rawValue
            receiptId = receipt.id.uuidString.lowercased()
            captureId =
                receipt.captureID.uuidString.lowercased()
            occurredAt = receipt.occurredAt
            source = "macos-studio-capture-outbox"
        }
    }

    private func deliverRoomReceipt(
        _ receipt: MacCaptureRoomReceipt
    ) async -> RoomReceiptDelivery {
        guard receipt.ownerAccountID == episodeRoomOwnerAccountID else {
            return .retryable(
                message:
                    "The durable receipt belongs to a different verified Quipsly account and was not sent."
            )
        }
        guard let baseURL = nativeAccountStore.normalizedBaseURL else {
            return .retryable(
                message: "The configured Nest base URL is invalid."
            )
        }
        do {
            var request = URLRequest(
                url: baseURL.appending(
                    path: "/api/mobile/capture/rooms/state"
                )
            )
            request.httpMethod = "POST"
            request.setValue(
                "application/json",
                forHTTPHeaderField: "Content-Type"
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            request.httpBody = try encoder.encode(
                RoomReceiptRequest(receipt: receipt)
            )
            let (data, response) =
                try await nativeAccountStore.authenticatedData(
                    for: request
                )
            let payload = try JSONDecoder().decode(
                MacCaptureRoomStateResponse.self,
                from: data
            )
            if payload.receiptPersisted == true, !payload.ok {
                return .terminallyRejected(
                    message:
                        payload.error
                            ?? "Nest preserved the receipt but held the requested room-state change.",
                    errorCode: payload.errorCode
                )
            }
            guard (200 ..< 300).contains(response.statusCode),
                  payload.ok,
                  payload.receiptPersisted == true else {
                return .retryable(
                    message:
                        payload.error
                            ?? "Nest did not confirm durable receipt persistence."
                )
            }
            return .accepted(
                stateApplied: payload.stateApplied == true
            )
        } catch {
            return .retryable(message: error.localizedDescription)
        }
    }

    private func closeRoomBoundaryAfterLocalStop(
        _ capture: ActiveRoomCapture,
        localSourceWasOpened: Bool = true
    ) async -> String? {
        do {
            let stopReceipt = try roomReceiptOutbox.enqueueStop(
                ownerAccountID: capture.ownerAccountID,
                captureID: capture.captureID,
                sessionID: capture.sessionID,
                callRoomID: capture.callRoomID
            )
            updatePendingRoomReceiptCount(
                ownerAccountID: capture.ownerAccountID
            )
            roomReceiptMessage = localSourceWasOpened
                ? "Local source is closed. STOP is durable locally and synchronizing with Nest…"
                : "No media engine was opened. STOP is durable locally and closing the armed Nest boundary…"
            let delivery = await deliverRoomReceipt(stopReceipt)
            switch delivery {
            case .accepted(let stateApplied):
                try roomReceiptOutbox.markAcknowledged(
                    capture.startReceipt.id,
                    stateApplied: true
                )
                try roomReceiptOutbox.markAcknowledged(
                    stopReceipt.id,
                    stateApplied: stateApplied
                )
                updatePendingRoomReceiptCount(
                    ownerAccountID: capture.ownerAccountID
                )
                roomReceiptMessage =
                    localSourceWasOpened
                        ? "Nest START and STOP are durably acknowledged for this local source."
                        : "Nest START and STOP are durably acknowledged; no local media was opened."
                roomReceiptError = nil
                return nil
            case .terminallyRejected(
                let message,
                let errorCode
            ):
                try roomReceiptOutbox.markAcknowledged(
                    capture.startReceipt.id,
                    stateApplied: true
                )
                try roomReceiptOutbox.markRejectedByNest(
                    stopReceipt.id,
                    errorCode: errorCode,
                    message: message
                )
                updatePendingRoomReceiptCount(
                    ownerAccountID: capture.ownerAccountID
                )
                roomReceiptMessage =
                    localSourceWasOpened
                        ? "Nest preserved STOP but held its state transition. The local source remains safe."
                        : "Nest preserved STOP but held its state transition. No local media was opened."
                return message
            case .retryable(let detail):
                roomReceiptMessage =
                    localSourceWasOpened
                        ? "STOP is waiting in the durable outbox. The local source remains safe."
                        : "STOP is waiting in the durable outbox. No local media was opened."
                return detail
            }
        } catch {
            updatePendingRoomReceiptCount(
                ownerAccountID: capture.ownerAccountID
            )
            roomReceiptMessage =
                localSourceWasOpened
                    ? "The local source is closed, but its Nest STOP boundary needs recovery."
                    : "No local media was opened, but the armed Nest STOP boundary needs recovery."
            return error.localizedDescription
        }
    }

    private func updatePendingRoomReceiptCount(
        ownerAccountID: String?
    ) {
        guard let ownerAccountID else {
            pendingRoomReceiptCount = 0
            return
        }
        pendingRoomReceiptCount = roomReceiptOutbox
            .pendingReceipts(ownerAccountID: ownerAccountID)
            .count
    }

    private func normalizedOwnerAccountID(
        _ value: String?
    ) -> String? {
        guard let clean = nonempty(value) else { return nil }
        return clean.lowercased()
    }

    private func nonempty(_ value: String?) -> String? {
        let clean = value?.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return clean?.isEmpty == false ? clean : nil
    }

    private func startElapsedClock(startedAt: Date) {
        elapsedTask?.cancel()
        elapsedTask = Task { [weak self] in
            var lastPublishedWholeSecond = -1
            while !Task.isCancelled {
                guard let self else { return }
                self.elapsedSeconds = max(0, Date().timeIntervalSince(startedAt))
                let wholeSecond =
                    Int(self.elapsedSeconds.rounded(.down))
                if wholeSecond
                    != lastPublishedWholeSecond {
                    self.activeAudioLiveStatus =
                        self.recorder.liveStatus
                    self.publishAgentAcceptanceState()
                    lastPublishedWholeSecond =
                        wholeSecond
                }
                try? await Task.sleep(for: .milliseconds(200))
            }
        }
    }

    private func attachAudioMasterToEditor(
        _ receipt: ProductionAudioRecordingReceipt,
        timelineOffsetSeconds: Double = 0,
        alignmentStatus: String = "needs-alignment"
    ) throws -> UUID {
        let receiptPath = URL(fileURLWithPath: receipt.recordingDirectoryPath)
            .appendingPathComponent(ProductionAudioRecorder.receiptFilename)
            .path
        return try attachManagedSourceToEditor(
            sourceAssetID: receipt.recordingID.uuidString.lowercased(),
            captureGroupID: receipt.captureGroupID,
            episodeSpaceID: receipt.episodeSpaceID,
            mediaURL: URL(fileURLWithPath: receipt.audioPath),
            originalURL: URL(fileURLWithPath: receipt.audioPath),
            duration: receipt.durationSeconds,
            name: "\(receipt.participantID) local mic master",
            role: "\(receipt.participantID.lowercased())_microphone_master",
            ingestKind: "mac_local_audio_master",
            sha256: receipt.sha256,
            sourceReceiptPath: receiptPath,
            timelineOffsetSeconds: timelineOffsetSeconds,
            alignmentStatus: alignmentStatus
        )
    }

    private func attachVideoReferenceToEditor(
        _ receipt: ProductionVideoReferenceReceipt,
        timelineOffsetSeconds: Double,
        alignmentStatus: String
    ) throws -> UUID {
        let receiptPath = URL(
            fileURLWithPath: receipt.recordingDirectoryPath
        )
        .appendingPathComponent(
            ProductionVideoReferenceRecorder.receiptFilename
        )
        .path
        return try attachManagedSourceToEditor(
            sourceAssetID:
                receipt.recordingID.uuidString.lowercased(),
            captureGroupID: receipt.captureGroupID,
            episodeSpaceID: receipt.episodeSpaceID,
            mediaURL: URL(fileURLWithPath: receipt.videoPath),
            originalURL: URL(fileURLWithPath: receipt.videoPath),
            duration: receipt.durationSeconds,
            name:
                "\(receipt.participantID) local camera reference",
            role:
                "\(receipt.participantID.lowercased())_camera_reference",
            ingestKind: "mac_local_video_reference",
            sha256: receipt.sha256,
            sourceReceiptPath: receiptPath,
            timelineOffsetSeconds: timelineOffsetSeconds,
            alignmentStatus: alignmentStatus
        )
    }

    private func attachCanonMasterToEditor(
        _ receipt: CanonCardImportReceipt
    ) throws -> UUID {
        try attachManagedSourceToEditor(
            sourceAssetID: receipt.importID.uuidString.lowercased(),
            captureGroupID: receipt.captureGroupID,
            episodeSpaceID: receipt.episodeSpaceID,
            mediaURL: URL(fileURLWithPath: receipt.managedOriginalPath),
            originalURL: URL(fileURLWithPath: receipt.sourcePath),
            duration: receipt.technicalProbe.durationSeconds,
            name: "\(receipt.participantID) Canon card · \(receipt.sourceFileName)",
            role: "\(receipt.participantID.lowercased())_camera",
            ingestKind: "canon_card_verified_managed_original",
            sha256: receipt.managedOriginalSHA256,
            sourceReceiptPath: receipt.receiptPath
        )
    }

    private func attachManagedSourceToEditor(
        sourceAssetID: String,
        captureGroupID: UUID,
        episodeSpaceID: String,
        mediaURL: URL,
        originalURL: URL,
        duration: Double,
        name: String,
        role: String,
        ingestKind: String,
        sha256: String?,
        sourceReceiptPath: String,
        timelineOffsetSeconds: Double = 0,
        alignmentStatus: String = "needs-alignment"
    ) throws -> UUID {
        let attachment = VerifiedCaptureSourceAttachment(
            sourceAssetID: sourceAssetID,
            captureGroupID: captureGroupID,
            episodeSpaceID: episodeSpaceID,
            mediaURL: mediaURL,
            originalURL: originalURL,
            duration: duration,
            name: name,
            role: role,
            ingestKind: ingestKind,
            sha256: sha256,
            sourceReceiptPath: sourceReceiptPath,
            timelineOffsetSeconds: timelineOffsetSeconds,
            alignmentStatus: alignmentStatus
        )
        let receipt = try projectStore.attachVerifiedCaptureSource(attachment)
        if let sequence = projectStore.activeSequence {
            playbackEngine.updateSourcePlayers(for: sequence)
        }
        return receipt.laneID
    }

    private func monotonicOffsetSeconds(
        _ value: UInt64,
        from origin: UInt64
    ) -> Double {
        guard value >= origin else { return 0 }
        return Double(value - origin) / 1_000_000_000
    }

    private func resolveSelections(in inventory: ProductionCaptureInventory) {
        if !inventory.videoDevices.contains(where: { $0.id == selectedVideoDeviceID }) {
            selectedVideoDeviceID =
                inventory.videoDevices.first {
                    $0.name.localizedCaseInsensitiveContains("Canon")
                        && $0.name.localizedCaseInsensitiveContains("R8")
                }?.id
                ?? inventory.videoDevices.first {
                    $0.name.localizedCaseInsensitiveContains(
                        "EOS Webcam"
                    )
                }?.id
                ?? inventory.videoDevices.first?.id
        }

        if !inventory.audioDevices.contains(where: {
            $0.id == selectedAudioInputID && $0.hasInput
        }) {
            selectedAudioInputID =
                inventory.audioDevices.first {
                    $0.hasInput && $0.name.localizedCaseInsensitiveContains("MV7i")
                }?.id
                ?? inventory.audioDevices.first {
                    $0.hasInput && $0.isDefaultInput
                }?.id
                ?? inventory.audioDevices.first(where: \.hasInput)?.id
        }

        if let input = inventory.audioDevices.first(where: {
            $0.id == selectedAudioInputID
        }), input.hasOutput {
            selectedAudioOutputID = input.id
        } else if !inventory.audioDevices.contains(where: {
            $0.id == selectedAudioOutputID && $0.hasOutput
        }) {
            selectedAudioOutputID =
                inventory.audioDevices.first {
                    $0.hasOutput && $0.name.localizedCaseInsensitiveContains("MV7i")
                }?.id
                ?? inventory.audioDevices.first {
                    $0.hasOutput && $0.isDefaultOutput
                }?.id
                ?? inventory.audioDevices.first(where: \.hasOutput)?.id
        }
    }

    private func applyEpisodeRoomSelection(
        _ roomID: String?,
        beginNewGroup: Bool
    ) {
        selectedEpisodeRoomID = roomID
        guard let room = selectedEpisodeRoom else {
            callRoomID = ""
            if beginNewGroup {
                beginNewCaptureGroup()
            }
            episodeRoomMessage = isLocalOnlyCapture
                ? "Local-only source mode. Enter a stable source label and participant identity; no room or consent state will be inferred."
                : "Choose an authorized Episode Room or explicitly select Local-only / solo source."
            return
        }

        callRoomID = room.callRoomId
        episodeSpaceID = room.canonicalEpisodeSpaceID
        if let rawParticipantID = room.participantId {
            let cleanParticipantID = rawParticipantID
                .trimmingCharacters(in: .whitespacesAndNewlines)
            if !cleanParticipantID.isEmpty {
                participantID = cleanParticipantID
            }
        }
        if beginNewGroup {
            beginNewCaptureGroup()
        }
        episodeRoomMessage =
            "\(room.title) selected · \(room.readinessLabel)."
    }
}

private final class CameraPreviewNSView: NSView {
    let previewLayer = AVCaptureVideoPreviewLayer()

    override init(frame frameRect: NSRect) {
        super.init(frame: frameRect)
        wantsLayer = true
        previewLayer.videoGravity = .resizeAspectFill
        layer = previewLayer
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) {
        nil
    }

    override func layout() {
        super.layout()
        previewLayer.frame = bounds
    }
}

private struct CameraPreviewView: NSViewRepresentable {
    let session: AVCaptureSession

    func makeNSView(context: Context) -> CameraPreviewNSView {
        let view = CameraPreviewNSView(frame: .zero)
        view.previewLayer.session = session
        return view
    }

    func updateNSView(
        _ nsView: CameraPreviewNSView,
        context: Context
    ) {
        if nsView.previewLayer.session !== session {
            nsView.previewLayer.session = session
        }
    }
}

struct EpisodeCaptureSetupView: View {
    private static let localOnlyRoomSelectionID =
        "__quipsly-local-only-source__"

    @StateObject private var model: EpisodeCaptureSetupModel
    @StateObject private var audioRoom = MacAudioRoomController()
    @ObservedObject private var nativeAccountStore:
        QuipslyNativeAccountStore
    @State private var captureAgentConsumerID = UUID()

    init(
        projectStore: ProjectStore,
        playbackEngine: PlaybackEngine,
        nativeAccountStore: QuipslyNativeAccountStore
    ) {
        _nativeAccountStore = ObservedObject(
            wrappedValue: nativeAccountStore
        )
        _model = StateObject(
            wrappedValue: EpisodeCaptureSetupModel(
                projectStore: projectStore,
                playbackEngine: playbackEngine,
                nativeAccountStore: nativeAccountStore
            )
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    episodeRoomCard
                    routeSelectors
                    cameraReferenceCard
                    localMasterCard
                    takeAcceptanceCard
                    editorHandoffCard
                    audioOnlyRoomCard
                    canonCardMasterCard
                    if let plan = model.plan {
                        planSummary(plan)
                        assessmentGrid(plan)
                        ownershipCard(plan)
                    } else {
                        ProgressView(model.message)
                            .frame(maxWidth: .infinity, minHeight: 240)
                    }
                }
                .padding(24)
            }
        }
        .frame(minWidth: 820, minHeight: 680)
        .task {
            await model.refresh()
            await model.refreshEpisodeRooms()
            await model.recoverRoomReceiptsAfterLaunch()
            await model.recoverUploadsAfterLaunch()
            if usesCaptureAgentAcceptance {
                model.publishAgentAcceptanceState()
            }
        }
        .task(id: model.selectedVideoDeviceID) {
            await model.selectedCameraDidChange()
        }
        .task {
            guard usesCaptureAgentAcceptance else { return }
            while !Task.isCancelled {
                model.publishAgentAcceptanceState()
                try? await Task.sleep(
                    nanoseconds: 500_000_000
                )
            }
        }
        .onAppear {
            guard usesCaptureAgentAcceptance else { return }
            let server = AgentServer.shared
            server.claimCommandConsumer(captureAgentConsumerID)
            server.registerCommandExecutor { request in
                model.handleAgentAcceptanceCommand(request)
            }
            for request in server.drainCommandRequests(
                consumerId: captureAgentConsumerID
            ) {
                model.handleAgentAcceptanceCommand(request)
            }
            model.publishAgentAcceptanceState()
        }
        .onDisappear {
            if usesCaptureAgentAcceptance {
                AgentServer.shared.clearCommandExecutor()
            }
            Task {
                if model.isRecording {
                    await model.stopRecording()
                }
                if audioRoom.isActive {
                    await audioRoom.disconnect()
                }
                model.stopCameraPreview()
            }
        }
        .accessibilityIdentifier("EpisodeCaptureSetup")
    }

    private var usesCaptureAgentAcceptance: Bool {
        ProcessInfo.processInfo.arguments.contains(
            "--episode-capture-setup-only"
        )
    }

    private var cameraReferenceCard: some View {
        GroupBox("Local camera reference") {
            VStack(alignment: .leading, spacing: 13) {
                HStack(alignment: .top, spacing: 16) {
                    ZStack(alignment: .topTrailing) {
                        CameraPreviewView(
                            session:
                                model.videoRecorder.captureSession
                        )
                        .frame(
                            minWidth: 320,
                            idealWidth: 400,
                            maxWidth: 460,
                            minHeight: 180,
                            idealHeight: 225,
                            maxHeight: 260
                        )
                        .background(Color.black)
                        .clipShape(
                            RoundedRectangle(cornerRadius: 12)
                        )

                        Text(
                            model.videoRecorder.isRecording
                                ? "REC · REFERENCE"
                                : "LOCAL PREVIEW"
                        )
                        .font(.caption2.weight(.black))
                        .foregroundStyle(
                            model.videoRecorder.isRecording
                                ? Color.white
                                : Color.primary
                        )
                        .padding(.horizontal, 8)
                        .padding(.vertical, 5)
                        .background(
                            model.videoRecorder.isRecording
                                ? Color.red
                                : Color.primary.opacity(0.12),
                            in: Capsule()
                        )
                        .padding(9)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        Text(
                            "Keep framing visible and write a recoverable sync reference"
                        )
                        .font(.headline)
                        Text(
                            "This is a silent local movie from the selected macOS camera route. With the Canon R8 USB feed it is a 1080p/30 framing and sync reference; the internally recorded camera-card file remains the authoritative 4K master."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(
                            horizontal: false,
                            vertical: true
                        )

                        Toggle(
                            "Include camera reference when recording",
                            isOn: $model.includeCameraReference
                        )
                        .disabled(
                            model.isRecording
                                || model.isFinalizing
                                || model.selectedVideoDevice == nil
                                || model.cameraPreviewFormat == nil
                        )
                        .accessibilityIdentifier(
                            "EpisodeCaptureIncludeCameraReference"
                        )

                        if let format =
                            model.cameraPreviewFormat {
                            Label(
                                "Format negotiated · \(format.width)×\(format.height) · \(format.maximumFrameRate.formatted(.number.precision(.fractionLength(0...2)))) fps · silent MOV",
                                systemImage:
                                    "info.circle.fill"
                            )
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.blue)
                        }

                        if model.cameraSignalVerificationIsFresh {
                            Label(
                                "Moving live image confirmed for this exact route",
                                systemImage:
                                    "checkmark.seal.fill"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.green)
                        } else if model.cameraPreviewFormat != nil {
                            Button {
                                model.confirmCameraSignal()
                            } label: {
                                Label(
                                    "Confirm moving live image",
                                    systemImage:
                                        "eye.circle.fill"
                                )
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(
                                model.isRecording
                                    || model.isFinalizing
                            )
                            .accessibilityIdentifier(
                                "EpisodeCaptureConfirmLiveCameraSignal"
                            )

                            Text(
                                "Move in frame first. Do not confirm an EOS Webcam Utility disconnected slate, frozen frame, color bars, or placeholder."
                            )
                            .font(.caption)
                            .foregroundStyle(.orange)
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                        }

                        Text(model.cameraPreviewMessage)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )

                        if let error = model.cameraPreviewError {
                            Label(
                                error,
                                systemImage:
                                    "exclamationmark.octagon.fill"
                            )
                            .font(.caption)
                            .foregroundStyle(.red)
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                        }
                    }
                    .frame(
                        maxWidth: .infinity,
                        alignment: .topLeading
                    )
                }

                if let receipt =
                    model.lastFinalizedVideoReceipt {
                    Divider()
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "checkmark.seal.fill")
                            .font(.title2)
                            .foregroundStyle(.green)
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Byte-verified camera reference")
                                .font(.headline)
                            Text(
                                "\(formatDuration(receipt.durationSeconds)) · \(receipt.recordedFormat?.width ?? receipt.negotiatedFormat.width)×\(receipt.recordedFormat?.height ?? receipt.negotiatedFormat.height) recorded · \(ByteCountFormatter.string(fromByteCount: receipt.byteCount ?? 0, countStyle: .file))"
                            )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            Text(
                                "SHA-256 \(receipt.sha256?.prefix(16) ?? "missing")… · no audio · monotonic start preserved"
                            )
                            .font(.caption.monospaced())
                            .textSelection(.enabled)
                        }
                        Spacer()
                        Button("Reveal reference") {
                            NSWorkspace.shared
                                .activateFileViewerSelecting([
                                    URL(
                                        fileURLWithPath:
                                            receipt.videoPath
                                    ),
                                ])
                        }
                        .accessibilityIdentifier(
                            "EpisodeCaptureRevealCameraReference"
                        )
                    }
                    VStack(alignment: .leading, spacing: 7) {
                        if model.isUploadingMaster,
                           model.activeVideoUploadJob?.id
                            == receipt.recordingID {
                            ProgressView(
                                value: model.videoUploadProgress
                            )
                        }
                        HStack(alignment: .top, spacing: 8) {
                            Label(
                                model.videoUploadMessage,
                                systemImage:
                                    model.videoUploadSystemImage
                            )
                            .font(.caption)
                            .foregroundStyle(
                                model.videoUploadError == nil
                                    ? Color.secondary
                                    : Color.orange
                            )
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                            Spacer()
                            if model
                                .canUploadLastFinalizedVideoReference {
                                Button(
                                    model.activeVideoUploadJob == nil
                                        ? "Upload camera reference"
                                        : "Retry camera upload"
                                ) {
                                    Task {
                                        await model
                                            .uploadLastFinalizedVideoReference()
                                    }
                                }
                                .disabled(model.isUploadingMaster)
                                .accessibilityIdentifier(
                                    "EpisodeCaptureUploadCameraReference"
                                )
                            }
                        }
                        if let error = model.videoUploadError {
                            Text(error)
                                .font(.caption.monospaced())
                                .foregroundStyle(.orange)
                                .textSelection(.enabled)
                        }
                        Text(
                            "Quipsly retains the local MOV. Exact-byte cloud verification and Episode Room projection do not claim that a proxy, transcript, or timeline alignment is already ready."
                        )
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(
                            horizontal: false,
                            vertical: true
                        )
                    }
                }

                if !model.interruptedVideoReferences.isEmpty {
                    Label(
                        "\(model.interruptedVideoReferences.count) interrupted camera reference(s) remain preserved as partial fragmented MOV files for explicit recovery review.",
                        systemImage: "lifepreserver.fill"
                    )
                    .font(.callout)
                    .foregroundStyle(.orange)
                }
            }
            .padding(10)
        }
        .accessibilityIdentifier(
            "EpisodeCaptureLocalCameraReference"
        )
    }

    private var episodeRoomCard: some View {
        GroupBox("Episode workspace") {
            VStack(alignment: .leading, spacing: 13) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Bind every source to an authorized Nest session")
                            .font(.headline)
                        Text(
                            "The selected room supplies stable episode, participant, call-room, and consent identity. Quipsly will not infer recording permission from a title or from successfully joining the call."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    Button(
                        model.isRefreshingEpisodeRooms
                            ? "Refreshing…"
                            : "Refresh rooms"
                    ) {
                        Task {
                            await model.refreshEpisodeRooms()
                            await model
                                .recoverRoomReceiptsAfterLaunch()
                            await model.recoverUploadsAfterLaunch()
                        }
                    }
                    .disabled(
                        model.isRefreshingEpisodeRooms
                            || model.isRecording
                            || model.isFinalizing
                            || model.isImportingCanon
                            || model.isUploadingMaster
                            || model.isAuditingTake
                            || audioRoom.isActive
                    )
                    .accessibilityIdentifier(
                        "EpisodeCaptureRefreshEpisodeRooms"
                    )
                }

                Picker(
                    "Capture destination",
                    selection: episodeRoomSelection
                ) {
                    Text("Choose an authorized Episode Room")
                        .tag("")
                    Text("Local-only / solo source")
                        .tag(Self.localOnlyRoomSelectionID)
                    ForEach(model.episodeRooms) { room in
                        Text(roomPickerLabel(room))
                            .tag(room.id)
                    }
                }
                .disabled(
                    model.isRecording
                        || model.isFinalizing
                        || model.isImportingCanon
                        || model.isUploadingMaster
                        || audioRoom.isActive
                )
                .accessibilityIdentifier(
                    "EpisodeCaptureEpisodeRoomPicker"
                )

                if let room = model.selectedEpisodeRoom {
                    selectedEpisodeRoomSummary(room)
                } else if model.isLocalOnlyCapture {
                    Label(
                        "Local-only mode is explicit: files stay linked by the source label and capture-group receipt, but Nest room consent and collaboration state are not inferred.",
                        systemImage: "externaldrive.badge.person.crop"
                    )
                    .font(.callout)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                } else {
                    Label(
                        "Recording is locked until you choose an authorized room or deliberately select Local-only / solo source.",
                        systemImage: "lock.shield"
                    )
                    .font(.callout)
                    .foregroundStyle(.orange)
                }

                HStack(spacing: 8) {
                    Text(model.episodeRoomMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Text(
                        nativeAccountStore.isVerified
                            ? nativeAccountStore.userEmail
                            : nativeAccountStore.hasSavedSession
                                ? "Saved Nest session"
                                : "Native account not connected"
                    )
                    .font(.caption.monospaced())
                    .foregroundStyle(.secondary)
                }

                if let error = model.episodeRoomError {
                    Label(error, systemImage: "exclamationmark.octagon.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }
            }
            .padding(10)
        }
        .accessibilityIdentifier("EpisodeCaptureEpisodeWorkspace")
    }

    private var episodeRoomSelection: Binding<String> {
        Binding(
            get: {
                if model.isLocalOnlyCapture {
                    return Self.localOnlyRoomSelectionID
                }
                return model.selectedEpisodeRoomID ?? ""
            },
            set: { selection in
                if selection == Self.localOnlyRoomSelectionID {
                    model.selectEpisodeRoom(nil)
                } else if !selection.isEmpty {
                    model.selectEpisodeRoom(selection)
                }
            }
        )
    }

    private func selectedEpisodeRoomSummary(
        _ room: MacEpisodeRoomSummary
    ) -> some View {
        let ready =
            model.episodeRoomCatalogIsFresh
                && room.safeToRecordLocally

        return VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Image(
                    systemName: ready
                        ? "checkmark.shield.fill"
                        : "exclamationmark.shield.fill"
                )
                .font(.title2)
                .foregroundStyle(
                    ready ? .green : .orange
                )
                VStack(alignment: .leading, spacing: 3) {
                    Text(room.title)
                        .font(.headline)
                    if !room.displaySubtitle.isEmpty {
                        Text(room.displaySubtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    Text(
                        model.episodeRoomCatalogIsFresh
                            ? room.readinessDetail
                            : "Nest readiness must refresh successfully before recording."
                    )
                        .font(.callout)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Text(
                    model.episodeRoomCatalogIsFresh
                        ? room.readinessLabel.uppercased()
                        : "REFRESH REQUIRED"
                )
                    .font(.caption2.weight(.black))
                    .foregroundStyle(
                        ready ? .green : .orange
                    )
                    .padding(.horizontal, 9)
                    .padding(.vertical, 6)
                    .background(.quaternary, in: Capsule())
            }

            HStack(spacing: 16) {
                Label(
                    room.recordingConsentGranted
                        ? "Consent granted"
                        : "Consent \(room.recordingConsentStatus ?? "needed")",
                    systemImage: room.recordingConsentGranted
                        ? "person.badge.shield.checkmark.fill"
                        : "person.badge.shield.exclamationmark.fill"
                )
                .foregroundStyle(
                    room.recordingConsentGranted ? .green : .orange
                )

                Label(
                    room.canJoinProvider
                        ? "Audio room join-ready"
                        : "Provider room not ready",
                    systemImage: room.canJoinProvider
                        ? "phone.connection.fill"
                        : "phone.badge.waveform"
                )
                .foregroundStyle(
                    room.canJoinProvider ? .green : .secondary
                )

                Spacer()

                if let roomURL = episodeRoomURL(room) {
                    Button("Open Episode Room in Nest") {
                        NSWorkspace.shared.open(roomURL)
                    }
                    .accessibilityIdentifier(
                        "EpisodeCaptureOpenEpisodeRoom"
                    )
                }
            }
            .font(.caption)

            if let sources = room.captureSources,
               !sources.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        Label(
                            "\(sources.count) canonical source\(sources.count == 1 ? "" : "s")",
                            systemImage: "externaldrive.fill.badge.checkmark"
                        )
                        .font(.caption.weight(.semibold))
                        Spacer()
                        Text(
                            "\(sources.filter(\.exactBytesVerified).count) byte-verified"
                        )
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                    }
                    ForEach(Array(sources.prefix(4))) { source in
                        HStack(spacing: 8) {
                            Image(
                                systemName:
                                    source.kind.uppercased().contains("VIDEO")
                                        ? "video.fill"
                                        : "waveform"
                            )
                            .foregroundStyle(
                                source.exactBytesVerified
                                    ? .green
                                    : .orange
                            )
                            VStack(alignment: .leading, spacing: 2) {
                                Text(source.fileName)
                                    .font(.caption.weight(.semibold))
                                    .lineLimit(1)
                                Text(source.readinessLabel)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Text(source.recordingStatus.uppercased())
                                .font(.caption2.weight(.black))
                                .foregroundStyle(.secondary)
                            if source.transcript?.status?
                                .uppercased() == "COMPLETED",
                               source.transcript?.handoffUrl != nil {
                                Button {
                                    Task {
                                        await model
                                            .importCanonicalTranscript(
                                                source,
                                                room: room
                                            )
                                    }
                                } label: {
                                    Label(
                                        "Import timed transcript",
                                        systemImage:
                                            "text.word.spacing"
                                    )
                                }
                                .buttonStyle(.bordered)
                                .controlSize(.small)
                                .disabled(
                                    model
                                        .isImportingCanonicalTranscript
                                )
                                .help(
                                    "Import the exact Nest transcript job and provider word anchors into the active Studio sequence. A different existing transcript is never overwritten."
                                )
                            }
                        }
                    }
                    Text(model.transcriptImportMessage)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(
                            horizontal: false,
                            vertical: true
                        )
                    if let error = model.transcriptImportError {
                        Text(error)
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.red)
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                    }
                }
                .padding(10)
                .background(
                    Color.primary.opacity(0.035),
                    in: RoundedRectangle(cornerRadius: 10)
                )
                .accessibilityIdentifier(
                    "EpisodeCaptureCanonicalSources"
                )
            }

            DisclosureGroup("Technical binding") {
                Grid(
                    alignment: .leading,
                    horizontalSpacing: 12,
                    verticalSpacing: 4
                ) {
                    GridRow {
                        Text("Episode source")
                        Text(room.canonicalEpisodeSpaceID)
                            .textSelection(.enabled)
                    }
                    GridRow {
                        Text("Nest room")
                        Text(room.id)
                            .textSelection(.enabled)
                    }
                    GridRow {
                        Text("Call room")
                        Text(room.callRoomId)
                            .textSelection(.enabled)
                    }
                    if let participantID = room.participantId {
                        GridRow {
                            Text("Participant")
                            Text(participantID)
                                .textSelection(.enabled)
                        }
                    }
                    if let consentID = room.recordingConsentId {
                        GridRow {
                            Text("Consent")
                            Text(consentID)
                                .textSelection(.enabled)
                        }
                    }
                }
                .font(.caption.monospaced())
                .foregroundStyle(.secondary)
                .padding(.top, 6)
            }

            if let blockers = room.captureReadiness?.blockers,
               !blockers.isEmpty {
                Text("Hold evidence: \(blockers.joined(separator: " · "))")
                    .font(.caption.monospaced())
                    .foregroundStyle(.orange)
                    .textSelection(.enabled)
            }
        }
        .padding(12)
        .background(
            Color.primary.opacity(0.045),
            in: RoundedRectangle(cornerRadius: 12)
        )
    }

    private var header: some View {
        HStack(alignment: .center, spacing: 14) {
            Image(systemName: "waveform.and.person.filled")
                .font(.system(size: 30))
                .foregroundStyle(.tint)
            VStack(alignment: .leading, spacing: 3) {
                Text("Episode Capture Setup")
                    .font(.title2.weight(.bold))
                Text("Verify the exact local masters, camera reference, call route, and Canon handoff before recording.")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 5) {
                Text(model.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button(hardwareRefreshTitle) {
                    Task { await model.refresh(requestAccess: true) }
                }
                .disabled(
                    model.isRefreshing
                        || model.isRecording
                        || model.isFinalizing
                        || model.isImportingCanon
                        || model.isUploadingMaster
                        || audioRoom.isActive
                )
                .accessibilityIdentifier("EpisodeCaptureRefreshHardware")
            }
        }
        .padding(20)
    }

    @ViewBuilder
    private var routeSelectors: some View {
        if let inventory = model.inventory {
            GroupBox("Connected routes") {
                Grid(alignment: .leading, horizontalSpacing: 18, verticalSpacing: 14) {
                    GridRow {
                        Label("Camera", systemImage: "video.fill")
                        Picker("Camera", selection: $model.selectedVideoDeviceID) {
                            Text("No camera reference").tag(String?.none)
                            ForEach(inventory.videoDevices) { device in
                                Text(videoDeviceLabel(device)).tag(Optional(device.id))
                            }
                        }
                        .labelsHidden()
                        .disabled(
                            model.isRecording
                                || model.isFinalizing
                                || model.isImportingCanon
                                || model.isUploadingMaster
                                || audioRoom.isActive
                        )
                        .accessibilityIdentifier("EpisodeCaptureCameraPicker")
                    }
                    GridRow {
                        Label("Local master + call mic", systemImage: "mic.fill")
                        Picker("Local master and call mic", selection: $model.selectedAudioInputID) {
                            Text("Select an input").tag(String?.none)
                            ForEach(inventory.audioDevices.filter(\.hasInput)) { device in
                                Text(audioDeviceLabel(device, input: true)).tag(Optional(device.id))
                            }
                        }
                        .labelsHidden()
                        .disabled(
                            model.isRecording
                                || model.isFinalizing
                                || model.isImportingCanon
                                || model.isUploadingMaster
                                || audioRoom.isActive
                        )
                        .accessibilityIdentifier("EpisodeCaptureAudioInputPicker")
                    }
                    GridRow {
                        Label("Call + headphones", systemImage: "headphones")
                        Picker("Call and headphones", selection: $model.selectedAudioOutputID) {
                            Text("Select an output").tag(String?.none)
                            ForEach(inventory.audioDevices.filter(\.hasOutput)) { device in
                                Text(audioDeviceLabel(device, input: false)).tag(Optional(device.id))
                            }
                        }
                        .labelsHidden()
                        .disabled(
                            model.isRecording
                                || model.isFinalizing
                                || model.isImportingCanon
                                || model.isUploadingMaster
                                || audioRoom.isActive
                        )
                        .accessibilityIdentifier("EpisodeCaptureAudioOutputPicker")
                    }
                }
                .padding(10)
            }

            if inventory.cameraAuthorization != .authorized
                || inventory.microphoneAuthorization != .authorized {
                Label(
                    "Camera: \(inventory.cameraAuthorization.rawValue) · Microphone: \(inventory.microphoneAuthorization.rawValue). Use \(hardwarePermissionActionTitle) to request any undecided access.",
                    systemImage: "lock.trianglebadge.exclamationmark"
                )
                .foregroundStyle(.orange)
            }
        }
    }

    private var hardwareRefreshTitle: String {
        if model.isRefreshing {
            return "Refreshing…"
        }
        return hardwarePermissionActionTitle
    }

    private var hardwarePermissionActionTitle: String {
        guard let inventory = model.inventory else {
            return "Refresh hardware"
        }
        if inventory.cameraAuthorization == .notDetermined
            || inventory.microphoneAuthorization == .notDetermined {
            return "Grant camera + microphone"
        }
        return "Refresh hardware"
    }

    private var localMasterCard: some View {
        GroupBox("Local take") {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    TextField("Episode space ID", text: $model.episodeSpaceID)
                        .textFieldStyle(.roundedBorder)
                        .disabled(
                            model.isRecording
                                || model.isFinalizing
                                || model.isImportingCanon
                                || model.isUploadingMaster
                                || audioRoom.isActive
                                || model.selectedEpisodeRoom != nil
                        )
                        .accessibilityIdentifier("EpisodeCaptureEpisodeSpaceID")
                    TextField("Participant ID", text: $model.participantID)
                        .textFieldStyle(.roundedBorder)
                        .frame(maxWidth: 220)
                        .disabled(
                            model.isRecording
                                || model.isFinalizing
                                || model.isImportingCanon
                                || model.isUploadingMaster
                                || audioRoom.isActive
                                || model.selectedEpisodeRoom != nil
                        )
                        .accessibilityIdentifier("EpisodeCaptureParticipantID")
                }

                HStack(spacing: 10) {
                    Text("Capture group")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    Text(model.captureGroupID.uuidString.lowercased())
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                    Spacer()
                    Button("New capture group") {
                        model.beginNewCaptureGroup()
                    }
                    .disabled(
                        model.isRecording
                            || model.isFinalizing
                            || model.isImportingCanon
                            || model.isUploadingMaster
                            || model.isAuditingTake
                            || audioRoom.isActive
                    )
                    .accessibilityIdentifier("EpisodeCaptureNewGroup")
                }

                if model.captureGroupIsClosed {
                    Label(
                        "This take is closed. Canon/iPhone sources may still join this capture group, but another recording requires New capture group.",
                        systemImage: "lock.circle.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                }

                HStack(spacing: 12) {
                    if model.isRecording {
                        Button(role: .destructive) {
                            Task { await model.stopRecording() }
                        } label: {
                            Label(
                                "Stop and finalize every source",
                                systemImage: "stop.fill"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("EpisodeCaptureStopAudioMaster")
                    } else {
                        Button {
                            Task { await model.startRecording() }
                        } label: {
                            Label(
                                model.includeCameraReference
                                    ? "Record mic + camera reference"
                                    : "Record microphone master",
                                systemImage: "record.circle"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.red)
                        .disabled(!model.canStartRecording)
                        .accessibilityIdentifier("EpisodeCaptureStartAudioMaster")
                    }

                    if model.isRecording {
                        Label(
                            formatDuration(model.elapsedSeconds),
                            systemImage: "waveform.circle.fill"
                        )
                        .font(.title3.monospacedDigit().weight(.semibold))
                        .foregroundStyle(.red)
                        Text("REC")
                            .font(.caption.weight(.black))
                            .foregroundStyle(.red)
                    } else if model.isFinalizing {
                        ProgressView()
                            .controlSize(.small)
                        Text("Finalizing and hashing off the UI thread…")
                            .foregroundStyle(.secondary)
                    } else {
                        Text(
                            model.includeCameraReference
                                ? "48 kHz · 24-bit WAV master + silent camera-reference MOV"
                                : "48 kHz · 24-bit PCM WAV · pre-call local source"
                        )
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Show captures") {
                        NSWorkspace.shared.open(model.captureRoot)
                    }
                    .accessibilityIdentifier("EpisodeCaptureShowCaptures")
                }

                if model.isRecording,
                   let liveStatus =
                    model.activeAudioLiveStatus {
                    HStack(spacing: 8) {
                        Label(
                            liveStatus.routeContinuity.isLocked
                                ? "Exact microphone route locked"
                                : "Microphone route lost — holding take",
                            systemImage:
                                liveStatus.routeContinuity.isLocked
                                ? "checkmark.shield.fill"
                                : "exclamationmark.shield.fill"
                        )
                        .foregroundStyle(
                            liveStatus.routeContinuity.isLocked
                                ? .green
                                : .red
                        )
                        Text(
                            "\(liveStatus.frameCount.formatted()) frames · \(ByteCountFormatter.string(fromByteCount: liveStatus.byteCount ?? 0, countStyle: .file)) written"
                        )
                        .foregroundStyle(.secondary)
                        Spacer()
                    }
                    .font(.caption.monospacedDigit())
                    .accessibilityElement(
                        children: .combine
                    )
                    .accessibilityIdentifier(
                        "EpisodeCaptureAudioRouteContinuity"
                    )
                }

                if let error = model.recordingError {
                    Label(error, systemImage: "exclamationmark.octagon.fill")
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                HStack(alignment: .top, spacing: 8) {
                    Image(
                        systemName:
                            model.pendingRoomReceiptCount > 0
                                ? "arrow.triangle.2.circlepath.circle.fill"
                                : "checkmark.shield.fill"
                    )
                    .foregroundStyle(
                        model.pendingRoomReceiptCount > 0
                            ? .orange
                            : .green
                    )
                    VStack(alignment: .leading, spacing: 2) {
                        Text(model.roomReceiptMessage)
                            .font(.caption)
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                        if model.pendingRoomReceiptCount > 0 {
                            Text(
                                "\(model.pendingRoomReceiptCount) protected receipt(s) pending · local source bytes are never deleted."
                            )
                            .font(.caption2.monospacedDigit())
                            .foregroundStyle(.secondary)
                        }
                    }
                    Spacer()
                    if model.isRecoveringRoomReceipts {
                        ProgressView()
                            .controlSize(.small)
                    }
                }

                if let error = model.roomReceiptError {
                    Label(
                        error,
                        systemImage:
                            "arrow.triangle.2.circlepath.circle.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                }

                if !model.canStartRecording,
                   !model.isRecording,
                   !model.isFinalizing {
                    Text(recordingReadinessMessage)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let receipt = model.lastFinalizedReceipt {
                    Divider()
                    finalizedReceiptRow(receipt)
                    VStack(alignment: .leading, spacing: 7) {
                        if model.isUploadingMaster {
                            ProgressView(
                                value: model.uploadProgress
                            )
                        }
                        HStack(alignment: .top, spacing: 8) {
                            Label(
                                model.uploadMessage,
                                systemImage:
                                    model.audioUploadSystemImage
                            )
                            .font(.caption)
                            .foregroundStyle(
                                model.uploadError == nil
                                    ? Color.secondary
                                    : Color.orange
                            )
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                            Spacer()
                            if model.canUploadLastFinalizedMaster {
                                Button(
                                    model.activeUploadJob == nil
                                        ? "Upload to Episode Room"
                                        : "Retry upload"
                                ) {
                                    Task {
                                        await model
                                            .uploadLastFinalizedMaster()
                                    }
                                }
                                .disabled(model.isUploadingMaster)
                                .accessibilityIdentifier(
                                    "EpisodeCaptureUploadAudioMaster"
                                )
                            }
                        }
                        if let error = model.uploadError {
                            Text(error)
                                .font(.caption.monospaced())
                                .foregroundStyle(.orange)
                                .textSelection(.enabled)
                        }
                    }
                }

                if !model.interruptedRecordings.isEmpty {
                    Divider()
                    Label(
                        "\(model.interruptedRecordings.count) interrupted take(s) are preserved as partial WAV files. Review them before deleting or importing.",
                        systemImage: "lifepreserver.fill"
                    )
                    .font(.callout)
                    .foregroundStyle(.orange)
                }
            }
            .padding(10)
        }
        .accessibilityIdentifier("EpisodeCaptureLocalMaster")
    }

    private var takeAcceptanceCard: some View {
        GroupBox("Take acceptance") {
            VStack(alignment: .leading, spacing: 13) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Verify finalized sources before editing")
                            .font(.headline)
                        Text(
                            model.lastFinalizedVideoReceipt == nil
                                ? "Quipsly re-reads the finalized WAV, recomputes its SHA-256 digest, probes its production format and signal, and checks exact route, room, consent, START, and clock evidence. A camera is not required for audio-only work."
                                : "Quipsly re-reads the finalized WAV and silent MOV, recomputes both SHA-256 digests, probes their production formats, and checks exact take, room, consent, START, and capture-clock identity."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(
                            horizontal: false,
                            vertical: true
                        )
                    }
                    Spacer()
                    Button {
                        Task {
                            await model.auditLastFinalizedTake()
                        }
                    } label: {
                        if model.isAuditingTake {
                            Label(
                                "Verifying…",
                                systemImage: "hourglass"
                            )
                        } else {
                            Label(
                                "Verify take",
                                systemImage:
                                    "checkmark.shield"
                            )
                        }
                    }
                    .disabled(!model.canAuditLastFinalizedTake)
                    .accessibilityIdentifier(
                        "EpisodeCaptureAuditTake"
                    )
                }

                if model.isAuditingTake {
                    ProgressView(
                        "Reading every source byte and media header…"
                    )
                    .controlSize(.small)
                }

                if let receipt = model.lastTakeAudit {
                    Divider()
                    HStack(alignment: .top, spacing: 12) {
                        Image(
                            systemName:
                                receipt.disposition == .held
                                    ? "hand.raised.fill"
                                    : "checkmark.shield.fill"
                        )
                        .font(.title2)
                        .foregroundStyle(
                            receipt.disposition == .held
                                ? Color.orange
                                : Color.green
                        )
                        VStack(alignment: .leading, spacing: 5) {
                            Text(
                                receipt.disposition == .held
                                    ? "Take held"
                                    : "Machine checks passed"
                            )
                            .font(.headline)
                            Text(receipt.truth)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(
                                    horizontal: false,
                                    vertical: true
                                )
                            Text(
                                "\(receipt.checks.count - receipt.holdCount - receipt.warningCount) passed · \(receipt.warningCount) warning(s) · \(receipt.holdCount) hold(s)"
                            )
                            .font(.caption.monospacedDigit())
                            .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Button("Reveal receipt") {
                            NSWorkspace.shared
                                .activateFileViewerSelecting([
                                    URL(
                                        fileURLWithPath:
                                            receipt.receiptPath
                                    ),
                                ])
                        }
                        .accessibilityIdentifier(
                            "EpisodeCaptureRevealTakeAudit"
                        )
                    }

                    let attentionChecks = receipt.checks.filter {
                        $0.status != .pass
                    }
                    if !attentionChecks.isEmpty {
                        VStack(alignment: .leading, spacing: 6) {
                            ForEach(attentionChecks) { check in
                                Label(
                                    check.summary,
                                    systemImage:
                                        check.status == .hold
                                            ? "hand.raised.fill"
                                            : "exclamationmark.triangle.fill"
                                )
                                .font(.caption)
                                .foregroundStyle(
                                    check.status == .hold
                                        ? Color.orange
                                        : Color.secondary
                                )
                                .fixedSize(
                                    horizontal: false,
                                    vertical: true
                                )
                            }
                        }
                    }

                    Divider()
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Human review still required")
                            .font(.subheadline.weight(.semibold))
                        ForEach(
                            Array(
                                receipt.humanReviewRequired
                                    .enumerated()
                            ),
                            id: \.offset
                        ) { index, item in
                            Text("\(index + 1). \(item)")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(
                                    horizontal: false,
                                    vertical: true
                                )
                        }
                    }
                } else if let error = model.takeAuditError {
                    Label(
                        error,
                        systemImage: "exclamationmark.octagon.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(
                        horizontal: false,
                        vertical: true
                    )
                } else {
                    Label(
                        model.canAuditLastFinalizedTake
                            ? model.lastFinalizedVideoReceipt == nil
                                ? "The finalized microphone master is ready for an explicit audio-only acceptance check."
                                : "The finalized source pair is ready for an explicit acceptance check."
                            : "Finalize the microphone master and every enabled camera source to run take acceptance.",
                        systemImage: "waveform.and.magnifyingglass"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(
                        horizontal: false,
                        vertical: true
                    )
                }
            }
            .padding(10)
        }
        .accessibilityIdentifier(
            "EpisodeCaptureTakeAcceptance"
        )
    }

    private var editorHandoffCard: some View {
        GroupBox("Studio handoff") {
            VStack(alignment: .leading, spacing: 12) {
                HStack(alignment: .top, spacing: 12) {
                    Image(
                        systemName:
                            model.editorWorkingSession == nil
                                ? "rectangle.stack.badge.plus"
                                : "checkmark.rectangle.stack.fill"
                    )
                    .font(.title2)
                    .foregroundStyle(
                        model.editorWorkingSession == nil
                            ? Color.secondary
                            : Color.green
                    )
                    VStack(alignment: .leading, spacing: 5) {
                        Text(
                            model.editorWorkingSession == nil
                                ? "Preserve the editor handoff"
                                : "Reload-verified working session"
                        )
                        .font(.headline)
                        Text(
                            model.editorWorkingSession?.truth
                                ?? "After finalization, Quipsly writes the exact capture-backed project atomically, reloads it, and only then offers the normal Studio workspace. Source files and receipts remain separate and unchanged."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(
                            horizontal: false,
                            vertical: true
                        )
                    }
                    Spacer()
                }

                if model.isPersistingEditorSession {
                    ProgressView(
                        "Saving and reopening the exact project…"
                    )
                    .controlSize(.small)
                }

                if let receipt =
                    model.editorWorkingSession {
                    Text(receipt.name)
                        .font(.caption.monospaced())
                        .textSelection(.enabled)
                    HStack(spacing: 10) {
                        Button {
                            model.openCaptureInEditor()
                        } label: {
                            Label(
                                "Open in Studio",
                                systemImage:
                                    "rectangle.stack.fill"
                            )
                        }
                        .disabled(
                            !model.canOpenCaptureInEditor
                        )
                        .keyboardShortcut(
                            .return,
                            modifiers: [.command]
                        )
                        .accessibilityIdentifier(
                            "EpisodeCaptureOpenEditor"
                        )

                        Button("Reveal saved session") {
                            NSWorkspace.shared
                                .activateFileViewerSelecting([
                                    receipt.url,
                                ])
                        }
                        .accessibilityIdentifier(
                            "EpisodeCaptureRevealEditorSession"
                        )
                    }
                } else if !model.attachedLaneIDs.isEmpty {
                    Button {
                        Task {
                            _ =
                                await model
                                .persistCaptureEditorSession()
                        }
                    } label: {
                        Label(
                            "Retry durable handoff",
                            systemImage: "arrow.clockwise"
                        )
                    }
                    .disabled(
                        model.isPersistingEditorSession
                    )
                    .accessibilityIdentifier(
                        "EpisodeCaptureRetryEditorSession"
                    )
                }

                if let error = model.editorSessionError {
                    Label(
                        error,
                        systemImage:
                            "exclamationmark.triangle.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(.orange)
                    .fixedSize(
                        horizontal: false,
                        vertical: true
                    )
                }
            }
            .padding(10)
        }
        .accessibilityIdentifier(
            "EpisodeCaptureEditorHandoff"
        )
    }

    private var audioOnlyRoomCard: some View {
        let route = audioRoom.routeResolution(
            coreAudioInput: model.selectedAudioInput,
            coreAudioOutput: model.selectedAudioOutput
        )

        return GroupBox("Audio-only episode room") {
            VStack(alignment: .leading, spacing: 13) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Talk through the selected mic and headphones")
                            .font(.headline)
                        Text(
                            "No camera is sent. Joining never starts recording. LiveKit carries the conversation while Quipsly's 48 kHz/24-bit WAV recorder writes a separate local production master only when you press Record."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    Text(audioRoom.connectionStateLabel.uppercased())
                        .font(.caption2.weight(.black))
                        .padding(.horizontal, 9)
                        .padding(.vertical, 6)
                        .background(.quaternary, in: Capsule())
                }

                HStack(spacing: 10) {
                    TextField(
                        "Nest call-room ID",
                        text: $model.callRoomID
                    )
                    .textFieldStyle(.roundedBorder)
                    .disabled(
                        audioRoom.isActive
                            || model.selectedEpisodeRoom != nil
                    )
                    .accessibilityIdentifier(
                        "EpisodeCaptureCallRoomID"
                    )

                    Button(
                        audioRoom.isRefreshingDevices
                            ? "Refreshing…"
                            : "Refresh provider routes"
                    ) {
                        audioRoom.refreshProviderDevices()
                    }
                    .disabled(
                        audioRoom.isActive
                            || audioRoom.isRefreshingDevices
                            || model.isRecording
                    )
                    .accessibilityIdentifier(
                        "EpisodeCaptureRefreshProviderRoutes"
                    )

                    Button("Use selected devices for calls") {
                        let updated =
                            audioRoom.makeSelectedDevicesSystemCallRoute(
                                coreAudioInput: model.selectedAudioInput,
                                coreAudioOutput: model.selectedAudioOutput
                            )
                        guard updated else { return }
                        Task {
                            await model.refresh()
                            audioRoom.refreshProviderDevices()
                        }
                    }
                    .disabled(
                        audioRoom.isActive
                            || audioRoom.isRefreshingDevices
                            || model.isRecording
                    )
                    .accessibilityIdentifier(
                        "EpisodeCaptureMakeSystemCallRoute"
                    )
                }

                HStack(alignment: .top, spacing: 10) {
                    Image(
                        systemName: route.status == .ready
                            ? "checkmark.seal.fill"
                            : route.status == .rehearsalOnly
                                ? "testtube.2"
                                : "exclamationmark.triangle.fill"
                    )
                    .foregroundStyle(
                        route.status == .ready
                            ? .green
                            : route.status == .rehearsalOnly
                                ? .orange
                                : .red
                    )
                    VStack(alignment: .leading, spacing: 3) {
                        Text(
                            route.status.rawValue
                                .replacingOccurrences(
                                    of: "-",
                                    with: " "
                                )
                                .capitalized
                        )
                        .font(.caption.weight(.bold))
                        Text(route.truth)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                    }
                }

                HStack(alignment: .top, spacing: 18) {
                    selectedCallRoute(
                        title: "Local master + call mic",
                        device: model.selectedAudioInput,
                        icon: "mic.fill"
                    )
                    selectedCallRoute(
                        title: "Call + headphones",
                        device: model.selectedAudioOutput,
                        icon: "headphones"
                    )
                    Spacer()
                    VStack(alignment: .trailing, spacing: 3) {
                        Text("ACTIVE ROUTE")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.secondary)
                        Text(audioRoom.routeIntegrityLabel.uppercased())
                            .font(.caption.weight(.black))
                            .foregroundStyle(
                                audioRoom.routeIntegrityLabel == "Locked"
                                    ? .green
                                    : audioRoom.routeIntegrityLabel == "Lost"
                                        ? .red
                                        : .secondary
                            )
                    }
                }
                .padding(10)
                .background(.quaternary.opacity(0.45), in: RoundedRectangle(cornerRadius: 10))

                Text(
                    "The native WAV graph writes the selected mic without call processing or software sidetone. Monitor your own voice in MV7i hardware; Quipsly sends only the separate realtime copy to LiveKit. When LiveKit exposes only its Default proxies, “Use selected devices for calls” changes the macOS system input/output and requires exact Core Audio UID readback before Quipsly can join."
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

                HStack(spacing: 12) {
                    if audioRoom.isConnected {
                        Button {
                            Task {
                                await audioRoom.setMuted(
                                    !audioRoom.isMuted
                                )
                            }
                        } label: {
                            Label(
                                audioRoom.isMuted
                                    ? "Unmute call"
                                    : "Mute call",
                                systemImage: audioRoom.isMuted
                                    ? "mic.slash.fill"
                                    : "mic.fill"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier(
                            "EpisodeCaptureToggleCallMute"
                        )

                        Button(role: .destructive) {
                            Task { await audioRoom.disconnect() }
                        } label: {
                            Label("Leave room", systemImage: "phone.down.fill")
                        }
                        .accessibilityIdentifier(
                            "EpisodeCaptureLeaveAudioRoom"
                        )
                    } else {
                        Button {
                            Task {
                                await audioRoom.join(
                                    callRoomID: model.callRoomID,
                                    captureGroupID: model.captureGroupID,
                                    episodeSpaceID:
                                        model.episodeSpaceID,
                                    fallbackParticipantID:
                                        model.participantID,
                                    coreAudioInput:
                                        model.selectedAudioInput,
                                    coreAudioOutput:
                                        model.selectedAudioOutput,
                                    accountStore:
                                        nativeAccountStore,
                                    captureRoot: model.captureRoot
                                )
                            }
                        } label: {
                            Label(
                                audioRoom.isConnecting
                                    ? "Joining…"
                                    : route.status == .rehearsalOnly
                                        ? "Join rehearsal route"
                                        : "Join audio-only room",
                                systemImage: "phone.connection.fill"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(
                            audioRoom.isConnecting
                                || route.status == .blocked
                                || model.callRoomID
                                    .trimmingCharacters(
                                        in: .whitespacesAndNewlines
                                    )
                                    .isEmpty
                                || !nativeAccountStore.hasSavedSession
                        )
                        .accessibilityIdentifier(
                            "EpisodeCaptureJoinAudioRoom"
                        )
                    }

                    if audioRoom.isConnecting {
                        ProgressView()
                            .controlSize(.small)
                    }

                    Text(
                        nativeAccountStore.isVerified
                            ? "Nest: \(nativeAccountStore.userEmail)"
                            : nativeAccountStore.hasSavedSession
                                ? "Nest session saved; join will refresh it"
                                : "Connect Native Account in Workspace"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)

                    Spacer()

                    if audioRoom.isConnected {
                        Label(
                            "\(audioRoom.remoteParticipantCount) remote",
                            systemImage: "person.2.fill"
                        )
                        .font(.caption.monospacedDigit())
                    }
                }

                Text(audioRoom.statusText)
                    .font(.callout)
                    .foregroundStyle(
                        audioRoom.lastError == nil
                            ? Color.secondary
                            : Color.red
                    )
                    .fixedSize(horizontal: false, vertical: true)

                if let receiptURL = audioRoom.lastReceiptURL {
                    HStack(spacing: 8) {
                        Label(
                            "Route event receipt saved without provider credentials.",
                            systemImage: "doc.badge.checkmark"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        Spacer()
                        Button("Reveal receipt") {
                            NSWorkspace.shared
                                .activateFileViewerSelecting([
                                    receiptURL,
                                ])
                        }
                    }
                }
            }
            .padding(10)
        }
        .accessibilityIdentifier("EpisodeCaptureAudioOnlyRoom")
    }

    private func selectedCallRoute(
        title: String,
        device: CaptureAudioDeviceSnapshot?,
        icon: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Label(title, systemImage: icon)
                .font(.caption.weight(.bold))
            Text(device?.name ?? "Not selected")
                .font(.caption)
            if let device {
                Text(device.id)
                    .font(.caption2.monospaced())
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .truncationMode(.middle)
                    .help(device.id)
            }
        }
    }

    private var canonCardMasterCard: some View {
        GroupBox("Canon R8 camera-card masters") {
            VStack(alignment: .leading, spacing: 13) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Import the internally recorded camera files after the take.")
                            .font(.headline)
                        Text(
                            "Quipsly never edits the card. It copies each selected MP4, MOV, or MXF to managed storage, hashes both byte streams independently, and attaches only verified files. Cloud preservation is available only when the exact same take already has an applied START and consent boundary."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer()
                    Button {
                        chooseCanonCardOriginals()
                    } label: {
                        Label(
                            model.isImportingCanon
                                ? "Importing…"
                                : "Choose card originals…",
                            systemImage: "sdcard.fill"
                        )
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(
                        model.isRecording
                            || model.isFinalizing
                            || model.isImportingCanon
                            || model.isUploadingMaster
                    )
                    .accessibilityIdentifier("EpisodeCaptureChooseCanonOriginals")
                }

                if let progress = model.canonImportProgress {
                    VStack(alignment: .leading, spacing: 5) {
                        ProgressView(value: progress.fractionCompleted)
                        HStack {
                            Text(progress.phase.rawValue.capitalized)
                            Spacer()
                            Text(
                                "\(ByteCountFormatter.string(fromByteCount: progress.completedBytes, countStyle: .file)) / \(ByteCountFormatter.string(fromByteCount: progress.totalBytes, countStyle: .file))"
                            )
                        }
                        .font(.caption.monospacedDigit())
                        .foregroundStyle(.secondary)
                    }
                }

                Text(model.canonImportMessage)
                    .font(.callout)
                    .foregroundStyle(
                        model.canonImportError == nil
                            ? Color.secondary
                            : Color.orange
                    )

                if let error = model.canonImportError {
                    Label(error, systemImage: "exclamationmark.octagon.fill")
                        .font(.caption)
                        .foregroundStyle(.red)
                        .fixedSize(horizontal: false, vertical: true)
                }

                ForEach(model.importedCanonReceipts, id: \.importID) { receipt in
                    Divider()
                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "checkmark.seal.fill")
                            .foregroundStyle(.green)
                        VStack(alignment: .leading, spacing: 3) {
                            Text(receipt.sourceFileName)
                                .font(.headline)
                            Text(
                                "\(receipt.technicalProbe.width)×\(receipt.technicalProbe.height) · \(String(format: "%.2f", receipt.technicalProbe.nominalFrameRate)) fps · \(receipt.technicalProbe.videoCodec) · \(formatDuration(receipt.technicalProbe.durationSeconds))"
                            )
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            Text(
                                "SHA-256 \(receipt.managedOriginalSHA256?.prefix(16) ?? "missing")… · byte verified, alignment needed"
                            )
                            .font(.caption.monospaced())
                            .textSelection(.enabled)
                            Label(
                                receipt.roomBinding == nil
                                    ? "Local-only · no same-take Episode Room authority"
                                    : "Room-bound · same capture group, consent, and applied START",
                                systemImage:
                                    receipt.roomBinding == nil
                                        ? "externaldrive.fill"
                                        : "lock.shield.fill"
                            )
                            .font(.caption)
                            .foregroundStyle(
                                receipt.roomBinding == nil
                                    ? Color.orange
                                    : Color.secondary
                            )
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                            if let job = model
                                .canonUploadJobs[receipt.importID] {
                                Label(
                                    job.phase == .verified
                                        ? job.userFacingVerificationSummary
                                        : "Private-vault preservation: \(job.phase.rawValue)",
                                    systemImage: model
                                        .canonUploadSystemImage(
                                            for: receipt
                                        )
                                )
                                .font(.caption)
                                .foregroundStyle(.secondary)
                                .fixedSize(
                                    horizontal: false,
                                    vertical: true
                                )
                                if job.phase != .verified {
                                    ProgressView(
                                        value: model
                                            .canonUploadProgress[
                                                receipt.importID
                                            ] ?? 0
                                    )
                                }
                            }
                            if let error = model
                                .canonUploadErrors[receipt.importID] {
                                Text(
                                    "\(error) The managed original and receipt remain preserved locally."
                                )
                                    .font(.caption.monospaced())
                                    .foregroundStyle(.orange)
                                    .textSelection(.enabled)
                                    .fixedSize(
                                        horizontal: false,
                                        vertical: true
                                    )
                            }
                        }
                        Spacer()
                        VStack(alignment: .trailing, spacing: 8) {
                            if model.canUploadCanonOriginal(receipt) {
                                Button(
                                    model.canonUploadJobs[
                                        receipt.importID
                                    ] == nil
                                        ? "Preserve in Quipsly"
                                        : "Retry preservation"
                                ) {
                                    Task {
                                        await model
                                            .uploadCanonOriginal(
                                                receipt
                                            )
                                    }
                                }
                                .buttonStyle(.borderedProminent)
                                .disabled(model.isUploadingMaster)
                                .accessibilityIdentifier(
                                    "EpisodeCaptureUploadCanonOriginal-\(receipt.importID.uuidString.lowercased())"
                                )
                            }
                            Button("Reveal managed original") {
                                NSWorkspace.shared
                                    .activateFileViewerSelecting([
                                        URL(
                                            fileURLWithPath:
                                                receipt
                                                    .managedOriginalPath
                                        ),
                                    ])
                            }
                        }
                    }
                }
            }
            .padding(10)
        }
        .accessibilityIdentifier("EpisodeCaptureCanonCardMasters")
    }

    private func finalizedReceiptRow(
        _ receipt: ProductionAudioRecordingReceipt
    ) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "checkmark.seal.fill")
                .foregroundStyle(.green)
                .font(.title2)
            VStack(alignment: .leading, spacing: 4) {
                Text("Verified local master")
                    .font(.headline)
                Text(
                    "\(formatDuration(receipt.durationSeconds)) · \(receipt.channelCount) ch · \(ByteCountFormatter.string(fromByteCount: receipt.byteCount ?? 0, countStyle: .file))"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                Text("SHA-256 \(receipt.sha256?.prefix(16) ?? "missing")…")
                    .font(.caption.monospaced())
                    .textSelection(.enabled)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 8) {
                if let phase = model.activeUploadJob?.phase,
                   model.activeUploadJob?.id == receipt.recordingID {
                    Text(phase.rawValue.uppercased())
                        .font(.caption2.weight(.black))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(.quaternary, in: Capsule())
                }
                Button("Reveal take") {
                    NSWorkspace.shared.activateFileViewerSelecting([
                        URL(fileURLWithPath: receipt.audioPath)
                    ])
                }
                .accessibilityIdentifier(
                    "EpisodeCaptureRevealFinalizedTake"
                )
            }
        }
    }

    private var recordingReadinessMessage: String {
        if model.captureGroupIsClosed {
            return "This take already has a STOP boundary. Use New capture group before starting another recording."
        }
        if !model.isLocalOnlyCapture {
            guard let room = model.selectedEpisodeRoom else {
                return "Choose an authorized Episode Room or explicitly select Local-only / solo source."
            }
            guard model.episodeRoomCatalogIsFresh else {
                return "Refresh Episode Rooms successfully before recording this authorized session."
            }
            guard model.episodeRoomOwnerAccountID != nil else {
                return "Nest must return the verified account identity before Quipsly can journal START."
            }
            guard room.recordingConsentId != nil else {
                return "Nest must return the exact recording-consent receipt before Quipsly can journal START."
            }
            guard room.safeToRecordLocally else {
                return "\(room.readinessLabel): \(room.readinessDetail)"
            }
        }
        if model.inventory?.microphoneAuthorization != .authorized {
            return "Grant microphone access with Refresh hardware before recording."
        }
        guard let input = model.selectedAudioInput else {
            return "Select a local microphone master."
        }
        guard let sampleRate = input.nominalSampleRate,
              abs(sampleRate - ProductionAudioRecorder.targetSampleRate) < 1 else {
            return "\(input.name) must be configured for exactly 48 kHz before Quipsly will record."
        }
        if model.includeCameraReference {
            guard model.inventory?.cameraAuthorization
                    == .authorized else {
                return "Grant camera access with Refresh hardware before including a camera reference."
            }
            guard model.selectedVideoDevice != nil else {
                return "Choose a camera route or turn off Include camera reference."
            }
            guard model.cameraPreviewFormat != nil,
                  model.cameraPreviewError == nil else {
                return "Wait for the exact camera preview to become ready before recording."
            }
        }
        return "Enter both the episode space and participant identity."
    }

    private func roomPickerLabel(
        _ room: MacEpisodeRoomSummary
    ) -> String {
        let readiness = room.safeToRecordLocally
            ? "ready"
            : "recording held"
        let project = room.projectName?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if let project, !project.isEmpty {
            return "\(room.title) — \(project) — \(readiness)"
        }
        return "\(room.title) — \(readiness)"
    }

    private func episodeRoomURL(
        _ room: MacEpisodeRoomSummary
    ) -> URL? {
        guard let baseURL = nativeAccountStore.normalizedBaseURL,
              let projectSlug = nonempty(room.projectSlug),
              let episodeSlug = nonempty(room.episodeSlug) else {
            return nil
        }
        return baseURL
            .appendingPathComponent("nests", isDirectory: true)
            .appendingPathComponent(projectSlug, isDirectory: true)
            .appendingPathComponent("episodes", isDirectory: true)
            .appendingPathComponent(episodeSlug, isDirectory: false)
    }

    private func nonempty(_ value: String?) -> String? {
        let clean = value?
            .trimmingCharacters(in: .whitespacesAndNewlines)
        return clean?.isEmpty == false ? clean : nil
    }

    private func planSummary(_ plan: ProductionCapturePlan) -> some View {
        HStack(alignment: .top, spacing: 14) {
            Image(
                systemName: plan.status == .ready
                    ? "checkmark.seal.fill"
                    : plan.status == .blocked
                        ? "xmark.octagon.fill"
                        : "checklist.unchecked"
            )
            .font(.title)
            .foregroundStyle(
                plan.status == .ready
                    ? .green
                    : plan.status == .blocked
                        ? .red
                        : .orange
            )
            VStack(alignment: .leading, spacing: 5) {
                Text(planStatusTitle(plan.status))
                    .font(.headline)
                Text("Local audio target: \(plan.localAudioFormat)")
                    .font(.subheadline)
                ForEach(plan.nextActions, id: \.self) { action in
                    Text("• \(action)")
                        .foregroundStyle(.secondary)
                }
            }
            Spacer()
            Text("ROUTES + LOCAL MASTER")
                .font(.caption2.weight(.bold))
                .padding(.horizontal, 9)
                .padding(.vertical, 6)
                .background(.quaternary, in: Capsule())
        }
        .padding(16)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14))
        .accessibilityIdentifier("EpisodeCapturePlanSummary")
    }

    private func assessmentGrid(_ plan: ProductionCapturePlan) -> some View {
        LazyVGrid(
            columns: [GridItem(.flexible()), GridItem(.flexible())],
            alignment: .leading,
            spacing: 14
        ) {
            if let video = plan.video {
                assessmentCard(video, icon: "video.fill")
            } else {
                missingCard(
                    title: "Camera reference",
                    detail: "No camera route selected. Canon card recording can still be imported, but Quipsly cannot provide framing/reference evidence."
                )
            }
            if let audio = plan.audio {
                assessmentCard(audio, icon: "waveform")
            }
            if let callRoute = plan.callRoute {
                assessmentCard(callRoute, icon: "headphones")
            }
        }
    }

    private func assessmentCard(
        _ assessment: ProductionCaptureAssessment,
        icon: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack {
                Label(assessment.title, systemImage: icon)
                    .font(.headline)
                Spacer()
                Text(assessment.status.rawValue.replacingOccurrences(of: "Required", with: " required"))
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(statusColor(assessment.status))
            }
            Text(assessment.truth)
                .fixedSize(horizontal: false, vertical: true)
            ForEach(assessment.strengths, id: \.self) {
                Label($0, systemImage: "checkmark.circle")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            ForEach(assessment.warnings, id: \.self) {
                Label($0, systemImage: "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(.orange)
            }
            ForEach(assessment.blockers, id: \.self) {
                Label($0, systemImage: "xmark.octagon")
                    .font(.caption)
                    .foregroundStyle(.red)
            }
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(15)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 12))
    }

    private func missingCard(title: String, detail: String) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(title, systemImage: "questionmark.video")
                .font(.headline)
            Text(detail)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .topLeading)
        .padding(15)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 12))
    }

    private func ownershipCard(_ plan: ProductionCapturePlan) -> some View {
        GroupBox("Source ownership") {
            VStack(alignment: .leading, spacing: 8) {
                ForEach(plan.sourceOwnership, id: \.self) {
                    Label($0, systemImage: "lock.doc")
                        .font(.callout)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(10)
        }
    }

    private func videoDeviceLabel(_ device: CaptureVideoDeviceSnapshot) -> String {
        if let best = device.bestFormat {
            return "\(device.name) — \(best.label)"
        }
        return "\(device.name) — no reported format"
    }

    private func audioDeviceLabel(
        _ device: CaptureAudioDeviceSnapshot,
        input: Bool
    ) -> String {
        let channels = input ? device.inputChannels : device.outputChannels
        let rate = device.nominalSampleRate.map {
            " · \(Int($0.rounded())) Hz"
        } ?? ""
        let defaultLabel =
            (input && device.isDefaultInput) || (!input && device.isDefaultOutput)
                ? " · default"
                : ""
        return "\(device.name) · \(channels) ch\(rate)\(defaultLabel)"
    }

    private func planStatusTitle(
        _ status: ProductionCaptureAssessmentStatus
    ) -> String {
        switch status {
        case .ready: "Routes ready for rehearsal"
        case .reviewRequired: "Resolve these truths before the episode"
        case .blocked: "Capture is blocked"
        }
    }

    private func statusColor(
        _ status: ProductionCaptureAssessmentStatus
    ) -> Color {
        switch status {
        case .ready: .green
        case .reviewRequired: .orange
        case .blocked: .red
        }
    }

    private func formatDuration(_ seconds: Double) -> String {
        let total = max(0, Int(seconds.rounded(.down)))
        let hours = total / 3_600
        let minutes = (total % 3_600) / 60
        let remainingSeconds = total % 60
        if hours > 0 {
            return String(
                format: "%d:%02d:%02d",
                hours,
                minutes,
                remainingSeconds
            )
        }
        return String(format: "%02d:%02d", minutes, remainingSeconds)
    }

    private func chooseCanonCardOriginals() {
        let panel = NSOpenPanel()
        panel.title = "Choose Canon R8 camera-card originals"
        panel.prompt = "Verify and import"
        panel.message =
            "Select every internally recorded file for this take. Quipsly copies and verifies them; the card originals remain untouched."
        panel.allowedContentTypes = [.movie]
        panel.allowsMultipleSelection = true
        panel.canChooseDirectories = false
        panel.canChooseFiles = true
        panel.resolvesAliases = true

        guard panel.runModal() == .OK else { return }
        Task {
            await model.importCanonOriginals(panel.urls)
        }
    }
}
