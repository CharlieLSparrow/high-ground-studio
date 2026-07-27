import AppKit
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
    @Published private(set) var isRefreshing = false
    @Published private(set) var message = "Inspecting connected production sources…"
    @Published var episodeSpaceID = "high-ground-odyssey"
    @Published var participantID = "charlie"
    @Published var callRoomID = ""
    @Published private(set) var activeReceipt: ProductionAudioRecordingReceipt?
    @Published private(set) var lastFinalizedReceipt: ProductionAudioRecordingReceipt?
    @Published private(set) var interruptedRecordings: [InterruptedProductionAudioRecording] = []
    @Published private(set) var elapsedSeconds = 0.0
    @Published private(set) var isFinalizing = false
    @Published private(set) var recordingError: String?
    @Published private(set) var captureGroupID = UUID()
    @Published private(set) var isImportingCanon = false
    @Published private(set) var canonImportProgress: CanonCardImportProgress?
    @Published private(set) var canonImportMessage = "No camera-card originals imported."
    @Published private(set) var canonImportError: String?
    @Published private(set) var importedCanonReceipts: [CanonCardImportReceipt] = []
    @Published private(set) var attachedLaneIDs: [UUID] = []
    @Published private(set) var episodeRooms: [MacEpisodeRoomSummary] = []
    @Published private(set) var selectedEpisodeRoomID: String?
    @Published private(set) var isRefreshingEpisodeRooms = false
    @Published private(set) var episodeRoomMessage =
        "Connect the native account to load authorized Episode Rooms."
    @Published private(set) var episodeRoomError: String?
    @Published private(set) var isLocalOnlyCapture = false
    @Published private(set) var episodeRoomCatalogIsFresh = false

    let captureRoot = FileManager.default.homeDirectoryForCurrentUser
        .appendingPathComponent("Movies/QuipslyCaptures", isDirectory: true)

    private let recorder = ProductionAudioRecorder()
    private let projectStore: ProjectStore
    private let playbackEngine: PlaybackEngine
    let nativeAccountStore: QuipslyNativeAccountStore
    private var elapsedTask: Task<Void, Never>?

    init(
        projectStore: ProjectStore,
        playbackEngine: PlaybackEngine,
        nativeAccountStore: QuipslyNativeAccountStore
    ) {
        self.projectStore = projectStore
        self.playbackEngine = playbackEngine
        self.nativeAccountStore = nativeAccountStore
    }

    var isRecording: Bool { recorder.isRecording }

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

    var canStartRecording: Bool {
        guard !isRecording,
              !isFinalizing,
              !isImportingCanon,
              !isRefreshingEpisodeRooms,
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
                  selectedEpisodeRoom.safeToRecordLocally else {
                return false
            }
        } else if selectedEpisodeRoom != nil {
            return false
        }
        return abs(sampleRate - ProductionAudioRecorder.targetSampleRate) < 1
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
        message = requestAccess
            ? "Waiting for camera and microphone permission…"
            : "Reading exact Core Audio and camera routes…"
        let next = await ProductionCaptureInventoryProbe.snapshot(
            requestAccess: requestAccess
        )
        inventory = next
        resolveSelections(in: next)
        refreshInterruptedRecordings()
        message = "\(next.videoDevices.count) camera route(s) · \(next.audioDevices.count) Core Audio device(s)"
        isRefreshing = false
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

            episodeRooms = catalog.sessions ?? []
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
        } catch {
            episodeRoomCatalogIsFresh = false
            episodeRoomError = error.localizedDescription
            episodeRoomMessage =
                "Episode Room refresh needs attention. Existing local sources were not changed."
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
        }
        guard let input = selectedAudioInput else {
            recordingError = "Select the exact microphone/interface that will own this local master."
            return
        }
        recordingError = nil
        do {
            let receipt = try recorder.start(
                configuration: ProductionAudioRecordingConfiguration(
                    captureGroupID: captureGroupID,
                    episodeSpaceID: episodeSpaceID.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ),
                    participantID: participantID.trimmingCharacters(
                        in: .whitespacesAndNewlines
                    ),
                    inputDevice: input,
                    rootDirectory: captureRoot
                )
            )
            activeReceipt = receipt
            elapsedSeconds = 0
            message = "Writing an untouched local microphone master from \(input.name)…"
            startElapsedClock(startedAt: receipt.startedAt)
        } catch {
            recordingError = error.localizedDescription
            message = "Local master did not start."
            refreshInterruptedRecordings()
        }
    }

    func stopRecording() async {
        guard isRecording, !isFinalizing else { return }
        elapsedTask?.cancel()
        elapsedTask = nil
        isFinalizing = true
        recordingError = nil
        message = "Finalizing WAV and computing its SHA-256 receipt…"
        defer { isFinalizing = false }

        do {
            let receipt = try await recorder.stop()
            activeReceipt = receipt
            lastFinalizedReceipt = receipt
            elapsedSeconds = receipt.durationSeconds
            do {
                let laneID = try attachAudioMasterToEditor(receipt)
                attachedLaneIDs.append(laneID)
                message = "Local microphone master finalized, verified, and attached to the editor."
            } catch {
                recordingError =
                    "The local master is finalized and safe, but its editor attachment receipt failed: \(error.localizedDescription)"
                message = "Local microphone master is safe; editor attachment needs retry."
            }
        } catch {
            activeReceipt = recorder.activeReceipt
            recordingError = error.localizedDescription
            message = "The take was preserved but needs recovery review."
        }
        refreshInterruptedRecordings()
    }

    func beginNewCaptureGroup() {
        guard !isRecording, !isFinalizing, !isImportingCanon else { return }
        captureGroupID = UUID()
        activeReceipt = nil
        lastFinalizedReceipt = nil
        importedCanonReceipts = []
        attachedLaneIDs = []
        canonImportProgress = nil
        canonImportError = nil
        canonImportMessage = "New capture group ready."
        elapsedSeconds = 0
        message = "New episode capture group ready."
    }

    func importCanonOriginals(_ urls: [URL]) async {
        guard !urls.isEmpty, !isRecording, !isFinalizing, !isImportingCanon else {
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
        defer {
            isImportingCanon = false
            canonImportProgress = nil
        }

        var failures: [String] = []
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
                    "Verified and attached \(index + 1) of \(urls.count): \(receipt.sourceFileName)"
            } catch {
                failures.append("\(url.lastPathComponent): \(error.localizedDescription)")
            }
        }

        if failures.isEmpty {
            canonImportMessage =
                "\(urls.count) camera-card original(s) are byte verified and attached to the editor. Alignment and proxy review remain."
        } else {
            canonImportError = failures.joined(separator: "\n")
            canonImportMessage =
                "\(urls.count - failures.count) of \(urls.count) camera-card original(s) imported."
        }
    }

    func refreshInterruptedRecordings() {
        interruptedRecordings = ProductionAudioRecorder.interruptedRecordings(
            in: captureRoot
        )
    }

    private func startElapsedClock(startedAt: Date) {
        elapsedTask?.cancel()
        elapsedTask = Task { [weak self] in
            while !Task.isCancelled {
                guard let self else { return }
                self.elapsedSeconds = max(0, Date().timeIntervalSince(startedAt))
                try? await Task.sleep(for: .milliseconds(200))
            }
        }
    }

    private func attachAudioMasterToEditor(
        _ receipt: ProductionAudioRecordingReceipt
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
            sourceReceiptPath: receiptPath
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
        sourceReceiptPath: String
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
            sourceReceiptPath: sourceReceiptPath
        )
        let receipt = try projectStore.attachVerifiedCaptureSource(attachment)
        if let sequence = projectStore.activeSequence {
            playbackEngine.updateSourcePlayers(for: sequence)
        }
        return receipt.laneID
    }

    private func resolveSelections(in inventory: ProductionCaptureInventory) {
        if !inventory.videoDevices.contains(where: { $0.id == selectedVideoDeviceID }) {
            selectedVideoDeviceID =
                inventory.videoDevices.first {
                    $0.name.localizedCaseInsensitiveContains("Canon")
                        && $0.name.localizedCaseInsensitiveContains("R8")
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

struct EpisodeCaptureSetupView: View {
    private static let localOnlyRoomSelectionID =
        "__quipsly-local-only-source__"

    @StateObject private var model: EpisodeCaptureSetupModel
    @StateObject private var audioRoom = MacAudioRoomController()
    @ObservedObject private var nativeAccountStore:
        QuipslyNativeAccountStore

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
                    localMasterCard
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
        }
        .onDisappear {
            if model.isRecording {
                Task { await model.stopRecording() }
            }
            if audioRoom.isActive {
                Task { await audioRoom.disconnect() }
            }
        }
        .accessibilityIdentifier("EpisodeCaptureSetup")
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
                        Task { await model.refreshEpisodeRooms() }
                    }
                    .disabled(
                        model.isRefreshingEpisodeRooms
                            || model.isRecording
                            || model.isFinalizing
                            || model.isImportingCanon
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
                Text("Verify the exact local masters, call route, and Canon handoff before recording.")
                    .foregroundStyle(.secondary)
            }
            Spacer()
            VStack(alignment: .trailing, spacing: 5) {
                Text(model.message)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Button(model.isRefreshing ? "Refreshing…" : "Refresh hardware") {
                    Task { await model.refresh(requestAccess: true) }
                }
                .disabled(
                    model.isRefreshing
                        || model.isRecording
                        || model.isFinalizing
                        || model.isImportingCanon
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
                                || audioRoom.isActive
                        )
                        .accessibilityIdentifier("EpisodeCaptureCameraPicker")
                    }
                    GridRow {
                        Label("Local mic master", systemImage: "mic.fill")
                        Picker("Local mic master", selection: $model.selectedAudioInputID) {
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
                    "Camera: \(inventory.cameraAuthorization.rawValue) · Microphone: \(inventory.microphoneAuthorization.rawValue). Refresh hardware to request any undecided access.",
                    systemImage: "lock.trianglebadge.exclamationmark"
                )
                .foregroundStyle(.orange)
            }
        }
    }

    private var localMasterCard: some View {
        GroupBox("Local microphone master") {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 14) {
                    TextField("Episode space ID", text: $model.episodeSpaceID)
                        .textFieldStyle(.roundedBorder)
                        .disabled(
                            model.isRecording
                                || model.isFinalizing
                                || model.isImportingCanon
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
                            || audioRoom.isActive
                    )
                    .accessibilityIdentifier("EpisodeCaptureNewGroup")
                }

                HStack(spacing: 12) {
                    if model.isRecording {
                        Button(role: .destructive) {
                            Task { await model.stopRecording() }
                        } label: {
                            Label("Stop and finalize", systemImage: "stop.fill")
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("EpisodeCaptureStopAudioMaster")
                    } else {
                        Button {
                            Task { await model.startRecording() }
                        } label: {
                            Label("Record local master", systemImage: "record.circle")
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
                        Text("48 kHz · 24-bit PCM WAV · pre-call local source")
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    Button("Show captures") {
                        NSWorkspace.shared.open(model.captureRoot)
                    }
                    .accessibilityIdentifier("EpisodeCaptureShowCaptures")
                }

                if let error = model.recordingError {
                    Label(error, systemImage: "exclamationmark.octagon.fill")
                        .foregroundStyle(.red)
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
                    .disabled(audioRoom.isActive)
                    .accessibilityIdentifier(
                        "EpisodeCaptureRefreshProviderRoutes"
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

    private var canonCardMasterCard: some View {
        GroupBox("Canon R8 camera-card masters") {
            VStack(alignment: .leading, spacing: 13) {
                HStack(alignment: .top, spacing: 12) {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Import the internally recorded camera files after the take.")
                            .font(.headline)
                        Text(
                            "Quipsly never edits the card. It copies each selected MP4 or MOV to managed capture storage, hashes the card stream and managed copy independently, then attaches only verified files to the source timeline."
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
                                "SHA-256 \(receipt.managedOriginalSHA256?.prefix(16) ?? "missing")… · attached, alignment needed"
                            )
                            .font(.caption.monospaced())
                            .textSelection(.enabled)
                        }
                        Spacer()
                        Button("Reveal managed original") {
                            NSWorkspace.shared.activateFileViewerSelecting([
                                URL(fileURLWithPath: receipt.managedOriginalPath)
                            ])
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
            Button("Reveal take") {
                NSWorkspace.shared.activateFileViewerSelecting([
                    URL(fileURLWithPath: receipt.audioPath)
                ])
            }
            .accessibilityIdentifier("EpisodeCaptureRevealFinalizedTake")
        }
    }

    private var recordingReadinessMessage: String {
        if !model.isLocalOnlyCapture {
            guard let room = model.selectedEpisodeRoom else {
                return "Choose an authorized Episode Room or explicitly select Local-only / solo source."
            }
            guard model.episodeRoomCatalogIsFresh else {
                return "Refresh Episode Rooms successfully before recording this authorized session."
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
