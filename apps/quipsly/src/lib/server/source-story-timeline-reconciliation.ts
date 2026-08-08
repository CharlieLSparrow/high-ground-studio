import "server-only";

import { createHash } from "node:crypto";

import { Prisma, type PrismaClient } from "@prisma/client";
import type { SourceStoryTimelineBinding, TimelineClip, TimelineState } from "@high-ground/quipsly-domain";

import { episodeTimelineContentFingerprint } from "@/app/(app)/episode-production/episodeArtifact";

const CLOCK_TOLERANCE_SECONDS = 0.002;
const SOURCE_STORY_GENERATOR = "quipsly-source-story-promotion-v1";
const SOURCE_STORY_SCHEMA = "quipsly-source-story-timeline-binding-v1";

type PlacementWithRange = Prisma.StudioStoryTimelinePlacementGetPayload<{
  include: { sourceRange: { select: { startSeconds: true; endSeconds: true; sourceRevisionId: true } } };
}>;

type ReconciliationOperation = "timeline-reconcile" | "editor-withdraw" | "editor-restore";

export type SourceStoryTimelineReconciliationSummary = {
  inspected: number;
  unchanged: number;
  reconciled: number;
  withdrawn: number;
  restored: number;
};

export class SourceStoryTimelineReconciliationError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status = 409,
  ) {
    super(message);
    this.name = "SourceStoryTimelineReconciliationError";
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
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
  return createHash("sha256").update(typeof value === "string" ? value : stableJson(value)).digest("hex");
}

function prismaJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function bindingFromClip(clip: TimelineClip): SourceStoryTimelineBinding | null {
  const binding = record(clip.sourceStory);
  if (!binding) return null;
  if (binding.schema !== SOURCE_STORY_SCHEMA || typeof binding.placementId !== "string" || !binding.placementId) {
    throw new SourceStoryTimelineReconciliationError(
      `Clip ${clip.id} carries malformed Source Story provenance.`,
      "SOURCE_STORY_BINDING_INVALID",
      400,
    );
  }
  return binding as SourceStoryTimelineBinding;
}

function sourceStorySnapshotBinding(placement: PlacementWithRange): SourceStoryTimelineBinding {
  const snapshot = record(placement.sourceSnapshotJson);
  const binding = record(snapshot?.sourceStory);
  if (!binding || binding.schema !== SOURCE_STORY_SCHEMA) {
    throw new SourceStoryTimelineReconciliationError(
      `Source Story placement ${placement.id} has no immutable promotion binding.`,
      "SOURCE_STORY_PLACEMENT_SNAPSHOT_INVALID",
      500,
    );
  }
  return binding as SourceStoryTimelineBinding;
}

function close(left: number, right: number) {
  return Math.abs(left - right) <= CLOCK_TOLERANCE_SECONDS;
}

function validateBoundClip(placement: PlacementWithRange, clip: TimelineClip, binding: SourceStoryTimelineBinding) {
  const retainedBinding = sourceStorySnapshotBinding(placement);
  if (clip.id !== placement.clipId) {
    throw new SourceStoryTimelineReconciliationError(
      "A Source Story placement cannot be duplicated under a new clip identity. Create a new deliberate Story placement instead.",
      "SOURCE_STORY_CLIP_ID_MISMATCH",
    );
  }
  if (stableJson(binding) !== stableJson(retainedBinding)) {
    throw new SourceStoryTimelineReconciliationError(
      "The editor attempted to change immutable Source Story provenance. Refresh and make the edit without replacing its source binding.",
      "SOURCE_STORY_BINDING_MISMATCH",
    );
  }
  if (binding.cardId !== placement.cardId || binding.sourceRangeId !== placement.sourceRangeId || binding.sourceRevisionId !== placement.sourceRange.sourceRevisionId) {
    throw new SourceStoryTimelineReconciliationError(
      "The Source Story binding no longer matches its retained card, range, and source revision.",
      "SOURCE_STORY_SOURCE_IDENTITY_MISMATCH",
    );
  }
  const sourceEnd = clip.sourceEnd ?? clip.sourceStart + clip.duration;
  if (
    !Number.isFinite(clip.startIn) || clip.startIn < 0 ||
    !Number.isFinite(clip.duration) || clip.duration < 0.05 ||
    !Number.isFinite(clip.sourceStart) || !Number.isFinite(sourceEnd) ||
    clip.sourceStart < placement.sourceRange.startSeconds - CLOCK_TOLERANCE_SECONDS ||
    sourceEnd > placement.sourceRange.endSeconds + CLOCK_TOLERANCE_SECONDS ||
    sourceEnd <= clip.sourceStart ||
    !close(sourceEnd - clip.sourceStart, clip.duration)
  ) {
    throw new SourceStoryTimelineReconciliationError(
      "This trim falls outside the exact retained Story range or changes its playback rate. Create a new source range for additional material.",
      "SOURCE_STORY_TRIM_OUTSIDE_RETAINED_RANGE",
    );
  }
  if (clip.kind !== "video" || !/^V[1-9][0-9]?$/.test(clip.trackId)) {
    throw new SourceStoryTimelineReconciliationError(
      "Source Story moments must remain on a video track from V1 through V99.",
      "SOURCE_STORY_TRACK_INVALID",
    );
  }
}

function timelineFingerprint(timeline: TimelineState) {
  return sha256(episodeTimelineContentFingerprint(timeline));
}

