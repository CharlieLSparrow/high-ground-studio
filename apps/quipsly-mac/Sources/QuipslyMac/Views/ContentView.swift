import SwiftUI

private struct IsShortsModeKey: EnvironmentKey {
    static let defaultValue: Bool = false
}

extension EnvironmentValues {
    var isShortsMode: Bool {
        get { self[IsShortsModeKey.self] }
        set { self[IsShortsModeKey.self] = newValue }
    }
}

struct ContentView: View {
    @ObservedObject private var appState: AppState
    @ObservedObject private var engine: LocalEngineClient
    @ObservedObject private var mediaAccess: MediaAccessStore
    @StateObject private var localEditStore = LocalEpisodeEditStore()
    
    var isShortsMode: Bool

    @MainActor
    init(isShortsMode: Bool = false) {
        _appState = ObservedObject(wrappedValue: AppState())
        _engine = ObservedObject(wrappedValue: LocalEngineClient())
        _mediaAccess = ObservedObject(wrappedValue: MediaAccessStore())
        self.isShortsMode = isShortsMode
    }

    @MainActor
    init(appState: AppState, engine: LocalEngineClient, mediaAccess: MediaAccessStore, isShortsMode: Bool = false) {
        _appState = ObservedObject(wrappedValue: appState)
        _engine = ObservedObject(wrappedValue: engine)
        _mediaAccess = ObservedObject(wrappedValue: mediaAccess)
        self.isShortsMode = isShortsMode
    }

    var body: some View {
        NavigationSplitView {
            MacShellSidebar()
                .navigationSplitViewColumnWidth(min: 240, ideal: 286, max: 340)
        } detail: {
            DetailRouterView()
                .frame(maxWidth: .infinity, maxHeight: .infinity)
                .padding(.leading, 80)
        }
        .navigationSplitViewStyle(.balanced)
        .environmentObject(appState)
        .environmentObject(engine)
        .environmentObject(mediaAccess)
        .environmentObject(localEditStore)
        .environment(\.isShortsMode, isShortsMode)
        .toolbar {
            ToolbarItem(placement: .navigation) {
                QuipslyBrandMark(compact: true)
            }

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
            mediaAccess.restoreAccessIfNeeded()
            engine.connect(to: appState.engineURL)
        }
    }
}

private struct MacShellSidebar: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var engine: LocalEngineClient

    var body: some View {
        List(selection: $appState.selectedSection) {
            Section {
                ForEach(appState.visibleSections(capabilities: engine.capabilities)) { section in
                    Label {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(section.title)
                                .font(.headline)
                            Text(section.subtitle)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    } icon: {
                        Image(systemName: section.symbol)
                            .symbolRenderingMode(.hierarchical)
                    }
                    .tag(section)
                    .listRowInsets(EdgeInsets(top: 6, leading: 18, bottom: 6, trailing: 12))
                }
            } header: {
                QuipslyBrandMark(compact: false)
                    .padding(.leading, 18)
                    .padding(.top, 8)
                    .padding(.bottom, 12)
            }
        }
        .listStyle(.sidebar)
        .navigationTitle("Quipsly")
        .onAppear {
            if appState.selectedSection == nil {
                appState.selectedSection = .episodeEditor
            }
        }
        .safeAreaInset(edge: .bottom) {
            VStack(alignment: .leading, spacing: 8) {
                NestSessionInlineStatusView(
                    context: "Native tools",
                    compact: true
                )

                Divider()

                Text("Local engine")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                Text(engine.connectionState.rawValue)
                    .font(.headline)
                if let messageAt = engine.lastMessageAt {
                    Text("Last message \(messageAt.formatted(date: .omitted, time: .standard))")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Text(engine.launchStatus)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(.vertical, 14)
            .padding(.leading, 18)
            .padding(.trailing, 14)
            .background(.bar)
        }
    }

}

private struct QuipslyBrandMark: View {
    var compact: Bool

    var body: some View {
        HStack(spacing: compact ? 8 : 10) {
            ZStack {
                RoundedRectangle(cornerRadius: compact ? 8 : 12, style: .continuous)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.quipslyClayTeal.opacity(0.90),
                                Color.quipslyBurntOrange.opacity(0.75)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                Image(systemName: "sparkles.rectangle.stack.fill")
                    .font(.system(size: compact ? 13 : 20, weight: .bold))
                    .foregroundStyle(.white)
                    .shadow(radius: 1)
            }
            .frame(width: compact ? 24 : 38, height: compact ? 24 : 38)

            VStack(alignment: .leading, spacing: compact ? 0 : 2) {
                Text("Quipsly")
                    .font(compact ? .headline : .title3.bold())
                if !compact {
                    Text("Local Creator Studio")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .accessibilityLabel("Quipsly Local Creator Studio")
    }
}

private struct DetailRouterView: View {
    @EnvironmentObject private var appState: AppState

    var body: some View {
        switch appState.selectedSection ?? .episodeEditor {
        case .dashboard:
            DashboardView()
        case .assumptions:
            ProductAssumptionsView()
        case .nestProjects:
            NestProjectsView()
        case .manuscriptEditor:
            ManuscriptEditorNestView()
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
