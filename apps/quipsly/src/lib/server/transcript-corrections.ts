import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { mobileCaptureProcessingGateFromEvidence } from "./mobile-capture-processing-policy.js";
import { acquirePrismaAdvisoryTransactionLock } from "./prisma-advisory-lock.js";
import { reconcileCaptureTranscriptJob } from "@/lib/server/capture-transcript-reconciliation";
import {
  buildAudioTranscriptEvidence,
  type AudioTranscriptEvidenceSegment,
} from "@/lib/transcript-evidence";
import {
  buildTranscriptCorrectionImpact,
  type TranscriptImpactArtifact,
} from "@/lib/transcript-correction-impact";

export const TRANSCRIPT_CORRECTION_SCHEMA = "quipsly-transcript-correction-v1";
export const TRANSCRIPT_SEGMENT_VERIFICATION_SCHEMA = "quipsly-transcript-segment-verification-v1";
export const TRANSCRIPT_SPEAKER_ATTRIBUTION_SCHEMA = "quipsly-transcript-speaker-attribution-v1";
export const TRANSCRIPT_CORRECTION_IMPACT_REVIEW_SCHEMA = "quipsly-transcript-correction-impact-review-v1";

type TranscriptImpactArtifactKind = "note" | "task" | "goal" | "follow-up";

export type TranscriptCorrectionActor = {
  id: string;
  email?: string | null;
  isStaff: boolean;
};

