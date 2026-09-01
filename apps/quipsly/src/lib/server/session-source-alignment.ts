import "server-only";

import { createHash, randomUUID } from "node:crypto";
import path from "node:path";
import type { Prisma } from "@prisma/client";
import {
  buildAudioAlignmentCloudManifestObjectName,
  buildAudioAlignmentCloudResultObjectName,
  newSessionAudioAlignmentJob,
  parseAudioAlignmentCloudManifest,
  parseAudioAlignmentResult,
  parseSessionAudioAlignmentJob,
  type AudioAlignmentEvidence,
  type AudioMasterySourceBinding,
  type SessionAudioAlignmentJob,
} from "@high-ground/quipsly-media-processing";

import { getMediaBucket } from "@/lib/server/gcs";
import {
  sessionMutationActorAccessWhere,
  sessionActorAccessWhere,
} from "@/lib/server/session-access";
import { ensureSessionAudioSourceAlignmentCloudQueued } from "@/lib/server/audio-source-alignment-cloud";
import { MOBILE_CAPTURE_LOCAL_VAULT_BUCKET } from "@/lib/server/mobile-capture-local-vault";
import {
  sessionProviderReferenceBinding,
  type SessionProviderReferenceBinding,
} from "@/lib/server/session-provider-reference";
import {
  sessionProtectedPlaybackBinding,
  type SessionProtectedPlaybackBinding,
} from "@/lib/server/session-protected-playback";

const STATUS = [
  "queued",
  "processing",
  "output-ready",
  "completed",
  "failed",
] as const;

export class SessionSourceAlignmentError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "SessionSourceAlignmentError";
  }
}

export type SessionSourceAlignmentPlan = {
  captureGroupId: string;
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  clockAuthority: "capture-clock-proposal" | "reported-wall-clock-fallback";
  initialOffsetSeconds: number;
  overlapStartSeconds: number;
  overlapEndSeconds: number;
  proposal: SessionAudioAlignmentJob["proposal"];
  boundaries: {
    exactSourceBytesBound: true;
    sourceTimesMutated: false;
    sampleAccurateClaimed: false;
    resultIsReviewEvidenceOnly: true;
  };
};

export type SessionSourceAlignmentSuggestion =
  | {
      status: "ready";
      generatedAutomatically: true;
      acousticAnalysisStarted: false;
      spineRecordingAssetId: string;
      targetRecordingAssetId: string;
      clockAuthority: SessionSourceAlignmentPlan["clockAuthority"];
      initialOffsetSeconds: number;
      overlapStartSeconds: number;
      overlapEndSeconds: number;
      searchRadiusSeconds: number;
      sharedReference: null | {
        recordingAssetId: string;
        mode: "audio-reference" | "video-composite";
        targets: Array<{
          recordingAssetId: string;
          initialOffsetSeconds: number;
          overlapStartSeconds: number;
          overlapEndSeconds: number;
          searchRadiusSeconds: number;
          processorCompatible: boolean;
        }>;
        boundaries: SessionProviderReferenceBinding["boundaries"];
      };
      boundaries: SessionSourceAlignmentPlan["boundaries"];
    }
  | {
      status: "waiting";
      generatedAutomatically: true;
      acousticAnalysisStarted: false;
      code: string;
      reason: string;
    };

export type PublicSessionSourceAlignment = {
  jobId: string;
  status:
    | "queued"
    | "processing"
    | "output-ready"
    | "completed"
    | "blocked"
    | "failed";
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  clockAuthority: SessionSourceAlignmentPlan["clockAuthority"] | null;
  evidence: AudioAlignmentEvidence | null;
  error: string | null;
  updatedAt: string | null;
  decision: null | {
    revision: number;
    status: "approved" | "revoked";
    signedOffsetSeconds: number;
    targetTimelineStartSeconds: number;
    targetSourceTrimSeconds: number;
    residualDriftMilliseconds: number;
    resultSha256: string;
    reason: string | null;
    decidedAt: string;
  };
  boundaries: {
    exactSourceBytesBound: true;
    sourceBytesImmutable: true;
    sourceTimesMutated: false;
    analyzerPlacementApplied: false;
    reviewedPlacementActive: boolean;
    placementRequiresSeparateReview: boolean;
    sampleAccurateClaimed: false;
  };
};

type Actor = {
  id: string;
  email?: string | null;
  primaryEmail?: string | null;
  isStaff?: boolean;
};

type Candidate = {
  id: string;
  roomId: string;
  durationSeconds: number | null;
  recordedStartedAt: Date | string | null;
  localManifestJson: unknown;
  playback?: SessionProtectedPlaybackBinding | null;
  processorBinding?: AudioMasterySourceBinding | null;
  providerReference?: SessionProviderReferenceBinding | null;
};

