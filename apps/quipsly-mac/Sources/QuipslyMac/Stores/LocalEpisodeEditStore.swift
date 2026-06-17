import AppKit
import Foundation

@MainActor
final class LocalEpisodeEditStore: ObservableObject {
  init() {
    loadExistingSessions()
    loadLatestSourceReadinessSummary()
  }

    @Published private(set) var sessions: [String: LocalEpisodeEditSession] = [:]
    @Published private(set) var lastStatus: String = "No local edit loaded yet."
    @Published private(set) var isRenderingProof: Bool = false
    @Published private(set) var lastRenderProofURL: URL?
    @Published private(set) var isRenderingDraftExport: Bool = false
    @Published private(set) var lastDraftExportURL: URL?
    @Published private(set) var isPublishing: Bool = false
    @Published private(set) var isCheckingSourceReadiness: Bool = false
    @Published private(set) var isWatchingSourceMaterialization: Bool = false
    @Published private(set) var sourceMaterializationWatchEpisodeSlugs: [String] = []
    @Published private(set) var lastSourceReadinessReportURL: URL?
    @Published private(set) var lastSourceReadinessSummary: LocalEpisodeSourceReadinessSummary?
    @Published private var undoStacks: [String: [LocalEpisodeEditUndoCheckpoint]] = [:]
    @Published private var redoStacks: [String: [LocalEpisodeEditUndoCheckpoint]] = [:]
    var diagnosticLogger: ((String) -> Void)?
    private let maxUndoDepth = 40

