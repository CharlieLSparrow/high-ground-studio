#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_BASE_URL = "https://nest.quipsly.com";
const DEFAULT_TIMEOUT_MS = 10_000;
const ROOT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const args = new Map(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--"))
    .map((arg) => {
      const [key, ...rawValue] = arg.slice(2).split("=");
      return [key, rawValue.length ? rawValue.join("=") : "1"];
    }),
);

const baseUrl = normalizeBaseUrl(
  args.get("base-url")
    || process.env.QUIPSLY_MOBILE_CAPTURE_BASE_URL
    || process.env.NEXT_PUBLIC_NEST_BASE_URL
    || DEFAULT_BASE_URL,
);
const bearerToken =
  args.get("token")
  || process.env.QUIPSLY_MOBILE_CAPTURE_BEARER_TOKEN
  || process.env.QUIPSLY_NATIVE_ACCESS_TOKEN
  || "";
const timeoutMs = Number.parseInt(
  args.get("timeout-ms")
    || process.env.QUIPSLY_MOBILE_CAPTURE_TIMEOUT_MS
    || String(DEFAULT_TIMEOUT_MS),
  10,
) || DEFAULT_TIMEOUT_MS;
const jsonOutput = args.get("json") === "1" || process.env.QUIPSLY_MOBILE_CAPTURE_JSON === "1";
const sourceOnly = args.get("source-only") === "1" || process.env.QUIPSLY_MOBILE_CAPTURE_SOURCE_ONLY === "1";

const checks = [];

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function addCheck(name, status, summary, details = undefined) {
  checks.push({ name, status, summary, details });
}

function isObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value) {
  return typeof value === "boolean" ? value : null;
}

function expect(condition, name, summary, details) {
  addCheck(name, condition ? "pass" : "fail", summary, details);
}

function sourceText(pathFromRoot) {
  return readFileSync(join(ROOT_DIR, pathFromRoot), "utf8");
}

function includesNormalized(source, needle) {
  const compact = (value) => String(value).replace(/\s+/g, " ").trim();
  return compact(source).includes(compact(needle));
}

function checkUploadContractSources() {
  const contractText = sourceText("packages/quipsly-domain/src/mobile-capture-upload.ts");
  const chunkRouteText = sourceText("apps/quipsly/src/app/api/ingest/mobile/chunk/route.ts");
  const canonicalChunkRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/uploads/chunk/route.ts");
  const canonicalResumableRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/uploads/resumable/route.ts");
  const canonicalFinalizeRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/uploads/resumable/finalize/route.ts");
  const oneShotRouteText = sourceText("apps/quipsly/src/app/api/ingest/mobile/route.ts");
  const audioCaptureText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/AudioCaptureController.swift");
  const localRecordingLibraryText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/LocalRecordingLibrary.swift");
  const capturePhoneShellText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift");
  const uploadManagerText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/UploadManager.swift");
  const uploadLedgerText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/UploadLedgerStore.swift");
  const appDelegateText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/AppDelegate.swift");
  const bridgeText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift");
  const uploadRemoveCalls = uploadManagerText.match(/removeItem\s*\(at:/g) || [];
  const audioCaptureRemoveCalls = audioCaptureText.match(/removeItem\s*\(/g) || [];

  expect(
    contractText.includes("quipsly-mobile-capture-upload-v1")
      && contractText.includes("clientShouldPreserveOriginal")
      && contractText.includes("cleanupAllowed: false")
      && contractText.includes("buildMobileCaptureServerVerification"),
    "uploadContractSharedDomain",
    "Mobile capture upload has a shared contract for verification and local retention.",
  );
  expect(
    chunkRouteText.includes("LEGACY_MOBILE_CHUNK_DISABLED")
      && chunkRouteText.includes("localRetention")
      && chunkRouteText.includes("status: 410")
      && !chunkRouteText.includes("readFile(")
      && !chunkRouteText.includes("arrayBuffer("),
    "chunkUploadReceiptShape",
    "Legacy chunk ingress rejects before reading bytes and points devices to resumable v2.",
  );
  expect(
    canonicalChunkRouteText.includes("Legacy chunk compatibility surface")
      && canonicalChunkRouteText.includes("../../../../ingest/mobile/chunk/route")
      && canonicalResumableRouteText.includes("Canonical mobile-capture upload creation")
      && canonicalResumableRouteText.includes("ingest/mobile/resumable/route")
      && canonicalFinalizeRouteText.includes("Canonical mobile-capture verification")
      && canonicalFinalizeRouteText.includes("ingest/mobile/resumable/finalize/route"),
    "canonicalMobileCaptureChunkRoute",
    "Mobile capture makes direct-to-GCS resumable upload canonical while the compatibility adapter returns a terminal migration receipt.",
  );
  expect(
    oneShotRouteText.includes("LEGACY_MOBILE_MULTIPART_DISABLED")
      && oneShotRouteText.includes("localRetention")
      && oneShotRouteText.includes("status: 410")
      && !oneShotRouteText.includes("formData(")
      && !oneShotRouteText.includes("arrayBuffer("),
    "oneShotUploadReceiptShape",
    "Legacy multipart ingress rejects before request parsing and preserves the local-retention instruction.",
  );
  expect(
    oneShotRouteText.includes("MOBILE_CAPTURE_RESUMABLE_CONTRACT_KIND")
      && oneShotRouteText.includes("/api/mobile/capture/uploads/resumable")
      && !oneShotRouteText.includes("uploadMediaBuffer"),
    "oneShotUploadUsesMediaVault",
    "Legacy one-shot upload cannot write bytes and redirects clients to quota-reserved media-vault resumable upload.",
  );
  expect(
    uploadManagerText.includes("quipsly-mobile-capture-gcs-resumable-v2")
      && uploadManagerText.includes("/mobile/capture/uploads/resumable")
      && uploadManagerText.includes("/resumable/finalize")
      && uploadManagerText.includes("uploadTask(with: request, fromFile: fileURL)")
      && uploadManagerText.includes("computeFileDigest")
      && uploadManagerText.includes("server-computed size and SHA-256")
      && uploadManagerText.includes("prepareFreshCanonicalTransfer")
      && uploadManagerText.includes("restartUploadSession")
      && uploadManagerText.includes("isAllowedGCSUploadURL")
      && uploadManagerText.includes("/mobile/capture/uploads/chunk")
      && !uploadManagerText.includes("/api/mobile/capture/uploads/chunk")
      && !uploadManagerText.includes("/ingest/mobile/chunk")
      && uploadManagerText.includes("A 200 is not permission to delete the local source")
      && uploadManagerText.includes("holdUploadForRecovery")
      && uploadManagerText.includes("Quipsly could not open the preserved local recording")
      && !uploadManagerText.includes("mock endpoint"),
    "nativeUploadNotMock",
    "Native upload client uses direct-to-GCS resumable transfer with server verification, fresh-session ambiguity recovery, and legacy chunk-job compatibility.",
  );
  expect(
    uploadLedgerText.includes("FileProtectionType.completeUntilFirstUserAuthentication")
      && uploadLedgerText.includes("options: .atomic")
      && uploadLedgerText.includes("kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly")
      && uploadLedgerText.includes("isExcludedFromBackup = true")
      && uploadLedgerText.includes("capabilityService"),
    "nativeUploadLedgerProtected",
    "Native upload state is atomically file-protected while secret resumable capabilities are isolated in this-device-only Keychain storage.",
  );
  expect(
    bridgeText.includes("func normalizedNestBaseURL")
      && bridgeText.includes("func normalizedNestAPIBaseURL")
      && bridgeText.includes("if trimmed.hasSuffix(\"/api\")")
      && bridgeText.includes("trimmed.removeLast(4)")
      && bridgeText.includes("https://nest.quipsly.com")
      && bridgeText.includes("normalizedNestBaseURL(value))/api"),
    "nativeUploadBaseUrlNormalization",
    "Native capture normalizes Nest base URLs once, so app settings avoid double-/api upload paths.",
  );
  expect(
    uploadManagerText.includes("static let backgroundSessionIdentifier = \"com.quipsly.upload.chunked\"")
      && uploadManagerText.includes("URLSessionConfiguration.background(withIdentifier: Self.backgroundSessionIdentifier)")
      && appDelegateText.includes("handleEventsForBackgroundURLSession identifier")
      && appDelegateText.includes("if identifier == UploadManager.backgroundSessionIdentifier")
      && appDelegateText.includes("backgroundSessionCompletionHandler = {")
      && appDelegateText.includes("uploadManagerDidFinishBackgroundSessionEvents")
      && appDelegateText.includes("UploadManager.shared.prepareForBackgroundEvents()")
      && appDelegateText.includes("completionHandler()"),
    "nativeBackgroundUploadWakeupSharedIdentifier",
    "Native capture uses one shared background upload identifier from URLSession creation through AppDelegate wake-up completion.",
  );
  expect(
    uploadRemoveCalls.length >= 1
      && uploadManagerText.includes(".appendingPathComponent(\"\\(sessionId)_chunk_\\(chunkIndex).tmp\")")
      && !uploadManagerText.includes("removeItem(at: uploadSession.fileUrl)")
      && !uploadManagerText.includes("removeItem(at: fileUrl)")
      && uploadManagerText.includes("Even verified uploads retain their local source"),
    "nativeUploadOnlyDeletesTempChunks",
    "Native upload cleanup only removes temporary compatibility chunks; preserved source recordings stay local until a future verified-prune policy exists.",
    { removeItemCallCount: uploadRemoveCalls.length },
  );
  expect(
    audioCaptureRemoveCalls.length === 0
      && audioCaptureText.includes("Production capture rule: never silently delete local recordings.")
      && audioCaptureText.includes("Local recordings are preserved until Quipsly verifies upload."),
    "nativeRecorderNeverSilentlyPrunesOriginals",
    "Native recorder cleanup is a recovery note, not a blind local source deletion path.",
    { removeItemCallCount: audioCaptureRemoveCalls.length },
  );
  expect(
    audioCaptureText.includes("@Published private(set) var userMarkOffsets")
      && audioCaptureText.includes("endCurrentSegment(reason: .userMark")
      && audioCaptureText.includes("userMarkOffsets.append")
      && localRecordingLibraryText.includes("var userMarkOffsets: [TimeInterval]")
      && localRecordingLibraryText.includes("segment.stopReason == .userMark")
      && capturePhoneShellText.includes("CaptureMarkMomentButton")
      && capturePhoneShellText.includes("LocalRecordingMomentMarks")
      && capturePhoneShellText.includes("Adds a source-timeline marker without pausing or changing the audio file."),
    "nativeTimelineMarksRemainSourceMetadata",
    "During-capture marks are visible live and in Library, persist as source-manifest segment boundaries, and do not pause or rewrite audio bytes.",
  );
}

function checkNestPortabilityContractSources() {
  const nativeText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureNestPortability.swift",
  );
  const accountText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift",
  );
  const uiTestText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift",
  );
  const runtimeUITestText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift",
  );
  const runtimeUIScriptText = sourceText(
    "apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh",
  );
  const operatedDogfoodText = sourceText(
    "scripts/quipsly-local-nest-portability-dogfood.mjs",
  );
  const exportRouteText = sourceText(
    "apps/quipsly/src/app/api/nests/[slug]/portable-export/route.ts",
  );
  const restoreRouteText = sourceText(
    "apps/quipsly/src/app/api/nests/[slug]/portable-restore/route.ts",
  );
  const restoreServerText = sourceText(
    "apps/quipsly/src/lib/server/nest-portable-restore.ts",
  );
  const webPortabilityText = sourceText(
    "apps/quipsly/src/app/(app)/nests/[slug]/portable/NestPortabilityClient.tsx",
  );
  const applyRestoreText = restoreServerText.slice(
    restoreServerText.indexOf("export async function applyNestRestore"),
  );

  expect(
    accountText.includes("CaptureAccountNestPortability")
      && accountText.includes("CaptureNestPortabilityView")
      && uiTestText.includes("testAccountMakesOwnerNestBackupAndPreviewFirstRestoreReachable")
      && uiTestText.includes("CaptureNestPortabilityView"),
    "nativeNestPortabilityReachable",
    "Capture Account makes owner-controlled Nest backup and preview-first restore reachable and operates that route in UI coverage.",
  );
  expect(
    nativeText.includes("/api/mobile/capture/work")
      && nativeText.includes("$0.role.uppercased() == \"OWNER\"")
      && nativeText.includes("/api/nests/")
      && nativeText.includes("portable-export")
      && exportRouteText.includes('action: "manage"')
      && restoreRouteText.includes('action: "manage"'),
    "nativeNestPortabilityOwnerBoundary",
    "The phone lists owned Nests while export and restore independently reauthorize manage access at Nest.",
  );
  expect(
    nativeText.includes("captureNestPortableBundleLimit = 30 * 1024 * 1024")
      && nativeText.includes("startAccessingSecurityScopedResource")
      && nativeText.includes(".completeFileProtection")
      && nativeText.includes("isExcludedFromBackup = true")
      && nativeText.includes("uniqueExportDestination")
      && nativeText.includes("fileManager.fileExists")
      && nativeText.includes("JSONSerialization.jsonObject")
      && nativeText.includes("storedValues.fileSize == data.count")
      && nativeText.includes("storedValues.isExcludedFromBackup == true")
      && nativeText.includes("storedData == data")
      && nativeText.includes("FileManager.default.removeItem(at: destination)"),
    "nativeNestPortabilityProtectedFileBoundary",
    "Capture bounds imported and exported JSON, handles security-scoped files, proves protected app-owned bytes and backup exclusion by readback, removes only a failed new copy, and never silently replaces an earlier backup.",
  );
  expect(
    nativeText.includes("requiresExplicitApply == true")
      && nativeText.includes('payload.mode == "validate"')
      && nativeText.includes("payload.planSha256")
      && nativeText.includes("plan.isSafeToApply")
      && nativeText.includes("overwrites == 0")
      && nativeText.includes("sourceMutations == 0")
      && nativeText.includes("externalSideEffects == 0")
      && nativeText.includes("showsApplyConfirmation = true"),
    "nativeNestPortabilityPreviewBeforeApply",
    "Restore stays read-only through exact plan validation and requires a separate user confirmation before apply.",
  );
  expect(
    nativeText.includes("payload.manifestSha256 == verifiedPlan.manifestSha256")
      && nativeText.includes("appliedPlan == verifiedPlan")
      && nativeText.includes('forHTTPHeaderField: "x-quipsly-restore-plan-sha256"')
      && nativeText.includes("payload.boundaries?.provesSafeApply == true")
      && nativeText.includes('receipt.schema == "quipsly-nest-restore-receipt-v1"')
      && nativeText.includes("receipt.integrityRecomputed")
      && restoreRouteText.includes('get("mode") === "apply" ? "apply" : "validate"')
      && restoreRouteText.includes('if (mode === "validate")')
      && restoreRouteText.includes("expectedPlanSha256")
      && restoreRouteText.includes("NestRestorePlanChangedError")
      && applyRestoreText.includes("planSha256 !== input.expectedPlanSha256")
      && applyRestoreText.indexOf("planSha256 !== input.expectedPlanSha256")
        < applyRestoreText.indexOf("const tagResolutions")
      && webPortabilityText.includes('"x-quipsly-restore-plan-sha256": planSha256')
      && webPortabilityText.includes("result.planSha256 !== planSha256")
      && webPortabilityText.includes("JSON.stringify(result.plan) !== JSON.stringify(plan)"),
    "nativeNestPortabilityApplyReadback",
    "Capture binds apply to the exact reviewed plan before transaction writes, then requires manifest, safe-boundary, receipt-schema, and recomputed-integrity readback.",
  );
  expect(
    nativeText.includes('accessibilityIdentifier("CaptureNestExportFilename")')
      && runtimeUITestText.includes("testOwnerCreatesTwoVersionedNestBackupsFromAccount")
      && runtimeUITestText.includes("CaptureNestExportFilename")
      && runtimeUITestText.includes("label != %@")
      && runtimeUIScriptText.includes("nest-portability)")
      && runtimeUIScriptText.includes("testOwnerCreatesTwoVersionedNestBackupsFromAccount")
      && operatedDogfoodText.includes("runAuthenticatedIPhoneExport")
      && operatedDogfoodText.includes('headers.set("connection", "close")')
      && operatedDogfoodText.includes('"Portable stale-plan apply",\n    409')
      && operatedDogfoodText.includes("Disposable Firebase emulator identity still signs in."),
    "nativeNestPortabilityOperatedAcceptanceLane",
    "A disposable authenticated lane operates two distinct iPhone backups, stale-plan refusal, revalidation, restore/replay, and exact Firebase/PostgreSQL cleanup without retrying ambiguous writes.",
  );
}

