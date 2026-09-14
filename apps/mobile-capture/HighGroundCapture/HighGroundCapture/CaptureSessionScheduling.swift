import Foundation

enum CaptureSessionScheduling {
    typealias Candidate = (id: String, startsAt: String?, status: String?)

    static func isClosed(status: String?) -> Bool {
        ["ENDED", "CANCELED", "FAILED"].contains(status?.uppercased() ?? "")
    }

    /// Prefer current work and upcoming appointments over old rooms that were
    /// never explicitly ended. Missing times remain usable, but terminal rooms
    /// never masquerade as the next appointment.
    static func nextID(in sessions: [Candidate], now: Date = Date()) -> String? {
        let ranked = sessions.compactMap { session -> (id: String, priority: Int, time: TimeInterval)? in
            let status = session.status?.uppercased() ?? ""
            guard !isClosed(status: status) else { return nil }
            let date = session.startsAt.flatMap { CaptureDateCoding.date(from: $0) }
            if status == "RECORDING" { return (session.id, 0, -(date?.timeIntervalSince1970 ?? 0)) }
            if let date, date >= now { return (session.id, 1, date.timeIntervalSince1970) }
            guard let date else { return (session.id, 2, 0) }
            return (session.id, 3, -date.timeIntervalSince1970)
        }
        return ranked.min {
            if $0.priority != $1.priority { return $0.priority < $1.priority }
            if $0.time != $1.time { return $0.time < $1.time }
            return $0.id < $1.id
        }?.id
    }

    static func heading(startsAt: String?, status: String?, now: Date = Date()) -> String {
        if status?.uppercased() == "RECORDING" { return "IN PROGRESS" }
        if let date = startsAt.flatMap({ CaptureDateCoding.date(from: $0) }), date >= now { return "UP NEXT" }
        return "CONTINUE"
    }
}