export class TranscriptCorrectionError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(
    message: string,
    status: number,
    code: string,
  ) {
    super(message);
    this.name = "TranscriptCorrectionError";
    this.status = status;
    this.code = code;
  }
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function object(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function nullableLabel(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function sha256(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function speakerProviderSnapshot(segments: any[], providerSpeakerLabel: string) {
  const evidence = segments
    .filter((segment) => nullableLabel(segment?.speakerLabel) === providerSpeakerLabel)
    .map((segment) => ({
      id: text(segment?.id),
      startSeconds: Number(segment?.startSeconds),
      endSeconds: Number(segment?.endSeconds),
      textSha256: sha256(typeof segment?.text === "string" ? segment.text : ""),
    }))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id));
  return {
    sha256: sha256(JSON.stringify({ providerSpeakerLabel, evidence })),
    evidence,
  };
}

function participantDisplayLabel(participant: any) {
  return text(participant?.displayName)
    || text(participant?.user?.name)
    || text(participant?.email)
    || text(participant?.user?.primaryEmail);
}

function publicSpeakerAttribution(attribution: any) {
  return {
    schema: TRANSCRIPT_SPEAKER_ATTRIBUTION_SCHEMA,
    id: attribution.id as string,
    providerSpeakerLabel: attribution.providerSpeakerLabel as string,
    participantId: attribution.participantId as string | null,
    participantUserId: attribution.participantUserIdSnapshot as string | null,
    attributedLabel: attribution.participantDisplaySnapshot as string,
    providerSnapshotSha256: attribution.providerSnapshotSha256 as string,
    sampleSegmentIds: Array.isArray(attribution.sampleSegmentIdsJson)
      ? attribution.sampleSegmentIdsJson.filter((value: unknown): value is string => typeof value === "string")
      : [],
    reviewedAt: attribution.reviewedAt instanceof Date
      ? attribution.reviewedAt.toISOString()
      : attribution.reviewedAt,
  };
}

function currentSpeakerAttribution(job: any, providerSpeakerLabel: unknown) {
  const label = nullableLabel(providerSpeakerLabel);
  if (!label) return null;
  const attribution = (Array.isArray(job?.speakerAttributions) ? job.speakerAttributions : [])
    .find((candidate: any) => candidate.providerSpeakerLabel === label) ?? null;
  if (!attribution?.participantId) return null;
  return attribution.providerSnapshotSha256 === speakerProviderSnapshot(job.segments ?? [], label).sha256
    ? attribution
    : null;
}

function speakerGroups(job: any) {
  const groups = new Map<string, any[]>();
  for (const segment of Array.isArray(job?.segments) ? job.segments : []) {
    const label = nullableLabel(segment?.speakerLabel);
    if (!label) continue;
    const existing = groups.get(label) ?? [];
    existing.push(segment);
    groups.set(label, existing);
  }
  return [...groups.entries()]
    .map(([providerSpeakerLabel, segments]) => {
      const attribution = currentSpeakerAttribution(job, providerSpeakerLabel);
      const staleAttribution = !attribution && (job.speakerAttributions ?? []).some(
        (candidate: any) => candidate.providerSpeakerLabel === providerSpeakerLabel,
      );
      return {
        providerSpeakerLabel,
        turnCount: segments.length,
        providerSnapshotSha256: speakerProviderSnapshot(job.segments ?? [], providerSpeakerLabel).sha256,
        attribution: attribution ? publicSpeakerAttribution(attribution) : null,
        staleAttribution,
        samples: segments
          .slice()
          .sort((left, right) => Number(left.startSeconds) - Number(right.startSeconds))
          .slice(0, 3)
          .map((segment) => ({
            segmentId: text(segment.id),
            startSeconds: Number(segment.startSeconds),
            endSeconds: Number(segment.endSeconds),
            text: text(segment.text),
          })),
      };
    })
    .sort((left, right) => left.providerSpeakerLabel.localeCompare(right.providerSpeakerLabel));
}

function accessibleRoomWhere(roomId: string, actor: TranscriptCorrectionActor) {
  if (actor.isStaff) return { id: roomId };
  const email = text(actor.email).toLowerCase();
  return {
    id: roomId,
    OR: [
      { createdByUserId: actor.id },
      { participants: { some: { userId: actor.id, accessStatus: "ACTIVE" } } },
      { booking: { clientUserId: actor.id } },
      { booking: { coachUserId: actor.id } },
      ...(email ? [{ project: { accessGrants: { some: { email, status: "ACTIVE" } } } }] : []),
    ],
  };
}

function playbackFromAsset(asset: any) {
  const promotion = object(object(asset?.localManifestJson).promotion);
  const sourceId = text(promotion.sourceId);
  const playbackUrl = text(promotion.playbackUrl);
  if (!sourceId || playbackUrl !== `/api/ingest/media/${sourceId}`) return null;
  return {
    sourceId,
    url: playbackUrl,
    kind: text(promotion.mediaKind) === "video" ? "video" as const : "audio" as const,
    recordingAssetId: asset.id as string,
    durationSeconds: typeof asset.durationSeconds === "number" ? asset.durationSeconds : null,
    label: text(asset.fileName) || "Session recording",
  };
}

async function spectralContextForPlayback(
  prisma: any,
  playback: ReturnType<typeof playbackFromAsset>,
  projectId: string | null,
) {
  if (
    !playback
    || !projectId
    || typeof prisma?.studioMediaAsset?.findFirst !== "function"
  ) return null;

  const mediaAsset = await prisma.studioMediaAsset.findFirst({
    where: {
      url: playback.url,
      assetAttachments: { some: { projectId } },
    },
    select: {
      id: true,
      assetAttachments: {
        where: { projectId },
        take: 1,
        select: { project: { select: { slug: true } } },
      },
    },
  });
  const projectSlug = text(mediaAsset?.assetAttachments?.[0]?.project?.slug);
  const assetId = text(mediaAsset?.id);
  if (!projectSlug || !assetId) return null;
  return {
    projectSlug,
    assetId,
    sourceId: playback.sourceId,
  };
}

function recordingForPlaybackPreparation(asset: any, gateAllowed: boolean) {
  if (!asset?.id) return null;
  return {
    id: asset.id as string,
    participantId: text(asset.participantId) || null,
    recordedStartedAt: asset.recordedStartedAt instanceof Date
      ? asset.recordedStartedAt.toISOString()
      : asset.recordedStartedAt ?? null,
    status: text(asset.status) || "UNKNOWN",
    kind: text(asset.kind) || "UNKNOWN",
    fileName: text(asset.fileName) || "Session recording",
    durationSeconds: typeof asset.durationSeconds === "number" ? asset.durationSeconds : null,
    eligibleForProtectedPlaybackPreparation:
      gateAllowed && text(asset.status).toUpperCase() === "VERIFIED",
  };
}

async function transcriptProcessingGate(prisma: any, recordingAsset: any) {
  const [receipts, room] = await Promise.all([
    prisma.mobileCaptureFinalizationReceipt.findMany({
      where: { recordingAssetId: recordingAsset.id },
      orderBy: { createdAt: "asc" },
    }),
    prisma.callRoom.findUnique({
      where: { id: recordingAsset.roomId },
      include: { participants: true, recordingConsents: true },
    }),
  ]);
  return mobileCaptureProcessingGateFromEvidence({
    recordingAsset,
    receipts,
    room,
    transcript: true,
  });
}

function correctionSnapshot(correction: any) {
  return {
    schema: TRANSCRIPT_CORRECTION_SCHEMA,
    correctionId: correction.id,
    roomId: correction.roomId,
    transcriptJobId: correction.transcriptJobId,
    segmentId: correction.segmentId,
    origin: correction.origin,
    status: correction.status,
    baseTextSha256: correction.baseTextSha256,
    expectedText: correction.expectedText,
    expectedSpeakerLabel: correction.expectedSpeakerLabel,
    startSecondsSnapshot: correction.startSecondsSnapshot,
    endSecondsSnapshot: correction.endSecondsSnapshot,
    correctedText: correction.correctedText,
    correctedSpeakerLabel: correction.correctedSpeakerLabel,
    reason: correction.reason,
    provenance: correction.provenanceJson,
    reviewedByUserId: correction.reviewedByUserId,
    reviewedAt: correction.reviewedAt instanceof Date
      ? correction.reviewedAt.toISOString()
      : correction.reviewedAt ?? null,
    reviewNote: correction.reviewNote,
    createdAt: correction.createdAt instanceof Date
      ? correction.createdAt.toISOString()
      : correction.createdAt,
    updatedAt: correction.updatedAt instanceof Date
      ? correction.updatedAt.toISOString()
      : correction.updatedAt,
  };
}

function publicCorrection(correction: any) {
  return {
    id: correction.id as string,
    segmentId: correction.segmentId as string,
    origin: correction.origin as "human" | "ai",
    status: correction.status as "proposed" | "accepted" | "rejected" | "superseded",
    correctedText: correction.correctedText as string | null,
    correctedSpeakerLabel: correction.correctedSpeakerLabel as string | null,
    reason: correction.reason as string | null,
    reviewedAt: correction.reviewedAt instanceof Date
      ? correction.reviewedAt.toISOString()
      : correction.reviewedAt ?? null,
    createdAt: correction.createdAt instanceof Date
      ? correction.createdAt.toISOString()
      : correction.createdAt,
    updatedAt: correction.updatedAt instanceof Date
      ? correction.updatedAt.toISOString()
      : correction.updatedAt,
    revisions: Array.isArray(correction.revisions)
      ? correction.revisions.map((revision: any) => ({
          revision: revision.revision,
          operation: revision.operation,
          createdAt: revision.createdAt instanceof Date ? revision.createdAt.toISOString() : revision.createdAt,
        }))
      : [],
  };
}

function publicVerification(verification: any) {
  return {
    id: verification.id as string,
    segmentId: verification.segmentId as string,
    reviewKind: verification.reviewKind as "confirmed-as-is",
    reviewedAt: verification.createdAt instanceof Date
      ? verification.createdAt.toISOString()
      : verification.createdAt,
  };
}

function proposalIdentity(correction: any) {
  return JSON.stringify([
    nullableLabel(correction.correctedSpeakerLabel),
    text(correction.correctedText),
    text(correction.reason),
  ]);
}

function visibleTranscriptProposals(corrections: any[]) {
  const decided = new Set(
    corrections
      .filter((correction) => correction.origin === "ai" && correction.status !== "proposed")
      .map(proposalIdentity),
  );
  const visible = new Set<string>();
  return corrections.filter((correction) => {
    if (correction.origin !== "ai" || correction.status !== "proposed") return false;
    const identity = proposalIdentity(correction);
    if (decided.has(identity) || visible.has(identity)) return false;
    visible.add(identity);
    return true;
  });
}

async function loadAccessibleRoom(
  prisma: any,
  roomId: string,
  actor: TranscriptCorrectionActor,
  recordingAssetId?: string | null,
) {
  const room = await prisma.callRoom.findFirst({
    where: accessibleRoomWhere(roomId, actor),
    select: {
      id: true,
      title: true,
      purpose: true,
      scheduledStart: true,
      projectId: true,
      participants: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          userId: true,
          displayName: true,
          email: true,
          role: true,
          user: { select: { name: true, primaryEmail: true } },
        },
      },
      notes: {
        where: {
          OR: [
            { authorUserId: actor.id },
            {
              visibility: {
                in: actor.isStaff
                  ? ["SESSION_SHARED", "CLIENT_SAFE", "PROJECT_TEAM"]
                  : ["SESSION_SHARED", "CLIENT_SAFE"],
              },
            },
          ],
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          kind: true,
          visibility: true,
          authorUserId: true,
          updatedAt: true,
          sourceJson: true,
          revisions: {
            where: { operation: "transcript-correction-impact-reviewed-no-content-change" },
            orderBy: { revision: "desc" },
            select: { snapshotJson: true },
          },
        },
      },
      actionItems: {
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          assignedUserId: true,
          updatedAt: true,
          sourceJson: true,
          evidenceReceipts: {
            orderBy: { occurredAt: "desc" },
            select: { evidenceJson: true },
          },
        },
      },
      goals: {
        where: { ownerUserId: actor.id },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          status: true,
          ownerUserId: true,
          updatedAt: true,
          sourceJson: true,
          progressReceipts: {
            orderBy: { occurredAt: "desc" },
            select: { evidenceJson: true },
          },
        },
      },
      outputs: {
        where: {
          OR: [
            { createdByUserId: actor.id },
            { recipientUserId: actor.id },
          ],
        },
        orderBy: { updatedAt: "desc" },
        select: {
          id: true,
          title: true,
          kind: true,
          status: true,
          createdByUserId: true,
          updatedAt: true,
          sourceManifestJson: true,
          revisions: {
            where: { operation: "transcript-correction-impact-reviewed-no-content-change" },
            orderBy: { revision: "desc" },
            select: { snapshotJson: true },
          },
        },
      },
      transcriptJobs: {
        ...(recordingAssetId ? { where: { assetId: recordingAssetId } } : {}),
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          provider: true,
          language: true,
          errorMessage: true,
          processingManifestObject: true,
          processingResultObject: true,
          sourceGeneration: true,
          sourceSha256: true,
          providerRequestId: true,
          providerResponseObject: true,
          workerBuildId: true,
          resultJson: true,
          _count: { select: { words: true } },
          speakerAttributions: {
            where: { status: "active" },
            orderBy: { updatedAt: "desc" },
            select: {
              id: true,
              providerSpeakerLabel: true,
              participantId: true,
              participantUserIdSnapshot: true,
              participantDisplaySnapshot: true,
              providerSnapshotSha256: true,
              sampleSegmentIdsJson: true,
              reviewedAt: true,
            },
          },
          asset: {
            select: {
              id: true,
              roomId: true,
              participantId: true,
              kind: true,
              status: true,
              fileName: true,
              durationSeconds: true,
              byteSize: true,
              checksum: true,
              recordedStartedAt: true,
              storageBucket: true,
              storageObjectPath: true,
              localManifestJson: true,
              segmentsJson: true,
            },
          },
          segments: {
            orderBy: { startSeconds: "asc" },
            select: {
              id: true,
              speakerLabel: true,
              startSeconds: true,
              endSeconds: true,
              text: true,
              confidence: true,
              words: {
                orderBy: { providerWordIndex: "asc" },
                select: {
                  id: true,
                  providerWordIndex: true,
                  startSeconds: true,
                  endSeconds: true,
                  word: true,
                  punctuatedWord: true,
                  confidence: true,
                  speakerLabel: true,
                  channel: true,
                },
              },
              corrections: {
                orderBy: { updatedAt: "desc" },
                select: {
                  id: true,
                  segmentId: true,
                  origin: true,
                  status: true,
                  correctedText: true,
                  correctedSpeakerLabel: true,
                  reason: true,
                  reviewedAt: true,
                  createdAt: true,
                  updatedAt: true,
                  revisions: {
                    orderBy: { revision: "asc" },
                    select: { revision: true, operation: true, createdAt: true },
                  },
                },
              },
              verifications: {
                orderBy: { createdAt: "desc" },
                take: 1,
                select: {
                  id: true,
                  segmentId: true,
                  reviewKind: true,
                  providerTextSha256: true,
                  providerSpeakerLabel: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      },
    },
  });
  if (!room) throw new TranscriptCorrectionError("Session not found or not accessible.", 404, "ROOM_NOT_FOUND");
  return room;
}

export async function readTranscriptCorrectionDesk(input: {
  prisma: any;
  roomId: string;
  actor: TranscriptCorrectionActor;
  recordingAssetId?: string | null;
}) {
  let room = await loadAccessibleRoom(input.prisma, input.roomId, input.actor, input.recordingAssetId);
  let job = room.transcriptJobs[0] ?? null;
  if (input.recordingAssetId && !job) {
    throw new TranscriptCorrectionError(
      "The selected recording has no accessible transcript in this Session.",
      404,
      "SOURCE_TRANSCRIPT_NOT_FOUND",
    );
  }
  if (
    job?.status === "RUNNING"
    && job.processingManifestObject
  ) {
    const reconciliation = await reconcileCaptureTranscriptJob({
      prisma: input.prisma,
      transcriptJobId: job.id,
    });
    if (reconciliation.status !== "pending") {
      room = await loadAccessibleRoom(input.prisma, input.roomId, input.actor, input.recordingAssetId);
      job = room.transcriptJobs[0] ?? null;
      if (input.recordingAssetId && !job) {
        throw new TranscriptCorrectionError(
          "The selected recording transcript changed during reconciliation. Refresh its exact-source evidence.",
          409,
          "SOURCE_TRANSCRIPT_CHANGED",
        );
      }
    }
  }
  if (!job?.asset) {
    return {
      ok: true,
      roomId: room.id,
      roomTitle: room.title ?? null,
      roomPurpose: room.purpose,
      scheduledStart: room.scheduledStart instanceof Date ? room.scheduledStart.toISOString() : room.scheduledStart ?? null,
      projectId: room.projectId ?? null,
      transcriptJobId: job?.id ?? null,
      transcriptStatus: job?.status ?? null,
      processing: transcriptProcessingSummary(job),
      gate: { allowed: false, error: "No recording-backed transcript is available." },
      recording: null,
      playback: null,
      spectralContext: null,
      evidence: buildTranscriptEvidence(job, [], []),
      participants: [],
      speakerGroups: [],
      segments: [],
      boundaries: transcriptCorrectionBoundaries(),
    };
  }

  const gate = await transcriptProcessingGate(input.prisma, job.asset);
  if (!gate.allowed) {
    return {
      ok: true,
      roomId: room.id,
      roomTitle: room.title ?? null,
      roomPurpose: room.purpose,
      scheduledStart: room.scheduledStart instanceof Date ? room.scheduledStart.toISOString() : room.scheduledStart ?? null,
      projectId: room.projectId ?? null,
      transcriptJobId: job.id,
      transcriptStatus: job.status,
      processing: transcriptProcessingSummary(job),
      gate,
      recording: recordingForPlaybackPreparation(job.asset, false),
      playback: null,
      spectralContext: null,
      evidence: buildTranscriptEvidence(job, [], []),
      participants: [],
      speakerGroups: [],
      segments: [],
      boundaries: transcriptCorrectionBoundaries(),
    };
  }

  const processing = transcriptProcessingSummary(job);
  const sourceParticipantLabel =
    processing?.routing?.sourceTopology === "participant-isolated" &&
    processing.routing.speakerAuthority === "source-binding"
      ? text(processing.routing.participantLabel) || null
      : null;
  const sourceBoundParticipantId = sourceParticipantLabel
    ? text(job.asset?.participantId) || null
    : null;
  const projectedSpeakerGroups = speakerGroups(job);
  const playback = playbackFromAsset(job.asset);
  const spectralContext = await spectralContextForPlayback(
    input.prisma,
    playback,
    room.projectId ?? null,
  );
  const projectedSegments = job.segments.map((segment: any) => {
    const accepted = segment.corrections.find((correction: any) => correction.status === "accepted") ?? null;
    const attribution = currentSpeakerAttribution(job, segment.speakerLabel);
    const acceptedVerification = !accepted
      && segment.verifications[0]?.providerTextSha256 === sha256(segment.text)
      && (segment.verifications[0]?.providerSpeakerLabel ?? null) === (segment.speakerLabel ?? null)
      ? segment.verifications[0]
      : null;
    const proposals = visibleTranscriptProposals(segment.corrections);
    const resolvedSpeakerAuthority = accepted?.correctedSpeakerLabel
      ? "correction"
      : attribution?.participantDisplaySnapshot
        ? "attribution"
        : sourceParticipantLabel
          ? "source-binding"
          : segment.speakerLabel
            ? "provider"
            : "unresolved";
    return {
      id: segment.id,
      speakerLabel: accepted?.correctedSpeakerLabel
        ?? attribution?.participantDisplaySnapshot
        ?? sourceParticipantLabel
        ?? segment.speakerLabel
        ?? null,
      providerSpeakerLabel: segment.speakerLabel ?? null,
      speakerAuthority: resolvedSpeakerAuthority,
      sourceBoundParticipantId,
      speakerAttribution: attribution ? publicSpeakerAttribution(attribution) : null,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      text: accepted?.correctedText ?? segment.text,
      providerText: segment.text,
      providerTextSha256: sha256(segment.text),
      confidence: segment.confidence ?? null,
      words: segment.words.map((word: any) => ({
        id: word.id,
        providerWordIndex: word.providerWordIndex,
        startSeconds: word.startSeconds,
        endSeconds: word.endSeconds,
        word: word.word,
        punctuatedWord: word.punctuatedWord,
        confidence: word.confidence ?? null,
        speakerLabel: word.speakerLabel ?? null,
        channel: word.channel ?? null,
      })),
      acceptedCorrection: accepted ? publicCorrection(accepted) : null,
      acceptedVerification: acceptedVerification ? publicVerification(acceptedVerification) : null,
      proposals: proposals.map(publicCorrection),
      correctionHistory: segment.corrections.map(publicCorrection),
    };
  });
  const impactsBySegment = buildTranscriptCorrectionImpact({
    transcriptJobId: job.id,
    segments: projectedSegments.map((segment: any) => ({
      id: segment.id,
      acceptedCorrectionId: segment.acceptedCorrection?.id ?? null,
      text: segment.text,
      speakerLabel: segment.speakerLabel,
    })),
    artifacts: roomTranscriptImpactArtifacts(room, input.actor),
  });
  const segmentsWithImpacts = projectedSegments.map((segment: any) => ({
    ...segment,
    downstreamImpacts: impactsBySegment.get(segment.id) ?? [],
  }));

  return {
    ok: true,
    roomId: room.id,
    roomTitle: room.title ?? null,
    roomPurpose: room.purpose,
    scheduledStart: room.scheduledStart instanceof Date ? room.scheduledStart.toISOString() : room.scheduledStart ?? null,
    projectId: room.projectId ?? null,
    transcriptJobId: job.id,
    transcriptStatus: job.status,
    processing,
    gate,
    recording: recordingForPlaybackPreparation(job.asset, true),
    sourceSha256: text(job.sourceSha256).toLowerCase() || null,
    playback,
    spectralContext,
    participants: (room.participants ?? []).map((participant: any) => ({
      id: participant.id as string,
      userId: participant.userId as string | null,
      displayLabel: participantDisplayLabel(participant) || "Unnamed participant",
      role: participant.role as string,
      isCurrentActor: participant.userId === input.actor.id,
    })),
    speakerGroups: projectedSpeakerGroups,
    segments: segmentsWithImpacts,
    evidence: buildTranscriptEvidence(job, projectedSegments, projectedSpeakerGroups),
    impactCoverage: {
      schema: "quipsly-transcript-correction-impact-coverage-v1",
      kinds: ["note", "task", "goal", "follow-up"],
      source: "canonical-provenance-projection",
      automaticRegeneration: false,
    },
    boundaries: transcriptCorrectionBoundaries(),
  };
}

export type TranscriptCorrectionImpactSummary = {
  available: boolean;
  held: boolean;
  transcriptJobId: string | null;
  counts: {
    needsReview: number;
    snapshotUnavailable: number;
    current: number;
    affectedArtifacts: number;
    ownerResolvable: number;
    textChanged: number;
    speakerChanged: number;
    receiptOnly: number;
  };
  items: Array<{
    segmentId: string;
    startSeconds: number;
    endSeconds: number;
    artifactId: string;
    artifactKind: "note" | "task" | "goal" | "follow-up";
    label: string;
    href: string;
    segmentHref: string;
    canAcknowledge: boolean;
    textChanged: boolean;
    speakerChanged: boolean;
    correctionReceiptChanged: boolean;
  }>;
};

function emptyTranscriptCorrectionImpactSummary(input?: {
  transcriptJobId?: string | null;
  held?: boolean;
}): TranscriptCorrectionImpactSummary {
  return {
    available: false,
    held: input?.held === true,
    transcriptJobId: input?.transcriptJobId ?? null,
    counts: {
      needsReview: 0,
      snapshotUnavailable: 0,
      current: 0,
      affectedArtifacts: 0,
      ownerResolvable: 0,
      textChanged: 0,
      speakerChanged: 0,
      receiptOnly: 0,
    },
    items: [],
  };
}

/**
 * Produces a bounded, read-only finishing projection for transcript corrections
 * whose older evidence is still referenced by canonical work. It deliberately
 * omits transcript text and private artifact content; the correction desk is
 * the authority-specific comparison and resolution surface.
 */
export async function readTranscriptCorrectionImpactSummary(input: {
  prisma: any;
  roomId: string;
  actor: TranscriptCorrectionActor;
}): Promise<TranscriptCorrectionImpactSummary> {
  const roomId = text(input.roomId);
  const room = await input.prisma.callRoom.findFirst({
    where: accessibleRoomWhere(roomId, input.actor),
    select: {
      id: true,
      notes: {
        where: {
          OR: [
            { authorUserId: input.actor.id },
            { visibility: { in: input.actor.isStaff ? ["SESSION_SHARED", "CLIENT_SAFE", "PROJECT_TEAM"] : ["SESSION_SHARED", "CLIENT_SAFE"] } },
          ],
        },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true, title: true, kind: true, visibility: true, authorUserId: true, updatedAt: true, sourceJson: true,
          revisions: {
            where: { operation: "transcript-correction-impact-reviewed-no-content-change" },
            orderBy: { revision: "desc" },
            take: 200,
            select: { snapshotJson: true },
          },
        },
      },
      actionItems: {
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true, title: true, status: true, assignedUserId: true, updatedAt: true, sourceJson: true,
          evidenceReceipts: { orderBy: { occurredAt: "desc" }, take: 200, select: { evidenceJson: true } },
        },
      },
      goals: {
        where: { ownerUserId: input.actor.id },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true, title: true, status: true, ownerUserId: true, updatedAt: true, sourceJson: true,
          progressReceipts: { orderBy: { occurredAt: "desc" }, take: 200, select: { evidenceJson: true } },
        },
      },
      outputs: {
        where: { OR: [{ createdByUserId: input.actor.id }, { recipientUserId: input.actor.id }] },
        orderBy: { updatedAt: "desc" },
        take: 200,
        select: {
          id: true, title: true, kind: true, status: true, createdByUserId: true, updatedAt: true, sourceManifestJson: true,
          revisions: {
            where: { operation: "transcript-correction-impact-reviewed-no-content-change" },
            orderBy: { revision: "desc" },
            take: 200,
            select: { snapshotJson: true },
          },
        },
      },
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          asset: {
            select: {
              id: true, roomId: true, kind: true, status: true, fileName: true, durationSeconds: true, byteSize: true,
              checksum: true, storageBucket: true, storageObjectPath: true, localManifestJson: true,
            },
          },
          speakerAttributions: {
            where: { status: "active" },
            orderBy: { updatedAt: "desc" },
            take: 200,
            select: { providerSpeakerLabel: true, participantDisplaySnapshot: true },
          },
          segments: {
            orderBy: { startSeconds: "asc" },
            take: 5_000,
            select: {
              id: true, speakerLabel: true, startSeconds: true, endSeconds: true, text: true,
              corrections: {
                where: { status: "accepted" },
                orderBy: { updatedAt: "desc" },
                take: 1,
                select: { id: true, correctedText: true, correctedSpeakerLabel: true },
              },
            },
          },
        },
      },
    },
  });
  if (!room) throw new TranscriptCorrectionError("Session not found or not accessible.", 404, "ROOM_NOT_FOUND");
  const job = Array.isArray(room.transcriptJobs) ? room.transcriptJobs[0] : null;
  if (!job?.id || job.status !== "COMPLETED" || !job.asset) {
    return emptyTranscriptCorrectionImpactSummary({ transcriptJobId: job?.id ?? null });
  }
  const gate = await transcriptProcessingGate(input.prisma, job.asset);
  if (!gate.allowed) {
    return emptyTranscriptCorrectionImpactSummary({ transcriptJobId: job.id, held: true });
  }
  const attributionByProviderLabel = new Map<string, string>();
  for (const attribution of Array.isArray(job.speakerAttributions) ? job.speakerAttributions : []) {
    const providerLabel = text(attribution.providerSpeakerLabel);
    const participantLabel = text(attribution.participantDisplaySnapshot);
    if (providerLabel && participantLabel && !attributionByProviderLabel.has(providerLabel)) {
      attributionByProviderLabel.set(providerLabel, participantLabel);
    }
  }
  const projectedSegments: Array<{
    id: string;
    acceptedCorrectionId: string | null;
    text: string;
    speakerLabel: string | null;
    startSeconds: number;
    endSeconds: number;
  }> = (Array.isArray(job.segments) ? job.segments : []).flatMap((segment: any) => {
    const accepted = Array.isArray(segment.corrections) ? segment.corrections[0] : null;
    const providerSpeakerLabel = text(segment.speakerLabel) || null;
    const startSeconds = Number(segment.startSeconds);
    const endSeconds = Number(segment.endSeconds);
    if (!text(segment.id) || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || endSeconds <= startSeconds) return [];
    return [{
      id: text(segment.id),
      acceptedCorrectionId: text(accepted?.id) || null,
      text: text(accepted?.correctedText) || text(segment.text),
      speakerLabel: text(accepted?.correctedSpeakerLabel)
        || (providerSpeakerLabel ? attributionByProviderLabel.get(providerSpeakerLabel) : null)
        || providerSpeakerLabel
        || null,
      startSeconds,
      endSeconds,
    }];
  });
  const artifacts = roomTranscriptImpactArtifacts(room, input.actor);
  const impactsBySegment = buildTranscriptCorrectionImpact({
    transcriptJobId: job.id,
    segments: projectedSegments.map((segment) => ({
      id: segment.id,
      acceptedCorrectionId: segment.acceptedCorrectionId,
      text: segment.text,
      speakerLabel: segment.speakerLabel,
    })),
    artifacts,
  });
  const segmentById = new Map(projectedSegments.map((segment) => [segment.id, segment]));
  const allImpacts = [...impactsBySegment.entries()].flatMap(([segmentId, impacts]) =>
    impacts.map((impact) => ({ segmentId, impact })));
  const needsReview = allImpacts.filter(({ impact }) => impact.state === "needs-review");
  const artifactKeys = new Set(allImpacts.map(({ impact }) => `${impact.artifactKind}:${impact.artifactId}`));
  const items = needsReview.flatMap(({ segmentId, impact }) => {
    const segment = segmentById.get(segmentId);
    if (!segment) return [];
    return [{
      segmentId,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      artifactId: impact.artifactId,
      artifactKind: impact.artifactKind,
      label: impact.label,
      href: impact.href,
      segmentHref: `/sessions/${encodeURIComponent(room.id)}?mode=transcript#transcript-impact-${encodeURIComponent(segmentId)}`,
      canAcknowledge: impact.canAcknowledge,
      textChanged: impact.changes.text === "changed",
      speakerChanged: impact.changes.speaker === "changed",
      correctionReceiptChanged: impact.changes.correctionReceipt === "changed",
    }];
  }).slice(0, 100);
  return {
    available: true,
    held: false,
    transcriptJobId: job.id,
    counts: {
      needsReview: needsReview.length,
      snapshotUnavailable: allImpacts.filter(({ impact }) => impact.state === "snapshot-unavailable").length,
      current: allImpacts.filter(({ impact }) => impact.state === "current").length,
      affectedArtifacts: artifactKeys.size,
      ownerResolvable: needsReview.filter(({ impact }) => impact.canAcknowledge).length,
      textChanged: needsReview.filter(({ impact }) => impact.changes.text === "changed").length,
      speakerChanged: needsReview.filter(({ impact }) => impact.changes.speaker === "changed").length,
      receiptOnly: needsReview.filter(({ impact }) => impact.changes.text !== "changed" && impact.changes.speaker !== "changed").length,
    },
    items,
  };
}

