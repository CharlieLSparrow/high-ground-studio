import SwiftUI

// The automation projection is deliberately separate from form answers. It is
// coach-only operational state: exact policy identity, Session eligibility,
// append-only overrides, and immutable assignment receipts.
struct MobileCoachingFormAutomationOverview: Codable, Equatable {
    struct Boundaries: Codable, Equatable {
        let relationshipScoped: Bool?
        let exactTemplateVersionReceipts: Bool?
        let exactlyOncePerPolicyEvent: Bool?
        let appendOnlyOverrides: Bool?
        let externalSideEffects: Bool
    }

    let schema: String
    let policies: [MobileCoachingFormAutomationPolicy]
    let boundaries: Boundaries
}

struct MobileCoachingFormAutomationPolicy: Codable, Equatable, Identifiable {
    struct PinnedVersion: Codable, Equatable {
        let id: String
        let revision: Int
    }

    struct Template: Codable, Equatable {
        let id: String
        let title: String
        let publishedRevision: Int
    }

    struct Relationship: Codable, Equatable {
        let id: String
        let title: String
        let client: MobileCoachingFormPerson?
    }

    struct Session: Codable, Equatable, Identifiable {
        struct Room: Codable, Equatable {
            let id: String
            let title: String
            let endedAt: String?
        }

        let id: String
        let status: String
        let scheduledStart: String
        let scheduledEnd: String
        let room: Room?
        let eligibleAt: String?
        let dueAt: String?
        let assignmentCreated: Bool
        let override: MobileCoachingFormAutomationOverride?
    }

    struct Receipt: Codable, Equatable, Identifiable {
        struct Assignment: Codable, Equatable {
            let id: String
            let status: String
        }

        struct Booking: Codable, Equatable {
            let id: String
            let scheduledStart: String
        }

        let id: String
        let trigger: String
        let eventAt: String
        let eligibleAt: String
        let dueAt: String
        let manualOverride: Bool
        let createdAt: String
        let assignment: Assignment
        let templateRevision: Int
        let booking: Booking
    }

    let id: String
    let status: String
    let trigger: String
    let versionMode: String
    let pinnedTemplateVersion: PinnedVersion?
    let releaseOffsetMinutes: Int
    let dueOffsetMinutes: Int
    let revision: Int
    let template: Template
    let relationship: Relationship
    let sessions: [Session]
    let receipts: [Receipt]

    var isActive: Bool { status == "ACTIVE" }
    var isBeforeSession: Bool { trigger == "BEFORE_SESSION" }
}

struct MobileCoachingFormAutomationOverride: Codable, Equatable, Identifiable {
    let id: String
    let action: String
    let reason: String?
    let revision: Int
    let createdAt: String
}

struct MobileCoachingFormAutomationDraft: Equatable {
    var policyID: String?
    var templateID: String
    var relationshipID: String
    var trigger: String
    var status: String
    var versionMode: String
    var pinnedTemplateVersionID: String?
    var releaseOffsetMinutes: Int
    var dueOffsetMinutes: Int

    static func fresh(
        templates: [MobileCoachingFormTemplate],
        relationships: [MobileCoachingFormRelationship]
    ) -> Self {
        .init(
            policyID: nil,
            templateID: templates.first?.id ?? "",
            relationshipID: relationships.first?.id ?? "",
            trigger: "BEFORE_SESSION",
            status: "ACTIVE",
            versionMode: "LATEST_PUBLISHED",
            pinnedTemplateVersionID: nil,
            releaseOffsetMinutes: -1_440,
            dueOffsetMinutes: 0
        )
    }

    init(policy: MobileCoachingFormAutomationPolicy) {
        policyID = policy.id
        templateID = policy.template.id
        relationshipID = policy.relationship.id
        trigger = policy.trigger
        status = policy.status
        versionMode = policy.versionMode
        pinnedTemplateVersionID = policy.pinnedTemplateVersion?.id
        releaseOffsetMinutes = policy.releaseOffsetMinutes
        dueOffsetMinutes = policy.dueOffsetMinutes
    }

