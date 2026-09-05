#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

import { parseXmlPropertyList } from "./lib/parse-xml-property-list.mjs";
import {
  readAppStoreMetadata,
  validateAppStoreMetadata,
} from "./release/quipsly-capture-app-store-metadata.mjs";
import { QUIPSLY_CAPTURE_RELEASE_TARGET } from "./release/quipsly-capture-release-target.mjs";

const root = process.cwd();
const iosRoot = path.join(root, "apps/mobile-capture/HighGroundCapture");
const sourceRoot = path.join(iosRoot, "HighGroundCapture");

const files = {
  privacyManifest: path.join(sourceRoot, "PrivacyInfo.xcprivacy"),
  appInfoPlist: path.join(sourceRoot, "Info.plist"),
  project: path.join(iosRoot, "HighGroundCapture.xcodeproj/project.pbxproj"),
  liveKitProviderRoomValidator: path.join(iosRoot, "scripts/validate-livekit-provider-room.sh"),
  runtimeUISmokeRunner: path.join(iosRoot, "scripts/run-capture-runtime-ui-smoke.sh"),
  runtimeUISmokeTests: path.join(iosRoot, "HighGroundCaptureUITests/CaptureRoomRuntimeSmokeTests.swift"),
  deterministicUITests: path.join(iosRoot, "HighGroundCaptureUITests/CaptureExperienceUITests.swift"),
  deterministicUITestPlan: path.join(root, "scripts/release/quipsly-capture-ui-test-plan.mjs"),
  appStoreDraftRunner: path.join(iosRoot, "scripts/capture-app-store-draft-screenshots.sh"),
  appStoreDraftMaterializer: path.join(iosRoot, "scripts/app-store-draft-screenshots.mjs"),
  appStoreCommittedDraftRunner: path.join(root, "scripts/release/quipsly-capture-screenshots-from-commit.sh"),
  mobileCapturePreflight: path.join(root, "scripts/quipsly-mobile-capture-preflight.sh"),
  generatedMobileCaptureAuthSmoke: path.join(root, "scripts/quipsly-mobile-capture-generated-auth-smoke.mjs"),
  contentView: path.join(sourceRoot, "ContentView.swift"),
  captureApp: path.join(sourceRoot, "HighGroundCaptureApp.swift"),
  appDelegate: path.join(sourceRoot, "AppDelegate.swift"),
  authManager: path.join(sourceRoot, "AuthManager.swift"),
  authResponseDecoder: path.join(sourceRoot, "AuthResponseDecoder.swift"),
  protectedSessionCacheIdentity: path.join(sourceRoot, "ProtectedSessionCacheIdentity.swift"),
  appleSignInCoordinator: path.join(sourceRoot, "AppleSignInCoordinator.swift"),
  captureEntitlements: path.join(sourceRoot, "HighGroundCapture.entitlements"),
  captureUniversalLinkRoute: path.join(
    root,
    "apps/quipsly/src/app/.well-known/apple-app-site-association/route.ts",
  ),
  captureUniversalLinkBuilder: path.join(
    root,
    "apps/quipsly/src/lib/capture-universal-link.ts",
  ),
  loginView: path.join(sourceRoot, "LoginView.swift"),
  swiftPackageResolution: path.join(
    iosRoot,
    "HighGroundCapture.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved",
  ),
  audioCapture: path.join(sourceRoot, "AudioCaptureController.swift"),
  providerAudioMaster: path.join(sourceRoot, "ProviderAudioMasterRecorder.swift"),
  voiceWritingLiveSource: path.join(sourceRoot, "VoiceWritingLiveSourceRecorder.swift"),
  audioSoundCheck: path.join(sourceRoot, "CaptureAudioSoundCheck.swift"),
  audioSoundCheckModel: path.join(sourceRoot, "CaptureAudioSoundCheckModel.swift"),
  captureRehearsalReadiness: path.join(sourceRoot, "CaptureRehearsalReadiness.swift"),
  captureSessionGuardian: path.join(sourceRoot, "CaptureSessionGuardian.swift"),
  captureSessionPreflight: path.join(sourceRoot, "CaptureSessionPreflight.swift"),
  videoCaptureController: path.join(sourceRoot, "VideoCaptureController.swift"),
  videoCaptureService: path.join(sourceRoot, "VideoCaptureService.swift"),
  captureAudioSessionCoordinator: path.join(sourceRoot, "CaptureAudioSessionCoordinator.swift"),
  episodeWatch: path.join(sourceRoot, "MobileEpisodeWatch.swift"),
  episodeManuscript: path.join(sourceRoot, "MobileEpisodeManuscript.swift"),
  episodeChat: path.join(sourceRoot, "MobileEpisodeChat.swift"),
  sessionConversation: path.join(sourceRoot, "MobileSessionConversation.swift"),
  uploadManager: path.join(sourceRoot, "UploadManager.swift"),
  uploadLedgerStore: path.join(sourceRoot, "UploadLedgerStore.swift"),
  providerRoomController: path.join(sourceRoot, "ProviderRoomController.swift"),
  captureExperienceModel: path.join(sourceRoot, "CaptureExperienceModel.swift"),
  mobileQuickEntryOutbox: path.join(sourceRoot, "MobileQuickEntryOutbox.swift"),
  sourceInboxFiling: path.join(sourceRoot, "CaptureSourceInbox.swift"),
  sourceAnnotationDraftOutbox: path.join(sourceRoot, "SourceAnnotationDraftOutbox.swift"),
  sessionNoteEditOutbox: path.join(sourceRoot, "SessionNoteEditOutbox.swift"),
  documentNoteEditOutbox: path.join(sourceRoot, "DocumentNoteEditOutbox.swift"),
  captureReceiptStore: path.join(sourceRoot, "CaptureRoomReceiptStore.swift"),
  captureRecordingCoordinator: path.join(sourceRoot, "CaptureRecordingCoordinator.swift"),
  captureRecordingReceiptOutbox: path.join(sourceRoot, "CaptureRecordingReceiptOutbox.swift"),
  capturePhoneShell: path.join(sourceRoot, "CapturePhoneShell.swift"),
  voiceWritingDraftStore: path.join(sourceRoot, "VoiceWritingDraftStore.swift"),
  voiceWritingRecognitionSyncClient: path.join(sourceRoot, "VoiceWritingRecognitionSyncClient.swift"),
  subscriptionStore: path.join(sourceRoot, "QuipslySubscriptionStore.swift"),
  captureCoachingHome: path.join(sourceRoot, "CaptureCoachingHome.swift"),
  mobileCoachingFormAutomation: path.join(sourceRoot, "MobileCoachingFormAutomation.swift"),
  mobileCoachingForms: path.join(sourceRoot, "MobileCoachingForms.swift"),
  mobileCoachingSessionPreparation: path.join(sourceRoot, "MobileCoachingSessionPreparation.swift"),
  captureCalendarEventEditor: path.join(sourceRoot, "CaptureCalendarEventEditor.swift"),
  captureRuntimeEvidence: path.join(sourceRoot, "CaptureRuntimeEvidence.swift"),
  captureSupportSnapshot: path.join(sourceRoot, "CaptureSupportSnapshot.swift"),
  captureAttentionDiagnostics: path.join(sourceRoot, "CaptureAttentionDiagnostics.swift"),
  captureRecordingShare: path.join(sourceRoot, "CaptureRecordingShare.swift"),
  captureSourceEvidence: path.join(sourceRoot, "CaptureSourceEvidenceView.swift"),
  captureNestPortability: path.join(sourceRoot, "CaptureNestPortability.swift"),
  contextPicker: path.join(sourceRoot, "ContextPickerView.swift"),
  transcriptReview: path.join(sourceRoot, "TranscriptCorrectionReview.swift"),
  sessionProtectedPlayback: path.join(sourceRoot, "CaptureSessionProtectedPlayback.swift"),
  transcriptReviewDecisionOutbox: path.join(sourceRoot, "TranscriptReviewDecisionOutbox.swift"),
  captureAudioDecisionOutbox: path.join(sourceRoot, "CaptureAudioDecisionOutbox.swift"),
  onDeviceTranscriptManager: path.join(sourceRoot, "OnDeviceTranscriptManager.swift"),
  localRecordingLibrary: path.join(sourceRoot, "LocalRecordingLibrary.swift"),
  localRecordingPlayback: path.join(sourceRoot, "LocalRecordingPlaybackController.swift"),
  mobileComponents: path.join(sourceRoot, "QuipslyMobileComponents.swift"),
  bridgeModels: path.join(sourceRoot, "BridgeModels.swift"),
  mobileCaptureReadinessRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/readiness/route.ts"),
  mobileCaptureSessionsRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/sessions/route.ts"),
  mobileCaptureSessionsServer: path.join(root, "apps/quipsly/src/lib/server/mobile-capture-sessions.ts"),
  coachingPackets: path.join(root, "apps/quipsly/src/lib/server/coaching-packets.ts"),
  captureTranscriptFollowThrough: path.join(root, "apps/quipsly/src/lib/server/capture-transcript-follow-through.ts"),
  captureTranscriptFollowThroughDispatch: path.join(root, "apps/quipsly/src/lib/server/capture-transcript-follow-through-dispatch.ts"),
  mobileCaptureProjectsRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/projects/route.ts"),
  mobileVoiceWritingRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/voice-writing/route.ts"),
  mobileVoiceWritingServer: path.join(root, "apps/quipsly/src/lib/server/mobile-voice-writing.ts"),
  webAppLayout: path.join(root, "apps/quipsly/src/app/(app)/layout.tsx"),
  webProjectCreateAction: path.join(root, "apps/quipsly/src/app/(app)/projects/actions.ts"),
  webSidebar: path.join(root, "apps/quipsly/src/components/SidebarLayout.tsx"),
  webGlobals: path.join(root, "apps/quipsly/src/app/globals.css"),
  webNestSignInGate: path.join(root, "apps/quipsly/src/components/nest-sign-in-gate.tsx"),
  webCaptureAppHandoff: path.join(root, "apps/quipsly/src/components/capture-app-handoff.tsx"),
  webRecorderBottomBar: path.join(root, "apps/quipsly/src/app/(app)/read/RecorderBottomBar.tsx"),
  appStoreTransactionRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/entitlements/app-store/transaction/route.ts"),
  appStoreNotificationsRoute: path.join(root, "apps/quipsly/src/app/api/billing/app-store/notifications/route.ts"),
  appStoreSubscriptionServer: path.join(root, "apps/quipsly/src/lib/server/app-store-subscriptions.ts"),
  subscriptionEntitlementsServer: path.join(root, "apps/quipsly/src/lib/server/subscription-entitlements.ts"),
  coachingRunwayRoute: path.join(root, "apps/quipsly/src/app/api/coaching/runway/route.ts"),
  mobileCaptureConsentRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/consent/route.ts"),
  onDeviceTranscriptRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/transcripts/on-device/route.ts"),
  cloudTranscriptFallbackRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/transcripts/cloud-fallback/route.ts"),
  mobileCaptureTranscriptDeviceAccess: path.join(root, "apps/quipsly/src/lib/server/mobile-capture-transcript-device-access.ts"),
  mobileQuickEntryRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/quick-entry/route.ts"),
  mobileTodayRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/today/route.ts"),
  mobileSourceInboxRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/inbox/route.ts"),
  personalSourceFiling: path.join(root, "apps/quipsly/src/lib/server/personal-source-filing.ts"),
  mobileQuickEntryHelper: path.join(root, "apps/quipsly/src/lib/server/mobile-capture-quick-entry.ts"),
  taskRecurrenceServer: path.join(root, "apps/quipsly/src/lib/server/task-recurrence.ts"),
  canonicalTaskStatus: path.join(root, "apps/quipsly/src/lib/server/canonical-task-status.ts"),
  canonicalGoalEdit: path.join(root, "apps/quipsly/src/lib/server/canonical-goal-edit.ts"),
  roomJoinDiagnosticsRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/rooms/join/diagnostics/route.ts"),
  roomJoinDiagnosticsHelper: path.join(root, "apps/quipsly/src/lib/server/mobile-capture-room-join-diagnostics.ts"),
  recordingMediaPromotion: path.join(root, "apps/quipsly/src/lib/server/recording-media-promotion.ts"),
  mediaVaultReadinessRoute: path.join(root, "apps/quipsly/src/app/api/media-vault/readiness/route.ts"),
  coachingCalendarReadinessRoute: path.join(root, "apps/quipsly/src/app/api/coaching/calendar/readiness/route.ts"),
  coachingCalendarAdapter: path.join(root, "apps/quipsly/src/lib/server/coaching-google-calendar.ts"),
  accountDeletionRoute: path.join(root, "apps/quipsly/src/app/api/account/deletion-request/route.ts"),
  nestChatRoute: path.join(root, "apps/quipsly/src/app/api/nest-chat/route.ts"),
  privacyPage: path.join(root, "apps/quipsly/src/app/(marketing)/privacy/page.tsx"),
  deletionPage: path.join(root, "apps/quipsly/src/app/(marketing)/privacy/account-deletion/page.tsx"),
  coachingPage: path.join(root, "apps/quipsly/src/app/(app)/coaching/page.tsx"),
  localEngineMediaVaultConfig: path.join(root, "apps/local-engine/src/MediaVaultConfig.ts"),
  localEngineEpisodeMediaRegistration: path.join(root, "apps/local-engine/src/EpisodeMediaRegistrationService.ts"),
  liveKitJoinTokenHelper: path.join(root, "apps/quipsly/src/lib/server/livekit-join-token.ts"),
  liveKitEgressHelper: path.join(root, "apps/quipsly/src/lib/server/coaching-livekit-egress.ts"),
  providerRecordingCommand: path.join(root, "apps/quipsly/src/lib/server/provider-recording-command.ts"),
  meetingSpineContract: path.join(root, "packages/quipsly-domain/src/coaching-meeting-spine.ts"),
  readinessDoc: path.join(root, "docs/quipsly/ios-capture-app-store-readiness.md"),
  listingDoc: path.join(root, "docs/quipsly/ios-capture-app-store-listing.md"),
  reviewerChecklist: path.join(root, "docs/quipsly/ios-capture-reviewer-smoke-checklist.md"),
  rehearsalRunbook: path.join(root, "docs/quipsly/hgo-testflight-rehearsal-runbook.md"),
  envExample: path.join(root, ".env.example"),
};

const checks = [];

function fail(message, details = {}) {
  console.error(JSON.stringify({ ok: false, error: message, ...details }, null, 2));
  process.exit(1);
}

function passLabelFor(message, details = {}) {
  if (details.label) return details.label;
  if (details.dataType) return `privacy manifest includes collected data type: ${details.dataType}`;
  if (details.apiType) return `privacy manifest includes required-reason API type: ${details.apiType}`;
  if (details.forbidden) return `forbidden marker absent: ${details.forbidden}`;
  if (message.includes("must explicitly declare no tracking")) return "privacy manifest declares no tracking";
  return message;
}

function read(file) {
  if (!fs.existsSync(file)) fail("Required capture readiness file is missing.", { file: path.relative(root, file) });
  return fs.readFileSync(file, "utf8");
}

function assert(condition, message, details = {}) {
  if (!condition) fail(message, details);
  checks.push({
    status: "pass",
    label: passLabelFor(message, details),
    message,
    details,
  });
}

function requireIncludes(text, needle, label) {
  const compact = (value) => String(value).replace(/\s+/g, " ").trim();
  assert(compact(text).includes(compact(needle)), "Required App Store/capture invariant is missing.", { label, missing: needle });
}

function requireExcludes(text, needle, label) {
  assert(!text.includes(needle), "A QA-only marker leaked into a shipping App Store surface.", { label, forbidden: needle });
}

function requireAnyIncludes(text, needles, label) {
  assert(needles.some((needle) => text.includes(needle)), "Required App Store/capture invariant is missing.", { label, expectedOneOf: needles });
}

function requireRegex(text, regex, label) {
  assert(regex.test(text), "Required App Store/capture invariant is missing.", { label, pattern: String(regex) });
}

function readSwiftSourceTree(dir) {
  const chunks = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === ".build" || entry.name === "DerivedData") continue;
      chunks.push(readSwiftSourceTree(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name.endsWith(".swift")) {
      chunks.push(`\n// FILE: ${path.relative(root, fullPath)}\n${fs.readFileSync(fullPath, "utf8")}`);
    }
  }
  return chunks.join("\n");
}

const privacyText = read(files.privacyManifest);
const appInfoText = read(files.appInfoPlist);
const projectText = read(files.project);
const liveKitProviderRoomValidatorText = read(files.liveKitProviderRoomValidator);
const runtimeUISmokeRunnerText = read(files.runtimeUISmokeRunner);
const runtimeUISmokeTestsText = read(files.runtimeUISmokeTests);
const deterministicUITestsText = read(files.deterministicUITests);
const deterministicUITestPlanText = read(files.deterministicUITestPlan);
const captureExperienceModelText = read(files.captureExperienceModel);
const appStoreDraftRunnerText = read(files.appStoreDraftRunner);
const appStoreDraftMaterializerText = read(files.appStoreDraftMaterializer);
const appStoreCommittedDraftRunnerText = read(files.appStoreCommittedDraftRunner);
const mobileCapturePreflightText = read(files.mobileCapturePreflight);
const generatedMobileCaptureAuthSmokeText = read(files.generatedMobileCaptureAuthSmoke);
const contentViewText = read(files.contentView);
const captureAppText = read(files.captureApp);
const appDelegateText = read(files.appDelegate);
const authText = read(files.authManager);
const authResponseDecoderText = read(files.authResponseDecoder);
const protectedSessionCacheIdentityText = read(files.protectedSessionCacheIdentity);
const appleSignInCoordinatorText = read(files.appleSignInCoordinator);
const captureEntitlementsText = read(files.captureEntitlements);
const captureUniversalLinkRouteText = read(files.captureUniversalLinkRoute);
const captureUniversalLinkBuilderText = read(files.captureUniversalLinkBuilder);
const loginText = read(files.loginView);
const swiftPackageResolutionText = read(files.swiftPackageResolution);
const audioText = read(files.audioCapture);
const providerAudioMasterText = read(files.providerAudioMaster);
const voiceWritingLiveSourceText = read(files.voiceWritingLiveSource);
const captureAudioSoundCheckText = read(files.audioSoundCheck);
const videoCaptureControllerText = read(files.videoCaptureController);
const videoCaptureServiceText = read(files.videoCaptureService);
const captureAudioSessionCoordinatorText = read(files.captureAudioSessionCoordinator);
const episodeWatchText = read(files.episodeWatch);
const episodeManuscriptText = read(files.episodeManuscript);
const episodeChatText = read(files.episodeChat);
const captureCoachingHomeText = read(files.captureCoachingHome);
const mobileCoachingFormAutomationText = read(files.mobileCoachingFormAutomation);
const mobileCoachingFormsText = read(files.mobileCoachingForms);
const mobileCoachingSessionPreparationText = read(files.mobileCoachingSessionPreparation);
const captureSessionPreflightText = read(files.captureSessionPreflight);
const captureRuntimeEvidenceText = read(files.captureRuntimeEvidence);
const sessionConversationText = read(files.sessionConversation);
const uploadText = read(files.uploadManager);
const uploadLedgerText = read(files.uploadLedgerStore);
const providerRoomText = read(files.providerRoomController);
const captureExperienceText = read(files.captureExperienceModel);
const mobileQuickEntryOutboxText = read(files.mobileQuickEntryOutbox);
const sourceInboxFilingText = read(files.sourceInboxFiling);
const sourceAnnotationDraftOutboxText = read(files.sourceAnnotationDraftOutbox);
const sessionNoteEditOutboxText = read(files.sessionNoteEditOutbox);
const documentNoteEditOutboxText = read(files.documentNoteEditOutbox);
const captureReceiptStoreText = read(files.captureReceiptStore);
const captureRecordingCoordinatorText = read(files.captureRecordingCoordinator);
const captureRecordingReceiptOutboxText = read(files.captureRecordingReceiptOutbox);
const capturePhoneShellText = read(files.capturePhoneShell);
const webGlobalsText = read(files.webGlobals);
const webNestSignInGateText = read(files.webNestSignInGate);
const voiceWritingDraftStoreText = read(files.voiceWritingDraftStore);
const voiceWritingRecognitionSyncClientText = read(files.voiceWritingRecognitionSyncClient);
const recorderSurfaceStart = capturePhoneShellText.indexOf(
  "private struct CaptureRecorderView: View",
);
const recorderSurfaceEnd = capturePhoneShellText.indexOf(
  "private struct MobilePriorSessionFollowThroughCard: View",
  recorderSurfaceStart,
);
assert(
  recorderSurfaceStart >= 0 && recorderSurfaceEnd > recorderSurfaceStart,
  "Capture recorder source boundary is missing.",
);
const recorderSurfaceText = capturePhoneShellText.slice(
  recorderSurfaceStart,
  recorderSurfaceEnd,
);
const subscriptionStoreText = read(files.subscriptionStore);
const audioSoundCheckText = read(files.audioSoundCheck);
const audioSoundCheckModelText = read(files.audioSoundCheckModel);
const captureRehearsalReadinessText = read(files.captureRehearsalReadiness);
const captureSessionGuardianText = read(files.captureSessionGuardian);
const captureCalendarEventEditorText = read(files.captureCalendarEventEditor);
const captureSupportSnapshotText = read(files.captureSupportSnapshot);
const captureAttentionDiagnosticsText = read(files.captureAttentionDiagnostics);
const captureRecordingShareText = read(files.captureRecordingShare);
const captureSourceEvidenceText = read(files.captureSourceEvidence);
const captureNestPortabilityText = read(files.captureNestPortability);
const contextPickerText = read(files.contextPicker);
const transcriptReviewText = read(files.transcriptReview);
const sessionProtectedPlaybackText = read(files.sessionProtectedPlayback);
const transcriptReviewDecisionOutboxText = read(files.transcriptReviewDecisionOutbox);
const captureAudioDecisionOutboxText = read(files.captureAudioDecisionOutbox);
const onDeviceTranscriptManagerText = read(files.onDeviceTranscriptManager);
const localRecordingLibraryText = read(files.localRecordingLibrary);
const localRecordingPlaybackText = read(files.localRecordingPlayback);
const mobileText = read(files.mobileComponents);
const shippingCaptureUIText = `${capturePhoneShellText}\n${captureRehearsalReadinessText}\n${captureSessionGuardianText}\n${mobileText}`;
const brandedCaptureSurfaceTexts = [
  ["CapturePhoneShell.swift", capturePhoneShellText],
  ["QuipslyMobileComponents.swift", mobileText],
  ["ContextPickerView.swift", contextPickerText],
  ["CaptureNestPortability.swift", captureNestPortabilityText],
  ["LoginView.swift", loginText],
  ["CaptureSourceEvidenceView.swift", captureSourceEvidenceText],
  ["CaptureRecordingShare.swift", captureRecordingShareText],
  ["TranscriptCorrectionReview.swift", transcriptReviewText],
];
for (const [surface, source] of brandedCaptureSurfaceTexts) {
  const rawFeatureHighlight = source.match(
    /(?:Color)?\.(?:blue|teal|cyan|purple|pink|indigo)\b|UIColor\.system(?:Blue|Teal|Cyan|Purple|Pink|Indigo)\b/,
  );
  assert(
    rawFeatureHighlight == null,
    "Branded Capture surfaces must use semantic library-garden tokens instead of unrelated system feature colors.",
    { label: `${surface} has no raw blue, teal, purple, pink, or indigo feature highlight`, forbidden: rawFeatureHighlight?.[0] },
  );
  const rawSystemSurface = source.match(
    /Color\(uiColor: \.(?:secondary|tertiary)?System(?:Grouped)?Background\)/,
  );
  assert(
    rawSystemSurface == null,
    "Branded Capture surfaces must keep cards inside the adaptive parchment and walnut surface hierarchy.",
    { label: `${surface} has no unrelated gray system-card surface`, forbidden: rawSystemSurface?.[0] },
  );
}
requireIncludes(capturePhoneShellText, "static let actionFill = adaptive(", "filled actions have an independent accessible peacock token");
requireIncludes(capturePhoneShellText, "static let plumFill = adaptive(", "editor actions have an independent accessible inkberry token");
requireIncludes(capturePhoneShellText, "static let accentUIColor = adaptiveUIColor(", "system-owned controls receive the same adaptive bookcloth accent");
requireIncludes(capturePhoneShellText, "func captureProminentButton(fill:", "filled controls share one readable Quipsly action treatment");
for (const family of ["peacock", "lake", "fern", "brass", "inkberry", "rosewood", "terracotta"]) {
  for (const step of [50, 500, 950]) {
    requireIncludes(
      webGlobalsText,
      `--color-quipsly-${family}-${step}:`,
      `web palette keeps the ${family} ${step} material token`,
    );
  }
}
for (const [legacyFamily, materialFamily] of [
  ["violet", "peacock"],
  ["blue", "lake"],
  ["emerald", "fern"],
  ["amber", "brass"],
  ["purple", "inkberry"],
  ["rose", "rosewood"],
  ["orange", "terracotta"],
]) {
  requireIncludes(
    webGlobalsText,
    `--color-${legacyFamily}-500: var(--color-quipsly-${materialFamily}-500);`,
    `${legacyFamily} utilities resolve through the ${materialFamily} material`,
  );
}
requireExcludes(webNestSignInGateText, "#ffc0c5", "the Session sign-in gate has no bubble-gum border escape hatch");
requireExcludes(webNestSignInGateText, "#fff1f2", "the Session sign-in gate has no bubble-gum surface escape hatch");
const captureSwiftSourceDirectory = path.join(
  root,
  "apps/mobile-capture/HighGroundCapture/HighGroundCapture",
);
const allCaptureSwiftSource = fs.readdirSync(captureSwiftSourceDirectory)
  .filter((name) => name.endsWith(".swift"))
  .map((name) => fs.readFileSync(path.join(captureSwiftSourceDirectory, name), "utf8"))
  .join("\n");
const rawSemanticOutlier = allCaptureSwiftSource.match(/(?:Color)?\.(?:green|orange)\b/);
assert(
  rawSemanticOutlier == null,
  "Capture success and warning states use the adaptive sage and aged-brass semantic tokens.",
  { label: "shipping Capture Swift surfaces contain no raw system green or orange", forbidden: rawSemanticOutlier?.[0] },
);
assert(
  (allCaptureSwiftSource.match(/\.buttonStyle\(\.borderedProminent\)/g) ?? []).length === 1,
  "Every prominent Capture action receives the shared readable foreground and adaptive fill treatment.",
  { label: "the only direct borderedProminent style is inside captureProminentButton" },
);
const bridgeText = read(files.bridgeModels);

for (const [source, endpoint, label] of [
  [
    voiceWritingDraftStoreText,
    '"\\(nestBaseURL)/api/mobile/capture/voice-writing"',
    "voice-writing sync uses the Nest origin exactly once",
  ],
  [
    voiceWritingRecognitionSyncClientText,
    '"\\(nestBaseURL)/api/mobile/capture/speech-profile"',
    "speech-profile sync uses the Nest origin exactly once",
  ],
  [
    onDeviceTranscriptManagerText,
    '"\\(nestBaseURL)/api/mobile/capture/transcripts/on-device"',
    "device transcript delivery uses the Nest origin exactly once",
  ],
  [
    capturePhoneShellText,
    '"\\(nestBaseURL)/api/mobile/capture/voice-writing/export"',
    "voice-writing export uses the Nest origin exactly once",
  ],
]) {
  requireIncludes(source, endpoint, label);
}
for (const [source, label] of [
  [voiceWritingDraftStoreText, "voice-writing sync never creates an /api/api route"],
  [voiceWritingRecognitionSyncClientText, "speech-profile sync never creates an /api/api route"],
  [onDeviceTranscriptManagerText, "device transcript delivery never creates an /api/api route"],
  [capturePhoneShellText, "voice-writing export never creates an /api/api route"],
]) {
  requireExcludes(source, "\\(apiBaseURL)/api/mobile/capture", label);
}
const mobileCaptureReadinessRouteText = read(files.mobileCaptureReadinessRoute);
const mobileCaptureSessionsRouteText = read(files.mobileCaptureSessionsRoute);
const mobileCaptureSessionsServerText = read(files.mobileCaptureSessionsServer);
const coachingPacketsText = read(files.coachingPackets);
const captureTranscriptFollowThroughText = read(files.captureTranscriptFollowThrough);
const captureTranscriptFollowThroughDispatchText = read(files.captureTranscriptFollowThroughDispatch);
const mobileCaptureProjectsRouteText = read(files.mobileCaptureProjectsRoute);
const mobileVoiceWritingRouteText = read(files.mobileVoiceWritingRoute);
const mobileVoiceWritingServerText = read(files.mobileVoiceWritingServer);
const webAppLayoutText = read(files.webAppLayout);
const webProjectCreateActionText = read(files.webProjectCreateAction);
const webSidebarText = read(files.webSidebar);
const webCaptureAppHandoffText = read(files.webCaptureAppHandoff);
const webRecorderBottomBarText = read(files.webRecorderBottomBar);
const appStoreTransactionRouteText = read(files.appStoreTransactionRoute);
const appStoreNotificationsRouteText = read(files.appStoreNotificationsRoute);
const appStoreSubscriptionServerText = read(files.appStoreSubscriptionServer);
const subscriptionEntitlementsServerText = read(files.subscriptionEntitlementsServer);
const coachingRunwayRouteText = read(files.coachingRunwayRoute);
const onDeviceTranscriptRouteText = read(files.onDeviceTranscriptRoute);
const cloudTranscriptFallbackRouteText = read(files.cloudTranscriptFallbackRoute);
const mobileCaptureTranscriptDeviceAccessText = read(files.mobileCaptureTranscriptDeviceAccess);
const mobileQuickEntryRouteText = read(files.mobileQuickEntryRoute);
const mobileTodayRouteText = read(files.mobileTodayRoute);
const mobileSourceInboxRouteText = read(files.mobileSourceInboxRoute);
const personalSourceFilingText = read(files.personalSourceFiling);
const mobileQuickEntryHelperText = read(files.mobileQuickEntryHelper);
const taskRecurrenceServerText = read(files.taskRecurrenceServer);
const canonicalTaskStatusText = read(files.canonicalTaskStatus);
const canonicalGoalEditText = read(files.canonicalGoalEdit);
const roomJoinDiagnosticsRouteText = read(files.roomJoinDiagnosticsRoute);
const roomJoinDiagnosticsHelperText = read(files.roomJoinDiagnosticsHelper);
const recordingMediaPromotionText = read(files.recordingMediaPromotion);
const mediaVaultReadinessRouteText = read(files.mediaVaultReadinessRoute);
const coachingCalendarReadinessRouteText = read(files.coachingCalendarReadinessRoute);
const coachingCalendarAdapterText = read(files.coachingCalendarAdapter);
const deletionRouteText = read(files.accountDeletionRoute);
const nestChatRouteText = read(files.nestChatRoute);
const privacyPageText = read(files.privacyPage);
const deletionPageText = read(files.deletionPage);
const coachingPageText = read(files.coachingPage);
const localEngineMediaVaultConfigText = read(files.localEngineMediaVaultConfig);
const localEngineEpisodeMediaRegistrationText = read(files.localEngineEpisodeMediaRegistration);
const liveKitJoinTokenHelperText = read(files.liveKitJoinTokenHelper);
const liveKitEgressHelperText = read(files.liveKitEgressHelper);
const providerRecordingCommandText = read(files.providerRecordingCommand);
const mobileCaptureConsentRouteText = read(files.mobileCaptureConsentRoute);
const meetingSpineContractText = read(files.meetingSpineContract);
const readinessDocText = read(files.readinessDoc);
const listingDocText = read(files.listingDoc);
const reviewerChecklistText = read(files.reviewerChecklist);
const rehearsalRunbookText = read(files.rehearsalRunbook);
const envExampleText = read(files.envExample);
const mobileSwiftSourceTreeText = readSwiftSourceTree(sourceRoot);

