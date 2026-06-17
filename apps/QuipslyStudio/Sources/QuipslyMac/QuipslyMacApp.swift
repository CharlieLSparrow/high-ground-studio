import SwiftUI
import SwiftData
// import SharedUI
import QuipslyVideoCore
import AppKit

@MainActor
private final class FallbackEditorWindowController {
    static let shared = FallbackEditorWindowController()

    private let projectStore = ProjectStore(project: VideoProject(title: "New Project"))
    private let playbackEngine = PlaybackEngine()
    private var window: NSWindow?

    func ensureWindowIfNeeded() {
        if let window {
            window.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        guard NSApp.windows.isEmpty else {
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let rootView = WorkspaceView(playbackEngine: playbackEngine, projectStore: projectStore)
            .frame(minWidth: 1180, minHeight: 760)

        let newWindow = NSWindow(
            contentRect: NSRect(x: 160, y: 120, width: 1500, height: 950),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        newWindow.title = "Quipsly Studio"
        newWindow.contentView = NSHostingView(rootView: rootView)
        newWindow.center()
        newWindow.setFrameAutosaveName("QuipslyStudioMainWindow")
        newWindow.isReleasedWhenClosed = false
        newWindow.makeKeyAndOrderFront(nil)
        window = newWindow
        NSApp.activate(ignoringOtherApps: true)
    }
}

@MainActor
class AppDelegate: NSObject, NSApplicationDelegate {
    func applicationDidFinishLaunching(_ notification: Notification) {
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
            FallbackEditorWindowController.shared.ensureWindowIfNeeded()
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            FallbackEditorWindowController.shared.ensureWindowIfNeeded()
        }
        return true
    }
}

@main
struct QuipslyMacApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject var projectStore = ProjectStore(project: VideoProject(title: "New Project"))
    @StateObject var playbackEngine = PlaybackEngine()

    init() {
        print("QuipslyMacApp init started!")
        _ = AgentServer.shared
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 750_000_000)
            FallbackEditorWindowController.shared.ensureWindowIfNeeded()
        }
    }

    var body: some Scene {
        WindowGroup {
            WorkspaceView(playbackEngine: playbackEngine, projectStore: projectStore)
                .frame(minWidth: 1180, minHeight: 760)
                .onAppear {
                    print("WorkspaceView appeared!")
                }
        }
        .defaultSize(width: 1500, height: 950)
    }
}