/**
 * Reconciles the durable Source Story placement projection with the canonical
 * Episode bytes inside the caller's Serializable save transaction.
 */
export async function reconcileSourceStoryTimelinePlacements(input: {
  prisma: PrismaClient | Prisma.TransactionClient;
  episodeProductionId: string;
  actorUserId: string;
  clientRequestId: string;
  previousTimeline: TimelineState;
  incomingTimeline: TimelineState;
  occurredAt: Date;
}): Promise<SourceStoryTimelineReconciliationSummary> {
  const placements = await input.prisma.studioStoryTimelinePlacement.findMany({
    where: { episodeProductionId: input.episodeProductionId },
    include: { sourceRange: { select: { startSeconds: true, endSeconds: true, sourceRevisionId: true } } },
    orderBy: { createdAt: "asc" },
  });
  const placementById = new Map(placements.map((placement) => [placement.id, placement]));
  const placementByClipId = new Map(placements.map((placement) => [placement.clipId, placement]));
  const clipByPlacementId = new Map<string, { clip: TimelineClip; binding: SourceStoryTimelineBinding }>();

  for (const clip of input.incomingTimeline.clips) {
    const binding = bindingFromClip(clip);
    const knownClipPlacement = placementByClipId.get(clip.id);
    if (!binding) {
      if (knownClipPlacement || clip.generatedFrom === SOURCE_STORY_GENERATOR) {
        throw new SourceStoryTimelineReconciliationError(
          "The editor removed provenance from a Source Story clip. Delete the clip to withdraw it, or restore its exact binding.",
          "SOURCE_STORY_BINDING_REMOVED",
        );
      }
      continue;
    }
    const placement = placementById.get(binding.placementId);
    if (!placement) {
      throw new SourceStoryTimelineReconciliationError(
        "This Episode contains an unknown Source Story placement. Refresh before saving.",
        "SOURCE_STORY_PLACEMENT_UNKNOWN",
      );
    }
    if (clipByPlacementId.has(placement.id)) {
      throw new SourceStoryTimelineReconciliationError(
        "A Source Story placement was duplicated. Promote the Story card again to create a distinct, auditable placement.",
        "SOURCE_STORY_PLACEMENT_DUPLICATED",
      );
    }
    validateBoundClip(placement, clip, binding);
    clipByPlacementId.set(placement.id, { clip, binding });
  }

  const beforeFingerprint = timelineFingerprint(input.previousTimeline);
  const afterFingerprint = timelineFingerprint(input.incomingTimeline);
  const summary: SourceStoryTimelineReconciliationSummary = {
    inspected: placements.length,
    unchanged: 0,
    reconciled: 0,
    withdrawn: 0,
    restored: 0,
  };

  for (const placement of placements) {
    const matched = clipByPlacementId.get(placement.id);
    let operation: ReconciliationOperation | null = null;
    if (!matched) {
      if (placement.status === "withdrawn") {
        summary.unchanged += 1;
        continue;
      }
      operation = "editor-withdraw";
    } else if (placement.status === "withdrawn") {
      operation = "editor-restore";
    } else if (
      placement.trackId !== matched.clip.trackId ||
      !close(placement.episodeStartSeconds, matched.clip.startIn) ||
      !close(placement.durationSeconds, matched.clip.duration) ||
      stableJson(placement.timelineClipJson) !== stableJson(matched.clip)
    ) {
      operation = "timeline-reconcile";
    } else {
      summary.unchanged += 1;
      continue;
    }

    const previousRevision = placement.revision;
    const revision = previousRevision + 1;
    const clip = matched?.clip ?? null;
    const nextStatus = operation === "editor-withdraw" ? "withdrawn" : "active";
    const normalizedRequestId = input.clientRequestId || `timeline:${revision}:${afterFingerprint.slice(0, 24)}`;
    const request = {
      schema: "quipsly-source-story-timeline-reconciliation-v1",
      placementId: placement.id,
      operation,
      previousRevision,
      revision,
      beforeFingerprint,
      afterFingerprint,
      clip,
    };
    await input.prisma.studioStoryTimelinePlacement.update({
      where: { id: placement.id },
      data: {
        status: nextStatus,
        revision,
        trackId: clip?.trackId ?? placement.trackId,
        episodeStartSeconds: clip?.startIn ?? placement.episodeStartSeconds,
        durationSeconds: clip?.duration ?? placement.durationSeconds,
        timelineFingerprintBeforeSha256: beforeFingerprint,
        timelineFingerprintAfterSha256: afterFingerprint,
        timelineClipJson: prismaJson(clip ?? placement.timelineClipJson),
        updatedByUserId: input.actorUserId,
        withdrawnAt: nextStatus === "withdrawn" ? input.occurredAt : null,
        operations: {
          create: {
            revision,
            previousRevision,
            operation,
            actorUserId: input.actorUserId,
            clientRequestId: normalizedRequestId,
            requestSha256: sha256(request),
            snapshotJson: prismaJson({
              schema: "quipsly-source-story-timeline-reconciliation-receipt-v1",
              operation,
              beforeFingerprint,
              afterFingerprint,
              previousClip: placement.timelineClipJson,
              nextClip: clip,
              sourceMediaUnchanged: true,
              occurredAt: input.occurredAt.toISOString(),
            }),
          },
        },
      },
    });
    if (operation === "editor-withdraw") summary.withdrawn += 1;
    if (operation === "editor-restore") summary.restored += 1;
    if (operation === "timeline-reconcile") summary.reconciled += 1;
  }
  return summary;
}
