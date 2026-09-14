import SwiftUI
import UIKit

/// The standard system picker writes the same opaque sRGB hex used by Nest.
/// A nil color is meaningful: the tag follows the app theme on every device.
struct CaptureTagColorField: View {
    @Binding var hexColor: String?

    private var color: Binding<Color> {
        Binding(get: {
            let rgb = CaptureTagColor(hex: hexColor) ?? CaptureTagColor(hex: "#506b46")!
            return Color(.sRGB, red: rgb.red, green: rgb.green, blue: rgb.blue, opacity: 1)
        }, set: { value in
            guard let space = CGColorSpace(name: CGColorSpace.sRGB),
                  let converted = UIColor(value).cgColor.converted(to: space, intent: .defaultIntent, options: nil),
                  let components = converted.components, components.count >= 3,
                  let rgb = CaptureTagColor(red: Double(components[0]), green: Double(components[1]), blue: Double(components[2])) else { return }
            hexColor = rgb.hexString
        })
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            ColorPicker("Color", selection: color, supportsOpacity: false)
                .accessibilityIdentifier("CaptureTagColorPicker")
            Button(hexColor == nil ? "Using theme color" : "Use theme color") { hexColor = nil }
                .buttonStyle(.borderless)
                .disabled(hexColor == nil)
                .accessibilityIdentifier("CaptureTagColorReset")
        }
    }
}

struct CaptureTagColorEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var client: CaptureWorkClient
    let tag: MobileCaptureWorkTag
    @State private var hexColor: String?
    @State private var attemptedSave = false

    init(client: CaptureWorkClient, tag: MobileCaptureWorkTag) {
        self.client = client
        self.tag = tag
        _hexColor = State(initialValue: tag.hexColor)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    CaptureWorkTags(tags: [MobileWorkTagLabel(id: tag.id, label: tag.label,
                        hexColor: hexColor, isActive: tag.isActive)], workID: "color-preview")
                    CaptureTagColorField(hexColor: $hexColor)
                } footer: {
                    Text("This color follows the tag throughout the shared Nest.")
                }
                if attemptedSave, let message = client.tagVocabularyMessage {
                    Section { Text(message).foregroundStyle(.secondary) }
                }
            }
            .disabled(client.isMutatingTagVocabulary)
            .captureFormSurface()
            .navigationTitle("Tag color")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }.disabled(client.isMutatingTagVocabulary)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.isMutatingTagVocabulary ? "Saving…" : "Save") {
                        attemptedSave = true
                        Task {
                            if await client.changeTagVocabulary(tag: tag, operation: "COLOR", hexColor: hexColor) {
                                dismiss()
                            }
                        }
                    }
                    .disabled(client.isMutatingTagVocabulary || hexColor == tag.hexColor)
                    .accessibilityIdentifier("CaptureTagColorSave")
                }
            }
        }
    }
}

/// Edits the parent work draft only. Its Save commits text and tags together.
struct CaptureTaskTagPicker: View {
    let tags: [MobileWorkTagLabel]
    @Binding var selection: CaptureTaskTagSelection
    var workLabel: String = "task"
    @State private var search = ""

    private var newLabel: Binding<String> {
        Binding(get: { selection.newTagLabels.first ?? "" }, set: {
            selection.newTagLabels = $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? [] : [$0]
        })
    }

    private var visibleTags: [MobileWorkTagLabel] {
        tags.filter { search.isEmpty || $0.label.localizedCaseInsensitiveContains(search) }
    }

    private func tagRow(_ tag: MobileWorkTagLabel) -> some View {
        let selected = selection.tagIDs.contains(tag.id)
        return Button {
            if selected { selection.tagIDs.removeAll { $0 == tag.id } }
            else if tag.isActive && selection.tagIDs.count + selection.newTagLabels.count < 24 {
                selection.tagIDs.append(tag.id)
                selection.tagIDs.sort()
            }
        } label: {
            HStack(spacing: 12) {
                CaptureWorkTags(tags: [tag], workID: "picker")
                if selected { Image(systemName: "checkmark").foregroundStyle(CapturePalette.ink) }
            }
            .frame(minHeight: 44)
        }
        .accessibilityLabel(tag.label)
        .accessibilityValue(selected ? "Selected" : "Not selected")
        .accessibilityIdentifier("CaptureTaskTagChoice_\(tag.id)")
        .disabled(!selected && !tag.isActive)
    }

