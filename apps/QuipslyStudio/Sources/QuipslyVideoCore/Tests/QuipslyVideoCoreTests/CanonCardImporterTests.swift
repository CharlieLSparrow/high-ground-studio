import AVFoundation
import CryptoKit
import Foundation
import XCTest
@testable import QuipslyVideoCore

#if os(macOS)
final class CanonCardImporterTests: XCTestCase {
    func testImportCreatesByteIdenticalManagedOriginalAndDurableReceipt() async throws {
        let source = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()
            .appendingPathComponent("../../../../Charlie.mp4")
            .standardizedFileURL
        XCTAssertTrue(FileManager.default.fileExists(atPath: source.path))

        let root = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString, isDirectory: true)
        defer { try? FileManager.default.removeItem(at: root) }
        let sourceBefore = try source.resourceValues(
            forKeys: [.fileSizeKey, .contentModificationDateKey]
        )
        let captureGroupID = UUID()
        let importID = UUID()

        let receipt = try await CanonCardImporter.importOriginal(
            configuration: CanonCardImportConfiguration(
                importID: importID,
                captureGroupID: captureGroupID,
                episodeSpaceID: "HGO Episode 5",
                participantID: "charlie",
                sourceURL: source,
                rootDirectory: root
            )
        )

        XCTAssertEqual(receipt.state, .finalized)
        XCTAssertEqual(receipt.captureGroupID, captureGroupID)
        XCTAssertEqual(receipt.importID, importID)
        XCTAssertEqual(receipt.sourceKind, "camera_card_original")
        XCTAssertEqual(receipt.episodeAttachmentState, "ready-for-local-editor-attachment")
        XCTAssertEqual(receipt.alignmentState, "needs-alignment")
        XCTAssertTrue(receipt.byteIdentityVerified)
        XCTAssertEqual(receipt.sourceSHA256, receipt.managedOriginalSHA256)
        XCTAssertEqual(receipt.sourceByteCount, receipt.managedOriginalByteCount)
        XCTAssertGreaterThan(receipt.technicalProbe.durationSeconds, 0)
        XCTAssertGreaterThan(receipt.technicalProbe.width, 0)
        XCTAssertGreaterThan(receipt.technicalProbe.height, 0)
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: receipt.managedOriginalPath)
        )
        XCTAssertTrue(
            FileManager.default.fileExists(atPath: receipt.receiptPath)
        )
        XCTAssertNil(receipt.partialManagedOriginalPath)
        XCTAssertTrue(receipt.truth.contains("independently hashed"))
        XCTAssertTrue(receipt.truth.contains("user-declared"))

        let decoded = try JSONDecoder.quipslyReceiptDecoder.decode(
            CanonCardImportReceipt.self,
            from: Data(contentsOf: URL(fileURLWithPath: receipt.receiptPath))
        )
        XCTAssertEqual(decoded.importID, receipt.importID)
        XCTAssertEqual(decoded.captureGroupID, receipt.captureGroupID)
        XCTAssertEqual(decoded.state, .finalized)
        XCTAssertEqual(decoded.sourceSHA256, receipt.sourceSHA256)
        XCTAssertEqual(
            decoded.managedOriginalSHA256,
            receipt.managedOriginalSHA256
        )
        XCTAssertEqual(decoded.sourceByteCount, receipt.sourceByteCount)
        XCTAssertEqual(
            decoded.managedOriginalByteCount,
            receipt.managedOriginalByteCount
        )
        XCTAssertEqual(decoded.technicalProbe, receipt.technicalProbe)
        XCTAssertEqual(decoded.truth, receipt.truth)

        let sourceAfter = try source.resourceValues(
            forKeys: [.fileSizeKey, .contentModificationDateKey]
        )
        XCTAssertEqual(sourceAfter.fileSize, sourceBefore.fileSize)
        XCTAssertEqual(
            sourceAfter.contentModificationDate,
            sourceBefore.contentModificationDate
        )
    }

    func testTechnicalProbeRejectsUnsupportedContainerBeforeCopy() async {
        let source = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("txt")

        do {
            _ = try await CanonCardImporter.technicalProbe(at: source)
            XCTFail("Expected an unsupported-container error.")
        } catch {
            XCTAssertEqual(
                error as? CanonCardImporterError,
                .unsupportedContainer("txt")
            )
        }
    }
}

private extension JSONDecoder {
    static var quipslyReceiptDecoder: JSONDecoder {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }
}
#endif
