import SwiftUI

/// A session lens over canonical work. Presenting it never replaces the call owner.
struct CaptureSessionWorkWorkspace: View {
    let session: MobileCaptureSession
    @ObservedObject var model: CaptureExperienceModel
    @ObservedObject var client: MobileSessionWorkClient
    let onDismiss: () -> Void
    @State private var filter = "ALL"
    @State private var search = ""
    @State private var showsComposer = false
    @State private var showsCompleted = false
    @State private var taskToEdit: MobileCaptureTodayTask?
    @State private var goalToEdit: MobileCaptureTodayGoal?

    private var visibleEntries: [MobileSessionWorkEntry] {
        client.entries.filter {
            (filter == "ALL" || $0.kind == filter) &&
            (search.isEmpty || $0.title.localizedCaseInsensitiveContains(search) || ($0.body ?? "").localizedCaseInsensitiveContains(search))
        }
    }

    var body: some View {
        VStack(spacing: 0) {
            CaptureCallWorkspaceBar(model: model, roomID: session.callRoomId, onReturn: onDismiss)
            NavigationStack {
                List {
                    if let error = client.errorMessage {
                        Section {
                            Text(error).foregroundStyle(CapturePalette.brass)
                            Button("Try again") { Task { await client.load(session: session) } }
                        }
                    }
                    Section {
                        Picker("Show work", selection: $filter) {
                            Text("All").tag("ALL"); Text("Tasks").tag("TASK"); Text("Goals").tag("GOAL")
                        }
                        .pickerStyle(.segmented)
                        .listRowBackground(Color.clear)
                        .accessibilityIdentifier("CaptureSessionWorkFilter")
                    }
                    if client.loading && client.entries.isEmpty {
                        ProgressView("Loading tasks and goals…")
                    } else if visibleEntries.isEmpty {
                        ContentUnavailableView(search.isEmpty ? "No tasks or goals yet" : "No matches",
                            systemImage: "checklist", description: Text(search.isEmpty ? "Add a next step or a goal for this session." : "Try a different search."))
                    }
                    Section {
                        ForEach(visibleEntries.filter { !$0.completed }) { entry in workRow(entry) }
                    }
                    let completed = visibleEntries.filter(\.completed)
                    if !completed.isEmpty {
                        DisclosureGroup("Completed (\(completed.count))", isExpanded: $showsCompleted) {
                            ForEach(completed) { entry in workRow(entry) }
                        }
                    }
                }
                .captureFormSurface()
                .refreshable { await client.load(session: session) }
                .searchable(text: $search, prompt: "Search tasks and goals")
                .navigationTitle("Tasks and goals")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .primaryAction) {
                        if client.canCreate {
                            Button { showsComposer = true } label: { Label("Add task or goal", systemImage: "plus") }
                                .accessibilityIdentifier("CaptureSessionWorkCreate")
                        }
                    }
                    ToolbarItem(placement: .confirmationAction) { Button("Done", action: onDismiss) }
                }
                .accessibilityIdentifier("CaptureSessionWorkWorkspace")
            }
        }
        .task(id: session.callRoomId) {
            await client.load(session: session)
            while !Task.isCancelled {
                do { try await Task.sleep(for: .seconds(15)) } catch { break }
                if !client.saving { await client.load(session: session) }
            }
        }
        .sheet(isPresented: $showsComposer) {
            VStack(spacing: 0) {
                CaptureCallWorkspaceBar(model: model, roomID: session.callRoomId)
                composer
            }
        }
        .sheet(item: $taskToEdit) { task in
            VStack(spacing: 0) {
                CaptureCallWorkspaceBar(model: model, roomID: session.callRoomId)
                CaptureTaskEditSheet(client: model.todayClient, task: task) {
                    Task { await client.load(session: session) }
                }
            }
        }
        .sheet(item: $goalToEdit) { goal in
            VStack(spacing: 0) {
                CaptureCallWorkspaceBar(model: model, roomID: session.callRoomId)
                CaptureGoalEditSheet(client: model.todayClient, goal: goal) {
                    Task { await client.load(session: session) }
                }
            }
        }
    }

    private func workRow(_ entry: MobileSessionWorkEntry) -> some View {
        VStack(alignment: .leading, spacing: 4) {
        Button {
            guard entry.canEdit else { return }
            if entry.kind == "TASK" { taskToEdit = entry.task(roomID: session.callRoomId, title: session.displayTitle) }
            else { goalToEdit = entry.goal(roomID: session.callRoomId, title: session.displayTitle) }
        } label: {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: entry.completed ? "checkmark.circle.fill" : entry.kind == "GOAL" ? "target" : "circle")
                    .foregroundStyle(CapturePalette.accent)
                VStack(alignment: .leading, spacing: 5) {
                    Text(entry.title).font(.body.weight(.semibold)).foregroundStyle(CapturePalette.ink)
                    if let body = entry.body, !body.isEmpty {
                        Text(body).font(.subheadline).foregroundStyle(.secondary).lineLimit(entry.canEdit ? 3 : nil)
                    }
                    Text("\(entry.visibility == "AUTHOR_PRIVATE" ? "Only me" : "Shared") · \(entry.ownerLabel ?? "Session")")
                        .font(.caption).foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                if entry.canEdit { Image(systemName: "chevron.right").font(.caption).foregroundStyle(.secondary) }
            }
            .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            .padding(.vertical, 5)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("CaptureSessionWorkEntry_\(entry.id)")
        if let source = entry.sourceLink, source.roomID == session.callRoomId {
            NavigationLink {
                CaptureTranscriptReviewView(roomID: source.roomID, sessionTitle: session.displayTitle,
                    recording: nil, recordingAssetID: source.recordingAssetID,
                    previewOnly: model.usesPreviewData, focusSourceSeconds: source.sourceSeconds)
            } label: {
                Label("From recording", systemImage: "waveform.and.magnifyingglass").font(.caption).frame(minHeight: 44)
            }
        }
        }
        .listRowBackground(CapturePalette.surface)
    }

    private var composer: some View {
        NavigationStack {
            Form {
                Section {
                    Picker("Type", selection: $client.kind) { Text("Task").tag("TASK"); Text("Goal").tag("GOAL") }
                        .pickerStyle(.segmented)
                    TextField(client.kind == "TASK" ? "Task title" : "Goal title", text: $client.title, axis: .vertical)
                        .accessibilityIdentifier("CaptureSessionWorkTitle")
                    TextField("Details (optional)", text: $client.detail, axis: .vertical).lineLimit(3...8)
                        .accessibilityIdentifier("CaptureSessionWorkDetail")
                }
                .listRowBackground(CapturePalette.surface)
                Section {
                    Toggle("Only me", isOn: $client.onlyMe).accessibilityIdentifier("CaptureSessionWorkPrivate")
                    if let assignment = client.assignment, !client.onlyMe {
                        Picker("Assigned to", selection: $client.ownerUserID) {
                            ForEach(assignment.members) { member in
                                Text(member.id == assignment.currentUserId ? "Me" : member.label).tag(member.id)
                            }
                        }
                    }
                    Toggle(client.kind == "TASK" ? "Set a due date" : "Set a target date", isOn: $client.includesDate)
                    if client.includesDate { DatePicker("Date", selection: $client.targetDate, displayedComponents: [.date]) }
                }
                .listRowBackground(CapturePalette.surface)
                if let error = client.errorMessage { Text(error).foregroundStyle(CapturePalette.brass) }
            }
            .captureFormSurface()
            .navigationTitle(client.kind == "TASK" ? "New task" : "New goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { showsComposer = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.saving ? "Saving…" : "Save") {
                        Task { if await client.create(session: session) { showsComposer = false } }
                    }
                    .disabled(client.saving || !client.canCreate || client.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("CaptureSessionWorkSave")
                }
            }
            .interactiveDismissDisabled(client.saving)
        }
    }
}