function roomTranscriptImpactArtifacts(
  room: any,
  actor: TranscriptCorrectionActor,
): TranscriptImpactArtifact[] {
  return [
    ...(room.notes ?? []).map((note: any) => ({
      id: text(note.id),
      kind: "note" as const,
      label: text(note.title) || `${text(note.kind).toLowerCase().replaceAll("_", " ")} note`,
      status: text(note.visibility) || null,
      href: `/sessions/${encodeURIComponent(room.id)}?mode=notes#session-note-${encodeURIComponent(note.id)}`,
      updatedAt: note.updatedAt instanceof Date ? note.updatedAt.toISOString() : text(note.updatedAt),
      canAcknowledge: note.authorUserId === actor.id,
      evidence: [note.sourceJson, ...(note.revisions ?? []).map((revision: any) => revision.snapshotJson)],
    })),
    ...(room.actionItems ?? []).map((item: any) => ({
      id: text(item.id),
      kind: "task" as const,
      label: text(item.title) || "Untitled task",
      status: text(item.status) || null,
      href: `/work?task=${encodeURIComponent(item.id)}`,
      updatedAt: item.updatedAt instanceof Date ? item.updatedAt.toISOString() : text(item.updatedAt),
      canAcknowledge: item.assignedUserId === actor.id,
      evidence: [item.sourceJson, ...(item.evidenceReceipts ?? []).map((receipt: any) => receipt.evidenceJson)],
    })),
    ...(room.goals ?? []).map((goal: any) => ({
      id: text(goal.id),
      kind: "goal" as const,
      label: text(goal.title) || "Untitled goal",
      status: text(goal.status) || null,
      href: `/work?goal=${encodeURIComponent(goal.id)}`,
      updatedAt: goal.updatedAt instanceof Date ? goal.updatedAt.toISOString() : text(goal.updatedAt),
      canAcknowledge: goal.ownerUserId === actor.id,
      evidence: [goal.sourceJson, ...(goal.progressReceipts ?? []).map((receipt: any) => receipt.evidenceJson)],
    })),
    ...(room.outputs ?? []).map((output: any) => ({
      id: text(output.id),
      kind: "follow-up" as const,
      label: text(output.title) || `${text(output.kind).toLowerCase().replaceAll("_", " ")} output`,
      status: text(output.status) || null,
      href: `/sessions/${encodeURIComponent(room.id)}?mode=outputs#follow-up-notes-${encodeURIComponent(output.id)}`,
      updatedAt: output.updatedAt instanceof Date ? output.updatedAt.toISOString() : text(output.updatedAt),
      canAcknowledge: output.createdByUserId === actor.id,
      evidence: [output.sourceManifestJson, ...(output.revisions ?? []).map((revision: any) => revision.snapshotJson)],
    })),
  ].filter((artifact) => artifact.id);
}

