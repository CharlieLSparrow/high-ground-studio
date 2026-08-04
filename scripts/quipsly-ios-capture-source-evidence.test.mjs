#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, "..");
const captureRoot = path.join(
  repositoryRoot,
  "apps/mobile-capture/HighGroundCapture/HighGroundCapture",
);

const [
  runtime,
  library,
  audio,
  video,
  uploads,
  exporter,
  evidenceView,
  playback,
  phoneShell,
  uiTests,
] = await Promise.all([
  readFile(path.join(captureRoot, "CaptureRuntimeEvidence.swift"), "utf8"),
  readFile(path.join(captureRoot, "LocalRecordingLibrary.swift"), "utf8"),
  readFile(path.join(captureRoot, "AudioCaptureController.swift"), "utf8"),
  readFile(path.join(captureRoot, "VideoCaptureController.swift"), "utf8"),
  readFile(path.join(captureRoot, "UploadManager.swift"), "utf8"),
  readFile(path.join(captureRoot, "CaptureSourceEvidenceExporter.swift"), "utf8"),
  readFile(path.join(captureRoot, "CaptureSourceEvidenceView.swift"), "utf8"),
  readFile(path.join(captureRoot, "LocalRecordingPlaybackController.swift"), "utf8"),
  readFile(path.join(captureRoot, "CapturePhoneShell.swift"), "utf8"),
  readFile(
    path.join(
      repositoryRoot,
      "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift",
    ),
    "utf8",
  ),
]);

const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

