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
}

struct MobileCoachingRunwayResponse: Codable {
    let ok: Bool
    let error: String?
    let user: MobileCoachingRunwayUser?
    let upcomingBookings: [MobileCoachingBooking]?
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
    var upcomingBookings: [MobileCoachingBooking] { response?.upcomingBookings ?? [] }
    var isCoachingClient: Bool {
        guard let userID = response?.user?.id else { return false }
        return upcomingBookings.contains { $0.client?.id == userID }
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
            upcomingBookings: [
                MobileCoachingBooking(
                    id: "preview-booking",
                    coachingEngagementId: "preview-engagement",
                    title: "Leadership coaching session",
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
                uniqueKeysWithValues: (payload.upcomingBookings ?? []).compactMap { booking in
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
                    Text("One step creates the client identity, private relationship, appointment, consent requests, and joinable room.")
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
            Text("Send the private entry to the client. Their invited, verified email—not possession of the link—controls access.")
                .font(.caption)
                .foregroundStyle(.secondary)
            if let booking = booking(for: handoff.callRoomId) {
                invitationActions(for: booking)
            } else {
                HStack {
                    coachingShareLink(
                        title: "Join my Quipsly coaching session",
                        roomID: handoff.callRoomId,
                        entryPath: handoff.clientEntryPath
                    )
                }
            }
            HStack {
                if let roomID = handoff.callRoomId {
                    Button {
                        Task { await refreshAndOpen(roomID: roomID, navigate: true) }
                    } label: {
                        Label("Open room", systemImage: "waveform.and.mic")
                    }
                    .buttonStyle(.bordered)
                }
            }
        }
        .captureCard()
        .accessibilityIdentifier("CaptureCoachingHandoff")
    }

    private var upcomingSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("Upcoming")
                    .font(.title3.weight(.bold))
                Spacer()
                if client.isLoading { ProgressView().controlSize(.small) }
            }

            if client.upcomingBookings.isEmpty {
                Text(
                    client.isCoach
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
                ForEach(client.upcomingBookings) { booking in
                    VStack(alignment: .leading, spacing: 10) {
                        HStack(alignment: .top) {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(booking.title)
                                    .font(.headline)
                                Text(booking.clientLabel)
                                    .font(.subheadline.weight(.semibold))
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
                        HStack {
                            if let roomID = booking.callRoomId {
                                Button {
                                    Task { await refreshAndOpen(roomID: roomID, navigate: true) }
                                } label: {
                                    Label("Open", systemImage: "arrow.right.circle")
                                }
                                .buttonStyle(.bordered)
                                .accessibilityIdentifier("CaptureCoachingOpen_\(booking.id)")
                            }
                        }
                        if client.isCoach { invitationActions(for: booking) }
                    }
                    .captureCard()
                    .accessibilityIdentifier("CaptureCoachingBooking_\(booking.id)")
                }
            }
        }
    }

    @ViewBuilder
    private func invitationActions(for booking: MobileCoachingBooking) -> some View {
        if let roomID = booking.callRoomId,
           let recipientEmail = booking.client?.email?.nonemptyCoachingText {
            VStack(alignment: .leading, spacing: 8) {
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
                            ? "Resend invitation email"
                            : "Send invitation email",
                        systemImage: "envelope.badge"
                    )
                    .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(client.isMutating || model.usesPreviewData)
                .accessibilityHint("Emails a one-time, verified-email invitation and records delivery separately from acceptance.")
                .accessibilityIdentifier("CaptureCoachingSendInvite_\(booking.id)")

                if let delivery = client.invitationDeliveries[roomID] {
                    Label(
                        delivery.wasSent
                            ? "Email sent to \(recipientEmail). Acceptance is still pending."
                            : delivery.errorMessage ?? "Email was not sent. Retry or share the link.",
                        systemImage: delivery.wasSent ? "checkmark.circle.fill" : "exclamationmark.triangle.fill"
                    )
                    .font(.caption)
                    .foregroundStyle(delivery.wasSent ? .green : .orange)
                    .accessibilityIdentifier("CaptureCoachingInviteDelivery_\(booking.id)")
                }

                coachingShareLink(
                    title: booking.title,
                    roomID: booking.callRoomId,
                    entryPath: booking.clientEntryPath
                )
            }
        } else {
            coachingShareLink(
                title: booking.title,
                roomID: booking.callRoomId,
                entryPath: booking.clientEntryPath
            )
        }
    }

