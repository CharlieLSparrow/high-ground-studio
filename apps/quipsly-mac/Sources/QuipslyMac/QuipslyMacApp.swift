import AppKit
import Carbon
import SwiftUI

@main
@MainActor
final class QuipslyMacApp: NSObject, NSApplicationDelegate {
    private let appState = AppState()
    private let engine = LocalEngineClient()
    private let mediaAccess = MediaAccessStore()
    private var mainWindow: NSWindow?
    private var shortsWindow: NSWindow?
    private var handledLaunchSmokeRequestIDs = Set<String>()

    static func main() {
        let app = NSApplication.shared
        let delegate = QuipslyMacApp()
        app.delegate = delegate
        app.setActivationPolicy(.regular)
        app.run()
    }

    func applicationDidFinishLaunching(_ notification: Notification) {
        writeLaunchDiagnostic("applicationDidFinishLaunching")
        installMainMenu()
        installURLHandler()
        showMainWindow()
        writeLaunchDiagnostic("after showMainWindow windows=\(NSApp.windows.count)")
        NSApp.activate(ignoringOtherApps: true)
        writeLaunchDiagnostic("after activate windows=\(NSApp.windows.count)")
    }

    func applicationShouldHandleReopen(_ sender: NSApplication, hasVisibleWindows flag: Bool) -> Bool {
        if !flag {
            showMainWindow()
        }
        NSApp.activate(ignoringOtherApps: true)
        return true
    }

    private func showMainWindow() {
        if let mainWindow {
            mainWindow.makeKeyAndOrderFront(nil)
            writeLaunchDiagnostic("reused mainWindow isVisible=\(mainWindow.isVisible) windows=\(NSApp.windows.count)")
            return
        }

        let screenVisibleFrame = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1600, height: 1000)
        let preferredEditorSize = NSSize(
            width: min(1600, max(1380, screenVisibleFrame.width * 0.88)),
            height: min(960, max(880, screenVisibleFrame.height * 0.86))
        )
        let editorMinimumSize = NSSize(
            width: min(1440, max(1280, screenVisibleFrame.width * 0.78)),
            height: min(900, max(820, screenVisibleFrame.height * 0.82))
        )

