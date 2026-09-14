import Foundation

@main
enum CaptureSessionSchedulingTests {
    static func main() {
        let now = CaptureDateCoding.date(from: "2026-09-13T18:00:00Z")!
        let old: CaptureSessionScheduling.Candidate = ("old", "2026-09-09T20:30:26.000Z", "OPEN")
        let recent: CaptureSessionScheduling.Candidate = ("recent", "2026-09-13T17:00:00.000Z", "OPEN")
        let upcoming: CaptureSessionScheduling.Candidate = ("next", "2026-09-13T20:00:00.000Z", "PLANNED")
        let later: CaptureSessionScheduling.Candidate = ("later", "2026-09-14T08:00:00-06:00", "PLANNED")
        let ongoing: CaptureSessionScheduling.Candidate = ("ongoing", "2026-09-13T17:30:00Z", "RECORDING")
        precondition(CaptureSessionScheduling.nextID(in: [old, later, recent, upcoming], now: now) == "next")
        precondition(CaptureSessionScheduling.nextID(in: [upcoming, ongoing], now: now) == "ongoing")
        precondition(CaptureSessionScheduling.nextID(in: [old, recent], now: now) == "recent")
        precondition(CaptureSessionScheduling.nextID(in: [old, ("unscheduled", nil, "OPEN")], now: now) == "unscheduled")
        precondition(CaptureSessionScheduling.nextID(in: [("ended", nil, "ENDED"), ("canceled", nil, "CANCELED"), ("failed", nil, "FAILED")], now: now) == nil)
        precondition(CaptureSessionScheduling.nextID(in: [], now: now) == nil)
        precondition(CaptureSessionScheduling.isClosed(status: "ended"))
        precondition(CaptureSessionScheduling.isClosed(status: "CANCELED"))
        precondition(CaptureSessionScheduling.isClosed(status: "FAILED"))
        precondition(!CaptureSessionScheduling.isClosed(status: "OPEN"))
        precondition(!CaptureSessionScheduling.isClosed(status: "RECORDING"))
        precondition(!CaptureSessionScheduling.isClosed(status: nil))
        precondition(CaptureSessionScheduling.nextID(in: [("a", "invalid", "OPEN"), upcoming], now: now) == "next")
        // Local clock text sorts differently from the actual appointment instants.
        precondition(CaptureSessionScheduling.nextID(in: [("offset", "2026-09-13T14:00:00-06:00", "OPEN"),
                                                         ("utc", "2026-09-13T19:00:00Z", "OPEN")], now: now) == "utc")
        precondition(CaptureSessionScheduling.nextID(in: [("b", nil, "OPEN"), ("a", nil, "OPEN")], now: now) == "a")
        precondition(CaptureSessionScheduling.heading(startsAt: old.startsAt, status: old.status, now: now) == "CONTINUE")
        precondition(CaptureSessionScheduling.heading(startsAt: upcoming.startsAt, status: upcoming.status, now: now) == "UP NEXT")
        precondition(CaptureSessionScheduling.heading(startsAt: ongoing.startsAt, status: ongoing.status, now: now) == "IN PROGRESS")
        print("PASS session scheduling: upcoming appointments, ongoing calls, recent unfinished work, terminal rooms, invalid dates and timezone offsets")
    }
}