for (const retiredPrototypePath of [
  "HighGroundCapture/ExportManager.swift",
  "HighGroundCapture/NativeEditorView.swift",
  "HighGroundCapture/NativePublishingView.swift",
  "HighGroundCapture/PublishingNetworkClient.swift",
  "HighGroundCapture/TimelineModels.swift",
  "HighGroundCapture/AdaptiveQuipslyMobileShell.swift",
  "HighGroundCapture/IPadQuipslyStudioView.swift",
  "HighGroundCapture/IPhoneQuipslySessionView.swift",
  "HighGroundCapture/ReframingEngine/ReframingCompositor.swift",
  "HighGroundCapture/ReframingEngine/ReframingCompositionInstruction.swift",
  "HighGroundCapture/ReframingEngine/ReframingShader.metal",
  "HighGroundCaptureUITests/Tier1_FeatureTests.swift",
  "HighGroundCaptureUITests/Tier2_BoundaryTests.swift",
  "HighGroundCaptureUITests/Tier3_CrossFeatureTests.swift",
  "HighGroundCaptureUITests/Tier4_WorkloadTests.swift",
  "handoff.md",
]) {
  assert(
    !fs.existsSync(path.join(iosRoot, retiredPrototypePath)),
    "Retired facade editor, publisher, exporter, and stale-test sources must stay out of the Capture target.",
    { forbidden: retiredPrototypePath },
  );
}

let privacy;
try {
  privacy = parseXmlPropertyList(privacyText);
} catch (error) {
  fail("Privacy manifest could not be parsed.", { reason: error instanceof Error ? error.message : String(error) });
}

const collectedTypes = new Set(
  (privacy.NSPrivacyCollectedDataTypes || []).map((entry) => entry.NSPrivacyCollectedDataType).filter(Boolean),
);
const accessedTypes = new Set(
  (privacy.NSPrivacyAccessedAPITypes || []).map((entry) => entry.NSPrivacyAccessedAPIType).filter(Boolean),
);
const accessedReasons = new Map(
  (privacy.NSPrivacyAccessedAPITypes || []).map((entry) => [
    entry.NSPrivacyAccessedAPIType,
    new Set(entry.NSPrivacyAccessedAPITypeReasons || []),
  ]),
);

assert(privacy.NSPrivacyTracking === false, "Privacy manifest must explicitly declare no tracking.");
for (const dataType of [
  "NSPrivacyCollectedDataTypeName",
  "NSPrivacyCollectedDataTypeEmailAddress",
  "NSPrivacyCollectedDataTypeUserID",
  "NSPrivacyCollectedDataTypeDeviceID",
  "NSPrivacyCollectedDataTypePurchaseHistory",
  "NSPrivacyCollectedDataTypeAudioData",
  "NSPrivacyCollectedDataTypePhotosorVideos",
  "NSPrivacyCollectedDataTypeOtherUserContent",
]) {
  assert(collectedTypes.has(dataType), "Privacy manifest is missing an expected collected data type.", { dataType });
}
for (const apiType of [
  "NSPrivacyAccessedAPICategoryUserDefaults",
  "NSPrivacyAccessedAPICategoryFileTimestamp",
  "NSPrivacyAccessedAPICategoryDiskSpace",
]) {
  assert(accessedTypes.has(apiType), "Privacy manifest is missing an expected required-reason API type.", { apiType });
}
assert(
  accessedReasons.get("NSPrivacyAccessedAPICategoryDiskSpace")?.has("E174.1"),
  "Privacy manifest must declare Apple's sufficient-disk-space reason for capture preflight.",
  { label: "disk-space capture preflight declares E174.1" },
);