    func session(projectSlug: String, episodeSlug: String) -> LocalEpisodeEditSession? {
        sessions[sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)]
    }

    func reportStatus(_ message: String) {
        lastStatus = message
    }

    func ensureSession(from draft: PremiereDraftEditPacket) {
        let id = sessionID(projectSlug: draft.projectSlug, episodeSlug: draft.episodeSlug)
        if var existing = sessions[id] {
            if existing.refreshMediaLinks(from: draft) {
                sessions[id] = existing
                save(existing)
                lastStatus = "Refreshed local media links for \(draft.episodeSlug)."
            }
            return
        }

        if var loaded = loadSession(projectSlug: draft.projectSlug, episodeSlug: draft.episodeSlug) {
            let refreshed = loaded.refreshMediaLinks(from: draft)
            sessions[id] = loaded
            if refreshed {
                save(loaded)
                lastStatus = "Loaded saved local edit and refreshed media links for \(draft.episodeSlug)."
            } else {
                lastStatus = "Loaded saved local edit for \(draft.episodeSlug)."
            }
            return
        }

        let session = LocalEpisodeEditSession(draft: draft)
        sessions[id] = session
        save(session)
        lastStatus = "Created local edit session for \(draft.episodeSlug)."
    }

    func setClipActive(sessionID: String, clipID: String, isActive: Bool) {
        updateClip(sessionID: sessionID, clipID: clipID, label: isActive ? "activate decision" : "deactivate decision") { decision in
            decision.isActive = isActive
        }
    }

    func setClipShortsIncluded(sessionID: String, clipID: String, isIncluded: Bool) {
        updateClip(sessionID: sessionID, clipID: clipID, label: isIncluded ? "include in shorts" : "exclude from shorts") { decision in
            decision.isShortsIncluded = isIncluded
        }
    }

    func setClipVolume(sessionID: String, clipID: String, volume: Double) {
        updateClip(sessionID: sessionID, clipID: clipID, label: "change volume") { decision in
            decision.volume = volume
        }
    }

    private func updateSession(sessionID: String, label: String, mutate: (inout LocalEpisodeEditSession) -> Void) {
        guard var session = sessions[sessionID] else {
            return
        }

        let before = session
        mutate(&session)
        guard session != before else {
            lastStatus = "No local edit change was needed."
            return
        }

        session.updatedAt = Date().ISO8601Format()
        appendUndoCheckpoint(LocalEpisodeEditUndoCheckpoint(label: label, session: before), sessionID: sessionID)
        save(session)
        reportStatus("Applied local edit: \(label).")
    }

    func addTextOverlay(sessionID: String, title: String, startSec: Double, duration: Double) {
        updateSession(sessionID: sessionID, label: "add text overlay") { session in
            let id = UUID().uuidString
            let overlay = LocalEpisodeTextOverlay(id: id, title: title, startSec: startSec, endSec: startSec + duration)
            if session.textOverlays == nil {
                session.textOverlays = []
            }
            session.textOverlays?.append(overlay)
        }
    }

    func deleteTextOverlay(sessionID: String, overlayID: String) {
        updateSession(sessionID: sessionID, label: "delete text overlay") { session in
            session.textOverlays?.removeAll { $0.id == overlayID }
        }
    }

    func nudgeSourceIn(sessionID: String, clipID: String, delta: Double) {
        updateClip(sessionID: sessionID, clipID: clipID, label: "trim source in") { decision in
            let nextStart = max(0, min(decision.sourceEnd - 0.05, decision.sourceStart + delta))
            decision.sourceStart = nextStart
            decision.duration = max(0.05, decision.sourceEnd - decision.sourceStart)
        }
    }

    func nudgeSourceOut(sessionID: String, clipID: String, delta: Double) {
        updateClip(sessionID: sessionID, clipID: clipID, label: "trim source out") { decision in
            let nextEnd = max(decision.sourceStart + 0.05, decision.sourceEnd + delta)
            decision.sourceEnd = nextEnd
            decision.duration = max(0.05, decision.sourceEnd - decision.sourceStart)
        }
    }

    func nudgeClipStart(sessionID: String, clipID: String, delta: Double) {
        updateClip(sessionID: sessionID, clipID: clipID, label: "move decision") { decision in
            decision.timelineStart = max(0, decision.timelineStart + delta)
        }
    }

    func adjustClipMotion(sessionID: String, clipID: String, scaleDelta: Double = 0, xDelta: Double = 0, yDelta: Double = 0, opacityDelta: Double = 0) {
        updateClip(sessionID: sessionID, clipID: clipID, label: "adjust motion") { decision in
            var envelope = decision.motion ?? LocalEpisodeClipMotionEnvelope(
                schemaVersion: 1,
                keyframes: [],
                notes: "Local non-destructive motion metadata. Render/export can apply this later without changing source media."
            )
            var keyframes = envelope.keyframes ?? []
            var keyframe = keyframes.first ?? LocalEpisodeClipMotionKeyframe(
                time: 0,
                scale: 1,
                x: 0,
                y: 0,
                cropTop: nil,
                cropRight: nil,
                cropBottom: nil,
                cropLeft: nil,
                opacity: 1
            )

            keyframe.time = keyframe.time ?? 0
            keyframe.scale = clamped((keyframe.scale ?? 1) + scaleDelta, min: 0.1, max: 8)
            keyframe.x = (keyframe.x ?? 0) + xDelta
            keyframe.y = (keyframe.y ?? 0) + yDelta
            keyframe.opacity = clamped((keyframe.opacity ?? 1) + opacityDelta, min: 0, max: 1)

            if keyframes.isEmpty {
                keyframes.append(keyframe)
            } else {
                keyframes[0] = keyframe
            }

            envelope.schemaVersion = envelope.schemaVersion ?? 1
            envelope.keyframes = keyframes
            decision.motion = envelope
        }
    }

    func resetClipMotion(sessionID: String, clipID: String) {
        updateClip(sessionID: sessionID, clipID: clipID, label: "reset motion") { decision in
            decision.motion = nil
        }
    }

    func undoState(sessionID: String) -> LocalEpisodeUndoRedoState {
        LocalEpisodeUndoRedoState(
            canUndo: !(undoStacks[sessionID] ?? []).isEmpty,
            canRedo: !(redoStacks[sessionID] ?? []).isEmpty,
            undoLabel: undoStacks[sessionID]?.last?.label,
            redoLabel: redoStacks[sessionID]?.last?.label,
            undoCount: undoStacks[sessionID]?.count ?? 0,
            redoCount: redoStacks[sessionID]?.count ?? 0
        )
    }

    func undoLastChange(sessionID: String) {
        guard let current = sessions[sessionID],
              var stack = undoStacks[sessionID],
              let checkpoint = stack.popLast()
        else {
            lastStatus = "Nothing to undo."
            return
        }

        undoStacks[sessionID] = stack
        appendRedoCheckpoint(LocalEpisodeEditUndoCheckpoint(label: checkpoint.label, session: current), sessionID: sessionID)

        var restored = checkpoint.session
        restored.updatedAt = Date().ISO8601Format()
        sessions[sessionID] = restored
        save(restored)
        lastStatus = "Undid \(checkpoint.label)."
    }

    func redoLastChange(sessionID: String) {
        guard let current = sessions[sessionID],
              var stack = redoStacks[sessionID],
              let checkpoint = stack.popLast()
        else {
            lastStatus = "Nothing to redo."
            return
        }

        redoStacks[sessionID] = stack
        appendUndoCheckpoint(LocalEpisodeEditUndoCheckpoint(label: checkpoint.label, session: current), sessionID: sessionID, clearRedo: false)

        var restored = checkpoint.session
        restored.updatedAt = Date().ISO8601Format()
        sessions[sessionID] = restored
        save(restored)
        lastStatus = "Redid \(checkpoint.label)."
    }

    @discardableResult
    func splitClip(sessionID: String, clipID: String, at playhead: Double) -> String? {
        guard var session = sessions[sessionID],
              let index = session.editDecisions.firstIndex(where: { $0.id == clipID })
        else {
            return nil
        }

        let decision = session.editDecisions[index]
        let splitOffset = playhead - decision.timelineStart
        guard splitOffset > 0.05, splitOffset < decision.duration - 0.05 else {
            lastStatus = "Move the playhead inside the selected decision before splitting."
            return nil
        }

        let splitSourceTime = decision.sourceStart + splitOffset
        let splitStamp = Int((playhead * 1000).rounded())
        var left = decision
        var right = decision

        appendUndoCheckpoint(LocalEpisodeEditUndoCheckpoint(label: "split decision", session: session), sessionID: sessionID)

        left.duration = max(0.05, splitOffset)
        left.sourceEnd = splitSourceTime

        right.id = "\(decision.id)-split-\(splitStamp)"
        right.label = "\(decision.label) split"
        right.timelineStart = playhead
        right.duration = max(0.05, decision.duration - splitOffset)
        right.sourceStart = splitSourceTime
        right.sourceEnd = decision.sourceEnd

        session.editDecisions[index] = left
        session.editDecisions.insert(right, at: index + 1)
        session.updatedAt = Date().ISO8601Format()
        sessions[sessionID] = session
        save(session)
        lastStatus = "Split \(decision.label) at \(localEditClock(playhead))."
        return right.id
    }

    func copyJSON(sessionID: String) {
        guard let session = sessions[sessionID] else { return }
        do {
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            let data = try encoder.encode(session)
            NSPasteboard.general.clearContents()
            NSPasteboard.general.setString(String(decoding: data, as: UTF8.self), forType: .string)
            lastStatus = "Copied \(session.episodeSlug) local edit JSON."
        } catch {
            lastStatus = "Could not copy local edit JSON: \(error.localizedDescription)"
        }
    }

    func revealOnDisk(sessionID: String) {
        guard let session = sessions[sessionID] else { return }
        let url = sessionURL(projectSlug: session.projectSlug, episodeSlug: session.episodeSlug)
        save(session)
        NSWorkspace.shared.activateFileViewerSelecting([url])
        lastStatus = "Revealed \(session.episodeSlug) local edit JSON."
    }

    func revealPlaybackCache(sessionID: String, workspacePath: String? = nil) {
        guard let session = sessions[sessionID] else { return }
        let url = playbackCacheURL(projectSlug: session.projectSlug, episodeSlug: session.episodeSlug, workspacePath: workspacePath)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        NSWorkspace.shared.activateFileViewerSelecting([url])
        lastStatus = "Revealed \(session.episodeSlug) playback cache."
    }

    @discardableResult
    func prepareRenderManifest(sessionID: String, isShortsMode: Bool = false) -> LocalEpisodeRenderPrepManifest? {
        guard let session = sessions[sessionID] else {
            lastStatus = "No local edit session is loaded."
            return nil
        }

        let manifest = renderPrepManifest(for: session, isShortsMode: isShortsMode)
        let url = renderPrepManifestURL(projectSlug: session.projectSlug, episodeSlug: session.episodeSlug)

        do {
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(manifest).write(to: url, options: .atomic)
            lastStatus = manifest.blockers.isEmpty
                ? "Prepared render manifest for \(session.episodeSlug). Renderer integration can consume this next."
                : "Prepared render manifest for \(session.episodeSlug) with \(manifest.blockers.count) blocker\(manifest.blockers.count == 1 ? "" : "s")."
            return manifest
        } catch {
            lastStatus = "Could not prepare render manifest: \(error.localizedDescription)"
            return nil
        }
    }

    func revealRenderPrep(sessionID: String, isShortsMode: Bool = false) {
        guard let session = sessions[sessionID] else { return }
        let url = renderPrepManifestURL(projectSlug: session.projectSlug, episodeSlug: session.episodeSlug)
        if !FileManager.default.fileExists(atPath: url.path) {
            _ = prepareRenderManifest(sessionID: sessionID, isShortsMode: isShortsMode)
        }
        NSWorkspace.shared.activateFileViewerSelecting([url])
        lastStatus = "Revealed \(session.episodeSlug) render-prep manifest."
    }

    func renderProofClip(sessionID: String, start: Double, duration: Double = 8, isShortsMode: Bool = false, mediaWorkspacePath: String? = nil) {
        guard let session = sessions[sessionID] else {
            lastStatus = "No local edit session is loaded."
            return
        }

        guard !isRenderingProof else {
            lastStatus = "A proof render is already running."
            return
        }

        _ = prepareRenderManifest(sessionID: sessionID, isShortsMode: isShortsMode)
        isRenderingProof = true
        lastStatus = "Rendering a \(Int(duration.rounded()))s proof decision for \(session.episodeSlug)..."

        let safeStart = max(0, start)
        let safeDuration = min(max(1, duration), 30)
        let projectSlug = session.projectSlug
        let episodeSlug = session.episodeSlug

        Task.detached { [projectSlug, episodeSlug, safeStart, safeDuration, mediaWorkspacePath] in
            let result = Self.runProofRenderProcess(
                projectSlug: projectSlug,
                episodeSlug: episodeSlug,
                start: safeStart,
                duration: safeDuration,
                mediaWorkspacePath: mediaWorkspacePath
            )

            await MainActor.run {
                self.isRenderingProof = false

                if result.ok, let outputPath = result.outputPath {
                    let outputURL = URL(fileURLWithPath: outputPath)
                    self.lastRenderProofURL = outputURL
                    self.lastStatus = "Proof render ready: \(outputURL.lastPathComponent)."
                } else {
                    self.lastStatus = "Proof render failed: \(result.message)"
                }
            }
        }
    }

    func renderDraftExport(sessionID: String, width: Int = 1280, height: Int = 720, isShortsMode: Bool = false, mediaWorkspacePath: String? = nil) {
        guard let session = sessions[sessionID] else {
            lastStatus = "No local edit session is loaded."
            return
        }

        _ = prepareRenderManifest(sessionID: sessionID, isShortsMode: isShortsMode)
        isRenderingDraftExport = true
        lastStatus = "Starting local full-draft render for \(session.episodeSlug)..."

        let projectSlug = session.projectSlug
        let episodeSlug = session.episodeSlug
        Task.detached { [projectSlug, episodeSlug, mediaWorkspacePath, width, height] in
            let result = Self.runDraftExportProcess(
                projectSlug: projectSlug,
                episodeSlug: episodeSlug,
                width: width,
                height: height,
                mediaWorkspacePath: mediaWorkspacePath
            )

            await MainActor.run {
                self.isRenderingDraftExport = false

                if result.ok, let outputPath = result.outputPath {
                    let outputURL = URL(fileURLWithPath: outputPath)
                    self.lastDraftExportURL = outputURL
                    self.lastStatus = "Draft export ready: \(outputURL.lastPathComponent)."
                } else {
                    self.lastStatus = "Draft export failed: \(result.message)"
                }
            }
        }
    }

    func publishToWorldHub(sessionID: String, mediaWorkspacePath: String? = nil) {
        guard let session = sessions[sessionID] else {
            lastStatus = "No local edit session is loaded."
            return
        }

        guard let exportURL = lastDraftExportURL else {
            lastStatus = "No draft export found to publish."
            return
        }

        guard !isPublishing else {
            lastStatus = "Already publishing to WorldHub."
            return
        }

        isPublishing = true
        lastStatus = "Publishing \(session.episodeSlug) to WorldHub. This will upload the MP4 and trigger social distribution..."

        let projectSlug = session.projectSlug
        let episodeSlug = session.episodeSlug
        let exportPath = exportURL.path

        Task.detached { [projectSlug, episodeSlug, exportPath, mediaWorkspacePath] in
            let result = Self.runPublishProcess(
                projectSlug: projectSlug,
                episodeSlug: episodeSlug,
                exportPath: exportPath,
                mediaWorkspacePath: mediaWorkspacePath
            )

            await MainActor.run {
                self.isPublishing = false

                if result.ok {
                    self.lastStatus = "Successfully published to WorldHub."
                } else {
                    self.lastStatus = "Publish failed: \(result.message)"
                }
            }
        }
    }

    func revealLastRenderProof() {
        guard let url = lastRenderProofURL else {
            lastStatus = "No proof render has completed yet."
            return
        }

        NSWorkspace.shared.activateFileViewerSelecting([url])
        lastStatus = "Revealed proof render: \(url.lastPathComponent)."
    }

    func revealLastDraftExport() {
        guard let url = lastDraftExportURL else {
            lastStatus = "No draft export has completed yet."
            return
        }

        NSWorkspace.shared.activateFileViewerSelecting([url])
        lastStatus = "Revealed draft export: \(url.lastPathComponent)."
    }

    func copyFullDraftExportCommand(sessionID: String) {
        guard let session = sessions[sessionID] else {
            lastStatus = "No local edit session is loaded."
            return
        }

        let repoRoot = Self.developmentRepoRootURL()?.path ?? "/Users/wall-e/Dev/high-ground-studio"
        let command = [
            "cd \(Self.shellQuote(repoRoot))",
            "node apps/quipsly-mac/script/render_program_chunked_export.mjs",
            Self.shellQuote(session.projectSlug),
            Self.shellQuote(session.episodeSlug),
            "--width 1280",
            "--height 720",
            "--fps 24",
            "--chunk-seconds 60",
            "--chunk-timeout-ms 180000",
        ].joined(separator: " ")

        NSPasteboard.general.clearContents()
        NSPasteboard.general.setString(command, forType: .string)
        lastStatus = "Copied guarded full-draft export command for \(session.episodeSlug)."
    }

    func startSourceMaterializationWatch(sessionID: String, includeFirstThreeEpisodes: Bool = false, mediaWorkspacePath: String? = nil) {
        guard let session = sessions[sessionID] else {
            lastStatus = "No local edit session is loaded."
            return
        }

        guard !isWatchingSourceMaterialization else {
            lastStatus = "A source materialization watcher is already running."
            return
        }

        let projectSlug = session.projectSlug
        let episodeSlugs = includeFirstThreeEpisodes
            ? ["episode-1", "episode-2", "episode-3"]
            : [session.episodeSlug]
        let maxWaitSeconds = includeFirstThreeEpisodes ? 3600 : 1800

        isWatchingSourceMaterialization = true
        sourceMaterializationWatchEpisodeSlugs = episodeSlugs
        lastStatus = includeFirstThreeEpisodes
            ? "Watching Episodes 1-3 source downloads and requesting local bytes..."
            : "Watching \(session.episodeSlug) source downloads and requesting local bytes..."

        Task.detached { [projectSlug, episodeSlugs, maxWaitSeconds, mediaWorkspacePath] in
            let result = Self.runSourceMaterializationWatchProcess(
                projectSlug: projectSlug,
                episodeSlugs: episodeSlugs,
                maxWaitSeconds: maxWaitSeconds,
                mediaWorkspacePath: mediaWorkspacePath
            )

            await MainActor.run {
                self.isWatchingSourceMaterialization = false
                self.sourceMaterializationWatchEpisodeSlugs = []

                if let outputPath = result.outputPath {
                    self.lastSourceReadinessReportURL = URL(fileURLWithPath: outputPath)
                }
                self.lastSourceReadinessSummary = result.summary

                if result.ok {
                    self.lastStatus = result.outputPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent }.map {
                        "Source watcher finished cleanly: \($0)."
                    } ?? "Source watcher finished cleanly."
                } else {
                    self.lastStatus = result.outputPath.flatMap { URL(fileURLWithPath: $0).lastPathComponent }.map {
                        "Source watcher still found blockers. Report saved: \($0)."
                    } ?? "Source watcher still found blockers: \(result.message)"
                }
            }
        }
    }

    func refreshSourceReadiness(sessionID: String, includeFirstThreeEpisodes: Bool = false, mediaWorkspacePath: String? = nil) {
        guard let session = sessions[sessionID] else {
            lastStatus = "No local edit session is loaded."
            return
        }

        guard !isCheckingSourceReadiness else {
            lastStatus = "A source readiness check is already running."
            return
        }

        isCheckingSourceReadiness = true
        lastStatus = includeFirstThreeEpisodes
            ? "Checking source readiness for Episodes 1-3..."
            : "Checking source readiness for \(session.episodeSlug)..."

        let projectSlug = session.projectSlug
        let episodeSlugs = includeFirstThreeEpisodes
            ? ["episode-1", "episode-2", "episode-3"]
            : [session.episodeSlug]

        Task.detached { [projectSlug, episodeSlugs, mediaWorkspacePath] in
            let result = Self.runSourceReadinessAuditProcess(
                projectSlug: projectSlug,
                episodeSlugs: episodeSlugs,
                mediaWorkspacePath: mediaWorkspacePath
            )

            await MainActor.run {
                self.isCheckingSourceReadiness = false

                if let outputPath = result.outputPath {
                    self.lastSourceReadinessReportURL = URL(fileURLWithPath: outputPath)
                }
                self.lastSourceReadinessSummary = result.summary

                if let summary = result.summary {
                    self.lastStatus = summary.ok
                        ? "Source readiness is clean for \(summary.episodeLabel)."
                        : "Source readiness checked: \(summary.blockerCount) blocker\(summary.blockerCount == 1 ? "" : "s") for \(summary.episodeLabel)."
                } else {
                    self.lastStatus = "Source readiness check finished: \(result.message)"
                }
            }
        }
    }

    func revealLastSourceReadinessReport() {
        guard let url = lastSourceReadinessReportURL else {
            lastStatus = "No source readiness report has completed yet."
            return
        }

        NSWorkspace.shared.activateFileViewerSelecting([url])
        lastStatus = "Revealed source readiness report: \(url.lastPathComponent)."
    }

    @discardableResult
    func relinkMissingMediaPaths(sessionID: String) -> LocalEpisodeRelinkResult {
        guard var session = sessions[sessionID] else {
            let result = LocalEpisodeRelinkResult(
                checkedUniqueMissingPaths: 0,
                resolvedUniquePaths: 0,
                changedClips: 0,
                unresolvedFileNames: ["No local edit session is loaded."]
            )
            lastStatus = "No local edit session is loaded."
            return result
        }
        diagnosticLogger?("relink session loaded decisions=\(session.editDecisions.count)")

        diagnosticLogger?("relink unique path scan start")
        let uniqueMediaPaths = Set(
            session.editDecisions
                .filter { $0.isActive && ($0.trackId.hasPrefix("V") || $0.trackId.hasPrefix("A")) }
                .compactMap(\.localMediaPath)
                .filter { !$0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }
        )
        diagnosticLogger?("relink unique path scan done unique=\(uniqueMediaPaths.count)")
        diagnosticLogger?("relink missing path check start")
        let missingPaths = uniqueMediaPaths
            .filter { !quipslyFileExists(atPath: $0) }
            .sorted()
        diagnosticLogger?("relink missing path check done missing=\(missingPaths.count)")

        guard !missingPaths.isEmpty else {
            let result = LocalEpisodeRelinkResult(
                checkedUniqueMissingPaths: 0,
                resolvedUniquePaths: 0,
                changedClips: 0,
                unresolvedFileNames: []
            )
            lastStatus = "All linked media paths already exist for \(session.episodeSlug)."
            return result
        }

        let resolutions = Dictionary(uniqueKeysWithValues: missingPaths.compactMap { (missingPath: String) -> (String, String)? in
            let fileName = URL(fileURLWithPath: missingPath).lastPathComponent
            diagnosticLogger?("relink candidate search start file=\(fileName)")
            guard let candidate = bestMediaCandidate(fileName: fileName, episodeSlug: session.episodeSlug) else {
                diagnosticLogger?("relink candidate search unresolved file=\(fileName)")
                return nil
            }
            diagnosticLogger?("relink candidate search resolved file=\(fileName) candidate=\(candidate)")
            return (missingPath, candidate)
        })

        var changedClips = 0
        for index in session.editDecisions.indices {
            guard let currentPath = session.editDecisions[index].localMediaPath,
                  let replacementPath = resolutions[currentPath]
            else {
                continue
            }

            session.editDecisions[index].localMediaPath = replacementPath
            session.editDecisions[index].mediaExists = true
            changedClips += 1
        }

        let unresolvedFileNames = missingPaths
            .filter { resolutions[$0] == nil }
            .map { URL(fileURLWithPath: $0).lastPathComponent }
            .sorted()

        if changedClips > 0 {
            session.updatedAt = Date().ISO8601Format()
            sessions[sessionID] = session
            save(session)
        }

        let result = LocalEpisodeRelinkResult(
            checkedUniqueMissingPaths: missingPaths.count,
            resolvedUniquePaths: resolutions.count,
            changedClips: changedClips,
            unresolvedFileNames: unresolvedFileNames
        )

        if result.changedClips > 0 {
            lastStatus = "Relinked \(result.changedClips) decision\(result.changedClips == 1 ? "" : "s") across \(result.resolvedUniquePaths) source file\(result.resolvedUniquePaths == 1 ? "" : "s")."
        } else if result.unresolvedFileNames.isEmpty {
            lastStatus = "No missing paths needed relinking."
        } else {
            lastStatus = "Could not find exact episode media matches for: \(result.unresolvedFileNames.joined(separator: ", "))."
        }

        return result
    }

    @discardableResult
    func linkSourceFileToActiveMissingGroup(sessionID: String, groupLabel: String, fileURL: URL, forceReplacement: Bool = false) -> LocalEpisodeSourceGapLinkResult {
        let safeGroupLabel = groupLabel.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeGroupLabel.isEmpty else {
            lastStatus = "No source group was selected."
            return LocalEpisodeSourceGapLinkResult(groupLabel: groupLabel, fileName: fileURL.lastPathComponent, changedClips: 0, fileExists: false)
        }

        guard var session = sessions[sessionID] else {
            lastStatus = "No local edit session is loaded."
            return LocalEpisodeSourceGapLinkResult(groupLabel: safeGroupLabel, fileName: fileURL.lastPathComponent, changedClips: 0, fileExists: false)
        }

        let sourcePath = fileURL.path
        let fileExists = quipslyFileExists(atPath: sourcePath)
        guard fileExists else {
            lastStatus = "That source file is not reachable on this Mac: \(fileURL.lastPathComponent)."
            return LocalEpisodeSourceGapLinkResult(groupLabel: safeGroupLabel, fileName: fileURL.lastPathComponent, changedClips: 0, fileExists: false)
        }

        let before = session
        var changedClips = 0
        for index in session.editDecisions.indices {
            let decision = session.editDecisions[index]
            guard decision.isActive, decision.sourceAssetId == safeGroupLabel else { continue }

            let existingPath = decision.localMediaPath?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let needsSource = forceReplacement || existingPath.isEmpty || !fileHasLocalBytes(atPath: existingPath)
            guard needsSource else { continue }

            session.editDecisions[index].localMediaPath = sourcePath
            session.editDecisions[index].mediaDisplayName = fileURL.lastPathComponent
            session.editDecisions[index].kind = inferredMediaKind(fileURL: fileURL, fallback: decision.kind)
            session.editDecisions[index].mediaExists = true
            session.editDecisions[index].playbackMediaPath = nil
            changedClips += 1
        }

        guard changedClips > 0 else {
            lastStatus = "No active missing source decisions matched \(safeGroupLabel)."
            return LocalEpisodeSourceGapLinkResult(groupLabel: safeGroupLabel, fileName: fileURL.lastPathComponent, changedClips: 0, fileExists: true)
        }

        appendUndoCheckpoint(LocalEpisodeEditUndoCheckpoint(label: "link source file", session: before), sessionID: sessionID)
        session.updatedAt = Date().ISO8601Format()
        sessions[sessionID] = session
        save(session)
        lastStatus = "Linked \(changedClips) active source decision\(changedClips == 1 ? "" : "s") in \(safeGroupLabel) to \(fileURL.lastPathComponent)."

        return LocalEpisodeSourceGapLinkResult(groupLabel: safeGroupLabel, fileName: fileURL.lastPathComponent, changedClips: changedClips, fileExists: true)
    }

    @discardableResult
    func linkSourceFileToSourceAsset(sessionID: String, sourceAssetId: String, fileURL: URL, forceReplacement: Bool = false) -> LocalEpisodeSourceGapLinkResult {
        let safeSourceAssetId = sourceAssetId.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !safeSourceAssetId.isEmpty else {
            lastStatus = "No source asset was selected."
            return LocalEpisodeSourceGapLinkResult(groupLabel: sourceAssetId, fileName: fileURL.lastPathComponent, changedClips: 0, fileExists: false)
        }

        guard var session = sessions[sessionID] else {
            lastStatus = "No local edit session is loaded."
            return LocalEpisodeSourceGapLinkResult(groupLabel: safeSourceAssetId, fileName: fileURL.lastPathComponent, changedClips: 0, fileExists: false)
        }

        let sourcePath = fileURL.path
        let fileExists = quipslyFileExists(atPath: sourcePath)
        guard fileExists else {
            lastStatus = "That source file is not reachable on this Mac: \(fileURL.lastPathComponent)."
            return LocalEpisodeSourceGapLinkResult(groupLabel: safeSourceAssetId, fileName: fileURL.lastPathComponent, changedClips: 0, fileExists: false)
        }

        let before = session
        var changedClips = 0
        for index in session.editDecisions.indices {
            let decision = session.editDecisions[index]
            guard decision.sourceAssetId == safeSourceAssetId else { continue }

            let existingPath = decision.localMediaPath?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
            let needsSource = forceReplacement || existingPath.isEmpty || existingPath != sourcePath || !fileHasLocalBytes(atPath: existingPath)
            guard needsSource else { continue }

            session.editDecisions[index].localMediaPath = sourcePath
            session.editDecisions[index].mediaDisplayName = fileURL.lastPathComponent
            session.editDecisions[index].kind = inferredMediaKind(fileURL: fileURL, fallback: decision.kind)
            session.editDecisions[index].mediaExists = true
            changedClips += 1
        }

        guard changedClips > 0 else {
            lastStatus = "No timeline decisions needed source-vault relinking for \(fileURL.lastPathComponent)."
            return LocalEpisodeSourceGapLinkResult(groupLabel: safeSourceAssetId, fileName: fileURL.lastPathComponent, changedClips: 0, fileExists: true)
        }

        appendUndoCheckpoint(LocalEpisodeEditUndoCheckpoint(label: "link source asset to vault original", session: before), sessionID: sessionID)
        session.updatedAt = Date().ISO8601Format()
        sessions[sessionID] = session
        save(session)
        lastStatus = "Linked \(changedClips) source decision\(changedClips == 1 ? "" : "s") to Quipsly source-originals for \(fileURL.lastPathComponent)."

        return LocalEpisodeSourceGapLinkResult(groupLabel: safeSourceAssetId, fileName: fileURL.lastPathComponent, changedClips: changedClips, fileExists: true)
    }

    @discardableResult
    func relinkMissingMedia(projectSlug: String, episodeSlug: String) -> (session: LocalEpisodeEditSession?, beforeMissing: Int, afterMissing: Int, result: LocalEpisodeRelinkResult) {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        let beforeSession = sessions[id]
        diagnosticLogger?("relink public before missing count start")
        let beforeMissing = beforeSession?.missingUniqueMediaPathCount ?? -1
        diagnosticLogger?("relink public before missing count done before=\(beforeMissing)")
        let result = relinkMissingMediaPaths(sessionID: id)
        let afterSession = sessions[id]
        let afterMissing = result.unresolvedFileNames.count
        diagnosticLogger?("relink public after missing inferred after=\(afterMissing)")

        return (afterSession ?? beforeSession, beforeMissing, afterMissing, result)
    }

    @discardableResult
    func runReversibleEditOperationSmoke(projectSlug: String, episodeSlug: String) -> LocalEpisodeEditOperationSmokeResult {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard let session = sessions[id] else {
            return LocalEpisodeEditOperationSmokeResult(
                ok: false,
                message: "No local edit session is loaded.",
                targetClipId: "",
                targetClipName: "",
                targetTrackId: "",
                beforeIsActive: false,
                changedIsActive: false,
                restoredIsActive: false,
                beforeSourceStart: 0,
                changedSourceStart: 0,
                restoredSourceStart: 0
            )
        }

        let targetIndex = session.editDecisions.firstIndex(where: { decision in
            decision.trackId.uppercased().hasPrefix("V") && (decision.sourceEnd - decision.sourceStart) > 0.25
        }) ?? session.editDecisions.firstIndex(where: { decision in
            decision.isVideoLike && (decision.sourceEnd - decision.sourceStart) > 0.25
        })

        guard let targetIndex else {
            return LocalEpisodeEditOperationSmokeResult(
                ok: false,
                message: "No editable video decision is available.",
                targetClipId: "",
                targetClipName: "",
                targetTrackId: "",
                beforeIsActive: false,
                changedIsActive: false,
                restoredIsActive: false,
                beforeSourceStart: 0,
                changedSourceStart: 0,
                restoredSourceStart: 0
            )
        }

        let before = session.editDecisions[targetIndex]
        diagnosticLogger?("edit smoke target decision=\(before.id) track=\(before.trackId)")

        setClipActive(sessionID: id, clipID: before.id, isActive: !before.isActive)
        nudgeSourceIn(sessionID: id, clipID: before.id, delta: 0.1)

        guard let changedSession = sessions[id],
              let changedClip = changedSession.editDecisions.first(where: { $0.id == before.id })
        else {
            return LocalEpisodeEditOperationSmokeResult(
                ok: false,
                message: "Could not reload changed decision after edit operations.",
                targetClipId: before.id,
                targetClipName: before.label,
                targetTrackId: before.trackId,
                beforeIsActive: before.isActive,
                changedIsActive: before.isActive,
                restoredIsActive: before.isActive,
                beforeSourceStart: before.sourceStart,
                changedSourceStart: before.sourceStart,
                restoredSourceStart: before.sourceStart
            )
        }

        var restoredSession = changedSession
        if let restoreIndex = restoredSession.editDecisions.firstIndex(where: { $0.id == before.id }) {
            restoredSession.editDecisions[restoreIndex] = before
        }
        restoredSession.updatedAt = Date().ISO8601Format()
        sessions[id] = restoredSession
        save(restoredSession)

        guard let persistedSession = loadSession(projectSlug: projectSlug, episodeSlug: episodeSlug),
              let restoredClip = persistedSession.editDecisions.first(where: { $0.id == before.id })
        else {
            return LocalEpisodeEditOperationSmokeResult(
                ok: false,
                message: "Could not reload restored decision from disk.",
                targetClipId: before.id,
                targetClipName: before.label,
                targetTrackId: before.trackId,
                beforeIsActive: before.isActive,
                changedIsActive: changedClip.isActive,
                restoredIsActive: before.isActive,
                beforeSourceStart: before.sourceStart,
                changedSourceStart: changedClip.sourceStart,
                restoredSourceStart: before.sourceStart
            )
        }

        let toggled = changedClip.isActive != before.isActive
        let nudged = changedClip.sourceStart != before.sourceStart
        let restored = restoredClip.isActive == before.isActive
            && restoredClip.sourceStart == before.sourceStart
            && restoredClip.sourceEnd == before.sourceEnd
            && restoredClip.duration == before.duration

        return LocalEpisodeEditOperationSmokeResult(
            ok: toggled && nudged && restored,
            message: toggled && nudged && restored
                ? "Active toggle and source-in nudge persisted, then restored cleanly."
                : "Edit operation smoke did not persist and restore cleanly.",
            targetClipId: before.id,
            targetClipName: before.label,
            targetTrackId: before.trackId,
            beforeIsActive: before.isActive,
            changedIsActive: changedClip.isActive,
            restoredIsActive: restoredClip.isActive,
            beforeSourceStart: before.sourceStart,
            changedSourceStart: changedClip.sourceStart,
            restoredSourceStart: restoredClip.sourceStart
        )
    }

    @discardableResult
    func runTimelineHandleTrimSmoke(projectSlug: String, episodeSlug: String) -> LocalEpisodeTimelineHandleTrimSmokeResult {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard let session = sessions[id] else {
            return LocalEpisodeTimelineHandleTrimSmokeResult.empty(message: "No local edit session is loaded.")
        }

        let minimumPrecisionTrimDuration = 12.0
        let target = session.editDecisions.first { decision in
            decision.isActive
                && decision.trackId.uppercased().hasPrefix("V")
                && !decision.id.hasPrefix("inactive-")
                && (decision.sourceEnd - decision.sourceStart) > minimumPrecisionTrimDuration
        } ?? session.editDecisions.first { decision in
            decision.trackId.uppercased().hasPrefix("V") && (decision.sourceEnd - decision.sourceStart) > minimumPrecisionTrimDuration
        } ?? session.editDecisions.first { decision in
            decision.trackId.uppercased().hasPrefix("V") && (decision.sourceEnd - decision.sourceStart) > 0.55
        } ?? session.editDecisions.first { decision in
            decision.isVideoLike && (decision.sourceEnd - decision.sourceStart) > 0.55
        }

        guard let before = target else {
            return LocalEpisodeTimelineHandleTrimSmokeResult.empty(message: "No trim-ready video decision is available.")
        }

        diagnosticLogger?("timeline handle trim smoke target decision=\(before.id) track=\(before.trackId)")

        let beforeSession = session
        let sourceInDelta = 0.1
        let sourceOutDelta = -0.1
        let precisionSourceInDeltas: [Double] = [0.1, 1, 10, -0.1, -1, -10]
        let precisionSourceOutDeltas: [Double] = [-0.1, -1, -10, 0.1, 1, 10]
        let epsilon = 0.000_001
        func nearlyEqual(_ left: Double, _ right: Double) -> Bool {
            abs(left - right) <= epsilon
        }

        nudgeSourceIn(sessionID: id, clipID: before.id, delta: sourceInDelta)
        guard let changedInSession = sessions[id],
              let changedInClip = changedInSession.editDecisions.first(where: { $0.id == before.id })
        else {
            return LocalEpisodeTimelineHandleTrimSmokeResult.empty(message: "Could not reload source-in trimmed decision.")
        }

        var restoredAfterSourceIn = changedInSession
        if let restoreIndex = restoredAfterSourceIn.editDecisions.firstIndex(where: { $0.id == before.id }) {
            restoredAfterSourceIn.editDecisions[restoreIndex] = before
        }
        restoredAfterSourceIn.updatedAt = Date().ISO8601Format()
        sessions[id] = restoredAfterSourceIn
        save(restoredAfterSourceIn)

        nudgeSourceOut(sessionID: id, clipID: before.id, delta: sourceOutDelta)
        guard let changedOutSession = sessions[id],
              let changedOutClip = changedOutSession.editDecisions.first(where: { $0.id == before.id })
        else {
            return LocalEpisodeTimelineHandleTrimSmokeResult.empty(message: "Could not reload source-out trimmed decision.")
        }

        var restoredForPrecisionIn = beforeSession
        restoredForPrecisionIn.updatedAt = Date().ISO8601Format()
        sessions[id] = restoredForPrecisionIn
        save(restoredForPrecisionIn)

        var precisionSourceInStarts: [Double] = []
        var expectedSourceInStarts: [Double] = []
        var expectedSourceStart = before.sourceStart
        for precisionDelta in precisionSourceInDeltas {
            expectedSourceStart = max(0, min(before.sourceEnd - 0.05, expectedSourceStart + precisionDelta))
            expectedSourceInStarts.append(expectedSourceStart)
            nudgeSourceIn(sessionID: id, clipID: before.id, delta: precisionDelta)
            guard let precisionClip = sessions[id]?.editDecisions.first(where: { $0.id == before.id }) else {
                sessions[id] = beforeSession
                save(beforeSession)
                return LocalEpisodeTimelineHandleTrimSmokeResult.empty(message: "Could not reload precision source-in trimmed decision.")
            }
            precisionSourceInStarts.append(precisionClip.sourceStart)
        }

        var restoredForPrecisionOut = beforeSession
        restoredForPrecisionOut.updatedAt = Date().ISO8601Format()
        sessions[id] = restoredForPrecisionOut
        save(restoredForPrecisionOut)

        var precisionSourceOutEnds: [Double] = []
        var expectedSourceOutEnds: [Double] = []
        var expectedSourceEnd = before.sourceEnd
        for precisionDelta in precisionSourceOutDeltas {
            expectedSourceEnd = max(before.sourceStart + 0.05, expectedSourceEnd + precisionDelta)
            expectedSourceOutEnds.append(expectedSourceEnd)
            nudgeSourceOut(sessionID: id, clipID: before.id, delta: precisionDelta)
            guard let precisionClip = sessions[id]?.editDecisions.first(where: { $0.id == before.id }) else {
                sessions[id] = beforeSession
                save(beforeSession)
                return LocalEpisodeTimelineHandleTrimSmokeResult.empty(message: "Could not reload precision source-out trimmed decision.")
            }
            precisionSourceOutEnds.append(precisionClip.sourceEnd)
        }

        var finalRestoredSession = beforeSession
        finalRestoredSession.updatedAt = Date().ISO8601Format()
        sessions[id] = finalRestoredSession
        save(finalRestoredSession)

        guard let persistedSession = loadSession(projectSlug: projectSlug, episodeSlug: episodeSlug),
              let restoredClip = persistedSession.editDecisions.first(where: { $0.id == before.id })
        else {
            return LocalEpisodeTimelineHandleTrimSmokeResult.empty(message: "Could not reload restored decision from disk.")
        }

        let sourceInWorked = nearlyEqual(changedInClip.sourceStart, before.sourceStart + sourceInDelta)
            && nearlyEqual(changedInClip.sourceEnd, before.sourceEnd)
            && nearlyEqual(changedInClip.duration, before.duration - sourceInDelta)
            && changedInClip.isActive == before.isActive
        let sourceOutWorked = nearlyEqual(changedOutClip.sourceStart, before.sourceStart)
            && nearlyEqual(changedOutClip.sourceEnd, before.sourceEnd + sourceOutDelta)
            && nearlyEqual(changedOutClip.duration, before.duration + sourceOutDelta)
            && changedOutClip.isActive == before.isActive
        let precisionSourceInWorked = precisionSourceInStarts.count == expectedSourceInStarts.count
            && zip(precisionSourceInStarts, expectedSourceInStarts).allSatisfy { pair in
                nearlyEqual(pair.0, pair.1)
            }
            && (precisionSourceInStarts.last.map { nearlyEqual($0, before.sourceStart) } ?? false)
        let precisionSourceOutWorked = precisionSourceOutEnds.count == expectedSourceOutEnds.count
            && zip(precisionSourceOutEnds, expectedSourceOutEnds).allSatisfy { pair in
                nearlyEqual(pair.0, pair.1)
            }
            && (precisionSourceOutEnds.last.map { nearlyEqual($0, before.sourceEnd) } ?? false)
        let restoredCleanly = persistedSession.editDecisions.count == beforeSession.editDecisions.count
            && restoredClip.sourceStart == before.sourceStart
            && restoredClip.sourceEnd == before.sourceEnd
            && restoredClip.duration == before.duration
            && restoredClip.isActive == before.isActive
        let ok = sourceInWorked && sourceOutWorked && precisionSourceInWorked && precisionSourceOutWorked && restoredCleanly

        return LocalEpisodeTimelineHandleTrimSmokeResult(
            ok: ok,
            message: ok
                ? "Source-in/source-out handle trims and precision trim nudges persisted, then restored cleanly."
                : "Timeline handle trim smoke did not persist and restore cleanly.",
            targetClipId: before.id,
            targetClipName: before.label,
            targetTrackId: before.trackId,
            beforeClipCount: beforeSession.editDecisions.count,
            changedInClipCount: changedInSession.editDecisions.count,
            changedOutClipCount: changedOutSession.editDecisions.count,
            restoredClipCount: persistedSession.editDecisions.count,
            sourceInDelta: sourceInDelta,
            sourceOutDelta: sourceOutDelta,
            precisionSourceInDeltas: precisionSourceInDeltas,
            precisionSourceInStarts: precisionSourceInStarts,
            precisionSourceInWorked: precisionSourceInWorked,
            precisionSourceOutDeltas: precisionSourceOutDeltas,
            precisionSourceOutEnds: precisionSourceOutEnds,
            precisionSourceOutWorked: precisionSourceOutWorked,
            beforeSourceStart: before.sourceStart,
            changedInSourceStart: changedInClip.sourceStart,
            restoredSourceStart: restoredClip.sourceStart,
            beforeSourceEnd: before.sourceEnd,
            changedOutSourceEnd: changedOutClip.sourceEnd,
            restoredSourceEnd: restoredClip.sourceEnd,
            beforeDuration: before.duration,
            changedInDuration: changedInClip.duration,
            changedOutDuration: changedOutClip.duration,
            restoredDuration: restoredClip.duration,
            sourceInWorked: sourceInWorked,
            sourceOutWorked: sourceOutWorked,
            restoredCleanly: restoredCleanly
        )
    }

    @discardableResult
    func runReversibleSplitSmoke(projectSlug: String, episodeSlug: String) -> LocalEpisodeSplitSmokeResult {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard let session = sessions[id] else {
            return LocalEpisodeSplitSmokeResult.empty(message: "No local edit session is loaded.")
        }

        let target = visualSmokeTarget(in: session)

        guard let target else {
            return LocalEpisodeSplitSmokeResult.empty(message: "No split-safe decision is available.")
        }

        let splitOffset = min(max(0.25, target.duration / 2), target.duration - 0.1)
        let splitAt = target.timelineStart + splitOffset
        let beforeCount = session.editDecisions.count

        guard let newClipID = splitClip(sessionID: id, clipID: target.id, at: splitAt),
              let changedSession = sessions[id],
              let left = changedSession.editDecisions.first(where: { $0.id == target.id }),
              let right = changedSession.editDecisions.first(where: { $0.id == newClipID })
        else {
            sessions[id] = session
            save(session)
            return LocalEpisodeSplitSmokeResult(
                ok: false,
                message: "Split operation did not produce the expected left/right decisions.",
                targetClipId: target.id,
                targetClipName: target.label,
                targetTrackId: target.trackId,
                newClipId: "",
                splitAt: splitAt,
                beforeClipCount: beforeCount,
                changedClipCount: sessions[id]?.editDecisions.count ?? beforeCount,
                restoredClipCount: beforeCount,
                leftDuration: 0,
                rightDuration: 0,
                sourceContinuity: false,
                restoredHasNewClip: false
            )
        }

        var restoredSession = session
        restoredSession.updatedAt = Date().ISO8601Format()
        sessions[id] = restoredSession
        save(restoredSession)

        let persistedSession = loadSession(projectSlug: projectSlug, episodeSlug: episodeSlug)
        let restoredHasNewClip = persistedSession?.editDecisions.contains(where: { $0.id == newClipID }) ?? true
        let restoredCount = persistedSession?.editDecisions.count ?? -1
        let sourceContinuity = abs(left.sourceEnd - right.sourceStart) < 0.0001
            && abs((left.duration + right.duration) - target.duration) < 0.0001
            && abs(right.timelineStart - splitAt) < 0.0001
        let countChanged = changedSession.editDecisions.count == beforeCount + 1
        let restored = restoredCount == beforeCount && !restoredHasNewClip
        let ok = sourceContinuity && countChanged && restored

        return LocalEpisodeSplitSmokeResult(
            ok: ok,
            message: ok
                ? "Split produced left/right decision decisions, then restored the original session cleanly."
                : "Split smoke did not preserve split continuity and restoration.",
            targetClipId: target.id,
            targetClipName: target.label,
            targetTrackId: target.trackId,
            newClipId: newClipID,
            splitAt: splitAt,
            beforeClipCount: beforeCount,
            changedClipCount: changedSession.editDecisions.count,
            restoredClipCount: restoredCount,
            leftDuration: left.duration,
            rightDuration: right.duration,
            sourceContinuity: sourceContinuity,
            restoredHasNewClip: restoredHasNewClip
        )
    }

    @discardableResult
    func runTimelineUndoRedoSmoke(projectSlug: String, episodeSlug: String) -> LocalEpisodeTimelineUndoRedoSmokeResult {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard let session = sessions[id] else {
            return LocalEpisodeTimelineUndoRedoSmokeResult.empty(message: "No local edit session is loaded.")
        }

        let target = visualSmokeTarget(in: session)

        guard let target else {
            return LocalEpisodeTimelineUndoRedoSmokeResult.empty(message: "No move-safe decision is available.")
        }

        let beforeStartIn = target.timelineStart
        let delta = 0.25

        nudgeClipStart(sessionID: id, clipID: target.id, delta: delta)
        guard let movedSession = sessions[id],
              let movedClip = movedSession.editDecisions.first(where: { $0.id == target.id })
        else {
            sessions[id] = session
            save(session)
            return LocalEpisodeTimelineUndoRedoSmokeResult.empty(message: "Could not reload moved decision.")
        }

        undoLastChange(sessionID: id)
        let undoneClip = sessions[id]?.editDecisions.first(where: { $0.id == target.id })

        redoLastChange(sessionID: id)
        let redoneClip = sessions[id]?.editDecisions.first(where: { $0.id == target.id })

        undoLastChange(sessionID: id)
        let restoredClip = sessions[id]?.editDecisions.first(where: { $0.id == target.id })

        if sessions[id]?.editDecisions.count != session.editDecisions.count {
            sessions[id] = session
            save(session)
        }

        let moved = abs(movedClip.timelineStart - (beforeStartIn + delta)) < 0.0001
        let undone = abs((undoneClip?.timelineStart ?? -1) - beforeStartIn) < 0.0001
        let redone = abs((redoneClip?.timelineStart ?? -1) - movedClip.timelineStart) < 0.0001
        let restored = abs((restoredClip?.timelineStart ?? -1) - beforeStartIn) < 0.0001
            && sessions[id]?.editDecisions.count == session.editDecisions.count
        let ok = moved && undone && redone && restored

        return LocalEpisodeTimelineUndoRedoSmokeResult(
            ok: ok,
            message: ok
                ? "Timeline move, undo, redo, and final restore all persisted cleanly."
                : "Timeline undo/redo smoke did not preserve local edit state.",
            targetClipId: target.id,
            targetClipName: target.label,
            targetTrackId: target.trackId,
            beforeStartIn: beforeStartIn,
            movedStartIn: movedClip.timelineStart,
            undoneStartIn: undoneClip?.timelineStart ?? -1,
            redoneStartIn: redoneClip?.timelineStart ?? -1,
            restoredStartIn: restoredClip?.timelineStart ?? -1,
            undoWorked: undone,
            redoWorked: redone,
            restoredCleanly: restored
        )
    }

    @discardableResult
    func runTimelineMoveSmoke(projectSlug: String, episodeSlug: String) -> LocalEpisodeTimelineMoveSmokeResult {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard let session = sessions[id] else {
            return LocalEpisodeTimelineMoveSmokeResult.empty(message: "No local edit session is loaded.")
        }

        let target = visualSmokeTarget(in: session)

        guard let target else {
            return LocalEpisodeTimelineMoveSmokeResult.empty(message: "No move-safe video decision is available.")
        }

        let beforeClipCount = session.editDecisions.count
        let beforeStartIn = target.timelineStart
        let delta = 0.25
        let precisionDeltas: [Double] = [0.1, 1, 10, -0.1, -1, -10]

        nudgeClipStart(sessionID: id, clipID: target.id, delta: delta)
        guard let movedSession = sessions[id],
              let movedClip = movedSession.editDecisions.first(where: { $0.id == target.id })
        else {
            sessions[id] = session
            save(session)
            return LocalEpisodeTimelineMoveSmokeResult.empty(message: "Could not reload moved decision.")
        }

        sessions[id] = session
        save(session)

        var expectedPrecisionStartIn = beforeStartIn
        var precisionSnapshots: [Double] = []
        for precisionDelta in precisionDeltas {
            expectedPrecisionStartIn = max(0, expectedPrecisionStartIn + precisionDelta)
            nudgeClipStart(sessionID: id, clipID: target.id, delta: precisionDelta)
            guard let precisionClip = sessions[id]?.editDecisions.first(where: { $0.id == target.id }) else {
                sessions[id] = session
                save(session)
                return LocalEpisodeTimelineMoveSmokeResult.empty(message: "Could not reload precision moved decision.")
            }
            precisionSnapshots.append(precisionClip.timelineStart)
        }

        sessions[id] = session
        save(session)

        let restoredClip = sessions[id]?.editDecisions.first(where: { $0.id == target.id })
        let movedByDelta = abs(movedClip.timelineStart - (beforeStartIn + delta)) < 0.0001
        var expectedPrecisionStartIns: [Double] = []
        var expectedCursor = beforeStartIn
        for precisionDelta in precisionDeltas {
            expectedCursor = max(0, expectedCursor + precisionDelta)
            expectedPrecisionStartIns.append(expectedCursor)
        }
        let precisionWorked = precisionSnapshots.count == expectedPrecisionStartIns.count
            && zip(precisionSnapshots, expectedPrecisionStartIns).allSatisfy { pair in
                abs(pair.0 - pair.1) < 0.0001
            }
            && (precisionSnapshots.last.map { abs($0 - beforeStartIn) < 0.0001 } ?? false)
        let restored = abs((restoredClip?.timelineStart ?? -1) - beforeStartIn) < 0.0001
            && sessions[id]?.editDecisions.count == beforeClipCount
        let ok = movedByDelta && precisionWorked && restored

        return LocalEpisodeTimelineMoveSmokeResult(
            ok: ok,
            message: ok
                ? "Timeline decision move and precision nudges changed timelineStart, then restored the original session cleanly."
                : "Timeline move smoke did not preserve local edit state.",
            targetClipId: target.id,
            targetClipName: target.label,
            targetTrackId: target.trackId,
            beforeStartIn: beforeStartIn,
            movedStartIn: movedClip.timelineStart,
            restoredStartIn: restoredClip?.timelineStart ?? -1,
            delta: delta,
            precisionDeltas: precisionDeltas,
            precisionStartIns: precisionSnapshots,
            precisionWorked: precisionWorked,
            beforeClipCount: beforeClipCount,
            restoredClipCount: sessions[id]?.editDecisions.count ?? -1,
            movedByDelta: movedByDelta,
            restoredCleanly: restored
        )
    }

    @discardableResult
    func runMotionInspectorSmoke(projectSlug: String, episodeSlug: String) -> LocalEpisodeMotionInspectorSmokeResult {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard let session = sessions[id] else {
            return LocalEpisodeMotionInspectorSmokeResult.empty(message: "No local edit session is loaded.")
        }

        let target = visualSmokeTarget(in: session)

        guard let target else {
            return LocalEpisodeMotionInspectorSmokeResult.empty(message: "No motion-safe decision is available.")
        }

        let beforeMotion = target.motion
        let before = target.primaryMotionKeyframe

        adjustClipMotion(sessionID: id, clipID: target.id, scaleDelta: 0.25, xDelta: 12, yDelta: -6, opacityDelta: -0.1)

        guard let adjustedSession = sessions[id],
              let adjustedClip = adjustedSession.editDecisions.first(where: { $0.id == target.id })
        else {
            sessions[id] = session
            save(session)
            return LocalEpisodeMotionInspectorSmokeResult.empty(message: "Could not reload adjusted motion decision.")
        }

        undoLastChange(sessionID: id)
        let undoneClip = sessions[id]?.editDecisions.first(where: { $0.id == target.id })

        redoLastChange(sessionID: id)
        let redoneClip = sessions[id]?.editDecisions.first(where: { $0.id == target.id })

        undoLastChange(sessionID: id)
        let restoredClip = sessions[id]?.editDecisions.first(where: { $0.id == target.id })

        if sessions[id]?.editDecisions.count != session.editDecisions.count || restoredClip?.motion != beforeMotion {
            var restoredSession = session
            restoredSession.updatedAt = Date().ISO8601Format()
            sessions[id] = restoredSession
            save(restoredSession)
        }

        let adjusted = adjustedClip.hasMotionEnvelope
            && abs((adjustedClip.primaryMotionKeyframe.scale ?? 0) - ((before.scale ?? 1) + 0.25)) < 0.0001
            && abs((adjustedClip.primaryMotionKeyframe.x ?? 0) - ((before.x ?? 0) + 12)) < 0.0001
            && abs((adjustedClip.primaryMotionKeyframe.y ?? 0) - ((before.y ?? 0) - 6)) < 0.0001
        let undone = undoneClip?.motion == beforeMotion
        let redone = redoneClip?.motion == adjustedClip.motion
        let restored = restoredClip?.motion == beforeMotion
        let ok = adjusted && undone && redone && restored

        return LocalEpisodeMotionInspectorSmokeResult(
            ok: ok,
            message: ok
                ? "Motion inspector metadata adjusted, undid, redid, and restored cleanly."
                : "Motion inspector smoke did not preserve local motion state.",
            targetClipId: target.id,
            targetClipName: target.label,
            targetTrackId: target.trackId,
            beforeHadMotion: beforeMotion != nil,
            adjustedHadMotion: adjustedClip.hasMotionEnvelope,
            beforeScale: before.scale ?? 1,
            adjustedScale: adjustedClip.primaryMotionKeyframe.scale ?? 1,
            undoneMatchesBefore: undone,
            redoneMatchesAdjusted: redone,
            restoredCleanly: restored
        )
    }

    @discardableResult
    func runPlaybackModeSmoke(projectSlug: String, episodeSlug: String) -> LocalEpisodePlaybackModeSmokeResult {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard let session = sessions[id] else {
            return LocalEpisodePlaybackModeSmokeResult(
                ok: false,
                message: "No local edit session is loaded.",
                targetClipId: "",
                targetClipName: "",
                targetTrackId: "",
                playhead: 0,
                playAllBeforeClipName: "",
                playEditBeforeClipName: "",
                playAllAfterClipName: "",
                playEditAfterClipName: nil,
                editSkippedDeactivatedTarget: false,
                nextActiveClipName: nil,
                nextActivePlayhead: nil
            )
        }

        guard let target = playbackModeSmokeTarget(in: session) else {
            return LocalEpisodePlaybackModeSmokeResult(
                ok: false,
                message: "No active top-level video decision is available for playback mode smoke.",
                targetClipId: "",
                targetClipName: "",
                targetTrackId: "",
                playhead: 0,
                playAllBeforeClipName: "",
                playEditBeforeClipName: "",
                playAllAfterClipName: "",
                playEditAfterClipName: nil,
                editSkippedDeactivatedTarget: false,
                nextActiveClipName: nil,
                nextActivePlayhead: nil
            )
        }

        let playhead = target.timelineStart + min(0.02, max(0.01, target.duration / 2))
        let playAllBefore = programClip(in: session, at: playhead, includeInactive: true)
        let playEditBefore = programClip(in: session, at: playhead, includeInactive: false)

        setClipActive(sessionID: id, clipID: target.id, isActive: false)

        guard let changedSession = sessions[id] else {
            return LocalEpisodePlaybackModeSmokeResult(
                ok: false,
                message: "Could not reload changed session after deactivation.",
                targetClipId: target.id,
                targetClipName: target.label,
                targetTrackId: target.trackId,
                playhead: playhead,
                playAllBeforeClipName: playAllBefore?.label ?? "",
                playEditBeforeClipName: playEditBefore?.label ?? "",
                playAllAfterClipName: "",
                playEditAfterClipName: nil,
                editSkippedDeactivatedTarget: false,
                nextActiveClipName: nil,
                nextActivePlayhead: nil
            )
        }

        let playAllAfter = programClip(in: changedSession, at: playhead, includeInactive: true)
        let playEditAfter = programClip(in: changedSession, at: playhead, includeInactive: false)
        let nextActive = nextActiveVideoClip(after: playhead, in: changedSession)

        setClipActive(sessionID: id, clipID: target.id, isActive: target.isActive)

        let restoredSession = sessions[id]
        let restoredTarget = restoredSession?.editDecisions.first(where: { $0.id == target.id })

        let allStillShowsTarget = playAllAfter?.id == target.id
        let editSkippedTarget = playEditAfter?.id != target.id
        let restored = restoredTarget?.isActive == target.isActive
        let beforeWasTarget = playAllBefore?.id == target.id && playEditBefore?.id == target.id

        return LocalEpisodePlaybackModeSmokeResult(
            ok: beforeWasTarget && allStillShowsTarget && editSkippedTarget && restored,
            message: beforeWasTarget && allStillShowsTarget && editSkippedTarget && restored
                ? "Play All kept the deactivated source visible while Play Edit skipped it, then restored cleanly."
                : "Playback mode smoke did not preserve Play All / Play Edit semantics.",
            targetClipId: target.id,
            targetClipName: target.label,
            targetTrackId: target.trackId,
            playhead: playhead,
            playAllBeforeClipName: playAllBefore?.label ?? "",
            playEditBeforeClipName: playEditBefore?.label ?? "",
            playAllAfterClipName: playAllAfter?.label ?? "",
            playEditAfterClipName: playEditAfter?.label,
            editSkippedDeactivatedTarget: editSkippedTarget,
            nextActiveClipName: nextActive?.label,
            nextActivePlayhead: nextActive?.timelineStart
        )
    }

    @discardableResult
    func runMonitorWallSmoke(projectSlug: String, episodeSlug: String) -> LocalEpisodeMonitorWallSmokeResult {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard let session = sessions[id] else {
            return LocalEpisodeMonitorWallSmokeResult.empty(message: "No local edit session is loaded.")
        }

        guard let target = monitorWallSmokeTarget(in: session) else {
            return LocalEpisodeMonitorWallSmokeResult.empty(message: "No overlapping active V* track moment is available for monitor wall smoke.")
        }

        let playhead = target.timelineStart + min(0.02, max(0.01, target.duration / 2))
        let sourceTracksBefore = sourceTrackClipNames(in: session, at: playhead)
        let activeOverlapBefore = activeVideoClips(in: session, at: playhead)
        let programEditBefore = programClip(in: session, at: playhead, includeInactive: false)
        let programAllBefore = programClip(in: session, at: playhead, includeInactive: true)
        let sourceTargetBefore = sourceClip(on: target.trackId, in: session, at: playhead)

        setClipActive(sessionID: id, clipID: target.id, isActive: false)

        guard let changedSession = sessions[id] else {
            return LocalEpisodeMonitorWallSmokeResult.empty(message: "Could not reload changed session after monitor wall deactivation.")
        }

        let sourceTracksAfter = sourceTrackClipNames(in: changedSession, at: playhead)
        let programEditAfter = programClip(in: changedSession, at: playhead, includeInactive: false)
        let programAllAfter = programClip(in: changedSession, at: playhead, includeInactive: true)
        let sourceTargetAfter = sourceClip(on: target.trackId, in: changedSession, at: playhead)

        setClipActive(sessionID: id, clipID: target.id, isActive: target.isActive)

        let restoredSession = sessions[id]
        let restoredTarget = restoredSession?.editDecisions.first(where: { $0.id == target.id })

        let sourceTrackCount = sourceTracksBefore.count
        let activeOverlapCount = activeOverlapBefore.count
        let sourceStillShowsTarget = sourceTargetBefore?.id == target.id && sourceTargetAfter?.id == target.id
        let editPickedTargetBefore = programEditBefore?.id == target.id
        let allPickedTargetBefore = programAllBefore?.id == target.id
        let allStillShowsTargetAfter = programAllAfter?.id == target.id
        let editSkippedTargetAfter = programEditAfter?.id != target.id
        let restored = restoredTarget?.isActive == target.isActive
        let ok = sourceTrackCount >= 2
            && activeOverlapCount >= 2
            && sourceStillShowsTarget
            && editPickedTargetBefore
            && allPickedTargetBefore
            && allStillShowsTargetAfter
            && editSkippedTargetAfter
            && restored

        return LocalEpisodeMonitorWallSmokeResult(
            ok: ok,
            message: ok
                ? "Monitor wall preserved per-track source visibility while the program monitor obeyed Play All / Play Edit semantics."
                : "Monitor wall smoke did not preserve source/program monitor semantics.",
            targetClipId: target.id,
            targetClipName: target.label,
            targetTrackId: target.trackId,
            playhead: playhead,
            sourceTrackCountBefore: sourceTrackCount,
            activeOverlapCountBefore: activeOverlapCount,
            sourceTracksBefore: sourceTracksBefore,
            sourceTracksAfter: sourceTracksAfter,
            programEditBeforeClipName: programEditBefore?.label ?? "",
            programAllBeforeClipName: programAllBefore?.label ?? "",
            programEditAfterClipName: programEditAfter?.label,
            programAllAfterClipName: programAllAfter?.label ?? "",
            sourceMonitorTargetBeforeClipName: sourceTargetBefore?.label ?? "",
            sourceMonitorTargetAfterClipName: sourceTargetAfter?.label ?? "",
            sourceStillShowsTargetAfterDeactivation: sourceStillShowsTarget,
            editSkippedDeactivatedTarget: editSkippedTargetAfter
        )
    }

    func cacheFirstPlayableProgramVideo(sessionID: String, maxCacheBytes: Int = 500 * 1024 * 1024, workspacePath: String? = nil) {
        guard var session = sessions[sessionID] else { return }

        let candidates = session.editDecisions.filter { decision in
            decision.isVideoLike
                && decision.isActive
                && decision.hasMediaPath
                && !decision.hasPlayableLocalMedia
        }
        .sorted { left, right in
            left.timelineStart < right.timelineStart || (left.timelineStart == right.timelineStart && naturalTrackOrder(left.trackId) > naturalTrackOrder(right.trackId))
        }

        for candidate in candidates {
            let sampleTime = candidate.timelineStart + min(0.02, max(0.01, candidate.duration / 2))
            guard programClipID(in: session, at: sampleTime) == candidate.id else { continue }
            guard let sourcePath = candidate.localMediaPath, !sourcePath.isEmpty else { continue }

            let sourceURL = URL(fileURLWithPath: sourcePath)
            guard FileManager.default.fileExists(atPath: sourceURL.path) else {
                continue
            }

            let fileSize = (try? sourceURL.resourceValues(forKeys: [.fileSizeKey]).fileSize) ?? 0
            if fileSize > maxCacheBytes {
                continue
            }

            do {
                let cacheRoot = playbackCacheURL(projectSlug: session.projectSlug, episodeSlug: session.episodeSlug, workspacePath: workspacePath)
                try FileManager.default.createDirectory(at: cacheRoot, withIntermediateDirectories: true)
                let ext = sourceURL.pathExtension.isEmpty ? "mp4" : sourceURL.pathExtension
                let cacheName = "\(safePathComponent(candidate.sourceAssetId)).\(ext)"
                let cacheURL = cacheRoot.appendingPathComponent(cacheName)

                if !FileManager.default.fileExists(atPath: cacheURL.path) {
                    try FileManager.default.copyItem(at: sourceURL, to: cacheURL)
                }

                var linkedCount = 0
                for index in session.editDecisions.indices {
                    if session.editDecisions[index].sourceAssetId == candidate.sourceAssetId || session.editDecisions[index].localMediaPath == sourcePath {
                        session.editDecisions[index].playbackMediaPath = cacheURL.path
                        linkedCount += 1
                    }
                }

                session.updatedAt = Date().ISO8601Format()
                sessions[sessionID] = session
                save(session)
                lastStatus = "Cached \(candidate.label) for playback and linked \(linkedCount) decision\(linkedCount == 1 ? "" : "s")."
                return
            } catch {
                lastStatus = "Could not cache \(candidate.label): \(error.localizedDescription)"
                return
            }
        }

        lastStatus = "No cacheable active program video found under \(maxCacheBytes / 1024 / 1024) MB. Large source files should be proxied through Media Engine first."
    }

    func linkProxyResults(from jobs: [EpisodeImportJob], projectSlug: String, episodeSlug: String) {
        let id = sessionID(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard var session = sessions[id] else { return }

        let relevantJobs = jobs.filter { job in
            job.projectSlug == session.projectSlug
                && job.episodeSlug == session.episodeSlug
                && job.proxy?.proxyPath?.isEmpty == false
        }

        guard !relevantJobs.isEmpty else { return }

        var linkedCount = 0
        for job in relevantJobs {
            guard let proxyPath = job.proxy?.proxyPath, FileManager.default.fileExists(atPath: proxyPath) else {
                continue
            }

            for index in session.editDecisions.indices where session.editDecisions[index].localMediaPath == job.path || session.editDecisions[index].mediaDisplayName == job.displayName {
                if session.editDecisions[index].playbackMediaPath != proxyPath {
                    session.editDecisions[index].playbackMediaPath = proxyPath
                    linkedCount += 1
                }
            }
        }

        guard linkedCount > 0 else { return }

        session.updatedAt = Date().ISO8601Format()
        sessions[id] = session
        save(session)
        lastStatus = "Linked \(linkedCount) local decision\(linkedCount == 1 ? "" : "s") to Media Engine proxy playback."
    }

    private func updateClip(sessionID: String, clipID: String, label: String, mutate: (inout LocalEpisodeEditDecision) -> Void) {
        guard var session = sessions[sessionID], let index = session.editDecisions.firstIndex(where: { $0.id == clipID }) else {
            return
        }

        let before = session
        mutate(&session.editDecisions[index])
        guard session.editDecisions[index] != before.editDecisions[index] else {
            lastStatus = "No local edit change was needed."
            return
        }

        appendUndoCheckpoint(LocalEpisodeEditUndoCheckpoint(label: label, session: before), sessionID: sessionID)
        session.updatedAt = Date().ISO8601Format()
        sessions[sessionID] = session
        save(session)
        lastStatus = "Saved local edit change for \(session.episodeSlug)."
    }

    private func visualSmokeTarget(in session: LocalEpisodeEditSession, minimumDuration: Double = 0.55) -> LocalEpisodeEditDecision? {
        session.editDecisions.first { decision in
            decision.trackId.uppercased().hasPrefix("V") && decision.duration > minimumDuration
        } ?? session.editDecisions.first { decision in
            decision.isVideoLike && decision.duration > minimumDuration
        } ?? session.editDecisions.first { decision in
            decision.duration > minimumDuration
        }
    }

    private func clamped(_ value: Double, min minValue: Double, max maxValue: Double) -> Double {
        min(max(value, minValue), maxValue)
    }

    private func appendUndoCheckpoint(_ checkpoint: LocalEpisodeEditUndoCheckpoint, sessionID: String, clearRedo: Bool = true) {
        var stack = undoStacks[sessionID] ?? []
        stack.append(checkpoint)
        if stack.count > maxUndoDepth {
            stack.removeFirst(stack.count - maxUndoDepth)
        }
        undoStacks[sessionID] = stack

        if clearRedo {
            redoStacks[sessionID] = []
        }
    }

    private func appendRedoCheckpoint(_ checkpoint: LocalEpisodeEditUndoCheckpoint, sessionID: String) {
        var stack = redoStacks[sessionID] ?? []
        stack.append(checkpoint)
        if stack.count > maxUndoDepth {
            stack.removeFirst(stack.count - maxUndoDepth)
        }
        redoStacks[sessionID] = stack
    }

    private func loadSession(projectSlug: String, episodeSlug: String) -> LocalEpisodeEditSession? {
        let url = sessionURL(projectSlug: projectSlug, episodeSlug: episodeSlug)
        guard FileManager.default.fileExists(atPath: url.path) else { return nil }

        do {
            let data = try Data(contentsOf: url)
            return try JSONDecoder().decode(LocalEpisodeEditSession.self, from: data)
        } catch {
            lastStatus = "Could not load saved local edit: \(error.localizedDescription)"
            return nil
        }
    }

    private func save(_ session: LocalEpisodeEditSession) {
        do {
            let url = sessionURL(projectSlug: session.projectSlug, episodeSlug: session.episodeSlug)
            try FileManager.default.createDirectory(at: url.deletingLastPathComponent(), withIntermediateDirectories: true)
            let encoder = JSONEncoder()
            encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
            try encoder.encode(session).write(to: url, options: .atomic)
        } catch {
            lastStatus = "Could not save local edit: \(error.localizedDescription)"
        }
    }

    private func inferredMediaKind(fileURL: URL, fallback: String) -> String {
        let ext = fileURL.pathExtension.lowercased()
        if ["wav", "mp3", "m4a", "aac", "aiff", "flac"].contains(ext) {
            return "audio"
        }

        if ["mov", "mp4", "m4v", "avi", "mkv", "insv"].contains(ext) {
            return "video"
        }

        return fallback
    }

    private func fileHasLocalBytes(atPath path: String) -> Bool {
        guard quipslyFileExists(atPath: path),
              let attributes = try? FileManager.default.attributesOfItem(atPath: path),
              let fileSize = attributes[.size] as? NSNumber
        else {
            return false
        }

        let size = fileSize.int64Value
        guard size > 1_000_000 else {
            return size > 0
        }

        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/du")
        process.arguments = ["-skL", path]

        let stdout = Pipe()
        process.standardOutput = stdout
        process.standardError = Pipe()

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return false
        }

        guard process.terminationStatus == 0,
              let output = String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8),
              let kbText = output.split(whereSeparator: \.isWhitespace).first,
              let kb = Int64(kbText)
        else {
            return false
        }

        return kb * 1024 >= 1_000_000
    }

    private func sessionID(projectSlug: String, episodeSlug: String) -> String {
        "\(projectSlug.trimmingCharacters(in: .whitespacesAndNewlines))-\(episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines))"
    }

    private var rootDirectoryURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("QuipslyMac", isDirectory: true)
            .appendingPathComponent("local-episode-edits", isDirectory: true)
    }

    private var renderReadinessRootURL: URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("QuipslyMac", isDirectory: true)
            .appendingPathComponent("render-readiness", isDirectory: true)
    }

    private func loadExistingSessions() {
        let root = rootDirectoryURL
        guard let projectDirs = try? FileManager.default.contentsOfDirectory(
            at: root,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) else {
            return
        }

        var loaded: [String: LocalEpisodeEditSession] = [:]
        for projectDir in projectDirs {
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: projectDir.path, isDirectory: &isDirectory),
                  isDirectory.boolValue
            else {
                continue
            }

            guard let files = try? FileManager.default.contentsOfDirectory(
                at: projectDir,
                includingPropertiesForKeys: nil,
                options: [.skipsHiddenFiles]
            ) else {
                continue
            }

            for file in files where file.pathExtension.lowercased() == "json" && !file.lastPathComponent.contains(".bak-") {
                guard let data = try? Data(contentsOf: file),
                      let session = try? JSONDecoder().decode(LocalEpisodeEditSession.self, from: data)
                else {
                    continue
                }

                loaded[sessionID(projectSlug: session.projectSlug, episodeSlug: session.episodeSlug)] = session
            }
        }

        if !loaded.isEmpty {
            sessions.merge(loaded) { _, new in new }
            lastStatus = "Loaded \(loaded.count) local edit session\(loaded.count == 1 ? "" : "s")."
        }
    }

    private func loadLatestSourceReadinessSummary() {
        let root = renderReadinessRootURL
        guard let enumerator = FileManager.default.enumerator(
            at: root,
            includingPropertiesForKeys: [.contentModificationDateKey],
            options: [.skipsHiddenFiles]
        ) else {
            return
        }

        let reportURLs = enumerator.compactMap { item -> (url: URL, modifiedAt: Date)? in
            guard let url = item as? URL,
                  url.pathExtension.lowercased() == "json",
                  url.lastPathComponent.contains("source")
            else {
                return nil
            }

            let modifiedAt = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? .distantPast
            return (url, modifiedAt)
        }
        .sorted { $0.modifiedAt > $1.modifiedAt }

        for candidate in reportURLs.prefix(12) {
            if let summary = sourceReadinessSummary(fromReportAt: candidate.url) {
                lastSourceReadinessReportURL = candidate.url
                lastSourceReadinessSummary = summary
                return
            }
        }
    }

    private func sourceReadinessSummary(fromReportAt url: URL) -> LocalEpisodeSourceReadinessSummary? {
        guard let data = try? Data(contentsOf: url),
              let report = try? JSONDecoder().decode(LocalEpisodeSourceReadinessDiskReport.self, from: data)
        else {
            return nil
        }

        let episodes = report.episodeSlugs?.isEmpty == false
            ? report.episodeSlugs ?? []
            : (report.episodes ?? []).compactMap(\.episodeSlug)
        let blockers = (report.episodes ?? []).flatMap { $0.blockers ?? [] }
        let blockerRows = (report.episodes ?? []).flatMap { episode in
            (episode.blockers ?? []).enumerated().map { index, blocker in
                LocalEpisodeSourceReadinessBlockerSummary(
                    id: [
                        episode.episodeSlug ?? "unknown",
                        (blocker.trackIds ?? []).joined(separator: "+"),
                        blocker.displayName,
                        "\(index)"
                    ]
                    .filter { !$0.isEmpty }
                    .joined(separator: "::"),
                    episodeSlug: episode.episodeSlug ?? "unknown",
                    label: blocker.displayName,
                    trackIds: blocker.trackIds ?? [],
                    provider: blocker.provider,
                    allocatedBytes: blocker.allocatedBytes,
                    statBytes: blocker.statBytes,
                    resolvedPath: blocker.resolvedPath ?? blocker.mediaPath,
                    recommendedAction: blocker.recommendedAction ?? blocker.message,
                    isDownloaded: blocker.fileProviderState?.isDownloaded == true,
                    isDownloading: blocker.fileProviderState?.isDownloading == true,
                    isDownloadRequested: blocker.fileProviderState?.isDownloadRequested == true
                )
            }
        }
        let requestedCount = blockers.filter { $0.fileProviderState?.isDownloadRequested == true }.count
        let downloadingCount = blockers.filter { $0.fileProviderState?.isDownloading == true }.count
        let downloadedCount = blockers.filter { $0.fileProviderState?.isDownloaded == true }.count
        let modifiedAt = (try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate) ?? Date()

        return LocalEpisodeSourceReadinessSummary(
            generatedAt: modifiedAt,
            ok: report.ok ?? blockers.isEmpty,
            episodeSlugs: episodes.isEmpty ? ["unknown"] : episodes,
            blockerCount: blockers.count,
            downloadedCount: downloadedCount,
            requestedCount: requestedCount,
            downloadingCount: downloadingCount,
            outputPath: url.path,
            blockers: blockerRows
        )
    }

    private func sessionURL(projectSlug: String, episodeSlug: String) -> URL {
        let supportRoot = rootDirectoryURL
            .appendingPathComponent(safePathComponent(projectSlug), isDirectory: true)

        return supportRoot.appendingPathComponent("\(safePathComponent(episodeSlug)).json")
    }

    private func playbackCacheURL(projectSlug: String, episodeSlug: String, workspacePath: String? = nil) -> URL {
        QuipslyMediaWorkspace.episodePlaybackCacheURL(rootPath: workspacePath, projectSlug: projectSlug, episodeSlug: episodeSlug)
    }

    private func renderPrepManifestURL(projectSlug: String, episodeSlug: String) -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("QuipslyMac", isDirectory: true)
            .appendingPathComponent("render-prep", isDirectory: true)
            .appendingPathComponent(safePathComponent(projectSlug), isDirectory: true)
            .appendingPathComponent(safePathComponent(episodeSlug), isDirectory: true)
            .appendingPathComponent("manifest.json")
    }

    private func renderPrepManifest(for session: LocalEpisodeEditSession, isShortsMode: Bool) -> LocalEpisodeRenderPrepManifest {
        let sortedClips = session.editDecisions.sorted { left, right in
            left.timelineStart < right.timelineStart
                || (left.timelineStart == right.timelineStart && left.trackId < right.trackId)
                || (left.timelineStart == right.timelineStart && left.trackId == right.trackId && left.id < right.id)
        }
        let manifestClips = sortedClips.map(LocalEpisodeRenderPrepDecision.init(decision:))
        let requiredActiveClips = manifestClips.filter { manifestClip in manifestClip.isActive && (!isShortsMode || session.editDecisions.first(where: { sessionClip in sessionClip.id == manifestClip.id })?.isShortsIncluded == true) }
        let missingMedia = requiredActiveClips.filter { decision in
            let source = session.sources.first(where: { $0.sourceAssetId == decision.sourceAssetId })
            return source?.localMediaPath == nil || source?.mediaExists == false
        }
        let missingMediaNames = Array(Set(missingMedia.map { "\($0.trackId) \($0.name)" })).sorted()
        var blockers: [String] = []
        if requiredActiveClips.isEmpty {
            blockers.append("No active decisions are available for Play Edit render output.")
        }
        if !missingMediaNames.isEmpty {
            blockers.append("Missing local source media for active decision(s): \(missingMediaNames.prefix(12).joined(separator: ", "))\(missingMediaNames.count > 12 ? ", ..." : "").")
        }

        var warnings: [String] = [
            "This is a render-prep manifest, not a finished video export. The renderer still needs to consume this artifact explicitly.",
            "Inactive decisions are preserved for Play All/source review and skipped for Play Edit output."
        ]
        let activeWithoutProxyCount = requiredActiveClips.filter { decision in
            decision.isVideoLike && decision.localMediaExists && !decision.playbackMediaExists
        }.count
        if activeWithoutProxyCount > 0 {
            warnings.append("\(activeWithoutProxyCount) active video decision decision(s) have source media but no Quipsly playback proxy yet.")
        }
        let motionCount = manifestClips.filter { $0.motion != nil }.count
        if motionCount > 0 {
            warnings.append("\(motionCount) decision decision(s) include motion metadata; final render must apply scale/pan/crop/opacity non-destructively.")
        }

        let videoTrackIds = Array(Set(session.editDecisions.filter { $0.trackId.uppercased().hasPrefix("V") }.map(\.trackId))).sorted(by: timelineTrackSort)
        let audioTrackIds = Array(Set(session.editDecisions.filter { $0.trackId.uppercased().hasPrefix("A") }.map(\.trackId))).sorted(by: timelineTrackSort)

        return LocalEpisodeRenderPrepManifest(
            schemaVersion: 1,
            generatedAt: Date().ISO8601Format(),
            projectSlug: session.projectSlug,
            episodeSlug: session.episodeSlug,
            sessionId: session.id,
            sessionUpdatedAt: session.updatedAt,
            readiness: blockers.isEmpty ? "ready-for-renderer" : "needs-media-review",
            programDuration: session.programDuration,
            activeEditDuration: session.activeDuration,
            decisionCount: session.editDecisions.count,
            activeDecisionCount: session.activeEditDecisions.count,
            inactiveDecisionCount: session.inactiveEditDecisions.count,
            videoTrackIds: videoTrackIds,
            audioTrackIds: audioTrackIds,
            decisions: manifestClips,
            loopClips: session.textOverlays,
            blockers: blockers,
            warnings: warnings,
            outputPlan: LocalEpisodeRenderOutputPlan(
                mode: "play-edit",
                inactivePolicy: "preserve-in-manifest-skip-in-output",
                sourcePolicy: "prefer-local-source-media-render-proxies-for-preview",
                motionPolicy: "apply-keyframe-ready-motion-metadata-non-destructively",
                rendererStatus: "not-started",
                notes: "Generated by Quipsly Mac from the local episode edit session. This artifact is safe to inspect, copy, diff, and feed into a future renderer."
            )
        )
    }

    private func safePathComponent(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let scalars = value.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" }
        let safe = String(scalars).trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        return safe.isEmpty ? "unknown" : safe
    }

    private func timelineTrackSort(_ left: String, _ right: String) -> Bool {
        let leftUpper = left.uppercased()
        let rightUpper = right.uppercased()
        if leftUpper.hasPrefix("V") != rightUpper.hasPrefix("V") {
            return leftUpper.hasPrefix("V")
        }
        if leftUpper.hasPrefix("A") != rightUpper.hasPrefix("A") {
            return !leftUpper.hasPrefix("A")
        }
        return left.localizedStandardCompare(right) == .orderedAscending
    }

    private func localEditClock(_ seconds: Double) -> String {
        let safe = max(0, seconds)
        let total = Int(safe.rounded())
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let secs = total % 60

        if hours > 0 {
            return String(format: "%d:%02d:%02d", hours, minutes, secs)
        }

        return String(format: "%d:%02d", minutes, secs)
    }

    private func bestMediaCandidate(fileName: String, episodeSlug: String) -> String? {
        let filesystemCandidates = deterministicFilesystemCandidates(fileName: fileName, episodeSlug: episodeSlug)

        var uniqueCandidatePaths = Set<String>()
        for candidate in filesystemCandidates {
            uniqueCandidatePaths.insert(candidate)
        }

        let candidates = Array(uniqueCandidatePaths)
            .filter { URL(fileURLWithPath: $0).lastPathComponent.caseInsensitiveCompare(fileName) == .orderedSame }
            .filter { !$0.contains("/Adobe/Common/Peak Files/") }
            .filter { !$0.contains("/Adobe/Common/Media Cache Files/") }
            .filter { !$0.lowercased().hasSuffix(".pek") && !$0.lowercased().hasSuffix(".cfa") }

        return candidates
            .sorted { left, right in
                spotlightCandidateScore(left, episodeSlug: episodeSlug) > spotlightCandidateScore(right, episodeSlug: episodeSlug)
            }
            .first
    }

    private func deterministicFilesystemCandidates(fileName: String, episodeSlug: String) -> [String] {
        let roots = deterministicSearchRoots(episodeSlug: episodeSlug)
        var matches: [String] = []

        for root in roots {
            var isDirectory: ObjCBool = false
            guard FileManager.default.fileExists(atPath: root.path, isDirectory: &isDirectory),
                  isDirectory.boolValue
            else {
                continue
            }

            let shouldVerifyRootCandidates = root.path.contains("/Desktop/Podcast/")
            let directCandidate = root.appendingPathComponent(fileName).path
            if shouldVerifyRootCandidates {
                if quipslyFileExists(atPath: directCandidate) {
                    matches.append(directCandidate)
                }
            } else {
                matches.append(directCandidate)
            }

            let commonChildFolders: [String]
            if root.path.contains("/Desktop/Podcast/") {
                commonChildFolders = ["Decisions", "CharlieVoice", "CharlieVideo", "HomerAudio", "Other"]
            } else {
                commonChildFolders = ["Other"]
            }

            for folder in commonChildFolders {
                let candidate = root.appendingPathComponent(folder, isDirectory: true).appendingPathComponent(fileName).path
                if shouldVerifyRootCandidates {
                    if quipslyFileExists(atPath: candidate) {
                        matches.append(candidate)
                    }
                } else {
                    matches.append(candidate)
                }
            }
        }

        return matches
    }

    private func deterministicSearchRoots(episodeSlug: String) -> [URL] {
        let home = FileManager.default.homeDirectoryForCurrentUser
        let episodeNumber = episodeSlug
            .split(separator: "-")
            .last
            .map(String.init) ?? ""
        var roots: [URL] = []

        roots.append(contentsOf: MediaAccessStore.persistedRootPaths().map {
            URL(fileURLWithPath: $0, isDirectory: true)
        })

        if !episodeNumber.isEmpty {
            roots.append(home.appendingPathComponent("Desktop/Podcast/\(episodeNumber)", isDirectory: true))
            roots.append(home.appendingPathComponent("Desktop/Podcast/Episode \(episodeNumber)", isDirectory: true))
        }

        let cloudStorageRoot = home.appendingPathComponent("Library/CloudStorage", isDirectory: true)
        if let providers = try? FileManager.default.contentsOfDirectory(
            at: cloudStorageRoot,
            includingPropertiesForKeys: nil,
            options: [.skipsHiddenFiles]
        ) {
            for provider in providers {
                if !episodeNumber.isEmpty {
                    roots.append(provider.appendingPathComponent("Shared drives/HighGroundDrive/Podcast/Episode \(episodeNumber)", isDirectory: true))
                    roots.append(provider.appendingPathComponent("Shared drives/HighGroundDrive/Podcast/\(episodeNumber)", isDirectory: true))
                }
            }
        }

        return roots
    }

    private func spotlightCandidateScore(_ path: String, episodeSlug: String) -> Int {
        let episodeNumber = episodeSlug
            .split(separator: "-")
            .last
            .map(String.init) ?? ""
        var score = 0

        if !episodeNumber.isEmpty, path.contains("/Podcast/Episode \(episodeNumber)/") {
            score += 70
        }
        if !episodeNumber.isEmpty, path.contains("/Podcast/\(episodeNumber)/") {
            score += 50
        }
        if path.contains("/Desktop/Podcast/") {
            score += 150
        }
        if path.contains("/Shared drives/HighGroundDrive/") {
            score += 20
        }
        if path.contains("/Library/CloudStorage/") {
            score += 10
        }
        if path.contains("/Other/") {
            score -= 10
        }
        if path.contains("/Volumes/") {
            score -= 5
        }

        return score
    }

    private func programClipID(in session: LocalEpisodeEditSession, at playhead: Double) -> String? {
        programClip(in: session, at: playhead, includeInactive: false)?.id
    }

    private func playbackModeSmokeTarget(in session: LocalEpisodeEditSession) -> LocalEpisodeEditDecision? {
        session.editDecisions
            .filter { decision in
                decision.trackId.uppercased().hasPrefix("V")
                    && decision.isActive
                    && decision.duration > 0.25
            }
            .sorted { left, right in
                left.timelineStart < right.timelineStart || (left.timelineStart == right.timelineStart && naturalTrackOrder(left.trackId) > naturalTrackOrder(right.trackId))
            }
            .first { candidate in
                let sampleTime = candidate.timelineStart + min(0.02, max(0.01, candidate.duration / 2))
                return programClip(in: session, at: sampleTime, includeInactive: false)?.id == candidate.id
                    && programClip(in: session, at: sampleTime, includeInactive: true)?.id == candidate.id
            }
    }

    private func monitorWallSmokeTarget(in session: LocalEpisodeEditSession) -> LocalEpisodeEditDecision? {
        session.editDecisions
            .filter { decision in
                decision.trackId.uppercased().hasPrefix("V")
                    && decision.isActive
                    && decision.duration > 0.25
            }
            .sorted { left, right in
                left.timelineStart < right.timelineStart || (left.timelineStart == right.timelineStart && naturalTrackOrder(left.trackId) > naturalTrackOrder(right.trackId))
            }
            .first { candidate in
                let sampleTime = candidate.timelineStart + min(0.02, max(0.01, candidate.duration / 2))
                let activeOverlaps = activeVideoClips(in: session, at: sampleTime)
                guard activeOverlaps.count >= 2 else { return false }
                guard programClip(in: session, at: sampleTime, includeInactive: false)?.id == candidate.id else { return false }
                guard programClip(in: session, at: sampleTime, includeInactive: true)?.id == candidate.id else { return false }
                guard sourceClip(on: candidate.trackId, in: session, at: sampleTime)?.id == candidate.id else { return false }

                var changed = session
                if let index = changed.editDecisions.firstIndex(where: { $0.id == candidate.id }) {
                    changed.editDecisions[index].isActive = false
                }
                return programClip(in: changed, at: sampleTime, includeInactive: false)?.id != candidate.id
                    && programClip(in: changed, at: sampleTime, includeInactive: true)?.id == candidate.id
                    && sourceClip(on: candidate.trackId, in: changed, at: sampleTime)?.id == candidate.id
            }
    }

    private func programClip(in session: LocalEpisodeEditSession, at playhead: Double, includeInactive: Bool) -> LocalEpisodeEditDecision? {
        session.editDecisions
            .filter { decision in
                decision.trackId.uppercased().hasPrefix("V")
                    && (includeInactive || decision.isActive)
                    && playhead >= decision.timelineStart
                    && playhead < decision.timelineStart + max(0.05, decision.duration)
            }
            .sorted { left, right in
                naturalTrackOrder(left.trackId) > naturalTrackOrder(right.trackId)
            }
            .first
    }

    private func sourceClip(on trackID: String, in session: LocalEpisodeEditSession, at playhead: Double) -> LocalEpisodeEditDecision? {
        session.editDecisions.first { decision in
            decision.trackId == trackID
                && playhead >= decision.timelineStart
                && playhead < decision.timelineStart + max(0.05, decision.duration)
        }
    }

    private func sourceTrackClipNames(in session: LocalEpisodeEditSession, at playhead: Double) -> [String: String] {
        let tracks = Set(session.editDecisions.compactMap { decision -> String? in
            decision.trackId.uppercased().hasPrefix("V") ? decision.trackId : nil
        })

        return Dictionary(uniqueKeysWithValues: tracks.sorted { naturalTrackOrder($0) < naturalTrackOrder($1) }.compactMap { trackID in
            guard let decision = sourceClip(on: trackID, in: session, at: playhead) else {
                return nil
            }
            return (trackID, decision.label)
        })
    }

    private func activeVideoClips(in session: LocalEpisodeEditSession, at playhead: Double) -> [LocalEpisodeEditDecision] {
        session.editDecisions
            .filter { decision in
                decision.trackId.uppercased().hasPrefix("V")
                    && decision.isActive
                    && playhead >= decision.timelineStart
                    && playhead < decision.timelineStart + max(0.05, decision.duration)
            }
            .sorted { left, right in
                naturalTrackOrder(left.trackId) > naturalTrackOrder(right.trackId)
            }
    }

    private func nextActiveVideoClip(after playhead: Double, in session: LocalEpisodeEditSession) -> LocalEpisodeEditDecision? {
        session.editDecisions
            .filter { decision in
                decision.trackId.uppercased().hasPrefix("V")
                    && decision.isActive
                    && decision.timelineStart > playhead
            }
            .sorted { $0.timelineStart < $1.timelineStart }
            .first
    }

    private func naturalTrackOrder(_ trackID: String) -> Int {
        let digits = trackID.filter { $0.isNumber }
        let value = Int(digits) ?? 0
        if trackID.uppercased().hasPrefix("V") { return 10_000 + value }
        if trackID.uppercased().hasPrefix("A") { return value }
        return 5_000 + value
    }
}