export function buildSessionSourceAlignmentPlan(input: {
  captureGroupId: string;
  spine: Candidate;
  target: Candidate;
}): SessionSourceAlignmentPlan {
  if (input.spine.id === input.target.id) {
    throw new SessionSourceAlignmentError(
      400,
      "ALIGNMENT_SOURCES_IDENTICAL",
      "Choose two different participant recordings.",
    );
  }
  if (input.spine.roomId !== input.target.roomId) {
    throw new SessionSourceAlignmentError(
      409,
      "ALIGNMENT_ROOM_MISMATCH",
      "Both recordings must belong to the same private Session.",
    );
  }
  const spineDuration = positive(input.spine.durationSeconds);
  const targetDuration = positive(input.target.durationSeconds);
  if (spineDuration === null || targetDuration === null) {
    throw new SessionSourceAlignmentError(
      409,
      "ALIGNMENT_DURATION_REQUIRED",
      "Both verified recordings need measured duration before waveform alignment.",
    );
  }
  const spineClock = captureClock(
    input.spine.localManifestJson,
    input.captureGroupId,
  );
  const targetClock = captureClock(
    input.target.localManifestJson,
    input.captureGroupId,
  );
  const spineWall = dateMilliseconds(input.spine.recordedStartedAt);
  const targetWall = dateMilliseconds(input.target.recordedStartedAt);
  const clockAuthority =
    spineClock !== null && targetClock !== null
      ? ("capture-clock-proposal" as const)
      : ("reported-wall-clock-fallback" as const);
  const spineStart = spineClock?.startedAtMilliseconds ?? spineWall;
  const targetStart = targetClock?.startedAtMilliseconds ?? targetWall;
  if (spineStart === null || targetStart === null) {
    throw new SessionSourceAlignmentError(
      409,
      "ALIGNMENT_CLOCK_REQUIRED",
      "The Session needs a capture-clock proposal or retained source start times before correlation.",
    );
  }

  // For a target window at t, the matching spine window is expected at
  // t + initialOffset. A positive value means the target began later.
  const initialOffsetSeconds = rounded((targetStart - spineStart) / 1_000);
  const windowSeconds = Math.min(
    6,
    Math.max(2, Math.floor(Math.min(spineDuration, targetDuration) / 6)),
  );
  const uncertaintyMilliseconds = Math.max(
    spineClock?.uncertaintyMilliseconds ?? 1_000,
    targetClock?.uncertaintyMilliseconds ?? 1_000,
  );
  const searchRadiusSeconds = rounded(
    Math.min(30, Math.max(1, uncertaintyMilliseconds / 1_000 + 0.75)),
  );
  const overlapStartSeconds = Math.max(0, -initialOffsetSeconds);
  const overlapEndSeconds = Math.min(
    targetDuration,
    spineDuration - initialOffsetSeconds,
  );
  const usableStart =
    overlapStartSeconds +
    Math.min(1, Math.max(0, (overlapEndSeconds - overlapStartSeconds) / 20));
  const usableEnd = overlapEndSeconds - windowSeconds;
  if (usableEnd - usableStart < Math.max(2, windowSeconds / 2)) {
    throw new SessionSourceAlignmentError(
      409,
      "ALIGNMENT_OVERLAP_TOO_SHORT",
      "The retained sources do not share enough verified duration for two separated waveform checks.",
    );
  }
  const openingTargetSeconds = rounded(usableStart);
  const laterTargetSeconds = rounded(
    Math.max(
      openingTargetSeconds + Math.max(2, windowSeconds / 2),
      usableEnd - Math.min(1, Math.max(0, (usableEnd - usableStart) / 20)),
    ),
  );
  return {
    captureGroupId: input.captureGroupId,
    spineRecordingAssetId: input.spine.id,
    targetRecordingAssetId: input.target.id,
    clockAuthority,
    initialOffsetSeconds,
    overlapStartSeconds: rounded(overlapStartSeconds),
    overlapEndSeconds: rounded(overlapEndSeconds),
    proposal: {
      initialOffsetSeconds,
      openingTargetSeconds,
      laterTargetSeconds,
      windowSeconds,
      searchRadiusSeconds,
      sampleRate: 12_000,
      minimumCorrelation: 0.78,
      minimumPeakMargin: 0.04,
    },
    boundaries: {
      exactSourceBytesBound: true,
      sourceTimesMutated: false,
      sampleAccurateClaimed: false,
      resultIsReviewEvidenceOnly: true,
    },
  };
}

