import AVFoundation
import AVKit
import SwiftUI
import UIKit

struct CapturePhoneShell: View {
    @EnvironmentObject private var audioCapture: AudioCaptureController
    @EnvironmentObject private var videoCapture: VideoCaptureController
    @StateObject private var model = CaptureExperienceModel()
    @State private var showsNewSession = false
    @State private var visibleTab: CaptureRootTab

    init() {
        _visibleTab = State(initialValue: CaptureLaunchConfiguration.previewTab ?? .today)
    }

    var body: some View {
        TabView(selection: $visibleTab) {
            NavigationStack {
                CaptureTodayView(
                    model: model,
                    showsNewSession: $showsNewSession,
                    visibleTab: $visibleTab
                )
            }
            .tabItem { Label(CaptureRootTab.today.title, systemImage: CaptureRootTab.today.systemImage) }
            .tag(CaptureRootTab.today)

            NavigationStack {
                CaptureRecorderView(model: model)
            }
            .tabItem { Label(CaptureRootTab.record.title, systemImage: CaptureRootTab.record.systemImage) }
            .tag(CaptureRootTab.record)

            NavigationStack {
                CaptureWorkView(model: model)
            }
            .tabItem { Label(CaptureRootTab.work.title, systemImage: CaptureRootTab.work.systemImage) }
            .tag(CaptureRootTab.work)

            NavigationStack {
                CaptureLibraryView(model: model, visibleTab: $visibleTab)
            }
            .tabItem { Label(CaptureRootTab.library.title, systemImage: CaptureRootTab.library.systemImage) }
            .tag(CaptureRootTab.library)

            NavigationStack {
                CaptureAccountView(model: model, visibleTab: $visibleTab)
            }
            .tabItem { Label(CaptureRootTab.account.title, systemImage: CaptureRootTab.account.systemImage) }
            .tag(CaptureRootTab.account)
        }
        .tint(CapturePalette.accent)
        .safeAreaInset(edge: .top, spacing: 0) {
            if model.activeCoordinatedCaptureGroupID != nil,
               audioCaptureIsActive || videoCaptureIsActive {
                GlobalCaptureBanner(
                    title: coordinatedCaptureBannerTitle,
                    duration: max(
                        audioCapture.currentDuration,
                        videoCapture.durationSeconds
                    ),
                    tint: coordinatedCaptureIsPaused ? .orange : .red,
                    isPulsing:
                        audioCapture.captureState == .recording
                        && videoCapture.state == .recording,
                    action: { visibleTab = .record }
                )
            } else if audioCaptureIsActive {
                GlobalCaptureBanner(
                    title: audioCapture.captureState == .paused
                        ? "Audio paused"
                        : audioCapture.captureState == .finalizing
                            ? "Saving audio"
                            : "Recording audio",
                    duration: audioCapture.currentDuration,
                    tint: audioCapture.captureState == .paused ? .orange : .red,
                    isPulsing: audioCapture.captureState == .recording,
                    action: { visibleTab = .record }
                )
            } else if videoCaptureIsActive {
                GlobalCaptureBanner(
                    title: videoCapture.state == .paused
                        ? "Camera paused"
                        : videoCapture.state == .finalizing
                            ? "Saving video"
                            : "Recording video",
                    duration: videoCapture.durationSeconds,
                    tint: videoCapture.state == .paused ? .orange : .red,
                    isPulsing: videoCapture.state == .recording,
                    action: { visibleTab = .record }
                )
            }
        }
        .sheet(isPresented: $showsNewSession) {
            NewCaptureSessionSheet(
                model: model,
                isPresented: $showsNewSession,
                onCreated: {
                    showsNewSession = false
                    visibleTab = .record
                }
            )
                .presentationDetents([.medium, .large])
        }
        .alert("Capture needs attention", isPresented: errorIsPresented) {
            Button("OK") { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "Try again.")
        }
        .onAppear {
            // SwiftUI can initially mount the first tab before applying a
            // non-default State value on iOS 26. Reapply the DEBUG-only launch
            // route after the TabView exists so deterministic UI journeys open
            // the requested shipping surface rather than a hidden tab subtree.
            if let requestedTab = CaptureLaunchConfiguration.previewTab {
                visibleTab = requestedTab
            }
        }
        .task {
            await model.load()
        }
        .onChange(of: audioCapture.captureState) { _, state in
            model.reconcileCaptureState(state)
        }
        .onChange(of: videoCapture.state) { _, state in
            model.reconcileVideoCaptureState(state, using: videoCapture)
        }
    }

    private var audioCaptureIsActive: Bool {
        switch audioCapture.captureState {
        case .recording, .paused, .finalizing:
            true
        default:
            false
        }
    }

    private var videoCaptureIsActive: Bool {
        videoCapture.state.isActive || videoCapture.state == .paused
    }

    private var coordinatedCaptureIsPaused: Bool {
        audioCapture.captureState == .paused
            || videoCapture.state == .paused
    }

    private var coordinatedCaptureBannerTitle: String {
        if audioCapture.captureState == .finalizing
            || videoCapture.state == .finalizing {
            return "Saving podcast sources"
        }
        if audioCapture.captureState == .paused
            && videoCapture.state == .paused {
            return "Podcast sources paused"
        }
        if audioCapture.captureState == .recording
            && videoCapture.state == .recording {
            return "Recording audio + video"
        }
        return "Preparing podcast sources"
    }

    private var errorIsPresented: Binding<Bool> {
        Binding(
            get: { model.errorMessage != nil },
            set: { if !$0 { model.errorMessage = nil } }
        )
    }
}

private struct CaptureTodayView: View {
    @ObservedObject var model: CaptureExperienceModel
    @Binding var showsNewSession: Bool
    @Binding var visibleTab: CaptureRootTab
    @StateObject private var library = LocalRecordingLibrary.shared
    @StateObject private var auth = AuthManager.shared

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                todayHeader

                if model.usesPreviewData {
                    Label("Preview data — no server actions", systemImage: "hammer.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 8)
                        .background(.orange.opacity(0.12), in: Capsule())
                        .accessibilityIdentifier("CapturePreviewModeBadge")
                }

                if let next = model.nextSession {
                    NextCaptureCard(session: next) {
                        model.select(next)
                        visibleTab = .record
                    }
                    .disabled(model.isSessionContextLocked && model.selectedSession?.id != next.id)
                } else if model.isRefreshing {
                    CaptureLoadingCard(label: "Loading your sessions…")
                } else {
                    CaptureEmptyCard(
                        systemImage: "calendar.badge.plus",
                        title: "Nothing scheduled yet",
                        detail: "Create a session now. Recording will still wait for explicit consent.",
                        actionTitle: "New session",
                        action: { showsNewSession = true }
                    )
                    .disabled(model.isSessionContextLocked)
                }

                TodayFollowThroughCard(
                    client: model.todayClient,
                    inboxClient: model.sourceInboxClient,
                    previewOnly: model.usesPreviewData
                )

                if model.uploadManager.recoverableUploadCount > 0 {
                    CaptureAttentionCard(
                        systemImage: "icloud.and.arrow.up",
                        title: "Saved locally",
                        detail: "\(model.uploadManager.recoverableUploadCount) recording\(model.uploadManager.recoverableUploadCount == 1 ? " is" : "s are") waiting to upload. The originals remain on this iPhone.",
                        buttonTitle: "Open Library"
                    ) {
                        visibleTab = .library
                    }
                }

                LocalSafetySummary(
                    recordingCount: library.recordings.count,
                    pendingCount: library.recordings.filter { !$0.status.isVerified }.count
                )

                if !laterSessions.isEmpty {
                    VStack(alignment: .leading, spacing: 10) {
                        HStack {
                            Text("Later")
                                .font(.title3.weight(.bold))
                            Spacer()
                            Button {
                                showsNewSession = true
                            } label: {
                                Label("New session", systemImage: "plus")
                            }
                            .buttonStyle(.bordered)
                            .disabled(model.isSessionContextLocked)
                        }

                        ForEach(laterSessions) { session in
                            SessionListRow(session: session, isSelected: session.id == model.selectedSession?.id) {
                                model.select(session)
                                visibleTab = .record
                            }
                            .disabled(model.isSessionContextLocked && model.selectedSession?.id != session.id)
                        }
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 96)
        }
        .background(CaptureCanvas())
        .navigationTitle("Quipsly Capture")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable { await model.load() }
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button {
                    showsNewSession = true
                } label: {
                    Image(systemName: "plus")
                }
                .disabled(model.isSessionContextLocked)
                .accessibilityLabel("New session")

                Button {
                    Task { await model.load() }
                } label: {
                    if model.isRefreshing {
                        ProgressView()
                    } else {
                        Image(systemName: "arrow.clockwise")
                    }
                }
                .accessibilityLabel("Refresh sessions")
            }
        }
        .accessibilityIdentifier("CaptureTodayView")
    }

    private var todayHeader: some View {
        VStack(alignment: .leading, spacing: 5) {
            Text("Today")
                .font(.largeTitle.weight(.bold))
                .minimumScaleFactor(0.8)
            Text("\(greeting) · \(Date.now.formatted(.dateTime.weekday(.wide).month(.wide).day()))")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .padding(.top, 10)
    }

    private var laterSessions: [MobileCaptureSession] {
        guard let nextSessionID = model.nextSession?.id else { return model.sessions }
        return model.sessions.filter { $0.id != nextSessionID }
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        let salutation = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening"
        let firstName = auth.userName?
            .split(separator: " ")
            .first
            .map(String.init)
        return firstName.map { "\(salutation), \($0)" } ?? salutation
    }
}

private struct CaptureWorkView: View {
    @ObservedObject var model: CaptureExperienceModel
    @ObservedObject private var client: CaptureWorkClient
    @State private var selectedProjectID: String?
    @State private var searchText = ""
    @FocusState private var searchIsFocused: Bool
    @State private var selectedTagID: String?
    @State private var showsCompletedTasks = false
    @State private var showsTagVocabulary = false
    @State private var quickEntryKind: MobileQuickEntryKind?
    @State private var showsNewProject = false
    @State private var taskToEdit: MobileCaptureTodayTask?
    @State private var recurrenceToEdit: MobileCaptureTodayTask?
    @State private var goalToEdit: MobileCaptureTodayGoal?
    @State private var taskTagsToEdit: MobileCaptureTodayTask?
    @State private var goalTagsToEdit: MobileCaptureTodayGoal?
    @State private var noteTagsToEdit: MobileCaptureWorkNote?
    @State private var noteToEdit: MobileCaptureWorkNote?

    init(model: CaptureExperienceModel) {
        self.model = model
        client = model.workClient
    }

    private var workspace: MobileCaptureWorkWorkspace? {
        client.workspace
    }

    private var selectedProject: MobileCaptureWorkProject? {
        client.projects.first { $0.id == (selectedProjectID ?? client.selectedProjectID) }
            ?? workspace?.project
    }

    private var captureDestination: MobileCaptureProjectDestination? {
        guard let selectedProject,
              workspace?.project.id == selectedProject.id else { return nil }
        return MobileCaptureProjectDestination(
            id: selectedProject.id,
            slug: selectedProject.slug,
            name: selectedProject.name,
            role: selectedProject.role,
            isHomeNest: selectedProject.isHomeNest,
            availableTags: (workspace?.tags ?? [])
                .filter(\.isActive)
                .map {
                    MobileCaptureTag(
                        id: $0.id,
                        slug: $0.slug,
                        label: $0.label,
                        isActive: $0.isActive
                    )
                }
        )
    }

    private var normalizedQuery: String {
        searchText.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func matches(_ values: [String?], tagIDs: [String]) -> Bool {
        if let selectedTagID, !tagIDs.contains(selectedTagID) { return false }
        guard !normalizedQuery.isEmpty else { return true }
        return values.compactMap { $0 }.contains {
            $0.localizedCaseInsensitiveContains(normalizedQuery)
        }
    }

    private var visibleTasks: [MobileCaptureTodayTask] {
        (workspace?.tasks ?? []).filter { task in
            let effectiveTagIDs = model.todayClient.effectiveTagIDs(
                kind: .task,
                entityID: task.id,
                canonicalTagIDs: task.tagIds ?? []
            )
            return (showsCompletedTasks || task.status == "OPEN")
                && matches(
                    [task.title, task.detail] + effectiveTagLabels(kind: .task, entityID: task.id, tagIDs: effectiveTagIDs),
                    tagIDs: effectiveTagIDs
                )
        }
    }

    private var visibleGoals: [MobileCaptureTodayGoal] {
        (workspace?.goals ?? []).filter { goal in
            let effectiveTagIDs = model.todayClient.effectiveTagIDs(
                kind: .goal,
                entityID: goal.id,
                canonicalTagIDs: goal.tagIds ?? []
            )
            return goal.status == "ACTIVE"
                && matches(
                    [goal.title, goal.description, goal.progressNote] + effectiveTagLabels(kind: .goal, entityID: goal.id, tagIDs: effectiveTagIDs),
                    tagIDs: effectiveTagIDs
                )
        }
    }

    private var visibleNotes: [MobileCaptureWorkNote] {
        (workspace?.notes ?? []).filter { note in
            let effectiveTagIDs = model.todayClient.effectiveTagIDs(
                kind: .document,
                entityID: note.id,
                canonicalTagIDs: note.tagIds
            )
            return matches(
                [note.title, note.excerpt] + effectiveTagLabels(kind: .document, entityID: note.id, tagIDs: effectiveTagIDs),
                tagIDs: effectiveTagIDs
            )
        }
    }

    private var activeTags: [MobileCaptureWorkTag] {
        (workspace?.tags ?? []).filter(\.isActive)
    }

    private var selectedTag: MobileCaptureWorkTag? {
        guard let selectedTagID else { return nil }
        return (workspace?.tags ?? []).first { $0.id == selectedTagID }
    }

    private var retiredTags: [MobileCaptureWorkTag] {
        (workspace?.tags ?? []).filter { !$0.isActive }
    }

    private var workTagCatalog: [MobileCaptureTodayTag] {
        (workspace?.tags ?? []).map {
            MobileCaptureTodayTag(
                id: $0.id,
                projectId: $0.projectId,
                slug: $0.slug,
                label: $0.label,
                isActive: $0.isActive
            )
        }
    }

    private var decisionsDisabled: Bool {
        model.usesPreviewData || client.isUsingProtectedCache || !AuthManager.shared.networkActionsAllowed
    }

    private var projectCreationDisabled: Bool {
        model.usesPreviewData
            || client.isUsingProtectedCache
            || !AuthManager.shared.networkActionsAllowed
            || client.isCreatingProject
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if client.isUsingProtectedCache {
                    Label("Protected offline snapshot · reconnect before changing canonical work", systemImage: "lock.iphone")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(.orange.opacity(0.12), in: Capsule())
                        .accessibilityIdentifier("CaptureWorkProtectedSnapshot")
                } else if model.usesPreviewData {
                    Label("Preview data · no canonical work will change", systemImage: "hammer.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(.orange.opacity(0.12), in: Capsule())
                }

                if let errorMessage = client.errorMessage {
                    Text(errorMessage)
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("CaptureWorkStatus")
                }
                if client.pendingDocumentNoteEditCount > 0
                    || client.heldDocumentNoteEditCount > 0
                    || client.documentNoteEditMessage != nil {
                    documentNoteEditStatus
                }

                if let workspace {
                    projectSummary(workspace)
                    quickCapture
                    if model.quickEntryOutbox.hasRetryableEntries || model.quickEntrySyncMessage != nil {
                        CaptureQuickEntrySyncCard(model: model)
                    }
                    tagLens
                    workSections
                } else if client.isLoading {
                    CaptureLoadingCard(label: "Loading your projects…")
                } else {
                    CaptureEmptyCard(
                        systemImage: "square.grid.2x2",
                        title: "No projects yet",
                        detail: "Nest will create your private Home Nest when your account is ready.",
                        actionTitle: "Try again",
                        action: { Task { await client.load() } }
                    )
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 96)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(CaptureCanvas())
        .navigationTitle("Work")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            await model.todayClient.load()
            await client.load(projectID: selectedProject?.id)
        }
        .sheet(item: $quickEntryKind) { kind in
            CaptureQuickEntrySheet(
                kind: kind,
                session: nil,
                model: model,
                initialProject: captureDestination
            )
            .presentationDetents([.large])
        }
        .sheet(isPresented: $showsNewProject) {
            NewCaptureProjectSheet(client: client)
                .presentationDetents([.large])
        }
        .sheet(isPresented: $showsTagVocabulary) {
            if let workspace {
                CaptureTagVocabularySheet(
                    client: client,
                    project: workspace.project,
                    tags: workspace.tags,
                    readOnly: decisionsDisabled || !workspace.project.canWrite
                )
                .presentationDetents([.large])
            }
        }
        .sheet(item: $taskToEdit) { task in
            CaptureTaskEditSheet(
                client: model.todayClient,
                task: task,
                onSaved: reloadSelectedWork
            )
        }
        .sheet(item: $recurrenceToEdit) { task in
            CaptureRecurrenceEditSheet(
                client: model.todayClient,
                task: task,
                onSaved: reloadSelectedWork
            )
        }
        .sheet(item: $goalToEdit) { goal in
            CaptureGoalEditSheet(
                client: model.todayClient,
                goal: goal,
                onSaved: reloadSelectedWork
            )
        }
        .sheet(item: $taskTagsToEdit) { task in
            if let project = task.project {
                TodayWorkTagSheet(
                    client: model.todayClient,
                    kind: .task,
                    entityID: task.id,
                    entityTitle: task.title,
                    project: project,
                    canonicalTagIDs: task.tagIds ?? [],
                    expectedUpdatedAt: task.updatedAt,
                    readOnlyPreview: model.usesPreviewData,
                    availableTags: workTagCatalog,
                    onSaved: reloadSelectedWork
                )
            }
        }
        .sheet(item: $goalTagsToEdit) { goal in
            if let project = goal.project {
                TodayWorkTagSheet(
                    client: model.todayClient,
                    kind: .goal,
                    entityID: goal.id,
                    entityTitle: goal.title,
                    project: project,
                    canonicalTagIDs: goal.tagIds ?? [],
                    expectedUpdatedAt: goal.updatedAt,
                    readOnlyPreview: model.usesPreviewData,
                    availableTags: workTagCatalog,
                    onSaved: reloadSelectedWork
                )
            }
        }
        .sheet(item: $noteTagsToEdit) { note in
            if let project = selectedProject {
                TodayWorkTagSheet(
                    client: model.todayClient,
                    kind: .document,
                    entityID: note.id,
                    entityTitle: note.title,
                    project: MobileCaptureTodayProject(
                        id: project.id,
                        name: project.name,
                        slug: project.slug
                    ),
                    canonicalTagIDs: note.tagIds,
                    expectedUpdatedAt: note.updatedAt,
                    expectedTagRevision: note.tagRevision,
                    readOnlyPreview: model.usesPreviewData,
                    availableTags: workTagCatalog,
                    onSaved: reloadSelectedWork
                )
            }
        }
        .sheet(item: $noteToEdit) { note in
            if let project = selectedProject {
                CaptureDocumentNoteEditSheet(
                    client: client,
                    note: note,
                    project: project
                )
                .presentationDetents([.large])
            }
        }
        .onAppear {
            selectedProjectID = selectedProjectID ?? client.selectedProjectID
        }
        .onChange(of: client.selectedProjectID) { _, newValue in
            selectedProjectID = newValue
        }
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button {
                    showsNewProject = true
                } label: {
                    Image(systemName: "folder.badge.plus")
                }
                .disabled(projectCreationDisabled)
                .accessibilityLabel("New private project")
                .accessibilityHint("Creates a canonical private Nest owned by this Quipsly account.")
                .accessibilityIdentifier("CaptureWorkNewProject")
            }
        }
        .accessibilityIdentifier("CaptureWorkView")
    }

    private var documentNoteEditStatus: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: client.heldDocumentNoteEditCount > 0 ? "exclamationmark.shield.fill" : "lock.iphone")
                    .foregroundStyle(client.heldDocumentNoteEditCount > 0 ? .orange : CapturePalette.accent)
                VStack(alignment: .leading, spacing: 3) {
                    Text(client.heldDocumentNoteEditCount > 0
                         ? "Project-note draft needs review"
                         : "Project-note edit protected")
                        .font(.caption.weight(.bold))
                    if let message = client.documentNoteEditMessage {
                        Text(message)
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Text("\(client.pendingDocumentNoteEditCount) waiting · \(client.heldDocumentNoteEditCount) held")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            if client.pendingDocumentNoteEditCount > 0 {
                Button {
                    Task { await client.retryDocumentNoteEdits() }
                } label: {
                    Label("Retry protected edits", systemImage: "arrow.clockwise")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(
                    client.isSyncingDocumentNoteEdits
                        || !AuthManager.shared.networkActionsAllowed
                )
                .accessibilityIdentifier("CaptureWorkNoteEditsRetry")
            }
        }
        .padding(13)
        .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 18))
        .accessibilityIdentifier("CaptureWorkNoteEditStatus")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 10) {
                Image(systemName: "magnifyingglass")
                    .foregroundStyle(.secondary)
                    .accessibilityHidden(true)
                TextField(
                    "Find work or a tag",
                    text: $searchText,
                    axis: .vertical
                )
                    .textFieldStyle(.plain)
                    .lineLimit(1 ... 2)
                    .fixedSize(horizontal: false, vertical: true)
                    .submitLabel(.search)
                    .autocorrectionDisabled()
                    .textInputAutocapitalization(.never)
                    .focused($searchIsFocused)
                    .onSubmit { searchIsFocused = false }
                    .accessibilityLabel("Find work or a tag")
                    .accessibilityIdentifier("CaptureWorkSearchField")
                if !searchText.isEmpty {
                    Button {
                        searchText = ""
                        searchIsFocused = false
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .foregroundStyle(.secondary)
                            .frame(width: 44, height: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("Clear work search")
                }
            }
            .padding(.leading, 14)
            .padding(.trailing, 4)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, minHeight: 52)
            .background(.background, in: RoundedRectangle(cornerRadius: 16))
            .overlay {
                RoundedRectangle(cornerRadius: 16)
                    .stroke(.primary.opacity(0.1))
            }

            HStack(alignment: .firstTextBaseline) {
                Text("Your projects")
                    .font(.largeTitle.weight(.bold))
                Spacer()
                Button {
                    showsNewProject = true
                } label: {
                    Label("New", systemImage: "plus")
                }
                .buttonStyle(.bordered)
                .disabled(projectCreationDisabled)
                .accessibilityIdentifier("CaptureWorkNewProjectInline")
            }
            Text("Every task, goal, note, and tag stays attached to its canonical Nest.")
                .font(.subheadline)
                .foregroundStyle(.secondary)

            if !client.projects.isEmpty {
                Menu {
                    ForEach(client.projects) { project in
                        Button {
                            selectedTagID = nil
                            searchText = ""
                            client.tagVocabularyMessage = nil
                            if model.usesPreviewData {
                                selectedProjectID = project.id
                                client.loadPreview(projectID: project.id)
                            } else {
                                Task {
                                    await client.load(projectID: project.id)
                                    selectedProjectID = client.selectedProjectID
                                }
                            }
                        } label: {
                            Label(
                                project.name,
                                systemImage: project.id == selectedProject?.id ? "checkmark.circle.fill" : "square.grid.2x2"
                            )
                        }
                    }
                } label: {
                    HStack(spacing: 10) {
                        Image(systemName: selectedProject?.isHomeNest == true ? "house.fill" : "square.grid.2x2.fill")
                        Text(selectedProject?.name ?? "Choose project")
                            .fontWeight(.bold)
                            .fixedSize(horizontal: false, vertical: true)
                        Spacer()
                        Image(systemName: "chevron.up.chevron.down")
                            .font(.caption.weight(.bold))
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.horizontal, 14)
                    .frame(minHeight: 48)
                    .background(.background, in: RoundedRectangle(cornerRadius: 15))
                    .overlay {
                        RoundedRectangle(cornerRadius: 15)
                            .stroke(.primary.opacity(0.12))
                    }
                }
                .accessibilityIdentifier("CaptureWorkProjectPicker")
            }
        }
        .padding(.top, 10)
    }

    private func projectSummary(_ workspace: MobileCaptureWorkWorkspace) -> some View {
        let openTaskCount = workspace.tasks.filter { $0.status == "OPEN" }.count
        let activeGoalCount = workspace.goals.filter { $0.status == "ACTIVE" }.count
        return VStack(alignment: .leading, spacing: 14) {
            ViewThatFits(in: .horizontal) {
                HStack(alignment: .firstTextBaseline, spacing: 12) {
                    projectSummaryTitle(workspace)
                    Spacer(minLength: 0)
                    projectRoleBadge(workspace.project.role)
                }
                VStack(alignment: .leading, spacing: 8) {
                    projectSummaryTitle(workspace)
                    projectRoleBadge(workspace.project.role)
                }
            }
            ViewThatFits(in: .horizontal) {
                HStack(spacing: 0) {
                    workMetric(value: openTaskCount, label: "Open tasks", preservesLabelWidth: true)
                    Divider().frame(height: 34)
                    workMetric(value: activeGoalCount, label: "Active goals", preservesLabelWidth: true)
                    Divider().frame(height: 34)
                    workMetric(value: workspace.notes.count, label: "Notes", preservesLabelWidth: true)
                    Divider().frame(height: 34)
                    workMetric(value: activeTags.count, label: "Tags", preservesLabelWidth: true)
                }
                LazyVGrid(
                    columns: [
                        GridItem(.flexible(minimum: 0), spacing: 12),
                        GridItem(.flexible(minimum: 0), spacing: 12),
                    ],
                    spacing: 12
                ) {
                    workMetric(value: openTaskCount, label: "Open tasks", wrapsLabel: true)
                    workMetric(value: activeGoalCount, label: "Active goals", wrapsLabel: true)
                    workMetric(value: workspace.notes.count, label: "Notes", wrapsLabel: true)
                    workMetric(value: activeTags.count, label: "Tags", wrapsLabel: true)
                }
            }
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 22))
        .overlay {
            RoundedRectangle(cornerRadius: 22)
                .stroke(.primary.opacity(0.09))
        }
        .accessibilityIdentifier("CaptureWorkProjectSummary")
    }

    private func projectSummaryTitle(_ workspace: MobileCaptureWorkWorkspace) -> some View {
        VStack(alignment: .leading, spacing: 3) {
            Text(workspace.project.isHomeNest ? "Private Home Nest" : "Project workspace")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Text(workspace.project.name)
                .font(.title2.weight(.bold))
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func projectRoleBadge(_ role: String) -> some View {
        Text(role.capitalized)
            .font(.caption2.weight(.bold))
            .padding(.horizontal, 9)
            .padding(.vertical, 6)
            .background(CapturePalette.accent.opacity(0.12), in: Capsule())
            .fixedSize(horizontal: true, vertical: true)
    }

    private func workMetric(
        value: Int,
        label: String,
        wrapsLabel: Bool = false,
        preservesLabelWidth: Bool = false
    ) -> some View {
        VStack(spacing: 2) {
            Text("\(value)").font(.headline.weight(.bold))
            Text(label)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .lineLimit(wrapsLabel ? 2 : 1)
                .multilineTextAlignment(.center)
                .fixedSize(
                    horizontal: preservesLabelWidth,
                    vertical: wrapsLabel
                )
        }
        .frame(maxWidth: .infinity)
    }

    @ViewBuilder
    private var quickCapture: some View {
        if selectedProject?.canWrite == true, captureDestination != nil {
            VStack(alignment: .leading, spacing: 10) {
                Text("Add to this project")
                    .font(.headline)
                HStack(spacing: 9) {
                    ForEach([MobileQuickEntryKind.task, .note, .goal]) { kind in
                        Button {
                            quickEntryKind = kind
                        } label: {
                            Label(kind.title, systemImage: kind.systemImage)
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureWorkQuickEntry_\(kind.rawValue)")
                    }
                }
                Text("The iPhone protects the complete capture first. Nest sync keeps this exact project, canonical ID, and selected tags.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .padding(16)
            .background(CapturePalette.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 22))
        } else if selectedProject?.canWrite == false {
            Label("Read-only project · ask an owner for editor access to add or change work.", systemImage: "eye")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .padding(14)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.background, in: RoundedRectangle(cornerRadius: 18))
        }
    }

    @ViewBuilder
    private var tagLens: some View {
        if !activeTags.isEmpty || !retiredTags.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text("Tags").font(.headline)
                    Spacer()
                    if selectedTagID != nil {
                        Button("Clear filter") { selectedTagID = nil }
                            .font(.caption.weight(.bold))
                    }
                    Button("Manage") {
                        showsTagVocabulary = true
                    }
                    .font(.caption.weight(.bold))
                    .frame(minWidth: 44, minHeight: 44)
                    .contentShape(Rectangle())
                    .accessibilityLabel("Manage shared tag vocabulary")
                    .accessibilityIdentifier("CaptureWorkManageTags")
                }
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(activeTags) { tag in
                            Button {
                                selectedTagID = selectedTagID == tag.id ? nil : tag.id
                            } label: {
                                HStack(spacing: 5) {
                                    Text(tag.label)
                                    Text("\(tag.usageCount)")
                                        .foregroundStyle(.secondary)
                                }
                                .font(.caption.weight(.semibold))
                                .padding(.horizontal, 11)
                                .padding(.vertical, 8)
                                .background(
                                    selectedTagID == tag.id ? CapturePalette.accent.opacity(0.2) : Color.primary.opacity(0.06),
                                    in: Capsule()
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Show work tagged \(tag.label) in \(selectedProject?.name ?? "this Nest")")
                            .accessibilityValue(selectedTagID == tag.id ? "Selected" : "Not selected")
                            .accessibilityIdentifier("CaptureWorkTag_\(tag.id)")
                        }
                    }
                }
                if let selectedTag {
                    Label(
                        "Showing #\(selectedTag.label) in \(selectedProject?.name ?? "this Nest")",
                        systemImage: "line.3.horizontal.decrease.circle.fill"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CapturePalette.accent)
                    .accessibilityIdentifier("CaptureWorkTagFocus")
                }
                if !retiredTags.isEmpty {
                    Text("\(retiredTags.count) retired tag\(retiredTags.count == 1 ? "" : "s") remain preserved for history.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(16)
            .background(.background, in: RoundedRectangle(cornerRadius: 22))
        }
    }

    private var workSections: some View {
        VStack(alignment: .leading, spacing: 18) {
            workSectionHeader("Tasks", count: visibleTasks.count) {
                Button(showsCompletedTasks ? "Hide done" : "Show done") {
                    showsCompletedTasks.toggle()
                }
                .font(.caption.weight(.bold))
            }
            if visibleTasks.isEmpty {
                compactEmpty("No matching tasks", systemImage: "checklist")
            } else {
                ForEach(visibleTasks) { task in
                    workTaskRow(task)
                }
            }

            workSectionHeader("Goals", count: visibleGoals.count)
            if visibleGoals.isEmpty {
                compactEmpty("No matching active goals", systemImage: "target")
            } else {
                ForEach(visibleGoals) { goal in
                    workGoalRow(goal)
                }
            }

            workSectionHeader("Notes", count: visibleNotes.count)
            if visibleNotes.isEmpty {
                compactEmpty("No matching notes", systemImage: "note.text")
            } else {
                ForEach(visibleNotes) { note in
                    workNoteRow(note)
                }
            }
        }
    }

    private func workSectionHeader<Trailing: View>(
        _ title: String,
        count: Int,
        @ViewBuilder trailing: () -> Trailing
    ) -> some View {
        HStack {
            Text(title).font(.title3.weight(.bold))
            Text("\(count)")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
            Spacer()
            trailing()
        }
    }

    private func workSectionHeader(_ title: String, count: Int) -> some View {
        workSectionHeader(title, count: count) { EmptyView() }
    }

    private func workTaskRow(_ task: MobileCaptureTodayTask) -> some View {
        let pendingTags = model.todayClient.pendingWorkTagDecision(kind: .task, entityID: task.id)
        let visibleTagIDs = model.todayClient.effectiveTagIDs(
            kind: .task,
            entityID: task.id,
            canonicalTagIDs: task.tagIds ?? []
        )
        return HStack(alignment: .top, spacing: 12) {
            Button {
                Task {
                    if await model.todayClient.setTaskStatus(
                        task,
                        status: task.status == "OPEN" ? "DONE" : "OPEN"
                    ) {
                        await client.load(projectID: selectedProject?.id)
                    }
                }
            } label: {
                Image(systemName: task.status == "OPEN" ? "circle" : "checkmark.circle.fill")
                    .font(.title3)
                    .foregroundStyle(task.status == "OPEN" ? CapturePalette.accent : .green)
            }
            .disabled(decisionsDisabled)
            .accessibilityLabel(task.status == "OPEN" ? "Mark \(task.title) done" : "Reopen \(task.title)")
            .accessibilityIdentifier("CaptureWorkTaskStatus_\(task.id)")

            VStack(alignment: .leading, spacing: 5) {
                Text(task.title)
                    .font(.body.weight(.semibold))
                    .strikethrough(task.status != "OPEN")
                if let detail = task.detail, !detail.isEmpty {
                    Text(detail).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                }
                if let dueLabel = captureTaskDueLabel(task) {
                    Label(dueLabel, systemImage: task.isOverdue == true ? "exclamationmark.circle.fill" : "calendar")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(task.isOverdue == true ? Color.orange : Color.secondary)
                        .accessibilityIdentifier("CaptureWorkTaskDue_\(task.id)")
                }
                workTagLabels(effectiveTagLabels(kind: .task, entityID: task.id, tagIDs: visibleTagIDs))
                workTagDecisionStatus(kind: .task, entityID: task.id)
                if task.status == "OPEN" {
                    Button {
                        if task.recurrence == nil {
                            taskToEdit = task
                        } else {
                            recurrenceToEdit = task
                        }
                    } label: {
                        Label(task.recurrence == nil ? "Edit task" : "Edit repeat", systemImage: "pencil")
                            .frame(minHeight: 44)
                    }
                    .font(.caption.weight(.bold))
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CaptureWorkTaskEdit_\(task.id)")
                    .accessibilityHint(task.recurrence == nil
                        ? "Edits the canonical title, detail, and due date without changing tags, reminders, status, or external systems."
                        : "Opens the history-preserving repeating-task editor.")
                }
                if task.canEditTags == true {
                    Button {
                        taskTagsToEdit = task
                    } label: {
                        Label(model.usesPreviewData ? "Explore tags" : "Edit tags", systemImage: "tag")
                            .frame(minHeight: 44)
                    }
                    .font(.caption.weight(.bold))
                    .buttonStyle(.bordered)
                    .disabled(model.todayClient.isMutating || pendingTags != nil)
                    .accessibilityLabel("\(model.usesPreviewData ? "Explore" : "Edit") tags for \(task.title)")
                    .accessibilityIdentifier("CaptureWorkTaskTagsEdit_\(task.id)")
                    .accessibilityHint("Protects the complete tag selection on this iPhone before reconciling it with the same Nest.")
                }
            }
            Spacer(minLength: 0)
        }
        .padding(14)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(task.isOverdue == true ? Color.orange.opacity(0.45) : Color.primary.opacity(0.07))
        }
        .accessibilityIdentifier("CaptureWorkTask_\(task.id)")
    }

    private func workGoalRow(_ goal: MobileCaptureTodayGoal) -> some View {
        let pendingTags = model.todayClient.pendingWorkTagDecision(kind: .goal, entityID: goal.id)
        let visibleTagIDs = model.todayClient.effectiveTagIDs(
            kind: .goal,
            entityID: goal.id,
            canonicalTagIDs: goal.tagIds ?? []
        )
        return VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .top) {
                Image(systemName: "target")
                    .foregroundStyle(CapturePalette.accent)
                VStack(alignment: .leading, spacing: 4) {
                    Text(goal.title).font(.body.weight(.semibold))
                    if let description = goal.description, !description.isEmpty {
                        Text(description).font(.caption).foregroundStyle(.secondary).lineLimit(3)
                    }
                }
                Spacer()
                TodayGoalCheckInControls(
                    client: model.todayClient,
                    goal: goal,
                    decisionsDisabled: decisionsDisabled,
                    onSaved: {
                        Task { await client.load(projectID: selectedProject?.id) }
                    }
                )
            }
            if let progress = goal.progressPercent {
                ProgressView(value: Double(progress), total: 100)
                Text("\(progress)%\(goal.progressNote.map { " · \($0)" } ?? "")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(2)
            }
            if let targetLabel = captureGoalTargetLabel(goal) {
                Label(targetLabel, systemImage: "flag")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("CaptureWorkGoalTarget_\(goal.id)")
            }
            workTagLabels(effectiveTagLabels(kind: .goal, entityID: goal.id, tagIDs: visibleTagIDs))
            workTagDecisionStatus(kind: .goal, entityID: goal.id)
            if goal.status == "ACTIVE" || goal.status == "PAUSED" {
                Button {
                    goalToEdit = goal
                } label: {
                    Label("Edit goal", systemImage: "pencil")
                        .frame(minHeight: 44)
                }
                .font(.caption.weight(.bold))
                .buttonStyle(.bordered)
                .disabled(decisionsDisabled)
                .accessibilityIdentifier("CaptureWorkGoalEdit_\(goal.id)")
                .accessibilityHint("Edits the canonical goal definition and target without changing progress, tasks, tags, source evidence, or external calendars.")
            }
            if goal.canEditTags == true {
                Button {
                    goalTagsToEdit = goal
                } label: {
                    Label(model.usesPreviewData ? "Explore tags" : "Edit tags", systemImage: "tag")
                        .frame(minHeight: 44)
                }
                .font(.caption.weight(.bold))
                .buttonStyle(.bordered)
                .disabled(model.todayClient.isMutating || pendingTags != nil)
                .accessibilityLabel("\(model.usesPreviewData ? "Explore" : "Edit") tags for \(goal.title)")
                .accessibilityIdentifier("CaptureWorkGoalTagsEdit_\(goal.id)")
                .accessibilityHint("Protects the complete tag selection on this iPhone before reconciling it with the same Nest.")
            }
        }
        .padding(14)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.primary.opacity(0.07))
        }
        .accessibilityIdentifier("CaptureWorkGoal_\(goal.id)")
    }

    @ViewBuilder
    private func workNoteRow(_ note: MobileCaptureWorkNote) -> some View {
        let baseURL = normalizedNestBaseURL(Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com")
        let pendingTags = model.todayClient.pendingWorkTagDecision(kind: .document, entityID: note.id)
        let visibleTagIDs = model.todayClient.effectiveTagIDs(
            kind: .document,
            entityID: note.id,
            canonicalTagIDs: note.tagIds
        )
        let visibleTagLabels = effectiveTagLabels(kind: .document, entityID: note.id, tagIDs: visibleTagIDs)
        let pendingEdit = client.pendingDocumentNoteEdit(for: note.id)
        VStack(alignment: .leading, spacing: 8) {
            if let url = URL(string: "\(baseURL)\(note.webPath)") {
                Link(destination: url) {
                    workNoteContent(note, tagLabels: visibleTagLabels)
                }
                .buttonStyle(.plain)
                .accessibilityHint(client.isUsingProtectedCache ? "Requires a connection to open the canonical Nest note." : "Opens the canonical note in Nest.")
                .accessibilityIdentifier("CaptureWorkNote_\(note.id)")
            } else {
                workNoteContent(note, tagLabels: visibleTagLabels)
            }
            if let pendingEdit {
                Label(
                    pendingEdit.disposition == .held
                        ? "Protected draft held for review"
                        : "Protected draft waiting for Nest",
                    systemImage: pendingEdit.disposition == .held
                        ? "exclamationmark.shield"
                        : "lock.iphone"
                )
                .font(.caption2.weight(.semibold))
                .foregroundStyle(pendingEdit.disposition == .held ? .orange : CapturePalette.accent)
                .accessibilityIdentifier("CaptureWorkNoteEditState_\(note.id)")
            }
            workTagDecisionStatus(kind: .document, entityID: note.id)
            HStack(spacing: 8) {
                if note.canEditContent == true, note.contentRevision != nil, note.blocks?.isEmpty == false {
                    Button {
                        noteToEdit = note
                    } label: {
                        Label(
                            model.usesPreviewData ? "Explore note" : pendingEdit?.disposition == .held ? "Review draft" : "Edit note",
                            systemImage: "square.and.pencil"
                        )
                        .frame(minHeight: 44)
                    }
                    .font(.caption.weight(.bold))
                    .buttonStyle(.borderedProminent)
                    .disabled(pendingEdit?.disposition == .pending || client.isSyncingDocumentNoteEdits)
                    .accessibilityIdentifier("CaptureWorkNoteEdit_\(note.id)")
                    .accessibilityHint("Protects the complete title and stable block content before Nest reconciles the canonical document revision.")
                }
                if note.canEditTags == true, note.tagRevision != nil {
                Button {
                    noteTagsToEdit = note
                } label: {
                    Label(model.usesPreviewData ? "Explore tags" : "Edit tags", systemImage: "tag")
                        .frame(minHeight: 44)
                }
                .font(.caption.weight(.bold))
                .buttonStyle(.bordered)
                .disabled(model.todayClient.isMutating || pendingTags != nil)
                .accessibilityLabel("\(model.usesPreviewData ? "Explore" : "Edit") tags for \(note.title)")
                .accessibilityIdentifier("CaptureWorkNoteTagsEdit_\(note.id)")
                .accessibilityHint("Protects the complete document tag selection on this iPhone before reconciling it with the same Nest.")
                }
            }
            if note.canEditContent != true, let boundary = note.contentEditBoundary {
                Text(boundary)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(14)
        .background(.background, in: RoundedRectangle(cornerRadius: 18))
        .overlay {
            RoundedRectangle(cornerRadius: 18)
                .stroke(Color.primary.opacity(0.07))
        }
    }

    private func workNoteContent(_ note: MobileCaptureWorkNote, tagLabels: [String]) -> some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: "note.text")
                .font(.title3)
                .foregroundStyle(CapturePalette.accent)
            VStack(alignment: .leading, spacing: 5) {
                Text(note.title).font(.body.weight(.semibold))
                if !note.excerpt.isEmpty {
                    Text(note.excerpt).font(.caption).foregroundStyle(.secondary).lineLimit(4)
                }
                workTagLabels(tagLabels)
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.secondary)
        }
    }

    @ViewBuilder
    private func workTagLabels(_ labels: [String]) -> some View {
        if !labels.isEmpty {
            Text(labels.map { "#\($0)" }.joined(separator: "  "))
                .font(.caption2.weight(.semibold))
                .foregroundStyle(CapturePalette.accent)
                .lineLimit(2)
        }
    }

    private func tagLabels(for tagIDs: [String]) -> [String] {
        let labelsByID = Dictionary(uniqueKeysWithValues: (workspace?.tags ?? []).map { ($0.id, $0.label) })
        return tagIDs.compactMap { labelsByID[$0] }
    }

    private func effectiveTagLabels(
        kind: PendingWorkTagDecision.EntityKind,
        entityID: String,
        tagIDs: [String]
    ) -> [String] {
        let pendingLabels = model.todayClient
            .pendingWorkTagDecision(kind: kind, entityID: entityID)?
            .requestedNewTagLabels ?? []
        var seen = Set<String>()
        return (tagLabels(for: tagIDs) + pendingLabels).filter {
            seen.insert($0.lowercased(with: Locale(identifier: "en_US_POSIX"))).inserted
        }
    }

    @ViewBuilder
    private func workTagDecisionStatus(
        kind: PendingWorkTagDecision.EntityKind,
        entityID: String
    ) -> some View {
        if let pending = model.todayClient.pendingWorkTagDecision(kind: kind, entityID: entityID) {
            Label(
                pending.disposition == .held ? "Phone tag change needs review" : "Tag change queued for Nest",
                systemImage: pending.disposition == .held ? "exclamationmark.triangle.fill" : "tag.fill"
            )
            .font(.caption2.weight(.semibold))
            .foregroundStyle(pending.disposition == .held ? Color.orange : Color.blue)
            .accessibilityIdentifier("CaptureWorkTagsPending_\(kind.rawValue)_\(entityID)")
            .accessibilityValue(pending.disposition == .held ? "Held" : "Queued")
            if pending.disposition == .held {
                Button("Discard phone tag change") {
                    Task {
                        await model.todayClient.discardHeldWorkTagDecision(kind: kind, entityID: entityID)
                        await client.load(projectID: selectedProject?.id)
                    }
                }
                .font(.caption.weight(.bold))
                .buttonStyle(.bordered)
                .accessibilityIdentifier("CaptureWorkTagsDiscard_\(kind.rawValue)_\(entityID)")
            }
        }
    }

    private func reloadSelectedWork() {
        Task { await client.load(projectID: selectedProject?.id) }
    }

    private func compactEmpty(_ title: String, systemImage: String) -> some View {
        Label(title, systemImage: systemImage)
            .font(.caption.weight(.semibold))
            .foregroundStyle(.secondary)
            .padding(14)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 16))
    }
}

