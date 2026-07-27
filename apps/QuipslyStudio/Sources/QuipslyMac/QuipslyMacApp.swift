import AppKit
import SwiftUI
import SwiftData
import QuipslyVideoCore

private var retainedApplicationDelegate: QuipslyMacApplicationDelegate?

@MainActor
private final class AudioRoomMenuCommandController: NSObject, NSMenuItemValidation {
    func validateMenuItem(_ menuItem: NSMenuItem) -> Bool {
        AudioRoomCommandRouter.shared.isAudioRoomActive
    }

    @objc func performAudioRoomCommand(_ sender: NSMenuItem) {
        guard
            let rawValue = sender.representedObject as? String,
            let command = AudioRoomCommand(rawValue: rawValue)
        else { return }

        AudioRoomCommandRouter.shared.send(command)
    }
}

@MainActor
private final class QuipslyMacApplicationDelegate: NSObject, NSApplicationDelegate {
    private let projectStore = ProjectStore(project: VideoProject(title: "New Project"))
    private let playbackEngine = PlaybackEngine()
    private let nativeAccountStore = QuipslyNativeAccountStore()
    private let audioRoomMenuCommandController = AudioRoomMenuCommandController()
    private var keyboardEventMonitor: Any?
    private var mainWindow: NSWindow?
    private var episodeCaptureSetupWindow: NSWindow?

