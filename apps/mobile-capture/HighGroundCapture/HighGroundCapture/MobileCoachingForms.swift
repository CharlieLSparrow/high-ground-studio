import Combine
import CryptoKit
import Foundation
import SwiftUI

// MARK: - Canonical coaching-form projection

enum MobileCoachingFormAnswerValue: Codable, Equatable, Hashable {
    case text(String)
    case number(Double)
    case boolean(Bool)
    case choices([String])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let value = try? container.decode(Bool.self) {
            self = .boolean(value)
        } else if let value = try? container.decode(Double.self) {
            self = .number(value)
        } else if let value = try? container.decode(String.self) {
            self = .text(value)
        } else if let value = try? container.decode([String].self) {
            self = .choices(value)
        } else {
            throw DecodingError.typeMismatch(
                Self.self,
                DecodingError.Context(
                    codingPath: decoder.codingPath,
                    debugDescription: "A coaching answer must be text, a number, yes/no, or listed choices."
                )
            )
        }
    }

    func encode(to encoder: Encoder) throws {
        var container = encoder.singleValueContainer()
        switch self {
        case .text(let value): try container.encode(value)
        case .number(let value): try container.encode(value)
        case .boolean(let value): try container.encode(value)
        case .choices(let value): try container.encode(value)
        }
    }

    var textValue: String? {
        guard case .text(let value) = self else { return nil }
        return value
    }

    var numberValue: Double? {
        guard case .number(let value) = self else { return nil }
        return value
    }

    var booleanValue: Bool? {
        guard case .boolean(let value) = self else { return nil }
        return value
    }

    var choicesValue: [String]? {
        guard case .choices(let value) = self else { return nil }
        return value
    }
}

struct MobileCoachingFormField: Codable, Equatable, Identifiable {
    let id: String
    let type: String
    let label: String
    let help: String?
    let placeholder: String?
    let required: Bool
    let options: [String]?
    let minimum: Double?
    let maximum: Double?
    let maximumLength: Int?

    var supportedType: Bool {
        Self.supportedTypes.contains(type)
    }

    private static let supportedTypes = Set([
        "SHORT_TEXT", "LONG_TEXT", "NUMBER", "SCALE", "BOOLEAN",
        "SINGLE_SELECT", "MULTI_SELECT", "DATE",
    ])
}

struct MobileCoachingFormDefinition: Codable, Equatable {
    static let schemaVersion = "quipsly-coaching-form-definition-v1"

    let schema: String
    let key: String
    let title: String
    let description: String
    let purpose: String
    let submitLabel: String
    let fields: [MobileCoachingFormField]

    var isSupported: Bool {
        schema == Self.schemaVersion
            && !key.isEmpty
            && !title.isEmpty
            && !fields.isEmpty
            && fields.count <= 40
            && Set(fields.map(\.id)).count == fields.count
            && fields.allSatisfy(\.supportedType)
    }
}

struct MobileCoachingFormPerson: Codable, Equatable {
    let id: String
    let name: String
    let email: String?
}

struct MobileCoachingFormRelationship: Codable, Equatable, Identifiable {
    struct Session: Codable, Equatable, Identifiable {
        struct Room: Codable, Equatable {
            let id: String
            let title: String
        }

        let id: String
        let scheduledStart: String
        let room: Room?
    }

    let id: String
    let title: String
    let client: MobileCoachingFormPerson?
    let upcomingSessions: [Session]
}

struct MobileCoachingFormTemplate: Codable, Equatable, Identifiable {
    let id: String
    let title: String
    let description: String?
    let purpose: String
    let status: String
    let publishedRevision: Int
    let definition: MobileCoachingFormDefinition
    let assignmentCount: Int
    let updatedAt: String
}

struct MobileCoachingFormOutcomePromotion: Codable, Equatable, Identifiable {
    struct ReviewedPayload: Codable, Equatable {
        struct Owner: Codable, Equatable {
            let id: String
            let name: String
            let email: String?
        }

        let schema: String
        let title: String
        let body: String?
        let owner: Owner
        let visibility: String
        let targetAt: String?
        let coachInitiated: Bool
    }

    let id: String
    let kind: String
    let targetId: String
    let responseRevision: Int?
    let selectedFieldIds: [String]
    let sourceSha256: String
    let reviewedPayload: ReviewedPayload
    let createdAt: String
}

struct MobileCoachingFormAssignment: Codable, Equatable, Identifiable {
    struct Template: Codable, Equatable {
        let id: String
        let title: String
        let description: String?
        let purpose: String
        let revision: Int
        let definition: MobileCoachingFormDefinition
    }

    struct Engagement: Codable, Equatable {
        let id: String
        let title: String
    }

    struct Booking: Codable, Equatable {
        let id: String
        let scheduledStart: String
    }

    struct Room: Codable, Equatable {
        let id: String
        let title: String
    }

    struct Response: Codable, Equatable {
        let revision: Int
        let state: String
        let answers: [String: MobileCoachingFormAnswerValue]
        let submittedAt: String?
    }

    struct Boundaries: Codable, Equatable {
        let clientCanEditOwnResponse: Bool
        let coachCanReadSubmittedResponse: Bool
        let coachCanReadDraftResponse: Bool
        let coachInitiatedPromotion: Bool?
        let editableAfterCreation: Bool?
        let sourceReceiptVisible: Bool?
        let externalSideEffects: Bool
    }

    let id: String
    let requestId: String?
    let status: String
    let timing: String
    let dueAt: String?
    let startedAt: String?
    let submittedAt: String?
    let template: Template
    let engagement: Engagement
    let booking: Booking?
    let room: Room?
    let assignedBy: MobileCoachingFormPerson?
    let assignedTo: MobileCoachingFormPerson?
    let viewerRole: String
    let response: Response?
    let outcomePromotions: [MobileCoachingFormOutcomePromotion]?
    let idempotentReplay: Bool?
    let boundaries: Boundaries

    var isSubmitted: Bool { status == "SUBMITTED" }
    var isCanceled: Bool { status == "CANCELED" }
    var canClientEdit: Bool {
        viewerRole == "CLIENT"
            && boundaries.clientCanEditOwnResponse
            && !isCanceled
    }
    var coachCanRead: Bool {
        viewerRole == "COACH"
            && boundaries.coachCanReadSubmittedResponse
            && response?.state == "SUBMITTED"
    }
    var visibleOutcomePromotions: [MobileCoachingFormOutcomePromotion] {
        outcomePromotions ?? []
    }
    var canCoachPromoteOutcome: Bool {
        coachCanRead
            && boundaries.coachInitiatedPromotion == true
            && boundaries.editableAfterCreation == true
            && boundaries.sourceReceiptVisible == true
            && !boundaries.externalSideEffects
    }
}

struct MobileCoachingFormsWorkspace: Codable, Equatable {
    struct Actor: Codable, Equatable {
        let id: String
        let isCoach: Bool
    }

    struct Boundaries: Codable, Equatable {
        let exactCoachOrAssignedClientOnly: Bool
        let immutableTemplateVersion: Bool
        let draftAnswersRemainPrivate: Bool
        let noMessageReminderTaskOrGoalCreated: Bool
        let externalSideEffects: Bool
    }

    let schema: String
    let actor: Actor
    let relationships: [MobileCoachingFormRelationship]
    let templates: [MobileCoachingFormTemplate]
    let assignments: [MobileCoachingFormAssignment]
    let automation: MobileCoachingFormAutomationOverview?
    let boundaries: Boundaries

    var clientAssignments: [MobileCoachingFormAssignment] {
        assignments.filter { $0.viewerRole == "CLIENT" && !$0.isCanceled }
    }

    var coachAssignments: [MobileCoachingFormAssignment] {
        assignments.filter { $0.viewerRole == "COACH" && !$0.isCanceled }
    }

    var outstandingClientAssignments: [MobileCoachingFormAssignment] {
        clientAssignments.filter { !$0.isSubmitted }
    }

    var submittedCoachAssignments: [MobileCoachingFormAssignment] {
        coachAssignments.filter(\.coachCanRead)
    }
}

private struct MobileCoachingFormsGETEnvelope: Decodable {
    let ok: Bool
    let error: String?
    let result: MobileCoachingFormsWorkspace?
}

private struct MobileCoachingFormSaveEnvelope: Decodable {
    struct Result: Decodable {
        let assignment: MobileCoachingFormAssignment
        let savedRevision: Int
        let idempotentReplay: Bool
    }

    let ok: Bool
    let error: String?
    let result: Result?
}

private struct MobileCoachingFormAssignmentEnvelope: Decodable {
    let ok: Bool
    let error: String?
    let result: MobileCoachingFormAssignment?
}

private struct MobileCoachingFormResponseRequest: Encodable {
    let requestId: UUID
    let state: String
    let answers: [String: MobileCoachingFormAnswerValue]
}

private struct MobileCoachingFormAssignmentRequest: Encodable {
    let action = "ASSIGN_FORM"
    let requestId: UUID
    let templateId: String
    let engagementId: String
    let bookingId: String?
    let callRoomId: String?
    let timing: String
    let dueAt: String?
}

private struct MobileCoachingFormAutomationPolicyRequest: Encodable {
    let action = "SAVE_AUTOMATION_POLICY"
    let requestId: UUID
    let policyId: String?
    let templateId: String
    let engagementId: String
    let trigger: String
    let status: String
    let versionMode: String
    let pinnedTemplateVersionId: String?
    let releaseOffsetMinutes: Int
    let dueOffsetMinutes: Int
}

private struct MobileCoachingFormAutomationOverrideRequest: Encodable {
    let action = "SAVE_AUTOMATION_OVERRIDE"
    let requestId: UUID
    let policyId: String
    let bookingId: String
    let overrideAction: String
}

private struct MobileCoachingFormAutomationReconcileRequest: Encodable {
    let action = "RECONCILE_AUTOMATION"
}

private struct MobileCoachingFormAutomationPolicyEnvelope: Decodable {
    struct Result: Decodable {
        let policy: MobileCoachingFormAutomationPolicy
        let externalSideEffects: Bool
    }

    let ok: Bool
    let error: String?
    let result: Result?
}

private struct MobileCoachingFormAutomationOverrideEnvelope: Decodable {
    struct Result: Decodable {
        let override: MobileCoachingFormAutomationOverride
        let externalSideEffects: Bool
    }

    let ok: Bool
    let error: String?
    let result: Result?
}

private struct MobileCoachingFormAutomationReconcileEnvelope: Decodable {
    struct Result: Decodable {
        let created: Int
        let alreadyAssigned: Int
        let waitingForTime: Int
    }

    let ok: Bool
    let error: String?
    let result: Result?
}

private struct MobileCoachingFormOutcomeRequest: Encodable {
    let action = "PROMOTE_RESPONSE_OUTCOME"
    let requestId: UUID
    let assignmentId: String
    let responseRevision: Int
    let kind: String
    let selectedFieldIds: [String]
    let title: String
    let body: String
    let ownerUserId: String
    let visibility: String
    let targetAt: String?
}

private struct MobileCoachingFormOutcomeEnvelope: Decodable {
    struct Result: Decodable {
        struct Receipt: Decodable {
            let id: String
            let assignmentId: String
            let responseRevisionId: String
            let kind: String
            let targetId: String
            let selectedFieldIds: [String]
            let sourceSha256: String
        }

        let receipt: Receipt
        let idempotentReplay: Bool
        let externalSideEffects: Bool
    }

    let ok: Bool
    let error: String?
    let result: Result?
}

// MARK: - Protected recovery and authenticated client

struct MobileCoachingFormLocalDraft: Codable, Equatable {
    let assignmentID: String
    let templateRevision: Int
    var answers: [String: MobileCoachingFormAnswerValue]
    var savedAt: Date
    var pendingRequestID: UUID?
    var pendingFingerprint: String?
    var pendingState: String?
}

private struct MobileCoachingFormPendingSend: Codable, Equatable {
    let requestID: UUID
    let fingerprint: String
}

private struct MobileCoachingFormPendingAutomationMutation: Codable, Equatable {
    let requestID: UUID
    let fingerprint: String
}

private struct MobileCoachingFormPendingOutcomeMutation: Codable, Equatable {
    let requestID: UUID
    let fingerprint: String
}