        let window = NSWindow(
            contentRect: NSRect(x: 120, y: 120, width: preferredEditorSize.width, height: preferredEditorSize.height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Quipsly Mac"
        window.titlebarAppearsTransparent = true
        window.toolbarStyle = .unified
        window.collectionBehavior = [.managed, .moveToActiveSpace]
        window.minSize = editorMinimumSize
        window.contentViewController = NSHostingController(rootView: LaunchingShellView())
        window.setFrameAutosaveName("QuipslyMacMainWindow")
        if window.frame.width < editorMinimumSize.width || window.frame.height < editorMinimumSize.height {
            window.setContentSize(editorMinimumSize)
        }
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        mainWindow = window
        writeLaunchDiagnostic("created mainWindow isVisible=\(window.isVisible) frame=\(NSStringFromRect(window.frame)) windows=\(NSApp.windows.count)")
        runLaunchSmokeRequestsIfNeeded()

        DispatchQueue.main.async { [weak self, weak window] in
            guard let self, let window else { return }
            let contentView = ContentView(appState: self.appState, engine: self.engine, mediaAccess: self.mediaAccess)
                .frame(minWidth: editorMinimumSize.width, minHeight: editorMinimumSize.height)
            window.contentViewController = NSHostingController(rootView: contentView)
            window.makeKeyAndOrderFront(nil)
            self.writeLaunchDiagnostic("attached ContentView isVisible=\(window.isVisible) windows=\(NSApp.windows.count)")
            self.runLaunchSmokeRequestsIfNeeded()
        }
    }

    @objc private func showShortsWindowFromMenu() {
        showShortsWindow()
        NSApp.activate(ignoringOtherApps: true)
    }

    private func showShortsWindow() {
        if let shortsWindow {
            shortsWindow.makeKeyAndOrderFront(nil)
            return
        }

        let editorMinimumSize = NSSize(width: 440, height: 800)

        let window = NSWindow(
            contentRect: NSRect(x: 150, y: 150, width: editorMinimumSize.width, height: editorMinimumSize.height),
            styleMask: [.titled, .closable, .miniaturizable, .resizable, .fullSizeContentView],
            backing: .buffered,
            defer: false
        )
        window.title = "Quipsly Shorts Editor"
        window.titlebarAppearsTransparent = true
        window.toolbarStyle = .unified
        window.collectionBehavior = [.managed, .moveToActiveSpace]
        window.minSize = editorMinimumSize
        window.contentViewController = NSHostingController(rootView: LaunchingShellView())
        window.setFrameAutosaveName("QuipslyMacShortsWindow")
        window.center()
        window.makeKeyAndOrderFront(nil)
        window.orderFrontRegardless()
        shortsWindow = window

        DispatchQueue.main.async { [weak self, weak window] in
            guard let self, let window else { return }
            let contentView = ContentView(appState: self.appState, engine: self.engine, mediaAccess: self.mediaAccess, isShortsMode: true)
                .frame(minWidth: editorMinimumSize.width, minHeight: editorMinimumSize.height)
            window.contentViewController = NSHostingController(rootView: contentView)
            window.makeKeyAndOrderFront(nil)
        }
    }

    private func installMainMenu() {
        let mainMenu = NSMenu(title: "Quipsly")

        let appMenuItem = NSMenuItem()
        mainMenu.addItem(appMenuItem)
        let appMenu = NSMenu(title: "Quipsly Mac")
        appMenuItem.submenu = appMenu
        appMenu.addItem(commandItem("About Quipsly Mac", action: #selector(showAboutPanel), key: ""))
        appMenu.addItem(.separator())
        appMenu.addItem(commandItem("Settings...", action: #selector(showSettings), key: ","))
        appMenu.addItem(.separator())
        appMenu.addItem(commandItem("Quit Quipsly Mac", action: #selector(NSApplication.terminate(_:)), key: "q", target: NSApp))

        let fileMenuItem = NSMenuItem()
        mainMenu.addItem(fileMenuItem)
        let fileMenu = NSMenu(title: "File")
        fileMenuItem.submenu = fileMenu
        fileMenu.addItem(commandItem("Open Current Text Document in Browser", action: #selector(openCurrentTextEditorInBrowser), key: "t"))
        fileMenu.addItem(commandItem("Open Current Episode in Browser", action: #selector(openCurrentEditorInBrowser), key: "o"))
        fileMenu.addItem(commandItem("Open Nest Projects", action: #selector(openNestProjects), key: "p"))
        fileMenu.addItem(.separator())
        fileMenu.addItem(commandItem("Refresh Local Engine", action: #selector(refreshLocalEngine), key: "r"))

        let navigateMenuItem = NSMenuItem()
        mainMenu.addItem(navigateMenuItem)
        let navigateMenu = NSMenu(title: "Navigate")
        navigateMenuItem.submenu = navigateMenu
        navigateMenu.addItem(sectionItem(.dashboard, key: "0"))
        navigateMenu.addItem(sectionItem(.nestProjects, key: "p", modifiers: [.command, .shift]))
        navigateMenu.addItem(sectionItem(.manuscriptEditor, key: "t", modifiers: [.command, .shift]))
        navigateMenu.addItem(sectionItem(.assumptions, key: "9"))
        navigateMenu.addItem(sectionItem(.episodeEditor, key: "1"))
        navigateMenu.addItem(sectionItem(.premiereDraftEdit, key: "2"))
        navigateMenu.addItem(sectionItem(.mediaEngine, key: "3"))
        navigateMenu.addItem(sectionItem(.episodeCollaboration, key: "4"))
        navigateMenu.addItem(sectionItem(.nestChat, key: "5"))
        navigateMenu.addItem(sectionItem(.localFiles, key: "6"))
        navigateMenu.addItem(sectionItem(.visionLab, key: "7"))
        navigateMenu.addItem(.separator())
        navigateMenu.addItem(sectionItem(.nestSession, key: "l", modifiers: [.command, .shift]))

        let episodeMenuItem = NSMenuItem()
        mainMenu.addItem(episodeMenuItem)
        let episodeMenu = NSMenu(title: "Episode")
        episodeMenuItem.submenu = episodeMenu
        episodeMenu.addItem(episodeItem("Open Episode 1", projectSlug: "high-ground-odyssey-manuscript", episodeSlug: "episode-1", key: "1"))
        episodeMenu.addItem(episodeItem("Open Episode 2", projectSlug: "high-ground-odyssey-manuscript", episodeSlug: "episode-2", key: "2"))
        episodeMenu.addItem(episodeItem("Open Episode 3", projectSlug: "high-ground-odyssey-manuscript", episodeSlug: "episode-3", key: "3"))
        episodeMenu.addItem(episodeItem("Open Episode 4", projectSlug: "high-ground-odyssey-manuscript", episodeSlug: "episode-4", key: "4"))
        episodeMenu.addItem(.separator())
        episodeMenu.addItem(commandItem("Show Episode Editor", action: #selector(showEpisodeEditor), key: "e"))

        let windowMenuItem = NSMenuItem()
        mainMenu.addItem(windowMenuItem)
        let windowMenu = NSMenu(title: "Window")
        windowMenuItem.submenu = windowMenu
        windowMenu.addItem(commandItem("Show Quipsly Mac", action: #selector(showMainWindowFromMenu), key: "m", modifiers: [.command, .shift]))
        windowMenu.addItem(commandItem("Show Shorts Editor (9:16)", action: #selector(showShortsWindowFromMenu), key: "s", modifiers: [.command, .shift]))
        windowMenu.addItem(commandItem("Minimize", action: #selector(NSWindow.performMiniaturize(_:)), key: "m", target: nil))
        NSApp.windowsMenu = windowMenu

        let helpMenuItem = NSMenuItem()
        mainMenu.addItem(helpMenuItem)
        let helpMenu = NSMenu(title: "Help")
        helpMenuItem.submenu = helpMenu
        helpMenu.addItem(commandItem("Open Quipsly Support", action: #selector(openQuipslySupport), key: "?"))
        NSApp.helpMenu = helpMenu

        NSApp.mainMenu = mainMenu
    }

    private func commandItem(
        _ title: String,
        action: Selector,
        key: String,
        modifiers: NSEvent.ModifierFlags = [.command],
        target: AnyObject? = nil
    ) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: key)
        item.target = target ?? self
        item.keyEquivalentModifierMask = key.isEmpty ? [] : modifiers
        return item
    }

    private func sectionItem(
        _ section: AppSection,
        key: String,
        modifiers: NSEvent.ModifierFlags = [.command]
    ) -> NSMenuItem {
        let item = commandItem(section.title, action: #selector(selectSectionFromMenu(_:)), key: key, modifiers: modifiers)
        item.representedObject = section.rawValue
        return item
    }

    private func episodeItem(_ title: String, projectSlug: String, episodeSlug: String, key: String) -> NSMenuItem {
        let item = commandItem(title, action: #selector(openEpisodeFromMenu(_:)), key: key, modifiers: [.command, .option])
        item.representedObject = "\(projectSlug)|\(episodeSlug)"
        return item
    }

    @objc private func showAboutPanel() {
        NSApp.orderFrontStandardAboutPanel(options: [
            .applicationName: "Quipsly Mac",
            .applicationVersion: "Local Creator Studio",
            .credits: NSAttributedString(string: "A native Mac cockpit for Quipsly media rescue, editing, publishing prep, and local-first creative workflows.")
        ])
    }

    @objc private func showMainWindowFromMenu() {
        showMainWindow()
        NSApp.activate(ignoringOtherApps: true)
    }

    @objc private func showSettings() {
        appState.selectedSection = .settings
        showMainWindowFromMenu()
    }

    @objc private func showEpisodeEditor() {
        appState.normalizeEditorRoute()
        appState.selectedSection = .episodeEditor
        showMainWindowFromMenu()
    }

    @objc private func selectSectionFromMenu(_ sender: NSMenuItem) {
        guard let rawValue = sender.representedObject as? String,
              let section = AppSection(rawValue: rawValue)
        else {
            return
        }

        appState.selectedSection = section
        showMainWindowFromMenu()
    }

    @objc private func openEpisodeFromMenu(_ sender: NSMenuItem) {
        guard let rawTarget = sender.representedObject as? String else {
            return
        }
        let parts = rawTarget.split(separator: "|", maxSplits: 1).map(String.init)
        let projectSlug = parts.first?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty ?? "high-ground-odyssey-manuscript"
        let episodeSlug = parts.dropFirst().first?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
            ?? rawTarget.trimmingCharacters(in: .whitespacesAndNewlines)

        appState.editorProjectSlug = projectSlug
        appState.editorEpisodeSlug = episodeSlug
        appState.selectedSection = .episodeEditor
        showMainWindowFromMenu()
    }

    @objc private func refreshLocalEngine() {
        engine.refreshStatus()
        showMainWindowFromMenu()
    }

    @objc private func openCurrentEditorInBrowser() {
        appState.normalizeEditorRoute()
        NSWorkspace.shared.open(
            NestRouteBuilder.editor(
                baseURL: appState.nestURL,
                projectSlug: appState.editorProjectSlug,
                episodeSlug: appState.editorEpisodeSlug
            )
        )
    }

    @objc private func openCurrentTextEditorInBrowser() {
        NSWorkspace.shared.open(
            NestRouteBuilder.create(
                baseURL: appState.nestURL,
                projectSlug: appState.editorProjectSlug
            )
        )
    }

    @objc private func openNestProjects() {
        NSWorkspace.shared.open(NestRouteBuilder.projects(baseURL: appState.nestURL))
    }

    @objc private func openQuipslySupport() {
        if let url = URL(string: "https://quipsly.com") {
            NSWorkspace.shared.open(url)
        }
    }

    private func installURLHandler() {
        NSAppleEventManager.shared().setEventHandler(
            self,
            andSelector: #selector(handleGetURLEvent(_:withReplyEvent:)),
            forEventClass: AEEventClass(kInternetEventClass),
            andEventID: AEEventID(kAEGetURL)
        )
    }

    @objc private func handleGetURLEvent(_ event: NSAppleEventDescriptor, withReplyEvent replyEvent: NSAppleEventDescriptor) {
        guard let rawURL = event.paramDescriptor(forKeyword: keyDirectObject)?.stringValue,
              let url = URL(string: rawURL)
        else {
            return
        }

        Task { @MainActor in
            if await appState.handleIncomingQuipslyURL(url) {
                showMainWindow()
                NSApp.activate(ignoringOtherApps: true)
            }
        }
    }

    private func writeLaunchDiagnostic(_ message: String) {
        let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("QuipslyMac", isDirectory: true)
            .appendingPathComponent("smoke", isDirectory: true)
        try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        let file = root.appendingPathComponent("launch-diagnostics.log")
        let line = "\(Date().ISO8601Format()) \(message)\n"

        if let handle = try? FileHandle(forWritingTo: file) {
            _ = try? handle.seekToEnd()
            try? handle.write(contentsOf: Data(line.utf8))
            try? handle.close()
        } else {
            try? Data(line.utf8).write(to: file)
        }
    }

    private func runLaunchSmokeRequestsIfNeeded() {
        runRelinkMissingMediaSmokeIfRequested()
        runEditOperationSmokeIfRequested()
        runTimelineHandleTrimSmokeIfRequested()
        runSplitClipSmokeIfRequested()
        runTimelineMoveSmokeIfRequested()
        runTimelineUndoRedoSmokeIfRequested()
        runMotionInspectorSmokeIfRequested()
        runPlaybackModeSmokeIfRequested()
        runMonitorWallSmokeIfRequested()
        runRenderPrepSmokeIfRequested()
        runSourceGapLinkSmokeIfRequested()
    }

    private func runRelinkMissingMediaSmokeIfRequested() {
        let defaults = UserDefaults.standard
        guard let request = relinkSmokeRequestFromArguments() ?? relinkSmokeRequestFromDefaults() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled relink smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        defaults.removeObject(forKey: "quipslyMac.smokeRelinkMissingMediaRequestId")
        writeLaunchDiagnostic("running relink smoke request=\(request.requestID) source=\(request.source)")

        writeLaunchDiagnostic("relink smoke creating LocalEpisodeEditStore")
        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        writeLaunchDiagnostic("relink smoke store ready")
        writeLaunchDiagnostic("relink smoke starting store operation project=\(request.projectSlug) episode=\(request.episodeSlug)")
        let outcome = store.relinkMissingMedia(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)
        writeLaunchDiagnostic("relink smoke store operation complete changed=\(outcome.result.changedClips) unresolved=\(outcome.result.unresolvedFileNames.count)")

        var payload: [String: Any] = [
            "ok": outcome.result.unresolvedFileNames.isEmpty && outcome.afterMissing == 0,
            "failed": !outcome.result.unresolvedFileNames.isEmpty || outcome.afterMissing > 0,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "beforeMissingUniquePaths": outcome.beforeMissing,
            "afterMissingUniquePaths": outcome.afterMissing,
            "checkedUniqueMissingPaths": outcome.result.checkedUniqueMissingPaths,
            "resolvedUniquePaths": outcome.result.resolvedUniquePaths,
            "changedClips": outcome.result.changedClips,
            "unresolvedFileNames": outcome.result.unresolvedFileNames,
            "message": store.lastStatus,
            "wroteAt": Date().ISO8601Format(),
            "source": "app-launch-dispatcher:\(request.source)",
        ]

        if outcome.session == nil {
            payload["ok"] = false
            payload["failed"] = true
            payload["message"] = "No local edit session is loaded for this route."
        }

        writeRelinkMissingMediaSmokePayload(payload, resultPath: request.resultPath)
    }

    private func writeRelinkMissingMediaSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
            let file: URL

            if let explicitPath, !explicitPath.isEmpty {
                file = URL(fileURLWithPath: explicitPath)
                try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            } else {
                let root = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
                    .appendingPathComponent("QuipslyMac", isDirectory: true)
                    .appendingPathComponent("smoke", isDirectory: true)
                try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
                file = root.appendingPathComponent("relink-missing-media.json")
            }

            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote relink smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed relink smoke result write error=\(error.localizedDescription)")
        }
    }

    private func runEditOperationSmokeIfRequested() {
        guard let request = editOperationSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled edit operation smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running edit operation smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        let result = store.runReversibleEditOperationSmoke(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)

        writeEditOperationSmokePayload([
            "ok": result.ok,
            "failed": !result.ok,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "targetClipId": result.targetClipId,
            "targetClipName": result.targetClipName,
            "targetTrackId": result.targetTrackId,
            "beforeIsActive": result.beforeIsActive,
            "changedIsActive": result.changedIsActive,
            "restoredIsActive": result.restoredIsActive,
            "beforeSourceStart": result.beforeSourceStart,
            "changedSourceStart": result.changedSourceStart,
            "restoredSourceStart": result.restoredSourceStart,
            "message": result.message,
            "source": "app-launch-dispatcher:\(request.source)",
            "wroteAt": Date().ISO8601Format(),
        ], resultPath: request.resultPath)
    }

    private func writeEditOperationSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote edit operation smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed edit operation smoke result write error=\(error.localizedDescription)")
        }
    }

    private func runTimelineHandleTrimSmokeIfRequested() {
        guard let request = timelineHandleTrimSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled timeline handle trim smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running timeline handle trim smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        let result = store.runTimelineHandleTrimSmoke(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)

        writeTimelineHandleTrimSmokePayload([
            "ok": result.ok,
            "failed": !result.ok,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "targetClipId": result.targetClipId,
            "targetClipName": result.targetClipName,
            "targetTrackId": result.targetTrackId,
            "beforeClipCount": result.beforeClipCount,
            "changedInClipCount": result.changedInClipCount,
            "changedOutClipCount": result.changedOutClipCount,
            "restoredClipCount": result.restoredClipCount,
            "sourceInDelta": result.sourceInDelta,
            "sourceOutDelta": result.sourceOutDelta,
            "precisionSourceInDeltas": result.precisionSourceInDeltas,
            "precisionSourceInStarts": result.precisionSourceInStarts,
            "precisionSourceInWorked": result.precisionSourceInWorked,
            "precisionSourceOutDeltas": result.precisionSourceOutDeltas,
            "precisionSourceOutEnds": result.precisionSourceOutEnds,
            "precisionSourceOutWorked": result.precisionSourceOutWorked,
            "beforeSourceStart": result.beforeSourceStart,
            "changedInSourceStart": result.changedInSourceStart,
            "restoredSourceStart": result.restoredSourceStart,
            "beforeSourceEnd": result.beforeSourceEnd,
            "changedOutSourceEnd": result.changedOutSourceEnd,
            "restoredSourceEnd": result.restoredSourceEnd,
            "beforeDuration": result.beforeDuration,
            "changedInDuration": result.changedInDuration,
            "changedOutDuration": result.changedOutDuration,
            "restoredDuration": result.restoredDuration,
            "sourceInWorked": result.sourceInWorked,
            "sourceOutWorked": result.sourceOutWorked,
            "restoredCleanly": result.restoredCleanly,
            "message": result.message,
            "source": "app-launch-dispatcher:\(request.source)",
            "wroteAt": Date().ISO8601Format(),
        ], resultPath: request.resultPath)
    }

    private func writeTimelineHandleTrimSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote timeline handle trim smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed timeline handle trim smoke result write error=\(error.localizedDescription)")
        }
    }

    private func runSplitClipSmokeIfRequested() {
        guard let request = splitClipSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled split clip smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running split clip smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        let result = store.runReversibleSplitSmoke(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)

        writeSplitClipSmokePayload([
            "ok": result.ok,
            "failed": !result.ok,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "targetClipId": result.targetClipId,
            "targetClipName": result.targetClipName,
            "targetTrackId": result.targetTrackId,
            "newClipId": result.newClipId,
            "splitAt": result.splitAt,
            "beforeClipCount": result.beforeClipCount,
            "changedClipCount": result.changedClipCount,
            "restoredClipCount": result.restoredClipCount,
            "leftDuration": result.leftDuration,
            "rightDuration": result.rightDuration,
            "sourceContinuity": result.sourceContinuity,
            "restoredHasNewClip": result.restoredHasNewClip,
            "message": result.message,
            "source": "app-launch-dispatcher:\(request.source)",
            "wroteAt": Date().ISO8601Format(),
        ], resultPath: request.resultPath)
    }

    private func writeSplitClipSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote split clip smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed split clip smoke result write error=\(error.localizedDescription)")
        }
    }

    private func runTimelineUndoRedoSmokeIfRequested() {
        guard let request = timelineUndoRedoSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled timeline undo/redo smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running timeline undo/redo smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        let result = store.runTimelineUndoRedoSmoke(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)

        writeTimelineUndoRedoSmokePayload([
            "ok": result.ok,
            "failed": !result.ok,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "targetClipId": result.targetClipId,
            "targetClipName": result.targetClipName,
            "targetTrackId": result.targetTrackId,
            "beforeStartIn": result.beforeStartIn,
            "movedStartIn": result.movedStartIn,
            "undoneStartIn": result.undoneStartIn,
            "redoneStartIn": result.redoneStartIn,
            "restoredStartIn": result.restoredStartIn,
            "undoWorked": result.undoWorked,
            "redoWorked": result.redoWorked,
            "restoredCleanly": result.restoredCleanly,
            "message": result.message,
            "source": "app-launch-dispatcher:\(request.source)",
            "wroteAt": Date().ISO8601Format(),
        ], resultPath: request.resultPath)
    }

    private func writeTimelineUndoRedoSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote timeline undo/redo smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed timeline undo/redo smoke result write error=\(error.localizedDescription)")
        }
    }

    private func runTimelineMoveSmokeIfRequested() {
        guard let request = timelineMoveSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled timeline move smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running timeline move smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        let result = store.runTimelineMoveSmoke(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)

        writeTimelineMoveSmokePayload([
            "ok": result.ok,
            "failed": !result.ok,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "targetClipId": result.targetClipId,
            "targetClipName": result.targetClipName,
            "targetTrackId": result.targetTrackId,
            "beforeStartIn": result.beforeStartIn,
            "movedStartIn": result.movedStartIn,
            "restoredStartIn": result.restoredStartIn,
            "delta": result.delta,
            "precisionDeltas": result.precisionDeltas,
            "precisionStartIns": result.precisionStartIns,
            "precisionWorked": result.precisionWorked,
            "beforeClipCount": result.beforeClipCount,
            "restoredClipCount": result.restoredClipCount,
            "movedByDelta": result.movedByDelta,
            "restoredCleanly": result.restoredCleanly,
            "message": result.message,
            "source": "app-launch-dispatcher:\(request.source)",
            "wroteAt": Date().ISO8601Format(),
        ], resultPath: request.resultPath)
    }

    private func writeTimelineMoveSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote timeline move smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed timeline move smoke result write error=\(error.localizedDescription)")
        }
    }

    private func runMotionInspectorSmokeIfRequested() {
        guard let request = motionInspectorSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled motion inspector smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running motion inspector smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        let result = store.runMotionInspectorSmoke(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)

        writeMotionInspectorSmokePayload([
            "ok": result.ok,
            "failed": !result.ok,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "targetClipId": result.targetClipId,
            "targetClipName": result.targetClipName,
            "targetTrackId": result.targetTrackId,
            "beforeHadMotion": result.beforeHadMotion,
            "adjustedHadMotion": result.adjustedHadMotion,
            "beforeScale": result.beforeScale,
            "adjustedScale": result.adjustedScale,
            "undoneMatchesBefore": result.undoneMatchesBefore,
            "redoneMatchesAdjusted": result.redoneMatchesAdjusted,
            "restoredCleanly": result.restoredCleanly,
            "message": result.message,
            "source": "app-launch-dispatcher:\(request.source)",
            "wroteAt": Date().ISO8601Format(),
        ], resultPath: request.resultPath)
    }

    private func writeMotionInspectorSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote motion inspector smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed motion inspector smoke result write error=\(error.localizedDescription)")
        }
    }

    private func runPlaybackModeSmokeIfRequested() {
        guard let request = playbackModeSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled playback mode smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running playback mode smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        let result = store.runPlaybackModeSmoke(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)

        writePlaybackModeSmokePayload([
            "ok": result.ok,
            "failed": !result.ok,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "targetClipId": result.targetClipId,
            "targetClipName": result.targetClipName,
            "targetTrackId": result.targetTrackId,
            "playhead": result.playhead,
            "playAllBeforeClipName": result.playAllBeforeClipName,
            "playEditBeforeClipName": result.playEditBeforeClipName,
            "playAllAfterClipName": result.playAllAfterClipName,
            "playEditAfterClipName": result.playEditAfterClipName ?? NSNull(),
            "editSkippedDeactivatedTarget": result.editSkippedDeactivatedTarget,
            "nextActiveClipName": result.nextActiveClipName ?? NSNull(),
            "nextActivePlayhead": result.nextActivePlayhead ?? NSNull(),
            "message": result.message,
            "source": "app-launch-dispatcher:\(request.source)",
            "wroteAt": Date().ISO8601Format(),
        ], resultPath: request.resultPath)
    }

    private func writePlaybackModeSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote playback mode smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed playback mode smoke result write error=\(error.localizedDescription)")
        }
    }

    private func runMonitorWallSmokeIfRequested() {
        guard let request = monitorWallSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled monitor wall smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running monitor wall smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        let result = store.runMonitorWallSmoke(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)

        writeMonitorWallSmokePayload([
            "ok": result.ok,
            "failed": !result.ok,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "targetClipId": result.targetClipId,
            "targetClipName": result.targetClipName,
            "targetTrackId": result.targetTrackId,
            "playhead": result.playhead,
            "sourceTrackCountBefore": result.sourceTrackCountBefore,
            "activeOverlapCountBefore": result.activeOverlapCountBefore,
            "sourceTracksBefore": result.sourceTracksBefore,
            "sourceTracksAfter": result.sourceTracksAfter,
            "programEditBeforeClipName": result.programEditBeforeClipName,
            "programAllBeforeClipName": result.programAllBeforeClipName,
            "programEditAfterClipName": result.programEditAfterClipName ?? NSNull(),
            "programAllAfterClipName": result.programAllAfterClipName,
            "sourceMonitorTargetBeforeClipName": result.sourceMonitorTargetBeforeClipName,
            "sourceMonitorTargetAfterClipName": result.sourceMonitorTargetAfterClipName,
            "sourceStillShowsTargetAfterDeactivation": result.sourceStillShowsTargetAfterDeactivation,
            "editSkippedDeactivatedTarget": result.editSkippedDeactivatedTarget,
            "message": result.message,
            "source": "app-launch-dispatcher:\(request.source)",
            "wroteAt": Date().ISO8601Format(),
        ], resultPath: request.resultPath)
    }

    private func writeMonitorWallSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote monitor wall smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed monitor wall smoke result write error=\(error.localizedDescription)")
        }
    }

    private func runRenderPrepSmokeIfRequested() {
        guard let request = renderPrepSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled render prep smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running render prep smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }

        let session = store.session(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)
        let manifest = session.flatMap { store.prepareRenderManifest(sessionID: $0.id) }
        let manifestPath = renderPrepManifestPath(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)
        let manifestExists = FileManager.default.fileExists(atPath: manifestPath)
        let blockers = manifest?.blockers ?? ["No render-prep manifest was generated."]
        let warnings = manifest?.warnings ?? []
        let decisionCount = manifest?.decisionCount ?? 0
        let activeDecisionCount = manifest?.activeDecisionCount ?? 0
        let inactiveDecisionCount = manifest?.inactiveDecisionCount ?? 0
        let videoTrackIds = manifest?.videoTrackIds ?? []
        let audioTrackIds = manifest?.audioTrackIds ?? []
        let includedDecisionCount = manifest?.decisions.filter { $0.renderDisposition == "play-edit-included" }.count ?? 0
        let skippedDecisionCount = manifest?.decisions.filter { $0.renderDisposition == "preserved-skipped" }.count ?? 0
        let activeWithoutLocalMedia = manifest?.decisions.filter { decision in
            let source = session?.sources.first(where: { $0.sourceAssetId == decision.sourceAssetId })
            return decision.isActive && (source?.localMediaPath == nil || source?.mediaExists == false)
        }.count ?? 0
        let motionDecisionCount = manifest?.decisions.filter { $0.motion != nil }.count ?? 0
        let outputMode = manifest?.outputPlan.mode ?? "missing"
        let inactivePolicy = manifest?.outputPlan.inactivePolicy ?? "missing"
        let ok = manifestExists
            && manifest != nil
            && decisionCount > 0
            && activeDecisionCount > 0
            && includedDecisionCount == activeDecisionCount
            && skippedDecisionCount == inactiveDecisionCount
            && outputMode == "play-edit"
            && inactivePolicy == "preserve-in-manifest-skip-in-output"

        var payload: [String: Any] = [:]
        payload["ok"] = ok
        payload["failed"] = !ok
        payload["requestId"] = request.requestID
        payload["projectSlug"] = request.projectSlug
        payload["episodeSlug"] = request.episodeSlug
        payload["sessionId"] = session?.id ?? NSNull()
        payload["manifestPath"] = manifestPath
        payload["manifestExists"] = manifestExists
        payload["readiness"] = manifest?.readiness ?? "missing"
        payload["programDuration"] = manifest?.programDuration ?? 0
        payload["activeEditDuration"] = manifest?.activeEditDuration ?? 0
        payload["decisionCount"] = decisionCount
        payload["activeDecisionCount"] = activeDecisionCount
        payload["inactiveDecisionCount"] = inactiveDecisionCount
        payload["includedDecisionCount"] = includedDecisionCount
        payload["skippedDecisionCount"] = skippedDecisionCount
        payload["activeWithoutLocalMedia"] = activeWithoutLocalMedia
        payload["motionDecisionCount"] = motionDecisionCount
        payload["videoTrackIds"] = videoTrackIds
        payload["audioTrackIds"] = audioTrackIds
        payload["blockers"] = blockers
        payload["warnings"] = warnings
        payload["outputMode"] = outputMode
        payload["inactivePolicy"] = inactivePolicy
        payload["message"] = store.lastStatus
        payload["source"] = "app-launch-dispatcher:\(request.source)"
        payload["wroteAt"] = Date().ISO8601Format()

        writeRenderPrepSmokePayload(payload, resultPath: request.resultPath)
    }

    private func runSourceGapLinkSmokeIfRequested() {
        guard let request = sourceGapLinkSmokeRequestFromArguments() else {
            return
        }
        guard !handledLaunchSmokeRequestIDs.contains(request.requestID) else {
            writeLaunchDiagnostic("already handled source gap link smoke request=\(request.requestID)")
            return
        }
        handledLaunchSmokeRequestIDs.insert(request.requestID)

        writeLaunchDiagnostic("running source gap link smoke request=\(request.requestID) source=\(request.source)")

        let store = LocalEpisodeEditStore()
        store.diagnosticLogger = { [weak self] message in
            self?.writeLaunchDiagnostic("store \(message)")
        }
        let beforeSession = store.session(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)
        let beforeMatchingMissing = beforeSession.map {
            sourceGapMissingClipCount(in: $0, groupLabel: request.groupLabel)
        } ?? -1
        let result = store.linkSourceFileToActiveMissingGroup(
            sessionID: "\(request.projectSlug)-\(request.episodeSlug)",
            groupLabel: request.groupLabel,
            fileURL: URL(fileURLWithPath: request.filePath)
        )
        let afterSession = store.session(projectSlug: request.projectSlug, episodeSlug: request.episodeSlug)
        let afterMatchingMissing = afterSession.map {
            sourceGapMissingClipCount(in: $0, groupLabel: request.groupLabel)
        } ?? -1
        let ok = beforeMatchingMissing > 0
            && result.fileExists
            && result.changedClips == beforeMatchingMissing
            && afterMatchingMissing == 0

        let payload: [String: Any] = [
            "ok": ok,
            "failed": !ok,
            "requestId": request.requestID,
            "projectSlug": request.projectSlug,
            "episodeSlug": request.episodeSlug,
            "groupLabel": request.groupLabel,
            "filePath": request.filePath,
            "fileName": result.fileName,
            "fileExists": result.fileExists,
            "beforeMatchingMissing": beforeMatchingMissing,
            "afterMatchingMissing": afterMatchingMissing,
            "changedClips": result.changedClips,
            "message": store.lastStatus,
            "source": "app-launch-dispatcher:\(request.source)",
            "wroteAt": Date().ISO8601Format(),
        ]

        writeSourceGapLinkSmokePayload(payload, resultPath: request.resultPath)
    }

    private func writeRenderPrepSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote render prep smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed render prep smoke result write error=\(error.localizedDescription)")
        }
    }

    private func writeSourceGapLinkSmokePayload(_ payload: [String: Any], resultPath: String?) {
        do {
            guard let explicitPath = resultPath?.trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty else {
                return
            }
            let file = URL(fileURLWithPath: explicitPath)
            try FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
            let data = try JSONSerialization.data(withJSONObject: payload, options: [.prettyPrinted, .sortedKeys])
            try data.write(to: file, options: .atomic)
            writeLaunchDiagnostic("wrote source gap link smoke result=\(file.path)")
        } catch {
            writeLaunchDiagnostic("failed source gap link smoke result write error=\(error.localizedDescription)")
        }
    }

    private func sourceGapMissingClipCount(in session: LocalEpisodeEditSession, groupLabel: String) -> Int {
        session.editDecisions.filter { decision in
            let source = session.sources.first(where: { $0.sourceAssetId == decision.sourceAssetId })
            guard decision.isActive, source?.sourceGapGroupLabel == groupLabel else {
                return false
            }
            let path = source?.localMediaPath?.trimmingCharacters(in: CharacterSet.whitespacesAndNewlines) ?? ""
            return path.isEmpty || !quipslyFileExists(atPath: path)
        }.count
    }

    private func relinkSmokeRequestFromArguments() -> RelinkSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-relink-missing-media"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return RelinkSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func editOperationSmokeRequestFromArguments() -> EditOperationSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-edit-operations"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return EditOperationSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func timelineHandleTrimSmokeRequestFromArguments() -> TimelineHandleTrimSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-timeline-handle-trim"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return TimelineHandleTrimSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func playbackModeSmokeRequestFromArguments() -> PlaybackModeSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-playback-modes"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return PlaybackModeSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func splitClipSmokeRequestFromArguments() -> SplitClipSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-split-clip"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return SplitClipSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func timelineUndoRedoSmokeRequestFromArguments() -> TimelineUndoRedoSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-timeline-undo-redo"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return TimelineUndoRedoSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func timelineMoveSmokeRequestFromArguments() -> TimelineMoveSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-timeline-move"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return TimelineMoveSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func motionInspectorSmokeRequestFromArguments() -> MotionInspectorSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-motion-inspector"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return MotionInspectorSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func monitorWallSmokeRequestFromArguments() -> MonitorWallSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-monitor-wall"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return MonitorWallSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func renderPrepSmokeRequestFromArguments() -> RenderPrepSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-render-prep"),
              args.count > markerIndex + 4
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return RenderPrepSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "launch-args"
        )
    }

    private func sourceGapLinkSmokeRequestFromArguments() -> SourceGapLinkSmokeRequest? {
        let args = CommandLine.arguments
        guard let markerIndex = args.firstIndex(of: "--quipsly-smoke-source-gap-link"),
              args.count > markerIndex + 6
        else {
            return nil
        }

        guard let requestID = args[markerIndex + 1].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let resultPath = args[markerIndex + 2].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let projectSlug = args[markerIndex + 3].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let episodeSlug = args[markerIndex + 4].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let groupLabel = args[markerIndex + 5].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty,
              let filePath = args[markerIndex + 6].trimmingCharacters(in: .whitespacesAndNewlines).nonEmpty
        else {
            return nil
        }

        return SourceGapLinkSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            groupLabel: groupLabel,
            filePath: filePath,
            source: "launch-args"
        )
    }

