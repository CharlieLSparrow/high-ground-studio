import Combine
import Foundation
import SwiftUI

struct MobileCoachingPerson: Codable, Hashable {
    let id: String
    let name: String?
    let email: String?
}

struct MobileCoachingRunwayUser: Codable, Hashable {
    let id: String
    let email: String?
    let name: String?
    let isStaff: Bool?
    let isCoach: Bool
}

struct MobileCoachingBooking: Codable, Identifiable, Hashable {
    let id: String
    let coachingEngagementId: String?
    let title: String
    let status: String
    let scheduledStart: String
    let scheduledEnd: String
    let timezone: String
    let client: MobileCoachingPerson?
    let coach: MobileCoachingPerson?
    let callRoomId: String?
    let callRoomStatus: String?
    let clientInvitationDelivery: MobileCoachingInvitationDelivery?
    let clientEntryPath: String?
    let engagementPath: String?
    let liveSessionPath: String?
    let sessionWorkspacePath: String?

    var scheduledDate: Date? {
        coachingISO8601Date(scheduledStart)
    }

    var durationMinutes: Int {
        guard let start = coachingISO8601Date(scheduledStart),
              let end = coachingISO8601Date(scheduledEnd) else { return 60 }
        return max(15, Int(end.timeIntervalSince(start) / 60))
    }

    var scheduleLabel: String {
        guard let scheduledDate else { return scheduledStart }
        if Calendar.current.isDateInToday(scheduledDate) {
            return "Today at \(scheduledDate.formatted(date: .omitted, time: .shortened))"
        }
        if Calendar.current.isDateInTomorrow(scheduledDate) {
            return "Tomorrow at \(scheduledDate.formatted(date: .omitted, time: .shortened))"
        }
        return scheduledDate.formatted(date: .abbreviated, time: .shortened)
    }

    var clientLabel: String {
        client?.name?.nonemptyCoachingText
            ?? client?.email?.nonemptyCoachingText
            ?? "Invited client"
    }

    var coachLabel: String {
        coach?.name?.nonemptyCoachingText
            ?? coach?.email?.nonemptyCoachingText
            ?? "Your coach"
    }
}

struct MobileCoachingRunwayResponse: Codable {
    let ok: Bool
    let error: String?
    let user: MobileCoachingRunwayUser?
    let readiness: MobileCoachingRunwayReadiness?
    let upcomingBookings: [MobileCoachingBooking]?
}

struct MobileCoachingRunwayReadiness: Codable, Hashable {
    let invitationEmailConfigured: Bool
    let invitationEmailStatus: String?
}

struct MobileCoachingAppointmentResult: Codable, Hashable {
    let appointmentId: String?
    let bookingId: String?
    let callRoomId: String?
    let engagementId: String?
    let clientEntryPath: String?
    let engagementPath: String?
    let liveSessionPath: String?
    let sessionWorkspacePath: String?
    let clientUserId: String?
    let status: String?
    let nextAction: String?
}

private struct MobileCoachingActionResponse: Codable {
    let ok: Bool
    let error: String?
    let action: String?
    let result: MobileCoachingAppointmentResult?
}

struct MobileCoachingInvitationDelivery: Codable, Hashable {
    let id: String
    let channel: String
    let status: String
    let requestedAt: String
    let completedAt: String?
    let errorCode: String?
    let errorMessage: String?

    var wasSent: Bool { status == "SENT" }
}

private struct MobileCoachingInvitationResponse: Codable {
    let ok: Bool
    let error: String?
    let delivery: MobileCoachingInvitationDelivery?
}

struct MobileCoachingEngagementMember: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let role: String?
}

struct MobileCoachingEngagementWorkEntry: Codable, Identifiable, Hashable {
    let id: String
    let kind: String
    let title: String
    let body: String?
    let status: String?
    let owner: MobileCoachingEngagementMember?
    let visibility: String
    let dueAt: String?
    let canEdit: Bool
    let createdAt: String
    let updatedAt: String

    var isComplete: Bool {
        status == "DONE" || status == "ACHIEVED"
    }

    var kindLabel: String {
        switch kind {
        case "TASK": "Task"
        case "GOAL": "Goal"
        default: "Note"
        }
    }
}

struct MobileCoachingEngagementWorkspace: Codable, Hashable {
    let id: String
    let title: String
    let status: String
    let canWrite: Bool
    let currentUserId: String
    let members: [MobileCoachingEngagementMember]
    let entries: [MobileCoachingEngagementWorkEntry]
}

private struct MobileCoachingEngagementWorkspaceResponse: Codable {
    let ok: Bool
    let error: String?
    let engagement: MobileCoachingEngagementWorkspace?
    let entry: MobileCoachingEngagementWorkEntry?
}

@MainActor
final class MobileCoachingEngagementWorkspaceClient: ObservableObject {
    @Published private(set) var workspace: MobileCoachingEngagementWorkspace?
    @Published private(set) var isLoading = false
    @Published private(set) var isSaving = false
    @Published private(set) var errorMessage: String?

