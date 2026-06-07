import SwiftUI
import Combine
import AVFoundation
import AVKit

class TimelineViewModel: ObservableObject {
    private var timeObserverToken: Any?
    @Published var player: AVPlayer = AVPlayer()
    @Published var timelineState: TimelineState

    private var undoStack: [TimelineState] = []
    private var redoStack: [TimelineState] = []

    @Published var showRectilinear = false

    private func saveState() {
        undoStack.append(timelineState)
        redoStack.removeAll()
    }

    @Published var isPlaying = false {
        didSet {
            if isPlaying {
                player.play()
            } else {
                player.pause()
            }
        }
    }
    @Published var currentTime: Double = 0.0

    @Published var currentPan: Double = 0.5 {
        didSet { updateSelectedKeyframe() }
    }
    @Published var currentTilt: Double = 0.5 {
        didSet { updateSelectedKeyframe() }
    }
    @Published var currentZoom: Double = 0.5 {
        didSet { updateSelectedKeyframe() }
    }

    @Published var selectedClipIndex: Int? = 0
    @Published var selectedKeyframeIndex: Int? = nil

    init() {
        let clip1 = TimelineClip(id: UUID().uuidString, mediaAssetId: "asset1", startTime: 0, duration: 10, deactivated: false, transforms: [])
        let clip2 = TimelineClip(id: UUID().uuidString, mediaAssetId: "asset2", startTime: 10, duration: 10, deactivated: true, transforms: [])
        self.timelineState = TimelineState(clips: [clip1, clip2])
        rebuildPlayerItem()
        setupTimeObserver()
    }

    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.1, preferredTimescale: 600)
        timeObserverToken = player.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            self?.currentTime = time.seconds
        }
    }

    deinit {
        if let token = timeObserverToken {
            player.removeTimeObserver(token)
        }
    }

    func formattedTimecode() -> String {
        let totalSeconds = Int(currentTime)
        let hours = totalSeconds / 3600
        let minutes = (totalSeconds % 3600) / 60
        let seconds = totalSeconds % 60
        return String(format: "%02d:%02d:%02d", hours, minutes, seconds)
    }

    @Published var playerItemStatus: AVPlayerItem.Status = .unknown
    private var statusObserverToken: NSKeyValueObservation?

    private func recalculateStartTimes() {
        var current = 0.0
        for i in 0..<timelineState.clips.count {
            timelineState.clips[i].startTime = current
            if !timelineState.clips[i].deactivated {
                current += timelineState.clips[i].duration
            }
        }
    }

    private func rebuildPlayerItem() {
        recalculateStartTimes()
        let composition = AVMutableComposition()
        guard let videoTrack = composition.addMutableTrack(withMediaType: .video, preferredTrackID: kCMPersistentTrackID_Invalid) else { return }

        let videoComposition = AVMutableVideoComposition()
        videoComposition.customVideoCompositorClass = ReframingCompositor.self
        videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
        videoComposition.renderSize = CGSize(width: 1920, height: 1080)

        var instructions: [ReframingCompositionInstruction] = []
        let activeClips = timelineState.clips.filter { !$0.deactivated }

        if activeClips.isEmpty {
            player.replaceCurrentItem(with: nil)
            DispatchQueue.main.async {
                self.playerItemStatus = .unknown
            }
            return
        }

        for clip in activeClips {
            let start = CMTime(seconds: clip.startTime, preferredTimescale: 600)
            let duration = CMTime(seconds: max(clip.duration, 0.1), preferredTimescale: 600)
            let timeRange = CMTimeRange(start: start, duration: duration)

            var fileURL = Bundle.main.url(forResource: clip.mediaAssetId, withExtension: "mp4")
            if fileURL == nil {
                let projPath = "/Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture/HighGroundCapture/\(clip.mediaAssetId).mp4"
                if FileManager.default.fileExists(atPath: projPath) {
                    fileURL = URL(fileURLWithPath: projPath)
                }
            }
            let finalURL = fileURL ?? URL(fileURLWithPath: NSTemporaryDirectory()).appendingPathComponent("\(clip.mediaAssetId).mp4")
            let asset = AVURLAsset(url: finalURL)

            var inserted = false
            if FileManager.default.fileExists(atPath: finalURL.path), let assetTrack = asset.tracks(withMediaType: .video).first {
                do {
                    try videoTrack.insertTimeRange(CMTimeRange(start: CMTime(seconds: clip.mediaOffset, preferredTimescale: 600), duration: duration), of: assetTrack, at: start)
                    inserted = true
                } catch {
                    inserted = false
                }
            }

            if !inserted {
                try? videoTrack.insertEmptyTimeRange(timeRange)
            }

            let instruction = ReframingCompositionInstruction(timeRange: timeRange, sourceTrackID: videoTrack.trackID, keyframes: clip.transforms ?? [])
            instructions.append(instruction)
        }

        let playerItem: AVPlayerItem
        if !instructions.isEmpty {
            videoComposition.instructions = instructions
            playerItem = AVPlayerItem(asset: composition)
            playerItem.videoComposition = videoComposition
        } else {
            playerItem = AVPlayerItem(asset: composition)
        }

        statusObserverToken = playerItem.observe(\.status, options: [.new, .initial]) { [weak self] item, _ in
            DispatchQueue.main.async {
                self?.playerItemStatus = item.status
            }
        }

        player.replaceCurrentItem(with: playerItem)
    }

    func addClip() {
        saveState()
        let startTime = timelineState.clips.map { $0.startTime + $0.duration }.max() ?? 0.0
        let newClip = TimelineClip(id: UUID().uuidString, mediaAssetId: "asset1", startTime: startTime, duration: 10, deactivated: false, transforms: [])
        timelineState.clips.append(newClip)
        rebuildPlayerItem()
    }

    func splitClip(at index: Int) {
        saveState()
        let clip = timelineState.clips[index]
        let newClip = TimelineClip(id: UUID().uuidString, mediaAssetId: clip.mediaAssetId, startTime: clip.startTime + clip.duration / 2, duration: clip.duration / 2, deactivated: clip.deactivated, transcript: clip.transcript, transforms: clip.transforms, mediaOffset: clip.mediaOffset + (clip.duration / 2))
        timelineState.clips[index].duration /= 2
        timelineState.clips.insert(newClip, at: index + 1)
        selectedClipIndex = nil
        selectedKeyframeIndex = nil
        rebuildPlayerItem()
    }

    func toggleDeactivated(at index: Int, to state: Bool) {
        saveState()
        timelineState.clips[index].deactivated = state
        rebuildPlayerItem()
    }

    func addKeyframe() {
        saveState()
        guard let index = selectedClipIndex, timelineState.clips.indices.contains(index) else { return }
        let timeOffset = currentTime - timelineState.clips[index].startTime
        let kf = TransformKeyframe(id: UUID().uuidString, timeOffset: timeOffset, scale: currentZoom, x: currentPan, y: currentTilt, rotation: 0, easing: "linear")
        if timelineState.clips[index].transforms == nil {
            timelineState.clips[index].transforms = []
        }
        timelineState.clips[index].transforms?.append(kf)
        timelineState.clips[index].transforms?.sort { $0.timeOffset < $1.timeOffset }
        selectedKeyframeIndex = timelineState.clips[index].transforms?.firstIndex(where: { $0.id == kf.id })
        rebuildPlayerItem()
    }

    func deleteKeyframe() {
        saveState()
        guard let cIdx = selectedClipIndex, let kIdx = selectedKeyframeIndex else { return }
        if timelineState.clips.indices.contains(cIdx), timelineState.clips[cIdx].transforms?.indices.contains(kIdx) == true {
            timelineState.clips[cIdx].transforms?.remove(at: kIdx)
            selectedKeyframeIndex = nil
            rebuildPlayerItem()
        }
    }

    func undo() {
        guard let previousState = undoStack.popLast() else { return }
        redoStack.append(timelineState)
        timelineState = previousState
        selectedKeyframeIndex = nil
        rebuildPlayerItem()
    }

    func redo() {
        guard let nextState = redoStack.popLast() else { return }
        undoStack.append(timelineState)
        timelineState = nextState
        selectedKeyframeIndex = nil
        rebuildPlayerItem()
    }

    func nextKeyframe() {
        guard let cIdx = selectedClipIndex, timelineState.clips.indices.contains(cIdx), let transforms = timelineState.clips[cIdx].transforms, !transforms.isEmpty else { return }
        var nextIdx = 0
        if let current = selectedKeyframeIndex {
            nextIdx = (current + 1) % transforms.count
        }
        selectKeyframe(clipIndex: cIdx, keyframeIndex: nextIdx)
    }

    func prevKeyframe() {
        guard let cIdx = selectedClipIndex, timelineState.clips.indices.contains(cIdx), let transforms = timelineState.clips[cIdx].transforms, !transforms.isEmpty else { return }
        var prevIdx = transforms.count - 1
        if let current = selectedKeyframeIndex {
            prevIdx = (current - 1 + transforms.count) % transforms.count
        }
        selectKeyframe(clipIndex: cIdx, keyframeIndex: prevIdx)
    }

    func selectKeyframe(clipIndex: Int, keyframeIndex: Int) {
        selectedClipIndex = clipIndex
        selectedKeyframeIndex = keyframeIndex
        if let kf = timelineState.clips[clipIndex].transforms?[keyframeIndex] {
            currentPan = kf.x ?? 0.5
            currentTilt = kf.y ?? 0.5
            currentZoom = kf.scale ?? 0.5
        }
    }

    private func updateSelectedKeyframe() {
        guard let cIdx = selectedClipIndex, let kIdx = selectedKeyframeIndex else { return }
        if timelineState.clips.indices.contains(cIdx), timelineState.clips[cIdx].transforms?.indices.contains(kIdx) == true {
            timelineState.clips[cIdx].transforms?[kIdx].x = currentPan
            timelineState.clips[cIdx].transforms?[kIdx].y = currentTilt
            timelineState.clips[cIdx].transforms?[kIdx].scale = currentZoom
            rebuildPlayerItem()
        }
    }

    func moveClip(from source: IndexSet, to destination: Int) {
        saveState()
        timelineState.clips.move(fromOffsets: source, toOffset: destination)
        selectedClipIndex = nil
        selectedKeyframeIndex = nil
        rebuildPlayerItem()
    }

    func importVideo(from url: URL, errorClosure: @escaping () -> Void) {
        let asset = AVURLAsset(url: url)
        Task {
            guard let track = try? await asset.loadTracks(withMediaType: .video).first else {
                await MainActor.run { errorClosure() }
                return
            }
            guard let size = try? await track.load(.naturalSize) else {
                await MainActor.run { errorClosure() }
                return
            }

            let isEquirectangular = (size.width == size.height * 2)
            await MainActor.run {
                if isEquirectangular {
                    self.showRectilinear = true
                } else {
                    errorClosure()
                }
            }
        }
    }
}

