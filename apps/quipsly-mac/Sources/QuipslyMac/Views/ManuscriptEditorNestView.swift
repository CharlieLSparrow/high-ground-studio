import SwiftUI

struct ManuscriptEditorNestView: View {
    @EnvironmentObject private var appState: AppState
    @State private var draftProjectSlug = ""
    @State private var routeNonce = 0

    var body: some View {
        VStack(spacing: 0) {
            nativeHeader
            Divider()
            QuipslyWebRouteView(
                url: currentEditorURL,
                title: "Text Editor",
                subtitle: "The living writing and study document editor, running inside Quipsly Mac."
            )
            .id("\(appState.editorProjectSlug)-\(routeNonce)")
        }
        .onAppear {
            if draftProjectSlug.isEmpty {
                draftProjectSlug = appState.editorProjectSlug
            }
        }
    }

    private var currentEditorURL: URL {
        NestRouteBuilder.create(
            baseURL: appState.nestURL,
            projectSlug: appState.editorProjectSlug,
            publisher: true
        )
    }

    private var nativeHeader: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Writing + Study Documents")
                        .font(.title2.bold())
                    Text("Use the existing Nest editor as the source of truth, with Mac-native routing around it. One living document, many views.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Label("One living document", systemImage: "doc.text.magnifyingglass")
                        .font(.caption.bold())
                        .foregroundStyle(.quipslyClayTeal)
                    Text(appState.editorProjectSlug)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                }
            }

            HStack(alignment: .bottom, spacing: 10) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Project / Nest slug")
                        .font(.caption.bold())
                    TextField("high-ground-odyssey-manuscript", text: $draftProjectSlug)
                        .textFieldStyle(.roundedBorder)
                        .frame(minWidth: 320)
                }

                Button {
                    openDraftProject()
                } label: {
                    Label("Open in editor", systemImage: "arrow.right.circle.fill")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    appState.selectedSection = .nestProjects
                } label: {
                    Label("Browse Nests", systemImage: "square.grid.2x2")
                }

                Button {
                    appState.nestChatProjectSlug = appState.editorProjectSlug
                    appState.selectedSection = .nestChat
                } label: {
                    Label("Chat", systemImage: "bubble.left.and.bubble.right")
                }

                Button {
                    appState.selectedSection = .episodeEditor
                } label: {
                    Label("Episode", systemImage: "timeline.selection")
                }

                Spacer()
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(NestProjectPreset.known) { preset in
                        Button {
                            draftProjectSlug = preset.slug
                            openDraftProject()
                        } label: {
                            Label(preset.title, systemImage: preset.symbol)
                        }
                        .buttonStyle(.bordered)
                        .tint(preset.slug == appState.editorProjectSlug ? .accentColor : .secondary)
                    }
                }
                .padding(.vertical, 1)
            }

            HStack(spacing: 10) {
                principlePill("Write", "Original content and manuscripts")
                principlePill("Study", "Imported sources with notes and tags")
                principlePill("Publish", "Episode pages and outputs connect back")
            }
        }
        .padding()
        .background(.bar)
    }

    private func openDraftProject() {
        let trimmed = draftProjectSlug.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        appState.editorProjectSlug = trimmed
        appState.nestChatProjectSlug = trimmed
        routeNonce += 1
    }

    private func principlePill(_ title: String, _ detail: String) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(title)
                .font(.caption.bold())
            Text(detail)
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.thinMaterial, in: Capsule())
    }
}
