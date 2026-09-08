import SwiftUI

struct CaptureWorkTags: View {
    let tags: [MobileWorkTagLabel]
    let workID: String

    var body: some View {
        CaptureTagWrapLayout(spacing: 6) {
            ForEach(tags) { tag in
                let color = CaptureTagColor(hex: tag.hexColor)
                Text(tag.label)
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
        .frame(maxWidth: .infinity, alignment: .leading)
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
