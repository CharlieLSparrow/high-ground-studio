import SwiftUI

struct MobileStudioBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(.systemBackground),
                Color.teal.opacity(0.10),
                Color.orange.opacity(0.08),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

struct CaptureSessionContextPanel: View {
    let session: MobileCaptureSession
    @ObservedObject var sessionClient: CaptureSessionClient
    @State private var draft = CaptureSessionContextDraft()
    @State private var loadedSessionID: String?
    @State private var syncStatus = "Saved on this device"
    @State private var isSyncingContext = false
    @State private var remoteConflictDraft: CaptureSessionContextDraft?
    @State private var conflictMessage: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Label("Session context", systemImage: "note.text.badge.plus")
                        .font(.caption.bold())
                    Text("Local-first prep notes, goals, and tasks for this coaching, podcast, or research session.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                VStack(alignment: .trailing, spacing: 6) {
                    Text(isSyncingContext ? "SYNCING" : syncStatus.uppercased())
                        .font(.caption2.bold())
                        .foregroundStyle(syncStatus == "Saved to Nest" || syncStatus == "Loaded from Nest" ? .green : .orange)
                        .padding(.horizontal, 8)
                        .padding(.vertical, 4)
                        .background((syncStatus == "Saved to Nest" || syncStatus == "Loaded from Nest" ? Color.green : Color.orange).opacity(0.14), in: Capsule())
                    HStack(spacing: 6) {
                        Button {
                            Task { await loadNestContext() }
                        } label: {
                            Label("Load Nest", systemImage: "arrow.down.doc")
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.mini)
                        .disabled(isSyncingContext)

                        Button {
                            Task { await saveNestContext() }
                        } label: {
                            Label("Save Nest", systemImage: "arrow.up.doc")
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.mini)
                        .disabled(isSyncingContext)
                    }
                }
            }

            if let remoteConflictDraft {
                VStack(alignment: .leading, spacing: 8) {
                    Label("Nest changed elsewhere", systemImage: "arrow.triangle.branch")
                        .font(.caption.bold())
                        .foregroundStyle(.orange)
                    Text(conflictMessage ?? "Your phone draft is still saved on this device. Compare it with the latest Nest revision before choosing.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("PHONE DRAFT")
                            .font(.caption2.bold())
                            .foregroundStyle(.teal)
                        Text(draft.contextConflictSummary)
                            .font(.caption2)
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                    VStack(alignment: .leading, spacing: 4) {
                        Text("LATEST NEST")
                            .font(.caption2.bold())
                            .foregroundStyle(.orange)
                        Text(remoteConflictDraft.contextConflictSummary)
                            .font(.caption2)
                    }
                    .padding(8)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 10, style: .continuous))

                    HStack(spacing: 8) {
                        Button("Use Nest version") {
                            draft = remoteConflictDraft
                            draft.persist(sessionID: session.id)
                            self.remoteConflictDraft = nil
                            conflictMessage = nil
                            syncStatus = "Loaded from Nest"
                        }
                        .buttonStyle(.bordered)
                        .controlSize(.small)
                        .accessibilityIdentifier("UseNestContextVersion")

                        Button("Keep phone draft") {
                            draft.rebaseRevision(onto: remoteConflictDraft)
                            draft.persist(sessionID: session.id)
                            self.remoteConflictDraft = nil
                            conflictMessage = nil
                            syncStatus = "Phone draft ready to resave"
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.small)
                        .accessibilityIdentifier("KeepPhoneContextVersion")
                    }

                    Text("Keeping the phone draft only rebases it onto the latest revision. Tap Save Nest again to make the overwrite explicit.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .padding(10)
                .background(Color.orange.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.orange.opacity(0.3), lineWidth: 1)
                }
                .accessibilityIdentifier("SessionContextConflictCard")
            }

            VStack(alignment: .leading, spacing: 6) {
                Text("Quick note")
                    .font(.caption.bold())
                TextEditor(text: Binding(
                    get: { draft.note },
                    set: {
                        draft.note = $0
                        persist()
                    }
                ))
                .frame(minHeight: 82)
                .padding(8)
                .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay {
                    RoundedRectangle(cornerRadius: 12, style: .continuous)
                        .stroke(Color.secondary.opacity(0.18), lineWidth: 1)
                }
            }

            CaptureChecklistEditor(
                title: "Goals",
                systemImage: "target",
                placeholder: "What should this session help with?",
                items: Binding(
                    get: { draft.goals },
                    set: {
                        draft.goals = $0
                        persist()
                    }
                )
            )

            CaptureChecklistEditor(
                title: "Tasks",
                systemImage: "checklist",
                placeholder: "Follow-up, question, or next action",
                items: Binding(
                    get: { draft.tasks },
                    set: {
                        draft.tasks = $0
                        persist()
                    }
                )
            )

            HStack(spacing: 8) {
                Label("Saved on this device", systemImage: "iphone.gen3")
                    .font(.caption2)
                    .foregroundStyle(.teal)
                Spacer()
                Text(draft.updatedAtDisplay)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }

            Text("Phone-local drafts are recovery-friendly. Nest sync makes notes, goals, and tasks visible to the shared room, packet, and review workflow.")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(10)
        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
        .accessibilityIdentifier("CaptureSessionContextPanel")
        .onAppear { loadIfNeeded(force: true) }
        .onChange(of: session.id) { _, _ in loadIfNeeded(force: true) }
    }

    private func loadIfNeeded(force: Bool = false) {
        guard force || loadedSessionID != session.id else { return }
        draft = CaptureSessionContextDraft.load(sessionID: session.id)
        loadedSessionID = session.id
        syncStatus = "Loaded local draft"
        remoteConflictDraft = nil
        conflictMessage = nil
    }

    private func persist() {
        var next = draft
        next.touch()
        draft = next
        draft.persist(sessionID: session.id)
        syncStatus = "Local changes not synced"
    }

    private func loadNestContext() async {
        guard !isSyncingContext else { return }
        isSyncingContext = true
        defer { isSyncingContext = false }

        if let remoteDraft = await sessionClient.loadSessionContext(for: session) {
            if hasUnsyncedPhoneContext, remoteDraft != draft {
                remoteConflictDraft = remoteDraft
                conflictMessage = "Nest loaded a different revision. Your unsynced phone draft stayed on this device."
                syncStatus = "Phone draft kept — review Nest"
                return
            }
            draft = remoteDraft
            draft.persist(sessionID: session.id)
            remoteConflictDraft = nil
            conflictMessage = nil
            syncStatus = "Loaded from Nest"
        } else {
            syncStatus = sessionClient.errorMessage ?? "Nest load needs attention"
        }
    }

    private func saveNestContext() async {
        guard !isSyncingContext else { return }
        isSyncingContext = true
        defer { isSyncingContext = false }

        switch await sessionClient.saveSessionContext(for: session, draft: draft) {
        case .saved(let serverDraft):
            draft = serverDraft
            draft.persist(sessionID: session.id)
            remoteConflictDraft = nil
            conflictMessage = nil
            syncStatus = "Saved to Nest"
        case .conflict(let remote, _, let message):
            // Keep the exact phone draft in place. The remote copy lives beside
            // it until the user explicitly chooses a revision.
            draft.persist(sessionID: session.id)
            remoteConflictDraft = remote
            conflictMessage = message
            syncStatus = "Phone draft kept — review conflict"
        case .failed(let message):
            draft.persist(sessionID: session.id)
            syncStatus = message
        }
    }

    private var hasUnsyncedPhoneContext: Bool {
        syncStatus == "Local changes not synced"
            || syncStatus == "Phone draft ready to resave"
            || remoteConflictDraft != nil
    }
}

