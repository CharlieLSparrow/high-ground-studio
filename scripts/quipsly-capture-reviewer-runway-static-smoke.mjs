#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function assertIncludes(text, needle, label) {
  if (!text.includes(needle)) {
    throw new Error(`${label} is missing required marker: ${needle}`);
  }
}

function assertNotIncludes(text, needle, label) {
  if (text.includes(needle)) {
    throw new Error(`${label} contains retired marker: ${needle}`);
  }
}

const paths = {
  adminPage: "apps/quipsly/src/app/(app)/admin/users/page.tsx",
  adminActions: "apps/quipsly/src/app/(app)/admin/users/actions.ts",
  coachingPage: "apps/quipsly/src/app/(app)/coaching/page.tsx",
  coacheeSessionsPage: "apps/quipsly/src/app/(app)/coaching/sessions/page.tsx",
  runwayRoute: "apps/quipsly/src/app/api/coaching/runway/route.ts",
  sessionsRoute: "apps/quipsly/src/app/api/mobile/capture/sessions/route.ts",
  reviewDigestRoute: "apps/quipsly/src/app/api/mobile/capture/review-digest/route.ts",
  reviewerSmoke: "scripts/quipsly-capture-reviewer-session-smoke.mjs",
  liveReviewerProof: "scripts/quipsly-capture-live-reviewer-proof.sh",
  consentRoomProof: "scripts/quipsly-capture-consent-room-live-proof.sh",
  nativeAuthSmoke: "scripts/quipsly-mobile-capture-native-auth-smoke.mjs",
  generatedCoachingSmoke: "scripts/quipsly-coaching-generated-auth-smoke.mjs",
  liveGeneratedCoachingSmoke: "scripts/quipsly-live-coaching-generated-auth-smoke.sh",
  reviewerChecklist: "docs/quipsly/ios-capture-reviewer-smoke-checklist.md",
  appStoreReadiness: "docs/quipsly/ios-capture-app-store-readiness.md",
};

const adminPage = read(paths.adminPage);
const adminActions = read(paths.adminActions);
const coachingPage = read(paths.coachingPage);
const coacheeSessionsPage = read(paths.coacheeSessionsPage);
const runwayRoute = read(paths.runwayRoute);
const sessionsRoute = read(paths.sessionsRoute);
const reviewDigestRoute = read(paths.reviewDigestRoute);
const reviewerSmoke = read(paths.reviewerSmoke);
const liveReviewerProof = read(paths.liveReviewerProof);
const consentRoomProof = read(paths.consentRoomProof);
const nativeAuthSmoke = read(paths.nativeAuthSmoke);
const generatedCoachingSmoke = read(paths.generatedCoachingSmoke);
const liveGeneratedCoachingSmoke = read(paths.liveGeneratedCoachingSmoke);
const reviewerChecklist = read(paths.reviewerChecklist);
const appStoreReadiness = read(paths.appStoreReadiness);

[
  "Capture reviewer setup",
  "reviewer-capture@dev.test",
  "Create capture reviewer login",
  "Firebase email/password",
  "free starter/Home Nest",
].forEach((marker) => assertIncludes(adminPage, marker, paths.adminPage));

[
  "upsertFirebasePasswordUser",
  "adminAuth.createUser",
  "adminAuth.updateUser",
  "emailVerified: true",
  "ensureQuipslyStarterStateForUser",
].forEach((marker) => assertIncludes(adminActions, marker, paths.adminActions));

[
  "Start here · finish coach setup",
  "Optional. Leave blank to start without a payment link.",
  "create-booking-room",
  "Create booking and capture room",
  "/coaching/sessions",
  "It does not charge, invite, publish, or create an external calendar event.",
].forEach((marker) => assertIncludes(coachingPage, marker, paths.coachingPage));

[
  "Reviewer-safe capture session preset loaded",
  "reviewer-capture@dev.test",
  "Reviewer test capture session",
].forEach((marker) => assertNotIncludes(coachingPage, marker, paths.coachingPage));

[
  "Your sessions",
  "Prepare, capture, transcribe, and follow through in one calm place.",
  "Podcast, coaching, interview, and internal sessions share one explicit chain",
  "/api/mobile/capture/sessions",
  "workspaceHref",
  "Open workspace",
  "Review consent",
  "?mode=prepare",
  "secure Stripe payment page",
  "Open Stripe",
  "Recording stays off until consent is clear.",
  "Follow-up notes appear after the session is captured and reviewed.",
].forEach((marker) => assertIncludes(coacheeSessionsPage, marker, paths.coacheeSessionsPage));