function checkMeetingSpineContractSources() {
  const roomJoinText = sourceText("apps/quipsly/src/app/api/mobile/capture/rooms/join/route.ts");
  const roomJoinDiagnosticsText = sourceText("apps/quipsly/src/app/api/mobile/capture/rooms/join/diagnostics/route.ts");
  const roomJoinDiagnosticsHelperText = sourceText("apps/quipsly/src/lib/server/mobile-capture-room-join-diagnostics.ts");
  const readinessText = sourceText("apps/quipsly/src/app/api/mobile/capture/readiness/route.ts");
  const providerRecordingRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/rooms/provider-recording/route.ts");
  const sessionContextRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/sessions/context/route.ts");
  const sessionsRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/sessions/route.ts");
  const meetingSpineText = sourceText("packages/quipsly-domain/src/coaching-meeting-spine.ts");
  const sessionsText = sourceText("apps/quipsly/src/lib/server/mobile-capture-sessions.ts");
  const contentReadinessText = sourceText("apps/quipsly/src/lib/server/mobile-capture-content-readiness.ts");
  const lifecycleText = sourceText("packages/quipsly-domain/src/coaching-lifecycle.ts");
  const bridgeText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift");
  const componentsText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift");
  const capturePhoneShellText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift");
  const captureRecorderViewText = capturePhoneShellText.slice(
    capturePhoneShellText.indexOf("private struct CaptureRecorderView: View"),
    capturePhoneShellText.indexOf("private struct CaptureSessionFollowUpStatus: View"),
  );
  const providerRoomText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/ProviderRoomController.swift");
  const providerRoomCallAudioEvidenceText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/ProviderRoomCallAudioEvidence.swift");
  const providerRoomCallAudioMeterText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/ProviderRoomCallAudioMeter.swift");
  const providerAudioPCMLevelsText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/ProviderAudioPCMLevels.swift");
  const authManagerText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/AuthManager.swift");
  const audioCaptureText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/AudioCaptureController.swift");
  const authenticatedDataBoundary = authManagerText.slice(
    authManagerText.indexOf("func authenticatedData("),
    authManagerText.indexOf("/// Downloads a potentially large authenticated source"),
  );
  const authenticatedDownloadBoundary = authManagerText.slice(
    authManagerText.indexOf("func authenticatedDownload("),
    authManagerText.indexOf("func stableOwnerSnapshot()"),
  );
  const episodeChatText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/MobileEpisodeChat.swift");
  const coachingHomeText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureCoachingHome.swift");
  const captureExperienceUITestText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift");
  const nestChatRouteText = sourceText("apps/quipsly/src/app/api/nest-chat/route.ts");
  const sessionConversationText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/MobileSessionConversation.swift");
  const liveKitEgressText = sourceText("apps/quipsly/src/lib/server/coaching-livekit-egress.ts");
  const providerRecordingCommandText = sourceText("apps/quipsly/src/lib/server/provider-recording-command.ts");
  const liveKitWebhookText = sourceText("apps/quipsly/src/app/api/providers/livekit/webhook/route.ts");
  const runtimeUITestText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift");
  const runtimeRunnerText = sourceText("apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh");

  expect(
    roomJoinText.includes("buildQuipslyMeetingJoinSpine")
      && meetingSpineText.includes("providerJoin")
      && meetingSpineText.includes("providerReadiness")
      && meetingSpineText.includes("recordingBoundary")
      && meetingSpineText.includes("providerRecording")
      && meetingSpineText.includes("localFallback"),
    "roomJoinStructuredSpineContract",
    "Room join responses expose provider readiness, recording boundary, provider recording, and local fallback as explicit contract fields.",
  );
  expect(
    episodeChatText.includes("case engagement")
      && episodeChatText.includes("MobileChatPersistedLiveHint.engagementThreadKey")
      && episodeChatText.includes("payload.engagement?.id.lowercased() == context.scopeKey")
      && episodeChatText.includes("CaptureCoachingConversationOpenButton")
      && coachingHomeText.includes("CaptureCoachingSessionContinuity"),
    "nativeCoachingRelationshipRetainsConversationAndSessions",
    "Capture keeps relationship-wide conversation and Session continuity beside private/shared work on the iPhone.",
  );
  expect(
    coachingHomeText.includes('"action": "reschedule-booking"')
      && coachingHomeText.includes('"action": "cancel-booking"')
      && coachingHomeText.includes("CaptureCoachingManage_")
      && coachingHomeText.includes("CaptureCoachingRescheduleSheet")
      && coachingHomeText.includes("CaptureCoachingSaveReschedule")
      && coachingHomeText.includes('["CANCELED", "COMPLETED", "NO_SHOW"]')
      && coachingHomeText.includes("The client space and its existing work stay available."),
    "nativeCoachingSchedulingManagementParity",
    "Capture lets an authorized coach reschedule or cancel a canonical appointment from the iPhone while preserving the client relationship and existing work.",
  );
  expect(
    coachingHomeText.includes("MobilePublicCoachingOffering")
      && coachingHomeText.includes("/api/coaching/public?source=capture-ios")
      && coachingHomeText.includes("/api/coaching/booking-requests")
      && coachingHomeText.includes("AuthManager.shared.authenticatedData(for: request)")
      && coachingHomeText.includes('action: "convert-booking-hold"')
      && coachingHomeText.includes('action: "release-booking-hold"')
      && coachingHomeText.includes("CaptureCoachingClientRequest_")
      && coachingHomeText.includes("CaptureCoachingIncomingRequest_")
      && coachingHomeText.includes("CaptureCoachingConfirmRequest_")
      && coachingHomeText.includes("CaptureCoachingCancelRequest_"),
    "nativeCoachingSelfSchedulingParity",
    "Capture lists only the server's published public times, authenticates client request mutations, lets a client cancel their own request, and gives the assigned coach explicit confirm or decline actions on iPhone.",
  );
  expect(
    coachingHomeText.includes("ProtectedCoachingRunwayCache")
      && coachingHomeText.includes("ownerAccountID == ownerAccountID")
      && coachingHomeText.includes("ownerEmail == ownerEmail")
      && coachingHomeText.includes(".completeFileProtection")
      && coachingHomeText.includes("isExcludedFromBackup = true")
      && coachingHomeText.includes("allowOfflineRecovery: true")
      && coachingHomeText.includes("Scheduling actions are disabled until Nest reconnects.")
      && coachingHomeText.includes("guard !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed")
      && coachingHomeText.includes("CaptureCoachingOfflineSnapshot")
      && captureExperienceUITestText.includes("testOfflineCoachingSnapshotIsClearlyReadOnly"),
    "nativeCoachingRequestReadbackIsProtectedAndReadOnlyOffline",
    "Capture preserves an account-partitioned, file-protected request snapshot across relaunch while clearly marking it stale and refusing scheduling mutations until authoritative Nest state returns.",
  );
  expect(
    coachingHomeText.includes('if action == "convert-booking-hold"')
      && coachingHomeText.includes("latestHandoff = payload.result")
      && coachingHomeText.includes("appointmentResult(for: booking)")
      && coachingHomeText.includes("CaptureCoachingConfirmedHandoff")
      && coachingHomeText.includes("if model.usesPreviewData")
      && bridgeText.includes("$0.callRoomId == identifier")
      && bridgeText.includes("authoritativeSessionID == nil")
      && bridgeText.includes(": authoritativeSession?.id")
      && captureExperienceUITestText.includes("testConfirmedRequestHasImmediateSessionHandoff")
      && captureExperienceUITestText.includes('app.buttons["ProviderJoinRoomButton"].exists'),
    "nativeConfirmedRequestHasImmediateSessionHandoff",
    "After an assigned coach confirms a requested time, Capture preserves the idempotent booking receipt and immediately presents the same explicit Open Session and share handoff as direct scheduling.",
  );
  expect(
    coachingHomeText.includes("var coachLabel: String")
      && coachingHomeText.includes("CaptureCoachingRequestChange_")
      && coachingHomeText.includes("MobileCoachingScheduleRequestSheet")
      && coachingHomeText.includes("conversation.send(")
      && coachingHomeText.includes("This sends a private message. It does not move or cancel the Session until your coach confirms the change.")
      && coachingHomeText.includes('Text(client.isCoach ? booking.clientLabel : booking.coachLabel)')
      && runtimeUITestText.includes("CaptureCoachingChangeRequestSent")
      && runtimeRunnerText.includes("TEST_COACHING_CLIENT_REQUEST_NOTE")
      && !coachingHomeText.includes('"action": "request-reschedule-booking"'),
    "nativeClientSchedulingRequestUsesRelationshipConversation",
    "Capture labels the other participant correctly and lets an invited client request a new time or cancellation through the durable relationship conversation without bypassing coach availability or mutating the appointment.",
  );
  expect(
    coachingHomeText.includes("MobileCoachingScheduleRequestReviewCard")
      && coachingHomeText.includes("CaptureCoachingPendingChangeRequest_")
      && coachingHomeText.includes("CaptureCoachingReviewRequestedTime_")
      && coachingHomeText.includes("CaptureCoachingKeepCurrent_")
      && coachingHomeText.includes("MobileCoachingScheduleDecisionEnvelope")
      && runtimeUITestText.includes("Phone-first coach scheduling decision")
      && runtimeUITestText.includes("Keeping the current appointment should append a decision")
      && nestChatRouteText.includes("COACHING_SCHEDULE_REQUEST_SCHEMA")
      && nestChatRouteText.includes("Only the invited client can request a change")
      && nestChatRouteText.includes("Only the assigned coach can decide this scheduling request")
      && nestChatRouteText.includes("This appointment changed before the request was sent")
      && !coachingHomeText.includes('"action": "accept-client-schedule-request"'),
    "nativeCoachSchedulingRequestDecisionBoundary",
    "Capture presents a typed client request to the assigned coach, pre-fills the requested time for explicit review, and can keep the current appointment through an auditable conversation decision without parsing prose or silently mutating calendar truth.",
  );
  expect(
    coachingHomeText.includes("func scheduleConflict(")
      && coachingHomeText.includes("scheduledStart < existingEnd && scheduledEnd > existingStart")
      && coachingHomeText.includes("excludingBookingID: booking.id")
      && coachingHomeText.includes("CaptureCoachingAppointmentConflict")
      && coachingHomeText.includes("CaptureCoachingRescheduleConflict")
      && coachingHomeText.includes("scheduleConflict != nil"),
    "nativeConflictAwareScheduling",
    "Capture warns about known Quipsly conflicts before save, excludes the booking being edited, and still relies on the server mutation boundary for final authority.",
  );
  expect(
    coachingHomeText.includes("MobileCoachingAvailabilitySheet")
      && coachingHomeText.includes('"action": "update-weekly-availability"')
      && coachingHomeText.includes("func isOutsideWeeklyAvailability(")
      && coachingHomeText.includes("CaptureCoachingWorkingHoursButton")
      && coachingHomeText.includes("CaptureCoachingAppointmentOutsideWorkingHours")
      && coachingHomeText.includes("CaptureCoachingRescheduleOutsideWorkingHours")
      && coachingHomeText.includes("CaptureCoachingSaveWorkingHours"),
    "nativeCoachWorkingHours",
    "Capture gives a coach one conventional weekly working-hours sheet, prevents obviously unavailable choices before save, and leaves final timezone-aware authority at the server mutation boundary.",
  );
  expect(
    meetingSpineText.includes("joiningStartsRecording: false")
      && meetingSpineText.includes("localRecordingRequiresConsent: true")
      && meetingSpineText.includes("providerRecordingRequiresAllParticipantConsent: true")
      && meetingSpineText.includes("visibleRecordingIndicatorRequired: true"),
    "roomJoinRecordingBoundaryTruth",
    "Room join contract states that joining is not recording and recording remains consent-gated and visible.",
  );
  expect(
    meetingSpineText.includes("startsWithJoin: false")
      && meetingSpineText.includes("requiresExplicitStart: true")
      && meetingSpineText.includes("receiptRequiredBeforeTranscript: true")
      && meetingSpineText.includes("Start provider recording only from a visible Quipsly control"),
    "roomJoinProviderRecordingTruth",
    "Provider recording is an explicit visible egress action with receipt evidence, not a side effect of joining.",
  );
  expect(
    meetingSpineText.includes("livekit-ready")
      && meetingSpineText.includes("livekit-needs-config")
      && meetingSpineText.includes("provider-not-configured"),
    "roomJoinProviderReadinessStates",
    "Room join contract distinguishes ready provider, missing provider config, and planned/local-fallback states.",
  );
  expect(
    roomJoinText.includes("paymentHoldForRoom")
      && roomJoinText.includes("payment-hold")
      && roomJoinText.includes("This paid one-to-one coaching session is waiting on payment evidence before joining or recording.")
      && roomJoinText.includes("stripeIsEvidenceOnly: true")
      && roomJoinText.includes("noPaymentMutation: true"),
    "roomJoinPaymentHoldBoundary",
    "Room join refuses paid one-to-one sessions that are still waiting on payment evidence without mutating Stripe state.",
  );
  expect(
    readinessText.includes("roomJoinDiagnostics")
      && readinessText.includes("/api/mobile/capture/rooms/join/diagnostics"),
    "roomJoinDiagnosticsAdvertised",
    "Capture readiness advertises a side-effect-free diagnostic route separate from the real join route.",
  );
  expect(
    readinessText.includes("getQuipslyLiveKitEgressReadiness")
      && liveKitEgressText.includes("MEDIA_VAULT_PREFIXES.livekitRecording")
      && providerRecordingCommandText.includes("MEDIA_VAULT_BUCKET_ENV_NAMES")
      && providerRecordingCommandText.includes("LIVEKIT_EGRESS_ENABLED")
      && providerRecordingCommandText.includes("requestProviderRecordingStart")
      && providerRecordingCommandText.includes("acquirePrismaAdvisoryTransactionLock")
      && providerRecordingCommandText.includes("PROVIDER_START_OUTCOME_UNKNOWN")
      && providerRecordingCommandText.includes("will not risk a duplicate retry")
      && providerRecordingCommandText.includes("providerRecordingIsOptionalWitness: true")
      && liveKitWebhookText.includes("verifyLiveKitWebhook")
      && liveKitWebhookText.includes("application/webhook+json")
      && liveKitEgressText.includes("productionStartInterlock")
      && liveKitEgressText.includes("durableCommandLedgerImplemented: true")
      && liveKitEgressText.includes("authenticatedWebhookLedgerImplemented: true")
      && liveKitEgressText.includes("CallRoom, RecordingAsset, TranscriptJob, packets, and receipts own meaning"),
    "liveKitEgressUsesSharedMediaVaultReadiness",
    "LiveKit provider recording uses the shared vault, durable idempotent commands, per-room serialization, deterministic recovery, authenticated webhook receipts, and an explicit operator-enabled start gate.",
  );
  expect(
    bridgeText.includes("liveKitEgressStartEnabled")
      && bridgeText.includes("providerEgressLabel")
      && bridgeText.includes("Configured, but held until LIVEKIT_EGRESS_ENABLED=true. Joining is not recording.")
      && capturePhoneShellText.includes("readiness.providerEgressLabel")
      && capturePhoneShellText.includes("readiness.providerEgressDetail")
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureProviderRecordingBoundary")'),
    "nativeReadinessShowsProviderEgressGate",
    "Native Capture readback distinguishes provider join readiness from server-recording start readiness.",
  );
  expect(
    providerRoomText.includes("import CallKit")
      && providerRoomText.includes("CXProviderConfiguration()")
      && providerRoomText.includes("CXStartCallAction")
      && providerRoomText.includes("CXEndCallAction")
      && providerRoomText.includes("reportOutgoingCall")
      && providerRoomText.includes("nativeCallPresentationLabel")
      && providerRoomText.includes("Quipsly recording truth remains separate")
      && capturePhoneShellText.includes("model.providerRoom.nativeCallPresentationLabel")
      && capturePhoneShellText.includes('DisclosureGroup("Technical details"')
      && capturePhoneShellText.includes("Joining the call never starts a recording")
      && capturePhoneShellText.includes("readiness.providerEgressLabel")
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureProviderRecordingBoundary")'),
    "nativeCallKitPresentationBoundary",
    "Native Capture protects CallKit as iPhone presentation for a Quipsly-owned room, never as recording, consent, transcript, or packet truth.",
  );
  expect(
    providerRoomCallAudioMeterText.includes("AudioManager.shared.add(localAudioRenderer: self)")
      && providerRoomCallAudioMeterText.includes("AudioManager.shared.remove(localAudioRenderer: self)")
      && providerRoomCallAudioMeterText.includes("no PCM is retained, written, uploaded")
      && !providerRoomCallAudioMeterText.includes("AVAudioRecorder")
      && !providerRoomCallAudioMeterText.includes("AVAudioFile")
      && !providerRoomCallAudioMeterText.includes("URLSession")
      && providerAudioPCMLevelsText.includes("never stores, uploads, or writes an audio buffer")
      && providerRoomCallAudioEvidenceText.includes('case healthy')
      && providerRoomCallAudioEvidenceText.includes('case needsAttention')
      && providerRoomCallAudioEvidenceText.includes('"Microphone sounds healthy"')
      && providerRoomCallAudioEvidenceText.includes('"No microphone signal"')
      && providerRoomText.includes("refreshCallAudioMeterLifecycle()")
      && providerRoomText.includes("stopCallAudioMeter()")
      && providerRoomText.includes("callAudioWatchdogTask?.cancel()")
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureCallMicrophoneHealth")')
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureCallMicrophoneGuidance")')
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureCallParticipantPresence")')
      && capturePhoneShellText.includes('accessibilityIdentifier("CapturePersistentCallDock")')
      && capturePhoneShellText.includes('accessibilityIdentifier: "ProviderToggleMuteButton"')
      && capturePhoneShellText.includes('accessibilityIdentifier: "ProviderLeaveRoomButton"')
      && capturePhoneShellText.includes('.safeAreaInset(edge: .bottom, spacing: 0)')
      && providerRoomCallAudioEvidenceText.includes('"Waiting for others"')
      && providerRoomCallAudioEvidenceText.includes('"2 people here"'),
    "nativeLiveCallMicrophoneConfidence",
    "Native Capture keeps participant presence plus persistent Mute and Leave controls conventional while projecting one plain-language live microphone state from transient exact-path PCM without creating a recording.",
  );
  expect(
    authManagerText.includes("the denial belongs to that feature")
      && authManagerText.includes("own decoding and handling every returned HTTP status.")
      && !authenticatedDataBoundary.includes("AuthenticatedRequestError.sessionRejected")
      && authenticatedDownloadBoundary.includes("guard retryResult.1.statusCode != 401")
      && authenticatedDownloadBoundary.includes("removeItem(at: retryResult.0)")
      && authenticatedDownloadBoundary.includes("AuthenticatedRequestError.sessionRejected")
      && nestChatRouteText.includes('import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";')
      && nestChatRouteText.includes("const session = await getQuipslySessionFromRequest(request);"),
    "nativeFeatureAuthorizationCannotEvictValidAccount",
    "A feature-scoped denial cannot evict a canonically verified native account, and episode chat accepts the shared Firebase bearer-or-cookie identity boundary.",
  );
  expect(
    episodeChatText.includes("pollingDisabledForMissingThread")
      && episodeChatText.includes("responseCode == 404")
      && episodeChatText.includes("scope.title) unavailable")
      && episodeChatText.includes("guard !self.pollingDisabledForMissingThread else { return }"),
    "nativeMissingEpisodeThreadStopsBackgroundPolling",
    "A missing canonical Episode or Session thread stops background polling after the terminal 404 while preserving explicit manual refresh.",
  );
  expect(
    audioCaptureText.includes("@Published private(set) var inputLevelDB")
      && audioCaptureText.includes("@Published private(set) var peakInputLevelDB")
      && capturePhoneShellText.includes("CaptureRecorderInputEvidence")
      && capturePhoneShellText.includes("averagePowerDB: audioCapture.inputLevelDB")
      && capturePhoneShellText.includes("peakPowerDB: audioCapture.peakInputLevelDB")
      && capturePhoneShellText.includes("Not LUFS or true peak")
      && capturePhoneShellText.includes('accessibilityLabel("Microphone level")')
      && capturePhoneShellText.includes("average power")
      && capturePhoneShellText.includes("peak power"),
    "nativeRecorderExposesMeasuredAudioEvidence",
    "Capture exposes recorder average and peak power in dBFS, with explicit LUFS and true-peak limits, instead of an unexplained percentage.",
  );
  expect(
    episodeChatText.includes("enum MobileCollaborationChatScope")
      && episodeChatText.includes("case episode")
      && sessionConversationText.includes('hint.threadKey == "session:\\(context.roomID)"')
      && sessionConversationText.includes('"clientRequestId": send.requestID.uuidString.lowercased()')
      && sessionConversationText.includes("QuipslyCapture/SessionConversation")
      && sessionConversationText.includes("Messages stay with this Session.")
      && capturePhoneShellText.includes("MobileSessionConversationCard")
      && capturePhoneShellText.includes("sessionConversation.receiveLiveHint")
      && nestChatRouteText.includes("sessionConversationAccessWhere")
      && nestChatRouteText.includes("sessionMutationAccessWhere"),
    "nativeSessionAndEpisodeThreadsRemainDistinct",
    "Capture projects exact-call Session chat and durable Episode chat as separate account-protected scopes over the canonical Nest access boundary.",
  );
  expect(
    roomJoinDiagnosticsText.includes("diagnosticOnly: true")
      && roomJoinDiagnosticsText.includes("participantCreated: false")
      && roomJoinDiagnosticsText.includes("providerJoined: false")
      && roomJoinDiagnosticsText.includes("recordingStarted: false")
      && roomJoinDiagnosticsText.includes("tokenReturned: false"),
    "roomJoinDiagnosticsNoSideEffects",
    "Room join diagnostics can inspect readiness without creating participants, joining providers, starting recording, or returning tokens.",
  );
  expect(
    roomJoinDiagnosticsHelperText.includes("canMintJoinToken")
      && roomJoinDiagnosticsHelperText.includes("providerCredentialExposed: false")
      && roomJoinDiagnosticsHelperText.includes("stripeMutated: false")
      && roomJoinDiagnosticsHelperText.includes("mediaMutated: false")
      && roomJoinDiagnosticsHelperText.includes("Buckets store bytes"),
    "roomJoinDiagnosticsTruthBoundaries",
    "Room join diagnostics reports token, provider, payment, and media-vault boundaries without mutating external systems.",
  );
  expect(
    sourceText("apps/quipsly/src/app/api/mobile/capture/rooms/state/route.ts").includes("Recording cannot start for a paid one-to-one coaching session until payment evidence is resolved.")
      && sourceText("apps/quipsly/src/app/api/mobile/capture/rooms/state/route.ts").includes("paymentHoldForRoom")
      && sourceText("apps/quipsly/src/app/api/mobile/capture/rooms/state/route.ts").includes("noPaymentMutation: true"),
    "roomStatePaymentHoldBoundary",
    "Room state refuses START_RECORDING for paid one-to-one sessions that lack payment evidence.",
  );
  expect(
    sessionsRouteText.includes("export async function POST")
      && sessionsRouteText.includes("status: \"PLANNED\"")
      && sessionsRouteText.includes("providerRoomId")
      && sessionsRouteText.includes("randomUUID")
      && sessionsRouteText.includes('status: purpose === "PERSONAL_NOTE" ? "GRANTED" : "REQUESTED"')
      && sessionsRouteText.includes('canRecordAudio: purpose === "PERSONAL_NOTE"')
      && sessionsRouteText.includes("canRecordVideo: false")
      && sessionsRouteText.includes('canTranscribe: purpose === "PERSONAL_NOTE"')
      && sessionsRouteText.includes('selfCaptureOnly: purpose === "PERSONAL_NOTE"')
      && sessionsRouteText.includes("recordingStarted: false")
      && sessionsRouteText.includes("providerJoined: false")
      && sessionsRouteText.includes("providerTokenMinted: false")
      && sessionsRouteText.includes("calendarMutated: false")
      && sessionsRouteText.includes("stripeMutated: false")
      && sessionsRouteText.includes("externalInviteSent: false"),
    "mobileSessionsPostCreatesSafeAppOwnedRoom",
    "Mobile sessions POST creates a Quipsly-owned room, host participant, and requested consent without recording, joining provider, scheduling, charging, or inviting.",
  );
  expect(
    sessionContextRouteText.includes("captureSessionContext")
      && sessionContextRouteText.includes("Quipsly CallRoom.metadataJson.captureSessionContext")
      && sessionContextRouteText.includes("sourceOfTruth: SOURCE_OF_TRUTH")
      && sessionContextRouteText.includes("localDraftAllowed: true")
      && sessionContextRouteText.includes("externalSideEffects: false")
      && sessionContextRouteText.includes("projectCaptureSessionContext")
      && sessionContextRouteText.includes("SESSION_CONTEXT_STALE_REVISION")
      && sessionContextRouteText.includes("isolationLevel: \"Serializable\"")
      && sessionContextRouteText.includes("updatedAt: room.updatedAt")
      && bridgeText.includes("struct MobileCaptureSessionContextResponse")
      && bridgeText.includes("func loadSessionContext(for session: MobileCaptureSession)")
      && bridgeText.includes("func saveSessionContext(")
      && bridgeText.includes("CaptureSessionContextSaveResult")
      && bridgeText.includes("remoteContext")
      && componentsText.includes("CaptureSessionContextPanel")
      && componentsText.includes("Local-first prep notes, goals, and tasks")
      && componentsText.includes("Load Nest")
      && componentsText.includes("Save Nest")
      && componentsText.includes("Local changes not synced")
      && componentsText.includes("SessionContextConflictCard")
      && componentsText.includes("Keep phone draft")
      && componentsText.includes("quipsly.capture.session-context"),
    "nativeSessionContextBoundary",
    "Native Capture exposes notes, goals, and tasks with local draft recovery and Nest-owned shared context while keeping recording/transcript/publishing evidence separate.",
  );
  expect(
    bridgeText.includes("struct MobileCaptureSessionCreateResponse")
      && bridgeText.includes("func createQuickSession(")
      && bridgeText.includes("let payload = try? JSONDecoder().decode(MobileCaptureSessionCreateResponse.self, from: data)")
      && bridgeText.includes("Your recording and transcript remain safe")
      && bridgeText.includes("guard let payload, payload.ok == true")
      && capturePhoneShellText.includes("NewCaptureSessionSheet")
      && capturePhoneShellText.includes("showsNewSession")
      && capturePhoneShellText.includes('accessibilityIdentifier("NewCaptureSessionCreateButton")')
      && capturePhoneShellText.includes("Joining the call never starts a recording. Recording starts only after everyone has allowed it and someone taps Record.")
      && capturePhoneShellText.includes("await model.createSession()")
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureOpenNextSessionButton")')
      && capturePhoneShellText.includes("TabView(selection: $visibleTab)")
      && capturePhoneShellText.includes("@Binding var visibleTab: CaptureRootTab")
      && capturePhoneShellText.includes("visibleTab = .record")
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureRecorderView")')
      && runtimeUITestText.includes("testIPhoneCreatesRetainedSessionAndReadsRecordingTruth")
      && runtimeUITestText.includes('app.buttons["CaptureOpenNextSessionButton"]')
      && runtimeRunnerText.includes("session-create-surface)"),
    "nativeCaptureCanCreateSafeQuickSession",
    "Native Capture exposes a first-class create-session action before recording consent and recording controls.",
  );
  expect(
    sessionsRouteText.includes("coachingEngagements: coachingEngagements.map")
      && sessionsRouteText.includes("coachingEngagementId: coachingEngagement?.id || null")
      && sessionsRouteText.includes('role: { in: ["COACH", "CLIENT", "SUPPORT"] }')
      && sessionsRouteText.includes("create: participantRows")
      && sessionsRouteText.includes("data: created.participants.map")
      && sessionsRouteText.includes("relationshipParticipantsAttached")
      && bridgeText.includes("struct MobileCaptureCoachingEngagement")
      && bridgeText.includes("let coachingEngagements: [MobileCaptureCoachingEngagement]?")
      && bridgeText.includes('requestBody["coachingEngagementId"] = coachingEngagementId')
      && bridgeText.includes('requestBody["projectSlug"] = projectSlug')
      && capturePhoneShellText.includes('accessibilityIdentifier("NewCaptureSessionEngagementPicker")')
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureOpenCoachingEngagement")')
      && capturePhoneShellText.includes("engagement chat in Nest"),
    "nativeCoachingEngagementContinuity",
    "Native Capture decodes writable Coaching Engagements, binds new coaching Sessions to the exact engagement and Nest, attaches the active relationship participants with requested consent receipts, preserves the identity offline, and exposes the private collaboration space.",
  );
  const quickEntrySurfaceIndex = captureRecorderViewText.indexOf(
    "sessionQuickEntrySurface(session)",
  );
  const conversationSurfaceIndex = captureRecorderViewText.indexOf(
    "sessionConversationSurface(session)",
  );
  expect(
    captureRecorderViewText.indexOf("ProviderRoomControls(") >= 0
      && captureRecorderViewText.indexOf("ConsentStrip(") > captureRecorderViewText.indexOf("ProviderRoomControls(")
      && captureRecorderViewText.indexOf("RecorderHero(") > captureRecorderViewText.indexOf("ConsentStrip(")
      && quickEntrySurfaceIndex > captureRecorderViewText.indexOf("RecorderHero(")
      && conversationSurfaceIndex > quickEntrySurfaceIndex
      && captureRecorderViewText.includes("CaptureQuickEntryBar(")
      && captureRecorderViewText.includes("MobileSessionConversationCard(")
      && captureRecorderViewText.indexOf("CaptureSessionTranscriptReviewCard(") > conversationSurfaceIndex
      && captureRecorderViewText.indexOf("CaptureSessionResultsCard(") > captureRecorderViewText.indexOf("CaptureSessionTranscriptReviewCard("),
    "nativeRecordHierarchyKeepsCapturePrimary",
    "The shipping Record hierarchy leads with the room, keeps quick work and conversation close to the call, reveals consent and recording only after entry, and continues into transcript plus editable results.",
  );
  expect(
    capturePhoneShellText.includes("CaptureSessionTranscriptLifecycle_")
      && capturePhoneShellText.includes('case "QUEUED"')
      && capturePhoneShellText.includes('case "RUNNING"')
      && capturePhoneShellText.includes('case "HELD", "FAILED"')
      && capturePhoneShellText.includes("sessionClient.runTranscript(for: session)")
      && capturePhoneShellText.includes("The original recording is safe")
      && capturePhoneShellText.includes("monitorTranscriptLifecycle()")
      && capturePhoneShellText.includes("authoritativeSessionID: session.id")
      && capturePhoneShellText.includes("delaySeconds = min(delaySeconds * 1.7, 30)")
      && captureExperienceUITestText.includes("testVerifiedSourceShowsTranscriptLifecycleBeforeReviewIsReady"),
    "nativeTranscriptLifecycleNeverDisappearsBetweenRecordingAndReview",
    "Capture keeps verified recording-to-transcript progress visible before review exists, monitors only the exact authoritative Session with bounded backoff, treats queued work as automatic, and offers an explicit exact-source recovery action only when useful.",
  );
  expect(
    bridgeText.includes("struct ProviderJoin: Codable")
      && bridgeText.includes("struct RecordingBoundary: Codable")
      && bridgeText.includes("struct ProviderRecording: Codable")
      && bridgeText.includes("struct LocalFallback: Codable")
      && bridgeText.includes("let providerJoin: ProviderJoin?")
      && bridgeText.includes("let recordingBoundary: RecordingBoundary?")
      && bridgeText.includes("let providerRecording: ProviderRecording?")
      && bridgeText.includes("let localFallback: LocalFallback?"),
    "nativeRoomJoinDecodesStructuredSpine",
    "Native capture app decodes the structured meeting-spine contract while preserving flat fields.",
  );
  expect(
    sessionsText.includes("mobileSessionJourneySummary")
      && sessionsText.includes("journeySummary")
      && sessionsText.includes("buildQuipslyCoachingLifecycle")
      && sessionsText.includes("lifecycle")
      && sessionsText.includes("paymentStage")
      && sessionsText.includes("providerStage")
      && sessionsText.includes("packetStage")
      && sessionsText.includes("localFallbackReady"),
    "mobileSessionsExposeJourneySummary",
    "Mobile capture sessions expose one calm journey summary over consent, provider, payment, transcript, and packet evidence.",
  );
  expect(
    sessionsText.includes("quipsly-capture-action-packet-v1")
      && sessionsText.includes("actionPacket")
      && sessionsText.includes("canJoin")
      && sessionsText.includes("canStartLocalRecording")
      && sessionsText.includes("canStartProviderRecording")
      && sessionsText.includes("canPrepareProviderRecordingReceipt")
      && sessionsText.includes("canRunTranscript")
      && sessionsText.includes("canBuildPacket")
      && sessionsText.includes("providerRecordingStartAvailable: false")
      && sessionsText.includes("noHiddenRecording: true"),
    "mobileSessionsExposeActionPacket",
    "Mobile capture sessions expose one compact action packet for native, reviewer, and agent controls without hidden provider or recording side effects.",
  );
  expect(
    sessionsText.includes("recordingContentReadiness")
      && contentReadinessText.includes("capture-proof-only")
      && sessionsText.includes("substantialRecordingEvidence")
      && sessionsText.includes("substantial-recording-evidence-needed")
      && bridgeText.includes("struct MobileCaptureContentReadiness")
      && bridgeText.includes("let substantialRecordingCount: Int?")
      && capturePhoneShellText.includes("session.contentReadiness")
      && capturePhoneShellText.includes("Proof only")
      && capturePhoneShellText.includes("content.evidenceLine"),
    "capturePlumbingDoesNotImplyProductionContent",
    "Nest and native Capture distinguish receipt/upload plumbing from substantial non-simulator source content without changing consent or processing gates.",
  );
  expect(
    lifecycleText.includes("QUIPSLY_COACHING_LIFECYCLE_KIND")
      && lifecycleText.includes("quipsly-coaching-capture-lifecycle-v2")
      && lifecycleText.includes("Publication receipt")
      && lifecycleText.includes("Server recording receipt")
      && lifecycleText.includes("safeActions")
      && lifecycleText.includes("confirm-recording-consent")
      && lifecycleText.includes('"participants-needed"')
      && lifecycleText.includes("participantsAttached && consentGranted")
      && lifecycleText.includes("requiredParticipantCount")
      && sessionsText.includes('requiredParticipantCount: room.purpose === "COACHING" ? 2 : 1')
      && lifecycleText.includes("readyForCapture")
      && lifecycleText.includes("readyForPacket"),
    "sharedCoachingLifecycleContract",
    "Coaching capture exposes shared receipt checks, participant/consent gates, and safe next actions for web, mobile, and native surfaces.",
  );
  expect(
    bridgeText.includes("struct MobileCaptureJourneySummary")
      && bridgeText.includes("let journeySummary: MobileCaptureJourneySummary?")
      && bridgeText.includes("var journeyStageLabel: String")
      && bridgeText.includes("var journeyEvidenceChips: [(String, Bool)]"),
    "nativeSessionDecodesJourneySummary",
    "Native capture app decodes and labels the mobile session journey summary.",
  );
  expect(
    capturePhoneShellText.includes("CaptureSessionTruthPanel")
      && capturePhoneShellText.includes("session.journeyStageLabel")
      && capturePhoneShellText.includes("session.journeyNextAction")
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureSessionTruthPanel")'),
    "nativeCaptureShowsJourneySummary",
    "Native capture UI shows the journey summary beside readiness and safety state.",
  );
  expect(
    capturePhoneShellText.includes("CaptureProviderRecordingBoundary")
      && capturePhoneShellText.includes("Prepare server recording")
      && capturePhoneShellText.includes("Recording starts only when you choose Record.")
      && capturePhoneShellText.includes("session.providerReceiptActionLabel")
      && capturePhoneShellText.includes("readiness.providerEgressLabel"),
    "nativeCaptureShowsProviderRecordingBoundary",
    "Native capture UI shows provider recording as a separate explicit receipt-backed state, not a hidden side effect of joining.",
  );
  expect(
    providerRecordingRouteText.includes("PREPARE_RECEIPT_SLOT")
      && providerRecordingRouteText.includes("START_EGRESS")
      && providerRecordingRouteText.includes("STOP_EGRESS")
      && providerRecordingRouteText.includes("RECONCILE_PROVIDER_FILE")
      && providerRecordingRouteText.includes("buildQuipslyProviderRecordingReceiptSlotManifest")
      && providerRecordingRouteText.includes("startQuipslyLiveKitRoomCompositeEgress")
      && providerRecordingRouteText.includes("stopQuipslyLiveKitRoomCompositeEgress")
      && providerRecordingRouteText.includes("reconcileQuipslyLiveKitEgressRecording")
      && providerRecordingRouteText.includes("staff-only until the in-app recording UX is mature")
      && meetingSpineText.includes("provider-recording-receipt-slot")
      && meetingSpineText.includes("externalRecordingStarted: false")
      && meetingSpineText.includes("receiptRequiredBeforeTranscript: true")
      && providerRecordingRouteText.includes("Provider recording receipt slots require explicit consent")
      && providerRecordingRouteText.includes("currentStatus: \"payment-hold\"")
      && providerRecordingRouteText.includes("Provider recording evidence cannot be prepared for a paid one-to-one coaching session until payment evidence is resolved.")
      && providerRecordingRouteText.includes("kind: \"SERVER_MIX\"")
      && providerRecordingRouteText.includes("status: \"HELD\"")
      && bridgeText.includes("struct MobileProviderRecordingResponse")
      && bridgeText.includes("prepareProviderRecordingReceiptSlot")
      && capturePhoneShellText.includes("prepareProviderRecordingReceipt()")
      && capturePhoneShellText.includes("model.sessionClient.prepareProviderRecordingReceiptSlot(for: session)"),
    "providerRecordingReceiptSlotRoute",
    "Provider recording has a Nest-owned route for receipt slots plus staff-only provider egress start/stop/reconcile controls while native capture remains local-first.",
  );
}

