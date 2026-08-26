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
    let isClient: Bool?
}

struct MobileCoachingBookableSlot: Codable, Identifiable, Hashable {
    let instant: String
    let timezone: String
    let label: String

    var id: String { "\(instant)|\(timezone)" }
}

struct MobilePublicCoachingOffering: Codable, Identifiable, Hashable {
    let id: String
    let slug: String
    let title: String
    let description: String?
    let kind: String
    let paymentPolicy: String
    let durationMinutes: Int
    let priceLabel: String?
    let coachName: String
    let nextAction: String
    let bookingPath: String
    let bookableSlots: [MobileCoachingBookableSlot]
}

private struct MobilePublicCoachingOfferings: Codable {
    let unavailable: Bool
    let error: String?
    let items: [MobilePublicCoachingOffering]
}

private struct MobilePublicCoachingPacket: Codable {
    let ok: Bool
    let offerings: MobilePublicCoachingOfferings
}

struct MobileCoachingBookingHold: Codable, Identifiable, Hashable {
    let id: String
    let status: String
    let scheduledStart: String
    let scheduledEnd: String
    let timezone: String
    let expiresAt: String
    let contactEmail: String?
    let client: MobileCoachingPerson?
    let coach: MobileCoachingPerson?
    let offeringTitle: String?
    let convertedBookingId: String?
    let nextAction: String?

    var scheduledDate: Date? { coachingISO8601Date(scheduledStart) }

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
            ?? contactEmail?.nonemptyCoachingText
            ?? "Client"
    }

    var coachLabel: String {
        coach?.name?.nonemptyCoachingText
            ?? coach?.email?.nonemptyCoachingText
            ?? "Your coach"
    }
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
    let availabilityWindows: [MobileCoachingAvailabilityWindow]?
    let bookingHolds: [MobileCoachingBookingHold]?
}

struct MobileCoachingAvailabilityWindow: Codable, Identifiable, Hashable {
    let id: String
    let label: String
    let timezone: String
    let dayOfWeek: Int?
    let startMinute: Int?
    let endMinute: Int?
    let kind: String

    var isRecurringWorkingHours: Bool {
        kind == "recurring"
            && dayOfWeek != nil
            && startMinute != nil
            && endMinute != nil
    }
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

private struct MobileCoachingBookingRequestReceipt: Codable {
    let holdId: String
    let status: String
    let scheduledStart: String?
    let scheduledEnd: String?
    let timezone: String?
    let expiresAt: String?
    let repeated: Bool?
}

private struct MobileCoachingBookingRequestResponse: Codable {
    let ok: Bool
    let error: String?
    let request: MobileCoachingBookingRequestReceipt?
    let nextAction: String?
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
    @Published private(set) var publicOfferings: [MobilePublicCoachingOffering] = []
    @Published private(set) var latestHandoff: MobileCoachingAppointmentResult?
    @Published private(set) var isLoading = false
    @Published private(set) var isMutating = false
    @Published private(set) var status = "Coaching not loaded"
    @Published private(set) var errorMessage: String?
    @Published private(set) var invitationDeliveries: [String: MobileCoachingInvitationDelivery] = [:]
    @Published private(set) var isUsingProtectedCache = false
    @Published private(set) var cachedSnapshotSavedAt: Date?

    private let baseURL = normalizedNestBaseURL(
        Bundle.main.object(forInfoDictionaryKey: "QUIPSLY_API_BASE_URL") as? String
            ?? "https://nest.quipsly.com"
    )
    private var accountIdentityObserver: NSObjectProtocol?
    private var observedOwnerAccountID: String?

    private struct ProtectedCoachingRunwayCache: Codable {
        let schemaVersion: Int
        let ownerAccountID: String
        let ownerEmail: String
        let savedAt: Date
        let response: MobileCoachingRunwayResponse
    }

    nonisolated private static let protectedCacheLifetime: TimeInterval = 30 * 24 * 60 * 60
    nonisolated private static let protectedCacheDirectoryName = "ProtectedCoachingRunwayCache"
    nonisolated private static let protectedCacheFileName = "mobile-coaching-runway-v1.json"

    init() {
        observedOwnerAccountID = Self.normalizedOwnerAccountID(AuthManager.currentStoredOwnerID())
        accountIdentityObserver = NotificationCenter.default.addObserver(
            forName: .quipslyCaptureAccountIdentityDidChange,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            MainActor.assumeIsolated { [weak self] in
                self?.handleAccountIdentityChange(notification.object as? String)
            }
        }
    }

    deinit {
        if let accountIdentityObserver {
            NotificationCenter.default.removeObserver(accountIdentityObserver)
        }
    }

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
    var weeklyAvailability: [MobileCoachingAvailabilityWindow] {
        (response?.availabilityWindows ?? []).filter(\.isRecurringWorkingHours)
    }
    var activeBookingHolds: [MobileCoachingBookingHold] {
        (response?.bookingHolds ?? []).filter { $0.status == "ACTIVE" }
    }
    var clientBookingRequests: [MobileCoachingBookingHold] {
        guard let userID = response?.user?.id else { return [] }
        return activeBookingHolds.filter { $0.client?.id == userID }
    }
    var coachBookingRequests: [MobileCoachingBookingHold] {
        guard let userID = response?.user?.id else { return [] }
        return activeBookingHolds.filter { $0.coach?.id == userID }
    }
    var isCoachingClient: Bool {
        if response?.user?.isClient == true { return true }
        guard let userID = response?.user?.id else { return false }
        return allBookings.contains { $0.client?.id == userID }
            || activeBookingHolds.contains { $0.client?.id == userID }
    }
    var cachedSnapshotStatusLine: String? {
        guard isUsingProtectedCache, let cachedSnapshotSavedAt else { return nil }
        return "Offline snapshot saved \(cachedSnapshotSavedAt.formatted(date: .abbreviated, time: .shortened)). Scheduling actions are disabled until Nest reconnects."
    }

    func scheduleConflict(
        startingAt scheduledStart: Date,
        durationMinutes: Int,
        excludingBookingID: String? = nil
    ) -> MobileCoachingBooking? {
        guard let coachUserID = response?.user?.id else { return nil }
        let scheduledEnd = scheduledStart.addingTimeInterval(
            TimeInterval(max(15, durationMinutes) * 60)
        )
        return upcomingBookings.first { booking in
            guard booking.id != excludingBookingID,
                  booking.coach?.id == coachUserID,
                  let existingStart = booking.scheduledDate,
                  let existingEnd = coachingISO8601Date(booking.scheduledEnd) else { return false }
            return scheduledStart < existingEnd && scheduledEnd > existingStart
        }
    }

    func isOutsideWeeklyAvailability(
        startingAt scheduledStart: Date,
        durationMinutes: Int
    ) -> Bool {
        let windows = weeklyAvailability
        guard !windows.isEmpty else { return false }
        let scheduledEnd = scheduledStart.addingTimeInterval(
            TimeInterval(max(15, durationMinutes) * 60)
        )
        return !windows.contains { window in
            guard let dayOfWeek = window.dayOfWeek,
                  let startMinute = window.startMinute,
                  let endMinute = window.endMinute,
                  let timezone = TimeZone(identifier: window.timezone) else { return false }
            var calendar = Calendar(identifier: .gregorian)
            calendar.timeZone = timezone
            let startParts = calendar.dateComponents(
                [.year, .month, .day, .weekday, .hour, .minute],
                from: scheduledStart
            )
            let endParts = calendar.dateComponents(
                [.year, .month, .day, .hour, .minute],
                from: scheduledEnd
            )
            guard startParts.year == endParts.year,
                  startParts.month == endParts.month,
                  startParts.day == endParts.day,
                  let weekday = startParts.weekday,
                  let startHour = startParts.hour,
                  let startMinutePart = startParts.minute,
                  let endHour = endParts.hour,
                  let endMinutePart = endParts.minute else { return false }
            return weekday - 1 == dayOfWeek
                && startHour * 60 + startMinutePart >= startMinute
                && endHour * 60 + endMinutePart <= endMinute
        }
    }