[
  "Set up your coach profile before changing coaching sessions from this runway.",
  "\"create-booking-room\"",
  "\"create-booking-hold\"",
  "actingCoachProfile",
  "recordingConsent.createMany",
  "consentText()",
  "status: \"REQUESTED\"",
  "externalCalendarCreated: false",
].forEach((marker) => assertIncludes(runwayRoute, marker, paths.runwayRoute));

[
  "getQuipslySessionFromRequest",
  "callRoom.findMany",
  "participants: { where: { accessStatus: \"ACTIVE\" } }",
  "recordingConsents: true",
  "checkoutSessionLedgers",
  "mapMobileCaptureSessionsForUser",
].forEach((marker) => assertIncludes(sessionsRoute, marker, paths.sessionsRoute));

[
  "quipsly-mobile-capture-review-digest-v1",
  "Sign in before loading the mobile capture review digest.",
  "blockers",
  "nextActions",
  "boundaries",
  "sideEffectFree",
].forEach((marker) => assertIncludes(reviewDigestRoute, marker, paths.reviewDigestRoute));

[
  "reviewerSetupRunbook",
  "firebaseAccountVerified",
  "reviewerHasVisibleCaptureSession",
  "reviewerExpectedRetainedSession",
  "QUIPSLY_CAPTURE_REVIEWER_EXPECT_SESSION_TITLE",
  "reviewerSessionHasParticipantBoundary",
  "reviewerSessionHasConsentBoundary",
  "reviewerSessionHasSafeRecordingBoundary",
  "reviewerConsentCurrentPolicyDiscovered",
  "CURRENT_CONSENT_PRESENTATION_REQUIRED",
  "reviewerConsentGrant",
  "allAudibleParticipantsNotifiedAndAgreed",
  "recordingChoicePresented",
  "transcriptionChoicePresented",
  "reviewerRoomJoinPrepared",
  "grant-consent",
  "inspect-room-join",
  "prepare-room-join",
  "participantTokenRedacted",
].forEach((marker) => assertIncludes(reviewerSmoke, marker, paths.reviewerSmoke));

[
  "quipsly-capture-reviewer-runway-static-smoke.mjs",
  "quipsly-capture-reviewer-session-smoke.mjs",
  "scripts/quipsly-store-capture-reviewer-password.sh",
  "security find-generic-password",
  "missing-keychain-credential",
  "passwordPrinted: false",
  "providerSecretsExposed: false",
  "QUIPSLY_CAPTURE_REVIEWER_CREATE_SESSION",
  "umask 077",
  "mktemp \"${OUTPUT_DIR}/.quipsly-capture-reviewer-proof.XXXXXX\"",
  "chmod 600 \"${PROOF_TEMP}\"",
  "mv -f \"${PROOF_TEMP}\" \"${OUTPUT_JSON}\"",
  "--password-keychain-service",
  "--create-session",
].forEach((marker) => assertIncludes(liveReviewerProof, marker, paths.liveReviewerProof));

[
  "quipsly-capture-reviewer-runway-static-smoke.mjs",
  "quipsly-capture-reviewer-session-smoke.mjs",
  "scripts/quipsly-store-capture-reviewer-password.sh",
  "security find-generic-password",
  "missing-keychain-credential",
  "passwordPrinted: false",
  "providerSecretsExposed: false",
  "QUIPSLY_CAPTURE_REVIEWER_CREATE_SESSION",
  "umask 077",
  "mktemp \"${OUTPUT_DIR}/.quipsly-capture-consent-room-proof.XXXXXX\"",
  "chmod 600 \"${PROOF_TEMP}\"",
  "mv -f \"${PROOF_TEMP}\" \"${OUTPUT_JSON}\"",
  "--grant-consent=1",
  "--inspect-room-join=1",
  "--prepare-room-join=1",
  "LiveKit token details were redacted",
].forEach((marker) => assertIncludes(consentRoomProof, marker, paths.consentRoomProof));

[
  "Firebase accepted reviewer/native email-password credentials",
  "/api/mac/session-check",
  "Native session-check exposes Home Nest/free-account onboarding evidence.",
].forEach((marker) => assertIncludes(nativeAuthSmoke, marker, paths.nativeAuthSmoke));