function impactArtifactSelect(kind: TranscriptImpactArtifactKind) {
  if (kind === "note") {
    return {
      id: true,
      roomId: true,
      title: true,
      kind: true,
      visibility: true,
      authorUserId: true,
      updatedAt: true,
      sourceJson: true,
      revisions: {
        where: { operation: "transcript-correction-impact-reviewed-no-content-change" },
        orderBy: { revision: "desc" },
        select: { snapshotJson: true },
      },
    };
  }
  if (kind === "task") {
    return {
      id: true,
      roomId: true,
      title: true,
      status: true,
      assignedUserId: true,
      updatedAt: true,
      sourceJson: true,
      evidenceReceipts: {
        orderBy: { occurredAt: "desc" },
        select: { evidenceJson: true },
      },
    };
  }
  if (kind === "goal") {
    return {
      id: true,
      roomId: true,
      title: true,
      status: true,
      ownerUserId: true,
      updatedAt: true,
      sourceJson: true,
      progressReceipts: {
        orderBy: { occurredAt: "desc" },
        select: { evidenceJson: true },
      },
    };
  }
  return {
    id: true,
    roomId: true,
    title: true,
    kind: true,
    status: true,
    createdByUserId: true,
    recipientUserId: true,
    updatedAt: true,
    sourceManifestJson: true,
    contentSha256: true,
    revision: true,
    revisions: {
      where: { operation: "transcript-correction-impact-reviewed-no-content-change" },
      orderBy: { revision: "desc" },
      select: { snapshotJson: true },
    },
  };
}

async function loadOwnedImpactArtifact(prisma: any, input: {
  roomId: string;
  artifactId: string;
  artifactKind: TranscriptImpactArtifactKind;
  actor: TranscriptCorrectionActor;
}) {
  const where = { id: input.artifactId, roomId: input.roomId };
  if (input.artifactKind === "note") {
    return prisma.coachingNote.findFirst({
      where: { ...where, authorUserId: input.actor.id },
      select: impactArtifactSelect("note"),
    });
  }
  if (input.artifactKind === "task") {
    return prisma.actionItem.findFirst({
      where: { ...where, assignedUserId: input.actor.id },
      select: impactArtifactSelect("task"),
    });
  }
  if (input.artifactKind === "goal") {
    return prisma.goal.findFirst({
      where: { ...where, ownerUserId: input.actor.id },
      select: impactArtifactSelect("goal"),
    });
  }
  return prisma.sessionOutput.findFirst({
    where: { ...where, createdByUserId: input.actor.id },
    select: impactArtifactSelect("follow-up"),
  });
}

function ownedImpactArtifactProjection(
  roomId: string,
  artifactKind: TranscriptImpactArtifactKind,
  artifact: any,
): TranscriptImpactArtifact {
  if (artifactKind === "note") {
    return {
      id: artifact.id,
      kind: "note",
      label: text(artifact.title) || `${text(artifact.kind).toLowerCase().replaceAll("_", " ")} note`,
      status: text(artifact.visibility) || null,
      href: `/sessions/${encodeURIComponent(roomId)}?mode=notes#session-note-${encodeURIComponent(artifact.id)}`,
      updatedAt: artifact.updatedAt instanceof Date ? artifact.updatedAt.toISOString() : text(artifact.updatedAt),
      canAcknowledge: true,
      evidence: [artifact.sourceJson, ...(artifact.revisions ?? []).map((revision: any) => revision.snapshotJson)],
    };
  }
  if (artifactKind === "task") {
    return {
      id: artifact.id,
      kind: "task",
      label: text(artifact.title) || "Untitled task",
      status: text(artifact.status) || null,
      href: `/work?task=${encodeURIComponent(artifact.id)}`,
      updatedAt: artifact.updatedAt instanceof Date ? artifact.updatedAt.toISOString() : text(artifact.updatedAt),
      canAcknowledge: true,
      evidence: [artifact.sourceJson, ...(artifact.evidenceReceipts ?? []).map((receipt: any) => receipt.evidenceJson)],
    };
  }
  if (artifactKind === "goal") {
    return {
      id: artifact.id,
      kind: "goal",
      label: text(artifact.title) || "Untitled goal",
      status: text(artifact.status) || null,
      href: `/work?goal=${encodeURIComponent(artifact.id)}`,
      updatedAt: artifact.updatedAt instanceof Date ? artifact.updatedAt.toISOString() : text(artifact.updatedAt),
      canAcknowledge: true,
      evidence: [artifact.sourceJson, ...(artifact.progressReceipts ?? []).map((receipt: any) => receipt.evidenceJson)],
    };
  }
  return {
    id: artifact.id,
    kind: "follow-up",
    label: text(artifact.title) || `${text(artifact.kind).toLowerCase().replaceAll("_", " ")} output`,
    status: text(artifact.status) || null,
    href: `/sessions/${encodeURIComponent(roomId)}?mode=outputs#follow-up-notes-${encodeURIComponent(artifact.id)}`,
    updatedAt: artifact.updatedAt instanceof Date ? artifact.updatedAt.toISOString() : text(artifact.updatedAt),
    canAcknowledge: true,
    evidence: [artifact.sourceManifestJson, ...(artifact.revisions ?? []).map((revision: any) => revision.snapshotJson)],
  };
}

function impactReviewReceipt(value: unknown, clientRequestId: string): Record<string, unknown> | null {
  let visited = 0;
  function visit(candidate: unknown, depth: number): Record<string, unknown> | null {
    if (candidate == null || depth > 24 || visited >= 20_000) return null;
    visited += 1;
    if (Array.isArray(candidate)) {
      for (const child of candidate) {
        const found = visit(child, depth + 1);
        if (found) return found;
      }
      return null;
    }
    if (typeof candidate !== "object") return null;
    const row = candidate as Record<string, unknown>;
    if (row.schema === TRANSCRIPT_CORRECTION_IMPACT_REVIEW_SCHEMA && text(row.clientRequestId) === clientRequestId) {
      return row;
    }
    for (const child of Object.values(row)) {
      const found = visit(child, depth + 1);
      if (found) return found;
    }
    return null;
  }
  return visit(value, 0);
}

function impactReviewReceiptMatches(receipt: Record<string, unknown>, input: {
  roomId: string;
  transcriptJobId: string;
  segmentId: string;
  artifactKind: TranscriptImpactArtifactKind;
  artifactId: string;
  acceptedCorrectionId: string | null;
  effectiveText: string;
  effectiveSpeakerLabel: string | null;
}) {
  return text(receipt.roomId) === input.roomId
    && text(receipt.transcriptJobId) === input.transcriptJobId
    && text(receipt.segmentId) === input.segmentId
    && text(receipt.artifactKind) === input.artifactKind
    && text(receipt.artifactId) === input.artifactId
    && (text(receipt.acceptedCorrectionId) || null) === input.acceptedCorrectionId
    && text(receipt.effectiveTextSnapshot) === input.effectiveText
    && (text(receipt.effectiveSpeakerLabelSnapshot) || null) === input.effectiveSpeakerLabel;
}

function buildTranscriptEvidence(job: any, segments: AudioTranscriptEvidenceSegment[], groups: any[]) {
  const result = object(job?.resultJson);
  const manifest = object(job?.asset?.localManifestJson);
  return buildAudioTranscriptEvidence({
    provider: job?.provider,
    providerModel: result.model ?? object(result.engine).modelIdentifier,
    language: job?.language ?? object(result.engine).localeIdentifier,
    status: job?.status,
    confidenceTriageThreshold: result.confidenceTriageThreshold,
    confidenceTriageThresholdAuthority: result.confidenceTriageThresholdAuthority,
    recordingDurationSeconds: job?.asset?.durationSeconds,
    sourceProfile: manifest.reportedSourceProfile,
    recordingSegments: job?.asset?.segmentsJson,
    recordingStartedAt: job?.asset?.recordedStartedAt,
    segments,
    speakerGroups: groups,
  });
}

export function transcriptCorrectionBoundaries() {
  return {
    providerSegmentsImmutable: true,
    correctionOverlayVersioned: true,
    acceptedHumanCorrectionRequiresPlaybackConfirmation: true,
    confirmedAsIsRequiresPlaybackConfirmation: true,
    aiOutputRequiresHumanReview: true,
    mediaTimeAnchorsPreserved: true,
    providerWordTimeAnchorsImmutable: true,
    speakerIdentitySeparateFromWordReview: true,
    noTaskCreated: true,
    noExternalDelivery: true,
    noPublication: true,
  };
}

