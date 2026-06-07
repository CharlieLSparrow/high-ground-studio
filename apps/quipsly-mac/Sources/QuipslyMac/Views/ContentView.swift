import SwiftUI

struct ContentView: View {
    @StateObject private var appState = AppState()
    @StateObject private var engine = LocalEngineClient()

    var body: some View {
        NavigationSplitView {
            SidebarView()
                .navigationSplitViewColumnWidth(min: 240, ideal: 280)
        } detail: {
            DetailRouterView()
        }
        .environmentObject(appState)
        .environmentObject(engine)
        .toolbar {
            ToolbarItemGroup(placement: .primaryAction) {
                EngineStatusPill(connectionState: engine.connectionState)

                Button {
                    engine.refreshStatus()
                } label: {
                    Label("Refresh", systemImage: "arrow.clockwise")
                }
            }
        }
        .onAppear {
            engine.connect(to: appState.engineURL)
        }
        .onOpenURL { url in
            Task {
                if await appState.handleNativeSessionCallback(url) {
                    appState.selectedSection = .nestSession
                }
            }
        }
    }
}

private struct DetailRouterView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        switch appState.selectedSection ?? .dashboard {
        case .dashboard:
            DashboardView()
        case .nestSession:
            NestSessionView()
        case .mediaEngine:
            MediaEngineView()
        case .episodeEditor:
            EpisodeEditorView()
        case .episodeCollaboration:
            EpisodeCollaborationView()
        case .premiereDraftEdit:
            PremiereDraftEditView()
        case .visionLab:
            VisionLabView()
        case .localFiles:
            LocalFilesView()
        case .cloudSync:
            CloudSyncView()
        case .nestChat:
            NestChatView()
        case .settings:
            SettingsView()
        }
    }
}

private struct EngineStatusPill: View {
    var connectionState: EngineConnectionState

    var body: some View {
        Label(connectionState.rawValue, systemImage: connectionState.isOnline ? "bolt.horizontal.circle.fill" : "bolt.horizontal.circle")
            .foregroundStyle(connectionState.isOnline ? .green : .secondary)
    }
}
