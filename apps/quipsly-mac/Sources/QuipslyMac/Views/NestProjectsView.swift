import AppKit
import SwiftUI

struct NestProjectsView: View {
    @EnvironmentObject private var appState: AppState
    @State private var activeRoute: ActiveNestRoute = .projects
    @State private var routeNonce = 0

    var body: some View {
        VStack(spacing: 0) {
            nativeHeader
            Divider()
            QuipslyWebRouteView(
                url: activeRoute.url(baseURL: appState.nestURL, projectSlug: appState.editorProjectSlug),
                title: activeRoute.title,
                subtitle: activeRoute.subtitle(for: appState.editorProjectSlug)
            )
            .id("\(activeRoute.id)-\(appState.editorProjectSlug)-\(routeNonce)")
        }
    }

    private var nativeHeader: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Nest Project System")
                        .font(.title2.bold())
                    Text("Pick the working Nest once, then jump to documents, chat, access, admin, episodes, and publishing from the same Mac context.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer()

                VStack(alignment: .trailing, spacing: 4) {
                    Label("Nest owns truth", systemImage: "checkmark.seal")
                        .font(.caption.bold())
                        .foregroundStyle(.green)
                    Text(appState.editorProjectSlug)
                        .font(.caption.monospaced())
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                }
            }

            HStack(spacing: 10) {
                routeButton(.projects)
                routeButton(.access)
                routeButton(.adminUsers)

                Spacer()

                Button {
                    appState.selectedSection = .manuscriptEditor
                } label: {
                    Label("Text Editor", systemImage: "doc.richtext")
                }
                .buttonStyle(.borderedProminent)

                Button {
                    appState.nestChatProjectSlug = appState.editorProjectSlug
                    appState.selectedSection = .nestChat
                } label: {
                    Label("Nest Chat", systemImage: "bubble.left.and.bubble.right")
                }
            }

            LazyVGrid(columns: [GridItem(.adaptive(minimum: 250), spacing: 12)], alignment: .leading, spacing: 12) {
                ForEach(NestProjectPreset.known) { preset in
                    presetCard(preset)
                }

                homeNestCard
            }
        }
        .padding()
        .background(.bar)
    }

    private func routeButton(_ route: ActiveNestRoute) -> some View {
        Button {
            activeRoute = route
            routeNonce += 1
        } label: {
            Label(route.shortTitle, systemImage: route.symbol)
        }
        .buttonStyle(.bordered)
        .tint(activeRoute == route ? .accentColor : .secondary)
    }

    private func presetCard(_ preset: NestProjectPreset) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: preset.symbol)
                    .font(.title3)
                    .foregroundStyle(preset.slug == appState.editorProjectSlug ? .green : .quipslyClayTeal)
                    .frame(width: 28)

                VStack(alignment: .leading, spacing: 3) {
                    Text(preset.title)
                        .font(.headline)
                    Text(preset.subtitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text(preset.slug)
                        .font(.caption2.monospaced())
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.middle)
                        .textSelection(.enabled)
                }
            }

            HStack(spacing: 8) {
                Button(preset.slug == appState.editorProjectSlug ? "Current" : "Make current") {
                    makeCurrent(preset.slug)
                }
                .disabled(preset.slug == appState.editorProjectSlug)

                Button("Write") {
                    makeCurrent(preset.slug)
                    appState.selectedSection = .manuscriptEditor
                }

                Button("Chat") {
                    makeCurrent(preset.slug)
                    appState.selectedSection = .nestChat
                }

                Button("Access") {
                    makeCurrent(preset.slug)
                    activeRoute = .access
                    routeNonce += 1
                }
            }
            .controlSize(.small)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            (preset.slug == appState.editorProjectSlug ? Color.green.opacity(0.10) : Color.secondary.opacity(0.08)),
            in: RoundedRectangle(cornerRadius: 16, style: .continuous)
        )
        .overlay {
            RoundedRectangle(cornerRadius: 16, style: .continuous)
                .stroke(preset.slug == appState.editorProjectSlug ? Color.green.opacity(0.35) : Color.clear, lineWidth: 1)
        }
    }

    private var homeNestCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Home Nest", systemImage: "house")
                .font(.headline)
            Text("Default personal landing spot for uploads and unassigned assets.")
                .font(.caption)
                .foregroundStyle(.secondary)
            Text(appState.homeNestSlug)
                .font(.caption2.monospaced())
                .foregroundStyle(.secondary)
                .lineLimit(1)
                .truncationMode(.middle)
                .textSelection(.enabled)

            HStack(spacing: 8) {
                Button("Make current") {
                    makeCurrent(appState.homeNestSlug)
                }
                Button("Access") {
                    makeCurrent(appState.homeNestSlug)
                    activeRoute = .access
                    routeNonce += 1
                }
            }
            .controlSize(.small)
        }
        .padding(12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func makeCurrent(_ slug: String) {
        let trimmed = slug.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        appState.editorProjectSlug = trimmed
        appState.nestChatProjectSlug = trimmed
        routeNonce += 1
    }
}

private enum ActiveNestRoute: String, Hashable, Identifiable {
    case projects
    case access
    case adminUsers

    var id: String { rawValue }

    var title: String {
        switch self {
        case .projects: "The Nest"
        case .access: "Nest Access"
        case .adminUsers: "User + Invite Console"
        }
    }

    var shortTitle: String {
        switch self {
        case .projects: "Projects"
        case .access: "Access"
        case .adminUsers: "Users"
        }
    }

    var symbol: String {
        switch self {
        case .projects: "square.grid.2x2"
        case .access: "person.2.badge.gearshape"
        case .adminUsers: "person.crop.circle.badge.plus"
        }
    }

    func subtitle(for projectSlug: String) -> String {
        switch self {
        case .projects:
            "Open assigned Nests, documents, assets, publishing, and collaboration workflows."
        case .access:
            "Review collaborators and role access for \(projectSlug)."
        case .adminUsers:
            "Invite beta testers and grant Nest access from the admin console."
        }
    }

    func url(baseURL: String, projectSlug: String) -> URL {
        switch self {
        case .projects:
            NestRouteBuilder.projects(baseURL: baseURL)
        case .access:
            NestRouteBuilder.nestAccess(baseURL: baseURL, projectSlug: projectSlug)
        case .adminUsers:
            NestRouteBuilder.adminUsers(baseURL: baseURL)
        }
    }
}