struct CaptureChecklistEditor: View {
    let title: String
    let systemImage: String
    let placeholder: String
    @Binding var items: [String]

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Label(title, systemImage: systemImage)
                    .font(.caption.bold())
                Spacer()
                Button {
                    items.append("")
                } label: {
                    Label("Add", systemImage: "plus")
                }
                .buttonStyle(.bordered)
                .controlSize(.mini)
            }

            ForEach(Array(items.indices), id: \.self) { index in
                HStack(spacing: 8) {
                    TextField(placeholder, text: Binding(
                        get: {
                            guard items.indices.contains(index) else { return "" }
                            return items[index]
                        },
                        set: { value in
                            guard items.indices.contains(index) else { return }
                            items[index] = value
                        }
                    ))
                    .textFieldStyle(.roundedBorder)

                    Button(role: .destructive) {
                        guard items.indices.contains(index) else { return }
                        items.remove(at: index)
                        if items.isEmpty {
                            items = [""]
                        }
                    } label: {
                        Image(systemName: "minus.circle")
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(.secondary)
                    .accessibilityLabel("Remove \(title.lowercased()) item")
                }
            }
        }
    }
}

struct CaptureSessionContextDraft: Codable, Equatable {
    var note: String = ""
    var goals: [String] = [""]
    var tasks: [String] = [""]
    var updatedAt: Date = Date()
    var revisionId: String?
    var entries: MobileCaptureSessionContextEntries?