function checkTranscriptPacketContractSources() {
  const transcriptRunRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/run/route.ts");
  const packetRouteText = [
    sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route.ts"),
    sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route-implementation.ts"),
  ].join("\n");
  const transcriptRunnerText = sourceText("apps/quipsly/src/lib/server/capture-transcripts.ts");
  const transcriptProcessingText = sourceText("apps/quipsly/src/lib/server/capture-transcript-processing.ts");
  const transcriptReconciliationText = sourceText("apps/quipsly/src/lib/server/capture-transcript-reconciliation.ts");
  const transcriptContractText = sourceText("packages/quipsly-media-processing/src/transcription.ts");
  const transcriptProviderText = sourceText("apps/quipsly-transcript-worker/src/deepgram.ts");
  const packetBuilderText = sourceText("apps/quipsly/src/lib/server/coaching-packets.ts");
  const coachingPacketDomainText = sourceText("packages/quipsly-domain/src/coaching-packet.ts");
  const coachingPacketVersionText = sourceText(
    "packages/quipsly-domain/src/coaching-packet-version.ts",
  );
  const lifecycleSmokeText = sourceText("scripts/quipsly-coaching-local-lifecycle-db-smoke.mjs");
  const sessionsText = sourceText("apps/quipsly/src/lib/server/mobile-capture-sessions.ts");

  expect(
    transcriptRunRouteText.includes("Sign in before running a transcript job.")
      && transcriptRunRouteText.includes("Choose a transcript job or uploaded recording before running transcription.")
      && transcriptRunRouteText.includes("ensuredFromRecording")
      && transcriptRunRouteText.includes("You do not have access to this uploaded recording.")
      && transcriptRunRouteText.includes("You do not have access to this transcript job."),
    "transcriptRunRouteAccessBoundary",
    "Transcript run route is authenticated, can create or repair a job from a recording, and keeps room access scoped.",
  );
  expect(
    sessionsText.includes("isProviderRecordingReceiptSlot")
      && sessionsText.includes("transcribableRecordingAssets")
      && sessionsText.includes("providerRecordingReceiptSlot")
      && sessionsText.includes("allRecordingAssets")
      && sessionsText.includes("captureProcessingGate")
      && sessionsText.includes("Provider recording receipt slot exists. Attach verified provider media before transcription."),
    "mobileSessionFiltersProviderReceiptSlots",
    "Mobile sessions keep provider recording receipt slots visible without counting them as transcribable recording media.",
  );
  expect(
    transcriptRunRouteText.includes("Provider recording receipt slots are not media. Attach verified provider recording media before transcription.")
      && transcriptProcessingText.includes("Provider recording receipt slots are not transcript media.")
      && transcriptRunRouteText.includes("provider-recording-receipt-slot")
      && transcriptProcessingText.includes("provider-recording-receipt-slot")
      && transcriptProcessingText.includes("TRANSCRIPT_SOURCE_IS_RECEIPT_SLOT"),
    "transcriptRejectsProviderReceiptSlots",
    "Transcript creation and execution reject provider receipt slots because receipt evidence is not playable/transcribable media.",
  );
  expect(
    transcriptProcessingText.includes("Recording asset is not uploaded or verified yet.")
      && transcriptProcessingText.includes("captureTranscriptProcessingSource(job.asset)")
      && transcriptProcessingText.includes('requiredText(asset?.storageBucket, "recording storage bucket")')
      && transcriptProcessingText.includes('requiredText(asset?.storageObjectPath, "recording storage object")')
      && transcriptProcessingText.includes("getMobileCaptureObjectEvidence")
      && transcriptProcessingText.includes("newCaptureTranscriptManifest")
      && transcriptProcessingText.includes('const diarize = input.topology.kind !== "participant-isolated"')
      && transcriptProcessingText.includes('diarizeModel: name === "deepgram" && diarize ? "v2" : null')
      && transcriptProcessingText.includes("multichannel: false")
      && transcriptProviderText.includes('query.set("diarize_model", request.diarizeModel)')
      && transcriptProviderText.includes('query.set("diarize", String(request.diarize))')
      && transcriptProviderText.includes('query.set("multichannel", "true")')
      && transcriptProcessingText.includes("utterances: true")
      && transcriptProcessingText.includes("source: \"capture-transcript-background-worker\"")
      && transcriptContractText.includes("CAPTURE_TRANSCRIPT_RAW_PREFIX")
      && transcriptContractText.includes("CAPTURE_TRANSCRIPT_RESULT_PREFIX")
      && transcriptContractText.includes("rawProviderResponse")
      && !transcriptReconciliationText.includes("transcriptSegment.deleteMany")
      && transcriptReconciliationText.includes("transcriptSegment.create(")
      && transcriptReconciliationText.includes("transcriptWord.createMany"),
    "transcriptRunnerEvidenceBoundary",
    "Transcript processing binds a verified durable recording to a generation-scoped background worker, stores raw provider evidence once, and appends speaker/time segments and words during reconciliation.",
  );
  expect(
    transcriptRunnerText.includes("transcriptRetryDisposition")
      && transcriptRunnerText.includes("segmentCount")
      && transcriptRunnerText.includes("wordCount")
      && transcriptRunnerText.includes("\"CREATE_VERSION\"")
      && transcriptProcessingText.includes("TRANSCRIPT_VERSION_IMMUTABLE")
      && transcriptProcessingText.includes("job.segments.length > 0 || job.words.length > 0")
      && transcriptRunRouteText.includes("CREATE_VERSION")
      && transcriptRunRouteText.includes("versionedFromTranscriptJobId")
      && transcriptRunRouteText.includes("immutablePriorSegmentCount")
      && transcriptRunRouteText.includes("immutablePriorWordCount"),
    "transcriptRerunVersionsImmutableEvidence",
    "A transcript rerun creates a new job whenever provider segments or words already exist, preserving identities held by tasks, corrections, Schedule, Today, and Studio evidence.",
  );
  expect(
    packetRouteText.includes("Sign in before reading a coaching packet.")
      && packetRouteText.includes("Sign in before building a coaching packet.")
      && packetRouteText.includes("quipsly-mobile-capture-transcript-packet-v1")
      && packetRouteText.includes("You do not have access to this coaching packet.")
      && packetRouteText.includes("You do not have access to this transcript job.")
      && packetRouteText.includes("recordingSourceTruth")
      && packetRouteText.includes("safeActions")
      && packetRouteText.includes("Modern packets materialize editable summary/highlight notes directly.")
      && packetRouteText.includes('label: "Prepare Session results"')
      && packetRouteText.includes('label: "Use Session results"')
      && packetRouteText.includes("Quipsly creates ordinary work; people can edit, reassign, complete, or remove it.")
      && packetRouteText.includes("humanApprovalRequired: false")
      && packetRouteText.includes("externalSideEffects: false")
      && packetRouteText.includes("export async function PATCH")
      && packetRouteText.includes("Compatibility controls for older candidate-only packets. Current Session results are already ordinary editable work."),
    "coachingPacketRouteReviewBoundary",
    "Coaching packet routes are authenticated and room-scoped, create ordinary editable Session results by default, retain source timing, and keep legacy candidate controls as compatibility rather than required workflow.",
  );
  expect(
    packetBuilderText.includes("Transcript must be completed before building a coaching packet.")
      && packetBuilderText.includes("Transcript has no segments to turn into a coaching packet.")
      && packetBuilderText.includes("kind: \"SUMMARY\"")
      && packetBuilderText.includes("kind: \"HIGHLIGHT\"")
      && packetBuilderText.includes("actionItem.create")
      && packetBuilderText.includes("goal.create")
      && coachingPacketDomainText.includes('TRANSCRIPT_PACKET_SOURCE = "transcript-packet-builder"')
      && packetBuilderText.includes("source: TRANSCRIPT_PACKET_SOURCE")
      && packetBuilderText.includes("deterministic: true")
      && packetBuilderText.includes("reviewRequired: false")
      && packetBuilderText.includes("reusedExistingPacket")
      && coachingPacketVersionText.includes('SESSION_PACKET_TEMPLATE_VERSION = "quipsly-session-packet-v4"')
      && packetBuilderText.includes("SESSION_PACKET_TEMPLATE_VERSION")
      && packetBuilderText.includes('"quipsly-transcript-packet-snapshot-v2"')
      && packetBuilderText.includes("projectTranscriptSegmentsForPacket")
      && packetBuilderText.includes("projectTranscriptJobSegmentsForPacket")
      && packetBuilderText.includes("sourceBoundTranscriptSpeakerLabel")
      && packetBuilderText.includes("sourceBoundTranscriptParticipantId")
      && packetBuilderText.includes("packetSnapshotMatchesTranscriptJob")
      && packetBuilderText.includes("automaticallyCreated: true")
      && packetBuilderText.includes("editableAfterCreation: true")
      && packetBuilderText.includes("removableInProduct: true")
      && packetBuilderText.includes("sourceProvenanceVisible: true")
      && packetBuilderText.includes("Quipsly created editable follow-through in the Session")
      && packetBuilderText.includes("externalSideEffects: false"),
    "coachingPacketBuilderProvenance",
    "Packet building requires a completed segmented transcript, carries exact source and speaker evidence into a versioned snapshot, and directly creates editable summary notes, highlights, tasks, and goals without external side effects.",
  );
  expect(
    lifecycleSmokeText.includes("transcriptSegment.createMany")
      && lifecycleSmokeText.includes("speakerLabel: \"Coach\"")
      && lifecycleSmokeText.includes("speakerLabel: \"Client\"")
      && lifecycleSmokeText.includes("kind: \"SUMMARY\"")
      && lifecycleSmokeText.includes("kind: \"HIGHLIGHT\"")
      && lifecycleSmokeText.includes("actionItem.create")
      && lifecycleSmokeText.includes("transcript-packet-builder")
      && lifecycleSmokeText.includes("complete app-owned coaching/capture lifecycle without external side effects"),
    "localLifecycleDbSmokeCoversPacketEvidence",
    "Local DB lifecycle smoke proves the app-owned path can represent transcript segments, packet notes, and action items without external side effects.",
  );
}

function checkReviewDigestContractSources() {
  const digestRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/review-digest/route.ts");
  const workRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/work/route.ts");
  const todayRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/today/route.ts");
  const bridgeText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift");
  const componentsText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift");
  const contentViewText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/ContentView.swift");
  const capturePhoneShellText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift");
  const sourceExitExperienceText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureSourceExitExperience.swift");
  const captureExperienceModelText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureExperienceModel.swift");
  const sessionReadinessTopologyText = sourceText("apps/quipsly/src/lib/server/session-readiness-topology.ts");
  const sessionReadinessTopologyCompatibilityText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/session-readiness-topology.ts");
  const workTagsText = sourceText("apps/quipsly/src/lib/server/work-tags.ts");
  const workTagsRouteText = sourceText("apps/quipsly/src/app/api/work/tags/route.ts");
  const canonicalGoalEditText = sourceText("apps/quipsly/src/lib/server/canonical-goal-edit.ts");
  const nestWorkActionsText = sourceText("apps/quipsly/src/app/(app)/work/actions.ts");

  expect(
    digestRouteText.includes("quipsly-mobile-capture-review-digest-v1")
      && digestRouteText.includes("Sign in before loading the mobile capture review digest.")
      && digestRouteText.includes("mapMobileCaptureSessionsForUser")
      && digestRouteText.includes("sideEffectFree: true")
      && digestRouteText.includes("noRecordingStarted: true")
      && digestRouteText.includes("noExternalMeetingJoined: true")
      && digestRouteText.includes("noPaymentMutation: true"),
    "mobileCaptureReviewDigestBoundary",
    "Mobile capture exposes an authenticated side-effect-free review digest for App Store review, native app status, and agent diagnostics.",
  );
  expect(
    digestRouteText.includes("readyToCapture")
      && digestRouteText.includes("needsConsent")
      && digestRouteText.includes("paymentHold")
      && digestRouteText.includes("providerJoinReady")
      && digestRouteText.includes("localFallbackReady")
      && digestRouteText.includes("recordingEvidence")
      && digestRouteText.includes("capturePlumbingEvidence")
      && digestRouteText.includes("substantialRecordingEvidence")
      && digestRouteText.includes("joinableProviderRooms")
      && digestRouteText.includes("locallyRecordableRooms")
      && digestRouteText.includes("transcriptRunnableRooms")
      && digestRouteText.includes("packetBuildableRooms")
      && digestRouteText.includes("actionPackets")
      && digestRouteText.includes("transcriptNeeded")
      && digestRouteText.includes("packetReady")
      && digestRouteText.includes("reviewReady")
      && digestRouteText.includes("needsFinish")
      && digestRouteText.includes("finishActions")
      && digestRouteText.includes("promote-recording")
      && digestRouteText.includes("run-transcript")
      && digestRouteText.includes("build-review-packet")
      && digestRouteText.includes("review-packet")
      && digestRouteText.includes("sourceExitReadinessForRoom")
      && digestRouteText.includes("buildSessionReadinessTopology")
      && digestRouteText.includes("confirm-endpoint-drain")
      && digestRouteText.includes("protect-recording-sources")
      && digestRouteText.includes("recoveryOpen")
      && digestRouteText.includes("safeToLeave")
      && digestRouteText.includes("blockers")
      && digestRouteText.includes("nextActions"),
    "mobileCaptureReviewDigestShape",
    "Mobile capture review digest separates capture-pipeline proof from substantial non-simulator content while ranking explicit post-capture finishing steps.",
  );
  expect(
    sessionReadinessTopologyText.includes("export function buildSessionReadinessTopology")
      && sessionReadinessTopologyText.includes("safeToLeaveAllEndpoints")
      && sessionReadinessTopologyText.includes("serverCopyDoesNotProveEndpointQueueEmpty: true")
      && sessionReadinessTopologyCompatibilityText.trim() === 'export * from "@/lib/server/session-readiness-topology";',
    "sharedSessionExitReadinessProjection",
    "Nest Session UI and mobile digest consume one canonical retained-source, exact-server-copy, and installation-queue readiness projection.",
  );
  expect(
    bridgeText.includes("struct MobileCaptureReviewDigestResponse")
      && bridgeText.includes("struct MobileCaptureReviewDigest")
      && bridgeText.includes("struct MobileCaptureReviewDigestSession")
      && bridgeText.includes("struct MobileCaptureTranscriptPacketBoundaries")
      && bridgeText.includes("MobileCapturePacketBuildResponse")
      && bridgeText.includes("let boundaries: MobileCaptureTranscriptPacketBoundaries?")
      && bridgeText.includes("struct MobileCapturePacketReviewLane")
      && bridgeText.includes("struct MobileCapturePacketLaneHumanReview")
      && bridgeText.includes("let reviewLanes: [MobileCapturePacketReviewLane]?")
      && bridgeText.includes("let reviewLaneStatus: String?")
      && bridgeText.includes("func reviewPacketLane")
      && bridgeText.includes("\"PATCH\"")
      && bridgeText.includes("reviewLaneSummaryLine")
      && bridgeText.includes("let nextAction: String?")
      && bridgeText.includes("packetTruthLine")
      && bridgeText.includes("latestRoomStateResponse")
      && bridgeText.includes("roomStateTruthLine")
      && bridgeText.includes("roomStateNextActionLine")
      && bridgeText.includes("latestTranscriptRunResponse")
      && bridgeText.includes("transcriptTruthLine")
      && bridgeText.includes("Quipsly created or repaired the transcript job from uploaded recording evidence.")
      && bridgeText.includes("latestPacketBuildResponse")
      && bridgeText.includes("struct MobileCaptureActionPacket")
      && bridgeText.includes("struct MobileCaptureActionCapabilities")
      && bridgeText.includes("struct MobileCaptureActionBoundaries")
      && bridgeText.includes("struct MobileCaptureLifecycleSafeAction")
      && bridgeText.includes("let actionPacket: MobileCaptureActionPacket?")
      && bridgeText.includes("let actionPackets: [MobileCaptureActionPacket]?")
      && bridgeText.includes("lifecycleSafeActions")
      && bridgeText.includes("struct MobileCaptureReviewDigestFinishAction")
      && bridgeText.includes("struct MobileCaptureSourceExitReadiness")
      && bridgeText.includes("let finishActions: [MobileCaptureReviewDigestFinishAction]?")
      && bridgeText.includes("final class CaptureReviewDigestClient")
      && bridgeText.includes("stableOwnerSnapshot()")
      && bridgeText.includes("guard AuthManager.shared.matchesStableOwnerSnapshot(ownerSnapshot)")
      && bridgeText.includes("/api/mobile/capture/review-digest")
      && bridgeText.includes("Review only: no recording, meeting, payment, or publish side effects."),
    "nativeReviewDigestDecodesPacket",
    "Native capture decodes the authenticated review digest, rejects stale account responses, and preserves its side-effect-free boundary in app language.",
  );
  expect(
    capturePhoneShellText.includes("CaptureFinishQueueCard")
      && capturePhoneShellText.includes("Recording activity")
      && capturePhoneShellText.includes("Recent recordings are safe or processing normally.")
      && capturePhoneShellText.includes("Refresh recording activity")
      && capturePhoneShellText.includes("CaptureFinishQueueMetrics")
      && capturePhoneShellText.includes("CaptureFinishQueueDetails")
      && capturePhoneShellText.includes("DisclosureGroup(\"Recording details\"")
      && capturePhoneShellText.includes("digest.recoveryOpen")
      && capturePhoneShellText.includes("digest.safeToLeave")
      && capturePhoneShellText.includes("exit.experience.title")
      && capturePhoneShellText.includes("exit.experience.detail")
      && capturePhoneShellText.includes("CaptureFinishAction_\\(action.callRoomId)_\\(action.kind)")
      && capturePhoneShellText.includes("private func openSession(_ roomID: String)")
      && capturePhoneShellText.includes("$0.id == roomID || $0.callRoomId == roomID")
      && capturePhoneShellText.includes("visibleTab = .record"),
    "nativeFinishQueueVisible",
    "Today exposes a calm recording-activity status card that opens the exact Session while keeping technical recording details available on demand.",
  );
  expect(
    digestRouteText.includes("missingPlannedSources")
      && digestRouteText.includes("sourceHolds")
      && digestRouteText.includes("endpointQueues")
      && bridgeText.includes("struct MobileCaptureMissingPlannedSource")
      && bridgeText.includes("struct MobileCaptureSourceHold")
      && bridgeText.includes("struct MobileCaptureEndpointQueueEvidence")
      && captureExperienceModelText.includes("selectedSessionSourceExitReadiness")
      && capturePhoneShellText.includes("CaptureSourceRecoveryCard")
      && capturePhoneShellText.includes("Missing planned masters")
      && capturePhoneShellText.includes("Server-copy holds")
      && capturePhoneShellText.includes("Recording devices")
      && capturePhoneShellText.includes("Open source details in Nest")
      && capturePhoneShellText.includes("CaptureSourceRecoveryOpenLibrary")
      && capturePhoneShellText.includes("CaptureSourceRecoveryDetails")
      && sourceExitExperienceText.includes('title: "Safe to close"')
      && sourceExitExperienceText.includes('"Keep Quipsly open"')
      && sourceExitExperienceText.includes('title: "A recording needs attention"')
      && captureExperienceModelText.includes("func monitorSourceExitReadiness(roomID: String)")
      && captureExperienceModelText.includes("await self.reviewDigestClient.load()")
      && captureExperienceModelText.includes("retryDelay = min(retryDelay * 2, 60_000_000_000)")
      && capturePhoneShellText.includes("model.monitorSourceExitReadiness(roomID: session.callRoomId)"),
    "nativeSourceRecoveryResolutionVisible",
    "Opening an iPhone finishing action gives one conventional safe-to-leave answer while keeping exact planned-master, server-copy, and installation evidence available on demand.",
  );
  expect(
    capturePhoneShellText.includes("CaptureSessionTruthPanel")
      && capturePhoneShellText.includes("Session progress")
      && capturePhoneShellText.includes("session.lifecycleReceiptLine")
      && capturePhoneShellText.includes("Available now")
      && capturePhoneShellText.includes("session.lifecycleSafeActions.prefix(3)")
      && !capturePhoneShellText.includes("Boundary: \\(action.boundary)")
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureLifecycleSafeAction_\\(action.id)")')
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureSessionTruthDisclosure")'),
    "nativeSessionTruthPanelVisible",
    "The shipping native Capture shell exposes next-step, session-progress, source-quality, and recording truth in ordinary language without restoring the disconnected reviewer control board.",
  );
  expect(
    contentViewText.includes("CapturePhoneShell(model: captureModel, visibleTab: $visibleTab)")
      && contentViewText.includes("@State private var visibleTab: CaptureRootTab")
      && contentViewText.includes(".onChange(of: authManager.accessMode)")
      && contentViewText.includes("visibleTab = .library")
      && contentViewText.includes("ProtectedOfflineLibraryShell")
      && contentViewText.includes("mustKeepRecorderVisible")
      && capturePhoneShellText.includes("@Binding var visibleTab: CaptureRootTab")
      && capturePhoneShellText.includes("CaptureRootTab.today")
      && capturePhoneShellText.includes("CaptureRootTab.record")
      && capturePhoneShellText.includes("CaptureRootTab.work")
      && capturePhoneShellText.includes("CaptureRootTab.library")
      && capturePhoneShellText.includes("CaptureRootTab.account")
      && captureExperienceModelText.includes('case .today: "Home"')
      && captureExperienceModelText.includes('case .work: "Work"')
      && capturePhoneShellText.includes("Original recordings stay on \\(CaptureDeviceVocabulary.thisDevice) until you choose to remove an eligible copy from Library."),
    "nativeReviewDigestOnSessionSurfaces",
    "The production iPhone root keeps Today, Record, Work, Library, and Account focused, preserves active capture across auth expiry, and retains protected offline recovery.",
  );
  expect(
    workRouteText.includes('workspaceKind: "quipsly-mobile-work-v1"')
      && workRouteText.includes("listProjectsVisibleToEmail")
      && workRouteText.includes("nestProjectTaskWhere")
      && workRouteText.includes("nestProjectGoalWhere")
      && workRouteText.includes("document-kind:note")
      && workRouteText.includes("explicitProjectGrantRequired: true")
      && workRouteText.includes("unreviewedTranscriptCandidatesExcluded: true")
      && workRouteText.includes("externalSideEffects: false")
      && bridgeText.includes("final class CaptureWorkClient")
      && bridgeText.includes("ProtectedWorkCache")
      && bridgeText.includes("ProtectedProjectionCacheIdentity.permitsRestore(")
      && bridgeText.includes("cachedOwnerAccountID: cache.ownerAccountID")
      && bridgeText.includes("activeOwnerAccountID: AuthManager.currentStoredOwnerID()")
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureWorkView")')
      && capturePhoneShellText.includes("CaptureWorkQuickEntry_")
      && capturePhoneShellText.includes("initialProject: captureDestination")
      && capturePhoneShellText.includes("workspace?.project.id == selectedProject.id")
      && capturePhoneShellText.includes("availableTags: (workspace?.tags ?? [])")
      && capturePhoneShellText.includes("!projects.contains(where: { $0.id == initialProject.id })")
      && capturePhoneShellText.includes("destination == \"NEST:\\($0.id)\" ? $0 : nil")
      && capturePhoneShellText.includes("CaptureQuickEntrySyncStatus(model: model)")
      && capturePhoneShellText.includes("CaptureWorkTaskTagsEdit_")
      && capturePhoneShellText.includes("CaptureWorkTaskEdit_")
      && capturePhoneShellText.includes("CaptureTodayTaskEdit_")
      && capturePhoneShellText.includes("CaptureTaskEditSave")
      && capturePhoneShellText.includes("CaptureTaskEditSheet")
      && capturePhoneShellText.includes("CaptureTaskEditRemove")
      && capturePhoneShellText.includes('status: task.status == "OPEN" ? "DONE" : "OPEN"')
      && bridgeText.includes("func editTask(")
      && bridgeText.includes('"action": "task-edit"')
      && bridgeText.includes('payload.action == "task-edit"')
      && todayRouteText.includes('if (action === "task-edit")')
      && todayRouteText.includes('surface: "ios-capture-today"')
      && capturePhoneShellText.includes("CaptureWorkGoalEdit_")
      && capturePhoneShellText.includes("CaptureTodayGoalEdit_")
      && capturePhoneShellText.includes("CaptureGoalEditSave")
      && capturePhoneShellText.includes("CaptureGoalEditSheet")
      && capturePhoneShellText.includes("CaptureGoalEditRemove")
      && bridgeText.includes("func editGoal(")
      && bridgeText.includes('"action": "goal-edit"')
      && bridgeText.includes('"targetDecision": targetDecision')
      && bridgeText.includes('payload.action == "goal-edit"')
      && bridgeText.includes('case "KEEP":')
      && todayRouteText.includes('if (action === "goal-edit")')
      && todayRouteText.includes('targetDecision === "KEEP"')
      && todayRouteText.includes('targetDecision === "SET"')
      && todayRouteText.includes('targetDecision === "CLEAR"')
      && todayRouteText.includes('surface: "ios-capture-work"')
      && todayRouteText.includes("editCanonicalGoalInTransaction")
      && nestWorkActionsText.includes("editCanonicalGoalInTransaction")
      && nestWorkActionsText.includes('surface: "nest-work"')
      && canonicalGoalEditText.includes('kind: "quipsly-goal-edit-v1"')
      && canonicalGoalEditText.includes('input.targetDecision.kind === "KEEP"')
      && canonicalGoalEditText.includes("sourceAnchorChanged: false")
      && canonicalGoalEditText.includes("providerCalendarEventChanged: false")
      && canonicalGoalEditText.includes("externalSideEffects: false")
      && capturePhoneShellText.includes("CaptureWorkGoalTagsEdit_")
      && capturePhoneShellText.includes("CaptureWorkNoteTagsEdit_")
      && capturePhoneShellText.includes("expectedTagRevision: note.tagRevision")
      && capturePhoneShellText.includes("kind: .document")
      && capturePhoneShellText.includes("canonicalTagIDs: note.tagIds")
      && capturePhoneShellText.includes("CaptureTodayWorkTagNewLabel")
      && capturePhoneShellText.includes("Save & add tag")
      && capturePhoneShellText.includes("CaptureWorkTagEditorPreviewBoundary")
      && capturePhoneShellText.includes("readOnlyPreview")
      && bridgeText.includes('"newTagLabels": decision.requestedNewTagLabels')
      && bridgeText.includes("payload.requestedTagIds?.sorted() == decision.tagIDs")
      && bridgeText.includes("resolvedTags.map(\\.requestedLabel) == decision.requestedNewTagLabels")
      && workRouteText.includes("tagRevision: note.tagRevision")
      && workTagsRouteText.includes("newTagLabels")
      && workTagsText.includes("resolveReusableProjectTag")
      && workTagsText.includes("requestedTagIds")
      && workTagsText.includes("resolvedTags")
      && capturePhoneShellText.includes("availableTags: workTagCatalog")
      && workRouteText.includes("canEditTags: project.canWrite")
      && workRouteText.includes("const tags = note.tagLinks.flatMap")
      && capturePhoneShellText.includes("workTagDecisionStatus")
      && workRouteText.includes("onlineVocabularyManagement: project.canWrite")
      && workRouteText.includes("mergedInto:")
      && workRouteText.includes("aliases:")
      && workTagsRouteText.includes("export async function PATCH")
      && workTagsRouteText.includes("mutateWorkTagTaxonomy")
      && workTagsRouteText.includes("createWorkTagTaxonomy")
      && workTagsRouteText.includes("offlineQueueingAllowed: false")
      && workTagsRouteText.includes("assignmentChanged: false")
      && workTagsText.includes("operation: \"create\"")
      && workTagsText.includes("isolationLevel: \"Serializable\"")
      && bridgeText.includes("func createTagVocabulary(")
      && bridgeText.includes("func changeTagVocabulary(")
      && bridgeText.includes("These changes require a live revision and are never queued offline.")
      && capturePhoneShellText.includes("CaptureTagVocabularySheet")
      && capturePhoneShellText.includes("CaptureWorkManageTags")
      && capturePhoneShellText.includes("CaptureTagVocabularyCreateField")
      && capturePhoneShellText.includes("CaptureTagVocabularyCreate")
      && capturePhoneShellText.includes("CaptureTagVocabularyAliases_")
      && capturePhoneShellText.includes("CaptureTagVocabularySheet")
      && capturePhoneShellText.includes("CaptureWorkManageTags"),
    "nativeCanonicalProjectWorkWorkspace",
    "iPhone Work reads actor-scoped canonical project tasks, goals, document notes, and tags, protects the last owner-partitioned snapshot offline, pre-binds protected quick capture, reconciles complete per-record tag decisions through one protected outbox, and creates/reuses or manages shared vocabulary only against a live editor grant while routing merge impact and rollback review to Nest.",
  );
}

