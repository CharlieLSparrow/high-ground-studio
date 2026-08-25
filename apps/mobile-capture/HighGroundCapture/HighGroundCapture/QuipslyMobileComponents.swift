import Foundation
import SwiftUI
import UIKit

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

private func mobileClientFollowUpExportFileName(
    _ followUp: MobileCaptureClientFollowUp
) -> String {
    let normalized = followUp.title
        .applyingTransform(.stripDiacritics, reverse: false)?
        .lowercased() ?? followUp.title.lowercased()
    let parts = normalized.components(separatedBy: CharacterSet.alphanumerics.inverted)
        .filter { !$0.isEmpty }
    let slug = String(parts.joined(separator: "-").prefix(80))
    return "\(slug.isEmpty ? "quipsly-coaching-follow-up" : slug)-r\(followUp.revision).md"
}

private func mobileClientFollowUpSpeakerEvidence(
    _ anchor: MobileCaptureTodayTranscriptSourceAnchor
) -> String {
    let label: String? = switch anchor.speakerAuthority {
    case "correction": "Name reviewed"
    case "attribution": "Speaker reviewed"
    case "source-binding": "Participant recording"
    case "provider": "Automatic speaker label"
    case "unresolved": "Speaker needs review"
    default: nil
    }
    return label.map { " · Speaker evidence: \($0)" } ?? ""
}

private func mobileClientFollowUpSourceLine(
    _ anchor: MobileCaptureTodayTranscriptSourceAnchor
) -> String {
    "Source: \(mobileFollowUpTime(anchor.startSeconds))-\(mobileFollowUpTime(anchor.endSeconds))\(mobileClientFollowUpSpeakerEvidence(anchor))"
}

private func mobileClientFollowUpMarkdown(
    _ followUp: MobileCaptureClientFollowUp
) -> String {
    let clean: (String?) -> String = {
        ($0 ?? "")
            .replacingOccurrences(of: "\r\n", with: "\n")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }
    var lines = [
        "# \(clean(followUp.title))",
        "",
        "For: \(clean(followUp.recipientLabel))",
        "Revision: \(followUp.revision)",
        "Status: \(followUp.status)",
        "Content SHA-256: \(followUp.contentSha256)",
    ]
    if let releasedAt = followUp.releasedAt, !clean(releasedAt).isEmpty {
        lines.append("Released: \(clean(releasedAt))")
    }
    if !clean(followUp.intro).isEmpty {
        lines.append(contentsOf: ["", clean(followUp.intro)])
    }
    if !followUp.notes.isEmpty {
        lines.append(contentsOf: ["", "## Notes"])
        for note in followUp.notes {
            lines.append(contentsOf: [
                "",
                "### \(clean(note.title).isEmpty ? "Session note" : clean(note.title))",
                "",
                clean(note.body),
            ])
            if let source = note.sourceAnchor {
                lines.append(mobileClientFollowUpSourceLine(source))
            }
        }
    }
    if !followUp.goals.isEmpty {
        lines.append(contentsOf: ["", "## Goals"])
        for goal in followUp.goals {
            let target = clean(goal.targetAt).isEmpty ? "" : " (target \(clean(goal.targetAt)))"
            lines.append(contentsOf: [
                "",
                "- [\(goal.status == "ACHIEVED" ? "x" : " ")] \(clean(goal.title))\(target)",
            ])
            if !clean(goal.description).isEmpty {
                lines.append("  \(clean(goal.description))")
            }
            if let source = goal.sourceAnchor {
                lines.append("  \(mobileClientFollowUpSourceLine(source))")
            }
        }
    }
    if !followUp.tasks.isEmpty {
        lines.append(contentsOf: ["", "## Commitments"])
        for task in followUp.tasks {
            let due = clean(task.dueAt).isEmpty ? "" : " (due \(clean(task.dueAt)))"
            lines.append(contentsOf: [
                "",
                "- [\(task.status == "DONE" ? "x" : " ")] \(clean(task.title))\(due)",
            ])
            if !clean(task.detail).isEmpty {
                lines.append("  \(clean(task.detail))")
            }
            if let source = task.sourceAnchor {
                lines.append("  \(mobileClientFollowUpSourceLine(source))")
            }
        }
    }
    if !clean(followUp.nextSessionFocus).isEmpty {
        lines.append(contentsOf: [
            "",
            "## Bring into the next session",
            "",
            clean(followUp.nextSessionFocus),
        ])
    }
    lines.append(contentsOf: [
        "",
        "---",
        "Prepared from a reviewed Quipsly client-safe snapshot. Private notes and unreviewed transcript candidates are excluded.",
        "",
    ])
    return lines.joined(separator: "\n")
}