private struct MobileCoachingFormsProtectedLedger: Codable {
    let schemaVersion: Int
    let ownerAccountID: String
    let ownerEmail: String
    var drafts: [String: MobileCoachingFormLocalDraft]
    var pendingSend: MobileCoachingFormPendingSend?
    var pendingAutomationMutations: [String: MobileCoachingFormPendingAutomationMutation]?
    var pendingOutcomeMutations: [String: MobileCoachingFormPendingOutcomeMutation]?
}

private struct MobileCoachingFormsProtectedWorkspace: Codable {
    let schemaVersion: Int
    let ownerAccountID: String
    let ownerEmail: String
    let savedAt: Date
    let workspace: MobileCoachingFormsWorkspace
}

@MainActor
final class MobileCoachingFormsClient: ObservableObject {
    @Published private(set) var workspace: MobileCoachingFormsWorkspace?
    @Published private(set) var localDrafts: [String: MobileCoachingFormLocalDraft] = [:]
    @Published private(set) var isLoading = false
    @Published private(set) var activeMutationAssignmentID: String?
    @Published private(set) var isSending = false
    @Published private(set) var isAutomationBusy = false
    @Published private(set) var activeOutcomeAssignmentID: String?
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var cachedAt: Date?
    @Published private(set) var statusMessage: String?
    @Published private(set) var errorMessage: String?

    private let baseURL: URL
    private var observedOwnerAccountID: String?
    private var observedOwnerEmail: String?
    private var pendingSend: MobileCoachingFormPendingSend?
    private var pendingAutomationMutations: [String: MobileCoachingFormPendingAutomationMutation] = [:]
    private var pendingOutcomeMutations: [String: MobileCoachingFormPendingOutcomeMutation] = [:]
    private var ledgerWriteTask: Task<Void, Never>?
    private var accountCancellable: AnyCancellable?

    init() {
        let rawBaseURL = normalizedNestBaseURL(
            Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
                ?? "https://nest.quipsly.com"
        )
        baseURL = URL(string: rawBaseURL) ?? URL(string: "https://nest.quipsly.com")!
        activateCurrentOwner()
        accountCancellable = NotificationCenter.default.publisher(
            for: .quipslyCaptureAccountIdentityDidChange
        ).sink { [weak self] _ in
            Task { @MainActor in self?.handleAccountIdentityChange() }
        }
    }

    deinit {
        ledgerWriteTask?.cancel()
    }

    var isCoach: Bool { workspace?.actor.isCoach == true }
    var outstandingCount: Int { workspace?.outstandingClientAssignments.count ?? 0 }
    var submittedForCoachCount: Int { workspace?.submittedCoachAssignments.count ?? 0 }