struct LocalEpisodeRelinkResult: Equatable {
    var checkedUniqueMissingPaths: Int
    var resolvedUniquePaths: Int
    var changedClips: Int
    var unresolvedFileNames: [String]
}

struct LocalEpisodeSourceGapLinkResult: Equatable {
    var groupLabel: String
    var fileName: String
    var changedClips: Int
    var fileExists: Bool
}

struct LocalEpisodeUndoRedoState: Equatable {
    var canUndo: Bool
    var canRedo: Bool
    var undoLabel: String?
    var redoLabel: String?
    var undoCount: Int
    var redoCount: Int
}

struct LocalEpisodeEditOperationSmokeResult: Equatable {
    var ok: Bool
    var message: String
    var targetClipId: String
    var targetClipName: String
    var targetTrackId: String
    var beforeIsActive: Bool
    var changedIsActive: Bool
    var restoredIsActive: Bool
    var beforeSourceStart: Double
    var changedSourceStart: Double
    var restoredSourceStart: Double
}

struct LocalEpisodeTimelineHandleTrimSmokeResult: Equatable {
    var ok: Bool
    var message: String
    var targetClipId: String
    var targetClipName: String
    var targetTrackId: String
    var beforeClipCount: Int
    var changedInClipCount: Int
    var changedOutClipCount: Int
    var restoredClipCount: Int
    var sourceInDelta: Double
    var sourceOutDelta: Double
    var precisionSourceInDeltas: [Double]
    var precisionSourceInStarts: [Double]
    var precisionSourceInWorked: Bool
    var precisionSourceOutDeltas: [Double]
    var precisionSourceOutEnds: [Double]
    var precisionSourceOutWorked: Bool
    var beforeSourceStart: Double
    var changedInSourceStart: Double
    var restoredSourceStart: Double
    var beforeSourceEnd: Double
    var changedOutSourceEnd: Double
    var restoredSourceEnd: Double
    var beforeDuration: Double
    var changedInDuration: Double
    var changedOutDuration: Double
    var restoredDuration: Double
    var sourceInWorked: Bool
    var sourceOutWorked: Bool
    var restoredCleanly: Bool

