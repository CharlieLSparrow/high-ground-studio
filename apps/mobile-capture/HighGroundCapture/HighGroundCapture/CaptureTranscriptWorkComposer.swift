import SwiftUI

/// A focused editor for unsent source-linked work. The parent owns persistence
/// and canonical commands; presenting another surface does not create new work.
struct CaptureTranscriptWorkComposer: View {
    let kind: CaptureTranscriptWorkKind
    @Binding var draft: CaptureTranscriptWorkDraft
    let sourceLabel: String
    let canUseProjectTeamNotes: Bool
    let isSaving: Bool
    let canSave: Bool
    let error: String?
    let onClose: () -> Void
    let onSave: () -> Void

    private var kindName: String { kind.rawValue.capitalized }
    private var isEmpty: Bool {
        (kind == .note ? draft.body : draft.title).trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }
    private var noteKind: Binding<MobileSessionNoteKind> {
        Binding(get: { MobileSessionNoteKind(rawValue: draft.noteKind) ?? .sessionNote },
            set: { draft.noteKind = $0.rawValue })
    }
    private var audience: Binding<MobileSessionNoteVisibility> {
        Binding(get: { MobileSessionNoteVisibility(rawValue: draft.visibility) ?? .authorPrivate },
            set: { draft.visibility = $0.rawValue })
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Title") {
                    TextField(kind == .note ? "Title (optional)" : "Title", text: $draft.title, axis: .vertical)
                        .lineLimit(1...4)
                        .accessibilityIdentifier("CaptureTranscript\(kindName)TitleField")
                }
                Section(kind == .note ? "Note" : kind == .task ? "Details" : "What progress looks like") {
                    TextField(kind == .note ? "Write your note" : "Optional", text: $draft.body, axis: .vertical)
                        .lineLimit(4...12)
                        .accessibilityIdentifier("CaptureTranscript\(kindName)BodyField")
                }
                if kind == .note {
                    Section {
                        Picker("Purpose", selection: noteKind) {
                            ForEach(MobileSessionNoteKind.allCases.filter { canUseProjectTeamNotes || $0 != .production }) {
                                Text($0.title).tag($0)
                            }
                        }
                        .accessibilityIdentifier("CaptureTranscriptNoteKindPicker")
                        Picker("Who can see it", selection: audience) {
                            ForEach(MobileSessionNoteVisibility.allCases.filter { canUseProjectTeamNotes || $0 != .projectTeam }) {
                                Text($0.title).tag($0)
                            }
                        }
                        .accessibilityIdentifier("CaptureTranscriptNoteVisibilityPicker")
                    } footer: {
                        Text(audience.wrappedValue.boundary)
                            .accessibilityIdentifier("CaptureTranscriptNoteAudienceBoundary")
                    }
                }
                Section {
                    Label(sourceLabel, systemImage: "waveform")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureTranscriptWorkDraftSource")
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        if kind != .note {
                            Text(kind == .task ? "Assigned to you, linked to this passage." : "Owned by you, linked to this passage.")
                                .accessibilityIdentifier(kind == .goal ? "CaptureTranscriptGoalBoundary" : "CaptureTranscriptTaskBoundary")
                        }
                        Text("Close keeps your draft on this device.")
                    }
                }
                if let error {
                    Section {
                        Text(error).foregroundStyle(.red)
                            .accessibilityIdentifier("CaptureTranscriptWorkDraftError")
                    }
                }
            }
            .disabled(isSaving)
            .captureFormSurface()
            .navigationTitle(kindName)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Close", action: onClose)
                        .disabled(isSaving)
                        .accessibilityIdentifier("CaptureTranscriptCancel\(kindName)Button")
                        .accessibilityHint("Keeps your draft for this passage.")
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(isSaving ? "Saving…" : "Save", action: onSave)
                        .disabled(isSaving || !canSave || isEmpty)
                        .accessibilityIdentifier("CaptureTranscriptCreate\(kindName)Button")
                }
            }
        }
        .interactiveDismissDisabled(isSaving)
        .presentationDetents([.large])
        .presentationDragIndicator(.visible)
        .accessibilityIdentifier("CaptureTranscriptWorkComposer")
    }
}