    var body: some View {
        List {
            Section("Tags") {
                ForEach(visibleTags) { tag in tagRow(tag) }
                if tags.isEmpty { Text("Add your first tag below.").foregroundStyle(.secondary) }
            }
            Section {
                TextField("Tag name", text: newLabel)
                    .textInputAutocapitalization(.sentences)
                    .accessibilityIdentifier("CaptureTaskTagNewLabel")
                if !selection.isValid {
                    Text("Use up to 24 tags, with names no longer than 80 characters.")
                        .font(.caption).foregroundStyle(CapturePalette.brass)
                }
            } header: {
                Text("New tag")
            } footer: {
                Text("Tags are saved with the \(workLabel). An existing name reuses the same tag and color.")
            }
        }
        .searchable(text: $search, prompt: "Find a tag")
        .captureFormSurface()
        .navigationTitle("Tags")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CaptureTaskTagPicker")
    }
}

struct CaptureWorkTags: View {
    let tags: [MobileWorkTagLabel]
    let workID: String
    var onSelect: ((MobileWorkTagLabel) -> Void)? = nil

    var body: some View {
        CaptureTagWrapLayout(spacing: 6) {
            ForEach(tags) { tag in
                if let onSelect {
                    Button { onSelect(tag) } label: {
                        chip(tag).frame(minHeight: 44).contentShape(Rectangle())
                    }
                        .buttonStyle(.plain)
                        .accessibilityLabel("Show work tagged \(tag.label)")
                        .accessibilityIdentifier("CaptureWorkTagFilter_\(workID)_\(tag.id)")
                } else { chip(tag) }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func chip(_ tag: MobileWorkTagLabel) -> some View {
        let color = CaptureTagColor(hex: tag.hexColor)
        return Text(tag.label)
            .font(.caption.weight(.semibold))
            .foregroundStyle(color.map { $0.usesWhiteText ? Color.white : Color.black } ?? CapturePalette.ink)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(color.map { Color(.sRGB, red: $0.red, green: $0.green, blue: $0.blue, opacity: 1) }
                ?? CapturePalette.ink.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            .fixedSize(horizontal: false, vertical: true)
            .accessibilityLabel("Tag: \(tag.label)\(tag.isActive ? "" : ", archived")")
            .accessibilityIdentifier("CaptureWorkTag_\(workID)_\(tag.id)")
    }
}

/// Tags wrap within the work card, including long labels and Dynamic Type,
/// rather than introducing another horizontal scroller inside a vertical one.
private struct CaptureTagWrapLayout: Layout {
    let spacing: CGFloat

    private func positions(width: CGFloat, subviews: Subviews) -> (points: [CGPoint], size: CGSize) {
        var points: [CGPoint] = []
        var x: CGFloat = 0
        var y: CGFloat = 0
        var rowHeight: CGFloat = 0
        var usedWidth: CGFloat = 0
        for subview in subviews {
            let size = subview.sizeThatFits(ProposedViewSize(width: width, height: nil))
            if x > 0 && x + size.width > width {
                x = 0
                y += rowHeight + spacing
                rowHeight = 0
            }
            points.append(CGPoint(x: x, y: y))
            usedWidth = max(usedWidth, x + size.width)
            x += size.width + spacing
            rowHeight = max(rowHeight, size.height)
        }
        return (points, CGSize(width: usedWidth, height: y + rowHeight))
    }

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width.flatMap { $0.isFinite ? max(0, $0) : nil }
            ?? subviews.map { $0.sizeThatFits(.unspecified).width }.max() ?? 0
        return positions(width: width, subviews: subviews).size
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let layout = positions(width: bounds.width, subviews: subviews)
        for (index, subview) in subviews.enumerated() {
            subview.place(at: CGPoint(x: bounds.minX + layout.points[index].x, y: bounds.minY + layout.points[index].y),
                          anchor: .topLeading, proposal: ProposedViewSize(width: bounds.width, height: nil))
        }
    }
}
