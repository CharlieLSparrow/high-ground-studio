import SwiftUI
import QuipslyVideoCore

enum ProgramCropEditMode: String, CaseIterable, Identifiable {
    case baseline
    case keyframe

    var id: String { rawValue }

    var title: String {
        switch self {
        case .baseline: return "Base frame"
        case .keyframe: return "Keyframe"
        }
    }

    var helperText: String {
        switch self {
        case .baseline:
            return "Fix the default crop once for this camera and output format."
        case .keyframe:
            return "Write a timed crop at the playhead for moves, punch-ins, and emphasis."
        }
    }

    var shortLabel: String {
        switch self {
        case .baseline: return "whole lane"
        case .keyframe: return "at playhead"
        }
    }
}

private enum ProgramCropNudgeStrength: String, CaseIterable, Identifiable {
    case fine
    case normal
    case bold

    var id: String { rawValue }

    var title: String {
        switch self {
        case .fine: return "Fine"
        case .normal: return "Normal"
        case .bold: return "Bold"
        }
    }

    var panStep: Double {
        switch self {
        case .fine: return 0.01
        case .normal: return 0.03
        case .bold: return 0.08
        }
    }

    var zoomStep: Double {
        switch self {
        case .fine: return 0.03
        case .normal: return 0.08
        case .bold: return 0.18
        }
    }

    var helperText: String {
        switch self {
        case .fine: return "Tiny corrections."
        case .normal: return "Usual edits."
        case .bold: return "Big reframes."
        }
    }
}

struct InspectorSidebarView: View {
    @ObservedObject var playbackEngine: PlaybackEngine
    @ObservedObject var projectStore: ProjectStore

    @Binding var yaw: Double
    @Binding var pitch: Double
    @Binding var roll: Double
    @Binding var fov: Double
    @Binding var interpolation: InterpolationMode

    let selectedLane: VideoLane?
    @Binding var programCropEditMode: ProgramCropEditMode
    let programCrop: ProgramCropAdjustment
    let programCropAtPlayhead: ProgramCropAdjustment
    let programCropKeyframeCount: Int
    let clipFocusLayout: ClipFocusLayoutSettings
    let updateKeyframe: () -> Void
    let updateClipFocusLayout: (ClipFocusLayoutSettings) -> Void
    let updateProgramCrop: (ProgramCropAdjustment) -> Void
    let updateProgramCropKeyframe: (ProgramCropAdjustment) -> Void
    let addProgramCropKeyframe: () -> Void
    let clearProgramCropKeyframes: () -> Void
    let rebuildPlayer: () -> Void

    @State private var cropNudgeStrength: ProgramCropNudgeStrength = .normal

