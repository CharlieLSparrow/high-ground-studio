import Accelerate
import AVFoundation
import AudioToolbox
import CryptoKit
import Foundation

#if os(macOS)

public enum ProductionCaptureTakeAuditCheckStatus:
    String,
    Codable,
    Equatable,
    Sendable
{
    case pass
    case warning
    case hold
}

public struct ProductionCaptureTakeAuditCheck:
    Codable,
    Equatable,
    Identifiable,
    Sendable
{
    public let id: String
    public let status: ProductionCaptureTakeAuditCheckStatus
    public let summary: String

    public init(
        id: String,
        status: ProductionCaptureTakeAuditCheckStatus,
        summary: String
    ) {
        self.id = id
        self.status = status
        self.summary = summary
    }
}

public struct ProductionCaptureAudioProbe:
    Codable,
    Equatable,
    Sendable
{
    public let sampleRate: Double
    public let channelCount: Int
    public let bitDepth: Int?
    public let formatID: UInt32?
    public let frameCount: Int64
    public let durationSeconds: Double
    public let peakMagnitude: Double?
    public let rmsMagnitude: Double?
}

public struct ProductionCaptureVideoProbe:
    Codable,
    Equatable,
    Sendable
{
    public let durationSeconds: Double
    public let width: Int
    public let height: Int
    public let nominalFrameRate: Double
    public let videoCodec: String
    public let videoTrackCount: Int
    public let audioTrackCount: Int
}

public struct ProductionCaptureTakeSourceAudit:
    Codable,
    Equatable,
    Sendable
{
    public let sourceType: String
    public let sourceID: UUID
    public let filePath: String
    public let expectedByteCount: Int64?
    public let actualByteCount: Int64?
    public let expectedSHA256: String?
    public let actualSHA256: String?
    public let audioProbe: ProductionCaptureAudioProbe?
    public let videoProbe: ProductionCaptureVideoProbe?
    public let inspectionError: String?
}

public enum ProductionCaptureTakeAuditDisposition:
    String,
    Codable,
    Equatable,
    Sendable
{
    case held
    case machinePassHumanReviewRequired =
        "machine-pass-human-review-required"
}

public struct ProductionCaptureTakeAuditReceipt:
    Codable,
    Equatable,
    Identifiable,
    Sendable
{
    public let schemaVersion: Int
    public let id: UUID
    public let generatedAt: Date
    public let captureGroupID: UUID
    public let episodeSpaceID: String
    public let participantID: String
    public let audio: ProductionCaptureTakeSourceAudit
    public let video: ProductionCaptureTakeSourceAudit
    public let roomBinding: ProductionCaptureRoomBinding?
    public let sharedClockSamples:
        [ProductionCaptureClockSample]
    public let videoStartOffsetFromAudioSeconds: Double
    public let disposition:
        ProductionCaptureTakeAuditDisposition
    public let checks: [ProductionCaptureTakeAuditCheck]
    public let humanReviewRequired: [String]
    public let receiptPath: String
    public let truth: String

    public var holdCount: Int {
        checks.filter { $0.status == .hold }.count
    }

    public var warningCount: Int {
        checks.filter { $0.status == .warning }.count
    }
}

public enum ProductionCaptureTakeAuditorError:
    LocalizedError,
    Equatable
{
    case receiptCollision
    case unableToEncodeReceipt

    public var errorDescription: String? {
        switch self {
        case .receiptCollision:
            "A take-audit receipt already exists at the protected destination."
        case .unableToEncodeReceipt:
            "Quipsly could not encode the take-audit receipt."
        }
    }
}

