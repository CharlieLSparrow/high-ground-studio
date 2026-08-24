import "server-only";

import { createHash } from "node:crypto";
import {
  parseAudioAlignmentResult,
  parseSessionAudioAlignmentJob,
} from "@high-ground/quipsly-media-processing";

import { buildSessionReviewedPlacement } from "./session-source-alignment";
import { sessionProtectedPlaybackBinding } from "./session-protected-playback";

export type SessionReviewedSourcePlacement = ReturnType<
  typeof buildSessionReviewedPlacement
>;

export class SessionReviewedSourcePlacementError extends Error {
  readonly code = "TRANSCRIPT_REVIEWED_PLACEMENT_INVALID";

  constructor(message: string) {
    super(message);
    this.name = "SessionReviewedSourcePlacementError";
  }
}

/**
 * Loads only active approvals whose immutable result, stored placement, and
 * current released source generations still agree. An active but invalid
 * approval holds assembly instead of silently falling back to an estimate.
 */
export async function readSessionReviewedSourcePlacements(input: {
  prisma: any;
  roomId: string;
  recordingAssetIds: string[];
}): Promise<SessionReviewedSourcePlacement[]> {
  const sourceIds = [
    ...new Set(input.recordingAssetIds.map(text).filter(Boolean)),
  ];
  if (sourceIds.length < 2) return [];
  const jobs = await input.prisma.sessionAudioAlignmentJob.findMany({
    where: {
      roomId: input.roomId,
      status: "completed",
      spineRecordingAssetId: { in: sourceIds },
      targetRecordingAssetId: { in: sourceIds },
      decisions: { some: {} },
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 100,
    include: {
      decisions: {
        orderBy: [{ revision: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });
  const latestByPair = new Map<string, any>();
  const decided = jobs
    .filter((row: any) => row.decisions?.[0])
    .sort(
      (left: any, right: any) =>
        dateMilliseconds(right.decisions[0].createdAt) -
          dateMilliseconds(left.decisions[0].createdAt) ||
        text(right.decisions[0].id).localeCompare(text(left.decisions[0].id)),
    );
  for (const row of decided) {
    const pairKey = [
      text(row.spineRecordingAssetId),
      text(row.targetRecordingAssetId),
    ]
      .sort()
      .join(":");
    if (!latestByPair.has(pairKey)) latestByPair.set(pairKey, row);
  }
  const active = [...latestByPair.values()].filter(
    (row: any) => row.decisions[0].operation === "APPROVE",
  );
  if (!active.length) return [];

  const [assets, receipts] = await Promise.all([
    input.prisma.recordingAsset.findMany({
      where: { id: { in: sourceIds }, roomId: input.roomId },
      select: {
        id: true,
        roomId: true,
        status: true,
        contentType: true,
        byteSize: true,
        checksum: true,
        storageBucket: true,
        storageObjectPath: true,
        verifiedAt: true,
        localManifestJson: true,
      },
    }),
    input.prisma.mobileCaptureFinalizationReceipt.findMany({
      where: {
        recordingAssetId: { in: sourceIds },
        processingDisposition: "RELEASED",
      },
      orderBy: [{ releasedAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);
  const bindingByAssetId = new Map<string, ReturnType<typeof sourceBinding>>();
  for (const asset of assets) {
    const receipt = receipts.find(
      (row: any) => row.recordingAssetId === asset.id,
    );
    const binding = sessionProtectedPlaybackBinding({
      roomId: input.roomId,
      asset,
      receipt,
    });
    if (binding) bindingByAssetId.set(asset.id, sourceBinding(binding));
  }

  const accepted: SessionReviewedSourcePlacement[] = [];
  const acceptedPairs = new Set<string>();
  for (const row of active) {
    try {
      const decision = row.decisions[0];
      const job = parseSessionAudioAlignmentJob(row.inputJson, row.id);
      const result = parseAudioAlignmentResult(
        object(row.resultJson).receipt,
        job,
      );
      const resultSha256 = sha256(result);
      const expected = buildSessionReviewedPlacement(job, result);
      const stored = parsePlacement(decision.placementJson);
      const pairKey = [job.spine.assetId, job.target.assetId].sort().join(":");
      if (
        decision.resultSha256 !== resultSha256 ||
        !equalJson(stored, expected) ||
        job.roomId !== input.roomId ||
        !sourceIds.includes(job.spine.assetId) ||
        !sourceIds.includes(job.target.assetId) ||
        !result.evidence.qualification.qualifiedForAuthorizedAgentReview ||
        !sameBinding(job.spine, bindingByAssetId.get(job.spine.assetId)) ||
        !sameBinding(job.target, bindingByAssetId.get(job.target.assetId))
      ) {
        throw new Error("binding mismatch");
      }
      // The newest active decision for a source pair is authoritative. Older
      // retained jobs remain auditable but cannot create a conflicting cycle.
      if (!acceptedPairs.has(pairKey)) {
        acceptedPairs.add(pairKey);
        accepted.push(expected);
      }
    } catch {
      throw new SessionReviewedSourcePlacementError(
        "An approved waveform placement no longer matches its exact retained sources. Refresh the Session and review sync before assembling the conversation.",
      );
    }
  }
  return accepted;
}

export function parsePlacement(value: unknown): SessionReviewedSourcePlacement {
  const row = object(value);
  const placement = {
    schema: row.schema,
    alignmentJobId: text(row.alignmentJobId),
    roomId: text(row.roomId),
    captureGroupId: text(row.captureGroupId),
    spineRecordingAssetId: text(row.spineRecordingAssetId),
    targetRecordingAssetId: text(row.targetRecordingAssetId),
    signedOffsetSeconds: finite(row.signedOffsetSeconds),
    targetTimelineStartSeconds: nonnegative(row.targetTimelineStartSeconds),
    targetSourceTrimSeconds: nonnegative(row.targetSourceTrimSeconds),
    laterMeasuredOffsetSeconds: finite(row.laterMeasuredOffsetSeconds),
    observationIntervalSeconds: nonnegative(row.observationIntervalSeconds),
    residualDriftMilliseconds: finite(row.residualDriftMilliseconds),
    observedPartsPerMillion: finite(row.observedPartsPerMillion),
    correctionApplied: row.correctionApplied,
    sourceBytesMutated: row.sourceBytesMutated,
    timelineDecisionReversible: row.timelineDecisionReversible,
    sampleAccurateClaimed: row.sampleAccurateClaimed,
  };
  if (
    placement.schema !== "quipsly-session-reviewed-source-placement-v1" ||
    !placement.alignmentJobId ||
    !placement.roomId ||
    !placement.captureGroupId ||
    !placement.spineRecordingAssetId ||
    !placement.targetRecordingAssetId ||
    placement.spineRecordingAssetId === placement.targetRecordingAssetId ||
    placement.signedOffsetSeconds === null ||
    placement.targetTimelineStartSeconds === null ||
    placement.targetSourceTrimSeconds === null ||
    placement.laterMeasuredOffsetSeconds === null ||
    placement.observationIntervalSeconds === null ||
    placement.residualDriftMilliseconds === null ||
    placement.observedPartsPerMillion === null ||
    placement.correctionApplied !== false ||
    placement.sourceBytesMutated !== false ||
    placement.timelineDecisionReversible !== true ||
    placement.sampleAccurateClaimed !== false
  )
    throw new Error("Invalid reviewed Session source placement.");
  return placement as SessionReviewedSourcePlacement;
}

function sourceBinding(binding: any) {
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

function sameBinding(left: any, right: any) {
  return (
    Boolean(right) &&
    left.assetId === right.assetId &&
    left.provider === right.provider &&
    left.locator === right.locator &&
    left.generation === right.generation &&
    left.sha256 === right.sha256 &&
    left.sizeBytes === right.sizeBytes &&
    left.contentType === right.contentType
  );
}

function object(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}
function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
function finite(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function nonnegative(value: unknown) {
  const parsed = finite(value);
  return parsed !== null && parsed >= 0 ? parsed : null;
}
function dateMilliseconds(value: unknown) {
  const parsed =
    value instanceof Date ? value.getTime() : Date.parse(text(value));
  return Number.isFinite(parsed) ? parsed : 0;
}
function sha256(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
function equalJson(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}
