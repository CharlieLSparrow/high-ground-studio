import SwiftUI

struct MobileStudioBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(.systemBackground),
                Color.teal.opacity(0.10),
                Color.orange.opacity(0.08),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

struct MobileHeroCard: View {
    let eyebrow: String
    let title: String
    let description: String

    var bodyView: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(eyebrow.uppercased())
                .font(.caption.bold())
                .tracking(1.1)
                .foregroundStyle(.teal)
            Text(title)
                .font(.system(.largeTitle, design: .rounded, weight: .black))
                .fixedSize(horizontal: false, vertical: true)
            Text(description)
                .font(.body)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding()
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
    }

    var body: some View {
        bodyView
    }
}

struct ManuscriptReaderPanel: View {
    let blocks: [MobileManuscriptBlock]
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Living document", systemImage: "doc.text")
                    .font(.headline)
                Spacer()
                Text("3 visible cues")
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
            }

            ForEach(blocks) { block in
                Button {
                    selectedBlockID = block.id
                } label: {
                    ManuscriptBlockCard(block: block, isSelected: selectedBlockID == block.id)
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct ManuscriptBlockCard: View {
    let block: MobileManuscriptBlock
    let isSelected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .firstTextBaseline) {
                Text(block.label)
                    .font(.caption.bold())
                    .foregroundStyle(.teal)
                Spacer()
                if let speaker = block.speaker {
                    Label(speaker, systemImage: "person.wave.2")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }

            Text(block.title)
                .font(.title3.bold())
                .foregroundStyle(.primary)

            Text(block.body)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if let cue = block.clipCue {
                ClipCuePill(cue: cue)
            }

            TagWrap(tags: block.tags)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(isSelected ? Color.teal : Color.clear, lineWidth: 2)
        }
    }
}

struct ClipCuePill: View {
    let cue: MobileClipCue

    var body: some View {
        HStack {
            Image(systemName: "play.rectangle.fill")
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(cue.title)
                    .font(.caption.bold())
                Text("\(cue.timeRange) · \(cue.status)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
            Spacer()
            Button("Preview") {}
                .buttonStyle(.bordered)
                .controlSize(.small)
        }
        .padding(10)
        .background(Color.orange.opacity(0.10), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

struct TagWrap: View {
    let tags: [String]

    var body: some View {
        LazyVGrid(columns: [GridItem(.adaptive(minimum: 82), spacing: 8)], alignment: .leading, spacing: 8) {
            ForEach(tags, id: \.self) { tag in
                Text(tag)
                    .font(.caption.bold())
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.thinMaterial, in: Capsule())
            }
        }
    }
}

struct QuickActionRail: View {
    let actions: [MobileQuickAction]

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Fast controls")
                .font(.headline)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(actions) { action in
                        VStack(alignment: .leading, spacing: 8) {
                            Image(systemName: action.systemImage)
                                .font(.title2)
                                .foregroundStyle(.teal)
                            Text(action.title)
                                .font(.headline)
                            Text(action.detail)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .frame(width: 160, alignment: .leading)
                        .padding()
                        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    }
                }
                .padding(.vertical, 2)
            }
        }
    }
}

struct MobileTransportDock: View {
    let contextLabel: String
    @State private var playhead: Double = 0.18
    @State private var isPlaying = false
    @State private var isRecording = false

    var body: some View {
        VStack(spacing: 10) {
            HStack {
                Text(contextLabel)
                    .font(.caption.bold())
                    .foregroundStyle(.secondary)
                Slider(value: $playhead)
                    .accessibilityLabel("Session playhead")
                Text(timeLabel)
                    .font(.system(.caption, design: .monospaced))
                    .foregroundStyle(.secondary)
                    .frame(width: 58, alignment: .trailing)
            }

            HStack(spacing: 12) {
                Button {
                    playhead = max(0, playhead - 0.01)
                } label: {
                    Label("Back", systemImage: "gobackward.5")
                }
                .keyboardShortcut(.leftArrow, modifiers: [])

                Button {
                    isPlaying.toggle()
                } label: {
                    Label(isPlaying ? "Pause" : "Play", systemImage: isPlaying ? "pause.fill" : "play.fill")
                }
                .buttonStyle(.borderedProminent)
                .keyboardShortcut(.space, modifiers: [])

                Button {
                    playhead = min(1, playhead + 0.01)
                } label: {
                    Label("Forward", systemImage: "goforward.5")
                }
                .keyboardShortcut(.rightArrow, modifiers: [])

                Divider()
                    .frame(height: 22)

                Button {
                    isRecording.toggle()
                } label: {
                    Label(isRecording ? "Recording" : "Record", systemImage: isRecording ? "record.circle.fill" : "record.circle")
                }
                .foregroundStyle(isRecording ? .red : .primary)
                .keyboardShortcut("r", modifiers: [.command])

                Button {} label: {
                    Label("Mark break", systemImage: "scissors")
                }
                .keyboardShortcut("b", modifiers: [.command])
            }
            .labelStyle(.iconOnly)
        }
        .padding(12)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .padding(.horizontal)
        .padding(.bottom, 6)
    }

