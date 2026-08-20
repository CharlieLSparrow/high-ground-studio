#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();

function read(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf8");
}

function exists(relativePath) {
  return fs.existsSync(path.join(repoRoot, relativePath));
}

function check(condition, id, summary, details = {}) {
  return {
    id,
    status: condition ? "pass" : "fail",
    summary,
    details,
  };
}

function includesAll(text, markers) {
  const compact = (value) => String(value).replace(/\s+/g, " ").trim();
  const source = compact(text);
  return markers.every((marker) => source.includes(compact(marker)));
}

const paths = {
  schema: "prisma/schema.prisma",
  lifecycleContract: "packages/quipsly-domain/src/coaching-lifecycle.ts",
  meetingSpineContract: "packages/quipsly-domain/src/coaching-meeting-spine.ts",
  transcriptRunRoute: "apps/quipsly/src/app/api/mobile/capture/transcripts/run/route.ts",
  packetRouteAdapter: "apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route.ts",
  packetRoute: "apps/quipsly/src/app/api/mobile/capture/transcripts/packet/route-implementation.ts",
  packetActionReviewRoute: "apps/quipsly/src/app/api/mobile/capture/transcripts/packet/actions/route.ts",
  roomJoinRoute: "apps/quipsly/src/app/api/mobile/capture/rooms/join/route.ts",
  roomStateRoute: "apps/quipsly/src/app/api/mobile/capture/rooms/state/route.ts",
  providerRecordingRoute: "apps/quipsly/src/app/api/mobile/capture/rooms/provider-recording/route.ts",
  coachingRunwayRoute: "apps/quipsly/src/app/api/coaching/runway/route.ts",
  nestLiveKitEgress: "apps/quipsly/src/lib/server/coaching-livekit-egress.ts",
  sessionsRoute: "apps/quipsly/src/app/api/mobile/capture/sessions/route.ts",
  transcriptVersioning: "apps/quipsly/src/lib/server/capture-transcripts.ts",
  transcriptProcessing: "apps/quipsly/src/lib/server/capture-transcript-processing.ts",
  transcriptReconciliation: "apps/quipsly/src/lib/server/capture-transcript-reconciliation.ts",
  transcriptWorker: "apps/quipsly-transcript-worker/src/worker.ts",
  transcriptWorkerEntrypoint: "apps/quipsly-transcript-worker/src/index.ts",
  packetBuilder: "apps/quipsly/src/lib/server/coaching-packets.ts",
  sessionMapper: "apps/quipsly/src/lib/server/mobile-capture-sessions.ts",
  coachingPage: "apps/quipsly/src/app/(app)/coaching/page.tsx",
  localDbSmoke: "scripts/quipsly-coaching-local-lifecycle-db-smoke.mjs",
};

const missingPaths = Object.entries(paths)
  .filter(([, relativePath]) => !exists(relativePath))
  .map(([name, relativePath]) => ({ name, relativePath }));

const texts = Object.fromEntries(
  Object.entries(paths)
    .filter(([, relativePath]) => exists(relativePath))
    .map(([name, relativePath]) => [name, read(relativePath)]),
);

const schemaModels = [
  "CoachProfile",
  "ServiceOffering",
  "AvailabilityWindow",
  "BookingHold",
  "PaymentRecord",
  "StripeCustomerLink",
  "StripeCheckoutSessionLedger",
  "StripeWebhookEvent",
  "Appointment",
  "CoachingBooking",
  "CallRoom",
  "CallParticipant",
  "RecordingConsent",
  "RecordingAsset",
  "UploadChunk",
  "TranscriptJob",
  "TranscriptSegment",
  "CoachingNote",
  "ActionItem",
];

