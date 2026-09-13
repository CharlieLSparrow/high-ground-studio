import SwiftUI

enum CaptureCallPanel: String {
    case chat, notes, tasks, people, tools
}

/// Calls occupy the available stage, unlike the session's scrolling document.
/// Geometry is measured after the safe-area control dock, so participant tiles
/// grow on iPad without pushing microphone, camera, or Leave off screen.
struct CaptureCallViewport<Content: View>: View {
    @ViewBuilder let content: (CGFloat) -> Content

    var body: some View {
        GeometryReader { geometry in
            let height = max(0, geometry.size.height)
            ScrollView {
                content(max(190, height - 190))
                    .frame(maxWidth: .infinity, minHeight: height, alignment: .top)
            }
            .scrollBounceBehavior(.basedOnSize)
        }
    }
}

/// Familiar tools must remain legible at phone width. A horizontal Label
/// inside each bordered button can leave only one character of text per line.
struct CaptureCallToolLabelStyle: LabelStyle {
    func makeBody(configuration: Configuration) -> some View {
        VStack(spacing: 4) {
            configuration.icon.font(.body)
            configuration.title
                .font(.caption.weight(.semibold))
                .lineLimit(1)
                .minimumScaleFactor(0.75)
        }
        .frame(maxWidth: .infinity, minHeight: 40)
    }
}

struct CaptureCallWorkspaceButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .padding(.horizontal, 4)
            .frame(maxWidth: .infinity, minHeight: 48)
            .foregroundStyle(CapturePalette.ink)
            .background(CapturePalette.accent.opacity(configuration.isPressed ? 0.24 : 0.12),
                        in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct CaptureCallPeopleWorkspace: View {
    @ObservedObject var providerRoom: ProviderRoomController
    let onDismiss: () -> Void
    @State private var query = ""

    private var people: [ProviderCallPerson] {
        let search = query.trimmingCharacters(in: .whitespacesAndNewlines)
        return providerRoom.peopleInCall.filter { search.isEmpty || $0.name.localizedStandardContains(search) }
    }

    var body: some View {
        CaptureWorkspaceNavigation(title: "People", embedded: true, onDismiss: onDismiss, actions: { EmptyView() }) {
            VStack(spacing: 0) {
                HStack {
                    Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
                    TextField("Find a person", text: $query)
                        .textInputAutocapitalization(.never).autocorrectionDisabled()
                        .accessibilityIdentifier("CaptureCallPeopleSearch")
                }.padding(12).background(CapturePalette.surfaceMuted, in: RoundedRectangle(cornerRadius: 12))
                    .padding(16)
                ScrollView {
                    LazyVStack(alignment: .leading, spacing: 16) {
                        Text("\(providerRoom.peopleInCall.count) \(providerRoom.peopleInCall.count == 1 ? "person" : "people") in this call")
                            .font(.subheadline).foregroundStyle(.secondary)
                            .accessibilityIdentifier("CaptureCallPeopleCount")
                        ForEach(people) { person in
                            VStack(alignment: .leading, spacing: 10) {
                                Text(person.name).font(.headline)
                                ForEach(person.devices) { device in
                                    HStack(alignment: .top, spacing: 10) {
                                        Image(systemName: device.microphoneEnabled ? "mic.fill" : "mic.slash.fill")
                                            .foregroundStyle(device.isSpeaking ? CapturePalette.success : .secondary)
                                            .accessibilityHidden(true)
                                        VStack(alignment: .leading, spacing: 3) {
                                            if person.devices.count > 1 {
                                                Text("\(device.endpoint?.deviceLabel ?? "Device")\(device.isLocal ? " · this device" : "")")
                                                    .font(.subheadline.weight(.medium))
                                            }
                                            Text(device.endpoint?.isCompanion == true ? "Audio on another device"
                                                 : device.microphoneEnabled ? (device.isSpeaking ? "Speaking" : "Microphone on") : "Microphone off")
                                                .font(.caption).foregroundStyle(.secondary)
                                        }
                                    }.accessibilityElement(children: .combine)
                                }
                            }
                            .frame(maxWidth: .infinity, alignment: .leading).padding(16)
                            .background(CapturePalette.surface, in: RoundedRectangle(cornerRadius: 16))
                            .accessibilityIdentifier("CaptureCallPerson-\(person.id)")
                        }
                        if people.isEmpty { Text("No one matches that name.").foregroundStyle(.secondary) }
                    }.padding(.horizontal, 16).padding(.bottom, 24)
                }.scrollBounceBehavior(.basedOnSize)
            }.background(CapturePalette.canvas)
                .accessibilityElement(children: .contain).accessibilityIdentifier("CaptureCallPeopleWorkspace")
        }
        .foregroundStyle(CapturePalette.ink)
        .tint(CapturePalette.accent)
    }
}

/// No geometry preference/state feedback loop: SwiftUI supplies the actual
/// stage width on every layout pass, including inspector and window resizing.
struct CaptureParticipantGrid: Layout {
    var minimumHeight: CGFloat
    var accessibility: Bool

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        geometry(width: proposal.width ?? 320, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let grid = geometry(width: bounds.width, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            let origin = grid.origin(for: index)
            subview.place(at: CGPoint(x: bounds.minX + origin.x, y: bounds.minY + origin.y),
                          anchor: .topLeading, proposal: ProposedViewSize(grid.tileSize))
        }
    }

    private func geometry(width: CGFloat, subviews: Subviews) -> CaptureParticipantGridGeometry {
        let naturalHeight = subviews.map {
            $0.sizeThatFits(ProposedViewSize(width: min(width, 220), height: nil)).height
        }.filter(\.isFinite).max() ?? 0
        let grid = CaptureParticipantGridGeometry(count: subviews.count, width: width,
            minimumHeight: minimumHeight, accessibility: accessibility)
        return CaptureParticipantGridGeometry(count: subviews.count, width: width,
            minimumHeight: max(minimumHeight, naturalHeight * CGFloat(grid.rows) + CGFloat(max(0, grid.rows - 1)) * 12),
            accessibility: accessibility)
    }
}
