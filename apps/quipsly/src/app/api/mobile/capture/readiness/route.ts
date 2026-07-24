import { NextResponse } from "next/server";
import { QUIPSLY_NATIVE_CAPTURE_CONTRACT } from "@high-ground/quipsly-domain/coaching-public";

import { getQuipslySessionFromRequest } from "@/lib/server/quipsly-session";
import { getMediaVaultReadiness } from "@/lib/server/media-vault";
import { getCoachingCalendarReadiness } from "@/lib/server/coaching-google-calendar";
import { getQuipslyLiveKitEgressReadiness } from "@/lib/server/coaching-livekit-egress";
import { getMobileCaptureLocalVaultConfig } from "@/lib/server/mobile-capture-local-vault";

export const runtime = "nodejs";

function configured(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function baseUrl() {
  return (
    process.env.NEXT_PUBLIC_NEST_BASE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "https://nest.quipsly.com"
  ).replace(/\/+$/, "");
}

export async function GET(request: Request) {
  const session = await getQuipslySessionFromRequest(request);
  const root = baseUrl();
  const liveKitEgressReadiness = getQuipslyLiveKitEgressReadiness();
  const transcriptConfigured =
    configured(process.env.DEEPGRAM_API_KEY) ||
    configured(process.env.TRANSCRIPTION_PROVIDER_API_KEY);
  const stripeConfigured = configured(process.env["STRIPE_SECRET_KEY"]);
  const stripeLiveAllowed = process.env["QUIPSLY_ALLOW_LIVE_STRIPE"] === "true";
  const mediaVaultReadiness = getMediaVaultReadiness();
  const calendarReadiness = getCoachingCalendarReadiness();
  let developmentCaptureVaultConfigured = false;
  let developmentCaptureVaultConfigurationError: string | null = null;
  try {
    developmentCaptureVaultConfigured = Boolean(getMobileCaptureLocalVaultConfig());
  } catch (error) {
    developmentCaptureVaultConfigurationError = error instanceof Error
      ? error.message
      : "Local Capture vault configuration is invalid.";
  }
  const activeUploadBackend = developmentCaptureVaultConfigured
    ? "local-development"
    : mediaVaultReadiness.configured
      ? "gcs"
      : "unavailable";

  return NextResponse.json({
    ok: true,
    signedIn: Boolean(session?.user),
    user: session?.user
      ? {
          id: session.user.id,
          email: session.user.primaryEmail,
          name: session.user.name,
          isStaff: session.user.isStaff,
        }
      : null,
    policyUrls: {
      privacy: `${root}/privacy`,
      accountDeletion: `${root}/privacy/account-deletion`,
    },
    captureRoutes: {
      readiness: "/api/mobile/capture/readiness",
      coachingCalendarReadiness: "/api/coaching/calendar/readiness",
      sessions: "/api/mobile/capture/sessions",
      today: "/api/mobile/capture/today",
      work: "/api/mobile/capture/work",
      sessionContext: "/api/mobile/capture/sessions/context",
      consent: "/api/mobile/capture/consent",
      roomJoin: "/api/mobile/capture/rooms/join",
      roomJoinDiagnostics: "/api/mobile/capture/rooms/join/diagnostics",
      roomState: "/api/mobile/capture/rooms/state",
      providerRecording: "/api/mobile/capture/rooms/provider-recording",
      promoteRecording: "/api/mobile/capture/recordings/promote",
      transcriptRun: "/api/mobile/capture/transcripts/run",
      transcriptPacket: "/api/mobile/capture/transcripts/packet",
      uploadsResumable: "/api/mobile/capture/uploads/resumable",
      uploadsFinalize: "/api/mobile/capture/uploads/resumable/finalize",
      uploadsChunk: "/api/mobile/capture/uploads/chunk",
      uploadsChunkCompatibility: "/api/mobile/capture/uploads/chunk",
      reviewDigest: "/api/mobile/capture/review-digest",
    },
    mediaVaultRoutes: {
      readiness: "/api/media-vault/readiness",
      inventory: "/api/media-vault/inventory",
      episodeInventory: "/api/media-vault/episode-inventory",
      uploadPresigned: "/api/upload/presigned",
      registerProxy: "/api/media-vault/proxies/register",
      promoteRecording: "/api/mobile/capture/recordings/promote",
    },
    nativeCapture: QUIPSLY_NATIVE_CAPTURE_CONTRACT,
    recordingPolicy: {
      requiresExplicitConsent: true,
      defaultConsentMode: "all-party",
      visibleRecordingIndicatorRequired: true,
      consentStates: ["REQUESTED", "GRANTED", "DECLINED", "REVOKED"],
      localFallback: "iOS segmented local recording remains available when provider rooms are not ready.",
    },
    callArchitecture: {
      primaryPath: QUIPSLY_NATIVE_CAPTURE_CONTRACT.primaryCallPath,
      nativePresentation: QUIPSLY_NATIVE_CAPTURE_CONTRACT.nativeCallPresentation,
      fallbackImport: QUIPSLY_NATIVE_CAPTURE_CONTRACT.fallbackCallImport,
      phoneCallBoundary: QUIPSLY_NATIVE_CAPTURE_CONTRACT.phoneCallBoundary,
      pstnBridgeCandidate: QUIPSLY_NATIVE_CAPTURE_CONTRACT.pstnBridgeCandidate,
    },
    providerReadiness: {
      ...liveKitEgressReadiness,
      providerSecretsExposed: false,
      nativeSdkTruth:
        "Server token readiness is not the same as native room readiness. HighGroundCapture keeps the LiveKit SDK out of the default target until SwiftPM/XCFramework artifact acquisition is repeatable.",
      nativeSdkProbeCommand:
        "TIMEOUT_SECONDS=900 scripts/quipsly-livekit-swift-probe.sh && RUN_BUILD=1 TIMEOUT_SECONDS=900 scripts/quipsly-livekit-swift-probe.sh",
      defaultBuildPolicy:
        "The iOS app may show the provider-room and CallKit seam before the LiveKit SDK is installed, but it must clearly fall back to local consented recording.",
      nextAction: liveKitEgressReadiness.nextAction,
    },
    mediaVaultReadiness,
    recordingPromotionBoundary: {
      sourceOfTruth:
        "RecordingAsset stays as call-room evidence. Promotion creates reusable StudioMediaAsset and, when episodeSlug is known, attaches whole-source media into StudioEpisodeProduction.productionJson.importedMedia.",
      route: "/api/mobile/capture/recordings/promote",
      requiresVerifiedRecording: true,
      noOriginalMutation: true,
      proxyStillNeededForVideo: true,
      editorMeaning:
        "Podcast recordings attach to the editor as whole source media with roles like room-mix-audio, spine-audio-candidate, room-composite-video, participant-camera, reference-clip, or b-roll. The editor should use metadata decisions, not clipped source copies.",
    },
    sessionContextBoundary: {
      sourceOfTruth: "Quipsly CallRoom.metadataJson.captureSessionContext",
      localDraftAllowed: true,
      externalSideEffects: false,
      route: "/api/mobile/capture/sessions/context",
      meaning:
        "Capture notes, goals, and tasks may start as phone-local drafts, but shared room context is saved to Nest without touching calendar, Stripe, LiveKit, storage, or publishing providers.",
    },
    calendarReadiness,
    uploadAndTranscriptReadiness: {
      cloudStorageConfigured: mediaVaultReadiness.configured,
      developmentCaptureVaultConfigured,
      developmentCaptureVaultConfigurationError,
      activeUploadBackend,
      developmentCaptureVaultBoundary:
        "The local vault is a loopback-database, loopback-HTTP, OS-temporary development capability. It is fail-closed in production and never substitutes for production cloud-storage readiness.",
      canonicalUploadContract: "quipsly-mobile-capture-gcs-resumable-v2",
      mediaBytesTransitAppServer: false,
      serverSha256RequiredBeforeReceipt: true,
      transcriptConfigured,
      transcriptBoundary:
        "Transcript work should start only after upload or provider egress evidence is verified.",
    },
    paymentBoundary: {
      stripeConfigured,
      stripeLiveAllowed,
      coachingCustomerPortalEnabled: process.env["COACHING_CUSTOMER_PORTAL_ENABLED"] === "true",
      stripeMode: stripeConfigured
        ? stripeLiveAllowed
          ? "live-enabled"
          : "test-or-held"
        : "not-configured",
      stripeScope:
        "Stripe is scoped to eligible one-to-one coaching payment evidence. It is not the source of SaaS, course, group coaching, content library, or entitlement truth.",
      checkoutBoundary:
        "Checkout is only for eligible paid one-to-one real-time coaching. SaaS, courses, group coaching, content libraries, and subscriptions stay outside this Stripe path.",
      customerPortalBoundary:
        "Customer Portal requires existing Stripe customer evidence and does not create bookings, subscriptions, recordings, or entitlements.",
    },
    appStoreReadiness: {
      accountDeletionInitiation: "available-via-app-and-policy-route",
      privacyPolicyRoute: "available",
      microphonePurposeStringRequired: true,
      hiddenRecordingAllowed: false,
      testAccountNeeded: true,
      nativeProviderRoomUiReady: false,
      deviceValidationRequired: true,
    },
  });
}
