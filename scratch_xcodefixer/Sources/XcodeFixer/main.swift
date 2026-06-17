import Foundation
import XcodeProj
import PathKit

func main() throws {
    let projectPath = Path("/Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj")
    let xcodeproj = try XcodeProj(path: projectPath)
    let pbxproj = xcodeproj.pbxproj

    // find target
    guard let target = pbxproj.nativeTargets.first(where: { $0.name == "HighGroundCapture" }) else {
        print("Target not found")
        exit(1)
    }

    // HighGroundCapture group
    guard let group = pbxproj.groups.first(where: { $0.path == "HighGroundCapture" || $0.name == "HighGroundCapture" }) else {
        print("Group not found")
        exit(1)
    }

    let filesToAdd = [
        "AuthManager.swift",
        "ContextPickerView.swift",
        "LoginView.swift",
        "MobileContextManager.swift"
    ]

    for file in filesToAdd {
        print("Adding \(file)...")
        let filePath = Path("/Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture/HighGroundCapture/\(file)")
        let sourceRoot = Path("/Users/wall-e/Dev/high-ground-studio/apps/mobile-capture/HighGroundCapture")
        let fileRef = try group.addFile(at: filePath, sourceRoot: sourceRoot)
        let sourceBuildPhase = try target.sourcesBuildPhase()
        let _ = try sourceBuildPhase?.add(file: fileRef)
    }

    try xcodeproj.write(path: projectPath)
    print("Successfully added files to Xcode project!")
}

try main()
