import AppKit
import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var engine: LocalEngineClient
    @EnvironmentObject private var mediaAccess: MediaAccessStore

    var body: some View {
        Form {
            Section("Connections") {
                TextField("Local engine URL", text: $appState.engineURL)
                TextField("Nest base URL", text: $appState.nestURL)
                TextField("Default project slug", text: $appState.editorProjectSlug)
                TextField("Default episode slug", text: $appState.editorEpisodeSlug)
                TextField("Home Nest slug", text: $appState.homeNestSlug)
                TextField("Default Nest chat project", text: $appState.nestChatProjectSlug)

                Button("Reconnect local engine") {
                    engine.connect(to: appState.engineURL)
                }
            }

            Section("Current editor route") {
                LabeledContent("Project") {
                    Text(appState.editorProjectSlug)
                        .textSelection(.enabled)
                }
                LabeledContent("Episode") {
                    Text(appState.editorEpisodeSlug)
                        .textSelection(.enabled)
                }
                LabeledContent("Home Nest") {
                    Text(appState.homeNestSlug)
                        .textSelection(.enabled)
                }
            }

            Section("Mac media permissions") {
                LabeledContent("Durable media roots") {
                    Text("\(mediaAccess.activeRootCount) active · \(mediaAccess.needsAttentionCount) need attention")
                }
                Text(mediaAccess.lastMessage)
                    .foregroundStyle(.secondary)

                HStack {
                    Button("Restore folder access") {
                        mediaAccess.restoreAccessIfNeeded()
                    }
                    Button("Open Local Files") {
                        appState.selectedSection = .localFiles
                    }
                    Button("Open Full Disk Access") {
                        mediaAccess.openFullDiskAccessSettings()
                    }
                    Button("Test Full Disk Access") {
                        mediaAccess.testFullDiskAccessProbe()
                    }
                }

                Text("Quipsly uses saved security-scoped bookmarks for user-approved media roots. Full Disk Access is optional broad rescue mode and must be granted by the user in macOS Privacy settings.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Media workspace") {
                LabeledContent("Workspace") {
                    Text(appState.mediaWorkspacePath)
                        .textSelection(.enabled)
                }
                LabeledContent("Available") {
                    Text(QuipslyMediaWorkspace.availableLabel(at: appState.mediaWorkspaceURL))
                }
                LabeledContent("Playback cache") {
                    Text(QuipslyMediaWorkspace.playbackCacheRootURL(rootPath: appState.mediaWorkspacePath).path)
                        .textSelection(.enabled)
                }
                LabeledContent("Proxy cache") {
                    Text(QuipslyMediaWorkspace.proxyCacheRootURL(rootPath: appState.mediaWorkspacePath).path)
                        .textSelection(.enabled)
                }
                LabeledContent("Source originals") {
                    Text(QuipslyMediaWorkspace.sourceOriginalsRootURL(rootPath: appState.mediaWorkspacePath).path)
                        .textSelection(.enabled)
                }
                LabeledContent("Render output") {
                    Text(QuipslyMediaWorkspace.renderOutputRootURL(rootPath: appState.mediaWorkspacePath).path)
                        .textSelection(.enabled)
                }

                HStack {
                    Button("Choose workspace") {
                        chooseMediaWorkspace()
                    }
                    Button("Use My Passport") {
                        usePreferredExternalWorkspace()
                    }
                    .disabled(!QuipslyMediaWorkspace.preferredExternalRootIsAvailable)
                    Button("Reveal workspace") {
                        revealMediaWorkspace()
                    }
                    Button("Reset to default") {
                        appState.resetMediaWorkspacePath()
                    }
                }

                Text("This is where Quipsly Mac should put heavy local bytes. Source originals can be huge and belong on durable storage. Proxy cache should stay lightweight and is what the editor should use for everyday playback. Nest still owns project truth; the workspace owns local media bytes.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }

            Section("Modules") {
                Toggle("Show experimental modules", isOn: $appState.showExperimentalModules)
                LabeledContent("Vision Lab") {
                    Text(engine.capabilities.visionLab ? "Enabled" : "Hidden unless experimental")
                }
                LabeledContent("ML Training") {
                    Text(engine.capabilities.mlTraining ? "Enabled" : "Gated")
                }
            }
        }
        .formStyle(.grouped)
        .padding()
    }

    private func chooseMediaWorkspace() {
        let panel = NSOpenPanel()
        panel.title = "Choose Quipsly media workspace"
        panel.message = "Pick a durable local folder or external drive for originals, proxies, thumbnails, and renders."
        panel.canChooseFiles = false
        panel.canChooseDirectories = true
        panel.canCreateDirectories = true
        panel.allowsMultipleSelection = false
        panel.directoryURL = appState.mediaWorkspaceURL

        if panel.runModal() == .OK, let url = panel.url {
            appState.mediaWorkspacePath = url.path
        }
    }

    private func usePreferredExternalWorkspace() {
        do {
            let url = QuipslyMediaWorkspace.preferredExternalRootURL
            try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            appState.mediaWorkspacePath = url.path
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } catch {
            NSSound.beep()
        }
    }

    private func revealMediaWorkspace() {
        do {
            let url = try QuipslyMediaWorkspace.ensureRoot(rootPath: appState.mediaWorkspacePath)
            NSWorkspace.shared.activateFileViewerSelecting([url])
        } catch {
            NSWorkspace.shared.open(appState.mediaWorkspaceURL.deletingLastPathComponent())
        }
    }
}