requireIncludes(projectText, "GENERATE_INFOPLIST_FILE = NO", "explicit app information property list");
requireIncludes(projectText, "INFOPLIST_FILE = HighGroundCapture/Info.plist", "app information property list source");
requireIncludes(appInfoText, "NSMicrophoneUsageDescription", "microphone usage string");
requireIncludes(appInfoText, "Use your microphone for calls and audio recordings you start.", "concise microphone usage call and recording boundary");
requireIncludes(appInfoText, "NSSpeechRecognitionUsageDescription", "on-device speech usage string");
requireIncludes(
  appInfoText,
  "Turn your recordings into editable transcripts.",
  "speech usage names the direct user outcome",
);
requireIncludes(appInfoText, "NSCameraUsageDescription", "camera usage string required by linked session SDK");
requireIncludes(appInfoText, "Use your camera for video calls and video recordings you start.", "concise camera usage call and recording boundary");
requireIncludes(providerRoomText, "configuration.supportsVideo = true", "CallKit supports the user-controlled native video path");
requireIncludes(providerRoomText, "action.isVideo = false", "calls still begin with camera off by default");
requireIncludes(appInfoText, "UIBackgroundModes", "background audio mode");
requireIncludes(appInfoText, "BGTaskSchedulerPermittedIdentifiers", "system-scheduled transcript recovery is declared");
requireIncludes(appInfoText, "com.highgroundodyssey.HighGroundCapture.transcription", "transcript recovery task identifier is stable");
requireRegex(
  appInfoText,
  /<key>UIBackgroundModes<\/key>[\s\S]*?<string>processing<\/string>/,
  "background processing mode supports deferred transcript recovery",
);
requireIncludes(appInfoText, "ITSAppUsesNonExemptEncryption", "export compliance declaration");
requireRegex(
  appInfoText,
  /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/,
  "no non-exempt encryption declaration",
);
requireRegex(projectText, /PRODUCT_BUNDLE_IDENTIFIER = com\.highgroundodyssey\.HighGroundCapture;/, "production bundle identifier");
requireRegex(projectText, /IPHONEOS_DEPLOYMENT_TARGET = 17\.0;/, "supported iOS 17 deployment floor");
requireRegex(projectText, /SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";/, "native iOS and iPadOS supported platforms");
requireRegex(projectText, /TARGETED_DEVICE_FAMILY = "1,2";/, "universal iPhone and iPad target family");
requireIncludes(capturePhoneShellText, "NavigationSplitView", "regular-width iPad uses native split-view navigation");
requireIncludes(capturePhoneShellText, "horizontalSizeClass == .regular", "iPad workspace adapts to the current resizable window width");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureIPadSidebar")', "native iPad sidebar has stable operated-test identity");
requireIncludes(capturePhoneShellText, 'keyboardShortcut("r", modifiers: [.command, .shift])', "iPad hardware keyboard reaches Speak to Write");
requireRegex(
  captureExperienceModelText,
  /static var runsPhysicalVoiceWritingAcceptance: Bool \{\s*#if DEBUG && !targetEnvironment\(simulator\)[\s\S]*--capture-physical-voice-writing-acceptance[\s\S]*#else\s*false\s*#endif\s*\}/,
  "physical voice-writing acceptance is unavailable to simulator and Release builds",
);
requireRegex(
  capturePhoneShellText,
  /#if DEBUG && !targetEnvironment\(simulator\)\s*\/\/\/ Exercises the same start\/stop closures[\s\S]*private func runPhysicalVoiceWritingAcceptanceIfRequested[\s\S]*runsPhysicalVoiceWritingAcceptance[\s\S]*PhysicalVoiceWritingAcceptanceReceiptStore\.write\([\s\S]*phase: \.requested[\s\S]*await requestCoordinatedStart\(for: session\)[\s\S]*waitUntilRecordingOrTerminal[\s\S]*phase: \.recording[\s\S]*Task\.sleep\(for: \.seconds\(15\)\)[\s\S]*await requestCoordinatedStop\(for: session\)[\s\S]*phase: \.finished[\s\S]*QUIPSLY_PHYSICAL_VOICE_WRITING_ACCEPTANCE finished[\s\S]*#endif/,
  "DEBUG physical-only voice-writing acceptance traverses production start, source confirmation, and stop before emitting a terminal receipt",
);
const physicalVoiceWritingReceiptText = fs.readFileSync(path.join(sourceRoot, "PhysicalVoiceWritingAcceptanceReceipt.swift"), "utf8");
requireIncludes(physicalVoiceWritingReceiptText, "#if DEBUG && !targetEnvironment(simulator)", "physical acceptance receipts compile only for Debug physical-device builds");
requireIncludes(physicalVoiceWritingReceiptText, 'static let schema = "quipsly-physical-voice-writing-acceptance-v1"', "physical acceptance receipts use a versioned machine-readable schema");
requireIncludes(physicalVoiceWritingReceiptText, ".completeFileProtectionUntilFirstUserAuthentication", "physical acceptance receipt bytes use iOS file protection");
requireIncludes(physicalVoiceWritingReceiptText, ".posixPermissions: 0o600", "physical acceptance receipts remain owner-readable only");
requireIncludes(physicalVoiceWritingReceiptText, "isExcludedFromBackup = true", "physical acceptance receipts do not enter device backups");
requireIncludes(physicalVoiceWritingReceiptText, "transcriptClientRequestID", "physical acceptance identifies the protected source-bound transcript sidecar without logging its text");
requireIncludes(capturePhoneShellText, "waitForPhysicalVoiceWritingTranscript", "physical acceptance follows the saved source into automatic device transcription");
requireIncludes(capturePhoneShellText, "OnDeviceTranscriptManager.shared.storedTranscript", "physical acceptance reads the ordinary protected transcript store");
requireRegex(
  deterministicUITestsText,
  /#if !targetEnvironment\(simulator\)[\s\S]*waitForPhysicalVoiceWritingEditor[\s\S]*CaptureVoiceWritingOpen_[\s\S]*func testPhysicalDeviceVoiceWritingCreatesOneSavedSource\(\)[\s\S]*XCUIApplication\(bundleIdentifier: "com\.apple\.springboard"\)[\s\S]*buttons\["Allow"\][\s\S]*CaptureStopButton[\s\S]*waitForNonExistence[\s\S]*waitForPhysicalVoiceWritingEditor[\s\S]*CaptureVoiceWritingEditor[\s\S]*#endif/,
  "physical-only operated acceptance handles ordinary microphone and speech permission, proves one bounded saved source, and reaches editable source-bound writing without creating simulator skips",
);
requireIncludes(deterministicUITestsText, "func testPrivateVoiceNoteOpensCaptureWithoutMeetingPaperworkOnRegularWidthIPad", "operated native acceptance covers iPad Speak to Write through the platform create rail");
requireIncludes(deterministicUITestsText, "speakToWrite.isSelected", "operated iPad acceptance keeps the current Speak to Write location selected");
requireIncludes(deterministicUITestsText, "func testConsentNeededNextEpisodeOpensRecorderWithoutCrashingOnRegularWidthIPad", "operated native acceptance covers the full iPad Session detail against the physical stack-overflow regression");
requireIncludes(deterministicUITestPlanText, "CaptureExperienceUITests/testRegularWidthIPadUsesANativeWorkspaceSidebar", "the guarded critical lane cannot omit native iPad navigation");
requireIncludes(deterministicUITestPlanText, "CaptureExperienceUITests/testPrivateVoiceNoteOpensCaptureWithoutMeetingPaperworkOnRegularWidthIPad", "the guarded critical lane cannot omit iPad Speak to Write");
requireIncludes(deterministicUITestPlanText, "CaptureExperienceUITests/testConsentNeededNextEpisodeOpensRecorderWithoutCrashingOnRegularWidthIPad", "the guarded critical lane cannot omit the iPad Session stack-overflow regression");
requireIncludes(appInfoText, "UISupportedInterfaceOrientations~ipad", "native iPad declares a platform-specific orientation policy");
requireIncludes(appInfoText, "UIInterfaceOrientationPortraitUpsideDown", "native iPad supports every resizable orientation");
requireRegex(projectText, /SUPPORTS_MACCATALYST = NO;/, "Mac Catalyst is not accidentally advertised");
requireRegex(projectText, /SUPPORTS_MAC_DESIGNED_FOR_IPHONE_IPAD = NO;/, "Designed-for-iPhone Mac compatibility is disabled in source");
requireRegex(projectText, /SUPPORTS_XR_DESIGNED_FOR_IPHONE_IPAD = NO;/, "Designed-for-iPhone visionOS compatibility is disabled in source");
requireIncludes(appInfoText, "<string>Quipsly Capture</string>", "customer-facing app name");
requireIncludes(
  rehearsalRunbookText,
  `App: **${QUIPSLY_CAPTURE_RELEASE_TARGET.appName} ${QUIPSLY_CAPTURE_RELEASE_TARGET.marketingVersion} (${QUIPSLY_CAPTURE_RELEASE_TARGET.buildNumber})**`,
  "operator runbook identifies the canonical current external build",
);
requireIncludes(
  rehearsalRunbookText,
  QUIPSLY_CAPTURE_RELEASE_TARGET.sourceRevision,
  "operator runbook identifies the exact current external source",
);
requireIncludes(
  rehearsalRunbookText,
  QUIPSLY_CAPTURE_RELEASE_TARGET.buildId,
  "operator runbook identifies the exact App Store Connect build",
);
requireIncludes(
  rehearsalRunbookText,
  QUIPSLY_CAPTURE_RELEASE_TARGET.publicLink,
  "operator runbook uses the canonical public TestFlight handoff",
);
requireIncludes(
  rehearsalRunbookText,
  `Installation mode: ${QUIPSLY_CAPTURE_RELEASE_TARGET.distributionMode}`,
  "operator runbook states the canonical TestFlight distribution mode",
);
requireIncludes(projectText, "https://github.com/livekit/client-sdk-swift-xcframework.git", "LiveKit Swift xcframework package reference");
requireIncludes(projectText, "kind = exactVersion;", "LiveKit Swift package is pinned exactly");
requireIncludes(projectText, "version = 2.16.0;", "LiveKit Swift package is pinned to the reviewed call-reliability release");
requireIncludes(swiftPackageResolutionText, '"revision" : "d0119ce55ca515fafd7abeea8e405342fc10e0bb"', "Swift package resolution locks the reviewed LiveKit 2.16.0 revision");
requireIncludes(swiftPackageResolutionText, '"version" : "2.16.0"', "Swift package resolution locks LiveKit 2.16.0");
requireIncludes(projectText, "productName = LiveKit;", "LiveKit package product linked");
requireIncludes(projectText, "LiveKit in Frameworks", "LiveKit product linked into app target frameworks");
requireIncludes(liveKitProviderRoomValidatorText, "-resolvePackageDependencies", "LiveKit provider-room dependency resolver");
requireIncludes(liveKitProviderRoomValidatorText, "client-sdk-swift-xcframework.git", "LiveKit provider-room validator checks the binary package path");
requireIncludes(liveKitProviderRoomValidatorText, 'LIVEKIT_SWIFT_VERSION="${LIVEKIT_SWIFT_VERSION:-2.16.0}"', "LiveKit provider-room validator checks the reviewed dependency version");
requireIncludes(liveKitProviderRoomValidatorText, "DEVELOPER_DIR_VALUE", "LiveKit provider-room validator uses full Xcode without global xcode-select mutation");
requireIncludes(liveKitProviderRoomValidatorText, "QUIPSLY_CAPTURE_DERIVED_DATA_PATH", "LiveKit provider-room simulator build uses an explicit disposable DerivedData path");
requireIncludes(liveKitProviderRoomValidatorText, "run_with_timeout", "LiveKit provider-room validator uses bounded external tool runs");
requireIncludes(liveKitProviderRoomValidatorText, "--build-simulator", "LiveKit provider-room validator can run the next simulator build proof");
requireIncludes(liveKitProviderRoomValidatorText, "CODE_SIGNING_ALLOWED=NO", "LiveKit provider-room simulator build avoids signing ceremony");
requireIncludes(liveKitProviderRoomValidatorText, "Next proof: join a Nest-issued room packet on simulator/device.", "LiveKit provider-room validator states next real proof");
requireIncludes(runtimeUISmokeRunnerText, "QUIPSLY_CAPTURE_UI_TEST_EMAIL", "runtime UI smoke requires explicit test email");
requireIncludes(runtimeUISmokeRunnerText, "QUIPSLY_CAPTURE_UI_TEST_PASSWORD", "runtime UI smoke requires explicit test password");
requireIncludes(runtimeUISmokeRunnerText, "QUIPSLY_CAPTURE_UI_TEST_BASE_URL", "runtime UI smoke can target local Nest");
requireIncludes(runtimeUISmokeRunnerText, "QUIPSLY_CAPTURE_UI_TEST_MODE", "runtime UI smoke requires an explicit bounded journey mode");
requireIncludes(runtimeUISmokeRunnerText, "QUIPSLY_CAPTURE_UI_TEST_DERIVED_DATA_PATH", "runtime UI smoke can reuse one explicit bounded DerivedData cache");
requireIncludes(runtimeUISmokeRunnerText, "QUIPSLY_CAPTURE_UI_TEST_RESULT_BUNDLE_PATH", "runtime UI smoke preserves one explicit xcresult proof");
requireIncludes(runtimeUISmokeRunnerText, "-parallel-testing-enabled NO", "focused runtime UI smoke avoids unnecessary cloned simulator runners");
requireIncludes(runtimeUISmokeRunnerText, 'google-handoff)', "runtime UI smoke can select the no-credential Google provider handoff proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'REQUIRES_PASSWORD_CREDENTIALS=false', "Google handoff proof does not require or serialize a reviewer password");
requireIncludes(runtimeUISmokeRunnerText, "custom paths are not visible inside the test runner", "credentialed runtime UI smoke rejects a credential path XCTest cannot read");
requireIncludes(runtimeUISmokeRunnerText, "Another credentialed Capture runtime UI smoke owns the canonical XCTest host bridge", "credentialed runtime UI smokes serialize access to the one protected host bridge");
requireIncludes(runtimeUISmokeRunnerText, 'skipped !== 0', "runtime UI smoke fails closed when Xcode reports a skipped selected test");
requireIncludes(runtimeUISmokeRunnerText, 'total !== 1', "runtime UI smoke requires exactly one executed bounded test");
requireIncludes(runtimeUISmokeRunnerText, 'TEST_CASE="testSignedInCaptureRoomSurfacesAreVisible"', "runtime UI smoke retains the non-mutating signed-in surface proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'TEST_CASE="testConsentedCapturePlaybackAndCrashRecovery"', "runtime UI smoke can select the consented recovery proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'SDK_STAT_CACHE_ENABLE_VALUE="${QUIPSLY_CAPTURE_UI_TEST_SDK_STAT_CACHE_ENABLE:-NO}"', "runtime UI smoke avoids the observed Xcode SDK stat-cache deadlock by default");
requireIncludes(runtimeUISmokeRunnerText, 'TEST_CASE="testSignedInIPhoneAuthorsCanonicalWeeklyRecurrence"', "runtime UI smoke can select the signed-in recurrence-authoring proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'TEST_CASE="testIPhoneRecurrenceOutboxSurvivesOfflineRelaunchAndConverges"', "runtime UI smoke can select the offline/relaunch recurrence-authoring proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'recurrence-edit)', "runtime UI smoke can select the immutable-history recurrence-edit proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'task-edit)', "runtime UI smoke can operate and restore a canonical one-time task edit");
requireIncludes(runtimeUISmokeRunnerText, 'goal-edit)', "runtime UI smoke can operate and restore a canonical goal edit");
requireIncludes(runtimeUISmokeRunnerText, 'recurrence-missed)', "runtime UI smoke can select the explicit missed-occurrence proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'session-note-edit)', "runtime UI smoke can select the protected Session-note edit and relaunch proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'source-inbox-filing)', "runtime UI smoke can select the private-source-to-Research filing proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'client-follow-up)', "runtime UI smoke can select the retained client follow-up delivery proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'today-client-follow-up)', "runtime UI smoke can select the preview Today-to-exact-Session follow-up proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'weekly-plan-preview)', "runtime UI smoke can select the protected weekly-plan and reflection editor proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'weekly-plan-operation)', "runtime UI smoke can select the signed-in canonical weekly-plan operation mode");
requireIncludes(runtimeUISmokeRunnerText, 'coach-follow-up-authoring)', "runtime UI smoke can select the assigned-coach draft, revision, and release proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'coaching-follow-through-work)', "runtime UI smoke can select the exact next-Session follow-through to Work proof mode");
requireIncludes(runtimeUISmokeTestsText, "func testSignedInCaptureRoomSurfacesAreVisible", "runtime UI smoke implements the signed-in surface proof");
requireIncludes(runtimeUISmokeTestsText, "func testConsentedCapturePlaybackAndCrashRecovery", "runtime UI smoke implements real consented capture, playback, and crash recovery");
requireIncludes(runtimeUISmokeTestsText, "destination = sessionsDestination(in: app)", "runtime UI smoke proves rendered recorder navigation through the platform-neutral restored Session surface instead of trusting stale tab-selection metadata");
requireIncludes(runtimeUISmokeTestsText, '"CaptureSessionChooser",', "runtime UI navigation accepts the Session chooser when no prior Session is restored");
requireIncludes(runtimeUISmokeTestsText, '"CaptureRecorderView"', "runtime UI navigation accepts the recorder when the last Session is restored");
requireIncludes(runtimeUISmokeTestsText, "earlier idempotent attachment", "runtime UI recovery proof accepts only a durable existing Studio handoff when a retained source was already attached");
requireIncludes(runtimeUISmokeTestsText, "func testSignedInIPhoneAuthorsCanonicalWeeklyRecurrence", "runtime UI smoke authors recurrence through signed-in iPhone controls and reads it back from Today");
requireIncludes(runtimeUISmokeTestsText, "func testIPhoneRecurrenceOutboxSurvivesOfflineRelaunchAndConverges", "runtime UI smoke proves recurrence survives an unreachable Nest plus process relaunch before canonical convergence");
requireIncludes(runtimeUISmokeTestsText, "func testIPhoneVersionsThisAndFutureRecurrenceWithoutRewritingHistory", "runtime UI smoke versions this-and-future recurrence through the signed-in iPhone controls");
requireIncludes(runtimeUISmokeTestsText, "func testOneTimeTaskEditRoundTripsAndRestoresThroughNest", "runtime UI smoke edits and restores one exact canonical task through signed-in iPhone controls");
requireIncludes(runtimeUISmokeTestsText, "func testCanonicalGoalEditRoundTripsAndRestoresThroughNest", "runtime UI smoke edits and restores one exact canonical goal through signed-in iPhone controls");
requireIncludes(runtimeUISmokeTestsText, "func testIPhoneExplicitlySkipsMissedOccurrenceAndContinuesSeries", "runtime UI smoke explicitly preserves one missed occurrence and proves the canonical series continues");
requireIncludes(runtimeUISmokeTestsText, "func testClientSafeDecisionCreatesEditsAndRelaunchesFromProtectedIPhoneOutbox", "runtime UI smoke creates, edits, and relaunches one exact canonical Session note");
requireIncludes(runtimeUISmokeTestsText, "func testPrivateSourceInboxFilesIntoCanonicalResearch", "runtime UI smoke files one exact private iPhone source into canonical Nest Research");
requireIncludes(runtimeUISmokeTestsText, "func testReleasedClientFollowUpAppearsAndAutomaticallyAcknowledgesInCapture", "runtime UI smoke reads and automatically acknowledges one exact released client follow-up");
requireIncludes(runtimeUISmokeTestsText, "func testAssignedCoachCreatesRevisesAndReleasesClientFollowUpInCapture", "runtime UI smoke operates assigned-coach draft, revision, and explicit in-app release");
requireIncludes(runtimeUISmokeTestsText, "func testClientOpensExactFollowThroughGoalInWork", "runtime UI smoke opens one exact carried-forward goal in canonical Work");
requireIncludes(deterministicUITestsText, "func testTodayWeeklyPlanEditorKeepsReflectionHonestAndOfflineSafe", "deterministic UI smoke operates the protected weekly-plan and reflection editor without claiming a preview save");
requireIncludes(runtimeUISmokeTestsText, "func testSignedInIPhoneUpdatesCanonicalWeeklyPlanAndSurvivesRelaunch", "runtime UI smoke changes one canonical weekly plan through iPhone controls and reads it back after relaunch");
requireIncludes(runtimeUISmokeTestsText, "CaptureClientFollowUp_", "runtime UI smoke addresses the exact released follow-up artifact");
requireIncludes(runtimeUISmokeTestsText, "CaptureClientFollowUpOpenState_", "runtime UI smoke addresses automatic client open acknowledgement");
requireIncludes(runtimeUISmokeTestsText, "CaptureClientFollowUpCurrentProgress_", "runtime UI smoke reads separately authorized live work beside the immutable release");
requireIncludes(runtimeUISmokeTestsText, "CaptureClientFollowUpOpenTask_", "runtime UI smoke opens one exact released task in canonical Work");
requireIncludes(runtimeUISmokeTestsText, "func testGoogleSignInOpensProtectedGoogleWebAuthenticationWithoutCredentials", "runtime UI smoke opens Apple's protected Google handoff without typing a credential");
requireIncludes(runtimeUISmokeTestsText, '"google.com"', "Google handoff proof asserts the exact external provider before leaving Quipsly");
requireIncludes(runtimeUISmokeTestsText, "hold duplicate auth attempts", "Google handoff proof keeps duplicate identity attempts disabled");
requireIncludes(sessionNoteEditOutboxText, "completeFileProtectionUntilFirstUserAuthentication", "Session-note edit outbox protects complete offline intent at rest");
requireIncludes(sessionNoteEditOutboxText, "ownerAccountID", "Session-note edit outbox partitions drafts by verified actor");
requireIncludes(capturePhoneShellText, "Skip missed occurrence…", "Capture exposes an explicit missed-occurrence decision instead of an unattended scheduler");
requireIncludes(capturePhoneShellText, 'decisionReason: "MISSED_OCCURRENCE_SKIPPED"', "Capture sends the exact bounded missed-occurrence decision reason");
requireIncludes(capturePhoneShellText, 'status: "CANCELED"', "Capture marks the missed occurrence skipped through the task status operation");
requireIncludes(capturePhoneShellText, "The repeating task will continue with its next occurrence.", "Capture explains the direct effect of skipping a missed occurrence");
requireIncludes(capturePhoneShellText, "CaptureSessionFollowUpStatus", "the production phone recorder owns client follow-up readiness");
requireIncludes(capturePhoneShellText, "CaptureSessionResultsCard", "the production phone recorder reaches automatically created editable Session results");
requireIncludes(
  recorderSurfaceText,
  "private var recorderScrollableSurface: AnyView",
  "the production recorder keeps its physical-device stack behind a concrete type-erasure boundary",
);
assert(
  recorderSurfaceText.match(/AnyView\(Group \{/g)?.length >= 6,
  "Capture recorder stack boundaries were collapsed back into one giant SwiftUI result-builder type.",
  { minimumBoundaries: 6 },
);
requireIncludes(capturePhoneShellText, "session.coachingTranscriptResults", "Capture renders canonical transcript-derived work without a second approval queue");
requireIncludes(capturePhoneShellText, "Adjust or remove them like any other work", "Capture explains that generated Session work is ordinary editable work");
requireIncludes(capturePhoneShellText, ".onChange(of: matchingTranscriptPhase)", "Capture refreshes the exact open Session when its device transcript attaches");
requireIncludes(capturePhoneShellText, "authoritativeSessionID: session.id", "device transcript attachment cannot refresh an unrelated Session");
requireExcludes(capturePhoneShellText, "private struct CapturePacketReviewLanesCard", "retired transcript suggestion approval queue");
assert(
  capturePhoneShellText.indexOf("CaptureSessionResultsCard(")
    < capturePhoneShellText.indexOf("MobileCoachClientFollowUpCard("),
  "Capture must present editable Session results before the optional client-sharing workflow.",
);
for (const needle of [
  "CaptureOnDeviceTranscriptAction_",
  "case .failed(_, let retryable) where !retryable",
  "Label(\"Record again\", systemImage: \"mic.badge.plus\")",
  "onRecordAgain: recordAgainAction(for: recording)",
  "Download English speech model",
  "Quipsly turns the finished recording into timed, editable text",
  "Your original audio stays unchanged",
  "Your original audio and first transcript stay safe. Corrections change the words you read and remain linked to the exact moment.",
]) {
  requireIncludes(
    capturePhoneShellText,
    needle,
    "Capture exposes an honest and reachable on-device transcript lifecycle",
  );
}
requireIncludes(
  localRecordingLibraryText,
  "var needsClearSpeechRetry: Bool",
  "decoded very-low-level sources expose a focused recovery state",
);
for (const needle of [
  "SpeechTranscriber.isAvailable",
  "AssetInventory.status(forModules:",
  "allowModelDownload",
  "downloadAndInstall()",
  "guard result.isFinal",
  "result.range.start.seconds",
  "OnDeviceTranscriptSource.fingerprint(fileURL)",
  "guard before == after",
  "Task.checkCancellation()",
  "FileProtectionType.completeUntilFirstUserAuthentication",
  ".withoutOverwriting",
  "clientRequestId: sidecar.clientRequestId",
  "recognitionExecution = sidecar.recognitionExecution",
  "artifactURLs(for: recordingId",
  "expectedOwnerAccountID: stored.sidecar.ownerAccountId",
  "verifiedCloudSHA256",
  "verifiedCloudSizeBytes",
  'speakerDiarization: "unavailable"',
  "humanPlaybackReviewRequired: false",
  "func resumeEligibleRecordings(",
  "pendingVerifiedUploadWakeups",
  "pendingVerifiedUploadWakeups.insert(recording.id)",
  "pendingVerifiedUploadWakeups.remove(recordingID)",
  "LocalRecordingLibrary.shared.recording(id: recordingID)",
  "signal.isEffectivelySilentForSpeech",
  "No clear speech was detected in this recording.",
  "shouldRetryCloudFallbackReadiness",
  "completedReadinessRetries",
  "cloudFallbackReadinessRetryDelaySeconds",
  "beginBackgroundTask(",
  "BGProcessingTaskRequest",
  "maximumRecordings: 1",
  "cloudTranscriptFallbackRequestId",
  "submitCloudFallback(recording:",
  "/api/mobile/capture/transcripts/cloud-fallback",
  "retryFailures: true",
  'reasonCode: "local-source-unavailable-after-upload"',
  "reconcileCanonicalTranscriptSources",
  "source.sha256?.lowercased() == expectedSHA256",
  "source.byteSize == String(expectedSize)",
  "transcript.id == transcriptJobID",
]) {
  requireIncludes(
    onDeviceTranscriptManagerText,
    needle,
    "on-device transcript evidence remains protected, source-bound, and explicit",
  );
}
for (const needle of [
  'kind: "very-low-level"',
  'signalStatus = peak <= thresholds.nearSilenceDbfs',
  'rms <= -60 && peak <= thresholds.surroundingSignalDbfs',
]) {
  requireIncludes(
    localRecordingLibraryText,
    needle,
    "source analysis distinguishes an effectively silent speech take from usable input",
  );
}
for (const [source, needle, label] of [
  [
    onDeviceTranscriptManagerText,
    "func verifiedUploadDidFinish(recording: LocalRecording)",
    "transcript delivery has one audio/video verification wake-up",
  ],
  [
    uploadText,
    "OnDeviceTranscriptManager.shared.verifiedUploadDidFinish",
    "durable upload evidence wakes transcript delivery directly",
  ],
  [
    uploadText,
    '"serverVerificationStatus": session.lastServerVerificationStatus',
    "upload completion publishes per-source verification evidence",
  ],
  [
    audioText,
    'serverVerificationStatus: userInfo["serverVerificationStatus"] as? String',
    "recorder recovery does not read mutable global verification state",
  ],
]) {
  requireIncludes(source, needle, label);
}
for (const needle of [
  "cloudTranscriptFallbackLastCheckedAt",
  "cloudTranscriptFallbackCompletedAt",
  "cloudTranscriptFallbackError",
  "reconcileCloudTranscriptFallback",
]) {
  requireIncludes(
    localRecordingLibraryText,
    needle,
    "protected local fallback state records canonical completion and failure without replacing source truth",
  );
}
for (const needle of [
  "struct MobileCaptureSourceTranscriptSummary",
  "let transcript: MobileCaptureSourceTranscriptSummary?",
  "let recognitionExecution: String?",
  "let quipslyCloudASRRequested: Bool?",
  "var transcriptRoutingSupportLine: String",
  "sessions.flatMap { $0.captureSources ?? [] }",
  "OnDeviceTranscriptManager.shared.reconcileCanonicalTranscriptSources",
]) {
  requireIncludes(
    bridgeText,
    needle,
    "authoritative Session refresh reconciles transcript status for each exact capture source",
  );
}
for (const needle of [
  "\\(onDeviceTranscriptSourceCount) on device",
  "\\(appleSpeechServiceTranscriptSourceCount) Apple service",
  "\\(quipslyCloudTranscriptSourceCount) Quipsly cloud",
]) {
  requireIncludes(
    bridgeText,
    needle,
    "joint transcript routing renders numeric source counts instead of placeholder property names",
  );
}
for (const placeholder of [
  '"(onDeviceTranscriptSourceCount) on device"',
  '"(appleSpeechServiceTranscriptSourceCount) Apple service"',
  '"(quipslyCloudTranscriptSourceCount) Quipsly cloud"',
]) {
  requireExcludes(
    bridgeText,
    placeholder,
    "joint transcript routing never exposes an uninterpolated implementation placeholder",
  );
}
for (const needle of [
  "mobileSourceTranscriptStatusMessage",
  "mobileSourceTranscriptRouting",
  'recognitionExecution === "quipsly-cloud"',
  "quipslyCloudASRRequested",
  "fallbackReasonCode",
  "The exact recording remains safe and can be tried again.",
  "wordCount: transcriptJob._count?.words ?? 0",
]) {
  requireIncludes(
    mobileCaptureSessionsServerText,
    needle,
    "Nest returns bounded source-specific transcript completion and failure evidence",
  );
}
for (const needle of [
  "TRANSCRIPT_PACKET_SOURCES.map",
  'sourceJson: { path: ["source"], equals: source }',
  "packetSnapshotMatchesResolvedSession",
]) {
  requireIncludes(
    coachingPacketsText,
    needle,
    "joint follow-through reuses one canonical Session packet across participant transcript anchors only when its source snapshot still matches",
  );
}
for (const needle of [
  "capture-transcript-follow-through-room:",
  "buildCoachingPacketFromTranscriptJob",
  "force: false",
]) {
  requireIncludes(
    captureTranscriptFollowThroughText,
    needle,
    "participant transcript completions serialize and converge through one Session-level follow-through build",
  );
}
requireIncludes(
  capturePhoneShellText,
  "transcriptActionRequiresLocalFile",
  "cloud fallback retry remains usable after the verified local source becomes unavailable",
);
requireExcludes(
  onDeviceTranscriptManagerText,
  "recording.transcriptJobId?.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty != false",
  "the upload-created canonical fallback job cannot suppress device-first transcript recovery",
);
for (const needle of [
  "cloudTranscriptFallbackRequestId",
  "cloudTranscriptFallbackReasonCode",
  "cloudTranscriptFallbackAcceptedAt",
  "markCloudTranscriptFallbackNeeded",
  "markCloudTranscriptFallbackAccepted",
]) {
  requireIncludes(
    localRecordingLibraryText,
    needle,
    "device failure and accepted cloud fallback survive relaunch in the account-bound recording ledger",
  );
}
for (const needle of [
  "recording.cloudTranscriptFallbackRequestId != nil",
  "recording.cloudTranscriptFallbackAcceptedAt == nil",
  "submitPendingCloudFallback(",
]) {
  requireIncludes(
    onDeviceTranscriptManagerText,
    needle,
    "verified upload automatically resumes a durable device-failure fallback without Library paperwork",
  );
}
for (const needle of [
  "private enum OnDeviceTranscriptAttemptStage",
  "case recognizingSpeech",
  "case preservingDeviceResult",
  "attemptStage = .recognizingSpeech",
  "attemptStage = .preservingDeviceResult",
  "else if attemptStage.allowsUnknownCloudFallback",
]) {
  requireIncludes(
    onDeviceTranscriptManagerText,
    needle,
    "only unexpected failures inside Apple speech recognition may purchase generic cloud ASR fallback",
  );
}
for (const needle of [
  "OnDeviceTranscriptBackgroundCoordinator.shared.register()",
]) {
  requireIncludes(
    appDelegateText,
    needle,
    "transcript background recovery is registered during application launch",
  );
}
for (const needle of [
  "mobileCaptureTranscriptAccessibleAssetWhere",
  "mobileCaptureTranscriptParticipantMismatch",
  'asset.status !== "VERIFIED"',
  "CLOUD_FALLBACK_SOURCE_MISMATCH",
  "CLOUD_FALLBACK_PARTICIPANT_MISMATCH",
  'status: "COMPLETED"',
  "providerExecutionRequested: false",
  "speculative: false",
  "deviceAttemptFailedFirst: true",
  "ensureCaptureTranscriptProcessingQueued",
  'isolationLevel: "Serializable"',
]) {
  requireIncludes(
    cloudTranscriptFallbackRouteText,
    needle,
    "cloud ASR starts only after bounded device failure evidence and reuses the exact verified source job",
  );
}
for (const needle of [
  "mobileCaptureTranscriptAccessibleAssetWhere",
  "mobileCaptureTranscriptParticipantMismatch",
  "LOCAL_AUDIO",
  "input.asset.participant.userId",
]) {
  requireIncludes(
    mobileCaptureTranscriptDeviceAccessText,
    needle,
    "device transcript and fallback routes share one participant-owned source boundary",
  );
}
for (const needle of [
  "await OnDeviceTranscriptManager.shared.resumeEligibleRecordings(",
  "case .active:",
  "case .background:",
  ".quipslyCaptureAccountIdentityDidChange",
]) {
  requireIncludes(
    captureAppText,
    needle,
    "launch foreground and identity changes reconcile durable transcript intent",
  );
}
for (const needle of [
  'const ON_DEVICE_PROVIDER = "apple-speech-transcriber-on-device"',
  'const APPLE_SPEECH_SERVICE_PROVIDER = "apple-speech-recognizer-service"',
  "recognitionExecutionForEngine",
  "acquirePrismaAdvisoryTransactionLock",
  'asset.status !== "VERIFIED"',
  "mobileCaptureTranscriptProcessingGate",
  "ON_DEVICE_TRANSCRIPT_SOURCE_MISMATCH",
  "ON_DEVICE_TRANSCRIPT_IDEMPOTENCY_CONFLICT",
  'speakerDiarization: "unavailable"',
  "humanPlaybackReviewRequired: false",
  'directlyEditable: true',
  "speakerLabel: sourceBoundSpeaker?.label ?? null",
  "speakerUserId: sourceBoundSpeaker?.userId ?? null",
  "ON_DEVICE_TRANSCRIPT_PARTICIPANT_MISMATCH",
  "const canonicalFallback = await transaction.transcriptJob.findFirst",
  "segments: { none: {} }",
  "await transaction.transcriptJob.update",
  'isolationLevel: "Serializable"',
]) {
  requireIncludes(
    onDeviceTranscriptRouteText,
    needle,
    "Nest ingests on-device text only through the immutable consent and source boundary",
  );
}
for (const needle of [
  "dispatchCaptureTranscriptFollowThrough",
  "transcriptJobId: result.transcriptJobId",
  'export const runtime = "nodejs"',
  "export const maxDuration = 60",
]) {
  requireIncludes(
    onDeviceTranscriptRouteText,
    needle,
    "a completed device transcript dispatches ordinary Session work without delaying its response",
  );
}
for (const needle of [
  "after(async () =>",
  "reconcileCaptureTranscriptFollowThrough(input)",
  "Immediate dispatch remains retryable",
]) {
  requireIncludes(
    captureTranscriptFollowThroughDispatchText,
    needle,
    "post-response follow-through is low-latency while scheduled reconciliation remains the durable recovery path",
  );
}
requireIncludes(uploadText, "lastRecordingAssetId", "Capture preserves canonical RecordingAsset identity separately from Studio MediaAsset identity");
assert(!mobileText.includes("struct RecorderControlBoard"), "the retired duplicate recorder board is absent from the shipping target");
requireIncludes(capturePhoneShellText, "MobileClientFollowUpCard(", "the production phone recorder reaches the released client follow-up card");
requireIncludes(capturePhoneShellText, "MobileCoachClientFollowUpCard(", "the production phone recorder reaches the assigned-coach follow-up editor");
requireIncludes(capturePhoneShellText, "CaptureTodayClientFollowUpOpen_", "Today exposes one exact new coaching follow-up handoff");
requireIncludes(capturePhoneShellText, "onOpenClientFollowUp", "Today opens the exact Session rather than acknowledging a follow-up in place");
requireIncludes(mobileText, "CaptureClientFollowUpOpenState_", "the native follow-up card exposes ordinary new/viewed state after automatic acknowledgement");
requireIncludes(mobileText, "CaptureClientFollowUpCurrentProgress_", "the native follow-up distinguishes immutable shared content from live canonical progress");
requireIncludes(mobileText, "current.output.contentSha256 == followUp.contentSha256", "the native live projection is bound to the exact released hash before rendering");
requireIncludes(mobileText, "CaptureClientFollowUpOpenTask_", "the native follow-up exposes the exact current task in canonical Work");
requireIncludes(mobileText, "CaptureClientFollowUpOpenGoal_", "the native follow-up exposes the exact current goal in canonical Work");
requireIncludes(mobileText, "CaptureCoachFollowUpSave", "the native coach editor exposes an explicit private revision save");
requireIncludes(mobileText, "CaptureCoachFollowUpKeyboardDone", "the native coach editor exposes a reachable keyboard dismissal action across its long form");
requireIncludes(mobileText, "Share with \\(output.recipientLabel)", "the native coach editor names the exact recipient on its single share action");
requireIncludes(mobileText, "CaptureCoachFollowUpRelease", "the native coach editor exposes the bounded in-app release action");
requireIncludes(mobileText, "CaptureClientFollowUpSource_", "released follow-up records return to their exact permitted transcript source");
requireIncludes(mobileText, "Exact source ·", "the native follow-up snapshot makes its immutable source range visible");
requireIncludes(mobileText, ".disabled(previewOnly || isSaving", "deterministic preview cannot save a private follow-up revision");
requireIncludes(mobileText, "CaptureCoachFollowUpReleaseHeld", "the native coach editor makes changed-source release holds explicit");
requireIncludes(mobileText, "CaptureCoachFollowUpUnsavedChanges", "the native coach editor distinguishes unsaved values from the immutable releasable revision");
requireIncludes(mobileText, ".disabled(previewOnly || !releaseReady || isSaving", "preview and changed-source drafts cannot share a follow-up");
requireIncludes(bridgeText, "let sourceAnchor: MobileCaptureTodayTranscriptSourceAnchor?", "native follow-up rows decode their immutable transcript anchors");
requireIncludes(bridgeText, "var currentFollowThrough: MobileCapturePriorFollowThrough?", "native Sessions decode live work as a separate optional projection beside the immutable follow-up");
requireIncludes(captureExperienceModelText, "capturePreviewClientFollowUpWorkspace", "deterministic Capture preview operates the real coach follow-up source-return card");
requireIncludes(deterministicUITestsText, "testCoachFollowUpPreservesExactSourceWithoutReleasingPreview", "operated iPhone coverage verifies source return without preview mutation");
requireIncludes(deterministicUITestsText, "testTodayOpensTheExactNewClientFollowUpWithoutAcknowledgingIt", "operated iPhone coverage verifies the recipient Today-to-Session follow-up handoff");
requireIncludes(bridgeText, "/client-follow-up", "the native bridge reads and acknowledges the relationship-authorized follow-up route");
requireIncludes(bridgeText, "ACKNOWLEDGE_OPEN", "the native bridge uses the bounded follow-up acknowledgement action");
requireIncludes(bridgeText, '"action": action', "the native bridge uses canonical create-or-revise follow-up actions");
requireIncludes(mobileText, "CaptureClientFollowUpShareFile_", "the native follow-up exposes a standard iPhone file-share action");
requireIncludes(mobileText, "UIActivityViewController", "the native follow-up uses the standard system share sheet");
requireIncludes(mobileText, ".completeFileProtection", "the prepared native follow-up file uses complete file protection");
requireIncludes(mobileText, "Prepared from a reviewed Quipsly client-safe snapshot", "the native export states its reviewed client-safe boundary");
requireIncludes(bridgeText, '"action": "EXPORT"', "the native bridge records a revision-bound client follow-up export receipt");
requireIncludes(bridgeText, '"expectedContentSha256": output.contentSha256', "the native export receipt is bound to the exact client-safe content hash");
requireIncludes(bridgeText, '"action": "RELEASE"', "the native bridge uses the canonical bounded release action");
requireIncludes(bridgeText, '"expectedRevision"', "the native bridge binds revisions and release to current canonical truth");
requireIncludes(bridgeText, '"clientInstanceId": CaptureClientInstallation.id', "native provider-room join keeps a stable installation-scoped endpoint identity");
requireIncludes(bridgeText, '"clientKind": "ios"', "native provider-room join identifies its iOS client kind");
requireIncludes(bridgeText, '"endpointRole": endpointRole == "companion" ? "companion" : "primary"', "native provider-room join declares the call-audio endpoint role");
requireIncludes(canonicalTaskStatusText, 'CanonicalTaskDecisionReason = "MISSED_OCCURRENCE_SKIPPED"', "canonical task status bounds the missed-occurrence decision vocabulary");
requireIncludes(canonicalTaskStatusText, 'kind: "quipsly-task-occurrence-resolution-v1"', "canonical missed-occurrence resolution writes an inspectable occurrence receipt");
requireIncludes(canonicalTaskStatusText, "historicalRecordPreserved: true", "canonical missed-occurrence receipts declare preserved history");
requireIncludes(canonicalTaskStatusText, "externalSideEffects: false", "canonical missed-occurrence decisions cannot imply calendar or provider effects");
requireIncludes(runtimeUISmokeRunnerText, '-only-testing:"HighGroundCaptureUITests/$TEST_CLASS/$TEST_CASE"', "runtime UI smoke keeps each journey focused to one selected class and test");
requireIncludes(runtimeUISmokeRunnerText, "does not bypass auth", "runtime UI smoke documents no auth bypass");
requireIncludes(generatedMobileCaptureAuthSmokeText, "run-runtime-ui-smoke", "generated auth smoke can run the real native UI proof");
requireIncludes(generatedMobileCaptureAuthSmokeText, "run-capture-runtime-ui-smoke.sh", "generated auth smoke reuses the native runtime UI runner");
requireIncludes(generatedMobileCaptureAuthSmokeText, "Runtime UI smoke used generated credentials through native Firebase login", "generated auth smoke documents real native login");
requireIncludes(generatedMobileCaptureAuthSmokeText, "password and tokens were not printed", "generated auth smoke must not expose runtime UI secrets");
for (const needle of [
  "createGeneratedSourceInboxCapture",
  "assertGeneratedSourceInboxFiled",
  "sameFilingIdentityOnRetry: true",
  "sameAnnotationIdentityOnRetry: true",
  "exactAnnotationAnchorPreserved: true",
  "canonicalTagPreserved: true",
  "appendOnlyAnnotationRevisionPreserved: true",
  "privateCapturePreserved: true",
  "researchExportReadback: true",
]) {
  requireIncludes(
    generatedMobileCaptureAuthSmokeText,
    needle,
    "generated auth smoke independently proves private source filing through Nest",
  );
}
for (const needle of [
  "completeFileProtectionUntilFirstUserAuthentication",
  "ownerAccountID",
  "expectedCaptureUpdatedAt",
  "annotationRequestID",
  "annotationTagIDs",
  "annotationAcknowledgementMatches",
  "var clientRequestID: String { id.uuidString.lowercased() }",
  "source-inbox-filings-v1.last-known-good.json",
  "ACKNOWLEDGEMENT_MISMATCH",
  "/api/mobile/capture/inbox",
]) {
  requireIncludes(
    sourceInboxFilingText,
    needle,
    "private source filing uses an actor-partitioned protected iPhone outbox and exact Nest acknowledgement",
  );
}
for (const needle of [
  'accessibilityIdentifier("CaptureSourceInbox")',
  '"CaptureSourceInboxFile_\\(source.id)"',
  'accessibilityIdentifier("CaptureSourceFilingConfirm")',
  'accessibilityIdentifier("CaptureSourceFilingAnnotationBody")',
  'accessibilityIdentifier("CaptureSourceFilingAnnotationVisibility")',
  '"File + annotate"',
  "Your note stays linked to the complete capture, not just this preview.",
  "Keeps the original Inbox capture unchanged",
  "Keeps this source and where it came from together",
]) {
  requireIncludes(
    capturePhoneShellText,
    needle,
    "Today exposes an explicit private-source Research destination decision and safety boundary",
  );
}
for (const needle of [
  "actorOwnedPrivateInbox: true",
  "writableResearchDestinationsOnly: true",
  "stableFilingIdentityRequired: true",
  "researchFilings: { none: {} }",
  "expectedCaptureUpdatedAt",
  "optionalSourceAnnotation: true",
  "exactWholeCaptureAnchor: true",
  "canonicalProjectTagsOnly: true",
  "annotationMutatesSource: false",
  "filePersonalSourceIntoResearch",
]) {
  requireIncludes(
    mobileSourceInboxRouteText,
    needle,
    "mobile source Inbox route is actor scoped, revision guarded, and uses the canonical filing service",
  );
}
for (const needle of [
  "input.expectedCaptureUpdatedAt",
  "captureUpdatedAt?.getTime() !== input.expectedCaptureUpdatedAt.getTime()",
  "privateCaptureMutated: false",
  "createSourceAnnotationInTransaction",
  'surface: "ios-capture"',
  "TransactionIsolationLevel.Serializable",
]) {
  requireIncludes(
    personalSourceFilingText,
    needle,
    "canonical personal-source filing preserves reviewed revision and immutable provenance",
  );
}
requireIncludes(mobileCapturePreflightText, "validate-livekit-provider-room.sh", "mobile capture preflight uses the bounded LiveKit provider-room validator");
requireIncludes(mobileCapturePreflightText, "--build-simulator", "mobile capture preflight runs the bounded simulator build proof");
requireIncludes(mobileCapturePreflightText, "quipsly-ios-shared-episode-watch.test.mjs", "mobile capture preflight preserves shared Episode Watch boundaries");
requireIncludes(episodeWatchText, "authenticatedDownload(", "shared Watch streams protected media under native auth");
requireIncludes(episodeWatchText, 'URLQueryItem(name: "watch", value: "1")', "shared Watch polls the bounded native projection");
requireIncludes(episodeWatchText, '"expectedRevision": room.revision', "shared Watch mutations are revision guarded");
requireIncludes(episodeWatchText, 'type: "START_SESSION"', "shared Watch binds to an authoritative Capture clock");
requireIncludes(episodeWatchText, "serverClockOffsetSeconds", "shared Watch projects the server clock instead of trusting device wall time");
requireIncludes(episodeWatchText, "Shared Watch lost contact with Nest.", "shared Watch exposes stale connectivity");
requireIncludes(episodeWatchText, "if room != nextRoom", "shared Watch does not republish an unchanged canonical room every second");
requireIncludes(episodeWatchText, "consecutivePollFailures >= 3 ? 5.0 : 1.0", "shared Watch backs off after repeated connectivity failures");
requireIncludes(episodeWatchText, "loadingRequestID == requestID", "shared Watch cancellation cannot strand or clear a newer loading request");
requireIncludes(episodeWatchText, "try Task.checkCancellation()", "shared Watch refuses a stale response after its UI task is cancelled");
requireIncludes(episodeManuscriptText, "loadingRequestID == requestID", "episode manuscript cancellation cannot strand or clear a newer loading request");
requireIncludes(capturePhoneShellText, "guard visibleTab == .record else { return }", "episode collaboration polling runs only while Record is the visible root surface");
requireIncludes(episodeChatText, "let messagesChanged = messages != nextMessages", "collaboration chat does not republish an unchanged thread on every poll");
requireIncludes(episodeWatchText, "CaptureEpisodeWatchPlayPauseButton", "shared Watch has a reachable native play and pause control");
requireIncludes(episodeChatText, "authenticatedData(", "episode chat uses the verified native account request boundary");
requireIncludes(episodeChatText, "FileProtectionType.complete", "episode chat cache is protected while the iPhone is locked");
requireIncludes(episodeChatText, "stableOwnerSnapshot()", "episode chat cache is partitioned by stable account owner");
requireIncludes(episodeChatText, '"clientMessageId": requestID.uuidString.lowercased()', "episode chat retries preserve one client message identity");
requireIncludes(episodeChatText, "CaptureEpisodeChatOpenButton", "episode chat is reachable beside the primary recorder");
requireIncludes(episodeChatText, "Recording and playback never start from chat.", "episode chat states the non-capture boundary");
requireIncludes(episodeChatText, "case engagement", "native collaboration chat retains a relationship-wide coaching scope");
requireIncludes(episodeChatText, "MobileChatPersistedLiveHint.engagementThreadKey", "native coaching conversation binds to the canonical engagement thread key");
requireIncludes(episodeChatText, "payload.engagement?.id.lowercased() == context.scopeKey", "native coaching conversation rejects a mismatched relationship response");
requireIncludes(episodeChatText, "CaptureCoachingConversationOpenButton", "the iPhone client space exposes its durable relationship conversation");
requireIncludes(captureCoachingHomeText, "CaptureCoachingSessionContinuity", "the iPhone client space exposes relationship Session continuity");
requireIncludes(runtimeUISmokeTestsText, "Phone coaching conversation", "the fresh compiled iPhone journey authors relationship conversation through product UI");
requireIncludes(sessionConversationText, "CaptureSessionChatOpenButton", "exact-call Session conversation is reachable beside the primary recorder");
requireIncludes(sessionConversationText, "QuipslyCapture/SessionConversation", "Session conversation uses a distinct protected cache namespace");
requireIncludes(sessionConversationText, 'hint.threadKey == "session:\\(context.roomID)"', "native Session hints accept only the exact requested durable thread");
requireIncludes(sessionConversationText, '"clientRequestId": send.requestID.uuidString.lowercased()', "native Session message retries preserve one request identity");
requireIncludes(sessionConversationText, "Messages stay with this Session.", "Session conversation states its exact-call collaboration boundary");
requireIncludes(sessionConversationText, "AuthManager.shared.authenticatedData", "Session conversation uses the verified native account request boundary");
requireIncludes(sessionConversationText, "FileProtectionType.complete", "Session conversation cache is protected while the iPhone is locked");
requireIncludes(sessionConversationText, "stableOwnerSnapshot()", "Session conversation cache is partitioned by stable account owner");
requireIncludes(sessionConversationText, "await load(session: session, forceRefresh: true, quietly: true)", "a Session live hint triggers an authenticated durable read instead of applying provider payload");
for (const [text, domain, recoveryCopy, label] of [
  [captureSessionPreflightText, 'errorDomain: "QuipslyCapture.SessionPreflight"', "Your microphone and camera choices are unchanged; try again.", "Session setup check"],
  [captureRecordingCoordinatorText, 'errorDomain: "QuipslyCapture.RecordingCoordination"', "The recording remains safe on this device and will retry automatically.", "recording coordination"],
  [sessionConversationText, 'errorDomain: "QuipslyCapture.SessionConversation"', "Your message is preserved for retry.", "Session conversation"],
]) {
  requireIncludes(text, "AuthResponseDecoder.decode(", `${label} uses the recoverable response boundary`);
  requireIncludes(text, domain, `${label} keeps diagnosable response categories`);
  requireIncludes(text, recoveryCopy, `${label} explains what remains safe`);
}
requireIncludes(runtimeUISmokeRunnerText, "session-conversation)", "the native runtime harness retains an explicit Session conversation qualification mode");
requireIncludes(runtimeUISmokeRunnerText, 'TEST_CASE="testSessionConversationRoundTripsBetweenBrowserAndIPhone"', "the Session conversation qualification mode selects exactly one cross-device native test");
requireIncludes(runtimeUISmokeTestsText, "testSessionConversationRoundTripsBetweenBrowserAndIPhone", "the compiled native suite reads a browser message and authors an iPhone reply");
requireIncludes(runtimeUISmokeTestsText, 'app.otherElements["GlobalCaptureBanner"].exists', "native conversation qualification proves messaging does not imply retained recording");
requireIncludes(runtimeUISmokeTestsText, 'app.buttons["ProviderLeaveRoomButton"].exists', "native conversation qualification proves messaging does not join provider media");
requireIncludes(episodeChatText, 'static let topic = "quipsly.chat.persisted.v1"', "episode chat shares the bounded durable-message hint topic with Nest");
requireIncludes(episodeChatText, "Set(dictionary.keys) == allowedKeys", "episode chat rejects transient packets with undeclared content fields");
requireIncludes(episodeChatText, "await load(session: session, forceRefresh: true, quietly: true)", "a live chat hint triggers an authenticated durable read instead of applying provider payload as chat");
requireIncludes(providerRoomText, "activeChatThreadKeys.contains(hint.threadKey)", "the provider bridge accepts chat hints only for the active Session or exact bound Episode");
requireIncludes(providerRoomText, "MobileChatPersistedLiveHint.decodeStrict(data)", "incoming LiveKit chat hints use the strict bounded decoder");
requireIncludes(capturePhoneShellText, "publishChatPersistedHint(hint)", "the shipping Capture shell publishes only post-persistence chat hints");
requireIncludes(capturePhoneShellText, "episodeChat.receiveLiveHint", "the shipping Capture shell refreshes the episode thread from received hints");
requireIncludes(capturePhoneShellText, "sessionConversation.receiveLiveHint", "the shipping Capture shell refreshes only the exact Session thread from received hints");
requireIncludes(capturePhoneShellText, "CaptureRecorderInputEvidence", "the primary recorder exposes inspectable audio evidence instead of an opaque percentage");
requireIncludes(capturePhoneShellText, 'accessibilityLabel("Microphone level")', "native audio metering uses a familiar primary label");
requireIncludes(capturePhoneShellText, "Not LUFS or true peak.", "native audio metering keeps its engineering limits available to accessibility and diagnostics");
requireIncludes(capturePhoneShellText, "averagePowerDB: audioCapture.inputLevelDB", "the recorder renders the measured average-power value");
requireIncludes(capturePhoneShellText, "peakPowerDB: audioCapture.peakInputLevelDB", "the recorder renders the measured sample-peak value");
requireIncludes(nestChatRouteText, "studioEpisodeProduction.findUnique", "episode chat validates the canonical parent episode");
requireIncludes(nestChatRouteText, "sessionConversationAccessWhere", "Session chat reads use canonical participant and project access rules");
requireIncludes(nestChatRouteText, "sessionMutationAccessWhere", "Session chat writes use canonical participant mutation rules");
requireIncludes(nestChatRouteText, "idempotentReplay: true", "episode chat server deduplicates exact message retries");

const authCombined = `${authText}\n${loginText}`;
requireIncludes(authText, "SecItemUpdate(lookup as CFDictionary, replacement as CFDictionary)", "Keychain rotation updates by stable item identity instead of matching the replacement secret value");
requireIncludes(authText, "guard updateStatus == errSecItemNotFound else { return false }", "Keychain persistence reports update failures instead of silently claiming the session is durable");
requireIncludes(authText, "This device could not protect the refreshed Quipsly session in Keychain", "native sign-in exposes a truthful storage failure instead of opening an unrecoverable session");
requireIncludes(authText, "Account created. Check your inbox, verify your email, then sign in.", "password sign-up uses a familiar verification handoff");
requireExcludes(authText, "beta recording or upload access", "retired beta access language is absent from paid account creation");
for (const needle of [
  "accounts:signInWithPassword",
  "accounts:signInWithIdp",
  'URLQueryItem(name: "providerId", value: "google.com")',
  "accounts:signUp",
  "accounts:lookup",
  "accounts:sendOobCode",
  '"requestType": "VERIFY_EMAIL"',
  '"requestType": "PASSWORD_RESET"',
  "https://securetoken.googleapis.com",
  "/v1/token?key=",
  "validatedAuthEmulatorURL",
  "/securetoken.googleapis.com",
  "/api/mac/firebase-client-config",
  "/api/mac/session-check",
  "Authorization",
  "Bearer",
  "QuipslyCaptureEmailField",
  "QuipslyCapturePasswordField",
  "QuipslyCaptureSignInButton",
  "QuipslyCaptureCreateAccountModeButton",
  "QuipslyCaptureCreateAccountButton",
  "QuipslyCapturePasswordResetButton",
  "QuipslyCaptureGoogleSignInButton",
  "QuipslyCaptureAppleSignInButton",
  "QuipslyCaptureGoogleIdentityContinuityHint",
  "QuipslyCaptureAccountSupportLink",
]) {
  requireIncludes(authCombined, needle, "native reviewer auth");
}
requireExcludes(
  loginText,
  "QuipslyCapturePasswordConfirmationField",
  "account creation does not make people repeat an Apple-generated password",
);
requireIncludes(
  projectText,
  'repositoryURL = "https://github.com/google/GoogleSignIn-iOS.git";',
  "Capture pins the official GoogleSignIn iOS package",
);
requireIncludes(
  projectText,
  "kind = exactVersion;",
  "Capture uses an exact Swift package requirement",
);
requireIncludes(
  projectText,
  "version = 9.1.0;",
  "Capture requires the reviewed GoogleSignIn 9.1.0 API",
);
requireIncludes(
  swiftPackageResolutionText,
  '"version" : "9.1.0"',
  "Swift package resolution locks GoogleSignIn 9.1.0",
);
requireIncludes(
  appDelegateText,
  "GIDSignIn.sharedInstance.handle(url)",
  "AppDelegate returns the Google OAuth redirect to the official SDK",
);
requireIncludes(
  authText,
  'object(forInfoDictionaryKey: "GIDClientID")',
  "Google sign-in fails closed until its iOS client identifier is configured",
);
requireIncludes(
  authText,
  'object(forInfoDictionaryKey: "GIDServerClientID")',
  "Google sign-in requests a server-audience ID token for Firebase exchange",
);
requireIncludes(
  appInfoText,
  "<key>GIDClientID</key>",
  "Capture ships its iOS Google client identifier",
);
requireIncludes(
  appInfoText,
  "<key>GIDServerClientID</key>",
  "Capture ships its Firebase web audience identifier",
);
requireRegex(
  appInfoText,
  /<string>249115653261-[a-z0-9]+\.apps\.googleusercontent\.com<\/string>/,
  "Capture Google clients belong to the quipsly-reef project",
);
requireRegex(
  appInfoText,
  /<string>com\.googleusercontent\.apps\.249115653261-[a-z0-9]+<\/string>/,
  "Capture registers the quipsly-reef Google callback scheme",
);

const nativeSignIn = authText.slice(
  authText.indexOf("func signIn(email rawEmail:"),
  authText.indexOf("func createAccount(email rawEmail:"),
);
const passwordExchange = nativeSignIn.indexOf("signInWithFirebasePassword");
const accountLookup = nativeSignIn.indexOf("fetchFirebaseAccount", passwordExchange);
const verifiedMailboxGate = nativeSignIn.indexOf("account.emailVerified == true", accountLookup);
const nestVerification = nativeSignIn.indexOf("verifyQuipslyNativeSession", verifiedMailboxGate);
const durableCredentialCommit = nativeSignIn.indexOf("saveVerifiedNativeSession", nestVerification);
assert(
  passwordExchange >= 0
    && accountLookup > passwordExchange
    && verifiedMailboxGate > accountLookup
    && nestVerification > verifiedMailboxGate
    && durableCredentialCommit > nestVerification,
  "Native sign-in must prove the Firebase mailbox and Nest actor before caching credentials.",
  { label: "native auth proves verified mailbox and Nest owner before Keychain commit" },
);

const nativeAccountCreation = authText.slice(
  authText.indexOf("func createAccount(email rawEmail:"),
  authText.indexOf("func sendPasswordReset(email rawEmail:"),
);
requireIncludes(nativeAccountCreation, "createFirebasePasswordAccount", "native account creation uses Firebase");
requireIncludes(nativeAccountCreation, "sendEmailVerification", "native account creation sends mailbox verification");
assert(
  !nativeAccountCreation.includes("saveNativeCredentials")
    && !nativeAccountCreation.includes("saveVerifiedNativeSession"),
  "Unverified account creation must never cache Firebase credentials.",
  { label: "unverified account creation leaves Firebase tokens memory-only" },
);
requireIncludes(loginText, "GoogleSignInButton(", "Google identities are directed to the canonical native provider");
requireIncludes(loginText, "ASAuthorizationAppleIDButton(", "Apple identities use the system-provided sign-in control");
requireIncludes(loginText, "QuipslyCaptureAppleSignInButton", "Apple is available as an equivalent privacy-preserving primary sign-in action");
requireIncludes(loginText, "QuipslyCaptureGoogleSignInButton", "Google remains available as a standard sign-in action");
requireIncludes(captureEntitlementsText, "com.apple.developer.applesignin", "Capture declares the Sign in with Apple capability");
requireIncludes(captureEntitlementsText, "<string>Default</string>", "Capture is the primary Sign in with Apple app for its identifier");
requireIncludes(captureEntitlementsText, "com.apple.developer.associated-domains", "Capture declares Associated Domains for standard HTTPS handoff");
requireIncludes(captureEntitlementsText, "applinks:nest.quipsly.com", "Capture associates only the canonical Nest host");
requireIncludes(captureUniversalLinkRouteText, "585GUXMY5M.com.highgroundodyssey.HighGroundCapture", "Nest publishes the exact Capture application identifier");
requireIncludes(captureUniversalLinkRouteText, '\"/\": \"/sessions/*\"', "Universal Links are bounded to Session paths");
requireIncludes(captureUniversalLinkRouteText, '\"?\": { open: \"capture\" }', "Universal Links require an explicit Capture handoff query");
requireIncludes(captureUniversalLinkBuilderText, "https://nest.quipsly.com", "Capture handoffs use the canonical HTTPS Nest origin");
requireIncludes(captureUniversalLinkBuilderText, "quipsly://session/", "Same-site Open Capture actions use the registered app scheme");
requireIncludes(appInfoText, "<string>quipsly</string>", "Capture registers the explicit same-site launch scheme");
requireIncludes(appleSignInCoordinatorText, "SecRandomCopyBytes", "Apple sign-in uses a cryptographically random replay nonce");
requireIncludes(appleSignInCoordinatorText, "request.nonce = Self.sha256(nonce)", "Apple receives only the SHA-256 nonce challenge");
requireIncludes(authText, 'URLQueryItem(name: "providerId", value: "apple.com")', "Firebase exchanges the native Apple credential with the canonical provider");
requireIncludes(authText, 'URLQueryItem(name: "nonce", value: rawNonce)', "Firebase receives the one-time unhashed nonce for replay validation");
requireIncludes(authText, "verifyQuipslyNativeSession(accessToken: idToken)", "federated identity still passes the canonical Quipsly owner boundary");
requireIncludes(
  authText,
  "AuthResponseDecoder.decode(",
  "native authentication endpoints use stable response decoding",
);
requireIncludes(
  authResponseDecoderText,
  "NSUnderlyingErrorKey: error",
  "authentication response failures retain their underlying development diagnostic",
);
requireIncludes(
  authResponseDecoderText,
  "Your work is safe on this device",
  "temporary authentication service failures explain local-source durability",
);
requireExcludes(
  authResponseDecoderText,
  "return error.localizedDescription",
  "raw Foundation decoder failures never become person-facing authentication copy",
);
requireIncludes(
  protectedSessionCacheIdentityText,
  "cachedOwner == activeOwner",
  "protected Session recovery is bound to Nest's immutable actor identity",
);
requireIncludes(
  protectedSessionCacheIdentityText,
  "cacheSchemaVersion == schemaVersion",
  "email-era Session caches fail closed rather than crossing account boundaries",
);
requireIncludes(
  bridgeText,
  "activeOwnerAccountID: AuthManager.currentStoredOwnerID()",
  "Session cache restoration checks the currently verified Quipsly actor",
);
requireIncludes(loginText, "Create an account with email and password.", "account creation keeps the optional email path plain");
requireExcludes(loginText, "We will ask you to verify your email once.", "account creation does not front-load verification instructions before the email path is chosen");
for (const forbidden of [
  "/api/mac/session-handoff",
  "/api/mac/session-exchange",
  "ASWebAuthenticationSession(",
]) {
  assert(!authCombined.includes(forbidden), "Retired native handoff path was reintroduced.", { forbidden });
}

for (const forbidden of [
  "mock_patreon_access_token",
  "PatreonAuthManager",
  "LoginWithPatreonButton",
  "QUIPSLY_CLIENT_ID",
  "PatreonAccessToken",
]) {
  assert(!mobileSwiftSourceTreeText.includes(forbidden), "Retired native mock Patreon auth path was reintroduced.", { forbidden });
}

requireIncludes(audioText, "guard recordingConsentGranted else", "recorder consent gate");
requireIncludes(audioText, "Recording needs explicit consent before capture starts.", "recorder consent error");
requireIncludes(audioText, "requestRecordPermission", "microphone permission request");
requireIncludes(
  audioText,
  "@Published private(set) var captureState: AudioCaptureState = .idle",
  "single visible recording state source",
);
requireIncludes(
  capturePhoneShellText,
  'accessibilityIdentifier("CaptureRecorderNoSignalWarning")',
  "a sustained flat microphone route becomes visible without interrupting capture",
);
requireIncludes(
  capturePhoneShellText,
  "try await Task.sleep(for: .seconds(4))",
  "the live no-signal warning waits for a sustained flat meter",
);
requireIncludes(
  capturePhoneShellText,
  "Your recording is still running and safe.",
  "the no-signal warning preserves source confidence and gives direct recovery guidance",
);
assert(
  !audioText.includes("@Published private(set) var isRecording"),
  "Recorder must not publish a second Boolean recording truth alongside captureState.",
);
requireIncludes(audioText, "recordingConsentGranted ? \"granted\" : \"missing\"", "recorder state consent broadcast");
requireIncludes(audioText, "Production capture rule: never silently delete local recordings.", "no silent recording deletion");
requireIncludes(audioText, "UploadManager.shared.startUpload", "recording upload trigger");

for (const needle of [
  "quipsly-mobile-capture-gcs-resumable-v2",
  "computeFileDigest",
  "SHA256()",
  "/mobile/capture/uploads/resumable",
  "/resumable/finalize",
  "uploadTask(with: request, fromFile: fileURL)",
  "restartUploadSession",
  "prepareFreshCanonicalTransfer",
  "isAllowedGCSUploadURL",
  "server-computed size and SHA-256",
]) {
  requireIncludes(uploadText, needle, "direct GCS resumable upload");
}

for (const needle of [
  ".completeUntilFirstUserAuthentication",
  ".atomic",
  "kSecAttrAccessibleAfterFirstUnlockThisDeviceOnly",
  "isExcludedFromBackup",
  "capabilityService",
]) {
  requireIncludes(uploadLedgerText, needle, "protected upload ledger and capability storage");
}

for (const needle of [
  "URLSessionConfiguration.background",
  "waitsForConnectivity = true",
  "activeUploads",
  "holdUploadForRecovery",
  "retryRecoverableUploads",
  "Retrying",
  "Upload held. Local recording preserved for recovery.",
  "Quipsly could not open the preserved local recording",
  "Quipsly could not write a temporary upload chunk",
  "Check Nest URL settings and retry",
  "/mobile/capture/uploads/chunk",
  "X-Recording-Consent-Granted",
  "X-Recording-Segments",
  "lastServerVerificationStatus",
  "lastServerVerificationDetail",
  "lastLocalRetentionReason",
  "serverVerification",
  "localRetention",
  "processingDisposition",
  "processingHoldReason",
  "Cloud bytes verified and protected. Quipsly will not use this source because its recording-start permission boundary was incomplete. Local original preserved.",
  "Upload verified. Local original preserved until retention policy allows cleanup.",
  "Authorization",
  "Bearer",
]) {
  requireIncludes(uploadText, needle, "resilient upload and legacy-job recovery compatibility");
}

for (const needle of [
  "import CallKit",
  "CXProviderConfiguration()",
  "CXStartCallAction",
  "CXEndCallAction",
  "didActivate audioSession",
  "didDeactivate audioSession",
  "reportOutgoingCall",
  "isNativeCallPresentationActive",
  "nativeCallPresentationLabel",
  "CallKit reset the native call surface",
  "Quipsly recording truth remains separate",
  "waitForCallAudioActivation(",
  "expectedOwnerSnapshot: AuthManager.StableOwnerSnapshot",
  "abortForAccountChange",
  "abortAfterCallAudioActivationFailure",
  "CallKit did not activate the room audio session before timeout.",
]) {
  requireIncludes(providerRoomText, needle, "native CallKit room presentation");
}

for (const needle of [
  "CaptureRecordingModePicker",
  "CaptureRehearsalReadinessCard",
  "CaptureConsentConfirmationSheet",
  "Allow recording?",
  "Quipsly remembers your choice for this Session. Recording starts only when the coach or host presses Record.",
  "Allow recording",
  "Recording options",
  "Recording is off",
  "Button(\"Cancel\")",
  "Revoke",
  "Try again",
  "Delete account",
  "privacy/account-deletion",
  "Review transcript",
  "Transcript suggestions are saved with the Session. Open one to listen, correct, or edit.",
  "CaptureProviderRoomControls",
  "CaptureCallInputRoute",
  "CaptureUseCallAudioToggle",
  "CaptureJoinMicrophoneToggle",
  "CaptureJoinCameraToggle",
  "CaptureCallAudioRoutePicker",
  "CaptureCallOutputRoute",
  "Join call",
  "CaptureStudioHandoffCard_",
  "CaptureSourceTruthFootnote",
  "CaptureLibraryJournalWarning",
  "\\(CaptureDeviceVocabulary.thisDeviceCapitalized) keeps the original microphone recording.",
  "Local source stopped; upload recovery remains independent.",
]) {
  requireAnyIncludes(shippingCaptureUIText, [needle, needle.replace("\\(", "(")], "reachable capture reviewer UI");
}

requireIncludes(contentViewText, "@StateObject private var captureModel = CaptureExperienceModel()", "the app root owns one stable Capture model across authentication transitions");
requireIncludes(contentViewText, "CapturePhoneShell(model: captureModel, visibleTab: $visibleTab)", "the app root opens the production capture-first shell with durable state and navigation ownership");
requireIncludes(contentViewText, "captureModel: captureModel", "the protected offline shell receives the same app-owned Capture model");
requireIncludes(contentViewText, "@State private var visibleTab: CaptureRootTab", "the app root owns navigation across online and protected-offline shell transitions");
requireIncludes(contentViewText, "visibleTab = .library", "the app root returns a recovered source journey to Library after a transport failure");
requireIncludes(capturePhoneShellText, "@Binding var visibleTab: CaptureRootTab", "the capture shell consumes app-root navigation instead of resetting it");
requireIncludes(contentViewText, "ProtectedOfflineLibraryShell", "the app root preserves protected offline recovery");
requireIncludes(contentViewText, "mustKeepRecorderVisible", "the app root keeps active local capture reachable across auth expiry");
assert(
  !mobileSwiftSourceTreeText.includes("Simulated Success:"),
  "Capture must not compile a publisher that fabricates success.",
);
assert(
  !mobileSwiftSourceTreeText.includes("This is a simplified sequential builder for the prototype"),
  "Capture must not compile the retired facade exporter.",
);
assert(
  !mobileSwiftSourceTreeText.includes("/Users/wall-e/Dev/high-ground-studio/"),
  "Capture source must not contain a developer-machine media fallback.",
);
assert(
  !mobileSwiftSourceTreeText.includes("Clip preview placeholder"),
  "Capture must not present a placeholder clip preview as a product surface.",
);
for (const needle of [
  "CaptureRootTab.today",
  "CaptureRootTab.record",
  "CaptureRootTab.work",
  "CaptureRootTab.library",
  "CaptureRootTab.account",
  "CaptureRecorderHero",
  "CaptureStartButton",
  "CaptureConfirmConsentButton",
  "CaptureConsentConfirmationSheet",
  "CaptureConsentRecordAudioToggle",
  "CaptureConsentRecordVideoToggle",
  "CaptureConsentTranscriptionToggle",
  "CaptureConsentSaveChoicesButton",
  "CaptureConsentDeclineButton",
  "\\(CaptureDeviceVocabulary.thisDeviceCapitalized) keeps the original microphone recording.",
  "GlobalCaptureBanner",
  "model.activeCaptureSession?.id == session.id",
  "model.activeVideoCaptureSession?.id == session.id",
  "audioCapture.activeSessionID == session.id",
  "videoCapture.activeSessionID == session.id",
  "CaptureUseCallAudioToggle",
  "CaptureJoinMicrophoneToggle",
  "CaptureJoinCameraToggle",
  "CaptureCallAudioRoutePicker",
  "CaptureCallOutputRoute",
  "Finish or stop the current take first.",
  ".disabled(providerControlsLocked",
  "CaptureRecordingModePicker",
  "CaptureVideoRecorderHero",
  "CaptureVideoPreview",
  "CaptureVideoPrepareButton",
  "CaptureVideoStartButton",
  "CaptureVideoStopButton",
  "CaptureVideoPauseResumeButton",
  "CaptureVideoSwitchCameraButton",
  "Podcast camera",
  "Allow recording?",
  "Quipsly remembers your choice for this Session. Recording starts only when the coach or host presses Record.",
  "Allow recording",
  "Don't record me",
  "Recording options",
  "transcriptionConsentGrantedParticipantCount",
  "The transcript starts after everyone allows it",
  "model.providerControlsLockedForLocalCapture",
]) {
  requireIncludes(capturePhoneShellText, needle, "capture-first iPhone UX");
}
for (const needle of [
  'Text("Trim")',
  'Text("Transcript edit")',
  "Create edited \\(outputMediaKind) copy",
  "Title and sources (",
  "sourceManifest",
  "restoreEditorFromCurrentOutput",
  "let participantId: String",
  "Dictionary(grouping: available, by: \\.participantId)",
  "overlapGroups",
  'accessibilityIdentifier("CaptureRecordingShareMissingSources")',
  "Listen to exact passage",
  "Listening does not change your edit.",
  'accessibilityIdentifier("CaptureRecordingShareAudition_',
  'accessibilityIdentifier("CaptureRecordingShareFocusedAudition_',
  "clientTrackedPlaybackIsNotProofOfAudibility",
  "Play this edit above, or share it now.",
  "Share with \\(output.recipient.label)",
  "AuthResponseDecoder.decode(",
  'errorDomain: "QuipslyCapture.RecordingEditor"',
  "Your original recording and edit choices are safe; try again.",
  'accessibilityIdentifier("CaptureRecordingSharePrepare")',
  'accessibilityIdentifier("CaptureRecordingShareRelease")',
]) {
  requireAnyIncludes(captureRecordingShareText, [needle, needle.replace("\\\\(", "\\(")], "standard native recording finish flow");
}
requireExcludes(
  captureRecordingShareText,
  "I listened and intend to share only with",
  "redundant native share attestation",
);
for (const forbidden of [
  "Listen before sharing",
  "Play next review point",
  "CaptureRecordingShareReviewProgress",
]) {
  requireExcludes(
    captureRecordingShareText,
    forbidden,
    "recording-share listening remains optional",
  );
}
for (const needle of [
  "Help & diagnostics",
  "Share support snapshot",
  "CaptureSupportDisclosure",
  "CaptureShareSupportSnapshot",
  "CaptureSupportPrivacyBoundary",
  "CaptureSupportAttentionSummary",
  "CaptureVersionBuild",
]) {
  requireIncludes(capturePhoneShellText, needle, "privacy-bounded Capture support UX");
}
for (const needle of [
  "CaptureSupportSnapshot",
  "privacyBoundary",
  "Surface:",
  "Install class:",
  "Audio route type:",
  "Local originals:",
  "Recoverable uploads:",
  "Capture attention events:",
  "Latest capture transition:",
  "Preview mode:",
]) {
  requireIncludes(captureSupportSnapshotText, needle, "redacted Capture support contract");
}
for (const needle of [
  "let installationClass: String",
  'return "simulator"',
  'withExtension: "mobileprovision"',
  '? "store-distributed"',
  ': "development-or-ad-hoc"',
]) {
  requireIncludes(
    captureRuntimeEvidenceText,
    needle,
    "support evidence distinguishes direct development installs from store distribution",
  );
}
for (const needle of [
  "CaptureAttentionSupportSummary",
  "var supportSummary: CaptureAttentionSupportSummary",
  "latestCategory: Self.supportCategory(for: latest.message)",
  "latestSelectedSessionWasLocal",
  "latestCanonicalSessionCount",
  "latestLocalDraftSessionCount",
]) {
  requireIncludes(
    captureAttentionDiagnosticsText,
    needle,
    "protected attention diagnostics expose only coarse state to the user-controlled support snapshot",
  );
}
for (const forbidden of [
  "selectedSessionID: latest.selectedSessionID",
  "message: latest.message",
]) {
  requireExcludes(
    captureAttentionDiagnosticsText.slice(
      captureAttentionDiagnosticsText.indexOf("var supportSummary:"),
      captureAttentionDiagnosticsText.indexOf("private func persist"),
    ),
    forbidden,
    "shareable attention support state excludes exact Session identifiers and alert text",
  );
}
const supportSnapshotFields = captureSupportSnapshotText.slice(
  captureSupportSnapshotText.indexOf("let generatedAt:"),
  captureSupportSnapshotText.indexOf("var shareText:"),
);
for (const forbidden of [
  "email",
  "accountID",
  "sessionID",
  "recordingID",
  "sourceText",
  "filename",
  "filePath",
  "credential",
  "accessToken",
  "refreshToken",
  "audioRouteName",
]) {
  assert(
    !supportSnapshotFields.includes(forbidden),
    "Capture support snapshot initializer must not accept private identity, source, path, or credential fields.",
    { forbidden },
  );
}
for (const needle of [
  "testAccountOffersPrivacyBoundedSupportSnapshot",
  "testSupportSnapshotRemainsReachableAtLargestAccessibilityTextSize",
  "testLoginOffersPrivacyBoundedSupportBeforeAuthenticationAtAccessibilityTextSize",
  "ActivityListView",
  "performAccessibilityAudit",
]) {
  requireIncludes(deterministicUITestsText, needle, "operated and accessible Capture support coverage");
}
for (const needle of [
  "Having trouble signing in?",
  "Share sign-in diagnostics",
  "QuipslyCaptureSignInSupportDisclosure",
  "QuipslyCaptureShareSignInSupport",
  "QuipslyCaptureSignInSupportPrivacyBoundary",
  "localOriginalCount: nil",
  "recoverableUploadCount: nil",
  ".frame(minWidth: 44, minHeight: 44)",
]) {
  requireIncludes(loginText, needle, "privacy-bounded signed-out support UX");
}
const signInSupportSnapshotBlock = loginText.slice(
  loginText.indexOf("private var signInSupportSnapshot:"),
  loginText.indexOf("private var canSubmitPasswordAuth:"),
);
for (const forbidden of [
  "email",
  "password",
  "userEmail",
  "accountOwnerID",
  "errorMessage",
  "statusMessage",
  "recentlyCreatedEmail",
]) {
  assert(
    !signInSupportSnapshotBlock.includes(forbidden),
    "Signed-out support payload must not read typed identity, credential, or authentication-message state.",
    { forbidden },
  );
}
for (const needle of [
  "recordingConsentCanRecordVideo == true",
  "recordingConsentVideoGranted == true",
  "canRecordVideoNow == true",
  "videoAuthorityIsCurrent",
  "startVideoConsentMonitor",
  "maximumVideoSourceBytes",
  "longSourceUploadEnabled",
]) {
  requireIncludes(captureExperienceText, needle, "source-specific video authority");
}
for (const needle of [
  "AVCaptureVideoPreviewLayer",
  "AVCaptureDevice.RotationCoordinator",
  "videoRotationAngleForHorizonLevelPreview",
  "videoRotationAngle",
  "resizeAspectFill",
]) {
  requireIncludes(capturePhoneShellText, needle, "production camera preview");
}
for (const needle of [
  "state = .arming",
  "lockCaptureOrientationForArming",
  "captureRotationDegrees:",
  "orientation: profile.presentationOrientation",
  "activeCaptureGroupID",
  "clockSamples",
  "validateFinalizedSource",
  "markUploadHeld",
  "The capture group is still open.",
]) {
  requireIncludes(videoCaptureControllerText, needle, "durable video controller");
}
for (const needle of [
  "UIApplication.didEnterBackgroundNotification",
  "beginBackgroundTask(",
  'withName: "QuipslyVideoFinalization"',
  "if state == .finalizing",
  "_ = await waitUntilTerminal()",
  "if pausedCapture != nil",
  'state = .paused',
]) {
  requireIncludes(videoCaptureControllerText, needle, "background-safe video finalization and paused-group recovery");
}
assert(
  !videoCaptureControllerText.includes("UIApplication.willResignActiveNotification"),
  "A temporary inactive overlay must not be treated as actual backgrounding and terminate a retained movie.",
  { forbidden: "UIApplication.willResignActiveNotification" },
);
for (const needle of [
  "AVCaptureMovieFileOutput",
  "videoRotationAngleForHorizonLevelCapture",
  "movieFragmentInterval",
  "availableVideoCodecTypes",
  "startRunning",
]) {
  requireIncludes(videoCaptureServiceText, needle, "AVFoundation camera service");
}
for (const needle of [
  "LocalRecordingRecordedMediaProfile",
  "videoTrack.load(.formatDescriptions)",
  "videoTrack.load(.preferredTransform)",
  "sourceIntegrityHoldReason",
  "Upload is held so Quipsly cannot silently relabel the source.",
  "angularDistance(expectedRotation, recordedRotation)",
]) {
  requireIncludes(localRecordingLibraryText, needle, "finished-video source evidence");
}
for (const needle of [
  "AVPlayerItem(url:",
  "videoPlayer",
  "beginVideoPlayback",
]) {
  requireIncludes(localRecordingPlaybackText, needle, "local video playback");
}
for (const needle of [
  "CaptureLocalVideoPlayerSheet",
  "VideoPlayer(player:",
  "LocalRecordingRecordedVideoProfile",
]) {
  requireIncludes(capturePhoneShellText, needle, "video Library review UX");
}
for (const needle of [
  "prepareForRecording()",
  "recordingConsentGranted",
  "await sessionClient.load()",
  "refreshed.recordingConsentGranted, refreshed.canRecordNow",
  "audioCapture.captureState == .recording",
  "receiptStore.enqueue(",
  "startConsentMonitor(captureID:",
  "activeAudioCapture?.handleCommand(.pause)",
  "captureRequiresNewTake = true",
  "Saved on \\(CaptureDeviceVocabulary.thisDevice). Upload can continue in the background.",
  "Recording remains paused. Verify the microphone route",
  "uploadManager.localDeletionBlocker(",
  "library.deleteLocalOriginal(recording.id)",
  "retireDormantUploadAfterConfirmedLocalDeletion",
  "load(authoritativeSessionID:",
  "case .transportUnavailable",
  "pauseCaptureForAuthorityLoss(",
  "providerControlsAreAvailable()",
  "providerControlsLockedForLocalCapture",
  "stableOwnerSnapshot()",
  "matchesStableOwnerSnapshot(ownerSnapshot)",
  "expectedOwnerSnapshot: ownerSnapshot",
  "abortArmedCaptureBeforeRecording()",
]) {
  requireIncludes(captureExperienceText, needle, "local-first capture coordinator");
}
const personalVoiceStart = captureExperienceText.indexOf("func createPersonalVoiceNote(");
const personalVoiceEnd = captureExperienceText.indexOf("private func createLocalPersonalVoiceNote", personalVoiceStart);
const personalVoiceEntryBody = captureExperienceText.slice(personalVoiceStart, personalVoiceEnd);
requireIncludes(personalVoiceEntryBody, "return createLocalPersonalVoiceNote(title: title)", "private voice writing opens its protected local source immediately");
requireExcludes(personalVoiceEntryBody, "sessionClient.createQuickSession", "Home Nest provisioning never gates a new private voice recording");
const sessionEntryRefreshStart = captureExperienceText.indexOf("func refreshSelectedSessionEntryReadiness()");
const sessionEntryRefreshEnd = captureExperienceText.indexOf("func saveQuickEntry(", sessionEntryRefreshStart);
const sessionEntryRefreshBody = captureExperienceText.slice(sessionEntryRefreshStart, sessionEntryRefreshEnd);
requireIncludes(
  sessionEntryRefreshBody,
  "!selectedSessionIsLocalPersonalVoiceNote",
  "local voice writing never asks the canonical Session collection to authorize its private draft",
);
for (const needle of [
  "localPersonalVoiceNoteSessions",
  "return localPersonalVoiceNoteSessions",
  "sessionClient.sessions.filter",
]) {
  requireIncludes(
    captureExperienceText,
    needle,
    "local voice writing remains a model-owned overlay across canonical Session refreshes",
  );
}
for (const needle of [
  "projectID: visibleContextNest?.id",
  "projectName: visibleContextNest?.name",
  "projectSlug: visibleContextNest?.slug",
  "currentDraft?.preferredProjectName?.nonempty",
]) {
  requireIncludes(capturePhoneShellText, needle, "new writing inherits the visible Nest before sync");
}
for (const needle of [
  "completedVoiceWritingRecordingID: latestPersonalVoiceRecording(",
  "writingStore.draft(",
  "for: completedVoiceWritingRecordingID",
  'return "Writing ready"',
  'return "mic.fill"',
  'return "Record another thought"',
  "Quipsly handles cloud backup and transcription automatically.",
]) {
  requireIncludes(
    capturePhoneShellText,
    needle,
    "completed voice writing follows the exact saved source instead of a mutable room identifier",
  );
}
requireExcludes(
  capturePhoneShellText,
  "will start the transcript automatically",
  "saved-source status never remains stuck in a future transcript phase after writing is ready",
);
for (const needle of [
  "var preferredProjectID: String? = nil",
  "let destinationProjectId: String?",
  "draft.canonicalDocumentID == nil",
  "? draft.preferredProjectID",
]) {
  requireIncludes(voiceWritingDraftStoreText, needle, "protected writing preserves its intended Nest until first sync");
}
for (const needle of [
  "destinationProjectId: string | null",
  "VOICE_WRITING_DESTINATION_INVALID",
  "destinationProjectId: input.destinationProjectId",
]) {
  requireIncludes(mobileVoiceWritingServerText, needle, "mobile writing validates and records its explicit Nest destination");
}
for (const needle of [
  "input.destinationProjectId",
  "ensureHomeNestForEmail(actorEmail, prisma)",
  'action: "write"',
  "VOICE_WRITING_DESTINATION_NOT_FOUND",
  "VOICE_WRITING_DESTINATION_FORBIDDEN",
]) {
  requireIncludes(mobileVoiceWritingRouteText, needle, "selected-Nest writing is access-checked without depending on a default Nest");
}
for (const needle of [
  "struct PendingSourceAnnotationDraftDecision",
  "let ownerAccountID: String",
  "let annotationID: String",
  "let projectSlug: String",
  "let expectedAnnotationUpdatedAt: String",
  "completeFileProtectionUntilFirstUserAuthentication",
  "func releaseForRetry(",
]) {
  requireIncludes(sourceAnnotationDraftOutboxText, needle, "protected source-to-writing decision outbox");
}
for (const needle of [
  'if (action === "source-annotation-draft")',
  "createWritingDraftFromSourceAnnotation",
  'action: "write"',
  "responseBlockId: result.responseBlockId",
  "responseBlockStableId: result.responseBlockStableId",
  "writingDraftPrivate: true",
  "writingDraftSourceMutated: false",
  "writingDraftExternalSideEffects: false",
]) {
  requireIncludes(mobileTodayRouteText, needle, "authenticated private source-to-writing handoff");
}
for (const needle of [
  "func startWritingDraft(",
  "syncWritingDraftDecision",
  'payload.action == "source-annotation-draft"',
  'code: "ACKNOWLEDGEMENT_MISMATCH"',
  "payload.boundaries?.writingDraftPrivate == true",
  "payload.boundaries?.writingDraftSourceMutated == false",
  "payload.boundaries?.writingDraftExternalSideEffects == false",
  "let responseBlockID = payload.responseBlockId",
  "expectedResponseBlockID: responseBlockID",
]) {
  requireIncludes(bridgeText, needle, "exact native source-to-writing acknowledgement");
}
for (const needle of [
  "CaptureTodayAnnotationDraftStart_",
  "CaptureTodayAnnotationDraftPending_",
  "CaptureTodayAnnotationDraftRetry_",
  "Start private draft",
  "Creates a private draft linked to this source.",
]) {
  requireIncludes(capturePhoneShellText, needle, "accessible private source-to-writing UX");
}
for (const needle of [
  "CaptureWorkLocationBar(",
  'accessibilityIdentifier("CaptureGlobalWorkLocation")',
  "nestName: requestedCoachingEngagement?.projectName.nonempty",
  "spaceName: visibleContextSpaceName",
  "CaptureNestSwitcher(",
]) {
  requireIncludes(capturePhoneShellText, needle, "persistent two-level Nest and Space location UX");
}
for (const needle of [
  'case .work: "Work"',
]) {
  requireIncludes(captureExperienceModelText, needle, "familiar task-oriented primary navigation label");
}
for (const needle of [
  "let titleBeforeRefresh = title",
  "let bodyBeforeRefresh = bodyText",
  "let richTextBeforeRefresh = richText",
  "guard title == titleBeforeRefresh",
  "bodyText == bodyBeforeRefresh",
  "richText == richTextBeforeRefresh",
]) {
  requireIncludes(capturePhoneShellText, needle, "Nest refresh cannot overwrite newer in-progress writing");
}
requireExcludes(
  capturePhoneShellText,
  "CaptureWorkProjectPicker",
  "Work does not repeat a second Nest picker beneath the persistent Nest and Space location bar",
);
for (const needle of [
  "private struct CaptureWorkSpaceLocation",
  "engagements: [MobileCaptureCoachingEngagement]",
  "session.coachingEngagementId",
  "session.episodeProductionId",
  "session.episodeSlug",
  'return "Coaching · Ready to plan"',
  'Section("Spaces in \\(selectedNest.name)")',
  'Section(selectedNest == nil ? "Collaboration Spaces" : "Other Spaces")',
  'accessibilityIdentifier("CaptureSpaceSwitcherChoice_\\(space.id)")',
  "onSelectSpace: selectGlobalSpace",
  "CaptureCoachingEngagementWorkspaceView(",
  "requestedCoachingEngagement = engagement",
  'accessibilityIdentifier("CaptureWorkSpaces")',
  'accessibilityIdentifier("CaptureWorkSpace_\\(space.id)")',
  "private enum CaptureRecentSpaceStore",
  'Section("Recent Spaces")',
  "CaptureRecentSpaceStore.remember(space.id)",
]) {
  requireIncludes(capturePhoneShellText, needle, "accessible collaboration Spaces projected inside each Nest");
}
for (const needle of [
  'id: "coaching",',
  'title: "Coaching practice",',
  'title: "Content, podcast, or video",',
  'title: "Writing",',
  'title: "Research",',
  'title: "Course or teaching",',
  "let nestKind: String",
  'if templateID == "coaching"',
  "model.coachingRunwayClient.preferProject(slug: project.slug)",
  "CaptureCoachingHomeView(",
]) {
  requireIncludes(capturePhoneShellText, needle, "new Nest setup starts from familiar work without fragmenting canonical Nest kinds");
}
for (const needle of [
  "private var preferredProjectSlug: String?",
  "func preferProject(slug: String?)",
  "quipsly.coaching.preferred-project-owner.v1",
  "AuthManager.currentStoredOwnerID()",
  'contextualBody["projectSlug"] = preferredProjectSlug',
  "private func decodeCoachingResponse<Payload: Decodable>(",
  'errorDomain: "QuipslyCoaching"',
  "Your coaching work is safe; try again.",
]) {
  requireIncludes(captureCoachingHomeText, needle, "coaching scheduling creates client Spaces inside the coach-selected Nest");
}
for (const needle of [
  "static let canvas = adaptive(",
  "static let canvasLift = adaptive(",
  "static let surface = adaptive(",
  "static let locationBarBackground = adaptive(",
  "static let primaryText = adaptive(",
  "static let secondaryText = adaptive(",
  "static let accentGradient = LinearGradient(",
  ".toolbarBackground(CapturePalette.surface, for: .tabBar)",
]) {
  requireIncludes(capturePhoneShellText, needle, "adaptive warm tan and dark brown Capture visual foundation");
}
for (const needle of [
  "beginAutomaticTranscript(",
  "Audio saved without transcription",
  "No Quipsly cloud speech job was needed.",
  "CaptureTranscriptSourceBadges_",
]) {
  requireIncludes(capturePhoneShellText, needle, "automatic exact-source device transcription visibility");
}
for (const needle of [
  "CaptureSessionTranscriptAssembly",
  "sessionTranscriptAssemblyStatus",
  "participant recordings · one Session transcript",
  "Quipsly cloud ASR",
  "Apple speech service",
  "CaptureTranscriptAssemblyStatus",
  "sessionTranscriptAssemblyAccessibilityLabel",
]) {
  requireIncludes(transcriptReviewText, needle, "joint source-bound transcript assembly visibility");
}
assert(
  !capturePhoneShellText.includes("private enum CapturePalette"),
  "Capture's semantic palette remains reusable across native feature surfaces.",
  { label: "shared Capture semantic palette is available to feature surfaces" },
);
for (const [text, surface] of [
  [captureCoachingHomeText, "coaching home"],
  [mobileCoachingFormAutomationText, "coaching form rhythm"],
  [mobileCoachingFormsText, "coaching forms"],
  [mobileCoachingSessionPreparationText, "Session preparation"],
]) {
  assert(
    !/(?:Color\.)?(?:purple|indigo|blue|cyan|mint|teal)\b/.test(text),
    "Primary coaching surfaces use the shared brand accent instead of unrelated system feature colors.",
    { label: `${surface} uses the shared semantic accent` },
  );
}
for (const needle of [
  "@Environment(\\.scenePhase) private var scenePhase",
  ".onChange(of: scenePhase)",
  "saveTask?.cancel()",
  "saveImmediately()",
  "Try saving on \\(CaptureDeviceVocabulary.thisDevice) again",
]) {
  requireIncludes(capturePhoneShellText, needle, "writing flushes its protected local copy at app lifecycle boundaries");
}
for (const needle of [
  "let restoredProtectedSelection = brief == nil && restoreProtectedCache()",
  "let requestedProjectID = projectID ?? brief?.selectedProjectId",
  "response.statusCode == 403 || response.statusCode == 404",
  "Self.clearProtectedCache()",
  "await load(projectID: nil)",
]) {
  requireIncludes(bridgeText, needle, "Work relaunch restores the actor-bound Nest and safely forgets revoked access");
}
for (const needle of [
  "final class DocumentNoteWorkingDraftStore",
  "QuipslyCapture/DocumentNoteWorkingDrafts",
  "FileProtectionType.completeUntilFirstUserAuthentication",
  "baseContentRevision: String",
  "lastKnownGoodURL",
]) {
  requireIncludes(documentNoteEditOutboxText, needle, "Nest note keystrokes have an actor-partitioned protected working draft");
}
for (const needle of [
  "DocumentNoteWorkingDraftStore.shared.draft(for: note.id)",
  ".onChange(of: blocks)",
  ".onChange(of: scenePhase)",
  "saveWorkingDraftImmediately()",
  "expectedContentRevisionOverride: baseContentRevision",
  "committedToOutbox = true",
  "Saved on \\(CaptureDeviceVocabulary.thisDevice) while you work.",
]) {
  requireIncludes(capturePhoneShellText, needle, "Nest note editing survives dismissal and iPhone lifecycle changes without bypassing conflict checks");
}
requireIncludes(
  deterministicUITestsText,
  "func testNestNoteWorkingDraftSurvivesDismissalAndRelaunch()",
  "deterministic iPhone proof covers Nest-note draft recovery after dismissal and process death",
);
for (const needle of [
  "final class SessionNoteWorkingDraftStore",
  "QuipslyCapture/SessionNoteWorkingDrafts",
  "FileProtectionType.completeUntilFirstUserAuthentication",
  "baseUpdatedAt: String",
  "lastKnownGoodURL",
]) {
  requireIncludes(sessionNoteEditOutboxText, needle, "Session note keystrokes have an actor-partitioned protected working draft");
}
for (const needle of [
  "SessionNoteWorkingDraftStore.shared.draft(for: note.id)",
  ".onChange(of: noteBody)",
  ".onChange(of: scenePhase)",
  "saveWorkingDraftImmediately()",
  "expectedUpdatedAtOverride: baseUpdatedAt",
  "committedToOutbox = true",
  "Saved on \\(CaptureDeviceVocabulary.thisDevice) while you work.",
]) {
  requireIncludes(capturePhoneShellText, needle, "Session note editing survives dismissal and iPhone lifecycle changes without bypassing conflict checks");
}
requireIncludes(
  deterministicUITestsText,
  "func testSessionNoteWorkingDraftSurvivesDismissalAndRelaunch()",
  "deterministic iPhone proof covers Session-note draft recovery after dismissal and process death",
);
for (const needle of [
  "final class MobileCoachingSessionPreparationWorkingDraftStore",
  "QuipslyCapture/CoachingPreparationWorkingDrafts",
  "FileProtectionType.completeUntilFirstUserAuthentication",
  "lastKnownGoodURL",
  "ownerAccountID",
]) {
  requireIncludes(
    mobileCoachingSessionPreparationText,
    needle,
    "coaching preparation keystrokes have an actor-partitioned protected working draft",
  );
}
for (const needle of [
  "activeLoadID == loadID",
  "activeRoomID == requestedRoomID",
  "mayReplaceEditor = current == canonicalSnapshot",
  ".onChange(of: scenePhase)",
  "saveWorkingDraftImmediately()",
  "Recovered your saved \\(CaptureDeviceVocabulary.deviceName) draft.",
  "Saved on \\(CaptureDeviceVocabulary.thisDevice) while you work.",
  "CaptureSessionPreparationKeyboardDone",
]) {
  requireIncludes(
    mobileCoachingSessionPreparationText,
    needle,
    "coaching preparation survives refresh races, dismissal, and iPhone lifecycle changes",
  );
}
requireIncludes(
  deterministicUITestsText,
  "func testCoachingPreparationDraftSurvivesRefreshAndRelaunch()",
  "deterministic iPhone proof covers coaching-preparation recovery after refresh and process death",
);
for (const needle of [
  "struct MobileQuickEntryRecurrence: Codable, Equatable",
  "let recurrence: MobileQuickEntryRecurrence?",
  "guard recurrence == nil || kind == .task",
  "FileProtectionType.completeUntilFirstUserAuthentication",
]) {
  requireIncludes(mobileQuickEntryOutboxText, needle, "protected task-recurrence quick-entry outbox");
}
for (const needle of [
  'Text("Fixed schedule").tag("FIXED")',
  'Text("After completion").tag("COMPLETION")',
  ".pickerStyle(.navigationLink)",
  '.accessibilityIdentifier("CaptureQuickEntryForm")',
  '"First due"',
  'Text("Timezone")',
  'Text(recurrenceTimezoneID)',
  "This schedule stays in",
  "hasOneTimeReminder = false",
]) {
  requireIncludes(capturePhoneShellText, needle, "explicit native recurrence authoring UX and side-effect boundary");
}
for (const needle of [
  'Button("Edit repeat…", systemImage: "pencil")',
  'Text("This task").tag("THIS_OCCURRENCE")',
  'Text("This + future").tag("THIS_AND_FUTURE")',
  "Changes only this task’s title and details.",
  "Changes this task and future repeats. Past tasks stay as they are.",
]) {
  requireIncludes(capturePhoneShellText, needle, "immutable-history native recurrence editing UX");
}
for (const needle of [
  'accessibilityIdentifier("CaptureWorkTaskEdit_\\(task.id)")',
  'accessibilityIdentifier("CaptureTodayTaskEdit_\\(task.id)")',
  'accessibilityIdentifier("CaptureTaskEditSave")',
  'accessibilityIdentifier("CaptureTaskEditRemove")',
  'accessibilityIdentifier("CaptureTaskEditConfirmRemove")',
  "Its Session and transcript source stay available.",
  'status: task.status == "OPEN" ? "DONE" : "OPEN"',
]) {
  requireIncludes(capturePhoneShellText, needle, "native ordinary task editing removal and canonical completion UX");
}
requireExcludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureTaskEditTimezone")', "ordinary task editing hides internal timezone machinery");
requireExcludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureTaskEditBoundary")', "ordinary task editing has no boundary paperwork");
for (const needle of [
  "func editTask(",
  '"action": "task-edit"',
  'payload.action == "task-edit"',
  "acknowledgedDueLocal == requestedDueLocal",
  "Reconnect to edit this task. Your saved copy is unchanged.",
]) {
  requireIncludes(bridgeText, needle, "fail-closed native task-edit acknowledgement");
}
for (const needle of [
  'accessibilityIdentifier("CaptureWorkGoalEdit_\\(goal.id)")',
  'accessibilityIdentifier("CaptureTodayGoalEdit_\\(goal.id)")',
  'accessibilityIdentifier("CaptureGoalEditSave")',
  'accessibilityIdentifier("CaptureGoalEditRemove")',
  'accessibilityIdentifier("CaptureGoalEditConfirmRemove")',
  "Its Session and transcript source stay available.",
]) {
  requireIncludes(capturePhoneShellText, needle, "native ordinary goal editing and removal UX");
}
requireExcludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureGoalEditTimezone")', "ordinary goal editing hides internal timezone machinery");
requireExcludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureGoalEditBoundary")', "ordinary goal editing has no boundary paperwork");
for (const needle of [
  "func editGoal(",
  '"action": "goal-edit"',
  '"targetDecision": targetDecision',
  'payload.action == "goal-edit"',
  'case "KEEP":',
  "acknowledgedTargetLocalDate == requestedTargetLocalDate",
  "Reconnect to edit this goal. Your saved copy is unchanged.",
]) {
  requireIncludes(bridgeText, needle, "fail-closed native goal-edit acknowledgement");
}
for (const needle of [
  "mobileCaptureQuickEntrySeriesId(input.clientRequestId)",
  "initialOccurrencePlan(input.recurrence)",
  'recurrenceRoomId: room.id',
  "notificationScheduled: false",
  "providerCalendarEventCreated: false",
  "recurrenceNotificationsScheduled: false",
]) {
  requireIncludes(mobileQuickEntryRouteText, needle, "canonical retry-safe mobile recurrence materialization boundary");
}
for (const needle of [
  "validateTaskRecurrenceRule(recurrence)",
  "QUICK_ENTRY_RECURRENCE_TASK_ONLY",
  "QUICK_ENTRY_RECURRENCE_INVALID",
  "mobile-task-series-${clientRequestId.toLowerCase()}",
]) {
  requireIncludes(mobileQuickEntryHelperText, needle, "mobile recurrence input validation and deterministic identity");
}
for (const needle of [
  'if (action === "recurrence-edit")',
  'scope === "THIS_OCCURRENCE"',
  '["THIS_OCCURRENCE", "THIS_AND_FUTURE"].includes(scope)',
  "mobile-task-series-revision-${clientRequestId}",
]) {
  requireIncludes(mobileTodayRouteText, needle, "authenticated mobile recurrence-edit route and deterministic revision identity");
}
for (const needle of [
  'if (action === "task-edit")',
  "editCanonicalTaskInTransaction",
  'surface: "ios-capture-today"',
  "hasDueDecision",
  'code: "CONFLICT"',
]) {
  requireIncludes(mobileTodayRouteText, needle, "authenticated mobile one-time task editing route and concurrency boundary");
}
for (const needle of [
  'if (action === "goal-edit")',
  "editCanonicalGoalInTransaction",
  'surface: "ios-capture-work"',
  "hasTargetDecision",
  'targetDecision === "KEEP"',
  'targetDecision === "SET"',
  'targetDecision === "CLEAR"',
  'code: "CONFLICT"',
]) {
  requireIncludes(mobileTodayRouteText, needle, "authenticated mobile goal editing route and concurrency boundary");
}
for (const needle of [
  'kind: "quipsly-goal-edit-v1"',
  'targetDecision: input.targetDecision.kind',
  'input.targetDecision.kind === "KEEP"',
  "statusChanged: false",
  "progressChanged: false",
  "taskLinksChanged: false",
  "tagsChanged: false",
  "hierarchyChanged: false",
  "sourceAnchorChanged: false",
  "providerCalendarEventChanged: false",
  "externalSideEffects: false",
]) {
  requireIncludes(canonicalGoalEditText, needle, "shared canonical goal-edit receipt preserves adjacent evidence and external boundaries");
}
for (const needle of [
  "recurrence-revision-request:",
  'kind: "quipsly-task-recurrence-revision-v1"',
  'kind: "quipsly-task-occurrence-superseded-v1"',
  "historicalOccurrencesPreserved: true",
  "providerCalendarChanged: false",
]) {
  requireIncludes(taskRecurrenceServerText, needle, "serialized recurrence revision receipts preserve history without external effects");
}
for (const needle of [
  "enum CaptureSessionLoadOutcome: Equatable",
  "case transportUnavailable(message: String)",
  "case forbidden(message: String)",
  "case authoritativeAbsent(message: String)",
  "func load(authoritativeSessionID: String? = nil) async -> CaptureSessionLoadOutcome",
  "isTransportAmbiguousSessionCollectionStatus(response.statusCode)",
  "[404, 408, 410, 425, 429].contains(statusCode) || (500...599).contains(statusCode)",
  "return .transportUnavailable(message: message)",
  "let authoritativeSession = authoritativeSessionID.flatMap",
  "$0.id == identifier || $0.callRoomId == identifier",
  "authoritativeSession == nil",
  "return .authoritativeAbsent(message: message)",
]) {
  requireIncludes(bridgeText, needle, "typed capture-session authority refresh");
}
for (const needle of [
  "2026-07-18.capture-consent-v2",
  "379380cecf3bc1b3a1614334e247e6795f09f3eb1c85bf3918daf612b9929ff9",
  '"canRecordAudio"] = grantAttestation.canRecordAudio',
  '"canRecordVideo"] = grantAttestation.canRecordVideo',
  '"canTranscribe"] = grantAttestation.canTranscribe',
  '"allAudibleParticipantsNotifiedAndAgreed"] = grantAttestation.allAudibleParticipantsNotifiedAndAgreed',
  '"recordingChoicePresented": true',
  '"transcriptionChoicePresented": true',
  '"audibleParticipantAttestationPresented": true',
]) {
  requireIncludes(bridgeText, needle, "explicit versioned capture consent evidence");
}

const callKitDeactivateStart = captureAudioSessionCoordinatorText.indexOf("func callKitDidDeactivate() throws");
const callKitDeactivateEnd = captureAudioSessionCoordinatorText.indexOf("func beginLocalPlayback() throws", callKitDeactivateStart);
const callKitDeactivateBody = captureAudioSessionCoordinatorText.slice(callKitDeactivateStart, callKitDeactivateEnd);
assert(callKitDeactivateStart >= 0 && callKitDeactivateEnd > callKitDeactivateStart, "CallKit deactivation cleanup must remain inspectable.", {
  label: "CallKit deactivation cleanup body is present",
});
assert(
  callKitDeactivateBody.indexOf("isCallKitAudioActive = false")
    < callKitDeactivateBody.indexOf("AudioManager.shared.setEngineAvailability("),
  "CallKit lease cleanup must happen before throwable provider-engine shutdown.",
  { label: "CallKit lease clears before LiveKit shutdown" },
);
for (const needle of [
  "var cleanupFailures: [String] = []",
  "if isLocalCaptureActive",
  "try applySharedCategory()",
  "try audioSession.setActive(true)",
  "if !cleanupFailures.isEmpty",
]) {
  requireIncludes(callKitDeactivateBody, needle, "fail-safe CallKit deactivation reconciliation");
}
const preferredAudioModeStart = captureAudioSessionCoordinatorText.indexOf("nonisolated static func preferredMode(");
const preferredAudioModeEnd = captureAudioSessionCoordinatorText.indexOf("private func releaseProviderInputRetention()", preferredAudioModeStart);
const preferredAudioModeBody = captureAudioSessionCoordinatorText.slice(
  preferredAudioModeStart,
  preferredAudioModeEnd,
);
assert(
  preferredAudioModeStart >= 0 && preferredAudioModeEnd > preferredAudioModeStart,
  "Purpose-aware audio-session routing must remain inspectable.",
  { label: "purpose-aware audio mode policy is present" },
);
requireIncludes(
  preferredAudioModeBody,
  "providerRoomActive || callKitAudioActive ? .voiceChat : .default",
  "calls retain voice processing while local spoken masters let iOS choose a usable ordinary recording route",
);
requireIncludes(
  captureAudioSessionCoordinatorText,
  "`measurement` is deliberately avoided here",
  "the audio mode policy documents why forcing the primary microphone is unsafe on multi-microphone devices",
);
requireIncludes(
  captureAudioSessionCoordinatorText,
  "`videoRecording` is not an audio-quality synonym either",
  "the audio mode policy documents why movie capture mode is unsafe for audio-only masters",
);
requireExcludes(
  captureAudioSessionCoordinatorText,
  "setPreferredDataSource(",
  "standalone spoken capture does not guess microphone quality from a built-in data-source orientation",
);
requireExcludes(
  captureAudioSessionCoordinatorText,
  "setPreferredInput(",
  "standalone spoken capture leaves ordinary microphone selection to iOS unless the person explicitly selects an external route",
);
for (const needle of [
  "input.selectedDataSource?.dataSourceName",
  '"\\(portName) · \\(dataSourceName)"',
]) {
  requireIncludes(
    audioText,
    needle,
    "the live recorder identifies the exact selected microphone data source when iOS exposes it",
  );
}
const privateRouteRequirementStart = captureAudioSessionCoordinatorText.indexOf("private func requirePrivateRouteDuringCapture() throws");
const privateRouteRequirementEnd = captureAudioSessionCoordinatorText.indexOf("private func holdSharedWatchForUnsafeRoute()", privateRouteRequirementStart);
const privateRouteRequirementBody = captureAudioSessionCoordinatorText.slice(
  privateRouteRequirementStart,
  privateRouteRequirementEnd,
);
assert(
  privateRouteRequirementStart >= 0
    && privateRouteRequirementEnd > privateRouteRequirementStart,
  "Shared Watch private-route policy must remain inspectable.",
  { label: "Shared Watch private-route policy body is present" },
);
requireIncludes(
  privateRouteRequirementBody,
  "guard isSharedWatchPlaybackActive else",
  "private listening route is required only for active Shared Watch playback",
);
assert(
  privateRouteRequirementBody.indexOf("guard isSharedWatchPlaybackActive else")
    < privateRouteRequirementBody.indexOf("guard isLocalCaptureActive || isProviderRoomActive || isCallKitAudioActive else"),
  "Standalone capture must return before evaluating Shared Watch's private-route safety gate.",
  { label: "standalone capture is independent from Shared Watch headphone policy" },
);
for (const needle of [
  "DeliveryDisposition",
  "closeOrphanedStarts",
  "markAcknowledged",
  "nextDeliverableReceipt",
  "deliveryDisposition == .supersededByStop",
  "completeCapture",
  "completeFileProtectionUntilFirstUserAuthentication",
]) {
  requireIncludes(captureReceiptStoreText, needle, "crash-safe room receipt journal");
}
for (const needle of [
  "recordings-index.json",
  "reconcileFilesWithoutDeleting",
  "FileProtectionType.completeUnlessOpen",
  "FileProtectionType.completeUntilFirstUserAuthentication",
  "Finishing backup",
  "Backed up · permission incomplete",
  "Backed up · permission changed",
  "Backed up · start not verified",
  "Backed up · protected",
  "serverProcessingDisposition",
  "serverTranscriptDisposition",
  "case deletedLocally",
  "localBytesDeletedAt",
  "func deleteLocalOriginal(",
  "isSafeRecordingFileName",
  "try fileManager.removeItem(at: fileURL)",
]) {
  requireIncludes(localRecordingLibraryText, needle, "durable local recording ledger");
}
for (const needle of [
  "func localDeletionBlocker(",
  "func retireDormantUploadAfterConfirmedLocalDeletion(",
  "durableSourceIdentityURL",
  "canonicalConfinedSourceURL",
  "matchesLedgerID || matchesConfinedSourcePath",
  "UploadLedgerStore.deleteCapability(for: sessionId)",
]) {
  requireIncludes(uploadText, needle, "owner-scoped dormant upload retirement after explicit local deletion");
}
for (const needle of [
  "Delete local original",
  "Share first",
  "ConfirmDeleteLocalOriginalButton",
  "LocalRecordingDeletionSheet",
  "Quipsly keeps a recovery record with the deletion time, original size, and cloud-verification state.",
]) {
  requireIncludes(capturePhoneShellText, needle, "explicit local-original deletion UX");
}
for (const needle of [
  "CaptureLibraryJournalWarning",
  "an unusual source or consent mismatch needs support",
  "verifies the cloud copy automatically before using it for transcription and editing",
]) {
  requireIncludes(capturePhoneShellText, needle, "cloud-processing and local-journal truth UX");
}
requireIncludes(bridgeText, "struct NativeCaptureContract: Codable", "native capture contract model");
requireIncludes(bridgeText, "struct MobileCaptureLifecycle: Codable", "native lifecycle model");
requireIncludes(bridgeText, "struct MobileCaptureLifecycleCheck: Codable", "native lifecycle check model");
requireIncludes(bridgeText, "struct MobileCaptureLifecycleSafeAction: Codable", "native lifecycle safe action model");
requireIncludes(bridgeText, "struct MobileCaptureActionPacket: Codable", "native action packet model");
requireIncludes(bridgeText, "struct MobileCaptureActionCapabilities: Codable", "native action capabilities model");
requireIncludes(bridgeText, "struct MobileCaptureActionBoundaries: Codable", "native action boundaries model");
requireIncludes(bridgeText, "let automaticFollowThroughCreatesEditableWork: Bool?", "native action contract permits automatic editable Session follow-through");
requireIncludes(bridgeText, "let optionalSuggestionsRequireUserAction: Bool?", "native action contract reserves user intent for optional suggestions");
requireIncludes(bridgeText, "let externalSideEffectsRequireUserAction: Bool?", "native action contract reserves user intent for external side effects");
requireExcludes(bridgeText, "reviewOnlyUntilUserActs", "native action contract does not impose a blanket review gate on ordinary editable work");
requireIncludes(bridgeText, "struct MobileCaptureTranscriptPacketBoundaries: Codable", "native transcript packet boundary model");
requireIncludes(bridgeText, "let boundaries: MobileCaptureTranscriptPacketBoundaries?", "native packet build decodes boundaries");
requireIncludes(bridgeText, "struct MobileCaptureTranscriptResults: Codable", "native transcript results model");
requireIncludes(bridgeText, "let automaticallyCreated: Bool", "native transcript results preserve their automatic origin");
requireIncludes(bridgeText, "let editable: Bool", "native transcript results expose ordinary editability");
requireIncludes(bridgeText, "let removable: Bool", "native transcript results expose ordinary removability");
for (const needle of [
  "let transcriptJobId: String?",
  "let recordingAssetId: String?",
  "let sourceStartSeconds: Double?",
  "let programStartSeconds: Double?",
]) {
  requireIncludes(
    bridgeText,
    needle,
    "native transcript results retain participant-master identity plus source and Session clocks",
  );
}
requireIncludes(bridgeText, "var coachingTranscriptResults: MobileCaptureTranscriptResults?", "native Session decodes transcript-derived work");
requireIncludes(transcriptReviewText, "let results: MobileCaptureTranscriptResults?", "native transcript review decodes ordinary Session work instead of relying on legacy candidates");
requireIncludes(transcriptReviewText, 'accessibilityIdentifier("CaptureTranscriptFollowUpResults")', "native transcript review presents generated follow-up beside its source transcript");
requireIncludes(transcriptReviewText, "if !client.canReviewPrivatePacket && client.packetResults == nil", "native transcript review never contradicts visible shared follow-up with an empty-state boundary");
requireIncludes(transcriptReviewText, "openFollowUpSource", "generated follow-up can return to the exact participant-owned transcript source");
requireIncludes(bridgeText, "latestPacketBuildResponse", "native latest packet build response readback");
requireIncludes(bridgeText, "let actionPacket: MobileCaptureActionPacket?", "native session decodes action packet");
requireIncludes(bridgeText, "let actionPackets: [MobileCaptureActionPacket]?", "native review digest decodes action packet list");
requireIncludes(bridgeText, "let lifecycle: MobileCaptureLifecycle?", "native session decodes lifecycle");
requireIncludes(bridgeText, "providerRecordingReceiptSlotId", "native session decodes provider receipt slot id");
requireIncludes(bridgeText, "hasProviderRecordingReceiptSlot", "native provider receipt slot state");
requireIncludes(bridgeText, "Provider receipt slot is evidence only. Attach verified provider media before transcription.", "native provider receipt transcript guard");
requireIncludes(bridgeText, "lifecycleReceiptChips", "native lifecycle receipt chips");
requireIncludes(bridgeText, "lifecycleReceiptLine", "native lifecycle receipt line");
requireIncludes(bridgeText, "lifecycleSafeActions", "native lifecycle safe actions");
requireIncludes(bridgeText, "let nativeCapture: NativeCaptureContract?", "readiness native capture contract");
requireIncludes(bridgeText, "let calendarReadiness: MobileCaptureCalendarReadiness?", "readiness calendar evidence model");
requireIncludes(bridgeText, "let liveKitEgressStartEnabled: Bool?", "native decodes LiveKit egress start gate");
requireIncludes(bridgeText, "let operatorEgressEnabled: Bool?", "native decodes LiveKit operator egress gate");
requireIncludes(bridgeText, "let mediaVaultBucketConfigured: Bool?", "native decodes LiveKit media-vault readiness");
requireIncludes(bridgeText, "struct MobileCaptureMediaVaultReadiness: Codable", "native media-vault readiness model");
requireIncludes(bridgeText, "let mediaVaultReadiness: MobileCaptureMediaVaultReadiness?", "native decodes direct media-vault readiness");
requireIncludes(bridgeText, "policyBucketMatchesConfigured", "native decodes primary bucket policy match");
requireIncludes(bridgeText, "configuredBucketWarning", "native decodes media-vault bucket warning");
requireIncludes(bridgeText, "Media vault aligned", "native aligned media-vault label");
requireIncludes(bridgeText, "mediaVaultRoutes?.readiness", "native tracks direct media-vault readiness route");
requireIncludes(bridgeText, "mediaVaultRoutes?.episodeInventory", "native tracks episode media inventory route");
requireIncludes(bridgeText, "episode inventory", "native summarizes episode media inventory route");
requireIncludes(bridgeText, "let configuredBucketEnvName: String?", "native decodes visible media-vault bucket env");
requireIncludes(bridgeText, "let storagePrefix: String?", "native decodes LiveKit recording prefix");
requireIncludes(bridgeText, "var providerEgressLabel: String", "native summarizes server recording readiness");
requireIncludes(bridgeText, "Configured, but held until LIVEKIT_EGRESS_ENABLED=true. Joining is not recording.", "native egress held copy");
requireIncludes(bridgeText, "nativeCapture ?? .production", "readiness native capture fallback");
requireIncludes(bridgeText, "struct MobileCaptureCalendarReadiness: Codable", "native calendar readiness struct");
requireIncludes(bridgeText, "let metadataTokenCandidate: Bool?", "native decodes calendar metadata-token candidate");
requireIncludes(bridgeText, "let configurationStatus: String?", "native decodes calendar configuration status");
requireIncludes(bridgeText, "let verificationRecommended: Bool?", "native decodes calendar verification recommendation");
requireIncludes(bridgeText, "let accessOk: Bool?", "native decodes verified calendar access status");
requireIncludes(bridgeText, "calendarLabel", "native calendar readiness label");
requireIncludes(bridgeText, "Calendar evidence candidate", "native avoids false calendar-ready claims before verification");
requireIncludes(bridgeText, "Calendar verify needed", "native surfaces metadata-token verification need");
requireIncludes(bridgeText, "ProcessInfo.processInfo.environment[\"QUIPSLY_API_BASE_URL\"]", "DEBUG runtime base URL override for simulator/UI proof");
requireIncludes(bridgeText, "#if DEBUG", "runtime base URL override must be DEBUG-only");
requireIncludes(bridgeText, "normalizeNestBaseURLValue", "shared base URL normalization helper");
requireIncludes(bridgeText, "calendarDetail", "native calendar readiness detail");
requireIncludes(bridgeText, "verify before sync", "native calendar detail tells operators to verify before sync");
requireIncludes(bridgeText, "Local recording files remain source truth until Nest verifies durable server storage.", "native local source truth");
requireIncludes(bridgeText, "Uploads are resumable, receipt-backed, and recoverable", "native resumable upload rule");
requireIncludes(bridgeText, "Original recordings are never silently deleted", "native no silent deletion rule");
requireIncludes(bridgeText, "let primaryCallPath: String?", "native primary call path contract");
requireIncludes(bridgeText, "let nativeCallPresentation: String?", "native CallKit presentation contract");
requireIncludes(bridgeText, "let fallbackCallImport: String?", "native fallback import contract");
requireIncludes(bridgeText, "let phoneCallBoundary: String?", "native phone-call boundary contract");
requireIncludes(bridgeText, "let pstnBridgeCandidate: String?", "native PSTN bridge candidate contract");
requireIncludes(bridgeText, "struct TokenBoundary: Codable", "native room join token boundary model");
requireIncludes(bridgeText, "struct Effects: Codable", "native room join effects model");
requireIncludes(bridgeText, "struct MobileCaptureRoomJoinDiagnosticResponse: Codable", "native room join diagnostic model");
requireIncludes(bridgeText, "roomJoinDiagnostics", "native room join diagnostics route decode");
requireIncludes(bridgeText, "let tokenBoundary: TokenBoundary?", "native room join token boundary decode");
requireIncludes(bridgeText, "let joinEffects: Effects?", "native room join effects decode");
requireIncludes(bridgeText, "tokenBoundaryLine", "native room join token boundary summary");
requireIncludes(bridgeText, "joinEffectsLine", "native room join effects summary");
requireIncludes(bridgeText, "join is not recording", "native room join token recording boundary copy");
requireIncludes(bridgeText, "inspectRoomJoin", "native side-effect-free room diagnostics client");
requireIncludes(bridgeText, "Safe inspection only: no participant, provider join, token, recording, Stripe, Calendar, or media mutation.", "native room diagnostics no-side-effect copy");
requireIncludes(bridgeText, "Buckets store bytes. Quipsly records own meaning, access, review, and publishing truth.", "native media-vault truth copy");
requireIncludes(bridgeText, "Quipsly-owned in-app session rooms are the production call path", "native in-app room primary path");
requireIncludes(bridgeText, "Start CallKit integration from the first native-room workflow", "native CallKit starts now boundary");
requireIncludes(bridgeText, "Normal Phone or FaceTime calls are fallback/import sources only", "native phone fallback boundary");
requireIncludes(bridgeText, "One-to-one coaching", "native coaching mode");
requireIncludes(bridgeText, "Podcast capture", "native podcast mode");
requireIncludes(bridgeText, "Research interview", "native research interview mode");
// The shipping universal iPhone and iPad recorder is CapturePhoneShell. Keep this contract tied to
// controls and copy that are actually reachable from that root instead of
// accepting strings from disconnected component prototypes.
requireIncludes(capturePhoneShellText, "CaptureRecordingModePicker(", "shipping recorder exposes explicit audio and video modes");
requireIncludes(capturePhoneShellText, "return podcast ? .podcastAV : .audio", "shipping recorder defaults podcast Sessions to coordinated A/V and coaching Sessions to audio");
requireIncludes(capturePhoneShellText, "quipsly.capture.preferred-recording-mode.coaching.v2", "shipping recorder keeps coaching recording preferences in a purpose-specific lane");
requireIncludes(capturePhoneShellText, "quipsly.capture.preferred-recording-mode.podcast.v2", "shipping recorder keeps podcast recording preferences in a purpose-specific lane");
requireIncludes(capturePhoneShellText, "CaptureCallPreferences.recordingMode(", "shipping recorder reloads the recording preference for the selected Session purpose");
requireIncludes(capturePhoneShellText, "for: model.selectedSession?.purpose", "shipping recorder binds recording-mode reads and writes to the selected Session purpose");
requireIncludes(capturePhoneShellText, "CaptureCallPreferences.setRecordingMode(", "shipping recorder persists recording-mode choices only within the current purpose lane");
requireIncludes(capturePhoneShellText, "VideoRecorderHero(", "shipping recorder reaches local video capture");
requireIncludes(capturePhoneShellText, "onSwitchCamera:", "shipping video recorder exposes deliberate camera switching");
requireIncludes(capturePhoneShellText, "private func announceSavedSourceIfStopped()", "shipping recorder owns an explicit post-stop confirmation");
requireIncludes(capturePhoneShellText, "You can keep talking or leave the call when you are ready", "stopping a recording does not force the coach out of an active call");
requireIncludes(capturePhoneShellText, "Quipsly handles cloud backup and transcription automatically.", "local-only capture explains the automatic post-call path without an approval step or a stale future phase");
requireIncludes(capturePhoneShellText, "&& !localRecordingWorkspaceIsOpen(for: session)", "completed Sessions retain an in-app edit doorway after the recorder workspace closes");
requireIncludes(capturePhoneShellText, "session.isCoachingSession && !sessionHasPostCallWork(session)", "pre-call coaching preparation yields to completed-session work after capture or transcription begins");
requireIncludes(runtimeUISmokeTestsText, "The completed take should appear as a new immutable local source.", "runtime iPhone flight proves Stop reaches a new immutable local source row");
requireIncludes(capturePhoneShellText, "CaptureRehearsalReadinessCard(", "shipping recorder exposes a preflight check");
requireIncludes(capturePhoneShellText, "CaptureSessionGuardianCard(", "shipping recorder reaches one ranked operational Guardian");
requireIncludes(captureSessionGuardianText, 'accessibilityIdentifier("CaptureSessionGuardian")', "shipping Guardian has a stable automation identity");
requireIncludes(captureSessionGuardianText, "The high-quality local recording is running separately from the call.", "shipping Guardian keeps call and retained-source evidence separate");
requireIncludes(captureSessionGuardianText, "The high-quality recording continues even though the call disconnected.", "shipping Guardian preserves independent local capture through call loss");
requireIncludes(captureSessionGuardianText, "No useful microphone signal is reaching the recording", "shipping Guardian exposes retained-source signal loss");
requireIncludes(capturePhoneShellText, "CaptureAudioSoundCheckController()", "shipping recorder owns the local sound-check lifecycle");
requireIncludes(audioText, "@Published private(set) var meterSampleSequence", "live recorder publishes a meter clock even when sustained signal is unchanged");
requireIncludes(audioText, "defer { meterSampleSequence &+= 1 }", "every recorder meter observation advances the live history clock");
assert(
  (audioText.match(/meterHistoryEpoch &\+= 1/g) ?? []).length === 1,
  "a new journaled source resets live history exactly once while pause and provider resume preserve it",
  { expectedIncrementCount: 1 },
);
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureLiveSignalHistory")', "shipping recorder exposes accessible rolling signal history");
requireIncludes(capturePhoneShellText, "final waveform and loudness come from the saved source", "live level history does not impersonate decoded waveform or loudness evidence");
requireIncludes(deterministicUITestsText, "recent level samples", "operated voice-writing acceptance observes live signal-history sampling");
requireIncludes(captureRehearsalReadinessText, 'accessibilityIdentifier("CaptureSoundCheckStart")', "shipping rehearsal exposes an addressable sound-check action");
assert(!captureRehearsalReadinessText.includes("consentReady"), "Private local sound check must not depend on Session recording consent.", { forbidden: "consentReady" });
requireIncludes(captureRehearsalReadinessText, "never uploaded or added to the Session", "shipping sound check declares its local-only boundary");
requireIncludes(captureRehearsalReadinessText, "deleted automatically", "shipping sound check declares automatic cleanup");
requireIncludes(audioSoundCheckText, "coordinator.activateLocalCapture()", "sound check shares the process audio-session lease");
requireIncludes(audioSoundCheckText, "coordinator.beginLocalPlayback()", "sound check listen-back shares the process playback lease");
requireIncludes(audioSoundCheckText, "purgeAbandonedChecks()", "sound check purges abandoned temporary files on launch");
requireIncludes(audioSoundCheckText, "FileProtectionType.complete", "sound check file is protected at rest");
requireIncludes(audioSoundCheckText, "UIApplication.didEnterBackgroundNotification", "sound check finalizes visibly when the app backgrounds");
assert(!audioSoundCheckText.includes("UploadManager"), "Sound check must not enter the upload subsystem.", { forbidden: "UploadManager" });
assert(!audioSoundCheckText.includes("LocalRecordingLibrary"), "Sound check must not create a canonical local source.", { forbidden: "LocalRecordingLibrary" });
requireIncludes(audioSoundCheckModelText, "safeNearFullScaleObservationCount > 0", "sound check retains near-full-scale risk across later quiet windows");
requireIncludes(audioSoundCheckModelText, "Listen back for mouth noise", "healthy electrical evidence still requires perceptual review");
requireIncludes(capturePhoneShellText, "ProviderRoomControls(", "shipping recorder reaches provider room controls");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureProviderRoomControls")', "shipping provider controls have a stable automation identity");
requireIncludes(capturePhoneShellText, '@AppStorage("quipsly.call.join-muted.v1")', "shipping call entry remembers whether call audio belongs on this iPhone");
requireIncludes(capturePhoneShellText, '@AppStorage("quipsly.call.microphone-muted.v1")', "shipping call entry remembers the conventional pre-join microphone choice separately");
requireIncludes(capturePhoneShellText, '@AppStorage("quipsly.call.camera-off.v1")', "shipping call entry remembers the conventional pre-join camera choice separately");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureCallInputRoute")', "shipping call entry names the current microphone route");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureUseCallAudioToggle")', "shipping call entry exposes an addressable audio-device control");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureJoinMicrophoneToggle")', "shipping call entry exposes an addressable pre-join microphone control");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureJoinCameraToggle")', "shipping call entry exposes an addressable pre-join camera control");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier = "CaptureCallAudioRoutePicker"', "shipping call entry exposes Apple's system audio-route control");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureCallOutputRoute")', "shipping call entry names its listening route separately from the microphone");
requireIncludes(capturePhoneShellText, "AVRoutePickerView", "native call routing delegates speaker, wired, USB, and Bluetooth choices to the system route UI");
requireIncludes(captureAudioSessionCoordinatorText, '@Published private(set) var currentOutputRouteName', "shared native audio policy publishes the actual current listening route");
requireIncludes(captureAudioSessionCoordinatorText, "AVAudioSession.routeChangeNotification", "shared native audio policy refreshes route truth after hardware or system changes");
requireIncludes(captureAudioSessionCoordinatorText, "private func refreshRouteSnapshot()", "shared native audio policy derives display routes from the active AVAudioSession");
requireIncludes(captureAudioSessionCoordinatorText, "No microphone became active.", "recording validates the real microphone only after Quipsly owns the active audio session");
for (const needle of [
  "includeSelectedDataSource: true",
  "port.selectedDataSource?.dataSourceName",
  "coordinator.currentInputRouteName == \"No microphone active\"",
  ": coordinator.currentInputRouteName",
]) {
  requireIncludes(
    needle.includes("coordinator.")
      ? captureAudioSoundCheckText
      : captureAudioSessionCoordinatorText,
    needle,
    "sound check records the activated input port and selected microphone data source",
  );
}
requireIncludes(captureAudioSessionCoordinatorText, "options: [.defaultToSpeaker, .allowBluetoothHFP]", "recording and calls use primary audio that conventionally interrupts background playback");
requireExcludes(captureAudioSessionCoordinatorText, ".mixWithOthers", "recording does not lose microphone IO by mixing with a competing playback app");
requireIncludes(audioText, "iOS may\n            // report no current input while another app still owns the active", "side-effect-free recorder preparation does not mistake an inactive route for missing hardware");
requireIncludes(captureAudioSessionCoordinatorText, "isProviderInputRetentionActive", "provider-backed local masters retain an explicit input-engine lease across room lifecycle changes");
requireIncludes(captureAudioSessionCoordinatorText, "func retainProviderInputForLocalCapture() throws", "provider input retention is an explicit recording boundary rather than an inferred CallKit side effect");
requireIncludes(captureAudioSessionCoordinatorText, "isProviderInputRetentionActive ? .default : .none", "CallKit connect and deactivate preserve only an explicitly retained provider input");
requireIncludes(captureAudioSessionCoordinatorText, "releaseProviderInputRetention()", "ending the local capture releases its provider input retention lease");
requireIncludes(audioText, "try audioSessionCoordinator.retainProviderInputForLocalCapture()", "provider recorder acquires input retention before claiming a durable local master");
requireIncludes(captureAudioSessionCoordinatorText, "func toggleBuiltInSpeaker() throws", "shared native audio policy owns the conventional in-call speaker override");
requireIncludes(captureAudioSessionCoordinatorText, "overrideOutputAudioPort(", "in-call speaker control uses the supported AVAudioSession override boundary");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureJoinCameraPreview")', "shipping call entry exposes a real pre-join camera preview after explicit preparation");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureJoinSwitchCameraButton")', "shipping call entry can switch front and back cameras before joining");
requireIncludes(capturePhoneShellText, "await model.restoreRoomCameraAfterJoin(", "shipping join and manual rejoin restore the remembered live-camera choice");
requireIncludes(captureExperienceModelText, "func restoreRoomCameraAfterJoin(", "native camera restoration is idempotent instead of using a state-blind toggle");
requireIncludes(captureExperienceModelText, "[.ready, .arming, .recording, .finalizing, .paused]", "native camera publication accepts an active participant-owned video master after rejoin");
assert(
  !capturePhoneShellText.includes("!joinCameraOff,\n                               videoCapture.state == .ready"),
  "Manual Rejoin must not drop live camera publication merely because the protected local video master is already recording.",
  { forbidden: "videoCapture.state == .ready" },
);
requireIncludes(capturePhoneShellText, "await model.dismissRoomCameraPreview(using: videoCapture)", "turning the call camera off releases an unowned pre-join preview");
requireIncludes(capturePhoneShellText, "if model.providerRoom.isConnected,", "the remembered camera-on choice is published only after provider-room connection succeeds");
requireIncludes(captureExperienceModelText, "func dismissRoomCameraPreview(", "native call-camera preview has an explicit privacy shutdown boundary");
requireIncludes(captureExperienceModelText, "func prepareRoomCameraPreview(", "native call-camera preview has a first-class owner separate from retained recording preparation");
requireIncludes(captureExperienceModelText, "ownsRoomCameraPreview = false", "native call-camera preview releases its ownership when dismissed or replaced");
requireIncludes(captureExperienceModelText, "await dismissRoomCameraPreview(using: videoCapture)", "turning call video off releases camera hardware unless a retained source still owns it");
requireIncludes(capturePhoneShellText, ".onChange(of: visibleTab)", "leaving Record closes an unjoined call-camera preview instead of leaving hidden capture active");
requireIncludes(capturePhoneShellText, "!model.ownsRoomCameraPreview", "recording-mode preferences do not silently repurpose the active call-lobby camera graph");
requireIncludes(capturePhoneShellText, "if microphonePermissionNeedsRecovery", "shipping call entry does not lead a valid muted join with microphone Settings paperwork");
requireIncludes(capturePhoneShellText, "return !joinMuted && model.providerRoom.isMuted", "a connected participant sees microphone Settings recovery only when speaking was requested but the provider remained muted");
requireIncludes(captureExperienceModelText, "if useCallAudio && !joinMuted", "a muted iPhone join defers microphone permission until the person chooses to speak");
requireIncludes(captureExperienceModelText, "joinMuted: effectiveJoinMuted", "the native join carries the requested or permission-fallback microphone choice independently from call-audio routing");
requireIncludes(providerRoomText, "ConnectOptions(autoSubscribe: useCallAudio)", "native companion mode does not subscribe to remote call media");
requireIncludes(providerRoomText, "enabled: useCallAudio && !joinMuted", "native primary endpoints can subscribe to the conversation while joining with microphone publication off");
requireIncludes(providerRoomText, 'prepareMicrophonePermission(action: "speak in the call")', "the first explicit Unmute action becomes the deferred microphone permission boundary");
requireIncludes(providerRoomText, "func refreshPermissionReadinessSnapshot() async", "the shared call controller reconciles remembered microphone access whenever Quipsly returns from Settings");
requireIncludes(providerRoomText, "guard lastFailureWasMicrophonePermission else { return }", "return-from-Settings clears only a permission-specific call failure");
requireIncludes(providerRoomText, "try? await room.localParticipant.setMicrophone(enabled: false)", "revoked microphone access reconciles a formerly live provider microphone to muted without leaving the call");
requireIncludes(captureAppText, "ProviderRoomController.shared", "the app lifecycle refreshes the one process-wide call controller after Settings changes");
requireIncludes(providerRoomText, "enum PendingCallKitEndDisposition", "native CallKit cleanup uses one coherent person-ended, programmatic, or reconnect-exhausted policy");
requireIncludes(providerRoomText, "case reconnectExhausted", "native CallKit cleanup represents exhausted provider reconnect explicitly");
requireIncludes(providerRoomText, "var protectsLocalSource: Bool", "native CallKit end policy keeps source protection separate from rejoin eligibility");
requireIncludes(providerRoomText, "var allowsRejoin: Bool", "native CallKit end policy exposes manual-rejoin eligibility explicitly");
requireIncludes(providerRoomText, "allowRejoin: reconnectWasExhausted", "provider reconnect exhaustion preserves the manual Rejoin path through CallKit cleanup");
requireIncludes(providerRoomText, "@Published private(set) var rejoinableCallRoomID", "manual Rejoin eligibility is scoped to the Session that actually disconnected");
requireIncludes(providerRoomText, "func canRejoin(callRoomID: String) -> Bool", "native call recovery cannot unlock a different Session");
requireIncludes(providerRoomText, "let rejoinCallRoomID = shouldAllowRejoin ? self.activeCallRoomID : nil", "CallKit cleanup snapshots the exact room before asynchronous teardown clears its live bridge");
requireIncludes(providerRoomText, "self.rejoinableCallRoomID = rejoinCallRoomID", "CallKit's asynchronous end handler preserves only the exhausted room's Rejoin state");
requireIncludes(providerRoomText, "let resetCallRoomID = self.activeCallRoomID", "CallKit reset snapshots the exact affected room before provider cleanup");
requireIncludes(providerRoomText, "self.intentionalProviderDisconnect = true", "CallKit reset owns one deterministic recovery result rather than racing room-delegate inference");
requireIncludes(captureExperienceModelText, "providerRoom.canRejoin(callRoomID: session.callRoomId)", "room preparation bypasses route locks only for the selected disconnected Session");
requireIncludes(capturePhoneShellText, "model.providerRoom.canRejoin(callRoomID: session.callRoomId)", "the visible Rejoin affordance is scoped to the displayed Session");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureProviderRoomState")', "native call status has a stable automation and accessibility identity");
requireIncludes(capturePhoneShellText, '"Your local recording is still protected. Rejoin when you\'re ready."', "dropped-call recovery visibly distinguishes the protected local source from call transport");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureCallRejoinRecoveryStatus")', "dropped-call source protection has a stable automation and accessibility identity");
requireIncludes(deterministicUITestsText, "func testDisconnectedCallOffersOneTapRejoinWhileKeepingRecordingSafe", "deterministic native UI acceptance covers dropped-call recovery without touching real services");
requireIncludes(deterministicUITestPlanText, "CaptureExperienceUITests/testDisconnectedCallOffersOneTapRejoinWhileKeepingRecordingSafe", "the guarded critical UI lane cannot omit dropped-call recovery");
requireExcludes(capturePhoneShellText, '.alert("Capture needs attention"', "generic global capture alert title cannot hide the actual recovery category");
requireIncludes(capturePhoneShellText, ".alert(attentionPresentation.title", "global Capture errors use a contextual plain-language title");
requireIncludes(capturePhoneShellText, 'Button("Open Settings")', "a system permission failure offers the conventional Settings recovery action");
requireIncludes(capturePhoneShellText, "attentionPresentation.offersSettingsRecovery", "Settings appears only when it can actually repair the failure");
requireIncludes(capturePhoneShellText, "action: recoverFromInlineAttention", "recoverable Capture errors lead to their conventional repair surface instead of a dead-end acknowledgement");
requireIncludes(captureAttentionDiagnosticsText, '("Try again", CaptureAttentionRecovery.refresh)', "connection recovery offers one ordinary retry action");
requireIncludes(captureAttentionDiagnosticsText, '("Open Library", CaptureAttentionRecovery.openLibrary)', "source and storage recovery lead to the protected Library");
requireIncludes(captureAttentionDiagnosticsText, '("Open Sessions", CaptureAttentionRecovery.openSessions)', "call, camera, and Session recovery return to the ordinary Sessions surface");
requireIncludes(captureAttentionDiagnosticsText, '("Open Account", CaptureAttentionRecovery.openAccount)', "identity recovery leads directly to Account");
requireIncludes(deterministicUITestsText, "func testUploadAttentionOpensTheProtectedRecordingLibrary", "operated native acceptance covers recovery from upload attention to the retained source Library");
requireIncludes(deterministicUITestsText, "func testAccountAttentionOpensAccount", "operated native acceptance covers recovery from identity attention to Account");
for (const title of [
  "Microphone access is off",
  "Check your microphone",
  "Check your camera",
  "More storage is needed",
  "Call couldn't connect",
  "Connection interrupted",
  "Check this Session",
]) {
  requireIncludes(captureAttentionDiagnosticsText, title, "Capture attention uses specific standard recovery language");
}
for (const forbidden of [
  "consent attestation",
  "verify authority",
  "authority blocker",
  "Nest receipt",
  "room receipt",
  "recording start boundary",
]) {
  requireExcludes(captureExperienceModelText, forbidden, "internal recording architecture language stays out of user-facing Capture messages");
}
requireIncludes(captureExperienceModelText, "Confirm that everyone agreed to be recorded before you tap Record.", "Record explains the missing consent action in ordinary language");
requireIncludes(captureExperienceModelText, "Quipsly syncs the Session in the background.", "active recording status hides internal receipt machinery");
requireIncludes(captureExperienceModelText, "Your local recording is safe, and Quipsly will retry automatically.", "background Session-sync recovery stays calm and actionable");
requireIncludes(providerRoomText, "self.intentionalProviderDisconnect = !shouldAllowRejoin", "provider-exhausted cleanup remains distinct from a deliberate person-owned hang-up");
requireIncludes(providerRoomText, "didSubscribeTrack publication: RemoteTrackPublication", "native call refreshes its remote-video surface when a participant publishes video");
requireIncludes(providerRoomText, "didUnsubscribeTrack publication: RemoteTrackPublication", "native call removes stale remote video when a participant stops video");
requireIncludes(providerRoomText, "SwiftUIVideoView(track, layoutMode: .fill)", "native call renders subscribed remote video using the provider SDK");
requireIncludes(providerRoomText, 'accessibilityIdentifier("CaptureRemoteCallVideo")', "native remote video has a stable automation identity");
requireIncludes(capturePhoneShellText, "model.providerRoom.hasRemoteVideo", "shipping call surface reveals remote video only when a real track exists");
assert(!providerRoomText.includes("setCamera(enabled: true)"), "Live call must not silently seize the iPhone camera from retained local capture.", { forbidden: "setCamera(enabled: true)" });
requireIncludes(videoCaptureServiceText, "AVCaptureVideoDataOutput()", "one AVFoundation camera graph emits live conversation frames");
requireIncludes(videoCaptureServiceText, "captureSession.addOutput(videoDataOutput)", "live frame output joins the retained movie capture session");
requireIncludes(videoCaptureServiceText, "captureSession.addOutput(movieOutput)", "retained movie output remains on the shared camera session");
requireIncludes(providerRoomText, "LocalVideoTrack.createBufferTrack", "native call publishes the app-owned camera frames through a custom LiveKit track");
requireIncludes(providerRoomText, "source.setLiveVideoFrameConsumer(bridge)", "LiveKit consumes frames from the authoritative retained-capture camera owner");
requireIncludes(providerRoomText, "clearLocalVideoBridge()", "native call teardown detaches the shared camera bridge");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier: "ProviderToggleCameraButton"', "persistent call dock exposes a conventional camera toggle");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("ProviderLocalVideoPreview")', "native call shows the local camera preview when published");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("ProviderCallVideoStage")', "native call composes remote video as the main stage instead of a vertical settings stack");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("ProviderSwitchCameraButton")', "native call exposes standard front/back camera switching");
requireIncludes(captureExperienceModelText, "func switchRoomCamera(", "live camera switching reuses the authoritative capture controller");
requireIncludes(captureExperienceModelText, "endpointRole: useCallAudio ? \"primary\" : \"companion\"", "native room token records primary versus companion endpoint intent");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("ProviderJoinRoomButton")', "shipping provider join action is addressable");
const recorderBottomInsetStart = capturePhoneShellText.indexOf(
  ".safeAreaInset(edge: .bottom, spacing: 0)",
);
const connectedRecorderDockStart = capturePhoneShellText.indexOf(
  "if model.providerRoom.isConnected {",
  recorderBottomInsetStart,
);
const localOnlyRecorderDockStart = capturePhoneShellText.indexOf(
  "} else if localRecordingWorkspaceIsOpen",
  connectedRecorderDockStart,
);
assert(
  recorderBottomInsetStart >= 0
    && connectedRecorderDockStart > recorderBottomInsetStart
    && localOnlyRecorderDockStart > connectedRecorderDockStart,
  "Shipping recorder must retain an inspectable connected-call bottom inset.",
  { label: "shipping recorder owns a connected-call bottom dock boundary" },
);
const connectedRecorderDock = capturePhoneShellText.slice(
  connectedRecorderDockStart,
  localOnlyRecorderDockStart,
);
assert(
  connectedRecorderDock.indexOf("CapturePersistentRecorderDock(") >= 0
    && connectedRecorderDock.indexOf("ProviderRoomDock(")
      > connectedRecorderDock.indexOf("CapturePersistentRecorderDock("),
  "Record must remain immediately reachable above ordinary call controls after Join.",
  { label: "connected iPhone call keeps persistent Record above Mute, Camera, and Leave" },
);
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CapturePersistentRecorderDock")', "persistent iPhone Record row has a stable automation identity");
requireIncludes(capturePhoneShellText, "Waiting for participant", "persistent iPhone Record row explains participant readiness without extra administration");
requireIncludes(capturePhoneShellText, "Waiting for host", "persistent iPhone recorder explains host-controlled recording");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CapturePersistentRecorderWaitingForHostStatus")', "ready participants see a conventional status instead of a broken-looking disabled Record button");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureAudioWaitingForHostStatus")', "audio recorder projects a non-interactive ready state for non-controller participants");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureVideoWaitingForHostStatus")', "video recorder projects a non-interactive ready state for non-controller participants");
requireIncludes(capturePhoneShellText, "&& coordinatedLocalRecordingReady(for: session)", "waiting-for-host truth requires this exact iPhone's consent and system access");
const captureRecorderViewStart = capturePhoneShellText.indexOf(
  "private struct CaptureRecorderView: View",
);
const shellCoordinationTaskStart = capturePhoneShellText.indexOf(
  ".task(id: recordingCoordinationTaskID)",
);
assert(
  shellCoordinationTaskStart >= 0
    && captureRecorderViewStart > shellCoordinationTaskStart
    && capturePhoneShellText.indexOf(
      ".task(id: recordingCoordinationTaskID)",
      shellCoordinationTaskStart + 1,
    ) < 0,
  "Room recording coordination must remain app-shell-owned rather than disappearing with the Sessions tab.",
  { label: "host Record and Stop survive navigation into notes and tasks" },
);
requireIncludes(capturePhoneShellText, "while !Task.isCancelled,", "shell-owned room coordination remains a cancellable joined-call loop");
requireIncludes(capturePhoneShellText, "model.selectedSession?.callRoomId == session.callRoomId", "shell-owned room coordination cannot drift into a different Session");
requireExcludes(capturePhoneShellText, '"tab=\\(visibleTab == .record)"', "recording coordination is never coupled to the visible tab");
requireIncludes(captureRecordingCoordinatorText, "func claim(_ directive: CaptureRecordingDirective) -> Bool", "competing shell and visible controls atomically claim each room command");
const coordinatedStartFunctionStart = capturePhoneShellText.indexOf(
  "private func requestCoordinatedStart",
);
const coordinatedStopFunctionStart = capturePhoneShellText.indexOf(
  "private func requestCoordinatedStop",
  coordinatedStartFunctionStart,
);
assert(
  coordinatedStartFunctionStart >= 0
    && coordinatedStopFunctionStart > coordinatedStartFunctionStart,
  "The coordinated recording start boundary must remain inspectable.",
  { label: "coordinated recording start boundary remains explicit" },
);
const coordinatedStartFunction = capturePhoneShellText.slice(
  coordinatedStartFunctionStart,
  coordinatedStopFunctionStart,
);
assert(
  coordinatedStartFunction.indexOf("recordingCoordinator.acceptActiveRecording()") >= 0
    && coordinatedStartFunction.indexOf("recordingCoordinator.acceptActiveRecording()")
      < coordinatedStartFunction.indexOf("session.canControlRecording == true"),
  "A controller must retry its endpoint against the existing durable START before issuing a conflicting second room command.",
  { label: "iPhone controller can recover its own failed or late local recording" },
);
requireIncludes(mobileCaptureConsentRouteText, "sessionInvitationAccessWhere", "browser recording readiness reuses the canonical Session control boundary");
requireIncludes(mobileCaptureConsentRouteText, "const canControlRoom = await actorCanControlRoom", "browser consent response cannot drift from recording-command authority");
requireIncludes(captureRecordingReceiptOutboxText, "FileProtectionType.completeUntilFirstUserAuthentication", "coordinated endpoint receipts survive process death in protected storage");
requireIncludes(captureRecordingReceiptOutboxText, "ownerAccountID == activeOwnerAccountID", "coordinated endpoint receipts fail closed across account changes");
requireIncludes(captureRecordingReceiptOutboxText, "$0.deliveryState == .pending || $0.createdAt >= cutoff", "unacknowledged endpoint receipts cannot age out of the outbox");
requireIncludes(captureRecordingCoordinatorText, "_ = try receiptOutbox.enqueue", "iPhone persists endpoint status before attempting network delivery");
requireIncludes(captureRecordingCoordinatorText, "await flushPendingReceipts()", "iPhone immediately attempts its protected recording-status outbox");
requireIncludes(captureRecordingCoordinatorText, "scheduleRetry()", "retryable endpoint receipt failures schedule real recovery");
requireIncludes(captureRecordingCoordinatorText, "receipt.ownerAccountID == AuthManager.currentStoredOwnerID()", "recording-status delivery stays bound to the active account");
requireIncludes(captureRecordingCoordinatorText, "v1.\\(ownerAccountID).\\(roomID)", "recording-status idempotency identities stay partitioned by account");
requireIncludes(captureRecordingCoordinatorText, 'packet.errorCode == "RECEIPT_ID_CONFLICT"', "iPhone recognizes Nest's terminal immutable-receipt conflict contract");
requireIncludes(captureRecordingCoordinatorText, "occurredAt: ISO8601DateFormatter().string(from: Date())", "iPhone persists original endpoint event time before delayed delivery");
requireIncludes(captureExperienceModelText, ".flushPendingReceipts()", "app load resumes recording-status delivery without requiring another call");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier: "ProviderToggleMuteButton"', "shipping persistent provider mute action is addressable");
requireIncludes(audioText, "var isUsingProviderAudioMaster: Bool", "native recorder exposes whether LiveKit owns the exact local PCM path");
requireIncludes(audioText, "providerAudioMaster != nil", "native provider-master truth is structural rather than inferred from a label");
requireIncludes(audioText, "guard transcriptionConsentGranted else { return }", "provisional call transcription respects the canonical transcription-consent boundary");
requireIncludes(audioText, "VoiceWritingLivePCMAnalyzerFactory.prepareIfAvailable", "connected calls reuse Apple device transcription without opening another microphone owner");
requireIncludes(audioText, "startProviderLiveTranscriptPreview(", "the provider master starts its best-effort live transcript observer");
requireIncludes(audioText, "detachProviderLiveTranscriptPreview(", "normal stop and failure paths detach the provider transcript observer");
requireIncludes(audioText, "await liveTranscriptAnalyzer?.finish()", "provisional words flush without delaying immutable source finalization");
requireIncludes(voiceWritingLiveSourceText, "enum CaptureSpeechRecognitionPermission", "Speak to write owns one conventional Apple Speech permission boundary");
const personalVoiceWritingStart = audioText.slice(
  audioText.indexOf("private func activateAudioSessionAndBeginPersonalVoiceWriting()"),
  audioText.indexOf("#if canImport(LiveKit)", audioText.indexOf("private func activateAudioSessionAndBeginPersonalVoiceWriting()")),
);
assert(
  personalVoiceWritingStart.indexOf("CaptureSpeechRecognitionPermission.requestIfNeeded()") >= 0
    && personalVoiceWritingStart.indexOf("CaptureSpeechRecognitionPermission.requestIfNeeded()")
      < personalVoiceWritingStart.indexOf("audioSessionCoordinator.activateLocalCapture()"),
  "Speak to write must settle Apple's Speech permission before starting the microphone source.",
  { label: "Speak to write requests Speech permission before source capture" },
);
requireIncludes(audioText, "|| speechPermission != .authorized", "Speech denial selects the proven audio recorder instead of blocking source capture");
requireIncludes(onDeviceTranscriptManagerText, "case waitingForCloudFallback", "cloud transcript delivery has an automatic non-error waiting phase");
requireIncludes(onDeviceTranscriptManagerText, "phases[recording.id] = .waitingForCloudFallback", "retryable cloud transcript delivery remains visibly queued");
requireIncludes(capturePhoneShellText, 'case .waitingForCloudFallback: return "Transcript queued"', "Capture describes automatic cloud transcript follow-through without an action ritual");
const providerStartBoundary = audioText.slice(
  audioText.indexOf("if let providerRecorder {"),
  audioText.indexOf("if let preparedVoiceWritingSource {"),
);
assert(
  providerStartBoundary.indexOf("try providerRecorder.start(at: startedAt)") >= 0
    && providerStartBoundary.indexOf("try providerRecorder.start(at: startedAt)")
      < providerStartBoundary.indexOf("startProviderLiveTranscriptPreview("),
  "Best-effort live captions must never delay protected provider-master start.",
  { label: "provider master starts before provisional transcript preparation" },
);
requireIncludes(providerAudioMasterText, "setLiveTranscriptPCMConsumer", "the LiveKit local-input recorder exposes one synchronized best-effort PCM observer");
const providerRenderStart = providerAudioMasterText.indexOf(
  "@objc func render(pcmBuffer: AVAudioPCMBuffer)",
);
const providerRenderEnd = providerAudioMasterText.indexOf("\n    }", providerRenderStart);
assert(
  providerRenderStart >= 0 && providerRenderEnd > providerRenderStart,
  "The provider local-input render boundary must remain inspectable.",
);
const providerRenderText = providerAudioMasterText.slice(providerRenderStart, providerRenderEnd);
assert(
  providerRenderText.indexOf("source.render(pcmBuffer: pcmBuffer)") >= 0
    && providerRenderText.indexOf("source.render(pcmBuffer: pcmBuffer)")
      < providerRenderText.indexOf("liveTranscriptPCMConsumer?(pcmBuffer)"),
  "Protected source persistence must be scheduled before best-effort live transcription.",
  { label: "provider source writer remains first in PCM render order" },
);
requireIncludes(voiceWritingLiveSourceText, "makeOwnedAnalyzerBuffer", "SpeechAnalyzer receives owned PCM rather than an SDK-recycled callback buffer");
requireIncludes(voiceWritingLiveSourceText, "bufferingPolicy: .bufferingNewest(24)", "live captions have bounded backpressure that cannot consume unbounded memory");
assert(
  (voiceWritingLiveSourceText.match(/AVAudioEngine\(\)/g) ?? []).length === 1,
  "The provider transcript observer must not introduce a second microphone engine.",
  { label: "only the standalone personal voice-writing path owns AVAudioEngine" },
);
requireIncludes(capturePhoneShellText, "Provisional live transcript", "connected-call words are visibly labeled as provisional");
requireIncludes(capturePhoneShellText, "Final timed text is rebuilt from the saved high-quality master after Stop.", "the call UI preserves final-master transcript authority");
requireIncludes(capturePhoneShellText, '"CaptureSessionLiveTranscript"', "connected-call live words have a stable automation identity");
requireIncludes(captureExperienceModelText, "var providerMuteControlLockedForLocalCapture: Bool", "native mute has a narrower safety boundary than route and room controls");
requireIncludes(captureExperienceModelText, "activeAudioCapture?.isUsingProviderAudioMaster != true", "native mute stays locked for any local audio source that does not share LiveKit input");
requireIncludes(captureExperienceModelText, "case .recording, .paused:", "native mute stays available across active and deliberately paused provider masters");
requireIncludes(captureExperienceModelText, "case .finalizing:", "native mute waits through the brief local-master finalization boundary");
requireIncludes(captureExperienceModelText, "retainedRecordingContinues: retainedRecordingContinues", "native mute explicitly tells the call layer when its protected master continues");
requireIncludes(providerRoomText, '"Call muted. Protected local recording continues."', "native mute plainly distinguishes outbound silence from a continuing local master");
requireIncludes(capturePhoneShellText, "model.providerMuteControlLockedForLocalCapture", "persistent native Mute remains usable during a compatible protected local master");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier: "ProviderToggleSpeakerButton"', "shipping persistent provider speaker action is addressable");
requireIncludes(captureExperienceModelText, "guard providerRoom.isConnected,", "native Speaker requires an active call instead of the broad local-recording lock");
requireIncludes(captureExperienceModelText, '"Speaker on. Your protected local recording continues; headphones keep call audio out of your master."', "native Speaker stays conventional while plainly warning about call bleed into the local master");
requireIncludes(captureExperienceModelText, '"Speaker off. Your protected local recording continues."', "native Speaker confirms the protected master remains active after returning to private output");
requireIncludes(capturePhoneShellText, "joinMuted = model.providerRoom.isMuted", "manual Rejoin remembers the person's latest successful in-call microphone state");
requireIncludes(capturePhoneShellText, "joinCameraOff = !model.providerRoom.isLocalVideoPublished", "manual Rejoin remembers the person's latest successful in-call camera state");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier: "ProviderLeaveRoomButton"', "shipping persistent provider leave action is addressable");
requireIncludes(capturePhoneShellText, "Finish or stop the current take first.", "shipping room controls cannot reconfigure active local capture");
requireIncludes(capturePhoneShellText, "Joins the conversation. Recording starts only when someone taps Record.", "shipping call control hint preserves explicit recording start");
requireIncludes(capturePhoneShellText, "CaptureConsentConfirmationSheet(", "shipping recorder reaches explicit participant consent");
requireIncludes(capturePhoneShellText, "await model.declineConsent(for: session.id)", "shipping recorder persists an explicit participant decline without blocking the call");
requireIncludes(captureExperienceModelText, "sessionClient.declineRecordingConsent(for: session)", "native decline uses the canonical participant consent route");
requireIncludes(captureExperienceModelText, "You can still join the call and change this choice later.", "native decline preserves ordinary call participation and a reversible choice");
requireIncludes(capturePhoneShellText, "Recording still starts separately.", "shipping consent does not imply recording");
requireIncludes(capturePhoneShellText, "CaptureSessionContextPanel(", "shipping recorder reaches session context");
requireIncludes(capturePhoneShellText, "CaptureCalendarContinuityCard(", "shipping Today surface reaches calendar continuity without a sixth tab");
requireIncludes(capturePhoneShellText, "CaptureAddNextSessionToCalendar", "shipping next Session exposes Apple's one-event editor");
requireIncludes(capturePhoneShellText, "Added to Calendar", "shipping event editor reports the ordinary saved result");
requireIncludes(captureCalendarEventEditorText, "It never reads the person's calendars or the saved", "shipping event-editor boundary avoids false provider readback");
requireIncludes(captureCalendarEventEditorText, "import EventKitUI", "native one-event export uses Apple's system editor framework");
requireIncludes(captureCalendarEventEditorText, "EKEventEditViewController", "native one-event export presents Apple's event editor");
requireIncludes(captureCalendarEventEditorText, "Private Session content is not copied into Calendar.", "native one-event export excludes private working content");
requireIncludes(captureCalendarEventEditorText, '.appendingPathComponent("sessions"', "native one-event export links back to canonical Session truth");
assert(!captureCalendarEventEditorText.includes("requestFullAccessToEvents"), "One-event EventKitUI export must not request full calendar access.", { forbidden: "requestFullAccessToEvents" });
assert(!captureCalendarEventEditorText.includes("requestWriteOnlyAccessToEvents"), "System-editor export must not request calendar access it does not need.", { forbidden: "requestWriteOnlyAccessToEvents" });
assert(!appInfoText.includes("NSCalendarsFullAccessUsageDescription"), "Capture must not declare full calendar access for system-editor export.", { forbidden: "NSCalendarsFullAccessUsageDescription" });
assert(!appInfoText.includes("NSCalendarsWriteOnlyAccessUsageDescription"), "Capture must not declare write-only calendar access while it only uses EventKitUI.", { forbidden: "NSCalendarsWriteOnlyAccessUsageDescription" });
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureCalendarContinuityCard")', "shipping calendar continuity has a stable automation identity");
requireIncludes(capturePhoneShellText, "Subscribe in Apple Calendar", "shipping calendar continuity offers an Apple Calendar subscription action");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureGoogleCalendarProjection")', "shipping calendar continuity exposes managed Google projection status");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureGoogleCalendarManage")', "shipping calendar continuity links to deliberate Google Calendar management");
requireIncludes(capturePhoneShellText, "Connect Google Calendar", "native Google Calendar connection is a direct optional action");
requireIncludes(capturePhoneShellText, "choose where coaching, podcast, and personal events should appear", "native Google Calendar copy exposes explicit calendar choices");
requireIncludes(capturePhoneShellText, "Share for Google or another calendar", "shipping calendar continuity offers a standard cross-provider subscription link");
requireIncludes(capturePhoneShellText, "Google's mobile app cannot add a calendar from a URL.", "shipping Google calendar setup states the provider's desktop-only URL subscription boundary");
requireIncludes(capturePhoneShellText, "Shown once", "shipping calendar capability is explicitly one-time");
requireIncludes(capturePhoneShellText, "Shared calendars are read-only and can be turned off anytime.", "shipping calendar projection states its lifecycle boundary");
requireIncludes(capturePhoneShellText, "only titles, times, and links back to Quipsly", "shipping calendar projection limits exported event fields");
requireIncludes(capturePhoneShellText, "not recordings, transcripts, notes, or participant details", "shipping calendar projection excludes private working content");
requireIncludes(bridgeText, "final class CaptureCalendarSubscriptionClient", "native calendar subscriptions use a dedicated authenticated client");
requireIncludes(bridgeText, "/api/calendar/connections/google?view=summary", "native Google Calendar status uses the credential-free stored summary");
requireIncludes(bridgeText, "MobileGoogleCalendarSummaryResponse", "native decodes safe Google connection and lane status");
requireIncludes(bridgeText, "/api/calendar/feeds", "native calendar subscriptions use the canonical Nest API");
requireIncludes(bridgeText, "AuthManager.shared.authenticatedData", "native calendar subscription operations require the signed-in Nest identity");
requireIncludes(bridgeText, "oneTimeFeed = nil", "native calendar capability can be removed from memory");
requireIncludes(bridgeText, "for your privacy, this exact link is shown only once.", "native calendar capability copy states one-time visibility");
requireIncludes(captureExperienceText, "calendarSubscriptionClient.loadPreview()", "deterministic native preview loads non-secret calendar status");
requireIncludes(deterministicUITestsText, "testAccountKeepsCalendarConnectionsSeparateFromPrivateSubscriptionLinks", "native calendar privacy boundary has a focused UI acceptance test");
requireIncludes(mobileText, "Load Nest", "native session context exposes an explicit canonical load");
requireIncludes(mobileText, "Save Nest", "native session context exposes an explicit canonical save");
requireIncludes(mobileText, "Local changes not synced", "native session context names unsynced local state");
requireIncludes(mobileCaptureReadinessRouteText, "sessionContextBoundary", "mobile readiness publishes the session-context boundary");
requireIncludes(mobileText, "quipsly.capture.session-context", "native session context has a stable local recovery key");
requireIncludes(mobileText, "Quick note", "native session context exposes a quick note");
requireIncludes(mobileText, "Goals", "native session context exposes goals");
requireIncludes(mobileText, "Tasks", "native session context exposes tasks");
requireIncludes(capturePhoneShellText, "UploadSummaryCard(model: model)", "shipping recorder reaches visible upload state");
requireIncludes(capturePhoneShellText, "StudioHandoffCard(", "shipping recorder reaches the Studio handoff");
requireIncludes(capturePhoneShellText, "if !session.isCoachingSession", "coaching keeps basic editing in Capture without advertising a separate Studio workflow");
assert(
  capturePhoneShellText.indexOf("StudioHandoffCard(")
    < capturePhoneShellText.indexOf("CaptureSessionTranscriptReviewCard("),
  "Verified-source Studio handoff remains in the immediate recorder outcome before long-form Session work.",
  { label: "shipping recorder keeps recovery and Studio handoff reachable before transcript, manuscript, and clip work" },
);
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureStudioHandoffCard_', "shipping Studio handoff has a stable automation identity");
requireIncludes(capturePhoneShellText, "without deleting or changing any original", "shipping Studio handoff preserves immutable originals");
requireIncludes(capturePhoneShellText, "CaptureSourceTruthFootnote", "shipping recorder reaches source-truth guidance");
requireIncludes(capturePhoneShellText, "verifies the cloud copy automatically before using it for transcription and editing", "shipping recorder explains automatic editor-input verification in customer language");
requireIncludes(bridgeText, "let progressedSinceRelease: Bool?", "native follow-through remains backward-compatible while decoding post-release goal progress");
requireIncludes(capturePhoneShellText, "New check-in", "native coaching preparation distinguishes new progress from a changed goal definition");
requireIncludes(capturePhoneShellText, "Evidence: \\(evidence)", "native coaching preparation preserves the client's evidence note with goal progress");
requireIncludes(captureExperienceText, "struct CaptureWorkNavigationRequest", "native coaching follow-through carries an explicit canonical Work navigation request");
requireIncludes(captureExperienceText, ".receive(on: DispatchQueue.main)", "native child-model updates are delivered on the main thread before publishing SwiftUI state");
requireIncludes(capturePhoneShellText, "CaptureFollowThroughOpenTask_", "native coaching follow-through exposes an exact canonical task action");
requireIncludes(capturePhoneShellText, "CaptureFollowThroughOpenGoal_", "native coaching follow-through exposes an exact canonical goal action");
requireIncludes(capturePhoneShellText, "proxy.scrollTo(request.scrollID", "native coaching follow-through focuses the exact canonical Work row");
for (const retiredRoot of [
  "struct MobileCaptureRunwayPanel",
  "struct MobileCaptureReviewDigestPanel",
  "struct RoomSpinePanel",
  "struct ProviderRoomView",
  "struct MobileCaptureActionPacketCard",
  "struct MobileCaptureLifecycleCard",
  "struct CapturePostCaptureRunwayCard",
]) {
  assert(!mobileText.includes(retiredRoot), "Disconnected legacy recorder and reviewer roots must stay out of the shipping target.", {
    forbidden: retiredRoot,
  });
}
requireIncludes(
  capturePhoneShellText,
  "@Environment(\\.accessibilityReduceMotion) private var reduceMotion",
  "phone capture surfaces read the system reduced-motion preference",
);
requireIncludes(
  capturePhoneShellText,
  "isActive: isPulsing && !reduceMotion",
  "live capture banner disables its pulse when reduced motion is enabled",
);
requireIncludes(
  capturePhoneShellText,
  "reduceMotion ? nil : .easeInOut(duration: 0.2)",
  "Today follow-through expansion has a non-animated reduced-motion path",
);
requireIncludes(
  capturePhoneShellText,
  ".safeAreaInset(edge: .bottom, spacing: 0)",
  "consent save action remains reachable outside the scrolling Form",
);
requireIncludes(
  capturePhoneShellText,
  "Saves only the recording and transcription choices shown above. Recording still starts separately.",
  "sticky consent action preserves the explicit recording-start boundary",
);
requireIncludes(
  transcriptReviewText,
  "reduceMotion ? nil : .easeOut(duration: 0.3)",
  "transcript evidence return has a non-animated reduced-motion path",
);
requireIncludes(
  transcriptReviewDecisionOutboxText,
  'case confirmSegmentAsIs = "confirm-segment-as-is"',
  "native transcript review records an explicit confirmed-as-is operation",
);
requireIncludes(
  captureAudioDecisionOutboxText,
  "completeFileProtectionUntilFirstUserAuthentication",
  "encoded-audio decisions are durably protected before transmission",
);
requireIncludes(
  captureAudioDecisionOutboxText,
  "activeOwnerAccountID",
  "encoded-audio decision recovery remains account partitioned",
);
requireIncludes(
  captureAudioDecisionOutboxText,
  "last-known-good",
  "encoded-audio decision recovery retains a last-known-good ledger",
);
requireIncludes(
  captureAudioDecisionOutboxText,
  "markHeld",
  "stale encoded-audio decisions stop for visible review",
);
requireIncludes(
  transcriptReviewText,
  'Button("Mark checked")',
  "native transcript review exposes a clear optional playback-backed confirmation action",
);
requireIncludes(
  transcriptReviewText,
  'Button(decisionsLocked ? "Save when reconnected" : "Save correction")',
  "ordinary native transcript correction saves without a forced listening ceremony",
);
requireIncludes(
  transcriptReviewText,
  "Save directly, or listen first when the audio will help.",
  "native transcript editing makes playback useful rather than mandatory",
);
requireExcludes(
  transcriptReviewText,
  "Listen through this exact segment before accepting.",
  "retired forced-listening transcript paperwork",
);
requireIncludes(
  transcriptReviewText,
  'Text("Use suggestion")',
  "native AI transcript suggestions remain one-tap editable without a listening ceremony",
);
requireIncludes(
  transcriptReviewText,
  '"confirmedAgainstPlayback": decision == "accept" && playbackPosition != nil',
  "native AI suggestion provenance distinguishes optional playback from ordinary acceptance",
);
requireExcludes(
  transcriptReviewText,
  'Text("Accept after listening")',
  "retired forced-playback AI suggestion gate",
);
requireIncludes(
  transcriptReviewText,
  "CaptureTranscriptSegmentVerification",
  "native transcript review decodes the append-only verification receipt",
);
requireIncludes(
  transcriptReviewText,
  "sourcePlayback: CaptureTranscriptPlayback?",
  "native transcript passages retain their exact participant playback binding",
);
requireIncludes(
  transcriptReviewText,
  "protectedSource?.recordingAssetId == expectedRecordingAssetID",
  "native protected playback refuses a different transcript source identity",
);
requireIncludes(
  transcriptReviewText,
  "recordingAssetID: expectedRecordingAssetID",
  "native listened-position receipts remain keyed to the expected RecordingAsset",
);
requireIncludes(
  transcriptReviewText,
  ".quipslyCaptureAccountIdentityDidChange",
  "native transcript playback discards listening authority when the account changes",
);
requireIncludes(
  transcriptReviewText,
  "AuthManager.shared.matchesStableOwnerSnapshot(owner)",
  "native protected transcript playback rechecks account ownership after preparation",
);
requireIncludes(
  transcriptReviewText,
  'kind == "audio"',
  "one-tap transcript playback cannot silently download a protected 4K video source",
);
requireIncludes(
  transcriptReviewText,
  "CaptureTranscriptVideoDownloadBoundary_",
  "native transcript review explains the protected video download boundary",
);
requireIncludes(
  sessionProtectedPlaybackText,
  "prepareTranscriptReviewFile",
  "transcript review reuses the verified account-bound Session playback cache",
);
requireIncludes(
  transcriptReviewText,
  "speakerGroupsRequiringIdentity(in: desk)",
  "native transcript review exposes voice naming only for unresolved speaker groups",
);
requireIncludes(
  transcriptReviewText,
  'case "source-binding", "attribution", "correction":',
  "authenticated source and saved speaker authority suppress redundant voice naming",
);
requireIncludes(
  transcriptReviewText,
  "CaptureTranscriptNameVoicesButton",
  "genuinely unresolved mixed or imported voices retain an obvious optional naming action",
);
requireIncludes(
  transcriptReviewText,
  "await protectedController.prepareTranscriptReviewFile(source: source)",
  "speaker samples can use exact protected Session playback on a different signed-in iPhone",
);
requireIncludes(
  deterministicUITestsText,
  "Source-bound participant recordings should not ask the user to name voices.",
  "operated iPhone coverage keeps authenticated participant identity automatic",
);
requireIncludes(bridgeText, "visibleRecordingIndicatorRequired", "readiness recording policy");
requireIncludes(bridgeText, "api/account/deletion-request", "native deletion request client");
requireIncludes(bridgeText, "prepareRoomJoin", "provider room join prep");
requireIncludes(bridgeText, "grantRecordingConsent", "consent grant client");
requireIncludes(bridgeText, "revokeRecordingConsent", "consent revoke client");

