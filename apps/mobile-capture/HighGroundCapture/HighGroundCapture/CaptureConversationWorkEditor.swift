import SwiftUI

struct CaptureNestConversationTaskEditor: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var client: MobileEpisodeChatClient
    let project: MobileCaptureWorkProject
    let message: NestChatMessage
    let tags: [MobileWorkTagLabel]
    let previewOnly: Bool
    @State private var title: String
    @State private var selection = CaptureTaskTagSelection()
    @State private var pending: NestConversationTaskCommand?
    @State private var isSaving = false
    @State private var error: String?

    init(client: MobileEpisodeChatClient, project: MobileCaptureWorkProject, message: NestChatMessage,
         tags: [MobileWorkTagLabel], previewOnly: Bool) {
        self.client = client
        self.project = project
        self.message = message
        self.tags = tags
        self.previewOnly = previewOnly
        _title = State(initialValue: message.suggestedTaskTitle)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Task title", text: $title, axis: .vertical)
                        .accessibilityIdentifier("CaptureNestConversationTaskTitle")
                    NavigationLink {
                        CaptureTaskTagPicker(tags: tags, selection: $selection, allowsNewTags: false)
                    } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            Text("Tags")
                            CaptureWorkTags(tags: tags.filter { selection.tagIDs.contains($0.id) }, workID: "conversation-draft")
                        }
                    }
                    .accessibilityIdentifier("CaptureNestConversationTaskTags")
                } footer: {
                    Text("Shared in \(project.name) and linked to this message.")
                }
                if let error { Section { Text(error).foregroundStyle(CapturePalette.brass) } }
            }
            .disabled(isSaving)
            .captureFormSurface()
            .navigationTitle("New task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() }.disabled(isSaving) }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Adding…" : "Add task") {
                        let command = NestConversationTaskCommand(projectSlug: project.slug, messageID: message.id,
                            title: title, tagIDs: selection.tagIDs, previous: pending)
                        pending = command
                        isSaving = true
                        error = nil
                        Task {
                            let saved = await client.createTask(command, project: project)
                            isSaving = false
                            if saved != nil { dismiss() }
                            else { error = client.errorMessage ?? "Your task couldn't save. Your draft is still here; try again." }
                        }
                    }
                    .disabled(previewOnly || isSaving || !client.canEdit || !selection.isValid
                        || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || title.utf16.count > 500)
                    .accessibilityIdentifier("CaptureNestConversationTaskSave")
                }
            }
        }
        .interactiveDismissDisabled(isSaving)
        .accessibilityIdentifier("CaptureNestConversationTaskEditor")
    }
}

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
