import Foundation

private enum CaptureSupportSnapshotHarnessError: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case let .failed(message):
            return message
        }
    }
}

@main
private struct CaptureSupportSnapshotHarness {
    static func main() throws {
        let generatedAt = try XCTUnwrap(
            ISO8601DateFormatter().date(
                from: "2026-07-30T15:00:00Z"
            )
        )
        let snapshot = CaptureSupportSnapshot(
            generatedAt: generatedAt,
            appVersion: "1.0",
            appBuild: "15",
            deviceModelIdentifier: "iPhone17,3",
            systemName: "iOS",
            systemVersion: "26.2",
            accountAccessMode: "SIGNED_IN",
            nestHost: "nest.quipsly.com",
            audioCaptureState: "recording",
            videoCaptureState: "ready",
            roomState: "connected",
            audioRoutePortType: "USBAudio",
            localOriginalCount: -1,
            recoverableUploadCount: 2,
            previewMode: false
        )
        let text = snapshot.shareText

        try require(
            text.contains("App: 1.0 (15)"),
            "The snapshot must identify the exact app build."
        )
        try require(
            text.contains("Audio route type: USBAudio"),
            "The snapshot must include only the coarse route type."
        )
        try require(
            text.contains("Local originals: 0"),
            "Invalid negative counts must not leak into support output."
        )
        try require(
            text.contains("Recoverable uploads: 2"),
            "The snapshot must preserve actionable recovery counts."
        )
        try require(
            text.contains(CaptureSupportSnapshot.privacyBoundary),
            "Every shared snapshot must carry its privacy boundary."
        )

        let newlineProbe = CaptureSupportSnapshot(
            generatedAt: generatedAt,
            appVersion: "1.0\nunexpected line",
            appBuild: "",
            deviceModelIdentifier:
                String(repeating: "x", count: 300),
            systemName: "iOS",
            systemVersion: "26.2",
            accountAccessMode: "SIGNED_IN",
            nestHost: "nest.quipsly.com",
            audioCaptureState: "idle",
            videoCaptureState: "idle",
            roomState: "not connected",
            audioRoutePortType: nil,
            localOriginalCount: 0,
            recoverableUploadCount: 0,
            previewMode: true
        ).shareText

        try require(
            newlineProbe.contains(
                "App: 1.0 unexpected line (unknown)"
            ),
            "Untrusted runtime strings must collapse whitespace and empty values."
        )
        let deviceLine = try XCTUnwrap(
            newlineProbe.split(separator: "\n")
                .first { $0.hasPrefix("Device: ") }
        )
        try require(
            deviceLine.count == "Device: ".count + 256,
            "Runtime values must remain bounded."
        )

        print("PASS Capture support snapshot privacy contract")
    }

    private static func require(
        _ condition: @autoclosure () -> Bool,
        _ message: String
    ) throws {
        guard condition() else {
            throw CaptureSupportSnapshotHarnessError.failed(
                message
            )
        }
    }
}

private func XCTUnwrap<T>(
    _ value: T?,
    file: StaticString = #filePath,
    line: UInt = #line
) throws -> T {
    guard let value else {
        throw CaptureSupportSnapshotHarnessError.failed(
            "Expected a value at \(file):\(line)."
        )
    }
    return value
}