requireIncludes(deletionRouteText, "getQuipslySessionFromRequest", "authenticated account deletion request");
requireIncludes(deletionRouteText, "Account deletion started", "deletion request response");
requireIncludes(
  deletionRouteText,
  "advanceSelfServiceAccountDeletion",
  "ordinary deletion requests enter automatic processing",
);
requireIncludes(subscriptionStoreText, "import StoreKit", "native plan UI uses StoreKit 2");
requireIncludes(subscriptionStoreText, ".appAccountToken(accountToken)", "native purchase binds the signed-in Quipsly account");
requireIncludes(subscriptionStoreText, "AppStore.sync()", "native plan UI restores App Store purchases");
requireIncludes(subscriptionStoreText, "Transaction.updates", "native plan UI reconciles completed StoreKit transactions");
requireIncludes(subscriptionStoreText, "await transaction.finish()", "native transaction finishes only after server synchronization");
requireIncludes(subscriptionStoreText, "product.displayPrice", "native plan UI displays App Store localized pricing");
requireIncludes(capturePhoneShellText, "subscriptionRequired", "new Session entry presents the plan at the paid value boundary");
requireIncludes(capturePhoneShellText, "QuipslySubscriptionView(store: subscriptionStore)", "new Session entry opens native purchase and restore");
requireIncludes(mobileCaptureSessionsRouteText, 'capability: "coaching.call"', "new Session creation uses the canonical paid capability");
requireIncludes(mobileCaptureSessionsRouteText, 'code: "QUIPSLY_SUBSCRIPTION_REQUIRED"', "new Session creation returns a stable plan-required code");
requireExcludes(mobileCaptureSessionsRouteText, "QUIPSLY_CAPTURE_BETA_ACCESS_REQUIRED", "retired Capture beta allowlist gate");
requireIncludes(mobileCaptureProjectsRouteText, 'capability: "workspace.private_nests"', "paid coaches can create private Nests without a beta allowlist");
requireIncludes(mobileCaptureProjectsRouteText, 'code: "QUIPSLY_SUBSCRIPTION_REQUIRED"', "mobile private Nest creation reaches the plan instead of a beta gate");
requireExcludes(mobileCaptureProjectsRouteText, "PROJECT_BETA_ACCESS_REQUIRED", "retired mobile project beta gate");
requireIncludes(webProjectCreateActionText, 'capability: "workspace.private_nests"', "web private Nest creation shares canonical paid access");
requireExcludes(webAppLayoutText, "BetaAccessView", "signed-in product entry is not blocked by manual beta review");
requireExcludes(webSidebarText, "currentUser?.hasBetaAccess", "customer navigation does not carry a beta badge");
requireExcludes(webSidebarText, "Support beta", "customer support is presented as a paid product capability");
requireExcludes(webCaptureAppHandoffText, "Get the beta", "Session handoff presents the iPhone app as the product");
requireExcludes(webCaptureAppHandoffText, "update the beta", "Session recovery presents the iPhone app as the product");
requireExcludes(webRecorderBottomBarText, "Beta:", "browser recording guidance is release-ready");
requireIncludes(appStoreTransactionRouteText, "verifyAppStoreTransaction", "server verifies signed App Store transactions");
requireIncludes(appStoreTransactionRouteText, "expectedUserId: session.user.id", "server refuses cross-account purchase attachment");
requireIncludes(appStoreNotificationsRouteText, "verifyAppStoreNotification", "server verifies App Store Server Notifications V2");
requireIncludes(appStoreSubscriptionServerText, "applyVerifiedAppStoreNotification", "verified renewals update the canonical entitlement");
requireIncludes(appStoreSubscriptionServerText, "BILLING_GRACE_PERIOD", "App Store billing grace period retains access");
requireIncludes(subscriptionEntitlementsServerText, "quipslyCoachCapabilityAccess", "paid coach actions share one capability authority");
requireIncludes(coachingRunwayRouteText, 'capability: "coaching.schedule"', "web and iPhone coaching scheduling share the paid capability");
requireIncludes(coachingRunwayRouteText, 'code: "QUIPSLY_SUBSCRIPTION_REQUIRED"', "coaching scheduling returns a stable plan-required code");
requireRegex(
  coachingRunwayRouteText,
  /const paidCoachActions = new Set\(\[\s*"create-booking-room",\s*"create-booking-series",\s*"convert-booking-hold",\s*"update-public-booking",\s*\]\);/,
  "only new coach-owned scheduling and public-booking value is plan-gated",
);
requireIncludes(privacyPageText, "recorded only after an explicit user action and visible consent flow", "public privacy recording disclosure");
requireIncludes(privacyPageText, "Connecting Google Calendar is optional and separate from signing in to Quipsly", "public privacy calendar consent boundary");
requireIncludes(privacyPageText, "Short-lived Google access tokens are not stored", "public privacy calendar token disclosure");
requireIncludes(privacyPageText, "Google API Services User Data Policy", "public privacy Google API policy disclosure");
requireIncludes(privacyPageText, "Limited Use requirements", "public privacy Google Limited Use disclosure");
requireIncludes(privacyPageText, "disconnect Google Calendar from Quipsly at any time", "public privacy calendar revocation disclosure");
requireIncludes(deletionPageText, "Account deletion", "public account deletion page");
requireIncludes(coachingPageText, "Schedule your first coaching session", "first-time coach scheduling entry");
requireIncludes(coachingPageText, "Schedule and send invite", "ordinary coaching Session creation action");
requireIncludes(coachingPageText, "External calendar changes and charges always stay visible before they happen.", "coaching Session side-effect boundary");
requireExcludes(coachingPageText, "Reviewer-safe capture session preset loaded.", "reviewer preset status");
requireExcludes(coachingPageText, "reviewer-capture@dev.test", "reviewer preset email");
requireExcludes(coachingPageText, "Reviewer test capture session", "reviewer preset title");
requireIncludes(readinessDocText, "Review notes draft", "App Store review notes draft");
requireIncludes(readinessDocText, "RUN_NATIVE_AUTH_CONTRACT_SMOKE=1", "App Store readiness native-auth smoke");
requireIncludes(readinessDocText, "quipsly-mobile-capture-native-auth-smoke.mjs", "App Store readiness direct native-auth smoke reference");
requireIncludes(readinessDocText, "quipsly-capture-reviewer-session-smoke.mjs", "App Store readiness reviewer visible-session smoke reference");
requireIncludes(readinessDocText, "candidate room, participant", "App Store readiness reviewer visible-session report explanation");
requireIncludes(readinessDocText, "no visible capture session", "App Store readiness requires real reviewer session");
requireIncludes(readinessDocText, "Reviewer-safe capture session", "App Store readiness reviewer session setup");
requireIncludes(readinessDocText, "/coaching", "App Store readiness coaching runway setup path");
requireIncludes(readinessDocText, "Call architecture decision", "App Store readiness call architecture heading");
requireIncludes(readinessDocText, "Production coaching, podcast, and research calls should happen inside Quipsly-owned session rooms", "App Store readiness in-app room primary path");
requireIncludes(readinessDocText, "Normal Phone and FaceTime calls are fallback/import sources only", "App Store readiness phone fallback boundary");
requireIncludes(readinessDocText, "deliberately keeps `canStartProviderRecording:false`", "App Store readiness native provider recording boundary");
requireIncludes(readinessDocText, "separate Nest staff/operator action", "App Store readiness Nest provider recording boundary");
requireIncludes(readinessDocText, "AppReviewProofPanel", "App Store readiness native proof panel");
requireIncludes(readinessDocText, "no hidden recording", "App Store readiness no hidden recording proof");
requireIncludes(readinessDocText, "join rooms, start recording", "App Store readiness proof panel side-effect boundary");
requireIncludes(readinessDocText, "mutate external systems", "App Store readiness proof panel no external mutation boundary");
const appStoreMetadataResult = validateAppStoreMetadata(
  readAppStoreMetadata(),
  { root },
);
assert(
  appStoreMetadataResult.ok,
  "Canonical App Store listing metadata must pass its source contract.",
  {
    label: "canonical App Store listing metadata passes",
    errors: appStoreMetadataResult.errors,
  },
);
requireIncludes(
  listingDocText,
  "pnpm quipsly:capture:app-store-metadata --submission",
  "App Store listing documents the final fail-closed gate",
);
requireIncludes(
  listingDocText,
  "bash apps/mobile-capture/HighGroundCapture/scripts/capture-app-store-draft-screenshots.sh",
  "App Store listing documents deterministic draft capture",
);
requireIncludes(
  listingDocText,
  "scripts/release/quipsly-capture-screenshots-from-commit.sh",
  "App Store listing documents exact-commit draft capture",
);
requireIncludes(
  listingDocText,
  "`submissionEligible:false`",
  "App Store listing refuses to treat preview drafts as submission assets",
);
requireIncludes(
  deterministicUITestsText,
  "final class CaptureAppStoreScreenshotUITests",
  "dedicated App Store screenshot UI harness exists outside the release UX suite",
);
requireIncludes(
  deterministicUITestsText,
  '"--capture-app-store-presentation"',
  "draft screenshot journey requests the polished mutation-free presentation layer",
);
requireIncludes(
  captureExperienceModelText,
  "static var usesAppStorePresentation: Bool",
  "App Store presentation mode is explicit",
);
requireIncludes(
  captureExperienceModelText,
  "#if DEBUG",
  "App Store presentation mode is unavailable to release builds",
);
for (const filename of [
  "01-today.png",
  "02-record.png",
  "03-work.png",
  "04-library.png",
  "05-writing.png",
  "06-transcript.png",
  "07-subscription.png",
]) {
  requireIncludes(
    deterministicUITestsText,
    `keepScreenshot("${filename}")`,
    `screenshot UI harness captures ${filename}`,
  );
}
requireIncludes(
  appStoreDraftRunnerText,
  "iPhone 17 Pro Max",
  "draft screenshot runner uses the accepted 6.9-inch simulator",
);
requireIncludes(
  appStoreDraftRunnerText,
  "-only-testing:HighGroundCaptureUITests/CaptureAppStoreScreenshotUITests/testCapturePrivateDataSafeDrafts",
  "draft screenshot runner isolates the deterministic screenshot journey",
);
requireIncludes(
  appStoreDraftRunnerText,
  "MATERIALIZER_ARGUMENTS=(",
  "draft screenshot runner keeps a non-empty Bash 3 argument array on clean worktrees",
);
requireIncludes(
  appStoreDraftRunnerText,
  "MATERIALIZER_ARGUMENTS+=(--source-dirty)",
  "draft screenshot runner adds dirty provenance without an empty optional array",
);
requireIncludes(
  appStoreDraftMaterializerText,
  "submissionEligible: false",
  "draft screenshot receipt fails closed for App Store submission",
);
requireIncludes(
  appStoreDraftMaterializerText,
  "sourceIsolation",
  "draft screenshot receipt records source isolation",
);
requireIncludes(
  appStoreDraftMaterializerText,
  "fs.realpathSync",
  "draft screenshot CLI canonicalizes symlinked macOS paths",
);
requireIncludes(
  appStoreCommittedDraftRunnerText,
  "git -C \"$repo_root\" worktree add --detach",
  "committed draft runner materializes a detached source worktree",
);
requireIncludes(
  appStoreCommittedDraftRunnerText,
  "submissionEligible: false",
  "committed draft runner preserves the draft-only boundary",
);
requireIncludes(
  appStoreDraftMaterializerText,
  "imageDimensions(bytes, planned.filename)",
  "draft screenshot materializer verifies image dimensions from bytes",
);
requireIncludes(
  capturePhoneShellText,
  'accessibilityIdentifier("CaptureLibraryPreviewSourceCard")',
  "Library exposes a private-data-safe local-source layout fixture",
);
requireIncludes(reviewerChecklistText, "reviewer", "reviewer smoke checklist");
requireIncludes(reviewerChecklistText, "RUN_NATIVE_AUTH_CONTRACT_SMOKE=1", "reviewer checklist native-auth smoke");
requireIncludes(reviewerChecklistText, "quipsly-mobile-capture-native-auth-smoke.mjs", "reviewer checklist direct native-auth smoke reference");
requireIncludes(reviewerChecklistText, "quipsly-capture-reviewer-session-smoke.mjs", "reviewer checklist visible-session smoke reference");
requireIncludes(reviewerChecklistText, "visible session count, candidate room", "reviewer checklist visible-session report explanation");
requireIncludes(reviewerChecklistText, "has no visible capture session", "reviewer checklist requires real capture session");
requireIncludes(reviewerChecklistText, "Create a visible reviewer capture session", "reviewer checklist visible-session setup");
requireIncludes(reviewerChecklistText, "Production calls should happen inside Quipsly-owned session rooms", "reviewer checklist in-app room primary path");
requireIncludes(reviewerChecklistText, "Regular Phone or FaceTime calls are fallback/import sources only", "reviewer checklist phone fallback boundary");
requireIncludes(capturePhoneShellText, "Preview data — no server actions", "native preview mode visibly refuses server mutations");
requireIncludes(capturePhoneShellText, '"CapturePreviewModeBadge"', "native preview boundary has a stable automation identity");
requireIncludes(capturePhoneShellText, "Preview data · changes are off", "native work preview does not imply a saved mutation");

