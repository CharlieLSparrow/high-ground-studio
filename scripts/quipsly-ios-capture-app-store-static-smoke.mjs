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
  appStoreDraftRunner: path.join(iosRoot, "scripts/capture-app-store-draft-screenshots.sh"),
  appStoreDraftMaterializer: path.join(iosRoot, "scripts/app-store-draft-screenshots.mjs"),
  appStoreCommittedDraftRunner: path.join(root, "scripts/release/quipsly-capture-screenshots-from-commit.sh"),
  mobileCapturePreflight: path.join(root, "scripts/quipsly-mobile-capture-preflight.sh"),
  generatedMobileCaptureAuthSmoke: path.join(root, "scripts/quipsly-mobile-capture-generated-auth-smoke.mjs"),
  appDelegate: path.join(sourceRoot, "AppDelegate.swift"),
  authManager: path.join(sourceRoot, "AuthManager.swift"),
  loginView: path.join(sourceRoot, "LoginView.swift"),
  swiftPackageResolution: path.join(
    iosRoot,
    "HighGroundCapture.xcodeproj/project.xcworkspace/xcshareddata/swiftpm/Package.resolved",
  ),
  audioCapture: path.join(sourceRoot, "AudioCaptureController.swift"),
  videoCaptureController: path.join(sourceRoot, "VideoCaptureController.swift"),
  videoCaptureService: path.join(sourceRoot, "VideoCaptureService.swift"),
  captureAudioSessionCoordinator: path.join(sourceRoot, "CaptureAudioSessionCoordinator.swift"),
  episodeWatch: path.join(sourceRoot, "MobileEpisodeWatch.swift"),
  uploadManager: path.join(sourceRoot, "UploadManager.swift"),
  uploadLedgerStore: path.join(sourceRoot, "UploadLedgerStore.swift"),
  providerRoomController: path.join(sourceRoot, "ProviderRoomController.swift"),
  captureExperienceModel: path.join(sourceRoot, "CaptureExperienceModel.swift"),
  mobileQuickEntryOutbox: path.join(sourceRoot, "MobileQuickEntryOutbox.swift"),
  sourceInboxFiling: path.join(sourceRoot, "CaptureSourceInbox.swift"),
  sourceAnnotationDraftOutbox: path.join(sourceRoot, "SourceAnnotationDraftOutbox.swift"),
  sessionNoteEditOutbox: path.join(sourceRoot, "SessionNoteEditOutbox.swift"),
  captureReceiptStore: path.join(sourceRoot, "CaptureRoomReceiptStore.swift"),
  capturePhoneShell: path.join(sourceRoot, "CapturePhoneShell.swift"),
  captureSupportSnapshot: path.join(sourceRoot, "CaptureSupportSnapshot.swift"),
  transcriptReview: path.join(sourceRoot, "TranscriptCorrectionReview.swift"),
  localRecordingLibrary: path.join(sourceRoot, "LocalRecordingLibrary.swift"),
  localRecordingPlayback: path.join(sourceRoot, "LocalRecordingPlaybackController.swift"),
  mobileComponents: path.join(sourceRoot, "QuipslyMobileComponents.swift"),
  bridgeModels: path.join(sourceRoot, "BridgeModels.swift"),
  iPhoneSession: path.join(sourceRoot, "IPhoneQuipslySessionView.swift"),
  iPadSession: path.join(sourceRoot, "IPadQuipslyStudioView.swift"),
  mobileCaptureReadinessRoute: path.join(root, "apps/quipsly/src/app/api/mobile/capture/readiness/route.ts"),
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
  privacyPage: path.join(root, "apps/quipsly/src/app/(marketing)/privacy/page.tsx"),
  deletionPage: path.join(root, "apps/quipsly/src/app/(marketing)/privacy/account-deletion/page.tsx"),
  coachingPage: path.join(root, "apps/quipsly/src/app/(app)/coaching/page.tsx"),
  localEngineMediaVaultConfig: path.join(root, "apps/local-engine/src/MediaVaultConfig.ts"),
  localEngineEpisodeMediaRegistration: path.join(root, "apps/local-engine/src/EpisodeMediaRegistrationService.ts"),
  liveKitJoinTokenHelper: path.join(root, "apps/quipsly/src/lib/server/livekit-join-token.ts"),
  liveKitEgressHelper: path.join(root, "apps/quipsly/src/lib/server/coaching-livekit-egress.ts"),
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
  assert(text.includes(needle), "Required App Store/capture invariant is missing.", { label, missing: needle });
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
const appStoreDraftRunnerText = read(files.appStoreDraftRunner);
const appStoreDraftMaterializerText = read(files.appStoreDraftMaterializer);
const appStoreCommittedDraftRunnerText = read(files.appStoreCommittedDraftRunner);
const mobileCapturePreflightText = read(files.mobileCapturePreflight);
const generatedMobileCaptureAuthSmokeText = read(files.generatedMobileCaptureAuthSmoke);
const appDelegateText = read(files.appDelegate);
const authText = read(files.authManager);
const loginText = read(files.loginView);
const swiftPackageResolutionText = read(files.swiftPackageResolution);
const audioText = read(files.audioCapture);
const videoCaptureControllerText = read(files.videoCaptureController);
const videoCaptureServiceText = read(files.videoCaptureService);
const captureAudioSessionCoordinatorText = read(files.captureAudioSessionCoordinator);
const episodeWatchText = read(files.episodeWatch);
const uploadText = read(files.uploadManager);
const uploadLedgerText = read(files.uploadLedgerStore);
const providerRoomText = read(files.providerRoomController);
const captureExperienceText = read(files.captureExperienceModel);
const mobileQuickEntryOutboxText = read(files.mobileQuickEntryOutbox);
const sourceInboxFilingText = read(files.sourceInboxFiling);
const sourceAnnotationDraftOutboxText = read(files.sourceAnnotationDraftOutbox);
const sessionNoteEditOutboxText = read(files.sessionNoteEditOutbox);
const captureReceiptStoreText = read(files.captureReceiptStore);
const capturePhoneShellText = read(files.capturePhoneShell);
const captureSupportSnapshotText = read(files.captureSupportSnapshot);
const transcriptReviewText = read(files.transcriptReview);
const localRecordingLibraryText = read(files.localRecordingLibrary);
const localRecordingPlaybackText = read(files.localRecordingPlayback);
const mobileText = read(files.mobileComponents);
const bridgeText = read(files.bridgeModels);
const iPhoneText = read(files.iPhoneSession);
const iPadText = read(files.iPadSession);
const mobileCaptureReadinessRouteText = read(files.mobileCaptureReadinessRoute);
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
const privacyPageText = read(files.privacyPage);
const deletionPageText = read(files.deletionPage);
const coachingPageText = read(files.coachingPage);
const localEngineMediaVaultConfigText = read(files.localEngineMediaVaultConfig);
const localEngineEpisodeMediaRegistrationText = read(files.localEngineEpisodeMediaRegistration);
const liveKitJoinTokenHelperText = read(files.liveKitJoinTokenHelper);
const liveKitEgressHelperText = read(files.liveKitEgressHelper);
const meetingSpineContractText = read(files.meetingSpineContract);
const readinessDocText = read(files.readinessDoc);
const listingDocText = read(files.listingDoc);
const reviewerChecklistText = read(files.reviewerChecklist);
const rehearsalRunbookText = read(files.rehearsalRunbook);
const envExampleText = read(files.envExample);
const mobileSwiftSourceTreeText = readSwiftSourceTree(sourceRoot);

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
requireIncludes(appInfoText, "after you explicitly start recording", "microphone usage explicit action");
requireIncludes(appInfoText, "NSCameraUsageDescription", "camera usage string required by linked session SDK");
requireIncludes(appInfoText, "only after you explicitly choose video", "camera usage explicit video choice");
requireIncludes(appInfoText, "Audio recording does not use the camera", "camera usage audio boundary");
requireIncludes(providerRoomText, "configuration.supportsVideo = false", "audio-only CallKit presentation");
requireIncludes(appInfoText, "UIBackgroundModes", "background audio mode");
requireIncludes(appInfoText, "ITSAppUsesNonExemptEncryption", "export compliance declaration");
requireRegex(
  appInfoText,
  /<key>ITSAppUsesNonExemptEncryption<\/key>\s*<false\/>/,
  "no non-exempt encryption declaration",
);
requireRegex(projectText, /PRODUCT_BUNDLE_IDENTIFIER = com\.highgroundodyssey\.HighGroundCapture;/, "production bundle identifier");
requireRegex(projectText, /IPHONEOS_DEPLOYMENT_TARGET = 17\.0;/, "supported iOS 17 deployment floor");
requireRegex(projectText, /SUPPORTED_PLATFORMS = "iphoneos iphonesimulator";/, "iPhone-only supported platforms");
requireRegex(projectText, /TARGETED_DEVICE_FAMILY = 1;/, "iPhone-only target family");
requireRegex(projectText, /SUPPORTS_MACCATALYST = NO;/, "Mac Catalyst is not accidentally advertised");
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
requireIncludes(projectText, "version = 2.15.1;", "LiveKit Swift package is pinned to the verified release");
requireIncludes(projectText, "productName = LiveKit;", "LiveKit package product linked");
requireIncludes(projectText, "LiveKit in Frameworks", "LiveKit product linked into app target frameworks");
requireIncludes(liveKitProviderRoomValidatorText, "-resolvePackageDependencies", "LiveKit provider-room dependency resolver");
requireIncludes(liveKitProviderRoomValidatorText, "client-sdk-swift-xcframework.git", "LiveKit provider-room validator checks the binary package path");
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
requireIncludes(runtimeUISmokeRunnerText, 'google-handoff)', "runtime UI smoke can select the no-credential Google provider handoff proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'REQUIRES_PASSWORD_CREDENTIALS=false', "Google handoff proof does not require or serialize a reviewer password");
requireIncludes(runtimeUISmokeRunnerText, "custom paths are not visible inside the test runner", "credentialed runtime UI smoke rejects a credential path XCTest cannot read");
requireIncludes(runtimeUISmokeRunnerText, "Another credentialed Capture runtime UI smoke owns the canonical XCTest host bridge", "credentialed runtime UI smokes serialize access to the one protected host bridge");
requireIncludes(runtimeUISmokeRunnerText, 'skipped !== 0', "runtime UI smoke fails closed when Xcode reports a skipped selected test");
requireIncludes(runtimeUISmokeRunnerText, 'total !== 1', "runtime UI smoke requires exactly one executed bounded test");
requireIncludes(runtimeUISmokeRunnerText, 'TEST_CASE="testSignedInCaptureRoomSurfacesAreVisible"', "runtime UI smoke retains the non-mutating signed-in surface proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'TEST_CASE="testConsentedCapturePlaybackAndCrashRecovery"', "runtime UI smoke can select the consented recovery proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'TEST_CASE="testSignedInIPhoneAuthorsCanonicalWeeklyRecurrence"', "runtime UI smoke can select the signed-in recurrence-authoring proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'TEST_CASE="testIPhoneRecurrenceOutboxSurvivesOfflineRelaunchAndConverges"', "runtime UI smoke can select the offline/relaunch recurrence-authoring proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'recurrence-edit)', "runtime UI smoke can select the immutable-history recurrence-edit proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'task-edit)', "runtime UI smoke can operate and restore a canonical one-time task edit");
requireIncludes(runtimeUISmokeRunnerText, 'goal-edit)', "runtime UI smoke can operate and restore a canonical goal edit");
requireIncludes(runtimeUISmokeRunnerText, 'recurrence-missed)', "runtime UI smoke can select the explicit missed-occurrence proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'session-note-edit)', "runtime UI smoke can select the protected Session-note edit and relaunch proof mode");
requireIncludes(runtimeUISmokeRunnerText, 'source-inbox-filing)', "runtime UI smoke can select the private-source-to-Research filing proof mode");
requireIncludes(runtimeUISmokeTestsText, "func testSignedInCaptureRoomSurfacesAreVisible", "runtime UI smoke implements the signed-in surface proof");
requireIncludes(runtimeUISmokeTestsText, "func testConsentedCapturePlaybackAndCrashRecovery", "runtime UI smoke implements real consented capture, playback, and crash recovery");
requireIncludes(runtimeUISmokeTestsText, "func testSignedInIPhoneAuthorsCanonicalWeeklyRecurrence", "runtime UI smoke authors recurrence through signed-in iPhone controls and reads it back from Today");
requireIncludes(runtimeUISmokeTestsText, "func testIPhoneRecurrenceOutboxSurvivesOfflineRelaunchAndConverges", "runtime UI smoke proves recurrence survives an unreachable Nest plus process relaunch before canonical convergence");
requireIncludes(runtimeUISmokeTestsText, "func testIPhoneVersionsThisAndFutureRecurrenceWithoutRewritingHistory", "runtime UI smoke versions this-and-future recurrence through the signed-in iPhone controls");
requireIncludes(runtimeUISmokeTestsText, "func testOneTimeTaskEditRoundTripsAndRestoresThroughNest", "runtime UI smoke edits and restores one exact canonical task through signed-in iPhone controls");
requireIncludes(runtimeUISmokeTestsText, "func testCanonicalGoalEditRoundTripsAndRestoresThroughNest", "runtime UI smoke edits and restores one exact canonical goal through signed-in iPhone controls");
requireIncludes(runtimeUISmokeTestsText, "func testIPhoneExplicitlySkipsMissedOccurrenceAndContinuesSeries", "runtime UI smoke explicitly preserves one missed occurrence and proves the canonical series continues");
requireIncludes(runtimeUISmokeTestsText, "func testClientSafeDecisionCreatesEditsAndRelaunchesFromProtectedIPhoneOutbox", "runtime UI smoke creates, edits, and relaunches one exact canonical Session note");
requireIncludes(runtimeUISmokeTestsText, "func testPrivateSourceInboxFilesIntoCanonicalResearch", "runtime UI smoke files one exact private iPhone source into canonical Nest Research");
requireIncludes(runtimeUISmokeTestsText, "func testGoogleSignInOpensProtectedGoogleWebAuthenticationWithoutCredentials", "runtime UI smoke opens Apple's protected Google handoff without typing a credential");
requireIncludes(runtimeUISmokeTestsText, '"google.com"', "Google handoff proof asserts the exact external provider before leaving Quipsly");
requireIncludes(runtimeUISmokeTestsText, "hold duplicate auth attempts", "Google handoff proof keeps duplicate identity attempts disabled");
requireIncludes(sessionNoteEditOutboxText, "completeFileProtectionUntilFirstUserAuthentication", "Session-note edit outbox protects complete offline intent at rest");
requireIncludes(sessionNoteEditOutboxText, "ownerAccountID", "Session-note edit outbox partitions drafts by verified actor");
requireIncludes(capturePhoneShellText, "Skip missed occurrence…", "Capture exposes an explicit missed-occurrence decision instead of an unattended scheduler");
requireIncludes(capturePhoneShellText, 'decisionReason: "MISSED_OCCURRENCE_SKIPPED"', "Capture sends the exact bounded missed-occurrence decision reason");
requireIncludes(capturePhoneShellText, "retain the overdue task and occurrence as skipped", "Capture confirmation explains immutable history before the missed-occurrence mutation");
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
  "annotation is anchored to the complete preserved capture",
  "Keeps the private Inbox capture unchanged",
  "No task, calendar event, message, delivery, provider request, or publication is created.",
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
requireIncludes(episodeWatchText, "CaptureEpisodeWatchPlayPauseButton", "shared Watch has a reachable native play and pause control");

const authCombined = `${authText}\n${loginText}`;
requireIncludes(authText, "SecItemUpdate(lookup as CFDictionary, replacement as CFDictionary)", "Keychain rotation updates by stable item identity instead of matching the replacement secret value");
requireIncludes(authText, "guard updateStatus == errSecItemNotFound else { return false }", "Keychain persistence reports update failures instead of silently claiming the session is durable");
requireIncludes(authText, "This iPhone could not protect the refreshed Quipsly session in Keychain", "native sign-in exposes a truthful storage failure instead of opening an unrecoverable session");
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
  "QuipslyCapturePasswordConfirmationField",
  "QuipslyCaptureCreateAccountButton",
  "QuipslyCapturePasswordResetButton",
  "QuipslyCaptureGoogleSignInButton",
  "QuipslyCaptureGoogleIdentityContinuityHint",
  "QuipslyCaptureAccountSupportLink",
  "Recordings stay on this iPhone after upload; Quipsly never silently deletes a source.",
]) {
  requireIncludes(authCombined, needle, "native reviewer auth");
}
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
requireIncludes(loginText, "Continue with Google", "Google identities are directed to the canonical native provider");
requireIncludes(loginText, "will not silently create a second workspace", "Google identity continuity copy rejects duplicate Nest creation");
requireIncludes(loginText, "does not grant Capture beta recording or upload access", "account creation copy preserves beta access boundary");
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
requireIncludes(audioText, "isRecording = newState.isCaptureActive", "visible recording state source");
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
  "Cloud bytes verified. Editor attachment and transcript processing are held for review.",
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
  "did not join a silent provider room",
]) {
  requireIncludes(providerRoomText, needle, "native CallKit room presentation");
}