private func prepareMobileClientFollowUpFile(
    _ followUp: MobileCaptureClientFollowUp
) throws -> URL {
    guard followUp.contentSha256.range(
        of: "^[a-f0-9]{64}$",
        options: .regularExpression
    ) != nil else {
        throw NSError(
            domain: "QuipslyClientFollowUpExport",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: "The client-safe snapshot is missing its exact content identity."]
        )
    }
    let directory = FileManager.default.temporaryDirectory.appendingPathComponent(
        "quipsly-client-follow-up-\(UUID().uuidString.lowercased())",
        isDirectory: true
    )
    try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: true,
        attributes: [.protectionKey: FileProtectionType.complete]
    )
    let url = directory.appendingPathComponent(mobileClientFollowUpExportFileName(followUp))
    try Data(mobileClientFollowUpMarkdown(followUp).utf8).write(
        to: url,
        options: [.atomic, .completeFileProtection]
    )
    return url
}

private struct MobileClientFollowUpShareSheet: UIViewControllerRepresentable {
    let fileURL: URL
    let title: String
    let completion: (Bool, Error?) -> Void

    func makeUIViewController(context: Context) -> UIActivityViewController {
        let controller = UIActivityViewController(
            activityItems: [title, fileURL],
            applicationActivities: nil
        )
        controller.completionWithItemsHandler = { _, completed, _, error in
            completion(completed, error)
        }
        return controller
    }

    func updateUIViewController(_ uiViewController: UIActivityViewController, context: Context) {}
}

private struct MobileClientFollowUpExportControl: View {
    let followUp: MobileCaptureClientFollowUp
    let session: MobileCaptureSession
    @ObservedObject var sessionClient: CaptureSessionClient
    let previewOnly: Bool

    @State private var fileURL: URL?
    @State private var fileError: String?
    @State private var isPresentingShare = false
    @State private var notice: String?
    @State private var isSavingReceipt = false

    private var identity: String {
        "\(followUp.id)|\(followUp.revision)|\(followUp.contentSha256)"
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            if let fileURL {
                Button {
                    isPresentingShare = true
                } label: {
                    Label("Share follow-up file", systemImage: "square.and.arrow.up")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .disabled(isSavingReceipt)
                .accessibilityIdentifier("CaptureClientFollowUpShareFile_\(followUp.id)")
                .accessibilityHint("Opens the standard iPhone share sheet for this exact client-safe revision. Quipsly does not choose or claim a recipient.")
                .sheet(isPresented: $isPresentingShare) {
                    MobileClientFollowUpShareSheet(
                        fileURL: fileURL,
                        title: "Quipsly coaching follow-up for \(followUp.recipientLabel)"
                    ) { completed, error in
                        isPresentingShare = false
                        if let error {
                            notice = "The system share sheet could not finish: \(error.localizedDescription)"
                        } else if !completed {
                            notice = "Sharing canceled. The follow-up and its source records are unchanged."
                        } else if previewOnly {
                            notice = "The preview file left the share sheet. No Nest receipt was written."
                        } else {
                            isSavingReceipt = true
                            Task {
                                let saved = await sessionClient.recordClientFollowUpExport(
                                    for: session,
                                    output: followUp
                                )
                                notice = saved
                                    ? "The system share finished. Quipsly recorded the exact revision, but does not claim who received it."
                                    : sessionClient.errorMessage
                                isSavingReceipt = false
                            }
                        }
                    }
                }
            } else if let fileError {
                Button {
                    prepareFile()
                } label: {
                    Label("Try preparing file again", systemImage: "arrow.clockwise")
                        .frame(maxWidth: .infinity, minHeight: 44)
                }
                .buttonStyle(.bordered)
                .accessibilityIdentifier("CaptureClientFollowUpExportRetry_\(followUp.id)")
                Text(fileError)
                    .font(.caption2)
                    .foregroundStyle(.orange)
                    .fixedSize(horizontal: false, vertical: true)
            } else {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Preparing exact follow-up file")
                        .font(.caption.bold())
                }
                .frame(minHeight: 44)
                .accessibilityElement(children: .combine)
                .accessibilityIdentifier("CaptureClientFollowUpExportPreparing_\(followUp.id)")
            }

            if let notice {
                Text(notice)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("CaptureClientFollowUpExportNotice_\(followUp.id)")
            }
        }
        .task(id: identity) {
            prepareFile()
        }
        .onDisappear {
            removePreparedFile()
        }
    }

    private func prepareFile() {
        removePreparedFile()
        fileError = nil
        do {
            fileURL = try prepareMobileClientFollowUpFile(followUp)
        } catch {
            fileError = error.localizedDescription
        }
    }

    private func removePreparedFile() {
        guard let fileURL else { return }
        try? FileManager.default.removeItem(at: fileURL.deletingLastPathComponent())
        self.fileURL = nil
    }
}

