import { buildQuipslyCoachingLifecycle } from "@high-ground/quipsly-domain/coaching-lifecycle";
import {
  isTranscriptPacketSource,
  isUnreviewedTranscriptActionItemSource,
} from "@high-ground/quipsly-domain/coaching-packet";
import {
  readLastTranscriptMergedNoteSource,
  readTranscriptDerivedNoteSource,
} from "@high-ground/quipsly-domain/transcript-derived-task";
import {
  buildMobileCaptureConsentVersions,
  latestMobileCaptureConsentForParticipant,
  mobileCaptureAllPartiesReady,
  mobileCaptureConsentHasCurrentPolicyEvidence,
} from "./mobile-capture-consent-readiness.js";
import { mobileCaptureProcessingGateFromEvidence } from "./mobile-capture-processing-policy.js";
import { recordingContentReadiness } from "./mobile-capture-content-readiness";
import {
  addCaptureGroupAlignmentOffsets,
  buildCaptureSourceAlignmentProposal,
} from "./capture-source-alignment";
import { mobileSessionScheduledTimezone } from "./mobile-capture-session-schedule";

const MOBILE_CAPTURE_ACTION_PACKET_KIND = "quipsly-capture-action-packet-v1";
const DELIBERATE_SESSION_NOTE_KINDS = new Set([
  "SESSION_NOTE",
  "FOLLOW_UP",
  "DECISION",
  "PRODUCTION",
]);

function label(value: unknown) {
  return typeof value === "string" ? value : null;
}

export function canonicalMobileSessionProject(room: any) {
  const projectId = label(room?.project?.id) || label(room?.projectId);
  const canonicalSlug = label(room?.project?.slug);
  const legacySlug = label(room?.projectSlug) || label(room?.nestSlug);
  if (projectId && canonicalSlug) {
    return {
      projectId,
      projectSlug: canonicalSlug,
      projectName: label(room?.project?.name),
      bindingSource: "canonical-session-project",
      legacySlugDrift: Boolean(legacySlug && legacySlug !== canonicalSlug),
    };
  }
  return {
    projectId: null,
    projectSlug: legacySlug,
    projectName: null,
    bindingSource: legacySlug ? "legacy-session-slug" : "unfiled-session",
    legacySlugDrift: false,
  };
}

export function canonicalMobileSessionEpisodeSlug(room: any) {
  if (label(room?.episodeProductionId)) {
    const projectId = label(room?.project?.id) || label(room?.projectId);
    const episodeProjectId = label(room?.episodeProduction?.projectId);
    const episodeSlug = label(room?.episodeProduction?.slug);
    return label(room?.purpose)?.toUpperCase() === "PODCAST" &&
      projectId &&
      episodeProjectId === projectId &&
      episodeSlug
      ? episodeSlug
      : room?.id;
  }
  const metadata = sourceJson(room?.metadataJson);
  return (
    label(metadata.episodeSlug) ||
    label(room?.booking?.offering?.slug) ||
    room?.id
  );
}

export function canonicalMobileSessionProductionId(room: any) {
  const productionId = label(room?.episodeProductionId);
  const relatedProductionId = label(room?.episodeProduction?.id);
  return productionId && relatedProductionId === productionId
    ? productionId
    : null;
}

export function releasedClientFollowUpForUser(room: any, userId: string) {
  const booking = room?.booking;
  return (
    (Array.isArray(room?.outputs) ? room.outputs : []).find(
      (output: any) =>
        output?.kind === "CLIENT_FOLLOW_UP" &&
        output?.status === "RELEASED" &&
        (output.recipientUserId === userId ||
          output.createdByUserId === userId ||
          booking?.coachUserId === userId),
    ) || null
  );
}

function consentNextAction(status: string | null | undefined) {
  if (status === "GRANTED") return "Ready for consented capture.";
  if (status === "DECLINED")
    return "Consent declined. Do not record this session.";
  if (status === "REVOKED")
    return "Consent revoked. Stop or avoid recording until consent is granted again.";
  return "Save your recorder attestation and collect consent from every signed-in participant before recording.";
}

export function registeredParticipantConsentSummary(room: any) {
  const participants = Array.isArray(room?.participants)
    ? room.participants.filter(
        (participant: any) =>
          participant?.role !== "OBSERVER" && Boolean(participant?.userId),
      )
    : [];
  const consents = Array.isArray(room?.recordingConsents)
    ? room.recordingConsents
    : [];
  const versions = buildMobileCaptureConsentVersions({
    participants,
    consents,
  });
  const audioGrantedCount = versions.filter(
    (consent: any) =>
      consent.status === "GRANTED" &&
      consent.canRecordAudio &&
      Boolean(consent.consentedAt) &&
      !consent.revokedAt &&
      mobileCaptureConsentHasCurrentPolicyEvidence(consent),
  ).length;
  const videoGrantedCount = versions.filter(
    (consent: any) =>
      consent.status === "GRANTED" &&
      consent.canRecordVideo &&
      Boolean(consent.consentedAt) &&
      !consent.revokedAt &&
      mobileCaptureConsentHasCurrentPolicyEvidence(consent),
  ).length;

  return {
    requiredCount: participants.length,
    audioGrantedCount,
    videoGrantedCount,
    allAudioGranted: mobileCaptureAllPartiesReady(versions, "audio"),
    allVideoGranted: mobileCaptureAllPartiesReady(versions, "video"),
  };
}

export function providerReadinessForMobileCaptureSession(
  room: any,
  env: NodeJS.ProcessEnv = process.env,
) {
  const provider = label(room.provider)?.toLowerCase() || "planned";
  const providerRoomId = label(room.providerRoomId);
  const hasLiveKitConfig = Boolean(
    env.LIVEKIT_URL && env.LIVEKIT_API_KEY && env.LIVEKIT_API_SECRET,
  );

  if (provider === "livekit" && providerRoomId && hasLiveKitConfig) {
    return {
      providerRoomId,
      providerCanJoin: true,
      providerReadiness: "livekit-ready",
      providerNextAction:
        "Prepare the call room to mint a short-lived LiveKit join token. Joining alone does not start recording.",
    };
  }

  if (provider === "livekit" && providerRoomId) {
    return {
      providerRoomId,
      providerCanJoin: false,
      providerReadiness: "livekit-needs-config",
      providerNextAction:
        "LiveKit is selected, but server credentials are not configured yet. Use local capture fallback.",
    };
  }

  if (provider === "livekit") {
    return {
      providerRoomId: null,
      providerCanJoin: false,
      providerReadiness: "livekit-needs-room-id",
      providerNextAction:
        "LiveKit is selected, but the provider room ID is missing. Ask the team to prepare the room again.",
    };
  }

  return {
    providerRoomId,
    providerCanJoin: false,
    providerReadiness: "local-fallback",
    providerNextAction:
      "This session is ready for local recording fallback. Team can prepare LiveKit from the coaching runway.",
  };
}