    var body: some View {
        ScrollView(.vertical, showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                inspectorHeader
                formatCard
                clipFocusLayoutCard
                framingCard
                programCropCard
                doctrineFooter
            }
            .padding(16)
        }
        .background(QuipslyStudioTheme.sidePanelGradient)
    }

    private var clipFocusLayoutCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Clip + reactions", systemImage: "rectangle.inset.filled.and.person.filled")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(playbackEngine.playbackFormat.rawValue)
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
            }

            Picker("Layout", selection: Binding(
                get: { clipFocusLayout.placement },
                set: { placement in
                    var next = clipFocusLayout
                    next.placement = placement
                    updateClipFocusLayout(next.normalized())
                }
            )) {
                ForEach(ClipFocusPlacement.allCases) { placement in
                    Text(placement.title).tag(placement)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .help("Corners overlays reactions on the full clip. Host Wings keeps both hosts large at the outside edges with a smaller whole clip between them. Clip Above reserves a strip. Side Rail keeps reactions beside it.")

            Picker("Clip framing", selection: Binding(
                get: { clipFocusLayout.clipContentMode },
                set: { contentMode in
                    var next = clipFocusLayout
                    next.clipContentMode = contentMode
                    updateClipFocusLayout(next.normalized())
                }
            )) {
                ForEach(ClipFocusContentMode.allCases) { mode in
                    Text(mode.title).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .help("Whole Clip preserves every edge. Crop to Fill intentionally trades edges for a larger image.")

            HStack(spacing: 8) {
                Text("Reaction strip")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(.secondary)
                Slider(
                    value: Binding(
                        get: { clipFocusLayout.reactionSize },
                        set: { value in
                            var next = clipFocusLayout
                            next.reactionSize = value
                            updateClipFocusLayout(next.normalized())
                        }
                    ),
                    in: 0.10...0.40
                )
                Text("\(Int((clipFocusLayout.reactionSize * 100).rounded()))%")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.creek)
                    .frame(width: 34, alignment: .trailing)
            }

            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Label("Clip focus point", systemImage: "scope")
                        .font(.caption2)
                        .fontWeight(.bold)
                        .foregroundStyle(.secondary)
                    Spacer()
                    Button("Recenter") {
                        var next = clipFocusLayout
                        next.focusX = 0
                        next.focusY = 0
                        updateClipFocusLayout(next.normalized())
                    }
                    .buttonStyle(.borderless)
                    .controlSize(.small)
                    .help("Return the clip focal point to the center without changing zoom.")
                }

                HStack(spacing: 8) {
                    Text("Left")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Slider(
                        value: Binding(
                            get: { clipFocusLayout.focusX },
                            set: { value in
                                var next = clipFocusLayout
                                next.focusX = value
                                updateClipFocusLayout(next.normalized())
                            }
                        ),
                        in: -1...1
                    )
                    .accessibilityLabel("Horizontal clip focus")
                    Text("Right")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                HStack(spacing: 8) {
                    Text("Top")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    Slider(
                        value: Binding(
                            get: { clipFocusLayout.focusY },
                            set: { value in
                                var next = clipFocusLayout
                                next.focusY = value
                                updateClipFocusLayout(next.normalized())
                            }
                        ),
                        in: -1...1
                    )
                    .accessibilityLabel("Vertical clip focus")
                    Text("Bottom")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }

                Text("X \(Int((clipFocusLayout.focusX * 100).rounded()))%  ·  Y \(Int((clipFocusLayout.focusY * 100).rounded()))%")
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.bold)
                    .foregroundStyle(QuipslyStudioTheme.creek)
            }
            .padding(10)
            .background(QuipslyStudioTheme.panelLift.opacity(0.34))
            .clipShape(RoundedRectangle(cornerRadius: 10))
            .help("Choose which part of the watched clip stays centered when zoom or Crop to Fill trims an edge. This never changes the source file.")

            HStack(spacing: 6) {
                Button("Corners") {
                    updateClipFocusLayout(ClipFocusLayoutSettings(
                        placement: .cornerSquares,
                        reactionSize: playbackEngine.playbackFormat == .horizontal16x9 ? 0.28 : 0.20,
                        clipContentMode: .fit,
                        focusX: clipFocusLayout.focusX,
                        focusY: clipFocusLayout.focusY
                    ))
                }
                Button("Side sliver") {
                    updateClipFocusLayout(ClipFocusLayoutSettings(
                        placement: .sideRail,
                        reactionSize: 0.14,
                        clipContentMode: .fit,
                        focusX: clipFocusLayout.focusX,
                        focusY: clipFocusLayout.focusY
                    ))
                }
                Button("Fill frame") {
                    var next = clipFocusLayout
                    next.clipContentMode = .fill
                    updateClipFocusLayout(next.normalized())
                }
            }
            .buttonStyle(.bordered)
            .controlSize(.small)

            Text("These are edit defaults for the current sequence and output shape. They never crop or rewrite source media.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(12)
        .background(QuipslyStudioTheme.livingPanelGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(QuipslyStudioTheme.quietStroke, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var inspectorHeader: some View {
        QuipslySectionHeader(
            eyebrow: "Frame Bench",
            title: "Base Framing",
            detail: "Set each source track's default composition first. Then add keyframes only where the moment wants emphasis.",
            systemImage: "viewfinder",
            tint: QuipslyStudioTheme.creek,
            compact: true
        )
    }

    private var formatCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Output shape", systemImage: "rectangle.on.rectangle")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(.secondary)

            Picker("Format", selection: $playbackEngine.playbackFormat) {
                Text("16:9").tag(ExportFormat.horizontal16x9)
                Text("9:16").tag(ExportFormat.vertical9x16)
            }
            .pickerStyle(.segmented)
            .onChange(of: playbackEngine.playbackFormat) { _ in
                rebuildPlayer()
            }

            Text(playbackEngine.playbackFormat == .horizontal16x9 ? "Wide master for YouTube, Patreon, episode pages, and long-form publishing." : "Vertical output for Shorts, Reels, and mobile stories. Crop once, refine when the moment asks.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(12)
        .background(QuipslyStudioTheme.livingPanelGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(QuipslyStudioTheme.quietStroke, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var framingCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Framing controls", systemImage: "viewfinder")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
                Spacer()
                Picker("Interpolation", selection: Binding(
                    get: { interpolation },
                    set: { newValue in
                        interpolation = newValue
                        updateKeyframe()
                    }
                )) {
                    ForEach(InterpolationMode.allCases, id: \.self) { mode in
                        Text(mode.rawValue).tag(mode)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .frame(maxWidth: 98)
            }

            framingSlider("Yaw", value: $yaw, range: -180...180, tint: QuipslyStudioTheme.creek)
            framingSlider("Pitch", value: $pitch, range: -90...90, tint: QuipslyStudioTheme.fern)
            framingSlider("Roll", value: $roll, range: -180...180, tint: QuipslyStudioTheme.clay)
            framingSlider("FOV", value: $fov, range: 30...150, tint: QuipslyStudioTheme.honey)
        }
        .padding(12)
        .background(QuipslyStudioTheme.livingPanelGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(QuipslyStudioTheme.quietStroke, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var programCropCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Label("Base framing", systemImage: "person.crop.rectangle")
                    .font(.caption)
                    .fontWeight(.bold)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(playbackEngine.playbackFormat.rawValue)
                    .font(.caption2.monospacedDigit())
                    .fontWeight(.black)
                    .foregroundStyle(QuipslyStudioTheme.honey)
            }

            if let selectedLane {
                let activeCrop = editableProgramCrop

                selectedLaneHeader(selectedLane, activeCrop: activeCrop)

                cropStackStrip

                Text("Base framing corrects inconsistent filming for this whole source lane. Keyframes add intentional movement over time. Both are metadata over synced source, not cropped media.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                cropModeCards

                Picker("Crop edit mode", selection: $programCropEditMode) {
                    ForEach(ProgramCropEditMode.allCases) { mode in
                        Text(mode.title).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .labelsHidden()
                .help("Base frame fixes the whole lane. Keyframe writes the crop at the shared playhead.")

                Text(programCropEditMode.helperText)
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(programCropEditMode == .baseline ? QuipslyStudioTheme.creek.opacity(0.88) : QuipslyStudioTheme.honey.opacity(0.9))

                cropGestureModeHint

                HStack(spacing: 6) {
                    cropValuePill("Base", programCrop, QuipslyStudioTheme.creek)
                    cropValuePill("Playhead", programCropAtPlayhead, QuipslyStudioTheme.honey)
                }

                cropSlider("Pan X", value: activeCrop.panX, range: -1...1, tint: QuipslyStudioTheme.creek) { value in
                    applyEditableProgramCrop(ProgramCropAdjustment(panX: value, panY: activeCrop.panY, zoom: activeCrop.zoom))
                }
                cropSlider("Pan Y", value: activeCrop.panY, range: -1...1, tint: QuipslyStudioTheme.lichen) { value in
                    applyEditableProgramCrop(ProgramCropAdjustment(panX: activeCrop.panX, panY: value, zoom: activeCrop.zoom))
                }
                cropSlider("Zoom", value: activeCrop.zoom, range: 1...4, tint: QuipslyStudioTheme.honey) { value in
                    applyEditableProgramCrop(ProgramCropAdjustment(panX: activeCrop.panX, panY: activeCrop.panY, zoom: value))
                }

                cropPresetPad(activeCrop)
                podcastFramingPad(activeCrop)
                cropNudgePad(activeCrop)

                HStack(spacing: 8) {
                    Button(programCropEditMode == .baseline ? "Center base" : "Center keyframe") {
                        applyEditableProgramCrop(ProgramCropAdjustment())
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help(programCropEditMode == .baseline
                        ? "Center the base frame for the selected lane and current format."
                        : "Write a neutral crop keyframe at the shared playhead.")

                    Button("Keyframe playhead") {
                        addProgramCropKeyframe()
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.small)
                    .help("Write the current crop as a metadata keyframe at the shared playhead.")

                    if programCropEditMode == .keyframe {
                        Button("Match baseline") {
                            updateProgramCropKeyframe(programCrop)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .help("Write a crop keyframe at the playhead using the current whole-lane baseline values.")
                    }
                }

                HStack(spacing: 8) {
                    Button("Use playhead as base") {
                        updateProgramCrop(programCropAtPlayhead)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .help("Copy the current interpolated playhead crop to the whole-lane base frame for this format.")

                    Button("Clear keyframes") {
                        clearProgramCropKeyframes()
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.small)
                    .disabled(programCropKeyframeCount == 0)
                    .help("Remove all crop keyframes for this lane and current format. Base framing stays intact.")

                    Spacer()

                    Text("\(programCropKeyframeCount) keyframe\(programCropKeyframeCount == 1 ? "" : "s")")
                        .font(.caption2.monospacedDigit())
                        .fontWeight(.black)
                        .foregroundStyle(.secondary)
                }
            } else {
                Text("Select a source lane to tune its crop.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text("The default still works: one speaker fills the frame, two speakers are side-by-side in 16:9 and stacked in 9:16.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(12)
        .background(QuipslyStudioTheme.mossGlassGradient)
        .overlay(
            RoundedRectangle(cornerRadius: 14)
                .stroke(QuipslyStudioTheme.quietStroke, lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 14))
    }

    private var editableProgramCrop: ProgramCropAdjustment {
        switch programCropEditMode {
        case .baseline:
            return programCrop
        case .keyframe:
            return programCropAtPlayhead
        }
    }

    private var cropStackStrip: some View {
        HStack(spacing: 5) {
            cropStackStep("auto fit", QuipslyStudioTheme.moss)
            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(.secondary)
            cropStackStep("base frame", QuipslyStudioTheme.creek)
            Image(systemName: "chevron.right")
                .font(.caption2)
                .foregroundStyle(.secondary)
            cropStackStep("keyframes", QuipslyStudioTheme.honey)
        }
        .help("Quipsly first auto-fits the source, then applies your whole-lane base frame, then applies timed keyframes.")
    }

    private func selectedLaneHeader(_ lane: VideoLane, activeCrop: ProgramCropAdjustment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(lane.name)
                .font(.caption)
                .fontWeight(.semibold)
                .lineLimit(2)

            HStack(alignment: .top, spacing: 8) {
                Image(systemName: programCropEditMode == .baseline ? "camera.metering.center.weighted" : "point.topleft.down.curvedto.point.bottomright.up")
                    .font(.caption)
                    .foregroundStyle(programCropEditMode == .baseline ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey)
                    .frame(width: 18, height: 18)

                VStack(alignment: .leading, spacing: 3) {
                    Text(programCropEditMode == .baseline ? "Setting the track's default frame" : "Adding a timed framing move")
                        .font(.caption2)
                        .fontWeight(.black)
                        .foregroundStyle(programCropEditMode == .baseline ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey)
                    Text(programCropEditMode == .baseline
                         ? "Use this before cutting when the camera was dark, off-center, too wide, or just emotionally wrong."
                         : "Keyframes should be the exception: punch-ins, reactions, emphasis, or fixing one awkward moment.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }
            .padding(9)
            .background((programCropEditMode == .baseline ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey).opacity(0.085))
            .overlay(
                RoundedRectangle(cornerRadius: 12, style: .continuous)
                    .stroke((programCropEditMode == .baseline ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey).opacity(0.18), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))

            HStack(spacing: 6) {
                baseFramingStatusPill("X", String(format: "%.2f", activeCrop.panX), QuipslyStudioTheme.creek)
                baseFramingStatusPill("Y", String(format: "%.2f", activeCrop.panY), QuipslyStudioTheme.lichen)
                baseFramingStatusPill("Zoom", String(format: "%.2fx", activeCrop.zoom), QuipslyStudioTheme.honey)
            }
        }
    }

    private func baseFramingStatusPill(_ label: String, _ value: String, _ color: Color) -> some View {
        HStack(spacing: 4) {
            Text(label.uppercased())
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(color)
            Text(value)
                .font(.caption2.monospacedDigit())
                .fontWeight(.semibold)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 7)
        .padding(.vertical, 4)
        .background(color.opacity(0.08))
        .clipShape(Capsule())
    }

    private var cropGestureModeHint: some View {
        let isBaseline = programCropEditMode == .baseline
        return HStack(alignment: .top, spacing: 8) {
            Image(systemName: isBaseline ? "camera.metering.center.weighted" : "point.topleft.down.curvedto.point.bottomright.up")
                .font(.caption)
                .foregroundStyle(isBaseline ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey)
                .frame(width: 16)

            VStack(alignment: .leading, spacing: 2) {
                Text(isBaseline ? "Program monitor drag fixes the base frame" : "Program monitor drag writes a keyframe")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(isBaseline ? QuipslyStudioTheme.creek.opacity(0.9) : QuipslyStudioTheme.honey.opacity(0.92))
                Text(isBaseline
                    ? "Use this first when the recording was framed wrong everywhere. Then switch to keyframes for punch-ins."
                    : "Use this for emphasis, reactions, and motion at the shared playhead. Base framing stays underneath it.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(8)
        .background((isBaseline ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey).opacity(0.08))
        .overlay(
            RoundedRectangle(cornerRadius: 10)
                .stroke((isBaseline ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey).opacity(0.18), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 10))
        .help("Drag or pinch the Program Output monitor. The selected Position + zoom mode decides whether it changes the whole lane baseline or writes a timed keyframe.")
    }

    private var cropModeCards: some View {
        HStack(spacing: 8) {
            cropModeCard(
                mode: .baseline,
                systemImage: "camera.metering.center.weighted",
                title: "Fix whole camera",
                detail: "Use when framing was off for the whole recording.",
                tint: QuipslyStudioTheme.creek
            )
            cropModeCard(
                mode: .keyframe,
                systemImage: "point.topleft.down.curvedto.point.bottomright.up",
                title: "Animate moment",
                detail: "Use for punch-ins, reactions, and emphasis.",
                tint: QuipslyStudioTheme.honey
            )
        }
    }

    private func cropModeCard(
        mode: ProgramCropEditMode,
        systemImage: String,
        title: String,
        detail: String,
        tint: Color
    ) -> some View {
        let selected = programCropEditMode == mode
        return Button {
            programCropEditMode = mode
        } label: {
            VStack(alignment: .leading, spacing: 5) {
                HStack(spacing: 6) {
                    Image(systemName: systemImage)
                    Text(title)
                        .fontWeight(.black)
                }
                .font(.caption2)
                .foregroundStyle(selected ? tint : .secondary)

                Text(detail)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(9)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(selected ? tint.opacity(0.16) : Color.white.opacity(0.035))
            .overlay(
                RoundedRectangle(cornerRadius: 11)
                    .stroke(selected ? tint.opacity(0.55) : Color.white.opacity(0.07), lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 11))
        }
        .buttonStyle(.plain)
        .help(mode.helperText)
    }

    private func cropStackStep(_ label: String, _ color: Color) -> some View {
        Text(label.uppercased())
            .font(.caption2)
            .fontWeight(.black)
            .tracking(0.4)
            .foregroundStyle(color)
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
            .background(color.opacity(0.12))
            .clipShape(Capsule())
    }

    private func cropValuePill(_ label: String, _ crop: ProgramCropAdjustment, _ color: Color) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label.uppercased())
                .font(.caption2)
                .fontWeight(.black)
                .foregroundStyle(color)
            Text(String(format: "X %.2f  Y %.2f  %.2fx", crop.panX, crop.panY, crop.zoom))
                .font(.caption2.monospacedDigit())
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(color.opacity(0.08))
        .clipShape(RoundedRectangle(cornerRadius: 9))
        .help("\(label) crop values for \(programCropEditMode.shortLabel).")
    }

    @ViewBuilder
    private func cropPresetPad(_ crop: ProgramCropAdjustment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text("Fast framing")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(programCropEditMode == .baseline ? "fix the camera" : "spice this moment")
                    .font(.caption2)
                    .fontWeight(.semibold)
                    .foregroundStyle(programCropEditMode == .baseline ? QuipslyStudioTheme.creek.opacity(0.88) : QuipslyStudioTheme.honey.opacity(0.9))
            }

            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                cropPresetButton("Centered", systemImage: "scope", crop: ProgramCropAdjustment(panX: 0, panY: 0, zoom: max(1.08, crop.zoom)))
                cropPresetButton("Upper third", systemImage: "person.crop.rectangle.badge.plus", crop: upperThirdCrop(from: crop))
                cropPresetButton("Tighter", systemImage: "plus.magnifyingglass", crop: crop.adjusted(zoomDelta: 0.18))
                cropPresetButton("Looser", systemImage: "minus.magnifyingglass", crop: crop.adjusted(zoomDelta: -0.18))
                cropPresetButton("Headroom", systemImage: "arrow.up.to.line.compact", crop: ProgramCropAdjustment(panX: crop.panX, panY: -0.18, zoom: max(1.18, crop.zoom)))
                cropPresetButton("Nudge left", systemImage: "person.crop.rectangle.badge.arrow.backward", crop: ProgramCropAdjustment(panX: -0.22, panY: crop.panY, zoom: max(1.18, crop.zoom)))
                cropPresetButton("Nudge right", systemImage: "person.crop.rectangle.badge.arrow.forward", crop: ProgramCropAdjustment(panX: 0.22, panY: crop.panY, zoom: max(1.18, crop.zoom)))
            }

            Text(programCropEditMode == .baseline
                ? "Base presets are for cameras that were framed weirdly all day."
                : "Keyframe presets are for punch-ins, reactions, and visual emphasis at the playhead.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(QuipslyStudioTheme.panelLift.opacity(0.44))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func cropPresetButton(_ title: String, systemImage: String, crop: ProgramCropAdjustment) -> some View {
        Button {
            applyEditableProgramCrop(crop)
        } label: {
            Label(title, systemImage: systemImage)
                .font(.caption2)
                .fontWeight(.bold)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .help("\(title) \(programCropEditMode.title.lowercased()) crop for the selected lane and current output format.")
    }

    private func upperThirdCrop(from crop: ProgramCropAdjustment) -> ProgramCropAdjustment {
        if playbackEngine.playbackFormat == .horizontal16x9 {
            return ProgramCropAdjustment(panX: crop.panX == 0 ? 0.03 : crop.panX, panY: -0.24, zoom: max(1.26, crop.zoom))
        }
        return ProgramCropAdjustment(panX: crop.panX == 0 ? 0.04 : crop.panX, panY: -0.18, zoom: max(1.42, crop.zoom))
    }

    @ViewBuilder
    private func podcastFramingPad(_ crop: ProgramCropAdjustment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label("Podcast framing", systemImage: "person.2.crop.square.stack")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(playbackEngine.playbackFormat == .horizontal16x9 ? "episode" : "short")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(playbackEngine.playbackFormat == .horizontal16x9 ? QuipslyStudioTheme.creek : QuipslyStudioTheme.honey)
            }

            Text("Applies to \(playbackEngine.playbackFormat.rawValue) only. Switch formats to set the wide episode and vertical shorts separately.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            if playbackEngine.playbackFormat == .horizontal16x9 {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                    cropPresetButton(
                        "Upper third",
                        systemImage: "person.crop.rectangle.badge.plus",
                        crop: upperThirdCrop(from: crop)
                    )
                    cropPresetButton(
                        "Solo safe",
                        systemImage: "person.crop.rectangle",
                        crop: ProgramCropAdjustment(panX: 0, panY: -0.04, zoom: max(1.10, crop.zoom))
                    )
                    cropPresetButton(
                        "Hide desk",
                        systemImage: "arrow.up.to.line.compact",
                        crop: ProgramCropAdjustment(panX: crop.panX, panY: -0.20, zoom: max(1.22, crop.zoom))
                    )
                    cropPresetButton(
                        "Weight left",
                        systemImage: "rectangle.leadinghalf.filled",
                        crop: ProgramCropAdjustment(panX: -0.18, panY: crop.panY, zoom: max(1.12, crop.zoom))
                    )
                    cropPresetButton(
                        "Weight right",
                        systemImage: "rectangle.trailinghalf.filled",
                        crop: ProgramCropAdjustment(panX: 0.18, panY: crop.panY, zoom: max(1.12, crop.zoom))
                    )
                }
            } else {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 6) {
                    cropPresetButton(
                        "Upper third",
                        systemImage: "person.crop.rectangle.badge.plus",
                        crop: upperThirdCrop(from: crop)
                    )
                    cropPresetButton(
                        "Vertical solo",
                        systemImage: "iphone",
                        crop: ProgramCropAdjustment(panX: 0, panY: -0.06, zoom: max(1.35, crop.zoom))
                    )
                    cropPresetButton(
                        "Punch in",
                        systemImage: "plus.magnifyingglass",
                        crop: crop.adjusted(zoomDelta: 0.30)
                    )
                    cropPresetButton(
                        "Stack top",
                        systemImage: "rectangle.split.1x2",
                        crop: ProgramCropAdjustment(panX: 0, panY: -0.14, zoom: max(1.18, crop.zoom))
                    )
                    cropPresetButton(
                        "Stack bottom",
                        systemImage: "rectangle.split.1x2.fill",
                        crop: ProgramCropAdjustment(panX: 0, panY: 0.14, zoom: max(1.18, crop.zoom))
                    )
                }
            }
        }
        .padding(10)
        .background(QuipslyStudioTheme.panelLift.opacity(0.34))
        .clipShape(RoundedRectangle(cornerRadius: 12))
        .help("Podcast framing presets write crop metadata for the selected lane and current output format.")
    }

    @ViewBuilder
    private func cropNudgePad(_ crop: ProgramCropAdjustment) -> some View {
        let panStep = cropNudgeStrength.panStep
        let zoomStep = cropNudgeStrength.zoomStep

        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Text("Quick nudge")
                    .font(.caption2)
                    .fontWeight(.black)
                    .foregroundStyle(.secondary)
                Spacer()
                Text(String(format: "X %.2f  Y %.2f  %.2fx", crop.panX, crop.panY, crop.zoom))
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(.secondary)
            }

            Picker("Nudge size", selection: $cropNudgeStrength) {
                ForEach(ProgramCropNudgeStrength.allCases) { strength in
                    Text(strength.title).tag(strength)
                }
            }
            .pickerStyle(.segmented)
            .labelsHidden()
            .help("Fine is for exact face placement. Bold is for fast reframing when the camera was way off.")

            Text(cropNudgeStrength.helperText)
                .font(.caption2)
                .foregroundStyle(.secondary)

            HStack(spacing: 6) {
                cropNudgeButton("←", systemImage: "arrow.left", crop: crop.adjusted(panXDelta: -panStep))
                cropNudgeButton("↑", systemImage: "arrow.up", crop: crop.adjusted(panYDelta: -panStep))
                cropNudgeButton("↓", systemImage: "arrow.down", crop: crop.adjusted(panYDelta: panStep))
                cropNudgeButton("→", systemImage: "arrow.right", crop: crop.adjusted(panXDelta: panStep))
            }

            HStack(spacing: 6) {
                Button("Zoom -") {
                    applyEditableProgramCrop(crop.adjusted(zoomDelta: -zoomStep))
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("Zoom the selected program crop out slightly.")

                Button("Zoom +") {
                    applyEditableProgramCrop(crop.adjusted(zoomDelta: zoomStep))
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("Zoom the selected program crop in slightly.")

                Button("Center") {
                    applyEditableProgramCrop(ProgramCropAdjustment(panX: 0, panY: 0, zoom: crop.zoom))
                }
                .buttonStyle(.bordered)
                .controlSize(.small)
                .help("Center pan while keeping the current zoom.")
            }
        }
        .padding(10)
        .background(Color.black.opacity(0.18))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }

    private func cropNudgeButton(_ label: String, systemImage: String, crop: ProgramCropAdjustment) -> some View {
        Button {
            applyEditableProgramCrop(crop)
        } label: {
            Label(label, systemImage: systemImage)
                .labelStyle(.iconOnly)
                .frame(width: 26)
        }
        .buttonStyle(.bordered)
        .controlSize(.small)
        .help("Nudge \(programCropEditMode.title.lowercased()) crop \(label).")
    }

    private func applyEditableProgramCrop(_ crop: ProgramCropAdjustment) {
        switch programCropEditMode {
        case .baseline:
            updateProgramCrop(crop)
        case .keyframe:
            updateProgramCropKeyframe(crop)
        }
    }

    private func framingSlider(_ title: String, value: Binding<Double>, range: ClosedRange<Double>, tint: Color) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(title)
                    .font(.caption)
                    .fontWeight(.bold)
                Spacer()
                Text(String(format: "%.1f°", value.wrappedValue))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(tint)
            }

            Slider(value: Binding(
                get: { value.wrappedValue },
                set: { newValue in
                    value.wrappedValue = newValue
                    updateKeyframe()
                }
            ), in: range)
            .tint(tint)
            .help("Adjust \(title.lowercased()) at the playhead and write a metadata keyframe.")
        }
    }

    private func cropSlider(_ title: String, value: Double, range: ClosedRange<Double>, tint: Color, onChange: @escaping (Double) -> Void) -> some View {
        VStack(alignment: .leading, spacing: 5) {
            HStack {
                Text(title)
                    .font(.caption)
                    .fontWeight(.bold)
                Spacer()
                Text(title == "Zoom" ? String(format: "%.2fx", value) : String(format: "%.2f", value))
                    .font(.caption.monospacedDigit())
                    .foregroundStyle(tint)
            }

            Slider(value: Binding(
                get: { value },
                set: { onChange($0) }
            ), in: range)
            .tint(tint)
            .help("Adjust \(title.lowercased()) \(programCropEditMode.title.lowercased()) crop for the selected source lane in the current output format.")
        }
    }

    private var doctrineFooter: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label("Non-destructive", systemImage: "bolt.shield")
                .font(.caption)
                .fontWeight(.bold)
                .foregroundStyle(QuipslyStudioTheme.moss)
            Text("This panel writes edit intent: framing, format, and keyframe metadata. It does not mutate the camera file.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(10)
        .background(QuipslyStudioTheme.moss.opacity(0.07))
        .clipShape(RoundedRectangle(cornerRadius: 12))
    }
}