export async function readSessionSourceAlignments(input: {
  prisma: any;
  roomId: string;
  actor: Actor;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: { id: input.roomId, ...sessionActorAccessWhere(input.actor) },
    select: { id: true, captureGroupId: true },
  });
  if (!room)
    throw new SessionSourceAlignmentError(
      404,
      "SESSION_NOT_FOUND",
      "This private Session is unavailable to this account.",
    );
  const rows = await input.prisma.sessionAudioAlignmentJob.findMany({
    where: { roomId: room.id },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 50,
    include: {
      decisions: {
        orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });
  return {
    captureGroupId: room.captureGroupId,
    suggestion: await suggestSessionSourceAlignment({
      prisma: input.prisma,
      room,
    }),
    alignments: rows.map(publicStatus),
    boundaries: readBoundaries(),
  };
}

export async function suggestSessionSourceAlignment(input: {
  prisma: any;
  room: { id: string; captureGroupId: string };
}): Promise<SessionSourceAlignmentSuggestion> {
  const [assets, providerAssets] = await Promise.all([
    input.prisma.recordingAsset.findMany({
      where: {
        roomId: input.room.id,
        kind: "LOCAL_AUDIO",
        status: "VERIFIED",
        participantId: { not: null },
        durationSeconds: { gt: 0 },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        createdAt: true,
        roomId: true,
        participantId: true,
        durationSeconds: true,
        recordedStartedAt: true,
        localManifestJson: true,
        status: true,
        contentType: true,
        byteSize: true,
        checksum: true,
        storageBucket: true,
        storageObjectPath: true,
        verifiedAt: true,
        participant: { select: { role: true } },
      },
    }),
    input.prisma.recordingAsset.findMany({
      where: {
        roomId: input.room.id,
        kind: "SERVER_MIX",
        status: "VERIFIED",
        durationSeconds: { gt: 0 },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        roomId: true,
        kind: true,
        status: true,
        durationSeconds: true,
        recordedStartedAt: true,
        localManifestJson: true,
        contentType: true,
        byteSize: true,
        checksum: true,
        storageBucket: true,
        storageObjectPath: true,
        verifiedAt: true,
      },
    }),
  ]);
  const receipts = assets.length
    ? await input.prisma.mobileCaptureFinalizationReceipt.findMany({
        where: {
          recordingAssetId: { in: assets.map((asset: any) => asset.id) },
          processingDisposition: "RELEASED",
        },
        orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
      })
    : [];
  const playable = assets.flatMap((asset: any) => {
    const receipt = receipts.find(
      (candidate: any) => candidate.recordingAssetId === asset.id,
    );
    const playback = sessionProtectedPlaybackBinding({
      roomId: input.room.id,
      asset,
      receipt,
    });
    const manifest = object(asset.localManifestJson);
    const sourceCaptureGroupId =
      text(manifest.captureGroupId) ||
      text(object(manifest.alignment).captureGroupId);
    return playback && sourceCaptureGroupId === input.room.captureGroupId
      ? [{ ...asset, playback }]
      : [];
  });
  const rolePriority = new Map([
    ["HOST", 0],
    ["COACH", 1],
    ["PRODUCER", 2],
    ["GUEST", 3],
    ["CLIENT", 4],
  ]);
  const orderedPlayable = [...playable].sort((left: any, right: any) => {
    const leftPriority = rolePriority.get(text(left.participant?.role)) ?? 99;
    const rightPriority = rolePriority.get(text(right.participant?.role)) ?? 99;
    return (
      leftPriority - rightPriority ||
      (dateMilliseconds(right.createdAt) ?? 0) -
        (dateMilliseconds(left.createdAt) ?? 0) ||
      left.id.localeCompare(right.id)
    );
  });
  const participantIds = new Set(
    orderedPlayable
      .map((candidate: any) => text(candidate.participantId))
      .filter(Boolean),
  );
  const sharedReferenceBinding =
    providerAssets
      .map((asset: any) => ({
        asset,
        binding: sessionProviderReferenceBinding({
          roomId: input.room.id,
          captureGroupId: input.room.captureGroupId,
          asset,
        }),
      }))
      .find((candidate: any) => candidate.binding)?.binding ?? null;
  if (participantIds.size < 2) {
    return {
      status: "waiting",
      generatedAutomatically: true,
      acousticAnalysisStarted: false,
      code: "ALIGNMENT_TWO_PARTICIPANTS_REQUIRED",
      reason:
        "Two released, verified participant recordings from this take are needed before Quipsly can estimate their shared clock.",
    };
  }
  try {
    const viablePlans = [] as Array<{
      plan: SessionSourceAlignmentPlan;
      recency: number;
    }>;
    let firstPlanError: SessionSourceAlignmentError | null = null;
    for (
      let leftIndex = 0;
      leftIndex < orderedPlayable.length;
      leftIndex += 1
    ) {
      for (
        let rightIndex = leftIndex + 1;
        rightIndex < orderedPlayable.length;
        rightIndex += 1
      ) {
        const left = orderedPlayable[leftIndex];
        const right = orderedPlayable[rightIndex];
        if (
          text(left.participantId) === text(right.participantId) ||
          !text(left.participantId) ||
          !text(right.participantId)
        )
          continue;
        const ordered = [left, right].sort((a: any, b: any) => {
          const aPriority = rolePriority.get(text(a.participant?.role)) ?? 99;
          const bPriority = rolePriority.get(text(b.participant?.role)) ?? 99;
          return aPriority - bPriority || a.id.localeCompare(b.id);
        });
        try {
          viablePlans.push({
            plan: buildSessionSourceAlignmentPlan({
              captureGroupId: input.room.captureGroupId,
              spine: ordered[0],
              target: ordered[1],
            }),
            // Prefer a coherent recent pair, not a new segment accidentally
            // paired with an old participant take. The older member is the
            // limiting recency for a two-source take.
            recency: Math.min(
              dateMilliseconds(left.createdAt) ?? 0,
              dateMilliseconds(right.createdAt) ?? 0,
            ),
          });
        } catch (error) {
          if (error instanceof SessionSourceAlignmentError && !firstPlanError)
            firstPlanError = error;
          else if (!(error instanceof SessionSourceAlignmentError)) throw error;
        }
      }
    }
    viablePlans.sort((left, right) => {
      const leftOverlap =
        left.plan.overlapEndSeconds - left.plan.overlapStartSeconds;
      const rightOverlap =
        right.plan.overlapEndSeconds - right.plan.overlapStartSeconds;
      return right.recency - left.recency || rightOverlap - leftOverlap;
    });
    const plan = viablePlans[0]?.plan;
    if (!plan)
      throw (
        firstPlanError ??
        new SessionSourceAlignmentError(
          409,
          "ALIGNMENT_TWO_PARTICIPANTS_REQUIRED",
          "Two participant recordings with shared verified time are needed before Quipsly can estimate their shared clock.",
        )
      );
    const sharedReference = sharedReferenceBinding
      ? buildSharedReferenceSuggestion(
          input.room.captureGroupId,
          sharedReferenceBinding,
          orderedPlayable,
        )
      : null;
    return {
      status: "ready",
      generatedAutomatically: true,
      acousticAnalysisStarted: false,
      spineRecordingAssetId: plan.spineRecordingAssetId,
      targetRecordingAssetId: plan.targetRecordingAssetId,
      clockAuthority: plan.clockAuthority,
      initialOffsetSeconds: plan.initialOffsetSeconds,
      overlapStartSeconds: plan.overlapStartSeconds,
      overlapEndSeconds: plan.overlapEndSeconds,
      searchRadiusSeconds: plan.proposal.searchRadiusSeconds,
      sharedReference,
      boundaries: plan.boundaries,
    };
  } catch (error) {
    if (error instanceof SessionSourceAlignmentError) {
      return {
        status: "waiting",
        generatedAutomatically: true,
        acousticAnalysisStarted: false,
        code: error.code,
        reason: error.message,
      };
    }
    throw error;
  }
}

function buildSharedReferenceSuggestion(
  captureGroupId: string,
  reference: SessionProviderReferenceBinding,
  participants: Candidate[],
): Extract<
  SessionSourceAlignmentSuggestion,
  { status: "ready" }
>["sharedReference"] {
  const spine: Candidate = {
    id: reference.source.assetId,
    roomId: reference.roomId,
    durationSeconds: reference.durationSeconds,
    recordedStartedAt: reference.recordedStartedAt,
    localManifestJson: { captureGroupId },
    playback: null,
    processorBinding: reference.source,
    providerReference: reference,
  };
  const targets = participants.flatMap((target) => {
    try {
      const plan = buildSessionSourceAlignmentPlan({
        captureGroupId,
        spine,
        target,
      });
      return [
        {
          recordingAssetId: target.id,
          initialOffsetSeconds: plan.initialOffsetSeconds,
          overlapStartSeconds: plan.overlapStartSeconds,
          overlapEndSeconds: plan.overlapEndSeconds,
          searchRadiusSeconds: plan.proposal.searchRadiusSeconds,
          processorCompatible:
            reference.source.provider === sourceBinding(target).provider,
        },
      ];
    } catch {
      return [];
    }
  });
  if (!targets.length) return null;
  return {
    recordingAssetId: reference.source.assetId,
    mode: reference.mode,
    targets,
    boundaries: reference.boundaries,
  };
}

export async function decideSessionSourceAlignment(input: {
  prisma: any;
  roomId: string;
  jobId: string;
  requestId: string;
  expectedRevision: number;
  operation: "APPROVE" | "REVOKE";
  reason?: string | null;
  actor: Actor;
}) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      input.requestId,
    )
  ) {
    throw new SessionSourceAlignmentError(
      400,
      "ALIGNMENT_REQUEST_ID_REQUIRED",
      "A stable request identity is required for this placement decision.",
    );
  }
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  ) {
    throw new SessionSourceAlignmentError(
      400,
      "ALIGNMENT_REVISION_REQUIRED",
      "Refresh the current placement decision before changing it.",
    );
  }
  const reason = text(input.reason).slice(0, 2_000) || null;
  const requestSha256 = hashJson({
    roomId: input.roomId,
    alignmentJobId: input.jobId,
    actorUserId: input.actor.id,
    operation: input.operation,
    expectedRevision: input.expectedRevision,
    reason,
  });
  try {
    return await input.prisma.$transaction(
      async (transaction: any) => {
        const room = await transaction.callRoom.findFirst({
          where: {
            id: input.roomId,
            ...sessionMutationActorAccessWhere(input.actor),
          },
          select: { id: true },
        });
        if (!room)
          throw new SessionSourceAlignmentError(
            404,
            "SESSION_NOT_FOUND",
            "This private Session is unavailable to this account.",
          );
        const jobRow = await transaction.sessionAudioAlignmentJob.findFirst({
          where: { id: input.jobId, roomId: room.id },
          include: {
            decisions: {
              orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
              take: 1,
            },
          },
        });
        if (!jobRow)
          throw new SessionSourceAlignmentError(
            404,
            "ALIGNMENT_NOT_FOUND",
            "That Session alignment job is unavailable.",
          );
        const existingRequest =
          await transaction.sessionAudioAlignmentDecisionReceipt.findUnique({
            where: { requestId: input.requestId },
          });
        if (existingRequest) {
          if (existingRequest.requestSha256 !== requestSha256) {
            throw new SessionSourceAlignmentError(
              409,
              "ALIGNMENT_REQUEST_CONFLICT",
              "That request identity already belongs to a different placement decision.",
            );
          }
          const replay = await transaction.sessionAudioAlignmentJob.findUnique({
            where: { id: jobRow.id },
            include: {
              decisions: {
                orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
                take: 1,
              },
            },
          });
          return publicStatus(replay ?? jobRow);
        }
        const current = jobRow.decisions[0] ?? null;
        const currentRevision = current?.revision ?? 0;
        if (currentRevision !== input.expectedRevision) {
          throw new SessionSourceAlignmentError(
            409,
            "ALIGNMENT_DECISION_STALE",
            "The placement decision changed. Refresh before trying again.",
          );
        }
        let job: SessionAudioAlignmentJob;
        let result: ReturnType<typeof parseAudioAlignmentResult>;
        try {
          job = parseSessionAudioAlignmentJob(jobRow.inputJson, jobRow.id);
          result = parseAudioAlignmentResult(
            object(jobRow.resultJson).receipt,
            job,
          );
        } catch {
          throw new SessionSourceAlignmentError(
            409,
            "ALIGNMENT_EVIDENCE_INVALID",
            "This alignment result failed integrity validation and cannot become the Session clock.",
          );
        }
        const resultSha256 = createHash("sha256")
          .update(JSON.stringify(result))
          .digest("hex");
        const placement = buildSessionReviewedPlacement(job, result);
        if (input.operation === "APPROVE") {
          if (current?.operation === "APPROVE") {
            throw new SessionSourceAlignmentError(
              409,
              "ALIGNMENT_ALREADY_APPROVED",
              "This exact placement is already active.",
            );
          }
          if (
            !result.evidence.qualification.qualifiedForAuthorizedAgentReview
          ) {
            throw new SessionSourceAlignmentError(
              409,
              "ALIGNMENT_EVIDENCE_AMBIGUOUS",
              "The waveform peaks are not distinct enough to use as a placement. Keep the clock estimate and collect stronger evidence.",
            );
          }
          const context = await loadContext({
            prisma: transaction,
            roomId: room.id,
            spineRecordingAssetId: job.spine.assetId,
            targetRecordingAssetId: job.target.assetId,
            actor: input.actor,
          });
          if (
            !sameBinding(job.spine, sourceBinding(context.spine)) ||
            !sameBinding(job.target, sourceBinding(context.target))
          ) {
            throw new SessionSourceAlignmentError(
              409,
              "ALIGNMENT_SOURCE_CHANGED",
              "A retained source changed before placement approval.",
            );
          }
        } else {
          if (current?.operation !== "APPROVE") {
            throw new SessionSourceAlignmentError(
              409,
              "ALIGNMENT_NOT_APPROVED",
              "There is no active measured placement to revoke.",
            );
          }
          if (current.resultSha256 !== resultSha256) {
            throw new SessionSourceAlignmentError(
              409,
              "ALIGNMENT_RESULT_CHANGED",
              "The active decision no longer matches this result. Nothing was revoked.",
            );
          }
        }
        await transaction.sessionAudioAlignmentDecisionReceipt.create({
          data: {
            requestId: input.requestId.toLowerCase(),
            roomId: room.id,
            alignmentJobId: jobRow.id,
            actorUserId: input.actor.id,
            operation: input.operation,
            revision: currentRevision + 1,
            expectedRevision: currentRevision,
            requestSha256,
            resultSha256,
            placementJson: json(placement),
            reason,
          },
        });
        const updated = await transaction.sessionAudioAlignmentJob.findUnique({
          where: { id: jobRow.id },
          include: {
            decisions: {
              orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
              take: 1,
            },
          },
        });
        return publicStatus(updated ?? jobRow);
      },
      { isolationLevel: "Serializable" },
    );
  } catch (error) {
    const code = text(object(error).code);
    if (code === "P2002" || code === "P2034") {
      throw new SessionSourceAlignmentError(
        409,
        "ALIGNMENT_DECISION_STALE",
        "The placement decision changed concurrently. Refresh before trying again.",
      );
    }
    throw error;
  }
}