function sourceJson(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function mobilePacketReviewLanes(summary: any) {
  const saved = sourceJson(summary?.sourceJson).reviewLanes;
  if (!Array.isArray(saved)) return [];
  return saved.flatMap((value) => {
    const lane = sourceJson(value);
    const id = label(lane.id)?.trim();
    if (!id) return [];
    const humanReview = sourceJson(lane.humanReview);
    const reviewedStatus = label(humanReview.status);
    return [
      {
        id,
        label: label(lane.label),
        status: label(lane.status),
        itemCount: Number.isFinite(Number(lane.itemCount))
          ? Math.max(0, Math.floor(Number(lane.itemCount)))
          : 0,
        meaning: label(lane.meaning),
        sourceTruth: label(lane.sourceTruth),
        reviewRule: label(lane.reviewRule),
        humanApprovalRequired: lane.humanApprovalRequired === true,
        externalSideEffects: lane.externalSideEffects === true,
        humanReview: reviewedStatus
          ? {
              status: reviewedStatus,
              note: label(humanReview.note),
              reviewedAt: label(humanReview.reviewedAt),
              reviewedByUserId: label(humanReview.reviewedByUserId),
              externalSideEffects: humanReview.externalSideEffects === true,
              deliveryClaimed: humanReview.deliveryClaimed === true,
              publicationClaimed: humanReview.publicationClaimed === true,
            }
          : null,
      },
    ];
  });
}

function isProviderRecordingReceiptSlot(asset: any) {
  const manifest = sourceJson(asset?.localManifestJson);
  return (
    asset?.kind === "SERVER_MIX" &&
    manifest.source === "provider-recording-receipt-slot"
  );
}

function receiptsForRecordingAsset(receipts: any[], recordingAssetId: string) {
  return receipts.filter(
    (receipt: any) => receipt?.recordingAssetId === recordingAssetId,
  );
}

function iso(value: unknown) {
  return value && typeof (value as any).toISOString === "function"
    ? (value as any).toISOString()
    : label(value);
}

export function captureSourceSummaries(
  room: any,
  receipts: any[],
  mediaAssets: any[],
) {
  const mediaById = new Map(mediaAssets.map((asset: any) => [asset.id, asset]));
  const sources = (
    Array.isArray(room?.recordingAssets) ? room.recordingAssets : []
  )
    .filter((asset: any) => !isProviderRecordingReceiptSlot(asset))
    .map((asset: any) => {
      const receipt =
        receiptsForRecordingAsset(receipts, asset.id).sort(
          (left: any, right: any) =>
            String(right.updatedAt || right.createdAt).localeCompare(
              String(left.updatedAt || left.createdAt),
            ),
        )[0] || null;
      const manifest = sourceJson(asset.localManifestJson);
      const promotion = sourceJson(manifest.promotion);
      const mediaAssetId =
        label(receipt?.mediaAssetId) || label(promotion.mediaAssetId);
      const media = mediaAssetId ? (mediaById.get(mediaAssetId) as any) : null;
      const sourceProfile = sourceJson(manifest.reportedSourceProfile);
      const transcriptJob = Array.isArray(asset.transcriptJobs)
        ? asset.transcriptJobs[0] || null
        : null;
      const kind = label(asset.kind)?.toUpperCase() || "UNKNOWN";
      const contentType = label(asset.contentType)?.toLowerCase() || "";
      const isVideo =
        kind.includes("VIDEO") || contentType.startsWith("video/");
      const variants = Array.isArray(media?.variants) ? media.variants : [];
      const proxyAssets = Array.isArray(media?.proxyAssets)
        ? media.proxyAssets
        : [];
      const proxyReady =
        proxyAssets.length > 0 ||
        variants.some((variant: any) =>
          label(variant.kind)?.toLowerCase().includes("proxy"),
        );
      const proxyJob = (
        Array.isArray(media?.workflowJobs) ? media.workflowJobs : []
      ).find((job: any) => label(job.type)?.toLowerCase().includes("proxy"));
      const proxyStatus = !isVideo
        ? "not-required"
        : proxyReady
          ? "ready"
          : label(proxyJob?.status)?.toLowerCase() || "queued";
      const exactBytesVerified =
        manifest.exactBytesVerified === true &&
        Boolean(receipt?.uploadSessionId);
      const captureGroupId =
        label(manifest.captureGroupId) || label(receipt?.captureId);
      const startReceiptId = label(receipt?.startReceiptId);
      const startReceipt =
        (Array.isArray(room?.stateReceipts) ? room.stateReceipts : []).find(
          (candidate: any) => label(candidate?.receiptId) === startReceiptId,
        ) || null;
      const alignment = buildCaptureSourceAlignmentProposal({
        sourceProfile,
        callRoomId: label(room?.id) || "",
        captureId: label(receipt?.captureId) || "",
        captureGroupId,
        actorUserId:
          label(receipt?.actorUserId) || label(startReceipt?.actorUserId) || "",
        startReceiptId,
        recordedStartedAt: asset.recordedStartedAt,
        startReceipt,
      });

      return {
        recordingAssetId: asset.id,
        uploadSessionId: label(receipt?.uploadSessionId),
        captureId: label(receipt?.captureId),
        captureGroupId,
        fileName: label(asset.fileName) || "Unnamed capture source",
        kind,
        contentType: label(asset.contentType),
        byteSize: asset.byteSize == null ? null : String(asset.byteSize),
        durationSeconds: asset.durationSeconds ?? null,
        recordedStartedAt: iso(asset.recordedStartedAt),
        recordedStoppedAt: iso(asset.recordedStoppedAt),
        recordingStatus: label(asset.status) || "UNKNOWN",
        exactBytesVerified,
        byteVerificationKind:
          label(manifest.byteVerificationKind) ||
          (exactBytesVerified ? "server-size-and-sha256" : "unverified"),
        processingDisposition:
          label(receipt?.processingDisposition) ||
          label(manifest.processingDisposition) ||
          "HELD",
        transcriptDisposition:
          label(receipt?.transcriptDisposition) ||
          label(manifest.transcriptionDisposition) ||
          "HELD",
        sourceId: label(receipt?.sourceId) || label(promotion.sourceId),
        mediaAssetId,
        playbackUrl: label(media?.url) || label(promotion.playbackUrl),
        sourceProfile,
        alignment,
        proxy: {
          required: isVideo,
          status: proxyStatus,
          playbackUrl: proxyReady
            ? label(proxyAssets[0]?.url) ||
              label(
                variants.find((variant: any) =>
                  label(variant.kind)?.toLowerCase().includes("proxy"),
                )?.url,
              )
            : null,
          sourceOriginalPreserved: true,
        },
        transcript: transcriptJob
          ? {
              id: transcriptJob.id,
              status: transcriptJob.status,
              provider: transcriptJob.provider,
              segmentCount: transcriptJob._count?.segments ?? 0,
              wordCount: transcriptJob._count?.words ?? 0,
              providerReceiptReady: Boolean(
                transcriptJob.providerRequestId &&
                transcriptJob.providerResponseObject,
              ),
              handoffUrl:
                transcriptJob.status === "COMPLETED"
                  ? `/api/mobile/capture/transcripts/handoff?callRoomId=${encodeURIComponent(room.id)}&transcriptJobId=${encodeURIComponent(transcriptJob.id)}`
                  : null,
              updatedAt: iso(transcriptJob.updatedAt),
            }
          : null,
      };
    });
  return addCaptureGroupAlignmentOffsets(sources).sort(
    (left: any, right: any) =>
      String(right.recordedStartedAt || "").localeCompare(
        String(left.recordedStartedAt || ""),
      ),
  );
}

export function captureGroupStudioHandoff(captureSources: any[]) {
  const captureGroupId = label(captureSources[0]?.captureGroupId);
  const sources = captureGroupId
    ? captureSources.filter(
        (source: any) => label(source.captureGroupId) === captureGroupId,
      )
    : [];
  const requiredSources = sources.filter(
    (source: any) => label(source.kind)?.toUpperCase() !== "SERVER_MIX",
  );
  const providerWitnesses = sources.filter(
    (source: any) => label(source.kind)?.toUpperCase() === "SERVER_MIX",
  );
  const verifiedSourceCount = sources.filter(
    (source: any) =>
      source.exactBytesVerified === true &&
      label(source.recordingStatus)?.toUpperCase() === "VERIFIED" &&
      label(source.processingDisposition)?.toUpperCase() === "RELEASED",
  ).length;
  const promotedSourceCount = sources.filter((source: any) =>
    Boolean(label(source.mediaAssetId)),
  ).length;
  const verifiedRequiredSourceCount = requiredSources.filter(
    (source: any) =>
      source.exactBytesVerified === true &&
      label(source.recordingStatus)?.toUpperCase() === "VERIFIED" &&
      label(source.processingDisposition)?.toUpperCase() === "RELEASED",
  ).length;
  const promotedRequiredSourceCount = requiredSources.filter((source: any) =>
    Boolean(label(source.mediaAssetId)),
  ).length;
  const readyProviderWitnesses = providerWitnesses.filter(
    (source: any) =>
      source.exactBytesVerified === true &&
      label(source.recordingStatus)?.toUpperCase() === "VERIFIED" &&
      label(source.processingDisposition)?.toUpperCase() === "RELEASED",
  );

  return {
    captureGroupId: captureGroupId || null,
    sourceCount: sources.length,
    requiredSourceCount: requiredSources.length,
    providerWitnessCount: providerWitnesses.length,
    verifiedSourceCount,
    verifiedRequiredSourceCount,
    promotedSourceCount,
    promotedRequiredSourceCount,
    ready:
      requiredSources.length > 0 &&
      verifiedRequiredSourceCount === requiredSources.length,
    complete:
      requiredSources.length > 0 &&
      promotedRequiredSourceCount === requiredSources.length &&
      readyProviderWitnesses.every((source: any) =>
        Boolean(label(source.mediaAssetId)),
      ),
    sourceSetRequired: true,
    sources,
  };
}

function captureProcessingGate(
  room: any,
  asset: any,
  receipts: any[],
  transcript: boolean,
) {
  if (!asset) {
    return {
      allowed: false as const,
      errorCode: "CAPTURE_RECORDING_ASSET_REQUIRED",
      error: "Capture processing requires recording asset evidence.",
    };
  }
  return mobileCaptureProcessingGateFromEvidence({
    recordingAsset: asset,
    receipts: receiptsForRecordingAsset(receipts, asset.id),
    room,
    transcript,
  });
}

function transcribableRecordingAssets(room: any, receipts: any[]) {
  return Array.isArray(room?.recordingAssets)
    ? room.recordingAssets.filter(
        (asset: any) =>
          !isProviderRecordingReceiptSlot(asset) &&
          captureProcessingGate(room, asset, receipts, true).allowed,
      )
    : [];
}

function providerRecordingReceiptSlot(room: any) {
  return Array.isArray(room?.recordingAssets)
    ? room.recordingAssets.find((asset: any) =>
        isProviderRecordingReceiptSlot(asset),
      ) || null
    : null;
}

function recordingPromotion(asset: any) {
  const manifest = sourceJson(asset?.localManifestJson);
  return sourceJson(manifest.promotion);
}

function previewText(value: unknown, maxLength = 180) {
  const normalized =
    typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 3)}...`;
}

function serverRecordingVerified(value: unknown) {
  if (isProviderRecordingReceiptSlot(value)) return false;
  const status = label(sourceJson(value).status)?.toUpperCase() || "";
  return ["VERIFIED", "TRANSCRIBED"].includes(status);
}

function calendarReceiptExists(booking: any) {
  const link = booking?.calendarLinks?.[0] || null;
  const status = label(link?.status)?.toUpperCase() || "";
  return Boolean(
    link?.externalEventId ||
    link?.providerEventId ||
    ["CREATED", "SYNCED", "UPDATED", "VERIFIED"].includes(status),
  );
}

function afterCaptureNextAction(input: {
  recordingCount: number;
  latestTranscriptStatus?: string | null;
  packetSummaryNoteId?: string | null;
  transcriptProcessingAllowed: boolean;
}) {
  if (!input.transcriptProcessingAllowed && input.recordingCount > 0) {
    return "Capture evidence is preserved. Await reviewed transcript release before running transcription or using packet projections.";
  }
  if (input.packetSummaryNoteId)
    return "Coaching packet exists. Review summary, highlights, and action items in Quipsly.";
  if (input.latestTranscriptStatus === "COMPLETED")
    return "Transcript is complete. Build a coaching packet when you are ready.";
  if (input.latestTranscriptStatus === "RUNNING")
    return "Transcript job is running. Refresh before building the packet.";
  if (
    input.latestTranscriptStatus === "QUEUED" ||
    input.latestTranscriptStatus === "HELD" ||
    input.latestTranscriptStatus === "FAILED"
  ) {
    return "Recording is uploaded. Run or retry transcription before packet review.";
  }
  if (input.recordingCount > 0)
    return "Recording exists. Run transcription; Quipsly will create or repair the transcript job if needed.";
  return "Record with consent first. Quipsly will keep the local capture, upload it, transcribe it, then build a review packet.";
}

function captureReadinessForMobileSession(input: {
  room: any;
  consentStatus?: string | null;
  consentGranted: boolean;
  allRegisteredParticipantConsentGranted: boolean;
  provider: ReturnType<typeof providerReadinessForMobileCaptureSession>;
  recordingCount: number;
  latestTranscriptStatus?: string | null;
  packetSummaryNoteId?: string | null;
  afterCaptureNextAction: string;
}) {
  const roomStatus = label(input.room.status)?.toUpperCase() || "PLANNED";
  const bookingStatus =
    label(input.room.booking?.status)?.toUpperCase() || null;
  const paymentPolicy =
    label(input.room.booking?.paymentPolicy)?.toUpperCase() || null;
  const paymentStatus =
    label(input.room.booking?.paymentRecord?.status)?.toUpperCase() || null;
  const blockers: string[] = [];
  const evidence: string[] = [];

  if (bookingStatus) evidence.push(`booking:${bookingStatus.toLowerCase()}`);
  if (paymentPolicy)
    evidence.push(`payment-policy:${paymentPolicy.toLowerCase()}`);
  if (paymentStatus) evidence.push(`payment:${paymentStatus.toLowerCase()}`);
  if (input.consentStatus)
    evidence.push(`consent:${input.consentStatus.toLowerCase()}`);
  if (input.provider.providerReadiness)
    evidence.push(`provider:${input.provider.providerReadiness}`);
  if (input.latestTranscriptStatus)
    evidence.push(`transcript:${input.latestTranscriptStatus.toLowerCase()}`);

  const paidOneToOneNeedsEvidence =
    paymentPolicy === "PAID_ONE_TO_ONE" &&
    paymentStatus !== "PAID" &&
    bookingStatus === "HOLDING_PAYMENT";

  if (bookingStatus === "CANCELED") {
    blockers.push("booking-canceled");
    return {
      status: "blocked",
      label: "Canceled",
      tone: "blocked",
      safeToRecordLocally: false,
      providerCanJoin: false,
      detail:
        "This booking is canceled. Preserve the record, but do not capture.",
      nextAction:
        "Open the booking history or create a new confirmed booking before recording.",
      blockers,
      evidence,
    };
  }

  if (input.packetSummaryNoteId) {
    return {
      status: "review-ready",
      label: "Packet ready",
      tone: "complete",
      safeToRecordLocally: false,
      providerCanJoin: false,
      detail:
        "Recording, transcript, and coaching packet evidence are ready for review.",
      nextAction: input.afterCaptureNextAction,
      blockers,
      evidence,
    };
  }

  if (roomStatus === "ENDED") {
    return {
      status: "post-capture",
      label:
        input.latestTranscriptStatus === "COMPLETED"
          ? "Transcript ready"
          : "After capture",
      tone:
        input.latestTranscriptStatus === "COMPLETED" ? "ready" : "attention",
      safeToRecordLocally: false,
      providerCanJoin: false,
      detail:
        "The room is ended. Continue with transcript repair or packet building instead of recording.",
      nextAction: input.afterCaptureNextAction,
      blockers,
      evidence,
    };
  }

  if (!input.consentGranted) {
    blockers.push("recording-consent-needed");
    return {
      status: "needs-consent",
      label: "Consent needed",
      tone: "attention",
      safeToRecordLocally: false,
      providerCanJoin: false,
      detail:
        "Recording stays locked until explicit participant consent is granted.",
      nextAction: consentNextAction(input.consentStatus),
      blockers,
      evidence,
    };
  }

  if (!input.allRegisteredParticipantConsentGranted) {
    blockers.push("registered-participant-consent-needed");
    return {
      status: "needs-participant-consent",
      label: "Participant consent needed",
      tone: "attention",
      safeToRecordLocally: false,
      providerCanJoin: false,
      detail:
        "Every signed-in, non-observer participant must save their own consent before this room is marked ready.",
      nextAction:
        "Ask each signed-in participant to save consent. In-person people who may be heard must also be covered by the recorder attestation.",
      blockers,
      evidence,
    };
  }

  if (paidOneToOneNeedsEvidence) {
    blockers.push("payment-evidence-needed");
    return {
      status: "payment-hold",
      label: "Payment hold",
      tone: "attention",
      safeToRecordLocally: false,
      providerCanJoin: false,
      detail:
        "This paid one-to-one booking is waiting on payment evidence before confirmed capture.",
      nextAction:
        "Keep Stripe as evidence. Do not record this paid session until the booking is confirmed or a human explicitly changes the policy.",
      blockers,
      evidence,
    };
  }

  if (!["PLANNED", "OPEN", "RECORDING"].includes(roomStatus)) {
    blockers.push("room-not-open");
    return {
      status: "not-open",
      label: "Room not open",
      tone: "attention",
      safeToRecordLocally: false,
      providerCanJoin: false,
      detail: "The session is not in a recordable room state.",
      nextAction:
        "Open or prepare the room from the coaching runway before capture.",
      blockers,
      evidence,
    };
  }

  if (input.provider.providerCanJoin) {
    return {
      status: "ready-provider",
      label: "Ready to join",
      tone: "ready",
      safeToRecordLocally: true,
      providerCanJoin: true,
      detail:
        "Consent is granted and the provider room is join-ready. Keep local recording fallback visible.",
      nextAction: input.provider.providerNextAction,
      blockers,
      evidence,
    };
  }

  return {
    status: "ready-local-fallback",
    label: "Ready locally",
    tone:
      input.provider.providerReadiness === "local-fallback"
        ? "ready"
        : "fallback",
    safeToRecordLocally: true,
    providerCanJoin: false,
    detail:
      "Consent is granted. Local capture can proceed even though the provider room is not join-ready.",
    nextAction: input.provider.providerNextAction,
    blockers,
    evidence,
  };
}

function mobileSessionJourneySummary(input: {
  room: any;
  participant: any;
  recordingConsentGranted: boolean;
  provider: ReturnType<typeof providerReadinessForMobileCaptureSession>;
  captureReadiness: ReturnType<typeof captureReadinessForMobileSession>;
  recordingCount: number;
  contentReadiness: ReturnType<typeof recordingContentReadiness>;
  latestTranscriptJob: any;
  latestTranscriptStatus?: string | null;
  packetSummaryNoteId?: string | null;
  afterCaptureNextAction: string;
  transcriptProcessingAllowed: boolean;
  transcriptHoldReasonCode?: string | null;
}) {
  const paymentPolicy =
    label(input.room.booking?.paymentPolicy)?.toUpperCase() || null;
  const paymentStatus =
    label(input.room.booking?.paymentRecord?.status)?.toUpperCase() || null;
  const paymentRequired = paymentPolicy === "PAID_ONE_TO_ONE";
  const paymentResolved = !paymentRequired || paymentStatus === "PAID";

  let stage = input.captureReadiness.status || "prepare-session";
  if (!input.transcriptProcessingAllowed && input.recordingCount > 0) {
    stage = "transcript-held";
  } else if (input.packetSummaryNoteId) {
    stage = "packet-ready";
  } else if (input.latestTranscriptStatus === "COMPLETED") {
    stage = "packet-needed";
  } else if (input.latestTranscriptStatus) {
    stage = `transcript-${String(input.latestTranscriptStatus).toLowerCase()}`;
  } else if (input.recordingCount > 0) {
    stage = "transcription-needed";
  } else if (input.captureReadiness.safeToRecordLocally) {
    stage = input.provider.providerCanJoin
      ? "ready-provider-room"
      : "ready-local-fallback";
  } else if (!input.recordingConsentGranted) {
    stage = "consent-needed";
  } else if (!paymentResolved) {
    stage = "payment-needed";
  }

  return {
    stage,
    paymentStage: paymentResolved ? "payment-resolved" : "payment-needed",
    providerStage: input.provider.providerReadiness || "provider-unknown",
    packetStage:
      !input.transcriptProcessingAllowed && input.recordingCount > 0
        ? "transcript-held"
        : input.packetSummaryNoteId
          ? "packet-ready"
          : input.latestTranscriptStatus === "COMPLETED"
            ? "packet-needed"
            : "not-ready",
    evidence: {
      appOwnedRoom: Boolean(input.room.id),
      participantLinked: Boolean(input.participant?.id),
      bookingAttached: Boolean(input.room.booking?.id),
      paymentRequired,
      paymentResolved,
      consentGranted: input.recordingConsentGranted,
      providerJoinReady: input.provider.providerCanJoin === true,
      localFallbackReady: input.captureReadiness.safeToRecordLocally === true,
      recordingEvidence: input.recordingCount > 0,
      capturePlumbingEvidence: input.contentReadiness.captureAssetCount > 0,
      substantialRecordingEvidence:
        input.contentReadiness.status === "substantial",
      transcriptEvidence: Boolean(input.latestTranscriptJob?.id),
      transcriptCompleted:
        input.transcriptProcessingAllowed &&
        input.latestTranscriptStatus === "COMPLETED",
      transcriptProcessingAllowed: input.transcriptProcessingAllowed,
      packetEvidence: Boolean(input.packetSummaryNoteId),
    },
    blockers: uniqueText([
      input.captureReadiness.blockers || [],
      input.contentReadiness.captureAssetCount > 0 &&
      input.contentReadiness.status !== "substantial"
        ? ["substantial-recording-evidence-needed"]
        : [],
      input.transcriptProcessingAllowed
        ? []
        : [
            `transcript-processing-held:${input.transcriptHoldReasonCode || "reviewed-release-required"}`,
          ],
    ]),
    nextAction:
      !input.transcriptProcessingAllowed && input.recordingCount > 0
        ? input.afterCaptureNextAction
        : input.captureReadiness.nextAction || input.afterCaptureNextAction,
  };
}

function uniqueText(values: unknown[]) {
  return [
    ...new Set(
      values
        .flatMap((value) => {
          if (Array.isArray(value)) return value;
          return [value];
        })
        .map((value) => (typeof value === "string" ? value.trim() : ""))
        .filter(Boolean),
    ),
  ];
}

function lifecycleBlockers(lifecycle: any) {
  return Array.isArray(lifecycle?.checks)
    ? lifecycle.checks.flatMap((check: any) => {
        const status = label(check?.status)?.toLowerCase() || "";
        const id = label(check?.id) || "";
        return id && ["missing", "attention"].includes(status)
          ? [`${id}:${status}`]
          : [];
      })
    : [];
}

function buildMobileCaptureActionPacket(input: {
  room: any;
  booking: any;
  provider: ReturnType<typeof providerReadinessForMobileCaptureSession>;
  captureReadiness: ReturnType<typeof captureReadinessForMobileSession>;
  journeySummary: ReturnType<typeof mobileSessionJourneySummary>;
  lifecycle: ReturnType<typeof buildQuipslyCoachingLifecycle>;
  recordingCount: number;
  latestTranscriptStatus?: string | null;
  latestRecordingAssetStatus?: string | null;
  latestRecordingPromotion?: Record<string, unknown> | null;
  captureGroupSourceCount: number;
  captureGroupVerifiedSourceCount: number;
  captureGroupPromotedSourceCount: number;
  packetSummaryNoteId?: string | null;
  providerRecordingReceiptSlotId?: string | null;
  mediaProcessingAllowed: boolean;
  transcriptProcessingAllowed: boolean;
  transcriptHoldReasonCode?: string | null;
}) {
  const latestTranscriptStatus =
    label(input.latestTranscriptStatus)?.toUpperCase() || null;
  const latestRecordingAssetStatus =
    label(input.latestRecordingAssetStatus)?.toUpperCase() || null;
  const latestRecordingPromotion = input.latestRecordingPromotion || {};
  const sessionProject = canonicalMobileSessionProject(input.room);
  const canJoin = input.captureReadiness.providerCanJoin === true;
  const canStartLocalRecording =
    input.captureReadiness.safeToRecordLocally === true;
  const canPrepareProviderRecordingReceipt =
    canJoin &&
    !input.providerRecordingReceiptSlotId &&
    input.lifecycle.readyForCapture === true;
  const hasCaptureGroupProjection = input.captureGroupSourceCount > 0;
  const canPromoteRecordingToMedia = hasCaptureGroupProjection
    ? input.captureGroupVerifiedSourceCount === input.captureGroupSourceCount &&
      input.captureGroupPromotedSourceCount < input.captureGroupSourceCount &&
      Boolean(sessionProject.projectSlug)
    : input.mediaProcessingAllowed &&
      input.recordingCount > 0 &&
      latestRecordingAssetStatus === "VERIFIED" &&
      Boolean(sessionProject.projectSlug) &&
      !label(latestRecordingPromotion.mediaAssetId);
  const canRunTranscript =
    input.transcriptProcessingAllowed &&
    input.recordingCount > 0 &&
    latestTranscriptStatus !== "RUNNING" &&
    latestTranscriptStatus !== "COMPLETED";
  const canBuildPacket =
    input.transcriptProcessingAllowed &&
    latestTranscriptStatus === "COMPLETED" &&
    !input.packetSummaryNoteId;
  const canReviewPacket =
    input.transcriptProcessingAllowed && Boolean(input.packetSummaryNoteId);
  const blockers = uniqueText([
    input.captureReadiness.blockers,
    input.journeySummary.blockers,
    lifecycleBlockers(input.lifecycle),
    input.recordingCount > 0 && !sessionProject.projectSlug
      ? ["studio-project-required"]
      : [],
    input.transcriptProcessingAllowed
      ? []
      : [
          `transcript-processing-held:${input.transcriptHoldReasonCode || "reviewed-release-required"}`,
        ],
  ]);

  return {
    packetKind: MOBILE_CAPTURE_ACTION_PACKET_KIND,
    roomId: input.room.id,
    bookingId: input.booking?.id ?? null,
    stage: input.journeySummary.stage || input.lifecycle.stage,
    capabilities: {
      canJoin,
      canStartLocalRecording,
      canStartProviderRecording: false,
      canPrepareProviderRecordingReceipt,
      canPromoteRecordingToMedia,
      canRunTranscript,
      canBuildPacket,
      canReviewPacket,
    },
    blockers,
    nextAction:
      input.lifecycle.nextAction ||
      input.journeySummary.nextAction ||
      input.captureReadiness.nextAction,
    boundaries: {
      stripeIsEvidenceOnly: true,
      externalProviderMutation: false,
      localRecordingFallbackAllowed: canStartLocalRecording,
      providerRecordingRequiresReceipt: true,
      recordingPromotionRequiresVerifiedEvidence: true,
      providerRecordingStartAvailable: false,
      noHiddenRecording: true,
      reviewOnlyUntilUserActs: true,
      captureGroupPromotionRequiresCompleteSourceSet: true,
    },
  };
}

export function mobileSessionCanControlRecording(input: {
  isStaff: boolean;
  userId: string;
  createdByUserId?: string | null;
  participantRole?: string | null;
  bookingCoachUserId?: string | null;
  projectId?: string | null;
  controlledProjectIds: ReadonlySet<string>;
}) {
  return (
    input.isStaff ||
    input.createdByUserId === input.userId ||
    ["HOST", "COACH", "PRODUCER"].includes(
      (label(input.participantRole) ?? "").toUpperCase(),
    ) ||
    input.bookingCoachUserId === input.userId ||
    (input.projectId != null && input.controlledProjectIds.has(input.projectId))
  );
}

export function mapMobileCaptureSessionsForUser(input: {
  rooms: any[];
  userId: string;
  isStaff?: boolean;
  productionNoteProjectIds?: string[];
  env?: NodeJS.ProcessEnv;
  finalizationReceipts?: any[];
  captureMediaAssets?: any[];
  priorContinuityByRoomId?: Record<string, unknown>;
  priorFollowThroughByRoomId?: Record<string, unknown>;
}) {
  const finalizationReceipts = Array.isArray(input.finalizationReceipts)
    ? input.finalizationReceipts
    : [];
  const captureMediaAssets = Array.isArray(input.captureMediaAssets)
    ? input.captureMediaAssets
    : [];
  const productionNoteProjectIds = new Set(
    input.productionNoteProjectIds || [],
  );
  return input.rooms.map((room: any) => {
    const sessionProject = canonicalMobileSessionProject(room);
    const participant =
      room.participants.find((item: any) => item.userId === input.userId) ||
      null;
    const consent = participant
      ? latestMobileCaptureConsentForParticipant(
          participant,
          room.recordingConsents,
        )
      : null;
    const booking = room.booking;
    const canControlRecording = mobileSessionCanControlRecording({
      isStaff: input.isStaff === true,
      userId: input.userId,
      createdByUserId: room.createdByUserId,
      participantRole: participant?.role,
      bookingCoachUserId: booking?.coachUserId,
      projectId: sessionProject.projectId,
      controlledProjectIds: productionNoteProjectIds,
    });
    const clientFollowUp = releasedClientFollowUpForUser(room, input.userId);
    const clientFollowUpBody = sourceJson(clientFollowUp?.bodyJson);
    const clientFollowUpArray = (key: string) =>
      Array.isArray(clientFollowUpBody[key]) ? clientFollowUpBody[key] : [];
    const latestCheckout =
      booking?.paymentRecord?.checkoutSessionLedgers?.[0] || null;
    const provider = providerReadinessForMobileCaptureSession(room, input.env);
    const latestTranscriptJob = room.transcriptJobs[0] || null;
    const receiptSlot = providerRecordingReceiptSlot(room);
    const allRecordingAssets = Array.isArray(room.recordingAssets)
      ? room.recordingAssets.filter(
          (asset: any) => !isProviderRecordingReceiptSlot(asset),
        )
      : [];
    const recordingAssetsForTranscript = transcribableRecordingAssets(
      room,
      finalizationReceipts,
    );
    const recordingCount = allRecordingAssets.length;
    const captureSources = captureSourceSummaries(
      room,
      finalizationReceipts,
      captureMediaAssets,
    );
    const studioHandoff = captureGroupStudioHandoff(captureSources);
    const contentReadiness = recordingContentReadiness(
      allRecordingAssets,
      room.purpose,
    );
    const latestTranscriptStatus = latestTranscriptJob?.status ?? null;
    const latestRecordingAsset =
      allRecordingAssets.find(
        (asset: any) => asset.id === latestTranscriptJob?.assetId,
      ) ||
      (latestTranscriptJob?.asset &&
      !isProviderRecordingReceiptSlot(latestTranscriptJob.asset)
        ? latestTranscriptJob.asset
        : (recordingAssetsForTranscript[0] ?? allRecordingAssets[0] ?? null));
    const mediaProcessingGate = captureProcessingGate(
      room,
      latestRecordingAsset,
      finalizationReceipts,
      false,
    );
    const transcriptProcessingGate = captureProcessingGate(
      room,
      latestRecordingAsset,
      finalizationReceipts,
      true,
    );
    const packetNotesForLatestTranscript = transcriptProcessingGate.allowed
      ? room.notes.filter((note: any) => {
          const source = sourceJson(note.sourceJson);
          return (
            isTranscriptPacketSource(source.source) &&
            source.transcriptJobId === latestTranscriptJob?.id
          );
        })
      : [];
    const packetSummary =
      packetNotesForLatestTranscript.find(
        (note: any) => note.kind === "SUMMARY",
      ) || null;
    const packetHighlights = packetNotesForLatestTranscript.filter(
      (note: any) => note.kind === "HIGHLIGHT",
    );
    const packetReviewLanes = mobilePacketReviewLanes(packetSummary);
    const sessionNotes = room.notes
      .filter((note: any) => DELIBERATE_SESSION_NOTE_KINDS.has(note.kind))
      .map((note: any) => {
        const source = sourceJson(note.sourceJson);
        const sourceAnchor = readTranscriptDerivedNoteSource(note.sourceJson);
        const origin = sourceAnchor
          ? "Transcript review"
          : source.schema === "quipsly-mobile-quick-entry-v1"
            ? "iPhone Capture"
            : source.schema === "quipsly-session-continuity-brief-v1"
              ? "Saved continuity"
              : source.origin === "nest-session-notes"
                ? "Nest Session note"
                : "Session record";
        return {
          id: note.id,
          title: note.title,
          body: note.body,
          kind: note.kind,
          visibility: note.visibility,
          authorLabel:
            note.authorUser?.name ||
            note.authorUser?.primaryEmail ||
            "Note author",
          isMine: note.authorUserId === input.userId,
          canEdit:
            note.authorUserId === input.userId && note.kind !== "FOLLOW_UP",
          origin,
          revisionCount: note._count?.revisions ?? 0,
          tags: (note.tagLinks || [])
            .map((link: any) => link.tag)
            .map((tag: any) => ({
              id: tag.id,
              slug: tag.slug,
              label: tag.label,
              isActive: tag.isActive,
            })),
          createdAt: note.createdAt?.toISOString?.() ?? null,
          updatedAt: note.updatedAt?.toISOString?.() ?? null,
          sourceAnchor: sourceAnchor?.roomId === room.id ? sourceAnchor : null,
          lastMergedSource: readLastTranscriptMergedNoteSource(note.sourceJson),
        };
      });
    const latestRecordingPromotion = mediaProcessingGate.allowed
      ? recordingPromotion(latestRecordingAsset)
      : {};
    const packetSummaryNoteId = packetSummary?.id ?? null;
    const newestPacketNote =
      [packetSummary, ...packetHighlights]
        .filter(Boolean)
        .sort(
          (left: any, right: any) =>
            new Date(right.createdAt).getTime() -
            new Date(left.createdAt).getTime(),
        )[0] || null;
    const committedPacketActions =
      transcriptProcessingGate.allowed && latestTranscriptJob
        ? room.actionItems.filter((item: any) => {
            const source = sourceJson(item.sourceJson);
            return (
              isTranscriptPacketSource(source.source) &&
              source.transcriptJobId === latestTranscriptJob.id &&
              !isUnreviewedTranscriptActionItemSource(source)
            );
          })
        : [];
    const firstOpenAction = committedPacketActions[0] || null;
    const afterCaptureLine = afterCaptureNextAction({
      recordingCount,
      latestTranscriptStatus,
      packetSummaryNoteId,
      transcriptProcessingAllowed: transcriptProcessingGate.allowed,
    });
    const actorConsentVersion = participant
      ? buildMobileCaptureConsentVersions({
          participants: [participant],
          consents: room.recordingConsents,
        })[0]
      : null;
    const recordingConsentGranted = actorConsentVersion
      ? mobileCaptureAllPartiesReady([actorConsentVersion], "audio")
      : false;
    const recordingConsentVideoGranted = actorConsentVersion
      ? mobileCaptureAllPartiesReady([actorConsentVersion], "video")
      : false;
    const participantConsent = registeredParticipantConsentSummary(room);
    const captureReadiness = captureReadinessForMobileSession({
      room,
      consentStatus: consent?.status,
      consentGranted: recordingConsentGranted,
      allRegisteredParticipantConsentGranted:
        participantConsent.allAudioGranted,
      provider,
      recordingCount,
      latestTranscriptStatus,
      packetSummaryNoteId,
      afterCaptureNextAction: afterCaptureLine,
    });
    const videoCaptureReadiness = captureReadinessForMobileSession({
      room,
      consentStatus: consent?.status,
      consentGranted: recordingConsentVideoGranted,
      allRegisteredParticipantConsentGranted:
        participantConsent.allVideoGranted,
      provider,
      recordingCount,
      latestTranscriptStatus,
      packetSummaryNoteId,
      afterCaptureNextAction: afterCaptureLine,
    });
    const journeySummary = mobileSessionJourneySummary({
      room,
      participant,
      recordingConsentGranted,
      provider,
      captureReadiness,
      recordingCount,
      contentReadiness,
      latestTranscriptJob,
      latestTranscriptStatus,
      packetSummaryNoteId,
      afterCaptureNextAction: afterCaptureLine,
      transcriptProcessingAllowed: transcriptProcessingGate.allowed,
      transcriptHoldReasonCode: transcriptProcessingGate.allowed
        ? null
        : transcriptProcessingGate.errorCode,
    });
    const lifecycle = buildQuipslyCoachingLifecycle({
      bookingExists: Boolean(booking?.id || room.id),
      paymentRequired:
        label(booking?.paymentPolicy)?.toUpperCase() === "PAID_ONE_TO_ONE",
      paymentResolved:
        label(booking?.paymentPolicy)?.toUpperCase() !== "PAID_ONE_TO_ONE" ||
        label(booking?.paymentRecord?.status)?.toUpperCase() === "PAID",
      calendarReceiptExists: calendarReceiptExists(booking),
      roomExists: Boolean(room.id),
      participantsAttached: room.participants.length > 0,
      consentGranted: recordingConsentGranted,
      providerReady: provider.providerCanJoin === true,
      localFallbackReady: captureReadiness.safeToRecordLocally === true,
      recordingExists: recordingCount > 0,
      serverRecordingVerified:
        mediaProcessingGate.allowed &&
        serverRecordingVerified(latestRecordingAsset),
      transcriptExists: Boolean(latestTranscriptJob?.id),
      transcriptCompleted:
        transcriptProcessingGate.allowed &&
        latestTranscriptStatus === "COMPLETED",
      packetExists: Boolean(packetSummaryNoteId),
      publicationReceiptExists: false,
      nextAction: transcriptProcessingGate.allowed
        ? captureReadiness.nextAction || afterCaptureLine
        : afterCaptureLine,
    });
    const actionPacket = buildMobileCaptureActionPacket({
      room,
      booking,
      provider,
      captureReadiness,
      journeySummary,
      lifecycle,
      recordingCount,
      latestTranscriptStatus,
      latestRecordingAssetStatus: latestRecordingAsset?.status ?? null,
      latestRecordingPromotion,
      captureGroupSourceCount: studioHandoff.sourceCount,
      captureGroupVerifiedSourceCount: studioHandoff.verifiedSourceCount,
      captureGroupPromotedSourceCount: studioHandoff.promotedSourceCount,
      packetSummaryNoteId,
      providerRecordingReceiptSlotId: receiptSlot?.id ?? null,
      mediaProcessingAllowed: mediaProcessingGate.allowed,
      transcriptProcessingAllowed: transcriptProcessingGate.allowed,
      transcriptHoldReasonCode: transcriptProcessingGate.allowed
        ? null
        : transcriptProcessingGate.errorCode,
    });

    return {
      captureGroupId: label(room.captureGroupId),
      id: room.id,
      callRoomId: room.id,
      title:
        label(room.title) ||
        booking?.offering?.title ||
        "Quipsly capture session",
      purpose: room.purpose,
      status: room.status,
      updatedAt: room.updatedAt?.toISOString?.() ?? null,
      provider: room.provider,
      providerRoomId: provider.providerRoomId,
      providerCanJoin: provider.providerCanJoin,
      providerReadiness: provider.providerReadiness,
      providerNextAction: provider.providerNextAction,
      projectId: sessionProject.projectId,
      projectSlug: sessionProject.projectSlug,
      projectName: sessionProject.projectName,
      availableTags: Array.isArray(room.project?.tags)
        ? room.project.tags.map((tag: any) => ({
            id: tag.id,
            slug: tag.slug,
            label: tag.label,
          }))
        : [],
      projectBindingSource: sessionProject.bindingSource,
      projectLegacySlugDrift: sessionProject.legacySlugDrift,
      episodeSlug: canonicalMobileSessionEpisodeSlug(room),
      episodeProductionId: canonicalMobileSessionProductionId(room),
      coachingEngagementId:
        label(room.coachingEngagementId) || label(room.coachingEngagement?.id),
      coachingEngagementTitle: label(room.coachingEngagement?.title),
      coachingEngagementStatus: label(room.coachingEngagement?.status),
      scheduledStart: room.scheduledStart?.toISOString?.() ?? null,
      scheduledEnd: room.scheduledEnd?.toISOString?.() ?? null,
      scheduledTimezone: mobileSessionScheduledTimezone(
        room.metadataJson,
        booking?.timezone,
      ),
      canSchedule:
        room.status === "PLANNED" &&
        !room.bookingId &&
        (input.isStaff === true ||
          room.createdByUserId === input.userId ||
          (sessionProject.projectId != null &&
            productionNoteProjectIds.has(sessionProject.projectId))),
      participantId: participant?.id ?? null,
      canControlRecording,
      recordingConsentId: consent?.id ?? null,
      recordingConsentStatus: consent?.status ?? "not-created",
      recordingConsentGranted,
      recordingConsentCanRecordAudio:
        actorConsentVersion?.canRecordAudio === true,
      recordingConsentCanRecordVideo:
        actorConsentVersion?.canRecordVideo === true,
      recordingConsentCanTranscribe:
        actorConsentVersion?.canTranscribe === true,
      recordingConsentVideoGranted,
      canRecordNow: captureReadiness.safeToRecordLocally,
      canRecordAudioNow: captureReadiness.safeToRecordLocally,
      canRecordVideoNow: videoCaptureReadiness.safeToRecordLocally,
      consentRequiredParticipantCount: participantConsent.requiredCount,
      consentGrantedParticipantCount: participantConsent.audioGrantedCount,
      allRegisteredParticipantConsentGranted:
        participantConsent.allAudioGranted,
      videoConsentGrantedParticipantCount: participantConsent.videoGrantedCount,
      allRegisteredParticipantVideoConsentGranted:
        participantConsent.allVideoGranted,
      captureReadiness,
      videoCaptureReadiness,
      contentReadiness,
      journeySummary,
      lifecycle,
      actionPacket,
      clientLabel:
        booking?.clientUser?.name || booking?.clientUser?.primaryEmail || null,
      coachLabel:
        booking?.coachUser?.name || booking?.coachUser?.primaryEmail || null,
      offeringTitle: booking?.offering?.title || null,
      bookingStatus: booking?.status || null,
      paymentPolicy: booking?.paymentPolicy || null,
      paymentRequired:
        label(booking?.paymentPolicy)?.toUpperCase() === "PAID_ONE_TO_ONE",
      paymentResolved:
        label(booking?.paymentPolicy)?.toUpperCase() !== "PAID_ONE_TO_ONE" ||
        label(booking?.paymentRecord?.status)?.toUpperCase() === "PAID",
      paymentStatus: booking?.paymentRecord?.status || null,
      amountCents:
        booking?.paymentRecord?.amountCents ||
        booking?.offering?.priceCents ||
        null,
      currency:
        booking?.paymentRecord?.currency ||
        booking?.offering?.currency ||
        "USD",
      latestCheckoutUrl: latestCheckout?.url || null,
      latestCheckoutStatus: latestCheckout?.status || null,
      latestCheckoutExpiresAt:
        latestCheckout?.expiresAt?.toISOString?.() ?? null,
      calendarStatus: booking?.calendarLinks?.[0]?.status || null,
      recordingCount,
      captureSources,
      studioHandoff: {
        captureGroupId: studioHandoff.captureGroupId,
        sourceCount: studioHandoff.sourceCount,
        requiredSourceCount: studioHandoff.requiredSourceCount,
        providerWitnessCount: studioHandoff.providerWitnessCount,
        verifiedSourceCount: studioHandoff.verifiedSourceCount,
        verifiedRequiredSourceCount: studioHandoff.verifiedRequiredSourceCount,
        promotedSourceCount: studioHandoff.promotedSourceCount,
        promotedRequiredSourceCount: studioHandoff.promotedRequiredSourceCount,
        ready: studioHandoff.ready,
        complete: studioHandoff.complete,
        sourceSetRequired: studioHandoff.sourceSetRequired,
      },
      providerRecordingReceiptSlotId: receiptSlot?.id ?? null,
      providerRecordingReceiptStatus: receiptSlot?.status ?? null,
      providerRecordingReceiptNextAction: receiptSlot
        ? "Provider recording receipt slot exists. Attach verified provider media before transcription."
        : null,
      transcriptJobCount: room.transcriptJobs.length,
      latestRecordingAssetId: latestRecordingAsset?.id ?? null,
      latestRecordingAssetStatus: latestRecordingAsset?.status ?? null,
      latestRecordingFileName: latestRecordingAsset?.fileName ?? null,
      latestRecordingMediaAssetId: label(latestRecordingPromotion.mediaAssetId),
      latestRecordingPlaybackUrl: label(latestRecordingPromotion.playbackUrl),
      latestRecordingPromotionStatus:
        label(latestRecordingPromotion.status) ||
        (latestRecordingAsset?.status === "VERIFIED"
          ? "ready-to-promote"
          : null),
      latestTranscriptJobId: latestTranscriptJob?.id ?? null,
      latestTranscriptStatus,
      latestTranscriptProvider: latestTranscriptJob?.provider ?? null,
      latestTranscriptSegmentCount: latestTranscriptJob?._count?.segments ?? 0,
      coachingPacketSummaryNoteId: packetSummaryNoteId,
      coachingPacketTitle: packetSummary?.title ?? null,
      coachingPacketPreview: previewText(packetSummary?.body),
      coachingPacketHighlightCount: packetHighlights.length,
      coachingPacketActionItemCount: packetSummary
        ? committedPacketActions.length
        : 0,
      coachingPacketLatestActivityAt:
        newestPacketNote?.createdAt?.toISOString?.() ?? null,
      coachingPacketFirstOpenActionItemId: firstOpenAction?.id ?? null,
      captureMediaProcessingAllowed: mediaProcessingGate.allowed,
      captureTranscriptProcessingAllowed: transcriptProcessingGate.allowed,
      captureProcessingHoldReasonCode: mediaProcessingGate.allowed
        ? null
        : mediaProcessingGate.errorCode,
      captureTranscriptHoldReasonCode: transcriptProcessingGate.allowed
        ? null
        : transcriptProcessingGate.errorCode,
      coachingPacketStatus: !transcriptProcessingGate.allowed
        ? "TRANSCRIPT_HELD"
        : packetSummaryNoteId
          ? "READY_FOR_REVIEW"
          : latestTranscriptStatus === "COMPLETED"
            ? "PACKET_READY_TO_BUILD"
            : "NOT_READY",
      coachingPacketReviewLanes: packetReviewLanes,
      clientFollowUp: clientFollowUp
        ? {
            id: clientFollowUp.id,
            status: clientFollowUp.status,
            title: clientFollowUp.title,
            intro: clientFollowUp.intro,
            nextSessionFocus: clientFollowUp.nextSessionFocus,
            contentSha256: clientFollowUp.contentSha256,
            revision: clientFollowUp.revision,
            releasedAt: clientFollowUp.releasedAt?.toISOString?.() ?? null,
            recipientLabel:
              clientFollowUp.recipient?.name ||
              clientFollowUp.recipient?.primaryEmail ||
              "Client",
            openedAt:
              clientFollowUp.deliveries?.[0]?.occurredAt?.toISOString?.() ??
              null,
            canAcknowledge: clientFollowUp.recipientUserId === input.userId,
            notes: clientFollowUpArray("notes"),
            goals: clientFollowUpArray("goals"),
            tasks: clientFollowUpArray("tasks"),
          }
        : null,
      priorContinuity: input.priorContinuityByRoomId?.[room.id] ?? null,
      priorFollowThrough: input.priorFollowThroughByRoomId?.[room.id] ?? null,
      canUseProjectTeamNotes:
        input.isStaff === true ||
        (sessionProject.projectId != null &&
          productionNoteProjectIds.has(sessionProject.projectId)),
      sessionNotes,
      afterCaptureNextAction: afterCaptureLine,
      nextAction:
        captureReadiness.nextAction ||
        (recordingConsentGranted
          ? provider.providerNextAction
          : consentNextAction(consent?.status)),
    };
  });
}