    private init(
        policyID: String?,
        templateID: String,
        relationshipID: String,
        trigger: String,
        status: String,
        versionMode: String,
        pinnedTemplateVersionID: String?,
        releaseOffsetMinutes: Int,
        dueOffsetMinutes: Int
    ) {
        self.policyID = policyID
        self.templateID = templateID
        self.relationshipID = relationshipID
        self.trigger = trigger
        self.status = status
        self.versionMode = versionMode
        self.pinnedTemplateVersionID = pinnedTemplateVersionID
        self.releaseOffsetMinutes = releaseOffsetMinutes
        self.dueOffsetMinutes = dueOffsetMinutes
    }
}

struct MobileCoachingFormAutomationView: View {
    @ObservedObject var client: MobileCoachingFormsClient
    @State private var draft: MobileCoachingFormAutomationDraft?

    private var policies: [MobileCoachingFormAutomationPolicy] {
        client.workspace?.automation?.policies ?? []
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header
                if let draft {
                    policyEditor(draft)
                } else {
                    actions
                    if policies.isEmpty { emptyState }
                    ForEach(policies) { policyCard($0) }
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 80)
        }
        .background(CaptureCanvas())
        .navigationTitle("Form rhythm")
        .navigationBarTitleDisplayMode(.inline)
        .accessibilityIdentifier("CaptureCoachingFormAutomation")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text("AUTOMATIC RHYTHM")
                .font(.caption2.weight(.black))
                .tracking(1.1)
                .foregroundStyle(CapturePalette.accent)
            Text("Set it once. Stay in control.")
                .font(.largeTitle.weight(.black))
                .fixedSize(horizontal: false, vertical: true)
            Text("Place the right reflection before or after each Session. Every assignment keeps its exact form version and visible receipt.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 10)
    }