    var updatedAtDisplay: String {
        updatedAt.formatted(date: .omitted, time: .shortened)
    }

    var contextConflictSummary: String {
        let cleanNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let notePreview = cleanNote.isEmpty ? "No quick note" : String(cleanNote.prefix(140))
        let goalCount = goals.lazy.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.count
        let taskCount = tasks.lazy.map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.filter { !$0.isEmpty }.count
        return "\(notePreview) · \(goalCount) goal\(goalCount == 1 ? "" : "s") · \(taskCount) task\(taskCount == 1 ? "" : "s")"
    }

    mutating func touch() {
        updatedAt = Date()
        if goals.isEmpty { goals = [""] }
        if tasks.isEmpty { tasks = [""] }
        reconcileStructuredEntries()
    }

    mutating func rebaseRevision(onto remote: CaptureSessionContextDraft) {
        revisionId = remote.revisionId
        touch()
    }

    func persist(sessionID: String) {
        guard let data = try? JSONEncoder().encode(self) else { return }
        UserDefaults.standard.set(data, forKey: Self.storageKey(sessionID: sessionID))
    }

    static func load(sessionID: String) -> CaptureSessionContextDraft {
        guard let data = UserDefaults.standard.data(forKey: storageKey(sessionID: sessionID)),
              let draft = try? JSONDecoder().decode(CaptureSessionContextDraft.self, from: data)
        else {
            return CaptureSessionContextDraft()
        }
        return draft.normalized()
    }

    static func storageKey(sessionID: String) -> String {
        "quipsly.capture.session-context.\(sessionID)"
    }

    private func normalized() -> CaptureSessionContextDraft {
        var copy = self
        if copy.goals.isEmpty { copy.goals = [""] }
        if copy.tasks.isEmpty { copy.tasks = [""] }
        copy.reconcileStructuredEntries()
        return copy
    }

    private mutating func reconcileStructuredEntries() {
        guard var current = entries else { return }
        let now = ISO8601DateFormatter().string(from: updatedAt)
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)

        if trimmedNote.isEmpty {
            current.note = nil
        } else if var existing = current.note {
            existing.kind = "quick-note"
            existing.text = trimmedNote
            existing.position = 0
            existing.updatedAt = now
            current.note = existing
        } else {
            current.note = MobileCaptureSessionContextEntry(
                id: nil,
                kind: "quick-note",
                text: trimmedNote,
                position: 0,
                projectionId: nil,
                createdAt: now,
                updatedAt: now,
                source: "ios-capture"
            )
        }

        current.goals = Self.reconcileList(
            goals,
            kind: "goal",
            current: current.goals,
            now: now
        )
        current.tasks = Self.reconcileList(
            tasks,
            kind: "task",
            current: current.tasks,
            now: now
        )
        entries = current
    }

    private static func reconcileList(
        _ values: [String],
        kind: String,
        current: [MobileCaptureSessionContextEntry],
        now: String
    ) -> [MobileCaptureSessionContextEntry] {
        let desired = values
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        var used = Set<Int>()

        return desired.enumerated().map { position, text in
            var match = current.indices.first {
                !used.contains($0) && current[$0].text == text
            }
            if match == nil, current.indices.contains(position), !used.contains(position) {
                match = position
            }

            if let match {
                used.insert(match)
                var entry = current[match]
                entry.kind = kind
                entry.text = text
                entry.position = position
                entry.updatedAt = now
                return entry
            }

            return MobileCaptureSessionContextEntry(
                id: nil,
                kind: kind,
                text: text,
                position: position,
                projectionId: nil,
                createdAt: now,
                updatedAt: now,
                source: "ios-capture"
            )
        }
    }
}