[
  "codex-coaching-coach-",
  "codex-coaching-client-",
  'testLane: "api-regression"',
  "humanAcceptanceSatisfied: false",
  "freshUserStartedWithoutStaffAccess",
  "selfServiceCoachSetupCompleted",
  "ordinaryCoachRunwayLoaded",
  "convertedRoomVisibleToClient",
  "coacheeSessionsRouteReachable",
  "requestedConsentVisible",
  "usableCaptureRouteVisible",
  "recordingHeldUntilConsent",
  "consentDeclineRecorded",
  "consentGrantRecorded",
  "localRecordingUnlockedAfterConsent",
  "include-stripe-checkout",
  "QUIPSLY_COACHING_SMOKE_CREATE_STRIPE_CHECKOUT",
  "paidBookingHeldForPayment",
  "paidSessionVisibleToClient",
  "paidSessionHeldUntilPayment",
  "stripeCheckoutSmokeRequested",
  "stripeCheckoutCreated",
  "paidBookingCheckoutVisible",
  "coacheeStripePaymentActionVisible",
  "Generated password, Firebase token, session cookie, database URL, and bearer token were not printed.",
].forEach((marker) => assertIncludes(generatedCoachingSmoke, marker, paths.generatedCoachingSmoke));

[
  "Running Quipsly live generated coaching + capture runway smoke",
  "cloud-sql-proxy",
  "QUIPSLY_COACHING_SMOKE_BASE_URL",
  "node scripts/quipsly-coaching-generated-auth-smoke.mjs --json",
].forEach((marker) => assertIncludes(liveGeneratedCoachingSmoke, marker, paths.liveGeneratedCoachingSmoke));

[
  "Capture reviewer setup",
  "Reviewer-safe capture session",
  "Create booking and capture room",
  "/api/mobile/capture/review-digest",
  "MobileCaptureReviewDigestPanel",
  "quipsly-capture-consent-room-live-proof.sh",
  "consent-to-room",
].forEach((marker) => assertIncludes(reviewerChecklist, marker, paths.reviewerChecklist));

[
  "Reviewer account and visible-session setup",
  "Capture reviewer setup",
  "Reviewer-safe capture session",
  "Create booking and capture room",
  "It does not charge, invite,",
  "publish, start recording, or create an external calendar event.",
  "quipsly-capture-consent-room-live-proof.sh",
  "LiveKit join token",
].forEach((marker) => assertIncludes(appStoreReadiness, marker, paths.appStoreReadiness));

[
  "auto-grant",
  "auto grant",
  "starts recording automatically",
].forEach((marker) => {
  assertNotIncludes(adminPage, marker, paths.adminPage);
  assertNotIncludes(coachingPage, marker, paths.coachingPage);
});

const setupSequence = [
  {
    step: "create-login",
    route: "/admin/users",
    card: "Capture reviewer setup",
    outcome: "Firebase email/password user plus app-owned Quipsly user, free tier, and Home Nest.",
  },
  {
    step: "create-visible-session",
    route: "/coaching",
    card: "Ordinary coach appointment form",
    action: "Create booking and capture room",
    outcome: "A coach enters the dedicated reviewer identity through the same booking, capture-room, participant, requested-consent, and calendar-receipt workflow used for a real client.",
  },
  {
    step: "prove-native-visibility",
    command: "bash scripts/quipsly-capture-live-reviewer-proof.sh",
    outcome: "Native reviewer account can see at least one app-owned capture session.",
  },
  {
    step: "prove-consent-room-readiness",
    command: "bash scripts/quipsly-capture-consent-room-live-proof.sh",
    outcome:
      "Native reviewer account can grant app-owned consent, inspect room readiness, and prepare a redacted short-lived LiveKit join token without starting recording or mutating external systems.",
  },
  {
    step: "prove-device-review",
    surface: "HighGroundCapture Session screen",
    outcome: "Capture runway plus MobileCaptureReviewDigestPanel show the same signed-in session truth.",
  },
];

process.stdout.write(JSON.stringify({
  ok: true,
  checked: paths,
  invariant:
    "Reviewer capture readiness uses a dedicated admin-only QA identity but the ordinary coaching Session workflow. Shipping coach/client UI must not contain reviewer presets. Setup must not charge, externally deliver an invitation, publish, create external calendar events, or start recording.",
  setupSequence,
}, null, 2));
process.stdout.write("\n");
