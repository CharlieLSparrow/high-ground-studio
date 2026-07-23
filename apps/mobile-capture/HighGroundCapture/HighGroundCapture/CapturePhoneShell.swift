import SwiftUI

struct CapturePhoneShell: View {
    @EnvironmentObject private var audioCapture: AudioCaptureController
    @StateObject private var model = CaptureExperienceModel()
    @State private var showsNewSession = false

    var body: some View {
        TabView(selection: $model.selectedTab) {
            NavigationStack {
                CaptureTodayView(model: model, showsNewSession: $showsNewSession)
            }
            .tabItem { Label(CaptureRootTab.today.title, systemImage: CaptureRootTab.today.systemImage) }
            .tag(CaptureRootTab.today)

            NavigationStack {
                CaptureRecorderView(model: model)
            }
            .tabItem { Label(CaptureRootTab.record.title, systemImage: CaptureRootTab.record.systemImage) }
            .tag(CaptureRootTab.record)

            NavigationStack {
                CaptureLibraryView(model: model)
            }
            .tabItem { Label(CaptureRootTab.library.title, systemImage: CaptureRootTab.library.systemImage) }
            .tag(CaptureRootTab.library)

            NavigationStack {
                CaptureAccountView(model: model)
            }
            .tabItem { Label(CaptureRootTab.account.title, systemImage: CaptureRootTab.account.systemImage) }
            .tag(CaptureRootTab.account)
        }
        .tint(CapturePalette.accent)
        .safeAreaInset(edge: .top, spacing: 0) {
            if captureIsActive {
                GlobalCaptureBanner(
                    state: audioCapture.captureState,
                    duration: audioCapture.currentDuration,
                    action: { model.selectedTab = .record }
                )
            }
        }
        .sheet(isPresented: $showsNewSession) {
            NewCaptureSessionSheet(model: model, isPresented: $showsNewSession)
                .presentationDetents([.medium, .large])
        }
        .alert("Capture needs attention", isPresented: errorIsPresented) {
            Button("OK") { model.errorMessage = nil }
        } message: {
            Text(model.errorMessage ?? "Try again.")
        }
        .task {
            await model.load()
        }
        .onChange(of: audioCapture.captureState) { _, state in
            model.reconcileCaptureState(state)
        }
    }