    private var actions: some View {
        HStack(spacing: 10) {
            Button {
                guard let workspace = client.workspace else { return }
                draft = .fresh(templates: workspace.templates, relationships: workspace.relationships)
            } label: {
                Label("Add rhythm", systemImage: "plus")
                    .frame(maxWidth: .infinity)
            }
            .captureProminentButton()
            .controlSize(.large)
            .disabled(client.isUsingProtectedCache || client.isAutomationBusy)
            .accessibilityIdentifier("CaptureCoachingAutomationAdd")

            Button {
                Task { _ = await client.reconcileAutomation() }
            } label: {
                Image(systemName: "arrow.triangle.2.circlepath")
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(.bordered)
            .disabled(policies.isEmpty || client.isAutomationBusy || client.isUsingProtectedCache || CaptureLaunchConfiguration.usesPreviewData)
            .accessibilityLabel("Check form schedule")
            .accessibilityIdentifier("CaptureCoachingAutomationReconcile")
        }
    }

    private var emptyState: some View {
        VStack(alignment: .leading, spacing: 7) {
            Label("Manual sending still works", systemImage: "hand.tap.fill")
                .font(.headline)
            Text("Add a rhythm only when a repeated before- or after-Session reflection will genuinely help.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(18)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
    }

    private func policyCard(_ policy: MobileCoachingFormAutomationPolicy) -> some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 5) {
                    Text(policy.isActive ? "ACTIVE" : "PAUSED")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(policy.isActive ? CapturePalette.success : .secondary)
                    Text(policy.template.title)
                        .font(.title3.weight(.black))
                        .accessibilityIdentifier("CaptureCoachingAutomationPolicy_\(policy.id)")
                    Text("\(policy.relationship.client?.name ?? policy.relationship.title) · \(timingLabel(policy))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 8)
                Menu {
                    Button("Edit rhythm") { draft = .init(policy: policy) }
                    Button(policy.isActive ? "Pause" : "Resume") {
                        Task { _ = await client.saveAutomationPolicy(.init(policy: policy), statusOverride: policy.isActive ? "PAUSED" : "ACTIVE") }
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .frame(width: 44, height: 44)
                }
                .accessibilityLabel("Manage \(policy.template.title)")
            }

            Text(policy.versionMode == "LATEST_PUBLISHED"
                 ? "Uses the latest published version for future assignments"
                 : "Keeps version \(policy.pinnedTemplateVersion?.revision ?? policy.template.publishedRevision)")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.secondary)

            if policy.sessions.isEmpty {
                Text("No confirmed or completed Sessions are waiting for this rhythm.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                DisclosureGroup("Sessions · manual control") {
                    VStack(spacing: 10) {
                        ForEach(policy.sessions) { session in
                            sessionRow(policy: policy, session: session)
                        }
                    }
                    .padding(.top, 10)
                }
                .font(.subheadline.weight(.bold))
            }

            if let receipt = policy.receipts.first {
                Label(
                    "Last receipt · version \(receipt.templateRevision) · \(receipt.manualOverride ? "sent manually" : "on schedule")",
                    systemImage: "checkmark.seal.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(CapturePalette.success)
            } else {
                Text("No forms sent yet")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(18)
        .background(.background, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .stroke(CapturePalette.accent.opacity(0.16), lineWidth: 1)
        }
    }

    private func sessionRow(
        policy: MobileCoachingFormAutomationPolicy,
        session: MobileCoachingFormAutomationPolicy.Session
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(coachingAutomationDate(session.scheduledStart))
                .font(.subheadline.weight(.bold))
            Text(sessionStatus(session))
                .font(.caption)
                .foregroundStyle(.secondary)
            if !session.assignmentCreated {
                HStack(spacing: 8) {
                    if session.override?.action == "SKIP" {
                        Button("Restore schedule") {
                            Task { _ = await client.saveAutomationOverride(policyID: policy.id, bookingID: session.id, action: "CLEAR") }
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureCoachingAutomationRestore_\(policy.id)_\(session.id)")
                    } else {
                        Button("Send now") {
                            Task { _ = await client.saveAutomationOverride(policyID: policy.id, bookingID: session.id, action: "SEND_NOW") }
                        }
                        .captureProminentButton()
                        .accessibilityIdentifier("CaptureCoachingAutomationSendNow_\(policy.id)_\(session.id)")
                        Button("Skip once") {
                            Task { _ = await client.saveAutomationOverride(policyID: policy.id, bookingID: session.id, action: "SKIP") }
                        }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureCoachingAutomationSkip_\(policy.id)_\(session.id)")
                    }
                }
                .controlSize(.large)
                .disabled(client.isAutomationBusy || client.isUsingProtectedCache || CaptureLaunchConfiguration.usesPreviewData)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func policyEditor(_ current: MobileCoachingFormAutomationDraft) -> some View {
        let binding = Binding(
            get: { draft ?? current },
            set: { draft = $0 }
        )
        return VStack(alignment: .leading, spacing: 16) {
            Text(current.policyID == nil ? "New rhythm" : "Edit rhythm")
                .font(.title2.weight(.black))
                .accessibilityIdentifier("CaptureCoachingAutomationEditor")

            Picker("Form", selection: binding.templateID) {
                ForEach(client.workspace?.templates ?? []) { template in
                    Text("\(template.title) · v\(template.publishedRevision)").tag(template.id)
                }
            }
            .disabled(current.policyID != nil)

            Picker("Client", selection: binding.relationshipID) {
                ForEach(client.workspace?.relationships ?? []) { relationship in
                    Text(relationship.client?.name ?? relationship.title).tag(relationship.id)
                }
            }
            .disabled(current.policyID != nil)

            Picker("When", selection: binding.trigger) {
                Text("Before every Session").tag("BEFORE_SESSION")
                Text("After every completed Session").tag("AFTER_SESSION")
            }
            .disabled(current.policyID != nil)
            .onChange(of: binding.wrappedValue.trigger) { _, trigger in
                draft?.releaseOffsetMinutes = trigger == "BEFORE_SESSION" ? -1_440 : 0
                draft?.dueOffsetMinutes = trigger == "BEFORE_SESSION" ? 0 : 2_880
            }

            Picker("Timing", selection: timingBinding(binding)) {
                if binding.wrappedValue.trigger == "BEFORE_SESSION" {
                    Text("1 day before").tag(-1_440)
                    Text("2 days before").tag(-2_880)
                    Text("3 days before").tag(-4_320)
                    Text("1 week before").tag(-10_080)
                    Text("At Session start").tag(0)
                } else {
                    Text("Due in 1 day").tag(1_440)
                    Text("Due in 2 days").tag(2_880)
                    Text("Due in 3 days").tag(4_320)
                    Text("Due in 1 week").tag(10_080)
                }
            }

            Toggle("Use the latest published version for future Sessions", isOn: Binding(
                get: { binding.wrappedValue.versionMode == "LATEST_PUBLISHED" },
                set: { binding.wrappedValue.versionMode = $0 ? "LATEST_PUBLISHED" : "PINNED_VERSION" }
            ))
            .font(.subheadline.weight(.bold))

            Text("Existing assignments never change. Latest only affects a future Session when its form is assigned.")
                .font(.caption)
                .foregroundStyle(.secondary)

            HStack {
                Button("Save rhythm") {
                    guard let value = draft else { return }
                    Task {
                        if await client.saveAutomationPolicy(value) { draft = nil }
                    }
                }
                .captureProminentButton()
                .disabled(client.isAutomationBusy || CaptureLaunchConfiguration.usesPreviewData)
                .accessibilityIdentifier("CaptureCoachingAutomationSave")
                Button("Cancel") { draft = nil }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("CaptureCoachingAutomationCancel")
            }
            .controlSize(.large)
        }
        .padding(18)
        .background(.background, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }

    private func timingBinding(
        _ draftBinding: Binding<MobileCoachingFormAutomationDraft>
    ) -> Binding<Int> {
        Binding(
            get: {
                draftBinding.wrappedValue.trigger == "BEFORE_SESSION"
                    ? draftBinding.wrappedValue.releaseOffsetMinutes
                    : draftBinding.wrappedValue.dueOffsetMinutes
            },
            set: { value in
                if draftBinding.wrappedValue.trigger == "BEFORE_SESSION" {
                    draftBinding.wrappedValue.releaseOffsetMinutes = value
                    draftBinding.wrappedValue.dueOffsetMinutes = 0
                } else {
                    draftBinding.wrappedValue.releaseOffsetMinutes = 0
                    draftBinding.wrappedValue.dueOffsetMinutes = value
                }
            }
        )
    }

    private func timingLabel(_ policy: MobileCoachingFormAutomationPolicy) -> String {
        if policy.isBeforeSession {
            if policy.releaseOffsetMinutes == 0 { return "at Session start" }
            return "\(abs(policy.releaseOffsetMinutes) / 1_440) day(s) before each Session"
        }
        return "after each completed Session · due in \(policy.dueOffsetMinutes / 1_440) day(s)"
    }

    private func sessionStatus(_ session: MobileCoachingFormAutomationPolicy.Session) -> String {
        if session.assignmentCreated { return "Assigned · receipt retained" }
        if session.override?.action == "SKIP" { return "Skipped by coach" }
        if let eligibleAt = session.eligibleAt { return "Scheduled \(coachingAutomationDate(eligibleAt))" }
        return "Waiting for Session completion"
    }
}

private func coachingAutomationDate(_ raw: String) -> String {
    let parser = ISO8601DateFormatter()
    guard let date = parser.date(from: raw) else { return raw }
    return date.formatted(date: .abbreviated, time: .shortened)
}

extension MobileCoachingFormAutomationOverview {
    static func preview(isCoach: Bool) -> Self {
        let start = Date().addingTimeInterval(86_400)
        let end = start.addingTimeInterval(3_600)
        let formatter = ISO8601DateFormatter()
        let policies: [MobileCoachingFormAutomationPolicy] = isCoach ? [
            .init(
                id: "preview-policy-before",
                status: "ACTIVE",
                trigger: "BEFORE_SESSION",
                versionMode: "LATEST_PUBLISHED",
                pinnedTemplateVersion: nil,
                releaseOffsetMinutes: -1_440,
                dueOffsetMinutes: 0,
                revision: 2,
                template: .init(id: "preview-form-template", title: "Before our Session", publishedRevision: 1),
                relationship: .init(
                    id: "preview-engagement",
                    title: "Coaching with Homer",
                    client: .init(id: "preview-client", name: "Homer", email: "homer@example.com")
                ),
                sessions: [
                    .init(
                        id: "preview-booking",
                        status: "CONFIRMED",
                        scheduledStart: formatter.string(from: start),
                        scheduledEnd: formatter.string(from: end),
                        room: .init(id: "preview-coaching-ready", title: "Next coaching Session", endedAt: nil),
                        eligibleAt: formatter.string(from: start.addingTimeInterval(-86_400)),
                        dueAt: formatter.string(from: start),
                        assignmentCreated: false,
                        override: nil
                    ),
                ],
                receipts: []
            ),
        ] : []
        return .init(
            schema: "quipsly-coaching-form-automation-v1",
            policies: policies,
            boundaries: .init(
                relationshipScoped: true,
                exactTemplateVersionReceipts: true,
                exactlyOncePerPolicyEvent: true,
                appendOnlyOverrides: true,
                externalSideEffects: false
            )
        )
    }
}
