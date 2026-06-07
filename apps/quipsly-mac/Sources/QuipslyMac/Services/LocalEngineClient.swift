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
    @Published private(set) var premiereDraftSendMessages: [String: String] = [:]
    @Published private(set) var lastMessageAt: Date?
    @Published var lastError: String?

    private var webSocket: URLSessionWebSocketTask?
    private var endpoint = URL(string: "ws://localhost:4000")!
    private var stagedPremiereSourcePackets: [String: PremiereImportPacket] = [:]

    func connect(to endpointString: String) {
        disconnect()

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

        connectionState = .online
        send(type: "GET_STATUS")
        send(type: "GET_CAPABILITIES")
        send(type: "GET_VISION_LAB_STATUS")
        send(type: "GET_VISION_MANIFESTS")
        receiveLoop()
    }

    func disconnect() {
        webSocket?.cancel(with: .goingAway, reason: nil)
        webSocket = nil
        connectionState = .offline
    }

    func refreshStatus() {
        send(type: "GET_STATUS")
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

    func queueEpisodeImport(path: String, isFolder: Bool, projectSlug: String, episodeSlug: String, homeNestSlug: String, nestBaseURL: String, role: EpisodeImportRole, recordingSyncMetadata: EpisodeRecordingSyncMetadata? = nil) {
        let job = EpisodeImportJob(
            path: path,
            isFolder: isFolder,
            projectSlug: projectSlug.trimmingCharacters(in: .whitespacesAndNewlines),
            episodeSlug: episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines),
            homeNestSlug: homeNestSlug.trimmingCharacters(in: .whitespacesAndNewlines),
            nestBaseURL: nestBaseURL.trimmingCharacters(in: .whitespacesAndNewlines),
            role: role,
            message: "Queued from Quipsly Mac. Waiting for probe/proxy/upload processing.",
            recordingSyncMetadata: recordingSyncMetadata
        )

        episodeImportJobs.insert(job, at: 0)
        startEpisodeImportPipeline(job)
    }

    @discardableResult
    func stagePremiereImportPacket(
        _ packet: PremiereImportPacket,
        homeNestSlug: String,
        nestBaseURL: String,
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
                    : "Held from Premiere packet. \(media.holdReason)"
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

    func retryEpisodeImport(_ job: EpisodeImportJob) {
        var retry = job
        retry.status = .queued
        retry.message = "Retry queued from Quipsly Mac."
        retry.probe = nil
        retry.proxy = nil
        retry.registration = nil

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

    func send(type: String, payload: [String: Any]? = nil) {
        guard let webSocket else { return }

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
                    }
                }
            }
        } catch {
            lastError = error.localizedDescription
        }
    }

    private func receiveLoop() {
        webSocket?.receive { [weak self] result in
            guard let self else { return }

            switch result {
            case .success(let message):
                DispatchQueue.main.async {
                    self.lastMessageAt = Date()
                    self.connectionState = .online
                    self.handle(message)
                }
                self.receiveLoop()

            case .failure(let error):
                DispatchQueue.main.async {
                    self.lastError = error.localizedDescription
                    self.connectionState = .offline
                }
            }
        }
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
                if job.proxy?.error == nil {
                    send(type: "UPLOAD_REGISTER_EPISODE_MEDIA", payload: withNestSessionToken(job.registrationPayload))
                }
            case "MEDIA_REGISTER_RESULT":
                upsertEpisodeImportJob(try JSONDecoder().decode(EpisodeImportJob.self, from: payloadData))
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