    private var timeLabel: String {
        let totalSeconds = Int(playhead * 45 * 60)
        let minutes = totalSeconds / 60
        let seconds = totalSeconds % 60
        return String(format: "%02d:%02d", minutes, seconds)
    }
}

struct MediaCueBoard: View {
    let blocks: [MobileManuscriptBlock]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                MobileHeroCard(
                    eyebrow: "Inline media",
                    title: "Clips belong beside the writing.",
                    description: "This is the mobile start of the clip stack: preview a cue, keep it synced to the manuscript, and send the real cut back to Nest."
                )

                ForEach(blocks.compactMap(\.clipCue), id: \.title) { cue in
                    VStack(alignment: .leading, spacing: 12) {
                        ClipCuePill(cue: cue)
                        RoundedRectangle(cornerRadius: 22, style: .continuous)
                            .fill(.black.gradient)
                            .frame(height: 220)
                            .overlay {
                                VStack(spacing: 10) {
                                    Image(systemName: "play.circle.fill")
                                        .font(.system(size: 54))
                                    Text("Clip preview placeholder")
                                        .font(.headline)
                                }
                                .foregroundStyle(.white)
                            }
                    }
                    .padding()
                    .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
                }
            }
            .padding()
        }
        .background(MobileStudioBackground())
    }
}

struct RecorderControlBoard: View {
    @StateObject private var uploadManager = UploadManager.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                MobileHeroCard(
                    eyebrow: "Capture spine",
                    title: "Record locally. Upload calmly.",
                    description: "The iPhone app should keep high quality local audio even if the network gets weird, then upload in chunks when it can."
                )

                VStack(alignment: .leading, spacing: 14) {
                    HStack {
                        Label("Network", systemImage: "antenna.radiowaves.left.and.right")
                        Spacer()
                        Text(uploadManager.networkQuality)
                            .font(.headline)
                            .foregroundStyle(uploadManager.webrtcVideoEnabled ? .green : .orange)
                    }

                    ProgressView(value: uploadManager.uploadProgress)
                    Text(uploadManager.statusText ?? "No active upload")
                        .font(.caption)
                        .foregroundStyle(.secondary)

                    HStack {
                        Button {} label: {
                            Label("Start", systemImage: "record.circle")
                        }
                        .buttonStyle(.borderedProminent)

                        Button {} label: {
                            Label("Mark break", systemImage: "scissors")
                        }
                        .buttonStyle(.bordered)

                        Button {} label: {
                            Label("Stop", systemImage: "stop.circle")
                        }
                        .buttonStyle(.bordered)
                    }
                }
                .padding()
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 24, style: .continuous))
            }
            .padding()
        }
        .background(MobileStudioBackground())
    }
}

struct OutlineInspector: View {
    let blocks: [MobileManuscriptBlock]
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Document outline")
                .font(.headline)
            ForEach(blocks) { block in
                Button {
                    selectedBlockID = block.id
                } label: {
                    HStack {
                        Text(block.label)
                            .font(.caption.bold())
                            .foregroundStyle(.teal)
                        Text(block.title)
                            .lineLimit(1)
                    }
                }
                .buttonStyle(.plain)
            }
        }
    }
}

struct ClipInspector: View {
    let block: MobileManuscriptBlock?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Selected clip")
                .font(.headline)
            if let cue = block?.clipCue {
                ClipCuePill(cue: cue)
            } else {
                Text("No clip cue on the selected block.")
                    .foregroundStyle(.secondary)
            }
        }
    }
}

struct TagInspector: View {
    let block: MobileManuscriptBlock?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Tags")
                .font(.headline)
            TagWrap(tags: block?.tags ?? [])
            Text("Mobile tagging should stay fast: Chapter, Episode, speaker, show note, quote, clip cue.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
    }
}

struct SyncInspector: View {
    let block: MobileManuscriptBlock?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Sync")
                .font(.headline)
            Text(block?.clipCue == nil ? "Select a clip cue to review sync." : "Clip cue is ready for mobile preview. Detailed sync lives in Nest or Mac.")
                .foregroundStyle(.secondary)
            HStack {
                Button("-10s") {}
                Button("-1s") {}
                Button("-0.1s") {}
                Button("+0.1s") {}
                Button("+1s") {}
                Button("+10s") {}
            }
            .buttonStyle(.bordered)
            .disabled(block?.clipCue == nil)
        }
    }
}

struct FocusModePanel: View {
    let blocks: [MobileManuscriptBlock]
    @Binding var selectedBlockID: MobileManuscriptBlock.ID?

    private var selectedBlock: MobileManuscriptBlock? {
        blocks.first { $0.id == selectedBlockID } ?? blocks.first
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Text("Focus")
                .font(.largeTitle.bold())
            if let block = selectedBlock {
                ManuscriptBlockCard(block: block, isSelected: true)
            }
            Spacer()
            Text("Focus mode is the anti-panic surface: current text, current cue, and only the controls needed right now.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding()
        .background(.regularMaterial)
    }
}