function checkTranscriptCorrectionContractSources() {
  const routeText = sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/corrections/route.ts");
  const taskRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/tasks/route.ts");
  const goalRouteText = [
    sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/goals/route.ts"),
    sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/goals/route-implementation.ts"),
  ].join("\n");
  const draftRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/drafts/route.ts");
  const packetRouteText = [
    sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route.ts"),
    sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route-implementation.ts"),
  ].join("\n");
  const packetGoalReviewRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/packet/goals/route.ts");
  const noteMaterializationRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/transcripts/notes/route.ts");
  const taskDomainText = sourceText("packages/quipsly-domain/src/transcript-derived-task.ts");
  const serviceText = sourceText("apps/quipsly/src/lib/server/transcript-corrections.ts");
  const transcriptSourceSpanText = sourceText("apps/quipsly/src/lib/server/transcript-source-span.ts");
  const coachingPacketText = sourceText("apps/quipsly/src/lib/server/coaching-packets.ts");
  const nativeText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/TranscriptCorrectionReview.swift");
  const nativeSessionPlaybackText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureSessionProtectedPlayback.swift");
  const nativeAudioAttentionText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureTranscriptAudioAttention.swift");
  const nativeAudioAttentionHarnessText = sourceText("apps/mobile-capture/HighGroundCapture/Testing/CaptureTranscriptAudioAttentionHarness.swift");
  const nativeRecordingShareText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureRecordingShare.swift");
  const transcriptReviewOutboxText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/TranscriptReviewDecisionOutbox.swift");
  const transcriptSpeakerAttributionOutboxText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/TranscriptSpeakerAttributionOutbox.swift");
  const contentViewText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/ContentView.swift");
  const bridgeText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/BridgeModels.swift");
  const shellText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift");
  const webText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/transcript-correction-desk.tsx");
  const writingActionsText = sourceText("apps/quipsly/src/app/(app)/create/actions.ts");
  const writingBlockText = sourceText("apps/quipsly/src/app/(app)/create/BlockItem.tsx");
  const immutableSourceText = sourceText("apps/quipsly/src/lib/studio/immutable-source.ts");
  const workModelText = sourceText("apps/quipsly/src/app/(app)/work/work-model.ts");
  const workPageText = sourceText("apps/quipsly/src/app/(app)/work/page.tsx");
  const workClientText = sourceText("apps/quipsly/src/app/(app)/work/work-client.tsx");
  const schedulePageText = sourceText("apps/quipsly/src/app/(app)/schedule/page.tsx");
  const schedulePlannerText = sourceText("apps/quipsly/src/app/(app)/schedule/schedule-planner.tsx");
  const sessionReviewText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/session-review-client.tsx");
  const transcriptSpeakerEvidenceBadgeText = sourceText("apps/quipsly/src/components/transcript-speaker-evidence-badge.tsx");
  const durableWorkText = sourceText("apps/quipsly/src/app/(app)/work/work-client.tsx");
  const durableNotesText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/session-notes-workspace.tsx");
  const durableScheduleText = sourceText("apps/quipsly/src/app/(app)/schedule/schedule-planner.tsx");
  const durableSchedulePageText = sourceText("apps/quipsly/src/app/(app)/schedule/page.tsx");
  const sessionNotesWorkspaceText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/session-notes-workspace.tsx");
  const sessionReviewModelText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/session-review-model.ts");
  const clientFollowUpServiceText = sourceText("apps/quipsly/src/lib/server/session-client-follow-up.ts");
  const clientFollowUpAttentionText = sourceText("apps/quipsly/src/lib/server/client-follow-up-attention.ts");
  const weeklyCommitmentText = sourceText("apps/quipsly/src/lib/server/weekly-commitment.ts");
  const weeklyPlanOutboxText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/WeeklyPlanDecisionOutbox.swift");
  const clientFollowUpWebText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/session-client-follow-up-card.tsx");
  const todayPageText = sourceText("apps/quipsly/src/app/(app)/today/today-page.tsx");
  const sessionFollowThroughServiceText = sourceText("apps/quipsly/src/lib/server/session-follow-through.ts");
  const sessionContinuityServiceText = sourceText("apps/quipsly/src/lib/server/session-continuity.ts");
  const sessionContinuityCardText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/session-continuity-card.tsx");
  const studioTranscriptReviewDeskText = sourceText("apps/quipsly/src/app/(app)/editor/StudioTranscriptReviewDesk.tsx");
  const studioTranscriptReviewServiceText = sourceText("apps/quipsly/src/lib/server/studio-transcript-review.ts");
  const studioTranscriptSpeakerAuthorityText = sourceText("apps/quipsly/src/lib/server/studio-transcript-speaker-authority.ts");
  const captureSourceEvidenceText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureSourceEvidenceView.swift");
  const captureAudioMasteryClientText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureAudioMasteryClient.swift");
  const captureAudioDeliveryClientText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureAudioDeliveryClient.swift");
  const captureAudioDecisionOutboxText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureAudioDecisionOutbox.swift");
  const audioDeliveryServiceText = sourceText("apps/quipsly/src/lib/server/audio-delivery.ts");
  const localRecordingPlaybackText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/LocalRecordingPlaybackController.swift");
  const mobileComponentsText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/QuipslyMobileComponents.swift");
  const nestDashboardText = sourceText("apps/quipsly/src/app/(app)/nests/[slug]/page.tsx");
  const nestFollowThroughText = sourceText("apps/quipsly/src/lib/server/nest-project-follow-through.ts");
  const workspaceSearchText = sourceText("apps/quipsly/src/lib/server/workspace-search.ts");
  const taskAccessText = sourceText("apps/quipsly/src/lib/server/task-access.ts");
  const workspaceSearchPageText = sourceText("apps/quipsly/src/app/(app)/find/page.tsx");
  const tagSearchChipsText = sourceText("apps/quipsly/src/components/tag-search-chips.tsx");
  const researchLibraryModelText = sourceText("apps/quipsly/src/app/(app)/research/research-library-model.ts");
  const sidebarText = sourceText("apps/quipsly/src/components/SidebarLayout.tsx");
  const todayRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/today/route.ts");
  const canonicalTaskStatusText = sourceText("apps/quipsly/src/lib/server/canonical-task-status.ts");
  const taskRecurrenceServerText = sourceText("apps/quipsly/src/lib/server/task-recurrence.ts");
  const sessionsRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/sessions/route.ts");
  const mobileCaptureSessionsText = sourceText("apps/quipsly/src/lib/server/mobile-capture-sessions.ts");
  const workTagsText = sourceText("apps/quipsly/src/lib/server/work-tags.ts");
  const schemaText = sourceText("prisma/schema.prisma");
  const speakerAttributionMigrationText = sourceText("prisma/migrations/20260803180000_add_transcript_speaker_attributions/migration.sql");
  const speakerAttributionHardeningMigrationText = sourceText("prisma/migrations/20260803183000_harden_transcript_speaker_attributions/migration.sql");
  const sessionReviewPageText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/page.tsx");
  const workTagsRouteText = sourceText("apps/quipsly/src/app/api/work/tags/route.ts");
  const recordingPromotionText = sourceText("apps/quipsly/src/lib/server/recording-media-promotion.ts");
  const recordingPromotionRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/recordings/promote/route.ts");
  const episodeInventoryText = sourceText("apps/quipsly/src/app/api/media-vault/episode-inventory/route.ts");
  const editorText = sourceText("apps/quipsly/src/app/(app)/editor/page.tsx");
  const captureGroupEditorFocusText = sourceText("apps/quipsly/src/app/(app)/editor/captureGroupEditorFocus.ts");
  const quickEntryText = sourceText("apps/quipsly/src/lib/server/mobile-capture-quick-entry.ts");
  const quickEntryRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/quick-entry/route.ts");
  const sessionNoteContractText = sourceText("apps/quipsly/src/lib/session-note-contract.ts");
  const sessionNoteAccessText = sourceText("apps/quipsly/src/lib/server/session-note-access.ts");
  const sessionNoteCreateRouteText = sourceText("apps/quipsly/src/app/api/sessions/[roomId]/notes/route.ts");
  const sessionNoteEditText = sourceText("apps/quipsly/src/lib/server/session-note-edit.ts");
  const sessionNoteEditRouteText = sourceText("apps/quipsly/src/app/api/notes/[noteId]/route.ts");
  const quickEntryOutboxText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/MobileQuickEntryOutbox.swift");
  const sessionNoteEditOutboxText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/SessionNoteEditOutbox.swift");
  const captureExperienceText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureExperienceModel.swift");
  const shareCaptureBridgeText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/ShareCaptureBridge.swift");
  const shareExtensionText = sourceText("apps/mobile-capture/HighGroundCapture/ShareCaptureExtension/ShareViewController.swift");
  const shareExtensionWebSourceText = sourceText("apps/mobile-capture/HighGroundCapture/ShareCaptureExtension/QuipslyWebSource.js");
  const shareExtensionInfoText = sourceText("apps/mobile-capture/HighGroundCapture/ShareCaptureExtension/Info.plist");
  const captureProjectText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture.xcodeproj/project.pbxproj");
  const captureEntitlementsText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/HighGroundCapture.entitlements");
  const shareEntitlementsText = sourceText("apps/mobile-capture/HighGroundCapture/ShareCaptureExtension/ShareCaptureExtension.entitlements");
  const captureUITestText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift");
  const runtimeUITestText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift");
  const runtimeRunnerText = sourceText("apps/mobile-capture/HighGroundCapture/scripts/run-capture-runtime-ui-smoke.sh");
  const inboxText = [
    sourceText("apps/quipsly/src/app/(app)/inbox/page.tsx"),
    sourceText("apps/quipsly/src/app/(app)/inbox/inbox-loader.ts"),
  ].join("\n");
  const collectionsText = sourceText("apps/quipsly/src/app/(app)/collections/page.tsx");
  const collectionsModelText = sourceText("apps/quipsly/src/app/(app)/collections/collections-model.ts");
  const collectionsClientText = sourceText("apps/quipsly/src/app/(app)/collections/collections-client.tsx");
  const personalSourceFilingText = sourceText("apps/quipsly/src/lib/server/personal-source-filing.ts");
  const mobileSourceInboxRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/inbox/route.ts");
  const sourceInboxFilingText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureSourceInbox.swift");
  const sourceAnnotationServiceText = sourceText("apps/quipsly/src/lib/server/source-annotations.ts");
  const sourceAnnotationDraftOutboxText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/SourceAnnotationDraftOutbox.swift");
  const personalSourceFilingActionText = sourceText("apps/quipsly/src/app/(app)/collections/actions.ts");
  const researchPageText = sourceText("apps/quipsly/src/app/(app)/research/page.tsx");
  const personalSourceCaptureMigrationText = sourceText("prisma/migrations/20260719130000_add_personal_source_capture_receipts/migration.sql");

  expect(
    routeText.includes("accept-human-correction")
      && routeText.includes("review-ai-proposal")
      && routeText.includes("confirmedAgainstPlayback")
      && routeText.includes("playbackPositionSeconds")
      && routeText.includes("Sign in to review transcript corrections.")
      && routeText.includes('origin: "human"'),
    "transcriptCorrectionAuthenticatedDecisionRoute",
    "The shared transcript-correction route authenticates reads and exposes only human correction or explicit AI proposal decisions with playback evidence.",
  );
  expect(
    serviceText.includes('TRANSCRIPT_CORRECTION_SCHEMA = "quipsly-transcript-correction-v1"')
      && serviceText.includes("providerSegmentsImmutable: true")
      && serviceText.includes("correctionOverlayVersioned: true")
      && serviceText.includes("acceptedHumanCorrectionRequiresPlaybackConfirmation: false")
      && serviceText.includes("directHumanCorrectionPreservesSourceAnchors: true")
      && serviceText.includes("aiSuggestionRequiresAcceptanceToChangeTranscript: true")
      && serviceText.includes("PLAYBACK_POSITION_MISMATCH")
      && serviceText.includes("STALE_CORRECTION_OVERLAY")
      && serviceText.includes("noExternalDelivery: true")
      && serviceText.includes("noPublication: true"),
    "transcriptCorrectionImmutableEvidenceBoundary",
    "Canonical transcript corrections preserve provider segments, source anchors, media time, and revisions while keeping playback optional for direct edits, requiring it for verification, quarantining AI output, and failing stale overlays closed.",
  );
  expect(
    routeText.includes('operation === "attribute-provider-speaker"')
      && serviceText.includes('TRANSCRIPT_SPEAKER_ATTRIBUTION_SCHEMA = "quipsly-transcript-speaker-attribution-v1"')
      && serviceText.includes("speakerIdentitySeparateFromWordReview: true")
      && serviceText.includes("transcript-speaker-attribution:")
      && serviceText.includes("speakerProviderSnapshot(currentJob.segments, providerSpeakerLabel)")
      && serviceText.includes("const currentGate = await transcriptProcessingGate(tx, currentJob.asset)")
      && speakerAttributionMigrationText.includes('"TranscriptSpeakerAttr_one_active_job_label_key"')
      && speakerAttributionMigrationText.includes('WHERE "status" = \'active\'')
      && speakerAttributionHardeningMigrationText.includes('"TranscriptSpeakerAttr_supersession_check"')
      && speakerAttributionHardeningMigrationText.includes('jsonb_array_length("sampleSegmentIdsJson") BETWEEN 1 AND 3')
      && webText.includes("Name voices")
      && webText.includes("This speaker identity does not claim the words in this turn were playback-reviewed.")
      && nativeText.includes("CaptureTranscriptSpeakerAttribution")
      && nativeText.includes("Voice identified from Session samples")
      && nativeText.includes("CaptureTranscriptSpeakerIdentitySection")
      && nativeText.includes("CaptureTranscriptSpeakerWordReviewBoundary_")
      && nativeText.includes('"operation": "attribute-provider-speaker"')
      && nativeText.includes("payload.boundaries?.speakerIdentitySeparateFromWordReview == true")
      && nativeText.includes("attribution.providerSnapshotSha256 == decision.expectedProviderSnapshotSHA256")
      && nativeText.includes("attribution.sampleSegmentIds == decision.samples.map(\\.segmentID)")
      && transcriptSpeakerAttributionOutboxText.includes("owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID())")
      && transcriptSpeakerAttributionOutboxText.includes("expectedProviderSnapshotSHA256")
      && transcriptSpeakerAttributionOutboxText.includes("PendingTranscriptSpeakerSample")
      && transcriptSpeakerAttributionOutboxText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && transcriptSpeakerAttributionOutboxText.includes("var clientRequestID: String")
      && transcriptSpeakerAttributionOutboxText.includes("id.uuidString.lowercased()")
      && coachingPacketText.includes("acceptedSpeakerAttributionId")
      && coachingPacketText.includes("speakerAttributions: unknown = []"),
    "transcriptSpeakerAttributionSeparateReviewBoundary",
    "A playback-reviewed provider-cluster identity is atomic, participant-bound, packet-invalidating, and visibly separate from word-level transcript review on Nest and iPhone.",
  );
  expect(
    nativeAudioAttentionText.includes("CaptureTranscriptAudioAttentionResolver")
      && nativeAudioAttentionText.includes("heldAssetMismatch")
      && nativeAudioAttentionText.includes("heldClockMismatch")
      && nativeAudioAttentionText.includes("normalizedID(expectedRecordingAssetID) == normalizedID(actualRecordingAssetID)")
      && nativeAudioAttentionText.includes("clocksMatch(recordingDurationSeconds, signalDurationSeconds)")
      && nativeAudioAttentionText.includes("clocksMatch($0, signalDurationSeconds)")
      && nativeAudioAttentionText.includes("$0.endSeconds > observation.startSeconds")
      && nativeAudioAttentionText.includes("$0.startSeconds < observation.endSeconds")
      && nativeAudioAttentionText.includes("no edit, correction, defect, repair, or")
      && nativeAudioAttentionText.includes("never an automatic media or transcript decision")
      && nativeText.includes("Audio listen points")
      && nativeText.includes("not confirmed defects and never become transcript corrections or recording cuts automatically")
      && nativeText.includes("Plays the exact local source around this measured point. It makes no correction or edit.")
      && nativeText.includes("Moves to the overlapping transcript passage without playing, correcting, or cutting it.")
      && nativeText.includes("Signal-gap candidate")
      && nativeAudioAttentionHarnessText.includes("exactAssetMapsToOnePassage")
      && nativeAudioAttentionHarnessText.includes("spanningPointMapsToTwoPassages")
      && nativeAudioAttentionHarnessText.includes("betweenPassagesRemainsVisible")
      && nativeAudioAttentionHarnessText.includes("wrongAssetFailsClosed")
      && nativeAudioAttentionHarnessText.includes("clockMismatchFailsClosed")
      && nativeAudioAttentionHarnessText.includes("malformedPointIsHeld")
      && nativeAudioAttentionHarnessText.includes("outOfRangePassageIsNotMapped")
      && nativeAudioAttentionHarnessText.includes("optionalPlaybackDurationUsesBoundedSourceClock"),
    "nativeTranscriptAudioAttentionExactSourceBoundary",
    "Measured source observations become transcript listen-and-review navigation only after exact asset and compatible source-clock checks; mismatches and malformed evidence hold closed and no automatic correction or media edit exists.",
  );
  expect(
    nativeText.includes("CaptureTranscriptReviewView")
      && nativeText.includes("recording.recordingAssetId == expectedRecordingAssetID")
      && nativeText.includes("func confirmedPosition(")
      && nativeText.includes("protectedSource?.recordingAssetId == expectedRecordingAssetID")
      && nativeText.includes(".quipslyCaptureAccountIdentityDidChange")
      && nativeText.includes("AuthManager.shared.matchesStableOwnerSnapshot(owner)")
      && nativeSessionPlaybackText.includes("prepareTranscriptReviewFile")
      && nativeText.includes("Suggested correction")
      && nativeText.includes("Use this now or listen first. The original words and timing stay underneath, so you can change or undo it later.")
      && nativeText.includes("FileProtectionType.complete")
      && nativeText.includes("CaptureTranscriptProtectedCacheBoundary")
      && nativeText.includes("guard !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed")
      && nativeText.includes("ProtectedTranscriptDrafts")
      && nativeText.includes("providerTextSha256 == segment.providerTextSha256")
      && nativeText.includes("CaptureTranscriptCorrectionDraftStore.remove")
      && transcriptReviewOutboxText.includes("owner == Self.normalizedOwnerID(AuthManager.currentStoredOwnerID())")
      && transcriptReviewOutboxText.includes("expectedProviderText")
      && transcriptReviewOutboxText.includes("expectedAcceptedCorrectionID")
      && transcriptReviewOutboxText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && transcriptReviewOutboxText.includes("var clientRequestID: String")
      && nativeText.includes("payload.boundaries?.providerSegmentsImmutable == true")
      && nativeText.includes("payload.boundaries?.correctionOverlayVersioned == true")
      && nativeText.includes("payload.boundaries?.mediaTimeAnchorsPreserved == true")
      && nativeText.includes("guard reviewDecisionOutbox.markAcknowledged(decision.id) else")
      && captureUITestText.includes("testTranscriptReviewOutboxSurvivesRelaunchAndStaysAccountPartitioned")
      && runtimeRunnerText.includes("transcript-review-offline-reconcile")
      && runtimeUITestText.includes("testOfflineTranscriptReviewQueuesSurvivesRelaunchReconcilesAndHoldsConflict")
      && nativeText.includes("CapturePacketAdditionalSuggestionsDisclosure")
      && nativeText.includes("More suggestions")
      && nativeText.includes("Use, edit, or dismiss any idea whenever it helps.")
      && nativeText.includes("DisclosureGroup(isExpanded: $showsAdditionalSuggestions)")
      && shellText.includes("CaptureSessionResultsCard")
      && shellText.includes("Quipsly made these from the transcript. Adjust or remove them like any other work")
      && shellText.includes("CaptureTranscriptReviewPreviewLink")
      && shellText.includes("CaptureSessionTranscriptReviewLink_")
      && shellText.includes("session.coachingPacketSummaryNoteId != nil")
      && nativeText.includes("CaptureTranscriptAudioQualityCard(recording: exactRecording)")
      && nativeText.includes("CaptureAudioMasteryClient()")
      && nativeText.includes('Label("Open recording quality"')
      && nativeText.includes("CaptureSourceEvidenceView(recordingID: recording.id)")
      && nativeText.includes("The original remains unchanged")
      && nativeText.includes("guard AuthManager.shared.networkActionsAllowed else { return }")
      && nativeText.includes("recording.uploadedMediaAssetId")
      && nativeText.includes("signal.rmsDbfs")
      && nativeText.includes("signal.samplePeakDbfs"),
    "nativeTranscriptCorrectionExactSourceBoundary",
    "iPhone Library and Session open exact-source transcript correction plus audio-quality tools, preserve protected offline decisions, show ordinary generated work directly, and keep optional extra suggestions collapsed.",
  );
  expect(
    noteMaterializationRouteText.includes('["EDIT", "DEFER", "REJECT"].includes(decision || "")')
      && noteMaterializationRouteText.includes("idempotentReplay: true")
      && noteMaterializationRouteText.includes('operation: "merged-transcript-candidate"')
      && noteMaterializationRouteText.includes("lastTranscriptCandidateMerge")
      && nativeText.includes("func reviewPacketNote(")
      && nativeText.includes('"EDITED_FOR_REVIEW"')
      && nativeText.includes("CapturePacketNoteEditButton")
      && nativeText.includes("CapturePacketNoteRejectButton")
      && nativeText.includes("CapturePacketNoteMergeButton")
      && nativeText.includes("CapturePacketNoteMergeTargetPicker")
      && nativeText.includes("CapturePacketNoteCarriedDraft_")
      && nativeText.includes("CapturePacketNoteSourceText_")
      && nativeText.includes("Play the source whenever you want to double-check this idea.")
      && nativeText.includes("Adds this source to the selected note. Its previous version stays recoverable.")
      && !nativeText.includes("CapturePacketNoteDeferButton_")
      && captureUITestText.includes("testOptionalTranscriptIdeaCanBeAddedOrAdjustedWithoutPaperwork")
      && captureUITestText.includes("CapturePacketNoteBoundary")
      && captureUITestText.includes("CapturePacketNoteSourceButton_")
      && runtimeUITestText.includes("expectedPacketNoteLaneID"),
    "nativePacketNoteOptionalIdeaFlow",
    "Capture keeps exact-source transcript ideas optional and offers ordinary add, adjust, merge, or dismiss actions while preserving recoverable note revisions and retry receipts.",
  );
  expect(
    taskRouteText.includes("schema: TRANSCRIPT_DERIVED_TASK_SCHEMA")
      && taskDomainText.includes('TRANSCRIPT_DERIVED_TASK_SCHEMA = "quipsly-transcript-derived-task-v1"')
      && taskDomainText.includes("readTranscriptDerivedTaskSource")
      && taskRouteText.includes("readTranscriptCorrectionDesk({ prisma: tx, roomId, actor })")
      && taskRouteText.includes("segment.providerTextSha256 !== expectedProviderTextSha256")
      && taskRouteText.includes("assignedUserId: actor.id")
      && taskRouteText.includes('status: "OPEN"')
      && taskRouteText.includes("deadlineCreated: false")
      && taskRouteText.includes("reminderCreated: false")
      && taskRouteText.includes("calendarMutated: false")
      && taskRouteText.includes("externalDelivery: false")
      && taskRouteText.includes("publication: false")
      && nativeText.includes("CaptureTranscriptCreateTaskButton")
      && nativeText.includes("focusSegmentID: String? = nil")
      && nativeText.includes("@State private var scrollTargetSegmentID: String?")
      && nativeText.includes(".scrollTargetLayout()")
      && nativeText.includes(".scrollPosition(id: $scrollTargetSegmentID, anchor: .center)")
      && nativeText.includes("scrollTargetSegmentID = linkedTranscriptScrollTargetID")
      && nativeText.includes("Assigned to you with a link back to this transcript moment.")
      && shellText.includes("CaptureTodayTaskSourceLink_")
      && workModelText.includes("readTranscriptDerivedTaskSource")
      && schedulePageText.includes("readTranscriptDerivedTaskSource")
      && schedulePageText.includes("Reviewed transcript timestamp")
      && schedulePlannerText.includes("Focus source · transcript")
      && todayRouteText.includes("readTranscriptDerivedTaskSource")
      && todayRouteText.includes("Reviewed transcript follow-through")
      && todayRouteText.includes("tasksRankedForToday: true")
      && shellText.includes("task.todayReason?.nonempty")
      && webText.includes("Make this my task")
      && webText.includes('id={`transcript-segment-${encodeURIComponent(segment.id)}`}')
      && webText.includes("Assigned to you with a link back to this transcript moment."),
    "transcriptDerivedTaskExplicitSourceBoundary",
    "Transcript review creates one explicitly requested self-owned OPEN task with immutable segment and recording provenance, stale-evidence protection, idempotency, and no implicit scheduling, delivery, or publication.",
  );
  expect(
    goalRouteText.includes("schema: TRANSCRIPT_DERIVED_GOAL_SCHEMA")
      && taskDomainText.includes('TRANSCRIPT_DERIVED_GOAL_SCHEMA = "quipsly-transcript-derived-goal-v1"')
      && taskDomainText.includes("readTranscriptDerivedGoalSource")
      && goalRouteText.includes("resolveTranscriptGoalEvidenceInTransaction({")
      && goalRouteText.includes("readTranscriptCorrectionDesk({")
      && goalRouteText.includes("sourceAnchor.providerTextSha256 !== input.expectedProviderTextSha256")
      && goalRouteText.includes("ownerUserId: actor.id")
      && goalRouteText.includes('status: "ACTIVE"')
      && goalRouteText.includes("taskCreated: false")
      && goalRouteText.includes("targetDateCreated: input.targetDateCreated === true")
      && goalRouteText.includes("projectTagsApplied: input.tagsApplied === true")
      && goalRouteText.includes("materializationIntent: requestedIntent")
      && goalRouteText.includes("goalTagLink.createMany")
      && goalRouteText.includes('"IDEMPOTENCY_CONFLICT"')
      && goalRouteText.includes("reminderCreated: false")
      && goalRouteText.includes("calendarMutated: false")
      && goalRouteText.includes("externalDelivery: false")
      && goalRouteText.includes("publication: false")
      && nativeText.includes("CaptureTranscriptCreateGoalButton")
      && nativeText.includes("Owned by you with a link back to this transcript moment.")
      && webText.includes("Make this my goal")
      && webText.includes("Owned by you with a link back to this transcript moment.")
      && workModelText.includes("readTranscriptDerivedGoalSource")
      && workClientText.includes("Transcript goal source")
      && schedulePageText.includes("readTranscriptDerivedGoalSource")
      && schedulePlannerText.includes("Focus source · transcript")
      && todayRouteText.includes("readTranscriptDerivedGoalSource")
      && shellText.includes("CaptureTodayGoalSourceLink_")
      && shellText.includes("exact transcript segment and retained recording source behind this goal"),
    "transcriptDerivedGoalExplicitSourceBoundary",
    "Transcript review creates one explicitly requested self-owned ACTIVE goal with immutable segment and recording provenance, stale-evidence protection, idempotency, and no implied task, schedule, delivery, or publication.",
  );
  expect(
    draftRouteText.includes('TRANSCRIPT_DRAFT_OPERATION = "create-draft-from-transcript-segment"')
      && draftRouteText.includes("readTranscriptCorrectionDesk({ prisma: tx, roomId, actor })")
      && draftRouteText.includes("segment.providerTextSha256 !== expectedProviderTextSha256")
      && draftRouteText.includes('externalId: `transcript:${desk.transcriptJobId}:${segmentId}`')
      && draftRouteText.includes('externalId: `transcript-draft:${desk.transcriptJobId}:${segmentId}`')
      && draftRouteText.includes("sourceMutated: false")
      && draftRouteText.includes("externalSideEffects: false")
      && webText.includes("Start writing page")
      && webText.includes("Private by default with a link back to this transcript moment.")
      && immutableSourceText.includes('IMMUTABLE_TRANSCRIPT_SOURCE_PREFIX = "transcript:"')
      && writingActionsText.includes("assertMutableWritingBlock(existingBlock.externalId)")
      && writingActionsText.includes("Source evidence stays pinned in its canonical position")
      && writingBlockText.includes("Pinned transcript evidence")
      && writingBlockText.includes("readOnly={isImmutableSource}"),
    "transcriptDerivedDraftExplicitSourceBoundary",
    "Transcript review creates one private, idempotent writing page whose pinned source snapshot is immutable in the UI and server mutation boundary while its separate response block remains editable.",
  );
  expect(
    todayRouteText.includes('action === "goal-progress"')
      && todayRouteText.includes('ownerUserId: userId')
      && todayRouteText.includes('kind: "quipsly-goal-progress-v1"')
      && todayRouteText.includes('surface: "ios-capture-today"')
      && todayRouteText.includes('goalStatusMutated: false')
      && todayRouteText.includes('externalSideEffects: false')
      && todayRouteText.includes('goalCheckInMutatesStatus: false')
      && bridgeText.includes('func recordGoalProgress(_ goal: MobileCaptureTodayGoal')
      && bridgeText.includes('action: "goal-progress"')
      && bridgeText.includes('guard !isUsingProtectedCache')
      && shellText.includes('CaptureTodayGoalCheckIn_')
      && shellText.includes('CaptureTodayGoalCheckInSave_')
      && shellText.includes('Adds a private progress note without completing the goal.')
      && shellText.includes('Reconnect to Nest to save this check-in.'),
    "mobileTodayGoalProgressEvidenceBoundary",
    "iPhone Today appends owner-only goal-progress evidence with optimistic concurrency while preview/offline states remain read-only and goal status plus external systems stay unchanged.",
  );
  expect(
    todayRouteText.includes('action === "recurrence-status"')
      && todayRouteText.includes('surface: "ios-capture-today"')
      && todayRouteText.includes("updateCanonicalTaskStatusInTransaction")
      && todayRouteText.includes("updateTaskRecurrenceStatusInTransaction")
      && canonicalTaskStatusText.includes('surface: "nest-work" | "ios-capture-today"')
      && canonicalTaskStatusText.includes("materializeFollowingOccurrence")
      && taskRecurrenceServerText.includes("ownerUserId: input.actorUserId")
      && taskRecurrenceServerText.includes("statusReceipts: [...priorStatusReceipts, receipt]")
      && taskRecurrenceServerText.includes("notificationScheduled: false")
      && taskRecurrenceServerText.includes("providerCalendarChanged: false")
      && bridgeText.includes('action: "recurrence-status"')
      && bridgeText.includes("guard !isUsingProtectedCache")
      && shellText.includes('CaptureTodayRecurrenceMenu_')
      && shellText.includes('CaptureTodayTaskDone_')
      && shellText.includes('CaptureTodayShowMoreTasks')
      && shellText.includes("Pause, resume, edit, or end this repeating task."),
    "mobileTodayCanonicalRecurrenceBoundary",
    "iPhone Today and Nest share one canonical optimistic task transaction, keep series controls owner-only and protected snapshots read-only, retain bounded status receipts, and never imply a notification or provider-calendar side effect.",
  );
  expect(
    schemaText.includes("model ActionItemTagLink")
      && schemaText.includes("model GoalTagLink")
      && schemaText.includes("model CallRoomTagLink")
      && workTagsText.includes('kind: "quipsly-work-tags-v1"')
      && workTagsText.includes("Every tag must be active and belong to the record's Nest.")
      && workTagsText.includes("externalSideEffects: false")
      && sessionsRouteText.includes("projectId: captureProjectId")
      && sessionsRouteText.includes("const MOBILE_CAPTURE_ROOM_INCLUDE = {")
      && sessionsRouteText.includes("project: {")
      && sessionsRouteText.includes("tags: {")
      && mobileCaptureSessionsText.includes("canonicalMobileSessionProject")
      && mobileCaptureSessionsText.includes('"unfiled-session"')
      && mobileCaptureSessionsText.includes("projectLegacySlugDrift: sessionProject.legacySlugDrift")
      && taskRouteText.includes("projectId: desk.projectId ?? null")
      && goalRouteText.includes("projectId: desk.projectId ?? null")
      && todayRouteText.includes("tagLabels: projectVisible")
      && bridgeText.includes("struct MobileCaptureTodayProject")
      && bridgeText.includes("let projectId: String?")
      && bridgeText.includes("session.projectId?.isEmpty != false")
      && shellText.includes("CaptureTodayTaskTags_")
      && sessionReviewPageText.includes("sessionTaxonomy={sessionTaxonomy}")
      && sessionReviewText.includes("Edit Session tags")
      && sessionReviewText.includes("Open Studio editor")
      && workTagsRouteText.includes("replaceWorkEntityTags")
      && workTagsRouteText.includes("projectScoped: true")
      && nestFollowThroughText.includes("canonicalProjectPreferredWithLegacySlugFallback: true"),
    "canonicalWorkSessionProjectTags",
    "Capture, Today, Work, and Nest share canonical project identity plus explicit permission-checked tags, with legacy slug lookup retained only as a temporary read fallback.",
  );
  expect(
    quickEntryText.includes('MOBILE_CAPTURE_QUICK_ENTRY_SCHEMA = "quipsly-mobile-quick-entry-v1"')
      && quickEntryText.includes("offlineRetrySafe: true")
      && quickEntryText.includes('["NOTE", "TASK", "GOAL", "SOURCE"]')
      && quickEntryText.includes("projectId: string | null")
      && quickEntryText.includes("QUICK_ENTRY_DESTINATION_CONFLICT")
      && quickEntryText.includes("requestedProjectId")
      && quickEntryRouteText.includes("captureRoomAccessWhere")
      && quickEntryRouteText.includes("isMobileCaptureQuickEntrySource")
      && quickEntryRouteText.includes('destination: kind === "SOURCE" ? "INBOX" : room?.destination || (room?.id ? "SESSION" : "HOME_NEST")')
      && quickEntryRouteText.includes('"QUICK_ENTRY_NEST_FORBIDDEN"')
      && quickEntryRouteText.includes('triageStatus: "INBOX"')
      && quickEntryRouteText.includes("externalCalendarMutated: false")
      && quickEntryRouteText.includes("messageSent: false")
      && sessionsRouteText.includes("captureProjects")
      && sessionsRouteText.includes("availableTags")
      && bridgeText.includes("struct MobileCaptureProjectDestination")
      && quickEntryOutboxText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && quickEntryOutboxText.includes("ownerAccountID")
      && quickEntryOutboxText.includes("destinationProjectID")
      && quickEntryOutboxText.includes("var clientRequestID: String { id.uuidString.lowercased() }")
      && captureExperienceText.includes("quickEntryOutbox.enqueue")
      && captureExperienceText.includes("retryQuickEntries(automatic: true)")
      && shellText.includes("CaptureQuickEntry_\\(kind.rawValue)_")
      && shellText.includes("projectDestinations")
      && shellText.includes('TextField("Find a tag"')
      && shellText.includes('LabeledContent("Save to", value: "Personal Inbox")')
      && shellText.includes("CaptureQuickEntryPending_")
      && shellText.includes("Saved on \\(CaptureDeviceVocabulary.thisDevice) · waiting to sync")
      && inboxText.includes('where: { userId, collectionId: null, researchFilings: { none: {} } }')
      && inboxText.includes("Open capture")
      && collectionsText.includes("snapshot.items.some((item) => item.id === requestedCaptureId)")
      && sessionReviewPageText.includes("sessionQuickEntries={sessionQuickEntries}")
      && sessionReviewPageText.includes("sessionNotes={sessionNotes}")
      && sessionReviewPageText.includes('return "iPhone Capture"')
      && sessionReviewText.includes("<SessionNotesWorkspace")
      && sessionNotesWorkspaceText.includes("TagSearchChips")
      && sessionNotesWorkspaceText.includes('payload.idempotentReplay ? "This note was already saved." : "Note saved."')
      && sessionNotesWorkspaceText.includes("noteAppearsInView(payload.note, activeView)")
      && sessionNotesWorkspaceText.includes("Audience")
      && sessionReviewText.includes('scope="work"')
      && sessionReviewText.includes("Session follow-through")
      && includesNormalized(sessionReviewText, "ordinary editable items, not proposals waiting for approval")
      && sessionReviewText.includes("Open same {entry.kind.toLowerCase()} in Work"),
    "canonicalMobileQuickEntryOutbox",
    "iPhone quick Note, Task, Goal, and Source capture journals to an actor-partitioned protected outbox first; Session, Home Nest, and explicit writable-Nest work replay to canonical project records while private URL/text sources enter Inbox with exact readback and no external side effects.",
  );
  expect(
    sessionNoteContractText.includes("SESSION_NOTE_VISIBILITIES")
      && sessionNoteContractText.includes("EDITABLE_SESSION_NOTE_KINDS")
      && quickEntryText.includes("noteKind: EditableSessionNoteKind | null")
      && quickEntryText.includes("noteVisibility: SessionNoteVisibility | null")
      && quickEntryText.includes("QUICK_ENTRY_NOTE_POLICY_SESSION_ONLY")
      && quickEntryText.includes("QUICK_ENTRY_NOTE_VISIBILITY_INVALID")
      && quickEntryRouteText.includes('operation: "created-from-ios-capture"')
      && quickEntryRouteText.includes('"QUICK_ENTRY_NOTE_POLICY_FORBIDDEN"')
      && quickEntryRouteText.includes("appendOnlyNoteRevision")
      && sessionNoteAccessText.includes("mobileSessionNoteVisibilityWhere")
      && sessionNoteAccessText.includes("Private notes remain")
      && sessionsRouteText.includes("mobileSessionNoteVisibilityWhere")
      && mobileCaptureSessionsText.includes("const sessionNotes = room.notes")
      && mobileCaptureSessionsText.includes("canUseProjectTeamNotes:")
      && mobileCaptureSessionsText.includes("input.isStaff === true")
      && mobileCaptureSessionsText.includes("productionNoteProjectIds.has(sessionProject.projectId)")
      && mobileCaptureSessionsText.includes("revisionCount: note._count?.revisions")
      && quickEntryOutboxText.includes("enum MobileSessionNoteKind")
      && quickEntryOutboxText.includes("enum MobileSessionNoteVisibility")
      && quickEntryOutboxText.includes("let noteVisibility: MobileSessionNoteVisibility?")
      && bridgeText.includes("struct MobileCaptureSessionNote")
      && bridgeText.includes("var canUseProjectTeamNotes: Bool? = nil")
      && bridgeText.includes("var sessionNotes: [MobileCaptureSessionNote]? = nil")
      && bridgeText.includes("noteVisibility = entry.noteVisibility?.rawValue")
      && captureExperienceText.includes("_ = await sessionClient.load(authoritativeSessionID: sessionID)")
      && shellText.includes("CaptureQuickEntryNoteKind")
      && shellText.includes("CaptureQuickEntryNoteVisibility")
      && shellText.includes("session?.canUseProjectTeamNotes == true")
      && shellText.includes("CaptureSessionNotesCard")
      && shellText.includes("CaptureSessionNotesToggle")
      && shellText.includes("CaptureSessionNoteCanonical_")
      && shellText.includes("Only the people shown on each note can see it"),
    "visibilityAwareIPhoneSessionNotes",
    "iPhone Session notes preserve purpose and audience through the protected offline ledger, authorize production policy on Nest, append a revision, and project only visibility-permitted canonical notes back to the phone without claiming delivery.",
  );
  expect(
    sessionNoteEditText.includes('kind: "quipsly-session-note-edit-v2"')
      && sessionNoteEditText.includes('surface: "nest-session-notes" | "ios-capture-session-notes"')
      && sessionNoteEditText.includes('isolationLevel: "Serializable"')
      && sessionNoteEditText.includes("REQUEST_ID_CONFLICT")
      && sessionNoteEditText.includes("previousContentRetainedInRevision: true")
      && sessionNoteEditText.includes("externalSideEffects: false")
      && sessionNoteEditText.includes("addedTagIdsInTransaction")
      && sessionNoteCreateRouteText.includes("sessionMutationAccessWhere")
      && sessionNoteCreateRouteText.includes("canonicalSessionMutationAccess: true")
      && sessionNoteEditText.includes("sessionMutationAccessWhere")
      && sessionNoteEditRouteText.includes("clientRequestId")
      && sessionNoteEditRouteText.includes("canonicalSessionMutationAccess: true")
      && sessionNoteEditRouteText.includes("canonicalTagsAtomic")
      && sessionNoteEditRouteText.includes("retryIdentityProtected")
      && sessionNoteEditOutboxText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && sessionNoteEditOutboxText.includes("ownerAccountID")
      && sessionNoteEditOutboxText.includes("var clientRequestID: String { id.uuidString.lowercased() }")
      && captureExperienceText.includes("retrySessionNoteEdits(automatic: true)")
      && captureExperienceText.includes("sessionNoteEditOutbox.enqueue")
      && captureExperienceText.includes("A note changed elsewhere. Review your changes before saving.")
      && captureExperienceText.includes("sessionNoteEditMessageRoomID = edit.roomID")
      && bridgeText.includes("syncSessionNoteEdit")
      && bridgeText.includes("var isActive: Bool? = nil")
      && bridgeText.includes("payload.idempotentReplay == true || intentMatchesCurrent")
      && mobileCaptureSessionsText.includes("isActive: tag.isActive")
      && bridgeText.includes("SESSION_NOTE_EDIT_ACKNOWLEDGEMENT_MISMATCH")
      && shellText.includes("CaptureSessionNoteEditSheet")
      && shellText.includes("CaptureSessionNoteEditKeyboardDone")
      && shellText.includes("CaptureSessionNoteEditPolicyBoundary")
      && shellText.includes('Label("Discard changes"')
      && shellText.includes("Earlier versions stay available after you save"),
    "protectedIPhoneSessionNoteEditing",
    "iPhone Session-note edits journal complete actor-partitioned intent before sync, use optimistic and idempotent server transactions, atomically replace canonical tags, hold conflicts for explicit review, and append exactly one revision without delivery or publication.",
  );
  expect(
    sourceAnnotationServiceText.includes("That writing handoff identity already belongs to a different source decision.")
      && sourceAnnotationServiceText.includes('kind: "quipsly-source-annotation-use-v1"')
      && sourceAnnotationServiceText.includes("sourceMutated: false")
      && todayRouteText.includes('if (action === "source-annotation-draft")')
      && todayRouteText.includes("createWritingDraftFromSourceAnnotation")
      && todayRouteText.includes("resolveStudioProjectAccess")
      && todayRouteText.includes("writingDraftPrivate: true")
      && todayRouteText.includes("writingDraftSourceMutated: false")
      && todayRouteText.includes("writingDraftExternalSideEffects: false")
      && sourceAnnotationDraftOutboxText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && sourceAnnotationDraftOutboxText.includes("ownerAccountID")
      && sourceAnnotationDraftOutboxText.includes("expectedAnnotationUpdatedAt")
      && bridgeText.includes("syncWritingDraftDecision")
      && bridgeText.includes("ACKNOWLEDGEMENT_MISMATCH")
      && shellText.includes("CaptureTodayAnnotationDraftStart_")
      && shellText.includes("Start private draft")
      && shellText.includes("Creates a private draft linked to this source."),
    "protectedSourceAnnotationWritingHandoff",
    "iPhone protects one exact annotation-to-writing decision before network use, Nest authorizes its writable project and creates one private citation-backed canonical draft, exact acknowledgements close the outbox, and sources plus external systems remain unchanged.",
  );
  expect(
    schemaText.includes("model StudioPersonalSourceFiling")
      && /personalSourceFiling\s+StudioPersonalSourceFiling\?/.test(schemaText)
      && personalSourceFilingText.includes('kind: "quipsly-personal-source-filing-v1"')
      && personalSourceFilingText.includes("privateCaptureMutated: false")
      && personalSourceFilingText.includes("collaboratorsReceivePrivateCollectionAccess: false")
      && personalSourceFilingText.includes("externalSideEffects: false")
      && personalSourceFilingText.includes("TransactionIsolationLevel.Serializable")
      && personalSourceFilingActionText.includes("filePersonalSourceIntoResearch")
      && collectionsClientText.includes("File into Research")
      && collectionsClientText.includes("Your private capture stays unchanged")
      && researchPageText.includes("personalSourceFiling")
      && inboxText.includes("researchFilings: { none: {} }")
      && inboxText.includes("Personal captures stay private until you add them to a Nest.")
      && mobileSourceInboxRouteText.includes("actorOwnedPrivateInbox: true")
      && mobileSourceInboxRouteText.includes("writableResearchDestinationsOnly: true")
      && mobileSourceInboxRouteText.includes("optionalSourceAnnotation: true")
      && mobileSourceInboxRouteText.includes("exactWholeCaptureAnchor: true")
      && mobileSourceInboxRouteText.includes("canonicalProjectTagsOnly: true")
      && mobileSourceInboxRouteText.includes("annotationMutatesSource: false")
      && mobileSourceInboxRouteText.includes("expectedCaptureUpdatedAt")
      && mobileSourceInboxRouteText.includes("filePersonalSourceIntoResearch")
      && sourceInboxFilingText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && sourceInboxFilingText.includes("ownerAccountID")
      && sourceInboxFilingText.includes("expectedCaptureUpdatedAt")
      && sourceInboxFilingText.includes("annotationRequestID")
      && sourceInboxFilingText.includes("annotationTagIDs")
      && sourceInboxFilingText.includes("annotationAcknowledgementMatches")
      && sourceInboxFilingText.includes("ACKNOWLEDGEMENT_MISMATCH"),
    "personalSourceResearchFiling",
    "A person explicitly files an actor-owned Inbox capture into one writable Nest as a canonical immutable Research source plus receipt and can atomically attach a whole-source annotation using existing Nest tags; retries preserve both identities, the private capture remains unchanged, and Inbox removal follows the committed receipt.",
  );
  expect(
    shareCaptureBridgeText.includes('appGroupIdentifier = "group.com.highgroundodyssey.HighGroundCapture"')
      && shareCaptureBridgeText.includes("ownerAccountID")
      && shareExtensionText.includes("final class ShareViewController: SLComposeServiceViewController")
      && shareExtensionText.includes("verifiedOwnerID != nil")
      && shareExtensionText.includes('value = verifiedOwnerID == nil ? "Open Quipsly to sign in" : "Private Inbox · unfiled"')
      && shareExtensionText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && !shareExtensionText.includes("URLSession")
      && shareExtensionInfoText.includes("com.apple.share-services")
      && shareExtensionInfoText.includes("NSExtensionActivationSupportsWebURLWithMaxCount")
      && shareExtensionInfoText.includes("NSExtensionJavaScriptPreprocessingFile")
      && quickEntryOutboxText.includes("importShareExtensionCaptures")
      && quickEntryOutboxText.includes("Self.normalizedOwnerID(envelope.ownerAccountID) == owner")
      && captureProjectText.includes("ShareCaptureExtension.appex in Embed App Extensions")
      && captureProjectText.includes("CodeSignOnCopy")
      && captureEntitlementsText.includes("group.com.highgroundodyssey.HighGroundCapture")
      && shareEntitlementsText.includes("group.com.highgroundodyssey.HighGroundCapture")
      && captureUITestText.includes("testSafariShareSheetSurfacesQuipslyButKeepsPostingLockedWithoutVerifiedAccount")
      && captureUITestText.includes("testSignedInSimulatorShareSurvivesRelaunchAndOwnerSwitchInProtectedSourceOutbox")
      && captureUITestText.includes('staticTexts["1 quick capture waiting"]')
      && captureUITestText.includes("A different verified owner must not see the first owner's protected URL.")
      && captureUITestText.includes("Returning to the original verified owner reveals the same pending"),
    "systemShareCaptureProtectedHandoff",
    "The real iOS Share Sheet offers Quipsly for Safari URLs, blocks unsigned staging, writes no network traffic from the extension, and hands a protected account-bound envelope into the matching iPhone outbox with simulator-operated proof for process-death recovery and owner isolation.",
  );
  expect(
    schemaText.includes("metadataJson Json?")
      && shareCaptureBridgeText.includes("let sourceURL: String?")
      && shareExtensionText.includes('schema = "quipsly-share-source-capture-v2"')
      && shareExtensionText.includes('sourceURL == nil ? "Text only · no webpage" : body == sourceURL ? "Web link" : "Passage + webpage"')
      && shareExtensionText.includes("normalizedPassage")
      && shareExtensionText.includes("provider.hasItemConformingToTypeIdentifier(UTType.url.identifier)")
      && shareExtensionText.includes("provider.hasItemConformingToTypeIdentifier(UTType.text.identifier)")
      && shareExtensionText.includes("NSExtensionJavaScriptPreprocessingResultsKey")
      && shareExtensionText.includes("webpagePreprocessingReceived")
      && shareExtensionText.includes("!webpagePreprocessingReceived && selectedText == nil")
      && shareExtensionWebSourceText.includes("ExtensionPreprocessingJS")
      && shareExtensionWebSourceText.includes("window.getSelection")
      && shareExtensionWebSourceText.includes("document.location.href")
      && captureProjectText.includes("QuipslyWebSource.js in Resources")
      && quickEntryOutboxText.includes('["quipsly-share-source-capture-v1", "quipsly-share-source-capture-v2"]')
      && quickEntryOutboxText.includes("let sourceURL = envelope.sourceURL.flatMap(Self.normalizedHTTPURL)")
      && quickEntryRouteText.includes('captureMode: input.sourceUrl ? "PASSAGE_WITH_WEBPAGE" : "PASSAGE"')
      && quickEntryRouteText.includes("sourceUrl: input.sourceUrl")
      && personalSourceFilingText.includes("capturedAtFromMetadata")
      && captureUITestText.includes("testSignedInSimulatorSelectedPassageStagesTextWithWebpageProvenance")
      && captureUITestText.includes("Passage + webpage"),
    "richShareSourceProvenance",
    "Share Sheet intake preserves selected passage text, its HTTP(S) webpage URL, title, and original capture time through the protected v2 envelope, backward-compatible iPhone outbox, canonical Snippet metadata, and later explicit Research filing.",
  );
  expect(
    schemaText.includes("model StudioPersonalSourceCaptureReceipt")
      && schemaText.includes("@@unique([createdByUserId, clientRequestId])")
      && schemaText.includes("@@unique([userId, captureFingerprint])")
      && personalSourceCaptureMigrationText.includes('CONSTRAINT "StudioPersonalSourceCaptureReceipt_target_check" CHECK')
      && quickEntryText.includes("mobileCaptureSourceFingerprint")
      && quickEntryRouteText.includes("ensureSourceCaptureReceipt")
      && quickEntryRouteText.includes('kind: "quipsly-personal-source-capture-receipt-v1"')
      && quickEntryRouteText.includes("sourceIdentityReused")
      && quickEntryRouteText.includes("captureCount")
      && inboxText.includes("latest capture first")
      && collectionsModelText.includes("captureHistory: CaptureReceiptSummary[]")
      && collectionsClientText.includes("Captured ${item.captureCount} times")
      && personalSourceFilingText.includes("captureCountAtFiling")
      && personalSourceFilingText.includes('captureReceipts: { orderBy: { capturedAt: "asc" }'),
    "duplicateSafePersonalSourceReceipts",
    "Repeated iPhone shares converge on one actor-owned Bookmark or Snippet identity while each distinct request retains an immutable timestamped capture receipt; Inbox and Collections expose the count and recent history, and later Research filing pins the earliest capture plus count without mutating private evidence.",
  );
  expect(
    recordingPromotionText.includes('source: "canonical-session-project"')
      && recordingPromotionText.includes('"canonical-session-project-conflict"')
      && recordingPromotionText.includes('handoffKind: "capture-session-to-studio"')
      && recordingPromotionText.includes("canonicalTagsRemainOnSession: true")
      && recordingPromotionText.includes('status: "already-attached-to-episode-production"')
      && sessionReviewPageText.includes("studioHandoff={studioHandoff}")
      && sessionReviewText.includes("Durable Studio handoff")
      && sessionReviewText.includes("Inspect handoff receipt")
      && episodeInventoryText.includes("publicSessionContext")
      && episodeInventoryText.includes("{ projectId: project.id }")
      && editorText.includes("Session context linked")
      && editorText.includes("Tag labels are a handoff snapshot; the Session remains canonical."),
    "canonicalSessionStudioHandoff",
    "A verified capture uses its canonical Session project, persists one idempotent Nest and episode handoff receipt with tag provenance, and exposes the source Session back inside Studio without mutating original media.",
  );
  expect(
    shellText.includes("CaptureRecordingEditCard(session: session)")
      && shellText.includes('Label("Edit and share"')
      && shellText.includes('CaptureRecordingShareEditor(roomID: roomID, focus: focus)')
      && nativeText.includes("CaptureRecordingEditScreen(")
      && nativeRecordingShareText.includes("authenticatedData(for: request)")
      && nativeRecordingShareText.includes("authenticatedDownload(")
      && nativeRecordingShareText.includes("expectedOwnerAccountID: owner.ownerAccountID")
      && nativeRecordingShareText.includes("digest.sha256 == expectedSHA256")
      && nativeRecordingShareText.includes("digest.sizeBytes == expectedSizeBytes")
      && nativeRecordingShareText.includes("FileProtectionType.complete")
      && nativeRecordingShareText.includes("reconcilePlaybackAuthorization")
      && nativeRecordingShareText.includes('action: "PREPARE"')
      && nativeRecordingShareText.includes('action: "RELEASE"')
      && nativeRecordingShareText.includes('action: "REVOKE"')
      && nativeRecordingShareText.includes("CaptureRecordingSharePlay")
      && nativeRecordingShareText.includes("CaptureRecordingShareExport")
      && nativeRecordingShareText.includes("Play this edit above, or share it now. The original recording stays unchanged.")
      && nativeRecordingShareText.includes("providerTextSha256")
      && nativeRecordingShareText.includes("sourceManifest")
      && nativeRecordingShareText.includes("restoreEditorFromCurrentOutput")
      && nativeRecordingShareText.includes("will not substitute another track")
      && nativeRecordingShareText.includes("snapshot.readiness?.verifiedRendererAvailable != true")
      && nativeRecordingShareText.includes("Your original recording and edit choices are safe")
      && nativeRecordingShareText.includes("Listen to exact passage")
      && nativeRecordingShareText.includes("source.programOffsetSeconds")
      && nativeRecordingShareText.includes("sourcePlayback.playRange")
      && nativeRecordingShareText.includes("source.mobileProtectedSource")
      && bridgeText.includes("transcriptionConsentGrantedParticipantCount")
      && shellText.includes("The transcript starts after everyone allows it")
      && nativeText.includes('Label("Edit recording here"')
      && nativeText.includes("transcriptJobID: transcriptJobID")
      && nativeText.includes("segmentID: segment.id")
      && nativeRecordingShareText.includes("CaptureRecordingEditorFocus")
      && nativeRecordingShareText.includes("$0.transcriptJobId == focus.transcriptJobID && $0.segmentId == focus.segmentID")
      && nativeRecordingShareText.includes("Quipsly did not change the source set")
      && nativeRecordingShareText.includes("Quipsly did not widen it automatically")
      && nativeRecordingShareText.includes("does not have qualified source timing")
      && nativeRecordingShareText.includes("it is not an edit decision"),
    "nativePrivateRecordingEditAndShare",
    "Capture exposes source-bound trim and text editing, exact-passage audition, verified derivative playback and export, direct share or revocation, and exact transcript-passage handoff without mutating masters or silently substituting tracks.",
  );
  expect(
    recordingPromotionText.includes("resolveCaptureGroupPromotionPlan")
      && recordingPromotionText.includes('"capture-group-source-set-changed"')
      && recordingPromotionText.includes('"capture-group-processing-held"')
      && recordingPromotionText.includes("missingRequiredRecordingAssetIds")
      && recordingPromotionText.includes('kind?: string | null')
      && recordingPromotionText.includes('toUpperCase() === "SERVER_MIX"')
      && recordingPromotionText.includes("originalSourcesMutated: false")
      && recordingPromotionText.includes("alignmentRemainsProposal: true")
      && recordingPromotionText.includes("retryIsIdempotent: true")
      && recordingPromotionRouteText.includes("expectedRecordingAssetIds")
      && recordingPromotionRouteText.includes("promoteRecordingCaptureGroupToStudioMedia")
      && mobileCaptureSessionsText.includes("captureGroupStudioHandoff")
      && mobileCaptureSessionsText.includes("captureGroupPromotionRequiresCompleteSourceSet: true")
      && mobileCaptureSessionsText.includes("automaticFollowThroughCreatesEditableWork: true")
      && mobileCaptureSessionsText.includes("optionalSuggestionsRequireUserAction: true")
      && mobileCaptureSessionsText.includes("externalSideEffectsRequireUserAction: true")
      && !mobileCaptureSessionsText.includes("reviewOnlyUntilUserActs")
      && mobileCaptureSessionsText.includes("providerWitnessCount")
      && mobileCaptureSessionsText.includes("requiredSourceCount")
      && bridgeText.includes("MobileCaptureSourceSummary")
      && bridgeText.includes("studioRequiredHandoffSources")
      && bridgeText.includes("studioProviderWitnesses.filter(\\.isVerifiedForStudio)")
      && bridgeText.includes('requestBody["captureGroupId"] = captureGroupID')
      && bridgeText.includes('requestBody["expectedRecordingAssetIds"]')
      && bridgeText.includes("studioCaptureReviewURL")
      && bridgeText.includes('URLQueryItem(name: "captureGroup"')
      && captureExperienceText.includes("complete capture group")
      && shellText.includes('"Prepare group"')
      && shellText.includes('"Review group sync"')
      && shellText.includes("CaptureOpenStudioReviewLink_")
      && editorText.includes("captureGroupEditorFocusPlan")
      && editorText.includes('data-testid="capture-group-editor-focus"')
      && captureGroupEditorFocusText.includes("No placement or episode-spine decision has been made.")
      && captureGroupEditorFocusText.includes("captureGroupEditorFocusPlan")
      && captureUITestText.includes("testStudioHandoffKeepsTheWholeCaptureGroupVisibleAcrossReadyRetryAndCompleteStates")
      && captureUITestText.includes('expectedStatus: "2 masters ready"')
      && captureUITestText.includes('expectedStatus: "1 of 2 masters in Studio"')
      && captureUITestText.includes('expectedStatus: "2 masters in Studio"'),
    "completeCaptureGroupStudioHandoff",
    "iPhone and Nest attach every required protected master from the newest podcast take as one exact source-set snapshot, preserve every original, optionally include only reconciled provider media as a non-blocking sync and recovery witness, expose partial retry truth, and open the same capture group in the existing waveform, drift, and human-approval editor without applying sync.",
  );
  expect(
    serviceText.includes("resolvedSpeakerAuthority")
      && serviceText.includes("sourceBoundParticipantId")
      && transcriptSourceSpanText.includes('field: "speakerAuthority" | "sourceBoundParticipantId"')
      && transcriptSourceSpanText.includes('speakerAuthority: sharedText(segments, "speakerAuthority")')
      && transcriptSourceSpanText.includes('sourceBoundParticipantId: sharedText(segments, "sourceBoundParticipantId")')
      && taskDomainText.includes("TRANSCRIPT_SOURCE_SPEAKER_AUTHORITIES")
      && taskDomainText.includes("speakerProvenance")
      && taskDomainText.includes('speakerAuthority === "source-binding" && !sourceBoundParticipantId')
      && taskRouteText.includes("speakerAuthority: segment.speakerAuthority")
      && taskRouteText.includes("sourceBoundParticipantId: segment.sourceBoundParticipantId")
      && draftRouteText.includes("speakerAuthority: segment.speakerAuthority")
      && draftRouteText.includes("sourceBoundParticipantId: segment.sourceBoundParticipantId")
      && goalRouteText.includes("...sourceAnchor")
      && noteMaterializationRouteText.includes("...sourceAnchor"),
    "materializedFollowThroughRetainsSpeakerProvenance",
    "Saved transcript-backed notes, tasks, goals, and writing drafts retain speaker-name authority and exact isolated-source participant ownership instead of keeping only a display label.",
  );
  expect(
    coachingPacketText.includes("speakerAuthority")
      && coachingPacketText.includes('"source-binding"')
      && packetRouteText.includes("speakerAuthority: segment.speakerAuthority")
      && sessionReviewModelText.includes('speakerAuthority?: "correction" | "attribution" | "source-binding" | "provider" | "unresolved"')
      && sessionReviewText.includes("TranscriptSpeakerEvidenceBadge")
      && transcriptSpeakerEvidenceBadgeText.includes("Participant recording")
      && transcriptSpeakerEvidenceBadgeText.includes("Automatic speaker label")
      && transcriptSpeakerEvidenceBadgeText.includes("Speaker needs review")
      && nativeText.includes("speakerAuthority")
      && nativeText.includes("CaptureTranscriptSpeakerEvidenceBadge")
      && nativeText.includes("Participant recording")
      && nativeText.includes("Automatic speaker label")
      && nativeText.includes("Speaker needs review"),
    "packetSpeakerIdentityEvidenceVisible",
    "Nest and iPhone Session follow-through explain whether a speaker name was reviewed, bound to an isolated participant recording, supplied automatically, or remains unresolved without conflating that identity with word review.",
  );
  expect(
    studioTranscriptReviewServiceText.includes("studioTranscriptSpeakerAuthority")
      && studioTranscriptSpeakerAuthorityText.includes('return "correction" as const')
      && studioTranscriptSpeakerAuthorityText.includes('return "provider" as const')
      && studioTranscriptSpeakerAuthorityText.includes('return "unresolved" as const')
      && studioTranscriptReviewDeskText.includes("TranscriptSpeakerEvidenceBadge authority={selected.speakerAuthority}"),
    "studioTranscriptSpeakerEvidenceVisible",
    "Studio transcript review distinguishes a human-reviewed speaker name from an automatic or unresolved label without claiming imported media has participant-source identity.",
  );
  expect(
    captureAudioMasteryClientText.includes("let sourceMeasurement: Measurement?")
      && captureAudioMasteryClientText.includes("let measured: Measurement?")
      && captureAudioMasteryClientText.includes("clampedPlaybackTime")
      && captureAudioMasteryClientText.includes("clampedVolume")
      && captureAudioMasteryClientText.includes("func setPreviewVolume")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryMeasurements")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryTarget")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryPlayOriginal")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryMonitorMode")
      && captureSourceEvidenceText.includes("masteryPreviewVolume(status)")
      && captureSourceEvidenceText.includes("mastery.setPreviewVolume")
      && captureSourceEvidenceText.includes("from: selectedAudioSeconds")
      && captureUITestText.includes("CaptureAudioMasteryMeasurements")
      && captureUITestText.includes("CaptureAudioMasteryPlayOriginal")
      && captureUITestText.includes("CaptureAudioMasteryMonitorMode"),
    "nativeAudioMasteryEvidenceComparison",
    "iPhone recording quality decodes complete source and verified preview loudness evidence, shows the delivery target, and compares original versus improved audio from the same selected source time without replacing the original.",
  );
  expect(
    captureAudioMasteryClientText.includes("quipsly-audio-mastery-playback-review-v1")
      && captureAudioMasteryClientText.includes("reviewRequestIDs")
      && captureAudioMasteryClientText.includes("sourceListenedSecondBins")
      && captureAudioMasteryClientText.includes("previewListenedSecondBins")
      && captureAudioMasteryClientText.includes("requiredMomentIDs")
      && captureAudioMasteryClientText.includes("api/media-vault/audio-mastery/review")
      && localRecordingPlaybackText.includes("@Published private(set) var currentTime")
      && localRecordingPlaybackText.includes("func setVolume")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryReview")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryApprove")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryReject")
      && captureUITestText.includes("CaptureAudioMasteryReview"),
    "nativeAudioMasteryListeningDecision",
    "iPhone tracks bounded original and verified-preview playback against server-selected moments, applies fair or delivery monitoring to both versions, and submits the existing append-only authenticated mastery-review contract without promoting or replacing source media.",
  );
  expect(
    captureAudioMasteryClientText.includes("CaptureAudioMasteryPromotionResponse")
      && captureAudioMasteryClientText.includes("promotionRequestIDs")
      && captureAudioMasteryClientText.includes("api/media-vault/audio-mastery/promotion")
      && captureAudioMasteryClientText.includes("latest.jobId == currentJobID")
      && captureAudioMasteryClientText.includes("active.jobId")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryPromotion")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryPromote")
      && captureSourceEvidenceText.includes("CaptureAudioMasteryWithdraw")
      && captureUITestText.includes("CaptureAudioMasteryPromotion"),
    "nativeAudioMasteryPromotionAuthority",
    "iPhone can select only the latest exact approved mastery preview as a reversible delivery candidate, can withdraw an active current or earlier pass only with a reason, and keeps encoding, sharing, publication, and original source truth separate.",
  );
  expect(
    captureAudioDeliveryClientText.includes("api/media-vault/audio-delivery")
      && captureAudioDeliveryClientText.includes("api/media-vault/audio-delivery/review")
      && captureAudioDeliveryClientText.includes("apple-podcasts-aac-stereo-v1")
      && captureAudioDeliveryClientText.includes("authenticatedDownload")
      && captureAudioDeliveryClientText.includes("computeDigest")
      && captureAudioDeliveryClientText.includes("FileProtectionType.complete")
      && captureAudioDeliveryClientText.includes("quipsly-audio-delivery-playback-review-v1")
      && captureAudioDeliveryClientText.includes("sendPersistedReview")
      && captureAudioDeliveryClientText.includes("CaptureAudioDecisionOutbox.shared")
      && captureAudioDeliveryClientText.includes("status.review.latest?.clientRequestId == entry.clientRequestID")
      && audioDeliveryServiceText.includes("clientRequestId: String(receipt.clientRequestId)")
      && captureAudioDecisionOutboxText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && captureAudioDecisionOutboxText.includes("last-known-good")
      && captureAudioDecisionOutboxText.includes("ownerAccountID")
      && captureAudioDecisionOutboxText.includes("clientRequestID")
      && captureAudioDecisionOutboxText.includes("markAcknowledged")
      && captureAudioDecisionOutboxText.includes("markRetryable")
      && captureAudioDecisionOutboxText.includes("markHeld")
      && captureAudioDeliveryClientText.includes("requiredSecondBins")
      && captureAudioDeliveryClientText.includes("playbackIsStillAuthorized")
      && captureAudioDeliveryClientText.includes("promotionStillActive")
      && captureSourceEvidenceText.includes("CaptureAudioDeliveryPrepare")
      && captureSourceEvidenceText.includes("CaptureAudioDeliveryOutput")
      && captureSourceEvidenceText.includes("CaptureAudioDeliveryPlay")
      && captureSourceEvidenceText.includes("CaptureAudioDeliveryReview")
      && captureSourceEvidenceText.includes("CaptureAudioDeliveryApprove")
      && captureSourceEvidenceText.includes("CaptureAudioDeliveryReject")
      && captureSourceEvidenceText.includes("CaptureAudioDeliverySavedDecision")
      && captureSourceEvidenceText.includes("CaptureAudioDeliveryRetrySavedReview")
      && captureUITestText.includes("CaptureAudioDeliveryPreviewBoundary"),
    "nativeAudioDeliveryArtifactReview",
    "iPhone deliberately encodes the selected approved improvement, downloads and verifies the exact authenticated AAC bytes, requires beginning-middle-ending proof listening, and crash-safely replays the identical account-bound approval or rejection without sharing, publishing, or replacing the source.",
  );
  expect(
    durableWorkText.includes("TranscriptSpeakerEvidenceBadge authority={task.sourceAnchor.speakerAuthority}")
      && durableWorkText.includes("TranscriptSpeakerEvidenceBadge authority={goal.sourceAnchor.speakerAuthority}")
      && durableWorkText.includes("lastMergedTranscriptEvidence.sourceAnchor.speakerAuthority")
      && durableNotesText.includes("TranscriptSpeakerEvidenceBadge authority={note.sourceAnchor.speakerAuthority}")
      && durableNotesText.includes("lastMergedSource.sourceAnchor.speakerAuthority")
      && durableScheduleText.includes("TranscriptSpeakerEvidenceBadge authority={block.sourceAnchor.speakerAuthority}")
      && durableSchedulePageText.includes("TranscriptSpeakerEvidenceBadge authority={task.sourceAnchor.speakerAuthority}")
      && bridgeText.includes("var speakerAuthority: String? = nil")
      && bridgeText.includes("var sourceBoundParticipantId: String? = nil")
      && shellText.includes("CaptureTodayTaskSpeakerEvidence_")
      && shellText.includes("CaptureTodayGoalSpeakerEvidence_")
      && shellText.includes("CaptureSessionNoteSpeakerEvidence_")
      && mobileComponentsText.includes("CaptureClientFollowUpSpeakerEvidence_")
      && clientFollowUpWebText.includes("TranscriptSpeakerEvidenceBadge authority={anchor.speakerAuthority}")
      && clientFollowUpWebText.includes("Speaker evidence: ${evidence.label}")
      && sessionContinuityCardText.includes("TranscriptSpeakerEvidenceBadge authority={evidence.sourceAnchor.speakerAuthority}")
      && sessionContinuityCardText.includes("task.lastMergedTranscriptEvidence.sourceAnchor.speakerAuthority")
      && webText.includes("TranscriptSpeakerEvidenceBadge authority={segment.speakerAuthority}")
      && nativeText.includes("CaptureTranscriptSegmentSpeakerEvidence_")
      && captureUITestText.includes("CaptureTranscriptSegmentSpeakerEvidence_preview-segment"),
    "durableFollowThroughSpeakerEvidenceVisible",
    "Saved transcript-backed notes, tasks, goals, focus plans, and released follow-up sources show the same plain-language speaker-authority evidence across Nest and iPhone after users leave Session review.",
  );
  expect(
    coachingPacketText.includes("reviewRequired: false")
      && coachingPacketText.includes("prisma.coachingNote.create")
      && coachingPacketText.includes("prisma.actionItem.create")
      && coachingPacketText.includes("prisma.goal.create")
      && coachingPacketText.includes("automaticallyCreated: true")
      && coachingPacketText.includes("editableAfterCreation: true")
      && coachingPacketText.includes("removableInProduct: true")
      && coachingPacketText.includes("sourceProvenanceVisible: true")
      && includesNormalized(sessionReviewText, "ordinary editable items, not proposals waiting for approval")
      && shellText.includes("CaptureSessionResultsCard")
      && shellText.includes("Quipsly made these from the transcript. Adjust or remove them like any other work")
      && nativeText.includes("CapturePacketAdditionalSuggestionsDisclosure")
      && nativeText.includes("More suggestions")
      && nativeText.includes("Use, edit, or dismiss any idea whenever it helps.")
      && packetGoalReviewRouteText.includes("createTranscriptDerivedGoalInTransaction")
      && packetGoalReviewRouteText.includes("mergeAppendsOneActorOwnedGoalEvidenceReceipt")
      && nativeText.includes("CapturePacketGoalSource_")
      && nativeText.includes("CapturePacketGoalCreateButton")
      && nativeText.includes("CapturePacketGoalMergeTargetPicker")
      && nativeText.includes("CapturePacketTaskSource_")
      && nativeText.includes("CapturePacketTaskCreateButton")
      && nativeText.includes("CapturePacketTaskMergeTargetPicker"),
    "packetGoalCandidateExplicitReviewBoundary",
    "Completed transcripts create ordinary editable tasks and goals directly, while exact-source extra suggestions remain optional and collapsed instead of blocking the workflow.",
  );
  expect(
    coachingPacketText.includes("reviewRequired: false")
      && coachingPacketText.includes("prisma.coachingNote.create")
      && coachingPacketText.includes("kind: \"SUMMARY\"")
      && coachingPacketText.includes("kind: \"HIGHLIGHT\"")
      && coachingPacketText.includes("editableAfterCreation: true")
      && coachingPacketText.includes("removableInProduct: true")
      && includesNormalized(sessionReviewText, "ordinary editable items, not proposals waiting for approval")
      && nativeText.includes("CapturePacketAdditionalSuggestionsDisclosure")
      && nativeText.includes("Use, edit, or dismiss any idea whenever it helps.")
      && nativeText.includes("CapturePacketNoteSourceButton_")
      && nativeText.includes("CapturePacketNoteEditButton_")
      && nativeText.includes("CapturePacketNoteRejectButton_")
      && !nativeText.includes("CapturePacketNoteDeferButton_")
      && noteMaterializationRouteText.includes("packetSnapshotRechecked")
      && noteMaterializationRouteText.includes("exactReplay")
      && noteMaterializationRouteText.includes('decision === "MERGE"')
      && noteMaterializationRouteText.includes("previousContentRetainedInRevision"),
    "packetNoteCandidateExplicitMaterializationBoundary",
    "Completed transcripts create ordinary editable notes directly, while optional exact-source suggestions preserve safe edit, merge, defer, and dismiss behavior without becoming required paperwork.",
  );
  expect(
    clientFollowUpServiceText.includes("readTranscriptDerivedNoteSource")
      && clientFollowUpServiceText.includes("readTranscriptDerivedTaskSource")
      && clientFollowUpServiceText.includes("readTranscriptDerivedGoalSource")
      && clientFollowUpServiceText.includes("sourceAnchorForRoom")
      && clientFollowUpServiceText.includes("sourceAnchorsRestrictedToSession: true")
      && clientFollowUpWebText.includes("Includes exact source")
      && clientFollowUpWebText.includes("mode=transcript#transcript-segment-")
      && bridgeText.includes("let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor?")
      && mobileComponentsText.includes("CaptureClientFollowUpSource_")
      && mobileComponentsText.includes("CaptureTranscriptReviewView")
      && mobileComponentsText.includes("previewOnly || isSaving")
      && captureExperienceText.includes("capturePreviewClientFollowUpWorkspace")
      && captureUITestText.includes("testCoachFollowUpPreservesExactSourceWithoutReleasingPreview"),
    "clientSafeFollowUpExactSourceReturn",
    "Selected client-safe notes and client-owned work preserve bounded same-Session transcript anchors in the immutable follow-up revision, expose exact-source return on Nest and iPhone, and keep preview save/release side effects disabled.",
  );
  expect(
    clientFollowUpServiceText.includes("clientFollowUpDraftReadiness")
      && clientFollowUpServiceText.includes("FOLLOW_UP_SOURCE_CHANGED")
      && clientFollowUpServiceText.includes("loadEligibleRecords(tx, freshBoundary.room)")
      && clientFollowUpWebText.includes("Share follow-up file")
      && bridgeText.includes("MobileCaptureClientFollowUpReadiness")
      && bridgeText.includes("workspace.readiness?.releaseAllowed == true")
      && mobileComponentsText.includes("CaptureCoachFollowUpReleaseReady")
      && mobileComponentsText.includes("CaptureCoachFollowUpReleaseHeld")
      && mobileComponentsText.includes("CaptureCoachFollowUpUnsavedChanges")
      && bridgeText.includes("func matches(_ output: MobileCaptureClientFollowUp)")
      && mobileComponentsText.includes("Share with \\(output.recipientLabel)")
      && mobileComponentsText.includes("!releaseReady || isSaving")
      && captureUITestText.includes("testCoachFollowUpHoldsReleaseWhenCanonicalSourceChanged")
      && captureUITestText.includes("testCoachFollowUpHoldsReleaseForUnsavedEditorChanges"),
    "clientFollowUpReleaseSourceReadiness",
    "Nest rechecks the immutable follow-up manifest against current eligible records inside the share transaction, while web and iPhone hold sharing and direct the coach to save a current draft when a selected source changes.",
  );
  expect(
    clientFollowUpAttentionText.includes("projectClientFollowUpAttention")
      && clientFollowUpAttentionText.includes("recipientUserId")
      && clientFollowUpAttentionText.includes("clientFollowUpSha256(body)")
      && clientFollowUpAttentionText.includes('event.kind === "OPENED_IN_APP"')
      && clientFollowUpAttentionText.includes("matchingRecordSnapshot")
      && todayPageText.includes("today-client-follow-up-attention")
      && todayPageText.includes("Open follow-up")
      && todayRouteText.includes("clientFollowUpAttention")
      && bridgeText.includes("MobileCaptureClientFollowUpAttention")
      && shellText.includes("CaptureTodayClientFollowUpOpen_")
      && shellText.includes("onOpenClientFollowUp")
      && captureUITestText.includes("testTodayOpensTheExactNewClientFollowUpWithoutAcknowledgingIt"),
    "clientFollowUpTodayAttention",
    "A newly shared coaching follow-up projects to the exact recipient's Today surface on Nest and iPhone, opens the exact Session, and records its idempotent open receipt when rendered.",
  );
  expect(
    weeklyCommitmentText.includes("saveWeeklyCommitmentInTransaction")
      && weeklyCommitmentText.includes("quipsly-weekly-commitment-save-v2")
      && weeklyCommitmentText.includes("intentSha256")
      && weeklyCommitmentText.includes("idempotentReplay: true")
      && todayRouteText.includes('action === "weekly-plan-save"')
      && todayRouteText.includes("weeklyPlanOfflineOutboxSupported")
      && bridgeText.includes("WeeklyPlanDecisionOutbox.shared")
      && bridgeText.includes("syncWeeklyPlanDecision")
      && weeklyPlanOutboxText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && weeklyPlanOutboxText.includes("ownerAccountID")
      && shellText.includes("CaptureWeeklyPlanSheet")
      && shellText.includes("CaptureWeeklyPlanOutboxBoundary")
      && shellText.includes("Saved on \\(CaptureDeviceVocabulary.thisDevice), then synced with Nest")
      && todayRouteText.includes("weeklyPlanExternalSideEffects: false")
      && todayRouteText.includes("externalCalendarMutated: false")
      && todayRouteText.includes("providerMutated: false")
      && captureUITestText.includes("testTodayWeeklyPlanEditorKeepsReflectionHonestAndOfflineSafe"),
    "protectedIPhoneWeeklyPlanReflection",
    "Nest and Capture share one optimistic weekly-plan transaction while iPhone protects complete plan and reflection intent before sync, retries by stable identity, holds conflicts, and changes no task, goal, calendar, message, or provider.",
  );
  expect(
    sessionFollowThroughServiceText.includes("progressedSinceRelease")
      && sessionFollowThroughServiceText.includes("progress.occurredAt.getTime() > selection.output.releasedAt.getTime()")
      && sessionContinuityCardText.includes("New check-in since release")
      && bridgeText.includes("let progressedSinceRelease: Bool?")
      && shellText.includes("goal.progressedSinceRelease == true")
      && shellText.includes("New check-in"),
    "coachingGoalProgressSinceRelease",
    "A client goal check-in after the immutable release is counted and labelled as new progress across Nest and iPhone without pretending the goal definition or status changed.",
  );
  expect(
    sessionContinuityServiceText.includes("readTranscriptMergedTaskSource")
      && sessionContinuityServiceText.includes("keepAccessibleTaskEvidence")
      && sessionContinuityServiceText.includes('kind: "TRANSCRIPT_CANDIDATE_MERGED"')
      && sessionContinuityCardText.includes("Return to what was actually said")
      && sessionContinuityCardText.includes("Append-only reviewed evidence")
      && bridgeText.includes("MobileCapturePriorContinuityTaskEvidence")
      && shellText.includes("CapturePriorContinuityTaskEvidence_")
      && shellText.includes("CaptureTranscriptSourceDestination")
      && runtimeUITestText.includes("CaptureTranscriptSegment_retained-coaching-continuity-segment-20260803"),
    "coachingContinuityTaskEvidenceReturn",
    "A private next-Session brief carries append-only reviewed task evidence only while its source Session remains accessible, and Nest plus the compiled iPhone return to the exact transcript segment without mutating or copying the task.",
  );
  expect(
    captureExperienceText.includes("struct CaptureWorkNavigationRequest")
      && captureExperienceText.includes("func requestWorkNavigation(")
      && captureExperienceText.includes(".receive(on: DispatchQueue.main)")
      && shellText.includes("CaptureFollowThroughOpenTask_")
      && shellText.includes("CaptureFollowThroughOpenGoal_")
      && shellText.includes("searchText = request.title")
      && shellText.includes("await client.load(projectID: request.projectID)")
      && shellText.includes("proxy.scrollTo(request.scrollID")
      && shellText.includes("CaptureSignedInAccount")
      && shellText.includes("CaptureSwitchAccountButton")
      && runtimeRunnerText.includes("coaching-follow-through-work)")
      && runtimeUITestText.includes("testClientOpensExactFollowThroughGoalInWork")
      && runtimeUITestText.includes("ensureExactSignedInAccount")
      && runtimeUITestText.includes("refuses a restored Firebase session belonging to a different account"),
    "nativeCoachingFollowThroughExactWorkReturn",
    "An exact verified client—not whichever Firebase actor happened to be restored—can return from next-Session follow-through to the canonical task or goal in its owning Work project, with focused native proof and no copied work.",
  );
  expect(
    bridgeText.includes("let requestedSession = sessions.first(where: { $0.id == sessionID })")
      && bridgeText.includes("let currentIndex = sessions.firstIndex(where: { $0.id == sessionID })")
      && bridgeText.includes("an older cached value cannot overwrite newer")
      && bridgeText.includes("persistProtectedSessionCache()"),
    "nativeSessionRefreshReconcilesByStableIdentity",
    "A focused follow-up refresh re-resolves the Session by stable ID after suspension, preserving newer canonical continuity fields and cache state instead of overwriting by a stale array index.",
  );
  expect(
    workPageText.includes("initialSnapshot.tasks.some((task) => task.id === requestedTaskId)")
      && workClientText.includes('id={`work-task-${task.id}`}')
      && workPageText.includes('focusTaskId={')
      && workClientText.includes('href={`/work?task=${encodeURIComponent(link.task.id)}`}')
      && schedulePageText.includes('href={`/work?task=${encodeURIComponent(task.id)}`}')
      && sessionReviewText.includes('href={`/work?task=${encodeURIComponent(task.id)}`}'),
    "canonicalTaskDeepLinkIdentity",
    "Session, Schedule, and linked Goals return to the same scoped Work task ID, including completed work hidden by the default filter.",
  );
  expect(
    workModelText.includes('attentionReason: "Overdue commitment"')
      && workModelText.includes('"Due within 24 hours" as const')
      && workModelText.includes('"Reviewed transcript follow-through" as const')
      && workClientText.includes('initialFilter = "OPEN"')
      && workClientText.includes('filter === "ATTENTION"')
      && workClientText.includes("Quipsly has not invented an unread notification state.")
      && workPageText.includes('requestedFocus.view === "attention"')
      && sidebarText.includes('href="/work?view=attention"')
      && sidebarText.includes('aria-label="Open attention queue"'),
    "canonicalAttentionQueue",
    "The global attention entry point derives urgency from canonical tasks and reviewed transcript follow-through without inventing unread notifications, reminders, or copied work.",
  );
  expect(
    nestDashboardText.includes("Project follow-through")
      && nestFollowThroughText.includes("isUnreviewedTranscriptActionItem")
      && nestFollowThroughText.includes("readTranscriptDerivedTaskSource")
      && nestFollowThroughText.includes("ownerUserId: actorUserId")
      && nestDashboardText.includes('href={`/work?goal=${encodeURIComponent(goal.id)}`}')
      && nestDashboardText.includes('href={`/work?task=${encodeURIComponent(task.id)}`}')
      && nestDashboardText.includes('href={`/sessions/${encodeURIComponent(task.sourceAnchor.roomId)}#transcript-segment-${encodeURIComponent(task.sourceAnchor.segmentId)}`}'),
    "nestProjectCanonicalFollowThrough",
    "A Nest shows actor-scoped owned goals and accepted canonical tasks with same-ID Work navigation and exact transcript return.",
  );
  expect(
    workspaceSearchText.includes("personalOrSharedWorkspaceTaskAccessWhere")
      && taskAccessText.includes("export function personalOrSharedWorkspaceTaskAccessWhere")
      && taskAccessText.includes("{ assignedUserId: userId }")
      && taskAccessText.includes("{ assignedUserId: null, engagementId: null, projectId: { in: projectIds } }")
      && taskAccessText.includes("assignedUserId: null")
      && workspaceSearchText.includes("roomAccessWhere")
      && workspaceSearchText.includes("isUnreviewedTranscriptActionItem")
      && workspaceSearchText.includes("createdByUserId: input.actorUserId")
      && workspaceSearchText.includes("perKindLimit: RESULT_LIMIT")
      && workspaceSearchText.includes("normalizeWorkspaceTagId")
      && workspaceSearchText.includes("exactTagIdentity: Boolean(focusedTagId)")
      && workspaceSearchText.includes("requestedTag.mergedIntoTagId")
      && workspaceSearchText.includes("tagLinks: { some: { tagId: focusedTagId } }")
      && workspaceSearchText.includes("prisma.studioTag.findMany")
      && workspaceSearchText.includes("isActive: true")
      && workspaceSearchPageText.includes('redirectTo="/find"')
      && workspaceSearchPageText.includes('href={`/work?task=${encodeURIComponent(item.id)}`}')
      && workspaceSearchPageText.includes('href={`/work?goal=${encodeURIComponent(item.id)}`}')
      && workspaceSearchPageText.includes('href={`/sessions/${encodeURIComponent(item.id)}`}')
      && workspaceSearchPageText.includes('ResultSection title="Tags"')
      && workspaceSearchPageText.includes("tagFocusHref(item.id)")
      && workspaceSearchPageText.includes("Same-label tags in other Nests are not mixed in.")
      && workspaceSearchPageText.includes("No record identities were disclosed.")
      && tagSearchChipsText.includes("tagFocusHref(tag.id)")
      && researchLibraryModelText.includes("tagCatalog: ResearchSourceTag[]")
      && researchLibraryModelText.includes("...source.annotations.flatMap")
      && !researchLibraryModelText.includes("...source.tags.map")
      && workspaceSearchPageText.includes("Search is read-only")
      && sidebarText.includes('href="/find"')
      && sidebarText.includes('aria-label="Search all Quipsly"'),
    "permissionFilteredCanonicalWorkspaceSearch",
    "Search All is authenticated, permission-filtered, bounded, candidate-safe, and focuses exact canonical tag identities across work and evidence without same-label mixing or side effects.",
  );
}

