import Foundation

/// The native projection of the server's durable schedule-update delivery.
struct MobileCoachingScheduleNotification: Codable, Hashable {
    let id: String
    let status: String
    let errorCode: String?

    var label: String {
        if errorCode == "LOCAL_TEST_RECIPIENT" { return "Local test email retained without sending." }
        switch status {
        case "PLANNED", "SENDING": return "Client email update queued."
        case "DELIVERED": return "Client email update delivered."
        case "SENT", "DELIVERY_DELAYED": return "Client email update sent; delivery pending."
        case "FAILED": return "Client email update not sent yet. Quipsly will retry."
        case "BOUNCED": return "Client email update could not be delivered. Check their email or contact them directly."
        default: return "Client email update was not sent. Check their email or contact them directly."
        }
    }

    var needsAttention: Bool {
        !["PLANNED", "SENDING", "DELIVERED", "SENT", "DELIVERY_DELAYED"].contains(status)
    }
}

struct MobileCoachingScheduleChange {
    let bookingID: String
    let scheduledStart: Date
    let durationMinutes: Int
    let timezone: String
    let notifyClient: Bool

    var body: [String: Any] {
        [
            "action": "reschedule-booking",
            "bookingId": bookingID,
            "scheduledStart": ISO8601DateFormatter().string(from: scheduledStart),
            "durationMinutes": max(15, durationMinutes),
            "timezone": timezone,
            "notifyClient": notifyClient,
        ]
    }
}