public enum ProductionCaptureTakeAuditor {
    public static func audit(
        audio: ProductionAudioRecordingReceipt,
        video: ProductionVideoReferenceReceipt,
        rootDirectory: URL,
        auditID: UUID = UUID(),
        generatedAt: Date = Date()
    ) async throws -> ProductionCaptureTakeAuditReceipt {
        async let audioInspection = inspectAudio(audio)
        async let videoInspection = inspectVideo(video)
        let (audioAudit, videoAudit) = await (
            audioInspection,
            videoInspection
        )

        var checks: [ProductionCaptureTakeAuditCheck] = []
        func append(
            _ id: String,
            _ status: ProductionCaptureTakeAuditCheckStatus,
            _ summary: String
        ) {
            checks.append(
                ProductionCaptureTakeAuditCheck(
                    id: id,
                    status: status,
                    summary: summary
                )
            )
        }

        append(
            "source-states-finalized",
            audio.state == .finalized
                && video.state == .finalized
                && audio.partialAudioPath == nil
                && video.partialVideoPath == nil
                ? .pass
                : .hold,
            audio.state == .finalized
                && video.state == .finalized
                && audio.partialAudioPath == nil
                && video.partialVideoPath == nil
                ? "Both source receipts are finalized with no partial path."
                : "Both sources must be finalized and free of partial-path claims."
        )

        let identityMatches =
            audio.captureGroupID == video.captureGroupID
            && audio.episodeSpaceID == video.episodeSpaceID
            && audio.participantID == video.participantID
        append(
            "same-take-identity",
            identityMatches ? .pass : .hold,
            identityMatches
                ? "Audio and video name the same capture group, episode, and participant."
                : "Audio and video do not name the same capture group, episode, and participant."
        )

        let audioAuthorityComplete =
            authorityIsCompleteOrAbsent(
                owner: audio.ownerAccountID,
                room: audio.callRoomID,
                consent: audio.recordingConsentID,
                startReceiptID: audio.startReceiptID
            )
        let videoAuthorityComplete =
            authorityIsCompleteOrAbsent(
                owner: video.ownerAccountID,
                room: video.callRoomID,
                consent: video.recordingConsentID,
                startReceiptID: video.startReceiptID
            )
        append(
            "authority-fields-complete-or-absent",
            audioAuthorityComplete && videoAuthorityComplete
                ? .pass
                : .hold,
            audioAuthorityComplete && videoAuthorityComplete
                ? "Neither source contains a partial account, room, consent, or START authority."
                : "At least one source contains partial Episode Room authority."
        )

        let audioBinding = audio.roomBinding
        let videoBinding = video.roomBinding
        let bindingMatches =
            (audioBinding == nil && videoBinding == nil)
            || (
                audioBinding != nil
                && audioBinding == videoBinding
            )
        append(
            "same-room-authority",
            bindingMatches ? .pass : .hold,
            bindingMatches
                ? audioBinding == nil
                    ? "Both sources are explicitly local-only."
                    : "Both sources carry the exact same account, room, consent, and applied START authority."
                : "Audio and video Episode Room authority differs."
        )

        appendFileChecks(
            source: audioAudit,
            expectedLabel: "WAV",
            checks: &checks
        )
        appendFileChecks(
            source: videoAudit,
            expectedLabel: "MOV",
            checks: &checks
        )
        appendAudioRouteContinuityCheck(
            receipt: audio,
            checks: &checks
        )
        appendAudioShapeChecks(
            receipt: audio,
            probe: audioAudit.audioProbe,
            checks: &checks
        )
        appendVideoShapeChecks(
            receipt: video,
            probe: videoAudit.videoProbe,
            checks: &checks
        )
        appendVideoSignalVerificationCheck(
            receipt: video,
            checks: &checks
        )

        let audioClock = audio.clockSamples ?? []
        let videoClock = video.clockSamples ?? []
        let clocksMatch = audioClock == videoClock
        append(
            "shared-clock-burst",
            clocksMatch ? .pass : .hold,
            clocksMatch
                ? "Audio and video preserve the same capture-clock sample set."
                : "Audio and video capture-clock evidence differs."
        )
        if clocksMatch && audioClock.isEmpty {
            append(
                "clock-evidence-present",
                .warning,
                "No capture-clock samples are present. Waveform and drift review remain mandatory."
            )
        } else if clocksMatch {
            let clockIdentityMatches = audioClock.allSatisfy {
                $0.captureGroupId == audio.captureGroupID
                    && $0.callRoomId
                        == audioBinding?.callRoomID
            }
            append(
                "clock-evidence-identity",
                clockIdentityMatches ? .pass : .hold,
                clockIdentityMatches
                    ? "Every clock sample names this capture group and Episode Room."
                    : "At least one clock sample belongs to a different capture group or room."
            )
        }

        let monotonicBoundariesValid =
            validMonotonicBoundary(
                start: audio.startedMonotonicNanoseconds,
                stop: audio.stoppedMonotonicNanoseconds
            )
            && validMonotonicBoundary(
                start: video.startedMonotonicNanoseconds,
                stop: video.stoppedMonotonicNanoseconds
            )
        append(
            "monotonic-source-boundaries",
            monotonicBoundariesValid ? .pass : .hold,
            monotonicBoundariesValid
                ? "Both source clocks have an ordered start and stop boundary."
                : "At least one source has a missing or non-increasing monotonic boundary."
        )

        let startOffset = signedSeconds(
            video.startedMonotonicNanoseconds,
            relativeTo: audio.startedMonotonicNanoseconds
        )
        append(
            "source-start-separation",
            abs(startOffset) <= 5 ? .pass : .warning,
            abs(startOffset) <= 5
                ? "Video starts \(formatSeconds(startOffset)) relative to audio; this is a bounded first-placement clue."
                : "Video starts \(formatSeconds(startOffset)) relative to audio. Review the unexpectedly large separation before alignment."
        )

        let receiptURL = auditReceiptURL(
            rootDirectory: rootDirectory,
            episodeSpaceID: audio.episodeSpaceID,
            captureGroupID: audio.captureGroupID,
            auditID: auditID
        )
        let disposition:
            ProductionCaptureTakeAuditDisposition =
                checks.contains { $0.status == .hold }
                    ? .held
                    : .machinePassHumanReviewRequired
        let humanReview = [
            "Watch the camera reference from start through stop.",
            "Listen to the microphone master through the intended headphones.",
            "Correlate a visible/audible sync event or waveforms.",
            "Review drift near the end of the take.",
            "Explicitly approve or revise the timeline placement.",
        ]
        let truth = disposition == .held
            ? "Machine inspection found at least one integrity, identity, authority, or media-shape hold. The source bytes and receipts remain preserved; do not call this take accepted."
            : "Machine inspection re-read both source files and their immutable receipts. The bytes and structural invariants pass, but this is not a watch, listen, lip-sync, drift, creative, or publication approval."
        let receipt = ProductionCaptureTakeAuditReceipt(
            schemaVersion: 1,
            id: auditID,
            generatedAt: generatedAt,
            captureGroupID: audio.captureGroupID,
            episodeSpaceID: audio.episodeSpaceID,
            participantID: audio.participantID,
            audio: audioAudit,
            video: videoAudit,
            roomBinding:
                bindingMatches ? audioBinding : nil,
            sharedClockSamples:
                clocksMatch ? audioClock : [],
            videoStartOffsetFromAudioSeconds: startOffset,
            disposition: disposition,
            checks: checks,
            humanReviewRequired: humanReview,
            receiptPath: receiptURL.path,
            truth: truth
        )
        try persist(receipt, to: receiptURL)
        return receipt
    }

