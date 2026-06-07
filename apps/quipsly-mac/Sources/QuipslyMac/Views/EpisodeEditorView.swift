import SwiftUI

struct EpisodeEditorView: View {
    @EnvironmentObject private var appState: AppState

    private var editorURL: URL? {
        buildEditorURL(
            baseURL: appState.nestURL,
            projectSlug: appState.editorProjectSlug,
            episodeSlug: appState.editorEpisodeSlug
        )
    }

    var body: some View {
        VStack(spacing: 0) {
            header
            Divider()

            if let editorURL {
                QuipslyWebRouteView(
                    url: editorURL,
                    title: "Live Nest editor",
                    subtitle: "Back, forward, reload, and external browser handoff stay native to the Mac shell."
                )
                .overlay(alignment: .bottomLeading) {
                    routeBadge(editorURL)
                }
            } else {
                invalidRoutePanel
            }
        }
        .background(QuipslyBackground())
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