private func mobileFollowUpTime(_ value: TimeInterval) -> String {
    let total = max(0, Int(value.rounded(.down)))
    let hours = total / 3_600
    let minutes = (total % 3_600) / 60
    let seconds = total % 60
    return hours > 0
        ? String(format: "%02d:%02d:%02d", hours, minutes, seconds)
        : String(format: "%02d:%02d", minutes, seconds)
}

private struct MobileClientFollowUpSnapshot: View {
    let followUp: MobileCaptureClientFollowUp
    let session: MobileCaptureSession
    let previewOnly: Bool
    var showsOpenStatus = true

    private func nonempty(_ value: String?) -> String? {
        let trimmed = value?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        return trimmed.isEmpty ? nil : trimmed
    }

    @ViewBuilder
    private func exactSourceLink(
        _ anchor: MobileCaptureTodayTranscriptSourceAnchor?,
        recordID: String,
        recordLabel: String
    ) -> some View {
        if let anchor, anchor.roomId == session.callRoomId {
            NavigationLink {
                CaptureTranscriptReviewView(
                    roomID: anchor.roomId,
                    sessionTitle: session.displayTitle,
                    recording: nil,
                    previewOnly: previewOnly,
                    focusSegmentID: anchor.segmentId,
                    canUseProjectTeamNotes: session.canUseProjectTeamNotes == true
                )
            } label: {
                Label(
                    "Exact source · \(mobileFollowUpTime(anchor.startSeconds))–\(mobileFollowUpTime(anchor.endSeconds))",
                    systemImage: "play.fill"
                )
                .frame(minHeight: 44)
            }
            .buttonStyle(.bordered)
            .controlSize(.small)
            .accessibilityIdentifier("CaptureClientFollowUpSource_\(recordID)")
            .accessibilityLabel("Return to exact source for \(recordLabel) at \(mobileFollowUpTime(anchor.startSeconds))")
            .accessibilityHint("Opens the exact transcript segment and permitted Session playback without changing the released snapshot or starting playback.")
        }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(spacing: 8) {
                StatusChip(
                    label: followUp.status == "DRAFT" ? "private draft" : "released in Quipsly",
                    tint: followUp.status == "DRAFT" ? .orange : .green
                )
                StatusChip(label: "revision \(followUp.revision)", tint: .green)
                if showsOpenStatus, followUp.status == "RELEASED" {
                    StatusChip(
                        label: followUp.openedAt == nil ? "open not confirmed" : "open confirmed",
                        tint: followUp.openedAt == nil ? .orange : .green
                    )
                }
            }
            .accessibilityIdentifier("CaptureClientFollowUpSnapshot_\(followUp.id)_r\(followUp.revision)")

            Text(followUp.title)
                .font(.headline)
                .fixedSize(horizontal: false, vertical: true)
            Text("For \(followUp.recipientLabel)")
                .font(.caption2)
                .foregroundStyle(.secondary)

            if let intro = nonempty(followUp.intro) {
                Text(intro)
                    .font(.caption)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if !followUp.notes.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Text("What we want to keep")
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                    ForEach(followUp.notes) { note in
                        VStack(alignment: .leading, spacing: 2) {
                            Text(nonempty(note.title) ?? "Session note")
                                .font(.caption.bold())
                            Text(note.body)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .fixedSize(horizontal: false, vertical: true)
                            exactSourceLink(
                                note.sourceAnchor,
                                recordID: "note_\(note.id)",
                                recordLabel: nonempty(note.title) ?? "Session note"
                            )
                        }
                        .padding(8)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(Color.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
                    }
                }
            }

            if !followUp.goals.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Goals", systemImage: "target")
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                    ForEach(followUp.goals) { goal in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "circle")
                                .font(.caption2)
                                .padding(.top, 2)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(goal.title)
                                    .font(.caption.bold())
                                Text(goal.status.replacingOccurrences(of: "_", with: " ").capitalized)
                                    .font(.caption2)
                                    .foregroundStyle(.secondary)
                                exactSourceLink(
                                    goal.sourceAnchor,
                                    recordID: "goal_\(goal.id)",
                                    recordLabel: goal.title
                                )
                            }
                        }
                    }
                }
            }

            if !followUp.tasks.isEmpty {
                VStack(alignment: .leading, spacing: 6) {
                    Label("Commitments", systemImage: "checklist")
                        .font(.caption2.bold())
                        .foregroundStyle(.secondary)
                    ForEach(followUp.tasks) { task in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: task.status == "DONE" ? "checkmark.circle.fill" : "circle")
                                .font(.caption)
                                .foregroundStyle(task.status == "DONE" ? .green : .secondary)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(task.title)
                                    .font(.caption.bold())
                                if let detail = nonempty(task.detail) {
                                    Text(detail)
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                }
                                exactSourceLink(
                                    task.sourceAnchor,
                                    recordID: "task_\(task.id)",
                                    recordLabel: task.title
                                )
                            }
                        }
                    }
                }
            }

            if let next = nonempty(followUp.nextSessionFocus) {
                VStack(alignment: .leading, spacing: 3) {
                    Text("Bring into the next Session")
                        .font(.caption2.bold())
                        .foregroundStyle(.purple)
                    Text(next)
                        .font(.caption)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(8)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(Color.purple.opacity(0.07), in: RoundedRectangle(cornerRadius: 10))
            }

            Text("SHA-256 \(followUp.contentSha256)")
                .font(.system(.caption2, design: .monospaced))
                .foregroundStyle(.secondary)
                .lineLimit(1)
        }
        .padding(10)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }
}