struct TodayFollowThroughCard: View {
    private struct TranscriptSourceDestination: Hashable {
        let roomID: String
        let sessionTitle: String
        let source: MobileCaptureTodayTranscriptSourceAnchor
    }

    @ObservedObject var client: CaptureTodayClient
    @ObservedObject var inboxClient: CaptureSourceInboxClient
    let previewOnly: Bool
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @StateObject private var library = LocalRecordingLibrary.shared
    @State private var recurrenceToEnd: MobileCaptureTodayRecurrence?
    @State private var recurrenceToEdit: MobileCaptureTodayTask?
    @State private var missedOccurrenceToSkip: MobileCaptureTodayTask?
    @State private var reminderToEdit: MobileCaptureTodayTask?
    @State private var reminderToCancel: MobileCaptureTodayTask?
    @State private var taskToEdit: MobileCaptureTodayTask?
    @State private var goalToEdit: MobileCaptureTodayGoal?
    @State private var taskTagsToEdit: MobileCaptureTodayTask?
    @State private var goalTagsToEdit: MobileCaptureTodayGoal?
    @State private var sourceToFile: MobileSourceInboxSource?
    @State private var showsAllCommittedTasks = false

    private var nextFocus: MobileCaptureTodayFocusBlock? {
        client.focusBlocks.first(where: { $0.status.uppercased() == "PLANNED" })
    }

    private var decisionsDisabled: Bool {
        previewOnly || client.isUsingProtectedCache || client.isMutating || !AuthManager.shared.networkActionsAllowed
    }

    private var reminderDecisionsDisabled: Bool {
        previewOnly || client.isMutating
    }

    private var visibleCommittedTasks: [MobileCaptureTodayTask] {
        showsAllCommittedTasks || client.tasks.count <= 3 ? client.tasks : Array(client.tasks.prefix(3))
    }

    private var activeSourceAnnotations: [MobileCaptureTodaySourceAnnotation] {
        client.sourceAnnotations.filter { $0.status.lowercased() == "active" }
    }

    private var recentlyResolvedSourceAnnotations: [MobileCaptureTodaySourceAnnotation] {
        client.sourceAnnotations.filter {
            $0.status.lowercased() == "resolved" && $0.createdByMe
        }
    }