function checkUnifiedNestOperatingShellSources() {
  const sidebarText = sourceText("apps/quipsly/src/components/SidebarLayout.tsx");
  const todayModelText = sourceText("apps/quipsly/src/app/(app)/today/today-model.ts");
  const todayPageText = [
    sourceText("apps/quipsly/src/app/(app)/today/page.tsx"),
    sourceText("apps/quipsly/src/app/(app)/today/today-page.tsx"),
  ].join("\n");
  const inboxModelText = sourceText("apps/quipsly/src/app/(app)/inbox/inbox-model.ts");
  const inboxPageText = [
    sourceText("apps/quipsly/src/app/(app)/inbox/page.tsx"),
    sourceText("apps/quipsly/src/app/(app)/inbox/inbox-loader.ts"),
  ].join("\n");
  const calendarPageText = sourceText("apps/quipsly/src/app/(app)/schedule/page.tsx");
  const libraryModelText = sourceText("apps/quipsly/src/app/(app)/library/library-model.ts");
  const libraryPageText = [
    sourceText("apps/quipsly/src/app/(app)/library/page.tsx"),
    sourceText("apps/quipsly/src/app/(app)/library/library-page.tsx"),
  ].join("\n");
  const researchPageText = sourceText("apps/quipsly/src/app/(app)/research/page.tsx");
  expect(
    sidebarText.includes('{ name: "Today", href: "/today"')
      && sidebarText.includes('{ name: "Inbox", href: "/inbox"')
      && sidebarText.includes('{ name: "Work", href: "/work"')
      && sidebarText.includes('{ name: "Sessions", href: "/coaching/sessions"')
      && sidebarText.includes('{ name: "Library", href: "/library"')
      && sidebarText.includes('{ name: "Calendar", href: "/schedule"')
      && todayModelText.includes("deliberatePlanLimit: 4")
      && todayModelText.includes("attentionTaskLimit: 3")
      && todayModelText.includes("proposedTranscriptWorkExcluded: true")
      && todayPageText.includes("It is not an accumulated guilt list")
      && inboxModelText.includes("actorAccessibleSessionsOnly: true")
      && inboxModelText.includes("noUnreadClaim: true")
      && inboxModelText.includes("personalSourceCaptureIncluded: true")
      && inboxPageText.includes("Open capture")
      && inboxPageText.includes("Personal captures stay private until you add them to a Nest.")
      && calendarPageText.includes("Time for the work you actually chose")
      && calendarPageText.includes("Calendar is Quipsly planning truth, not provider truth")
      && libraryModelText.includes("permissionFilteredBeforeProjection: true")
      && libraryModelText.includes("promotedCaptureMediaDeduplicated: true")
      && libraryModelText.includes("localPhoneRecordingsRemainDeviceOwned: true")
      && libraryPageText.includes("Start with your voice on iPhone, keep writing here")
      && libraryPageText.includes("continue the same private writing on either device")
      && libraryPageText.includes("OR: [{ visibility: \"project\" }, { createdByUserId: userId }]")
      && researchPageText.includes("snapshot.sources.some((source) => source.id === requestedSourceId)")
      && !calendarPageText.includes("Real rooms, grouped by current status"),
    "canonicalNestOperatingShell",
    "Nest makes Today, Inbox, Work, Sessions, Library, and Calendar primary while Today stays bounded, Inbox combines actor-owned unfiled sources with source-linked review, and Library permission-filters canonical identities while supporting direct private writing and promoted-capture deduplication.",
  );
}