struct MobileClientFollowUpCard: View {
    let session: MobileCaptureSession
    @ObservedObject var sessionClient: CaptureSessionClient
    let previewOnly: Bool
    @State private var isExpanded = true
    @State private var isConfirmingOpen = false

    var body: some View {
        if let followUp = session.clientFollowUp {
            DisclosureGroup(isExpanded: $isExpanded) {
                VStack(alignment: .leading, spacing: 10) {
                    MobileClientFollowUpSnapshot(
                        followUp: followUp,
                        session: session,
                        previewOnly: previewOnly
                    )

                    if followUp.canAcknowledge {
                        Button {
                            isConfirmingOpen = true
                            Task {
                                _ = await sessionClient.acknowledgeClientFollowUp(for: session)
                                isConfirmingOpen = false
                            }
                        } label: {
                            Label(
                                followUp.openedAt != nil
                                    ? "Open confirmed"
                                    : isConfirmingOpen
                                        ? "Confirming"
                                        : "Confirm I opened this",
                                systemImage: followUp.openedAt != nil ? "checkmark.seal.fill" : "eye"
                            )
                        }
                        .buttonStyle(.borderedProminent)
                        .tint(.green)
                        .disabled(followUp.openedAt != nil || isConfirmingOpen)
                        .accessibilityIdentifier("CaptureClientFollowUpAcknowledge_\(followUp.id)")
                        .accessibilityHint("Records an in-app open receipt for this exact follow-up. It does not complete any task or goal.")
                    }

                    Text("This released snapshot contains only deliberately client-safe notes and client-owned goals or tasks. It is not an email, public post, calendar action, or proof that any commitment is complete.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 8)
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Client follow-up", systemImage: "person.crop.circle.badge.checkmark")
                        .font(.caption.bold())
                        .foregroundStyle(.green)
                    Text(followUp.title)
                        .font(.subheadline.bold())
                    Text("Released to \(followUp.recipientLabel) in Quipsly")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("CaptureClientFollowUp_\(followUp.id)")
            }
            .padding(10)
            .background(Color.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
        }
    }
}

struct MobileCoachClientFollowUpCard: View {
    private enum FocusedField: Hashable {
        case title
        case intro
        case nextSession
    }

    let session: MobileCaptureSession
    @ObservedObject var sessionClient: CaptureSessionClient
    let previewOnly: Bool
    @State private var isExpanded = true
    @State private var draft = MobileCaptureClientFollowUpDraft(
        title: "",
        intro: "",
        nextSessionFocus: "",
        noteIDs: [],
        goalIDs: [],
        taskIDs: []
    )
    @State private var loadedWorkspaceVersion = ""
    @State private var isSaving = false
    @State private var isReleasing = false
    @State private var releaseConfirmed = false
    @State private var notice: String?
    @FocusState private var focusedField: FocusedField?

    private var workspace: MobileCaptureClientFollowUpWorkspace? {
        session.clientFollowUpWorkspace
    }

    private var workspaceVersion: String {
        let output = workspace?.output
        let readiness = workspace?.readiness
        let changes = readiness?.changes.map(\.stableID).joined(separator: ",") ?? "none"
        return [session.id, output?.id ?? "none", String(output?.revision ?? 0), output?.status ?? "none", readiness?.status ?? "unchecked", changes].joined(separator: "|")
    }

    private var hasUnsavedDraftChanges: Bool {
        guard let output = workspace?.output, output.status == "DRAFT" else { return false }
        return !draft.matches(output)
    }

    private var sourcesReady: Bool {
        guard let output = workspace?.output, output.status == "DRAFT",
              let readiness = workspace?.readiness else { return false }
        return readiness.releaseAllowed && readiness.checkedRevision == output.revision
    }

    private var releaseReady: Bool {
        sourcesReady && !hasUnsavedDraftChanges
    }

    private func readinessDetail(_ change: MobileCaptureClientFollowUpReadinessChange) -> String {
        switch change.reason {
        case "CONTENT_CHANGED": return "changed after this draft was saved"
        case "NO_LONGER_ELIGIBLE": return "is no longer eligible for this client follow-up"
        case "SELECTION_MISMATCH": return "does not match the frozen source selection"
        case "SNAPSHOT_INVALID": return "failed its immutable snapshot check"
        default: return "failed its source-manifest check"
        }
    }

    private func selectionBinding(_ keyPath: WritableKeyPath<MobileCaptureClientFollowUpDraft, Set<String>>, id: String) -> Binding<Bool> {
        Binding(
            get: { draft[keyPath: keyPath].contains(id) },
            set: { selected in
                if selected { draft[keyPath: keyPath].insert(id) }
                else { draft[keyPath: keyPath].remove(id) }
                releaseConfirmed = false
            }
        )
    }

    private func selectionDetail(
        _ detail: String,
        source: MobileCaptureTodayTranscriptSourceAnchor?
    ) -> String {
        guard let source, source.roomId == session.callRoomId else { return detail }
        return "\(detail) · exact source \(mobileFollowUpTime(source.startSeconds))–\(mobileFollowUpTime(source.endSeconds)) will be included"
    }

    var body: some View {
        if let workspace, workspace.isCoach {
            DisclosureGroup(isExpanded: $isExpanded) {
                VStack(alignment: .leading, spacing: 12) {
                    if let notice {
                        Text(notice)
                            .font(.caption.bold())
                            .foregroundStyle(.teal)
                            .fixedSize(horizontal: false, vertical: true)
                            .padding(8)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 10))
                            .accessibilityIdentifier("CaptureCoachFollowUpNotice")
                    }

                    if let output = workspace.output {
                        VStack(alignment: .leading, spacing: 6) {
                            Text(output.status == "DRAFT" ? "Exact private server snapshot" : "Latest released server snapshot")
                                .font(.caption.bold())
                                .foregroundStyle(.secondary)
                            MobileClientFollowUpSnapshot(
                                followUp: output,
                                session: session,
                                previewOnly: previewOnly,
                                showsOpenStatus: false
                            )
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text(workspace.output?.status == "DRAFT" ? "Adjust private draft" : "Prepare a new private draft")
                            .font(.headline)

                        TextField("Follow-up title", text: $draft.title, axis: .vertical)
                            .textFieldStyle(.roundedBorder)
                            .focused($focusedField, equals: .title)
                            .accessibilityIdentifier("CaptureCoachFollowUpTitle")

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Opening note")
                                .font(.caption.bold())
                            TextEditor(text: $draft.intro)
                                .frame(minHeight: 72)
                                .padding(6)
                                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                                .focused($focusedField, equals: .intro)
                                .accessibilityIdentifier("CaptureCoachFollowUpIntro")
                        }

                        VStack(alignment: .leading, spacing: 4) {
                            Text("Bring into the next Session")
                                .font(.caption.bold())
                            TextEditor(text: $draft.nextSessionFocus)
                                .frame(minHeight: 64)
                                .padding(6)
                                .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 10))
                                .focused($focusedField, equals: .nextSession)
                                .accessibilityIdentifier("CaptureCoachFollowUpNextSession")
                        }
                    }

                    if let eligible = workspace.eligible {
                        MobileCoachFollowUpSelectionSection(
                            title: "Client-safe notes",
                            systemImage: "checkmark.shield",
                            rows: eligible.notes.map {
                                ($0.id, $0.title ?? "Session note", selectionDetail($0.body, source: $0.sourceAnchor))
                            },
                            selected: { selectionBinding(\.noteIDs, id: $0) }
                        )
                        MobileCoachFollowUpSelectionSection(
                            title: "Client-owned goals",
                            systemImage: "target",
                            rows: eligible.goals.map {
                                ($0.id, $0.title, selectionDetail($0.status.replacingOccurrences(of: "_", with: " ").capitalized, source: $0.sourceAnchor))
                            },
                            selected: { selectionBinding(\.goalIDs, id: $0) }
                        )
                        MobileCoachFollowUpSelectionSection(
                            title: "Client-owned commitments",
                            systemImage: "checklist",
                            rows: eligible.tasks.map {
                                ($0.id, $0.title, selectionDetail($0.detail ?? $0.status.replacingOccurrences(of: "_", with: " ").capitalized, source: $0.sourceAnchor))
                            },
                            selected: { selectionBinding(\.taskIDs, id: $0) }
                        )
                    }

                    Text("\(draft.selectedCount) canonical record\(draft.selectedCount == 1 ? "" : "s") selected. Private notes, Session-shared notes, project-team notes, and unreviewed transcript candidates remain ineligible.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Button {
                        isSaving = true
                        releaseConfirmed = false
                        Task {
                            let saved = await sessionClient.saveClientFollowUpDraft(for: session, draft: draft)
                            notice = saved
                                ? "Private draft saved to Nest. The client still cannot see it; inspect the exact revision before release."
                                : sessionClient.errorMessage
                            isSaving = false
                        }
                    } label: {
                        Label(
                            isSaving
                                ? "Saving private revision"
                                : workspace.output?.status == "DRAFT"
                                    ? "Save private draft changes"
                                    : "Create private draft",
                            systemImage: "doc.badge.gearshape"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
                    .disabled(previewOnly || isSaving || isReleasing || !draft.isValid || !AuthManager.shared.networkActionsAllowed)
                    .accessibilityIdentifier("CaptureCoachFollowUpSave")
                    .accessibilityHint("Saves a new immutable private revision in Nest. It does not release or send the follow-up.")

                    if let output = workspace.output, output.status == "DRAFT" {
                        VStack(alignment: .leading, spacing: 8) {
                            if sourcesReady && !hasUnsavedDraftChanges {
                                VStack(alignment: .leading, spacing: 3) {
                                    Label("Current sources verified", systemImage: "checkmark.shield.fill")
                                        .font(.caption.bold())
                                        .foregroundStyle(.green)
                                    Text("All \(workspace.readiness?.selectedCount ?? 0) selected canonical records still match private revision \(output.revision). Release remains a separate confirmation.")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .accessibilityIdentifier("CaptureCoachFollowUpReleaseReady")
                            } else if sourcesReady {
                                VStack(alignment: .leading, spacing: 3) {
                                    Label("Save edits before release", systemImage: "square.and.arrow.down")
                                        .font(.caption.bold())
                                    Text("The release controls still point to private revision \(output.revision), not the unsaved editor values. Save a new private revision or restore the editor to this exact snapshot before confirming.")
                                        .font(.caption2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .foregroundStyle(.orange)
                                .accessibilityIdentifier("CaptureCoachFollowUpUnsavedChanges")
                            } else {
                                VStack(alignment: .leading, spacing: 5) {
                                    Label("Release held — review current sources", systemImage: "exclamationmark.shield.fill")
                                        .font(.caption.bold())
                                        .foregroundStyle(.red)
                                        .accessibilityIdentifier("CaptureCoachFollowUpReleaseHeldTitle")
                                    if let changes = workspace.readiness?.changes, !changes.isEmpty {
                                        ForEach(changes, id: \.stableID) { change in
                                            Text("\(change.kind.capitalized) · \(change.label) \(readinessDetail(change)).")
                                                .font(.caption2.bold())
                                                .fixedSize(horizontal: false, vertical: true)
                                                .accessibilityIdentifier("CaptureCoachFollowUpReleaseHeldChange")
                                        }
                                    } else {
                                        Text("Quipsly could not verify this draft against current canonical records.")
                                            .font(.caption2.bold())
                                    }
                                    Text("Review the current selections, then save private draft changes. Nothing has been released.")
                                        .font(.caption2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .foregroundStyle(.red)
                            }

                            Toggle(
                                "I reviewed revision \(output.revision) for \(output.recipientLabel). Release this exact snapshot inside Quipsly only.",
                                isOn: $releaseConfirmed
                            )
                            .font(.caption.bold())
                            .disabled(!releaseReady)
                            .accessibilityIdentifier("CaptureCoachFollowUpReleaseConfirmation")

                            Button {
                                isReleasing = true
                                Task {
                                    let released = await sessionClient.releaseClientFollowUp(for: session)
                                    notice = released
                                        ? "Released inside the client's private Quipsly Session. No email, message, calendar event, or publication occurred."
                                        : sessionClient.errorMessage
                                    releaseConfirmed = false
                                    isReleasing = false
                                }
                            } label: {
                                Label(isReleasing ? "Releasing in Quipsly" : "Release to client in Quipsly", systemImage: "paperplane")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.green)
                            .disabled(previewOnly || !releaseReady || !releaseConfirmed || isSaving || isReleasing || !AuthManager.shared.networkActionsAllowed)
                            .accessibilityIdentifier("CaptureCoachFollowUpRelease")
                        }
                        .padding(10)
                        .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    }

                    Text("This iPhone surface uses the canonical Nest draft and revision history. It never emails, texts, publishes, schedules, bills, changes consent, or rewrites a source note, goal, or task.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 8)
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Client follow-up review", systemImage: "person.crop.circle.badge.checkmark")
                        .font(.caption.bold())
                        .foregroundStyle(.teal)
                    Text(workspace.output?.status == "DRAFT" ? "Private revision \(workspace.output?.revision ?? 1)" : "Prepare for \(workspace.room.client.label)")
                        .font(.subheadline.bold())
                    Text("Assigned coach · canonical Nest state")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("CaptureCoachClientFollowUp")
            }
            .padding(10)
            .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .task(id: workspaceVersion) {
                guard loadedWorkspaceVersion != workspaceVersion else { return }
                draft = MobileCaptureClientFollowUpDraft.make(from: workspace)
                loadedWorkspaceVersion = workspaceVersion
                releaseConfirmed = false
            }
            .onChange(of: draft) { _, _ in
                releaseConfirmed = false
            }
            .toolbar {
                ToolbarItemGroup(placement: .keyboard) {
                    Spacer()
                    Button("Done") { focusedField = nil }
                        .accessibilityIdentifier("CaptureCoachFollowUpKeyboardDone")
                }
            }
        }
    }
}

private struct MobileCoachFollowUpSelectionSection: View {
    let title: String
    let systemImage: String
    let rows: [(id: String, title: String, detail: String)]
    let selected: (String) -> Binding<Bool>

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            Label(title, systemImage: systemImage)
                .font(.caption.bold())
            if rows.isEmpty {
                Text("No eligible records")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(rows, id: \.id) { row in
                    Toggle(isOn: selected(row.id)) {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(row.title)
                                .font(.caption.bold())
                            Text(row.detail)
                                .font(.caption2)
                                .foregroundStyle(.secondary)
                                .lineLimit(3)
                        }
                    }
                    .toggleStyle(.switch)
                    .accessibilityIdentifier("CaptureCoachFollowUpSelection_\(row.id)")
                }
            }
        }
        .padding(10)
        .background(Color(.secondarySystemBackground), in: RoundedRectangle(cornerRadius: 12))
    }
}

struct StatusChip: View {
    let label: String
    let tint: Color

    var body: some View {
        Text(label)
            .font(.caption2.bold())
            .foregroundStyle(tint)
            .padding(.horizontal, 8)
            .padding(.vertical, 4)
            .background(tint.opacity(0.14), in: Capsule())
    }
}