    static func empty(message: String) -> LocalEpisodeTimelineHandleTrimSmokeResult {
        LocalEpisodeTimelineHandleTrimSmokeResult(
            ok: false,
            message: message,
            targetClipId: "",
            targetClipName: "",
            targetTrackId: "",
            beforeClipCount: 0,
            changedInClipCount: 0,
            changedOutClipCount: 0,
            restoredClipCount: 0,
            sourceInDelta: 0,
            sourceOutDelta: 0,
            precisionSourceInDeltas: [],
            precisionSourceInStarts: [],
            precisionSourceInWorked: false,
            precisionSourceOutDeltas: [],
            precisionSourceOutEnds: [],
            precisionSourceOutWorked: false,
            beforeSourceStart: 0,
            changedInSourceStart: 0,
            restoredSourceStart: 0,
            beforeSourceEnd: 0,
            changedOutSourceEnd: 0,
            restoredSourceEnd: 0,
            beforeDuration: 0,
            changedInDuration: 0,
            changedOutDuration: 0,
            restoredDuration: 0,
            sourceInWorked: false,
            sourceOutWorked: false,
            restoredCleanly: false
        )
    }
}

struct LocalEpisodeSplitSmokeResult: Equatable {
    var ok: Bool
    var message: String
    var targetClipId: String
    var targetClipName: String
    var targetTrackId: String
    var newClipId: String
    var splitAt: Double
    var beforeClipCount: Int
    var changedClipCount: Int
    var restoredClipCount: Int
    var leftDuration: Double
    var rightDuration: Double
    var sourceContinuity: Bool
    var restoredHasNewClip: Bool

