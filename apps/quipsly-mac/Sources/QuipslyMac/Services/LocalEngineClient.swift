import Combine
import Foundation

final class LocalEngineClient: ObservableObject {
    @Published private(set) var connectionState: EngineConnectionState = .offline
    @Published private(set) var capabilities = LocalEngineCapabilities.offline
    @Published private(set) var visionLabStatus = VisionLabStatus.empty
    @Published private(set) var savedVisionManifests: [VisionDatasetManifestSummary] = []
    @Published private(set) var episodeImportJobs: [EpisodeImportJob] = []
    @Published private(set) var stagedPremierePackets: [PremierePacketStageRecord] = []
    @Published private(set) var knownPremiereImportSummaries: [KnownPremiereImportSummary] = []
    @Published private(set) var knownPremiereImportStatus = "Not refreshed yet"
    @Published private(set) var premiereRelinkStatus = "No recovery scan yet"
    @Published private(set) var lastPremiereRelinkResult: PremiereMediaRelinkRunResult?
    @Published private(set) var premiereSourceMaterializationStatus = "No source readiness check yet"
    @Published private(set) var lastPremiereSourceMaterializationResult: PremiereSourceMaterializationRunResult?
    @Published private(set) var premiereDraftSendMessages: [String: String] = [:]
    @Published private(set) var lastMessageAt: Date?
    @Published private(set) var launchStatus = "Local engine has not been started by Quipsly Mac."
    @Published var lastError: String?

    private var webSocket: URLSessionWebSocketTask?
    private var endpoint = URL(string: "ws://localhost:4000")!
    private var reconnectWorkItem: DispatchWorkItem?
    private var reconnectAttempt = 0
    private var managedEngineProcess: Process?
    private var managedEnginePipe: Pipe?
    private var isStartingManagedEngine = false
    private var stagedPremiereSourcePackets: [String: PremiereImportPacket] = [:]

    deinit {
        reconnectWorkItem?.cancel()
        managedEnginePipe?.fileHandleForReading.readabilityHandler = nil
        if managedEngineProcess?.isRunning == true {
            managedEngineProcess?.terminate()
        }
    }

    func connect(to endpointString: String) {
        reconnectWorkItem?.cancel()
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil

        guard let url = URL(string: endpointString) else {
            lastError = "Invalid local engine URL: \(endpointString)"
            connectionState = .offline
            return
        }

        endpoint = url
        connectionState = .connecting
        lastError = nil

        let task = URLSession.shared.webSocketTask(with: url)
        webSocket = task
        task.resume()

        send(type: "GET_STATUS")
        send(type: "GET_CAPABILITIES")
        send(type: "GET_VISION_LAB_STATUS")
        send(type: "GET_VISION_MANIFESTS")
        receiveLoop(for: task)
    }

    func disconnect() {
        reconnectWorkItem?.cancel()
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        connectionState = .offline
    }

    func refreshStatus() {
        guard webSocket != nil, connectionState != .offline else {
            connect(to: endpoint.absoluteString)
            return
        }

        send(type: "GET_STATUS")
        send(type: "GET_CAPABILITIES")
        send(type: "GET_VISION_LAB_STATUS")
        send(type: "GET_VISION_MANIFESTS")
    }

    func registerVisionDataset(path: String) {
        send(type: "REGISTER_VISION_DATASET", payload: ["folderPath": path])
    }

    func buildVisionManifest(path: String? = nil) {
        if let path, !path.isEmpty {
            send(type: "BUILD_VISION_MANIFEST", payload: ["folderPath": path])
        } else {
            send(type: "BUILD_VISION_MANIFEST")
        }
    }

    func computeVisionContentHashes() {
        send(type: "COMPUTE_VISION_CONTENT_HASHES")
    }