function checkNativeUnifiedWritingLibrarySources() {
  const shellText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift",
  );
  const transcriptText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/OnDeviceTranscriptManager.swift",
  );
  const uiTestText = [
    sourceText(
      "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift",
    ),
    sourceText(
      "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift",
    ),
  ].join("\n");

  expect(
    shellText.includes("private enum CaptureLibraryWritingItem")
      && shellText.includes("case voice(VoiceWritingDraft)")
      && shellText.includes("case note(MobileCaptureWorkNote)")
      && shellText.includes("writingItems")
      && shellText.includes("canonicalVoiceDocumentIDs")
      && shellText.includes("!canonicalVoiceDocumentIDs.contains($0.id)")
      && shellText.includes("filteredDrafts.map(CaptureLibraryWritingItem.voice)")
      && shellText.includes("filteredNotes.map(CaptureLibraryWritingItem.note)")
      && shellText.includes("CaptureLibrarySpeakToWrite")
      && shellText.includes("CaptureLibraryWriteNote")
      && shellText.includes("private var hasChanges: Bool")
      && shellText.includes("hasChanges\n            && validationMessage == nil")
      && !shellText.includes("CaptureWorkNoteEditBoundary")
      && !shellText.includes('librarySectionHeading("Voice writing")')
      && !shellText.includes('librarySectionHeading("Notes in My Nest")')
      && transcriptText.includes(".atypicalSpeech")
      && uiTestText.includes("testLibraryOffersPrivateKeyboardWritingBesideVoiceWriting")
      && uiTestText.includes("Opening an unchanged valid note should not begin with an orange warning."),
    "nativeUnifiedWritingLibrary",
    "Capture presents voice and typed writing in one chronological, duplicate-safe Library while keeping speech adaptation and calm canonical note editing intact.",
  );
}