private struct MobileClientFollowUpSnapshot: View {
    let followUp: MobileCaptureClientFollowUp
    let session: MobileCaptureSession
    let previewOnly: Bool
    @State private var showsDetails = false

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
            CaptureTranscriptSpeakerEvidenceBadge(
                authority: anchor.speakerAuthority,
                identifier: "CaptureClientFollowUpSpeakerEvidence_\(recordID)"
            )
            NavigationLink {
                CaptureTranscriptReviewView(
                    roomID: anchor.roomId,
                    sessionTitle: session.displayTitle,
                    recording: nil,
                    previewOnly: previewOnly,
                    focusSegmentID: anchor.segmentId,
                    canUseProjectTeamNotes: session.canUseProjectTeamNotes == true,
                    returnLabel: "Client follow-up"
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
                    label: followUp.status == "DRAFT" ? "Draft" : "Shared",
                    tint: followUp.status == "DRAFT" ? .orange : .green,
                    accessibilityIdentifier: "CaptureClientFollowUpSnapshot_\(followUp.id)_r\(followUp.revision)"
                )
                if followUp.status == "RELEASED" {
                    StatusChip(
                        label: followUp.openedAt == nil ? "New" : "Viewed",
                        tint: followUp.openedAt == nil ? .orange : .green,
                        accessibilityIdentifier: "CaptureClientFollowUpOpenState_\(followUp.id)"
                    )
                }
            }

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
                    Label("Tasks", systemImage: "checklist")
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

