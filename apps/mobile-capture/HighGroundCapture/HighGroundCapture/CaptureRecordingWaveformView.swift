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
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                CaptureWaveformScrubSurface(window: window, seek: seek)
                .accessibilityElement(children: .ignore)
                .accessibilityLabel("Recording waveform")
                .accessibilityValue(captureRecordingShareTime(position))
                .accessibilityHint("Tap or drag horizontally to move through the original recording.")
                .accessibilityAdjustableAction { direction in
                    guard duration > 0 else { return }
                    let step = max(0.1, window.length / 20)
                    switch direction {
                    case .increment: seek(min(window.end, max(window.start, position + step)))
                    case .decrement: seek(max(window.start, min(window.end, position - step)))
                    @unknown default: break
                    }
                }
                .accessibilityIdentifier("CaptureRecordingWaveformScrub")
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

/// Reject vertical movement before recognition, so the enclosing ScrollView
/// receives it normally. A SwiftUI simultaneous DragGesture can still consume
/// scrolling even when its onChanged handler ignores that movement.
private struct CaptureWaveformScrubSurface: UIViewRepresentable {
    let window: CaptureWaveformWindow
    let seek: (TimeInterval) -> Void

    func makeCoordinator() -> Coordinator { Coordinator(window: window, seek: seek) }

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.backgroundColor = .clear
        view.isAccessibilityElement = false
        let tap = UITapGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.tapped(_:)))
        let pan = UIPanGestureRecognizer(target: context.coordinator, action: #selector(Coordinator.panned(_:)))
        pan.maximumNumberOfTouches = 1
        pan.delegate = context.coordinator
        tap.cancelsTouchesInView = false
        view.addGestureRecognizer(tap)
        view.addGestureRecognizer(pan)
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        context.coordinator.window = window
        context.coordinator.seek = seek
        view.isUserInteractionEnabled = window.duration > 0
    }

    final class Coordinator: NSObject, UIGestureRecognizerDelegate {
        var window: CaptureWaveformWindow
        var seek: (TimeInterval) -> Void

        init(window: CaptureWaveformWindow, seek: @escaping (TimeInterval) -> Void) {
            self.window = window
            self.seek = seek
        }

        func gestureRecognizerShouldBegin(_ recognizer: UIGestureRecognizer) -> Bool {
            guard let pan = recognizer as? UIPanGestureRecognizer else { return true }
            let velocity = pan.velocity(in: pan.view)
            return abs(velocity.x) > abs(velocity.y)
        }

        @objc func tapped(_ recognizer: UITapGestureRecognizer) { move(recognizer) }

        @objc func panned(_ recognizer: UIPanGestureRecognizer) {
            guard [.began, .changed, .ended].contains(recognizer.state) else { return }
            move(recognizer)
        }

        private func move(_ recognizer: UIGestureRecognizer) {
            guard let view = recognizer.view, view.bounds.width > 0, window.duration > 0 else { return }
            seek(window.sourceTime(at: recognizer.location(in: view).x / view.bounds.width))
        }
    }
}