struct NativeEditorView: View {
    @StateObject private var viewModel = TimelineViewModel()
    @StateObject private var exportManager = ExportManager()
    @State private var showExportAlert = false
    @State private var showImportErrorAlert = false
    @State private var showImportOptions = false

    var body: some View {
        VStack {
            // Preview Section
            VideoPlayer(player: viewModel.player)
                .frame(height: 300)
                .accessibilityIdentifier("MainVideoPlayer")

            Button(viewModel.isPlaying ? "Pause" : "Play") {
                viewModel.isPlaying.toggle()
            }
            .accessibilityIdentifier(viewModel.isPlaying ? "Pause" : "Play")
            .disabled(viewModel.timelineState.clips.filter { !$0.deactivated }.isEmpty)


            if viewModel.showRectilinear {
                Text("Rectilinear View")
            }

            Button("Import") { showImportOptions = true }
                .accessibilityIdentifier("Import")

            if showImportOptions {
                Button("360Video") {
                    Task {
                        var fileURL = Bundle.main.url(forResource: "360Video", withExtension: "mp4")
                        if fileURL == nil {
                            let projPath = "/Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture/HighGroundCapture/360Video.mp4"
                            if FileManager.default.fileExists(atPath: projPath) {
                                fileURL = URL(fileURLWithPath: projPath)
                            }
                        }
                        if let url = fileURL {
                            viewModel.importVideo(from: url) {
                                showImportErrorAlert = true
                            }
                            showImportOptions = false
                        }
                    }
                }
                .accessibilityIdentifier("360Video")

                Button("InvalidVideo") {
                    Task {
                        var fileURL = Bundle.main.url(forResource: "InvalidVideo", withExtension: "mp4")
                        if fileURL == nil {
                            let projPath = "/Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture/HighGroundCapture/InvalidVideo.mp4"
                            if FileManager.default.fileExists(atPath: projPath) {
                                fileURL = URL(fileURLWithPath: projPath)
                            }
                        }
                        if let url = fileURL {
                            viewModel.importVideo(from: url) {
                                showImportErrorAlert = true
                            }
                            showImportOptions = false
                        }
                    }
                }
                .accessibilityIdentifier("InvalidVideo")
            }

            Button("Go To End") {
                if let maxDuration = viewModel.timelineState.clips.map({ $0.startTime + $0.duration }).max() {
                    viewModel.currentTime = maxDuration
                    viewModel.player.seek(to: CMTime(seconds: maxDuration, preferredTimescale: 600))
                }
            }
            .accessibilityIdentifier("Go To End")

            Text(viewModel.formattedTimecode())
                .accessibilityIdentifier("TimecodeLabel")

            let statusText = viewModel.playerItemStatus == .readyToPlay ? "Ready" : (viewModel.playerItemStatus == .failed ? "Failed" : "Unknown")
            Text("Status: \(statusText)")
                .accessibilityIdentifier("PlayerItemStatus")

            // Sliders and Labels
            VStack {
                Slider(value: $viewModel.currentPan, in: 0...1)
                    .accessibilityIdentifier("PanSlider")
                Text("Pan: \(Int(round(viewModel.currentPan * 100)))")
                    .accessibilityIdentifier("PanValueLabel")

                Slider(value: $viewModel.currentTilt, in: 0...1)
                    .accessibilityIdentifier("TiltSlider")
                Text("Tilt: \(Int(round(viewModel.currentTilt * 100)))")
                    .accessibilityIdentifier("TiltValueLabel")

                Slider(value: $viewModel.currentZoom, in: 0...1)
                    .accessibilityIdentifier("ZoomSlider")
                Text("FOV: \(Int(round(viewModel.currentZoom * 100)))")
                    .accessibilityIdentifier("FOVValueLabel")
            }

            // Keyframes
            HStack {
                Button("Add Keyframe") { viewModel.addKeyframe() }
                    .accessibilityIdentifier("Add Keyframe")
                Button("Next Keyframe") { viewModel.nextKeyframe() }
                    .accessibilityIdentifier("Next Keyframe")
                Button("Previous Keyframe") { viewModel.prevKeyframe() }
                    .accessibilityIdentifier("Previous Keyframe")
                Button("Delete Keyframe") { viewModel.deleteKeyframe() }
                    .accessibilityIdentifier("Delete Keyframe")
                Button("Undo") { viewModel.undo() }
                    .accessibilityIdentifier("Undo")
                Button("Redo") { viewModel.redo() }
                    .accessibilityIdentifier("Redo")
            }

            // Keyframe markers
            if let selectedIndex = viewModel.selectedClipIndex,
               viewModel.timelineState.clips.indices.contains(selectedIndex),
               let transforms = viewModel.timelineState.clips[selectedIndex].transforms {
                ForEach(transforms) { kf in
                    Image(systemName: "circle.fill")
                        .accessibilityIdentifier("KeyframeMarker")
                        .onTapGesture {
                            if let index = transforms.firstIndex(where: { $0.id == kf.id }) {
                                viewModel.selectKeyframe(clipIndex: selectedIndex, keyframeIndex: index)
                            }
                        }
                }
            }

            // Export
            Button("Export") { exportManager.exportTimeline(viewModel.timelineState) }
                .accessibilityIdentifier("Export")
                .onChange(of: exportManager.exportSuccess) { success in
                    if success {
                        showExportAlert = true
                    }
                }
                .onChange(of: exportManager.exportError) { error in
                    if error != nil {
                        showExportAlert = true
                    }
                }
                .alert(isPresented: $showExportAlert) {
                    if let error = exportManager.exportError {
                        return Alert(title: Text("Export Error"), message: Text(error), dismissButton: .default(Text("OK")))
                    } else {
                        return Alert(title: Text("Export Successful"))
                    }
                }
                .alert("Format Error", isPresented: $showImportErrorAlert) {
                    Button("OK", role: .cancel) { }
                } message: {
                    Text("Invalid equirectangular format.")
                }

            // Timeline controls
            HStack {
                Button("Add Clip") { viewModel.addClip() }
                    .accessibilityIdentifier("Add Clip")
                Button("Deactivate") {
                    if let idx = viewModel.selectedClipIndex { viewModel.toggleDeactivated(at: idx, to: true) }
                }
                .accessibilityIdentifier("Deactivate")
                Button("Activate") {
                    if let idx = viewModel.selectedClipIndex { viewModel.toggleDeactivated(at: idx, to: false) }
                }
                .accessibilityIdentifier("Activate")
                Button("Split") {
                    if let idx = viewModel.selectedClipIndex { viewModel.splitClip(at: idx) }
                }
                .accessibilityIdentifier("Split")
            }

            // Timeline
            GeometryReader { geometry in
                Color.gray
                    .frame(height: 20)
                    .accessibilityIdentifier("TimelineScrubber")
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                let percent = max(0, min(1, value.location.x / geometry.size.width))
                                let duration = viewModel.player.currentItem?.duration.seconds ?? 0
                                let targetTime = duration * percent
                                if duration > 0 && !targetTime.isNaN {
                                    viewModel.currentTime = targetTime
                                    viewModel.player.seek(to: CMTime(seconds: targetTime, preferredTimescale: 600))
                                }
                            }
                    )
            }
            .frame(height: 20)

            Color.blue
                .frame(height: 20)
                .accessibilityIdentifier("Playhead")

            List {
                ForEach(Array(viewModel.timelineState.clips.enumerated()), id: \.element.id) { index, clip in
                    Button(action: {
                        viewModel.selectedClipIndex = index
                    }) {
                        Text("Clip")
                            .frame(width: 50, height: 50)
                            .background(!clip.deactivated ? Color.green : Color.red)
                    }
                    .buttonStyle(PlainButtonStyle())
                    .accessibilityIdentifier(!clip.deactivated ? "TimelineClip_Active" : "TimelineClip_Deactivated")
                }
                .onMove { source, destination in
                    viewModel.moveClip(from: source, to: destination)
                }
            }
            .listStyle(PlainListStyle())
            .frame(height: 100)
        }
    }
}
