import SwiftUI
import SwiftData
import QuipslyVideoCore

@main
struct QuipslyiOSApp: App {
    @StateObject var projectStore = ProjectStore(project: VideoProject(title: "Untitled Project"))
    @StateObject var playbackEngine = PlaybackEngine()
    @StateObject var nativeAccountStore = QuipslyNativeAccountStore()

    var body: some Scene {
        WindowGroup {
            WorkspaceView(
                playbackEngine: playbackEngine,
                projectStore: projectStore,
                nativeAccountStore: nativeAccountStore
            )
        }
    }
}
