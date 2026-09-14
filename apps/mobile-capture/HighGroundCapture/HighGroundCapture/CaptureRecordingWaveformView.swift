import SwiftUI

struct CaptureRecordingWaveformView: View {
    let waveform: CaptureAudioWaveform?
    let isLoading: Bool
    let duration: TimeInterval
    let position: TimeInterval
    let programOffset: TimeInterval
    let keepStart: TimeInterval
    let keepEnd: TimeInterval
    let removedRanges: [ClosedRange<Double>]
    let seek: (TimeInterval) -> Void

    @State private var zoom: Double = 1
    @State private var center: TimeInterval = 0

    private var window: CaptureWaveformWindow {
        CaptureWaveformWindow(duration: duration, zoom: zoom, center: center)
    }

    var body: some View {
        VStack(spacing: 8) {
            HStack {
                Text("Original track").font(.caption.bold())
                Spacer()
                Picker("Waveform zoom", selection: $zoom) {
                    ForEach([1, 2, 4, 8, 16], id: \.self) { value in Text("\(value)×").tag(Double(value)) }
                }
                .pickerStyle(.menu)
                .disabled(duration <= 0)
                .accessibilityIdentifier("CaptureRecordingWaveformZoom")
                .onChange(of: zoom) { _, _ in center = position }
            }
            ZStack {
                Canvas { context, size in
                    draw(context: &context, size: size)
                }
                .accessibilityHidden(true)
                if waveform == nil {
                    if isLoading {
                        ProgressView("Drawing waveform…").font(.caption)
                    } else {
                        Text(duration > 0 ? "Waveform unavailable · playback still works" : "Play to load the waveform")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                }
            }
            .frame(height: 96)
            .background(CapturePalette.surface.opacity(0.6), in: RoundedRectangle(cornerRadius: 8))
            .clipped()
            Slider(value: Binding(get: { min(window.end, max(window.start, position)) }, set: seek),
                   in: window.start...max(window.start + 0.001, window.end))
                .disabled(duration <= 0)
                .accessibilityLabel("Recording position")
                .accessibilityValue(captureRecordingShareTime(position))
                .accessibilityIdentifier("CaptureRecordingListenPosition")
            HStack {
                Text(captureRecordingShareTime(window.start))
                Spacer()
                Text(captureRecordingShareTime(window.end))
            }.font(.caption2.monospacedDigit()).foregroundStyle(.secondary)
            if zoom > 1 {
                HStack {
                    Button { center = max(window.length / 2, (window.start + window.end) / 2 - window.length / 2) } label: {
                        Image(systemName: "chevron.left").frame(minWidth: 44, minHeight: 44)
                    }
                    .disabled(window.start <= 0)
                    .accessibilityLabel("Earlier in recording")
                    Spacer()
                    Button("Show playhead") { center = position }
                        .frame(minHeight: 44)
                        .accessibilityIdentifier("CaptureRecordingWaveformShowPlayhead")
                    Spacer()
                    Button { center = min(duration - window.length / 2, (window.start + window.end) / 2 + window.length / 2) } label: {
                        Image(systemName: "chevron.right").frame(minWidth: 44, minHeight: 44)
                    }
                    .disabled(window.end >= duration)
                    .accessibilityLabel("Later in recording")
                }.buttonStyle(.borderless)
            }
            Text("Faded audio is trimmed; marked passages are removed. Listen here to the original, or play your edited preview below.")
                .font(.caption2).foregroundStyle(.secondary)
        }
        .accessibilityElement(children: .contain)
        .accessibilityValue(waveform != nil ? "Waveform ready" : isLoading ? "Drawing waveform" : "Waveform not loaded")
        .accessibilityIdentifier("CaptureRecordingWaveform")
    }

    private func draw(context: inout GraphicsContext, size: CGSize) {
        let window = window
        guard window.length > 0, size.width > 0 else { return }
        func x(_ time: TimeInterval) -> CGFloat { CGFloat((time - window.start) / window.length) * size.width }
        let kept = window.sourceRange(programStart: keepStart, programEnd: keepEnd, offset: programOffset)
        if let waveform, !waveform.peaks.isEmpty {
            // Scale for visibility, not loudness metering. Read every covered bin
            // so narrow transients survive an overview of a long recording.
            let maximum = max(waveform.peaks.max() ?? 0, 0.0001)
            let bars = max(1, min(512, Int(size.width / 2)))
            for index in 0..<bars {
                let lower = window.start + Double(index) / Double(bars) * window.length
                let upper = window.start + Double(index + 1) / Double(bars) * window.length
                let first = max(0, min(waveform.peaks.count - 1, Int(lower / waveform.secondsPerPeak)))
                let last = max(first, min(waveform.peaks.count - 1, Int(upper / waveform.secondsPerPeak)))
                let peak = waveform.peaks[first...last].max() ?? 0
                let height = max(1, CGFloat(sqrt(peak / maximum)) * (size.height - 12))
                let rect = CGRect(x: x(lower), y: (size.height - height) / 2,
                                  width: max(1, size.width / CGFloat(bars) - 1), height: height)
                let included = kept?.contains((lower + upper) / 2) == true
                context.fill(Path(rect), with: .color(CapturePalette.accent.opacity(included ? 0.9 : 0.2)))
            }
        }
        for range in removedRanges {
            if let visible = window.sourceRange(programStart: range.lowerBound, programEnd: range.upperBound, offset: programOffset) {
                let rect = CGRect(x: x(visible.lowerBound), y: 0, width: x(visible.upperBound) - x(visible.lowerBound), height: size.height)
                context.fill(Path(rect), with: .color(CapturePalette.plum.opacity(0.2)))
                var cross = Path()
                cross.move(to: CGPoint(x: rect.minX, y: size.height / 2))
                cross.addLine(to: CGPoint(x: rect.maxX, y: size.height / 2))
                context.stroke(cross, with: .color(CapturePalette.plum), lineWidth: 2)
            }
        }
        for boundary in [keepStart - programOffset, keepEnd - programOffset] where boundary >= window.start && boundary <= window.end {
            var line = Path()
            line.move(to: CGPoint(x: x(boundary), y: 0))
            line.addLine(to: CGPoint(x: x(boundary), y: size.height))
            context.stroke(line, with: .color(CapturePalette.brass), style: StrokeStyle(lineWidth: 2, dash: [4, 3]))
        }
        if position >= window.start && position <= window.end {
            var line = Path()
            line.move(to: CGPoint(x: x(position), y: 0))
            line.addLine(to: CGPoint(x: x(position), y: size.height))
            context.stroke(line, with: .color(.primary), lineWidth: 2)
        }
    }
}
