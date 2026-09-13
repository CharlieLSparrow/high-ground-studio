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