    func loadPreview() {
        let conflictPreview = ProcessInfo.processInfo.arguments.contains(
            "--capture-conflict-scheduling-preview"
        )
        let availabilityPreview = ProcessInfo.processInfo.arguments.contains(
            "--capture-availability-scheduling-preview"
        )
        let clientRequestPreview = ProcessInfo.processInfo.arguments.contains(
            "--capture-client-booking-preview"
        )
        let coachRequestPreview = ProcessInfo.processInfo.arguments.contains(
            "--capture-coach-requests-preview"
        )
        let offlineSnapshotPreview = ProcessInfo.processInfo.arguments.contains(
            "--capture-coaching-offline-preview"
        )
        let confirmedRequestPreview = ProcessInfo.processInfo.arguments.contains(
            "--capture-confirmed-request-preview"
        )
        let start = Date().addingTimeInterval((conflictPreview ? 55 : 35) * 60)
        let previewIsCoach = !clientRequestPreview
        let previewUserID = previewIsCoach ? "preview-coach" : "preview-client"
        let previewHold = MobileCoachingBookingHold(
            id: "preview-booking-request",
            status: "ACTIVE",
            scheduledStart: ISO8601DateFormatter().string(from: start),
            scheduledEnd: ISO8601DateFormatter().string(from: start.addingTimeInterval(60 * 60)),
            timezone: TimeZone.current.identifier,
            expiresAt: ISO8601DateFormatter().string(from: Date().addingTimeInterval(24 * 60 * 60)),
            contactEmail: "homer@example.test",
            client: MobileCoachingPerson(id: "preview-client", name: "Homer", email: "homer@example.test"),
            coach: MobileCoachingPerson(id: "preview-coach", name: "Charlie Sparrow", email: "charlie@example.test"),
            offeringTitle: "One-to-one coaching session",
            convertedBookingId: nil,
            nextAction: "Active hold. Convert to a booking only when the human confirms."
        )
        response = MobileCoachingRunwayResponse(
            ok: true,
            error: nil,
            user: MobileCoachingRunwayUser(
                id: previewUserID,
                email: previewIsCoach ? "charlie@example.test" : "homer@example.test",
                name: previewIsCoach ? "Charlie Sparrow" : "Homer",
                isStaff: false,
                isCoach: previewIsCoach,
                isClient: clientRequestPreview
            ),
            readiness: MobileCoachingRunwayReadiness(
                invitationEmailConfigured: true,
                invitationEmailStatus: "AVAILABLE"
            ),
            upcomingBookings: (availabilityPreview || clientRequestPreview || coachRequestPreview) && !confirmedRequestPreview ? [] : [
                MobileCoachingBooking(
                    id: "preview-booking",
                    coachingEngagementId: "preview-engagement",
                    title: "Coaching session",
                    status: "CONFIRMED",
                    scheduledStart: ISO8601DateFormatter().string(from: start),
                    scheduledEnd: ISO8601DateFormatter().string(
                        from: start.addingTimeInterval((conflictPreview ? 95 : 50) * 60)
                    ),
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
            ],
            availabilityWindows: (conflictPreview || availabilityPreview) ? [
                MobileCoachingAvailabilityWindow(
                    id: "preview-hours",
                    label: "Today working hours",
                    timezone: TimeZone.current.identifier,
                    dayOfWeek: Calendar.current.component(.weekday, from: Date()) - 1,
                    startMinute: 0,
                    endMinute: conflictPreview ? 24 * 60 : 1,
                    kind: "recurring"
                ),
            ] : [],
            bookingHolds: (clientRequestPreview || coachRequestPreview) ? [previewHold] : []
        )
        publicOfferings = clientRequestPreview ? [
            MobilePublicCoachingOffering(
                id: "preview-offering",
                slug: "preview-coaching",
                title: "One-to-one coaching session",
                description: "A private coaching conversation with shared follow-through.",
                kind: "ONE_TO_ONE_COACHING",
                paymentPolicy: "MANUAL",
                durationMinutes: 60,
                priceLabel: nil,
                coachName: "Charlie Sparrow",
                nextAction: "Choose a time and sign in to request it.",
                bookingPath: "/coaching/book/preview-coaching",
                bookableSlots: [
                    MobileCoachingBookableSlot(
                        instant: ISO8601DateFormatter().string(from: start.addingTimeInterval(24 * 60 * 60)),
                        timezone: TimeZone.current.identifier,
                        label: "Tomorrow at 10:00 AM"
                    )
                ]
            )
        ] : []
        isUsingProtectedCache = offlineSnapshotPreview
        cachedSnapshotSavedAt = offlineSnapshotPreview ? Date().addingTimeInterval(-8 * 60) : nil
        if confirmedRequestPreview,
           let booking = response?.upcomingBookings?.first {
            latestHandoff = appointmentResult(for: booking)
        }
        status = offlineSnapshotPreview ? "Offline · saved coaching" : "Coaching ready"
        errorMessage = offlineSnapshotPreview ? cachedSnapshotStatusLine : nil
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
            let (data, httpResponse) = try await AuthManager.shared.authenticatedData(
                for: request,
                allowOfflineRecovery: true
            )
            let payload = try? JSONDecoder().decode(MobileCoachingRunwayResponse.self, from: data)

            if httpResponse.statusCode == 401 || httpResponse.statusCode == 403 {
                let message = payload?.error
                    ?? "This Quipsly account is no longer allowed to use this coaching space."
                clearAfterAuthorityFailure()
                status = "Coaching access unavailable"
                errorMessage = message
                return
            }

            if Self.isTransportAmbiguousStatus(httpResponse.statusCode) {
                let message = payload?.error
                    ?? "Nest could not return current coaching scheduling (HTTP \(httpResponse.statusCode))."
                useProtectedSnapshotIfAvailable(fallbackMessage: message)
                return
            }

            guard httpResponse.statusCode < 400, let payload, payload.ok else {
                throw coachingClientError(payload?.error ?? "Quipsly coaching could not load.")
            }
            response = payload
            isUsingProtectedCache = false
            invitationDeliveries = Dictionary(
                uniqueKeysWithValues: upcomingBookings.compactMap { booking in
                    guard let roomID = booking.callRoomId,
                          let delivery = booking.clientInvitationDelivery else { return nil }
                    return (roomID, delivery)
                }
            )
            await loadPublicOfferings()
            persistProtectedSnapshot(payload)
            status = payload.user?.isCoach == true
                ? "Coaching ready"
                : payload.user?.isClient == true ? "Your coaching is ready" : "Coaching ready"
        } catch {
            if Self.isTransportUnavailable(error) {
                AuthManager.shared.suspendNetworkActionsForCachedFallback(
                    reason: error.localizedDescription
                )
                useProtectedSnapshotIfAvailable(fallbackMessage: error.localizedDescription)
            } else {
                status = "Coaching needs attention"
                errorMessage = error.localizedDescription
            }
        }
    }