    public static func auditReceiptURL(
        rootDirectory: URL,
        episodeSpaceID: String,
        captureGroupID: UUID,
        auditID: UUID
    ) -> URL {
        rootDirectory
            .appendingPathComponent(
                "_take-audits",
                isDirectory: true
            )
            .appendingPathComponent(
                ProductionAudioRecorder.safePathComponent(
                    episodeSpaceID
                ),
                isDirectory: true
            )
            .appendingPathComponent(
                captureGroupID.uuidString.lowercased(),
                isDirectory: true
            )
            .appendingPathComponent(
                "take-audit-\(auditID.uuidString.lowercased()).json"
            )
    }

    private static func inspectAudio(
        _ receipt: ProductionAudioRecordingReceipt
    ) async -> ProductionCaptureTakeSourceAudit {
        await Task.detached(priority: .utility) {
            let url = URL(fileURLWithPath: receipt.audioPath)
            var errorMessages: [String] = []
            let evidence = inspectBytes(
                at: url,
                errors: &errorMessages
            )
            let probe: ProductionCaptureAudioProbe?
            do {
                let file = try AVAudioFile(forReading: url)
                let settings = file.fileFormat.settings
                let sampleRate = file.fileFormat.sampleRate
                let frameCount = file.length
                let signal = try audioSignalProbe(file: file)
                probe = ProductionCaptureAudioProbe(
                    sampleRate: sampleRate,
                    channelCount:
                        Int(file.fileFormat.channelCount),
                    bitDepth: integerSetting(
                        settings[AVLinearPCMBitDepthKey]
                    ),
                    formatID: unsignedIntegerSetting(
                        settings[AVFormatIDKey]
                    ),
                    frameCount: frameCount,
                    durationSeconds:
                        sampleRate > 0
                            ? Double(frameCount) / sampleRate
                            : 0,
                    peakMagnitude: signal.peakMagnitude,
                    rmsMagnitude: signal.rmsMagnitude
                )
            } catch {
                errorMessages.append(
                    "Audio probe failed: \(error.localizedDescription)"
                )
                probe = nil
            }
            return ProductionCaptureTakeSourceAudit(
                sourceType: "audio",
                sourceID: receipt.recordingID,
                filePath: receipt.audioPath,
                expectedByteCount: receipt.byteCount,
                actualByteCount: evidence.byteCount,
                expectedSHA256: receipt.sha256,
                actualSHA256: evidence.sha256,
                audioProbe: probe,
                videoProbe: nil,
                inspectionError:
                    errorMessages.isEmpty
                        ? nil
                        : errorMessages.joined(separator: " ")
            )
        }.value
    }