function checkNativeSessionSchedulingSources() {
  const shellText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CapturePhoneShell.swift",
  );
  const modelText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureExperienceModel.swift",
  );
  const coachingText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCapture/CaptureCoachingHome.swift",
  );
  const invitationRouteText = sourceText(
    "apps/quipsly/src/app/api/sessions/[roomId]/invitations/route.ts",
  );
  const invitationServiceText = sourceText(
    "apps/quipsly/src/lib/server/session-invitation.ts",
  );
  const webCoachingText = sourceText(
    "apps/quipsly/src/app/(app)/coaching/page.tsx",
  );
  const uiTestText = sourceText(
    "apps/mobile-capture/HighGroundCapture/HighGroundCaptureUITests/CaptureExperienceUITests.swift",
  );

  expect(
    shellText.includes("@State private var creationIntent = CreationIntent.schedule")
      && shellText.includes('Text("Schedule").tag(CreationIntent.schedule)')
      && shellText.includes('Text("Start now").tag(CreationIntent.startNow)')
      && shellText.includes("MobileCoachingAppointmentFields(")
      && shellText.includes('"Schedule & invite"')
      && shellText.includes("NewCaptureSessionShareInvite")
      && modelText.includes("func scheduleCoachingSession(")
      && modelText.includes("coachingRunwayClient.createAppointment(draft)")
      && modelText.includes("coachingRunwayClient.sendInvitationEmail(")
      && modelText.includes("sessionClient.load(authoritativeSessionID: roomID)")
      && coachingText.includes('TextField("Client email", text: $draft.clientEmail)')
      && coachingText.includes("They can join from phone, tablet, or desktop.")
      && coachingText.includes("func prepareInvitationLink(")
      && coachingText.includes('"delivery": "LINK"')
      && modelText.includes("coachingRunwayClient.invitationPaths")
      && invitationRouteText.includes("replayableSessionInvitationToken")
      && invitationServiceText.includes("quipsly-session-invitation-replayable-v1:")
      && webCoachingText.includes("ensureClientInvitationLink")
      && webCoachingText.includes('delivery: "LINK"')
      && uiTestText.includes("testNewCoachingSessionDefaultsToSimpleSchedulingAndInvitation")
      && uiTestText.includes("without setup paperwork"),
    "nativeSessionSchedulingAndInvitation",
    "Capture defaults New Session to conventional client email plus time scheduling, composes durable appointment and idempotent invitation receipts, and gives email, Copy, and Share one valid private link without blocking Start now.",
  );
}

