import "server-only";

import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";

import type { AiEditProposalSet } from "@/lib/editor/ai-edit-proposal-contract";
import {
  editReviewScope,
  isEditReviewAction,
  type EditReviewAction,
  type EditReviewSubjectKind,
  type EpisodeEditReviewReceipt,
} from "@/lib/editor/edit-review-contract";
import type { EpisodeProductionActor } from "@/lib/server/episode-production-access";

const SHA256 = /^[0-9a-f]{64}$/;
const SUBJECT_KINDS = new Set<EditReviewSubjectKind>(["proposal", "candidate", "range", "camera-switch", "proposal-set", "timeline"]);
const MAX_EVIDENCE_JSON_CHARACTERS = 16_000;

export class EpisodeEditReviewLedgerError extends Error {
  constructor(message: string, readonly status: number, readonly code: string) {
    super(message);
    this.name = "EpisodeEditReviewLedgerError";
  }
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
    .join(",")}}`;
}

function sha256(value: unknown) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function milliseconds(seconds: number) {
  return Math.round(seconds * 1_000);
}

function seconds(value: number) {
  return value / 1_000;
}

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function signalMediaIdentity(signal: unknown) {
  const row = signal && typeof signal === "object" && !Array.isArray(signal) ? signal as Record<string, unknown> : {};
  const legacyRecordingAssetId = clean(row.recordingAssetId, 200);
  const mediaAssetId = clean(row.mediaAssetId, 200) || legacyRecordingAssetId;
  const mediaAssetKind = row.mediaAssetKind === "studio-media" || row.mediaAssetKind === "capture-recording"
    ? row.mediaAssetKind
    : legacyRecordingAssetId ? "capture-recording" : null;
  return { mediaAssetId: mediaAssetId || null, mediaAssetKind };
}

function isUniqueConstraint(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

async function productionForEpisode(
  prisma: PrismaClient | Prisma.TransactionClient,
  projectId: string,
  episodeSlug: string,
) {
  const production = await prisma.studioEpisodeProduction.findUnique({
    where: { projectId_slug: { projectId, slug: episodeSlug } },
    select: { id: true },
  });
  if (!production) {
    throw new EpisodeEditReviewLedgerError(
      "Create or open the canonical episode production before generating edit evidence.",
      409,
      "EPISODE_PRODUCTION_REQUIRED",
    );
  }
  return production;
}

export async function persistEpisodeEditProposalSet(input: {
  prisma: PrismaClient;
  projectId: string;
  episodeSlug: string;
  actor: EpisodeProductionActor;
  proposalSet: AiEditProposalSet;
}) {
  const payloadSha256 = sha256(input.proposalSet);
  const signal = input.proposalSet.binding.signalEvidence;
  const mediaIdentity = signalMediaIdentity(signal);

  try {
    return await input.prisma.$transaction(async (tx) => {
      const production = await productionForEpisode(tx, input.projectId, input.episodeSlug);
      const existing = await tx.studioEpisodeEditProposalSet.findUnique({ where: { id: input.proposalSet.proposalSetId } });
      if (existing) {
        if (existing.payloadSha256 !== payloadSha256 || existing.episodeProductionId !== production.id) {
          throw new EpisodeEditReviewLedgerError("The proposal-set identity was reused with different evidence.", 409, "PROPOSAL_SET_ID_CONFLICT");
        }
        return existing;
      }

      const proposal = await tx.studioEpisodeEditProposalSet.create({
        data: {
          id: input.proposalSet.proposalSetId,
          episodeProductionId: production.id,
          createdByUserId: input.actor.id || null,
          createdByEmail: input.actor.email,
          kind: input.proposalSet.kind,
          version: input.proposalSet.version,
          providerKind: input.proposalSet.provider.kind,
          providerModel: input.proposalSet.provider.model,
          timelineFingerprintSha256: input.proposalSet.binding.timelineFingerprintSha256,
          transcriptSha256: input.proposalSet.binding.transcriptSha256,
          blockCount: input.proposalSet.binding.blockCount,
          sourceStartMilliseconds: milliseconds(input.proposalSet.binding.startSeconds),
          sourceEndMilliseconds: milliseconds(input.proposalSet.binding.endSeconds),
          mediaAssetKind: mediaIdentity.mediaAssetKind,
          mediaAssetId: mediaIdentity.mediaAssetId,
          sourceSha256: signal?.sourceSha256 ?? null,
          storageGeneration: signal?.storageGeneration ?? null,
          signalProfileSha256: signal?.signalProfileSha256 ?? null,
          payloadSha256,
          proposalJson: jsonValue(input.proposalSet),
          createdAt: new Date(input.proposalSet.createdAt),
        },
      });
      await tx.studioEpisodeEditReviewReceipt.create({
        data: {
          episodeProductionId: production.id,
          proposalSetId: proposal.id,
          actorUserId: input.actor.id || null,
          actorEmail: input.actor.email,
          clientRequestId: `proposal-created:${proposal.id}`,
          action: "PROPOSAL_CREATED",
          scope: "REVIEW_ONLY",
          subjectId: proposal.id,
          subjectKind: "proposal-set",
          sourceStartMilliseconds: proposal.sourceStartMilliseconds,
          sourceEndMilliseconds: proposal.sourceEndMilliseconds,
          proposalTimelineFingerprintSha256: proposal.timelineFingerprintSha256,
          timelineFingerprintBeforeSha256: proposal.timelineFingerprintSha256,
          transcriptSha256: proposal.transcriptSha256,
          sourceSha256: proposal.sourceSha256,
          storageGeneration: proposal.storageGeneration,
          signalProfileSha256: proposal.signalProfileSha256,
          requestSha256: payloadSha256,
          evidenceJson: jsonValue({
            provider: input.proposalSet.provider,
            proposalCount: input.proposalSet.proposals.length,
            reviewCandidateCount: input.proposalSet.reviewCandidates.length,
            sourceMediaUnchanged: true,
          }),
          occurredAt: new Date(input.proposalSet.createdAt),
        },
      });
      return proposal;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof EpisodeEditReviewLedgerError) throw error;
    if (isUniqueConstraint(error)) {
      const replay = await input.prisma.studioEpisodeEditProposalSet.findUnique({ where: { id: input.proposalSet.proposalSetId } });
      if (replay?.payloadSha256 === payloadSha256) return replay;
    }
    throw error;
  }
}

export type AppendEpisodeEditReviewInput = {
  clientRequestId: string;
  proposalSetId: string;
  action: EditReviewAction;
  subjectId: string;
  subjectKind: EditReviewSubjectKind;
  sourceRange: { startSeconds: number; endSeconds: number };
  proposalTimelineFingerprintSha256: string;
  timelineFingerprintBeforeSha256: string;
  timelineFingerprintAfterSha256?: string | null;
  evidence?: Record<string, unknown>;
  occurredAt?: string;
};

function validateReviewInput(input: AppendEpisodeEditReviewInput) {
  const clientRequestId = clean(input.clientRequestId, 160).toLowerCase();
  const proposalSetId = clean(input.proposalSetId, 200);
  const subjectId = clean(input.subjectId, 200);
  const subjectKind = clean(input.subjectKind, 40) as EditReviewSubjectKind;
  const start = input.sourceRange?.startSeconds;
  const end = input.sourceRange?.endSeconds;
  const occurredAt = input.occurredAt ? new Date(input.occurredAt) : new Date();
  if (!clientRequestId || !proposalSetId || !subjectId || !SUBJECT_KINDS.has(subjectKind) || !isEditReviewAction(input.action)) {
    throw new EpisodeEditReviewLedgerError("A stable request, proposal set, subject, and supported review action are required.", 400, "INVALID_EDIT_REVIEW");
  }
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start || end > 86_400) {
    throw new EpisodeEditReviewLedgerError("The reviewed source range is invalid.", 400, "INVALID_EDIT_REVIEW_RANGE");
  }
  if (!SHA256.test(input.proposalTimelineFingerprintSha256) || !SHA256.test(input.timelineFingerprintBeforeSha256) || (input.timelineFingerprintAfterSha256 && !SHA256.test(input.timelineFingerprintAfterSha256))) {
    throw new EpisodeEditReviewLedgerError("Review actions require exact SHA-256 timeline bindings.", 400, "INVALID_EDIT_REVIEW_BINDING");
  }
  if (Number.isNaN(occurredAt.getTime()) || Math.abs(Date.now() - occurredAt.getTime()) > 24 * 60 * 60 * 1_000) {
    throw new EpisodeEditReviewLedgerError("The review timestamp is outside the accepted clock window.", 400, "INVALID_EDIT_REVIEW_TIME");
  }
  if (stableJson(input.evidence ?? {}).length > MAX_EVIDENCE_JSON_CHARACTERS) {
    throw new EpisodeEditReviewLedgerError("Edit review evidence is too large.", 413, "EDIT_REVIEW_EVIDENCE_TOO_LARGE");
  }
  return { clientRequestId, proposalSetId, subjectId, subjectKind, start, end, occurredAt };
}

function validateProposalSubject(
  proposalJson: Prisma.JsonValue,
  action: EditReviewAction,
  subjectKind: EditReviewSubjectKind,
  subjectId: string,
  startSeconds: number,
  endSeconds: number,
  evidence: Record<string, unknown> | undefined,
) {
  const proposalSet = proposalJson as unknown as AiEditProposalSet;
  if (subjectKind === "proposal-set") {
    if (
      subjectId !== proposalSet.proposalSetId
      || milliseconds(proposalSet.binding.startSeconds) !== milliseconds(startSeconds)
      || milliseconds(proposalSet.binding.endSeconds) !== milliseconds(endSeconds)
    ) {
      throw new EpisodeEditReviewLedgerError("The reviewed proposal-set range does not match its canonical binding.", 409, "EDIT_REVIEW_SUBJECT_RANGE_CONFLICT");
    }
    return;
  }
  if (subjectKind === "camera-switch") {
    if (
      !subjectId.startsWith("camera-switch:")
      || evidence?.editKind !== "deterministic-speaker-camera-cut"
      || evidence?.sourceMediaUnchanged !== true
      || typeof evidence?.targetClipId !== "string"
      || startSeconds < proposalSet.binding.startSeconds - 0.001
      || endSeconds > proposalSet.binding.endSeconds + 0.001
    ) {
      throw new EpisodeEditReviewLedgerError("The camera-switch review is not safely bound inside this proposal set.", 409, "EDIT_REVIEW_CAMERA_SWITCH_CONFLICT");
    }
    return;
  }
  const subject = subjectKind === "proposal"
    ? proposalSet.proposals?.find((item) => item.proposalId === subjectId)
    : subjectKind === "candidate"
      ? proposalSet.reviewCandidates?.find((item) => item.candidateId === subjectId)
      : null;
  if (!subject) {
    throw new EpisodeEditReviewLedgerError("The reviewed subject is not part of this proposal set.", 404, "EDIT_REVIEW_SUBJECT_NOT_FOUND");
  }
  if (
    milliseconds(subject.sourceRange.startSeconds) !== milliseconds(startSeconds)
    || milliseconds(subject.sourceRange.endSeconds) !== milliseconds(endSeconds)
  ) {
    throw new EpisodeEditReviewLedgerError("The reviewed source range does not match the canonical proposal subject.", 409, "EDIT_REVIEW_SUBJECT_RANGE_CONFLICT");
  }
  const audioSignal = subject.evidence?.audioSignal;
  const audioObservation = subject.evidence?.audioObservation;
  if (action === "PROOF_LISTENED" && (audioSignal || audioObservation)) {
    const binding = proposalSet.binding.signalEvidence;
    const bindingIdentity = signalMediaIdentity(binding);
    const evidenceIdentity = signalMediaIdentity(evidence);
    const playbackPositionSeconds = evidence?.playbackPositionSeconds;
    if (
      evidence?.protectedPlayback !== true
      || !binding?.protectedPlaybackSourceId
      || evidenceIdentity.mediaAssetKind !== bindingIdentity.mediaAssetKind
      || evidenceIdentity.mediaAssetId !== bindingIdentity.mediaAssetId
      || evidence?.protectedPlaybackSourceId !== binding.protectedPlaybackSourceId
      || evidence?.sourceSha256 !== binding.sourceSha256
      || evidence?.signalProfileSha256 !== binding.signalProfileSha256
      || typeof playbackPositionSeconds !== "number"
      || !Number.isFinite(playbackPositionSeconds)
      || playbackPositionSeconds < subject.sourceRange.startSeconds
      || playbackPositionSeconds >= subject.sourceRange.endSeconds
    ) {
      throw new EpisodeEditReviewLedgerError(
        "Signal-bound proof-listen requires playback from the exact protected media asset inside the reviewed range.",
        409,
        "EDIT_REVIEW_PROTECTED_PLAYBACK_REQUIRED",
      );
    }
  }
}

export async function appendEpisodeEditReviewReceipt(input: {
  prisma: PrismaClient;
  projectId: string;
  episodeSlug: string;
  actor: EpisodeProductionActor;
  review: AppendEpisodeEditReviewInput;
}) {
  const valid = validateReviewInput(input.review);
  const requestPayload = {
    ...input.review,
    clientRequestId: valid.clientRequestId,
    proposalSetId: valid.proposalSetId,
    subjectId: valid.subjectId,
    subjectKind: valid.subjectKind,
    occurredAt: valid.occurredAt.toISOString(),
  };
  const requestSha256 = sha256(requestPayload);

  try {
    return await input.prisma.$transaction(async (tx) => {
      const production = await productionForEpisode(tx, input.projectId, input.episodeSlug);
      const proposal = await tx.studioEpisodeEditProposalSet.findUnique({ where: { id: valid.proposalSetId } });
      if (!proposal || proposal.episodeProductionId !== production.id) {
        throw new EpisodeEditReviewLedgerError("The proposal set is not part of this authorized episode.", 404, "EDIT_PROPOSAL_SET_NOT_FOUND");
      }
      if (proposal.timelineFingerprintSha256 !== input.review.proposalTimelineFingerprintSha256) {
        throw new EpisodeEditReviewLedgerError("This review action is bound to a different timeline revision.", 409, "STALE_EDIT_REVIEW_BINDING");
      }
      validateProposalSubject(proposal.proposalJson, input.review.action, valid.subjectKind, valid.subjectId, valid.start, valid.end, input.review.evidence);
      const existing = await tx.studioEpisodeEditReviewReceipt.findUnique({
        where: {
          episodeProductionId_actorEmail_clientRequestId: {
            episodeProductionId: production.id,
            actorEmail: input.actor.email,
            clientRequestId: valid.clientRequestId,
          },
        },
      });
      if (existing) {
        if (existing.requestSha256 !== requestSha256) {
          throw new EpisodeEditReviewLedgerError("The client request ID was already used for a different review action.", 409, "EDIT_REVIEW_IDEMPOTENCY_CONFLICT");
        }
        return existing;
      }
      return tx.studioEpisodeEditReviewReceipt.create({
        data: {
          episodeProductionId: production.id,
          proposalSetId: proposal.id,
          actorUserId: input.actor.id || null,
          actorEmail: input.actor.email,
          clientRequestId: valid.clientRequestId,
          action: input.review.action,
          scope: editReviewScope(input.review.action),
          subjectId: valid.subjectId,
          subjectKind: valid.subjectKind,
          sourceStartMilliseconds: milliseconds(valid.start),
          sourceEndMilliseconds: milliseconds(valid.end),
          proposalTimelineFingerprintSha256: input.review.proposalTimelineFingerprintSha256,
          timelineFingerprintBeforeSha256: input.review.timelineFingerprintBeforeSha256,
          timelineFingerprintAfterSha256: input.review.timelineFingerprintAfterSha256 || null,
          transcriptSha256: proposal.transcriptSha256,
          sourceSha256: proposal.sourceSha256,
          storageGeneration: proposal.storageGeneration,
          signalProfileSha256: proposal.signalProfileSha256,
          requestSha256,
          evidenceJson: jsonValue({
            ...(input.review.evidence ?? {}),
            sourceMediaUnchanged: true,
            canonicalTimelineChanged: false,
          }),
          occurredAt: valid.occurredAt,
        },
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  } catch (error) {
    if (error instanceof EpisodeEditReviewLedgerError) throw error;
    if (isUniqueConstraint(error)) {
      const production = await productionForEpisode(input.prisma, input.projectId, input.episodeSlug);
      const replay = await input.prisma.studioEpisodeEditReviewReceipt.findUnique({
        where: { episodeProductionId_actorEmail_clientRequestId: { episodeProductionId: production.id, actorEmail: input.actor.email, clientRequestId: valid.clientRequestId } },
      });
      if (replay?.requestSha256 === requestSha256) return replay;
      throw new EpisodeEditReviewLedgerError("The client request ID was already used for a different review action.", 409, "EDIT_REVIEW_IDEMPOTENCY_CONFLICT");
    }
    throw error;
  }
}

function receiptDto(receipt: {
  id: string;
  proposalSetId: string | null;
  actorEmail: string;
  action: string;
  scope: string;
  subjectId: string | null;
  subjectKind: string | null;
  sourceStartMilliseconds: number | null;
  sourceEndMilliseconds: number | null;
  proposalTimelineFingerprintSha256: string;
  timelineFingerprintBeforeSha256: string;
  timelineFingerprintAfterSha256: string | null;
  transcriptSha256: string | null;
  sourceSha256: string | null;
  storageGeneration: string | null;
  signalProfileSha256: string | null;
  evidenceJson: unknown;
  occurredAt: Date;
  createdAt: Date;
}): EpisodeEditReviewReceipt {
  return {
    ...receipt,
    action: receipt.action as EpisodeEditReviewReceipt["action"],
    scope: receipt.scope as EpisodeEditReviewReceipt["scope"],
    sourceRange: receipt.sourceStartMilliseconds === null || receipt.sourceEndMilliseconds === null
      ? null
      : { startSeconds: seconds(receipt.sourceStartMilliseconds), endSeconds: seconds(receipt.sourceEndMilliseconds) },
    evidence: (receipt.evidenceJson && typeof receipt.evidenceJson === "object" && !Array.isArray(receipt.evidenceJson)
      ? receipt.evidenceJson
      : {}) as Record<string, unknown>,
    occurredAt: receipt.occurredAt.toISOString(),
    createdAt: receipt.createdAt.toISOString(),
  };
}

export async function listEpisodeEditReviewLedger(input: {
  prisma: PrismaClient;
  projectId: string;
  episodeSlug: string;
  limit?: number;
}) {
  const production = await productionForEpisode(input.prisma, input.projectId, input.episodeSlug);
  const [proposalSets, receipts] = await Promise.all([
    input.prisma.studioEpisodeEditProposalSet.findMany({
      where: { episodeProductionId: production.id },
      orderBy: { createdAt: "desc" },
      take: Math.min(50, Math.max(1, input.limit ?? 20)),
    }),
    input.prisma.studioEpisodeEditReviewReceipt.findMany({
      where: { episodeProductionId: production.id },
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: Math.min(500, Math.max(1, (input.limit ?? 20) * 10)),
    }),
  ]);
  return {
    productionId: production.id,
    proposalSets: proposalSets.map((proposal) => ({
      proposalSet: proposal.proposalJson as unknown as AiEditProposalSet,
      payloadSha256: proposal.payloadSha256,
      createdByEmail: proposal.createdByEmail,
      createdAt: proposal.createdAt.toISOString(),
    })),
    receipts: receipts.map(receiptDto),
  };
}

export function publicEpisodeEditReviewReceipt(receipt: Parameters<typeof receiptDto>[0]) {
  return receiptDto(receipt);
}

export async function appendEpisodeTimelineSavedReceipt(input: {
  prisma: Prisma.TransactionClient;
  episodeProductionId: string;
  actor: EpisodeProductionActor;
  clientRequestId: string;
  timelineFingerprintBeforeSha256: string;
  timelineFingerprintAfterSha256: string;
  linkedReviewReceiptIds: string[];
  saveMode: "manual" | "auto";
  occurredAt: Date;
}) {
  const clientRequestId = clean(input.clientRequestId, 160).toLowerCase();
  const linkedReviewReceiptIds = Array.from(new Set(input.linkedReviewReceiptIds.map((id) => clean(id, 200)).filter(Boolean))).slice(0, 200);
  if (!clientRequestId || !SHA256.test(input.timelineFingerprintBeforeSha256) || !SHA256.test(input.timelineFingerprintAfterSha256)) {
    throw new EpisodeEditReviewLedgerError("Canonical timeline saves require a stable request and exact before/after SHA-256 bindings.", 400, "INVALID_TIMELINE_SAVE_RECEIPT");
  }
  const linked = linkedReviewReceiptIds.length
    ? await input.prisma.studioEpisodeEditReviewReceipt.findMany({
      where: {
        id: { in: linkedReviewReceiptIds },
        episodeProductionId: input.episodeProductionId,
        actorEmail: input.actor.email,
        scope: "LOCAL_DRAFT",
      },
      select: { id: true },
    })
    : [];
  if (linked.length !== linkedReviewReceiptIds.length) {
    throw new EpisodeEditReviewLedgerError("One or more draft-action receipts do not belong to this actor and episode.", 409, "TIMELINE_SAVE_RECEIPT_LINK_CONFLICT");
  }
  const evidence = {
    linkedReviewReceiptIds,
    saveMode: input.saveMode,
    sourceMediaUnchanged: true,
    canonicalTimelineChanged: input.timelineFingerprintBeforeSha256 !== input.timelineFingerprintAfterSha256,
  };
  const requestSha256 = sha256({
    clientRequestId,
    timelineFingerprintBeforeSha256: input.timelineFingerprintBeforeSha256,
    timelineFingerprintAfterSha256: input.timelineFingerprintAfterSha256,
    evidence,
  });
  const existing = await input.prisma.studioEpisodeEditReviewReceipt.findUnique({
    where: {
      episodeProductionId_actorEmail_clientRequestId: {
        episodeProductionId: input.episodeProductionId,
        actorEmail: input.actor.email,
        clientRequestId,
      },
    },
  });
  if (existing) {
    if (existing.requestSha256 !== requestSha256) {
      throw new EpisodeEditReviewLedgerError("The timeline-save request ID was reused with different state.", 409, "TIMELINE_SAVE_IDEMPOTENCY_CONFLICT");
    }
    return existing;
  }
  return input.prisma.studioEpisodeEditReviewReceipt.create({
    data: {
      episodeProductionId: input.episodeProductionId,
      proposalSetId: null,
      actorUserId: input.actor.id || null,
      actorEmail: input.actor.email,
      clientRequestId,
      action: "TIMELINE_SAVED",
      scope: "CANONICAL_TIMELINE",
      subjectId: input.episodeProductionId,
      subjectKind: "timeline",
      proposalTimelineFingerprintSha256: input.timelineFingerprintBeforeSha256,
      timelineFingerprintBeforeSha256: input.timelineFingerprintBeforeSha256,
      timelineFingerprintAfterSha256: input.timelineFingerprintAfterSha256,
      requestSha256,
      evidenceJson: jsonValue(evidence),
      occurredAt: input.occurredAt,
    },
  });
}