function transcriptProcessingSummary(job: any) {
  if (!job) return null;
  const result = object(job.resultJson);
  const control = object(result.processingControl);
  const routing = object(control.routing);
  const routingSummary = routing.schema === "quipsly-transcript-routing-summary-v1"
    ? {
        sourceTopology: text(routing.sourceTopology) || "unknown",
        participantLabel: text(routing.participantLabel) || null,
        speakerAuthority: text(routing.speakerAuthority) || "unresolved",
        provider: text(routing.provider) || null,
        model: text(routing.model) || null,
        modelRevisionPolicy: text(routing.modelRevisionPolicy) || null,
        language: text(routing.language) || null,
        diarizationRequested: routing.diarizationRequested === true,
        timingGranularity: text(routing.timingGranularity) || null,
        terminologySnapshotSha256: text(routing.terminologySnapshotSha256) || null,
        terminologyKeytermCount: Number.isSafeInteger(routing.terminologyKeytermCount)
          ? Number(routing.terminologyKeytermCount)
          : 0,
        manifestBacked: routing.manifestBacked === true,
        providerOutputRemainsImmutable:
          routing.providerOutputRemainsImmutable === true,
      }
    : null;
  return {
    status: job.status,
    message: job.errorMessage ?? null,
    wordCount: job._count?.words ?? 0,
    sourceBound: Boolean(
      job.processingManifestObject
      && job.sourceGeneration
      && job.sourceSha256,
    ),
    executionRequestedAt: text(control.executionRequestedAt) || null,
    resultReceived: Boolean(job.processingResultObject),
    providerReceiptReceived: Boolean(
      job.providerRequestId
      && job.providerResponseObject,
    ),
    workerBuildId: job.workerBuildId ?? null,
    routing: routingSummary,
  };
}

function validateCorrectionChange(input: {
  providerText: string;
  providerSpeakerLabel: string | null;
  correctedText: unknown;
  correctedSpeakerLabel: unknown;
}) {
  const correctedText = text(input.correctedText) || null;
  const correctedSpeakerLabel = nullableLabel(input.correctedSpeakerLabel);
  if (!correctedText && !correctedSpeakerLabel) {
    throw new TranscriptCorrectionError("Enter corrected words, a corrected speaker, or both.", 400, "EMPTY_CORRECTION");
  }
  if (correctedText === input.providerText && correctedSpeakerLabel === input.providerSpeakerLabel) {
    throw new TranscriptCorrectionError("The correction does not change the provider transcript.", 400, "UNCHANGED_CORRECTION");
  }
  return { correctedText, correctedSpeakerLabel };
}

function correctionMatchesActiveOverlay(input: {
  providerText: string;
  providerSpeakerLabel: string | null;
  correctedText: string | null;
  correctedSpeakerLabel: string | null;
  active: { correctedText?: string | null; correctedSpeakerLabel?: string | null } | null;
}) {
  if (!input.active) return false;
  return (input.correctedText ?? input.providerText) === (input.active.correctedText ?? input.providerText)
    && (input.correctedSpeakerLabel ?? input.providerSpeakerLabel) === (input.active.correctedSpeakerLabel ?? input.providerSpeakerLabel);
}

function assertPlaybackConfirmation(input: {
  playback: ReturnType<typeof playbackFromAsset>;
  confirmedAgainstPlayback: unknown;
  playbackPositionSeconds: unknown;
  startSeconds: number;
  endSeconds: number;
}) {
  if (!input.playback) {
    throw new TranscriptCorrectionError(
      "Promote the verified recording to protected Quipsly media before accepting a correction against playback.",
      409,
      "PLAYBACK_UNAVAILABLE",
    );
  }
  if (input.confirmedAgainstPlayback !== true) {
    throw new TranscriptCorrectionError("Listen to this segment and confirm the correction before accepting it.", 409, "PLAYBACK_NOT_CONFIRMED");
  }
  const position = typeof input.playbackPositionSeconds === "number" ? input.playbackPositionSeconds : Number.NaN;
  if (!Number.isFinite(position) || position < Math.max(0, input.startSeconds - 1) || position > input.endSeconds + 3) {
    throw new TranscriptCorrectionError("Play this segment from its timestamp before accepting the correction.", 409, "PLAYBACK_POSITION_MISMATCH");
  }
  return position;
}

async function loadMutationEvidence(prisma: any, input: {
  roomId: string;
  segmentId: string;
  actor: TranscriptCorrectionActor;
}) {
  const room = await prisma.callRoom.findFirst({
    where: accessibleRoomWhere(input.roomId, input.actor),
    select: {
      id: true,
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          asset: {
            select: {
              id: true,
              roomId: true,
              kind: true,
              status: true,
              fileName: true,
              durationSeconds: true,
              byteSize: true,
              checksum: true,
              storageBucket: true,
              storageObjectPath: true,
              localManifestJson: true,
            },
          },
          segments: {
            where: { id: input.segmentId },
            take: 1,
            select: { id: true, text: true, speakerLabel: true, startSeconds: true, endSeconds: true },
          },
        },
      },
    },
  });
  const job = room?.transcriptJobs[0] ?? null;
  const segment = job?.segments[0] ?? null;
  if (!room || !job?.asset || !segment) {
    throw new TranscriptCorrectionError("The current transcript segment was not found in this session.", 404, "SEGMENT_NOT_FOUND");
  }
  const gate = await transcriptProcessingGate(prisma, job.asset);
  if (!gate.allowed) {
    throw new TranscriptCorrectionError(gate.error || "Transcript correction is held by its release gate.", 409, "TRANSCRIPT_HELD");
  }
  return { room, job, segment, playback: playbackFromAsset(job.asset) };
}

async function loadSpeakerAttributionEvidence(prisma: any, input: {
  roomId: string;
  participantId: string;
  actor: TranscriptCorrectionActor;
}) {
  const room = await prisma.callRoom.findFirst({
    where: accessibleRoomWhere(input.roomId, input.actor),
    select: {
      id: true,
      participants: {
        where: { id: input.participantId },
        take: 1,
        select: {
          id: true,
          userId: true,
          displayName: true,
          email: true,
          role: true,
          user: { select: { name: true, primaryEmail: true } },
        },
      },
      transcriptJobs: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          asset: {
            select: {
              id: true,
              roomId: true,
              kind: true,
              status: true,
              fileName: true,
              durationSeconds: true,
              byteSize: true,
              checksum: true,
              storageBucket: true,
              storageObjectPath: true,
              localManifestJson: true,
            },
          },
          segments: {
            orderBy: { startSeconds: "asc" },
            select: {
              id: true,
              speakerLabel: true,
              startSeconds: true,
              endSeconds: true,
              text: true,
            },
          },
        },
      },
    },
  });
  const participant = room?.participants[0] ?? null;
  const job = room?.transcriptJobs[0] ?? null;
  if (!room || !participant) {
    throw new TranscriptCorrectionError("Choose a current participant from this Session.", 404, "PARTICIPANT_NOT_FOUND");
  }
  if (!job?.asset) {
    throw new TranscriptCorrectionError("The current recording-backed transcript was not found.", 404, "TRANSCRIPT_NOT_FOUND");
  }
  const gate = await transcriptProcessingGate(prisma, job.asset);
  if (!gate.allowed) {
    throw new TranscriptCorrectionError(gate.error || "Speaker attribution is held by its release gate.", 409, "TRANSCRIPT_HELD");
  }
  const playback = playbackFromAsset(job.asset);
  if (!playback) {
    throw new TranscriptCorrectionError(
      "Prepare protected playback before identifying a diarized speaker.",
      409,
      "PLAYBACK_UNAVAILABLE",
    );
  }
  return { room, participant, job, playback };
}

function speakerAttributionReplayMatches(attribution: any, input: {
  roomId: string;
  transcriptJobId: string;
  providerSpeakerLabel: string;
  participantId: string;
  providerSnapshotSha256: string;
  sampleEvidence: Array<Record<string, unknown>>;
}) {
  const persistedSamples = Array.isArray(attribution.sampleEvidenceJson)
    ? attribution.sampleEvidenceJson
    : [];
  const samplesMatch = persistedSamples.length === input.sampleEvidence.length
    && persistedSamples.every((sample: any, index: number) => {
      const expected = input.sampleEvidence[index] ?? {};
      return text(sample?.segmentId) === text(expected.segmentId)
        && Number(sample?.startSeconds) === Number(expected.startSeconds)
        && Number(sample?.endSeconds) === Number(expected.endSeconds)
        && text(sample?.providerTextSha256) === text(expected.providerTextSha256)
        && Number(sample?.playbackPositionSeconds) === Number(expected.playbackPositionSeconds);
    });
  return attribution.roomId === input.roomId
    && attribution.transcriptJobId === input.transcriptJobId
    && attribution.providerSpeakerLabel === input.providerSpeakerLabel
    && attribution.participantId === input.participantId
    && attribution.providerSnapshotSha256 === input.providerSnapshotSha256
    && samplesMatch;
}