    private var recurrenceManagerTaskIDs: Set<String> {
        var series = Set<String>()
        var tasks = Set<String>()
        for task in client.tasks {
            guard let recurrence = task.recurrence,
                  recurrence.ownerCanManage,
                  !series.contains(recurrence.seriesId) else { continue }
            series.insert(recurrence.seriesId)
            tasks.insert(task.id)
        }
        return tasks
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .firstTextBaseline) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Follow-through")
                        .font(.title3.weight(.bold))
                    Text("The same goals and committed work as Nest")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if client.isLoading { ProgressView().controlSize(.small) }
            }
            .accessibilityIdentifier("CaptureTodayFollowThroughCard")

            if let focus = nextFocus {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Next focus", systemImage: "timer")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.blue)
                        .accessibilityIdentifier("CaptureTodayFocusBlock_\(focus.id)")
                    Text(focus.title)
                        .font(.headline)
                    Text(focusWindow(focus))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                    Button {
                        Task { _ = await client.setFocusStatus(focus, status: "COMPLETED") }
                    } label: {
                        Label("Block done", systemImage: "checkmark.circle")
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(decisionsDisabled)
                    .accessibilityHint("Completes only this personal focus block. The task or goal remains unchanged.")
                    .accessibilityIdentifier("CaptureTodayFocusDoneButton")
                }
                .padding(12)
                .background(Color.blue.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            if !client.tasks.isEmpty {
                VStack(alignment: .leading, spacing: 9) {
                    Text("Committed tasks")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                    ForEach(visibleCommittedTasks, id: \MobileCaptureTodayTask.id) { (task: MobileCaptureTodayTask) in
                        VStack(alignment: .leading, spacing: 7) {
                            HStack(alignment: .top, spacing: 10) {
                                Image(systemName: "circle")
                                    .foregroundStyle(.orange)
                                    .padding(.top, 2)
                                VStack(alignment: .leading, spacing: 2) {
                                    let pendingTags = client.pendingWorkTagDecision(kind: .task, entityID: task.id)
                                    Text(task.title)
                                        .font(.subheadline.weight(.semibold))
                                        .accessibilityIdentifier("CaptureTodayTask_\(task.id)")
                                    if let sessionTitle = task.sessionTitle {
                                        Text(sessionTitle).font(.caption).foregroundStyle(.secondary)
                                    }
                                    if let dueLabel = captureTaskDueLabel(task) {
                                        Label(dueLabel, systemImage: task.isOverdue == true ? "exclamationmark.circle.fill" : "calendar")
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(task.isOverdue == true ? Color.orange : Color.secondary)
                                            .accessibilityIdentifier("CaptureTodayTaskDue_\(task.id)")
                                    }
                                    if let project = task.project {
                                        TodayProjectTagLine(
                                            project: project,
                                            tagLabels: client.effectiveTagLabels(
                                                kind: .task,
                                                entityID: task.id,
                                                projectID: project.id,
                                                canonicalTagIDs: task.tagIds ?? [],
                                                canonicalTagLabels: task.tagLabels ?? []
                                            ),
                                            identifier: "CaptureTodayTaskTags_\(task.id)"
                                        )
                                        if let pendingTags {
                                            Label(
                                                pendingTags.disposition == .held ? "Phone tag change needs review" : "Tag change queued for Nest",
                                                systemImage: pendingTags.disposition == .held ? "exclamationmark.triangle.fill" : "tag.fill"
                                            )
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(pendingTags.disposition == .held ? Color.orange : Color.blue)
                                            .accessibilityIdentifier("CaptureTodayTaskTagsPending_\(task.id)")
                                            .accessibilityValue(pendingTags.disposition == .held ? "Held" : "Queued")
                                            if pendingTags.disposition == .held {
                                                Button("Discard phone tag change") {
                                                    Task {
                                                        await client.discardHeldWorkTagDecision(kind: .task, entityID: task.id)
                                                    }
                                                }
                                                .font(.caption.weight(.bold))
                                                .buttonStyle(.bordered)
                                                .accessibilityIdentifier("CaptureTodayTaskTagsDiscard_\(task.id)")
                                            }
                                        }
                                        if task.canEditTags == true {
                                            Button {
                                                taskTagsToEdit = task
                                            } label: {
                                                Label("Edit tags", systemImage: "tag")
                                                    .frame(minHeight: 44)
                                            }
                                            .font(.caption.weight(.bold))
                                            .buttonStyle(.bordered)
                                            .disabled(previewOnly || client.isMutating || pendingTags != nil)
                                            .accessibilityIdentifier("CaptureTodayTaskTagsEdit_\(task.id)")
                                            .accessibilityHint("Protects the complete tag selection on this iPhone before reconciling it with the same Nest.")
                                        }
                                    } else if !(task.tagLabels ?? []).isEmpty {
                                        TodayProjectTagLine(project: nil, tagLabels: task.tagLabels ?? [], identifier: "CaptureTodayTaskTags_\(task.id)")
                                    }
                                    if let todayReason = task.todayReason?.nonempty {
                                        Text(todayReason)
                                            .font(.caption2.weight(.bold))
                                            .foregroundStyle(.blue)
                                            .padding(.horizontal, 8)
                                            .padding(.vertical, 4)
                                            .background(Color.blue.opacity(0.08), in: Capsule())
                                    }
                                    if task.recurrence == nil, task.status == "OPEN" {
                                        Button {
                                            taskToEdit = task
                                        } label: {
                                            Label("Edit task", systemImage: "pencil")
                                                .frame(minHeight: 44)
                                        }
                                        .font(.caption.weight(.bold))
                                        .buttonStyle(.bordered)
                                        .disabled(decisionsDisabled)
                                        .accessibilityIdentifier("CaptureTodayTaskEdit_\(task.id)")
                                        .accessibilityHint("Edits the canonical title, detail, and due date without changing tags, reminders, status, or external systems.")
                                    }
                                    if let reminder = task.reminder,
                                       reminder.status == "ACTIVE" {
                                        Label(
                                            "Reminder \(reminderTime(reminder))",
                                            systemImage: "bell.badge"
                                        )
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(.pink)
                                        .accessibilityIdentifier("CaptureTodayTaskReminder_\(task.id)")
                                        .accessibilityHint("Canonical reminder intent from Nest. Local alert scheduling still depends on this iPhone’s notification permission.")
                                    }
                                    if task.recurrence == nil, task.status == "OPEN" {
                                        if let pending = client.pendingReminderDecision(for: task.id) {
                                            Label(
                                                pending.remindAt.map { "Pending Nest: \($0.formatted(date: .abbreviated, time: .shortened))" }
                                                    ?? "Pending Nest: cancel reminder",
                                                systemImage: pending.disposition == .held
                                                    ? "exclamationmark.triangle.fill"
                                                    : "arrow.triangle.2.circlepath"
                                            )
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(pending.disposition == .held ? Color.orange : Color.blue)
                                            .accessibilityIdentifier("CaptureTodayTaskReminderPending_\(task.id)")
                                            if pending.disposition == .held {
                                                Button("Discard phone change") {
                                                    Task {
                                                        await client.discardHeldReminderDecision(for: task.id)
                                                    }
                                                }
                                                .font(.caption.weight(.bold))
                                                .buttonStyle(.bordered)
                                                .accessibilityHint("Removes the conflicted phone decision and restores the current canonical reminder from Nest.")
                                                .accessibilityIdentifier("CaptureTodayTaskReminderDiscard_\(task.id)")
                                            }
                                        }
                                        HStack {
                                            Button {
                                                reminderToEdit = task
                                            } label: {
                                                Label(
                                                    task.reminder?.status == "ACTIVE" ? "Change reminder" : "Add reminder",
                                                    systemImage: "bell"
                                                )
                                                .frame(minHeight: 44)
                                            }
                                            .buttonStyle(.bordered)
                                            .disabled(
                                                reminderDecisionsDisabled
                                                    || client.pendingReminderDecision(for: task.id) != nil
                                            )
                                            .accessibilityIdentifier("CaptureTodayTaskReminderEdit_\(task.id)")
                                            .accessibilityHint("Protects the decision on this iPhone first, then reconciles the canonical reminder with Nest.")

                                            if task.reminder?.status == "ACTIVE" {
                                                Button(role: .destructive) {
                                                    reminderToCancel = task
                                                } label: {
                                                    Label("Cancel", systemImage: "bell.slash")
                                                        .frame(minHeight: 44)
                                                }
                                                .buttonStyle(.bordered)
                                                .disabled(
                                                    reminderDecisionsDisabled
                                                        || client.pendingReminderDecision(for: task.id) != nil
                                                )
                                                .accessibilityIdentifier("CaptureTodayTaskReminderCancel_\(task.id)")
                                            }
                                        }
                                        .font(.caption.weight(.bold))
                                    }
                                    if let recurrence = task.recurrence {
                                        VStack(alignment: .leading, spacing: 4) {
                                            Label(recurrenceSummary(recurrence), systemImage: "repeat")
                                                .font(.caption2.weight(.semibold))
                                                .foregroundStyle(.purple)
                                            Text("Occurrence \(recurrence.scheduledLocalDate) · \(recurrence.status.capitalized). No reminder or provider event is implied.")
                                                .font(.caption2)
                                                .foregroundStyle(.secondary)
                                            if recurrence.ownerCanManage && recurrenceManagerTaskIDs.contains(task.id) && recurrence.status != "ENDED" {
                                                Menu {
                                                    Button("Edit repeat…", systemImage: "pencil") {
                                                        recurrenceToEdit = task
                                                    }
                                                    if recurrence.status == "ACTIVE" {
                                                        Button("Pause repeat", systemImage: "pause.circle") {
                                                            Task { _ = await client.setRecurrenceStatus(recurrence, status: "PAUSED") }
                                                        }
                                                    } else {
                                                        Button("Resume repeat", systemImage: "play.circle") {
                                                            Task { _ = await client.setRecurrenceStatus(recurrence, status: "ACTIVE") }
                                                        }
                                                    }
                                                    Button("End repeat…", systemImage: "stop.circle", role: .destructive) {
                                                        recurrenceToEnd = recurrence
                                                    }
                                                } label: {
                                                    Label("Manage repeat", systemImage: "ellipsis.circle")
                                                        .frame(minHeight: 44)
                                                }
                                                .disabled(decisionsDisabled)
                                                .accessibilityIdentifier("CaptureTodayRecurrenceMenu_\(recurrence.seriesId)")
                                                .accessibilityHint("Pauses, resumes, or permanently ends this Quipsly series without changing a provider calendar or reminder.")
                                            }
                                        }
                                        .accessibilityElement(children: .contain)
                                        .accessibilityIdentifier("CaptureTodayRecurrence_\(recurrence.seriesId)_\(task.id)")
                                    }
                                }
                                Spacer(minLength: 8)
                                Button("Done") {
                                    Task { _ = await client.setTaskStatus(task, status: "DONE") }
                                }
                                .font(.caption.weight(.bold))
                                .buttonStyle(.bordered)
                                .disabled(decisionsDisabled)
                                .accessibilityIdentifier("CaptureTodayTaskDone_\(task.id)")
                                .accessibilityHint(task.recurrence == nil ? "Marks the committed task done in Quipsly with a private receipt." : "Marks this occurrence done and creates the next canonical occurrence when the active series requires one. No reminder or provider event is scheduled.")
                            }
                            if task.isOverdue == true, task.recurrence != nil, recurrenceManagerTaskIDs.contains(task.id) {
                                Button(role: .destructive) {
                                    missedOccurrenceToSkip = task
                                } label: {
                                    Label("Skip missed occurrence…", systemImage: "forward.end")
                                        .font(.caption.weight(.bold))
                                        .frame(minHeight: 44)
                                }
                                .buttonStyle(.bordered)
                                .disabled(decisionsDisabled)
                                .accessibilityIdentifier("CaptureTodaySkipMissed_\(task.id)")
                                .accessibilityHint("Preserves this overdue occurrence as skipped and continues the canonical series without sending or scheduling anything elsewhere.")
                            }
                            if let source = task.sourceAnchor, source.roomId == task.roomId {
                                NavigationLink(value: TranscriptSourceDestination(
                                    roomID: source.roomId,
                                    sessionTitle: task.sessionTitle ?? "Capture session",
                                    source: source
                                )) {
                                    Label(
                                        "Return to \(source.startSeconds.captureDurationLabel)–\(source.endSeconds.captureDurationLabel)",
                                        systemImage: "waveform.and.magnifyingglass"
                                    )
                                    .font(.caption.weight(.bold))
                                    .frame(minHeight: 44)
                                }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("CaptureTodayTaskSourceLink_\(task.id)")
                                .accessibilityLabel("Task source: Return to \(source.startSeconds.captureDurationLabel)–\(source.endSeconds.captureDurationLabel)")
                                .accessibilityHint("Opens the exact transcript segment and retained recording source behind this task without starting playback.")
                            }
                        }
                    }
                    if client.tasks.count > 3 {
                        Button {
                            withAnimation(
                                reduceMotion ? nil : .easeInOut(duration: 0.2)
                            ) {
                                showsAllCommittedTasks.toggle()
                            }
                        } label: {
                            Label(
                                showsAllCommittedTasks ? "Show today’s top 3" : "Show \(client.tasks.count - 3) more committed tasks",
                                systemImage: showsAllCommittedTasks ? "chevron.up" : "chevron.down"
                            )
                            .frame(minHeight: 44)
                        }
                        .buttonStyle(.plain)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.blue)
                        .accessibilityIdentifier("CaptureTodayShowMoreTasks")
                        .accessibilityHint(showsAllCommittedTasks ? "Collapses the committed work list." : "Shows the remaining committed work already loaded from Nest.")
                    }
                }
            }

            if !client.transcriptReviews.isEmpty {
                VStack(alignment: .leading, spacing: 9) {
                    Label("Transcript review", systemImage: "waveform.and.magnifyingglass")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.purple)
                    Text("AI proposals stay outside transcript truth until you listen and decide.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    ForEach(client.transcriptReviews.prefix(3)) { review in
                        NavigationLink {
                            CaptureTranscriptReviewView(
                                roomID: review.roomId,
                                sessionTitle: review.sessionTitle,
                                recording: matchingRecording(for: review),
                                previewOnly: previewOnly
                            )
                        } label: {
                            VStack(alignment: .leading, spacing: 5) {
                                HStack {
                                    Text(review.sessionTitle)
                                        .font(.subheadline.weight(.semibold))
                                    Spacer()
                                    Text(review.startSeconds.captureDurationLabel)
                                        .font(.caption.monospacedDigit().weight(.semibold))
                                        .foregroundStyle(.secondary)
                                }
                                Text(review.proposedSpeakerLabel.map { "Proposed speaker: \($0)" } ?? review.proposedText ?? "Review AI transcript proposal")
                                    .font(.caption)
                                    .foregroundStyle(.purple)
                                Label(
                                    matchingRecording(for: review) == nil ? "Review only — exact local source unavailable" : "Exact local source ready",
                                    systemImage: matchingRecording(for: review) == nil ? "lock.fill" : "checkmark.shield.fill"
                                )
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(matchingRecording(for: review) == nil ? Color.orange : Color.green)
                            }
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .padding(10)
                            .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("CaptureTodayTranscriptReviewLink_\(review.id)")
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Transcript reviews")
                .accessibilityIdentifier("CaptureTodayTranscriptReviews")
            }

            if !client.goals.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    Label("Active goals", systemImage: "target")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.purple)
                    ForEach(client.goals.prefix(2)) { goal in
                        VStack(alignment: .leading, spacing: 7) {
                            let pendingTags = client.pendingWorkTagDecision(kind: .goal, entityID: goal.id)
                            HStack {
                                Text(goal.title)
                                    .font(.subheadline.weight(.semibold))
                                    .accessibilityIdentifier("CaptureTodayGoal_\(goal.id)")
                                Spacer()
                                if let progress = goal.progressPercent {
                                    Text("\(progress)%").font(.caption.weight(.bold)).foregroundStyle(.secondary)
                                }
                            }
                            if let progress = goal.progressPercent {
                                ProgressView(value: Double(progress), total: 100)
                                    .tint(.purple)
                                    .accessibilityLabel("Goal progress")
                                    .accessibilityValue("\(progress) percent")
                            }
                            if let note = goal.progressNote?.nonempty {
                                Text(note)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            if let targetLabel = captureGoalTargetLabel(goal) {
                                Label(targetLabel, systemImage: "flag")
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .accessibilityIdentifier("CaptureTodayGoalTarget_\(goal.id)")
                            }
                            if goal.status == "ACTIVE" || goal.status == "PAUSED" {
                                Button {
                                    goalToEdit = goal
                                } label: {
                                    Label("Edit goal", systemImage: "pencil")
                                        .frame(minHeight: 44)
                                }
                                .font(.caption.weight(.bold))
                                .buttonStyle(.bordered)
                                .disabled(decisionsDisabled)
                                .accessibilityIdentifier("CaptureTodayGoalEdit_\(goal.id)")
                                .accessibilityHint("Edits the canonical goal definition and target without changing progress, tasks, tags, source evidence, or external calendars.")
                            }
                            if let project = goal.project {
                                TodayProjectTagLine(
                                    project: project,
                                    tagLabels: client.effectiveTagLabels(
                                        kind: .goal,
                                        entityID: goal.id,
                                        projectID: project.id,
                                        canonicalTagIDs: goal.tagIds ?? [],
                                        canonicalTagLabels: goal.tagLabels ?? []
                                    ),
                                    identifier: "CaptureTodayGoalTags_\(goal.id)"
                                )
                                if let pendingTags {
                                    Label(
                                        pendingTags.disposition == .held ? "Phone tag change needs review" : "Tag change queued for Nest",
                                        systemImage: pendingTags.disposition == .held ? "exclamationmark.triangle.fill" : "tag.fill"
                                    )
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(pendingTags.disposition == .held ? Color.orange : Color.blue)
                                    .accessibilityIdentifier("CaptureTodayGoalTagsPending_\(goal.id)")
                                    .accessibilityValue(pendingTags.disposition == .held ? "Held" : "Queued")
                                    if pendingTags.disposition == .held {
                                        Button("Discard phone tag change") {
                                            Task {
                                                await client.discardHeldWorkTagDecision(kind: .goal, entityID: goal.id)
                                            }
                                        }
                                        .font(.caption.weight(.bold))
                                        .buttonStyle(.bordered)
                                        .accessibilityIdentifier("CaptureTodayGoalTagsDiscard_\(goal.id)")
                                    }
                                }
                                if goal.canEditTags == true {
                                    Button {
                                        goalTagsToEdit = goal
                                    } label: {
                                        Label("Edit tags", systemImage: "tag")
                                            .frame(minHeight: 44)
                                    }
                                    .font(.caption.weight(.bold))
                                    .buttonStyle(.bordered)
                                    .disabled(previewOnly || client.isMutating || pendingTags != nil)
                                    .accessibilityIdentifier("CaptureTodayGoalTagsEdit_\(goal.id)")
                                    .accessibilityHint("Protects the complete tag selection on this iPhone before reconciling it with the same Nest.")
                                }
                            } else if !(goal.tagLabels ?? []).isEmpty {
                                TodayProjectTagLine(project: nil, tagLabels: goal.tagLabels ?? [], identifier: "CaptureTodayGoalTags_\(goal.id)")
                            }
                            TodayGoalCheckInControls(
                                client: client,
                                goal: goal,
                                decisionsDisabled: decisionsDisabled
                            )
                            if let source = goal.sourceAnchor, source.roomId == goal.roomId {
                                NavigationLink(value: TranscriptSourceDestination(
                                    roomID: source.roomId,
                                    sessionTitle: goal.sessionTitle ?? "Capture session",
                                    source: source
                                )) {
                                    Label(
                                        "Return to \(source.startSeconds.captureDurationLabel)–\(source.endSeconds.captureDurationLabel)",
                                        systemImage: "waveform.and.magnifyingglass"
                                    )
                                    .font(.caption.weight(.bold))
                                    .frame(minHeight: 44)
                                }
                                .buttonStyle(.bordered)
                                .tint(.purple)
                                .accessibilityIdentifier("CaptureTodayGoalSourceLink_\(goal.id)")
                                .accessibilityLabel("Goal source: Return to \(source.startSeconds.captureDurationLabel)–\(source.endSeconds.captureDurationLabel)")
                                .accessibilityHint("Opens the exact transcript segment and retained recording source behind this goal without starting playback.")
                            }
                        }
                    }
                }
            }

            if !activeSourceAnnotations.isEmpty || !recentlyResolvedSourceAnnotations.isEmpty {
                VStack(alignment: .leading, spacing: 9) {
                    Label("Research cues", systemImage: "text.quote")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.indigo)
                    Text("The same source-linked evidence and review state as Nest")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    ForEach(activeSourceAnnotations.prefix(4)) { annotation in
                        researchAnnotationCard(annotation)
                    }

                    if !recentlyResolvedSourceAnnotations.isEmpty {
                        Label("Recently resolved", systemImage: "checkmark.circle")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.secondary)
                            .padding(.top, 2)
                        ForEach(recentlyResolvedSourceAnnotations.prefix(2)) { annotation in
                            researchAnnotationCard(annotation)
                        }
                    }

                    if let url = researchURL(),
                       activeSourceAnnotations.count > 4 || recentlyResolvedSourceAnnotations.count > 2 {
                        Link(destination: url) {
                            Label("See all research in Nest", systemImage: "arrow.up.right.square")
                                .font(.caption.weight(.bold))
                                .frame(minHeight: 44)
                        }
                        .accessibilityHint("Opens the complete permission-filtered Research library in Nest.")
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Research cues")
                .accessibilityIdentifier("CaptureTodayResearchCues")
            }

            if !inboxClient.sources.isEmpty
                || inboxClient.pendingCount > 0
                || inboxClient.heldCount > 0
                || inboxClient.statusMessage != nil {
                VStack(alignment: .leading, spacing: 9) {
                    HStack(alignment: .firstTextBaseline) {
                        Label("Private source Inbox", systemImage: "tray.full")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.cyan)
                        Spacer()
                        if inboxClient.isLoading || inboxClient.isSyncing {
                            ProgressView().controlSize(.small)
                        }
                    }
                    Text("Review captured passages and links, then deliberately preserve one in a writable Research Nest.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    if inboxClient.isUsingProtectedCache {
                        Label(
                            "Protected offline snapshot · filing choices can queue safely",
                            systemImage: "lock.iphone"
                        )
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("CaptureSourceInboxProtectedSnapshot")
                    }

                    ForEach(inboxClient.sources.prefix(3)) { source in
                        let pending = inboxClient.pendingDecision(for: source.id)
                        VStack(alignment: .leading, spacing: 7) {
                            HStack(alignment: .top, spacing: 9) {
                                Image(
                                    systemName: source.captureType == .snippet
                                        ? "quote.opening"
                                        : "link"
                                )
                                .foregroundStyle(.cyan)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(source.title)
                                        .font(.subheadline.weight(.semibold))
                                    Text(source.excerpt)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                        .lineLimit(4)
                                    if source.captureCount > 1 {
                                        Text("Captured \(source.captureCount) times · one private identity")
                                            .font(.caption2.weight(.semibold))
                                            .foregroundStyle(.secondary)
                                    }
                                }
                                Spacer(minLength: 0)
                            }

                            if let pending {
                                Label(
                                    pending.disposition == .held
                                        ? "Phone filing needs review"
                                        : "Protected filing queued for \(pending.projectName)",
                                    systemImage: pending.disposition == .held
                                        ? "exclamationmark.triangle.fill"
                                        : "arrow.triangle.2.circlepath"
                                )
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(
                                    pending.disposition == .held ? Color.orange : Color.blue
                                )
                                .accessibilityIdentifier(
                                    "CaptureSourceInboxPending_\(source.id)"
                                )
                                .accessibilityValue(
                                    pending.disposition == .held ? "Held" : "Queued"
                                )
                                if pending.disposition == .held {
                                    Button("Discard phone filing") {
                                        Task {
                                            await inboxClient.discardHeldFiling(
                                                for: source.id
                                            )
                                        }
                                    }
                                    .font(.caption.weight(.bold))
                                    .buttonStyle(.bordered)
                                    .accessibilityIdentifier(
                                        "CaptureSourceInboxDiscard_\(source.id)"
                                    )
                                }
                            } else {
                                Button {
                                    sourceToFile = source
                                } label: {
                                    Label(
                                        previewOnly ? "Explore filing" : "Choose Research Nest",
                                        systemImage: "folder.badge.plus"
                                    )
                                    .frame(minHeight: 44)
                                }
                                .buttonStyle(.bordered)
                                .disabled(
                                    inboxClient.destinations.isEmpty
                                        || inboxClient.isSyncing
                                )
                                .accessibilityIdentifier(
                                    "CaptureSourceInboxFile_\(source.id)"
                                )
                                .accessibilityHint(
                                    "Protects this decision on the iPhone before creating an immutable Research source. The private capture stays unchanged."
                                )
                            }
                        }
                        .padding(12)
                        .background(
                            Color.cyan.opacity(0.07),
                            in: RoundedRectangle(cornerRadius: 14)
                        )
                        .accessibilityElement(children: .contain)
                        .accessibilityIdentifier("CaptureSourceInboxItem_\(source.id)")
                    }

                    if inboxClient.destinations.isEmpty, !inboxClient.sources.isEmpty {
                        Text("Editor access to a Nest is required before filing private evidence into Research.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    if inboxClient.heldCount > 0 {
                        Button {
                            Task { await inboxClient.retryHeldFilings() }
                        } label: {
                            Label("Retry held filings", systemImage: "arrow.clockwise")
                                .frame(minHeight: 44)
                        }
                        .buttonStyle(.bordered)
                        .disabled(
                            previewOnly
                                || !AuthManager.shared.networkActionsAllowed
                                || inboxClient.isSyncing
                        )
                        .accessibilityIdentifier("CaptureSourceInboxRetryHeld")
                    }
                    if let message = inboxClient.statusMessage {
                        Label(message, systemImage: "checkmark.shield")
                            .font(.caption2.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("CaptureSourceInboxStatus")
                    }
                    if let url = inboxClient.lastFiledURL {
                        Link(destination: url) {
                            Label("Open filed evidence in Nest", systemImage: "arrow.up.right.square")
                                .font(.caption.weight(.bold))
                                .frame(minHeight: 44)
                        }
                        .accessibilityIdentifier("CaptureSourceInboxFiledLink")
                    } else if let url = sourceInboxURL(),
                              inboxClient.sources.count > 3 {
                        Link(destination: url) {
                            Label("Review all private sources in Nest", systemImage: "arrow.up.right.square")
                                .font(.caption.weight(.bold))
                                .frame(minHeight: 44)
                        }
                    }
                    if let error = inboxClient.errorMessage {
                        Label(
                            error,
                            systemImage: inboxClient.isUsingProtectedCache
                                ? "lock.shield"
                                : "exclamationmark.triangle"
                        )
                        .font(.caption2)
                        .foregroundStyle(
                            inboxClient.isUsingProtectedCache ? Color.secondary : Color.orange
                        )
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Private source Inbox")
                .accessibilityIdentifier("CaptureSourceInbox")
            }

            if let weekly = client.weeklyPlan {
                VStack(alignment: .leading, spacing: 7) {
                    Label("This week", systemImage: "calendar.badge.checkmark")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.green)
                    ForEach(Array(weekly.commitments.prefix(3).enumerated()), id: \.offset) { index, commitment in
                        Text("\(index + 1). \(commitment)")
                            .font(.subheadline)
                    }
                    if let support = weekly.supportNeeded, !support.isEmpty {
                        Text("Support: \(support)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            if client.tasks.isEmpty, client.goals.isEmpty, client.focusBlocks.isEmpty, client.transcriptReviews.isEmpty, client.sourceAnnotations.isEmpty, inboxClient.sources.isEmpty, client.weeklyPlan == nil, !client.isLoading, !inboxClient.isLoading {
                Text("No committed follow-through is available yet. Add a task, goal, focus block, weekly plan, or source annotation in Nest; Today will use the same canonical record.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("CaptureTodayFollowThroughEmpty")
            }

            if let error = client.errorMessage {
                Label(error, systemImage: client.isUsingProtectedCache ? "lock.shield" : "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(client.isUsingProtectedCache ? Color.secondary : Color.orange)
            }

            Text("Task and goal tag selections, source-filing choices, source-to-writing handoffs, and one-time reminder changes are protected on this iPhone before Nest sync. Filing creates immutable Research evidence while leaving the private Inbox capture unchanged. A writing handoff creates a private draft with a durable citation and never changes the source. Tags stay inside their Nest; iOS controls reminder delivery and Quipsly never claims it in advance. Goal check-ins record progress without changing goal status. Recurring-task completion, an explicit missed-occurrence skip, and series controls change only canonical Quipsly work; they preserve history and do not schedule reminders or provider events. Focus completion never completes its task or goal. Annotation review never changes preserved source text. Transcript proposals stay non-authoritative until exact-source playback review. Today does not change calendars, providers, or recording state.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("CaptureTodayFollowThroughBoundary")
        }
        .captureCard()
        .sheet(item: $sourceToFile) { source in
            CaptureSourceFilingSheet(
                client: inboxClient,
                source: source,
                previewOnly: previewOnly
            )
            .presentationDetents([.medium, .large])
        }
        .navigationDestination(for: TranscriptSourceDestination.self) { destination in
            CaptureTranscriptReviewView(
                roomID: destination.roomID,
                sessionTitle: destination.sessionTitle,
                recording: matchingRecording(roomID: destination.roomID, recordingAssetID: destination.source.recordingAssetId),
                previewOnly: previewOnly,
                focusSegmentID: destination.source.segmentId
            )
        }
        .confirmationDialog(
            "Cancel this task reminder?",
            isPresented: Binding(
                get: { reminderToCancel != nil },
                set: { if !$0 { reminderToCancel = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let task = reminderToCancel {
                Button("Cancel reminder", role: .destructive) {
                    reminderToCancel = nil
                    Task { _ = await client.setTaskReminder(task, remindAt: nil) }
                }
            }
            Button("Keep reminder", role: .cancel) { reminderToCancel = nil }
        } message: {
            Text("The pending alert is removed from this iPhone first. Nest cancellation is queued safely if you are offline; no delivery is claimed.")
        }
        .confirmationDialog(
            "End this repeat permanently?",
            isPresented: Binding(
                get: { recurrenceToEnd != nil },
                set: { if !$0 { recurrenceToEnd = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let recurrence = recurrenceToEnd {
                Button("End repeat", role: .destructive) {
                    recurrenceToEnd = nil
                    Task { _ = await client.setRecurrenceStatus(recurrence, status: "ENDED") }
                }
            }
            Button("Keep repeat", role: .cancel) { recurrenceToEnd = nil }
        } message: {
            Text("Existing task occurrences remain in Quipsly. No reminder or provider calendar event will be changed.")
        }
        .confirmationDialog(
            "Skip this missed occurrence?",
            isPresented: Binding(
                get: { missedOccurrenceToSkip != nil },
                set: { if !$0 { missedOccurrenceToSkip = nil } }
            ),
            titleVisibility: .visible
        ) {
            if let task = missedOccurrenceToSkip {
                Button("Preserve as skipped", role: .destructive) {
                    missedOccurrenceToSkip = nil
                    Task {
                        _ = await client.setTaskStatus(
                            task,
                            status: "CANCELED",
                            decisionReason: "MISSED_OCCURRENCE_SKIPPED"
                        )
                    }
                }
            }
            Button("Keep it open", role: .cancel) { missedOccurrenceToSkip = nil }
        } message: {
            Text("Quipsly will retain the overdue task and occurrence as skipped, then continue the canonical series. It will not create a reminder or provider calendar event, send a message, deliver, or publish.")
        }
        .sheet(item: $recurrenceToEdit) { task in
            CaptureRecurrenceEditSheet(client: client, task: task)
        }
        .sheet(item: $taskToEdit) { task in
            CaptureTaskEditSheet(client: client, task: task)
        }
        .sheet(item: $goalToEdit) { goal in
            CaptureGoalEditSheet(client: client, goal: goal)
        }
        .sheet(item: $reminderToEdit) { task in
            TodayTaskReminderSheet(client: client, task: task)
        }
        .sheet(item: $taskTagsToEdit) { task in
            if let project = task.project {
                TodayWorkTagSheet(
                    client: client,
                    kind: .task,
                    entityID: task.id,
                    entityTitle: task.title,
                    project: project,
                    canonicalTagIDs: task.tagIds ?? [],
                    expectedUpdatedAt: task.updatedAt
                )
            }
        }
        .sheet(item: $goalTagsToEdit) { goal in
            if let project = goal.project {
                TodayWorkTagSheet(
                    client: client,
                    kind: .goal,
                    entityID: goal.id,
                    entityTitle: goal.title,
                    project: project,
                    canonicalTagIDs: goal.tagIds ?? [],
                    expectedUpdatedAt: goal.updatedAt
                )
            }
        }
    }

    @ViewBuilder
    private func researchAnnotationCard(_ annotation: MobileCaptureTodaySourceAnnotation) -> some View {
        VStack(alignment: .leading, spacing: 7) {
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(annotation.sourceTitle)
                    .font(.subheadline.weight(.semibold))
                Spacer(minLength: 8)
                Text(annotation.kind.capitalized)
                    .font(.caption2.weight(.bold))
                    .foregroundStyle(.indigo)
            }
            if let quote = annotation.exactText, !quote.isEmpty {
                Text("“\(quote)”")
                    .font(.caption)
                    .italic()
                    .lineLimit(4)
                    .foregroundStyle(.secondary)
            }
            if !annotation.body.isEmpty {
                Text(annotation.body)
                    .font(.subheadline)
                    .lineLimit(4)
            }
            if !annotation.tagLabels.isEmpty {
                TodayProjectTagLine(
                    project: nil,
                    tagLabels: annotation.tagLabels,
                    identifier: "CaptureTodayAnnotationTags_\(annotation.id)"
                )
            }
            HStack(alignment: .center, spacing: 8) {
                Text(annotation.visibility == "private" ? "Only me" : annotation.projectName)
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(.secondary)
                Spacer(minLength: 4)
                if let url = researchURL(for: annotation), !previewOnly {
                    Link(destination: url) {
                        Label("Source", systemImage: "doc.text.magnifyingglass")
                            .font(.caption.weight(.bold))
                            .frame(minHeight: 44)
                    }
                    .accessibilityIdentifier("CaptureTodayAnnotationSource_\(annotation.id)")
                    .accessibilityHint("Opens this exact annotation against its immutable source in Nest.")
                }
                if annotation.canChangeStatus == true {
                    let isResolved = annotation.status.lowercased() == "resolved"
                    Button(isResolved ? "Reopen" : "Resolve") {
                        Task {
                            _ = await client.setSourceAnnotationStatus(
                                annotation,
                                status: isResolved ? "active" : "resolved"
                            )
                        }
                    }
                    .font(.caption.weight(.bold))
                    .buttonStyle(.bordered)
                    .disabled(decisionsDisabled)
                    .accessibilityIdentifier("CaptureTodayAnnotationDecision_\(annotation.id)")
                    .accessibilityHint(
                        isResolved
                            ? "Reopens this same source-linked annotation without changing its preserved source."
                            : "Resolves only this source-linked annotation. Its preserved source is not changed."
                    )
                }
            }
            if let pending = client.pendingWritingDraftDecision(for: annotation.id) {
                Label(
                    pending.disposition == .held
                        ? "Writing handoff needs review"
                        : "Private draft queued for Nest",
                    systemImage: pending.disposition == .held
                        ? "exclamationmark.triangle.fill"
                        : "lock.doc.fill"
                )
                .font(.caption2.weight(.semibold))
                .foregroundStyle(pending.disposition == .held ? Color.orange : Color.indigo)
                .accessibilityIdentifier("CaptureTodayAnnotationDraftPending_\(annotation.id)")
                .accessibilityValue(pending.disposition == .held ? "Held" : "Queued")

                if pending.disposition == .held {
                    HStack(spacing: 8) {
                        Button("Retry draft") {
                            Task {
                                _ = await client.retryWritingDraft(for: annotation.id)
                            }
                        }
                        .font(.caption.weight(.bold))
                        .buttonStyle(.borderedProminent)
                        .disabled(previewOnly || client.isMutating)
                        .accessibilityIdentifier("CaptureTodayAnnotationDraftRetry_\(annotation.id)")

                        Button("Discard", role: .destructive) {
                            Task {
                                await client.discardHeldWritingDraft(for: annotation.id)
                            }
                        }
                        .font(.caption.weight(.bold))
                        .buttonStyle(.bordered)
                        .disabled(previewOnly || client.isMutating)
                        .accessibilityIdentifier("CaptureTodayAnnotationDraftDiscard_\(annotation.id)")
                    }
                }
            } else if let draftURL = client.writingDraftURL(for: annotation), !previewOnly {
                Link(destination: draftURL) {
                    Label("Open private draft", systemImage: "square.and.pencil")
                        .font(.caption.weight(.bold))
                        .frame(minHeight: 44)
                }
                .accessibilityIdentifier("CaptureTodayAnnotationDraftOpen_\(annotation.id)")
                .accessibilityHint("Opens your private canonical draft with its source citation intact.")
            } else if annotation.canStartWriting == true {
                Button {
                    Task {
                        _ = await client.startWritingDraft(from: annotation)
                    }
                } label: {
                    Label("Start private draft", systemImage: "square.and.pencil")
                        .font(.caption.weight(.bold))
                        .frame(minHeight: 44)
                }
                .buttonStyle(.borderedProminent)
                .disabled(previewOnly || client.isMutating)
                .accessibilityIdentifier("CaptureTodayAnnotationDraftStart_\(annotation.id)")
                .accessibilityHint("Protects this exact writing decision on the iPhone, then creates a private Nest draft with a durable citation.")
            }
        }
        .padding(10)
        .background(
            annotation.status.lowercased() == "resolved"
                ? Color.secondary.opacity(0.07)
                : Color.indigo.opacity(0.07),
            in: RoundedRectangle(cornerRadius: 12, style: .continuous)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTodayAnnotation_\(annotation.id)")
    }

    private func researchURL(for annotation: MobileCaptureTodaySourceAnnotation? = nil) -> URL? {
        let baseURL = normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
                ?? "https://nest.quipsly.com"
        )
        guard var components = URLComponents(string: baseURL) else { return nil }
        components.path = "/research"
        components.queryItems = annotation.map {
            [URLQueryItem(name: "annotation", value: $0.id)]
        }
        return components.url
    }

    private func sourceInboxURL() -> URL? {
        let baseURL = normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
                ?? "https://nest.quipsly.com"
        )
        return URL(string: "\(baseURL)/inbox")
    }

    private func recurrenceSummary(_ recurrence: MobileCaptureTodayRecurrence) -> String {
        let unit: String = switch recurrence.frequency {
        case "DAILY": "day"
        case "MONTHLY": "month"
        default: "week"
        }
        let frequency = recurrence.interval == 1 ? "Every \(unit)" : "Every \(recurrence.interval) \(unit)s"
        let hour = max(0, min(23, recurrence.localTimeMinutes / 60))
        let minute = max(0, min(59, recurrence.localTimeMinutes % 60))
        let cadence = recurrence.cadence == "COMPLETION" ? "after completion" : "fixed schedule"
        return "\(frequency) at \(String(format: "%02d:%02d", hour, minute)) · \(cadence) · \(recurrence.timezone)"
    }

    private func reminderTime(_ reminder: MobileCaptureTodayReminderIntent) -> String {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let date = fractional.date(from: reminder.remindAt)
                ?? ISO8601DateFormatter().date(from: reminder.remindAt) else {
            return "needs review"
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private func matchingRecording(for review: MobileCaptureTodayTranscriptReview) -> LocalRecording? {
        matchingRecording(roomID: review.roomId, recordingAssetID: review.recordingAssetId)
    }

    private func matchingRecording(roomID: String, recordingAssetID: String?) -> LocalRecording? {
        guard let expectedAssetID = recordingAssetID?.nonempty else { return nil }
        return library.recordings.first {
            $0.callRoomId == roomID
                && $0.recordingAssetId == expectedAssetID
                && $0.status.isPlaybackEligible
                && library.fileURL(for: $0) != nil
        }
    }

    private func focusWindow(_ focus: MobileCaptureTodayFocusBlock) -> String {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        guard let start = fractional.date(from: focus.startsAt) ?? ISO8601DateFormatter().date(from: focus.startsAt),
              let end = fractional.date(from: focus.endsAt) ?? ISO8601DateFormatter().date(from: focus.endsAt) else {
            return "Time needs review · \(focus.timezone)"
        }
        return "\(start.formatted(date: .abbreviated, time: .shortened))–\(end.formatted(date: .omitted, time: .shortened)) · \(focus.timezone)"
    }
}

private struct CaptureTagVocabularySheet: View {
    private enum FocusedField: Hashable {
        case create
        case rename
    }

    @ObservedObject var client: CaptureWorkClient
    let project: MobileCaptureWorkProject
    let tags: [MobileCaptureWorkTag]
    let readOnly: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""
    @State private var showsRetired = false
    @State private var createLabel = ""
    @State private var renameTagID: String?
    @State private var renameLabel = ""
    @State private var archiveCandidate: MobileCaptureWorkTag?
    @State private var showsArchiveConfirmation = false
    @FocusState private var focusedField: FocusedField?

    private var visibleTags: [MobileCaptureWorkTag] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return tags
            .filter { $0.isActive != showsRetired }
            .filter { tag in
                guard !query.isEmpty else { return true }
                return tag.label.localizedCaseInsensitiveContains(query)
                    || tag.slug.localizedCaseInsensitiveContains(query)
                    || (tag.aliases ?? []).contains {
                        $0.label.localizedCaseInsensitiveContains(query)
                            || $0.slug.localizedCaseInsensitiveContains(query)
                    }
            }
            .sorted {
                $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending
            }
    }

    private var mutationsDisabled: Bool {
        readOnly || client.isMutatingTagVocabulary
    }

    private var normalizedCreateLabel: String {
        createLabel
            .precomposedStringWithCompatibilityMapping
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(
                of: #"^#+\s*"#,
                with: "",
                options: .regularExpression
            )
            .replacingOccurrences(
                of: #"\s+"#,
                with: " ",
                options: .regularExpression
            )
    }

    private var matchingCreateTag: MobileCaptureWorkTag? {
        guard !normalizedCreateLabel.isEmpty else { return nil }
        return tags.first { tag in
            tag.label.localizedCaseInsensitiveCompare(normalizedCreateLabel) == .orderedSame
                || (tag.aliases ?? []).contains {
                    $0.label.localizedCaseInsensitiveCompare(normalizedCreateLabel) == .orderedSame
                }
        }
    }

    private var createDisabled: Bool {
        mutationsDisabled
            || normalizedCreateLabel.isEmpty
            || normalizedCreateLabel.utf16.count > 80
            || matchingCreateTag?.isActive == false
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Text("Tags are one shared vocabulary for \(project.name). Rename keeps the old name as an alias. Archive removes a tag from new choices while preserving every existing assignment.")
                        .font(.subheadline)
                    Label(
                        readOnly
                            ? "Read-only here. Reconnect to Nest with editor access to make changes."
                            : "Vocabulary changes are verified live and never queued offline.",
                        systemImage: readOnly ? "lock.fill" : "checkmark.shield.fill"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(readOnly ? .orange : .secondary)
                }

                if let message = client.tagVocabularyMessage {
                    Section {
                        Text(message)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("CaptureTagVocabularyStatus")
                    }
                }

                if !showsRetired {
                    Section {
                        TextField("e.g. Recording day", text: $createLabel)
                            .textInputAutocapitalization(.sentences)
                            .autocorrectionDisabled(false)
                            .focused($focusedField, equals: .create)
                            .accessibilityLabel("New canonical tag")
                            .accessibilityIdentifier("CaptureTagVocabularyCreateField")
                        if let matchingCreateTag {
                            Label(
                                matchingCreateTag.isActive
                                    ? "Existing #\(matchingCreateTag.label) will be reused—no duplicate."
                                    : "#\(matchingCreateTag.label) is retired. Restore it instead of creating a duplicate.",
                                systemImage: matchingCreateTag.isActive
                                    ? "arrow.triangle.2.circlepath"
                                    : "archivebox"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(matchingCreateTag.isActive ? .blue : .orange)
                        } else if !normalizedCreateLabel.isEmpty {
                            Text("#\(normalizedCreateLabel) will join this Nest’s private vocabulary without being attached to a record.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if normalizedCreateLabel.utf16.count > 80 {
                            Label(
                                "Keep reusable tag names to 80 characters.",
                                systemImage: "exclamationmark.triangle.fill"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                        }
                        Button {
                            let requestedLabel = normalizedCreateLabel
                            focusedField = nil
                            Task {
                                if await client.createTagVocabulary(
                                    projectID: project.id,
                                    label: requestedLabel
                                ) {
                                    createLabel = ""
                                }
                            }
                        } label: {
                            Label(
                                matchingCreateTag == nil
                                    ? "Create canonical tag"
                                    : "Reuse canonical tag",
                                systemImage: matchingCreateTag == nil
                                    ? "plus.circle.fill"
                                    : "arrow.triangle.2.circlepath"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(createDisabled)
                        .accessibilityIdentifier("CaptureTagVocabularyCreate")
                    } header: {
                        Text("Build this vocabulary")
                    } footer: {
                        Text("Creation is verified live, recorded in tag history, and never queued offline. It creates no Task, Goal, Note, assignment, calendar event, message, or publication.")
                    }
                }

                Section {
                    Picker("Vocabulary", selection: $showsRetired) {
                        Text("Active").tag(false)
                        Text("Retired").tag(true)
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("CaptureTagVocabularyScope")
                }

                Section(showsRetired ? "Retired and redirects" : "Active tags") {
                    if visibleTags.isEmpty {
                        ContentUnavailableView(
                            showsRetired ? "No retired tags" : "No matching tags",
                            systemImage: "tag",
                            description: Text(
                                showsRetired
                                    ? "Archived names and merge redirects will remain visible here."
                                    : "Create the first canonical tag above, then assign it wherever the work belongs."
                            )
                        )
                    } else {
                        ForEach(visibleTags) { tag in
                            tagRow(tag)
                        }
                    }
                }

                Section("Higher-impact cleanup") {
                    Text("Merging tags rewrites multiple assignments and keeps a rollback receipt. Use Nest’s vocabulary manager for merge review and history.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let url = nestVocabularyURL {
                        Link(destination: url) {
                            Label("Open vocabulary manager in Nest", systemImage: "arrow.up.right.square")
                        }
                        .accessibilityIdentifier("CaptureTagVocabularyOpenNestDetails")
                    }
                }
            }
            .searchable(text: $searchText, prompt: "Name, alias, or slug")
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Tag vocabulary")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    if let url = nestVocabularyURL {
                        Link(destination: url) {
                            Image(systemName: "arrow.up.right.square")
                        }
                        .accessibilityLabel("Open Nest merge and tag history")
                        .accessibilityIdentifier("CaptureTagVocabularyOpenNest")
                    }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Done") { dismiss() }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        focusedField = nil
                    }
                    .accessibilityIdentifier("CaptureTagVocabularyKeyboardDone")
                }
            }
            .confirmationDialog(
                "Archive this tag?",
                isPresented: $showsArchiveConfirmation,
                presenting: archiveCandidate
            ) { tag in
                Button("Archive #\(tag.label)", role: .destructive) {
                    Task {
                        _ = await client.changeTagVocabulary(tag: tag, operation: "ARCHIVE")
                    }
                }
                Button("Cancel", role: .cancel) {}
            } message: { tag in
                Text("It will disappear from new choices. Its \(tag.usageCount) existing assignment\(tag.usageCount == 1 ? "" : "s") and history stay intact.")
            }
        }
        .accessibilityIdentifier("CaptureTagVocabularySheet")
    }

    @ViewBuilder
    private func tagRow(_ tag: MobileCaptureWorkTag) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(alignment: .firstTextBaseline, spacing: 10) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("#\(tag.label)")
                        .font(.body.weight(.semibold))
                    Text("\(tag.usageCount) assignment\(tag.usageCount == 1 ? "" : "s") · \(tag.slug)")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                if let redirect = tag.mergedInto {
                    Text("→ #\(redirect.label)")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                } else if tag.isActive {
                    Menu {
                        Button {
                            renameTagID = tag.id
                            renameLabel = tag.label
                            Task {
                                await Task.yield()
                                focusedField = .rename
                            }
                        } label: {
                            Label("Rename", systemImage: "pencil")
                        }
                        Button(role: .destructive) {
                            archiveCandidate = tag
                            showsArchiveConfirmation = true
                        } label: {
                            Label("Archive", systemImage: "archivebox")
                        }
                    } label: {
                        Image(systemName: "ellipsis.circle")
                            .frame(minWidth: 44, minHeight: 44)
                    }
                    .disabled(mutationsDisabled)
                    .accessibilityLabel("Manage #\(tag.label)")
                    .accessibilityIdentifier("CaptureTagVocabularyManage_\(tag.id)")
                } else {
                    Button("Restore") {
                        Task {
                            _ = await client.changeTagVocabulary(tag: tag, operation: "RESTORE")
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(mutationsDisabled)
                    .accessibilityIdentifier("CaptureTagVocabularyRestore_\(tag.id)")
                }
            }

            if let aliases = tag.aliases, !aliases.isEmpty {
                Text("Also matches " + aliases.map { "#\($0.label)" }.joined(separator: ", "))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("CaptureTagVocabularyAliases_\(tag.id)")
            }

            if renameTagID == tag.id {
                VStack(alignment: .leading, spacing: 8) {
                    TextField("Canonical tag name", text: $renameLabel)
                        .textInputAutocapitalization(.sentences)
                        .autocorrectionDisabled(false)
                        .focused($focusedField, equals: .rename)
                        .accessibilityIdentifier("CaptureTagVocabularyRenameField")
                    HStack {
                        Button("Cancel") {
                            focusedField = nil
                            renameTagID = nil
                            renameLabel = ""
                        }
                        Spacer()
                        Button("Keep old name and rename") {
                            let requestedLabel = renameLabel
                            focusedField = nil
                            renameTagID = nil
                            renameLabel = ""
                            Task {
                                _ = await client.changeTagVocabulary(
                                    tag: tag,
                                    operation: "RENAME",
                                    label: requestedLabel
                                )
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(
                            mutationsDisabled
                                || renameLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                                || renameLabel.trimmingCharacters(in: .whitespacesAndNewlines)
                                    .localizedCaseInsensitiveCompare(tag.label) == .orderedSame
                        )
                        .accessibilityIdentifier("CaptureTagVocabularyRenameSave")
                    }
                    Text("The old name remains searchable as an alias; no assignment IDs change.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(CapturePalette.accent.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
            }
        }
        .padding(.vertical, 4)
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureTagVocabularyTag_\(tag.id)")
    }

    private var nestVocabularyURL: URL? {
        let baseURL = normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
                ?? "https://nest.quipsly.com"
        )
        guard var components = URLComponents(string: baseURL) else { return nil }
        components.path = "/work"
        components.queryItems = [
            URLQueryItem(name: "project", value: project.id),
            URLQueryItem(name: "manage", value: "tags"),
        ]
        return components.url
    }
}

private struct CaptureSourceFilingSheet: View {
    @ObservedObject var client: CaptureSourceInboxClient
    let source: MobileSourceInboxSource
    let previewOnly: Bool

    @Environment(\.dismiss) private var dismiss
    @State private var selectedDestinationID: String
    @State private var annotationKind = "note"
    @State private var annotationVisibility = "private"
    @State private var annotationBody = ""
    @State private var selectedTagIDs: Set<String> = []
    @State private var localMessage: String?
    @FocusState private var annotationBodyIsFocused: Bool

    init(
        client: CaptureSourceInboxClient,
        source: MobileSourceInboxSource,
        previewOnly: Bool
    ) {
        self.client = client
        self.source = source
        self.previewOnly = previewOnly
        _selectedDestinationID = State(
            initialValue: client.destinations.first?.id ?? ""
        )
    }

    private var selectedDestination: MobileSourceInboxDestination? {
        client.destinations.first { $0.id == selectedDestinationID }
    }

    private var availableTags: [MobileSourceInboxTag] {
        client.tags(for: selectedDestinationID)
    }

    private var hasAnnotation: Bool {
        !annotationBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            || !selectedTagIDs.isEmpty
    }

    private func tagBinding(_ id: String) -> Binding<Bool> {
        Binding(
            get: { selectedTagIDs.contains(id) },
            set: { selected in
                if selected {
                    selectedTagIDs.insert(id)
                } else {
                    selectedTagIDs.remove(id)
                }
            }
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Private source") {
                    LabeledContent(
                        "Type",
                        value: source.captureType == .snippet ? "Passage" : "Link"
                    )
                    Text(source.title)
                        .font(.headline)
                    Text(source.excerpt)
                        .font(source.captureType == .snippet ? .body : .caption)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                    if source.captureCount > 1 {
                        LabeledContent(
                            "Capture history",
                            value: "\(source.captureCount) captures · one identity"
                        )
                    }
                }

                Section("Research Nest") {
                    if client.destinations.isEmpty {
                        Text("Editor access to a Nest is required before this source can become shared Research evidence.")
                            .foregroundStyle(.secondary)
                    } else {
                        Picker("Destination", selection: $selectedDestinationID) {
                            ForEach(client.destinations) { destination in
                                Text(destination.name).tag(destination.id)
                            }
                        }
                        .accessibilityIdentifier("CaptureSourceFilingDestination")
                    }
                }

                if client.supportsSourceAnnotation {
                    Section("Optional source annotation") {
                        Text("Add your thought and existing Nest tags now. The annotation is anchored to the complete preserved capture, not only this preview.")
                            .font(.caption)
                            .foregroundStyle(.secondary)

                        Picker("Purpose", selection: $annotationKind) {
                            Text("Note").tag("note")
                            Text("Question").tag("question")
                            Text("Quote").tag("quote")
                            Text("Claim").tag("claim")
                            Text("Idea").tag("idea")
                            Text("Action").tag("action")
                        }
                        .accessibilityIdentifier("CaptureSourceFilingAnnotationKind")

                        Picker("Who can see it", selection: $annotationVisibility) {
                            Text("Only me").tag("private")
                            Text("Nest collaborators").tag("project")
                        }
                        .accessibilityIdentifier("CaptureSourceFilingAnnotationVisibility")

                        TextField(
                            "Why this matters, what to verify, or how it could shape the work",
                            text: $annotationBody,
                            axis: .vertical
                        )
                        .lineLimit(3 ... 8)
                        .focused($annotationBodyIsFocused)
                        .accessibilityIdentifier("CaptureSourceFilingAnnotationBody")

                        if availableTags.isEmpty {
                            Text("This Nest has no active tags yet. File the source now, then create reusable vocabulary from Work or Nest.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(availableTags) { tag in
                                Toggle(tag.label, isOn: tagBinding(tag.id))
                                    .accessibilityIdentifier(
                                        "CaptureSourceFilingTag_\(tag.id)"
                                    )
                            }
                        }
                    }
                } else {
                    Section("Annotation") {
                        Text("This Nest version can file the source safely. Update Nest before attaching an iPhone annotation or canonical tags in the same protected decision.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }

                Section("What this does") {
                    Label(
                        "Creates one immutable, source-linked Research record",
                        systemImage: "checkmark.shield"
                    )
                    Label(
                        "Keeps the private Inbox capture unchanged",
                        systemImage: "lock"
                    )
                    Label(
                        source.captureType == .bookmark
                            ? "Saves the link as evidence; it does not claim the page was imported"
                            : "Preserves the captured passage and its source URL",
                        systemImage: "doc.text.magnifyingglass"
                    )
                    if hasAnnotation {
                        Label(
                            "Adds one exact-source annotation with canonical Nest tags",
                            systemImage: "tag"
                        )
                    }
                    Text("No task, calendar event, message, delivery, provider request, or publication is created.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if previewOnly {
                    Section {
                        Label(
                            "Preview only · no filing decision will be saved",
                            systemImage: "hammer.fill"
                        )
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("CaptureSourceFilingPreviewBoundary")
                    }
                }

                if let localMessage {
                    Section {
                        Text(localMessage)
                            .font(.caption)
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("CaptureSourceFilingMessage")
                    }
                }
            }
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("File into Research")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(
                        client.isSyncing
                            ? "Filing…"
                            : hasAnnotation
                                ? "File + annotate"
                                : "File"
                    ) {
                        guard let destination = selectedDestination else { return }
                        Task {
                            let accepted = await client.file(
                                source,
                                into: destination,
                                annotationKind: annotationKind,
                                annotationVisibility: annotationVisibility,
                                annotationBody: annotationBody,
                                annotationTagIDs: selectedTagIDs.sorted()
                            )
                            if accepted {
                                dismiss()
                            } else {
                                localMessage = client.errorMessage
                                    ?? "The protected filing decision needs review."
                            }
                        }
                    }
                    .disabled(
                        previewOnly
                            || selectedDestination == nil
                            || client.isSyncing
                            || client.pendingDecision(for: source.id) != nil
                    )
                    .accessibilityIdentifier("CaptureSourceFilingConfirm")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        annotationBodyIsFocused = false
                    }
                    .accessibilityIdentifier("CaptureSourceFilingKeyboardDone")
                }
            }
            .interactiveDismissDisabled(client.isSyncing)
            .onChange(of: selectedDestinationID) { _, newValue in
                let validTagIDs = Set(client.tags(for: newValue).map(\.id))
                selectedTagIDs.formIntersection(validTagIDs)
            }
        }
        .accessibilityIdentifier("CaptureSourceFilingSheet")
    }
}

private struct CaptureDocumentNoteEditSheet: View {
    @ObservedObject var client: CaptureWorkClient
    let note: MobileCaptureWorkNote
    let project: MobileCaptureWorkProject

    @Environment(\.dismiss) private var dismiss
    @FocusState private var focusedBlockID: String?
    @State private var title: String
    @State private var blocks: [MobileCaptureWorkNoteBlock]
    @State private var localMessage: String?

    init(
        client: CaptureWorkClient,
        note: MobileCaptureWorkNote,
        project: MobileCaptureWorkProject
    ) {
        self.client = client
        self.note = note
        self.project = project
        let protectedEdit = client.pendingDocumentNoteEdit(for: note.id)
        _title = State(initialValue: protectedEdit?.title ?? note.title)
        _blocks = State(initialValue: protectedEdit?.blocks.map {
            MobileCaptureWorkNoteBlock(
                id: $0.id,
                stableId: $0.stableId,
                order: $0.order,
                body: $0.body
            )
        } ?? note.blocks ?? [])
    }

    private var protectedEdit: PendingDocumentNoteEdit? {
        client.pendingDocumentNoteEdit(for: note.id)
    }

    private var normalizedTitle: String {
        title.split(whereSeparator: \.isWhitespace).joined(separator: " ")
    }

    private var normalizedBodies: [String] {
        blocks.map {
            $0.body
                .replacingOccurrences(of: "\r\n", with: "\n")
                .replacingOccurrences(of: "\r", with: "\n")
        }
    }

    private var validationMessage: String? {
        if normalizedTitle.isEmpty {
            return "Add a title before protecting this edit."
        }
        if normalizedTitle.count > 160 {
            return "Shorten the title to 160 characters. Quipsly will not truncate it."
        }
        if blocks.isEmpty {
            return "Refresh this note before editing its stable sections."
        }
        if Set(blocks.map(\.id)).count != blocks.count
            || Set(blocks.map(\.stableId)).count != blocks.count {
            return "The stable section identities need a refresh before this note can be edited."
        }
        if let oversized = blocks.first(where: { $0.body.count > 20_000 }) {
            return "Section \(oversized.order) is over 20,000 characters. Quipsly will not truncate it."
        }
        if normalizedBodies.reduce(0, { $0 + $1.count }) > 60_000 {
            return "This focused iPhone edit is over 60,000 characters. Continue the structured note in Nest."
        }
        if !blocks.contains(where: {
            !$0.body.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        }) {
            return "Keep at least one non-empty note section."
        }
        if normalizedTitle == note.title
            && normalizedBodies == (note.blocks ?? []).map(\.body) {
            return "Change the title or note before saving."
        }
        return nil
    }

    private var canSave: Bool {
        validationMessage == nil
            && !client.isSyncingDocumentNoteEdits
            && protectedEdit?.disposition != .pending
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    VStack(alignment: .leading, spacing: 6) {
                        Label(project.name, systemImage: project.isHomeNest ? "house.fill" : "square.grid.2x2.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(CapturePalette.accent)
                        Text("Edit the canonical note")
                            .font(.title2.weight(.bold))
                        Text(note.contentEditBoundary ?? "This updates the same private Nest document.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .accessibilityIdentifier("CaptureWorkNoteEditBoundary")
                    }

                    if let protectedEdit {
                        VStack(alignment: .leading, spacing: 6) {
                            Label(
                                protectedEdit.disposition == .held
                                    ? "Protected draft held for review"
                                    : "Protected draft waiting for Nest",
                                systemImage: protectedEdit.disposition == .held
                                    ? "exclamationmark.shield.fill"
                                    : "lock.iphone"
                            )
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.orange)
                            if let message = protectedEdit.lastErrorMessage {
                                Text(message)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .padding(12)
                        .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 14))
                        .accessibilityIdentifier("CaptureWorkNoteEditProtectedDraft")
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text("Title")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.secondary)
                        TextField("Note title", text: $title)
                            .textFieldStyle(.roundedBorder)
                            .accessibilityIdentifier("CaptureWorkNoteEditTitle")
                    }

                    ForEach(Array(blocks.enumerated()), id: \.element.id) { index, block in
                        VStack(alignment: .leading, spacing: 6) {
                            if blocks.count > 1 {
                                Text("Section \(index + 1)")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.secondary)
                            } else {
                                Text("Note")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.secondary)
                            }
                            TextEditor(text: Binding(
                                get: { blocks[index].body },
                                set: { nextBody in
                                    blocks[index] = MobileCaptureWorkNoteBlock(
                                        id: block.id,
                                        stableId: block.stableId,
                                        order: block.order,
                                        body: nextBody
                                    )
                                }
                            ))
                            .frame(minHeight: blocks.count == 1 ? 220 : 140)
                            .padding(8)
                            .background(.background, in: RoundedRectangle(cornerRadius: 12))
                            .overlay {
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(.primary.opacity(0.12))
                            }
                            .focused($focusedBlockID, equals: block.id)
                            .accessibilityIdentifier("CaptureWorkNoteEditBody_\(block.id)")
                            Text("\(block.body.count.formatted()) / 20,000 characters")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(block.body.count > 20_000 ? .orange : .secondary)
                        }
                    }

                    if let validationMessage {
                        Label(validationMessage, systemImage: "exclamationmark.triangle")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("CaptureWorkNoteEditValidation")
                    }

                    if let localMessage {
                        Text(localMessage)
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("CaptureWorkNoteEditMessage")
                    }

                    Button {
                        let saved = client.saveDocumentNoteEdit(
                            note: note,
                            projectID: project.id,
                            title: title,
                            blocks: blocks,
                            replacingHeld: protectedEdit?.disposition == .held
                        )
                        if saved {
                            dismiss()
                        } else {
                            localMessage = client.errorMessage
                                ?? "This note draft could not be protected."
                        }
                    } label: {
                        Label(
                            note.id.hasPrefix("preview-")
                                ? "Explore protected save"
                                : AuthManager.shared.networkActionsAllowed
                                    ? "Protect & sync note"
                                    : "Protect for later sync",
                            systemImage: "lock.shield"
                        )
                        .frame(maxWidth: .infinity)
                        .frame(minHeight: 50)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canSave)
                    .accessibilityIdentifier("CaptureWorkNoteEditSave")

                    if protectedEdit?.disposition == .held {
                        Button(role: .destructive) {
                            Task {
                                await client.discardDocumentNoteEdit(noteID: note.id)
                                dismiss()
                            }
                        } label: {
                            Label("Discard protected draft", systemImage: "trash")
                                .frame(maxWidth: .infinity)
                                .frame(minHeight: 48)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureWorkNoteEditDiscard")
                    }
                }
                .padding(18)
            }
            .background(CaptureCanvas())
            .navigationTitle("Project note")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedBlockID = nil }
                        .accessibilityIdentifier("CaptureWorkNoteEditKeyboardDone")
                }
            }
        }
        .accessibilityIdentifier("CaptureWorkNoteEditSheet")
    }
}

private struct TodayTaskReminderSheet: View {
    @ObservedObject var client: CaptureTodayClient
    let task: MobileCaptureTodayTask
    @Environment(\.dismiss) private var dismiss
    @State private var remindAt: Date

    init(client: CaptureTodayClient, task: MobileCaptureTodayTask) {
        self.client = client
        self.task = task
        let existing = task.reminder.flatMap { reminder -> Date? in
            let fractional = ISO8601DateFormatter()
            fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return fractional.date(from: reminder.remindAt)
                ?? ISO8601DateFormatter().date(from: reminder.remindAt)
        }
        let defaultTime = Calendar.current.date(
            bySettingHour: 9,
            minute: 0,
            second: 0,
            of: Date().addingTimeInterval(86_400)
        ) ?? Date().addingTimeInterval(86_400)
        _remindAt = State(initialValue: max(existing ?? defaultTime, Date().addingTimeInterval(60)))
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    Text(task.title)
                        .font(.headline)
                }
                Section("Remind me") {
                    DatePicker(
                        "Date and time",
                        selection: $remindAt,
                        in: Date().addingTimeInterval(60)...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    Text(TimeZone.current.identifier)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section {
                    Text("Saving protects this decision on the iPhone before syncing the canonical reminder to Nest. Quipsly asks for notification permission only after this explicit choice. iOS controls delivery.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle(task.reminder?.status == "ACTIVE" ? "Change reminder" : "Add reminder")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            if await client.setTaskReminder(task, remindAt: remindAt) {
                                dismiss()
                            }
                        }
                    }
                    .disabled(client.isMutating || remindAt <= Date())
                    .accessibilityIdentifier("CaptureTodayTaskReminderSave")
                }
            }
        }
        .presentationDetents([.medium, .large])
    }
}

private struct TodayWorkTagSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var client: CaptureTodayClient
    let kind: PendingWorkTagDecision.EntityKind
    let entityID: String
    let entityTitle: String
    let project: MobileCaptureTodayProject
    let canonicalTagIDs: [String]
    let expectedUpdatedAt: String
    let expectedTagRevision: Int?
    let readOnlyPreview: Bool
    let availableTags: [MobileCaptureTodayTag]?
    let onSaved: (() -> Void)?

    @State private var selectedTagIDs: Set<String>
    @State private var searchText = ""
    @State private var newTagLabel = ""

    init(
        client: CaptureTodayClient,
        kind: PendingWorkTagDecision.EntityKind,
        entityID: String,
        entityTitle: String,
        project: MobileCaptureTodayProject,
        canonicalTagIDs: [String],
        expectedUpdatedAt: String,
        expectedTagRevision: Int? = nil,
        readOnlyPreview: Bool = false,
        availableTags: [MobileCaptureTodayTag]? = nil,
        onSaved: (() -> Void)? = nil
    ) {
        self.client = client
        self.kind = kind
        self.entityID = entityID
        self.entityTitle = entityTitle
        self.project = project
        self.canonicalTagIDs = canonicalTagIDs
        self.expectedUpdatedAt = expectedUpdatedAt
        self.expectedTagRevision = expectedTagRevision
        self.readOnlyPreview = readOnlyPreview
        self.availableTags = availableTags
        self.onSaved = onSaved
        _selectedTagIDs = State(initialValue: Set(canonicalTagIDs))
    }

    private var tagCatalog: [MobileCaptureTodayTag] {
        (availableTags ?? client.tags(for: project.id))
            .filter { $0.projectId == project.id }
            .sorted {
                $0.label.localizedCaseInsensitiveCompare($1.label) == .orderedAscending
            }
    }

    private var visibleTags: [MobileCaptureTodayTag] {
        let tags = tagCatalog
        guard let query = searchText.nonempty else { return tags }
        return tags.filter {
            $0.label.localizedCaseInsensitiveContains(query)
                || $0.slug.localizedCaseInsensitiveContains(query)
        }
    }

    private var selectionChanged: Bool {
        selectedTagIDs != Set(canonicalTagIDs)
    }

    private var archivedSelection: [MobileCaptureTodayTag] {
        tagCatalog.filter {
            !$0.isActive && selectedTagIDs.contains($0.id)
        }
    }

    private var normalizedNewTagLabel: String {
        let compatible = newTagLabel.precomposedStringWithCompatibilityMapping
        let withoutControls = String(
            compatible.unicodeScalars.filter {
                !CharacterSet.controlCharacters.contains($0)
            }
        )
        let trimmed = withoutControls.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed
            .drop(while: { $0 == "#" })
            .drop(while: { $0.isWhitespace })
            .split(whereSeparator: \.isWhitespace)
            .joined(separator: " ")
    }

    private var newTagRequested: Bool {
        !newTagLabel.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var newTagError: String? {
        guard newTagRequested else { return nil }
        guard !normalizedNewTagLabel.isEmpty else { return "Enter a name after the #." }
        guard normalizedNewTagLabel.utf16.count <= 80 else { return "Keep reusable tag names to 80 characters." }
        guard selectedTagIDs.count < 24 else { return "Remove one selected tag before adding another." }
        return nil
    }

    private var matchingExistingTag: MobileCaptureTodayTag? {
        guard !normalizedNewTagLabel.isEmpty else { return nil }
        return tagCatalog.first {
            $0.isActive
                && canonicalNewTagLabel($0.label) == canonicalNewTagLabel(normalizedNewTagLabel)
        }
    }

    private func canonicalNewTagLabel(_ label: String) -> String {
        label
            .precomposedStringWithCompatibilityMapping
            .lowercased(with: Locale(identifier: "en_US_POSIX"))
    }

    private var saveDisabled: Bool {
        (!selectionChanged && !newTagRequested)
            || !archivedSelection.isEmpty
            || newTagError != nil
            || readOnlyPreview
            || client.isMutating
    }

    var body: some View {
        NavigationStack {
            List {
                if readOnlyPreview {
                    Section {
                        Label(
                            "Preview data · explore this editor, but Save stays off and no canonical tag can change.",
                            systemImage: "eye"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("CaptureWorkTagEditorPreviewBoundary")
                    }
                }
                Section {
                    VStack(alignment: .leading, spacing: 5) {
                        Text(entityTitle)
                            .font(.headline)
                        Label(project.name, systemImage: "bird")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }

                Section("Tags in this Nest") {
                    if visibleTags.isEmpty {
                        ContentUnavailableView(
                            searchText.isEmpty ? "No reusable tags yet" : "No matching tags",
                            systemImage: "tag.slash",
                            description: Text(searchText.isEmpty
                                ? "Create the first reusable label below."
                                : "Try another search.")
                        )
                    } else {
                        ForEach(visibleTags) { tag in
                            Button {
                                if selectedTagIDs.contains(tag.id) {
                                    selectedTagIDs.remove(tag.id)
                                } else if tag.isActive && selectedTagIDs.count < 24 {
                                    selectedTagIDs.insert(tag.id)
                                }
                            } label: {
                                HStack {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(tag.label)
                                            .foregroundStyle(.primary)
                                        if !tag.isActive {
                                            Text("Archived · remove to save another change")
                                                .font(.caption2)
                                                .foregroundStyle(.orange)
                                        }
                                    }
                                    Spacer()
                                    if selectedTagIDs.contains(tag.id) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(.blue)
                                    }
                                }
                                .frame(minHeight: 44)
                            }
                            .accessibilityIdentifier("CaptureTodayWorkTag_\(tag.id)")
                            .accessibilityValue(selectedTagIDs.contains(tag.id) ? "Selected" : "Not selected")
                            .accessibilityHint(tag.isActive ? "Active reusable Nest tag." : "Archived tag. It can be removed but not newly applied.")
                        }
                    }
                }

                Section("Create or reuse a tag") {
                    TextField("e.g. Recording day", text: $newTagLabel)
                        .textInputAutocapitalization(.sentences)
                        .accessibilityLabel("New reusable tag")
                        .accessibilityIdentifier("CaptureTodayWorkTagNewLabel")
                    if let matchingExistingTag {
                        Label(
                            "Existing #\(matchingExistingTag.label) will be reused—no duplicate.",
                            systemImage: "arrow.triangle.2.circlepath"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.blue)
                    } else if newTagRequested, newTagError == nil {
                        Text("#\(normalizedNewTagLabel) will be private to \(project.name) and selected on this record.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    if let newTagError {
                        Label(newTagError, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("CaptureTodayWorkTagNewLabelError")
                    }
                }

                Section {
                    if !archivedSelection.isEmpty {
                        Label(
                            "Remove archived selections before saving a new tag set.",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                    }
                    Text("This saves the complete tag selection in a protected phone outbox first, so it can survive a lost connection or relaunch. It changes only this Quipsly record—never a calendar, provider, message, delivery, or publication.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    Text("This iPhone can create or reuse one private label while saving the complete selection atomically. Rename, merge, archive, and restore the shared vocabulary in Nest, where impact and rollback receipts remain visible.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .searchable(text: $searchText, prompt: "Find a tag")
            .safeAreaInset(edge: .bottom) {
                Button {
                    saveSelection()
                } label: {
                    Label(
                        client.isMutating
                            ? "Saving…"
                            : newTagRequested ? "Save & add tag" : "Save changes",
                        systemImage: "checkmark.circle.fill"
                    )
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .controlSize(.large)
                .disabled(saveDisabled)
                .accessibilityIdentifier("CaptureTodayWorkTagsSave")
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(.ultraThinMaterial)
            }
            .navigationTitle("Edit tags")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
    }

    private func saveSelection() {
        let selection = selectedTagIDs.sorted()
        let newTagLabels = newTagRequested ? [normalizedNewTagLabel] : []
        Task {
            let saved = await client.setWorkTags(
                kind: kind,
                entityID: entityID,
                projectID: project.id,
                tagIDs: selection,
                newTagLabels: newTagLabels,
                expectedUpdatedAt: expectedUpdatedAt,
                expectedTagRevision: expectedTagRevision,
                availableTagIDs: Set(tagCatalog.filter(\.isActive).map(\.id))
            )
            if saved {
                dismiss()
                onSaved?()
            }
        }
    }
}

private func captureTaskDate(_ value: String?) -> Date? {
    guard let value else { return nil }
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
}

private func captureTaskDueLabel(_ task: MobileCaptureTodayTask) -> String? {
    guard let date = captureTaskDate(task.dueAt) else { return nil }
    let prefix = task.isOverdue == true ? "Overdue" : "Due"
    return "\(prefix) \(date.formatted(date: .abbreviated, time: .shortened))"
}

private func captureGoalTargetLabel(_ goal: MobileCaptureTodayGoal) -> String? {
    guard let date = captureTaskDate(goal.targetAt) else { return nil }
    return "Target \(date.formatted(date: .abbreviated, time: .omitted))"
}

private struct CaptureTaskEditSheet: View {
    @ObservedObject var client: CaptureTodayClient
    let task: MobileCaptureTodayTask
    var onSaved: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var detail: String
    @State private var includesDueDate: Bool
    @State private var dueAt: Date
    @State private var timezoneID: String

    init(
        client: CaptureTodayClient,
        task: MobileCaptureTodayTask,
        onSaved: (() -> Void)? = nil
    ) {
        self.client = client
        self.task = task
        self.onSaved = onSaved
        let existingDue = captureTaskDate(task.dueAt)
        let phoneTimezone = TimeZone.autoupdatingCurrent
        let defaultDue = Calendar.current.date(
            bySettingHour: 9,
            minute: 0,
            second: 0,
            of: Date().addingTimeInterval(86_400)
        ) ?? Date().addingTimeInterval(86_400)
        _title = State(initialValue: task.title)
        _detail = State(initialValue: task.detail ?? "")
        _includesDueDate = State(initialValue: existingDue != nil)
        _dueAt = State(initialValue: existingDue ?? defaultDue)
        _timezoneID = State(initialValue: phoneTimezone.identifier)
    }

    private var chosenTimeZone: TimeZone? {
        TimeZone(identifier: timezoneID.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private var canSave: Bool {
        task.recurrence == nil
            && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && chosenTimeZone != nil
            && !client.isMutating
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Task") {
                    TextField("Task title", text: $title, axis: .vertical)
                        .lineLimit(1...4)
                        .accessibilityIdentifier("CaptureTaskEditTitle")
                    TextField("Optional detail", text: $detail, axis: .vertical)
                        .lineLimit(2...8)
                        .accessibilityIdentifier("CaptureTaskEditDetail")
                }

                Section("Due date") {
                    Toggle("Set a due date", isOn: $includesDueDate)
                        .accessibilityIdentifier("CaptureTaskEditDueToggle")
                    if includesDueDate {
                        DatePicker(
                            "Due",
                            selection: $dueAt,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                        .environment(\.timeZone, chosenTimeZone ?? .autoupdatingCurrent)
                        .accessibilityIdentifier("CaptureTaskEditDueDate")
                    }

                    TextField("IANA timezone", text: $timezoneID)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("CaptureTaskEditTimezone")
                    Button("Use this iPhone’s timezone") {
                        timezoneID = TimeZone.autoupdatingCurrent.identifier
                    }
                    .accessibilityIdentifier("CaptureTaskEditUsePhoneTimezone")
                    Label(
                        chosenTimeZone == nil
                            ? "Enter a valid IANA timezone, such as America/Denver."
                            : "The due time will stay at this wall-clock time in \(chosenTimeZone?.identifier ?? timezoneID).",
                        systemImage: chosenTimeZone == nil ? "exclamationmark.triangle" : "globe.americas"
                    )
                    .font(.caption)
                    .foregroundStyle(chosenTimeZone == nil ? Color.orange : Color.secondary)
                }

                Section("Boundary") {
                    Text("This edits only the open one-time task in Quipsly. It does not change its tags, reminder, status, project, source anchor, goal links, provider calendar, messages, delivery, or publishing.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureTaskEditBoundary")
                    Text("Task editing requires Nest. Protected offline snapshots remain unchanged until you reconnect.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let error = client.errorMessage {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Edit task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.isMutating ? "Saving…" : "Save") {
                        Task {
                            let saved = await client.editTask(
                                task,
                                title: title,
                                detail: detail,
                                dueAt: includesDueDate ? dueAt : nil,
                                timezone: timezoneID.trimmingCharacters(in: .whitespacesAndNewlines)
                            )
                            if saved {
                                dismiss()
                                onSaved?()
                            }
                        }
                    }
                    .disabled(!canSave)
                    .accessibilityIdentifier("CaptureTaskEditSave")
                }
            }
        }
        .accessibilityIdentifier("CaptureTaskEditSheet")
    }
}

private struct CaptureGoalEditSheet: View {
    @ObservedObject var client: CaptureTodayClient
    let goal: MobileCaptureTodayGoal
    var onSaved: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var title: String
    @State private var description: String
    @State private var includesTargetDate: Bool
    @State private var targetAt: Date
    @State private var timezoneID: String
    private let originalTargetAt: Date?
    private let originalTimezoneID: String

    init(
        client: CaptureTodayClient,
        goal: MobileCaptureTodayGoal,
        onSaved: (() -> Void)? = nil
    ) {
        self.client = client
        self.goal = goal
        self.onSaved = onSaved
        let existingTarget = captureTaskDate(goal.targetAt)
        let phoneTimezone = TimeZone.autoupdatingCurrent
        let defaultTarget = Calendar.current.date(
            byAdding: .day,
            value: 30,
            to: Date()
        ) ?? Date().addingTimeInterval(30 * 86_400)
        _title = State(initialValue: goal.title)
        _description = State(initialValue: goal.description ?? "")
        _includesTargetDate = State(initialValue: existingTarget != nil)
        _targetAt = State(initialValue: existingTarget ?? defaultTarget)
        _timezoneID = State(initialValue: phoneTimezone.identifier)
        originalTargetAt = existingTarget
        originalTimezoneID = phoneTimezone.identifier
    }

    private var chosenTimeZone: TimeZone? {
        TimeZone(identifier: timezoneID.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private var canSave: Bool {
        (goal.status == "ACTIVE" || goal.status == "PAUSED")
            && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (targetDecision != "SET" || chosenTimeZone != nil)
            && !client.isMutating
    }

    private var targetDecision: String {
        guard includesTargetDate else {
            return originalTargetAt == nil ? "KEEP" : "CLEAR"
        }
        guard let originalTargetAt else { return "SET" }
        let normalizedTimezone = timezoneID.trimmingCharacters(in: .whitespacesAndNewlines)
        guard normalizedTimezone == originalTimezoneID,
              let timezone = TimeZone(identifier: originalTimezoneID) else {
            return "SET"
        }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timezone
        let original = calendar.dateComponents([.year, .month, .day], from: originalTargetAt)
        let requested = calendar.dateComponents([.year, .month, .day], from: targetAt)
        return original == requested ? "KEEP" : "SET"
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Goal") {
                    TextField("Goal title", text: $title, axis: .vertical)
                        .lineLimit(1...4)
                        .accessibilityIdentifier("CaptureGoalEditTitle")
                    TextField("Definition of success", text: $description, axis: .vertical)
                        .lineLimit(2...8)
                        .accessibilityIdentifier("CaptureGoalEditDescription")
                }

                Section("Target") {
                    Toggle("Set a target date", isOn: $includesTargetDate)
                        .accessibilityIdentifier("CaptureGoalEditTargetToggle")
                    if includesTargetDate {
                        DatePicker(
                            "Target",
                            selection: $targetAt,
                            displayedComponents: [.date]
                        )
                        .environment(\.timeZone, chosenTimeZone ?? .autoupdatingCurrent)
                        .accessibilityIdentifier("CaptureGoalEditTargetDate")
                    }

                    TextField("IANA timezone", text: $timezoneID)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .accessibilityIdentifier("CaptureGoalEditTimezone")
                    Button("Use this iPhone’s timezone") {
                        timezoneID = TimeZone.autoupdatingCurrent.identifier
                    }
                    .accessibilityIdentifier("CaptureGoalEditUsePhoneTimezone")
                    Label(
                        chosenTimeZone == nil
                            ? "Enter a valid IANA timezone, such as America/Denver."
                            : "Quipsly will preserve this target as a calendar date in \(chosenTimeZone?.identifier ?? timezoneID).",
                        systemImage: chosenTimeZone == nil ? "exclamationmark.triangle" : "globe.americas"
                    )
                    .font(.caption)
                    .foregroundStyle(chosenTimeZone == nil ? Color.orange : Color.secondary)
                }

                Section("Boundary") {
                    Text("This edits only the goal title, definition of success, and target date. It does not change status, progress evidence, linked tasks, tags, hierarchy, source anchors, provider calendars, messages, delivery, or publishing.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureGoalEditBoundary")
                    Text("Goal editing requires Nest. Protected offline snapshots remain unchanged until you reconnect.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let error = client.errorMessage {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Edit goal")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.isMutating ? "Saving…" : "Save") {
                        Task {
                            let saved = await client.editGoal(
                                goal,
                                title: title,
                                description: description,
                                targetDecision: targetDecision,
                                targetAt: targetDecision == "SET" ? targetAt : nil,
                                timezone: timezoneID.trimmingCharacters(in: .whitespacesAndNewlines)
                            )
                            if saved {
                                dismiss()
                                onSaved?()
                            }
                        }
                    }
                    .disabled(!canSave)
                    .accessibilityIdentifier("CaptureGoalEditSave")
                }
            }
        }
        .accessibilityIdentifier("CaptureGoalEditSheet")
    }
}

private struct CaptureRecurrenceEditSheet: View {
    @ObservedObject var client: CaptureTodayClient
    let task: MobileCaptureTodayTask
    var onSaved: (() -> Void)? = nil
    @Environment(\.dismiss) private var dismiss

    @State private var scope = "THIS_OCCURRENCE"
    @State private var title: String
    @State private var detail: String
    @State private var cadence: String
    @State private var frequency: String
    @State private var interval: Int
    @State private var timezoneID: String
    @State private var firstDueAt: Date
    @State private var clientRequestID = UUID()

    init(
        client: CaptureTodayClient,
        task: MobileCaptureTodayTask,
        onSaved: (() -> Void)? = nil
    ) {
        self.client = client
        self.task = task
        self.onSaved = onSaved
        let recurrence = task.recurrence
        _title = State(initialValue: task.title)
        _detail = State(initialValue: task.detail ?? "")
        _cadence = State(initialValue: recurrence?.cadence ?? "FIXED")
        _frequency = State(initialValue: recurrence?.frequency ?? "WEEKLY")
        _interval = State(initialValue: recurrence?.interval ?? 1)
        _timezoneID = State(initialValue: recurrence?.timezone ?? TimeZone.autoupdatingCurrent.identifier)
        _firstDueAt = State(initialValue: Self.date(task.dueAt) ?? Date().addingTimeInterval(86_400))
    }

    private var chosenTimeZone: TimeZone? {
        TimeZone(identifier: timezoneID.trimmingCharacters(in: .whitespacesAndNewlines))
    }

    private var recurrenceDraft: MobileQuickEntryRecurrence? {
        guard scope == "THIS_AND_FUTURE", let timezone = chosenTimeZone else { return nil }
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timezone
        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute], from: firstDueAt)
        guard let year = components.year,
              let month = components.month,
              let day = components.day,
              let hour = components.hour,
              let minute = components.minute else { return nil }
        return MobileQuickEntryRecurrence(
            cadence: cadence,
            frequency: frequency,
            interval: interval,
            timezone: timezone.identifier,
            localTimeMinutes: hour * 60 + minute,
            anchorLocalDate: String(format: "%04d-%02d-%02d", year, month, day)
        )
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (scope == "THIS_OCCURRENCE" || recurrenceDraft != nil)
            && !client.isMutating
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("What should change?") {
                    Picker("Edit scope", selection: $scope) {
                        Text("This task").tag("THIS_OCCURRENCE")
                        Text("This + future").tag("THIS_AND_FUTURE")
                    }
                    .pickerStyle(.segmented)
                    .accessibilityIdentifier("CaptureRecurrenceEditScope")

                    Text(scope == "THIS_OCCURRENCE"
                         ? "Only this open task’s wording changes. Its date, repeat rule, and every other occurrence stay exactly as they are."
                         : "Quipsly preserves completed and skipped history, closes the old repeat at this next open task, and creates a new future series. There is no rewrite-history option.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Task wording") {
                    TextField("Task title", text: $title, axis: .vertical)
                        .lineLimit(1...4)
                        .accessibilityIdentifier("CaptureRecurrenceEditTitle")
                    TextField("Optional detail", text: $detail, axis: .vertical)
                        .lineLimit(2...8)
                        .accessibilityIdentifier("CaptureRecurrenceEditDetail")
                }

                if scope == "THIS_AND_FUTURE" {
                    Section("Future repeat") {
                        Picker("Cadence", selection: $cadence) {
                            Text("Fixed schedule").tag("FIXED")
                            Text("After completion").tag("COMPLETION")
                        }
                        .accessibilityIdentifier("CaptureRecurrenceEditCadence")

                        DatePicker(
                            "First future due",
                            selection: $firstDueAt,
                            displayedComponents: [.date, .hourAndMinute]
                        )
                        .environment(\.timeZone, chosenTimeZone ?? .autoupdatingCurrent)
                        .accessibilityIdentifier("CaptureRecurrenceEditFirstDue")

                        Picker("Frequency", selection: $frequency) {
                            Text("Daily").tag("DAILY")
                            Text("Weekly").tag("WEEKLY")
                            Text("Monthly").tag("MONTHLY")
                        }
                        .pickerStyle(.segmented)
                        .accessibilityIdentifier("CaptureRecurrenceEditFrequency")

                        Stepper("Every \(interval) \(unitName)\(interval == 1 ? "" : "s")", value: $interval, in: 1...365)
                            .accessibilityIdentifier("CaptureRecurrenceEditInterval")

                        TextField("IANA timezone", text: $timezoneID)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .accessibilityIdentifier("CaptureRecurrenceEditTimezone")
                        Button("Use this iPhone’s timezone") {
                            timezoneID = TimeZone.autoupdatingCurrent.identifier
                        }
                        .accessibilityIdentifier("CaptureRecurrenceEditUsePhoneTimezone")

                        Label(
                            chosenTimeZone == nil ? "Enter a valid IANA timezone, such as America/Denver." : "Wall-clock time will stay in \(chosenTimeZone?.identifier ?? timezoneID).",
                            systemImage: chosenTimeZone == nil ? "exclamationmark.triangle" : "globe.americas"
                        )
                        .font(.caption)
                        .foregroundStyle(chosenTimeZone == nil ? Color.orange : Color.secondary)
                    }
                }

                Section("Boundary") {
                    Text("Editing stays inside Quipsly. It does not change completed history, schedule a reminder, create or edit a provider calendar event, send a message, deliver, or publish.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureRecurrenceEditBoundary")
                    if let error = client.errorMessage {
                        Label(error, systemImage: "exclamationmark.triangle")
                            .font(.caption)
                            .foregroundStyle(.orange)
                    }
                }
            }
            .navigationTitle("Edit repeating task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.isMutating ? "Saving…" : "Save") {
                        Task {
                            let saved = await client.editRecurrence(
                                task,
                                scope: scope,
                                title: title.trimmingCharacters(in: .whitespacesAndNewlines),
                                detail: detail.trimmingCharacters(in: .whitespacesAndNewlines),
                                recurrence: recurrenceDraft,
                                clientRequestID: clientRequestID
                            )
                            if saved {
                                dismiss()
                                onSaved?()
                            }
                        }
                    }
                    .disabled(!canSave)
                    .accessibilityIdentifier("CaptureRecurrenceEditSave")
                }
            }
        }
    }

    private var unitName: String {
        switch frequency {
        case "DAILY": "day"
        case "MONTHLY": "month"
        default: "week"
        }
    }

    private static func date(_ value: String?) -> Date? {
        guard let value else { return nil }
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
    }
}

private struct TodayProjectTagLine: View {
    let project: MobileCaptureTodayProject?
    let tagLabels: [String]
    let identifier: String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                if let project {
                    Label(project.name, systemImage: "tray.full")
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(.blue)
                }
                ForEach(tagLabels, id: \.self) { label in
                    Text("#\(label)")
                        .font(.caption2.weight(.bold))
                        .foregroundStyle(.blue)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background(Color.blue.opacity(0.08), in: Capsule())
                }
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel(([project?.name].compactMap { $0 } + tagLabels.map { "Tag \($0)" }).joined(separator: ", "))
        .accessibilityIdentifier(identifier)
    }
}

private struct TodayGoalCheckInControls: View {
    @ObservedObject var client: CaptureTodayClient
    let goal: MobileCaptureTodayGoal
    let decisionsDisabled: Bool
    let onSaved: (() -> Void)?

    @State private var isEditing = false
    @State private var progressPercent: Int
    @State private var note = ""

    init(
        client: CaptureTodayClient,
        goal: MobileCaptureTodayGoal,
        decisionsDisabled: Bool,
        onSaved: (() -> Void)? = nil
    ) {
        self.client = client
        self.goal = goal
        self.decisionsDisabled = decisionsDisabled
        self.onSaved = onSaved
        _progressPercent = State(initialValue: goal.progressPercent ?? 0)
    }

    var body: some View {
        if isEditing {
            VStack(alignment: .leading, spacing: 10) {
                Text("Goal check-ins record progress without changing goal status. They add evidence; they do not complete the goal.")
                    .font(.caption)
                    .foregroundStyle(.secondary)

                Picker("Progress", selection: $progressPercent) {
                    ForEach([0, 25, 50, 75, 100], id: \.self) { value in
                        Text("\(value)%").tag(value)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("CaptureTodayGoalProgressPicker_\(goal.id)")

                TextField("What changed or what is blocking it?", text: $note, axis: .vertical)
                    .lineLimit(2...4)
                    .textFieldStyle(.roundedBorder)
                    .accessibilityIdentifier("CaptureTodayGoalProgressNote_\(goal.id)")

                HStack {
                    Button("Cancel") { isEditing = false }
                        .buttonStyle(.bordered)
                    Spacer()
                    Button {
                        Task {
                            if await client.recordGoalProgress(goal, progressPercent: progressPercent, note: note) {
                                note = ""
                                isEditing = false
                                onSaved?()
                            }
                        }
                    } label: {
                        Label("Save check-in", systemImage: "checkmark.circle.fill")
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.purple)
                    .disabled(decisionsDisabled)
                    .accessibilityHint("Adds private goal-progress evidence. It does not complete the goal or trigger an external action.")
                    .accessibilityIdentifier("CaptureTodayGoalCheckInSave_\(goal.id)")
                }

                if decisionsDisabled {
                    Text("Reconnect to Nest to save. Preview and protected snapshots stay read-only.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
            }
            .padding(10)
            .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        } else {
            Button {
                progressPercent = goal.progressPercent ?? 0
                isEditing = true
            } label: {
                Label("Check in", systemImage: "chart.line.uptrend.xyaxis")
            }
            .font(.caption.weight(.bold))
            .buttonStyle(.bordered)
            .tint(.purple)
            .accessibilityHint("Opens a progress and evidence form. Opening it does not change this goal.")
            .accessibilityIdentifier("CaptureTodayGoalCheckIn_\(goal.id)")
        }
    }
}

private struct NewCaptureProjectSheet: View {
    private struct KindOption: Identifiable {
        let id: String
        let title: String
        let detail: String
        let systemImage: String
    }

    @Environment(\.dismiss) private var dismiss
    @ObservedObject var client: CaptureWorkClient
    @State private var name = ""
    @State private var description = ""
    @State private var selectedKind = "mixed"
    @State private var clientRequestID = UUID()

    private let kinds = [
        KindOption(
            id: "mixed",
            title: "Flexible project",
            detail: "Notes, tasks, goals, sessions, and mixed source material.",
            systemImage: "square.grid.2x2"
        ),
        KindOption(
            id: "production",
            title: "Podcast or video",
            detail: "Episode preparation, recordings, clips, editing, and delivery.",
            systemImage: "waveform.and.person.filled"
        ),
        KindOption(
            id: "writing",
            title: "Writing",
            detail: "Manuscripts, scripts, drafts, sources, and revisions.",
            systemImage: "text.book.closed"
        ),
        KindOption(
            id: "research",
            title: "Research",
            detail: "Sources, evidence, annotations, notes, and writing uses.",
            systemImage: "books.vertical"
        ),
        KindOption(
            id: "study",
            title: "Study",
            detail: "Reading, learning notes, questions, and durable takeaways.",
            systemImage: "graduationcap"
        ),
    ]

    private var normalizedName: String {
        name.trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private var saveDisabled: Bool {
        normalizedName.isEmpty
            || normalizedName.count > 120
            || client.isCreatingProject
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    TextField("Project name", text: $name)
                        .textInputAutocapitalization(.words)
                        .submitLabel(.next)
                        .accessibilityIdentifier("CaptureWorkProjectName")
                    TextField(
                        "What belongs here? (optional)",
                        text: $description,
                        axis: .vertical
                    )
                    .lineLimit(2...5)
                    .accessibilityIdentifier("CaptureWorkProjectDescription")
                    if normalizedName.count > 120 {
                        Label("Keep the project name to 120 characters.", systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                    }
                } header: {
                    Text("Private project")
                } footer: {
                    Text("A project is a canonical Nest—not a folder copied only onto this phone.")
                }

                Section("Start with") {
                    ForEach(kinds) { kind in
                        Button {
                            selectedKind = kind.id
                        } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Image(systemName: kind.systemImage)
                                    .font(.title3)
                                    .frame(width: 28)
                                    .foregroundStyle(CapturePalette.accent)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(kind.title)
                                        .font(.body.weight(.semibold))
                                        .foregroundStyle(.primary)
                                    Text(kind.detail)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                Image(systemName: selectedKind == kind.id ? "checkmark.circle.fill" : "circle")
                                    .foregroundStyle(selectedKind == kind.id ? CapturePalette.accent : .secondary)
                            }
                            .frame(minHeight: 48)
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("CaptureWorkProjectKind_\(kind.id)")
                        .accessibilityValue(selectedKind == kind.id ? "Selected" : "Not selected")
                    }
                }

                Section {
                    Label("Private by default", systemImage: "lock.fill")
                    Label("You become the owner", systemImage: "person.badge.key.fill")
                    Label("No messages, calendar events, or publishing", systemImage: "hand.raised.fill")
                } footer: {
                    Text("Creating requires Nest. If the response is interrupted, Retry uses the same protected request identity and cannot take ownership of an existing same-name project.")
                }

                if let errorMessage = client.errorMessage {
                    Section {
                        Label(errorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("CaptureWorkProjectCreateError")
                    } header: {
                        Text("Couldn’t create project")
                    } footer: {
                        Text("Check your connection, then tap Create again. Capture safely reuses this request without duplicating a completed project.")
                    }
                }
            }
            .navigationTitle("New project")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.isCreatingProject ? "Creating…" : "Create") {
                        Task {
                            let project = await client.createProject(
                                name: normalizedName,
                                nestKind: selectedKind,
                                description: description.trimmingCharacters(in: .whitespacesAndNewlines),
                                clientRequestID: clientRequestID
                            )
                            if project != nil {
                                dismiss()
                            }
                        }
                    }
                    .disabled(saveDisabled)
                    .accessibilityIdentifier("CaptureWorkProjectCreate")
                }
            }
        }
        .interactiveDismissDisabled(client.isCreatingProject)
    }
}

private struct CaptureRecorderView: View {
    @ObservedObject var model: CaptureExperienceModel
    @EnvironmentObject private var audioCapture: AudioCaptureController
    @EnvironmentObject private var videoCapture: VideoCaptureController
    @State private var showsSessionPicker = false
    @State private var showsRoomDetails = false
    @State private var showsSessionContext = false
    @State private var showsSessionReadiness = false
    @State private var showsConsentConfirmation = false
    @State private var quickEntryKind: MobileQuickEntryKind?
    @State private var recordingMode: CaptureRecordingMode = .audio
    @State private var cameraPosition: VideoCaptureCameraPosition = .front
    @State private var isRunningRehearsalCheck = false
    @StateObject private var episodeManuscript = MobileEpisodeManuscriptClient()
    @StateObject private var episodeWatch = MobileEpisodeWatchClient()
    @StateObject private var episodeChat = MobileEpisodeChatClient()

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                SessionChooserButton(session: model.selectedSession) {
                    showsSessionPicker = true
                }
                .disabled(model.isSessionContextLocked)

                if model.isRefreshing {
                    Label("Verifying saved session with Nest…", systemImage: "arrow.trianglehead.2.clockwise.rotate.90")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("CaptureSessionAuthorityStatus")
                } else if model.sessionClient.sessionsAreStale {
                    Label("Protected offline session snapshot", systemImage: "lock.shield")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .accessibilityIdentifier("CaptureSessionAuthorityStatus")
                }

                if let session = model.selectedSession {
                    ConsentStrip(
                        session: session,
                        isBusy: model.isChangingConsent,
                        isCaptureActive: captureIsActive,
                        onGrant: { showsConsentConfirmation = true },
                        onRevoke: { Task { await model.revokeConsent() } }
                    )

                    CaptureRecordingModePicker(
                        selection: $recordingMode,
                        isLocked: captureIsActive || model.isChangingCapture
                    )

                    VStack(alignment: .leading, spacing: 0) {
                        Button {
                            withAnimation(.easeInOut(duration: 0.2)) {
                                showsSessionReadiness.toggle()
                            }
                        } label: {
                            HStack(spacing: 10) {
                                Label("Session readiness", systemImage: "checklist.checked")
                                    .font(.headline)
                                Spacer()
                                Text(session.journeyStageLabel)
                                    .font(.caption.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                    .multilineTextAlignment(.trailing)
                                Image(systemName: "chevron.right")
                                    .font(.caption.weight(.bold))
                                    .foregroundStyle(.secondary)
                                    .rotationEffect(.degrees(showsSessionReadiness ? 90 : 0))
                                    .accessibilityHidden(true)
                            }
                            .contentShape(Rectangle())
                        }
                        .buttonStyle(.plain)
                        .accessibilityValue(showsSessionReadiness ? "Expanded" : "Collapsed")
                        .accessibilityHint("Shows source quality, lifecycle receipts, safe next actions, and the boundary between joining and recording.")
                        .accessibilityIdentifier("CaptureSessionTruthDisclosure")

                        if showsSessionReadiness {
                            CaptureSessionTruthPanel(
                                session: session,
                                model: model
                            )
                            .padding(.top, 12)
                            .transition(.opacity.combined(with: .move(edge: .top)))
                        }
                    }
                    .captureCard()

                    if recordingMode == .audio {
                        RecorderHero(
                            session: session,
                            captureState: audioCapture.captureState,
                            duration: audioCapture.currentDuration,
                            inputLevel: audioCapture.normalizedInputLevel,
                            inputRoute: audioCapture.inputRouteName,
                            capturePipeline: audioCapture.capturePipelineLabel,
                            userMarkOffsets: audioCapture.userMarkOffsets,
                            isBusy: model.isChangingCapture,
                            onPrimaryAction: {
                                Task {
                                    if audioCaptureIsActive {
                                        await model.stopCapture(using: audioCapture)
                                    } else {
                                        await model.startCapture(using: audioCapture)
                                    }
                                }
                            },
                            onPauseResume: { Task { await model.togglePause(using: audioCapture) } },
                            onMark: { model.markMoment(using: audioCapture) }
                        )
                    } else {
                        VideoRecorderHero(
                            session: session,
                            mode: recordingMode,
                            controller: videoCapture,
                            coordinatedAudioState:
                                recordingMode.isCoordinatedPodcastCapture
                                    ? audioCapture.captureState
                                    : nil,
                            cameraPosition: $cameraPosition,
                            isBusy:
                                model.isChangingCapture
                                || model.isCoordinatingPodcastCapture,
                            onPrepare: {
                                Task {
                                    await model.prepareVideoCapture(
                                        using: videoCapture,
                                        mode: recordingMode,
                                        position: cameraPosition
                                    )
                                }
                            },
                            onStart: {
                                Task {
                                    if recordingMode.isCoordinatedPodcastCapture {
                                        await model.startCoordinatedPodcastCapture(
                                            using: audioCapture,
                                            videoCapture: videoCapture
                                        )
                                    } else {
                                        await model.startVideoCapture(
                                            using: videoCapture,
                                            mode: recordingMode
                                        )
                                    }
                                }
                            },
                            onStop: {
                                Task {
                                    if recordingMode.isCoordinatedPodcastCapture {
                                        await model.stopCoordinatedPodcastCapture(
                                            using: audioCapture,
                                            videoCapture: videoCapture
                                        )
                                    } else {
                                        await model.stopVideoCapture(
                                            using: videoCapture
                                        )
                                    }
                                }
                            },
                            onPauseResume: {
                                Task {
                                    if recordingMode.isCoordinatedPodcastCapture {
                                        await model.toggleCoordinatedPodcastPause(
                                            using: audioCapture,
                                            videoCapture: videoCapture
                                        )
                                    } else {
                                        await model.toggleVideoPause(
                                            using: videoCapture
                                        )
                                    }
                                }
                            },
                            onSwitchCamera: {
                                Task {
                                    await model.switchVideoCamera(
                                        using: videoCapture
                                    )
                                }
                            }
                        )

                        if recordingMode.isCoordinatedPodcastCapture {
                            CoordinatedPodcastAudioStatus(
                                captureState: audioCapture.captureState,
                                duration: audioCapture.currentDuration,
                                inputLevel: audioCapture.normalizedInputLevel,
                                inputRoute: audioCapture.inputRouteName,
                                capturePipeline: audioCapture.capturePipelineLabel,
                                markCount: audioCapture.userMarkOffsets.count,
                                canMark: audioCapture.captureState == .recording,
                                onMark: { model.markMoment(using: audioCapture) }
                            )
                        }
                    }

                    CaptureRehearsalReadinessCard(
                        audioCapture: audioCapture,
                        videoCapture: videoCapture,
                        manuscript: episodeManuscript,
                        watch: episodeWatch,
                        session: session,
                        mode: recordingMode,
                        providerConnected: model.providerRoom.isConnected,
                        previewOnly: model.usesPreviewData,
                        isRunningCheck: isRunningRehearsalCheck,
                        isCaptureActive: captureIsActive,
                        onRunCheck: {
                            Task {
                                await runRehearsalCheck(for: session)
                            }
                        }
                    )

                    if session.projectSlug?.nonempty != nil,
                       session.episodeSlug?.nonempty != nil {
                        MobileEpisodeManuscriptCard(
                            client: episodeManuscript,
                            session: session,
                            previewOnly: model.usesPreviewData
                        )
                        .task(
                            id:
                                "manuscript|\(session.id)|\(session.projectSlug ?? "")|\(session.episodeSlug ?? "")"
                        ) {
                            if model.usesPreviewData {
                                episodeManuscript.loadPreview(session: session)
                            } else {
                                await episodeManuscript.load(session: session)
                            }
                        }

                        MobileEpisodeWatchCard(
                            client: episodeWatch,
                            session: session,
                            captureIsActive: captureIsActive,
                            previewOnly: model.usesPreviewData
                        )
                        .task(
                            id:
                                "\(session.id)|\(session.projectSlug ?? "")|\(session.episodeSlug ?? "")"
                        ) {
                            if model.usesPreviewData {
                                episodeWatch.loadPreview(session: session)
                            } else {
                                await episodeWatch.load(session: session)
                                await episodeWatch.poll(session: session)
                            }
                        }
                        .onDisappear { episodeWatch.stop() }
                    }

                    if audioCapture.captureState == .paused,
                       let recorderMessage = audioCapture.lastErrorMessage,
                       !recorderMessage.isEmpty {
                        CaptureInlineWarning(text: recorderMessage)
                    }

                    if let safetyNotice = model.captureSafetyNotice {
                        CaptureInlineWarning(text: safetyNotice)
                    }

                    if let message = model.message {
                        CaptureInlineMessage(text: message)
                    }

                    if let receiptNotice = model.captureReceiptNotice {
                        if !model.receiptStore.hasPendingReceipts && model.receiptStore.persistenceError == nil {
                            CaptureInlineMessage(text: receiptNotice)
                        } else {
                            CaptureInlineWarning(text: receiptNotice)
                        }
                    }

                    UploadSummaryCard(model: model)

                    StudioHandoffCard(
                        model: model,
                        session: session,
                        captureIsActive: captureIsActive
                    )

                    CaptureQuickEntryBar(session: session) { kind in
                        quickEntryKind = kind
                    }

                    if model.quickEntryOutbox.hasRetryableEntries || model.quickEntrySyncMessage != nil {
                        CaptureQuickEntrySyncCard(model: model)
                    }

                    CaptureSessionNotesCard(
                        session: session,
                        model: model
                    )

                    CaptureSessionFollowUpStatus(
                        session: session,
                        errorMessage: model.sessionClient.errorMessage
                    )

                    if let priorFollowThrough = session.priorFollowThrough {
                        MobilePriorSessionFollowThroughCard(
                            followThrough: priorFollowThrough,
                            sourceSessionAvailable: model.sessions.contains(where: {
                                $0.id == priorFollowThrough.sourceRoom.id
                            })
                        ) {
                            guard let sourceSession = model.sessions.first(where: {
                                $0.id == priorFollowThrough.sourceRoom.id
                            }) else {
                                model.message = "Refresh Sessions to open the exact source Session. The released follow-through and canonical work remain unchanged."
                                return
                            }
                            model.select(sourceSession)
                        }
                    }

                    if let priorContinuity = session.priorContinuity {
                        MobilePriorSessionContinuityCard(
                            prior: priorContinuity,
                            sourceSessionAvailable: model.sessions.contains(where: {
                                $0.id == priorContinuity.sourceRoom.id
                            })
                        ) {
                            guard let sourceSession = model.sessions.first(where: {
                                $0.id == priorContinuity.sourceRoom.id
                            }) else {
                                model.message = "Refresh Sessions to open the exact prior Session. This continuity snapshot remains unchanged."
                                return
                            }
                            model.select(sourceSession)
                        }
                    }

                    if session.clientFollowUp != nil {
                        MobileClientFollowUpCard(
                            session: session,
                            sessionClient: model.sessionClient
                        )
                    }

                    DisclosureGroup(isExpanded: $showsSessionContext) {
                        CaptureSessionContextPanel(
                            session: session,
                            sessionClient: model.sessionClient
                        )
                        .padding(.top, 12)
                    } label: {
                        HStack {
                            Label("Session plan", systemImage: "note.text.badge.plus")
                                .font(.headline)
                            Spacer()
                            Text("Notes, goals & tasks")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                        }
                    }
                    .captureCard()
                    .accessibilityHint("Opens the local-first session note, goals, tasks, and Nest revision controls.")

                    if session.projectSlug?.nonempty != nil,
                       session.episodeSlug?.nonempty != nil {
                        MobileEpisodeChatCard(
                            client: episodeChat,
                            session: session,
                            previewOnly: model.usesPreviewData
                        )
                        .task(
                            id:
                                "chat|\(session.id)|\(session.projectSlug ?? "")|\(session.episodeSlug ?? "")"
                        ) {
                            if model.usesPreviewData {
                                episodeChat.loadPreview(session: session)
                            } else {
                                await episodeChat.load(session: session)
                                episodeChat.startPolling(session: session)
                            }
                        }
                        .onDisappear { episodeChat.stopPolling() }
                    }

                    DisclosureGroup(isExpanded: $showsRoomDetails) {
                        ProviderRoomControls(
                            model: model,
                            session: session
                        )
                            .padding(.top, 12)
                    } label: {
                        HStack {
                            Label("Live room", systemImage: "person.2.wave.2")
                                .font(.headline)
                            Spacer()
                            Text(model.providerControlsLockedForLocalCapture ? "Locked for take" : model.providerRoom.isConnected ? "Connected" : session.providerBadgeLabel)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(model.providerControlsLockedForLocalCapture ? Color.orange : model.providerRoom.isConnected ? Color.green : Color.secondary)
                        }
                    }
                    .captureCard()
                    .accessibilityHint(model.providerControlsLockedForLocalCapture ? model.providerControlsLockMessage : "Shows optional live room controls. Joining never starts local recording.")
                    .accessibilityIdentifier("CaptureLiveRoomDisclosure")

                    SourceTruthFootnote(mode: recordingMode)
                } else if model.isRefreshing {
                    CaptureLoadingCard(label: "Loading capture sessions…")
                } else {
                    CaptureEmptyCard(
                        systemImage: "record.circle",
                        title: "Choose a session",
                        detail: "Recording belongs to a Quipsly session so consent, upload, and transcript receipts stay together.",
                        actionTitle: "Choose session",
                        action: { showsSessionPicker = true }
                    )
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 14)
            .padding(.bottom, 96)
        }
        .accessibilityIdentifier("CaptureRecorderView")
        .background(CaptureCanvas())
        .navigationTitle("Record")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showsSessionPicker) {
            SessionPickerSheet(model: model, isPresented: $showsSessionPicker)
                .presentationDetents([.medium, .large])
        }
        .sheet(isPresented: $showsConsentConfirmation) {
            if let session = model.selectedSession {
                CaptureConsentConfirmationSheet(
                    session: session,
                    requiresStableOwner: !model.usesPreviewData
                ) { canRecordAudio, canRecordVideo, canTranscribe, allAudibleParticipantsNotifiedAndAgreed, presentedAt in
                    await model.grantConsent(
                        for: session.id,
                        canRecordAudio: canRecordAudio,
                        canRecordVideo: canRecordVideo,
                        canTranscribe: canTranscribe,
                        allAudibleParticipantsNotifiedAndAgreed: allAudibleParticipantsNotifiedAndAgreed,
                        presentedAt: presentedAt
                    )
                }
            }
        }
        .sheet(item: $quickEntryKind) { kind in
            CaptureQuickEntrySheet(kind: kind, session: model.selectedSession, model: model)
                .presentationDetents([.large])
        }
        .interactiveDismissDisabled(captureIsActive)
        .onChange(of: recordingMode) { oldMode, newMode in
            guard oldMode != newMode else { return }
            if newMode == .audio {
                Task { await videoCapture.shutdownPreview() }
            } else if videoCapture.state == .ready,
                      videoCapture.resolvedProfile?.includesAudio != newMode.movieIncludesAudio {
                Task {
                    await model.prepareVideoCapture(
                        using: videoCapture,
                        mode: newMode,
                        position: cameraPosition
                    )
                }
            }
        }
        .onChange(of: cameraPosition) { oldPosition, newPosition in
            guard oldPosition != newPosition,
                  recordingMode.recordsVideo,
                  videoCapture.state == .ready else { return }
            Task {
                await model.prepareVideoCapture(
                    using: videoCapture,
                    mode: recordingMode,
                    position: newPosition
                )
            }
        }
        .onChange(of: videoCapture.cameraPosition) { _, position in
            cameraPosition = position
        }
        .onDisappear {
            guard !videoCapture.state.isActive,
                  videoCapture.state != .paused else { return }
            Task { await videoCapture.shutdownPreview() }
        }
    }

    private var captureIsActive: Bool {
        audioCaptureIsActive || videoCaptureIsActive
    }

    private var audioCaptureIsActive: Bool {
        switch audioCapture.captureState {
        case .recording, .paused, .finalizing:
            true
        default:
            false
        }
    }

    private var videoCaptureIsActive: Bool {
        videoCapture.state.isActive || videoCapture.state == .paused
    }

    private func runRehearsalCheck(
        for session: MobileCaptureSession
    ) async {
        guard !model.usesPreviewData,
              !captureIsActive,
              !isRunningRehearsalCheck,
              AuthManager.shared.networkActionsAllowed else { return }
        isRunningRehearsalCheck = true
        defer { isRunningRehearsalCheck = false }

        if !model.providerRoom.isConnected {
            _ = await audioCapture.prepareForRecording()
            if recordingMode.recordsVideo {
                await model.prepareVideoCapture(
                    using: videoCapture,
                    mode: recordingMode,
                    position: cameraPosition
                )
            }
        }

        if session.projectSlug?.nonempty != nil,
           session.episodeSlug?.nonempty != nil {
            await episodeManuscript.load(
                session: session,
                forceRefresh: true
            )
            await episodeWatch.load(session: session)
            if episodeWatch.selectedClip != nil,
               !episodeWatch.isPrepared {
                await episodeWatch.prepareSelectedClip()
            }
        }
    }
}

