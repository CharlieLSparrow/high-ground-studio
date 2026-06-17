import SwiftUI
import AVKit
import QuipslyVideoCore
import UniformTypeIdentifiers

struct WorkspaceView: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    @ObservedObject var projectStore: ProjectStore
    
    @State private var pan: Double = 0.5
    @State private var tilt: Double = 0.5
    @State private var zoom: Double = 0.5
    
    @State private var showErrorAlert = false
    @State private var errorMessage: String? = nil
    
    @State private var playbackMode: PlaybackMode = .playEdit
    
    var body: some View {
        VStack(spacing: 20) {
            // Main Toolbar
            HStack {
                Button(action: {
                    importVideo()
                }) {
                    Label("Import Video", systemImage: "plus.circle")
                }
                
                Spacer()
                
                Picker("Mode", selection: $playbackMode) {
                    ForEach(PlaybackMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .pickerStyle(SegmentedPickerStyle())
                .frame(width: 200)
                .onChange(of: playbackMode) { _ in
                    rebuildPlayer()
                }
                
                Spacer()
                
                if projectStore.activeSequence != nil {
                    Button(action: {
                        exportVideo()
                    }) {
                        Label("Export 9:16 Reframed", systemImage: "square.and.arrow.up")
                    }
                    .buttonStyle(.borderedProminent)
                }
            }
            .padding(.horizontal)
            .padding(.top, 10)
            
            // Dual Viewers
            if playbackEngine.player != nil {
                DualViewers(playbackEngine: playbackEngine)
                    .frame(height: 400)
            } else {
                Rectangle()
                    .fill(Color.black.opacity(0.8))
                    .frame(height: 400)
                    .cornerRadius(8)
                    .overlay(
                        VStack(spacing: 16) {
                            Image(systemName: "film.circle")
                                .font(.system(size: 48))
                                .foregroundColor(.gray)
                            Text("No Media Imported")
                                .font(.headline)
                                .foregroundColor(.gray)
                        }
                    )
            }
            
            // Transport Controls
            NativeTransportControls(playbackEngine: playbackEngine)
                .padding(.vertical, 8)
                .padding(.horizontal)
                .background(Color(NSColor.controlBackgroundColor))
                .cornerRadius(8)
                .padding(.horizontal)
            
            // Sliders
            VStack(spacing: 12) {
                HStack {
                    Text("Pan").frame(width: 50, alignment: .leading)
                    Slider(value: Binding(
                        get: { self.pan },
                        set: { newValue in
                            self.pan = newValue
                            updateKeyframe()
                        }
                    ), in: 0...1)
                }
                HStack {
                    Text("Tilt").frame(width: 50, alignment: .leading)
                    Slider(value: Binding(
                        get: { self.tilt },
                        set: { newValue in
                            self.tilt = newValue
                            updateKeyframe()
                        }
                    ), in: 0...1)
                }
                HStack {
                    Text("Zoom").frame(width: 50, alignment: .leading)
                    Slider(value: Binding(
                        get: { self.zoom },
                        set: { newValue in
                            self.zoom = newValue
                            updateKeyframe()
                        }
                    ), in: 0...1)
                }
            }
            .padding()
            .background(Color.secondary.opacity(0.1))
            .cornerRadius(8)
            
            // Timeline and Keyframes
            HStack {
                Button("Add Keyframe") {
                    addKeyframe()
                }
                .disabled(playbackEngine.player == nil)
                
                Spacer()
                
                Text(String(format: "Time: %.2f s", playbackEngine.playhead))
                    .monospacedDigit()
            }
            .padding(.horizontal)
            
            // Timeline Editor
            TimelineEditorView(playbackEngine: playbackEngine, projectStore: projectStore)
                .frame(maxHeight: .infinity)
                .padding(.horizontal)
            
            Spacer()
        }
        .padding()
        .dropDestination(for: URL.self) { items, location in
            if let url = items.first {
                loadVideoIntoProject(url: url)
                return true
            }
            return false
        }
        .alert(isPresented: $showErrorAlert) {
            Alert(title: Text("Import Status"), message: Text(errorMessage ?? "Unknown Error"), dismissButton: .default(Text("OK")))
        }
        .onAppear {
            let path = "/Users/wall-e/Library/CloudStorage/GoogleDrive-charlie@highgroundodyssey.com/Shared drives/HighGroundDrive/Podcast/Episode 1/First Pod Ever.wav"
            let url = URL(fileURLWithPath: path)
            if FileManager.default.fileExists(atPath: path) {
                print("DEBUG: Auto-importing \(path)")
                loadVideoIntoProject(url: url)
            } else {
                print("DEBUG: Auto-import file not found at \(path)")
            }
        }
        .onReceive(AgentServer.shared.$trigger) { _ in
            let cmd = AgentServer.shared.commandToExecute
            if cmd == "import_file" {
                    if let path = AgentServer.shared.importFilePath {
                        self.errorMessage = "Agent commanded import of \(path)"
                        self.showErrorAlert = true
                        loadVideoIntoProject(url: URL(fileURLWithPath: path))
                        
                        var status: [String: Any] = [:]
                        if let seq = projectStore.activeSequence {
                            status["lanes"] = seq.lanes.map { lane -> [String: Any] in
                                let d = lane.sourceVideo?.duration ?? 0
                                let safeD = d.isNaN || d.isInfinite ? 0 : d
                                return ["id": lane.id.uuidString, "name": lane.name, "duration": safeD]
                            }
                        }
                        status["last_error"] = "Agent commanded import of \(path)"
                        AgentServer.shared.writeStatus(status)
                    }
                } else if cmd == "edit" {
                    if let laneIdStr = AgentServer.shared.editLaneId, let laneId = UUID(uuidString: laneIdStr) {
                        if let seq = projectStore.activeSequence, let laneIndex = seq.lanes.firstIndex(where: { $0.id == laneId }) {
                            var newSeq = seq
                            let action = AgentServer.shared.editAction
                            if action == "offset" {
                                if let offset = AgentServer.shared.editValue1 {
                                    newSeq.lanes[laneIndex].sourceVideo?.offset = offset
                                    projectStore.updateSequence(newSeq, undoManager: nil, actionName: "Offset")
                                    rebuildPlayer()
                                }
                            } else if action == "cut" {
                                if let start = AgentServer.shared.editValue1, let duration = AgentServer.shared.editValue2 {
                                    let tag = VideoTag(type: .cut, startTime: start, duration: duration)
                                    newSeq.lanes[laneIndex].tags.append(tag)
                                    projectStore.updateSequence(newSeq, undoManager: nil, actionName: "Cut")
                                    rebuildPlayer()
                                }
                            } else if action == "active" {
                                if let start = AgentServer.shared.editValue1, let duration = AgentServer.shared.editValue2 {
                                    let tag = VideoTag(type: .active, startTime: start, duration: duration)
                                    newSeq.lanes[laneIndex].tags.append(tag)
                                    projectStore.updateSequence(newSeq, undoManager: nil, actionName: "Active")
                                    rebuildPlayer()
                                }
                            }
                        }
                    }
                    AgentServer.shared.writeStatus(["status": "edit_commanded"])
                } else if cmd == "get_state" {
                    var status: [String: Any] = [:]
                    if let seq = projectStore.activeSequence {
                        status["lanes"] = seq.lanes.map { lane -> [String: Any] in
                            let d = lane.sourceVideo?.duration ?? 0
                            let safeD = d.isNaN || d.isInfinite ? 0 : d
                            return ["id": lane.id.uuidString, "name": lane.name, "duration": safeD]
                        }
                    }
                    if let err = errorMessage {
                        status["last_error"] = err
                    }
                    AgentServer.shared.writeStatus(status)
                }
        }
    }
    
    private func playheadOffset(in width: CGFloat) -> CGFloat {
        guard let duration = projectStore.activeSequence?.duration, duration > 0 else { return 0 }
        let percent = playbackEngine.playhead / duration
        return width * CGFloat(max(0, min(1, percent)))
    }
    
    private func importVideo() {
        let panel = NSOpenPanel()
        var allowed: [UTType] = [.mpeg4Movie, .quickTimeMovie, .wav, .audio]
        if let insv = UTType(filenameExtension: "insv") {
            allowed.append(insv)
        }
        panel.allowedContentTypes = allowed
        panel.allowsMultipleSelection = false
        panel.canChooseDirectories = false
        
        if panel.runModal() == .OK, let url = panel.url {
            loadVideoIntoProject(url: url)
        }
    }
    
    private func loadVideoIntoProject(url: URL) {
        print("DEBUG: loadVideoIntoProject called with url: \(url)")
        Task {
            print("DEBUG: Task started")
            let options: [String: Any]? = url.pathExtension.lowercased() == "insv" ? ["AVURLAssetOutOfBandMIMETypeKey": "video/mp4"] : nil
            let asset = AVURLAsset(url: url, options: options)
            
            var seconds: Double = 60.0
            do {
                let duration = try await asset.load(.duration)
                seconds = duration.seconds
                print("DEBUG: Loaded duration: \(seconds)")
            } catch {
                print("DEBUG: Error loading duration: \(error)")
                await MainActor.run {
                    self.errorMessage = "Failed to load duration: \(error.localizedDescription)"
                    self.showErrorAlert = true
                }
                // We'll still proceed with 60.0s for debugging
            }
            
            let laneId = UUID()
            
            await MainActor.run {
                print("DEBUG: MainActor.run starting")
                let sourceVideo = SourceVideo(id: UUID(), mediaURL: url, proxyURL: nil, duration: seconds)
                
                var project = projectStore.project
                var sequence: MediaSequence
                if let firstSequence = project.sequences.first {
                    sequence = firstSequence
                } else {
                    sequence = MediaSequence(id: UUID(), title: "Sequence 1", orientationTrack: OrientationTrack(keyframes: []), lanes: [])
                }
                
                let laneName = url.lastPathComponent
                let newLane = VideoLane(id: laneId, name: laneName, sourceVideo: sourceVideo, tags: [])
                sequence.lanes.append(newLane)
                
                if project.sequences.isEmpty {
                    project.sequences.append(sequence)
                    projectStore.project = project
                    projectStore.activeSequenceId = sequence.id
                    
                    if url.pathExtension.lowercased() != "wav" {
                        addKeyframe(at: 0, pan: 0.5, tilt: 0.5, zoom: 0.5)
                    }
                } else {
                    if let index = project.sequences.firstIndex(where: { $0.id == sequence.id }) {
                        project.sequences[index] = sequence
                        projectStore.updateProject(project, undoManager: nil, actionName: "Add Media")
                        print("DEBUG: Project updated")
                    }
                }
                
                print("DEBUG: Calling rebuildPlayer")
                rebuildPlayer()
            }
            
            if url.pathExtension.lowercased() != "wav" {
                print("DEBUG: Generating proxy...")
                do {
                    let proxyURL = try await ProxyEngine.shared.generateProxy(for: url)
                    print("DEBUG: Proxy generated at \(proxyURL)")
                    await MainActor.run {
                        var project = projectStore.project
                        if var sequence = project.sequences.first {
                            if let laneIndex = sequence.lanes.firstIndex(where: { $0.id == laneId }) {
                                sequence.lanes[laneIndex].sourceVideo?.proxyURL = proxyURL
                                if let seqIndex = project.sequences.firstIndex(where: { $0.id == sequence.id }) {
                                    project.sequences[seqIndex] = sequence
                                    projectStore.project = project
                                    print("DEBUG: Rebuilding player with proxy")
                                    rebuildPlayer()
                                }
                            }
                        }
                    }
                } catch {
                    print("Proxy generation failed: \(error)")
                }
            }
        }
    }
    
    private func exportVideo() {
        guard let sequence = projectStore.activeSequence else { return }
        
        let panel = NSSavePanel()
        panel.allowedContentTypes = [.mpeg4Movie]
        panel.nameFieldStringValue = "ReframedExport.mp4"
        
        if panel.runModal() == .OK, let outputURL = panel.url {
            Task {
                let exporter = AVExportRenderer()
                do {
                    // For now, we export the whole sequence by treating the base track as one big tag region.
                    // To do this, we temporarily inject a tag covering the whole sequence duration
                    // just to satisfy the exporter's tag-based clip rendering logic.
                    var exportSequence = sequence
                    if var firstLane = exportSequence.lanes.first {
                        firstLane.tags.append(VideoTag(id: UUID(), type: .keep, startTime: 0, duration: sequence.duration))
                        exportSequence.lanes[0] = firstLane
                    }
                    
                    _ = try await exporter.exportClips(
                        from: exportSequence,
                        withTag: .keep,
                        format: .vertical9x16,
                        to: outputURL.deletingLastPathComponent()
                    )
                    
                    // Since exportClips might output a bunch of clips, in a real app we'd merge them.
                    // For the prototype, we assume it exports correctly to the directory.
                    print("Export succeeded to directory: \(outputURL.deletingLastPathComponent())")
                } catch {
                    print("Export failed: \(error)")
                }
            }
        }
    }
    
    private func addKeyframe(at time: Double? = nil, pan: Double? = nil, tilt: Double? = nil, zoom: Double? = nil) {
        guard var sequence = projectStore.activeSequence else { return }
        
        let newKeyframe = FramingKeyframe(
            id: UUID(),
            time: time ?? playbackEngine.playhead,
            scale: zoom ?? self.zoom,
            offsetX: pan ?? self.pan,
            offsetY: tilt ?? self.tilt
        )
        
        sequence.orientationTrack.keyframes.removeAll(where: { abs($0.time - newKeyframe.time) < 0.1 })
        sequence.orientationTrack.keyframes.append(newKeyframe)
        sequence.orientationTrack.keyframes.sort { $0.time < $1.time }
        
        projectStore.updateSequence(sequence, undoManager: nil, actionName: "Add Keyframe")
        
        rebuildPlayer()
    }
    
    private func updateKeyframe() {
        guard var sequence = projectStore.activeSequence else { return }
        // For simplicity, just add/update keyframe at current playhead when dragging slider
        let time = playbackEngine.playhead
        
        if let index = sequence.orientationTrack.keyframes.firstIndex(where: { abs($0.time - time) < 0.5 }) {
            sequence.orientationTrack.keyframes[index].offsetX = self.pan
            sequence.orientationTrack.keyframes[index].offsetY = self.tilt
            sequence.orientationTrack.keyframes[index].scale = self.zoom
            
            projectStore.updateSequence(sequence, undoManager: nil, actionName: "Update Keyframe")
            rebuildPlayer()
        } else {
            addKeyframe()
        }
    }
    
    private func rebuildPlayer() {
        guard let sequence = projectStore.activeSequence else { return }
        
        Task { @MainActor in
            do {
                let playerItem = try await AVCompositionBuilder().buildPlayerItem(for: sequence, mode: playbackMode)
                let wasPlaying = playbackEngine.isPlaying
                let oldTime = playbackEngine.playhead
                
                playbackEngine.player = AVPlayer(playerItem: playerItem)
                playbackEngine.seek(to: oldTime)
                if wasPlaying {
                    playbackEngine.player?.play()
                }
            } catch {
                self.errorMessage = "Failed to build composition: \(error.localizedDescription)"
                self.showErrorAlert = true
                print("Failed to build item: \(error)")
            }
        }
    }
}