    func applicationDidFinishLaunching(_ notification: Notification) {
        installMainMenu()
        installAudioRoomKeyboardBridge()
        NSApp.setActivationPolicy(.regular)
        NSApp.activate(ignoringOtherApps: true)
        if ProcessInfo.processInfo.arguments.contains(
            "--episode-capture-setup-only"
        ) {
            if ProcessInfo.processInfo.arguments.contains(
                "--episode-capture-request-access"
            ) {
                Task { @MainActor in
                    _ = await ProductionCaptureInventoryProbe.snapshot(
                        requestAccess: true
                    )
                    showEpisodeCaptureSetup(nil)
                }
            } else {
                showEpisodeCaptureSetup(nil)
            }
        } else {
            ensureMainWindow(reason: "launch")
        }
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        ensureMainWindow(reason: flag ? "reopen-visible" : "reopen-no-visible-window")
        return true
    }

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        false
    }

    func applicationWillTerminate(_ notification: Notification) {
        if let keyboardEventMonitor {
            NSEvent.removeMonitor(keyboardEventMonitor)
        }
    }

    private func installAudioRoomKeyboardBridge() {
        keyboardEventMonitor = NSEvent.addLocalMonitorForEvents(matching: .keyDown) { event in
            guard AudioRoomCommandRouter.shared.isAudioRoomActive else { return event }
            guard !event.isARepeat else { return event }

            let modifiers = event.modifierFlags.intersection([.command, .control, .option, .shift])
            let character = event.charactersIgnoringModifiers?.lowercased()
            let command: AudioRoomCommand?

            switch (character, modifiers) {
            case (" ", []): command = .togglePlayback
            case ("j", []): command = .backTenSeconds
            case ("k", []): command = .pause
            case ("l", []): command = .forwardTenSeconds
            case ("i", []): command = .setIn
            case ("o", []): command = .setOut
            case ("[", []): command = .previousMark
            case ("]", []): command = .nextMark
            case ("v", []): command = .nextVoice
            case ("v", [.shift]): command = .firstVoice
            case ("o", [.shift]): command = .nextOverlap
            case ("t", []): command = .selectTenSeconds
            case ("t", [.shift]): command = .selectThirtySeconds
            case ("=", []), ("+", []): command = .zoomIn
            case ("-", []): command = .zoomOut
            case ("0", []): command = .fitEpisode
            case ("s", [.option]): command = .syncEditor
            case ("c", [.command, .shift]): command = .copyAgentState
            default: command = nil
            }

            guard let command else { return event }
            AudioRoomCommandRouter.shared.send(command)
            return nil
        }
    }

    private func installMainMenu() {
        let mainMenu = NSMenu(title: "Quipsly Studio")

        let applicationItem = NSMenuItem()
        mainMenu.addItem(applicationItem)
        let applicationMenu = NSMenu(title: "Quipsly Studio")
        applicationItem.submenu = applicationMenu
        applicationMenu.addItem(
            withTitle: "About Quipsly Studio",
            action: #selector(NSApplication.orderFrontStandardAboutPanel(_:)),
            keyEquivalent: ""
        )
        let captureSetup = applicationMenu.addItem(
            withTitle: "Episode Capture Setup…",
            action: #selector(showEpisodeCaptureSetup(_:)),
            keyEquivalent: "r"
        )
        captureSetup.target = self
        captureSetup.keyEquivalentModifierMask = [.command, .shift]
        applicationMenu.addItem(.separator())
        applicationMenu.addItem(
            withTitle: "Hide Quipsly Studio",
            action: #selector(NSApplication.hide(_:)),
            keyEquivalent: "h"
        )
        let hideOthers = applicationMenu.addItem(
            withTitle: "Hide Others",
            action: #selector(NSApplication.hideOtherApplications(_:)),
            keyEquivalent: "h"
        )
        hideOthers.keyEquivalentModifierMask = [.command, .option]
        applicationMenu.addItem(
            withTitle: "Show All",
            action: #selector(NSApplication.unhideAllApplications(_:)),
            keyEquivalent: ""
        )
        applicationMenu.addItem(.separator())
        applicationMenu.addItem(
            withTitle: "Quit Quipsly Studio",
            action: #selector(NSApplication.terminate(_:)),
            keyEquivalent: "q"
        )

        let editItem = NSMenuItem()
        mainMenu.addItem(editItem)
        let editMenu = NSMenu(title: "Edit")
        editItem.submenu = editMenu
        editMenu.addItem(withTitle: "Undo", action: Selector(("undo:")), keyEquivalent: "z")
        let redo = editMenu.addItem(withTitle: "Redo", action: Selector(("redo:")), keyEquivalent: "z")
        redo.keyEquivalentModifierMask = [.command, .shift]
        editMenu.addItem(.separator())
        editMenu.addItem(withTitle: "Cut", action: #selector(NSText.cut(_:)), keyEquivalent: "x")
        editMenu.addItem(withTitle: "Copy", action: #selector(NSText.copy(_:)), keyEquivalent: "c")
        editMenu.addItem(withTitle: "Paste", action: #selector(NSText.paste(_:)), keyEquivalent: "v")
        editMenu.addItem(withTitle: "Select All", action: #selector(NSText.selectAll(_:)), keyEquivalent: "a")

        let audioRoomItem = NSMenuItem()
        mainMenu.addItem(audioRoomItem)
        let audioRoomMenu = NSMenu(title: "Audio Room")
        audioRoomItem.submenu = audioRoomMenu

        addAudioRoomCommand("Play/Pause Together", command: .togglePlayback, key: " ", to: audioRoomMenu)
        addAudioRoomCommand("Pause", command: .pause, key: "k", to: audioRoomMenu)
        audioRoomMenu.addItem(.separator())
        addAudioRoomCommand("Back 10 Seconds", command: .backTenSeconds, key: "j", to: audioRoomMenu)
        addAudioRoomCommand("Forward 10 Seconds", command: .forwardTenSeconds, key: "l", to: audioRoomMenu)
        audioRoomMenu.addItem(.separator())
        addAudioRoomCommand("Set Selection In", command: .setIn, key: "i", to: audioRoomMenu)
        addAudioRoomCommand("Set Selection Out", command: .setOut, key: "o", to: audioRoomMenu)
        addAudioRoomCommand("Select 10 Seconds", command: .selectTenSeconds, key: "t", to: audioRoomMenu)
        addAudioRoomCommand("Select 30 Seconds", command: .selectThirtySeconds, key: "t", modifiers: [.shift], to: audioRoomMenu)
        audioRoomMenu.addItem(.separator())
        addAudioRoomCommand("Previous Listen Mark", command: .previousMark, key: "[", to: audioRoomMenu)
        addAudioRoomCommand("Next Listen Mark", command: .nextMark, key: "]", to: audioRoomMenu)
        addAudioRoomCommand("Next Voice Activity", command: .nextVoice, key: "v", to: audioRoomMenu)
        addAudioRoomCommand("First Voice Activity", command: .firstVoice, key: "v", modifiers: [.shift], to: audioRoomMenu)
        addAudioRoomCommand("Next Speaker Overlap", command: .nextOverlap, key: "o", modifiers: [.shift], to: audioRoomMenu)
        audioRoomMenu.addItem(.separator())
        addAudioRoomCommand("Zoom In", command: .zoomIn, key: "=", to: audioRoomMenu)
        addAudioRoomCommand("Zoom Out", command: .zoomOut, key: "-", to: audioRoomMenu)
        addAudioRoomCommand("Fit Whole Episode", command: .fitEpisode, key: "0", to: audioRoomMenu)
        audioRoomMenu.addItem(.separator())
        addAudioRoomCommand("Sync Video Editor to Playhead", command: .syncEditor, key: "s", modifiers: [.option], to: audioRoomMenu)
        addAudioRoomCommand("Copy Agent-Readable State", command: .copyAgentState, key: "c", modifiers: [.command, .shift], to: audioRoomMenu)

        NSApp.mainMenu = mainMenu
    }

    @objc private func showEpisodeCaptureSetup(_ sender: Any?) {
        if let episodeCaptureSetupWindow {
            episodeCaptureSetupWindow.makeKeyAndOrderFront(sender)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        let window = NSWindow(
            contentRect: NSRect(x: 220, y: 150, width: 940, height: 760),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Episode Capture Setup"
        window.contentView = NSHostingView(
            rootView: EpisodeCaptureSetupView(
                projectStore: projectStore,
                playbackEngine: playbackEngine,
                nativeAccountStore: nativeAccountStore
            )
        )
        window.setFrameAutosaveName("QuipslyStudioEpisodeCaptureSetup")
        window.isReleasedWhenClosed = false
        window.center()
        window.makeKeyAndOrderFront(sender)
        episodeCaptureSetupWindow = window
        NSApp.activate(ignoringOtherApps: true)
    }

    private func addAudioRoomCommand(
        _ title: String,
        command: AudioRoomCommand,
        key: String,
        modifiers: NSEvent.ModifierFlags = [],
        to menu: NSMenu
    ) {
        let item = NSMenuItem(
            title: title,
            action: #selector(AudioRoomMenuCommandController.performAudioRoomCommand(_:)),
            keyEquivalent: key
        )
        item.target = audioRoomMenuCommandController
        item.representedObject = command.rawValue
        item.keyEquivalentModifierMask = modifiers
        menu.addItem(item)
    }

    func ensureMainWindow(reason: String) {
        AgentServer.shared.writeStatus([
            "projectTitle": "Quipsly Studio Launching",
            "launchStage": "ensure_main_window_started",
            "launchReason": reason,
            "windowVisible": mainWindow?.isVisible ?? false,
            "windowCount": NSApp.windows.count
        ])

        if let mainWindow, mainWindow.isVisible, !mainWindow.isMiniaturized {
            mainWindow.makeKeyAndOrderFront(nil)
            NSApp.activate(ignoringOtherApps: true)
            return
        }

        AgentServer.shared.writeStatus([
            "projectTitle": "Quipsly Studio Launching",
            "launchStage": "before_workspace_view",
            "launchReason": reason,
            "windowVisible": false,
            "windowCount": NSApp.windows.count
        ])
        let rootView = WorkspaceView(
            playbackEngine: playbackEngine,
            projectStore: projectStore,
            nativeAccountStore: nativeAccountStore
        )
            .frame(minWidth: 1180, minHeight: 760)

        AgentServer.shared.writeStatus([
            "projectTitle": "Quipsly Studio Launching",
            "launchStage": "before_hosting_window",
            "launchReason": reason,
            "windowVisible": false,
            "windowCount": NSApp.windows.count
        ])
        let window = NSWindow(
            contentRect: NSRect(x: 160, y: 120, width: 1500, height: 950),
            styleMask: [.titled, .closable, .miniaturizable, .resizable],
            backing: .buffered,
            defer: false
        )
        window.title = "Quipsly Studio"
        window.contentView = NSHostingView(rootView: rootView)
        window.center()
        window.setFrameAutosaveName("QuipslyStudioMainWindow")
        window.isReleasedWhenClosed = false
        window.makeKeyAndOrderFront(nil)
        mainWindow = window
        NSApp.activate(ignoringOtherApps: true)
        AgentServer.shared.writeStatus([
            "projectTitle": "Quipsly Studio Launching",
            "launchStage": "main_window_ordered",
            "launchReason": reason,
            "windowVisible": window.isVisible,
            "windowCount": NSApp.windows.count,
            "windowTitle": window.title
        ])
        print("Quipsly Studio main window created: \(reason)")
    }
}

@main
enum QuipslyMacApp {
    @MainActor
    static func main() {
        print("QuipslyMacApp deterministic AppKit bootstrap started.")
        _ = AgentServer.shared
        AgentServer.shared.writeStatus([
            "projectTitle": "Quipsly Studio Launching",
            "launchStage": "bootstrap_started",
            "windowVisible": false,
            "windowCount": 0
        ])

        let app = NSApplication.shared
        let delegate = QuipslyMacApplicationDelegate()
        retainedApplicationDelegate = delegate
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.finishLaunching()
        if app.windows.isEmpty {
            delegate.ensureMainWindow(reason: "bootstrap-before-run")
        }
        app.activate(ignoringOtherApps: true)
        app.run()
    }
}