private struct MobilePriorSessionFollowThroughCard: View {
    let followThrough: MobileCapturePriorFollowThrough
    let sourceSessionAvailable: Bool
    let onOpenSource: () -> Void
    @State private var showsReleaseReceipt = false

    private func humanized(_ value: String) -> String {
        value.replacingOccurrences(of: "_", with: " ").capitalized
    }

    private func statusIcon(_ status: String, unavailable: Bool) -> String {
        if unavailable { return "questionmark.circle" }
        if ["DONE", "ACHIEVED"].contains(status.uppercased()) { return "checkmark.circle.fill" }
        return "circle"
    }

    private func statusTint(_ status: String, unavailable: Bool) -> Color {
        if unavailable { return .orange }
        return ["DONE", "ACHIEVED"].contains(status.uppercased()) ? .green : .purple
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Follow-through for this Session", systemImage: "arrow.triangle.2.circlepath.circle.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(.purple)

            Text(followThrough.output.title)
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)

            Text("Released to \(followThrough.output.recipientLabel) · live canonical status")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)

            if let intro = followThrough.output.intro?.nonempty {
                Text(intro)
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
            }

            HStack(spacing: 8) {
                StatusChip(
                    label: "\(followThrough.summary.openTaskCount) open",
                    tint: followThrough.summary.openTaskCount == 0 ? .green : .orange
                )
                StatusChip(
                    label: "\(followThrough.summary.activeGoalCount) active",
                    tint: .purple
                )
                if followThrough.summary.changedSinceReleaseCount > 0 {
                    StatusChip(
                        label: "\(followThrough.summary.changedSinceReleaseCount) updated",
                        tint: .blue
                    )
                }
            }

            if !followThrough.tasks.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    Label("Commitments", systemImage: "checklist")
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                    ForEach(followThrough.tasks) { task in
                        let unavailable = task.availability == "UNAVAILABLE"
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: statusIcon(task.status, unavailable: unavailable))
                                .foregroundStyle(statusTint(task.status, unavailable: unavailable))
                                .padding(.top, 2)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(task.title)
                                    .font(.caption.bold())
                                Text(unavailable ? "No longer available to this client" : humanized(task.status))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                if task.changedSinceRelease {
                                    Text(unavailable ? "Changed since release" : "Current status differs from the released snapshot")
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(.blue)
                                }
                            }
                        }
                        .accessibilityIdentifier("CaptureFollowThroughTask_\(task.id)")
                    }
                }
            }

            if !followThrough.goals.isEmpty {
                VStack(alignment: .leading, spacing: 7) {
                    Label("Goals", systemImage: "target")
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                    ForEach(followThrough.goals) { goal in
                        let unavailable = goal.availability == "UNAVAILABLE"
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: statusIcon(goal.status, unavailable: unavailable))
                                .foregroundStyle(statusTint(goal.status, unavailable: unavailable))
                                .padding(.top, 2)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(goal.title)
                                    .font(.caption.bold())
                                Text(unavailable ? "No longer available to this client" : humanized(goal.status))
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                if let progress = goal.latestProgress {
                                    Text(progress.progressPercent.map { "Latest check-in \($0)%" } ?? "Latest check-in recorded")
                                        .font(.caption2.weight(.semibold))
                                        .foregroundStyle(.purple)
                                }
                            }
                        }
                        .accessibilityIdentifier("CaptureFollowThroughGoal_\(goal.id)")
                    }
                }
            }

            if let focus = followThrough.output.nextSessionFocus?.nonempty {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Bring into this Session")
                        .font(.caption2.bold())
                        .foregroundStyle(.purple)
                    Text(focus)
                        .font(.caption)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(8)
                .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
            }

            DisclosureGroup(isExpanded: $showsReleaseReceipt) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Revision \(followThrough.output.revision) · \(followThrough.viewerRole.lowercased()) view")
                    Text("SHA-256 \(followThrough.output.contentSha256)")
                        .font(.system(.caption2, design: .monospaced))
                        .lineLimit(1)
                    Text("The release remains immutable. Statuses above are live reads of the same task and goal IDs.")
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.top, 6)
            } label: {
                Text("Inspect release receipt")
                    .font(.subheadline.weight(.semibold))
            }

            Button("Open source Session", action: onOpenSource)
                .buttonStyle(.bordered)
                .disabled(!sourceSessionAvailable)
                .accessibilityIdentifier("CaptureFollowThroughOpenSource")

            Text("Shared only with the assigned coach and client · same Nest and purpose · no copied work · no completion, message, or calendar side effect")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CapturePriorSessionFollowThrough")
    }
}