for (const needle of [
  "MobileCaptureRunwayPanel",
  "MobileCaptureLifecycleCard",
  "Capture lifecycle receipts",
  "accessibilityIdentifier(\"MobileCaptureLifecycleCard\")",
  "Recording is active and visible",
  "Recording is visibly active",
  "CaptureReadinessVerdictCard",
  "accessibilityIdentifier(\"CaptureReadinessVerdictCard\")",
  "captureReadinessIsSafeToRecord",
  "payment-hold",
  "Start recording only after every participant knows the call is being recorded and agrees.",
  "Consent needed",
  "Decline",
  "Revoke",
  "Retry \\(",
  "Request account deletion",
  "privacy/account-deletion",
  "runTranscript",
  "buildCoachingPacket",
  "CaptureSessionReceiptCard",
  "Capture receipt",
  "ProviderReceiptSlotNotice",
  "Provider receipt slot prepared",
  "This is not a recording yet.",
  "provider receipt is not media",
  "provider receipt slot only",
  "local original safe",
  "server:",
  "Local original preserved",
  "CaptureDiagnosticsPanel",
  "QuipslyCaptureDiagnosticsPanel",
  "Capture diagnostics",
  "preserved upload",
  "repair available from uploaded recording",
  "Background spine:",
  "UploadManager.backgroundSessionIdentifier",
  "latestRecordingAssetStatus",
  "server verification:",
  "local source preserved",
  "Local source:",
  "Original stays on device until Quipsly verifies upload and retention policy allows cleanup.",
]) {
  requireAnyIncludes(mobileText, [needle, needle.replace("\\(", "(")], "capture reviewer UI");
}