    private var captureIsActive: Bool {
        switch audioCapture.captureState {
        case .recording, .paused, .finalizing:
            true
        default:
            false
        }
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
                        model.select(next, openRecorder: true)
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

                TodayFollowThroughCard(client: model.todayClient, previewOnly: model.usesPreviewData)

                if model.uploadManager.recoverableUploadCount > 0 {
                    CaptureAttentionCard(
                        systemImage: "icloud.and.arrow.up",
                        title: "Saved locally",
                        detail: "\(model.uploadManager.recoverableUploadCount) recording\(model.uploadManager.recoverableUploadCount == 1 ? " is" : "s are") waiting to upload. The originals remain on this iPhone.",
                        buttonTitle: "Open Library"
                    ) {
                        model.selectedTab = .library
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
                                model.select(session, openRecorder: true)
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

private struct TodayFollowThroughCard: View {
    private struct TranscriptSourceDestination: Hashable {
        let roomID: String
        let sessionTitle: String
        let source: MobileCaptureTodayTranscriptSourceAnchor
    }

    @ObservedObject var client: CaptureTodayClient
    let previewOnly: Bool
    @StateObject private var library = LocalRecordingLibrary.shared
    @State private var recurrenceToEnd: MobileCaptureTodayRecurrence?
    @State private var recurrenceToEdit: MobileCaptureTodayTask?
    @State private var missedOccurrenceToSkip: MobileCaptureTodayTask?
    @State private var reminderToEdit: MobileCaptureTodayTask?
    @State private var reminderToCancel: MobileCaptureTodayTask?
    @State private var taskTagsToEdit: MobileCaptureTodayTask?
    @State private var goalTagsToEdit: MobileCaptureTodayGoal?
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
                                    let visibleTagIDs = client.effectiveTagIDs(
                                        kind: .task,
                                        entityID: task.id,
                                        canonicalTagIDs: task.tagIds ?? []
                                    )
                                    Text(task.title)
                                        .font(.subheadline.weight(.semibold))
                                        .accessibilityIdentifier("CaptureTodayTask_\(task.id)")
                                    if let sessionTitle = task.sessionTitle {
                                        Text(sessionTitle).font(.caption).foregroundStyle(.secondary)
                                    }
                                    if let project = task.project {
                                        TodayProjectTagLine(
                                            project: project,
                                            tagLabels: pendingTags == nil
                                                ? task.tagLabels ?? []
                                                : client.tagLabels(projectID: project.id, tagIDs: visibleTagIDs),
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
                            withAnimation(.easeInOut(duration: 0.2)) {
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
                            let visibleTagIDs = client.effectiveTagIDs(
                                kind: .goal,
                                entityID: goal.id,
                                canonicalTagIDs: goal.tagIds ?? []
                            )
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
                            if let project = goal.project {
                                TodayProjectTagLine(
                                    project: project,
                                    tagLabels: pendingTags == nil
                                        ? goal.tagLabels ?? []
                                        : client.tagLabels(projectID: project.id, tagIDs: visibleTagIDs),
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

            if !client.sourceAnnotations.isEmpty {
                VStack(alignment: .leading, spacing: 9) {
                    Label("Research cues", systemImage: "text.quote")
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.indigo)
                    Text("Source-linked notes from the same Nests as web")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                    ForEach(client.sourceAnnotations.prefix(2)) { annotation in
                        VStack(alignment: .leading, spacing: 5) {
                            Text(annotation.sourceTitle)
                                .font(.subheadline.weight(.semibold))
                            if let quote = annotation.exactText, !quote.isEmpty {
                                Text("“\(quote)”")
                                    .font(.caption)
                                    .italic()
                                    .lineLimit(3)
                                    .foregroundStyle(.secondary)
                            }
                            if !annotation.body.isEmpty {
                                Text(annotation.body)
                                    .font(.subheadline)
                                    .lineLimit(3)
                            }
                            HStack {
                                Text(annotation.visibility == "private" ? "Only me" : annotation.projectName)
                                    .font(.caption2.weight(.semibold))
                                    .foregroundStyle(.secondary)
                                Spacer()
                                if annotation.createdByMe {
                                    Button("Resolved") {
                                        Task { _ = await client.setSourceAnnotationStatus(annotation, status: "resolved") }
                                    }
                                    .font(.caption.weight(.bold))
                                    .buttonStyle(.bordered)
                                    .disabled(decisionsDisabled)
                                    .accessibilityHint("Resolves only this source-linked annotation. The preserved source is not changed.")
                                }
                            }
                        }
                        .padding(10)
                        .background(Color.indigo.opacity(0.07), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel("Research cues")
                .accessibilityIdentifier("CaptureTodayResearchCues")
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

            if client.tasks.isEmpty, client.goals.isEmpty, client.focusBlocks.isEmpty, client.transcriptReviews.isEmpty, client.sourceAnnotations.isEmpty, client.weeklyPlan == nil, !client.isLoading {
                Text("No committed follow-through is available yet. Add a task, goal, focus block, weekly plan, or source annotation in Nest; Today will use the same canonical record.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let error = client.errorMessage {
                Label(error, systemImage: client.isUsingProtectedCache ? "lock.shield" : "exclamationmark.triangle")
                    .font(.caption)
                    .foregroundStyle(client.isUsingProtectedCache ? Color.secondary : Color.orange)
            }

            Text("Task and goal tag selections and one-time reminder changes are protected on this iPhone before Nest sync. Tags stay inside their Nest; iOS controls reminder delivery and Quipsly never claims it in advance. Goal check-ins record progress without changing goal status. Recurring-task completion, an explicit missed-occurrence skip, and series controls change only canonical Quipsly work; they preserve history and do not schedule reminders or provider events. Focus completion never completes its task or goal. Annotation review never changes preserved source text. Transcript proposals stay non-authoritative until exact-source playback review. Today does not change calendars, providers, or recording state.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .accessibilityIdentifier("CaptureTodayFollowThroughBoundary")
        }
        .captureCard()
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

    @State private var selectedTagIDs: Set<String>
    @State private var searchText = ""

    init(
        client: CaptureTodayClient,
        kind: PendingWorkTagDecision.EntityKind,
        entityID: String,
        entityTitle: String,
        project: MobileCaptureTodayProject,
        canonicalTagIDs: [String],
        expectedUpdatedAt: String
    ) {
        self.client = client
        self.kind = kind
        self.entityID = entityID
        self.entityTitle = entityTitle
        self.project = project
        self.canonicalTagIDs = canonicalTagIDs
        self.expectedUpdatedAt = expectedUpdatedAt
        _selectedTagIDs = State(initialValue: Set(canonicalTagIDs))
    }

    private var visibleTags: [MobileCaptureTodayTag] {
        let tags = client.tags(for: project.id)
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
        client.tags(for: project.id).filter {
            !$0.isActive && selectedTagIDs.contains($0.id)
        }
    }

    var body: some View {
        NavigationStack {
            List {
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
                                ? "Create the first reusable label in Nest, then refresh Today."
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
                    Text("Create, rename, merge, and archive the reusable vocabulary in Nest. Today applies the active labels from this exact Nest.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .searchable(text: $searchText, prompt: "Find a tag")
            .navigationTitle("Edit tags")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let selection = selectedTagIDs.sorted()
                        Task {
                            let saved = await client.setWorkTags(
                                kind: kind,
                                entityID: entityID,
                                projectID: project.id,
                                tagIDs: selection,
                                expectedUpdatedAt: expectedUpdatedAt
                            )
                            if saved { dismiss() }
                        }
                    }
                    .disabled(!selectionChanged || !archivedSelection.isEmpty || client.isMutating)
                    .accessibilityIdentifier("CaptureTodayWorkTagsSave")
                }
            }
        }
    }
}

private struct CaptureRecurrenceEditSheet: View {
    @ObservedObject var client: CaptureTodayClient
    let task: MobileCaptureTodayTask
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

    init(client: CaptureTodayClient, task: MobileCaptureTodayTask) {
        self.client = client
        self.task = task
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
                            if saved { dismiss() }
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

    @State private var isEditing = false
    @State private var progressPercent: Int
    @State private var note = ""

    init(client: CaptureTodayClient, goal: MobileCaptureTodayGoal, decisionsDisabled: Bool) {
        self.client = client
        self.goal = goal
        self.decisionsDisabled = decisionsDisabled
        _progressPercent = State(initialValue: goal.progressPercent ?? 0)
    }

    var body: some View {
        if isEditing {
            VStack(alignment: .leading, spacing: 10) {
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

private struct CaptureRecorderView: View {
    @ObservedObject var model: CaptureExperienceModel
    @EnvironmentObject private var audioCapture: AudioCaptureController
    @State private var showsSessionPicker = false
    @State private var showsRoomDetails = false
    @State private var showsSessionContext = false
    @State private var showsConsentConfirmation = false
    @State private var quickEntryKind: MobileQuickEntryKind?

    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                SessionChooserButton(session: model.selectedSession) {
                    showsSessionPicker = true
                }
                .disabled(model.isSessionContextLocked)

                CaptureQuickEntryBar(session: model.selectedSession) { kind in
                    quickEntryKind = kind
                }

                if model.quickEntryOutbox.hasRetryableEntries || model.quickEntrySyncMessage != nil {
                    CaptureQuickEntrySyncCard(model: model)
                }

                if let session = model.selectedSession {
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

                    ConsentStrip(
                        session: session,
                        isBusy: model.isChangingConsent,
                        isCaptureActive: captureIsActive,
                        onGrant: { showsConsentConfirmation = true },
                        onRevoke: { Task { await model.revokeConsent() } }
                    )

                    RecorderHero(
                        session: session,
                        captureState: audioCapture.captureState,
                        duration: audioCapture.currentDuration,
                        inputLevel: audioCapture.normalizedInputLevel,
                        inputRoute: audioCapture.inputRouteName,
                        userMarkOffsets: audioCapture.userMarkOffsets,
                        isBusy: model.isChangingCapture,
                        onPrimaryAction: {
                            Task {
                                if captureIsActive {
                                    await model.stopCapture(using: audioCapture)
                                } else {
                                    await model.startCapture(using: audioCapture)
                                }
                            }
                        },
                        onPauseResume: { Task { await model.togglePause(using: audioCapture) } },
                        onMark: { model.markMoment(using: audioCapture) }
                    )

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

                    DisclosureGroup(isExpanded: $showsRoomDetails) {
                        ProviderRoomControls(
                            model: model,
                            session: session,
                            captureState: audioCapture.captureState
                        )
                            .padding(.top, 12)
                    } label: {
                        HStack {
                            Label("Live room", systemImage: "person.2.wave.2")
                                .font(.headline)
                            Spacer()
                            Text(captureIsActive ? "Locked for take" : model.providerRoom.isConnected ? "Connected" : session.providerBadgeLabel)
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(captureIsActive ? Color.orange : model.providerRoom.isConnected ? Color.green : Color.secondary)
                        }
                    }
                    .captureCard()
                    .accessibilityHint(captureIsActive ? model.providerControlsLockMessage : "Shows optional live room controls. Joining never starts local recording.")
                    .accessibilityIdentifier("CaptureLiveRoomDisclosure")

                    SourceTruthFootnote()
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
                .presentationDetents([.medium, .large])
        }
        .interactiveDismissDisabled(captureIsActive)
    }

    private var captureIsActive: Bool {
        switch audioCapture.captureState {
        case .recording, .paused, .finalizing:
            true
        default:
            false
        }
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
                    .disabled(session == nil && kind != .source)
                    .accessibilityHint(kind == .source
                        ? "Opens a protected personal source capture for Nest Inbox."
                        : session.map { "Opens a local-first \(kind.title.lowercased()) for \($0.displayTitle)." } ?? "Choose a Session first.")
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

struct CaptureQuickEntrySheet: View {
    let kind: MobileQuickEntryKind
    let session: MobileCaptureSession?
    @ObservedObject var model: CaptureExperienceModel
    @Environment(\.dismiss) private var dismiss
    @State private var title = ""
    @State private var entryBody = ""
    @State private var selectedTagIDs: Set<String> = []
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

    private var availableTags: [MobileCaptureTag] {
        session?.availableTags ?? []
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
                    } else if let session {
                        LabeledContent("Session", value: session.displayTitle)
                        LabeledContent("Nest", value: session.projectName?.nonempty ?? session.projectSlug?.nonempty ?? "Unfiled")
                    }
                } footer: {
                    Text(kind == .source
                        ? "This source stays private and unfiled in your Inbox until you deliberately choose a Research Nest. It does not send, schedule, deliver, or publish anything."
                        : "This explicit capture stays private to your account and Session access. It does not send, schedule, deliver, or publish anything.")
                }

                Section(kind == .note ? "Note" : kind.title) {
                    if kind != .note {
                        TextField(kind == .task ? "What needs doing?" : kind == .goal ? "What does better look like?" : "Source title (optional)", text: $title, axis: .vertical)
                            .lineLimit(1...3)
                            .accessibilityIdentifier("CaptureQuickEntryTitle")
                    }
                    TextField(
                        kind == .note ? "Capture the thought…" : kind == .task ? "Useful detail or definition of done (optional)" : kind == .goal ? "Why it matters or how progress will look (optional)" : "Paste a web link or quoted text…",
                        text: $entryBody,
                        axis: .vertical
                    )
                    .lineLimit(kind == .note || kind == .source ? 5...12 : 3...10)
                    .accessibilityIdentifier("CaptureQuickEntryBody")
                }

                if kind != .source, session?.projectId?.nonempty != nil {
                    Section {
                        ForEach(availableTags) { tag in
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
                        Text("Choose or name up to eight tags. New names are protected in the phone outbox, then Nest creates or reuses the private canonical tag during sync. Work, Search, and this Session use that same canonical tag; Today keeps it when the work is planned or needs attention there.")
                    }
                }

                if kind == .task {
                    Section {
                        Picker("Repeat", selection: $recurrenceMode) {
                            Text("Does not repeat").tag("NONE")
                            Text("Fixed schedule").tag("FIXED")
                            Text("After completion").tag("COMPLETION")
                        }
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
                            Stepper("Every \(recurrenceInterval) \(recurrenceUnitName)\(recurrenceInterval == 1 ? "" : "s")", value: $recurrenceInterval, in: 1...365)
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
                                : "One-time tasks can be timed later from Today, Work, or Calendar.")
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

                Section {
                    Label("Saved on this iPhone before Nest sync", systemImage: "iphone.gen3.radiowaves.left.and.right")
                    Label("Retry keeps one canonical ID", systemImage: "arrow.triangle.2.circlepath")
                }
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)
            }
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
            }
        }
        .sheet(isPresented: $showsRecurrenceTimezonePicker) {
            CaptureTimeZonePickerSheet(
                selectedIdentifier: recurrenceTimezoneID,
                onSelect: selectRecurrenceTimeZone
            )
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
                    CaptureEmptyCard(
                        systemImage: "waveform",
                        title: "No local recordings yet",
                        detail: "Your first completed take will appear here before any upload is considered complete.",
                        actionTitle: "Open recorder",
                        action: { model.selectedTab = .record }
                    )
                    if model.usesPreviewData {
                        NavigationLink {
                            CaptureTranscriptReviewView(
                                roomID: "room-preview-coaching-ready",
                                sessionTitle: "Homer coaching session",
                                recording: nil,
                                previewOnly: true
                            )
                        } label: {
                            Label("Preview transcript review", systemImage: "waveform.and.magnifyingglass")
                                .font(.headline)
                                .frame(maxWidth: .infinity, minHeight: 44, alignment: .leading)
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureTranscriptReviewPreviewLink")
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
        .onDisappear { playback.stop() }
    }

    private var captureIsActive: Bool {
        switch audioCapture.captureState {
        case .recording, .paused, .finalizing: true
        default: false
        }
    }
}

private struct CaptureAccountView: View {
    @ObservedObject var model: CaptureExperienceModel
    @EnvironmentObject private var audioCapture: AudioCaptureController
    @StateObject private var auth = AuthManager.shared
    @StateObject private var library = LocalRecordingLibrary.shared
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
            }
            .padding(.horizontal, 18)
            .padding(.top, 16)
            .padding(.bottom, 96)
        }
        .background(CaptureCanvas())
        .navigationTitle("Account")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showsDeletion) {
            AccountDeletionSheet(isPresented: $showsDeletion)
                .presentationDetents([.medium])
        }
        .alert("Capture session is still active", isPresented: $showsSignOutWarning) {
            Button("Keep session active", role: .cancel) {}
            Button("Open recorder") { model.selectedTab = .record }
        } message: {
            Text("Stop and save the local source and leave any live room before signing out.")
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
                Image(systemName: session.recordingConsentGranted ? "checkmark.shield.fill" : "shield.lefthalf.filled.badge.checkmark")
                    .foregroundStyle(session.recordingConsentGranted ? .green : .orange)
                    .accessibilityLabel(session.recordingConsentGranted ? "Consent granted" : "Consent needed")
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
        .background((session.recordingConsentGranted ? Color.green : Color.orange).opacity(0.09), in: RoundedRectangle(cornerRadius: 17, style: .continuous))
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
        Image(systemName: session.recordingConsentGranted ? "checkmark.shield.fill" : "exclamationmark.shield.fill")
            .font(.title3)
            .foregroundStyle(session.recordingConsentGranted ? .green : .orange)
            .accessibilityHidden(true)
    }

    @ViewBuilder
    private var consentAction: some View {
        if isBusy {
            ProgressView()
        } else if session.recordingConsentGranted {
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
        session.recordingConsentGranted ? "Recorder attestation saved" : "Consent attestation required"
    }

    private var consentDetail: String {
        if let required = session.consentRequiredParticipantCount,
           let granted = session.consentGrantedParticipantCount,
           required > 1,
           granted < required {
            return "\(granted) of \(required) signed-in participants consented. Each person must confirm; everyone else who may be heard must also be told and agree."
        }
        return session.recordingConsentGranted
            ? "You confirmed everyone who may be heard was told and agreed. Recording still starts visibly."
            : "Confirm your consent and that everyone who may be heard was told and agreed."
    }
}

struct CaptureConsentConfirmationSheet: View {
    @Environment(\.dismiss) private var dismiss
    let session: MobileCaptureSession
    let requiresStableOwner: Bool
    let onSave: @MainActor @Sendable (Bool, Bool, Bool, Bool, Date) async -> Bool

    @State private var canRecordAudio = false
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

                    HStack(alignment: .top, spacing: 12) {
                        Image(systemName: "video.slash")
                            .foregroundStyle(.secondary)
                            .frame(width: 24)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("Record video")
                            Text("Off — Quipsly Capture does not request video recording in this flow.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer()
                        Text("Off")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("CaptureConsentVideoOffRow")
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

                Section("Everyone who may be heard") {
                    Toggle(isOn: $allAudibleParticipantsNotifiedAndAgreed) {
                        Text("I confirm that everyone who may be heard — including people who are not signed into Quipsly — was told about the recording and transcription choices and agreed before recording starts.")
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
                    Button {
                        submitConsent()
                    } label: {
                        HStack {
                            Spacer()
                            if isSubmitting {
                                ProgressView()
                            } else {
                                Text("Save these choices")
                                    .fontWeight(.semibold)
                            }
                            Spacer()
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(!canRecordAudio || !allAudibleParticipantsNotifiedAndAgreed || isSubmitting)
                    .accessibilityIdentifier("CaptureConsentSaveChoicesButton")
                } footer: {
                    Text(canTranscribe
                        ? "You are allowing audio recording and transcription. Video remains off."
                        : "You are allowing audio recording only. Video and transcription remain off.")
                }
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

    private func submitConsent() {
        guard canRecordAudio, allAudibleParticipantsNotifiedAndAgreed, !isSubmitting else { return }
        if requiresStableOwner {
            guard let presentationOwnerSnapshot,
                  AuthManager.shared.matchesStableOwnerSnapshot(presentationOwnerSnapshot) else {
                localErrorMessage = "The Quipsly account changed after these choices were shown. Close this sheet and review consent again under the current account."
                return
            }
        }
        localErrorMessage = nil
        isSubmitting = true
        let transcriptionChoice = canTranscribe
        let consentPresentationDate = presentedAt
        Task { @MainActor [transcriptionChoice, consentPresentationDate] in
            let saved = await onSave(
                true,
                false,
                transcriptionChoice,
                true,
                consentPresentationDate
            )
            isSubmitting = false
            if saved { dismiss() }
        }
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

private struct RecorderHero: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ScaledMetric(relativeTo: .largeTitle) private var timerFontSize: CGFloat = 40

    let session: MobileCaptureSession
    let captureState: AudioCaptureState
    let duration: TimeInterval
    let inputLevel: Double
    let inputRoute: String
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
                Text(inputRoute.isEmpty ? "iPhone microphone" : inputRoute)
                    .multilineTextAlignment(.center)
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

    var body: some View {
        ZStack {
            GeometryReader { proxy in
                ZStack(alignment: .leading) {
                    Capsule().fill(.secondary.opacity(0.14))
                    Capsule()
                        .fill(isActive ? CapturePalette.meterGradient : LinearGradient(colors: [.secondary.opacity(0.35)], startPoint: .leading, endPoint: .trailing))
                        .frame(width: max(8, proxy.size.width * min(max(level, 0), 1)))
                        .animation(reduceMotion ? nil : .easeOut(duration: 0.1), value: level)
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
        .accessibilityValue(isActive ? "\(Int(level * 100)) percent" : "Inactive")
    }
}

private struct ProviderRoomControls: View {
    @ObservedObject var model: CaptureExperienceModel
    let session: MobileCaptureSession
    let captureState: AudioCaptureState

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
        if model.isChangingCapture { return true }
        switch captureState {
        case .recording, .paused, .finalizing:
            return true
        default:
            return false
        }
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

                Button {
                    Task { await model.promoteSelectedRecordingToStudio() }
                } label: {
                    if model.isPromotingRecordingToStudio {
                        ProgressView()
                            .accessibilityLabel("Attaching recording to Studio")
                    } else {
                        Label(
                            session.recordingPromotedToStudioMedia ? "Attached to Studio" : "Attach to Studio",
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
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureStudioHandoffCard_\(session.id)")
    }

    private var studioHandoffHint: String {
        if captureIsActive {
            return "Stop and save the active take before attaching verified media to Studio."
        }
        if session.recordingPromotedToStudioMedia {
            return "The verified recording is already available to the same Nest in Studio."
        }
        if session.canPromoteRecordingToStudioMedia {
            return "Attaches the verified recording to this Nest's Studio media without deleting or changing the original."
        }
        return session.recordingMediaVaultLine
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
                Image(systemName: recording.status.isVerified ? "checkmark.waveform" : "waveform")
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
                    Label(isPlaying ? "Stop" : "Play", systemImage: isPlaying ? "stop.fill" : "play.fill")
                        .frame(minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(!canAudition || fileURL == nil || !recording.status.isPlaybackEligible)
                .accessibilityHint(recording.status.isPlaybackEligible
                    ? "Auditions the immutable local source."
                    : "Audio is not available for playback until capture is finalized and its stream is decoded.")

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
        switch recording.status {
        case .saved, .queued, .awaitingVerification, .uploadHeld, .recovered, .captureFailed:
            true
        case .armed, .recording, .paused, .finalizing, .validatingRecovery, .uploading, .uploaded, .needsRepair, .missingFile, .deletedLocally:
            false
        }
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
                if model.sessions.isEmpty {
                    ContentUnavailableView("No sessions", systemImage: "calendar", description: Text("Create a session to keep consent and recordings together."))
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
                NewCaptureSessionSheet(model: model, isPresented: $showsNewSession)
                    .presentationDetents([.medium])
            }
        }
    }
}

private struct NewCaptureSessionSheet: View {
    @ObservedObject var model: CaptureExperienceModel
    @Binding var isPresented: Bool
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
                                isPresented = false
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
    @StateObject private var client = AccountDeletionClient()
    @State private var reason = ""
    @State private var confirmsRequest = false

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Request deletion of your Quipsly account and associated app-owned data. The request is reviewed so recording retention and legal obligations can be handled honestly.")
                        .font(.subheadline)
                }
                Section("Optional note") {
                    TextField("Why are you leaving?", text: $reason, axis: .vertical)
                        .lineLimit(2...4)
                }
                Section {
                    Toggle("I want to submit an account deletion request", isOn: $confirmsRequest)
                }
                if let error = client.errorMessage {
                    Section { Text(error).foregroundStyle(.red) }
                } else if let next = client.latestNextAction {
                    Section { Text(next).foregroundStyle(.secondary) }
                }
            }
            .navigationTitle("Delete account")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Submit", role: .destructive) {
                        Task { await client.requestDeletion(reason: reason) }
                    }
                    .disabled(!confirmsRequest || client.isSubmitting)
                }
            }
        }
    }
}

private struct GlobalCaptureBanner: View {
    let state: AudioCaptureState
    let duration: TimeInterval
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: state == .paused ? "pause.circle.fill" : "record.circle.fill")
                    .symbolEffect(.pulse, isActive: state == .recording)
                Text(state == .paused ? "Recording paused" : state == .finalizing ? "Saving recording" : "Recording")
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
            .background(state == .paused ? Color.orange : Color.red)
        }
        .buttonStyle(.plain)
        .accessibilityLabel(state == .finalizing ? "Open recording being saved" : "Open active recording")
        .accessibilityValue("\(state == .paused ? "Paused" : state == .finalizing ? "Saving" : "Recording"), \(duration.captureDurationLabel)")
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
    var body: some View {
        Label("The local file is this iPhone's immutable microphone source. Room audio is coordination; only a verified, released upload becomes editor input.", systemImage: "lock.shield")
            .font(.caption)
            .foregroundStyle(.secondary)
            .padding(.horizontal, 6)
            .accessibilityIdentifier("CaptureSourceTruthFootnote")
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

private extension View {
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
}