    static func empty(message: String) -> LocalEpisodeSplitSmokeResult {
        LocalEpisodeSplitSmokeResult(
            ok: false,
            message: message,
            targetClipId: "",
            targetClipName: "",
            targetTrackId: "",
            newClipId: "",
            splitAt: 0,
            beforeClipCount: 0,
            changedClipCount: 0,
            restoredClipCount: 0,
            leftDuration: 0,
            rightDuration: 0,
            sourceContinuity: false,
            restoredHasNewClip: false
        )
    }
}

struct LocalEpisodeTimelineUndoRedoSmokeResult: Equatable {
    var ok: Bool
    var message: String
    var targetClipId: String
    var targetClipName: String
    var targetTrackId: String
    var beforeStartIn: Double
    var movedStartIn: Double
    var undoneStartIn: Double
    var redoneStartIn: Double
    var restoredStartIn: Double
    var undoWorked: Bool
    var redoWorked: Bool
    var restoredCleanly: Bool

    static func empty(message: String) -> LocalEpisodeTimelineUndoRedoSmokeResult {
        LocalEpisodeTimelineUndoRedoSmokeResult(
            ok: false,
            message: message,
            targetClipId: "",
            targetClipName: "",
            targetTrackId: "",
            beforeStartIn: 0,
            movedStartIn: 0,
            undoneStartIn: 0,
            redoneStartIn: 0,
            restoredStartIn: 0,
            undoWorked: false,
            redoWorked: false,
            restoredCleanly: false
        )
    }
}

