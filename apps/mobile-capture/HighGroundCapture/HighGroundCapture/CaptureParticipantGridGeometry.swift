import Foundation

/// The call stage can be a full iPad window or the space beside an inspector.
/// Its available width, not the device name or size class, determines the grid.
struct CaptureParticipantGridGeometry {
    let columns: Int
    let rows: Int
    let tileSize: CGSize
    let size: CGSize
    let count: Int
    let spacing: CGFloat = 12

    init(count: Int, width: CGFloat, minimumHeight: CGFloat, accessibility: Bool) {
        self.count = max(0, count)
        let width = width.isFinite ? max(0, width) : 320
        let height = minimumHeight.isFinite ? max(0, minimumHeight) : 190
        let capacity = accessibility ? 1 : min(3, max(1, Int((width + 12) / 232)))
        // Balance rows: four people should be 2×2, never three plus an orphan.
        let proposedRows = max(1, (self.count + capacity - 1) / capacity)
        columns = max(1, (self.count + proposedRows - 1) / proposedRows)
        rows = self.count == 0 ? 0 : (self.count + columns - 1) / columns
        let gaps = CGFloat(max(0, rows - 1)) * 12
        tileSize = CGSize(
            width: max(0, (width - CGFloat(columns - 1) * 12) / CGFloat(columns)),
            height: max(accessibility ? 230 : 170, (height - gaps) / CGFloat(max(1, rows)))
        )
        size = CGSize(width: width, height: rows == 0 ? 0 : tileSize.height * CGFloat(rows) + gaps)
    }

    func origin(for index: Int) -> CGPoint {
        let row = index / columns
        let itemsInRow = min(columns, count - row * columns)
        let rowWidth = CGFloat(itemsInRow) * tileSize.width + CGFloat(max(0, itemsInRow - 1)) * spacing
        return CGPoint(
            x: (size.width - rowWidth) / 2 + CGFloat(index % columns) * (tileSize.width + spacing),
            y: CGFloat(row) * (tileSize.height + spacing)
        )
    }
}
