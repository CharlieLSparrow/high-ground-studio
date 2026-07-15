import SwiftUI

import QuipslyVideoCore

struct NativeTransportControls: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    var onPlaybackModeRequest: ((PlaybackMode) -> Void)? = nil
    var keyboardShortcutsEnabled = true

    var body: some View {
        VStack(spacing: 8) {
            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("ONE SHARED PLAYHEAD")
                        .font(.caption2)
                        .fontWeight(.black)
                        .tracking(1.8)
                        .foregroundStyle(QuipslyStudioTheme.honey.opacity(0.86))
                    Text("Program, Cedar Grove, timeline, cuts, and Codex all follow one clock.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .frame(minWidth: 220, alignment: .leading)

                Spacer()

                Button {
                    playbackEngine.seek(to: max(0, playbackEngine.playhead - 5))
                } label: {
                    transportIconWithKey(systemImage: "gobackward.5", key: "J", title: "Back 5")
                }
                .buttonStyle(.plain)
                .help("Shortcut J: move the sequence playhead back five seconds.")
                .accessibilityIdentifier("quipsly.transport.back5")

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
                            Text("skip quiet gaps")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(playbackEngine.playbackMode == .playEdit ? QuipslyStudioTheme.honey.opacity(0.22) : QuipslyStudioTheme.panelLift.opacity(0.56))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(playbackEngine.playbackMode == .playEdit ? QuipslyStudioTheme.honey.opacity(0.52) : QuipslyStudioTheme.quietStroke, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .conditionalKeyboardShortcut(.space, enabled: keyboardShortcutsEnabled)
                .help("Shortcut Space: play the condensed edited program. Inactive gaps are skipped and no-SHOW regions are blank.")
                .accessibilityIdentifier("quipsly.transport.playEdit")

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
                            Text("inspect source time")
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                        }
                    }
                    .padding(.horizontal, 12)
                    .padding(.vertical, 7)
                    .background(playbackEngine.playbackMode == .playThrough ? QuipslyStudioTheme.creek.opacity(0.22) : QuipslyStudioTheme.panelLift.opacity(0.56))
                    .overlay(
                        RoundedRectangle(cornerRadius: 12)
                            .stroke(playbackEngine.playbackMode == .playThrough ? QuipslyStudioTheme.creek.opacity(0.46) : QuipslyStudioTheme.quietStroke, lineWidth: 1)
                    )
                    .clipShape(RoundedRectangle(cornerRadius: 12))
                }
                .buttonStyle(.plain)
                .conditionalKeyboardShortcut("t", enabled: keyboardShortcutsEnabled)
                .help("Shortcut T: play the whole synced source timeline without skipping gaps. Use this to inspect what exists under the edit.")
                .accessibilityIdentifier("quipsly.transport.playThrough")

                Button {
                    playbackEngine.seek(to: playbackEngine.playhead + 5)
                } label: {
                    transportIconWithKey(systemImage: "goforward.5", key: "L", title: "Forward 5")
                }
                .buttonStyle(.plain)
                .help("Shortcut L: move the sequence playhead forward five seconds.")
                .accessibilityIdentifier("quipsly.transport.forward5")

                Spacer(minLength: 6)

                Picker("Output", selection: $playbackEngine.playbackFormat) {
                    ForEach(ExportFormat.allCases, id: \.self) { format in
                        Text(format.rawValue).tag(format)
                    }
                }
                .pickerStyle(.segmented)
                .frame(width: 150)
                .help("Switch the program monitor between the wide and vertical output views.")
                .accessibilityIdentifier("quipsly.transport.outputFormat")

                VStack(alignment: .trailing, spacing: 1) {
                    Text(formatTime(playbackEngine.playhead))
                        .font(.system(.body, design: .monospaced))
                        .fontWeight(.bold)
                        .foregroundStyle(QuipslyStudioTheme.creek)
                    Text(playbackEngine.playbackMode.rawValue)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .frame(minWidth: 78, alignment: .trailing)
            }

            HStack(spacing: 8) {
                statusPill("sources", "visible", QuipslyStudioTheme.creek)
                statusPill("program", "output", QuipslyStudioTheme.honey)
                statusPill("space", "Play Edit", QuipslyStudioTheme.honey)
                statusPill("t", "Play Through", QuipslyStudioTheme.creek)
                statusPill("1-6", "live cuts", QuipslyStudioTheme.clay)
                statusPill("codex", "agent-ready", QuipslyStudioTheme.lichen)
                Spacer(minLength: 4)
                Label("One spine makes episodes, shorts, and audio", systemImage: "point.3.connected.trianglepath.dotted")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.sage)
            }
            .accessibilityIdentifier("quipsly.transport.outputRoutes")
            .accessibilityLabel("Output routes. The same episode spine can become a sixteen by nine episode, nine by sixteen shorts, and podcast audio.")
        }
        .padding(10)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(
                    QuipslyStudioTheme.mossGlassGradient
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(QuipslyStudioTheme.warmGlassStroke, lineWidth: 1)
                )
        )
        .shadow(color: QuipslyStudioTheme.night.opacity(0.20), radius: 10, y: 5)
        .accessibilityLabel("Transport controls. One shared playhead drives program, sources, timeline, and agent state.")
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
        .background(color.opacity(0.11))
        .overlay(
            Capsule()
                .stroke(color.opacity(0.16), lineWidth: 1)
        )
        .clipShape(Capsule())
        .accessibilityLabel("\(label): \(value)")
        .accessibilityIdentifier("quipsly.transport.status.\(transportToken(label))")
    }

    private func outputRoutePill(_ title: String, _ detail: String, _ icon: String, _ tint: Color) -> some View {
        HStack(spacing: 6) {
            Image(systemName: icon)
                .font(.caption2)
                .foregroundStyle(tint)
            VStack(alignment: .leading, spacing: 0) {
                Text(title)
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(tint)
                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.78)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 5)
        .background(tint.opacity(0.075))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke(tint.opacity(0.14), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .accessibilityLabel("\(title) output route. \(detail).")
        .accessibilityIdentifier("quipsly.transport.outputRoute.\(outputRouteToken(title))")
    }

    private func outputRouteToken(_ title: String) -> String {
        transportToken(title)
    }

    private func transportToken(_ value: String) -> String {
        let normalized = value
            .lowercased()
            .replacingOccurrences(of: ":", with: "x")
            .replacingOccurrences(of: " ", with: "")
            .replacingOccurrences(of: "/", with: "")
        let safe = normalized.unicodeScalars.map { scalar -> String in
            CharacterSet.alphanumerics.contains(scalar) ? String(scalar) : "-"
        }.joined()
        let collapsed = safe
            .replacingOccurrences(of: "-+", with: "-", options: .regularExpression)
            .trimmingCharacters(in: CharacterSet(charactersIn: "-"))
        return collapsed.isEmpty ? "route" : collapsed
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
            .foregroundStyle(QuipslyStudioTheme.lichen)
            .padding(.horizontal, 5)
            .padding(.vertical, 2)
            .background(QuipslyStudioTheme.night.opacity(0.36))
            .overlay(
                RoundedRectangle(cornerRadius: 5)
                    .stroke(QuipslyStudioTheme.sage.opacity(0.18), lineWidth: 1)
            )
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

private struct ConditionalKeyboardShortcutModifier: ViewModifier {
    let key: KeyEquivalent
    let modifiers: EventModifiers
    let enabled: Bool

    @ViewBuilder
    func body(content: Content) -> some View {
        if enabled {
            content.keyboardShortcut(key, modifiers: modifiers)
        } else {
            content
        }
    }
}

private extension View {
    func conditionalKeyboardShortcut(
        _ key: KeyEquivalent,
        modifiers: EventModifiers = [],
        enabled: Bool
    ) -> some View {
        modifier(ConditionalKeyboardShortcutModifier(key: key, modifiers: modifiers, enabled: enabled))
    }
}