            DisclosureGroup(isExpanded: $showsDetails) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("Revision \(followUp.revision)")
                    Text("SHA-256 \(followUp.contentSha256)")
                        .font(.system(.caption2, design: .monospaced))
                        .lineLimit(1)
                    Text("The links above return to the original notes, tasks, goals, and transcript evidence.")
                }
                .font(.caption2)
                .foregroundStyle(.secondary)
                .padding(.top, 6)
            } label: {
                Text("Details")
                    .font(.subheadline.weight(.semibold))
                    .accessibilityIdentifier("CaptureClientFollowUpDetails_\(followUp.id)")
            }
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

    var body: some View {
        if let followUp = session.clientFollowUp {
            DisclosureGroup(isExpanded: $isExpanded) {
                VStack(alignment: .leading, spacing: 10) {
                    MobileClientFollowUpSnapshot(
                        followUp: followUp,
                        session: session,
                        previewOnly: previewOnly
                    )
                    MobileClientFollowUpExportControl(
                        followUp: followUp,
                        session: session,
                        sessionClient: sessionClient,
                        previewOnly: previewOnly
                    )

                    Text("Shared only with you and your coach.")
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
            .task(id: "\(followUp.id)|\(followUp.openedAt ?? "new")") {
                guard !previewOnly,
                      followUp.canAcknowledge,
                      followUp.openedAt == nil,
                      AuthManager.shared.networkActionsAllowed else { return }
                _ = await sessionClient.acknowledgeClientFollowUp(for: session)
            }
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
    @State private var isReviewing = false
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

    private func dismissKeyboard() {
        focusedField = nil
        UIApplication.shared.sendAction(
            #selector(UIResponder.resignFirstResponder),
            to: nil,
            from: nil,
            for: nil
        )
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
            Button {
                isReviewing = true
            } label: {
                VStack(alignment: .leading, spacing: 3) {
                    Label("Follow-up for \(workspace.room.client.label)", systemImage: "person.crop.circle.badge.checkmark")
                        .font(.caption.bold())
                        .foregroundStyle(.teal)
                    Text(workspace.output?.status == "DRAFT" ? "Draft ready" : "Create a follow-up")
                        .font(.subheadline.bold())
                    HStack {
                        Text("Notes, tasks, goals, and next steps")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                        Spacer()
                        Image(systemName: "chevron.right")
                            .font(.caption.bold())
                            .foregroundStyle(.secondary)
                    }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityIdentifier("CaptureCoachClientFollowUp")
            .accessibilityHint("Opens the private follow-up review workspace without releasing or sending anything.")
            .padding(10)
            .background(Color.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .sheet(isPresented: $isReviewing) {
                NavigationStack {
                    ScrollView {
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
                            Text(output.status == "DRAFT" ? "Saved draft" : "Shared follow-up")
                                .font(.caption.bold())
                                .foregroundStyle(.secondary)
                            MobileClientFollowUpSnapshot(
                                followUp: output,
                                session: session,
                                previewOnly: previewOnly
                            )
                            MobileClientFollowUpExportControl(
                                followUp: output,
                                session: session,
                                sessionClient: sessionClient,
                                previewOnly: previewOnly
                            )
                        }
                    }

                    VStack(alignment: .leading, spacing: 8) {
                        Text(workspace.output?.status == "DRAFT" ? "Adjust private draft" : "Prepare a new private draft")
                            .font(.headline)

                        TextField("Follow-up title", text: $draft.title)
                            .textFieldStyle(.roundedBorder)
                            .submitLabel(.done)
                            .onSubmit { dismissKeyboard() }
                            .focused($focusedField, equals: .title)
                            .accessibilityIdentifier("CaptureCoachFollowUpTitle")

                        TextField("Opening note", text: $draft.intro, axis: .vertical)
                            .lineLimit(3...8)
                            .textFieldStyle(.roundedBorder)
                            .submitLabel(.done)
                            .focused($focusedField, equals: .intro)
                            .accessibilityIdentifier("CaptureCoachFollowUpIntro")

                        TextField("Bring into the next Session", text: $draft.nextSessionFocus, axis: .vertical)
                            .lineLimit(3...6)
                            .textFieldStyle(.roundedBorder)
                            .submitLabel(.done)
                            .focused($focusedField, equals: .nextSession)
                            .accessibilityIdentifier("CaptureCoachFollowUpNextSession")
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
                            title: "Client tasks",
                            systemImage: "checklist",
                            rows: eligible.tasks.map {
                                ($0.id, $0.title, selectionDetail($0.detail ?? $0.status.replacingOccurrences(of: "_", with: " ").capitalized, source: $0.sourceAnchor))
                            },
                            selected: { selectionBinding(\.taskIDs, id: $0) }
                        )
                    }

                    Text("\(draft.selectedCount) item\(draft.selectedCount == 1 ? "" : "s") selected. Only notes and work meant for this client can be shared.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Button {
                        isSaving = true
                        Task {
                            let saved = await sessionClient.saveClientFollowUpDraft(for: session, draft: draft)
                            notice = saved
                                ? "Draft saved. Only you can see it until you share."
                                : sessionClient.errorMessage
                            isSaving = false
                        }
                    } label: {
                        Label(
                            isSaving
                                ? "Saving draft"
                                : workspace.output?.status == "DRAFT"
                                    ? "Save draft"
                                    : "Create draft",
                            systemImage: "doc.badge.gearshape"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
                    .disabled(previewOnly || isSaving || isReleasing || !draft.isValid || !AuthManager.shared.networkActionsAllowed)
                    .accessibilityIdentifier("CaptureCoachFollowUpSave")
                    .accessibilityHint("Saves this private draft without sharing it with the client.")

                    if let output = workspace.output, output.status == "DRAFT" {
                        VStack(alignment: .leading, spacing: 8) {
                            if sourcesReady && !hasUnsavedDraftChanges {
                                VStack(alignment: .leading, spacing: 3) {
                                    Label("Ready to share", systemImage: "checkmark.shield.fill")
                                        .font(.caption.bold())
                                        .foregroundStyle(.green)
                                    Text("The selected notes, tasks, and goals have not changed since this draft was saved.")
                                        .font(.caption2)
                                        .foregroundStyle(.secondary)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .accessibilityIdentifier("CaptureCoachFollowUpReleaseReady")
                            } else if sourcesReady {
                                VStack(alignment: .leading, spacing: 3) {
                                    Label("Save edits before release", systemImage: "square.and.arrow.down")
                                        .font(.caption.bold())
                                    Text("Save your latest changes before sharing this follow-up.")
                                        .font(.caption2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .foregroundStyle(.orange)
                                .accessibilityIdentifier("CaptureCoachFollowUpUnsavedChanges")
                            } else {
                                VStack(alignment: .leading, spacing: 5) {
                                    Label("Review updates before sharing", systemImage: "exclamationmark.shield.fill")
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
                                        Text("Quipsly could not verify this draft against the current notes, tasks, and goals.")
                                            .font(.caption2.bold())
                                    }
                                    Text("Review the current selections and save the draft before sharing.")
                                        .font(.caption2)
                                        .fixedSize(horizontal: false, vertical: true)
                                }
                                .foregroundStyle(.red)
                            }

                            Button {
                                isReleasing = true
                                Task {
                                    let released = await sessionClient.releaseClientFollowUp(for: session)
                                    notice = released
                                        ? "Shared with \(output.recipientLabel)."
                                        : sessionClient.errorMessage
                                    isReleasing = false
                                }
                            } label: {
                                Label(isReleasing ? "Sharing" : "Share with \(output.recipientLabel)", systemImage: "paperplane")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .tint(.green)
                            .disabled(previewOnly || !releaseReady || isSaving || isReleasing || !AuthManager.shared.networkActionsAllowed)
                            .accessibilityIdentifier("CaptureCoachFollowUpRelease")
                        }
                        .padding(10)
                        .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
                    }

                    Text("Sharing puts this follow-up in \(workspace.room.client.label)'s Quipsly Session. It does not send an email or message.")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityIdentifier("CaptureCoachFollowUpDeliveryBoundary")
                        }
                        .padding(16)
                    }
                    .accessibilityIdentifier("CaptureCoachFollowUpReviewView")
                    .navigationTitle("Client follow-up")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Done") { isReviewing = false }
                                .accessibilityIdentifier("CaptureCoachFollowUpDone")
                        }
                        ToolbarItemGroup(placement: .keyboard) {
                            Spacer()
                            Button("Done") { dismissKeyboard() }
                                .accessibilityIdentifier("CaptureCoachFollowUpKeyboardDone")
                        }
                    }
                }
                .task(id: workspaceVersion) {
                    guard loadedWorkspaceVersion != workspaceVersion else { return }
                    draft = MobileCaptureClientFollowUpDraft.make(from: workspace)
                    loadedWorkspaceVersion = workspaceVersion
                }
            }
        }
    }
}

struct MobileClientFollowUpLoadingCard: View {
    let state: MobileCaptureClientFollowUpLoadState
    let retry: () -> Void

    var body: some View {
        switch state {
        case .idle, .loading:
            HStack(spacing: 10) {
                ProgressView()
                    .controlSize(.small)
                VStack(alignment: .leading, spacing: 2) {
                    Text("Checking follow-up")
                        .font(.subheadline.bold())
                    Text("Looking for notes, tasks, goals, and next steps")
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
            }
            .padding(10)
            .background(Color.teal.opacity(0.06), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityElement(children: .combine)
            .accessibilityIdentifier("CaptureClientFollowUpLoading")
        case .failed:
            Button(action: retry) {
                HStack(spacing: 10) {
                    Image(systemName: "arrow.clockwise.circle")
                        .foregroundStyle(.teal)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Follow-up couldn't load")
                            .font(.subheadline.bold())
                        Text("Tap to try again. Your Session and recording controls are still available.")
                            .font(.caption2)
                            .foregroundStyle(.secondary)
                    }
                    Spacer(minLength: 0)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .padding(10)
            .background(Color.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .accessibilityIdentifier("CaptureClientFollowUpRetry")
            .accessibilityHint("Retries the private follow-up check without changing the Session.")
        case .loaded, .unavailable:
            EmptyView()
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
    var accessibilityIdentifier: String? = nil

    @ViewBuilder
    var body: some View {
        if let accessibilityIdentifier {
            content
                .accessibilityIdentifier(accessibilityIdentifier)
        } else {
            content
        }
    }

    private var content: some View {
        Text(label)
                .font(.caption2.bold())
                .foregroundStyle(tint)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(tint.opacity(0.14), in: Capsule())
    }
}
