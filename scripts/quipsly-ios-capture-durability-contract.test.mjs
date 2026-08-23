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
  audio,
  videoController,
  videoService,
  library,
  receipts,
  model,
  phoneShell,
  offlineView,
  playback,
  providerAudio,
  providerRoom,
  uploadManager,
  recordingCoordinator,
] = await Promise.all([
  readFile(path.join(captureRoot, "AudioCaptureController.swift"), "utf8"),
  readFile(path.join(captureRoot, "VideoCaptureController.swift"), "utf8"),
  readFile(path.join(captureRoot, "VideoCaptureService.swift"), "utf8"),
  readFile(path.join(captureRoot, "LocalRecordingLibrary.swift"), "utf8"),
  readFile(path.join(captureRoot, "CaptureRoomReceiptStore.swift"), "utf8"),
  readFile(path.join(captureRoot, "CaptureExperienceModel.swift"), "utf8"),
  readFile(path.join(captureRoot, "CapturePhoneShell.swift"), "utf8"),
  readFile(path.join(captureRoot, "ContentView.swift"), "utf8"),
  readFile(path.join(captureRoot, "LocalRecordingPlaybackController.swift"), "utf8"),
  readFile(path.join(captureRoot, "ProviderAudioMasterRecorder.swift"), "utf8"),
  readFile(path.join(captureRoot, "ProviderRoomController.swift"), "utf8"),
  readFile(path.join(captureRoot, "UploadManager.swift"), "utf8"),
  readFile(path.join(captureRoot, "CaptureRecordingCoordinator.swift"), "utf8"),
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
const avRecord = audio.indexOf("guard directRecorder.record()", beginMethod);
const localActive = audio.indexOf("localRecordingLibrary.markRecording", avRecord);
const providerRecord = audio.indexOf("try providerRecorder.start(at: startedAt)", beginMethod);
const providerPCMConfirmation = audio.indexOf("private func confirmProviderAudioInput(", beginMethod);
check("recorder exposes a throwing arm API", armMethod >= 0);
check("arm API durably commits Nest START", durableStart > armMethod && durableStart < beginMethod);
check("room capture cannot bypass durable arming", audio.includes("activeCallRoomId != nil, pendingCaptureIntent == nil") && audio.includes("armedRoomMismatch"));
check("local armed row commits before AVAudioRecorder.record", localArm > beginMethod && localArm < avRecord);
check("local active state follows AVAudioRecorder.record", avRecord < localActive);
check(
  "local armed row commits before LiveKit PCM observation",
  localArm > beginMethod && localArm < providerRecord,
);
check(
  "LiveKit-backed recording waits for a real local PCM callback",
  providerRecord < providerPCMConfirmation
    && audio.includes("providerAudioMaster?.isReceivingPCM == true")
    && audio.includes("waitUntilRecordingOrTerminal"),
);
check(
  "the reachable native session surface waits for confirmed PCM before claiming recording",
  model.includes(
    "let audioStarted = await audioCapture.waitUntilRecordingOrTerminal()",
  )
    && model.includes(
      "guard audioStarted, audioCapture.captureState == .recording else",
    ),
);
check(
  "provider start failure takes the terminal media cleanup path",
  audio.includes("if activeLocalRecordingID != nil {")
    && audio.includes("finishCaptureFailure(message)")
    && audio.includes("providerAudioMaster?.stop()"),
);
check("pre-record failures close START boundary", audio.includes("closeStartBoundaryAfterFailedArm()"));
const captureStart = model.slice(
  model.indexOf("func startCapture("),
  model.indexOf("func stopCapture(using audioCapture:"),
);
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
    < audio.indexOf("guard directRecorder.record()", localArm),
);
check(
  "provider-backed master uses LiveKit local PCM instead of a second microphone client",
  providerAudio.includes("AudioManager.shared.add(localAudioRenderer: self)")
    && providerAudio.includes("AudioMixRecorder(")
    && providerAudio.includes("source.render(pcmBuffer: pcmBuffer)")
    && !providerAudio.includes("AVAudioRecorder("),
);
check(
  "provider PCM starvation pauses fail visibly",
  audio.includes("receivedPCMAt")
    && audio.includes("stopped delivering local PCM")
    && audio.includes("pauseRecording("),
);
check("start and resume both check storage", (audio.match(/hasCaptureStorageHeadroom\(\)/g) ?? []).length >= 3 && audio.includes("projectedSafetyFloorDuringCapture()"));
check("runtime storage probe is periodic", audio.includes("storageCheckInterval") && audio.includes("checkStorageHeadroomDuringCapture()"));
check("disk pressure auto-finalizes visibly", audio.includes("stopForStorageSafety") && audio.includes("automaticStopReason = message"));
check("unavailable capacity fails closed", audio.includes("storageCapacityProbeFailed = true") && audio.includes("stopForStorageSafety(availableBytes: nil)"));

const videoStart = videoController.slice(
  videoController.indexOf("func start("),
  videoController.indexOf("func stop() async"),
);
const videoStartReceipt = videoStart.indexOf("receiptStore.enqueueDurably(");
const videoLedgerArm = videoStart.indexOf("library.beginRecording(");
const videoOwnerRecheck = videoStart.lastIndexOf(
  "AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot)",
);
const videoBytesStart = videoStart.indexOf("service.startRecording(to:");
check("camera session mutations are actor isolated", videoService.includes("actor VideoCaptureService"));
check(
  "failed camera reconfiguration restores the previous inputs",
  videoService.includes("if !configurationSucceeded")
    && videoService.includes("captureSession.canAddInput(previousCameraInput)")
    && videoService.includes("captureSession.canAddInput(previousMicrophoneInput)"),
);
check(
  "camera movie files use ten-second recovery fragments",
  videoService.includes("movieOutput.movieFragmentInterval = CMTime(seconds: 10"),
);
check(
  "camera source profile is resolved from the actual device",
  videoService.includes("device.activeFormat = selection.format")
    && videoService.includes("movieOutput.availableVideoCodecTypes.contains(.hevc)")
    && videoService.includes("VideoCaptureResolvedProfile("),
);
check(
  "camera orientation uses Apple's device rotation coordinator",
  videoService.includes("AVCaptureDevice.RotationCoordinator(")
    && videoService.includes("videoRotationAngleForHorizonLevelCapture")
    && phoneShell.includes("videoRotationAngleForHorizonLevelPreview")
    && !videoService.includes("isVideoRotationAngleSupported(90)"),
);
check(
  "capture orientation is locked before durable START",
  videoStart.indexOf("lockCaptureOrientationForArming()") >= 0
    && videoStart.indexOf("lockCaptureOrientationForArming()")
      < videoStartReceipt
    && videoStart.includes("captureRotationDegrees:")
    && videoStart.includes("orientation: profile.presentationOrientation"),
);
check(
  "camera configuration always releases its lock",
  videoService.includes("defer { device.unlockForConfiguration() }"),
);
check(
  "camera does not silently downgrade an active source",
  videoController.includes("Quality will not silently change during a source.")
    && videoController.includes("without changing quality"),
);
check(
  "call video and retained movie share one camera session",
  (videoService.match(/AVCaptureSession\(\)/g) ?? []).length === 1
    && videoService.includes("captureSession.addOutput(movieOutput)")
    && videoService.includes("captureSession.addOutput(videoDataOutput)"),
);
check(
  "live camera frames discard backlog instead of pressuring the retained source",
  videoService.includes("videoDataOutput.alwaysDiscardsLateVideoFrames = true")
    && videoService.includes("VideoCaptureFrameConsumer")
    && videoService.includes("consumer?.consumeVideoSampleBuffer(sampleBuffer)"),
);
check(
  "LiveKit publishes app-owned frames without opening a second camera",
  providerRoom.includes("LocalVideoTrack.createBufferTrack")
    && providerRoom.includes("source.setLiveVideoFrameConsumer(bridge)")
    && !providerRoom.includes("setCamera(enabled: true)"),
);
const cameraUnpublish = providerRoom.slice(
  providerRoom.indexOf("func unpublishSharedCamera()"),
  providerRoom.indexOf("func publishEpisodeWatchHint", providerRoom.indexOf("func unpublishSharedCamera()")),
);
check(
  "call-camera teardown detaches frames before provider unpublish",
  cameraUnpublish.indexOf("setLiveVideoFrameConsumer(nil)") >= 0
    && cameraUnpublish.indexOf("setLiveVideoFrameConsumer(nil)")
      < cameraUnpublish.indexOf("room.localParticipant.unpublish"),
);
check(
  "call transport profile cannot rewrite retained master quality",
  providerRoom.includes("width: presentationIsPortrait ? 720 : 1_280")
    && providerRoom.includes("fps: min(24")
    && providerRoom.includes("profile: VideoCaptureResolvedProfile")
    && !providerRoom.includes("qualityIntent ="),
);
check(
  "native call uses conventional near-far video and camera controls",
  phoneShell.includes('accessibilityIdentifier("ProviderCallVideoStage")')
    && phoneShell.includes('accessibilityIdentifier("ProviderLocalVideoPreview")')
    && phoneShell.includes('accessibilityIdentifier: "ProviderToggleCameraButton"')
    && phoneShell.includes('accessibilityIdentifier("ProviderSwitchCameraButton")'),
);
check(
  "video START receipt and source ledger are durable before bytes",
  videoStartReceipt >= 0
    && videoStartReceipt < videoLedgerArm
    && videoLedgerArm < videoBytesStart,
);
check(
  "video rechecks immutable owner immediately before bytes",
  videoOwnerRecheck > videoLedgerArm && videoOwnerRecheck < videoBytesStart,
);
check(
  "every post-START setup failure closes the room boundary",
  videoStart.includes("armedRecordingID = recordingID")
    && videoStart.includes("if let recordingID = armedRecordingID")
    && videoStart.includes("closeRoomBoundary("),
);
check(
  "stop requested during camera arming survives the callback race",
  videoController.includes("stopRequestedWhileArming")
    && videoController.includes("if let requestedReason = stopRequestedWhileArming")
    && videoController.includes("await stopIfActive(reason: requestedReason)"),
);
check(
  "pause and camera switch create new files in the same capture group",
  videoController.includes("case cameraSwitch")
    && videoController.includes("captureGroupID: finishedCapture.captureGroupID")
    && videoController.includes("Pause created an explicit source boundary"),
);
check(
  "camera finalization decodes through EOF before upload eligibility",
  videoController.includes("library.validateFinalizedSource(")
    && library.includes("func validateFinalizedSource(")
    && library.includes("readsToEnd: true"),
);
check(
  "background, identity, thermal, and storage pressure close video safely",
  videoController.includes("UIApplication.willResignActiveNotification")
    && videoController.includes(".quipslyCaptureAccountIdentityDidChange")
    && videoController.includes("ProcessInfo.thermalStateDidChangeNotification")
    && videoController.includes("storageSafetyReserveBytes"),
);
check(
  "stale camera profiles cannot arm after preview shutdown",
  videoStart.includes("guard state == .ready")
    && videoController.includes("shutdownPreviewAndClearProfile()")
    && videoController.includes("resolvedProfile = nil"),
);
check(
  "oversized video stays local until the long-source verifier exists",
  videoController.includes("synchronousCloudVerificationLimitBytes")
    && videoController.includes("library.markUploadHeld")
    && videoController.includes("no partial or falsely verified copy was queued"),
);

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
    && library.includes("var audioCapturePipeline: String?")
    && library.includes("var pauseTimelinePolicy: String?")
    && audio.includes("captureGroupId: captureIntent.captureGroupID")
    && audio.includes('"livekit-local-input-pcm"')
    && audio.includes('"silence-preserves-wall-clock"')
    && audio.includes("monotonicStartedNanoseconds: DispatchTime.now().uptimeNanoseconds"),
);
check(
  "source clock evidence is bounded and never claims sample accuracy",
  library.includes("func recordClockEvidence(")
    && library.includes("samples.count <= 3")
    && library.includes("profile.clockSamples = Array(ordered.prefix(3))")
    && library.includes("Array(ordered.suffix(maximumSamples - 3))")
    && library.includes("never rewrite media timestamps or claim")
    && library.includes("sample-accurate synchronization"),
);
check(
  "audio collects periodic and stop clock evidence without endangering media",
  audio.includes("try? await Task.sleep(nanoseconds: 300_000_000_000)")
    && audio.includes("sampleCount: 1")
    && audio.includes("let monotonicStoppedNanoseconds = DispatchTime.now().uptimeNanoseconds")
    && audio.includes("localRecordingLibrary.recordClockEvidence(")
    && audio.includes("Clock history is supporting evidence. The protected local")
    && audio.includes("source keeps recording even if one evidence write fails."),
);
check(
  "closing audio clock evidence cannot block media finalization",
  audio.includes("try? localRecordingLibrary.recordClockEvidence(")
    && audio.indexOf("try? localRecordingLibrary.recordClockEvidence(")
      < audio.indexOf("try localRecordingLibrary.setFinalizedFileProtection("),
);
check(
  "video collects periodic and stop clock evidence without endangering media",
  videoController.includes("try? await Task.sleep(nanoseconds: 300_000_000_000)")
    && videoController.includes("sampleCount: 1")
    && videoController.includes("let monotonicStoppedNanoseconds = DispatchTime.now().uptimeNanoseconds")
    && videoController.includes("library.recordClockEvidence(")
    && videoController.includes("Supporting clock evidence must never stop protected video."),
);
check(
  "closing video clock evidence cannot block media finalization",
  videoController.includes("try? library.recordClockEvidence(")
    && videoController.indexOf("try? library.recordClockEvidence(")
      < videoController.indexOf("try library.setFinalizedFileProtection("),
);
check("source ledger keeps a last-known-good copy", library.includes("recordings-index.last-known-good.json"));
check("corrupt source ledger becomes read-only", library.includes("ledgerIsWritable = false") && library.includes("throw LibraryError.ledgerQuarantined"));
check("corrupt source ledger is never reset empty", !library.includes("persist([])"));
check("crash recovery decodes through declared EOF", /AVAudioFile\(\s*forReading:/.test(library) && library.includes("readsToEnd: true") && library.includes("decodedFrames == frameCount"));
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
check("needs-repair source is not upload eligible", library.includes("var isUploadEligible: Bool") && model.includes("guard recording.isUploadEligible else"));
check(
  "finished video persists actual track evidence before upload",
  library.includes("struct LocalRecordingRecordedMediaProfile")
    && library.includes("sourceProfile.recordedMedia = recordedMedia")
    && library.includes("videoTrack.load(.formatDescriptions)")
    && library.includes("videoTrack.load(.preferredTransform)"),
);
check(
  "video upload fails closed on negotiated versus recorded drift",
  library.includes("sourceIntegrityHoldReason")
    && library.includes("videoIntegrityHoldReason(")
    && library.includes("Upload is held so Quipsly cannot silently relabel the source.")
    && model.includes("recording.sourceIntegrityHoldReason"),
);
check(
  "video upload fails closed on orientation receipt drift",
  library.includes("var captureRotationDegrees: Double?")
    && library.includes("angularDistance(expectedRotation, recordedRotation)")
    && library.includes("the armed landscape source produced"),
);
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
check(
  "ready iPhone endpoints join an active recording without repeated ceremony",
  recordingCoordinator.includes("localRecordingReady: Bool")
    && recordingCoordinator.includes("if localRecordingReady {")
    && phoneShell.includes("coordinatedLocalRecordingReady(")
    && phoneShell.includes("AVAudioApplication.shared.recordPermission != .granted")
    && phoneShell.includes("AVCaptureDevice.authorizationStatus(for: .video) != .authorized"),
);
check(
  "failed native recording keeps the call and exposes one retry",
  recordingCoordinator.includes("else if state == .startFailed")
    && recordingCoordinator.includes("Your call is still connected; try again.")
    && recordingCoordinator.includes("joinConfirmationRequired = true"),
);
const networkRecovery = uploadManager.slice(
  uploadManager.indexOf("pathMonitor.pathUpdateHandler"),
  uploadManager.indexOf("pathMonitor.start"),
);
check(
  "network return automatically resumes protected uploads",
  networkRecovery.includes("path.status == .satisfied")
    && networkRecovery.includes("reassociateBackgroundSession(resumePendingUploads: true)"),
);
check(
  "relaunch recovery promises automatic resume rather than a required ritual",
  uploadManager.includes("Quipsly will resume automatically when the connection and account are ready."),
);
check(
  "Library has one calm aggregate upload recovery action",
  phoneShell.includes('model.uploadManager.isUploading ? "Uploading recording" : "Upload needs attention"')
    && phoneShell.includes('Button("Try upload again") { model.retryUploads() }')
    && phoneShell.split('Button("Try upload again") { model.retryUploads() }').length === 2
    && !phoneShell.includes('Button("Retry preserved uploads")')
    && !phoneShell.includes('Button("Try again now")'),
);

console.log(`quipsly iOS capture durability contract: ${checks.length}/${checks.length} checks passed`);
for (const name of checks) console.log(`  ✓ ${name}`);