requireIncludes(mobileCaptureReadinessRouteText, "calendarReadiness", "mobile capture exposes calendar readiness");
requireIncludes(mobileCaptureReadinessRouteText, "/api/coaching/calendar/readiness", "mobile capture advertises coaching calendar readiness route");
requireIncludes(mobileCaptureReadinessRouteText, "/api/media-vault/readiness", "mobile capture advertises direct media-vault readiness route");
requireIncludes(mobileCaptureReadinessRouteText, "/api/media-vault/episode-inventory", "mobile capture advertises episode media inventory route");
requireIncludes(mobileCaptureReadinessRouteText, "/api/mobile/capture/rooms/join/diagnostics", "mobile capture advertises side-effect-free room join diagnostics");
requireIncludes(mobileCaptureReadinessRouteText, "getCoachingCalendarReadiness", "mobile capture uses shared calendar readiness adapter");
requireIncludes(roomJoinDiagnosticsRouteText, "diagnosticOnly: true", "room join diagnostics route is explicitly diagnostic-only");
requireIncludes(roomJoinDiagnosticsRouteText, "participantCreated: false", "room join diagnostics route does not create participants");
requireIncludes(roomJoinDiagnosticsRouteText, "providerJoined: false", "room join diagnostics route does not join provider rooms");
requireIncludes(roomJoinDiagnosticsRouteText, "tokenReturned: false", "room join diagnostics route does not return provider tokens");
requireIncludes(roomJoinDiagnosticsHelperText, "buildCaptureRoomJoinDiagnostic", "room join diagnostics shared helper");
requireIncludes(roomJoinDiagnosticsHelperText, "tokenMinted: false", "room join diagnostics helper does not mint provider tokens");
requireIncludes(roomJoinDiagnosticsHelperText, "mediaBoundary", "room join diagnostics carries media-vault boundary");
requireIncludes(roomJoinDiagnosticsHelperText, "Buckets store bytes", "room join diagnostics explains storage is not truth");
requireIncludes(recordingMediaPromotionText, "attachPromotedRecordingToEpisodeProduction", "recording promotion attaches known-episode media");
requireIncludes(recordingMediaPromotionText, "StudioEpisodeProduction.productionJson", "recording promotion episode production truth boundary");
requireIncludes(recordingMediaPromotionText, "room-composite-video", "recording promotion room composite role");
requireIncludes(recordingMediaPromotionText, "spine-audio-candidate", "recording promotion spine audio candidate role");
requireIncludes(recordingMediaPromotionText, "mutatedOriginal: false", "recording promotion no original mutation");
requireIncludes(recordingMediaPromotionText, "proxyStillNeededForVideo", "recording promotion video proxy readiness");
requireIncludes(capturePhoneShellText, "StudioHandoffCard(", "shipping recorder exposes verified Studio attachment");
requireIncludes(capturePhoneShellText, "CaptureOpenStudioReviewLink_", "shipping recorder can open exact Studio sync review");
requireIncludes(capturePhoneShellText, "No media moves until you review waveform, drift, and placement.", "shipping Studio handoff requires human sync review");
requireIncludes(capturePhoneShellText, "without deleting or changing any original", "shipping Studio handoff preserves immutable sources");
requireIncludes(capturePhoneShellText, "CaptureSourceEvidenceLink_", "shipping Library exposes source evidence");
requireIncludes(capturePhoneShellText, "CaptureTranscriptReviewLink_", "shipping Library exposes source-linked transcript review");
requireIncludes(capturePhoneShellText, 'Text("Transcript processing")', "session technical details expose transcript routing without cluttering the ordinary coaching surface");
requireIncludes(capturePhoneShellText, 'accessibilityIdentifier("CaptureTranscriptRoutingSummary")', "support can identify device Apple-service and Quipsly-cloud transcript work per Session");
requireIncludes(localEngineMediaVaultConfigText, "'high-ground-odyssey-media'", "local engine media-vault bucket fallback");
assert(!localEngineMediaVaultConfigText.includes("'high-ground-raw-footage'"), "Local engine must not fall back to the legacy raw-footage bucket.");
requireIncludes(localEngineMediaVaultConfigText, "'media-vault'", "local engine media-vault path root");
requireIncludes(localEngineMediaVaultConfigText, "kind,", "local engine media-vault uses thumb/proxy/raw prefixes directly");
requireIncludes(localEngineEpisodeMediaRegistrationText, "routeToProxyRegisterEndpoint", "local engine proxy register endpoint");
requireIncludes(localEngineEpisodeMediaRegistrationText, "/api/media-vault/proxies/register", "local engine registers uploaded proxies with Nest");
requireIncludes(localEngineEpisodeMediaRegistrationText, "registration.rawUrl || registration.rawGcsUri || registration.proxyUrl", "local engine registers raw source before proxy derivative");
requireIncludes(localEngineEpisodeMediaRegistrationText, "proxyRegistration", "local engine exposes proxy registration state");
requireIncludes(localEngineEpisodeMediaRegistrationText, "mutatedOriginal: false", "local engine proxy registration no original mutation");
requireIncludes(coachingCalendarAdapterText, "DEFAULT_COACHING_TIMEZONE = \"America/Los_Angeles\"", "Pacific coaching default");
requireIncludes(liveKitJoinTokenHelperText, "LIVEKIT_JOIN_TOKEN_TTL_SECONDS = 10 * 60", "LiveKit join token short TTL");
requireIncludes(liveKitJoinTokenHelperText, "roomJoin: true", "LiveKit token room join grant");
requireIncludes(liveKitJoinTokenHelperText, "metadata: JSON.stringify(input.metadata)", "LiveKit token metadata evidence");
assert(!liveKitJoinTokenHelperText.includes("console.log(input.apiSecret"), "LiveKit helper must not log provider secrets.");
requireIncludes(mobileCaptureReadinessRouteText, "getQuipslyLiveKitEgressReadiness", "mobile capture uses shared LiveKit egress readiness helper");
requireIncludes(mobileCaptureReadinessRouteText, "captureTranscriptWorkerEnabled", "mobile capture readiness recognizes the isolated production transcript worker");
requireIncludes(mobileCaptureReadinessRouteText, "localCaptureTranscriptWorkerEnabled", "mobile capture readiness recognizes an explicitly available local transcript worker");
requireIncludes(mobileCaptureReadinessRouteText, "sessionInvitationEmailReadiness", "mobile capture readiness projects actionable invitation-email availability without provider secrets");
requireIncludes(mobileCaptureReadinessRouteText, "invitationDelivery", "mobile capture publishes invitation delivery readiness");
requireIncludes(providerRecordingCommandText, "MEDIA_VAULT_BUCKET_ENV_NAMES", "LiveKit egress uses shared media-vault bucket env list");
requireIncludes(liveKitEgressHelperText, "MEDIA_VAULT_PREFIXES.livekitRecording", "LiveKit egress uses shared livekit recording prefix");
requireIncludes(providerRecordingCommandText, "LIVEKIT_EGRESS_ENABLED", "LiveKit egress has explicit operator enablement gate");
requireIncludes(providerRecordingCommandText, "egressEnabled: egressRequested && missing.length === 0", "LiveKit egress requires enablement and complete configuration");
requireIncludes(liveKitEgressHelperText, "durableCommandLedgerImplemented: true", "LiveKit readiness exposes the durable command ledger");
requireIncludes(liveKitEgressHelperText, "authenticatedWebhookLedgerImplemented: true", "LiveKit readiness exposes authenticated webhook receipts");
requireIncludes(liveKitEgressHelperText, "requestProviderRecordingStart(input)", "LiveKit START enters the durable command path");
requireIncludes(liveKitEgressHelperText, "requestProviderRecordingStop(input)", "LiveKit STOP enters the durable command path");
requireIncludes(providerRecordingCommandText, "acquirePrismaAdvisoryTransactionLock", "LiveKit commands serialize at the database boundary");
requireIncludes(providerRecordingCommandText, '"RECONCILE_REQUIRED"', "Ambiguous LiveKit commands remain reconciliation-required");
requireIncludes(mediaVaultReadinessRouteText, "mockMediaUploadsAllowed", "media-vault readiness exposes mock upload boundary");
requireIncludes(mediaVaultReadinessRouteText, "providerSecretsExposed: false", "media-vault readiness does not expose secrets");
requireIncludes(mediaVaultReadinessRouteText, "RecordingAsset owns call-room evidence first", "media-vault readiness recording-to-editor boundary");
requireIncludes(meetingSpineContractText, "tokenBoundary", "meeting spine token boundary");
requireIncludes(meetingSpineContractText, "providerCredentialExposed: false", "meeting spine no provider credential exposure");
requireIncludes(meetingSpineContractText, "providerSecretsExposed: false", "meeting spine no provider secrets exposure");
requireIncludes(meetingSpineContractText, "startsRecording: false", "meeting spine token does not start recording");
requireIncludes(meetingSpineContractText, "joinEffects", "meeting spine explicit real join effects");
requireIncludes(meetingSpineContractText, "providerJoined: false", "meeting spine server route does not join provider");
requireIncludes(meetingSpineContractText, "recordingStarted: false", "meeting spine server route does not start recording");
requireIncludes(meetingSpineContractText, "stripeMutated: false", "meeting spine server route does not mutate Stripe");
requireIncludes(meetingSpineContractText, "calendarMutated: false", "meeting spine server route does not mutate Calendar");
requireIncludes(coachingCalendarAdapterText, "getCoachingDefaultTimezone", "shared coaching timezone helper");
requireIncludes(coachingCalendarAdapterText, "checkCoachingCalendarAccess", "read-only calendar access check");
requireIncludes(coachingCalendarAdapterText, "/events?fields=kind&maxResults=1&singleEvents=true", "calendar readiness checks the exact event collection without requesting event content");
requireIncludes(coachingCalendarAdapterText, "No event content was returned to Quipsly, and no event was created, updated, deleted, or sent.", "calendar access check no mutation copy");
requireIncludes(coachingCalendarAdapterText, "Google Calendar is scheduling evidence and convenience. Quipsly owns booking", "calendar evidence boundary");
requireIncludes(coachingCalendarAdapterText, "GOOGLE_CALENDAR_INCLUDE_ATTENDEES", "calendar attendee-send boundary");
requireIncludes(coachingCalendarAdapterText, "GOOGLE_CALENDAR_ALLOW_METADATA_TOKEN", "calendar metadata token boundary");
requireIncludes(coachingCalendarReadinessRouteText, "verify=1", "calendar readiness route explicit provider verification");
requireIncludes(coachingCalendarReadinessRouteText, "Only staff can verify provider calendar access.", "calendar provider access staff boundary");
requireIncludes(coachingCalendarReadinessRouteText, "externalMutated: false", "calendar readiness route no external mutation");
requireIncludes(envExampleText, "COACHING_DEFAULT_TIMEZONE=\"America/Los_Angeles\"", "env example Pacific coaching default");
requireIncludes(envExampleText, "GOOGLE_CALENDAR_INCLUDE_ATTENDEES=\"false\"", "env example calendar attendee default");

