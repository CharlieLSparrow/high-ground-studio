import AppKit
import SwiftUI

struct EpisodeEditorView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var localEditStore: LocalEpisodeEditStore

    private var editorURL: URL? {
        buildEditorURL(
            baseURL: appState.nestURL,
            projectSlug: appState.editorProjectSlug,
            episodeSlug: appState.editorEpisodeSlug
        )
    }

    private var activeLocalSession: LocalEpisodeEditSession? {
        localEditStore.session(
            projectSlug: appState.editorProjectSlug,
            episodeSlug: appState.editorEpisodeSlug
        )
    }

    @StateObject private var sessionContext = EditorSessionContext()
    @StateObject private var playbackContext = EditorPlaybackContext()

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()

            GeometryReader { geo in
                VStack(spacing: 0) {
                    // Monitor View (Top Half)
                    NativeMonitorView(sessionContext: sessionContext, playbackContext: playbackContext)
                        .frame(height: geo.size.height * 0.5)
                        .clipped()
                    
                    Divider()
                    
                    // Transport Controls
                    NativeTransportControls(playbackContext: playbackContext)
                        .padding(.vertical, 8)
                        .padding(.horizontal)
                        .background(Color(NSColor.controlBackgroundColor))
                    
                    Divider()
                    
                    // Timeline View (Bottom Half)
                    NativeTimelineView(sessionContext: sessionContext, playbackContext: playbackContext)
                        .frame(maxHeight: .infinity)
                }
            }
        }
        .background(QuipslyBackground())
        // Sync the context when active session changes
        .onChange(of: activeLocalSession) { _, newSession in
            sessionContext.refresh(with: newSession)
        }
        .onAppear {
            sessionContext.refresh(with: activeLocalSession)
        }
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Episode Editor")
                        .font(.largeTitle.bold())
                    Text("Native Mac shell, live Nest timeline. The browser editor stays the source of truth while the Mac app grows local media muscle.")
                        .foregroundStyle(.secondary)
                }

                Spacer()

                if let editorURL {
                    Link(destination: editorURL) {
                        Label("Open in Browser", systemImage: "safari")
                    }
                }
            }

            HStack(spacing: 12) {
                LabeledContent("Project") {
                    TextField("project slug", text: $appState.editorProjectSlug)
                        .textFieldStyle(.roundedBorder)
                        .frame(minWidth: 260)
                }

                LabeledContent("Episode") {
                    TextField("episode slug", text: $appState.editorEpisodeSlug)
                        .textFieldStyle(.roundedBorder)
                        .frame(minWidth: 180)
                }
            }
        }
        .padding()
        .background(.bar)
    }

    private var sessionPreflight: some View {
        HStack(alignment: .center, spacing: 12) {
            Image(systemName: hasConnectedNestProfile ? "checkmark.seal.fill" : "person.crop.circle.badge.exclamationmark")
                .font(.title2)
                .foregroundStyle(hasConnectedNestProfile ? .green : .orange)

            VStack(alignment: .leading, spacing: 3) {
                Text(hasConnectedNestProfile ? "Nest session ready" : "Nest session required")
                    .font(.headline)
                Text(sessionPreflightText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .textSelection(.enabled)
            }

            Spacer()

            Button {
                appState.selectedSection = .nestSession
            } label: {
                Label(hasConnectedNestProfile ? "Session details" : "Open Nest Session", systemImage: "person.badge.key")
            }

            if !hasConnectedNestProfile {
                Button {
                    let state = appState.beginNestNativeAuthState()
                    let deviceLabel = Host.current().localizedName ?? "Quipsly Mac"
                    NSWorkspace.shared.open(
                        NestSessionActions.nativeHandoffURL(
                            nestBaseURL: appState.nestURL,
                            state: state,
                            deviceLabel: deviceLabel
                        )
                    )
                    appState.selectedSection = .nestSession
                    appState.lastMacCallbackDiagnosticLabel = "Browser sign-in opened from Episode Editor. Approve Open Quipsly Mac if macOS asks."
                } label: {
                    Label("Sign in with browser", systemImage: "safari")
                }
                .buttonStyle(.borderedProminent)
            }
        }
        .padding(.horizontal)
        .padding(.vertical, 10)
        .background(hasConnectedNestProfile ? Color.green.opacity(0.09) : Color.orange.opacity(0.12))
    }

    private var hasConnectedNestProfile: Bool {
        !appState.activeNestSessionProfileEmail.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && !appState.nestSessionToken.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var sessionPreflightText: String {
        if hasConnectedNestProfile {
            return "Using \(appState.activeNestSessionProfileEmail). The embedded editor will request a short-lived Nest web session before loading this episode."
        }

        return "Connect once in Nest Session. After that, native chat, imports, sync prep, and the embedded editor can all reuse the same Mac profile."
    }

    private var invalidRoutePanel: some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 44))
                .foregroundStyle(.orange)
            Text("The Nest editor route is not valid yet.")
                .font(.title2.bold())
            Text("Check the Nest URL, project slug, and episode slug in this panel or Settings.")
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .padding()
    }

    private func routeBadge(_ url: URL) -> some View {
        Text(url.absoluteString)
            .font(.system(.caption2, design: .monospaced))
            .lineLimit(1)
            .truncationMode(.middle)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .background(.regularMaterial, in: Capsule())
            .padding(12)
    }
}

private func buildEditorURL(baseURL: String, projectSlug: String, episodeSlug: String) -> URL? {
    let trimmedBase = baseURL.trimmingCharacters(in: .whitespacesAndNewlines)
    let safeProject = projectSlug.trimmingCharacters(in: .whitespacesAndNewlines)
    let safeEpisode = episodeSlug.trimmingCharacters(in: .whitespacesAndNewlines)

    guard !safeProject.isEmpty, !safeEpisode.isEmpty, var components = URLComponents(string: trimmedBase) else {
        return nil
    }

    components.path = "/editor"
    components.queryItems = [
        URLQueryItem(name: "project", value: safeProject),
        URLQueryItem(name: "episode", value: safeEpisode),
    ]

    return components.url
}
