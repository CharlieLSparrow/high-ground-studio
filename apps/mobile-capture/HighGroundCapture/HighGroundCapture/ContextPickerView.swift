import SwiftUI

struct ContextPickerView: View {
    @StateObject private var contextManager = MobileContextManager.shared
    
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            if contextManager.isLoading {
                ProgressView()
                    .frame(maxWidth: .infinity, alignment: .center)
            } else if let error = contextManager.errorMessage {
                Text(error).foregroundStyle(.red).font(.caption)
            } else if contextManager.workspaces.isEmpty {
                Text("No Workspaces found.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                HStack {
                    Picker("Workspace", selection: $contextManager.selectedWorkspaceId) {
                        ForEach(contextManager.workspaces) { ws in
                            Text(ws.name).tag(ws.id as String?)
                        }
                    }
                    .pickerStyle(.menu)
                    .tint(CapturePalette.accent)
                    
                    if let wsId = contextManager.selectedWorkspaceId,
                       let ws = contextManager.workspaces.first(where: { $0.id == wsId }) {
                        Picker("Project", selection: $contextManager.selectedProjectId) {
                            ForEach(ws.projects) { proj in
                                Text(proj.name).tag(proj.id as String?)
                            }
                        }
                        .pickerStyle(.menu)
                        .tint(.primary)
                        
                        if let projId = contextManager.selectedProjectId,
                           let proj = ws.projects.first(where: { $0.id == projId }) {
                            Picker("Target", selection: $contextManager.selectedEpisodeId) {
                                Text("Project Bin (Loose)").tag(nil as String?)
                                ForEach(proj.episodes) { ep in
                                    Text(ep.title).tag(ep.id as String?)
                                }
                            }
                            .pickerStyle(.menu)
                            .tint(.secondary)
                        }
                    }
                }
            }
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        .task {
            if contextManager.workspaces.isEmpty {
                await contextManager.fetchContext()
            }
        }
    }
}