private struct MobilePriorSessionContinuityCard: View {
    let prior: MobileCapturePriorContinuity
    let sourceSessionAvailable: Bool
    let onOpenSource: () -> Void
    @State private var isExpanded = false

    private var savedLabel: String {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let date = fractional.date(from: prior.brief.createdAt)
            ?? ISO8601DateFormatter().date(from: prior.brief.createdAt)
        return date?.formatted(date: .abbreviated, time: .shortened) ?? "saved time unavailable"
    }

    private var receiptLabel: String {
        let hash = prior.brief.snapshotSha256
        guard hash.count == 64 else { return hash }
        return "\(hash.prefix(10))…\(hash.suffix(8))"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("From the previous Session", systemImage: "arrow.uturn.backward.circle.fill")
                .font(.caption.weight(.bold))
                .foregroundStyle(.purple)

            Text(prior.sourceRoom.title)
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)

            Text("Saved \(savedLabel) · \(receiptLabel)")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            DisclosureGroup(isExpanded: $isExpanded) {
                Text(prior.brief.body)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 8)
            } label: {
                Text("Review carried-forward brief")
                    .font(.subheadline.weight(.semibold))
            }

            Button("Open source Session", action: onOpenSource)
                .buttonStyle(.bordered)
                .disabled(!sourceSessionAvailable)
                .accessibilityIdentifier("CapturePriorContinuityOpenSource")

            Text("Same Nest and purpose · private to this account · current Session unchanged · no AI or external side effects")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CapturePriorSessionContinuity")
    }
}

private struct CaptureSessionFollowUpStatus: View {
    let session: MobileCaptureSession
    let errorMessage: String?

    var body: some View {
        Label(
            errorMessage
                ?? (session.clientFollowUp == nil
                    ? "Session current · no released client follow-up"
                    : "Session current · released client follow-up ready"),
            systemImage: errorMessage != nil
                ? "exclamationmark.triangle"
                : session.clientFollowUp == nil
                    ? "checkmark.icloud"
                    : "person.crop.circle.badge.checkmark"
        )
        .font(.caption.weight(.semibold))
        .foregroundStyle(
            errorMessage != nil
                ? Color.orange
                : session.clientFollowUp == nil
                    ? Color.secondary
                    : Color.green
        )
        .frame(maxWidth: .infinity, alignment: .leading)
        .fixedSize(horizontal: false, vertical: true)
        .accessibilityIdentifier("CaptureSessionSyncStatus")
    }
}

private struct CaptureSessionTruthPanel: View {
    let session: MobileCaptureSession
    @ObservedObject var model: CaptureExperienceModel
    @State private var isPreparingProviderReceipt = false

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            truthSection(
                title: "Journey",
                systemImage: "point.topleft.down.to.point.bottomright.curvepath",
                status: session.journeyStageLabel,
                detail: session.journeyNextAction,
                tint: session.captureReadinessIsSafeToRecord ? .green : .orange
            )

            if let content = session.contentReadiness {
                truthSection(
                    title: "Source quality",
                    systemImage: "waveform.badge.magnifyingglass",
                    status: content.label ?? (content.isSubstantial ? "Production source" : "Proof only"),
                    detail: "\(content.detail ?? content.nextAction ?? "Review the retained source before transcription.") \(content.evidenceLine)",
                    tint: content.isSubstantial ? .green : .orange
                )
            }

            truthSection(
                title: "Lifecycle receipts",
                systemImage: "checkmark.seal",
                status: session.lifecycleReceiptLine,
                detail: session.lifecycleNextAction,
                tint: session.lifecycle?.readyForCapture == true ? .green : .orange
            )

            if !session.lifecycleSafeActions.isEmpty {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Safe next actions")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.secondary)
                    ForEach(session.lifecycleSafeActions.prefix(3)) { action in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: action.enabled ? "checkmark.circle.fill" : "clock.badge.exclamationmark")
                                .foregroundStyle(action.enabled ? Color.green : Color.secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(action.label)
                                    .font(.subheadline.weight(.semibold))
                                Text(action.why)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                Text("Boundary: \(action.boundary)")
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                            }
                        }
                        .accessibilityElement(children: .combine)
                        .accessibilityIdentifier("CaptureLifecycleSafeAction_\(action.id)")
                    }
                }
            }

            Divider()

            VStack(alignment: .leading, spacing: 8) {
                Label("Live room and server recording", systemImage: "person.2.wave.2")
                    .font(.subheadline.weight(.bold))
                    .accessibilityIdentifier("CaptureProviderRecordingBoundary")
                Text(model.providerRoom.nativeCallPresentationLabel)
                    .font(.caption.weight(.semibold))
                Text("CallKit only presents the Quipsly-owned live room on iPhone. Joining, CallKit, consent, local recording, and server recording remain separate states in Nest.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if let readiness = model.readinessClient.readiness {
                    CaptureStatusPill(
                        label: readiness.providerEgressLabel,
                        systemImage: readiness.providerEgressReady ? "checkmark.circle.fill" : "lock.shield",
                        tint: readiness.providerEgressReady ? .green : .orange
                    )
                    Text(readiness.providerEgressDetail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                CaptureStatusPill(
                    label: session.hasProviderRecordingReceiptSlot
                        ? "Receipt \(session.providerReceiptStatusLabel)"
                        : "No server-recording receipt",
                    systemImage: session.hasProviderRecordingReceiptSlot ? "doc.badge.checkmark" : "doc.badge.plus",
                    tint: session.hasProviderRecordingReceiptSlot ? .green : .secondary
                )
                Text(session.providerReceiptActionLabel)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)

                if session.actionPacket?.capabilities?.canPrepareProviderRecordingReceipt == true,
                   !session.hasProviderRecordingReceiptSlot {
                    Button {
                        Task { await prepareProviderRecordingReceipt() }
                    } label: {
                        if isPreparingProviderReceipt {
                            ProgressView()
                                .frame(maxWidth: .infinity)
                        } else {
                            Label("Prepare server-recording receipt", systemImage: "doc.badge.plus")
                                .frame(maxWidth: .infinity)
                        }
                    }
                    .buttonStyle(.bordered)
                    .disabled(isPreparingProviderReceipt || model.providerControlsLockedForLocalCapture)
                    .accessibilityHint("Creates only the Nest receipt slot. It does not join the room or start recording.")
                    .accessibilityIdentifier("CapturePrepareProviderRecordingReceipt")
                }

                if let error = model.sessionClient.errorMessage?.nonempty {
                    CaptureInlineWarning(text: error)
                }
            }
            .accessibilityElement(children: .contain)
        }
        .accessibilityIdentifier("CaptureSessionTruthPanel")
    }

    @ViewBuilder
    private func truthSection(
        title: String,
        systemImage: String,
        status: String,
        detail: String,
        tint: Color
    ) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            HStack(alignment: .firstTextBaseline) {
                Label(title, systemImage: systemImage)
                    .font(.subheadline.weight(.bold))
                Spacer()
                Text(status)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(tint)
                    .multilineTextAlignment(.trailing)
            }
            Text(detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private func prepareProviderRecordingReceipt() async {
        guard !isPreparingProviderReceipt else { return }
        isPreparingProviderReceipt = true
        defer { isPreparingProviderReceipt = false }
        guard await model.sessionClient.prepareProviderRecordingReceiptSlot(for: session) else {
            return
        }
        await model.load()
    }
}

struct CaptureQuickEntryBar: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let session: MobileCaptureSession?
    let onSelect: (MobileQuickEntryKind) -> Void

    private var quickEntryColumns: [GridItem] {
        Array(
            repeating: GridItem(.flexible(minimum: 0), spacing: 8),
            count: dynamicTypeSize.isAccessibilitySize ? 1 : 2
        )
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 11) {
            VStack(alignment: .leading, spacing: 2) {
                Label("Capture the work", systemImage: "bolt.fill")
                    .font(.caption.weight(.bold))
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
                    .foregroundStyle(CapturePalette.accent)
                Text("Save the thought before it disappears")
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(nil)
                    .fixedSize(horizontal: false, vertical: true)
            }

            LazyVGrid(columns: quickEntryColumns, spacing: 8) {
                ForEach(MobileQuickEntryKind.allCases) { kind in
                    Button {
                        onSelect(kind)
                    } label: {
                        Label(kind.title, systemImage: kind.systemImage)
                            .font(.caption.weight(.bold))
                            .lineLimit(nil)
                            .multilineTextAlignment(.center)
                            .fixedSize(horizontal: false, vertical: true)
                            .frame(maxWidth: .infinity, minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .tint(kind == .note ? CapturePalette.accent : kind == .task ? .blue : kind == .goal ? .purple : .teal)
                    .accessibilityHint(kind == .source
                        ? "Opens a protected personal source capture for Nest Inbox."
                        : session.map { "Opens a local-first \(kind.title.lowercased()) for \($0.displayTitle), with a private Home Nest option." }
                            ?? "Opens a protected personal \(kind.title.lowercased()) for your private Home Nest.")
                    .accessibilityIdentifier("CaptureQuickEntry_\(kind.rawValue)_\(session?.id ?? "personal")")
                }
            }

            Text("The phone journals first. Nest retries use the same ID, so a timeout cannot create a duplicate.")
                .font(.caption2)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
                .foregroundStyle(.secondary)
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureQuickEntryBar")
    }
}

struct CaptureQuickEntrySyncCard: View {
    @ObservedObject var model: CaptureExperienceModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: model.quickEntryOutbox.heldCount > 0 ? "exclamationmark.icloud" : "icloud.and.arrow.up")
                    .foregroundStyle(model.quickEntryOutbox.heldCount > 0 ? Color.orange : CapturePalette.accent)
                VStack(alignment: .leading, spacing: 3) {
                    Text(syncTitle)
                        .font(.subheadline.weight(.bold))
                    if let message = model.quickEntrySyncMessage {
                        Text(message)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                Spacer()
            }

            if model.quickEntryOutbox.hasRetryableEntries {
                ForEach(model.quickEntryOutbox.entries.prefix(3)) { entry in
                    VStack(alignment: .leading, spacing: 2) {
                        Text("\(entry.kind.title) · \(entry.displayTitle)")
                            .font(.caption.weight(.semibold))
                            .lineLimit(2)
                        if entry.kind == .source,
                           entry.title?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
                            if let sourceURL = entry.sourceURL {
                                Text(sourceURL)
                                    .font(.caption2.monospaced())
                                    .foregroundStyle(.secondary)
                                    .lineLimit(2)
                                    .textSelection(.enabled)
                            }
                            Text(entry.body)
                                .font(.caption2.monospaced())
                                .foregroundStyle(.secondary)
                                .lineLimit(entry.sourceURL == nil ? 2 : 3)
                                .textSelection(.enabled)
                        }
                        Text(entry.disposition == .held ? "Held for review" : "Saved on iPhone · waiting for Nest")
                            .font(.caption2)
                            .foregroundStyle(entry.disposition == .held ? Color.orange : Color.secondary)
                    }
                    .accessibilityIdentifier("CaptureQuickEntryPending_\(entry.clientRequestID)")
                }
                Button {
                    Task { await model.retryQuickEntries() }
                } label: {
                    if model.isSyncingQuickEntries {
                        ProgressView().frame(maxWidth: .infinity)
                    } else {
                        Label("Retry protected captures", systemImage: "arrow.clockwise")
                            .frame(maxWidth: .infinity)
                    }
                }
                .buttonStyle(.bordered)
                .disabled(model.isSyncingQuickEntries)
                .accessibilityIdentifier("CaptureQuickEntryRetry")
            }

            if model.taskReminderScheduler.activeReminderCount > 0 {
                Divider()
                Label(
                    "\(model.taskReminderScheduler.scheduledReminderCount) of \(model.taskReminderScheduler.activeReminderCount) private task alert\(model.taskReminderScheduler.activeReminderCount == 1 ? "" : "s") scheduled on this iPhone",
                    systemImage: model.taskReminderScheduler.scheduledReminderCount > 0 ? "bell.badge.fill" : "bell.slash"
                )
                .font(.caption.weight(.semibold))
                .accessibilityIdentifier("CaptureTaskReminderProjectionCount")
                Text(model.taskReminderScheduler.statusMessage)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("CaptureTaskReminderProjectionStatus")
            }

            if let persistenceError = model.quickEntryOutbox.persistenceError {
                Text(persistenceError)
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.red)
            }
        }
        .captureCard()
        .accessibilityIdentifier("CaptureQuickEntrySyncCard")
    }

    private var syncTitle: String {
        if model.quickEntryOutbox.heldCount > 0 {
            return "\(model.quickEntryOutbox.heldCount) quick capture\(model.quickEntryOutbox.heldCount == 1 ? "" : "s") held"
        }
        if model.quickEntryOutbox.pendingCount > 0 {
            return "\(model.quickEntryOutbox.pendingCount) quick capture\(model.quickEntryOutbox.pendingCount == 1 ? "" : "s") waiting"
        }
        return "Quick capture synced"
    }
}

private struct CaptureSessionNotesCard: View {
    let session: MobileCaptureSession
    @ObservedObject var model: CaptureExperienceModel
    @State private var isExpanded = false
    @State private var editingNote: MobileCaptureSessionNote?

    private var quickEntryOutbox: MobileQuickEntryOutbox {
        model.quickEntryOutbox
    }

    private var canonicalNotes: [MobileCaptureSessionNote] {
        session.sessionNotes ?? []
    }

    private var pendingNotes: [PendingMobileQuickEntry] {
        quickEntryOutbox.entries.filter {
            $0.kind == .note && $0.callRoomID == session.callRoomId
        }
    }

    private var totalCount: Int {
        canonicalNotes.count + pendingNotes.count
    }

    private var protectedEdits: [PendingSessionNoteEdit] {
        model.sessionNoteEditOutbox.entries.filter { $0.roomID == session.callRoomId }
    }