const report = {
  ok: true,
  checkCount: checks.length,
  statusCounts: {
    pass: checks.length,
  },
  checks,
  checked: Object.fromEntries(
    Object.entries(files).map(([key, value]) => [key, path.relative(root, value)]),
  ),
  invariants: [
    "privacy manifest declares no tracking plus account/audio/user-content data",
    "app target has explicit microphone and dependency-required camera purpose strings plus audio background mode",
    "native auth uses Firebase email/password plus Quipsly bearer verification",
    "recording is blocked until explicit consent and microphone permission",
    "recording state is visible and broadcast to the UI",
    "local recordings are preserved and uploaded directly with protected, retryable GCS resumable sessions",
    "capture diagnostics expose upload recovery, server verification, local retention, and transcript repair state",
    "tester support sharing is explicit, redacted, accessible, and excludes identity, source, path, and credential fields",
    "mobile readiness exposes calendar evidence readiness without making Calendar the source of truth",
    "the universal iPhone and iPad app root exposes Capture and protected offline recovery without shipping facade editor or publisher surfaces",
    "privacy and account deletion routes are visible from app and web",
    "canonical App Store metadata is within field limits and records an explicit screenshot plan and blocker ledger",
    "reviewer readiness docs include native Firebase auth plus visible-session proof",
  ],
  note: "Static proof only. Device/TestFlight smoke is still required before App Store submission.",
};

if (process.argv.includes("--summary")) {
  console.log(JSON.stringify({
    ok: report.ok,
    checkCount: report.checkCount,
    statusCounts: report.statusCounts,
    invariants: report.invariants,
    note: report.note,
  }, null, 2));
} else {
  console.log(JSON.stringify(report, null, 2));
}
