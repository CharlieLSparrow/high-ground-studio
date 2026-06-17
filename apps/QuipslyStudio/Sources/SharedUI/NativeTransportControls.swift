import SwiftUI

import QuipslyVideoCore

struct NativeTransportControls: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    var onPlaybackModeRequest: ((PlaybackMode) -> Void)? = nil
    
    var body: some View {
        VStack(spacing: 12) {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("TRANSPORT")
                        .font(.caption2)
                        .fontWeight(.black)
                        .tracking(1.8)
                        .foregroundStyle(Color.yellow.opacity(0.82))
                    Text("One playhead drives program, sources, timeline, and agent state.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                
                Spacer()

                Button {
                    playbackEngine.seek(to: max(0, playbackEngine.playhead - 5))
                } label: {
                    transportIconWithKey(systemImage: "gobackward.5", key: "J", title: "Back 5")
                }
                .buttonStyle(.plain)
                .help("Shortcut J: move the sequence playhead back five seconds.")
                
                Button {
                    requestPlaybackMode(.playEdit)
                } label: {
                    HStack {
                        Image(systemName: playbackEngine.isPlaying && playbackEngine.playbackMode == .playEdit ? "pause.fill" : "play.fill")
                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 6) {
                                Text("Play Edit")
                                    .font(.headline)
                                keyCap("Space")
                            }
                            Text("skip inactive gaps")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(playbackEngine.playbackMode == .playEdit ? Color.blue.opacity(0.24) : Color.secondary.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .keyboardShortcut(.space, modifiers: [])
                .help("Shortcut Space: play the condensed edited program. Inactive gaps are skipped and no-SHOW regions are blank.")
                
                Button {
                    requestPlaybackMode(.playThrough)
                } label: {
                    HStack {
                        Image(systemName: playbackEngine.isPlaying && playbackEngine.playbackMode == .playThrough ? "pause.fill" : "play.fill")
                        VStack(alignment: .leading, spacing: 1) {
                            HStack(spacing: 6) {
                                Text("Play Through")
                                    .font(.headline)
                                keyCap("T")
                            }
                            Text("raw sequence time")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 8)
                    .background(playbackEngine.playbackMode == .playThrough ? Color.green.opacity(0.22) : Color.secondary.opacity(0.08))
                    .clipShape(RoundedRectangle(cornerRadius: 10))
                }
                .buttonStyle(.plain)
                .keyboardShortcut("t", modifiers: [])
                .help("Shortcut T: play the whole synced source timeline without skipping gaps. Use this to inspect what exists under the edit.")
                
                Button {
                    playbackEngine.seek(to: playbackEngine.playhead + 5)
                } label: {
                    transportIconWithKey(systemImage: "goforward.5", key: "L", title: "Forward 5")
                }
                .buttonStyle(.plain)
                .help("Shortcut L: move the sequence playhead forward five seconds.")
                
                Spacer()
                
                Picker("Output", selection: $playbackEngine.playbackFormat) {
                    ForEach(ExportFormat.allCases, id: \.self) { format in
                        Text(format.rawValue).tag(format)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 150)
                .help("Switch the program monitor between the wide and vertical output views.")
                
                VStack(alignment: .trailing, spacing: 1) {
                    Text(formatTime(playbackEngine.playhead))
                        .font(.system(.body, design: .monospaced))
                        .fontWeight(.bold)
                        .foregroundStyle(.cyan)
                    Text(playbackEngine.playbackMode.rawValue)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            
            HStack(spacing: 8) {
                statusPill("sequence", "whole source lanes", .blue)
                statusPill("program", "edit decisions only", .yellow)
                statusPill("space", "toggles Play Edit", .green)
                statusPill("t", "Play Through", .green)
                statusPill("1-6", "drop live decisions", .orange)
                statusPill("k", "pause", .secondary)
                Spacer()
            }
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(.thinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 18)
                        .stroke(Color.white.opacity(0.08), lineWidth: 1)
                )
        )
    }
    
    private func statusPill(_ label: String, _ value: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Text(label.uppercased())
                .font(.caption2)
                .fontWeight(.bold)
                .foregroundStyle(color)
            Text(value)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 4)
        .background(color.opacity(0.10))
        .clipShape(Capsule())
    }

    private func transportIconWithKey(systemImage: String, key: String, title: String) -> some View {
        VStack(spacing: 2) {
            Image(systemName: systemImage)
                .font(.title2)
            keyCap(key)
        }
        .accessibilityLabel("\(title), shortcut \(key)")
    }

    private func keyCap(_ key: String) -> some View {
        Text(key)
            .font(.caption2)
            .fontWeight(.black)
            .foregroundStyle(.primary)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(Color.secondary.opacity(0.18))
            .clipShape(RoundedRectangle(cornerRadius: 5))
    }
    
    private func requestPlaybackMode(_ mode: PlaybackMode) {
        if let onPlaybackModeRequest {
            onPlaybackModeRequest(mode)
        } else {
            playbackEngine.playbackMode = mode
            playbackEngine.togglePlayback()
        }
    }
    
    private func formatTime(_ seconds: Double) -> String {
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        let ms = Int((seconds.truncatingRemainder(dividingBy: 1)) * 100)
        return String(format: "%02d:%02d.%02d", mins, secs, ms)
    }
}
