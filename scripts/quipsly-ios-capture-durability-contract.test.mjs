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

const [audio, library, receipts, model, phoneShell, offlineView, playback] = await Promise.all([
  readFile(path.join(captureRoot, "AudioCaptureController.swift"), "utf8"),
  readFile(path.join(captureRoot, "LocalRecordingLibrary.swift"), "utf8"),
  readFile(path.join(captureRoot, "CaptureRoomReceiptStore.swift"), "utf8"),
  readFile(path.join(captureRoot, "CaptureExperienceModel.swift"), "utf8"),
  readFile(path.join(captureRoot, "CapturePhoneShell.swift"), "utf8"),
  readFile(path.join(captureRoot, "ContentView.swift"), "utf8"),
  readFile(path.join(captureRoot, "LocalRecordingPlaybackController.swift"), "utf8"),
]);

const checks = [];
function check(name, condition) {
  assert.ok(condition, name);
  checks.push(name);
}

const armCall = model.indexOf("try audioCapture.armNextCapture(");
const recorderStart = model.indexOf("audioCapture.handleCommand(command)", armCall);
const postStartGuard = model.indexOf("audioCapture.captureState == .recording", recorderStart);
check("model preallocates capture UUID", model.includes("let captureID = UUID()"));
check("model arms before issuing recorder start", armCall >= 0 && armCall < recorderStart);
check("model checks recorder state only after start command", recorderStart < postStartGuard);
check(
  "arming failure says nothing was recorded",
  model.includes("Nothing was recorded: \\(error.localizedDescription)"),
);
check(
  "model no longer appends START after recorder activation",
  !model.slice(postStartGuard, model.indexOf("func stopCapture", postStartGuard)).includes("action: .start"),
);

const armMethod = audio.indexOf("func armNextCapture(");
const durableStart = audio.indexOf("receiptStore.enqueueDurably(", armMethod);
const beginMethod = audio.indexOf("private func beginActualRecording() throws");
const localArm = audio.indexOf("localRecordingLibrary.beginRecording(", beginMethod);
const avRecord = audio.indexOf("guard recorder.record()", beginMethod);
const localActive = audio.indexOf("localRecordingLibrary.markRecording", avRecord);
check("recorder exposes a throwing arm API", armMethod >= 0);
check("arm API durably commits Nest START", durableStart > armMethod && durableStart < beginMethod);
check("room capture cannot bypass durable arming", audio.includes("activeCallRoomId != nil, pendingCaptureIntent == nil") && audio.includes("armedRoomMismatch"));
check("local armed row commits before AVAudioRecorder.record", localArm > beginMethod && localArm < avRecord);
check("local active state follows AVAudioRecorder.record", avRecord < localActive);
check("pre-record failures close START boundary", audio.includes("closeStartBoundaryAfterFailedArm()"));
const captureStart = model.slice(model.indexOf("func startCapture(using audioCapture:"), model.indexOf("func stopCapture(using audioCapture:"));
const permissionAwait = captureStart.indexOf("await audioCapture.prepareForRecording()");
const permissionOwnerRecheck = captureStart.indexOf("matchesStableOwnerSnapshot(ownerSnapshot)", permissionAwait);
const durableOwnerArm = captureStart.indexOf("expectedOwnerSnapshot: ownerSnapshot", permissionOwnerRecheck);
check(
  "owner switch during microphone permission aborts before durable arm",
  permissionAwait >= 0 && permissionOwnerRecheck > permissionAwait && durableOwnerArm > permissionOwnerRecheck,
);
check(
  "armed owner switch closes START before bytes",
  audio.includes("func abortArmedCaptureBeforeRecording(")
    && audio.includes("let receiptFailure = closeStartBoundaryAfterFailedArm()")
    && audio.includes("activeLocalRecordingID == nil"),
);
check(
  "recorder rechecks immutable owner immediately before AVAudioRecorder.record",
  audio.indexOf("matchesStableOwnerSnapshot(captureIntent.ownerSnapshot)", localArm)
    < audio.indexOf("guard recorder.record()", localArm),
);
check("start and resume both check storage", (audio.match(/hasCaptureStorageHeadroom\(\)/g) ?? []).length >= 3 && audio.includes("projectedSafetyFloorDuringCapture()"));
check("runtime storage probe is periodic", audio.includes("storageCheckInterval") && audio.includes("checkStorageHeadroomDuringCapture()"));
check("disk pressure auto-finalizes visibly", audio.includes("stopForStorageSafety") && audio.includes("automaticStopReason = message"));
check("unavailable capacity fails closed", audio.includes("storageCapacityProbeFailed = true") && audio.includes("stopForStorageSafety(availableBytes: nil)"));