export async function attributeTranscriptSpeaker(input: {
  prisma: any;
  actor: TranscriptCorrectionActor;
  roomId: string;
  providerSpeakerLabel: string;
  participantId: string;
  clientRequestId: string;
  expectedProviderSnapshotSha256: string;
  samples: Array<{ segmentId: string; playbackPositionSeconds: number }>;
  confirmedAgainstPlayback?: boolean;
  reviewNote?: string | null;
}) {
  const roomId = text(input.roomId);
  const providerSpeakerLabel = text(input.providerSpeakerLabel);
  const participantId = text(input.participantId);
  const clientRequestId = text(input.clientRequestId);
  const expectedProviderSnapshotSha256 = text(input.expectedProviderSnapshotSha256);
  if (
    !roomId
    || !providerSpeakerLabel
    || providerSpeakerLabel.length > 160
    || !participantId
    || !clientRequestId
    || clientRequestId.length > 160
    || !/^[a-f0-9]{64}$/.test(expectedProviderSnapshotSha256)
  ) {
    throw new TranscriptCorrectionError(
      "A room, diarized speaker, participant, bounded request id, and provider snapshot are required.",
      400,
      "INVALID_SPEAKER_ATTRIBUTION",
    );
  }
  if (input.confirmedAgainstPlayback !== true) {
    throw new TranscriptCorrectionError(
      "Play at least one sample and confirm the diarized voice before assigning it.",
      409,
      "PLAYBACK_NOT_CONFIRMED",
    );
  }
  const samples = Array.isArray(input.samples) ? input.samples : [];
  if (samples.length < 1 || samples.length > 3) {
    throw new TranscriptCorrectionError("Choose one to three playback samples from this speaker.", 400, "INVALID_SPEAKER_SAMPLES");
  }
  const evidence = await loadSpeakerAttributionEvidence(input.prisma, { roomId, participantId, actor: input.actor });
  const providerSnapshot = speakerProviderSnapshot(evidence.job.segments, providerSpeakerLabel);
  if (providerSnapshot.evidence.length === 0) {
    throw new TranscriptCorrectionError("That diarized speaker is not present in the current transcript.", 404, "SPEAKER_GROUP_NOT_FOUND");
  }
  if (providerSnapshot.sha256 !== expectedProviderSnapshotSha256) {
    throw new TranscriptCorrectionError("The diarized speaker evidence changed. Refresh before assigning it.", 409, "STALE_SPEAKER_EVIDENCE");
  }
  const seenSamples = new Set<string>();
  const sampleEvidence = samples.map((sample) => {
    const segmentId = text(sample?.segmentId);
    if (!segmentId || seenSamples.has(segmentId)) {
      throw new TranscriptCorrectionError("Speaker samples must be unique current segments.", 400, "INVALID_SPEAKER_SAMPLES");
    }
    seenSamples.add(segmentId);
    const segment = evidence.job.segments.find(
      (candidate: any) => candidate.id === segmentId && candidate.speakerLabel === providerSpeakerLabel,
    );
    if (!segment) {
      throw new TranscriptCorrectionError("A playback sample no longer belongs to this diarized speaker.", 409, "STALE_SPEAKER_SAMPLE");
    }
    const positionSeconds = assertPlaybackConfirmation({
      playback: evidence.playback,
      confirmedAgainstPlayback: true,
      playbackPositionSeconds: sample.playbackPositionSeconds,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
    });
    return {
      segmentId,
      startSeconds: segment.startSeconds,
      endSeconds: segment.endSeconds,
      providerTextSha256: sha256(segment.text),
      playbackPositionSeconds: positionSeconds,
    };
  });
  const participantLabel = participantDisplayLabel(evidence.participant);
  if (!participantLabel || participantLabel.length > 160) {
    throw new TranscriptCorrectionError("Give this participant a usable display name before assigning their voice.", 409, "PARTICIPANT_NAME_REQUIRED");
  }
  const participantEmail = text(evidence.participant.email)
    || text(evidence.participant.user?.primaryEmail)
    || null;
  const replayInput = {
    roomId,
    transcriptJobId: evidence.job.id,
    providerSpeakerLabel,
    participantId,
    providerSnapshotSha256: providerSnapshot.sha256,
    sampleEvidence,
  };
  const replay = await input.prisma.transcriptSpeakerAttribution.findUnique({
    where: {
      reviewedByUserId_clientRequestId: {
        reviewedByUserId: input.actor.id,
        clientRequestId,
      },
    },
  });
  if (replay) {
    if (!speakerAttributionReplayMatches(replay, replayInput)) {
      throw new TranscriptCorrectionError("That request id is already bound to different speaker evidence.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return {
      ok: true,
      idempotentReplay: true,
      attribution: publicSpeakerAttribution(replay),
      boundaries: transcriptCorrectionBoundaries(),
    };
  }

  const reviewedAt = new Date();
  try {
    const saved = await input.prisma.$transaction(async (tx: any) => {
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${evidence.job.id}`);
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-speaker-attribution:${evidence.job.id}:${providerSpeakerLabel}`);
      const currentJob = await tx.transcriptJob.findFirst({
        where: { id: evidence.job.id, roomId },
        select: {
          id: true,
          asset: {
            select: {
              id: true,
              roomId: true,
              kind: true,
              status: true,
              fileName: true,
              durationSeconds: true,
              byteSize: true,
              checksum: true,
              storageBucket: true,
              storageObjectPath: true,
              localManifestJson: true,
            },
          },
          segments: {
            orderBy: { startSeconds: "asc" },
            select: { id: true, speakerLabel: true, startSeconds: true, endSeconds: true, text: true },
          },
        },
      });
      if (!currentJob?.asset || speakerProviderSnapshot(currentJob.segments, providerSpeakerLabel).sha256 !== providerSnapshot.sha256) {
        throw new TranscriptCorrectionError("The diarized speaker evidence changed during review. Refresh and listen again.", 409, "STALE_SPEAKER_EVIDENCE");
      }
      const currentGate = await transcriptProcessingGate(tx, currentJob.asset);
      if (!currentGate.allowed) {
        throw new TranscriptCorrectionError(
          currentGate.error || "Speaker attribution became held by its release gate during review.",
          409,
          "TRANSCRIPT_HELD",
        );
      }
      const currentParticipant = await tx.callParticipant.findFirst({
        where: { id: participantId, roomId },
        select: { id: true },
      });
      if (!currentParticipant) {
        throw new TranscriptCorrectionError("The selected participant left this Session record. Refresh before assigning.", 409, "PARTICIPANT_NOT_FOUND");
      }
      const active = await tx.transcriptSpeakerAttribution.findFirst({
        where: { transcriptJobId: evidence.job.id, providerSpeakerLabel, status: "active" },
        orderBy: { updatedAt: "desc" },
      });
      if (active) {
        await tx.transcriptSpeakerAttribution.update({
          where: { id: active.id },
          data: { status: "superseded", supersededAt: reviewedAt },
        });
      }
      const attribution = await tx.transcriptSpeakerAttribution.create({
        data: {
          roomId,
          transcriptJobId: evidence.job.id,
          recordingAssetId: evidence.playback.recordingAssetId,
          providerSpeakerLabel,
          participantId,
          participantUserIdSnapshot: evidence.participant.userId ?? null,
          participantDisplaySnapshot: participantLabel,
          participantEmailSnapshot: participantEmail,
          reviewedByUserId: input.actor.id,
          reviewerEmailSnapshot: text(input.actor.email) || null,
          clientRequestId,
          status: "active",
          providerSnapshotSha256: providerSnapshot.sha256,
          sampleSegmentIdsJson: sampleEvidence.map((sample) => sample.segmentId),
          sampleEvidenceJson: sampleEvidence,
          playbackSourceId: evidence.playback.sourceId,
          reviewNote: text(input.reviewNote) || "Reviewer identified this provider diarization cluster from protected playback samples.",
          reviewedAt,
        },
      });
      return attribution;
    }, { isolationLevel: "Serializable" });
    return {
      ok: true,
      idempotentReplay: false,
      attribution: publicSpeakerAttribution(saved),
      boundaries: transcriptCorrectionBoundaries(),
    };
  } catch (error) {
    const code = text(object(error).code);
    if (code !== "P2002" && code !== "P2034") throw error;
    const racedReplay = await input.prisma.transcriptSpeakerAttribution.findUnique({
      where: {
        reviewedByUserId_clientRequestId: {
          reviewedByUserId: input.actor.id,
          clientRequestId,
        },
      },
    });
    if (racedReplay) {
      if (!speakerAttributionReplayMatches(racedReplay, replayInput)) {
        throw new TranscriptCorrectionError("That request id won a race with different speaker evidence.", 409, "IDEMPOTENCY_CONFLICT");
      }
      return {
        ok: true,
        idempotentReplay: true,
        attribution: publicSpeakerAttribution(racedReplay),
        boundaries: transcriptCorrectionBoundaries(),
      };
    }
    const winner = await input.prisma.transcriptSpeakerAttribution.findFirst({
      where: { transcriptJobId: evidence.job.id, providerSpeakerLabel, status: "active" },
      orderBy: { updatedAt: "desc" },
    });
    if (winner?.participantId !== participantId || winner?.providerSnapshotSha256 !== providerSnapshot.sha256) {
      throw new TranscriptCorrectionError("Another speaker assignment won the save race. Refresh before replacing it.", 409, "STALE_SPEAKER_ATTRIBUTION");
    }
    return {
      ok: true,
      idempotentReplay: true,
      attribution: publicSpeakerAttribution(winner),
      boundaries: transcriptCorrectionBoundaries(),
    };
  }
}