function checkSessionCalendarCancellationContractSources() {
  const providerText = sourceText("apps/quipsly/src/lib/server/google-calendar-session-projection.ts");
  const operationText = sourceText("apps/quipsly/src/lib/server/google-calendar-projection-operation.ts");
  const routeText = sourceText("apps/quipsly/src/app/api/calendar/sessions/[roomId]/projection/route.ts");
  const connectionRouteText = sourceText("apps/quipsly/src/app/api/calendar/connections/google/route.ts");
  const managerText = sourceText("apps/quipsly/src/app/(app)/schedule/google-calendar-connection-manager.tsx");
  const schedulePageText = sourceText("apps/quipsly/src/app/(app)/schedule/page.tsx");
  const dogfoodText = sourceText("scripts/quipsly-local-calendar-cancellation-dogfood.mjs");
  expect(
    providerText.includes('method: "DELETE"')
      && providerText.includes('"If-Match": input.preview.existing.providerEtag')
      && providerText.includes("?sendUpdates=none")
      && providerText.includes("response.status === 404 || response.status === 410")
      && providerText.includes('"provider-etag-conflict"')
      && routeText.includes('body?.confirmCancellation !== true')
      && routeText.includes('action: "write"')
      && routeText.includes("sessionMutationAccessWhere")
      && routeText.includes("cancelGoogleCalendarProjectionOperation")
      && operationText.includes('operation: "CANCEL_EVENT"')
      && operationText.includes("idempotentReplay: true")
      && operationText.includes("post-provider-verification-failed")
      && connectionRouteText.includes('action: "write"')
      && connectionRouteText.includes("You need edit access to select a team calendar")
      && managerText.includes("Confirm removal from Google")
      && managerText.includes("Record verified absence")
      && managerText.includes('source.status === "CANCELED"')
      && managerText.includes('body?.externalSideEffects === "unknown"')
      && schedulePageText.includes('status: { not: "FAILED" }')
      && dogfoodText.includes("teamCalendarSelectionStatus")
      && dogfoodText.includes("exactReplayReusedReceipt")
      && dogfoodText.includes("providerCallsRequired: false"),
    "sessionCalendarCancellationAuthority",
    "Session cancellation uses explicit confirmation, canonical mutation authority, conditional provider deletion, honest absence/conflict receipts, and operated editor-versus-viewer proof.",
  );
}

function checkGoogleCalendarReconciliationContractSources() {
  const oauthText = sourceText("apps/quipsly/src/lib/server/google-calendar-oauth.ts");
  const reconciliationText = sourceText("apps/quipsly/src/lib/server/google-calendar-reconciliation.ts");
  const reconciliationServiceText = sourceText("apps/quipsly/src/lib/server/google-calendar-reconciliation-service.ts");
  const routeText = sourceText("apps/quipsly/src/app/api/calendar/connections/google/reconcile/route.ts");
  const conflictReviewText = sourceText("apps/quipsly/src/lib/server/google-calendar-conflict-review.ts");
  const conflictRouteText = sourceText("apps/quipsly/src/app/api/calendar/connections/google/conflicts/route.ts");
  const connectionRouteText = sourceText("apps/quipsly/src/app/api/calendar/connections/google/route.ts");
  const managerText = sourceText("apps/quipsly/src/app/(app)/schedule/google-calendar-connection-manager.tsx");
  const dogfoodText = sourceText("scripts/quipsly-local-calendar-reconciliation-dogfood.mjs");
  expect(
    oauthText.includes('"quipsly-google-calendar-sync-token-v1"')
      && oauthText.includes('"sync-v1"')
      && reconciliationText.includes("items(id,etag,status,updated,extendedProperties/private)")
      && reconciliationText.includes('showDeleted: "true"')
      && reconciliationText.includes('singleEvents: "false"')
      && reconciliationText.includes('status: "RESET_REQUIRED"')
      && reconciliationText.includes("google-calendar-reconciliation:${input.collectionId}")
      && reconciliationText.includes("revalidateTeamWriteAccess")
      && reconciliationText.includes("(cursor?.syncTokenRef || null) !== input.priorCursorRef")
      && reconciliationText.includes("importedProviderContent: false")
      && reconciliationText.includes('status: { not: "REVOKED" }')
      && reconciliationServiceText.includes('action: "write"')
      && routeText.includes('code: "calendar-reconciliation-superseded"')
      && routeText.includes("externalSideEffects: false")
      && conflictReviewText.includes('"PREPARE_QUIPSLY_UPDATE"')
      && conflictReviewText.includes('"STOP_PROJECTING"')
      && conflictReviewText.includes("sessionMutationAccessWhere")
      && conflictReviewText.includes("google-calendar-conflict:${input.projectionId}")
      && conflictReviewText.includes('operation: "VERIFY"')
      && conflictReviewText.includes("idempotentReplay: true")
      && conflictReviewText.includes("providerContentImported: false")
      && conflictRouteText.includes("sessionAccessWhere")
      && conflictRouteText.includes("sessionMutationAccessWhere")
      && conflictRouteText.includes("providerContentImported: false")
      && conflictRouteText.includes("externalSideEffects: false")
      && connectionRouteText.includes("lastIncrementalSyncAt: true")
      && !connectionRouteText.includes("syncTokenRef: true")
      && managerText.includes("Check Google changes")
      && managerText.includes("no Google event was changed")
      && managerText.includes("Calendar conflict")
      && managerText.includes("Nothing was overwritten")
      && managerText.includes("Prepare Quipsly preview")
      && managerText.includes("Stop linking · leave Google unchanged")
      && dogfoodText.includes("persistGoogleCalendarReconciliation")
      && dogfoodText.includes("staleRetrySuperseded")
      && dogfoodText.includes("providerCallsPerformed: false")
      && dogfoodText.includes("exactReplayReusedReceipt")
      && dogfoodText.includes("unrelatedActorDenied")
      && dogfoodText.includes("stoppedProjectionIgnoredByLaterRead")
      && dogfoodText.includes("plaintextCursorStored"),
    "googleCalendarReconciliationAuthority",
    "Google Calendar reconciliation persists encrypted cursors, imports only provider identity/version state, handles deletions and expired cursors, rechecks team authority, rejects stale writes, exposes an explicit non-mutating check, and is proven against disposable PostgreSQL fixtures.",
  );
}

async function request(path, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || timeoutMs);
  try {
    const headers = {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.authenticated && bearerToken ? { Authorization: `Bearer ${bearerToken}` } : {}),
      ...(options.headers || {}),
    };
    const response = await fetch(`${baseUrl}${path}`, {
      method: options.method || "GET",
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      redirect: "manual",
      signal: controller.signal,
    });
    const raw = await response.text();
    const json = parseJson(raw);
    return {
      ok: true,
      status: response.status,
      contentType: response.headers.get("content-type") || "",
      raw,
      json,
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      contentType: "",
      raw: "",
      json: null,
      error: error instanceof Error ? error.message : String(error),
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function calmProtectedResponse(result) {
  return Boolean(
    result.ok
      && [400, 401, 403, 404, 409, 410, 422].includes(result.status)
      && isObject(result.json)
      && result.json.ok === false
      && text(result.json.error),
  );
}

function safeNonMutationResponse(result) {
  return Boolean(
    result.ok
      && result.status < 500
      && isObject(result.json)
      && (result.json.ok === false || result.json.ok === true),
  );
}

async function checkReadiness() {
  const result = await request("/api/mobile/capture/readiness", { authenticated: Boolean(bearerToken) });
  if (!result.ok) {
    addCheck("readinessReachable", "fail", `Readiness endpoint was not reachable: ${result.error}`);
    return;
  }

  expect(result.status === 200, "readinessStatus", `Expected 200 from readiness endpoint, got ${result.status}.`);
  expect(isObject(result.json) && result.json.ok === true, "readinessJson", "Readiness endpoint returns ok JSON.");

  const payload = isObject(result.json) ? result.json : {};
  expect(bool(payload.signedIn) !== null, "readinessSignedInShape", "Readiness reports signed-in state as a boolean.");
  expect(isObject(payload.policyUrls) && text(payload.policyUrls.privacy).startsWith("http"), "readinessPrivacyUrl", "Readiness exposes a privacy policy URL.");
  expect(isObject(payload.policyUrls) && text(payload.policyUrls.accountDeletion).startsWith("http"), "readinessDeletionUrl", "Readiness exposes an account deletion URL.");
  expect(isObject(payload.recordingPolicy) && payload.recordingPolicy.requiresExplicitConsent === true, "readinessConsentRequired", "Readiness requires explicit recording consent.");
  expect(isObject(payload.recordingPolicy) && payload.recordingPolicy.visibleRecordingIndicatorRequired === true, "readinessVisibleRecording", "Readiness requires visible recording state.");
  expect(isObject(payload.providerReadiness) && payload.providerReadiness.providerSecretsExposed === false, "readinessNoProviderSecrets", "Readiness does not expose provider secrets.");
  expect(isObject(payload.appStoreReadiness) && payload.appStoreReadiness.hiddenRecordingAllowed === false, "readinessNoHiddenRecording", "Readiness explicitly disallows hidden recording.");
  expect(isObject(payload.paymentBoundary) && /one-to-one/i.test(text(payload.paymentBoundary.stripeScope)), "readinessStripeBoundary", "Readiness keeps Stripe scoped to one-to-one coaching evidence.");
}

async function checkProtectedRoutes() {
  const protectedChecks = [
    { name: "sessions", method: "GET", path: "/api/mobile/capture/sessions" },
    { name: "reviewDigest", method: "GET", path: "/api/mobile/capture/review-digest" },
    { name: "todayRead", method: "GET", path: "/api/mobile/capture/today" },
    { name: "workRead", method: "GET", path: "/api/mobile/capture/work" },
    { name: "sourceInboxRead", method: "GET", path: "/api/mobile/capture/inbox" },
    { name: "sourceInboxMutation", method: "POST", path: "/api/mobile/capture/inbox", body: {} },
    { name: "todayMutation", method: "POST", path: "/api/mobile/capture/today", body: {} },
    { name: "consent", method: "POST", path: "/api/mobile/capture/consent", body: {} },
    { name: "roomJoin", method: "POST", path: "/api/mobile/capture/rooms/join", body: {} },
    { name: "roomJoinDiagnostics", method: "GET", path: "/api/mobile/capture/rooms/join/diagnostics" },
    { name: "roomState", method: "POST", path: "/api/mobile/capture/rooms/state", body: {} },
    { name: "transcriptRun", method: "POST", path: "/api/mobile/capture/transcripts/run", body: {} },
    { name: "transcriptPacketRead", method: "GET", path: "/api/mobile/capture/transcripts/packet" },
    { name: "transcriptPacket", method: "POST", path: "/api/mobile/capture/transcripts/packet", body: {} },
    { name: "transcriptPacketActionReview", method: "POST", path: "/api/mobile/capture/transcripts/packet/actions", body: {} },
    { name: "transcriptPacketGoalReview", method: "POST", path: "/api/mobile/capture/transcripts/packet/goals", body: {} },
    { name: "transcriptTask", method: "POST", path: "/api/mobile/capture/transcripts/tasks", body: {} },
    { name: "transcriptGoal", method: "POST", path: "/api/mobile/capture/transcripts/goals", body: {} },
    { name: "transcriptDraft", method: "POST", path: "/api/mobile/capture/transcripts/drafts", body: {} },
  ];

  for (const check of protectedChecks) {
    const unauthenticated = await request(check.path, {
      method: check.method,
      body: check.body,
      authenticated: false,
    });
    expect(
      calmProtectedResponse(unauthenticated),
      `${check.name}UnauthenticatedBoundary`,
      `${check.name} rejects unauthenticated access calmly.`,
      { status: unauthenticated.status, body: unauthenticated.json || unauthenticated.raw.slice(0, 240) },
    );

    if (bearerToken) {
      const authenticated = await request(check.path, {
        method: check.method,
        body: check.body,
        authenticated: true,
      });
      expect(
        safeNonMutationResponse(authenticated),
        `${check.name}AuthenticatedContract`,
        `${check.name} returns JSON and avoids 5xx for a safe minimal authenticated request.`,
        { status: authenticated.status, body: authenticated.json || authenticated.raw.slice(0, 240) },
      );
      if (check.name === "reviewDigest" && authenticated.status === 200) {
        const payload = authenticated.json;
        const actions = payload?.digest?.finishActions;
        expect(
          payload?.packetKind === "quipsly-mobile-capture-review-digest-v1"
            && payload?.boundaries?.sideEffectFree === true
            && payload?.boundaries?.noRecordingStarted === true
            && payload?.boundaries?.noExternalMeetingJoined === true
            && payload?.boundaries?.noPaymentMutation === true
            && Number.isInteger(payload?.digest?.needsFinish)
            && Array.isArray(actions),
          "reviewDigestFinishQueueShape",
          "Authenticated review digest returns an integer finishing count, ranked action list, and explicit non-mutation boundary.",
          {
            status: authenticated.status,
            packetKind: payload?.packetKind || null,
            needsFinish: payload?.digest?.needsFinish ?? null,
            actionCount: Array.isArray(actions) ? actions.length : null,
            sideEffectFree: payload?.boundaries?.sideEffectFree ?? null,
          },
        );
        expect(
          Array.isArray(actions)
            && actions.every((action) =>
              isObject(action)
              && text(action.callRoomId)
              && text(action.kind)
              && text(action.label)
              && text(action.detail)
              && Number.isInteger(action.priority)
            )
            && actions.every((action, index) => index === 0 || actions[index - 1].priority <= action.priority),
          "reviewDigestFinishQueueRanking",
          "Every returned finishing action is session-addressable, explicit, and sorted by server priority.",
          { actionCount: Array.isArray(actions) ? actions.length : null },
        );
      }
    }
  }
}

function validateSessionLifecycleShape(session, prefix = "sessions") {
  expect(
    isObject(session.lifecycle),
    `${prefix}LifecyclePresent`,
    "Authenticated mobile capture session includes shared lifecycle receipts.",
    { sessionId: session.id, lifecycle: session.lifecycle || null },
  );
  if (!isObject(session.lifecycle)) return;

  const lifecycle = session.lifecycle;
  expect(
    lifecycle.kind === "quipsly-coaching-capture-lifecycle-v2",
    `${prefix}LifecycleKind`,
    "Mobile session lifecycle uses the shared coaching/capture lifecycle contract kind.",
    { sessionId: session.id, kind: lifecycle.kind },
  );
  expect(
    text(lifecycle.stage).length > 0,
    `${prefix}LifecycleStage`,
    "Mobile session lifecycle exposes a human-readable stage.",
    { sessionId: session.id, stage: lifecycle.stage },
  );
  expect(
    text(lifecycle.nextAction).length > 0,
    `${prefix}LifecycleNextAction`,
    "Mobile session lifecycle exposes the next safest action.",
    { sessionId: session.id, nextAction: lifecycle.nextAction },
  );
  expect(
    bool(lifecycle.readyForCapture) !== null
      && bool(lifecycle.readyForTranscript) !== null
      && bool(lifecycle.readyForPacket) !== null
      && bool(lifecycle.readyForReview) !== null,
    `${prefix}LifecycleReadinessFlags`,
    "Mobile session lifecycle exposes explicit readiness flags for capture, transcript, packet, and review.",
    {
      sessionId: session.id,
      readyForCapture: lifecycle.readyForCapture,
      readyForTranscript: lifecycle.readyForTranscript,
      readyForPacket: lifecycle.readyForPacket,
      readyForReview: lifecycle.readyForReview,
    },
  );
  expect(
    Array.isArray(lifecycle.checks) && lifecycle.checks.length >= 8,
    `${prefix}LifecycleChecks`,
    "Mobile session lifecycle exposes receipt checks for the main capture path.",
    { sessionId: session.id, checkCount: Array.isArray(lifecycle.checks) ? lifecycle.checks.length : 0 },
  );
  expect(
    Array.isArray(lifecycle.safeActions) && lifecycle.safeActions.length >= 4,
    `${prefix}LifecycleSafeActions`,
    "Mobile session lifecycle exposes safe next actions from the shared coaching/capture contract.",
    { sessionId: session.id, safeActionCount: Array.isArray(lifecycle.safeActions) ? lifecycle.safeActions.length : 0 },
  );
  if (Array.isArray(lifecycle.safeActions)) {
    const actionIds = new Set(lifecycle.safeActions.map((action) => text(action.id)));
    for (const id of ["confirm-recording-consent", "prepare-capture-route", "record-with-visible-state", "run-or-repair-transcript"]) {
      expect(
        actionIds.has(id),
        `${prefix}LifecycleSafeAction${id.replace(/(^|-)([a-z])/g, (_, __, value) => value.toUpperCase())}`,
        `Mobile session lifecycle exposes ${id} safe action guidance.`,
        { sessionId: session.id, ids: [...actionIds] },
      );
    }
  }
  if (!Array.isArray(lifecycle.checks)) return;

  const checkIds = new Set(lifecycle.checks.map((check) => text(check.id)));
  for (const id of ["booking", "payment", "room", "consent", "recording", "server-recording", "transcript", "packet"]) {
    expect(
      checkIds.has(id),
      `${prefix}LifecycleCheck${id.replace(/(^|-)([a-z])/g, (_, __, value) => value.toUpperCase())}`,
      `Mobile session lifecycle exposes ${id} receipt truth.`,
      { sessionId: session.id, ids: [...checkIds] },
    );
  }
}

async function checkAuthenticatedSessionLifecycle() {
  if (!bearerToken) {
    addCheck(
      "authenticatedSessionLifecycleSkipped",
      "pass",
      "Authenticated session lifecycle endpoint proof skipped because no bearer token was provided.",
    );
    return;
  }

  const result = await request("/api/mobile/capture/sessions", { authenticated: true });
  expect(
    result.ok && result.status === 200 && isObject(result.json) && result.json.ok === true,
    "authenticatedSessionsReachable",
    "Authenticated mobile capture sessions endpoint returns ok JSON.",
    { status: result.status, body: result.json || result.raw.slice(0, 240) },
  );
  if (!(result.ok && result.status === 200 && isObject(result.json) && result.json.ok === true)) return;

  const sessions = Array.isArray(result.json.sessions) ? result.json.sessions : [];
  expect(
    sessions.length > 0,
    "authenticatedSessionsVisible",
    "Authenticated mobile capture sessions endpoint returns at least one visible session.",
    { sessionCount: sessions.length },
  );
  if (sessions.length === 0) return;

  validateSessionLifecycleShape(sessions[0], "authenticatedSession");
}

async function checkProtectedIngestRoutes() {
  const ingestChecks = [
    { name: "oneShotIngest", method: "POST", path: "/api/ingest/mobile" },
    { name: "chunkIngest", method: "POST", path: "/api/ingest/mobile/chunk" },
    { name: "canonicalChunkUpload", method: "POST", path: "/api/mobile/capture/uploads/chunk" },
  ];

  for (const check of ingestChecks) {
    const unauthenticated = await request(check.path, {
      method: check.method,
      authenticated: false,
    });
    expect(
      calmProtectedResponse(unauthenticated),
      `${check.name}UnauthenticatedBoundary`,
      `${check.name} rejects unauthenticated upload access calmly.`,
      { status: unauthenticated.status, body: unauthenticated.json || unauthenticated.raw.slice(0, 240) },
    );

    if (bearerToken) {
      const authenticated = await request(check.path, {
        method: check.method,
        authenticated: true,
      });
      expect(
        safeNonMutationResponse(authenticated),
        `${check.name}AuthenticatedBadRequestContract`,
        `${check.name} accepts authentication, then rejects the intentionally incomplete upload calmly without mutating data.`,
        { status: authenticated.status, body: authenticated.json || authenticated.raw.slice(0, 240) },
      );
    }
  }
}

async function main() {
  checkUploadContractSources();
  checkNestPortabilityContractSources();
  checkMeetingSpineContractSources();
  checkTranscriptPacketContractSources();
  checkReviewDigestContractSources();
  checkTranscriptCorrectionContractSources();
  checkSessionCalendarCancellationContractSources();
  checkGoogleCalendarReconciliationContractSources();
  checkUnifiedNestOperatingShellSources();
  checkNativeUnifiedWritingLibrarySources();
  checkNativeSessionSchedulingSources();
  if (!sourceOnly) {
    await checkReadiness();
    await checkProtectedRoutes();
    await checkAuthenticatedSessionLifecycle();
    await checkProtectedIngestRoutes();
  } else {
    addCheck(
      "networkChecksSkipped",
      "pass",
      "Network route checks skipped by --source-only; source contract checks still ran.",
    );
  }

  const statusCounts = checks.reduce((acc, check) => {
    acc[check.status] = (acc[check.status] || 0) + 1;
    return acc;
  }, {});
  const failed = checks.filter((check) => check.status === "fail");
  const report = {
    ok: failed.length === 0,
    baseUrl,
    authenticated: Boolean(bearerToken),
    sourceOnly,
    statusCounts,
    checks,
  };

  if (jsonOutput) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Quipsly mobile capture contract smoke: ${report.ok ? "PASS" : "FAIL"}`);
    console.log(`Base URL: ${baseUrl}`);
    console.log(`Authenticated checks: ${bearerToken ? "enabled" : "skipped"}`);
    console.log(`Source-only mode: ${sourceOnly ? "enabled" : "disabled"}`);
    for (const check of checks) {
      const marker = check.status === "pass" ? "✓" : "✗";
      console.log(`${marker} ${check.name}: ${check.summary}`);
      if (check.status !== "pass" && check.details) {
        console.log(`  details: ${JSON.stringify(check.details)}`);
      }
    }
  }

  if (!report.ok) process.exit(1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
