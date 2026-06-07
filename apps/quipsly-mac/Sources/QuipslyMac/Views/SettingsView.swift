import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var engine: LocalEngineClient

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
}
