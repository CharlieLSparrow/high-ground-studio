import SwiftUI

/// Uses the selected Nest and the existing authenticated conversation system.
struct MobileNestChatView: View {
    @StateObject private var client = MobileEpisodeChatClient(scope: .nest)
    let project: MobileCaptureWorkProject
    let tags: [MobileWorkTagLabel]
    let previewOnly: Bool
    var onOpenTask: (String) -> Void
    var onWorkChanged: @MainActor @Sendable () async -> Void

    var body: some View {
        MobileEpisodeChatThread(client: client, target: .nest(project), previewOnly: previewOnly,
            onWorkChanged: onWorkChanged, nestTags: tags, onOpenNestTask: onOpenTask)
            .task(id: project.id) {
                if previewOnly { client.loadPreview(project: project) }
                else {
                    await client.load(project: project)
                    client.startPolling(project: project)
                }
            }
            .onDisappear { client.stopPolling() }
    }
}
