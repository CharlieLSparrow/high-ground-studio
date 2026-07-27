import Foundation
import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
@MainActor
final class MacCaptureRoomReceiptOutboxTests: XCTestCase {
    func testStartAndStopAreDurableIdempotentAndOrdered() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let captureID = UUID()
        let outbox = MacCaptureRoomReceiptOutbox(
            rootDirectory: root
        )

        let start = try outbox.enqueueStart(
            ownerAccountID: "Charlie@Example.com",
            captureID: captureID,
            sessionID: "session-1",
            callRoomID: "room-1",
            occurredAt: Date(timeIntervalSince1970: 100)
        )
        let replayedStart = try outbox.enqueueStart(
            ownerAccountID: "charlie@example.com",
            captureID: captureID,
            sessionID: "session-1",
            callRoomID: "room-1"
        )
        let stop = try outbox.enqueueStop(
            ownerAccountID: "charlie@example.com",
            captureID: captureID,
            sessionID: "session-1",
            callRoomID: "room-1",
            occurredAt: Date(timeIntervalSince1970: 101)
        )

        XCTAssertEqual(start.id, replayedStart.id)
        XCTAssertEqual(outbox.receipts.count, 2)
        let reopened = MacCaptureRoomReceiptOutbox(
            rootDirectory: root
        )
        XCTAssertEqual(
            reopened.pendingReceipts(
                ownerAccountID: "charlie@example.com"
            ).map(\.id),
            [start.id, stop.id]
        )
    }

    func testStopCannotCrossOwnerOrRoomBoundary() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let captureID = UUID()
        let outbox = MacCaptureRoomReceiptOutbox(
            rootDirectory: root
        )
        _ = try outbox.enqueueStart(
            ownerAccountID: "charlie@example.com",
            captureID: captureID,
            sessionID: "session-1",
            callRoomID: "room-1"
        )

        XCTAssertThrowsError(
            try outbox.enqueueStop(
                ownerAccountID: "homer@example.com",
                captureID: captureID,
                sessionID: "session-1",
                callRoomID: "room-1"
            )
        )
        XCTAssertThrowsError(
            try outbox.enqueueStop(
                ownerAccountID: "charlie@example.com",
                captureID: captureID,
                sessionID: "session-1",
                callRoomID: "room-2"
            )
        )
        XCTAssertEqual(outbox.receipts.count, 1)
    }

    func testRelaunchClosesOrphanedStartBeforeReplay() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let captureID = UUID()
        var outbox: MacCaptureRoomReceiptOutbox? =
            MacCaptureRoomReceiptOutbox(rootDirectory: root)
        _ = try outbox?.enqueueStart(
            ownerAccountID: "charlie@example.com",
            captureID: captureID,
            sessionID: "session-1",
            callRoomID: "room-1",
            occurredAt: Date(timeIntervalSince1970: 100)
        )
        outbox = nil

        let reopened = MacCaptureRoomReceiptOutbox(
            rootDirectory: root
        )
        let stops = try reopened.closeOrphanedStarts(
            ownerAccountID: "charlie@example.com",
            at: Date(timeIntervalSince1970: 110)
        )

        XCTAssertEqual(stops.count, 1)
        XCTAssertEqual(stops.first?.captureID, captureID)
        XCTAssertEqual(
            reopened.pendingReceipts(
                ownerAccountID: "charlie@example.com"
            ).map(\.action),
            [.start, .stop]
        )
    }

    func testUnreadableCanonicalLedgerIsPreservedAndFailsClosed() throws {
        let root = temporaryRoot()
        defer { try? FileManager.default.removeItem(at: root) }
        let captureID = UUID()
        var outbox: MacCaptureRoomReceiptOutbox? =
            MacCaptureRoomReceiptOutbox(rootDirectory: root)
        _ = try outbox?.enqueueStart(
            ownerAccountID: "charlie@example.com",
            captureID: captureID,
            sessionID: "session-1",
            callRoomID: "room-1"
        )
        let ledgerURL = try XCTUnwrap(outbox?.ledgerURL)
        outbox = nil
        try Data("{not-json".utf8).write(
            to: ledgerURL,
            options: .atomic
        )

        let quarantined = MacCaptureRoomReceiptOutbox(
            rootDirectory: root
        )

        XCTAssertFalse(quarantined.isWritable)
        XCTAssertEqual(quarantined.receipts.count, 1)
        XCTAssertNotNil(quarantined.quarantinedLedgerURL)
        XCTAssertThrowsError(
            try quarantined.enqueueStart(
                ownerAccountID: "charlie@example.com",
                captureID: UUID(),
                sessionID: "session-1",
                callRoomID: "room-1"
            )
        )
    }

    private func temporaryRoot() -> URL {
        FileManager.default.temporaryDirectory
            .appendingPathComponent(
                "quipsly-mac-room-outbox-\(UUID().uuidString)",
                isDirectory: true
            )
    }
}
#endif
