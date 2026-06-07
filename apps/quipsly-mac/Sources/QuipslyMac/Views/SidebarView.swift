import SwiftUI

struct SidebarView: View {
    @EnvironmentObject private var appState: AppState
    @EnvironmentObject private var engine: LocalEngineClient

    var body: some View {
        List(selection: $appState.selectedSection) {
            Section {
                ForEach(appState.visibleSections(capabilities: engine.capabilities)) { section in
                    NavigationLink(value: section) {
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
                        }
                    }
                }
            } header: {
                Text("Quipsly Mac")
            }
        }
        .listStyle(.sidebar)
        .safeAreaInset(edge: .bottom) {
            VStack(alignment: .leading, spacing: 8) {
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
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding()
            .background(.bar)
        }
    }
}
