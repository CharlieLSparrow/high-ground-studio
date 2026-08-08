import Foundation
import Testing
@testable import QuipslyMac

@Suite("Shared local media workspace")
struct QuipslyMediaWorkspaceTests {
    @Test("planning is explicit and does not claim activation")
    func plannedWorkspaceContract() throws {
        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent("quipsly-mac-workspace-\(UUID().uuidString)", isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let workspace = root.appendingPathComponent("mounted/Quipsly Media", isDirectory: true)
        let configuration = root.appendingPathComponent("config/workspace.json", isDirectory: false)

        let message = try QuipslyMediaWorkspace.planSharedWorkspace(
            rootPath: workspace.path,
            configurationURL: configuration
        )

        #expect(message.contains("planned"))
        #expect(FileManager.default.fileExists(atPath: workspace.appendingPathComponent("worker-media").path))
        #expect(FileManager.default.fileExists(atPath: workspace.appendingPathComponent("spatial-vault").path))
        #expect(
            QuipslyMediaWorkspace.sharedWorkspaceStatus(
                rootPath: workspace.path,
                configurationURL: configuration
            ) == "Planned — migration required before activation"
        )
        let value = try #require(
            JSONSerialization.jsonObject(with: Data(contentsOf: configuration)) as? [String: Any]
        )
        #expect(value["schema"] as? String == "quipsly-local-media-workspace-v1")
        #expect(value["status"] as? String == "planned")
        #expect(value["activationReceiptSha256"] == nil || value["activationReceiptSha256"] is NSNull)
    }

    @Test("broad filesystem roots are rejected")
    func broadRootsRejected() {
        #expect(throws: Error.self) {
            try QuipslyMediaWorkspace.planSharedWorkspace(rootPath: "/")
        }
        #expect(throws: Error.self) {
            try QuipslyMediaWorkspace.planSharedWorkspace(rootPath: "/Volumes")
        }
    }
}
