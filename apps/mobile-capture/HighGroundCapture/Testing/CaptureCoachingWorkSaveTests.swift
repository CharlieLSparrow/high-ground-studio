import Foundation

@main
enum CaptureCoachingWorkSaveTests {
    static func main() {
        for kind in ["NOTE", "TASK", "GOAL"] {
            let original = CaptureCoachingWorkDraft(
                kind: kind, title: "First step", body: "Write a page", visibility: "PRIVATE",
                ownerUserID: "client", status: kind == "GOAL" ? "ACTIVE" : "OPEN", targetAt: nil
            )
            let attempt = CaptureCoachingCreateAttempt(requestID: "one-command", original: original)
            var edited = original
            edited.title = "A clearer first step"
            expect(attempt.body["title"] as? String == original.title, "retry retains submitted content")
            expect(attempt.body["clientRequestId"] as? String == "one-command", "retry identity remains stable")
            expect(attempt.body["kind"] as? String == kind, "kind remains bound to the command")
            expect(attempt.body["sourceMessageId"] == nil, "manual work does not invent a conversation source")
            let sourced = CaptureCoachingCreateAttempt(requestID: "message-command", original: original, sourceMessageID: "message-1")
            expect(sourced.body["sourceMessageId"] as? String == "message-1", "retries retain their exact source message")
            expect(sourced.body["clientRequestId"] as? String == "message-command", "sourced work uses normal idempotency")
            var latest = original
            latest.body = "A collaborator's additional context"
            let merged = edited.amendment(from: original, to: latest)
            expect(merged.conflicts.isEmpty, "independent edits merge")
            expect(merged.body["title"] as? String == edited.title, "changed title applies")
            expect(merged.body["body"] as? String == latest.body, "collaborator details survive")
            latest.title = "A competing title"
            expect(edited.amendment(from: original, to: latest).conflicts == ["title"], "overlap is explicit")
            latest.title = edited.title
            expect(edited.amendment(from: original, to: latest).conflicts.isEmpty, "lost amendment reply is retryable")
            if kind == "NOTE" {
                expect(attempt.body["ownerUserId"] == nil, "notes do not assign an owner")
                expect(merged.body["visibility"] as? String == "PRIVATE", "private stays private")
            } else {
                expect(attempt.body["targetAt"] is NSNull, "no date is JSON null")
                latest.status = kind == "TASK" ? "DONE" : "ACHIEVED"
                let result = edited.amendment(from: original, to: latest)
                expect(result.body["status"] as? String == latest.status, "collaborator completion survives retry")
                expect(result.body["targetAt"] is NSNull, "cleared date remains JSON null")
            }
        }
        print("PASS canonical work creation retry, source binding, and amendment checks")
        testScheduleUpdates()
    }

    private static func testScheduleUpdates() {
        let start = ISO8601DateFormatter().date(from: "2026-11-01T08:30:00Z")!
        for notify in [true, false] {
            let body = MobileCoachingScheduleChange(bookingID: "retained-booking", scheduledStart: start,
                durationMinutes: 60, timezone: "America/Denver", notifyClient: notify).body
            expect(body["action"] as? String == "reschedule-booking", "native uses the canonical reschedule endpoint")
            expect(body["bookingId"] as? String == "retained-booking", "reschedule retains booking identity")
            expect(body["scheduledStart"] as? String == "2026-11-01T08:30:00Z", "ambiguous daylight-saving hours retain their exact instant")
            expect(body["notifyClient"] as? Bool == notify, "the explicit notification choice reaches the server")
            expect(body["timezone"] as? String == "America/Denver", "time zone is explicit")
        }
        for (status, label) in [("PLANNED", "queued"), ("SENT", "delivery pending"),
            ("DELIVERED", "delivered"), ("FAILED", "retry"), ("BOUNCED", "could not be delivered")] {
            let data = Data("{\"id\":\"retained-update\",\"status\":\"\(status)\"}".utf8)
            let notice = try! JSONDecoder().decode(MobileCoachingScheduleNotification.self, from: data)
            expect(notice.label.contains(label), "delivery state must not overstate email success")
        }
        let local = MobileCoachingScheduleNotification(id: "local", status: "CANCELED", errorCode: "LOCAL_TEST_RECIPIENT")
        expect(local.label.contains("without sending"), "synthetic retention is not delivery")
        print("PASS 16 scheduling command and notification projection checks")
    }

    private static func expect(_ condition: @autoclosure () -> Bool, _ message: String) {
        guard condition() else { fatalError(message) }
    }
}