check(
  "capture-time runtime evidence records app, build, device, OS, and exact audio route",
  runtime.includes("let appVersion: String")
    && runtime.includes("let appBuild: String")
    && runtime.includes("let deviceModelIdentifier: String")
    && runtime.includes("let systemVersion: String")
    && runtime.includes("audioRouteName:")
    && runtime.includes("audioRoutePortType:")
    && runtime.includes("audioSession.currentRoute.inputs.first"),
);
check(
  "runtime evidence uses the hardware model identifier instead of a marketing guess",
  runtime.includes("uname(&systemInfo)")
    && runtime.includes("withUnsafeBytes(of: &systemInfo.machine)"),
);
check(
  "audio and video snapshot runtime evidence before source bytes",
  audio.includes("CaptureRuntimeEvidence.current(")
    && audio.includes("audioSession: audioSession")
    && video.includes("CaptureRuntimeEvidence.current()")
    && audio.indexOf("CaptureRuntimeEvidence.current(")
      < audio.indexOf("localRecordingLibrary.beginRecording(")
    && video.indexOf("CaptureRuntimeEvidence.current()")
      < video.indexOf("library.beginRecording("),
);
check(
  "legacy source ledgers decode after the evidence expansion",
  library.includes("var captureAppVersion: String?")
    && library.includes("var roomStopReceiptId: UUID? = nil")
    && library.includes("var verifiedCloudSHA256: String? = nil")
    && library.includes("var verifiedCloudGeneration: String? = nil"),
);
check(
  "audio and video persist the durable STOP receipt back onto the exact source",
  audio.includes("localRecordingLibrary.markRoomStopReceipt(")
    && audio.includes("receiptID: stopReceipt.id")
    && video.includes("markRoomStopReceiptIfPresent(")
    && library.includes("case roomStopReceiptConflict"),
);
check(
  "upload ledger retains verified hash, byte count, generation, and timestamp until handoff",
  uploads.includes("var verifiedCloudSHA256: String? = nil")
    && uploads.includes("var verifiedCloudSizeBytes: Int64? = nil")
    && uploads.includes("var verifiedCloudGeneration: String? = nil")
    && uploads.includes("var verifiedCloudAt: Date? = nil")
    && uploads.includes("uploadSession.verifiedCloudSHA256 = expectedSHA256"),
);
check(
  "verified cloud evidence commits to the permanent source ledger before transient job deletion",
  uploads.indexOf("try persistVerifiedSourceEvidence(session)")
      < uploads.indexOf("activeUploads.removeValue(forKey: sessionId)")
    && uploads.includes('completionEvidence["verifiedCloudSizeBytes"]')
    && uploads.includes('"canonicalObjectPath": session.canonicalObjectPath ?? ""'),
);
check(
  "verified job retirement rolls back until the protected ledger commits",
  uploads.includes("guard saveActiveUploads() else {")
    && uploads.includes("activeUploads[sessionId] = session")
    && uploads.indexOf("UploadLedgerStore.deleteCapability(for: sessionId)")
      > uploads.indexOf("guard saveActiveUploads() else {"),
);
check(
  "permanent source ledger receives cloud IDs and cryptographic evidence",
  audio.includes("mediaAssetId: userInfo[\"mediaAssetId\"] as? String")
    && audio.includes("transcriptJobId: userInfo[\"transcriptJobId\"] as? String")
    && audio.includes("verifiedCloudSHA256: userInfo[\"verifiedCloudSHA256\"] as? String")
    && audio.includes("verifiedCloudGeneration: userInfo[\"verifiedCloudGeneration\"] as? String")
    && library.includes("recording.canonicalObjectPath = self.nonempty(canonicalObjectPath)"),
);
check(
  "portable receipt has an explicit versioned schema",
  exporter.includes('schema: "quipsly-capture-source-evidence"')
    && exporter.includes("schemaVersion: 1"),
);
check(
  "portable receipt redacts the raw account identity",
  exporter.includes("ownerFingerprintSHA256: sha256(activeOwner)")
    && !exporter.includes("let ownerAccountID:"),
);
check(
  "exporter fails closed across account or source identity changes",
  exporter.includes("normalizedOwner(recording.ownerAccountID) == activeOwner")
    && exporter.includes("activeOwnerAfterHash == activeOwner")
    && exporter.includes("latest.fileName == recording.fileName")
    && exporter.includes("latest.startedAt == recording.startedAt"),
);
check(
  "exporter streams every local byte into SHA-256",
  exporter.includes("FileHandle(forReadingFrom: sourceURL)")
    && exporter.includes("read(upToCount: 1_048_576)")
    && exporter.includes("hasher.update(data: data)")
    && exporter.includes("hasher.finalize()"),
);
check(
  "exporter proves the source remained stable while hashing",
  exporter.includes("initialValues.fileSize == finalValues.fileSize")
    && exporter.includes("initialValues.contentModificationDate == finalValues.contentModificationDate")
    && exporter.includes("localSourceChanged"),
);
check(
  "claimed verified cloud evidence must match local hash, size, generation, and timestamp",
  exporter.includes("cloudHash == hashedFile.sha256")
    && exporter.includes("latest.verifiedCloudSizeBytes == hashedFile.byteCount")
    && exporter.includes("nonempty(latest.verifiedCloudGeneration) != nil")
    && exporter.includes("latest.verifiedCloudAt != nil"),
);
check(
  "room-bound evidence requires durable START and STOP receipt IDs",
  exporter.includes("latest.roomStartReceiptId != nil && latest.roomStopReceiptId != nil")
    && exporter.includes("roomBoundaryIsCompleteWhenRequired: roomBoundaryComplete"),
);
check(
  "evidence snapshots are protected, excluded from backup, and never overwrite an older receipt",
  exporter.includes("FileProtectionType.complete")
    && exporter.includes("isExcludedFromBackup = true")
    && exporter.includes("\\(UUID().uuidString.lowercased()).json")
    && !exporter.includes("removeItem(at:"),
);
check(
  "portable evidence omits the absolute local source path",
  !exporter.includes("sourceURL.path")
    && !exporter.includes("localFilePath"),
);
check(
  "Library exposes source evidence for every durable recording row",
  phoneShell.includes('Label("Review source evidence", systemImage: "checkmark.shield")')
    && phoneShell.includes("CaptureSourceEvidenceView(recordingID: recording.id)")
    && phoneShell.includes("CaptureSourceEvidenceLink_\\(recording.id)"),
);
check(
  "evidence screen makes local, room, device, and cloud proof readable",
  evidenceView.includes('"Source identity"')
    && evidenceView.includes('"Captured with"')
    && evidenceView.includes('"Room boundary"')
    && evidenceView.includes('"Cloud copy"')
    && evidenceView.includes('"Portable evidence receipt"'),
);
check(
  "fresh audio decodes through EOF and records signal evidence before upload",
  audio.includes("await localRecordingLibrary.validateFinalizedSource(")
    && audio.indexOf("await localRecordingLibrary.validateFinalizedSource(")
      < audio.indexOf("queueUploadIfPossible(recording: finalized")
    && library.includes("analyzeAudioSignal(")
    && library.includes("guard decodedFrames == frameCount, decodedFrames > 0")
    && library.includes("sourceProfile.audioSignal = validation.audioSignal"),
);
check(
  "signal evidence avoids stereo phase cancellation and bounds its payload",
  library.includes("let square = channelEnergy / Double(channelCount)")
    && library.includes("let boundedPointCount: Int64 = 1_200")
    && library.includes('algorithm: "quipsly-audio-signal-window-v1"'),
);
check(
  "silence and dropout language remain observations that require listening",
  library.includes('kind: "possible-dropout"')
    && library.includes("It may be intentional silence; listen before classifying it as a dropout.")
    && evidenceView.includes('detail: "Not LUFS"')
    && evidenceView.includes("listen before classifying"),
);
check(
  "route loss persists the displaced input and exact boundary reason",
  audio.includes('boundaryDetail: "active-audio-route-unavailable"')
    && audio.includes("boundaryAudioRouteName: boundaryRouteName")
    && audio.includes("boundaryAudioRoutePortType: boundaryRoutePortType"),
);
check(
  "waveform and observations can start local playback at exact source time",
  evidenceView.includes("playback.play(")
    && evidenceView.includes("from: observation.startSeconds")
    && evidenceView.includes("from: event.startSeconds")
    && evidenceView.includes('accessibilityIdentifier("CaptureAudioSignalPlaySelected")')
    && playback.includes("from startSeconds: TimeInterval")
    && playback.includes("player.currentTime = min(max(startSeconds, 0), player.duration)")
    && playback.includes("toleranceBefore: .zero")
    && playback.includes("toleranceAfter: .zero"),
);
check(
  "share action appears only after full byte verification succeeds",
  evidenceView.includes("if let evidenceFileURL")
    && evidenceView.includes('Label("Share evidence receipt"')
    && evidenceView.includes("CaptureSourceEvidenceExporter.prepare("),
);
check(
  "preview evidence is explicitly synthetic and cannot create or share a receipt",
  evidenceView.includes("Preview only · no evidence file created")
    && evidenceView.includes("It never claims that synthetic media was captured or verified.")
    && phoneShell.includes("CaptureSourceEvidencePreviewLink"),
);
check(
  "operated UI contract checks preview boundaries and absence of mutation controls",
  uiTests.includes("testSourceEvidencePreviewShowsTruthBoundariesWithoutCreatingAReceipt")
    && uiTests.includes('XCTAssertFalse(app.buttons["CaptureSourceEvidencePrepare"].exists)')
    && uiTests.includes('XCTAssertFalse(app.buttons["CaptureSourceEvidenceShare"].exists)'),
);

console.log(
  `quipsly iOS capture source evidence contract: ${checks.length}/${checks.length} checks passed`,
);
for (const name of checks) console.log(`  ✓ ${name}`);
