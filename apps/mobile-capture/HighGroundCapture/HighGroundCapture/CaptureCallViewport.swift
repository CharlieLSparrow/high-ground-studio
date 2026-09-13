import SwiftUI

enum CaptureCallPanel: String {
    case chat, notes, tasks, tools
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

/// Four familiar tools must remain legible at phone width. A horizontal Label
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
