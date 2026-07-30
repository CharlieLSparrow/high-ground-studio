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
  const providerRoomText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/ProviderRoomController.swift");
  const liveKitEgressText = sourceText("apps/quipsly/src/lib/server/coaching-livekit-egress.ts");

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
      && liveKitEgressText.includes("MEDIA_VAULT_BUCKET_ENV_NAMES")
      && liveKitEgressText.includes("MEDIA_VAULT_PREFIXES.livekitRecording")
      && liveKitEgressText.includes("LIVEKIT_EGRESS_ENABLED")
      && liveKitEgressText.includes("egressRequested && unsafeLocalOverride")
      && liveKitEgressText.includes("productionStartInterlock")
      && liveKitEgressText.includes("durableCommandLedgerImplemented: false")
      && liveKitEgressText.includes("CallRoom, RecordingAsset, TranscriptJob, packets, and receipts own meaning"),
    "liveKitEgressUsesSharedMediaVaultReadiness",
    "LiveKit provider recording readiness uses the shared media-vault bucket policy and an explicit operator-enabled start gate.",
  );
  expect(
    bridgeText.includes("liveKitEgressStartEnabled")
      && bridgeText.includes("providerEgressLabel")
      && bridgeText.includes("Configured, but held until LIVEKIT_EGRESS_ENABLED=true. Joining is not recording.")
      && componentsText.includes("readiness.providerEgressLabel")
      && componentsText.includes("readiness.providerReadiness?.sourceOfTruth"),
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
      && componentsText.includes("CallKitBoundaryCard")
      && componentsText.includes("CallKit makes a Quipsly-owned room feel native on iPhone")
      && componentsText.includes("CallKit can present or end the live room, but it never creates recording evidence by itself.")
      && componentsText.includes("not phone/FaceTime")
      && componentsText.includes("join not recording")
      && componentsText.includes("Nest CallRoom truth"),
    "nativeCallKitPresentationBoundary",
    "Native Capture protects CallKit as iPhone presentation for a Quipsly-owned room, never as recording, consent, transcript, or packet truth.",
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
      && sessionsRouteText.includes("status: \"REQUESTED\"")
      && sessionsRouteText.includes("canRecordAudio: false")
      && sessionsRouteText.includes("canRecordVideo: false")
      && sessionsRouteText.includes("canTranscribe: false")
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
      && bridgeText.includes("func createQuickSession(title: String, purpose: String, provider: String = \"livekit\")")
      && componentsText.includes("QuickCaptureSessionCreator")
      && componentsText.includes("CaptureWorkflowMapCard")
      && componentsText.includes("Create session")
      && componentsText.includes("Grant consent")
      && componentsText.includes("Record locally")
      && componentsText.includes("Build packet")
      && componentsText.includes("joining a room is not recording")
      && componentsText.includes("Create Quipsly session")
      && componentsText.includes("quickSessionPurpose")
      && componentsText.includes("createQuickCaptureSession()"),
    "nativeCaptureCanCreateSafeQuickSession",
    "Native Capture exposes a first-class create-session action before recording consent and recording controls.",
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
      && componentsText.includes("MobileCaptureContentReadiness")
      && componentsText.includes("Proof only"),
    "capturePlumbingDoesNotImplyProductionContent",
    "Nest and native Capture distinguish receipt/upload plumbing from substantial non-simulator source content without changing consent or processing gates.",
  );
  expect(
    lifecycleText.includes("QUIPSLY_COACHING_LIFECYCLE_KIND")
      && lifecycleText.includes("quipsly-coaching-capture-lifecycle-v1")
      && lifecycleText.includes("Publication receipt")
      && lifecycleText.includes("Server recording receipt")
      && lifecycleText.includes("safeActions")
      && lifecycleText.includes("confirm-recording-consent")
      && lifecycleText.includes("readyForCapture")
      && lifecycleText.includes("readyForPacket"),
    "sharedCoachingLifecycleContract",
    "Coaching capture exposes shared receipt checks and safe next actions for web, mobile, and native surfaces.",
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
    componentsText.includes("struct MobileCaptureJourneyCard")
      && componentsText.includes("MobileCaptureJourneyCard(session:")
      && componentsText.includes("accessibilityIdentifier(\"MobileCaptureJourneyCard\")"),
    "nativeCaptureShowsJourneySummary",
    "Native capture UI shows the journey summary beside readiness and safety state.",
  );
  expect(
    componentsText.includes("struct ProviderRecordingCard")
      && componentsText.includes("ProviderRecordingCard(")
      && componentsText.includes("onPrepareProviderRecording")
      && componentsText.includes("Prepare receipt slot")
      && componentsText.includes("Provider recording is separate from joining the live room")
      && componentsText.includes("Nest has receipt/start/stop/reconcile routes")
      && componentsText.includes("start and stop stay explicit and operator-gated")
      && componentsText.includes("accessibilityIdentifier(\"ProviderRecordingCard\")"),
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
      && componentsText.includes("prepareProviderRecordingReceiptSlot()"),
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
  const packetBuilderText = sourceText("apps/quipsly/src/lib/server/coaching-packets.ts");
  const coachingPacketDomainText = sourceText("packages/quipsly-domain/src/coaching-packet.ts");
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
      && transcriptRunnerText.includes("Provider recording receipt slots are not transcript media.")
      && transcriptRunRouteText.includes("provider-recording-receipt-slot")
      && transcriptRunnerText.includes("provider-recording-receipt-slot"),
    "transcriptRejectsProviderReceiptSlots",
    "Transcript creation and execution reject provider receipt slots because receipt evidence is not playable/transcribable media.",
  );
  expect(
    transcriptRunnerText.includes("Recording asset is not uploaded or verified yet.")
      && transcriptRunnerText.includes("Recording asset does not have a durable storage object path.")
      && transcriptRunnerText.includes("readMobileCaptureObjectBytes")
      && transcriptRunnerText.includes("Recording asset is too large for the route runner. Use a background worker.")
      && transcriptRunnerText.includes("DEEPGRAM_API_KEY is not configured.")
      && transcriptRunnerText.includes("diarize")
      && transcriptRunnerText.includes("utterances")
      && !transcriptRunnerText.includes("transcriptSegment.deleteMany")
      && transcriptRunnerText.includes("transcriptSegment.createMany")
      && transcriptRunnerText.includes("source: \"capture-transcript-runner\""),
    "transcriptRunnerEvidenceBoundary",
    "Transcript runner only runs on verified/uploaded durable recordings, reads through the capture-storage boundary, diarizes provider output, and appends speaker/time segments as evidence.",
  );
  expect(
    transcriptRunnerText.includes("transcriptRetryDisposition")
      && transcriptRunnerText.includes("TRANSCRIPT_VERSION_IMMUTABLE")
      && transcriptRunnerText.includes("job.segments.length > 0")
      && transcriptRunnerText.includes("derived work may reference")
      && transcriptRunRouteText.includes("CREATE_VERSION")
      && transcriptRunRouteText.includes("versionedFromTranscriptJobId")
      && transcriptRunRouteText.includes("immutablePriorSegmentCount"),
    "transcriptRerunVersionsImmutableEvidence",
    "A transcript rerun creates a new job whenever provider segments already exist, preserving segment IDs held by tasks, corrections, Schedule, Today, and Studio evidence.",
  );
  expect(
    packetRouteText.includes("Sign in before reading a coaching packet.")
      && packetRouteText.includes("Sign in before building a coaching packet.")
      && packetRouteText.includes("quipsly-mobile-capture-transcript-packet-v1")
      && packetRouteText.includes("Choose a capture room or transcript job before reading a coaching packet.")
      && packetRouteText.includes("Choose a transcript job before building a coaching packet.")
      && packetRouteText.includes("You do not have access to this coaching packet.")
      && packetRouteText.includes("You do not have access to this transcript job.")
      && packetRouteText.includes("recordingSourceTruth")
      && packetRouteText.includes("Transcript segments are derived evidence")
      && packetRouteText.includes("safeActions")
      && packetRouteText.includes("build-review-packet")
      && packetRouteText.includes("review-packet")
      && packetRouteText.includes("READY_FOR_REVIEW")
      && packetRouteText.includes("PACKET_READY_TO_BUILD")
      && packetRouteText.includes("Build a packet from the completed transcript.")
      && packetRouteText.includes("reviewLanes")
      && packetRouteText.includes("client-follow-up")
      && packetRouteText.includes("podcast-production")
      && packetRouteText.includes("humanApprovalRequired")
      && packetRouteText.includes("export async function PATCH")
      && packetRouteText.includes("Sign in before reviewing a packet lane.")
      && packetRouteText.includes("APPROVED_FOR_INTERNAL_USE")
      && packetRouteText.includes("NEEDS_REVISION")
      && packetRouteText.includes("REJECTED_BY_HUMAN")
      && packetRouteText.includes("packetLaneReviewMutation")
      && packetRouteText.includes("noExternalMutation: true")
      && packetRouteText.includes("noClientDelivery: true")
      && packetRouteText.includes("noTaskAssignment: true"),
    "coachingPacketRouteReviewBoundary",
    "Coaching packet route is authenticated, room-scoped, and exposes next-action states plus review lanes and app-owned human review state without external side effects.",
  );
  expect(
    packetBuilderText.includes("Transcript must be completed before building a coaching packet.")
      && packetBuilderText.includes("Transcript has no segments to turn into a coaching packet.")
      && packetBuilderText.includes("kind: \"SUMMARY\"")
      && packetBuilderText.includes("kind: \"HIGHLIGHT\"")
      && !packetBuilderText.includes("actionItem.create")
      && packetBuilderText.includes("TRANSCRIPT_ACTION_CANDIDATE_KIND")
      && coachingPacketDomainText.includes('TRANSCRIPT_ACTION_CANDIDATE_KIND =')
      && coachingPacketDomainText.includes('"quipsly-transcript-action-candidate-v1"')
      && packetBuilderText.includes("actionCandidates")
      && packetBuilderText.includes("actionCandidateReviewBoundary")
      && coachingPacketDomainText.includes('TRANSCRIPT_PACKET_SOURCE = "transcript-packet-builder"')
      && packetBuilderText.includes("source: TRANSCRIPT_PACKET_SOURCE")
      && packetBuilderText.includes("buildTranscriptPacketBrief")
      && packetBuilderText.includes("packetBrief")
      && packetBuilderText.includes("deterministic: true")
      && packetBuilderText.includes("reviewRequired: true")
      && packetBuilderText.includes("reusedExistingPacket")
      && packetBuilderText.includes("buildTranscriptPacketReviewLanes")
      && packetBuilderText.includes("quote-candidates")
      && packetBuilderText.includes("article-seeds")
      && packetBuilderText.includes("next-session-prep")
      && packetBuilderText.includes("humanApprovalRequired: true")
      && packetBuilderText.includes("externalSideEffects: false"),
    "coachingPacketBuilderProvenance",
    "Packet builder requires a completed segmented transcript and produces review-required summary, highlight, quarantined action-candidate, and multi-lane follow-up evidence without creating open work.",
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
      && digestRouteText.includes("blockers")
      && digestRouteText.includes("nextActions"),
    "mobileCaptureReviewDigestShape",
    "Mobile capture review digest separates capture-pipeline proof from substantial non-simulator content while summarizing readiness, blockers, and next actions.",
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
      && bridgeText.includes("final class CaptureReviewDigestClient")
      && bridgeText.includes("/api/mobile/capture/review-digest")
      && bridgeText.includes("Review only: no recording, meeting, payment, or publish side effects."),
    "nativeReviewDigestDecodesPacket",
    "Native capture decodes the authenticated review digest, per-session action packets, shared lifecycle safe actions, and side-effect-free boundary in app language.",
  );
  expect(
    componentsText.includes("struct MobileCaptureReviewDigestPanel")
      && componentsText.includes("CaptureReviewDigestClient")
      && componentsText.includes("Most common blockers")
      && componentsText.includes("Next safe actions")
      && componentsText.includes("Action packets")
      && componentsText.includes("struct MobileCaptureActionPacketCard")
      && componentsText.includes("MobileCaptureActionPacketCard(session:")
      && componentsText.includes("Provider recording is not started by joining")
      && componentsText.includes("Safe next actions")
      && componentsText.includes("Action boundary:")
      && componentsText.includes("Room state evidence")
      && componentsText.includes("RoomStateEvidenceCard")
      && componentsText.includes("Transcript evidence")
      && componentsText.includes("TranscriptRunEvidenceCard")
      && componentsText.includes("Packet truth")
      && componentsText.includes("MobileCapturePacketTruthPanel")
      && componentsText.includes("Review lanes")
      && componentsText.includes("MobileCapturePacketReviewLaneRow")
      && componentsText.includes("MobileCapturePacketReviewLaneControls")
      && componentsText.includes("APPROVED_FOR_INTERNAL_USE")
      && componentsText.includes("NEEDS_REVISION")
      && componentsText.includes("REJECTED_BY_HUMAN")
      && componentsText.includes("accessibilityIdentifier(\"MobileCaptureLifecycleSafeActionRow\")")
      && componentsText.includes("accessibilityIdentifier(\"MobileCaptureActionPacketCard\")")
      && componentsText.includes("accessibilityIdentifier(\"MobileCapturePacketReviewLaneRow\")")
      && componentsText.includes("Visible session receipts")
      && componentsText.includes("accessibilityIdentifier(\"MobileCaptureReviewDigestPanel\")"),
    "nativeReviewDigestPanelVisible",
    "Native capture UI exposes the review digest, safe action packets, and lifecycle safe actions as first-class reviewer and agent readback surfaces.",
  );
  expect(
    contentViewText.includes("CapturePhoneShell()")
      && contentViewText.includes("ProtectedOfflineLibraryShell")
      && contentViewText.includes("mustKeepRecorderVisible")
      && capturePhoneShellText.includes("CaptureRootTab.today")
      && capturePhoneShellText.includes("CaptureRootTab.record")
      && capturePhoneShellText.includes("CaptureRootTab.work")
      && capturePhoneShellText.includes("CaptureRootTab.library")
      && capturePhoneShellText.includes("CaptureRootTab.account")
      && capturePhoneShellText.includes("Local source is production truth"),
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
      && bridgeText.includes("ownerEmail == ownerEmail")
      && capturePhoneShellText.includes('accessibilityIdentifier("CaptureWorkView")')
      && capturePhoneShellText.includes("CaptureWorkQuickEntry_")
      && capturePhoneShellText.includes("initialProject: captureDestination")
      && capturePhoneShellText.includes("CaptureQuickEntrySyncCard(model: model)")
      && capturePhoneShellText.includes("CaptureWorkTaskTagsEdit_")
      && capturePhoneShellText.includes("CaptureWorkTaskEdit_")
      && capturePhoneShellText.includes("CaptureTodayTaskEdit_")
      && capturePhoneShellText.includes("CaptureTaskEditSave")
      && capturePhoneShellText.includes("CaptureTaskEditBoundary")
      && capturePhoneShellText.includes('status: task.status == "OPEN" ? "DONE" : "OPEN"')
      && bridgeText.includes("func editTask(")
      && bridgeText.includes('"action": "task-edit"')
      && bridgeText.includes('payload.action == "task-edit"')
      && todayRouteText.includes('if (action === "task-edit")')
      && todayRouteText.includes('surface: "ios-capture-today"')
      && capturePhoneShellText.includes("CaptureWorkGoalEdit_")
      && capturePhoneShellText.includes("CaptureTodayGoalEdit_")
      && capturePhoneShellText.includes("CaptureGoalEditSave")
      && capturePhoneShellText.includes("CaptureGoalEditBoundary")
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
      && capturePhoneShellText.includes("workTagDecisionStatus"),
    "nativeCanonicalProjectWorkWorkspace",
    "iPhone Work reads actor-scoped canonical project tasks, goals, document notes, and tags, protects the last owner-partitioned snapshot offline, pre-binds protected quick capture, and atomically creates or reuses project vocabulary while reconciling the complete Task, Goal, or document-level Note tag set through one canonical phone outbox decision.",
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
  const taskDomainText = sourceText("packages/quipsly-domain/src/transcript-derived-task.ts");
  const serviceText = sourceText("apps/quipsly/src/lib/server/transcript-corrections.ts");
  const nativeText = sourceText("apps/mobile-capture/HighGroundCapture/HighGroundCapture/TranscriptCorrectionReview.swift");
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
  const sessionNotesWorkspaceText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/session-notes-workspace.tsx");
  const sessionReviewModelText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/session-review-model.ts");
  const nestDashboardText = sourceText("apps/quipsly/src/app/(app)/nests/[slug]/page.tsx");
  const nestFollowThroughText = sourceText("apps/quipsly/src/lib/server/nest-project-follow-through.ts");
  const workspaceSearchText = sourceText("apps/quipsly/src/lib/server/workspace-search.ts");
  const workspaceSearchPageText = sourceText("apps/quipsly/src/app/(app)/find/page.tsx");
  const researchLibraryModelText = sourceText("apps/quipsly/src/app/(app)/research/research-library-model.ts");
  const sidebarText = sourceText("apps/quipsly/src/components/SidebarLayout.tsx");
  const todayRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/today/route.ts");
  const canonicalTaskStatusText = sourceText("apps/quipsly/src/lib/server/canonical-task-status.ts");
  const taskRecurrenceServerText = sourceText("apps/quipsly/src/lib/server/task-recurrence.ts");
  const sessionsRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/sessions/route.ts");
  const mobileCaptureSessionsText = sourceText("apps/quipsly/src/lib/server/mobile-capture-sessions.ts");
  const workTagsText = sourceText("apps/quipsly/src/lib/server/work-tags.ts");
  const schemaText = sourceText("prisma/schema.prisma");
  const sessionReviewPageText = sourceText("apps/quipsly/src/app/(app)/sessions/[roomId]/page.tsx");
  const workTagsRouteText = sourceText("apps/quipsly/src/app/api/work/tags/route.ts");
  const recordingPromotionText = sourceText("apps/quipsly/src/lib/server/recording-media-promotion.ts");
  const recordingPromotionRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/recordings/promote/route.ts");
  const episodeInventoryText = sourceText("apps/quipsly/src/app/api/media-vault/episode-inventory/route.ts");
  const editorText = sourceText("apps/quipsly/src/app/(app)/editor/page.tsx");
  const quickEntryText = sourceText("apps/quipsly/src/lib/server/mobile-capture-quick-entry.ts");
  const quickEntryRouteText = sourceText("apps/quipsly/src/app/api/mobile/capture/quick-entry/route.ts");
  const sessionNoteContractText = sourceText("apps/quipsly/src/lib/session-note-contract.ts");
  const sessionNoteAccessText = sourceText("apps/quipsly/src/lib/server/session-note-access.ts");
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
      && serviceText.includes("acceptedHumanCorrectionRequiresPlaybackConfirmation: true")
      && serviceText.includes("aiOutputRequiresHumanReview: true")
      && serviceText.includes("PLAYBACK_POSITION_MISMATCH")
      && serviceText.includes("STALE_CORRECTION_OVERLAY")
      && serviceText.includes("noExternalDelivery: true")
      && serviceText.includes("noPublication: true"),
    "transcriptCorrectionImmutableEvidenceBoundary",
    "Canonical transcript corrections preserve provider segments and media time, quarantine AI output, require playback-position proof, and fail stale overlays closed.",
  );
  expect(
    nativeText.includes("CaptureTranscriptReviewView")
      && nativeText.includes("recording.recordingAssetId == expectedRecordingAssetID")
      && nativeText.includes("confirmedPosition(for segment")
      && nativeText.includes("AI proposal · not transcript truth")
      && nativeText.includes("Preview data — no server actions")
      && nativeText.includes("This iPhone does not have the exact recording asset behind this transcript")
      && nativeText.includes("FileProtectionType.complete")
      && nativeText.includes(".completeFileProtection")
      && nativeText.includes("values.isExcludedFromBackup = true")
      && nativeText.includes("Protected offline snapshot")
      && nativeText.includes("guard !isUsingProtectedCache, AuthManager.shared.networkActionsAllowed")
      && nativeText.includes("ProtectedTranscriptDrafts")
      && nativeText.includes("providerTextSha256 == segment.providerTextSha256")
      && nativeText.includes("Protected local draft saved · not synced")
      && nativeText.includes("CaptureTranscriptCorrectionDraftStore.remove")
      && shellText.includes("Review transcript against this source")
      && shellText.includes("CaptureTranscriptReviewPreviewLink"),
    "nativeTranscriptCorrectionExactSourceBoundary",
    "iPhone Library reviews transcript overlays against an exact retained recording-asset match, protects offline readback, and keeps cached, preview, remote-only, and AI states non-authoritative.",
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
      && nativeText.includes("scrollTargetSegmentID = focusSegmentID")
      && nativeText.includes("Creates one OPEN task assigned to you")
      && shellText.includes("CaptureTodayTaskSourceLink_")
      && workModelText.includes("readTranscriptDerivedTaskSource")
      && schedulePageText.includes("readTranscriptDerivedTaskSource")
      && schedulePageText.includes("Reviewed transcript timestamp")
      && schedulePlannerText.includes("Focus source · reviewed transcript")
      && todayRouteText.includes("readTranscriptDerivedTaskSource")
      && todayRouteText.includes("Reviewed transcript follow-through")
      && todayRouteText.includes("tasksRankedForToday: true")
      && shellText.includes("task.todayReason?.nonempty")
      && webText.includes("Make this my task")
      && webText.includes('id={`transcript-segment-${encodeURIComponent(segment.id)}`}')
      && webText.includes("It creates no deadline, reminder, calendar event, message, or publication."),
    "transcriptDerivedTaskExplicitSourceBoundary",
    "Transcript review creates one explicitly requested self-owned OPEN task with immutable segment and recording provenance, stale-evidence protection, idempotency, and no implicit scheduling, delivery, or publication.",
  );
  expect(
    goalRouteText.includes("schema: TRANSCRIPT_DERIVED_GOAL_SCHEMA")
      && taskDomainText.includes('TRANSCRIPT_DERIVED_GOAL_SCHEMA = "quipsly-transcript-derived-goal-v1"')
      && taskDomainText.includes("readTranscriptDerivedGoalSource")
      && goalRouteText.includes("readTranscriptCorrectionDesk({ prisma: tx, roomId: request.roomId, actor })")
      && goalRouteText.includes("segment.providerTextSha256 !== request.expectedProviderTextSha256")
      && goalRouteText.includes("ownerUserId: actor.id")
      && goalRouteText.includes('status: "ACTIVE"')
      && goalRouteText.includes("taskCreated: false")
      && goalRouteText.includes("targetDateCreated: false")
      && goalRouteText.includes("reminderCreated: false")
      && goalRouteText.includes("calendarMutated: false")
      && goalRouteText.includes("externalDelivery: false")
      && goalRouteText.includes("publication: false")
      && nativeText.includes("CaptureTranscriptCreateGoalButton")
      && nativeText.includes("Creates one ACTIVE goal owned by you")
      && webText.includes("Make this my goal")
      && webText.includes("It creates no task, target date, reminder, calendar event, message, or publication.")
      && workModelText.includes("readTranscriptDerivedGoalSource")
      && workClientText.includes("Reviewed transcript goal source")
      && schedulePageText.includes("readTranscriptDerivedGoalSource")
      && schedulePlannerText.includes("Focus source · reviewed transcript")
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
      && webText.includes("Start source-linked draft")
      && webText.includes("Creates one private Nest writing page with an immutable transcript-evidence block and a separate editable draft block")
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
      && shellText.includes('Goal check-ins record progress without changing goal status.')
      && shellText.includes('Preview and protected snapshots stay read-only.'),
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
      && shellText.includes("No reminder or provider event is implied."),
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
      && shellText.includes('LabeledContent("Destination", value: "Personal Inbox")')
      && shellText.includes("The phone journals first. Nest retries use the same ID")
      && inboxText.includes('where: { userId, collectionId: null, researchFilings: { none: {} } }')
      && inboxText.includes("Review personal source")
      && collectionsText.includes("snapshot.items.some((item) => item.id === requestedCaptureId)")
      && sessionReviewPageText.includes("sessionQuickEntries={sessionQuickEntries}")
      && sessionReviewPageText.includes("sessionNotes={sessionNotes}")
      && sessionReviewPageText.includes('return "iPhone Capture"')
      && sessionReviewText.includes("<SessionNotesWorkspace")
      && sessionNotesWorkspaceText.includes("TagSearchChips")
      && sessionNotesWorkspaceText.includes('payload.idempotentReplay ? "The existing" : "One"')
      && sessionNotesWorkspaceText.includes("canonical ${sessionNoteKindLabel")
      && sessionNotesWorkspaceText.includes("No external action occurred")
      && sessionReviewText.includes('scope="work"')
      && sessionReviewText.includes("Committed Session work")
      && sessionReviewText.includes("distinct from transcript candidates")
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
      && mobileCaptureSessionsText.includes("canUseProjectTeamNotes: input.isStaff === true")
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
      && shellText.includes("Audience is a visibility decision, not a delivery receipt"),
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
      && sessionNoteEditRouteText.includes("clientRequestId")
      && sessionNoteEditRouteText.includes("canonicalTagsAtomic")
      && sessionNoteEditRouteText.includes("retryIdentityProtected")
      && sessionNoteEditOutboxText.includes("completeFileProtectionUntilFirstUserAuthentication")
      && sessionNoteEditOutboxText.includes("ownerAccountID")
      && sessionNoteEditOutboxText.includes("var clientRequestID: String { id.uuidString.lowercased() }")
      && captureExperienceText.includes("retrySessionNoteEdits(automatic: true)")
      && captureExperienceText.includes("sessionNoteEditOutbox.enqueue")
      && captureExperienceText.includes("A protected Session-note edit needs deliberate review beside Nest's current revision.")
      && captureExperienceText.includes("sessionNoteEditMessageRoomID = edit.roomID")
      && bridgeText.includes("syncSessionNoteEdit")
      && bridgeText.includes("var isActive: Bool? = nil")
      && bridgeText.includes("payload.idempotentReplay == true || intentMatchesCurrent")
      && mobileCaptureSessionsText.includes("isActive: tag.isActive")
      && bridgeText.includes("SESSION_NOTE_EDIT_ACKNOWLEDGEMENT_MISMATCH")
      && shellText.includes("CaptureSessionNoteEditSheet")
      && shellText.includes("CaptureSessionNoteEditKeyboardDone")
      && shellText.includes("CaptureSessionNoteEditPolicyBoundary")
      && shellText.includes("Save reviewed draft over current revision")
      && shellText.includes("Nest remains canonical. A successful edit appends one revision"),
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
      && shellText.includes("durable citation"),
    "protectedSourceAnnotationWritingHandoff",
    "iPhone protects one exact annotation-to-writing decision before network use, Nest authorizes its writable project and creates one private citation-backed canonical draft, exact acknowledgements close the outbox, and sources plus external systems remain unchanged.",
  );
  expect(
    schemaText.includes("model StudioPersonalSourceFiling")
      && schemaText.includes("personalSourceFiling StudioPersonalSourceFiling?")
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
      && inboxText.includes("until an explicit Research filing receipt commits")
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
    recordingPromotionText.includes("resolveCaptureGroupPromotionPlan")
      && recordingPromotionText.includes('"capture-group-source-set-changed"')
      && recordingPromotionText.includes('"capture-group-processing-held"')
      && recordingPromotionText.includes("originalSourcesMutated: false")
      && recordingPromotionText.includes("alignmentRemainsProposal: true")
      && recordingPromotionText.includes("retryIsIdempotent: true")
      && recordingPromotionRouteText.includes("expectedRecordingAssetIds")
      && recordingPromotionRouteText.includes("promoteRecordingCaptureGroupToStudioMedia")
      && mobileCaptureSessionsText.includes("captureGroupStudioHandoff")
      && mobileCaptureSessionsText.includes("captureGroupPromotionRequiresCompleteSourceSet: true")
      && bridgeText.includes("MobileCaptureSourceSummary")
      && bridgeText.includes('requestBody["captureGroupId"] = captureGroupID')
      && bridgeText.includes('requestBody["expectedRecordingAssetIds"]')
      && captureExperienceText.includes("complete capture group")
      && shellText.includes('"Attach group"')
      && shellText.includes('"Group in Studio"')
      && captureUITestText.includes("testStudioHandoffKeepsTheWholeCaptureGroupVisibleAcrossReadyRetryAndCompleteStates")
      && captureUITestText.includes('expectedStatus: "2 sources ready"')
      && captureUITestText.includes('expectedStatus: "1 of 2 in Studio"')
      && captureUITestText.includes('expectedStatus: "2 sources in Studio"'),
    "completeCaptureGroupStudioHandoff",
    "iPhone and Nest attach the newest verified podcast take as one exact source-set snapshot, preserve every source original, expose partial retry truth, and keep clock alignment as a human-reviewed proposal.",
  );
  expect(
    packetRouteText.includes("buildPacketGoalCandidates")
      && packetRouteText.includes('brief.kind !== "quipsly-transcript-packet-brief-v1"')
      && packetRouteText.includes("brief.candidateOnly !== true")
      && packetRouteText.includes("goalCandidateReviewReceipts")
      && packetRouteText.includes("goalReviewStatus(latestReceipt?.decision)")
      && packetGoalReviewRouteText.includes("createTranscriptDerivedGoalInTransaction")
      && packetGoalReviewRouteText.includes("FOR UPDATE")
      && packetGoalReviewRouteText.includes("goalCandidateReviewReceipts")
      && packetGoalReviewRouteText.includes('if (reviewDecision === "ACCEPT")')
      && packetGoalReviewRouteText.includes('reviewDecision === "EDIT"')
      && packetGoalReviewRouteText.includes('reviewDecision === "REJECT"')
      && packetGoalReviewRouteText.includes("TRANSCRIPT_GOAL_REVIEW_DECISIONS")
      && packetGoalReviewRouteText.includes("taskCreated: false")
      && packetGoalReviewRouteText.includes("calendarMutated: false")
      && sessionReviewModelText.includes("goalCandidateReviewRequest")
      && sessionReviewText.includes("Choose what deserves to become a goal")
      && sessionReviewText.includes("Accept as goal")
      && sessionReviewText.includes("Edit, defer, and reject preserve the review record")
      && sessionReviewText.includes("No task, date, focus block, calendar event, message, or delivery was added")
      && sessionReviewText.includes('href={`/work?goal=${encodeURIComponent(candidate.committedGoalId)}`}')
      && nativeText.includes("/api/mobile/capture/transcripts/packet/goals")
      && nativeText.includes("CapturePacketGoalReviewSection")
      && nativeText.includes("CapturePacketGoalSource_")
      && nativeText.includes("CapturePacketGoalAcceptButton")
      && nativeText.includes("Edit, defer, and reject are saved as review history")
      && nativeText.includes("No goal or task was created")
      && nativeText.includes("/api/mobile/capture/transcripts/packet/actions")
      && nativeText.includes("CapturePacketTaskReviewSection")
      && nativeText.includes("CapturePacketTaskSource_")
      && nativeText.includes("CapturePacketTaskAcceptButton")
      && nativeText.includes("Every other decision creates no task, assignment, date, reminder, calendar event, message, delivery, or publication."),
    "packetGoalCandidateExplicitReviewBoundary",
    "Packet goal-language stays candidate-only until an actor explicitly accepts one exact-source canonical Goal; edit, reject, and defer remain receipt-backed non-work decisions with no implied task, schedule, calendar, message, delivery, or publication.",
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
    workspaceSearchText.includes("taskAccessWhere")
      && workspaceSearchText.includes("roomAccessWhere")
      && workspaceSearchText.includes("isUnreviewedTranscriptActionItem")
      && workspaceSearchText.includes("createdByUserId: input.actorUserId")
      && workspaceSearchText.includes("perKindLimit: RESULT_LIMIT")
      && workspaceSearchText.includes("prisma.studioTag.findMany")
      && workspaceSearchText.includes("isActive: true")
      && workspaceSearchPageText.includes('redirectTo="/find"')
      && workspaceSearchPageText.includes('href={`/work?task=${encodeURIComponent(item.id)}`}')
      && workspaceSearchPageText.includes('href={`/work?goal=${encodeURIComponent(item.id)}`}')
      && workspaceSearchPageText.includes('href={`/sessions/${encodeURIComponent(item.id)}`}')
      && workspaceSearchPageText.includes('ResultSection title="Tags"')
      && workspaceSearchPageText.includes("tagSearchHref(item.label)")
      && researchLibraryModelText.includes("tagCatalog: ResearchSourceTag[]")
      && researchLibraryModelText.includes("...source.annotations.flatMap")
      && !researchLibraryModelText.includes("...source.tags.map")
      && workspaceSearchPageText.includes("Search is read-only")
      && sidebarText.includes('href="/find"')
      && sidebarText.includes('aria-label="Search all Quipsly"'),
    "permissionFilteredCanonicalWorkspaceSearch",
    "Search All is authenticated, permission-filtered, bounded, candidate-safe, and returns task/goal/session identities plus visible project tags without side effects.",
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
      && inboxPageText.includes("Review with source")
      && inboxPageText.includes("actor-owned sources stay here until an explicit Research filing receipt commits")
      && calendarPageText.includes("Time for the work you actually chose")
      && calendarPageText.includes("Calendar is Quipsly planning truth, not provider truth")
      && libraryModelText.includes("permissionFilteredBeforeProjection: true")
      && libraryModelText.includes("promotedCaptureMediaDeduplicated: true")
      && libraryModelText.includes("localPhoneRecordingsRemainDeviceOwned: true")
      && libraryPageText.includes("Library results are a read-only index")
      && libraryPageText.includes("OR: [{ visibility: \"project\" }, { createdByUserId: userId }]")
      && researchPageText.includes("snapshot.sources.some((source) => source.id === requestedSourceId)")
      && !calendarPageText.includes("Real rooms, grouped by current status"),
    "canonicalNestOperatingShell",
    "Nest makes Today, Inbox, Work, Sessions, Library, and Calendar primary while Today stays bounded, Inbox combines actor-owned unfiled sources with source-linked proposal review, and Library permission-filters canonical identities with exact continuation and promoted-capture deduplication.",
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
    lifecycle.kind === "quipsly-coaching-capture-lifecycle-v1",
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
  checkMeetingSpineContractSources();
  checkTranscriptPacketContractSources();
  checkReviewDigestContractSources();
  checkTranscriptCorrectionContractSources();
  checkUnifiedNestOperatingShellSources();
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