    var body: some View {
        DisclosureGroup(isExpanded: $isExpanded) {
            VStack(alignment: .leading, spacing: 10) {
                if model.sessionNoteEditMessageRoomID == session.callRoomId,
                   let message = model.sessionNoteEditMessage?.nonempty {
                    let hasHeldEdit = protectedEdits.contains { $0.disposition == .held }
                    let hasPendingEdit = protectedEdits.contains { $0.disposition == .pending }
                    Label(
                        message,
                        systemImage: hasHeldEdit
                            ? "exclamationmark.triangle.fill"
                            : hasPendingEdit ? "iphone.gen3.radiowaves.left.and.right" : "checkmark.shield"
                    )
                        .font(.caption)
                        .foregroundStyle(hasHeldEdit ? Color.orange : CapturePalette.accent)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("CaptureSessionNoteEditMessage")
                }

                if totalCount == 0 {
                    Text("No deliberate notes yet. Quick Note above can save privately, to this Session, for client review, or to the production team.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                ForEach(pendingNotes.prefix(4)) { entry in
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(spacing: 6) {
                            Label("Protected on iPhone", systemImage: "iphone.gen3.radiowaves.left.and.right")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.orange)
                            Spacer(minLength: 0)
                            Text(entry.noteVisibility?.title ?? "Only me")
                                .font(.caption2.weight(.bold))
                        }
                        Text(entry.displayTitle)
                            .font(.subheadline.weight(.bold))
                        Text(entry.body)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(4)
                        Text("\(entry.noteKind?.title ?? "Session note") · \(entry.noteVisibility?.boundary ?? MobileSessionNoteVisibility.authorPrivate.boundary)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(10)
                    .background(Color.orange.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("CaptureSessionNotePending_\(entry.clientRequestID)")
                }

                ForEach(canonicalNotes.prefix(8)) { note in
                    let protectedEdit = model.pendingSessionNoteEdit(for: note.id)
                    VStack(alignment: .leading, spacing: 5) {
                        HStack(alignment: .firstTextBaseline, spacing: 6) {
                            Text(note.purposeLabel)
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(CapturePalette.accent)
                            Text("·")
                                .foregroundStyle(.tertiary)
                            Text(note.audienceLabel)
                                .font(.caption2.weight(.bold))
                            Spacer(minLength: 0)
                            Text("\(note.revisionCount) rev")
                                .font(.caption2.monospacedDigit())
                                .foregroundStyle(.secondary)
                        }
                        Text(note.title?.nonempty ?? note.purposeLabel)
                            .font(.subheadline.weight(.bold))
                        Text(note.body)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(5)
                        if !note.tags.isEmpty {
                            Text(note.tags.map {
                                $0.isActive == false ? "#\($0.label) (retired)" : "#\($0.label)"
                            }.joined(separator: "  "))
                                .font(.caption2.weight(.semibold))
                                .foregroundStyle(.purple)
                                .lineLimit(2)
                        }
                        Text("\(note.origin) · \(note.isMine ? "Yours" : note.authorLabel). \(note.audienceBoundary)")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        if let protectedEdit {
                            Label(
                                protectedEdit.disposition == .held
                                    ? "Protected edit held for review"
                                    : "Protected edit waiting for Nest",
                                systemImage: protectedEdit.disposition == .held
                                    ? "exclamationmark.triangle.fill"
                                    : "iphone.gen3.radiowaves.left.and.right"
                            )
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(protectedEdit.disposition == .held ? Color.orange : CapturePalette.accent)
                            .accessibilityIdentifier("CaptureSessionNoteEditState_\(note.id)")
                            if let error = protectedEdit.lastErrorMessage {
                                Text(error)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                        if note.canEdit {
                            Button {
                                editingNote = note
                            } label: {
                                Label(
                                    protectedEdit == nil ? "Edit note" : "Review protected draft",
                                    systemImage: protectedEdit == nil ? "pencil" : "doc.text.magnifyingglass"
                                )
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .accessibilityIdentifier("CaptureSessionNoteEdit_\(note.id)")
                        }
                    }
                    .padding(10)
                    .background(CapturePalette.accent.opacity(0.055), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("CaptureSessionNoteCanonical_\(note.id)")
                }

                Text("Audience is a visibility decision, not a delivery receipt. Nest remains the canonical editor and revision history.")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureSessionNotesDeliveryBoundary")
            }
            .padding(.top, 10)
        } label: {
            HStack {
                Label("Session Notes", systemImage: "note.text")
                    .font(.headline)
                Spacer()
                Text(totalCount == 0 ? "None yet" : "\(totalCount)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(totalCount == 0 ? Color.secondary : CapturePalette.accent)
            }
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("CaptureSessionNotesToggle")
        }
        .captureCard()
        .accessibilityHint("Shows protected pending notes and canonical notes whose audience permits this account.")
        .sheet(item: $editingNote) { note in
            CaptureSessionNoteEditSheet(
                session: session,
                note: note,
                protectedEdit: model.pendingSessionNoteEdit(for: note.id),
                model: model
            )
        }
    }
}

private struct CaptureSessionNoteEditSheet: View {
    private enum FocusedField: Hashable {
        case title
        case body
    }

    let session: MobileCaptureSession
    let note: MobileCaptureSessionNote
    let protectedEdit: PendingSessionNoteEdit?
    @ObservedObject var model: CaptureExperienceModel
    @Environment(\.dismiss) private var dismiss
    @State private var title: String
    @State private var noteBody: String
    @State private var noteKind: MobileSessionNoteKind
    @State private var noteVisibility: MobileSessionNoteVisibility
    @State private var selectedTagIDs: Set<String>
    @State private var tagSearchText = ""
    @FocusState private var focusedField: FocusedField?

    init(
        session: MobileCaptureSession,
        note: MobileCaptureSessionNote,
        protectedEdit: PendingSessionNoteEdit?,
        model: CaptureExperienceModel
    ) {
        self.session = session
        self.note = note
        self.protectedEdit = protectedEdit
        self.model = model
        _title = State(initialValue: protectedEdit?.title ?? note.title ?? "")
        _noteBody = State(initialValue: protectedEdit?.body ?? note.body)
        _noteKind = State(initialValue: protectedEdit?.noteKind ?? MobileSessionNoteKind(rawValue: note.kind) ?? .sessionNote)
        _noteVisibility = State(initialValue: protectedEdit?.noteVisibility ?? MobileSessionNoteVisibility(rawValue: note.visibility) ?? .authorPrivate)
        _selectedTagIDs = State(initialValue: Set(protectedEdit?.tagIDs ?? note.tags.map(\.id)))
    }

    private var canUseProjectTeamNotes: Bool {
        session.canUseProjectTeamNotes == true
    }

    private var availableKinds: [MobileSessionNoteKind] {
        MobileSessionNoteKind.allCases.filter {
            $0 != .production || canUseProjectTeamNotes || $0 == noteKind
        }
    }

    private var availableVisibilities: [MobileSessionNoteVisibility] {
        MobileSessionNoteVisibility.allCases.filter {
            $0 != .projectTeam || canUseProjectTeamNotes || $0 == noteVisibility
        }
    }

    private var availableTags: [MobileCaptureTag] {
        let tags = session.availableTags ?? []
        let query = tagSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return tags }
        return tags.filter {
            $0.label.localizedCaseInsensitiveContains(query)
                || $0.slug.localizedCaseInsensitiveContains(query)
        }
    }

    private var isWaiting: Bool {
        protectedEdit?.disposition == .pending
    }

    private var canSave: Bool {
        !isWaiting
            && !noteBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && selectedTagIDs.count <= 24
            && !model.isSyncingSessionNoteEdits
    }

    var bodyView: some View {
        NavigationStack {
            Form {
                if let protectedEdit {
                    Section("Protected iPhone draft") {
                        LabeledContent(
                            "State",
                            value: protectedEdit.disposition == .held ? "Held for review" : "Waiting for Nest"
                        )
                        if protectedEdit.disposition == .held {
                            Text("Nest kept its newer canonical revision. Compare it below before deliberately rebasing this draft.")
                                .font(.caption)
                                .foregroundStyle(.orange)
                            if let error = protectedEdit.lastErrorMessage {
                                Text(error)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                        } else {
                            Text("This exact request may already be committed. Quipsly will retry the same identity before allowing another edit.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                if protectedEdit?.disposition == .held {
                    Section("Current Nest revision") {
                        LabeledContent("Purpose", value: note.purposeLabel)
                        LabeledContent("Audience", value: note.audienceLabel)
                        Text(note.title?.nonempty ?? "Untitled note")
                            .font(.subheadline.weight(.bold))
                        Text(note.body)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        if !note.tags.isEmpty {
                            Text(note.tags.map { "#\($0.label)" }.joined(separator: "  "))
                                .font(.caption2.weight(.semibold))
                        }
                    }
                }

                Section {
                    TextField("Title (optional)", text: $title, axis: .vertical)
                        .lineLimit(1...3)
                        .focused($focusedField, equals: .title)
                        .accessibilityIdentifier("CaptureSessionNoteEditTitle")
                    TextField("Session note", text: $noteBody, axis: .vertical)
                        .lineLimit(5...14)
                        .focused($focusedField, equals: .body)
                        .accessibilityIdentifier("CaptureSessionNoteEditBody")
                    Picker("Purpose", selection: $noteKind) {
                        ForEach(availableKinds) { kind in
                            Text(kind.title).tag(kind)
                        }
                    }
                    .pickerStyle(.navigationLink)
                    .accessibilityIdentifier("CaptureSessionNoteEditKind")
                    Picker("Audience", selection: $noteVisibility) {
                        ForEach(availableVisibilities) { visibility in
                            Text(visibility.title).tag(visibility)
                        }
                    }
                    .pickerStyle(.navigationLink)
                    .accessibilityIdentifier("CaptureSessionNoteEditVisibility")
                    LabeledContent("Audience boundary", value: noteVisibility.title)
                } header: {
                    Text("Edit")
                } footer: {
                    Text("\(noteVisibility.boundary) Editing never sends a message, changes work, schedules an event, or publishes anything.")
                        .accessibilityIdentifier("CaptureSessionNoteEditPolicyBoundary")
                }

                if canUseProjectTeamNotes {
                    Section {
                        let retiredTags = note.tags.filter { $0.isActive == false }
                        if !retiredTags.isEmpty {
                            Text("Retained retired tags: \(retiredTags.map { "#\($0.label)" }.joined(separator: "  "))")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if (session.availableTags ?? []).count > 8 {
                            TextField("Find a tag", text: $tagSearchText)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .accessibilityIdentifier("CaptureSessionNoteEditTagSearch")
                        }
                        ForEach(availableTags) { tag in
                            Button {
                                if selectedTagIDs.contains(tag.id) {
                                    selectedTagIDs.remove(tag.id)
                                } else if selectedTagIDs.count < 24 {
                                    selectedTagIDs.insert(tag.id)
                                }
                            } label: {
                                HStack {
                                    Text("#\(tag.label)")
                                    Spacer()
                                    if selectedTagIDs.contains(tag.id) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(CapturePalette.accent)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("CaptureSessionNoteEditTag_\(tag.id)")
                            .accessibilityValue(selectedTagIDs.contains(tag.id) ? "Selected" : "Not selected")
                        }
                    } header: {
                        Text("Nest tags")
                    } footer: {
                        Text("These are the same canonical tags used by Nest, Search, Library, Tasks, Goals, writing, and iPhone Capture.")
                    }
                } else if !note.tags.isEmpty {
                    Section {
                        Text(note.tags.map {
                            $0.isActive == false ? "#\($0.label) (retired)" : "#\($0.label)"
                        }.joined(separator: "  "))
                    } header: {
                        Text("Nest tags")
                    } footer: {
                        Text("The current tags remain attached. Owner or editor access is required to change shared Nest vocabulary assignments.")
                    }
                }

                Section {
                    Button {
                        let saved = model.saveSessionNoteEdit(
                            note: note,
                            roomID: session.callRoomId,
                            title: title,
                            body: noteBody,
                            noteKind: noteKind,
                            noteVisibility: noteVisibility,
                            tagIDs: selectedTagIDs.sorted(),
                            replacingHeld: protectedEdit?.disposition == .held
                        )
                        if saved { dismiss() }
                    } label: {
                        Label(
                            protectedEdit?.disposition == .held ? "Save reviewed draft over current revision" : "Protect edit and sync",
                            systemImage: "checkmark.shield"
                        )
                    }
                    .disabled(!canSave)
                    .accessibilityIdentifier("CaptureSessionNoteEditSave")

                    if protectedEdit != nil {
                        Button(role: .destructive) {
                            Task {
                                await model.discardSessionNoteEdit(noteID: note.id)
                                dismiss()
                            }
                        } label: {
                            Label("Discard protected draft", systemImage: "trash")
                        }
                        .accessibilityIdentifier("CaptureSessionNoteEditDiscard")
                    }
                } footer: {
                    Text("Nest remains canonical. A successful edit appends one revision and preserves the prior content, audience, and tag set.")
                }
            }
            .navigationTitle(protectedEdit == nil ? "Edit Session Note" : "Review Note Draft")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { dismiss() }
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                        .accessibilityIdentifier("CaptureSessionNoteEditKeyboardDone")
                }
            }
            .accessibilityIdentifier("CaptureSessionNoteEditSheet")
        }
    }

    var body: some View {
        bodyView
    }
}

struct CaptureQuickEntrySheet: View {
    private enum FocusedField: Hashable {
        case title
        case body
        case tagSearch
        case newTag
    }

    let kind: MobileQuickEntryKind
    let session: MobileCaptureSession?
    let initialProject: MobileCaptureProjectDestination?
    @ObservedObject var model: CaptureExperienceModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var entryBody = ""
    @State private var selectedTagIDs: Set<String> = []
    @State private var tagSearchText = ""
    @State private var newTagDraft = ""
    @State private var newTagLabels: [String] = []
    @State private var recurrenceMode = "NONE"
    @State private var recurrenceFrequency = "WEEKLY"
    @State private var recurrenceInterval = 1
    @State private var recurrenceFirstDueAt = Date().addingTimeInterval(86_400)
    @State private var recurrenceTimezoneID = TimeZone.autoupdatingCurrent.identifier
    @State private var showsRecurrenceTimezonePicker = false
    @State private var hasOneTimeDueDate = false
    @State private var oneTimeDueAt = Date().addingTimeInterval(86_400)
    @State private var hasOneTimeReminder = false
    @State private var oneTimeReminderAt = Date().addingTimeInterval(3_600)
    @State private var destination = "SESSION"
    @State private var noteKind = MobileSessionNoteKind.sessionNote
    @State private var noteVisibility = MobileSessionNoteVisibility.authorPrivate
    @FocusState private var focusedField: FocusedField?

    init(
        kind: MobileQuickEntryKind,
        session: MobileCaptureSession?,
        model: CaptureExperienceModel,
        initialProject: MobileCaptureProjectDestination? = nil
    ) {
        self.kind = kind
        self.session = session
        self.initialProject = initialProject
        self.model = model
        _destination = State(initialValue: initialProject.map { "NEST:\($0.id)" } ?? (session == nil ? "HOME_NEST" : "SESSION"))
    }

    private var homeNest: MobileCaptureProjectDestination? {
        model.captureProjects.first(where: \.isHome)
    }

    private var projectDestinations: [MobileCaptureProjectDestination] {
        var projects = model.captureProjects.filter { $0.isHomeNest == false }
        if let initialProject,
           initialProject.isHomeNest == false,
           !projects.contains(where: { $0.id == initialProject.id }) {
            projects.append(initialProject)
        }
        return projects
    }

    private var selectedProject: MobileCaptureProjectDestination? {
        guard destination.hasPrefix("NEST:") else { return nil }
        return model.captureProjects.first {
            destination == "NEST:\($0.id)"
        }
            ?? initialProject.flatMap {
                destination == "NEST:\($0.id)" ? $0 : nil
            }
    }

    private var savesNoteToHomeNest: Bool {
        kind == .note && savesToHomeNest
    }

    private var savesSessionNote: Bool {
        kind == .note && destination == "SESSION" && session != nil
    }

    private var canUseProjectTeamNotes: Bool {
        session?.canUseProjectTeamNotes == true
    }

    private var availableNoteKinds: [MobileSessionNoteKind] {
        canUseProjectTeamNotes
            ? MobileSessionNoteKind.allCases
            : MobileSessionNoteKind.allCases.filter { $0 != .production }
    }

    private var availableNoteVisibilities: [MobileSessionNoteVisibility] {
        canUseProjectTeamNotes
            ? MobileSessionNoteVisibility.allCases
            : MobileSessionNoteVisibility.allCases.filter { $0 != .projectTeam }
    }

    @ViewBuilder
    private var taskTimingSections: some View {
        Section {
            Picker("Repeat", selection: $recurrenceMode) {
                Text("Does not repeat").tag("NONE")
                Text("Fixed schedule").tag("FIXED")
                Text("After completion").tag("COMPLETION")
            }
            .pickerStyle(.navigationLink)
            .accessibilityIdentifier("CaptureQuickEntryRecurrenceMode")

            if recurrenceMode != "NONE" {
                DatePicker(
                    "First due",
                    selection: $recurrenceFirstDueAt,
                    displayedComponents: [.date, .hourAndMinute]
                )
                .environment(\.timeZone, recurrenceTimeZone)
                .accessibilityIdentifier("CaptureQuickEntryRecurrenceFirstDue")
                Picker("Unit", selection: $recurrenceFrequency) {
                    Text("Day").tag("DAILY")
                    Text("Week").tag("WEEKLY")
                    Text("Month").tag("MONTHLY")
                }
                .accessibilityIdentifier("CaptureQuickEntryRecurrenceFrequency")
                Stepper(
                    "Every \(recurrenceInterval) \(recurrenceUnitName)\(recurrenceInterval == 1 ? "" : "s")",
                    value: $recurrenceInterval,
                    in: 1...365
                )
                .accessibilityIdentifier("CaptureQuickEntryRecurrenceInterval")
                Button {
                    showsRecurrenceTimezonePicker = true
                } label: {
                    HStack(spacing: 10) {
                        Text("Timezone")
                            .foregroundStyle(.primary)
                        Spacer()
                        Text(recurrenceTimezoneID)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.trailing)
                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.tertiary)
                    }
                }
                .accessibilityLabel("Task timezone")
                .accessibilityValue(recurrenceTimezoneID)
                .accessibilityHint("Choose the timezone that owns this task's wall-clock schedule.")
                .accessibilityIdentifier("CaptureQuickEntryRecurrenceTimezone")
                Text("The wall-clock due time stays in \(recurrenceTimezoneID), even if this iPhone travels.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .accessibilityIdentifier("CaptureQuickEntryRecurrenceTimezoneBoundary")
            }
        } header: {
            Text("Repeat")
        } footer: {
            Text(recurrenceMode == "COMPLETION"
                ? "Quipsly creates one next occurrence after completion. It does not schedule a reminder or provider calendar event."
                : recurrenceMode == "FIXED"
                    ? "Quipsly creates a three-occurrence planning horizon at this local wall-clock time. It does not schedule a reminder or provider calendar event."
                    : "One-time tasks can have a due date or private iPhone reminder below.")
        }
        .onChange(of: recurrenceMode) { _, newValue in
            if newValue != "NONE" {
                hasOneTimeReminder = false
            }
        }

        if recurrenceMode == "NONE" {
            Section {
                Toggle("Set due date", isOn: $hasOneTimeDueDate)
                    .accessibilityIdentifier("CaptureQuickEntryDueDateToggle")
                if hasOneTimeDueDate {
                    DatePicker(
                        "Due",
                        selection: $oneTimeDueAt,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .accessibilityIdentifier("CaptureQuickEntryDueDate")
                    Text("This makes the task visible at the right time in Quipsly Today, Work, and Calendar. It does not schedule an alert or provider calendar event.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureQuickEntryDueDateBoundary")
                }
                Toggle("Remind me", isOn: $hasOneTimeReminder)
                    .accessibilityIdentifier("CaptureQuickEntryReminderToggle")
                if hasOneTimeReminder {
                    DatePicker(
                        "Reminder",
                        selection: $oneTimeReminderAt,
                        in: Date().addingTimeInterval(60)...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .accessibilityIdentifier("CaptureQuickEntryReminderDate")
                    Text("The reminder intent syncs to Nest, while this iPhone privately schedules the alert. Quipsly asks for notification permission only when you save.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureQuickEntryReminderBoundary")
                }
            } header: {
                Text("Timing")
            } footer: {
                Text("Due dates organize Quipsly. Reminders are separate, device-local alerts with canonical intent in Nest. Neither creates a provider calendar event.")
            }
        }
    }

    private var savesToHomeNest: Bool {
        kind != .source && destination == "HOME_NEST"
    }

    private var availableTags: [MobileCaptureTag] {
        if savesToHomeNest { return homeNest?.tags ?? [] }
        if let selectedProject { return selectedProject.tags }
        return session?.availableTags ?? []
    }

    private var visibleTags: [MobileCaptureTag] {
        let query = tagSearchText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !query.isEmpty else { return availableTags }
        return availableTags.filter {
            $0.label.localizedCaseInsensitiveContains(query)
                || $0.slug.localizedCaseInsensitiveContains(query)
        }
    }

    private var destinationProjectID: String? {
        selectedProject?.id
    }

    private var destinationProjectName: String? {
        selectedProject?.name
    }

    private var destinationLabel: String {
        if savesToHomeNest { return homeNest?.name ?? "Private Home Nest" }
        if let selectedProject { return selectedProject.name }
        return session?.displayTitle ?? "Private Home Nest"
    }

    private var normalizedNewTagDraft: String {
        newTagDraft
            .precomposedStringWithCompatibilityMapping
            .replacingOccurrences(of: #"[\u{0000}-\u{001F}\u{007F}]"#, with: "", options: .regularExpression)
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .replacingOccurrences(of: #"^#+\s*"#, with: "", options: .regularExpression)
            .replacingOccurrences(of: #"\s+"#, with: " ", options: .regularExpression)
    }

    private var selectedTagCount: Int {
        selectedTagIDs.count + newTagLabels.count
    }

    private func canonicalTagLabel(_ label: String) -> String {
        label.folding(
            options: [.caseInsensitive, .diacriticInsensitive],
            locale: Locale(identifier: "en_US_POSIX")
        )
    }

    private func addNewTagIntent() {
        let label = normalizedNewTagDraft
        guard !label.isEmpty, label.count <= 80, selectedTagCount < 8 else { return }
        if let existing = availableTags.first(where: {
            canonicalTagLabel($0.label) == canonicalTagLabel(label)
        }) {
            selectedTagIDs.insert(existing.id)
            newTagDraft = ""
            return
        }
        guard !newTagLabels.contains(where: {
            canonicalTagLabel($0) == canonicalTagLabel(label)
        }) else {
            newTagDraft = ""
            return
        }
        newTagLabels.append(label)
        newTagDraft = ""
    }

    private var recurrence: MobileQuickEntryRecurrence? {
        guard kind == .task, recurrenceMode != "NONE" else { return nil }
        let timezone = recurrenceTimeZone
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = timezone
        let components = calendar.dateComponents(in: timezone, from: recurrenceFirstDueAt)
        guard let year = components.year,
              let month = components.month,
              let day = components.day,
              let hour = components.hour,
              let minute = components.minute else { return nil }
        return MobileQuickEntryRecurrence(
            cadence: recurrenceMode,
            frequency: recurrenceFrequency,
            interval: recurrenceInterval,
            timezone: timezone.identifier,
            localTimeMinutes: hour * 60 + minute,
            anchorLocalDate: String(format: "%04d-%02d-%02d", year, month, day)
        )
    }

    private var dueAt: Date? {
        kind == .task && recurrenceMode == "NONE" && hasOneTimeDueDate
            ? oneTimeDueAt
            : nil
    }

    private var reminderAt: Date? {
        kind == .task && recurrenceMode == "NONE" && hasOneTimeReminder
            ? oneTimeReminderAt
            : nil
    }

    private var recurrenceTimeZone: TimeZone {
        TimeZone(identifier: recurrenceTimezoneID) ?? .autoupdatingCurrent
    }

    private func selectRecurrenceTimeZone(_ identifier: String) {
        guard let newTimeZone = TimeZone(identifier: identifier) else { return }
        let oldTimeZone = recurrenceTimeZone
        var oldCalendar = Calendar(identifier: .gregorian)
        oldCalendar.timeZone = oldTimeZone
        let wallClockComponents = oldCalendar.dateComponents(
            [.year, .month, .day, .hour, .minute],
            from: recurrenceFirstDueAt
        )
        var newCalendar = Calendar(identifier: .gregorian)
        newCalendar.timeZone = newTimeZone
        if let sameWallClockInNewZone = newCalendar.date(from: wallClockComponents) {
            recurrenceFirstDueAt = sameWallClockInNewZone
        }
        recurrenceTimezoneID = newTimeZone.identifier
    }

    private var recurrenceUnitName: String {
        switch recurrenceFrequency {
        case "DAILY": "day"
        case "MONTHLY": "month"
        default: "week"
        }
    }

    var contentIsValid: Bool {
        kind == .note || kind == .source
            ? !entryBody.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            : !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    var bodyView: some View {
        NavigationStack {
            Form {
                Section {
                    if kind == .source {
                        LabeledContent("Destination", value: "Personal Inbox")
                        LabeledContent("Shared Nest", value: "Not chosen yet")
                    } else {
                        Picker("Save to", selection: $destination) {
                            if session != nil {
                                Text("Current Session").tag("SESSION")
                            }
                            Text("Home Nest").tag("HOME_NEST")
                            ForEach(projectDestinations) { project in
                                Text(project.name).tag("NEST:\(project.id)")
                            }
                        }
                        .pickerStyle(.navigationLink)
                        .accessibilityIdentifier(kind == .note ? "CaptureQuickEntryNoteDestination" : "CaptureQuickEntryDestination")
                        if savesToHomeNest {
                            LabeledContent("Destination", value: homeNest?.name ?? "Private Home Nest")
                            LabeledContent("Session", value: "None")
                        } else if let selectedProject {
                            LabeledContent("Destination", value: selectedProject.name)
                            LabeledContent("Project capture", value: "No Session invented")
                        } else {
                            LabeledContent("Session", value: session?.displayTitle ?? "Unavailable")
                            LabeledContent("Nest", value: session?.projectName?.nonempty ?? session?.projectSlug?.nonempty ?? "Unfiled")
                        }
                    }
                } footer: {
                    Text(kind == .source
                        ? "This source stays private and unfiled in your Inbox until you deliberately choose a Research Nest. It does not send, schedule, deliver, or publish anything."
                        : savesToHomeNest
                            ? kind == .note
                                ? "This note journals to the protected phone outbox first, then becomes one private document-kernel note in your Home Nest. It does not invent a Session, send, schedule, deliver, or publish anything."
                                : "This \(kind.title.lowercased()) journals to the protected phone outbox first, then becomes private Home Nest work assigned to you. It does not invent a Session, send, schedule, deliver, or publish anything."
                        : selectedProject != nil
                            ? "This capture journals to the protected phone outbox first, then saves directly in \(destinationLabel) without inventing a Session. It does not send, schedule, deliver, or publish anything."
                            : "This explicit capture stays private to your account and Session access. It does not send, schedule, deliver, or publish anything.")
                }

                Section(kind == .note ? "Note" : kind.title) {
                    if kind != .note || savesNoteToHomeNest || selectedProject != nil {
                        TextField(kind == .note ? "Title (optional)" : kind == .task ? "What needs doing?" : kind == .goal ? "What does better look like?" : "Source title (optional)", text: $title)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .body }
                            .focused($focusedField, equals: .title)
                            .accessibilityIdentifier("CaptureQuickEntryTitle")
                    }
                    TextField(
                        kind == .note ? "Capture the thought…" : kind == .task ? "Useful detail or definition of done (optional)" : kind == .goal ? "Why it matters or how progress will look (optional)" : "Paste a web link or quoted text…",
                        text: $entryBody,
                        axis: .vertical
                    )
                    .lineLimit(kind == .note || kind == .source ? 5...12 : 3...10)
                    .focused($focusedField, equals: .body)
                    .accessibilityIdentifier("CaptureQuickEntryBody")
                }

                if savesSessionNote {
                    Section {
                        Picker("Purpose", selection: $noteKind) {
                            ForEach(availableNoteKinds) { purpose in
                                Text(purpose.title).tag(purpose)
                            }
                        }
                        .pickerStyle(.navigationLink)
                        .accessibilityIdentifier("CaptureQuickEntryNoteKind")

                        Picker("Audience", selection: $noteVisibility) {
                            ForEach(availableNoteVisibilities) { audience in
                                Text(audience.title).tag(audience)
                            }
                        }
                        .pickerStyle(.navigationLink)
                        .accessibilityIdentifier("CaptureQuickEntryNoteVisibility")

                        LabeledContent("Current audience", value: noteVisibility.title)
                            .accessibilityIdentifier("CaptureQuickEntryNoteVisibilityReadback")
                    } header: {
                        Text("Purpose & audience")
                    } footer: {
                        Text("\(noteVisibility.boundary) Choosing an audience never sends a message, changes a task, schedules an event, or publishes anything.")
                            .accessibilityIdentifier("CaptureQuickEntryNotePolicyBoundary")
                    }
                }

                if kind == .task {
                    taskTimingSections
                }

                if kind != .source {
                    Section {
                        if availableTags.count > 8 {
                            TextField("Find a tag", text: $tagSearchText)
                                .textInputAutocapitalization(.never)
                                .autocorrectionDisabled()
                                .focused($focusedField, equals: .tagSearch)
                                .accessibilityIdentifier("CaptureQuickEntryTagSearch")
                        }

                        if !tagSearchText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty,
                           visibleTags.isEmpty {
                            ContentUnavailableView.search(text: tagSearchText)
                        }

                        ForEach(visibleTags) { tag in
                            Button {
                                if selectedTagIDs.contains(tag.id) {
                                    selectedTagIDs.remove(tag.id)
                                } else if selectedTagCount < 8 {
                                    selectedTagIDs.insert(tag.id)
                                }
                            } label: {
                                HStack {
                                    Label(tag.label, systemImage: "tag")
                                    Spacer()
                                    if selectedTagIDs.contains(tag.id) {
                                        Image(systemName: "checkmark.circle.fill")
                                            .foregroundStyle(.tint)
                                    }
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityIdentifier("CaptureQuickEntryTag_\(tag.id)")
                            .accessibilityValue(selectedTagIDs.contains(tag.id) ? "Selected" : "Not selected")
                        }

                        ForEach(newTagLabels, id: \.self) { label in
                            Button {
                                newTagLabels.removeAll { $0 == label }
                            } label: {
                                HStack {
                                    Label(label, systemImage: "tag.fill")
                                    Spacer()
                                    Text("New on sync")
                                        .font(.caption.weight(.semibold))
                                        .foregroundStyle(.secondary)
                                    Image(systemName: "xmark.circle.fill")
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Remove new tag \(label)")
                        }

                        HStack(alignment: .firstTextBaseline, spacing: 10) {
                            TextField("New reusable tag", text: $newTagDraft)
                                .textInputAutocapitalization(.words)
                                .submitLabel(.done)
                                .onSubmit(addNewTagIntent)
                                .focused($focusedField, equals: .newTag)
                                .accessibilityIdentifier("CaptureQuickEntryNewTagField")
                            Button("Add", action: addNewTagIntent)
                                .disabled(
                                    normalizedNewTagDraft.isEmpty
                                    || normalizedNewTagDraft.count > 80
                                    || selectedTagCount >= 8
                                )
                                .accessibilityIdentifier("CaptureQuickEntryNewTagAdd")
                        }
                    } header: {
                        Text("Nest tags")
                    } footer: {
                        Text(savesToHomeNest
                            ? "Choose or name up to eight private Home Nest tags. The protected phone outbox retains their exact identities until Nest links them to this \(kind.title.lowercased())."
                            : selectedProject != nil
                                ? "Choose or name up to eight tags from \(destinationLabel). New names stay protected on this iPhone until that Nest creates or reuses the canonical vocabulary."
                            : "Choose or name up to eight tags. New names are protected in the phone outbox, then Nest creates or reuses the private canonical tag during sync. Work, Search, and this Session use that same canonical tag; Today keeps it when the work is planned or needs attention there.")
                    }
                }

                Section {
                    Label("Saved on this iPhone before Nest sync", systemImage: "iphone.gen3.radiowaves.left.and.right")
                    Label("Retry keeps one canonical ID", systemImage: "arrow.triangle.2.circlepath")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            }
            .accessibilityIdentifier("CaptureQuickEntryForm")
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Quick \(kind.title)")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        if model.saveQuickEntry(
                            kind: kind,
                            title: title,
                            body: entryBody,
                            saveToHomeNest: savesToHomeNest,
                            destinationProjectID: destinationProjectID,
                            destinationProjectName: destinationProjectName,
                            noteKind: savesSessionNote ? noteKind : nil,
                            noteVisibility: savesSessionNote ? noteVisibility : nil,
                            tagIDs: Array(selectedTagIDs).sorted(),
                            newTagLabels: newTagLabels,
                            dueAt: dueAt,
                            reminderAt: reminderAt,
                            recurrence: recurrence
                        ) {
                            dismiss()
                        }
                    }
                    .disabled(!contentIsValid)
                    .accessibilityIdentifier("CaptureQuickEntrySave")
                }
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") {
                        focusedField = nil
                    }
                    .accessibilityIdentifier("CaptureQuickEntryKeyboardDone")
                }
            }
        }
        .sheet(isPresented: $showsRecurrenceTimezonePicker) {
            CaptureTimeZonePickerSheet(
                selectedIdentifier: recurrenceTimezoneID,
                onSelect: selectRecurrenceTimeZone
            )
        }
        .onChange(of: destination) { _, _ in
            selectedTagIDs.removeAll()
            newTagLabels.removeAll()
            newTagDraft = ""
            tagSearchText = ""
            if !savesSessionNote {
                noteKind = .sessionNote
                noteVisibility = .authorPrivate
            } else {
                if !availableNoteKinds.contains(noteKind) { noteKind = .sessionNote }
                if !availableNoteVisibilities.contains(noteVisibility) { noteVisibility = .authorPrivate }
            }
        }
        .accessibilityIdentifier("CaptureQuickEntrySheet_\(kind.rawValue)")
    }

    var body: some View { bodyView }
}

private struct CaptureTimeZonePickerSheet: View {
    @Environment(\.dismiss) private var dismiss
    @State private var searchText = ""

    let selectedIdentifier: String
    let onSelect: (String) -> Void

    private var currentIdentifier: String {
        TimeZone.autoupdatingCurrent.identifier
    }

    private var matchingIdentifiers: [String] {
        let query = searchText.trimmingCharacters(in: .whitespacesAndNewlines)
        return TimeZone.knownTimeZoneIdentifiers
            .filter { identifier in
                identifier != currentIdentifier
                    && (query.isEmpty || identifier.localizedCaseInsensitiveContains(query))
            }
    }

    var body: some View {
        NavigationStack {
            List {
                Section("This iPhone") {
                    timeZoneButton(currentIdentifier)
                }

                Section(searchText.isEmpty ? "All timezones" : "Matches") {
                    ForEach(matchingIdentifiers, id: \.self) { identifier in
                        timeZoneButton(identifier)
                    }
                }
            }
            .navigationTitle("Task timezone")
            .navigationBarTitleDisplayMode(.inline)
            .searchable(text: $searchText, prompt: "City or IANA timezone")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
        }
        .accessibilityIdentifier("CaptureRecurrenceTimezonePicker")
    }

    private func timeZoneButton(_ identifier: String) -> some View {
        Button {
            onSelect(identifier)
            dismiss()
        } label: {
            HStack(alignment: .firstTextBaseline, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(identifier.replacingOccurrences(of: "_", with: " "))
                        .foregroundStyle(.primary)
                    Text(offsetLabel(for: identifier))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                if identifier == selectedIdentifier {
                    Image(systemName: "checkmark")
                        .fontWeight(.semibold)
                        .foregroundStyle(.tint)
                }
            }
        }
        .accessibilityLabel(identifier)
        .accessibilityValue(identifier == selectedIdentifier ? "Selected" : offsetLabel(for: identifier))
        .accessibilityIdentifier("CaptureRecurrenceTimezone_\(identifier)")
    }

    private func offsetLabel(for identifier: String) -> String {
        guard let timeZone = TimeZone(identifier: identifier) else { return "Unknown offset" }
        let seconds = timeZone.secondsFromGMT(for: Date())
        let sign = seconds < 0 ? "−" : "+"
        let magnitude = abs(seconds)
        let hours = magnitude / 3_600
        let minutes = (magnitude % 3_600) / 60
        let abbreviation = timeZone.abbreviation(for: Date()).map { " · \($0)" } ?? ""
        return String(format: "GMT%@%02d:%02d%@", sign, hours, minutes, abbreviation)
    }
}

private struct CaptureLibraryView: View {
    @ObservedObject var model: CaptureExperienceModel
    @Binding var visibleTab: CaptureRootTab
    @EnvironmentObject private var audioCapture: AudioCaptureController
    @StateObject private var library = LocalRecordingLibrary.shared
    @StateObject private var playback = LocalRecordingPlaybackController()
    @State private var recordingPendingLocalDeletion: LocalRecording?

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Every source stays visible")
                        .font(.title2.weight(.bold))
                    Text("Capture success means saved locally. Upload and server verification are separate steps.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .frame(maxWidth: .infinity, alignment: .leading)

                if model.uploadManager.isUploading || model.uploadManager.recoverableUploadCount > 0 {
                    UploadActivityCard(model: model)
                }

                if let playbackError = playback.errorMessage {
                    CaptureInlineWarning(text: playbackError)
                }

                if let libraryError = library.persistenceError {
                    CaptureInlineWarning(text: libraryError)
                        .accessibilityIdentifier("CaptureLibraryJournalWarning")
                }

                if library.recordings.isEmpty {
                    if model.usesPreviewData {
                        CaptureLibraryPreviewSourceCard()
                        NavigationLink {
                            CaptureSourceEvidencePreviewView()
                        } label: {
                            Label("Review source evidence", systemImage: "checkmark.shield")
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureSourceEvidencePreviewLink")
                        NavigationLink {
                            CaptureTranscriptReviewView(
                                roomID: "room-preview-coaching-ready",
                                sessionTitle: "Demo coaching session",
                                recording: nil,
                                previewOnly: true
                            )
                        } label: {
                            Label("Review transcript", systemImage: "waveform.and.magnifyingglass")
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureTranscriptReviewPreviewLink")
                    } else {
                        CaptureEmptyCard(
                            systemImage: "waveform",
                            title: "No local recordings yet",
                            detail: "Your first completed take will appear here before any upload is considered complete.",
                            actionTitle: "Open recorder",
                            action: { visibleTab = .record }
                        )
                    }
                } else {
                    ForEach(library.recordings) { recording in
                        LocalRecordingRow(
                            recording: recording,
                            fileURL: library.fileURL(for: recording),
                            isPlaying: playback.playingRecordingID == recording.id,
                            canAudition: !model.isSessionContextLocked,
                            canRequestDeletion: !model.isSessionContextLocked,
                            onPlay: { playback.toggle(recording: recording, library: library) },
                            onRetry: { model.retryUpload(for: recording) },
                            onDelete: {
                                playback.stop()
                                recordingPendingLocalDeletion = recording
                            },
                            previewOnly: model.usesPreviewData
                        )
                    }
                }
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 96)
        }
        .background(CaptureCanvas())
        .navigationTitle("Library")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if model.uploadManager.recoverableUploadCount > 0 {
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Retry") { model.retryUploads() }
                        .disabled(model.uploadManager.isUploading || captureIsActive)
                }
            }
        }
        .accessibilityIdentifier("CaptureLibraryView")
        .sheet(item: $recordingPendingLocalDeletion) { requestedRecording in
            let recording = library.recording(id: requestedRecording.id) ?? requestedRecording
            LocalRecordingDeletionSheet(
                recording: recording,
                fileURL: library.fileURL(for: recording),
                onDelete: {
                    playback.stop()
                    try model.deleteLocalOriginal(for: recording, from: library)
                }
            )
        }
        .sheet(
            isPresented: Binding(
                get: { playback.videoPlayer != nil },
                set: { isPresented in
                    if !isPresented {
                        playback.stop()
                    }
                }
            )
        ) {
            CaptureLocalVideoPlayerSheet(
                title: playingVideoTitle,
                profileLabel: playingVideoProfileLabel,
                player: playback.videoPlayer,
                onDone: { playback.stop() }
            )
        }
        .onDisappear { playback.stop() }
    }

    private var playingVideoTitle: String {
        guard let recordingID = playback.playingRecordingID else {
            return "Local video source"
        }
        return library.recording(id: recordingID)?.displayTitle
            ?? "Local video source"
    }

    private var playingVideoProfileLabel: String? {
        guard let recordingID = playback.playingRecordingID else {
            return nil
        }
        return library.recording(id: recordingID)?.recordedVideoProfileLabel
    }

    private var captureIsActive: Bool {
        switch audioCapture.captureState {
        case .recording, .paused, .finalizing: true
        default: false
        }
    }
}

private struct CaptureLibraryPreviewSourceCard: View {
    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "waveform.circle.fill")
                    .font(.title2)
                    .foregroundStyle(CapturePalette.accent)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 3) {
                    Text("Demo coaching session")
                        .font(.headline)
                    Text("Synthetic local source · 18.4 MB")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Spacer(minLength: 8)
            }

            HStack(spacing: 8) {
                CaptureStatusPill(
                    label: "Saved on iPhone",
                    systemImage: "internaldrive.fill",
                    tint: .green
                )
                CaptureStatusPill(
                    label: "Waiting for Nest",
                    systemImage: "arrow.clockwise.icloud",
                    tint: .orange
                )
            }

            Text("The original is safe on this iPhone. Upload can be retried after reconnecting; Quipsly will not call it verified until the cloud copy matches.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            Label("Recoverable · retry available when online", systemImage: "checkmark.shield.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(CapturePalette.accent)
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureLibraryPreviewSourceCard")
    }
}

private struct CaptureAccountView: View {
    @ObservedObject var model: CaptureExperienceModel
    @Binding var visibleTab: CaptureRootTab
    @EnvironmentObject private var audioCapture: AudioCaptureController
    @EnvironmentObject private var videoCapture: VideoCaptureController
    @StateObject private var auth = AuthManager.shared
    @StateObject private var library = LocalRecordingLibrary.shared
    @StateObject private var deletionClient = AccountDeletionClient()
    @AppStorage("com.quipsly.capture.upload.allowsCellular") private var allowsCellular = true
    @AppStorage("com.quipsly.capture.upload.allowsExpensive") private var allowsExpensive = true
    @AppStorage("com.quipsly.capture.upload.allowsConstrained") private var allowsConstrained = true
    @State private var showsDeletion = false
    @State private var showsSignOutWarning = false

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String ?? "https://nest.quipsly.com"
    )

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                accountHeader

                VStack(alignment: .leading, spacing: 14) {
                    Label("Upload policy", systemImage: "antenna.radiowaves.left.and.right")
                        .font(.headline)
                    Toggle("Use cellular data", isOn: $allowsCellular)
                    Toggle("Use expensive networks", isOn: $allowsExpensive)
                        .disabled(!allowsCellular)
                    Toggle("Use Low Data Mode", isOn: $allowsConstrained)
                    Text("These choices apply to new background upload tasks. Local recording never waits for the network.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .captureCard()

                VStack(alignment: .leading, spacing: 12) {
                    Label("On this iPhone", systemImage: "internaldrive")
                        .font(.headline)
                    LabeledContent("Local originals", value: "\(localOriginalCount)")
                    if localDeletionReceiptCount > 0 {
                        LabeledContent("Deletion receipts", value: "\(localDeletionReceiptCount)")
                    }
                    LabeledContent("Source media", value: ByteCountFormatter.string(fromByteCount: totalLocalBytes, countStyle: .file))
                    Text("Quipsly never silently deletes originals. Only you can delete an eligible local source after reviewing its cloud status and confirming the irreversible action.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .captureCard()

                DisclosureGroup {
                    VStack(alignment: .leading, spacing: 12) {
                        Text("Share a small redacted snapshot when a TestFlight install, sign-in, recording, room, or upload needs help.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)

                        LabeledContent(
                            "App",
                            value: versionLine
                        )
                        LabeledContent(
                            "Nest",
                            value: supportNestHost
                        )

                        ShareLink(
                            item: supportSnapshot.shareText,
                            subject: Text(
                                "Quipsly Capture support snapshot"
                            )
                        ) {
                            Label(
                                "Share support snapshot",
                                systemImage: "square.and.arrow.up"
                            )
                            .frame(
                                maxWidth: .infinity,
                                alignment: .center
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityHint(
                            "Opens the iPhone share sheet with redacted app, device, route-type, and local-state diagnostics."
                        )
                        .accessibilityIdentifier(
                            "CaptureShareSupportSnapshot"
                        )

                        Text(CaptureSupportSnapshot.privacyBoundary)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(
                                horizontal: false,
                                vertical: true
                            )
                            .accessibilityIdentifier(
                                "CaptureSupportPrivacyBoundary"
                            )
                    }
                    .padding(.top, 12)
                } label: {
                    Label(
                        "Help & diagnostics",
                        systemImage: "lifepreserver"
                    )
                    .font(.headline)
                    .accessibilityIdentifier(
                        "CaptureSupportDisclosure"
                    )
                }
                .captureCard()

                VStack(alignment: .leading, spacing: 0) {
                    Link(destination: URL(string: "\(baseURL)/privacy")!) {
                        AccountLinkRow(label: "Privacy policy", systemImage: "hand.raised")
                    }
                    Divider().padding(.leading, 42)
                    Link(destination: URL(string: "\(baseURL)/privacy/account-deletion")!) {
                        AccountLinkRow(label: "Account deletion information", systemImage: "person.crop.circle.badge.minus")
                    }
                    Divider().padding(.leading, 42)
                    Button(role: .destructive) { showsDeletion = true } label: {
                        AccountLinkRow(label: "Request account deletion", systemImage: "trash")
                    }
                    .disabled(model.isSessionContextLocked)
                }
                .captureCard(contentPadding: 4)

                if let request = deletionClient.latestRequest {
                    AccountDeletionStatusCard(
                        request: request,
                        client: deletionClient,
                        onOpen: { showsDeletion = true }
                    )
                }

                Button(role: .destructive) {
                    if model.isSessionContextLocked {
                        showsSignOutWarning = true
                    } else if model.usesPreviewData {
                        model.message = "Sign out is disabled in preview mode."
                    } else {
                        auth.signOut()
                    }
                } label: {
                    Text("Sign out")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)

                Text(versionLine)
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
                    .accessibilityIdentifier(
                        "CaptureVersionBuild"
                    )
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 96)
        }
        .background(CaptureCanvas())
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CaptureAccountView")
        .sheet(isPresented: $showsDeletion) {
            AccountDeletionSheet(
                isPresented: $showsDeletion,
                client: deletionClient,
                usesPreviewData: model.usesPreviewData
            )
            .presentationDetents([.medium, .large])
        }
        .alert("Capture session is still active", isPresented: $showsSignOutWarning) {
            Button("Keep session active", role: .cancel) {}
            Button("Open recorder") { visibleTab = .record }
        } message: {
            Text("Stop and save the local source and leave any live room before signing out.")
        }
        .task {
            guard !model.usesPreviewData else { return }
            await deletionClient.loadStatus()
        }
    }

    private var accountHeader: some View {
        HStack(spacing: 14) {
            ZStack {
                Circle().fill(CapturePalette.accent.opacity(0.14))
                Image(systemName: "person.fill")
                    .font(.title2)
                    .foregroundStyle(CapturePalette.accent)
            }
            .frame(width: 54, height: 54)
            .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 3) {
                Text(auth.userName ?? (model.usesPreviewData ? "Preview Creator" : "Quipsly creator"))
                    .font(.headline)
                Text(auth.userEmail ?? (model.usesPreviewData ? "preview@quipsly.local" : "Signed in"))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .captureCard()
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Signed in account")
        .accessibilityValue(
            "\(auth.userName ?? (model.usesPreviewData ? "Preview Creator" : "Quipsly creator")), \(auth.userEmail ?? (model.usesPreviewData ? "preview@quipsly.local" : "Signed in"))"
        )
    }

    private var totalLocalBytes: Int64 {
        library.recordings.reduce(0) { $0 + $1.byteCount }
    }

    private var localOriginalCount: Int {
        library.recordings.filter { $0.status != .deletedLocally && $0.status != .missingFile }.count
    }

    private var localDeletionReceiptCount: Int {
        library.recordings.filter { $0.status == .deletedLocally }.count
    }

    private var captureIsActive: Bool {
        switch audioCapture.captureState {
        case .recording, .paused, .finalizing: true
        default: false
        }
    }

    private var versionLine: String {
        let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
        let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
        return "Quipsly Capture \(version) (\(build))"
    }

    private var supportNestHost: String {
        URL(string: baseURL)?.host
            ?? "configured Nest"
    }

    private var supportSnapshot: CaptureSupportSnapshot {
        let runtime = CaptureRuntimeEvidence.current()
        return CaptureSupportSnapshot(
            generatedAt: Date(),
            surface: "Account",
            appVersion: runtime.appVersion,
            appBuild: runtime.appBuild,
            deviceModelIdentifier:
                runtime.deviceModelIdentifier,
            systemName: runtime.systemName,
            systemVersion: runtime.systemVersion,
            accountAccessMode: auth.accessMode.rawValue,
            nestHost: supportNestHost,
            audioCaptureState:
                audioCapture.captureState.rawValue,
            videoCaptureState:
                videoCapture.state.rawValue,
            roomState:
                model.providerRoom.isConnected
                    ? "connected"
                    : model.providerRoom.isConnecting
                        ? "connecting"
                        : "not connected",
            audioRoutePortType:
                runtime.audioRoutePortType,
            localOriginalCount: localOriginalCount,
            recoverableUploadCount:
                model.uploadManager.recoverableUploadCount,
            previewMode: model.usesPreviewData
        )
    }
}

private struct NextCaptureCard: View {
    let session: MobileCaptureSession
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("UP NEXT")
                        .font(.caption2.weight(.bold))
                        .tracking(1.2)
                        .foregroundStyle(CapturePalette.accent)
                    Text(session.displayTitle)
                        .font(.title2.weight(.bold))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(session.captureScheduleLabel)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                CaptureStatusPill(
                    label: session.canRecordNow ? "Ready" : "Consent needed",
                    systemImage: session.canRecordNow ? "checkmark" : "exclamationmark",
                    tint: session.canRecordNow ? .green : .orange
                )
            }

            Text(session.captureReadinessNextAction)
                .font(.subheadline)
                .foregroundStyle(.secondary)

            Button(action: action) {
                Label(session.canRecordNow ? "Open recorder" : "Prepare session", systemImage: "arrow.right.circle.fill")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .accessibilityIdentifier("CaptureOpenNextSessionButton")
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureNextSessionCard")
    }
}

private struct SessionListRow: View {
    let session: MobileCaptureSession
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: session.capturePurposeIcon)
                    .font(.headline)
                    .foregroundStyle(CapturePalette.accent)
                    .frame(width: 34, height: 34)
                    .background(CapturePalette.accent.opacity(0.11), in: Circle())

                VStack(alignment: .leading, spacing: 3) {
                    Text(session.displayTitle)
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(session.captureScheduleLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer()
                Image(systemName: session.hasCurrentRecordingConsent ? "checkmark.shield.fill" : "shield.lefthalf.filled.badge.checkmark")
                    .foregroundStyle(session.hasCurrentRecordingConsent ? .green : .orange)
                    .accessibilityLabel(session.hasCurrentRecordingConsent ? "Consent granted" : "Consent needed")
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
            .padding(12)
            .background(isSelected ? CapturePalette.accent.opacity(0.08) : Color.clear, in: RoundedRectangle(cornerRadius: 15, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("CaptureSessionListRow_\(session.id)")
    }
}

private struct SessionChooserButton: View {
    let session: MobileCaptureSession?
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: session?.capturePurposeIcon ?? "calendar")
                    .foregroundStyle(CapturePalette.accent)
                VStack(alignment: .leading, spacing: 2) {
                    Text("SESSION")
                        .font(.caption2.weight(.bold))
                        .tracking(1)
                        .foregroundStyle(.secondary)
                    Text(session?.displayTitle ?? "Choose a session")
                        .font(.headline)
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    if let session {
                        Text(session.projectName?.nonempty ?? (session.projectBindingSource == "unfiled-session" ? "Unfiled Session" : session.projectSlug?.nonempty ?? "Nest not resolved"))
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(session.projectBindingSource == "unfiled-session" ? Color.orange : Color.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                            .accessibilityIdentifier("CaptureSessionProject_\(session.id)")
                    }
                }
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            .padding(14)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("CaptureSessionChooser")
    }
}

private struct ConsentStrip: View {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    let session: MobileCaptureSession
    let isBusy: Bool
    let isCaptureActive: Bool
    let onGrant: () -> Void
    let onRevoke: () -> Void

    var body: some View {
        Group {
            if dynamicTypeSize.isAccessibilitySize {
                accessibilityLayout
            } else {
                standardLayout
            }
        }
        .padding(13)
        .background((session.hasCurrentRecordingConsent ? Color.green : Color.orange).opacity(0.09), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureConsentStrip")
    }

    private var standardLayout: some View {
        HStack(spacing: 12) {
            consentIcon

            VStack(alignment: .leading, spacing: 2) {
                Text(consentTitle)
                    .font(.subheadline.weight(.semibold))
                Text(consentDetail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
            consentAction
        }
    }

    private var accessibilityLayout: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .center, spacing: 10) {
                consentIcon
                Text(consentTitle)
                    .font(.subheadline.weight(.semibold))
                    .fixedSize(horizontal: false, vertical: true)
                Spacer(minLength: 8)
                consentAction
            }

            Text(consentDetail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var consentIcon: some View {
        Image(systemName: session.hasCurrentRecordingConsent ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
            .font(.title3)
            .foregroundStyle(session.hasCurrentRecordingConsent ? .green : .orange)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var consentAction: some View {
        if isBusy {
            ProgressView()
        } else if session.hasCurrentRecordingConsent {
            Menu {
                Button("Revoke consent", role: .destructive, action: onRevoke)
                    .disabled(isCaptureActive)
            } label: {
                Image(systemName: "ellipsis.circle")
                    .font(.title3)
                    .frame(minWidth: 44, minHeight: 44)
            }
            .accessibilityLabel("Recorder consent options")
        } else {
            Button("Review choices", action: onGrant)
                .buttonStyle(.borderedProminent)
                .controlSize(.regular)
                .frame(minHeight: 44)
                .accessibilityIdentifier("CaptureConfirmConsentButton")
        }
    }

    private var consentTitle: String {
        session.hasCurrentRecordingConsent ? "Recorder attestation saved" : "Consent attestation required"
    }

    private var consentDetail: String {
        if let required = session.consentRequiredParticipantCount, required > 1 {
            let audioGranted = session.consentGrantedParticipantCount ?? 0
            let videoGranted = session.videoConsentGrantedParticipantCount ?? 0
            let waitingOnAudio = session.recordingConsentCanRecordAudio == true && audioGranted < required
            let waitingOnVideo = session.recordingConsentCanRecordVideo == true && videoGranted < required
            if waitingOnAudio || waitingOnVideo {
                let counts = [
                    session.recordingConsentCanRecordAudio == true ? "audio \(audioGranted)/\(required)" : nil,
                    session.recordingConsentCanRecordVideo == true ? "video \(videoGranted)/\(required)" : nil,
                ].compactMap { $0 }.joined(separator: " · ")
                return "\(counts). Each signed-in participant must confirm; everyone else who may be captured must also be told and agree."
            }
        }
        guard session.hasCurrentRecordingConsent else {
            return "Choose audio, video, or both, then confirm that everyone who may be captured was told and agreed."
        }
        let sources = [
            session.recordingConsentCanRecordAudio == true ? "audio" : nil,
            session.recordingConsentCanRecordVideo == true ? "video" : nil,
        ].compactMap { $0 }.joined(separator: " and ")
        return "You confirmed \(sources) consent for everyone who may be captured. Recording still starts visibly."
    }
}

struct CaptureConsentConfirmationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let session: MobileCaptureSession
    let requiresStableOwner: Bool
    let onSave: @MainActor @Sendable (Bool, Bool, Bool, Bool, Date) async -> Bool

    @State private var canRecordAudio = false
    @State private var canRecordVideo = false
    @State private var canTranscribe = false
    @State private var allAudibleParticipantsNotifiedAndAgreed = false
    @State private var isSubmitting = false
    @State private var presentedAt = Date()
    @State private var presentationOwnerSnapshot: AuthManager.StableOwnerSnapshot?
    @State private var localErrorMessage: String?

    init(
        session: MobileCaptureSession,
        requiresStableOwner: Bool = true,
        onSave: @escaping @MainActor @Sendable (Bool, Bool, Bool, Bool, Date) async -> Bool
    ) {
        self.session = session
        self.requiresStableOwner = requiresStableOwner
        self.onSave = onSave
        _presentationOwnerSnapshot = State(
            initialValue: requiresStableOwner
                ? AuthManager.shared.stableOwnerSnapshot()
                : nil
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Choose each use separately", systemImage: "checkmark.shield.fill")
                            .font(.headline)
                        Text(MobileCaptureConsentGrantAttestation.policyText)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 4)
                } header: {
                    Text(session.displayTitle)
                }

                Section("Recording") {
                    Toggle(isOn: $canRecordAudio) {
                        ConsentChoiceLabel(
                            title: "Record audio",
                            detail: "Allow this iPhone to create and preserve a local audio source for this session.",
                            systemImage: "waveform"
                        )
                    }
                    .accessibilityIdentifier("CaptureConsentRecordAudioToggle")

                    Toggle(isOn: $canRecordVideo) {
                        ConsentChoiceLabel(
                            title: "Record video",
                            detail: "Allow this iPhone to create and preserve local camera sources for this session. This is separate from joining a call.",
                            systemImage: "video"
                        )
                    }
                    .accessibilityIdentifier("CaptureConsentRecordVideoToggle")
                }

                Section("Transcription") {
                    Toggle(isOn: $canTranscribe) {
                        ConsentChoiceLabel(
                            title: "Create a transcript",
                            detail: "Optional. Leave this off to allow audio recording without authorizing transcription.",
                            systemImage: "text.bubble"
                        )
                    }
                    .accessibilityIdentifier("CaptureConsentTranscriptionToggle")
                }

                Section("Everyone who may be seen or heard") {
                    Toggle(isOn: $allAudibleParticipantsNotifiedAndAgreed) {
                        Text("I confirm that everyone who may be seen or heard — including people who are not signed into Quipsly — was told about the audio, video, and transcription choices and agreed before recording starts.")
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .accessibilityIdentifier("CaptureConsentAudibleParticipantsToggle")

                    Text("Each signed-in participant must also save their own consent. This nearby-person confirmation does not replace those individual receipts.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let localErrorMessage {
                    Section {
                        Label(localErrorMessage, systemImage: "exclamationmark.triangle.fill")
                            .font(.subheadline)
                            .foregroundStyle(.orange)
                            .accessibilityIdentifier("CaptureConsentOwnerChangedWarning")
                    }
                }

                Section {
                    Text(consentSummary)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                } header: {
                    Text("Your choices")
                }
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                consentActionBar
            }
            .navigationTitle("Consent choices")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isSubmitting)
                }
            }
            .interactiveDismissDisabled(isSubmitting)
        }
        .presentationDetents([.large])
        .accessibilityIdentifier("CaptureConsentConfirmationSheet")
    }

    private var consentActionBar: some View {
        VStack(spacing: 0) {
            Divider()
            Button {
                submitConsent()
            } label: {
                HStack {
                    Spacer()
                    if isSubmitting {
                        ProgressView()
                            .controlSize(.small)
                    } else {
                        Text("Save these choices")
                            .fontWeight(.semibold)
                    }
                    Spacer()
                }
                .frame(minHeight: 30)
            }
            .buttonStyle(.borderedProminent)
            .controlSize(.large)
            .disabled(
                (!canRecordAudio && !canRecordVideo)
                    || !allAudibleParticipantsNotifiedAndAgreed
                    || isSubmitting
            )
            .accessibilityHint(
                "Saves only the recording and transcription choices shown above. Recording still starts separately."
            )
            .accessibilityIdentifier("CaptureConsentSaveChoicesButton")
            .padding(.horizontal, 18)
            .padding(.vertical, 12)
        }
        .background(.bar)
    }

    private func submitConsent() {
        guard (canRecordAudio || canRecordVideo),
              allAudibleParticipantsNotifiedAndAgreed,
              !isSubmitting else { return }
        if requiresStableOwner {
            guard let presentationOwnerSnapshot,
                  AuthManager.shared.matchesStableOwnerSnapshot(presentationOwnerSnapshot) else {
                localErrorMessage = "The Quipsly account changed after these choices were shown. Close this sheet and review consent again under the current account."
                return
            }
        }
        localErrorMessage = nil
        isSubmitting = true
        let audioChoice = canRecordAudio
        let videoChoice = canRecordVideo
        let transcriptionChoice = canTranscribe
        let consentPresentationDate = presentedAt
        Task { @MainActor [audioChoice, videoChoice, transcriptionChoice, consentPresentationDate] in
            let saved = await onSave(
                audioChoice,
                videoChoice,
                transcriptionChoice,
                true,
                consentPresentationDate
            )
            isSubmitting = false
            if saved { dismiss() }
        }
    }

    private var consentSummary: String {
        let recording: String
        if canRecordAudio && canRecordVideo {
            recording = "audio and video recording"
        } else if canRecordVideo {
            recording = "video recording"
        } else if canRecordAudio {
            recording = "audio recording"
        } else {
            recording = "no recording"
        }
        return "You are allowing \(recording). Transcription is \(canTranscribe ? "on" : "off") as a separate choice."
    }
}

private struct ConsentChoiceLabel: View {
    let title: String
    let detail: String
    let systemImage: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .foregroundStyle(CapturePalette.accent)
                .frame(width: 24)
            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
    }
}

private struct CaptureRecordingModePicker: View {
    @Binding var selection: CaptureRecordingMode
    let isLocked: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label("Source mode", systemImage: selection.systemImage)
                    .font(.headline)
                Spacer()
                if isLocked {
                    Label("Locked", systemImage: "lock.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }

            Picker("Source mode", selection: $selection) {
                ForEach(CaptureRecordingMode.allCases) { mode in
                    Text(mode.shortTitle).tag(mode)
                }
            }
            .pickerStyle(.segmented)
            .disabled(isLocked)
            .accessibilityIdentifier("CaptureRecordingModePicker")

            Text(selection.detail)
                .font(.caption)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CaptureRecordingModeDetail")
        }
        .captureCard()
    }
}

@MainActor
private final class CaptureVideoPreviewUIView: UIView {
    private var rotationCoordinator: AVCaptureDevice.RotationCoordinator?
    private var attachedCameraDeviceUniqueID: String?

    override class var layerClass: AnyClass {
        AVCaptureVideoPreviewLayer.self
    }

    var previewLayer: AVCaptureVideoPreviewLayer {
        layer as! AVCaptureVideoPreviewLayer
    }

    override init(frame: CGRect) {
        super.init(frame: frame)
        previewLayer.videoGravity = .resizeAspectFill
        backgroundColor = .black
        isAccessibilityElement = true
        accessibilityLabel = "Live camera preview"
        accessibilityIdentifier = "CaptureVideoPreview"
    }

    required init?(coder: NSCoder) {
        super.init(coder: coder)
        previewLayer.videoGravity = .resizeAspectFill
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        applyPreviewRotation()
    }

    func attach(
        session: AVCaptureSession,
        cameraDeviceUniqueID: String?
    ) {
        if previewLayer.session !== session {
            previewLayer.session = session
        }
        if attachedCameraDeviceUniqueID != cameraDeviceUniqueID {
            attachedCameraDeviceUniqueID = cameraDeviceUniqueID
            let device = session.inputs
                .compactMap { ($0 as? AVCaptureDeviceInput)?.device }
                .first { $0.uniqueID == cameraDeviceUniqueID }
            rotationCoordinator = device.map {
                AVCaptureDevice.RotationCoordinator(
                    device: $0,
                    previewLayer: previewLayer
                )
            }
        }
        applyPreviewRotation()
    }

    private func applyPreviewRotation() {
        guard let rotationCoordinator,
              let connection = previewLayer.connection else {
            return
        }
        let angle =
            rotationCoordinator.videoRotationAngleForHorizonLevelPreview
        guard connection.isVideoRotationAngleSupported(angle) else { return }
        connection.videoRotationAngle = angle
    }
}

private struct CaptureVideoPreview: UIViewRepresentable {
    let session: AVCaptureSession
    let cameraDeviceUniqueID: String?

    func makeUIView(context: Context) -> CaptureVideoPreviewUIView {
        let view = CaptureVideoPreviewUIView()
        view.attach(
            session: session,
            cameraDeviceUniqueID: cameraDeviceUniqueID
        )
        return view
    }

    func updateUIView(
        _ uiView: CaptureVideoPreviewUIView,
        context: Context
    ) {
        uiView.attach(
            session: session,
            cameraDeviceUniqueID: cameraDeviceUniqueID
        )
    }
}

private struct VideoRecorderHero: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var timerFontSize: CGFloat = 40

    let session: MobileCaptureSession
    let mode: CaptureRecordingMode
    @ObservedObject var controller: VideoCaptureController
    let coordinatedAudioState: AudioCaptureState?
    @Binding var cameraPosition: VideoCaptureCameraPosition
    let isBusy: Bool
    let onPrepare: () -> Void
    let onStart: () -> Void
    let onStop: () -> Void
    let onPauseResume: () -> Void
    let onSwitchCamera: () -> Void

    var body: some View {
        VStack(spacing: 14) {
            VStack(spacing: 5) {
                Text(stateTitle)
                    .font(.title2.weight(.bold))
                    .multilineTextAlignment(.center)
                    .accessibilityIdentifier("CaptureVideoStateLabel")
                Text(controller.durationSeconds.captureDurationLabel)
                    .font(.system(
                        size: min(timerFontSize, 64),
                        weight: .medium,
                        design: .monospaced
                    ))
                    .monospacedDigit()
                    .contentTransition(reduceMotion ? .identity : .numericText())
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .accessibilityLabel(
                        "Elapsed time \(controller.durationSeconds.captureDurationLabel)"
                    )
                    .accessibilityIdentifier("CaptureVideoElapsedTime")
            }

            if showsPreview {
                CaptureVideoPreview(
                    session: controller.captureSession,
                    cameraDeviceUniqueID: controller.resolvedProfile?
                        .cameraDeviceUniqueID
                )
                    .frame(maxWidth: .infinity)
                    .aspectRatio(previewAspectRatio, contentMode: .fit)
                    .frame(maxHeight: 440)
                    .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
                    .overlay(alignment: .topLeading) {
                        Label(
                            controller.cameraPosition == .front ? "Front" : "Back",
                            systemImage: "camera.fill"
                        )
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.white)
                        .padding(.horizontal, 10)
                        .padding(.vertical, 7)
                        .background(.black.opacity(0.58), in: Capsule())
                        .padding(10)
                    }
                    .overlay(alignment: .topTrailing) {
                        if isCaptureGroupOpen {
                            Text(controller.state == .paused ? "PAUSED" : "REC")
                                .font(.caption2.weight(.black))
                                .tracking(1.2)
                                .foregroundStyle(
                                    controller.state == .paused ? .orange : .red
                                )
                                .padding(.horizontal, 10)
                                .padding(.vertical, 6)
                                .background(.black.opacity(0.68), in: Capsule())
                                .padding(10)
                        }
                    }
            } else {
                ZStack {
                    RoundedRectangle(cornerRadius: 22, style: .continuous)
                        .fill(Color.black.opacity(0.9))
                    VStack(spacing: 10) {
                        Image(systemName: "camera.viewfinder")
                            .font(.system(size: 42, weight: .medium))
                        Text("Prepare the camera to verify its real format and framing.")
                            .font(.subheadline.weight(.semibold))
                            .multilineTextAlignment(.center)
                    }
                    .foregroundStyle(.white.opacity(0.86))
                    .padding(24)
                }
                .aspectRatio(9 / 12, contentMode: .fit)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("CaptureVideoPreviewPlaceholder")
            }

            Picker("Camera", selection: $cameraPosition) {
                Text("Front").tag(VideoCaptureCameraPosition.front)
                Text("Back").tag(VideoCaptureCameraPosition.back)
            }
            .pickerStyle(.segmented)
            .disabled(isBusy || isCaptureGroupOpen || controller.state == .preparing)
            .accessibilityIdentifier("CaptureVideoCameraPicker")

            if let profile = controller.resolvedProfile {
                VStack(alignment: .leading, spacing: 7) {
                    HStack {
                        Label(profile.profileLabel, systemImage: "checkmark.seal.fill")
                            .font(.subheadline.weight(.bold))
                            .foregroundStyle(CapturePalette.accent)
                        Spacer()
                    }
                    Text(profile.cameraLocalizedName)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    HStack(spacing: 12) {
                        Label(
                            profileAudioLabel,
                            systemImage: mode.movieIncludesAudio ? "mic.fill" : "mic.slash"
                        )
                        Label(
                            "\(profile.presentationOrientationLabel) \(controller.state == .ready ? "at prepare" : "locked")",
                            systemImage: "rectangle.portrait.and.arrow.right"
                        )
                        if let minutes = controller.estimatedAvailableMinutes {
                            Label("≈\(minutes) min free", systemImage: "internaldrive")
                        }
                    }
                    .font(.caption.weight(.semibold))
                    Text(
                        "Frame the phone in the orientation you want before Start. Each immutable movie locks one horizon-level orientation; pause or stop before changing it."
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(12)
                .background(
                    CapturePalette.accent.opacity(0.08),
                    in: RoundedRectangle(cornerRadius: 14, style: .continuous)
                )
                .accessibilityIdentifier("CaptureVideoResolvedProfile")
            }

            Button(action: primaryAction) {
                ZStack {
                    Circle()
                        .fill(primaryTint.opacity(0.14))
                        .frame(width: 126, height: 126)
                    Circle()
                        .fill(primaryTint)
                        .frame(width: 96, height: 96)
                    if isBusy || [.preparing, .arming, .finalizing].contains(controller.state) {
                        ProgressView().tint(.white).controlSize(.large)
                    } else {
                        Image(systemName: primarySystemImage)
                            .font(.system(size: 34, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
            }
            .buttonStyle(CaptureRecordButtonStyle())
            .disabled(primaryDisabled)
            .accessibilityLabel(primaryAccessibilityLabel)
            .accessibilityIdentifier(primaryIdentifier)

            if controller.state == .recording || controller.state == .paused {
                HStack(spacing: 10) {
                    Button(action: onPauseResume) {
                        Label(
                            controller.state == .paused ? "Resume" : "Pause",
                            systemImage: controller.state == .paused
                                ? "play.fill"
                                : "pause.fill"
                        )
                        .frame(minWidth: 78)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(isBusy)
                    .accessibilityIdentifier("CaptureVideoPauseResumeButton")

                    if controller.state == .recording {
                        Button(action: onSwitchCamera) {
                            Label("Flip", systemImage: "arrow.triangle.2.circlepath.camera")
                                .frame(minWidth: 78)
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.large)
                        .disabled(isBusy)
                        .accessibilityHint(
                            "Closes and validates this movie, then starts the other camera in the same capture group."
                        )
                        .accessibilityIdentifier("CaptureVideoSwitchCameraButton")
                    }
                }
            }

            if let safetyMessage = controller.safetyMessage {
                Label(safetyMessage, systemImage: "lock.shield.fill")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureVideoSafetyMessage")
            }
            if let error = controller.lastErrorMessage {
                Label(error, systemImage: "exclamationmark.triangle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureVideoErrorMessage")
            }

            Text(sourceBoundary)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier("CaptureVideoSourceBoundary")
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 18)
        .padding(.horizontal, 14)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(.regularMaterial)
                .shadow(color: .black.opacity(0.06), radius: 18, y: 8)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureVideoRecorderHero")
    }

    private var showsPreview: Bool {
        controller.resolvedProfile != nil
            && ![.idle, .failed].contains(controller.state)
    }

    private var previewAspectRatio: CGFloat {
        controller.resolvedProfile?.presentationOrientation == "landscape"
            ? 16 / 9
            : 9 / 16
    }

    private var isCaptureGroupOpen: Bool {
        controller.state.isActive || controller.state == .paused
    }

    private var videoReady: Bool {
        session.recordingConsentVideoGranted == true
            && session.canRecordVideoNow == true
    }

    private var primaryDisabled: Bool {
        if isBusy || [.preparing, .arming, .finalizing].contains(controller.state) {
            return true
        }
        if controller.state == .ready {
            return !videoReady
                || (
                    mode.requiresAudioConsent
                    && !(session.canRecordAudioNow ?? session.canRecordNow)
                )
        }
        return false
    }

    private var primaryTint: Color {
        if isCaptureGroupOpen { return .red }
        if controller.state == .ready && !videoReady { return .gray }
        return CapturePalette.record
    }

    private var primarySystemImage: String {
        if isCaptureGroupOpen { return "stop.fill" }
        if controller.state == .ready { return "circle.fill" }
        return "camera.fill"
    }

    private var primaryIdentifier: String {
        if isCaptureGroupOpen { return "CaptureVideoStopButton" }
        if controller.state == .ready { return "CaptureVideoStartButton" }
        return "CaptureVideoPrepareButton"
    }

    private var primaryAccessibilityLabel: String {
        if isCaptureGroupOpen {
            return mode.isCoordinatedPodcastCapture
                ? "Stop both local podcast sources, \(controller.durationSeconds.captureDurationLabel) elapsed"
                : "Stop video capture group, \(controller.durationSeconds.captureDurationLabel) elapsed"
        }
        if controller.state == .ready {
            return videoReady
                ? "Start \(mode.title.lowercased())"
                : "Video recording unavailable until every participant's video consent is ready"
        }
        return "Prepare \(cameraPosition.rawValue) camera"
    }

    private var stateTitle: String {
        switch controller.state {
        case .idle: "Camera is off"
        case .preparing: "Verifying camera…"
        case .ready:
            videoReady ? "Camera and consent ready" : "Camera ready · video consent needed"
        case .arming: "Protecting source identity…"
        case .recording:
            switch mode {
            case .podcastAV:
                coordinatedAudioState == .recording
                    ? "Recording two local sources"
                    : "Camera started · preparing microphone"
            case .podcastCamera: "Podcast camera recording"
            case .soloVideo: "Solo video recording"
            case .audio: "Video recording"
            }
        case .finalizing: "Closing and validating movie…"
        case .paused: "Camera paused safely"
        case .saved: "Video saved on this iPhone"
        case .failed: "Camera source needs attention"
        }
    }

    private var sourceBoundary: String {
        switch mode {
        case .podcastAV:
            "Two immutable sources: a separate microphone master and this video-only movie keep independent clock evidence under one capture-group identity. The live room remains independent, and a human reviews final sync."
        case .podcastCamera:
            "Video only: LiveKit carries the audible conversation. This movie stays an independent immutable source until reviewed clock and waveform alignment."
        case .soloVideo:
            "Camera and microphone share this local movie. Joining a live room is blocked so the call cannot silently reconfigure its audio."
        case .audio:
            ""
        }
    }

    private var profileAudioLabel: String {
        switch mode {
        case .podcastAV:
            "Video only · separate mic"
        case .podcastCamera:
            "Video only"
        case .soloVideo:
            "Mic in movie"
        case .audio:
            "No movie"
        }
    }

    private func primaryAction() {
        if isCaptureGroupOpen {
            onStop()
        } else if controller.state == .ready {
            onStart()
        } else {
            onPrepare()
        }
    }
}

private struct CoordinatedPodcastAudioStatus: View {
    let captureState: AudioCaptureState
    let duration: TimeInterval
    let inputLevel: Double
    let inputRoute: String
    let capturePipeline: String
    let markCount: Int
    let canMark: Bool
    let onMark: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .firstTextBaseline) {
                Label("Separate microphone master", systemImage: "waveform")
                    .font(.headline)
                Spacer()
                Text(duration.captureDurationLabel)
                    .font(.caption.monospacedDigit().weight(.bold))
            }

            InputLevelMeter(
                level: inputLevel,
                isActive: captureState == .recording
            )

            HStack(alignment: .center, spacing: 12) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(inputRoute.isEmpty ? "iPhone microphone" : inputRoute)
                        .font(.subheadline.weight(.semibold))
                    Text(capturePipeline)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(.secondary)
                    Text(stateDetail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Button(action: onMark) {
                    Label(
                        markCount == 0 ? "Mark" : "Mark \(markCount)",
                        systemImage: "bookmark.fill"
                    )
                }
                .buttonStyle(.bordered)
                .disabled(!canMark)
                .accessibilityHint(
                    "Adds a source-relative mark to the continuing microphone master without changing either file."
                )
                .accessibilityIdentifier("CaptureCoordinatedMarkButton")
            }
        }
        .padding(14)
        .background(
            CapturePalette.accent.opacity(0.08),
            in: RoundedRectangle(cornerRadius: 18, style: .continuous)
        )
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureCoordinatedAudioStatus")
    }

    private var stateDetail: String {
        switch captureState {
        case .recording:
            "Audio is recording locally beside the video-only camera source."
        case .paused:
            "Audio is paused; the current movie boundary is safely closed."
        case .preparing:
            "Preparing and verifying the selected microphone route."
        case .finalizing:
            "Closing the microphone file without changing its bytes."
        case .saved:
            "Microphone source saved on this iPhone."
        case .failed:
            "Microphone source needs Library review."
        case .idle:
            "The microphone starts only after the camera confirms its source."
        }
    }
}

private struct RecorderHero: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var timerFontSize: CGFloat = 40

    let session: MobileCaptureSession
    let captureState: AudioCaptureState
    let duration: TimeInterval
    let inputLevel: Double
    let inputRoute: String
    let capturePipeline: String
    let userMarkOffsets: [TimeInterval]
    let isBusy: Bool
    let onPrimaryAction: () -> Void
    let onPauseResume: () -> Void
    let onMark: () -> Void

    var body: some View {
        VStack(spacing: 16) {
            VStack(spacing: 5) {
                Text(stateTitle)
                    .font(.title2.weight(.bold))
                    .accessibilityIdentifier("CaptureRecorderStateLabel")
                Text(formattedDuration)
                    .font(.system(size: min(timerFontSize, 64), weight: .medium, design: .monospaced))
                    .monospacedDigit()
                    .contentTransition(reduceMotion ? .identity : .numericText())
                    .lineLimit(1)
                    .minimumScaleFactor(0.72)
                    .accessibilityLabel("Elapsed time \(formattedDuration)")
                    .accessibilityIdentifier("CaptureElapsedTime")
            }

            InputLevelMeter(level: inputLevel, isActive: isActuallyRecording)

            Button(action: onPrimaryAction) {
                ZStack {
                    Circle()
                        .fill(primaryTint.opacity(0.14))
                        .frame(width: 126, height: 126)
                    Circle()
                        .fill(primaryTint)
                        .frame(width: 96, height: 96)
                    if isBusy || captureState == .finalizing {
                        ProgressView().tint(.white).controlSize(.large)
                    } else {
                        Image(systemName: primarySystemImage)
                            .font(.system(size: 35, weight: .bold))
                            .foregroundStyle(.white)
                    }
                }
            }
            .buttonStyle(CaptureRecordButtonStyle())
            .disabled(primaryDisabled)
            .accessibilityLabel(primaryAccessibilityLabel)
            .accessibilityValue(formattedDuration)
            .accessibilityIdentifier(isCaptureActive ? "CaptureStopButton" : "CaptureStartButton")

            if isCaptureActive && captureState != .finalizing {
                HStack(spacing: 12) {
                    Button(action: onPauseResume) {
                        Label(captureState == .paused ? "Resume" : "Pause", systemImage: captureState == .paused ? "play.fill" : "pause.fill")
                            .frame(minWidth: 82)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)

                    Button(action: onMark) {
                        Label(userMarkOffsets.isEmpty ? "Mark" : "Mark \(userMarkOffsets.count)", systemImage: "bookmark.fill")
                            .frame(minWidth: 82)
                    }
                    .buttonStyle(.bordered)
                    .controlSize(.large)
                    .disabled(captureState != .recording)
                    .accessibilityHint("Adds a source-timeline marker without pausing or changing the audio file.")
                    .accessibilityIdentifier("CaptureMarkMomentButton")
                }
            }

            if let lastMark = userMarkOffsets.last {
                Label("Last mark at \(lastMark.captureDurationLabel)", systemImage: "bookmark.circle.fill")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(CapturePalette.accent)
                    .accessibilityIdentifier("CaptureLatestMomentMark")
            }

            HStack(spacing: 7) {
                Image(systemName: "mic.fill")
                VStack(alignment: .leading, spacing: 2) {
                    Text(inputRoute.isEmpty ? "iPhone microphone" : inputRoute)
                    Text(capturePipeline)
                        .font(.caption2)
                }
                .multilineTextAlignment(.leading)
                .fixedSize(horizontal: false, vertical: true)
            }
            .font(.caption)
            .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 20)
        .padding(.horizontal, 16)
        .background(
            RoundedRectangle(cornerRadius: 28, style: .continuous)
                .fill(.regularMaterial)
                .shadow(color: .black.opacity(0.06), radius: 18, y: 8)
        )
        .overlay(alignment: .topTrailing) {
            if isCaptureActive {
                Text(captureState == .paused ? "PAUSED" : "REC")
                    .font(.caption2.weight(.black))
                    .tracking(1.2)
                    .foregroundStyle(captureState == .paused ? .orange : .red)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(.background.opacity(0.84), in: Capsule())
                    .padding(12)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureRecorderHero")
    }

    private var isActuallyRecording: Bool { captureState == .recording }

    private var isCaptureActive: Bool {
        switch captureState {
        case .recording, .paused, .finalizing: true
        default: false
        }
    }

    private var primaryDisabled: Bool {
        isBusy || captureState == .preparing || captureState == .finalizing || (!session.canRecordNow && !isCaptureActive)
    }

    private var primaryTint: Color {
        isCaptureActive ? .red : session.canRecordNow ? CapturePalette.record : .gray
    }

    private var primarySystemImage: String {
        isCaptureActive ? "stop.fill" : "circle.fill"
    }

    private var primaryAccessibilityLabel: String {
        if isCaptureActive { return "Stop recording, \(formattedDuration) elapsed" }
        if session.canRecordNow { return "Start recording" }
        return "Start recording unavailable until session readiness and consent are confirmed"
    }

    private var stateTitle: String {
        switch captureState {
        case .idle:
            if session.canRecordNow { return "Consent ready · mic checks on tap" }
            return session.recordingConsentGranted ? "Waiting for participant consent" : "Waiting for consent"
        case .preparing: return "Preparing microphone…"
        case .recording: return "Recording locally"
        case .paused: return "Recording paused"
        case .finalizing: return "Saving local source…"
        case .saved: return "Saved on this iPhone"
        case .failed: return "Recorder needs attention"
        }
    }

    private var formattedDuration: String {
        let total = max(0, Int(duration.rounded(.down)))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        return hours > 0
            ? String(format: "%02d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%02d:%02d", minutes, seconds)
    }
}

private struct InputLevelMeter: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    let level: Double
    let isActive: Bool

    private var safeLevel: Double {
        guard level.isFinite else { return 0 }
        return min(max(level, 0), 1)
    }

    var body: some View {
        ZStack {
            GeometryReader { proxy in
                let availableWidth = proxy.size.width.isFinite
                    ? max(0, proxy.size.width)
                    : 0
                let minimumVisibleWidth = min(8, availableWidth)
                let fillWidth = min(
                    availableWidth,
                    max(minimumVisibleWidth, availableWidth * safeLevel)
                )
                ZStack(alignment: .leading) {
                    Capsule().fill(.secondary.opacity(0.14))
                    Capsule()
                        .fill(isActive ? CapturePalette.meterGradient : LinearGradient(colors: [.secondary.opacity(0.35)], startPoint: .leading, endPoint: .trailing))
                        .frame(width: fillWidth)
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.1), value: safeLevel)
                }
            }
            .frame(height: 9)
        }
        // VoiceOver treats this value-bearing meter as one inspectable element.
        // Keep its visual weight slim while giving the semantic element the same
        // comfortable 44-point target used by nearby controls.
        .frame(minHeight: 44)
        .contentShape(Rectangle())
        .accessibilityElement()
        .accessibilityLabel("Microphone level")
        .accessibilityValue(isActive ? "\(Int((safeLevel * 100).rounded())) percent" : "Inactive")
    }
}

private struct ProviderRoomControls: View {
    @ObservedObject var model: CaptureExperienceModel
    let session: MobileCaptureSession

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("The live room lets people hear each other. The local source records only this iPhone's selected microphone; remote provider audio requires separate participant tracks or verified provider egress.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("CaptureProviderRoomBoundaryCopy")

            if providerControlsLocked {
                Label("Live room controls locked for this take", systemImage: "lock.shield.fill")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.orange)
                Text(model.providerControlsLockMessage)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("ProviderControlsCaptureLockNotice")
            }

            HStack(spacing: 10) {
                if model.providerRoom.isConnected {
                    Button {
                        Task { await model.toggleRoomMute() }
                    } label: {
                        Label(model.providerRoom.isMuted ? "Unmute" : "Mute", systemImage: model.providerRoom.isMuted ? "mic.slash" : "mic")
                    }
                    .buttonStyle(.bordered)
                    .disabled(providerControlsLocked || model.isChangingRoom)
                    .accessibilityHint(providerControlHint)
                    .accessibilityIdentifier("ProviderToggleMuteButton")

                    Button(role: .destructive) {
                        Task { await model.leaveRoom() }
                    } label: {
                        Label("Leave", systemImage: "phone.down.fill")
                    }
                    .buttonStyle(.bordered)
                    .disabled(providerControlsLocked || model.isChangingRoom)
                    .accessibilityHint(providerControlHint)
                    .accessibilityIdentifier("ProviderLeaveRoomButton")
                } else {
                    Button {
                        Task { await model.joinRoom() }
                    } label: {
                        if model.isChangingRoom {
                            ProgressView()
                        } else {
                            Label("Join room", systemImage: "phone.fill")
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(providerControlsLocked || model.isChangingRoom || session.providerCanJoin != true)
                    .accessibilityHint(providerControlHint)
                    .accessibilityIdentifier("ProviderJoinRoomButton")
                }
            }

            if let detail = model.providerRoom.lastError ?? model.providerRoom.statusText.nonempty {
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(model.providerRoom.lastError == nil ? Color.secondary : Color.orange)
            }
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureProviderRoomControls")
    }

    private var providerControlsLocked: Bool {
        model.providerControlsLockedForLocalCapture
    }

    private var providerControlHint: String {
        providerControlsLocked
            ? model.providerControlsLockMessage
            : "Live room audio is separate from the local source recorder."
    }
}

private struct UploadSummaryCard: View {
    @ObservedObject var model: CaptureExperienceModel
    @StateObject private var library = LocalRecordingLibrary.shared

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: uploadIcon)
                .font(.title3)
                .foregroundStyle(uploadTint)
                .frame(width: 38, height: 38)
                .background(uploadTint.opacity(0.11), in: Circle())
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(uploadTitle)
                    .font(.subheadline.weight(.semibold))
                Text(uploadDetail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer()
            if let recording = selectedSessionRecording, recording.status == .uploading {
                ProgressView(value: recording.uploadProgress ?? 0)
                    .progressViewStyle(.circular)
                    .accessibilityLabel("Upload progress")
                    .accessibilityValue("\(Int((recording.uploadProgress ?? 0) * 100)) percent")
            }
        }
        .captureCard()
    }

    private var uploadTitle: String {
        guard let recording = selectedSessionRecording else { return "No take for this session yet" }
        return recording.statusLabel
    }

    private var uploadIcon: String {
        guard let recording = selectedSessionRecording else { return "externaldrive.fill" }
        if recording.status == .uploading { return "icloud.and.arrow.up" }
        if recording.serverProcessingDisposition?.uppercased() == "HELD" { return "externaldrive.badge.exclamationmark" }
        if recording.status.isVerified { return "checkmark.icloud.fill" }
        if recording.status == .uploadHeld || recording.status == .awaitingVerification { return "externaldrive.badge.exclamationmark" }
        return "externaldrive.fill"
    }

    private var uploadTint: Color {
        guard let recording = selectedSessionRecording else { return CapturePalette.accent }
        if recording.serverProcessingDisposition?.uppercased() == "HELD" { return .orange }
        if recording.status == .uploadHeld || recording.status == .awaitingVerification { return .orange }
        if recording.status.isVerified { return .green }
        return CapturePalette.accent
    }

    private var uploadDetail: String {
        selectedSessionRecording?.statusDetail
            ?? "A completed take for this session will appear here before Quipsly calls any upload verified."
    }

    private var selectedSessionRecording: LocalRecording? {
        guard let callRoomID = model.selectedSession?.callRoomId else { return nil }
        return library.recordings.first { $0.callRoomId == callRoomID }
    }
}

private struct StudioHandoffCard: View {
    @ObservedObject var model: CaptureExperienceModel
    let session: MobileCaptureSession
    let captureIsActive: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: session.recordingPromotedToStudioMedia ? "checkmark.circle.fill" : "film.stack")
                    .font(.title3)
                    .foregroundStyle(session.recordingPromotedToStudioMedia ? Color.green : CapturePalette.accent)
                    .frame(width: 38, height: 38)
                    .background(
                        (session.recordingPromotedToStudioMedia ? Color.green : CapturePalette.accent).opacity(0.11),
                        in: Circle()
                    )
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 4) {
                    Text("Continue in Studio")
                        .font(.subheadline.weight(.semibold))
                    Text(session.recordingMediaVaultLine)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }

                Spacer(minLength: 0)
            }

            HStack(spacing: 10) {
                Text(session.recordingPromotionBadgeLabel)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(session.recordingPromotedToStudioMedia ? Color.green : CapturePalette.accent)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(
                        (session.recordingPromotedToStudioMedia ? Color.green : CapturePalette.accent).opacity(0.11),
                        in: Capsule()
                    )
                    .accessibilityLabel(session.recordingPromotionBadgeLabel)
                    .accessibilityIdentifier("CaptureStudioPromotionStatus_\(session.id)")

                Spacer()

                if session.recordingPromotedToStudioMedia,
                   let studioReviewURL {
                    Link(destination: studioReviewURL) {
                        Label(
                            studioReviewActionLabel,
                            systemImage: "waveform.path.ecg.rectangle"
                        )
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                    .accessibilityHint(
                        "Opens this exact capture group in the episode sync-review wizard. No media moves until you review waveform, drift, and placement."
                    )
                    .accessibilityIdentifier(
                        "CaptureOpenStudioReviewLink_\(session.id)"
                    )
                } else {
                    Button {
                        Task { await model.promoteSelectedRecordingToStudio() }
                    } label: {
                        if model.isPromotingRecordingToStudio {
                            ProgressView()
                                .accessibilityLabel("Attaching capture group to Studio")
                        } else {
                            Label(
                                studioHandoffActionLabel,
                                systemImage: session.recordingPromotedToStudioMedia ? "checkmark" : "arrow.right"
                            )
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(session.recordingPromotedToStudioMedia ? .green : CapturePalette.accent)
                    .disabled(
                        captureIsActive
                            || model.isChangingCapture
                            || model.isPromotingRecordingToStudio
                            || !session.canPromoteRecordingToStudioMedia
                    )
                    .accessibilityHint(studioHandoffHint)
                    .accessibilityIdentifier("CaptureAttachToStudioButton_\(session.id)")
                }
            }

            Text("Attaching prepares immutable source material for Studio review. It never publishes, trims, or deletes your recording.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureStudioHandoffCard_\(session.id)")
    }

    private var studioHandoffHint: String {
        if captureIsActive {
            return "Stop and save the active take before attaching its complete verified capture group to Studio."
        }
        if session.recordingPromotedToStudioMedia {
            return "Every verified source in this capture group is already available to the same Nest in Studio."
        }
        if session.canPromoteRecordingToStudioMedia {
            return "Attaches the exact verified capture-group source set to this Nest's Studio media without deleting or changing any original."
        }
        return session.recordingMediaVaultLine
    }

    private var studioHandoffActionLabel: String {
        let sourceCount = session.studioHandoffSources.count
        if session.recordingPromotedToStudioMedia {
            return sourceCount > 1 ? "Group in Studio" : "Attached to Studio"
        }
        return sourceCount > 1 ? "Attach group" : "Attach to Studio"
    }

    private var studioReviewActionLabel: String {
        session.studioHandoffSources.count > 1
            ? "Review group sync"
            : "Review in Studio"
    }

    private var studioReviewURL: URL? {
        session.studioCaptureReviewURL(
            baseURLString: Bundle.main.object(
                forInfoDictionaryKey: "QUIPSLY_API_BASE_URL"
            ) as? String ?? "https://nest.quipsly.com"
        )
    }
}

private struct UploadActivityCard: View {
    @ObservedObject var model: CaptureExperienceModel

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Label(model.uploadManager.isUploading ? "Uploading" : "Upload recovery", systemImage: "icloud.and.arrow.up")
                    .font(.headline)
                Spacer()
                if model.uploadManager.isUploading {
                    Text("\(Int(model.uploadManager.uploadProgress * 100))%")
                        .font(.subheadline.monospacedDigit())
                }
            }
            ProgressView(value: model.uploadManager.uploadProgress)
            Text(model.uploadManager.statusText ?? "Local originals are preserved.")
                .font(.caption)
                .foregroundStyle(.secondary)
            if model.uploadManager.recoverableUploadCount > 0 && !model.uploadManager.isUploading {
                Button("Retry preserved uploads") { model.retryUploads() }
                    .buttonStyle(.borderedProminent)
            }
        }
        .captureCard()
    }
}

private struct LocalRecordingRow: View {
    let recording: LocalRecording
    let fileURL: URL?
    let isPlaying: Bool
    let canAudition: Bool
    let canRequestDeletion: Bool
    let onPlay: () -> Void
    let onRetry: () -> Void
    let onDelete: () -> Void
    let previewOnly: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: sourceSystemImage)
                    .font(.title3)
                    .foregroundStyle(recording.status.isVerified ? .green : CapturePalette.accent)
                    .frame(width: 40, height: 40)
                    .background((recording.status.isVerified ? Color.green : CapturePalette.accent).opacity(0.1), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text(recording.displayTitle)
                        .font(.headline)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(recording.startedAt.formatted(date: .abbreviated, time: .shortened))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                CaptureStatusPill(
                    label: recording.statusLabel,
                    systemImage: recording.status.isVerified ? "checkmark" : "internaldrive",
                    tint: recording.status.isVerified ? .green : CapturePalette.accent
                )
                .accessibilityElement(children: .combine)
                .accessibilityLabel(recording.statusLabel)
                .accessibilityIdentifier("LocalRecordingStatus_\(recording.id)")
            }

            HStack(spacing: 16) {
                Label(recording.durationSeconds.captureDurationLabel, systemImage: "clock")
                Label(ByteCountFormatter.string(fromByteCount: recording.byteCount, countStyle: .file), systemImage: "doc")
            }
            .font(.caption)
            .foregroundStyle(.secondary)

            if let recordedVideoProfileLabel = recording.recordedVideoProfileLabel {
                Label(
                    "Recorded · \(recordedVideoProfileLabel)",
                    systemImage: "checkmark.seal.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(
                    "LocalRecordingRecordedVideoProfile_\(recording.id)"
                )
            }

            if let sourceIntegrityHoldReason = recording.sourceIntegrityHoldReason {
                Label(
                    sourceIntegrityHoldReason,
                    systemImage: "exclamationmark.shield.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityIdentifier(
                    "LocalRecordingSourceIntegrityHold_\(recording.id)"
                )
            }

            if !recording.userMarkOffsets.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Label("\(recording.userMarkOffsets.count) marked moment\(recording.userMarkOffsets.count == 1 ? "" : "s")", systemImage: "bookmark.fill")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(CapturePalette.accent)
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 6) {
                            ForEach(Array(recording.userMarkOffsets.enumerated()), id: \.offset) { index, offset in
                                Text("\(index + 1) · \(offset.captureDurationLabel)")
                                    .font(.caption2.monospacedDigit().weight(.semibold))
                                    .padding(.horizontal, 8)
                                    .padding(.vertical, 5)
                                    .background(CapturePalette.accent.opacity(0.1), in: Capsule())
                            }
                        }
                    }
                }
                .accessibilityIdentifier("LocalRecordingMomentMarks")
            }

            Text(recording.statusDetail)
                .font(.caption)
                .foregroundStyle(.secondary)

            Label(recording.fileName, systemImage: "doc.fill")
                .font(.caption2.monospaced())
                .foregroundStyle(.tertiary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel("Source file \(recording.fileName)")

            HStack(spacing: 10) {
                Button(action: onPlay) {
                    Label(
                        isPlaying
                            ? "Stop"
                            : recording.effectiveMediaKind == .video
                                ? "Watch"
                                : "Play",
                        systemImage: isPlaying
                            ? "stop.fill"
                            : recording.effectiveMediaKind == .video
                                ? "play.rectangle.fill"
                                : "play.fill"
                    )
                        .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(!canAudition || fileURL == nil || !recording.status.isPlaybackEligible)
                .accessibilityHint(recording.status.isPlaybackEligible
                    ? recording.effectiveMediaKind == .video
                        ? "Opens and watches the immutable local video source."
                        : "Auditions the immutable local audio source."
                    : "The source is not available for playback until capture is finalized and its complete stream is decoded.")

                if retryIsAvailable {
                    Button(action: onRetry) {
                        Label("Retry", systemImage: "arrow.clockwise")
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                }
                Spacer()
            }

            if let callRoomID = recording.callRoomId?.nonempty {
                NavigationLink {
                    CaptureTranscriptReviewView(
                        roomID: callRoomID,
                        sessionTitle: recording.sessionTitle?.nonempty ?? recording.displayTitle,
                        recording: recording,
                        previewOnly: previewOnly
                    )
                } label: {
                    Label("Review transcript against this source", systemImage: "waveform.and.magnifyingglass")
                        .font(.subheadline.weight(.semibold))
                        .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                }
                .buttonStyle(.bordered)
                .disabled(!recording.status.isPlaybackEligible)
                .accessibilityIdentifier("CaptureTranscriptReviewLink_\(recording.id)")
            }

            NavigationLink {
                CaptureSourceEvidenceView(recordingID: recording.id)
            } label: {
                Label("Review source evidence", systemImage: "checkmark.shield")
                    .font(.subheadline.weight(.semibold))
                    .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
            }
            .buttonStyle(.bordered)
            .accessibilityIdentifier("CaptureSourceEvidenceLink_\(recording.id)")

            HStack(spacing: 10) {
                if let fileURL {
                    ShareLink(item: fileURL) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                } else {
                    Button(action: {}) {
                        Label("Share", systemImage: "square.and.arrow.up")
                            .frame(minHeight: 44)
                    }
                    .buttonStyle(.bordered)
                    .disabled(true)
                }

                Button(role: .destructive, action: onDelete) {
                    Label("Delete local original", systemImage: "trash")
                        .frame(minHeight: 44)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .buttonStyle(.bordered)
                .disabled(!canDeleteLocalOriginal)
                .accessibilityHint(localDeletionAccessibilityHint)

                Spacer()
            }
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("LocalRecordingRow_\(recording.id)")
    }

    private var canDeleteLocalOriginal: Bool {
        guard canRequestDeletion, fileURL != nil else { return false }
        switch recording.status {
        case .saved, .uploaded, .uploadHeld, .recovered, .needsRepair, .captureFailed:
            return true
        case .armed, .recording, .paused, .finalizing, .validatingRecovery, .queued, .uploading, .awaitingVerification, .missingFile, .deletedLocally:
            return false
        }
    }

    private var sourceSystemImage: String {
        switch (recording.effectiveMediaKind, recording.status.isVerified) {
        case (.video, true):
            return "checkmark.rectangle.fill"
        case (.video, false):
            return "video.fill"
        case (.audio, true):
            return "checkmark.waveform"
        case (.audio, false):
            return "waveform"
        }
    }

    private var localDeletionAccessibilityHint: String {
        switch recording.status {
        case .armed, .recording, .paused, .finalizing:
            return "Stop and finish saving before deleting local source bytes."
        case .validatingRecovery:
            return "Wait for preserved-audio validation to finish before deleting local source bytes."
        case .queued, .uploading, .awaitingVerification:
            return "Wait for upload and verification work to finish before deleting local source bytes."
        case .missingFile, .deletedLocally:
            return "No local source bytes are available to delete."
        case .saved, .uploaded, .uploadHeld, .recovered, .needsRepair, .captureFailed:
            return canRequestDeletion
                ? "Opens a confirmation with cloud verification status and a Share-first option."
                : "Stop recording or leave the live room before deleting a local original."
        }
    }

    private var retryIsAvailable: Bool {
        if recording.sourceIntegrityHoldReason != nil {
            return false
        }
        return switch recording.status {
        case .saved, .queued, .awaitingVerification, .uploadHeld, .recovered, .captureFailed:
            true
        case .armed, .recording, .paused, .finalizing, .validatingRecovery, .uploading, .uploaded, .needsRepair, .missingFile, .deletedLocally:
            false
        }
    }
}

private struct CaptureLocalVideoPlayerSheet: View {
    @Environment(\.dismiss) private var dismiss

    let title: String
    let profileLabel: String?
    let player: AVPlayer?
    let onDone: () -> Void

    var body: some View {
        NavigationStack {
            VStack(spacing: 14) {
                VideoPlayer(player: player)
                    .background(Color.black)
                    .clipShape(
                        RoundedRectangle(
                            cornerRadius: 18,
                            style: .continuous
                        )
                    )
                    .accessibilityLabel(
                        "Immutable local video playback"
                    )
                    .accessibilityIdentifier(
                        "CaptureLocalVideoPlayer"
                    )

                if let profileLabel {
                    Label(
                        profileLabel,
                        systemImage: "checkmark.seal.fill"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                }

                Label(
                    "Watching does not alter, trim, upload, or delete the local original.",
                    systemImage: "lock.shield.fill"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .padding(16)
            .background(CaptureCanvas())
            .navigationTitle(title)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") {
                        onDone()
                        dismiss()
                    }
                }
            }
        }
        .interactiveDismissDisabled(false)
        .onDisappear { onDone() }
        .accessibilityIdentifier("CaptureLocalVideoPlayerSheet")
    }
}

private struct LocalRecordingDeletionSheet: View {
    @Environment(\.dismiss) private var dismiss

    let recording: LocalRecording
    let fileURL: URL?
    let onDelete: () throws -> Void

    @State private var confirmsIrreversibleDeletion = false
    @State private var isDeleting = false
    @State private var deletionError: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Local original") {
                    VStack(alignment: .leading, spacing: 6) {
                        Text(recording.displayTitle)
                            .font(.headline)
                        Text(recording.fileName)
                            .font(.caption.monospaced())
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                        Label(
                            ByteCountFormatter.string(fromByteCount: recording.byteCount, countStyle: .file),
                            systemImage: "internaldrive"
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                }

                Section("Cloud verification") {
                    Label(cloudVerificationTitle, systemImage: cloudVerificationIcon)
                        .foregroundStyle(cloudCopyIsVerified ? Color.green : Color.orange)
                    Text(cloudVerificationDetail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Share first") {
                    Text("Deletion is irreversible on this iPhone. Share or export a copy before continuing if you may need these source bytes later.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let fileURL {
                        ShareLink(item: fileURL) {
                            Label("Share a copy first", systemImage: "square.and.arrow.up")
                                .frame(maxWidth: .infinity, minHeight: 44)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }

                Section {
                    Toggle(
                        "I understand this permanently removes only the local original from this iPhone",
                        isOn: $confirmsIrreversibleDeletion
                    )
                    Text("Quipsly keeps a protected audit row with the deletion time, original byte count, and cloud-verification state. Server/account evidence is not deleted by this action.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if let deletionError {
                    Section("Deletion held") {
                        Label(deletionError, systemImage: "exclamationmark.triangle.fill")
                            .foregroundStyle(.orange)
                    }
                }

                Section {
                    Button("Delete local original", role: .destructive) {
                        performDeletion()
                    }
                    .frame(maxWidth: .infinity, minHeight: 44)
                    .disabled(!confirmsIrreversibleDeletion || isDeleting || fileURL == nil)
                    .accessibilityIdentifier("ConfirmDeleteLocalOriginalButton")
                }
            }
            .navigationTitle("Delete local original?")
            .navigationBarTitleDisplayMode(.inline)
            .interactiveDismissDisabled(isDeleting)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                        .disabled(isDeleting)
                }
            }
        }
        .accessibilityIdentifier("LocalRecordingDeletionSheet")
    }

    private var cloudCopyIsVerified: Bool {
        recording.status.isVerified
            || recording.serverVerificationStatus?
                .trimmingCharacters(in: .whitespacesAndNewlines)
                .lowercased() == "verified"
    }

    private var cloudVerificationTitle: String {
        cloudCopyIsVerified ? "Verified cloud copy recorded" : "No verified cloud copy recorded"
    }

    private var cloudVerificationIcon: String {
        cloudCopyIsVerified ? "checkmark.icloud.fill" : "icloud.slash"
    }

    private var cloudVerificationDetail: String {
        if cloudCopyIsVerified {
            if recording.serverProcessingDisposition?.uppercased() == "HELD" {
                return "Quipsly verified and preserved the exact server bytes, but editor attachment and transcript processing remain held for review. This action still deletes only the bytes on this iPhone."
            }
            return "Quipsly recorded a verified server copy. This action still deletes only the bytes on this iPhone."
        }
        return "Deleting now can leave no recoverable copy. Upload held, received, or pending is not the same as verified."
    }

    private func performDeletion() {
        guard confirmsIrreversibleDeletion, !isDeleting else { return }
        isDeleting = true
        deletionError = nil
        do {
            try onDelete()
            dismiss()
        } catch {
            deletionError = error.localizedDescription
            isDeleting = false
        }
    }
}

private struct SessionPickerSheet: View {
    @ObservedObject var model: CaptureExperienceModel
    @Binding var isPresented: Bool
    @State private var showsNewSession = false

    var body: some View {
        NavigationStack {
            List {
                if model.isRefreshing && model.sessions.isEmpty {
                    VStack(spacing: 12) {
                        ProgressView()
                        Text("Loading sessions from Nest…")
                            .font(.headline)
                        Text("Your saved Session stays selected while Quipsly verifies the authoritative list.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity, minHeight: 220)
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("CaptureSessionPickerLoading")
                } else if model.sessions.isEmpty {
                    ContentUnavailableView("No sessions", systemImage: "calendar", description: Text("Create a session to keep consent and recordings together."))
                        .accessibilityIdentifier("CaptureSessionPickerEmpty")
                } else {
                    ForEach(model.sessions) { session in
                        Button {
                            model.select(session)
                            isPresented = false
                        } label: {
                            HStack(spacing: 12) {
                                Image(systemName: session.capturePurposeIcon)
                                    .foregroundStyle(CapturePalette.accent)
                                VStack(alignment: .leading, spacing: 3) {
                                    Text(session.displayTitle)
                                        .foregroundStyle(.primary)
                                    Text(session.captureScheduleLabel)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Spacer()
                                if session.id == model.selectedSession?.id {
                                    Image(systemName: "checkmark")
                                        .foregroundStyle(CapturePalette.accent)
                                }
                            }
                        }
                        .disabled(model.isSessionContextLocked && model.selectedSession?.id != session.id)
                        .accessibilityIdentifier("CaptureSessionPicker_\(session.id)")
                    }
                }
            }
            .navigationTitle("Choose session")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close") { isPresented = false }
                }
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        showsNewSession = true
                    } label: {
                        Label("New session", systemImage: "plus")
                    }
                    .disabled(model.isSessionContextLocked)
                }
            }
            .sheet(isPresented: $showsNewSession) {
                NewCaptureSessionSheet(
                    model: model,
                    isPresented: $showsNewSession,
                    onCreated: {
                        showsNewSession = false
                        isPresented = false
                    }
                )
                    .presentationDetents([.medium])
            }
        }
    }
}

private struct NewCaptureSessionSheet: View {
    @ObservedObject var model: CaptureExperienceModel
    @Binding var isPresented: Bool
    let onCreated: () -> Void
    @FocusState private var titleFocused: Bool

    var body: some View {
        NavigationStack {
            Form {
                Section("Session") {
                    TextField("Session title", text: $model.newSessionTitle)
                        .textInputAutocapitalization(.sentences)
                        .focused($titleFocused)
                        .accessibilityIdentifier("NewCaptureSessionTitleField")
                    Picker("Purpose", selection: $model.newSessionPurpose) {
                        Label("Coaching", systemImage: "person.2").tag("COACHING")
                        Label("Podcast", systemImage: "mic.and.signal.meter").tag("PODCAST")
                        Label("Interview", systemImage: "quote.bubble").tag("RESEARCH_INTERVIEW")
                        Label("Field note", systemImage: "location").tag("FIELD_NOTE")
                    }
                }

                Section {
                    Label("Creating a session never starts a call or recording. Consent remains a separate action.", systemImage: "checkmark.shield")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("New session")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(model.isCreatingSession ? "Creating…" : "Create") {
                        Task {
                            if await model.createSession() {
                                onCreated()
                            }
                        }
                    }
                    .disabled(model.isCreatingSession || model.newSessionTitle.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("NewCaptureSessionCreateButton")
                }
            }
            .onAppear { titleFocused = true }
        }
    }
}

private struct AccountDeletionSheet: View {
    @Binding var isPresented: Bool
    @ObservedObject var client: AccountDeletionClient
    let usesPreviewData: Bool
    @State private var reason = ""
    @State private var confirmsRequest = false

    private var hasActiveRequest: Bool {
        client.latestRequest?.active == true
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Request deletion of your Quipsly account and associated app-owned data. The request is reviewed so recording retention and legal obligations can be handled honestly.")
                        .font(.subheadline)
                }

                Section("Expected timing") {
                    Text(client.policy?.timing ?? "Quipsly targets completion within 30 days. If legal retention or unusually complex attached records require more time, Quipsly will explain the delay.")
                    Text(client.policy?.completionConfirmation ?? "Reopen Account to follow progress. Quipsly also sends completion confirmation to your account email.")
                        .foregroundStyle(.secondary)
                }

                if let request = client.latestRequest {
                    AccountDeletionRequestStatusSection(request: request)
                }

                if !hasActiveRequest {
                    Section("Optional note") {
                        TextField("Why are you leaving?", text: $reason, axis: .vertical)
                            .lineLimit(2...4)
                    }
                    Section {
                        Toggle("I want to submit an account deletion request", isOn: $confirmsRequest)
                    }
                }

                if let error = client.errorMessage {
                    Section { Text(error).foregroundStyle(.red) }
                } else if let next = client.latestNextAction {
                    Section("Next step") { Text(next).foregroundStyle(.secondary) }
                }
            }
            .accessibilityIdentifier("AccountDeletionSheet")
            .navigationTitle("Delete account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(hasActiveRequest ? "Done" : "Cancel") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    if hasActiveRequest {
                        Button(client.isLoading ? "Refreshing…" : "Refresh") {
                            Task { await client.loadStatus() }
                        }
                        .disabled(client.isLoading)
                    } else {
                        Button("Submit", role: .destructive) {
                            Task { await client.requestDeletion(reason: reason) }
                        }
                        .disabled(!confirmsRequest || client.isSubmitting || usesPreviewData)
                    }
                }
            }
            .task {
                guard !usesPreviewData else { return }
                await client.loadStatus()
            }
        }
    }
}

private struct AccountDeletionRequestStatusSection: View {
    let request: AccountDeletionRequestPayload