export async function queueSessionSourceAlignment(input: {
  prisma: any;
  roomId: string;
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  actor: Actor;
}) {
  const context = await loadContext(input);
  const plan = buildSessionSourceAlignmentPlan({
    captureGroupId: context.room.captureGroupId,
    spine: context.spine,
    target: context.target,
  });
  const jobId = `session_alignment_${randomUUID().replaceAll("-", "")}`;
  const job = newSessionAudioAlignmentJob({
    jobId,
    roomId: context.room.id,
    captureGroupId: context.room.captureGroupId,
    requestedByUserId: input.actor.id,
    requestedByEmail: actorEmail(input.actor),
    queuedAt: new Date().toISOString(),
    spine: sourceBinding(context.spine),
    target: sourceBinding(context.target),
    proposal: plan.proposal,
  });
  const recent = await input.prisma.sessionAudioAlignmentJob.findFirst({
    where: {
      roomId: context.room.id,
      spineRecordingAssetId: context.spine.id,
      targetRecordingAssetId: context.target.id,
      status: { not: "failed" },
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
  if (recent) {
    try {
      const existing = parseSessionAudioAlignmentJob(
        recent.inputJson,
        recent.id,
      );
      if (sameRequest(existing, job))
        return queueExecution(input.prisma, recent, plan.clockAuthority);
    } catch {
      // A malformed or differently bound row cannot own this exact request.
    }
  }
  const saved = await input.prisma.sessionAudioAlignmentJob.create({
    data: {
      id: job.jobId,
      roomId: context.room.id,
      spineRecordingAssetId: context.spine.id,
      targetRecordingAssetId: context.target.id,
      requestedByUserId: input.actor.id,
      requestedByEmail: actorEmail(input.actor),
      status: "queued",
      inputJson: json({ ...job, sessionPlan: plan }),
    },
  });
  return queueExecution(input.prisma, saved, plan.clockAuthority);
}

export async function reconcileSessionSourceAlignment(input: {
  prisma: any;
  roomId: string;
  jobId: string;
  actor: Actor;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: {
      id: input.roomId,
      ...sessionMutationActorAccessWhere(input.actor),
    },
    select: { id: true },
  });
  if (!room)
    throw new SessionSourceAlignmentError(
      404,
      "SESSION_NOT_FOUND",
      "This private Session is unavailable to this account.",
    );
  const row = await input.prisma.sessionAudioAlignmentJob.findFirst({
    where: { id: input.jobId, roomId: room.id },
  });
  if (!row)
    throw new SessionSourceAlignmentError(
      404,
      "ALIGNMENT_NOT_FOUND",
      "That Session alignment job is unavailable.",
    );
  const job = parseSessionAudioAlignmentJob(row.inputJson, row.id);
  if (isLocalJob(job)) {
    if (row.status === "failed") return publicStatus(row);
    if (row.status !== "output-ready" && row.status !== "completed") {
      return publicStatus(row);
    }
    if (row.status === "completed") return publicStatus(row);
    const result = parseAudioAlignmentResult(
      object(row.resultJson).receipt,
      job,
    );
    return registerCompletedAlignment({
      prisma: input.prisma,
      roomId: input.roomId,
      actor: input.actor,
      job,
      result,
      registration: { localWorkerEvidence: true },
    });
  }
  if (!isCloudJob(job)) {
    throw new SessionSourceAlignmentError(
      409,
      "ALIGNMENT_PROVIDER_MISMATCH",
      "Both exact Session sources must be available to the same media processor.",
    );
  }
  const cloud = await ensureSessionAudioSourceAlignmentCloudQueued({
    prisma: input.prisma,
    processingJob: row,
  });
  const refreshed =
    (await input.prisma.sessionAudioAlignmentJob.findUnique({
      where: { id: row.id },
    })) ?? row;
  if (cloud.status === "configuration-required" || cloud.status === "failed")
    return publicStatus(refreshed, cloud.status === "configuration-required");
  const bucket = getMediaBucket(cloud.bucketName);
  const storedManifest = await loadGcsJson(
    bucket,
    buildAudioAlignmentCloudManifestObjectName(job.jobId),
  );
  if (!storedManifest) return publicStatus(refreshed);
  const manifest = parseAudioAlignmentCloudManifest(
    storedManifest.value,
    job.jobId,
  );
  if (manifest.status === "failed-terminal") {
    const failed = await input.prisma.sessionAudioAlignmentJob.update({
      where: { id: job.jobId },
      data: {
        status: "failed",
        error: `${manifest.failure?.code}: ${manifest.failure?.message}`.slice(
          0,
          4_000,
        ),
        completedAt: new Date(manifest.failure?.failedAt || manifest.updatedAt),
      },
    });
    return publicStatus(failed);
  }
  if (manifest.status !== "completed") return publicStatus(refreshed);
  const storedResult = await loadGcsJson(
    bucket,
    buildAudioAlignmentCloudResultObjectName(job.jobId),
  );
  if (!storedResult) return publicStatus(refreshed);
  const result = parseAudioAlignmentResult(storedResult.value, job);
  return registerCompletedAlignment({
    prisma: input.prisma,
    roomId: input.roomId,
    actor: input.actor,
    job,
    result,
    registration: {
      cloudManifestGeneration: storedManifest.generation,
      cloudResultGeneration: storedResult.generation,
    },
  });
}

async function loadContext(input: {
  prisma: any;
  roomId: string;
  spineRecordingAssetId: string;
  targetRecordingAssetId: string;
  actor: Actor;
}) {
  const room = await input.prisma.callRoom.findFirst({
    where: {
      id: input.roomId,
      ...sessionMutationActorAccessWhere(input.actor),
    },
    select: { id: true, captureGroupId: true },
  });
  if (!room)
    throw new SessionSourceAlignmentError(
      404,
      "SESSION_NOT_FOUND",
      "This private Session is unavailable to this account.",
    );
  const assetIds = [
    ...new Set([input.spineRecordingAssetId, input.targetRecordingAssetId]),
  ];
  if (assetIds.length !== 2 || assetIds.some((id) => !text(id))) {
    throw new SessionSourceAlignmentError(
      400,
      "ALIGNMENT_SOURCES_REQUIRED",
      "Choose two different verified Session sources.",
    );
  }
  const [assets, receipts] = await Promise.all([
    input.prisma.recordingAsset.findMany({
      where: { id: { in: assetIds }, roomId: room.id },
      select: {
        id: true,
        roomId: true,
        kind: true,
        durationSeconds: true,
        recordedStartedAt: true,
        localManifestJson: true,
        status: true,
        contentType: true,
        byteSize: true,
        checksum: true,
        storageBucket: true,
        storageObjectPath: true,
        verifiedAt: true,
      },
    }),
    input.prisma.mobileCaptureFinalizationReceipt.findMany({
      where: {
        recordingAssetId: { in: assetIds },
        processingDisposition: "RELEASED",
      },
      orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const candidate = (assetId: string): Candidate => {
    const asset = assets.find((row: any) => row.id === assetId);
    const receipt = receipts.find(
      (row: any) => row.recordingAssetId === assetId,
    );
    const providerReference = asset
      ? sessionProviderReferenceBinding({
          roomId: room.id,
          captureGroupId: room.captureGroupId,
          asset,
        })
      : null;
    const playback = asset
      ? sessionProtectedPlaybackBinding({ roomId: room.id, asset, receipt })
      : null;
    if (!asset || (!playback && !providerReference)) {
      throw new SessionSourceAlignmentError(
        409,
        "ALIGNMENT_SOURCE_UNVERIFIED",
        "Waveform alignment requires two released, exact-byte-verified Session recordings.",
      );
    }
    const manifest = object(asset.localManifestJson);
    const sourceCaptureGroupId =
      text(manifest.captureGroupId) ||
      text(object(manifest.alignment).captureGroupId);
    if (sourceCaptureGroupId !== room.captureGroupId) {
      throw new SessionSourceAlignmentError(
        409,
        "ALIGNMENT_TAKE_MISMATCH",
        "Both recordings must belong to this exact Session take before waveform alignment.",
      );
    }
    return {
      ...asset,
      playback,
      processorBinding: providerReference?.source ?? null,
      providerReference,
    };
  };
  return {
    room,
    spine: candidate(input.spineRecordingAssetId),
    target: candidate(input.targetRecordingAssetId),
  };
}

async function queueExecution(
  prisma: any,
  row: any,
  clockAuthority: SessionSourceAlignmentPlan["clockAuthority"],
) {
  const job = parseSessionAudioAlignmentJob(row.inputJson, row.id);
  if (isLocalJob(job)) {
    return { ...publicStatus(row), clockAuthority };
  }
  if (!isCloudJob(job)) {
    throw new SessionSourceAlignmentError(
      409,
      "ALIGNMENT_PROVIDER_MISMATCH",
      "Both exact Session sources must be available to the same media processor.",
    );
  }
  const cloud = await ensureSessionAudioSourceAlignmentCloudQueued({
    prisma,
    processingJob: row,
  });
  const refreshed =
    (await prisma.sessionAudioAlignmentJob.findUnique({
      where: { id: row.id },
    })) ?? row;
  const value = publicStatus(
    refreshed,
    cloud.status === "configuration-required",
  );
  return { ...value, clockAuthority };
}

function publicStatus(row: any, blocked = false): PublicSessionSourceAlignment {
  let job: SessionAudioAlignmentJob | null = null;
  let result: ReturnType<typeof parseAudioAlignmentResult> | null = null;
  try {
    job = parseSessionAudioAlignmentJob(row.inputJson, row.id);
  } catch {
    /* fail closed */
  }
  try {
    if (job)
      result = parseAudioAlignmentResult(object(row.resultJson).receipt, job);
  } catch {
    /* fail closed */
  }
  const declared = STATUS.includes(row.status) ? row.status : "failed";
  const integrityFailure =
    !job ||
    ((declared === "output-ready" || declared === "completed") && !result);
  const plan = object(object(row.inputJson).sessionPlan);
  const latestDecision = Array.isArray(row.decisions)
    ? (row.decisions[0] ?? null)
    : null;
  const placement = object(latestDecision?.placementJson);
  const decisionActive =
    latestDecision?.operation === "APPROVE" && validPublicPlacement(placement);
  return {
    jobId: text(row.id),
    status: integrityFailure ? "failed" : blocked ? "blocked" : declared,
    spineRecordingAssetId:
      job?.spine.assetId ?? text(row.spineRecordingAssetId),
    targetRecordingAssetId:
      job?.target.assetId ?? text(row.targetRecordingAssetId),
    clockAuthority:
      plan.clockAuthority === "capture-clock-proposal" ||
      plan.clockAuthority === "reported-wall-clock-fallback"
        ? plan.clockAuthority
        : null,
    evidence: result?.evidence ?? null,
    error: integrityFailure
      ? "Session audio alignment evidence failed integrity validation."
      : blocked
        ? "Exact-source alignment is retained, but the media processor execution control is not configured."
        : text(row.error) || null,
    updatedAt: row.updatedAt?.toISOString?.() ?? null,
    decision:
      latestDecision && validPublicPlacement(placement)
        ? {
            revision: Number(latestDecision.revision),
            status:
              latestDecision.operation === "APPROVE" ? "approved" : "revoked",
            signedOffsetSeconds: Number(placement.signedOffsetSeconds),
            targetTimelineStartSeconds: Number(
              placement.targetTimelineStartSeconds,
            ),
            targetSourceTrimSeconds: Number(placement.targetSourceTrimSeconds),
            residualDriftMilliseconds: Number(
              placement.residualDriftMilliseconds,
            ),
            resultSha256: text(latestDecision.resultSha256),
            reason: text(latestDecision.reason) || null,
            decidedAt: latestDecision.createdAt?.toISOString?.() ?? "",
          }
        : null,
    boundaries: readBoundaries(decisionActive),
  };
}

export function buildSessionReviewedPlacement(
  job: SessionAudioAlignmentJob,
  result: ReturnType<typeof parseAudioAlignmentResult>,
) {
  const signedOffsetSeconds = rounded(
    result.evidence.opening.measuredOffsetSeconds,
  );
  return {
    schema: "quipsly-session-reviewed-source-placement-v1",
    alignmentJobId: job.jobId,
    roomId: job.roomId,
    captureGroupId: job.captureGroupId,
    spineRecordingAssetId: job.spine.assetId,
    targetRecordingAssetId: job.target.assetId,
    signedOffsetSeconds,
    targetTimelineStartSeconds: rounded(Math.max(0, signedOffsetSeconds)),
    targetSourceTrimSeconds: rounded(Math.max(0, -signedOffsetSeconds)),
    laterMeasuredOffsetSeconds: rounded(
      result.evidence.later.measuredOffsetSeconds,
    ),
    observationIntervalSeconds:
      result.evidence.drift.observationIntervalSeconds,
    residualDriftMilliseconds: result.evidence.drift.residualDriftMilliseconds,
    observedPartsPerMillion: result.evidence.drift.observedPartsPerMillion,
    correctionApplied: false as const,
    sourceBytesMutated: false as const,
    timelineDecisionReversible: true as const,
    sampleAccurateClaimed: false as const,
  };
}

export function sessionSourceAlignmentProcessorBinding(
  candidate: Candidate,
): AudioMasterySourceBinding {
  if (candidate.processorBinding) return candidate.processorBinding;
  const binding = candidate.playback;
  if (!binding) {
    throw new SessionSourceAlignmentError(
      409,
      "ALIGNMENT_PROCESSOR_SOURCE_UNAVAILABLE",
      "The exact Session source is not available to an authorized media processor.",
    );
  }
  const manifest = object(candidate.localManifestJson);
  const promotion = object(manifest.promotion);
  const localPath = text(promotion.providerSourceId);
  const repair = object(manifest.interruptionRepair);
  const repaired = object(repair.derivative);
  if (text(repair.status).toLowerCase() === "verified") {
    const repairedSha256 = text(repaired.sha256).toLowerCase();
    const repairedGeneration = text(repaired.generation);
    const repairedSizeBytes = positive(repaired.sizeBytes);
    const repairedBucketName = text(repaired.bucketName);
    const repairedObjectName = text(repaired.objectName);
    const repairedContentType = text(repaired.contentType).toLowerCase();
    if (
      repair.originalRemainsSourceTruth !== true ||
      !/^[0-9a-f]{64}$/.test(repairedSha256) ||
      !/^[1-9][0-9]*$/.test(repairedGeneration) ||
      repairedSizeBytes === null ||
      !Number.isSafeInteger(repairedSizeBytes) ||
      !repairedBucketName ||
      !repairedObjectName ||
      !/^(audio|video)\/[a-z0-9.+-]+$/.test(repairedContentType)
    ) {
      throw new SessionSourceAlignmentError(
        409,
        "ALIGNMENT_REPAIR_BINDING_INVALID",
        "The repaired recording is missing exact derivative-byte evidence.",
      );
    }
    if (
      repairedBucketName === MOBILE_CAPTURE_LOCAL_VAULT_BUCKET &&
      path.isAbsolute(localPath)
    ) {
      return {
        assetId: binding.recordingAssetId,
        provider: "local" as const,
        locator: localPath,
        generation: repairedGeneration,
        sha256: repairedSha256,
        sizeBytes: repairedSizeBytes,
        contentType: repairedContentType,
      };
    }
    if (repairedBucketName === MOBILE_CAPTURE_LOCAL_VAULT_BUCKET) {
      throw new SessionSourceAlignmentError(
        409,
        "ALIGNMENT_LOCAL_SOURCE_UNAVAILABLE",
        "The repaired local Session source is missing its private processor binding.",
      );
    }
    return {
      assetId: binding.recordingAssetId,
      provider: "gcs" as const,
      locator: `gcs://${repairedBucketName}/${repairedObjectName}?generation=${repairedGeneration}`,
      generation: repairedGeneration,
      sha256: repairedSha256,
      sizeBytes: repairedSizeBytes,
      contentType: repairedContentType,
    };
  }
  if (
    binding.bucketName === MOBILE_CAPTURE_LOCAL_VAULT_BUCKET &&
    path.isAbsolute(localPath)
  ) {
    return {
      assetId: binding.recordingAssetId,
      provider: "local" as const,
      locator: localPath,
      generation: binding.generation,
      sha256: binding.sha256,
      sizeBytes: binding.byteSize,
      contentType: binding.contentType,
    };
  }
  if (binding.bucketName === MOBILE_CAPTURE_LOCAL_VAULT_BUCKET) {
    throw new SessionSourceAlignmentError(
      409,
      "ALIGNMENT_LOCAL_SOURCE_UNAVAILABLE",
      "The retained local Session source is missing its private processor binding.",
    );
  }
  return {
    assetId: binding.recordingAssetId,
    provider: "gcs" as const,
    locator: `gcs://${binding.bucketName}/${binding.objectName}?generation=${binding.generation}`,
    generation: binding.generation,
    sha256: binding.sha256,
    sizeBytes: binding.byteSize,
    contentType: binding.contentType,
  };
}

const sourceBinding = sessionSourceAlignmentProcessorBinding;

function isLocalJob(job: SessionAudioAlignmentJob) {
  return job.spine.provider === "local" && job.target.provider === "local";
}

function isCloudJob(job: SessionAudioAlignmentJob) {
  return job.spine.provider === "gcs" && job.target.provider === "gcs";
}

async function registerCompletedAlignment(input: {
  prisma: any;
  roomId: string;
  actor: Actor;
  job: SessionAudioAlignmentJob;
  result: ReturnType<typeof parseAudioAlignmentResult>;
  registration: Record<string, unknown>;
}) {
  const context = await loadContext({
    prisma: input.prisma,
    roomId: input.roomId,
    spineRecordingAssetId: input.job.spine.assetId,
    targetRecordingAssetId: input.job.target.assetId,
    actor: input.actor,
  });
  if (
    !sameBinding(input.job.spine, sourceBinding(context.spine)) ||
    !sameBinding(input.job.target, sourceBinding(context.target))
  ) {
    throw new SessionSourceAlignmentError(
      409,
      "ALIGNMENT_SOURCE_CHANGED",
      "A retained Session source changed before alignment evidence registration.",
    );
  }
  const completed = await input.prisma.sessionAudioAlignmentJob.update({
    where: { id: input.job.jobId },
    data: {
      status: "completed",
      completedAt: new Date(input.result.completedAt),
      error: null,
      resultJson: json({
        state: "completed",
        receipt: input.result,
        registration: {
          exactSourceBytesBound: true,
          sourceTimesMutated: false,
          placementApplied: false,
          placementRequiresSeparateReview: true,
          ...input.registration,
        },
      }),
    },
  });
  return publicStatus(completed);
}

function captureClock(value: unknown, captureGroupId: string) {
  const alignment = object(object(value).alignment);
  const startedAtMilliseconds = dateMilliseconds(
    alignment.estimatedServerStartedAt,
  );
  const uncertaintyMilliseconds = finiteNonnegative(
    alignment.uncertaintyMilliseconds,
  );
  if (
    alignment.schema !== "quipsly-capture-alignment-proposal-v1" ||
    alignment.status !== "proposal-ready" ||
    text(alignment.captureGroupId) !== captureGroupId ||
    startedAtMilliseconds === null ||
    uncertaintyMilliseconds === null ||
    alignment.sampleAccurateClaimed !== false ||
    alignment.reviewRequired !== true
  )
    return null;
  return { startedAtMilliseconds, uncertaintyMilliseconds };
}

function sameRequest(
  left: SessionAudioAlignmentJob,
  right: SessionAudioAlignmentJob,
) {
  return (
    JSON.stringify({
      spine: left.spine,
      target: left.target,
      proposal: left.proposal,
    }) ===
    JSON.stringify({
      spine: right.spine,
      target: right.target,
      proposal: right.proposal,
    })
  );
}

function sameBinding(
  left: SessionAudioAlignmentJob["spine"],
  right: SessionAudioAlignmentJob["spine"],
) {
  return (
    left.assetId === right.assetId &&
    left.provider === right.provider &&
    left.locator === right.locator &&
    left.generation === right.generation &&
    left.sha256 === right.sha256 &&
    left.sizeBytes === right.sizeBytes &&
    left.contentType === right.contentType
  );
}

async function loadGcsJson(bucket: any, objectName: string) {
  try {
    const [metadata] = await bucket.file(objectName).getMetadata();
    const generation = text(metadata.generation);
    if (!/^[1-9][0-9]*$/.test(generation))
      throw new Error(
        "Session alignment cloud object lacks an immutable generation.",
      );
    const [raw] = await bucket
      .file(objectName, { generation })
      .download({ validation: "crc32c" });
    return { value: JSON.parse(raw.toString("utf8")) as unknown, generation };
  } catch (error) {
    if (Number((error as { code?: unknown }).code) === 404) return null;
    throw error;
  }
}

function readBoundaries(reviewedPlacementActive = false) {
  return {
    exactSourceBytesBound: true as const,
    sourceBytesImmutable: true as const,
    sourceTimesMutated: false as const,
    analyzerPlacementApplied: false as const,
    reviewedPlacementActive,
    placementRequiresSeparateReview: !reviewedPlacementActive,
    sampleAccurateClaimed: false as const,
  };
}

function actorEmail(actor: Actor) {
  const value = text(actor.primaryEmail || actor.email).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new SessionSourceAlignmentError(
      409,
      "ACTOR_EMAIL_REQUIRED",
      "This account needs a verified email before requesting private media processing.",
    );
  }
  return value;
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function positive(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}
function finiteNonnegative(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}
function dateMilliseconds(value: unknown) {
  const parsed =
    value instanceof Date ? value.getTime() : Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : null;
}
function rounded(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}
function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function validPublicPlacement(value: Record<string, any>) {
  return (
    value.schema === "quipsly-session-reviewed-source-placement-v1" &&
    finite(value.signedOffsetSeconds) !== null &&
    finiteNonnegative(value.targetTimelineStartSeconds) !== null &&
    finiteNonnegative(value.targetSourceTrimSeconds) !== null &&
    finite(value.residualDriftMilliseconds) !== null &&
    value.correctionApplied === false &&
    value.sourceBytesMutated === false &&
    value.sampleAccurateClaimed === false
  );
}
function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