    private func booking(for roomID: String?) -> MobileCoachingBooking? {
        guard let roomID else { return nil }
        return client.upcomingBookings.first { $0.callRoomId == roomID }
    }

    private var relationshipsSection: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Client spaces")
                .font(.title3.weight(.bold))
            if model.coachingEngagements.isEmpty {
                Text("A private client space appears here after the first appointment. It carries shared notes, goals, tasks, session history, and conversation continuity.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .captureCard()
            } else {
                ForEach(model.coachingEngagements) { engagement in
                    VStack(alignment: .leading, spacing: 5) {
                        Label(engagement.title, systemImage: "person.2.fill")
                            .font(.headline)
                        if !engagement.participantLine.isEmpty {
                            Text(engagement.participantLine)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Text("Shared notes, goals, tasks, and Sessions stay attached to this exact relationship.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                    .captureCard()
                    .accessibilityElement(children: .combine)
                    .accessibilityIdentifier("CaptureCoachingRelationship_\(engagement.id)")
                }
            }
        }
    }

    @ViewBuilder
    private func coachingShareLink(title: String, roomID: String?, entryPath: String?) -> some View {
        if let entryURL = client.absoluteURL(for: entryPath) {
            let nativeURL = client.nativeURL(for: roomID)
            ShareLink(
                item: entryURL,
                subject: Text(title),
                message: Text(
                    nativeURL.map {
                        "Join this private Quipsly Session with the invited email. Web: \(entryURL.absoluteString) Open in Quipsly Capture: \($0.absoluteString)"
                    } ?? "Join this private Quipsly Session with the invited email."
                )
            ) {
                Label("Share invite", systemImage: "square.and.arrow.up")
            }
            .buttonStyle(.borderedProminent)
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
                Section("Client") {
                    TextField("Name (optional)", text: $draft.clientName)
                        .textContentType(.name)
                        .focused($focusedField, equals: .name)
                        .accessibilityIdentifier("CaptureCoachingClientName")
                    TextField("Email", text: $draft.clientEmail)
                        .textContentType(.emailAddress)
                        .keyboardType(.emailAddress)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .focused($focusedField, equals: .email)
                        .accessibilityIdentifier("CaptureCoachingClientEmail")
                    Text("The client must sign in with this exact verified email. The shared link is navigation, never a bearer credential.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                Section("Appointment") {
                    TextField("Session title", text: $draft.title)
                        .focused($focusedField, equals: .title)
                        .accessibilityIdentifier("CaptureCoachingSessionTitle")
                    DatePicker(
                        "Starts",
                        selection: $draft.scheduledStart,
                        in: Date()...,
                        displayedComponents: [.date, .hourAndMinute]
                    )
                    Picker("Duration", selection: $draft.durationMinutes) {
                        Text("30 minutes").tag(30)
                        Text("45 minutes").tag(45)
                        Text("60 minutes").tag(60)
                        Text("90 minutes").tag(90)
                    }
                    LabeledContent("Time zone", value: TimeZone.current.identifier)
                }

                Section {
                    Label(
                        "Create schedules only. It does not start the call, camera, microphone, recording, transcription, calendar sync, or payment.",
                        systemImage: "checkmark.shield"
                    )
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
                    Button(client.isMutating ? "Creating…" : "Create") {
                        Task {
                            guard let result = await client.createAppointment(draft) else { return }
                            await onCreated(result)
                            isPresented = false
                        }
                    }
                    .disabled(client.isMutating || !draft.isReady)
                    .accessibilityIdentifier("CaptureCoachingCreateAppointment")
                }
            }
            .onAppear { focusedField = .name }
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