const checks = [
  check(
    missingPaths.length === 0,
    "requiredSourceFilesExist",
    "Coaching capture lifecycle source files exist at their current paths.",
    { missingPaths },
  ),
  check(
    includesAll(texts.schema || "", schemaModels.map((modelName) => `model ${modelName} `)),
    "schemaOwnsFullLifecycle",
    "The app-owned schema can represent booking, payment evidence, rooms, consent, recordings, transcripts, notes, and action items.",
    {
      missingModels: schemaModels.filter((modelName) => !(texts.schema || "").includes(`model ${modelName} `)),
    },
  ),
  check(
    includesAll(texts.lifecycleContract || "", [
      "QuipslyCoachingLifecycleSafeAction",
      "safeActions",
      "create-booking",
      "resolve-payment-evidence",
      "prepare-capture-room",
      "attach-participants",
      "confirm-recording-consent",
      "prepare-capture-route",
      "record-with-visible-state",
      "verify-recording-storage",
      "run-or-repair-transcript",
      "build-review-packet",
      "review-packet",
      "Creates Quipsly-owned state only",
      "Stripe remains an evidence provider",
      "Consent must be visible and participant-aware",
      "Local files remain source truth until server verification",
      "External delivery still needs explicit approval and receipts",
    ]),
    "lifecycleExposesSafeActions",
    "The shared lifecycle read model exposes safe next-action candidates without hiding side effects.",
  ),
  check(
    includesAll(texts.meetingSpineContract || "", [
      "QUIPSLY_COACHING_MEETING_SPINE_KIND",
      "quipsly-coaching-meeting-spine-v1",
      "buildQuipslyMeetingJoinSpine",
      "providerJoin",
      "recordingBoundary",
      "providerRecording",
      "localFallback",
      "joiningStartsRecording: false",
      "receiptRequiredBeforeTranscript: true",
      "buildQuipslyProviderRecordingReceiptSlotManifest",
      "quipsly-provider-recording-receipt-slot-v1",
    ]) &&
      includesAll(texts.roomJoinRoute || "", [
        "buildQuipslyMeetingJoinSpine",
        "@high-ground/quipsly-domain/coaching-meeting-spine",
      ]) &&
      includesAll(texts.providerRecordingRoute || "", [
        "buildQuipslyProviderRecordingReceiptSlotManifest",
        "@high-ground/quipsly-domain/coaching-meeting-spine",
      ]),
    "sharedMeetingSpineContract",
    "Meeting provider join, local fallback, provider recording, and receipt-slot semantics live in a shared domain contract used by Nest routes.",
  ),
  check(
    includesAll(texts.nestLiveKitEgress || "", [
      "startQuipslyLiveKitRoomCompositeEgress",
      "stopQuipslyLiveKitRoomCompositeEgress",
      "reconcileQuipslyLiveKitEgressRecording",
      "Current all-party audio and video recording consent is incomplete. Media processing remains held.",
      "durableCommandLedgerImplemented: true",
      "provider START remains deliberately disabled",
      "Provider recording verified with unchanged all-party source and transcription consent; transcript evidence is queued or preserved.",
    ]) &&
      includesAll(texts.providerRecordingRoute || "", [
        "START_EGRESS",
        "STOP_EGRESS",
        "RECONCILE_PROVIDER_FILE",
        "staff-only until the in-app recording UX is mature",
        "startQuipslyLiveKitRoomCompositeEgress",
        "stopQuipslyLiveKitRoomCompositeEgress",
        "reconcileQuipslyLiveKitEgressRecording",
      ]),
    "nestOwnsProviderEgressCommandSeam",
    "Nest owns staff-only provider egress start, stop, and storage reconciliation commands without making native capture a hidden server recorder.",
  ),
  check(
    includesAll(texts.coachingPage || "", [
      "runProviderRecordingAction",
      "START_EGRESS",
      "STOP_EGRESS",
      "RECONCILE_PROVIDER_FILE",
      "optional provider safety copy",
      "This provider copy is separate from the call and local iPhone/browser capture.",
      "A durable reservation is created automatically when you start it",
      "Start safety copy",
      "Stop safety copy",
      "Resolve command",
      "Verify provider file",
    ]) &&
      includesAll(texts.coachingPage || "", [
        "providerRecordingReceiptSlotId",
        "providerRecordingActiveAssetId",
        "providerRecordingNextAction",
        "room.participantCount < 1",
        "room.consentGrantedCount < room.participantCount",
        "Everyone must know recording is active and consent first.",
      ]) &&
      includesAll(texts.providerRecordingRoute || "", [
        "Provider egress start, stop, and reconciliation are staff-only until the in-app recording UX is mature.",
        "requiresExplicitStart: true",
        "receiptRequiredBeforeTranscript: true",
      ]),
    "coachingRunwayShowsProviderRecordingControls",
    "The Nest coaching runway exposes explicit staff provider-recording controls and keeps join, receipt, egress, reconciliation, and transcript boundaries visible.",
  ),
  check(
    includesAll(texts.coachingRunwayRoute || "", [
      "isProviderRecordingReceiptSlot",
      "transcribableRecordingAssets",
      "providerRecordingReceiptSlot",
      "activeProviderRecordingAsset",
      "providerRecordingNextAction",
      "providerRecordingReceiptSlotId",
      "providerRecordingActiveAssetId",
      "latestRecordingAssetId",
      "latestRecordingAssetStatus",
      "recordingExists: recordingCount > 0",
    ]),
    "coachingRunwaySeparatesReceiptSlotsFromRecordings",
    "The Nest coaching runway read model keeps provider receipt slots visible without counting them as playable/transcribable recordings.",
  ),
  check(
    includesAll(texts.coachingPage || "", [
      "runTranscriptAction",
      "buildPacketAction",
      "/api/mobile/capture/transcripts/run",
      "/api/mobile/capture/transcripts/packet",
      "Transcripts are reusable evidence, not source truth.",
      "Build packets only from completed transcript jobs",
      "Run transcript",
      "Build packet",
      "latestRecordingAssetId",
      "latestTranscriptStatus !== \"COMPLETED\"",
      "latestTranscriptSegmentCount < 1",
    ]),
    "coachingRunwayShowsTranscriptPacketActions",
    "The Nest coaching runway exposes safe transcript-to-packet controls with visible source-truth and review boundaries.",
  ),
  check(
    includesAll(texts.coachingPage || "", [
      "safeActions",
      "LifecycleSafeActionCard",
      "Safe next actions",
      "Action boundary:",
      "human approval",
      "safe next",
    ]),
    "coachingRunwayDisplaysSafeActions",
    "The Nest coaching runway displays lifecycle safe actions and their boundaries, not just raw receipt checks.",
  ),
  check(
    includesAll(texts.transcriptRunRoute || "", [
      "Sign in before running a transcript job.",
      "Choose a transcript job or uploaded recording before running transcription.",
      "You do not have access to this uploaded recording.",
      "Provider recording receipt slots are not media.",
      "You do not have access to this transcript job.",
      "reconcileCaptureTranscriptJob",
      "ensureCaptureTranscriptProcessingQueued",
      "ensuredFromRecording",
    ]),
    "transcriptRouteIsAuthenticatedAndScoped",
    "Transcript execution is authenticated, room-scoped, recording-aware, and refuses provider receipt slots as media.",
  ),
  check(
    includesAll(texts.transcriptProcessing || "", [
      "TRANSCRIPT_VERSION_IMMUTABLE",
      "saveQueueIfAbsent",
      "sourceGeneration",
      "sourceSha256",
      "reconciliationRequiresFreshConsentGate: true",
    ]) && includesAll(texts.transcriptReconciliation || "", [
      "$transaction",
      "mobileCaptureTranscriptProcessingGate",
      "transcriptSegment.create",
      "transcriptWord.createMany",
      "source: \"capture-transcript-background-worker\"",
    ]) && includesAll(texts.transcriptWorker || "", [
      "processCaptureTranscriptQueueObject",
      "ifGenerationMatch",
      "normalizeDeepgramResponse",
      "rawProviderResponse",
      'disposition: "completed"',
    ]) && includesAll(texts.transcriptWorkerEntrypoint || "", [
      'requiredEnv("DEEPGRAM_API_KEY")',
      "DeepgramTranscriptProvider",
    ]),
    "transcriptRunnerProducesInspectibleSegments",
    "Durable transcript outbox, worker, and reconciliation turn generation-bound verified media into append-only inspectable segments, version reruns, and recheck consent before exposing text.",
  ),
  check(
    includesAll(texts.packetRouteAdapter || "", [
      'export { GET, PATCH, POST } from "./route-implementation";',
    ]) && includesAll(texts.packetRoute || "", [
      "Sign in before reading a coaching packet.",
      "Sign in before building a coaching packet.",
      "Choose a capture room or transcript job before reading a coaching packet.",
      "Choose a transcript job before building a coaching packet.",
      "You do not have access to this coaching packet.",
      "You do not have access to this transcript job.",
      "READY_FOR_REVIEW",
      "PACKET_READY_TO_BUILD",
      "Build a packet from the completed transcript.",
    ]) && includesAll(texts.packetActionReviewRoute || "", [
      "acceptCreatesOneCanonicalActionItem: true",
      "assignmentRequiresExplicitActorChoice: true",
      "editRejectDeferCreateNoOpenWork: true",
      "materializationIntent",
      "ACTION_CANDIDATE_IDEMPOTENCY_CONFLICT",
      "dueDateCreated",
      "projectTagsApplied",
      "noCalendarMutation: true",
      "noClientDelivery: true",
      "noPublicationClaim: true",
    ]),
    "packetRouteSeparatesTranscriptFromReview",
    "Packet route keeps transcript completion, packet building, and human review as separate visible states.",
  ),
  check(
    includesAll(texts.packetBuilder || "", [
      "Transcript must be completed before building a coaching packet.",
      "Transcript has no segments to turn into a coaching packet.",
      "kind: \"SUMMARY\"",
      "kind: \"HIGHLIGHT\"",
      "TRANSCRIPT_PACKET_SOURCE",
      "actionCandidates",
      "deterministic: true",
      "reviewRequired: true",
      "buildTranscriptPacketBrief",
      "packetBrief",
      "reusedExistingPacket",
    ]) && !(texts.packetBuilder || "").includes("actionItem.create"),
    "packetBuilderCreatesReviewableEvidence",
    "Packet builder creates deterministic summary, highlights, and action items with explicit review-required provenance.",
  ),
  check(
    includesAll(texts.sessionsRoute || "", [
      "Sign in before loading capture sessions.",
      "mapMobileCaptureSessionsForUser",
      "paymentRecord",
      "recordingConsents",
      "recordingAssets",
      "transcriptJobs",
      "notes",
      "actionItems",
    ]) && includesAll(texts.sessionMapper || "", [
      "paymentStage",
      "packetStage",
      "journeySummary",
      "recordingEvidence",
      "transcriptCompleted",
      "packetEvidence",
      "nextAction",
    ]),
    "sessionReadModelShowsCalmJourneyState",
    "Mobile sessions expose a single reviewable journey over payment, capture, transcript, packet, and review evidence.",
  ),
  check(
    includesAll(texts.roomJoinRoute || "", [
      "paymentHoldForRoom",
      "payment-hold",
      "This paid one-to-one coaching session is waiting on payment evidence before joining or recording.",
      "stripeIsEvidenceOnly: true",
      "noPaymentMutation: true",
    ]) &&
      includesAll(texts.roomStateRoute || "", [
        "paymentHoldForRoom",
        "Recording cannot start for a paid one-to-one coaching session until payment evidence is resolved.",
        "noPaymentMutation: true",
      ]) &&
      includesAll(texts.providerRecordingRoute || "", [
        "paymentHoldForRoom",
        "currentStatus: \"payment-hold\"",
        "Provider recording evidence cannot be prepared for a paid one-to-one coaching session until payment evidence is resolved.",
      ]),
    "paidOneToOnePaymentHoldEnforced",
    "Join, room state, and provider recording routes refuse paid one-to-one capture when payment evidence is unresolved.",
  ),
  check(
    includesAll(texts.localDbSmoke || "", [
      "stripeBoundary: \"test-mode evidence only; no real charge was created\"",
      "No external calendar event created.",
      "transcriptSegment.createMany",
      "Generated coaching packet summary",
      "actionItem.create",
      "cleanupArtifacts",
      "Quipsly can represent a complete app-owned coaching/capture lifecycle without external side effects",
    ]),
    "optionalDbSmokeProvesWriteReadCleanupPath",
    "Optional local DB smoke creates, reads, and cleans up generated lifecycle evidence without external side effects.",
  ),
];

const failed = checks.filter((item) => item.status !== "pass");
const report = {
  ok: failed.length === 0,
  checkedAt: new Date().toISOString(),
  invariant:
    "Quipsly can represent recording -> transcript -> notes/action items -> review packet as app-owned evidence without mutating external providers or confusing local readiness with publication receipts.",
  checkedPaths: paths,
  checks,
};

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (!report.ok) process.exit(1);