    func loadPreview(isCoach: Bool? = nil) {
        let coachPreview = isCoach
            ?? ProcessInfo.processInfo.arguments.contains("--capture-coaching-forms-coach-preview")
        let definition = Self.previewDefinition
        let sharedResponse = MobileCoachingFormAssignment.Response(
            revision: 1,
            state: "SUBMITTED",
            answers: [
                "what-matters": .text("Choose the next honest step instead of solving everything at once."),
                "confidence": .number(7),
                "support": .choices(["Accountability", "A clear plan"]),
            ],
            submittedAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-1_800))
        )
        let draftAssignment = Self.previewAssignment(
            id: "preview-form-draft",
            definition: definition,
            viewerRole: coachPreview ? "COACH" : "CLIENT",
            status: "IN_PROGRESS",
            response: coachPreview ? nil : .init(
                revision: 1,
                state: "DRAFT",
                answers: ["what-matters": .text("I want to make the decision smaller.")],
                submittedAt: nil
            )
        )
        let sharedAssignment = Self.previewAssignment(
            id: "preview-form-shared",
            definition: definition,
            viewerRole: coachPreview ? "COACH" : "CLIENT",
            status: "SUBMITTED",
            response: sharedResponse
        )
        workspace = MobileCoachingFormsWorkspace(
            schema: "quipsly-coaching-form-workflows-v1",
            actor: .init(id: coachPreview ? "preview-coach" : "preview-client", isCoach: coachPreview),
            relationships: [Self.previewRelationship],
            templates: [Self.previewTemplate],
            assignments: [draftAssignment, sharedAssignment],
            automation: .preview(isCoach: coachPreview),
            boundaries: Self.expectedBoundaries
        )
        if coachPreview {
            localDrafts = [:]
        } else if localDrafts[draftAssignment.id]?.templateRevision != draftAssignment.template.revision {
            localDrafts = [
                draftAssignment.id: MobileCoachingFormLocalDraft(
                    assignmentID: draftAssignment.id,
                    templateRevision: draftAssignment.template.revision,
                    answers: draftAssignment.response?.answers ?? [:],
                    savedAt: Date(),
                    pendingRequestID: nil,
                    pendingFingerprint: nil,
                    pendingState: nil
                ),
            ]
        }
        isUsingProtectedCache = false
        cachedAt = nil
        statusMessage = nil
        errorMessage = nil
    }

    func load() async {
        guard !isLoading else { return }
        activateCurrentOwner()
        guard AuthManager.shared.networkActionsAllowed else {
            useProtectedWorkspace(fallback: "Connect to Nest to open coaching forms.")
            return
        }
        isLoading = true
        statusMessage = nil
        errorMessage = nil
        defer { isLoading = false }
        do {
            var request = URLRequest(url: formsEndpoint)
            request.httpMethod = "GET"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.url?.host == baseURL.host else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(MobileCoachingFormsGETEnvelope.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  let loaded = payload.result else {
                throw Self.failure(payload.error ?? "Coaching forms are temporarily unavailable.")
            }
            try validate(loaded)
            workspace = loaded
            isUsingProtectedCache = false
            cachedAt = nil
            persistWorkspace(loaded)
            pruneDrafts(against: loaded)
        } catch {
            useProtectedWorkspace(fallback: error.localizedDescription)
        }
    }

    func answers(for assignment: MobileCoachingFormAssignment) -> [String: MobileCoachingFormAnswerValue] {
        guard !assignment.isSubmitted,
              let draft = localDrafts[assignment.id],
              draft.templateRevision == assignment.template.revision else {
            return assignment.response?.answers ?? [:]
        }
        return draft.answers
    }

    func updateLocalDraft(
        assignment: MobileCoachingFormAssignment,
        answers: [String: MobileCoachingFormAnswerValue]
    ) {
        guard assignment.canClientEdit, !assignment.isSubmitted else { return }
        let previous = localDrafts[assignment.id]
        localDrafts[assignment.id] = MobileCoachingFormLocalDraft(
            assignmentID: assignment.id,
            templateRevision: assignment.template.revision,
            answers: answers,
            savedAt: Date(),
            pendingRequestID: previous?.pendingRequestID,
            pendingFingerprint: previous?.pendingFingerprint,
            pendingState: previous?.pendingState
        )
        persistLedger()
    }

    func flushProtectedDrafts() {
        ledgerWriteTask?.cancel()
        ledgerWriteTask = nil
        writeLedger()
    }

    func missingRequiredFieldIDs(
        assignment: MobileCoachingFormAssignment,
        answers: [String: MobileCoachingFormAnswerValue]
    ) -> Set<String> {
        Set(assignment.template.definition.fields.compactMap { field in
            guard field.required else { return nil }
            return Self.answerIsMissing(answers[field.id]) ? field.id : nil
        })
    }

    @discardableResult
    func save(
        assignment: MobileCoachingFormAssignment,
        answers: [String: MobileCoachingFormAnswerValue],
        state: String
    ) async -> Bool {
        guard assignment.canClientEdit,
              ["DRAFT", "SUBMITTED"].contains(state),
              !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Connect to Nest to save. Your private answers are still on this iPhone."
            updateLocalDraft(assignment: assignment, answers: answers)
            return false
        }
        if state == "DRAFT", assignment.isSubmitted {
            errorMessage = "This form is already shared. Share corrections when you are ready."
            return false
        }
        if state == "SUBMITTED" {
            let missing = missingRequiredFieldIDs(assignment: assignment, answers: answers)
            guard missing.isEmpty else {
                errorMessage = "Answer the highlighted questions before sharing this form."
                return false
            }
        }
        guard let endpoint = responseEndpoint(for: assignment.id) else {
            errorMessage = "This form link is invalid. Refresh coaching forms."
            return false
        }

        let fingerprint = Self.fingerprint(
            assignmentID: assignment.id,
            state: state,
            answers: answers
        )
        var draft = localDrafts[assignment.id] ?? MobileCoachingFormLocalDraft(
            assignmentID: assignment.id,
            templateRevision: assignment.template.revision,
            answers: answers,
            savedAt: Date(),
            pendingRequestID: nil,
            pendingFingerprint: nil,
            pendingState: nil
        )
        let requestID: UUID
        if draft.pendingFingerprint == fingerprint,
           draft.pendingState == state,
           let retained = draft.pendingRequestID {
            requestID = retained
        } else {
            requestID = UUID()
        }
        draft.answers = answers
        draft.savedAt = Date()
        draft.pendingRequestID = requestID
        draft.pendingFingerprint = fingerprint
        draft.pendingState = state
        localDrafts[assignment.id] = draft
        flushProtectedDrafts()

        activeMutationAssignmentID = assignment.id
        errorMessage = nil
        statusMessage = nil
        defer { activeMutationAssignmentID = nil }
        do {
            var request = URLRequest(url: endpoint)
            request.httpMethod = "PUT"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try Self.makeEncoder().encode(
                MobileCoachingFormResponseRequest(
                    requestId: requestID,
                    state: state,
                    answers: answers
                )
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.url?.host == baseURL.host else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(MobileCoachingFormSaveEnvelope.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  let result = payload.result,
                  result.assignment.id == assignment.id else {
                throw Self.failure(payload.error ?? "Your answers could not be saved safely.")
            }
            replaceAssignment(result.assignment)
            if state == "SUBMITTED" {
                localDrafts.removeValue(forKey: assignment.id)
                statusMessage = assignment.isSubmitted
                    ? "Your updated answers are shared."
                    : "Your answers are shared with your coach."
            } else {
                localDrafts[assignment.id] = MobileCoachingFormLocalDraft(
                    assignmentID: assignment.id,
                    templateRevision: assignment.template.revision,
                    answers: result.assignment.response?.answers ?? answers,
                    savedAt: Date(),
                    pendingRequestID: nil,
                    pendingFingerprint: nil,
                    pendingState: nil
                )
                statusMessage = "Private draft saved."
            }
            flushProtectedDrafts()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func send(
        template: MobileCoachingFormTemplate,
        relationship: MobileCoachingFormRelationship,
        session: MobileCoachingFormRelationship.Session?,
        dueAt: Date?
    ) async -> Bool {
        guard workspace?.actor.isCoach == true,
              template.status == "PUBLISHED",
              !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Connect to Nest to send a form."
            return false
        }
        let timing = Self.assignmentTiming(template.purpose)
        let due = dueAt.map(Self.iso8601.string(from:))
        let fingerprint = [
            template.id, relationship.id, session?.id ?? "", session?.room?.id ?? "", timing, due ?? "",
        ].joined(separator: "\u{1f}")
        let requestID: UUID
        if pendingSend?.fingerprint == fingerprint {
            requestID = pendingSend?.requestID ?? UUID()
        } else {
            requestID = UUID()
            pendingSend = MobileCoachingFormPendingSend(requestID: requestID, fingerprint: fingerprint)
            flushProtectedDrafts()
        }

        isSending = true
        errorMessage = nil
        statusMessage = nil
        defer { isSending = false }
        do {
            var request = URLRequest(url: formsEndpoint)
            request.httpMethod = "POST"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try Self.makeEncoder().encode(
                MobileCoachingFormAssignmentRequest(
                    requestId: requestID,
                    templateId: template.id,
                    engagementId: relationship.id,
                    bookingId: session?.id,
                    callRoomId: session?.room?.id,
                    timing: timing,
                    dueAt: due
                )
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.url?.host == baseURL.host else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(MobileCoachingFormAssignmentEnvelope.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  let assignment = payload.result,
                  assignment.engagement.id == relationship.id,
                  assignment.template.id == template.id else {
                throw Self.failure(payload.error ?? "The form could not be sent safely.")
            }
            replaceAssignment(assignment)
            pendingSend = nil
            flushProtectedDrafts()
            statusMessage = "\(template.title) sent to \(relationship.client?.name ?? relationship.title)."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func saveAutomationPolicy(
        _ draft: MobileCoachingFormAutomationDraft,
        statusOverride: String? = nil
    ) async -> Bool {
        guard let current = workspace,
              current.actor.isCoach,
              !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed,
              let template = current.templates.first(where: { $0.id == draft.templateID }),
              let relationship = current.relationships.first(where: { $0.id == draft.relationshipID }) else {
            errorMessage = "Connect to Nest and choose one published form and client."
            return false
        }
        let status = statusOverride ?? draft.status
        guard ["ACTIVE", "PAUSED"].contains(status),
              ["BEFORE_SESSION", "AFTER_SESSION"].contains(draft.trigger),
              ["LATEST_PUBLISHED", "PINNED_VERSION"].contains(draft.versionMode),
              Self.validAutomationOffsets(
                trigger: draft.trigger,
                release: draft.releaseOffsetMinutes,
                due: draft.dueOffsetMinutes
              ) else {
            errorMessage = "Choose a conventional before- or after-Session timing."
            return false
        }
        if let policyID = draft.policyID {
            guard let policy = current.automation?.policies.first(where: { $0.id == policyID }),
                  policy.template.id == draft.templateID,
                  policy.relationship.id == draft.relationshipID,
                  policy.trigger == draft.trigger else {
                errorMessage = "This rhythm changed in Nest. Refresh before editing it."
                return false
            }
        }

        let identity = draft.policyID
            ?? [draft.templateID, draft.relationshipID, draft.trigger].joined(separator: ":")
        let operationKey = "policy:\(identity)"
        let fingerprint = [
            identity,
            status,
            draft.versionMode,
            draft.pinnedTemplateVersionID ?? "",
            String(draft.releaseOffsetMinutes),
            String(draft.dueOffsetMinutes),
        ].joined(separator: "\u{1f}")
        let requestID = automationRequestID(key: operationKey, fingerprint: fingerprint)

        isAutomationBusy = true
        errorMessage = nil
        statusMessage = nil
        defer { isAutomationBusy = false }
        do {
            var request = URLRequest(url: formsEndpoint)
            request.httpMethod = "POST"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try Self.makeEncoder().encode(
                MobileCoachingFormAutomationPolicyRequest(
                    requestId: requestID,
                    policyId: draft.policyID,
                    templateId: draft.templateID,
                    engagementId: draft.relationshipID,
                    trigger: draft.trigger,
                    status: status,
                    versionMode: draft.versionMode,
                    pinnedTemplateVersionId: draft.versionMode == "PINNED_VERSION"
                        ? draft.pinnedTemplateVersionID
                        : nil,
                    releaseOffsetMinutes: draft.releaseOffsetMinutes,
                    dueOffsetMinutes: draft.dueOffsetMinutes
                )
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.url?.host == baseURL.host else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(MobileCoachingFormAutomationPolicyEnvelope.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  let result = payload.result,
                  !result.externalSideEffects,
                  result.policy.template.id == template.id,
                  result.policy.relationship.id == relationship.id,
                  result.policy.trigger == draft.trigger else {
                throw Self.failure(payload.error ?? "The coaching rhythm could not be saved safely.")
            }
            replaceAutomationPolicy(result.policy)
            pendingAutomationMutations.removeValue(forKey: operationKey)
            flushProtectedDrafts()
            statusMessage = status == "PAUSED"
                ? "\(template.title) is paused."
                : "\(template.title) will follow this client’s Session rhythm."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func saveAutomationOverride(
        policyID: String,
        bookingID: String,
        action: String
    ) async -> Bool {
        guard let policy = workspace?.automation?.policies.first(where: { $0.id == policyID }),
              policy.sessions.contains(where: { $0.id == bookingID && !$0.assignmentCreated }),
              ["SEND_NOW", "SKIP", "CLEAR"].contains(action),
              workspace?.actor.isCoach == true,
              !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Refresh this Session before changing its form schedule."
            return false
        }
        let operationKey = "override:\(policyID):\(bookingID)"
        let requestID = automationRequestID(
            key: operationKey,
            fingerprint: [policyID, bookingID, action].joined(separator: "\u{1f}")
        )
        isAutomationBusy = true
        errorMessage = nil
        statusMessage = nil
        defer { isAutomationBusy = false }
        do {
            var request = URLRequest(url: formsEndpoint)
            request.httpMethod = "POST"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try Self.makeEncoder().encode(
                MobileCoachingFormAutomationOverrideRequest(
                    requestId: requestID,
                    policyId: policyID,
                    bookingId: bookingID,
                    overrideAction: action
                )
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.url?.host == baseURL.host else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(MobileCoachingFormAutomationOverrideEnvelope.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  let result = payload.result,
                  !result.externalSideEffects,
                  result.override.action == action else {
                throw Self.failure(payload.error ?? "That Session control could not be saved safely.")
            }
            pendingAutomationMutations.removeValue(forKey: operationKey)
            flushProtectedDrafts()
            await load()
            statusMessage = action == "SEND_NOW"
                ? "\(policy.template.title) was sent now."
                : action == "SKIP"
                    ? "This Session will skip \(policy.template.title)."
                    : "\(policy.template.title) is back on its ordinary schedule."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func reconcileAutomation() async -> Bool {
        guard workspace?.actor.isCoach == true,
              !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Connect to Nest to check the form schedule."
            return false
        }
        isAutomationBusy = true
        errorMessage = nil
        statusMessage = nil
        defer { isAutomationBusy = false }
        do {
            var request = URLRequest(url: formsEndpoint)
            request.httpMethod = "POST"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try Self.makeEncoder().encode(
                MobileCoachingFormAutomationReconcileRequest()
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.url?.host == baseURL.host else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(MobileCoachingFormAutomationReconcileEnvelope.self, from: data)
            guard response.statusCode < 400, payload.ok, let result = payload.result else {
                throw Self.failure(payload.error ?? "The form schedule could not be checked safely.")
            }
            await load()
            statusMessage = result.created == 0
                ? "All automatic forms are on schedule."
                : "\(result.created) due form\(result.created == 1 ? " was" : "s were") assigned."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func promoteOutcome(
        assignment: MobileCoachingFormAssignment,
        selectedFieldIDs: [String],
        kind: String,
        title: String,
        body: String,
        ownerUserID: String,
        visibility: String,
        targetAt: Date?
    ) async -> Bool {
        guard let current = workspace,
              current.actor.isCoach,
              let canonical = current.coachAssignments.first(where: { $0.id == assignment.id }),
              canonical.response?.revision == assignment.response?.revision,
              canonical.canCoachPromoteOutcome,
              !isUsingProtectedCache,
              AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Connect to Nest and refresh this shared response before creating follow-through."
            return false
        }
        let normalizedKind = kind.uppercased()
        let normalizedTitle = title.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedBody = body.trimmingCharacters(in: .whitespacesAndNewlines)
        let normalizedVisibility = visibility == "PRIVATE" ? "PRIVATE" : "SHARED"
        let availableFieldIDs = Set(
            canonical.template.definition.fields.compactMap { field in
                canonical.response?.answers[field.id] == nil ? nil : field.id
            }
        )
        let selected = canonical.template.definition.fields
            .map(\.id)
            .filter { selectedFieldIDs.contains($0) }
        guard ["NOTE", "TASK", "GOAL"].contains(normalizedKind),
              !normalizedTitle.isEmpty,
              normalizedTitle.count <= 500,
              normalizedBody.count <= 20_000,
              !selected.isEmpty,
              selected.count == Set(selectedFieldIDs).count,
              Set(selected).isSubset(of: availableFieldIDs),
              normalizedKind == "NOTE" || [canonical.assignedBy?.id, canonical.assignedTo?.id]
                .compactMap({ $0 })
                .contains(ownerUserID) else {
            errorMessage = "Review the selected answers, name, and owner before creating follow-through."
            return false
        }
        guard let responseRevision = canonical.response?.revision else { return false }
        let target = normalizedKind == "NOTE" ? nil : targetAt.map(Self.outcomeDateOnly.string(from:))
        struct Fingerprint: Encodable {
            let assignmentId: String
            let responseRevision: Int
            let kind: String
            let selectedFieldIds: [String]
            let title: String
            let body: String
            let ownerUserId: String
            let visibility: String
            let targetAt: String?
        }
        let intent = Fingerprint(
            assignmentId: canonical.id,
            responseRevision: responseRevision,
            kind: normalizedKind,
            selectedFieldIds: selected,
            title: normalizedTitle,
            body: normalizedBody,
            ownerUserId: normalizedKind == "NOTE" ? current.actor.id : ownerUserID,
            visibility: normalizedKind == "NOTE" ? normalizedVisibility : "SHARED",
            targetAt: target
        )
        let fingerprint = Self.fingerprint(intent)
        let operationKey = "outcome:\(canonical.id):\(responseRevision):\(normalizedKind)"
        let requestID: UUID
        if let pending = pendingOutcomeMutations[operationKey],
           pending.fingerprint == fingerprint {
            requestID = pending.requestID
        } else {
            requestID = UUID()
            pendingOutcomeMutations[operationKey] = MobileCoachingFormPendingOutcomeMutation(
                requestID: requestID,
                fingerprint: fingerprint
            )
            flushProtectedDrafts()
        }

        activeOutcomeAssignmentID = canonical.id
        errorMessage = nil
        statusMessage = nil
        defer { activeOutcomeAssignmentID = nil }
        do {
            var request = URLRequest(url: formsEndpoint)
            request.httpMethod = "POST"
            request.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try Self.makeEncoder().encode(
                MobileCoachingFormOutcomeRequest(
                    requestId: requestID,
                    assignmentId: intent.assignmentId,
                    responseRevision: intent.responseRevision,
                    kind: intent.kind,
                    selectedFieldIds: intent.selectedFieldIds,
                    title: intent.title,
                    body: intent.body,
                    ownerUserId: intent.ownerUserId,
                    visibility: intent.visibility,
                    targetAt: intent.targetAt
                )
            )
            let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
            guard response.url?.host == baseURL.host else { throw URLError(.badServerResponse) }
            let payload = try JSONDecoder().decode(MobileCoachingFormOutcomeEnvelope.self, from: data)
            guard response.statusCode < 400,
                  payload.ok,
                  let result = payload.result,
                  !result.externalSideEffects,
                  result.receipt.assignmentId == canonical.id,
                  result.receipt.kind == normalizedKind,
                  Set(result.receipt.selectedFieldIds) == Set(selected),
                  result.receipt.sourceSha256.range(
                    of: #"^[0-9a-f]{64}$"#,
                    options: .regularExpression
                  ) != nil else {
                throw Self.failure(payload.error ?? "The reviewed follow-through could not be verified.")
            }
            pendingOutcomeMutations.removeValue(forKey: operationKey)
            flushProtectedDrafts()
            await load()
            let label = normalizedKind == "NOTE" ? "Note" : normalizedKind == "TASK" ? "Task" : "Goal"
            statusMessage = "\(label) added to \(canonical.engagement.title)."
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func clearMessages() {
        statusMessage = nil
        errorMessage = nil
    }

    private var formsEndpoint: URL {
        baseURL
            .appendingPathComponent("api", isDirectory: true)
            .appendingPathComponent("coaching", isDirectory: true)
            .appendingPathComponent("forms", isDirectory: false)
    }

    private func responseEndpoint(for assignmentID: String) -> URL? {
        guard assignmentID.count <= 240,
              assignmentID.range(
                of: #"^[A-Za-z0-9][A-Za-z0-9_-]*$"#,
                options: .regularExpression
              ) != nil else { return nil }
        return formsEndpoint
            .appendingPathComponent(assignmentID, isDirectory: true)
            .appendingPathComponent("response", isDirectory: false)
    }

    private func validate(_ candidate: MobileCoachingFormsWorkspace) throws {
        guard candidate.schema == "quipsly-coaching-form-workflows-v1",
              Self.normalized(candidate.actor.id) != nil,
              candidate.boundaries.exactCoachOrAssignedClientOnly,
              candidate.boundaries.immutableTemplateVersion,
              candidate.boundaries.draftAnswersRemainPrivate,
              !candidate.boundaries.externalSideEffects,
              Self.validAutomationProjection(candidate.automation, isCoach: candidate.actor.isCoach),
              candidate.templates.allSatisfy({
                  !$0.id.isEmpty
                      && $0.status == "PUBLISHED"
                      && $0.definition.isSupported
              }),
              candidate.relationships.allSatisfy({
                  !$0.id.isEmpty
                      && !$0.title.isEmpty
                      && ($0.client.map { !$0.id.isEmpty } ?? true)
              }),
              candidate.assignments.allSatisfy({ assignment in
                  guard assignment.template.definition.isSupported,
                        !assignment.boundaries.coachCanReadDraftResponse,
                        !assignment.boundaries.externalSideEffects,
                        assignment.visibleOutcomePromotions.allSatisfy({ promotion in
                            ["NOTE", "TASK", "GOAL"].contains(promotion.kind)
                                && promotion.reviewedPayload.coachInitiated
                                && ["PRIVATE", "SHARED"].contains(promotion.reviewedPayload.visibility)
                                && promotion.sourceSha256.range(
                                    of: #"^[0-9a-f]{64}$"#,
                                    options: .regularExpression
                                ) != nil
                                && !promotion.selectedFieldIds.isEmpty
                                && Set(promotion.selectedFieldIds).isSubset(
                                    of: Set(assignment.template.definition.fields.map(\.id))
                                )
                                && (assignment.viewerRole != "CLIENT"
                                    || promotion.reviewedPayload.visibility == "SHARED")
                        }) else { return false }
                  if assignment.viewerRole == "CLIENT" {
                      return assignment.boundaries.clientCanEditOwnResponse
                  }
                  if assignment.viewerRole == "COACH" {
                      return assignment.response == nil
                          || (assignment.response?.state == "SUBMITTED"
                              && assignment.boundaries.coachCanReadSubmittedResponse)
                  }
                  return false
              }) else {
            throw Self.failure("Nest returned a coaching-form boundary Capture cannot trust.")
        }
    }

    private func replaceAutomationPolicy(_ policy: MobileCoachingFormAutomationPolicy) {
        guard let current = workspace,
              var automation = current.automation else { return }
        var policies = automation.policies
        if let index = policies.firstIndex(where: { $0.id == policy.id }) {
            policies[index] = policy
        } else {
            policies.insert(policy, at: 0)
        }
        automation = MobileCoachingFormAutomationOverview(
            schema: automation.schema,
            policies: policies,
            boundaries: automation.boundaries
        )
        let updated = MobileCoachingFormsWorkspace(
            schema: current.schema,
            actor: current.actor,
            relationships: current.relationships,
            templates: current.templates,
            assignments: current.assignments,
            automation: automation,
            boundaries: current.boundaries
        )
        workspace = updated
        if !CaptureLaunchConfiguration.usesPreviewData { persistWorkspace(updated) }
    }

    private func automationRequestID(key: String, fingerprint: String) -> UUID {
        if let pending = pendingAutomationMutations[key],
           pending.fingerprint == fingerprint {
            return pending.requestID
        }
        let requestID = UUID()
        pendingAutomationMutations[key] = MobileCoachingFormPendingAutomationMutation(
            requestID: requestID,
            fingerprint: fingerprint
        )
        flushProtectedDrafts()
        return requestID
    }

    private func replaceAssignment(_ assignment: MobileCoachingFormAssignment) {
        guard let current = workspace else { return }
        var assignments = current.assignments
        if let index = assignments.firstIndex(where: { $0.id == assignment.id }) {
            assignments[index] = assignment
        } else {
            assignments.insert(assignment, at: 0)
        }
        let updated = MobileCoachingFormsWorkspace(
            schema: current.schema,
            actor: current.actor,
            relationships: current.relationships,
            templates: current.templates,
            assignments: assignments,
            automation: current.automation,
            boundaries: current.boundaries
        )
        workspace = updated
        if !CaptureLaunchConfiguration.usesPreviewData { persistWorkspace(updated) }
    }

    private func pruneDrafts(against workspace: MobileCoachingFormsWorkspace) {
        let editable = Dictionary(
            uniqueKeysWithValues: workspace.clientAssignments.map { ($0.id, $0) }
        )
        localDrafts = localDrafts.filter { assignmentID, draft in
            guard let assignment = editable[assignmentID],
                  assignment.template.revision == draft.templateRevision,
                  !assignment.isSubmitted else { return false }
            return true
        }
        persistLedger()
    }

    private func activateCurrentOwner() {
        let ownerID = Self.normalized(AuthManager.currentStoredOwnerID())
        let ownerEmail = Self.normalized(AuthManager.shared.userEmail)
            ?? Self.normalized(CaptureLaunchConfiguration.shareExtensionUITestOwner)
        guard ownerID != observedOwnerAccountID || ownerEmail != observedOwnerEmail else { return }
        observedOwnerAccountID = ownerID
        observedOwnerEmail = ownerEmail
        localDrafts = [:]
        pendingSend = nil
        pendingAutomationMutations = [:]
        pendingOutcomeMutations = [:]
        restoreLedger()
    }

    private func handleAccountIdentityChange() {
        flushProtectedDrafts()
        workspace = nil
        isUsingProtectedCache = false
        cachedAt = nil
        statusMessage = nil
        errorMessage = nil
        observedOwnerAccountID = nil
        observedOwnerEmail = nil
        activateCurrentOwner()
        // Preview flights deliberately have no live Quipsly identity. Several
        // app-owned stores publish an identity-change notification while the
        // deterministic shell is settling, so rebuild the fixture instead of
        // turning a valid coach surface into "Forms unavailable."
        if CaptureLaunchConfiguration.usesPreviewData {
            let configuredRole = ProcessInfo.processInfo.environment[
                "CAPTURE_COACHING_PREVIEW_ROLE"
            ]?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
            loadPreview(
                isCoach: configuredRole != "client"
                    && (configuredRole == "coach"
                        || !ProcessInfo.processInfo.arguments.contains(
                            "--capture-client-booking-preview"
                        ))
            )
        }
    }

    private func useProtectedWorkspace(fallback: String) {
        if restoreWorkspace() {
            isUsingProtectedCache = true
            errorMessage = "Showing a protected saved copy. Reconnect before saving or sharing."
        } else {
            workspace = nil
            errorMessage = fallback
        }
    }

    private func restoreWorkspace() -> Bool {
        guard let ownerID = observedOwnerAccountID,
              let ownerEmail = observedOwnerEmail,
              let url = Self.workspaceURL(ownerID: ownerID),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe),
              let cache = try? Self.makeDecoder().decode(MobileCoachingFormsProtectedWorkspace.self, from: data),
              cache.schemaVersion == 1,
              cache.ownerAccountID == ownerID,
              cache.ownerEmail == ownerEmail,
              Date().timeIntervalSince(cache.savedAt) >= 0,
              Date().timeIntervalSince(cache.savedAt) <= 30 * 24 * 60 * 60,
              (try? validate(cache.workspace)) != nil else { return false }
        workspace = cache.workspace
        cachedAt = cache.savedAt
        return true
    }

    private func persistWorkspace(_ value: MobileCoachingFormsWorkspace) {
        guard let ownerID = observedOwnerAccountID,
              let ownerEmail = observedOwnerEmail,
              let url = Self.workspaceURL(ownerID: ownerID) else { return }
        Self.protectedWrite(
            MobileCoachingFormsProtectedWorkspace(
                schemaVersion: 1,
                ownerAccountID: ownerID,
                ownerEmail: ownerEmail,
                savedAt: Date(),
                workspace: value
            ),
            to: url
        )
    }

    private func restoreLedger() {
        guard let ownerID = observedOwnerAccountID,
              let ownerEmail = observedOwnerEmail,
              let url = Self.ledgerURL(ownerID: ownerID),
              let data = try? Data(contentsOf: url, options: .mappedIfSafe),
              let ledger = try? Self.makeDecoder().decode(MobileCoachingFormsProtectedLedger.self, from: data),
              ledger.schemaVersion == 1,
              ledger.ownerAccountID == ownerID,
              ledger.ownerEmail == ownerEmail else { return }
        localDrafts = ledger.drafts
        pendingSend = ledger.pendingSend
        pendingAutomationMutations = ledger.pendingAutomationMutations ?? [:]
        pendingOutcomeMutations = ledger.pendingOutcomeMutations ?? [:]
    }

    private func persistLedger() {
        ledgerWriteTask?.cancel()
        ledgerWriteTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 250_000_000)
            guard !Task.isCancelled else { return }
            self?.writeLedger()
        }
    }

    private func writeLedger() {
        guard let ownerID = observedOwnerAccountID,
              let ownerEmail = observedOwnerEmail,
              let url = Self.ledgerURL(ownerID: ownerID) else { return }
        Self.protectedWrite(
            MobileCoachingFormsProtectedLedger(
                schemaVersion: 1,
                ownerAccountID: ownerID,
                ownerEmail: ownerEmail,
                drafts: localDrafts,
                pendingSend: pendingSend,
                pendingAutomationMutations: pendingAutomationMutations,
                pendingOutcomeMutations: pendingOutcomeMutations
            ),
            to: url
        )
    }

    nonisolated private static func protectedWrite<Value: Encodable>(_ value: Value, to url: URL) {
        do {
            let fileManager = FileManager.default
            let directory = url.deletingLastPathComponent()
            try fileManager.createDirectory(
                at: directory,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.complete]
            )
            try fileManager.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: directory.path
            )
            try makeEncoder().encode(value).write(to: url, options: [.atomic, .completeFileProtection])
            try fileManager.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: url.path
            )
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            var mutableURL = url
            try mutableURL.setResourceValues(values)
        } catch {
            print("Protected coaching forms state could not be saved: \(error.localizedDescription)")
        }
    }

    nonisolated private static func accountDirectory(ownerID: String) -> URL? {
        let digest = SHA256.hash(data: Data(ownerID.utf8)).map { String(format: "%02x", $0) }.joined()
        return FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("QuipslyCapture", isDirectory: true)
            .appendingPathComponent("ProtectedCoachingForms", isDirectory: true)
            .appendingPathComponent(digest, isDirectory: true)
    }

    nonisolated private static func workspaceURL(ownerID: String) -> URL? {
        accountDirectory(ownerID: ownerID)?.appendingPathComponent("workspace-v1.json")
    }

    nonisolated private static func ledgerURL(ownerID: String) -> URL? {
        accountDirectory(ownerID: ownerID)?.appendingPathComponent("draft-ledger-v1.json")
    }

    nonisolated private static func normalized(_ value: String?) -> String? {
        let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() ?? ""
        return normalized.isEmpty ? nil : normalized
    }

    nonisolated private static func answerIsMissing(_ answer: MobileCoachingFormAnswerValue?) -> Bool {
        guard let answer else { return true }
        switch answer {
        case .text(let value): return value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        case .choices(let value): return value.isEmpty
        case .number, .boolean: return false
        }
    }

    nonisolated private static func fingerprint(
        assignmentID: String,
        state: String,
        answers: [String: MobileCoachingFormAnswerValue]
    ) -> String {
        struct Value: Encodable {
            let assignmentID: String
            let state: String
            let answers: [String: MobileCoachingFormAnswerValue]
        }
        let data = (try? makeEncoder().encode(Value(
            assignmentID: assignmentID,
            state: state,
            answers: answers
        ))) ?? Data()
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    nonisolated private static func fingerprint<Value: Encodable>(_ value: Value) -> String {
        let data = (try? makeEncoder().encode(value)) ?? Data()
        return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
    }

    nonisolated private static func assignmentTiming(_ purpose: String) -> String {
        switch purpose {
        case "INTAKE": return "ENGAGEMENT_START"
        case "PRE_SESSION": return "BEFORE_SESSION"
        case "POST_SESSION", "FEEDBACK": return "AFTER_SESSION"
        default: return "ON_DEMAND"
        }
    }

    nonisolated private static func validAutomationOffsets(
        trigger: String,
        release: Int,
        due: Int
    ) -> Bool {
        let limit = 365 * 24 * 60
        guard abs(release) <= limit, abs(due) <= limit else { return false }
        if trigger == "BEFORE_SESSION" { return release <= 0 && due >= 0 }
        if trigger == "AFTER_SESSION" { return release >= 0 && due >= release }
        return false
    }

    nonisolated private static func validAutomationProjection(
        _ automation: MobileCoachingFormAutomationOverview?,
        isCoach: Bool
    ) -> Bool {
        guard let automation else { return !isCoach }
        guard automation.schema == "quipsly-coaching-form-automation-v1",
              !automation.boundaries.externalSideEffects else { return false }
        if isCoach {
            guard automation.boundaries.relationshipScoped == true,
                  automation.boundaries.exactTemplateVersionReceipts == true,
                  automation.boundaries.exactlyOncePerPolicyEvent == true,
                  automation.boundaries.appendOnlyOverrides == true else { return false }
        } else if !automation.policies.isEmpty {
            return false
        }
        return automation.policies.allSatisfy { policy in
            !policy.id.isEmpty
                && ["ACTIVE", "PAUSED"].contains(policy.status)
                && ["BEFORE_SESSION", "AFTER_SESSION"].contains(policy.trigger)
                && ["LATEST_PUBLISHED", "PINNED_VERSION"].contains(policy.versionMode)
                && validAutomationOffsets(
                    trigger: policy.trigger,
                    release: policy.releaseOffsetMinutes,
                    due: policy.dueOffsetMinutes
                )
                && policy.sessions.allSatisfy { session in
                    !session.id.isEmpty
                        && (session.override.map { ["SEND_NOW", "SKIP", "CLEAR"].contains($0.action) } ?? true)
                }
        }
    }

    nonisolated private static func makeEncoder() -> JSONEncoder {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.sortedKeys]
        return encoder
    }

    nonisolated private static func makeDecoder() -> JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }

    private static let iso8601: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    private static let outcomeDateOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()

    private static func failure(_ message: String) -> NSError {
        NSError(
            domain: "QuipslyCoachingForms",
            code: 1,
            userInfo: [NSLocalizedDescriptionKey: message]
        )
    }

    private static let expectedBoundaries = MobileCoachingFormsWorkspace.Boundaries(
        exactCoachOrAssignedClientOnly: true,
        immutableTemplateVersion: true,
        draftAnswersRemainPrivate: true,
        noMessageReminderTaskOrGoalCreated: true,
        externalSideEffects: false
    )

    private static let previewDefinition = MobileCoachingFormDefinition(
        schema: MobileCoachingFormDefinition.schemaVersion,
        key: "preview-session-reflection",
        title: "Session reflection",
        description: "A short reflection that keeps the next conversation focused.",
        purpose: "POST_SESSION",
        submitLabel: "Share with my coach",
        fields: [
            .init(id: "what-matters", type: "LONG_TEXT", label: "What matters most after this Session?", help: "Write what you want to remember.", placeholder: "The clearest thing I learned…", required: true, options: nil, minimum: nil, maximum: nil, maximumLength: 4_000),
            .init(id: "confidence", type: "SCALE", label: "How confident do you feel about the next step?", help: nil, placeholder: nil, required: true, options: nil, minimum: 0, maximum: 10, maximumLength: nil),
            .init(id: "support", type: "MULTI_SELECT", label: "What support would help?", help: nil, placeholder: nil, required: false, options: ["Accountability", "A clear plan", "Resources"], minimum: nil, maximum: nil, maximumLength: nil),
        ]
    )

    private static let previewRelationship = MobileCoachingFormRelationship(
        id: "preview-engagement",
        title: "Coaching with Homer",
        client: .init(id: "preview-client", name: "Homer", email: "homer@example.com"),
        upcomingSessions: [
            .init(
                id: "preview-booking",
                scheduledStart: ISO8601DateFormatter().string(from: Date().addingTimeInterval(86_400)),
                room: .init(id: "preview-coaching-ready", title: "Next coaching Session")
            ),
        ]
    )

    private static let previewTemplate = MobileCoachingFormTemplate(
        id: "preview-template",
        title: previewDefinition.title,
        description: previewDefinition.description,
        purpose: previewDefinition.purpose,
        status: "PUBLISHED",
        publishedRevision: 1,
        definition: previewDefinition,
        assignmentCount: 2,
        updatedAt: ISO8601DateFormatter().string(from: Date())
    )

    private static func previewAssignment(
        id: String,
        definition: MobileCoachingFormDefinition,
        viewerRole: String,
        status: String,
        response: MobileCoachingFormAssignment.Response?
    ) -> MobileCoachingFormAssignment {
        MobileCoachingFormAssignment(
            id: id,
            requestId: "preview-request-\(id)",
            status: status,
            timing: "AFTER_SESSION",
            dueAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(172_800)),
            startedAt: response == nil ? nil : ISO8601DateFormatter().string(from: Date()),
            submittedAt: response?.submittedAt,
            template: .init(
                id: "preview-template",
                title: definition.title,
                description: definition.description,
                purpose: definition.purpose,
                revision: 1,
                definition: definition
            ),
            engagement: .init(id: "preview-engagement", title: "Coaching with Homer"),
            booking: .init(id: "preview-booking", scheduledStart: ISO8601DateFormatter().string(from: Date().addingTimeInterval(86_400))),
            room: .init(id: "preview-coaching-ready", title: "Next coaching Session"),
            assignedBy: .init(id: "preview-coach", name: "Charlie Sparrow", email: "charlie@example.com"),
            assignedTo: .init(id: "preview-client", name: "Homer", email: "homer@example.com"),
            viewerRole: viewerRole,
            response: response,
            outcomePromotions: response?.state == "SUBMITTED"
                ? [previewOutcomePromotion]
                : [],
            idempotentReplay: false,
            boundaries: .init(
                clientCanEditOwnResponse: viewerRole == "CLIENT",
                coachCanReadSubmittedResponse: viewerRole == "COACH" && response?.state == "SUBMITTED",
                coachCanReadDraftResponse: false,
                coachInitiatedPromotion: true,
                editableAfterCreation: true,
                sourceReceiptVisible: true,
                externalSideEffects: false
            )
        )
    }

    private static let previewOutcomePromotion = MobileCoachingFormOutcomePromotion(
        id: "preview-outcome-receipt",
        kind: "GOAL",
        targetId: "preview-goal",
        responseRevision: 1,
        selectedFieldIds: ["what-matters"],
        sourceSha256: String(repeating: "a", count: 64),
        reviewedPayload: .init(
            schema: "quipsly-coaching-form-outcome-reviewed-v1",
            title: "Choose the next honest step",
            body: "Keep the next decision small enough to begin.",
            owner: .init(id: "preview-client", name: "Homer", email: "homer@example.com"),
            visibility: "SHARED",
            targetAt: nil,
            coachInitiated: true
        ),
        createdAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(-900))
    )
}

// MARK: - Phone-first forms experience

struct MobileCoachingFormsSummaryCard: View {
    @ObservedObject var client: MobileCoachingFormsClient

    var body: some View {
        NavigationLink {
            MobileCoachingFormsHomeView(client: client)
        } label: {
            HStack(alignment: .center, spacing: 14) {
                Image(systemName: "list.clipboard.fill")
                    .font(.title2.weight(.bold))
                    .foregroundStyle(.purple)
                    .frame(width: 46, height: 46)
                    .background(.purple.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("Forms")
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.black))
                    .foregroundStyle(.secondary)
            }
            .padding(16)
            .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(.primary.opacity(0.08), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("CaptureCoachingFormsButton")
    }

    private var summary: String {
        if client.isLoading && client.workspace == nil { return "Loading your coaching forms…" }
        if client.isCoach {
            let count = client.submittedForCoachCount
            return count == 0
                ? "Send a reflection and review shared answers."
                : "\(count) shared reflection\(count == 1 ? "" : "s") ready to review."
        }
        let count = client.outstandingCount
        return count == 0
            ? "You’re caught up. Shared reflections stay here."
            : "\(count) reflection\(count == 1 ? "" : "s") to complete."
    }
}

struct MobileCoachingFormsHomeView: View {
    @ObservedObject var client: MobileCoachingFormsClient
    @State private var showsSendForm = false

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if client.isUsingProtectedCache {
                    Label(
                        "Saved copy · Reconnect before saving or sharing.",
                        systemImage: "wifi.slash"
                    )
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.orange)
                    .padding(14)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .background(.orange.opacity(0.1), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .accessibilityIdentifier("CaptureCoachingFormsOffline")
                }

                if let message = client.statusMessage {
                    Label(message, systemImage: "checkmark.circle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.green)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .accessibilityIdentifier("CaptureCoachingFormsStatus")
                }

                if let error = client.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .padding(14)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .background(.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .accessibilityIdentifier("CaptureCoachingFormsError")
                }

                if client.workspace == nil {
                    unavailableCard
                } else if client.isCoach {
                    coachExperience
                } else {
                    clientExperience
                }
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 80)
        }
        .background(CaptureCanvas())
        .navigationTitle("Forms")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            guard !CaptureLaunchConfiguration.usesPreviewData else { return }
            await client.load()
        }
        .sheet(isPresented: $showsSendForm) {
            NavigationStack {
                MobileCoachingSendFormView(client: client) {
                    showsSendForm = false
                }
            }
        }
        .accessibilityIdentifier("CaptureCoachingFormsHome")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(client.isCoach ? "COACHING FOLLOW-THROUGH" : "YOUR COACHING")
                .font(.caption2.weight(.black))
                .tracking(1.4)
                .foregroundStyle(.purple)
            Text(client.isCoach ? "Useful reflection, without paperwork" : clientHeadline)
                .font(.largeTitle.weight(.black))
                .fixedSize(horizontal: false, vertical: true)
            Text(
                client.isCoach
                    ? "Send one focused form when it helps. Draft answers stay private until your client shares them."
                    : "Think privately, save your place, and share only when you are ready."
            )
            .font(.subheadline)
            .foregroundStyle(.secondary)
            .fixedSize(horizontal: false, vertical: true)
        }
        .padding(.top, 10)
    }

    private var clientHeadline: String {
        let count = client.outstandingCount
        return count == 0
            ? "You’re caught up."
            : "\(count) reflection\(count == 1 ? "" : "s") to complete"
    }

    @ViewBuilder
    private var clientExperience: some View {
        let active = client.workspace?.clientAssignments.filter { !$0.isSubmitted } ?? []
        let shared = client.workspace?.clientAssignments.filter(\.isSubmitted) ?? []

        if active.isEmpty {
            Label(
                "Nothing is waiting for you. Your coach can send a reflection when it is genuinely useful.",
                systemImage: "checkmark.circle.fill"
            )
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(.green)
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        } else {
            formSectionTitle("To complete", count: active.count)
            ForEach(active) { assignment in
                clientAssignmentCard(assignment)
            }
        }

        if !shared.isEmpty {
            formSectionTitle("Shared", count: shared.count)
            ForEach(shared) { assignment in
                clientAssignmentCard(assignment)
            }
        }
    }

    @ViewBuilder
    private var coachExperience: some View {
        Button {
            client.clearMessages()
            showsSendForm = true
        } label: {
            Label("Send a form", systemImage: "paperplane.fill")
                .font(.headline)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 4)
        }
        .buttonStyle(.borderedProminent)
        .tint(.purple)
        .controlSize(.large)
        .disabled(
            client.isUsingProtectedCache
                || client.workspace?.templates.isEmpty != false
                || client.workspace?.relationships.isEmpty != false
                || CaptureLaunchConfiguration.usesPreviewData
        )
        .accessibilityIdentifier("CaptureCoachingSendFormButton")

        NavigationLink {
            MobileCoachingFormAutomationView(client: client)
        } label: {
            HStack(spacing: 13) {
                Image(systemName: "clock.arrow.trianglehead.counterclockwise.rotate.90")
                    .font(.headline.weight(.bold))
                    .foregroundStyle(.purple)
                    .frame(width: 42, height: 42)
                    .background(.purple.opacity(0.12), in: Circle())
                VStack(alignment: .leading, spacing: 3) {
                    Text("Automatic rhythm")
                        .font(.headline)
                        .foregroundStyle(.primary)
                    Text(automationSummary)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                Spacer(minLength: 8)
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.black))
                    .foregroundStyle(.secondary)
            }
            .padding(16)
            .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 20, style: .continuous)
                    .stroke(.purple.opacity(0.16), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("CaptureCoachingAutomationButton")

        let coachAssignments = client.workspace?.coachAssignments ?? []
        let shared = coachAssignments.filter(\.coachCanRead)
        let waiting = coachAssignments.filter { !$0.coachCanRead }

        if !shared.isEmpty {
            formSectionTitle("Ready to review", count: shared.count)
            ForEach(shared) { assignment in
                coachAssignmentCard(assignment)
            }
        }

        if !waiting.isEmpty {
            formSectionTitle("Waiting", count: waiting.count)
            ForEach(waiting) { assignment in
                coachAssignmentCard(assignment)
            }
        }

        if coachAssignments.isEmpty {
            VStack(alignment: .leading, spacing: 7) {
                Label("Start with one useful question", systemImage: "sparkles")
                    .font(.headline)
                Text("Send an intake, before-Session focus, or reflection from a published form. Capture keeps it beside the coaching relationship.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(18)
            .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        }
    }

    private func formSectionTitle(_ title: String, count: Int) -> some View {
        HStack {
            Text(title)
                .font(.title3.weight(.black))
            Spacer()
            Text("\(count)")
                .font(.caption.weight(.black))
                .padding(.horizontal, 10)
                .padding(.vertical, 5)
                .background(Color.primary.opacity(0.08), in: Capsule())
        }
        .padding(.top, 4)
    }

    private var automationSummary: String {
        let policies = client.workspace?.automation?.policies ?? []
        guard !policies.isEmpty else { return "Optional before- and after-Session forms." }
        let active = policies.filter(\.isActive).count
        return "\(active) active rhythm\(active == 1 ? "" : "s") · every send keeps a receipt."
    }

    private func clientAssignmentCard(_ assignment: MobileCoachingFormAssignment) -> some View {
        NavigationLink {
            MobileCoachingFormResponseView(client: client, assignmentID: assignment.id)
        } label: {
            assignmentCard(
                assignment,
                status: assignment.isSubmitted ? "Shared" : assignment.response == nil ? "Not started" : "Private draft",
                color: assignment.isSubmitted ? .green : .purple,
                symbol: assignment.isSubmitted ? "checkmark.circle.fill" : "square.and.pencil"
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("CaptureCoachingFormAssignment_\(assignment.id)")
    }

    private func coachAssignmentCard(_ assignment: MobileCoachingFormAssignment) -> some View {
        NavigationLink {
            MobileCoachingFormCoachReviewView(client: client, assignmentID: assignment.id)
        } label: {
            assignmentCard(
                assignment,
                status: assignment.coachCanRead
                    ? "Shared · Review"
                    : assignment.status == "IN_PROGRESS" ? "Draft in progress · Answers private" : "Waiting for client",
                color: assignment.coachCanRead ? .green : .orange,
                symbol: assignment.coachCanRead ? "doc.text.magnifyingglass" : "lock.fill"
            )
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier("CaptureCoachingCoachForm_\(assignment.id)")
    }

    private func assignmentCard(
        _ assignment: MobileCoachingFormAssignment,
        status: String,
        color: Color,
        symbol: String
    ) -> some View {
        HStack(alignment: .top, spacing: 13) {
            Image(systemName: symbol)
                .font(.headline.weight(.bold))
                .foregroundStyle(color)
                .frame(width: 38, height: 38)
                .background(color.opacity(0.12), in: Circle())
            VStack(alignment: .leading, spacing: 4) {
                Text(assignment.template.title)
                    .font(.headline)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(status)
                    .font(.caption.weight(.bold))
                    .foregroundStyle(color)
                Text(assignment.engagement.title + dueText(assignment.dueAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 6)
            Image(systemName: "chevron.right")
                .font(.caption.weight(.black))
                .foregroundStyle(.secondary)
                .padding(.top, 5)
        }
        .padding(16)
        .background(.background, in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(.primary.opacity(0.08), lineWidth: 1)
        }
    }

    private func dueText(_ raw: String?) -> String {
        guard let raw, let date = coachingFormsDate(raw) else { return "" }
        return " · Due \(date.formatted(date: .abbreviated, time: .omitted))"
    }

    private var unavailableCard: some View {
        VStack(spacing: 14) {
            if client.isLoading { ProgressView() }
            Text(client.isLoading ? "Loading forms…" : "Forms are unavailable")
                .font(.headline)
            if !client.isLoading {
                Button("Try again") {
                    Task { await client.load() }
                }
                .buttonStyle(.borderedProminent)
                .tint(.purple)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(28)
        .background(Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 22, style: .continuous))
    }
}

struct MobileCoachingFormResponseView: View {
    @ObservedObject var client: MobileCoachingFormsClient
    let assignmentID: String

    @Environment(\.scenePhase) private var scenePhase
    @State private var answers: [String: MobileCoachingFormAnswerValue] = [:]
    @State private var missing = Set<String>()
    @State private var hydratedIdentity: String?

    private var assignment: MobileCoachingFormAssignment? {
        client.workspace?.clientAssignments.first { $0.id == assignmentID }
    }

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                if let assignment {
                    VStack(alignment: .leading, spacing: 20) {
                        formHeader(assignment)

                        if assignment.isSubmitted {
                            Label(
                                "Shared with your coach. You can correct an answer and share the update.",
                                systemImage: "checkmark.circle.fill"
                            )
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(.green)
                            .padding(14)
                            .background(.green.opacity(0.09), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }

                        ForEach(assignment.template.definition.fields) { field in
                            MobileCoachingFormAnswerField(
                                field: field,
                                value: answers[field.id],
                                invalid: missing.contains(field.id),
                                onChange: { value in
                                    if let value { answers[field.id] = value }
                                    else { answers.removeValue(forKey: field.id) }
                                    missing.remove(field.id)
                                    if !assignment.isSubmitted {
                                        client.updateLocalDraft(assignment: assignment, answers: answers)
                                    }
                                }
                            )
                            .id(field.id)
                        }

                        if !assignment.visibleOutcomePromotions.isEmpty {
                            MobileCoachingFormOutcomeReceipts(
                                promotions: assignment.visibleOutcomePromotions,
                                relationshipTitle: assignment.engagement.title
                            )
                        }

                        if let error = client.errorMessage {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.orange)
                                .padding(14)
                                .background(.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }

                        actionBar(assignment, proxy: proxy)
                    }
                    .padding(.horizontal, 18)
                    .padding(.bottom, 70)
                } else {
                    ContentUnavailableView(
                        "Form unavailable",
                        systemImage: "lock.fill",
                        description: Text("This private coaching form is not available to this account.")
                    )
                    .padding(.top, 70)
                }
            }
        }
        .background(CaptureCanvas())
        .navigationTitle("Reflection")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .keyboard) {
                Spacer()
                Button("Done") {
                    UIApplication.shared.sendAction(
                        #selector(UIResponder.resignFirstResponder),
                        to: nil,
                        from: nil,
                        for: nil
                    )
                    Task { @MainActor in
                        await Task.yield()
                        client.flushProtectedDrafts()
                    }
                }
                .fontWeight(.semibold)
                .accessibilityIdentifier("CaptureCoachingFormKeyboardDone")
            }
        }
        .onAppear(perform: hydrate)
        .onChange(of: assignment?.response?.revision) { _, _ in hydrate() }
        .onChange(of: scenePhase) { _, phase in
            if phase != .active { client.flushProtectedDrafts() }
        }
        .onDisappear { client.flushProtectedDrafts() }
        .accessibilityIdentifier("CaptureCoachingFormResponse")
    }

    private func formHeader(_ assignment: MobileCoachingFormAssignment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(purposeLabel(assignment.template.purpose).uppercased())
                .font(.caption2.weight(.black))
                .tracking(1.1)
                .foregroundStyle(.purple)
                .lineLimit(nil)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityLabel(purposeLabel(assignment.template.purpose))
            Text(assignment.template.definition.title)
                .font(.largeTitle.weight(.black))
                .fixedSize(horizontal: false, vertical: true)
            if !assignment.template.definition.description.isEmpty {
                Text(assignment.template.definition.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            if let name = assignment.assignedBy?.name {
                Text("From \(name)")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.top, 10)
    }

    @ViewBuilder
    private func actionBar(
        _ assignment: MobileCoachingFormAssignment,
        proxy: ScrollViewProxy
    ) -> some View {
        let busy = client.activeMutationAssignmentID == assignment.id
        VStack(spacing: 12) {
            if !assignment.isSubmitted {
                Button {
                    client.updateLocalDraft(assignment: assignment, answers: answers)
                    Task { _ = await client.save(assignment: assignment, answers: answers, state: "DRAFT") }
                } label: {
                    Label(busy ? "Saving…" : "Save private draft", systemImage: "lock.fill")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
                .disabled(busy || client.isUsingProtectedCache || CaptureLaunchConfiguration.usesPreviewData)
                .accessibilityIdentifier("CaptureCoachingFormSaveDraft")
            }

            Button {
                let required = client.missingRequiredFieldIDs(assignment: assignment, answers: answers)
                missing = required
                if let first = assignment.template.definition.fields.first(where: { required.contains($0.id) }) {
                    withAnimation { proxy.scrollTo(first.id, anchor: .center) }
                } else {
                    Task { _ = await client.save(assignment: assignment, answers: answers, state: "SUBMITTED") }
                }
            } label: {
                Label(
                    busy ? "Sharing…" : assignment.isSubmitted ? "Share updated answers" : assignment.template.definition.submitLabel,
                    systemImage: "paperplane.fill"
                )
                .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .tint(.purple)
            .controlSize(.large)
            .disabled(busy || client.isUsingProtectedCache || CaptureLaunchConfiguration.usesPreviewData)
            .accessibilityIdentifier("CaptureCoachingFormSubmit")

            Text("Drafts stay private. Sharing makes these answers visible to your coach.")
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding(.top, 6)
    }

    private func hydrate() {
        guard let assignment else { return }
        let identity = "\(assignment.id):\(assignment.template.revision):\(assignment.response?.revision ?? 0)"
        guard hydratedIdentity != identity else { return }
        hydratedIdentity = identity
        answers = client.answers(for: assignment)
        missing = []
        client.clearMessages()
    }
}

private struct MobileCoachingFormAnswerField: View {
    let field: MobileCoachingFormField
    let value: MobileCoachingFormAnswerValue?
    let invalid: Bool
    let onChange: (MobileCoachingFormAnswerValue?) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Text(field.label)
                    .font(.headline)
                    .fixedSize(horizontal: false, vertical: true)
                if field.required {
                    Text("Required")
                        .font(.caption2.weight(.black))
                        .foregroundStyle(.purple)
                        .accessibilityLabel("required")
                }
            }
            if let help = field.help, !help.isEmpty {
                Text(help)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            answerControl

            if invalid {
                Label("Answer this question.", systemImage: "exclamationmark.circle.fill")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.red)
            }
        }
        .padding(16)
        .background(invalid ? Color.red.opacity(0.07) : Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(invalid ? Color.red.opacity(0.55) : Color.primary.opacity(0.08), lineWidth: 1)
        }
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureCoachingFormField_\(field.id)")
    }

    @ViewBuilder
    private var answerControl: some View {
        switch field.type {
        case "SHORT_TEXT":
            TextField(field.placeholder ?? "Your answer", text: textBinding)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("CaptureCoachingFormInput_\(field.id)")
        case "LONG_TEXT":
            ZStack(alignment: .topLeading) {
                if textBinding.wrappedValue.isEmpty {
                    Text(field.placeholder ?? "Write your answer…")
                        .font(.body)
                        .foregroundStyle(.tertiary)
                        .padding(.horizontal, 5)
                        .padding(.vertical, 8)
                        .allowsHitTesting(false)
                }
                TextEditor(text: textBinding)
                    .frame(minHeight: 120)
                    .scrollContentBackground(.hidden)
                    .background(.clear)
                    .accessibilityIdentifier("CaptureCoachingFormInput_\(field.id)")
            }
        case "NUMBER":
            TextField("Number", text: numberBinding)
                .keyboardType(.decimalPad)
                .textFieldStyle(.roundedBorder)
                .accessibilityIdentifier("CaptureCoachingFormInput_\(field.id)")
        case "SCALE":
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 48), spacing: 8)], spacing: 8) {
                ForEach(scaleValues, id: \.self) { number in
                    Button {
                        onChange(.number(Double(number)))
                    } label: {
                        Text("\(number)")
                            .font(.subheadline.weight(.black))
                            .frame(minWidth: 48, minHeight: 48)
                            .background(
                                value?.numberValue == Double(number) ? Color.purple : Color.clear,
                                in: Circle()
                            )
                            .foregroundStyle(value?.numberValue == Double(number) ? .white : .primary)
                    }
                    .frame(minWidth: 48, minHeight: 48)
                    .contentShape(Rectangle())
                    .buttonStyle(.plain)
                    .accessibilityLabel("\(number)")
                    .accessibilityAddTraits(value?.numberValue == Double(number) ? .isSelected : [])
                }
            }
        case "BOOLEAN":
            HStack(spacing: 10) {
                choiceButton("Yes", selected: value?.booleanValue == true) { onChange(.boolean(true)) }
                choiceButton("No", selected: value?.booleanValue == false) { onChange(.boolean(false)) }
            }
        case "SINGLE_SELECT":
            VStack(spacing: 8) {
                ForEach(field.options ?? [], id: \.self) { option in
                    choiceButton(option, selected: value?.textValue == option) { onChange(.text(option)) }
                }
            }
        case "MULTI_SELECT":
            VStack(spacing: 8) {
                ForEach(field.options ?? [], id: \.self) { option in
                    choiceButton(option, selected: (value?.choicesValue ?? []).contains(option)) {
                        var selected = value?.choicesValue ?? []
                        if let index = selected.firstIndex(of: option) { selected.remove(at: index) }
                        else { selected.append(option) }
                        onChange(.choices(selected))
                    }
                }
            }
        case "DATE":
            if let chosen = dateBindingValue {
                DatePicker(
                    "Date",
                    selection: Binding(
                        get: { chosen },
                        set: { onChange(.text(Self.dateOnly.string(from: $0))) }
                    ),
                    displayedComponents: .date
                )
                .datePickerStyle(.compact)
            } else {
                Button {
                    onChange(.text(Self.dateOnly.string(from: Date())))
                } label: {
                    Label("Choose date", systemImage: "calendar")
                        .frame(maxWidth: .infinity, alignment: .leading)
                }
                .buttonStyle(.bordered)
                .controlSize(.large)
            }
        default:
            Label("This question needs a newer version of Capture.", systemImage: "exclamationmark.triangle.fill")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
        }
    }

    private var textBinding: Binding<String> {
        Binding(
            get: { value?.textValue ?? "" },
            set: { updated in
                let maximum = field.maximumLength ?? (field.type == "SHORT_TEXT" ? 500 : 4_000)
                onChange(.text(String(updated.prefix(maximum))))
            }
        )
    }

    private var numberBinding: Binding<String> {
        Binding(
            get: {
                guard let number = value?.numberValue else { return "" }
                return number.rounded() == number ? String(Int(number)) : String(number)
            },
            set: { raw in
                let normalized = raw.replacingOccurrences(of: ",", with: ".")
                guard !normalized.isEmpty else { onChange(nil); return }
                guard let number = Double(normalized) else { return }
                if let minimum = field.minimum, number < minimum { return }
                if let maximum = field.maximum, number > maximum { return }
                onChange(.number(number))
            }
        )
    }

    private var scaleValues: [Int] {
        let minimum = Int(field.minimum ?? 0)
        let maximum = Int(field.maximum ?? 10)
        guard minimum <= maximum, maximum - minimum <= 30 else { return Array(0...10) }
        return Array(minimum...maximum)
    }

    private var dateBindingValue: Date? {
        guard let raw = value?.textValue else { return nil }
        return Self.dateOnly.date(from: raw)
    }

    private func choiceButton(
        _ label: String,
        selected: Bool,
        action: @escaping () -> Void
    ) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: selected ? "checkmark.circle.fill" : "circle")
                    .foregroundStyle(selected ? .purple : .secondary)
                Text(label)
                    .font(.subheadline.weight(.semibold))
                    .multilineTextAlignment(.leading)
                Spacer()
            }
            .padding(.horizontal, 14)
            .frame(minHeight: 48)
            .background(selected ? Color.purple.opacity(0.1) : Color.primary.opacity(0.035), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .stroke(selected ? Color.purple.opacity(0.5) : Color.primary.opacity(0.09), lineWidth: 1)
            }
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(selected ? .isSelected : [])
    }

    private static let dateOnly: DateFormatter = {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.timeZone = TimeZone(secondsFromGMT: 0)
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter
    }()
}

struct MobileCoachingFormCoachReviewView: View {
    @ObservedObject var client: MobileCoachingFormsClient
    let assignmentID: String
    @State private var selectedFieldIDs = Set<String>()
    @State private var showsOutcomeReview = false

    private var assignment: MobileCoachingFormAssignment? {
        client.workspace?.coachAssignments.first { $0.id == assignmentID }
    }

    var body: some View {
        ScrollView {
            if let assignment {
                VStack(alignment: .leading, spacing: 18) {
                    Text(purposeLabel(assignment.template.purpose).uppercased())
                        .font(.caption2.weight(.black))
                        .tracking(1.1)
                        .foregroundStyle(.purple)
                        .lineLimit(nil)
                        .fixedSize(horizontal: false, vertical: true)
                        .accessibilityLabel(purposeLabel(assignment.template.purpose))
                    Text(assignment.template.title)
                        .font(.largeTitle.weight(.black))
                        .fixedSize(horizontal: false, vertical: true)
                    Text(assignment.assignedTo?.name ?? assignment.engagement.title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.secondary)

                    if assignment.coachCanRead, let response = assignment.response {
                        Label("Shared by your client", systemImage: "checkmark.circle.fill")
                            .font(.caption.weight(.bold))
                            .foregroundStyle(.green)
                        Text("Choose only the answers that belong in one useful next step.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        ForEach(assignment.template.definition.fields.filter { response.answers[$0.id] != nil }) { field in
                            Button {
                                if selectedFieldIDs.contains(field.id) {
                                    selectedFieldIDs.remove(field.id)
                                } else {
                                    selectedFieldIDs.insert(field.id)
                                }
                            } label: {
                                MobileCoachingFormAnswerReadback(
                                    field: field,
                                    answer: response.answers[field.id],
                                    selected: selectedFieldIDs.contains(field.id)
                                )
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel("Use answer to \(field.label)")
                            .accessibilityValue(selectedFieldIDs.contains(field.id) ? "Selected" : "Not selected")
                            .accessibilityAddTraits(selectedFieldIDs.contains(field.id) ? .isSelected : [])
                        }

                        VStack(alignment: .leading, spacing: 10) {
                            Text("One tap with sensible defaults")
                                .font(.subheadline.weight(.black))
                            Text("Notes are shared. Tasks and goals belong to the client. Everything stays editable afterward.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                            HStack(spacing: 8) {
                                quickOutcomeButton("Save note", symbol: "note.text", kind: "NOTE", assignment: assignment)
                                quickOutcomeButton("Add task", symbol: "checklist", kind: "TASK", assignment: assignment)
                                quickOutcomeButton("Set goal", symbol: "target", kind: "GOAL", assignment: assignment)
                            }
                            Button {
                                showsOutcomeReview = true
                            } label: {
                                Label("Adjust details first", systemImage: "slider.horizontal.3")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.large)
                            .disabled(
                                selectedFieldIDs.isEmpty
                                    || !assignment.canCoachPromoteOutcome
                                    || client.isUsingProtectedCache
                            )
                            .accessibilityIdentifier("CaptureCoachingFormAdjustFollowThrough")
                        }
                        .padding(14)
                        .background(.purple.opacity(0.08), in: RoundedRectangle(cornerRadius: 18, style: .continuous))

                        if !assignment.visibleOutcomePromotions.isEmpty {
                            MobileCoachingFormOutcomeReceipts(
                                promotions: assignment.visibleOutcomePromotions,
                                relationshipTitle: assignment.engagement.title
                            )
                        }
                        if let status = client.statusMessage {
                            Label(status, systemImage: "checkmark.circle.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.green)
                        }
                        if let error = client.errorMessage {
                            Label(error, systemImage: "exclamationmark.triangle.fill")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.orange)
                        }
                    } else {
                        VStack(alignment: .leading, spacing: 8) {
                            Label(
                                assignment.status == "IN_PROGRESS" ? "Private draft in progress" : "Waiting for your client",
                                systemImage: "lock.fill"
                            )
                            .font(.headline)
                            Text("You can see its status, but draft answers stay private until your client chooses to share them.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        .padding(18)
                        .background(.orange.opacity(0.09), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
                        .accessibilityIdentifier("CaptureCoachingFormPrivateDraftBoundary")
                    }
                }
                .padding(.horizontal, 18)
                .padding(.bottom, 70)
            } else {
                ContentUnavailableView("Form unavailable", systemImage: "lock.fill")
            }
        }
        .background(CaptureCanvas())
        .navigationTitle("Review")
        .navigationBarTitleDisplayMode(.inline)
        .sheet(isPresented: $showsOutcomeReview) {
            if let assignment {
                NavigationStack {
                    MobileCoachingFormOutcomeReviewSheet(
                        client: client,
                        assignment: assignment,
                        selectedFieldIDs: assignment.template.definition.fields
                            .map(\.id)
                            .filter { selectedFieldIDs.contains($0) },
                        onComplete: {
                            selectedFieldIDs = []
                            showsOutcomeReview = false
                        }
                    )
                }
            }
        }
        .accessibilityIdentifier("CaptureCoachingFormCoachReview")
    }

    private func quickOutcomeButton(
        _ label: String,
        symbol: String,
        kind: String,
        assignment: MobileCoachingFormAssignment
    ) -> some View {
        Button {
            Task {
                let intent = defaultOutcomeIntent(assignment)
                let saved = await client.promoteOutcome(
                    assignment: assignment,
                    selectedFieldIDs: intent.fieldIDs,
                    kind: kind,
                    title: intent.title,
                    body: intent.body,
                    ownerUserID: assignment.assignedTo?.id ?? assignment.assignedBy?.id ?? "",
                    visibility: "SHARED",
                    targetAt: nil
                )
                if saved { selectedFieldIDs = [] }
            }
        } label: {
            VStack(spacing: 4) {
                Image(systemName: symbol)
                Text(label)
                    .font(.caption2.weight(.black))
                    .lineLimit(1)
                    .minimumScaleFactor(0.75)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
        }
        .buttonStyle(.borderedProminent)
        .tint(.purple)
        .disabled(
            selectedFieldIDs.isEmpty
                || !assignment.canCoachPromoteOutcome
                || client.isUsingProtectedCache
                || client.activeOutcomeAssignmentID == assignment.id
                || CaptureLaunchConfiguration.usesPreviewData
        )
        .accessibilityIdentifier("CaptureCoachingFormQuick\(kind)")
    }

    private func defaultOutcomeIntent(
        _ assignment: MobileCoachingFormAssignment
    ) -> (fieldIDs: [String], title: String, body: String) {
        let answers = assignment.response?.answers ?? [:]
        let fields = assignment.template.definition.fields.filter {
            selectedFieldIDs.contains($0.id) && answers[$0.id] != nil
        }
        let first = fields.first.map { mobileCoachingFormAnswerText(answers[$0.id]) } ?? "Follow-through"
        return (
            fields.map(\.id),
            first.count <= 140 ? first : fields.first?.label ?? "Follow-through",
            fields.map {
                "\($0.label)\n\(mobileCoachingFormAnswerText(answers[$0.id]))"
            }.joined(separator: "\n\n")
        )
    }
}

private struct MobileCoachingFormAnswerReadback: View {
    let field: MobileCoachingFormField
    let answer: MobileCoachingFormAnswerValue?
    let selected: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 7) {
            Text(field.label)
                .font(.caption.weight(.black))
                .foregroundStyle(.secondary)
            Text(mobileCoachingFormAnswerText(answer))
                .font(.body.weight(.semibold))
                .textSelection(.enabled)
                .fixedSize(horizontal: false, vertical: true)
            if selected {
                Label("Selected for follow-through", systemImage: "checkmark.circle.fill")
                    .font(.caption2.weight(.black))
                    .foregroundStyle(.purple)
            }
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(selected ? Color.purple.opacity(0.1) : Color.primary.opacity(0.045), in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(selected ? Color.purple.opacity(0.55) : Color.clear, lineWidth: 1.5)
        }
        .accessibilityIdentifier("CaptureCoachingFormAnswer_\(field.id)")
    }
}

private func mobileCoachingFormAnswerText(_ answer: MobileCoachingFormAnswerValue?) -> String {
    guard let answer else { return "Not answered" }
    switch answer {
    case .text(let value): return value.isEmpty ? "Not answered" : value
    case .number(let value): return value.rounded() == value ? String(Int(value)) : String(value)
    case .boolean(let value): return value ? "Yes" : "No"
    case .choices(let value): return value.isEmpty ? "Not answered" : value.joined(separator: ", ")
    }
}

private struct MobileCoachingFormOutcomeReceipts: View {
    let promotions: [MobileCoachingFormOutcomePromotion]
    let relationshipTitle: String

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Follow-through created together", systemImage: "checkmark.seal.fill")
                .font(.headline)
                .foregroundStyle(.green)
            ForEach(promotions) { promotion in
                HStack(alignment: .top, spacing: 12) {
                    Image(systemName: symbol(promotion.kind))
                        .font(.headline.weight(.bold))
                        .foregroundStyle(.green)
                        .frame(width: 34, height: 34)
                        .background(.green.opacity(0.1), in: Circle())
                    VStack(alignment: .leading, spacing: 3) {
                        Text(promotion.reviewedPayload.title)
                            .font(.subheadline.weight(.black))
                            .fixedSize(horizontal: false, vertical: true)
                        Text(detail(promotion))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.background, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            }
            Text("Find and update these in \(relationshipTitle).")
                .font(.caption2.weight(.semibold))
                .foregroundStyle(.secondary)
        }
        .padding(16)
        .background(.green.opacity(0.07), in: RoundedRectangle(cornerRadius: 20, style: .continuous))
        .accessibilityIdentifier("CaptureCoachingFormOutcomeReceipts")
    }

    private func symbol(_ kind: String) -> String {
        kind == "NOTE" ? "note.text" : kind == "TASK" ? "checklist" : "target"
    }

    private func detail(_ promotion: MobileCoachingFormOutcomePromotion) -> String {
        let kind = promotion.kind == "NOTE" ? "Note" : promotion.kind == "TASK" ? "Task" : "Goal"
        let target = promotion.reviewedPayload.targetAt
            .flatMap(coachingFormsDate)
            .map { " · \($0.formatted(date: .abbreviated, time: .omitted))" }
            ?? ""
        return "\(kind) · \(promotion.reviewedPayload.owner.name)\(target)"
    }
}

private struct MobileCoachingFormOutcomeReviewSheet: View {
    @ObservedObject var client: MobileCoachingFormsClient
    let assignment: MobileCoachingFormAssignment
    let selectedFieldIDs: [String]
    let onComplete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var kind = "TASK"
    @State private var title: String
    @State private var detail: String
    @State private var ownerUserID: String
    @State private var visibility = "SHARED"
    @State private var hasTargetDate = false
    @State private var targetDate = Date().addingTimeInterval(7 * 86_400)

    init(
        client: MobileCoachingFormsClient,
        assignment: MobileCoachingFormAssignment,
        selectedFieldIDs: [String],
        onComplete: @escaping () -> Void
    ) {
        self.client = client
        self.assignment = assignment
        self.selectedFieldIDs = selectedFieldIDs
        self.onComplete = onComplete
        let fields = assignment.template.definition.fields.filter { selectedFieldIDs.contains($0.id) }
        let answers = assignment.response?.answers ?? [:]
        let firstAnswer = fields.first.map { mobileCoachingFormAnswerText(answers[$0.id]) } ?? ""
        _title = State(initialValue: firstAnswer.count <= 140 ? firstAnswer : fields.first?.label ?? "Follow-through")
        _detail = State(initialValue: fields.map {
            "\($0.label)\n\(mobileCoachingFormAnswerText(answers[$0.id]))"
        }.joined(separator: "\n\n"))
        _ownerUserID = State(initialValue: assignment.assignedTo?.id ?? assignment.assignedBy?.id ?? "")
    }

    private var ownerOptions: [MobileCoachingFormPerson] {
        var seen = Set<String>()
        return [assignment.assignedTo, assignment.assignedBy]
            .compactMap { $0 }
            .filter { seen.insert($0.id).inserted }
    }

    var body: some View {
        Form {
            Section {
                Picker("Type", selection: $kind) {
                    Label("Note", systemImage: "note.text").tag("NOTE")
                    Label("Task", systemImage: "checklist").tag("TASK")
                    Label("Goal", systemImage: "target").tag("GOAL")
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("CaptureCoachingOutcomeKind")
            } header: {
                Text("One useful next step")
            } footer: {
                Text("Selected from revision \(assignment.response?.revision ?? 0) of the shared response.")
            }

            Section("Details") {
                TextField("Name", text: $title, axis: .vertical)
                    .lineLimit(1...4)
                    .accessibilityIdentifier("CaptureCoachingOutcomeTitle")
                TextEditor(text: $detail)
                    .frame(minHeight: 140)
                    .accessibilityIdentifier("CaptureCoachingOutcomeBody")
            }

            if kind == "NOTE" {
                Section("Who can read it?") {
                    Picker("Visibility", selection: $visibility) {
                        Text("Everyone in this relationship").tag("SHARED")
                        Text("Only me").tag("PRIVATE")
                    }
                }
            } else {
                Section("Owner and timing") {
                    Picker("Owner", selection: $ownerUserID) {
                        ForEach(ownerOptions, id: \.id) { person in
                            Text(person.name).tag(person.id)
                        }
                    }
                    Toggle("Add target date", isOn: $hasTargetDate)
                    if hasTargetDate {
                        DatePicker("Target date", selection: $targetDate, displayedComponents: .date)
                    }
                }
            }

            Section {
                Label(
                    "Saved in the relationship home with its source attached. Edit or remove it there anytime.",
                    systemImage: "arrow.uturn.backward.circle.fill"
                )
                .font(.caption)
                .foregroundStyle(.secondary)
            }

            if CaptureLaunchConfiguration.usesPreviewData {
                Section {
                    Label("Preview only — saving is intentionally disabled.", systemImage: "eye.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle("Adjust details")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(client.activeOutcomeAssignmentID == assignment.id ? "Creating…" : "Create") {
                    Task {
                        let saved = await client.promoteOutcome(
                            assignment: assignment,
                            selectedFieldIDs: selectedFieldIDs,
                            kind: kind,
                            title: title,
                            body: detail,
                            ownerUserID: ownerUserID,
                            visibility: visibility,
                            targetAt: kind == "NOTE" || !hasTargetDate ? nil : targetDate
                        )
                        if saved { onComplete() }
                    }
                }
                .fontWeight(.bold)
                .disabled(
                    title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                        || client.activeOutcomeAssignmentID == assignment.id
                        || client.isUsingProtectedCache
                        || CaptureLaunchConfiguration.usesPreviewData
                )
                .accessibilityIdentifier("CaptureCoachingOutcomeCreate")
            }
        }
        .accessibilityIdentifier("CaptureCoachingOutcomeReview")
    }
}

struct MobileCoachingSendFormView: View {
    @ObservedObject var client: MobileCoachingFormsClient
    let onComplete: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var selectedTemplateID = ""
    @State private var selectedRelationshipID = ""
    @State private var selectedSessionID = ""
    @State private var hasDueDate = false
    @State private var dueDate = Date().addingTimeInterval(3 * 86_400)

    private var templates: [MobileCoachingFormTemplate] {
        client.workspace?.templates.filter { $0.status == "PUBLISHED" } ?? []
    }
    private var relationships: [MobileCoachingFormRelationship] {
        client.workspace?.relationships ?? []
    }
    private var selectedTemplate: MobileCoachingFormTemplate? {
        templates.first { $0.id == selectedTemplateID }
    }
    private var selectedRelationship: MobileCoachingFormRelationship? {
        relationships.first { $0.id == selectedRelationshipID }
    }
    private var sessions: [MobileCoachingFormRelationship.Session] {
        selectedRelationship?.upcomingSessions ?? []
    }
    private var selectedSession: MobileCoachingFormRelationship.Session? {
        sessions.first { $0.id == selectedSessionID }
    }

    var body: some View {
        Form {
            Section {
                Picker("Form", selection: $selectedTemplateID) {
                    Text("Choose a form").tag("")
                    ForEach(templates) { template in
                        Text(template.title).tag(template.id)
                    }
                }
                .accessibilityIdentifier("CaptureCoachingSendFormTemplate")

                Picker("Client", selection: $selectedRelationshipID) {
                    Text("Choose a client").tag("")
                    ForEach(relationships) { relationship in
                        Text(relationship.client?.name ?? relationship.title).tag(relationship.id)
                    }
                }
                .accessibilityIdentifier("CaptureCoachingSendFormClient")

                if !sessions.isEmpty {
                    Picker("Session (optional)", selection: $selectedSessionID) {
                        Text("No specific Session").tag("")
                        ForEach(sessions) { session in
                            Text(sessionLabel(session)).tag(session.id)
                        }
                    }
                    .accessibilityIdentifier("CaptureCoachingSendFormSession")
                }
            } header: {
                Text("What to send")
            } footer: {
                Text("The exact published form version is frozen for this client. Later edits never change what they received.")
            }

            Section("Timing") {
                Toggle("Add a due date", isOn: $hasDueDate)
                if hasDueDate {
                    DatePicker("Due", selection: $dueDate, in: Date()..., displayedComponents: .date)
                }
            }

            if let template = selectedTemplate {
                Section("Preview") {
                    VStack(alignment: .leading, spacing: 7) {
                        Text(template.title)
                            .font(.headline)
                        Text(template.description ?? template.definition.description)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Text("\(template.definition.fields.count) question\(template.definition.fields.count == 1 ? "" : "s") · \(purposeLabel(template.purpose))")
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.purple)
                    }
                    .padding(.vertical, 4)
                }
            }

            if let error = client.errorMessage {
                Section {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                }
            }
        }
        .navigationTitle("Send a form")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .cancellationAction) {
                Button("Cancel") { dismiss() }
            }
            ToolbarItem(placement: .confirmationAction) {
                Button(client.isSending ? "Sending…" : "Send") {
                    guard let template = selectedTemplate,
                          let relationship = selectedRelationship else { return }
                    Task {
                        let sent = await client.send(
                            template: template,
                            relationship: relationship,
                            session: selectedSession,
                            dueAt: hasDueDate ? endOfDay(dueDate) : nil
                        )
                        if sent { onComplete() }
                    }
                }
                .disabled(
                    selectedTemplate == nil
                        || selectedRelationship == nil
                        || client.isSending
                        || CaptureLaunchConfiguration.usesPreviewData
                )
                .accessibilityIdentifier("CaptureCoachingSendFormConfirm")
            }
        }
        .onAppear {
            client.clearMessages()
            selectedTemplateID = selectedTemplateID.isEmpty ? templates.first?.id ?? "" : selectedTemplateID
            selectedRelationshipID = selectedRelationshipID.isEmpty ? relationships.first?.id ?? "" : selectedRelationshipID
        }
        .onChange(of: selectedRelationshipID) { _, _ in selectedSessionID = "" }
    }

    private func sessionLabel(_ session: MobileCoachingFormRelationship.Session) -> String {
        guard let date = coachingFormsDate(session.scheduledStart) else { return session.room?.title ?? "Scheduled Session" }
        return date.formatted(date: .abbreviated, time: .shortened)
    }

    private func endOfDay(_ date: Date) -> Date {
        Calendar.current.date(bySettingHour: 23, minute: 59, second: 59, of: date) ?? date
    }
}

private func purposeLabel(_ purpose: String) -> String {
    switch purpose {
    case "INTAKE": return "Intake"
    case "PRE_SESSION": return "Before a Session"
    case "POST_SESSION": return "After a Session"
    case "REFLECTION": return "Reflection"
    case "ASSESSMENT": return "Assessment"
    case "FEEDBACK": return "Feedback"
    default: return "Coaching form"
    }
}

private func coachingFormsDate(_ raw: String) -> Date? {
    let formatter = ISO8601DateFormatter()
    if let date = formatter.date(from: raw) { return date }
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter.date(from: raw)
}