    func queueEpisodeImport(
        path: String,
        isFolder: Bool,
        projectSlug: String,
        episodeSlug: String,
        homeNestSlug: String,
        nestBaseURL: String,
        role: EpisodeImportRole,
        mediaCacheDir: String? = nil,
        recordingSyncMetadata: EpisodeRecordingSyncMetadata? = nil,
        autoRegisterAfterProxy: Bool = true
    ) {
        let job = EpisodeImportJob(
            path: path,
            isFolder: isFolder,
            projectSlug: projectSlug.trimmingCharacters(in: .whitespacesAndNewlines),
            episodeSlug: episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines),
            homeNestSlug: homeNestSlug.trimmingCharacters(in: .whitespacesAndNewlines),
            nestBaseURL: nestBaseURL.trimmingCharacters(in: .whitespacesAndNewlines),
            role: role,
            message: "Queued from Quipsly Mac. Waiting for probe/proxy/upload processing.",
            recordingSyncMetadata: recordingSyncMetadata,
            autoRegisterAfterProxy: autoRegisterAfterProxy,
            mediaCacheDir: mediaCacheDir?.trimmingCharacters(in: .whitespacesAndNewlines)
        )

        episodeImportJobs.insert(job, at: 0)
        startEpisodeImportPipeline(job)
    }

    @discardableResult
    func stagePremiereImportPacket(
        _ packet: PremiereImportPacket,
        homeNestSlug: String,
        nestBaseURL: String,
        mediaCacheDir: String? = nil,
        autoStartAvailableMedia: Bool
    ) -> (staged: Int, ready: Int, held: Int) {
        for media in packet.media {
            let jobId = "premiere-\(packet.projectSlug)-\(packet.episodeSlug)-\(media.id)"

            if var existing = episodeImportJobs.first(where: { $0.id == jobId }), existing.status == .registered {
                existing.message = "Already registered from this Premiere packet. Keeping the existing registration."
                upsertEpisodeImportJob(existing)
                continue
            }

            var job = EpisodeImportJob(
                id: jobId,
                path: media.localPath,
                isFolder: false,
                projectSlug: packet.projectSlug.trimmingCharacters(in: .whitespacesAndNewlines),
                episodeSlug: packet.episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines),
                homeNestSlug: homeNestSlug.trimmingCharacters(in: .whitespacesAndNewlines),
                nestBaseURL: nestBaseURL.trimmingCharacters(in: .whitespacesAndNewlines),
                role: packet.role(for: media),
                status: media.isLocallyAvailable ? .queued : .held,
                message: media.isLocallyAvailable
                    ? "Staged from Premiere packet. Ready for local probe/proxy/register."
                    : "Held from Premiere packet. \(media.holdReason)",
                mediaCacheDir: mediaCacheDir?.trimmingCharacters(in: .whitespacesAndNewlines)
            )

            job.displayName = media.displayName
            upsertEpisodeImportJob(job)

            if media.isLocallyAvailable && autoStartAvailableMedia {
                startEpisodeImportPipeline(job)
            }
        }

        let record = PremierePacketStageRecord(packet: packet, readyCount: packet.availableMedia.count, heldCount: packet.heldMedia.count)
        stagedPremiereSourcePackets[record.id] = packet
        stagedPremierePackets.removeAll { $0.id == record.id }
        stagedPremierePackets.insert(record, at: 0)

        lastError = nil
        return (packet.media.count, packet.availableMedia.count, packet.heldMedia.count)
    }

    func premiereDraftEdits() -> [PremiereDraftEditPacket] {
        stagedPremierePackets.compactMap { record in
            guard let packet = stagedPremiereSourcePackets[record.id] else { return nil }
            return PremiereDraftEditPacket.build(packet: packet, importJobs: episodeImportJobs)
        }
    }

    func premiereDraftEdit(projectSlug: String, episodeSlug: String) -> PremiereDraftEditPacket? {
        let safeProject = projectSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeEpisode = episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines)

        return premiereDraftEdits().first { draft in
            draft.projectSlug == safeProject && draft.episodeSlug == safeEpisode
        }
    }

    @discardableResult
    func stageKnownPremierePacket(
        episodeSlug: String,
        homeNestSlug: String,
        nestBaseURL: String,
        mediaCacheDir: String? = nil,
        autoStartAvailableMedia: Bool = false
    ) -> Bool {
        let safeEpisode = episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        guard let url = knownPremierePacketURL(for: safeEpisode) else {
            lastError = "No recovered Premiere packet found for \(safeEpisode)."
            return false
        }

        do {
            let packet = try JSONDecoder().decode(PremiereImportPacket.self, from: Data(contentsOf: url))
            stagePremiereImportPacket(
                packet,
                homeNestSlug: homeNestSlug,
                nestBaseURL: nestBaseURL,
                mediaCacheDir: mediaCacheDir,
                autoStartAvailableMedia: autoStartAvailableMedia
            )
            lastError = nil
            return true
        } catch {
            lastError = "Could not stage \(safeEpisode) Premiere packet: \(error.localizedDescription)"
            return false
        }
    }

    func knownPremierePacketURL(for episodeSlug: String) -> URL? {
        let safeEpisode = episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeEpisode.isEmpty else { return nil }

        for root in knownPremierePacketRootCandidates() {
            let url = root.appendingPathComponent("\(safeEpisode).json")
            if FileManager.default.fileExists(atPath: url.path) {
                return url
            }
        }

        return nil
    }

    func runKnownPremiereImports(projectSlug: String, only episodeSlug: String? = nil) {
        var payload: [String: Any] = [
            "projectSlug": projectSlug.trimmingCharacters(in: .whitespacesAndNewlines),
        ]
        if let episodeSlug, !episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            payload["only"] = episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        }

        knownPremiereImportStatus = episodeSlug == nil
            ? "Refreshing Episode 1-3 Premiere packets..."
            : "Refreshing \(episodeSlug!) Premiere packet..."
        send(type: "RUN_KNOWN_PREMIERE_IMPORTS", payload: payload)
    }

    func relinkPremierePacketMedia(packetPath: String, searchRoot: String, apply: Bool = true) {
        let safePacketPath = packetPath.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeSearchRoot = searchRoot.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !safePacketPath.isEmpty else {
            premiereRelinkStatus = "Choose a Premiere packet before searching for missing media."
            return
        }

        guard !safeSearchRoot.isEmpty else {
            premiereRelinkStatus = "Choose a folder to search for missing primary media."
            return
        }

        premiereRelinkStatus = "Searching \(safeSearchRoot) for missing primary media..."
        send(type: "RELINK_PREMIERE_PACKET_MEDIA", payload: [
            "packetPath": safePacketPath,
            "searchRoot": safeSearchRoot,
            "apply": apply,
        ])
    }

    func inspectPremierePacketSources(packetPath: String, requestDownloads: Bool = false, maxItems: Int? = nil) {
        let safePacketPath = packetPath.trimmingCharacters(in: .whitespacesAndNewlines)

        guard !safePacketPath.isEmpty else {
            premiereSourceMaterializationStatus = "Choose a Premiere packet before checking source readiness."
            return
        }

        var payload: [String: Any] = [
            "packetPath": safePacketPath,
            "requestDownloads": requestDownloads,
        ]
        if let maxItems, maxItems > 0 {
            payload["maxItems"] = maxItems
        }

        premiereSourceMaterializationStatus = requestDownloads
            ? "Requesting local downloads for primary timeline source blockers..."
            : "Checking primary timeline source readiness..."
        send(type: "MATERIALIZE_PREMIERE_PACKET_MEDIA", payload: payload)
    }

    func transcribeMedia(path: String) {
        send(type: "TRANSCRIBE_MEDIA", payload: [
            "path": path
        ])
    }

    func startQueuedEpisodeImports(projectSlug: String? = nil, episodeSlug: String? = nil) {
        let safeProjectSlug = projectSlug?.trimmingCharacters(in: .whitespacesAndNewlines)
        let safeEpisodeSlug = episodeSlug?.trimmingCharacters(in: .whitespacesAndNewlines)
        let queuedJobs = episodeImportJobs.filter { job in
            job.status == .queued
                && (safeProjectSlug?.isEmpty != false || job.projectSlug == safeProjectSlug)
                && (safeEpisodeSlug?.isEmpty != false || job.episodeSlug == safeEpisodeSlug)
        }

        guard !queuedJobs.isEmpty else {
            lastError = "No queued episode imports are waiting to start."
            return
        }

        for job in queuedJobs {
            var starting = job
            starting.message = "Starting local probe, proxy, upload, and Nest registration pipeline."
            upsertEpisodeImportJob(starting)
            startEpisodeImportPipeline(starting)
        }
    }

    func stagePremiereDraftEditInNest(_ draft: PremiereDraftEditPacket, nestBaseURL: String) {
        guard let url = episodeImportEndpoint(for: nestBaseURL) else {
            premiereDraftSendMessages[draft.id] = "Could not build the Nest draft-edit endpoint."
            return
        }

        do {
            let draftData = try JSONEncoder().encode(draft)
            let draftObject = try JSONSerialization.jsonObject(with: draftData)
            let body: [String: Any] = [
                "action": "stage-premiere-draft-edit",
                "projectSlug": draft.projectSlug,
                "episodeSlug": draft.episodeSlug,
                "draftEdit": draftObject,
            ]

            var request = URLRequest(url: url)
            request.httpMethod = "PATCH"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)

            premiereDraftSendMessages[draft.id] = "Sending safe draft edit to Nest..."

            NestCookieBridge.addCookies(to: request) { authenticatedRequest in
                URLSession.shared.dataTask(with: authenticatedRequest) { [weak self] data, response, error in
                    DispatchQueue.main.async {
                        guard let self else { return }

                        if let error {
                            self.premiereDraftSendMessages[draft.id] = "Nest draft staging failed safely: \(error.localizedDescription)"
                            return
                        }

                        let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                        guard let data else {
                            self.premiereDraftSendMessages[draft.id] = "Nest returned no response for draft staging."
                            return
                        }

                        if statusCode == 401 {
                            self.premiereDraftSendMessages[draft.id] = "Nest needs you to sign in inside Quipsly Mac before staging this draft edit."
                            return
                        }

                        if statusCode == 403 {
                            self.premiereDraftSendMessages[draft.id] = "Nest says this account cannot stage draft edits for this episode."
                            return
                        }

                        let root = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
                        if root?["ok"] as? Bool == true {
                            let clipCount = root?["timelineClipCount"] as? Int ?? draft.timelineClips.count
                            self.premiereDraftSendMessages[draft.id] = "Draft staged in Nest with \(clipCount) clip(s). Active timeline was not overwritten."
                        } else {
                            let message = root?["error"] as? String ?? "Unknown Nest response."
                            self.premiereDraftSendMessages[draft.id] = "Nest draft staging returned \(statusCode): \(message)"
                        }
                    }
                }.resume()
            }
        } catch {
            premiereDraftSendMessages[draft.id] = "Could not encode draft edit for Nest: \(error.localizedDescription)"
        }
    }

    func retryEpisodeImport(_ job: EpisodeImportJob, autoRegisterAfterProxy: Bool? = nil) {
        var retry = job
        retry.status = .queued
        retry.message = "Retry queued from Quipsly Mac."
        retry.probe = nil
        retry.proxy = nil
        retry.registration = nil
        if let autoRegisterAfterProxy {
            retry.autoRegisterAfterProxy = autoRegisterAfterProxy
        }

        upsertEpisodeImportJob(retry)
        startEpisodeImportPipeline(retry)
    }

    func attachEpisodeImportToTimeline(_ job: EpisodeImportJob, placement: EpisodeTimelineAttachPlacement, playheadSeconds: Double? = nil) {
        guard job.registration?.assetId != nil else {
            var updated = job
            updated.message = "Register this asset before adding it to the episode timeline."
            upsertEpisodeImportJob(updated)
            return
        }

        guard let url = episodeImportEndpoint(for: job.nestBaseURL) else {
            var updated = job
            updated.message = "Could not build the Nest timeline attach endpoint."
            upsertEpisodeImportJob(updated)
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "PATCH"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "action": "add-to-timeline",
            "projectSlug": job.projectSlug,
            "episodeSlug": job.episodeSlug,
            "assetId": job.registration?.assetId ?? "",
            "placement": placement.rawValue,
            "importJobId": job.id,
        ]

        if let playheadSeconds {
            body["playheadSeconds"] = playheadSeconds
        }

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        } catch {
            var updated = job
            updated.message = "Could not encode timeline attach request: \(error.localizedDescription)"
            upsertEpisodeImportJob(updated)
            return
        }

        var pending = job
        pending.message = placement == .afterLast
            ? "Adding this asset after the last timeline clip..."
            : "Adding this asset at the playhead and opening the editor..."
        upsertEpisodeImportJob(pending)

        NestCookieBridge.addCookies(to: request) { authenticatedRequest in
            URLSession.shared.dataTask(with: authenticatedRequest) { [weak self] data, response, error in
                DispatchQueue.main.async {
                    guard let self else { return }
                    var updated = job

                    if let error {
                        updated.message = "Timeline attach failed safely: \(error.localizedDescription)"
                        updated.timelineAttachResult = EpisodeTimelineAttachResult(ok: false, error: error.localizedDescription)
                        self.upsertEpisodeImportJob(updated)
                        return
                    }

                    let statusCode = (response as? HTTPURLResponse)?.statusCode ?? 0
                    guard let data else {
                        updated.message = "Timeline attach returned no response."
                        updated.timelineAttachResult = EpisodeTimelineAttachResult(ok: false, error: "No response")
                        self.upsertEpisodeImportJob(updated)
                        return
                    }

                    do {
                        var result = try JSONDecoder().decode(EpisodeTimelineAttachResult.self, from: data)
                        self.enrichNestHTTPFailure(&result, statusCode: statusCode)
                        updated.timelineAttachResult = result
                        if result.ok {
                            if result.alreadyAttached == true {
                                updated.message = "This asset was already on the timeline. Nothing was duplicated."
                            } else {
                                let startLabel = result.startIn.map { String(format: "%.1fs", $0) } ?? "the requested time"
                                updated.message = "Added to \(result.trackId ?? "timeline") at \(startLabel)."
                            }
                        } else {
                            updated.message = "Timeline attach returned \(statusCode): \(result.error ?? "unknown error")"
                        }
                    } catch {
                        if statusCode == 401 {
                            updated.message = "Nest needs you to sign in inside Quipsly Mac before it can update this episode timeline."
                            updated.timelineAttachResult = EpisodeTimelineAttachResult(
                                ok: false,
                                error: "Nest needs you to sign in inside Quipsly Mac before it can update this episode timeline.",
                                errorCode: "nest-auth-required",
                                recoverable: true
                            )
                        } else if statusCode == 403 {
                            updated.message = "Nest says this account does not have permission to update this episode timeline."
                            updated.timelineAttachResult = EpisodeTimelineAttachResult(
                                ok: false,
                                error: "Nest says this account does not have permission to update this episode timeline.",
                                errorCode: "nest-permission-denied",
                                recoverable: true
                            )
                        } else {
                            updated.message = "Timeline attach response could not be decoded."
                            updated.timelineAttachResult = EpisodeTimelineAttachResult(ok: false, error: error.localizedDescription)
                        }
                    }

                    self.upsertEpisodeImportJob(updated)
                }
            }.resume()
        }
    }

    private func enrichNestHTTPFailure(_ result: inout EpisodeTimelineAttachResult, statusCode: Int) {
        guard !result.ok else { return }

        if statusCode == 401 {
            result.errorCode = result.errorCode ?? "nest-auth-required"
            result.error = result.error ?? "Nest needs you to sign in inside Quipsly Mac before it can update this episode timeline."
            result.recoverable = result.recoverable ?? true
        } else if statusCode == 403 {
            result.errorCode = result.errorCode ?? "nest-permission-denied"
            result.error = result.error ?? "Nest says this account does not have permission to update this episode timeline."
            result.recoverable = result.recoverable ?? true
        } else if statusCode == 0 {
            result.errorCode = result.errorCode ?? "network-offline"
            result.error = result.error ?? "Nest could not be reached. Check the network connection and retry."
            result.recoverable = result.recoverable ?? true
        }
    }

    private func startEpisodeImportPipeline(_ job: EpisodeImportJob) {
        send(type: "QUEUE_EPISODE_IMPORT", payload: job.enginePayload)
        send(type: "PROBE_MEDIA_FILE", payload: job.enginePayload)
    }

    private func episodeImportEndpoint(for nestBaseURL: String) -> URL? {
        let fallback = "https://nest.quipsly.com"
        let base = nestBaseURL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? fallback : nestBaseURL
        guard var components = URLComponents(string: base) else { return nil }
        components.path = "/api/episode-production/import-media"
        components.queryItems = nil
        return components.url
    }

    private func knownPremierePacketRootCandidates() -> [URL] {
        var candidates: [URL] = [
            FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent("Dev/high-ground-studio/content/quipsly/premiere-imports", isDirectory: true),
        ]

        var cursor = Bundle.main.bundleURL
        for _ in 0..<8 {
            let possible = cursor
                .appendingPathComponent("content/quipsly/premiere-imports", isDirectory: true)
            candidates.append(possible)
            cursor.deleteLastPathComponent()
        }

        var seen = Set<String>()
        return candidates.filter { url in
            if seen.contains(url.path) { return false }
            seen.insert(url.path)
            return true
        }
    }

    func send(type: String, payload: [String: Any]? = nil) {
        guard let webSocket else {
            connectionState = .offline
            scheduleReconnect()
            return
        }

        var envelope: [String: Any] = ["type": type]
        if let payload {
            envelope["payload"] = payload
        }

        do {
            let data = try JSONSerialization.data(withJSONObject: envelope)
            let string = String(decoding: data, as: UTF8.self)
            webSocket.send(.string(string)) { [weak self] error in
                if let error {
                    DispatchQueue.main.async {
                        self?.lastError = error.localizedDescription
                        self?.connectionState = .offline
                        self?.webSocket = nil
                        self?.scheduleReconnect()
                    }
                }
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func receiveLoop(for task: URLSessionWebSocketTask) {
        task.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                DispatchQueue.main.async {
                    guard self.webSocket === task else { return }
                    self.lastMessageAt = Date()
                    self.connectionState = .online
                    self.reconnectAttempt = 0
                    self.lastError = nil
                    self.handle(message)
                }
                self.receiveLoop(for: task)

            case .failure(let error):
                DispatchQueue.main.async {
                    guard self.webSocket === task else { return }
                    self.lastError = error.localizedDescription
                    self.connectionState = .offline
                    self.webSocket = nil
                    self.scheduleReconnect()
                }
            }
        }
    }

    private func scheduleReconnect() {
        reconnectWorkItem?.cancel()
        startManagedLocalEngineIfNeeded()

        reconnectAttempt += 1
        let delay = min(pow(2.0, Double(min(reconnectAttempt, 4))), 15.0)
        let endpointString = endpoint.absoluteString
        let workItem = DispatchWorkItem { [weak self] in
            self?.connect(to: endpointString)
        }
        reconnectWorkItem = workItem
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: workItem)
    }

    private func startManagedLocalEngineIfNeeded() {
        guard endpoint.isLocalEngineEndpoint else {
            launchStatus = "External engine URL configured. Quipsly Mac will not start it automatically."
            return
        }

        if managedEngineProcess?.isRunning == true || isStartingManagedEngine {
            return
        }

        guard let localEngineDirectory = findLocalEngineDirectory() else {
            launchStatus = "Could not find apps/local-engine. Open Settings and confirm this app is running from the High Ground Studio workspace."
            return
        }

        isStartingManagedEngine = true
        launchStatus = "Starting local engine from \(localEngineDirectory.path)."

        let process = Process()
        process.currentDirectoryURL = localEngineDirectory
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.arguments = ["pnpm", "dev"]

        let pipe = Pipe()
        process.standardOutput = pipe
        process.standardError = pipe
        managedEnginePipe = pipe
        pipe.fileHandleForReading.readabilityHandler = { [weak self] handle in
            let data = handle.availableData
            guard !data.isEmpty else { return }
            let output = String(decoding: data, as: UTF8.self)
                .split(separator: "\n")
                .last
                .map(String.init)?
                .trimmingCharacters(in: .whitespacesAndNewlines)

            guard let output, !output.isEmpty else { return }
            DispatchQueue.main.async {
                self?.launchStatus = output
            }
        }

        process.terminationHandler = { [weak self] process in
            DispatchQueue.main.async {
                self?.managedEnginePipe?.fileHandleForReading.readabilityHandler = nil
                self?.managedEngineProcess = nil
                self?.isStartingManagedEngine = false
                self?.launchStatus = "Local engine exited with status \(process.terminationStatus)."
                self?.connectionState = .offline
            }
        }

        do {
            try process.run()
            managedEngineProcess = process
            isStartingManagedEngine = false
        } catch {
            isStartingManagedEngine = false
            launchStatus = "Could not start local engine: \(error.localizedDescription)"
        }
    }

    private func findLocalEngineDirectory() -> URL? {
        let fileManager = FileManager.default
        var candidates: [URL] = [
            fileManager.homeDirectoryForCurrentUser
                .appendingPathComponent("Dev/high-ground-studio/apps/local-engine", isDirectory: true),
        ]

        var cursor = Bundle.main.bundleURL
        for _ in 0..<10 {
            candidates.append(cursor.appendingPathComponent("apps/local-engine", isDirectory: true))
            candidates.append(cursor.appendingPathComponent("../local-engine", isDirectory: true))
            cursor.deleteLastPathComponent()
        }

        var seen = Set<String>()
        return candidates.first { url in
            let standardized = url.standardizedFileURL
            guard !seen.contains(standardized.path) else { return false }
            seen.insert(standardized.path)
            return fileManager.fileExists(atPath: standardized.appendingPathComponent("package.json").path)
        }?.standardizedFileURL
    }

    private func handle(_ message: URLSessionWebSocketTask.Message) {
        let data: Data

        switch message {
        case .data(let incomingData):
            data = incomingData
        case .string(let string):
            data = Data(string.utf8)
        @unknown default:
            return
        }

        do {
            guard
                let root = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                let type = root["type"] as? String
            else {
                return
            }

            let payloadData: Data
            if let payload = root["payload"] {
                payloadData = try JSONSerialization.data(withJSONObject: payload)
            } else {
                payloadData = Data("{}".utf8)
            }

            switch type {
            case "ENGINE_CAPABILITIES":
                capabilities = try JSONDecoder().decode(LocalEngineCapabilities.self, from: payloadData)
            case "VISION_LAB_STATUS":
                visionLabStatus = try JSONDecoder().decode(VisionLabStatus.self, from: payloadData)
            case "VISION_MANIFESTS_LIST":
                savedVisionManifests = try JSONDecoder().decode([VisionDatasetManifestSummary].self, from: payloadData)
            case "EPISODE_IMPORT_PROGRESS", "EPISODE_IMPORT_QUEUED":
                upsertEpisodeImportJob(try JSONDecoder().decode(EpisodeImportJob.self, from: payloadData))
            case "MEDIA_PROBE_RESULT":
                let job = try JSONDecoder().decode(EpisodeImportJob.self, from: payloadData).withDerivedRecordingEnd()
                upsertEpisodeImportJob(job)
                if job.probe?.ok == true {
                    send(type: "GENERATE_EPISODE_PROXY", payload: job.registrationPayload)
                }
            case "MEDIA_PROXY_RESULT":
                let job = try JSONDecoder().decode(EpisodeImportJob.self, from: payloadData).withDerivedRecordingEnd()
                upsertEpisodeImportJob(job)
                if job.proxy?.error == nil && job.autoRegisterAfterProxy != false {
                    send(type: "UPLOAD_REGISTER_EPISODE_MEDIA", payload: withNestSessionToken(job.registrationPayload))
                }
            case "MEDIA_REGISTER_RESULT":
                upsertEpisodeImportJob(try JSONDecoder().decode(EpisodeImportJob.self, from: payloadData))
            case "ENGINE_COMMAND_ERROR":
                if
                    let root = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
                    let message = root["message"] as? String
                {
                    lastError = message
                } else {
                    lastError = "Local Engine reported a command error."
                }
            case "PREMIERE_IMPORT_PROGRESS", "PREMIERE_IMPORT_RESULT":
                let result = try JSONDecoder().decode(KnownPremiereImportRunResult.self, from: payloadData)
                knownPremiereImportStatus = result.message
                if !result.summaries.isEmpty {
                    knownPremiereImportSummaries = result.summaries
                }
            case "PREMIERE_RELINK_PROGRESS":
                if
                    let root = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
                    let message = root["message"] as? String
                {
                    premiereRelinkStatus = message
                }
            case "PREMIERE_RELINK_RESULT":
                let result = try JSONDecoder().decode(PremiereMediaRelinkRunResult.self, from: payloadData)
                lastPremiereRelinkResult = result
                premiereRelinkStatus = result.plainEnglishSummary
                if let summary = result.summary {
                    knownPremiereImportSummaries.removeAll { $0.episodeSlug == summary.episodeSlug }
                    knownPremiereImportSummaries.insert(summary, at: 0)
                }
            case "PREMIERE_SOURCE_MATERIALIZATION_PROGRESS":
                if
                    let root = try JSONSerialization.jsonObject(with: payloadData) as? [String: Any],
                    let message = root["message"] as? String
                {
                    premiereSourceMaterializationStatus = message
                }
            case "PREMIERE_SOURCE_MATERIALIZATION_RESULT":
                let result = try JSONDecoder().decode(PremiereSourceMaterializationRunResult.self, from: payloadData)
                lastPremiereSourceMaterializationResult = result
                premiereSourceMaterializationStatus = result.plainEnglishSummary
            default:
                break
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func upsertEpisodeImportJob(_ job: EpisodeImportJob) {
        if let index = episodeImportJobs.firstIndex(where: { $0.id == job.id }) {
            episodeImportJobs[index] = job
        } else {
            episodeImportJobs.insert(job, at: 0)
        }
    }

    private func withNestSessionToken(_ payload: [String: Any]) -> [String: Any] {
        let token = NestSessionTokenStore.load()
        guard !token.isEmpty else { return payload }

        var nextPayload = payload
        nextPayload["nestSessionToken"] = token
        return nextPayload
    }
}

private extension URL {
    var isLocalEngineEndpoint: Bool {
        guard ["ws", "wss", "http", "https"].contains((scheme ?? "").lowercased()) else {
            return false
        }

        let localHosts = ["localhost", "127.0.0.1", "::1"]
        return localHosts.contains((host ?? "").lowercased())
    }
}