check("local ledger has explicit armed status", library.includes("case armed"));
check("local ledger uses caller preallocated UUID", library.includes("func beginRecording(\n        id: UUID,") && library.includes("id: id,"));
check(
  "local ledger binds source sidecars to caller's expected owner",
  library.includes("expectedOwnerAccountID: String")
    && library.includes("ownerAccountID == AuthManager.currentStoredOwnerID()"),
);
check("source metadata writes owner sidecars", library.includes("persistSourceSidecars") && library.includes(".quipsly-source.json"));
check(
  "source ledger distinguishes audio and video without breaking legacy rows",
  library.includes("enum LocalRecordingMediaKind")
    && library.includes("var mediaKind: LocalRecordingMediaKind? = nil")
    && library.includes("var effectiveMediaKind: LocalRecordingMediaKind"),
);
check(
  "new sources persist capture-group and resolved profile evidence",
  library.includes("var captureGroupId: UUID? = nil")
    && library.includes("var sourceProfile: LocalRecordingSourceProfile? = nil")
    && audio.includes("captureGroupId: captureIntent.captureID")
    && audio.includes("monotonicStartedNanoseconds: DispatchTime.now().uptimeNanoseconds"),
);
check("source ledger keeps a last-known-good copy", library.includes("recordings-index.last-known-good.json"));
check("corrupt source ledger becomes read-only", library.includes("ledgerIsWritable = false") && library.includes("throw LibraryError.ledgerQuarantined"));
check("corrupt source ledger is never reset empty", !library.includes("persist([])"));
check("crash recovery decodes through declared EOF", library.includes("AVAudioFile(forReading:") && library.includes("readsToEnd: true") && library.includes("decodedFrames == frameCount"));
check(
  "video recovery reads every declared track through EOF",
  library.includes("AVAssetReaderTrackOutput")
    && library.includes("while output.copyNextSampleBuffer() != nil")
    && library.includes("reader.status == .completed"),
);
check("deep crash recovery decoding runs off MainActor", library.includes("Task.detached(priority: .utility)") && library.includes("scheduleDeepRecoveryValidation()"));
check("recovery has a durable non-playable pending state", library.includes("case validatingRecovery") && library.includes("recording.status = .validatingRecovery") && library.includes("Playback and upload remain disabled until that recovery check finishes"));
check("pending recovery is requeued after relaunch", library.includes("case .armed, .recording, .paused, .finalizing, .validatingRecovery:") && library.includes("applyCrashRecoveryValidation(to: &storedRecordings[index]"));
check("only deep validation can promote recovered playback", library.includes("guard recording.status == .validatingRecovery") && library.includes("recording.status = .recovered"));
check("undecodable source is needs-repair", library.includes("recording.status = .needsRepair"));
check("needs-repair source is not upload eligible", library.includes("var isUploadEligible: Bool") && model.includes("guard recording.status.isUploadEligible else"));
check("safe filename and canonical path checks remain", library.includes("isSafeRecordingFileName") && library.includes("recordingOutsideLibrary"));
check("explicit deletion tombstone remains", library.includes("status = .deletedLocally") && library.includes("Durable-before-destructive"));

const receiptPersist = receipts.indexOf("private func persist(_ updated:");
const receiptAssign = receipts.indexOf("storedReceipts = updated", receipts.indexOf("func enqueueDurably("));
check("receipt enqueue has throwing durable API", receipts.includes("func enqueueDurably("));
check("receipt disk commit precedes in-memory publication", receiptPersist >= 0 && receipts.indexOf("try persist(updated)", receipts.indexOf("func enqueueDurably(")) < receiptAssign);
check("receipt owner sidecars are protected", receipts.includes(".quipsly-receipt.json") && receipts.includes("completeFileProtectionUntilFirstUserAuthentication"));
check("completed receipt sidecars are pruned after canonical commit", receipts.includes("pruneReceiptSidecars(retaining:") && receipts.includes("!retainedIDs.contains(receipt.id)"));
check("receipt ledger keeps a last-known-good copy", receipts.includes("room-state-outbox.last-known-good.json"));
check("corrupt receipt ledger becomes read-only", receipts.includes("ledgerIsWritable = false") && receipts.includes("ReceiptStoreError.ledgerQuarantined"));
check("receipt mutation failure halts delivery for the process", receipts.includes("A failed mutation is ambiguous") && receipts.includes("ledgerIsWritable = false"));
check("STOP inherits durable START owner across auth changes", receipts.includes("if action == .stop, let inheritedStart") && receipts.includes("inheritedStart.ownerAccountID") && receipts.includes("inheritedStart.sessionID == sessionID") && receipts.includes("inheritedStart.callRoomID == callRoomID"));
check("legacy superseded START is replayed as pending", receipts.includes("action == .start && deliveryDisposition == .supersededByStop"));
check("pending START is selected before its STOP", receipts.includes("func nextDeliverableReceipt(") && receipts.includes("$0.captureID == candidate.captureID && $0.action == .start"));
const receiptFlush = model.slice(model.indexOf("private func flushReceiptOutboxPass()"), model.indexOf("private func replacePreviewSession("));
check("retryable START is never retired by local STOP", !receiptFlush.includes("markSupersededByStop") && receiptFlush.includes("deferredCaptureIDs.insert(receipt.captureID)"));
check("retryable capture defers without blocking unrelated STOP", receiptFlush.includes("excludingCaptureIDs: deferredCaptureIDs") && receiptFlush.includes("continue"));

check("needs-repair playback is disabled in primary Library", phoneShell.includes("recording.status.isPlaybackEligible"));
check("needs-repair playback is disabled offline", offlineView.includes("recording.status.isPlaybackEligible"));
check("playback controller rejects unvalidated status", playback.includes("guard recording.status.isPlaybackEligible else"));
check("auto-stop result reaches coordinator UX", model.includes("activeAudioCapture?.automaticStopReason"));

console.log(`quipsly iOS capture durability contract: ${checks.length}/${checks.length} checks passed`);
for (const name of checks) console.log(`  ✓ ${name}`);