    var body: some View {
        Section("Request status") {
            LabeledContent("Status", value: request.statusLabel ?? request.status ?? "Recorded")
            if let requested = accountDeletionDate(request.requestedAt) {
                LabeledContent("Requested", value: requested)
            }
            if let completed = accountDeletionDate(request.completedAt) {
                LabeledContent("Completed", value: completed)
            } else if let target = accountDeletionDate(request.targetCompletionAt) {
                LabeledContent("Target", value: target)
            }
            if let detail = request.statusDetail {
                Text(detail).foregroundStyle(.secondary)
            }
        }
    }
}

private struct AccountDeletionStatusCard: View {
    let request: AccountDeletionRequestPayload
    @ObservedObject var client: AccountDeletionClient
    let onOpen: () -> Void

    var body: some View {
        Button(action: onOpen) {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Label("Account deletion", systemImage: request.status == "COMPLETED" ? "checkmark.circle.fill" : "clock.arrow.circlepath")
                        .font(.headline)
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.tertiary)
                }
                Text(request.statusLabel ?? request.status ?? "Request recorded")
                    .font(.subheadline.weight(.semibold))
                if let completed = accountDeletionDate(request.completedAt) {
                    Text("Completed \(completed)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                } else if let target = accountDeletionDate(request.targetCompletionAt) {
                    Text("Target completion by \(target)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if client.isLoading {
                    ProgressView().controlSize(.small)
                }
            }
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .captureCard()
        .accessibilityIdentifier("AccountDeletionStatusCard")
    }
}

private func accountDeletionDate(_ value: String?) -> String? {
    guard let value else { return nil }
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    guard let date = formatter.date(from: value) else { return nil }
    return date.formatted(date: .abbreviated, time: .omitted)
}

private struct GlobalCaptureBanner: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    let title: String
    let duration: TimeInterval
    let tint: Color
    let isPulsing: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: isPulsing ? "record.circle.fill" : "pause.circle.fill")
                    .symbolEffect(
                        .pulse,
                        isActive: isPulsing && !reduceMotion
                    )
                Text(title)
                    .font(.subheadline.weight(.bold))
                Spacer()
                Text(duration.captureDurationLabel)
                    .font(.subheadline.monospacedDigit().weight(.semibold))
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
            }
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .frame(height: 44)
            .background(tint)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open \(title.lowercased())")
        .accessibilityValue("\(title), \(duration.captureDurationLabel)")
        .accessibilityIdentifier("GlobalCaptureBanner")
    }
}