requireIncludes(iPhoneText, "CapturePhoneShell()", "legacy iPhone entrypoint is quarantined behind the capture-first shell");
requireIncludes(iPadText, "MobileCaptureRunwayPanel", "iPad capture runway");
requireIncludes(iPadText, "AppReviewProofPanel", "iPad App Review proof panel");
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
  "CaptureConsentAudibleParticipantsToggle",
  "CaptureConsentSaveChoicesButton",
  "Local source is production truth",
  "GlobalCaptureBanner",
  "ProviderControlsCaptureLockNotice",
  "Live room controls locked for this take",
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
  "Everyone who may be seen or heard",
  "model.providerControlsLockedForLocalCapture",
]) {
  requireIncludes(capturePhoneShellText, needle, "capture-first iPhone UX");
}
for (const needle of [
  "Help & diagnostics",
  "Share support snapshot",
  "CaptureSupportDisclosure",
  "CaptureShareSupportSnapshot",
  "CaptureSupportPrivacyBoundary",
  "CaptureVersionBuild",
]) {
  requireIncludes(capturePhoneShellText, needle, "privacy-bounded Capture support UX");
}
for (const needle of [
  "CaptureSupportSnapshot",
  "privacyBoundary",
  "Surface:",
  "Audio route type:",
  "Local originals:",
  "Recoverable uploads:",
  "Preview mode:",
]) {
  requireIncludes(captureSupportSnapshotText, needle, "redacted Capture support contract");
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
  "Saved on this iPhone. Upload can continue in the background.",
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
  "durable citation",
]) {
  requireIncludes(capturePhoneShellText, needle, "accessible private source-to-writing UX");
}
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
  "The wall-clock due time stays in",
  "It does not schedule a reminder or provider calendar event.",
]) {
  requireIncludes(capturePhoneShellText, needle, "explicit native recurrence authoring UX and side-effect boundary");
}
for (const needle of [
  'Button("Edit repeat…", systemImage: "pencil")',
  'Text("This task").tag("THIS_OCCURRENCE")',
  'Text("This + future").tag("THIS_AND_FUTURE")',
  "There is no rewrite-history option.",
  "Editing stays inside Quipsly. It does not change completed history, schedule a reminder, create or edit a provider calendar event, send a message, deliver, or publish.",
]) {
  requireIncludes(capturePhoneShellText, needle, "immutable-history native recurrence editing UX");
}
for (const needle of [
  'accessibilityIdentifier("CaptureWorkTaskEdit_\\(task.id)")',
  'accessibilityIdentifier("CaptureTodayTaskEdit_\\(task.id)")',
  'accessibilityIdentifier("CaptureTaskEditSave")',
  'accessibilityIdentifier("CaptureTaskEditBoundary")',
  "This edits only the open one-time task in Quipsly.",
  'status: task.status == "OPEN" ? "DONE" : "OPEN"',
]) {
  requireIncludes(capturePhoneShellText, needle, "native one-time task editing and canonical completion UX");
}
for (const needle of [
  "func editTask(",
  '"action": "task-edit"',
  'payload.action == "task-edit"',
  "acknowledgedDueLocal == requestedDueLocal",
  "Reconnect to Nest before editing this task. The protected snapshot was not modified.",
]) {
  requireIncludes(bridgeText, needle, "fail-closed native task-edit acknowledgement");
}
for (const needle of [
  'accessibilityIdentifier("CaptureWorkGoalEdit_\\(goal.id)")',
  'accessibilityIdentifier("CaptureTodayGoalEdit_\\(goal.id)")',
  'accessibilityIdentifier("CaptureGoalEditSave")',
  'accessibilityIdentifier("CaptureGoalEditBoundary")',
  "This edits only the goal title, definition of success, and target date.",
  "Protected offline snapshots remain unchanged until you reconnect.",
]) {
  requireIncludes(capturePhoneShellText, needle, "native canonical goal editing UX and side-effect boundary");
}
for (const needle of [
  "func editGoal(",
  '"action": "goal-edit"',
  '"targetDecision": targetDecision',
  'payload.action == "goal-edit"',
  'case "KEEP":',
  "acknowledgedTargetLocalDate == requestedTargetLocalDate",
  "Reconnect to Nest before editing this goal. The protected snapshot was not modified.",
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
  "!sessions.contains(where: { $0.id == authoritativeSessionID })",
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
    < callKitDeactivateBody.indexOf("AudioManager.shared.setEngineAvailability(.none)"),
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
  "Upload verified",
  "Cloud copy verified · review held",
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
  "Deletion receipts",
]) {
  requireIncludes(capturePhoneShellText, needle, "explicit local-original deletion UX");
}
for (const needle of [
  "CaptureLibraryJournalWarning",
  "editor attachment and transcript processing remain held for review",
  "only a verified, released upload becomes editor input",
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
requireIncludes(bridgeText, "struct MobileCaptureTranscriptPacketBoundaries: Codable", "native transcript packet boundary model");
requireIncludes(bridgeText, "let boundaries: MobileCaptureTranscriptPacketBoundaries?", "native packet build decodes boundaries");
requireIncludes(bridgeText, "struct MobileCapturePacketReviewLane: Codable", "native packet review lane model");
requireIncludes(bridgeText, "let reviewLanes: [MobileCapturePacketReviewLane]?", "native packet build decodes review lanes");
requireIncludes(bridgeText, "reviewLaneSummaryLine", "native packet review lane summary");
requireIncludes(bridgeText, "packetTruthLine", "native packet truth summary");
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
requireIncludes(mobileText, "NativeCaptureContractPanel", "native capture contract panel");
requireIncludes(mobileText, "accessibilityIdentifier(\"RecorderControlBoard\")", "native recorder board runtime accessibility");
requireIncludes(mobileText, "accessibilityIdentifier(\"RoomSpinePanel\")", "native room spine runtime accessibility");
requireIncludes(mobileText, "accessibilityIdentifier(\"CaptureInspectRoomReadinessButton\")", "native room readiness inspection button accessibility");
requireIncludes(mobileText, "accessibilityIdentifier(\"CapturePrepareJoinKeyButton\")", "native prepare join key button accessibility");
requireIncludes(mobileText, "accessibilityIdentifier(\"CaptureOpenRoomButton\")", "native open room button accessibility");
requireIncludes(mobileText, "accessibilityIdentifier(\"CaptureEndRoomButton\")", "native end room button accessibility");
requireIncludes(mobileText, "accessibilityIdentifier(\"ProviderRoomView\")", "native provider room runtime accessibility");
requireIncludes(mobileText, "accessibilityIdentifier(\"ProviderJoinRoomButton\")", "native provider join room button accessibility");
requireIncludes(mobileText, "accessibilityIdentifier(\"ProviderMuteButton\")", "native provider mute button accessibility");
requireIncludes(mobileText, "accessibilityIdentifier(\"ProviderLeaveRoomButton\")", "native provider leave button accessibility");
requireIncludes(mobileText, "readiness.providerEgressLabel", "native readiness shows server recording gate");
requireIncludes(mobileText, "readiness.providerEgressDetail", "native readiness explains server recording gate");
requireIncludes(mobileText, "readiness.providerReadiness?.sourceOfTruth", "native readiness shows provider media-vault truth");
requireIncludes(mobileText, "readiness.mediaVaultReadiness?.sourceOfTruth", "native readiness shows direct media-vault truth");
requireIncludes(mobileText, "CallKit presents the native iPhone call surface", "native room CallKit UI");
requireIncludes(mobileText, "controller.nativeCallPresentationLabel", "native room CallKit status chip");
requireIncludes(mobileText, "Native call surface active", "native room CallKit active readback");
requireIncludes(mobileText, "ProviderJoinTokenBoundaryCard", "native provider join token boundary card");
requireIncludes(mobileText, "accessibilityIdentifier(\"ProviderJoinTokenBoundaryCard\")", "native provider join token boundary accessibility");
requireIncludes(mobileText, "Provider key boundary", "native provider join token boundary visible heading");
requireIncludes(mobileText, "joinResponse.joinEffectsLine", "native provider join effects visible copy");
requireIncludes(mobileText, "room-scoped", "native provider join room-scoped token chip");
requireIncludes(mobileText, "consent first", "native provider join consent-first token chip");
requireIncludes(mobileText, "no provider secret", "native provider join token no secret copy");
requireIncludes(mobileText, "CallKitBoundaryCard", "native CallKit boundary card");
requireIncludes(mobileText, "accessibilityIdentifier(\"CallKitBoundaryCard\")", "native CallKit boundary accessibility");
requireIncludes(mobileText, "Native call presentation", "native CallKit boundary heading");
requireIncludes(mobileText, "CallKit makes a Quipsly-owned room feel native on iPhone", "native CallKit is presentation copy");
requireIncludes(mobileText, "not phone/FaceTime", "native CallKit not phone fallback chip");
requireIncludes(mobileText, "join not recording", "native CallKit join is not recording chip");
requireIncludes(mobileText, "Nest CallRoom truth", "native CallKit truth owner chip");
requireIncludes(mobileText, "CallKit can present or end the live room, but it never creates recording evidence by itself.", "native CallKit never creates recording evidence");
requireIncludes(mobileText, "RoomJoinDiagnosticsCard", "native room diagnostics card");
requireIncludes(mobileText, "accessibilityIdentifier(\"RoomJoinDiagnosticsCard\")", "native room diagnostics accessibility");
requireIncludes(mobileText, "Inspect readiness", "native inspect-readiness action");
requireIncludes(mobileText, "Inspection checks access, payment evidence, consent, provider readiness, local fallback, token safety, and media-vault boundaries", "native room diagnostics scope copy");
requireIncludes(mobileText, "ProviderRoomDiagnosticCard", "native provider diagnostic card");
requireIncludes(mobileText, "accessibilityIdentifier(\"ProviderRoomDiagnosticCard\")", "native provider diagnostic accessibility");
requireIncludes(mobileText, "Inspect readiness before preparing the provider join key. Inspection is safe; joining is an action.", "native provider diagnostics action boundary copy");
requireIncludes(mobileText, "CaptureSessionContextPanel", "native session context panel");
requireIncludes(mobileText, "Load Nest", "native session context load control");
requireIncludes(mobileText, "Save Nest", "native session context save control");
requireIncludes(mobileText, "Local changes not synced", "native session context local draft truth label");
requireIncludes(mobileCaptureReadinessRouteText, "sessionContextBoundary", "mobile readiness session context boundary");
requireIncludes(mobileText, "quipsly.capture.session-context", "native session context local persistence key");
requireIncludes(mobileText, "Quick note", "native quick note field");
requireIncludes(mobileText, "Goals", "native goals field");
requireIncludes(mobileText, "Tasks", "native tasks field");
requireIncludes(mobileText, "AppReviewProofPanel", "native App Review proof panel");
requireIncludes(mobileText, "App Review proof path", "native App Review proof heading");
requireIncludes(mobileText, "What App Review can verify without triggering hidden side effects.", "native App Review side-effect boundary");
requireIncludes(mobileText, "NO HIDDEN RECORDING", "native no hidden recording badge");
requireIncludes(mobileText, "Reviewer account", "native reviewer account proof line");
requireIncludes(mobileText, "Joining a room is not recording.", "native join is not recording boundary");
requireIncludes(mobileText, "Failed uploads become recoverable, not silent losses.", "native upload recovery proof line");
requireIncludes(mobileText, "accessibilityIdentifier(\"AppReviewProofPanel\")", "native App Review proof accessibility");
requireIncludes(mobileText, "readiness.calendarLabel", "native readiness calendar badge");
requireIncludes(mobileText, "Google Calendar is evidence; Quipsly owns booking truth.", "native readiness calendar truth copy");
requireIncludes(mobileText, "readiness.calendarReadiness?.sourceOfTruth", "native readiness calendar source of truth");
requireIncludes(mobileText, "MobileCaptureActionPacketCard", "native action packet card");
requireIncludes(mobileText, "accessibilityIdentifier(\"MobileCaptureActionPacketCard\")", "native action packet accessibility");
requireIncludes(mobileText, "Packet truth", "native packet build truth panel");
requireIncludes(mobileText, "MobileCapturePacketTruthPanel", "native packet truth accessibility");
requireIncludes(mobileText, "Review lanes", "native packet review lanes visible");
requireIncludes(mobileText, "MobileCapturePacketReviewLaneRow", "native packet review lane rows");
requireIncludes(mobileText, "accessibilityIdentifier(\"MobileCapturePacketReviewLaneRow\")", "native packet review lane accessibility");
requireIncludes(mobileText, "Safe next actions", "native lifecycle safe action heading");
requireIncludes(mobileText, "Action boundary:", "native lifecycle safe action boundary");
requireIncludes(mobileText, "accessibilityIdentifier(\"MobileCaptureLifecycleSafeActionRow\")", "native lifecycle safe action accessibility");
requireIncludes(mobileText, "Provider recording is not started by joining", "native provider action-packet boundary");
requireIncludes(mobileText, "Action packets", "native review digest action-packet section");
requireIncludes(mobileText, "readinessClient.readiness?.nativeCaptureContract ?? .production", "server native capture contract preferred");
requireIncludes(mobileText, "Production capture contract", "native capture contract title");
requireIncludes(mobileText, "SOURCE-SAFE", "native source-safe badge");
requireIncludes(mobileText, "if let primaryCallPath = contract.primaryCallPath", "native primary call path visible");
requireIncludes(mobileText, "if let fallbackCallImport = contract.fallbackCallImport", "native fallback import visible");
requireIncludes(mobileText, "accessibilityIdentifier(\"NativeCaptureContractPanel\")", "native capture contract accessibility");
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
  iPadText,
  "withAnimation(reduceMotion ? nil : .default)",
  "iPad recording focus has a non-animated reduced-motion path",
);
requireIncludes(bridgeText, "visibleRecordingIndicatorRequired", "readiness recording policy");
requireIncludes(bridgeText, "api/account/deletion-request", "native deletion request client");
requireIncludes(bridgeText, "prepareRoomJoin", "provider room join prep");
requireIncludes(bridgeText, "grantRecordingConsent", "consent grant client");
requireIncludes(bridgeText, "revokeRecordingConsent", "consent revoke client");

requireIncludes(deletionRouteText, "getQuipslySessionFromRequest", "authenticated account deletion request");
requireIncludes(deletionRouteText, "Deletion request recorded", "deletion request response");
requireIncludes(privacyPageText, "recorded only after an explicit user action and visible consent flow", "public privacy recording disclosure");
requireIncludes(deletionPageText, "account deletion", "public account deletion page");
requireIncludes(coachingPageText, "Reviewer-safe capture session preset loaded.", "reviewer capture preset status");
requireIncludes(coachingPageText, "reviewer-capture@dev.test", "reviewer capture preset email");
requireIncludes(coachingPageText, "Reviewer test capture session", "reviewer capture preset title");
requireIncludes(coachingPageText, "Create booking and capture room", "reviewer capture session creation action");
requireIncludes(coachingPageText, "It does not charge, invite, publish, or create an external calendar event.", "reviewer capture session side-effect boundary");
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
for (const filename of [
  "01-today.png",
  "02-record.png",
  "03-work.png",
  "04-library.png",
  "05-account.png",
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
requireIncludes(mobileText, "ReviewerDigestBoundaryCard", "native review digest read-only boundary card");
requireIncludes(mobileText, "Read-only reviewer packet", "native review digest labels refresh as read-only");
requireIncludes(mobileText, "does not join a room, start recording, charge, publish, schedule, invite, upload, or delete media", "native review digest no-side-effect boundary");

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
requireIncludes(mobileText, "CapturePostCaptureRunwayCard", "native post-capture runway card");
requireIncludes(mobileText, "Source evidence", "native post-capture source evidence step");
requireIncludes(mobileText, "Studio attachment", "native post-capture Studio attachment step");
requireIncludes(mobileText, "Attach to Studio does not publish", "native post-capture no-publication boundary");
requireIncludes(mobileText, "whole-source episode-editor meaning", "native post-capture whole-source editor boundary");
requireIncludes(mobileText, "media-vault proxy before collaborative editing", "native post-capture proxy readiness boundary");
requireIncludes(mobileText, "CaptureRunwayStep", "native post-capture runway steps");
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
requireIncludes(liveKitEgressHelperText, "MEDIA_VAULT_BUCKET_ENV_NAMES", "LiveKit egress uses shared media-vault bucket env list");
requireIncludes(liveKitEgressHelperText, "MEDIA_VAULT_PREFIXES.livekitRecording", "LiveKit egress uses shared livekit recording prefix");
requireIncludes(liveKitEgressHelperText, "LIVEKIT_EGRESS_ENABLED", "LiveKit egress has explicit operator enablement gate");
requireIncludes(liveKitEgressHelperText, "egressRequested && unsafeLocalOverride", "LiveKit egress requires a second local-only override");
requireIncludes(liveKitEgressHelperText, "LIVEKIT_EGRESS_UNSAFE_LOCAL_DEV", "LiveKit egress names the unsafe local-only override");
requireIncludes(liveKitEgressHelperText, "productionStartInterlock: !unsafeLocalOverride", "LiveKit egress exposes the production START interlock");
requireIncludes(liveKitEgressHelperText, "durableCommandLedgerImplemented: false", "LiveKit readiness admits the durable command ledger is not implemented");
requireIncludes(liveKitEgressHelperText, "LiveKit provider START is held by the production safety interlock", "LiveKit production START fails closed until durable reconciliation exists");
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
requireIncludes(coachingCalendarAdapterText, "Google Calendar is readable. No event was created, updated, deleted, or sent.", "calendar access check no mutation copy");
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
    "iPhone and iPad session surfaces show the capture runway",
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