    @discardableResult
    func requestBooking(
        offering: MobilePublicCoachingOffering,
        slot: MobileCoachingBookableSlot
    ) async -> Bool {
        guard !isMutating else { return false }
        guard allowAuthoritativeMutation() else { return false }
        guard let url = URL(string: "\(baseURL)/api/coaching/booking-requests") else {
            errorMessage = "The configured Nest URL is not valid."
            return false
        }
        isMutating = true
        defer { isMutating = false }
        status = "Requesting time"
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "offeringId": offering.id,
                "scheduledStart": slot.instant,
            ])
            let (data, httpResponse) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCoachingBookingRequestResponse.self, from: data)
            guard httpResponse.statusCode < 400, payload.ok, payload.request?.holdId.isEmpty == false else {
                throw coachingClientError(payload.error ?? "That coaching time could not be requested.")
            }
            await load()
            status = "Time requested"
            return true
        } catch {
            status = "Time request needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func cancelBookingRequest(_ hold: MobileCoachingBookingHold) async -> Bool {
        guard !isMutating else { return false }
        guard allowAuthoritativeMutation() else { return false }
        guard var components = URLComponents(string: "\(baseURL)/api/coaching/booking-requests") else {
            errorMessage = "The configured Nest URL is not valid."
            return false
        }
        components.queryItems = [URLQueryItem(name: "holdId", value: hold.id)]
        guard let url = components.url else {
            errorMessage = "The configured Nest URL is not valid."
            return false
        }
        isMutating = true
        defer { isMutating = false }
        status = "Canceling time request"
        errorMessage = nil
        do {
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            let (data, httpResponse) = try await AuthManager.shared.authenticatedData(for: request)
            let payload = try JSONDecoder().decode(MobileCoachingBookingRequestResponse.self, from: data)
            guard httpResponse.statusCode < 400, payload.ok else {
                throw coachingClientError(payload.error ?? "That time request could not be canceled.")
            }
            await load()
            status = "Time request canceled"
            return true
        } catch {
            status = "Cancellation needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func confirmBookingRequest(_ hold: MobileCoachingBookingHold) async -> Bool {
        await manageBookingRequest(
            hold,
            action: "convert-booking-hold",
            workingStatus: "Confirming Session",
            completeStatus: "Session confirmed"
        )
    }

    @discardableResult
    func declineBookingRequest(_ hold: MobileCoachingBookingHold) async -> Bool {
        await manageBookingRequest(
            hold,
            action: "release-booking-hold",
            workingStatus: "Declining request",
            completeStatus: "Request declined"
        )
    }

    private func manageBookingRequest(
        _ hold: MobileCoachingBookingHold,
        action: String,
        workingStatus: String,
        completeStatus: String
    ) async -> Bool {
        guard !isMutating else { return false }
        guard allowAuthoritativeMutation() else { return false }
        isMutating = true
        defer { isMutating = false }
        status = workingStatus
        errorMessage = nil
        do {
            let payload = try await performAction([
                "action": action,
                "holdId": hold.id,
                "notes": "Confirmed from Quipsly Capture on iPhone.",
                "reason": "Declined from Quipsly Capture on iPhone.",
            ])
            guard payload.ok else {
                throw coachingClientError(payload.error ?? "That time request could not be updated.")
            }
            if action == "convert-booking-hold" {
                latestHandoff = payload.result
            }
            await load()
            if action == "convert-booking-hold",
               let bookingID = payload.result?.bookingId ?? hold.convertedBookingId,
               let booking = upcomingBookings.first(where: { $0.id == bookingID }) {
                latestHandoff = appointmentResult(for: booking)
            }
            status = completeStatus
            return true
        } catch {
            status = "Request needs attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    private func loadPublicOfferings() async {
        guard let url = URL(string: "\(baseURL)/api/coaching/public?source=capture-ios") else { return }
        do {
            var request = URLRequest(url: url)
            request.cachePolicy = .reloadIgnoringLocalCacheData
            request.setValue("application/json", forHTTPHeaderField: "Accept")
            let (data, response) = try await URLSession.shared.data(for: request)
            guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode < 400 else { return }
            let packet = try JSONDecoder().decode(MobilePublicCoachingPacket.self, from: data)
            publicOfferings = packet.ok && !packet.offerings.unavailable ? packet.offerings.items : []
        } catch {
            // Public discovery is an enhancement. Existing bookings and client
            // spaces remain usable if the published-offerings projection is down.
        }
    }

    @discardableResult
    func setupCoach() async -> Bool {
        guard !isMutating else { return false }
        guard allowAuthoritativeMutation() else { return false }
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
        if let conflict = scheduleConflict(
            startingAt: draft.scheduledStart,
            durationMinutes: draft.durationMinutes
        ) {
            errorMessage = "That time overlaps \(conflict.title) (\(conflict.scheduleLabel)). Choose another time first."
            return nil
        }
        if isOutsideWeeklyAvailability(
            startingAt: draft.scheduledStart,
            durationMinutes: draft.durationMinutes
        ) {
            errorMessage = "That time is outside your weekly working hours. Choose a listed time or update Working hours."
            return nil
        }
        guard allowAuthoritativeMutation() else { return nil }

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
        if let conflict = scheduleConflict(
            startingAt: scheduledStart,
            durationMinutes: durationMinutes,
            excludingBookingID: booking.id
        ) {
            errorMessage = "That time overlaps \(conflict.title) (\(conflict.scheduleLabel)). Choose another time first."
            return false
        }
        if isOutsideWeeklyAvailability(
            startingAt: scheduledStart,
            durationMinutes: durationMinutes
        ) {
            errorMessage = "That time is outside your weekly working hours. Choose a listed time or update Working hours."
            return false
        }
        guard allowAuthoritativeMutation() else { return false }

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
    func updateWeeklyAvailability(
        days: Set<Int>,
        startMinute: Int,
        endMinute: Int
    ) async -> Bool {
        guard !isMutating else { return false }
        guard !days.isEmpty, endMinute > startMinute else {
            errorMessage = "Choose at least one weekday and an end time after the start time."
            return false
        }
        guard allowAuthoritativeMutation() else { return false }
        isMutating = true
        defer { isMutating = false }
        status = "Saving working hours"
        errorMessage = nil
        do {
            let payload = try await performAction([
                "action": "update-weekly-availability",
                "timezone": TimeZone.current.identifier,
                "windows": days.sorted().map { day in
                    [
                        "dayOfWeek": day,
                        "startMinute": startMinute,
                        "endMinute": endMinute,
                    ]
                },
            ])
            guard payload.ok else {
                throw coachingClientError(payload.error ?? "Working hours could not be saved.")
            }
            await load()
            status = "Working hours saved"
            return true
        } catch {
            status = "Working hours need attention"
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func cancelBooking(_ booking: MobileCoachingBooking) async -> Bool {
        guard !isMutating else { return false }
        guard allowAuthoritativeMutation() else { return false }
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
        guard allowAuthoritativeMutation() else { return false }
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
        guard !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            throw coachingClientError("Reconnect to Nest before changing coaching scheduling.")
        }
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

    private func allowAuthoritativeMutation() -> Bool {
        guard !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed else {
            errorMessage = "Reconnect to Nest before changing coaching scheduling."
            return false
        }
        return true
    }

    private func appointmentResult(for booking: MobileCoachingBooking) -> MobileCoachingAppointmentResult {
        MobileCoachingAppointmentResult(
            appointmentId: nil,
            bookingId: booking.id,
            callRoomId: booking.callRoomId,
            engagementId: booking.coachingEngagementId,
            clientEntryPath: booking.clientEntryPath,
            engagementPath: booking.engagementPath,
            liveSessionPath: booking.liveSessionPath,
            sessionWorkspacePath: booking.sessionWorkspacePath,
            clientUserId: booking.client?.id,
            status: booking.status,
            nextAction: "Open the confirmed Session, review devices, then join when ready. Nothing starts automatically."
        )
    }

    private func useProtectedSnapshotIfAvailable(fallbackMessage: String) {
        let restored = response != nil || restoreProtectedSnapshotIfAvailable()
        if restored {
            isUsingProtectedCache = true
            status = "Offline · saved coaching"
            errorMessage = cachedSnapshotStatusLine
                ?? "Nest is unavailable. Showing a protected coaching snapshot; scheduling actions are disabled."
        } else {
            status = "Coaching temporarily unavailable"
            errorMessage = fallbackMessage
        }
    }

    private func clearAfterAuthorityFailure() {
        response = nil
        publicOfferings = []
        latestHandoff = nil
        invitationDeliveries = [:]
        isUsingProtectedCache = false
        cachedSnapshotSavedAt = nil
        Self.clearProtectedSnapshot()
    }

    private func handleAccountIdentityChange(_ ownerAccountID: String?) {
        let normalizedOwnerAccountID = Self.normalizedOwnerAccountID(ownerAccountID)
        guard normalizedOwnerAccountID != observedOwnerAccountID else { return }
        observedOwnerAccountID = normalizedOwnerAccountID
        clearAfterAuthorityFailure()
        status = normalizedOwnerAccountID == nil ? "Coaching not loaded" : "Coaching account changed"
        errorMessage = nil
    }

    @discardableResult
    private func restoreProtectedSnapshotIfAvailable() -> Bool {
        guard let ownerAccountID = Self.normalizedOwnerAccountID(AuthManager.currentStoredOwnerID()),
              let ownerEmail = Self.normalizedOwnerEmail(AuthManager.shared.userEmail),
              let cacheURL = Self.protectedCacheURL(),
              FileManager.default.fileExists(atPath: cacheURL.path) else { return false }
        do {
            let data = try Data(contentsOf: cacheURL, options: .mappedIfSafe)
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            let cache = try decoder.decode(ProtectedCoachingRunwayCache.self, from: data)
            let age = Date().timeIntervalSince(cache.savedAt)
            guard cache.schemaVersion == 2,
                  cache.ownerAccountID == ownerAccountID,
                  cache.ownerEmail == ownerEmail,
                  age >= 0,
                  age <= Self.protectedCacheLifetime else {
                Self.clearProtectedSnapshot()
                return false
            }
            response = cache.response
            invitationDeliveries = Dictionary(
                uniqueKeysWithValues: (cache.response.upcomingBookings ?? []).compactMap { booking in
                    guard let roomID = booking.callRoomId,
                          let delivery = booking.clientInvitationDelivery else { return nil }
                    return (roomID, delivery)
                }
            )
            cachedSnapshotSavedAt = cache.savedAt
            isUsingProtectedCache = true
            return true
        } catch {
            Self.clearProtectedSnapshot()
            return false
        }
    }

    private func persistProtectedSnapshot(_ runwayResponse: MobileCoachingRunwayResponse) {
        guard AuthManager.shared.networkActionsAllowed,
              let ownerAccountID = Self.normalizedOwnerAccountID(AuthManager.currentStoredOwnerID()),
              let ownerEmail = Self.normalizedOwnerEmail(AuthManager.shared.userEmail),
              let cacheURL = Self.protectedCacheURL() else { return }
        let savedAt = Date()
        do {
            let fileManager = FileManager.default
            let directoryURL = cacheURL.deletingLastPathComponent()
            try fileManager.createDirectory(
                at: directoryURL,
                withIntermediateDirectories: true,
                attributes: [.protectionKey: FileProtectionType.complete]
            )
            try fileManager.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: directoryURL.path
            )
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            encoder.outputFormatting = [.sortedKeys]
            try encoder.encode(
                ProtectedCoachingRunwayCache(
                    schemaVersion: 2,
                    ownerAccountID: ownerAccountID,
                    ownerEmail: ownerEmail,
                    savedAt: savedAt,
                    response: runwayResponse
                )
            ).write(to: cacheURL, options: [.atomic, .completeFileProtection])
            try fileManager.setAttributes(
                [.protectionKey: FileProtectionType.complete],
                ofItemAtPath: cacheURL.path
            )
            var resourceValues = URLResourceValues()
            resourceValues.isExcludedFromBackup = true
            var mutableCacheURL = cacheURL
            try mutableCacheURL.setResourceValues(resourceValues)
            cachedSnapshotSavedAt = savedAt
            isUsingProtectedCache = false
        } catch {
            print("Protected coaching runway cache could not be updated: \(error.localizedDescription)")
        }
    }

    nonisolated private static func clearProtectedSnapshot() {
        guard let cacheURL = protectedCacheURL() else { return }
        try? FileManager.default.removeItem(at: cacheURL)
    }

    nonisolated private static func protectedCacheURL() -> URL? {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask).first?
            .appendingPathComponent("QuipslyCapture", isDirectory: true)
            .appendingPathComponent(protectedCacheDirectoryName, isDirectory: true)
            .appendingPathComponent(protectedCacheFileName, isDirectory: false)
    }

    nonisolated private static func normalizedOwnerEmail(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines).lowercased(),
              !normalized.isEmpty else { return nil }
        return normalized
    }

    nonisolated private static func normalizedOwnerAccountID(_ value: String?) -> String? {
        guard let normalized = value?.trimmingCharacters(in: .whitespacesAndNewlines),
              !normalized.isEmpty else { return nil }
        return normalized
    }

    nonisolated private static func isTransportAmbiguousStatus(_ statusCode: Int) -> Bool {
        [408, 425, 429].contains(statusCode) || (500...599).contains(statusCode)
    }

    private static func isTransportUnavailable(_ error: Error) -> Bool {
        if AuthManager.shared.hasProtectedOfflineAccess { return true }
        let nsError = error as NSError
        guard nsError.domain == NSURLErrorDomain else { return false }
        return [
            URLError.notConnectedToInternet.rawValue,
            URLError.networkConnectionLost.rawValue,
            URLError.cannotConnectToHost.rawValue,
            URLError.cannotFindHost.rawValue,
            URLError.dnsLookupFailed.rawValue,
            URLError.timedOut.rawValue,
            URLError.internationalRoamingOff.rawValue,
            URLError.dataNotAllowed.rawValue,
            URLError.secureConnectionFailed.rawValue,
            URLError.cannotLoadFromNetwork.rawValue,
            URLError.resourceUnavailable.rawValue,
            URLError.badServerResponse.rawValue,
        ].contains(nsError.code)
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

private struct MobileCoachingPublicTimeSelection: Identifiable {
    let offering: MobilePublicCoachingOffering
    let slot: MobileCoachingBookableSlot

    var id: String { "\(offering.id)|\(slot.id)" }
}

struct CaptureCoachingHomeView: View {
    @ObservedObject var model: CaptureExperienceModel
    @Binding var visibleTab: CaptureRootTab
    @State private var showsNewAppointment = false
    @State private var showsWorkingHours = false
    @State private var bookingToReschedule: MobileCoachingBooking?
    @State private var requestedRescheduleStart: Date?
    @State private var bookingToCancel: MobileCoachingBooking?
    @State private var bookingToRequestChange: MobileCoachingBooking?
    @State private var bookingRequestToCancel: MobileCoachingBookingHold?
    @State private var bookingRequestToDecline: MobileCoachingBookingHold?
    @State private var selectedPublicTime: MobileCoachingPublicTimeSelection?

    private var client: MobileCoachingRunwayClient { model.coachingRunwayClient }
    private var allowsPreviewSchedulingInspection: Bool {
        ProcessInfo.processInfo.arguments.contains("--capture-conflict-scheduling-preview")
            || ProcessInfo.processInfo.arguments.contains("--capture-availability-scheduling-preview")
    }

    var body: some View {
        bookingTimeDialog
            .accessibilityIdentifier("CaptureCoachingHome")
    }

    private var coachingScrollView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                header

                if client.isUsingProtectedCache {
                    offlineSnapshotCard
                }

                if client.isCoach {
                    createCard
                } else if client.isCoachingClient {
                    clientWelcomeCard
                } else {
                    coachingChoiceCard
                }

                if client.isCoach {
                    incomingRequestsSection
                } else {
                    clientRequestsSection
                    publishedTimesSection
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
    }

    private var coachingSheets: some View {
        coachingScrollView
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
        .sheet(isPresented: $showsWorkingHours) {
            MobileCoachingAvailabilitySheet(client: client)
                .presentationDetents([.medium, .large])
        }
        .sheet(item: $bookingToReschedule, onDismiss: {
            requestedRescheduleStart = nil
        }) { booking in
            MobileCoachingRescheduleSheet(
                client: client,
                booking: booking,
                preferredStart: requestedRescheduleStart
            )
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
    }

    private var sessionCancellationAlert: some View {
        coachingSheets
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
    }

    private var requestCancellationAlert: some View {
        sessionCancellationAlert
        .alert(
            "Cancel this time request?",
            isPresented: Binding(
                get: { bookingRequestToCancel != nil },
                set: { if !$0 { bookingRequestToCancel = nil } }
            ),
            presenting: bookingRequestToCancel
        ) { request in
            Button("Keep request", role: .cancel) {
                bookingRequestToCancel = nil
            }
            Button("Cancel request", role: .destructive) {
                bookingRequestToCancel = nil
                Task { _ = await client.cancelBookingRequest(request) }
            }
        } message: { request in
            Text("Cancel your request for \(request.scheduleLabel)?")
        }
    }

    private var requestDeclineAlert: some View {
        requestCancellationAlert
        .alert(
            "Decline this request?",
            isPresented: Binding(
                get: { bookingRequestToDecline != nil },
                set: { if !$0 { bookingRequestToDecline = nil } }
            ),
            presenting: bookingRequestToDecline
        ) { request in
            Button("Keep request", role: .cancel) {
                bookingRequestToDecline = nil
            }
            Button("Decline", role: .destructive) {
                bookingRequestToDecline = nil
                Task { _ = await client.declineBookingRequest(request) }
            }
        } message: { request in
            Text("Decline \(request.clientLabel)'s request for \(request.scheduleLabel)?")
        }
    }

    private var bookingTimeDialog: some View {
        requestDeclineAlert
        .confirmationDialog(
            "Request this coaching time?",
            isPresented: Binding(
                get: { selectedPublicTime != nil },
                set: { if !$0 { selectedPublicTime = nil } }
            ),
            titleVisibility: .visible,
            presenting: selectedPublicTime
        ) { selection in
            Button("Request \(selection.slot.label)") {
                selectedPublicTime = nil
                Task {
                    _ = await client.requestBooking(
                        offering: selection.offering,
                        slot: selection.slot
                    )
                }
            }
            Button("Cancel", role: .cancel) {
                selectedPublicTime = nil
            }
        } message: { selection in
            Text("\(selection.offering.title) with \(selection.offering.coachName). The coach will confirm before a Session is created.")
        }
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

    private var offlineSnapshotCard: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label("Saved coaching snapshot", systemImage: "wifi.slash")
                .font(.headline)
            Text(
                client.cachedSnapshotStatusLine
                    ?? "You can review saved Sessions and time requests while Nest reconnects. Scheduling changes stay disabled so stale data cannot overwrite current plans."
            )
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .captureCard()
        .accessibilityElement(children: .combine)
        .accessibilityIdentifier("CaptureCoachingOfflineSnapshot")
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

    private var coachingChoiceCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("What would you like to do?")
                .font(.headline)
            Text("Choose an available coaching time below, or set up your own private coaching space.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
            Button {
                Task { _ = await client.setupCoach() }
            } label: {
                Label(client.isMutating ? "Setting up…" : "Set up coaching", systemImage: "sparkles")
                    .frame(maxWidth: .infinity)
            }
            .buttonStyle(.borderedProminent)
            .disabled(client.isMutating || client.isUsingProtectedCache || model.usesPreviewData)
            .accessibilityIdentifier("CaptureCoachingSetupButton")
        }
        .captureCard()
    }

    @ViewBuilder
    private var incomingRequestsSection: some View {
        if !client.coachBookingRequests.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Time requests")
                    .font(.title3.weight(.bold))
                Text("Confirming creates the private Session. Declining only releases this requested time.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(client.coachBookingRequests) { request in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(request.offeringTitle ?? "Coaching session")
                            .font(.headline)
                        Text(request.clientLabel)
                            .font(.subheadline.weight(.semibold))
                        Text(request.scheduleLabel)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        HStack {
                            Button {
                                Task { _ = await client.confirmBookingRequest(request) }
                            } label: {
                                Label("Confirm Session", systemImage: "checkmark.circle.fill")
                                    .frame(maxWidth: .infinity)
                            }
                            .buttonStyle(.borderedProminent)
                            .disabled(client.isMutating || client.isUsingProtectedCache || model.usesPreviewData)
                            .accessibilityIdentifier("CaptureCoachingConfirmRequest_\(request.id)")

                            Button(role: .destructive) {
                                bookingRequestToDecline = request
                            } label: {
                                Text("Decline")
                            }
                            .buttonStyle(.bordered)
                            .disabled(client.isMutating || client.isUsingProtectedCache || model.usesPreviewData)
                            .accessibilityIdentifier("CaptureCoachingDeclineRequest_\(request.id)")
                        }
                    }
                    .captureCard()
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("CaptureCoachingIncomingRequest_\(request.id)")
                }
            }
        }
    }

    @ViewBuilder
    private var clientRequestsSection: some View {
        if !client.clientBookingRequests.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("My time requests")
                    .font(.title3.weight(.bold))
                ForEach(client.clientBookingRequests) { request in
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Waiting for \(request.coachLabel)", systemImage: "clock.fill")
                            .font(.headline)
                            .foregroundStyle(.teal)
                        Text(request.offeringTitle ?? "Coaching session")
                            .font(.subheadline.weight(.semibold))
                        Text(request.scheduleLabel)
                            .font(.subheadline)
                        Text("A Session will appear here after the coach confirms.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        Button(role: .destructive) {
                            bookingRequestToCancel = request
                        } label: {
                            Text("Cancel time request")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)
                        .disabled(client.isMutating || client.isUsingProtectedCache || model.usesPreviewData)
                        .accessibilityIdentifier("CaptureCoachingCancelRequest_\(request.id)")
                    }
                    .captureCard()
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("CaptureCoachingClientRequest_\(request.id)")
                }
            }
        }
    }

    @ViewBuilder
    private var publishedTimesSection: some View {
        if !client.publicOfferings.isEmpty {
            VStack(alignment: .leading, spacing: 10) {
                Text("Find a coaching time")
                    .font(.title3.weight(.bold))
                Text("Only times the coach chose to publish appear here.")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                ForEach(client.publicOfferings) { offering in
                    VStack(alignment: .leading, spacing: 10) {
                        Text(offering.title)
                            .font(.headline)
                        Text("with \(offering.coachName) · \(offering.durationMinutes) minutes")
                            .font(.subheadline.weight(.semibold))
                        if let description = offering.description?.nonemptyCoachingText {
                            Text(description)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        if offering.bookableSlots.isEmpty {
                            Text("No open times right now.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        } else {
                            ForEach(offering.bookableSlots.prefix(6)) { slot in
                                Button {
                                    selectedPublicTime = MobileCoachingPublicTimeSelection(
                                        offering: offering,
                                        slot: slot
                                    )
                                } label: {
                                    HStack {
                                        Label(slot.label, systemImage: "calendar.badge.plus")
                                        Spacer()
                                        Image(systemName: "chevron.right")
                                            .font(.caption.weight(.bold))
                                    }
                                    .frame(maxWidth: .infinity)
                                }
                                .buttonStyle(.bordered)
                                .disabled(client.isMutating || client.isUsingProtectedCache || model.usesPreviewData)
                                .accessibilityIdentifier("CaptureCoachingRequestTime_\(offering.id)_\(slot.id)")
                            }
                        }
                    }
                    .captureCard()
                    .accessibilityElement(children: .contain)
                    .accessibilityIdentifier("CaptureCoachingPublicOffering_\(offering.id)")
                }
            }
        }
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
            HStack {
                Button {
                    showsNewAppointment = true
                } label: {
                    Label("Schedule coaching", systemImage: "calendar.badge.plus")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .disabled(
                    client.isMutating
                        || client.isUsingProtectedCache
                        || (model.usesPreviewData && !allowsPreviewSchedulingInspection)
                )
                .accessibilityIdentifier("CaptureCoachingNewAppointmentButton")

                Button {
                    showsWorkingHours = true
                } label: {
                    Label("Working hours", systemImage: "clock.badge.checkmark")
                }
                .buttonStyle(.bordered)
                .disabled(client.isMutating || client.isUsingProtectedCache)
                .accessibilityIdentifier("CaptureCoachingWorkingHoursButton")
            }
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
        .accessibilityIdentifier("CaptureCoachingConfirmedHandoff")
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
                            if let engagement = engagement(for: booking) {
                                MobileCoachingScheduleRequestReviewCard(
                                    engagement: engagement,
                                    booking: booking,
                                    previewOnly: model.usesPreviewData,
                                    onReviewRequestedTime: { proposedStart in
                                        requestedRescheduleStart = proposedStart
                                        bookingToReschedule = booking
                                    },
                                    onReviewCancellation: {
                                        bookingToCancel = booking
                                    }
                                )
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
                                .disabled(client.isMutating || client.isUsingProtectedCache || model.usesPreviewData)
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
        .disabled(client.isMutating || client.isUsingProtectedCache || model.usesPreviewData)
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
                    .disabled(client.isMutating || client.isUsingProtectedCache || model.usesPreviewData)
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
        if model.usesPreviewData,
           let session = model.sessions.first(where: {
               $0.callRoomId == roomID || $0.id == roomID
           }) {
            model.select(session)
            if navigate { visibleTab = .record }
            return
        }
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

private struct MobileCoachingScheduleRequestReviewCard: View {
    let engagement: MobileCaptureCoachingEngagement
    let booking: MobileCoachingBooking
    let previewOnly: Bool
    let onReviewRequestedTime: (Date) -> Void
    let onReviewCancellation: () -> Void
    @StateObject private var conversation = MobileEpisodeChatClient(scope: .engagement)

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if let message = pendingRequestMessage,
               let request = message.metadataJson?.coachingScheduleRequest {
                VStack(alignment: .leading, spacing: 10) {
                    Label("Client requested a change", systemImage: "calendar.badge.exclamationmark")
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(.orange)

                    Text(message.body)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    if request.kind == "RESCHEDULE",
                       let proposedStart = coachingISO8601Date(request.requestedScheduledStart ?? "") {
                        Button {
                            onReviewRequestedTime(proposedStart)
                        } label: {
                            Label("Review requested time", systemImage: "calendar.badge.clock")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("CaptureCoachingReviewRequestedTime_\(booking.id)")
                    } else if request.kind == "CANCEL" {
                        Button(role: .destructive) {
                            onReviewCancellation()
                        } label: {
                            Label("Review cancellation", systemImage: "calendar.badge.minus")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .accessibilityIdentifier("CaptureCoachingReviewRequestedCancellation_\(booking.id)")
                    }

                    Button {
                        Task { await keepCurrentAppointment(requestMessage: message) }
                    } label: {
                        Label(
                            request.kind == "CANCEL" ? "Keep Session" : "Keep current time",
                            systemImage: "calendar.badge.checkmark"
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .disabled(previewOnly || conversation.isSending || !conversation.canEdit)
                    .accessibilityHint("Confirms the existing appointment in the private coaching conversation without changing any calendar time.")
                    .accessibilityIdentifier("CaptureCoachingKeepCurrent_\(booking.id)")
                }
                .padding(12)
                .background(.orange.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .accessibilityElement(children: .contain)
                .accessibilityIdentifier("CaptureCoachingPendingChangeRequest_\(booking.id)")
            }
        }
        .task(id: engagement.id) {
            guard !previewOnly else { return }
            await conversation.load(engagement: engagement)
        }
    }

    private var pendingRequestMessage: NestChatMessage? {
        let decidedRequestIDs = Set(
            conversation.messages.compactMap {
                $0.metadataJson?.coachingScheduleDecision?.requestMessageId
            }
        )
        return conversation.messages.reversed().first { message in
            guard !decidedRequestIDs.contains(message.id),
                  let request = message.metadataJson?.coachingScheduleRequest,
                  request.schema == MobileCoachingScheduleRequestEnvelope.schemaVersion,
                  request.bookingId == booking.id,
                  let requestedCurrent = coachingISO8601Date(request.currentScheduledStart),
                  let bookingCurrent = booking.scheduledDate else { return false }
            return abs(requestedCurrent.timeIntervalSince(bookingCurrent)) < 1
        }
    }

    @MainActor
    private func keepCurrentAppointment(requestMessage: NestChatMessage) async {
        let body = "Let’s keep \(booking.title) at \(booking.scheduleLabel). Message me here if another time would work better."
        _ = await conversation.send(
            engagement: engagement,
            body: body,
            coachingScheduleDecision: MobileCoachingScheduleDecisionEnvelope(
                bookingId: booking.id,
                requestMessageId: requestMessage.id,
                decision: "KEEP_CURRENT"
            )
        )
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
                (booking.scheduledDate ?? Date()).addingTimeInterval(24 * 60 * 60),
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
                                    body: requestMessage,
                                    coachingScheduleRequest: MobileCoachingScheduleRequestEnvelope(
                                        bookingId: booking.id,
                                        kind: kind == .reschedule ? "RESCHEDULE" : "CANCEL",
                                        currentScheduledStart: booking.scheduledStart,
                                        requestedScheduledStart: kind == .reschedule
                                            ? ISO8601DateFormatter().string(from: preferredStart)
                                            : nil,
                                        note: note.trimmingCharacters(in: .whitespacesAndNewlines)
                                            .nonemptyCoachingText
                                    )
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

                relationshipPulse

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
            Label("Client space", systemImage: "person.crop.circle.fill")
                .font(.headline)
                .foregroundStyle(.teal)
            Text(engagement.participantLine)
                .font(.subheadline.weight(.semibold))
            Label("Private to the people in this coaching relationship", systemImage: "lock.fill")
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .captureCard()
        .accessibilityIdentifier("CaptureCoachingWorkspacePrivacy")
    }

    private var relationshipPulse: some View {
        let allEntries = client.workspace?.entries ?? []
        let openTasks = allEntries.filter { $0.kind == "TASK" && !$0.isComplete }
        let overdueTasks = openTasks.filter { entry in
            guard let dueAt = entry.dueAt.flatMap(coachingISO8601Date) else { return false }
            return dueAt < Date()
        }
        let activeGoals = allEntries.filter { $0.kind == "GOAL" && !$0.isComplete }
        let visibleNotes = allEntries.filter { $0.kind == "NOTE" }
        let privateNotes = visibleNotes.filter { $0.visibility == "PRIVATE" }
        let pulseSession = relationshipPulseSession

        return VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 8) {
                Text(relationshipPulseEyebrow(session: pulseSession))
                    .font(.caption2.weight(.black))
                    .textCase(.uppercase)
                    .foregroundStyle(.teal)
                Text(relationshipPulseTitle(session: pulseSession))
                    .font(.title3.weight(.black))
                Text(relationshipPulseDetail(session: pulseSession))
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if let pulseSession {
                    Button {
                        Task { await onOpenSession(pulseSession.callRoomId) }
                    } label: {
                        Label(
                            relationshipPulseAction(session: pulseSession),
                            systemImage: relationshipPulseIcon(session: pulseSession)
                        )
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(relationshipPulseIsLive(pulseSession) ? .red : .teal)
                    .disabled(previewOnly)
                    .accessibilityIdentifier("CaptureCoachingRelationshipPrimaryAction")
                } else {
                    Button {
                        if canonicalPriority?.kind == "REVIEW_OVERDUE_COMMITMENTS" {
                            filter = .tasks
                        } else {
                            isPresentingNewWork = true
                        }
                    } label: {
                        Label(
                            canonicalPriority?.kind == "REVIEW_OVERDUE_COMMITMENTS"
                                ? "Review commitments"
                                : "Add shared work",
                            systemImage: canonicalPriority?.kind == "REVIEW_OVERDUE_COMMITMENTS"
                                ? "exclamationmark.circle.fill"
                                : "plus.circle.fill"
                        )
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.teal)
                    .disabled(
                        canonicalPriority?.kind == "REVIEW_OVERDUE_COMMITMENTS"
                            ? false
                            : previewOnly || client.workspace?.canWrite != true
                    )
                    .accessibilityHint(
                        canonicalPriority?.kind == "REVIEW_OVERDUE_COMMITMENTS"
                            ? "Shows shared coaching tasks so past-due commitments can be reviewed."
                            : "Adds a shared note, task, or goal to this coaching relationship."
                    )
                    .accessibilityIdentifier("CaptureCoachingRelationshipPrimaryAction")
                }
            }

            HStack(spacing: 8) {
                relationshipMetric(
                    label: "Open",
                    value: openTasks.count,
                    systemImage: "checkmark.circle"
                )
                relationshipMetric(
                    label: "Past due",
                    value: overdueTasks.count,
                    systemImage: "exclamationmark.circle"
                )
                relationshipMetric(
                    label: "Goals",
                    value: activeGoals.count,
                    systemImage: "scope"
                )
            }

            if let carryForward = relationshipCarryForward(
                tasks: openTasks,
                goals: activeGoals,
                notes: visibleNotes
            ) {
                VStack(alignment: .leading, spacing: 5) {
                    Label("Bring forward", systemImage: carryForward.systemImage)
                        .font(.caption.weight(.bold))
                        .foregroundStyle(.teal)
                    Text(carryForward.title)
                        .font(.subheadline.weight(.bold))
                    if let detail = carryForward.detail?.nonemptyCoachingText {
                        Text(detail)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .lineLimit(3)
                    }
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.teal.opacity(0.08), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            }

            if !privateNotes.isEmpty {
                Label(
                    "\(privateNotes.count) private note\(privateNotes.count == 1 ? "" : "s") visible only to you",
                    systemImage: "lock.fill"
                )
                .font(.caption.weight(.semibold))
                .foregroundStyle(.orange)
            }
        }
        .captureCard()
        .accessibilityElement(children: .contain)
        .accessibilityIdentifier("CaptureCoachingRelationshipPulse")
    }

    private var canonicalPriority: MobileCaptureCoachingClientPriority? {
        guard let priority = engagement.priority, priority.isTrustedProjection else { return nil }
        return priority
    }

    private var relationshipPulseSession: MobileCaptureSession? {
        if let roomID = canonicalPriority?.roomId,
           let projected = sessions.first(where: {
               $0.callRoomId == roomID || $0.id == roomID
           }) {
            return projected
        }
        let now = Date()
        let live = sessions.first(where: relationshipPulseIsLive)
        let planned = sessions
            .filter { $0.status?.uppercased() == "PLANNED" }
        let upcoming = planned
            .filter { session in
                guard let start = session.scheduledStart.flatMap(coachingISO8601Date) else { return false }
                return start >= now
            }
            .sorted { left, right in
                let leftStart = left.scheduledStart.flatMap(coachingISO8601Date) ?? .distantFuture
                let rightStart = right.scheduledStart.flatMap(coachingISO8601Date) ?? .distantFuture
                return leftStart < rightStart
            }
            .first
        let late = planned
            .filter { session in
                guard let start = session.scheduledStart.flatMap(coachingISO8601Date) else { return false }
                return start < now
            }
            .sorted(by: sessionComesFirst)
            .first
        let latestEnded = sessions
            .filter { $0.status?.uppercased() == "ENDED" }
            .sorted(by: sessionComesFirst)
            .first
        return live ?? late ?? upcoming ?? latestEnded
    }

    private func relationshipPulseIsLive(_ session: MobileCaptureSession) -> Bool {
        ["OPEN", "RECORDING"].contains(session.status?.uppercased() ?? "")
    }

    private func relationshipPulseEyebrow(session: MobileCaptureSession?) -> String {
        switch canonicalPriority?.kind {
        case "JOIN_LIVE_SESSION": return "Happening now"
        case "REVIEW_LATE_SESSION": return "Needs review"
        case "PREPARE_UPCOMING_SESSION", "PREPARE_UNSCHEDULED_SESSION": return "Next Session"
        case "REVIEW_COACH_FOLLOW_UP": return "Follow-up needed"
        case "VIEW_RELEASED_FOLLOW_UP": return "Follow-up ready"
        case "REVIEW_OVERDUE_COMMITMENTS": return "Commitments"
        default: break
        }
        guard let session else { return "Next step" }
        if relationshipPulseIsLive(session) { return "Happening now" }
        if session.status?.uppercased() == "ENDED" { return "Last Session" }
        if let start = session.scheduledStart.flatMap(coachingISO8601Date), start < Date() {
            return "Needs review"
        }
        return "Next Session"
    }

    private func relationshipPulseTitle(session: MobileCaptureSession?) -> String {
        if canonicalPriority?.kind == "REVIEW_OVERDUE_COMMITMENTS" {
            return "Past-due commitments need review"
        }
        if canonicalPriority?.kind == "OPEN_RELATIONSHIP" {
            return "Keep the relationship moving"
        }
        return session?.displayTitle
            ?? canonicalPriority?.roomTitle?.nonemptyCoachingText
            ?? "Keep the relationship moving"
    }

    private func relationshipPulseDetail(session: MobileCaptureSession?) -> String {
        if canonicalPriority?.kind == "REVIEW_OVERDUE_COMMITMENTS" {
            let count = canonicalPriority?.overdueCommitmentCount ?? 0
            let subject = count == 1 ? "commitment is" : "commitments are"
            return "\(count) shared \(subject) past due. Review together before assigning anything new."
        }
        guard let session else {
            return "Use the conversation and shared work below until the next Session is scheduled."
        }
        let schedule = session.scheduledStart
            .flatMap(coachingISO8601Date)?
            .formatted(date: .abbreviated, time: .shortened)
            ?? "Time not set"
        if relationshipPulseIsLive(session) { return "The room is open · \(schedule)" }
        if session.status?.uppercased() == "ENDED" {
            var parts = [schedule]
            if session.recordingCount > 0 {
                parts.append("\(session.recordingCount) recording\(session.recordingCount == 1 ? "" : "s")")
            }
            if session.latestTranscriptStatus?.uppercased() == "COMPLETED" {
                parts.append("Transcript ready")
            }
            if session.currentFollowThrough != nil || session.clientFollowUp != nil {
                parts.append("Follow-up available")
            }
            return parts.joined(separator: " · ")
        }
        if let start = session.scheduledStart.flatMap(coachingISO8601Date), start < Date() {
            return "Scheduled for \(schedule) · open it or reschedule"
        }
        return schedule
    }

    private func relationshipPulseAction(session: MobileCaptureSession) -> String {
        switch canonicalPriority?.kind {
        case "JOIN_LIVE_SESSION": return "Join Session"
        case "REVIEW_LATE_SESSION": return "Open Session"
        case "PREPARE_UPCOMING_SESSION", "PREPARE_UNSCHEDULED_SESSION": return "Prepare Session"
        case "REVIEW_COACH_FOLLOW_UP": return "Review follow-up"
        case "VIEW_RELEASED_FOLLOW_UP": return "View follow-up"
        default: break
        }
        if relationshipPulseIsLive(session) { return "Join Session" }
        if session.status?.uppercased() == "ENDED" {
            return session.latestTranscriptStatus?.uppercased() == "COMPLETED"
                ? "Review transcript"
                : "Review Session"
        }
        if let start = session.scheduledStart.flatMap(coachingISO8601Date), start < Date() {
            return "Open Session"
        }
        return "Prepare Session"
    }

    private func relationshipPulseIcon(session: MobileCaptureSession) -> String {
        switch canonicalPriority?.kind {
        case "REVIEW_COACH_FOLLOW_UP", "VIEW_RELEASED_FOLLOW_UP":
            return "doc.text.magnifyingglass"
        case "REVIEW_LATE_SESSION":
            return "exclamationmark.circle.fill"
        default: break
        }
        if relationshipPulseIsLive(session) { return "video.fill" }
        if session.status?.uppercased() == "ENDED" { return "doc.text.magnifyingglass" }
        return "calendar.badge.clock"
    }

    private func relationshipMetric(
        label: String,
        value: Int,
        systemImage: String
    ) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Label(label, systemImage: systemImage)
                .font(.caption2.weight(.bold))
                .foregroundStyle(.secondary)
                .lineLimit(1)
            Text("\(value)")
                .font(.title3.weight(.black))
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(10)
        .background(Color.primary.opacity(0.04), in: RoundedRectangle(cornerRadius: 12, style: .continuous))
    }

    private func relationshipCarryForward(
        tasks: [MobileCoachingEngagementWorkEntry],
        goals: [MobileCoachingEngagementWorkEntry],
        notes: [MobileCoachingEngagementWorkEntry]
    ) -> (title: String, detail: String?, systemImage: String)? {
        if let overdue = tasks.first(where: { entry in
            guard let dueAt = entry.dueAt.flatMap(coachingISO8601Date) else { return false }
            return dueAt < Date()
        }) {
            return (overdue.title, overdue.body, "exclamationmark.circle.fill")
        }
        if let task = tasks.first { return (task.title, task.body, "checkmark.circle") }
        if let goal = goals.first { return (goal.title, goal.body, "scope") }
        if let note = notes.first { return (note.title, note.body, "note.text") }
        return nil
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

    private var scheduleConflict: MobileCoachingBooking? {
        client.scheduleConflict(
            startingAt: scheduledStart,
            durationMinutes: durationMinutes,
            excludingBookingID: booking.id
        )
    }

    private var isOutsideWorkingHours: Bool {
        client.isOutsideWeeklyAvailability(
            startingAt: scheduledStart,
            durationMinutes: durationMinutes
        )
    }

    init(
        client: MobileCoachingRunwayClient,
        booking: MobileCoachingBooking,
        preferredStart: Date? = nil
    ) {
        self.client = client
        self.booking = booking
        _scheduledStart = State(
            initialValue: max(preferredStart ?? booking.scheduledDate ?? Date(), Date())
        )
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
                    if let conflict = scheduleConflict {
                        Label(
                            "Conflicts with \(conflict.title) · \(conflict.scheduleLabel)",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .font(.caption)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("CaptureCoachingRescheduleConflict")
                    } else if isOutsideWorkingHours {
                        Label(
                            "Outside your working hours",
                            systemImage: "clock.badge.exclamationmark.fill"
                        )
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("CaptureCoachingRescheduleOutsideWorkingHours")
                    }
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
                    .disabled(
                        client.isMutating
                            || client.isUsingProtectedCache
                            || scheduledStart <= Date()
                            || scheduleConflict != nil
                            || isOutsideWorkingHours
                    )
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

    private var scheduleConflict: MobileCoachingBooking? {
        client.scheduleConflict(
            startingAt: draft.scheduledStart,
            durationMinutes: draft.durationMinutes
        )
    }

    private var isOutsideWorkingHours: Bool {
        client.isOutsideWeeklyAvailability(
            startingAt: draft.scheduledStart,
            durationMinutes: draft.durationMinutes
        )
    }

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
                    if let conflict = scheduleConflict {
                        Label(
                            "Conflicts with \(conflict.title) · \(conflict.scheduleLabel)",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .font(.caption)
                        .foregroundStyle(.red)
                        .accessibilityIdentifier("CaptureCoachingAppointmentConflict")
                    } else if isOutsideWorkingHours {
                        Label(
                            "Outside your working hours",
                            systemImage: "clock.badge.exclamationmark.fill"
                        )
                        .font(.caption)
                        .foregroundStyle(.orange)
                        .accessibilityIdentifier("CaptureCoachingAppointmentOutsideWorkingHours")
                    }
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
                    .disabled(
                        client.isMutating
                            || client.isUsingProtectedCache
                            || !draft.isReady
                            || scheduleConflict != nil
                            || isOutsideWorkingHours
                    )
                    .accessibilityIdentifier("CaptureCoachingCreateAppointment")
                }
            }
            .onAppear { focusedField = .email }
        }
        .accessibilityIdentifier("CaptureCoachingAppointmentSheet")
    }
}

private struct MobileCoachingAvailabilitySheet: View {
    @Environment(\.dismiss) private var dismiss
    @ObservedObject var client: MobileCoachingRunwayClient
    @State private var selectedDays: Set<Int>
    @State private var startMinute: Int
    @State private var endMinute: Int

    private let dayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
    private let timeOptions = Array(stride(from: 0, through: 24 * 60, by: 30))

    init(client: MobileCoachingRunwayClient) {
        self.client = client
        let windows = client.weeklyAvailability
        _selectedDays = State(
            initialValue: windows.isEmpty
                ? Set(1...5)
                : Set(windows.compactMap(\.dayOfWeek))
        )
        _startMinute = State(initialValue: windows.first?.startMinute ?? 9 * 60)
        _endMinute = State(initialValue: windows.first?.endMinute ?? 17 * 60)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    Text("Choose when clients can be scheduled. Quipsly still checks existing Sessions before anything is saved.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }

                Section("Days") {
                    HStack(spacing: 7) {
                        ForEach(dayLabels.indices, id: \.self) { day in
                            Button {
                                if selectedDays.contains(day) {
                                    selectedDays.remove(day)
                                } else {
                                    selectedDays.insert(day)
                                }
                            } label: {
                                Text(dayLabels[day])
                                    .font(.caption.weight(.bold))
                                    .frame(maxWidth: .infinity, minHeight: 32)
                                    .foregroundStyle(selectedDays.contains(day) ? .white : .primary)
                                    .background(
                                        selectedDays.contains(day) ? Color.teal : Color.secondary.opacity(0.12),
                                        in: Capsule()
                                    )
                            }
                            .buttonStyle(.plain)
                            .accessibilityLabel(dayLabels[day])
                            .accessibilityValue(selectedDays.contains(day) ? "Selected" : "Not selected")
                            .accessibilityIdentifier("CaptureCoachingWorkingDay_\(day)")
                        }
                    }
                }

                Section("Hours") {
                    Picker("Start", selection: $startMinute) {
                        ForEach(timeOptions.dropLast(), id: \.self) { minute in
                            Text(coachingTimeLabel(minute)).tag(minute)
                        }
                    }
                    Picker("End", selection: $endMinute) {
                        ForEach(timeOptions.dropFirst(), id: \.self) { minute in
                            Text(coachingTimeLabel(minute)).tag(minute)
                        }
                    }
                    LabeledContent("Time zone", value: TimeZone.current.identifier)
                }

                if selectedDays.isEmpty || endMinute <= startMinute {
                    Section {
                        Label(
                            selectedDays.isEmpty
                                ? "Choose at least one day."
                                : "End time must be after start time.",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .foregroundStyle(.orange)
                    }
                }

                if let error = client.errorMessage {
                    Section { Text(error).foregroundStyle(.red) }
                }
            }
            .navigationTitle("Working hours")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(client.isMutating ? "Saving…" : "Save") {
                        Task {
                            if await client.updateWeeklyAvailability(
                                days: selectedDays,
                                startMinute: startMinute,
                                endMinute: endMinute
                            ) {
                                dismiss()
                            }
                        }
                    }
                    .disabled(
                        client.isMutating
                            || client.isUsingProtectedCache
                            || selectedDays.isEmpty
                            || endMinute <= startMinute
                    )
                    .accessibilityIdentifier("CaptureCoachingSaveWorkingHours")
                }
            }
        }
        .interactiveDismissDisabled(client.isMutating)
        .accessibilityIdentifier("CaptureCoachingWorkingHoursSheet")
    }
}

private func coachingTimeLabel(_ minute: Int) -> String {
    if minute == 24 * 60 { return "Midnight" }
    let hour = minute / 60
    let minutePart = minute % 60
    let suffix = hour < 12 ? "AM" : "PM"
    let displayHour = hour % 12 == 0 ? 12 : hour % 12
    return String(format: "%d:%02d %@", displayHour, minutePart, suffix)
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