    private func renderPrepManifestPath(projectSlug: String, episodeSlug: String) -> String {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first!
            .appendingPathComponent("QuipslyMac", isDirectory: true)
            .appendingPathComponent("render-prep", isDirectory: true)
            .appendingPathComponent(safeLaunchPathComponent(projectSlug), isDirectory: true)
            .appendingPathComponent(safeLaunchPathComponent(episodeSlug), isDirectory: true)
            .appendingPathComponent("manifest.json")
            .path
    }

    private func safeLaunchPathComponent(_ value: String) -> String {
        let allowed = CharacterSet.alphanumerics.union(CharacterSet(charactersIn: "-_"))
        let scalars = value.unicodeScalars.map { allowed.contains($0) ? Character($0) : "-" }
        let safe = String(scalars).trimmingCharacters(in: CharacterSet(charactersIn: "-_"))
        return safe.isEmpty ? "unknown" : safe
    }

    private func relinkSmokeRequestFromDefaults() -> RelinkSmokeRequest? {
        let defaults = UserDefaults.standard
        guard let requestID = defaults.string(forKey: "quipslyMac.smokeRelinkMissingMediaRequestId")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty
        else {
            return nil
        }

        let resultPath = defaults.string(forKey: "quipslyMac.smokeRelinkMissingMediaResultPath")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty
        let projectSlug = defaults.string(forKey: "quipslyMac.editorProjectSlug")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty ?? appState.editorProjectSlug
        let episodeSlug = defaults.string(forKey: "quipslyMac.editorEpisodeSlug")?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nonEmpty ?? appState.editorEpisodeSlug

        return RelinkSmokeRequest(
            requestID: requestID,
            resultPath: resultPath,
            projectSlug: projectSlug,
            episodeSlug: episodeSlug,
            source: "defaults"
        )
    }
}

private struct RelinkSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct EditOperationSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct TimelineHandleTrimSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct SplitClipSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct TimelineUndoRedoSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct TimelineMoveSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct MotionInspectorSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct PlaybackModeSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct MonitorWallSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct RenderPrepSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var source: String
}

private struct SourceGapLinkSmokeRequest {
    var requestID: String
    var resultPath: String?
    var projectSlug: String
    var episodeSlug: String
    var groupLabel: String
    var filePath: String
    var source: String
}

private extension String {
    var nonEmpty: String? {
        isEmpty ? nil : self
    }
}

private struct LaunchingShellView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.08, green: 0.13, blue: 0.14),
                    Color(red: 0.03, green: 0.05, blue: 0.06)
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 12) {
                ProgressView()
                    .controlSize(.large)
                Text("Opening Quipsly Mac")
                    .font(.title2.weight(.semibold))
                Text("Starting the local editor shell before loading media.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            .padding(32)
        }
        .frame(minWidth: 1280, minHeight: 820)
    }
}