    private static func inspectVideo(
        _ receipt: ProductionVideoReferenceReceipt
    ) async -> ProductionCaptureTakeSourceAudit {
        let url = URL(fileURLWithPath: receipt.videoPath)
        async let evidenceTask = Task.detached(
            priority: .utility
        ) {
            var errors: [String] = []
            let evidence = inspectBytes(
                at: url,
                errors: &errors
            )
            return (evidence, errors)
        }.value

        let probe: ProductionCaptureVideoProbe?
        var probeError: String?
        do {
            probe = try await probeVideo(at: url)
        } catch {
            probe = nil
            probeError =
                "Video probe failed: \(error.localizedDescription)"
        }
        let (evidence, byteErrors) = await evidenceTask
        let errors = byteErrors + [probeError].compactMap { $0 }
        return ProductionCaptureTakeSourceAudit(
            sourceType: "video",
            sourceID: receipt.recordingID,
            filePath: receipt.videoPath,
            expectedByteCount: receipt.byteCount,
            actualByteCount: evidence.byteCount,
            expectedSHA256: receipt.sha256,
            actualSHA256: evidence.sha256,
            audioProbe: nil,
            videoProbe: probe,
            inspectionError:
                errors.isEmpty
                    ? nil
                    : errors.joined(separator: " ")
        )
    }

    private static func probeVideo(
        at url: URL
    ) async throws -> ProductionCaptureVideoProbe {
        let asset = AVURLAsset(url: url)
        let duration = try await asset.load(.duration).seconds
        let videoTracks = try await asset.loadTracks(
            withMediaType: .video
        )
        let audioTracks = try await asset.loadTracks(
            withMediaType: .audio
        )
        guard let videoTrack = videoTracks.first else {
            throw CocoaError(.fileReadCorruptFile)
        }
        let naturalSize = try await videoTrack.load(.naturalSize)
        let transform = try await videoTrack.load(
            .preferredTransform
        )
        let displaySize = naturalSize.applying(transform)
        let frameRate = try await videoTrack.load(
            .nominalFrameRate
        )
        let descriptions = try await videoTrack.load(
            .formatDescriptions
        )
        return ProductionCaptureVideoProbe(
            durationSeconds: duration,
            width: Int(abs(displaySize.width).rounded()),
            height: Int(abs(displaySize.height).rounded()),
            nominalFrameRate: Double(frameRate),
            videoCodec:
                descriptions.first.map {
                    fourCC(
                        CMFormatDescriptionGetMediaSubType($0)
                    )
                } ?? "unknown",
            videoTrackCount: videoTracks.count,
            audioTrackCount: audioTracks.count
        )
    }

