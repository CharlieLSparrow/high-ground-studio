import Foundation
import CoreGraphics

@main
enum CaptureParticipantGridGeometryTests {
    static func main() {
        let full = CaptureParticipantGridGeometry(count: 4, width: 1024, minimumHeight: 700, accessibility: false)
        precondition(full.columns == 2 && full.rows == 2, "Four people use balanced rows")
        let inspector = CaptureParticipantGridGeometry(count: 3, width: 390, minimumHeight: 700, accessibility: false)
        precondition(inspector.columns == 1, "A narrow iPad stage is not forced into iPad columns")
        let five = CaptureParticipantGridGeometry(count: 5, width: 1024, minimumHeight: 700, accessibility: false)
        precondition(five.origin(for: 3).x > 0, "An incomplete last row is centered")
        for accessibility in [false, true] {
            for width: CGFloat in [0, 180, 320, 390, 500, 740, 1024, 1366, .infinity, .nan] {
                for count in 0...12 {
                    let grid = CaptureParticipantGridGeometry(count: count, width: width, minimumHeight: 560, accessibility: accessibility)
                    precondition(grid.size.width.isFinite && grid.size.height.isFinite)
                    precondition(grid.tileSize.width >= 0 && grid.tileSize.height >= 170)
                    if accessibility { precondition(grid.columns == 1) }
                    for index in 0..<count {
                        let frame = CGRect(origin: grid.origin(for: index), size: grid.tileSize)
                        precondition(frame.minX >= -0.001 && frame.maxX <= grid.size.width + 0.001)
                        precondition(frame.minY >= 0 && frame.maxY <= grid.size.height + 0.001)
                        if index > 0 {
                            let previous = CGRect(origin: grid.origin(for: index - 1), size: grid.tileSize)
                            precondition(!frame.intersects(previous), "Tiles must not overlap")
                        }
                    }
                }
            }
        }
        print("PASS participant grid: phone, iPad, inspector, accessibility, empty and invalid proposals")
    }
}
