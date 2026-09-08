import SwiftUI

enum MobileConversationWorkAction: Identifiable {
    case create(NestChatMessage)
    case edit(NestChatLinkedTask)

    var id: String {
        switch self {
        case let .create(message): "create:\(message.id)"
        case let .edit(task): "edit:\(task.id)"
        }
    }
}

/// Conversation is the source, not another task store or editor.
struct CaptureConversationWorkEditor: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var client: MobileCoachingEngagementWorkspaceClient
    let message: NestChatMessage
    let previewOnly: Bool

    init(engagementID: String, message: NestChatMessage, previewOnly: Bool = false) {
        self.message = message
        self.previewOnly = previewOnly
        _client = StateObject(wrappedValue: MobileCoachingEngagementWorkspaceClient(engagementID: engagementID))
    }

    var body: some View {
        Group {
            if let workspace = client.workspace, workspace.canWrite {
                MobileCoachingWorkEditorSheet(client: client, workspace: workspace, entry: nil,
                    preferredKind: "TASK", previewOnly: previewOnly, sourceMessage: message)
            } else {
                NavigationStack {
                    Group {
                        if client.isLoading { ProgressView("Opening task…") }
                        else {
                            ContentUnavailableView {
                                Label("Task unavailable", systemImage: "checkmark.circle")
                            } description: {
                                Text(client.errorMessage ?? "You can't add tasks in this space right now.")
                            } actions: {
                                Button("Try again") { Task { await client.load(force: true) } }
                            }
                        }
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(CapturePalette.canvas)
                    .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
                }
            }
        }
        .task {
            if previewOnly { client.loadPreview() }
            else { await client.load() }
        }
    }
}