export async function confirmTranscriptSegmentAsIs(input: {
  prisma: any;
  actor: TranscriptCorrectionActor;
  roomId: string;
  segmentId: string;
  clientRequestId: string;
  expectedText: string;
  expectedSpeakerLabel?: string | null;
  expectedAcceptedCorrectionId?: string | null;
  confirmedAgainstPlayback?: boolean;
  playbackPositionSeconds?: number;
  reviewNote?: string | null;
}) {
  const roomId = text(input.roomId);
  const segmentId = text(input.segmentId);
  const clientRequestId = text(input.clientRequestId);
  if (!roomId || !segmentId || !clientRequestId || clientRequestId.length > 160) {
    throw new TranscriptCorrectionError("roomId, segmentId, and a bounded clientRequestId are required.", 400, "INVALID_REQUEST");
  }

  const evidence = await loadMutationEvidence(input.prisma, { roomId, segmentId, actor: input.actor });
  const replay = await input.prisma.transcriptSegmentVerification.findUnique({
    where: { reviewerUserId_clientRequestId: { reviewerUserId: input.actor.id, clientRequestId } },
  });
  if (replay) {
    if (replay.roomId !== roomId || replay.segmentId !== segmentId) {
      throw new TranscriptCorrectionError("That request id is already bound to different evidence.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, verification: publicVerification(replay), boundaries: transcriptCorrectionBoundaries() };
  }

  const expectedSpeakerLabel = nullableLabel(input.expectedSpeakerLabel);
  if (input.expectedText !== evidence.segment.text || expectedSpeakerLabel !== (evidence.segment.speakerLabel ?? null)) {
    throw new TranscriptCorrectionError("The provider transcript changed. Refresh before confirming it.", 409, "STALE_PROVIDER_EVIDENCE");
  }
  const expectedAcceptedCorrectionId = text(input.expectedAcceptedCorrectionId) || null;
  const active = await input.prisma.transcriptCorrection.findFirst({
    where: { segmentId, status: "accepted" },
    orderBy: { updatedAt: "desc" },
    select: { id: true },
  });
  if ((active?.id ?? null) !== expectedAcceptedCorrectionId) {
    throw new TranscriptCorrectionError("The reviewed overlay changed. Refresh before confirming this segment.", 409, "STALE_CORRECTION_OVERLAY");
  }
  if (active) {
    throw new TranscriptCorrectionError("This segment already has a reviewed correction. Confirm the displayed correction through its review history instead of marking provider text as-is.", 409, "CORRECTION_ALREADY_ACTIVE");
  }
  const playbackPositionSeconds = assertPlaybackConfirmation({
    playback: evidence.playback,
    confirmedAgainstPlayback: input.confirmedAgainstPlayback,
    playbackPositionSeconds: input.playbackPositionSeconds,
    startSeconds: evidence.segment.startSeconds,
    endSeconds: evidence.segment.endSeconds,
  });

  const saved = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${evidence.job.id}`);
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-segment-review:${segmentId}`);
    const transactionActive = await tx.transcriptCorrection.findFirst({
      where: { segmentId, status: "accepted" },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (transactionActive) {
      throw new TranscriptCorrectionError("A reviewed correction won the save race. Refresh before confirming this segment.", 409, "STALE_CORRECTION_OVERLAY");
    }
    const currentVerification = await tx.transcriptSegmentVerification.findFirst({
      where: {
        segmentId,
        providerTextSha256: sha256(evidence.segment.text),
        providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
      },
      orderBy: { createdAt: "desc" },
    });
    if (currentVerification) {
      return { verification: currentVerification, idempotentReplay: true };
    }
    const verification = await tx.transcriptSegmentVerification.create({
      data: {
        roomId,
        transcriptJobId: evidence.job.id,
        segmentId,
        recordingAssetId: evidence.playback!.recordingAssetId,
        reviewerUserId: input.actor.id,
        reviewerEmailSnapshot: text(input.actor.email) || null,
        clientRequestId,
        reviewKind: "confirmed-as-is",
        providerTextSha256: sha256(evidence.segment.text),
        providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
        startSecondsSnapshot: evidence.segment.startSeconds,
        endSecondsSnapshot: evidence.segment.endSeconds,
        playbackSourceId: evidence.playback!.sourceId,
        playbackPositionSeconds,
        reviewNote: text(input.reviewNote) || "Reviewer confirmed the provider segment as-is against protected playback.",
      },
    });
    return { verification, idempotentReplay: false };
  });

  return { ok: true, idempotentReplay: saved.idempotentReplay, verification: publicVerification(saved.verification), boundaries: transcriptCorrectionBoundaries() };
}

export async function acknowledgeTranscriptCorrectionImpact(input: {
  prisma: any;
  actor: TranscriptCorrectionActor;
  roomId: string;
  transcriptJobId: string;
  segmentId: string;
  artifactKind: TranscriptImpactArtifactKind;
  artifactId: string;
  clientRequestId: string;
  expectedArtifactUpdatedAt: string;
  expectedAcceptedCorrectionId?: string | null;
  expectedEffectiveText: string;
  expectedEffectiveSpeakerLabel?: string | null;
  confirmedContentStillValid?: boolean;
}) {
  const roomId = text(input.roomId);
  const transcriptJobId = text(input.transcriptJobId);
  const segmentId = text(input.segmentId);
  const artifactId = text(input.artifactId);
  const clientRequestId = text(input.clientRequestId);
  const artifactKind = input.artifactKind;
  const expectedArtifactUpdatedAt = text(input.expectedArtifactUpdatedAt);
  const expectedEffectiveText = typeof input.expectedEffectiveText === "string" ? input.expectedEffectiveText.trim() : "";
  const expectedEffectiveSpeakerLabel = text(input.expectedEffectiveSpeakerLabel) || null;
  const expectedAcceptedCorrectionId = text(input.expectedAcceptedCorrectionId) || null;
  if (
    !roomId || !transcriptJobId || !segmentId || !artifactId || !clientRequestId
    || clientRequestId.length > 200
    || !["note", "task", "goal", "follow-up"].includes(artifactKind)
    || !expectedEffectiveText || !expectedArtifactUpdatedAt
    || Number.isNaN(Date.parse(expectedArtifactUpdatedAt))
  ) {
    throw new TranscriptCorrectionError(
      "A current transcript, linked item, bounded request id, and exact review snapshot are required.",
      400,
      "INVALID_IMPACT_REVIEW",
    );
  }
  if (input.confirmedContentStillValid !== true) {
    throw new TranscriptCorrectionError(
      "Confirm that the linked item still says what you intend after reading the corrected source.",
      409,
      "IMPACT_REVIEW_NOT_CONFIRMED",
    );
  }

  async function loadCurrentState(prisma: any) {
    const evidence = await loadMutationEvidence(prisma, { roomId, segmentId, actor: input.actor });
    if (evidence.job.id !== transcriptJobId) {
      throw new TranscriptCorrectionError(
        "The Session now has a different current transcript. Refresh before reviewing linked work.",
        409,
        "STALE_TRANSCRIPT_JOB",
      );
    }
    const active = await prisma.transcriptCorrection.findFirst({
      where: { segmentId, status: "accepted" },
      orderBy: { updatedAt: "desc" },
      select: { id: true, correctedText: true, correctedSpeakerLabel: true },
    });
    const attribution = evidence.segment.speakerLabel
      ? await prisma.transcriptSpeakerAttribution.findFirst({
          where: { transcriptJobId, providerSpeakerLabel: evidence.segment.speakerLabel, status: "active" },
          orderBy: { updatedAt: "desc" },
          select: { participantDisplaySnapshot: true },
        })
      : null;
    const effectiveText = text(active?.correctedText) || evidence.segment.text;
    const effectiveSpeakerLabel = text(active?.correctedSpeakerLabel)
      || text(attribution?.participantDisplaySnapshot)
      || text(evidence.segment.speakerLabel)
      || null;
    const artifact = await loadOwnedImpactArtifact(prisma, { roomId, artifactId, artifactKind, actor: input.actor });
    if (!artifact) {
      throw new TranscriptCorrectionError(
        "Only the current owner can resolve this linked item's transcript review.",
        403,
        "IMPACT_REVIEW_OWNER_REQUIRED",
      );
    }
    return {
      evidence,
      active,
      effectiveText,
      effectiveSpeakerLabel,
      artifact,
      projection: ownedImpactArtifactProjection(roomId, artifactKind, artifact),
    };
  }

  function assertExpectedState(state: Awaited<ReturnType<typeof loadCurrentState>>) {
    const replay = state.projection.evidence
      .map((value) => impactReviewReceipt(value, clientRequestId))
      .find(Boolean) ?? null;
    const identity = {
      roomId,
      transcriptJobId,
      segmentId,
      artifactKind,
      artifactId,
      acceptedCorrectionId: state.active?.id ?? null,
      effectiveText: state.effectiveText,
      effectiveSpeakerLabel: state.effectiveSpeakerLabel,
    };
    if (replay) {
      if (!impactReviewReceiptMatches(replay, identity)) {
        throw new TranscriptCorrectionError(
          "That request id is already bound to a different transcript impact review.",
          409,
          "IDEMPOTENCY_CONFLICT",
        );
      }
      return { replay, impact: null };
    }
    const artifactUpdatedAt = state.artifact.updatedAt instanceof Date
      ? state.artifact.updatedAt.toISOString()
      : text(state.artifact.updatedAt);
    if (artifactUpdatedAt !== new Date(expectedArtifactUpdatedAt).toISOString()) {
      throw new TranscriptCorrectionError(
        "The linked item changed while you were reviewing it. Refresh and compare it again.",
        409,
        "STALE_IMPACT_ARTIFACT",
      );
    }
    if (
      (state.active?.id ?? null) !== expectedAcceptedCorrectionId
      || state.effectiveText !== expectedEffectiveText
      || state.effectiveSpeakerLabel !== expectedEffectiveSpeakerLabel
    ) {
      throw new TranscriptCorrectionError(
        "The reviewed transcript changed while you were comparing it. Refresh before keeping the linked item.",
        409,
        "STALE_IMPACT_TRANSCRIPT",
      );
    }
    const impact = buildTranscriptCorrectionImpact({
      transcriptJobId,
      segments: [{
        id: segmentId,
        acceptedCorrectionId: state.active?.id ?? null,
        text: state.effectiveText,
        speakerLabel: state.effectiveSpeakerLabel,
      }],
      artifacts: [state.projection],
    }).get(segmentId)?.[0] ?? null;
    if (!impact || impact.state !== "needs-review") {
      throw new TranscriptCorrectionError(
        impact?.state === "current"
          ? "This linked item already carries current transcript evidence."
          : "Quipsly cannot safely resolve this legacy item until its exact transcript snapshot is available.",
        409,
        impact?.state === "current" ? "IMPACT_ALREADY_CURRENT" : "IMPACT_SNAPSHOT_UNAVAILABLE",
      );
    }
    return { replay: null, impact };
  }

  const initial = await loadCurrentState(input.prisma);
  const initialCheck = assertExpectedState(initial);
  if (initialCheck.replay) {
    return {
      ok: true,
      idempotentReplay: true,
      receipt: initialCheck.replay,
      artifact: initial.projection,
      boundaries: transcriptCorrectionBoundaries(),
    };
  }

  const reviewedAt = new Date();
  const result = await input.prisma.$transaction(async (tx: any) => {
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${transcriptJobId}`);
    await acquirePrismaAdvisoryTransactionLock(tx, `transcript-impact:${artifactKind}:${artifactId}`);
    const current = await loadCurrentState(tx);
    const currentCheck = assertExpectedState(current);
    if (currentCheck.replay) {
      return { idempotentReplay: true, receipt: currentCheck.replay, artifact: current.projection };
    }
    const receipt = {
      schema: TRANSCRIPT_CORRECTION_IMPACT_REVIEW_SCHEMA,
      clientRequestId,
      roomId,
      transcriptJobId,
      segmentId,
      artifactKind,
      artifactId,
      acceptedCorrectionId: current.active?.id ?? null,
      effectiveTextSnapshot: current.effectiveText,
      effectiveSpeakerLabelSnapshot: current.effectiveSpeakerLabel,
      reviewedByUserId: input.actor.id,
      reviewedAt: reviewedAt.toISOString(),
      decision: "KEEP_CONTENT",
      boundaries: { contentChanged: false, canonicalSourceChanged: false, externalDelivery: false, publication: false },
    };
    if (artifactKind === "note") {
      const latest = await tx.coachingNoteRevision.findFirst({
        where: { noteId: artifactId },
        orderBy: { revision: "desc" },
        select: { revision: true },
      });
      await tx.coachingNoteRevision.create({
        data: {
          noteId: artifactId,
          revision: (latest?.revision ?? 0) + 1,
          operation: "transcript-correction-impact-reviewed-no-content-change",
          actorUserId: input.actor.id,
          snapshotJson: receipt,
        },
      });
    } else if (artifactKind === "task") {
      await tx.actionItemEvidenceReceipt.create({
        data: {
          id: clientRequestId,
          actionItemId: artifactId,
          actorUserId: input.actor.id,
          kind: "TRANSCRIPT_CORRECTION_IMPACT_REVIEW",
          note: "Owner reviewed corrected transcript evidence and kept task content unchanged.",
          evidenceJson: receipt,
          occurredAt: reviewedAt,
        },
      });
    } else if (artifactKind === "goal") {
      await tx.goalProgressReceipt.create({
        data: {
          id: clientRequestId,
          goalId: artifactId,
          actorUserId: input.actor.id,
          kind: "TRANSCRIPT_CORRECTION_IMPACT_REVIEW",
          progressPercent: null,
          note: "Owner reviewed corrected transcript evidence and kept goal content unchanged.",
          evidenceJson: receipt,
          occurredAt: reviewedAt,
        },
      });
    } else {
      const nextRevision = Number(current.artifact.revision) + 1;
      await tx.sessionOutput.update({ where: { id: artifactId }, data: { revision: nextRevision } });
      await tx.sessionOutputRevision.create({
        data: {
          id: randomUUID(),
          outputId: artifactId,
          revision: nextRevision,
          operation: "transcript-correction-impact-reviewed-no-content-change",
          actorUserId: input.actor.id,
          snapshotJson: receipt,
        },
      });
    }
    return { idempotentReplay: false, receipt, artifact: current.projection };
  });
  return { ok: true, ...result, boundaries: transcriptCorrectionBoundaries() };
}

export async function createTranscriptCorrection(input: {
  prisma: any;
  actor: TranscriptCorrectionActor;
  roomId: string;
  segmentId: string;
  clientRequestId: string;
  origin: "human" | "ai";
  expectedText: string;
  expectedSpeakerLabel?: string | null;
  expectedAcceptedCorrectionId?: string | null;
  correctedText?: string | null;
  correctedSpeakerLabel?: string | null;
  reason?: string | null;
  confirmedAgainstPlayback?: boolean;
  playbackPositionSeconds?: number;
  aiReceipt?: Record<string, unknown> | null;
}) {
  const roomId = text(input.roomId);
  const segmentId = text(input.segmentId);
  const clientRequestId = text(input.clientRequestId);
  if (!roomId || !segmentId || !clientRequestId || clientRequestId.length > 160) {
    throw new TranscriptCorrectionError("roomId, segmentId, and a bounded clientRequestId are required.", 400, "INVALID_REQUEST");
  }
  if (input.origin !== "human" && input.origin !== "ai") {
    throw new TranscriptCorrectionError("Correction origin must be human or ai.", 400, "INVALID_ORIGIN");
  }

  const evidence = await loadMutationEvidence(input.prisma, { roomId, segmentId, actor: input.actor });
  // Replays still re-authorize the current room and release gate before any
  // previously saved correction text is returned.
  const replay = await input.prisma.transcriptCorrection.findUnique({
    where: { createdByUserId_clientRequestId: { createdByUserId: input.actor.id, clientRequestId } },
    include: { revisions: { orderBy: { revision: "asc" } } },
  });
  if (replay) {
    if (replay.roomId !== roomId || replay.segmentId !== segmentId) {
      throw new TranscriptCorrectionError("That request id is already bound to different evidence.", 409, "IDEMPOTENCY_CONFLICT");
    }
    return { ok: true, idempotentReplay: true, correction: publicCorrection(replay), boundaries: transcriptCorrectionBoundaries() };
  }
  const expectedSpeakerLabel = nullableLabel(input.expectedSpeakerLabel);
  if (input.expectedText !== evidence.segment.text || expectedSpeakerLabel !== (evidence.segment.speakerLabel ?? null)) {
    throw new TranscriptCorrectionError("The provider transcript changed. Refresh before saving a correction.", 409, "STALE_PROVIDER_EVIDENCE");
  }
  const change = validateCorrectionChange({
    providerText: evidence.segment.text,
    providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
    correctedText: input.correctedText,
    correctedSpeakerLabel: input.correctedSpeakerLabel,
  });
  const active = await input.prisma.transcriptCorrection.findFirst({
    where: { segmentId, status: "accepted" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, correctedText: true, correctedSpeakerLabel: true },
  });
  if ((active?.id ?? null) !== (text(input.expectedAcceptedCorrectionId) || null)) {
    throw new TranscriptCorrectionError("Another accepted correction is now active. Refresh before replacing it.", 409, "STALE_CORRECTION_OVERLAY");
  }
  if (correctionMatchesActiveOverlay({
    providerText: evidence.segment.text,
    providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
    correctedText: change.correctedText,
    correctedSpeakerLabel: change.correctedSpeakerLabel,
    active,
  })) {
    throw new TranscriptCorrectionError("The reviewed overlay already contains that correction.", 409, "UNCHANGED_CORRECTION_OVERLAY");
  }

  const accepted = input.origin === "human";
  const playbackPositionSeconds = accepted
    ? assertPlaybackConfirmation({
        playback: evidence.playback,
        confirmedAgainstPlayback: input.confirmedAgainstPlayback,
        playbackPositionSeconds: input.playbackPositionSeconds,
        startSeconds: evidence.segment.startSeconds,
        endSeconds: evidence.segment.endSeconds,
      })
    : null;
  const now = new Date();
  const status = accepted ? "accepted" : "proposed";
  const provenanceJson = {
    schema: TRANSCRIPT_CORRECTION_SCHEMA,
    source: accepted ? "session-review-playback" : "ai-transcript-correction-proposal",
    playback: accepted ? {
      confirmed: true,
      sourceId: evidence.playback?.sourceId,
      recordingAssetId: evidence.playback?.recordingAssetId,
      positionSeconds: playbackPositionSeconds,
    } : null,
    aiReceipt: input.origin === "ai" ? object(input.aiReceipt) : null,
    expectedAcceptedCorrectionId: active?.id ?? null,
    boundaries: transcriptCorrectionBoundaries(),
  };

  const correction = await input.prisma.$transaction(async (tx: any) => {
    if (accepted) {
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${evidence.job.id}`);
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-segment-review:${segmentId}`);
    }
    const transactionActive = accepted
      ? await tx.transcriptCorrection.findFirst({
          where: { segmentId, status: "accepted" },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        })
      : active;
    if ((transactionActive?.id ?? null) !== (active?.id ?? null)) {
      throw new TranscriptCorrectionError("Another accepted correction won the save race. Refresh before replacing it.", 409, "STALE_CORRECTION_OVERLAY");
    }
    if (accepted && transactionActive) {
      const superseded = await tx.transcriptCorrection.update({
        where: { id: transactionActive.id },
        data: { status: "superseded" },
      });
      const previousRevision = await tx.transcriptCorrectionRevision.count({ where: { correctionId: transactionActive.id } });
      await tx.transcriptCorrectionRevision.create({
        data: {
          correctionId: transactionActive.id,
          revision: previousRevision + 1,
          operation: "superseded-by-reviewed-correction",
          actorUserId: input.actor.id,
          snapshotJson: correctionSnapshot(superseded),
        },
      });
    }
    const created = await tx.transcriptCorrection.create({
      data: {
        roomId,
        transcriptJobId: evidence.job.id,
        segmentId,
        createdByUserId: input.actor.id,
        createdByEmailSnapshot: text(input.actor.email) || null,
        clientRequestId,
        origin: input.origin,
        status,
        baseTextSha256: sha256(evidence.segment.text),
        expectedText: evidence.segment.text,
        expectedSpeakerLabel: evidence.segment.speakerLabel ?? null,
        startSecondsSnapshot: evidence.segment.startSeconds,
        endSecondsSnapshot: evidence.segment.endSeconds,
        correctedText: change.correctedText,
        correctedSpeakerLabel: change.correctedSpeakerLabel,
        reason: text(input.reason) || null,
        provenanceJson,
        reviewedByUserId: accepted ? input.actor.id : null,
        reviewedAt: accepted ? now : null,
        reviewNote: accepted ? "Reviewer explicitly confirmed this correction against protected playback." : null,
      },
    });
    await tx.transcriptCorrectionRevision.create({
      data: {
        correctionId: created.id,
        revision: 1,
        operation: accepted ? "created-and-accepted-after-playback" : "ai-proposal-created",
        actorUserId: input.actor.id,
        snapshotJson: correctionSnapshot(created),
      },
    });
    return tx.transcriptCorrection.findUnique({
      where: { id: created.id },
      include: { revisions: { orderBy: { revision: "asc" } } },
    });
  });

  return { ok: true, idempotentReplay: false, correction: publicCorrection(correction), boundaries: transcriptCorrectionBoundaries() };
}

export async function reviewTranscriptCorrectionProposal(input: {
  prisma: any;
  actor: TranscriptCorrectionActor;
  roomId: string;
  correctionId: string;
  decision: "accept" | "reject";
  expectedAcceptedCorrectionId?: string | null;
  confirmedAgainstPlayback?: boolean;
  playbackPositionSeconds?: number;
  reviewNote?: string | null;
}) {
  const correction = await input.prisma.transcriptCorrection.findFirst({
    where: { id: text(input.correctionId), room: accessibleRoomWhere(text(input.roomId), input.actor) },
    include: { segment: true, revisions: true },
  });
  if (!correction) throw new TranscriptCorrectionError("Correction proposal not found.", 404, "PROPOSAL_NOT_FOUND");
  if (correction.origin !== "ai" || correction.status !== "proposed") {
    throw new TranscriptCorrectionError("Only an unreviewed AI proposal can be decided here.", 409, "PROPOSAL_NOT_REVIEWABLE");
  }
  const evidence = await loadMutationEvidence(input.prisma, {
    roomId: correction.roomId,
    segmentId: correction.segmentId,
    actor: input.actor,
  });
  if (correction.baseTextSha256 !== sha256(evidence.segment.text) || correction.expectedText !== evidence.segment.text) {
    throw new TranscriptCorrectionError("The proposal no longer matches provider evidence.", 409, "STALE_PROVIDER_EVIDENCE");
  }
  const active = await input.prisma.transcriptCorrection.findFirst({
    where: { segmentId: correction.segmentId, status: "accepted" },
    orderBy: { updatedAt: "desc" },
    select: { id: true, correctedText: true, correctedSpeakerLabel: true },
  });
  if ((active?.id ?? null) !== (text(input.expectedAcceptedCorrectionId) || null)) {
    throw new TranscriptCorrectionError("Another accepted correction is now active. Refresh before reviewing.", 409, "STALE_CORRECTION_OVERLAY");
  }
  if (input.decision === "accept" && correctionMatchesActiveOverlay({
    providerText: evidence.segment.text,
    providerSpeakerLabel: evidence.segment.speakerLabel ?? null,
    correctedText: correction.correctedText,
    correctedSpeakerLabel: correction.correctedSpeakerLabel,
    active,
  })) {
    throw new TranscriptCorrectionError("That proposal matches the correction already in effect.", 409, "UNCHANGED_CORRECTION_OVERLAY");
  }
  const position = input.decision === "accept"
    ? assertPlaybackConfirmation({
        playback: evidence.playback,
        confirmedAgainstPlayback: input.confirmedAgainstPlayback,
        playbackPositionSeconds: input.playbackPositionSeconds,
        startSeconds: evidence.segment.startSeconds,
        endSeconds: evidence.segment.endSeconds,
      })
    : null;
  const now = new Date();
  const reviewed = await input.prisma.$transaction(async (tx: any) => {
    if (input.decision === "accept") {
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-job-packet-source:${evidence.job.id}`);
      await acquirePrismaAdvisoryTransactionLock(tx, `transcript-segment-review:${correction.segmentId}`);
    }
    const transactionActive = input.decision === "accept"
      ? await tx.transcriptCorrection.findFirst({
          where: { segmentId: correction.segmentId, status: "accepted" },
          orderBy: { updatedAt: "desc" },
          select: { id: true },
        })
      : active;
    if ((transactionActive?.id ?? null) !== (active?.id ?? null)) {
      throw new TranscriptCorrectionError("Another accepted correction won the review race. Refresh before deciding.", 409, "STALE_CORRECTION_OVERLAY");
    }
    if (input.decision === "accept" && transactionActive) {
      const superseded = await tx.transcriptCorrection.update({ where: { id: transactionActive.id }, data: { status: "superseded" } });
      const revision = await tx.transcriptCorrectionRevision.count({ where: { correctionId: transactionActive.id } });
      await tx.transcriptCorrectionRevision.create({
        data: {
          correctionId: transactionActive.id,
          revision: revision + 1,
          operation: "superseded-by-reviewed-ai-proposal",
          actorUserId: input.actor.id,
          snapshotJson: correctionSnapshot(superseded),
        },
      });
    }
    const updated = await tx.transcriptCorrection.update({
      where: { id: correction.id },
      data: {
        status: input.decision === "accept" ? "accepted" : "rejected",
        reviewedByUserId: input.actor.id,
        reviewedAt: now,
        reviewNote: text(input.reviewNote) || (input.decision === "accept"
          ? "Reviewer explicitly accepted this AI proposal against protected playback."
          : "Reviewer rejected this AI proposal."),
        provenanceJson: {
          ...object(correction.provenanceJson),
          review: {
            decision: input.decision,
            playbackConfirmed: input.decision === "accept",
            playbackPositionSeconds: position,
            reviewedAt: now.toISOString(),
          },
        },
      },
    });
    await tx.transcriptCorrectionRevision.create({
      data: {
        correctionId: correction.id,
        revision: correction.revisions.length + 1,
        operation: input.decision === "accept" ? "ai-proposal-accepted-after-playback" : "ai-proposal-rejected",
        actorUserId: input.actor.id,
        snapshotJson: correctionSnapshot(updated),
      },
    });
    return tx.transcriptCorrection.findUnique({
      where: { id: correction.id },
      include: { revisions: { orderBy: { revision: "asc" } } },
    });
  });
  return { ok: true, correction: publicCorrection(reviewed), boundaries: transcriptCorrectionBoundaries() };
}