struct LocalEpisodeTimelineMoveSmokeResult: Equatable {
    var ok: Bool
    var message: String
    var targetClipId: String
    var targetClipName: String
    var targetTrackId: String
    var beforeStartIn: Double
    var movedStartIn: Double
    var restoredStartIn: Double
    var delta: Double
    var precisionDeltas: [Double]
    var precisionStartIns: [Double]
    var precisionWorked: Bool
    var beforeClipCount: Int
    var restoredClipCount: Int
    var movedByDelta: Bool
    var restoredCleanly: Bool

    static func empty(message: String) -> LocalEpisodeTimelineMoveSmokeResult {
        LocalEpisodeTimelineMoveSmokeResult(
            ok: false,
            message: message,
            targetClipId: "",
            targetClipName: "",
            targetTrackId: "",
            beforeStartIn: 0,
            movedStartIn: 0,
            restoredStartIn: 0,
            delta: 0,
            precisionDeltas: [],
            precisionStartIns: [],
            precisionWorked: false,
            beforeClipCount: 0,
            restoredClipCount: 0,
            movedByDelta: false,
            restoredCleanly: false
        )
    }
}

struct LocalEpisodeMotionInspectorSmokeResult: Equatable {
    var ok: Bool
    var message: String
    var targetClipId: String
    var targetClipName: String
    var targetTrackId: String
    var beforeHadMotion: Bool
    var adjustedHadMotion: Bool
    var beforeScale: Double
    var adjustedScale: Double
    var undoneMatchesBefore: Bool
    var redoneMatchesAdjusted: Bool
    var restoredCleanly: Bool