private struct LocalSafetySummary: View {
    let recordingCount: Int
    let pendingCount: Int

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "iphone.gen3.radiowaves.left.and.right")
                .font(.title2)
                .foregroundStyle(CapturePalette.accent)
            VStack(alignment: .leading, spacing: 3) {
                Text("Local source is production truth")
                    .font(.subheadline.weight(.semibold))
                Text(recordingCount == 0
                     ? "Completed takes will stay on this iPhone until verification."
                     : "\(recordingCount) local source\(recordingCount == 1 ? "" : "s") · \(pendingCount) awaiting verification")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer()
        }
        .captureCard()
    }
}

private struct SourceTruthFootnote: View {
    let mode: CaptureRecordingMode

    var body: some View {
        Label(detail, systemImage: "lock.shield")
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
            .accessibilityIdentifier("CaptureSourceTruthFootnote")
    }

    private var detail: String {
        switch mode {
        case .audio:
            "The local file is this iPhone's immutable microphone source. Room audio is coordination; only a verified, released upload becomes editor input."
        case .podcastAV:
            "The local microphone and video-only movie are separate immutable masters in one capture group. Room audio stays independent; a human reviews clock and waveform sync."
        case .soloVideo:
            "The local movie is this iPhone's immutable camera-and-microphone source. Only exact-byte verification and reviewed editor placement can promote it."
        case .podcastCamera:
            "The local movie is an immutable video-only camera source. Room audio stays independent; clock evidence proposes placement, and a human reviews sync."
        }
    }
}

private struct CaptureInlineMessage: View {
    let text: String
    var body: some View {
        Label(text, systemImage: "checkmark.circle.fill")
            .font(.caption.weight(.medium))
            .foregroundStyle(.green)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

private struct CaptureInlineWarning: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "pause.circle.fill")
            .font(.caption.weight(.medium))
            .foregroundStyle(.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .background(.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .accessibilityIdentifier("CapturePausedReason")
    }
}

private struct CaptureLoadingCard: View {
    let label: String
    var body: some View {
        HStack(spacing: 12) {
            ProgressView()
            Text(label).foregroundStyle(.secondary)
            Spacer()
        }
        .captureCard()
    }
}

private struct CaptureEmptyCard: View {
    let systemImage: String
    let title: String
    let detail: String
    let actionTitle: String
    let action: () -> Void

    var body: some View {
        VStack(spacing: 13) {
            Image(systemName: systemImage)
                .font(.system(size: 34, weight: .medium))
                .foregroundStyle(CapturePalette.accent)
            Text(title).font(.title3.weight(.bold))
            Text(detail)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Button(actionTitle, action: action)
                .buttonStyle(.borderedProminent)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 12)
        .captureCard()
    }
}

private struct CaptureAttentionCard: View {
    let systemImage: String
    let title: String
    let detail: String
    let buttonTitle: String
    let action: () -> Void

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: systemImage)
                .font(.title3)
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 5) {
                Text(title).font(.headline)
                Text(detail).font(.caption).foregroundStyle(.secondary)
                Button(buttonTitle, action: action).font(.caption.weight(.semibold))
            }
            Spacer()
        }
        .padding(14)
        .background(.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct CaptureStatusPill: View {
    let label: String
    let systemImage: String
    let tint: Color

    var body: some View {
        Label(label, systemImage: systemImage)
            .font(.caption2.weight(.bold))
            .foregroundStyle(tint)
            .padding(.horizontal, 9)
            .padding(.vertical, 5)
            .background(tint.opacity(0.11), in: Capsule())
    }
}

private struct AccountLinkRow: View {
    let label: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .frame(width: 28)
            Text(label)
            Spacer()
            Image(systemName: "chevron.right")
                .font(.caption.weight(.bold))
                .foregroundStyle(.tertiary)
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, 10)
        .frame(minHeight: 48)
        .contentShape(Rectangle())
    }
}

private struct CaptureRecordButtonStyle: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.94 : 1)
            .opacity(configuration.isPressed ? 0.82 : 1)
            .animation(reduceMotion ? nil : .spring(response: 0.22, dampingFraction: 0.72), value: configuration.isPressed)
    }
}

private struct CaptureCanvas: View {
    @Environment(\.colorScheme) private var colorScheme

    var body: some View {
        LinearGradient(
            colors: colorScheme == .dark
                ? [Color.black, Color(red: 0.02, green: 0.12, blue: 0.14)]
                : [Color(.systemGroupedBackground), CapturePalette.accent.opacity(0.055)],
            startPoint: .top,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

private enum CapturePalette {
    static let accent = Color(red: 0.02, green: 0.67, blue: 0.69)
    static let record = Color(red: 0.92, green: 0.13, blue: 0.19)
    static let meterGradient = LinearGradient(
        colors: [accent, .green, .yellow, .orange],
        startPoint: .leading,
        endPoint: .trailing
    )
}

extension View {
    func captureCard(contentPadding: CGFloat = 16) -> some View {
        self
            .padding(contentPadding)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(.primary.opacity(0.055), lineWidth: 1)
            }
    }
}

private extension MobileCaptureSession {
    var capturePurposeIcon: String {
        switch purpose?.uppercased() {
        case "COACHING": "person.2.fill"
        case "PODCAST": "mic.and.signal.meter.fill"
        case "RESEARCH_INTERVIEW": "quote.bubble.fill"
        case "FIELD_NOTE": "location.fill"
        default: "record.circle"
        }
    }

    var captureScheduleLabel: String {
        guard let scheduledStart, !scheduledStart.isEmpty else {
            return purpose?.replacingOccurrences(of: "_", with: " ").capitalized ?? "Capture session"
        }
        let formatter = ISO8601DateFormatter()
        guard let date = formatter.date(from: scheduledStart) else { return scheduledStart }
        if Calendar.current.isDateInToday(date) {
            return "Today at \(date.formatted(date: .omitted, time: .shortened))"
        }
        if Calendar.current.isDateInTomorrow(date) {
            return "Tomorrow at \(date.formatted(date: .omitted, time: .shortened))"
        }
        return date.formatted(date: .abbreviated, time: .shortened)
    }
}

private extension TimeInterval {
    var captureDurationLabel: String {
        let total = max(0, Int(rounded(.down)))
        let hours = total / 3600
        let minutes = (total % 3600) / 60
        let seconds = total % 60
        return hours > 0
            ? String(format: "%02d:%02d:%02d", hours, minutes, seconds)
            : String(format: "%02d:%02d", minutes, seconds)
    }
}

private extension String {
    var nonempty: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

#Preview {
    CapturePhoneShell()
        .environmentObject(AudioCaptureController())
        .environmentObject(VideoCaptureController())
}
