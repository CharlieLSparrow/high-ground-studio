import Foundation

@main
struct CaptureDateCodingTests {
    struct Clock: Codable {
        let sent: Date
        let received: Date
    }

    static func main() throws {
        let encoder = JSONEncoder()
        CaptureDateCoding.configure(encoder)
        let decoder = JSONDecoder()
        CaptureDateCoding.configure(decoder)
        let original = Clock(
            sent: Date(timeIntervalSince1970: 1_788_983_472.1234),
            received: Date(timeIntervalSince1970: 1_788_983_472.1584)
        )
        let encoded = try encoder.encode(original)
        let restored = try decoder.decode(Clock.self, from: encoded)
        precondition(abs(restored.sent.timeIntervalSince(original.sent)) < 0.001)
        precondition(abs(restored.received.timeIntervalSince(original.received)) < 0.001)
        precondition(abs(restored.received.timeIntervalSince(restored.sent) - 0.035) < 0.001)
        let wireTimestamp = CaptureDateCoding.string(from: original.sent)
        precondition(String(decoding: encoded, as: UTF8.self).contains(wireTimestamp))
        precondition(wireTimestamp.contains(".123Z"))
        precondition(abs(CaptureDateCoding.date(from: wireTimestamp)!.timeIntervalSince(original.sent)) < 0.001)
        precondition(CaptureDateCoding.date(from: "2026-09-09T19:51:12Z") != nil)
        precondition(CaptureDateCoding.date(from: "not a date") == nil)
        // Existing recordings must remain readable when their ledger predates
        // fractional timestamps. Loading them cannot invent lost precision.
        let legacy = Data(#"{"sent":"2026-09-09T19:51:12Z","received":"2026-09-09T19:51:13Z"}"#.utf8)
        let old = try decoder.decode(Clock.self, from: legacy)
        precondition(old.received.timeIntervalSince(old.sent) == 1)
        print("PASS Capture date coding preserves millisecond clock timing and reads existing ledgers")
    }
}