    static func empty(message: String) -> LocalEpisodeMotionInspectorSmokeResult {
        LocalEpisodeMotionInspectorSmokeResult(
            ok: false,
            message: message,
            targetClipId: "",
            targetClipName: "",
            targetTrackId: "",
            beforeHadMotion: false,
            adjustedHadMotion: false,
            beforeScale: 1,
            adjustedScale: 1,
            undoneMatchesBefore: false,
            redoneMatchesAdjusted: false,
            restoredCleanly: false
        )
    }
}

private extension LocalEpisodeEditStore {
    nonisolated static func runProofRenderProcess(projectSlug: String, episodeSlug: String, start: Double, duration: Double, mediaWorkspacePath: String? = nil) -> LocalEpisodeProofRenderProcessResult {
        runProgramRenderProcess(
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            proofArguments: [
                "--start",
                proofNumber(start),
                "--duration",
                proofNumber(duration),
                "--width",
                "426",
                "--height",
                "240",
                "--fps",
                "12",
            ],
            failurePrefix: "Proof render",
            mediaWorkspacePath: mediaWorkspacePath
        )
    }

    nonisolated static func runDraftExportProcess(projectSlug: String, episodeSlug: String, width: Int = 1280, height: Int = 720, mediaWorkspacePath: String? = nil) -> LocalEpisodeProofRenderProcessResult {
        runChunkedDraftExportProcess(projectSlug: projectSlug, episodeSlug: episodeSlug, width: width, height: height, mediaWorkspacePath: mediaWorkspacePath)
    }

    nonisolated static func runSourceReadinessAuditProcess(projectSlug: String, episodeSlugs: [String], mediaWorkspacePath: String? = nil) -> LocalEpisodeSourceReadinessProcessResult {
        guard let repoRoot = developmentRepoRootURL() else {
            return LocalEpisodeSourceReadinessProcessResult(
                ok: false,
                outputPath: nil,
                message: "Could not locate the high-ground-studio repo from the running app bundle.",
                summary: nil
            )
        }

        let readinessScript = repoRoot
            .appendingPathComponent("apps/quipsly-mac/script/render_program_source_readiness.mjs")

        guard FileManager.default.fileExists(atPath: readinessScript.path) else {
            return LocalEpisodeSourceReadinessProcessResult(
                ok: false,
                outputPath: nil,
                message: "Source readiness script is missing from \(repoRoot.path).",
                summary: nil
            )
        }

        let result = runNodeScript(
            scriptURL: readinessScript,
            workingDirectory: repoRoot,
            arguments: [projectSlug] + episodeSlugs,
            environment: mediaWorkspaceEnvironment(mediaWorkspacePath)
        )

        let outputPath = lastSourceReadinessOutputPath(from: result.stdout)
        return LocalEpisodeSourceReadinessProcessResult(
            ok: result.exitCode == 0,
            outputPath: outputPath,
            message: shortProcessMessage(result),
            summary: sourceReadinessSummary(
                from: result.stdout,
                ok: result.exitCode == 0,
                fallbackOutputPath: outputPath,
                fallbackEpisodeSlugs: episodeSlugs
            )
        )
    }

    nonisolated static func runSourceMaterializationWatchProcess(projectSlug: String, episodeSlugs: [String], maxWaitSeconds: Int, mediaWorkspacePath: String? = nil) -> LocalEpisodeSourceReadinessProcessResult {
        guard let repoRoot = developmentRepoRootURL() else {
            return LocalEpisodeSourceReadinessProcessResult(
                ok: false,
                outputPath: nil,
                message: "Could not locate the high-ground-studio repo from the running app bundle.",
                summary: nil
            )
        }

        let watchScript = repoRoot
            .appendingPathComponent("apps/quipsly-mac/script/render_program_source_watch.mjs")

        guard FileManager.default.fileExists(atPath: watchScript.path) else {
            return LocalEpisodeSourceReadinessProcessResult(
                ok: false,
                outputPath: nil,
                message: "Source watcher script is missing from \(repoRoot.path).",
                summary: nil
            )
        }

        let result = runNodeScript(
            scriptURL: watchScript,
            workingDirectory: repoRoot,
            arguments: [
                projectSlug,
            ] + episodeSlugs + [
                "--request",
                "--interval-seconds",
                "30",
                "--max-wait-seconds",
                "\(maxWaitSeconds)",
            ],
            environment: mediaWorkspaceEnvironment(mediaWorkspacePath)
        )

        let outputPath = lastSourceReadinessOutputPath(from: result.stdout)
        return LocalEpisodeSourceReadinessProcessResult(
            ok: result.exitCode == 0,
            outputPath: outputPath,
            message: shortProcessMessage(result),
            summary: sourceReadinessSummary(
                from: result.stdout,
                ok: result.exitCode == 0,
                fallbackOutputPath: outputPath,
                fallbackEpisodeSlugs: episodeSlugs
            )
        )
    }

    nonisolated static func runPublishProcess(projectSlug: String, episodeSlug: String, exportPath: String, mediaWorkspacePath: String? = nil) -> LocalEpisodeProofRenderProcessResult {
        guard let repoRoot = developmentRepoRootURL() else {
            return LocalEpisodeProofRenderProcessResult(ok: false, outputPath: nil, message: "Could not locate repo root.")
        }

        let publishScript = repoRoot.appendingPathComponent("apps/quipsly-mac/script/publish_to_worldhub.mjs")
        guard FileManager.default.fileExists(atPath: publishScript.path) else {
            return LocalEpisodeProofRenderProcessResult(ok: false, outputPath: nil, message: "publish_to_worldhub.mjs is missing.")
        }

        let result = runNodeScript(
            scriptURL: publishScript,
            workingDirectory: repoRoot,
            arguments: [projectSlug, episodeSlug, exportPath],
            environment: mediaWorkspaceEnvironment(mediaWorkspacePath)
        )

        return LocalEpisodeProofRenderProcessResult(
            ok: result.exitCode == 0,
            outputPath: nil,
            message: shortProcessMessage(result)
        )
    }