    let engagementID: String
    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )

    init(engagementID: String) {
        self.engagementID = engagementID
    }

    func load() async {
        guard !isLoading else { return }
        isLoading = true
        defer { isLoading = false }
        errorMessage = nil
        do {
            let (payload, response) = try await request(method: "GET")
            guard response.statusCode < 400, payload.ok, let engagement = payload.engagement else {
                throw coachingClientError(payload.error ?? "This coaching space could not load.")
            }
            workspace = engagement
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func create(
        kind: String,
        title: String,
        body: String,
        visibility: String,
        ownerUserID: String
    ) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }
        errorMessage = nil
        do {
            var requestBody: [String: Any] = [
                "clientRequestId": UUID().uuidString.lowercased(),
                "kind": kind,
                "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                "body": body.trimmingCharacters(in: .whitespacesAndNewlines),
            ]
            if kind == "NOTE" {
                requestBody["visibility"] = visibility
            } else {
                requestBody["ownerUserId"] = ownerUserID
            }
            let (payload, response) = try await request(method: "POST", body: requestBody)
            guard response.statusCode < 400, payload.ok, payload.entry != nil else {
                throw coachingClientError(payload.error ?? "That coaching item could not be saved.")
            }
            await load()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func update(
        entry: MobileCoachingEngagementWorkEntry,
        title: String,
        body: String,
        visibility: String,
        ownerUserID: String,
        status: String
    ) async -> Bool {
        guard !isSaving else { return false }
        isSaving = true
        defer { isSaving = false }
        errorMessage = nil
        do {
            var requestBody: [String: Any] = [
                "id": entry.id,
                "kind": entry.kind,
                "title": title.trimmingCharacters(in: .whitespacesAndNewlines),
                "body": body.trimmingCharacters(in: .whitespacesAndNewlines),
                "expectedUpdatedAt": entry.updatedAt,
            ]
            if entry.kind == "NOTE" {
                requestBody["visibility"] = visibility
            } else {
                requestBody["ownerUserId"] = ownerUserID
                requestBody["status"] = status
            }
            let (payload, response) = try await request(method: "PATCH", body: requestBody)
            guard response.statusCode < 400, payload.ok, payload.entry != nil else {
                throw coachingClientError(payload.error ?? "That coaching item could not be updated.")
            }
            await load()
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func request(
        method: String,
        body: [String: Any]? = nil
    ) async throws -> (MobileCoachingEngagementWorkspaceResponse, HTTPURLResponse) {
        guard let encodedID = engagementID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(baseURL)/api/coaching/engagements/\(encodedID)/work") else {
            throw coachingClientError("The configured Nest URL is not valid.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("application/json", forHTTPHeaderField: "Accept")
        if let body {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await AuthManager.shared.authenticatedData(for: request)
        return (
            try JSONDecoder().decode(MobileCoachingEngagementWorkspaceResponse.self, from: data),
            response
        )
    }
}

struct MobileCoachingAppointmentDraft: Equatable {
    var clientEmail = ""
    var clientName = ""
    var title = "Coaching session"
    var scheduledStart = Self.defaultStartDate()
    var durationMinutes = 60

    var normalizedEmail: String {
        clientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    }

    var isReady: Bool {
        let parts = normalizedEmail.split(separator: "@", omittingEmptySubsequences: false)
        return parts.count == 2
            && !parts[0].isEmpty
            && parts[1].contains(".")
            && !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private static func defaultStartDate() -> Date {
        let proposed = Date().addingTimeInterval(60 * 60)
        let calendar = Calendar.current
        let minutes = calendar.component(.minute, from: proposed)
        let roundedMinutes = minutes < 30 ? 30 - minutes : 60 - minutes
        return calendar.date(byAdding: .minute, value: roundedMinutes, to: proposed) ?? proposed
    }
}

@MainActor
final class MobileCoachingRunwayClient: ObservableObject {
    @Published private(set) var response: MobileCoachingRunwayResponse?
    @Published private(set) var latestHandoff: MobileCoachingAppointmentResult?
    @Published private(set) var isLoading = false
    @Published private(set) var isMutating = false
    @Published private(set) var status = "Coaching not loaded"
    @Published private(set) var errorMessage: String?
    @Published private(set) var invitationDeliveries: [String: MobileCoachingInvitationDelivery] = [:]

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )

    var isCoach: Bool { response?.user?.isCoach == true }
    var invitationEmailAvailable: Bool {
        response?.readiness?.invitationEmailConfigured == true
    }
    private var allBookings: [MobileCoachingBooking] { response?.upcomingBookings ?? [] }
    var upcomingBookings: [MobileCoachingBooking] {
        allBookings.filter {
            !["CANCELED", "COMPLETED", "NO_SHOW"].contains($0.status.uppercased())
        }
    }
    var isCoachingClient: Bool {
        guard let userID = response?.user?.id else { return false }
        return allBookings.contains { $0.client?.id == userID }
    }

    func loadPreview() {
        let start = Date().addingTimeInterval(35 * 60)
        response = MobileCoachingRunwayResponse(
            ok: true,
            error: nil,
            user: MobileCoachingRunwayUser(
                id: "preview-coach",
                email: "charlie@example.test",
                name: "Charlie Sparrow",
                isStaff: false,
                isCoach: true
            ),
            readiness: MobileCoachingRunwayReadiness(
                invitationEmailConfigured: true,
                invitationEmailStatus: "AVAILABLE"
            ),
            upcomingBookings: [
                MobileCoachingBooking(
                    id: "preview-booking",
                    coachingEngagementId: "preview-engagement",
                    title: "Coaching session",
                    status: "CONFIRMED",
                    scheduledStart: ISO8601DateFormatter().string(from: start),
                    scheduledEnd: ISO8601DateFormatter().string(from: start.addingTimeInterval(50 * 60)),
                    timezone: TimeZone.current.identifier,
                    client: MobileCoachingPerson(id: "preview-client", name: "Homer", email: "homer@example.test"),
                    coach: MobileCoachingPerson(id: "preview-coach", name: "Charlie Sparrow", email: "charlie@example.test"),
                    callRoomId: "room-preview-coaching-ready",
                    callRoomStatus: "PLANNED",
                    clientInvitationDelivery: nil,
                    clientEntryPath: "/sessions/room-preview-coaching-ready?mode=live",
                    engagementPath: "/coaching/engagements/preview-engagement",
                    liveSessionPath: "/sessions/room-preview-coaching-ready?mode=live",
                    sessionWorkspacePath: "/sessions/room-preview-coaching-ready"
                ),
            ]
        )
        status = "Coaching ready"
        errorMessage = nil
    }

    func load() async {
        guard !isLoading else { return }
        guard let url = URL(string: "\(baseURL)/api/coaching/runway") else {
            errorMessage = "The configured Nest URL is not valid."
            return
        }

        isLoading = true
        defer { isLoading = false }
        status = "Loading coaching"
        errorMessage = nil

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "GET"
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, httpResponse) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCoachingRunwayResponse.self, from: data)
            guard httpResponse.statusCode < 400, payload.ok else {
                throw coachingClientError(payload.error ?? "Quipsly coaching could not load.")
            }
            response = payload
            invitationDeliveries = Dictionary(
                uniqueKeysWithValues: upcomingBookings.compactMap { booking in
                    guard let roomID = booking.callRoomId,
                          let delivery = booking.clientInvitationDelivery else { return nil }
                    return (roomID, delivery)
                }
            )
            status = payload.user?.isCoach == true ? "Coaching ready" : "Coach setup available"
        } catch {
            status = "Coaching needs attention"
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func setupCoach() async -> Bool {
        guard !isMutating else { return false }
        let email = AuthManager.shared.userEmail?.nonemptyCoachingText
        let name = AuthManager.shared.userName?.nonemptyCoachingText ?? email
        guard let email else {
            errorMessage = "Verify your Quipsly account before setting up coaching."
            return false
        }

        isMutating = true
        defer { isMutating = false }
        status = "Setting up coaching"
        errorMessage = nil

        do {
            let payload = try await performAction([
                "action": "setup-coach-profile",
                "coachEmail": email,
                "coachName": name ?? email,
                "timezone": TimeZone.current.identifier,
                "defaultDurationMinutes": 60,
                "offeringTitle": "One-to-one coaching session",
                "offeringDescription": "A private coaching session with scheduling, consent-aware local recording, transcript review, shared goals, notes, and tasks.",
                "currency": "USD",
            ])
            guard payload.ok else {
                throw coachingClientError(payload.error ?? "Coach setup could not be completed.")
            }
            await load()
            status = "Coaching ready"
            return isCoach
        } catch {
            status = "Coach setup needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    func createAppointment(_ draft: MobileCoachingAppointmentDraft) async -> MobileCoachingAppointmentResult? {
        guard !isMutating else { return nil }
        guard draft.isReady else {
            errorMessage = "Enter the client's email, a short title, and a future session time."
            return nil
        }

        isMutating = true
        defer { isMutating = false }
        status = "Creating private coaching space"
        errorMessage = nil

        do {
            let payload = try await performAction([
                "action": "create-booking-room",
                "clientEmail": draft.normalizedEmail,
                "clientName": draft.clientName.trimmingCharacters(in: .whitespacesAndNewlines),
                "title": draft.title.trimmingCharacters(in: .whitespacesAndNewlines),
                "scheduledStart": ISO8601DateFormatter().string(from: draft.scheduledStart),
                "durationMinutes": draft.durationMinutes,
                "purpose": "COACHING",
                "paymentPolicy": "MANUAL",
                "timezone": TimeZone.current.identifier,
                "currency": "USD",
            ])
            guard payload.ok, let result = payload.result,
                  result.bookingId?.nonemptyCoachingText != nil,
                  result.callRoomId?.nonemptyCoachingText != nil,
                  result.clientEntryPath?.nonemptyCoachingText != nil else {
                throw coachingClientError(payload.error ?? "The coaching appointment was not created completely.")
            }
            latestHandoff = result
            await load()
            status = "Appointment ready to share"
            return result
        } catch {
            status = "Appointment needs attention"
            errorMessage = error.localizedDescription
            return nil
        }
    }

    @discardableResult
    func rescheduleBooking(
        _ booking: MobileCoachingBooking,
        scheduledStart: Date,
        durationMinutes: Int
    ) async -> Bool {
        guard !isMutating else { return false }
        guard scheduledStart > Date() else {
            errorMessage = "Choose a future time for this Session."
            return false
        }

        isMutating = true
        defer { isMutating = false }
        status = "Rescheduling Session"
        errorMessage = nil

        do {
            let payload = try await performAction([
                "action": "reschedule-booking",
                "bookingId": booking.id,
                "scheduledStart": ISO8601DateFormatter().string(from: scheduledStart),
                "durationMinutes": max(15, durationMinutes),
                "timezone": TimeZone.current.identifier,
                "reason": "Rescheduled from Quipsly Capture on iPhone.",
            ])
            guard payload.ok, payload.result?.bookingId == booking.id else {
                throw coachingClientError(payload.error ?? "This Session could not be rescheduled.")
            }
            await load()
            status = "Session rescheduled"
            return true
        } catch {
            status = "Rescheduling needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func cancelBooking(_ booking: MobileCoachingBooking) async -> Bool {
        guard !isMutating else { return false }
        isMutating = true
        defer { isMutating = false }
        status = "Canceling Session"
        errorMessage = nil

        do {
            let payload = try await performAction([
                "action": "cancel-booking",
                "bookingId": booking.id,
                "reason": "Canceled from Quipsly Capture on iPhone.",
            ])
            guard payload.ok, payload.result?.bookingId == booking.id else {
                throw coachingClientError(payload.error ?? "This Session could not be canceled.")
            }
            if latestHandoff?.bookingId == booking.id {
                latestHandoff = nil
            }
            await load()
            status = "Session canceled"
            return true
        } catch {
            status = "Cancellation needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func sendInvitationEmail(
        roomID: String,
        recipientEmail: String,
        recipientName: String?
    ) async -> Bool {
        guard !isMutating else { return false }
        let normalizedEmail = recipientEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard !roomID.isEmpty, normalizedEmail.contains("@") else {
            errorMessage = "This appointment does not have a verified client email to invite."
            return false
        }
        guard let encodedRoomID = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
              let url = URL(string: "\(baseURL)/api/sessions/\(encodedRoomID)/invitations") else {
            errorMessage = "The configured Nest URL is not valid."
            return false
        }

        isMutating = true
        defer { isMutating = false }
        status = "Sending invitation email"
        errorMessage = nil
        let requestID = pendingInvitationRequestID(for: roomID, recipientEmail: normalizedEmail)

        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "email": normalizedEmail,
                "displayName": recipientName?.trimmingCharacters(in: .whitespacesAndNewlines) ?? "",
                "role": "CLIENT",
                "expiresInHours": 24 * 30,
                "delivery": "EMAIL",
                "requestId": requestID.uuidString.lowercased(),
            ])
            let (data, httpResponse) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCoachingInvitationResponse.self, from: data)

            // A receipt or a client error is definitive. A transport failure or
            // receipt-less server error can happen after provider acceptance, so
            // retain the same identity across retry and process death.
            if payload.delivery != nil || (400..<500).contains(httpResponse.statusCode) {
                clearPendingInvitationRequestID(for: roomID, recipientEmail: normalizedEmail)
            }
            if let delivery = payload.delivery {
                invitationDeliveries[roomID] = delivery
            }
            guard httpResponse.statusCode < 400, payload.ok, payload.delivery?.wasSent == true else {
                throw coachingClientError(
                    payload.delivery?.errorMessage
                        ?? payload.error
                        ?? "The invitation email was not sent. Share the private link instead or retry."
                )
            }
            status = "Invitation email sent"
            return true
        } catch {
            status = "Invitation needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func pendingInvitationRequestID(for roomID: String, recipientEmail: String) -> UUID {
        let key = invitationRequestDefaultsKey(for: roomID, recipientEmail: recipientEmail)
        if let raw = UserDefaults.standard.string(forKey: key), let existing = UUID(uuidString: raw) {
            return existing
        }
        let created = UUID()
        UserDefaults.standard.set(created.uuidString.lowercased(), forKey: key)
        return created
    }

    private func clearPendingInvitationRequestID(for roomID: String, recipientEmail: String) {
        UserDefaults.standard.removeObject(
            forKey: invitationRequestDefaultsKey(for: roomID, recipientEmail: recipientEmail)
        )
    }

    private func invitationRequestDefaultsKey(for roomID: String, recipientEmail: String) -> String {
        "quipsly.coaching.invitation-request.\(roomID).\(recipientEmail)"
    }

    func absoluteURL(for path: String?) -> URL? {
        guard let path = path?.nonemptyCoachingText else { return nil }
        if let absolute = URL(string: path), absolute.scheme != nil { return absolute }
        guard var components = URLComponents(string: baseURL) else { return nil }
        let split = path.split(separator: "?", maxSplits: 1, omittingEmptySubsequences: false)
        components.path = String(split[0])
        components.query = split.count > 1 ? String(split[1]) : nil
        return components.url
    }

    func nativeURL(for roomID: String?) -> URL? {
        guard let roomID = roomID?.nonemptyCoachingText,
              let encoded = roomID.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) else { return nil }
        return URL(string: "quipsly://session/\(encoded)?mode=live")
    }

    private func performAction(_ body: [String: Any]) async throws -> MobileCoachingActionResponse {
        guard let url = URL(string: "\(baseURL)/api/coaching/runway") else {
            throw coachingClientError("The configured Nest URL is not valid.")
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)
        let (data, httpResponse) = try await AuthManager.shared.authenticatedData(for: request)
        let payload = try JSONDecoder().decode(MobileCoachingActionResponse.self, from: data)
        guard httpResponse.statusCode < 400 else {
            throw coachingClientError(payload.error ?? "Quipsly coaching returned HTTP \(httpResponse.statusCode).")
        }
        return payload
    }
}

struct CaptureCoachingHomeCard: View {
    let isCoach: Bool
    let isClient: Bool
    let upcomingCount: Int
    let isLoading: Bool

    var body: some View {
        HStack(spacing: 14) {
            Image(systemName: "person.2.wave.2.fill")
                .font(.title2)
                .foregroundStyle(.teal)
                .frame(width: 38, height: 38)
                .background(.teal.opacity(0.1), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            VStack(alignment: .leading, spacing: 4) {
                Text("Coaching")
                    .font(.headline)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.leading)
            }
            Spacer(minLength: 8)
            if isLoading {
                ProgressView().controlSize(.small)
            } else {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(.tertiary)
            }
        }
        .contentShape(Rectangle())
        .captureCard()
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Coaching")
        .accessibilityValue(detail)
        .accessibilityHint("Opens phone-only coach setup, scheduling, client invitations, and appointments.")
    }

    private var detail: String {
        if !isCoach && isClient {
            if upcomingCount == 0 { return "Open your private coaching space" }
            return "Your next coaching Session is ready"
        }
        if !isCoach { return "Set up coaching and invite your first client" }
        if upcomingCount == 0 { return "Schedule a client from this iPhone" }
        return "\(upcomingCount) upcoming appointment\(upcomingCount == 1 ? "" : "s")"
    }
}

struct CaptureCoachingHomeView: View {
    @ObservedObject var model: CaptureExperienceModel
    @Binding var visibleTab: CaptureRootTab
    @State private var showsNewAppointment = false
    @State private var bookingToReschedule: MobileCoachingBooking?
    @State private var bookingToCancel: MobileCoachingBooking?
    @State private var bookingToRequestChange: MobileCoachingBooking?

    private var client: MobileCoachingRunwayClient { model.coachingRunwayClient }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if client.isCoach {
                    createCard
                } else if client.isCoachingClient {
                    clientWelcomeCard
                } else {
                    coachSetupCard
                }

                if let handoff = client.latestHandoff {
                    handoffCard(handoff)
                }

                if let error = client.errorMessage {
                    Label(error, systemImage: "exclamationmark.triangle.fill")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.orange)
                        .captureCard()
                        .accessibilityIdentifier("CaptureCoachingError")
                }

                upcomingSection
                relationshipsSection
            }
            .padding(.horizontal, 18)
            .padding(.bottom, 96)
        }
        .background(CaptureCanvas())
        .navigationTitle("Coaching")
        .navigationBarTitleDisplayMode(.inline)
        .refreshable {
            guard !model.usesPreviewData else { return }
            async let coachingLoad: Void = client.load()
            async let sessionLoad = model.sessionClient.load()
            _ = await (coachingLoad, sessionLoad)
        }
        .sheet(isPresented: $showsNewAppointment) {
            NewMobileCoachingAppointmentSheet(
                client: client,
                isPresented: $showsNewAppointment,
                onCreated: { result in
                    if let roomID = result.callRoomId {
                        await refreshAndOpen(roomID: roomID, navigate: false)
                    }
                }
            )
            .presentationDetents([.large])
        }
        .sheet(item: $bookingToReschedule) { booking in
            MobileCoachingRescheduleSheet(client: client, booking: booking)
                .presentationDetents([.medium])
        }
        .sheet(item: $bookingToRequestChange) { booking in
            if let engagement = engagement(for: booking) {
                MobileCoachingScheduleRequestSheet(
                    engagement: engagement,
                    booking: booking,
                    previewOnly: model.usesPreviewData
                )
                .presentationDetents([.medium, .large])
            } else {
                ContentUnavailableView(
                    "Coaching conversation unavailable",
                    systemImage: "bubble.left.and.exclamationmark.bubble.right",
                    description: Text("Open the client space below and message your coach there.")
                )
            }
        }
        .alert(
            "Cancel this Session?",
            isPresented: Binding(
                get: { bookingToCancel != nil },
                set: { if !$0 { bookingToCancel = nil } }
            ),
            presenting: bookingToCancel
        ) { booking in
            Button("Keep Session", role: .cancel) {
                bookingToCancel = nil
            }
            Button("Cancel Session", role: .destructive) {
                bookingToCancel = nil
                Task { _ = await client.cancelBooking(booking) }
            }
        } message: { booking in
            Text("Cancel \(booking.scheduleLabel)? The client space and its existing work stay available.")
        }
        .accessibilityIdentifier("CaptureCoachingHome")
    }

    private var header: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label(
                client.isCoach ? "Coach from this iPhone" : "Your coaching on this iPhone",
                systemImage: "person.2.wave.2.fill"
            )
                .font(.title2.weight(.black))
                .foregroundStyle(.teal)
            Text(
                client.isCoach
                    ? "Schedule, invite, call, record locally, review the transcript, and turn the conversation into shared notes, goals, and tasks without requiring a desktop."
                    : "Join your Session, grant recording consent, keep a protected local master, and continue with the notes, goals, tasks, and recordings your coach shared with you."
            )
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .captureCard()
    }

    private var clientWelcomeCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Your private client space", systemImage: "lock.shield.fill")
                .font(.headline)
                .foregroundStyle(.teal)
            Text("Open the upcoming Session below to join or record. Client spaces keep only the notes, goals, tasks, and recordings released to you; private coach material stays private.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
        }
        .captureCard()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("CaptureCoachingClientWelcome")
    }

    private var coachSetupCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Set up your coaching space")
                .font(.headline)
            Text("Quipsly will create your private coach profile and a flexible one-to-one offering. No payment account or public profile is required.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button {
                Task { _ = await client.setupCoach() }
            } label: {
                Label(client.isMutating ? "Setting up…" : "Set up coaching", systemImage: "sparkles")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(client.isMutating || model.usesPreviewData)
            .accessibilityIdentifier("CaptureCoachingSetupButton")
        }
        .captureCard()
    }

    private var createCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("New client or session")
                        .font(.headline)
                    Text("Choose who and when. Quipsly prepares the private Session and invitation.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 12)
                Image(systemName: "person.badge.plus")
                    .font(.title2)
                    .foregroundStyle(.teal)
            }
            Button {
                showsNewAppointment = true
            } label: {
                Label("Schedule coaching", systemImage: "calendar.badge.plus")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(client.isMutating || model.usesPreviewData)
            .accessibilityIdentifier("CaptureCoachingNewAppointmentButton")
        }
        .captureCard()
    }

    @ViewBuilder
    private func handoffCard(_ handoff: MobileCoachingAppointmentResult) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Label("Appointment ready", systemImage: "checkmark.circle.fill")
                .font(.headline)
                .foregroundStyle(.green)
            if let roomID = handoff.callRoomId,
               client.invitationDeliveries[roomID]?.wasSent == true {
                Text("Invitation sent. Open the Session when you're ready.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            } else {
                Text("The Session is ready. Share the invitation below if email delivery needs attention.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            if let booking = booking(for: handoff.callRoomId) {
                VStack(alignment: .leading, spacing: 3) {
                    Text(booking.title)
                        .font(.headline)
                    Text(booking.clientLabel)
                        .font(.subheadline.weight(.semibold))
                    Text(booking.scheduleLabel)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                if let roomID = handoff.callRoomId {
                    HStack {
                        Button {
                            Task { await refreshAndOpen(roomID: roomID, navigate: true) }
                        } label: {
                            Label("Open Session", systemImage: "arrow.right.circle.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("CaptureCoachingOpen_Handoff_\(roomID)")
                        appointmentManagementMenu(for: booking)
                    }
                }
                invitationActions(for: booking)
            } else {
                coachingShareLink(
                    title: "Join my Quipsly coaching session",
                    roomID: handoff.callRoomId,
                    entryPath: handoff.clientEntryPath,
                    recipientEmail: booking(for: handoff.callRoomId)?.client?.email
                )
            }
        }
        .captureCard()
        .accessibilityElement(children: .contain)
    }

    private var upcomingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Upcoming")
                    .font(.title3.weight(.bold))
                Spacer()
                if client.isLoading { ProgressView().controlSize(.small) }
            }

            if displayedUpcomingBookings.isEmpty {
                Text(
                    client.latestHandoff != nil
                        ? "This new appointment is ready above. It will appear here after you leave or refresh."
                        : client.isCoach
                        ? "No upcoming coaching appointments yet."
                        : client.isCoachingClient
                            ? "No upcoming Sessions. Your existing client spaces and shared follow-through remain available below."
                            : "Set up coaching to schedule your first client."
                )
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    .captureCard()
            } else {
                ForEach(displayedUpcomingBookings) { booking in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(booking.title)
                                    .font(.headline)
                                Text(client.isCoach ? booking.clientLabel : booking.coachLabel)
                                    .font(.subheadline.weight(.semibold))
                                    .accessibilityIdentifier("CaptureCoachingBookingParticipant_\(booking.id)")
                                Text(booking.scheduleLabel)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 8)
                            Text(booking.status.replacingOccurrences(of: "_", with: " ").capitalized)
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.teal)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 5)
                                .background(.teal.opacity(0.1), in: Capsule())
                        }
                        if client.isCoach {
                            HStack {
                                if let roomID = booking.callRoomId {
                                    Button {
                                        Task { await refreshAndOpen(roomID: roomID, navigate: true) }
                                    } label: {
                                        Label("Open Session", systemImage: "arrow.right.circle.fill")
                                            .frame(maxWidth: .infinity)
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .accessibilityIdentifier("CaptureCoachingOpen_\(booking.id)")
                                }
                                appointmentManagementMenu(for: booking)
                            }
                        } else {
                            if let roomID = booking.callRoomId {
                                Button {
                                    Task { await refreshAndOpen(roomID: roomID, navigate: true) }
                                } label: {
                                    Label("Open Session", systemImage: "arrow.right.circle.fill")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.borderedProminent)
                                .accessibilityIdentifier("CaptureCoachingOpen_\(booking.id)")
                            }
                            if engagement(for: booking) != nil {
                                Button {
                                    bookingToRequestChange = booking
                                } label: {
                                    Label("Request a change", systemImage: "calendar.badge.clock")
                                        .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                                .disabled(client.isMutating || model.usesPreviewData)
                                .accessibilityHint("Messages your coach without changing the appointment until they confirm it.")
                                .accessibilityIdentifier("CaptureCoachingRequestChange_\(booking.id)")
                            }
                        }
                        if client.isCoach {
                            invitationActions(for: booking)
                        }
                    }
                    .captureCard()
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("CaptureCoachingBooking_\(booking.id)")
                }
            }
        }
    }

    private func appointmentManagementMenu(for booking: MobileCoachingBooking) -> some View {
        Menu {
            Button {
                bookingToReschedule = booking
            } label: {
                Label("Reschedule", systemImage: "calendar.badge.clock")
            }
            Button(role: .destructive) {
                bookingToCancel = booking
            } label: {
                Label("Cancel Session", systemImage: "calendar.badge.minus")
            }
        } label: {
            Label("Manage", systemImage: "ellipsis.circle")
        }
        .buttonStyle(.bordered)
        .disabled(client.isMutating || model.usesPreviewData)
        .accessibilityIdentifier("CaptureCoachingManage_\(booking.id)")
    }

    private var displayedUpcomingBookings: [MobileCoachingBooking] {
        guard let latestRoomID = client.latestHandoff?.callRoomId else {
            return client.upcomingBookings
        }
        return client.upcomingBookings.filter { $0.callRoomId != latestRoomID }
    }

    @ViewBuilder
    private func invitationActions(for booking: MobileCoachingBooking) -> some View {
        if let roomID = booking.callRoomId,
           let recipientEmail = booking.client?.email?.nonemptyCoachingText {
            VStack(alignment: .leading, spacing: 8) {
                if client.invitationEmailAvailable {
                    Button {
                        Task {
                            _ = await client.sendInvitationEmail(
                                roomID: roomID,
                                recipientEmail: recipientEmail,
                                recipientName: booking.client?.name
                            )
                        }
                    } label: {
                        Label(
                            client.invitationDeliveries[roomID]?.wasSent == true
                                ? "Resend invite"
                                : "Send invite",
                            systemImage: "envelope.badge"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(client.isMutating || model.usesPreviewData)
                    .accessibilityHint("Sends this Session invitation to the client's email.")
                    .accessibilityIdentifier("CaptureCoachingSendInvite_\(booking.id)")

                    if let delivery = client.invitationDeliveries[roomID] {
                        Label(
                            delivery.wasSent
                                ? "Sent to \(recipientEmail)."
                                : delivery.errorMessage ?? "Email was not sent. Retry or share the link.",
                            systemImage: delivery.wasSent ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                        )
                        .font(.caption)
                        .foregroundStyle(delivery.wasSent ? .green : .orange)
                        .accessibilityIdentifier("CaptureCoachingInviteDelivery_\(booking.id)")
                    }
                } else {
                    Text("Share the private invitation below. Your client can open it on a phone, tablet, or desktop.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .accessibilityIdentifier("CaptureCoachingInvitationShareOnly_\(booking.id)")
                }

                coachingShareLink(
                    title: booking.title,
                    roomID: booking.callRoomId,
                    entryPath: booking.clientEntryPath,
                    recipientEmail: recipientEmail
                )
            }
        } else {
            coachingShareLink(
                title: booking.title,
                roomID: booking.callRoomId,
                entryPath: booking.clientEntryPath,
                recipientEmail: booking.client?.email
            )
        }
    }

    private func booking(for roomID: String?) -> MobileCoachingBooking? {
        guard let roomID else { return nil }
        return client.upcomingBookings.first { $0.callRoomId == roomID }
    }

    private func engagement(for booking: MobileCoachingBooking) -> MobileCaptureCoachingEngagement? {
        guard let engagementID = booking.coachingEngagementId else { return nil }
        return model.coachingEngagements.first { $0.id == engagementID }
    }

    private var relationshipsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(client.isCoach ? "Client spaces" : "Coaching spaces")
                .font(.title3.weight(.bold))
            if model.coachingEngagements.isEmpty {
                Text("A private client space appears here after the first appointment. It carries shared notes, goals, tasks, session history, and conversation continuity.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .captureCard()
            } else {
                ForEach(model.coachingEngagements) { engagement in
                    NavigationLink {
                        CaptureCoachingEngagementWorkspaceView(
                            engagement: engagement,
                            sessions: model.sessions.filter {
                                $0.coachingEngagementId == engagement.id
                            },
                            previewOnly: model.usesPreviewData,
                            onOpenSession: { roomID in
                                await refreshAndOpen(roomID: roomID, navigate: true)
                            }
                        )
                    } label: {
                        HStack(alignment: .center, spacing: 12) {
                            VStack(alignment: .leading, spacing: 5) {
                                Label(engagement.title, systemImage: "person.2.fill")
                                    .font(.headline)
                                if !engagement.participantLine.isEmpty {
                                    Text(engagement.participantLine)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                Text("Open shared notes, goals, tasks, conversation, and Sessions")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer()
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.bold))
                                .foregroundStyle(.secondary)
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .captureCard()
                    .accessibilityElement(children: .combine)
                    .accessibilityLabel("Open client space, \(engagement.title)")
                    .accessibilityHint("Open this relationship's conversation, shared notes, goals, tasks, and Sessions.")
                    .accessibilityIdentifier("CaptureCoachingRelationship_\(engagement.id)")
                }
            }
        }
    }

    @ViewBuilder
    private func coachingShareLink(
        title: String,
        roomID: String?,
        entryPath: String?,
        recipientEmail: String?
    ) -> some View {
        if let entryURL = client.absoluteURL(for: entryPath) {
            let nativeURL = client.nativeURL(for: roomID)
            let invitedIdentity = recipientEmail?.nonemptyCoachingText ?? "the invited email"
            ShareLink(
                item: entryURL,
                subject: Text(title),
                message: Text(
                    nativeURL.map {
                        "Join this private Quipsly Session. Open the link on your phone, tablet, or desktop, then sign in as \(invitedIdentity). Continue in your browser or choose Quipsly Capture on iPhone: \($0.absoluteString)"
                    } ?? "Join this private Quipsly Session. Open the link on your phone, tablet, or desktop, then sign in as \(invitedIdentity)."
                )
            ) {
                Label("Share invite", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.bordered)
            .accessibilityLabel("Share coaching invitation")
            .accessibilityIdentifier("CaptureCoachingShareInvite")
        }
    }

    @MainActor
    private func refreshAndOpen(roomID: String, navigate: Bool) async {
        let outcome = await model.sessionClient.load(authoritativeSessionID: roomID)
        guard outcome == .loaded,
              let session = model.sessions.first(where: { $0.callRoomId == roomID || $0.id == roomID }) else {
            model.errorMessage = model.sessionClient.errorMessage
                ?? "The appointment exists, but this iPhone could not verify the exact Session yet. Pull to refresh and try again."
            return
        }
        model.select(session)
        if navigate { visibleTab = .record }
    }
}

private enum MobileCoachingScheduleRequestKind: String, CaseIterable, Identifiable {
    case reschedule = "New time"
    case cancel = "Cancel"

    var id: String { rawValue }
}

private struct MobileCoachingScheduleRequestSheet: View {
    @Environment(\.dismiss) private var dismiss
    let engagement: MobileCaptureCoachingEngagement
    let booking: MobileCoachingBooking
    let previewOnly: Bool
    @StateObject private var conversation: MobileEpisodeChatClient
    @State private var kind: MobileCoachingScheduleRequestKind = .reschedule
    @State private var preferredStart: Date
    @State private var note = ""
    @State private var wasSent = false

    init(
        engagement: MobileCaptureCoachingEngagement,
        booking: MobileCoachingBooking,
        previewOnly: Bool
    ) {
        self.engagement = engagement
        self.booking = booking
        self.previewOnly = previewOnly
        _conversation = StateObject(
            wrappedValue: MobileEpisodeChatClient(scope: .engagement)
        )
        _preferredStart = State(
            initialValue: max(
                booking.scheduledDate ?? Date().addingTimeInterval(24 * 60 * 60),
                Date().addingTimeInterval(30 * 60)
            )
        )
    }

    var body: some View {
        NavigationStack {
            Form {
                if wasSent {
                    Section {
                        Label("Request sent", systemImage: "checkmark.circle.fill")
                            .font(.headline)
                            .foregroundStyle(.green)
                        Text("Your appointment has not changed yet. Your coach will confirm the next step in this private coaching conversation.")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    .accessibilityIdentifier("CaptureCoachingChangeRequestSent")
                } else {
                    Section {
                        Text(booking.title)
                            .font(.headline)
                        LabeledContent("Coach", value: booking.coachLabel)
                        LabeledContent("Current time", value: booking.scheduleLabel)
                    }

                    Section("What needs to change?") {
                        Picker("Request", selection: $kind) {
                            ForEach(MobileCoachingScheduleRequestKind.allCases) { requestKind in
                                Text(requestKind.rawValue).tag(requestKind)
                            }
                        }
                        .pickerStyle(.segmented)
                        .accessibilityIdentifier("CaptureCoachingChangeRequestKind")

                        if kind == .reschedule {
                            DatePicker(
                                "Preferred time",
                                selection: $preferredStart,
                                in: Date().addingTimeInterval(5 * 60)...,
                                displayedComponents: [.date, .hourAndMinute]
                            )
                            .accessibilityIdentifier("CaptureCoachingChangeRequestTime")
                        }

                        TextField(
                            kind == .reschedule
                                ? "Anything your coach should know? (optional)"
                                : "Reason (optional)",
                            text: $note,
                            axis: .vertical
                        )
                        .lineLimit(2...5)
                        .accessibilityIdentifier("CaptureCoachingChangeRequestNote")
                    }

                    Section {
                        Text("This sends a private message. It does not move or cancel the Session until your coach confirms the change.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }

                    if conversation.isLoading {
                        Section { ProgressView("Opening private conversation…") }
                    }
                    if let error = conversation.errorMessage {
                        Section { MobileCoachingInlineWarning(text: error) }
                    }
                }
            }
            .navigationTitle("Request a change")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(wasSent ? "Done" : "Cancel") { dismiss() }
                }
                if !wasSent {
                    ToolbarItem(placement: .confirmationAction) {
                        Button(conversation.isSending ? "Sending…" : "Send") {
                            Task {
                                if await conversation.send(
                                    engagement: engagement,
                                    body: requestMessage
                                ) {
                                    wasSent = true
                                }
                            }
                        }
                        .disabled(
                            previewOnly
                                || conversation.isLoading
                                || conversation.isSending
                                || !conversation.canEdit
                        )
                        .accessibilityIdentifier("CaptureCoachingSendChangeRequest")
                    }
                }
            }
        }
        .task(id: engagement.id) {
            guard !previewOnly else { return }
            await conversation.load(engagement: engagement)
        }
        .accessibilityIdentifier("CaptureCoachingChangeRequestSheet")
    }

    private var requestMessage: String {
        let trimmedNote = note.trimmingCharacters(in: .whitespacesAndNewlines)
        let request: String
        switch kind {
        case .reschedule:
            request = "Could we move \(booking.title) from \(booking.scheduleLabel) to \(preferredStart.formatted(date: .abbreviated, time: .shortened))?"
        case .cancel:
            request = "I need to cancel \(booking.title) scheduled for \(booking.scheduleLabel)."
        }
        return trimmedNote.isEmpty ? request : "\(request) \(trimmedNote)"
    }
}

private enum MobileCoachingWorkFilter: String, CaseIterable, Identifiable {
    case all = "All"
    case notes = "Notes"
    case tasks = "Tasks"
    case goals = "Goals"

    var id: String { rawValue }

    func includes(_ entry: MobileCoachingEngagementWorkEntry) -> Bool {
        switch self {
        case .all: true
        case .notes: entry.kind == "NOTE"
        case .tasks: entry.kind == "TASK"
        case .goals: entry.kind == "GOAL"
        }
    }
}

private struct MobileCoachingInlineWarning: View {
    let text: String

    var body: some View {
        Label(text, systemImage: "exclamationmark.triangle.fill")
            .font(.caption.weight(.semibold))
            .foregroundStyle(.orange)
            .frame(maxWidth: .infinity, alignment: .leading)
            .captureCard()
    }
}

private struct CaptureCoachingEngagementWorkspaceView: View {
    let engagement: MobileCaptureCoachingEngagement
    let sessions: [MobileCaptureSession]
    let previewOnly: Bool
    let onOpenSession: (String) async -> Void
    @StateObject private var client: MobileCoachingEngagementWorkspaceClient
    @StateObject private var conversation: MobileEpisodeChatClient
    @State private var filter: MobileCoachingWorkFilter = .all
    @State private var isPresentingNewWork = false
    @State private var editingEntry: MobileCoachingEngagementWorkEntry?

    init(
        engagement: MobileCaptureCoachingEngagement,
        sessions: [MobileCaptureSession],
        previewOnly: Bool,
        onOpenSession: @escaping (String) async -> Void
    ) {
        self.engagement = engagement
        self.sessions = sessions
        self.previewOnly = previewOnly
        self.onOpenSession = onOpenSession
        _client = StateObject(
            wrappedValue: MobileCoachingEngagementWorkspaceClient(
                engagementID: engagement.id
            )
        )
        _conversation = StateObject(
            wrappedValue: MobileEpisodeChatClient(scope: .engagement)
        )
    }

    private var entries: [MobileCoachingEngagementWorkEntry] {
        (client.workspace?.entries ?? []).filter(filter.includes)
    }

    var body: some View {
        ScrollView {
            LazyVStack(alignment: .leading, spacing: 14) {
                workspaceHeader

                MobileEngagementChatCard(
                    client: conversation,
                    engagement: engagement,
                    previewOnly: previewOnly
                )

                sessionContinuity

                Picker("Show coaching work", selection: $filter) {
                    ForEach(MobileCoachingWorkFilter.allCases) { value in
                        Text(value.rawValue).tag(value)
                    }
                }
                .pickerStyle(.segmented)
                .accessibilityIdentifier("CaptureCoachingWorkFilter")

                if client.isLoading, client.workspace == nil {
                    ProgressView("Loading client space…")
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.vertical, 40)
                } else if entries.isEmpty {
                    ContentUnavailableView {
                        Label("Nothing here yet", systemImage: "checklist")
                    } description: {
                        Text(
                            client.workspace?.canWrite == true
                                ? "Add the first \(filter.rawValue.lowercased()) item for this coaching relationship."
                                : "Shared work will appear here when it is available to you."
                        )
                    }
                    .captureCard()
                } else {
                    ForEach(entries) { entry in
                        coachingWorkCard(entry)
                    }
                }

                if let error = client.errorMessage {
                    MobileCoachingInlineWarning(text: error)
                        .accessibilityIdentifier("CaptureCoachingWorkspaceError")
                }
            }
            .padding(20)
        }
        .background(Color.primary.opacity(0.035).ignoresSafeArea())
        .navigationTitle(client.workspace?.title ?? engagement.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            if client.workspace?.canWrite == true {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        isPresentingNewWork = true
                    } label: {
                        Label("Add coaching work", systemImage: "plus")
                    }
                    .accessibilityIdentifier("CaptureCoachingAddWork")
                }
            }
        }
        .refreshable {
            async let workLoad: Void = client.load()
            async let conversationLoad: Void = conversation.load(
                engagement: engagement,
                forceRefresh: true
            )
            _ = await (workLoad, conversationLoad)
        }
        .task(id: "\(engagement.id)|\(previewOnly)") {
            if previewOnly {
                await client.load()
            } else {
                async let workLoad: Void = client.load()
                async let conversationLoad: Void = conversation.load(
                    engagement: engagement
                )
                _ = await (workLoad, conversationLoad)
                conversation.startPolling(engagement: engagement)
            }
        }
        .onDisappear { conversation.stopPolling() }
        .sheet(isPresented: $isPresentingNewWork) {
            if let workspace = client.workspace {
                MobileCoachingWorkEditorSheet(
                    client: client,
                    workspace: workspace,
                    entry: nil
                )
            }
        }
        .sheet(item: $editingEntry) { entry in
            if let workspace = client.workspace {
                MobileCoachingWorkEditorSheet(
                    client: client,
                    workspace: workspace,
                    entry: entry
                )
            }
        }
        .accessibilityIdentifier("CaptureCoachingEngagementWorkspace")
    }

    private var workspaceHeader: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Private client space", systemImage: "lock.shield.fill")
                .font(.headline)
                .foregroundStyle(.teal)
            Text(engagement.participantLine)
                .font(.subheadline.weight(.semibold))
            Text("Shared notes, tasks, and goals are visible to this relationship. A private note is visible only to its author—even to another coach or Quipsly staff.")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .captureCard()
        .accessibilityIdentifier("CaptureCoachingWorkspacePrivacy")
    }

    @ViewBuilder
    private var sessionContinuity: some View {
        VStack(alignment: .leading, spacing: 10) {
            Label("Sessions", systemImage: "calendar.badge.clock")
                .font(.headline)
            if sessions.isEmpty {
                Text("Scheduled and completed Sessions for this coaching relationship will stay here.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                ForEach(sessions.sorted(by: sessionComesFirst)) { session in
                    VStack(alignment: .leading, spacing: 8) {
                        Text(session.displayTitle)
                            .font(.subheadline.weight(.bold))
                        Text(sessionContinuityLabel(session))
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button {
                            Task { await onOpenSession(session.callRoomId) }
                        } label: {
                            Label("Open Session", systemImage: "arrow.right.circle.fill")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(previewOnly)
                        .accessibilityIdentifier("CaptureCoachingContinuityOpen_\(session.id)")
                    }
                    .padding(.vertical, 4)
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("CaptureCoachingContinuitySession_\(session.id)")
                }
            }
        }
        .captureCard()
        .accessibilityIdentifier("CaptureCoachingSessionContinuity")
    }

    private func sessionComesFirst(
        _ left: MobileCaptureSession,
        _ right: MobileCaptureSession
    ) -> Bool {
        let leftDate = left.scheduledStart.flatMap(coachingISO8601Date)
        let rightDate = right.scheduledStart.flatMap(coachingISO8601Date)
        return switch (leftDate, rightDate) {
        case let (left?, right?): left > right
        case (.some, .none): true
        case (.none, .some): false
        case (.none, .none): left.title < right.title
        }
    }

    private func sessionContinuityLabel(_ session: MobileCaptureSession) -> String {
        var parts: [String] = []
        if let start = session.scheduledStart.flatMap(coachingISO8601Date) {
            parts.append(start.formatted(date: .abbreviated, time: .shortened))
        }
        if let status = session.status?.nonemptyCoachingText {
            parts.append(status.replacingOccurrences(of: "_", with: " ").capitalized)
        }
        if session.recordingCount > 0 {
            parts.append("\(session.recordingCount) recording\(session.recordingCount == 1 ? "" : "s")")
        }
        return parts.isEmpty ? "Private coaching Session" : parts.joined(separator: " · ")
    }

    private func coachingWorkCard(_ entry: MobileCoachingEngagementWorkEntry) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack(alignment: .top) {
                Label(entry.kindLabel, systemImage: icon(for: entry))
                    .font(.caption.weight(.bold))
                    .foregroundStyle(entry.visibility == "PRIVATE" ? .orange : .teal)
                Spacer()
            }

            Text(entry.title)
                .font(.headline)
                .strikethrough(entry.isComplete)
            if entry.visibility == "PRIVATE" {
                HStack(spacing: 6) {
                    Image(systemName: "lock.fill")
                        .accessibilityHidden(true)
                    Text("Only you can read this note")
                }
                .font(.caption.weight(.bold))
                .foregroundStyle(.orange)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 10)
                .padding(.vertical, 7)
                .background(.orange.opacity(0.12), in: Capsule())
            }
            if let body = entry.body?.nonemptyCoachingText, body != entry.title {
                Text(body)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            if let owner = entry.owner {
                Text("For \(owner.label)")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
            }

            if entry.canEdit {
                HStack(spacing: 10) {
                    Button("Edit") { editingEntry = entry }
                        .buttonStyle(.bordered)
                        .accessibilityIdentifier("CaptureCoachingEdit_\(entry.id)")
                    if entry.kind == "TASK" || entry.kind == "GOAL" {
                        Button(entry.isComplete ? "Reopen" : entry.kind == "TASK" ? "Complete" : "Achieve") {
                            Task { await toggleCompletion(entry) }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(client.isSaving)
                        .accessibilityIdentifier("CaptureCoachingToggle_\(entry.id)")
                    }
                }
            }
        }
        .captureCard()
        .accessibilityIdentifier("CaptureCoachingWork_\(entry.id)")
    }

    private func icon(for entry: MobileCoachingEngagementWorkEntry) -> String {
        switch entry.kind {
        case "TASK": entry.isComplete ? "checkmark.circle.fill" : "checkmark.circle"
        case "GOAL": entry.isComplete ? "target" : "scope"
        default: entry.visibility == "PRIVATE" ? "note.text.badge.plus" : "note.text"
        }
    }

    private func toggleCompletion(_ entry: MobileCoachingEngagementWorkEntry) async {
        let nextStatus: String
        if entry.kind == "TASK" {
            nextStatus = entry.isComplete ? "OPEN" : "DONE"
        } else {
            nextStatus = entry.isComplete ? "ACTIVE" : "ACHIEVED"
        }
        _ = await client.update(
            entry: entry,
            title: entry.title,
            body: entry.body ?? "",
            visibility: entry.visibility,
            ownerUserID: entry.owner?.id ?? client.workspace?.currentUserId ?? "",
            status: nextStatus
        )
    }
}

private struct MobileCoachingWorkEditorSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var client: MobileCoachingEngagementWorkspaceClient
    let workspace: MobileCoachingEngagementWorkspace
    let entry: MobileCoachingEngagementWorkEntry?

    @State private var kind: String
    @State private var title: String
    @State private var detail: String
    @State private var visibility: String
    @State private var ownerUserID: String
    @State private var status: String

    init(
        client: MobileCoachingEngagementWorkspaceClient,
        workspace: MobileCoachingEngagementWorkspace,
        entry: MobileCoachingEngagementWorkEntry?
    ) {
        self.client = client
        self.workspace = workspace
        self.entry = entry
        _kind = State(initialValue: entry?.kind ?? "NOTE")
        _title = State(initialValue: entry?.title ?? "")
        _detail = State(initialValue: entry?.body ?? "")
        _visibility = State(initialValue: entry?.visibility ?? "SHARED")
        _ownerUserID = State(initialValue: entry?.owner?.id ?? workspace.currentUserId)
        _status = State(initialValue: entry?.status ?? "OPEN")
    }

    private var canSave: Bool {
        !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && (kind == "NOTE" || !ownerUserID.isEmpty)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("What is it?") {
                    Picker("Type", selection: $kind) {
                        Text("Note").tag("NOTE")
                        Text("Task").tag("TASK")
                        Text("Goal").tag("GOAL")
                    }
                    .pickerStyle(.segmented)
                    .disabled(entry != nil)
                    .accessibilityIdentifier("CaptureCoachingWorkKind")

                    TextField(kind == "NOTE" ? "Note title" : kind == "TASK" ? "Task title" : "Goal title", text: $title)
                        .accessibilityIdentifier("CaptureCoachingWorkTitle")
                    TextEditor(text: $detail)
                        .frame(minHeight: 120)
                        .accessibilityLabel("Details")
                        .accessibilityIdentifier("CaptureCoachingWorkDetail")
                }

                if kind == "NOTE" {
                    Section("Who can see it?") {
                        Toggle(
                            "Only me",
                            isOn: Binding(
                                get: { visibility == "PRIVATE" },
                                set: { visibility = $0 ? "PRIVATE" : "SHARED" }
                            )
                        )
                        .accessibilityIdentifier("CaptureCoachingNoteVisibility")
                        Text(
                            visibility == "PRIVATE"
                                ? "Only you can read this note. Room access, staff status, and the shared client space do not widen it."
                                : "Every active member of this client space can read this note."
                        )
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    }
                } else {
                    Section(kind == "TASK" ? "Task owner" : "Goal owner") {
                        Picker("Owner", selection: $ownerUserID) {
                            ForEach(workspace.members) { member in
                                Text(member.label).tag(member.id)
                            }
                        }
                        .accessibilityIdentifier("CaptureCoachingWorkOwner")

                        if entry != nil {
                            Picker("Status", selection: $status) {
                                if kind == "TASK" {
                                    Text("Open").tag("OPEN")
                                    Text("Done").tag("DONE")
                                    Text("Canceled").tag("CANCELED")
                                } else {
                                    Text("Active").tag("ACTIVE")
                                    Text("Paused").tag("PAUSED")
                                    Text("Achieved").tag("ACHIEVED")
                                    Text("Archived").tag("ARCHIVED")
                                }
                            }
                            .accessibilityIdentifier("CaptureCoachingWorkStatus")
                        }
                    }
                }

                if let error = client.errorMessage {
                    Section { MobileCoachingInlineWarning(text: error) }
                }
            }
            .navigationTitle(entry == nil ? "Add coaching work" : "Edit \(entry?.kindLabel ?? "item")")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.isSaving ? "Saving…" : "Save") {
                        Task {
                            let saved: Bool
                            if let entry {
                                saved = await client.update(
                                    entry: entry,
                                    title: title,
                                    body: detail,
                                    visibility: visibility,
                                    ownerUserID: ownerUserID,
                                    status: status
                                )
                            } else {
                                saved = await client.create(
                                    kind: kind,
                                    title: title,
                                    body: detail,
                                    visibility: visibility,
                                    ownerUserID: ownerUserID
                                )
                            }
                            if saved { dismiss() }
                        }
                    }
                    .disabled(client.isSaving || !canSave)
                    .accessibilityIdentifier("CaptureCoachingSaveWork")
                }
            }
        }
        .interactiveDismissDisabled(client.isSaving)
        .accessibilityIdentifier("CaptureCoachingWorkEditor")
    }
}

private struct MobileCoachingRescheduleSheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var client: MobileCoachingRunwayClient
    let booking: MobileCoachingBooking
    @State private var scheduledStart: Date
    @State private var durationMinutes: Int

    init(client: MobileCoachingRunwayClient, booking: MobileCoachingBooking) {
        self.client = client
        self.booking = booking
        _scheduledStart = State(initialValue: max(booking.scheduledDate ?? Date(), Date()))
        _durationMinutes = State(initialValue: booking.durationMinutes)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    LabeledContent("Client", value: booking.clientLabel)
                    LabeledContent("Session", value: booking.title)
                }

                Section("New time") {
                    DatePicker(
                        "Starts",
                        selection: $scheduledStart,
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    .accessibilityIdentifier("CaptureCoachingRescheduleStart")
                    Picker("Duration", selection: $durationMinutes) {
                        Text("30 minutes").tag(30)
                        Text("45 minutes").tag(45)
                        Text("60 minutes").tag(60)
                        Text("90 minutes").tag(90)
                    }
                    .pickerStyle(.menu)
                    .accessibilityIdentifier("CaptureCoachingRescheduleDuration")
                    LabeledContent("Time zone", value: TimeZone.current.identifier)
                }

                if let error = client.errorMessage {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Reschedule")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.isMutating ? "Saving…" : "Save") {
                        Task {
                            if await client.rescheduleBooking(
                                booking,
                                scheduledStart: scheduledStart,
                                durationMinutes: durationMinutes
                            ) {
                                dismiss()
                            }
                        }
                    }
                    .disabled(client.isMutating || scheduledStart <= Date())
                    .accessibilityIdentifier("CaptureCoachingSaveReschedule")
                }
            }
        }
        .interactiveDismissDisabled(client.isMutating)
        .accessibilityIdentifier("CaptureCoachingRescheduleSheet")
    }
}