    private static func appendFileChecks(
        source: ProductionCaptureTakeSourceAudit,
        expectedLabel: String,
        checks: inout [ProductionCaptureTakeAuditCheck]
    ) {
        let bytesMatch =
            source.expectedByteCount != nil
            && source.expectedByteCount == source.actualByteCount
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "\(source.sourceType)-byte-count",
                status: bytesMatch ? .pass : .hold,
                summary: bytesMatch
                    ? "\(expectedLabel) byte count matches its finalized receipt."
                    : "\(expectedLabel) byte count is missing or differs from its finalized receipt."
            )
        )
        let digestMatches =
            validDigest(source.expectedSHA256)
            && source.expectedSHA256?.lowercased()
                == source.actualSHA256?.lowercased()
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "\(source.sourceType)-sha256",
                status: digestMatches ? .pass : .hold,
                summary: digestMatches
                    ? "\(expectedLabel) SHA-256 matches a fresh read of the source."
                    : "\(expectedLabel) SHA-256 is missing or differs from a fresh read."
            )
        )
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "\(source.sourceType)-probe-readable",
                status:
                    source.inspectionError == nil
                        ? .pass
                        : .hold,
                summary:
                    source.inspectionError
                        ?? "\(expectedLabel) can be opened and structurally inspected."
            )
        )
    }

    private static func appendAudioShapeChecks(
        receipt: ProductionAudioRecordingReceipt,
        probe: ProductionCaptureAudioProbe?,
        checks: inout [ProductionCaptureTakeAuditCheck]
    ) {
        guard let probe else {
            checks.append(
                ProductionCaptureTakeAuditCheck(
                    id: "audio-production-shape",
                    status: .hold,
                    summary:
                        "The WAV production format could not be inspected."
                )
            )
            return
        }
        let shapeMatches =
            abs(probe.sampleRate - 48_000) < 1
            && probe.bitDepth == 24
            && probe.formatID == kAudioFormatLinearPCM
            && probe.channelCount == receipt.channelCount
            && probe.frameCount == receipt.frameCount
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "audio-production-shape",
                status: shapeMatches ? .pass : .hold,
                summary: shapeMatches
                    ? "WAV is 48 kHz, 24-bit linear PCM with the receipted channel and frame count."
                    : "WAV format, channels, or frame count differs from the production receipt."
            )
        )
        let durationMatches =
            abs(
                probe.durationSeconds
                    - receipt.durationSeconds
            ) <= max(0.02, receipt.durationSeconds * 0.001)
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "audio-duration",
                status: durationMatches ? .pass : .hold,
                summary: durationMatches
                    ? "WAV duration matches its frame-derived receipt duration."
                    : "WAV duration differs from its frame-derived receipt duration."
            )
        )
        let peak = probe.peakMagnitude
        let rms = probe.rmsMagnitude
        let signalStatus: ProductionCaptureTakeAuditCheckStatus
        let signalSummary: String
        if let peak,
           let rms,
           peak.isFinite,
           rms.isFinite,
           peak > 0.000_000_1 {
            if peak < 0.001 || rms < 0.000_01 {
                signalStatus = .warning
                signalSummary =
                    "WAV contains a measurable but extremely low signal (peak \(formatDecibels(peak)), RMS \(formatDecibels(rms))). Listen before accepting the take."
            } else {
                signalStatus = .pass
                signalSummary =
                    "WAV contains a measurable signal (peak \(formatDecibels(peak)), RMS \(formatDecibels(rms)))."
            }
        } else {
            signalStatus = .hold
            signalSummary =
                "WAV is digital silence or its signal level could not be measured. Do not accept this take."
        }
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "audio-signal-present",
                status: signalStatus,
                summary: signalSummary
            )
        )
    }

    private static func appendVideoSignalVerificationCheck(
        receipt: ProductionVideoReferenceReceipt,
        checks: inout [ProductionCaptureTakeAuditCheck]
    ) {
        if let verification = receipt.signalVerification {
            let valid = verification.isValid(
                for: receipt.videoDevice.id,
                recordingStartedAt: receipt.startedAt
            )
            checks.append(
                ProductionCaptureTakeAuditCheck(
                    id: "video-live-signal-preflight",
                    status: valid ? .pass : .hold,
                    summary: valid
                        ? "A fresh live-image confirmation names the exact recorded camera route. Final visual review remains mandatory."
                        : "The live-image confirmation is stale, post-start, or names a different camera route."
                )
            )
        } else {
            checks.append(
                ProductionCaptureTakeAuditCheck(
                    id: "video-live-signal-preflight",
                    status: receipt.protocolVersion >= 3
                        ? .hold
                        : .warning,
                    summary: receipt.protocolVersion >= 3
                        ? "This v3 camera receipt is missing its required live-image confirmation."
                        : "This legacy camera receipt predates explicit live-image confirmation. Watch the entire reference and reject placeholder or disconnected slates."
                )
            )
        }
    }

    private static func appendAudioRouteContinuityCheck(
        receipt: ProductionAudioRecordingReceipt,
        checks: inout [ProductionCaptureTakeAuditCheck]
    ) {
        if let continuity = receipt.routeContinuity {
            let valid =
                continuity.isLocked
                && continuity.expectedInputUID
                    == receipt.inputDevice.id
            checks.append(
                ProductionCaptureTakeAuditCheck(
                    id: "audio-exact-route-continuity",
                    status: valid ? .pass : .hold,
                    summary: valid
                        ? "The recorder preserved exact selected-microphone continuity through its final stop boundary."
                        : "The audio receipt reports a lost, mismatched, or malformed exact-microphone route."
                )
            )
        } else {
            checks.append(
                ProductionCaptureTakeAuditCheck(
                    id: "audio-exact-route-continuity",
                    status: receipt.protocolVersion >= 2
                        ? .hold
                        : .warning,
                    summary: receipt.protocolVersion >= 2
                        ? "This v2 audio receipt is missing its required exact-route continuity evidence."
                        : "This legacy audio receipt predates exact-route continuity evidence. Device and waveform review remain mandatory."
                )
            )
        }
    }

    private static func appendVideoShapeChecks(
        receipt: ProductionVideoReferenceReceipt,
        probe: ProductionCaptureVideoProbe?,
        checks: inout [ProductionCaptureTakeAuditCheck]
    ) {
        guard let probe else {
            checks.append(
                ProductionCaptureTakeAuditCheck(
                    id: "video-reference-shape",
                    status: .hold,
                    summary:
                        "The camera-reference movie could not be inspected."
                )
            )
            return
        }
        let recordedFormat = receipt.recordedFormat
        let expectedWidth =
            recordedFormat?.width
                ?? receipt.negotiatedFormat.width
        let expectedHeight =
            recordedFormat?.height
                ?? receipt.negotiatedFormat.height
        let expectedFrameRate =
            recordedFormat?.nominalFrameRate
        let expectedCodec = recordedFormat?.codec
        let shapeMatches =
            probe.videoTrackCount == 1
            && probe.audioTrackCount == 0
            && probe.width == expectedWidth
            && probe.height == expectedHeight
            && probe.nominalFrameRate > 0
            && probe.nominalFrameRate
                <= receipt.negotiatedFormat.maximumFrameRate
                    + 0.05
            && (
                expectedFrameRate == nil
                    || abs(
                        probe.nominalFrameRate
                            - (expectedFrameRate ?? 0)
                    ) <= 0.05
            )
            && (
                expectedCodec == nil
                    || probe.videoCodec == expectedCodec
            )
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "video-reference-shape",
                status: shapeMatches ? .pass : .hold,
                summary: shapeMatches
                    ? "Camera reference contains one silent video track at the finalized recorded dimensions, codec, and no more than the negotiated frame rate."
                    : "Camera-reference tracks, recorded dimensions, frame rate, codec, or silent-source invariant differ from the receipt."
            )
        )
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "video-recorded-format-receipt",
                status:
                    recordedFormat == nil
                        ? .warning
                        : .pass,
                summary:
                    recordedFormat == nil
                        ? "This legacy receipt does not preserve a post-finalization recorded media format; the probe was compared with its negotiated dimensions."
                        : "The finalized receipt preserves a distinct recorded media format."
            )
        )
        let outputContractMatches =
            probe.width == receipt.negotiatedFormat.width
            && probe.height == receipt.negotiatedFormat.height
        let outputContractFailure =
            probe.width * probe.height
                < receipt.negotiatedFormat.width
                    * receipt.negotiatedFormat.height
                ? "Do not accept this resolution downgrade."
                : "Do not accept this unexplained resolution mismatch."
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "video-negotiated-resolution-delivered",
                status: outputContractMatches ? .pass : .hold,
                summary: outputContractMatches
                    ? "The encoded MOV delivered the negotiated input resolution."
                    : "The encoded MOV is \(probe.width)×\(probe.height), but the selected camera input negotiated \(receipt.negotiatedFormat.width)×\(receipt.negotiatedFormat.height). \(outputContractFailure)"
            )
        )
        let durationMatches =
            probe.durationSeconds.isFinite
            && abs(
                probe.durationSeconds
                    - receipt.durationSeconds
            ) <= max(0.25, receipt.durationSeconds * 0.01)
        checks.append(
            ProductionCaptureTakeAuditCheck(
                id: "video-duration",
                status: durationMatches ? .pass : .hold,
                summary: durationMatches
                    ? "Movie duration matches its finalized receipt within container tolerance."
                    : "Movie duration differs from its finalized receipt."
            )
        )
    }

    private static func persist(
        _ receipt: ProductionCaptureTakeAuditReceipt,
        to url: URL
    ) throws {
        let fileManager = FileManager.default
        guard !fileManager.fileExists(atPath: url.path) else {
            throw ProductionCaptureTakeAuditorError
                .receiptCollision
        }
        try fileManager.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .custom(
            ProductionCaptureDateCoding.encode
        )
        encoder.outputFormatting = [
            .prettyPrinted,
            .sortedKeys,
            .withoutEscapingSlashes,
        ]
        guard let data = try? encoder.encode(receipt) else {
            throw ProductionCaptureTakeAuditorError
                .unableToEncodeReceipt
        }
        let temporaryURL = url
            .deletingLastPathComponent()
            .appendingPathComponent(
                ".\(url.lastPathComponent)-\(UUID().uuidString).tmp"
            )
        defer {
            try? fileManager.removeItem(at: temporaryURL)
        }
        try data.write(
            to: temporaryURL,
            options: [.withoutOverwriting]
        )
        do {
            try fileManager.linkItem(
                at: temporaryURL,
                to: url
            )
        } catch {
            if fileManager.fileExists(atPath: url.path) {
                throw ProductionCaptureTakeAuditorError
                    .receiptCollision
            }
            throw error
        }
    }

    private static func inspectBytes(
        at url: URL,
        errors: inout [String]
    ) -> (byteCount: Int64?, sha256: String?) {
        guard FileManager.default.fileExists(
            atPath: url.path
        ) else {
            errors.append("Source file is missing.")
            return (nil, nil)
        }
        let byteCount = (
            try? url.resourceValues(
                forKeys: [.fileSizeKey]
            ).fileSize
        ).flatMap { $0 }.map(Int64.init)
        do {
            return (
                byteCount,
                try sha256(at: url)
            )
        } catch {
            errors.append(
                "Source digest failed: \(error.localizedDescription)"
            )
            return (byteCount, nil)
        }
    }

    private static func sha256(
        at url: URL
    ) throws -> String {
        let handle = try FileHandle(forReadingFrom: url)
        defer { try? handle.close() }
        var hasher = SHA256()
        while true {
            let data = try handle.read(
                upToCount: 4 * 1_024 * 1_024
            ) ?? Data()
            if data.isEmpty { break }
            hasher.update(data: data)
        }
        return hasher.finalize()
            .map { String(format: "%02x", $0) }
            .joined()
    }

    private static func audioSignalProbe(
        file: AVAudioFile
    ) throws -> (
        peakMagnitude: Double,
        rmsMagnitude: Double
    ) {
        let format = file.processingFormat
        guard let buffer = AVAudioPCMBuffer(
            pcmFormat: format,
            frameCapacity: 65_536
        ) else {
            throw CocoaError(.fileReadCorruptFile)
        }
        var peakMagnitude: Float = 0
        var sumOfSquares = 0.0
        var sampleCount = 0
        while file.framePosition < file.length {
            try file.read(into: buffer)
            let frameLength = Int(buffer.frameLength)
            guard frameLength > 0 else { break }
            guard let channelData = buffer.floatChannelData else {
                throw CocoaError(.fileReadCorruptFile)
            }
            for channel in 0..<Int(format.channelCount) {
                var channelPeak: Float = 0
                var channelSumOfSquares: Float = 0
                vDSP_maxmgv(
                    channelData[channel],
                    1,
                    &channelPeak,
                    vDSP_Length(frameLength)
                )
                vDSP_svesq(
                    channelData[channel],
                    1,
                    &channelSumOfSquares,
                    vDSP_Length(frameLength)
                )
                peakMagnitude = max(
                    peakMagnitude,
                    channelPeak
                )
                sumOfSquares += Double(
                    channelSumOfSquares
                )
                sampleCount += frameLength
            }
        }
        let rmsMagnitude =
            sampleCount > 0
                ? sqrt(
                    sumOfSquares
                        / Double(sampleCount)
                )
                : 0
        return (
            Double(peakMagnitude),
            rmsMagnitude
        )
    }

    private static func formatDecibels(
        _ magnitude: Double
    ) -> String {
        guard magnitude.isFinite, magnitude > 0 else {
            return "-∞ dBFS"
        }
        return String(
            format: "%.1f dBFS",
            20 * log10(magnitude)
        )
    }

    private static func validDigest(
        _ value: String?
    ) -> Bool {
        value?.range(
            of: "^[0-9a-fA-F]{64}$",
            options: .regularExpression
        ) != nil
    }

    private static func authorityIsCompleteOrAbsent(
        owner: String?,
        room: String?,
        consent: String?,
        startReceiptID: UUID?
    ) -> Bool {
        let valuesPresent = [
            nonempty(owner) != nil,
            nonempty(room) != nil,
            nonempty(consent) != nil,
            startReceiptID != nil,
        ]
        return valuesPresent.allSatisfy { !$0 }
            || valuesPresent.allSatisfy { $0 }
    }

    private static func validMonotonicBoundary(
        start: UInt64,
        stop: UInt64?
    ) -> Bool {
        guard let stop else { return false }
        return stop > start
    }

    private static func signedSeconds(
        _ value: UInt64,
        relativeTo origin: UInt64
    ) -> Double {
        if value >= origin {
            return Double(value - origin) / 1_000_000_000
        }
        return -Double(origin - value) / 1_000_000_000
    }

    private static func formatSeconds(
        _ value: Double
    ) -> String {
        String(format: "%+.3f s", value)
    }

    private static func integerSetting(
        _ value: Any?
    ) -> Int? {
        if let value = value as? Int { return value }
        return (value as? NSNumber)?.intValue
    }

    private static func unsignedIntegerSetting(
        _ value: Any?
    ) -> UInt32? {
        if let value = value as? UInt32 { return value }
        return (value as? NSNumber)?.uint32Value
    }

    private static func nonempty(
        _ value: String?
    ) -> String? {
        let clean = value?.trimmingCharacters(
            in: .whitespacesAndNewlines
        )
        return clean?.isEmpty == false ? clean : nil
    }

    private static func fourCC(
        _ value: FourCharCode
    ) -> String {
        let scalars = [
            UInt8((value >> 24) & 0xff),
            UInt8((value >> 16) & 0xff),
            UInt8((value >> 8) & 0xff),
            UInt8(value & 0xff),
        ]
        return String(bytes: scalars, encoding: .ascii)
            ?? String(format: "0x%08x", value)
    }
}

#endif