    nonisolated static func runChunkedDraftExportProcess(projectSlug: String, episodeSlug: String, width: Int = 1280, height: Int = 720, mediaWorkspacePath: String? = nil) -> LocalEpisodeProofRenderProcessResult {
        guard let repoRoot = developmentRepoRootURL() else {
            return LocalEpisodeProofRenderProcessResult(
                ok: false,
                outputPath: nil,
                message: "Could not locate the high-ground-studio repo from the running app bundle."
            )
        }

        let planScript = repoRoot
            .appendingPathComponent("apps/quipsly-mac/script/render_manifest_program_plan.mjs")
        let chunkedScript = repoRoot
            .appendingPathComponent("apps/quipsly-mac/script/render_program_chunked_export.mjs")

        guard FileManager.default.fileExists(atPath: planScript.path),
              FileManager.default.fileExists(atPath: chunkedScript.path)
        else {
            return LocalEpisodeProofRenderProcessResult(
                ok: false,
                outputPath: nil,
                message: "Chunked renderer scripts are missing from \(repoRoot.path)."
            )
        }

        let planResult = runNodeScript(
            scriptURL: planScript,
            workingDirectory: repoRoot,
            arguments: [projectSlug, episodeSlug],
            environment: mediaWorkspaceEnvironment(mediaWorkspacePath)
        )
        guard planResult.exitCode == 0 else {
            return LocalEpisodeProofRenderProcessResult(
                ok: false,
                outputPath: nil,
                message: "Program plan failed: \(shortProcessMessage(planResult))"
            )
        }

        let renderResult = runNodeScript(
            scriptURL: chunkedScript,
            workingDirectory: repoRoot,
            arguments: [
                projectSlug,
                episodeSlug,
                "--width",
                "\(width)",
                "--height",
                "\(height)",
                "--fps",
                "24",
                "--chunk-seconds",
                "60",
                "--chunk-timeout-ms",
                "180000",
            ],
            environment: mediaWorkspaceEnvironment(mediaWorkspacePath)
        )

        let outputPath = proofOutputPath(from: renderResult.stdout)
        guard renderResult.exitCode == 0, outputPath != nil else {
            return LocalEpisodeProofRenderProcessResult(
                ok: false,
                outputPath: outputPath,
                message: "Draft export failed: \(shortProcessMessage(renderResult))"
            )
        }

        return LocalEpisodeProofRenderProcessResult(
            ok: true,
            outputPath: outputPath,
            message: "Draft export completed."
        )
    }

    nonisolated static func runProgramRenderProcess(projectSlug: String, episodeSlug: String, proofArguments: [String], failurePrefix: String, mediaWorkspacePath: String? = nil) -> LocalEpisodeProofRenderProcessResult {
        guard let repoRoot = developmentRepoRootURL() else {
            return LocalEpisodeProofRenderProcessResult(
                ok: false,
                outputPath: nil,
                message: "Could not locate the high-ground-studio repo from the running app bundle."
            )
        }

        let planScript = repoRoot
            .appendingPathComponent("apps/quipsly-mac/script/render_manifest_program_plan.mjs")
        let proofScript = repoRoot
            .appendingPathComponent("apps/quipsly-mac/script/render_program_proof.mjs")

        guard FileManager.default.fileExists(atPath: planScript.path),
              FileManager.default.fileExists(atPath: proofScript.path)
        else {
            return LocalEpisodeProofRenderProcessResult(
                ok: false,
                outputPath: nil,
                message: "Renderer scripts are missing from \(repoRoot.path)."
            )
        }

        let planResult = runNodeScript(
            scriptURL: planScript,
            workingDirectory: repoRoot,
            arguments: [projectSlug, episodeSlug],
            environment: mediaWorkspaceEnvironment(mediaWorkspacePath)
        )
        guard planResult.exitCode == 0 else {
            return LocalEpisodeProofRenderProcessResult(
                ok: false,
                outputPath: nil,
                message: "Program plan failed: \(shortProcessMessage(planResult))"
            )
        }

        let proofResult = runNodeScript(
            scriptURL: proofScript,
            workingDirectory: repoRoot,
            arguments: [projectSlug, episodeSlug] + proofArguments,
            environment: mediaWorkspaceEnvironment(mediaWorkspacePath)
        )

        let outputPath = proofOutputPath(from: proofResult.stdout)
        guard proofResult.exitCode == 0, outputPath != nil else {
            return LocalEpisodeProofRenderProcessResult(
                ok: false,
                outputPath: outputPath,
                message: "\(failurePrefix) failed: \(shortProcessMessage(proofResult))"
            )
        }

        return LocalEpisodeProofRenderProcessResult(
            ok: true,
            outputPath: outputPath,
            message: "\(failurePrefix) completed."
        )
    }

    nonisolated static func runNodeScript(scriptURL: URL, workingDirectory: URL, arguments: [String], environment: [String: String] = [:]) -> LocalEpisodeProcessResult {
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/env")
        process.currentDirectoryURL = workingDirectory
        process.arguments = ["node", scriptURL.path] + arguments
        if !environment.isEmpty {
            process.environment = ProcessInfo.processInfo.environment.merging(environment) { _, new in new }
        }

        let stdout = Pipe()
        let stderr = Pipe()
        process.standardOutput = stdout
        process.standardError = stderr

        do {
            try process.run()
            process.waitUntilExit()
        } catch {
            return LocalEpisodeProcessResult(exitCode: -1, stdout: "", stderr: error.localizedDescription)
        }

        return LocalEpisodeProcessResult(
            exitCode: Int(process.terminationStatus),
            stdout: String(data: stdout.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? "",
            stderr: String(data: stderr.fileHandleForReading.readDataToEndOfFile(), encoding: .utf8) ?? ""
        )
    }

    nonisolated static func mediaWorkspaceEnvironment(_ mediaWorkspacePath: String?) -> [String: String] {
        let rootPath = QuipslyMediaWorkspace.normalizedRootPath(mediaWorkspacePath)
        return [
            "QUIPSLY_MAC_MEDIA_WORKSPACE_PATH": rootPath,
            "QUIPSLY_MEDIA_CACHE_DIR": QuipslyMediaWorkspace.proxyCacheRootURL(rootPath: rootPath).path,
            "QUIPSLY_MAC_RENDER_OUTPUT_ROOT": QuipslyMediaWorkspace.renderOutputRootURL(rootPath: rootPath).path,
        ]
    }

    nonisolated static func developmentRepoRootURL() -> URL? {
        let bundlePath = Bundle.main.bundleURL.path
        if let range = bundlePath.range(of: "/apps/quipsly-mac/dist/QuipslyMac.app") {
            let rootPath = String(bundlePath[..<range.lowerBound])
            let rootURL = URL(fileURLWithPath: rootPath, isDirectory: true)
            if FileManager.default.fileExists(atPath: rootURL.appendingPathComponent("package.json").path) {
                return rootURL
            }
        }

        let fallback = URL(fileURLWithPath: "/Users/wall-e/Dev/high-ground-studio", isDirectory: true)
        if FileManager.default.fileExists(atPath: fallback.appendingPathComponent("package.json").path) {
            return fallback
        }

        return nil
    }

    nonisolated static func proofOutputPath(from stdout: String) -> String? {
        guard let data = stdout.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let outputPath = json["outputPath"] as? String,
              !outputPath.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        else {
            return nil
        }

        return outputPath
    }

    nonisolated static func lastSourceReadinessOutputPath(from stdout: String) -> String? {
        let pattern = #""outputPath"\s*:\s*"([^"]+)""#
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return nil
        }

        let nsRange = NSRange(stdout.startIndex..<stdout.endIndex, in: stdout)
        let matches = regex.matches(in: stdout, range: nsRange)
        guard let last = matches.last,
              let outputPathRange = Range(last.range(at: 1), in: stdout)
        else {
            return nil
        }

        return String(stdout[outputPathRange])
            .replacingOccurrences(of: #"\/"#, with: "/")
    }

    nonisolated static func sourceReadinessSummary(
        from stdout: String,
        ok: Bool,
        fallbackOutputPath: String?,
        fallbackEpisodeSlugs: [String]
    ) -> LocalEpisodeSourceReadinessSummary? {
        let outputPath = lastSourceReadinessOutputPath(from: stdout) ?? fallbackOutputPath
        let blockerCount = lastIntegerValue(for: "blockers", in: stdout)
        let downloadedCount = lastIntegerValue(for: "downloaded", in: stdout)
        let requestedCount = lastIntegerValue(for: "requested", in: stdout)
        let downloadingCount = lastIntegerValue(for: "downloading", in: stdout)

        if outputPath == nil,
           blockerCount == nil,
           downloadedCount == nil,
           requestedCount == nil,
           downloadingCount == nil {
            return nil
        }

        return LocalEpisodeSourceReadinessSummary(
            generatedAt: Date(),
            ok: ok,
            episodeSlugs: fallbackEpisodeSlugs,
            blockerCount: blockerCount ?? 0,
            downloadedCount: downloadedCount ?? 0,
            requestedCount: requestedCount ?? 0,
            downloadingCount: downloadingCount ?? 0,
            outputPath: outputPath,
            blockers: []
        )
    }

    nonisolated static func lastIntegerValue(for key: String, in stdout: String) -> Int? {
        let pattern = #""\#(key)"\s*:\s*([0-9]+)"#
        guard let regex = try? NSRegularExpression(pattern: pattern) else {
            return nil
        }

        let nsRange = NSRange(stdout.startIndex..<stdout.endIndex, in: stdout)
        let matches = regex.matches(in: stdout, range: nsRange)
        guard let last = matches.last,
              let valueRange = Range(last.range(at: 1), in: stdout)
        else {
            return nil
        }

        return Int(stdout[valueRange])
    }

    nonisolated static func proofNumber(_ value: Double) -> String {
        let rounded = (value * 1000).rounded() / 1000
        return String(format: "%.3f", rounded)
    }

    nonisolated static func shortProcessMessage(_ result: LocalEpisodeProcessResult) -> String {
        let raw = [result.stderr, result.stdout]
            .joined(separator: "\n")
            .split(separator: "\n")
            .suffix(4)
            .joined(separator: " ")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        if raw.isEmpty {
            return "Process exited with \(result.exitCode)."
        }

        return raw
    }

    nonisolated static func shellQuote(_ value: String) -> String {
        "'\(value.replacingOccurrences(of: "'", with: "'\\''"))'"
    }
}

private struct LocalEpisodeProofRenderProcessResult {
    var ok: Bool
    var outputPath: String?
    var message: String
}

private struct LocalEpisodeSourceReadinessProcessResult {
    var ok: Bool
    var outputPath: String?
    var message: String
    var summary: LocalEpisodeSourceReadinessSummary?
}

struct LocalEpisodeSourceReadinessSummary {
    var generatedAt: Date
    var ok: Bool
    var episodeSlugs: [String]
    var blockerCount: Int
    var downloadedCount: Int
    var requestedCount: Int
    var downloadingCount: Int
    var outputPath: String?
    var blockers: [LocalEpisodeSourceReadinessBlockerSummary]

    var episodeLabel: String {
        episodeSlugs.joined(separator: ", ")
    }
}

struct LocalEpisodeSourceReadinessBlockerSummary: Identifiable {
    var id: String
    var episodeSlug: String
    var label: String
    var trackIds: [String]
    var provider: String?
    var allocatedBytes: Int64?
    var statBytes: Int64?
    var resolvedPath: String?
    var recommendedAction: String?
    var isDownloaded: Bool
    var isDownloading: Bool
    var isDownloadRequested: Bool

    var trackLabel: String {
        trackIds.isEmpty ? "Untracked source" : trackIds.joined(separator: ", ")
    }
}

private struct LocalEpisodeSourceReadinessDiskReport: Decodable {
    var ok: Bool?
    var episodeSlugs: [String]?
    var episodes: [LocalEpisodeSourceReadinessDiskEpisode]?
}

private struct LocalEpisodeSourceReadinessDiskEpisode: Decodable {
    var episodeSlug: String?
    var blockers: [LocalEpisodeSourceReadinessDiskBlocker]?
}

private struct LocalEpisodeSourceReadinessDiskBlocker: Decodable {
    var type: String?
    var mediaPath: String?
    var resolvedPath: String?
    var names: [String]?
    var trackIds: [String]?
    var allocatedBytes: Int64?
    var statBytes: Int64?
    var provider: String?
    var recommendedAction: String?
    var message: String?
    var fileProviderState: LocalEpisodeSourceReadinessDiskFileProviderState?

    var displayName: String {
        if let first = names?.first, !first.isEmpty {
            return first
        }

        if let resolvedPath, !resolvedPath.isEmpty {
            return URL(fileURLWithPath: resolvedPath).lastPathComponent
        }

        if let mediaPath, !mediaPath.isEmpty {
            return URL(fileURLWithPath: mediaPath).lastPathComponent
        }

        return type ?? "Unresolved source"
    }
}

private struct LocalEpisodeSourceReadinessDiskFileProviderState: Decodable {
    var isDownloaded: Bool?
    var isDownloading: Bool?
    var isDownloadRequested: Bool?
}

private struct LocalEpisodeProcessResult {
    var exitCode: Int
    var stdout: String
    var stderr: String
}

struct LocalEpisodePlaybackModeSmokeResult: Equatable {
    var ok: Bool
    var message: String
    var targetClipId: String
    var targetClipName: String
    var targetTrackId: String
    var playhead: Double
    var playAllBeforeClipName: String
    var playEditBeforeClipName: String
    var playAllAfterClipName: String
    var playEditAfterClipName: String?
    var editSkippedDeactivatedTarget: Bool
    var nextActiveClipName: String?
    var nextActivePlayhead: Double?
}

struct LocalEpisodeMonitorWallSmokeResult: Equatable {
    var ok: Bool
    var message: String
    var targetClipId: String
    var targetClipName: String
    var targetTrackId: String
    var playhead: Double
    var sourceTrackCountBefore: Int
    var activeOverlapCountBefore: Int
    var sourceTracksBefore: [String: String]
    var sourceTracksAfter: [String: String]
    var programEditBeforeClipName: String
    var programAllBeforeClipName: String
    var programEditAfterClipName: String?
    var programAllAfterClipName: String
    var sourceMonitorTargetBeforeClipName: String
    var sourceMonitorTargetAfterClipName: String
    var sourceStillShowsTargetAfterDeactivation: Bool
    var editSkippedDeactivatedTarget: Bool

    static func empty(message: String) -> LocalEpisodeMonitorWallSmokeResult {
        LocalEpisodeMonitorWallSmokeResult(
            ok: false,
            message: message,
            targetClipId: "",
            targetClipName: "",
            targetTrackId: "",
            playhead: 0,
            sourceTrackCountBefore: 0,
            activeOverlapCountBefore: 0,
            sourceTracksBefore: [:],
            sourceTracksAfter: [:],
            programEditBeforeClipName: "",
            programAllBeforeClipName: "",
            programEditAfterClipName: nil,
            programAllAfterClipName: "",
            sourceMonitorTargetBeforeClipName: "",
            sourceMonitorTargetAfterClipName: "",
            sourceStillShowsTargetAfterDeactivation: false,
            editSkippedDeactivatedTarget: false
        )
    }
}

private struct LocalEpisodeEditUndoCheckpoint {
    var label: String
    var session: LocalEpisodeEditSession
}