private struct NewMobileCoachingAppointmentSheet: View {
    @ObservedObject var client: MobileCoachingRunwayClient
    @Binding var isPresented: Bool
    let onCreated: @MainActor (MobileCoachingAppointmentResult) async -> Void
    @State private var draft = MobileCoachingAppointmentDraft()
    @FocusState private var focusedField: Field?

    private enum Field { case name, email, title }

    var body: some View {
        NavigationStack {
            Form {
                Section("Invite") {
                    TextField("Email", text: $draft.clientEmail)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .email)
                        .accessibilityIdentifier("CaptureCoachingClientEmail")
                    Text("Quipsly will send a private invitation to this address.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("When") {
                    DatePicker(
                        "Starts",
                        selection: $draft.scheduledStart,
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    Text("\(draft.durationMinutes) minutes · \(TimeZone.current.identifier)")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section {
                    DisclosureGroup("Optional details") {
                        TextField("Client name", text: $draft.clientName)
                            .textContentType(.name)
                            .focused($focusedField, equals: .name)
                            .submitLabel(.next)
                            .onSubmit { focusedField = .title }
                            .accessibilityIdentifier("CaptureCoachingClientName")
                        TextField("Session name", text: $draft.title)
                            .focused($focusedField, equals: .title)
                            .submitLabel(.done)
                            .onSubmit { focusedField = nil }
                            .accessibilityIdentifier("CaptureCoachingSessionTitle")
                        Picker("Duration", selection: $draft.durationMinutes) {
                            Text("30 minutes").tag(30)
                            Text("45 minutes").tag(45)
                            Text("60 minutes").tag(60)
                            Text("90 minutes").tag(90)
                        }
                        LabeledContent("Time zone", value: TimeZone.current.identifier)
                    }
                }

                if let error = client.errorMessage {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Schedule coaching")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { isPresented = false }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.isMutating ? "Scheduling…" : "Schedule & invite") {
                        Task {
                            guard let result = await client.createAppointment(draft) else { return }
                            if client.invitationEmailAvailable, let roomID = result.callRoomId {
                                _ = await client.sendInvitationEmail(
                                    roomID: roomID,
                                    recipientEmail: draft.normalizedEmail,
                                    recipientName: draft.clientName
                                )
                            }
                            await onCreated(result)
                            isPresented = false
                        }
                    }
                    .disabled(client.isMutating || !draft.isReady)
                    .accessibilityIdentifier("CaptureCoachingCreateAppointment")
                }
            }
            .onAppear { focusedField = .email }
        }
        .accessibilityIdentifier("CaptureCoachingAppointmentSheet")
    }
}

private func coachingISO8601Date(_ value: String) -> Date? {
    let fractional = ISO8601DateFormatter()
    fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return fractional.date(from: value) ?? ISO8601DateFormatter().date(from: value)
}

private func coachingClientError(_ message: String) -> NSError {
    NSError(
        domain: "QuipslyCoaching",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: message]
    )
}

private extension String {
    var nonemptyCoachingText: String? {
        let trimmed = trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}
